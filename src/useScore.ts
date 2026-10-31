import { useCallback, useEffect, useRef, useState } from "react";
import * as alphaTab from "@coderline/alphatab";
import { fingerNotes } from "./practice/fingering";
import { applySections, fileSections, type SongSection } from "./practice/sections";
import { EVENT_FILTER, eventsToBytes, silence } from "./practice/keyboardOut";
import {
  TempoMap,
  buildTimeline,
  handOf,
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
import type { MediaHandler } from "./video/youtube";
import type { SyncPoint } from "./video/sync";

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

/** Como a partitura é desenhada: tamanho e páginas ou uma linha contínua. */
export interface Display {
  scale: number;
  layout: "page" | "horizontal";
}

export const DEFAULT_DISPLAY: Display = { scale: 1, layout: "page" };

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
  /** Muda quando o player do alphaTab é recriado (o SoundFont precisa ser recarregado). */
  playerGeneration: number;
  /** A reprodução segue um vídeo em vez do sintetizador. */
  external: boolean;
  /** Trecho A–B (arraste na partitura ou escolha por compassos) e se repete. */
  range: { startTick: number; endTick: number } | null;
  loop: boolean;
  /** Muda a cada desenho terminado (para o mapa de erros se reposicionar). */
  renderVersion: number;
  /** Seções escritas no arquivo (as do aluno vêm das preferências da música). */
  fileSections: SongSection[];
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
  playerGeneration: 0,
  external: false,
  range: null,
  loop: false,
  renderVersion: 0,
  fileSections: [],
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
  const optionsRef = useRef<ReduceOptions | null>(null);
  /** Vídeo que comanda a reprodução, e os pontos de sincronia com ele. */
  const mediaRef = useRef<MediaHandler | null>(null);
  const syncRef = useRef<SyncPoint[]>([]);
  const rangeRef = useRef<{ startTick: number; endTick: number } | null>(null);
  const fingeringRef = useRef(false);
  const sectionsRef = useRef<SongSection[]>([]);
  /** Som pelo teclado: para onde vão os eventos do player (null = som do computador). */
  const keyboardOutRef = useRef<((bytes: number[]) => void) | null>(null);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const [state, setState] = useState<ScoreState>(EMPTY);

  useEffect(() => {
    const container = containerRef.current;
    const scroll = scrollRef.current;
    if (!container || !scroll) return;

    const api = new alphaTab.AlphaTabApi(container, {
      // Sem desenho preguiçoso: no WebView2, com zoom alto, partes da partitura
      // que já estavam na tela ficavam em branco.
      core: { fontDirectory: "/font/", enableLazyLoading: false },
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
    // Trecho escolhido arrastando na partitura (ou pelo app).
    api.playbackRangeChanged.on((e) => {
      const r = e.playbackRange;
      rangeRef.current = r ? { startTick: r.startTick, endTick: r.endTick } : null;
      setState((s) => ({ ...s, range: rangeRef.current }));
    });
    api.postRenderFinished.on(() =>
      setState((s) => ({ ...s, renderVersion: s.renderVersion + 1 })),
    );
    api.playerReady.on(() => {
      // O player pode ter sido recriado: reaplica o som pelo teclado.
      if (keyboardOutRef.current) applyKeyboardOut(api, true);
      setState((s) => ({ ...s, ready: true }));
    });
    api.midiEventsPlayed.on((e) => {
      const send = keyboardOutRef.current;
      if (!send) return;
      const bytes = eventsToBytes(e.events as unknown as Parameters<typeof eventsToBytes>[0]);
      if (bytes.length) send(bytes);
    });
    api.playerStateChanged.on((e) => {
      const playing = e.state === alphaTab.synth.PlayerState.Playing;
      // Ao parar, o teclado não fica com notas presas.
      if (!playing) keyboardOutRef.current?.(silence());
      setState((s) => ({ ...s, playing, sounding: playing ? s.sounding : new Set() }));
    });
    let lastSecond = -1;
    api.playerPositionChanged.on((e) => {
      if (e.isSeek) keyboardOutRef.current?.(silence());
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
    if (fingeringRef.current && index !== null) annotateFingering(score, index);
    const fromFile = fileSections(score.masterBars);
    applySections(score, sectionsRef.current);
    trackRef.current = index;
    optionsRef.current = options;
    bandShiftRef.current = arrangement?.shift ?? 0;
    if (mediaRef.current && syncRef.current.length > 0) score.applyFlatSyncPoints(syncRef.current);
    setState((s) => ({
      ...s,
      sourceTracks,
      roles,
      arrangement,
      track: index,
      fileSections: fromFile,
    }));
    api.stop();
    api.renderScore(score, index !== null ? [index] : undefined);
    // O trecho vale para a mesma música em qualquer arranjo (os compassos são os mesmos).
    applyRange(api, rangeRef.current);
    attachMedia(api, mediaRef.current);
    const clean = (text: string) => text.replace(/\u00a0/g, " ").trim();
    return { title: clean(score.title), artist: clean(score.artist), roles };
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
      rangeRef.current = null;
      setState((s) => ({ ...s, range: null }));
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

  /**
   * Liga (handler) ou desliga (null) o vídeo como relógio da reprodução.
   * Recria o player do alphaTab e redesenha a partitura.
   */
  const setMedia = useCallback(
    (handler: MediaHandler | null, sync: SyncPoint[] = [], redraw = true) => {
      const api = apiRef.current;
      if (!api || (handler === null && mediaRef.current === null)) return;
      mediaRef.current = handler;
      syncRef.current = sync;
      // Com vídeo, a música fica no tom da gravação.
      if (handler && optionsRef.current?.transpose) {
        optionsRef.current = { ...optionsRef.current, transpose: false };
      }
      api.settings.player.playerMode = handler
        ? alphaTab.PlayerMode.EnabledExternalMedia
        : alphaTab.PlayerMode.EnabledSynthesizer;
      api.updateSettings();
      setState((s) => ({ ...s, external: !!handler, playerGeneration: s.playerGeneration + 1 }));
      // Redesenhar logo antes de abrir outra partitura faz o alphaTab misturar as duas.
      if (redraw && bytesRef.current) show(optionsRef.current, trackRef.current);
    },
    [show],
  );

  /** Troca os pontos de sincronia com o vídeo sem recarregar. */
  const setSyncPoints = useCallback((points: SyncPoint[]) => {
    syncRef.current = points;
    const api = apiRef.current;
    if (!api?.score || !mediaRef.current) return;
    api.score.applyFlatSyncPoints(points);
    api.updateSyncPoints();
  }, []);

  /** Tempo atual do vídeo (ms), para a partitura acompanhar. */
  const updateMediaTime = useCallback((ms: number) => {
    const output = apiRef.current?.player?.output as
      | Partial<alphaTab.synth.IExternalMediaSynthOutput>
      | undefined;
    output?.updatePosition?.(ms);
  }, []);

  /** Escolhe (ou limpa) o trecho A–B. */
  const setRange = useCallback((range: { startTick: number; endTick: number } | null) => {
    const api = apiRef.current;
    if (!api) return;
    rangeRef.current = range;
    applyRange(api, range);
    setState((s) => ({ ...s, range }));
  }, []);

  const setLoop = useCallback((loop: boolean) => {
    if (apiRef.current) apiRef.current.isLooping = loop;
    setState((s) => ({ ...s, loop }));
  }, []);

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

  /** Tamanho e layout da partitura. */
  const setDisplay = useCallback((display: Display) => {
    const api = apiRef.current;
    if (!api) return;
    api.settings.display.scale = display.scale;
    api.settings.display.layoutMode =
      display.layout === "page" ? alphaTab.LayoutMode.Page : alphaTab.LayoutMode.Horizontal;
    api.updateSettings();
    if (api.score) api.render();
  }, []);

  /** Mostra (ou tira) o dedilhado sugerido sobre as notas da faixa. */
  const setFingering = useCallback(
    (on: boolean) => {
      if (fingeringRef.current === on) return;
      fingeringRef.current = on;
      if (bytesRef.current) show(optionsRef.current, trackRef.current);
    },
    [show],
  );

  /**
   * Seções do aluno, desenhadas na partitura. `redraw` = false só guarda (para
   * a próxima música que abrir).
   */
  const setSections = useCallback(
    (sections: SongSection[], redraw = true) => {
      if (JSON.stringify(sectionsRef.current) === JSON.stringify(sections)) return;
      sectionsRef.current = sections;
      if (redraw && bytesRef.current) show(optionsRef.current, trackRef.current);
    },
    [show],
  );

  /** Manda a banda e o metrônomo para o teclado (`send`) ou de volta ao computador (null). */
  const setKeyboardOut = useCallback((send: ((bytes: number[]) => void) | null) => {
    const previous = keyboardOutRef.current;
    keyboardOutRef.current = send;
    previous?.(silence());
    const api = apiRef.current;
    // Só mexe no volume quando o modo muda (com vídeo, o volume é o do vídeo).
    if (api && (send !== null) !== (previous !== null)) applyKeyboardOut(api, send !== null);
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
    setMedia,
    setRange,
    setLoop,
    setSyncPoints,
    updateMediaTime,
    selectTrack,
    setSolo,
    setMutedHands,
    loadSoundFont,
    setDisplay,
    setFingering,
    setSections,
    setKeyboardOut,
    ...controls,
  };
}

function applyRange(
  api: alphaTab.AlphaTabApi,
  range: { startTick: number; endTick: number } | null,
) {
  if (range) {
    const r = new alphaTab.synth.PlaybackRange();
    r.startTick = range.startTick;
    r.endTick = range.endTick;
    api.playbackRange = r;
  } else {
    api.playbackRange = null;
    api.clearPlaybackRangeHighlight();
  }
}

function attachMedia(api: alphaTab.AlphaTabApi, handler: MediaHandler | null) {
  const output = api.player?.output as
    | Partial<alphaTab.synth.IExternalMediaSynthOutput>
    | undefined;
  if (handler && output && "updatePosition" in output) output.handler = handler;
}

/**
 * Escreve o dedilhado sugerido como texto acima de cada tempo da faixa
 * (acordes de cima para baixo). Não muda notas nem a reprodução. Dedilhado
 * escrito na partitura (exercícios de técnica) o alphaTab já desenha.
 */
function annotateFingering(score: alphaTab.model.Score, trackIndex: number) {
  const track = score.tracks[trackIndex];
  const items: { beat: alphaTab.model.Beat; key: number; hand: "right" | "left"; tick: number }[] =
    [];
  for (const staff of track.staves) {
    for (const bar of staff.bars) {
      for (const voice of bar.voices) {
        for (const beat of voice.beats) {
          for (const note of beat.notes) {
            if (note.isTieDestination || note.leftHandFinger >= 0) continue;
            const key = note.realValue;
            items.push({
              beat,
              key,
              hand: handOf(staff.index, track.staves.length, key),
              tick: beat.absolutePlaybackStart,
            });
          }
        }
      }
    }
  }
  const fingers = fingerNotes(items);
  const byBeat = new Map<alphaTab.model.Beat, { key: number; finger: number }[]>();
  for (const it of items) {
    const finger = fingers.get(`${it.tick}:${it.key}`);
    if (!finger) continue;
    byBeat.set(it.beat, [...(byBeat.get(it.beat) ?? []), { key: it.key, finger }]);
  }
  for (const [beat, list] of byBeat) {
    const text = list
      .sort((a, b) => b.key - a.key)
      .map((f) => f.finger)
      .join(" ");
    // Texto que a partitura já tinha (ex.: "Allegro") fica depois do dedilhado.
    beat.text = beat.text ? `${text} – ${beat.text}` : text;
  }
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

/** Com o som no teclado, o player fica mudo e avisa cada evento tocado. */
function applyKeyboardOut(api: alphaTab.AlphaTabApi, on: boolean) {
  api.midiEventsPlayedFilter = on ? EVENT_FILTER : [];
  api.masterVolume = on ? 0 : 1;
}
