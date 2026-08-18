// ============================================================================
// Carteira local (IndexedDB)
// ----------------------------------------------------------------------------
// O painel do corretor precisa funcionar HOJE, sem conta, sem senha e sem
// internet. Este arquivo é esse "servidor": um banco dentro do próprio
// navegador, onde ficam os imóveis, as fotos, os vídeos e os contatos
// recebidos.
//
// Por que IndexedDB e não localStorage: localStorage guarda só texto e estoura
// em ~5 MB. Uma foto tratada tem 200 KB e um vídeo tem dezenas de MB — só cabe
// aqui, que guarda Blob nativo e trabalha na casa dos GB.
//
// ⚠️ O QUE ISTO NÃO É: publicação. O que está aqui vive NESTE navegador, nesta
// máquina. Quem abrir o site publicado não enxerga nada disto. Para o catálogo
// ir ao ar de verdade existe o Supabase (RETOMAR.md §3) — e existe o
// exportar/importar aqui embaixo pra levar a carteira inteira de um navegador
// pro outro sem perder nada.
// ============================================================================

const BANCO = 'ah-imobiliaria';
const VERSAO = 2;

export const LOJAS = {
  imoveis: 'imoveis',
  midias: 'midias',
  leads: 'leads',
  interacoes: 'lead_interacoes',
  visitas: 'visitas',
  configuracaoIA: 'configuracao_ia',
  meta: 'meta',
};

let _db = null;

/** Conexão única, aberta sob demanda. */
function abrir() {
  if (_db) return Promise.resolve(_db);

  return new Promise((ok, falha) => {
    const req = indexedDB.open(BANCO, VERSAO);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(LOJAS.imoveis)) {
        const loja = db.createObjectStore(LOJAS.imoveis, { keyPath: 'id' });
        loja.createIndex('codigo', 'codigo', { unique: true });
        loja.createIndex('atualizado_em', 'atualizado_em');
      }
      if (!db.objectStoreNames.contains(LOJAS.midias)) {
        const loja = db.createObjectStore(LOJAS.midias, { keyPath: 'id' });
        // Sem este índice, listar as fotos de um imóvel viraria varredura da
        // tabela inteira a cada cartão desenhado.
        loja.createIndex('imovel_id', 'imovel_id');
      }
      if (!db.objectStoreNames.contains(LOJAS.leads)) {
        db.createObjectStore(LOJAS.leads, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(LOJAS.interacoes)) {
        const loja = db.createObjectStore(LOJAS.interacoes, { keyPath: 'id' });
        loja.createIndex('lead_id', 'lead_id');
        loja.createIndex('criado_em', 'criado_em');
      }
      if (!db.objectStoreNames.contains(LOJAS.visitas)) {
        const loja = db.createObjectStore(LOJAS.visitas, { keyPath: 'id' });
        loja.createIndex('lead_id', 'lead_id');
        loja.createIndex('quando', 'quando');
      }
      if (!db.objectStoreNames.contains(LOJAS.configuracaoIA)) {
        db.createObjectStore(LOJAS.configuracaoIA, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(LOJAS.meta)) {
        db.createObjectStore(LOJAS.meta, { keyPath: 'chave' });
      }
    };

    req.onsuccess = () => { _db = req.result; ok(_db); };
    req.onerror = () => falha(new Error(
      'Não consegui abrir o banco local do navegador. Se você estiver numa aba ' +
      'anônima ou com cookies bloqueados para este site, o painel não tem onde gravar.'
    ));
  });
}

/** Envolve uma transação numa Promise. `modo` é 'readonly' ou 'readwrite'. */
async function transacao(lojas, modo, tarefa) {
  const db = await abrir();
  const nomes = Array.isArray(lojas) ? lojas : [lojas];

  return new Promise((ok, falha) => {
    const tx = db.transaction(nomes, modo);
    let resultado;
    // Só resolve no complete, nunca no retorno da tarefa: a escrita só está
    // garantida quando a transação fecha. Resolver antes faz o painel dizer
    // "salvo" e o dado sumir no F5.
    tx.oncomplete = () => ok(resultado);
    tx.onerror = () => falha(tx.error ?? new Error('A gravação local falhou.'));
    tx.onabort = () => falha(tx.error ?? new Error('A gravação local foi cancelada.'));

    Promise.resolve(tarefa(...nomes.map((n) => tx.objectStore(n))))
      .then((v) => { resultado = v; })
      .catch((e) => { falha(e); try { tx.abort(); } catch { /* já morreu */ } });
  });
}

const pedir = (req) => new Promise((ok, falha) => {
  req.onsuccess = () => ok(req.result);
  req.onerror = () => falha(req.error);
});

/* ============================================================== imóveis == */

export async function listarImoveis() {
  const itens = await transacao(LOJAS.imoveis, 'readonly', (loja) => pedir(loja.getAll()));
  return itens.sort((a, b) =>
    String(b.atualizado_em ?? '').localeCompare(String(a.atualizado_em ?? '')));
}

export async function contarImoveis() {
  return transacao(LOJAS.imoveis, 'readonly', (loja) => pedir(loja.count()));
}

export async function obterImovel(id) {
  return transacao(LOJAS.imoveis, 'readonly', (loja) => pedir(loja.get(id)));
}

export async function obterImovelPorCodigo(codigo) {
  return transacao(LOJAS.imoveis, 'readonly', (loja) =>
    pedir(loja.index('codigo').get(Number(codigo))));
}

/**
 * Grava um imóvel. Sem id, cria — e é aqui que o código do anúncio nasce.
 * @returns {Promise<object>} o registro como ficou gravado
 */
export async function salvarImovel(dados) {
  const agora = new Date().toISOString();

  return transacao(LOJAS.imoveis, 'readwrite', async (loja) => {
    let registro;

    if (dados.id) {
      const antigo = await pedir(loja.get(dados.id));
      if (!antigo) throw new Error('Esse imóvel não existe mais na carteira local.');
      registro = { ...antigo, ...dados, atualizado_em: agora };
    } else {
      registro = {
        ...dados,
        id: crypto.randomUUID(),
        codigo: await proximoCodigo(loja),
        criado_em: agora,
        atualizado_em: agora,
      };
    }

    await pedir(loja.put(registro));
    return registro;
  });
}

/**
 * O próximo código do anúncio. Começa em 101 porque "imóvel 1" parece carteira
 * vazia na conversa com o cliente, e o código é justamente o que ele cita no
 * WhatsApp. Roda dentro da MESMA transação da escrita, senão dois cadastros
 * seguidos podem pegar o mesmo número.
 */
async function proximoCodigo(loja) {
  const cursor = await pedir(loja.index('codigo').openCursor(null, 'prev'));
  return cursor ? Number(cursor.value.codigo) + 1 : 101;
}

/** Apaga o imóvel e, junto, todas as mídias dele. */
export async function excluirImovel(id) {
  return transacao([LOJAS.imoveis, LOJAS.midias], 'readwrite', async (imoveis, midias) => {
    await pedir(imoveis.delete(id));
    const chaves = await pedir(midias.index('imovel_id').getAllKeys(id));
    for (const chave of chaves) await pedir(midias.delete(chave));
  });
}

/* =============================================================== mídias == */

export async function midiasDe(imovelId) {
  const itens = await transacao(LOJAS.midias, 'readonly', (loja) =>
    pedir(loja.index('imovel_id').getAll(imovelId)));
  return itens.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

/**
 * Reescreve TODAS as mídias de um imóvel de uma vez. É mais simples e mais
 * seguro que diferenciar item a item: a ordem das fotos é do jeito que ficou
 * na tela, e o que sumiu da tela some do banco.
 * @param {Array} lista itens {tipo, blob?, url?, mime?, legenda?}
 */
export async function regravarMidias(imovelId, lista) {
  return transacao(LOJAS.midias, 'readwrite', async (loja) => {
    const antigas = await pedir(loja.index('imovel_id').getAllKeys(imovelId));
    for (const chave of antigas) await pedir(loja.delete(chave));

    for (const [ordem, item] of lista.entries()) {
      await pedir(loja.put({
        id: item.id ?? crypto.randomUUID(),
        imovel_id: imovelId,
        tipo: item.tipo,          // 'foto' | 'video' | 'video-link'
        blob: item.blob ?? null,  // só em foto e video
        url: item.url ?? null,    // só em video-link
        mime: item.mime ?? null,
        legenda: item.legenda ?? null,
        ordem,
      }));
    }
  });
}

/* ---- endereços de blob ----------------------------------------------------
   createObjectURL cria um endereço novo a cada chamada e ele só morre no
   revoke ou no fim da aba. Como o catálogo redesenha os cartões a cada filtro,
   sem este cache a mesma foto viraria dezenas de endereços vivos. */

const _enderecos = new Map();

export function enderecoDe(midia) {
  if (!midia) return null;
  if (midia.url) return midia.url;              // link externo, nada a criar
  if (!midia.blob) return null;
  if (_enderecos.has(midia.id)) return _enderecos.get(midia.id);

  const endereco = URL.createObjectURL(midia.blob);
  _enderecos.set(midia.id, endereco);
  return endereco;
}

/** Solta os endereços de mídias que não existem mais. */
export function esquecerEnderecos(ids = null) {
  for (const [id, endereco] of _enderecos) {
    if (ids && !ids.includes(id)) continue;
    URL.revokeObjectURL(endereco);
    _enderecos.delete(id);
  }
}

/* ================================================================ leads == */

export async function salvarLead(lead) {
  const agora = new Date().toISOString();
  const registro = {
    finalidade: null,
    tipo: null,
    bairros: [],
    preco_min: null,
    preco_max: null,
    quartos_min: null,
    prazo: null,
    financiamento: null,
    resumo: null,
    imovel_id: null,
    proximo_contato: null,
    ultimo_contato: null,
    canal_id: null,
    ia_ativa: true,
    prioridade: 1,
    valor_potencial: null,
    tags: [],
    motivo_perda: null,
    ...lead,
    id: lead.id ?? crypto.randomUUID(),
    status: lead.status ?? 'novo',
    criado_em: lead.criado_em ?? agora,
    atualizado_em: agora,
  };
  await transacao(LOJAS.leads, 'readwrite', (loja) => pedir(loja.put(registro)));
  return registro;
}

export async function atualizarLead(id, dados) {
  return transacao(LOJAS.leads, 'readwrite', async (loja) => {
    const atual = await pedir(loja.get(id));
    if (!atual) throw new Error('Esse lead não existe mais.');
    const registro = {
      ...atual,
      ...dados,
      id,
      atualizado_em: new Date().toISOString(),
    };
    await pedir(loja.put(registro));
    return registro;
  });
}

export async function listarLeads() {
  const itens = await transacao(LOJAS.leads, 'readonly', (loja) => pedir(loja.getAll()));
  return itens.sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
}

export async function obterLead(id) {
  return transacao(LOJAS.leads, 'readonly', (loja) => pedir(loja.get(id)));
}

export async function excluirLead(id) {
  return transacao(
    [LOJAS.leads, LOJAS.interacoes, LOJAS.visitas],
    'readwrite',
    async (leads, interacoes, visitas) => {
      await pedir(leads.delete(id));
      for (const chave of await pedir(interacoes.index('lead_id').getAllKeys(id))) {
        await pedir(interacoes.delete(chave));
      }
      for (const chave of await pedir(visitas.index('lead_id').getAllKeys(id))) {
        await pedir(visitas.delete(chave));
      }
    },
  );
}

export async function salvarInteracao(interacao) {
  const registro = {
    tipo: 'mensagem',
    direcao: 'interna',
    autor: 'sistema',
    canal: 'painel',
    automatico: false,
    metadados: {},
    ...interacao,
    id: interacao.id ?? crypto.randomUUID(),
    criado_em: interacao.criado_em ?? new Date().toISOString(),
  };
  await transacao(LOJAS.interacoes, 'readwrite', (loja) => pedir(loja.put(registro)));
  return registro;
}

export async function listarInteracoes() {
  const itens = await transacao(
    LOJAS.interacoes, 'readonly', (loja) => pedir(loja.getAll()),
  );
  return itens.sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
}

export async function marcarInteracoesLidas(leadId) {
  const agora = new Date().toISOString();
  return transacao(LOJAS.interacoes, 'readwrite', async (loja) => {
    const itens = await pedir(loja.index('lead_id').getAll(leadId));
    for (const item of itens) {
      if (item.direcao === 'entrada' && !item.lida_em) {
        await pedir(loja.put({ ...item, lida_em: agora }));
      }
    }
  });
}

export async function salvarVisita(visita) {
  const registro = {
    status: 'agendada',
    ...visita,
    id: visita.id ?? crypto.randomUUID(),
    criado_em: visita.criado_em ?? new Date().toISOString(),
  };
  await transacao(LOJAS.visitas, 'readwrite', (loja) => pedir(loja.put(registro)));
  return registro;
}

export async function listarVisitas() {
  const itens = await transacao(LOJAS.visitas, 'readonly', (loja) => pedir(loja.getAll()));
  return itens.sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
}

export async function obterConfiguracaoIA() {
  const salvo = await transacao(
    LOJAS.configuracaoIA, 'readonly', (loja) => pedir(loja.get('principal')),
  );
  return salvo ?? {
    id: 'principal',
    modo: 'automatico',
    agente: 'ah_imobiliaria',
    canais: ['whatsapp', 'instagram'],
    mensagem_pausa: 'Recebi sua mensagem. O corretor vai continuar o atendimento por aqui.',
  };
}

export async function salvarConfiguracaoIA(dados) {
  const registro = {
    ...(await obterConfiguracaoIA()),
    ...dados,
    id: 'principal',
    atualizado_em: new Date().toISOString(),
  };
  await transacao(
    LOJAS.configuracaoIA, 'readwrite', (loja) => pedir(loja.put(registro)),
  );
  return registro;
}

/* ====================================================== exportar/importar == */

/* O backup é um JSON único, com as fotos e os vídeos embutidos em base64.
   Fica grande — é o preço de caber num arquivo só que o dono consegue mandar
   por WhatsApp, guardar no Drive e abrir em outro computador sem instalar
   nada. Quem quiser leveza usa o Supabase. */

const paraBase64 = (blob) => new Promise((ok, falha) => {
  const leitor = new FileReader();
  leitor.onload = () => ok(leitor.result);
  leitor.onerror = () => falha(new Error('Não consegui ler um dos arquivos para o backup.'));
  leitor.readAsDataURL(blob);
});

async function deBase64(texto) {
  const resposta = await fetch(texto);
  return resposta.blob();
}

export async function exportar() {
  const [imoveis, leads, interacoes, visitas, configuracao_ia] = await Promise.all([
    listarImoveis(), listarLeads(), listarInteracoes(), listarVisitas(), obterConfiguracaoIA(),
  ]);
  const midias = await transacao(LOJAS.midias, 'readonly', (loja) => pedir(loja.getAll()));

  const midiasSerializadas = [];
  for (const m of midias) {
    midiasSerializadas.push({
      ...m,
      blob: m.blob ? await paraBase64(m.blob) : null,
    });
  }

  return {
    formato: 'ah-imobiliaria/carteira',
    versao: 2,
    exportado_em: new Date().toISOString(),
    imoveis,
    midias: midiasSerializadas,
    leads,
    interacoes,
    visitas,
    configuracao_ia,
  };
}

/**
 * Lê um backup. `substituir` apaga a carteira atual antes; sem ele, o que vier
 * é somado ao que já existe.
 */
export async function importar(pacote, { substituir = false } = {}) {
  if (pacote?.formato !== 'ah-imobiliaria/carteira') {
    throw new Error('Este arquivo não é um backup da carteira. Escolha o .json que você exportou daqui.');
  }

  const midias = [];
  for (const m of pacote.midias ?? []) {
    midias.push({ ...m, blob: m.blob ? await deBase64(m.blob) : null });
  }

  // A conversão de base64 fica FORA da transação de propósito: fetch() é
  // assíncrono de verdade e uma transação do IndexedDB fecha sozinha assim que
  // a fila dela esvazia, mesmo com o await ainda pendurado.
  await transacao([
    LOJAS.imoveis, LOJAS.midias, LOJAS.leads, LOJAS.interacoes,
    LOJAS.visitas, LOJAS.configuracaoIA,
  ], 'readwrite',
  async (lojaImoveis, lojaMidias, lojaLeads, lojaInteracoes, lojaVisitas, lojaConfig) => {
      if (substituir) {
        await pedir(lojaImoveis.clear());
        await pedir(lojaMidias.clear());
        await pedir(lojaLeads.clear());
        await pedir(lojaInteracoes.clear());
        await pedir(lojaVisitas.clear());
        await pedir(lojaConfig.clear());
      }
      for (const i of pacote.imoveis ?? []) await pedir(lojaImoveis.put(i));
      for (const m of midias) await pedir(lojaMidias.put(m));
      for (const l of pacote.leads ?? []) await pedir(lojaLeads.put(l));
      for (const i of pacote.interacoes ?? []) await pedir(lojaInteracoes.put(i));
      for (const v of pacote.visitas ?? []) await pedir(lojaVisitas.put(v));
      if (pacote.configuracao_ia) await pedir(lojaConfig.put(pacote.configuracao_ia));
    });

  esquecerEnderecos();
  return {
    imoveis: (pacote.imoveis ?? []).length,
    midias: midias.length,
    leads: (pacote.leads ?? []).length,
  };
}

/** Quanto a carteira local está ocupando, quando o navegador conta. */
export async function espacoUsado() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usado: usage ?? 0, teto: quota ?? 0 };
}
