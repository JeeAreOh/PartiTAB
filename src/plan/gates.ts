/**
 * Gates do plano: critérios automáticos ao fim de cada trimestre, lidos do
 * teste das 20 notas, da primeira vista, dos exercícios de técnica e das
 * execuções das peças. Também as cinco métricas do plano, com a tendência.
 */

import type { Attempt, ReadingTestResult, SightReadingResult, Song } from "../api";
import { inLibrary, normalize } from "../library/filter";
import { parsePrefs } from "../library/useLibrary";
import { cleanBpm, isClean } from "../technique/cleanTempo";
import { TECHNIQUE_ARTIST } from "../technique/Technique";

export interface GateData {
  tests: ReadingTestResult[];
  sight: SightReadingResult[];
  attempts: Attempt[];
  songs: Song[];
  gatePieceId?: number | null;
}

export interface Criterion {
  label: string;
  met: boolean;
  /** Valor atual, para mostrar quando ainda não foi cumprido. */
  current: string;
}

export interface Gate {
  month: 3 | 6 | 9 | 12;
  phase: 1 | 2 | 3 | 4;
  criteria: Criterion[];
  met: boolean;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

/** Melhor tempo (ms) no teste das 20 notas com as duas claves. */
export function bestBothClefs(tests: ReadingTestResult[]): number | null {
  const both = tests.filter((t) => t.clefs === "both");
  return both.length ? Math.min(...both.map((t) => t.totalMs)) : null;
}

/** Maior nível de primeira vista aprovado. */
export const maxSightLevel = (sight: SightReadingResult[]) =>
  sight.filter((r) => r.passed).reduce((m, r) => Math.max(m, r.level), 0);

/** Execuções em Tocar junto da música, da mais recente para a mais antiga. */
const plays = (attempts: Attempt[], songId: number) =>
  attempts
    .filter((a) => a.songId === songId && a.mode === "play")
    .sort((a, b) => (b.playedAt ?? 0) - (a.playedAt ?? 0));

const good = (a: Attempt) => a.score >= 90 && a.speed >= 100;

/** Peça pronta: nota ≥ 90 em Tocar junto, a 100%, nas últimas 3 execuções. */
export function isReady(attempts: Attempt[], songId: number): boolean {
  const last = plays(attempts, songId).slice(0, 3);
  return last.length === 3 && last.every(good);
}

/** Peças de repertório (sem exercícios nem trechos gerados) prontas. */
export const readyPieces = (attempts: Attempt[], songs: Song[]) =>
  songs.filter((s) => inLibrary(s) && s.artist !== TECHNIQUE_ARTIST && isReady(attempts, s.id));

/** Primeira música cujo título contém um dos trechos. */
export function findSong(songs: Song[], match: string[]): Song | null {
  const wanted = match.map(normalize).filter(Boolean);
  return songs.find((s) => wanted.some((w) => normalize(s.title).includes(w))) ?? null;
}

/** Andamento limpo de cada escala maior (tônica → bpm), dos exercícios de técnica. */
export function scaleTempos(attempts: Attempt[], songs: Song[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of songs) {
    const ex = parsePrefs(s).exercise;
    if (!ex || ex.kind !== "scale" || ex.mode !== "major") continue;
    const bpm = cleanBpm(
      attempts.filter((a) => a.songId === s.id),
      ex,
    );
    if (bpm !== null) out.set(ex.tonic, Math.max(out.get(ex.tonic) ?? 0, bpm));
  }
  return out;
}

/** Tônicas maiores com até 3 acidentes: Dó, Sol, Ré, Lá, Fá, Si♭, Mi♭. */
export const KEYS_UP_TO_3 = [0, 7, 2, 9, 5, 10, 3];

export function evaluateGates(d: GateData): Gate[] {
  const best = bestBothClefs(d.tests);
  const level = maxSightLevel(d.sight);
  const testUnder = (limit: number): Criterion => ({
    label: `Teste das 20 notas (duas claves) em menos de ${limit} s`,
    met: best !== null && best < limit * 1000,
    current: best === null ? "nenhum teste ainda" : `melhor: ${seconds(best)}`,
  });
  const levelPassed = (n: number): Criterion => ({
    label: `Primeira vista: nível ${n} aprovado`,
    met: level >= n,
    current: level ? `maior aprovado: ${level}` : "nenhum aprovado ainda",
  });

  // Mês 6: Minueto em Sol, nota ≥ 90 a 100%, 3 vezes seguidas.
  const minuet = findSong(d.songs, ["bwv anh. 114", "minueto em sol maior"]);
  const minuetPlays = minuet ? plays(d.attempts, minuet.id) : [];
  const tempos = scaleTempos(d.attempts, d.songs);
  const fastest = Math.max(0, ...tempos.values());

  // Mês 9: peça escolhida, nota ≥ 90 com até 2 erros.
  const piece = d.songs.find((s) => s.id === d.gatePieceId) ?? null;
  const pieceBest = piece
    ? plays(d.attempts, piece.id).find((a) => a.score >= 90 && a.wrong + a.miss <= 2)
    : undefined;

  const ready = readyPieces(d.attempts, d.songs).length;
  const at80 = KEYS_UP_TO_3.filter((t) => (tempos.get(t) ?? 0) >= 80).length;

  const gates: Omit<Gate, "met">[] = [
    { month: 3, phase: 1, criteria: [testUnder(40), levelPassed(3)] },
    {
      month: 6,
      phase: 2,
      criteria: [
        {
          label: "Minueto em Sol: nota ≥ 90 em Tocar junto a 100%, 3 vezes seguidas",
          met: minuet !== null && isReady(d.attempts, minuet.id),
          current: !minuet
            ? "peça não encontrada na biblioteca"
            : minuetPlays.length
              ? `últimas notas: ${minuetPlays
                  .slice(0, 3)
                  .map((a) => `${a.score}${a.speed < 100 ? ` (${a.speed}%)` : ""}`)
                  .join(", ")}`
              : "ainda não tocada em Tocar junto",
        },
        levelPassed(5),
        {
          label: "Uma escala com andamento limpo de 60 bpm ou mais",
          met: fastest >= 60,
          current: fastest ? `melhor: ${fastest} bpm` : "nenhuma escala limpa ainda",
        },
      ],
    },
    {
      month: 9,
      phase: 3,
      criteria: [
        {
          label: "Peça do gate: nota ≥ 90 com até 2 erros",
          met: !!pieceBest,
          current: piece ? `peça: ${piece.title}` : "escolha a peça no painel do gate",
        },
        levelPassed(6),
        testUnder(20),
      ],
    },
    {
      month: 12,
      phase: 4,
      criteria: [
        levelPassed(7),
        { label: "8 peças prontas", met: ready >= 8, current: `${ready} de 8` },
        {
          label: "Escalas maiores até 3 acidentes a 80 bpm ou mais",
          met: at80 === KEYS_UP_TO_3.length,
          current: `${at80} de ${KEYS_UP_TO_3.length}`,
        },
        testUnder(15),
      ],
    },
  ];
  return gates.map((g) => ({ ...g, met: g.criteria.every((c) => c.met) }));
}

// ---------------------------------------------------------- métricas

export interface Metric {
  id: string;
  label: string;
  value: string;
  /** Pontos da tendência, do mais antigo ao mais novo. */
  series: number[];
  /** Na tendência, menor é melhor (tempo do teste). */
  lowerIsBetter?: boolean;
}

/** As cinco métricas do plano, com a tendência de cada uma. */
export function planMetrics(d: GateData, dailyMinutes: number[]): Metric[] {
  const both = d.tests.filter((t) => t.clefs === "both").sort((a, b) => a.takenAt - b.takenAt);
  const best = bestBothClefs(d.tests);

  const sight = [...d.sight].sort((a, b) => a.takenAt - b.takenAt);
  let maxSoFar = 0;
  const sightSeries = sight.map(
    (r) => (maxSoFar = r.passed ? Math.max(maxSoFar, r.level) : maxSoFar),
  );

  // Andamento limpo das escalas: o maior até cada execução limpa.
  const scaleSongs = new Map(
    d.songs
      .map((s) => [s.id, parsePrefs(s).exercise] as const)
      .filter(([, ex]) => ex?.kind === "scale"),
  );
  let top = 0;
  const tempoSeries = d.attempts
    .filter((a) => scaleSongs.has(a.songId) && isClean(a))
    .sort((a, b) => (a.playedAt ?? 0) - (b.playedAt ?? 0))
    .map((a) => (top = Math.max(top, Math.round((scaleSongs.get(a.songId)!.bpm * a.speed) / 100))));

  // Peças prontas: quando cada uma ficou pronta (3 execuções boas seguidas).
  const readyAt: number[] = [];
  for (const s of d.songs) {
    if (!inLibrary(s) || s.artist === TECHNIQUE_ARTIST) continue;
    const list = plays(d.attempts, s.id).reverse();
    for (let i = 2; i < list.length; i++) {
      if (good(list[i]) && good(list[i - 1]) && good(list[i - 2])) {
        readyAt.push(list[i].playedAt ?? 0);
        break;
      }
    }
  }
  readyAt.sort((a, b) => a - b);
  const ready = readyPieces(d.attempts, d.songs).length;

  const week = dailyMinutes.slice(-7);
  const avg = week.length ? Math.round(week.reduce((s, m) => s + m, 0) / week.length) : 0;

  return [
    {
      id: "test",
      label: "Teste das 20 notas",
      value: best === null ? "—" : seconds(best),
      series: both.map((t) => t.totalMs / 1000),
      lowerIsBetter: true,
    },
    {
      id: "sight",
      label: "Primeira vista",
      value: maxSoFar ? `nível ${maxSoFar}` : "—",
      series: sightSeries,
    },
    {
      id: "scales",
      label: "Andamento das escalas",
      value: top ? `${top} bpm` : "—",
      series: tempoSeries,
    },
    {
      id: "pieces",
      label: "Peças prontas",
      value: String(ready),
      series: readyAt.map((_, i) => i + 1),
    },
    {
      id: "minutes",
      label: "Minutos por dia (7 dias)",
      value: `${avg} min`,
      series: dailyMinutes,
    },
  ];
}
