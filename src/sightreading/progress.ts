import type { SightReadingResult } from "../api";

/** Precisão mínima (%) para passar no trecho. */
export const PASS_ACCURACY = 85;

export interface RunJudgement {
  passed: boolean;
  /** Compassos (a partir de 0) em que nenhuma nota saiu certa. */
  lostBars: number[];
}

/**
 * Passou: tocou até o fim, com precisão ≥ 85% e sem perder um compasso
 * inteiro (todas as notas do compasso erradas ou não tocadas).
 */
export function judgeRun(
  accuracy: number,
  finished: boolean,
  bars: Record<number, { notes: number; errors: number }>,
): RunJudgement {
  const lostBars = Object.entries(bars)
    .filter(([, b]) => b.notes > 0 && b.errors >= b.notes)
    .map(([bar]) => Number(bar))
    .sort((a, b) => a - b);
  return { passed: finished && accuracy >= PASS_ACCURACY && lostBars.length === 0, lostBars };
}

/**
 * Sugestão de nível (nunca automática): 5 aprovações nos últimos 6 trechos
 * do nível → subir; 3 reprovações seguidas → descer.
 */
export function suggestLevel(
  results: SightReadingResult[],
  level: number,
  maxLevel = 7,
): "up" | "down" | null {
  const mine = results.filter((r) => r.level === level).sort((a, b) => b.takenAt - a.takenAt);
  const last6 = mine.slice(0, 6);
  if (level < maxLevel && last6.length >= 5 && last6.filter((r) => r.passed).length >= 5)
    return "up";
  const last3 = mine.slice(0, 3);
  if (level > 1 && last3.length === 3 && last3.every((r) => !r.passed)) return "down";
  return null;
}

/** Maior nível aprovado e taxa de aprovação (%) dos últimos 20 trechos. */
export function sightStats(results: SightReadingResult[]) {
  const passed = results.filter((r) => r.passed);
  const maxPassed = passed.length ? Math.max(...passed.map((r) => r.level)) : null;
  const last20 = [...results].sort((a, b) => b.takenAt - a.takenAt).slice(0, 20);
  const passRate = last20.length
    ? Math.round((100 * last20.filter((r) => r.passed).length) / last20.length)
    : null;
  return { maxPassed, passRate, count: last20.length };
}

/** Nível para começar: o da última vez, ou 1. */
export function lastLevel(results: SightReadingResult[]): number {
  const latest = [...results].sort((a, b) => b.takenAt - a.takenAt)[0];
  return latest?.level ?? 1;
}
