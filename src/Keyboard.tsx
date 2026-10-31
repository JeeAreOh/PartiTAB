import { useRef } from "react";
import { octaveName } from "./octave";

/** Faixa do PSR-E463: 61 teclas, C1 (36) a C6 (96), na nomenclatura da Yamaha. */
export const FIRST_KEY = 36;
export const LAST_KEY = 96;

const BLACK = new Set([1, 3, 6, 8, 10]);
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const isBlack = (key: number) => BLACK.has(key % 12);
export const noteName = (key: number) => `${NAMES[key % 12]}${octaveName(key)}`;

const WHITES: number[] = [];
for (let k = FIRST_KEY; k <= LAST_KEY; k++) if (!isBlack(k)) WHITES.push(k);

/** Posição e largura da tecla, em % da largura útil do teclado. */
export function keyGeometry(key: number): { left: number; width: number } {
  const whiteWidth = 100 / WHITES.length;
  const whitesBefore = WHITES.filter((w) => w < key).length;
  return isBlack(key)
    ? { left: whitesBefore * whiteWidth - whiteWidth * 0.3, width: whiteWidth * 0.6 }
    : { left: whitesBefore * whiteWidth, width: whiteWidth };
}

interface Props {
  /** Teclas pressionadas → velocidade (1–127). */
  pressed: Map<number, number>;
  /** Teclas que a partitura está tocando agora. */
  expected?: Set<number>;
  /** Retorno da correção: certa, fora do tempo ou errada. */
  flashes?: Map<number, "good" | "off" | "bad">;
  onPress: (key: number) => void;
  onRelease: (key: number) => void;
}

export function Keyboard({ pressed, expected, flashes, onPress, onRelease }: Props) {
  const mouseKey = useRef<number | null>(null);
  const whites: number[] = [];
  for (let k = FIRST_KEY; k <= LAST_KEY; k++) if (!isBlack(k)) whites.push(k);

  const press = (key: number) => {
    if (mouseKey.current === key) return;
    release();
    mouseKey.current = key;
    onPress(key);
  };
  const release = () => {
    if (mouseKey.current !== null) onRelease(mouseKey.current);
    mouseKey.current = null;
  };

  const keyProps = (key: number) => {
    const velocity = pressed.get(key);
    return {
      title: noteName(key),
      "data-down": velocity !== undefined,
      "data-score": expected?.has(key) ?? false,
      "data-flash": flashes?.get(key),
      style: velocity
        ? ({ "--vel": (0.35 + (0.65 * velocity) / 127).toFixed(2) } as React.CSSProperties)
        : undefined,
      onPointerDown: (e: React.PointerEvent) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        press(key);
      },
      onPointerEnter: (e: React.PointerEvent) => {
        if (e.buttons === 1) press(key);
      },
    };
  };

  return (
    <div className="keyboard" onPointerUp={release} onPointerLeave={release}>
      {whites.map((k) => (
        <div key={k} className="white" {...keyProps(k)}>
          {k % 12 === 0 && <span className="label">{noteName(k)}</span>}
        </div>
      ))}
      {Array.from({ length: LAST_KEY - FIRST_KEY + 1 }, (_, i) => FIRST_KEY + i)
        .filter(isBlack)
        .map((k) => {
          const { left, width } = keyGeometry(k);
          const props = keyProps(k);
          return (
            <div
              key={k}
              className="black"
              {...props}
              style={{
                ...props.style,
                left: `${left}%`,
                width: `${width}%`,
              }}
            />
          );
        })}
    </div>
  );
}
