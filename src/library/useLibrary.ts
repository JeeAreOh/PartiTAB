import { useCallback, useEffect, useState } from "react";
import * as alphaTab from "@coderline/alphatab";
import { api, type Attempt, type Song, type SongPatch } from "../api";
import type { Level } from "../reducer/reduce";
import type { SyncPoint } from "../video/sync";

/** Preferências guardadas por música, para reabrir do jeito que estava. */
export interface SongPrefs {
  /** 0 = partitura original. */
  level?: 0 | Level;
  melody?: number | null;
  transpose?: boolean;
  track?: number | null;
  /** Vídeo do YouTube sincronizado com a partitura. */
  video?: { id: string; sync: SyncPoint[] } | null;
}

export function parsePrefs(song: Song | null): SongPrefs {
  try {
    return song ? (JSON.parse(song.prefs) as SongPrefs) : {};
  } catch {
    return {};
  }
}

/** Título e artista lidos do próprio arquivo, sem desenhar. */
export function readMetadata(data: Uint8Array): { title: string; artist: string } | null {
  try {
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(data, new alphaTab.Settings());
    return { title: score.title.trim(), artist: score.artist.trim() };
  } catch {
    return null;
  }
}

export function useLibrary(onError: (message: string) => void) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSongs(await api.library.list());
    } catch (e) {
      onError(String(e));
    } finally {
      setLoaded(true);
    }
  }, [onError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Atualiza (ou acrescenta) uma música na lista local. */
  const put = useCallback((song: Song) => {
    setSongs((list) => {
      const i = list.findIndex((s) => s.id === song.id);
      if (i === -1) return [...list, song];
      const next = [...list];
      next[i] = song;
      return next;
    });
    return song;
  }, []);

  const importFile = useCallback(
    async (path: string, meta?: { title: string; artist: string } | null) =>
      put(await api.library.import(path, meta?.title || undefined, meta?.artist || undefined)),
    [put],
  );

  const importBytes = useCallback(
    async (fileName: string, data: Uint8Array, title: string, artist: string) =>
      put(await api.library.importBytes(fileName, data, title, artist)),
    [put],
  );

  const update = useCallback(
    async (id: number, patch: SongPatch) => {
      try {
        put(await api.library.update(id, patch));
      } catch (e) {
        onError(String(e));
      }
    },
    [put, onError],
  );

  const remove = useCallback(
    async (id: number) => {
      try {
        await api.library.remove(id);
        setSongs((list) => list.filter((s) => s.id !== id));
      } catch (e) {
        onError(String(e));
      }
    },
    [onError],
  );

  const recordAttempt = useCallback(
    async (attempt: Attempt) => {
      try {
        put(await api.library.recordAttempt(attempt));
      } catch (e) {
        onError(String(e));
      }
    },
    [put, onError],
  );

  const setAutoDifficulty = useCallback(
    async (id: number, difficulty: number) => {
      try {
        put(await api.library.setAutoDifficulty(id, difficulty));
      } catch {
        /* a estimativa pode ficar para a próxima abertura */
      }
    },
    [put],
  );

  return {
    songs,
    loaded,
    refresh,
    importFile,
    importBytes,
    update,
    remove,
    recordAttempt,
    setAutoDifficulty,
  };
}
