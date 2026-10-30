import { describe, expect, it } from "vitest";
import { gradientFor, initials } from "./Cover";

describe("capa gerada", () => {
  it("usa as iniciais das duas primeiras palavras", () => {
    expect(initials("Für Elise (fácil)")).toBe("FE");
    expect(initials("Asa Branca")).toBe("AB");
    expect(initials("O Lago dos Cisnes")).toBe("LD");
    expect(initials("Sinfonia nº 5 — 1º movimento")).toBe("SN");
    expect(initials("?")).toBe("?");
  });

  it("a mesma música tem sempre a mesma cor", () => {
    expect(gradientFor("Asa Branca", "Luiz Gonzaga")).toEqual(
      gradientFor("Asa Branca", "Luiz Gonzaga"),
    );
  });
});
