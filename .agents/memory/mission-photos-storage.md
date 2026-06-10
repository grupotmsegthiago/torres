---
name: Fotos de mission_updates no Supabase Storage
description: photo_url deixou de ser base64 inline e virou caminho de bucket privado; padrão de fallback, leitura e sweep pós-deploy.
---

# Fotos de mission_updates migradas pra Storage

`mission_updates.photo_url` antes guardava base64 inline (inflava o banco em ~3GB). Agora guarda só o **caminho** de um bucket Supabase Storage **privado** `mission-fotos`. Helper: `server/lib/mission-photos.ts` (`uploadMissionPhoto`, `signMissionPhoto`, `resolvePhotoForView`, `downloadMissionPhotoDataUri`, `isStoragePath`). Leitura via signed URL de 5min (igual comprovantes-pagamento). Escopo foi SÓ `mission_updates` (outras tabelas de foto ficaram para depois).

**Writers NUNCA perdem foto (fail-safe).** Os dois writers (`/api/mission/update`, `/api/mission/photo`) tentam subir pro storage; se o upload falhar (storage instável, bucket ainda não criado no boot), gravam o **base64 inline como fallback** em vez de nulo. Os readers tratam base64 legado e o sweep migra depois.
**Why:** fail-closed (bloquear a atualização) seria pior — agente em campo perderia a evidência da missão; fail-open silencioso (nulo) perde a foto. O fallback preserva a foto E não bloqueia o fluxo offline-resiliente.
**How to apply:** qualquer novo writer de foto deve seguir o mesmo padrão try-upload/catch-grava-base64. Nunca gravar nulo no catch.

**Readers aceitam os 3 formatos** (`data:`/`http(s)`/path): grid e galeria mascaram como `[has_photo]` e buscam a real em `/updates/:id/photo`; e-mail embute base64 via `downloadMissionPhotoDataUri` (signed URL expira, e-mail precisa ser auto-contido); WhatsApp/Z-API recebe signed URL; `has_photo` em operational.ts detecta qualquer valor não-vazio.

**Migração existente:** `.local/migrate_mission_photos.mts` é idempotente/resumível (checkpoint `.local/.mphotos_done.json`, lista de ids `.local/.mphotos_ids.json`). Caminho determinístico `${serviceOrderId}/mu_${id}.${ext}` (upsert, sem órfãos em reexecução). Conc ≤5 — **conc 16 derrubou o Supabase de PRODUÇÃO com 521 origin-down**. 6140 ids migrados, 0 falhas.

**Pendências do dono (fora do código):**
1. **Deploy:** produção (código antigo) continua gravando base64 inline até o deploy. Até lá, fotos novas são base64 (tratadas pelos readers).
2. **Sweep pós-deploy:** rodar a migração de novo após o deploy pra varrer a janela base64 criada entre o snapshot e o deploy (idempotente).
3. **VACUUM FULL mission_updates:** o espaço só é devolvido ao disco após VACUUM FULL — trava a tabela, rodar de madrugada. Manual pelo dono (ferramentas do agente não rodam DDL bloqueante longo).
