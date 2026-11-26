import { useEffect, useRef } from "react";
import { api, type StudyKind } from "../api";

/** Sem tecla por mais que isto, o tempo para de contar. */
export const IDLE_MS = 60_000;
/** Sessões mais curtas que isto não são gravadas. */
export const MIN_SESSION_MS = 5_000;

/**
 * Tempo ativo de estudo: soma os intervalos entre toques (teclas, respostas)
 * de até `IDLE_MS`; pausas maiores não contam.
 */
export class ActiveTimer {
  startedAt: number | null = null;
  private last = 0;
  activeMs = 0;

  constructor(private readonly idleMs = IDLE_MS) {}

  touch(now: number) {
    if (this.startedAt === null) {
      this.startedAt = now;
    } else {
      const gap = now - this.last;
      if (gap > 0 && gap <= this.idleMs) this.activeMs += gap;
    }
    this.last = now;
  }

  /** Devolve a sessão (início e tempo ativo) e recomeça do zero. */
  take(): { startedAt: number; durationMs: number } | null {
    const session =
      this.startedAt === null ? null : { startedAt: this.startedAt, durationMs: this.activeMs };
    this.startedAt = null;
    this.activeMs = 0;
    return session;
  }
}

/**
 * Mede o tempo ativo numa tela de estudo e grava em `study_sessions` ao
 * chamar `flush` (fim da rodada) e ao sair da tela.
 */
export function useStudyTimer(kind: StudyKind, onSaved?: () => void) {
  const timer = useRef(new ActiveTimer());
  const kindRef = useRef(kind);
  const savedRef = useRef(onSaved);
  savedRef.current = onSaved;

  const flush = useRef(() => {
    const s = timer.current.take();
    if (!s || s.durationMs < MIN_SESSION_MS) return;
    api.study
      .save({ kind: kindRef.current, ...s })
      .then(() => savedRef.current?.())
      .catch(() => undefined);
  }).current;

  // Trocar o tipo (ex.: treino → teste) fecha a sessão anterior.
  useEffect(() => {
    if (kindRef.current !== kind) {
      flush();
      kindRef.current = kind;
    }
  }, [kind, flush]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const touch = useRef(() => timer.current.touch(Date.now())).current;
  return { touch, flush };
}
