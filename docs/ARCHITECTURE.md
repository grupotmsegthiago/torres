# Arquitetura — Torres

> **NORMA VIGENTE:** a Constituição e o Framework obrigatórios estão em [`docs/governanca/`](./governanca/README.md).
> Este arquivo permanece como **visão técnica complementar**. Em conflito, prevalece `docs/governanca/` (precedência: Segurança → Integridade financeira → Arquitetura Oficial → Framework).

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 18 + Vite 7 + wouter + TanStack Query + Tailwind |
| Backend | Express 5 (Node) |
| Dados | Supabase Postgres + Drizzle ORM + `@supabase/supabase-js` |
| Auth | Supabase Auth (anon no browser; service role só no server) |
| Deploy | Vercel (`api/index.ts` + `dist/public` + Cron HTTP) |
| Local | `npm run dev` → `server/index.ts` |

## Bootstrap

```text
Local:  dotenv → server/index.ts → Express listen :5000 + crons in-process
Vercel: api/index.ts → serverless-http → create-app.ts → mesmas rotas
        api/cron.ts → cron-buckets (CRON_SECRET)
```

## Fonte da verdade

- Persistência: Supabase projeto **TORRES**
- Cálculos financeiros oficiais: server (`billing-calc`, `boletim-totals`, snapshots)
- UI consome `/api/*` via `client/src/lib/queryClient.ts`
- Realtime: canais globais em `queryClient` + páginas chat/WhatsApp

## O que não usar

- Replit Deployments / Secrets / Domínios
- `SUPABASE_SERVICE_ROLE_KEY` no frontend
- Cálculo financeiro paralelo no browser como fonte oficial
