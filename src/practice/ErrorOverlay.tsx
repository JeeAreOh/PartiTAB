import type * as alphaTab from "@coderline/alphatab";
import type { BarStat } from "./engine";
import { errorRate, heatColor } from "./drill";

interface Props {
  api: alphaTab.AlphaTabApi | null;
  bars: Record<number, BarStat>;
  /** Muda a cada desenho do alphaTab (força recalcular as posições). */
  renderVersion: number;
}

/**
 * Mapa de erros sobre a partitura: cada compasso ganha um fundo mais forte
 * quanto mais se erra nele. Não captura cliques (a seleção de trecho continua
 * funcionando por baixo).
 */
export function ErrorOverlay({ api, bars }: Props) {
  const lookup = api?.boundsLookup;
  if (!lookup) return null;
  return (
    <div className="error-overlay" aria-hidden>
      {Object.entries(bars).map(([index, stat]) => {
        const color = heatColor(errorRate(stat));
        const bounds = color && lookup.findMasterBarByIndex(Number(index))?.realBounds;
        if (!bounds) return null;
        const rate = Math.round(errorRate(stat) * 100);
        return (
          <div
            key={index}
            className="error-bar"
            style={{
              left: bounds.x,
              top: bounds.y,
              width: bounds.w,
              height: bounds.h,
              background: color,
            }}
          >
            {rate >= 25 && <span>{rate}%</span>}
          </div>
        );
      })}
    </div>
  );
}
