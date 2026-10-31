import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Icon } from "../ui/Icon";
import type { Updates } from "./useUpdates";

const TOKEN_HELP = "https://github.com/settings/personal-access-tokens/new";

/** Seção "Atualizações" dos ajustes: versão instalada, verificação e update. */
export function UpdatesSection({ updates }: { updates: Updates }) {
  const { status, info, error, checking, installing } = updates;
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState("");
  const releases = status ? `https://github.com/${status.repo}/releases` : null;
  const showTokenForm = status !== null && editing;

  const save = async () => {
    await updates.saveToken(token);
    setToken("");
    setEditing(false);
  };

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

      {!editing && (
        <>
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
            <button className="link" onClick={() => setEditing(true)}>
              {status?.configured ? "Trocar token" : "Usar token (repositório privado)"}
            </button>
            {status?.configured && (
              <button className="link" onClick={() => updates.saveToken("")}>
                Remover token
              </button>
            )}
          </div>
        </>
      )}

      {showTokenForm && (
        <form
          className="token-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <p className="muted small">
            Só é preciso se o repositório <b>{status?.repo}</b> no GitHub for privado. Cole um token
            de acesso pessoal (fine-grained) com acesso só a esse repositório e permissão{" "}
            <b>Contents: Read-only</b>. Ele fica salvo só neste computador.
          </p>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_…"
            aria-label="Token do GitHub"
            autoComplete="off"
          />
          <div className="row wrap">
            <button className="primary" type="submit" disabled={!token.trim()}>
              Salvar e verificar
            </button>
            <button type="button" className="link" onClick={() => openUrl(TOKEN_HELP)}>
              Criar token no GitHub
            </button>
            <button type="button" className="link" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {releases && (
        <button className="link align-start" onClick={() => openUrl(releases)}>
          Ver todas as versões no GitHub
        </button>
      )}
    </section>
  );
}
