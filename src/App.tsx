import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, type Status } from "./api";
import { Keyboard } from "./Keyboard";
import { useScore } from "./useScore";
import "./App.css";

const LAST_PORT = "partitab.midiPort";
const LAST_SOUNDFONT = "partitab.soundfont";
const LAST_SCORE = "partitab.score";
const MOUSE_VELOCITY = 90;
const SCORE_EXTENSIONS = ["gp", "gp3", "gp4", "gp5", "gpx", "musicxml", "mxl", "xml", "cap"];

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

const formatTime = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [ports, setPorts] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [pressed, setPressed] = useState(() => new Map<number, number>());
  const [sustain, setSustain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [scorePath, setScorePath] = useState<string | null>(null);
  const [speed, setSpeed] = useState(100);
  const [solo, setSolo] = useState(false);
  const score = useScore(setError);

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

  const openScore = useCallback(
    async (path: string) => {
      const data = await api.readFile(path);
      score.load(data);
      setScorePath(path);
      storage.set(LAST_SCORE, path);
    },
    [score.load],
  );

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
      const last = storage.get(LAST_SCORE);
      if (last) await openScore(last).catch(() => storage.set(LAST_SCORE, null));
      if (!current.midiPort || !current.soundfont) setShowSettings(true);
      return current;
    });
  }, [run, refreshPorts, openScore]);

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

  // A reprodução da partitura usa o mesmo SoundFont do piano, para soarem iguais.
  const soundfontPath = status?.soundfont;
  useEffect(() => {
    if (!soundfontPath) return;
    api
      .readFile(soundfontPath)
      .then(score.loadSoundFont)
      .catch((e) => setError(String(e)));
  }, [soundfontPath, score.loadSoundFont]);

  // Ao trocar de partitura ou de faixa, reaplica o modo "só esta faixa".
  useEffect(() => {
    score.setSolo(solo);
  }, [solo, score.state.track, score.state.tracks, score.setSolo]);

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

  const chooseScore = () =>
    run(async () => {
      const path = await open({
        title: "Abrir partitura",
        filters: [
          { name: "Partituras (Guitar Pro, MusicXML, Capella)", extensions: SCORE_EXTENSIONS },
        ],
      });
      if (typeof path === "string") await openScore(path);
    });

  const changeSpeed = (value: number) => {
    setSpeed(value);
    score.setSpeed(value / 100);
  };

  const audio = status?.audio;
  const latencyMs =
    audio?.bufferFrames != null
      ? ((audio.bufferFrames / audio.sampleRate) * 1000).toFixed(1)
      : null;
  const { state } = score;

  return (
    <main>
      <header>
        <h1>PartiTAB</h1>
        <div className="toolbar">
          <button onClick={chooseScore} disabled={busy}>
            Abrir partitura…
          </button>
          {state.tracks.length > 0 && (
            <>
              <select
                value={state.track ?? ""}
                onChange={(e) => score.selectTrack(Number(e.target.value))}
                title="Faixa exibida"
              >
                {state.tracks.map((t) => (
                  <option key={t.index} value={t.index}>
                    {t.name}
                    {t.isPiano ? " (piano)" : ""}
                  </option>
                ))}
              </select>
              <button
                className="primary"
                onClick={score.playPause}
                disabled={!state.ready}
                title={state.ready ? undefined : "Carregando o som…"}
              >
                {state.playing ? "Pausar" : "Tocar"}
              </button>
              <button onClick={score.stop} disabled={!state.ready}>
                Parar
              </button>
              <span className="time">
                {formatTime(state.position)} / {formatTime(state.duration)}
              </span>
              <label className="speed">
                Andamento
                <input
                  type="range"
                  min={25}
                  max={150}
                  step={5}
                  value={speed}
                  onChange={(e) => changeSpeed(Number(e.target.value))}
                  onDoubleClick={() => changeSpeed(100)}
                />
                <span>{speed}%</span>
              </label>
              <label className="check">
                <input type="checkbox" checked={solo} onChange={(e) => setSolo(e.target.checked)} />
                Só esta faixa
              </label>
            </>
          )}
        </div>
        <button
          className={showSettings ? "settings-toggle on" : "settings-toggle"}
          onClick={() => setShowSettings((v) => !v)}
          title="Teclado MIDI e som"
        >
          ⚙ Ajustes
        </button>
      </header>

      {showSettings && (
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
                  <button
                    onClick={() => run(async () => void (await refreshPorts()))}
                    disabled={busy}
                  >
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
      )}

      {error && <p className="error">{error}</p>}

      <section className="score" ref={score.scrollRef}>
        {!scorePath && (
          <div className="empty">
            <p>Abra um arquivo Guitar Pro (.gp3 a .gp), MusicXML ou Capella.</p>
            <button className="primary" onClick={chooseScore} disabled={busy}>
              Abrir partitura…
            </button>
          </div>
        )}
        <div ref={score.containerRef} />
      </section>

      <section className="stage">
        <div className="indicators">
          <span className={sustain ? "pill on" : "pill"}>Sustain</span>
          <span className="legend you">Você</span>
          <span className="legend score-note">Partitura</span>
        </div>
        <Keyboard
          pressed={pressed}
          expected={state.sounding}
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
