# Revisão — `gestor-dados.tsx` (alterações locais preservadas)

**Status:** arquivo **não revertido**; diff local mantido na branch `dev`.

## Intenção funcional

- UI tema escuro (mockup diretoria 28/07/2026).
- Selos **Certificado / Em Conferência / Divergência** por KPI.
- Memória de cálculo (`Calculator` → dialog).
- Continua consumindo `buildTotaisBalanco` / `buildMissoesPeriodo` / `buildEficiencia` de `@/lib/balanco-calc`.
- Endpoints oficiais: `/api/financial/dashboard?cached=1`, `/api/operational-grid?cached=1`, `/api/fixed-costs/rh-summary?cached=1`, `/api/gestor-dados/validacao`.

## Compatibilidade com fonte oficial

| Aspecto | Avaliação |
|---------|-----------|
| Cálculo paralelo inventado? | Não — usa `balanco-calc` + APIs server |
| Snapshots / `cached=1` | Preservados; refresh usa `force=1` explícito |
| Congelamento `fatCongelado` | Exibido como finalizado (selo) |
| Tipagem | Usa `any` em queries (pré-existente no padrão da página) |

## `escort-billing.tsx`

Página órfã (sem rota). Contém UI antiga de contratos/rotas escort; funcionalidade absorvida por faturas/clients. **Não religada** — evitar rota duplicada.

## Migration `timeclock_shifts_faces`

Não encontrada em `origin/main`, `origin/dev` nem histórico local. Schema Supabase possui `control_id_*`, `driver_shifts`, `employees` — equivalente operacional. Documentada como referência obsoleta.
