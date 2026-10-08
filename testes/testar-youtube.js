// Teste ao vivo da extensao no YouTube de verdade.
//
//   node testes\testar-youtube.js              (sem janela)
//   node testes\testar-youtube.js --headful    (mostrando o Brave)
//   node testes\testar-youtube.js --video ID   (outro video)
//
// Abre um Brave descartavel (perfil proprio, apagado no fim) com esta pasta
// carregada, abre um video e confere, pelo lado da pagina:
//   - a qualidade que o player esta tocando e a maior que ele oferece;
//   - a luz ambiente aparecendo, com cor, ao lado do video (medida em pixels
//     de um screenshot, nao deduzida do CSS);
//   - desligar pelas opcoes desfaz tudo.
// Precisa de internet. E teste ao vivo: anuncio ou rede ruim podem atrasar o
// player, por isso ele espera e, se falhar, vale rodar de novo antes de culpar o codigo.
// Screenshots ficam em testes\prints (fora do git).
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HEADFUL = process.argv.includes('--headful');
const iv = process.argv.indexOf('--video');
const VIDEO = iv > 0 ? process.argv[iv + 1] : 'y9n6HkftavM';
const BRAVE = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const PORTA_CDP = 9398;
const EXT = path.join(__dirname, '..');
const PERFIL = path.join(os.tmpdir(), 'lab-yt-ambiente-' + Date.now());
const PRINTS = path.join(__dirname, 'prints');
fs.mkdirSync(PRINTS, { recursive: true });

let ws; let proximoId = 1;
const pendentes = new Map();
const contextos = [];
function enviar(method, params = {}, sessionId) {
  const id = proximoId++;
  return new Promise((resolve, reject) => {
    pendentes.set(id, { resolve, reject });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
}
async function conectar(url) {
  ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendentes.has(m.id)) {
      const p = pendentes.get(m.id);
      pendentes.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    } else if (m.method === 'Runtime.executionContextCreated') {
      contextos.push(m.params.context);
    } else if (m.method === 'Runtime.executionContextsCleared') {
      contextos.length = 0;
    } else if (m.method === 'Runtime.executionContextDestroyed') {
      const i = contextos.findIndex((c) => c.id === m.params.executionContextId);
      if (i >= 0) contextos.splice(i, 1);
    }
  };
}
async function esperarCdp(url) {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {}
    await dormir(250);
  }
  throw new Error('CDP nao respondeu');
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const resultados = [];
function anotar(nome, ok, obtido) {
  resultados.push({ nome, ok });
  console.log((ok ? '  OK   ' : '  FALHA') + ' | ' + nome.padEnd(44) + ' | ' + JSON.stringify(obtido));
}

(async () => {
  const args = [
    '--user-data-dir=' + PERFIL, '--load-extension=' + EXT, '--disable-extensions-except=' + EXT,
    '--remote-debugging-port=' + PORTA_CDP, '--no-first-run', '--no-default-browser-check',
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1896,1062',
    'about:blank',
  ];
  if (!HEADFUL) args.unshift('--headless=new');
  const brave = spawn(BRAVE, args, { stdio: 'ignore' });
  const encerrar = () => { try { brave.kill(); } catch {} };
  process.on('exit', encerrar);

  try {
    const versao = await esperarCdp('http://127.0.0.1:' + PORTA_CDP + '/json/version');
    await conectar(versao.webSocketDebuggerUrl);
    const { targetInfos } = await enviar('Target.getTargets');
    const alvo = targetInfos.find((t) => t.type === 'page');
    const pag = (await enviar('Target.attachToTarget', { targetId: alvo.targetId, flatten: true })).sessionId;
    // eventos de contexto chegam sem sessionId no filtro acima; aceitar de qualquer sessao
    await enviar('Runtime.enable', {}, pag);
    await enviar('Page.enable', {}, pag);
    await enviar('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
    }, pag);

    async function avaliar(expressao, contextId) {
      const r = await enviar('Runtime.evaluate',
        { expression: expressao, awaitPromise: true, returnByValue: true, ...(contextId ? { contextId } : {}) }, pag);
      if (r.exceptionDetails) return { erro: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
      return r.result.value;
    }
    async function ate(expressao, ms = 30000) {
      const fim = Date.now() + ms;
      let v;
      while (Date.now() < fim) {
        v = await avaliar(expressao);
        if (v && !v.erro) return v;
        await dormir(500);
      }
      return v;
    }
    async function print(nome, largura, altura) {
      if (largura) await enviar('Emulation.setDeviceMetricsOverride',
        { width: largura, height: altura, deviceScaleFactor: 1, mobile: false }, pag);
      await dormir(1500);
      const { data } = await enviar('Page.captureScreenshot', { format: 'png' }, pag);
      fs.writeFileSync(path.join(PRINTS, nome + '.png'), Buffer.from(data, 'base64'));
      return data;
    }
    // media de brilho e de "cor" (maior - menor canal) de um retangulo do screenshot
    async function medir(data, x, y, w, h) {
      return avaliar(`new Promise((res) => {
        const im = new Image();
        im.onload = () => {
          const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h};
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(im, -${x}, -${y});
          const d = g.getImageData(0, 0, ${w}, ${h}).data;
          let L = 0, C = 0, n = d.length / 4;
          for (let i = 0; i < d.length; i += 4) {
            L += 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
            C += Math.max(d[i], d[i+1], d[i+2]) - Math.min(d[i], d[i+1], d[i+2]);
          }
          res({ lum: Math.round(L/n), cor: Math.round(C/n) });
        };
        im.src = 'data:image/png;base64,${data}';
      })`);
    }
    async function opcao(chave, valor) {
      const ctx = contextos.filter((c) => c.origin.startsWith('chrome-extension://')).pop();
      if (!ctx) throw new Error('contexto da extensao nao achado');
      await avaliar(`chrome.storage.local.set({ ${chave}: ${JSON.stringify(valor)} })`, ctx.id);
      await dormir(1500);
    }

    if (process.argv.includes('--claro'))
      await enviar('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, pag);
    // ------------------------------------------------------------ abrir
    await enviar('Page.navigate', { url: 'https://www.youtube.com/watch?v=' + VIDEO }, pag);
    const tocando = await ate(`(() => { const v = document.querySelector('video.html5-main-video');
      return v && v.readyState >= 3 && v.videoWidth > 0 && !document.querySelector('.ad-showing') ? { w: v.videoWidth, h: v.videoHeight } : false; })()`, 45000);
    anotar('video do YouTube tocando (sem anuncio)', !!tocando && !tocando.erro, tocando);
    if (!tocando || tocando.erro) {
      console.log('estado:', JSON.stringify(await avaliar(`({ url: location.href, titulo: document.title,
        anuncio: !!document.querySelector('.ad-showing'), erroPlayer: document.querySelector('.ytp-error')?.innerText || null,
        v: (() => { const v = document.querySelector('video.html5-main-video'); return v && { ready: v.readyState, w: v.videoWidth, paused: v.paused, t: v.currentTime }; })(),
        texto: document.body?.innerText.slice(0, 300) })`)));
      await print('falha-ao-abrir');
      throw new Error('o video nao carregou: sem rede, anuncio ou YouTube mudou');
    }

    const ia = process.argv.indexOf('--avaliar');
    if (ia > 0) {
      await dormir(4000);
      console.log(JSON.stringify(await avaliar(fs.readFileSync(process.argv[ia + 1], 'utf8')), null, 1));
      return;
    }

    // ------------------------------------------------------------ qualidade
    const q = await ate(`(() => {
      const p = document.getElementById('movie_player');
      const niveis = p.getAvailableQualityLevels().filter(n => n !== 'auto');
      const v = document.querySelector('video.html5-main-video');
      return { pedida: document.documentElement.getAttribute('data-ya-qualidade-pedida'),
               niveis, tocando: p.getPlaybackQuality(), altura: v.videoHeight };
    })()`, 20000);
    anotar('a extensao pediu um nivel', !!q?.pedida, q);
    // o player leva alguns segundos para trocar de fato
    const r = await ate(`(() => {
      const p = document.getElementById('movie_player');
      const niveis = p.getAvailableQualityLevels().filter(n => n !== 'auto');
      const maior = niveis.map(n => ({ n, a: ({tiny:144,small:240,medium:360,large:480,hd720:720,hd1080:1080,hd1440:1440,hd2160:2160,hd2880:2880,highres:4320})[n] || 0 }))
                          .sort((a, b) => b.a - a.a)[0];
      return p.getPlaybackQuality() === maior.n ? { tocando: p.getPlaybackQuality(), maior: maior.n } : false;
    })()`, 40000);
    anotar('o player toca no maior nivel que oferece', !!r && !r.erro, r || q);

    // Prova de que foi a extensao: derruba o player para o menor nivel, desliga
    // e liga a opcao, e ele tem que voltar sozinho para o maior.
    await opcao('qualidade', false);
    await avaliar(`document.getElementById('movie_player').setPlaybackQualityRange('small', 'small')`);
    const baixou = await ate(`document.getElementById('movie_player').getPlaybackQuality() === 'small' ? 'small' : false`, 30000);
    await opcao('qualidade', true);
    const voltou = await ate(`document.getElementById('movie_player').getPlaybackQuality() === 'hd2160' ? 'hd2160' : false`, 40000);
    anotar('derrubado para "small", a extensao devolve ao maximo', baixou === 'small' && voltou === 'hd2160', { baixou, voltou });

    // O inicio desse video e preto: pula para uma parte colorida.
    await avaliar(`(() => { const v = document.querySelector('video.html5-main-video'); v.currentTime = 95; return true; })()`);
    await ate(`(() => { const v = document.querySelector('video.html5-main-video'); return v.currentTime > 96 && v.readyState >= 3 && !v.paused; })()`, 30000);
    await dormir(2500);

    // ------------------------------------------------------------ luz
    const ativa = await ate(`document.documentElement.hasAttribute('data-ya-ativa')`, 10000);
    anotar('luz ambiente ativada na pagina /watch', ativa === true, ativa);

    const info = await avaliar(`(() => { const v = document.querySelector('video.html5-main-video').getBoundingClientRect();
      const p = document.querySelector('#ya-luz .perto'); const g = p.getContext('2d');
      const d = g.getImageData(0, 0, p.width, p.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i+1] + d[i+2];
      return { video: { x: Math.round(v.left), y: Math.round(v.top), w: Math.round(v.width), h: Math.round(v.height) },
               canvas: p.width + 'x' + p.height, brilhoCanvas: Math.round(s / (d.length / 4 * 3)),
               opacidade: getComputedStyle(document.getElementById('ya-luz')).opacity };
    })()`);
    anotar('o canvas recebe o quadro (nao e preto)', info.brilhoCanvas > 8, info);

    await avaliar('window.scrollTo(0,0)');
    const pLigada = await print('01-ligada-1896x1062');
    // faixa logo a direita do video: so pode ter cor se a luz estiver aparecendo
    const ladoLigada = await medir(pLigada, info.video.x + info.video.w + 4, info.video.y + 40, 120, 200);
    await opcao('luz', false);
    const pDesl = await print('02-desligada-1896x1062');
    const ladoDesl = await medir(pDesl, info.video.x + info.video.w + 4, info.video.y + 40, 120, 200);
    const limpo = await avaliar(`({ ativa: document.documentElement.hasAttribute('data-ya-ativa'), cinematics: !!document.querySelector('#ya-luz') && getComputedStyle(document.getElementById('ya-luz')).opacity })`);
    anotar('luz vaza cor para o lado do video', ladoLigada.cor > ladoDesl.cor + 6, { ligada: ladoLigada, desligada: ladoDesl });
    anotar('desligar pelas opcoes apaga a luz', limpo.ativa === false && Number(limpo.cinematics) === 0, limpo);
    await opcao('luz', true);

    // ------------------------------------------------------------ monitores dele
    for (const [nome, w, h] of [['ultrawide-3440x1440', 3440, 1440], ['em-pe-1080x1920', 1080, 1920]]) {
      await print('03-' + nome, w, h);
    }
    await enviar('Emulation.clearDeviceMetricsOverride', {}, pag);

    // ------------------------------------------------------------ tema claro
    await enviar('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, pag);
    await enviar('Page.navigate', { url: 'https://www.youtube.com/watch?v=' + VIDEO + '&t=95s' }, pag);
    await ate(`(() => { const v = document.querySelector('video.html5-main-video'); return v && v.currentTime > 96 && v.readyState >= 3 && !document.querySelector('.ad-showing'); })()`, 45000);
    await dormir(3000);
    const claro = await avaliar(`({ ativa: document.documentElement.hasAttribute('data-ya-ativa'),
      fundo: getComputedStyle(document.documentElement).backgroundColor })`);
    await print('04-tema-claro-1896x1062');
    anotar('tema claro: luz ativa sobre fundo claro', claro.ativa === true, claro);
    await enviar('Emulation.setEmulatedMedia', { features: [] }, pag);

    // ------------------------------------------------------------ qualidade desligada
    await opcao('qualidade', false);
    const off = await avaliar(`document.documentElement.getAttribute('data-ya-qualidade')`);
    anotar('opcao de qualidade desligada chega na pagina', off === '0', off);

    const erros = await avaliar(`window.__errosYa || []`);
    console.log('prints em ' + PRINTS);
  } catch (e) {
    anotar('execucao do teste', false, String(e.message || e));
  } finally {
    encerrar();
  }
  const falhas = resultados.filter((r) => !r.ok);
  console.log(falhas.length ? `\n${falhas.length} falha(s).` : '\nTudo passou.');
  process.exit(falhas.length ? 1 : 0);
})();
