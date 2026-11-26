import { useEffect, useState } from "react";
import { api, type SightReadingResult } from "../api";
import { LEVELS } from "./levels";
import { lastLevel, PASS_ACCURACY, sightStats, suggestLevel } from "./progress";

const LEVEL_KEY = "partitab.sightLevel";

function savedLevel(): number | null {
  try {
    const n = Number(localStorage.getItem(LEVEL_KEY));
    return n >= 1 && n <= LEVELS.length ? n : null;
  } catch {
    return null;
  }
}

interface Props {
  /** Muda quando há resultado novo (para recarregar). */
  version?: number;
  busy: boolean;
  /** Nível sugerido de fora (ex.: o do mês do plano). */
  planLevel?: number | null;
  onStart: (level: number) => void;
}

/** Aba Leitura → Primeira vista: escolhe o nível, gera o trecho e mostra o histórico. */
export function SightReading({ version, busy, planLevel, onStart }: Props) {
  const [results, setResults] = useState<SightReadingResult[] | null>(null);
  const [level, setLevel] = useState<number | null>(planLevel ?? savedLevel());

  useEffect(() => {
    api.sight.list(0).then(setResults, () => setResults([]));
  }, [version]);

  const current = level ?? (results ? lastLevel(results) : 1);
  const choose = (n: number) => {
    setLevel(n);
    try {
      localStorage.setItem(LEVEL_KEY, String(n));
    } catch {
      /* só perde a preferência */
    }
  };

  const stats = sightStats(results ?? []);
  const suggestion = results ? suggestLevel(results, current) : null;
  const info = LEVELS[current - 1];
  const recent = [...(results ?? [])].sort((a, b) => b.takenAt - a.takenAt).slice(0, 8);

  return (
    <div className="reading-main">
      <div className="reading-card sight-panel">
        <div className="sight-levels" role="radiogroup" aria-label="Nível">
          {LEVELS.map((l) => (
            <button
              key={l.level}
              role="radio"
              aria-checked={current === l.level}
              className={current === l.level ? "on" : ""}
              onClick={() => choose(l.level)}
              title={l.label}
            >
              <b>{l.level}</b>
              <span className="small">mês {l.month}</span>
            </button>
          ))}
        </div>
        <h2>
          Nível {info.level}: {info.label}
        </h2>
        <p className="muted">
          {info.bars.join(" ou ")} compassos em {info.meters.join(", ")}, {info.bpm} bpm.{" "}
          {planLevel === current ? "É o nível do mês no seu plano." : ""}
        </p>
        {suggestion && (
          <p className="sight-suggestion">
            {suggestion === "up"
              ? `Você passou em 5 dos últimos 6 trechos deste nível. Que tal o nível ${current + 1}?`
              : `3 reprovações seguidas: talvez o nível ${current - 1} ajude a firmar a base.`}{" "}
            <button
              className="link"
              onClick={() => choose(suggestion === "up" ? current + 1 : current - 1)}
            >
              Ir para o nível {suggestion === "up" ? current + 1 : current - 1}
            </button>
          </p>
        )}
        <button className="primary" disabled={busy} onClick={() => onStart(current)}>
          Novo trecho
        </button>
        <ol className="sight-steps muted small">
          <li>O trecho é novo, gerado agora, e abre na Partitura.</li>
          <li>Você tem 30 s para estudar: clave, armadura, compasso e padrões.</li>
          <li>
            Uma execução só, em Tocar junto, com 1 compasso de contagem. Não pare para corrigir.
          </li>
          <li>Passa com {PASS_ACCURACY}% de precisão e sem perder um compasso inteiro.</li>
        </ol>
      </div>

      <aside className="reading-stats">
        <h3>Seu nível</h3>
        <dl className="facts">
          <dt>Maior nível aprovado</dt>
          <dd>{stats.maxPassed ?? "—"}</dd>
          <dt>Aprovação (últimos {stats.count || 20})</dt>
          <dd>{stats.passRate === null ? "—" : `${stats.passRate}%`}</dd>
        </dl>
        <h3>Últimos trechos</h3>
        {recent.length === 0 ? (
          <p className="muted small">Nenhum trecho ainda.</p>
        ) : (
          <ul className="hardest">
            {recent.map((r) => (
              <li key={r.id ?? r.takenAt}>
                <b className={r.passed ? "good" : "bad"}>{r.passed ? "Passou" : "Não passou"}</b>
                <span className="muted small">
                  nível {r.level} · {Math.round(r.accuracy)}% ·{" "}
                  {new Date(r.takenAt).toLocaleDateString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
