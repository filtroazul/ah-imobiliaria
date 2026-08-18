# Ah Imobiliária

Site, catálogo e painel do corretor **Alejandro Hernandez** (CRECI-CE 28277).
HTML, CSS e JavaScript puros — sem build, sem framework, sem dependência paga.

## Como rodar

```bash
python -m http.server 8720
```

Depois abra `http://127.0.0.1:8720/index.html`. Tem que ser por servidor: em
`file://` o navegador bloqueia `import` de módulo.

## Onde os imóveis ficam gravados

O site decide sozinho entre três estados:

| Estado | Quando | O que acontece |
|---|---|---|
| **exemplo** | sem Supabase e carteira vazia | mostra 9 imóveis fictícios, com faixa avisando |
| **local** | sem Supabase e ao menos 1 imóvel | a carteira real, gravada no navegador (IndexedDB) |
| **nuvem** | com as chaves em `js/config.js` | Supabase, com login e acessível de qualquer lugar |

⚠️ **O modo local não publica.** O que é cadastrado no painel fica dentro
daquele navegador; quem abrir o site pela internet vê a carteira de exemplo.
Para o catálogo ir ao ar de verdade é preciso ligar o Supabase — passo a passo
no `RETOMAR.md`, seção 3.

## Mapa dos arquivos

```
index.html   landing + catálogo (+ a abertura animada da marca)
imovel.html  página do imóvel: fotos, vídeos, ficha e mapa
admin.html   painel do corretor
js/local.js  banco no navegador + exportar/importar a carteira
js/dados.js  única API de leitura do site
js/repo.js   única API de escrita do painel (nuvem ou local)
js/crm.js    funil, estatísticas, ficha do lead, visitas e controles da IA
supabase/    schema.sql, pra rodar no SQL Editor quando publicar
```

## CRM de leads

A aba **Leads e funil** do painel reúne:

- indicadores de entrada, qualificação, visitas, conversão, tempo de resposta e
  valor potencial;
- exportação dos leads filtrados em CSV para Excel ou planilha;
- funil arrastável com sete etapas;
- busca por nome, telefone, bairro e interesse;
- ficha comercial, histórico de mensagens, notas internas e agenda de visitas;
- modo da IA global e pausa individual por lead;
- sugestão de resposta autenticada, sem expor a chave do modelo no navegador.

Em um banco que já existia antes do CRM, rode
`supabase/migrations/20260818_crm_funil.sql` no SQL Editor. A integração da IA
também precisa de `SUPABASE_SERVICE_ROLE_KEY` somente no servidor do webhook.

Resposta automática vale para conversas que chegam pelo endpoint do ManyChat.
Um lead criado apenas pelo formulário do site não abre sozinho uma conversa no
WhatsApp: nesse caso o painel sugere o texto e abre o contato para o corretor.

`RETOMAR.md` tem o resto: arquitetura, o passo a passo da publicação, o que já
foi testado, o que não foi, e as armadilhas técnicas que já custaram tempo.
