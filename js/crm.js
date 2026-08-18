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

const ETAPAS = [
  { id: 'novo', nome: 'Novos', icone: 'ph-inbox' },
  { id: 'em_atendimento', nome: 'Em atendimento', icone: 'ph-chats-circle' },
  { id: 'qualificado', nome: 'Qualificados', icone: 'ph-seal-check' },
  { id: 'visita_agendada', nome: 'Visitas', icone: 'ph-calendar-check' },
  { id: 'proposta', nome: 'Propostas', icone: 'ph-file-text' },
  { id: 'fechado', nome: 'Fechados', icone: 'ph-key' },
  { id: 'perdido', nome: 'Perdidos', icone: 'ph-archive' },
];

const ETAPA_POR_ID = new Map(ETAPAS.map((etapa) => [etapa.id, etapa]));
const ORIGENS = {
  site: { nome: 'Site', icone: 'ph-globe' },
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

function renderizarKPIs() {
  const leads = leadsDoPeriodo();
  const fechados = leads.filter((lead) => lead.status === 'fechado').length;
  const qualificados = leads.filter((lead) =>
    ['qualificado', 'visita_agendada', 'proposta', 'fechado'].includes(lead.status)).length;
  const visitas = snapshot.visitas.filter((visita) => dentroDoPeriodo(visita.criado_em ?? visita.quando)).length;
  const conversao = leads.length ? (fechados / leads.length) * 100 : 0;
  const potencial = leads
    .filter((lead) => STATUS_ATIVOS.has(lead.status))
    .reduce((soma, lead) => soma + Number(lead.valor_potencial ?? lead.imovel?.preco ?? 0), 0);

  const itens = [
    { icone: 'ph-user-plus', rotulo: 'Leads no período', valor: numeroCurto(leads.length) },
    { icone: 'ph-seal-check', rotulo: 'Qualificados', valor: numeroCurto(qualificados) },
    { icone: 'ph-calendar-check', rotulo: 'Visitas', valor: numeroCurto(visitas) },
    { icone: 'ph-trend-up', rotulo: 'Conversão', valor: `${conversao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` },
    { icone: 'ph-timer', rotulo: 'Primeira resposta', valor: minutosLegiveis(mediaPrimeiraResposta(leads)) },
    { icone: 'ph-currency-circle-dollar', rotulo: 'Potencial ativo', valor: potencial ? moedaCompacta(potencial) : 'Não informado' },
  ];

  $('#crm-kpis').innerHTML = itens.map((item) => `
    <article class="crm-kpi">
      <i class="ph ${item.icone}" aria-hidden="true"></i>
      <div><strong>${escapar(item.valor)}</strong><span>${escapar(item.rotulo)}</span></div>
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
    return { total, rotulo };
  });
}

function renderizarGrafico() {
  const buckets = construirBuckets();
  const maximo = Math.max(1, ...buckets.map((item) => item.total));
  $('#crm-grafico').innerHTML = buckets.map((item) => `
    <div class="crm-grafico__item" title="${item.total} lead${item.total === 1 ? '' : 's'}">
      <span class="crm-grafico__numero">${item.total || ''}</span>
      <span class="crm-grafico__barra" style="--altura:${Math.max(item.total ? 10 : 2, (item.total / maximo) * 100)}%"></span>
      <span class="crm-grafico__rotulo">${escapar(item.rotulo)}</span>
    </div>`).join('');
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
  $('#crm-origens').innerHTML = itens.map(([origem, total]) => {
    const info = ORIGENS[origem] ?? { nome: origem, icone: 'ph-chat-circle' };
    const porcentagem = leads.length ? Math.round((total / leads.length) * 100) : 0;
    return `
      <div class="crm-origem">
        <i class="ph ${info.icone}" aria-hidden="true"></i>
        <span>${escapar(info.nome)}</span>
        <span class="crm-origem__linha"><i style="--largura:${(total / maior) * 100}%"></i></span>
        <strong>${total} <small>${porcentagem}%</small></strong>
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

function cardDoLead(lead) {
  const origem = ORIGENS[lead.origem] ?? { nome: lead.origem, icone: 'ph-chat-circle' };
  const atrasado = retornoAtrasado(lead);
  const pendentes = naoLidas(lead.id);
  const prioridade = Number(lead.prioridade ?? 1);
  return `
    <article class="lead-card lead-card--p${prioridade}${atrasado ? ' lead-card--atrasado' : ''}"
             draggable="true" tabindex="0" data-lead-id="${escapar(lead.id)}"
             aria-label="Abrir ficha de ${escapar(lead.nome ?? 'lead sem nome')}">
      <div class="lead-card__topo">
        <span class="lead-card__origem"><i class="ph ${origem.icone}" aria-hidden="true"></i>${escapar(origem.nome)}</span>
        ${pendentes ? `<span class="lead-card__nao-lidas" title="Mensagens não lidas">${pendentes}</span>` : ''}
      </div>
      <strong class="lead-card__nome">${escapar(lead.nome || 'Sem nome')}</strong>
      <p class="lead-card__interesse">${escapar(interesseDo(lead))}</p>
      ${lead.tags?.length ? `<div class="lead-card__tags">${lead.tags.slice(0, 2).map((tag) => `<span>${escapar(tag)}</span>`).join('')}</div>` : ''}
      <div class="lead-card__rodape">
        <span>${escapar(tempoRelativo(ultimaAtividade(lead)))}</span>
        ${atrasado
          ? '<span class="lead-card__retorno"><i class="ph ph-warning" aria-hidden="true"></i>Retornar</span>'
          : `<span>${escapar(PRIORIDADES[prioridade] ?? 'Normal')}</span>`}
      </div>
    </article>`;
}

function renderizarFunil() {
  const leads = leadsFiltrados();
  $('#crm-contagem').textContent = `${leads.length} lead${leads.length === 1 ? '' : 's'} no funil`;
  $('#crm-funil').innerHTML = ETAPAS.map((etapa) => {
    const itens = leads.filter((lead) => lead.status === etapa.id);
    const valor = itens.reduce((soma, lead) => soma + Number(lead.valor_potencial ?? 0), 0);
    return `
      <section class="funil-coluna" data-etapa="${etapa.id}" aria-labelledby="etapa-${etapa.id}">
        <header class="funil-coluna__topo">
          <div><i class="ph ${etapa.icone}" aria-hidden="true"></i><h4 id="etapa-${etapa.id}">${etapa.nome}</h4></div>
          <span>${itens.length}</span>
        </header>
        <p class="funil-coluna__valor">${valor ? moeda(valor) : 'Sem valor informado'}</p>
        <div class="funil-coluna__corpo" data-soltar="${etapa.id}">
          ${itens.length ? itens.map(cardDoLead).join('') : '<p class="funil-coluna__vazio">Solte um lead aqui</p>'}
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

function mostrarCarregando() {
  $('#crm-kpis').innerHTML = '<div class="esqueleto crm-kpi"></div>'.repeat(6);
  $('#crm-grafico').innerHTML = '<div class="esqueleto" style="height:12rem"></div>';
  $('#crm-origens').innerHTML = '<div class="esqueleto" style="height:12rem"></div>';
  $('#crm-funil').innerHTML = '<div class="esqueleto funil-coluna"></div>'.repeat(4);
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
    const card = evento.target.closest('[data-lead-id]');
    if (card) abrirLead(card.dataset.leadId);
  });
  $('#crm-funil').addEventListener('keydown', (evento) => {
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
