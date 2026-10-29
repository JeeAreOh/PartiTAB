/**
 * Redutor para piano: cria, dentro da própria partitura, uma faixa de piano
 * em pauta dupla a partir das faixas de guitarra, baixo e voz.
 *
 * - Nível 1: só a melodia na mão direita.
 * - Nível 2: melodia + fundamental do baixo nos tempos fortes.
 * - Nível 3: melodia + tríades fechadas tiradas do acompanhamento.
 *
 * As outras faixas continuam na partitura, para tocar com a banda.
 */

import * as alphaTab from "@coderline/alphatab";
import {
  chordName,
  detectChord,
  easyTransposition,
  estimateKey,
  figureFor,
  fitOctave,
  fold,
  keySignatureOf,
  placeNote,
  strongBeats,
  voiceTriad,
  type Key,
} from "./harmony";

type Score = alphaTab.model.Score;
type Track = alphaTab.model.Track;
type Beat = alphaTab.model.Beat;
type Bar = alphaTab.model.Bar;
const { model } = alphaTab;

export type Level = 1 | 2 | 3;

export const LEVELS: [Level, string][] = [
  [1, "Nível 1 — melodia"],
  [2, "Nível 2 — melodia + baixo"],
  [3, "Nível 3 — melodia + acordes"],
];

export interface Roles {
  melody: number | null;
  bass: number | null;
}

export interface ReduceOptions {
  level: Level;
  melody: number;
  /** Leva para Dó, Sol ou Fá (ou relativas menores). */
  transpose: boolean;
}

export interface ReduceResult {
  track: number;
  key: Key;
  /** Semitons aplicados (0 sem transposição). */
  shift: number;
}

/** Pulsos por semibreve no alphaTab. */
const WHOLE = 3840;
const MELODY_RANGE: [number, number] = [53, 96];
const BASS_RANGE: [number, number] = [36, 55];
const CHORD_RANGE: [number, number] = [48, 67];
const DRUM_CHANNEL = 9;

const MELODY_NAME =
  /voc|voice|voz|vocal|melod|lead|solo|canto|sing|flaut|flute|sax|trumpet|trompete|violin/i;
const BASS_NAME = /bass|baixo/i;

const lowestString = (t: Track) => Math.min(...(t.staves[0]?.stringTuning.tunings ?? [99]), 99);

export function isBassTrack(t: Track) {
  const program = t.playbackInfo.program;
  return BASS_NAME.test(t.name) || (program >= 32 && program <= 39) || lowestString(t) <= 31;
}

/** Notas (sem percussão e sem notas mortas) de uma pauta, por compasso. */
function* notesOf(t: Track) {
  for (const staff of t.staves) {
    if (staff.isPercussion) continue;
    for (const bar of staff.bars) {
      for (const voice of bar.voices) {
        for (const beat of voice.beats) {
          for (const note of beat.notes) if (!note.isDead) yield { bar, beat, note };
        }
      }
    }
  }
}

/**
 * Adivinha qual faixa tem a melodia (voz, solo) e qual é o baixo. A melodia
 * é a faixa mais aguda e menos polifônica, com bônus pelo nome.
 */
export function guessRoles(score: Score): Roles {
  let melody: number | null = null;
  let best = -Infinity;
  let bass: number | null = null;
  for (const t of score.tracks) {
    if (t.isPercussion) continue;
    if (isBassTrack(t)) {
      bass ??= t.index;
      continue;
    }
    let sum = 0;
    let count = 0;
    let chordBeats = 0;
    let beats = 0;
    const seen = new Set<Beat>();
    for (const { beat, note } of notesOf(t)) {
      sum += note.realValue;
      count++;
      if (!seen.has(beat)) {
        seen.add(beat);
        beats++;
        if (beat.notes.length > 1) chordBeats++;
      }
    }
    if (count === 0) continue;
    const score = sum / count - 30 * (chordBeats / beats) + (MELODY_NAME.test(t.name) ? 40 : 0);
    if (score > best) {
      best = score;
      melody = t.index;
    }
  }
  return { melody, bass };
}

/** Peso (duração) de cada classe de altura em toda a partitura, sem percussão. */
function pitchWeights(score: Score) {
  const w = Array(12).fill(0);
  for (const t of score.tracks) {
    if (t.isPercussion) continue;
    for (const { beat, note } of notesOf(t)) w[note.realValue % 12] += beat.playbackDuration;
  }
  return w;
}

/** Notas soando em [start, end) do compasso `index`, nas faixas dadas. */
function soundingIn(tracks: Track[], index: number, start: number, end: number) {
  const weights = Array(12).fill(0);
  let lowest: number | undefined;
  let lowestAtStart: number | undefined;
  for (const t of tracks) {
    for (const staff of t.staves) {
      const bar = staff.bars[index];
      if (!bar || staff.isPercussion) continue;
      for (const voice of bar.voices) {
        for (const beat of voice.beats) {
          const from = Math.max(start, beat.playbackStart);
          const to = Math.min(end, beat.playbackStart + beat.playbackDuration);
          if (to <= from) continue;
          for (const note of beat.notes) {
            if (note.isDead) continue;
            const v = note.realValue;
            weights[v % 12] += to - from;
            if (lowest === undefined || v < lowest) lowest = v;
            if (beat.playbackStart <= start && (lowestAtStart === undefined || v < lowestAtStart)) {
              lowestAtStart = v;
            }
          }
        }
      }
    }
  }
  return { weights, lowest: lowestAtStart ?? lowest };
}

function newNote(midi: number) {
  const note = new model.Note();
  note.octave = Math.floor(midi / 12);
  note.tone = midi % 12;
  return note;
}

function newBeat(duration: number, dots = 0) {
  const beat = new model.Beat();
  beat.duration = duration as alphaTab.model.Duration;
  beat.dots = dots;
  return beat;
}

function copyRhythm(from: Beat, to: Beat) {
  to.duration = from.duration;
  to.dots = from.dots;
  to.tupletNumerator = from.tupletNumerator;
  to.tupletDenominator = from.tupletDenominator;
}

function newBar(
  clef: alphaTab.model.Clef,
  source: Bar | undefined,
  keySig: number | null,
  minor: boolean,
) {
  const bar = new model.Bar();
  bar.clef = clef;
  if (keySig !== null) {
    bar.keySignature = keySig as alphaTab.model.KeySignature;
    bar.keySignatureType = minor ? model.KeySignatureType.Minor : model.KeySignatureType.Major;
  } else if (source) {
    bar.keySignature = source.keySignature;
    bar.keySignatureType = source.keySignatureType;
  }
  const voice = new model.Voice();
  bar.addVoice(voice);
  return { bar, voice };
}

function freeChannels(score: Score): [number, number] {
  const used = new Set<number>([DRUM_CHANNEL]);
  for (const t of score.tracks) {
    used.add(t.playbackInfo.primaryChannel);
    used.add(t.playbackInfo.secondaryChannel);
  }
  const free = Array.from({ length: 16 }, (_, i) => i).filter((c) => !used.has(c));
  // Sem canal livre, divide com a faixa da melodia (que fica muda no modo prática).
  return [free[0] ?? 0, free[1] ?? free[0] ?? 1];
}

/**
 * Acrescenta à partitura a faixa de piano reduzida e finaliza o modelo.
 * Devolve o índice da nova faixa.
 */
export function reduceToPiano(
  score: Score,
  settings: alphaTab.Settings,
  options: ReduceOptions,
): ReduceResult {
  const source = score.tracks[options.melody];
  if (!source || source.isPercussion) throw new Error("Escolha uma faixa de melodia válida");
  const melodyStaff = source.staves[0];

  const key = estimateKey(pitchWeights(score));
  const shift = options.transpose ? easyTransposition(key) : 0;
  const targetKey: Key = { tonic: (key.tonic + shift + 12) % 12, minor: key.minor };
  const keySig = options.transpose ? keySignatureOf(targetKey) : null;

  const melodyPitches: number[] = [];
  for (const bar of melodyStaff.bars) {
    for (const beat of bar.voices[0]?.beats ?? []) {
      const top = topNote(beat);
      if (top) melodyPitches.push(top.realValue + shift);
    }
  }
  // Mão direita perto do dó central (C4–G5), mais fácil para iniciantes.
  const octave = fitOctave(melodyPitches, 60, 79);

  const others = score.tracks.filter((t) => t !== source && !t.isPercussion);
  const bassTrack = others.find(isBassTrack) ?? null;
  // Para os acordes, tudo que não é melodia (inclusive o baixo).
  const harmonyTracks = others.length > 0 ? others : [source];

  const track = new model.Track();
  track.name = `Piano (nível ${options.level})`;
  track.shortName = "Pno.";
  const info = new model.PlaybackInformation();
  info.program = 0;
  info.volume = 15;
  info.balance = 8;
  [info.primaryChannel, info.secondaryChannel] = freeChannels(score);
  track.playbackInfo = info;
  const right = new model.Staff();
  const left = new model.Staff();
  for (const staff of [right, left]) {
    staff.showTablature = false;
    staff.showStandardNotation = true;
    track.addStaff(staff);
  }
  score.addTrack(track);

  let previousChord: number[] | null = null;
  let previousBass = 43;
  let lastChordName: string | null = null;

  score.masterBars.forEach((masterBar, index) => {
    const src = melodyStaff.bars[index];
    const rh = newBar(model.Clef.G2, src, keySig, key.minor);
    const lh = newBar(model.Clef.F4, src, keySig, key.minor);
    right.addBar(rh.bar);
    left.addBar(lh.bar);

    // Mão direita: a nota mais aguda de cada tempo da melodia.
    const srcBeats = (src?.voices[0]?.beats ?? []).filter(
      (b) => b.graceType === model.GraceType.None,
    );
    const rhStarts = new Map<number, Beat>();
    for (const b of srcBeats) {
      const beat = new model.Beat();
      copyRhythm(b, beat);
      if (b.isEmpty) beat.isEmpty = true;
      const top = topNote(b);
      if (top) {
        const note = newNote(fold(top.realValue + shift + octave, ...MELODY_RANGE));
        note.isTieDestination = top.isTieDestination;
        beat.addNote(note);
      }
      rh.voice.addBeat(beat);
      rhStarts.set(b.playbackStart, beat);
    }
    if (srcBeats.length === 0) {
      const rest = newBeat(model.Duration.Whole);
      rest.isEmpty = true;
      rh.voice.addBeat(rest);
    }

    // Mão esquerda.
    const restBar = () => {
      const rest = newBeat(model.Duration.Whole);
      rest.isEmpty = true;
      lh.voice.addBeat(rest);
    };
    if (options.level === 1) return restBar();
    if (masterBar.isAnacrusis) {
      // Compasso incompleto: pausas no ritmo da melodia.
      for (const b of srcBeats) {
        const rest = new model.Beat();
        copyRhythm(b, rest);
        lh.voice.addBeat(rest);
      }
      if (srcBeats.length === 0) restBar();
      return;
    }

    const num = masterBar.timeSignatureNumerator;
    const den = masterBar.timeSignatureDenominator;
    const unit = WHOLE / den;
    let start = 0;
    for (const units of strongBeats(num, den)) {
      const end = start + units * unit;
      // Grupo sem figura única (raro): divide em tempos simples.
      const parts = figureFor(units, den) ? [units] : Array<number>(units).fill(1);
      const harmony = soundingIn(harmonyTracks, index, start, end);
      const bass = bassTrack ? soundingIn([bassTrack], index, start, end).lowest : harmony.lowest;
      const chord = detectChord(harmony.weights, bass);

      let notes: number[] = [];
      if (options.level === 2) {
        const root = bass ?? (chord ? chord.root : undefined);
        if (root !== undefined) {
          previousBass = placeNote(root + shift, previousBass, ...BASS_RANGE);
          notes = [previousBass];
        }
      } else if (chord) {
        const moved = { ...chord, root: (chord.root + shift + 12) % 12 };
        notes = voiceTriad(moved, previousChord, ...CHORD_RANGE);
        previousChord = notes;
        // Cifra sobre a melodia quando o acorde muda e um tempo dela começa junto.
        const name = chordName(moved);
        const rhBeat = rhStarts.get(start);
        if (rhBeat && name !== lastChordName) {
          lastChordName = name;
          if (!right.hasChord(name)) {
            const symbol = new model.Chord();
            symbol.name = name;
            symbol.showDiagram = false;
            symbol.showFingering = false;
            right.addChord(name, symbol);
          }
          rhBeat.chordId = name;
        }
      }

      for (const part of parts) {
        const figure = figureFor(part, den)!;
        const beat = newBeat(figure.duration, figure.dots);
        // Repete o acorde em cada parte; ligar as partes deixaria a leitura difícil.
        for (const n of notes) beat.addNote(newNote(n));
        lh.voice.addBeat(beat);
      }
      start = end;
    }
  });

  score.finish(settings);
  return { track: track.index, key, shift };
}

function topNote(beat: Beat) {
  let top: alphaTab.model.Note | null = null;
  for (const n of beat.notes) {
    if (n.isDead) continue;
    if (!top || n.realValue > top.realValue) top = n;
  }
  return top;
}

/** Tracks que devem ser transpostas junto com o arranjo (todas menos bateria). */
export function bandTracks(score: Score, except: number) {
  return score.tracks.filter((t) => t.index !== except && !t.isPercussion);
}
