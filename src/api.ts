import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface AudioInfo {
  device: string;
  sampleRate: number;
  channels: number;
  bufferFrames: number | null;
}

export interface Status {
  audio: AudioInfo | null;
  audioError: string | null;
  midiPort: string | null;
  localControlOff: boolean;
  /** O teclado conectado tem saída MIDI (dá para mandar som para ele). */
  midiOutput: boolean;
  /** O som sai pelo teclado (ele toca as próprias notas e a banda). */
  keyboardSound: boolean;
  soundfont: string | null;
  /** O SoundFont carregado é o que acompanha o app. */
  soundfontBuiltin: boolean;
  /** Instrumentos do SoundFont carregado. */
  presets: PresetInfo[];
  sound: SoundSettings;
}

export interface PresetInfo {
  bank: number;
  patch: number;
  name: string;
}

export type VelocityCurve = "light" | "normal" | "heavy" | "fixed";

export interface SoundSettings {
  bank: number;
  patch: number;
  /** 0–100. */
  volume: number;
  /** 0–127. */
  reverb: number;
  curve: VelocityCurve;
}

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  license: string;
  size: number;
  /** Caminho do arquivo, quando já foi baixado. */
  path: string | null;
}

export interface SoundDownload {
  id: string;
  done: number;
  total: number;
}

export type KeyEvent =
  | { type: "noteOn"; key: number; velocity: number }
  | { type: "noteOff"; key: number }
  | { type: "sustain"; down: boolean };

export interface Song {
  id: number;
  title: string;
  artist: string;
  style: string;
  /** 1 (fácil) a 5 (difícil). */
  difficulty: number | null;
  difficultyManual: boolean;
  favorite: boolean;
  fileName: string;
  path: string;
  /** JSON com as preferências da música (ver SongPrefs). */
  prefs: string;
  addedAt: number;
  plays: number;
  lastPlayedAt: number | null;
  bestScore: number | null;
  lastScore: number | null;
  /** Caminho da imagem da capa; null = capa gerada. */
  cover: string | null;
}

export interface CoverCandidate {
  url: string;
  thumb: string;
  album: string;
  artist: string;
  title: string;
}

export interface SongPatch {
  title?: string;
  artist?: string;
  style?: string;
  /** null volta para a dificuldade estimada. */
  difficulty?: number | null;
  favorite?: boolean;
  prefs?: string;
}

export interface Attempt {
  id?: number;
  songId: number;
  playedAt?: number;
  mode: string;
  hands: string;
  track: string;
  level: string;
  speed: number;
  score: number;
  accuracy: number;
  hit: number;
  early: number;
  late: number;
  wrong: number;
  miss: number;
  completed: boolean;
  /** Tempo da prática (ms); 0 nas gravadas antes de existir a medida. */
  durationMs?: number;
  /** Detalhe por compasso e por nota (só ao gravar). */
  bars?: BarStat[];
  keys?: { key: number; notes: number; errors: number }[];
}

export interface BarStat {
  bar: number;
  notes: number;
  errors: number;
  timing: number;
}

export interface ErrorMap {
  attempts: number;
  bars: BarStat[];
  keys: { key: number; notes: number; errors: number }[];
}

export interface UpdateStatus {
  version: string;
  configured: boolean;
  repo: string;
}

export interface UpdateAsset {
  id: number;
  name: string;
  size: number;
}

export interface UpdateInfo {
  current: string;
  latest: string;
  available: boolean;
  title: string;
  notes: string;
  publishedAt: string | null;
  url: string;
  installer: UpdateAsset | null;
}

export const api = {
  getStatus: () => invoke<Status>("get_status"),
  listMidiInputs: () => invoke<string[]>("list_midi_inputs"),
  connectMidi: (port: string) => invoke<Status>("connect_midi", { port }),
  disconnectMidi: () => invoke<Status>("disconnect_midi"),
  loadSoundfont: (path: string) => invoke<Status>("load_soundfont", { path }),
  loadDefaultSoundfont: () => invoke<Status>("load_default_soundfont"),
  setSound: (sound: SoundSettings) => invoke<Status>("set_sound", { sound }),
  sounds: {
    catalog: () => invoke<CatalogItem[]>("sound_catalog"),
    download: (id: string) => invoke<string>("sound_download", { id }),
    remove: (id: string) => invoke<void>("sound_remove", { id }),
    onProgress: (handler: (e: SoundDownload) => void): Promise<UnlistenFn> =>
      listen<SoundDownload>("sound-download", (e) => handler(e.payload)),
  },
  playNote: (key: number, velocity: number) => invoke<void>("play_note", { key, velocity }),
  playPedal: (down: boolean) => invoke<void>("play_pedal", { down }),
  setKeyboardSound: (on: boolean) => invoke<Status>("set_keyboard_sound", { on }),
  midiOut: (data: number[]) => invoke<void>("midi_out", { data }),
  readFile: (path: string) =>
    invoke<ArrayBuffer>("read_file", { path }).then((b) => new Uint8Array(b)),
  updates: {
    status: () => invoke<UpdateStatus>("update_status"),
    setToken: (token: string) => invoke<void>("update_set_token", { token }),
    check: () => invoke<UpdateInfo>("update_check"),
    install: (asset: UpdateAsset) => invoke<void>("update_install", { asset }),
  },
  backup: {
    export: (path: string, settings: string) =>
      invoke<{ files: number; bytes: number }>("backup_export", { path, settings }),
    /** Restaura e devolve o JSON das preferências guardadas no backup. */
    import: (path: string) => invoke<string>("backup_import", { path }),
  },
  openSearch: (url: string) => invoke<void>("open_search", { url }),
  onSearchDownload: (
    handler: (e: import("./search/Search").DownloadResult) => void,
  ): Promise<UnlistenFn> =>
    listen<import("./search/Search").DownloadResult>("search-download", (e) => handler(e.payload)),
  /** O que a janela de busca fez (janelas novas, downloads), para diagnóstico. */
  onSearchLog: (handler: (e: { kind: string; detail: string }) => void): Promise<UnlistenFn> =>
    listen<{ kind: string; detail: string }>("search-log", (e) => handler(e.payload)),
  /** Baixa um link direto de partitura e importa para a biblioteca. */
  searchImportUrl: (url: string) => invoke<Song>("search_import_url", { url }),
  writeFile: (path: string, data: Uint8Array) =>
    invoke<void>("write_file", { path, data: Array.from(data) }),
  library: {
    list: () => invoke<Song[]>("library_list"),
    import: (path: string, title?: string, artist?: string) =>
      invoke<Song>("library_import", { path, title, artist }),
    importBytes: (fileName: string, data: Uint8Array, title?: string, artist?: string) =>
      invoke<Song>("library_import_bytes", { fileName, data: Array.from(data), title, artist }),
    update: (id: number, patch: SongPatch) => invoke<Song>("library_update", { id, patch }),
    setAutoDifficulty: (id: number, difficulty: number) =>
      invoke<Song>("library_set_auto_difficulty", { id, difficulty }),
    remove: (id: number) => invoke<void>("library_delete", { id }),
    recordAttempt: (attempt: Attempt) => invoke<Song>("library_record_attempt", { attempt }),
    attempts: (songId: number) => invoke<Attempt[]>("library_attempts", { songId }),
    /** Todas as execuções desde `since` (ms), sem o detalhe por compasso. */
    allAttempts: (since: number) => invoke<Attempt[]>("library_all_attempts", { since }),
    findCovers: (artist: string, title: string) =>
      invoke<CoverCandidate[]>("library_find_covers", { artist, title }),
    coverFromUrl: (id: number, url: string) => invoke<Song>("library_cover_from_url", { id, url }),
    coverFromFile: (id: number, path: string) =>
      invoke<Song>("library_cover_from_file", { id, path }),
    removeCover: (id: number) => invoke<Song>("library_remove_cover", { id }),
    importCollection: (name: string) =>
      invoke<{ added: number; existing: number; failed: string[] }>("library_import_collection", {
        name,
      }),
    errorMap: (songId: number, last = 10) =>
      invoke<ErrorMap>("library_error_map", { songId, last }),
  },
  reading: {
    list: () => invoke<import("./reading/cards").CardState[]>("reading_cards"),
    save: (card: import("./reading/cards").CardState) => invoke<void>("reading_save", { card }),
  },
  onKey: (handler: (e: KeyEvent) => void): Promise<UnlistenFn> =>
    listen<KeyEvent>("key", (e) => handler(e.payload)),
};
