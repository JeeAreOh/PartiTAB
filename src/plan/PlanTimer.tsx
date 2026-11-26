import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { dayKey } from "../progress/summary";
import { blockDone, markBlockDone, type Block } from "./calendar";

export interface PlanRun {
  blocks: Block[];
  index: number;
  /** Início da contagem atual (ms) e o tempo já contado antes das pausas. */
  startedAt: number;
  accumulated: number;
  paused: boolean;
}

export const elapsedOf = (run: PlanRun, now: number) =>
  run.accumulated + (run.paused ? 0 : now - run.startedAt);

/** Aviso curto de fim de bloco (dois bipes). */
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25].forEach((at) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.2);
    });
    window.setTimeout(() => ctx.close(), 1000);
  } catch {
    /* sem áudio: só o aviso na tela */
  }
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

interface Props {
  run: PlanRun;
  /** Atalhos do bloco (ex.: "Primeira vista"), e textos (tópicos de teoria). */
  actions: { label: string; onClick: () => void }[];
  notes: string[];
  onPause: () => void;
  onResume: () => void;
  onNext: () => void;
  onStop: () => void;
}

/** Cronômetro do bloco do plano, por cima de qualquer aba. */
export function PlanTimer({ run, actions, notes, onPause, onResume, onNext, onStop }: Props) {
  const block = run.blocks[run.index];
  const [now, setNow] = useState(Date.now());
  const beeped = useRef(false);
  const marked = useRef(false);

  useEffect(() => {
    beeped.current = false;
    marked.current = false;
  }, [run.index, run.blocks]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = elapsedOf(run, now);
  const total = block.minutes * 60_000;
  const over = elapsed >= total;

  useEffect(() => {
    if (!marked.current && blockDone(elapsed, block.minutes)) {
      marked.current = true;
      markBlockDone(dayKey(Date.now()), block.id);
    }
    if (over && !beeped.current) {
      beeped.current = true;
      beep();
    }
  }, [elapsed, block, over]);

  const last = run.index >= run.blocks.length - 1;

  return (
    <div className={`plan-timer ${over ? "over" : ""}`} role="timer" aria-live="off">
      <div className="plan-timer-main">
        <span className="plan-timer-label">
          Bloco {run.index + 1} de {run.blocks.length} · <b>{block.label}</b>
        </span>
        <span className="plan-timer-clock">{over ? "Tempo!" : mmss(total - elapsed)}</span>
        <div className="plan-timer-bar">
          <span style={{ width: `${Math.min(100, (100 * elapsed) / total)}%` }} />
        </div>
      </div>
      {(actions.length > 0 || notes.length > 0) && (
        <div className="plan-timer-extra">
          {actions.map((a) => (
            <button key={a.label} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
          {notes.length > 0 && (
            <ul>
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="plan-timer-buttons">
        <button
          className="icon-button"
          onClick={run.paused ? onResume : onPause}
          aria-label={run.paused ? "Continuar" : "Pausar"}
          title={run.paused ? "Continuar" : "Pausar"}
        >
          <Icon name={run.paused ? "play" : "pause"} size={16} />
        </button>
        <button className={over ? "primary" : ""} onClick={last ? onStop : onNext}>
          {last ? "Concluir" : "Próximo bloco"}
        </button>
        <button className="icon-button" onClick={onStop} aria-label="Fechar o cronômetro">
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}
