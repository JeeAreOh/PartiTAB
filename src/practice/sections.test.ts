import { describe, expect, it } from "vitest";
import * as alphaTab from "@coderline/alphatab";
import { applySections, fileSections, mergeSections, sectionLabel } from "./sections";
import { exerciseXml } from "../technique/exercises";

const bars = (names: (string | null)[]) =>
  names.map((n) => ({ section: n === null ? null : { text: "", marker: n } }));

describe("seções", () => {
  it("as do arquivo vão até a próxima seção", () => {
    expect(fileSections(bars(["Intro", null, "Refrão", null, null]))).toEqual([
      { name: "Intro", from: 0, to: 1 },
      { name: "Refrão", from: 2, to: 4 },
    ]);
    expect(fileSections(bars([null, null]))).toEqual([]);
  });

  it("mistura as do arquivo com as do aluno, em ordem", () => {
    const list = mergeSections(
      [{ name: "A", from: 4, to: 7 }],
      [{ name: "parte difícil", from: 2, to: 3 }],
    );
    expect(list.map((s) => [s.name, s.mine])).toEqual([
      ["parte difícil", true],
      ["A", false],
    ]);
    expect(sectionLabel({ name: "x", from: 2, to: 2 })).toBe("compasso 3");
    expect(sectionLabel({ name: "x", from: 2, to: 5 })).toBe("compassos 3–6");
  });

  it("as do aluno são escritas na partitura sem apagar as do arquivo", () => {
    const xml = exerciseXml({
      kind: "scale",
      tonic: 0,
      mode: "major",
      hands: "right",
      octaves: 2,
      figure: 8,
      bpm: 80,
    });
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(
      new TextEncoder().encode(xml),
      new alphaTab.Settings(),
    );
    applySections(score, [{ name: "Descida", from: 2, to: 3 }]);
    expect(fileSections(score.masterBars)).toEqual([{ name: "Descida", from: 2, to: 3 }]);
  });
});
