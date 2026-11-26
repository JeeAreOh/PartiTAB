import { describe, expect, it } from "vitest";
import type { Attempt, ReadingTestResult, SightReadingResult, Song } from "../api";
import { evaluateGates, isReady, planMetrics, readyPieces, type GateData } from "./gates";

let n = 0;
const song = (title: string, extra: Partial<Song> = {}): Song =>
  ({
    id: ++n,
    title,
    artist: "",
    style: "",
    prefs: "{}",
    ...extra,
  }) as Song;
const play = (songId: number, playedAt: number, score: number, speed = 100, errors = 0) =>
  ({
    songId,
    playedAt,
    score,
    speed,
    mode: "play",
    wrong: errors,
    miss: 0,
    accuracy: score,
    completed: true,
  }) as Attempt;
const test = (totalMs: number, clefs: ReadingTestResult["clefs"] = "both") =>
  ({ takenAt: 1, clefs, range: "staff", totalMs, errors: 0 }) as ReadingTestResult;
const sight = (level: number, passed = true) =>
  ({ takenAt: level, level, passed, seed: 1, songId: null, accuracy: 90 }) as SightReadingResult;
const empty: GateData = { tests: [], sight: [], attempts: [], songs: [] };

describe("peça pronta", () => {
  it("nota ≥ 90 a 100% nas últimas 3 execuções", () => {
    const a = [play(1, 1, 95), play(1, 2, 92), play(1, 3, 90)];
    expect(isReady(a, 1)).toBe(true);
    expect(isReady([...a, play(1, 4, 80)], 1)).toBe(false);
    expect(isReady([play(1, 1, 95), play(1, 2, 92), play(1, 3, 99, 90)], 1)).toBe(false);
    expect(isReady(a.slice(0, 2), 1)).toBe(false);
  });
});

describe("gates", () => {
  it("mês 3: teste < 40 s nas duas claves e nível 3 aprovado", () => {
    let g = evaluateGates(empty)[0];
    expect(g.met).toBe(false);
    expect(g.criteria[0].current).toBe("nenhum teste ainda");
    g = evaluateGates({
      ...empty,
      tests: [test(47_000), test(30_000, "treble")],
      sight: [sight(3)],
    })[0];
    expect(g.criteria.map((c) => c.met)).toEqual([false, true]);
    expect(g.criteria[0].current).toBe("melhor: 47,0 s");
    g = evaluateGates({ ...empty, tests: [test(39_000)], sight: [sight(4)] })[0];
    expect(g.met).toBe(true);
  });

  it("mês 6: Minueto em Sol 3 vezes, nível 5 e escala limpa a 60 bpm", () => {
    const minuet = song("Minueto em Sol maior, BWV Anh. 114");
    const scale = song("Escala de Dó maior (mão direita, 1 oitava)", {
      artist: "Técnica",
      prefs: JSON.stringify({
        exercise: {
          kind: "scale",
          tonic: 0,
          mode: "major",
          hands: "right",
          octaves: 1,
          figure: 8,
          bpm: 64,
        },
      }),
    });
    const d: GateData = {
      ...empty,
      songs: [minuet, scale],
      sight: [sight(5)],
      attempts: [
        play(minuet.id, 1, 91),
        play(minuet.id, 2, 93),
        play(minuet.id, 3, 95),
        { ...play(scale.id, 4, 97), accuracy: 97 },
      ],
    };
    const g = evaluateGates(d)[1];
    expect(g.criteria.map((c) => c.met)).toEqual([true, true, true]);
    expect(g.met).toBe(true);
    const missing = evaluateGates({ ...d, songs: [scale] })[1];
    expect(missing.criteria[0].current).toBe("peça não encontrada na biblioteca");
  });

  it("mês 9: peça escolhida com nota ≥ 90 e até 2 erros", () => {
    const piece = song("Sonatina");
    const base = { ...empty, songs: [piece], sight: [sight(6)], tests: [test(19_000)] };
    expect(evaluateGates(base)[2].criteria[0].current).toBe("escolha a peça no painel do gate");
    const fail = { ...base, gatePieceId: piece.id, attempts: [play(piece.id, 1, 92, 100, 3)] };
    expect(evaluateGates(fail)[2].met).toBe(false);
    const pass = { ...base, gatePieceId: piece.id, attempts: [play(piece.id, 1, 92, 100, 2)] };
    expect(evaluateGates(pass)[2].met).toBe(true);
  });

  it("mês 12: 8 peças prontas e escalas até 3 acidentes a 80 bpm", () => {
    const pieces = Array.from({ length: 8 }, (_, i) => song(`Peça ${i}`));
    const attempts = pieces.flatMap((p) => [
      play(p.id, 1, 95),
      play(p.id, 2, 95),
      play(p.id, 3, 95),
    ]);
    expect(readyPieces(attempts, pieces)).toHaveLength(8);
    const g = evaluateGates({
      ...empty,
      songs: pieces,
      attempts,
      sight: [sight(7)],
      tests: [test(14_000)],
    })[3];
    expect(g.criteria.map((c) => c.met)).toEqual([true, true, false, true]);
    expect(g.criteria[2].current).toBe("0 de 7");
  });
});

describe("métricas do plano", () => {
  it("cinco métricas com a tendência", () => {
    const m = planMetrics(
      {
        ...empty,
        tests: [test(50_000), test(42_000)],
        sight: [sight(1), sight(2, false), sight(3)],
      },
      [10, 20, 30, 40, 0, 0, 40, 30],
    );
    expect(m.map((x) => x.id)).toEqual(["test", "sight", "scales", "pieces", "minutes"]);
    expect(m[0]).toMatchObject({ value: "42,0 s", series: [50, 42] });
    expect(m[1]).toMatchObject({ value: "nível 3", series: [1, 1, 3] });
    expect(m[4].value).toBe("23 min");
  });
});
