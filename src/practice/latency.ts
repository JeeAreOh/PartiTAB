/**
 * Calibração do atraso: o aluno toca junto com cliques de metrônomo e a
 * diferença típica entre o clique e a tecla vira a compensação da correção.
 * Ela inclui o atraso da saída de som, o do teclado até o app e o costume do
 * próprio aluno de tocar um pouco antes ou depois.
 */

/** Diferença máxima entre clique e toque para contar como resposta àquele clique. */
export const MAX_TAP_DIFF_MS = 250;
/** Toques válidos necessários para confiar na medida. */
export const MIN_TAPS = 6;
/** Limites da compensação (ms). */
export const MIN_LATENCY = -100;
export const MAX_LATENCY = 300;

export interface Calibration {
  /** Atraso medido (ms; positivo = o toque chega depois do clique). */
  offset: number;
  /** Dispersão (desvio absoluto mediano, ms): quanto os toques variaram. */
  spread: number;
  /** Toques que entraram na conta. */
  used: number;
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Casa cada toque com o clique mais próximo (um toque por clique) e devolve a
 * mediana das diferenças, ou null com poucos toques válidos.
 */
export function estimateLatency(clicks: number[], taps: number[]): Calibration | null {
  const byClick = new Map<number, number>();
  for (const tap of taps) {
    let best = -1;
    for (let i = 0; i < clicks.length; i++) {
      if (best === -1 || Math.abs(clicks[i] - tap) < Math.abs(clicks[best] - tap)) best = i;
    }
    if (best === -1) continue;
    const diff = tap - clicks[best];
    // Toque duplo no mesmo clique: fica o mais próximo.
    const prev = byClick.get(best);
    if (
      Math.abs(diff) <= MAX_TAP_DIFF_MS &&
      (prev === undefined || Math.abs(diff) < Math.abs(prev))
    ) {
      byClick.set(best, diff);
    }
  }
  const diffs = [...byClick.values()];
  if (diffs.length < MIN_TAPS) return null;
  const offset = median(diffs);
  return {
    offset: Math.round(offset),
    spread: Math.round(median(diffs.map((d) => Math.abs(d - offset)))),
    used: diffs.length,
  };
}

export const clampLatency = (ms: number) =>
  Math.min(MAX_LATENCY, Math.max(MIN_LATENCY, Math.round(ms)));

/** Lê a compensação salva (0 sem calibração ou valor inválido). */
export function parseLatency(raw: string | null): number {
  const n = Number(raw);
  return raw !== null && raw.trim() !== "" && Number.isFinite(n) ? clampLatency(n) : 0;
}
