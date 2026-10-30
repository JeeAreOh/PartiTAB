import { useEffect } from "react";
import type { Status } from "./api";
import { Icon } from "./ui/Icon";
import { UpdatesSection } from "./updates/UpdatesSection";
import { SoundSection } from "./sound/SoundSection";
import { LatencySection } from "./practice/LatencySection";
import { BackupSection } from "./library/BackupSection";
import { DisplaySection } from "./ui/DisplaySection";
import type { Fullscreen } from "./ui/useFullscreen";
import type { Sound } from "./sound/useSound";
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
  onUseDefaultSoundfont: () => void;
  onUseSoundfont: (path: string) => void;
  onDownloadSoundfont: (id: string) => void;
  sound: Sound;
  latency: number;
  onLatency: (ms: number) => void;
  registerTap: (handler: ((key: number) => void) | null) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  screen: Fullscreen;
  onClose: () => void;
  updates: Updates;
}

/** Gaveta de ajustes: teclado MIDI e som. */
export function Settings(p: Props) {
  const { status, onClose } = p;
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

        <SoundSection
          status={status}
          sound={p.sound}
          busy={p.busy}
          onChooseFile={p.onChooseSoundfont}
          onUseDefault={p.onUseDefaultSoundfont}
          onUseFile={p.onUseSoundfont}
          onDownload={p.onDownloadSoundfont}
        />

        <DisplaySection screen={p.screen} />

        <LatencySection latency={p.latency} onChange={p.onLatency} registerTap={p.registerTap} />

        <BackupSection onError={p.onError} onNotice={p.onNotice} />

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
              <kbd>F11</kbd>
            </dt>
            <dd>Tela cheia</dd>
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
