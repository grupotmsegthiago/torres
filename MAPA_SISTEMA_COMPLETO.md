# MAPA DO SISTEMA — Torres Vigilância Patrimonial
## Visão 360° para Auditoria Externa

**Empresa:** Torres Vigilância Patrimonial
**CNPJ:** 36.982.392/0001-89
**Data:** 07/04/2026
**Gerado por:** Agent Replit (auditoria solicitada pelo Thiago)

---

## 1. ESTRUTURA DE ARQUIVOS (Tree View)

```
📁 Torres Vigilância Patrimonial
├── 📁 client/src/
│   ├── App.tsx                          # Router principal (admin + mobile)
│   ├── main.tsx                         # Entry point React
│   ├── 📁 components/
│   │   ├── chat-widget.tsx              # Widget de chat global + MissionInviteCard (705 linhas)
│   │   ├── places-autocomplete.tsx      # Autocomplete Google Maps
│   │   ├── pwa-install-prompt.tsx       # Prompt de instalação PWA
│   │   └── torres-logo.tsx             # Logo da empresa
│   ├── 📁 hooks/
│   │   ├── use-auth.tsx                 # Autenticação Supabase Auth + RBAC (122 linhas)
│   │   ├── use-audit.ts                # Hook de auditoria
│   │   ├── use-geolocation.ts          # GPS do agente
│   │   ├── use-mobile.tsx              # Detecção mobile
│   │   ├── use-notification-sound.ts   # Som de notificação
│   │   └── use-toast.ts               # Toasts shadcn
│   ├── 📁 lib/
│   │   ├── utils.ts                    # parseUTCDate, formatBRT, formatDateBRT, formatTimeBRT, ensureUTC
│   │   ├── queryClient.ts             # TanStack Query config, apiRequest, authFetch, Realtime sync
│   │   ├── supabase.ts                # Cliente Supabase frontend
│   │   ├── offlineQueue.ts            # Fila offline para agentes em campo
│   │   └── presentation.ts           # Utilidades de formatação
│   └── 📁 pages/
│       ├── home.tsx                    # Landing page institucional + cotação
│       ├── access-denied.tsx          # Tela de acesso negado
│       ├── not-found.tsx              # 404
│       └── 📁 admin/                  # ← PAINEL ADMINISTRATIVO
│           ├── operational-grid.tsx    # Grid Operacional principal (7.909 linhas)
│           ├── service-orders.tsx      # Gerenciamento de OS
│           ├── employees.tsx          # Pasta do Funcionário (8 tabs)
│           ├── clients.tsx            # Pasta do Cliente (6 tabs)
│           ├── financeiro.tsx         # Dashboard Financeiro (1.609 linhas)
│           ├── boletim-medicao.tsx    # Boletim de Medição (1.286 linhas)
│           ├── balanco-gerencial.tsx  # Balanço Gerencial (1.645 linhas)
│           ├── faturas.tsx            # Gestão de Faturas (729 linhas)
│           ├── escort-billing.tsx     # Billing de Escolta (615 linhas)
│           ├── relatorio-faturamento.tsx # Relatório de Faturamento (841 linhas)
│           ├── chat.tsx               # Chat Admin
│           ├── tracker.tsx            # Rastreamento de Viaturas
│           ├── telemetry.tsx          # Telemetria
│           ├── fleet.tsx              # Frota
│           ├── fueling.tsx            # Abastecimento
│           ├── ponto-operacional.tsx  # Ponto Operacional
│           ├── audit.tsx              # Logs de Auditoria
│           ├── consultas.tsx          # Consultas API Brasil
│           ├── calculadora-jornada.tsx# Calculadora de Jornada CCT
│           └── alertas-dashboard.tsx  # Dashboard de Alertas
│       └── 📁 mobile/                # ← APP MOBILE (PWA)
│           ├── missao.tsx             # Tela de Missão do Agente
│           ├── chat.tsx               # Chat Mobile
│           ├── meu-rh.tsx            # RH do Agente
│           ├── ocorrencia.tsx        # Registro de Ocorrências
│           ├── ponto-operacional.tsx  # Ponto Mobile
│           └── fueling.tsx           # Abastecimento Mobile
│
├── 📁 server/
│   ├── index.ts                       # Entry point Express (TZ=America/Sao_Paulo)
│   ├── db.ts                          # Pool PostgreSQL (SUPABASE_DATABASE_URL, SET timezone)
│   ├── supabase.ts                    # supabaseAdmin (REST API)
│   ├── auth.ts                        # Middleware JWT Supabase + RBAC
│   ├── storage.ts                     # Interface IStorage (Supabase REST)
│   ├── routes.ts                      # Registro de rotas + syncFuelingMissionCosts (1.430 linhas)
│   ├── billing-calc.ts               # calcularFaturamentoLive, getHorasElapsedFromDB
│   ├── cron.ts                        # Tarefas agendadas (billing alerts, compliance)
│   ├── db-init.ts                     # Migrations + inicialização
│   ├── audit.ts                       # logSystemAudit
│   ├── apibrasil.ts                   # Consultas CNPJ/CPF/Veículo
│   ├── asaas.ts                       # Integração Asaas (boletos/PIX)
│   ├── contract-pdf.ts               # Geração PDF de contratos
│   ├── truckscontrol.ts              # API TrucksControl (rastreamento)
│   ├── telemetry-engine.ts           # Motor de telemetria
│   ├── static.ts                      # Assets estáticos
│   ├── vite.ts                        # Dev server Vite
│   └── 📁 routes/                    # ← 13 MÓDULOS DE ROTAS
│       ├── operational.ts             # Grid Operacional + DRE ao vivo (895 linhas)
│       ├── service-orders.ts         # CRUD de OS + lifecycle de missão
│       ├── chat.ts                   # Chat + convites + aceite de missão
│       ├── mission.ts                # Aceite de missão + comprovante PDF
│       ├── escort.ts                 # Boletim de medição + faturamento
│       ├── mobile.ts                 # Endpoints mobile (abastecimento, pedágio)
│       ├── fleet.ts                  # Frota (tracking, telemetria)
│       ├── hr.ts                     # RH (documentos, contratos, ponto)
│       ├── employees.ts             # CRUD funcionários
│       ├── clients.ts               # CRUD clientes
│       ├── vehicles.ts              # CRUD veículos
│       ├── consultas.ts             # Consultas API Brasil
│       └── _helpers.ts              # Funções utilitárias compartilhadas
│
├── 📁 shared/
│   ├── schema.ts                     # Drizzle schema (todas as tabelas)
│   └── models/chat.ts               # Tipos TypeScript do chat
│
├── 📄 SYSTEM_BRAIN.md                # ← REGRAS PRIMORDIAIS (documento mestre)
├── 📄 RULES.md                       # ← DIRETRIZES IMUTÁVEIS
├── 📄 DOCUMENTACAO_CHAT_INTERNO.md   # ← Timeline de desenvolvimento
├── 📄 DOCUMENTACAO_COMPLETA.md       # Documentação geral
├── 📄 AUDITORIA_CHAT_SISTEMA.md     # Auditoria do chat
├── 📄 replit.md                      # Configuração Replit
├── 📄 drizzle.config.ts             # Config Drizzle ORM
├── 📄 vite.config.ts                # Config Vite
├── 📄 tailwind.config.ts            # Config Tailwind CSS
├── 📄 package.json                  # Dependências
└── 📄 components.json               # Config shadcn/ui
```

---

## 2. TABELAS DO SUPABASE (68 tabelas)

### Operacional (Core)
| Tabela | Função |
|--------|--------|
| `service_orders` | Ordens de Serviço (OS) — núcleo operacional |
| `mission_updates` | Atualizações de missão (status, fotos, GPS) |
| `mission_positions` | Posições GPS do veículo durante missão |
| `mission_photos` | Fotos de missão (KM saída, chegada, etc.) |
| `mission_costs` | Custos reais da missão (combustível, pedágio, etc.) |
| `mission_acceptances` | Aceites formais de missão (pendente/aceito/recusado/expirado) |
| `ocorrencias` | Ocorrências registradas em campo |

### Financeiro
| Tabela | Função |
|--------|--------|
| `financial_transactions` | Transações financeiras (receitas, despesas, fueling) |
| `financial_accounts` | Contas bancárias |
| `financial_categories` | Categorias de despesa/receita |
| `financial_audit_logs` | Logs de auditoria financeira |
| `escort_billings` | Faturamento de escoltas |
| `escort_contracts` | **Tabela de preços** (acionamento, franquia, km, hora extra, VRP) |
| `escort_routes` | Rotas de escolta |
| `billing_alerts` | Alertas de faturamento |
| `invoices` | Faturas geradas |
| `jornada_calculos` | Cálculos de jornada CCT |

### Frota
| Tabela | Função |
|--------|--------|
| `vehicles` | Cadastro de viaturas |
| `veiculos` | Veículos legados |
| `vehicle_fueling` | **Registros de abastecimento** (litros, custo, estação, GPS) |
| `vehicle_maintenance` | Manutenções |
| `vehicle_assignments` | Designações de viatura |
| `telemetry_events` | Eventos de telemetria |
| `trips` | Viagens registradas |

### RH / Funcionários
| Tabela | Função |
|--------|--------|
| `employees` | Cadastro de funcionários |
| `employee_documents` | Documentos do funcionário |
| `employee_absences` | Faltas e atestados |
| `employee_fines` | Multas |
| `employee_disciplinary` | Ações disciplinares |
| `employee_occurrences` | Ocorrências |
| `employee_payslips` | Holerites |
| `employee_salaries` | Salários |
| `employee_salary_discounts` | Descontos salariais |
| `employee_timesheets` | Folhas de ponto |
| `timesheets` | Timesheet geral |
| `ponto_operacional` | Ponto operacional (check-in/out) |

### Clientes
| Tabela | Função |
|--------|--------|
| `clients` | Cadastro de clientes |
| `client_vehicles` | Veículos do cliente |
| `client_forwards` | Encaminhamentos |
| `service_contracts` | Contratos de serviço |

### Armamento
| Tabela | Função |
|--------|--------|
| `weapons` | Cadastro de armas |
| `weapon_assignments` | Designações de arma |
| `weapon_kits` | Kits de armamento |
| `weapon_kit_items` | Itens do kit |
| `armamentos` | Armamentos legado |

### Chat
| Tabela | Função |
|--------|--------|
| `chat_conversations` | Conversas (direct, group, mission) |
| `chat_messages` | Mensagens |
| `chat_participants` | Participantes das conversas |
| `chat_presence` | Status online/offline |

### Localização / Rastreamento
| Tabela | Função |
|--------|--------|
| `agent_locations` | Última localização do agente |
| `agent_location_history` | Histórico de localizações |
| `reference_points` | Pontos de referência (bases, clientes) |
| `postos` | Postos de combustível cadastrados |

### Sistema / Segurança
| Tabela | Função |
|--------|--------|
| `users` | Usuários do sistema |
| `perfis_acesso` | Perfis de acesso (RBAC) |
| `login_selfies` | Selfies de login |
| `token_failure_logs` | Falhas de token |
| `api_logs` | Logs de API |
| `audit_logs` | Logs de auditoria geral |
| `system_audit_logs` | Logs de auditoria do sistema |
| `system_settings` | Configurações do sistema |
| `company_documents` | Documentos da empresa |
| `configuracoes_email` | Configurações de e-mail |
| `documentos_arquivados` | Documentos arquivados |
| `gerenciadoras` | Gerenciadoras de risco |
| `homologation_logs` | Logs de homologação |

---

## 3. PILAR 1: AUTENTICAÇÃO (`client/src/hooks/use-auth.tsx`)

**Como o sistema diferencia Diretoria (Thiago/Mickael) de Agente:**

```typescript
type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: string;              // ← "diretoria", "admin", "funcionario"
  supabaseUid: string | null;
  username: string | null;
  avatarUrl: string | null;
  employeeId: number | null; // ← null para diretoria, preenchido para agentes
  mustChangePassword: boolean;
  termsAcceptedAt: string | null;
  matricula: string | null;
};
```

**Fluxo de Login:**
1. `supabase.auth.signInWithPassword({ email, password })` → JWT Supabase
2. `GET /api/auth/me` com `Authorization: Bearer <token>` → retorna perfil do `users` + `perfis_acesso`
3. `queryClient.setQueryData(["/api/auth/me"], data)` → cache global

**Controle de acesso no backend:**
- `requireAuth` → valida JWT em toda rota
- `requireAdminRole` → bloqueia agentes (só admin/diretoria)
- `requireDiretoria` → só diretoria (Thiago)

**O que cada perfil vê:**
| Recurso | Diretoria | Admin | Agente (Funcionário) |
|---------|-----------|-------|---------------------|
| Grid Operacional | ✅ Completo com DRE | ✅ Completo com DRE | ❌ Bloqueado |
| Financeiro | ✅ Total | ✅ Total | ❌ Bloqueado |
| Chat | ✅ Todas conversas | ✅ Todas conversas | ✅ Apenas suas |
| Mobile Missão | ❌ | ❌ | ✅ Suas missões |
| Card de Missão | Vê status de aceite de todos | Vê status de aceite de todos | Vê botão ACEITAR/RECUSAR |
| Pasta Funcionário | ✅ Todos | ✅ Todos | ❌ Só seu RH via mobile |

---

## 4. PILAR 2: LÓGICA OPERACIONAL (`server/routes/operational.ts`)

### 4.1 Endpoint Principal: `GET /api/operational-grid`

**Fluxo resumido:**

```
1. Busca TODAS as service_orders
2. Filtra activeOrders:
   - status em_andamento/aberta/agendada (não encerrada)
   - OU concluída/encerrada MAS com data de hoje
3. Para cada OS ativa:
   a. Busca client, vehicle, employee1, employee2
   b. Busca tracker (TrucksControl ou custom)
   c. Calcula DRE ao vivo (liveCost)
```

### 4.2 Cache de Combustível (vehicleFuelCache)

```typescript
// Linha 67-89: Busca SOMENTE transações de abastecimento de HOJE
const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const vehicleFuelCache = new Map<string, number>();

const { data: allFuelRecords } = await supabaseAdmin.from("financial_transactions")
  .select("amount, description, created_at")
  .eq("origin_type", "fueling")
  .gte("created_at", todayStr + "T00:00:00")   // ← FILTRO: apenas HOJE
  .lte("created_at", todayStr + "T23:59:59")   // ← FILTRO: apenas HOJE
  .limit(200);

// Mapeia placa → soma dos abastecimentos do dia
for (const fr of allFuelRecords) {
  const desc = (fr.description || "").toUpperCase();
  for (const gv of gridVehicles) {
    const plate = gv.plate?.toUpperCase() || "";
    if (desc.includes(plate)) {
      vehicleFuelCache.set(plate, (vehicleFuelCache.get(plate) || 0) + Number(fr.amount || 0));
    }
  }
}
```

### 4.3 Alocação de Combustível (vehicleFuelFirstOS)

```typescript
// Linha 91-114: Garante que combustível é alocado APENAS na 1ª OS da viatura no dia
const vehicleFuelFirstOS = new Map<string, number>();

// Prioridade 1: OS que já tem fuel_allocated=true
for (const o of activeOrders) {
  const fuelKey = `${vPlate}:${oDate}`;
  if (o.fuelAllocated === true) {
    vehicleFuelFirstOS.set(fuelKey, o.id);
  }
}
// Prioridade 2: Primeira OS que não tem fuel_allocated=false
for (const o of activeOrders) {
  const fuelKey = `${vPlate}:${oDate}`;
  if (!vehicleFuelFirstOS.has(fuelKey) && o.fuelAllocated !== false) {
    vehicleFuelFirstOS.set(fuelKey, o.id);
  }
}
```

### 4.4 Cálculo do DRE por OS (Linhas 218-400)

```
Para cada OS do tipo "escolta":
1. Busca fotos de KM (km_saida, km_chegada, km_final)
2. Calcula horas via getHorasElapsedFromDB(osId)
3. Busca contrato (escort_contracts) pelo escortContractId ou clientId
4. Calcula faturamento via calcularFaturamentoLive({ horasMissao, kmInicial, kmFinal, contrato })
5. Busca mission_costs reais da OS:
   - Combustível: category LIKE '%combustível%'
   - Pedágio: category LIKE '%pedágio%'
   - Outros: tudo o que sobra
6. Se não tem custo de combustível real E missão ativa → usa vehicleFuelCache (fallback HOJE)
7. Margem = (Faturamento - Custo Total) / Faturamento * 100
8. Se OS concluída e sem custos_congelados_em → CONGELA os valores para não recalcular
```

### 4.5 Congelamento de Custos (Linhas 349-366)

```typescript
// Quando OS é concluída, congela todos os valores para nunca mais recalcular
if ((status === "concluida" || status === "concluída" || missionStatus === "encerrada") && !custos_congelados_em) {
  await supabaseAdmin.from("service_orders").update({
    fat_calculado: frozenFat,
    custo_combustivel_alocado: frozenComb,
    custo_pedagio_alocado: frozenPed,
    custo_pagamento_alocado: frozenPag,
    custo_outros_alocado: frozenOut,
    custo_total_alocado: frozenCustoTotal,
    lucro_calculado: frozenLucro,
    margem_calculada: frozenMargem,
    horas_missao_calculadas: frozenHoras,
    km_total_calculado: frozenKm,
    custos_congelados_em: new Date().toISOString(), // ← Marca como congelado
    custos_congelados_por: "system",
  }).eq("id", o.id);
}
```

---

## 5. PILAR 3: SYNC DE ABASTECIMENTO (`server/routes.ts`)

### Função: `syncFuelingMissionCosts()` (Executada 5s após boot do servidor)

```typescript
// CORREÇÃO APLICADA EM 07/04/2026 10:05 BRT

async function syncFuelingMissionCosts() {
  // 1. Busca OS ativas (em_andamento)
  const { data: activeOs } = await supabaseAdmin.from("service_orders")
    .select("id, os_number, vehicle_id, created_at, scheduled_date, mission_status")
    .in("status", ["ativa", "em_andamento", "em andamento"]);

  for (const os of activeOs) {
    // 2. TRAVA: Ignora missões não iniciadas
    const missionStarted = os.mission_status && !["aguardando", "agendada"].includes(os.mission_status);
    if (!missionStarted) continue;

    // 3. FILTRO DE DATA EXATA: Calcula data BRT da missão
    const osDateBRT = new Date(os.scheduled_date || os.created_at)
      .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

    // 4. Busca abastecimentos SOMENTE da data da missão
    const { data: fuelings } = await supabaseAdmin.from("vehicle_fueling")
      .eq("vehicle_id", os.vehicle_id)
      .eq("date", osDateBRT)           // ← DATA EXATA, não mais >= created_at

    for (const f of fuelings) {
      // 5. CHECK DE DUPLICIDADE: Verifica se já está vinculado a QUALQUER OS
      const { data: alreadyLinked } = await supabaseAdmin.from("mission_costs")
        .ilike("description", `%[F#${f.id}]%`)
        .limit(1);
      if (alreadyLinked?.length) continue; // ← Pula se já existe em outra OS

      // 6. Insere mission_cost vinculado
      await supabaseAdmin.from("mission_costs").insert({
        service_order_id: os.id,
        category: "Combustível",
        description: `Abastecimento ${plate} - ${f.fuel_type} ${f.liters}L (${f.station}) [F#${f.id}]`,
        amount: f.total_cost,
        cost_type: "expense",
      });
    }
  }
}
```

**Regras de negócio implementadas:**
1. Somente abastecimentos da **data exata** da missão são vinculados
2. Missões não iniciadas (aguardando/agendada) **nunca** recebem custo
3. Um registro de abastecimento **nunca** é contabilizado em mais de uma OS
4. O tag `[F#id]` no campo `description` garante rastreabilidade

---

## 6. PILAR 4: FATURAMENTO

### Telas de Billing (6 telas):

| Tela | Arquivo | Linhas | Função |
|------|---------|--------|--------|
| **Financeiro** | `financeiro.tsx` | 1.609 | Dashboard: receitas, despesas, fluxo de caixa, contas a pagar/receber |
| **Boletim de Medição** | `boletim-medicao.tsx` | 1.286 | Medição por cliente: ciclo 15/30 dias, gera fatura |
| **Balanço Gerencial** | `balanco-gerencial.tsx` | 1.645 | Relatório mensal: DRE consolidado, margem por cliente |
| **Faturas** | `faturas.tsx` | 729 | CRUD de faturas, integração Asaas (boleto/PIX) |
| **Escort Billing** | `escort-billing.tsx` | 615 | Tabela de preços por contrato |
| **Relatório Faturamento** | `relatorio-faturamento.tsx` | 841 | Exportação Excel, filtros por período |

### Motor de Cálculo (`server/billing-calc.ts`):

```typescript
function calcularFaturamentoLive({ horasMissao, kmInicial, kmFinal, contrato }) {
  // Valores do contrato:
  // - valor_acionamento (R$): Fixo por missão
  // - franquia_horas (h): Horas incluídas no acionamento
  // - franquia_km (km): KM incluídos
  // - valor_hora_extra (R$/h): Acima da franquia
  // - valor_km_extra (R$/km): Acima da franquia
  // - valor_km_carregado (R$/km): KM com carga
  // - vrp_base (R$): Verba de responsabilidade patrimonial (custo fixo agente)

  const kmTotal = kmFinal - kmInicial;
  const horasExcedentes = Math.max(0, horasMissao - franquia_horas);
  const kmExcedente = Math.max(0, kmTotal - franquia_km);

  const fat_acionamento = valor_acionamento;
  const fat_hora_extra = horasExcedentes * valor_hora_extra;
  const fat_km = kmExcedente * valor_km_extra;
  const fat_total = fat_acionamento + fat_hora_extra + fat_km;

  return { fat_total, fat_acionamento, fat_hora_extra, fat_km, km_total, horas_excedentes, has_acionamento };
}
```

### Ciclos de Faturamento:
- **por_missao**: Fatura imediatamente após conclusão
- **quinzenal**: Cortes dia 1 e 16 de cada mês
- **mensal**: Corte dia 1

### Endpoint Gerar Fatura:
`POST /api/boletim-medicao/gerar-fatura/:clientId` → Cria fatura no Asaas + registro na tabela `invoices`

---

## 7. REGRAS GLOBAIS (SYSTEM_BRAIN.md)

### Fuso Horário
- **Banco:** Supabase armazena timestamps em UTC, SEM sufixo 'Z'
- **Frontend:** Sempre `parseUTCDate(ts)` antes de `new Date()`, sempre `timeZone: "America/Sao_Paulo"` na exibição
- **Backend:** `process.env.TZ = "America/Sao_Paulo"` em index.ts, `SET timezone = 'America/Sao_Paulo'` em cada conexão do pool
- **Funções:** `formatBRT()`, `formatDateBRT()`, `formatTimeBRT()` em `client/src/lib/utils.ts`

### Combustível
- Custos NUNCA herdam de missões anteriores
- `vehicleFuelCache` filtra por hoje (BRT)
- Missões agendada/aberta NUNCA recebem custo estimado
- `vehicleFuelFirstOS` garante alocação na 1ª OS da viatura no dia

### Financeiro
- Fonte única: Supabase (financial_transactions, mission_costs, escort_billings)
- Pedágio com missão = 2 registros (expense + revenue), impacto líquido zero
- Valores congelados em OS concluída (custos_congelados_em)
- Margem: ≥30% verde, ≥15% âmbar, <15% vermelho

### Missão
- missionStartedAt setado no primeiro checkout (checkout_armamento)
- Billing hora extra usa missionStartedAt como início
- Early Start: missões >30min no futuro requerem aprovação admin
- Aceite: tabela mission_acceptances com expiração automática (CRON 2h)

### Segurança
- Supabase Auth via JWT, RBAC via perfis_acesso
- API calls: sempre authFetch ou apiRequest, nunca fetch direto
- IDOR protegido em aceite de missão (employeeId do JWT)
- OS status com acento: normalizar antes de comparar

---

## 8. LIÇÕES APRENDIDAS (Regressões Históricas)

| ID | Erro | Causa | Correção |
|----|------|-------|----------|
| L001 | Horário 11:00h exibido como 08:00h | `new Date()` sem ensureUTC | parseUTCDate + timeZone: "America/Sao_Paulo" |
| L002 | R$ 590,88 fantasma no DRE da TOR-0018 | vehicleFuelCache sem filtro de data | Filtro por dia atual + check duplicidade cross-OS |
| L003 | data_missao desloca data em -1 dia | date-only no PostgreSQL = UTC midnight | ISO timestamp completo |
| L004 | Duplicidade de custos em múltiplas OS | Sem vehicleFuelFirstOS | fuelKey = plate:date, primeira OS herda |
| L005 | Chat permitia envio entre funcionários | Sem validação de perfil | Non-admins bloqueados |
| L006 | IDOR em aceite de missão | employeeId do body | Extraído do JWT |

---

*Mapa gerado em 07/04/2026 10:20 BRT para auditoria externa.*
