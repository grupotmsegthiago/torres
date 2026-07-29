# Rollback — correção estrutural de cache Folha/RH

**Checkpoint base:** `dev@1a7db7b4`  
**Tag local:** `checkpoint/cache-estrutural-base-1a7db7b4`  
**Branch:** `cursor/cache-estrutural-folha-rh-7679`

## Como voltar (antes de merge em main)

```bash
git checkout dev
git reset --hard 1a7db7b4
# ou: git revert <merge-commit-do-PR>
# ou: git checkout checkpoint/cache-estrutural-base-1a7db7b4
```

## Arquivos tocados

| Arquivo | Ação no rollback |
|---------|------------------|
| `shared/cache-keys.ts` | remover |
| `shared/cache-keys.test.ts` | remover |
| `client/src/lib/cache-fetch.ts` | remover |
| `client/src/lib/queryClient.ts` | restaurar scopes sem `rhSummary` tipado |
| `client/src/pages/admin/balanco-gerencial.tsx` | restaurar v9 hardcoded + placeholder + SWR_3H |
| `client/src/pages/admin/employees.tsx` | remover staleTime:0 do salary-summary |
| `server/lib/swr-cache.ts` | remover validate/freshTtl/meta/fallback |
| `server/lib/swr-cache.test.ts` | restaurar expectativa FORCE=MISS |
| `server/lib/balanco-cache.ts` | bust prefixes manuais |
| `server/routes/fixed-costs.ts` | baseKey `rh-summary-v9` local |
| `server/routes/operational.ts` | sem freshTtlMs |
| `server/routes/escort.ts` | sem freshTtlMs |
| `tests/cache-folha-policy.test.ts` | remover |
| `.agents/memory/cache-estrutural-rollback.md` | este arquivo |

## Comportamento após rollback

- Volta invalidate prefixo do paliativo `1a7db7b4`
- Sem `validate=1` / banner de idade / metadados `_cacheMeta`
- Schema volta hardcoded como `v9` na tela
- `placeholderData` entre períodos volta a existir
- Sem migration de banco neste pacote
