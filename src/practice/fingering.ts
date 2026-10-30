/**
 * Dedilhado sugerido (1 = polegar … 5 = mínimo), calculado por programação
 * dinâmica sobre a sequência de notas de cada mão. É uma heurística: favorece
 * a mão parada, a passagem do polegar nas escalas e acordes sem esticar
 * demais. Em trechos difíceis vale conferir com um professor.
 */

import type { Hand } from "./timeline";

const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = (key: number) => BLACK.has(((key % 12) + 12) % 12);

/** Distância confortável (semitons) entre dois dedos, do menor para o maior. */
const REACH: Record<string, number> = {
  "1-2": 5,
  "1-3": 7,
  "1-4": 9,
  "1-5": 12,
  "2-3": 3,
  "2-4": 5,
  "2-5": 7,
  "3-4": 3,
  "3-5": 5,
  "4-5": 3,
};
/** Onde cada dedo cai, em semitons a partir do polegar, com a mão parada. */
const OFFSET = [0, 2, 4, 5, 7];

interface State {
  /** Dedos na ordem das notas (graves → agudas, já espelhadas na mão esquerda). */
  fingers: number[];
  /** Posição do polegar estimada (semitons). */
  pos: number;
  cost: number;
}

function combos(n: number): number[][] {
  const out: number[][] = [];
  const pick = (start: number, acc: number[]) => {
    if (acc.length === n) return void out.push(acc);
    for (let f = start; f <= 5; f++) pick(f + 1, [...acc, f]);
  };
  pick(1, []);
  return out;
}
const COMBOS = [[], ...[1, 2, 3, 4, 5].map(combos)];

/** Custo de tocar as notas (espelhadas) com esses dedos, sem contar a nota anterior. */
function shapeCost(keys: number[], fingers: number[], original: number[]): number {
  let cost = 0;
  for (let i = 0; i < keys.length; i++) {
    const black = isBlack(original[i]);
    if (black && fingers[i] === 1) cost += keys.length > 1 ? 1 : 2;
    if (black && fingers[i] === 5) cost += 1;
    if (i > 0) {
      const span = keys[i] - keys[i - 1];
      const reach = REACH[`${fingers[i - 1]}-${fingers[i]}`];
      if (span > reach) cost += (span - reach) * 3;
      // Dedos vizinhos muito apertados também incomodam.
      const ideal = OFFSET[fingers[i] - 1] - OFFSET[fingers[i - 1] - 1];
      cost += Math.abs(span - ideal) * 0.25;
    }
  }
  return cost;
}

const crossCost = (finger: number) => (finger === 3 || finger === 4 ? 1.5 : finger === 2 ? 3.5 : 8);

function moveCost(prev: State, keysPrev: number[], next: number[], fingers: number[], pos: number) {
  let cost = 0;
  // Mão parada é o mais confortável; deslocar um pouco quase não custa.
  const move = Math.abs(pos - prev.pos);
  cost += move * 0.15 + (move > 2 ? (move - 2) * 0.9 : 0);
  // Regras de passagem entre duas notas soltas.
  if (keysPrev.length === 1 && next.length === 1) {
    const d = next[0] - keysPrev[0];
    const f1 = prev.fingers[0];
    const f2 = fingers[0];
    if (d === 0) cost += f1 === f2 ? 0 : 0.3;
    else if (f1 === f2) cost += 6;
    // Polegar passa por baixo do 3 ou 4 (do 2 é raro); os outros não cruzam.
    else if (d > 0 && f2 < f1) cost += f2 === 1 ? crossCost(f1) : 8;
    else if (d < 0 && f2 > f1) cost += f1 === 1 ? crossCost(f2) : 8;
  }
  return cost;
}

/**
 * Dedilhado de uma mão. `events` são as notas de cada momento (qualquer
 * ordem); devolve, para cada evento, o dedo de cada nota na mesma ordem.
 * Acima de 5 notas simultâneas, as que sobram ficam com 0 (sem sugestão).
 */
export function fingerHand(events: number[][], hand: Hand): number[][] {
  // Na mão esquerda, espelha as alturas: o polegar fica do lado agudo.
  const mirror = (k: number) => (hand === "right" ? k : -k);
  const layers: { order: number[]; keys: number[]; states: State[]; back: number[] }[] = [];

  for (const ev of events) {
    const order = ev
      .map((k, i) => ({ k: mirror(k), i }))
      .sort((a, b) => a.k - b.k)
      .slice(0, 5);
    const keys = order.map((o) => o.k);
    const original = order.map((o) => ev[o.i]);
    const prevLayer = layers[layers.length - 1];
    const states: State[] = [];
    const back: number[] = [];
    if (keys.length === 0) {
      layers.push({ order: [], keys, states: prevLayer?.states ?? [], back: [] });
      continue;
    }
    for (const fingers of COMBOS[keys.length]) {
      const pos = keys.reduce((sum, k, i) => sum + k - OFFSET[fingers[i] - 1], 0) / keys.length;
      const shape = shapeCost(keys, fingers, original);
      let best = Infinity;
      let from = -1;
      if (!prevLayer || prevLayer.states.length === 0) best = 0;
      else {
        // Evento vazio repete os estados anteriores; volta até um com notas.
        let ref = layers.length - 1;
        while (ref > 0 && layers[ref].keys.length === 0) ref--;
        const refKeys = layers[ref].keys;
        prevLayer.states.forEach((p, j) => {
          const c = p.cost + moveCost(p, refKeys, keys, fingers, pos);
          if (c < best) {
            best = c;
            from = j;
          }
        });
      }
      states.push({ fingers, pos, cost: best + shape });
      back.push(from);
    }
    layers.push({ order: order.map((o) => o.i), keys, states, back });
  }

  // Caminho de menor custo, de trás para frente.
  const result: number[][] = events.map((ev) => ev.map(() => 0));
  let idx = -1;
  for (let l = layers.length - 1; l >= 0; l--) {
    const layer = layers[l];
    if (layer.keys.length === 0) continue;
    if (idx === -1) {
      idx = layer.states.reduce((b, s, i, all) => (s.cost < all[b].cost ? i : b), 0);
    }
    const state = layer.states[idx];
    layer.order.forEach((orig, i) => (result[l][orig] = state.fingers[i]));
    idx = layer.back[idx];
    if (idx === -1) {
      // Começo de outro trecho independente (não deveria acontecer no meio).
      idx = -1;
    }
  }
  return result;
}

export interface FingeredNote {
  key: number;
  hand: Hand;
  tick: number;
}

/** Dedos por nota (`tick:key`) para notas das duas mãos. */
export function fingerNotes(notes: FingeredNote[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const hand of ["right", "left"] as const) {
    const byTick = new Map<number, number[]>();
    for (const n of notes) {
      if (n.hand !== hand) continue;
      const list = byTick.get(n.tick) ?? [];
      if (!list.includes(n.key)) list.push(n.key);
      byTick.set(n.tick, list);
    }
    const ticks = [...byTick.keys()].sort((a, b) => a - b);
    const events = ticks.map((t) => byTick.get(t)!);
    const fingers = fingerHand(events, hand);
    ticks.forEach((t, i) =>
      events[i].forEach((k, j) => fingers[i][j] && out.set(`${t}:${k}`, fingers[i][j])),
    );
  }
  return out;
}
