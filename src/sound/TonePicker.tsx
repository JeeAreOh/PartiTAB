import { useState } from "react";
import type { PresetInfo } from "../api";
import { Icon } from "../ui/Icon";
import { Popover } from "../ui/Popover";
import { groupPresets } from "./tones";
import type { Sound } from "./useSound";

interface Props {
  sound: Sound;
  presets: PresetInfo[];
  /** Abre os ajustes de som (SoundFonts, reverb, toque). */
  onOpenSettings: () => void;
}

/** Botão da barra superior para trocar o timbre do piano. */
export function TonePicker({ sound, presets, onOpenSettings }: Props) {
  const [query, setQuery] = useState("");
  const { current } = sound;
  const groups = groupPresets(presets, query);
  const favorites = presets.filter(sound.isFavorite);

  const row = (p: PresetInfo, close: () => void) => {
    const on = current?.bank === p.bank && current?.patch === p.patch;
    const fav = sound.isFavorite(p);
    return (
      <li key={`${p.bank}:${p.patch}`} className={on ? "tone on" : "tone"}>
        <button
          className="tone-name"
          aria-pressed={on}
          onClick={() => {
            sound.choose(p);
            close();
          }}
        >
          {p.name}
        </button>
        <button
          className={fav ? "tone-star on" : "tone-star"}
          aria-label={fav ? `Tirar ${p.name} dos favoritos` : `Favoritar ${p.name}`}
          title={fav ? "Tirar dos favoritos" : "Favoritar"}
          onClick={() => sound.toggleFavorite(p)}
        >
          {fav ? "★" : "☆"}
        </button>
      </li>
    );
  };

  return (
    <Popover
      align="right"
      title="Timbre do piano"
      label={
        <>
          <Icon name="speaker" size={15} />
          <span className="tone-label">{current?.name ?? "Timbre"}</span>
        </>
      }
    >
      {(close) => (
        <div className="tone-picker">
          <label className="tone-volume">
            <span>Volume</span>
            <input
              type="range"
              min={0}
              max={100}
              value={sound.sound.volume}
              onChange={(e) => sound.apply({ volume: Number(e.target.value) })}
              aria-label="Volume do piano"
            />
            <span className="muted small">{sound.sound.volume}</span>
          </label>
          <input
            type="search"
            placeholder="Buscar timbre…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar timbre"
            autoFocus
          />
          <div className="tone-list">
            {!query && favorites.length > 0 && (
              <section>
                <h4>Favoritos</h4>
                <ul>{favorites.map((p) => row(p, close))}</ul>
              </section>
            )}
            {groups.map((g) => (
              <section key={g.name}>
                <h4>{g.name}</h4>
                <ul>{g.items.map((p) => row(p, close))}</ul>
              </section>
            ))}
            {groups.length === 0 && <p className="muted small">Nenhum timbre encontrado.</p>}
          </div>
          <button
            className="link align-start"
            onClick={() => {
              close();
              onOpenSettings();
            }}
          >
            Mais sons e ajustes…
          </button>
        </div>
      )}
    </Popover>
  );
}
