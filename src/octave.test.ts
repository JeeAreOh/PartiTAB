import { afterEach, describe, expect, it } from "vitest";
import { noteName } from "./Keyboard";
import { getOctaveNaming, octaveName, setOctaveNaming } from "./octave";

describe("octaveName", () => {
  afterEach(() => setOctaveNaming("yamaha"));

  it("segue a Yamaha por padrão: dó central = 3", () => {
    expect(getOctaveNaming()).toBe("yamaha");
    expect(octaveName(60)).toBe(3);
    expect(octaveName(36)).toBe(1);
  });

  it("na científica o dó central é 4", () => {
    expect(octaveName(60, "scientific")).toBe(4);
    setOctaveNaming("scientific");
    expect(octaveName(59)).toBe(3);
    expect(noteName(60)).toMatch(/4$/);
  });
});
