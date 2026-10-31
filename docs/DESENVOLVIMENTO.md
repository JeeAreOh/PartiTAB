# Desenvolvimento

Como compilar, testar e publicar o PartiTAB, e como o código está organizado.

## Pré-requisitos

- [Rust](https://rustup.rs) (edição 2024)
- [Node.js](https://nodejs.org) 20 ou mais novo
- Os [pré-requisitos do Tauri](https://tauri.app/start/prerequisites/) para Windows: Microsoft C++ Build Tools e WebView2 (já vem no Windows 10/11)

## Rodar e compilar

```bash
npm install
npm run tauri dev      # app em modo de desenvolvimento
npm run tauri build    # instalador em src-tauri/target/release/bundle
```

## Testes e verificações

```bash
npm test                                  # TypeScript (vitest)
npx tsc --noEmit                          # tipos
cd src-tauri && cargo test                # Rust
cd src-tauri && cargo clippy --all-targets
```

Os testes de TypeScript cobrem o motor de prática, o redutor para piano, a conversão de MIDI, os exercícios de técnica, o dedilhado, a leitura e os filtros da biblioteca. Os de Rust cobrem a tradução das mensagens MIDI, a biblioteca (SQLite), o backup, a busca e o verificador de versão. O workflow de release roda todos antes de gerar o instalador.

## Arquitetura

O app é um [Tauri 2](https://tauri.app/): um núcleo em Rust e a interface em React dentro do WebView2.

- **Som do teclado no Rust.** As mensagens MIDI do teclado vão do `midir` direto ao sintetizador (`rustysynth`) e à saída de áudio (`cpal`, WASAPI, buffer de 256 frames quando o dispositivo permite), sem passar pela interface. A interface recebe só uma cópia de cada nota, para o teclado virtual e a correção.
- **Partitura e reprodução no alphaTab.** O [alphaTab](https://alphatab.net/) lê os arquivos, desenha a pauta e toca a reprodução (com o mesmo SoundFont do piano). Arquivos MIDI são convertidos em MusicXML antes (`src/midi/`), porque o alphaTab não importa MIDI.
- **Motor de prática no TypeScript.** O modo Esperar, a avaliação de tempo e a pontuação rodam na interface (`src/practice/`). O atraso de poucos milissegundos até a interface afeta só a correção, não o som; o atraso da saída de áudio é descontado pela calibração.
- **Dados locais.** Biblioteca, práticas, erros e cartões de leitura ficam num SQLite (`partitab.db`) na pasta de dados do app (`%APPDATA%\com.partitab.app`), junto com as cópias das partituras, as capas e os SoundFonts baixados.

## Estrutura

```
src/
  App.tsx              interface: barra da partitura, abas, teclado virtual
  useScore.ts          integração com o alphaTab (carregar, faixas, reprodução, seções, som pelo teclado)
  Keyboard.tsx         teclado virtual de 61 teclas
  octave.ts            nomes das oitavas (convenção Yamaha: dó central = C3)
  Settings.tsx         gaveta de ajustes
  api.ts               chamadas aos comandos do Rust
  help/                Ajuda (topics.tsx: o texto de cada tópico)
  library/             biblioteca (filtros, detalhes, capas, backup)
  midi/                MIDI → MusicXML (faixas, mãos, tercinas, swing); musicxml.ts escreve o MusicXML
  practice/            motor de prática, linha do tempo, trechos e rampa, mapa de erros,
                       calibração, gravação, dedilhado, notas caindo, seções, som pelo teclado
  progress/            painel de progresso
  reading/             treino de leitura (cartões, repetição espaçada, pauta em SVG)
  reducer/             arranjo para piano (níveis 1 a 3, tonalidade, acordes)
  search/              aba de busca
  sound/               timbre, ajustes de som e catálogo de SoundFonts
  technique/           aba Técnica: escalas, arpejos e cadências com dedilhado
  ui/                  ícones, popover, tela cheia, tema
  updates/             verificação e instalação de versões
  video/               sincronia com vídeos do YouTube
src-tauri/src/
  lib.rs               estado do app e comandos Tauri
  midi.rs              entrada e saída MIDI, Local Control
  audio.rs             saída de áudio + RustySynth, sem locks no callback
  sounds.rs            timbres, ajustes de som e catálogo de SoundFonts
  library.rs           biblioteca em SQLite
  backup.rs            backup e restauração (.zip)
  search.rs            janela de busca e importação dos downloads
  covers.rs            busca e download de capas (iTunes)
  updates.rs           verificador de versão (releases do GitHub)
src-tauri/resources/   SoundFont padrão (SONiVOX) e a coleção MuseTrainer
docs/                  este guia, o plano original do projeto e as imagens do README
```

## Publicar uma versão

O instalador é gerado pelo GitHub Actions ([`release.yml`](../.github/workflows/release.yml)).

```bash
npm run version:set -- 0.4.0   # atualiza package.json, Cargo.toml e os lockfiles
git commit -am "Versão 0.4.0" && git push
```

Depois, em **Actions → Release Windows → Run workflow**, com **Publicar** marcado. O workflow roda os testes, gera o `PartiTAB_<versão>_x64-setup.exe` (NSIS, em português) e o `.msi`, cria a tag `v<versão>` e a release com os dois. Também dá para publicar empurrando a tag (`git tag v0.4.0 && git push origin v0.4.0`); a tag precisa bater com o `package.json`. Sem **Publicar**, o instalador fica só como artefato da execução. Publicar de novo a mesma versão é recusado.

Registre as mudanças no [CHANGELOG](../CHANGELOG.md) antes de publicar.

## Atualização dentro do app

O app consulta `GET /repos/JeeAreOh/PartiTAB/releases/latest` na API do GitHub ao abrir e, havendo versão nova, baixa o instalador NSIS da release, abre e fecha o app. Com o repositório público, a consulta não precisa de autenticação (limite de 60 consultas por hora por IP). Se o repositório for privado, o usuário pode informar um token *fine-grained* com **Contents: Read-only**, salvo em `atualizacao.json` na pasta de dados do app.

## Ícone

O ícone é o mesmo logo da barra do app, desenhado em [`src-tauri/icons/logo.svg`](../src-tauri/icons/logo.svg). Para mudar, edite o SVG, exporte um PNG de 1024×1024 e rode `npx tauri icon logo.png -o src-tauri/icons` (apague as pastas `android/` e `ios/` geradas).
