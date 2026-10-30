// Converte um arquivo MIDI (.mid) em MusicXML para piano, com duas pautas.
// O alphaTab não importa MIDI; com a conversão, a biblioteca, a prática e a
// busca tratam o .mid como qualquer outra partitura.
//
// - Mãos: se o arquivo tem duas faixas de notas, a mais aguda é a mão direita
//   (ou o nome da faixa decide: "right", "left", "direita", "RH"…). Senão as
//   notas se dividem pelo dó central.
// - Ritmo: tudo é alinhado à semicolcheia. Tercinas ficam aproximadas.
// - Bateria (canal 10) fica de fora.

const UNITS_PER_QUARTER = 4; // semicolcheia = 1

export interface MidiNote {
  start: number; // em ticks
  end: number;
  pitch: number;
  velocity: number;
  track: number;
}

export interface ParsedMidi {
  division: number;
  notes: MidiNote[];
  trackNames: string[];
  title: string;
  tempos: { tick: number; bpm: number }[];
  timeSignatures: { tick: number; num: number; den: number }[];
  key: { fifths: number; minor: boolean } | null;
}

export const isMidi = (data: Uint8Array) =>
  data.length > 14 &&
  data[0] === 0x4d &&
  data[1] === 0x54 &&
  data[2] === 0x68 &&
  data[3] === 0x64;

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
  if (division & 0x8000)
    throw new Error("MIDI com tempo SMPTE não é suportado");

  const result: ParsedMidi = {
    division,
    notes: [],
    trackNames: [],
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
        if (meta === 0x03 && !result.trackNames[t])
          result.trackNames[t] = text(body).trim();
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
      const id = a;
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
          });
        }
      }
    }
    // Notas que nunca desligaram terminam no fim da faixa.
    for (const [pitch, list] of open) {
      for (const on of list) {
        if (tick > on.start) {
          result.notes.push({
            start: on.start,
            end: tick,
            pitch,
            velocity: on.velocity,
            track: t,
          });
        }
      }
    }
  }

  // O título é o nome da primeira faixa quando ela não tem notas (faixa de
  // regência, como no formato 1).
  const first = result.trackNames[0] ?? "";
  if (
    first &&
    !result.notes.some((n) => n.track === 0) &&
    !isGenericName(first)
  ) {
    result.title = first;
  }
  result.notes.sort((x, y) => x.start - y.start || x.pitch - y.pitch);
  return result;
}

const isGenericName = (name: string) =>
  /^(track|faixa|untitled|sem título)\s*\d*$/i.test(name);

const RIGHT = ["right", "rh", "direita", "md", "treble", "melody", "melodia"];
const LEFT = [
  "left",
  "lh",
  "esquerda",
  "me",
  "bass",
  "baixo",
  "acompanhamento",
];

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

/** Mão de cada nota: 0 = direita (clave de sol), 1 = esquerda (clave de fá). */
export function splitHands(notes: MidiNote[], trackNames: string[]): number[] {
  const tracks = [...new Set(notes.map((n) => n.track))];
  if (tracks.length === 2) {
    const [a, b] = tracks;
    const name = (t: number) => trackNames[t] ?? "";
    let right: number | null = null;
    const ha = handOfName(name(a));
    const hb = handOfName(name(b));
    if (ha === 0 || hb === 1) right = a;
    else if (hb === 0 || ha === 1) right = b;
    else {
      const mean = (t: number) => {
        const list = notes.filter((n) => n.track === t);
        return list.reduce((s, n) => s + n.pitch, 0) / list.length;
      };
      right = mean(a) >= mean(b) ? a : b;
    }
    return notes.map((n) => (n.track === right ? 0 : 1));
  }
  return notes.map((n) => (n.pitch >= 60 ? 0 : 1));
}

interface Item {
  start: number; // em unidades (semicolcheias)
  end: number;
  pitches: number[];
  velocity: number;
}

/** Distribui os acordes de uma pauta em até duas vozes. */
function voices(
  notes: { start: number; end: number; pitch: number; velocity: number }[],
) {
  const groups = new Map<string, Item>();
  for (const n of notes) {
    const key = `${n.start}:${n.end}`;
    const g = groups.get(key);
    if (g) {
      if (!g.pitches.includes(n.pitch)) g.pitches.push(n.pitch);
      g.velocity = Math.max(g.velocity, n.velocity);
    } else
      groups.set(key, {
        start: n.start,
        end: n.end,
        pitches: [n.pitch],
        velocity: n.velocity,
      });
  }
  const chords = [...groups.values()].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const result: Item[][] = [[], []];
  for (const chord of chords) {
    chord.pitches.sort((a, b) => a - b);
    const cursor = (v: Item[]) => (v.length ? v[v.length - 1].end : 0);
    let voice = result.find((v) => cursor(v) <= chord.start);
    if (!voice) {
      // Mesma hora de início: junta ao acorde, com a duração mais curta.
      const same = result.find(
        (v) => v.length && v[v.length - 1].start === chord.start,
      );
      if (same) {
        const last = same[same.length - 1];
        last.end = Math.min(last.end, chord.end);
        for (const p of chord.pitches)
          if (!last.pitches.includes(p)) last.pitches.push(p);
        last.pitches.sort((a, b) => a - b);
        continue;
      }
      // Senão encurta a nota que termina antes e entra no lugar dela.
      voice = result.reduce((a, b) => (cursor(a) <= cursor(b) ? a : b));
      voice[voice.length - 1].end = chord.start;
    }
    voice.push(chord);
  }
  return result;
}

const STEPS_SHARP: [string, number][] = [
  ["C", 0],
  ["C", 1],
  ["D", 0],
  ["D", 1],
  ["E", 0],
  ["F", 0],
  ["F", 1],
  ["G", 0],
  ["G", 1],
  ["A", 0],
  ["A", 1],
  ["B", 0],
];
const STEPS_FLAT: [string, number][] = [
  ["C", 0],
  ["D", -1],
  ["D", 0],
  ["E", -1],
  ["E", 0],
  ["F", 0],
  ["G", -1],
  ["G", 0],
  ["A", -1],
  ["A", 0],
  ["B", -1],
  ["B", 0],
];

const DURATIONS: [number, string, boolean][] = [
  [16, "whole", false],
  [12, "half", true],
  [8, "half", false],
  [6, "quarter", true],
  [4, "quarter", false],
  [3, "eighth", true],
  [2, "eighth", false],
  [1, "16th", false],
];

/** Divide uma duração em figuras, alinhadas aos tempos quando possível. */
function figures(start: number, length: number, beat: number) {
  const out: number[] = [];
  let pos = start;
  let left = length;
  while (left > 0) {
    const toBeat = beat - (pos % beat);
    // Fora do tempo, completa só até o próximo tempo.
    const limit = pos % beat ? Math.min(left, toBeat) : left;
    const d = DURATIONS.find(([u]) => u <= limit)![0];
    out.push(d);
    pos += d;
    left -= d;
  }
  return out;
}

const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function midiToMusicXml(data: Uint8Array, fallbackTitle = ""): string {
  const midi = parseMidi(data);
  if (!midi.notes.length) throw new Error("O arquivo MIDI não tem notas");
  const q = (tick: number) =>
    Math.round((tick / midi.division) * UNITS_PER_QUARTER);

  // Compassos, a partir das fórmulas de compasso.
  const sigs = midi.timeSignatures
    .map((s) => ({
      unit: q(s.tick),
      num: s.num || 4,
      den: Math.min(16, s.den || 4),
    }))
    .sort((a, b) => a.unit - b.unit);
  if (!sigs.length || sigs[0].unit > 0)
    sigs.unshift({ unit: 0, num: 4, den: 4 });
  const hands = splitHands(midi.notes, midi.trackNames);
  const staffNotes: {
    start: number;
    end: number;
    pitch: number;
    velocity: number;
  }[][] = [[], []];
  midi.notes.forEach((n, i) => {
    const start = q(n.start);
    const end = Math.max(start + 1, q(n.end));
    staffNotes[hands[i]].push({
      start,
      end,
      pitch: n.pitch,
      velocity: n.velocity,
    });
  });
  const lastEnd = Math.max(...midi.notes.map((n) => q(n.end)), 1);

  const measures: {
    start: number;
    length: number;
    num: number;
    den: number;
    newSig: boolean;
  }[] = [];
  for (let pos = 0, s = 0; pos < lastEnd; ) {
    while (s + 1 < sigs.length && sigs[s + 1].unit <= pos) s++;
    const { num, den } = sigs[s];
    const length = Math.max(1, Math.round((num * 16) / den));
    const prev = measures[measures.length - 1];
    measures.push({
      start: pos,
      length,
      num,
      den,
      newSig: !prev || prev.num !== num || prev.den !== den,
    });
    pos += length;
  }

  const staffVoices = staffNotes.map((list) => voices(list));
  const fifths = Math.max(-7, Math.min(7, midi.key?.fifths ?? 0));
  const steps = fifths < 0 ? STEPS_FLAT : STEPS_SHARP;

  const tempos = midi.tempos
    .map((t) => ({ unit: q(t.tick), bpm: Math.round(t.bpm) }))
    .filter((t, i, list) => i === 0 || t.bpm !== list[i - 1].bpm);
  if (!tempos.length) tempos.push({ unit: 0, bpm: 120 });

  const noteXml = (
    pitch: number | null,
    duration: number,
    type: [string, boolean],
    voice: number,
    staff: number,
    opts: {
      chord?: boolean;
      tieStart?: boolean;
      tieStop?: boolean;
      dynamics?: number;
      hidden?: boolean;
    },
  ) => {
    const parts: string[] = [];
    parts.push(
      opts.dynamics
        ? `<note dynamics="${opts.dynamics}">`
        : opts.hidden
          ? '<note print-object="no">'
          : "<note>",
    );
    if (opts.chord) parts.push("<chord/>");
    if (pitch === null) parts.push("<rest/>");
    else {
      const [step, alter] = steps[pitch % 12];
      parts.push(
        `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${Math.floor(pitch / 12) - 1}</octave></pitch>`,
      );
    }
    parts.push(`<duration>${duration}</duration>`);
    if (opts.tieStop) parts.push('<tie type="stop"/>');
    if (opts.tieStart) parts.push('<tie type="start"/>');
    parts.push(`<voice>${voice}</voice><type>${type[0]}</type>`);
    if (type[1]) parts.push("<dot/>");
    parts.push(`<staff>${staff}</staff>`);
    if (opts.tieStart || opts.tieStop) {
      parts.push("<notations>");
      if (opts.tieStop) parts.push('<tied type="stop"/>');
      if (opts.tieStart) parts.push('<tied type="start"/>');
      parts.push("</notations>");
    }
    parts.push("</note>");
    return parts.join("");
  };

  /** Escreve uma voz dentro de um compasso; devolve o XML (vazio se não há notas). */
  const writeVoice = (
    items: Item[],
    m: (typeof measures)[number],
    voice: number,
    staff: number,
    required: boolean,
  ) => {
    const mEnd = m.start + m.length;
    const inside = items.filter((it) => it.start < mEnd && it.end > m.start);
    if (!inside.length && !required) return "";
    const beat = m.den === 8 && m.num % 3 === 0 && m.num > 3 ? 6 : 16 / m.den;
    const xml: string[] = [];
    let pos = m.start;
    const rest = (until: number) => {
      for (const d of figures(pos - m.start, until - pos, beat)) {
        const [, type, dot] = DURATIONS.find(([u]) => u === d)!;
        xml.push(
          noteXml(null, d, [type, dot], voice, staff, { hidden: !required }),
        );
      }
      pos = until;
    };
    if (!inside.length) {
      // Compasso vazio: pausa de compasso inteiro.
      xml.push(
        `<note><rest measure="yes"/><duration>${m.length}</duration><voice>${voice}</voice><staff>${staff}</staff></note>`,
      );
      return xml.join("");
    }
    for (const it of inside) {
      const s = Math.max(it.start, m.start);
      const e = Math.min(it.end, mEnd);
      if (s > pos) rest(s);
      if (s < pos) continue; // sobreposição que sobrou: ignora
      const pieces = figures(s - m.start, e - s, beat);
      let at = s;
      pieces.forEach((d, i) => {
        const [, type, dot] = DURATIONS.find(([u]) => u === d)!;
        const tieStop = at > it.start;
        const tieStart = at + d < it.end;
        it.pitches.forEach((p, j) => {
          xml.push(
            noteXml(p, d, [type, dot], voice, staff, {
              chord: j > 0,
              tieStart,
              tieStop,
              dynamics:
                i === 0 && !tieStop
                  ? Math.round((it.velocity / 90) * 100)
                  : undefined,
            }),
          );
        });
        at += d;
      });
      pos = e;
    }
    if (pos < mEnd) rest(mEnd);
    return xml.join("");
  };

  const body: string[] = [];
  measures.forEach((m, index) => {
    const out: string[] = [`<measure number="${index + 1}">`];
    if (index === 0 || m.newSig) {
      out.push("<attributes>");
      if (index === 0) out.push(`<divisions>${UNITS_PER_QUARTER}</divisions>`);
      if (index === 0)
        out.push(
          `<key><fifths>${fifths}</fifths>${midi.key?.minor ? "<mode>minor</mode>" : "<mode>major</mode>"}</key>`,
        );
      out.push(
        `<time><beats>${m.num}</beats><beat-type>${m.den}</beat-type></time>`,
      );
      if (index === 0) {
        out.push("<staves>2</staves>");
        out.push('<clef number="1"><sign>G</sign><line>2</line></clef>');
        out.push('<clef number="2"><sign>F</sign><line>4</line></clef>');
      }
      out.push("</attributes>");
    }
    for (const t of tempos) {
      if (t.unit >= m.start && t.unit < m.start + m.length) {
        out.push(
          `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${t.bpm}</per-minute></metronome></direction-type><staff>1</staff><sound tempo="${t.bpm}"/></direction>`,
        );
      }
    }
    let first = true;
    staffVoices.forEach((vs, s) => {
      vs.forEach((items, v) => {
        const xml = writeVoice(items, m, s * 4 + v + 1, s + 1, v === 0);
        if (!xml) return;
        if (!first)
          out.push(`<backup><duration>${m.length}</duration></backup>`);
        out.push(xml);
        first = false;
      });
    });
    out.push("</measure>");
    body.push(out.join(""));
  });

  const title = escape(midi.title || fallbackTitle);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
    title ? `<work><work-title>${title}</work-title></work>` : "",
    "<identification><encoding><software>PartiTAB (convertido de MIDI)</software></encoding></identification>",
    '<part-list><score-part id="P1"><part-name>Piano</part-name>',
    '<score-instrument id="P1-I1"><instrument-name>Piano</instrument-name></score-instrument>',
    '<midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument>',
    "</score-part></part-list>",
    '<part id="P1">',
    ...body,
    "</part>",
    "</score-partwise>",
  ].join("\n");
}

/** Bytes de partitura que o alphaTab entende: MIDI vira MusicXML. */
export function toScoreBytes(data: Uint8Array, fallbackTitle = ""): Uint8Array {
  return isMidi(data)
    ? new TextEncoder().encode(midiToMusicXml(data, fallbackTitle))
    : data;
}
