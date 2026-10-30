import { describe, expect, it } from "vitest";
import { addSyncPoint, nearestBar, startPoint, youtubeId, type BarLookup } from "./sync";

// Compassos 0,1,2 com repetição de 1–2 (ordem tocada: 0 1 2 1 2 3).
const bars: BarLookup[] = [0, 1, 2, 1, 2, 3].map((index, i) => ({
  start: i * 3840,
  end: (i + 1) * 3840,
  masterBar: { index },
}));

describe("nearestBar", () => {
  it("acha o início de compasso mais próximo, contando repetições", () => {
    expect(nearestBar(bars, 100)).toEqual({ barIndex: 0, barOccurence: 0 });
    expect(nearestBar(bars, 3700)).toEqual({ barIndex: 1, barOccurence: 0 });
    expect(nearestBar(bars, 3 * 3840 + 200)).toEqual({ barIndex: 1, barOccurence: 1 });
    expect(nearestBar([], 0)).toBeNull();
  });
});

describe("addSyncPoint", () => {
  const p = (barIndex: number, barOccurence: number, ms: number) => ({
    barIndex,
    barOccurence,
    barPosition: 0,
    millisecondOffset: ms,
  });

  it("mantém os pontos em ordem de execução e substitui o mesmo compasso", () => {
    let points = [startPoint(1200)];
    points = addSyncPoint(bars, points, p(2, 0, 6000));
    points = addSyncPoint(bars, points, p(1, 1, 9000));
    points = addSyncPoint(bars, points, p(1, 0, 3500));
    expect(points.map((x) => [x.barIndex, x.barOccurence])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [1, 1],
    ]);
    points = addSyncPoint(bars, points, p(1, 0, 3600));
    expect(points.find((x) => x.barIndex === 1 && x.barOccurence === 0)?.millisecondOffset).toBe(
      3600,
    );
    expect(points).toHaveLength(4);
  });

  it("descarta pontos que ficariam fora de ordem no tempo", () => {
    const points = addSyncPoint(bars, [startPoint(1000), p(2, 0, 6000)], p(1, 0, 7000));
    // O compasso 1 marcado depois do 2 invalida o 2.
    expect(points.map((x) => x.barIndex)).toEqual([0, 1]);
  });

  it("primeira marcação nunca é negativa", () => {
    expect(startPoint(-30).millisecondOffset).toBe(0);
  });
});

describe("youtubeId", () => {
  it("entende os formatos de link", () => {
    const id = "dQw4w9WgXcQ";
    for (const link of [
      `https://www.youtube.com/watch?v=${id}&t=42s`,
      `https://youtu.be/${id}?si=abc`,
      `youtube.com/shorts/${id}`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://music.youtube.com/watch?v=${id}&list=x`,
      `https://www.youtube.com/embed/${id}`,
      id,
    ]) {
      expect(youtubeId(link), link).toBe(id);
    }
    expect(youtubeId("https://vimeo.com/123")).toBeNull();
    expect(youtubeId("nada")).toBeNull();
  });
});
