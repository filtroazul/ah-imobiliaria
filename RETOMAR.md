# Ah Imobiliária — SaaS do seu pai

> Site + catálogo + painel do corretor + agente de IA. Custo de infra: R$ 0.
> Pasta autocontida (regra §5 do RETOMADA.md da raiz): tudo aqui aponta pra
> dentro, nada referencia `../`. Pode virar repo próprio quando quiser.

---

## 18/AGO - CRM de leads implementado e publicado

O painel ganhou uma aba **Leads e funil** com estatísticas reais, funil
arrastável, filtros, ficha completa, histórico de mensagens, notas, visitas,
valor potencial e controle da IA. O modo local foi atualizado para IndexedDB
v2 e continua funcionando sem nuvem.

Arquivos principais:

- `js/crm.js`: toda a interface e os cálculos do CRM;
- `js/repo.js`: leitura e escrita de leads, interações, visitas e configuração;
- `supabase/migrations/20260818_crm_funil.sql`: migração idempotente do banco;
- na raiz do projeto, `core/crm.py` e `webhook_manychat.py`: persistência da
  conversa e endpoint autenticado de sugestão.

Segurança decidida:

- a chave da IA e a `SUPABASE_SERVICE_ROLE_KEY` ficam somente no backend;
- o botão **Sugerir com IA** envia o JWT do corretor e o servidor valida se ele
  pertence à equipe ativa;
- a rota padrão `/manychat` continua no agente atual da AIOTI;
- a imobiliária usa `/manychat/ah_imobiliaria`, com histórico isolado;
- o bloco interno `RESUMO PARA O CORRETOR` não é mais devolvido ao cliente.

Testes feitos em 18/08: JavaScript e Python compilados, SQL analisado como
PostgreSQL válido, painel aberto em 1440 px e 390 px sem erro de console, funil
arrastado, ficha salva, nota criada, visita agendada, modo da IA alterado e lead
manual cadastrado.

Produção concluída em 18/08:

1. A migração `20260818_crm_funil.sql` foi aplicada no projeto real e as tabelas
   `lead_interacoes` e `configuracoes_ia` foram verificadas pela API.
2. A chave secreta ficou somente em `/etc/leadiot-webhook.env` na VM, modo 600,
   com backup anterior em `/etc/leadiot-webhook.env.bak-20260818-crm`.
3. O serviço `leadiot-webhook` foi atualizado e reiniciado; o health externo
   responde `crm: true` e a rota antiga continua usando o agente `aioti`.
4. O painel foi publicado no GitHub Pages pelo commit `2c05645` e validado com
   login real: 6 indicadores, 7 etapas, modo da IA e nenhuma falha de rede.
5. Única pendência externa: editar/publicar o fluxo dentro do ManyChat para
   chamar `/manychat/ah_imobiliaria`. A conta exige login/verificação humana;
   o endpoint e o passo a passo em `deploy/manychat-setup.md` já estão prontos.

---

## 🆕 10/AGO — O BACKEND ESTÁ NO AR (§3 e §5 abaixo estão desatualizados)

O Supabase foi criado e **tudo o que a §5 listava como "nunca rodou" rodou**.

| | |
|---|---|
| Projeto | `ah.imobiliaria`, ref `sbbdwruztgkhpkgpbrzl`, **sa-east-1 (São Paulo)** |
| Corretor | `ah.imobiliarias@gmail.com`, já em `public.corretores` com `admin=true` |
| Modo do site | **nuvem** — `js/config.js` preenchido, sem faixa de demonstração |

**Testado de verdade, contra o projeto real:**

- **14 ataques pela API como visitante anônimo** (criar/editar/apagar imóvel,
  criar/apagar vídeo, apagar foto, ler leads e visitas, ler rascunho): todos
  barrados, e conferido **no banco** que preço, fotos e vídeos ficaram
  intactos — `[]` numa resposta de DELETE não é prova, tem que ir olhar.
- **O corretor logado faz as 6 operações** e enxerga o rascunho.
- **Storage**: anônimo não sobe nem apaga; corretor sobe e apaga; leitura
  pública funciona.
- **Painel**: login com e-mail e senha, lista os imóveis, mostra rascunho.
- **Agente** conversando com o catálogo real, incluindo busca por bairro com
  acento e caixa trocados (`Aldeóta`, `ALDEOTA`).

**Três bugs só apareceram quando o schema encostou num banco de verdade:**

1. `public.videos` tinha as duas policies mas **nunca teve RLS ligado**.
   Policy sem RLS é ignorada em silêncio: qualquer visitante inseria e
   apagava vídeo. Corrigido, e o `Enable automatic RLS` do projeto ficou
   ligado como rede de segurança.
2. A coluna gerada `imoveis.busca` **não podia existir**: `unaccent()` e
   `array_to_string()` são STABLE, não IMMUTABLE, e coluna gerada exige
   IMMUTABLE. O schema inteiro falhava. A expressão virou
   `public.texto_busca()`, declarada immutable.
3. `dados.js` guardava o cliente pronto em vez da promessa → várias
   instâncias de auth disputando o mesmo token ("Multiple GoTrueClient
   instances"). A sessão do corretor podia cair no meio de um cadastro.

**O catálogo já está em produção.** Em 18/08 havia 7 imóveis publicados no
Supabase; novos cadastros e alterações continuam sendo feitos pelo painel.

### O que ainda depende de você

1. **ManyChat**: entrar na conta, colocar o External Request descrito acima e
   publicar a automação do Instagram/WhatsApp.
2. **Streamlit Cloud**: se o agente da plataforma principal precisar consultar
   esse catálogo, conferir `SUPABASE_URL` e `SUPABASE_ANON_KEY` nos secrets dele.
3. **Keep-alive**: o workflow do GitHub está ativo; conferir apenas se o GitHub
   o desabilitar depois de 60 dias sem commits.

---

## 1. Como rodar agora

```bash
cd ah-imobiliaria
python -m http.server 8720
```

Abra `http://127.0.0.1:8720/index.html`. O painel é `/admin.html`.

⚠️ **Tem que ser por servidor.** Abrir o `index.html` com dois cliques
(`file://`) não funciona: o navegador bloqueia `import` de módulo em file://.

### Os três estados do site (08/ago/2026)

| | Quando | O que acontece |
|---|---|---|
| **exemplo** | sem Supabase e carteira vazia | 9 imóveis de mentira (`js/demo.js`) + faixa no topo |
| **local** | sem Supabase e ao menos 1 imóvel | a carteira REAL, gravada no navegador. A faixa some sozinha |
| **nuvem** | com as chaves em `js/config.js` | Supabase, com login e acessível de qualquer lugar |

**Hoje ele está em "nuvem".** O site publicado lê o Supabase e o painel exige
login do corretor. Os modos `exemplo` e `local` continuam disponíveis apenas
para desenvolvimento ou demonstração sem chaves.

---

## 2. Arquitetura (e por que não é a VM da Oracle)

| Camada | Onde | Custo |
|---|---|---|
| Site | HTML/CSS/JS puro, GitHub Pages ou Vercel | R$ 0 |
| Banco, login, fotos, vídeos | Supabase free | R$ 0 |
| Banco **enquanto não há Supabase** | IndexedDB do navegador (`js/local.js`) | R$ 0 |
| Mapa | Leaflet + OpenStreetMap (sem chave de API) | R$ 0 |
| Agente | plataforma Streamlit que já existe na raiz | R$ 0 |

A VM da Oracle continua só com o `leadiot-bot` e o `leadiot-webhook`, que fazem
apenas conexão de saída e por isso não precisam de porta aberta. Botar o site
do seu pai lá significaria abrir 80/443, comprar domínio só pra ter HTTPS,
cuidar de backup e depender de um IP efêmero. Não vale.

**Sobre o "grátis pra sempre":** ninguém garante. O que vale é que o custo de
sair é quase zero, porque é Postgres puro. `pg_dump` + baixar o bucket e você
move pra Neon, Railway ou a própria VM. Não há formato proprietário no meio.

Limites do Free hoje: 500 MB de banco, **1 GB de arquivos (o gargalo real)**,
5 GB de tráfego/mês, 2 projetos. Com foto comprimida a ~200 KB dá uns 5.000
arquivos, ou ~400 imóveis com 12 fotos. Pro é US$ 25/mês.

⚠️ **Vídeo é o que estoura esse 1 GB.** Um tour de celular de 1 minuto tem uns
50 MB: vinte vídeos e o espaço do catálogo inteiro acabou. Por isso o painel
oferece os dois caminhos lado a lado, e **o preferido é colar o link** do
YouTube ou do Instagram, que não gasta armazenamento nenhum. Upload de arquivo
está barrado em 50 MB na nuvem (e em 200 MB no modo local, onde o teto é a
folga do próprio navegador).

---

## 3. Colocar no ar de verdade (30 min)

> **Só isto publica.** O modo local grava a carteira dentro do seu navegador:
> serve pra montar o catálogo e mostrar na tela pro seu pai, mas quem abrir o
> endereço do site pela internet **não vê nada disso**. Antes de fazer os
> passos abaixo, exporte a carteira na aba **Backup** do painel.

1. **Criar o projeto** em supabase.com (free, sem cartão). Região São Paulo.
2. **Rodar o schema**: SQL Editor > New query > cole `supabase/schema.sql`
   inteiro > Run. É idempotente, pode rodar de novo.
3. **Criar o usuário do seu pai**: Authentication > Users > Add user, com
   e-mail e senha.
4. **Promover ele a corretor**: descomente o último bloco do `schema.sql`,
   troque o e-mail e rode só esse bloco.
   ⚠️ **Enquanto não existir ninguém em `public.corretores`, NINGUÉM escreve
   nada.** É assim de propósito: a permissão é "estar na tabela corretores",
   não "estar logado".
5. **Preencher `js/config.js`**: `supabaseUrl` e `supabaseAnonKey` (Project
   Settings > API), mais WhatsApp, Instagram, CRECI e endereço.
6. **Manter acordado**: projeto free **pausa depois de 7 dias sem request**.
   Duplique o job do `.github/workflows/keep-alive.yml` (commit `05d72ee`)
   apontando pra `https://SEU-PROJETO.supabase.co/rest/v1/catalogo?limit=1`
   com o header `apikey`.
7. **Publicar**: subir a pasta como repo e ligar no GitHub Pages ou Vercel.
   O domínio `.com.br` que ele já tem aponta depois, é config de DNS.

---

## 4. O que está pronto e testado

- ✅ **Logo vetorizada** em `marca.svg`, redesenhada a partir da arte do seu pai
  (`IMG-20251121-WA0000.jpg`): anéis dourados, telhado, monograma AH e a chave.
  Ela é a marca do cabeçalho e do rodapé das três páginas, e o `favicon.svg` é
  uma versão simplificada dela pra sobreviver a 16px.
- ✅ **Abertura**: na primeira visita da aba, a logo se desenha do zero (anel →
  letras → telhado → chave), o nome entra e embaixo aparece a assinatura
  *Alejandro Hernandez · Corretor de Imóveis · CRECI-CE 28277*, do jeito que
  está impressa na arte. Depois a cortina sai. Uma vez por sessão, e se
  destrava sozinha mesmo sem JS. **Com movimento reduzido ela continua
  existindo**, só que a marca aparece inteira num fade de 1,5s em vez de se
  desenhar traço a traço (§6).
- ✅ **Tema único claro.** O modo escuro foi removido em 08/ago: nele o vinho
  da marca precisava ser clareado até `#cb4d52`, que é um salmão e não a cor da
  logo. Detalhe e a regra travada no topo de `css/tokens.css`.
- ✅ **Painel funcionando sem Supabase** (`js/local.js` + `js/repo.js`):
  cadastro, edição, exclusão, upload de fotos com compressão, upload de vídeo,
  link de vídeo, ordem das fotos por setas, contatos recebidos e backup
  exportar/importar. Testado ponta a ponta: cadastrar → recarregar → reordenar →
  remover mídia → salvar → conferir que persistiu → excluir.
- ✅ **Vídeos** no anúncio: arquivo toca no player nativo; link de
  YouTube/Vimeo vira capa clicável que só carrega o player no clique;
  Instagram e Drive viram um cartão que abre lá. O cartão do catálogo ganha o
  selo "Vídeo".
- ✅ Landing com hero parallax, título revelado palavra a palavra, barra de
  progresso da página, seção presa com zoom no scroll, linha do tempo scrubada
  com as etapas acendendo, botões magnéticos e varredura dourada nos cartões.
  Testado nos dois temas (claro e escuro) e em 390px de largura.
- ✅ Catálogo com filtro de finalidade, tipo, bairro e teto de preço, com
  paginação, esqueleto de carregamento, estado vazio e estado de erro.
- ✅ Página do imóvel com galeria, ficha, mapa Leaflet e botão de WhatsApp que
  já vai com "código 127" escrito na mensagem.
- ✅ Schema com RLS, bucket de fotos, RPC `registrar_lead` e `buscar_imoveis`.
- ✅ Agente `ah_imobiliaria` no `agents.yaml` + ferramenta `buscar_imoveis` em
  `core/tools.py` (import e schema validados).

## 5. O que NÃO foi testado (seja honesto consigo mesmo aqui)

- ❌ **Todo o caminho da NUVEM.** Login, upload pro Storage, as tabelas `fotos`
  e `videos`, o `schema.sql` inteiro: nada disso rodou contra um Supabase de
  verdade, porque o projeto ainda não existe. O que foi testado ponta a ponta
  é o **modo local**. Testar a nuvem é o primeiro passo depois do §3.
- ❌ **As policies de RLS na prática.** Depois de publicar, abra o site numa
  aba anônima e tente editar um imóvel pela API. Tem que dar 401/403. Se
  passar, a policy está errada e qualquer visitante mexe na carteira.
- ❌ **O agente conversando com o catálogo real.** Só o import foi validado.
  E atenção: o agente lê o **Supabase**, então enquanto a carteira estiver só
  no modo local ele não enxerga imóvel nenhum.
- ❌ **Vídeo grande de verdade.** O teste subiu um arquivo de 53 KB. O limite
  de 50 MB e a barra de progresso funcionam no código, mas ninguém arrastou um
  MP4 de celular ainda.

---

## 6. Armadilhas já pagas (não repetir)

- **`.leaflet-container` sobrescreve altura.** O Leaflet aplica essa classe no
  próprio elemento do mapa. Declarar `height` nela ganha do `height: 22rem` de
  `.mapa` e o mapa colapsa pra zero. Já corrigido em `css/imovel.css`.
- **`[hidden]` perde pra qualquer classe com `display` próprio.** `.btn` é
  `inline-flex`, então `botao.hidden = true` não escondia nada. Resolvido com
  `[hidden] { display: none !important }` em `css/site.css`.
- **Foto no hero dimensionada pela largura estoura o primeiro olhar.** Numa
  coluna de 600px, `aspect-ratio: 4/5` vira 750px de altura e empurra o CTA
  pra fora da tela. A altura é que manda (`height: min(66dvh, 38rem)`).
- **Mapa criado com o container escondido nasce cinza.** O admin chama
  `invalidateSize()` depois de mostrar o formulário.
- **Foto de celular derruba o plano free.** Doze fotos cruas são ~60 MB e o
  1 GB acaba em três imóveis. O admin comprime pra WebP 1600px (~200 KB) no
  navegador antes de subir, e o bucket tem teto de 3 MB como rede de segurança.
- **HEIC do iPhone não abre no `createImageBitmap`.** O admin devolve uma
  mensagem explicando como mudar a câmera pra "Mais compatível".
- **Google Maps exige cartão cadastrado hoje.** Por isso Leaflet + OSM.
- **Seu PC reporta `prefers-reduced-motion: reduce`** (animação do Windows
  desligada). Você vê a versão sem animação e acha que não ficou pronto. Para
  o efeito cheio, ligue as animações do Windows.
  ⚠️ **Foi exatamente isso que fez a abertura "não existir" pra você**: ela era
  condicionada a `podeAnimar`, então no seu PC nunca aparecia. Corrigido em
  08/ago — a abertura entra sempre, e o movimento reduzido só troca o "traço se
  desenhando" por um fade. **Não voltar a condicionar a abertura inteira ao
  reduced-motion**; a regra certa é trocar o tipo de animação, não sumir com ela.
- **`*{animation-duration:.01ms!important}` engole animação nova.** O bloco de
  movimento reduzido no fim do `site.css` zera TUDO. A abertura calma só toca
  porque cada regra dela repete o `!important`. Animação nova que precise rodar
  em movimento reduzido tem que fazer o mesmo.
- **`@keyframes` referenciado por regra dentro de media query fica fora dela.**
  O `ab-calma` está declarado no nível de cima de propósito.
- **Gradiente em `objectBoundingBox` some em traço reto.** A haste da chave é
  uma linha vertical: a caixa dela tem largura zero, o gradiente degenera e o
  traço não pinta nada. Por isso o `marca.svg` usa `gradientUnits="userSpaceOnUse"`.
- **A abertura só volta a aparecer limpando o `sessionStorage`.** Ela grava
  `ah-abertura=1`. Para revê-la, aba anônima ou `sessionStorage.clear()` no
  console. Não adianta dar F5.
- **O tempo da abertura mora em TRÊS lugares e eles têm que bater**: o atraso
  do `@keyframes cortina` no `site.css` (2,45s), o fim da assinatura
  (1,85s + 0,5s) e o `FIM_DA_ABERTURA` no `js/motion.js` (2,7s). Se o hero
  começar a animar cedo demais, ele anima escondido atrás da cortina e ninguém
  vê a entrada.
- **Screenshot mente sobre o tempo da animação.** Tirar print custa 100-300ms,
  então uma sequência "espera 400, print, espera 500, print" não fotografa os
  400ms e os 900ms — fotografa bem depois. Achei que a abertura calma estava
  quebrada por causa disso. Para conferir tempo, ler
  `elemento.getAnimations()[0].effect.getTiming()`, que dá o número exato.
- **Miniatura da galeria com `1fr` vira painel.** `grid-auto-columns:
  minmax(5.5rem, 1fr)` fazia duas fotos gerarem duas miniaturas de meia tela,
  maiores que a foto principal. O teto agora é fixo (`8.5rem`).
- **IndexedDB fecha a transação sozinho quando a fila esvazia.** Um `await` de
  coisa externa (`fetch`, `FileReader`) no meio de uma transação a mata. Por
  isso o `importar()` converte todo o base64 ANTES de abrir a transação.
- **`URL.createObjectURL` vaza.** Cada chamada cria um endereço novo que só
  morre no `revoke` ou no fim da aba, e o catálogo redesenha os cartões a cada
  filtro. Por isso `local.enderecoDe()` guarda um cache por id de mídia.
- **Vídeo do YouTube não entra como iframe na carga da página.** Vira capa
  clicável (`.video--capa`) e o player só monta no clique. Iframe do YouTube na
  carga traz centenas de KB e rastreadores, e a maioria das visitas nem aperta
  o play.
- **O Instagram não deixa embutir post sem a API oficial.** Link de Instagram
  vira um cartão que abre lá, de propósito — não tente montar player.
- **A geometria da marca está em dois lugares.** `marca.svg` e o bloco
  `.abertura` do `index.html`. O segundo precisa de uma classe por traço pra
  ser desenhado na ordem; um `<use>` não deixaria animar peça por peça. Mudou
  a logo, muda nos dois.
- **O WhatsApp tem 8 dígitos depois do DDD e ESTÁ CERTO.** `558599928999`
  parece erro de digitação, porque celular no Ceará tem 9 desde 2016. O dono
  confirmou. Não "consertar" pra `5585999928999`. O `wa.me` monta o link nos
  dois formatos, então testar o link não distingue — só perguntando.
- **`--altura-faixa` também vale no mobile.** A faixa de demonstração quebra em
  duas linhas em tela estreita; se o `padding` do hero no `@media` não somar
  essa variável, o `<h1>` passa por baixo do cabeçalho.

---

## 7. Pendências

1. **Endereço e e-mail estão vazios** no `config.js` de propósito — ele não
   publicou nenhum dos dois. O site esconde a linha sozinho, sem buraco no
   layout. Preencher quando souber; não inventar.
2. ~~**Nome na marca.**~~ Resolvido em 08/ago: *Alejandro Hernandez · Corretor
   de Imóveis · CRECI-CE 28277* agora assina a abertura, e o CRECI já estava no
   rodapé. Se ele quiser o nome também no cabeçalho, é decisão dele.
3. **A foto de fundo da seção "cobertura" ainda é um placeholder do
   picsum.photos.** As duas fotos do hero agora vêm automaticamente das capas
   dos imóveis publicados e marcados como destaque no painel.
4. **Cidade e UF padrão** estão em Fortaleza/CE. Conferir se é a praça dele.
5. Textos de depoimento são inventados. Trocar por depoimento real antes de
   mostrar pra qualquer cliente.
6. Do post original faltam: follow-up automático, carrossel de Instagram e
   integração com portais. O schema já tem `leads.proximo_contato` e a tabela
   `visitas` preparados pro follow-up.

---

## 8. Mapa dos arquivos

```
index.html          landing + catálogo (+ a abertura animada, no topo do body)
imovel.html         detalhe (?cod=127) — fotos, vídeos, ficha, mapa
admin.html          painel do corretor
marca.svg           ⭐ a logo. Usada por <img> no cabeçalho e no rodapé.
favicon.svg         a mesma marca, simplificada pra 16px
css/tokens.css      ⭐ cor, tipo, raio, sombra. Editar aqui. TEMA CLARO ÚNICO.
css/site.css        folha principal (+ a abertura, no fim)
css/imovel.css      detalhe + player de vídeo
css/admin.css       painel
js/config.js        ⭐ chaves do Supabase e contatos. Editar aqui.
js/demo.js          carteira de exemplo, some no 1º cadastro
js/local.js         🆕 banco no navegador (IndexedDB) + exportar/importar
js/dados.js         única API de LEITURA do site (nuvem | local | exemplo)
js/repo.js          🆕 única API de ESCRITA do painel (nuvem | local)
js/ui.js            cartão, esqueleto, aviso, máscara, leitura de link de vídeo
js/motion.js        GSAP: parallax, pin, scrub, revelação
js/app.js           home
js/imovel.js        detalhe + Leaflet + vídeos
js/admin.js         só tela: formulário, fotos, vídeos, mapa, backup
supabase/schema.sql ⭐ rodar no SQL Editor (tem a tabela `videos` agora)
```

**Quem mexe em quê:** o `admin.js` não sabe se está gravando no navegador ou
no Supabase — quem sabe é o `repo.js`. Se você for adicionar um campo novo ao
imóvel, mexe no `admin.html` (o campo), no `admin.js` (`coletar()`) e no
`schema.sql`. Se for adicionar um tipo novo de mídia, o lugar é o `repo.js` e
o `local.js`.

Na raiz do projeto: agente `ah_imobiliaria` em `agents.yaml`, ferramenta
`buscar_imoveis` em `core/tools.py`.
