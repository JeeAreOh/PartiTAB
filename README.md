# PartiTAB

App de prática de piano para Windows: leitor de partitura (Guitar Pro, MusicXML, MIDI), motor de prática e sintetizador próprio, pensado para o Yamaha PSR-E463 ligado por USB.

O plano completo está em [docs/PLANO.md](docs/PLANO.md).

## Estado atual: fase 2 — leitor de partitura

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
  useScore.ts        integração com o alphaTab (carregar, faixas, reprodução)
  Keyboard.tsx       teclado de 61 teclas
src-tauri/src/
  midi.rs            entrada MIDI, tradução das mensagens, Local Control
  audio.rs           saída cpal + RustySynth, sem locks no callback de áudio
  lib.rs             estado do app e comandos Tauri
docs/PLANO.md        plano do projeto
```

Testes do núcleo: `cd src-tauri && cargo test`.
