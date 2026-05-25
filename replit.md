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

Antes de qualquer mudança que toque o banco (criar/alterar/dropar tabela, índice, constraint, trigger, RPC, RLS, ou rodar UPDATE/DELETE em massa), **OBRIGATÓRIO** inspecionar o estado real do Supabase de produção primeiro e mostrar o impacto pro dono ANTES de aplicar. Sem exceção.

**Por que:** o `executeSql({environment:"production"})` do agente aponta pro Neon do Replit (`neondb`), NÃO pro Supabase do projeto. Confiar nele pra "verificar produção" dá falso negativo (foi o que aconteceu na queda de 22/05/2026). O único caminho confiável é consultar o Supabase via `supabaseAdmin` num script `.local/test_inspect_*.mts`.

**Como fazer (template):**
1. Criar `.local/test_inspect_<assunto>.mts` que importa `supabaseAdmin` de `server/supabase.ts` e usa `supabaseAdmin.rpc("exec_sql", { query: "..." })` pra rodar SELECTs de inspeção em `pg_indexes`, `information_schema.columns`, `pg_constraint`, contagem de linhas afetadas, etc.
2. Rodar com `tsx .local/test_inspect_<assunto>.mts` e mostrar o resultado pro dono em linguagem clara.
3. Listar explicitamente o impacto previsto: "vai criar índice X (tabela tem N linhas, vai levar ~Ys)", "vai dropar coluna Y (tem N valores não-nulos)", "esse UNIQUE vai falhar porque tem N duplicatas — preciso dedupar antes".
4. **Só depois da aprovação do dono**, aplicar a mudança (via `db-init.ts` no boot ou via script com `supabaseAdmin`).
5. Após aplicar, rodar inspeção de novo pra confirmar o estado final.

**Exceções (não precisa inspecionar antes):**
- DDL puramente idempotente em tabela nova que o agente está criando do zero no mesmo turno.
- Leituras só-leitura, debug, ou scripts de diagnóstico.

Se a mudança é destrutiva ou ambígua, na dúvida, inspeciona.

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

### 5. Hora extra usa timestamps reais (multi-dia)
- **`calcularEscolta`** (em `server/billing-calc.ts`) deve receber `inicio_ts` (mission_started_at), `fim_ts` (completed_date) e `scheduled_date` da OS — em ISO. A duração é calculada por `(fim_ts - inicio_ts_considerado) / 3600000` (ms → horas), o que pega missões que atravessam dias/noites.
- O fallback antigo (`calcularHorasTrabalhadas` HH:MM com `if (diff<0) diff+=24h`) **só compensa 1 noite**. Para missão que dura >24h ou que atravessa um dia inteiro, perde múltiplos de 24h e subfatura silenciosamente.
- Caso histórico: TOR-0153 com 35h39min reais foi cobrada como 11h52min (R$ 975 em vez de R$ 3.591), TOR-0159 com 25h40min foi cobrada como 1h40min.
- Quando `horario_agendado` é anterior a `mission_started_at`, o início de cobrança é `scheduled_date + horario_agendado` (em ms), não `mission_started_at`. A função monta o timestamp a partir do `scheduled_date`.
- **NUNCA** voltar a calcular HE só com `horario_inicio`/`horario_fim` HH:MM. Sempre passar timestamps reais nos 13 call-sites de `calcularEscolta`.
- Teste de regressão: `server/billing-calc-hora-extra.test.ts` ("missão de 35h39min (atravessa dia)").

### 6. `escort_billings` é 1:1 com `service_orders` — NUNCA usar `.insert()` cego
- **Significado de negócio:** uma OS pode ter NO MÁXIMO um billing. Se aparece mais de um, alguma rota está inserindo cego sem checar duplicata — e o Excel/boletim mostra a OS duas vezes (uma com KMs reais, outra com KM=0 ou idêntica).
- **Regra física (banco):** existe `CREATE UNIQUE INDEX uniq_eb_so_id ON escort_billings (service_order_id)` em `server/db-init.ts` — UNIQUE **total** (sem `WHERE`). **NUNCA remover** e **NUNCA voltar a ser parcial**. NULLs em UNIQUE são distintos no Postgres, então billings avulsos (sem OS) continuam OK. Índice parcial (`WHERE service_order_id IS NOT NULL`) **quebra** o `INSERT ... ON CONFLICT (service_order_id)` do `.upsert()` do supabase-js com erro 42P10 silencioso — billing NUNCA persiste e a UI mostra "Sem Cálculo" pra todas as OSs do cron (caso real 25/05/2026: TOR-0215, 0216, 0217, 0219, 0220, 0222 e 5+ outras ficaram sem billing por dias até a correção). Bloqueia duplicação no nível do Postgres.
- **Regra de código:** todos os caminhos de escrita em `escort_billings` que envolvam uma OS DEVEM usar `.upsert(payload, { onConflict: "service_order_id" })` — operação atômica que aproveita o UNIQUE pra resolver INSERT vs UPDATE sem race condition. Caminhos atuais já convertidos:
  - `server/routes/mission.ts` — billing de cancelamento de OS + auto-billing no encerramento
  - `server/routes/escort.ts` — criar billing manual + recalcular billing
  - `server/cron.ts` — cron de billing (com check de FROZEN_STATUSES preservado ANTES do upsert pra não sobrescrever FATURADO/PAGO)
  - `server/routes/service-orders.ts` — `/calcular` faz DELETE antes do INSERT dentro do mesmo handler (não vulnerável a self-race)
- **Quando criar uma nova rota que escreve em `escort_billings`:**
  - Se tem `service_order_id`, **OBRIGATÓRIO** usar `.upsert(payload, { onConflict: "service_order_id" })`. Nunca `.insert()` cego.
  - Se NÃO tem `service_order_id` (billing avulso/manual de teste), pode usar `.insert()` — o UNIQUE parcial só vale quando `service_order_id IS NOT NULL`.
- **Quando o cron precisa pular billing congelado:** fazer o check de `FROZEN_STATUSES.has(status)` ANTES do upsert e dar `return` se for o caso (vide `server/cron.ts` linhas ~1800-1808). NÃO confiar que o upsert vai pular sozinho — ele sobrescreve TUDO.
- **Histórico:** 21/05/2026 foram detectadas 11 OSs com billing duplicado (TOR-0110, 0121, 0122, 0134, 0137, 0163, 0176, 0183, 0191, 0201, 0214). Causa raiz: 3 caminhos faziam `.insert()` cego (mission.ts cancelamento + escort.ts manual + escort.ts calcular) + race condition em UPSERTs com padrão SELECT-then-INSERT (TOR-0214 teve dois billings criados no mesmo segundo). Limpeza feita em `.local/dedup_billings.mts` + auditoria em `.local/audit_billings_dup.mts`.
- **Teste de regressão:** `server/cron.test.ts` testes "cron Billing: cria billing para OS concluída sem billing existente" e "atualiza billing PENDENTE em OS ativa" — o mock entende `.upsert(values, { onConflict })` e resolve em INSERT ou UPDATE como o Postgres faz. NÃO remover o suporte a `upsert` do mock.

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