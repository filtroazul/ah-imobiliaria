// ============================================================================
// Atalho do painel
// ----------------------------------------------------------------------------
// O botão "Painel" no cabeçalho só aparece pra quem já logou no painel NESTE
// aparelho. Assim o corretor tem um toque de qualquer página, no celular e no
// PC, e o visitante do site do cliente continua sem ver o painel anunciado na
// vitrine.
//
// ⚠️ Isso NÃO é segurança, e não vale tratar como se fosse. O admin.html é HTML
// público num repo público: quem quiser achar, acha. Quem protege a carteira é
// a senha do corretor mais o RLS do Supabase. Esconder o botão é decisão de
// vitrine, e foi por isso que o link do rodapé saiu em 10/08/2026.
//
// Por que ler o localStorage na mão em vez de chamar `sessao()` do repo.js:
// `sessao()` precisa do cliente do Supabase, e o cliente vem de um import
// dinâmico do CDN (js/dados.js). Usar ele aqui baixaria o SDK inteiro em TODA
// visita do site público só pra decidir se um botão aparece pra uma pessoa. A
// chave lida abaixo é a mesma que o próprio SDK grava.
// ============================================================================

import { CONFIG } from './config.js';

/**
 * `sb-<ref>-auth-token` é onde o supabase-js v2 guarda a sessão, e <ref> é o
 * subdomínio do projeto (em https://sbbdw....supabase.co, é o `sbbdw...`).
 */
function temSessao() {
  try {
    const ref = new URL(CONFIG.supabaseUrl).hostname.split('.')[0];
    const bruto = localStorage.getItem(`sb-${ref}-auth-token`);
    if (!bruto) return false;

    // Token vencido ainda conta. O refresh_token renova sozinho quando o painel
    // abrir, e sumir com o atalho de quem passou uma semana sem entrar seria
    // pior do que mostrar um botão que às vezes cai na tela de senha.
    return Boolean(JSON.parse(bruto)?.refresh_token);
  } catch {
    // localStorage bloqueado (aba anônima, cookies de terceiro) ou JSON que o
    // SDK mudou de formato. Sem atalho, e sem quebrar a página do visitante.
    return false;
  }
}

if (CONFIG.supabaseUrl && temSessao()) {
  document.getElementById('painel-link')?.removeAttribute('hidden');
}
