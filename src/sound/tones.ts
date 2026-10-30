import type { PresetInfo, SoundSettings, VelocityCurve } from "../api";
import { normalize } from "../library/filter";

/** Famílias General MIDI: cada uma ocupa 8 programas do banco 0. */
export const FAMILIES = [
  "Pianos",
  "Percussão cromática",
  "Órgãos",
  "Violões e guitarras",
  "Baixos",
  "Cordas",
  "Conjuntos",
  "Metais",
  "Palhetas",
  "Flautas",
  "Synth solo",
  "Synth pad",
  "Efeitos de synth",
  "Étnicos",
  "Percussivos",
  "Efeitos sonoros",
];
const VARIATIONS = "Variações";

export const CURVES: [VelocityCurve, string, string][] = [
  ["light", "Leve", "Toque leve já soa forte"],
  ["normal", "Normal", "Volume acompanha a força do toque"],
  ["heavy", "Pesada", "Precisa de mais força para soar forte"],
  ["fixed", "Fixa", "Todas as notas com o mesmo volume"],
];

export const DEFAULT_SOUND: SoundSettings = {
  bank: 0,
  patch: 0,
  volume: 50,
  reverb: 40,
  curve: "normal",
};

export const family = (p: PresetInfo) => (p.bank === 0 ? FAMILIES[p.patch >> 3] : VARIATIONS);

export interface PresetGroup {
  name: string;
  items: PresetInfo[];
}

/** Agrupa por família (na ordem GM, variações no fim), filtrando pela busca. */
export function groupPresets(presets: PresetInfo[], query = ""): PresetGroup[] {
  const q = normalize(query);
  const groups = new Map<string, PresetInfo[]>();
  for (const p of presets) {
    const name = family(p);
    if (q && !normalize(p.name).includes(q) && !normalize(name).includes(q)) continue;
    groups.set(name, [...(groups.get(name) ?? []), p]);
  }
  const order = [...FAMILIES, VARIATIONS];
  return order.filter((n) => groups.has(n)).map((name) => ({ name, items: groups.get(name)! }));
}

const fileName = (path: string | null) => (path ?? "").split(/[\\/]/).pop() ?? "";

/** Chave de favorito: o mesmo timbre em outro SoundFont é outro favorito. */
export const toneKey = (soundfont: string | null, p: { bank: number; patch: number }) =>
  `${fileName(soundfont)}|${p.bank}:${p.patch}`;

/** O timbre escolhido, ou o equivalente no banco 0, ou o primeiro do arquivo. */
export function resolvePreset(
  presets: PresetInfo[],
  bank: number,
  patch: number,
): PresetInfo | null {
  return (
    presets.find((p) => p.bank === bank && p.patch === patch) ??
    presets.find((p) => p.bank === 0 && p.patch === patch) ??
    presets[0] ??
    null
  );
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback;

/** Lê os ajustes salvos, descartando valores inválidos. */
export function parseSound(raw: string | null): SoundSettings {
  let data: Record<string, unknown> = {};
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") data = parsed;
  } catch {
    /* ajustes corrompidos: volta ao padrão */
  }
  const curve = CURVES.some(([c]) => c === data.curve)
    ? (data.curve as VelocityCurve)
    : DEFAULT_SOUND.curve;
  return {
    bank: clampInt(data.bank, 0, 127, DEFAULT_SOUND.bank),
    patch: clampInt(data.patch, 0, 127, DEFAULT_SOUND.patch),
    volume: clampInt(data.volume, 0, 100, DEFAULT_SOUND.volume),
    reverb: clampInt(data.reverb, 0, 127, DEFAULT_SOUND.reverb),
    curve,
  };
}

export const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${Math.round(bytes / (1024 * 1024))} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
