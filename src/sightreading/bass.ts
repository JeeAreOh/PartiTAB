/**
 * Mão esquerda da leitura à primeira vista: notas longas, intervalos,
 * tríades (em bloco ou Alberti) ou uma segunda voz, conforme o nível.
 */

import { voiceTriad, type Chord } from "../reducer/harmony";
import { pick, type Random } from "../util/random";
import type { Level, Meter } from "./levels";
import { barLength } from "./levels";
import { degreePitch, generateMelody, mod, type KeyContext, type MelodyNote } from "./melody";
import { longBar, randomBar, type Duration } from "./rhythm";

export interface BassEvent {
  start: number;
  end: number;
  pitches: number[];
}

/** Altura da classe `pc` mais perto de `near`, dentro de [low, high]. */
function place(pc: number, near: number, low: number, high: number): number {
  let best = -1;
  for (let p = low; p <= high; p++) {
    if (mod(p, 12) !== mod(pc, 12)) continue;
    if (best < 0 || Math.abs(p - near) < Math.abs(best - near)) best = p;
  }
  return best;
}

/** Classe de altura do grau `d` da escala (com a sensível no V do menor). */
const pcOf = (ctx: KeyContext, root: number, d: number) =>
  mod(degreePitch(ctx, d, mod(root, 7) === 4), 12);

/** Tríade do grau `root`, como acorde (fundamental e qualidade). */
export function chordOf(ctx: KeyContext, root: number): Chord {
  const [a, b, c] = [0, 2, 4].map((i) => pcOf(ctx, root, root + i));
  const third = mod(b - a, 12);
  const fifth = mod(c - a, 12);
  return { root: a, quality: fifth === 6 ? "dim" : third === 3 ? "minor" : "major" };
}

export interface BassOptions {
  ctx: KeyContext;
  level: Level;
  meter: Meter;
  range: [number, number];
  chords: number[];
}

/** Acompanhamento de notas longas, intervalos ou tríades. */
export function accompaniment(random: Random, o: BassOptions): BassEvent[] | null {
  const kind = o.level.left;
  const barLen = barLength(o.meter);
  const [low, high] = o.range;
  const out: BassEvent[] = [];
  let near = Math.round((low + high) / 2) - 4;
  let previous: number[] | null = null;
  const alberti = kind === "chords" && random() < 0.5;
  const last = o.chords.length - 1;

  for (let b = 0; b <= last; b++) {
    const root = o.chords[b];
    const start = b * barLen;
    const durations: Duration[] =
      b === last ? [{ length: barLen, rest: false }] : longBar(random, o.meter);
    const rootPc = pcOf(o.ctx, root, root);
    const fifthPc = pcOf(o.ctx, root, root + 4);
    const thirdPc = pcOf(o.ctx, root, root + 2);

    if (kind === "chords") {
      const triad = voiceTriad(
        chordOf(o.ctx, root),
        previous,
        Math.max(low, 43),
        Math.min(high, 62),
      );
      if (triad.length !== 3) return null;
      previous = triad;
      if (alberti && b !== last) {
        // Baixo de Alberti em colcheias: grave, aguda, média, aguda.
        const order = [triad[0], triad[2], triad[1], triad[2]];
        for (let k = 0; k < barLen / 6; k++) {
          out.push({ start: start + k * 6, end: start + (k + 1) * 6, pitches: [order[k % 4]] });
        }
      } else {
        let pos = start;
        for (const d of durations) {
          out.push({ start: pos, end: pos + d.length, pitches: triad });
          pos += d.length;
        }
      }
      continue;
    }

    let pos = start;
    durations.forEach((d, k) => {
      const bass = place(rootPc, near, low, high - (kind === "intervals" ? 7 : 0));
      let pitches: number[];
      if (kind === "roots") {
        // Fundamental no tempo forte; na segunda nota, às vezes a quinta.
        const pc = k > 0 && random() < 0.5 ? fifthPc : rootPc;
        pitches = [place(pc, near, low, high)];
      } else {
        const upper = pick(random, b === last ? [fifthPc] : [fifthPc, fifthPc, thirdPc]);
        const top = place(upper, bass + 5, bass + 1, Math.min(high, bass + 9));
        pitches = top > bass ? [bass, top] : [bass];
      }
      if (pitches.some((p) => p < 0)) pitches = [];
      if (pitches.length) {
        out.push({ start: pos, end: pos + d.length, pitches });
        near = pitches[0];
      }
      pos += d.length;
    });
  }
  return out.every((e) => e.pitches.length) ? out : null;
}

/** Segunda voz independente (nível 7): ritmo mais simples, termina V → I. */
export function secondVoice(
  random: Random,
  o: BassOptions & { bars: number },
): MelodyNote[] | null {
  const barLen = barLength(o.meter);
  const easy = Math.min(4, o.level.level);
  const rhythm = Array.from({ length: o.bars }, (_, b) =>
    b === o.bars - 1
      ? [{ length: barLen, rest: false }]
      : b === o.bars - 2
        ? randomBar(random, o.meter, easy, "ending", false)
        : randomBar(random, o.meter, easy, "body", false),
  );
  return generateMelody(random, {
    ctx: o.ctx,
    level: o.level,
    meter: o.meter,
    range: o.range,
    bars: rhythm,
    chords: o.chords,
    cadence: "bass",
    moves: [3, 40, 25, 15, 12, 0, 0, 5],
    maxLeap: 7,
    ties: false,
    chromatic: false,
  });
}
