import { describe, expect, it } from "vitest";
import * as alphaTab from "@coderline/alphatab";
import { channelFor, eventsToBytes, silence } from "./keyboardOut";

const m = alphaTab.midi;

describe("som pelo teclado", () => {
  it("canal 1 fica livre para o aluno; bateria no 10", () => {
    expect([0, 1, 7, 8, 9, 10, 15].map(channelFor)).toEqual([1, 2, 8, 10, 9, 11, 15]);
  });

  it("converte os eventos do player em bytes MIDI", () => {
    const events = [
      new m.NoteOnEvent(0, 0, 0, 60, 100),
      new m.NoteOffEvent(0, 0, 0, 60, 0),
      new m.ControlChangeEvent(0, 0, 2, m.ControllerType.VolumeCoarse, 90),
      new m.ControlChangeEvent(0, 0, 2, 122 as alphaTab.midi.ControllerType, 0),
      new m.ProgramChangeEvent(0, 0, 3, 33),
      new m.AlphaTabMetronomeEvent(0, 0, 0, 960, 500),
      new m.AlphaTabMetronomeEvent(0, 0, 1, 960, 500),
    ];
    expect(eventsToBytes(events)).toEqual([
      0x91, 60, 100,
      0x81, 60, 0,
      0xb3, 7, 90,
      0xc4, 33,
      0x99, 76, 110, 0x89, 76, 0,
      0x99, 77, 80, 0x89, 77, 0,
    ]);
  });

  it("silêncio solta o pedal e cala os canais da banda", () => {
    const bytes = silence();
    expect(bytes.slice(0, 6)).toEqual([0xb1, 64, 0, 0xb1, 123, 0]);
    expect(bytes).toHaveLength(15 * 6);
  });
});
