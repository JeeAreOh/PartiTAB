import { useState } from "react";
import type { Attempt } from "../api";

const W = 288;
const H = 120;
const PAD = { top: 10, right: 8, bottom: 18, left: 26 };

const MODE: Record<string, string> = { wait: "Esperar", play: "Tocar junto" };

/**
 * Evolução da nota de uma música: uma linha com as execuções em ordem
 * (completas com ponto cheio, incompletas vazado).
 */
export function ScoreChart({ attempts }: { attempts: Attempt[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // A lista vem da mais recente para a mais antiga.
  const points = [...attempts].reverse();
  if (points.length < 2) return null;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (points.length === 1 ? plotW / 2 : (i * plotW) / (points.length - 1));
  const y = (score: number) => PAD.top + plotH - (score / 100) * plotH;
  const path = points
    .map((a, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(a.score).toFixed(1)}`)
    .join("");
  const active = hover !== null ? points[hover] : null;

  return (
    <figure className="score-chart">
      <figcaption>Evolução da nota</figcaption>
      <div className="chart-box">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label="Nota em cada execução, da mais antiga para a mais recente"
        >
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="grid" />
              <text
                x={PAD.left - 6}
                y={y(v)}
                className="axis"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {v}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={H - 4} className="axis">
            mais antiga
          </text>
          <text x={W - PAD.right} y={H - 4} className="axis" textAnchor="end">
            mais recente
          </text>
          <path d={path} className="series" />
          {points.map((a, i) => (
            <circle
              key={a.id ?? i}
              cx={x(i)}
              cy={y(a.score)}
              r={hover === i ? 5 : 4}
              className={a.completed ? "dot" : "dot open"}
            />
          ))}
          {active && (
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              className="crosshair"
            />
          )}
          {/* Alvos de mouse maiores que os pontos. */}
          {points.map((_, i) => (
            <rect
              key={`hit${i}`}
              x={x(i) - plotW / points.length / 2}
              y={0}
              width={plotW / points.length}
              height={H}
              fill="transparent"
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            />
          ))}
        </svg>
        {active && (
          <div
            className={`chart-tooltip ${x(hover!) > W / 2 ? "end" : "start"}`}
            style={{ left: `${(x(hover!) / W) * 100}%`, top: `${(y(active.score) / H) * 100}%` }}
          >
            <div>
              <b>{active.score}</b> pts
            </div>
            <span>
              {active.playedAt ? new Date(active.playedAt).toLocaleDateString("pt-BR") : ""} ·{" "}
              {MODE[active.mode] ?? active.mode} · {active.speed}%
              {active.completed ? "" : " · incompleta"}
            </span>
          </div>
        )}
      </div>
    </figure>
  );
}
