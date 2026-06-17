# 🧠 SYSTEM_BRAIN.md — Contexto Mestre do Torres Vigilância Patrimonial

> **Como usar:** NÃO precisa ler o arquivo inteiro. Use o índice abaixo para ler **só a(s) seção(ões) relevante(s)** à sua tarefa.
> **Obrigatório ler a seção correspondente** antes de mexer em: **financeiro/faturamento (§8)**, **banco/Supabase (§9)**, **timezone/datas (§1.1)**.

## 📑 Índice de roteamento — leia a § conforme a tarefa

| Vou mexer em… | Leia |
|---|---|
| Timezone, datas, horários, duração | §1.1, §4 |
| Faturamento / OS / hora extra / `escort_billings` / `mission_costs` | §1.2, §8 |
| Banco de dados (DDL, índice, constraint, trigger, RPC, RLS, UPDATE/DELETE em massa) | **§9 (OBRIGATÓRIO)** |
| Arquitetura de dados (Supabase CRUD, proibições) | §1.3 |
| Realtime / sincronismo entre abas e dispositivos | §1.4 |
| Missão (fluxo, chat, aceite, custos) | §1.5 |
| Onde mexer numa funcionalidade (área → tela + rota + lógica) | §2.1 |
| Onde fica cada arquivo (backend/frontend) | §2.2, §2.3 |
| Versões travadas de dependências | §3 |
| Por que algo quebrou antes (regressões históricas) | §5 (L001–L006) |
| Padrões de código / estilo | §6 |
| Antes de commitar | §7 |
| SEO da landing pública | §10 |

> ⚠️ As seções marcadas **NUNCA ALTERAR / OBRIGATÓRIO** contêm regras testadas em produção. Se sua task parecer exigir alterá-las, **PARE e pergunte ao dono antes**.

---

## 1. REGRAS PRIMORDIAIS (NUNCA ALTERAR)

### 1.1 Fuso Horário — 100% PADRÃO BRASIL / HORÁRIO DE BRASÍLIA (BRT, UTC-3)
> **REGRA ABSOLUTA:** Todo o sistema opera 100% no padrão Brasil, Horário de Brasília (America/Sao_Paulo). Toda data, hora, cálculo, exibição, gravação e comparação DEVE usar BRT. Não existe nenhum componente que opere em UTC puro.

| Regra | Detalhes |
|-------|---------|
| **Armazenamento** | Supabase armazena timestamps **em BRT nativo**, sem sufixo (ex: `2026-04-07T03:30:00` = 03:30 BRT). O pool DB usa `SET timezone = 'America/Sao_Paulo'`. |
| **OID Parser 1114** | Em `db.ts`, o parser de `timestamp without timezone` (OID 1114) adiciona `-03:00` ao ler, criando um `Date` correto em BRT. |
| **`localInputToUtc()` — DESATIVADA** | Função em `service-orders.tsx` **NÃO converte mais BRT→UTC**. Repassa o valor BRT diretamente ao banco. A conversão dupla causava shift de +3h. Corrigido em 08/04/2026. |
| **Parsing no Frontend** | Sempre usar `parseUTCDate(ts)` de `client/src/lib/utils.ts`. Adiciona `-03:00` a strings sem offset. Nunca `new Date(ts)` diretamente. |
| **Exibição** | Sempre passar `timeZone: "America/Sao_Paulo"` em `toLocaleTimeString()` / `toLocaleString()`. Usar `formatTimeBRT()`, `formatDateBRT()`, `formatBRT()` de utils.ts. |
| **Parsing no Backend** | `ensureUTC(ts)` adiciona `-03:00` (NÃO `Z`). `nowBRTString()` gera timestamps BRT. |
| **PROIBIDO** | NUNCA usar `.toISOString()` para gravar — converte para UTC e causa shift de +3h. NUNCA usar `new Date().toISOString()` como fonte de hora — usar `nowBRTString()`. |
| **`data_missao`** | Deve ser armazenada como ISO timestamp completo (ex: `"2026-04-02T11:00:00"`), **nunca** como date-only (`"2026-04-02"`) — PostgreSQL interpreta date-only como UTC midnight, deslocando a data BRT em -1 dia. |
| **CRON Jobs** | Todos os horários são definidos em UTC mas documentados em BRT. Ex: `06:30 BRT = 09:30 UTC`. |
| **Cálculo de Duração** | Usar `parseUTCDate(start).getTime()` e `Date.now()` para diferenças em milissegundos. |

### 1.2 Fluxo Financeiro

| Regra | Detalhes |
|-------|---------|
| **Fonte Única de Dados** | Todo dado financeiro vem do Supabase (tabelas `financial_transactions`, `mission_costs`, `escort_billings`). É **proibido** usar localStorage, memória temporária ou valores hardcoded para dados financeiros. |
| **Ciclos de Faturamento** | Clientes podem ter ciclo `por_missao`, `quinzenal` ou `mensal`. Prazo de aprovação padrão: 10 dias após fechamento do ciclo. |
| **Alertas de Billing** | `PENDENTE_FATURAMENTO` (diário), `ANTECIPACAO_APROVACAO` (5 dias antes do prazo), `ATRASO_APROVACAO` (após prazo), `VENCIMENTO_EMISSAO` (dia 25), `OS_ESQUECIDA` (OS > 30 dias sem faturar). |
| **Pedágio com Missão** | Cria DOIS registros: expense + revenue (reembolso). Impacto líquido = zero no DRE. |
| **Pedágio Vazio (sem OS)** | Apenas expense. Abate lucro diretamente. Categoria: "Custos Fixos/Deslocamento Extra". |
| **Valores Imutáveis** | Uma vez gravado um custo na missão, ele é congelado (`custos_congelados_em`). O sistema NÃO recalcula custos de missões concluídas. |
| **Combustível** | Custos reais de combustível **nunca devem ser herdados de missões anteriores da mesma viatura.** O fallback `vehicleFuelCache` só busca transações do DIA ATUAL (BRT) e apenas para OS com missão ATIVA. |
| **Margem DRE** | ≥30% = Verde, ≥15% = Âmbar, <15% = Vermelho. |

### 1.3 Arquitetura de Dados

| Regra | Detalhes |
|-------|---------|
| **Banco de Dados** | Supabase PostgreSQL é o ÚNICO banco. O `DATABASE_URL` local do Replit NÃO é usado. |
| **⛔ PROIBIDO PostgreSQL direto** | É TERMINANTEMENTE PROIBIDO usar `db.*` (Drizzle ORM), `db.execute()`, `db.select()`, `db.insert()`, `db.update()`, `db.delete()` para operações CRUD. TODO acesso a dados DEVE usar exclusivamente `supabaseAdmin.from(...)` (REST API). ÚNICA exceção: `db-init.ts` para DDL (ALTER TABLE/CREATE TABLE/INDEX). |
| **Caminhos de Acesso** | `storage.*` = Supabase REST API (camelCase). `supabaseAdmin.from(...)` = REST API direto (snake_case). ❌ `db.*` = PROIBIDO para CRUD (só DDL em db-init.ts). |
| **Autenticação** | Supabase Auth via JWT. RBAC via tabela `perfis_acesso`. **Nunca** adicionar coluna `password` no schema. |
| **API Calls** | Sempre usar `apiRequest()` ou `authFetch()` — nunca `fetch()` diretamente. |
| **OS Status** | Armazenados **com acento** (ex: `"concluída"`). Sempre normalizar antes de comparar. |

### 1.4 Realtime e Sincronismo

| Canal | Tabelas Monitoradas | Finalidade |
|-------|---------------------|-----------|
| `realtime-sync-*` | `mission_costs`, `financial_transactions`, `vehicle_fueling`, `service_orders`, `mission_updates`, `escort_billings`, `billing_alerts` | Cache invalidation global (TanStack Query) |
| `chat-realtime` | `chat_messages` | Chat admin (INSERT → refetch) |
| `mobile-chat-rt` | `chat_messages` | Chat mobile (INSERT → refetch) |
| `widget-chat-rt` | `chat_messages` | Chat widget (INSERT → refetch) |

**Regra**: Toda atualização operacional (status, pedágio, abastecimento) DEVE propagar via Supabase Realtime. Proibido salvar apenas em estado local.

### 1.5 Regras de Missão

| Regra | Detalhes |
|-------|---------|
| **`missionStartedAt`** | Setado no primeiro checkout (`checkout_armamento`), NÃO no `em_transito_origem`. |
| **Billing hora extra** | Usa `missionStartedAt` como início. Cálculo via RPC `calc_mission_elapsed_hours()` do banco. |
| **Horário de Início** | `Inicio_Missao = max(Horario_Agendado, Horario_Chegada_Real)`. |
| **Early Start** | Missões >30min no futuro requerem aprovação admin para início antecipado. |
| **Aceite de Missão** | Tabela `mission_acceptances` com status pendente/aceito/recusado/expirado. CRON expira pending > 2h. |
| **step_logs** | JSONB em `service_orders` — cada step com timestamp UTC, agente, GPS. |

---

## 2. MAPA DE CÓDIGO POR FUNCIONALIDADE

> **Fluxo padrão de edição:** acha a área na §2.1 → abre **só** a Tela + a Rota + a Lógica daquela linha → lê **só** a(s) seção(ões) da coluna *Brain* → edita → testa (regra "SEMPRE TESTE", veja §7 e `replit.md`). Não garimpe o codebase inteiro; comece pelos arquivos exatos abaixo.

### 2.1 Por área de negócio (Área → Tela → Rota → Lógica → Brain)

> Caminhos: tela = `client/src/pages/...`; rota = `server/routes/...` (ou `server/asaas.ts` / `server/routes.ts`); lógica = `server/...` / `server/lib/...` / `client/src/lib/...`. Itens "memo:" são tópicos em `.agents/memory/`.

| Área | Tela | Rota (endpoints) | Lógica | Brain |
|------|------|------------------|--------|-------|
| **Faturamento / boletim** | `admin/relatorio-faturamento.tsx`, `admin/escort-billing.tsx`, `admin/boletim-medicao.tsx`, `admin/auditoria-faturamento.tsx` | `routes/escort.ts` (`/api/escort`, `/api/billing-alerts`), `asaas.ts` (`/api/boletim-medicao/gerar-fatura`) | `billing-calc.ts` (`calcularEscolta`, `calcularFaturamentoLive`) | §1.2, §8.4, §8.6 |
| **OS / ciclo de vida / step_logs** | `admin/service-orders.tsx`, `admin/relatorio-os.tsx`, `admin/mission.tsx` | `routes/service-orders.ts` (`/api/service-orders`, `/calcular`), `routes/mission.ts` (`/api/mission` lifecycle) | `billing-calc.ts` | §1.5, §8.1, §8.2 |
| **Hora extra (multi-dia)** | `admin/relatorio-faturamento.tsx`, `admin/escort-billing.tsx` | `routes/escort.ts`, `routes/service-orders.ts` | `billing-calc.ts` → `calcularEscolta` (`inicio_ts`/`fim_ts`/`scheduled_date`) | §8.5 |
| **Ponto / RH / Holerite** | `admin/ponto-operacional.tsx`, `admin/holerites.tsx`, `admin/timesheets.tsx`, `admin/employees.tsx`, `admin/jornada-diretoria.tsx`, `mobile/ponto.tsx`, `mobile/holerites.tsx` | `routes/hr.ts` (`/api/payslips`, `/api/absences`, `/api/jornada-*`), `routes/employees.ts` (`/api/payroll`, `/api/employee-salaries`), `routes/control-id.ts` (`/api/control-id`), `routes/fleet.ts` (`/api/timesheets`), `routes/mobile.ts` (`/api/ponto-operacional`) | `lib/payroll.ts`, `lib/hours-calc.ts`, `lib/control-id-parsers.ts`, `rhid-reconciliation.ts` | memo: `payroll-night-additional`, `rhid-reconciliation` |
| **Abastecimento / Frota** | `admin/fueling.tsx`, `admin/relatorio-abastecimento.tsx`, `admin/vehicles.tsx`, `admin/maintenance.tsx`, `mobile/abastecimento.tsx` | `routes/fleet.ts` (`/api/fueling`, `/api/maintenance`, `/api/trips`), `routes/vehicles.ts` (`/api/vehicles`), `routes/mobile.ts` | `telemetry-engine.ts`, `truckscontrol.ts` | §1.2 (combustível), §8.7, §5 (L002, L004) |
| **Pedágio / TicketLog** | `admin/conciliacao-ticketlog.tsx`, `admin/conferencia-pedagio.tsx` | `routes/conciliacao.ts` (`/api/conciliacao-ticketlog`, `/api/auditoria-pedagios-ticketlog`), `routes/mobile.ts` (pedagio-missao/vazio), `routes/service-orders.ts` (`/api/calculate-tolls`, `/api/toll-plazas`) | `lib/ticketlog-pedagio-csv.ts`, `lib/auditoria-pedagios-ticketlog.ts`, `toll-engine.ts` | §1.2 (pedágio), §8.7 |
| **Financeiro (lançamentos / aprovação)** | `admin/financeiro.tsx`, `admin/contas-a-pagar.tsx`, `admin/custos-fixos.tsx`, `admin/balanco-gerencial.tsx`, `admin/cotacao-gasto.tsx` | `routes/escort.ts` (`/api/financial/transactions`), `routes/fixed-costs.ts` (`/api/fixed-costs`, `/api/balanco`) | `lib/financial-cancel-guard.ts`, `financial-snapshot.ts` | §8.7, §8.8, memo: `balanco-canonical-revenue` |
| **PIX / Asaas / NF** | `admin/faturas.tsx`, `admin/relatorio-nf.tsx` | `asaas.ts` (`/api/asaas`, `/api/invoices`, `/api/boletim-medicao`) | `asaas.ts`, `lib/asaas-helpers.ts` | §8.4 |
| **Boleto / Banco Inter** | `admin/inter-extrato.tsx`, `admin/faturas.tsx` | `routes/inter.ts` (`/api/inter`, `/api/financeiro`) | `lib/inter-webhook-parser.ts` | §1.2 |
| **Missão / Grid operacional** | `admin/operational-grid.tsx`, `admin/mission.tsx`, `admin/agenda-vtr.tsx`, `admin/tracker.tsx`, `admin/cameras-live.tsx`, `admin/simulador-missao.tsx` | `routes/operational.ts` (`/api/operational-grid`, `/api/vehicle-tracking`), `routes/mission.ts` (`/api/mission`, `/api/missions`) | `billing-calc.ts` (DRE live), `telemetry-engine.ts` | §1.4, §1.5, §5 (L002) |
| **App mobile do agente** | `mobile/*.tsx` (`missao`, `pedagio`, `abastecimento`, `ocorrencia`, `checklist`, `selfie`, `ponto`) | `routes/mobile.ts` (`/api/mobile`, `/api/ocorrencias`), `routes/mission.ts` (`/api/mission/update`) | `client/src/lib/offlineQueue.ts`, `lib/photo-data-uri.ts` | §8.3, §1.5, memo: `waf-blocks-data-uri` |
| **Chat de despacho** | `admin/chat.tsx`, `mobile/chat.tsx`, `components/chat-widget.tsx` | `routes/chat.ts` (`/api/chat`) | — | §1.4, §5 (L005, L006) |
| **WhatsApp / Agente Central** | `admin/whatsapp.tsx` | `routes/whatsapp.ts` (`/api/whatsapp`), `routes/clients.ts` (`/api/whatsapp`) | `lib/zapi.ts`, `lib/whatsapp-humanize.ts`, `lib/agent-central-mention.ts`, `cron-agent-central.ts`, `cron-whatsapp-forward.ts` | memo: `whatsapp-zapi-antiban`, `whatsapp-forward-dedup` |
| **Landing / SEO** | landing pública em `/` (`client/index.html`) | `server/index.ts` (`/robots.txt`, `/sitemap.xml`, `X-Robots-Tag`) | `server/index.ts` | §10 |
| **Realtime / sincronismo** | — (afeta todas as telas) | — | `client/src/lib/queryClient.ts` (canais `supabase.channel`) | §1.4 |
| **Clientes / Fornecedores** | `admin/clients.tsx`, `admin/fornecedores.tsx` | `routes/clients.ts` (`/api/clients`), `routes/fornecedores.ts` (`/api/fornecedores`) | `storage.ts` | §1.3 |
| **Contratos / Onboarding** | `admin/contratos-experiencia.tsx`, `mobile/contratos.tsx` | `routes/probation-contracts.ts`, `routes/permanent-contracts.ts`, `routes/branded-contracts.ts`, `routes/onboarding.ts` | `contract-pdf.ts`, `permanent-contract-pdf.ts`, `probation-contract-pdf.ts` | §1.3 |
| **Laudo / OCR de documentos** | `admin/laudo.tsx`, `admin/photo-inspection.tsx` | `routes/mission.ts` (`/api/laudo`) | `lib/correct-text-ai.ts` (OpenAI Vision) | §1.5 |

> Não achou a área aqui? Use o índice de roteamento (topo) pela seção do brain, ou `rg` pelo nome do endpoint/coluna. **Manutenção:** ao criar uma área nova, adicione uma linha aqui; ao mover/renomear/adicionar Tela, Rota ou Lógica de uma área **existente**, atualize a linha correspondente.

### 2.2 Backend (server/)
| Arquivo | Responsabilidade |
|---------|-----------------|
| `server/routes/operational.ts` | Grid Operacional — cálculo de DRE ao vivo, `vehicleFuelCache`, billing live |
| `server/routes/service-orders.ts` | CRUD de OS, step_logs, mission lifecycle |
| `server/routes/chat.ts` | Chat, convites de missão, aceite/recusa |
| `server/routes/mission.ts` | Endpoints de aceite de missão, comprovante PDF |
| `server/routes/escort.ts` | Boletim de medição, cálculo de faturamento |
| `server/routes/mobile.ts` | Endpoints mobile: abastecimento, pedágio, ponto |
| `server/routes/fleet.ts` | Frota: tracking, telemetria, TrucksControl |
| `server/routes/hr.ts` | RH: documentos, contratos, folha de ponto |
| `server/routes/employees.ts` | CRUD de funcionários, pasta do funcionário |
| `server/routes/clients.ts` | CRUD de clientes, pasta do cliente |
| `server/billing-calc.ts` | Função centralizada `calcularFaturamentoLive()` |
| `server/cron.ts` | Tarefas agendadas: billing alerts, rodízio, compliance |
| `server/db-init.ts` | Inicialização e migrations do banco |
| `server/storage.ts` | Interface de acesso a dados (`IStorage`) |

### 2.3 Frontend (client/src/)
| Arquivo | Responsabilidade |
|---------|-----------------|
| `client/src/lib/utils.ts` | `parseUTCDate()`, `formatTimeBRT()`, `formatDateBRT()`, `formatBRT()`, `titleCase()` |
| `client/src/lib/queryClient.ts` | TanStack Query config, Realtime sync, `apiRequest()` |
| `client/src/lib/offlineQueue.ts` | Fila offline resiliente para agentes em campo |
| `client/src/pages/admin/operational-grid.tsx` | Grid Operacional principal (~7900 linhas) |
| `client/src/pages/admin/service-orders.tsx` | Gerenciamento de OS |
| `client/src/pages/admin/employees.tsx` | Pasta do Funcionário (8 tabs) |
| `client/src/pages/admin/clients.tsx` | Pasta do Cliente (6 tabs) |
| `client/src/pages/admin/balanco-gerencial.tsx` | Dashboard financeiro |
| `client/src/pages/mobile/missao.tsx` | Interface mobile de missão |
| `client/src/pages/mobile/chat.tsx` | Chat mobile |
| `client/src/components/chat-widget.tsx` | Widget de chat global |

---

## 3. DEPENDÊNCIAS CRÍTICAS (Versões Travadas)

| Pacote | Versão | Notas |
|--------|--------|-------|
| `react` / `react-dom` | ^18.3.1 | Não migrar para v19 sem planejamento |
| `@tanstack/react-query` | ^5.60.5 | **v5**: só aceita objeto `{ queryKey }`, nunca array direto |
| `@supabase/supabase-js` | ^2.99.0 | Supabase v2 — Auth, Realtime, REST |
| `drizzle-orm` / `drizzle-zod` | ^0.39.3 / ^0.7.1 | ORM para PostgreSQL |
| `lucide-react` | ^0.453.0 | Ícones — usar apenas esta lib |
| `react-icons` | ^5.4.0 | Apenas para logos (`react-icons/si`) |
| `wouter` | ^3.3.5 | Roteamento SPA |
| `react-hook-form` | ^7.55.0 | Formulários controlados |
| `@hookform/resolvers` | ^3.10.0 | Integração Zod ↔ react-hook-form |
| `zod` | ^3.25.76 | Validação de schemas |
| `express` | ^5.0.1 | Backend HTTP server |
| `vite` | ^7.3.0 | Build tool frontend |
| `pdfkit` | ^0.18.0 | Geração de PDFs |
| `openai` | ^6.32.0 | OCR Vision |
| `nodemailer` | ^8.0.4 | Envio de e-mails |
| `date-fns` | ^3.6.0 | Manipulação de datas |
| `xlsx` / `exceljs` | ^0.18.5 | Exportação Excel |

---

## 4. FUNÇÕES UTILITÁRIAS DE TIMEZONE

```typescript
// client/src/lib/utils.ts

parseUTCDate(ts: string | Date | null | undefined): Date
// Normaliza timestamp do DB (sem 'Z') → Date correto em UTC
// Uso: parseUTCDate("2026-04-07T06:30:00") → Date representando 06:30 UTC

formatTimeBRT(date: string | Date | null | undefined): string
// Retorna "HH:mm" em BRT. Ex: "03:30" → exibido como "00:30"

formatDateBRT(date: string | Date | null | undefined): string
// Retorna "DD/MM/YYYY" em BRT

formatBRT(date: string | Date | null | undefined): string
// Retorna "DD/MM/YYYY HH:mm" em BRT
```

**No Backend:**
- `ensureUTC(ts)` em `server/routes/service-orders.ts` — append 'Z'
- Funções `toBRT()` locais em cada route file

---

## 5. LIÇÕES APRENDIDAS (REGRESSÕES HISTÓRICAS)

> ⚠️ Erros que já ocorreram e NUNCA devem se repetir.

### L001 — Horário 11:00h exibido como 08:00h (Timezone)
- **Causa**: `new Date("2026-04-07T11:00:00")` sem 'Z' foi interpretado como hora local do servidor (UTC), e ao exibir sem `timeZone: "America/Sao_Paulo"`, mostrava UTC puro.
- **Correção**: Sempre usar `parseUTCDate()` + `timeZone: "America/Sao_Paulo"` em toda exibição.
- **Arquivos afetados**: `operational-grid.tsx` (40+ locais corrigidos), `utils.ts`.

### L002 — Custo de R$ 590,88 fantasma no DRE da TOR-0018
- **Causa**: O `vehicleFuelCache` em `server/routes/operational.ts` buscava os últimos 500 registros de `financial_transactions` do tipo "fueling" **sem filtro de data**, pegando abastecimentos de dias/semanas anteriores e vinculando à primeira OS ativa da viatura.
- **Correção**: (1) Filtrar `vehicleFuelCache` para apenas transações do dia atual BRT. (2) Adicionar trava: fallback de combustível só para OS com missão ativa (não "aguardando"/"agendada"). (3) Somar todos os abastecimentos do dia para a placa, não apenas o último.
- **Regra**: **Custos reais de combustível NUNCA devem ser herdados de missões anteriores da mesma viatura.**

### L003 — data_missao como date-only desloca data em -1 dia
- **Causa**: Gravar `"2026-04-02"` no PostgreSQL faz com que seja interpretado como `2026-04-02T00:00:00 UTC`, que em BRT é `2026-04-01T21:00:00` — dia anterior.
- **Correção**: Sempre gravar como ISO timestamp completo: `"2026-04-02T11:00:00"`.

### L004 — Duplicidade de custos em missões com múltiplas OS na mesma viatura
- **Causa**: Sem o sistema `vehicleFuelFirstOS`, o combustível era alocado em TODAS as OS daquela viatura no dia.
- **Correção**: `fuelKey = plate:date` garante que apenas a primeira OS herda o fallback de combustível.

### L005 — Chat de missão permitia envio entre funcionários
- **Causa**: Falta de validação de perfil no endpoint de mensagem.
- **Correção**: Non-admins bloqueados de criar DMs entre funcionários, criar grupos, e enviar convites de missão via endpoint genérico.

### L006 — IDOR em rotas de aceite de missão
- **Causa**: Endpoint aceitava qualquer employeeId no body sem validar contra o token JWT.
- **Correção**: `req.employeeId` é extraído do JWT, nunca do body. Endpoint valida que o usuário é o destinatário do aceite.

---

## 6. CONVENÇÕES DE CÓDIGO

| Convenção | Detalhe |
|-----------|--------|
| **Idioma** | Código em português. Variáveis, comentários e UI em português. |
| **Estilo UI** | Monocromático (preto/branco), tipografia Montserrat/Inter. |
| **Componentes** | shadcn/ui com Tailwind CSS. Dark mode via classe `.dark`. |
| **Ícones** | `lucide-react` para ações, `react-icons/si` para logos de empresas. |
| **data-testid** | Obrigatório em todo elemento interativo e de exibição significativo. |
| **Formulários** | `useForm` + `zodResolver` + schema de `@shared/schema.ts`. |
| **Queries** | TanStack Query v5: `useQuery({ queryKey: [...] })`. Cache invalidation por `queryKey` array. |
| **Mutações** | `apiRequest()` de `@lib/queryClient` + invalidar cache após sucesso. |
| **Rotas** | Thin routes em `server/routes/*.ts`, lógica de negócio em `storage.*` ou funções utilitárias. |

---

## 7. CHECKLIST PRÉ-COMMIT

- [ ] Nenhum `new Date(timestamp_do_banco)` sem `parseUTCDate()` no frontend
- [ ] Todo `toLocaleTimeString()` e `toLocaleString()` com `timeZone: "America/Sao_Paulo"`
- [ ] Dados financeiros vêm do Supabase, nunca de localStorage/memória
- [ ] Grid ↔ DRE ↔ Balanço mostram os mesmos valores para a mesma OS
- [ ] Custos de combustível vinculados apenas por `mission_costs.service_order_id` ou fallback do dia atual
- [ ] Nenhum valor hardcoded — tudo dinâmico do banco
- [ ] `data-testid` em todos os elementos interativos novos
- [ ] CRON billing usa `supabaseAdmin.from()` (REST), nunca `storage.getServiceOrders()`

---

## 8. REGRAS INTOCÁVEIS — Financeiro / Faturamento (NUNCA alterar sem ordem explícita do dono)

> Estabelecidas e testadas em produção. Não modificar a lógica subjacente sem pedido direto do dono. Se uma task parecer exigir alteração, **PARE e pergunte antes**.

### 8.1 OS Recusada = faturamento zerado, sempre
- **Significado de negócio:** "Recusada" = o operacional NÃO atendeu a missão (sem equipe, viatura não saiu, etc.). Nunca pode gerar cobrança.
- **Regra técnica:**
  - Quando `service_orders.status = "recusada"`, **todos** os `fat_*` do `escort_billings` associado devem ser **0** (fat_total, fat_acionamento, fat_hora_extra, fat_km, fat_km_carregado, fat_km_vazio, fat_estadia, fat_pernoite, fat_diaria, fat_adicional_noturno, resultado_bruto, resultado_liquido, margem_percentual).
  - O `bill.status` vira `"CANCELADO"` e `observacoes = "OS RECUSADA — <motivo>"`.
  - A zeragem é **incondicional** — sobrescreve qualquer status anterior do billing (inclusive CANCELADO/REJEITADA/A_VERIFICAR). Recusada da OS é a verdade final.
  - Implementação: `server/routes/service-orders.ts`, branch `isRecusada` no PATCH `/api/service-orders/:id`.
- **NUNCA** voltar a colocar `.in("status", [...])` restritivo nesse UPDATE — foi exatamente o bug histórico que deixou R$ 134.816,50 de cobrança indevida no sistema.
- **Diferente de "cancelada":** ver §8.1b. Recusada zera; cancelada cobra pela tabela de 100 km.

### 8.1b OS Cancelada = tabela de 100 km do cliente (ordem do dono, 17/06/2026)
- **Significado de negócio:** "Cancelada" = o cliente cancelou a missão, mas a equipe foi (ou pôde ter sido) acionada. Não zera como recusada — cobra o **acionamento da tabela de 100 km do cliente** + excedente real, se houver.
- **Regra técnica:**
  - Ao cancelar uma OS de escolta, puxar a **"tabela de 100 km"** do cliente = contrato de escolta `Ativo` com `franquia_km=100` **E** `franquia_horas=3`. Fallback: contrato `Ativo` com `franquia_km=100`. Se não houver, usar o contrato vinculado à OS (`escort_contract_id`); se nem isso, só marca `status="CANCELADO"` sem mexer nos valores.
  - Recalcular o billing via `calcularEscolta` com essa tabela, usando **km e tempo reais** da OS (km das fotos `step_logs`, `mission_started_at`/`completed_date`, `scheduled_date`):
    - Dentro da franquia (≤100 km **e** ≤3 h) ou sem equipe acionada (tudo zero) ⇒ **só o acionamento** (ex.: R$ 480).
    - Excedente de km ⇒ acionamento + `km_excedente × valor_km_extra`. Excedente de horas ⇒ acionamento + HE fracionada por minuto.
  - `bill.status` vira `"CANCELADO"`, `observacoes = "OS CANCELADA — Tabela 100 km …"`, `pag_*=0`, `fat_total` = resultado. Escrita via **upsert `onConflict: service_order_id`** (§8.6).
  - Espelha o total em `service_orders.valor_estimado` e `fat_calculado` para o card/listagem refletir.
  - Billing **congelado** (`status ∈ APROVADA/FATURADO/FATURADA/PAGO`) NÃO é recalculado — só marca `CANCELADO`.
  - Implementação: `server/lib/cancelada-billing.ts` (`getTabela100km` + `computeCanceladaBilling`); chamadores: `POST /api/mission/cancel` (`routes/mission.ts`) e branch cancelada no PATCH `/api/service-orders/:id` (`routes/service-orders.ts`).
  - Teste de regressão: `server/lib/cancelada-billing.test.ts`. Script de ajuste histórico (01/06/2026→hoje): `.local/test_fix_canceladas_historico.mts` (DRY-RUN sem `--apply`).
- **NÃO cria `financial_transaction`** no cancelamento — comportamento mantido (cancelamento nunca espelhou tx).

### 8.2 Auto-fix nunca toca OS recusada
- O auto-fix de boot em `server/routes.ts` (que força `mission_status=encerrada` → `status=concluida` em OSs penduradas) **deve excluir `status="recusada"`** do filtro.
- Sem isso, OSs recusadas com `mission_status=encerrada` viram concluídas no próximo restart e o billing volta a contar como cobrança — bug que vitimou TOR-0172, TOR-0162, TOR-0178 e outras (R$ 9.355,49 recuperados).
- O filtro correto exclui: `concluida`, `concluída`, `cancelada`, **`recusada`**.

### 8.3 Compressão de foto do app mobile (resolve 413)
- Foto tirada direto do celular vem em 4–8 MB e estoura o limite do `/api/mission/update` (2 MB padrão).
- **Regra obrigatória no client:** antes de anexar qualquer foto vinda de `<input type="file">` num upload mobile, redimensionar via canvas para **máx 1280px no maior lado** e re-encodar em **JPEG qualidade 0.7**. Resultado típico: ~80–250 KB.
- Implementação: `handlePhotoCapture` em `client/src/pages/mobile/missao.tsx`.
- Backend: `/api/mission/update` está em `PHOTO_UPLOAD_PATHS` (limite 10 MB) como rede de segurança — não remover dessa lista.
- Não trocar JPEG por PNG nem subir resolução máxima sem motivo — o ganho de qualidade é insignificante e o custo de banda/quota é alto.

### 8.4 Cálculo de faturamento de OS
- **Total p/ Faturamento = Aprovadas + A Verificar + Canceladas (pelo cliente).** Recusadas e Faturadas/Pagas ficam FORA.
- Implementação:
  - Frontend: `client/src/pages/admin/relatorio-faturamento.tsx` — função `isFaturavelBilling` filtra por `_so_status !== "recusada"` e exclui `FATURADO/FATURADA/PAGO/RECUSADA/REJEITADA`. Card "Total p/ Faturamento" usa `approvedTotal` com a mesma regra.
  - Backend: `POST /api/boletim-medicao/gerar-fatura/:clientId` em `server/asaas.ts` (~linha 2306). Filtra `escort_billings` por `status IN (APROVADA, A_VERIFICAR, PENDENTE, ENVIADA_APROVACAO, CANCELADA, CANCELADO)` e depois faz **segunda passada** excluindo billings cuja OS está com `so.status="recusada"` (mesmo que o `bill.status` ainda não tenha sido atualizado).
- **NUNCA** remover a segunda passada do gerar-fatura — é a salvaguarda contra billings dessincronizados.
- **NUNCA** incluir RECUSADA, REJEITADA, FATURADO ou PAGO no filtro do gerar-fatura.
- Hora extra é fracionada por minuto (não por hora cheia), seguindo `valor_hora_extra` do contrato. Não usar `valor_km_extra` como fallback de HE.

### 8.5 Hora extra usa timestamps reais (multi-dia)
- **`calcularEscolta`** (em `server/billing-calc.ts`) deve receber `inicio_ts` (mission_started_at), `fim_ts` (completed_date) e `scheduled_date` da OS — em ISO. A duração é calculada por `(fim_ts - inicio_ts_considerado) / 3600000` (ms → horas), o que pega missões que atravessam dias/noites.
- O fallback antigo (`calcularHorasTrabalhadas` HH:MM com `if (diff<0) diff+=24h`) **só compensa 1 noite**. Para missão que dura >24h ou que atravessa um dia inteiro, perde múltiplos de 24h e subfatura silenciosamente.
- Caso histórico: TOR-0153 com 35h39min reais foi cobrada como 11h52min (R$ 975 em vez de R$ 3.591), TOR-0159 com 25h40min foi cobrada como 1h40min.
- Quando `horario_agendado` é anterior a `mission_started_at`, o início de cobrança é `scheduled_date + horario_agendado` (em ms), não `mission_started_at`. A função monta o timestamp a partir do `scheduled_date`.
- **NUNCA** voltar a calcular HE só com `horario_inicio`/`horario_fim` HH:MM. Sempre passar timestamps reais nos 13 call-sites de `calcularEscolta`.
- Teste de regressão: `server/billing-calc-hora-extra.test.ts` ("missão de 35h39min (atravessa dia)").

### 8.6 `escort_billings` é 1:1 com `service_orders` — NUNCA usar `.insert()` cego
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

### 8.7 `mission_costs` precisa de `financial_transaction` espelho pra aparecer no Balanço Gerencial
- **Significado de negócio:** o Balanço Gerencial (`client/src/pages/admin/balanco-gerencial.tsx` linhas 351-352, 440-441) **NÃO lê** das colunas `despesas_*`/`desp_*` de `escort_billings` pra somar despesas operacionais. Lê SÓ de `financial_transactions` filtradas por `origin_type` (`fueling`, `mission_cost`, `maintenance`). Se uma despesa entra só em `mission_costs` sem virar tx, **some** do agregado do Balanço (continua aparecendo só no detalhe da OS via legacy `despesas_combustivel/despesas_pedagio`).
- **Regra de código:** toda rota que faz `supabaseAdmin.from("mission_costs").insert(...)` **DEVE** chamar `createAutoTransaction({ origin_type: "mission_cost", origin_id: String(mc.id), ... })` em seguida. **Exceção única:** combustível com `[F#NNN]` no description — esse já está representado em `financial_transactions` com `origin_type=fueling` (criada lá em `mobile.ts:313` / `fleet.ts:415`), e criar uma segunda tx duplicaria a despesa.
- **Caminhos atuais convertidos:**
  - `server/routes/mobile.ts:417,431` (pedagio-missao) — já criam tx em `:450`/`:461`
  - `server/routes/mobile.ts:527` (pedagio-vazio) — já cria tx em `:543`
  - `server/routes/conciliacao.ts:~1186,1231` (TicketLog batch import) — convertido em 25/05/2026 (antes era a fonte dos 581 pedágios órfãos)
- **Quando deletar uma `mission_cost`:** sempre chamar `removeAutoTransaction("mission_cost", String(mc.id))` antes do `.delete()` (já feito em `service-orders.ts:1291`, `mission.ts:2066`/`3067`).
- **Histórico:** auditoria de 25/05/2026 encontrou 10 mission_costs órfãs (R$ 198) + 1 outlier de digitação (mc.id=1488: R$ 169.176,24 era na verdade R$ 169,41 — 1000x errado, fueling F#186 estava correto). Tudo corrigido via `.local/fix_financial_sync.mts`. Cobertura inicial: 1135 tx já existiam corretamente (rota `pedagio-missao` cobria), só faltava o pedágio TicketLog batch e alguns isolados.
- **Sobre as colunas duplicadas `desp_*` (novas, sempre 0) vs `despesas_*` (legadas, em uso):** `desp_combustivel/desp_pedagio/desp_outras/desp_total` são código morto (ninguém escreve). O cron grava nas legadas `despesas_*` (vide `server/billing-calc.ts:346`). Não unificar agora — é refactor separado. UI lê das legadas no detalhe da OS, e do agregado de tx no totalizador.

### 8.8 Cancelar lançamento financeiro só ANTES da aprovação
- **Significado de negócio:** quem cria um lançamento (ex.: ADM) pode **editar** e **cancelar** enquanto ele está `AGUARDANDO_APROVACAO`. Depois que a diretoria aprova (ou recusa), o usuário comum não mexe mais — só a diretoria (DELETE com `requireDiretoria`).
- **Regra de código:** a rota `DELETE /api/financial/transactions/:id/cancelar` (em `server/routes/escort.ts`, `requireAdminRole`) usa a guarda pura `canCancelAguardando` (`server/lib/financial-cancel-guard.ts`): recusa se não existe (404), se é lançamento automático (`origin_type !== "manual"`, 403) ou se o status NÃO é `AGUARDANDO_APROVACAO` (403). Só apaga manual ainda em aprovação. A rota `DELETE /api/financial/transactions/:id` (diretoria) continua intacta para lançamentos já aprovados.
- **Frontend:** na aba "Aguardando Aprovação" de `client/src/pages/admin/financeiro.tsx`, TODOS veem **Editar** + **Cancelar**; só o aprovador vê **Aprovar/Aprovar Série/Recusar**.
- Teste de regressão: `server/lib/financial-cancel-guard.test.ts`.

---

## 9. INSPEÇÃO DO SUPABASE ANTES DE MEXER NO BANCO (OBRIGATÓRIO)

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

---

## 10. SEO DA LANDING PÚBLICA

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
