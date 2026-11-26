import { describe, expect, it } from "vitest";
import { mulberry32, weighted } from "./random";

describe("mulberry32", () => {
  it("repete a sequência com a mesma semente", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(xs[0]);
  });

  it("sorteio com pesos respeita zeros", () => {
    const r = mulberry32(1);
    for (let i = 0; i < 100; i++) expect(weighted(r, [0, 1, 0])).toBe(1);
  });
});
