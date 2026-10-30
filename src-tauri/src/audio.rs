//! Saída de áudio: o RustySynth renderiza direto no callback do cpal.
//!
//! O callback de áudio não usa locks. Notas e trocas de SoundFont chegam por
//! um canal e são aplicadas no início de cada buffer.

use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::Arc;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{
    BufferSize, Device, FromSample, OutputCallbackInfo, SampleFormat, SizedSample, StreamConfig,
    SupportedBufferSize,
};
use rustysynth::{SoundFont, Synthesizer, SynthesizerSettings};
use serde::Serialize;

use crate::midi::SynthMessage;
use crate::sounds::{self, PresetInfo, SoundSettings};

/// Buffer pedido ao dispositivo, em frames. A 48 kHz são ~5 ms.
const PREFERRED_BUFFER_FRAMES: u32 = 256;
const MAX_POLYPHONY: usize = 128;

pub enum AudioCommand {
    Midi(SynthMessage),
    SetSynth(Box<Synthesizer>),
    /// Timbre, volume e reverb; valem também para os próximos SoundFonts.
    SetSound(SoundSettings),
}

/// Aplica timbre (banco + programa), reverb e volume no canal do piano.
fn apply_sound(synth: &mut Synthesizer, sound: &SoundSettings) {
    synth.process_midi_message(0, 0xB0, 0x00, sound.bank.into());
    synth.process_midi_message(0, 0xC0, sound.patch.into(), 0);
    synth.process_midi_message(0, 0xB0, 0x5B, sound.reverb.into());
    synth.set_master_volume(sound.master_volume());
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioInfo {
    pub device: String,
    pub sample_rate: u32,
    pub channels: u16,
    /// `None` quando o dispositivo escolhe o tamanho do buffer.
    pub buffer_frames: Option<u32>,
}

pub struct AudioEngine {
    pub info: AudioInfo,
    commands: Sender<AudioCommand>,
    // Ao descartar o motor, este canal fecha e a thread de áudio encerra o stream.
    _stop: Sender<()>,
}

impl AudioEngine {
    pub fn start() -> Result<Self, String> {
        let (commands, command_rx) = mpsc::channel();
        let (stop, stop_rx) = mpsc::channel::<()>();
        let (ready_tx, ready_rx) = mpsc::sync_channel(1);

        // O `Stream` do cpal não é `Send` em todas as plataformas, então vive
        // na própria thread até o motor ser descartado.
        thread::Builder::new()
            .name("partitab-audio".into())
            .spawn(move || match open_stream(command_rx) {
                Ok((stream, info)) => {
                    let _ = ready_tx.send(Ok(info));
                    let _ = stop_rx.recv();
                    drop(stream);
                }
                Err(e) => {
                    let _ = ready_tx.send(Err(e));
                }
            })
            .map_err(|e| e.to_string())?;

        let info = ready_rx
            .recv()
            .map_err(|_| "A thread de áudio terminou inesperadamente".to_string())??;
        Ok(Self {
            info,
            commands,
            _stop: stop,
        })
    }

    pub fn sender(&self) -> Sender<AudioCommand> {
        self.commands.clone()
    }

    pub fn send(&self, message: SynthMessage) {
        let _ = self.commands.send(AudioCommand::Midi(message));
    }

    /// Lê o SoundFont e troca o sintetizador. Bloqueia durante a leitura do
    /// arquivo, então deve rodar fora da thread principal. Devolve os
    /// instrumentos do arquivo.
    pub fn load_soundfont(&self, path: &Path) -> Result<Vec<PresetInfo>, String> {
        let file =
            File::open(path).map_err(|e| format!("Não foi possível abrir o arquivo: {e}"))?;
        let sound_font = SoundFont::new(&mut BufReader::new(file))
            .map_err(|e| format!("SoundFont inválido: {e:?}"))?;
        let presets = sounds::presets(&sound_font);
        let mut settings = SynthesizerSettings::new(self.info.sample_rate as i32);
        settings.maximum_polyphony = MAX_POLYPHONY;
        let synth = Synthesizer::new(&Arc::new(sound_font), &settings)
            .map_err(|e| format!("Erro ao criar o sintetizador: {e:?}"))?;
        self.commands
            .send(AudioCommand::SetSynth(Box::new(synth)))
            .map_err(|_| "A saída de áudio não está ativa".to_string())?;
        Ok(presets)
    }

    pub fn set_sound(&self, sound: SoundSettings) {
        let _ = self.commands.send(AudioCommand::SetSound(sound));
    }
}

fn open_stream(commands: Receiver<AudioCommand>) -> Result<(cpal::Stream, AudioInfo), String> {
    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or("Nenhum dispositivo de saída de áudio encontrado")?;
    let supported = device.default_output_config().map_err(|e| e.to_string())?;

    let buffer_size = match supported.buffer_size() {
        SupportedBufferSize::Range { min, max }
            if (*min..=*max).contains(&PREFERRED_BUFFER_FRAMES) =>
        {
            BufferSize::Fixed(PREFERRED_BUFFER_FRAMES)
        }
        _ => BufferSize::Default,
    };
    let config = StreamConfig {
        buffer_size,
        ..supported.config()
    };

    let stream = match supported.sample_format() {
        SampleFormat::F32 => build::<f32>(&device, config, commands),
        SampleFormat::I16 => build::<i16>(&device, config, commands),
        SampleFormat::U16 => build::<u16>(&device, config, commands),
        SampleFormat::I32 => build::<i32>(&device, config, commands),
        other => return Err(format!("Formato de áudio não suportado: {other}")),
    }?;
    stream.play().map_err(|e| e.to_string())?;

    let info = AudioInfo {
        device: device
            .description()
            .map(|d| d.to_string())
            .unwrap_or_else(|_| "Saída padrão".into()),
        sample_rate: config.sample_rate,
        channels: config.channels,
        buffer_frames: match buffer_size {
            BufferSize::Fixed(n) => Some(n),
            BufferSize::Default => None,
        },
    };
    Ok((stream, info))
}

fn build<T>(
    device: &Device,
    config: StreamConfig,
    commands: Receiver<AudioCommand>,
) -> Result<cpal::Stream, String>
where
    T: SizedSample + FromSample<f32>,
{
    let channels = config.channels as usize;
    let mut synth: Option<Box<Synthesizer>> = None;
    let mut sound = SoundSettings::default();
    let mut left = vec![0f32; 4096];
    let mut right = vec![0f32; 4096];

    let callback = move |data: &mut [T], _: &OutputCallbackInfo| {
        while let Ok(command) = commands.try_recv() {
            match command {
                AudioCommand::Midi(m) => {
                    if let Some(s) = synth.as_mut() {
                        s.process_midi_message(0, m.command.into(), m.data1.into(), m.data2.into());
                    }
                }
                AudioCommand::SetSynth(mut s) => {
                    apply_sound(&mut s, &sound);
                    synth = Some(s);
                }
                AudioCommand::SetSound(next) => {
                    sound = next;
                    if let Some(s) = synth.as_mut() {
                        apply_sound(s, &sound);
                    }
                }
            }
        }

        let frames = data.len() / channels;
        let Some(s) = synth.as_mut() else {
            data.fill(T::from_sample(0.0));
            return;
        };
        if left.len() < frames {
            left.resize(frames, 0.0);
            right.resize(frames, 0.0);
        }
        let (l, r) = (&mut left[..frames], &mut right[..frames]);
        s.render(l, r);

        for (i, frame) in data.chunks_mut(channels).enumerate() {
            match frame {
                [mono] => *mono = T::from_sample((l[i] + r[i]) * 0.5),
                [a, b, rest @ ..] => {
                    *a = T::from_sample(l[i]);
                    *b = T::from_sample(r[i]);
                    rest.fill(T::from_sample(0.0));
                }
                [] => {}
            }
        }
    };

    device
        .build_output_stream(config, callback, |e| eprintln!("Erro no áudio: {e}"), None)
        .map_err(|e| e.to_string())
}
