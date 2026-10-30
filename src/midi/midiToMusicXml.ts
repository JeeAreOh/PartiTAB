// Converte um arquivo MIDI (.mid) em MusicXML. O alphaTab não importa MIDI;
// com a conversão, a biblioteca, a prática e a busca tratam o .mid como
// qualquer outra partitura.
//
// - Faixas: cada instrumento (faixa + canal) vira uma faixa da partitura, com
//   o timbre do arquivo. Os pianos se juntam numa faixa de piano com duas
//   pautas. Um arquivo só de piano (ou de um instrumento) vira piano.
// - Mãos: com duas faixas de piano, o nome decide ("right", "LH", "direita"…)
//   ou a mais aguda fica na direita; senão as notas se dividem pelo dó central.
// - Ritmo: cada tempo é alinhado à semicolcheia ou à tercina, o que errar
//   menos. Colcheias "swingadas" viram colcheias normais com a indicação Swing.
// - Marcadores do arquivo viram seções. A bateria (canal 10) fica de fora.

import {
  beatLength,
  DIVISIONS,
  measureAt,
  measuresUntil,
  writeMusicXml,
  type Measure,
  type XmlNote,
  type XmlPart,
} from "./musicxml";

export interface MidiNote {
  start: number; // em ticks
  end: number;
  pitch: number;
  velocity: number;
  track: number;
  channel: number;
}

export interface ParsedMidi {
  division: number;
  notes: MidiNote[];
  trackNames: string[];
  /** Programa de cada "faixa:canal" (primeiro program change). */
  programs: Map<string, number>;
  markers: { tick: number; text: string }[];
  title: string;
  tempos: { tick: number; bpm: number }[];
  timeSignatures: { tick: number; num: number; den: number }[];
  key: { fifths: number; minor: boolean } | null;
}

export const isMidi = (data: Uint8Array) =>
  data.length > 14 && data[0] === 0x4d && data[1] === 0x54 && data[2] === 0x68 && data[3] === 0x64;

/** Texto de um evento: UTF-8 se for válido, senão Latin-1. */
const text = (bytes: Uint8Array) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  }
};

export function parseMidi(data: Uint8Array): ParsedMidi {
  if (!isMidi(data)) throw new Error("Não é um arquivo MIDI");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const headerLength = view.getUint32(4);
  const tracks = view.getUint16(10);
  const division = view.getUint16(12);
  if (division & 0x8000) throw new Error("MIDI com tempo SMPTE não é suportado");

  const result: ParsedMidi = {
    division,
    notes: [],
    trackNames: [],
    programs: new Map(),
    markers: [],
    title: "",
    tempos: [],
    timeSignatures: [],
    key: null,
  };

  let pos = 8 + headerLength;
  for (let t = 0; t < tracks && pos + 8 <= data.length; t++) {
    const length = view.getUint32(pos + 4);
    const isTrack = view.getUint32(pos) === 0x4d54726b; // "MTrk"
    const end = Math.min(pos + 8 + length, data.length);
    let p = pos + 8;
    pos = end;
    result.trackNames[t] = "";
    if (!isTrack) continue;

    const vlq = () => {
      let value = 0;
      for (let i = 0; i < 4 && p < end; i++) {
        const b = data[p++];
        value = (value << 7) | (b & 0x7f);
        if (!(b & 0x80)) break;
      }
      return value;
    };

    const open = new Map<number, { start: number; velocity: number }[]>();
    let tick = 0;
    let status = 0;
    while (p < end) {
      tick += vlq();
      if (data[p] & 0x80) status = data[p++];
      else if (status < 0x80 || status >= 0xf0) break; // running status inválido
      const type = status & 0xf0;
      const channel = status & 0x0f;

      if (status === 0xff) {
        const meta = data[p++];
        const len = vlq();
        const body = data.subarray(p, p + len);
        p += len;
        if (meta === 0x03 && !result.trackNames[t]) result.trackNames[t] = text(body).trim();
        else if (meta === 0x06 && len) result.markers.push({ tick, text: text(body).trim() });
        else if (meta === 0x51 && len === 3) {
          const us = (body[0] << 16) | (body[1] << 8) | body[2];
          if (us > 0) result.tempos.push({ tick, bpm: 60_000_000 / us });
        } else if (meta === 0x58 && len >= 2) {
          result.timeSignatures.push({ tick, num: body[0], den: 2 ** body[1] });
        } else if (meta === 0x59 && len >= 2 && !result.key) {
          result.key = { fifths: (body[0] << 24) >> 24, minor: body[1] === 1 };
        }
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        p += vlq();
        continue;
      }

      const a = data[p++];
      const b = type === 0xc0 || type === 0xd0 ? 0 : data[p++];
      if (channel === 9) continue; // bateria
      const key = `${t}:${channel}`;
      if (type === 0xc0) {
        if (!result.programs.has(key)) result.programs.set(key, a);
        continue;
      }
      const id = (channel << 8) | a;
      if (type === 0x90 && b > 0) {
        const list = open.get(id) ?? [];
        list.push({ start: tick, velocity: b });
        open.set(id, list);
      } else if (type === 0x80 || (type === 0x90 && b === 0)) {
        const on = open.get(id)?.shift();
        if (on && tick > on.start) {
          result.notes.push({
            start: on.start,
            end: tick,
            pitch: a,
            velocity: on.velocity,
            track: t,
            channel,
          });
        }
      }
    }
    // Notas que nunca desligaram terminam no fim da faixa.
    for (const [id, list] of open) {
      for (const on of list) {
        if (tick > on.start) {
          result.notes.push({
            start: on.start,
            end: tick,
            pitch: id & 0xff,
            velocity: on.velocity,
            track: t,
            channel: id >> 8,
          });
        }
      }
    }
  }

  // O título é o nome da primeira faixa quando ela não tem notas (faixa de
  // regência, como no formato 1).
  const first = result.trackNames[0] ?? "";
  if (first && !result.notes.some((n) => n.track === 0) && !isGenericName(first)) {
    result.title = first;
  }
  result.notes.sort((x, y) => x.start - y.start || x.pitch - y.pitch);
  result.markers.sort((x, y) => x.tick - y.tick);
  return result;
}

const isGenericName = (name: string) =>
  /^(track|faixa|untitled|sem título|channel|canal)?\s*\d*$/i.test(name.trim());

const RIGHT = ["right", "rh", "direita", "md", "treble", "melody", "melodia"];
const LEFT = ["left", "lh", "esquerda", "me", "bass", "baixo", "acompanhamento"];

/** "Piano RH", "Mão direita"… → 0 (direita), 1 (esquerda) ou null. */
function handOfName(name: string): number | null {
  const words = name
    .toLowerCase()
    .replace(/(\b[rl])\.\s*h\b\.?/g, "$1h")
    .split(/[^a-zà-ú]+/);
  if (words.some((w) => RIGHT.includes(w))) return 0;
  if (words.some((w) => LEFT.includes(w))) return 1;
  return null;
}

/**
 * Mão de cada nota: 0 = direita (clave de sol), 1 = esquerda (clave de fá).
 * `group` diz de que faixa a nota veio e `names` dá o nome de cada faixa.
 */
export function splitHands(
  notes: { pitch: number }[],
  group: (i: number) => number,
  names: string[],
): number[] {
  const groups = [...new Set(notes.map((_, i) => group(i)))];
  if (groups.length === 2) {
    const [a, b] = groups;
    const ha = handOfName(names[a] ?? "");
    const hb = handOfName(names[b] ?? "");
    let right: number;
    if (ha === 0 || hb === 1) right = a;
    else if (hb === 0 || ha === 1) right = b;
    else {
      const mean = (g: number) => {
        const list = notes.filter((_, i) => group(i) === g);
        return list.reduce((s, n) => s + n.pitch, 0) / list.length;
      };
      right = mean(a) >= mean(b) ? a : b;
    }
    return notes.map((_, i) => (group(i) === right ? 0 : 1));
  }
  return notes.map((n) => (n.pitch >= 60 ? 0 : 1));
}

/** Família General MIDI, em português (programa 0 a 127). */
const FAMILIES = [
  "Piano", "Percussão cromática", "Órgão", "Violão", "Baixo", "Cordas", "Conjunto",
  "Metais", "Palhetas", "Flauta", "Synth lead", "Synth pad", "Efeitos de synth",
  "Étnicos", "Percussão", "Efeitos",
];

const isPiano = (program: number) => program <= 7;

// --------------------------------------------------------------- ritmo

/** Margem (em unidades) para uma nota "quase no tempo" contar no tempo seguinte. */
const SLACK = 1.5;

interface Grid {
  /** Grade de cada tempo: 3 = semicolcheia, 4 = tercina; chave "pauta:compasso:tempo". */
  grid: Map<string, number>;
  /** Tempos em swing: a colcheia em 8/12 vira 6/12. */
  swing: Set<string>;
}

const beatOf = (measures: Measure[], u: number) => {
  const m = measureAt(measures, u + SLACK);
  const beat = beatLength(m.num, m.den);
  const b = Math.min(Math.floor((u + SLACK - m.start) / beat), Math.ceil(m.length / beat) - 1);
  return { m, beat, b, start: m.start + b * beat };
};

/** Escolhe a grade de cada tempo de cada pauta e detecta swing. */
function chooseGrid(staves: number[][], measures: Measure[]): Grid {
  const offsets = new Map<string, number[]>();
  staves.forEach((points, s) => {
    for (const u of points) {
      const { m, beat, b, start } = beatOf(measures, u);
      if (beat !== 12) continue;
      const key = `${s}:${m.start}:${b}`;
      const list = offsets.get(key) ?? [];
      list.push(u - start);
      offsets.set(key, list);
    }
  });
  const grid = new Map<string, number>();
  const err = (list: number[], g: number) =>
    list.reduce((sum, o) => sum + Math.abs(o - Math.round(o / g) * g), 0);
  const snapped = new Map<string, number[]>();
  for (const [key, list] of offsets) {
    const e3 = err(list, 3);
    const e4 = err(list, 4);
    const asTriplet = list.map((o) => Math.round(o / 4) * 4);
    const g = e4 < e3 * 0.6 && asTriplet.some((o) => o === 4 || o === 8) ? 4 : 3;
    grid.set(key, g);
    snapped.set(key, g === 4 ? asTriplet : list.map((o) => Math.round(o / 3) * 3));
  }

  // Swing: a maioria das colcheias de contratempo cai em 2/3 do tempo.
  const swingKeys: string[] = [];
  let straight = 0;
  let triplets = 0;
  for (const [key, list] of snapped) {
    const inner = list.filter((o) => o > 0 && o < 12);
    if (!inner.length) continue;
    if (grid.get(key) === 4) {
      if (inner.every((o) => o === 8)) swingKeys.push(key);
      else triplets++;
    } else if (inner.includes(6)) straight++;
  }
  const swing = new Set<string>();
  if (swingKeys.length >= 8 && swingKeys.length > 3 * (straight + triplets)) {
    for (const key of swingKeys) {
      swing.add(key);
      grid.set(key, 3);
    }
  }
  return { grid, swing };
}

/** Alinha uma posição (em unidades, fracionária) à grade do seu tempo. */
function snap(u: number, staff: number, measures: Measure[], g: Grid) {
  const { m, beat, b, start } = beatOf(measures, u);
  const key = `${staff}:${m.start}:${b}`;
  const step = beat === 12 ? (g.grid.get(key) ?? 3) : 3;
  if (g.swing.has(key)) {
    // Em swing, o que cai em 2/3 do tempo é a segunda colcheia.
    const o = Math.round((u - start) / 4) * 4;
    return start + (o === 8 ? 6 : o);
  }
  return start + Math.round((u - start) / step) * step;
}

// --------------------------------------------------------------- conversão

export function midiToMusicXml(data: Uint8Array, fallbackTitle = ""): string {
  const midi = parseMidi(data);
  if (!midi.notes.length) throw new Error("O arquivo MIDI não tem notas");
  const units = (tick: number) => (tick / midi.division) * DIVISIONS;

  // Instrumentos: cada faixa + canal com notas.
  interface Group {
    key: string;
    name: string;
    program: number;
    notes: MidiNote[];
  }
  const groups: Group[] = [];
  const byKey = new Map<string, Group>();
  for (const n of midi.notes) {
    const key = `${n.track}:${n.channel}`;
    let g = byKey.get(key);
    if (!g) {
      const name = midi.trackNames[n.track] ?? "";
      g = {
        key,
        name: isGenericName(name) ? "" : name,
        program: midi.programs.get(key) ?? 0,
        notes: [],
      };
      byKey.set(key, g);
      groups.push(g);
    }
    g.notes.push(n);
  }
  const allPiano = groups.length === 1 || groups.every((g) => isPiano(g.program));
  const pianos = allPiano ? groups : groups.filter((g) => isPiano(g.program));
  const others = allPiano ? [] : groups.filter((g) => !isPiano(g.program));

  // Pautas: o piano tem duas; os outros instrumentos, uma.
  interface StaffSpec {
    clef: "G" | "F";
    notes: MidiNote[];
  }
  const partSpecs: { name: string; program: number; staves: StaffSpec[] }[] = [];
  if (pianos.length) {
    const notes = pianos.flatMap((g) => g.notes).sort((a, b) => a.start - b.start);
    const index = new Map(pianos.map((g, i) => [g.key, i]));
    const hands = splitHands(
      notes,
      (i) => index.get(`${notes[i].track}:${notes[i].channel}`)!,
      pianos.map((g) => g.name),
    );
    partSpecs.push({
      name: "Piano",
      program: allPiano ? 0 : pianos[0].program,
      staves: [
        { clef: "G", notes: notes.filter((_, i) => hands[i] === 0) },
        { clef: "F", notes: notes.filter((_, i) => hands[i] === 1) },
      ],
    });
  }
  const used = new Map<string, number>();
  for (const g of others) {
    const base = g.name || FAMILIES[g.program >> 3];
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    const mean = g.notes.reduce((s, n) => s + n.pitch, 0) / g.notes.length;
    const bass = g.program >= 32 && g.program <= 39;
    partSpecs.push({
      name: count > 1 ? `${base} ${count}` : base,
      program: g.program,
      staves: [{ clef: bass || mean < 55 ? "F" : "G", notes: g.notes }],
    });
  }

  // Compassos e grade rítmica.
  const timeSignatures = midi.timeSignatures.map((s) => ({
    unit: Math.round(units(s.tick) / 3) * 3,
    num: s.num || 4,
    den: Math.min(16, s.den || 4),
  }));
  const lastTick = Math.max(...midi.notes.map((n) => n.end));
  const measures = measuresUntil(timeSignatures, units(lastTick) + 48);
  const allStaves = partSpecs.flatMap((p) => p.staves);
  const grid = chooseGrid(
    allStaves.map((s) => s.notes.flatMap((n) => [units(n.start), units(n.end)])),
    measures,
  );

  let staffIndex = 0;
  const parts: XmlPart[] = partSpecs.map((p) => ({
    name: p.name,
    program: p.program,
    staves: p.staves.map((s) => {
      const si = staffIndex++;
      return {
        clef: s.clef,
        notes: s.notes.map((n): XmlNote => {
          const start = snap(units(n.start), si, measures, grid);
          let end = snap(units(n.end), si, measures, grid);
          if (end <= start) {
            // Nota curta demais: ocupa um passo da grade.
            const { m, beat, b } = beatOf(measures, start);
            const step = beat === 12 ? (grid.grid.get(`${si}:${m.start}:${b}`) ?? 3) : 3;
            end = start + step;
          }
          return { start, end, pitch: n.pitch, velocity: n.velocity };
        }),
      };
    }),
  }));

  const sections = midi.markers
    .filter((mk) => mk.text && !/^(start|end|fim|início)$/i.test(mk.text))
    .map((mk) => ({ unit: measureAt(measures, units(mk.tick) + SLACK).start, name: mk.text }))
    .filter((s, i, list) => i === 0 || s.unit !== list[i - 1].unit);

  return writeMusicXml({
    title: midi.title || fallbackTitle,
    software: "PartiTAB (convertido de MIDI)",
    fifths: midi.key?.fifths ?? 0,
    minor: midi.key?.minor ?? false,
    timeSignatures,
    tempos: midi.tempos.length
      ? midi.tempos.map((t) => ({ unit: Math.round(units(t.tick) / 3) * 3, bpm: Math.round(t.bpm) }))
      : [{ unit: 0, bpm: 120 }],
    sections,
    words: grid.swing.size ? [{ unit: 0, text: "Swing" }] : [],
    parts,
  });
}

/** Bytes de partitura que o alphaTab entende: MIDI vira MusicXML. */
export function toScoreBytes(data: Uint8Array, fallbackTitle = ""): Uint8Array {
  return isMidi(data) ? new TextEncoder().encode(midiToMusicXml(data, fallbackTitle)) : data;
}
