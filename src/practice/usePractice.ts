import { useCallback, useEffect, useRef, useState } from "react";
import * as alphaTab from "@coderline/alphatab";
import { api as backend } from "../api";
import {
  PlayAlongJudge,
  WaitSession,
  addToStats,
  count,
  emptyStats,
  emptyTally,
  type Judgement,
  type Range,
  type Stats,
  type Tally,
} from "./engine";
import { DEFAULT_RAMP, afterPass } from "./drill";
import { type HandChoice, type Step, type TempoMap, type TimelineNote } from "./timeline";

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
  /** Andamento atual (1 = 100%). */
  speed: number;
  setMutedHands: (hands: HandChoice | null) => void;
  /** Trecho A–B escolhido (null = música inteira) e se ele repete. */
  range: Range | null;
  loop: boolean;
  /** Pede ao app para mudar o andamento (em %), usado pela rampa. */
  onSpeed: (percent: number) => void;
  /** Volta limpa no andamento final do trecho. */
  onMastered?: () => void;
  /** Atraso calibrado (ms reais) entre o som e o toque do aluno. */
  latencyMs?: number;
}

export interface PracticeState {
  mode: Mode;
  hands: HandChoice;
  metronome: boolean;
  countIn: boolean;
  /** No loop do modo Tocar junto, sobe o andamento a cada volta limpa. */
  ramp: boolean;
  running: boolean;
  tally: Tally;
  /** Onde se errou nesta sessão (vai para o mapa de erros). */
  stats: Stats;
  /** Voltas completas no trecho e erros na volta atual. */
  passes: number;
  passErrors: number;
  /** Retorno da última volta ("Limpo! 70%"). */
  passMessage: string | null;
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
  ramp: true,
  running: false,
  tally: emptyTally(),
  stats: emptyStats(),
  passes: 0,
  passErrors: 0,
  passMessage: null,
  last: null,
  waiting: new Set(),
  flashes: new Map(),
  finished: false,
};

const flashOf = (j: Judgement): Flash =>
  j.verdict === "hit" ? "good" : j.verdict === "early" || j.verdict === "late" ? "off" : "bad";

const isError = (j: Judgement) => j.verdict === "wrong" || j.verdict === "miss";

export function usePractice(options: Options) {
  const { apiRef, timeline, tempo, setMutedHands } = options;
  const [state, setState] = useState<PracticeState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Valores mais recentes para os callbacks do alphaTab e para recomeçar o loop.
  const latest = useRef(options);
  latest.current = options;

  const wait = useRef<WaitSession | null>(null);
  const judge = useRef<PlayAlongJudge | null>(null);
  const position = useRef({ tick: 0, at: 0 });
  const passErrors = useRef(0);
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

  /** Soma avaliações no placar e no mapa de erros. */
  const record = useCallback((judgements: Judgement[], expectedDelta = 0) => {
    if (judgements.length === 0 && expectedDelta === 0) return;
    const errors = judgements.filter(isError).length;
    passErrors.current += errors;
    setState((s) => {
      let tally = { ...s.tally, expected: s.tally.expected + expectedDelta };
      let stats = s.stats;
      for (const j of judgements) {
        tally = count(tally, j.verdict);
        stats = addToStats(stats, j);
      }
      return {
        ...s,
        tally,
        stats,
        passErrors: s.passErrors + errors,
        last: judgements[judgements.length - 1] ?? s.last,
      };
    });
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

  /** Fim de uma volta no trecho: rampa de andamento e trecho dominado. */
  const endPass = useCallback((usesTempo: boolean) => {
    const clean = passErrors.current === 0;
    passErrors.current = 0;
    const { speed, onSpeed, onMastered } = latest.current;
    const percent = Math.round(speed * 100);
    let message = clean ? "Volta limpa!" : "Volta com erros: repete no mesmo andamento";
    let mastered = clean && !usesTempo;
    if (usesTempo && stateRef.current.ramp) {
      const next = afterPass(percent, clean);
      mastered = next.mastered;
      if (next.speed !== percent) {
        onSpeed(next.speed);
        message = `Volta limpa! Andamento ${next.speed}%`;
      }
    }
    if (mastered) message = "Trecho dominado!";
    setState((s) => ({ ...s, passes: s.passes + 1, passErrors: 0, passMessage: message }));
    if (mastered) onMastered?.();
    return clean;
  }, []);

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
      const ms =
        next && tempo ? (tempo.ms(next.tick) - tempo.ms(step.tick)) / latest.current.speed : 0;
      timer.current = window.setTimeout(() => {
        const passes = session.passes;
        session.advance();
        if (session.passes > passes) endPass(false);
        enterStep();
      }, ms);
    }
  }, [apiRef, tempo, finish, releaseAccompaniment, endPass]);

  // ------------------------------------------------------------ tocar junto

  /** O atraso calibrado em ms de música (o aluno ouve e responde depois). */
  const lag = () => (latest.current.latencyMs ?? 0) * latest.current.speed;

  const songMs = useCallback(() => {
    if (!tempo) return 0;
    const elapsed = Math.min(performance.now() - position.current.at, MAX_EXTRAPOLATION_MS);
    return tempo.ms(position.current.tick) + elapsed * latest.current.speed;
  }, [tempo]);

  const newJudge = useCallback(
    (speed: number, fromTick: number) => {
      if (!tempo) return null;
      const { range, loop } = latest.current;
      return new PlayAlongJudge(
        timeline.flatMap((s) => s.notes),
        stateRef.current.hands,
        (t) => tempo.ms(t),
        speed,
        tempo.ms(fromTick),
        loop ? range : null,
      );
    },
    [tempo, timeline],
  );

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const offPosition = api.playerPositionChanged.on((e) => {
      position.current = { tick: e.currentTick, at: performance.now() };
      const j = judge.current;
      if (!j || !tempo) return;
      const missed = j.sweep(tempo.ms(e.currentTick) - lag());
      record(missed, missed.length);
    });
    const offFinished = api.playerFinished.on(() => {
      const j = judge.current;
      if (!j) return;
      const { range, loop } = latest.current;
      // Com o trecho repetindo, o alphaTab avisa o fim de cada volta e volta ao início.
      if (loop && range) {
        const missed = j.sweep(Infinity);
        record(missed, missed.length);
        endPass(true);
        // Se a rampa subiu o andamento, o efeito de andamento troca o juiz de novo.
        judge.current = newJudge(latest.current.speed, range.startTick);
        position.current = { tick: range.startTick, at: performance.now() };
        return;
      }
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
  }, [apiRef, tempo, finish, record, endPass, newJudge]);

  // O andamento mudou durante a prática (rampa ou usuário): o juiz passa a usar o
  // novo a partir da posição atual (as notas já avaliadas não voltam).
  const speed = options.speed;
  useEffect(() => {
    const api = apiRef.current;
    if (!judge.current || !api) return;
    judge.current = newJudge(speed, api.tickPosition);
  }, [speed, apiRef, newJudge]);

  // ------------------------------------------------------------- comandos

  const start = useCallback(() => {
    const api = apiRef.current;
    if (!api || !tempo || timeline.length === 0) return;
    const { mode, hands, ramp } = stateRef.current;
    const { range, loop, onSpeed } = latest.current;
    finish();
    passErrors.current = 0;
    setState((s) => ({
      ...s,
      running: true,
      finished: false,
      tally: emptyTally(),
      stats: emptyStats(),
      passes: 0,
      passErrors: 0,
      passMessage: null,
      last: null,
    }));

    const looping = loop && range !== null;
    if (mode === "wait") {
      api.pause();
      let startTick = looping
        ? range.startTick
        : // No fim da música, recomeça do início.
          api.tickPosition >= timeline[timeline.length - 1].tick
          ? 0
          : api.tickPosition;
      if (range && !looping && (startTick < range.startTick || startTick >= range.endTick)) {
        startTick = range.startTick;
      }
      wait.current = new WaitSession(timeline, hands, startTick, range, looping);
      enterStep();
    } else if (mode === "play") {
      let speed = latest.current.speed;
      if (looping && ramp) {
        speed = DEFAULT_RAMP.start / 100;
        onSpeed(DEFAULT_RAMP.start);
      }
      const from = looping ? range.startTick : api.tickPosition;
      if (looping) api.tickPosition = range.startTick;
      judge.current = newJudge(speed, from);
      position.current = { tick: from, at: performance.now() };
      api.play();
    }
  }, [apiRef, tempo, timeline, finish, enterStep, newJudge]);

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
        const bar = session.step?.notes[0]?.bar;
        const passes = session.passes;
        const result = session.press(key);
        if (result.type === "ignored") return;
        if (result.type === "wrong") {
          flash(key, "bad");
          record([{ verdict: "wrong", key, bar: result.bar, expected: result.expected }]);
          return;
        }
        flash(key, "good");
        record([{ verdict: "hit", key, bar }], result.type === "advance" ? required : 0);
        setState((s) => ({ ...s, waiting: new Set(session.missing()) }));
        if (result.type === "advance") {
          if (session.passes > passes) endPass(false);
          enterStep();
        }
        return;
      }

      const j = judge.current;
      if (j && apiRef.current?.playerState === alphaTab.synth.PlayerState.Playing) {
        const result = j.press(key, songMs() - lag());
        flash(key, flashOf(result));
        record([result], result.verdict === "wrong" ? 0 : 1);
      }
    },
    [apiRef, flash, record, enterStep, endPass, songMs],
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
