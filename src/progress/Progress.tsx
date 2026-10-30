import { useEffect, useMemo, useState } from "react";
import { api, type Attempt, type Song } from "../api";
import { Cover } from "../library/Cover";
import { formatMinutes, summarize, type DayTotal } from "./summary";

const GOAL = "partitab.dailyGoal";
const GOALS = [10, 15, 20, 30, 45, 60];
/** Quanto do histórico buscar (a sequência de dias conta até aqui). */
const HISTORY_DAYS = 120;

function readGoal(): number {
  try {
    const v = Number(localStorage.getItem(GOAL));
    return GOALS.includes(v) ? v : 20;
  } catch {
    return 20;
  }
}

interface Props {
  songs: Song[];
  /** Muda quando há prática nova (para recarregar). */
  version: number;
  onOpenSong: (song: Song) => void;
}

/** Painel de progresso: tempo praticado, meta diária, sequência e evolução. */
export function Progress({ songs, version, onOpenSong }: Props) {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [goal, setGoal] = useState(readGoal);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.library
      .allAttempts(Date.now() - HISTORY_DAYS * 86_400_000)
      .then(setAttempts, (e) => setError(String(e)));
  }, [version]);

  const summary = useMemo(
    () => (attempts ? summarize(attempts, songs, Date.now()) : null),
    [attempts, songs],
  );

  const changeGoal = (value: number) => {
    setGoal(value);
    try {
      localStorage.setItem(GOAL, String(value));
    } catch {
      /* só perde a preferência */
    }
  };

  if (error)
    return (
      <div className="progress-page">
        <p className="warn">{error}</p>
      </div>
    );
  if (!summary)
    return (
      <div className="progress-page">
        <p className="muted">Carregando…</p>
      </div>
    );

  const done = Math.min(1, summary.today.minutes / goal);
  const empty = summary.periodSessions === 0;

  return (
    <div className="progress-page">
      <header className="progress-head">
        <h2>Seu progresso</h2>
        <label className="goal-select">
          Meta diária
          <select value={goal} onChange={(e) => changeGoal(Number(e.target.value))}>
            {GOALS.map((g) => (
              <option key={g} value={g}>
                {g} min
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="stat-tiles">
        <div className="stat-tile today">
          <GoalRing value={done} />
          <div>
            <span className="label">Hoje</span>
            <b>{formatMinutes(summary.today.minutes)}</b>
            <span className="muted small">
              {done >= 1
                ? "Meta cumprida!"
                : `faltam ${formatMinutes(goal - summary.today.minutes)} para a meta`}
            </span>
          </div>
        </div>
        <div className="stat-tile">
          <span className="label">Sequência</span>
          <b>
            {summary.streak} {summary.streak === 1 ? "dia" : "dias"}
          </b>
          <span className="muted small">
            {summary.streak === 0
              ? "pratique hoje para começar"
              : summary.today.sessions > 0
                ? "seguidos, contando hoje"
                : "pratique hoje para não perder"}
          </span>
        </div>
        <div className="stat-tile">
          <span className="label">Últimos 7 dias</span>
          <b>{formatMinutes(summary.weekMinutes)}</b>
          <span className="muted small">de prática com correção</span>
        </div>
        <div className="stat-tile">
          <span className="label">Precisão (30 dias)</span>
          <b>{summary.accuracy === null ? "—" : `${summary.accuracy}%`}</b>
          <span className="muted small">{summary.periodSessions} práticas</span>
        </div>
      </div>

      <section className="progress-card">
        <h3>Minutos por dia</h3>
        {empty ? (
          <p className="muted">
            Nenhuma prática nos últimos 30 dias. Use os modos Esperar ou Tocar junto: cada prática
            entra aqui.
          </p>
        ) : (
          <DaysChart days={summary.days} goal={goal} />
        )}
      </section>

      <section className="progress-card">
        <h3>Mais evoluíram (30 dias)</h3>
        {summary.improved.length === 0 ? (
          <p className="muted">
            Toque a mesma música mais de uma vez: as que subirem de nota aparecem aqui.
          </p>
        ) : (
          <ul className="improved">
            {summary.improved.map((i) => (
              <li key={i.song.id}>
                <button className="improved-row" onClick={() => onOpenSong(i.song)}>
                  <Cover
                    title={i.song.title}
                    artist={i.song.artist}
                    cover={i.song.cover}
                    size="sm"
                  />
                  <span className="improved-title">
                    <b>{i.song.title}</b>
                    <span className="muted small">
                      {i.song.artist || "Artista desconhecido"} · {i.sessions} práticas
                    </span>
                  </span>
                  <span className="improved-score">
                    {i.first} → <b>{i.best}</b>
                    <span className="delta">+{i.delta}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="muted small">
        Só contam as práticas com correção (Esperar e Tocar junto). Práticas gravadas antes desta
        versão entram na sequência, mas sem minutos.
      </p>
    </div>
  );
}

function GoalRing({ value }: { value: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg className="goal-ring" viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <circle cx="28" cy="28" r={r} className="track" />
      <circle
        cx="28"
        cy="28"
        r={r}
        className="fill"
        strokeDasharray={`${c * value} ${c}`}
        transform="rotate(-90 28 28)"
      />
      <text x="28" y="28" textAnchor="middle" dominantBaseline="central">
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
}

const W = 640;
const H = 170;
const PAD = { top: 12, right: 8, bottom: 22, left: 30 };

function DaysChart({ days, goal }: { days: DayTotal[]; goal: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(goal * 1.25, ...days.map((d) => d.minutes));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / days.length;
  const barW = Math.max(3, slot - 3);
  const y = (m: number) => PAD.top + plotH - (m / max) * plotH;
  const ticks = [0, Math.round(max / 2), Math.round(max)];
  const label = (d: DayTotal) =>
    new Date(d.start).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
  const active = hover !== null ? days[hover] : null;

  return (
    <div className="chart-box days-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Minutos praticados por dia"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="grid" />
            <text
              x={PAD.left - 6}
              y={y(v)}
              className="axis"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {v}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const h = Math.max(0, PAD.top + plotH - y(d.minutes));
          const x = PAD.left + i * slot + (slot - barW) / 2;
          return d.sessions > 0 ? (
            <path
              key={d.date}
              className={hover === i ? "bar on" : "bar"}
              // Ponta arredondada só em cima, base reta na linha zero.
              d={roundedTop(x, PAD.top + plotH - Math.max(h, 2), barW, Math.max(h, 2), 4)}
            />
          ) : null;
        })}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(goal)} y2={y(goal)} className="goal-line" />
        <text x={W - PAD.right} y={y(goal) - 4} className="axis" textAnchor="end">
          meta
        </text>
        {[0, Math.floor(days.length / 2), days.length - 1].map((i) => (
          <text
            key={i}
            x={PAD.left + i * slot + slot / 2}
            y={H - 6}
            className="axis"
            textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"}
          >
            {i === days.length - 1 ? "hoje" : label(days[i])}
          </text>
        ))}
        {days.map((d, i) => (
          <rect
            key={`hit${d.date}`}
            x={PAD.left + i * slot}
            y={0}
            width={slot}
            height={H}
            fill="transparent"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {active && (
        <div
          className={`chart-tooltip ${hover! > days.length / 2 ? "end" : "start"}`}
          style={{
            left: `${((PAD.left + hover! * slot + slot / 2) / W) * 100}%`,
            top: `${(y(active.minutes) / H) * 100}%`,
          }}
        >
          <div>
            <b>{formatMinutes(active.minutes)}</b>
          </div>
          <span>
            {label(active)} · {active.sessions} {active.sessions === 1 ? "prática" : "práticas"}
          </span>
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
