import { staffStep, type Card } from "./cards";

/** Glifos SMuFL da fonte Bravura (a mesma que o alphaTab usa). */
const GLYPH = {
  gClef: "",
  fClef: "",
  wholeNote: "",
  sharp: "",
  flat: "",
};

const GAP = 16; // distância entre linhas
const WIDTH = 300;
const BOTTOM = 150; // y da linha de baixo
const NOTE_X = 190;

const yOf = (step: number) => BOTTOM - (step * GAP) / 2;

/** Uma nota numa pauta de cinco linhas, desenhada em SVG. */
export function NoteCard({ card, state }: { card: Card; state?: "good" | "bad" | null }) {
  const step = staffStep(card);
  const ledgers: number[] = [];
  for (let s = -2; s >= step; s -= 2) ledgers.push(s);
  for (let s = 10; s <= step; s += 2) ledgers.push(s);
  const clefStep = card.clef === "treble" ? 2 : 6; // linha do Sol / do Fá

  return (
    <svg
      className={`note-card ${state ?? ""}`}
      data-key={card.key}
      viewBox={`0 0 ${WIDTH} 230`}
      role="img"
      aria-label={card.clef === "treble" ? "Nota na clave de sol" : "Nota na clave de fá"}
    >
      {[0, 2, 4, 6, 8].map((s) => (
        <line key={s} x1={16} x2={WIDTH - 16} y1={yOf(s)} y2={yOf(s)} className="staff-line" />
      ))}
      {ledgers.map((s) => (
        <line
          key={`l${s}`}
          x1={NOTE_X - 14}
          x2={NOTE_X + 34}
          y1={yOf(s)}
          y2={yOf(s)}
          className="staff-line"
        />
      ))}
      <text x={26} y={yOf(clefStep)} className="smufl" fontSize={GAP * 4}>
        {card.clef === "treble" ? GLYPH.gClef : GLYPH.fClef}
      </text>
      {card.accidental && (
        <text x={NOTE_X - 26} y={yOf(step)} className="smufl" fontSize={GAP * 4}>
          {card.accidental === "sharp" ? GLYPH.sharp : GLYPH.flat}
        </text>
      )}
      <text x={NOTE_X} y={yOf(step)} className="smufl note-head" fontSize={GAP * 4}>
        {GLYPH.wholeNote}
      </text>
    </svg>
  );
}
