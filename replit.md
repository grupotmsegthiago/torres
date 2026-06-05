# Torres Vigilância Patrimonial

Acelera as operações de segurança patrimonial com gerenciamento integrado de ativos, pessoal, finanças e monitoramento em tempo real.

## Run & Operate

- **Run:** `npm run dev`
- **Build:** `npm run build` (roda `npm test` automaticamente via `prebuild`; build falha se algum teste falhar)
- **Test:** `npm test` — executa `tsx --test` sobre todos os arquivos `*.test.ts` / `*.test.mts` em `server/`, `shared/`, `tests/` e `.local/`. Suítes existentes incluem `server/lib/ticketlog-pedagio-csv.test.ts` (cruzamento TicketLog × OS, originalmente em `.local/test_ticketlog_pedagio.mts`). Novos testes devem usar o sufixo `.test.ts` ou `.test.mts`; scripts de debug pontuais em `.local/test_*.mts` (sem o sufixo `.test.`) continuam sendo one-offs e não são executados. O `prebuild` roda `npm test` automaticamente, então qualquer falha aborta o build/deploy.
- **Typecheck:** `npm run typecheck`
- **Codegen (Supabase types):** `npm run gen:supabase`
- **DB Push (Drizzle migrations):** `npm run db:push`

**Required Environment Variables:**
- `INTER_CLIENT_ID`, `INTER_CLIENT_SECRET`, `INTER_CONTA_CORRENTE`, `INTER_CERT_CRT`, `INTER_CERT_KEY`, `INTER_AMBIENTE` (for Banco Inter integration)
- `DATABASE_URL` (local PostgreSQL for fallback)
- `SUPABASE_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase connectivity)
- `ASAAS_API_KEY`, `ASAAS_API_URL` (for Asaas integration)
- `TICKETLOG_USER`, `TICKETLOG_PASS`, `TICKETLOG_ENV` (for TicketLog integration)
- `CONTROLID_ENC_KEY`, `SESSION_SECRET` (for Control iD integration)
- `SMTP_USER`, `SMTP_PASS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_BCC` (for email functionality)
- `OPENAI_API_KEY` (for OpenAI Vision OCR)
- `BRASILAPI_TOKEN` (for CPF lookup)
- `TRUCKSCONTROL_USER`, `TRUCKSCONTROL_PASS`, `TRUCKSCONTROL_URL` (for TrucksControl integration)

## Stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Express.js, TypeScript
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **ORM:** Drizzle ORM (for DDL/migrations only)
- **Validation:** Zod
- **Runtime:** Node.js (latest LTS)
- **UI Frameworks:** Radix UI, Headless UI, Framer Motion
- **Icons:** Lucide React, React Icons

## Where things live

- **Frontend Source:** `client/src/`
- **Backend Source:** `server/`
- **Shared Schemas (DB/API):** `shared/schema.ts`
- **DB Migrations (DDL):** `server/db-init.ts`
- **API Routes:** `server/routes.ts`
- **Supabase Utilities:** `server/supabase.ts`, `server/storage.ts`
- **Real-time Sync:** `client/src/lib/queryClient.ts`
- **Main CSS:** `client/src/index.css`
- **Tailwind Config:** `tailwind.config.cjs`
- **Service Worker:** `client/public/sw.js`
- **User Interface Components:** `client/src/components/`
- **Mobile-specific Pages:** `client/src/pages/mobile/`

## Architecture decisions

- **Supabase as Sole Database:** All data access for CRUD operations must exclusively use the Supabase REST API (`supabaseAdmin.from(...)`). Direct PostgreSQL access (`db.*` or raw SQL) is strictly forbidden for CRUD, reserved only for DDL migrations in `db-init.ts`.
- **Brazil Timezone Only:** The entire system operates in BRT (UTC-3). All timestamps, calculations, and displays are in BRT without UTC conversions, leveraging PostgreSQL's `SET timezone = 'America/Sao_Paulo'`.
- **Resilient Offline Mode (Agent App):** Field agents can operate offline, with actions queued in `localStorage` and flushed with exponential backoff upon network recovery, preventing data loss in intermittent connectivity.
- **Role-Based Access Control (RBAC):** Authentication is JWT-based via Supabase Auth. Authorization uses a `perfis_acesso` table for granular permissions, with `funcionario` roles strictly limited to `/mobile/*` routes and financial data hidden.
- **Frozen Financials:** After mission completion, critical financial metrics (`fat_calculado`, `custo_combustivel_alocado`, etc.) on `service_orders` are frozen to prevent discrepancies from dynamic recalculations, ensuring immutable historical data.

## Product

-   **Institutional Website & Internal Management System:** Landing page and comprehensive backend for operational, financial, and HR management.
-   **Real-time Operational Grid:** Live vehicle tracking, status monitoring, and integration with risk management, featuring geofencing and idle alerts.
-   **Mobile App for Field Agents:** Dedicated interface for mission workflows, data capture (photos, GPS), fueling, and incident reporting.
-   **Automated Billing & Financial Tracking:** Integrated with Banco Inter and Asaas for boleto/PIX generation, invoice management, expense tracking, and financial reporting (DRE, Balanço Gerencial).
-   **Integrated HR Module:** Employee management, timesheets (Control iD integration), contract management, payslip generation, and absence tracking.
-   **Smart Document Processing:** OCR for auto-filling forms (OpenAI Vision), automated generation of service contracts and mission reports (PDF).
-   **Comprehensive Audit System:** Logs all critical actions, financial changes, and security events for accountability.
-   **Tactical Mission Dispatch Chat:** Real-time chat for mission invitations, acceptance, and communication with field agents.

## User preferences

I prefer clear and direct communication. When making changes, prioritize iterative development with clear explanations for each step. For any significant architectural or design decisions, please ask for my approval before proceeding. Ensure all code is well-documented and follows modern TypeScript and React best practices. I value a clean, maintainable codebase.

**SEMPRE TESTE ANTES DE ENTREGAR.** Não dá pra dizer "está pronto" sem rodar o cenário (curl, script tsx que invoca a função, screenshot, ou checar log da requisição real). Se for backend, escrever um script `.local/test_*.mts` que importa a função e exercita o caso. Se for frontend, abrir a página/screenshot. Só falar "pronto" depois que o teste mostrar o comportamento esperado de fato — não confiar só em que "o código parece certo".

## Regra de inspeção do Supabase antes de mexer no banco

Antes de qualquer mudança no banco (DDL, índice, constraint, trigger, RPC, RLS, UPDATE/DELETE em massa), **OBRIGATÓRIO** inspecionar o Supabase de produção via `supabaseAdmin` (script `.local/test_inspect_*.mts`) e mostrar o impacto pro dono ANTES de aplicar — o `executeSql({environment:"production"})` aponta pro Neon do Replit, NÃO pro Supabase do projeto. Template completo, exceções e o porquê: **`SYSTEM_BRAIN.md` §9**.

## Gotchas

- **Supabase CRUD Rule:** Never use `db.*` (Drizzle ORM) or direct PostgreSQL for CRUD; always use `supabaseAdmin.from(...)`.
- **BRT Timezone:** All date/time operations must explicitly handle BRT (America/Sao_Paulo). Never use `.toISOString()` for database writes.
- **Financial Immutability:** Once a cost is assigned to a mission, its value is fixed; do not recalculate based on current server date.
- **Real-time Sync:** All significant state changes affecting the UI (e.g., mission status, financial transactions) must trigger `supabase.channel` updates to ensure all open tabs/devices are synchronized.
- **PWA Cache Busting:** Always bump `APP_VERSION` in `server/constants.ts` for significant deployments to force a hard reset and ensure client-side updates.
- **BCC Email Formatting:** Always use an array for BCC recipients in `nodemailer` to avoid silent failures with Office365/Outlook.
- **Critical Business Rules:** Always read `SYSTEM_BRAIN.md` before starting any task to understand core business rules that must not be violated.

## Regras INTOCÁVEIS (NUNCA alterar sem ordem explícita do dono)

Regras estabelecidas e testadas em produção. Não modificar a lógica subjacente sem pedido direto do dono — se uma task parecer exigir alteração, **PARE e pergunte antes**. **Detalhe completo (implementação, casos históricos, testes de regressão) em `SYSTEM_BRAIN.md` §8.** Resumo dos pontos invioláveis:

1. **OS Recusada = faturamento zerado, sempre** — `status="recusada"` zera todos os `fat_*` do billing (incondicional) e marca `CANCELADO`. Nunca pôr `.in("status", [...])` restritivo nesse UPDATE. Diferente de "cancelada" (preserva acionamento + extras).
2. **Auto-fix nunca toca OS recusada** — o auto-fix de boot que conclui OSs penduradas deve excluir `recusada` do filtro (além de `concluida`/`concluída`/`cancelada`).
3. **Compressão de foto mobile (resolve 413)** — fotos de `<input type="file">` redimensionadas via canvas p/ máx 1280px + JPEG q0.7 antes do upload. `/api/mission/update` fica em `PHOTO_UPLOAD_PATHS` (10 MB) como rede de segurança.
4. **Cálculo de faturamento de OS** — Total p/ Faturamento = Aprovadas + A Verificar + Canceladas; Recusadas/Faturadas/Pagas ficam FORA. Manter a "segunda passada" do gerar-fatura que exclui OS recusada. HE fracionada por minuto via `valor_hora_extra`.
5. **Hora extra usa timestamps reais (multi-dia)** — `calcularEscolta` recebe `inicio_ts`/`fim_ts`/`scheduled_date` em ISO; nunca voltar ao cálculo HH:MM (subfatura missões >24h).
6. **`escort_billings` é 1:1 com `service_orders`** — UNIQUE total `uniq_eb_so_id` (nunca parcial); toda escrita com OS usa `.upsert(payload, { onConflict: "service_order_id" })`, nunca `.insert()` cego. Cron pula FROZEN_STATUSES ANTES do upsert.
7. **`mission_costs` precisa de `financial_transaction` espelho** — toda `mission_costs.insert(...)` chama `createAutoTransaction({ origin_type: "mission_cost", ... })` (exceto combustível `[F#NNN]`, já espelhado como `fueling`); ao deletar, `removeAutoTransaction` antes. Senão some do Balanço Gerencial.
8. **Cancelar lançamento financeiro só ANTES da aprovação** — `DELETE /api/financial/transactions/:id/cancelar` (guarda `canCancelAguardando`): só apaga lançamento manual em `AGUARDANDO_APROVACAO`. Após aprovado, só diretoria. UI: todos veem Editar/Cancelar na aba "Aguardando", aprovar/recusar só o aprovador.

## SEO da Landing Pública

Landing pública em `/` otimizada para Google (endpoints `/robots.txt`, `/sitemap.xml` e header `X-Robots-Tag: noindex` em `/admin|/mobile|/api` em `server/index.ts`). URL canônica `https://torresvigilancia.com.br` (override via env `PUBLIC_SITE_URL`). Dados estruturados JSON-LD (`SecurityService`) em `client/index.html`. **Detalhe completo + checklist pós-deploy (Search Console, Rich Results, Google Meu Negócio) em `SYSTEM_BRAIN.md` §10.**

## Pointers

- **Supabase Docs:** [https://supabase.com/docs](https://supabase.com/docs)
- **Tailwind CSS Docs:** [https://tailwindcss.com/docs](https://tailwindcss.com/docs)
- **Drizzle ORM Docs:** [https://orm.drizzle.team/docs](https://orm.drizzle.team/docs)
- **React Query Docs:** [https://tanstack.com/query/latest](https://tanstack.com/query/latest)
- **OpenAI API Docs:** [https://platform.openai.com/docs](https://platform.openai.com/docs)
- **Nodemailer Docs:** [https://nodemailer.com/](https://nodemailer.com/)
- **Zod Docs:** [https://zod.dev/](https://zod.dev/)
- **Banco Inter API Docs:** _Populate as you build_
- **Asaas API Docs:** [https://docs.asaas.com/api-de-cobrancas/](https://docs.asaas.com/api-de-cobrancas/)
- **TrucksControl SOAP API:** _Populate as you build_