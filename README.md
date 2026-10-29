# PartiTAB

App de prática de piano para Windows: leitor de partitura (Guitar Pro, MusicXML, MIDI), motor de prática e sintetizador próprio, pensado para o Yamaha PSR-E463 ligado por USB.

O plano completo está em [docs/PLANO.md](docs/PLANO.md).

## Estado atual: fase 1 — piano virtual

- Lista as portas MIDI e conecta ao teclado (lembra a última porta).
- Ao conectar, envia **Local Control Off** (CC 122 = 0) para o teclado parar de soar sozinho; ao desconectar ou fechar o app, envia **Local On** de volta.
- Cada tecla toca um piano SoundFont (`.sf2`) gerado no PC, com velocidade e pedal de sustain.
- O som vai do `midir` direto ao `rustysynth` e ao `cpal` (WASAPI), sem passar pela interface. O buffer pedido é de 256 frames (~5 ms a 48 kHz) quando o dispositivo permite.
- Teclado virtual de 61 teclas (C2–C7) mostra o que está sendo tocado; também dá para tocar com o mouse.

Critério para avançar à fase 2: latência imperceptível tocando escalas rápidas.

## Como rodar no Windows

Pré-requisitos: [Rust](https://rustup.rs), [Node.js](https://nodejs.org) 20+ e os [pré-requisitos do Tauri](https://tauri.app/start/prerequisites/) (Microsoft C++ Build Tools e WebView2, que já vem no Windows 10/11).

```bash
npm install
npm run tauri dev      # desenvolvimento
npm run tauri build    # instalador em src-tauri/target/release/bundle
```

1. Ligue o PSR-E463 pela porta **USB TO HOST** e abra o app.
2. Escolha a porta do teclado e clique em **Conectar**.
3. Clique em **Escolher SoundFont…** e aponte para um `.sf2` de piano (o app lembra a escolha). Nenhum SoundFont acompanha o repositório; opções gratuitas: *Salamander Grand Piano*, *Yamaha C5 Grand*, *FluidR3_GM* (GM completo, ~140 MB).

Se o teclado continuar soando junto com o PC, desligue o Local manualmente na função 050 do PSR-E463. Deixe o Touch Response em *Medium* para ter dinâmica.

## Estrutura

```
src/                 interface React (painéis, teclado virtual)
src-tauri/src/
  midi.rs            entrada MIDI, tradução das mensagens, Local Control
  audio.rs           saída cpal + RustySynth, sem locks no callback de áudio
  lib.rs             estado do app e comandos Tauri
docs/PLANO.md        plano do projeto
```

Testes do núcleo: `cd src-tauri && cargo test`.
