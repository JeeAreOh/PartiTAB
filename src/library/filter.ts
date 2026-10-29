import type { Song } from "../api";

export type Status = "all" | "unplayed" | "played" | "favorites";

export type SortKey = "title" | "artist" | "added" | "played" | "best" | "difficulty";

export interface Filters {
  query: string;
  status: Status;
  /** null = qualquer; 0 = sem dificuldade definida. */
  difficulty: number | null;
  /** null = qualquer; "" = sem estilo / sem artista. */
  style: string | null;
  artist: string | null;
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = {
  query: "",
  status: "all",
  difficulty: null,
  style: null,
  artist: null,
  sort: "title",
};

/** Comparação sem acentos e sem caixa ("Canção" encontra "cancao"). */
export const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const matchesStatus = (s: Song, status: Status) =>
  status === "all" ||
  (status === "played" && s.plays > 0) ||
  (status === "unplayed" && s.plays === 0) ||
  (status === "favorites" && s.favorite);

/** Aplica tudo, menos o filtro `ignore` (para contar as opções desse filtro). */
function passes(s: Song, f: Filters, ignore?: keyof Filters) {
  const q = normalize(f.query);
  if (q && !normalize(`${s.title} ${s.artist} ${s.style}`).includes(q)) return false;
  if (ignore !== "status" && !matchesStatus(s, f.status)) return false;
  if (ignore !== "difficulty" && f.difficulty !== null && (s.difficulty ?? 0) !== f.difficulty)
    return false;
  if (ignore !== "style" && f.style !== null && s.style !== f.style) return false;
  if (ignore !== "artist" && f.artist !== null && s.artist !== f.artist) return false;
  return true;
}

const text = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
const desc = (a: number | null, b: number | null) => (b ?? -1) - (a ?? -1);

export function filterSongs(songs: Song[], f: Filters): Song[] {
  const list = songs.filter((s) => passes(s, f));
  const byTitle = (a: Song, b: Song) => text(a.title, b.title);
  const compare: Record<SortKey, (a: Song, b: Song) => number> = {
    title: byTitle,
    artist: (a, b) =>
      (a.artist && !b.artist ? -1 : !a.artist && b.artist ? 1 : text(a.artist, b.artist)) ||
      byTitle(a, b),
    added: (a, b) => b.addedAt - a.addedAt,
    played: (a, b) => desc(a.lastPlayedAt, b.lastPlayedAt) || byTitle(a, b),
    best: (a, b) => desc(a.bestScore, b.bestScore) || byTitle(a, b),
    difficulty: (a, b) => (a.difficulty ?? 9) - (b.difficulty ?? 9) || byTitle(a, b),
  };
  return list.sort(compare[f.sort]);
}

export interface Facet {
  value: string;
  count: number;
}

/** Valores de estilo ou artista com a contagem, respeitando os outros filtros. */
export function facet(songs: Song[], f: Filters, key: "style" | "artist"): Facet[] {
  const counts = new Map<string, number>();
  for (const s of songs) {
    if (!passes(s, f, key)) continue;
    counts.set(s[key], (counts.get(s[key]) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (a.value === "" ? 1 : b.value === "" ? -1 : text(a.value, b.value)));
}

export function statusCounts(songs: Song[], f: Filters): Record<Status, number> {
  const pool = songs.filter((s) => passes(s, f, "status"));
  return {
    all: pool.length,
    unplayed: pool.filter((s) => s.plays === 0).length,
    played: pool.filter((s) => s.plays > 0).length,
    favorites: pool.filter((s) => s.favorite).length,
  };
}

export function difficultyCounts(songs: Song[], f: Filters): number[] {
  const counts = Array(6).fill(0);
  for (const s of songs) if (passes(s, f, "difficulty")) counts[s.difficulty ?? 0]++;
  return counts;
}
