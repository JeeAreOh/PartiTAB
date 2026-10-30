import { describe, expect, it } from "vitest";
import {
  answer,
  cardId,
  newState,
  noteName,
  pickNext,
  pool,
  staffStep,
  wrongOctave,
  type CardState,
} from "./cards";

describe("notas do treino", () => {
  it("clave de sol na pauta vai de Mi4 a Fá5, só teclas brancas", () => {
    expect(pool("treble", "staff", false)).toEqual([64, 65, 67, 69, 71, 72, 74, 76, 77]);
  });

  it("com acidentes e linhas suplementares inclui teclas pretas e mais extensão", () => {
    const keys = pool("bass", "ledger", true);
    expect(keys[0]).toBe(36);
    expect(keys[keys.length - 1]).toBe(64);
    expect(keys).toContain(37);
  });
});

describe("posição na pauta", () => {
  it("linhas e espaços da clave de sol", () => {
    expect(staffStep({ clef: "treble", key: 64, accidental: null })).toBe(0); // Mi4, linha de baixo
    expect(staffStep({ clef: "treble", key: 67, accidental: null })).toBe(2); // Sol4, 2ª linha
    expect(staffStep({ clef: "treble", key: 77, accidental: null })).toBe(8); // Fá5, linha de cima
    expect(staffStep({ clef: "treble", key: 60, accidental: null })).toBe(-2); // Dó4, 1 linha suplementar
  });

  it("clave de fá e grafia dos acidentes", () => {
    expect(staffStep({ clef: "bass", key: 43, accidental: null })).toBe(0); // Sol2
    expect(staffStep({ clef: "bass", key: 53, accidental: null })).toBe(6); // Fá3, 4ª linha
    expect(staffStep({ clef: "bass", key: 54, accidental: "sharp" })).toBe(6); // Fá#3
    expect(staffStep({ clef: "bass", key: 54, accidental: "flat" })).toBe(7); // Sol♭3
  });

  it("nomes em português", () => {
    expect(noteName({ clef: "treble", key: 60, accidental: null })).toBe("Dó4");
    expect(noteName({ clef: "treble", key: 66, accidental: "sharp" })).toBe("Fá#4");
    expect(noteName({ clef: "bass", key: 46, accidental: "flat" })).toBe("Si♭2");
  });
});

describe("repetição espaçada", () => {
  it("rápida sobe de caixa, lenta fica, errada volta para a 1", () => {
    const s = newState("treble", 64);
    const up = answer(s, true, 900, 10);
    expect(up).toMatchObject({ box: 2, seen: 1, correct: 1, totalMs: 900, lastSeen: 10 });
    expect(answer(up, true, 4000).box).toBe(2);
    expect(answer({ ...up, box: 5 }, true, 500).box).toBe(5);
    expect(answer({ ...up, box: 4 }, false, 800).box).toBe(1);
  });

  it("sorteia mais as notas das caixas baixas e não repete a anterior", () => {
    const states = new Map<string, CardState>([
      [cardId("treble", 64), { ...newState("treble", 64), box: 5 }],
      [cardId("treble", 65), { ...newState("treble", 65), box: 1 }],
    ]);
    const candidates = [
      { clef: "treble" as const, key: 64 },
      { clef: "treble" as const, key: 65 },
      { clef: "treble" as const, key: 67 }, // nova: caixa 1
    ];
    const counts = new Map<number, number>();
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 3000; i++) {
      const c = pickNext(candidates, states, null, random);
      counts.set(c.key, (counts.get(c.key) ?? 0) + 1);
    }
    // Pesos 1 : 16 : 16 → a da caixa 5 sai bem menos.
    expect(counts.get(64)!).toBeLessThan(counts.get(65)! / 5);
    expect(pickNext(candidates.slice(0, 2), states, cardId("treble", 65)).key).toBe(64);
  });

  it("teclas pretas recebem sustenido ou bemol", () => {
    const c = pickNext([{ clef: "treble", key: 66 }], new Map(), null, () => 0.9);
    expect(c.accidental).toBe("flat");
    expect(wrongOctave({ clef: "treble", key: 60, accidental: null }, 72)).toBe(true);
    expect(wrongOctave({ clef: "treble", key: 60, accidental: null }, 62)).toBe(false);
  });
});
