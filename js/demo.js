// ============================================================================
// Carteira de demonstração
// ----------------------------------------------------------------------------
// Usada só enquanto o Supabase não está configurado, pra você conseguir ver o
// site completo desde o primeiro segundo. Assim que CONFIG.supabaseUrl for
// preenchido, este arquivo para de ser lido.
//
// As fotos vêm do picsum.photos com semente fixa, então cada imóvel mantém
// sempre a mesma imagem. São PLACEHOLDER: as fotos reais entram pelo admin.
// ============================================================================

const foto = (semente, l = 1200, a = 800) =>
  `https://picsum.photos/seed/${semente}/${l}/${a}`;

export const IMOVEIS_DEMO = [
  {
    id: 'demo-127', codigo: 127,
    titulo: 'Apartamento reformado a duas quadras da Beira-Mar',
    finalidade: 'venda', tipo: 'apartamento',
    preco: 848000, condominio: 740,
    quartos: 3, suites: 1, banheiros: 2, vagas: 2, area_util: 118,
    bairro: 'Meireles', cidade: 'Fortaleza', uf: 'CE',
    lat: -3.7268, lng: -38.4917, destaque: true,
    comodidades: ['Piscina', 'Portaria 24h', 'Academia', 'Varanda gourmet'],
    descricao: 'Andar alto, sol da manhã e vista livre para o mar. A reforma ' +
      'de 2024 trocou piso, bancadas e toda a parte elétrica. Condomínio com ' +
      'piscina, academia e dois elevadores. Fica a 400 metros do calçadão.',
    capa: foto('meireles-sala', 1600, 1067), total_fotos: 8,
    fotos: [
      foto('meireles-sala', 1600, 1067),
      foto('meireles-cozinha', 1600, 1067),
      foto('meireles-quarto', 1600, 1067),
      foto('meireles-varanda', 1600, 1067),
    ],
  },
  {
    id: 'demo-131', codigo: 131,
    titulo: 'Casa em condomínio fechado no Eusébio',
    finalidade: 'venda', tipo: 'casa',
    preco: 1240000, condominio: 620,
    quartos: 4, suites: 2, banheiros: 4, vagas: 4, area_util: 245, area_total: 420,
    bairro: 'Precabura', cidade: 'Eusébio', uf: 'CE',
    lat: -3.8901, lng: -38.4512, destaque: true,
    comodidades: ['Piscina privativa', 'Churrasqueira', 'Área verde', 'Segurança 24h'],
    descricao: 'Térrea, toda em um piso só, com pé-direito alto na sala. ' +
      'Quintal com piscina e espaço de churrasco já montado. O condomínio tem ' +
      'quadra, playground e portaria com controle de acesso.',
    capa: foto('eusebio-fachada', 1600, 1067), total_fotos: 12,
    fotos: [
      foto('eusebio-fachada', 1600, 1067),
      foto('eusebio-piscina', 1600, 1067),
      foto('eusebio-sala', 1600, 1067),
      foto('eusebio-suite', 1600, 1067),
    ],
  },
  {
    id: 'demo-104', codigo: 104,
    titulo: 'Apartamento compacto para alugar na Aldeota',
    finalidade: 'aluguel', tipo: 'apartamento',
    preco: 2350, condominio: 480,
    quartos: 2, suites: 0, banheiros: 1, vagas: 1, area_util: 64,
    bairro: 'Aldeota', cidade: 'Fortaleza', uf: 'CE',
    lat: -3.7385, lng: -38.5011, destaque: true,
    comodidades: ['Mobiliado', 'Portaria 24h', 'Elevador'],
    descricao: 'Entregue mobiliado, pronto pra morar. Fica em rua tranquila, ' +
      'com padaria e supermercado na esquina. Aceita contrato de 30 meses ' +
      'com fiador ou seguro-fiança.',
    capa: foto('aldeota-living', 1600, 1067), total_fotos: 6,
    fotos: [
      foto('aldeota-living', 1600, 1067),
      foto('aldeota-quarto', 1600, 1067),
      foto('aldeota-cozinha', 1600, 1067),
    ],
  },
  {
    id: 'demo-118', codigo: 118,
    titulo: 'Casa de vila reformada no Benfica',
    finalidade: 'venda', tipo: 'casa',
    preco: 487000,
    quartos: 3, suites: 1, banheiros: 2, vagas: 1, area_util: 132, area_total: 180,
    bairro: 'Benfica', cidade: 'Fortaleza', uf: 'CE',
    lat: -3.7412, lng: -38.5389, destaque: false,
    comodidades: ['Quintal', 'Área de serviço coberta'],
    descricao: 'Casa antiga bem cuidada, com pé-direito alto e janelas ' +
      'grandes. Fica a dez minutos a pé da UFC, o que faz dela uma boa opção ' +
      'pra quem pensa em alugar quarto por quarto depois.',
    capa: foto('benfica-fachada', 1600, 1067), total_fotos: 7,
    fotos: [foto('benfica-fachada', 1600, 1067), foto('benfica-quintal', 1600, 1067)],
  },
  {
    id: 'demo-142', codigo: 142,
    titulo: 'Cobertura duplex com vista para o Cocó',
    finalidade: 'venda', tipo: 'apartamento',
    preco: 1685000, condominio: 1180,
    quartos: 4, suites: 3, banheiros: 5, vagas: 3, area_util: 296,
    bairro: 'Cocó', cidade: 'Fortaleza', uf: 'CE',
    lat: -3.7539, lng: -38.4852, destaque: false,
    comodidades: ['Piscina privativa', 'Deck', 'Vista para o parque', 'Sauna'],
    descricao: 'Dois pavimentos com escada interna, terraço privativo com ' +
      'piscina e deck voltado pro Parque do Cocó. O condomínio é de 2019 e ' +
      'tem gerador pra área comum.',
    capa: foto('coco-terraco', 1600, 1067), total_fotos: 15,
    fotos: [foto('coco-terraco', 1600, 1067), foto('coco-sala', 1600, 1067)],
  },
  {
    id: 'demo-095', codigo: 95,
    titulo: 'Ponto comercial de esquina na Parquelândia',
    finalidade: 'aluguel', tipo: 'comercial',
    preco: 4800,
    quartos: 0, banheiros: 2, vagas: 2, area_util: 145,
    bairro: 'Parquelândia', cidade: 'Fortaleza', uf: 'CE',
    lat: -3.7331, lng: -38.5644, destaque: false,
    comodidades: ['Esquina', 'Vitrine ampla', 'Estacionamento próprio'],
    descricao: 'Salão único com banheiro social e banheiro de funcionário, ' +
      'copa nos fundos e duas vagas na frente. Já funcionou como clínica e ' +
      'como loja de material de construção.',
    capa: foto('parquelandia-loja', 1600, 1067), total_fotos: 5,
    fotos: [foto('parquelandia-loja', 1600, 1067)],
  },
  {
    id: 'demo-156', codigo: 156,
    titulo: 'Terreno plano de 480 m² na Sapiranga',
    finalidade: 'venda', tipo: 'terreno',
    preco: 315000,
    quartos: 0, banheiros: 0, vagas: 0, area_total: 480,
    bairro: 'Sapiranga', cidade: 'Fortaleza', uf: 'CE',
    lat: -3.7896, lng: -38.4708, destaque: false,
    comodidades: ['Documentação em dia', 'Rua asfaltada'],
    descricao: 'Lote de 12 por 40, plano e murado nos três lados. Escritura ' +
      'registrada e IPTU quitado. Rua com asfalto, água e esgoto.',
    capa: foto('sapiranga-terreno', 1600, 1067), total_fotos: 4,
    fotos: [foto('sapiranga-terreno', 1600, 1067)],
  },
  {
    id: 'demo-163', codigo: 163,
    titulo: 'Apartamento novo de 2 quartos no Passaré',
    finalidade: 'venda', tipo: 'apartamento',
    preco: 268000, condominio: 310,
    quartos: 2, suites: 1, banheiros: 2, vagas: 1, area_util: 52,
    bairro: 'Passaré', cidade: 'Fortaleza', uf: 'CE',
    lat: -3.8214, lng: -38.5177, destaque: false,
    comodidades: ['Playground', 'Salão de festas', 'Aceita financiamento'],
    descricao: 'Empreendimento entregue em 2025, primeira locação ou moradia. ' +
      'Entra no Minha Casa Minha Vida dependendo da faixa de renda. Fica perto ' +
      'do terminal e da Av. Cel. Carvalho.',
    capa: foto('passare-predio', 1600, 1067), total_fotos: 9,
    fotos: [foto('passare-predio', 1600, 1067), foto('passare-sala', 1600, 1067)],
  },
  {
    id: 'demo-171', codigo: 171,
    titulo: 'Casa térrea com quintal grande no Montese',
    finalidade: 'aluguel', tipo: 'casa',
    preco: 1850,
    quartos: 3, banheiros: 2, vagas: 2, area_util: 110, area_total: 250,
    bairro: 'Montese', cidade: 'Fortaleza', uf: 'CE',
    lat: -3.7623, lng: -38.5484, destaque: false,
    comodidades: ['Quintal', 'Garagem coberta', 'Aceita pet'],
    descricao: 'Casa de rua, sem condomínio. Quintal grande nos fundos com ' +
      'área cimentada e canteiro. Proprietário aceita pet de pequeno porte.',
    capa: foto('montese-casa', 1600, 1067), total_fotos: 6,
    fotos: [foto('montese-casa', 1600, 1067), foto('montese-quintal', 1600, 1067)],
  },
];

export const BAIRROS_DEMO = [...new Set(IMOVEIS_DEMO.map((i) => i.bairro))].sort();
