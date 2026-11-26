import type { Attempt } from "../api";
import type { Exercise } from "./exercises";

/** Precisão mínima (%) para uma execução contar como limpa. */
export const CLEAN_ACCURACY = 95;
/** Execuções limpas seguidas antes de sugerir subir o andamento. */
export const CLEAN_STREAK = 3;
export const BPM_STEP = 4;

/** Tocar junto, até o fim, com precisão ≥ 95%. */
export const isClean = (a: Attempt) =>
  a.mode === "play" && a.completed && a.accuracy >= CLEAN_ACCURACY;

/** Andamento efetivo (bpm) de uma execução: o do exercício × a velocidade. */
const effectiveBpm = (a: Attempt, ex: Exercise) => Math.round((ex.bpm * a.speed) / 100);

/**
 * Andamento limpo: o maior andamento efetivo entre as execuções limpas, ou
 * null se ainda não houve nenhuma.
 */
export function cleanBpm(attempts: Attempt[], ex: Exercise): number | null {
  const clean = attempts.filter(isClean);
  return clean.length ? Math.max(...clean.map((a) => effectiveBpm(a, ex))) : null;
}

/**
 * Metrônomo progressivo: depois de 3 execuções limpas seguidas (as mais
 * recentes em Tocar junto) a 100%, sugere +4 bpm. Nunca muda sozinho.
 */
export function suggestFaster(attempts: Attempt[], ex: Exercise): number | null {
  const plays = attempts
    .filter((a) => a.mode === "play")
    .sort((a, b) => (b.playedAt ?? 0) - (a.playedAt ?? 0))
    .slice(0, CLEAN_STREAK);
  if (plays.length < CLEAN_STREAK) return null;
  if (!plays.every((a) => isClean(a) && a.speed >= 100)) return null;
  return Math.min(200, ex.bpm + BPM_STEP);
}
