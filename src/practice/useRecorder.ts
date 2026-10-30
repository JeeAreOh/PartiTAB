import { useCallback, useEffect, useRef, useState } from "react";
import type * as alphaTab from "@coderline/alphatab";
import { api, type KeyEvent } from "../api";
import { closeRecording, type RecordedEvent, type Recording } from "./recording";

interface Options {
  apiRef: React.RefObject<alphaTab.AlphaTabApi | null>;
  /** Acende (velocidade) ou apaga (null) a tecla no teclado virtual ao ouvir. */
  onKey: (key: number, velocity: number | null) => void;
}

/** Grava as notas tocadas e toca a gravação de volta com o cursor da partitura. */
export function useRecorder({ apiRef, onKey }: Options) {
  const [recording, setRecording] = useState(false);
  const [take, setTake] = useState<Recording | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const events = useRef<RecordedEvent[]>([]);
  const startedAt = useRef(0);
  const recordingRef = useRef(false);
  const timers = useRef<number[]>([]);
  const ticker = useRef<number | undefined>(undefined);
  const sounding = useRef(new Set<number>());
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;

  /** Evento do teclado (MIDI ou mouse) enquanto grava. */
  const capture = useCallback(
    (e: KeyEvent) => {
      if (!recordingRef.current) return;
      const t = performance.now() - startedAt.current;
      if (e.type === "noteOn") {
        const tick = apiRef.current?.score ? apiRef.current.tickPosition : null;
        events.current.push({ t, type: "on", key: e.key, velocity: e.velocity, tick });
      } else if (e.type === "noteOff") events.current.push({ t, type: "off", key: e.key });
      else events.current.push({ t, type: "pedal", down: e.down });
    },
    [apiRef],
  );

  const stopPlayback = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    for (const key of sounding.current) {
      api.playNote(key, 0);
      onKeyRef.current(key, null);
    }
    sounding.current.clear();
    api.playPedal(false);
    setPlaying(false);
  }, []);

  const start = useCallback(() => {
    stopPlayback();
    events.current = [];
    startedAt.current = performance.now();
    recordingRef.current = true;
    setRecording(true);
    setElapsed(0);
    window.clearInterval(ticker.current);
    ticker.current = window.setInterval(
      () => setElapsed(performance.now() - startedAt.current),
      250,
    );
  }, [stopPlayback]);

  const stop = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    window.clearInterval(ticker.current);
    setRecording(false);
    // Silêncio antes da primeira nota não precisa ser guardado.
    const first = events.current.find((e) => e.type === "on")?.t ?? 0;
    const shift = Math.max(0, first - 300);
    const shifted = events.current.map((e) => ({ ...e, t: e.t - shift }));
    const rec = closeRecording(shifted, performance.now() - startedAt.current - shift);
    setTake(rec.events.some((e) => e.type === "on") ? rec : null);
  }, []);

  const play = useCallback(() => {
    if (!take) return;
    stopPlayback();
    setPlaying(true);
    for (const e of take.events) {
      timers.current.push(
        window.setTimeout(() => {
          if (e.type === "on") {
            api.playNote(e.key, e.velocity);
            sounding.current.add(e.key);
            onKeyRef.current(e.key, e.velocity);
            const score = apiRef.current;
            if (e.tick !== null && score?.score) score.tickPosition = e.tick;
          } else if (e.type === "off") {
            api.playNote(e.key, 0);
            sounding.current.delete(e.key);
            onKeyRef.current(e.key, null);
          } else api.playPedal(e.down);
        }, e.t),
      );
    }
    timers.current.push(window.setTimeout(() => setPlaying(false), take.durationMs + 50));
  }, [take, apiRef, stopPlayback]);

  const discard = useCallback(() => {
    stopPlayback();
    setTake(null);
  }, [stopPlayback]);

  useEffect(
    () => () => {
      window.clearInterval(ticker.current);
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  return { recording, take, playing, elapsed, capture, start, stop, play, stopPlayback, discard };
}

export type Recorder = ReturnType<typeof useRecorder>;
