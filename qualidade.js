// Roda no mundo da PAGINA (world: MAIN): so ali os metodos do player existem.
// Nao enxerga chrome.storage, entao o ambiente.js avisa pelo atributo
// data-ya-qualidade no <html> ("1" liga, "0" desliga; ausente = ainda nao sei).
(() => {
  const raiz = document.documentElement;
  const ATTR = 'data-ya-qualidade';

  // Do menor para o maior. A lista de niveis do YouTube vem em ordem, mas nao
  // confio nisso: escolho pelo numero.
  const ALTURA = {
    tiny: 144, small: 240, medium: 360, large: 480, hd720: 720, hd1080: 1080,
    hd1440: 1440, hd2160: 2160, hd2880: 2880, highres: 4320,
  };
  const altura = (n) => ALTURA[n] ?? (parseInt(String(n).replace(/\D/g, ''), 10) || 0);

  function melhorNivel(player) {
    const niveis = (player.getAvailableQualityLevels?.() ?? []).filter((n) => n !== 'auto');
    return niveis.sort((a, b) => altura(b) - altura(a))[0] ?? null;
  }

  function aplicar(tentativa = 0) {
    if (raiz.getAttribute(ATTR) !== '1') return;
    const player = document.getElementById('movie_player');
    const alvo = player && melhorNivel(player);
    if (!alvo) {
      // O player ainda esta montando a lista de formatos.
      if (tentativa < 20) setTimeout(() => aplicar(tentativa + 1), 400);
      return;
    }
    player.setPlaybackQualityRange?.(alvo, alvo);
    player.setPlaybackQuality?.(alvo);
    raiz.setAttribute('data-ya-qualidade-pedida', alvo);
  }

  // Cada video novo (e o fim de um anuncio) troca a fonte do <video> e o player
  // volta ao automatico: reaplico toda vez que os metadados chegam. Evento de
  // midia nao borbulha, por isso a captura no document.
  let fio = 0;
  const agendar = () => { clearTimeout(fio); fio = setTimeout(() => aplicar(), 250); };
  document.addEventListener('loadedmetadata', agendar, true);
  document.addEventListener('yt-navigate-finish', agendar);
  new MutationObserver(agendar).observe(raiz, { attributes: true, attributeFilter: [ATTR] });
})();
