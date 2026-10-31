import { openUrl } from "@tauri-apps/plugin-opener";
import { Icon } from "../ui/Icon";
import type { Updates } from "./useUpdates";

/** Seção "Atualizações" dos ajustes: versão instalada, verificação e update. */
export function UpdatesSection({ updates }: { updates: Updates }) {
  const { status, info, error, checking, installing } = updates;
  const releases = status ? `https://github.com/${status.repo}/releases` : null;

  return (
    <section className="setting">
      <div className="setting-title">
        <Icon name="download" />
        <h3>Atualizações</h3>
        <span className={info && !info.available ? "dot ok" : "dot"} />
      </div>
      <dl className="facts">
        <dt>Versão instalada</dt>
        <dd>{status?.version ?? "—"}</dd>
        {info && (
          <>
            <dt>Última publicada</dt>
            <dd>{info.latest}</dd>
          </>
        )}
      </dl>

      {checking && <p className="muted">Verificando…</p>}
      {error && <p className="warn">{error}</p>}
      {info && !checking && info.available && (
        <div className="update-card">
          <b>{info.title} disponível</b>
          {info.notes && <p className="update-notes">{info.notes}</p>}
          {info.installer ? (
            <button className="primary" onClick={updates.install} disabled={installing}>
              {installing
                ? "Baixando… o app vai fechar e abrir o instalador"
                : "Atualizar agora"}
            </button>
          ) : (
            <p className="warn small">Essa versão não tem instalador para Windows.</p>
          )}
        </div>
      )}
      {info && !checking && !info.available && (
        <p className="ok">Você está na versão mais recente.</p>
      )}
      <div className="row wrap">
        <button onClick={updates.check} disabled={checking || installing}>
          Verificar agora
        </button>
      </div>

      {releases && (
        <button className="link align-start" onClick={() => openUrl(releases)}>
          Ver todas as versões no GitHub
        </button>
      )}
    </section>
  );
}
