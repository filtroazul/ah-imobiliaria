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
supabase/    schema.sql, pra rodar no SQL Editor quando publicar
```

`RETOMAR.md` tem o resto: arquitetura, o passo a passo da publicação, o que já
foi testado, o que não foi, e as armadilhas técnicas que já custaram tempo.
