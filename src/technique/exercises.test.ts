import { describe, expect, it } from "vitest";
import * as alphaTab from "@coderline/alphatab";
import {
  exerciseTitle,
  exerciseXml,
  TONICS_MAJOR,
  TONICS_MINOR,
  type Exercise,
} from "./exercises";
import { spelling } from "../midi/musicxml";

const base: Exercise = {
  kind: "scale",
  tonic: 0,
  mode: "major",
  hands: "both",
  octaves: 1,
  figure: 8,
  bpm: 80,
};

const load = (ex: Exercise) =>
  alphaTab.importer.ScoreLoader.loadScoreFromBytes(
    new TextEncoder().encode(exerciseXml(ex)),
    new alphaTab.Settings(),
  );

/** Notas e dedos de uma pauta, em ordem. */
function staff(score: alphaTab.model.Score, index: number) {
  return score.tracks[0].staves[index].bars.flatMap((bar) =>
    bar.voices.flatMap((v) => v.beats).flatMap((b) =>
      b.notes
        .filter((n) => !n.isTieDestination)
        .map((n) => ({ key: n.realValue, finger: n.leftHandFinger + 1 })),
    ),
  );
}

const fingers = (ex: Partial<Exercise>, hand: 0 | 1) =>
  staff(load({ ...base, ...ex }), hand)
    .slice(0, ex.kind === "arpeggio" ? 3 * (ex.octaves ?? 1) + 1 : 7 * (ex.octaves ?? 1) + 1)
    .map((n) => n.finger)
    .join("");

describe("exercícios de técnica", () => {
  it("escala de Dó maior sobe e desce nas duas mãos", () => {
    const score = load(base);
    const right = staff(score, 0).map((n) => n.key);
    expect(right).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60]);
    expect(staff(score, 1).map((n) => n.key)).toEqual(right.map((k) => k - 12));
    expect(score.title.replace(/\u00a0/g, " ")).toBe("Escala de Dó maior (mãos juntas, 1 oitava)");
    expect(score.tempo).toBe(80);
  });

  it("dedilhado tradicional das escalas maiores", () => {
    expect(fingers({ tonic: 0 }, 0)).toBe("12312345");
    expect(fingers({ tonic: 0 }, 1)).toBe("54321321");
    expect(fingers({ tonic: 0, octaves: 2 }, 0)).toBe("123123412312345");
    expect(fingers({ tonic: 0, octaves: 2 }, 1)).toBe("543213214321321");
    expect(fingers({ tonic: 5 }, 0)).toBe("12341234");
    expect(fingers({ tonic: 11 }, 1)).toBe("43214321");
    expect(fingers({ tonic: 10 }, 0)).toBe("41231234");
    expect(fingers({ tonic: 10 }, 1)).toBe("32143213");
    expect(fingers({ tonic: 3 }, 0)).toBe("31234123");
    expect(fingers({ tonic: 8 }, 0)).toBe("34123123");
    expect(fingers({ tonic: 1 }, 0)).toBe("23123412");
    expect(fingers({ tonic: 6 }, 0)).toBe("23412312");
    expect(fingers({ tonic: 6 }, 1)).toBe("43213214");
  });

  it("dedilhado das menores harmônicas", () => {
    expect(fingers({ tonic: 9, mode: "harmonic" }, 0)).toBe("12312345");
    expect(fingers({ tonic: 6, mode: "harmonic" }, 0)).toBe("34123123");
    expect(fingers({ tonic: 1, mode: "harmonic" }, 1)).toBe("32143213");
    expect(fingers({ tonic: 3, mode: "harmonic" }, 1)).toBe("21432132");
    expect(fingers({ tonic: 10, mode: "harmonic" }, 1)).toBe("21321432");
  });

  it("arpejos: polegar na tecla branca", () => {
    expect(fingers({ kind: "arpeggio", tonic: 0, octaves: 2 }, 0)).toBe("1231235");
    expect(fingers({ kind: "arpeggio", tonic: 0, octaves: 2 }, 1)).toBe("5421421");
    expect(fingers({ kind: "arpeggio", tonic: 1, octaves: 2 }, 0)).toBe("2124124");
    expect(fingers({ kind: "arpeggio", tonic: 1, octaves: 2 }, 1)).toBe("2142142");
    expect(fingers({ kind: "arpeggio", tonic: 3, octaves: 1 }, 0)).toBe("2124");
  });

  it("cadência I–IV–V–I com acordes na direita", () => {
    const score = load({ ...base, kind: "cadence", tonic: 7 });
    const bars = score.tracks[0].staves[0].bars;
    expect(bars).toHaveLength(8);
    const chord = (i: number) =>
      bars[i].voices[0].beats[0].notes.map((n) => n.realValue).sort((a, b) => a - b);
    expect([chord(0), chord(1), chord(2), chord(3)]).toEqual([
      [67, 71, 74],
      [67, 72, 76],
      [66, 69, 74],
      [67, 71, 74],
    ]);
  });

  it("todas as tonalidades, figuras e mãos geram partitura válida", () => {
    for (const mode of ["major", "harmonic", "natural"] as const) {
      for (const tonic of mode === "major" ? TONICS_MAJOR : TONICS_MINOR) {
        for (const kind of ["scale", "arpeggio", "cadence"] as const) {
          for (const figure of [4, 8, 16] as const) {
            const ex: Exercise = { ...base, kind, tonic, mode, figure, octaves: 2, hands: "both" };
            const score = load(ex);
            const keys = staff(score, 0).map((n) => n.key);
            expect(keys.length, exerciseTitle(ex)).toBeGreaterThan(0);
            // Cabe no teclado de 61 teclas (Dó 1 a Dó 6).
            for (const k of [...keys, ...staff(score, 1).map((n) => n.key)]) {
              expect(k).toBeGreaterThanOrEqual(36);
              expect(k).toBeLessThanOrEqual(96);
            }
          }
        }
      }
    }
  });

  it("uma mão só deixa a outra pauta em pausa", () => {
    const score = load({ ...base, hands: "left" });
    expect(staff(score, 0)).toEqual([]);
    expect(staff(score, 1)).toHaveLength(15);
  });

  it("grafia segue a tonalidade", () => {
    const name = (s: [string, number]) => s[0] + (s[1] > 0 ? "#".repeat(s[1]) : "b".repeat(-s[1]));
    expect(name(spelling(-1, true)[1])).toBe("C#"); // Ré menor: sensível dó sustenido
    expect(name(spelling(6, false)[5])).toBe("E#"); // Fá sustenido maior
    expect(name(spelling(5, true)[7])).toBe("F##"); // Sol sustenido menor
    expect(name(spelling(-6, false)[11])).toBe("Cb"); // Sol bemol maior
    expect(name(spelling(0, false)[6])).toBe("F#");
    expect(name(spelling(-2, false)[6])).toBe("Gb");
  });
});
