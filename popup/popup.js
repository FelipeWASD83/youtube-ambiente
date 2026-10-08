const PADRAO = { qualidade: true, luz: true, intensidade: 80, desfoque: 30, alcance: 100 };
const $ = (id) => document.getElementById(id);

function mostrar(cfg) {
  $('qualidade').checked = cfg.qualidade;
  $('luz').checked = cfg.luz;
  $('intensidade').value = cfg.intensidade;
  $('desfoque').value = cfg.desfoque;
  $('alcance').value = cfg.alcance;
  $('saida-intensidade').textContent = cfg.intensidade + '%';
  $('saida-desfoque').textContent = cfg.desfoque + ' px';
  $('saida-alcance').textContent = cfg.alcance + '%';
  $('ajustes').classList.toggle('desligado', !cfg.luz);
}

chrome.storage.local.get(PADRAO, mostrar);

for (const id of ['qualidade', 'luz'])
  $(id).addEventListener('change', () => {
    chrome.storage.local.set({ [id]: $(id).checked });
    $('ajustes').classList.toggle('desligado', !$('luz').checked);
  });

for (const id of ['intensidade', 'desfoque', 'alcance'])
  $(id).addEventListener('input', () => {
    const v = Number($(id).value);
    chrome.storage.local.set({ [id]: v });
    $('saida-' + id).textContent = v + (id === 'desfoque' ? ' px' : '%');
  });
