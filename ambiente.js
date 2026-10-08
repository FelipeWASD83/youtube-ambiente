// Mundo isolado da extensao. Faz duas coisas:
//  1. le as opcoes (chrome.storage) e as publica no <html>, para o qualidade.js
//     (que roda no mundo da pagina e nao enxerga o storage) e para o CSS;
//  2. a luz ambiente: copia o quadro do video para dois canvases pequenos e o
//     CSS os estica e embaça atras da pagina inteira.
(() => {
  const PADRAO = { qualidade: true, luz: true, intensidade: 80, desfoque: 40 };
  const raiz = document.documentElement;
  let cfg = { ...PADRAO };

  // ------------------------------------------------------------------ opcoes
  function publicar() {
    raiz.setAttribute('data-ya-qualidade', cfg.qualidade ? '1' : '0');
    raiz.setAttribute('data-ya-luz', cfg.luz ? '1' : '0');
    raiz.style.setProperty('--ya-intensidade', String(cfg.intensidade / 100));
    raiz.style.setProperty('--ya-desfoque', cfg.desfoque + 'px');
    pedirQuadro();
  }
  try {
    chrome.storage.local.get(PADRAO, (v) => { cfg = { ...PADRAO, ...v }; publicar(); });
    chrome.storage.onChanged.addListener((mudancas) => {
      for (const [k, { newValue }] of Object.entries(mudancas)) if (k in PADRAO) cfg[k] = newValue;
      publicar();
    });
  } catch { /* extensao recarregada: este script ficou orfao */ publicar(); }

  // ----------------------------------------------------------------- canvases
  const LARGURA = 64;      // o canvas e minusculo de proposito: a cor e o que importa
  const FOLGA = 6;         // o desfoque do canvas comeria a borda; desenho maior que ele
  const ESPALHA = 1.5;     // tamanho da luz "de perto", em multiplos do video

  const caixa = document.createElement('div');
  caixa.id = 'ya-luz';
  const longe = document.createElement('canvas');
  longe.className = 'longe';
  const perto = document.createElement('canvas');
  perto.className = 'perto';
  caixa.append(longe, perto);
  raiz.append(caixa);
  const ctxPerto = perto.getContext('2d', { alpha: false });
  const ctxLonge = longe.getContext('2d', { alpha: false });

  // ------------------------------------------------------------------- quadro
  const achar = () =>
    document.querySelector('#movie_player video.html5-main-video') ||
    document.querySelector('video.html5-main-video');

  const deveAparecer = (v) =>
    cfg.luz && location.pathname === '/watch' && !!v && v.videoWidth > 0 &&
    !document.fullscreenElement && !document.hidden;

  let video = null;
  let ativo = false;
  let ultimoDesenho = 0;
  let tamanho = '';
  const comLaco = new WeakSet();

  function desenhar(v) {
    if (v.readyState < 2) return;
    const h = Math.max(8, Math.round((LARGURA * v.videoHeight) / v.videoWidth));
    if (perto.width !== LARGURA || perto.height !== h) {
      perto.width = longe.width = LARGURA;
      perto.height = longe.height = h;
    }
    ctxPerto.filter = 'blur(2px)';
    ctxPerto.drawImage(v, -FOLGA, -FOLGA, LARGURA + 2 * FOLGA, h + 2 * FOLGA);
    ctxPerto.filter = 'none';
    ctxLonge.drawImage(perto, 0, 0);
  }

  function posicionar(v) {
    const r = v.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const w = Math.round(r.width * ESPALHA);
    const h = Math.round(r.height * ESPALHA);
    const chave = w + 'x' + h;
    if (chave !== tamanho) {
      tamanho = chave;
      perto.style.width = w + 'px';
      perto.style.height = h + 'px';
    }
    const x = Math.round(r.left + r.width / 2 - w / 2);
    const y = Math.round(r.top + r.height / 2 - h / 2);
    perto.style.transform = `translate(${x}px, ${y}px)`;
  }

  function ligar(v) {
    if (v === video) return;
    video = v;
    if (!v || comLaco.has(v)) return;
    comLaco.add(v);
    if (v.requestVideoFrameCallback) {
      const volta = () => {
        const agora = performance.now();
        if (agora - ultimoDesenho > 30) { ultimoDesenho = agora; renderizar(true); }
        v.requestVideoFrameCallback(volta);
      };
      v.requestVideoFrameCallback(volta);
    }
    if (window.ResizeObserver) new ResizeObserver(pedirQuadro).observe(v);
  }

  function renderizar(comQuadro) {
    const v = achar();
    ligar(v);
    const mostrar = deveAparecer(v);
    if (mostrar !== ativo) {
      ativo = mostrar;
      raiz.toggleAttribute('data-ya-ativa', mostrar);
    }
    if (!mostrar) return;
    posicionar(v);
    if (comQuadro || v.paused) desenhar(v);
  }

  let agendado = false;
  function pedirQuadro() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => { agendado = false; renderizar(false); });
  }

  for (const ev of ['loadeddata', 'seeked', 'play', 'pause', 'resize'])
    document.addEventListener(ev, pedirQuadro, true);
  for (const ev of ['yt-navigate-finish', 'fullscreenchange', 'visibilitychange'])
    document.addEventListener(ev, pedirQuadro);
  addEventListener('scroll', pedirQuadro, { capture: true, passive: true });
  addEventListener('resize', pedirQuadro);
  // Rede de seguranca: modo teatro, barra lateral e afins mexem no layout sem avisar.
  setInterval(pedirQuadro, 500);
})();
