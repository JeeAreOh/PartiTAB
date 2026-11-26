/** Resultado de uma linha de ritmo: desvio médio e compassos mais imprecisos. */

export interface RhythmResult {
  takenAt: number;
  level: number;
  /** Média do desvio absoluto (ms) das notas tocadas. */
  deviationMs: number | null;
  accuracy: number;
}

export function timingSummary(timings: { bar: number; deltaMs: number }[], worst = 2) {
  if (!timings.length) return { deviationMs: null, worstBars: [] as number[] };
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const deviationMs = Math.round(mean(timings.map((t) => Math.abs(t.deltaMs))));
  const byBar = new Map<number, number[]>();
  for (const t of timings) byBar.set(t.bar, [...(byBar.get(t.bar) ?? []), Math.abs(t.deltaMs)]);
  const worstBars = [...byBar.entries()]
    .map(([bar, xs]) => ({ bar, dev: mean(xs) }))
    .filter((b) => b.dev > 40)
    .sort((a, b) => b.dev - a.dev || a.bar - b.bar)
    .slice(0, worst)
    .map((b) => b.bar)
    .sort((a, b) => a - b);
  return { deviationMs, worstBars };
}

const KEY = "partitab.rhythm";

export function loadRhythmResults(): RhythmResult[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveRhythmResult(r: RhythmResult) {
  const list = [r, ...loadRhythmResults()].slice(0, 100);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* só perde o histórico */
  }
}

/** Desvio médio das últimas `n` linhas (null sem nenhuma). */
export function recentDeviation(results: RhythmResult[], n = 10): number | null {
  const list = results.filter((r) => r.deviationMs !== null).slice(0, n);
  if (!list.length) return null;
  return Math.round(list.reduce((s, r) => s + r.deviationMs!, 0) / list.length);
}
