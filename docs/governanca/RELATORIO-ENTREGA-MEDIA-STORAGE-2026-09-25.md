# Relatório de Entrega — Mídia base64 → Supabase Storage

**Data:** 2026-09-25  
**Branch:** `cursor/media-storage-migration-117f`  
**Pedido:** melhorar saúde do banco (espaço) a partir do advisor Supabase.

## Declarações obrigatórias

| Campo | Valor |
|-------|-------|
| Domínio dono | Fatos de campo (`mission_photos`, `vehicle_fueling`) + RH (`employee_documents`) |
| Tipo do dado | **FATO** (evidência/arquivo); path no Postgres = referência; blob no Storage = conteúdo |
| Reutilização | Estendido `mission-fotos` / padrão `vehicle-docs` / `comprovantes-pagamento`. Novo núcleo `private-blob-storage.ts` compartilhado — **não** segundo motor nem nova tabela |
| Arquivos afetados | `server/lib/private-blob-storage.ts`, `mission-photos.ts`, `fueling-photo-storage.ts`, `employee-doc-storage.ts`, `migrate-media-to-storage.ts`; writers em `mission.ts`, `mobile.ts`, `fleet.ts`, `hr.ts`; readers (galeria, laudo, PDF, WhatsApp, AI); `scripts/migrate-media-to-storage.ts` |
| Risco | Médio — dual-read cobre legado; fail-safe grava base64 se upload falhar; migração histórica é lote idempotente |
| Testes | Unitários `private-blob-storage.test.ts`; smoke dos helpers |
| Rollback | Reverter deploy; blobs no Storage permanecem; colunas com path continuam legíveis via dual-read se o código antigo não entender path (UI pode quebrar fotos novas até rollback completo) |

## O que mudou

1. **Novos uploads** de fotos de missão, abastecimento e docs de RH gravam **caminho** no Postgres e arquivo no Storage (buckets privados `mission-fotos`, `fueling-fotos`, `employee-docs`).
2. **Leitura dual**: data URI legado, path Storage (signed URL / download) e placeholders (`[ajuste-manual]`).
3. **Histórico**: `npx tsx scripts/migrate-media-to-storage.ts --limit=25` (repetir até migrated≈0).

## O que NÃO mudou

- Regras de faturamento / KM / boletim / Balanço.
- Schema de tabelas (sem migration destrutiva).
- Deploy automático (não publicado).

## Próximo passo

1. Merge → validar em Preview.  
2. Rodar script de migração em lotes no projeto Supabase.  
3. Monitorar tamanho de `mission_photos` / `vehicle_fueling` / `employee_documents`.
