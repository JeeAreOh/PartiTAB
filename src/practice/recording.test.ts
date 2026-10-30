import { describe, expect, it } from "vitest";
import {
  closeRecording,
  msToTicks,
  noteCount,
  toMidiFile,
  vlq,
  type RecordedEvent,
} from "./recording";

describe("gravação", () => {
  it("fecha notas e pedal abertos", () => {
    const events: RecordedEvent[] = [
      { t: 0, type: "pedal", down: true },
      { t: 10, type: "on", key: 60, velocity: 90, tick: 0 },
      { t: 20, type: "on", key: 64, velocity: 80, tick: 0 },
      { t: 300, type: "off", key: 60 },
    ];
    const rec = closeRecording(events, 1000);
    expect(rec.durationMs).toBe(1000);
    expect(rec.events.slice(4)).toEqual([
      { t: 1000, type: "off", key: 64 },
      { t: 1000, type: "pedal", down: false },
    ]);
    expect(noteCount(rec)).toBe(2);
  });

  it("codifica números do MIDI", () => {
    expect(vlq(0)).toEqual([0]);
    expect(vlq(0x7f)).toEqual([0x7f]);
    expect(vlq(0x80)).toEqual([0x81, 0x00]);
    expect(vlq(0x3fff)).toEqual([0xff, 0x7f]);
    expect(vlq(0x200000)).toEqual([0x81, 0x80, 0x80, 0x00]);
    expect(msToTicks(1000)).toBe(960);
  });

  it("gera um arquivo MIDI formato 0", () => {
    const rec = closeRecording(
      [
        { t: 0, type: "on", key: 60, velocity: 100, tick: 0 },
        { t: 500, type: "off", key: 60 },
      ],
      500,
    );
    const bytes = toMidiFile(rec, "Música");
    const text = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
    expect(text(0, 4)).toBe("MThd");
    expect([...bytes.slice(8, 14)]).toEqual([0, 0, 0, 1, 0x01, 0xe0]);
    expect(text(14, 18)).toBe("MTrk");
    const len = (bytes[18] << 24) | (bytes[19] << 16) | (bytes[20] << 8) | bytes[21];
    expect(len).toBe(bytes.length - 22);
    const body = [...bytes.slice(22)];
    // Nome sem acento, nota ligada no início e desligada 480 pulsos depois.
    expect(String.fromCharCode(...body.slice(4, 10))).toBe("Musica");
    const on = body.indexOf(0x90);
    expect(body.slice(on - 1, on + 3)).toEqual([0, 0x90, 60, 100]);
    expect(body.slice(on + 3, on + 8)).toEqual([0x83, 0x60, 0x80, 60, 0x40]);
    expect(body.slice(-4)).toEqual([0, 0xff, 0x2f, 0]);
  });
});
