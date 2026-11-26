import { describe, expect, it } from "vitest";
import { CURRICULUM, monthOf } from "./curriculum";
import {
  advanceTo,
  blockDone,
  daysLeftInMonth,
  DEFAULT_PLAN,
  monthIndex,
  repeatMonth,
  sessionFor,
} from "./plan";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("calendário do plano", () => {
  it("mês atual a partir da data de início", () => {
    expect(monthIndex(DEFAULT_PLAN, at(2026, 11, 30))).toBe(0);
    expect(monthIndex(DEFAULT_PLAN, at(2026, 12, 1))).toBe(1);
    expect(monthIndex(DEFAULT_PLAN, at(2026, 12, 31))).toBe(1);
    expect(monthIndex(DEFAULT_PLAN, at(2027, 2, 15))).toBe(3);
    expect(monthIndex(DEFAULT_PLAN, at(2027, 11, 30))).toBe(12);
    expect(monthIndex(DEFAULT_PLAN, at(2027, 12, 1))).toBe(13);
    expect(daysLeftInMonth(DEFAULT_PLAN, at(2027, 2, 26, 0))).toBe(3);
  });

  it("repetir um mês desloca o calendário", () => {
    const repeated = repeatMonth(DEFAULT_PLAN);
    expect(monthIndex(repeated, at(2027, 3, 10))).toBe(3);
    expect(monthIndex(DEFAULT_PLAN, at(2027, 3, 10))).toBe(4);
    expect(monthIndex(repeated, at(2026, 12, 10))).toBe(0);
  });

  it("avançar faz o mês seguinte ao gate começar agora", () => {
    const now = at(2027, 2, 10); // mês 3
    const next = advanceTo(DEFAULT_PLAN, 4, now);
    expect(monthIndex(next, now)).toBe(4);
    expect(next.shift).toBe(-1);
    // Já passou: não mexe.
    expect(advanceTo(DEFAULT_PLAN, 2, now)).toEqual(DEFAULT_PLAN);
  });
});

describe("sessão do dia", () => {
  const month = monthOf(3);
  it("cinco blocos de 5 + 10 + 15 + 5 + 5 minutos nos dias úteis", () => {
    const s = sessionFor(DEFAULT_PLAN, month, at(2027, 2, 10)); // quarta
    expect(s.kind).toBe("normal");
    expect(s.blocks.map((b) => b.minutes)).toEqual([5, 10, 15, 5, 5]);
    expect(s.blocks.map((b) => b.id)).toEqual([
      "technique",
      "reading",
      "repertoire",
      "theory",
      "free",
    ]);
    // Meta de 60 min: proporcional.
    const long = sessionFor({ ...DEFAULT_PLAN, minutes: 60 }, month, at(2027, 2, 10));
    expect(long.blocks.map((b) => b.minutes)).toEqual([8, 15, 23, 8, 8]);
  });

  it("sábado é revisão e gravação; domingo, descanso", () => {
    const sat = sessionFor(DEFAULT_PLAN, month, at(2027, 2, 13));
    expect(sat.kind).toBe("review");
    expect(sat.blocks[2].label).toBe("Revisão + gravação");
    const sun = sessionFor(DEFAULT_PLAN, month, at(2027, 2, 14));
    expect(sun.kind).toBe("rest");
    expect(sun.blocks).toHaveLength(1);
  });

  it("bloco feito com 80% do tempo", () => {
    expect(blockDone(4 * 60_000, 5)).toBe(true);
    expect(blockDone(3.9 * 60_000, 5)).toBe(false);
  });

  it("currículo de 12 meses em 4 fases", () => {
    expect(CURRICULUM.map((m) => m.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(CURRICULUM.map((m) => m.phase)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
    expect(CURRICULUM.every((m) => m.sightLevel >= 1 && m.sightLevel <= 7)).toBe(true);
  });
});
