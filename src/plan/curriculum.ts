/**
 * O plano de estudo de 12 meses como dados: o que cada mês pede em técnica,
 * leitura, ritmo, repertório e teoria. A aba Plano monta a sessão do dia a
 * partir daqui.
 */

import type { Exercise } from "../technique/exercises";

export type Phase = 1 | 2 | 3 | 4;

export interface Repertoire {
  title: string;
  /** Trechos de título que encontram a peça na biblioteca (sem acento, minúsculas). */
  match: string[];
  /** Vem com o app (coleção MuseTrainer) ou precisa ser importada. */
  included: boolean;
}

export interface Month {
  index: number;
  phase: Phase;
  title: string;
  technique: Partial<Exercise>[];
  sightLevel: number;
  rhythmLevel: number;
  reading: {
    clefs: "treble" | "bass" | "both";
    range: "staff" | "ledger";
    patterns?: "interval" | "triad";
  };
  repertoire: Repertoire[];
  theory: string[];
}

export const PHASES: Record<Phase, string> = {
  1: "Fundamentos",
  2: "Mãos juntas",
  3: "Leitura por padrões",
  4: "Repertório e autonomia",
};

const scale = (tonic: number, extra: Partial<Exercise> = {}): Partial<Exercise> => ({
  kind: "scale",
  tonic,
  mode: "major",
  hands: "right",
  octaves: 1,
  figure: 8,
  bpm: 60,
  ...extra,
});

export const CURRICULUM: Month[] = [
  {
    index: 1,
    phase: 1,
    title: "Clave de sol, posição de Dó",
    technique: [{ kind: "position", tonic: 0, mode: "major", hands: "right", figure: 4, bpm: 60 }],
    sightLevel: 1,
    rhythmLevel: 1,
    reading: { clefs: "treble", range: "staff" },
    repertoire: [{ title: "Ode à Alegria (fácil)", match: ["ode a alegria"], included: true }],
    theory: [
      "Pauta, clave de sol e as notas da posição de Dó",
      "Semibreve, mínima e semínima",
      "Compasso 4/4: contar 1-2-3-4",
    ],
  },
  {
    index: 2,
    phase: 1,
    title: "Clave de fá, mão esquerda",
    technique: [{ kind: "position", tonic: 0, mode: "major", hands: "left", figure: 4, bpm: 60 }],
    sightLevel: 2,
    rhythmLevel: 2,
    reading: { clefs: "bass", range: "staff" },
    repertoire: [],
    theory: ["Clave de fá e as notas da mão esquerda", "Pausas", "Compasso 3/4"],
  },
  {
    index: 3,
    phase: 1,
    title: "Grande pauta, posições de Sol e Fá",
    technique: [
      { kind: "position", tonic: 7, mode: "major", hands: "both", figure: 4, bpm: 60 },
      { kind: "position", tonic: 5, mode: "major", hands: "both", figure: 4, bpm: 60 },
    ],
    sightLevel: 3,
    rhythmLevel: 3,
    reading: { clefs: "both", range: "staff" },
    repertoire: [
      {
        title: "Minueto em Sol maior (versão fácil)",
        match: ["minueto em sol maior (versao 2)"],
        included: true,
      },
    ],
    theory: ["Grande pauta", "Colcheias em pares", "Sol maior: o Fá sustenido"],
  },
  {
    index: 4,
    phase: 2,
    title: "Escala de Dó e linhas suplementares",
    technique: [scale(0), scale(0, { hands: "left" })],
    sightLevel: 4,
    rhythmLevel: 4,
    reading: { clefs: "both", range: "ledger" },
    repertoire: [],
    theory: ["Escala maior: tons e semitons", "Mínima pontuada", "Linhas suplementares"],
  },
  {
    index: 5,
    phase: 2,
    title: "Escalas de Sol e Fá",
    technique: [scale(7), scale(7, { hands: "left" }), scale(5), scale(5, { hands: "left" })],
    sightLevel: 4,
    rhythmLevel: 4,
    reading: { clefs: "both", range: "ledger" },
    repertoire: [],
    theory: ["Armaduras de Sol e Fá maior", "Ciclo das quintas até 1 acidente"],
  },
  {
    index: 6,
    phase: 2,
    title: "Mãos juntas e arpejos",
    technique: [
      scale(0, { hands: "both" }),
      scale(7, { hands: "both" }),
      { kind: "arpeggio", tonic: 0, mode: "major", hands: "right", octaves: 1, figure: 8, bpm: 60 },
    ],
    sightLevel: 5,
    rhythmLevel: 5,
    reading: { clefs: "both", range: "ledger" },
    repertoire: [
      { title: "Minueto em Sol maior, BWV Anh. 114", match: ["bwv anh. 114"], included: true },
    ],
    theory: ["6/8 e semínima pontuada", "Ligadura de valor", "Acidentes ocorrentes"],
  },
  {
    index: 7,
    phase: 3,
    title: "Escalas de 2 oitavas e intervalos",
    technique: [
      scale(0, { hands: "both", octaves: 2, bpm: 66 }),
      scale(7, { hands: "both", octaves: 2, bpm: 66 }),
      scale(5, { hands: "both", octaves: 2, bpm: 66 }),
    ],
    sightLevel: 6,
    rhythmLevel: 6,
    reading: { clefs: "both", range: "ledger", patterns: "interval" },
    repertoire: [
      { title: "Clementi, Sonatina Op. 36 nº 1", match: ["clementi", "op. 36"], included: false },
    ],
    theory: ["Intervalos: número e qualidade", "Semicolcheias", "Tons menores relativos"],
  },
  {
    index: 8,
    phase: 3,
    title: "Arpejos de 2 oitavas",
    technique: [
      { kind: "arpeggio", tonic: 0, mode: "major", hands: "both", octaves: 2, figure: 8, bpm: 60 },
      { kind: "arpeggio", tonic: 7, mode: "major", hands: "both", octaves: 2, figure: 8, bpm: 60 },
    ],
    sightLevel: 6,
    rhythmLevel: 6,
    reading: { clefs: "both", range: "ledger", patterns: "interval" },
    repertoire: [
      { title: "Minueto em Sol menor, BWV Anh. 115", match: ["bwv anh. 115"], included: false },
    ],
    theory: ["Tríades maiores e menores", "Baixo de Alberti"],
  },
  {
    index: 9,
    phase: 3,
    title: "Escalas menores harmônicas",
    technique: [
      scale(9, { mode: "harmonic", hands: "both", bpm: 66 }),
      scale(4, { mode: "harmonic", hands: "both", bpm: 66 }),
      scale(2, { mode: "harmonic", hands: "both", bpm: 66 }),
    ],
    sightLevel: 7,
    rhythmLevel: 7,
    reading: { clefs: "both", range: "ledger", patterns: "triad" },
    repertoire: [
      { title: "Uma música pop ou MPB (arranjo para piano, nível 3)", match: [], included: false },
    ],
    theory: ["Escala menor harmônica", "Inversões de tríades", "Síncope e tercina"],
  },
  {
    index: 10,
    phase: 4,
    title: "Tonalidades até 3 acidentes",
    technique: [
      scale(2, { hands: "both", octaves: 2, bpm: 80 }),
      scale(9, { hands: "both", octaves: 2, bpm: 80 }),
      scale(3, { hands: "both", octaves: 2, bpm: 80 }),
      scale(10, { hands: "both", octaves: 2, bpm: 80 }),
    ],
    sightLevel: 7,
    rhythmLevel: 7,
    reading: { clefs: "both", range: "ledger", patterns: "triad" },
    repertoire: [
      {
        title: "Schumann, Álbum para a Juventude Op. 68 nº 1",
        match: ["schumann", "op. 68"],
        included: false,
      },
    ],
    theory: ["Cadência I–IV–V–I", "Armaduras até 3 acidentes"],
  },
  {
    index: 11,
    phase: 4,
    title: "Manutenção e peça livre",
    technique: [
      { kind: "cadence", tonic: 0, mode: "major", hands: "both", bpm: 60 },
      scale(0, { hands: "both", octaves: 2, bpm: 80 }),
    ],
    sightLevel: 7,
    rhythmLevel: 7,
    reading: { clefs: "both", range: "ledger", patterns: "triad" },
    repertoire: [{ title: "Uma peça escolhida e aprendida sozinho", match: [], included: false }],
    theory: ["Como estudar uma peça nova: mãos separadas, trechos, andamento lento"],
  },
  {
    index: 12,
    phase: 4,
    title: "Revisão e recital",
    technique: [
      scale(0, { hands: "both", octaves: 2, bpm: 80 }),
      scale(9, { mode: "harmonic", hands: "both", octaves: 2, bpm: 80 }),
    ],
    sightLevel: 7,
    rhythmLevel: 7,
    reading: { clefs: "both", range: "ledger" },
    repertoire: [{ title: "Recital: 6 peças do ano", match: [], included: false }],
    theory: ["Revisão geral", "Preparar o recital: gravar e ouvir"],
  },
];

export const monthOf = (index: number): Month => CURRICULUM[Math.max(1, Math.min(12, index)) - 1];
