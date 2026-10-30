import { useEffect } from "react";
import { Icon } from "./Icon";
import type { Fullscreen } from "./useFullscreen";
import { THEMES, type ThemeControl } from "./theme";

/** Seção "Tela" dos ajustes: tela cheia e em qual monitor. */
export function DisplaySection({ screen, theme }: { screen: Fullscreen; theme: ThemeControl }) {
  const { monitors, selected, fullscreen, current, refresh } = screen;

  // Monitores podem ter sido ligados ou desligados desde a abertura.
  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <section className="setting">
      <div className="setting-title">
        <Icon name="fullscreen" />
        <h3>Tela</h3>
      </div>
      <div className="field">
        <span className="muted small">Tema</span>
        <div className="segmented" role="radiogroup" aria-label="Tema">
          {THEMES.map(([t, label]) => (
            <button
              key={t}
              role="radio"
              aria-checked={theme.theme === t}
              className={theme.theme === t ? "on" : ""}
              onClick={() => theme.setTheme(t)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {monitors.length > 1 ? (
        <label className="field">
          <span className="muted small">Monitor da tela cheia</span>
          <select value={selected?.id ?? ""} onChange={(e) => screen.choose(e.target.value)}>
            {monitors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.id === current ? " · o app está aqui" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="muted small">
          {monitors.length === 1
            ? `Um monitor conectado (${monitors[0].width}×${monitors[0].height}). Com mais de um, dá para escolher em qual a tela cheia abre.`
            : "Não consegui listar os monitores; a tela cheia usa o monitor onde o app está."}
        </p>
      )}
      <div className="row wrap">
        <button className={fullscreen ? "" : "primary"} onClick={screen.toggle}>
          {fullscreen ? "Sair da tela cheia" : "Entrar em tela cheia"}
        </button>
        <span className="muted small">
          ou <kbd>F11</kbd>
        </span>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={screen.startFullscreen}
          onChange={(e) => screen.changeStart(e.target.checked)}
        />
        Abrir o app já em tela cheia
      </label>
    </section>
  );
}
