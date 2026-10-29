import { useEffect, useMemo, useState } from "react";
import { api, type Attempt, type Song, type SongPatch } from "../api";
import {
  DEFAULT_FILTERS,
  difficultyCounts,
  facet,
  filterSongs,
  statusCounts,
  type Filters,
  type SortKey,
  type Status,
} from "./filter";

interface Props {
  songs: Song[];
  currentId: number | null;
  busy: boolean;
  onOpen: (song: Song) => void;
  onImport: () => void;
  onUpdate: (id: number, patch: SongPatch) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}

const STATUS: [Status, string][] = [
  ["all", "Todas"],
  ["unplayed", "Não tocadas"],
  ["played", "Já tocadas"],
  ["favorites", "Favoritas"],
];

const SORTS: [SortKey, string][] = [
  ["title", "Título"],
  ["artist", "Artista"],
  ["added", "Adicionadas recentemente"],
  ["played", "Tocadas recentemente"],
  ["best", "Melhor nota"],
  ["difficulty", "Dificuldade"],
];

export const DIFFICULTY_NAMES = ["", "Muito fácil", "Fácil", "Média", "Difícil", "Muito difícil"];

const MODE_NAMES: Record<string, string> = {
  wait: "Esperar",
  play: "Tocar junto",
  listen: "Ouvir",
};
const HAND_NAMES: Record<string, string> = { right: "Direita", left: "Esquerda", both: "Ambas" };

const FILTERS_KEY = "partitab.libraryFilters";

export function Stars({ value }: { value: number | null }) {
  if (!value) return <span className="muted">—</span>;
  return (
    <span
      className="stars"
      title={DIFFICULTY_NAMES[value]}
      aria-label={`Dificuldade ${value} de 5`}
    >
      {"★".repeat(value)}
      <span className="off">{"★".repeat(5 - value)}</span>
    </span>
  );
}

const date = (ms: number | null | undefined) =>
  ms
    ? new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

const dateTime = (ms: number | null | undefined) =>
  ms
    ? new Date(ms).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const levelName = (level: string) => (level === "original" ? "Original" : `Nível ${level}`);

function loadFilters(): Filters {
  try {
    return {
      ...DEFAULT_FILTERS,
      ...JSON.parse(localStorage.getItem(FILTERS_KEY) ?? "{}"),
      query: "",
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function Library({ songs, currentId, busy, onOpen, onImport, onUpdate, onRemove }: Props) {
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [selectedId, setSelectedId] = useState<number | null>(currentId);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
    } catch {
      /* só perde a preferência */
    }
  }, [filters]);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const toggle = <K extends "style" | "artist" | "difficulty">(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: f[key] === value ? null : value }));

  const list = useMemo(() => filterSongs(songs, filters), [songs, filters]);
  const styles = useMemo(() => facet(songs, filters, "style"), [songs, filters]);
  const artists = useMemo(() => facet(songs, filters, "artist"), [songs, filters]);
  const statuses = useMemo(() => statusCounts(songs, filters), [songs, filters]);
  const difficulties = useMemo(() => difficultyCounts(songs, filters), [songs, filters]);
  const allStyles = useMemo(
    () => [...new Set(songs.map((s) => s.style).filter(Boolean))].sort(),
    [songs],
  );
  const selected = songs.find((s) => s.id === selectedId) ?? null;
  const filtered =
    filters.query !== "" ||
    filters.status !== "all" ||
    filters.difficulty !== null ||
    filters.style !== null ||
    filters.artist !== null;

  return (
    <section className={songs.length > 0 ? "library with-details" : "library"}>
      <aside className="lib-filters">
        <input
          type="search"
          placeholder="Buscar título, artista, estilo…"
          value={filters.query}
          onChange={(e) => set("query", e.target.value)}
        />

        <h3>Situação</h3>
        {STATUS.map(([s, label]) => (
          <button
            key={s}
            className={filters.status === s ? "facet on" : "facet"}
            onClick={() => set("status", s)}
          >
            {label} <span>{statuses[s]}</span>
          </button>
        ))}

        <h3>Dificuldade</h3>
        {[1, 2, 3, 4, 5, 0].map((d) =>
          difficulties[d] > 0 || filters.difficulty === d ? (
            <button
              key={d}
              className={filters.difficulty === d ? "facet on" : "facet"}
              onClick={() => toggle("difficulty", d)}
            >
              {d === 0 ? "Sem avaliação" : <Stars value={d} />} <span>{difficulties[d]}</span>
            </button>
          ) : null,
        )}

        <h3>Estilos</h3>
        {styles.length === 0 && <p className="muted small">Nenhum estilo ainda.</p>}
        {styles.map((f) => (
          <button
            key={f.value}
            className={filters.style === f.value ? "facet on" : "facet"}
            onClick={() => toggle("style", f.value)}
          >
            {f.value || <i>Sem estilo</i>} <span>{f.count}</span>
          </button>
        ))}

        <h3>Artistas</h3>
        {artists.map((f) => (
          <button
            key={f.value}
            className={filters.artist === f.value ? "facet on" : "facet"}
            onClick={() => toggle("artist", f.value)}
          >
            {f.value || <i>Sem artista</i>} <span>{f.count}</span>
          </button>
        ))}

        {filtered && (
          <button
            className="link"
            onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}
          >
            Limpar filtros
          </button>
        )}
      </aside>

      <div className="lib-main">
        <div className="lib-toolbar">
          <button className="primary" onClick={onImport} disabled={busy}>
            Adicionar partituras…
          </button>
          <span className="muted">
            {list.length} de {songs.length} partitura{songs.length === 1 ? "" : "s"}
          </span>
          <label className="sort">
            Ordenar por
            <select value={filters.sort} onChange={(e) => set("sort", e.target.value as SortKey)}>
              {SORTS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {songs.length === 0 ? (
          <div className="lib-empty">
            <p>A biblioteca está vazia.</p>
            <p className="muted">
              Toda partitura aberta entra aqui automaticamente. Você também pode adicionar várias de
              uma vez.
            </p>
          </div>
        ) : list.length === 0 ? (
          <div className="lib-empty">
            <p className="muted">Nenhuma partitura com esses filtros.</p>
          </div>
        ) : (
          <table className="songs">
            <thead>
              <tr>
                <th aria-label="Favorita" />
                <th aria-label="Abrir" />
                <th>Título</th>
                <th>Artista</th>
                <th>Estilo</th>
                <th>Dificuldade</th>
                <th className="num">Melhor nota</th>
                <th className="num">Última</th>
                <th className="num">Vezes</th>
                <th>Última vez</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr
                  key={s.id}
                  className={[
                    s.id === selectedId ? "selected" : "",
                    s.id === currentId ? "current" : "",
                  ].join(" ")}
                  onClick={() => setSelectedId(s.id)}
                  onDoubleClick={() => onOpen(s)}
                >
                  <td>
                    <button
                      className={s.favorite ? "fav on" : "fav"}
                      title={s.favorite ? "Tirar dos favoritos" : "Favoritar"}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdate(s.id, { favorite: !s.favorite });
                      }}
                    >
                      {s.favorite ? "♥" : "♡"}
                    </button>
                  </td>
                  <td>
                    <button
                      className="play"
                      title="Abrir e praticar"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(s);
                      }}
                    >
                      ▶
                    </button>
                  </td>
                  <td className="title">
                    {s.title}
                    {s.id === currentId && <span className="badge">aberta</span>}
                  </td>
                  <td>{s.artist || <span className="muted">—</span>}</td>
                  <td>{s.style || <span className="muted">—</span>}</td>
                  <td>
                    <Stars value={s.difficulty} />
                  </td>
                  <td className="num">{s.bestScore ?? <span className="muted">—</span>}</td>
                  <td className="num">{s.lastScore ?? <span className="muted">—</span>}</td>
                  <td className="num">{s.plays || <span className="muted">—</span>}</td>
                  <td>{date(s.lastPlayedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected ? (
        <Details
          key={selected.id}
          song={selected}
          styles={allStyles}
          busy={busy}
          onOpen={() => onOpen(selected)}
          onClose={() => setSelectedId(null)}
          onUpdate={(patch) => onUpdate(selected.id, patch)}
          onRemove={async () => {
            if (
              !window.confirm(
                `Remover "${selected.title}" da biblioteca? O histórico de execuções também será apagado.`,
              )
            )
              return;
            await onRemove(selected.id);
            setSelectedId(null);
          }}
        />
      ) : (
        songs.length > 0 && (
          <aside className="lib-details placeholder">
            <p className="muted">
              Selecione uma partitura para ver os detalhes, editar estilo e dificuldade e ver o
              histórico.
            </p>
          </aside>
        )
      )}
    </section>
  );
}

interface DetailsProps {
  song: Song;
  styles: string[];
  busy: boolean;
  onOpen: () => void;
  onClose: () => void;
  onUpdate: (patch: SongPatch) => Promise<void>;
  onRemove: () => void;
}

function Details({ song, styles, busy, onOpen, onClose, onUpdate, onRemove }: DetailsProps) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [style, setStyle] = useState(song.style);
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);

  useEffect(() => {
    let alive = true;
    api.library
      .attempts(song.id)
      .then((a) => alive && setAttempts(a))
      .catch(() => alive && setAttempts([]));
    return () => {
      alive = false;
    };
  }, [song.id, song.plays]);

  const commit = (field: "title" | "artist" | "style", value: string) => {
    if (value.trim() === song[field]) return;
    if (field === "title" && !value.trim()) return setTitle(song.title);
    onUpdate({ [field]: value });
  };

  return (
    <aside className="lib-details">
      <div className="details-head">
        <h2>{song.title}</h2>
        <button className="link" onClick={onClose} aria-label="Fechar detalhes">
          ✕
        </button>
      </div>
      <button className="primary" onClick={onOpen} disabled={busy}>
        Abrir e praticar
      </button>

      <label>
        Título
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => commit("title", title)}
        />
      </label>
      <label>
        Artista
        <input
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          onBlur={() => commit("artist", artist)}
        />
      </label>
      <label>
        Estilo
        <input
          value={style}
          list="lib-styles"
          placeholder="Rock, MPB, Clássico…"
          onChange={(e) => setStyle(e.target.value)}
          onBlur={() => commit("style", style)}
        />
        <datalist id="lib-styles">
          {styles.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <label>
        Dificuldade
        <select
          value={song.difficultyManual ? String(song.difficulty) : "auto"}
          onChange={(e) =>
            onUpdate({ difficulty: e.target.value === "auto" ? null : Number(e.target.value) })
          }
        >
          <option value="auto">
            Automática
            {!song.difficultyManual && song.difficulty
              ? ` (${DIFFICULTY_NAMES[song.difficulty]})`
              : ""}
          </option>
          {[1, 2, 3, 4, 5].map((d) => (
            <option key={d} value={d}>
              {"★".repeat(d)} {DIFFICULTY_NAMES[d]}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={song.favorite}
          onChange={(e) => onUpdate({ favorite: e.target.checked })}
        />
        Favorita
      </label>

      <dl className="facts">
        <dt>Arquivo</dt>
        <dd title={song.path}>{song.fileName}</dd>
        <dt>Adicionada</dt>
        <dd>{date(song.addedAt)}</dd>
        <dt>Melhor nota</dt>
        <dd>{song.bestScore ?? "—"}</dd>
      </dl>

      <h3>Execuções</h3>
      {attempts === null ? (
        <p className="muted small">Carregando…</p>
      ) : attempts.length === 0 ? (
        <p className="muted small">
          Ainda não tocada. As execuções nos modos Esperar e Tocar junto aparecem aqui.
        </p>
      ) : (
        <table className="attempts">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Como</th>
              <th className="num">Nota</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((a) => (
              <tr
                key={a.id}
                title={`${a.hit} certas · ${a.early} adiantadas · ${a.late} atrasadas · ${a.wrong} erradas · ${a.miss} perdidas · precisão ${a.accuracy}%`}
              >
                <td>{dateTime(a.playedAt)}</td>
                <td>
                  {MODE_NAMES[a.mode] ?? a.mode} · {HAND_NAMES[a.hands] ?? a.hands} ·{" "}
                  {levelName(a.level)} · {a.speed}%{a.completed ? "" : " · incompleta"}
                </td>
                <td className="num">
                  <b>{a.score}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button className="danger" onClick={onRemove} disabled={busy}>
        Remover da biblioteca
      </button>
    </aside>
  );
}
