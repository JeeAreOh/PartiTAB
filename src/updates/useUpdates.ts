import { useCallback, useEffect, useState } from "react";
import { api, type UpdateInfo, type UpdateStatus } from "../api";

/** Verificador de versão: versão instalada, última publicada e atualização. */
export function useUpdates() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      setInfo(await api.updates.check());
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  }, []);

  // Ao abrir: lê a versão e já verifica.
  useEffect(() => {
    api.updates
      .status()
      .then((s) => {
        setStatus(s);
        check();
      })
      .catch(() => undefined);
  }, [check]);

  /** Baixa o instalador e abre; o app fecha sozinho em seguida. */
  const install = useCallback(async () => {
    if (!info?.installer) return;
    setInstalling(true);
    setError(null);
    try {
      await api.updates.install(info.installer);
    } catch (e) {
      setError(String(e));
      setInstalling(false);
    }
  }, [info]);

  return { status, info, error, checking, installing, check, install };
}

export type Updates = ReturnType<typeof useUpdates>;
