import type { Attempt, Song, StudySession } from "../api";

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
  /** Práticas de música mais sessões de estudo (leitura, ritmo...). */
  sessions: number;
  /** Desses minutos, quantos foram de estudo fora das músicas. */
  studyMinutes: number;
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
  /** Minutos de estudo fora das músicas no período. */
  periodStudyMinutes: number;
  periodSessions: number;
  /** Precisão média no período (null sem práticas). */
  accuracy: number | null;
  improved: Improvement[];
}

const minutes = (ms: number) => ms / 60_000;

/**
 * Resume as práticas: minutos por dia, sequência de dias, semana, precisão e
 * as músicas que mais evoluíram (primeira nota do período → melhor nota).
 * As sessões de estudo (leitura, ritmo, padrões) somam aos minutos, aos dias
 * seguidos e à meta.
 */
export function summarize(
  attempts: Attempt[],
  songs: Song[],
  now: number,
  days = 30,
  study: StudySession[] = [],
): Summary {
  const byDay = new Map<string, { ms: number; sessions: number; studyMs: number }>();
  const add = (at: number, ms: number, isStudy: boolean) => {
    const key = dayKey(at);
    const d = byDay.get(key) ?? { ms: 0, sessions: 0, studyMs: 0 };
    byDay.set(key, {
      ms: d.ms + ms,
      sessions: d.sessions + 1,
      studyMs: d.studyMs + (isStudy ? ms : 0),
    });
  };
  for (const a of attempts) add(a.playedAt ?? 0, a.durationMs ?? 0, false);
  for (const s of study) add(s.startedAt, s.durationMs, true);
  const totalOf = (start: number): DayTotal => {
    const date = dayKey(start);
    const d = byDay.get(date);
    return {
      date,
      start,
      minutes: d ? minutes(d.ms) : 0,
      sessions: d?.sessions ?? 0,
      studyMinutes: d ? minutes(d.studyMs) : 0,
    };
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
      .reduce((sum, a) => sum + (a.durationMs ?? 0), 0) +
      study.filter((s) => s.startedAt >= weekStart).reduce((sum, s) => sum + s.durationMs, 0),
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
      improved.push({
        song,
        first,
        best,
        delta: best - first,
        sessions: list.length,
      });
  }
  improved.sort((a, b) => b.delta - a.delta || b.best - a.best);

  return {
    today,
    streak,
    days: list,
    weekMinutes,
    periodMinutes: list.reduce((s, d) => s + d.minutes, 0),
    periodStudyMinutes: list.reduce((s, d) => s + d.studyMinutes, 0),
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
