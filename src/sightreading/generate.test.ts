import { describe, expect, it } from "vitest";
import * as alphaTab from "@coderline/alphatab";
import { readMetadata } from "../library/useLibrary";
import { generate, sightXml, validate, HIGHEST, LOWEST } from "./generate";
import { barLength, LEVELS, levelOf } from "./levels";
import { mod } from "./melody";
import { fitsBar, parsePattern, patternsFor } from "./rhythm";

const SEEDS = 200;

describe("padrões rítmicos", () => {
  it("todos preenchem o compasso", () => {
    for (const meter of ["2/4", "3/4", "4/4", "6/8"] as const) {
      for (let level = 1; level <= 7; level++) {
        for (const p of patternsFor(meter, level)) {
          expect(fitsBar(parsePattern(p), meter), `${meter} ${p}`).toBe(true);
        }
      }
    }
  });
});

describe("leitura à primeira vista", () => {
  for (const level of LEVELS) {
    it(`nível ${level.level}: ${SEEDS} sementes válidas`, () => {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const piece = generate(level.level, seed * 7919);
        expect(validate(piece)).toBe(true);
        expect(level.meters).toContain(piece.meter);
        const notes = piece.score.parts[0].staves.flatMap((s) => s.notes);
        expect(notes.every((n) => n.pitch >= LOWEST && n.pitch <= HIGHEST)).toBe(true);
        // Melodia dentro da extensão do nível (posição de cinco dedos nos níveis 1–3).
        const shift = level.fiveFinger ? mod(piece.fifths * 7, 12) : 0;
        const [lo, hi] = [level.melody[0] + shift, level.melody[1] + shift];
        for (const n of piece.melody) {
          if (n.pitch !== null) {
            expect(n.pitch).toBeGreaterThanOrEqual(lo);
            expect(n.pitch).toBeLessThanOrEqual(hi + 1); // +1: acidente ocorrente
          }
        }
        expect(piece.bars).toBe(
          piece.score.parts[0].staves[0].notes.length ? piece.bars : piece.bars,
        );
        expect(level.bars).toContain(piece.bars);
      }
    });
  }

  it("mesma semente, mesmo trecho", () => {
    for (const level of LEVELS) {
      expect(sightXml(generate(level.level, 1234))).toBe(sightXml(generate(level.level, 1234)));
      expect(sightXml(generate(level.level, 1234))).not.toBe(sightXml(generate(level.level, 999)));
    }
  });

  it("o alphaTab lê o trecho, com compassos completos", () => {
    for (const level of LEVELS) {
      for (let seed = 1; seed <= 25; seed++) {
        const piece = generate(level.level, seed);
        const xml = sightXml(piece);
        const data = new TextEncoder().encode(xml);
        expect(readMetadata(data)?.title).toBe(piece.title);
        const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(
          data,
          new alphaTab.Settings(),
        );
        expect(score.masterBars.length).toBe(piece.bars);
        const expected = (barLength(piece.meter) / 12) * 960;
        for (const staff of score.tracks[0].staves) {
          for (const bar of staff.bars) {
            // Vozes que o arquivo não usa ficam vazias (o alphaTab as cria pelo número).
            const used = bar.voices.filter((v) => !v.isEmpty);
            expect(used.length).toBeGreaterThan(0);
            for (const voice of used) {
              const total = voice.beats.reduce((s, b) => s + b.playbackDuration, 0);
              expect(total, `nível ${level.level} semente ${seed} compasso ${bar.index}`).toBe(
                expected,
              );
            }
          }
        }
      }
    }
  });

  it("título, nível e mãos", () => {
    const p1 = generate(1, 5);
    expect(p1.title).toBe(`Leitura · Nível 1 · #${p1.seed}`);
    expect(p1.hands).toBe("right");
    expect(generate(2, 5).hands).toBe("left");
    expect(generate(4, 5).hands).toBe("both");
    expect(levelOf(99).level).toBe(7);
    // Dedilhado só no primeiro compasso.
    const fingered = generate(3, 5).score.parts[0].staves.flatMap((s) =>
      s.notes.filter((n) => n.finger),
    );
    expect(fingered.length).toBeGreaterThan(0);
  });
});
