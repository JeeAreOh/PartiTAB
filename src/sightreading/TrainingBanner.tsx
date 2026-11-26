import { useEffect, useState } from "react";
import type { HandChoice } from "../practice/timeline";
import type { Mode } from "../practice/usePractice";
import { Icon } from "../ui/Icon";
import { PASS_ACCURACY } from "./progress";

/** Tempo de estudo antes da execução (s). */
export const STUDY_SECONDS = 30;

export interface Training {
  kind: "sight" | "rhythm";
  level: number;
  seed: number;
  title: string;
  songId: number;
  /** false em "Repetir este": a repetição não conta para o nível. */
  counts: boolean;
  phase: "study" | "play" | "result";
  startedAt: number;
  /** Escolhas de prática de antes, para voltar ao sair. */
  restore: { mode: Mode; hands: HandChoice; ramp: boolean; metronome: boolean; countIn: boolean };
  result?: {
    accuracy: number;
    passed: boolean;
    lostBars: number[];
    suggestion: "up" | "down" | null;
    /** Ritmo: desvio médio (ms) e compassos mais imprecisos. */
    deviationMs?: number | null;
    worstBars?: number[];
  };
}

interface Props {
  training: Training;
  busy: boolean;
  onBegin: () => void;
  onNext: (level: number) => void;
  onRepeat: () => void;
  onLeave: () => void;
}

const bars = (list: number[]) =>
  list.length === 1
    ? `o compasso ${list[0] + 1}`
    : `os compassos ${list.map((b) => b + 1).join(", ")}`;

/** Faixa acima da partitura durante um trecho de treino. */
export function TrainingBanner({ training, busy, onBegin, onNext, onRepeat, onLeave }: Props) {
  const [left, setLeft] = useState(STUDY_SECONDS);
  const isSight = training.kind === "sight";

  useEffect(() => {
    if (training.phase !== "study") return;
    const tick = () => {
      const remaining = Math.max(0, STUDY_SECONDS - (Date.now() - training.startedAt) / 1000);
      setLeft(Math.ceil(remaining));
      if (remaining <= 0) onBegin();
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [training.phase, training.startedAt, onBegin]);

  const r = training.result;
  const label = isSight ? "Primeira vista" : "Ritmo";

  return (
    <section
      className={`training-banner ${training.phase} ${r ? (r.passed ? "passed" : "failed") : ""}`}
      role="status"
    >
      <span className="training-tag">
        {label} · nível {training.level}
        {!training.counts && " · repetição"}
      </span>

      {training.phase === "study" && (
        <>
          <span className="training-text">
            {isSight ? (
              <>
                Estude antes de tocar: <b>clave</b>, <b>armadura</b>, <b>compasso</b> e{" "}
                <b>padrões</b> que se repetem. Começa em <b className="count">{left} s</b>.
              </>
            ) : (
              <>
                Qualquer tecla vale: só o tempo conta. Começa em <b className="count">{left} s</b>.
              </>
            )}
          </span>
          <button className="primary" onClick={onBegin}>
            Começar agora
          </button>
        </>
      )}

      {training.phase === "play" && (
        <span className="training-text">
          {isSight
            ? "Execução única: toque até o fim sem parar para corrigir. 1 compasso de contagem."
            : "Toque no tempo, com o metrônomo. 1 compasso de contagem."}
        </span>
      )}

      {training.phase === "result" && r && (
        <>
          <span className="training-text">
            {isSight ? (
              r.passed ? (
                <>
                  <b>Passou!</b> Precisão {r.accuracy}%.
                </>
              ) : (
                <>
                  <b>Não passou.</b> Precisão {r.accuracy}% (mínimo {PASS_ACCURACY}%)
                  {r.lostBars.length ? `; perdeu ${bars(r.lostBars)}` : ""}.
                </>
              )
            ) : (
              <>
                <b>Desvio médio {r.deviationMs ?? "—"} ms.</b>{" "}
                {r.worstBars?.length ? `Mais imprecisos: ${bars(r.worstBars)}.` : ""}
              </>
            )}
            {r.suggestion && (
              <>
                {" "}
                {r.suggestion === "up"
                  ? `5 aprovações nos últimos 6: experimente o nível ${training.level + 1}.`
                  : `3 reprovações seguidas: o nível ${training.level - 1} pode ajudar.`}
              </>
            )}
          </span>
          <div className="row">
            {r.suggestion && (
              <button
                disabled={busy}
                onClick={() => onNext(training.level + (r.suggestion === "up" ? 1 : -1))}
              >
                Nível {training.level + (r.suggestion === "up" ? 1 : -1)}
              </button>
            )}
            <button onClick={onRepeat} disabled={busy}>
              Repetir este
            </button>
            <button className="primary" onClick={() => onNext(training.level)} disabled={busy}>
              Próximo trecho
            </button>
          </div>
        </>
      )}

      <button className="icon-button" onClick={onLeave} aria-label="Sair do treino" title="Sair">
        <Icon name="close" size={16} />
      </button>
    </section>
  );
}
