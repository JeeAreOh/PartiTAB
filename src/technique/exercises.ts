// Exercícios de técnica (escalas, arpejos, cadências) gerados como MusicXML
// para piano, com o dedilhado tradicional. Entram na biblioteca como qualquer
// partitura: modo espera, rampa de andamento e progresso funcionam igual.
//
// Dedilhado das escalas: em cada tonalidade o polegar cai sempre nos mesmos
// graus (ex.: Dó maior, mão direita: Dó e Fá). Os outros dedos contam a partir
// do polegar: na mão direita, subindo, 2-3 ou 2-3-4 depois dele; na esquerda,
// descendo até ele. Isso reproduz o dedilhado dos métodos de escala.

import { DIVISIONS, writeMusicXml, type XmlNote } from "../midi/musicxml";

export type Kind = "scale" | "arpeggio" | "cadence";
export type Mode = "major" | "harmonic" | "natural";
export type Hands = "right" | "left" | "both";
export type Figure = 4 | 8 | 16; // semínima, colcheia, semicolcheia

export interface Exercise {
  kind: Kind;
  /** Tônica (0 = Dó … 11 = Si). */
  tonic: number;
  mode: Mode;
  hands: Hands;
  octaves: 1 | 2;
  figure: Figure;
  bpm: number;
}

interface KeyInfo {
  /** Nome em português, com a grafia da armadura. */
  name: string;
  fifths: number;
  /** Graus do polegar: mão direita e esquerda. */
  rh: number[];
  lh: number[];
}

// Tonalidades maiores, por tônica (pc).
const MAJOR: Record<number, KeyInfo> = {
  0: { name: "Dó", fifths: 0, rh: [0, 3], lh: [0, 4] },
  7: { name: "Sol", fifths: 1, rh: [0, 3], lh: [0, 4] },
  2: { name: "Ré", fifths: 2, rh: [0, 3], lh: [0, 4] },
  9: { name: "Lá", fifths: 3, rh: [0, 3], lh: [0, 4] },
  4: { name: "Mi", fifths: 4, rh: [0, 3], lh: [0, 4] },
  11: { name: "Si", fifths: 5, rh: [0, 3], lh: [0, 3] },
  6: { name: "Fá♯", fifths: 6, rh: [3, 6], lh: [3, 6] },
  1: { name: "Ré♭", fifths: -5, rh: [2, 6], lh: [2, 6] },
  8: { name: "Lá♭", fifths: -4, rh: [2, 5], lh: [2, 6] },
  3: { name: "Mi♭", fifths: -3, rh: [1, 5], lh: [2, 6] },
  10: { name: "Si♭", fifths: -2, rh: [1, 4], lh: [2, 6] },
  5: { name: "Fá", fifths: -1, rh: [0, 4], lh: [0, 4] },
};

// Tonalidades menores (dedilhado da menor harmônica, que vale para a natural).
const MINOR: Record<number, KeyInfo> = {
  9: { name: "Lá", fifths: 0, rh: [0, 3], lh: [0, 4] },
  4: { name: "Mi", fifths: 1, rh: [0, 3], lh: [0, 4] },
  11: { name: "Si", fifths: 2, rh: [0, 3], lh: [0, 3] },
  6: { name: "Fá♯", fifths: 3, rh: [2, 5], lh: [3, 6] },
  1: { name: "Dó♯", fifths: 4, rh: [2, 5], lh: [2, 6] },
  8: { name: "Sol♯", fifths: 5, rh: [2, 5], lh: [2, 5] },
  3: { name: "Mi♭", fifths: -6, rh: [1, 5], lh: [1, 5] },
  10: { name: "Si♭", fifths: -5, rh: [1, 4], lh: [1, 4] },
  5: { name: "Fá", fifths: -4, rh: [0, 4], lh: [0, 4] },
  0: { name: "Dó", fifths: -3, rh: [0, 3], lh: [0, 4] },
  7: { name: "Sol", fifths: -2, rh: [0, 3], lh: [0, 4] },
  2: { name: "Ré", fifths: -1, rh: [0, 3], lh: [0, 4] },
};

export const keyName = (tonic: number, mode: Mode) =>
  `${(mode === "major" ? MAJOR : MINOR)[tonic].name} ${mode === "major" ? "maior" : "menor"}`;

/** Ordem do círculo das quintas, para a lista de tonalidades. */
export const TONICS_MAJOR = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
export const TONICS_MINOR = [9, 4, 11, 6, 1, 8, 3, 10, 5, 0, 7, 2];

const STEPS: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  natural: [0, 2, 3, 5, 7, 8, 10],
};

const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = (key: number) => BLACK.has(key % 12);

/** Notas que sobem `octaves` oitavas a partir de `base`, com o grau de cada uma. */
function ascending(base: number, steps: number[], octaves: number) {
  const out: { key: number; degree: number }[] = [];
  for (let o = 0; o < octaves; o++) {
    steps.forEach((s, degree) => out.push({ key: base + 12 * o + s, degree }));
  }
  out.push({ key: base + 12 * octaves, degree: 0 });
  return out;
}

/**
 * Dedos de uma escala subindo (mão direita ou esquerda), pelos graus do polegar.
 * Descendo, cada nota usa o mesmo dedo.
 */
export function scaleFingers(degrees: number[], thumbs: number[], hand: "right" | "left") {
  const n = 7;
  const fingers = degrees.map((d) => {
    if (thumbs.includes(d)) return 1;
    let steps = 1;
    if (hand === "right") {
      while (!thumbs.includes((d - steps + n) % n)) steps++;
    } else {
      while (!thumbs.includes((d + steps) % n)) steps++;
    }
    return 1 + steps;
  });
  const last = fingers.length - 1;
  // Direita: o polegar no topo vira o dedo seguinte ao anterior (Dó maior termina no 5).
  if (hand === "right" && fingers[last] === 1) fingers[last] = fingers[last - 1] + 1;
  // Esquerda: o polegar na base vira o dedo seguinte ao de cima (Dó maior começa no 5).
  if (hand === "left" && fingers[0] === 1) fingers[0] = fingers[1] + 1;
  return fingers;
}

/** Dedos de um arpejo de tríade subindo (3 notas por oitava + a última). */
export function arpeggioFingers(keys: number[], hand: "right" | "left") {
  // O polegar fica numa tecla branca: a fundamental, ou a primeira branca do acorde.
  const tones = keys.slice(0, 3);
  const thumbIndex = Math.max(0, tones.findIndex((k) => !isBlack(k)));
  const isThumb = (i: number) => i % 3 === thumbIndex;
  const fingers = keys.map((_, i): number => (isThumb(i) ? 1 : 0));
  if (hand === "right") {
    // Depois do polegar: 2, e 3 (ou 4 se o salto for maior que uma terça maior).
    keys.forEach((k, i) => {
      if (fingers[i]) return;
      if (i > 0 && fingers[i - 1] === 1) fingers[i] = 2;
      else if (i > 0 && fingers[i - 1] === 2) fingers[i] = k - keys[i - 1] <= 4 ? 3 : 4;
      else fingers[i] = 2; // antes do primeiro polegar
    });
    if (isThumb(keys.length - 1)) fingers[keys.length - 1] = 5;
  } else {
    // Esquerda: depois do polegar, 4 e 2; antes do primeiro polegar, 4 e 2 até ele.
    const first = fingers.indexOf(1);
    for (let i = first - 1, f = 2; i >= 0; i--, f = 4) fingers[i] = f;
    keys.forEach((_, i) => {
      if (fingers[i]) return;
      fingers[i] = fingers[i - 1] === 1 ? 4 : 2;
    });
    if (fingers[0] === 1) fingers[0] = 5;
  }
  return fingers;
}

/** Sobe e desce: a sequência de notas e dedos, sem repetir o topo. */
const upDown = <T,>(list: T[]) => [...list, ...list.slice(0, -1).reverse()];

/** Notas de uma mão: tônica na oitava `octave` (4 = dó central). */
function handNotes(ex: Exercise, hand: "right" | "left", octave: number) {
  const base = 12 * (octave + 1) + ex.tonic;
  const info = (ex.mode === "major" ? MAJOR : MINOR)[ex.tonic];
  if (ex.kind === "scale") {
    const up = ascending(base, STEPS[ex.mode], ex.octaves);
    const fingers = scaleFingers(
      up.map((n) => n.degree),
      hand === "right" ? info.rh : info.lh,
      hand,
    );
    return { keys: upDown(up.map((n) => n.key)), fingers: upDown(fingers) };
  }
  const third = ex.mode === "major" ? 4 : 3;
  const up = ascending(base, [0, third, 7], ex.octaves).map((n) => n.key);
  return { keys: upDown(up), fingers: upDown(arpeggioFingers(up, hand)) };
}

/** Cadência I – IV – V – I: acordes na direita, baixo na esquerda. */
function cadence(ex: Exercise) {
  const t = 60 + ex.tonic;
  const minor = ex.mode !== "major";
  const third = minor ? 3 : 4;
  const sixth = minor ? 8 : 9;
  // Acordes fechados perto da tônica: I, IV (6/4), V (6), I.
  const right = [
    { keys: [t, t + third, t + 7], fingers: [1, 3, 5] },
    { keys: [t, t + 5, t + sixth], fingers: [1, 2, 5] },
    { keys: [t - 1, t + 2, t + 7], fingers: [1, 2, 5] },
    { keys: [t, t + third, t + 7], fingers: [1, 3, 5] },
  ];
  const bass = t - 12;
  const left = [
    { keys: [bass], fingers: [5] },
    { keys: [bass + 5], fingers: [2] },
    { keys: [bass + 7], fingers: [1] },
    { keys: [bass], fingers: [5] },
  ];
  return { right, left };
}

export function exerciseTitle(ex: Exercise) {
  const what =
    ex.kind === "scale"
      ? `Escala de ${keyName(ex.tonic, ex.mode)}${ex.mode === "harmonic" ? " harmônica" : ex.mode === "natural" ? " natural" : ""}`
      : ex.kind === "arpeggio"
        ? `Arpejo de ${keyName(ex.tonic, ex.mode)}`
        : `Cadência em ${keyName(ex.tonic, ex.mode)}`;
  const hands =
    ex.hands === "both" ? "mãos juntas" : ex.hands === "right" ? "mão direita" : "mão esquerda";
  const octaves = ex.kind === "cadence" ? "" : `, ${ex.octaves} oitava${ex.octaves > 1 ? "s" : ""}`;
  return `${what} (${hands}${octaves})`;
}

/** Gera o exercício como MusicXML de piano (duas pautas). */
export function exerciseXml(ex: Exercise): string {
  const bar = 4 * DIVISIONS;
  const staves: XmlNote[][] = [[], []];
  const hands = ex.hands === "both" ? (["right", "left"] as const) : ([ex.hands] as const);

  if (ex.kind === "cadence") {
    const { right, left } = cadence(ex);
    for (const hand of hands) {
      const chords = hand === "right" ? right : left;
      // Duas vezes, com um acorde por compasso.
      [...chords, ...chords].forEach((c, i) =>
        c.keys.forEach((key, j) =>
          staves[hand === "right" ? 0 : 1].push({
            start: i * bar,
            end: (i + 1) * bar,
            pitch: key,
            velocity: 80,
            finger: c.fingers[j],
          }),
        ),
      );
    }
  } else {
    const len = (4 * DIVISIONS) / ex.figure;
    for (const hand of hands) {
      // Direita a partir do dó central; esquerda uma oitava abaixo (duas, em 2 oitavas).
      const octave = hand === "right" ? 4 : ex.octaves === 2 ? 2 : 3;
      const { keys, fingers } = handNotes(ex, hand, octave);
      keys.forEach((key, i) => {
        const start = i * len;
        // A última nota completa o compasso.
        const end = i === keys.length - 1 ? Math.ceil((start + len) / bar) * bar : start + len;
        staves[hand === "right" ? 0 : 1].push({
          start,
          end,
          pitch: key,
          velocity: 80,
          finger: fingers[i],
        });
      });
    }
  }

  const info = (ex.mode === "major" ? MAJOR : MINOR)[ex.tonic];
  return writeMusicXml({
    title: exerciseTitle(ex),
    composer: "Técnica",
    software: "PartiTAB (exercício de técnica)",
    fifths: info.fifths,
    minor: ex.mode !== "major",
    timeSignatures: [{ unit: 0, num: 4, den: 4 }],
    tempos: [{ unit: 0, bpm: ex.bpm }],
    parts: [
      {
        name: "Piano",
        program: 0,
        staves: [
          { clef: "G", notes: staves[0] },
          { clef: "F", notes: staves[1] },
        ],
      },
    ],
  });
}
