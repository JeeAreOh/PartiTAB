/**
 * Correção das notas tocadas. Dois modos:
 * - `WaitSession`: a música só avança quando todas as notas do passo são tocadas.
 * - `PlayAlongJudge`: a música segue no andamento e cada nota é avaliada pelo tempo.
 */

import { plays, type HandChoice, type Step, type TimelineNote } from "./timeline";

export type Verdict = "hit" | "early" | "late" | "wrong" | "miss";

export interface Judgement {
  verdict: Verdict;
  key: number;
  /** Diferença em ms reais (negativo = adiantado). */
  deltaMs?: number;
  /** Compasso a que a avaliação pertence. */
  bar?: number;
  /** Nota que deveria ter sido tocada (numa errada, a mais próxima). */
  expected?: number;
}

/** Trecho da música em pulsos, [início, fim). */
export interface Range {
  startTick: number;
  endTick: number;
}

const inRange = (tick: number, range?: Range | null) =>
  !range || (tick >= range.startTick && tick < range.endTick);

export interface Tally {
  hit: number;
  early: number;
  late: number;
  wrong: number;
  miss: number;
  /** Notas esperadas até agora. */
  expected: number;
}

export const emptyTally = (): Tally => ({
  hit: 0,
  early: 0,
  late: 0,
  wrong: 0,
  miss: 0,
  expected: 0,
});

export function count(tally: Tally, verdict: Verdict): Tally {
  return { ...tally, [verdict]: tally[verdict] + 1 };
}

/**
 * Pontuação de 0 a 100: nota no tempo vale 1, adiantada/atrasada vale 0,5,
 * perdida vale 0; cada nota errada desconta 0,5.
 */
export function score(t: Tally): number {
  if (t.expected === 0) return 0;
  const points = t.hit + 0.5 * (t.early + t.late) - 0.5 * t.wrong;
  return Math.max(0, Math.round((100 * points) / t.expected));
}

/** Precisão: notas certas sobre tudo que foi tocado ou deveria ter sido. */
export function accuracy(t: Tally): number {
  const right = t.hit + t.early + t.late;
  const total = right + t.wrong + t.miss;
  return total === 0 ? 0 : Math.round((100 * right) / total);
}

// ------------------------------------------------------- onde se erra

export interface BarStat {
  notes: number;
  errors: number;
  timing: number;
}

export interface KeyStat {
  notes: number;
  errors: number;
}

/** Erros acumulados por compasso e por nota (alimentam o mapa de erros). */
export interface Stats {
  bars: Record<number, BarStat>;
  keys: Record<number, KeyStat>;
}

export const emptyStats = (): Stats => ({ bars: {}, keys: {} });

/**
 * Soma uma avaliação. Certa e fora do tempo contam como nota tocada (fora do
 * tempo também em `timing`); perdida conta nota e erro; errada conta só erro,
 * no compasso e na nota que deveria ter sido tocada.
 */
export function addToStats(stats: Stats, j: Judgement): Stats {
  const isNote = j.verdict !== "wrong";
  const isError = j.verdict === "wrong" || j.verdict === "miss";
  const isTiming = j.verdict === "early" || j.verdict === "late";
  const bars = { ...stats.bars };
  const keys = { ...stats.keys };
  if (j.bar !== undefined) {
    const b = bars[j.bar] ?? { notes: 0, errors: 0, timing: 0 };
    bars[j.bar] = {
      notes: b.notes + (isNote ? 1 : 0),
      errors: b.errors + (isError ? 1 : 0),
      timing: b.timing + (isTiming ? 1 : 0),
    };
  }
  const key = j.verdict === "wrong" ? j.expected : j.key;
  if (key !== undefined) {
    const k = keys[key] ?? { notes: 0, errors: 0 };
    keys[key] = { notes: k.notes + (isNote ? 1 : 0), errors: k.errors + (isError ? 1 : 0) };
  }
  return { bars, keys };
}

// ---------------------------------------------------------------- modo espera

export type WaitResult =
  | { type: "wrong"; key: number; bar?: number; expected?: number }
  | { type: "partial"; key: number }
  | { type: "advance"; key: number }
  | { type: "ignored" };

export class WaitSession {
  index = 0;
  /** Voltas completas no trecho (com `loop`). */
  passes = 0;
  readonly steps: Step[];
  private played = new Set<number>();

  /**
   * @param range só os passos deste trecho
   * @param loop ao terminar o trecho, volta ao início dele
   */
  constructor(
    steps: Step[],
    readonly hands: HandChoice,
    startTick = 0,
    range: Range | null = null,
    readonly loop = false,
  ) {
    this.steps = steps.filter((s) => inRange(s.tick, range));
    // Começa no passo em que o cursor está (o último que já começou).
    const after = this.steps.findIndex((s) => s.tick > startTick);
    this.index = Math.max(0, (after === -1 ? this.steps.length : after) - 1);
  }

  get done() {
    return this.index >= this.steps.length;
  }

  get step(): Step | undefined {
    return this.steps[this.index];
  }

  /** Notas que o aluno precisa tocar no passo atual. */
  required(step = this.step): TimelineNote[] {
    return step ? step.notes.filter((n) => plays(this.hands, n.hand)) : [];
  }

  /** Notas que o app toca sozinho no passo (a mão que não está sendo praticada). */
  accompaniment(step = this.step): TimelineNote[] {
    return step ? step.notes.filter((n) => !plays(this.hands, n.hand)) : [];
  }

  /** Notas que ainda faltam no passo atual. */
  missing(): number[] {
    return this.required()
      .map((n) => n.key)
      .filter((k) => !this.played.has(k));
  }

  press(key: number): WaitResult {
    if (this.done) return { type: "ignored" };
    const required = this.required().map((n) => n.key);
    if (!required.includes(key)) {
      return { type: "wrong", key, bar: this.step?.notes[0]?.bar, expected: this.missing()[0] };
    }
    this.played.add(key);
    if (required.every((k) => this.played.has(k))) {
      this.advance();
      return { type: "advance", key };
    }
    return { type: "partial", key };
  }

  /** Avança para o próximo passo (também usado nos passos sem notas do aluno). */
  advance() {
    this.index++;
    this.played = new Set();
    if (this.loop && this.done && this.steps.length > 0) {
      this.index = 0;
      this.passes++;
    }
  }
}

// ------------------------------------------------------------- tocar junto

/** Janelas em ms reais: dentro de ON_TIME é "no tempo"; até WINDOW conta como adiantada/atrasada. */
export const ON_TIME_MS = 70;
export const WINDOW_MS = 200;

interface Pending {
  note: TimelineNote;
  /** Momento esperado em ms de música. */
  ms: number;
  done: boolean;
}

export class PlayAlongJudge {
  private readonly pending: Pending[];
  private cursor = 0;

  /**
   * @param notes notas da faixa (todas as mãos; o filtro é feito aqui)
   * @param toMs converte pulsos em ms de música
   * @param speed andamento (1 = 100%); ms de música / speed = ms reais
   */
  constructor(
    notes: TimelineNote[],
    hands: HandChoice,
    toMs: (tick: number) => number,
    private readonly speed: number,
    startMs = 0,
    range: Range | null = null,
  ) {
    this.pending = notes
      .filter((n) => plays(hands, n.hand) && inRange(n.tick, range))
      .map((note) => ({ note, ms: toMs(note.tick), done: false }))
      .filter((p) => p.ms >= startMs - 1)
      .sort((a, b) => a.ms - b.ms);
  }

  get total() {
    return this.pending.length;
  }

  /** Nota mais próxima de `songMs` (qualquer tecla), para atribuir uma errada. */
  private nearest(songMs: number, window: number): Pending | null {
    let best: Pending | null = null;
    for (const p of this.pending) {
      if (!best || Math.abs(p.ms - songMs) < Math.abs(best.ms - songMs)) best = p;
      if (p.ms > songMs + window) break;
    }
    return best;
  }

  /** Avalia uma nota tocada no momento `songMs` (ms de música). */
  press(key: number, songMs: number): Judgement {
    const window = WINDOW_MS * this.speed;
    let best: Pending | null = null;
    for (let i = this.cursor; i < this.pending.length; i++) {
      const p = this.pending[i];
      if (p.ms > songMs + window) break;
      if (p.done || p.note.key !== key || p.ms < songMs - window) continue;
      if (!best || Math.abs(p.ms - songMs) < Math.abs(best.ms - songMs)) best = p;
    }
    if (!best) {
      const near = this.nearest(songMs, window);
      const close = near && Math.abs(near.ms - songMs) <= window;
      return {
        verdict: "wrong",
        key,
        bar: near?.note.bar,
        expected: close ? near.note.key : undefined,
      };
    }

    best.done = true;
    const deltaMs = Math.round((songMs - best.ms) / this.speed);
    const verdict = Math.abs(deltaMs) <= ON_TIME_MS ? "hit" : deltaMs < 0 ? "early" : "late";
    return { verdict, key, deltaMs, bar: best.note.bar };
  }

  /** Marca como perdidas as notas cuja janela já passou. */
  sweep(songMs: number): Judgement[] {
    const limit = songMs - WINDOW_MS * this.speed;
    const missed: Judgement[] = [];
    while (this.cursor < this.pending.length && this.pending[this.cursor].ms < limit) {
      const p = this.pending[this.cursor++];
      if (!p.done) {
        p.done = true;
        missed.push({ verdict: "miss", key: p.note.key, bar: p.note.bar });
      }
    }
    return missed;
  }
}
