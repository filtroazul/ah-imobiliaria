// ============================================================================
// Camada de dados
// ----------------------------------------------------------------------------
// Uma única API pro resto do site. Por baixo existem TRÊS origens possíveis, e
// nenhuma tela precisa saber qual está ativa:
//
//   nuvem   config.js tem as chaves     -> Supabase. É o modo de publicação.
//   local   sem chaves, carteira cheia  -> IndexedDB deste navegador. É o que
//                                          o painel usa pra funcionar sem conta.
//   exemplo sem chaves, carteira vazia  -> js/demo.js, 9 imóveis de mentira,
//                                          só pra o site não abrir vazio.
//
// A ordem importa: assim que o corretor cadastrar o primeiro imóvel de verdade
// no painel, o modo "exemplo" morre sozinho e os imóveis de mentira somem sem
// ninguém precisar apagar nada.
// ============================================================================

import { CONFIG, configurado } from './config.js';
import { IMOVEIS_DEMO, BAIRROS_DEMO } from './demo.js';
import * as local from './local.js';

const CDN_SUPABASE = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let _cliente = null;

/** Cliente Supabase, carregado sob demanda. Null quando não configurado. */
export async function cliente() {
  if (!configurado()) return null;
  if (_cliente) return _cliente;
  const { createClient } = await import(CDN_SUPABASE);
  _cliente = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  return _cliente;
}

export const MODO = { NUVEM: 'nuvem', LOCAL: 'local', EXEMPLO: 'exemplo' };

let _modo = null;

/**
 * Qual origem está valendo. Decidido uma vez por carregamento de página: o
 * catálogo consulta isso a cada filtro e não pode contar imóvel no banco toda
 * vez. Quem grava (o painel) chama esquecerModo() depois de salvar.
 */
export async function modoAtual() {
  if (_modo) return _modo;
  if (configurado()) return (_modo = MODO.NUVEM);

  try {
    _modo = (await local.contarImoveis()) > 0 ? MODO.LOCAL : MODO.EXEMPLO;
  } catch {
    // Banco local indisponível (aba anônima, cookies bloqueados). O site
    // continua de pé mostrando os exemplos; quem avisa é o painel.
    _modo = MODO.EXEMPLO;
  }
  return _modo;
}

export const esquecerModo = () => { _modo = null; };

/* ---- mídias do modo local -------------------------------------------------
   No Supabase as fotos vêm juntas na consulta. No IndexedDB elas moram em
   outra tabela, então cada imóvel precisa ser "hidratado" antes de virar
   cartão ou página. */

async function hidratar(imovel) {
  if (!imovel) return imovel;
  const midias = await local.midiasDe(imovel.id);

  const fotos = midias.filter((m) => m.tipo === 'foto');
  const videos = midias.filter((m) => m.tipo === 'video' || m.tipo === 'video-link');

  return {
    ...imovel,
    fotos: fotos.map(local.enderecoDe).filter(Boolean),
    capa: fotos.length ? local.enderecoDe(fotos[0]) : null,
    videos: videos.map((v) => ({
      tipo: v.tipo,
      url: local.enderecoDe(v),
      mime: v.mime,
      legenda: v.legenda,
    })).filter((v) => v.url),
    total_videos: videos.length,
  };
}

const PUBLICOS = ['disponivel', 'reservado'];

// ----------------------------------------------------------------------------
// Formatação
// ----------------------------------------------------------------------------

const _moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
});

export const moeda = (v) => (v == null ? '' : _moeda.format(v));

/** "R$ 848.000" para venda, "R$ 2.350/mês" para aluguel. */
export const precoRotulo = (imovel) =>
  imovel.finalidade === 'aluguel'
    ? `${moeda(imovel.preco)}<span class="unidade">/mês</span>`
    : moeda(imovel.preco);

export const area = (v) => (v ? `${Number(v).toLocaleString('pt-BR')} m²` : null);

export const TIPOS = {
  casa: 'Casa', apartamento: 'Apartamento', terreno: 'Terreno',
  comercial: 'Comercial', rural: 'Rural',
};

/** Link de WhatsApp já com a mensagem escrita pro cliente só apertar enviar. */
export function linkWhatsApp(imovel) {
  const numero = CONFIG.contato.whatsapp;
  const texto = imovel
    ? `Olá! Vi o imóvel de código ${imovel.codigo} no site (${imovel.titulo}) e queria mais informações.`
    : 'Olá! Vim pelo site e queria falar com um corretor.';
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

// ----------------------------------------------------------------------------
// Consultas
// ----------------------------------------------------------------------------

const VAZIO = { itens: [], total: 0 };

/**
 * Lista o catálogo com filtros.
 * @returns {Promise<{itens: Array, total: number}>}
 */
export async function listarImoveis(filtros = {}) {
  const {
    finalidade, tipo, bairro, precoMin, precoMax,
    quartosMin, busca, pagina = 0, porPagina = CONFIG.porPagina,
  } = filtros;

  const modo = await modoAtual();

  // ---- local e exemplo: filtra em memória -----------------------------------
  if (modo !== MODO.NUVEM) {
    const fonte = modo === MODO.LOCAL
      ? (await local.listarImoveis()).filter((i) => PUBLICOS.includes(i.status))
      : IMOVEIS_DEMO;

    let itens = fonte.filter((i) => {
      if (finalidade && i.finalidade !== finalidade) return false;
      if (tipo && i.tipo !== tipo) return false;
      if (bairro && i.bairro !== bairro) return false;
      if (precoMin != null && i.preco < precoMin) return false;
      if (precoMax != null && i.preco > precoMax) return false;
      if (quartosMin != null && (i.quartos ?? 0) < quartosMin) return false;
      if (busca) {
        const alvo = `${i.titulo} ${i.bairro} ${i.cidade} ${i.descricao}`.toLowerCase();
        if (!normalizar(alvo).includes(normalizar(busca))) return false;
      }
      return true;
    });
    itens.sort((a, b) => Number(b.destaque) - Number(a.destaque) || a.preco - b.preco);

    const total = itens.length;
    const inicio = pagina * porPagina;
    const pagina_ = itens.slice(inicio, inicio + porPagina);

    // Só a página visível é hidratada: criar endereço de blob pra carteira
    // inteira a cada filtro é trabalho jogado fora.
    return {
      itens: modo === MODO.LOCAL ? await Promise.all(pagina_.map(hidratar)) : pagina_,
      total,
    };
  }

  // ---- Supabase ------------------------------------------------------------
  const sb = await cliente();
  let q = sb.from('catalogo').select('*', { count: 'exact' })
    .in('status', PUBLICOS);

  if (finalidade) q = q.eq('finalidade', finalidade);
  if (tipo) q = q.eq('tipo', tipo);
  if (bairro) q = q.eq('bairro', bairro);
  if (precoMin != null) q = q.gte('preco', precoMin);
  if (precoMax != null) q = q.lte('preco', precoMax);
  if (quartosMin != null) q = q.gte('quartos', quartosMin);
  if (busca) q = q.or(`titulo.ilike.%${busca}%,bairro.ilike.%${busca}%`);

  const inicio = pagina * porPagina;
  q = q.order('destaque', { ascending: false })
       .order('criado_em', { ascending: false })
       .range(inicio, inicio + porPagina - 1);

  const { data, error, count } = await q;
  if (error) throw new Error(`Não consegui carregar os imóveis: ${error.message}`);
  return { itens: data ?? [], total: count ?? 0 };
}

/** Os imóveis marcados como destaque, pra vitrine da home. */
export async function listarDestaques(quantidade = 3) {
  const modo = await modoAtual();

  if (modo === MODO.EXEMPLO) {
    return IMOVEIS_DEMO.filter((i) => i.destaque).slice(0, quantidade);
  }

  if (modo === MODO.LOCAL) {
    const itens = (await local.listarImoveis())
      .filter((i) => i.destaque && PUBLICOS.includes(i.status))
      .slice(0, quantidade);
    return Promise.all(itens.map(hidratar));
  }

  const sb = await cliente();
  const { data, error } = await sb.from('catalogo').select('*')
    .in('status', PUBLICOS)
    .eq('destaque', true)
    .order('criado_em', { ascending: false })
    .limit(quantidade);

  if (error) throw new Error(`Não consegui carregar os destaques: ${error.message}`);
  return data ?? [];
}

/** Um imóvel completo, com todas as fotos, pela página de detalhe. */
export async function obterImovel(codigo) {
  const modo = await modoAtual();

  if (modo === MODO.EXEMPLO) {
    return IMOVEIS_DEMO.find((i) => i.codigo === Number(codigo)) ?? null;
  }

  if (modo === MODO.LOCAL) {
    const achado = await local.obterImovelPorCodigo(codigo);
    if (!achado || !PUBLICOS.includes(achado.status)) return null;
    const cheio = await hidratar(achado);
    if (!cheio.mostrar_endereco) { cheio.logradouro = null; cheio.numero = null; }
    return cheio;
  }

  const sb = await cliente();
  const { data, error } = await sb.from('imoveis')
    .select('*, fotos(url, ordem, legenda), videos(url, tipo, ordem, legenda)')
    .eq('codigo', Number(codigo))
    .in('status', PUBLICOS)
    .maybeSingle();

  if (error) throw new Error(`Não consegui carregar o imóvel: ${error.message}`);
  if (!data) return null;

  data.fotos = (data.fotos ?? []).sort((a, b) => a.ordem - b.ordem).map((f) => f.url);
  data.capa = data.fotos[0] ?? null;
  data.videos = (data.videos ?? []).sort((a, b) => a.ordem - b.ordem);
  if (!data.mostrar_endereco) { data.logradouro = null; data.numero = null; }
  return data;
}

/** Bairros que realmente têm imóvel publicado, pra montar o select do filtro. */
export async function listarBairros() {
  const modo = await modoAtual();

  if (modo === MODO.EXEMPLO) return BAIRROS_DEMO;

  if (modo === MODO.LOCAL) {
    const itens = (await local.listarImoveis()).filter((i) => PUBLICOS.includes(i.status));
    return ordenarBairros(itens.map((i) => i.bairro));
  }

  const sb = await cliente();
  const { data, error } = await sb.from('catalogo').select('bairro').in('status', PUBLICOS);
  if (error) return [];
  return ordenarBairros(data.map((r) => r.bairro));
}

const ordenarBairros = (lista) =>
  [...new Set(lista.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

/**
 * Grava um lead. Passa pela RPC registrar_lead, que é a única porta de entrada
 * que o visitante anônimo tem. Ele grava mas não lê nada da base de leads.
 */
export async function registrarLead({ nome, telefone, mensagem, email, imovelId, origem = 'site' }) {
  if (!configurado()) {
    // Sem Supabase o contato cai no banco local e aparece na aba "Contatos
    // recebidos" do painel. Vale só neste navegador — mas é melhor que o que
    // havia antes, que era fingir sucesso e jogar o contato fora.
    try {
      const lead = await local.salvarLead({
        nome, telefone, mensagem: mensagem ?? null, email: email ?? null,
        imovel_id: imovelId ?? null, origem,
      });
      return { id: lead.id, local: true };
    } catch {
      // Banco local fora do ar não pode fazer o visitante achar que falhou:
      // o WhatsApp continua ali do lado e é por ele que o negócio acontece.
      return { id: null, local: true, perdido: true };
    }
  }

  const sb = await cliente();
  const { data, error } = await sb.rpc('registrar_lead', {
    p_nome: nome,
    p_telefone: telefone,
    p_mensagem: mensagem ?? null,
    p_email: email ?? null,
    p_imovel_id: imovelId ?? null,
    p_origem: origem,
  });

  if (error) throw new Error(error.message);
  return { id: data };
}

// ----------------------------------------------------------------------------

const normalizar = (s) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase();

export { normalizar };
