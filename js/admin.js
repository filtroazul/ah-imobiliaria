// ============================================================================
// Painel do corretor
// ----------------------------------------------------------------------------
// Cadastra, edita e publica imóveis, com fotos e vídeos.
//
// Onde isso é gravado não é decisão deste arquivo: quem sabe disso é js/repo.js.
// Aqui só existe tela. Os dois modos possíveis aparecem em exatamente três
// lugares abaixo — o recado do topo, a existência do login e a aba de backup —
// e em nenhum outro.
// ============================================================================

import { CONFIG } from './config.js';
import { moeda, TIPOS } from './dados.js';
import * as repo from './repo.js';
import * as local from './local.js';
import { escapar, lerNumero, lerLinkDeVideo } from './ui.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let usuario = null;
let mapa = null;
let pino = null;

/**
 * O imóvel aberto no formulário.
 *   fotos/videos  a lista como está na tela, já na ordem final
 *   removidas     mídias que JÁ estavam gravadas e o corretor tirou. Guardadas
 *                 até salvar, porque é só no salvar que o arquivo é apagado do
 *                 armazenamento — desistir da edição não pode apagar nada.
 */
let edicao = { id: null, fotos: [], videos: [], removidas: [] };

/* ---- limites de arquivo ----
   Vídeo é o único item capaz de estourar o plano gratuito sozinho. No modo
   local o teto é a folga do próprio navegador; na nuvem ele é apertado de
   propósito, porque 1 GB dividido por vídeos de 200 MB são cinco imóveis. */
const TETO_VIDEO = repo.naNuvem ? 50 * 1024 ** 2 : 200 * 1024 ** 2;

// Arredondar tudo pra MB fazia um vídeo de 53 KB aparecer como "0 MB".
const tamanhoLegivel = (bytes) => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

/* ============================================================ utilidades == */

function recado(el, texto, tipo = 'ok') {
  el.className = `recado recado--${tipo}`;
  el.innerHTML = texto;
  el.hidden = false;
}

function mostrar(qual) {
  $('#login').hidden = qual !== 'login';
  $('#painel').hidden = qual !== 'painel';
  $('#forma').hidden = qual !== 'forma';
  $('#sair').hidden = !repo.naNuvem || !usuario;
  // O recado de "salvo como rascunho" é de UMA troca de tela. Quem salva chama
  // mostrar('painel') e SÓ DEPOIS escreve o recado, então limpar aqui não o
  // apaga — só impede que ele fique pendurado na navegação seguinte.
  const aviso = $('#painel-recado');
  if (aviso) aviso.hidden = true;
  window.scrollTo({ top: 0 });
}

/**
 * Reduz e converte a imagem no navegador, antes de gravar.
 * Sem isso, doze fotos de celular são 60 MB — e isso derruba tanto o 1 GB do
 * plano free quanto a paciência de quem espera o upload.
 */
async function comprimir(arquivo, { ladoMax = 1600, qualidade = 0.82 } = {}) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(arquivo);
  } catch {
    throw new Error(
      `Não consegui ler "${arquivo.name}". Se for HEIC do iPhone, mude a câmera ` +
      'para "Mais compatível" ou exporte como JPEG.'
    );
  }

  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const ctx = tela.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close?.();

  const blob = await new Promise((r) => tela.toBlob(r, 'image/webp', qualidade));
  if (!blob) throw new Error(`Não consegui converter "${arquivo.name}".`);
  return blob;
}

/* ================================================================= auth == */

async function entrar(e) {
  e.preventDefault();
  const erro = $('#login-erro');
  const botao = $('#login-botao');
  erro.hidden = true;
  botao.disabled = true;
  botao.textContent = 'Entrando';

  try {
    usuario = await repo.entrar($('#login-email').value.trim(), $('#login-senha').value);
    await abrirPainel();
  } catch (falha) {
    recado(erro, escapar(falha.message), 'erro');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Entrar';
  }
}

async function sair() {
  await repo.sair();
  usuario = null;
  mostrar('login');
}

/* ============================================================== imóveis == */

const PILULA = {
  rascunho: 'Rascunho', disponivel: 'Disponível', reservado: 'Reservado',
  vendido: 'Vendido', alugado: 'Alugado',
};

async function abrirPainel() {
  mostrar('painel');
  $('#quem').textContent = repo.naNuvem
    ? `Conectado como ${usuario.email}`
    : 'Carteira gravada neste navegador';
  await Promise.all([carregarLista(), carregarLeads(), mostrarEspaco()]);
}

async function carregarLista() {
  const alvo = $('#lista');
  alvo.innerHTML = '<div class="esqueleto" style="height:5rem"></div>'.repeat(3);

  let itens;
  try {
    itens = await repo.listar();
  } catch (erro) {
    alvo.innerHTML = `<div class="recado recado--erro">Não consegui listar: ${escapar(erro.message)}</div>`;
    return;
  }

  if (!itens.length) {
    alvo.innerHTML = `
      <div class="aviso">
        <p class="aviso__titulo">Nenhum imóvel cadastrado ainda</p>
        <p>Clique em "Cadastrar imóvel" para colocar o primeiro no ar.</p>
      </div>`;
    return;
  }

  alvo.innerHTML = itens.map((im) => `
<div class="linha">
  ${im.capa
    ? `<img class="linha__foto" src="${escapar(im.capa)}" alt="" loading="lazy">`
    : '<div class="linha__foto"></div>'}
  <div>
    <div class="linha__titulo">${escapar(im.titulo)}</div>
    <div class="linha__meta">
      Cód. ${escapar(im.codigo)} · ${escapar(TIPOS[im.tipo] ?? im.tipo)} em ${escapar(im.bairro)}
      · ${moeda(im.preco)}${im.finalidade === 'aluguel' ? '/mês' : ''}
      ${im.destaque ? ' · em destaque' : ''}
      ${im.n_fotos ? ` · ${im.n_fotos} foto${im.n_fotos > 1 ? 's' : ''}` : ' · sem foto'}
      ${im.n_videos ? ` · ${im.n_videos} vídeo${im.n_videos > 1 ? 's' : ''}` : ''}
    </div>
  </div>
  <div class="linha__estado">
    <span class="pilula pilula--${escapar(im.status)}">${PILULA[im.status] ?? escapar(im.status)}</span>
  </div>
  <div class="linha__acoes">
    <button class="btn-mini" data-editar="${escapar(im.id)}">Editar</button>
    <a class="btn-mini" href="imovel.html?cod=${encodeURIComponent(im.codigo)}"
       target="_blank" rel="noopener">Ver</a>
  </div>
</div>`).join('');

  $$('[data-editar]', alvo).forEach((b) =>
    b.addEventListener('click', () => abrirFormulario(b.dataset.editar)));
}

/* ================================================================ leads == */

async function carregarLeads() {
  const alvo = $('#lista-leads');

  let itens;
  try {
    itens = await repo.leads();
  } catch (erro) {
    alvo.innerHTML = `<div class="recado recado--erro">${escapar(erro.message)}</div>`;
    return;
  }

  if (!itens.length) {
    alvo.innerHTML = `
      <div class="aviso">
        <p class="aviso__titulo">Nenhum contato recebido ainda</p>
        <p>Quem preencher o formulário do site aparece aqui.</p>
      </div>`;
    return;
  }

  const hoje = new Date().toISOString().slice(0, 10);

  alvo.innerHTML = itens.map((l) => {
    const atrasado = l.proximo_contato && l.proximo_contato <= hoje
      && !['fechado', 'perdido'].includes(l.status);
    const zap = `https://wa.me/${String(l.telefone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(
      `Olá ${l.nome ?? ''}! Aqui é da Ah Imobiliária, sobre o contato que você deixou no site.`
    )}`;
    return `
<div class="linha">
  <div class="linha__foto" style="display:grid;place-items:center">
    <i class="ph ph-user" aria-hidden="true"></i>
  </div>
  <div>
    <div class="linha__titulo">${escapar(l.nome ?? 'Sem nome')}</div>
    <div class="linha__meta">
      ${escapar(l.telefone ?? '')} · ${escapar(l.origem)} ·
      ${new Date(l.criado_em).toLocaleDateString('pt-BR')}
      ${l.mensagem ? `<br>${escapar(l.mensagem.slice(0, 140))}` : ''}
    </div>
  </div>
  <div class="linha__estado">
    <span class="pilula${atrasado ? ' pilula--vendido' : ''}">
      ${atrasado ? 'Retornar hoje' : escapar(l.status)}
    </span>
  </div>
  <div class="linha__acoes">
    <a class="btn-mini" href="${escapar(zap)}" target="_blank" rel="noopener">Chamar no zap</a>
  </div>
</div>`;
  }).join('');
}

/* =========================================================== formulário == */

const CAMPOS_TEXTO = ['titulo', 'descricao', 'cep', 'logradouro', 'numero',
  'complemento', 'bairro', 'cidade', 'uf'];
const CAMPOS_NUM = ['quartos', 'suites', 'banheiros', 'vagas', 'area_util', 'area_total'];
const CAMPOS_DINHEIRO = ['preco', 'condominio', 'iptu'];

const idDe = (campo) => `#i-${campo.replaceAll('_', '-')}`;

async function abrirFormulario(id = null) {
  edicao = { id, fotos: [], videos: [], removidas: [] };
  $('#forma').reset();
  $('#forma-recado').hidden = true;
  $('#forma-titulo').textContent = id ? 'Editar imóvel' : 'Cadastrar imóvel';
  $('#excluir').hidden = !id;
  desenharFotos();
  desenharVideos();
  mostrar('forma');

  if (!id) { prepararMapa(null, null); return; }

  let dados;
  try {
    dados = await repo.obter(id);
  } catch (erro) {
    recado($('#forma-recado'), `Não consegui abrir: ${escapar(erro.message)}`, 'erro');
    return;
  }

  for (const c of [...CAMPOS_TEXTO, ...CAMPOS_NUM]) {
    const el = $(idDe(c));
    if (el) el.value = dados[c] ?? '';
  }
  for (const c of CAMPOS_DINHEIRO) {
    const el = $(idDe(c));
    if (el) el.value = dados[c] != null ? Number(dados[c]).toLocaleString('pt-BR') : '';
  }
  $('#i-finalidade').value = dados.finalidade;
  $('#i-tipo').value = dados.tipo;
  $('#i-status').value = dados.status;
  $('#i-destaque').checked = dados.destaque;
  $('#i-mostrar-endereco').checked = dados.mostrar_endereco;
  $('#i-comodidades').value = (dados.comodidades ?? []).join(', ');

  edicao.fotos = dados.midias.filter((m) => m.tipo === 'foto');
  edicao.videos = dados.midias.filter((m) => m.tipo !== 'foto');

  desenharFotos();
  desenharVideos();
  prepararMapa(dados.lat, dados.lng);
}

function coletar() {
  const alvo = {
    titulo: $('#i-titulo').value.trim(),
    finalidade: $('#i-finalidade').value,
    tipo: $('#i-tipo').value,
    preco: lerNumero($('#i-preco').value),
    condominio: lerNumero($('#i-condominio').value),
    iptu: lerNumero($('#i-iptu').value),
    descricao: $('#i-descricao').value.trim() || null,
    comodidades: $('#i-comodidades').value
      .split(',').map((s) => s.trim()).filter(Boolean),
    status: $('#i-status').value,
    destaque: $('#i-destaque').checked,
    mostrar_endereco: $('#i-mostrar-endereco').checked,
    bairro: $('#i-bairro').value.trim(),
    cidade: $('#i-cidade').value.trim(),
    uf: ($('#i-uf').value.trim() || 'CE').toUpperCase().slice(0, 2),
  };

  for (const c of CAMPOS_NUM) {
    const v = $(idDe(c)).value;
    alvo[c] = v === '' ? (c.startsWith('area') ? null : 0) : Number(v);
  }
  for (const c of ['cep', 'logradouro', 'numero', 'complemento']) {
    alvo[c] = $(idDe(c)).value.trim() || null;
  }

  if (pino) {
    const { lat, lng } = pino.getLatLng();
    alvo.lat = lat;
    alvo.lng = lng;
  }

  return alvo;
}

async function salvar(e) {
  e.preventDefault();
  const aviso = $('#forma-recado');
  const botao = $('#salvar');
  aviso.hidden = true;

  const dados = coletar();

  if (!dados.titulo) return recado(aviso, 'O título é obrigatório.', 'erro');
  if (!dados.preco) return recado(aviso, 'Informe o valor do imóvel.', 'erro');
  if (!dados.bairro || !dados.cidade) return recado(aviso, 'Bairro e cidade são obrigatórios.', 'erro');

  botao.disabled = true;
  botao.textContent = 'Salvando';

  try {
    const imovel = await repo.salvar({
      id: edicao.id,
      dados,
      midias: [
        ...edicao.fotos.map((m) => ({ ...m, tipo: 'foto' })),
        ...edicao.videos,
        ...edicao.removidas.map((m) => ({ ...m, removida: true })),
      ],
      aoAndar: (feito, total, rotulo) => {
        botao.textContent = `Enviando ${rotulo} (${feito}/${total})`;
      },
    });

    edicao.id = imovel.id;
    edicao.removidas = [];
    await carregarLista();
    await mostrarEspaco();
    mostrar('painel');

    // Salvar em silêncio confundiu no primeiro cadastro real: o padrão da
    // Situação é RASCUNHO, o imóvel não aparece no site, e nada dizia isso.
    // Quem cadastra tem que sair daqui sabendo se publicou ou não.
    const salvoComo = imovel.status || dados.status;
    if (salvoComo === 'rascunho') {
      recado(
        $('#painel-recado'),
        '<strong>Salvo como rascunho — ainda NÃO aparece no site.</strong> ' +
          'Para publicar: <em>Editar</em> → seção <em>Publicação</em> → ' +
          'Situação <em>Disponível</em> → Salvar.',
        'aviso',
      );
    } else {
      recado(
        $('#painel-recado'),
        `<strong>Publicado.</strong> Já está no ar como <em>${escapar(PILULA[salvoComo] || salvoComo)}</em>.`,
      );
    }
  } catch (erro) {
    recado(aviso, `Não consegui salvar: ${escapar(erro.message)}`, 'erro');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar imóvel';
  }
}

async function excluir() {
  if (!edicao.id) return;
  if (!confirm('Excluir este imóvel e todas as fotos e vídeos dele? Isso não tem volta.')) return;

  try {
    await repo.excluir(edicao.id, [...edicao.fotos, ...edicao.videos, ...edicao.removidas]);
  } catch (erro) {
    return recado($('#forma-recado'), escapar(erro.message), 'erro');
  }

  await carregarLista();
  await mostrarEspaco();
  mostrar('painel');
}

/* ================================================================ fotos == */

/** Tira a mídia da tela. Se ela já estava gravada, fica na fila de remoção. */
function descartar(lista, chave) {
  const i = lista.findIndex((m) => String(m.chave) === String(chave));
  if (i < 0) return;
  const [saiu] = lista.splice(i, 1);
  if (saiu.existente) edicao.removidas.push(saiu);
}

function desenharFotos() {
  const alvo = $('#fotos');
  $('#fotos-dica').hidden = edicao.fotos.length < 2;

  alvo.innerHTML = edicao.fotos.map((f, i) => `
<div class="foto-item">
  <img src="${escapar(f.url)}" alt="Foto ${i + 1} do imóvel">
  ${i === 0 ? '<span class="foto-item__capa">Capa</span>' : ''}
  <div class="foto-item__ordem">
    <button type="button" data-mover="${escapar(f.chave)}" data-passo="-1"
            ${i === 0 ? 'disabled' : ''} aria-label="Mover a foto ${i + 1} para trás">
      <i class="ph ph-caret-left" aria-hidden="true"></i>
    </button>
    <button type="button" data-mover="${escapar(f.chave)}" data-passo="1"
            ${i === edicao.fotos.length - 1 ? 'disabled' : ''}
            aria-label="Mover a foto ${i + 1} para frente">
      <i class="ph ph-caret-right" aria-hidden="true"></i>
    </button>
  </div>
  <button class="foto-item__x" type="button" data-remover="${escapar(f.chave)}"
          aria-label="Remover a foto ${i + 1}">
    <i class="ph ph-x" aria-hidden="true"></i>
  </button>
</div>`).join('');

  $$('[data-remover]', alvo).forEach((b) => b.addEventListener('click', () => {
    descartar(edicao.fotos, b.dataset.remover);
    desenharFotos();
  }));

  $$('[data-mover]', alvo).forEach((b) => b.addEventListener('click', () => {
    const de = edicao.fotos.findIndex((f) => String(f.chave) === b.dataset.mover);
    const para = de + Number(b.dataset.passo);
    if (de < 0 || para < 0 || para >= edicao.fotos.length) return;
    [edicao.fotos[de], edicao.fotos[para]] = [edicao.fotos[para], edicao.fotos[de]];
    desenharFotos();
  }));
}

async function receberFotos(lista) {
  const arquivos = [...lista].filter((f) => f.type.startsWith('image/'));
  if (!arquivos.length) return;

  const barra = $('#progresso');
  const traco = barra.querySelector('span');
  barra.hidden = false;
  traco.style.width = '0%';

  let feitos = 0;
  for (const arquivo of arquivos) {
    try {
      const blob = await comprimir(arquivo);
      edicao.fotos.push({
        chave: crypto.randomUUID(),
        tipo: 'foto',
        blob,
        mime: 'image/webp',
        url: URL.createObjectURL(blob),
        existente: false,
      });
    } catch (erro) {
      recado($('#forma-recado'), escapar(erro.message), 'erro');
    }
    traco.style.width = `${Math.round((++feitos / arquivos.length) * 100)}%`;
    desenharFotos();
  }

  setTimeout(() => { barra.hidden = true; }, 600);
}

/* =============================================================== vídeos == */

function desenharVideos() {
  const alvo = $('#videos');

  alvo.innerHTML = edicao.videos.map((v) => {
    const link = v.tipo === 'video-link' ? lerLinkDeVideo(v.url) : null;

    const miolo = link
      ? (link.capa
        ? `<img src="${escapar(link.capa)}" alt="">`
        : `<div class="video-item__marca"><i class="ph ph-link-simple" aria-hidden="true"></i></div>`)
      // preload=metadata: mostra o primeiro quadro sem baixar o vídeo inteiro.
      : `<video src="${escapar(v.url)}" preload="metadata" muted playsinline></video>`;

    const etiqueta = link
      ? ({
        youtube: 'YouTube', vimeo: 'Vimeo', instagram: 'Instagram',
        drive: 'Google Drive', arquivo: 'Link direto', outro: 'Link',
        invalido: 'Link inválido',
      })[link.plataforma]
      : `Arquivo${v.tamanho ? ` · ${tamanhoLegivel(v.tamanho)}` : ''}`;

    return `
<div class="video-item${link?.plataforma === 'invalido' ? ' video-item--ruim' : ''}">
  <div class="video-item__capa">${miolo}
    <i class="ph ph-play-circle video-item__play" aria-hidden="true"></i>
  </div>
  <div class="video-item__info">
    <span class="video-item__tipo">${escapar(etiqueta)}</span>
    <span class="video-item__nome">${escapar(v.legenda ?? v.nome ?? v.url ?? '')}</span>
  </div>
  <button class="foto-item__x" type="button" data-remover-video="${escapar(v.chave)}"
          aria-label="Remover este vídeo">
    <i class="ph ph-x" aria-hidden="true"></i>
  </button>
</div>`;
  }).join('');

  $$('[data-remover-video]', alvo).forEach((b) => b.addEventListener('click', () => {
    descartar(edicao.videos, b.dataset.removerVideo);
    desenharVideos();
  }));
}

async function receberVideos(lista) {
  const arquivos = [...lista].filter((f) => f.type.startsWith('video/'));
  if (!arquivos.length) return;

  const barra = $('#progresso-video');
  const traco = barra.querySelector('span');
  barra.hidden = false;
  traco.style.width = '0%';

  let feitos = 0;
  for (const arquivo of arquivos) {
    if (arquivo.size > TETO_VIDEO) {
      recado($('#forma-recado'),
        `"${escapar(arquivo.name)}" tem ${tamanhoLegivel(arquivo.size)} e o limite aqui é ` +
        `${tamanhoLegivel(TETO_VIDEO)}. Corte o vídeo para uns 40 segundos, ou ` +
        'publique no YouTube e cole o link aqui embaixo.', 'erro');
    } else {
      edicao.videos.push({
        chave: crypto.randomUUID(),
        tipo: 'video',
        blob: arquivo,
        mime: arquivo.type,
        nome: arquivo.name,
        tamanho: arquivo.size,
        url: URL.createObjectURL(arquivo),
        existente: false,
      });
    }
    traco.style.width = `${Math.round((++feitos / arquivos.length) * 100)}%`;
    desenharVideos();
  }

  setTimeout(() => { barra.hidden = true; }, 600);
}

function adicionarLinkDeVideo() {
  const campo = $('#i-video-link');
  const bruto = campo.value.trim();
  if (!bruto) return;

  const lido = lerLinkDeVideo(bruto);
  if (lido.plataforma === 'invalido') {
    return recado($('#forma-recado'),
      'Esse link não parece um endereço de vídeo. Copie da barra do navegador ou ' +
      'do botão "compartilhar" do app.', 'erro');
  }

  edicao.videos.push({
    chave: crypto.randomUUID(),
    tipo: 'video-link',
    url: bruto,
    existente: false,
  });

  campo.value = '';
  $('#forma-recado').hidden = true;
  desenharVideos();
}

/* =============================================================== backup == */

async function exportarCarteira() {
  const caixa = $('#backup-recado');
  recado(caixa, 'Montando o arquivo. Com vídeo dentro isso pode levar um minuto.');

  try {
    const pacote = await local.exportar();
    const blob = new Blob([JSON.stringify(pacote)], { type: 'application/json' });
    const endereco = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = endereco;
    a.download = `carteira-ah-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(endereco);

    recado(caixa,
      `Baixado: ${pacote.imoveis.length} imóveis e ${pacote.midias.length} arquivos, ` +
      `${tamanhoLegivel(blob.size)}. Guarde esse arquivo fora do computador.`);
  } catch (erro) {
    recado(caixa, escapar(erro.message), 'erro');
  }
}

async function importarCarteira(arquivo) {
  const caixa = $('#backup-recado');
  const substituir = confirm(
    'OK apaga a carteira atual e põe a do arquivo no lugar.\n' +
    'Cancelar junta as duas, mantendo o que já existe aqui.'
  );

  recado(caixa, 'Lendo o arquivo.');
  try {
    const pacote = JSON.parse(await arquivo.text());
    const r = await local.importar(pacote, { substituir });
    recado(caixa, `Pronto: ${r.imoveis} imóveis e ${r.midias} arquivos restaurados.`);
    await carregarLista();
    await carregarLeads();
    await mostrarEspaco();
  } catch (erro) {
    recado(caixa, `Não consegui restaurar: ${escapar(erro.message)}`, 'erro');
  }
}

async function mostrarEspaco() {
  const alvo = $('#backup-espaco');
  if (!alvo || repo.naNuvem) return;

  const e = await local.espacoUsado();
  alvo.textContent = e
    ? `Este site está ocupando ${tamanhoLegivel(e.usado)} dos ${tamanhoLegivel(e.teto)} que o navegador libera.`
    : '';
}

/* ================================================================= mapa == */

function prepararMapa(lat, lng) {
  const caixa = $('#mapa-admin');
  if (!window.L || !caixa) return;

  const centro = lat != null && lng != null ? [lat, lng] : CONFIG.mapa.centro;

  if (!mapa) {
    mapa = L.map(caixa).setView(centro, lat != null ? 16 : CONFIG.mapa.zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; colaboradores do OpenStreetMap',
    }).addTo(mapa);
    mapa.on('click', (e) => marcar(e.latlng.lat, e.latlng.lng, false));
  } else {
    mapa.setView(centro, lat != null ? 16 : CONFIG.mapa.zoom);
  }

  if (pino) { mapa.removeLayer(pino); pino = null; }
  if (lat != null && lng != null) marcar(lat, lng, false);

  // O container estava com display:none quando o Leaflet mediu. Sem este
  // recálculo o mapa aparece cinza com um pedaço só de tile renderizado.
  setTimeout(() => mapa.invalidateSize(), 60);
}

function marcar(lat, lng, mover = true) {
  if (pino) pino.setLatLng([lat, lng]);
  else pino = L.marker([lat, lng], { draggable: true }).addTo(mapa);
  if (mover) mapa.setView([lat, lng], 16);
}

async function localizarEndereco() {
  const termo = $('#i-busca-endereco').value.trim();
  if (!termo) return;

  const botao = $('#localizar');
  botao.disabled = true;

  try {
    // Nominatim é o geocodificador do OpenStreetMap: grátis, sem chave.
    // Limite de uso é 1 consulta por segundo, por isso só roda no clique.
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({
      format: 'jsonv2', q: termo, countrycodes: 'br', limit: '1', addressdetails: '1',
    });

    const resposta = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
    if (!resposta.ok) throw new Error(`o serviço respondeu ${resposta.status}`);
    const [achado] = await resposta.json();

    if (!achado) {
      recado($('#forma-recado'), 'Não achei esse endereço. Tente clicar direto no mapa.', 'erro');
      return;
    }

    marcar(Number(achado.lat), Number(achado.lon));

    const end = achado.address ?? {};
    if (!$('#i-logradouro').value) $('#i-logradouro').value = end.road ?? '';
    if (!$('#i-bairro').value) $('#i-bairro').value = end.suburb ?? end.neighbourhood ?? '';
    if (!$('#i-cidade').value) $('#i-cidade').value = end.city ?? end.town ?? end.municipality ?? '';
    if (!$('#i-cep').value) $('#i-cep').value = end.postcode ?? '';
    $('#forma-recado').hidden = true;
  } catch (erro) {
    recado($('#forma-recado'), `Busca de endereço falhou: ${escapar(erro.message)}`, 'erro');
  } finally {
    botao.disabled = false;
  }
}

/* ================================================================ start == */

/** Liga uma área de soltar arquivo: clique, teclado e arrastar. */
function ligarSolta(seletorArea, seletorEntrada, aoReceber) {
  const area = $(seletorArea);
  const entrada = $(seletorEntrada);

  area.addEventListener('click', () => entrada.click());
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.click(); }
  });
  entrada.addEventListener('change', () => {
    aoReceber(entrada.files);
    entrada.value = '';
  });
  ['dragenter', 'dragover'].forEach((ev) =>
    area.addEventListener(ev, (e) => { e.preventDefault(); area.classList.add('sobre'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    area.addEventListener(ev, (e) => { e.preventDefault(); area.classList.remove('sobre'); }));
  area.addEventListener('drop', (e) => aoReceber(e.dataTransfer.files));
}

function ligarEventos() {
  $('#login').addEventListener('submit', entrar);
  $('#sair').addEventListener('click', sair);
  $('#novo').addEventListener('click', () => abrirFormulario(null));
  $('#cancelar').addEventListener('click', () => mostrar('painel'));
  $('#cancelar-2').addEventListener('click', () => mostrar('painel'));
  $('#forma').addEventListener('submit', salvar);
  $('#excluir').addEventListener('click', excluir);
  $('#localizar').addEventListener('click', localizarEndereco);

  // abas
  const abas = [
    ['#aba-imoveis', '#vista-imoveis'],
    ['#aba-leads', '#vista-leads'],
    ['#aba-backup', '#vista-backup'],
  ];
  for (const [botao] of abas) {
    $(botao).addEventListener('click', () => {
      for (const [b, vista] of abas) {
        const ativa = b === botao;
        $(b).setAttribute('aria-selected', String(ativa));
        $(vista).hidden = !ativa;
      }
    });
  }

  // dinheiro com separador de milhar enquanto digita
  for (const id of ['#i-preco', '#i-condominio', '#i-iptu']) {
    const el = $(id);
    el.addEventListener('input', () => {
      const n = lerNumero(el.value);
      el.value = n == null ? '' : n.toLocaleString('pt-BR');
    });
  }

  ligarSolta('#solta', '#arquivos', receberFotos);
  ligarSolta('#solta-video', '#arquivos-video', receberVideos);

  $('#add-video-link').addEventListener('click', adicionarLinkDeVideo);
  // Enter no campo do link não pode enviar o formulário inteiro.
  $('#i-video-link').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); adicionarLinkDeVideo(); }
  });

  $('#exportar').addEventListener('click', exportarCarteira);
  $('#importar').addEventListener('click', () => $('#arquivo-backup').click());
  $('#arquivo-backup').addEventListener('change', (e) => {
    const [arquivo] = e.target.files;
    if (arquivo) importarCarteira(arquivo);
    e.target.value = '';
  });
}

function explicarModo() {
  $('#dica-video').textContent = repo.naNuvem
    ? `MP4 ou MOV, até ${tamanhoLegivel(TETO_VIDEO)}. Prefira um tour curto, de 30 a 60 segundos.`
    : `MP4 ou MOV, até ${tamanhoLegivel(TETO_VIDEO)}. Fica gravado neste navegador, ` +
      'então o tamanho aqui é folgado.';

  if (repo.naNuvem) {
    $('#backup-explica').textContent =
      'A carteira está no Supabase, que já guarda tudo e faz cópia sozinho. ' +
      'Este backup serve como cópia extra na sua mão.';
    return;
  }

  recado($('#recado-modo'),
    '<strong>Modo local.</strong> Os imóveis, fotos e vídeos que você cadastrar aqui ' +
    'ficam gravados <strong>neste navegador, nesta máquina</strong> — o site funciona ' +
    'inteiro assim, mas ninguém mais enxerga esse conteúdo. ' +
    'Para o catálogo ir ao ar de verdade e o seu pai cadastrar pelo celular, ' +
    'ligue o Supabase (é grátis, uns 30 minutos, passo a passo no ' +
    '<code>RETOMAR.md</code>). Antes disso, use a aba <strong>Backup</strong>.', 'aviso');

  $('#backup-explica').textContent =
    'A carteira está gravada dentro deste navegador. Limpar os dados de navegação, ' +
    'trocar de computador ou formatar apaga tudo. Baixe uma cópia sempre que ' +
    'cadastrar imóvel novo.';
}

async function iniciar() {
  ligarEventos();
  explicarModo();

  // No modo local não há login: quem abriu o painel já está na máquina onde a
  // carteira mora. Na nuvem, sem sessão, a porta é o formulário de e-mail.
  if (!repo.naNuvem) {
    usuario = await repo.sessao();
    await abrirPainel();
    return;
  }

  usuario = await repo.sessao();
  if (usuario) await abrirPainel();
  else mostrar('login');
}

iniciar();
