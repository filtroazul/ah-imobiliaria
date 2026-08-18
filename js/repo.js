// ============================================================================
// Repositório do painel
// ----------------------------------------------------------------------------
// O admin.js não sabe (e não deve saber) se a carteira está no navegador ou no
// Supabase. Ele pede "lista", "salva", "exclui" — e é aqui que a diferença
// mora.
//
//   local  sem chaves no config.js  -> IndexedDB (js/local.js). Funciona na
//                                      hora, sem conta e sem senha, mas só
//                                      neste navegador.
//   nuvem  com chaves               -> Supabase. Login de verdade, acessível
//                                      do celular, e é o que vai ao ar.
//
// Uma mídia, na conversa entre o admin e este arquivo, é sempre:
//   { chave, tipo, url, blob?, mime?, legenda?, existente, removida?, path? }
// onde tipo ∈ 'foto' | 'video' | 'video-link'. `url` é sempre o que dá pra
// jogar num <img>/<video> agora; `blob` só existe em arquivo ainda não gravado.
// ============================================================================

import { CONFIG, configurado } from './config.js';
import { cliente, esquecerModo } from './dados.js';
import * as local from './local.js';

export const MODO = configurado() ? 'nuvem' : 'local';
export const naNuvem = MODO === 'nuvem';

const BUCKET = 'imoveis';

/* =============================================================== sessão == */

/**
 * No modo local não existe login. Isso é decisão, não esquecimento: a carteira
 * já está dentro do navegador de quem abriu o painel, então uma senha aqui
 * protegeria contra ninguém — quem tem acesso à máquina tem acesso ao banco.
 * A porta que importa é a do Supabase, e essa tem senha.
 */
export async function sessao() {
  if (!naNuvem) return { email: null, local: true };
  const sb = await cliente();
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}

export async function entrar(email, senha) {
  const sb = await cliente();
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) {
    throw new Error(error.message === 'Invalid login credentials'
      ? 'E-mail ou senha não conferem.'
      : error.message);
  }
  return data.user;
}

export async function sair() {
  if (!naNuvem) return;
  const sb = await cliente();
  await sb.auth.signOut();
}

/* ============================================================== imóveis == */

/** A lista do painel: tudo, inclusive rascunho e vendido. */
export async function listar() {
  if (!naNuvem) {
    const itens = await local.listarImoveis();
    return Promise.all(itens.map(async (im) => {
      const midias = await local.midiasDe(im.id);
      const fotos = midias.filter((m) => m.tipo === 'foto');
      return {
        ...im,
        capa: fotos.length ? local.enderecoDe(fotos[0]) : null,
        n_fotos: fotos.length,
        n_videos: midias.length - fotos.length,
      };
    }));
  }

  const sb = await cliente();
  const { data, error } = await sb.from('imoveis')
    .select('id, codigo, titulo, tipo, finalidade, preco, bairro, cidade, status, ' +
            'destaque, fotos(url, ordem), videos(id)')
    .order('atualizado_em', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  return data.map((im) => ({
    ...im,
    capa: (im.fotos ?? []).sort((a, b) => a.ordem - b.ordem)[0]?.url ?? null,
    n_fotos: (im.fotos ?? []).length,
    n_videos: (im.videos ?? []).length,
  }));
}

/** Um imóvel para edição, com as mídias no formato que o painel manipula. */
export async function obter(id) {
  if (!naNuvem) {
    const im = await local.obterImovel(id);
    if (!im) throw new Error('Esse imóvel não está mais na carteira.');
    const midias = (await local.midiasDe(id)).map((m) => ({
      chave: m.id,
      tipo: m.tipo,
      url: local.enderecoDe(m),
      mime: m.mime,
      legenda: m.legenda,
      existente: true,
    }));
    return { ...im, midias };
  }

  const sb = await cliente();
  const { data, error } = await sb.from('imoveis')
    .select('*, fotos(id, url, path, ordem), videos(id, url, path, tipo, ordem, legenda)')
    .eq('id', id).single();
  if (error) throw new Error(error.message);

  const fotos = (data.fotos ?? []).sort((a, b) => a.ordem - b.ordem).map((f) => ({
    chave: f.id, tipo: 'foto', url: f.url, path: f.path, existente: true,
  }));
  const videos = (data.videos ?? []).sort((a, b) => a.ordem - b.ordem).map((v) => ({
    chave: v.id, tipo: v.tipo, url: v.url, path: v.path,
    legenda: v.legenda, existente: true,
  }));

  return { ...data, midias: [...fotos, ...videos] };
}

/**
 * Grava imóvel + mídias numa tacada.
 * @param {object}   p.dados     campos do imóvel
 * @param {string?}  p.id        null = cadastro novo
 * @param {Array}    p.midias    lista COMPLETA e na ordem final; o que não
 *                               estiver aqui é apagado
 * @param {Function} p.aoAndar   (feito, total, rotulo) para a barra de progresso
 * @returns {Promise<object>} o imóvel gravado
 */
export async function salvar({ id, dados, midias, aoAndar = () => {} }) {
  const vivas = midias.filter((m) => !m.removida);

  if (!naNuvem) {
    const imovel = await local.salvarImovel({ ...dados, id: id ?? undefined });
    await local.regravarMidias(imovel.id, vivas.map((m) => ({
      // A chave só é reaproveitada em mídia que já estava gravada. Item novo
      // recebe id novo dentro do regravarMidias.
      id: m.existente ? m.chave : undefined,
      tipo: m.tipo,
      blob: m.blob ?? null,
      url: m.tipo === 'video-link' ? m.url : null,
      mime: m.mime ?? null,
      legenda: m.legenda ?? null,
    })));

    // A home decide entre "carteira de exemplo" e carteira real contando
    // imóveis. Sem isto, o primeiro cadastro só aparece depois de um F5.
    esquecerModo();
    return imovel;
  }

  const sb = await cliente();
  const usuario = await sessao();

  // 1. o imóvel
  let idFinal = id;
  if (idFinal) {
    const { error } = await sb.from('imoveis').update(dados).eq('id', idFinal);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await sb.from('imoveis')
      .insert({ ...dados, corretor_id: usuario.id }).select('id, codigo').single();
    if (error) throw new Error(error.message);
    idFinal = data.id;
  }

  // 2. arquivos que saíram: some do banco e do armazenamento
  const removidas = midias.filter((m) => m.removida && m.existente);
  const caminhosMortos = removidas.map((m) => m.path).filter(Boolean);
  if (caminhosMortos.length) await sb.storage.from(BUCKET).remove(caminhosMortos);

  // 3. arquivos novos
  const novas = vivas.filter((m) => m.blob);
  let feitos = 0;
  for (const midia of novas) {
    const extensao = midia.tipo === 'foto' ? 'webp' : extensaoDe(midia.mime);
    const caminho = `${idFinal}/${crypto.randomUUID()}.${extensao}`;
    const { error } = await sb.storage.from(BUCKET)
      .upload(caminho, midia.blob, { contentType: midia.mime, upsert: false });
    if (error) throw new Error(`Falha ao enviar um arquivo: ${error.message}`);

    midia.path = caminho;
    midia.url = sb.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
    midia.blob = null;
    midia.existente = true;
    aoAndar(++feitos, novas.length, midia.tipo === 'foto' ? 'fotos' : 'vídeos');
  }

  // 4. reescreve as duas tabelas de mídia inteiras, na ordem da tela.
  //    Apagar e reinserir é mais simples que reconciliar, e a ordem das fotos
  //    é justamente o que o corretor arrasta e espera ver mantido.
  const fotos = vivas.filter((m) => m.tipo === 'foto');
  const videos = vivas.filter((m) => m.tipo !== 'foto');

  await sb.from('fotos').delete().eq('imovel_id', idFinal);
  if (fotos.length) {
    const { error } = await sb.from('fotos').insert(fotos.map((m, ordem) => ({
      imovel_id: idFinal, url: m.url, path: m.path ?? null, ordem,
    })));
    if (error) throw new Error(error.message);
  }

  await sb.from('videos').delete().eq('imovel_id', idFinal);
  if (videos.length) {
    const { error } = await sb.from('videos').insert(videos.map((m, ordem) => ({
      imovel_id: idFinal, url: m.url, path: m.path ?? null,
      tipo: m.tipo, legenda: m.legenda ?? null, ordem,
    })));
    if (error) throw new Error(error.message);
  }

  return { id: idFinal, ...dados };
}

export async function excluir(id, midias = []) {
  if (!naNuvem) {
    await local.excluirImovel(id);
    esquecerModo();
    return;
  }

  const sb = await cliente();
  const caminhos = midias.map((m) => m.path).filter(Boolean);
  if (caminhos.length) await sb.storage.from(BUCKET).remove(caminhos);

  // fotos e videos caem junto pelo "on delete cascade" do schema.
  const { error } = await sb.from('imoveis').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ================================================================ leads == */

function padronizarLead(lead) {
  return {
    bairros: [],
    tags: [],
    ia_ativa: true,
    prioridade: 1,
    status: 'novo',
    ...lead,
  };
}

export async function leads() {
  return (await crmSnapshot()).leads;
}

/** Tudo de que o CRM precisa em uma leitura coerente. */
export async function crmSnapshot() {
  if (!naNuvem) {
    const [leadsLocais, interacoes, visitas, configuracao, imoveis] = await Promise.all([
      local.listarLeads(),
      local.listarInteracoes(),
      local.listarVisitas(),
      local.obterConfiguracaoIA(),
      local.listarImoveis(),
    ]);
    const porId = new Map(imoveis.map((imovel) => [imovel.id, imovel]));
    return {
      leads: leadsLocais.map((lead) => padronizarLead({
        ...lead,
        imovel: porId.get(lead.imovel_id) ?? null,
      })),
      interacoes,
      visitas,
      configuracao,
      imoveis,
    };
  }

  const sb = await cliente();
  const [qLeads, qInteracoes, qVisitas, qConfiguracao, qImoveis] = await Promise.all([
    sb.from('leads').select('*').order('criado_em', { ascending: false }).limit(500),
    sb.from('lead_interacoes').select('*').order('criado_em', { ascending: false }).limit(4000),
    sb.from('visitas').select('*').order('quando', { ascending: false }).limit(1000),
    sb.from('configuracoes_ia').select('*').eq('id', 'principal').maybeSingle(),
    sb.from('imoveis').select('id, codigo, titulo, preco, bairro, cidade, status')
      .order('atualizado_em', { ascending: false }).limit(500),
  ]);

  const falha = [qLeads, qInteracoes, qVisitas, qConfiguracao, qImoveis]
    .find((resultado) => resultado.error);
  if (falha) {
    const faltouCRM = /lead_interacoes|configuracoes_ia|schema cache/i.test(falha.error.message);
    throw new Error(faltouCRM
      ? 'O CRM ainda não foi instalado no banco. Rode a migração supabase/migrations/20260818_crm_funil.sql.'
      : falha.error.message);
  }

  const imoveis = qImoveis.data ?? [];
  const porId = new Map(imoveis.map((imovel) => [imovel.id, imovel]));
  return {
    leads: (qLeads.data ?? []).map((lead) => padronizarLead({
      ...lead,
      imovel: porId.get(lead.imovel_id) ?? null,
    })),
    interacoes: qInteracoes.data ?? [],
    visitas: qVisitas.data ?? [],
    configuracao: qConfiguracao.data ?? {
      id: 'principal', modo: 'automatico', agente: 'ah_imobiliaria',
      canais: ['whatsapp', 'instagram'],
    },
    imoveis,
  };
}

export async function criarLead(dados) {
  const registro = padronizarLead(dados);
  if (!naNuvem) return local.salvarLead(registro);

  const sb = await cliente();
  const atual = await sessao();
  const { data, error } = await sb.from('leads')
    .insert({ ...registro, corretor_id: atual.id })
    .select('*').single();
  if (error) throw new Error(error.message);
  return padronizarLead(data);
}

export async function atualizarLead(id, dados) {
  const atualizacao = { ...dados };
  const agora = new Date().toISOString();
  if (dados.status === 'qualificado') atualizacao.qualificado_em ??= agora;
  if (dados.status === 'fechado') atualizacao.fechado_em ??= agora;

  if (!naNuvem) return local.atualizarLead(id, atualizacao);
  const sb = await cliente();
  const { data, error } = await sb.from('leads')
    .update(atualizacao).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return padronizarLead(data);
}

export async function adicionarInteracao(interacao) {
  if (!naNuvem) {
    const salva = await local.salvarInteracao(interacao);
    const mudanca = { ultimo_contato: salva.criado_em };
    const lead = await local.obterLead(salva.lead_id);
    if (salva.direcao === 'saida' && !lead?.primeira_resposta_em) {
      mudanca.primeira_resposta_em = salva.criado_em;
    }
    await local.atualizarLead(salva.lead_id, mudanca);
    return salva;
  }

  const sb = await cliente();
  const atual = await sessao();
  const registro = { ...interacao, corretor_id: atual.id };
  const { data, error } = await sb.from('lead_interacoes')
    .insert(registro).select('*').single();
  if (error) throw new Error(error.message);

  const mudanca = { ultimo_contato: data.criado_em };
  if (data.direcao === 'saida') {
    const { data: lead } = await sb.from('leads')
      .select('primeira_resposta_em').eq('id', data.lead_id).single();
    if (!lead?.primeira_resposta_em) mudanca.primeira_resposta_em = data.criado_em;
  }
  await sb.from('leads').update(mudanca).eq('id', data.lead_id);
  return data;
}

export async function marcarInteracoesLidas(leadId) {
  if (!naNuvem) return local.marcarInteracoesLidas(leadId);
  const sb = await cliente();
  const { error } = await sb.from('lead_interacoes')
    .update({ lida_em: new Date().toISOString() })
    .eq('lead_id', leadId).eq('direcao', 'entrada').is('lida_em', null);
  if (error) throw new Error(error.message);
}

export async function salvarVisita(visita) {
  if (!naNuvem) {
    const salva = await local.salvarVisita(visita);
    await local.atualizarLead(visita.lead_id, { status: 'visita_agendada' });
    return salva;
  }
  const sb = await cliente();
  const atual = await sessao();
  const { data, error } = await sb.from('visitas')
    .insert({ ...visita, corretor_id: atual.id }).select('*').single();
  if (error) throw new Error(error.message);
  const { error: erroLead } = await sb.from('leads')
    .update({ status: 'visita_agendada' }).eq('id', visita.lead_id);
  if (erroLead) throw new Error(erroLead.message);
  return data;
}

export async function salvarConfiguracaoIA(dados) {
  if (!naNuvem) return local.salvarConfiguracaoIA(dados);
  const sb = await cliente();
  const atual = await sessao();
  const { data, error } = await sb.from('configuracoes_ia')
    .upsert({ ...dados, id: 'principal', atualizado_por: atual.id })
    .select('*').single();
  if (error) throw new Error(error.message);
  return data;
}

export async function sugerirResposta(leadId, instrucao = '') {
  if (!naNuvem) {
    throw new Error('A sugestão da IA só fica disponível no painel conectado à nuvem.');
  }
  const url = String(CONFIG.automacao?.backendUrl ?? '').replace(/\/$/, '');
  if (!url) throw new Error('O endereço do backend da IA ainda não foi configurado.');

  const sb = await cliente();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sua sessão expirou. Entre no painel novamente.');

  const resposta = await fetch(`${url}/crm/sugerir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ lead_id: leadId, instrucao }),
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(corpo.error ?? 'A IA não conseguiu preparar a resposta.');
  return corpo.sugestao;
}

/* ============================================================ utilidades == */

function extensaoDe(mime) {
  const mapa = {
    'video/mp4': 'mp4', 'video/quicktime': 'mov',
    'video/webm': 'webm', 'video/x-matroska': 'mkv',
  };
  return mapa[mime] ?? 'mp4';
}
