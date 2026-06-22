---
name: Dep ESM-only quebra no bundle de produção
description: Pacotes ESM puros (p-limit v7, etc.) funcionam no dev (tsx) mas viram "(0,X.default) is not a function" no bundle CJS de prod (esbuild)
---

Pacote ESM-only importado como `import x from "pkg"; x(...)` roda no DEV (tsx
faz interop) mas, no bundle CJS de produção (esbuild → `dist/index.cjs`), o
default import vira `undefined` em runtime: `TypeError: (0 , rH.default) is not a
function`. O erro NÃO aparece no log de dev — só em produção (fetch_deployment_logs).

Caso real: `p-limit` v7.3.0 no `/api/fixed-costs/rh-summary` → 500 em prod →
botão "Atualizar agora" do Balanço Gerencial dava toast "Erro ao atualizar".

**Why:** p-limit v4+ é ESM puro; o build server bundla pra CJS e o
`export default` não é reexposto como função chamável.

**How to apply:**
- Bug "funciona no dev, quebra publicado" com `(0 , X.default) is not a function`
  → suspeitar de dependência ESM-only no bundle de servidor. Confirmar nos
  deployment logs (não nos logs de dev).
- Para utilitários pequenos (limitador de concorrência, retry simples), preferir
  implementação inline própria em vez da dep ESM. Ex.: `server/lib/create-limit.ts`
  substitui `p-limit` (createLimit preserva ordem via Promise.all(map) + cap).
- Testar a correção SEMPRE rodando `npx tsx script/build.ts` e conferindo que a
  dep saiu do bundle (`rg -c "pkg" dist/index.cjs`); o teste de dev não pega.
- `server/replit_integrations/batch/utils.ts` também usa p-limit/p-retry mas é
  código morto (ninguém importa) — não está no caminho de prod.
