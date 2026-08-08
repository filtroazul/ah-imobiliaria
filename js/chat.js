// ============================================================================
// Atendimento por IA — botão flutuante + painel com o agente
// ----------------------------------------------------------------------------
// O agente mora na plataforma Streamlit (repo `agentes`), e entra aqui dentro
// de um iframe. A chave dele no agents.yaml é `ah_imobiliaria`.
//
// A marcação é criada em JS, e não escrita nos dois HTML, por um motivo só:
// index.html e imovel.html carregariam a mesma coisa e sairiam do compasso na
// primeira alteração. Quem quiser o chat numa página nova só precisa importar
// e chamar `ligarChat()`.
//
// O iframe NÃO nasce junto com a página. Ele só é criado no primeiro clique:
// carregar o app do Streamlit no carregamento atrasaria o site inteiro por uma
// coisa que a maioria das visitas não abre. E o app free "dorme" quando fica
// sem uso, então a primeira abertura do dia demora — por isso o painel mostra
// um aviso enquanto o iframe não pinta.
// ============================================================================

const APP = 'https://agentes-s68ksrzb97z5q4qqp7f8nq.streamlit.app/';
const AGENTE = 'ah_imobiliaria';
const COR = '6e181b'; // o vinho da marca, sem o #, vai na URL do app

const CHAMADA = 'Procurando imóvel? Me conta o que você quer';

export function ligarChat() {
  const botao = document.createElement('button');
  botao.className = 'chat-btn';
  botao.id = 'chat-btn';
  botao.type = 'button';
  botao.setAttribute('aria-label', 'Abrir o atendimento por chat');
  botao.setAttribute('aria-expanded', 'false');
  botao.innerHTML = '<i class="ph ph-chat-circle-dots" aria-hidden="true"></i>';

  const balao = document.createElement('p');
  balao.className = 'chat-balao';
  balao.textContent = CHAMADA;
  balao.setAttribute('aria-hidden', 'true');

  const painel = document.createElement('div');
  painel.className = 'chat-painel';
  painel.id = 'chat-painel';
  painel.hidden = true;
  painel.innerHTML = `
    <div class="chat-painel__topo">
      <span class="chat-painel__titulo">Atendimento Ah Imobiliária</span>
      <button class="chat-painel__x" type="button" aria-label="Fechar o atendimento">
        <i class="ph ph-x" aria-hidden="true"></i>
      </button>
    </div>
    <p class="chat-painel__espera">Acordando o atendimento. A primeira abertura do dia leva alguns segundos.</p>`;

  botao.setAttribute('aria-controls', painel.id);

  let carregado = false;

  const fechar = () => {
    painel.hidden = true;
    botao.setAttribute('aria-expanded', 'false');
    botao.innerHTML = '<i class="ph ph-chat-circle-dots" aria-hidden="true"></i>';
    botao.setAttribute('aria-label', 'Abrir o atendimento por chat');
  };

  const abrir = () => {
    if (!carregado) {
      const quadro = document.createElement('iframe');
      quadro.src = `${APP}?agente=${AGENTE}&embed=true&cor=${COR}`;
      quadro.title = 'Atendimento da Ah Imobiliária';
      quadro.loading = 'lazy';
      painel.appendChild(quadro);
      carregado = true;
    }
    painel.hidden = false;
    balao.classList.remove('mostra');
    botao.setAttribute('aria-expanded', 'true');
    botao.innerHTML = '<i class="ph ph-x" aria-hidden="true"></i>';
    botao.setAttribute('aria-label', 'Fechar o atendimento por chat');
  };

  botao.addEventListener('click', () => (painel.hidden ? abrir() : fechar()));
  painel.querySelector('.chat-painel__x').addEventListener('click', fechar);

  // Esc fecha, como qualquer caixa que cobre a tela no celular.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !painel.hidden) { fechar(); botao.focus(); }
  });

  document.body.append(painel, balao, botao);

  // O balão se oferece uma vez e sai. Só aparece se a pessoa ainda não abriu o
  // chat sozinha, e nunca em movimento reduzido.
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setTimeout(() => { if (painel.hidden) balao.classList.add('mostra'); }, 5000);
    setTimeout(() => balao.classList.remove('mostra'), 14000);
  }
}
