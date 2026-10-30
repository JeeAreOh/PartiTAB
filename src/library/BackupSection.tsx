import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { Icon } from "../ui/Icon";

const PREFIX = "partitab.";

/** Preferências da interface (tudo que o app guarda no navegador). */
export function dumpSettings(): string {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) out[key] = localStorage.getItem(key) ?? "";
    }
  } catch {
    /* sem armazenamento: o backup vai sem preferências */
  }
  return JSON.stringify(out);
}

/** Troca as preferências pelas do backup. */
export function restoreSettings(json: string) {
  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object") data = parsed;
  } catch {
    return;
  }
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    }
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith(PREFIX) && typeof value === "string") localStorage.setItem(key, value);
    }
  } catch {
    /* sem armazenamento: só a biblioteca volta */
  }
}

const today = () => new Date().toISOString().slice(0, 10);
const mb = (bytes: number) => `${Math.max(0.1, bytes / 1024 / 1024).toFixed(1)} MB`;

interface Props {
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

/** Seção "Backup" dos ajustes: salvar e restaurar a biblioteca inteira. */
export function BackupSection({ onError, onNotice }: Props) {
  const [working, setWorking] = useState(false);
  const [restorePath, setRestorePath] = useState<string | null>(null);

  const doExport = async () => {
    const path = await save({
      title: "Salvar backup do PartiTAB",
      defaultPath: `PartiTAB-backup-${today()}.zip`,
      filters: [{ name: "Backup do PartiTAB", extensions: ["zip"] }],
    });
    if (!path) return;
    setWorking(true);
    try {
      const r = await api.backup.export(path, dumpSettings());
      onNotice(`Backup salvo: ${r.files} arquivos, ${mb(r.bytes)}`);
    } catch (e) {
      onError(String(e));
    } finally {
      setWorking(false);
    }
  };

  const chooseRestore = async () => {
    const path = await open({
      title: "Restaurar backup do PartiTAB",
      filters: [{ name: "Backup do PartiTAB", extensions: ["zip"] }],
    });
    if (typeof path === "string") setRestorePath(path);
  };

  const doRestore = async () => {
    if (!restorePath) return;
    setWorking(true);
    try {
      const settings = await api.backup.import(restorePath);
      restoreSettings(settings);
      // Recarrega para tudo (biblioteca, som, preferências) vir do backup.
      window.location.reload();
    } catch (e) {
      onError(String(e));
      setWorking(false);
      setRestorePath(null);
    }
  };

  return (
    <section className="setting">
      <div className="setting-title">
        <Icon name="library" />
        <h3>Backup</h3>
      </div>
      <p className="muted small">
        Um arquivo com a biblioteca inteira: partituras, capas, notas de cada prática, treino de
        leitura e preferências. Use para trocar de computador ou reinstalar sem perder nada.
        SoundFonts baixados ficam de fora (é só baixar de novo).
      </p>
      {restorePath ? (
        <div className="calibration">
          <p>
            Restaurar <b>{restorePath.split(/[\\/]/).pop()}</b>? A biblioteca atual será substituída
            (uma cópia dela fica guardada na pasta de dados do app).
          </p>
          <div className="row">
            <button className="primary" onClick={doRestore} disabled={working}>
              {working ? "Restaurando…" : "Restaurar"}
            </button>
            <button className="link" onClick={() => setRestorePath(null)} disabled={working}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="row wrap">
          <button onClick={doExport} disabled={working}>
            {working ? "Salvando…" : "Fazer backup…"}
          </button>
          <button onClick={chooseRestore} disabled={working}>
            Restaurar backup…
          </button>
        </div>
      )}
    </section>
  );
}
