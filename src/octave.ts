/**
 * Oitava no nome das notas. Padrão como a Yamaha (e o costume no Brasil): o
 * dó central (MIDI 60) é C3/Dó3. Na convenção científica (Alfred, ABRSM) ele
 * é C4/Dó4.
 */

export type OctaveNaming = "yamaha" | "scientific";

export const OCTAVE_NAMING_KEY = "partitab.octaveNaming";

function load(): OctaveNaming {
  try {
    return localStorage.getItem(OCTAVE_NAMING_KEY) === "scientific" ? "scientific" : "yamaha";
  } catch {
    return "yamaha";
  }
}

let naming: OctaveNaming = load();

export const getOctaveNaming = () => naming;

export function setOctaveNaming(value: OctaveNaming) {
  naming = value;
  try {
    localStorage.setItem(OCTAVE_NAMING_KEY, value);
  } catch {
    /* só perde a preferência */
  }
}

/** Número da oitava de `key` na convenção escolhida. */
export const octaveName = (key: number, convention: OctaveNaming = naming) =>
  Math.floor(key / 12) - (convention === "scientific" ? 1 : 2);
