mod audio;
mod midi;

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

use audio::{AudioCommand, AudioEngine, AudioInfo};
use midi::{MidiSession, SynthMessage};

struct AppState {
    audio: Result<AudioEngine, String>,
    midi: Mutex<Option<MidiSession>>,
    soundfont: Mutex<Option<String>>,
}

impl AppState {
    fn audio(&self) -> Result<&AudioEngine, String> {
        self.audio.as_ref().map_err(Clone::clone)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    audio: Option<AudioInfo>,
    audio_error: Option<String>,
    midi_port: Option<String>,
    local_control_off: bool,
    soundfont: Option<String>,
}

#[tauri::command]
fn get_status(state: State<AppState>) -> Status {
    let midi = state.midi.lock().unwrap();
    Status {
        audio: state.audio.as_ref().ok().map(|a| a.info.clone()),
        audio_error: state.audio.as_ref().err().cloned(),
        midi_port: midi.as_ref().map(|s| s.port_name.clone()),
        local_control_off: midi.as_ref().is_some_and(MidiSession::local_control_off),
        soundfont: state.soundfont.lock().unwrap().clone(),
    }
}

#[tauri::command]
fn list_midi_inputs() -> Result<Vec<String>, String> {
    midi::list_inputs()
}

#[tauri::command]
fn connect_midi(app: AppHandle, state: State<AppState>, port: String) -> Result<Status, String> {
    let synth = state.audio()?.sender();
    let mut current = state.midi.lock().unwrap();
    // Fecha a conexão anterior primeiro (religa o som interno daquele teclado).
    current.take();
    let session = MidiSession::open(&port, move |msg| {
        let (to_synth, to_ui) = midi::translate(msg);
        // O som sai antes de qualquer trabalho da interface.
        if let Some(m) = to_synth {
            let _ = synth.send(AudioCommand::Midi(m));
        }
        if let Some(e) = to_ui {
            let _ = app.emit("key", e);
        }
    })?;
    *current = Some(session);
    drop(current);
    Ok(get_status(state))
}

#[tauri::command]
fn disconnect_midi(state: State<AppState>) -> Status {
    state.midi.lock().unwrap().take();
    // Notas presas ou pedal pressionado no momento do desligamento não ficam soando.
    if let Ok(audio) = state.audio() {
        audio.send(SynthMessage {
            command: 0xB0,
            data1: 64,
            data2: 0,
        });
        audio.send(SynthMessage {
            command: 0xB0,
            data1: 123,
            data2: 0,
        });
    }
    get_status(state)
}

#[tauri::command]
async fn load_soundfont(app: AppHandle, path: String) -> Result<Status, String> {
    let path = PathBuf::from(path);
    let handle = app.clone();
    let loaded = path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        handle.state::<AppState>().audio()?.load_soundfont(&loaded)
    })
    .await
    .map_err(|e| e.to_string())??;

    let state = app.state::<AppState>();
    *state.soundfont.lock().unwrap() = Some(path.to_string_lossy().into_owned());
    Ok(get_status(state))
}

/// Notas tocadas com o mouse no teclado virtual.
#[tauri::command]
fn play_note(state: State<AppState>, key: u8, velocity: u8) -> Result<(), String> {
    let message = if velocity > 0 {
        SynthMessage::note_on(key, velocity)
    } else {
        SynthMessage::note_off(key)
    };
    state.audio()?.send(message);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        audio: AudioEngine::start(),
        midi: Mutex::new(None),
        soundfont: Mutex::new(None),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_status,
            list_midi_inputs,
            connect_midi,
            disconnect_midi,
            load_soundfont,
            play_note,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                // Religa o som interno do teclado antes de sair.
                app.state::<AppState>().midi.lock().unwrap().take();
            }
        });
}
