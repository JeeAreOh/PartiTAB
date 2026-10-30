/**
 * Linha do tempo das notas de uma faixa, na ordem em que são tocadas
 * (repetições já expandidas), construída a partir do `tickCache` do alphaTab.
 *
 * Os tipos abaixo descrevem só o que é lido do modelo do alphaTab, para os
 * testes poderem montar estruturas simples.
 */

export type Hand = "right" | "left";
export type HandChoice = Hand | "both";

/** Pulsos MIDI por semínima no alphaTab. */
export const TICKS_PER_QUARTER = 960;
/** Sem pauta dupla, a mão é decidida pela altura: dó central (60) para cima é direita. */
export const SPLIT_KEY = 60;

export interface TimelineNote {
  key: number;
  hand: Hand;
  tick: number;
  endTick: number;
  /** Índice do compasso (o mesmo em todas as repetições). */
  bar: number;
  /** Dedo escrito na partitura (1 = polegar), se houver. */
  finger?: number;
}

export interface Step {
  tick: number;
  notes: TimelineNote[];
}

interface NoteLike {
  realValue: number;
  isTieDestination: boolean;
  /** Dedo escrito (0 = polegar; negativo = nenhum). */
  leftHandFinger?: number;
}

interface BeatLike {
  notes: NoteLike[];
  playbackDuration: number;
  voice: { bar: { staff: { index: number; track: { index: number; staves: unknown[] } } } };
}

interface BeatLookupLike {
  start: number;
  highlightedBeats: { beat: BeatLike; playbackStart: number }[];
  nextBeat: BeatLookupLike | null;
}

export interface TickCacheLike {
  masterBars: {
    start: number;
    masterBar: { index: number };
    tempoChanges: { tick: number; tempo: number }[];
    firstBeat: BeatLookupLike | null;
  }[];
}

export const handOf = (staffIndex: number, staffCount: number, key: number): Hand =>
  staffCount >= 2 ? (staffIndex === 0 ? "right" : "left") : key >= SPLIT_KEY ? "right" : "left";

export const plays = (choice: HandChoice, hand: Hand) => choice === "both" || choice === hand;

export function buildTimeline(cache: TickCacheLike, trackIndex: number): Step[] {
  const steps = new Map<number, TimelineNote[]>();
  const seen = new Map<BeatLike, Set<number>>();

  for (const bar of cache.masterBars) {
    for (let lookup = bar.firstBeat; lookup; lookup = lookup.nextBeat) {
      for (const item of lookup.highlightedBeats) {
        const { beat } = item;
        // Os tempos do alphaTab são relativos ao início do compasso.
        const playbackStart = bar.start + item.playbackStart;
        const staff = beat.voice.bar.staff;
        if (staff.track.index !== trackIndex) continue;
        // Uma figura longa aparece em várias fatias; conta uma vez por execução
        // (numa repetição o mesmo tempo volta com outro início).
        const starts = seen.get(beat) ?? new Set<number>();
        if (starts.has(playbackStart)) continue;
        seen.set(beat, starts.add(playbackStart));

        for (const note of beat.notes) {
          if (note.isTieDestination) continue;
          const list = steps.get(playbackStart) ?? [];
          if (list.some((n) => n.key === note.realValue)) continue;
          list.push({
            key: note.realValue,
            hand: handOf(staff.index, staff.track.staves.length, note.realValue),
            tick: playbackStart,
            endTick: playbackStart + beat.playbackDuration,
            bar: bar.masterBar.index,
            finger: (note.leftHandFinger ?? -1) >= 0 ? note.leftHandFinger! + 1 : undefined,
          });
          steps.set(playbackStart, list);
        }
      }
    }
  }

  return [...steps.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tick, notes]) => ({ tick, notes: notes.sort((a, b) => a.key - b.key) }));
}

/** Converte pulsos em milissegundos de música (andamento 100%). */
export class TempoMap {
  private readonly points: { tick: number; tempo: number; ms: number }[] = [];

  constructor(cache: TickCacheLike, initialTempo = 120) {
    const changes = cache.masterBars.flatMap((b) => b.tempoChanges).sort((a, b) => a.tick - b.tick);
    let last = { tick: 0, tempo: changes[0]?.tick === 0 ? changes[0].tempo : initialTempo, ms: 0 };
    this.points.push(last);
    for (const c of changes) {
      if (c.tick <= last.tick) {
        last.tempo = c.tempo;
        continue;
      }
      const ms = last.ms + ticksToMs(c.tick - last.tick, last.tempo);
      last = { tick: c.tick, tempo: c.tempo, ms };
      this.points.push(last);
    }
  }

  ms(tick: number): number {
    const p = this.at(tick);
    return p.ms + ticksToMs(tick - p.tick, p.tempo);
  }

  tempoAt(tick: number): number {
    return this.at(tick).tempo;
  }

  private at(tick: number) {
    let found = this.points[0];
    for (const p of this.points) {
      if (p.tick > tick) break;
      found = p;
    }
    return found;
  }
}

const ticksToMs = (ticks: number, bpm: number) => (ticks * 60000) / (bpm * TICKS_PER_QUARTER);

interface MidiEventLike {
  tick: number;
  type: number;
  channel?: number;
  noteKey?: number;
}

/**
 * Tira do MIDI gerado as notas das mãos que o aluno vai tocar, para o app
 * não tocar junto com ele. Devolve quantas notas foram removidas.
 */
export function removeHandNotes(
  tracks: { events: MidiEventLike[] }[],
  options: {
    steps: Step[];
    hands: HandChoice;
    channels: Set<number>;
    /** Deslocamento dos pulsos do MIDI em relação à partitura. */
    tickShift: number;
    noteOnType: number;
  },
): number {
  const muted = new Set<string>();
  for (const step of options.steps) {
    for (const n of step.notes) if (plays(options.hands, n.hand)) muted.add(`${n.tick}:${n.key}`);
  }

  let removed = 0;
  for (const track of tracks) {
    const kept = track.events.filter((e) => {
      const drop =
        e.type === options.noteOnType &&
        options.channels.has(e.channel ?? -1) &&
        muted.has(`${e.tick - options.tickShift}:${e.noteKey}`);
      if (drop) removed++;
      return !drop;
    });
    track.events.length = 0;
    track.events.push(...kept);
  }
  return removed;
}
