/**
 * Biblioteca de padrões rítmicos de um compasso, por fórmula de compasso e
 * pelo nível em que passam a valer. Usada pela leitura à primeira vista e
 * pelo treino de ritmo.
 *
 * Cada padrão é uma lista de figuras separadas por espaço (semínima = 12
 * unidades): w semibreve (48), h. mínima pontuada (36), h mínima (24),
 * q. semínima pontuada (18), q semínima (12), e colcheia (6), s semicolcheia
 * (3), t colcheia de tercina (4, sempre em grupos de três). "r" antes da
 * figura faz dela uma pausa: "rq" = pausa de semínima.
 */

import type { Meter } from "./levels";
import { barLength } from "./levels";
import { pick, type Random } from "../util/random";

const FIGURE: Record<string, number> = {
  w: 48,
  "h.": 36,
  h: 24,
  "q.": 18,
  q: 12,
  e: 6,
  s: 3,
  t: 4,
};

export interface Duration {
  length: number;
  rest: boolean;
}

interface Pattern {
  /** Primeiro nível em que o padrão aparece. */
  min: number;
  /** Último nível (para tirar padrões fáceis demais dos níveis altos). */
  max?: number;
  p: string;
}

/** Padrões comuns, por compasso. */
const BODY: Record<Meter, Pattern[]> = {
  "4/4": [
    { min: 1, max: 3, p: "w" },
    { min: 1, max: 5, p: "h h" },
    { min: 1, p: "q q h" },
    { min: 1, p: "h q q" },
    { min: 1, p: "q q q q" },
    { min: 1, p: "q h q" },
    { min: 2, p: "q q q rq" },
    { min: 2, p: "h q rq" },
    { min: 2, p: "q rq q q" },
    { min: 3, p: "e e q h" },
    { min: 3, p: "q e e q q" },
    { min: 3, p: "q q e e q" },
    { min: 3, p: "e e e e h" },
    { min: 3, p: "q q q e e" },
    { min: 4, p: "h. q" },
    { min: 4, p: "q h." },
    { min: 5, p: "q. e h" },
    { min: 5, p: "q. e q q" },
    { min: 5, p: "h q. e" },
    { min: 6, p: "s s s s q h" },
    { min: 6, p: "q s s s s h" },
    { min: 6, p: "e s s q q q" },
    { min: 6, p: "s s e q. e q" },
    { min: 7, p: "e q e h" },
    { min: 7, p: "q e q e q" },
    { min: 7, p: "t t t q h" },
    { min: 7, p: "q t t t h" },
    { min: 7, p: "t t t t t t h" },
  ],
  "3/4": [
    { min: 2, p: "h q" },
    { min: 2, p: "q h" },
    { min: 2, p: "q q q" },
    { min: 2, p: "q q rq" },
    { min: 2, p: "h rq" },
    { min: 3, p: "e e q q" },
    { min: 3, p: "q e e q" },
    { min: 3, p: "q q e e" },
    { min: 4, max: 5, p: "h." },
    { min: 5, p: "q. e q" },
    { min: 6, p: "s s s s q q" },
    { min: 6, p: "q e s s q" },
    { min: 7, p: "e q e q" },
    { min: 7, p: "t t t q q" },
    { min: 7, p: "q t t t q" },
  ],
  "2/4": [
    { min: 3, max: 4, p: "h" },
    { min: 3, p: "q q" },
    { min: 3, p: "e e q" },
    { min: 3, p: "q e e" },
    { min: 3, p: "q rq" },
    { min: 3, p: "e e e e" },
    { min: 5, p: "q. e" },
    { min: 6, p: "s s s s q" },
    { min: 6, p: "e s s q" },
    { min: 7, p: "e q e" },
    { min: 7, p: "t t t q" },
  ],
  "6/8": [
    { min: 5, p: "q. q." },
    { min: 5, p: "q e q e" },
    { min: 5, p: "q. q e" },
    { min: 5, p: "e e e q." },
    { min: 5, p: "q e e e e" },
    { min: 5, p: "q e rq." },
    { min: 6, p: "e e e e e e" },
    { min: 6, p: "s s e e q." },
    { min: 6, p: "q. s s s s e" },
    { min: 7, p: "e q q e" },
  ],
};

/** Fim de frase e último compasso: notas longas. */
const ENDING: Record<Meter, Pattern[]> = {
  "4/4": [
    { min: 1, p: "w" },
    { min: 1, p: "h h" },
    { min: 4, p: "q h." },
  ],
  "3/4": [
    { min: 2, p: "h." },
    { min: 2, p: "q h" },
  ],
  "2/4": [
    { min: 3, p: "h" },
    { min: 3, p: "q q" },
  ],
  "6/8": [
    { min: 5, p: "h." },
    { min: 5, p: "q. q." },
  ],
};

/** Notas longas para a mão esquerda de acompanhamento. */
const LONG: Record<Meter, string[]> = {
  "4/4": ["w", "h h"],
  "3/4": ["h."],
  "2/4": ["h"],
  "6/8": ["h.", "q. q."],
};

export function parsePattern(p: string): Duration[] {
  return p.split(/\s+/).map((tok) => {
    const rest = tok.startsWith("r");
    const fig = rest ? tok.slice(1) : tok;
    const length = FIGURE[fig];
    if (!length) throw new Error(`figura desconhecida: ${tok}`);
    return { length, rest };
  });
}

const available = (list: Pattern[], level: number, rests = true) =>
  list.filter((x) => x.min <= level && (x.max ?? 99) >= level && (rests || !x.p.includes("r")));

/** Todos os padrões do compasso válidos no nível (para os testes). */
export const patternsFor = (meter: Meter, level: number) =>
  [...available(BODY[meter], level), ...available(ENDING[meter], level)].map((x) => x.p);

/** Sorteia o ritmo de um compasso. */
export function randomBar(
  random: Random,
  meter: Meter,
  level: number,
  kind: "body" | "ending" = "body",
  rests = true,
): Duration[] {
  const list = available(kind === "body" ? BODY[meter] : ENDING[meter], level, rests);
  const fallback = available(ENDING[meter], 99);
  return parsePattern(pick(random, list.length ? list : fallback).p);
}

/** Compasso de notas longas (acompanhamento). */
export const longBar = (random: Random, meter: Meter): Duration[] =>
  parsePattern(pick(random, LONG[meter]));

/** O padrão preenche exatamente o compasso e as tercinas fecham no tempo. */
export function fitsBar(durations: Duration[], meter: Meter): boolean {
  const total = durations.reduce((s, d) => s + d.length, 0);
  if (total !== barLength(meter)) return false;
  let pos = 0;
  for (const d of durations) {
    if (d.length === 4 && pos % 12 === 0) {
      // Começo de um grupo de tercina: precisa caber no tempo.
      if (pos + 12 > total) return false;
    }
    pos += d.length;
  }
  return true;
}
