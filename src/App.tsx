import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { api, type Song, type Status } from "./api";
import { Keyboard } from "./Keyboard";
import { DEFAULT_DISPLAY, keyName, useScore, type Display } from "./useScore";
import { Library } from "./library/Library";
import { Cover } from "./library/Cover";
import { parsePrefs, readMetadata, useLibrary, type SongPrefs } from "./library/useLibrary";
import { toScoreBytes } from "./midi/midiToMusicXml";
import { mergeSections, sectionLabel, type SongSection } from "./practice/sections";
import { exerciseTitle, exerciseXml, type Exercise } from "./technique/exercises";
import { TECHNIQUE_ARTIST, Technique } from "./technique/Technique";
import { LEVELS, type Level } from "./reducer/reduce";
import { estimateDifficulty } from "./reducer/harmony";
import { usePractice, type Mode } from "./practice/usePractice";
import { ErrorOverlay } from "./practice/ErrorOverlay";
import { barsToRange, rangeToBars, worstSegments, type Segment } from "./practice/drill";
import type { BarStat } from "./practice/engine";
import { ReadingTrainer } from "./reading/ReadingTrainer";
import { Progress } from "./progress/Progress";
import { parseLatency } from "./practice/latency";
import { useRecorder } from "./practice/useRecorder";
import { noteCount, toMidiFile } from "./practice/recording";
import { FallingNotes } from "./practice/FallingNotes";
import { fingerNotes } from "./practice/fingering";
import { Settings } from "./Settings";
import { useUpdates } from "./updates/useUpdates";
import { useFullscreen } from "./ui/useFullscreen";
import { useTheme } from "./ui/theme";
import { useSound } from "./sound/useSound";
import { TonePicker } from "./sound/TonePicker";
import { Search, type DownloadResult, type SearchLogEntry } from "./search/Search";
import { VideoPanel } from "./video/VideoPanel";
import { youtubeId, type BarLookup, type SyncPoint } from "./video/sync";
import { Icon } from "./ui/Icon";
import { Popover } from "./ui/Popover";
import { accuracy, score as points, type Judgement } from "./practice/engine";
import type { HandChoice } from "./practice/timeline";
import "./App.css";

const LAST_PORT = "partitab.midiPort";
const KEYBOARD_SOUND = "partitab.keyboardSound";
const LAST_SOUNDFONT = "partitab.soundfont";
/** Caminho da última partitura (versões antes da biblioteca). */
const LAST_SCORE = "partitab.score";
const LAST_SONG = "partitab.songId";
/** Atraso calibrado entre o som e o toque (ms). */
const LATENCY = "partitab.latencyMs";
/** Como a partitura aparece: tamanho, layout, notas caindo e dedilhado. */
const DISPLAY = "partitab.display";

interface ViewPrefs extends Display {
  falling: boolean;
  fingering: boolean;
}

function readViewPrefs(): ViewPrefs {
  const fallback = { ...DEFAULT_DISPLAY, falling: false, fingering: false };
  try {
    const raw = JSON.parse(storage.get(DISPLAY) ?? "{}");
    const scale = Number(raw.scale);
    return {
      scale: Number.isFinite(scale) && scale >= 0.5 && scale <= 2 ? scale : fallback.scale,
      layout: raw.layout === "horizontal" ? "horizontal" : "page",
      falling: raw.falling === true,
      fingering: raw.fingering === true,
    };
  } catch {
    return fallback;
  }
}
/** Coleções já trazidas para a biblioteca na primeira abertura. */
const COLLECTIONS_DONE = "partitab.collections";
const MOUSE_VELOCITY = 90;
const SCORE_EXTENSIONS = ["gp", "gp3", "gp4", "gp5", "gpx", "musicxml", "mxl", "xml", "cap", "mid", "midi"];

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
  const [view, setView] = useState<"library" | "score" | "reading" | "technique" | "progress" | "search">(
    "score",
  );
  /** Muda a cada prática gravada (o painel de progresso recarrega). */
  const [practiceVersion, setPracticeVersion] = useState(0);
  /** Erros por compasso nas últimas execuções da música aberta. */
  const [errorBars, setErrorBars] = useState<Record<number, BarStat>>({});
  const [showErrors, setShowErrors] = useState(false);
  /** Treino dos piores trechos: um trecho por vez, até dominar. */
  const [drill, setDrill] = useState<{ segments: Segment[]; index: number } | null>(null);
  const [barFrom, setBarFrom] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [barTo, setBarTo] = useState("");
  const [downloads, setDownloads] = useState<DownloadResult[]>([]);
  const [searchLog, setSearchLog] = useState<SearchLogEntry[]>([]);
  /** Vídeo do YouTube ligado à partitura atual, e as marcações de compasso. */
  const [video, setVideo] = useState<{ id: string; sync: SyncPoint[] } | null>(null);
  const [videoLink, setVideoLink] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [speed, setSpeed] = useState(100);
  const [solo, setSolo] = useState(false);
  const score = useScore(setError);
  const library = useLibrary(setError);
  const updates = useUpdates();
  const screen = useFullscreen(setError);
  const theme = useTheme();
  const sound = useSound({ status, setStatus, onError: setError });
  const currentSong = library.songs.find((s) => s.id === currentId) ?? null;
  const changeSpeed = (value: number) => {
    setSpeed(value);
    score.setSpeed(value / 100);
  };
  const onMasteredRef = useRef<() => void>(() => undefined);
  const [viewPrefs, setViewPrefs] = useState<ViewPrefs>(readViewPrefs);
  const changeView = (patch: Partial<ViewPrefs>) =>
    setViewPrefs((v) => {
      const next = { ...v, ...patch };
      storage.set(DISPLAY, JSON.stringify(next));
      return next;
    });
  const [latency, setLatency] = useState(() => parseLatency(storage.get(LATENCY)));
  const changeLatency = useCallback((ms: number) => {
    setLatency(ms);
    storage.set(LATENCY, String(ms));
  }, []);
  const practice = usePractice({
    latencyMs: latency,
    apiRef: score.apiRef,
    timeline: score.state.timeline,
    tempo: score.state.tempo,
    speed: speed / 100,
    setMutedHands: score.setMutedHands,
    range: score.state.range,
    loop: score.state.loop,
    onSpeed: changeSpeed,
    onMastered: () => onMasteredRef.current(),
  });
  const { state } = score;
  const p = practice.state;
  const onNoteRef = useRef(practice.onNote);
  /** Enquanto o treino de leitura está aberto, as notas do teclado vão para ele. */
  const readingHandler = useRef<((key: number) => void) | null>(null);
  const registerReading = useCallback((h: ((key: number) => void) | null) => {
    readingHandler.current = h;
  }, []);
  /** Durante a calibração do atraso, as notas do teclado vão para ela. */
  const calibrationHandler = useRef<((key: number) => void) | null>(null);
  const registerCalibration = useCallback((h: ((key: number) => void) | null) => {
    calibrationHandler.current = h;
  }, []);
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

  // Tamanho, layout e dedilhado da partitura.
  const { scale, layout, fingering, falling } = viewPrefs;
  useEffect(() => {
    score.setDisplay({ scale, layout });
  }, [scale, layout, score.setDisplay]);
  useEffect(() => {
    score.setFingering(fingering);
  }, [fingering, score.setFingering]);
  const timeline = score.state.timeline;
  const fingerMap = useMemo(
    () => (fingering ? fingerNotes(timeline.flatMap((s) => s.notes)) : null),
    [fingering, timeline],
  );

  const recorder = useRecorder({ apiRef: score.apiRef, onKey: setKey });
  const captureRef = useRef(recorder.capture);
  captureRef.current = recorder.capture;

  /** Abre uma música da biblioteca, com o arranjo e a faixa da última vez. */
  const openSong = useCallback(
    async (song: Song) => {
      const data = toScoreBytes(await api.readFile(song.path), song.title);
      const prefs = parsePrefs(song);
      const options =
        prefs.level && prefs.melody != null
          ? { level: prefs.level, melody: prefs.melody, transpose: prefs.transpose ?? true }
          : null;
      // O vídeo da música anterior sai antes de carregar a nova.
      score.setMedia(null, [], false);
      score.setSections(prefs.sections ?? [], false);
      if (!score.load(data, options, options ? undefined : prefs.track)) return;
      setVideo(prefs.video ?? null);
      setCurrentId(song.id);
      storage.set(LAST_SONG, String(song.id));
      setView("score");
    },
    [score.load, score.setMedia, score.setSections],
  );

  /** Abre um arquivo do disco: entra na biblioteca (sem duplicar) e abre. */
  const openFile = useCallback(
    async (path: string) => {
      const data = toScoreBytes(await api.readFile(path));
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
      // O último SoundFont escolhido; sem ele (ou se sumiu), o som padrão do app.
      const soundfont = storage.get(LAST_SOUNDFONT);
      if (current.audio && !current.soundfont) {
        if (soundfont) {
          current = await api.loadSoundfont(soundfont).catch(() => {
            storage.set(LAST_SOUNDFONT, null);
            return current;
          });
        }
        if (!current.soundfont) current = await api.loadDefaultSoundfont().catch(() => current);
      }
      // O som pelo teclado vale assim que o teclado conectar.
      if (storage.get(KEYBOARD_SOUND) === "1") {
        current = await api.setKeyboardSound(true).catch(() => current);
      }
      const port = storage.get(LAST_PORT);
      if (port && list.includes(port) && !current.midiPort) {
        setSelected(port);
        current = await api.connectMidi(port).catch(() => current);
      }
      // Na primeira abertura, a coleção gratuita entra na biblioteca.
      if (!storage.get(COLLECTIONS_DONE)) {
        const result = await api.library.importCollection("musetrainer").catch(() => null);
        if (result) {
          storage.set(COLLECTIONS_DONE, "musetrainer");
          if (result.added > 0) {
            library.refresh();
            setNotice(`${result.added} partituras da coleção MuseTrainer entraram na biblioteca`);
          }
        }
      }
      const songs = await api.library.list().catch(() => [] as Song[]);
      const lastSong = songs.find((s) => String(s.id) === storage.get(LAST_SONG));
      const legacy = storage.get(LAST_SCORE);
      if (lastSong) await openSong(lastSong).catch(() => storage.set(LAST_SONG, null));
      else if (legacy) await openFile(legacy).catch(() => undefined);
      storage.set(LAST_SCORE, null);
      if (!lastSong && !legacy) setView("library");
      return current;
    });
  }, [run, refreshPorts, openSong, openFile]);

  useEffect(() => {
    const unlisten = api.onKey((e) => {
      captureRef.current(e);
      if (e.type === "noteOn") {
        setKey(e.key, e.velocity);
        if (calibrationHandler.current) calibrationHandler.current(e.key);
        else if (readingHandler.current) readingHandler.current(e.key);
        else onNoteRef.current(e.key);
      } else if (e.type === "noteOff") setKey(e.key, null);
      else setSustain(e.down);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Avisos somem sozinhos; erros ficam até serem fechados.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Registro da janela de busca (diagnóstico de downloads).
  useEffect(() => {
    const unlisten = api.onSearchLog((e) =>
      setSearchLog((list) => [{ ...e, at: Date.now() }, ...list].slice(0, 40)),
    );
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Arquivos baixados no navegador de busca chegam já importados.
  useEffect(() => {
    const unlisten = api.onSearchDownload((result) => {
      setDownloads((list) => [result, ...list]);
      if (result.type === "imported") {
        library.refresh();
        setNotice(`"${result.song.title}" entrou na biblioteca`);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [library.refresh]);

  // A reprodução da partitura usa o mesmo SoundFont do piano, para soarem iguais.
  // (Recarrega quando o player do alphaTab é recriado.)
  const soundfontPath = status?.soundfont;
  const generation = score.state.playerGeneration;
  useEffect(() => {
    if (!soundfontPath || score.state.external) return;
    api
      .readFile(soundfontPath)
      .then(score.loadSoundFont)
      .catch((e) => setError(String(e)));
  }, [soundfontPath, generation, score.state.external, score.loadSoundFont]);

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

  const toggleKeyboardSound = (on: boolean) =>
    run(async () => {
      storage.set(KEYBOARD_SOUND, on ? "1" : null);
      return api.setKeyboardSound(on);
    });

  // Com o som pelo teclado, a banda e o metrônomo do player vão para ele.
  const keyboardSound = !!status?.keyboardSound && !!status.midiPort;
  useEffect(() => {
    score.setKeyboardOut(
      keyboardSound ? (bytes) => void api.midiOut(bytes).catch(() => undefined) : null,
    );
  }, [keyboardSound, score.setKeyboardOut]);

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

  const openSoundfont = (path: string) =>
    run(async () => {
      const next = await api.loadSoundfont(path);
      storage.set(LAST_SOUNDFONT, path);
      return next;
    });

  const resetSoundfont = () =>
    run(async () => {
      const next = await api.loadDefaultSoundfont();
      storage.set(LAST_SOUNDFONT, null);
      return next;
    });

  // O download pode demorar: não bloqueia o resto do app enquanto baixa.
  const downloadSoundfont = (id: string) =>
    sound
      .download(id)
      .then((path) => {
        setNotice("SoundFont baixado. Carregando os timbres…");
        return openSoundfont(path);
      })
      .catch((e) => setError(String(e)));

  const scoreFilter = {
    name: "Partituras (Guitar Pro, MusicXML, Capella, MIDI)",
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
          const meta = readMetadata(toScoreBytes(await api.readFile(path)));
          if (!meta) throw new Error();
          await library.importFile(path, meta);
        } catch {
          failed.push(fileName(path));
        }
      }
      if (failed.length) setError(`Não foi possível adicionar: ${failed.join(", ")}`);
    });

  /** Gera o exercício de técnica, guarda na biblioteca (sem duplicar) e abre. */
  const practiceExercise = (ex: Exercise) =>
    run(async () => {
      const title = exerciseTitle(ex);
      const data = new TextEncoder().encode(exerciseXml(ex));
      const song = await library.importBytes(`${title}.musicxml`, data, title, TECHNIQUE_ARTIST);
      if (song.style !== TECHNIQUE_ARTIST) {
        await library.update(song.id, { style: TECHNIQUE_ARTIST });
      }
      await openSong(song);
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
    // Com vídeo, a música fica no tom da gravação.
    const tr = !video && (transpose ?? current?.transpose ?? true);
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

  const exportRecording = () =>
    run(async () => {
      if (!recorder.take) return;
      const name = currentSong?.title ?? "Gravação";
      const path = await save({
        title: "Exportar a gravação em MIDI",
        defaultPath: `${name} - minha gravação.mid`,
        filters: [{ name: "MIDI", extensions: ["mid"] }],
      });
      if (path) {
        await api.writeFile(path, toMidiFile(recorder.take, name));
        setNotice(`Gravação salva em ${fileName(path)}`);
      }
    });

  // ---------------------------------------------- mapa de erros e trechos

  const loadErrors = useCallback((songId: number) => {
    api.library
      .errorMap(songId)
      .then((map) => setErrorBars(Object.fromEntries(map.bars.map((b) => [b.bar, b]))))
      .catch(() => setErrorBars({}));
  }, []);

  useEffect(() => {
    setDrill(null);
    if (currentId === null) setErrorBars({});
    else loadErrors(currentId);
  }, [currentId, loadErrors]);

  const barLookups = () => score.apiRef.current?.tickCache?.masterBars ?? [];

  /** Escolhe o trecho por compassos (numeração começando em 1). */
  const selectBars = (from: number, to: number) => {
    const range = barsToRange(barLookups(), from - 1, Math.max(from, to) - 1);
    if (!range) return setError("Compassos fora da partitura");
    score.setRange(range);
    score.setLoop(true);
  };

  const rangeBars = state.range ? rangeToBars(barLookups(), state.range) : null;
  const mySections = parsePrefs(currentSong).sections ?? [];
  const sections = mergeSections(state.fileSections, mySections);
  const rangeSection = rangeBars
    ? sections.find((s) => s.from === rangeBars.from && s.to === rangeBars.to)
    : undefined;

  /** Guarda o trecho escolhido como seção da música. */
  const saveSection = () => {
    const name = sectionName.trim();
    if (!rangeBars || !name) return;
    const list = [
      ...mySections.filter((s) => s.name !== name),
      { name, from: rangeBars.from, to: rangeBars.to },
    ].sort((a, b) => a.from - b.from);
    savePrefs({ sections: list });
    score.setSections(list);
    setSectionName("");
  };

  const removeSection = (section: SongSection) => {
    const list = mySections.filter((s) => s.name !== section.name || s.from !== section.from);
    savePrefs({ sections: list });
    score.setSections(list);
  };
  const worst = worstSegments(errorBars);

  const startDrill = () => {
    if (worst.length === 0) return;
    if (p.mode !== "play") practice.set("mode", "play");
    practice.set("ramp", true);
    setDrill({ segments: worst, index: 0 });
    selectBars(worst[0].from + 1, worst[0].to + 1);
    // Espera o React aplicar o trecho antes de começar.
    window.setTimeout(() => practice.start(), 250);
  };

  // Trecho dominado: no treino dos piores trechos, passa para o próximo.
  onMasteredRef.current = () => {
    if (!drill) return;
    const next = drill.index + 1;
    practice.stop();
    if (next >= drill.segments.length) {
      setDrill(null);
      setNotice("Treino concluído: todos os trechos dominados!");
      return;
    }
    const seg = drill.segments[next];
    setDrill({ ...drill, index: next });
    setNotice(`Trecho dominado! Próximo: compassos ${seg.from + 1}–${seg.to + 1}`);
    selectBars(seg.from + 1, seg.to + 1);
    window.setTimeout(() => practice.start(), 900);
  };

  // ------------------------------------------------- histórico e dificuldade

  // Ao terminar (ou parar) uma prática com notas avaliadas, grava na biblioteca.
  const wasRunning = useRef(false);
  const startedAt = useRef(0);
  const p0 = practice.state;
  useEffect(() => {
    const ended = wasRunning.current && !p0.running;
    if (!wasRunning.current && p0.running) startedAt.current = performance.now();
    wasRunning.current = p0.running;
    const t = p0.tally;
    if (!ended || !currentSong || t.hit + t.early + t.late + t.wrong + t.miss === 0) return;
    const track = score.state.tracks.find((x) => x.index === score.state.track);
    const songId = currentSong.id;
    library
      .recordAttempt({
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
        durationMs: Math.round(performance.now() - startedAt.current),
        bars: Object.entries(p0.stats.bars).map(([bar, b]) => ({ bar: Number(bar), ...b })),
        keys: Object.entries(p0.stats.keys).map(([key, k]) => ({ key: Number(key), ...k })),
      })
      .then(() => {
        loadErrors(songId);
        setPracticeVersion((v) => v + 1);
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

  // ------------------------------------------------------------------ vídeo

  const saveVideo = (next: { id: string; sync: SyncPoint[] } | null, extra: SongPrefs = {}) => {
    setVideo(next);
    savePrefs({ ...extra, video: next });
  };

  const connectVideo = () => {
    const id = youtubeId(videoLink);
    if (!id) return setError("Não reconheci o link. Cole o endereço de um vídeo do YouTube.");
    practice.stop();
    setVideoLink("");
    // A gravação está no tom original: desfaz a transposição do arranjo.
    saveVideo(
      { id, sync: video?.id === id ? video.sync : [] },
      score.state.arrangement?.transpose ? { transpose: false } : {},
    );
  };

  const disconnectVideo = () => {
    practice.stop();
    score.setMedia(null);
    saveVideo(null);
  };

  const barsInPlayOrder = (): BarLookup[] =>
    (score.apiRef.current?.tickCache?.masterBars ?? []) as unknown as BarLookup[];

  // --------------------------------------------------------------- atalhos

  const playPause = () => {
    if (!state.ready) return;
    if (p.mode === "listen") score.playPause();
    else if (p.running) practice.stop();
    else practice.start();
  };
  const playPauseRef = useRef(playPause);
  playPauseRef.current = playPause;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.code !== "Space" || e.repeat || /INPUT|SELECT|TEXTAREA|BUTTON/.test(target.tagName))
        return;
      e.preventDefault();
      playPauseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const practicing = p.mode !== "listen";
  const { arrangement } = state;

  const trackName = state.tracks.find((t) => t.index === state.track)?.name;
  const playing = p.mode === "listen" ? state.playing : p.running;
  const keyboardReady = !!status?.midiPort;
  const soundReady = !!status?.audio && !!status?.soundfont;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <Icon name="score" size={16} />
          </span>
          PartiTAB
        </div>
        <nav className="tabs" role="tablist">
          {(
            [
              ["library", "library", "Biblioteca"],
              ["score", "score", "Partitura"],
              ["reading", "reading", "Leitura"],
              ["technique", "technique", "Técnica"],
              ["progress", "heat", "Progresso"],
              ["search", "search", "Buscar"],
            ] as const
          ).map(([v, icon, label]) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              className={view === v ? "tab on" : "tab"}
              onClick={() => setView(v)}
            >
              <Icon name={icon} size={17} />
              {label}
              {v === "library" && library.songs.length > 0 && (
                <span className="count">{library.songs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          {updates.info?.available && (
            <button
              className="status-pill update"
              onClick={() => setShowSettings(true)}
              title="Abrir Ajustes → Atualizações"
            >
              <Icon name="download" size={15} />
              Versão {updates.info.latest} disponível
            </button>
          )}
          {status?.presets?.length ? (
            <TonePicker
              sound={sound}
              presets={status.presets}
              onOpenSettings={() => setShowSettings(true)}
            />
          ) : null}
          <button
            className={keyboardReady && soundReady ? "status-pill ok" : "status-pill"}
            onClick={() => setShowSettings(true)}
            title="Teclado e som"
          >
            <span className="dot" />
            {!keyboardReady
              ? "Conectar teclado"
              : !soundReady
                ? "Escolher som do piano"
                : status?.midiPort}
          </button>
          <button
            className="icon-button"
            onClick={theme.toggle}
            aria-label={theme.effective === "dark" ? "Usar tema claro" : "Usar tema escuro"}
            title={theme.effective === "dark" ? "Tema claro" : "Tema escuro"}
          >
            <Icon name={theme.effective === "dark" ? "sun" : "moon"} size={19} />
          </button>
          <button
            className="icon-button"
            onClick={screen.toggle}
            aria-label={screen.fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            title={screen.fullscreen ? "Sair da tela cheia (F11)" : "Tela cheia (F11)"}
          >
            <Icon name={screen.fullscreen ? "fullscreen-exit" : "fullscreen"} size={19} />
          </button>
          <button
            className="icon-button"
            onClick={() => setShowSettings(true)}
            aria-label="Ajustes"
          >
            <Icon name="settings" size={19} />
          </button>
        </div>
      </header>

      {view === "score" && state.tracks.length > 0 && (
        <>
          <section className="scorebar">
            <div className="song-head">
              {currentSong && (
                <Cover
                  title={currentSong.title}
                  artist={currentSong.artist}
                  cover={currentSong.cover}
                  size="sm"
                />
              )}
              <div className="song-info">
                <h2>{currentSong?.title ?? "Partitura"}</h2>
                <p>{[currentSong?.artist, trackName].filter(Boolean).join(" · ")}</p>
              </div>
            </div>

            <div className="transport">
              <button
                className="icon-button"
                onClick={() => (p.mode === "listen" ? score.stop() : practice.stop())}
                disabled={!state.ready}
                aria-label="Parar"
                title="Parar"
              >
                <Icon name="stop" size={16} />
              </button>
              <button
                className="play-button"
                onClick={playPause}
                disabled={!state.ready || (p.mode !== "listen" && state.timeline.length === 0)}
                aria-label={
                  playing ? "Pausar" : p.mode === "listen" ? "Tocar" : "Começar a prática"
                }
                title={state.ready ? "Espaço" : "Carregando o som…"}
              >
                <Icon
                  name={playing ? (p.mode === "listen" ? "pause" : "stop") : "play"}
                  size={20}
                />
              </button>
              <span className="time">
                {formatTime(state.position)}
                <span className="muted"> / {formatTime(state.duration)}</span>
              </span>
              <button
                className={recorder.recording ? "record-button on" : "record-button"}
                onClick={recorder.recording ? recorder.stop : recorder.start}
                aria-label={recorder.recording ? "Parar a gravação" : "Gravar o que você toca"}
                title={recorder.recording ? "Parar a gravação" : "Gravar o que você toca"}
              >
                <span className="record-dot" />
                {recorder.recording && formatTime(recorder.elapsed)}
              </button>
              {recorder.take && !recorder.recording && (
                <Popover
                  label={
                    <>
                      <Icon name={recorder.playing ? "pause" : "play"} size={14} />
                      Gravação
                    </>
                  }
                  title="Ouvir ou exportar a última gravação"
                  active={recorder.playing}
                >
                  {(close) => (
                    <div className="form">
                      <p className="muted small">
                        {noteCount(recorder.take!)} notas · {formatTime(recorder.take!.durationMs)}.
                        Ao ouvir, o cursor da partitura acompanha o que você tocou.
                      </p>
                      <div className="row wrap">
                        <button
                          className="primary"
                          onClick={recorder.playing ? recorder.stopPlayback : recorder.play}
                        >
                          {recorder.playing ? "Parar" : "Ouvir"}
                        </button>
                        <button onClick={exportRecording} disabled={busy}>
                          Exportar .mid…
                        </button>
                        <button
                          className="link"
                          onClick={() => {
                            recorder.discard();
                            close();
                          }}
                        >
                          Descartar
                        </button>
                      </div>
                    </div>
                  )}
                </Popover>
              )}
            </div>

            <div className="tools">
              <label className="tempo" title="Andamento (duplo clique volta a 100%)">
                <Icon name="metronome" size={16} />
                <input
                  type="range"
                  min={25}
                  max={150}
                  step={5}
                  value={speed}
                  onChange={(e) => changeSpeed(Number(e.target.value))}
                  onDoubleClick={() => changeSpeed(100)}
                  aria-label="Andamento"
                />
                <span>{speed}%</span>
              </label>

              <Popover
                label={
                  <>
                    <Icon name="layers" size={17} />
                    {arrangement ? `Nível ${arrangement.level}` : "Faixa"}
                  </>
                }
                title="Faixa e arranjo para piano"
                active={!!arrangement}
                align="right"
              >
                <div className="form">
                  <label>
                    Faixa
                    <select
                      value={state.track ?? ""}
                      onChange={(e) => changeTrack(Number(e.target.value))}
                    >
                      {state.tracks.map((t) => (
                        <option key={t.index} value={t.index}>
                          {t.name}
                          {t.isPiano && !/piano/i.test(t.name) ? " (piano)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Arranjo para piano
                    <select
                      value={arrangement?.level ?? 0}
                      onChange={(e) => changeArrangement(Number(e.target.value) as 0 | Level)}
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
                      <label>
                        Melodia vem de
                        <select
                          value={arrangement.melody}
                          onChange={(e) =>
                            changeArrangement(arrangement.level, Number(e.target.value))
                          }
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
                        title={video ? "Com vídeo, a música fica no tom da gravação" : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={arrangement.transpose}
                          disabled={!!video}
                          onChange={(e) =>
                            changeArrangement(arrangement.level, undefined, e.target.checked)
                          }
                        />
                        Tom fácil
                        <span className="muted">
                          {keyName(arrangement.key)}
                          {arrangement.shift !== 0 &&
                            ` → ${keyName({ ...arrangement.key, tonic: (arrangement.key.tonic + arrangement.shift + 12) % 12 })}`}
                        </span>
                      </label>
                      <div className="row">
                        <button onClick={saveArrangement} disabled={busy || !currentSong}>
                          Salvar na biblioteca
                        </button>
                        <button
                          onClick={exportArrangement}
                          disabled={busy}
                          title="Arquivo .gp, abre no MuseScore"
                        >
                          Exportar…
                        </button>
                      </div>
                    </>
                  )}
                  {p.mode !== "wait" && !video && (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={solo}
                        onChange={(e) => setSolo(e.target.checked)}
                      />
                      Ouvir só esta faixa
                    </label>
                  )}
                </div>
              </Popover>

              <Popover
                label={
                  <>
                    <Icon name="score" size={17} />
                    Exibir
                  </>
                }
                title="Pauta ou notas caindo, tamanho e dedilhado"
                active={falling || fingering}
                align="right"
              >
                <div className="form">
                  <div className="segmented" role="radiogroup" aria-label="Visão">
                    <button
                      role="radio"
                      aria-checked={!falling}
                      className={!falling ? "on" : ""}
                      onClick={() => changeView({ falling: false })}
                    >
                      Pauta
                    </button>
                    <button
                      role="radio"
                      aria-checked={falling}
                      className={falling ? "on" : ""}
                      onClick={() => changeView({ falling: true })}
                    >
                      Notas caindo
                    </button>
                  </div>
                  <label className={falling ? "disabled-field" : undefined}>
                    Tamanho da partitura
                    <span className="row">
                      <input
                        type="range"
                        min={0.6}
                        max={1.6}
                        step={0.1}
                        value={scale}
                        disabled={falling}
                        onChange={(e) => changeView({ scale: Number(e.target.value) })}
                        onDoubleClick={() => changeView({ scale: 1 })}
                        aria-label="Tamanho da partitura"
                      />
                      <span className="muted small">{Math.round(scale * 100)}%</span>
                    </span>
                  </label>
                  <label className={falling ? "disabled-field" : undefined}>
                    Layout
                    <select
                      value={layout}
                      disabled={falling}
                      onChange={(e) => changeView({ layout: e.target.value as Display["layout"] })}
                    >
                      <option value="page">Página (rola para baixo)</option>
                      <option value="horizontal">Uma linha (rola para o lado)</option>
                    </select>
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={fingering}
                      onChange={(e) => changeView({ fingering: e.target.checked })}
                    />
                    Dedilhado sugerido
                    <span className="muted">1 = polegar … 5 = mínimo</span>
                  </label>
                </div>
              </Popover>

              <Popover
                label={
                  <>
                    <Icon name="video" size={17} />
                    Vídeo
                  </>
                }
                title="Tocar junto com um vídeo do YouTube"
                active={!!video}
                align="right"
              >
                {(close) => (
                  <form
                    className="form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      connectVideo();
                      close();
                    }}
                  >
                    <label>
                      Link do YouTube
                      <input
                        autoFocus
                        value={videoLink}
                        onChange={(e) => setVideoLink(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=…"
                      />
                    </label>
                    <p className="muted small">
                      A partitura segue o vídeo. Dê play e toque <kbd>M</kbd> no primeiro tempo do
                      compasso 1; marque outros compassos se ela sair do tempo.
                    </p>
                    <div className="row">
                      <button className="primary" type="submit" disabled={!videoLink.trim()}>
                        {video ? "Trocar vídeo" : "Usar vídeo"}
                      </button>
                      {video && (
                        <button
                          type="button"
                          onClick={() => {
                            disconnectVideo();
                            close();
                          }}
                        >
                          Desligar vídeo
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </Popover>
            </div>
          </section>

          <section className="practice-strip">
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
            {practicing && (
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
            )}
            <Popover
              label={
                <>
                  <Icon name="repeat" size={17} />
                  {rangeSection
                    ? rangeSection.name
                    : rangeBars
                      ? `Compassos ${rangeBars.from + 1}–${rangeBars.to + 1}`
                      : "Trecho"}
                </>
              }
              title="Repetir um trecho (loop A–B)"
              active={!!state.range}
            >
              <div className="form">
                <p className="muted small">
                  Arraste sobre a partitura para escolher o trecho, ou digite os compassos.
                </p>
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const from = Number(barFrom);
                    if (from > 0) selectBars(from, Number(barTo) || from);
                  }}
                >
                  <input
                    className="bar-input"
                    inputMode="numeric"
                    placeholder="De"
                    value={barFrom}
                    onChange={(e) => setBarFrom(e.target.value.replace(/\D/g, ""))}
                    aria-label="Do compasso"
                  />
                  <input
                    className="bar-input"
                    inputMode="numeric"
                    placeholder="Até"
                    value={barTo}
                    onChange={(e) => setBarTo(e.target.value.replace(/\D/g, ""))}
                    aria-label="Até o compasso"
                  />
                  <button type="submit" disabled={!barFrom}>
                    Usar
                  </button>
                </form>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={state.loop}
                    onChange={(e) => score.setLoop(e.target.checked)}
                    disabled={!state.range}
                  />
                  Repetir o trecho
                </label>
                <label className="check" title="No modo Tocar junto">
                  <input
                    type="checkbox"
                    checked={p.ramp}
                    onChange={(e) => practice.set("ramp", e.target.checked)}
                  />
                  Subir o andamento a cada volta limpa (60% → 100%)
                </label>
                {state.range && (
                  <button
                    className="link"
                    onClick={() => {
                      score.setRange(null);
                      score.setLoop(false);
                      setDrill(null);
                    }}
                  >
                    Limpar trecho
                  </button>
                )}
                <div className="sections">
                  <h4>Seções</h4>
                  {sections.length === 0 && (
                    <p className="muted small">
                      Escolha um trecho e dê um nome (Introdução, Refrão, parte difícil…) para
                      voltar a ele com um clique.
                    </p>
                  )}
                  {sections.map((s) => (
                    <div key={`${s.mine}:${s.from}:${s.name}`} className="section-row">
                      <button
                        className={
                          rangeBars && rangeBars.from === s.from && rangeBars.to === s.to
                            ? "facet on"
                            : "facet"
                        }
                        onClick={() => selectBars(s.from + 1, s.to + 1)}
                      >
                        {s.name}
                        <span>{sectionLabel(s)}</span>
                      </button>
                      {s.mine && (
                        <button
                          className="icon-button"
                          title="Apagar seção"
                          aria-label={`Apagar a seção ${s.name}`}
                          onClick={() => removeSection(s)}
                        >
                          <Icon name="close" size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {rangeBars && currentSong && !rangeSection && (
                    <form
                      className="row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveSection();
                      }}
                    >
                      <input
                        value={sectionName}
                        onChange={(e) => setSectionName(e.target.value)}
                        placeholder="Nome do trecho (ex.: Refrão)"
                        aria-label="Nome da seção"
                        maxLength={40}
                      />
                      <button type="submit" disabled={!sectionName.trim()}>
                        Salvar seção
                      </button>
                    </form>
                  )}
                </div>
                <div className="worst">
                  <h4>Onde você mais erra</h4>
                  {worst.length === 0 ? (
                    <p className="muted small">
                      Pratique em Esperar ou Tocar junto: os compassos com mais erros aparecem aqui.
                    </p>
                  ) : (
                    <>
                      {worst.map((seg) => (
                        <button
                          key={seg.from}
                          className="facet"
                          onClick={() => selectBars(seg.from + 1, seg.to + 1)}
                        >
                          {seg.from === seg.to
                            ? `Compasso ${seg.from + 1}`
                            : `Compassos ${seg.from + 1}–${seg.to + 1}`}
                          <span>{Math.round(seg.rate * 100)}% de erro</span>
                        </button>
                      ))}
                      <button className="primary" onClick={startDrill} disabled={!state.ready}>
                        Treinar os piores trechos
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Popover>
            <button
              className={showErrors ? "ghost active" : "ghost"}
              onClick={() => setShowErrors((v) => !v)}
              title="Colorir os compassos pela quantidade de erros"
            >
              <Icon name="heat" size={17} />
              Mapa de erros
            </button>
            {p.mode === "play" && !video && (
              <>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={p.metronome}
                    onChange={(e) => practice.set("metronome", e.target.checked)}
                  />
                  Metrônomo
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={p.countIn}
                    onChange={(e) => practice.set("countIn", e.target.checked)}
                  />
                  Contagem
                </label>
              </>
            )}
            {practicing ? (
              <div className="stats" aria-live="polite">
                <span className={`feedback ${p.last?.verdict ?? ""}`}>
                  {p.finished ? "Fim da música!" : describe(p.last)}
                </span>
                {state.loop && state.range && p.running && (
                  <span className="pass" title={p.passMessage ?? undefined}>
                    {drill && `Trecho ${drill.index + 1}/${drill.segments.length} · `}
                    Volta {p.passes + 1} · {speed}%
                  </span>
                )}
                {state.loop && state.range && p.running && p.passMessage && (
                  <span className="pass-message">{p.passMessage}</span>
                )}
                <span className="score-points" title="Pontos de 0 a 100">
                  {points(p.tally)}
                </span>
                <span title="Precisão">{accuracy(p.tally)}%</span>
                <span className="good" title="Certas">
                  {p.tally.hit} certas
                </span>
                {p.mode === "play" && (
                  <span className="off" title="Adiantadas e atrasadas">
                    {p.tally.early + p.tally.late} fora do tempo
                  </span>
                )}
                <span className="bad" title="Erradas e perdidas">
                  {p.tally.wrong + p.tally.miss} erros
                </span>
              </div>
            ) : (
              <p className="hint muted">
                {p.mode === "listen" &&
                  "Escolha Esperar ou Tocar junto para praticar com correção."}
              </p>
            )}
          </section>
        </>
      )}

      {(error || notice) && (
        <div className="toasts">
          {error && (
            <div className="toast error" role="alert">
              {error}
              <button
                className="icon-button"
                onClick={() => setError(null)}
                aria-label="Fechar aviso"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              {notice}
              <button
                className="icon-button"
                onClick={() => setNotice(null)}
                aria-label="Fechar aviso"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      <div
        className={[
          "workspace",
          view === "score" ? "" : "covered",
          falling && state.tracks.length > 0 ? "falling" : "",
        ].join(" ")}
      >
        <section className="score" ref={score.scrollRef}>
          {state.tracks.length === 0 && (
            <div className="empty">
              <Icon name="score" size={40} />
              <h2>Nenhuma partitura aberta</h2>
              <p className="muted">
                Escolha uma da biblioteca, abra um arquivo ou busque uma nova.
              </p>
              <div className="row">
                <button className="primary" onClick={() => setView("library")}>
                  Ir para a biblioteca
                </button>
                <button onClick={chooseScore} disabled={busy}>
                  Abrir arquivo…
                </button>
                <button onClick={() => setView("search")}>Buscar partituras</button>
              </div>
            </div>
          )}
          <div className="score-surface">
            <div ref={score.containerRef} />
            {showErrors && (
              <ErrorOverlay
                api={score.apiRef.current}
                bars={errorBars}
                renderVersion={state.renderVersion}
              />
            )}
          </div>
        </section>

        {falling && view === "score" && state.tracks.length > 0 && (
          <FallingNotes
            apiRef={score.apiRef}
            anchorRef={score.scrollRef}
            timeline={timeline}
            tempo={state.tempo}
            speed={speed / 100}
            hands={practicing ? p.hands : null}
            fingering={fingerMap}
          />
        )}

        {video && (
          <VideoPanel
            key={video.id}
            videoId={video.id}
            points={video.sync}
            bars={barsInPlayOrder}
            currentTick={() => score.apiRef.current?.tickPosition ?? 0}
            onReady={(handler) => score.setMedia(handler, video.sync)}
            onTime={score.updateMediaTime}
            onPlaying={() => undefined}
            onPoints={(sync) => {
              saveVideo({ id: video.id, sync });
              score.setSyncPoints(sync);
            }}
            onError={setError}
            onClose={disconnectVideo}
          />
        )}

        <section className="stage">
          <div className="indicators">
            <span className={sustain ? "pill on" : "pill"}>Pedal</span>
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
              recorder.capture({ type: "noteOn", key: k, velocity: MOUSE_VELOCITY });
              setKey(k, MOUSE_VELOCITY);
              api.playNote(k, MOUSE_VELOCITY);
              practice.onNote(k);
            }}
            onRelease={(k) => {
              recorder.capture({ type: "noteOff", key: k });
              setKey(k, null);
              api.playNote(k, 0);
            }}
          />
        </section>

        {view === "library" && (
          <div className="layer">
            <Library
              songs={library.songs}
              currentId={currentId}
              busy={busy}
              onOpen={(song) => run(() => openSong(song))}
              onImport={addToLibrary}
              onSearch={() => setView("search")}
              onSongChanged={library.put}
              onError={setError}
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

        {view === "reading" && (
          <div className="layer">
            <ReadingTrainer registerNoteHandler={registerReading} onError={setError} />
          </div>
        )}

        {view === "technique" && (
          <div className="layer">
            <Technique
              songs={library.songs}
              busy={busy}
              onPractice={practiceExercise}
              onOpenSong={(song) => run(() => openSong(song))}
            />
          </div>
        )}

        {view === "progress" && (
          <div className="layer">
            <Progress
              songs={library.songs}
              version={practiceVersion}
              onOpenSong={(song) => run(() => openSong(song))}
            />
          </div>
        )}

        {view === "search" && (
          <div className="layer">
            <Search
              downloads={downloads}
              log={searchLog}
              onOpenUrl={(url) => run(() => api.openSearch(url))}
              onImportUrl={(url) =>
                run(async () => {
                  const song = await api.searchImportUrl(url);
                  setDownloads((list) => [{ type: "imported", song }, ...list]);
                  library.refresh();
                  setNotice(`"${song.title}" entrou na biblioteca`);
                })
              }
              busy={busy}
              onAddCollection={(name) =>
                run(async () => {
                  const r = await api.library.importCollection(name);
                  await library.refresh();
                  setNotice(
                    r.added > 0
                      ? `${r.added} partituras adicionadas${r.existing ? ` (${r.existing} já estavam na biblioteca)` : ""}`
                      : "Todas as partituras dessa coleção já estão na biblioteca",
                  );
                })
              }
              onOpenSong={(song) => run(() => openSong(song))}
            />
          </div>
        )}
      </div>

      {showSettings && (
        <Settings
          status={status}
          ports={ports}
          selected={selected}
          busy={busy}
          onSelect={setSelected}
          onRefresh={() => run(async () => void (await refreshPorts()))}
          onConnect={connect}
          onDisconnect={disconnect}
          onKeyboardSound={toggleKeyboardSound}
          onChooseSoundfont={chooseSoundfont}
          onUseDefaultSoundfont={resetSoundfont}
          onUseSoundfont={openSoundfont}
          onDownloadSoundfont={downloadSoundfont}
          sound={sound}
          latency={latency}
          onLatency={changeLatency}
          registerTap={registerCalibration}
          onError={setError}
          onNotice={setNotice}
          screen={screen}
          theme={theme}
          onClose={() => setShowSettings(false)}
          updates={updates}
        />
      )}
    </div>
  );
}

export default App;
