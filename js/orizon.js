// Empreendimento fixo do site.
//
// O Orizon veio de um material comercial completo no Google Drive, mas não
// foi cadastrado pelo painel/Supabase. Mantê-lo aqui faz o lançamento aparecer
// no catálogo publicado e na página de detalhe sem duplicar os arquivos
// originais (alguns renders passam de 20 MB). As imagens abaixo são cópias
// locais otimizadas para web; os PDFs continuam apontando para a fonte.

const asset = (nome) => `assets/orizon/${nome}`;

export const ORIZON = {
  id: 'fixo-orizon-rooftop',
  codigo: 'ORZ',
  titulo: 'Orizon Rooftop — 2 e 3 quartos com suíte no Papicu',
  finalidade: 'venda',
  tipo: 'apartamento',
  status: 'disponivel',
  destaque: true,

  preco: 339000,
  preco_referencia: true,
  entrada_referencia: 5000,
  aceita_financiamento: true,
  quartos: 3,
  quartos_rotulo: '2 ou 3',
  suites: 1,
  banheiros: 2,
  vagas: 1,
  area_util: 50.5,
  area_rotulo: '50,50–62,83 m²',

  bairro: 'Papicu',
  cidade: 'Fortaleza',
  uf: 'CE',
  cep: '60176-052',
  logradouro: 'Rua Professor Otávio Lobo',
  numero: '200',
  mostrar_endereco: true,
  // Centro do trecho da Rua Professor Otávio Lobo no Papicu. O endereço
  // escrito acima é o que consta no book; o ponto serve só para orientação.
  lat: -3.7403682,
  lng: -38.4761693,

  descricao:
    'O Orizon Rooftop reúne apartamentos de 2 e 3 quartos com suíte, plantas ' +
    'de 50,50 m² e 62,83 m² e opções térreas com garden. São duas torres com ' +
    'rooftop de lazer nas duas coberturas, a poucos metros do Shopping RioMar ' +
    'e com acesso direto à Avenida Santos Dumont.\n\n' +
    'O projeto tem 316 unidades, quatro elevadores por torre, edifício-garagem ' +
    'e mais de 30 ambientes de lazer distribuídos entre piscina, sauna, ' +
    'hidromassagem, espaços gourmet, coworking, academia, áreas infantis e ' +
    'espaços de convivência.',

  comodidades: [
    'Rooftop de lazer nas duas torres',
    'Piscinas adulto e infantil',
    'Churrasqueira com hidromassagem',
    'Fitness clube e sport bar',
    'Espaço gourmet e salão de festas',
    'Coworking e sala de estudos',
    'Pet place e pet care',
    'Play kids, play baby e lounge teen',
    'Fechadura eletrônica',
    'Varanda com pontos de água, esgoto e elétrica',
    'Infraestrutura para ar-condicionado split',
    'Áreas comuns mobiliadas e equipadas',
  ],

  capa: asset('facade.jpg'),
  marca: asset('logo.png'),
  fotos: [
    asset('facade.jpg'),
    asset('facade-night.jpg'),
    asset('pool.jpg'),
    asset('rooftop-barbecue.jpg'),
    asset('zen.jpg'),
    asset('redario.jpg'),
    asset('lounge-teen.jpg'),
    asset('pet-place.jpg'),
  ],
  total_fotos: 8,
  videos: [
    {
      tipo: 'video-link',
      url: 'https://drive.google.com/file/d/1_alGl-CCkAFPpfrjW-i_7CaH2OMOHJYE/view',
      legenda: 'Vista das torres',
    },
    {
      tipo: 'video-link',
      url: 'https://drive.google.com/file/d/1rDR5MzTffUr3xZHIM_WIgha7V8s8Ntno/view',
      legenda: 'Fachada do empreendimento',
    },
  ],
  total_videos: 2,

  resumo_tecnico: [
    ['Torres', '2'],
    ['Unidades', '316'],
    ['Pavimentos', '21 por torre'],
    ['Elevadores', '4 por torre'],
    ['Terreno', '6.000 m²'],
    ['Área construída', '25.236,86 m²'],
    ['Vagas de carro', '319 rotativas'],
    ['Vagas de moto', '18'],
  ],

  plantas: [
    {
      titulo: 'Apartamento tipo meio',
      subtitulo: '2 quartos com suíte · 50,50 m²',
      imagem: asset('plan-2q.jpg'),
    },
    {
      titulo: 'Apartamento tipo ponta',
      subtitulo: '3 quartos com suíte · 62,83 m²',
      imagem: asset('plan-3q.jpg'),
    },
    {
      titulo: 'Garden ponta',
      subtitulo: '3 quartos · 62,83 m² + garden de 17,49 m²',
      imagem: asset('plan-garden.jpg'),
    },
  ],

  condicao_comercial: {
    titulo: 'Condição de referência encontrada no book',
    itens: [
      ['Entrada', 'R$ 5.000'],
      ['Valor da unidade', 'R$ 339.000'],
      ['Financiamento bancário', 'R$ 271.200'],
      ['Prazo simulado', '420 meses'],
    ],
    nota:
      'Simulação do material para a unidade 108, Bloco A, considerando FGTS ' +
      'de R$ 10.000 e bônus de lançamento de R$ 7.057. Sujeita à disponibilidade, ' +
      'atualização de valores, enquadramento no Minha Casa, Minha Vida e análise ' +
      'de crédito. Confirme a condição vigente com o corretor.',
  },

  documentos: [
    {
      titulo: 'Book digital do Orizon',
      rotulo: 'Abrir revista no Google Drive',
      url: 'https://drive.google.com/file/d/15svBZyDsdVVwus63pcEXuwTcgz1Y2m80/view',
    },
    {
      titulo: 'Ficha técnica e memorial',
      rotulo: 'Abrir ficha no Google Drive',
      url: 'https://drive.google.com/file/d/1UbYA7trVT6-U_p9HhClVUexr4w0uVvWK/view',
    },
  ],

  fonte_atualizada_em: '8 de janeiro de 2026',
  criado_em: '2026-01-08T22:12:34.230Z',
};
