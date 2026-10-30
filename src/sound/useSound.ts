import { useCallback, useEffect, useRef, useState } from "react";
import { api, type CatalogItem, type PresetInfo, type SoundSettings, type Status } from "../api";
import { parseSound, resolvePreset, toneKey } from "./tones";

const SOUND = "partitab.sound";
const FAVORITES = "partitab.toneFavorites";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* armazenamento indisponível: só perde a preferência */
  }
};

function readFavorites(): string[] {
  try {
    const list = JSON.parse(read(FAVORITES) ?? "[]");
    return Array.isArray(list) ? list.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

interface Options {
  status: Status | null;
  setStatus: (s: Status) => void;
  onError: (message: string) => void;
}

/** Timbre, volume, reverb e curva de toque do piano, mais o catálogo de SoundFonts. */
export function useSound({ status, setStatus, onError }: Options) {
  const [sound, setSound] = useState<SoundSettings>(() => parseSound(read(SOUND)));
  const [favorites, setFavorites] = useState<string[]>(readFavorites);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  /** Bytes baixados por item do catálogo, enquanto baixa. */
  const [downloads, setDownloads] = useState<Record<string, number>>({});
  const soundRef = useRef(sound);
  const audioReady = !!status?.audio;

  const apply = useCallback(
    (patch: Partial<SoundSettings>) => {
      const next = { ...soundRef.current, ...patch };
      soundRef.current = next;
      setSound(next);
      write(SOUND, JSON.stringify(next));
      api.setSound(next).then(setStatus, (e) => onError(String(e)));
    },
    [setStatus, onError],
  );

  // Com a saída de áudio pronta, envia os ajustes salvos.
  useEffect(() => {
    if (audioReady) apply({});
  }, [audioReady, apply]);

  // Outro SoundFont pode não ter o timbre escolhido: usa o equivalente.
  const presets = status?.presets;
  useEffect(() => {
    if (!presets?.length) return;
    const { bank, patch } = soundRef.current;
    const found = resolvePreset(presets, bank, patch);
    if (found && (found.bank !== bank || found.patch !== patch)) {
      apply({ bank: found.bank, patch: found.patch });
    }
  }, [presets, apply]);

  const choose = useCallback((p: PresetInfo) => apply({ bank: p.bank, patch: p.patch }), [apply]);

  const soundfont = status?.soundfont ?? null;
  const isFavorite = useCallback(
    (p: PresetInfo) => favorites.includes(toneKey(soundfont, p)),
    [favorites, soundfont],
  );
  const toggleFavorite = useCallback(
    (p: PresetInfo) => {
      const key = toneKey(soundfont, p);
      setFavorites((list) => {
        const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
        write(FAVORITES, JSON.stringify(next));
        return next;
      });
    },
    [soundfont],
  );

  const refreshCatalog = useCallback(() => {
    api.sounds.catalog().then(setCatalog, (e) => onError(String(e)));
  }, [onError]);

  useEffect(() => {
    const unlisten = api.sounds.onProgress((e) =>
      setDownloads((d) => (e.id in d ? { ...d, [e.id]: e.done } : d)),
    );
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  /** Baixa um item do catálogo e devolve o caminho do arquivo. */
  const download = useCallback(
    async (id: string) => {
      setDownloads((d) => ({ ...d, [id]: 0 }));
      try {
        const path = await api.sounds.download(id);
        refreshCatalog();
        return path;
      } finally {
        setDownloads(({ [id]: _, ...rest }) => rest);
      }
    },
    [refreshCatalog],
  );

  const remove = useCallback(
    async (id: string) => {
      await api.sounds.remove(id);
      refreshCatalog();
    },
    [refreshCatalog],
  );

  const current = presets?.length ? resolvePreset(presets, sound.bank, sound.patch) : null;

  return {
    sound,
    current,
    apply,
    choose,
    isFavorite,
    toggleFavorite,
    catalog,
    refreshCatalog,
    downloads,
    download,
    remove,
  };
}

export type Sound = ReturnType<typeof useSound>;
