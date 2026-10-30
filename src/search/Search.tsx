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
    id: "piano-midi-web",
    name: "MIDI de piano na web",
    description: "Procura a música em versão MIDI para piano em qualquer site. É a busca do Enter.",
    formats: ["MIDI", "piano"],
    search: "https://duckduckgo.com/?q={q}+piano+midi+download",
    home: "https://duckduckgo.com/",
  },
  {
    id: "piano-midi",
    name: "Piano MIDI (piano-midi.de)",
    description:
      "Clássicos de piano tocados com as mãos em faixas separadas: a conversão para partitura sai muito boa. Gratuito para estudo.",
    formats: ["MIDI", "piano"],
    // O site não tem busca própria.
    search: "https://duckduckgo.com/?q=site%3Apiano-midi.de+{q}",
    home: "https://www.piano-midi.de/",
  },
  {
    id: "mutopia",
    name: "Mutopia Project",
    description:
      "Peças para piano em domínio público, editadas por voluntários, com MIDI limpo e no tempo. Peças com vários movimentos às vezes vêm em .zip.",
    formats: ["MIDI", "piano", "domínio público"],
    search: "https://duckduckgo.com/?q=site%3Amutopiaproject.org+piano+{q}",
    home: "https://www.mutopiaproject.org/",
  },
  {
    id: "bitmidi",
    name: "BitMidi",
    description:
      "Mais de 100 mil MIDIs, muita música popular, sem cadastro. A busca já pede versões para piano; prefira as que têm \"piano\" no nome.",
    formats: ["MIDI", "piano"],
    search: "https://bitmidi.com/search?q={q}+piano",
    home: "https://bitmidi.com/",
  },
  {
    id: "freemidi",
    name: "FreeMidi",
    description: "MIDIs de pop e rock, sem cadastro. A busca já pede versões para piano; a qualidade varia.",
    formats: ["MIDI", "piano"],
    search: "https://duckduckgo.com/?q=site%3Afreemidi.org+{q}+piano",
    home: "https://freemidi.org/",
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
    description:
      "Biblioteca de domínio público (clássicos). A maioria é PDF; procure MusicXML ou MIDI.",
    formats: ["MusicXML", "MIDI", "domínio público"],
    search: "https://imslp.org/index.php?title=Special:Search&search={q}",
    home: "https://imslp.org/",
  },
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
    id: "web",
    name: "Busca na web",
    description: "Procura arquivos Guitar Pro, MusicXML e MIDI em qualquer site.",
    formats: ["Guitar Pro", "MusicXML", "MIDI"],
    search: "https://duckduckgo.com/?q={q}+(guitar+pro+OR+musicxml+OR+midi)+download",
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

export interface SearchLogEntry {
  kind: string;
  detail: string;
  at: number;
}

/** O endereço parece um arquivo de partitura (e não uma página)? */
export const looksLikeScoreLink = (text: string) =>
  /\.(gp|gp3|gp4|gp5|gpx|musicxml|mxl|xml|cap|mid|midi)(\?|#|&|$)/i.test(text.trim());

interface Props {
  log: SearchLogEntry[];
  onImportUrl: (url: string) => void;
  onAddCollection: (id: string) => void;
  busy: boolean;
  downloads: DownloadResult[];
  onOpenUrl: (url: string) => void;
  onOpenSong: (song: Song) => void;
}

export function Search({
  downloads,
  log,
  onOpenUrl,
  onImportUrl,
  onOpenSong,
  onAddCollection,
  busy,
}: Props) {
  const [query, setQuery] = useState("");
  const [address, setAddress] = useState("");

  const fullAddress = () => {
    const text = address.trim();
    return /^https?:\/\//.test(text) ? text : `https://${text}`;
  };
  // Link direto de arquivo: baixa para a biblioteca; página: abre na janela de busca.
  const openAddress = () => {
    if (!address.trim()) return;
    if (looksLikeScoreLink(address)) onImportUrl(fullAddress());
    else onOpenUrl(fullAddress());
  };

  return (
    <section className="search-page">
      <div className="search-hero">
        <h2>Encontrar partituras</h2>
        <p className="muted">
          Busque uma música e escolha onde procurar; os sites de piano vêm primeiro. O site abre
          numa janela do PartiTAB; todo arquivo MIDI, MusicXML ou Guitar Pro que você baixar lá
          entra direto na biblioteca.
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
          placeholder="Ou cole o endereço de outro site, ou o link direto de um arquivo .gp"
          aria-label="Endereço de outro site ou link de arquivo"
        />
        <button type="submit" disabled={!address.trim() || busy}>
          {looksLikeScoreLink(address) ? "Baixar para a biblioteca" : "Abrir"}
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

      {log.length > 0 && (
        <details className="search-log">
          <summary>Registro da janela de busca ({log.length})</summary>
          <p className="muted small">
            O que os sites pediram (janelas novas, downloads). Se um download não chegar à
            biblioteca, isto mostra até onde ele foi.
          </p>
          <ol>
            {log.map((e, i) => (
              <li key={i}>
                <span className="muted small">{new Date(e.at).toLocaleTimeString("pt-BR")}</span>{" "}
                <b>{e.kind}</b> <span className="log-detail">{e.detail}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
