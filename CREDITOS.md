# Créditos

O PartiTAB é distribuído sob a [GNU GPL 3.0](LICENSE) e usa os projetos abaixo, cada um com a sua licença.

## Bibliotecas

| Projeto | Para quê | Licença |
|---|---|---|
| [alphaTab](https://alphatab.net/) | ler Guitar Pro, MusicXML e Capella, desenhar a partitura e tocar a reprodução | MPL-2.0 |
| [Tauri](https://tauri.app/) e plugins `dialog` e `opener` | janela do app, comunicação entre interface e núcleo | MIT ou Apache-2.0 |
| [React](https://react.dev/) | interface | MIT |
| [RustySynth](https://github.com/sinshu/rustysynth) | sintetizador SoundFont do piano | MIT |
| [midir](https://github.com/Boddlnagg/midir) | entrada e saída MIDI | MIT |
| [cpal](https://github.com/RustAudio/cpal) | saída de áudio | Apache-2.0 |
| [rusqlite](https://github.com/rusqlite/rusqlite) e [SQLite](https://sqlite.org/) | biblioteca de músicas e práticas | MIT; SQLite em domínio público |
| [ureq](https://github.com/algesten/ureq) | atualizações, capas e downloads | MIT ou Apache-2.0 |
| [zip](https://github.com/zip-rs/zip2) | backup e partituras `.mxl` | MIT |
| [serde](https://serde.rs/), [sha2](https://github.com/RustCrypto/hashes) | dados e verificação dos downloads | MIT ou Apache-2.0 |

A lista completa de dependências está em `package.json` e `src-tauri/Cargo.toml`.

## Recursos incluídos no app

- **SoundFont SONiVOX** (`src-tauri/resources/soundfonts/sonivox.sf2`), © 2004-2006 Sonic Network Inc., licença Apache-2.0 ([texto](src-tauri/resources/soundfonts/LICENSE-sonivox.txt)). É o som padrão do piano e da reprodução.
- **Fonte musical Bravura** (`public/font/`), © Steinberg Media Technologies, licença SIL Open Font License 1.1 ([texto](public/font/Bravura-OFL.txt)). Desenha as notas e os símbolos da partitura.
- **Coleção MuseTrainer** (`src-tauri/resources/collections/musetrainer/`): 63 partituras de piano em domínio público, da biblioteca do [MuseTrainer](https://musetrainer.github.io/library/), com títulos e compositores revisados ([detalhes](src-tauri/resources/collections/musetrainer/LEIAME.md)).

## SoundFonts para baixar

O catálogo em **Ajustes → Som** baixa estes arquivos direto das fontes originais para o computador do usuário; eles não fazem parte do app:

- **GeneralUser GS**, de S. Christian Collins ([licença no repositório do autor](https://github.com/mrbumpy409/GeneralUser-GS))
- **FluidR3 GM**, de Frank Wen, licença MIT
- **TimGM6mb**, de Tim Brechbill, licença GPL-2.0

## Serviços usados pelo app

- **API do GitHub**, para verificar e baixar versões novas.
- **iTunes Search API**, da Apple, para buscar capas de álbum.
- **YouTube**, para tocar junto com vídeos (o vídeo toca no player oficial; nada é baixado).
- Os sites da aba **Buscar** (MuseScore, IMSLP, Cifra Club, Ultimate Guitar, Songsterr, piano-midi.de, Mutopia, BitMidi, FreeMidi) abrem dentro do app como num navegador, com as regras e licenças de cada um.
