// ============================================================================
// CRM da Ah Imobiliaria
// ----------------------------------------------------------------------------
// Interface operacional do funil. Toda persistencia passa por repo.js, assim o
// mesmo painel continua funcional tanto no Supabase quanto no modo local.
// ============================================================================

import { moeda } from './dados.js';
import * as repo from './repo.js';
import { escapar, lerNumero, mascararMoeda } from './ui.js';

const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

// `forca` é a opacidade do vinho no trilho da coluna. Ela sobe do começo ao
// fim do funil: quanto mais perto do fechamento, mais saturada a etapa. Isso dá
// leitura de progresso usando UMA cor só, sem inventar um verde/azul que não
// existe na marca (ver a regra travada em css/tokens.css). "Perdido" fica fora
// da escala, em cinza, porque não é avanço.
const ETAPAS = [
  { id: 'novo', nome: 'Novos', icone: 'ph-inbox', forca: 0.22 },
  { id: 'em_atendimento', nome: 'Em atendimento', icone: 'ph-chats-circle', forca: 0.36 },
  { id: 'qualificado', nome: 'Qualificados', icone: 'ph-seal-check', forca: 0.5 },
  { id: 'visita_agendada', nome: 'Visitas', icone: 'ph-calendar-check', forca: 0.66 },
  { id: 'proposta', nome: 'Propostas', icone: 'ph-file-text', forca: 0.82 },
  { id: 'fechado', nome: 'Fechados', icone: 'ph-key', forca: 1 },
  { id: 'perdido', nome: 'Perdidos', icone: 'ph-archive', forca: 0 },
];

const ETAPA_POR_ID = new Map(ETAPAS.map((etapa) => [etapa.id, etapa]));
const ORIGENS = {
  site: { nome: 'Site', icone: 'ph-globe' },
  meta_ads: { nome: 'Meta Ads', icone: 'ph-megaphone' },
  whatsapp: { nome: 'WhatsApp', icone: 'ph-whatsapp-logo' },
  instagram: { nome: 'Instagram', icone: 'ph-instagram-logo' },
  telefone: { nome: 'Telefone', icone: 'ph-phone' },
  indicacao: { nome: 'Indicação', icone: 'ph-users-three' },
  portal: { nome: 'Portal', icone: 'ph-buildings' },
};

const PRIORIDADES = ['Baixa', 'Normal', 'Alta', 'Urgente'];
const STATUS_ATIVOS = new Set(['novo', 'em_atendimento', 'qualificado', 'visita_agendada', 'proposta']);

let snapshot = {
  leads: [], interacoes: [], visitas: [], imoveis: [], configuracao: null,
};
let leadAbertoId = null;
let iniciado = false;
let carregando = false;

function textoSimples(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function formatarData(valor, comHora = false) {
  if (!valor) return 'Não informado';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return 'Não informado';
  return new Intl.DateTimeFormat('pt-BR', comHora
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'short' }).format(data);
}

function tempoRelativo(valor) {
  if (!valor) return 'sem contato';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return 'sem contato';
  const minutos = Math.max(0, Math.floor((Date.now() - data.getTime()) / 60000));
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `há ${dias} dia${dias === 1 ? '' : 's'}`;
  return formatarData(valor);
}

function inicioDoPeriodo() {
  const valor = $('#crm-periodo')?.value ?? '30';
  if (valor === 'todos') return null;
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(inicio.getDate() - Number(valor) + 1);
  return inicio;
}

function dentroDoPeriodo(valor) {
  const inicio = inicioDoPeriodo();
  if (!inicio) return true;
  const data = new Date(valor);
  return !Number.isNaN(data.getTime()) && data >= inicio;
}

function interacoesDo(leadId) {
  return snapshot.interacoes
    .filter((item) => item.lead_id === leadId)
    .sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
}

function visitasDo(leadId) {
  return snapshot.visitas
    .filter((item) => item.lead_id === leadId)
    .sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
}

function ultimaAtividade(lead) {
  const interacoes = interacoesDo(lead.id);
  return interacoes.at(-1)?.criado_em ?? lead.ultimo_contato ?? lead.atualizado_em ?? lead.criado_em;
}

function naoLidas(leadId) {
  return interacoesDo(leadId).filter((item) => item.direcao === 'entrada' && !item.lida_em).length;
}

function retornoAtrasado(lead) {
  if (!lead.proximo_contato || !STATUS_ATIVOS.has(lead.status)) return false;
  return lead.proximo_contato <= new Date().toISOString().slice(0, 10);
}

function leadsDoPeriodo() {
  return snapshot.leads.filter((lead) => dentroDoPeriodo(lead.criado_em));
}

// A janela imediatamente anterior, do mesmo tamanho. É o que dá sentido ao
// "+3" ao lado do número: 11 leads só quer dizer alguma coisa comparado com os
// 8 da quinzena passada. Em "todo o histórico" não existe anterior, e aí o
// painel simplesmente não mostra comparação em vez de inventar uma.
function leadsDaJanelaAnterior() {
  const inicio = inicioDoPeriodo();
  if (!inicio) return null;
  const dias = Number($('#crm-periodo')?.value ?? 30);
  const comeco = new Date(inicio);
  comeco.setDate(comeco.getDate() - dias);
  return snapshot.leads.filter((lead) => {
    const data = new Date(lead.criado_em);
    return data >= comeco && data < inicio;
  });
}

function monograma(nome) {
  const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  const primeira = partes[0][0] ?? '';
  const ultima = partes.length > 1 ? partes.at(-1)[0] ?? '' : '';
  return (primeira + ultima).toUpperCase();
}

function leadsFiltrados() {
  const busca = textoSimples($('#crm-busca')?.value);
  const origem = $('#crm-origem')?.value ?? '';
  const apenasAtrasados = $('#crm-atrasados')?.checked ?? false;

  return snapshot.leads.filter((lead) => {
    if (origem && lead.origem !== origem) return false;
    if (apenasAtrasados && !retornoAtrasado(lead)) return false;
    if (!busca) return true;
    const palheiro = textoSimples([
      lead.nome, lead.telefone, lead.email, lead.tipo, lead.finalidade,
      ...(lead.bairros ?? []), ...(lead.tags ?? []), lead.resumo, lead.mensagem,
      lead.imovel?.titulo, lead.imovel?.bairro,
    ].filter(Boolean).join(' '));
    return palheiro.includes(busca);
  });
}

function numeroCurto(valor) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(valor || 0);
}

function moedaCompacta(valor) {
  const numero = Number(valor || 0);
  if (numero >= 1_000_000) {
    return `R$ ${(numero / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  }
  if (numero >= 1_000) {
    return `R$ ${(numero / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  }
  return moeda(numero);
}

function minutosLegiveis(valor) {
  if (valor == null) return 'Sem dados';
  if (valor < 60) return `${Math.max(1, Math.round(valor))} min`;
  const horas = valor / 60;
  if (horas < 24) return `${horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  return `${Math.round(horas / 24)} dias`;
}

function mediaPrimeiraResposta(leads) {
  const tempos = [];
  for (const lead of leads) {
    const historico = interacoesDo(lead.id);
    const entrada = historico.find((item) => item.direcao === 'entrada');
    const saida = entrada && historico.find((item) =>
      item.direcao === 'saida' && new Date(item.criado_em) >= new Date(entrada.criado_em));
    const primeira = saida?.criado_em ?? lead.primeira_resposta_em;
    if (!entrada || !primeira) continue;
    const minutos = (new Date(primeira) - new Date(entrada.criado_em)) / 60000;
    if (Number.isFinite(minutos) && minutos >= 0) tempos.push(minutos);
  }
  return tempos.length ? tempos.reduce((soma, item) => soma + item, 0) / tempos.length : null;
}

// Compara com a janela anterior e devolve a marcação da variação. `bomSubir`
// diz de que lado está a boa notícia: em "leads" subir é bom, em "primeira
// resposta" subir é ruim. O vinho só aparece quando a notícia é ruim — é a
// mesma semântica de atenção que o card atrasado já usa. Sem cor nova.
function variacao(atual, anterior, { bomSubir = true, sufixo = '' } = {}) {
  if (anterior == null || atual == null) return '';
  const bruta = atual - anterior;
  if (!Number.isFinite(bruta) || Math.abs(bruta) < 0.05) {
    return '<span class="crm-kpi__delta crm-kpi__delta--igual">estável</span>';
  }
  const subiu = bruta > 0;
  const ruim = subiu !== bomSubir;
  const seta = subiu ? 'ph-arrow-up-right' : 'ph-arrow-down-right';
  const texto = `${subiu ? '+' : '-'}${numeroCurto(Math.abs(bruta))}${sufixo}`;
  return `
    <span class="crm-kpi__delta${ruim ? ' crm-kpi__delta--atencao' : ''}">
      <i class="ph ${seta}" aria-hidden="true"></i>${escapar(texto)}
    </span>`;
}

function renderizarKPIs() {
  const leads = leadsDoPeriodo();
  const antes = leadsDaJanelaAnterior();
  const qualificar = (lista) => lista.filter((lead) =>
    ['qualificado', 'visita_agendada', 'proposta', 'fechado'].includes(lead.status)).length;
  const converter = (lista) => (lista.length
    ? (lista.filter((lead) => lead.status === 'fechado').length / lista.length) * 100
    : 0);
  const somarPotencial = (lista) => lista
    .filter((lead) => STATUS_ATIVOS.has(lead.status))
    .reduce((soma, lead) => soma + Number(lead.valor_potencial ?? lead.imovel?.preco ?? 0), 0);

  const visitas = snapshot.visitas.filter((visita) => dentroDoPeriodo(visita.criado_em ?? visita.quando)).length;
  const resposta = mediaPrimeiraResposta(leads);
  const potencial = somarPotencial(leads);

  // Taxa em cima de amostra minúscula não é informação, é sorte: 1 lead que
  // fechou vira "100% de conversão", e no período seguinte a queda pra 0%
  // apareceria como um tombo de 100 pontos que nunca existiu. Abaixo de 3
  // leads na janela anterior o painel prefere não comparar.
  const comparavel = antes && antes.length >= 3;

  const itens = [
    {
      icone: 'ph-user-plus', rotulo: 'Leads no período', valor: numeroCurto(leads.length),
      delta: variacao(leads.length, antes?.length, { bomSubir: true }),
    },
    {
      icone: 'ph-seal-check', rotulo: 'Qualificados', valor: numeroCurto(qualificar(leads)),
      delta: variacao(qualificar(leads), antes && qualificar(antes), { bomSubir: true }),
    },
    { icone: 'ph-calendar-check', rotulo: 'Visitas', valor: numeroCurto(visitas) },
    {
      icone: 'ph-trend-up', rotulo: 'Conversão',
      valor: `${converter(leads).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
      // Diferença entre duas porcentagens é ponto percentual, não porcentagem.
      // Escrever "-100%" numa queda de 100% pra 0% afirmaria outra coisa.
      delta: comparavel
        ? variacao(converter(leads), converter(antes), { bomSubir: true, sufixo: ' p.p.' })
        : '',
    },
    {
      icone: 'ph-timer', rotulo: 'Primeira resposta', valor: minutosLegiveis(resposta),
      delta: comparavel
        ? variacao(resposta, mediaPrimeiraResposta(antes), { bomSubir: false, sufixo: ' min' })
        : '',
    },
    {
      icone: 'ph-currency-circle-dollar', rotulo: 'Potencial ativo',
      valor: potencial ? moedaCompacta(potencial) : 'Não informado',
    },
  ];

  // A linha da variação é sempre renderizada, mesmo vazia. Sem isso as células
  // com comparação teriam três linhas e as sem comparação duas, e os seis
  // números deixariam de assentar na mesma base.
  $('#crm-kpis').innerHTML = itens.map((item, indice) => `
    <article class="crm-kpi" style="--i:${indice}">
      <span class="crm-kpi__rotulo">
        <i class="ph ${item.icone}" aria-hidden="true"></i>${escapar(item.rotulo)}
      </span>
      <strong class="crm-kpi__valor">${escapar(item.valor)}</strong>
      <span class="crm-kpi__linha-delta">${item.delta || ''}</span>
    </article>`).join('');
}

function construirBuckets() {
  const periodo = $('#crm-periodo')?.value ?? '30';
  const configuracao = periodo === '7'
    ? { quantidade: 7, dias: 1 }
    : periodo === '90'
      ? { quantidade: 13, dias: 7 }
      : periodo === 'todos'
        ? { quantidade: 12, dias: 30 }
        : { quantidade: 10, dias: 3 };
  const agora = new Date();
  agora.setHours(23, 59, 59, 999);
  const largura = configuracao.dias * 86400000;

  return Array.from({ length: configuracao.quantidade }, (_, indice) => {
    const fim = new Date(agora.getTime() - (configuracao.quantidade - 1 - indice) * largura);
    const inicio = new Date(fim.getTime() - largura + 1);
    const total = snapshot.leads.filter((lead) => {
      const data = new Date(lead.criado_em);
      return data >= inicio && data <= fim;
    }).length;
    const rotulo = configuracao.dias >= 30
      ? fim.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
      : fim.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const periodo = configuracao.dias === 1
      ? formatarData(fim)
      : `${formatarData(inicio)} a ${formatarData(fim)}`;
    return { total, rotulo, periodo };
  });
}

// Curva suave por Catmull-Rom convertida em Bézier. Os pontos reais ficam
// marcados com bolinha justamente porque a curva interpola: a bolinha é a
// medição, o traço entre elas é só leitura.
function caminhoSuave(pontos) {
  if (pontos.length < 2) return '';
  let d = `M ${pontos[0].x} ${pontos[0].y}`;
  for (let i = 0; i < pontos.length - 1; i += 1) {
    const p0 = pontos[i - 1] ?? pontos[i];
    const p1 = pontos[i];
    const p2 = pontos[i + 1];
    const p3 = pontos[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function renderizarGrafico() {
  const buckets = construirBuckets();
  const alvo = $('#crm-grafico');
  if (!alvo) return;

  const total = buckets.reduce((soma, item) => soma + item.total, 0);
  if (!total) {
    alvo.innerHTML = `
      <div class="crm-grafico__vazio">
        <i class="ph ph-chart-line" aria-hidden="true"></i>
        <p>Nenhum lead entrou neste período.</p>
        <span>Assim que chegar uma mensagem, a curva começa aqui.</span>
      </div>`;
    return;
  }

  // Teto arredondado pra cima até um número par. Par importa porque a linha do
  // meio é rotulada com teto/2: com teto 3 a grade do meio valia 1,5 e o eixo
  // escrevia "2" ali, afirmando uma medida que não é a daquela linha.
  const pico = Math.max(1, ...buckets.map((item) => item.total));
  const teto = pico <= 4 ? pico + (pico % 2) : Math.ceil(pico / 10) * 10;
  const largura = 100;
  const altura = 100;
  // Margem lateral pra a primeira e a última bolinha caberem inteiras dentro
  // da tela. Sem ela os pontos das pontas nascem em x=0 e x=100 e metade de
  // cada um fica fora do recorte.
  const margem = 2;
  const util = largura - margem * 2;
  const passo = buckets.length > 1 ? util / (buckets.length - 1) : 0;
  const pontos = buckets.map((item, indice) => ({
    x: buckets.length > 1 ? margem + indice * passo : largura / 2,
    y: altura - (item.total / teto) * (altura - 6) - 3,
    ...item,
  }));

  const linha = caminhoSuave(pontos);
  const area = linha
    ? `${linha} L ${pontos.at(-1).x.toFixed(2)} ${altura} L ${pontos[0].x.toFixed(2)} ${altura} Z`
    : '';
  const grades = [0, 0.5, 1].map((fracao) => {
    const y = 3 + (altura - 6) * fracao;
    return `<line class="crm-grafico__grade" x1="0" y1="${y.toFixed(2)}" x2="${largura}" y2="${y.toFixed(2)}"></line>`;
  }).join('');

  alvo.innerHTML = `
    <div class="crm-grafico__escala" aria-hidden="true">
      <span>${numeroCurto(teto)}</span><span>${numeroCurto(Math.round(teto / 2))}</span><span>0</span>
    </div>
    <div class="crm-grafico__tela">
      <svg class="crm-grafico__svg" viewBox="0 0 ${largura} ${altura}"
           preserveAspectRatio="none" role="img"
           aria-label="Entrada de leads ao longo do período: ${total} no total">
        <defs>
          <linearGradient id="crm-veu" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--vermelho)" stop-opacity="0.28"></stop>
            <stop offset="100%" stop-color="var(--vermelho)" stop-opacity="0.02"></stop>
          </linearGradient>
        </defs>
        ${grades}
        ${area ? `<path class="crm-grafico__area" d="${area}" fill="url(#crm-veu)"></path>` : ''}
        ${linha ? `<path class="crm-grafico__linha" d="${linha}" vector-effect="non-scaling-stroke"></path>` : ''}
      </svg>
      <div class="crm-grafico__marcas" style="--passo:${(passo || 100).toFixed(2)}%">
        ${pontos.map((ponto) => `
          <button class="crm-grafico__marca" type="button"
                  style="--x:${ponto.x.toFixed(2)}%;--y:${ponto.y.toFixed(2)}%"
                  data-total="${ponto.total}" data-periodo="${escapar(ponto.periodo)}">
            <span class="sr-only">${ponto.total} lead${ponto.total === 1 ? '' : 's'} em ${escapar(ponto.periodo)}</span>
          </button>`).join('')}
      </div>
      <div class="crm-grafico__balao" id="crm-grafico-balao" hidden aria-hidden="true"></div>
    </div>
    <div class="crm-grafico__eixo" aria-hidden="true">
      ${pontos.map((ponto) => `<span>${escapar(ponto.rotulo)}</span>`).join('')}
    </div>`;

  // O traço "se desenhando" precisa do comprimento real da curva: com um valor
  // chutado no CSS a linha ficaria invisível durante quase toda a animação e
  // apareceria de supetão no fim. getTotalLength() devolve isso em unidades do
  // viewBox, que é exatamente onde o stroke-dasharray vive.
  const traco = $('.crm-grafico__linha', alvo);
  if (traco) traco.style.setProperty('--traco', traco.getTotalLength().toFixed(1));

  ligarBalaoDoGrafico(alvo);
}

// Tooltip próprio em vez de `title`: o nativo demora um segundo pra aparecer e
// some no meio do movimento do mouse, que é justamente quando o corretor está
// varrendo a curva pra achar o dia cheio.
function ligarBalaoDoGrafico(raiz) {
  const balao = $('#crm-grafico-balao', raiz);
  const tela = $('.crm-grafico__tela', raiz);
  if (!balao || !tela) return;

  const mostrar = (marca) => {
    const total = Number(marca.dataset.total);
    balao.innerHTML = `<strong>${numeroCurto(total)} lead${total === 1 ? '' : 's'}</strong>
      <span>${escapar(marca.dataset.periodo)}</span>`;
    // A marca é deslocada por translateX(-50%), então o centro visual dela
    // cai exatamente em offsetLeft. Somar metade da largura erraria o alvo.
    balao.style.setProperty('--x', `${marca.offsetLeft}px`);
    balao.style.setProperty('--y', marca.style.getPropertyValue('--y'));
    balao.hidden = false;
  };
  const esconder = () => { balao.hidden = true; };

  for (const marca of $$('.crm-grafico__marca', raiz)) {
    marca.addEventListener('pointerenter', () => mostrar(marca));
    marca.addEventListener('focus', () => mostrar(marca));
    marca.addEventListener('blur', esconder);
  }
  tela.addEventListener('pointerleave', esconder);
}

function renderizarOrigens() {
  const leads = leadsDoPeriodo();
  const contagens = new Map();
  for (const lead of leads) contagens.set(lead.origem, (contagens.get(lead.origem) ?? 0) + 1);
  const itens = [...contagens.entries()].sort((a, b) => b[1] - a[1]);
  if (!itens.length) {
    $('#crm-origens').innerHTML = '<p class="crm-vazio-curto">Nenhum lead neste período.</p>';
    return;
  }
  const maior = Math.max(...itens.map(([, total]) => total), 1);
  $('#crm-origens').innerHTML = itens.map(([origem, total], indice) => {
    const info = ORIGENS[origem] ?? { nome: origem, icone: 'ph-chat-circle' };
    const porcentagem = leads.length ? Math.round((total / leads.length) * 100) : 0;
    return `
      <div class="crm-origem" style="--i:${indice}">
        <i class="ph ${info.icone}" aria-hidden="true"></i>
        <span class="crm-origem__nome">${escapar(info.nome)}</span>
        <strong class="crm-origem__total">${total}</strong>
        <span class="crm-origem__porcento">${porcentagem}%</span>
        <span class="crm-origem__linha"><i style="--largura:${(total / maior) * 100}%"></i></span>
      </div>`;
  }).join('');
}

function renderizarIA() {
  const config = snapshot.configuracao ?? { modo: 'automatico', agente: 'ah_imobiliaria' };
  $('#crm-ia-modo').value = config.modo;
  $('#crm-ia-agente').textContent = `Agente: ${config.agente || 'ah_imobiliaria'}`;
  const textos = {
    automatico: 'A IA responde novas mensagens, consulta o catálogo e registra cada troca na ficha.',
    sugestao: 'A IA prepara textos dentro da ficha, mas só o corretor decide o que enviar.',
    desligado: 'Nenhuma resposta é gerada. Os contatos continuam entrando normalmente no funil.',
  };
  const estado = $('#crm-ia-estado');
  estado.className = `crm-ia__estado crm-ia__estado--${config.modo}`;
  estado.textContent = config.modo === 'automatico' ? 'Automática'
    : config.modo === 'sugestao' ? 'Sugestões' : 'Desligada';
  $('#crm-ia-explica').textContent = textos[config.modo] ?? textos.desligado;
}

function interesseDo(lead) {
  const partes = [];
  if (lead.finalidade) partes.push(lead.finalidade === 'venda' ? 'Compra' : 'Aluguel');
  if (lead.tipo) partes.push(lead.tipo);
  if (lead.bairros?.length) partes.push(lead.bairros.slice(0, 2).join(', '));
  if (lead.imovel) partes.push(`Cód. ${lead.imovel.codigo}`);
  return partes.join(' | ') || 'Perfil ainda não informado';
}

function cardDoLead(lead, indice = 0) {
  const origem = ORIGENS[lead.origem] ?? { nome: lead.origem, icone: 'ph-chat-circle' };
  const atrasado = retornoAtrasado(lead);
  const pendentes = naoLidas(lead.id);
  const prioridade = Number(lead.prioridade ?? 1);
  const telefone = telefoneLimpo(lead);
  return `
    <article class="lead-card lead-card--p${prioridade}${atrasado ? ' lead-card--atrasado' : ''}"
             draggable="true" tabindex="0" data-lead-id="${escapar(lead.id)}" style="--i:${indice}"
             aria-label="Abrir ficha de ${escapar(lead.nome ?? 'lead sem nome')}">
      <div class="lead-card__topo">
        <span class="lead-card__avatar" aria-hidden="true">${escapar(monograma(lead.nome))}</span>
        <span class="lead-card__identidade">
          <strong class="lead-card__nome">${escapar(lead.nome || 'Sem nome')}</strong>
          <span class="lead-card__origem"><i class="ph ${origem.icone}" aria-hidden="true"></i>${escapar(origem.nome)}</span>
        </span>
        ${pendentes ? `<span class="lead-card__nao-lidas" title="${pendentes} mensagem${pendentes === 1 ? '' : 's'} sem ler">${pendentes}</span>` : ''}
      </div>
      <p class="lead-card__interesse">${escapar(interesseDo(lead))}</p>
      ${lead.tags?.length ? `<div class="lead-card__tags">${lead.tags.slice(0, 2).map((tag) => `<span>${escapar(tag)}</span>`).join('')}</div>` : ''}
      <div class="lead-card__rodape">
        <span>${escapar(tempoRelativo(ultimaAtividade(lead)))}</span>
        ${atrasado
          ? '<span class="lead-card__retorno"><i class="ph ph-warning-circle" aria-hidden="true"></i>Retornar</span>'
          : `<span>${escapar(PRIORIDADES[prioridade] ?? 'Normal')}</span>`}
      </div>
      ${telefone
        ? `<a class="lead-card__zap" href="https://wa.me/${escapar(telefone)}" target="_blank" rel="noopener"
              title="Abrir conversa no WhatsApp" aria-label="Abrir conversa de ${escapar(lead.nome ?? 'lead')} no WhatsApp">
             <i class="ph ph-whatsapp-logo" aria-hidden="true"></i>
           </a>`
        : ''}
    </article>`;
}

function renderizarFunil() {
  const leads = leadsFiltrados();
  const filtrando = Boolean($('#crm-busca')?.value.trim())
    || Boolean($('#crm-origem')?.value)
    || Boolean($('#crm-atrasados')?.checked);
  $('#crm-contagem').textContent = `${leads.length} lead${leads.length === 1 ? '' : 's'} no funil`;

  $('#crm-funil').innerHTML = ETAPAS.map((etapa, coluna) => {
    const itens = leads.filter((lead) => lead.status === etapa.id);
    const valor = itens.reduce((soma, lead) => soma + Number(lead.valor_potencial ?? 0), 0);
    return `
      <section class="funil-coluna" data-etapa="${etapa.id}" style="--forca:${etapa.forca};--i:${coluna}"
               aria-labelledby="etapa-${etapa.id}">
        <header class="funil-coluna__topo">
          <i class="ph ${etapa.icone}" aria-hidden="true"></i>
          <h4 id="etapa-${etapa.id}">${etapa.nome}</h4>
          <span class="funil-coluna__contagem">${itens.length}</span>
        </header>
        <p class="funil-coluna__valor">${valor ? moeda(valor) : 'Sem valor informado'}</p>
        <div class="funil-coluna__corpo" data-soltar="${etapa.id}">
          ${itens.length
            ? itens.map((lead, indice) => cardDoLead(lead, indice)).join('')
            : `<p class="funil-coluna__vazio">
                 <i class="ph ${filtrando ? 'ph-funnel' : 'ph-hand-grabbing'}" aria-hidden="true"></i>
                 ${filtrando ? 'Nada nesta etapa com os filtros de agora' : 'Arraste um lead até aqui'}
               </p>`}
        </div>
      </section>`;
  }).join('');
  ligarArraste();
}

function renderizarTudo() {
  renderizarKPIs();
  renderizarGrafico();
  renderizarOrigens();
  renderizarIA();
  renderizarFunil();
}

function mostrarRecado(texto, tipo = 'ok') {
  const alvo = $('#crm-recado');
  alvo.className = `recado recado--${tipo}`;
  alvo.textContent = texto;
  alvo.hidden = false;
  clearTimeout(mostrarRecado._timer);
  mostrarRecado._timer = setTimeout(() => { alvo.hidden = true; }, 5000);
}

function mostrarRecadoLead(texto, tipo = 'ok') {
  const alvo = $('#lead-recado');
  alvo.className = `recado recado--${tipo}`;
  alvo.textContent = texto;
  alvo.hidden = false;
}

// O esqueleto imita a forma final (6 células, curva, 5 colunas com cards) em
// vez de um retângulo genérico: assim a página não pula quando os dados chegam.
function mostrarCarregando() {
  $('#crm-kpis').innerHTML = `
    <article class="crm-kpi crm-kpi--esqueleto">
      <span class="esqueleto esqueleto--rotulo"></span>
      <span class="esqueleto esqueleto--numero"></span>
    </article>`.repeat(6);
  $('#crm-grafico').innerHTML = '<div class="esqueleto esqueleto--curva"></div>';
  $('#crm-origens').innerHTML = `
    <div class="crm-origem crm-origem--esqueleto"><span class="esqueleto"></span></div>`.repeat(5);
  $('#crm-funil').innerHTML = `
    <section class="funil-coluna funil-coluna--esqueleto">
      <span class="esqueleto esqueleto--rotulo"></span>
      <span class="esqueleto esqueleto--lead"></span>
      <span class="esqueleto esqueleto--lead"></span>
    </section>`.repeat(5);
}

function exportarCSV() {
  const linhas = leadsFiltrados();
  if (!linhas.length) {
    mostrarRecado('Não há leads neste filtro para exportar.', 'aviso');
    return;
  }
  const celula = (valor) => `"${String(valor ?? '').replaceAll('"', '""')}"`;
  const cabecalho = [
    'Nome', 'Telefone', 'E-mail', 'Origem', 'Etapa', 'Prioridade', 'Finalidade',
    'Tipo', 'Bairros', 'Preço mínimo', 'Preço máximo', 'Valor potencial',
    'Próximo contato', 'Criado em', 'Última atividade', 'IA ativa', 'Tags', 'Resumo',
    'Meta Campaign ID', 'Meta Campaign', 'Meta Adset ID', 'Meta Adset',
    'Meta Ad ID', 'Meta Ad', 'Meta Form ID', 'Meta Leadgen ID', 'Consentimento WhatsApp',
  ];
  const conteudo = [cabecalho, ...linhas.map((lead) => [
    lead.nome,
    lead.telefone,
    lead.email,
    ORIGENS[lead.origem]?.nome ?? lead.origem,
    ETAPA_POR_ID.get(lead.status)?.nome ?? lead.status,
    PRIORIDADES[Number(lead.prioridade ?? 1)] ?? 'Normal',
    lead.finalidade === 'venda' ? 'Compra' : lead.finalidade === 'aluguel' ? 'Aluguel' : '',
    lead.tipo,
    (lead.bairros ?? []).join(', '),
    lead.preco_min,
    lead.preco_max,
    lead.valor_potencial,
    lead.proximo_contato,
    lead.criado_em,
    ultimaAtividade(lead),
    lead.ia_ativa === false ? 'Não' : 'Sim',
    (lead.tags ?? []).join(', '),
    lead.resumo,
    lead.meta_campaign_id,
    lead.meta_campaign_name,
    lead.meta_adset_id,
    lead.meta_adset_name,
    lead.meta_ad_id,
    lead.meta_ad_name,
    lead.meta_form_id,
    lead.leadgen_id,
    lead.whatsapp_opt_in === true ? 'Autorizado'
      : lead.whatsapp_opt_in === false ? 'Recusado' : 'Não informado',
  ])].map((linha) => linha.map(celula).join(';')).join('\r\n');

  const blob = new Blob([`\ufeff${conteudo}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `leads-ah-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function carregarCRM({ silencioso = false } = {}) {
  if (carregando) return;
  carregando = true;
  if (!silencioso) mostrarCarregando();
  try {
    snapshot = await repo.crmSnapshot();
    renderizarTudo();
    if (leadAbertoId && $('#lead-detalhe').open) abrirLead(leadAbertoId, { reabrir: true });
  } catch (erro) {
    $('#crm-funil').innerHTML = `
      <div class="aviso crm-erro">
        <p class="aviso__titulo">Não consegui abrir o CRM</p>
        <p>${escapar(erro.message)}</p>
      </div>`;
    mostrarRecado(erro.message, 'erro');
  } finally {
    carregando = false;
  }
}

function ligarArraste() {
  $$('.lead-card').forEach((card) => {
    card.addEventListener('dragstart', (evento) => {
      evento.dataTransfer.effectAllowed = 'move';
      evento.dataTransfer.setData('text/plain', card.dataset.leadId);
      card.classList.add('lead-card--arrastando');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('lead-card--arrastando');
      $$('.funil-coluna').forEach((coluna) => coluna.classList.remove('funil-coluna--recebendo'));
    });
  });
  $$('[data-soltar]').forEach((zona) => {
    zona.addEventListener('dragover', (evento) => {
      evento.preventDefault();
      zona.closest('.funil-coluna').classList.add('funil-coluna--recebendo');
    });
    zona.addEventListener('dragleave', (evento) => {
      if (!zona.contains(evento.relatedTarget)) {
        zona.closest('.funil-coluna').classList.remove('funil-coluna--recebendo');
      }
    });
    zona.addEventListener('drop', (evento) => {
      evento.preventDefault();
      const id = evento.dataTransfer.getData('text/plain');
      moverLead(id, zona.dataset.soltar);
    });
  });
}

async function moverLead(id, novoStatus) {
  const lead = snapshot.leads.find((item) => item.id === id);
  if (!lead || lead.status === novoStatus || !ETAPA_POR_ID.has(novoStatus)) return;
  const anterior = lead.status;
  lead.status = novoStatus;
  renderizarFunil();
  try {
    const atualizado = await repo.atualizarLead(id, { status: novoStatus });
    Object.assign(lead, atualizado, { imovel: lead.imovel });
    const interacao = await repo.adicionarInteracao({
      lead_id: id,
      tipo: 'status',
      direcao: 'interna',
      autor: 'corretor',
      canal: 'painel',
      conteudo: `Etapa alterada de ${ETAPA_POR_ID.get(anterior)?.nome ?? anterior} para ${ETAPA_POR_ID.get(novoStatus).nome}.`,
    });
    snapshot.interacoes.push(interacao);
    renderizarKPIs();
  } catch (erro) {
    lead.status = anterior;
    renderizarFunil();
    mostrarRecado(`Não consegui mover o lead: ${erro.message}`, 'erro');
  }
}

function preencher(seletor, valor) {
  const campo = $(seletor);
  if (campo) campo.value = valor ?? '';
}

function telefoneLimpo(lead) {
  const digitos = String(lead?.telefone ?? '').replace(/\D/g, '');
  return (digitos.length === 10 || digitos.length === 11) ? `55${digitos}` : digitos;
}

function atualizarMotivoPerda() {
  $('#lead-motivo-perda-campo').hidden = $('#lead-status').value !== 'perdido';
}

function renderizarTimeline(lead) {
  let itens = interacoesDo(lead.id);
  if (!itens.length && lead.mensagem) {
    itens = [{
      id: 'mensagem-original', tipo: 'mensagem', direcao: 'entrada', autor: 'lead',
      canal: lead.origem, conteudo: lead.mensagem, criado_em: lead.criado_em,
    }];
  }
  if (!itens.length) {
    $('#lead-timeline').innerHTML = `
      <div class="lead-timeline__vazio">
        <i class="ph ph-chat-circle-dots" aria-hidden="true"></i>
        <p>A conversa aparecerá aqui quando houver uma mensagem ou anotação.</p>
      </div>`;
    return;
  }
  $('#lead-timeline').innerHTML = itens.map((item) => {
    const classe = item.tipo === 'nota' || item.direcao === 'interna'
      ? 'interna' : item.direcao;
    const autor = item.autor === 'ia' ? 'IA'
      : item.autor === 'corretor' ? 'Corretor'
        : item.autor === 'lead' ? lead.nome || 'Lead' : 'Sistema';
    return `
      <article class="timeline-item timeline-item--${classe}">
        <div class="timeline-item__meta">
          <strong>${escapar(autor)}</strong>
          <span>${escapar(formatarData(item.criado_em, true))}</span>
        </div>
        <p>${escapar(item.conteudo).replaceAll('\n', '<br>')}</p>
        ${item.automatico ? '<span class="timeline-item__ia">Resposta automática</span>' : ''}
      </article>`;
  }).join('');
  $('#lead-timeline').scrollTop = $('#lead-timeline').scrollHeight;
}

function renderizarVisitas(lead) {
  const visitas = visitasDo(lead.id);
  if (!visitas.length) {
    $('#lead-visitas').innerHTML = '<p class="crm-vazio-curto">Nenhuma visita agendada.</p>';
    return;
  }
  $('#lead-visitas').innerHTML = visitas.map((visita) => {
    const imovel = snapshot.imoveis.find((item) => item.id === visita.imovel_id);
    return `
      <article class="lead-visita">
        <i class="ph ph-calendar-check" aria-hidden="true"></i>
        <div>
          <strong>${escapar(formatarData(visita.quando, true))}</strong>
          <span>${imovel ? `Cód. ${escapar(imovel.codigo)} | ${escapar(imovel.titulo)}` : 'Imóvel ainda não definido'}</span>
          ${visita.observacao ? `<p>${escapar(visita.observacao)}</p>` : ''}
        </div>
        <span>${escapar(visita.status)}</span>
      </article>`;
  }).join('');
}

function abrirLead(id, { reabrir = false } = {}) {
  const lead = snapshot.leads.find((item) => item.id === id);
  if (!lead) return;
  leadAbertoId = id;
  $('#lead-recado').hidden = true;
  $('#lead-sugestao-recado').textContent = '';
  const origem = ORIGENS[lead.origem] ?? { nome: lead.origem, icone: 'ph-chat-circle' };
  $('#lead-detalhe-origem').innerHTML = `<i class="ph ${origem.icone}" aria-hidden="true"></i>${escapar(origem.nome)}`;
  $('#lead-detalhe-nome').textContent = lead.nome || 'Lead sem nome';
  $('#lead-detalhe-contato').textContent = [lead.telefone, lead.email].filter(Boolean).join(' | ') || 'Contato não informado';

  const telefone = telefoneLimpo(lead);
  $('#lead-whatsapp').href = telefone ? `https://wa.me/${telefone}` : '#';
  $('#lead-whatsapp').classList.toggle('is-disabled', !telefone);
  $('#lead-telefone-link').href = telefone ? `tel:+${telefone}` : '#';
  $('#lead-telefone-link').classList.toggle('is-disabled', !telefone);
  $('#lead-ia-ativa').checked = lead.ia_ativa !== false;

  preencher('#lead-nome', lead.nome);
  preencher('#lead-telefone', lead.telefone);
  preencher('#lead-email', lead.email);
  preencher('#lead-status', lead.status);
  preencher('#lead-prioridade', lead.prioridade ?? 1);
  preencher('#lead-proximo-contato', lead.proximo_contato);
  preencher('#lead-finalidade', lead.finalidade);
  preencher('#lead-tipo', lead.tipo);
  preencher('#lead-bairros', (lead.bairros ?? []).join(', '));
  preencher('#lead-preco-min', lead.preco_min ? Number(lead.preco_min).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
  preencher('#lead-preco-max', lead.preco_max ? Number(lead.preco_max).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
  preencher('#lead-valor-potencial', lead.valor_potencial ? Number(lead.valor_potencial).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
  preencher('#lead-quartos', lead.quartos_min);
  preencher('#lead-prazo', lead.prazo);
  preencher('#lead-financiamento', lead.financiamento);
  preencher('#lead-tags', (lead.tags ?? []).join(', '));
  preencher('#lead-resumo', lead.resumo);
  preencher('#lead-motivo-perda', lead.motivo_perda);
  preencher('#lead-resposta', '');
  const grupoMeta = $('#lead-meta-grupo');
  const veioDaMeta = lead.origem === 'meta_ads' || Boolean(lead.leadgen_id);
  grupoMeta.hidden = !veioDaMeta;
  if (veioDaMeta) {
    $('#lead-meta-campanha').textContent = lead.meta_campaign_name || lead.meta_campaign_id || 'Não informada';
    $('#lead-meta-conjunto').textContent = lead.meta_adset_name || lead.meta_adset_id || 'Não informado';
    $('#lead-meta-anuncio').textContent = lead.meta_ad_name || lead.meta_ad_id || 'Não informado';
    $('#lead-meta-formulario').textContent = lead.meta_form_id || 'Não informado';
    $('#lead-meta-leadgen').textContent = lead.leadgen_id || 'Não informado';
    const optIn = lead.whatsapp_opt_in === true ? 'Autorizado'
      : lead.whatsapp_opt_in === false ? 'Recusado' : 'Não informado';
    $('#lead-meta-opt-in').textContent = optIn;
  }
  atualizarMotivoPerda();

  $('#lead-visita-imovel').innerHTML = '<option value="">Sem imóvel definido</option>' +
    snapshot.imoveis.map((imovel) => `<option value="${escapar(imovel.id)}">Cód. ${escapar(imovel.codigo)} | ${escapar(imovel.titulo)}</option>`).join('');
  $('#lead-visita-imovel').value = lead.imovel_id ?? '';
  renderizarTimeline(lead);
  renderizarVisitas(lead);

  const dialog = $('#lead-detalhe');
  if (!reabrir && !dialog.open) dialog.showModal();
  repo.marcarInteracoesLidas(id).then(() => {
    const agora = new Date().toISOString();
    snapshot.interacoes.forEach((item) => {
      if (item.lead_id === id && item.direcao === 'entrada') item.lida_em = agora;
    });
    renderizarFunil();
  }).catch(() => {});
}

function fecharLead() {
  const dialog = $('#lead-detalhe');
  if (dialog.open) dialog.close();
  leadAbertoId = null;
}

function coletarFicha() {
  const lista = (valor) => valor.split(',').map((item) => item.trim()).filter(Boolean);
  return {
    nome: $('#lead-nome').value.trim(),
    telefone: $('#lead-telefone').value.replace(/\D/g, '') || null,
    email: $('#lead-email').value.trim() || null,
    status: $('#lead-status').value,
    prioridade: Number($('#lead-prioridade').value),
    proximo_contato: $('#lead-proximo-contato').value || null,
    finalidade: $('#lead-finalidade').value || null,
    tipo: $('#lead-tipo').value.trim() || null,
    bairros: lista($('#lead-bairros').value),
    preco_min: lerNumero($('#lead-preco-min').value),
    preco_max: lerNumero($('#lead-preco-max').value),
    valor_potencial: lerNumero($('#lead-valor-potencial').value),
    quartos_min: Number($('#lead-quartos').value) || null,
    prazo: $('#lead-prazo').value.trim() || null,
    financiamento: $('#lead-financiamento').value.trim() || null,
    tags: lista($('#lead-tags').value),
    resumo: $('#lead-resumo').value.trim() || null,
    motivo_perda: $('#lead-status').value === 'perdido'
      ? $('#lead-motivo-perda').value.trim() || null : null,
    ia_ativa: $('#lead-ia-ativa').checked,
  };
}

async function salvarFicha(evento) {
  evento.preventDefault();
  const lead = snapshot.leads.find((item) => item.id === leadAbertoId);
  if (!lead) return;
  const botao = $('#lead-salvar');
  const dados = coletarFicha();
  if (!dados.nome) return;
  botao.disabled = true;
  botao.textContent = 'Salvando';
  try {
    const statusAnterior = lead.status;
    const atualizado = await repo.atualizarLead(lead.id, dados);
    Object.assign(lead, atualizado, { imovel: lead.imovel });
    if (statusAnterior !== dados.status) {
      const interacao = await repo.adicionarInteracao({
        lead_id: lead.id, tipo: 'status', direcao: 'interna', autor: 'corretor', canal: 'painel',
        conteudo: `Etapa alterada de ${ETAPA_POR_ID.get(statusAnterior)?.nome ?? statusAnterior} para ${ETAPA_POR_ID.get(dados.status)?.nome ?? dados.status}.`,
      });
      snapshot.interacoes.push(interacao);
    }
    renderizarTudo();
    abrirLead(lead.id, { reabrir: true });
    const recado = $('#lead-recado');
    recado.className = 'recado recado--ok';
    recado.textContent = 'Ficha atualizada.';
    recado.hidden = false;
  } catch (erro) {
    const recado = $('#lead-recado');
    recado.className = 'recado recado--erro';
    recado.textContent = erro.message;
    recado.hidden = false;
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar ficha';
  }
}

async function salvarNota(evento) {
  evento.preventDefault();
  const conteudo = $('#lead-nota').value.trim();
  if (!conteudo || !leadAbertoId) return;
  const botao = evento.submitter ?? evento.currentTarget.querySelector('[type="submit"]');
  botao.disabled = true;
  try {
    const interacao = await repo.adicionarInteracao({
      lead_id: leadAbertoId, tipo: 'nota', direcao: 'interna', autor: 'corretor',
      canal: 'painel', conteudo,
    });
    snapshot.interacoes.push(interacao);
    $('#lead-nota').value = '';
    renderizarTimeline(snapshot.leads.find((item) => item.id === leadAbertoId));
  } catch (erro) {
    mostrarRecadoLead(`Não consegui salvar a anotação: ${erro.message}`, 'erro');
  } finally {
    botao.disabled = false;
  }
}

async function salvarVisita(evento) {
  evento.preventDefault();
  if (!leadAbertoId) return;
  const quando = $('#lead-visita-quando').value;
  if (!quando) return;
  const botao = evento.submitter ?? evento.currentTarget.querySelector('[type="submit"]');
  botao.disabled = true;
  try {
    const visita = await repo.salvarVisita({
      lead_id: leadAbertoId,
      imovel_id: $('#lead-visita-imovel').value || null,
      quando: new Date(quando).toISOString(),
      observacao: $('#lead-visita-observacao').value.trim() || null,
    });
    snapshot.visitas.push(visita);
    const lead = snapshot.leads.find((item) => item.id === leadAbertoId);
    const anterior = lead.status;
    lead.status = 'visita_agendada';
    const interacao = await repo.adicionarInteracao({
      lead_id: leadAbertoId, tipo: 'status', direcao: 'interna', autor: 'corretor',
      canal: 'painel', conteudo: `Visita agendada para ${formatarData(visita.quando, true)}.`,
    });
    snapshot.interacoes.push(interacao);
    $('#lead-visita-form').reset();
    renderizarTudo();
    abrirLead(leadAbertoId, { reabrir: true });
    if (anterior !== 'visita_agendada') $('#lead-status').value = 'visita_agendada';
  } catch (erro) {
    mostrarRecadoLead(`Não consegui agendar a visita: ${erro.message}`, 'erro');
  } finally {
    botao.disabled = false;
  }
}

async function alternarIADoLead() {
  const lead = snapshot.leads.find((item) => item.id === leadAbertoId);
  if (!lead) return;
  const anterior = lead.ia_ativa !== false;
  const novo = $('#lead-ia-ativa').checked;
  lead.ia_ativa = novo;
  try {
    await repo.atualizarLead(lead.id, { ia_ativa: novo });
    mostrarRecadoLead(novo ? 'IA ativada para este lead.' : 'IA pausada para este lead.');
  } catch (erro) {
    lead.ia_ativa = anterior;
    $('#lead-ia-ativa').checked = anterior;
    mostrarRecadoLead(erro.message, 'erro');
  }
}

async function sugerirResposta() {
  if (!leadAbertoId) return;
  const botao = $('#lead-sugerir');
  const recado = $('#lead-sugestao-recado');
  botao.disabled = true;
  botao.innerHTML = '<i class="ph ph-circle-notch ico" aria-hidden="true"></i>Preparando';
  recado.textContent = 'A IA está lendo o histórico e o catálogo.';
  try {
    const sugestao = await repo.sugerirResposta(leadAbertoId);
    $('#lead-resposta').value = sugestao;
    recado.textContent = 'Sugestão pronta. Revise antes de enviar.';
  } catch (erro) {
    recado.textContent = erro.message;
  } finally {
    botao.disabled = false;
    botao.innerHTML = '<i class="ph ph-sparkle ico" aria-hidden="true"></i>Sugerir com IA';
  }
}

async function copiarResposta() {
  const texto = $('#lead-resposta').value.trim();
  if (!texto) return;
  try {
    await navigator.clipboard.writeText(texto);
    $('#lead-sugestao-recado').textContent = 'Resposta copiada.';
  } catch {
    $('#lead-resposta').select();
    document.execCommand('copy');
    $('#lead-sugestao-recado').textContent = 'Resposta copiada.';
  }
}

function abrirRespostaNoWhatsApp() {
  const lead = snapshot.leads.find((item) => item.id === leadAbertoId);
  const telefone = telefoneLimpo(lead);
  const texto = $('#lead-resposta').value.trim();
  if (!telefone) {
    $('#lead-sugestao-recado').textContent = 'Cadastre o telefone antes de abrir o WhatsApp.';
    return;
  }
  window.open(`https://wa.me/${telefone}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`, '_blank', 'noopener');
}

async function salvarModoIA() {
  const botao = $('#crm-ia-salvar');
  botao.disabled = true;
  botao.textContent = 'Salvando';
  try {
    snapshot.configuracao = await repo.salvarConfiguracaoIA({
      ...(snapshot.configuracao ?? {}),
      modo: $('#crm-ia-modo').value,
      agente: snapshot.configuracao?.agente ?? 'ah_imobiliaria',
    });
    renderizarIA();
    mostrarRecado('Modo da IA atualizado.');
  } catch (erro) {
    mostrarRecado(`Não consegui salvar o modo da IA: ${erro.message}`, 'erro');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar modo';
  }
}

function abrirNovoLead() {
  $('#novo-lead-form').reset();
  $('#novo-lead-recado').hidden = true;
  $('#novo-lead-dialog').showModal();
}

async function cadastrarLead(evento) {
  evento.preventDefault();
  const form = $('#novo-lead-form');
  const botao = evento.submitter ?? evento.currentTarget.querySelector('[type="submit"]');
  const nome = $('#novo-lead-nome').value.trim();
  const telefone = $('#novo-lead-telefone').value.replace(/\D/g, '');
  const mensagem = $('#novo-lead-mensagem').value.trim();
  if (!nome || telefone.length < 10) {
    const recado = $('#novo-lead-recado');
    recado.className = 'recado recado--erro';
    recado.textContent = 'Informe o nome e um telefone com DDD.';
    recado.hidden = false;
    return;
  }
  botao.disabled = true;
  try {
    const lead = await repo.criarLead({
      nome, telefone, mensagem: mensagem || null,
      origem: $('#novo-lead-origem').value,
      proximo_contato: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    });
    snapshot.leads.unshift(lead);
    if (mensagem) {
      const interacao = await repo.adicionarInteracao({
        lead_id: lead.id, tipo: 'mensagem', direcao: 'entrada', autor: 'lead',
        canal: lead.origem, conteudo: mensagem,
      });
      snapshot.interacoes.push(interacao);
    }
    form.reset();
    $('#novo-lead-dialog').close();
    renderizarTudo();
    abrirLead(lead.id);
  } catch (erro) {
    const recado = $('#novo-lead-recado');
    recado.className = 'recado recado--erro';
    recado.textContent = erro.message;
    recado.hidden = false;
  } finally {
    botao.disabled = false;
  }
}

function ligarEventos() {
  ['#crm-busca', '#crm-origem', '#crm-atrasados'].forEach((seletor) => {
    $(seletor).addEventListener(seletor === '#crm-busca' ? 'input' : 'change', renderizarFunil);
  });
  $('#crm-periodo').addEventListener('change', () => {
    renderizarKPIs(); renderizarGrafico(); renderizarOrigens();
  });
  $('#crm-atualizar').addEventListener('click', () => carregarCRM());
  $('#crm-exportar').addEventListener('click', exportarCSV);
  $('#crm-ia-salvar').addEventListener('click', salvarModoIA);
  $('#crm-novo-lead').addEventListener('click', abrirNovoLead);

  $('#crm-funil').addEventListener('click', (evento) => {
    // O atalho do WhatsApp mora dentro do card. Sem esta saída, clicar nele
    // abriria a conversa E a ficha por cima dela.
    if (evento.target.closest('.lead-card__zap')) return;
    const card = evento.target.closest('[data-lead-id]');
    if (card) abrirLead(card.dataset.leadId);
  });
  $('#crm-funil').addEventListener('keydown', (evento) => {
    if (evento.target.closest('.lead-card__zap')) return;
    const card = evento.target.closest('[data-lead-id]');
    if (card && (evento.key === 'Enter' || evento.key === ' ')) {
      evento.preventDefault();
      abrirLead(card.dataset.leadId);
    }
  });

  $('#lead-detalhe-fechar').addEventListener('click', fecharLead);
  $('#lead-detalhe').addEventListener('click', (evento) => {
    if (evento.target === $('#lead-detalhe')) fecharLead();
  });
  $('#lead-form').addEventListener('submit', salvarFicha);
  $('#lead-status').addEventListener('change', atualizarMotivoPerda);
  $('#lead-ia-ativa').addEventListener('change', alternarIADoLead);
  $('#lead-nota-form').addEventListener('submit', salvarNota);
  $('#lead-visita-form').addEventListener('submit', salvarVisita);
  $('#lead-sugerir').addEventListener('click', sugerirResposta);
  $('#lead-copiar').addEventListener('click', copiarResposta);
  $('#lead-abrir-resposta').addEventListener('click', abrirRespostaNoWhatsApp);

  $('#novo-lead-form').addEventListener('submit', cadastrarLead);
  $('#novo-lead-fechar').addEventListener('click', () => $('#novo-lead-dialog').close());
  $('#novo-lead-cancelar').addEventListener('click', () => $('#novo-lead-dialog').close());
  $('#novo-lead-dialog').addEventListener('click', (evento) => {
    if (evento.target === $('#novo-lead-dialog')) $('#novo-lead-dialog').close();
  });

  ['#lead-preco-min', '#lead-preco-max', '#lead-valor-potencial'].forEach((seletor) => {
    mascararMoeda($(seletor));
  });
}

export function iniciarCRM() {
  if (iniciado) return;
  iniciado = true;
  ligarEventos();
}

export function fecharCRM() {
  if ($('#lead-detalhe').open) fecharLead();
  if ($('#novo-lead-dialog').open) $('#novo-lead-dialog').close();
}
