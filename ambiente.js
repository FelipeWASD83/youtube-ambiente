// Mundo isolado da extensao. Faz duas coisas:
//  1. le as opcoes (chrome.storage) e as publica no <html>, para o qualidade.js
//     (que roda no mundo da pagina e nao enxerga o storage) e para o CSS;
//  2. a luz ambiente: pega so a BORDA do video e a repete para fora em LEQUE (cada
//     ponto da borda sai na direcao que vai do centro do video ate ele, entao os
//     lados saem em angulos diferentes e os cantos na diagonal), num canvas pequeno
//     que o CSS estica, embaça e esmaece com a distancia, atras da pagina inteira.
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
  const SETORES = 360;     // quantos raios saem do video (cada um leva a cor de um ponto da borda)
  const ALCANCE = 1.1;     // ate onde a luz vai, em multiplos do lado maior do video (com alcance 100%)

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
    const F = Math.min(1900, Math.max(r.width, r.height) * ALCANCE * (cfg.alcance / 100));
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

  // O video em miniatura (bw x bh): dele se le a cor da borda, e ele tambem vai no
  // meio do canvas para o desfoque nao ter um buraco na emenda com o player.
  const mini = document.createElement('canvas');
  const ctxMini = mini.getContext('2d', { willReadFrequently: true });

  function desenhar(v) {
    if (v.readyState < 2 || !geo) return;
    const { bw, bh, mf } = geo;
    if (mini.width !== bw || mini.height !== bh) { mini.width = bw; mini.height = bh; }
    ctxMini.imageSmoothingQuality = 'high';
    ctxMini.drawImage(v, 0, 0, bw, bh);
    let pix;
    try { pix = ctxMini.getImageData(0, 0, bw, bh).data; } catch { return; }

    ctx.clearRect(0, 0, luz.width, luz.height);
    ctx.drawImage(mini, mf, mf);

    // Cada raio parte do centro, atravessa o ponto da borda do video (A) e vai ate a
    // beirada da margem (B). Os setores se sobrepõem um pouco para nao abrir fresta.
    const cx = mf + bw / 2, cy = mf + bh / 2;
    const hw = bw / 2, hh = bh / 2;
    const HW = hw + mf, HH = hh + mf;
    const passo = (2 * Math.PI) / SETORES;
    const alcancar = (c, s, mx, my) => Math.min(mx / (Math.abs(c) || 1e-6), my / (Math.abs(s) || 1e-6));
    for (let i = 0; i < SETORES; i++) {
      const a0 = i * passo, a1 = a0 + passo * 1.6, am = a0 + passo / 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const cm = Math.cos(am), sm = Math.sin(am);
      // cor: um pontinho para dentro da borda, na direcao do meio do setor
      const tm = alcancar(cm, sm, hw, hh) - 1.5;
      const x = Math.min(bw - 1, Math.max(0, Math.round(hw + cm * tm)));
      const y = Math.min(bh - 1, Math.max(0, Math.round(hh + sm * tm)));
      const k = (y * bw + x) * 4;
      ctx.fillStyle = `rgb(${pix[k]},${pix[k + 1]},${pix[k + 2]})`;
      const ta0 = alcancar(c0, s0, hw, hh), ta1 = alcancar(c1, s1, hw, hh);
      const tb0 = alcancar(c0, s0, HW, HH), tb1 = alcancar(c1, s1, HW, HH);
      ctx.beginPath();
      ctx.moveTo(cx + c0 * ta0, cy + s0 * ta0);
      ctx.lineTo(cx + c0 * tb0, cy + s0 * tb0);
      ctx.lineTo(cx + c1 * tb1, cy + s1 * tb1);
      ctx.lineTo(cx + c1 * ta1, cy + s1 * ta1);
      ctx.closePath();
      ctx.fill();
    }
    // um desfoque leve de uma vez so tira o degrau entre um raio e o vizinho
    ctx.globalCompositeOperation = 'copy';
    ctx.filter = 'blur(2px)';
    ctx.drawImage(luz, 0, 0);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
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
