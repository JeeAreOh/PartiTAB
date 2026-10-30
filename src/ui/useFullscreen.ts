import { useCallback, useEffect, useRef, useState } from "react";
import {
  PhysicalPosition,
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
  primaryMonitor,
} from "@tauri-apps/api/window";
import { describeMonitors, pickMonitor, type MonitorInfo } from "./monitors";

const MONITOR = "partitab.monitor";
const START_FULLSCREEN = "partitab.startFullscreen";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* só perde a preferência */
  }
};

/** Tela cheia (F11) no monitor escolhido, com a lista de monitores conectados. */
export function useFullscreen(onError: (message: string) => void) {
  const [fullscreen, setFullscreen] = useState(false);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [preferred, setPreferred] = useState<string | null>(() => read(MONITOR));
  const [startFullscreen, setStartFullscreen] = useState(() => read(START_FULLSCREEN) === "1");
  const errorRef = useRef(onError);
  errorRef.current = onError;

  const refresh = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      const [list, primary, here, isFull] = await Promise.all([
        availableMonitors(),
        primaryMonitor(),
        currentMonitor(),
        win.isFullscreen(),
      ]);
      const described = describeMonitors(list, primary);
      setMonitors(described);
      const hereId = here ? describeMonitors([here], null)[0].id : null;
      setCurrent(hereId);
      setFullscreen(isFull);
      return { described, hereId };
    } catch {
      return { described: [] as MonitorInfo[], hereId: null };
    }
  }, []);

  /** Entra em tela cheia no monitor escolhido (ou no `id` pedido). */
  const enter = useCallback(
    async (id?: string) => {
      try {
        const { described, hereId } = await refresh();
        const win = getCurrentWindow();
        const target = pickMonitor(described, id ?? read(MONITOR), hereId);
        // Trocar de monitor estando em tela cheia: sai e entra no outro.
        if (await win.isFullscreen()) await win.setFullscreen(false);
        if (target) {
          await win.setFullscreenOnMonitor(new PhysicalPosition(target.x + 1, target.y + 1));
        } else {
          await win.setFullscreen(true);
        }
        setFullscreen(true);
        window.setTimeout(refresh, 300);
      } catch (e) {
        errorRef.current(`Não foi possível entrar em tela cheia: ${e}`);
      }
    },
    [refresh],
  );

  const exit = useCallback(async () => {
    try {
      await getCurrentWindow().setFullscreen(false);
      setFullscreen(false);
    } catch (e) {
      errorRef.current(`Não foi possível sair da tela cheia: ${e}`);
    }
  }, []);

  const toggle = useCallback(() => (fullscreen ? exit() : enter()), [fullscreen, enter, exit]);

  /** Escolhe o monitor; em tela cheia, a janela já vai para ele. */
  const choose = useCallback(
    (id: string) => {
      setPreferred(id);
      write(MONITOR, id);
      if (fullscreen) enter(id);
    },
    [fullscreen, enter],
  );

  const changeStart = useCallback((on: boolean) => {
    setStartFullscreen(on);
    write(START_FULLSCREEN, on ? "1" : null);
  }, []);

  // Ao abrir: lista os monitores e, se pedido, já entra em tela cheia.
  useEffect(() => {
    refresh();
    if (read(START_FULLSCREEN) === "1") enter();
    // Só na abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A janela pode sair da tela cheia por fora (atalho do sistema, monitor
  // desconectado): acompanha pelo redimensionamento.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onResized(() => {
        refresh();
      })
      .then((f) => (unlisten = f))
      .catch(() => undefined);
    return () => unlisten?.();
  }, [refresh]);

  // F11 liga e desliga.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F11") return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const selected = pickMonitor(monitors, preferred, current);

  return {
    fullscreen,
    monitors,
    current,
    selected,
    startFullscreen,
    enter,
    exit,
    toggle,
    choose,
    changeStart,
    refresh,
  };
}

export type Fullscreen = ReturnType<typeof useFullscreen>;
