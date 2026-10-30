/**
 * Treino de leitura: cartões com uma nota na pauta e repetição espaçada
 * (caixas de Leitner). Notas certas e rápidas sobem de caixa e aparecem
 * menos; erradas voltam para a caixa 1.
 */

export type Clef = "treble" | "bass";
export type Range = "staff" | "ledger";

export interface CardState {
  clef: Clef;
  key: number;
  /** 1 (revê sempre) a 5 (já sabe). */
  box: number;
  seen: number;
  correct: number;
  totalMs: number;
  lastSeen: number | null;
}

export interface Card {
  clef: Clef;
  key: number;
  /** Grafia das teclas pretas. */
  accidental: "sharp" | "flat" | null;
}

/** Resposta em até este tempo conta como rápida (sobe de caixa). */
export const FAST_MS = 2500;
const WEIGHTS = [0, 16, 8, 4, 2, 1];

/** Primeira nota da linha de baixo: Mi4 na clave de sol, Sol2 na de fá. */
const BOTTOM_LINE: Record<Clef, number> = { treble: 30, bass: 18 };

const RANGES: Record<Clef, Record<Range, [number, number]>> = {
  // Só na pauta (linhas e espaços) / com até duas linhas suplementares.
  treble: { staff: [64, 77], ledger: [57, 84] },
  bass: { staff: [43, 57], ledger: [36, 64] },
};

const BLACK = new Set([1, 3, 6, 8, 10]);
/** Classe de altura → letra (0 = C) para teclas brancas. */
const LETTER: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
const NAMES = ["Dó", "Ré", "Mi", "Fá", "Sol", "Lá", "Si"];

export const cardId = (clef: Clef, key: number) => `${clef}:${key}`;

/** Notas do treino para a clave, a extensão e com ou sem acidentes. */
export function pool(clef: Clef, range: Range, accidentals: boolean): number[] {
  const [low, high] = RANGES[clef][range];
  const keys: number[] = [];
  for (let k = low; k <= high; k++) if (accidentals || !BLACK.has(k % 12)) keys.push(k);
  return keys;
}

/**
 * Posição na pauta em passos (linha ou espaço) acima da linha de baixo:
 * 0 = linha de baixo, 1 = primeiro espaço, 8 = linha de cima.
 */
export function staffStep(card: Card): number {
  const pc = card.key % 12;
  const octave = Math.floor(card.key / 12) - 1;
  let letter: number;
  const letterOctave = octave;
  if (!BLACK.has(pc)) letter = LETTER[pc];
  else if (card.accidental === "flat") {
    letter = LETTER[pc + 1];
  } else {
    letter = LETTER[pc - 1];
  }
  // Si sustenido/Dó bemol não aparecem (só teclas pretas recebem acidente).
  return letterOctave * 7 + letter - BOTTOM_LINE[card.clef];
}

/** Nome em português, ex.: "Fá#4", "Si♭3", "Dó4". */
export function noteName(card: Card): string {
  const pc = card.key % 12;
  const octave = Math.floor(card.key / 12) - 1;
  if (!BLACK.has(pc)) return `${NAMES[LETTER[pc]]}${octave}`;
  return card.accidental === "flat"
    ? `${NAMES[LETTER[pc + 1]]}♭${octave}`
    : `${NAMES[LETTER[pc - 1]]}#${octave}`;
}

export function newState(clef: Clef, key: number): CardState {
  return { clef, key, box: 1, seen: 0, correct: 0, totalMs: 0, lastSeen: null };
}

/** Sorteia o próximo cartão: caixas baixas pesam mais; evita repetir o anterior. */
export function pickNext(
  candidates: { clef: Clef; key: number }[],
  states: Map<string, CardState>,
  previous: string | null,
  random: () => number = Math.random,
): Card {
  const options =
    candidates.length > 1
      ? candidates.filter((c) => cardId(c.clef, c.key) !== previous)
      : candidates;
  const weights = options.map((c) => WEIGHTS[states.get(cardId(c.clef, c.key))?.box ?? 1]);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = random() * total;
  let chosen = options[options.length - 1];
  for (let i = 0; i < options.length; i++) {
    r -= weights[i];
    if (r < 0) {
      chosen = options[i];
      break;
    }
  }
  const black = BLACK.has(chosen.key % 12);
  return { ...chosen, accidental: black ? (random() < 0.5 ? "sharp" : "flat") : null };
}

/** Atualiza o cartão depois da resposta. */
export function answer(
  state: CardState,
  correct: boolean,
  ms: number,
  now = Date.now(),
): CardState {
  const box = !correct ? 1 : ms <= FAST_MS ? Math.min(5, state.box + 1) : state.box;
  return {
    ...state,
    box,
    seen: state.seen + 1,
    correct: state.correct + (correct ? 1 : 0),
    totalMs: state.totalMs + ms,
    lastSeen: now,
  };
}

/** Errou só a oitava (tocou a nota certa em outra altura). */
export const wrongOctave = (card: Card, key: number) =>
  key !== card.key && key % 12 === card.key % 12;
