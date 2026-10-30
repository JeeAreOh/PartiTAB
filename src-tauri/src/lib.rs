mod audio;
mod backup;
mod covers;
mod library;
mod midi;
mod search;
mod sounds;
mod updates;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

use audio::{AudioCommand, AudioEngine, AudioInfo};
use library::{Attempt, CollectionResult, ErrorMap, Library, ReadingCard, Song, SongPatch};
use midi::{MidiSession, SynthMessage};
use sounds::{CatalogItem, PresetInfo, SoundSettings, VelocityCurve};

struct AppState {
    audio: Result<AudioEngine, String>,
    midi: Mutex<Option<MidiSession>>,
    soundfont: Mutex<Option<String>>,
    /// O SoundFont carregado é o que acompanha o app.
    builtin: AtomicBool,
    presets: Mutex<Vec<PresetInfo>>,
    sound: Mutex<SoundSettings>,
    /// Curva de toque, lida a cada nota que chega do teclado.
    curve: Arc<AtomicU8>,
    /// O som sai pelo teclado: ele toca as próprias notas (Local Control On)
    /// e recebe a banda e o metrônomo pela saída MIDI.
    keyboard_sound: Arc<AtomicBool>,
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
    /// O teclado conectado tem saída MIDI (dá para mandar som para ele).
    midi_output: bool,
    keyboard_sound: bool,
    soundfont: Option<String>,
    soundfont_builtin: bool,
    presets: Vec<PresetInfo>,
    sound: SoundSettings,
}

#[tauri::command]
fn get_status(state: State<AppState>) -> Status {
    let midi = state.midi.lock().unwrap();
    Status {
        audio: state.audio.as_ref().ok().map(|a| a.info.clone()),
        audio_error: state.audio.as_ref().err().cloned(),
        midi_port: midi.as_ref().map(|s| s.port_name.clone()),
        local_control_off: midi.as_ref().is_some_and(MidiSession::local_control_off),
        midi_output: midi.as_ref().is_some_and(MidiSession::has_output),
        keyboard_sound: state.keyboard_sound.load(Ordering::Relaxed),
        soundfont: state.soundfont.lock().unwrap().clone(),
        soundfont_builtin: state.builtin.load(Ordering::Relaxed),
        presets: state.presets.lock().unwrap().clone(),
        sound: *state.sound.lock().unwrap(),
    }
}

#[tauri::command]
fn list_midi_inputs() -> Result<Vec<String>, String> {
    midi::list_inputs()
}

#[tauri::command]
fn connect_midi(app: AppHandle, state: State<AppState>, port: String) -> Result<Status, String> {
    let synth = state.audio()?.sender();
    let curve = state.curve.clone();
    let keyboard_sound = state.keyboard_sound.clone();
    let mut current = state.midi.lock().unwrap();
    // Fecha a conexão anterior primeiro (religa o som interno daquele teclado).
    current.take();
    let on_keyboard = keyboard_sound.load(Ordering::Relaxed);
    let session = MidiSession::open(&port, on_keyboard, move |msg| {
        let (to_synth, to_ui) = midi::translate(msg);
        // O som sai antes de qualquer trabalho da interface. Com o som no
        // teclado, ele mesmo toca as notas.
        if let Some(mut m) = to_synth.filter(|_| !keyboard_sound.load(Ordering::Relaxed)) {
            if m.command == 0x90 {
                m.data2 = VelocityCurve::from_u8(curve.load(Ordering::Relaxed)).apply(m.data2);
            }
            let _ = synth.send(AudioCommand::Midi(m));
        }
        if let Some(e) = to_ui {
            let _ = app.emit("key", e);
        }
    })?;
    // Sem saída MIDI não há como o som ir para o teclado: volta ao computador.
    if !session.has_output() {
        state.keyboard_sound.store(false, Ordering::Relaxed);
    }
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

async fn load_soundfont_at(app: AppHandle, path: PathBuf, builtin: bool) -> Result<Status, String> {
    let handle = app.clone();
    let loaded = path.clone();
    let presets = tauri::async_runtime::spawn_blocking(move || {
        handle.state::<AppState>().audio()?.load_soundfont(&loaded)
    })
    .await
    .map_err(|e| e.to_string())??;

    let state = app.state::<AppState>();
    *state.soundfont.lock().unwrap() = Some(path.to_string_lossy().into_owned());
    state.builtin.store(builtin, Ordering::Relaxed);
    *state.presets.lock().unwrap() = presets;
    Ok(get_status(state))
}

#[tauri::command]
async fn load_soundfont(app: AppHandle, path: String) -> Result<Status, String> {
    load_soundfont_at(app, PathBuf::from(path), false).await
}

/// Carrega o SoundFont que acompanha o app (som padrão, sem configurar nada).
#[tauri::command]
async fn load_default_soundfont(app: AppHandle) -> Result<Status, String> {
    let path = app
        .path()
        .resolve(
            sounds::DEFAULT_SOUNDFONT,
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|e| e.to_string())?;
    load_soundfont_at(app, path, true).await
}

/// Timbre, volume, reverb e curva de toque do piano.
#[tauri::command]
fn set_sound(state: State<AppState>, sound: SoundSettings) -> Result<Status, String> {
    let sound = sound.clamped();
    state.audio()?.set_sound(sound);
    state.curve.store(sound.curve.to_u8(), Ordering::Relaxed);
    *state.sound.lock().unwrap() = sound;
    Ok(get_status(state))
}

fn soundfont_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join(sounds::DOWNLOAD_DIR))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn sound_catalog(app: AppHandle) -> Result<Vec<CatalogItem>, String> {
    Ok(sounds::catalog(&soundfont_dir(&app)?))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    id: String,
    done: u64,
    total: u64,
}

/// Baixa um SoundFont do catálogo (com progresso no evento
/// "sound-download") e devolve o caminho do arquivo.
#[tauri::command]
async fn sound_download(app: AppHandle, id: String) -> Result<String, String> {
    let dir = soundfont_dir(&app)?;
    let total = sounds::entry(&id)?.size;
    tauri::async_runtime::spawn_blocking(move || {
        let mut last = 0u64;
        let path = sounds::download(&id, &dir, |done| {
            // Um aviso a cada ~1% basta para a barra de progresso.
            if done - last >= total / 100 || done == total {
                last = done;
                let _ = app.emit(
                    "sound-download",
                    DownloadProgress {
                        id: id.clone(),
                        done,
                        total,
                    },
                );
            }
        })?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn sound_remove(app: AppHandle, id: String) -> Result<(), String> {
    sounds::remove(&id, &soundfont_dir(&app)?)
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

/// Salva o backup da biblioteca (e das preferências da interface) em `path`.
#[tauri::command]
async fn backup_export(
    app: AppHandle,
    path: String,
    settings: String,
) -> Result<backup::BackupSummary, String> {
    let version = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let lib = app.state::<LibraryState>();
        backup::export(lib.get()?, std::path::Path::new(&path), &settings, &version)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Restaura um backup; devolve as preferências da interface que ele guardava.
#[tauri::command]
async fn backup_import(app: AppHandle, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let lib = app.state::<LibraryState>();
        backup::import(lib.get()?, std::path::Path::new(&path))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn library_all_attempts(lib: State<LibraryState>, since: i64) -> Result<Vec<Attempt>, String> {
    lib.get()?.all_attempts(since)
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

/// Baixa um link direto de partitura (colado na aba Buscar) para a biblioteca.
#[tauri::command]
async fn search_import_url(app: AppHandle, url: String) -> Result<Song, String> {
    tauri::async_runtime::spawn_blocking(move || search::import_url(&app, &url))
        .await
        .map_err(|e| e.to_string())?
}

/// Abre o navegador de busca de partituras no endereço dado.
///
/// Precisa ser `async`: no Windows, criar uma janela dentro de um comando
/// síncrono trava o app (o comando roda na thread principal, que a criação
/// da janela também precisa).
#[tauri::command]
async fn open_search(app: AppHandle, url: String) -> Result<(), String> {
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
    if state.keyboard_sound.load(Ordering::Relaxed)
        && let Some(session) = state.midi.lock().unwrap().as_mut()
        && session.has_output()
    {
        session.send(&[message.command, message.data1, message.data2]);
        return Ok(());
    }
    state.audio()?.send(message);
    Ok(())
}

/// Liga ou desliga o som pelo teclado.
#[tauri::command]
fn set_keyboard_sound(state: State<AppState>, on: bool) -> Status {
    if let Some(session) = state.midi.lock().unwrap().as_mut() {
        // Sem saída MIDI, o som continua no computador.
        let on = on && session.has_output();
        state.keyboard_sound.store(on, Ordering::Relaxed);
        session.set_local_control(on);
    } else {
        // Vale quando o teclado conectar.
        state.keyboard_sound.store(on, Ordering::Relaxed);
    }
    // Notas que o computador ainda tocava param.
    if on && let Ok(audio) = state.audio() {
        audio.send(SynthMessage {
            command: 0xB0,
            data1: 123,
            data2: 0,
        });
    }
    get_status(state)
}

/// Mensagens MIDI para o teclado (banda e metrônomo, com o som no teclado).
#[tauri::command]
fn midi_out(state: State<AppState>, data: Vec<u8>) {
    if !state.keyboard_sound.load(Ordering::Relaxed) {
        return;
    }
    if let Some(session) = state.midi.lock().unwrap().as_mut() {
        session.send(&data);
    }
}

/// Pedal de sustain (ao ouvir uma gravação).
#[tauri::command]
fn play_pedal(state: State<AppState>, down: bool) -> Result<(), String> {
    state.audio()?.send(SynthMessage {
        command: 0xB0,
        data1: 64,
        data2: if down { 127 } else { 0 },
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        audio: AudioEngine::start(),
        midi: Mutex::new(None),
        soundfont: Mutex::new(None),
        builtin: AtomicBool::new(false),
        presets: Mutex::new(Vec::new()),
        sound: Mutex::new(SoundSettings::default()),
        curve: Arc::new(AtomicU8::new(VelocityCurve::Normal.to_u8())),
        keyboard_sound: Arc::new(AtomicBool::new(false)),
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
            load_default_soundfont,
            set_sound,
            sound_catalog,
            sound_download,
            sound_remove,
            play_note,
            set_keyboard_sound,
            midi_out,
            play_pedal,
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
            library_all_attempts,
            backup_export,
            backup_import,
            open_search,
            search_import_url,
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
