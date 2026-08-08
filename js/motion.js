// ============================================================================
// Movimento
// ----------------------------------------------------------------------------
// Regra que vale pra tudo aqui: nenhuma animação entra sem um motivo que caiba
// numa frase. As que existem e o porquê:
//
//   abertura da marca  -> identidade, a logo se constrói antes de tudo
//   cabeçalho encolhe  -> feedback de estado (você saiu do topo)
//   barra de progresso -> orientação, mostra que a página continua abaixo
//   parallax do hero   -> profundidade, separa as duas fotos em camadas
//   entrada do hero    -> hierarquia, o olho lê título, texto e botão nessa ordem
//   revelação ao rolar -> sequência, o conteúdo chega junto com a leitura
//   cobertura presa    -> narrativa, segura a atenção enquanto conta a área de atuação
//   linha do percurso  -> progresso, mostra onde você está nas três etapas
//   botão magnético    -> alvo, o CTA se oferece antes do clique
//
// Nada usa addEventListener('scroll'): é ScrollTrigger em tudo, que agrupa as
// leituras de layout num frame só em vez de disparar a cada pixel rolado.
// ============================================================================

let ligado = false;

// Quanto a cortina da abertura leva pra sair de cena. Tem que bater com o
// atraso + duração de @keyframes cortina no site.css. Se divergir, o hero
// anima escondido atrás dela e a pessoa nunca vê.
const FIM_DA_ABERTURA = 2.7;

export function iniciarMovimento() {
  const raiz = document.documentElement;

  // O inline script do <head> já decidiu isso olhando prefers-reduced-motion.
  if (!raiz.classList.contains('motion-ok')) return;

  // Rede de segurança: CDN fora do ar não pode deixar a página invisível.
  if (!window.gsap || !window.ScrollTrigger) {
    raiz.classList.remove('motion-ok');
    console.warn('GSAP não carregou. A página segue funcionando, sem animação.');
    return;
  }

  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  ligado = true;

  const atraso = raiz.classList.contains('com-abertura') ? FIM_DA_ABERTURA : 0.15;

  cabecalho(gsap, ScrollTrigger);
  barraDeProgresso(gsap);
  entradaDoHero(gsap, atraso);
  parallax(gsap);
  revelarSecoes(gsap, ScrollTrigger);
  coberturaPresa(gsap);
  linhaDoPercurso(gsap, ScrollTrigger);
  botoesMagneticos();

  // As fotos entram depois do HTML. Sem isso o ScrollTrigger calcula as
  // posições com a página ainda curta e os gatilhos disparam no lugar errado.
  window.addEventListener('load', () => ScrollTrigger.refresh());
}

/* -------------------------------------------------------------------------- */

function cabecalho(gsap, ScrollTrigger) {
  ScrollTrigger.create({
    start: 'top -40',
    end: 99999,
    toggleClass: { targets: '#cabecalho', className: 'encolhido' },
  });
}

/** Barra fininha no pé do cabeçalho com a fração já rolada da página. */
function barraDeProgresso(gsap) {
  const barra = document.querySelector('#progresso');
  if (!barra) return;

  gsap.to(barra, {
    scaleX: 1,
    ease: 'none',
    scrollTrigger: {
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.3,
      invalidateOnRefresh: true,
    },
  });
}

/** `atraso` existe por causa da abertura: com a cortina no ar, o hero tem que
 *  esperar ela sair, senão anima atrás dela e aparece pronto. */
function entradaDoHero(gsap, atraso) {
  const palavras = document.querySelectorAll('.hero__titulo .pal');
  const alvos = document.querySelectorAll('.hero .reveal-y');

  if (palavras.length) {
    gsap.to(palavras, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      stagger: 0.055,
      ease: 'power3.out',
      delay: atraso,
    });
  }

  if (alvos.length) {
    gsap.to(alvos, {
      opacity: 1,
      y: 0,
      duration: 0.9,
      stagger: 0.09,
      ease: 'power3.out',
      delay: atraso + 0.35,
    });
  }

  gsap.from('.hero__foto', {
    opacity: 0,
    scale: 1.04,
    y: 30,
    duration: 1.1,
    stagger: 0.12,
    ease: 'power3.out',
    delay: atraso + 0.15,
  });

  // O fio dourado é a citação da logo dentro do layout: entra depois das
  // fotos, como moldura que fecha a composição.
  gsap.from('.hero__fio', {
    opacity: 0,
    scale: 0.92,
    duration: 1,
    ease: 'power3.out',
    delay: atraso + 0.55,
  });
}

/** O botão puxa o cursor de leve dentro de um raio. Escreve --puxa-x/--puxa-y,
 *  que o CSS transforma; a transição do .btn é que dá a elasticidade.
 *
 *  Delegado no documento porque botão nasce depois (o "carregar mais" some e
 *  volta). Cada botão só é instrumentado na primeira vez que o ponteiro passa
 *  por cima, e o guarda no dataset evita empilhar listener. */
function botoesMagneticos() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const forca = 0.3;
  const limite = 10; // px: passou disso o rótulo descola da borda

  document.addEventListener('pointerover', (e) => {
    const botao = e.target.closest?.('.btn');
    if (!botao || botao.dataset.magnetico) return;
    botao.dataset.magnetico = '1';

    const preso = (v) => Math.max(-limite, Math.min(limite, v));

    botao.addEventListener('pointermove', (ev) => {
      const r = botao.getBoundingClientRect();
      botao.style.setProperty('--puxa-x', `${preso((ev.clientX - r.left - r.width / 2) * forca)}px`);
      botao.style.setProperty('--puxa-y', `${preso((ev.clientY - r.top - r.height / 2) * forca)}px`);
    });

    botao.addEventListener('pointerleave', () => {
      botao.style.setProperty('--puxa-x', '0px');
      botao.style.setProperty('--puxa-y', '0px');
    });
  });
}

/** Cada foto do hero anda num ritmo diferente. O valor vem do data-parallax
 *  do elemento, em pixels de deslocamento ao longo da rolagem do hero. */
function parallax(gsap) {
  document.querySelectorAll('[data-parallax]').forEach((el) => {
    gsap.to(el, {
      y: Number(el.dataset.parallax) || 0,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 1,
      },
    });
  });
}

function revelarSecoes(gsap, ScrollTrigger) {
  const alvos = gsap.utils.toArray('.reveal-y').filter((el) => !el.closest('.hero'));
  if (!alvos.length) return;

  ScrollTrigger.batch(alvos, {
    start: 'top 88%',
    once: true,
    onEnter: (lote) => {
      // A classe é o que dispara o fio dourado do ::after do título, que é
      // transição pura de CSS. O GSAP não toca em pseudo-elemento.
      lote.forEach((el) => el.classList.add('revelado'));
      gsap.to(lote, {
        opacity: 1,
        y: 0,
        duration: 0.75,
        stagger: 0.08,
        ease: 'power3.out',
      });
    },
  });
}

/** Prende a seção no topo da tela e avança o zoom da foto enquanto rola.
 *  start 'top top' é o que garante que ela gruda exatamente quando encosta
 *  no topo, em vez de começar a animar com meia seção ainda fora da tela. */
function coberturaPresa(gsap) {
  const secao = document.querySelector('#cobertura');
  const fundo = document.querySelector('#cobertura-fundo');
  if (!secao || !fundo) return;

  gsap.fromTo(
    fundo,
    { scale: 1.02 },
    {
      scale: 1.3,
      ease: 'none',
      scrollTrigger: {
        trigger: secao,
        start: 'top top',
        end: '+=90%',
        pin: true,
        scrub: 1,
        invalidateOnRefresh: true,
      },
    }
  );
}

function linhaDoPercurso(gsap, ScrollTrigger) {
  const barra = document.querySelector('#percurso-progresso');
  if (!barra) return;

  gsap.to(barra, {
    scaleY: 1,
    ease: 'none',
    scrollTrigger: {
      trigger: '#percurso',
      start: 'top 72%',
      end: 'bottom 82%',
      scrub: true,
    },
  });

  // Cada etapa acende quando a linha passa por ela: sem isso a barra cresce
  // sozinha e não fica claro que ela mede as três etapas.
  document.querySelectorAll('.etapa').forEach((etapa) => {
    ScrollTrigger.create({
      trigger: etapa,
      start: 'top 62%',
      end: 'bottom 40%',
      toggleClass: { targets: etapa, className: 'alcancada' },
    });
  });
}

/* -------------------------------------------------------------------------- */

/**
 * Anima cartões inseridos depois da carga inicial (o "carregar mais").
 * Quando o movimento está desligado, não faz nada: o CSS já deixa visível.
 */
export function revelarNovos(elementos) {
  if (!ligado || !elementos.length) return;
  const { gsap, ScrollTrigger } = window;
  gsap.from(elementos, {
    opacity: 0,
    y: 24,
    duration: 0.6,
    stagger: 0.06,
    ease: 'power3.out',
    onComplete: () => ScrollTrigger.refresh(),
  });
}

/**
 * Fichas de bairro. Elas chegam por fetch, depois que os gatilhos já foram
 * criados, então precisam do seu próprio.
 *
 * O gatilho é a seção inteira e não cada ficha: a `.cobertura` fica presa na
 * tela, e dentro de um pin as posições individuais param de acompanhar a
 * rolagem — as fichas nunca cruzariam a linha de disparo delas.
 */
export function revelarBairros(elementos) {
  if (!ligado || !elementos.length) return;
  const { gsap, ScrollTrigger } = window;

  gsap.set(elementos, { opacity: 0, y: 14 });
  ScrollTrigger.create({
    trigger: '#cobertura',
    start: 'top 60%',
    once: true,
    onEnter: () =>
      gsap.to(elementos, {
        opacity: 1,
        y: 0,
        duration: 0.55,
        stagger: 0.035,
        ease: 'power3.out',
      }),
  });
  ScrollTrigger.refresh();
}

/** Chamar depois de trocar o conteúdo de uma seção, pra recalcular gatilhos. */
export function recalcular() {
  if (ligado) window.ScrollTrigger.refresh();
}
