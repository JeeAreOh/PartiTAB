import { useCallback, useEffect, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { api, type Song, type Status } from "./api";
import { Keyboard } from "./Keyboard";
import { keyName, useScore } from "./useScore";
import { Library } from "./library/Library";
import { parsePrefs, readMetadata, useLibrary, type SongPrefs } from "./library/useLibrary";
import { LEVELS, type Level } from "./reducer/reduce";
import { estimateDifficulty } from "./reducer/harmony";
import { usePractice, type Mode } from "./practice/usePractice";
import { accuracy, score as points, type Judgement } from "./practice/engine";
import type { HandChoice } from "./practice/timeline";
import "./App.css";

const LAST_PORT = "partitab.midiPort";
const LAST_SOUNDFONT = "partitab.soundfont";
/** Caminho da última partitura (versões antes da biblioteca). */
const LAST_SCORE = "partitab.score";
const LAST_SONG = "partitab.songId";
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

const MODES: [Mode, string, string][] = [
  ["listen", "Ouvir", "Toca a partitura para você ouvir"],
  ["wait", "Esperar", "A música só avança quando você toca as notas certas"],
  ["play", "Tocar junto", "A música segue no andamento e cada nota é avaliada"],
];

const HANDS: [HandChoice, string][] = [
  ["right", "Direita"],
  ["left", "Esquerda"],
  ["both", "Ambas"],
];

function describe(j: Judgement | null) {
  if (!j) return "";
  const ms = j.deltaMs !== undefined ? ` ${Math.abs(j.deltaMs)} ms` : "";
  switch (j.verdict) {
    case "hit":
      return "Certo!";
    case "early":
      return `Adiantada${ms}`;
    case "late":
      return `Atrasada${ms}`;
    case "wrong":
      return "Nota errada";
    case "miss":
      return "Nota perdida";
  }
}

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
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [view, setView] = useState<"library" | "score">("score");
  const [notice, setNotice] = useState<string | null>(null);
  const [speed, setSpeed] = useState(100);
  const [solo, setSolo] = useState(false);
  const score = useScore(setError);
  const library = useLibrary(setError);
  const currentSong = library.songs.find((s) => s.id === currentId) ?? null;
  const practice = usePractice({
    apiRef: score.apiRef,
    timeline: score.state.timeline,
    tempo: score.state.tempo,
    speed: speed / 100,
    setMutedHands: score.setMutedHands,
  });
  const onNoteRef = useRef(practice.onNote);
  onNoteRef.current = practice.onNote;

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

  /** Abre uma música da biblioteca, com o arranjo e a faixa da última vez. */
  const openSong = useCallback(
    async (song: Song) => {
      const data = await api.readFile(song.path);
      const prefs = parsePrefs(song);
      const options =
        prefs.level && prefs.melody != null
          ? { level: prefs.level, melody: prefs.melody, transpose: prefs.transpose ?? true }
          : null;
      if (!score.load(data, options, options ? undefined : prefs.track)) return;
      setCurrentId(song.id);
      storage.set(LAST_SONG, String(song.id));
      setView("score");
    },
    [score.load],
  );

  /** Abre um arquivo do disco: entra na biblioteca (sem duplicar) e abre. */
  const openFile = useCallback(
    async (path: string) => {
      const data = await api.readFile(path);
      const meta = readMetadata(data);
      if (!meta) throw new Error(`Formato não reconhecido: ${fileName(path)}`);
      await openSong(await library.importFile(path, meta));
    },
    [openSong, library.importFile],
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
      const songs = await api.library.list().catch(() => [] as Song[]);
      const lastSong = songs.find((s) => String(s.id) === storage.get(LAST_SONG));
      const legacy = storage.get(LAST_SCORE);
      if (lastSong) await openSong(lastSong).catch(() => storage.set(LAST_SONG, null));
      else if (legacy) await openFile(legacy).catch(() => undefined);
      storage.set(LAST_SCORE, null);
      if (!lastSong && !legacy) setView("library");
      if (!current.midiPort || !current.soundfont) setShowSettings(true);
      return current;
    });
  }, [run, refreshPorts, openSong, openFile]);

  useEffect(() => {
    const unlisten = api.onKey((e) => {
      if (e.type === "noteOn") {
        setKey(e.key, e.velocity);
        onNoteRef.current(e.key);
      } else if (e.type === "noteOff") setKey(e.key, null);
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

  const scoreFilter = {
    name: "Partituras (Guitar Pro, MusicXML, Capella)",
    extensions: SCORE_EXTENSIONS,
  };

  const chooseScore = () =>
    run(async () => {
      const path = await open({ title: "Abrir partitura", filters: [scoreFilter] });
      if (typeof path === "string") await openFile(path);
    });

  /** Adiciona vários arquivos à biblioteca sem abrir. */
  const addToLibrary = () =>
    run(async () => {
      const paths = await open({
        title: "Adicionar partituras à biblioteca",
        multiple: true,
        filters: [scoreFilter],
      });
      if (!paths) return;
      const failed: string[] = [];
      for (const path of Array.isArray(paths) ? paths : [paths]) {
        try {
          const meta = readMetadata(await api.readFile(path));
          if (!meta) throw new Error();
          await library.importFile(path, meta);
        } catch {
          failed.push(fileName(path));
        }
      }
      if (failed.length) setError(`Não foi possível adicionar: ${failed.join(", ")}`);
    });

  // ------------------------------------------------------------- arranjo

  const savePrefs = (patch: SongPrefs) => {
    if (currentSong) {
      library.update(currentSong.id, {
        prefs: JSON.stringify({ ...parsePrefs(currentSong), ...patch }),
      });
    }
  };

  const changeArrangement = (level: 0 | Level, melody?: number | null, transpose?: boolean) => {
    practice.stop();
    const current = score.state.arrangement;
    const mel = melody ?? current?.melody ?? score.state.roles.melody;
    const tr = transpose ?? current?.transpose ?? true;
    if (level === 0) score.arrange(null);
    else if (mel !== null) score.arrange({ level, melody: mel, transpose: tr });
    else return setError("Nenhuma faixa com melodia para montar o arranjo");
    savePrefs({ level, melody: mel, transpose: tr });
  };

  const changeTrack = (index: number) => {
    score.selectTrack(index);
    if (!score.state.arrangement) savePrefs({ track: index });
  };

  const arrangementTitle = () =>
    `${currentSong?.title ?? "Arranjo"} (piano, nível ${score.state.arrangement?.level})`;

  const saveArrangement = () =>
    run(async () => {
      const data = score.exportGp();
      if (!data || !currentSong || !score.state.arrangement) return;
      const title = arrangementTitle();
      const song = await library.importBytes(`${title}.gp`, data, title, currentSong.artist);
      await library.update(song.id, {
        style: currentSong.style,
        prefs: JSON.stringify({ level: 0, track: score.state.track } satisfies SongPrefs),
      });
      setNotice(`"${title}" salvo na biblioteca. Para ajustar no MuseScore, use Exportar.`);
    });

  const exportArrangement = () =>
    run(async () => {
      const data = score.exportGp();
      if (!data) return;
      const path = await save({
        title: "Exportar em Guitar Pro (abre no MuseScore)",
        defaultPath: `${arrangementTitle()}.gp`,
        filters: [{ name: "Guitar Pro 7", extensions: ["gp"] }],
      });
      if (path) {
        await api.writeFile(path, data);
        setNotice(`Exportado para ${fileName(path)}`);
      }
    });

  // ------------------------------------------------- histórico e dificuldade

  // Ao terminar (ou parar) uma prática com notas avaliadas, grava na biblioteca.
  const wasRunning = useRef(false);
  const p0 = practice.state;
  useEffect(() => {
    const ended = wasRunning.current && !p0.running;
    wasRunning.current = p0.running;
    const t = p0.tally;
    if (!ended || !currentSong || t.hit + t.early + t.late + t.wrong + t.miss === 0) return;
    const track = score.state.tracks.find((x) => x.index === score.state.track);
    library.recordAttempt({
      songId: currentSong.id,
      mode: p0.mode,
      hands: p0.hands,
      track: track?.name ?? "",
      level: score.state.arrangement ? String(score.state.arrangement.level) : "original",
      speed,
      score: points(t),
      accuracy: accuracy(t),
      hit: t.hit,
      early: t.early,
      late: t.late,
      wrong: t.wrong,
      miss: t.miss,
      completed: p0.finished,
    });
    // Só reage ao fim da prática.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p0.running]);

  // Estima a dificuldade de músicas novas pela faixa aberta (partitura original).
  const estimated = useRef(new Set<number>());
  useEffect(() => {
    const { timeline, tempo, arrangement } = score.state;
    if (
      !currentSong ||
      currentSong.difficulty !== null ||
      arrangement ||
      !tempo ||
      timeline.length < 2
    )
      return;
    if (estimated.current.has(currentSong.id)) return;
    estimated.current.add(currentSong.id);
    const notes = timeline.flatMap((s) => s.notes);
    const keys = notes.map((n) => n.key);
    library.setAutoDifficulty(
      currentSong.id,
      estimateDifficulty({
        noteTimes: timeline.flatMap((s) => s.notes.map(() => tempo.ms(s.tick))),
        maxChord: Math.max(...timeline.map((s) => s.notes.length)),
        bothHands: notes.some((n) => n.hand === "left") && notes.some((n) => n.hand === "right"),
        range: [Math.min(...keys), Math.max(...keys)],
      }),
    );
  }, [currentSong, score.state, library.setAutoDifficulty]);

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
  const p = practice.state;
  const practicing = p.mode !== "listen";
  const { arrangement } = state;

  return (
    <main>
      <header>
        <h1>PartiTAB</h1>
        <div className="segmented views" role="tablist">
          <button
            role="tab"
            aria-selected={view === "library"}
            className={view === "library" ? "on" : ""}
            onClick={() => setView("library")}
          >
            Biblioteca <span className="count">{library.songs.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={view === "score"}
            className={view === "score" ? "on" : ""}
            onClick={() => setView("score")}
          >
            Partitura
          </button>
        </div>
        <div className="toolbar">
          {view === "score" && (
            <button onClick={chooseScore} disabled={busy}>
              Abrir arquivo…
            </button>
          )}
          {view === "score" && state.tracks.length > 0 && (
            <>
              <select
                value={state.track ?? ""}
                onChange={(e) => changeTrack(Number(e.target.value))}
                title="Faixa exibida"
              >
                {state.tracks.map((t) => (
                  <option key={t.index} value={t.index}>
                    {t.name}
                    {t.isPiano && !/piano/i.test(t.name) ? " (piano)" : ""}
                  </option>
                ))}
              </select>
              <div className="segmented" role="group" aria-label="Modo">
                {MODES.map(([m, label, hint]) => (
                  <button
                    key={m}
                    className={p.mode === m ? "on" : ""}
                    title={hint}
                    onClick={() => practice.set("mode", m)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {practicing ? (
                <button
                  className="primary"
                  onClick={p.running ? practice.stop : practice.start}
                  disabled={!state.ready || state.timeline.length === 0}
                >
                  {p.running ? "Parar" : "Começar"}
                </button>
              ) : (
                <>
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
                </>
              )}
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
              {p.mode !== "wait" && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={solo}
                    onChange={(e) => setSolo(e.target.checked)}
                  />
                  Só esta faixa
                </label>
              )}
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

      {view === "score" && state.tracks.length > 0 && (
        <section className="practice-bar">
          <label className="field">
            Arranjo
            <select
              value={arrangement?.level ?? 0}
              onChange={(e) => changeArrangement(Number(e.target.value) as 0 | Level)}
              title="Redução para piano a partir das faixas da música"
            >
              <option value={0}>Original</option>
              {LEVELS.map(([level, label]) => (
                <option key={level} value={level}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {arrangement && (
            <>
              <label className="field">
                Melodia
                <select
                  value={arrangement.melody}
                  onChange={(e) => changeArrangement(arrangement.level, Number(e.target.value))}
                >
                  {state.sourceTracks.map((t) => (
                    <option key={t.index} value={t.index}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className="check"
                title="Transpõe para Dó, Sol ou Fá (ou Lá, Mi, Ré menor); a banda acompanha"
              >
                <input
                  type="checkbox"
                  checked={arrangement.transpose}
                  onChange={(e) =>
                    changeArrangement(arrangement.level, undefined, e.target.checked)
                  }
                />
                Tom fácil
              </label>
              <span className="muted">
                Tom {keyName(arrangement.key)}
                {arrangement.shift !== 0 &&
                  ` → ${keyName({ ...arrangement.key, tonic: (arrangement.key.tonic + arrangement.shift + 12) % 12 })}`}
              </span>
              <button
                onClick={saveArrangement}
                disabled={busy || !currentSong}
                title="Guarda este arranjo como uma partitura nova"
              >
                Salvar na biblioteca
              </button>
              <button
                onClick={exportArrangement}
                disabled={busy}
                title="Arquivo .gp, que abre no MuseScore e no Guitar Pro"
              >
                Exportar…
              </button>
            </>
          )}
        </section>
      )}

      {view === "score" && practicing && state.tracks.length > 0 && (
        <section className="practice-bar">
          <div className="segmented" role="group" aria-label="Mão">
            {HANDS.map(([h, label]) => (
              <button
                key={h}
                className={p.hands === h ? "on" : ""}
                onClick={() => practice.set("hands", h)}
              >
                {label}
              </button>
            ))}
          </div>
          {p.mode === "play" && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={p.metronome}
                  onChange={(e) => practice.set("metronome", e.target.checked)}
                />
                Metrônomo
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={p.countIn}
                  onChange={(e) => practice.set("countIn", e.target.checked)}
                />
                Contagem
              </label>
            </>
          )}
          <div className="stats" aria-live="polite">
            <span className={`feedback ${p.last?.verdict ?? ""}`}>
              {p.finished ? "Fim da música!" : describe(p.last)}
            </span>
            <span title="Pontos (0–100)">
              <b>{points(p.tally)}</b> pts
            </span>
            <span title="Notas certas sobre tudo que foi tocado ou deveria ter sido">
              {accuracy(p.tally)}% precisão
            </span>
            <span className="good">{p.tally.hit} certas</span>
            {p.mode === "play" && (
              <span className="off">
                {p.tally.early} adiantadas · {p.tally.late} atrasadas
              </span>
            )}
            <span className="bad">{p.tally.wrong} erradas</span>
            {p.mode === "play" && <span className="bad">{p.tally.miss} perdidas</span>}
          </div>
        </section>
      )}

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
                    Não consegui desligar o som interno. No PSR-E463, ajuste a função 050 (Local)
                    para OFF.
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

      {error && (
        <p className="error">
          {error}{" "}
          <button className="link" onClick={() => setError(null)} aria-label="Fechar aviso">
            ✕
          </button>
        </p>
      )}
      {notice && (
        <p className="notice">
          {notice}{" "}
          <button className="link" onClick={() => setNotice(null)} aria-label="Fechar aviso">
            ✕
          </button>
        </p>
      )}

      <div className={view === "library" ? "workspace library-open" : "workspace"}>
        <section className="score" ref={score.scrollRef}>
          {state.tracks.length === 0 && (
            <div className="empty">
              <p>
                Abra um arquivo Guitar Pro (.gp3 a .gp), MusicXML ou Capella, ou escolha na
                biblioteca.
              </p>
              <div className="row">
                <button className="primary" onClick={chooseScore} disabled={busy}>
                  Abrir arquivo…
                </button>
                <button onClick={() => setView("library")}>Ir para a biblioteca</button>
              </div>
            </div>
          )}
          <div ref={score.containerRef} />
        </section>

        <section className="stage">
          <div className="indicators">
            <span className={sustain ? "pill on" : "pill"}>Sustain</span>
            <span className="legend you">Você</span>
            <span className="legend score-note">
              {p.running && p.mode === "wait" ? "Toque agora" : "Partitura"}
            </span>
          </div>
          <Keyboard
            pressed={pressed}
            expected={p.running && p.mode === "wait" ? p.waiting : state.sounding}
            flashes={p.flashes}
            onPress={(k) => {
              setKey(k, MOUSE_VELOCITY);
              api.playNote(k, MOUSE_VELOCITY);
              practice.onNote(k);
            }}
            onRelease={(k) => {
              setKey(k, null);
              api.playNote(k, 0);
            }}
          />
        </section>
        {view === "library" && (
          <div className="library-layer">
            <Library
              songs={library.songs}
              currentId={currentId}
              busy={busy}
              onOpen={(song) => run(() => openSong(song))}
              onImport={addToLibrary}
              onUpdate={library.update}
              onRemove={async (id) => {
                await library.remove(id);
                if (id === currentId) {
                  setCurrentId(null);
                  storage.set(LAST_SONG, null);
                }
              }}
            />
          </div>
        )}
      </div>
    </main>
  );
}

export default App;
