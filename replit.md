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

## Gotchas

- **Supabase CRUD Rule:** Never use `db.*` (Drizzle ORM) or direct PostgreSQL for CRUD; always use `supabaseAdmin.from(...)`.
- **BRT Timezone:** All date/time operations must explicitly handle BRT (America/Sao_Paulo). Never use `.toISOString()` for database writes.
- **Financial Immutability:** Once a cost is assigned to a mission, its value is fixed; do not recalculate based on current server date.
- **Real-time Sync:** All significant state changes affecting the UI (e.g., mission status, financial transactions) must trigger `supabase.channel` updates to ensure all open tabs/devices are synchronized.
- **PWA Cache Busting:** Always bump `APP_VERSION` in `server/constants.ts` for significant deployments to force a hard reset and ensure client-side updates.
- **BCC Email Formatting:** Always use an array for BCC recipients in `nodemailer` to avoid silent failures with Office365/Outlook.
- **Critical Business Rules:** Always read `SYSTEM_BRAIN.md` before starting any task to understand core business rules that must not be violated.

## Regras INTOCÁVEIS (NUNCA alterar sem ordem explícita do usuário)

Essas três regras foram estabelecidas e testadas em produção. Não modificar a lógica subjacente sem pedido direto do dono. Se uma task parecer exigir alteração, **PARE e pergunte antes**.

### 1. OS Recusada = faturamento zerado, sempre
- **Significado de negócio:** "Recusada" = o operacional NÃO atendeu a missão (sem equipe, viatura não saiu, etc.). Nunca pode gerar cobrança.
- **Regra técnica:**
  - Quando `service_orders.status = "recusada"`, **todos** os `fat_*` do `escort_billings` associado devem ser **0** (fat_total, fat_acionamento, fat_hora_extra, fat_km, fat_km_carregado, fat_km_vazio, fat_estadia, fat_pernoite, fat_diaria, fat_adicional_noturno, resultado_bruto, resultado_liquido, margem_percentual).
  - O `bill.status` vira `"CANCELADO"` e `observacoes = "OS RECUSADA — <motivo>"`.
  - A zeragem é **incondicional** — sobrescreve qualquer status anterior do billing (inclusive CANCELADO/REJEITADA/A_VERIFICAR). Recusada da OS é a verdade final.
  - Implementação: `server/routes/service-orders.ts`, branch `isRecusada` no PATCH `/api/service-orders/:id`.
- **NUNCA** voltar a colocar `.in("status", [...])` restritivo nesse UPDATE — foi exatamente o bug histórico que deixou R$ 134.816,50 de cobrança indevida no sistema.
- **Diferente de "cancelada":** OS cancelada = cliente cancelou mas equipe foi acionada → preserva acionamento + extras. Não zerar billing de cancelada.

### 2. Auto-fix nunca toca OS recusada
- O auto-fix de boot em `server/routes.ts` (que força `mission_status=encerrada` → `status=concluida` em OSs penduradas) **deve excluir `status="recusada"`** do filtro.
- Sem isso, OSs recusadas com `mission_status=encerrada` viram concluídas no próximo restart e o billing volta a contar como cobrança — bug que vitimou TOR-0172, TOR-0162, TOR-0178 e outras (R$ 9.355,49 recuperados).
- O filtro correto exclui: `concluida`, `concluída`, `cancelada`, **`recusada`**.

### 3. Compressão de foto do app mobile (resolve 413)
- Foto tirada direto do celular vem em 4–8 MB e estoura o limite do `/api/mission/update` (2 MB padrão).
- **Regra obrigatória no client:** antes de anexar qualquer foto vinda de `<input type="file">` num upload mobile, redimensionar via canvas para **máx 1280px no maior lado** e re-encodar em **JPEG qualidade 0.7**. Resultado típico: ~80–250 KB.
- Implementação: `handlePhotoCapture` em `client/src/pages/mobile/missao.tsx`.
- Backend: `/api/mission/update` está em `PHOTO_UPLOAD_PATHS` (limite 10 MB) como rede de segurança — não remover dessa lista.
- Não trocar JPEG por PNG nem subir resolução máxima sem motivo — o ganho de qualidade é insignificante e o custo de banda/quota é alto.

### 4. Cálculo de faturamento de OS
- **Total p/ Faturamento = Aprovadas + A Verificar + Canceladas (pelo cliente).** Recusadas e Faturadas/Pagas ficam FORA.
- Implementação:
  - Frontend: `client/src/pages/admin/relatorio-faturamento.tsx` — função `isFaturavelBilling` filtra por `_so_status !== "recusada"` e exclui `FATURADO/FATURADA/PAGO/RECUSADA/REJEITADA`. Card "Total p/ Faturamento" usa `approvedTotal` com a mesma regra.
  - Backend: `POST /api/boletim-medicao/gerar-fatura/:clientId` em `server/asaas.ts` (~linha 2306). Filtra `escort_billings` por `status IN (APROVADA, A_VERIFICAR, PENDENTE, ENVIADA_APROVACAO, CANCELADA, CANCELADO)` e depois faz **segunda passada** excluindo billings cuja OS está com `so.status="recusada"` (mesmo que o `bill.status` ainda não tenha sido atualizado).
- **NUNCA** remover a segunda passada do gerar-fatura — é a salvaguarda contra billings dessincronizados.
- **NUNCA** incluir RECUSADA, REJEITADA, FATURADO ou PAGO no filtro do gerar-fatura.
- Hora extra é fracionada por minuto (não por hora cheia), seguindo `valor_hora_extra` do contrato. Não usar `valor_km_extra` como fallback de HE.

## SEO da Landing Pública

A landing pública em `/` é otimizada para Google. Endpoints SEO em `server/index.ts`:
- `GET /robots.txt` — permite `/`, bloqueia `/admin`, `/mobile`, `/api`
- `GET /sitemap.xml` — lista a home com `lastmod` em BRT
- Middleware adiciona header `X-Robots-Tag: noindex, nofollow` em qualquer resposta de `/admin*`, `/mobile*`, `/api*`

A URL canônica é `https://torresvigilancia.com.br`. Pra apontar pra outra URL pública (ex: subdomínio Replit em testes), defina a env var `PUBLIC_SITE_URL` (sem barra final). Sem ela, o sitemap usa o host da requisição como fallback.

Pós-deploy, lembrar de:
1. Cadastrar o domínio no [Google Search Console](https://search.google.com/search-console) e enviar o sitemap (`https://torresvigilancia.com.br/sitemap.xml`)
2. Validar o JSON-LD no [Rich Results Test](https://search.google.com/test/rich-results)
3. Cadastrar a empresa no [Google Meu Negócio](https://www.google.com/business/) com o mesmo endereço dos dados estruturados (Av. Raimundo Pereira de Magalhães, 5720 — Pirituba/SP)

Dados estruturados (`<script type="application/ld+json">` em `client/index.html`) declaram a empresa como `SecurityService` com CNPJ, Alvará PF nº 1.016, endereço, área de atendimento (SP capital, Campinas, Estado de SP) e catálogo de serviços.

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