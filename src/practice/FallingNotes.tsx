import { useEffect, useMemo, useRef } from "react";
import * as alphaTab from "@coderline/alphatab";
import { FIRST_KEY, LAST_KEY, isBlack, keyGeometry } from "../Keyboard";
import { plays, type HandChoice, type Step, type TempoMap } from "./timeline";

/** Quanto do futuro aparece na tela, em ms reais. */
const LOOKAHEAD_MS = 3000;
/** Sem aviso de posição há mais que isso, não extrapola (pausa, contagem). */
const MAX_EXTRAPOLATION_MS = 250;
/** Margem interna do teclado (CSS `.keyboard`), para alinhar com as teclas. */
const KEYBOARD_PADDING = 6;

const COLORS = { right: "75 91 240", left: "23 145 90" } as const;

interface Props {
  apiRef: React.RefObject<alphaTab.AlphaTabApi | null>;
  /** Área da partitura: o painel cobre exatamente esse espaço. */
  anchorRef: React.RefObject<HTMLElement | null>;
  timeline: Step[];
  tempo: TempoMap | null;
  speed: number;
  /** Mãos praticadas (as outras ficam apagadas); null = todas iguais. */
  hands: HandChoice | null;
  /** Dedos por nota (`tick:key`), quando o dedilhado está ligado. */
  fingering: Map<string, number> | null;
}

interface FallingNote {
  key: number;
  hand: "right" | "left";
  start: number;
  end: number;
  finger: number;
}

/** Visão "notas caindo": cada nota desce até a tecla que deve ser tocada. */
export function FallingNotes({
  apiRef,
  anchorRef,
  timeline,
  tempo,
  speed,
  hands,
  fingering,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const position = useRef({ tick: 0, at: 0, playing: false });
  const view = useRef({ speed, hands });
  view.current = { speed, hands };

  const notes = useMemo<FallingNote[]>(() => {
    if (!tempo) return [];
    return timeline
      .flatMap((s) => s.notes)
      .filter((n) => n.key >= FIRST_KEY && n.key <= LAST_KEY)
      .map((n) => ({
        key: n.key,
        hand: n.hand,
        start: tempo.ms(n.tick),
        end: Math.max(tempo.ms(n.endTick), tempo.ms(n.tick) + 60),
        finger: fingering?.get(`${n.tick}:${n.key}`) ?? 0,
      }))
      .sort((a, b) => a.start - b.start);
  }, [timeline, tempo, fingering]);

  // Posição da reprodução, para extrapolar entre os avisos do alphaTab.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const offPos = api.playerPositionChanged.on((e) => {
      position.current = { ...position.current, tick: e.currentTick, at: performance.now() };
    });
    const offState = api.playerStateChanged.on((e) => {
      position.current = {
        ...position.current,
        playing: e.state === alphaTab.synth.PlayerState.Playing,
        at: performance.now(),
      };
    });
    return () => {
      offPos();
      offState();
    };
  }, [apiRef]);

  // Acompanha o tamanho e a posição da área da partitura.
  useEffect(() => {
    const anchor = anchorRef.current;
    const canvas = canvasRef.current;
    if (!anchor || !canvas) return;
    const place = () => {
      Object.assign(canvas.style, {
        top: `${anchor.offsetTop}px`,
        left: `${anchor.offsetLeft}px`,
        width: `${anchor.offsetWidth}px`,
        height: `${anchor.offsetHeight}px`,
      });
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(anchor.offsetWidth * dpr);
      canvas.height = Math.round(anchor.offsetHeight * dpr);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [anchorRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !tempo) return;
    let frame = 0;

    const nowMs = () => {
      const api = apiRef.current;
      const p = position.current;
      if (!p.playing || !api) return tempo.ms(api?.tickPosition ?? p.tick);
      const elapsed = Math.min(performance.now() - p.at, MAX_EXTRAPOLATION_MS);
      return tempo.ms(p.tick) + elapsed * view.current.speed;
    };

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      if (W === 0 || H === 0) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const inner = W - 2 * KEYBOARD_PADDING;
      const xOf = (key: number) => {
        const g = keyGeometry(key);
        // As brancas ficam dentro da margem; as pretas são posicionadas na caixa toda.
        return isBlack(key)
          ? { x: (g.left / 100) * W, w: (g.width / 100) * W }
          : { x: KEYBOARD_PADDING + (g.left / 100) * inner + 1, w: (g.width / 100) * inner - 2 };
      };

      // Fundo: uma linha em cada dó.
      ctx.fillStyle = "rgb(255 255 255 / 0.06)";
      for (let k = FIRST_KEY; k <= LAST_KEY; k += 12) ctx.fillRect(xOf(k).x - 1, 0, 1, H);

      const now = nowMs();
      const windowMs = LOOKAHEAD_MS * view.current.speed;
      const yOf = (ms: number) => H - ((ms - now) / windowMs) * H;
      const { hands } = view.current;

      ctx.font = "600 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      for (const n of notes) {
        if (n.start > now + windowMs) break;
        if (n.end < now) continue;
        const { x, w } = xOf(n.key);
        const bottom = Math.min(H, yOf(n.start));
        const top = Math.max(0, yOf(n.end));
        const active = n.start <= now;
        const dim = hands !== null && !plays(hands, n.hand);
        const alpha = dim ? 0.3 : active ? 1 : 0.85;
        ctx.fillStyle = `rgb(${COLORS[n.hand]} / ${alpha})`;
        const h = Math.max(4, bottom - top);
        ctx.beginPath();
        ctx.roundRect(x, bottom - h, w, h, Math.min(5, w / 3));
        ctx.fill();
        if (active && !dim) {
          ctx.strokeStyle = "rgb(255 255 255 / 0.8)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        if (n.finger && h >= 16 && w >= 9) {
          ctx.fillStyle = `rgb(255 255 255 / ${dim ? 0.5 : 0.95})`;
          ctx.fillText(String(n.finger), x + w / 2, bottom - 3);
        }
      }

      // Linha de toque, logo acima do teclado.
      ctx.fillStyle = "rgb(255 255 255 / 0.35)";
      ctx.fillRect(0, H - 2, W, 2);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [apiRef, tempo, notes]);

  return <canvas ref={canvasRef} className="falling-notes" aria-label="Notas caindo" />;
}
