import { useEffect, useState } from "react";
import { getOctaveNaming, setOctaveNaming, type OctaveNaming } from "../octave";
import { Icon } from "./Icon";
import type { Fullscreen } from "./useFullscreen";
import { THEMES, type ThemeControl } from "./theme";

/** Seção "Tela" dos ajustes: tela cheia e em qual monitor. */
export function DisplaySection({
  screen,
  theme,
  onOctaveNaming,
}: {
  screen: Fullscreen;
  theme: ThemeControl;
  /** Avisa o app para redesenhar os nomes das notas. */
  onOctaveNaming?: (value: OctaveNaming) => void;
}) {
  const { monitors, selected, fullscreen, current, refresh } = screen;
  const [naming, setNaming] = useState(getOctaveNaming);
  const changeNaming = (value: OctaveNaming) => {
    setOctaveNaming(value);
    setNaming(value);
    onOctaveNaming?.(value);
  };

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
      <div className="field">
        <span className="muted small">Nome das oitavas</span>
        <div className="segmented" role="radiogroup" aria-label="Nome das oitavas">
          {(
            [
              ["yamaha", "Yamaha"],
              ["scientific", "Científica"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              role="radio"
              aria-checked={naming === v}
              className={naming === v ? "on" : ""}
              onClick={() => changeNaming(v)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="muted small">
          O dó central se chama{" "}
          {naming === "yamaha"
            ? "Dó3 (C3), como no painel da Yamaha"
            : "Dó4 (C4), como nos métodos Alfred e ABRSM"}
          .
        </span>
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
