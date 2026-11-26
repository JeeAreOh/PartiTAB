/**
 * Linhas de ritmo: 4 compassos com todas as notas em Si (a linha do meio da
 * clave de sol), usando a mesma biblioteca de padrões da primeira vista.
 * Qualquer tecla vale; só o tempo é avaliado.
 */

import { writeMusicXml, type XmlNote, type XmlScore } from "../midi/musicxml";
import { barLength, levelOf, type Meter } from "../sightreading/levels";
import { fitsBar, randomBar, type Duration } from "../sightreading/rhythm";
import { mulberry32, pick } from "../util/random";

export const RHYTHM_STYLE = "Ritmo";
export const RHYTHM_BARS = 4;
/** Si4: a linha do meio da clave de sol. */
export const RHYTHM_PITCH = 71;

export interface RhythmLine {
  level: number;
  seed: number;
  title: string;
  meter: Meter;
  bpm: number;
  bars: Duration[][];
  score: XmlScore;
}

export const rhythmTitle = (level: number, seed: number) => `Ritmo · Nível ${level} · #${seed}`;

/** Mesma semente, mesma linha. */
export function generateRhythm(levelNumber: number, seed: number): RhythmLine {
  const level = levelOf(levelNumber);
  const random = mulberry32(seed >>> 0);
  const meter = pick(random, level.meters);
  const len = barLength(meter);
  const bars: Duration[][] = [];
  for (let b = 0; b < RHYTHM_BARS; b++) {
    let bar = randomBar(random, meter, level.level, "body", level.level >= 2);
    // A linha começa com nota (sem pausa no primeiro tempo).
    for (let t = 0; b === 0 && bar[0].rest && t < 10; t++)
      bar = randomBar(random, meter, level.level);
    bars.push(bar);
  }
  const notes: XmlNote[] = [];
  bars.forEach((bar, b) => {
    let pos = b * len;
    for (const d of bar) {
      if (!d.rest)
        notes.push({ start: pos, end: pos + d.length, pitch: RHYTHM_PITCH, velocity: 80 });
      pos += d.length;
    }
  });
  const title = rhythmTitle(level.level, seed >>> 0);
  const [num, den] = meter.split("/").map(Number);
  return {
    level: level.level,
    seed: seed >>> 0,
    title,
    meter,
    bpm: level.bpm,
    bars,
    score: {
      title,
      composer: RHYTHM_STYLE,
      software: "PartiTAB",
      fifths: 0,
      minor: false,
      timeSignatures: [{ unit: 0, num, den }],
      tempos: [{ unit: 0, bpm: level.bpm }],
      parts: [{ name: "Ritmo", program: 0, staves: [{ clef: "G", notes }] }],
    },
  };
}

export const rhythmXml = (line: RhythmLine) => writeMusicXml(line.score);

/** Todos os compassos completos e ao menos uma nota por compasso. */
export const validRhythm = (line: RhythmLine) =>
  line.bars.length === RHYTHM_BARS &&
  line.bars.every((b) => fitsBar(b, line.meter) && b.some((d) => !d.rest));
