import { describe, expect, it } from "vitest";
import { describeMonitors, pickMonitor } from "./monitors";

const mon = (name: string | null, x: number, w = 1920, h = 1080) => ({
  name,
  size: { width: w, height: h },
  position: { x, y: 0 },
  scaleFactor: 1,
});

describe("monitores", () => {
  const raw = [mon("\\\\.\\DISPLAY2", 1920, 2560, 1440), mon("\\\\.\\DISPLAY1", 0)];
  const list = describeMonitors(raw, raw[1]);

  it("numera da esquerda para a direita e marca o principal", () => {
    expect(list.map((m) => m.label)).toEqual([
      "Monitor 1 — 1920×1080 (principal)",
      "Monitor 2 — 2560×1440",
    ]);
    expect(list[1].id).toBe("\\\\.\\DISPLAY2");
    expect(describeMonitors([mon(null, -1920)], null)[0].id).toBe("-1920,0");
  });

  it("escolhe o preferido, ou o atual, ou o principal", () => {
    expect(pickMonitor(list, "\\\\.\\DISPLAY2", "\\\\.\\DISPLAY1")?.x).toBe(1920);
    expect(pickMonitor(list, "desconectado", "\\\\.\\DISPLAY2")?.x).toBe(1920);
    expect(pickMonitor(list, null, null)?.primary).toBe(true);
    expect(pickMonitor([], null, null)).toBeNull();
  });
});
