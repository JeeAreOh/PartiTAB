import { useEffect } from "react";
import type { Status } from "./api";
import { Icon } from "./ui/Icon";
import { UpdatesSection } from "./updates/UpdatesSection";
import type { Updates } from "./updates/useUpdates";

interface Props {
  status: Status | null;
  ports: string[];
  selected: string;
  busy: boolean;
  onSelect: (port: string) => void;
  onRefresh: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onChooseSoundfont: () => void;
  onClose: () => void;
  updates: Updates;
}

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** Gaveta de ajustes: teclado MIDI e som. */
export function Settings(p: Props) {
  const { status, onClose } = p;
  const audio = status?.audio;
  const latencyMs =
    audio?.bufferFrames != null
      ? ((audio.bufferFrames / audio.sampleRate) * 1000).toFixed(1)
      : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="drawer-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside className="drawer" role="dialog" aria-label="Ajustes">
        <div className="drawer-head">
          <h2>Ajustes</h2>
          <button className="icon-button" onClick={onClose} aria-label="Fechar ajustes">
            <Icon name="close" />
          </button>
        </div>

        <section className="setting">
          <div className="setting-title">
            <Icon name="keyboard" />
            <h3>Teclado</h3>
            <span className={status?.midiPort ? "dot ok" : "dot"} />
          </div>
          {status?.midiPort ? (
            <>
              <p>
                Conectado a <b>{status.midiPort}</b>
              </p>
              {status.localControlOff ? (
                <p className="muted">
                  O som interno do teclado foi desligado; o piano toca pelo PC.
                </p>
              ) : (
                <p className="warn">
                  Não consegui desligar o som interno. No PSR-E463, ajuste a função 050 (Local) para
                  OFF.
                </p>
              )}
              <button onClick={p.onDisconnect} disabled={p.busy}>
                Desconectar
              </button>
            </>
          ) : (
            <>
              <p className="muted">Ligue o teclado pela porta USB TO HOST e escolha a porta.</p>
              <div className="row">
                <select
                  value={p.selected}
                  onChange={(e) => p.onSelect(e.target.value)}
                  disabled={p.ports.length === 0}
                >
                  {p.ports.length === 0 && <option value="">Nenhuma porta MIDI encontrada</option>}
                  {p.ports.map((port) => (
                    <option key={port}>{port}</option>
                  ))}
                </select>
                <button onClick={p.onRefresh} disabled={p.busy}>
                  Atualizar
                </button>
              </div>
              <button className="primary" onClick={p.onConnect} disabled={p.busy || !p.selected}>
                Conectar
              </button>
            </>
          )}
        </section>

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
            </dl>
          ) : null}
          <p className="muted">
            O SoundFont define o timbre do piano e da reprodução. Para ouvir a banda, use um General
            MIDI completo (ex.: FluidR3_GM).
          </p>
          {status?.soundfont && (
            <p title={status.soundfont}>
              <b>{fileName(status.soundfont)}</b>
            </p>
          )}
          <button
            className={status?.soundfont ? "" : "primary"}
            onClick={p.onChooseSoundfont}
            disabled={p.busy || !audio}
          >
            {status?.soundfont ? "Trocar SoundFont…" : "Escolher SoundFont…"}
          </button>
        </section>

        <UpdatesSection updates={p.updates} />

        <section className="setting">
          <div className="setting-title">
            <h3>Atalhos</h3>
          </div>
          <dl className="facts shortcuts">
            <dt>
              <kbd>Espaço</kbd>
            </dt>
            <dd>Tocar / pausar</dd>
            <dt>
              <kbd>M</kbd>
            </dt>
            <dd>Marcar compasso no vídeo</dd>
            <dt>
              <kbd>Esc</kbd>
            </dt>
            <dd>Fechar painéis</dd>
          </dl>
        </section>
      </aside>
    </div>
  );
}
