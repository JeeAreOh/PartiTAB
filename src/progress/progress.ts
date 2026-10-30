import type { Attempt, Song } from "../api";

/** Dia local (AAAA-MM-DD) de um instante. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Meia-noite local do dia de `ms`, deslocada `offset` dias. */
function startOfDay(ms: number, offset = 0): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.getTime();
}

export interface DayTotal {
  date: string;
  /** Início do dia (ms), para rótulos. */
  start: number;
  minutes: number;
  sessions: number;
}

export interface Improvement {
  song: Song;
  first: number;
  best: number;
  delta: number;
  sessions: number;
}

export interface Summary {
  today: DayTotal;
  /** Dias seguidos com prática, contando hoje (ou até ontem, se hoje ainda não teve). */
  streak: number;
  /** Os últimos `days` dias, do mais antigo para hoje. */
  days: DayTotal[];
  weekMinutes: number;
  periodMinutes: number;
  periodSessions: number;
  /** Precisão média no período (null sem práticas). */
  accuracy: number | null;
  improved: Improvement[];
}

const minutes = (ms: number) => ms / 60_000;

/**
 * Resume as práticas: minutos por dia, sequência de dias, semana, precisão e
 * as músicas que mais evoluíram (primeira nota do período → melhor nota).
 */
export function summarize(attempts: Attempt[], songs: Song[], now: number, days = 30): Summary {
  const byDay = new Map<string, { ms: number; sessions: number }>();
  for (const a of attempts) {
    const key = dayKey(a.playedAt ?? 0);
    const d = byDay.get(key) ?? { ms: 0, sessions: 0 };
    byDay.set(key, { ms: d.ms + (a.durationMs ?? 0), sessions: d.sessions + 1 });
  }
  const totalOf = (start: number): DayTotal => {
    const date = dayKey(start);
    const d = byDay.get(date);
    return { date, start, minutes: d ? minutes(d.ms) : 0, sessions: d?.sessions ?? 0 };
  };

  const list = Array.from({ length: days }, (_, i) => totalOf(startOfDay(now, i - days + 1)));
  const today = list[list.length - 1];

  let streak = 0;
  let offset = today.sessions > 0 ? 0 : -1;
  while (byDay.has(dayKey(startOfDay(now, offset)))) {
    streak++;
    offset--;
  }

  const periodStart = startOfDay(now, -days + 1);
  const inPeriod = attempts.filter((a) => (a.playedAt ?? 0) >= periodStart);
  const weekStart = startOfDay(now, -6);
  const weekMinutes = minutes(
    attempts
      .filter((a) => (a.playedAt ?? 0) >= weekStart)
      .reduce((sum, a) => sum + (a.durationMs ?? 0), 0),
  );

  const songsById = new Map(songs.map((s) => [s.id, s]));
  const perSong = new Map<number, Attempt[]>();
  for (const a of inPeriod) perSong.set(a.songId, [...(perSong.get(a.songId) ?? []), a]);
  const improved: Improvement[] = [];
  for (const [id, list] of perSong) {
    const song = songsById.get(id);
    if (!song || list.length < 2) continue;
    const sorted = [...list].sort((a, b) => (a.playedAt ?? 0) - (b.playedAt ?? 0));
    const first = sorted[0].score;
    const best = Math.max(...sorted.slice(1).map((a) => a.score));
    if (best > first)
      improved.push({ song, first, best, delta: best - first, sessions: list.length });
  }
  improved.sort((a, b) => b.delta - a.delta || b.best - a.best);

  return {
    today,
    streak,
    days: list,
    weekMinutes,
    periodMinutes: list.reduce((s, d) => s + d.minutes, 0),
    periodSessions: inPeriod.length,
    accuracy: inPeriod.length
      ? Math.round(inPeriod.reduce((s, a) => s + a.accuracy, 0) / inPeriod.length)
      : null,
    improved: improved.slice(0, 5),
  };
}

/** "1 h 05 min", "12 min", "menos de 1 min". */
export function formatMinutes(value: number): string {
  const m = Math.round(value);
  if (value > 0 && m === 0) return "menos de 1 min";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}
