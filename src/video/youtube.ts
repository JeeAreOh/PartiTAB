/**
 * Player do YouTube (IFrame API) como mídia externa do alphaTab: o vídeo
 * manda no tempo e a partitura acompanha.
 */

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlaybackRate(): number;
  setPlaybackRate(rate: number): void;
  getVolume(): number;
  setVolume(volume: number): void;
  getPlayerState(): number;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLIFrameElement,
    options: {
      events: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("Sem conexão com o YouTube"));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

/** Erros do player do YouTube, em português. */
export function youtubeError(code: number): string {
  switch (code) {
    case 2:
      return "Link de vídeo inválido";
    case 5:
      return "O vídeo não pode ser tocado neste player";
    case 100:
      return "Vídeo não encontrado ou privado";
    case 101:
    case 150:
      return "O dono do vídeo não permite tocar fora do YouTube; tente outra versão";
    case 152:
    case 153:
      return "O YouTube recusou o player embutido (configuração de origem)";
    default:
      return `Erro do YouTube (${code})`;
  }
}

/** O que o alphaTab precisa (IExternalMediaHandler). */
export interface MediaHandler {
  readonly backingTrackDuration: number;
  playbackRate: number;
  masterVolume: number;
  seekTo(time: number): void;
  play(): void;
  pause(): void;
}

export interface VideoController {
  handler: MediaHandler;
  /** Tempo atual do vídeo em ms. */
  currentTime(): number;
  destroy(): void;
}

/**
 * Cria o player no iframe dado. `onTime` recebe o tempo do vídeo (ms) a
 * cada ~40 ms enquanto toca; `onState` diz se está tocando.
 */
export async function createVideo(
  iframe: HTMLIFrameElement,
  callbacks: {
    onTime: (ms: number) => void;
    onState: (playing: boolean) => void;
    onError: (message: string) => void;
  },
): Promise<VideoController> {
  const YT = await loadApi();
  let timer: number | undefined;
  const tick = () => callbacks.onTime(player.getCurrentTime() * 1000);

  const player: YTPlayer = await new Promise((resolve) => {
    const p = new YT.Player(iframe, {
      events: {
        onReady: () => resolve(p),
        onStateChange: (e) => {
          const playing = e.data === YT.PlayerState.PLAYING;
          window.clearInterval(timer);
          if (playing) timer = window.setInterval(tick, 40);
          tick();
          callbacks.onState(playing);
        },
        onError: (e) => callbacks.onError(youtubeError(e.data)),
      },
    });
  });

  const handler: MediaHandler = {
    get backingTrackDuration() {
      return player.getDuration() * 1000;
    },
    get playbackRate() {
      return player.getPlaybackRate();
    },
    set playbackRate(value: number) {
      player.setPlaybackRate(value);
    },
    get masterVolume() {
      return player.getVolume() / 100;
    },
    set masterVolume(value: number) {
      player.setVolume(Math.round(value * 100));
    },
    seekTo: (ms) => {
      player.seekTo(ms / 1000, true);
      callbacks.onTime(ms);
    },
    play: () => player.playVideo(),
    pause: () => player.pauseVideo(),
  };

  return {
    handler,
    currentTime: () => player.getCurrentTime() * 1000,
    destroy: () => {
      window.clearInterval(timer);
      player.destroy();
    },
  };
}

/** Endereço do iframe; a origem vai junto para o YouTube aceitar o player embutido. */
export const embedUrl = (id: string) =>
  `https://www.youtube.com/embed/${id}?enablejsapi=1&controls=0&disablekb=1&rel=0&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`;
