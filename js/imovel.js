// ============================================================================
// Página de detalhe de um imóvel.
// A URL manda: imovel.html?cod=127
// ============================================================================

import { CONFIG } from './config.js';
import { obterImovel, moeda, precoRotulo, area, TIPOS, linkWhatsApp } from './dados.js';
import { escapar, aviso, ligarFaixaDeExemplo, lerLinkDeVideo } from './ui.js';

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const FINALIDADE = { venda: 'À venda', aluguel: 'Para alugar' };

/* --------------------------------------------------------------- vídeo --- */

const ABRIR_FORA = {
  instagram: ['ph-instagram-logo', 'Ver o vídeo no Instagram'],
  drive: ['ph-google-drive-logo', 'Ver o vídeo no Google Drive'],
  outro: ['ph-play-circle', 'Assistir ao vídeo'],
};

/**
 * Um vídeo vira uma de três coisas:
 *   arquivo         player nativo, é vídeo nosso
 *   YouTube/Vimeo   capa clicável que só carrega o player no clique — um
 *                   iframe do YouTube na carga da página traz junto centenas
 *                   de KB e rastreadores que ninguém pediu
 *   resto           cartão honesto que abre onde o vídeo realmente está
 */
function montarVideo(video, i) {
  if (video.tipo === 'video') {
    return `
<figure class="video">
  <video controls preload="metadata" playsinline src="${escapar(video.url)}"></video>
  ${video.legenda ? `<figcaption>${escapar(video.legenda)}</figcaption>` : ''}
</figure>`;
  }

  const lido = lerLinkDeVideo(video.url);

  if (lido.plataforma === 'arquivo') {
    return `
<figure class="video">
  <video controls preload="metadata" playsinline src="${escapar(video.url)}"></video>
</figure>`;
  }

  if (lido.embutir) {
    return `
<figure class="video video--capa" data-embutir="${escapar(lido.embutir)}" data-i="${i}">
  <button class="video__abrir" type="button" aria-label="Assistir ao vídeo do imóvel">
    ${lido.capa ? `<img src="${escapar(lido.capa)}" alt="" loading="lazy" decoding="async">` : ''}
    <span class="video__play"><i class="ph ph-play" aria-hidden="true"></i></span>
  </button>
</figure>`;
  }

  const [icone, rotulo] = ABRIR_FORA[lido.plataforma] ?? ABRIR_FORA.outro;
  return `
<a class="video video--fora" href="${escapar(video.url)}" target="_blank" rel="noopener">
  <i class="ph ${icone}" aria-hidden="true"></i>
  <span>${rotulo}</span>
</a>`;
}

/** Troca a capa pelo player de verdade, já tocando. */
function ligarVideos() {
  $$('.video--capa').forEach((figura) => {
    figura.querySelector('.video__abrir')?.addEventListener('click', () => {
      const fonte = new URL(figura.dataset.embutir);
      fonte.searchParams.set('autoplay', '1');
      figura.innerHTML =
        `<iframe src="${escapar(fonte.toString())}" title="Vídeo do imóvel" allowfullscreen
                 allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                 referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
      figura.classList.remove('video--capa');
    });
  });
}

/* ------------------------------------------------------------- montagem --- */

function montar(imovel) {
  const fotos = imovel.fotos?.length ? imovel.fotos : (imovel.capa ? [imovel.capa] : []);
  const videos = imovel.videos ?? [];

  const dados = [
    ['Quartos', imovel.quartos || null],
    ['Suítes', imovel.suites || null],
    ['Banheiros', imovel.banheiros || null],
    ['Vagas', imovel.vagas || null],
    ['Área útil', area(imovel.area_util)],
    ['Área total', area(imovel.area_total)],
  ].filter(([, v]) => v != null && v !== '');

  const custos = [
    imovel.condominio ? ['Condomínio', `${moeda(imovel.condominio)}/mês`] : null,
    imovel.iptu ? ['IPTU', `${moeda(imovel.iptu)}/ano`] : null,
  ].filter(Boolean);

  const endereco = [imovel.logradouro, imovel.numero].filter(Boolean).join(', ');
  const local = `${escapar(imovel.bairro)}, ${escapar(imovel.cidade)} ${escapar(imovel.uf ?? '')}`.trim();

  return `
<div class="galeria">
  <div class="galeria__principal">
    ${fotos.length
      ? `<img id="foto-grande" src="${escapar(fotos[0])}" alt="Foto de ${escapar(imovel.titulo)}" fetchpriority="high">
         ${fotos.length > 1 ? `<span class="galeria__contador" id="contador">1 de ${fotos.length}</span>` : ''}`
      : `<div class="mapa--sem-coordenada" style="height:100%">
           <i class="ph ph-image" style="font-size:2rem" aria-hidden="true"></i>
           <p>Este imóvel ainda não tem fotos publicadas.</p>
         </div>`}
  </div>
  ${fotos.length > 1 ? `
  <div class="galeria__miniaturas" id="miniaturas" role="tablist" aria-label="Fotos do imóvel">
    ${fotos.map((f, i) => `
      <button class="miniatura" type="button" role="tab" data-i="${i}"
              aria-current="${i === 0}" aria-label="Ver foto ${i + 1}">
        <img src="${escapar(f)}" alt="" loading="lazy" decoding="async">
      </button>`).join('')}
  </div>` : ''}
</div>

<div class="imovel">
  <div>
    <div class="imovel__cabeca">
      <p class="imovel__local">
        ${escapar(FINALIDADE[imovel.finalidade] ?? '')} ·
        ${escapar(TIPOS[imovel.tipo] ?? imovel.tipo)} em ${local}
      </p>
      <h1 class="imovel__titulo">${escapar(imovel.titulo)}</h1>
    </div>

    ${dados.length ? `
    <div class="imovel__bloco">
      <h2>Ficha do imóvel</h2>
      <dl class="dados">
        ${dados.map(([r, v]) => `<div class="dado"><dt>${r}</dt><dd>${escapar(v)}</dd></div>`).join('')}
      </dl>
    </div>` : ''}

    ${imovel.descricao ? `
    <div class="imovel__bloco">
      <h2>Sobre o imóvel</h2>
      <p class="imovel__descricao">${escapar(imovel.descricao)}</p>
    </div>` : ''}

    ${videos.length ? `
    <div class="imovel__bloco">
      <h2>${videos.length > 1 ? 'Vídeos' : 'Vídeo do imóvel'}</h2>
      <div class="videos">${videos.map(montarVideo).join('')}</div>
    </div>` : ''}

    ${imovel.comodidades?.length ? `
    <div class="imovel__bloco">
      <h2>O que tem</h2>
      <div class="comodidades">
        ${imovel.comodidades.map((c) => `
          <span class="comodidade"><i class="ph ph-check ico" aria-hidden="true"></i>${escapar(c)}</span>
        `).join('')}
      </div>
    </div>` : ''}

    <div class="imovel__bloco">
      <h2>Localização</h2>
      <div class="mapa" id="mapa"></div>
      <p class="mapa-nota" id="mapa-nota">
        ${imovel.mostrar_endereco && endereco
          ? escapar(`${endereco} - ${imovel.bairro}, ${imovel.cidade}`)
          : 'Mostramos a região aproximada. O endereço exato é passado pelo corretor no agendamento da visita.'}
      </p>
    </div>
  </div>

  <aside class="painel">
    <div>
      <p class="painel__preco">${precoRotulo(imovel)}</p>
      ${custos.length ? `
      <div class="painel__custos" style="margin-top:.9rem">
        ${custos.map(([r, v]) => `<div><span>${r}</span><span>${escapar(v)}</span></div>`).join('')}
      </div>` : ''}
    </div>

    <a class="btn" id="zap-imovel" href="#" target="_blank" rel="noopener">
      <i class="ph ph-whatsapp-logo ico" aria-hidden="true"></i>Falar com corretor
    </a>
    <a class="btn btn--secundario" href="index.html#catalogo">Ver outros imóveis</a>

    <p class="painel__codigo">
      Código do imóvel: <strong>${escapar(imovel.codigo)}</strong><br>
      Cite esse número na mensagem que o corretor já sabe qual é.
    </p>
  </aside>
</div>`;
}

/* -------------------------------------------------------------- galeria --- */

function ligarGaleria(fotos) {
  const grande = $('#foto-grande');
  const tiras = $('#miniaturas');
  const contador = $('#contador');
  if (!grande || !tiras) return;

  tiras.addEventListener('click', (e) => {
    const botao = e.target.closest('.miniatura');
    if (!botao) return;
    const i = Number(botao.dataset.i);
    grande.src = fotos[i];
    if (contador) contador.textContent = `${i + 1} de ${fotos.length}`;
    tiras.querySelectorAll('.miniatura')
      .forEach((b) => b.setAttribute('aria-current', String(b === botao)));
  });
}

/* ----------------------------------------------------------------- mapa --- */

function montarMapa(imovel) {
  const caixa = $('#mapa');
  if (!caixa) return;

  if (!window.L) {
    caixa.classList.add('mapa--sem-coordenada');
    caixa.innerHTML = '<p>O mapa não carregou. Recarregue a página para tentar de novo.</p>';
    return;
  }

  const temPonto = imovel.lat != null && imovel.lng != null;
  const centro = temPonto ? [imovel.lat, imovel.lng] : CONFIG.mapa.centro;

  const mapa = L.map(caixa, {
    scrollWheelZoom: false, // rolar a página não pode virar zoom sem querer
    zoomControl: true,
  }).setView(centro, temPonto ? 15 : CONFIG.mapa.zoom);

  // OpenStreetMap: sem chave de API, sem cartão de crédito, sem cota.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapa);

  if (!temPonto) return;

  if (imovel.mostrar_endereco) {
    L.marker(centro).addTo(mapa).bindPopup(escapar(imovel.titulo));
  } else {
    // Sem autorização pra expor o endereço, o mapa mostra um raio em vez de
    // um pino. O proprietário não recebe visita de gente sem corretor.
    L.circle(centro, {
      radius: 420,
      color: getComputedStyle(document.documentElement).getPropertyValue('--vermelho').trim() || '#6e181b',
      weight: 2,
      fillOpacity: 0.12,
    }).addTo(mapa);
  }
}

/* ---------------------------------------------------------------- start --- */

async function iniciar() {
  ligarFaixaDeExemplo();

  $('#rodape-creci').textContent = CONFIG.contato.creci;
  $('#ano').textContent = new Date().getFullYear();

  const zapGeral = linkWhatsApp(null);
  for (const el of [$('#zap-topo'), $('#zap-flutuante')]) {
    if (el) { el.href = zapGeral; el.target = '_blank'; el.rel = 'noopener'; }
  }

  const codigo = new URLSearchParams(location.search).get('cod');
  const alvo = $('#conteudo');

  if (!codigo) {
    alvo.innerHTML = aviso({
      icone: 'ph-question',
      titulo: 'Faltou o código do imóvel',
      texto: 'Volte para o catálogo e escolha um imóvel pela lista.',
    });
    return;
  }

  try {
    const imovel = await obterImovel(codigo);

    if (!imovel) {
      alvo.innerHTML = aviso({
        icone: 'ph-house-line',
        titulo: 'Esse imóvel saiu do ar',
        texto: 'Ele pode ter sido vendido, alugado ou despublicado. Veja o que está disponível agora.',
      });
      return;
    }

    document.title = `${imovel.titulo} | Ah Imobiliária`;
    alvo.innerHTML = montar(imovel);

    const fotos = imovel.fotos?.length ? imovel.fotos : (imovel.capa ? [imovel.capa] : []);
    ligarGaleria(fotos);
    ligarVideos();
    montarMapa(imovel);

    const zap = $('#zap-imovel');
    if (zap) zap.href = linkWhatsApp(imovel);
  } catch (erro) {
    alvo.innerHTML = aviso({
      icone: 'ph-warning-circle',
      titulo: 'Não consegui carregar este imóvel',
      texto: erro.message,
      erro: true,
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
