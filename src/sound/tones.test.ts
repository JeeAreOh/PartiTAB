import { describe, expect, it } from "vitest";
import {
  formatSize,
  groupPresets,
  parseSound,
  resolvePreset,
  toneKey,
  DEFAULT_SOUND,
} from "./tones";

const presets = [
  { bank: 0, patch: 0, name: "Grand Piano" },
  { bank: 0, patch: 4, name: "Rhodes EP" },
  { bank: 0, patch: 19, name: "Church Organ" },
  { bank: 0, patch: 48, name: "Strings" },
  { bank: 8, patch: 4, name: "Chorused Rhodes" },
];

describe("timbres", () => {
  it("agrupa por família GM, com as variações no fim", () => {
    const groups = groupPresets(presets);
    expect(groups.map((g) => g.name)).toEqual(["Pianos", "Órgãos", "Conjuntos", "Variações"]);
    expect(groups[0].items.map((p) => p.name)).toEqual(["Grand Piano", "Rhodes EP"]);
  });

  it("filtra pelo nome do timbre ou da família, sem acento", () => {
    expect(groupPresets(presets, "rhodes").flatMap((g) => g.items.map((p) => p.name))).toEqual([
      "Rhodes EP",
      "Chorused Rhodes",
    ]);
    expect(groupPresets(presets, "orgaos")[0].items[0].name).toBe("Church Organ");
    expect(groupPresets(presets, "nada")).toEqual([]);
  });

  it("encontra o timbre salvo ou um equivalente", () => {
    expect(resolvePreset(presets, 8, 4)?.name).toBe("Chorused Rhodes");
    expect(resolvePreset(presets, 3, 48)?.name).toBe("Strings");
    expect(resolvePreset(presets, 0, 100)?.name).toBe("Grand Piano");
    expect(resolvePreset([], 0, 0)).toBeNull();
  });

  it("favoritos valem por SoundFont", () => {
    expect(toneKey("C:\\sf\\GeneralUser-GS.sf2", { bank: 0, patch: 4 })).toBe(
      "GeneralUser-GS.sf2|0:4",
    );
    expect(toneKey("/a/b.sf2", presets[0])).not.toBe(toneKey("/a/c.sf2", presets[0]));
  });

  it("lê ajustes salvos com segurança", () => {
    expect(parseSound(null)).toEqual(DEFAULT_SOUND);
    expect(parseSound("{lixo")).toEqual(DEFAULT_SOUND);
    expect(
      parseSound(JSON.stringify({ bank: 8, patch: 4, volume: 300, reverb: -5, curve: "heavy" })),
    ).toEqual({ bank: 8, patch: 4, volume: 100, reverb: 0, curve: "heavy" });
    expect(parseSound(JSON.stringify({ curve: "?" })).curve).toBe("normal");
  });

  it("formata tamanhos", () => {
    expect(formatSize(32_319_396)).toBe("31 MB");
    expect(formatSize(5000)).toBe("5 KB");
  });
});
