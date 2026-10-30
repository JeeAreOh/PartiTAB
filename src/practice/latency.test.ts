import { describe, expect, it } from "vitest";
import { clampLatency, estimateLatency, parseLatency } from "./latency";

const clicks = Array.from({ length: 16 }, (_, i) => 1000 + i * 600);

describe("calibração do atraso", () => {
  it("mede a diferença típica entre clique e toque", () => {
    const taps = clicks.map((c, i) => c + 80 + (i % 3) * 10 - 10);
    const r = estimateLatency(clicks, taps)!;
    expect(r.offset).toBe(80);
    expect(r.used).toBe(16);
    expect(r.spread).toBeLessThanOrEqual(10);
  });

  it("ignora toques soltos e toques duplos", () => {
    const taps = [...clicks.slice(0, 8).map((c) => c + 60), 1300, clicks[0] + 200, clicks[1] + 62];
    const r = estimateLatency(clicks, taps)!;
    expect(r.offset).toBe(60);
    expect(r.used).toBe(8);
  });

  it("aceita toques adiantados", () => {
    expect(
      estimateLatency(
        clicks,
        clicks.map((c) => c - 30),
      )!.offset,
    ).toBe(-30);
  });

  it("precisa de toques suficientes", () => {
    expect(
      estimateLatency(
        clicks,
        clicks.slice(0, 5).map((c) => c + 50),
      ),
    ).toBeNull();
    expect(estimateLatency([], [1, 2, 3])).toBeNull();
  });

  it("limita e lê o valor salvo", () => {
    expect(clampLatency(999)).toBe(300);
    expect(clampLatency(-500)).toBe(-100);
    expect(parseLatency(null)).toBe(0);
    expect(parseLatency("abc")).toBe(0);
    expect(parseLatency("85")).toBe(85);
  });
});
