// ============================================================================
// Peças de interface reaproveitadas pela home, pelo catálogo e pelo admin.
// ============================================================================

import { precoRotulo, area, TIPOS, MODO, modoAtual } from './dados.js';

/** Escapa antes de jogar em innerHTML. O dado vem do admin, mas texto de
 *  usuário nunca entra em HTML sem passar por aqui. */
export function escapar(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const ROTULO_STATUS = { reservado: 'Reservado' };

/**
 * Cartão de imóvel.
 * @param {object} imovel
 * @param {{alto?: boolean, prioridade?: boolean}} opcoes
 *        alto = ocupa a célula inteira (usado no destaque grande).
 */
export function cardImovel(imovel, { alto = false, prioridade = false } = {}) {
  const ficha = [
    imovel.quartos ? `<span><i class="ph ph-bed ico" aria-hidden="true"></i>${imovel.quartos} ${imovel.quartos > 1 ? 'quartos' : 'quarto'}</span>` : '',
    imovel.banheiros ? `<span><i class="ph ph-shower ico" aria-hidden="true"></i>${imovel.banheiros}</span>` : '',
    imovel.vagas ? `<span><i class="ph ph-car ico" aria-hidden="true"></i>${imovel.vagas}</span>` : '',
    area(imovel.area_util ?? imovel.area_total)
      ? `<span><i class="ph ph-ruler ico" aria-hidden="true"></i>${area(imovel.area_util ?? imovel.area_total)}</span>` : '',
  ].filter(Boolean).join('');

  const selo = ROTULO_STATUS[imovel.status]
    ? `<span class="card__selo card__selo--reservado">${ROTULO_STATUS[imovel.status]}</span>`
    : `<span class="card__selo">${imovel.finalidade === 'aluguel' ? 'Aluguel' : 'Venda'}</span>`;

  const foto = imovel.capa
    ? `<img src="${escapar(imovel.capa)}" alt="Foto de ${escapar(imovel.titulo)}"
            ${prioridade ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
    : `<div class="esqueleto" style="width:100%;height:100%" aria-hidden="true"></div>`;

  // Anúncio com vídeo recebe muito mais clique que anúncio só com foto, então
  // isso precisa aparecer ANTES do clique, na grade.
  const temVideo = Number(imovel.total_videos ?? imovel.videos?.length ?? 0) > 0;
  const marcaVideo = temVideo
    ? '<span class="card__video"><i class="ph ph-play-circle" aria-hidden="true"></i>Vídeo</span>'
    : '';

  return `
<article class="card${alto ? ' card--alto' : ''}">
  <div class="card__foto">${foto}${selo}${marcaVideo}</div>
  <div class="card__corpo">
    <p class="card__local">${escapar(TIPOS[imovel.tipo] ?? imovel.tipo)} em ${escapar(imovel.bairro)}, ${escapar(imovel.cidade)}</p>
    <h3 class="card__titulo">
      <a class="card__link" href="imovel.html?cod=${encodeURIComponent(imovel.codigo)}">${escapar(imovel.titulo)}</a>
    </h3>
    <p class="card__preco">${precoRotulo(imovel)}</p>
    ${ficha ? `<div class="ficha">${ficha}</div>` : ''}
  </div>
</article>`;
}

/** Placeholders com a MESMA forma do resultado final, pra não haver salto
 *  de layout quando os dados chegam. */
export const esqueletos = (n) =>
  Array.from({ length: n }, () => '<div class="esqueleto esqueleto--card"></div>').join('');

export function aviso({ icone = 'ph-house-line', titulo, texto, erro = false }) {
  return `
<div class="aviso${erro ? ' aviso--erro' : ''}">
  <i class="ph ${icone}" style="font-size:2rem;color:var(--tinta-fraca)" aria-hidden="true"></i>
  <p class="aviso__titulo">${escapar(titulo)}</p>
  <p>${escapar(texto)}</p>
</div>`;
}

/**
 * A faixa do topo. Só aparece no modo "exemplo", ou seja, enquanto a carteira
 * de verdade estiver vazia — assim que o primeiro imóvel for cadastrado no
 * painel, ela some sozinha e ninguém precisa lembrar de tirá-la.
 *
 * O texto fala com o DONO do site, não com o visitante: quem lê isso é quem
 * está montando o catálogo.
 */
export async function ligarFaixaDeExemplo() {
  const faixa = document.querySelector('#faixa-demo');
  if (!faixa) return;

  if (await modoAtual() !== MODO.EXEMPLO) return;

  faixa.innerHTML =
    'Estes imóveis são de exemplo. Cadastre os de verdade na ' +
    '<a href="admin.html">Área do corretor</a>, e eles somem sozinhos.';
  faixa.hidden = false;

  // O cabeçalho é fixo e acabou de crescer uma linha. Sem passar a altura real
  // pro CSS, o <h1> do hero passa por baixo dele.
  document.documentElement.style.setProperty('--altura-faixa', `${faixa.offsetHeight}px`);
}

/**
 * Lê um link de vídeo colado pelo corretor e diz o que dá pra fazer com ele.
 * Aceita link cru, encurtado, com ?si= de compartilhamento e /shorts/.
 *
 * O Instagram não permite embutir post sem passar pela API oficial, então
 * ali a saída é honesta: vira um cartão que abre no Instagram, e não um
 * player quebrado dentro da página.
 *
 * @returns {{plataforma: string, embutir: string|null, capa: string|null}}
 */
export function lerLinkDeVideo(bruto) {
  const texto = String(bruto ?? '').trim();
  let u;
  try { u = new URL(texto); } catch { return { plataforma: 'invalido', embutir: null, capa: null }; }

  const host = u.hostname.replace(/^www\./, '');

  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    const id = host === 'youtu.be'
      ? u.pathname.slice(1)
      : (u.searchParams.get('v') ?? u.pathname.split('/').filter(Boolean).pop());
    if (!id) return { plataforma: 'invalido', embutir: null, capa: null };
    return {
      plataforma: 'youtube',
      embutir: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`,
      capa: `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`,
    };
  }

  if (host.endsWith('vimeo.com')) {
    const id = u.pathname.split('/').filter(Boolean).pop();
    return id
      ? { plataforma: 'vimeo', embutir: `https://player.vimeo.com/video/${encodeURIComponent(id)}`, capa: null }
      : { plataforma: 'invalido', embutir: null, capa: null };
  }

  if (host.endsWith('instagram.com')) return { plataforma: 'instagram', embutir: null, capa: null };
  if (host.endsWith('drive.google.com')) return { plataforma: 'drive', embutir: null, capa: null };

  // Link direto pro arquivo (.mp4 numa hospedagem qualquer) toca no player nativo.
  if (/\.(mp4|webm|mov)(\?|$)/i.test(u.pathname)) {
    return { plataforma: 'arquivo', embutir: null, capa: null };
  }

  return { plataforma: 'outro', embutir: null, capa: null };
}

/**
 * Lê valores em notação brasileira ou internacional.
 *
 * O separador com três algarismos à direita é tratado como milhar; com
 * uma ou duas casas, como decimal. Quando ponto e vírgula aparecem juntos, o
 * último deles é o decimal. Isso cobre tanto "495.000,00" quanto
 * "495,000.00" sem transformar R$ 495 mil em R$ 49,5 milhões.
 */
export function lerNumero(texto) {
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;

  const original = String(texto ?? '').trim().toLocaleLowerCase('pt-BR');
  const escala = /\bmilh(?:ão|ao|ões|oes)\b/.test(original)
    ? 1_000_000
    : /\bmil\b/.test(original) ? 1_000 : 1;
  let valor = original.replace(/[^\d,.-]/g, '');
  if (!valor) return null;

  const pontos = valor.match(/\./g)?.length ?? 0;
  const virgulas = valor.match(/,/g)?.length ?? 0;

  if (pontos && virgulas) {
    const decimal = valor.lastIndexOf(',') > valor.lastIndexOf('.') ? ',' : '.';
    const milhar = decimal === ',' ? '.' : ',';
    valor = valor.replaceAll(milhar, '');

    // Só a última ocorrência do separador é decimal; qualquer anterior
    // é agrupamento digitado de forma irregular e pode ser descartado.
    const partes = valor.split(decimal);
    const casas = partes.pop();
    valor = `${partes.join('')}.${casas}`;
  } else {
    const separador = virgulas ? ',' : pontos ? '.' : null;
    if (separador) {
      const partes = valor.split(separador);
      const casas = partes.at(-1).length;
      const repetido = partes.length > 2;

      if (!repetido && (casas === 1 || casas === 2)) {
        valor = `${partes[0]}.${partes[1]}`;
      } else if (repetido && (casas === 1 || casas === 2)) {
        valor = `${partes.slice(0, -1).join('')}.${partes.at(-1)}`;
      } else {
        // "495.000", "495,000" e "1.250.000" são milhares.
        valor = partes.join('');
      }
    }
  }

  const numero = Number(valor) * escala;
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Formata ao sair do campo. Formatar a cada tecla muda a posição do cursor
 * e fazia "495000" atravessar estados como "4.9500", alterando o valor.
 */
export function mascararMoeda(input) {
  input.addEventListener('blur', () => {
    const n = lerNumero(input.value);
    input.value = n == null ? '' : n.toLocaleString('pt-BR', {
      maximumFractionDigits: 2,
    });
  });
}
