// Conteúdo da Ajuda: um tópico por funcionalidade, em grupos. O texto de busca
// (`keywords`) junta palavras que a pessoa pode digitar e não aparecem no título.

import type { ReactNode } from "react";

export interface HelpTopic {
  id: string;
  group: string;
  title: string;
  keywords: string;
  body: ReactNode;
}

const K = ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>;

export const HELP_TOPICS: HelpTopic[] = [
  // ------------------------------------------------------------ começo
  {
    id: "inicio",
    group: "Começo",
    title: "Primeiros passos",
    keywords: "começar tutorial guia início como usar",
    body: (
      <>
        <p>
          O PartiTAB mostra a partitura, toca a música e corrige o que você toca no teclado, nota a
          nota. Um roteiro para a primeira vez:
        </p>
        <ol>
          <li>
            Ligue o teclado ao computador pela porta <b>USB TO HOST</b>. Abra a engrenagem
            (<b>Ajustes</b>) → <b>Teclado</b>, escolha a porta e clique em <b>Conectar</b>. O
            indicador no topo fica verde.
          </li>
          <li>
            Na aba <b>Biblioteca</b>, abra uma música (a coleção gratuita MuseTrainer já vem com 63
            peças de piano) ou use <b>Adicionar arquivos…</b> para trazer as suas.
          </li>
          <li>
            Na aba <b>Partitura</b>, toque <K>Espaço</K> para ouvir a música.
          </li>
          <li>
            Escolha o modo <b>Esperar</b> e a mão <b>Direita</b>: o cursor para em cada nota até
            você tocá-la. Quando estiver seguro, passe para <b>Tocar junto</b>, que segue no
            andamento e dá nota de 0 a 100.
          </li>
          <li>
            Use <b>Trecho</b> para repetir uma parte difícil e baixe o andamento até sair limpo.
          </li>
        </ol>
        <p>
          Para estudo técnico diário, veja a aba <b>Técnica</b> (escalas e arpejos); para leitura,
          a aba <b>Leitura</b>; para acompanhar a evolução, <b>Progresso</b>.
        </p>
      </>
    ),
  },
  {
    id: "tela",
    group: "Começo",
    title: "A tela do app",
    keywords: "abas menu barra topo interface layout",
    body: (
      <>
        <p>No topo ficam as abas e os botões gerais:</p>
        <ul>
          <li>
            <b>Biblioteca</b> — suas partituras, com filtros, notas e histórico.
          </li>
          <li>
            <b>Partitura</b> — a música aberta: reprodução, modos de prática, trecho, exibição.
          </li>
          <li>
            <b>Leitura</b> — treino de leitura de notas com cartões.
          </li>
          <li>
            <b>Técnica</b> — escalas, arpejos e cadências com dedilhado.
          </li>
          <li>
            <b>Progresso</b> — tempo praticado, meta diária, sequência e evolução.
          </li>
          <li>
            <b>Buscar</b> — sites de partituras e MIDI; o que você baixar entra na biblioteca.
          </li>
        </ul>
        <p>
          À direita: o status do teclado (clique para conectar), o <b>timbre</b> do piano, o tema
          claro/escuro (sol/lua), a tela cheia, a <b>Ajuda</b> (este painel, também com{" "}
          <K>F1</K>) e a engrenagem dos <b>Ajustes</b>.
        </p>
        <p>
          Embaixo, o <b>teclado virtual</b> de 61 teclas: em azul o que você toca, em laranja o que
          a partitura está tocando (ou, no modo Esperar, as notas que faltam). Também dá para tocar
          nele com o mouse.
        </p>
      </>
    ),
  },
  {
    id: "atalhos",
    group: "Começo",
    title: "Atalhos de teclado",
    keywords: "teclas atalho espaço f11 esc m f1",
    body: (
      <dl className="help-keys">
        <dt>
          <K>Espaço</K>
        </dt>
        <dd>Tocar / pausar (ou começar e parar a prática).</dd>
        <dt>
          <K>F1</K>
        </dt>
        <dd>Abrir esta Ajuda.</dd>
        <dt>
          <K>F11</K>
        </dt>
        <dd>Tela cheia.</dd>
        <dt>
          <K>M</K>
        </dt>
        <dd>Marcar o início de um compasso no vídeo do YouTube.</dd>
        <dt>
          <K>Esc</K>
        </dt>
        <dd>Fechar painéis, menus e esta Ajuda.</dd>
      </dl>
    ),
  },

  // ------------------------------------------------------------ teclado e som
  {
    id: "teclado",
    group: "Teclado e som",
    title: "Conectar o teclado",
    keywords: "midi usb porta psr e463 yamaha local control conectar desconectar 050",
    body: (
      <>
        <ol>
          <li>Ligue o cabo USB na porta <b>USB TO HOST</b> do teclado e ligue o teclado.</li>
          <li>
            Em <b>Ajustes → Teclado</b>, escolha a porta (no PSR-E463 aparece como “Digital
            Keyboard” ou parecido). Se não aparecer, clique em <b>Atualizar</b>.
          </li>
          <li>
            Clique em <b>Conectar</b>. O app lembra a porta e reconecta sozinho na próxima vez.
          </li>
        </ol>
        <p>
          Ao conectar, o app desliga o som interno do teclado (mensagem <i>Local Control Off</i>) e
          o piano passa a soar pelo computador, com o timbre escolhido no app. Ao desconectar ou
          fechar o app, o som interno volta.
        </p>
        <p>
          Se aparecer o aviso de que não deu para desligar o som interno, você vai ouvir as notas
          dobradas (teclado + computador). No PSR-E463, ajuste a <b>função 050 (Local)</b> para{" "}
          <b>OFF</b> pelo painel do teclado, ou use o <b>Som pelo teclado</b> (próximo tópico).
        </p>
      </>
    ),
  },
  {
    id: "som-teclado",
    group: "Teclado e som",
    title: "Som pelo teclado",
    keywords: "alto-falante caixa timbre do teclado midi out saída atraso latência canais",
    body: (
      <>
        <p>
          Em <b>Ajustes → Teclado → Som pelo teclado</b> o som sai pelos alto-falantes do próprio
          teclado, em vez do computador:
        </p>
        <ul>
          <li>
            O teclado toca o que você toca, <b>sem atraso</b> e com a voz escolhida no painel dele.
          </li>
          <li>
            A reprodução da partitura (banda, a outra mão, metrônomo e contagem) é enviada ao
            teclado pela saída MIDI, nos canais 2 a 16 (bateria no 10). O canal 1 fica livre, então
            a voz que você escolheu no teclado não muda.
          </li>
          <li>O som do computador fica mudo enquanto a opção estiver ligada.</li>
        </ul>
        <p>
          Precisa que o teclado tenha uma saída MIDI com o mesmo nome da entrada (o PSR-E463 tem).
          Sem ela, a opção fica desativada e o som continua no computador. A escolha fica salva.
        </p>
      </>
    ),
  },
  {
    id: "timbre",
    group: "Teclado e som",
    title: "Timbre, volume e toque",
    keywords: "piano instrumento voz soundfont sf2 volume reverb sensibilidade velocidade",
    body: (
      <>
        <p>
          O botão de <b>timbre</b> na barra superior lista os instrumentos do SoundFont carregado
          por família (pianos, órgãos, cordas…), com busca, favoritos (estrela) e volume. Trocar a
          voz no painel do teclado não muda o timbre do app.
        </p>
        <p>
          Em <b>Ajustes → Som</b>:
        </p>
        <ul>
          <li>
            <b>Volume</b> e <b>Reverb</b> do piano.
          </li>
          <li>
            <b>Sensibilidade ao toque</b>: <b>Leve</b> (soa forte mesmo tocando leve),{" "}
            <b>Normal</b>, <b>Pesada</b> (precisa tocar mais forte) ou <b>Fixa</b> (todas as notas
            com o mesmo volume).
          </li>
          <li>
            <b>SoundFonts gratuitos</b>: baixe com um clique o GeneralUser GS, o FluidR3 GM ou o
            TimGM6mb (bancos mais ricos, com a banda inteira). Os arquivos são conferidos e ficam
            só neste computador; o X apaga o arquivo baixado.
          </li>
          <li>
            <b>Usar arquivo .sf2…</b> carrega qualquer SoundFont do computador;{" "}
            <b>Voltar ao som padrão</b> volta ao piano que vem com o app.
          </li>
        </ul>
        <p>
          O SoundFont vale para o piano e para a reprodução da partitura. Para ouvir bem a banda de
          um Guitar Pro ou MIDI, use um SoundFont General MIDI completo, como o FluidR3 GM.
        </p>
      </>
    ),
  },
  {
    id: "sincronia",
    group: "Teclado e som",
    title: "Sincronia (calibrar o atraso)",
    keywords: "latência atraso calibração calibrar adiantado atrasado ms",
    body: (
      <>
        <p>
          Entre apertar a tecla e ouvir o som existe um pequeno atraso (saída de áudio, cabo, o seu
          costume). Se o modo Tocar junto marca muitas notas como <b>atrasadas</b> mesmo você
          tocando no tempo, calibre:
        </p>
        <ol>
          <li>
            <b>Ajustes → Sincronia → Calibrar</b>.
          </li>
          <li>
            Toque junto com os 16 cliques, usando uma tecla do teclado ou a <K>Espaço</K>.
          </li>
          <li>O app mede o atraso típico e desconta no modo Tocar junto.</li>
        </ol>
        <p>
          Também dá para ajustar à mão, de −100 a 300 ms (duplo clique zera). Se você ligar o{" "}
          <b>Som pelo teclado</b>, vale calibrar de novo.
        </p>
      </>
    ),
  },

  // ------------------------------------------------------------ biblioteca
  {
    id: "biblioteca",
    group: "Biblioteca",
    title: "Biblioteca de partituras",
    keywords: "adicionar importar arquivos filtros favoritas estilo artista dificuldade estrelas ordenar busca editar título",
    body: (
      <>
        <p>
          Toda partitura que você abre entra na biblioteca. <b>Adicionar arquivos…</b> traz várias
          de uma vez. O arquivo é copiado para a pasta do app, então continua lá mesmo se o original
          for movido ou apagado; o mesmo arquivo importado de novo não duplica.
        </p>
        <ul>
          <li>
            <b>Filtros</b> à esquerda: situação (todas, não tocadas, já tocadas, favoritas),
            dificuldade, estilo e artista, com a contagem de cada um.
          </li>
          <li>
            <b>Busca</b> por título ou artista, sem precisar de acento, e <b>Ordenar por</b> título,
            artista, adicionadas, tocadas recentemente, melhor nota ou dificuldade.
          </li>
          <li>
            <b>Lista</b> ou <b>Capas</b> (grade com as capas dos álbuns).
          </li>
          <li>
            Clique numa música para ver o <b>detalhe</b>: editar título, artista e estilo, marcar
            favorita, trocar a dificuldade (1 a 5 estrelas, estimada pelo app), ver o gráfico de
            evolução da nota e o histórico de execuções, e apagar.
          </li>
          <li>
            <b>Abrir e praticar</b> abre na aba Partitura, com o arranjo, a faixa e as seções da
            última vez.
          </li>
        </ul>
        <p>
          Cada prática nos modos Esperar e Tocar junto vira uma execução no histórico (nota,
          precisão, modo, mão, andamento). A <b>melhor nota</b> conta só execuções completas.
        </p>
      </>
    ),
  },
  {
    id: "capas",
    group: "Biblioteca",
    title: "Capas de álbum",
    keywords: "capa imagem foto itunes álbum",
    body: (
      <>
        <p>No detalhe de uma música:</p>
        <ul>
          <li>
            <b>Buscar capa</b> procura no catálogo do iTunes pelo artista e título; escolha a certa
            entre as opções.
          </li>
          <li>
            <b>Escolher imagem…</b> usa um JPG, PNG ou WebP do computador.
          </li>
          <li>
            <b>Remover capa</b> volta à capa desenhada pelo app (as iniciais sobre um degradê).
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "formatos",
    group: "Biblioteca",
    title: "Formatos de arquivo",
    keywords: "gp gp3 gp4 gp5 gpx guitar pro musicxml mxl xml capella cap mid midi pdf mscz musescore",
    body: (
      <>
        <p>O app abre:</p>
        <ul>
          <li>
            <b>Guitar Pro</b> 3 a 8: <code>.gp3</code>, <code>.gp4</code>, <code>.gp5</code>,{" "}
            <code>.gpx</code>, <code>.gp</code>.
          </li>
          <li>
            <b>MusicXML</b>: <code>.musicxml</code>, <code>.mxl</code>, <code>.xml</code>.
          </li>
          <li>
            <b>Capella</b>: <code>.cap</code>.
          </li>
          <li>
            <b>MIDI</b>: <code>.mid</code>, <code>.midi</code> (convertido em partitura; veja
            “Arquivos MIDI”).
          </li>
        </ul>
        <p>
          <b>PDF</b> não abre (é só a imagem da partitura). Arquivos do MuseScore (
          <code>.mscz</code>) também não: no MuseScore, use Arquivo → Exportar → MusicXML.
        </p>
        <p>A partitura é mostrada só em pauta (sem tablatura), mesmo nos arquivos de guitarra.</p>
      </>
    ),
  },
  {
    id: "midi",
    group: "Biblioteca",
    title: "Arquivos MIDI",
    keywords: "mid midi conversão faixas mãos tercinas swing seções marcadores",
    body: (
      <>
        <p>
          Um <code>.mid</code> é convertido em partitura toda vez que abre (o arquivo original
          fica guardado):
        </p>
        <ul>
          <li>
            <b>Faixas</b>: cada instrumento vira uma faixa, com o timbre do arquivo, como num
            Guitar Pro com banda. Os pianos se juntam numa faixa de piano com duas pautas. Um
            arquivo só de piano (ou de um instrumento só) vira piano.
          </li>
          <li>
            <b>Mãos</b>: com duas faixas de piano, cada uma vira uma mão (o nome decide —
            “RH/LH”, “direita/esquerda” — ou a mais aguda fica na direita). Com uma só, as notas se
            dividem pelo dó central.
          </li>
          <li>
            <b>Ritmo</b>: alinhado à semicolcheia ou à tercina; tercinas aparecem como tercinas e
            colcheias “swingadas” viram colcheias normais com a indicação <i>Swing</i>.
          </li>
          <li>
            Andamento, compasso, armadura e marcadores (que viram seções) vêm do arquivo. A
            bateria fica de fora.
          </li>
        </ul>
        <p>
          MIDI gravado ao vivo, sem alinhamento ao tempo, pode sair com ritmo “picado”. Os MIDIs
          do piano-midi.de (aba Buscar) costumam ficar ótimos, porque cada mão vem numa faixa.
        </p>
      </>
    ),
  },
  {
    id: "colecao",
    group: "Biblioteca",
    title: "Coleção gratuita MuseTrainer",
    keywords: "coleção grátis domínio público bach mozart beethoven chopin",
    body: (
      <p>
        Na primeira abertura entram na biblioteca 63 partituras de piano em domínio público (Bach,
        Mozart, Beethoven, Chopin, Debussy, Satie, Joplin e outros), várias com versão fácil, já
        com compositor e estilo. Se apagar alguma, <b>Buscar → Coleções gratuitas → Adicionar à
        biblioteca</b> traz de volta sem duplicar as que já estão lá.
      </p>
    ),
  },

  // ------------------------------------------------------------ partitura
  {
    id: "reproducao",
    group: "Partitura",
    title: "Ouvir a música",
    keywords: "tocar play pausar parar andamento velocidade tempo cursor faixa instrumento",
    body: (
      <>
        <p>Na barra da partitura:</p>
        <ul>
          <li>
            <b>Tocar/pausar</b> (ou <K>Espaço</K>) e <b>Parar</b> (volta ao começo).
          </li>
          <li>
            <b>Andamento</b>: de 25% a 150% da velocidade original. Duplo clique volta a 100%.
          </li>
          <li>
            <b>Faixa</b>: escolha o instrumento a mostrar e praticar (a bateria fica de fora). O
            app abre na primeira faixa de piano, se houver. As outras faixas continuam tocando
            como banda.
          </li>
        </ul>
        <p>
          O teclado virtual mostra em laranja as notas que a partitura está tocando — ótimo para
          ver onde ficam as teclas.
        </p>
      </>
    ),
  },
  {
    id: "modos",
    group: "Partitura",
    title: "Modos de prática: Ouvir, Esperar, Tocar junto",
    keywords: "praticar esperar tocar junto mão direita esquerda ambas metrônomo contagem pontos nota precisão placar",
    body: (
      <>
        <ul>
          <li>
            <b>Ouvir</b> — reprodução normal, sem correção.
          </li>
          <li>
            <b>Esperar</b> — o cursor para em cada nota ou acorde e só avança quando você toca
            todas as notas certas da mão escolhida. As que faltam ficam em laranja no teclado
            virtual. A outra mão é tocada pelo app. Ideal para aprender as notas sem pressa.
          </li>
          <li>
            <b>Tocar junto</b> — a música segue no andamento com a banda, e a mão que você pratica
            sai da reprodução. Cada nota é avaliada: <b>no tempo</b> (até 70 ms de diferença),{" "}
            <b>adiantada</b> ou <b>atrasada</b> (até 200 ms), <b>errada</b> ou <b>perdida</b>.
          </li>
        </ul>
        <p>
          <b>Mão</b>: Direita, Esquerda ou Ambas. Numa partitura de piano com duas pautas, a de
          cima é a direita; com uma pauta só, a divisão é no dó central.
        </p>
        <p>
          <b>Metrônomo</b> e <b>Contagem</b> (um compasso de cliques antes de começar, no Tocar
          junto) ficam ao lado do placar.
        </p>
        <p>
          <b>Placar</b>: pontos de 0 a 100, precisão e a contagem de certas, fora do tempo e
          erradas. Nota no tempo vale 1, fora do tempo 0,5, perdida 0, e cada nota errada desconta
          0,5. Enquanto você toca, a tecla pisca verde (certa), amarela (fora do tempo) ou vermelha
          (errada).
        </p>
      </>
    ),
  },
  {
    id: "trecho",
    group: "Partitura",
    title: "Trecho, loop e rampa de andamento",
    keywords: "loop repetir trecho a-b compassos rampa andamento dominado",
    body: (
      <>
        <p>
          Para repetir só uma parte: <b>arraste o mouse sobre a partitura</b> ou abra{" "}
          <b>Trecho</b> e digite os compassos (De / Até) e clique em <b>Usar</b>.
        </p>
        <ul>
          <li>
            <b>Repetir o trecho</b> liga o loop.
          </li>
          <li>
            <b>Subir o andamento a cada volta limpa</b> (no Tocar junto): começa em 60% e sobe 5%
            a cada volta sem notas erradas nem perdidas, até 100%. Uma volta limpa a 100% é
            “trecho dominado”.
          </li>
          <li>
            <b>Limpar trecho</b> volta à música inteira.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "secoes",
    group: "Partitura",
    title: "Seções",
    keywords: "seção refrão introdução marcador nome trecho salvar",
    body: (
      <>
        <p>
          Em <b>Trecho → Seções</b> aparecem as seções da música: as escritas no arquivo (marcas
          do Guitar Pro e do MusicXML, marcadores do MIDI) e as suas.
        </p>
        <ol>
          <li>Escolha um trecho (arrastando ou pelos compassos).</li>
          <li>
            Digite um nome — Introdução, Refrão, “parte difícil” — e clique em{" "}
            <b>Salvar seção</b>.
          </li>
        </ol>
        <p>
          A seção fica salva com a música, aparece escrita na partitura e um clique nela repete o
          trecho em loop. O X apaga as seções que você criou (as do arquivo não podem ser
          apagadas).
        </p>
      </>
    ),
  },
  {
    id: "erros",
    group: "Partitura",
    title: "Mapa de erros e piores trechos",
    keywords: "erros mapa compassos piores trechos treinar dificuldade",
    body: (
      <>
        <p>
          Cada prática com correção grava onde você errou, por compasso e por nota.
        </p>
        <ul>
          <li>
            <b>Mapa de erros</b> colore os compassos: quanto mais forte, mais erros (somando as
            últimas 10 execuções).
          </li>
          <li>
            <b>Trecho → Onde você mais erra</b> lista os piores trechos (compassos vizinhos viram
            um trecho só); clique para repetir um deles.
          </li>
          <li>
            <b>Treinar os piores trechos</b> faz uma sessão curta: cada trecho em loop com a rampa
            de andamento; ao dominar um, o app passa para o próximo.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "exibir",
    group: "Partitura",
    title: "Exibir: notas caindo, zoom e dedilhado",
    keywords: "exibir notas caindo piano roll synthesia zoom tamanho layout página linha dedilhado dedos",
    body: (
      <>
        <p>
          Em <b>Exibir</b>:
        </p>
        <ul>
          <li>
            <b>Pauta</b> ou <b>Notas caindo</b>: cada nota desce até a tecla certa do teclado
            virtual (azul = mão direita, verde = esquerda; a mão que você não pratica fica
            apagada). Funciona em todos os modos.
          </li>
          <li>
            <b>Tamanho</b> da partitura, de 60% a 160%, e o <b>layout</b>: página (rola para baixo)
            ou uma linha só (rola para o lado).
          </li>
          <li>
            <b>Dedilhado</b>: números de 1 (polegar) a 5 (mínimo) sobre as notas e dentro das notas
            caindo. É uma sugestão calculada pelo app — bom ponto de partida, mas confira os
            trechos difíceis. Nos exercícios da aba Técnica o dedilhado já vem escrito.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "arranjo",
    group: "Partitura",
    title: "Arranjo para piano (níveis)",
    keywords: "arranjo redutor nível fácil melodia baixo acordes tom fácil transpor guitarra tab exportar",
    body: (
      <>
        <p>
          Qualquer partitura — inclusive tabs de guitarra e MIDIs de banda — pode virar uma faixa
          de piano em duas pautas, sem tirar a banda. Em <b>Faixa</b>, escolha o nível:
        </p>
        <ul>
          <li>
            <b>Original</b> — a partitura como está no arquivo.
          </li>
          <li>
            <b>Nível 1</b> — só a melodia, na mão direita.
          </li>
          <li>
            <b>Nível 2</b> — melodia + a nota do baixo na mão esquerda, uma por tempo forte.
          </li>
          <li>
            <b>Nível 3</b> — melodia + acordes (tríades) na esquerda, com a cifra escrita.
          </li>
        </ul>
        <p>
          <b>Melodia vem de</b>: a faixa da melodia é adivinhada (voz ou solo), mas dá para trocar.{" "}
          <b>Tom fácil</b> transpõe para Dó, Sol ou Fá (ou Lá, Mi, Ré menor), o mais próximo, e a
          banda é transposta junto.
        </p>
        <p>
          <b>Salvar na biblioteca</b> guarda o arranjo como uma partitura nova;{" "}
          <b>Exportar…</b> gera um arquivo <code>.gp</code> que abre no MuseScore para ajustes à
          mão.
        </p>
      </>
    ),
  },
  {
    id: "gravar",
    group: "Partitura",
    title: "Gravar o que você toca",
    keywords: "gravar gravação ouvir exportar mid midi bolinha vermelha",
    body: (
      <>
        <p>
          O botão vermelho ao lado do tempo grava as notas e o pedal que você toca (no teclado ou
          com o mouse), junto com a partitura. Clique de novo para parar.
        </p>
        <p>
          Em <b>Gravação</b>: <b>Ouvir</b> toca de volta com o cursor acompanhando, e{" "}
          <b>Exportar .mid…</b> salva um arquivo MIDI, que abre em qualquer editor (e no próprio
          PartiTAB).
        </p>
      </>
    ),
  },
  {
    id: "video",
    group: "Partitura",
    title: "Tocar junto com um vídeo do YouTube",
    keywords: "youtube vídeo sincronizar marcar compasso m gravação original",
    body: (
      <>
        <ol>
          <li>
            Em <b>Vídeo</b>, cole o link do YouTube. O vídeo passa a ser o relógio: a partitura, o
            cursor e a correção seguem o tempo dele.
          </li>
          <li>
            Dê play e toque <K>M</K> no primeiro tempo do compasso 1.
          </li>
          <li>
            Se a partitura se adiantar ou atrasar, toque <K>M</K> no início de qualquer compasso:
            o app corrige o andamento dali em diante.
          </li>
        </ol>
        <p>O vídeo e as marcações ficam salvos com a música.</p>
        <ul>
          <li>O som vem do próprio YouTube; nada é baixado.</li>
          <li>Com vídeo, o arranjo fica no tom da gravação (o Tom fácil desliga).</li>
          <li>Vídeos que o dono proíbe de tocar fora do YouTube não funcionam no app.</li>
          <li>O YouTube só aceita algumas velocidades; o andamento é arredondado.</li>
        </ul>
      </>
    ),
  },

  // ------------------------------------------------------------ estudo
  {
    id: "tecnica",
    group: "Estudo",
    title: "Técnica: escalas, arpejos e cadências",
    keywords: "escala arpejo cadência tonalidade maior menor harmônica natural oitava dedilhado exercício técnica aquecimento",
    body: (
      <>
        <p>Na aba <b>Técnica</b>, monte o exercício:</p>
        <ul>
          <li>
            <b>Exercício</b>: Escala, Arpejo ou Cadência (I–IV–V–I, acordes na direita e baixo na
            esquerda).
          </li>
          <li>
            <b>Tonalidade</b>: Maior, Menor harmônica ou Menor natural, nas 12 tônicas.
          </li>
          <li>
            <b>Mãos</b>: Direita, Esquerda ou Juntas (a esquerda uma ou duas oitavas abaixo).
          </li>
          <li>
            <b>Extensão</b> (1 ou 2 oitavas), <b>Figura</b> (semínimas, colcheias, semicolcheias)
            e <b>Andamento</b>.
          </li>
        </ul>
        <p>
          <b>Praticar</b> gera a partitura com o <b>dedilhado tradicional</b> escrito (o polegar
          cai sempre nos mesmos graus de cada tonalidade, como nos métodos de escala) e abre na
          aba Partitura. O exercício entra na biblioteca (artista “Técnica”), então Esperar, Tocar
          junto, a rampa de andamento e o Progresso funcionam como numa música.
        </p>
        <p>
          <b>Caminho sugerido</b> leva do mais fácil ao mais difícil; <b>Seus exercícios</b>{" "}
          mostra os já praticados com a melhor nota. Dica: comece com mãos separadas a 60–72 bpm
          e suba o andamento só quando sair limpo.
        </p>
      </>
    ),
  },
  {
    id: "leitura",
    group: "Estudo",
    title: "Leitura de partitura",
    keywords: "leitura ler notas cartões clave sol fá linhas suplementares sustenidos bemóis repetição espaçada",
    body: (
      <>
        <p>
          Na aba <b>Leitura</b> aparece uma nota na pauta; toque a mesma nota no teclado. O app
          mede acerto e tempo de resposta.
        </p>
        <ul>
          <li>
            Escolha a <b>clave</b> (sol, fá ou as duas), a <b>extensão</b> (só dentro da pauta ou
            com linhas suplementares) e se entram sustenidos e bemóis.
          </li>
          <li>Dá para esconder o teclado virtual, para ler sem olhar as teclas.</li>
          <li>
            Sessões de 20 cartões. Notas erradas ou lentas (mais de 2,5 s) voltam mais vezes
            (repetição espaçada); ao lado aparecem as notas mais difíceis para você. O histórico
            fica salvo.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "progresso",
    group: "Estudo",
    title: "Progresso",
    keywords: "progresso meta diária minutos sequência dias gráfico evolução estatísticas",
    body: (
      <>
        <p>A aba <b>Progresso</b> mostra:</p>
        <ul>
          <li>
            <b>Hoje</b>: minutos praticados e quanto falta para a <b>meta diária</b> (escolha de 10
            a 60 minutos no canto).
          </li>
          <li>
            <b>Sequência</b>: dias seguidos com prática.
          </li>
          <li>
            <b>Últimos 7 dias</b> e <b>precisão</b> média dos últimos 30 dias.
          </li>
          <li>Gráfico de minutos por dia (30 dias) e as músicas que mais evoluíram.</li>
        </ul>
        <p>Contam só as práticas com correção (Esperar e Tocar junto).</p>
      </>
    ),
  },

  // ------------------------------------------------------------ buscar
  {
    id: "buscar",
    group: "Buscar",
    title: "Buscar partituras e MIDI",
    keywords: "buscar baixar download sites cifra club ultimate guitar songsterr musescore imslp bitmidi freemidi mutopia piano-midi",
    body: (
      <>
        <p>
          Digite a música na aba <b>Buscar</b> e escolha onde procurar. <K>Enter</K> procura
          “MIDI de piano” na web. As fontes de piano vêm primeiro: piano-midi.de (clássicos, com as
          mãos separadas), Mutopia, BitMidi e FreeMidi; depois MuseScore, IMSLP, Cifra Club,
          Ultimate Guitar e Songsterr.
        </p>
        <p>
          O site abre numa janela do próprio PartiTAB e funciona como um navegador: login,
          assinatura e regras de cada site continuam valendo. <b>Todo arquivo Guitar Pro,
          MusicXML ou MIDI baixado ali entra direto na biblioteca</b> e aparece na lista de
          downloads da aba.
        </p>
        <ul>
          <li>
            No Cifra Club, abra a música, clique em <b>Guitar Pro</b> e no botão de download: o
            arquivo chega sozinho.
          </li>
          <li>
            Um link direto de arquivo (<code>.gp</code>, <code>.mxl</code>, <code>.mid</code>…)
            colado no campo de endereço é baixado direto para a biblioteca.
          </li>
          <li>
            PDF e <code>.mscz</code> são recusados, com a explicação.
          </li>
          <li>
            <b>Registro da janela de busca</b>, no fim da aba, mostra cada janela e download — útil
            quando um arquivo não chega.
          </li>
        </ul>
      </>
    ),
  },

  // ------------------------------------------------------------ ajustes
  {
    id: "tela-cheia",
    group: "Ajustes",
    title: "Tela cheia, monitores e tema",
    keywords: "tela cheia monitor segundo monitor tema escuro claro sistema f11",
    body: (
      <>
        <ul>
          <li>
            <b>Tela cheia</b>: botão ao lado da engrenagem ou <K>F11</K>.
          </li>
          <li>
            Com mais de um monitor, <b>Ajustes → Tela</b> escolhe em qual a tela cheia abre
            (numerados da esquerda para a direita, com a resolução e o principal marcado). Há
            também a opção de abrir o app já em tela cheia.
          </li>
          <li>
            <b>Tema</b>: o botão de sol/lua alterna entre escuro (padrão) e claro;{" "}
            <b>Ajustes → Tela</b> tem também “Do sistema”, que segue o Windows.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "backup",
    group: "Ajustes",
    title: "Backup e restauração",
    keywords: "backup cópia segurança restaurar zip outro computador",
    body: (
      <>
        <p>
          Em <b>Ajustes → Backup</b>:
        </p>
        <ul>
          <li>
            <b>Fazer backup…</b> salva um <code>.zip</code> com as músicas, práticas, histórico de
            leitura, partituras, capas e preferências.
          </li>
          <li>
            <b>Restaurar backup…</b> troca a biblioteca pela do arquivo (serve para passar para
            outro computador). A biblioteca anterior fica guardada na pasta{" "}
            <code>antes-da-restauracao</code>.
          </li>
        </ul>
        <p>SoundFonts baixados e o token do GitHub não entram no backup.</p>
      </>
    ),
  },
  {
    id: "atualizacoes",
    group: "Ajustes",
    title: "Atualizações",
    keywords: "atualizar versão nova token github instalar",
    body: (
      <>
        <p>
          Em <b>Ajustes → Atualizações</b> aparece a versão instalada. Como o repositório é
          privado, o app precisa de um token do GitHub para ver as versões novas:
        </p>
        <ol>
          <li>
            No GitHub, crie um <i>fine-grained personal access token</i> com acesso só ao
            repositório do PartiTAB e permissão <b>Contents: Read-only</b>.
          </li>
          <li>Cole o token no campo. Ele fica salvo só neste computador.</li>
        </ol>
        <p>
          Com o token, o app verifica ao abrir; havendo versão nova, aparece um aviso no topo e{" "}
          <b>Atualizar agora</b> baixa o instalador, fecha o app e abre o instalador. A biblioteca e
          os ajustes são mantidos. Sem token, <b>Ver todas as versões no GitHub</b> abre a página
          de versões no navegador.
        </p>
      </>
    ),
  },

  // ------------------------------------------------------------ problemas
  {
    id: "problemas",
    group: "Problemas",
    title: "Problemas comuns",
    keywords: "problema erro não funciona sem som dobrado atraso não aparece porta download travou",
    body: (
      <dl className="help-faq">
        <dt>O teclado não aparece na lista de portas.</dt>
        <dd>
          Confira o cabo na porta USB TO HOST e se o teclado está ligado; clique em{" "}
          <b>Atualizar</b>. Feche outros programas que estejam usando o teclado (só um programa
          pode usar a porta MIDI de cada vez).
        </dd>
        <dt>Ouço as notas dobradas (eco).</dt>
        <dd>
          O teclado e o computador estão soando juntos. Ajuste a função 050 (Local) do PSR-E463
          para OFF, ou ligue o <b>Som pelo teclado</b> e o computador para de tocar suas notas.
        </dd>
        <dt>Não sai som.</dt>
        <dd>
          Veja em <b>Ajustes → Som</b> se há aviso de saída de áudio e se o volume não está no
          zero. Com <b>Som pelo teclado</b> ligado, o som sai só pelo teclado: confira o volume
          dele.
        </dd>
        <dt>O Tocar junto marca minhas notas como atrasadas.</dt>
        <dd>
          Faça a calibração em <b>Ajustes → Sincronia</b>.
        </dd>
        <dt>Baixei um arquivo na busca e ele não entrou na biblioteca.</dt>
        <dd>
          Olhe o <b>Registro da janela de busca</b> no fim da aba Buscar: ele diz se o download
          começou e por que foi recusado (PDF, .mscz, zip…). Se o site não liberar o download no
          clique, tente clicar com o botão direito e “abrir em nova janela”.
        </dd>
        <dt>Um MIDI ficou com o ritmo estranho.</dt>
        <dd>
          MIDI tocado ao vivo, sem alinhamento ao tempo, não vira uma partitura limpa. Prefira
          arquivos de sites de partitura (piano-midi.de, Mutopia) ou use o modo Esperar, que não
          depende do ritmo.
        </dd>
        <dt>A banda soa pobre ou só com piano.</dt>
        <dd>
          Baixe um SoundFont General MIDI completo (FluidR3 GM ou GeneralUser GS) em{" "}
          <b>Ajustes → Som</b>.
        </dd>
      </dl>
    ),
  },
];
