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
  soundfont: string | null;
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
}

export const api = {
  getStatus: () => invoke<Status>("get_status"),
  listMidiInputs: () => invoke<string[]>("list_midi_inputs"),
  connectMidi: (port: string) => invoke<Status>("connect_midi", { port }),
  disconnectMidi: () => invoke<Status>("disconnect_midi"),
  loadSoundfont: (path: string) => invoke<Status>("load_soundfont", { path }),
  playNote: (key: number, velocity: number) => invoke<void>("play_note", { key, velocity }),
  readFile: (path: string) =>
    invoke<ArrayBuffer>("read_file", { path }).then((b) => new Uint8Array(b)),
  openSearch: (url: string) => invoke<void>("open_search", { url }),
  onSearchDownload: (
    handler: (e: import("./search/Search").DownloadResult) => void,
  ): Promise<UnlistenFn> =>
    listen<import("./search/Search").DownloadResult>("search-download", (e) => handler(e.payload)),
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
  },
  onKey: (handler: (e: KeyEvent) => void): Promise<UnlistenFn> =>
    listen<KeyEvent>("key", (e) => handler(e.payload)),
};
