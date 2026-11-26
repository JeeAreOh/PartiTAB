/**
 * Cartões de padrões: intervalos (2ª a 8ª, melódicos ou harmônicos) e tríades
 * maiores e menores com inversões, para ler por desenho em vez de nota a nota.
 * Repetição espaçada igual à dos cartões de nota (caixas de Leitner).
 */

import { BOTTOM_LINE, NAMES, type Clef } from "./cards";
import { octaveName } from "../octave";

export type PatternKind = "interval" | "triad";

export interface SpelledNote {
  key: number;
  /** 0 = Dó … 6 = Si. */
  letter: number;
  /** −1 bemol, 0, +1 sustenido. */
  alter: number;
}

export interface PatternCard {
  id: string;
  kind: PatternKind;
  clef: Clef;
  /** Notas na ordem em que aparecem (melódico: da esquerda para a direita). */
  notes: SpelledNote[];
  harmonic: boolean;
  /** Nome mostrado depois da resposta ("3ª maior", "Ré menor, 1ª inversão"). */
  name: string;
}

export interface PatternState {
  id: string;
  box: number;
  seen: number;
  correct: number;
  totalMs: number;
  lastSeen: number | null;
}

/** Até este tempo a resposta conta como rápida (sobe de caixa). */
export const PATTERN_FAST_MS = 4000;
/** Notas tocadas juntas: até 150 ms entre a primeira e a última. */
export const CHORD_WINDOW_MS = 150;
const WEIGHTS = [0, 16, 8, 4, 2, 1];

const NATURAL = [0, 2, 4, 5, 7, 9, 11];

/** Extensão de cada clave para os padrões: a pauta e uma linha suplementar. */
export const PATTERN_RANGE: Record<Clef, [number, number]> = {
  treble: [60, 81],
  bass: [40, 60],
};

/** Altura da letra `letter` com `alter`, na oitava científica `octave` (Dó4 = 60). */
const pitchOf = (letter: number, alter: number, octave: number) =>
  12 * (octave + 1) + NATURAL[letter] + alter;

/** Posição na pauta (0 = linha de baixo) de uma nota grafada. */
export function stepOf(clef: Clef, n: SpelledNote): number {
  const octave = Math.floor((n.key - n.alter) / 12) - 1;
  return octave * 7 + n.letter - BOTTOM_LINE[clef];
}

export function spelledName(n: SpelledNote): string {
  return `${NAMES[n.letter]}${n.alter > 0 ? "#" : n.alter < 0 ? "♭" : ""}${octaveName(n.key)}`;
}

// ------------------------------------------------------------- intervalos

const ORDINAL = ["", "", "2ª", "3ª", "4ª", "5ª", "6ª", "7ª", "8ª"];

/** Qualidade pelo número (2–8) e pelos semitons. */
export function intervalName(number: number, semitones: number): string {
  const perfect = [4, 5, 8].includes(number);
  const base = { 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12 }[number] ?? 0;
  const diff = semitones - base;
  const quality = perfect
    ? { [-1]: "diminuta", 0: "justa", 1: "aumentada" }[diff]
    : { [-2]: "diminuta", [-1]: "menor", 0: "maior", 1: "aumentada" }[diff];
  return `${ORDINAL[number]} ${quality ?? ""}`.trim();
}

/** Intervalos entre teclas brancas (sem acidentes), de 2ª a 8ª, na clave. */
export function intervalPool(clef: Clef): PatternCard[] {
  const [low, high] = PATTERN_RANGE[clef];
  const out: PatternCard[] = [];
  for (let octave = 1; octave <= 6; octave++) {
    for (let letter = 0; letter < 7; letter++) {
      const lowKey = pitchOf(letter, 0, octave);
      if (lowKey < low) continue;
      for (let number = 2; number <= 8; number++) {
        const upLetter = (letter + number - 1) % 7;
        const upOctave = octave + Math.floor((letter + number - 1) / 7);
        const highKey = pitchOf(upLetter, 0, upOctave);
        if (highKey > high) continue;
        const a: SpelledNote = { key: lowKey, letter, alter: 0 };
        const b: SpelledNote = { key: highKey, letter: upLetter, alter: 0 };
        const name = intervalName(number, highKey - lowKey);
        out.push(card("interval", clef, [a, b], true, name));
        out.push(card("interval", clef, [a, b], false, `${name}, subindo`));
        out.push(card("interval", clef, [b, a], false, `${name}, descendo`));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- tríades

/** Tônicas (letra, alteração) das tríades: tonalidades até 3 acidentes. */
const MAJOR_ROOTS: [number, number][] = [
  [0, 0],
  [4, 0],
  [1, 0],
  [5, 0],
  [3, 0],
  [6, -1],
  [2, -1], // Dó Sol Ré Lá Fá Si♭ Mi♭
];
const MINOR_ROOTS: [number, number][] = [
  [5, 0],
  [2, 0],
  [6, 0],
  [3, 1],
  [1, 0],
  [4, 0],
  [0, 0], // lá mi si fá# ré sol dó
];
const INVERSION = ["", ", 1ª inversão", ", 2ª inversão"];

/** Tríade grafada a partir da fundamental, em estado fundamental. */
function triadNotes(letter: number, alter: number, minor: boolean, octave: number): SpelledNote[] {
  const root = pitchOf(letter, alter, octave);
  const steps = [0, minor ? 3 : 4, 7];
  return steps.map((semi, i) => {
    const l = (letter + 2 * i) % 7;
    const o = octave + Math.floor((letter + 2 * i) / 7);
    const key = root + semi;
    return { key, letter: l, alter: key - pitchOf(l, 0, o) };
  });
}

export function triadPool(clef: Clef): PatternCard[] {
  const [low, high] = PATTERN_RANGE[clef];
  const out: PatternCard[] = [];
  for (const [roots, minor] of [
    [MAJOR_ROOTS, false],
    [MINOR_ROOTS, true],
  ] as const) {
    for (const [letter, alter] of roots) {
      for (let octave = 1; octave <= 6; octave++) {
        const base = triadNotes(letter, alter, minor, octave);
        for (let inv = 0; inv < 3; inv++) {
          // Inversão: as notas de baixo sobem uma oitava.
          const notes = base
            .map((n, i) => (i < inv ? { ...n, key: n.key + 12 } : n))
            .sort((a, b) => a.key - b.key);
          if (notes[0].key < low || notes[2].key > high) continue;
          const name = `${NAMES[letter]}${alter > 0 ? "#" : alter < 0 ? "♭" : ""} ${minor ? "menor" : "maior"}${INVERSION[inv]}`;
          out.push(card("triad", clef, notes, true, name));
        }
      }
    }
  }
  return out;
}

function card(
  kind: PatternKind,
  clef: Clef,
  notes: SpelledNote[],
  harmonic: boolean,
  name: string,
): PatternCard {
  const keys = notes.map((n) => n.key).join(":");
  const id =
    kind === "interval"
      ? `interval:${clef}:${keys}:${harmonic ? "harm" : "mel"}`
      : `triad:${clef}:${keys}`;
  return { id, kind, clef, notes, harmonic, name };
}

export function patternPool(kind: PatternKind, clefs: Clef[]): PatternCard[] {
  return clefs.flatMap((c) => (kind === "interval" ? intervalPool(c) : triadPool(c)));
}

// ------------------------------------------------------------- respostas

/**
 * Confere a resposta. Harmônico: as teclas tocadas juntas (em qualquer ordem)
 * são exatamente as do cartão. Melódico: as duas, na ordem.
 */
export function isCorrect(card: PatternCard, played: number[]): boolean {
  const target = card.notes.map((n) => n.key);
  if (!card.harmonic)
    return played.length === target.length && played.every((k, i) => k === target[i]);
  const a = [...new Set(played)].sort((x, y) => x - y);
  const b = [...target].sort((x, y) => x - y);
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

/** Melódico: a resposta já está errada antes de terminar? */
export const wrongSoFar = (card: PatternCard, played: number[]) =>
  !card.harmonic && played.some((k, i) => k !== card.notes[i]?.key);

export function newPatternState(id: string): PatternState {
  return { id, box: 1, seen: 0, correct: 0, totalMs: 0, lastSeen: null };
}

export function answerPattern(
  state: PatternState,
  correct: boolean,
  ms: number,
  now = Date.now(),
): PatternState {
  const box = !correct ? 1 : ms <= PATTERN_FAST_MS ? Math.min(5, state.box + 1) : state.box;
  return {
    ...state,
    box,
    seen: state.seen + 1,
    correct: state.correct + (correct ? 1 : 0),
    totalMs: state.totalMs + ms,
    lastSeen: now,
  };
}

/** Sorteia o próximo: caixas baixas (erros recentes) pesam mais; não repete o anterior. */
export function pickPattern(
  pool: PatternCard[],
  states: Map<string, PatternState>,
  previous: string | null,
  random: () => number = Math.random,
): PatternCard {
  const options = pool.length > 1 ? pool.filter((c) => c.id !== previous) : pool;
  const weights = options.map((c) => WEIGHTS[states.get(c.id)?.box ?? 1]);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = random() * total;
  for (let i = 0; i < options.length; i++) {
    r -= weights[i];
    if (r < 0) return options[i];
  }
  return options[options.length - 1];
}

