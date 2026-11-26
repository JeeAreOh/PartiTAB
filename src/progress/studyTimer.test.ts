import { describe, expect, it } from "vitest";
import { ActiveTimer } from "./studyTimer";

describe("ActiveTimer", () => {
  it("soma só os intervalos curtos entre toques", () => {
    const t = new ActiveTimer(60_000);
    t.touch(1_000);
    t.touch(11_000); // +10 s
    t.touch(200_000); // pausa longa: não conta
    t.touch(230_000); // +30 s
    expect(t.take()).toEqual({ startedAt: 1_000, durationMs: 40_000 });
    expect(t.take()).toBeNull();
  });
});
