import { describe, expect, it } from "vitest";
import type { Attempt, Song } from "../api";
import { dayKey, formatMinutes, summarize } from "./progress";

const now = new Date(2026, 9, 30, 18, 0).getTime();
const day = (offset: number, hour = 10) => new Date(2026, 9, 30 + offset, hour).getTime();

const song = (id: number) => ({ id, title: `Música ${id}` }) as Song;
const attempt = (songId: number, playedAt: number, score: number, durationMs = 600_000): Attempt =>
  ({ songId, playedAt, score, accuracy: score, durationMs }) as Attempt;

describe("progresso", () => {
  it("soma minutos por dia e conta a sequência", () => {
    const s = summarize(
      [
        attempt(1, day(0), 50),
        attempt(1, day(0, 20), 70, 300_000),
        attempt(2, day(-1), 60),
        attempt(2, day(-2), 40),
        attempt(2, day(-4), 30),
      ],
      [song(1), song(2)],
      now,
    );
    expect(s.today).toMatchObject({ date: "2026-10-30", minutes: 15, sessions: 2 });
    expect(s.streak).toBe(3);
    expect(s.days).toHaveLength(30);
    expect(s.days[29].date).toBe("2026-10-30");
    expect(s.days[25]).toMatchObject({ date: "2026-10-26", minutes: 10 });
    expect(s.weekMinutes).toBe(45);
    expect(s.periodSessions).toBe(5);
    expect(s.accuracy).toBe(50);
  });

  it("sem prática hoje, a sequência conta até ontem", () => {
    const s = summarize([attempt(1, day(-1), 50), attempt(1, day(-2), 50)], [song(1)], now);
    expect(s.streak).toBe(2);
    expect(summarize([attempt(1, day(-3), 50)], [song(1)], now).streak).toBe(0);
  });

  it("músicas que mais evoluíram", () => {
    const s = summarize(
      [
        attempt(1, day(-5), 40),
        attempt(1, day(-1), 85),
        attempt(1, day(0), 70),
        attempt(2, day(-3), 60),
        attempt(2, day(-2), 65),
        attempt(3, day(-2), 90),
        attempt(4, day(-2), 80),
        attempt(4, day(-1), 50),
      ],
      [song(1), song(2), song(3), song(4)],
      now,
    );
    expect(s.improved.map((i) => [i.song.id, i.first, i.best])).toEqual([
      [1, 40, 85],
      [2, 60, 65],
    ]);
  });

  it("formata tempo e dias", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(0.2)).toBe("menos de 1 min");
    expect(formatMinutes(65)).toBe("1 h 05 min");
    expect(dayKey(day(-30))).toBe("2026-09-30");
  });
});
