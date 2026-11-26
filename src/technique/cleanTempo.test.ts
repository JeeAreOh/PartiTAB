import { describe, expect, it } from "vitest";
import type { Attempt } from "../api";
import { cleanBpm, suggestFaster } from "./cleanTempo";
import type { Exercise } from "./exercises";

const ex: Exercise = {
  kind: "scale",
  tonic: 0,
  mode: "major",
  hands: "right",
  octaves: 1,
  figure: 8,
  bpm: 72,
};

const a = (playedAt: number, speed: number, accuracy: number, mode = "play", completed = true) =>
  ({ playedAt, speed, accuracy, mode, completed }) as Attempt;

describe("andamento limpo", () => {
  it("é o maior bpm × velocidade das execuções limpas", () => {
    expect(cleanBpm([], ex)).toBeNull();
    expect(
      cleanBpm(
        [
          a(1, 80, 98),
          a(2, 100, 90), // precisão baixa
          a(3, 100, 99, "wait"), // não é Tocar junto
          a(4, 100, 99, "play", false), // não terminou
          a(5, 90, 95),
        ],
        ex,
      ),
    ).toBe(65);
  });

  it("sugere +4 bpm depois de 3 execuções limpas seguidas a 100%", () => {
    const clean = [a(1, 100, 96), a(2, 100, 97), a(3, 100, 99)];
    expect(suggestFaster(clean, ex)).toBe(76);
    expect(suggestFaster(clean.slice(0, 2), ex)).toBeNull();
    expect(suggestFaster([...clean, a(4, 100, 80)], ex)).toBeNull();
    expect(suggestFaster([a(1, 100, 96), a(2, 100, 97), a(3, 90, 99)], ex)).toBeNull();
    // Execuções em Esperar não quebram a sequência.
    expect(suggestFaster([...clean, a(4, 100, 50, "wait")], ex)).toBe(76);
  });
});
