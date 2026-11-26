import { describe, expect, it } from "vitest";
import {
  answerPattern,
  intervalName,
  intervalPool,
  isCorrect,
  newPatternState,
  PATTERN_RANGE,
  pickPattern,
  stepOf,
  triadPool,
  wrongSoFar,
} from "./patterns";

describe("intervalos", () => {
  it("nomes pela qualidade", () => {
    expect(intervalName(3, 4)).toBe("3ª maior");
    expect(intervalName(3, 3)).toBe("3ª menor");
    expect(intervalName(4, 6)).toBe("4ª aumentada");
    expect(intervalName(5, 6)).toBe("5ª diminuta");
    expect(intervalName(8, 12)).toBe("8ª justa");
  });

  it("de 2ª a 8ª, dentro da clave, nas formas melódica e harmônica", () => {
    for (const clef of ["treble", "bass"] as const) {
      const pool = intervalPool(clef);
      const [lo, hi] = PATTERN_RANGE[clef];
      expect(pool.every((c) => c.notes.every((n) => n.key >= lo && n.key <= hi))).toBe(true);
      const sizes = new Set(
        pool.map((c) => Math.abs(stepOf(clef, c.notes[1]) - stepOf(clef, c.notes[0]))),
      );
      expect([...sizes].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(new Set(pool.map((c) => c.id)).size).toBe(pool.length);
    }
    const c = intervalPool("treble").find((x) => x.id === "interval:treble:64:67:harm")!;
    expect(c.name).toBe("3ª menor");
  });
});

describe("tríades", () => {
  it("maiores e menores, com inversões, grafadas na tonalidade", () => {
    const pool = triadPool("treble");
    const names = pool.map((c) => c.name);
    expect(names).toContain("Dó maior");
    expect(names).toContain("Mi♭ maior, 2ª inversão");
    expect(names).toContain("Fá# menor, 1ª inversão");
    const ab = pool.find((c) => c.name === "Mi♭ maior" && c.notes[0].key === 63)!;
    // Mi♭ – Sol – Si♭: letras Mi, Sol, Si.
    expect(ab.notes.map((n) => [n.letter, n.alter])).toEqual([
      [2, -1],
      [4, 0],
      [6, -1],
    ]);
    const [lo, hi] = PATTERN_RANGE.treble;
    expect(pool.every((c) => c.notes[0].key >= lo && c.notes[2].key <= hi)).toBe(true);
  });
});

describe("respostas", () => {
  const harm = intervalPool("treble").find((x) => x.id === "interval:treble:60:64:harm")!;
  const down = intervalPool("treble").find((x) => x.id === "interval:treble:64:60:mel")!;

  it("harmônico em qualquer ordem; melódico na ordem", () => {
    expect(isCorrect(harm, [64, 60])).toBe(true);
    expect(isCorrect(harm, [60, 64, 67])).toBe(false);
    expect(isCorrect(down, [64, 60])).toBe(true);
    expect(isCorrect(down, [60, 64])).toBe(false);
    expect(wrongSoFar(down, [60])).toBe(true);
    expect(wrongSoFar(down, [64])).toBe(false);
  });

  it("erros voltam para a caixa 1 e aparecem mais", () => {
    let s = answerPattern(newPatternState("x"), true, 1000, 5);
    expect(s.box).toBe(2);
    s = answerPattern(s, false, 1000, 6);
    expect(s).toMatchObject({ box: 1, seen: 2, correct: 1, totalMs: 2000, lastSeen: 6 });
    const pool = intervalPool("treble").slice(0, 2);
    const states = new Map([[pool[1].id, { ...newPatternState(pool[1].id), box: 5 }]]);
    // Caixa 1 pesa 16, caixa 5 pesa 1.
    let first = 0;
    for (let i = 0; i < 170; i++)
      if (pickPattern(pool, states, null, () => i / 170).id === pool[0].id) first++;
    expect(first).toBe(160);
  });
});
