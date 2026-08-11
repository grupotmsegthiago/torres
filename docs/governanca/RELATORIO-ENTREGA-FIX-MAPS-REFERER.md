## Relatório de Entrega — Fix Google Maps (RefererNotAllowed)

**Data:** 2026-08-11  
**Branch:** `cursor/fix-google-maps-referer-f280`  
**Commit(s):** (este PR)  
**Ambiente validado:** [x] local (CDP contra produção)  [ ] preview  [ ] produção (após publish)  
**Publicou?** [x] Não

### Declaração de governança
- **Domínio dono:** Operação / Grid (satélite Google Maps — camada 0/11 apresentação)
- **Tipo do dado:** Satélite (Google Maps Platform) + apresentação; sem fato financeiro
- **Camada:** 0 satélite / 11 apresentação
- **Reutilização avaliada:** loader e mapa já existentes em `operational-grid.tsx`; redirect já prescrito em `DEPLOY.md`
- **Risco:** baixo (redirect de host + UX de erro; sem regra de faturamento)
- **Rollback:** reverter o PR / remover redirects novos no `vercel.json`

### Reutilização (D11 / P13)
- Busca realizada: `operational-grid.tsx`, `places-autocomplete.tsx`, `VITE_GOOGLE_MAPS_API_KEY`, `DEPLOY.md`, `vercel.json`
- Existente aproveitado: loader Maps do grid; chave `VITE_GOOGLE_MAPS_API_KEY`; política de domínio canônico do `DEPLOY.md`
- Algo novo criado? [x] Não (estendeu redirect/UX) — inviabilidade: N/A

### O que foi alterado
- Redirect permanente `torresseguranca.vercel.app` e host legado Vercel → `www.torresseguranca.com.br`
- Handler `gm_authFailure` com mensagem acionável no Grid Operacional
- Static Maps deixa de usar chave demo hardcoded e passa a usar `VITE_GOOGLE_MAPS_API_KEY`

### O que NÃO foi alterado
- Motor de faturamento, billing, boletim, ledger, RLS, webhooks
- Valor da chave Google (permanece na Vercel / Google Cloud)

### Arquivos modificados
- `vercel.json`
- `client/src/pages/admin/operational-grid.tsx`
- `docs/governanca/RELATORIO-ENTREGA-FIX-MAPS-REFERER.md`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| CDP Maps em `www.torresseguranca.com.br` | pass (`MAP_UI_OK`) |
| CDP Maps em `torresseguranca.vercel.app` | fail esperado (`RefererNotAllowedMapError`) — motivação do redirect |
| Static Maps API com chave do projeto | 403 “API is not activated” (pendência GCP, fora deste PR) |
| `python json.load(vercel.json)` | pass |

### Resultados (negócio)
Quem acessar pelo `.vercel.app` passa a ser redirecionado ao domínio oficial onde o mapa já autentica; se a chave ainda falhar, a UI explica o bloqueio em vez da tela genérica do Google.

### Regressões verificadas
- Domínio canônico continua servindo o mapa
- Sem mudança em APIs financeiras

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Backup / ponto de restauração
- Git revert do PR

### Deploy
- Healthcheck: após publish, abrir Grid em `www` e confirmar mapa; abrir `.vercel.app` e confirmar 308/301 → `www`
- URL/ambiente: produção (somente quando o proprietário pedir publicação)

### Evidências
- Console produção/vercel.app: `Google Maps JavaScript API error: RefererNotAllowedMapError`
- `www.torresseguranca.com.br`: mapa inicializa sem erro de auth

### Pendências
1. No Google Cloud Console, garantir referrers: `https://www.torresseguranca.com.br/*`, `https://torresseguranca.com.br/*` (e `https://*.vercel.app/*` só se quiser preview sem redirect)
2. Habilitar **Maps Static API** se quiser miniaturas staticmap (hoje retorna “API is not activated”)
3. Apex `torresseguranca.com.br` apresentou falha SSL neste ambiente — validar DNS/certificado na Vercel Domains
4. Publicar (`publicar.ps1` / merge) para o redirect valer em produção

### Gates G1–G16
- [x] N/A financeiro / atendidos para escopo de apresentação + deploy redirect

### Resumo executivo (3 linhas)
1. O mapa some por `RefererNotAllowedMapError` no host `torresseguranca.vercel.app`.
2. No domínio oficial `www.torresseguranca.com.br` a mesma chave funciona.
3. Este PR aplica o redirect já previsto no `DEPLOY.md` e melhora o diagnóstico na UI.
