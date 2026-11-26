/**
 * Melodia da leitura à primeira vista: passeio por graus da escala com pesos
 * por intervalo, nota do acorde nos tempos fortes e cadência no fim
 * (2.º ou 7.º grau e depois a tônica).
 */

import type { KeySig, Level, Meter } from "./levels";
import type { Duration } from "./rhythm";
import { weighted, type Random } from "../util/random";

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

export const mod = (n: number, m: number) => ((n % m) + m) % m;

export interface KeyContext {
  key: KeySig;
  tonicPc: number;
  scale: number[];
}

export function keyContext(key: KeySig): KeyContext {
  const major = mod(key.fifths * 7, 12);
  return { key, tonicPc: key.minor ? mod(major + 9, 12) : major, scale: key.minor ? MINOR : MAJOR };
}

/**
 * Altura do grau `d` (0 = tônica perto do dó central; 7 = uma oitava acima).
 * No menor, a sensível (e o 6.º grau junto dela) sobe quando o acorde é o V.
 */
export function degreePitch(ctx: KeyContext, d: number, raise = false): number {
  const base = 60 + ctx.tonicPc - (ctx.tonicPc > 6 ? 12 : 0);
  const step = mod(d, 7);
  let pitch = base + ctx.scale[step] + 12 * Math.floor(d / 7);
  if (raise && ctx.key.minor && (step === 6 || step === 5)) pitch += 1;
  return pitch;
}

/** Graus cujas alturas ficam dentro de [low, high]. */
export function degreesIn(ctx: KeyContext, [low, high]: [number, number]): number[] {
  const out: number[] = [];
  for (let d = -21; d <= 28; d++) {
    const p = degreePitch(ctx, d);
    if (p >= low && p <= high) out.push(d);
  }
  return out;
}

export const isChordTone = (d: number, root: number) => [0, 2, 4].includes(mod(d - root, 7));

/** Tempo forte: início do compasso, e o meio do 4/4 e do 6/8. */
export function isStrong(offset: number, meter: Meter): boolean {
  if (offset === 0) return true;
  if (meter === "4/4") return offset === 24;
  if (meter === "6/8") return offset === 18;
  return false;
}

export interface MelodyNote {
  start: number;
  end: number;
  /** null = pausa. */
  degree: number | null;
  pitch: number | null;
  /** Ligada à nota anterior (mesma altura, por cima da barra). */
  tie?: boolean;
  bar: number;
}

export interface MelodyOptions {
  ctx: KeyContext;
  level: Level;
  meter: Meter;
  range: [number, number];
  /** Ritmo de cada compasso. */
  bars: Duration[][];
  /** Grau da fundamental do acorde de cada compasso. */
  chords: number[];
  /** "melody": termina 2.º/7.º → tônica; "bass": 5.º → tônica. */
  cadence?: "melody" | "bass";
  moves?: number[];
  maxLeap?: number;
  ties?: boolean;
  chromatic?: boolean;
}

/** Gera a linha; null quando o passeio fica sem saída (o gerador tenta outra semente). */
export function generateMelody(random: Random, o: MelodyOptions): MelodyNote[] | null {
  const moves = o.moves ?? o.level.moves;
  const maxLeap = o.maxLeap ?? o.level.maxLeap;
  const allowed = degreesIn(o.ctx, o.range);
  if (!allowed.length) return null;
  const barLen = o.bars[0].reduce((s, d) => s + d.length, 0);

  // Lista plana das figuras, com o compasso e a posição.
  const slots: MelodyNote[] = [];
  o.bars.forEach((bar, b) => {
    let pos = b * barLen;
    for (const d of bar) {
      slots.push({ start: pos, end: pos + d.length, degree: null, pitch: null, bar: b });
      pos += d.length;
      if (!d.rest) slots[slots.length - 1].degree = NaN; // a preencher
    }
  });
  const notes = slots.filter((s) => Number.isNaN(s.degree));
  if (notes.length < 2) return null;
  const last = notes.length - 1;
  const cadence = o.cadence ?? "melody";

  let prev: number | null = null;
  let repeats = 0;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const root = o.chords[n.bar];
    const strong = isStrong(n.start - n.bar * barLen, o.meter);
    const near = (d: number) => prev === null || Math.abs(d - prev) <= maxLeap;
    let choice: number | undefined;

    if (i === last) {
      choice = closest(
        allowed.filter((d) => mod(d, 7) === 0 && near(d)),
        prev,
      );
    } else if (i === last - 1) {
      const targets = cadence === "melody" ? [1, 6] : [4];
      const ok = allowed.filter(
        (d) =>
          targets.includes(mod(d, 7)) &&
          near(d) &&
          allowed.some((t) => mod(t, 7) === 0 && Math.abs(t - d) <= maxLeap),
      );
      choice = closest(ok, prev, random);
    } else if (prev === null) {
      // Começa numa nota do acorde de tônica, de preferência no meio da extensão.
      const tones = allowed.filter((d) => isChordTone(d, root));
      const mid = (allowed[0] + allowed[allowed.length - 1]) / 2;
      choice = tones.length
        ? tones[
            weighted(
              random,
              tones.map((d) => 1 / (1 + Math.abs(d - mid))),
            )
          ]
        : allowed[0];
    } else if (
      (o.ties ?? o.level.ties) &&
      n.start === n.bar * barLen &&
      i > 0 &&
      notes[i - 1].end === n.start &&
      n.bar < o.bars.length - 1 &&
      isChordTone(prev, root) &&
      random() < 0.15
    ) {
      n.tie = true;
      choice = prev;
    } else {
      const options = allowed.filter(near);
      let weights = options.map((d) => {
        const step = Math.abs(d - prev!);
        if (step === 0 && repeats >= 1) return 0;
        return moves[step] ?? 0;
      });
      if (strong) {
        const chordWeights = weights.map((w, k) => (isChordTone(options[k], root) ? w : 0));
        if (chordWeights.some((w) => w > 0)) weights = chordWeights;
      }
      // Deixa a cadência alcançável: nos últimos passos, nada longe da tônica.
      if (i >= last - 2) {
        weights = weights.map((w, k) =>
          allowed.some((t) => mod(t, 7) === 0 && Math.abs(t - options[k]) <= 2 * maxLeap) ? w : 0,
        );
      }
      if (!weights.some((w) => w > 0)) return null;
      choice = options[weighted(random, weights)];
    }

    if (choice === undefined) return null;
    repeats = prev === choice ? repeats + 1 : 0;
    n.degree = choice;
    prev = choice;
  }

  // Alturas: no menor, sensível elevada no compasso do V e na penúltima nota.
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const raise =
      o.ctx.key.minor &&
      (mod(o.chords[n.bar], 7) === 4 || (i === last - 1 && mod(n.degree!, 7) === 6));
    n.pitch = degreePitch(o.ctx, n.degree!, raise);
  }
  // Ligadura: mesma altura da nota anterior, mesmo se o acorde mudou.
  for (let i = 1; i < notes.length; i++) if (notes[i].tie) notes[i].pitch = notes[i - 1].pitch;

  // Acidente ocorrente: nota fraca que sobe um tom inteiro por grau conjunto
  // vira cromática (sobe meio tom), como uma bordadura ou passagem.
  if (o.chromatic ?? o.level.chromatic) {
    for (let i = 1; i < last - 1; i++) {
      const n = notes[i];
      const next = notes[i + 1];
      if (n.tie || next.tie || isStrong(n.start - n.bar * barLen, o.meter)) continue;
      if (next.degree! - n.degree! !== 1 || next.pitch! - n.pitch! !== 2) continue;
      if (random() < 0.2) n.pitch! += 1;
    }
  }
  return slots;
}

/** O grau mais perto do anterior (empate decidido ao acaso). */
function closest(options: number[], prev: number | null, random?: Random): number | undefined {
  if (!options.length) return undefined;
  if (prev === null) return options[0];
  const best = Math.min(...options.map((d) => Math.abs(d - prev)));
  const ties = options.filter((d) => Math.abs(d - prev) === best);
  return random ? ties[Math.floor(random() * ties.length)] : ties[0];
}
