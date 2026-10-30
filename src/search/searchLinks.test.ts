import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Roda o script injetado na janela de busca com um window/document de mentira. */
function load() {
  const code = readFileSync("src-tauri/src/search_links.js", "utf8");
  let listener: ((e: unknown) => void) | null = null;
  const win = {
    location: { href: "https://www.cifraclub.com.br/coldplay/clocks/" },
    addEventListener: (_: string, fn: (e: unknown) => void, capture: boolean) => {
      expect(capture).toBe(true);
      listener = fn;
    },
  };
  new Function("window", code)(win);
  const click = (href: string, extra: object = {}) => {
    const anchor = { tagName: "A", href, parentElement: null };
    const span = { tagName: "SPAN", parentElement: anchor };
    const e = {
      button: 0,
      target: span,
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
      stopImmediatePropagation() {},
      ...extra,
    };
    listener!(e);
    return { prevented: e.prevented, href: win.location.href };
  };
  return click;
}

describe("links de partitura na janela de busca", () => {
  const CIFRA =
    "https://www.cifraclub.com.br/ajax/gp_partitura_download.php?c=822&a=1033&m=8795&t=6&arq=coldplay-clocks.gp3";

  it("abre o download do Cifra Club na própria janela", () => {
    const click = load();
    expect(click(CIFRA)).toEqual({ prevented: true, href: CIFRA });
  });

  it("reconhece arquivos e parâmetros com extensão de partitura", () => {
    const click = load();
    expect(click("https://x.com/files/song.gp5").prevented).toBe(true);
    expect(click("https://x.com/dl?file=song.mxl&x=1").prevented).toBe(true);
  });

  it("não mexe em links comuns nem em cliques com modificador", () => {
    const click = load();
    expect(click("https://www.cifraclub.com.br/coldplay/").prevented).toBe(false);
    expect(click("https://x.com/a.xml").prevented).toBe(false);
    expect(click(CIFRA, { ctrlKey: true }).prevented).toBe(false);
    expect(click(CIFRA, { button: 1 }).prevented).toBe(false);
  });
});
