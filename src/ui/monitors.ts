/** Monitores conectados, como a interface mostra e escolhe. */

export interface MonitorLike {
  name: string | null;
  size: { width: number; height: number };
  position: { x: number; y: number };
  scaleFactor: number;
}

export interface MonitorInfo {
  /** Identificador do sistema (ex.: \\.\DISPLAY2); vazio se o sistema não informa. */
  id: string;
  label: string;
  width: number;
  height: number;
  x: number;
  y: number;
  primary: boolean;
}

const sameMonitor = (a: MonitorLike, b: MonitorLike | null) =>
  !!b && a.position.x === b.position.x && a.position.y === b.position.y;

/**
 * Lista os monitores da esquerda para a direita, numerados como o usuário os
 * vê ("Monitor 1", "Monitor 2"…), com a resolução e qual é o principal.
 */
export function describeMonitors(list: MonitorLike[], primary: MonitorLike | null): MonitorInfo[] {
  return [...list]
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
    .map((m, i) => {
      const isPrimary = sameMonitor(m, primary);
      return {
        id: m.name ?? `${m.position.x},${m.position.y}`,
        label: `Monitor ${i + 1} — ${m.size.width}×${m.size.height}${isPrimary ? " (principal)" : ""}`,
        width: m.size.width,
        height: m.size.height,
        x: m.position.x,
        y: m.position.y,
        primary: isPrimary,
      };
    });
}

/** Monitor escolhido; se ele foi desconectado, o atual; senão o principal. */
export function pickMonitor(
  monitors: MonitorInfo[],
  preferred: string | null,
  current: string | null,
): MonitorInfo | null {
  return (
    monitors.find((m) => m.id === preferred) ??
    monitors.find((m) => m.id === current) ??
    monitors.find((m) => m.primary) ??
    monitors[0] ??
    null
  );
}
