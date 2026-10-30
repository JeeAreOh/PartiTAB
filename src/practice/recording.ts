/**
 * Gravação do que o aluno toca: eventos com o momento (ms desde o início) e a
 * posição da partitura, para ouvir de novo com o cursor acompanhando e para
 * exportar como arquivo MIDI.
 */

export type RecordedEvent =
  | { t: number; type: "on"; key: number; velocity: number; tick: number | null }
  | { t: number; type: "off"; key: number }
  | { t: number; type: "pedal"; down: boolean };

export interface Recording {
  events: RecordedEvent[];
  durationMs: number;
}

/** Fecha notas e pedal que ficaram abertos no fim da gravação. */
export function closeRecording(events: RecordedEvent[], endMs: number): Recording {
  const held = new Set<number>();
  let pedal = false;
  for (const e of events) {
    if (e.type === "on") held.add(e.key);
    else if (e.type === "off") held.delete(e.key);
    else pedal = e.down;
  }
  const end = Math.max(endMs, events[events.length - 1]?.t ?? 0);
  const closing: RecordedEvent[] = [...held].map((key) => ({ t: end, type: "off", key }));
  if (pedal) closing.push({ t: end, type: "pedal", down: false });
  return { events: [...events, ...closing], durationMs: end };
}

/** Pulsos por semínima e andamento do arquivo exportado (120 bpm: 1 pulso ≈ 1 ms). */
export const PPQ = 480;
const US_PER_QUARTER = 500_000;

export const msToTicks = (ms: number) => Math.round((ms * PPQ * 1000) / US_PER_QUARTER);

/** Número em quantidade variável (VLQ) do MIDI. */
export function vlq(value: number): number[] {
  let v = Math.max(0, Math.floor(value));
  const bytes = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0) & 0x7f);
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];

/** Arquivo MIDI (formato 0, canal 1) com a gravação. */
export function toMidiFile(rec: Recording, name = "PartiTAB"): Uint8Array {
  const track: number[] = [];
  const title = ascii(name.normalize("NFD").replace(/[̀-ͯ]/g, "")).slice(0, 120);
  track.push(0x00, 0xff, 0x03, ...vlq(title.length), ...title);
  track.push(
    0x00,
    0xff,
    0x51,
    0x03,
    (US_PER_QUARTER >> 16) & 0xff,
    (US_PER_QUARTER >> 8) & 0xff,
    US_PER_QUARTER & 0xff,
  );
  // Piano acústico.
  track.push(0x00, 0xc0, 0x00);
  let last = 0;
  const sorted = [...rec.events].sort((a, b) => a.t - b.t);
  for (const e of sorted) {
    const tick = msToTicks(e.t);
    track.push(...vlq(tick - last));
    last = tick;
    if (e.type === "on") track.push(0x90, e.key & 0x7f, Math.max(1, e.velocity & 0x7f));
    else if (e.type === "off") track.push(0x80, e.key & 0x7f, 0x40);
    else track.push(0xb0, 64, e.down ? 127 : 0);
  }
  track.push(0x00, 0xff, 0x2f, 0x00);
  return new Uint8Array([
    ...ascii("MThd"),
    ...u32(6),
    ...u16(0),
    ...u16(1),
    ...u16(PPQ),
    ...ascii("MTrk"),
    ...u32(track.length),
    ...track,
  ]);
}

export const noteCount = (rec: Recording) => rec.events.filter((e) => e.type === "on").length;
