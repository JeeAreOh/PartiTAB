/**
 * Teoria musical do redutor para piano: tonalidade, acordes, distribuição
 * das vozes e encaixe nas 61 teclas. Sem dependência do alphaTab.
 */

/** Faixa do PSR-E463. */
export const LOWEST_KEY = 36;
export const HIGHEST_KEY = 96;

export const PITCH_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

const pc = (n: number) => ((n % 12) + 12) % 12;

// ------------------------------------------------------------- tonalidade

export interface Key {
  tonic: number; // classe de altura 0–11
  minor: boolean;
}

// Perfis de Krumhansl-Kessler.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a: number[], b: number[]) {
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/** Estima a tonalidade a partir do peso (duração) de cada classe de altura. */
export function estimateKey(weights: number[]): Key {
  let best: Key = { tonic: 0, minor: false };
  let bestScore = -Infinity;
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = weights.map((_, i) => weights[pc(i + tonic)]);
    for (const minor of [false, true]) {
      const score = correlation(rotated, minor ? MINOR_PROFILE : MAJOR_PROFILE);
      if (score > bestScore) {
        bestScore = score;
        best = { tonic, minor };
      }
    }
  }
  return best;
}

/** Tons fáceis para iniciantes: Dó, Sol e Fá (e as relativas Lá, Mi e Ré menor). */
const EASY_MAJOR = [0, 7, 5];
const EASY_MINOR = [9, 4, 2];

/** Menor transposição (em semitons, -6 a +5) que leva a um tom fácil. */
export function easyTransposition(key: Key): number {
  let best = 0;
  let bestCost = Infinity;
  for (const target of key.minor ? EASY_MINOR : EASY_MAJOR) {
    let shift = pc(target - key.tonic);
    if (shift > 5) shift -= 12;
    // Desempate: prefere Dó/Lá menor, depois descer.
    const cost =
      Math.abs(shift) + (target === 0 || target === 9 ? 0 : 0.1) + (shift > 0 ? 0.01 : 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = shift;
    }
  }
  return best;
}

/** Armadura (em quintas: -7 a 7) de uma tonalidade, preferindo menos acidentes. */
export function keySignatureOf(key: Key): number {
  const major = key.minor ? pc(key.tonic + 3) : key.tonic;
  // Dó, Ré♭, Ré, Mi♭, Mi, Fá, Fá#/Sol♭, Sol, Lá♭, Lá, Si♭, Si
  return [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5][major];
}

// ----------------------------------------------------------------- acordes

export type Quality = "major" | "minor" | "dim" | "sus4" | "sus2";

export interface Chord {
  root: number; // classe de altura
  quality: Quality;
}

const TEMPLATES: [Quality, number[]][] = [
  ["major", [0, 4, 7]],
  ["minor", [0, 3, 7]],
  ["dim", [0, 3, 6]],
  ["sus4", [0, 5, 7]],
  ["sus2", [0, 2, 7]],
];

const INTERVALS: Record<Quality, number[]> = Object.fromEntries(TEMPLATES) as Record<
  Quality,
  number[]
>;

/**
 * Acorde mais provável para os pesos por classe de altura. `bass` (classe da
 * nota mais grave) ajuda a decidir a fundamental. Quinta sozinha (power chord)
 * vira tríade maior. Sem notas, devolve null.
 */
export function detectChord(weights: number[], bass?: number): Chord | null {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return null;

  let best: Chord | null = null;
  let bestScore = -Infinity;
  for (let root = 0; root < 12; root++) {
    for (const [quality, intervals] of TEMPLATES) {
      const tones = intervals.map((i) => pc(root + i));
      const inside = tones.reduce((s, t) => s + weights[t], 0);
      // A fundamental precisa soar; a terça (ou o que a substitui) conta a favor.
      if (weights[root] === 0) continue;
      let score = inside - 0.6 * (total - inside);
      if (bass !== undefined && pc(bass) === root) score += 0.35 * total;
      // Sem terça soando (power chord), prefere maior às outras qualidades.
      if (weights[tones[1]] === 0) score -= quality === "major" ? 0.01 * total : 0.05 * total;
      // Sus e diminuto só quando claramente presentes.
      if (quality === "sus4" || quality === "sus2" || quality === "dim") score -= 0.1 * total;
      if (score > bestScore) {
        bestScore = score;
        best = { root, quality };
      }
    }
  }
  return best;
}

export function chordName(c: Chord): string {
  const suffix = { major: "", minor: "m", dim: "°", sus4: "sus4", sus2: "sus2" }[c.quality];
  return PITCH_NAMES[c.root] + suffix;
}

/**
 * Tríade em posição fechada (três notas dentro de uma oitava) entre `low` e
 * `high`. Escolhe a inversão mais próxima do acorde anterior, para a mão
 * esquerda se mexer pouco.
 */
export function voiceTriad(chord: Chord, previous: number[] | null, low = 48, high = 67): number[] {
  const tones = INTERVALS[chord.quality].map((i) => pc(chord.root + i));
  const target = previous && previous.length > 0 ? avg(previous) : (low + high - 7) / 2;
  let best: number[] = [];
  let bestCost = Infinity;
  for (let base = low; base <= high; base++) {
    if (!tones.includes(pc(base))) continue;
    // Empilha as outras duas notas acima da mais grave, dentro da oitava.
    const notes = [base];
    for (let n = base + 1; n < base + 12; n++) if (tones.includes(pc(n))) notes.push(n);
    if (notes.length !== 3 || notes[2] > high) continue;
    // Sem acorde anterior, prefere o estado fundamental (mais fácil de ler).
    const cost =
      previous && previous.length === 3
        ? notes.reduce((s, n, i) => s + Math.abs(n - previous[i]), 0)
        : Math.abs(avg(notes) - target) + (pc(base) === chord.root ? 0 : 1.5);
    if (cost < bestCost) {
      bestCost = cost;
      best = notes;
    }
  }
  return best;
}

/** Nota da classe `pitchClass` mais próxima de `near`, dentro de [low, high]. */
export function placeNote(pitchClass: number, near: number, low: number, high: number): number {
  let best = low + pc(pitchClass - low);
  for (let n = best; n <= high; n += 12) {
    if (Math.abs(n - near) < Math.abs(best - near)) best = n;
  }
  return best;
}

const avg = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

// --------------------------------------------------------- encaixe na faixa

/**
 * Deslocamento em oitavas que coloca o máximo de notas em [low, high],
 * desempatando pela mediana mais perto do centro da faixa.
 */
export function fitOctave(notes: number[], low: number, high: number): number {
  if (notes.length === 0) return 0;
  const sorted = [...notes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const center = (low + high) / 2;
  let best = 0;
  let bestKey: [number, number] = [Infinity, Infinity];
  for (let octaves = -4; octaves <= 4; octaves++) {
    const shift = octaves * 12;
    const outside = notes.filter((n) => n + shift < low || n + shift > high).length;
    const key: [number, number] = [outside, Math.abs(median + shift - center)];
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
      bestKey = key;
      best = shift;
    }
  }
  return best;
}

/** Dobra por oitavas uma nota que ficou fora de [low, high]. */
export function fold(note: number, low: number, high: number): number {
  let n = note;
  while (n < low) n += 12;
  while (n > high) n -= 12;
  return n;
}

// ---------------------------------------------------------- tempos fortes

/**
 * Divide o compasso em tempos fortes. Devolve o tamanho de cada grupo em
 * unidades do denominador: 4/4 → [2, 2], 3/4 → [3], 6/8 → [3, 3], 5/4 → [2, 3].
 */
export function strongBeats(numerator: number, denominator: number): number[] {
  if (numerator <= 0) return [];
  if (denominator >= 8 && numerator % 3 === 0 && numerator > 3) return Array(numerator / 3).fill(3);
  if (numerator === 3) return [3];
  if (numerator === 1) return [1];
  const groups: number[] = [];
  let left = numerator;
  while (left > 0) {
    if (left === 3) {
      groups.push(3);
      left = 0;
    } else {
      groups.push(2);
      left -= 2;
    }
  }
  return groups;
}

/**
 * Figura (valor do alphaTab: 1 semibreve, 2 mínima, 4 semínima...) e pontos
 * para `units` unidades de 1/`denominator`. Null se não couber numa figura só.
 */
export function figureFor(
  units: number,
  denominator: number,
): { duration: number; dots: number } | null {
  // Fração da semibreve: units/denominator = 1/d (simples) ou 3/(2d) (pontuada).
  for (const d of [1, 2, 4, 8, 16, 32]) {
    if (units * d === denominator) return { duration: d, dots: 0 };
    if (units * d * 2 === denominator * 3) return { duration: d, dots: 1 };
  }
  return null;
}

// ------------------------------------------------------------- dificuldade

export interface DifficultyInput {
  /** Instantes (ms) de cada nota a tocar, em ordem. */
  noteTimes: number[];
  /** Maior número de notas simultâneas. */
  maxChord: number;
  /** As duas mãos têm notas. */
  bothHands: boolean;
  /** Menor e maior nota. */
  range: [number, number];
}

/** Dificuldade de 1 a 5, pela densidade de notas, acordes, mãos e extensão. */
export function estimateDifficulty({
  noteTimes,
  maxChord,
  bothHands,
  range,
}: DifficultyInput): number {
  if (noteTimes.length < 2) return 1;
  const seconds = (noteTimes[noteTimes.length - 1] - noteTimes[0]) / 1000;
  const nps = seconds > 0 ? noteTimes.length / seconds : 0;
  let points = 0;
  if (nps > 1.5) points++;
  if (nps > 3) points++;
  if (nps > 5) points++;
  if (nps > 8) points++;
  if (bothHands) points++;
  if (maxChord >= 3) points++;
  if (range[1] - range[0] > 36) points++;
  return Math.min(5, Math.max(1, Math.round(1 + (points * 4) / 7)));
}
