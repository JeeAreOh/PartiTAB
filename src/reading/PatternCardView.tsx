import { stepOf, type PatternCard } from "./patterns";

/** Glifos SMuFL da fonte Bravura. */
const GLYPH = {
  gClef: "\ue050",
  fClef: "\ue062",
  wholeNote: "\ue0a2",
  sharp: "\ue262",
  flat: "\ue260",
};

const GAP = 16;
const WIDTH = 300;
const BOTTOM = 150;
const HEAD = 25; // largura da cabeça de semibreve
const yOf = (step: number) => BOTTOM - (step * GAP) / 2;

/**
 * Duas ou três notas na pauta. Harmônico: empilhadas (numa 2ª, a nota de cima
 * vai para a direita, como na grafia correta); melódico: lado a lado.
 */
export function PatternCardView({
  card,
  state,
  reveal,
}: {
  card: PatternCard;
  state?: "good" | "bad" | null;
  /** Mostra o nome do padrão (depois da resposta). */
  reveal?: boolean;
}) {
  const placed = card.notes.map((n) => ({ note: n, step: stepOf(card.clef, n), x: 0 }));
  if (card.harmonic) {
    const order = [...placed].sort((a, b) => a.step - b.step);
    let prevShifted = false;
    order.forEach((p, i) => {
      const shift = i > 0 && p.step - order[i - 1].step === 1 && !prevShifted;
      p.x = 180 + (shift ? HEAD : 0);
      prevShifted = shift;
    });
  } else {
    placed.forEach((p, i) => (p.x = 140 + i * 80));
  }

  // Acidentes: à esquerda da nota; no acorde, em colunas para não se tocarem.
  const accidentals: { x: number; step: number; glyph: string }[] = [];
  const withAcc = placed.filter((p) => p.note.alter !== 0).sort((a, b) => b.step - a.step);
  withAcc.forEach((p, i) => {
    const base = card.harmonic ? 180 : p.x;
    const column =
      card.harmonic && i > 0 && withAcc[i - 1].step - p.step < 6 ? (i % 2 === 1 ? 1 : 0) : 0;
    accidentals.push({
      x: base - 24 - column * 16,
      step: p.step,
      glyph: p.note.alter > 0 ? GLYPH.sharp : GLYPH.flat,
    });
  });

  const ledgers: { step: number; x: number }[] = [];
  for (const p of placed) {
    for (let s = -2; s >= p.step; s -= 2) ledgers.push({ step: s, x: p.x });
    for (let s = 10; s <= p.step; s += 2) ledgers.push({ step: s, x: p.x });
  }
  const clefStep = card.clef === "treble" ? 2 : 6;

  return (
    <svg
      className={`note-card ${state ?? ""}`}
      viewBox={`0 0 ${WIDTH} 230`}
      role="img"
      aria-label={card.kind === "interval" ? "Intervalo na pauta" : "Acorde na pauta"}
    >
      {[0, 2, 4, 6, 8].map((s) => (
        <line key={s} x1={16} x2={WIDTH - 16} y1={yOf(s)} y2={yOf(s)} className="staff-line" />
      ))}
      {ledgers.map((l, i) => (
        <line
          key={`l${i}`}
          x1={l.x - 10}
          x2={l.x + HEAD + 10}
          y1={yOf(l.step)}
          y2={yOf(l.step)}
          className="staff-line"
        />
      ))}
      <text x={26} y={yOf(clefStep)} className="smufl" fontSize={GAP * 4}>
        {card.clef === "treble" ? GLYPH.gClef : GLYPH.fClef}
      </text>
      {accidentals.map((a, i) => (
        <text key={`a${i}`} x={a.x} y={yOf(a.step)} className="smufl" fontSize={GAP * 4}>
          {a.glyph}
        </text>
      ))}
      {placed.map((p, i) => (
        <text key={i} x={p.x} y={yOf(p.step)} className="smufl note-head" fontSize={GAP * 4}>
          {GLYPH.wholeNote}
        </text>
      ))}
      {reveal && (
        <text x={WIDTH / 2} y={222} textAnchor="middle" className="pattern-name">
          {card.name}
        </text>
      )}
    </svg>
  );
}
