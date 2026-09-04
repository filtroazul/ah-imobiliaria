# Ah Imobiliária — SaaS do seu pai

> Site + catálogo + painel do corretor + agente de IA. Custo de infra: R$ 0.
> Pasta autocontida (regra §5 do RETOMADA.md da raiz): tudo aqui aponta pra
> dentro, nada referencia `../`. Pode virar repo próprio quando quiser.

---

## 04/SET - Meta Lead Ads ligado e validado ponta a ponta

Foi criada a integração própria para os formulários instantâneos dos anúncios:

```
Meta Lead Ads → GET/POST /meta/lead-ads → Graph API → Supabase → painel
```

Ela valida o desafio e a assinatura `X-Hub-Signature-256`, impede duplicação por
`leadgen_id`, persiste falhas para retry, traz a atribuição de campanha/conjunto/
anúncio/formulário e mostra tudo na ficha e no CSV. O consentimento de WhatsApp é
um campo separado e só vira `true` quando o formulário trouxer uma resposta
positiva explícita; presença de telefone não conta como consentimento.

Arquivos principais: `core/meta_leads.py`, `webhook_manychat.py`,
`supabase/migrations/20260903_meta_lead_ads.sql` e
`deploy/meta-lead-ads.md`. Os testes automatizados ficam em `tests/` na raiz.

Não gravar tokens, senha ou códigos de verificação em arquivo.

### Estado real em 04/set

| Passo | |
|---|---|
| 1. Migration no Supabase | ✅ aplicada e conferida |
| 2. Código na VM + `META_VERIFY_TOKEN` | ✅ no ar |
| 3. App + callback + objeto Page/`leadgen` | ✅ criado, validado e assinado |
| 4. App Secret + token da Página na VM | ✅ gravados direto no env protegido |
| 5. Permissões e assinatura da Página | ✅ conferidas pela Graph API |
| 6. Lead de teste no CRM | ✅ processado uma vez, sem duplicação |
| 7. Teste oficial do webhook no painel Meta | ✅ POST recebido com HTTP 200 |
| 8. Entrega de leads reais | ✅ app publicado e teste oficial processado |

Conferido contra o banco de verdade: 16 colunas novas em `leads`,
`meta_webhook_eventos` existindo, `relrowsecurity = true`, 1 policy, o índice
`leads_leadgen_id_unico` e o trigger de `atualizado_em`. **O RLS foi conferido
no `pg_class`, não pela resposta da API** — tabela nova responde `[]` pra
qualquer coisa, então `[]` não prova nada. Foi assim que `public.videos` ficou
aberta em agosto.

Na VM, o health responde `{"crm":true,"meta_leads":true,"ok":true}`. App Secret
e token da Página foram tratados apenas em memória e gravados diretamente em
`/etc/leadiot-webhook.env`, com backups e modo 600. O token tem
`leads_retrieval`, `pages_show_list`, `pages_read_engagement`,
`pages_manage_metadata` e `business_management`, limitado à Página AH Imóveis
e ao portfólio AH Hernandez.

Conferido pela Graph API: o app está na lista de `subscribed_apps` da Página,
com `leadgen`; a assinatura de objeto Page do app também tem `leadgen` ativo e
aponta para a Callback URL correta. O health está verde e o FazzLeads,
WhatsApp e campanhas não foram alterados.

### Chatbot testável sem encostar no WhatsApp

O card **Atendimento com IA** do painel ganhou o botão **Testar chatbot**. Ele
abre uma conversa que usa o agente real `ah_imobiliaria` e o catálogo, mas é
isolada por projeto:

- exige login válido de um corretor ativo;
- mantém o histórico somente na memória daquela aba;
- não cria lead nem grava em `lead_interacoes`;
- não chama WhatsApp, ManyChat ou FazzLeads;
- remove o resumo interno mesmo se o modelo esquecer os separadores.

No primeiro teste real, o modelo antigo `llama-3.3-70b-versatile` respondeu
404: a Groq o retirou do plano free/developer em 16/08/2026. O agente
`ah_imobiliaria` foi migrado para `openai/gpt-oss-120b`, com reservas apenas
em modelos ativos. Teste direto na VM concluído com resposta válida.

A rota é `POST /crm/testar-chat`. Ela serve para aprovar tom, perguntas e
qualificação antes de conectar um número. O atendimento automático no número
real ainda depende da conexão oficial com a WhatsApp Business Platform; até
essa migração, o FazzLeads continua responsável pelo WhatsApp atual.

⚠️ **A ordem importa e não é óbvia.** O painel da Meta valida a Callback URL na
hora em que você salva. Criar o app primeiro não adianta: sem o passo 2 o
endpoint responde 404 e a Meta recusa. Passos 1 e 2 antes do 3, sempre.

### Testes concluídos e publicação

O app **AH Imoveis Leads CRM** foi publicado em 04/set/2026. Antes da
publicação, a ferramenta oficial mantinha o app em `Pending`, porque apps não
publicados não recebem dados de produção. Foram cadastradas e publicadas as
URLs de política de privacidade, termos e exclusão de dados, além do domínio e
do ícone do app.

Para separar problema da Meta de problema nosso, o payload exato desse lead de
teste foi reenviado com uma assinatura HMAC real, calculada com o App Secret da
VM. Resultado: HTTP 200, consulta do lead na Graph API, um evento `processado`
sem erro e exatamente um lead `meta_ads` no Supabase. O mesmo payload foi
repetido e continuou existindo uma única linha, provando a idempotência por
`leadgen_id`.

Também foi disparado o teste oficial em **Webhooks → Page → leadgen → Teste**
por uma sessão limpa, sem o bloqueio de extensões do Brave. A Meta fez um POST
real para `/meta/lead-ads` e recebeu HTTP 200. O evento ficou `ignorado`, como
esperado, porque o payload oficial usa uma Page fictícia e o backend filtra
pela Page AH Imóveis. Esse resultado comprova a entrega Meta → ngrok → backend.

Depois da publicação, um lead novo foi gerado pela **Ferramenta de testes de
anúncios de lead** no formulário real da Página AH Imóveis. A Meta marcou
`Success` tanto para o app próprio quanto para o LeadConnector/FazzLeads. No
backend, o evento ficou `processado` na primeira tentativa, sem erro, com
Página e formulário corretos; no Supabase foi criada exatamente uma linha em
`leads`, com origem `meta_ads`. Isso valida o caminho completo Meta → webhook →
Graph API → Supabase → CRM. FazzLeads, WhatsApp e campanhas continuaram
intactos.

⚠️ A sessão atual está no Brave principal (`User Data\Default`), com depuração
local em `127.0.0.1:9222`. Ao automatizar, selecionar somente a aba cujo URL
contém o ID deste app; há outras abas pessoais abertas e elas não fazem parte
da tarefa.

### Por que os scripts de operação não estão no Git

`deploy/subir-meta-lead-ads.ps1` (sobe o código e liga o handshake) e
`deploy/ligar-meta-app.ps1` (pergunta App Secret e token da Página e grava
direto no `/etc/leadiot-webhook.env`) ficam **fora dos dois repositórios**:
carregam o IP da VM e o verify token, e o IP nunca esteve num repo público.
Eles moram só no PC. O passo a passo sem valor nenhum dentro está em
`deploy/meta-lead-ads.md`, na raiz do projeto.

O mesmo vale pra `MEMORIA-FAZZLEADS.md` e `tools/`, agora no `.gitignore`
desta pasta: **este repo é servido pelo GitHub Pages e pela Vercel**, então
todo arquivo aqui vira URL aberta, `.md` e `.py` inclusive.

---

## 20/AGO - ManyChat descartado. A caixa de entrada já estava pronta.

**A pendência do ManyChat foi encerrada, não adiada por preguiça.** Detalhe
completo e tela por tela no aviso do topo de `deploy/manychat-setup.md`.

O resumo: a ação **"Fazer uma consulta externa"** (o External Request, que é
quem chamaria a VM) é **PRO**. No plano grátis nenhuma ação fala com servidor
de fora. Uns R$ 80-90/mês por conta conectada.

### O que essa sessão revelou e vale mais que o ManyChat

**A caixa de entrada unificada já está construída, dos dois lados.** Isso não
estava documentado em lugar nenhum e quase virou compra desnecessária.

No banco (`supabase/schema.sql`, tabela `lead_interacoes`):

- o canal **`instagram` já está previsto**, junto com `whatsapp`, `site` e `portal`;
- `direcao` guarda **entrada e saída**, ou seja, os dois lados da conversa;
- **`external_id` com índice único por canal** — o mecanismo de não duplicar
  mensagem vinda de fora. Só existe em quem foi projetado pra canal externo;
- `lida_em` com índice próprio pras não lidas.

No painel: `js/crm.js:518` já desenha o **contador de não lidas** no card do
lead, e `js/crm.js:745` já renderiza a **conversa inteira** dentro da ficha.

No servidor: `core/crm.py` já tem `registrar_entrada`, `registrar_saida`,
`resposta_por_external_id` e `historico_do_lead`. E o corpo que o
`manychat-setup.md` manda pro endpoint já leva `"origem": "instagram"`.

Ou seja, a cadeia é:

```
[ ??? ] → POST /manychat/ah_imobiliaria → core/crm.py → lead_interacoes → painel
   ↑
   o único buraco da história inteira
```

**E esse buraco é burocrático, não técnico.** Qualquer ferramenta que leia DM do
Instagram precisa de permissão da Meta, liberada só depois de Revisão do App. O
ManyChat consegue porque já é provedor aprovado. Zapier, Make e n8n esbarram no
mesmo muro. **Os R$ 90/mês compram a aprovação da Meta, não código** — o código
já é seu.

### A decisão: dois lugares, cada um no que é bom

| | Meta Business Suite (grátis) | Este painel |
|---|---|---|
| Direct, Messenger, comentários | ✅ | ❌ |
| Chat do site com IA que conhece os 7 imóveis | ❌ | ✅ |
| Funil com etapas, conversão, campos do lead | ❌ só etiqueta | ✅ |
| Resposta automática | texto fixo | IA que consulta o catálogo |

**Business Suite é a portaria** (primeiro contato, curioso, barulho). **O painel
é quem já entrou.** Lead do site cai sozinho aqui; Direct que esquentou, o
corretor promove no botão "Novo lead", que já existe. É como imobiliária de
verdade trabalha.

Custo: R$ 0. Sem mensalidade, sem Revisão de App, sem cano pra construir.

⚠️ **Em imóvel, resposta humana converte melhor que bot.** Quem pergunta sobre
um apartamento de R$ 389 mil quer falar com gente. A IA do site é ótima pra
filtrar quem está só olhando; no Direct, um bot pode esfriar lead quente.

### O plano B é melhor que o plano A, mas é pra depois

**Revisão do App da Meta uma vez, no nome da AIOTI:** o app aprovado atende
quantos clientes quiser, cada um conectando o próprio Instagram. Custo por
cliente **R$ 0 pra sempre**, contra R$ 90/mês por cliente se revendesse
ManyChat. A rota da Meta não é o plano pobre, **é o produto**.

Só depois do primeiro cliente pagante: a revisão pede política de privacidade
publicada, ícone, vídeo demonstrando o uso, e leva semanas.

### Fica pronto e não precisa refazer

Conta ManyChat criada e **@ah.imobiliaria conectada** ("AH Imóveis", plano FREE,
avatar com a logo certa). Se um dia retomar, a conexão está lá.

### Ação prática que ficou pendente pro dono

Botar o **link do site na bio do @ah.imobiliaria** e nos stories. É o que enche
o funil hoje, de graça, pelo canal que já funciona.

---

## 19/AGO - Painel redesenhado e 4 defeitos corrigidos

Passada de design em cima do painel inteiro, preservando a identidade travada
em `css/tokens.css`: vinho e dourado, tema claro único, raio 18/12/pílula.
Nenhuma cor nova entrou.

O que mudou no visual:

- escala tipográfica própria do painel (`--p-numero` a `--p-nano`): o número do
  KPI virou o herói da célula, com algarismo tabular e rótulo em caixa alta;
- KPI agora compara com a janela anterior de mesmo tamanho ("+9", "estável").
  Vinho só quando a notícia é ruim, que é a mesma semântica de atenção que o
  card atrasado já usava;
- gráfico de entrada virou área com curva suave, grade, eixo e balão próprio no
  hover/foco. As barras finas com o número em cima saíram: em série de contagem
  baixa o formato informa, o valor por coluna era ruído;
- abas viraram controle segmentado; funil ganhou trilho por etapa com o vinho
  saturando do "Novos" até o "Fechados", máscara nas bordas avisando que há
  coluna fora da tela, e colunas de altura igual (alvo de soltura maior);
- card de lead ganhou monograma, nome sem corte e atalho de WhatsApp;
- ficha do lead: 18 campos soltos viraram três grupos ("Quem é", "O que
  procura", "Negociação");
- movimento curto e motivado, todo dentro de `prefers-reduced-motion:
  no-preference`. Sem laço infinito e sem número contando de zero.

Quatro defeitos reais achados e corrigidos no caminho:

1. **Modais nasciam no canto superior esquerdo.** O `* { margin: 0 }` do
   `site.css` atropelava o `margin: auto` que o navegador usa pra centralizar
   `<dialog>` aberto por `showModal()`. Passava despercebido na ficha, que é
   quase do tamanho da tela; no "Novo lead" era gritante. Corrigido com
   `dialog:modal { margin: auto }`.
2. **A grade da ficha caía pra uma coluna só** por 9 pixels: a coluna dá 519px
   úteis e `minmax(16rem, 1fr)` pedia 528px pras duas. Além disso
   `grid-column: 1 / -1` do `.campo--largo` não funciona com `repeat(auto-fit)`,
   porque com contagem indefinida a linha `-1` não resolve. Virou grade de duas
   colunas explícitas.
3. **O eixo do gráfico mentia**: com pico 3 a linha do meio valia 1,5 e o rótulo
   escrevia "2". O teto agora arredonda pra número par.
4. **Comparação de conversão em amostra minúscula.** 1 lead fechado virava
   "100%", e a queda pro período seguinte aparecia como tombo de 100 pontos que
   nunca existiu. Abaixo de 3 leads na janela anterior o painel não compara. E
   diferença entre porcentagens agora é rotulada em p.p., não em %.

Conferido em produção em 19/08: backend responde `{"agente":"aioti","crm":true,
"ok":true}`; a rota `/manychat/ah_imobiliaria` existe e recusa sem o segredo
(401); as tabelas `leads`, `lead_interacoes`, `visitas` e `configuracoes_ia`
respondem e devolvem vazio pro visitante anônimo (RLS de pé); 7 imóveis
publicados no catálogo.

Testado no navegador em 1440px e 390px, modo local, com 13 leads de mentira:
funil arrastado entre etapas, ficha aberta, balão do gráfico, modal de novo
lead, console limpo. **O caminho da nuvem foi verificado só até a tela de
login** — carrega sem erro, mas não entrei na conta.

Pendência externa continua sendo uma só: o fluxo do ManyChat.
*(Superado em 20/08 — ver a seção acima. O ManyChat foi descartado e a pendência
virou uma só, não técnica: botar o link do site na bio do Instagram.)*

### Onde este projeto é publicado (dois lugares, não um)

Conferido em 19/08 batendo as duas URLs: o mesmo repo
`filtroazul/ah-imobiliaria` é servido por **Vercel E GitHub Pages ao mesmo
tempo**, e os dois estavam byte a byte iguais.

- `https://ah-imobiliaria.vercel.app/admin.html` → HTTP 200
- `https://filtroazul.github.io/ah-imobiliaria/admin.html` → HTTP 200

Um `git push origin main` atualiza os dois. Vale registrar porque a
documentação estava pela metade dos dois lados: este arquivo afirmava só
"GitHub Pages" e a memória do assistente afirmava só "Vercel", e cada um dos
dois, sozinho, levava a concluir que o outro host estava desligado. O único
workflow em `.github/workflows/` é o `keep-supabase-awake.yml`; não existe
workflow de deploy, então o Pages publica direto da branch.

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
4. O painel foi publicado pelo commit `2c05645` e validado com login real:
   6 indicadores, 7 etapas, modo da IA e nenhuma falha de rede.
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
