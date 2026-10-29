import { useCallback, useEffect, useRef, useState } from "react";
import * as alphaTab from "@coderline/alphatab";

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

export interface ScoreState {
  tracks: TrackInfo[];
  track: number | null;
  playing: boolean;
  ready: boolean;
  /** Posição e duração em milissegundos. */
  position: number;
  duration: number;
  /** Notas (MIDI) da faixa escolhida soando agora na reprodução. */
  sounding: Set<number>;
}

const EMPTY: ScoreState = {
  tracks: [],
  track: null,
  playing: false,
  ready: false,
  position: 0,
  duration: 0,
  sounding: new Set(),
};

export function useScore(onError: (message: string) => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const trackRef = useRef<number | null>(null);
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
      const tracks = score.tracks
        .filter((t) => !t.isPercussion)
        .map((t) => ({
          index: t.index,
          name: t.name || `Faixa ${t.index + 1}`,
          isPiano: isPianoProgram(t.playbackInfo.program),
        }));
      const track = defaultTrack(tracks);
      trackRef.current = track;
      setState((s) => ({
        ...s,
        tracks,
        track,
        playing: false,
        position: 0,
        sounding: new Set(),
      }));
      if (track !== null && track !== score.tracks[0]?.index) {
        api.renderTracks([score.tracks[track]]);
      }
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

  const load = useCallback((data: Uint8Array) => {
    const api = apiRef.current;
    if (!api) return;
    api.stop();
    if (!api.load(data)) errorRef.current("Formato de arquivo não reconhecido");
  }, []);

  const selectTrack = useCallback((index: number) => {
    const api = apiRef.current;
    const track = api?.score?.tracks[index];
    if (!api || !track) return;
    trackRef.current = index;
    setState((s) => ({ ...s, track: index, sounding: new Set() }));
    api.renderTracks([track]);
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

  return { containerRef, scrollRef, state, load, selectTrack, setSolo, loadSoundFont, ...controls };
}
