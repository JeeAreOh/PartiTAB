/**
 * Pontos de sincronia entre um vídeo e a partitura. Cada ponto diz em que
 * milissegundo do vídeo começa um compasso; entre pontos o alphaTab estica o
 * andamento. Formato igual ao FlatSyncPoint do alphaTab.
 */

export interface SyncPoint {
  barIndex: number;
  /** Qual vez o compasso é tocado (repetições). */
  barOccurence: number;
  /** Posição dentro do compasso (0 = início). */
  barPosition: number;
  millisecondOffset: number;
}

export interface BarLookup {
  start: number;
  end: number;
  masterBar: { index: number };
}

/** Compasso (e repetição) cujo início está mais perto de `tick`. */
export function nearestBar(
  bars: BarLookup[],
  tick: number,
): { barIndex: number; barOccurence: number } | null {
  let best = -1;
  let bestDistance = Infinity;
  bars.forEach((b, i) => {
    const d = Math.abs(b.start - tick);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  if (best === -1) return null;
  const index = bars[best].masterBar.index;
  const occurrence = bars.slice(0, best).filter((b) => b.masterBar.index === index).length;
  return { barIndex: index, barOccurence: occurrence };
}

/** Ordem de execução de um ponto (para manter os tempos crescentes). */
function playOrder(bars: BarLookup[], p: SyncPoint) {
  let seen = 0;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].masterBar.index !== p.barIndex) continue;
    if (seen++ === p.barOccurence) return i;
  }
  return Infinity;
}

/**
 * Acrescenta (ou substitui) um ponto. Pontos que ficariam fora de ordem no
 * tempo com o novo são descartados: a marcação mais recente vale.
 */
export function addSyncPoint(
  bars: BarLookup[],
  points: SyncPoint[],
  point: SyncPoint,
): SyncPoint[] {
  const order = playOrder(bars, point);
  const kept = points.filter((p) => {
    if (p.barIndex === point.barIndex && p.barOccurence === point.barOccurence) return false;
    const o = playOrder(bars, p);
    return o < order
      ? p.millisecondOffset < point.millisecondOffset
      : p.millisecondOffset > point.millisecondOffset;
  });
  return [...kept, point].sort((a, b) => playOrder(bars, a) - playOrder(bars, b));
}

/** Primeira marcação: o compasso 1 começa neste instante do vídeo. */
export const startPoint = (ms: number): SyncPoint => ({
  barIndex: 0,
  barOccurence: 0,
  barPosition: 0,
  millisecondOffset: Math.max(0, Math.round(ms)),
});

/** Extrai o id do vídeo de um link do YouTube (ou aceita o id puro). */
export function youtubeId(input: string): string | null {
  const text = input.trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  let url: URL;
  try {
    url = new URL(text.startsWith("http") ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v");
    const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]{11})/);
    if (!id && m) id = m[2];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}
