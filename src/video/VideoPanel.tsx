import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { addSyncPoint, nearestBar, startPoint, type BarLookup, type SyncPoint } from "./sync";
import { createVideo, embedUrl, type MediaHandler, type VideoController } from "./youtube";

interface Props {
  videoId: string;
  points: SyncPoint[];
  /** Compassos na ordem tocada (tickCache do alphaTab). */
  bars: () => BarLookup[];
  /** Posição atual da partitura em pulsos. */
  currentTick: () => number;
  onReady: (handler: MediaHandler) => void;
  onTime: (ms: number) => void;
  onPlaying: (playing: boolean) => void;
  onPoints: (points: SyncPoint[]) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

/** Vídeo do YouTube que comanda a reprodução, com a marcação de compassos. */
export function VideoPanel(p: Props) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const controller = useRef<VideoController | null>(null);
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);
  const latest = useRef(p);
  latest.current = p;

  useEffect(() => {
    let alive = true;
    const element = iframe.current;
    if (!element) return;
    createVideo(element, {
      onTime: (ms) => latest.current.onTime(ms),
      onState: (playing) => latest.current.onPlaying(playing),
      onError: (message) => latest.current.onError(message),
    })
      .then((c) => {
        if (!alive) return c.destroy();
        controller.current = c;
        setReady(true);
        latest.current.onReady(c.handler);
      })
      .catch((e) => latest.current.onError(String(e instanceof Error ? e.message : e)));
    return () => {
      alive = false;
      controller.current?.destroy();
      controller.current = null;
    };
  }, [p.videoId]);

  /** Marca o início de um compasso no instante atual do vídeo. */
  const mark = useCallback(() => {
    const c = controller.current;
    if (!c) return;
    const { points, bars, currentTick, onPoints } = latest.current;
    const ms = c.currentTime();
    if (points.length === 0) {
      onPoints([startPoint(ms)]);
    } else {
      const lookup = bars();
      const bar = nearestBar(lookup, currentTick());
      if (bar)
        onPoints(
          addSyncPoint(lookup, points, {
            ...bar,
            barPosition: 0,
            millisecondOffset: Math.round(ms),
          }),
        );
    }
    setFlash(true);
    window.setTimeout(() => setFlash(false), 180);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key.toLowerCase() !== "m" || e.repeat || /INPUT|SELECT|TEXTAREA/.test(target.tagName))
        return;
      e.preventDefault();
      mark();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mark]);

  const count = p.points.length;
  return (
    <aside className="video-card" aria-label="Vídeo do YouTube">
      <div className="video-frame">
        <iframe
          ref={iframe}
          src={embedUrl(p.videoId)}
          title="Vídeo do YouTube"
          allow="autoplay; encrypted-media"
          referrerPolicy="strict-origin-when-cross-origin"
        />
        {/* Os controles ficam na barra do app, para a partitura acompanhar. */}
        <div className="video-shield" />
      </div>
      <div className="video-tools">
        <button className={flash ? "primary flash" : "primary"} onClick={mark} disabled={!ready}>
          <Icon name="flag" size={16} /> Marcar compasso <kbd>M</kbd>
        </button>
        {count > 0 && (
          <button className="ghost" onClick={() => p.onPoints([])} title="Apagar as marcações">
            Refazer
          </button>
        )}
        <button
          className="icon-button"
          onClick={p.onClose}
          aria-label="Desligar vídeo"
          title="Desligar vídeo"
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="muted small">
        {!ready
          ? "Carregando o vídeo…"
          : count === 0
            ? "Dê play e toque M no primeiro tempo do compasso 1."
            : `${count} ${count === 1 ? "marcação" : "marcações"}. Se a partitura se adiantar ou atrasar, toque M no início de um compasso.`}
      </p>
    </aside>
  );
}
