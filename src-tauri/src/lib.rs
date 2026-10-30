mod audio;
mod covers;
mod library;
mod midi;
mod search;
mod updates;

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

use audio::{AudioCommand, AudioEngine, AudioInfo};
use library::{Attempt, CollectionResult, ErrorMap, Library, ReadingCard, Song, SongPatch};
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

/// Lê um arquivo local (partitura ou SoundFont) para a interface. Devolve os
/// bytes crus, sem passar por JSON.
#[tauri::command]
async fn read_file(path: String) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || std::fs::read(&path))
        .await
        .map_err(|e| e.to_string())?
        .map(tauri::ipc::Response::new)
        .map_err(|e| format!("Não foi possível ler o arquivo: {e}"))
}

/// Grava bytes num arquivo escolhido pelo usuário (ex.: exportar arranjo).
#[tauri::command]
async fn write_file(path: String, data: Vec<u8>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || std::fs::write(&path, data))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("Não foi possível salvar o arquivo: {e}"))
}

// ------------------------------------------------------------- biblioteca

/// A biblioteca abre na inicialização; se falhar, os comandos devolvem o erro.
pub(crate) struct LibraryState(Result<Library, String>);

impl LibraryState {
    pub(crate) fn get(&self) -> Result<&Library, String> {
        self.0
            .as_ref()
            .map_err(|e| format!("Biblioteca indisponível: {e}"))
    }
}

#[tauri::command]
fn library_list(lib: State<LibraryState>) -> Result<Vec<Song>, String> {
    lib.get()?.list()
}

#[tauri::command]
async fn library_import(
    app: AppHandle,
    path: String,
    title: Option<String>,
    artist: Option<String>,
) -> Result<Song, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<LibraryState>().get()?.import(
            std::path::Path::new(&path),
            title.as_deref(),
            artist.as_deref(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn library_import_bytes(
    lib: State<LibraryState>,
    file_name: String,
    data: Vec<u8>,
    title: Option<String>,
    artist: Option<String>,
) -> Result<Song, String> {
    lib.get()?
        .import_bytes(&file_name, &data, title.as_deref(), artist.as_deref())
}

#[tauri::command]
fn library_update(lib: State<LibraryState>, id: i64, patch: SongPatch) -> Result<Song, String> {
    lib.get()?.update(id, patch)
}

#[tauri::command]
fn library_set_auto_difficulty(
    lib: State<LibraryState>,
    id: i64,
    difficulty: u8,
) -> Result<Song, String> {
    lib.get()?.set_auto_difficulty(id, difficulty)
}

#[tauri::command]
fn library_delete(lib: State<LibraryState>, id: i64) -> Result<(), String> {
    lib.get()?.delete(id)
}

#[tauri::command]
fn library_record_attempt(lib: State<LibraryState>, attempt: Attempt) -> Result<Song, String> {
    lib.get()?.record_attempt(&attempt)
}

#[tauri::command]
fn library_attempts(lib: State<LibraryState>, song_id: i64) -> Result<Vec<Attempt>, String> {
    lib.get()?.attempts(song_id)
}

// ---------------------------------------------------------- atualizações

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateStatus {
    version: String,
    configured: bool,
    repo: &'static str,
}

fn data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
fn update_status(app: AppHandle) -> Result<UpdateStatus, String> {
    Ok(UpdateStatus {
        version: app.package_info().version.to_string(),
        configured: !updates::load_token(&data_dir(&app)?).is_empty(),
        repo: updates::REPO,
    })
}

#[tauri::command]
fn update_set_token(app: AppHandle, token: String) -> Result<(), String> {
    updates::save_token(&data_dir(&app)?, &token)
}

#[tauri::command]
async fn update_check(app: AppHandle) -> Result<updates::UpdateInfo, String> {
    let token = updates::load_token(&data_dir(&app)?);
    let current = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || updates::check(&token, &current))
        .await
        .map_err(|e| e.to_string())?
}

/// Baixa o instalador da nova versão, abre e fecha o app (o instalador
/// substitui os arquivos; a biblioteca e os ajustes ficam).
#[tauri::command]
async fn update_install(app: AppHandle, asset: updates::Asset) -> Result<(), String> {
    let token = updates::load_token(&data_dir(&app)?);
    let dir = app
        .path()
        .temp_dir()
        .map_err(|e| e.to_string())?
        .join("PartiTAB-atualizacao");
    let installer =
        tauri::async_runtime::spawn_blocking(move || updates::download(&token, &asset, &dir))
            .await
            .map_err(|e| e.to_string())??;

    #[cfg(windows)]
    {
        let is_msi = installer
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("msi"));
        let spawned = if is_msi {
            std::process::Command::new("msiexec")
                .arg("/i")
                .arg(&installer)
                .spawn()
        } else {
            std::process::Command::new(&installer).spawn()
        };
        spawned.map_err(|e| format!("Não foi possível abrir o instalador: {e}"))?;
        app.exit(0);
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err(format!(
            "A instalação automática é só para Windows. O instalador foi salvo em {}",
            installer.display()
        ))
    }
}

// ----------------------------------------------------------------- capas

#[tauri::command]
async fn library_find_covers(
    artist: String,
    title: String,
) -> Result<Vec<covers::CoverCandidate>, String> {
    tauri::async_runtime::spawn_blocking(move || covers::search(&artist, &title))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn library_cover_from_url(app: AppHandle, id: i64, url: String) -> Result<Song, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (data, ext) = covers::download(&url)?;
        app.state::<LibraryState>().get()?.set_cover(id, &data, ext)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn library_cover_from_file(
    lib: State<LibraryState>,
    id: i64,
    path: String,
) -> Result<Song, String> {
    lib.get()?
        .set_cover_from_file(id, std::path::Path::new(&path))
}

#[tauri::command]
fn library_remove_cover(lib: State<LibraryState>, id: i64) -> Result<Song, String> {
    lib.get()?.remove_cover(id)
}

/// Coleções de partituras que vêm com o app (pasta resources/collections).
const COLLECTIONS: &[&str] = &["musetrainer"];

#[tauri::command]
async fn library_import_collection(
    app: AppHandle,
    name: String,
) -> Result<CollectionResult, String> {
    if !COLLECTIONS.contains(&name.as_str()) {
        return Err(format!("Coleção desconhecida: {name}"));
    }
    let dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("collections")
        .join(&name);
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<LibraryState>().get()?.import_collection(&dir)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn library_error_map(
    lib: State<LibraryState>,
    song_id: i64,
    last: i64,
) -> Result<ErrorMap, String> {
    lib.get()?.error_map(song_id, last)
}

#[tauri::command]
fn reading_cards(lib: State<LibraryState>) -> Result<Vec<ReadingCard>, String> {
    lib.get()?.reading_cards()
}

#[tauri::command]
fn reading_save(lib: State<LibraryState>, card: ReadingCard) -> Result<(), String> {
    lib.get()?.save_reading_card(&card)
}

/// Abre o navegador de busca de partituras no endereço dado.
#[tauri::command]
fn open_search(app: AppHandle, url: String) -> Result<(), String> {
    search::open(&app, &url)
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
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .setup(|app| {
            let library = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())
                .and_then(|dir| Library::open(&dir));
            app.manage(LibraryState(library));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            list_midi_inputs,
            connect_midi,
            disconnect_midi,
            load_soundfont,
            play_note,
            read_file,
            write_file,
            library_list,
            library_import,
            library_import_bytes,
            library_update,
            library_set_auto_difficulty,
            library_delete,
            library_record_attempt,
            library_attempts,
            open_search,
            library_error_map,
            library_import_collection,
            library_find_covers,
            update_status,
            update_set_token,
            update_check,
            update_install,
            library_cover_from_url,
            library_cover_from_file,
            library_remove_cover,
            reading_cards,
            reading_save,
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
