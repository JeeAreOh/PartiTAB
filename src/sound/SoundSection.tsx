import { useEffect } from "react";
import type { Status } from "../api";
import { Icon } from "../ui/Icon";
import { CURVES, formatSize } from "./tones";
import type { Sound } from "./useSound";

interface Props {
  status: Status | null;
  sound: Sound;
  busy: boolean;
  onChooseFile: () => void;
  onUseDefault: () => void;
  /** Carrega um SoundFont já baixado do catálogo. */
  onUseFile: (path: string) => void;
  /** Baixa um item do catálogo e já passa a usá-lo. */
  onDownload: (id: string) => void;
}

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;
const samePath = (a: string | null | undefined, b: string | null) =>
  !!a && !!b && a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();

/** Seção "Som" dos ajustes: saída, SoundFont, catálogo e ajustes do toque. */
export function SoundSection({ status, sound, busy, ...p }: Props) {
  const audio = status?.audio;
  const latencyMs =
    audio?.bufferFrames != null
      ? ((audio.bufferFrames / audio.sampleRate) * 1000).toFixed(1)
      : null;
  const { refreshCatalog } = sound;

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  return (
    <section className="setting">
      <div className="setting-title">
        <Icon name="speaker" />
        <h3>Som</h3>
        <span className={audio && status?.soundfont ? "dot ok" : "dot"} />
      </div>
      {status?.audioError ? (
        <p className="warn">Sem saída de áudio: {status.audioError}</p>
      ) : audio ? (
        <dl className="facts">
          <dt>Saída</dt>
          <dd>{audio.device}</dd>
          <dt>Qualidade</dt>
          <dd>{audio.sampleRate} Hz</dd>
          <dt>Atraso</dt>
          <dd>{latencyMs ? `${latencyMs} ms (buffer ${audio.bufferFrames})` : "automático"}</dd>
          <dt>SoundFont</dt>
          <dd title={status?.soundfont ?? undefined}>
            {status?.soundfont
              ? status.soundfontBuiltin
                ? "Padrão do app (Sonivox)"
                : fileName(status.soundfont)
              : "—"}
          </dd>
          <dt>Timbre</dt>
          <dd>{sound.current?.name ?? "—"}</dd>
        </dl>
      ) : null}

      <div className="sound-controls">
        <label>
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={sound.sound.volume}
            onChange={(e) => sound.apply({ volume: Number(e.target.value) })}
            disabled={!audio}
          />
          <span className="muted small">{sound.sound.volume}</span>
        </label>
        <label>
          <span>Reverb</span>
          <input
            type="range"
            min={0}
            max={127}
            value={sound.sound.reverb}
            onChange={(e) => sound.apply({ reverb: Number(e.target.value) })}
            disabled={!audio}
          />
          <span className="muted small">{Math.round((sound.sound.reverb / 127) * 100)}%</span>
        </label>
      </div>
      <div className="sound-curve">
        <span>Sensibilidade ao toque</span>
        <div className="segmented" role="radiogroup" aria-label="Sensibilidade ao toque">
          {CURVES.map(([curve, label, hint]) => (
            <button
              key={curve}
              role="radio"
              aria-checked={sound.sound.curve === curve}
              className={sound.sound.curve === curve ? "on" : ""}
              title={hint}
              onClick={() => sound.apply({ curve })}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="muted small">{CURVES.find(([c]) => c === sound.sound.curve)?.[2]}</p>
      </div>

      <h4 className="sound-subtitle">SoundFonts gratuitos</h4>
      <ul className="sound-catalog">
        {sound.catalog.map((item) => {
          const done = sound.downloads[item.id];
          const downloading = done !== undefined;
          const inUse = samePath(status?.soundfont, item.path);
          return (
            <li key={item.id} className={inUse ? "on" : ""}>
              <div className="sound-item-text">
                <b>{item.name}</b>
                <span className="muted small">
                  {formatSize(item.size)} · {item.license}
                </span>
                <p className="muted small">{item.description}</p>
                {downloading && (
                  <progress max={item.size} value={done} aria-label={`Baixando ${item.name}`} />
                )}
              </div>
              <div className="sound-item-actions">
                {inUse ? (
                  <span className="ok small">Em uso</span>
                ) : item.path ? (
                  <button onClick={() => p.onUseFile(item.path!)} disabled={busy || !audio}>
                    Usar
                  </button>
                ) : (
                  <button
                    className="primary"
                    onClick={() => p.onDownload(item.id)}
                    disabled={downloading || !audio}
                  >
                    {downloading ? `${Math.round((done / item.size) * 100)}%` : "Baixar"}
                  </button>
                )}
                {item.path && !inUse && (
                  <button
                    className="link small"
                    onClick={() => sound.remove(item.id)}
                    title="Apagar o arquivo baixado"
                  >
                    Apagar
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="row wrap">
        <button onClick={p.onChooseFile} disabled={busy || !audio}>
          Usar arquivo .sf2…
        </button>
        {!status?.soundfontBuiltin && (
          <button className="link" onClick={p.onUseDefault} disabled={busy || !audio}>
            Voltar ao som padrão
          </button>
        )}
      </div>
      <p className="muted small">
        O SoundFont define os timbres do piano e da reprodução da partitura. Os arquivos baixados
        ficam só neste computador.
      </p>
    </section>
  );
}
