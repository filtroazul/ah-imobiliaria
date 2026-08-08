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

import { configurado } from './config.js';
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

export async function leads() {
  if (!naNuvem) return local.listarLeads();

  const sb = await cliente();
  const { data, error } = await sb.from('leads')
    .select('id, nome, telefone, mensagem, origem, status, criado_em, proximo_contato')
    .order('criado_em', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data;
}

/* ============================================================ utilidades == */

function extensaoDe(mime) {
  const mapa = {
    'video/mp4': 'mp4', 'video/quicktime': 'mov',
    'video/webm': 'webm', 'video/x-matroska': 'mkv',
  };
  return mapa[mime] ?? 'mp4';
}
