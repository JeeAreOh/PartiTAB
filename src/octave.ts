/**
 * Oitava no nome das notas, como a Yamaha (e o costume no Brasil) escreve: o
 * dó central (MIDI 60) é C3/Dó3. Na nomenclatura científica ele seria C4.
 */
export const octaveName = (key: number) => Math.floor(key / 12) - 2;
