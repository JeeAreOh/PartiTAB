# PartiTAB

App de prática de piano para Windows: leitor de partitura (Guitar Pro, MusicXML, MIDI), motor de prática e sintetizador próprio, pensado para o Yamaha PSR-E463 ligado por USB.

O plano completo está em [docs/PLANO.md](docs/PLANO.md).

## Estado atual: fase 4 — redutor para piano e biblioteca

**Fase 1 — piano virtual**

- Lista as portas MIDI e conecta ao teclado (lembra a última porta).
- Ao conectar, envia **Local Control Off** (CC 122 = 0) para o teclado parar de soar sozinho; ao desconectar ou fechar o app, envia **Local On** de volta.
- Cada tecla toca um piano SoundFont (`.sf2`) gerado no PC, com velocidade e pedal de sustain.
- O som vai do `midir` direto ao `rustysynth` e ao `cpal` (WASAPI), sem passar pela interface. O buffer pedido é de 256 frames (~5 ms a 48 kHz) quando o dispositivo permite.
- Teclado virtual de 61 teclas (C2–C7) mostra o que está sendo tocado; também dá para tocar com o mouse.

**Fase 2 — leitor de partitura** ([alphaTab](https://alphatab.net/))

- Abre Guitar Pro 3 a 8 (`.gp3`, `.gp4`, `.gp5`, `.gpx`, `.gp`), MusicXML (`.musicxml`, `.mxl`, `.xml`) e Capella (`.cap`); reabre a última partitura ao iniciar.
- Escolha de faixa (bateria fica de fora); abre na primeira faixa de piano, se houver. Exibe só a notação em pauta, sem tablatura.
- Reprodução com cursor acompanhando a música, andamento de 25% a 150% (duplo clique volta a 100%) e opção de tocar só a faixa escolhida.
- O teclado virtual marca em laranja as notas que a partitura está tocando, e em azul as que você toca.
- A reprodução usa o mesmo SoundFont escolhido para o piano. Para ouvir a banda inteira, use um SoundFont General MIDI completo (ex.: FluidR3_GM); sem SoundFont, o app usa o SONiVOX que vem com o alphaTab.

**Fase 3 — motor de prática**

Três modos na barra de cima:

- **Ouvir** — reprodução normal.
- **Esperar** — o cursor para em cada nota ou acorde e só avança quando você toca todas as notas certas da mão escolhida. As notas que faltam ficam marcadas em laranja no teclado virtual. A outra mão é tocada pelo próprio app, com o mesmo piano. Trechos em que só a outra mão toca seguem sozinhos no andamento escolhido.
- **Tocar junto** — a música segue no andamento, com a banda, e a mão que você pratica sai da reprodução (as notas dela são retiradas do MIDI gerado). Cada nota é avaliada: **no tempo** (até 70 ms), **adiantada** ou **atrasada** (até 200 ms), **errada** ou **perdida**. As janelas são medidas em tempo real, então valem igual em qualquer andamento.

- Mão: direita, esquerda ou ambas. Em partitura de piano com pauta dupla, a pauta de cima é a direita; com uma pauta só, a divisão é no dó central.
- Metrônomo e contagem de um compasso antes de começar (no modo Tocar junto).
- Retorno na hora: a tecla pisca verde (certa), amarela (fora do tempo) ou vermelha (errada); placar com pontos de 0 a 100, precisão e contagem de cada tipo.
- Pontos: nota no tempo vale 1, fora do tempo 0,5, perdida 0; cada nota errada desconta 0,5.

O motor de prática roda na interface (TypeScript), não no Rust: o som do teclado continua indo direto do MIDI ao sintetizador, e o atraso de poucos ms até a interface afeta só a correção. Ainda não há compensação da latência da saída de áudio da reprodução; se as notas aparecerem sempre "adiantadas", é isso.

**Biblioteca de partituras**

- Toda partitura aberta entra na biblioteca automaticamente; dá para adicionar várias de uma vez. O arquivo é copiado para a pasta de dados do app (`%APPDATA%\com.partitab.app\partituras`), então continua lá mesmo se o original for movido. O mesmo arquivo importado de novo não duplica.
- Filtros por situação (todas, não tocadas, já tocadas, favoritas), dificuldade, estilo e artista, com contagem; busca sem acento; ordenação por título, artista, adicionadas, tocadas recentemente, melhor nota ou dificuldade.
- Título e artista vêm do próprio arquivo e são editáveis; estilo é livre (sugere os já usados). A dificuldade (1 a 5 estrelas) é estimada pelo app (notas por segundo, acordes, duas mãos, extensão) e pode ser trocada à mão.
- Cada prática nos modos Esperar e Tocar junto vira uma execução no histórico (nota, precisão, modo, mão, arranjo, andamento). A **melhor nota** conta só execuções completas; a **última** é a mais recente.
- Cada música lembra o arranjo e a faixa da última vez.
- Dados em SQLite (`partitab.db`), na mesma pasta.

**Fase 4 — redutor para piano**

Em **Arranjo**, qualquer partitura (tabs de guitarra inclusive) vira uma faixa de piano em pauta dupla, sem tirar as outras faixas — a banda continua tocando junto:

- **Nível 1** — só a melodia na mão direita.
- **Nível 2** — melodia + fundamental do baixo na mão esquerda, uma nota por tempo forte (4/4 em mínimas, 3/4 em mínima pontuada, 6/8 em semínimas pontuadas).
- **Nível 3** — melodia + tríades fechadas tiradas do acompanhamento, com a cifra escrita sobre a melodia quando o acorde muda. As inversões são escolhidas para a mão esquerda se mexer o mínimo.
- A faixa da melodia é adivinhada (voz/solo: a mais aguda e menos polifônica, com bônus pelo nome) e pode ser trocada.
- **Tom fácil**: transpõe para Dó, Sol ou Fá (ou Lá, Mi, Ré menor), o mais próximo; a banda é transposta junto na reprodução. A melodia fica perto do dó central e tudo cabe nas 61 teclas.
- **Salvar na biblioteca** guarda o arranjo como uma partitura nova; **Exportar…** gera um `.gp` que abre no MuseScore para ajustes à mão.

Arquivos MIDI (`.mid`) ainda não abrem: o alphaTab não importa MIDI. Fica para quando a separação de mãos por altura for implementada.

## Como rodar no Windows

Pré-requisitos: [Rust](https://rustup.rs), [Node.js](https://nodejs.org) 20+ e os [pré-requisitos do Tauri](https://tauri.app/start/prerequisites/) (Microsoft C++ Build Tools e WebView2, que já vem no Windows 10/11).

```bash
npm install
npm run tauri dev      # desenvolvimento
npm run tauri build    # instalador em src-tauri/target/release/bundle
```

1. Ligue o PSR-E463 pela porta **USB TO HOST** e abra o app.
2. Escolha a porta do teclado e clique em **Conectar**.
3. Em **⚙ Ajustes**, clique em **Escolher SoundFont…** e aponte para um `.sf2` de piano (o app lembra a escolha). Nenhum SoundFont acompanha o repositório; opções gratuitas: *Salamander Grand Piano*, *Yamaha C5 Grand*, *FluidR3_GM* (GM completo, ~140 MB).

4. Clique em **Abrir partitura…** e escolha um arquivo.

Se o teclado continuar soando junto com o PC, desligue o Local manualmente na função 050 do PSR-E463. Deixe o Touch Response em *Medium* para ter dinâmica.

## Estrutura

```
src/
  App.tsx            interface: barra da partitura, ajustes, teclado virtual
  useScore.ts        integração com o alphaTab (carregar, faixas, reprodução, MIDI sem a mão do aluno)
  reducer/
    harmony.ts       tonalidade, acordes, tríades, encaixe nas 61 teclas, dificuldade
    reduce.ts        monta a faixa de piano (níveis 1 a 3) dentro da partitura
  library/
    Library.tsx      tela da biblioteca (filtros, lista, detalhes, histórico)
    filter.ts        filtros, contagens e ordenação
    useLibrary.ts    ligação com o banco
  practice/
    timeline.ts      notas da faixa em ordem de execução, mãos, andamento
    engine.ts        modo espera, avaliação de tempo, pontuação
    usePractice.ts   liga o motor ao alphaTab, ao teclado e ao sintetizador
  Keyboard.tsx       teclado de 61 teclas
src-tauri/src/
  midi.rs            entrada MIDI, tradução das mensagens, Local Control
  audio.rs           saída cpal + RustySynth, sem locks no callback de áudio
  library.rs         biblioteca em SQLite: músicas, cópias dos arquivos, execuções
  lib.rs             estado do app e comandos Tauri
docs/PLANO.md        plano do projeto
```

Testes: `npm test` (prática, redutor, filtros da biblioteca) e `cd src-tauri && cargo test` (MIDI e biblioteca).
