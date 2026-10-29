import { useCallback, useEffect, useRef, useState } from "react";
import * as alphaTab from "@coderline/alphatab";
import { api as backend } from "../api";
import {
  PlayAlongJudge,
  WaitSession,
  count,
  emptyTally,
  type Judgement,
  type Tally,
} from "./engine";
import type { HandChoice, Step, TempoMap, TimelineNote } from "./timeline";

export type Mode = "listen" | "wait" | "play";

/** Resultado mostrado na tecla por alguns instantes. */
export type Flash = "good" | "off" | "bad";

const FLASH_MS = 350;
/** Velocidade das notas que o app toca pela mão não praticada. */
const ACCOMPANIMENT_VELOCITY = 70;
/** Durante a contagem a posição não anda; não extrapolar além disso. */
const MAX_EXTRAPOLATION_MS = 120;

interface Options {
  apiRef: React.RefObject<alphaTab.AlphaTabApi | null>;
  timeline: Step[];
  tempo: TempoMap | null;
  speed: number;
  setMutedHands: (hands: HandChoice | null) => void;
}

export interface PracticeState {
  mode: Mode;
  hands: HandChoice;
  metronome: boolean;
  countIn: boolean;
  running: boolean;
  tally: Tally;
  /** Última avaliação, para o texto de retorno. */
  last: Judgement | null;
  /** Teclas que o aluno precisa tocar agora (modo espera). */
  waiting: Set<number>;
  flashes: Map<number, Flash>;
  finished: boolean;
}

const INITIAL: PracticeState = {
  mode: "listen",
  hands: "right",
  metronome: false,
  countIn: true,
  running: false,
  tally: emptyTally(),
  last: null,
  waiting: new Set(),
  flashes: new Map(),
  finished: false,
};

const flashOf = (j: Judgement): Flash =>
  j.verdict === "hit" ? "good" : j.verdict === "early" || j.verdict === "late" ? "off" : "bad";

export function usePractice({ apiRef, timeline, tempo, speed, setMutedHands }: Options) {
  const [state, setState] = useState<PracticeState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  const wait = useRef<WaitSession | null>(null);
  const judge = useRef<PlayAlongJudge | null>(null);
  const position = useRef({ tick: 0, at: 0 });
  const sounding = useRef<TimelineNote[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const flashTimers = useRef(new Map<number, number>());

  // As mãos praticadas não tocam na reprodução quando o aluno toca junto.
  const { mode, hands, metronome, countIn } = state;
  useEffect(() => {
    setMutedHands(mode === "play" ? hands : null);
  }, [mode, hands, setMutedHands]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.metronomeVolume = mode !== "wait" && metronome ? 1 : 0;
    api.countInVolume = mode === "play" && countIn ? 1 : 0;
  }, [apiRef, mode, metronome, countIn]);

  const flash = useCallback((key: number, kind: Flash) => {
    window.clearTimeout(flashTimers.current.get(key));
    setState((s) => ({ ...s, flashes: new Map(s.flashes).set(key, kind) }));
    flashTimers.current.set(
      key,
      window.setTimeout(() => {
        setState((s) => {
          const flashes = new Map(s.flashes);
          flashes.delete(key);
          return { ...s, flashes };
        });
      }, FLASH_MS),
    );
  }, []);

  const releaseAccompaniment = useCallback((untilTick = Infinity) => {
    sounding.current = sounding.current.filter((n) => {
      if (n.endTick > untilTick) return true;
      backend.playNote(n.key, 0);
      return false;
    });
  }, []);

  const finish = useCallback(() => {
    window.clearTimeout(timer.current);
    releaseAccompaniment();
    wait.current = null;
    judge.current = null;
    setState((s) => ({ ...s, running: false, waiting: new Set() }));
  }, [releaseAccompaniment]);

  // ------------------------------------------------------------ modo espera

  const enterStep = useCallback(() => {
    const session = wait.current;
    const api = apiRef.current;
    if (!session || !api) return;
    window.clearTimeout(timer.current);

    const step = session.step;
    if (!step) {
      finish();
      setState((s) => ({ ...s, finished: true }));
      return;
    }
    api.tickPosition = step.tick;
    releaseAccompaniment(step.tick);
    for (const n of session.accompaniment()) {
      backend.playNote(n.key, ACCOMPANIMENT_VELOCITY);
      sounding.current.push(n);
    }
    setState((s) => ({ ...s, waiting: new Set(session.missing()) }));

    // Passo sem notas do aluno: o app segue sozinho no andamento escolhido.
    if (session.required().length === 0) {
      const next = session.steps[session.index + 1];
      const ms = next && tempo ? (tempo.ms(next.tick) - tempo.ms(step.tick)) / speed : 0;
      timer.current = window.setTimeout(() => {
        session.advance();
        enterStep();
      }, ms);
    }
  }, [apiRef, tempo, speed, finish, releaseAccompaniment]);

  // ------------------------------------------------------------ tocar junto

  const songMs = useCallback(() => {
    if (!tempo) return 0;
    const elapsed = Math.min(performance.now() - position.current.at, MAX_EXTRAPOLATION_MS);
    return tempo.ms(position.current.tick) + elapsed * speed;
  }, [tempo, speed]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const offPosition = api.playerPositionChanged.on((e) => {
      position.current = { tick: e.currentTick, at: performance.now() };
      const j = judge.current;
      if (!j || !tempo) return;
      const missed = j.sweep(tempo.ms(e.currentTick));
      if (missed.length === 0) return;
      setState((s) => {
        const tally = missed.reduce(
          (t) => count({ ...t, expected: t.expected + 1 }, "miss"),
          s.tally,
        );
        return { ...s, tally, last: missed[missed.length - 1] };
      });
    });
    const offFinished = api.playerFinished.on(() => {
      if (!judge.current) return;
      finish();
      setState((s) => ({ ...s, finished: true }));
    });
    const offState = api.playerStateChanged.on((e) => {
      // Parou pela barra (pausa/parar): encerra a avaliação.
      if (judge.current && e.stopped) finish();
    });
    return () => {
      offPosition();
      offFinished();
      offState();
    };
  }, [apiRef, tempo, finish]);

  // ------------------------------------------------------------- comandos

  const start = useCallback(() => {
    const api = apiRef.current;
    if (!api || !tempo || timeline.length === 0) return;
    const { mode, hands } = stateRef.current;
    finish();
    setState((s) => ({ ...s, running: true, finished: false, tally: emptyTally(), last: null }));

    if (mode === "wait") {
      api.pause();
      // No fim da música, recomeça do início.
      const startTick =
        api.tickPosition >= timeline[timeline.length - 1].tick ? 0 : api.tickPosition;
      wait.current = new WaitSession(timeline, hands, startTick);
      enterStep();
    } else if (mode === "play") {
      const notes = timeline.flatMap((s) => s.notes);
      judge.current = new PlayAlongJudge(
        notes,
        hands,
        (t) => tempo.ms(t),
        speed,
        tempo.ms(api.tickPosition),
      );
      position.current = { tick: api.tickPosition, at: performance.now() };
      api.play();
    }
  }, [apiRef, tempo, timeline, speed, finish, enterStep]);

  const stop = useCallback(() => {
    apiRef.current?.pause();
    finish();
  }, [apiRef, finish]);

  /** Nota tocada pelo aluno (teclado MIDI ou mouse). */
  const onNote = useCallback(
    (key: number) => {
      const session = wait.current;
      if (session) {
        const required = session.required().length;
        const result = session.press(key);
        if (result.type === "ignored") return;
        if (result.type === "wrong") {
          flash(key, "bad");
          setState((s) => ({
            ...s,
            tally: count(s.tally, "wrong"),
            last: { verdict: "wrong", key },
          }));
          return;
        }
        flash(key, "good");
        setState((s) => ({
          ...s,
          tally: count(
            result.type === "advance"
              ? { ...s.tally, expected: s.tally.expected + required }
              : s.tally,
            "hit",
          ),
          last: { verdict: "hit", key },
          waiting: new Set(session.missing()),
        }));
        if (result.type === "advance") enterStep();
        return;
      }

      const j = judge.current;
      if (j && apiRef.current?.playerState === alphaTab.synth.PlayerState.Playing) {
        const result = j.press(key, songMs());
        flash(key, flashOf(result));
        setState((s) => ({
          ...s,
          tally:
            result.verdict === "wrong"
              ? count(s.tally, "wrong")
              : count({ ...s.tally, expected: s.tally.expected + 1 }, result.verdict),
          last: result,
        }));
      }
    },
    [apiRef, flash, enterStep, songMs],
  );

  // Trocar de partitura, faixa ou modo encerra a sessão em andamento.
  useEffect(() => finish, [timeline, finish]);

  const set = useCallback(
    <K extends keyof PracticeState>(key: K, value: PracticeState[K]) => {
      if (key === "mode" || key === "hands") stop();
      setState((s) => ({ ...s, [key]: value, ...(key === "mode" ? { finished: false } : {}) }));
    },
    [stop],
  );

  return { state, start, stop, onNote, set };
}
