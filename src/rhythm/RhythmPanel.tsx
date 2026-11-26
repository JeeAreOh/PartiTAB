import { useEffect, useState } from "react";
import { LEVELS } from "../sightreading/levels";
import { loadRhythmResults, recentDeviation, type RhythmResult } from "./summary";

const LEVEL_KEY = "partitab.rhythmLevel";

function savedLevel(): number {
  try {
    const n = Number(localStorage.getItem(LEVEL_KEY));
    return n >= 1 && n <= LEVELS.length ? n : 1;
  } catch {
    return 1;
  }
}

interface Props {
  version?: number;
  busy: boolean;
  planLevel?: number | null;
  onStart: (level: number) => void;
}

/** Aba Leitura → Ritmo: linhas de 4 compassos em que só o tempo conta. */
export function RhythmPanel({ version, busy, planLevel, onStart }: Props) {
  const [level, setLevel] = useState(() => planLevel ?? savedLevel());
  const [results, setResults] = useState<RhythmResult[]>(loadRhythmResults);

  useEffect(() => setResults(loadRhythmResults()), [version]);

  const choose = (n: number) => {
    setLevel(n);
    try {
      localStorage.setItem(LEVEL_KEY, String(n));
    } catch {
      /* só perde a preferência */
    }
  };

  const info = LEVELS[level - 1];
  const avg = recentDeviation(results);
  const recent = results.slice(0, 10);

  return (
    <div className="reading-main">
      <div className="reading-card sight-panel">
        <div className="sight-levels" role="radiogroup" aria-label="Nível">
          {LEVELS.map((l) => (
            <button
              key={l.level}
              role="radio"
              aria-checked={level === l.level}
              className={level === l.level ? "on" : ""}
              onClick={() => choose(l.level)}
            >
              <b>{l.level}</b>
              <span className="small">mês {l.month}</span>
            </button>
          ))}
        </div>
        <h2>Ritmo · nível {level}</h2>
        <p className="muted">
          4 compassos em {info.meters.join(", ")}, {info.bpm} bpm, com as figuras do nível{" "}
          {level}
          {level === 7 ? " (inclui síncope e tercina)" : ""}.{" "}
          {planLevel === level ? "É o nível do mês no seu plano." : ""}
        </p>
        <button className="primary" disabled={busy} onClick={() => onStart(level)}>
          Nova linha
        </button>
        <ol className="sight-steps muted small">
          <li>Todas as notas estão no Si da clave de sol: leia só o ritmo.</li>
          <li>Toque qualquer tecla (ou bata no mesmo dó) no tempo de cada nota.</li>
          <li>O metrônomo dá 1 compasso de contagem e segue ligado.</li>
          <li>No fim aparece o desvio médio, em milissegundos: quanto menor, melhor.</li>
        </ol>
      </div>

      <aside className="reading-stats">
        <h3>Desvio médio</h3>
        <p>
          {avg === null ? (
            <span className="muted small">Nenhuma linha ainda.</span>
          ) : (
            <>
              <b>{avg} ms</b>{" "}
              <span className="muted small">nas últimas {Math.min(10, results.length)}</span>
            </>
          )}
        </p>
        {recent.length > 0 && (
          <>
            <h3>Últimas linhas</h3>
            <ul className="hardest">
              {recent.map((r) => (
                <li key={r.takenAt}>
                  <b>{r.deviationMs === null ? "—" : `${r.deviationMs} ms`}</b>
                  <span className="muted small">
                    nível {r.level} · {r.accuracy}% ·{" "}
                    {new Date(r.takenAt).toLocaleDateString("pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}
