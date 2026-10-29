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

export const api = {
  getStatus: () => invoke<Status>("get_status"),
  listMidiInputs: () => invoke<string[]>("list_midi_inputs"),
  connectMidi: (port: string) => invoke<Status>("connect_midi", { port }),
  disconnectMidi: () => invoke<Status>("disconnect_midi"),
  loadSoundfont: (path: string) => invoke<Status>("load_soundfont", { path }),
  playNote: (key: number, velocity: number) =>
    invoke<void>("play_note", { key, velocity }),
  readFile: (path: string) =>
    invoke<ArrayBuffer>("read_file", { path }).then((b) => new Uint8Array(b)),
  onKey: (handler: (e: KeyEvent) => void): Promise<UnlistenFn> =>
    listen<KeyEvent>("key", (e) => handler(e.payload)),
};
