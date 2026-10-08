// Mundo isolado da extensao. Faz duas coisas:
//  1. le as opcoes (chrome.storage) e as publica no <html>, para o qualidade.js
//     (que roda no mundo da pagina e nao enxerga o storage) e para o CSS;
//  2. a luz ambiente: pega so a FAIXA da borda do video (esquerda, direita, topo,
//     base e os quatro cantos) e a repete para fora, num canvas pequeno que o CSS
//     estica, embaça e esmaece com a distancia, atras da pagina inteira.
(() => {
  const PADRAO = { qualidade: true, luz: true, intensidade: 80, desfoque: 30, alcance: 100 };
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

  // ----------------------------------------------------------------- canvas
  const PX = 12;           // cada pixel do canvas vale ~12 px da tela: a cor e o que importa
  const BORDA = 0.012;     // espessura da faixa copiada, em fracao do video
  const ALCANCE = 0.8;     // ate onde a luz vai, em multiplos do lado maior do video (com alcance 100%)

  const caixa = document.createElement('div');
  caixa.id = 'ya-luz';
  const luz = document.createElement('canvas');
  caixa.append(luz);
  raiz.append(caixa);
  const ctx = luz.getContext('2d');

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
  const comLaco = new WeakSet();

  // Geometria da luz: o video no meio e uma margem de F ao redor. Tudo em pixels do
  // canvas (bw x bh e o video, mf e a margem), com a escala px/py de volta para a tela.
  let geo = null;
  let sujo = true;       // canvas recem-redimensionado: precisa de um quadro novo

  function medir(v) {
    const r = v.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const F = Math.min(1400, Math.max(r.width, r.height) * ALCANCE * (cfg.alcance / 100));
    const bw = Math.max(8, Math.round(r.width / PX));
    const bh = Math.max(8, Math.round(r.height / PX));
    const mf = Math.max(4, Math.round(F / PX));
    const px = r.width / bw;
    const py = r.height / bh;
    return { r, bw, bh, mf, px, py };
  }

  function posicionar(v) {
    const g = medir(v);
    if (!g) return false;
    const { r, bw, bh, mf, px, py } = g;
    if (!geo || geo.bw !== bw || geo.bh !== bh || geo.mf !== mf) {
      luz.width = bw + 2 * mf;      // mudar o tamanho limpa o canvas: o proximo quadro redesenha
      luz.height = bh + 2 * mf;
      luz.style.width = (luz.width * px) + 'px';
      luz.style.height = (luz.height * py) + 'px';
      luz.style.setProperty('--fx', (100 * mf / luz.width) + '%');
      luz.style.setProperty('--fy', (100 * mf / luz.height) + '%');
      sujo = true;
    }
    geo = { bw, bh, mf, px, py };
    luz.style.transform = `translate(${Math.round(r.left - mf * px)}px, ${Math.round(r.top - mf * py)}px)`;
    return true;
  }

  function desenhar(v) {
    if (v.readyState < 2 || !geo) return;
    const { bw, bh, mf } = geo;
    const vw = v.videoWidth, vh = v.videoHeight;
    const ex = Math.max(2, Math.round(vw * BORDA));
    const ey = Math.max(2, Math.round(vh * BORDA));
    ctx.clearRect(0, 0, luz.width, luz.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = 'blur(1.5px)';
    ctx.drawImage(v, 0, 0, vw, vh, mf, mf, bw, bh);                       // meio (some atras do video)
    ctx.drawImage(v, 0, 0, ex, vh, 0, mf, mf, bh);                        // esquerda
    ctx.drawImage(v, vw - ex, 0, ex, vh, mf + bw, mf, mf, bh);            // direita
    ctx.drawImage(v, 0, 0, vw, ey, mf, 0, bw, mf);                        // topo
    ctx.drawImage(v, 0, vh - ey, vw, ey, mf, mf + bh, bw, mf);            // base
    ctx.drawImage(v, 0, 0, ex, ey, 0, 0, mf, mf);                         // cantos
    ctx.drawImage(v, vw - ex, 0, ex, ey, mf + bw, 0, mf, mf);
    ctx.drawImage(v, 0, vh - ey, ex, ey, 0, mf + bh, mf, mf);
    ctx.drawImage(v, vw - ex, vh - ey, ex, ey, mf + bw, mf + bh, mf, mf);
    ctx.filter = 'none';
    sujo = false;
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
    if (!posicionar(v)) return;
    if (comQuadro || v.paused || sujo) desenhar(v);
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
