// Seções da música (Introdução, Refrão, "parte difícil"…): as que vêm no
// arquivo (marcas de ensaio do Guitar Pro/MusicXML, marcadores do MIDI) e as
// que o aluno cria a partir de um trecho. Compassos contados a partir de 0.

import * as alphaTab from "@coderline/alphatab";

export interface SongSection {
  name: string;
  from: number;
  to: number;
}

interface MasterBarLike {
  section: { text: string; marker: string } | null;
}

/** Seções escritas na partitura: cada uma vai até a próxima (ou ao fim). */
export function fileSections(masterBars: MasterBarLike[]): SongSection[] {
  const starts: { name: string; from: number }[] = [];
  masterBars.forEach((bar, i) => {
    if (!bar.section) return;
    const name = (bar.section.text || bar.section.marker).replace(/\u00a0/g, " ").trim();
    if (name) starts.push({ name, from: i });
  });
  return starts.map((s, i) => ({
    ...s,
    to: (i + 1 < starts.length ? starts[i + 1].from : masterBars.length) - 1,
  }));
}

/** Escreve as seções do aluno na partitura, para aparecerem no desenho. */
export function applySections(score: alphaTab.model.Score, sections: SongSection[]) {
  for (const s of sections) {
    const bar = score.masterBars[s.from];
    if (!bar) continue;
    if (bar.section) {
      // Já há uma seção do arquivo nesse compasso: as duas aparecem.
      const current = bar.section.text || bar.section.marker;
      if (!current.includes(s.name)) bar.section.text = `${current} · ${s.name}`;
      continue;
    }
    const section = new alphaTab.model.Section();
    section.text = s.name;
    section.marker = "";
    bar.section = section;
  }
}

/** Lista para mostrar: do arquivo e do aluno, em ordem de compasso. */
export function mergeSections(file: SongSection[], mine: SongSection[]) {
  return [
    ...file.map((s) => ({ ...s, mine: false })),
    ...mine.map((s) => ({ ...s, mine: true })),
  ].sort((a, b) => a.from - b.from || a.to - b.to);
}

export const sectionLabel = (s: SongSection) =>
  s.from === s.to ? `compasso ${s.from + 1}` : `compassos ${s.from + 1}–${s.to + 1}`;
