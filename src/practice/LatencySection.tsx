import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import {
  MAX_LATENCY,
  MIN_LATENCY,
  clampLatency,
  estimateLatency,
  type Calibration,
} from "./latency";

/** 90 bpm: 4 cliques para entrar no ritmo e 16 medidos. */
const BEAT_MS = 667;
const LEAD_IN = 4;
const MEASURED = 16;

interface Props {
  latency: number;
  onChange: (ms: number) => void;
  /** Recebe as notas do teclado MIDI enquanto calibra (null devolve à prática). */
  registerTap: (handler: ((key: number) => void) | null) => void;
}

type Phase =
  | { type: "idle" }
  | { type: "running"; beat: number; taps: number }
  | { type: "done"; result: Calibration | null };

/** Seção "Sincronia" dos ajustes: calibra o atraso entre o som e o toque. */
export function LatencySection({ latency, onChange, registerTap }: Props) {
  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const clicks = useRef<number[]>([]);
  const taps = useRef<number[]>([]);
  const ctx = useRef<AudioContext | null>(null);
  const timers = useRef<number[]>([]);

  const stop = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    ctx.current?.close().catch(() => undefined);
    ctx.current = null;
    registerTap(null);
  }, [registerTap]);

  useEffect(() => stop, [stop]);

  const tap = useCallback(() => {
    taps.current.push(performance.now());
    setPhase((p) => (p.type === "running" ? { ...p, taps: p.taps + 1 } : p));
  }, []);

  const start = async () => {
    stop();
    const audio = new AudioContext();
    ctx.current = audio;
    await audio.resume();
    clicks.current = [];
    taps.current = [];
    // Relógio do áudio → relógio da página (sem o atraso da saída, como a
    // posição da partitura: o que sobra é justamente o que a calibração mede).
    const t0 = audio.currentTime + 0.4;
    const p0 = performance.now() + 400;
    const total = LEAD_IN + MEASURED;
    for (let i = 0; i < total; i++) {
      const at = t0 + (i * BEAT_MS) / 1000;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = i < LEAD_IN ? 880 : 1320;
      gain.gain.setValueAtTime(0.5, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + 0.07);
      if (i >= LEAD_IN) clicks.current.push(p0 + i * BEAT_MS);
      timers.current.push(
        window.setTimeout(
          () => setPhase((p) => (p.type === "running" ? { ...p, beat: i + 1 } : p)),
          400 + i * BEAT_MS,
        ),
      );
    }
    timers.current.push(
      window.setTimeout(
        () => {
          const result = estimateLatency(clicks.current, taps.current);
          stop();
          setPhase({ type: "done", result });
        },
        400 + total * BEAT_MS + 300,
      ),
    );
    registerTap(() => tap());
    setPhase({ type: "running", beat: 0, taps: 0 });
  };

  // Durante a calibração, a barra de espaço também vale como toque.
  const running = phase.type === "running";
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      tap();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [running, tap]);

  return (
    <section className="setting">
      <div className="setting-title">
        <Icon name="metronome" />
        <h3>Sincronia</h3>
        <span className={latency !== 0 ? "dot ok" : "dot"} />
      </div>
      <p className="muted small">
        Mede o atraso entre o som e o seu toque, para o modo Tocar junto não marcar notas certas
        como atrasadas. Use fones ou as caixas de sempre.
      </p>

      {phase.type === "running" ? (
        <div className="calibration">
          <div className="beats" aria-hidden>
            {Array.from({ length: LEAD_IN + MEASURED }, (_, i) => (
              <span
                key={i}
                className={[i < LEAD_IN ? "lead" : "", i < phase.beat ? "on" : ""].join(" ")}
              />
            ))}
          </div>
          <p>
            {phase.beat <= LEAD_IN
              ? "Escute o ritmo…"
              : "Toque uma tecla junto com cada clique agudo (ou a barra de espaço)."}
          </p>
          <p className="muted small">{phase.taps} toques</p>
          <div className="row">
            <button className="primary" onClick={tap}>
              Toque aqui
            </button>
            <button
              className="link"
              onClick={() => {
                stop();
                setPhase({ type: "idle" });
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : phase.type === "done" ? (
        <div className="calibration">
          {phase.result ? (
            <>
              <p>
                Atraso medido: <b>{phase.result.offset} ms</b>
                <span className="muted small">
                  {" "}
                  (variação de ±{phase.result.spread} ms em {phase.result.used} toques)
                </span>
              </p>
              {phase.result.spread > 60 && (
                <p className="warn small">
                  Os toques variaram bastante; vale repetir com mais calma.
                </p>
              )}
              <div className="row">
                <button
                  className="primary"
                  onClick={() => {
                    onChange(clampLatency(phase.result!.offset));
                    setPhase({ type: "idle" });
                  }}
                >
                  Usar {clampLatency(phase.result.offset)} ms
                </button>
                <button onClick={start}>Repetir</button>
              </div>
            </>
          ) : (
            <>
              <p className="warn">Poucos toques no tempo para medir. Tente de novo.</p>
              <button className="align-start" onClick={start}>
                Repetir
              </button>
            </>
          )}
        </div>
      ) : (
        <button className="align-start" onClick={start}>
          Calibrar
        </button>
      )}

      <label className="latency-manual">
        <span>Compensação</span>
        <input
          type="range"
          min={MIN_LATENCY}
          max={MAX_LATENCY}
          step={5}
          value={latency}
          onChange={(e) => onChange(Number(e.target.value))}
          onDoubleClick={() => onChange(0)}
          aria-label="Compensação do atraso"
        />
        <span className="muted small">{latency} ms</span>
      </label>
    </section>
  );
}
