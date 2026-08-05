# Variáveis de ambiente — Torres

> Este documento **nunca** contém valores. Apenas nomes, destinos e situação.

**Projeto Supabase confirmado:** `TORRES` (`erjhxwbutjyylxdthuuz`, us-east-1)  
**Deploy alvo:** Vercel (`torresseguranca.vercel.app`)  
**Edge Functions Supabase:** nenhuma no repositório — secrets de integração vão para a **Vercel**.

## Legenda

| Classificação | Significado |
|---------------|-------------|
| Pública | Pode ir ao browser (`VITE_*`) com RLS |
| Privada | Somente server / Vercel Functions |
| Obsoleta | Sem consumidor ativo comprovado |

| Situação | Significado |
|----------|-------------|
| Migrar | Enviar do `.env` local para Vercel |
| Preservar | Já necessária e em uso |
| Completar | Ausente no `.env` — preencher antes do prod |
| Remover | Exclusiva Replit / sem uso |

## Tabela

| Variável | Consumidor | Classificação | Destino | Ambientes | Situação |
|----------|------------|---------------|---------|-----------|----------|
| TZ | server boot | Privada (baixa) | Vercel/Local | Dev/Preview/Prod | Migrar |
| PORT | server listen | Local | Local | Development | Preservar local |
| NODE_ENV | build/runtime | Privada | Vercel/Local | todos | Migrar |
| PUBLIC_SITE_URL | leads, e-mails, SEO | Pública (URL) | Vercel/Local | todos | Migrar |
| SUPABASE_URL | `server/supabase.ts` | Privada* | Vercel/Local | todos | Migrar |
| SUPABASE_ANON_KEY | `server/supabase.ts` | Privada* | Vercel/Local | todos | Migrar |
| SUPABASE_SERVICE_ROLE_KEY | `server/supabase.ts` | Privada | Vercel/Local | todos | Migrar |
| SUPABASE_DATABASE_URL | storage/db-init | Privada | Vercel/Local | todos | Migrar |
| DATABASE_URL | pg-fallback/pool | Privada | Vercel/Local | todos | Migrar (espelho) |
| VITE_SUPABASE_URL | `client/src/lib/supabase.ts` | Pública | Vercel (build) | todos | Migrar |
| VITE_SUPABASE_ANON_KEY | `client/src/lib/supabase.ts` | Pública | Vercel (build) | todos | Migrar |
| SESSION_SECRET | auth/sessão | Privada | Vercel/Local | todos | Migrar |
| CONTROLID_ENC_KEY | Control iD crypto | Privada | Vercel/Local | todos | Migrar |
| CRON_SECRET | `api/cron.ts` | Privada | Vercel/Local | todos | Migrar |
| SMTP_* | e-mail | Privada | Vercel/Local | todos | Migrar |
| VITE_GOOGLE_MAPS_API_KEY | frontend maps | Pública | Vercel | todos | Migrar |
| GOOGLE_MAPS_API_KEY | `leads.ts` | Privada | Vercel/Local | todos | Migrar |
| ASAAS_* | `server/asaas.ts` | Privada | Vercel/Local | todos | Migrar |
| INTER_INTEGRATION_ENABLED | `server/lib/inter-integration.ts` | Privada | Vercel/Local | todos | Preservar (default off; só `true`/`1`/`yes`/`on` habilita) |
| INTER_* (CLIENT/SECRET/CONTA/CERT/AMBIENTE) | `server/services/inter` | Privada | Vercel/Local | todos | Obsoleta operacional — manter até PR4; não reativa sozinha |
| ZAPI_* | WhatsApp | Privada | Vercel/Local | todos | Migrar |
| OPENAI_API_KEY / AI_INTEGRATIONS_* | OCR/IA | Privada | Vercel/Local | todos | Migrar |
| APIBRASIL_* / RECEITAWS / WDAPI / BRASILAPI | consultas | Privada | Vercel/Local | todos | Migrar / Completar BRASILAPI |
| TRUCKSCONTROL_* | telemetria | Privada | Vercel/Local | todos | Migrar |
| SSX_* | câmeras | Privada | Vercel/Local | todos | Migrar |
| TICKETLOG_* | API auto 410 | Obsoleta API | — | — | Remover se não usar CSV legado |
| RHID_API_URL / RHID_EMAIL | docs / sync | Privada | Vercel/Local | todos | Migrar |
| DISABLE_LOCAL_FALLBACK | pg-fallback | Privada | Vercel/Local | todos | Migrar |
| REPL_ID / REPL_SLUG / REPL_OWNER / REPLIT_* | legado Replit | Obsoleta | — | — | Remover |
| VERCEL / VERCEL_URL | injetadas pela Vercel | Plataforma | Vercel | Preview/Prod | Preservar (auto) |

\* `SUPABASE_ANON_KEY` no backend é privada no escopo Vercel; o espelho público é só `VITE_SUPABASE_ANON_KEY`.

## Ausentes no `.env` atual (bloqueiam módulos)

| Variável | Impacto |
|----------|---------|
| INTER_INTEGRATION_ENABLED | Ausente = Inter desativado (comportamento desejado) |
| INTER_CLIENT_ID / SECRET / CONTA / CERT_* | Só relevantes se `INTER_INTEGRATION_ENABLED=true` (não recomendado) |
| BRASILAPI_TOKEN | Consultas que dependem dela |
| ZAPI_EXPECTED_PHONE | Guard de número (opcional) |
| TICKETLOG_* | Só se reativar integração |

## Como enviar à Vercel (sem revelar valores)

```powershell
npx vercel login
npx vercel link
npm run env:push-vercel
```

O script `scripts/push-env-vercel-safe.mjs` lista apenas nomes e **não imprime valores**. Não usa `--force` por padrão (não sobrescreve existentes).
