import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { Keyboard } from "../Keyboard";
import { useStudyTimer } from "../progress/studyTimer";
import type { Clef } from "./cards";
import { PatternCardView } from "./PatternCardView";
import {
  answerPattern,
  CHORD_WINDOW_MS,
  isCorrect,
  newPatternState,
  PATTERN_FAST_MS,
  patternPool,
  pickPattern,
  spelledName,
  wrongSoFar,
  type PatternCard,
  type PatternKind,
  type PatternState,
} from "./patterns";

const SESSION = 20;

interface Props {
  registerNoteHandler: (handler: ((key: number) => void) | null) => void;
  onError: (message: string) => void;
  onStudySaved?: () => void;
  kind: PatternKind;
  clefs: Clef[];
  hideKeyboard: boolean;
}

/** Rodadas de 20 cartões de intervalos ou tríades, tocados no teclado. */
export function PatternTrainer({
  registerNoteHandler,
  onError,
  onStudySaved,
  kind,
  clefs,
  hideKeyboard,
}: Props) {
  const [states, setStates] = useState(new Map<string, PatternState>());
  const [card, setCard] = useState<PatternCard | null>(null);
  const [shownAt, setShownAt] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [feedback, setFeedback] = useState<{ kind: "good" | "bad"; text: string } | null>(null);
  const [played, setPlayed] = useState<number[]>([]);
  const buffer = useRef<number[]>([]);
  const timer = useRef<number | null>(null);
  const locked = useRef(false);
  const statesRef = useRef(states);
  statesRef.current = states;
  const study = useStudyTimer("patterns", onStudySaved);

  useEffect(() => {
    api.reading
      .patterns()
      .then((list) => setStates(new Map(list.map((s) => [s.id, s]))))
      .catch(() => undefined);
  }, []);

  const pool = useMemo(() => patternPool(kind, clefs), [kind, clefs]);

  const next = useCallback(
    (previous: string | null) => {
      if (timer.current) window.clearTimeout(timer.current);
      buffer.current = [];
      setPlayed([]);
      setCard(pool.length ? pickPattern(pool, statesRef.current, previous) : null);
      setShownAt(performance.now());
      setFeedback(null);
      locked.current = false;
    },
    [pool],
  );

  useEffect(() => {
    setResults([]);
    next(null);
  }, [next]);

  const done = results.length >= SESSION;

  const evaluate = useCallback(() => {
    if (!card || locked.current) return;
    locked.current = true;
    timer.current = null;
    const keys = buffer.current;
    const correct = isCorrect(card, keys);
    const ms = Math.round(performance.now() - shownAt);
    const updated = answerPattern(
      statesRef.current.get(card.id) ?? newPatternState(card.id),
      correct,
      ms,
    );
    statesRef.current = new Map(statesRef.current).set(card.id, updated);
    setStates(statesRef.current);
    api.reading.savePattern(updated).catch((e) => onError(String(e)));
    if (results.length + 1 >= SESSION) study.flush();
    setResults((r) => [...r, correct]);
    setFeedback(
      correct
        ? {
            kind: "good",
            text:
              ms <= PATTERN_FAST_MS ? `Certo: ${card.name}` : `Certo, mas devagar: ${card.name}`,
          }
        : { kind: "bad", text: `Era ${card.name}: ${card.notes.map(spelledName).join(" – ")}` },
    );
    window.setTimeout(() => next(card.id), correct ? 900 : 2200);
  }, [card, shownAt, results.length, next, onError, study]);

  const respond = useCallback(
    (key: number) => {
      if (!card || locked.current || done) return;
      study.touch();
      buffer.current = [...buffer.current, key];
      setPlayed(buffer.current);
      if (card.harmonic) {
        // Notas juntas: avalia 150 ms depois da primeira.
        if (!timer.current) timer.current = window.setTimeout(evaluate, CHORD_WINDOW_MS);
      } else if (wrongSoFar(card, buffer.current) || buffer.current.length >= card.notes.length) {
        evaluate();
      }
    },
    [card, done, evaluate, study],
  );

  const respondRef = useRef(respond);
  respondRef.current = respond;
  useEffect(() => {
    registerNoteHandler((key) => respondRef.current(key));
    return () => {
      registerNoteHandler(null);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [registerNoteHandler]);

  const correctCount = results.filter(Boolean).length;
  const hardest = pool
    .map((c) => ({ c, s: states.get(c.id) }))
    .filter(
      (x): x is { c: PatternCard; s: PatternState } =>
        !!x.s && x.s.seen > 0 && x.s.correct < x.s.seen,
    )
    .sort((a, b) => a.s.correct / a.s.seen - b.s.correct / b.s.seen || b.s.seen - a.s.seen)
    .slice(0, 6);

  const instruction = !card
    ? ""
    : card.kind === "triad"
      ? "Toque o acorde (as três notas juntas)"
      : card.harmonic
        ? "Toque as duas notas juntas"
        : "Toque as duas notas, da esquerda para a direita";

  return (
    <>
      <div className="reading-main">
        <div className="reading-card">
          {done ? (
            <div className="reading-summary">
              <h2>
                {correctCount} de {SESSION} certos
              </h2>
              <p className="muted">
                Os {kind === "interval" ? "intervalos" : "acordes"} que você erra ou demora para
                tocar voltam mais vezes nas próximas rodadas.
              </p>
              <button className="primary" onClick={() => (setResults([]), next(null))}>
                Treinar de novo
              </button>
            </div>
          ) : (
            card && (
              <>
                <PatternCardView card={card} state={feedback?.kind} />
                <p className={`reading-feedback ${feedback?.kind ?? ""}`} aria-live="polite">
                  {feedback?.text ?? instruction}
                </p>
              </>
            )
          )}
          <div className="reading-progress" aria-label={`${results.length} de ${SESSION}`}>
            {Array.from({ length: SESSION }, (_, i) => (
              <span key={i} className={i < results.length ? (results[i] ? "good" : "bad") : ""} />
            ))}
          </div>
        </div>

        <aside className="reading-stats">
          <h3>Esta rodada</h3>
          <dl className="facts">
            <dt>Certos</dt>
            <dd>
              {correctCount} de {results.length}
            </dd>
          </dl>
          <h3>Mais difíceis</h3>
          {hardest.length === 0 ? (
            <p className="muted small">Nenhum erro por enquanto.</p>
          ) : (
            <ul className="hardest">
              {hardest.map(({ c, s }) => (
                <li key={c.id}>
                  <b>{c.name}</b>
                  <span className="muted small">
                    {c.clef === "treble" ? "sol" : "fá"} · {Math.round((100 * s.correct) / s.seen)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {!hideKeyboard && (
        <Keyboard
          pressed={new Map(played.map((k) => [k, 90]))}
          expected={
            feedback?.kind === "bad" && card ? new Set(card.notes.map((n) => n.key)) : undefined
          }
          onPress={(k) => {
            api.playNote(k, 90);
            respond(k);
          }}
          onRelease={(k) => api.playNote(k, 0)}
        />
      )}
    </>
  );
}
