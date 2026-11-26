import { useEffect, useMemo, useState } from "react";
import { api, type Attempt, type Song } from "../api";
import { parsePrefs } from "../library/useLibrary";
import { cleanBpm, suggestFaster } from "./cleanTempo";
import {
  exerciseTitle,
  keyName,
  TONICS_MAJOR,
  TONICS_MINOR,
  type Exercise,
  type Figure,
  type Hands,
  type Kind,
  type Mode,
} from "./exercises";

/** Artista dos exercícios na biblioteca (é assim que a aba os encontra). */
export const TECHNIQUE_ARTIST = "Técnica";

const STORAGE = "partitab.technique";

const DEFAULT: Exercise = {
  kind: "scale",
  tonic: 0,
  mode: "major",
  hands: "right",
  octaves: 1,
  figure: 8,
  bpm: 72,
};

function readExercise(): Exercise {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) ?? "{}");
    return { ...DEFAULT, ...raw };
  } catch {
    return DEFAULT;
  }
}

const KINDS: [Kind, string][] = [
  ["scale", "Escala"],
  ["arpeggio", "Arpejo"],
  ["cadence", "Cadência"],
];
const HANDS: [Hands, string][] = [
  ["right", "Direita"],
  ["left", "Esquerda"],
  ["both", "Juntas"],
];
const FIGURES: [Figure, string][] = [
  [4, "Semínimas"],
  [8, "Colcheias"],
  [16, "Semicolcheias"],
];

/** Sugestão de estudo: um caminho do mais fácil ao mais difícil. */
const PATH: { label: string; ex: Partial<Exercise> }[] = [
  {
    label: "Dó maior, mão direita",
    ex: { kind: "scale", tonic: 0, mode: "major", hands: "right" },
  },
  {
    label: "Dó maior, mão esquerda",
    ex: { kind: "scale", tonic: 0, mode: "major", hands: "left" },
  },
  {
    label: "Dó maior, mãos juntas",
    ex: { kind: "scale", tonic: 0, mode: "major", hands: "both" },
  },
  {
    label: "Arpejo de Dó maior",
    ex: { kind: "arpeggio", tonic: 0, mode: "major", hands: "right" },
  },
  {
    label: "Cadência em Dó maior",
    ex: { kind: "cadence", tonic: 0, mode: "major", hands: "both" },
  },
  {
    label: "Sol maior, mãos juntas",
    ex: { kind: "scale", tonic: 7, mode: "major", hands: "both" },
  },
  {
    label: "Lá menor harmônica",
    ex: { kind: "scale", tonic: 9, mode: "harmonic", hands: "both" },
  },
  {
    label: "Fá maior, mãos juntas",
    ex: { kind: "scale", tonic: 5, mode: "major", hands: "both" },
  },
];

interface Props {
  songs: Song[];
  busy: boolean;
  /** Muda quando há prática nova (para recarregar os andamentos). */
  version?: number;
  onPractice: (ex: Exercise) => void;
  onOpenSong: (song: Song) => void;
}

/** Aba Técnica: escalas, arpejos e cadências em qualquer tonalidade. */
export function Technique({ songs, busy, version, onPractice, onOpenSong }: Props) {
  const [ex, setEx] = useState(readExercise);
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  useEffect(() => {
    api.library.allAttempts(0).then(setAttempts, () => setAttempts([]));
  }, [version]);

  const change = (patch: Partial<Exercise>) => {
    setEx((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(STORAGE, JSON.stringify(next));
      } catch {
        // sem armazenamento: só não lembra a escolha
      }
      return next;
    });
  };

  const tonics = ex.mode === "major" ? TONICS_MAJOR : TONICS_MINOR;
  const done = songs
    .filter((s) => s.artist === TECHNIQUE_ARTIST)
    .sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt));

  // Andamento limpo e sugestão de subir o andamento, por exercício.
  const tempos = useMemo(() => {
    const bySong = new Map<number, Attempt[]>();
    for (const a of attempts) bySong.set(a.songId, [...(bySong.get(a.songId) ?? []), a]);
    const out = new Map<
      number,
      { exercise: Exercise; clean: number | null; faster: number | null }
    >();
    for (const s of done) {
      const exercise = parsePrefs(s).exercise;
      if (!exercise) continue;
      const list = bySong.get(s.id) ?? [];
      out.set(s.id, {
        exercise,
        clean: cleanBpm(list, exercise),
        faster: suggestFaster(list, exercise),
      });
    }
    return out;
  }, [attempts, done]);

  return (
    <div className="progress-page technique-page">
      <header className="progress-head">
        <h2>Técnica</h2>
      </header>

      <section className="progress-card technique-form">
        <div className="field">
          <span className="label">Exercício</span>
          <Segmented options={KINDS} value={ex.kind} onChange={(kind) => change({ kind })} />
        </div>

        <div className="field">
          <span className="label">Tonalidade</span>
          <div className="row">
            <Segmented
              options={[
                ["major", "Maior"],
                ["harmonic", "Menor harmônica"],
                ...(ex.kind === "scale" ? [["natural", "Menor natural"] as [Mode, string]] : []),
              ]}
              value={ex.kind !== "scale" && ex.mode === "natural" ? "harmonic" : ex.mode}
              onChange={(mode) => change({ mode })}
            />
            <select
              value={ex.tonic}
              onChange={(e) => change({ tonic: Number(e.target.value) })}
              aria-label="Tônica"
            >
              {tonics.map((t) => (
                <option key={t} value={t}>
                  {keyName(t, ex.mode)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <span className="label">Mãos</span>
          <Segmented options={HANDS} value={ex.hands} onChange={(hands) => change({ hands })} />
        </div>

        {ex.kind !== "cadence" && (
          <>
            <div className="field">
              <span className="label">Extensão</span>
              <Segmented
                options={[
                  [1, "1 oitava"],
                  [2, "2 oitavas"],
                ]}
                value={ex.octaves}
                onChange={(octaves) => change({ octaves })}
              />
            </div>
            <div className="field">
              <span className="label">Figura</span>
              <Segmented
                options={FIGURES}
                value={ex.figure}
                onChange={(figure) => change({ figure })}
              />
            </div>
          </>
        )}

        <div className="field">
          <span className="label">Andamento</span>
          <div className="row">
            <input
              type="range"
              min={40}
              max={160}
              step={4}
              value={ex.bpm}
              onChange={(e) => change({ bpm: Number(e.target.value) })}
              aria-label="Andamento"
            />
            <span className="bpm">{ex.bpm} bpm</span>
          </div>
        </div>

        <div className="technique-go">
          <span className="muted">{exerciseTitle(normalized(ex))}</span>
          <button className="primary" disabled={busy} onClick={() => onPractice(normalized(ex))}>
            Praticar
          </button>
        </div>
        <p className="muted small">
          O exercício abre na partitura com o dedilhado escrito e entra na biblioteca: use Esperar
          ou Tocar junto, a rampa de andamento e o loop como em qualquer música.
        </p>
      </section>

      <section className="progress-card">
        <h3>Caminho sugerido</h3>
        <div className="technique-path">
          {PATH.map((p) => (
            <button
              key={p.label}
              disabled={busy}
              onClick={() => onPractice(normalized({ ...ex, ...p.ex }))}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section className="progress-card">
        <h3>Seus exercícios</h3>
        {done.length === 0 ? (
          <p className="muted">
            Os exercícios que você praticar aparecem aqui, com a melhor nota e o andamento limpo (o
            mais rápido tocado em Tocar junto com 95% de precisão ou mais).
          </p>
        ) : (
          <ul className="technique-list">
            {done.map((s) => {
              const t = tempos.get(s.id);
              return (
                <li key={s.id}>
                  <button className="improved-row" onClick={() => onOpenSong(s)}>
                    <span className="improved-title">
                      <b>{s.title}</b>
                      <span className="muted small">
                        {t ? `${t.exercise.bpm} bpm · ` : ""}
                        {s.plays} {s.plays === 1 ? "prática" : "práticas"}
                        {t?.clean ? ` · andamento limpo ${t.clean} bpm` : ""}
                      </span>
                    </span>
                    <span className="improved-score">
                      {s.bestScore === null ? "—" : <b>{s.bestScore}</b>}
                    </span>
                  </button>
                  {t?.faster && (
                    <div className="technique-faster">
                      <span className="small">3 execuções limpas seguidas.</span>
                      <button
                        className="primary small"
                        disabled={busy}
                        onClick={() => onPractice({ ...t.exercise, bpm: t.faster! })}
                      >
                        Subir para {t.faster} bpm?
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Arpejo e cadência não têm menor natural: usam a harmônica. */
const normalized = (ex: Exercise): Exercise =>
  ex.kind !== "scale" && ex.mode === "natural" ? { ...ex, mode: "harmonic" } : ex;

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          role="radio"
          aria-checked={value === v}
          className={value === v ? "on" : ""}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
