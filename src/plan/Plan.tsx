import { useEffect, useMemo, useState } from "react";
import {
  api,
  type Attempt,
  type ReadingTestResult,
  type SightReadingResult,
  type Song,
} from "../api";
import { inLibrary } from "../library/filter";
import { exerciseTitle, type Exercise } from "../technique/exercises";
import { monthOf, PHASES } from "./curriculum";
import { evaluateGates, findSong, type Gate } from "./gates";
import {
  advanceTo,
  daysLeftInMonth,
  DEFAULT_PLAN,
  loadDoneBlocks,
  monthIndex,
  monthStart,
  repeatMonth,
  sessionFor,
  type Block,
  type PlanConfig,
} from "./calendar";
import { dayKey } from "../progress/summary";

/** Exercício completo a partir do que o mês define. */
export const fullExercise = (ex: Partial<Exercise>): Exercise => ({
  kind: "scale",
  tonic: 0,
  mode: "major",
  hands: "right",
  octaves: 1,
  figure: 8,
  bpm: 60,
  ...ex,
});

const GOALS = [20, 30, 40, 45, 60];

interface Props {
  config: PlanConfig | null;
  onConfig: (config: PlanConfig | null) => void;
  songs: Song[];
  version: number;
  busy: boolean;
  /** Bloco em andamento no cronômetro. */
  activeBlock: string | null;
  onBlock: (block: Block, blocks: Block[]) => void;
}

const date = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });

/** Aba Plano: o plano de 12 meses, a sessão de hoje e os gates. */
export function Plan({ config, onConfig, songs, version, busy, activeBlock, onBlock }: Props) {
  const [tests, setTests] = useState<ReadingTestResult[]>([]);
  const [sight, setSight] = useState<SightReadingResult[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [draft, setDraft] = useState<PlanConfig>(config ?? DEFAULT_PLAN);
  const [editing, setEditing] = useState(false);
  const now = Date.now();

  useEffect(() => {
    api.reading.tests(0).then(setTests, () => setTests([]));
    api.sight.list(0).then(setSight, () => setSight([]));
    api.library.allAttempts(0).then(setAttempts, () => setAttempts([]));
  }, [version]);

  const gates = useMemo(
    () => evaluateGates({ tests, sight, attempts, songs, gatePieceId: config?.gatePieceId }),
    [tests, sight, attempts, songs, config?.gatePieceId],
  );

  if (!config || editing) {
    return (
      <div className="progress-page plan-page">
        <header className="progress-head">
          <h2>Plano de estudo</h2>
        </header>
        <section className="progress-card plan-setup">
          <p>
            Um plano de 12 meses para aprender teclado e leitura de partitura, com uma sessão diária
            em 5 blocos (técnica, leitura, repertório, teoria e ritmo, livre) e uma meta ao fim de
            cada trimestre. O app abre cada bloco já configurado e mede as metas sozinho.
          </p>
          <label className="field">
            <span className="label">Começa em</span>
            <input
              type="date"
              value={draft.start}
              onChange={(e) => setDraft({ ...draft, start: e.target.value || DEFAULT_PLAN.start })}
            />
          </label>
          <label className="field">
            <span className="label">Minutos por dia</span>
            <select
              value={draft.minutes}
              onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })}
            >
              {GOALS.map((g) => (
                <option key={g} value={g}>
                  {g} min
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <button
              className="primary"
              onClick={() => {
                onConfig(draft);
                setEditing(false);
              }}
            >
              {config ? "Salvar" : "Começar o plano"}
            </button>
            {config && <button onClick={() => setEditing(false)}>Cancelar</button>}
            {config && (
              <button
                className="link danger"
                onClick={() => {
                  if (window.confirm("Apagar a configuração do plano? O histórico fica.")) {
                    onConfig(null);
                    setEditing(false);
                  }
                }}
              >
                Desligar o plano
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  const index = monthIndex(config, now);
  const month = monthOf(index === 0 ? 1 : index);
  const session = sessionFor(config, month, now);
  const done = new Set(loadDoneBlocks()[dayKey(now)] ?? []);
  const daysLeft = daysLeftInMonth(config, now);
  const library = songs.filter(inLibrary);

  return (
    <div className="progress-page plan-page">
      <header className="progress-head">
        <div>
          <h2>
            {index === 0
              ? `O plano começa em ${date(monthStart(config, 1))}`
              : index > 12
                ? "Plano concluído!"
                : `Mês ${index} de 12 · Fase ${month.phase} — ${PHASES[month.phase]}`}
          </h2>
          <p className="muted">
            {index > 12
              ? "Os 12 meses terminaram. Continue com a sessão de manutenção ou recomece."
              : `${index === 0 ? "Mês 1: " : ""}${month.title}${index >= 1 ? ` · faltam ${daysLeft} dias` : ""}`}
          </p>
        </div>
        <button onClick={() => (setDraft(config), setEditing(true))}>Ajustar plano</button>
      </header>

      <section className="progress-card">
        <h3>
          {session.title} · {session.blocks.reduce((s, b) => s + b.minutes, 0)} min
        </h3>
        {session.kind === "rest" && (
          <p className="muted small">Dia de descanso. Se quiser, só alguns cartões de leitura.</p>
        )}
        <ol className="plan-blocks">
          {session.blocks.map((b) => (
            <li
              key={b.id}
              className={done.has(b.id) ? "done" : activeBlock === b.id ? "active" : ""}
            >
              <span className="plan-check" aria-hidden>
                {done.has(b.id) ? "✓" : ""}
              </span>
              <span className="plan-block-text">
                <b>
                  {b.label} · {b.minutes} min
                </b>
                <span className="muted small">{b.detail}</span>
              </span>
              <button
                className={activeBlock === b.id ? "" : "primary"}
                disabled={busy}
                onClick={() => onBlock(b, session.blocks)}
              >
                {activeBlock === b.id ? "Abrir" : done.has(b.id) ? "De novo" : "Começar"}
              </button>
            </li>
          ))}
        </ol>
      </section>

      <div className="plan-grid">
        <section className="progress-card">
          <h3>Este mês</h3>
          <h4 className="plan-sub">Técnica</h4>
          <ul className="plan-list">
            {month.technique.map((t, i) => (
              <li key={i}>
                {exerciseTitle(fullExercise(t))} · {fullExercise(t).bpm} bpm
              </li>
            ))}
          </ul>
          <h4 className="plan-sub">Leitura e ritmo</h4>
          <ul className="plan-list">
            <li>
              Cartões:{" "}
              {month.reading.patterns === "interval"
                ? "intervalos"
                : month.reading.patterns === "triad"
                  ? "tríades"
                  : `notas, ${month.reading.clefs === "both" ? "as duas claves" : month.reading.clefs === "treble" ? "clave de sol" : "clave de fá"}${month.reading.range === "ledger" ? " com linhas suplementares" : ""}`}
            </li>
            <li>Primeira vista e ritmo: nível {month.sightLevel}</li>
          </ul>
          <h4 className="plan-sub">Repertório</h4>
          <ul className="plan-list">
            {month.repertoire.length === 0 && <li className="muted">a música em andamento</li>}
            {month.repertoire.map((r) => {
              const found = r.match.length ? findSong(library, r.match) : null;
              return (
                <li key={r.title}>
                  {r.title}{" "}
                  <span className="muted small">
                    {found
                      ? "· na biblioteca"
                      : r.match.length
                        ? r.included
                          ? "· não está na biblioteca"
                          : "· procure na aba Buscar"
                        : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          <h4 className="plan-sub">Teoria</h4>
          <ul className="plan-list">
            {month.theory.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        <section className="progress-card">
          <h3>Metas dos trimestres</h3>
          <div className="gates">
            {gates.map((g) => (
              <GateCard
                key={g.month}
                gate={g}
                current={index >= 1 && index <= 12 && Math.ceil(index / 3) === g.phase}
                config={config}
                now={now}
                index={index}
                daysLeft={daysLeft}
                library={library}
                onConfig={onConfig}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function GateCard({
  gate,
  current,
  config,
  now,
  index,
  daysLeft,
  library,
  onConfig,
}: {
  gate: Gate;
  current: boolean;
  config: PlanConfig;
  now: number;
  index: number;
  daysLeft: number;
  library: Song[];
  onConfig: (c: PlanConfig) => void;
}) {
  const canAdvance = gate.met && gate.month < 12 && index >= 1 && index <= gate.month;
  const canRepeat = !gate.met && index === gate.month && daysLeft <= 7;
  return (
    <div className={`gate ${gate.met ? "met" : ""} ${current ? "current" : ""}`}>
      <h4>
        Mês {gate.month} · {PHASES[gate.phase]}{" "}
        {gate.met && <span className="gate-ok">cumprida</span>}
      </h4>
      <ul>
        {gate.criteria.map((c) => (
          <li key={c.label} className={c.met ? "met" : ""}>
            <span aria-hidden>{c.met ? "✓" : "○"}</span>
            <span>
              {c.label}
              {!c.met && <span className="muted small"> — {c.current}</span>}
            </span>
          </li>
        ))}
      </ul>
      {gate.month === 9 && (
        <label className="field small">
          <span className="muted small">Peça do gate</span>
          <select
            value={config.gatePieceId ?? ""}
            onChange={(e) =>
              onConfig({ ...config, gatePieceId: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">Escolha…</option>
            {library.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {canAdvance && (
        <p className="gate-action">
          Meta cumprida.{" "}
          <button
            className="primary"
            onClick={() =>
              window.confirm(`Começar o mês ${gate.month + 1} hoje? O calendário se ajusta.`) &&
              onConfig(advanceTo(config, gate.month + 1, now))
            }
          >
            Avançar para o mês {gate.month + 1}
          </button>
        </p>
      )}
      {canRepeat && (
        <p className="gate-action">
          O trimestre está acabando sem a meta.{" "}
          <button
            onClick={() =>
              window.confirm(
                `Repetir o mês ${gate.month}? Todo o calendário seguinte anda um mês.`,
              ) && onConfig(repeatMonth(config))
            }
          >
            Repetir o mês {gate.month}
          </button>
        </p>
      )}
    </div>
  );
}
