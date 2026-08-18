// ============================================================================
// Ah Imobiliária — configuração
// ----------------------------------------------------------------------------
// Este é o ÚNICO arquivo que você precisa editar pra colocar o site no ar.
//
// Enquanto supabaseUrl estiver VAZIO, o site e o painel funcionam inteiros no
// MODO LOCAL: os imóveis, fotos e vídeos que você cadastrar ficam gravados
// dentro deste navegador (IndexedDB), sem conta e sem senha. Dá pra montar a
// carteira toda antes de criar qualquer coisa. O que o modo local NÃO faz é
// publicar: quem abrir o site pela internet não enxerga esse conteúdo, e é
// justamente pra isso que existem as duas chaves abaixo.
//
// Antes de trocar de navegador ou de máquina, exporte a carteira pela aba
// "Backup" do painel — o banco local mora no navegador e some com ele.
//
// Onde achar as duas chaves: painel do Supabase > Project Settings > API.
// A chave anon PODE ficar aqui à vista. Ela é pública por design; quem protege
// os dados são as policies de RLS em supabase/schema.sql.
// ============================================================================

export const CONFIG = {
  // Projeto "ah.imobiliaria", região sa-east-1 (São Paulo), criado em 10/08/2026.
  // A chave abaixo é a PUBLISHABLE (formato novo do Supabase, substitui a antiga
  // `anon`). Ela é pública por design e pode ficar aqui à vista — testado em
  // 10/08: com ela na mão, um visitante lê o catálogo publicado e nada mais.
  // A chave `sb_secret_...` NUNCA entra neste arquivo.
  supabaseUrl: 'https://sbbdwruztgkhpkgpbrzl.supabase.co',
  supabaseAnonKey: 'sb_publishable_y-Kenm09_JFxhdRkBmFIGw_SHtyeoiy',

  // Deixar em branco o que ainda não se sabe: o site esconde a linha sozinho.
  // Melhor faltar um dado do que exibir um endereço ou e-mail inventado.
  contato: {
    // Só dígitos, com DDI. É isso que monta o link do WhatsApp.
    // CONFIRMADO pelo dono em 06/08/2026: é este o número, com 8 dígitos
    // depois do DDD. Chama atenção porque celular no Ceará tem 9 desde 2016,
    // então parece erro de digitação e não é — não "corrigir" pra
    // 5585999928999 numa próxima leitura. O wa.me monta o link nos dois
    // formatos, então não dá pra distinguir testando o link.
    whatsapp: '558599928999',
    instagram: 'ah.imobiliaria',
    email: '',
    creci: 'CRECI-CE 28277', // está impresso na própria logo
    endereco: '',
  },

  // Centro do mapa quando o imóvel não tem coordenada. Padrão: Fortaleza.
  mapa: {
    centro: [-3.7327, -38.5267],
    zoom: 12,
  },

  // Backend privado que executa o agente. A chave da IA nunca fica no site:
  // o painel manda o token da sessão do corretor e o servidor valida antes de
  // gerar uma sugestão. Troque apenas se o domínio do webhook mudar.
  automacao: {
    backendUrl: 'https://clergyman-rewrite-jolt.ngrok-free.dev',
  },

  // Quantos imóveis o catálogo carrega por vez.
  porPagina: 9,
};

// As cores da marca vivem em css/tokens.css (--marca-vermelho e
// --marca-dourado), amostradas da logo. Não duplique elas aqui: existia um
// `export const MARCA` com os dois hex antigos que ninguém importava, e o
// comentário dele afirmava que o CSS lia daqui — o que CSS não faz. Quem
// fosse trocar a cor mexeria no lugar errado.

export const configurado = () =>
  Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
