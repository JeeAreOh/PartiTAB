//! Entrada MIDI do teclado e tradução das mensagens para o sintetizador.

use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use serde::Serialize;

const CLIENT_NAME: &str = "PartiTAB";

/// Controlador MIDI "Local Control" (CC 122). Com valor 0 o teclado para de
/// tocar o próprio som e passa a funcionar só como controlador.
const CC_LOCAL_CONTROL: u8 = 122;
const CC_SUSTAIN: u8 = 64;
/// Controladores que o teclado manda ao trocar de voz (seleção de banco,
/// reverb e chorus). São ignorados: o timbre e o reverb vêm dos ajustes do app.
const CC_IGNORED: [u8; 4] = [0x00, 0x20, 0x5B, 0x5D];

/// Mensagem de canal pronta para `Synthesizer::process_midi_message`.
/// Tudo vai para o canal 0 (piano); o canal original do teclado é ignorado.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SynthMessage {
    pub command: u8,
    pub data1: u8,
    pub data2: u8,
}

impl SynthMessage {
    pub fn note_on(key: u8, velocity: u8) -> Self {
        Self {
            command: 0x90,
            data1: key & 0x7F,
            data2: velocity & 0x7F,
        }
    }

    pub fn note_off(key: u8) -> Self {
        Self {
            command: 0x80,
            data1: key & 0x7F,
            data2: 0,
        }
    }
}

/// Evento enviado à interface para desenhar o teclado virtual.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum KeyEvent {
    NoteOn { key: u8, velocity: u8 },
    NoteOff { key: u8 },
    Sustain { down: bool },
}

/// Traduz uma mensagem MIDI crua. Devolve a mensagem para o sintetizador (se
/// houver) e o evento para a interface (se houver).
///
/// Program Change e seleção de banco são ignorados de propósito: trocar o
/// timbre no teclado não deve trocar o piano do app. Mensagens de sistema
/// (clock, active sensing) também.
pub fn translate(msg: &[u8]) -> (Option<SynthMessage>, Option<KeyEvent>) {
    let (Some(&status), data1, data2) = (msg.first(), msg.get(1).copied(), msg.get(2).copied())
    else {
        return (None, None);
    };
    if !(0x80..0xF0).contains(&status) {
        return (None, None);
    }
    let (Some(d1), d2) = (data1, data2.unwrap_or(0)) else {
        return (None, None);
    };
    let (d1, d2) = (d1 & 0x7F, d2 & 0x7F);

    match status & 0xF0 {
        0x90 if d2 > 0 => (
            Some(SynthMessage::note_on(d1, d2)),
            Some(KeyEvent::NoteOn {
                key: d1,
                velocity: d2,
            }),
        ),
        // Note On com velocidade 0 equivale a Note Off.
        0x80 | 0x90 => (
            Some(SynthMessage::note_off(d1)),
            Some(KeyEvent::NoteOff { key: d1 }),
        ),
        0xB0 if CC_IGNORED.contains(&d1) => (None, None),
        0xB0 => {
            let synth = Some(SynthMessage {
                command: 0xB0,
                data1: d1,
                data2: d2,
            });
            let event = (d1 == CC_SUSTAIN).then_some(KeyEvent::Sustain { down: d2 >= 64 });
            (synth, event)
        }
        0xE0 => (
            Some(SynthMessage {
                command: 0xE0,
                data1: d1,
                data2: d2,
            }),
            None,
        ),
        _ => (None, None),
    }
}

/// Mensagem Local Control para o canal 1.
pub fn local_control(on: bool) -> [u8; 3] {
    [0xB0, CC_LOCAL_CONTROL, if on { 127 } else { 0 }]
}

pub fn list_inputs() -> Result<Vec<String>, String> {
    let input = MidiInput::new(CLIENT_NAME).map_err(|e| e.to_string())?;
    Ok(input
        .ports()
        .iter()
        .filter_map(|p| input.port_name(p).ok())
        .collect())
}

/// Divide bytes MIDI em mensagens (status + 1 ou 2 bytes de dados). Bytes
/// soltos sem status são descartados.
pub fn split_messages(bytes: &[u8]) -> Vec<&[u8]> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let status = bytes[i];
        if !(0x80..0xF0).contains(&status) {
            i += 1;
            continue;
        }
        let len = if matches!(status & 0xF0, 0xC0 | 0xD0) { 2 } else { 3 };
        if i + len > bytes.len() {
            break;
        }
        out.push(&bytes[i..i + len]);
        i += len;
    }
    out
}

/// Conexão ativa com o teclado. Ao ser descartada, religa o som interno
/// (Local Control On) para o teclado voltar a soar sozinho.
pub struct MidiSession {
    pub port_name: String,
    _input: MidiInputConnection<()>,
    output: Option<MidiOutputConnection>,
    local_off: bool,
}

impl MidiSession {
    /// Abre a porta de entrada e, se existir uma porta de saída com o mesmo
    /// nome, desliga o som interno do teclado (a não ser que o som deva sair
    /// pelo próprio teclado: `keyboard_sound`).
    pub fn open<F>(port_name: &str, keyboard_sound: bool, mut on_message: F) -> Result<Self, String>
    where
        F: FnMut(&[u8]) + Send + 'static,
    {
        let input = MidiInput::new(CLIENT_NAME).map_err(|e| e.to_string())?;
        let port = input
            .ports()
            .into_iter()
            .find(|p| input.port_name(p).as_deref() == Ok(port_name))
            .ok_or_else(|| format!("Porta MIDI \"{port_name}\" não encontrada"))?;
        let connection = input
            .connect(&port, "partitab-in", move |_, msg, _| on_message(msg), ())
            .map_err(|e| e.to_string())?;

        let mut session = Self {
            port_name: port_name.to_string(),
            _input: connection,
            output: open_output(port_name),
            local_off: false,
        };
        session.set_local_control(keyboard_sound);
        Ok(session)
    }

    pub fn local_control_off(&self) -> bool {
        self.local_off
    }

    pub fn has_output(&self) -> bool {
        self.output.is_some()
    }

    /// Liga (`on`) ou desliga o som interno do teclado.
    pub fn set_local_control(&mut self, on: bool) {
        if let Some(out) = self.output.as_mut() {
            self.local_off = out.send(&local_control(on)).is_ok() && !on;
        }
    }

    /// Envia mensagens MIDI ao teclado (a banda e o metrônomo, no modo "som do teclado").
    pub fn send(&mut self, bytes: &[u8]) {
        if let Some(out) = self.output.as_mut() {
            for message in split_messages(bytes) {
                let _ = out.send(message);
            }
        }
    }
}

impl Drop for MidiSession {
    fn drop(&mut self) {
        if let Some(out) = self.output.as_mut() {
            let _ = out.send(&local_control(true));
        }
    }
}

fn open_output(port_name: &str) -> Option<MidiOutputConnection> {
    let output = MidiOutput::new(CLIENT_NAME).ok()?;
    let port = output
        .ports()
        .into_iter()
        .find(|p| output.port_name(p).as_deref() == Ok(port_name))?;
    output.connect(&port, "partitab-out").ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn note_on_on_any_channel_goes_to_channel_zero() {
        let (synth, event) = translate(&[0x93, 60, 100]);
        assert_eq!(
            synth,
            Some(SynthMessage {
                command: 0x90,
                data1: 60,
                data2: 100
            })
        );
        assert_eq!(
            event,
            Some(KeyEvent::NoteOn {
                key: 60,
                velocity: 100
            })
        );
    }

    #[test]
    fn note_on_with_zero_velocity_is_note_off() {
        let (synth, event) = translate(&[0x90, 60, 0]);
        assert_eq!(synth, Some(SynthMessage::note_off(60)));
        assert_eq!(event, Some(KeyEvent::NoteOff { key: 60 }));
    }

    #[test]
    fn sustain_pedal_is_forwarded_and_reported() {
        assert_eq!(
            translate(&[0xB0, 64, 127]).1,
            Some(KeyEvent::Sustain { down: true })
        );
        assert_eq!(
            translate(&[0xB0, 64, 0]).1,
            Some(KeyEvent::Sustain { down: false })
        );
        assert_eq!(translate(&[0xB0, 64, 0]).0.map(|m| m.data1), Some(64));
    }

    #[test]
    fn other_controllers_reach_synth_without_ui_event() {
        let (synth, event) = translate(&[0xB0, 7, 90]);
        assert!(synth.is_some());
        assert_eq!(event, None);
    }

    #[test]
    fn bank_select_and_effect_sends_from_the_keyboard_are_ignored() {
        for cc in [0x00, 0x20, 0x5B, 0x5D] {
            assert_eq!(translate(&[0xB0, cc, 10]), (None, None));
        }
        assert!(translate(&[0xB0, 0x07, 100]).0.is_some());
    }

    #[test]
    fn program_change_and_system_messages_are_ignored() {
        assert_eq!(translate(&[0xC0, 5]), (None, None));
        assert_eq!(translate(&[0xFE]), (None, None));
        assert_eq!(translate(&[0xF8]), (None, None));
        assert_eq!(translate(&[]), (None, None));
        assert_eq!(translate(&[0x90]), (None, None));
    }

    #[test]
    fn splits_raw_bytes_into_messages() {
        let bytes = [0x91, 60, 100, 0xC2, 5, 0x00, 0xB3, 7, 90, 0x81, 60];
        assert_eq!(
            split_messages(&bytes),
            vec![&[0x91, 60, 100][..], &[0xC2, 5][..], &[0xB3, 7, 90][..]]
        );
        assert!(split_messages(&[0xF0, 1, 2]).is_empty());
    }

    #[test]
    fn local_control_messages() {
        assert_eq!(local_control(false), [0xB0, 122, 0]);
        assert_eq!(local_control(true), [0xB0, 122, 127]);
    }
}
