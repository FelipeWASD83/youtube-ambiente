# CLAUDE.md — youtube-ambiente

Extensão do Brave (Manifest V3, JS puro, sem build e sem dependência) que, só em
`https://www.youtube.com/*`, (1) põe a maior qualidade disponível sozinha e (2)
desenha uma luz ambiente atrás da página inteira. O `README.md` explica o uso;
este arquivo existe para não refazer descoberta que já custou teste. Criado em
08/10/2026.

## 1. Como as peças se falam

- `qualidade.js` roda no **mundo da página** (`"world": "MAIN"` no manifest):
  só ali existem os métodos do `#movie_player`. Ele **não enxerga
  `chrome.storage`**.
- `ambiente.js` roda no mundo isolado. Lê as opções e as publica no `<html>`:
  `data-ya-qualidade` ("1"/"0"), `data-ya-luz` ("1"/"0") e as variáveis CSS
  `--ya-intensidade` e `--ya-desfoque`. É assim que o `qualidade.js` e o CSS
  ficam sabendo. Atributo ausente = "ainda não sei", e o `qualidade.js` não faz
  nada até ele aparecer.
- `data-ya-ativa` (presença) é a chave do visual: só existe enquanto a luz está
  de fato aparecendo (página `/watch`, vídeo com imagem, fora de tela cheia, aba
  visível). O CSS que torna os fundos do YouTube transparentes depende dela, e
  por isso desligar a luz devolve a página ao normal.
- `data-ya-qualidade-pedida` é só rastro: o nível que a extensão pediu por último.
  O teste lê.

## 2. Qualidade: o que já está confirmado

- `getAvailableQualityLevels()` + `setPlaybackQualityRange(nivel, nivel)` **funcionam
  hoje** no YouTube (medido em 08/10/2026, Brave 154). A documentação oficial da
  API de iframe diz que esses métodos morreram, mas isso vale para o iframe
  embutido, não para o player da própria página.
- **Prova de que é a extensão e não o automático do YouTube:** o teste derruba o
  player para `small`, desliga e liga a opção, e ele volta sozinho para o maior.
- Reaplica em todo `loadedmetadata` (captura no `document`, porque evento de
  mídia não borbulha), no `yt-navigate-finish` e quando a opção liga. Anúncio
  troca a fonte do `<video>` e o player volta ao automático, por isso o
  `loadedmetadata`.
- A ordem da lista de níveis não é usada: o maior é escolhido pelo número
  (tabela `ALTURA` no `qualidade.js`).
- **Plano B, não implementado:** se um dia o `setPlaybackQualityRange` deixar de
  funcionar, o caminho é abrir a engrenagem do player e clicar na maior opção do
  menu "Qualidade" (o "Youtube HD" do Greasy Fork faz assim). O teste
  "o player toca no maior nível que oferece" é quem avisa.

## 3. Luz ambiente: as decisões

- **Só a borda do vídeo, repetida para fora em leque** (decisões dele em
  08/10/2026: a primeira versão esticava o vídeo inteiro embaçado; a segunda
  esticava a borda reta, só na horizontal nos lados e na vertical em cima e
  embaixo; ele pediu "diferentes angulações"). Um canvas único, onde cada pixel
  vale ~12 px da tela: no meio o vídeo (some atrás do player), em volta uma
  margem de `F` pixels. Da borda saem `SETORES` (360) raios a partir do **centro
  do vídeo**: cada um atravessa um ponto da borda, leva a cor dele (lida de uma
  miniatura do vídeo, `mini`, por `getImageData`) e vai até a beirada da margem.
  Lados saem inclinados, cantos saem na diagonal. Função `desenhar`.
- Os setores se sobrepõem 60% de propósito: sem isso o antialiasing abre uma
  fresta escura entre dois quadriláteros. Depois um `blur(2px)` único no canvas
  tira o degrau entre raios vizinhos.
- Se o `getImageData` falhar (canvas marcado como contaminado), a função sai sem
  desenhar e a luz fica parada no último quadro.
- O esmaecimento é uma `mask-image` com dois gradientes multiplicados
  (`mask-composite: intersect`), horizontal e vertical, que somem nas pontas;
  `--fx` e `--fy` (calculados no JS) dizem quanto do canvas é margem. Cheia no
  meio, onde está o vídeo.
- Alcance: `F = lado maior do vídeo x 1,1 x alcance%` (teto de 1900 px; era 0,8 e 1400 até 08/10/2026, ele pediu mais distância). O
  alcance é a opção do popup.
- `imageSmoothingQuality = 'high'` na miniatura: reduzir um quadro 4K para ~100 px
  sem isso dá serrilhado.
- Mudar o tamanho do canvas limpa ele: a variável `sujo` força um redesenho no
  render seguinte (senão a luz some até o próximo quadro, e some de vez com o
  vídeo pausado).
- O vídeo é medido pelo retângulo do próprio `<video>` (que no YouTube já é a
  área da imagem, sem as faixas pretas), não pelo `#movie_player`.
- `#ya-luz` é `position: fixed; z-index: -1`: fica acima do fundo do `<html>` e
  abaixo de todo o conteúdo. **O fundo do `<html>` não pode ser mexido**, senão o
  navegador pinta a tela de branco. As camadas que cobrem a luz estão listadas
  no fim do `ambiente.css` e viram transparentes só com `data-ya-ativa`.
- **Se um dia a luz sumir num pedaço da página**, o suspeito é um elemento novo do
  YouTube com fundo opaco. Achar com `document.elementsFromPoint(x, y)` e olhar o
  `backgroundColor` de cada um (foi assim que apareceu o `ytd-masthead #background`,
  branco só no tema claro) e acrescentar o seletor à lista do CSS.
- `#cinematics` (a luz nativa do YouTube) é escondido enquanto a nossa está ligada.
- Layout muda sem aviso (modo teatro, barra lateral), por isso há um
  `setInterval` de 500 ms de rede de segurança além do `ResizeObserver` e do scroll.
- Não existe leitura de pixel do canvas na extensão (só desenho), então vídeo com
  DRM só fica com a luz preta, sem erro.

## 4. Testar

```powershell
node testes\testar-youtube.js            # sem janela
node testes\testar-youtube.js --headful  # mostrando o Brave
node testes\testar-youtube.js --claro --avaliar arquivo.js   # roda um script na página e imprime
```

Sobe um Brave descartável (perfil próprio, **sem som**, `--mute-audio`), carrega a
pasta, abre um vídeo de verdade do YouTube e confere: qualidade, prova de que foi a
extensão, luz no fundo ao lado do vídeo (medida em pixels de screenshot, na faixa vazia à esquerda do player), tema
claro e desligar pelas opções. É teste **ao vivo**: precisa de internet e anúncio
ou rede ruim atrasam o player. Se falhar na abertura do vídeo (já aconteceu, sem
que o código tivesse mudado), rodar de novo antes de culpar a extensão. O teste
imprime o estado da página nesse caso. Os prints saem em `testes\prints` (fora do git).

**Nunca rodar `brave.exe` solto no terminal** (nem `--version`): sem um
`--user-data-dir` próprio ele abre janela dentro do Brave de uso do Felipe.

O vídeo de teste (`y9n6HkftavM`) começa preto por uns segundos: o teste pula para
os 95 s antes de medir a luz.
