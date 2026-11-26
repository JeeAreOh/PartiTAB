/**
 * Calendário do plano: em que mês o aluno está, a sessão do dia e o
 * deslocamento quando um mês é repetido. Fica em `partitab.plan` (entra no
 * backup com as outras preferências).
 */

import type { Month } from "./curriculum";

export interface PlanConfig {
  /** Início do plano (AAAA-MM-DD). */
  start: string;
  /** Meta de minutos por dia. */
  minutes: number;
  /** Meses de deslocamento (repetir um mês empurra o calendário +1; avançar, −1). */
  shift: number;
  /** Peça escolhida para o gate do mês 9. */
  gatePieceId?: number | null;
}

export const PLAN_KEY = "partitab.plan";
export const DEFAULT_PLAN: PlanConfig = { start: "2026-12-01", minutes: 40, shift: 0 };

export function loadPlan(): PlanConfig | null {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    return raw ? { ...DEFAULT_PLAN, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

export function savePlan(config: PlanConfig) {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(config));
  } catch {
    /* só perde a configuração */
  }
}

/** Data local a partir de "AAAA-MM-DD" (meia-noite). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Início efetivo do mês `index` (1–12), já com o deslocamento. */
export function monthStart(config: PlanConfig, index: number): Date {
  const d = parseDay(config.start);
  d.setMonth(d.getMonth() + config.shift + index - 1);
  return d;
}

/** Mês do plano em `now`: 0 antes de começar, 1–12, 13 depois do fim. */
export function monthIndex(config: PlanConfig, now: number): number {
  if (now < monthStart(config, 1).getTime()) return 0;
  for (let i = 1; i <= 12; i++) {
    if (now < monthStart(config, i + 1).getTime()) return i;
  }
  return 13;
}

/** Dias que faltam para acabar o mês atual do plano. */
export function daysLeftInMonth(config: PlanConfig, now: number): number {
  const i = monthIndex(config, now);
  if (i < 1 || i > 12) return 0;
  return Math.ceil((monthStart(config, i + 1).getTime() - now) / 86_400_000);
}

/** Repetir o mês atual: o calendário anda um mês para a frente. */
export const repeatMonth = (config: PlanConfig): PlanConfig => ({
  ...config,
  shift: config.shift + 1,
});

/**
 * Avançar de fase: o mês seguinte ao gate começa hoje (o calendário recua o
 * que faltava). Só recua; nunca empurra para depois.
 */
export function advanceTo(config: PlanConfig, month: number, now: number): PlanConfig {
  let next = config;
  while (monthIndex(next, now) < month && monthIndex(next, now) > 0) {
    next = { ...next, shift: next.shift - 1 };
  }
  return next;
}

export type BlockId = "technique" | "reading" | "repertoire" | "theory" | "free";

export interface Block {
  id: BlockId;
  label: string;
  minutes: number;
  detail: string;
}

export interface Session {
  kind: "normal" | "review" | "rest";
  title: string;
  blocks: Block[];
}

/** Proporções da sessão de 40 min: 5 + 10 + 15 + 5 + 5. */
const SHARES: [BlockId, number][] = [
  ["technique", 5],
  ["reading", 10],
  ["repertoire", 15],
  ["theory", 5],
  ["free", 5],
];

const scaled = (total: number, share: number) => Math.max(1, Math.round((total * share) / 40));

/** A sessão do dia: normal de segunda a sexta, revisão no sábado, descanso no domingo. */
export function sessionFor(config: PlanConfig, month: Month, now: number): Session {
  const day = new Date(now).getDay();
  const total = config.minutes;
  const reading = month.reading.patterns
    ? month.reading.patterns === "interval"
      ? "cartões de intervalos"
      : "cartões de tríades"
    : "cartões de notas";
  const details: Record<BlockId, string> = {
    technique: month.technique.length
      ? `${month.technique.length} exercício${month.technique.length > 1 ? "s" : ""} do mês`
      : "aquecimento livre",
    reading: `2 min de ${reading} e primeira vista no nível ${month.sightLevel}`,
    repertoire: month.repertoire.length ? month.repertoire[0].title : "a música em andamento",
    theory: `ritmo no nível ${month.rhythmLevel} e ${month.theory.length} tópico${month.theory.length > 1 ? "s" : ""} de teoria`,
    free: "suas favoritas, sem cobrança",
  };
  const labels: Record<BlockId, string> = {
    technique: "Técnica",
    reading: "Leitura",
    repertoire: "Repertório",
    theory: "Teoria e ritmo",
    free: "Livre",
  };
  if (day === 0) {
    return {
      kind: "rest",
      title: "Domingo: descanso",
      blocks: [
        { id: "reading", label: "Cartões (opcional)", minutes: scaled(total, 5), detail: reading },
      ],
    };
  }
  const blocks = SHARES.map(([id, share]) => ({
    id,
    label: labels[id],
    minutes: scaled(total, share),
    detail: details[id],
  }));
  if (day === 6) {
    const rep = blocks.find((b) => b.id === "repertoire")!;
    rep.label = "Revisão + gravação";
    rep.detail = "repertório do mês inteiro; grave uma execução e ouça";
    return { kind: "review", title: "Sábado: revisão e gravação", blocks };
  }
  return { kind: "normal", title: "Sessão de hoje", blocks };
}

/** O bloco conta como feito ao atingir 80% do tempo. */
export const BLOCK_DONE_SHARE = 0.8;
export const blockDone = (elapsedMs: number, minutes: number) =>
  elapsedMs >= minutes * 60_000 * BLOCK_DONE_SHARE;

const DAYS_KEY = "partitab.planDays";

/** Blocos feitos por dia (AAAA-MM-DD → ids). */
export function loadDoneBlocks(): Record<string, BlockId[]> {
  try {
    return JSON.parse(localStorage.getItem(DAYS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function markBlockDone(day: string, id: BlockId) {
  const all = loadDoneBlocks();
  const list = new Set(all[day] ?? []);
  list.add(id);
  all[day] = [...list];
  // Guarda só os últimos 400 dias.
  const keys = Object.keys(all).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete all[k];
  try {
    localStorage.setItem(DAYS_KEY, JSON.stringify(all));
  } catch {
    /* só perde a marca */
  }
}
