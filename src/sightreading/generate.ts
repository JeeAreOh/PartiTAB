/**
 * Trechos inéditos para leitura à primeira vista: harmonia primeiro, depois o
 * ritmo (com motivo repetido), a melodia e a mão esquerda do nível. Mesma
 * semente, mesmo trecho.
 */

import { fingerNotes, type FingeredNote } from "../practice/fingering";
import { mulberry32, pick, type Random } from "../util/random";
import { writeMusicXml, type XmlNote, type XmlScore, type XmlStaff } from "../midi/musicxml";
import { accompaniment, secondVoice, type BassEvent } from "./bass";
import { barLength, levelOf, type Level, type Meter } from "./levels";
import { generateMelody, keyContext, mod, type KeyContext, type MelodyNote } from "./melody";
import { fitsBar, randomBar, type Duration } from "./rhythm";

export const SIGHT_COMPOSER = "Primeira vista";
export const LOWEST = 36;
export const HIGHEST = 96;

/** Progressões de uma frase de 4 compassos, em graus (0 = I). */
const PROGRESSIONS: { chords: number[]; final: boolean; min: number; major?: boolean }[] = [
  { chords: [0, 3, 4, 0], final: true, min: 1 },
  { chords: [0, 4, 0, 0], final: true, min: 1 },
  { chords: [0, 4, 4, 0], final: true, min: 1 },
  { chords: [0, 3, 0, 4], final: false, min: 1 },
  { chords: [0, 5, 3, 4], final: false, min: 4 },
  { chords: [0, 1, 4, 0], final: true, min: 4, major: true },
  { chords: [0, 5, 1, 4], final: false, min: 6, major: true },
];

export interface SightPiece {
  level: number;
  seed: number;
  title: string;
  meter: Meter;
  fifths: number;
  minor: boolean;
  bpm: number;
  bars: number;
  /** Mãos que o aluno toca. */
  hands: "right" | "left" | "both";
  score: XmlScore;
  /** Linha principal (para conferir saltos e o fim na tônica). */
  melody: MelodyNote[];
}

export const sightTitle = (level: number, seed: number) => `Leitura · Nível ${level} · #${seed}`;

/** Gera o trecho; se a semente não der um trecho válido, tenta a seguinte. */
export function generate(levelNumber: number, seed: number): SightPiece {
  const level = levelOf(levelNumber);
  for (let attempt = 0; attempt < 50; attempt++) {
    const s = (seed + attempt) >>> 0;
    const piece = tryGenerate(level, s);
    if (piece && validate(piece, level)) return piece;
  }
  throw new Error(`Não consegui gerar um trecho do nível ${level.level}`);
}

export const sightXml = (piece: SightPiece) => writeMusicXml(piece.score);

function tryGenerate(level: Level, seed: number): SightPiece | null {
  const random = mulberry32(seed);
  const key = pick(random, level.keys);
  const meter = pick(random, level.meters);
  const bars = pick(random, level.bars);
  const ctx = keyContext(key);
  const barLen = barLength(meter);

  // Posição de cinco dedos começa na tônica (Dó ou Sol).
  const shift = level.fiveFinger ? ctx.tonicPc : 0;
  const melodyRange: [number, number] = [level.melody[0] + shift, level.melody[1] + shift];
  const bassRange: [number, number] = [level.bass[0] + shift, level.bass[1] + shift];

  const chords = harmony(random, level, key.minor, bars);
  const rhythm = melodyRhythm(random, level, meter, bars);
  if (!rhythm) return null;
  const melody = generateMelody(random, {
    ctx,
    level,
    meter,
    range: melodyRange,
    bars: rhythm,
    chords,
  });
  if (!melody) return null;

  const toNotes = (line: MelodyNote[], offset = 0): XmlNote[] => {
    const out: XmlNote[] = [];
    for (const n of line) {
      if (n.pitch === null) continue;
      const prev = out[out.length - 1];
      if (n.tie && prev && prev.end === n.start) prev.end = n.end;
      else out.push({ start: n.start, end: n.end, pitch: n.pitch + offset, velocity: 80 });
    }
    return out;
  };

  let staves: XmlStaff[];
  let hands: SightPiece["hands"] = "both";
  switch (level.left) {
    case "none":
      staves = [{ clef: "G", notes: toNotes(melody) }];
      hands = "right";
      break;
    case "alone":
      staves = [{ clef: "F", notes: toNotes(melody) }];
      hands = "left";
      break;
    case "alternate": {
      // Compassos pares na direita, ímpares na esquerda (uma oitava abaixo).
      const right = melody.filter((n) => n.bar % 2 === 0);
      const left = melody.filter((n) => n.bar % 2 === 1);
      staves = [
        { clef: "G", notes: toNotes(right) },
        { clef: "F", notes: toNotes(left, -12) },
      ];
      break;
    }
    case "voice": {
      const voice = secondVoice(random, { ctx, level, meter, range: bassRange, chords, bars });
      if (!voice) return null;
      staves = [
        { clef: "G", notes: toNotes(melody) },
        { clef: "F", notes: toNotes(voice) },
      ];
      break;
    }
    default: {
      const bass = accompaniment(random, { ctx, level, meter, range: bassRange, chords });
      if (!bass) return null;
      staves = [
        { clef: "G", notes: toNotes(melody) },
        { clef: "F", notes: eventsToNotes(bass) },
      ];
    }
  }

  fingerFirstBar(staves, barLen);

  const title = sightTitle(level.level, seed);
  const [num, den] = meter.split("/").map(Number);
  return {
    level: level.level,
    seed,
    title,
    meter,
    fifths: key.fifths,
    minor: key.minor,
    bpm: level.bpm,
    bars,
    hands,
    melody,
    score: {
      title,
      composer: SIGHT_COMPOSER,
      software: "PartiTAB",
      fifths: key.fifths,
      minor: key.minor,
      timeSignatures: [{ unit: 0, num, den }],
      tempos: [{ unit: 0, bpm: level.bpm }],
      parts: [{ name: "Piano", program: 0, staves }],
    },
  };
}

/** Um acorde por compasso, em frases de 4; o último compasso é a tônica. */
function harmony(random: Random, level: Level, minor: boolean, bars: number): number[] {
  const out: number[] = [];
  const phrases = Math.ceil(bars / 4);
  for (let p = 0; p < phrases; p++) {
    const final = p === phrases - 1;
    const options = PROGRESSIONS.filter(
      (x) => x.min <= level.level && (!final || x.final) && (!minor || !x.major),
    );
    out.push(...pick(random, options).chords);
  }
  out.length = bars;
  out[bars - 1] = 0;
  return out;
}

/**
 * Ritmo da melodia: o compasso 3 de cada frase repete o 1 (motivo), o fim de
 * frase às vezes é longo e o último compasso é uma nota só.
 */
function melodyRhythm(
  random: Random,
  level: Level,
  meter: Meter,
  bars: number,
): Duration[][] | null {
  const barLen = barLength(meter);
  const out: Duration[][] = [];
  for (let b = 0; b < bars; b++) {
    const inPhrase = b % 4;
    if (b === bars - 1) out.push([{ length: barLen, rest: false }]);
    else if (inPhrase === 2) out.push(out[b - 2]);
    else if (inPhrase === 3 && random() < 0.5)
      out.push(randomBar(random, meter, level.level, "ending"));
    else out.push(randomBar(random, meter, level.level, "body", level.level >= 2));
  }
  // A penúltima figura precisa ser nota (a cadência), não pausa.
  for (let tries = 0; out[bars - 2]?.[out[bars - 2].length - 1].rest && tries < 20; tries++) {
    out[bars - 2] = randomBar(random, meter, level.level, "body");
  }
  if (out[bars - 2]?.[out[bars - 2].length - 1].rest) return null;
  return out;
}

const eventsToNotes = (events: BassEvent[]): XmlNote[] =>
  events.flatMap((e) =>
    e.pitches.map((pitch) => ({ start: e.start, end: e.end, pitch, velocity: 70 })),
  );

/** Dedilhado só no primeiro compasso tocado de cada mão: o resto o aluno deduz. */
function fingerFirstBar(staves: XmlStaff[], barLen: number) {
  const hands: ("right" | "left")[] =
    staves.length === 2 ? ["right", "left"] : [staves[0].clef === "G" ? "right" : "left"];
  staves.forEach((staff, i) => {
    if (!staff.notes.length) return;
    const hand = hands[i];
    const list: FingeredNote[] = staff.notes.map((n) => ({ key: n.pitch, hand, tick: n.start }));
    const fingers = fingerNotes(list);
    const firstBar = Math.floor(staff.notes[0].start / barLen);
    for (const n of staff.notes) {
      if (Math.floor(n.start / barLen) !== firstBar) continue;
      const f = fingers.get(`${n.start}:${n.pitch}`);
      if (f) n.finger = f;
    }
  });
}

/** Regras do trecho: extensão do teclado, compassos completos, saltos e fim na tônica. */
export function validate(piece: SightPiece, level: Level = levelOf(piece.level)): boolean {
  const notes = piece.score.parts[0].staves.flatMap((s) => s.notes);
  if (notes.some((n) => n.pitch < LOWEST || n.pitch > HIGHEST || n.end <= n.start)) return false;
  const barLen = barLength(piece.meter);
  // Compassos completos: cada compasso da melodia soma o compasso.
  const byBar = new Map<number, Duration[]>();
  for (const n of piece.melody) {
    byBar.set(n.bar, [
      ...(byBar.get(n.bar) ?? []),
      { length: n.end - n.start, rest: n.pitch === null },
    ]);
  }
  if (byBar.size !== piece.bars) return false;
  for (const bar of byBar.values()) if (!fitsBar(bar, piece.meter)) return false;
  // Nada passa do fim.
  if (notes.some((n) => n.end > piece.bars * barLen)) return false;
  // Saltos dentro do máximo do nível.
  const sounding = piece.melody.filter((n) => n.degree !== null);
  for (let i = 1; i < sounding.length; i++) {
    if (Math.abs(sounding[i].degree! - sounding[i - 1].degree!) > level.maxLeap) return false;
  }
  // Termina na tônica.
  const last = sounding[sounding.length - 1];
  const ctx: KeyContext = keyContext({ fifths: piece.fifths, minor: piece.minor });
  return !!last && mod(last.pitch!, 12) === ctx.tonicPc;
}
