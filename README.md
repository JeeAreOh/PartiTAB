# PartiTAB

App de prática de piano para Windows: leitor de partitura (Guitar Pro, MusicXML, MIDI), motor de prática e sintetizador próprio, pensado para o Yamaha PSR-E463 ligado por USB.

O plano completo está em [docs/PLANO.md](docs/PLANO.md).

## Estado atual: fase 6 — ferramentas de estudo

**Fase 1 — piano virtual**

- Lista as portas MIDI e conecta ao teclado (lembra a última porta).
- Ao conectar, envia **Local Control Off** (CC 122 = 0) para o teclado parar de soar sozinho; ao desconectar ou fechar o app, envia **Local On** de volta.
- Cada tecla toca um piano SoundFont (`.sf2`) gerado no PC, com velocidade e pedal de sustain.
- O app já abre com som: usa o SONiVOX (`src-tauri/resources/soundfonts/`, Apache 2.0) até você escolher outro.
- **Timbre** na barra superior: lista os instrumentos do SoundFont por família (pianos, órgãos, cordas…), com busca, favoritos e volume. Trocar a voz no próprio teclado não muda o timbre do app.
- Em **Ajustes → Som**: volume, reverb, sensibilidade ao toque (Leve, Normal, Pesada, Fixa) e um catálogo de SoundFonts gratuitos para baixar com um clique (GeneralUser GS, FluidR3 GM, TimGM6mb), conferidos por SHA-256 e guardados na pasta de dados do app.
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

O motor de prática roda na interface (TypeScript), não no Rust: o som do teclado continua indo direto do MIDI ao sintetizador, e o atraso de poucos ms até a interface afeta só a correção. O atraso da saída de áudio é descontado pela calibração em **Ajustes → Sincronia** (veja a fase 6).

**Interface**

Três abas no topo: **Biblioteca**, **Partitura** e **Buscar**. Toda a configuração (porta MIDI, som, SoundFont) fica na gaveta de **Ajustes** (engrenagem ou o indicador de status no canto). Na partitura, uma barra com tocar/parar, andamento, **Faixa** (faixa e arranjo para piano) e **Vídeo**; logo abaixo, o modo (Ouvir, Esperar, Tocar junto), a mão e o placar. Tema claro e escuro conforme o Windows. Atalhos: <kbd>Espaço</kbd> toca/pausa, <kbd>M</kbd> marca compasso no vídeo, <kbd>Esc</kbd> fecha painéis.

**Tocar junto com um vídeo do YouTube**

Em **Vídeo**, cole o link. O vídeo passa a ser o relógio: a partitura, o cursor e a correção seguem o tempo dele (o alphaTab entra no modo de mídia externa). Para sincronizar, dê play e toque <kbd>M</kbd> no primeiro tempo do compasso 1; se a partitura se adiantar ou atrasar, toque <kbd>M</kbd> no início de qualquer compasso e o app corrige o andamento dali em diante (cada toque vai para o compasso mais próximo, contando repetições). O vídeo e as marcações ficam salvos com a música.

- O áudio vem do próprio YouTube; nada é baixado.
- Com vídeo, o arranjo fica no tom da gravação (o "Tom fácil" desliga).
- Vídeos cujo dono proíbe a reprodução fora do YouTube não tocam no app.
- A velocidade do YouTube só vai de 25% a 200% em passos fixos; o andamento escolhido é arredondado por ele.

**Buscar partituras**

A aba **Buscar** procura a música no Cifra Club, Ultimate Guitar, Songsterr, MuseScore, IMSLP ou na web, ou abre qualquer endereço. O site abre numa janela do próprio PartiTAB e funciona como num navegador: login, assinatura e regras de cada site continuam valendo. Todo arquivo Guitar Pro ou MusicXML baixado ali entra direto na biblioteca; PDF, MIDI e arquivos do MuseScore (.mscz) são recusados com a explicação. O app não raspa nem baixa nada dos sites por conta própria.

**Fase 5 — prática dirigida**

- **Loop A–B com rampa de andamento.** Em **Trecho**, arraste sobre a partitura ou digite os compassos e ligue **Repetir o trecho**. No modo Tocar junto, a rampa começa em 60% e sobe 5% a cada volta limpa (sem notas erradas nem perdidas) até 100%; uma volta limpa a 100% é "trecho dominado". No modo Esperar o trecho também repete.
- **Mapa de erros.** Cada prática grava onde você errou, por compasso e por nota. **Mapa de erros** colore os compassos (mais forte = mais erros, somando as últimas 10 execuções) e **Trecho → Onde você mais erra** lista os piores (compassos vizinhos viram um trecho só).
- **Treinar os piores trechos.** Uma sessão curta: cada trecho em loop com a rampa, e ao dominar um o app passa para o próximo.
- **Leitura** (aba própria). Cartões com uma nota na pauta; toque a nota no teclado. Clave de sol, de fá ou as duas; só na pauta ou com linhas suplementares; com ou sem sustenidos e bemóis; opção de esconder o teclado virtual. Repetição espaçada: notas erradas ou lentas (mais de 2,5 s) voltam mais vezes, e o histórico fica salvo entre sessões. Sessões de 20 cartões, com as notas mais difíceis ao lado.
- **Evolução da nota** no detalhe de cada música da biblioteca (execuções completas com ponto cheio, incompletas vazado).

**Fase 6 — ferramentas de estudo**

- **Sincronia (calibração do atraso).** Em **Ajustes → Sincronia → Calibrar**, toque junto com 16 cliques (tecla do teclado ou barra de espaço). O app mede o atraso típico entre o som e o seu toque (saída de áudio + teclado + o seu costume) e desconta no modo Tocar junto. Dá para ajustar à mão de −100 a 300 ms (duplo clique zera).
- **Gravar o que você toca.** O botão vermelho ao lado do tempo grava as notas e o pedal (do teclado MIDI ou do mouse). Depois, **Gravação → Ouvir** toca de volta com o cursor da partitura acompanhando, e **Exportar .mid…** salva um arquivo MIDI (abre em qualquer editor).
- **Notas caindo.** Em **Exibir**, troque **Pauta** por **Notas caindo**: cada nota desce até a tecla certa do teclado virtual (azul = mão direita, verde = esquerda; a mão que você não está praticando fica apagada). Funciona em todos os modos, inclusive Esperar.
- **Dedilhado sugerido.** Em **Exibir**, números de 1 (polegar) a 5 (mínimo) sobre as notas da pauta e dentro das notas caindo. É calculado pelo app (mão parada sempre que der, passagem do polegar nas escalas, acordes sem esticar demais): bom ponto de partida, mas confira trechos difíceis.
- **Tamanho e layout da partitura.** Em **Exibir**: zoom de 60% a 160% e layout em página (rola para baixo) ou uma linha só (rola para o lado).
- **Progresso** (aba própria). Minutos praticados hoje com meta diária (10 a 60 min), dias seguidos de prática, últimos 7 dias, precisão média, gráfico dos últimos 30 dias e as músicas que mais evoluíram (clique para abrir). Conta o tempo das práticas com correção.
- **Backup.** Em **Ajustes → Backup**, **Fazer backup…** salva um `.zip` com o banco (músicas, práticas, leitura), as partituras, as capas e as preferências. **Restaurar backup…** troca a biblioteca pela do arquivo (os caminhos são refeitos para o computador atual) e guarda a anterior em `antes-da-restauracao`. SoundFonts baixados e o token do GitHub não entram.

**Capas de álbum**

Cada música pode ter uma capa, mostrada na lista, na visão **Capas** da biblioteca (grade), no detalhe e na barra da partitura. No detalhe da música: **Buscar capa** procura no catálogo do iTunes pelo artista e título (você escolhe a certa entre as opções), **Escolher imagem…** usa um JPG/PNG/WebP do computador e **Remover capa** volta para a capa desenhada pelo app (degradê com as iniciais e o artista), que toda música sem imagem ganha. As imagens ficam na pasta `capas` dos dados do app.

**Coleção gratuita MuseTrainer**

Na primeira abertura, 63 partituras de piano em domínio público entram na biblioteca, já com título, compositor e estilo (Barroco, Clássico, Romântico, Impressionista, Ragtime, Tradicional, Natal): Bach, Mozart, Beethoven, Chopin, Debussy, Satie, Joplin, Tchaikovsky e outros, várias com versão fácil. Os arquivos vêm com o app ([origem e detalhes](src-tauri/resources/collections/musetrainer/LEIAME.md)); se você apagar alguma, **Buscar → Coleções gratuitas → Adicionar à biblioteca** traz de volta sem duplicar. Seis arquivos da coleção original ficaram de fora porque as composições ainda têm direitos autorais.

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

## Versões e instalador

O instalador para Windows é gerado pelo GitHub Actions ([`.github/workflows/release.yml`](.github/workflows/release.yml)) e publicado em **Releases** do repositório (privado).

Para lançar uma versão:

```bash
npm run version:set -- 0.2.0   # atualiza package.json, Cargo.toml e os lockfiles
git commit -am "Versão 0.2.0" && git push
```

Depois, no GitHub: **Actions → Release Windows → Run workflow** (com "Publicar" marcado). O workflow roda os testes, gera `PartiTAB_<versão>_x64-setup.exe` (NSIS, em português) e o `.msi`, cria a tag `v<versão>` e a release com os dois. Também dá para publicar empurrando a tag (`git tag v0.2.0 && git push origin v0.2.0`); a tag precisa bater com o `package.json`. Desmarcando "Publicar", só gera o instalador (fica como artefato da execução). Publicar de novo a mesma versão é recusado: suba a versão antes.

**Atualização dentro do app.** Em **Ajustes → Atualizações** aparece a versão instalada. Como o repositório é privado, o app precisa de um token do GitHub para ler as releases: crie um *fine-grained personal access token* com acesso só a este repositório e permissão **Contents: Read-only**, e cole no campo. O token fica salvo só no computador (`atualizacao.json`, na pasta de dados do app). Com ele, o app verifica ao abrir; havendo versão nova, aparece um aviso no topo e o botão **Atualizar agora** baixa o instalador, abre e fecha o app — a biblioteca e os ajustes são mantidos. Sem token, **Ver todas as versões no GitHub** abre a página de releases no navegador.

## Como rodar no Windows

Pré-requisitos: [Rust](https://rustup.rs), [Node.js](https://nodejs.org) 20+ e os [pré-requisitos do Tauri](https://tauri.app/start/prerequisites/) (Microsoft C++ Build Tools e WebView2, que já vem no Windows 10/11).

```bash
npm install
npm run tauri dev      # desenvolvimento
npm run tauri build    # instalador em src-tauri/target/release/bundle
```

1. Ligue o PSR-E463 pela porta **USB TO HOST** e abra o app.
2. Em **Ajustes** (engrenagem), escolha a porta do teclado e clique em **Conectar**.
3. O som padrão já funciona. Para um piano melhor, em **Ajustes → Som** baixe o *GeneralUser GS* do catálogo ou use **Usar arquivo .sf2…** com um SoundFont seu (o app lembra a escolha).

4. Na **Biblioteca**, use **Adicionar arquivos…** ou **Buscar na internet**.

Se o teclado continuar soando junto com o PC, desligue o Local manualmente na função 050 do PSR-E463. Deixe o Touch Response em *Medium* para ter dinâmica.

## Estrutura

```
src/
  App.tsx            interface: barra da partitura, ajustes, teclado virtual
  useScore.ts        integração com o alphaTab (carregar, faixas, reprodução, MIDI sem a mão do aluno)
  reducer/
    harmony.ts       tonalidade, acordes, tríades, encaixe nas 61 teclas, dificuldade
    reduce.ts        monta a faixa de piano (níveis 1 a 3) dentro da partitura
  Settings.tsx       gaveta de ajustes (teclado e som)
  ui/                ícones e popover
  search/Search.tsx  aba de busca (sites e downloads)
  video/
    youtube.ts       player do YouTube como mídia externa do alphaTab
    sync.ts          marcações de compasso (pontos de sincronia)
    VideoPanel.tsx   vídeo e botão de marcar
  library/
    Library.tsx      tela da biblioteca (filtros, lista, detalhes, histórico)
    filter.ts        filtros, contagens e ordenação
    useLibrary.ts    ligação com o banco
  reading/           treino de leitura (cartões, repetição espaçada, pauta em SVG)
  practice/
    drill.ts         rampa de andamento, piores trechos, compassos ↔ pulsos
    ErrorOverlay.tsx mapa de erros sobre a partitura
    timeline.ts      notas da faixa em ordem de execução, mãos, andamento
    engine.ts        modo espera, avaliação de tempo, pontuação
    usePractice.ts   liga o motor ao alphaTab, ao teclado e ao sintetizador
    latency.ts       calibração do atraso (LatencySection.tsx: o assistente)
    recording.ts     gravação e exportação MIDI (useRecorder.ts: gravar e ouvir)
    fingering.ts     dedilhado sugerido (programação dinâmica por mão)
    FallingNotes.tsx visão "notas caindo"
  progress/          painel de progresso (resumo por dia, sequência, evolução)
  sound/             seletor de timbre, ajustes de som e catálogo de SoundFonts
  Keyboard.tsx       teclado de 61 teclas
src-tauri/src/
  midi.rs            entrada MIDI, tradução das mensagens, Local Control
  audio.rs           saída cpal + RustySynth, sem locks no callback de áudio
  library.rs         biblioteca em SQLite: músicas, cópias dos arquivos, execuções,
                     erros por compasso/nota, cartões de leitura
  search.rs          janela de busca: importa os arquivos baixados nela
  updates.rs         verificador de versão (releases do GitHub)
  covers.rs          busca e download de capas
  sounds.rs          timbres, ajustes de som e catálogo de SoundFonts
  backup.rs          backup e restauração da biblioteca (.zip)
  lib.rs             estado do app e comandos Tauri
docs/PLANO.md        plano do projeto
```

Testes: `npm test` (prática, redutor, filtros da biblioteca) e `cd src-tauri && cargo test` (MIDI e biblioteca).
