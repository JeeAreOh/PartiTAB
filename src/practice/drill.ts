/**
 * Prática dirigida: rampa de andamento no loop A–B e escolha dos trechos com
 * mais erros.
 */

import type { BarStat } from "./engine";

// ------------------------------------------------------------------ rampa

export interface Ramp {
  /** Andamentos em %. */
  start: number;
  step: number;
  target: number;
}

export const DEFAULT_RAMP: Ramp = { start: 60, step: 5, target: 100 };

export interface PassResult {
  speed: number;
  /** Volta limpa já no andamento final: trecho dominado. */
  mastered: boolean;
}

/**
 * Depois de uma volta no trecho: limpa (sem erradas nem perdidas) sobe um
 * degrau, até o alvo; com erro, repete no mesmo andamento.
 */
export function afterPass(speed: number, clean: boolean, ramp: Ramp = DEFAULT_RAMP): PassResult {
  if (!clean) return { speed, mastered: false };
  if (speed >= ramp.target) return { speed: ramp.target, mastered: true };
  return { speed: Math.min(ramp.target, speed + ramp.step), mastered: false };
}

// ------------------------------------------------------- piores trechos

export interface Segment {
  /** Compassos (índices) de/até, inclusive. */
  from: number;
  to: number;
  /** Taxa de erro do pior compasso do trecho (0–1). */
  rate: number;
}

/** Taxa de erro de um compasso: erradas e perdidas valem 1, fora do tempo vale 0,5. */
export const errorRate = (b: BarStat) =>
  b.notes + b.errors === 0 ? 0 : Math.min(1, (b.errors + 0.5 * b.timing) / Math.max(b.notes, 1));

/**
 * Até `max` trechos com mais erros. Compassos vizinhos viram um trecho só;
 * compassos com menos de `minNotes` notas avaliadas ou taxa baixa ficam de fora.
 */
export function worstSegments(
  bars: Record<number, BarStat>,
  max = 3,
  minRate = 0.15,
  minNotes = 2,
): Segment[] {
  const bad = Object.entries(bars)
    .map(([bar, stat]) => ({
      bar: Number(bar),
      rate: errorRate(stat),
      notes: stat.notes,
    }))
    .filter((b) => b.notes >= minNotes && b.rate >= minRate)
    .sort((a, b) => a.bar - b.bar);

  const segments: Segment[] = [];
  for (const b of bad) {
    const last = segments[segments.length - 1];
    if (last && b.bar === last.to + 1) {
      last.to = b.bar;
      last.rate = Math.max(last.rate, b.rate);
    } else {
      segments.push({ from: b.bar, to: b.bar, rate: b.rate });
    }
  }
  return segments.sort((a, b) => b.rate - a.rate || a.from - b.from).slice(0, max);
}

/**
 * Cor do mapa de erros: um só tom, mais forte quanto maior a taxa de erro
 * (abaixo de 5% o compasso fica sem cor).
 */
export function heatColor(rate: number): string | null {
  if (rate < 0.05) return null;
  const alpha = 0.1 + 0.32 * Math.min(1, rate / 0.6);
  return `rgb(var(--heat) / ${alpha.toFixed(2)})`;
}

// --------------------------------------------- compassos ↔ pulsos

export interface BarLookup {
  start: number;
  end: number;
  masterBar: { index: number };
}

/** Pulsos do trecho de `from` até `to` (primeira vez que são tocados). */
export function barsToRange(
  bars: BarLookup[],
  from: number,
  to: number,
): { startTick: number; endTick: number } | null {
  const first = bars.findIndex((b) => b.masterBar.index === from);
  if (first === -1) return null;
  const last = bars.findIndex((b, i) => i >= first && b.masterBar.index === to);
  if (last === -1) return null;
  return { startTick: bars[first].start, endTick: bars[last].end };
}

/** Compassos (de/até) cobertos por um trecho em pulsos. */
export function rangeToBars(
  bars: BarLookup[],
  range: { startTick: number; endTick: number },
): { from: number; to: number } | null {
  const first = bars.find((b) => range.startTick >= b.start && range.startTick < b.end);
  const last = bars.find((b) => range.endTick > b.start && range.endTick <= b.end);
  return first && last ? { from: first.masterBar.index, to: last.masterBar.index } : null;
}
