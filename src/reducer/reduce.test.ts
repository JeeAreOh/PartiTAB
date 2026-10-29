import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as alphaTab from "@coderline/alphatab";
import { guessRoles, reduceToPiano, type Level } from "./reduce";
import { buildTimeline, type TickCacheLike } from "../practice/timeline";

const settings = new alphaTab.Settings();
const fixture = readFileSync(new URL("./fixtures/banda.musicxml", import.meta.url));
const load = () =>
  alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fixture), settings);

/** Notas de cada pauta da faixa, compasso a compasso (só ataques). */
function staffNotes(track: alphaTab.model.Track, staff: number) {
  return track.staves[staff].bars.map((bar) =>
    bar.voices[0].beats.map((b) =>
      b.notes.filter((n) => !n.isTieDestination).map((n) => n.realValue),
    ),
  );
}

/** Gera o MIDI como o player faria e devolve o tickCache. */
function tickCache(score: alphaTab.model.Score): TickCacheLike {
  const midi = new alphaTab.midi.MidiFile();
  const generator = new alphaTab.midi.MidiFileGenerator(
    score,
    settings,
    new alphaTab.midi.AlphaSynthMidiFileHandler(midi),
  );
  generator.generate();
  return generator.tickLookup as unknown as TickCacheLike;
}

describe("guessRoles", () => {
  it("acha a voz como melodia e o baixo, mesmo fora de ordem", () => {
    const score = load();
    expect(score.tracks.map((t) => t.name)).toEqual(["Guitarra", "Voz", "Baixo"]);
    expect(guessRoles(score)).toEqual({ melody: 1, bass: 2 });
  });
});

describe("reduceToPiano", () => {
  const reduce = (level: Level, transpose: boolean) => {
    const score = load();
    const result = reduceToPiano(score, settings, { level, melody: 1, transpose });
    return { score, result, track: score.tracks[result.track] };
  };

  it("nível 1: melodia na mão direita, no tom original", () => {
    const { result, track, score } = reduce(1, false);
    expect(result.track).toBe(3);
    expect(result.key).toEqual({ tonic: 2, minor: false }); // Ré maior
    expect(result.shift).toBe(0);
    expect(track.staves).toHaveLength(2);
    expect(track.staves[0].showTablature).toBe(false);
    // Melodia original (D5...) desce uma oitava para caber na mão direita.
    expect(staffNotes(track, 0)[0]).toEqual([[62], [64], [66], [67]]);
    expect(staffNotes(track, 1).flat(2)).toEqual([]);
    // As outras faixas continuam na partitura (tocar com a banda).
    expect(score.tracks).toHaveLength(4);
  });

  it("nível 2: fundamental do baixo nos tempos fortes, transposto para Dó", () => {
    const { result, track } = reduce(2, true);
    expect(result.shift).toBe(-2);
    expect(track.staves[0].bars[0].keySignature).toBe(0);
    expect(staffNotes(track, 0)[0]).toEqual([[60], [62], [64], [65]]);
    // D D | G A | B G | D  →  C C | F G | A F | C, duas mínimas por compasso.
    const bass = staffNotes(track, 1).map((bar) => bar.map((b) => b.map((n) => n % 12)));
    expect(bass).toEqual([
      [[0], [0]],
      [[5], [7]],
      [[9], [5]],
      [[0], [0]],
    ]);
    for (const n of staffNotes(track, 1).flat(2)) {
      expect(n).toBeGreaterThanOrEqual(36);
      expect(n).toBeLessThanOrEqual(55);
    }
  });

  it("nível 3: tríades fechadas com cifra quando o acorde muda", () => {
    const { track } = reduce(3, true);
    const chords = staffNotes(track, 1);
    const names = track.staves[0].bars.map((bar) =>
      bar.voices[0].beats.filter((b) => b.chordId).map((b) => b.chordId),
    );
    expect(JSON.stringify(names)).toBe(JSON.stringify([["C"], ["F", "G"], ["Am", "F"], ["C"]]));
    for (const triad of chords.flat()) {
      expect(triad).toHaveLength(3);
      expect(triad[2] - triad[0]).toBeLessThan(12); // posição fechada
    }
    // Encadeamento suave: nenhuma voz salta mais que uma quarta entre acordes.
    const flat = chords.flat();
    for (let i = 1; i < flat.length; i++) {
      flat[i].forEach((n, v) => expect(Math.abs(n - flat[i - 1][v])).toBeLessThanOrEqual(5));
    }
  });

  it("gera uma faixa que o motor de prática entende (pauta de cima = mão direita)", () => {
    const { score, result } = reduce(3, true);
    const steps = buildTimeline(tickCache(score), result.track);
    const first = steps[0].notes.map((n) => [n.key % 12, n.hand]);
    expect(first).toEqual(
      expect.arrayContaining([
        [0, "right"],
        [0, "left"],
        [4, "left"],
        [7, "left"],
      ]),
    );
    expect(steps.filter((s) => s.notes.some((n) => n.hand === "right"))).toHaveLength(13);
  });

  it("exporta o arranjo em Guitar Pro 7 e reabre", () => {
    const { score, result } = reduce(2, true);
    const data = new alphaTab.exporter.Gp7Exporter().export(score, settings);
    const reopened = alphaTab.importer.ScoreLoader.loadScoreFromBytes(data, settings);
    expect(reopened.tracks[result.track].name).toBe("Piano (nível 2)");
    expect(
      staffNotes(reopened.tracks[result.track], 1)[1]
        .flat()
        .map((n) => n % 12),
    ).toEqual([5, 7]);
  });
});
