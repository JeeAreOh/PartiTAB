import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ReadingTestResult } from "../api";
import { Keyboard } from "../Keyboard";
import { useStudyTimer } from "../progress/studyTimer";
import { cardId, pickNext, type Card, type Clef, type Range } from "./cards";
import { NoteCard } from "./NoteCard";
import { testDeck, testStats, TEST_SIZE } from "./test";

interface Props {
  registerNoteHandler: (handler: ((key: number) => void) | null) => void;
  onError: (message: string) => void;
  onStudySaved?: () => void;
  candidates: { clef: Clef; key: number }[];
  clefs: ReadingTestResult["clefs"];
  range: Range;
  hideKeyboard: boolean;
}

type Phase = "idle" | "running" | "done";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

/**
 * Teste das 20 notas: notas sorteadas, sem repetição espaçada. Errar não
 * avança (a nota fica até ser acertada, e o tempo corre).
 */
export function NoteTest({
  registerNoteHandler,
  onError,
  onStudySaved,
  candidates,
  clefs,
  range,
  hideKeyboard,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [deck, setDeck] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [errors, setErrors] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<ReadingTestResult | null>(null);
  const [history, setHistory] = useState<ReadingTestResult[]>([]);
  const [wrong, setWrong] = useState(false);
  const [pressed, setPressed] = useState(new Map<number, number>());
  const study = useStudyTimer("reading_test", onStudySaved);

  const loadHistory = useCallback(
    () =>
      api.reading
        .tests()
        .then(setHistory)
        .catch(() => setHistory([])),
    [],
  );
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Trocar clave ou extensão cancela o teste em andamento.
  useEffect(() => {
    setPhase("idle");
  }, [candidates]);

  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [phase]);

  const start = () => {
    setDeck(testDeck(candidates, (c, prev) => pickNext(c, new Map(), prev)));
    setIndex(0);
    setErrors(0);
    setResult(null);
    setWrong(false);
    const t = performance.now();
    setStartedAt(t);
    setNow(t);
    setPhase("running");
    study.touch();
  };

  const finish = useCallback(
    (totalErrors: number) => {
      const test: ReadingTestResult = {
        takenAt: Date.now(),
        clefs,
        range,
        totalMs: Math.round(performance.now() - startedAt),
        errors: totalErrors,
      };
      setResult(test);
      setPhase("done");
      study.flush();
      api.reading
        .saveTest(test)
        .then(loadHistory)
        .catch((e) => onError(String(e)));
    },
    [clefs, range, startedAt, study, loadHistory, onError],
  );

  const respond = useCallback(
    (key: number) => {
      if (phase !== "running") return;
      const card = deck[index];
      if (!card) return;
      study.touch();
      if (key !== card.key) {
        setErrors((e) => e + 1);
        setWrong(true);
        return;
      }
      setWrong(false);
      if (index + 1 >= deck.length) finish(errors);
      else setIndex(index + 1);
    },
    [phase, deck, index, errors, finish, study],
  );

  const respondRef = useRef(respond);
  respondRef.current = respond;
  useEffect(() => {
    registerNoteHandler((key) => respondRef.current(key));
    return () => registerNoteHandler(null);
  }, [registerNoteHandler]);

  const same = history.filter((t) => t.clefs === clefs && t.range === range);
  const stats = testStats(same);
  const card = deck[index];
  const elapsed = phase === "running" ? now - startedAt : (result?.totalMs ?? 0);

  return (
    <>
      <div className="reading-main">
        <div className="reading-card">
          {phase === "idle" && (
            <div className="reading-summary">
              <h2>Teste das {TEST_SIZE} notas</h2>
              <p className="muted">
                {TEST_SIZE} notas sorteadas, uma de cada vez. O cronômetro corre do início ao fim;
                se errar, a nota fica até você acertar. O plano de estudo usa este tempo como meta
                (por exemplo, menos de 40 s nas duas claves).
              </p>
              <button className="primary" onClick={start} disabled={!candidates.length}>
                Começar teste
              </button>
            </div>
          )}
          {phase === "running" && card && (
            <>
              <div className="test-clock" aria-live="off">
                {seconds(elapsed)}
              </div>
              <NoteCard
                key={`${index}-${cardId(card.clef, card.key)}`}
                card={card}
                state={wrong ? "bad" : undefined}
              />
              <p className={`reading-feedback ${wrong ? "bad" : ""}`} aria-live="polite">
                {wrong ? "Errado, tente de novo" : `Nota ${index + 1} de ${deck.length}`}
              </p>
            </>
          )}
          {phase === "done" && result && (
            <div className="reading-summary">
              <h2>{seconds(result.totalMs)}</h2>
              <p className="muted">
                {result.errors === 0
                  ? "Sem erros."
                  : `${result.errors} ${result.errors === 1 ? "erro" : "erros"}.`}{" "}
                {stats.best && stats.best.takenAt === result.takenAt && same.length > 1
                  ? "Novo recorde!"
                  : stats.best
                    ? `Melhor tempo: ${seconds(stats.best.totalMs)}.`
                    : ""}
              </p>
              <button className="primary" onClick={start}>
                Fazer de novo
              </button>
            </div>
          )}
          {phase === "running" && (
            <div className="reading-progress" aria-label={`${index} de ${deck.length}`}>
              {deck.map((_, i) => (
                <span key={i} className={i < index ? "good" : ""} />
              ))}
            </div>
          )}
        </div>

        <aside className="reading-stats">
          <h3>Melhor tempo</h3>
          <p>
            {stats.best ? (
              <>
                <b>{seconds(stats.best.totalMs)}</b>{" "}
                <span className="muted small">
                  em {new Date(stats.best.takenAt).toLocaleDateString("pt-BR")}
                </span>
              </>
            ) : (
              <span className="muted small">Nenhum teste com estas opções ainda.</span>
            )}
          </p>
          {stats.recent.length > 0 && (
            <>
              <h3>Últimos {stats.recent.length}</h3>
              <TestChart tests={stats.recent} />
            </>
          )}
        </aside>
      </div>

      {!hideKeyboard && (
        <Keyboard
          pressed={pressed}
          onPress={(k) => {
            setPressed(new Map([[k, 90]]));
            api.playNote(k, 90);
            respond(k);
          }}
          onRelease={(k) => {
            setPressed(new Map());
            api.playNote(k, 0);
          }}
        />
      )}
    </>
  );
}

/** Barras com o tempo dos últimos testes (o mais antigo à esquerda). */
function TestChart({ tests }: { tests: ReadingTestResult[] }) {
  const W = 220;
  const H = 90;
  const max = Math.max(...tests.map((t) => t.totalMs));
  const slot = W / tests.length;
  return (
    <svg
      className="test-chart"
      viewBox={`0 0 ${W} ${H + 14}`}
      width="100%"
      role="img"
      aria-label="Tempo dos últimos testes"
    >
      {tests.map((t, i) => {
        const h = Math.max(2, (t.totalMs / max) * H);
        return (
          <g key={t.id ?? t.takenAt}>
            <rect className="bar" x={i * slot + 2} y={H - h} width={slot - 4} height={h} rx={2}>
              <title>
                {seconds(t.totalMs)} · {t.errors} erros ·{" "}
                {new Date(t.takenAt).toLocaleDateString("pt-BR")}
              </title>
            </rect>
            <text className="axis" x={i * slot + slot / 2} y={H + 11} textAnchor="middle">
              {Math.round(t.totalMs / 1000)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
