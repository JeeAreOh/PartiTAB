import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, type Status } from "./api";
import { Keyboard } from "./Keyboard";
import "./App.css";

const LAST_PORT = "partitab.midiPort";
const LAST_SOUNDFONT = "partitab.soundfont";
const MOUSE_VELOCITY = 90;

const storage = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* armazenamento indisponível: só perde a preferência */
    }
  },
};

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [ports, setPorts] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [pressed, setPressed] = useState(() => new Map<number, number>());
  const [sustain, setSustain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<Status | void>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) setStatus(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshPorts = useCallback(async () => {
    const list = await api.listMidiInputs();
    setPorts(list);
    setSelected((cur) => (list.includes(cur) ? cur : (list[0] ?? "")));
    return list;
  }, []);

  const setKey = (key: number, velocity: number | null) =>
    setPressed((prev) => {
      const next = new Map(prev);
      if (velocity === null) next.delete(key);
      else next.set(key, velocity);
      return next;
    });

  // Inicialização: estado, portas e as últimas escolhas do usuário.
  useEffect(() => {
    run(async () => {
      let current = await api.getStatus();
      const list = await refreshPorts();
      const soundfont = storage.get(LAST_SOUNDFONT);
      if (soundfont && current.audio && !current.soundfont) {
        current = await api.loadSoundfont(soundfont).catch(() => {
          storage.set(LAST_SOUNDFONT, null);
          return current;
        });
      }
      const port = storage.get(LAST_PORT);
      if (port && list.includes(port) && !current.midiPort) {
        setSelected(port);
        current = await api.connectMidi(port).catch(() => current);
      }
      return current;
    });
  }, [run, refreshPorts]);

  useEffect(() => {
    const unlisten = api.onKey((e) => {
      if (e.type === "noteOn") setKey(e.key, e.velocity);
      else if (e.type === "noteOff") setKey(e.key, null);
      else setSustain(e.down);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const connect = () =>
    run(async () => {
      const next = await api.connectMidi(selected);
      storage.set(LAST_PORT, selected);
      return next;
    });

  const disconnect = () =>
    run(async () => {
      storage.set(LAST_PORT, null);
      setPressed(new Map());
      setSustain(false);
      return api.disconnectMidi();
    });

  const chooseSoundfont = () =>
    run(async () => {
      const path = await open({
        title: "Escolher SoundFont de piano",
        filters: [{ name: "SoundFont", extensions: ["sf2"] }],
      });
      if (typeof path !== "string") return;
      const next = await api.loadSoundfont(path);
      storage.set(LAST_SOUNDFONT, path);
      return next;
    });

  const audio = status?.audio;
  const latencyMs =
    audio?.bufferFrames != null
      ? ((audio.bufferFrames / audio.sampleRate) * 1000).toFixed(1)
      : null;

  return (
    <main>
      <header>
        <h1>PartiTAB</h1>
        <p>Piano virtual · fase 1</p>
      </header>

      <section className="panels">
        <div className="panel">
          <h2>Teclado MIDI</h2>
          {status?.midiPort ? (
            <>
              <p className="ok">Conectado a {status.midiPort}</p>
              {status.localControlOff ? (
                <p className="muted">Som interno do teclado desligado (Local Off).</p>
              ) : (
                <p className="warn">
                  Não consegui desligar o som interno. No PSR-E463, ajuste a função 050
                  (Local) para OFF.
                </p>
              )}
              <button onClick={disconnect} disabled={busy}>
                Desconectar
              </button>
            </>
          ) : (
            <>
              <div className="row">
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  disabled={ports.length === 0}
                >
                  {ports.length === 0 && <option value="">Nenhuma porta MIDI</option>}
                  {ports.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <button onClick={() => run(async () => void (await refreshPorts()))} disabled={busy}>
                  Atualizar
                </button>
              </div>
              <button className="primary" onClick={connect} disabled={busy || !selected}>
                Conectar
              </button>
            </>
          )}
        </div>

        <div className="panel">
          <h2>Som</h2>
          {status?.audioError ? (
            <p className="warn">Sem saída de áudio: {status.audioError}</p>
          ) : audio ? (
            <p className="muted">
              {audio.device} · {audio.sampleRate} Hz ·{" "}
              {latencyMs ? `buffer ${audio.bufferFrames} (${latencyMs} ms)` : "buffer automático"}
            </p>
          ) : null}
          {status?.soundfont ? (
            <p className="ok" title={status.soundfont}>
              {fileName(status.soundfont)}
            </p>
          ) : (
            <p className="warn">Escolha um SoundFont (.sf2) de piano para ouvir as notas.</p>
          )}
          <button onClick={chooseSoundfont} disabled={busy || !audio}>
            {status?.soundfont ? "Trocar SoundFont…" : "Escolher SoundFont…"}
          </button>
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="stage">
        <div className="indicators">
          <span className={sustain ? "pill on" : "pill"}>Sustain</span>
          <span className="muted">
            {pressed.size > 0 ? `${pressed.size} nota(s)` : "Toque no teclado ou clique nas teclas"}
          </span>
        </div>
        <Keyboard
          pressed={pressed}
          onPress={(k) => {
            setKey(k, MOUSE_VELOCITY);
            api.playNote(k, MOUSE_VELOCITY);
          }}
          onRelease={(k) => {
            setKey(k, null);
            api.playNote(k, 0);
          }}
        />
      </section>
    </main>
  );
}

export default App;
