# 🧠 SYSTEM_BRAIN.md — Contexto Mestre do Torres Vigilância Patrimonial

> **Leia este arquivo ANTES de qualquer tarefa.** Ele contém as regras primordiais, a arquitetura, as dependências e as lições aprendidas que NUNCA devem ser violadas.

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
| **Caminhos de Acesso** | `storage.*` = Supabase REST API (camelCase). `db.*` = Drizzle ORM via `SUPABASE_DATABASE_URL`. `supabaseAdmin.from(...)` = REST API direto (snake_case). Todos acessam o MESMO banco. |
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

## 2. MAPA DE ARQUIVOS CRÍTICOS

### Backend (server/)
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

### Frontend (client/src/)
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
