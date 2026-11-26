import type { ReadingTestResult } from "../api";
import { cardId, type Card, type Clef } from "./cards";

export const TEST_SIZE = 20;

/** Sorteia as notas do teste, sem repetir a anterior. */
export function testDeck(
  candidates: { clef: Clef; key: number }[],
  pick: (candidates: { clef: Clef; key: number }[], previous: string | null) => Card,
  size = TEST_SIZE,
): Card[] {
  if (!candidates.length) return [];
  const deck: Card[] = [];
  for (let i = 0; i < size; i++) {
    const prev = deck.length ? cardId(deck[i - 1].clef, deck[i - 1].key) : null;
    deck.push(pick(candidates, prev));
  }
  return deck;
}

/** Melhor tempo e os últimos 10 testes (do mais antigo ao mais novo). */
export function testStats(tests: ReadingTestResult[], last = 10) {
  const best = tests.reduce<ReadingTestResult | null>(
    (b, t) => (!b || t.totalMs < b.totalMs ? t : b),
    null,
  );
  const recent = [...tests]
    .sort((a, b) => b.takenAt - a.takenAt)
    .slice(0, last)
    .reverse();
  return { best, recent };
}

/** Melhor tempo (ms) para estas claves, ou null. */
export const bestTestMs = (tests: ReadingTestResult[], clefs: ReadingTestResult["clefs"]) =>
  testStats(tests.filter((t) => t.clefs === clefs)).best?.totalMs ?? null;
