import { useState } from "react";
import type { Song } from "../api";
import { Icon } from "../ui/Icon";

export interface Source {
  id: string;
  name: string;
  description: string;
  formats: string[];
  /** Endereço de busca; {q} vira o termo. */
  search: string;
  home: string;
}

/**
 * Sites abertos no navegador do app. A busca e o download acontecem no próprio
 * site, como num navegador comum (com a conta do usuário, quando o site pede).
 */
export const SOURCES: Source[] = [
  {
    id: "cifraclub",
    name: "Cifra Club",
    description:
      "Cifras e tabs de música brasileira. A busca mostra as páginas do Cifra Club; um Guitar Pro baixado lá entra na biblioteca.",
    formats: ["Guitar Pro"],
    // Busca restrita ao site (o endereço de busca do próprio Cifra Club pode mudar).
    search: "https://duckduckgo.com/?q=site%3Acifraclub.com.br+{q}",
    home: "https://www.cifraclub.com.br/",
  },
  {
    id: "ug",
    name: "Ultimate Guitar",
    description: "Maior acervo de tabs. Arquivos Guitar Pro pedem conta gratuita.",
    formats: ["Guitar Pro"],
    search: "https://www.ultimate-guitar.com/search.php?search_type=title&value={q}",
    home: "https://www.ultimate-guitar.com/",
  },
  {
    id: "songsterr",
    name: "Songsterr",
    description: "Tabs com todas as faixas da banda. Baixar Guitar Pro pede assinatura Plus.",
    formats: ["Guitar Pro"],
    search: "https://www.songsterr.com/?pattern={q}",
    home: "https://www.songsterr.com/",
  },
  {
    id: "musescore",
    name: "MuseScore",
    description: "Partituras de piano feitas pela comunidade. Baixar MusicXML pede conta.",
    formats: ["MusicXML"],
    search: "https://musescore.com/sheetmusic?text={q}",
    home: "https://musescore.com/",
  },
  {
    id: "imslp",
    name: "IMSLP",
    description: "Biblioteca de domínio público (clássicos). A maioria é PDF; procure MusicXML.",
    formats: ["MusicXML", "domínio público"],
    search: "https://imslp.org/index.php?title=Special:Search&search={q}",
    home: "https://imslp.org/",
  },
  {
    id: "web",
    name: "Busca na web",
    description: "Procura arquivos Guitar Pro e MusicXML em qualquer site.",
    formats: ["Guitar Pro", "MusicXML"],
    search: "https://duckduckgo.com/?q={q}+(guitar+pro+OR+musicxml)+download",
    home: "https://duckduckgo.com/",
  },
];

export const searchUrl = (source: Source, query: string) =>
  query.trim() ? source.search.replace("{q}", encodeURIComponent(query.trim())) : source.home;

export type DownloadResult =
  | { type: "imported"; song: Song }
  | { type: "ignored"; fileName: string; reason: string }
  | { type: "failed"; fileName: string; reason: string };

/** Coleções gratuitas que vêm com o app. */
export const COLLECTIONS = [
  {
    id: "musetrainer",
    name: "MuseTrainer",
    description:
      "63 partituras de piano em domínio público: Bach, Mozart, Beethoven, Chopin, Debussy, Satie, Joplin e mais, várias com versão fácil.",
    url: "https://musetrainer.github.io/library/",
  },
];

interface Props {
  onAddCollection: (id: string) => void;
  busy: boolean;
  downloads: DownloadResult[];
  onOpenUrl: (url: string) => void;
  onOpenSong: (song: Song) => void;
}

export function Search({ downloads, onOpenUrl, onOpenSong, onAddCollection, busy }: Props) {
  const [query, setQuery] = useState("");
  const [address, setAddress] = useState("");

  const openAddress = () => {
    const text = address.trim();
    if (text) onOpenUrl(/^https?:\/\//.test(text) ? text : `https://${text}`);
  };

  return (
    <section className="search-page">
      <div className="search-hero">
        <h2>Encontrar partituras</h2>
        <p className="muted">
          Busque uma música e escolha onde procurar. O site abre numa janela do PartiTAB; todo
          arquivo Guitar Pro ou MusicXML que você baixar lá entra direto na biblioteca.
        </p>
        <form
          className="search-box"
          onSubmit={(e) => {
            e.preventDefault();
            onOpenUrl(searchUrl(SOURCES[0], query));
          }}
        >
          <Icon name="search" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Música ou artista — ex.: Asa Branca, Coldplay Clocks"
            aria-label="Música ou artista"
          />
        </form>
      </div>

      <div className="sources">
        {SOURCES.map((s) => (
          <button key={s.id} className="source" onClick={() => onOpenUrl(searchUrl(s, query))}>
            <span className="source-name">
              {s.name}
              <Icon name="external" size={15} />
            </span>
            <span className="source-desc">{s.description}</span>
            <span className="tags">
              {s.formats.map((f) => (
                <span key={f} className="tag">
                  {f}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>

      <div className="collections">
        <h3>Coleções gratuitas</h3>
        {COLLECTIONS.map((c) => (
          <div key={c.id} className="collection">
            <div>
              <b>{c.name}</b>
              <p className="muted small">{c.description}</p>
            </div>
            <button onClick={() => onAddCollection(c.id)} disabled={busy}>
              Adicionar à biblioteca
            </button>
          </div>
        ))}
      </div>

      <form
        className="address"
        onSubmit={(e) => {
          e.preventDefault();
          openAddress();
        }}
      >
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Ou cole o endereço de outro site"
          aria-label="Endereço de outro site"
        />
        <button type="submit" disabled={!address.trim()}>
          Abrir
        </button>
      </form>

      <div className="downloads">
        <h3>Baixados agora</h3>
        {downloads.length === 0 ? (
          <p className="muted small">
            Nada ainda. Arquivos PDF não servem: o app precisa de Guitar Pro (.gp, .gp5, .gpx…) ou
            MusicXML (.musicxml, .mxl).
          </p>
        ) : (
          <ul>
            {downloads.map((d, i) => (
              <li key={i} className={d.type}>
                {d.type === "imported" ? (
                  <>
                    <Icon name="download" size={16} />
                    <span>
                      <b>{d.song.title}</b>
                      {d.song.artist && <span className="muted"> · {d.song.artist}</span>}
                      <span className="muted small"> — na biblioteca</span>
                    </span>
                    <button onClick={() => onOpenSong(d.song)}>Abrir</button>
                  </>
                ) : (
                  <>
                    <Icon name="close" size={16} />
                    <span>
                      <b>{d.fileName}</b>
                      <span className="muted small"> — {d.reason}</span>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
