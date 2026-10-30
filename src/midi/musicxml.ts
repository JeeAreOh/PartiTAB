// Escreve MusicXML a partir de notas com início e fim em unidades. Usado pela
// conversão de MIDI e pelos exercícios de técnica.
//
// Uma semínima tem 12 unidades: semicolcheia = 3, colcheia de tercina = 4.
// Dentro de um tempo, as notas devem cair na grade de 3 (normal) ou de 4
// (tercina); um tempo com notas na grade de 4 é escrito como tercina.

export const DIVISIONS = 12;

export interface XmlNote {
  start: number;
  end: number;
  pitch: number;
  velocity: number;
  /** Dedilhado sugerido (1 = polegar). */
  finger?: number;
}

export interface XmlStaff {
  clef: "G" | "F";
  notes: XmlNote[];
}

export interface XmlPart {
  name: string;
  /** Programa General MIDI (0 = piano acústico). */
  program: number;
  staves: XmlStaff[];
}

export interface XmlScore {
  title: string;
  subtitle?: string;
  composer?: string;
  software: string;
  fifths: number;
  minor: boolean;
  timeSignatures: { unit: number; num: number; den: number }[];
  tempos: { unit: number; bpm: number }[];
  /** Marcas de ensaio: viram as seções da música. */
  sections?: { unit: number; name: string }[];
  /** Texto sobre a pauta (ex.: "Swing"). */
  words?: { unit: number; text: string }[];
  parts: XmlPart[];
}

export interface Measure {
  start: number;
  length: number;
  num: number;
  den: number;
  newSig: boolean;
}

/** Duração de um tempo do compasso, em unidades (6/8, 9/8, 12/8: semínima pontuada). */
export const beatLength = (num: number, den: number) =>
  den === 8 && num % 3 === 0 && num > 3 ? 18 : 48 / den;

/** Compassos que cobrem até `end`, seguindo as fórmulas de compasso. */
export function measuresUntil(
  sigs: { unit: number; num: number; den: number }[],
  end: number,
): Measure[] {
  const list = [...sigs].sort((a, b) => a.unit - b.unit);
  if (!list.length || list[0].unit > 0) list.unshift({ unit: 0, num: 4, den: 4 });
  const measures: Measure[] = [];
  for (let pos = 0, s = 0; pos < Math.max(end, 1); ) {
    while (s + 1 < list.length && list[s + 1].unit <= pos) s++;
    const { num, den } = list[s];
    const length = Math.max(3, Math.round((num * 48) / den));
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
  return measures;
}

/** Compasso que contém a posição (busca binária). */
export function measureAt(measures: Measure[], unit: number) {
  let lo = 0;
  let hi = measures.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measures[mid].start <= unit) lo = mid;
    else hi = mid - 1;
  }
  return measures[lo];
}

interface Item {
  start: number;
  end: number;
  pitches: number[];
  fingers: (number | undefined)[];
  velocity: number;
}

/** Distribui os acordes de uma pauta em até duas vozes. */
export function voices(notes: XmlNote[]): Item[][] {
  const groups = new Map<string, Item>();
  for (const n of notes) {
    const key = `${n.start}:${n.end}`;
    const g = groups.get(key);
    if (g) {
      if (!g.pitches.includes(n.pitch)) {
        g.pitches.push(n.pitch);
        g.fingers.push(n.finger);
      }
      g.velocity = Math.max(g.velocity, n.velocity);
    } else {
      groups.set(key, {
        start: n.start,
        end: n.end,
        pitches: [n.pitch],
        fingers: [n.finger],
        velocity: n.velocity,
      });
    }
  }
  const chords = [...groups.values()].sort((a, b) => a.start - b.start || b.end - a.end);
  const result: Item[][] = [[], []];
  const cursor = (v: Item[]) => (v.length ? v[v.length - 1].end : 0);
  for (const chord of chords) {
    let voice = result.find((v) => cursor(v) <= chord.start);
    if (!voice) {
      // Mesma hora de início: junta ao acorde, com a duração mais curta.
      const same = result.find((v) => v.length && v[v.length - 1].start === chord.start);
      if (same) {
        const last = same[same.length - 1];
        last.end = Math.min(last.end, chord.end);
        chord.pitches.forEach((p, i) => {
          if (!last.pitches.includes(p)) {
            last.pitches.push(p);
            last.fingers.push(chord.fingers[i]);
          }
        });
        continue;
      }
      // Senão encurta a nota que termina antes e entra no lugar dela.
      voice = result.reduce((a, b) => (cursor(a) <= cursor(b) ? a : b));
      voice[voice.length - 1].end = chord.start;
    }
    voice.push(chord);
  }
  // Acordes de baixo para cima, com o dedilhado junto.
  for (const v of result) {
    for (const it of v) {
      const order = it.pitches.map((_, i) => i).sort((a, b) => it.pitches[a] - it.pitches[b]);
      it.pitches = order.map((i) => it.pitches[i]);
      it.fingers = order.map((i) => it.fingers[i]);
    }
  }
  return result;
}

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL = [0, 2, 4, 5, 7, 9, 11];

/**
 * Grafia de cada classe de altura na tonalidade: as notas da escala com a letra
 * da escala; nas menores, a sensível e a sexta elevadas; as outras como
 * sustenido (armadura com sustenidos) ou bemol (com bemóis).
 */
export function spelling(fifths: number, minor: boolean): [string, number][] {
  const tonicLetter = (((fifths * 4) % 7) + 7) % 7;
  const tonicPc = (((fifths * 7) % 12) + 12) % 12;
  const out: ([string, number] | null)[] = Array(12).fill(null);
  const degree = (i: number): [number, number] => {
    const letter = (tonicLetter + i) % 7;
    const pc = (tonicPc + NATURAL[i]) % 12;
    let alter = pc - NATURAL[letter];
    if (alter > 6) alter -= 12;
    if (alter < -6) alter += 12;
    return [letter, alter];
  };
  const set = (pc: number, letter: number, alter: number) => {
    const k = (((pc % 12) + 12) % 12);
    if (!out[k] && Math.abs(alter) <= 2) out[k] = [LETTERS[letter], alter];
  };
  for (let i = 0; i < 7; i++) {
    const [letter, alter] = degree(i);
    set(NATURAL[letter] + alter, letter, alter);
  }
  if (minor) {
    // Na relativa menor: 6.º e 7.º graus elevados (graus 4 e 5 da maior, a partir de 0: 3 e 4).
    for (const i of [4, 3]) {
      const [letter, alter] = degree(i);
      set(NATURAL[letter] + alter + 1, letter, alter + 1);
    }
  }
  for (let pc = 0; pc < 12; pc++) {
    if (out[pc]) continue;
    const below = out[(pc + 11) % 12];
    const above = out[(pc + 1) % 12];
    const sharp = below && ([below[0], below[1] + 1] as [string, number]);
    const flat = above && ([above[0], above[1] - 1] as [string, number]);
    out[pc] = (fifths >= 0 ? (sharp ?? flat) : (flat ?? sharp))!;
  }
  return out as [string, number][];
}

/** Figuras normais: unidades, tipo, pontuada. */
const FIGURES: [number, string, boolean][] = [
  [48, "whole", false],
  [36, "half", true],
  [24, "half", false],
  [18, "quarter", true],
  [12, "quarter", false],
  [9, "eighth", true],
  [6, "eighth", false],
  [3, "16th", false],
];

interface Piece {
  length: number;
  type: string;
  dot: boolean;
  triplet: boolean;
}

/** Divide um trecho sem tercinas em figuras, alinhadas aos tempos. */
function straightPieces(offset: number, length: number, beat: number): Piece[] {
  const out: Piece[] = [];
  let pos = offset;
  let left = length;
  while (left > 0) {
    const toBeat = beat - (pos % beat);
    // Fora do tempo, completa só até o próximo tempo.
    const limit = pos % beat ? Math.min(left, toBeat) : left;
    const fig = FIGURES.find(([u]) => u <= limit) ?? FIGURES[FIGURES.length - 1];
    const d = Math.min(fig[0], left);
    out.push({ length: d, type: fig[1], dot: fig[2], triplet: false });
    pos += d;
    left -= d;
  }
  return out;
}

/** Divide um trecho dentro de um tempo de tercina (múltiplos de 4). */
function tripletPieces(offset: number, length: number): Piece[] {
  const out: Piece[] = [];
  let pos = offset % 12;
  let left = length;
  while (left > 0) {
    if (pos === 0 && left >= 12) {
      out.push({ length: 12, type: "quarter", dot: false, triplet: false });
      left -= 12;
      continue;
    }
    const d = left >= 8 && pos + 8 <= 12 ? 8 : Math.min(4, left);
    out.push({ length: d, type: d === 8 ? "quarter" : "eighth", dot: false, triplet: true });
    pos = (pos + d) % 12;
    left -= d;
  }
  return out;
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function writeMusicXml(score: XmlScore): string {
  const lastEnd = Math.max(
    1,
    ...score.parts.flatMap((p) => p.staves.flatMap((s) => s.notes.map((n) => n.end))),
  );
  const measures = measuresUntil(score.timeSignatures, lastEnd);
  const fifths = Math.max(-7, Math.min(7, score.fifths));
  const steps = spelling(fifths, score.minor);
  const tempos = score.tempos.filter((t, i, list) => i === 0 || t.bpm !== list[i - 1].bpm);

  const noteXml = (
    pitch: number | null,
    piece: Piece,
    voice: number,
    staff: number,
    opts: {
      chord?: boolean;
      tieStart?: boolean;
      tieStop?: boolean;
      dynamics?: number;
      hidden?: boolean;
      finger?: number;
    },
  ) => {
    const x: string[] = [];
    x.push(
      opts.dynamics
        ? `<note dynamics="${opts.dynamics}">`
        : opts.hidden
          ? '<note print-object="no">'
          : "<note>",
    );
    if (opts.chord) x.push("<chord/>");
    if (pitch === null) x.push("<rest/>");
    else {
      const [step, alter] = steps[pitch % 12];
      // Si♯ é do dó de cima e Dó♭ do si de baixo: a oitava segue a letra.
      const octave = Math.floor((pitch - alter) / 12) - 1;
      x.push(
        `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${octave}</octave></pitch>`,
      );
    }
    x.push(`<duration>${piece.length}</duration>`);
    if (opts.tieStop) x.push('<tie type="stop"/>');
    if (opts.tieStart) x.push('<tie type="start"/>');
    x.push(`<voice>${voice}</voice><type>${piece.type}</type>`);
    if (piece.dot) x.push("<dot/>");
    if (piece.triplet) {
      x.push(
        "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>",
      );
    }
    x.push(`<staff>${staff}</staff>`);
    const notations: string[] = [];
    if (opts.tieStop) notations.push('<tied type="stop"/>');
    if (opts.tieStart) notations.push('<tied type="start"/>');
    if (opts.finger) {
      notations.push(`<technical><fingering>${opts.finger}</fingering></technical>`);
    }
    if (notations.length) x.push(`<notations>${notations.join("")}</notations>`);
    x.push("</note>");
    return x.join("");
  };

  /** Uma voz dentro de um compasso; vazio se não há notas e a voz é opcional. */
  const writeVoice = (items: Item[], m: Measure, voice: number, staff: number, required: boolean) => {
    const mEnd = m.start + m.length;
    const inside = items.filter((it) => it.start < mEnd && it.end > m.start);
    if (!inside.length) {
      return required
        ? `<note><rest measure="yes"/><duration>${m.length}</duration><voice>${voice}</voice><staff>${staff}</staff></note>`
        : "";
    }
    const beat = beatLength(m.num, m.den);
    // Tempos de tercina: alguma nota começa ou termina fora da grade de 3.
    const triplets = new Set<number>();
    if (beat === 12) {
      for (const it of inside) {
        for (const p of [it.start, it.end]) {
          const off = p - m.start;
          if (off > 0 && off < m.length && off % 3 !== 0) triplets.add(Math.floor(off / 12));
        }
      }
    }
    const pieces = (from: number, to: number): Piece[] => {
      const out: Piece[] = [];
      let pos = from - m.start;
      const end = to - m.start;
      while (pos < end) {
        const b = Math.floor(pos / beat);
        if (triplets.has(b)) {
          const stop = Math.min(end, (b + 1) * beat);
          out.push(...tripletPieces(pos, stop - pos));
          pos = stop;
        } else {
          let stop = end;
          for (let k = b + 1; k * beat < end; k++) {
            if (triplets.has(k)) {
              stop = k * beat;
              break;
            }
          }
          out.push(...straightPieces(pos, stop - pos, beat));
          pos = stop;
        }
      }
      return out;
    };

    const xml: string[] = [];
    let pos = m.start;
    const rest = (until: number) => {
      for (const piece of pieces(pos, until)) {
        xml.push(noteXml(null, piece, voice, staff, { hidden: !required }));
      }
      pos = until;
    };
    for (const it of inside) {
      const s = Math.max(it.start, m.start);
      const e = Math.min(it.end, mEnd);
      if (s > pos) rest(s);
      if (s < pos) continue; // sobreposição que sobrou: ignora
      let at = s;
      pieces(s, e).forEach((piece, i) => {
        const tieStop = at > it.start;
        const tieStart = at + piece.length < it.end;
        it.pitches.forEach((p, j) => {
          xml.push(
            noteXml(p, piece, voice, staff, {
              chord: j > 0,
              tieStart,
              tieStop,
              dynamics: i === 0 && !tieStop ? Math.round((it.velocity / 90) * 100) : undefined,
              finger: !tieStop ? it.fingers[j] : undefined,
            }),
          );
        });
        at += piece.length;
      });
      pos = e;
    }
    if (pos < mEnd) rest(mEnd);
    return xml.join("");
  };

  const direction = (inner: string, staff = 1) =>
    `<direction placement="above"><direction-type>${inner}</direction-type><staff>${staff}</staff></direction>`;

  const parts = score.parts.map((part, pi) => {
    const staffVoices = part.staves.map((s) => voices(s.notes));
    const body: string[] = [];
    measures.forEach((m, index) => {
      const out: string[] = [`<measure number="${index + 1}">`];
      if (index === 0 || m.newSig) {
        out.push("<attributes>");
        if (index === 0) {
          out.push(`<divisions>${DIVISIONS}</divisions>`);
          out.push(
            `<key><fifths>${fifths}</fifths><mode>${score.minor ? "minor" : "major"}</mode></key>`,
          );
        }
        out.push(`<time><beats>${m.num}</beats><beat-type>${m.den}</beat-type></time>`);
        if (index === 0) {
          if (part.staves.length > 1) out.push(`<staves>${part.staves.length}</staves>`);
          part.staves.forEach((s, i) => {
            out.push(
              `<clef number="${i + 1}"><sign>${s.clef}</sign><line>${s.clef === "G" ? 2 : 4}</line></clef>`,
            );
          });
        }
        out.push("</attributes>");
      }
      const within = (unit: number) => unit >= m.start && unit < m.start + m.length;
      if (pi === 0) {
        for (const s of score.sections ?? []) {
          if (within(s.unit)) out.push(direction(`<rehearsal>${escape(s.name)}</rehearsal>`));
        }
        for (const w of score.words ?? []) {
          if (within(w.unit)) out.push(direction(`<words>${escape(w.text)}</words>`));
        }
      }
      for (const t of tempos) {
        if (within(t.unit)) {
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
          if (!first) out.push(`<backup><duration>${m.length}</duration></backup>`);
          out.push(xml);
          first = false;
        });
      });
      out.push("</measure>");
      body.push(out.join(""));
    });
    return `<part id="P${pi + 1}">\n${body.join("\n")}\n</part>`;
  });

  // Canais 1 a 16, pulando o 10 (bateria).
  const channel = (i: number) => {
    const c = (i % 15) + 1;
    return c >= 10 ? c + 1 : c;
  };
  const partList = score.parts
    .map(
      (p, i) =>
        `<score-part id="P${i + 1}"><part-name>${escape(p.name)}</part-name>` +
        `<score-instrument id="P${i + 1}-I1"><instrument-name>${escape(p.name)}</instrument-name></score-instrument>` +
        `<midi-instrument id="P${i + 1}-I1"><midi-channel>${channel(i)}</midi-channel><midi-program>${p.program + 1}</midi-program></midi-instrument>` +
        "</score-part>",
    )
    .join("\n");

  const work = [
    score.title ? `<work-title>${escape(score.title)}</work-title>` : "",
    score.subtitle ? `<work-number>${escape(score.subtitle)}</work-number>` : "",
  ].join("");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
    work ? `<work>${work}</work>` : "",
    "<identification>",
    score.composer ? `<creator type="composer">${escape(score.composer)}</creator>` : "",
    `<encoding><software>${escape(score.software)}</software></encoding>`,
    "</identification>",
    `<part-list>\n${partList}\n</part-list>`,
    ...parts,
    "</score-partwise>",
  ].join("\n");
}
