# Relatório de Entrega — Migração em lotes base64 → Storage (+ custos/selfies)

**Data:** 2026-09-28  
**Branch:** `cursor/media-storage-migrate-batches-0b1f`  
**Pedido:** aliviar peso do banco sem perder fotos/evidências.

## Declarações obrigatórias

| Campo | Valor |
|-------|-------|
| Domínio dono | Fatos de campo (`mission_photos`, `vehicle_fueling`, `mission_costs`) + RH (`employee_documents`) + Auth evidência (`login_selfies`) |
| Tipo do dado | **FATO** (evidência); path no Postgres = referência; blob no Storage = conteúdo |
| Reutilização | Estendido `migrate-media-to-storage` + `private-blob-storage` / `mission-photos` / fueling / employee-docs. Novo: `login-selfie-storage.ts` no mesmo padrão. Sem segunda tabela. |
| Arquivos afetados | `migrate-media-to-storage.ts`, CLI, `login-selfie-storage.ts`, `routes.ts` (selfie + admin API), `cron-jobs`/`cron-buckets`, `admin/database.tsx`, testes |
| Risco | Médio — lotes pequenos; dual-read; fail-safe mantém base64 se upload falhar; cron só 03–04 BRT |
| Testes | `migrate-media-to-storage.test.ts`, `login-selfie-storage.test.ts` |
| Rollback | Reverter deploy; blobs no Storage permanecem; colunas com path legíveis via dual-read |

## O que mudou

1. Migração lista **só IDs** com `like 'data:%'` (cobre histórico, não só os recentes).
2. Inclui **`mission_costs`** e **`login_selfies`**.
3. Selfies novas gravam no bucket `login-selfies`; GET admin resolve signed URL.
4. Admin: `POST /api/admin/migrate-media` + botão na tela Banco.
5. Cron noturno 03:20–04:50 BRT (a cada 10 min), `limitPerTable=15`.

## O que NÃO mudou

- Regras de faturamento / KM / boletim.
- Sem apagar evidências.
- Deploy automático não feito neste passo.

## Próximo passo operacional

1. Publicar esta branch (ou merge → `publicar.ps1`).
2. Em **Admin → Banco**: clicar várias vezes em **Migrar fotos → Storage** até migrated≈0.
3. Depois: **Compactar** (`VACUUM FULL`) nas tabelas pesadas (`mission_photos`, `vehicle_fueling`, `mission_costs`, `employee_documents`, `login_selfies`) — preferência madrugada.
4. Alternativa CLI (com secrets): `npx tsx scripts/migrate-media-to-storage.ts --limit=40`
