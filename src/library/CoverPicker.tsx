import { useEffect, useState } from "react";
import { api, type CoverCandidate, type Song } from "../api";

interface Props {
  song: Song;
  onChosen: (song: Song) => void;
  onClose: () => void;
}

/** Busca capas no catálogo do iTunes e deixa escolher uma. */
export function CoverPicker({ song, onChosen, onClose }: Props) {
  const [query, setQuery] = useState(`${song.artist} ${song.title}`.trim());
  const [results, setResults] = useState<CoverCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const search = (text: string) => {
    setResults(null);
    setError(null);
    api.library
      .findCovers("", text)
      .then(setResults)
      .catch((e) => {
        setResults([]);
        setError(String(e));
      });
  };

  useEffect(() => {
    search(query);
    // Só a primeira busca é automática.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (c: CoverCandidate) => {
    setSaving(c.url);
    api.library
      .coverFromUrl(song.id, c.url)
      .then(onChosen)
      .catch((e) => setError(String(e)))
      .finally(() => setSaving(null));
  };

  return (
    <div className="cover-picker">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          search(query);
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Artista e música ou álbum"
          aria-label="Buscar capa"
        />
        <button type="submit">Buscar</button>
      </form>
      {error && <p className="warn small">{error}</p>}
      {results === null ? (
        <p className="muted small">Buscando capas…</p>
      ) : results.length === 0 ? (
        !error && <p className="muted small">Nenhuma capa encontrada. Tente outro termo.</p>
      ) : (
        <div className="cover-results">
          {results.map((c) => (
            <button
              key={c.url}
              className={saving === c.url ? "cover-option saving" : "cover-option"}
              onClick={() => choose(c)}
              disabled={saving !== null}
              title={`${c.album} — ${c.artist}`}
            >
              <img src={c.thumb} alt="" loading="lazy" />
              <span>{c.album}</span>
              <span className="muted">{c.artist}</span>
            </button>
          ))}
        </div>
      )}
      <p className="muted small">Capas do catálogo do iTunes.</p>
      <button className="link" onClick={onClose}>
        Fechar
      </button>
    </div>
  );
}
