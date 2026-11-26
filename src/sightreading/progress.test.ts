import { describe, expect, it } from "vitest";
import type { SightReadingResult } from "../api";
import { judgeRun, lastLevel, sightStats, suggestLevel } from "./progress";

const r = (takenAt: number, level: number, passed: boolean): SightReadingResult => ({
  takenAt,
  level,
  passed,
  seed: takenAt,
  songId: null,
  accuracy: passed ? 90 : 60,
});

describe("progressão da primeira vista", () => {
  it("passa com 85% até o fim e sem compasso perdido", () => {
    expect(judgeRun(90, true, { 0: { notes: 4, errors: 1 } })).toEqual({
      passed: true,
      lostBars: [],
    });
    expect(judgeRun(84, true, {}).passed).toBe(false);
    expect(judgeRun(95, false, {}).passed).toBe(false);
    expect(judgeRun(90, true, { 3: { notes: 2, errors: 2 }, 1: { notes: 3, errors: 0 } })).toEqual({
      passed: false,
      lostBars: [3],
    });
  });

  it("sugere subir com 5 de 6 e descer com 3 reprovações seguidas", () => {
    const up = [1, 2, 3, 4, 5, 6].map((t) => r(t, 2, t !== 3));
    expect(suggestLevel(up, 2)).toBe("up");
    expect(suggestLevel(up.slice(0, 4), 2)).toBeNull();
    expect(suggestLevel([...up, r(10, 3, true)], 3)).toBeNull();
    const down = [r(1, 3, true), r(2, 3, false), r(3, 3, false), r(4, 3, false)];
    expect(suggestLevel(down, 3)).toBe("down");
    expect(suggestLevel([r(1, 1, false), r(2, 1, false), r(3, 1, false)], 1)).toBeNull();
    expect(
      suggestLevel(
        [1, 2, 3, 4, 5].map((t) => r(t, 7, true)),
        7,
      ),
    ).toBeNull();
  });

  it("maior nível aprovado e taxa dos últimos 20", () => {
    const list = Array.from({ length: 25 }, (_, i) => r(i, 1 + (i % 3), i % 2 === 0));
    const s = sightStats(list);
    expect(s.maxPassed).toBe(3);
    expect(s.count).toBe(20);
    expect(s.passRate).toBe(50);
    expect(sightStats([]).maxPassed).toBeNull();
    expect(lastLevel(list)).toBe(1 + (24 % 3));
    expect(lastLevel([])).toBe(1);
  });
});
