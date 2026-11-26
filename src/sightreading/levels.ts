/**
 * Níveis da leitura à primeira vista, alinhados aos meses do plano de estudo.
 * Só dados: o gerador lê daqui extensão, tonalidades, compassos, figuras,
 * saltos, tamanho e andamento.
 */

export type Meter = "2/4" | "3/4" | "4/4" | "6/8";

export interface KeySig {
  fifths: number;
  minor: boolean;
}

/** Como a mão esquerda participa. */
export type LeftHand =
  | "none" // só a mão direita
  | "alone" // só a mão esquerda (a melodia é dela)
  | "alternate" // a melodia passa de uma mão para a outra a cada compasso
  | "roots" // fundamental ou quinta em notas longas
  | "intervals" // intervalos harmônicos (duas notas juntas)
  | "chords" // tríades em bloco ou baixo de Alberti
  | "voice"; // segunda voz independente

export interface Level {
  level: number;
  /** Mês do plano em que o nível começa. */
  month: string;
  label: string;
  left: LeftHand;
  /** Extensão da melodia (MIDI, inclusive). Nos níveis 1–3, uma posição de cinco dedos. */
  melody: [number, number];
  /** Extensão da mão esquerda. */
  bass: [number, number];
  /** Posição fixa de cinco dedos (sem passagem de polegar). */
  fiveFinger: boolean;
  keys: KeySig[];
  meters: Meter[];
  /** Pesos dos movimentos da melodia, em graus: [repetição, 2ª, 3ª, 4ª, 5ª, 6ª, 7ª, 8ª]. */
  moves: number[];
  /** Maior salto permitido, em graus da escala (1 = 2ª, 4 = 5ª, 7 = 8ª). */
  maxLeap: number;
  /** Acidentes ocorrentes (nota cromática de passagem). */
  chromatic: boolean;
  /** Ligadura de uma nota por cima da barra de compasso. */
  ties: boolean;
  bars: number[];
  bpm: number;
}

const C = { fifths: 0, minor: false };
const G = { fifths: 1, minor: false };
const F = { fifths: -1, minor: false };
const D = { fifths: 2, minor: false };
const Bb = { fifths: -2, minor: false };
const A = { fifths: 3, minor: false };
const Eb = { fifths: -3, minor: false };
const am = { fifths: 0, minor: true };
const em = { fifths: 1, minor: true };
const dm = { fifths: -1, minor: true };
const bm = { fifths: 2, minor: true };
const gm = { fifths: -2, minor: true };
const fsm = { fifths: 3, minor: true };
const cm = { fifths: -3, minor: true };

export const LEVELS: Level[] = [
  {
    level: 1,
    month: "1",
    label: "Clave de sol, mão direita, posição de Dó",
    left: "none",
    melody: [60, 67],
    bass: [48, 55],
    fiveFinger: true,
    keys: [C],
    meters: ["4/4"],
    moves: [5, 70, 25],
    maxLeap: 2,
    chromatic: false,
    ties: false,
    bars: [4],
    bpm: 60,
  },
  {
    level: 2,
    month: "2",
    label: "Clave de fá, mão esquerda, com pausas",
    left: "alone",
    melody: [48, 55],
    bass: [48, 55],
    fiveFinger: true,
    keys: [C],
    meters: ["4/4", "3/4"],
    moves: [5, 70, 25],
    maxLeap: 2,
    chromatic: false,
    ties: false,
    bars: [4],
    bpm: 60,
  },
  {
    level: 3,
    month: "3",
    label: "Grande pauta, mãos alternadas, colcheias",
    left: "alternate",
    melody: [60, 67],
    bass: [48, 55],
    fiveFinger: true,
    keys: [C, G],
    meters: ["2/4", "3/4", "4/4"],
    moves: [5, 55, 25, 10, 5],
    maxLeap: 4,
    chromatic: false,
    ties: false,
    bars: [8],
    bpm: 60,
  },
  {
    level: 4,
    month: "4–5",
    label: "Mãos juntas: melodia e baixo em notas longas",
    left: "roots",
    melody: [60, 81],
    bass: [40, 57],
    fiveFinger: false,
    keys: [C, G, F],
    meters: ["3/4", "4/4"],
    moves: [5, 55, 25, 10, 5],
    maxLeap: 4,
    chromatic: false,
    ties: false,
    bars: [8],
    bpm: 66,
  },
  {
    level: 5,
    month: "6",
    label: "Intervalos na mão esquerda, 6/8 e acidentes",
    left: "intervals",
    melody: [60, 81],
    bass: [40, 60],
    fiveFinger: false,
    keys: [C, G, F],
    meters: ["3/4", "4/4", "6/8"],
    moves: [5, 50, 25, 10, 6, 4],
    maxLeap: 5,
    chromatic: true,
    ties: true,
    bars: [8],
    bpm: 66,
  },
  {
    level: 6,
    month: "7–8",
    label: "Tríades e Alberti, semicolcheias, tons menores",
    left: "chords",
    melody: [57, 84],
    bass: [36, 64],
    fiveFinger: false,
    keys: [C, G, F, D, Bb, am, em, dm],
    meters: ["2/4", "3/4", "4/4", "6/8"],
    moves: [4, 46, 24, 10, 7, 4, 2, 3],
    maxLeap: 7,
    chromatic: true,
    ties: true,
    bars: [12],
    bpm: 72,
  },
  {
    level: 7,
    month: "9–12",
    label: "Duas vozes, síncope e tercina",
    left: "voice",
    melody: [57, 86],
    bass: [36, 64],
    fiveFinger: false,
    keys: [C, G, F, D, Bb, A, Eb, am, em, dm, bm, gm, fsm, cm],
    meters: ["2/4", "3/4", "4/4", "6/8"],
    moves: [4, 44, 24, 10, 8, 4, 2, 4],
    maxLeap: 7,
    chromatic: true,
    ties: true,
    bars: [12, 16],
    bpm: 72,
  },
];

export const MAX_LEVEL = LEVELS.length;

export const levelOf = (n: number): Level =>
  LEVELS[Math.max(1, Math.min(MAX_LEVEL, Math.round(n))) - 1];

/** Duração do compasso em unidades (semínima = 12). */
export const barLength = (m: Meter) => {
  const [num, den] = m.split("/").map(Number);
  return (num * 48) / den;
};
