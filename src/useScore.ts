import { useCallback, useEffect, useRef, useState } from "react";
import * as alphaTab from "@coderline/alphatab";
import {
  TempoMap,
  buildTimeline,
  removeHandNotes,
  type HandChoice,
  type Step,
} from "./practice/timeline";
import {
  bandTracks,
  guessRoles,
  reduceToPiano,
  type ReduceOptions,
  type Roles,
} from "./reducer/reduce";
import { PITCH_NAMES, type Key } from "./reducer/harmony";

export interface TrackInfo {
  index: number;
  name: string;
  isPiano: boolean;
}

/** Programas GM 0–7: pianos acústicos e elétricos. */
const isPianoProgram = (program: number) => program >= 0 && program <= 7;

/**
 * Faixa padrão para estudar: a primeira de piano; sem piano, a primeira
 * faixa não percussiva.
 */
export function defaultTrack(tracks: TrackInfo[]): number | null {
  return (tracks.find((t) => t.isPiano) ?? tracks[0])?.index ?? null;
}

export interface Arrangement extends ReduceOptions {
  key: Key;
  shift: number;
}

export interface ScoreInfo {
  title: string;
  artist: string;
  roles: Roles;
}

export const keyName = (k: Key) => PITCH_NAMES[k.tonic] + (k.minor ? "m" : "");

export interface ScoreState {
  tracks: TrackInfo[];
  /** Faixas originais (sem o arranjo), para escolher a melodia. */
  sourceTracks: TrackInfo[];
  roles: Roles;
  arrangement: Arrangement | null;
  track: number | null;
  playing: boolean;
  ready: boolean;
  /** Posição e duração em milissegundos. */
  position: number;
  duration: number;
  /** Notas (MIDI) da faixa escolhida soando agora na reprodução. */
  sounding: Set<number>;
  /** Notas da faixa escolhida em ordem de execução, e o mapa de andamento. */
  timeline: Step[];
  tempo: TempoMap | null;
}

const EMPTY: ScoreState = {
  tracks: [],
  sourceTracks: [],
  roles: { melody: null, bass: null },
  arrangement: null,
  track: null,
  playing: false,
  ready: false,
  position: 0,
  duration: 0,
  sounding: new Set(),
  timeline: [],
  tempo: null,
};

export function useScore(onError: (message: string) => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const trackRef = useRef<number | null>(null);
  const mutedRef = useRef<HandChoice | null>(null);
  const bytesRef = useRef<Uint8Array | null>(null);
  /** Transposição das outras faixas para acompanhar o arranjo transposto. */
  const bandShiftRef = useRef(0);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const [state, setState] = useState<ScoreState>(EMPTY);

  useEffect(() => {
    const container = containerRef.current;
    const scroll = scrollRef.current;
    if (!container || !scroll) return;

    const api = new alphaTab.AlphaTabApi(container, {
      core: { fontDirectory: "/font/" },
      display: { staveProfile: alphaTab.StaveProfile.Score },
      player: {
        playerMode: alphaTab.PlayerMode.EnabledSynthesizer,
        soundFont: "/soundfont/sonivox.sf2",
        scrollElement: scroll,
        enableCursor: true,
        enableAnimatedBeatCursor: true,
      },
    });
    apiRef.current = api;

    api.scoreLoaded.on((score) => {
      setState((s) => ({
        ...s,
        tracks: trackInfos(score),
        track: trackRef.current,
        playing: false,
        position: 0,
        sounding: new Set(),
      }));
    });
    // O MIDI é gerado ao carregar a partitura e quando pedimos de novo
    // (troca das mãos silenciadas). Antes de tocar, tiramos as notas do aluno.
    api.midiLoad.on((midi) => {
      const { timeline, tempo } = timelineOf(api, trackRef.current);
      // (api.midiLoaded não é usado: no alphaTab 1.8.4 ele entra em recursão infinita.)
      const bars = api.tickCache?.masterBars ?? [];
      const end = bars[bars.length - 1]?.end ?? 0;
      setState((s) => ({ ...s, timeline, tempo, duration: tempo ? tempo.ms(end) : s.duration }));
      const track = trackRef.current !== null ? api.score?.tracks[trackRef.current] : null;
      // O alphaTab reaplica as transposições dele logo depois deste evento;
      // a da banda vai na sequência.
      const shift = bandShiftRef.current;
      if (track && shift !== 0 && api.score) {
        const band = bandTracks(api.score, track.index);
        queueMicrotask(() => api.changeTrackTranspositionPitch(band, shift));
      }
      if (!track || !mutedRef.current) return;
      removeHandNotes(midi.tracks, {
        steps: timeline,
        hands: mutedRef.current,
        channels: new Set([track.playbackInfo.primaryChannel, track.playbackInfo.secondaryChannel]),
        tickShift: midi.tickShift,
        noteOnType: alphaTab.midi.MidiEventType.NoteOn,
      });
    });
    api.playerReady.on(() => setState((s) => ({ ...s, ready: true })));
    api.playerStateChanged.on((e) => {
      const playing = e.state === alphaTab.synth.PlayerState.Playing;
      setState((s) => ({ ...s, playing, sounding: playing ? s.sounding : new Set() }));
    });
    let lastSecond = -1;
    api.playerPositionChanged.on((e) => {
      // Atualiza a interface no máximo uma vez por segundo.
      const second = Math.floor(e.currentTime / 1000);
      if (second === lastSecond) return;
      lastSecond = second;
      setState((s) => ({ ...s, position: e.currentTime, duration: e.endTime }));
    });
    api.activeBeatsChanged.on((e) => {
      const sounding = new Set<number>();
      for (const beat of e.activeBeats) {
        if (beat.voice.bar.staff.track.index !== trackRef.current) continue;
        for (const note of beat.notes) sounding.add(note.realValue);
      }
      setState((s) => ({ ...s, sounding }));
    });
    api.error.on((e) => errorRef.current(`Erro na partitura: ${e.message}`));

    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, []);

  /** Lê os bytes, monta o arranjo pedido (se houver) e desenha. */
  const show = useCallback((options: ReduceOptions | null, track?: number | null) => {
    const api = apiRef.current;
    const data = bytesRef.current;
    if (!api || !data) return null;
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(data, api.settings);
    const sourceTracks = trackInfos(score);
    const roles = guessRoles(score);
    let arrangement: Arrangement | null = null;
    let index = track ?? defaultTrack(sourceTracks);
    if (options) {
      const result = reduceToPiano(score, api.settings, options);
      arrangement = { ...options, key: result.key, shift: result.shift };
      index = result.track;
    }
    if (index === null || !score.tracks[index] || score.tracks[index].isPercussion) {
      index = defaultTrack(sourceTracks);
    }
    trackRef.current = index;
    bandShiftRef.current = arrangement?.shift ?? 0;
    setState((s) => ({ ...s, sourceTracks, roles, arrangement, track: index }));
    api.stop();
    api.renderScore(score, index !== null ? [index] : undefined);
    return { title: score.title.trim(), artist: score.artist.trim(), roles };
  }, []);

  /** Abre uma partitura. Devolve título, artista e papéis das faixas, ou null se inválida. */
  const load = useCallback(
    (
      data: Uint8Array,
      options: ReduceOptions | null = null,
      track?: number | null,
    ): ScoreInfo | null => {
      const previous = bytesRef.current;
      bytesRef.current = data;
      try {
        return show(options, track);
      } catch (e) {
        bytesRef.current = previous;
        errorRef.current(
          `Não foi possível abrir a partitura: ${e instanceof Error ? e.message : e}`,
        );
        return null;
      }
    },
    [show],
  );

  /** Troca o arranjo da partitura aberta (null = original). */
  const arrange = useCallback(
    (options: ReduceOptions | null, track?: number | null) => {
      try {
        show(options, track);
      } catch (e) {
        errorRef.current(`Não foi possível gerar o arranjo: ${e instanceof Error ? e.message : e}`);
      }
    },
    [show],
  );

  /** Partitura atual (com o arranjo) em Guitar Pro 7, para salvar ou editar no MuseScore. */
  const exportGp = useCallback((): Uint8Array | null => {
    const api = apiRef.current;
    if (!api?.score) return null;
    return new alphaTab.exporter.Gp7Exporter().export(api.score, api.settings);
  }, []);

  const selectTrack = useCallback((index: number) => {
    const api = apiRef.current;
    const track = api?.score?.tracks[index];
    if (!api || !track) return;
    trackRef.current = index;
    setState((s) => ({ ...s, track: index, sounding: new Set(), ...timelineOf(api, index) }));
    api.renderTracks([track]);
    if (mutedRef.current) api.loadMidiForScore();
  }, []);

  /** Silencia na reprodução as mãos que o aluno vai tocar (null = toca tudo). */
  const setMutedHands = useCallback((hands: HandChoice | null) => {
    if (mutedRef.current === hands) return;
    mutedRef.current = hands;
    const api = apiRef.current;
    if (api?.score) api.loadMidiForScore();
  }, []);

  /** Toca só a faixa escolhida (true) ou todas (false). */
  const setSolo = useCallback((solo: boolean) => {
    const api = apiRef.current;
    const score = api?.score;
    if (!api || !score) return;
    api.changeTrackSolo(score.tracks, false);
    const track = trackRef.current;
    if (solo && track !== null) api.changeTrackSolo([score.tracks[track]], true);
  }, []);

  const loadSoundFont = useCallback((data: Uint8Array) => {
    apiRef.current?.loadSoundFont(data, false);
  }, []);

  const controls = {
    playPause: () => apiRef.current?.playPause(),
    stop: () => apiRef.current?.stop(),
    setSpeed: (speed: number) => {
      if (apiRef.current) apiRef.current.playbackSpeed = speed;
    },
  };

  return {
    containerRef,
    scrollRef,
    apiRef,
    state,
    load,
    arrange,
    exportGp,
    selectTrack,
    setSolo,
    setMutedHands,
    loadSoundFont,
    ...controls,
  };
}

function trackInfos(score: alphaTab.model.Score): TrackInfo[] {
  return score.tracks
    .filter((t) => !t.isPercussion)
    .map((t) => ({
      index: t.index,
      name: t.name || `Faixa ${t.index + 1}`,
      isPiano: isPianoProgram(t.playbackInfo.program),
    }));
}

function timelineOf(api: alphaTab.AlphaTabApi, track: number | null) {
  const cache = api.tickCache;
  if (!cache || track === null) return { timeline: [], tempo: null };
  return {
    timeline: buildTimeline(cache, track),
    tempo: new TempoMap(cache, api.score?.tempo),
  };
}
