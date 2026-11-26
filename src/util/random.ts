/** Gerador pseudoaleatório com semente (mulberry32): mesma semente, mesma sequência. */
export type Random = () => number;

export function mulberry32(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Um item da lista, ao acaso. */
export const pick = <T>(random: Random, list: readonly T[]): T =>
  list[Math.floor(random() * list.length)];

/** Índice sorteado com pesos (pesos ≤ 0 nunca saem). */
export function weighted(random: Random, weights: readonly number[]): number {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) return 0;
  let r = random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r < 0) return i;
  }
  return weights.length - 1;
}
