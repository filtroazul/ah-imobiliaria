// ============================================================================
// Home: liga a camada de dados na interface e sobe o movimento.
// ============================================================================

import { CONFIG } from './config.js';
import {
  listarImoveis, listarDestaques, listarBairros,
  registrarLead, linkWhatsApp,
} from './dados.js';
import {
  cardImovel, esqueletos, aviso, lerNumero, mascararMoeda, ligarFaixaDeExemplo,
} from './ui.js';
import { iniciarMovimento, revelarNovos, revelarBairros, recalcular } from './motion.js';

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const estado = { filtros: {}, pagina: 0, total: 0, carregando: false };

/* ------------------------------------------------------------- contato ---- */

function preencherContato() {
  const { whatsapp, instagram, email, endereco, creci } = CONFIG.contato;
  const zap = linkWhatsApp(null);
  const insta = `https://instagram.com/${instagram}`;

  // Formata 5585900000000 como (85) 90000-0000 para leitura humana.
  const legivel = whatsapp.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');

  $('#canal-zap').textContent = legivel;
  $('#canal-insta').textContent = `@${instagram}`;
  $('#rodape-creci').textContent = creci;
  $('#ano').textContent = new Date().getFullYear();

  // Dado que ainda não existe some da tela em vez de virar linha vazia. É o
  // que permite deixar endereço e e-mail em branco no config sem o site
  // ficar com buraco — e sem ninguém ser tentado a inventar um.
  const opcional = (seletor, valor, recipiente) => {
    const el = $(seletor);
    if (!el) return;
    if (valor) el.textContent = valor;
    else (el.closest(recipiente) ?? el).remove();
  };
  opcional('#canal-endereco', endereco, '.canal');
  opcional('#rodape-email', email, 'li');

  for (const el of [$('#zap-topo'), $('#zap-hero'), $('#zap-flutuante'), $('#rodape-zap')]) {
    if (el) { el.href = zap; el.target = '_blank'; el.rel = 'noopener'; }
  }
  const ri = $('#rodape-insta');
  if (ri) { ri.href = insta; ri.target = '_blank'; ri.rel = 'noopener'; }
}

/* ---------------------------------------------------------------- menu ---- */

function ligarMenu() {
  const botao = $('#menu-btn');
  const nav = $('#nav');
  if (!botao || !nav) return;

  botao.addEventListener('click', () => {
    const aberta = nav.classList.toggle('nav--aberta');
    botao.setAttribute('aria-expanded', String(aberta));
    botao.setAttribute('aria-label', aberta ? 'Fechar menu' : 'Abrir menu');
  });

  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      nav.classList.remove('nav--aberta');
      botao.setAttribute('aria-expanded', 'false');
    }
  });
}

/* ------------------------------------------------------------- filtros ---- */

async function popularBairros() {
  const select = $('#f-bairro');
  if (!select) return;
  try {
    const bairros = await listarBairros();
    select.insertAdjacentHTML(
      'beforeend',
      bairros.map((b) => `<option value="${b}">${b}</option>`).join('')
    );
  } catch {
    // Sem bairro no select o filtro continua funcionando pelos outros campos.
  }
}

function lerFiltros() {
  const forma = $('#form-busca');
  return {
    finalidade: $('#f-finalidade', forma).value || undefined,
    tipo: $('#f-tipo', forma).value || undefined,
    bairro: $('#f-bairro', forma).value || undefined,
    precoMax: lerNumero($('#f-preco', forma).value) ?? undefined,
  };
}

function ligarBusca() {
  const forma = $('#form-busca');
  if (!forma) return;

  mascararMoeda($('#f-preco'));

  forma.addEventListener('submit', (e) => {
    e.preventDefault();
    estado.filtros = lerFiltros();
    estado.pagina = 0;
    carregarCatalogo({ reiniciar: true });
    $('#catalogo').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // "Comprar" e "Alugar" do menu e do rodapé já entram com o filtro aplicado.
  $$('a[data-finalidade]').forEach((link) => {
    link.addEventListener('click', () => {
      $('#f-finalidade').value = link.dataset.finalidade;
      estado.filtros = lerFiltros();
      estado.pagina = 0;
      carregarCatalogo({ reiniciar: true });
    });
  });
}

/* ----------------------------------------------------------- destaques ---- */

async function carregarDestaques() {
  const alvo = $('#destaques');
  if (!alvo) return;

  alvo.innerHTML = esqueletos(3);
  try {
    const itens = await listarDestaques(3);

    if (!itens.length) {
      alvo.innerHTML = aviso({
        titulo: 'Nenhum imóvel em destaque ainda',
        texto: 'Marque um imóvel como destaque no painel do corretor para ele aparecer aqui.',
      });
      return;
    }

    // Primeiro ocupa a coluna alta, os outros dois empilham ao lado.
    alvo.innerHTML = itens
      .map((im, i) => cardImovel(im, { alto: i === 0, prioridade: i === 0 }))
      .join('');
  } catch (erro) {
    alvo.innerHTML = aviso({
      icone: 'ph-warning-circle',
      titulo: 'Não consegui carregar os destaques',
      texto: erro.message,
      erro: true,
    });
  } finally {
    alvo.setAttribute('aria-busy', 'false');
    recalcular();
  }
}

/* ------------------------------------------------------------ catálogo ---- */

async function carregarCatalogo({ reiniciar = false } = {}) {
  const grade = $('#grade');
  const botao = $('#carregar-mais');
  const contagem = $('#contagem');
  if (!grade || estado.carregando) return;

  estado.carregando = true;
  botao.disabled = true;
  grade.setAttribute('aria-busy', 'true');
  if (reiniciar) grade.innerHTML = esqueletos(CONFIG.porPagina);

  try {
    const { itens, total } = await listarImoveis({
      ...estado.filtros,
      pagina: estado.pagina,
    });
    estado.total = total;

    if (reiniciar && !itens.length) {
      grade.innerHTML = aviso({
        icone: 'ph-magnifying-glass',
        titulo: 'Nenhum imóvel com esses filtros',
        texto: 'Tente ampliar a faixa de valor ou tirar o bairro da busca.',
      });
      contagem.textContent = 'Nenhum resultado.';
      botao.hidden = true;
      return;
    }

    const html = itens.map((im) => cardImovel(im)).join('');
    if (reiniciar) {
      grade.innerHTML = html;
    } else {
      const antes = grade.children.length;
      grade.insertAdjacentHTML('beforeend', html);
      revelarNovos([...grade.children].slice(antes));
    }

    const mostrados = grade.querySelectorAll('.card').length;
    contagem.textContent =
      total === 1 ? '1 imóvel disponível.' : `${mostrados} de ${total} imóveis disponíveis.`;
    botao.hidden = mostrados >= total;
  } catch (erro) {
    grade.innerHTML = aviso({
      icone: 'ph-warning-circle',
      titulo: 'Não consegui carregar o catálogo',
      texto: erro.message,
      erro: true,
    });
    contagem.textContent = '';
    botao.hidden = true;
  } finally {
    estado.carregando = false;
    botao.disabled = false;
    grade.setAttribute('aria-busy', 'false');
    recalcular();
  }
}

function ligarPaginacao() {
  const botao = $('#carregar-mais');
  botao?.addEventListener('click', () => {
    estado.pagina += 1;
    carregarCatalogo();
  });
}

/* ------------------------------------------------------------- bairros ---- */

async function carregarBairrosDaCobertura() {
  const alvo = $('#bairros');
  if (!alvo) return;
  try {
    const bairros = await listarBairros();
    alvo.innerHTML = bairros
      .map((b) => `<a class="bairro" href="#catalogo" data-bairro="${b}">${b}</a>`)
      .join('');
    revelarBairros([...alvo.children]);

    alvo.addEventListener('click', (e) => {
      const link = e.target.closest('[data-bairro]');
      if (!link) return;
      $('#f-bairro').value = link.dataset.bairro;
      estado.filtros = lerFiltros();
      estado.pagina = 0;
      carregarCatalogo({ reiniciar: true });
    });
  } catch {
    alvo.remove();
  }
}

/* ------------------------------------------------- formulário de lead ---- */

function ligarFormularioContato() {
  const forma = $('#form-contato');
  if (!forma) return;

  const estadoCaixa = $('#contato-estado');
  const botao = $('#contato-enviar');

  const marcarErro = (campo, mensagem) => {
    const span = $(`#erro-${campo}`);
    span.textContent = mensagem ?? '';
    span.hidden = !mensagem;
    $(`#c-${campo}`).setAttribute('aria-invalid', mensagem ? 'true' : 'false');
    return !mensagem;
  };

  forma.addEventListener('submit', async (e) => {
    e.preventDefault();
    estadoCaixa.hidden = true;

    const nome = $('#c-nome').value.trim();
    const telefone = $('#c-telefone').value.trim();
    const mensagem = $('#c-mensagem').value.trim();

    const nomeOk = marcarErro('nome', nome.length >= 2 ? null : 'Escreva seu nome.');
    const telOk = marcarErro(
      'telefone',
      telefone.replace(/\D/g, '').length >= 10 ? null : 'Telefone com DDD, por favor.'
    );
    if (!nomeOk || !telOk) return;

    botao.disabled = true;
    botao.textContent = 'Enviando';

    try {
      const r = await registrarLead({ nome, telefone, mensagem, origem: 'site' });
      forma.reset();
      estadoCaixa.className = 'contato__estado contato__estado--ok';
      estadoCaixa.textContent = r.perdido
        ? 'Anotado, mas o navegador bloqueou a gravação. Chame no WhatsApp para garantir.'
        : 'Recebido. O corretor entra em contato pelo WhatsApp que você deixou.';
    } catch (erro) {
      estadoCaixa.className = 'contato__estado contato__estado--erro';
      estadoCaixa.textContent = `Não consegui enviar: ${erro.message}. Se preferir, chame no WhatsApp.`;
    } finally {
      estadoCaixa.hidden = false;
      botao.disabled = false;
      botao.textContent = 'Enviar';
    }
  });
}

/* ---------------------------------------------------------------- start --- */

function iniciar() {
  // Sem await: a faixa é um detalhe de cabeçalho e não pode segurar o resto da
  // página esperando uma consulta ao banco local.
  ligarFaixaDeExemplo();

  preencherContato();
  ligarMenu();
  ligarBusca();
  ligarPaginacao();
  ligarFormularioContato();

  popularBairros();
  carregarBairrosDaCobertura();
  carregarDestaques();
  carregarCatalogo({ reiniciar: true });

  iniciarMovimento();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
