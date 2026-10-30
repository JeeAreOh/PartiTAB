import { describe, expect, it } from "vitest";
import * as alphaTab from "@coderline/alphatab";
import {
  isMidi,
  midiToMusicXml,
  parseMidi,
  splitHands,
  toScoreBytes,
} from "./midiToMusicXml";

const PPQ = 480;

const vlq = (n: number) => {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
};

type Ev = [tick: number, ...bytes: number[]];

function track(events: Ev[], name?: string) {
  const all: Ev[] = [...events].sort((a, b) => a[0] - b[0]);
  const bytes: number[] = [];
  if (name)
    bytes.push(
      0,
      0xff,
      0x03,
      name.length,
      ...Array.from(name, (c) => c.charCodeAt(0)),
    );
  let last = 0;
  for (const [tick, ...data] of all) {
    bytes.push(...vlq(tick - last), ...data);
    last = tick;
  }
  bytes.push(0, 0xff, 0x2f, 0);
  return [
    0x4d,
    0x54,
    0x72,
    0x6b,
    0,
    (bytes.length >> 16) & 0xff,
    (bytes.length >> 8) & 0xff,
    bytes.length & 0xff,
    ...bytes,
  ];
}

function midiFile(tracks: number[][]) {
  return new Uint8Array([
    0x4d,
    0x54,
    0x68,
    0x64,
    0,
    0,
    0,
    6,
    0,
    tracks.length > 1 ? 1 : 0,
    0,
    tracks.length,
    PPQ >> 8,
    PPQ & 0xff,
    ...tracks.flat(),
  ]);
}

/** Nota com início e duração em semínimas. */
const note = (
  pitch: number,
  beat: number,
  beats: number,
  channel = 0,
): Ev[] => [
  [Math.round(beat * PPQ), 0x90 | channel, pitch, 80],
  [Math.round((beat + beats) * PPQ), 0x80 | channel, pitch, 0],
];

const load = (data: Uint8Array) =>
  alphaTab.importer.ScoreLoader.loadScoreFromBytes(
    toScoreBytes(data, "Teste"),
    new alphaTab.Settings(),
  );

/** Alturas tocadas (sem ligaduras) em cada pauta, compasso a compasso. */
const pitches = (score: alphaTab.model.Score, staff: number) =>
  score.tracks[0].staves[staff].bars.map((bar) =>
    bar.voices.flatMap((v) =>
      v.beats.flatMap((b) =>
        b.notes.filter((n) => !n.isTieDestination).map((n) => n.realValue),
      ),
    ),
  );

describe("MIDI → MusicXML", () => {
  it("reconhece MIDI pelo cabeçalho", () => {
    expect(isMidi(midiFile([track(note(60, 0, 1))]))).toBe(true);
    expect(isMidi(new TextEncoder().encode("<?xml version"))).toBe(false);
  });

  it("lê notas, andamento, compasso e tonalidade", () => {
    const conductor = track(
      [
        [0, 0xff, 0x51, 3, 0x09, 0x27, 0xc0], // 600000 µs = 100 bpm
        [0, 0xff, 0x58, 4, 3, 2, 24, 8], // 3/4
        [0, 0xff, 0x59, 2, 0xff, 0], // Fá maior
      ],
      "Minueto",
    );
    const midi = parseMidi(
      midiFile([conductor, track([...note(65, 0, 1), ...note(69, 1, 2)])]),
    );
    expect(midi.title).toBe("Minueto");
    expect(midi.tempos[0].bpm).toBeCloseTo(100);
    expect(midi.timeSignatures[0]).toMatchObject({ num: 3, den: 4 });
    expect(midi.key).toEqual({ fifths: -1, minor: false });
    expect(midi.notes.map((n) => [n.pitch, n.start, n.end])).toEqual([
      [65, 0, 480],
      [69, 480, 1440],
    ]);
  });

  it("separa as mãos pelo dó central quando há uma faixa só", () => {
    const data = midiFile([
      track([
        ...note(72, 0, 1),
        ...note(76, 1, 1),
        ...note(48, 0, 2),
        ...note(55, 2, 2),
        ...note(64, 2, 2),
      ]),
    ]);
    const score = load(data);
    expect(score.title).toBe("Teste");
    expect(score.tracks).toHaveLength(1);
    expect(score.tracks[0].staves).toHaveLength(2);
    expect(pitches(score, 0)).toEqual([[72, 76, 64]]);
    expect(pitches(score, 1)).toEqual([[48, 55]]);
  });

  it("usa as faixas como mãos, pelo nome ou pela altura", () => {
    const low = track([...note(50, 0, 4)], "Piano RH");
    const high = track([...note(70, 0, 4)], "Piano LH");
    const notes = parseMidi(midiFile([low, high]));
    // O nome manda, mesmo com a direita mais grave.
    expect(splitHands(notes.notes, (i) => notes.notes[i].track, notes.trackNames)).toEqual([0, 1]);
    const unnamed = parseMidi(
      midiFile([track(note(50, 0, 4)), track(note(70, 0, 4))]),
    );
    expect(splitHands(unnamed.notes, (i) => unnamed.notes[i].track, unnamed.trackNames)).toEqual([
      1, 0,
    ]);
  });

  it("liga notas que atravessam a barra e mantém o total de compassos", () => {
    const score = load(
      midiFile([track([...note(67, 3, 2), ...note(72, 6, 2)])]),
    );
    const bars = score.tracks[0].staves[0].bars;
    expect(bars).toHaveLength(2);
    const tied = bars[1].voices[0].beats[0].notes[0];
    expect(tied.isTieDestination).toBe(true);
    expect(tied.realValue).toBe(67);
    expect(pitches(score, 0)).toEqual([[67], [72]]);
  });

  it("acordes e uma nota longa sob notas rápidas viram duas vozes", () => {
    const data = midiFile([
      track([
        ...note(60, 0, 4), // segura
        ...note(64, 0, 1),
        ...note(67, 0, 1),
        ...note(65, 1, 1),
        ...note(64, 2, 2),
      ]),
    ]);
    const score = load(data);
    const bar = score.tracks[0].staves[0].bars[0];
    const v0 = bar.voices[0].beats.map((b) =>
      b.notes.map((n) => n.realValue).sort(),
    );
    const v1 = bar.voices[1]?.beats
      .filter((b) => !b.isRest)
      .map((b) => b.notes.map((n) => n.realValue));
    expect([...v0, ...(v1 ?? [])]).toEqual(
      expect.arrayContaining([[60], [64, 67], [65], [64]]),
    );
  });

  it("ignora a bateria e recusa arquivo sem notas", () => {
    expect(() => midiToMusicXml(midiFile([track(note(36, 0, 1, 9))]))).toThrow(
      /não tem notas/,
    );
  });

  it("o MIDI gerado pela gravação do app volta como partitura", async () => {
    const { closeRecording, toMidiFile } =
      await import("../practice/recording");
    const data = toMidiFile(
      closeRecording(
        [
          { t: 0, type: "on", key: 60, velocity: 90, tick: null },
          { t: 500, type: "off", key: 60 },
          { t: 500, type: "on", key: 62, velocity: 90, tick: null },
          { t: 1000, type: "off", key: 62 },
        ],
        1000,
      ),
      "Gravação",
    );
    const score = load(data);
    expect(pitches(score, 0).flat()).toEqual([60, 62]);
  });

  it("banda: pianos juntos em duas pautas, outros instrumentos em faixas próprias", () => {
    const program = (channel: number, p: number): Ev => [0, 0xc0 | channel, p];
    const piano = track([program(0, 0), ...note(72, 0, 1, 0), ...note(48, 0, 1, 0)], "Piano");
    const bass = track([program(1, 33), ...note(40, 0, 2, 1)]);
    const flute = track([program(2, 73), ...note(79, 0, 1, 2)], "Flauta");
    const drums = track(note(36, 0, 1, 9));
    const score = load(midiFile([piano, bass, flute, drums]));
    expect(score.tracks.map((t) => t.name)).toEqual(["Piano", "Baixo", "Flauta"]);
    expect(score.tracks[0].staves).toHaveLength(2);
    expect(score.tracks[1].playbackInfo.program).toBe(33);
    expect(score.tracks[2].playbackInfo.program).toBe(73);
    expect(pitches(score, 0)).toEqual([[72]]);
    expect(pitches(score, 1)).toEqual([[48]]);
    expect(score.tracks[1].staves[0].bars[0].voices[0].beats[0].notes[0].realValue).toBe(40);
  });

  it("formato 0 com vários canais também separa os instrumentos", () => {
    const one = track([[0, 0xc1, 40], ...note(60, 0, 1, 0), ...note(76, 0, 1, 1)]);
    const score = load(midiFile([one]));
    expect(score.tracks.map((t) => t.name)).toEqual(["Piano", "Cordas"]);
  });

  it("reconhece tercinas", () => {
    const third = 1 / 3;
    const data = midiFile([
      track([
        ...note(60, 0, third),
        ...note(62, third, third),
        ...note(64, 2 * third, third),
        ...note(65, 1, 0.5),
        ...note(67, 1.5, 0.5),
        ...note(69, 2, 2),
      ]),
    ]);
    const beats = load(data).tracks[0].staves[0].bars[0].voices[0].beats;
    expect(beats.map((b) => b.notes[0]?.realValue)).toEqual([60, 62, 64, 65, 67, 69]);
    expect(beats.slice(0, 3).every((b) => b.tupletNumerator === 3)).toBe(true);
    expect(beats[3].tupletNumerator).not.toBe(3);
    expect(beats[3].duration).toBe(alphaTab.model.Duration.Eighth);
  });

  it("colcheias em swing viram colcheias normais com a indicação Swing", () => {
    const events: Ev[] = [];
    for (let beat = 0; beat < 16; beat++) {
      events.push(...note(60 + (beat % 5), beat, 2 / 3), ...note(62, beat + 2 / 3, 1 / 3));
    }
    const xml = midiToMusicXml(midiFile([track(events)]));
    expect(xml).toContain("<words>Swing</words>");
    expect(xml).not.toContain("time-modification");
    const beats = load(midiFile([track(events)])).tracks[0].staves[0].bars[0].voices[0].beats;
    expect(beats.map((b) => b.duration)).toEqual(
      Array(8).fill(alphaTab.model.Duration.Eighth),
    );
  });

  it("marcadores viram seções", () => {
    const conductor = track([
      [0, 0xff, 0x06, 5, ..."Intro".split("").map((c) => c.charCodeAt(0))],
      [4 * PPQ, 0xff, 0x06, 6, ..."Refrao".split("").map((c) => c.charCodeAt(0))],
    ]);
    const score = load(midiFile([conductor, track([...note(60, 0, 4), ...note(62, 4, 4)])]));
    expect(score.masterBars.map((m) => m.section?.marker ?? null)).toEqual(["Intro", "Refrao"]);
  });
});
