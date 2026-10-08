const PADRAO = { qualidade: true, luz: true, intensidade: 80, desfoque: 40 };
const $ = (id) => document.getElementById(id);

function mostrar(cfg) {
  $('qualidade').checked = cfg.qualidade;
  $('luz').checked = cfg.luz;
  $('intensidade').value = cfg.intensidade;
  $('desfoque').value = cfg.desfoque;
  $('saida-intensidade').textContent = cfg.intensidade + '%';
  $('saida-desfoque').textContent = cfg.desfoque + ' px';
  $('ajustes').classList.toggle('desligado', !cfg.luz);
}

chrome.storage.local.get(PADRAO, mostrar);

for (const id of ['qualidade', 'luz'])
  $(id).addEventListener('change', () => {
    chrome.storage.local.set({ [id]: $(id).checked });
    $('ajustes').classList.toggle('desligado', !$('luz').checked);
  });

for (const id of ['intensidade', 'desfoque'])
  $(id).addEventListener('input', () => {
    const v = Number($(id).value);
    chrome.storage.local.set({ [id]: v });
    $('saida-' + id).textContent = v + (id === 'intensidade' ? '%' : ' px');
  });
