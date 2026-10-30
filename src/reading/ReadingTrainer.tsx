import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { Keyboard } from "../Keyboard";
import {
  FAST_MS,
  answer,
  cardId,
  newState,
  noteName,
  pickNext,
  pool,
  wrongOctave,
  type Card,
  type CardState,
  type Clef,
  type Range,
} from "./cards";
import { NoteCard } from "./NoteCard";

const SESSION = 20;
const SETTINGS_KEY = "partitab.reading";

interface Settings {
  clefs: "treble" | "bass" | "both";
  range: Range;
  accidentals: boolean;
  hideKeyboard: boolean;
}

const DEFAULTS: Settings = {
  clefs: "treble",
  range: "staff",
  accidentals: false,
  hideKeyboard: false,
};

function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

interface Props {
  /** O app entrega aqui as notas do teclado MIDI enquanto esta tela está aberta. */
  registerNoteHandler: (handler: ((key: number) => void) | null) => void;
  onError: (message: string) => void;
}

interface Result {
  card: Card;
  correct: boolean;
  ms: number;
}

export function ReadingTrainer({ registerNoteHandler, onError }: Props) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [states, setStates] = useState(new Map<string, CardState>());
  const [card, setCard] = useState<Card | null>(null);
  const [shownAt, setShownAt] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [feedback, setFeedback] = useState<{ kind: "good" | "bad"; text: string } | null>(null);
  const [pressed, setPressed] = useState(new Map<number, number>());
  const locked = useRef(false);
  // Estado mais recente (respostas seguidas não podem partir de uma cópia velha).
  const statesRef = useRef(states);
  statesRef.current = states;

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* só perde a preferência */
    }
  }, [settings]);

  useEffect(() => {
    api.reading
      .list()
      .then((list) => setStates(new Map(list.map((c) => [cardId(c.clef, c.key), c]))))
      .catch(() => undefined);
  }, []);

  const candidates = useMemo(() => {
    const clefs: Clef[] = settings.clefs === "both" ? ["treble", "bass"] : [settings.clefs];
    return clefs.flatMap((clef) =>
      pool(clef, settings.range, settings.accidentals).map((key) => ({ clef, key })),
    );
  }, [settings.clefs, settings.range, settings.accidentals]);

  const next = useCallback(
    (previous: string | null) => {
      setCard(pickNext(candidates, states, previous));
      setShownAt(performance.now());
      setFeedback(null);
      locked.current = false;
    },
    [candidates, states],
  );

  // Trocar as opções recomeça a sessão.
  useEffect(() => {
    setResults([]);
    next(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  const done = results.length >= SESSION;

  const respond = useCallback(
    (key: number) => {
      if (!card || locked.current || done) return;
      locked.current = true;
      const ms = Math.round(performance.now() - shownAt);
      const correct = key === card.key;
      const id = cardId(card.clef, card.key);
      const updated = answer(
        statesRef.current.get(id) ?? newState(card.clef, card.key),
        correct,
        ms,
      );
      statesRef.current = new Map(statesRef.current).set(id, updated);
      setStates(statesRef.current);
      api.reading.save(updated).catch((e) => onError(String(e)));
      setResults((r) => [...r, { card, correct, ms }]);
      setFeedback(
        correct
          ? { kind: "good", text: ms <= FAST_MS ? "Certo!" : "Certo, mas devagar" }
          : {
              kind: "bad",
              text: wrongOctave(card, key)
                ? `Oitava errada: era ${noteName(card)}`
                : `Era ${noteName(card)}`,
            },
      );
      window.setTimeout(() => next(id), correct ? 450 : 1400);
    },
    [card, shownAt, done, next, onError],
  );

  const respondRef = useRef(respond);
  respondRef.current = respond;
  useEffect(() => {
    registerNoteHandler((key) => respondRef.current(key));
    return () => registerNoteHandler(null);
  }, [registerNoteHandler]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const correctCount = results.filter((r) => r.correct).length;
  const avgMs = results.length ? results.reduce((a, r) => a + r.ms, 0) / results.length : 0;

  // Notas mais difíceis do conjunto atual (histórico salvo): com erros ou lentas.
  const accuracyOf = (s: CardState) => s.correct / s.seen;
  const avgOf = (s: CardState) => s.totalMs / s.seen;
  const hardest = candidates
    .map((c) => states.get(cardId(c.clef, c.key)))
    .filter((s): s is CardState => !!s && s.seen > 0 && (accuracyOf(s) < 1 || avgOf(s) > FAST_MS))
    .sort((a, b) => accuracyOf(a) - accuracyOf(b) || avgOf(b) - avgOf(a))
    .slice(0, 6);

  return (
    <section className="reading">
      <div className="reading-options">
        <div className="segmented" role="group" aria-label="Clave">
          {(
            [
              ["treble", "Clave de sol"],
              ["bass", "Clave de fá"],
              ["both", "As duas"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              className={settings.clefs === v ? "on" : ""}
              onClick={() => set("clefs", v)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Extensão">
          {(
            [
              ["staff", "Na pauta"],
              ["ledger", "Linhas suplementares"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              className={settings.range === v ? "on" : ""}
              onClick={() => set("range", v)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.accidentals}
            onChange={(e) => set("accidentals", e.target.checked)}
          />
          Sustenidos e bemóis
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.hideKeyboard}
            onChange={(e) => set("hideKeyboard", e.target.checked)}
          />
          Esconder teclado
        </label>
      </div>

      <div className="reading-main">
        <div className="reading-card">
          {done ? (
            <div className="reading-summary">
              <h2>
                {correctCount} de {SESSION} certas
              </h2>
              <p className="muted">
                Tempo médio {(avgMs / 1000).toFixed(1)} s. As notas que você erra ou demora para
                achar voltam mais vezes nas próximas sessões.
              </p>
              <button className="primary" onClick={() => (setResults([]), next(null))}>
                Treinar de novo
              </button>
            </div>
          ) : (
            card && (
              <>
                <NoteCard card={card} state={feedback?.kind} />
                <p className={`reading-feedback ${feedback?.kind ?? ""}`} aria-live="polite">
                  {feedback?.text ?? "Toque a nota no teclado"}
                </p>
              </>
            )
          )}
          <div className="reading-progress" aria-label={`${results.length} de ${SESSION}`}>
            {Array.from({ length: SESSION }, (_, i) => (
              <span
                key={i}
                className={i < results.length ? (results[i].correct ? "good" : "bad") : ""}
              />
            ))}
          </div>
        </div>

        <aside className="reading-stats">
          <h3>Esta sessão</h3>
          <dl className="facts">
            <dt>Certas</dt>
            <dd>
              {correctCount} de {results.length}
            </dd>
            <dt>Tempo médio</dt>
            <dd>{results.length ? `${(avgMs / 1000).toFixed(1)} s` : "—"}</dd>
          </dl>
          <h3>Mais difíceis</h3>
          {hardest.length === 0 ? (
            <p className="muted small">Nenhuma nota com erro ou demora por enquanto.</p>
          ) : (
            <ul className="hardest">
              {hardest.map((s) => (
                <li key={cardId(s.clef, s.key)}>
                  <b>{noteName({ clef: s.clef, key: s.key, accidental: null })}</b>
                  <span className="muted small">
                    {s.clef === "treble" ? "sol" : "fá"} · {Math.round((100 * s.correct) / s.seen)}%
                    · {(s.totalMs / s.seen / 1000).toFixed(1)} s
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {!settings.hideKeyboard && (
        <Keyboard
          pressed={pressed}
          expected={feedback?.kind === "bad" && card ? new Set([card.key]) : undefined}
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
    </section>
  );
}
