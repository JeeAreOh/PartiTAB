import { describe, expect, it } from "vitest";
import type { ReadingTestResult } from "../api";
import { pickNext, cardId } from "./cards";
import { bestTestMs, testDeck, testStats } from "./test";

const t = (takenAt: number, totalMs: number, clefs: ReadingTestResult["clefs"] = "both") =>
  ({ takenAt, totalMs, clefs, range: "staff", errors: 0 }) as ReadingTestResult;

describe("teste das 20 notas", () => {
  it("sorteia 20 notas sem repetir a anterior", () => {
    const candidates = [60, 62, 64].map((key) => ({
      clef: "treble" as const,
      key,
    }));
    const deck = testDeck(candidates, (c, prev) => pickNext(c, new Map(), prev));
    expect(deck).toHaveLength(20);
    for (let i = 1; i < deck.length; i++)
      expect(cardId(deck[i].clef, deck[i].key)).not.toBe(cardId(deck[i - 1].clef, deck[i - 1].key));
    expect(testDeck([], () => deck[0])).toEqual([]);
  });

  it("melhor tempo e os últimos 10 em ordem", () => {
    const tests = Array.from({ length: 12 }, (_, i) => t(i, 50_000 - i * 1000));
    const s = testStats(tests);
    expect(s.best?.totalMs).toBe(39_000);
    expect(s.recent.map((x) => x.takenAt)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(bestTestMs([...tests, t(20, 1000, "treble")], "both")).toBe(39_000);
    expect(bestTestMs([], "bass")).toBeNull();
  });
});
