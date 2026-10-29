import { describe, expect, it } from "vitest";
import {
  chordName,
  detectChord,
  easyTransposition,
  estimateDifficulty,
  estimateKey,
  figureFor,
  fitOctave,
  fold,
  keySignatureOf,
  placeNote,
  strongBeats,
  voiceTriad,
} from "./harmony";

/** Pesos por classe de altura a partir de notas (cada uma com peso 1). */
const weights = (notes: number[]) => {
  const w = Array(12).fill(0);
  for (const n of notes) w[n % 12] += 1;
  return w;
};

describe("tonalidade", () => {
  it("reconhece escalas maiores e menores", () => {
    // Escala de Ré maior com tônica e dominante mais fortes.
    expect(estimateKey(weights([62, 62, 64, 66, 67, 69, 69, 71, 73, 74]))).toEqual({
      tonic: 2,
      minor: false,
    });
    // Lá menor: A B C D E F G com A e E fortes.
    expect(estimateKey(weights([57, 57, 57, 59, 60, 62, 64, 64, 65, 67]))).toEqual({
      tonic: 9,
      minor: true,
    });
  });

  it("transpõe para o tom fácil mais próximo", () => {
    expect(easyTransposition({ tonic: 0, minor: false })).toBe(0); // Dó
    expect(easyTransposition({ tonic: 2, minor: false })).toBe(-2); // Ré → Dó
    expect(easyTransposition({ tonic: 6, minor: false })).toBe(-1); // Fá# → Fá (empate com Sol: desce)
    expect(easyTransposition({ tonic: 4, minor: false })).toBe(1); // Mi → Fá
    expect(easyTransposition({ tonic: 11, minor: true })).toBe(-2); // Si m → Lá m
  });

  it("dá a armadura em quintas", () => {
    expect(keySignatureOf({ tonic: 7, minor: false })).toBe(1);
    expect(keySignatureOf({ tonic: 5, minor: false })).toBe(-1);
    expect(keySignatureOf({ tonic: 4, minor: true })).toBe(1); // Mi menor
    expect(keySignatureOf({ tonic: 3, minor: false })).toBe(-3); // Mi♭
  });
});

describe("acordes", () => {
  it("detecta tríades e power chords", () => {
    expect(chordName(detectChord(weights([48, 52, 55, 60]))!)).toBe("C");
    expect(chordName(detectChord(weights([57, 60, 64]))!)).toBe("Am");
    expect(chordName(detectChord(weights([40, 47, 52]))!)).toBe("E"); // E5
    expect(chordName(detectChord(weights([59, 62, 65]))!)).toBe("B°");
    expect(detectChord(Array(12).fill(0))).toBeNull();
  });

  it("usa o baixo para decidir entre acordes parecidos", () => {
    // C E G A: sem baixo, C ou Am são possíveis; com A no baixo é Am.
    const w = weights([60, 64, 67, 69]);
    expect(chordName(detectChord(w, 45)!)).toBe("Am");
    expect(chordName(detectChord(w, 48)!)).toBe("C");
  });

  it("ignora a sétima e fica com a tríade", () => {
    expect(chordName(detectChord(weights([43, 47, 50, 53]), 43)!)).toBe("G"); // G7
  });

  it("monta tríades fechadas perto do acorde anterior", () => {
    const c = voiceTriad({ root: 0, quality: "major" }, null);
    expect(c).toEqual([48, 52, 55]); // estado fundamental perto do centro da faixa
    const f = voiceTriad({ root: 5, quality: "major" }, c);
    expect(f).toEqual([48, 53, 57]); // C-E-G → C-F-A: o dó fica, as outras sobem pouco
    for (const v of [c, f]) expect(v[2] - v[0]).toBeLessThan(12);
  });

  it("posiciona uma nota perto da referência", () => {
    expect(placeNote(7, 45, 36, 52)).toBe(43);
    expect(placeNote(0, 50, 36, 52)).toBe(48);
  });
});

describe("encaixe", () => {
  it("escolhe a oitava que cabe na faixa", () => {
    expect(fitOctave([40, 43, 45, 47], 60, 84)).toBe(24);
    expect(fitOctave([72, 76, 79], 60, 84)).toBe(0);
    expect(fitOctave([], 60, 84)).toBe(0);
  });

  it("dobra notas que sobram", () => {
    expect(fold(100, 36, 96)).toBe(88);
    expect(fold(30, 36, 96)).toBe(42);
    expect(fold(60, 36, 96)).toBe(60);
  });
});

describe("tempos fortes", () => {
  it("agrupa por compasso", () => {
    expect(strongBeats(4, 4)).toEqual([2, 2]);
    expect(strongBeats(3, 4)).toEqual([3]);
    expect(strongBeats(2, 4)).toEqual([2]);
    expect(strongBeats(6, 8)).toEqual([3, 3]);
    expect(strongBeats(12, 8)).toEqual([3, 3, 3, 3]);
    expect(strongBeats(5, 4)).toEqual([2, 3]);
    expect(strongBeats(7, 8)).toEqual([2, 2, 3]);
  });

  it("converte grupos em figuras", () => {
    expect(figureFor(2, 4)).toEqual({ duration: 2, dots: 0 }); // mínima
    expect(figureFor(3, 4)).toEqual({ duration: 2, dots: 1 }); // mínima pontuada
    expect(figureFor(3, 8)).toEqual({ duration: 4, dots: 1 }); // semínima pontuada
    expect(figureFor(4, 4)).toEqual({ duration: 1, dots: 0 });
    expect(figureFor(5, 4)).toBeNull();
  });
});

describe("dificuldade", () => {
  it("cresce com densidade, mãos e acordes", () => {
    const slow = Array.from({ length: 20 }, (_, i) => i * 1000);
    const fast = Array.from({ length: 200 }, (_, i) => i * 100);
    expect(
      estimateDifficulty({ noteTimes: slow, maxChord: 1, bothHands: false, range: [60, 72] }),
    ).toBe(1);
    expect(
      estimateDifficulty({ noteTimes: fast, maxChord: 4, bothHands: true, range: [36, 90] }),
    ).toBe(5);
    const mid = estimateDifficulty({
      noteTimes: slow.map((t) => t / 2.5),
      maxChord: 3,
      bothHands: true,
      range: [48, 76],
    });
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(5);
  });
});
