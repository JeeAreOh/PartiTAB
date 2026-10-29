import { describe, expect, it } from "vitest";
import { PlayAlongJudge, WaitSession, accuracy, count, emptyTally, score } from "./engine";
import {
  TempoMap,
  buildTimeline,
  handOf,
  removeHandNotes,
  type TickCacheLike,
  type TimelineNote,
} from "./timeline";

const Q = 960;

/** Monta um tickCache mínimo: cada beat é [início, duração, pauta, notas]. */
function cache(
  beats: [number, number, number, number[], boolean?][],
  staves = 2,
  tempo = 120,
  track = 0,
): TickCacheLike {
  const trackObj = { index: track, staves: Array(staves).fill(null) };
  const staffs = [0, 1].map((index) => ({ index, track: trackObj }));
  const objs = beats.map(([start, duration, staff, keys, tie]) => ({
    start,
    beat: {
      playbackDuration: duration,
      notes: keys.map((k) => ({ realValue: k, isTieDestination: !!tie })),
      voice: { bar: { staff: staffs[staff] } },
    },
  }));
  // Uma fatia por início distinto; cada fatia destaca os beats que soam nela.
  const starts = [...new Set(objs.map((o) => o.start))].sort((a, b) => a - b);
  const lookups = starts.map((s) => ({
    start: s,
    highlightedBeats: objs
      .filter((o) => o.start <= s && s < o.start + o.beat.playbackDuration)
      .map((o) => ({ beat: o.beat, playbackStart: o.start })),
    nextBeat: null as unknown,
  }));
  lookups.forEach((l, i) => (l.nextBeat = lookups[i + 1] ?? null));
  return {
    masterBars: [
      {
        start: 0,
        tempoChanges: [{ tick: 0, tempo }],
        firstBeat: (lookups[0] as TickCacheLike["masterBars"][0]["firstBeat"]) ?? null,
      },
    ],
  };
}

describe("buildTimeline", () => {
  it("agrupa notas por início e separa mãos pela pauta", () => {
    const steps = buildTimeline(
      cache([
        [0, Q, 0, [64]],
        [0, 4 * Q, 1, [48, 52]],
        [Q, Q, 0, [65]],
      ]),
      0,
    );
    expect(steps.map((s) => s.tick)).toEqual([0, Q]);
    expect(steps[0].notes.map((n) => [n.key, n.hand])).toEqual([
      [48, "left"],
      [52, "left"],
      [64, "right"],
    ]);
    // A semibreve da mão esquerda aparece nas duas fatias mas só começa uma vez.
    expect(steps[1].notes.map((n) => n.key)).toEqual([65]);
    expect(steps[0].notes[0].endTick).toBe(4 * Q);
  });

  it("usa o início de cada compasso e repete os compassos repetidos", () => {
    const c = cache([[0, Q, 0, [60]]]);
    // O mesmo compasso tocado de novo (repetição) a partir do pulso 4Q.
    c.masterBars.push({ ...c.masterBars[0], start: 4 * Q, tempoChanges: [] });
    const steps = buildTimeline(c, 0);
    expect(steps.map((s) => [s.tick, s.notes[0].endTick])).toEqual([
      [0, Q],
      [4 * Q, 5 * Q],
    ]);
  });

  it("ignora notas ligadas e faixas de outros instrumentos", () => {
    const steps = buildTimeline(
      cache([
        [0, Q, 0, [60]],
        [Q, Q, 0, [60], true],
      ]),
      0,
    );
    expect(steps.map((s) => s.tick)).toEqual([0]);
    expect(buildTimeline(cache([[0, Q, 0, [60]]], 2, 120, 3), 0)).toEqual([]);
  });

  it("sem pauta dupla divide as mãos no dó central", () => {
    expect(handOf(0, 1, 60)).toBe("right");
    expect(handOf(0, 1, 59)).toBe("left");
    expect(handOf(1, 2, 80)).toBe("left");
  });
});

describe("TempoMap", () => {
  it("converte pulsos em ms com mudanças de andamento", () => {
    const c = cache([[0, Q, 0, [60]]], 2, 120);
    c.masterBars.push({
      start: 4 * Q,
      tempoChanges: [{ tick: 4 * Q, tempo: 60 }],
      firstBeat: null,
    });
    const map = new TempoMap(c);
    expect(map.ms(Q)).toBe(500);
    expect(map.ms(4 * Q)).toBe(2000);
    expect(map.ms(5 * Q)).toBe(3000);
    expect(map.tempoAt(5 * Q)).toBe(60);
  });
});

describe("WaitSession", () => {
  const steps = buildTimeline(
    cache([
      [0, Q, 0, [64, 67]],
      [0, Q, 1, [48]],
      [Q, Q, 1, [50]],
      [2 * Q, Q, 0, [65]],
    ]),
    0,
  );

  it("só avança quando o acorde inteiro da mão escolhida é tocado", () => {
    const s = new WaitSession(steps, "right");
    expect(s.accompaniment().map((n) => n.key)).toEqual([48]);
    expect(s.press(64)).toEqual({ type: "partial", key: 64 });
    expect(s.press(61)).toEqual({ type: "wrong", key: 61 });
    expect(s.missing()).toEqual([67]);
    expect(s.press(67)).toEqual({ type: "advance", key: 67 });
    // Passo só da mão esquerda: nada a tocar, o app avança sozinho.
    expect(s.required()).toEqual([]);
    s.advance();
    expect(s.press(65).type).toBe("advance");
    expect(s.done).toBe(true);
  });

  it("começa no passo da posição atual do cursor", () => {
    expect(new WaitSession(steps, "both", Q).step?.tick).toBe(Q);
    expect(new WaitSession(steps, "both", Q + 10).step?.tick).toBe(Q);
    expect(new WaitSession(steps, "both", 5).step?.tick).toBe(0);
  });
});

describe("PlayAlongJudge", () => {
  const notes: TimelineNote[] = [
    { key: 60, hand: "right", tick: 0, endTick: Q },
    { key: 62, hand: "right", tick: Q, endTick: 2 * Q },
    { key: 48, hand: "left", tick: Q, endTick: 2 * Q },
    { key: 64, hand: "right", tick: 2 * Q, endTick: 3 * Q },
  ];
  const toMs = (tick: number) => (tick / Q) * 500;

  it("classifica no tempo, adiantada, atrasada e errada", () => {
    const j = new PlayAlongJudge(notes, "right", toMs, 1);
    expect(j.total).toBe(3);
    expect(j.press(60, 20)).toEqual({ verdict: "hit", key: 60, deltaMs: 20 });
    expect(j.press(62, 380)).toEqual({ verdict: "early", key: 62, deltaMs: -120 });
    expect(j.press(48, 500).verdict).toBe("wrong"); // mão não praticada
    expect(j.press(64, 1150)).toEqual({ verdict: "late", key: 64, deltaMs: 150 });
    expect(j.press(64, 1160).verdict).toBe("wrong"); // já contada
  });

  it("marca perdidas depois da janela", () => {
    const j = new PlayAlongJudge(notes, "both", toMs, 1);
    expect(j.sweep(150)).toEqual([]);
    // A 800 ms, as notas de 0 e 500 ms já passaram da janela de 200 ms.
    const missed = j.sweep(800).map((m) => m.key);
    expect(missed.sort((a, b) => a - b)).toEqual([48, 60, 62]);
  });

  it("no andamento lento, a janela e o atraso são medidos em tempo real", () => {
    const j = new PlayAlongJudge(notes, "right", toMs, 0.5);
    // 50 ms de música a 50% = 100 ms reais: atrasada.
    expect(j.press(60, 50)).toEqual({ verdict: "late", key: 60, deltaMs: 100 });
  });

  it("começa a contar a partir da posição de início", () => {
    expect(new PlayAlongJudge(notes, "right", toMs, 1, 500).total).toBe(2);
  });
});

describe("pontuação", () => {
  it("calcula pontos e precisão", () => {
    let t = emptyTally();
    for (const v of ["hit", "hit", "early", "miss"] as const) t = count(t, v);
    t = { ...count(t, "wrong"), expected: 4 };
    expect(score(t)).toBe(50); // (2 + 0,5 - 0,5) / 4
    expect(accuracy(t)).toBe(60); // 3 certas de 5
    expect(score(emptyTally())).toBe(0);
  });
});

describe("removeHandNotes", () => {
  it("remove só as notas da mão praticada, no canal da faixa", () => {
    const steps = buildTimeline(
      cache([
        [0, Q, 0, [64]],
        [0, Q, 1, [48]],
      ]),
      0,
    );
    const ev = (tick: number, type: number, channel: number, noteKey: number) => ({
      tick,
      type,
      channel,
      noteKey,
    });
    const tracks = [
      { events: [ev(10, 128, 0, 64), ev(10, 128, 0, 48), ev(10, 128, 5, 64), ev(970, 144, 0, 64)] },
    ];
    const removed = removeHandNotes(tracks, {
      steps,
      hands: "right",
      channels: new Set([0, 1]),
      tickShift: 10,
      noteOnType: 128,
    });
    expect(removed).toBe(1);
    expect(tracks[0].events.map((e) => [e.channel, e.noteKey, e.type])).toEqual([
      [0, 48, 128],
      [5, 64, 128],
      [0, 64, 144],
    ]);
  });
});
