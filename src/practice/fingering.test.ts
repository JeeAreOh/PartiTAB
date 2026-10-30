import { describe, expect, it } from "vitest";
import { fingerHand, fingerNotes } from "./fingering";

const C4 = 60;
const scale = [0, 2, 4, 5, 7, 9, 11, 12].map((d) => [C4 + d]);

describe("dedilhado", () => {
  it("cinco notas seguidas cabem na mão parada", () => {
    expect(
      fingerHand(
        [60, 62, 64, 65, 67].map((k) => [k]),
        "right",
      ).flat(),
    ).toEqual([1, 2, 3, 4, 5]);
    // Mão esquerda: do agudo para o grave é 1..5.
    expect(
      fingerHand(
        [67, 65, 64, 62, 60].map((k) => [k]),
        "left",
      ).flat(),
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it("escala de dó maior passa o polegar", () => {
    const f = fingerHand(scale, "right").flat();
    expect(f[0]).toBe(1);
    expect(f.filter((x) => x === 1).length).toBe(2);
    // Nunca o mesmo dedo em notas diferentes seguidas, e termina no 4 ou 5.
    for (let i = 1; i < f.length; i++) expect(f[i]).not.toBe(f[i - 1]);
    expect(f[f.length - 1]).toBeGreaterThanOrEqual(4);
  });

  it("acordes usam dedos crescentes e respeitam a abertura", () => {
    const [triad] = fingerHand([[64, 60, 67]], "right");
    expect(triad).toEqual([3, 1, 5]);
    const [octave] = fingerHand([[48, 60]], "left");
    expect(octave).toEqual([5, 1]);
  });

  it("nota repetida pode manter o dedo", () => {
    const f = fingerHand([[60], [60], [60]], "right").flat();
    expect(new Set(f).size).toBe(1);
  });

  it("evita o polegar em tecla preta numa nota solta", () => {
    const f = fingerHand([[61], [63], [66]], "right").flat();
    expect(f[0]).not.toBe(1);
  });

  it("mais de cinco notas: as que sobram ficam sem dedo", () => {
    const [big] = fingerHand([[60, 62, 64, 65, 67, 69]], "right");
    expect(big.filter((x) => x === 0)).toHaveLength(1);
  });

  it("separa as mãos e indexa por tempo e nota", () => {
    const map = fingerNotes([
      { key: 60, hand: "right", tick: 0 },
      { key: 62, hand: "right", tick: 480 },
      { key: 48, hand: "left", tick: 0 },
    ]);
    expect(map.get("0:60")).toBeDefined();
    expect(map.get("480:62")).toBeGreaterThan(map.get("0:60")!);
    expect(map.get("0:48")).toBeDefined();
  });
});
