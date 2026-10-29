import { describe, expect, it } from "vitest";
import type { Song } from "../api";
import { DEFAULT_FILTERS, difficultyCounts, facet, filterSongs, statusCounts } from "./filter";

let id = 0;
const song = (s: Partial<Song>): Song => ({
  id: ++id,
  title: "Sem título",
  artist: "",
  style: "",
  difficulty: null,
  difficultyManual: false,
  favorite: false,
  fileName: "x.gp",
  path: "x.gp",
  prefs: "{}",
  addedAt: id,
  plays: 0,
  lastPlayedAt: null,
  bestScore: null,
  lastScore: null,
  ...s,
});

const songs = [
  song({
    title: "Canção do Mar",
    artist: "Dulce",
    style: "MPB",
    difficulty: 2,
    plays: 3,
    bestScore: 80,
    lastPlayedAt: 50,
  }),
  song({
    title: "Asa Branca",
    artist: "Luiz Gonzaga",
    style: "Forró",
    difficulty: 1,
    favorite: true,
  }),
  song({
    title: "Back in Black",
    artist: "AC/DC",
    style: "Rock",
    difficulty: 4,
    plays: 1,
    bestScore: 55,
    lastPlayedAt: 90,
  }),
  song({ title: "Thunderstruck", artist: "AC/DC", style: "Rock" }),
  song({ title: "Exercício", artist: "", style: "" }),
];

const titles = (list: Song[]) => list.map((s) => s.title);

describe("filterSongs", () => {
  it("ordena por título por padrão, ignorando acentos", () => {
    expect(titles(filterSongs(songs, DEFAULT_FILTERS))).toEqual([
      "Asa Branca",
      "Back in Black",
      "Canção do Mar",
      "Exercício",
      "Thunderstruck",
    ]);
  });

  it("busca sem acento em título, artista e estilo", () => {
    expect(titles(filterSongs(songs, { ...DEFAULT_FILTERS, query: "cancao" }))).toEqual([
      "Canção do Mar",
    ]);
    expect(titles(filterSongs(songs, { ...DEFAULT_FILTERS, query: "forro" }))).toEqual([
      "Asa Branca",
    ]);
  });

  it("filtra por situação, estilo, artista e dificuldade", () => {
    const f = DEFAULT_FILTERS;
    expect(titles(filterSongs(songs, { ...f, status: "played" }))).toEqual([
      "Back in Black",
      "Canção do Mar",
    ]);
    expect(filterSongs(songs, { ...f, status: "unplayed" })).toHaveLength(3);
    expect(titles(filterSongs(songs, { ...f, status: "favorites" }))).toEqual(["Asa Branca"]);
    expect(titles(filterSongs(songs, { ...f, style: "Rock", status: "unplayed" }))).toEqual([
      "Thunderstruck",
    ]);
    expect(titles(filterSongs(songs, { ...f, artist: "" }))).toEqual(["Exercício"]);
    expect(filterSongs(songs, { ...f, difficulty: 0 })).toHaveLength(2);
  });

  it("ordena por nota, últimas tocadas e dificuldade", () => {
    const f = DEFAULT_FILTERS;
    expect(titles(filterSongs(songs, { ...f, sort: "best" })).slice(0, 2)).toEqual([
      "Canção do Mar",
      "Back in Black",
    ]);
    expect(titles(filterSongs(songs, { ...f, sort: "played" }))[0]).toBe("Back in Black");
    expect(titles(filterSongs(songs, { ...f, sort: "difficulty" })).slice(0, 3)).toEqual([
      "Asa Branca",
      "Canção do Mar",
      "Back in Black",
    ]);
    expect(titles(filterSongs(songs, { ...f, sort: "added" }))[0]).toBe("Exercício");
  });
});

describe("contagens", () => {
  it("conta estilos e artistas respeitando os outros filtros", () => {
    expect(facet(songs, DEFAULT_FILTERS, "style")).toEqual([
      { value: "Forró", count: 1 },
      { value: "MPB", count: 1 },
      { value: "Rock", count: 2 },
      { value: "", count: 1 },
    ]);
    // Com "Rock" escolhido, a lista de estilos continua completa (não se filtra a si mesma)...
    expect(facet(songs, { ...DEFAULT_FILTERS, style: "Rock" }, "style")).toHaveLength(4);
    // ...mas a de artistas mostra só os do rock.
    expect(facet(songs, { ...DEFAULT_FILTERS, style: "Rock" }, "artist")).toEqual([
      { value: "AC/DC", count: 2 },
    ]);
  });

  it("conta situações e dificuldades", () => {
    expect(statusCounts(songs, DEFAULT_FILTERS)).toEqual({
      all: 5,
      unplayed: 3,
      played: 2,
      favorites: 1,
    });
    expect(difficultyCounts(songs, DEFAULT_FILTERS)).toEqual([2, 1, 1, 0, 1, 0]);
  });
});
