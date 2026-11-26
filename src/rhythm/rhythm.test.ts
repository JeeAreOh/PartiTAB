import { describe, expect, it } from "vitest";
import * as alphaTab from "@coderline/alphatab";
import { LEVELS } from "../sightreading/levels";
import { generateRhythm, rhythmXml, RHYTHM_PITCH, validRhythm } from "./generate";
import { recentDeviation, timingSummary } from "./summary";

describe("linhas de ritmo", () => {
  it("4 compassos completos, todas as notas em Si, em todos os níveis", () => {
    for (const level of LEVELS) {
      for (let seed = 1; seed <= 100; seed++) {
        const line = generateRhythm(level.level, seed);
        expect(validRhythm(line)).toBe(true);
        expect(level.meters).toContain(line.meter);
        const notes = line.score.parts[0].staves[0].notes;
        expect(notes.every((n) => n.pitch === RHYTHM_PITCH)).toBe(true);
        expect(line.bars[0][0].rest).toBe(false);
        // Síncope e tercina só no nível 7.
        if (level.level < 7) expect(line.bars.flat().some((d) => d.length === 4)).toBe(false);
      }
    }
  });

  it("mesma semente, mesma linha, e o alphaTab lê", () => {
    expect(rhythmXml(generateRhythm(5, 77))).toBe(rhythmXml(generateRhythm(5, 77)));
    for (const level of LEVELS) {
      const line = generateRhythm(level.level, 3);
      const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(
        new TextEncoder().encode(rhythmXml(line)),
        new alphaTab.Settings(),
      );
      expect(score.masterBars.length).toBe(4);
    }
  });

  it("desvio médio e compassos mais imprecisos", () => {
    const s = timingSummary([
      { bar: 0, deltaMs: 10 },
      { bar: 0, deltaMs: -30 },
      { bar: 1, deltaMs: 120 },
      { bar: 2, deltaMs: -80 },
      { bar: 3, deltaMs: 20 },
    ]);
    expect(s.deviationMs).toBe(52);
    expect(s.worstBars).toEqual([1, 2]);
    expect(timingSummary([])).toEqual({ deviationMs: null, worstBars: [] });
    expect(
      recentDeviation([
        { takenAt: 1, level: 1, deviationMs: 40, accuracy: 90 },
        { takenAt: 2, level: 1, deviationMs: null, accuracy: 0 },
        { takenAt: 3, level: 1, deviationMs: 60, accuracy: 90 },
      ]),
    ).toBe(50);
    expect(recentDeviation([])).toBeNull();
  });
});
