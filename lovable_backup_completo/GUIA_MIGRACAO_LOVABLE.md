# Torres Vigilância Patrimonial — Guia Completo de Migração para Lovable

## 1. VISÃO GERAL DO SISTEMA

Sistema de gestão operacional para empresa de segurança patrimonial (CNPJ 36.982.392/0001-89).
Inclui: landing page institucional, painel administrativo completo, e interface mobile para funcionários.

### Stack Tecnológica
- **Frontend:** React 18 + TypeScript + Vite + TailwindCSS 3 + shadcn/ui
- **Backend:** Express 5 (Node.js) + Drizzle ORM
- **Banco:** PostgreSQL (Supabase)
- **Auth:** Supabase Auth (Bearer token)
- **Routing:** wouter
- **State:** TanStack React Query v5
- **Charts:** Recharts
- **Icons:** lucide-react + react-icons
- **Forms:** react-hook-form + zod + @hookform/resolvers
- **PDF:** pdfkit, jspdf
- **Excel:** xlsx
- **Animations:** framer-motion

---

## 2. ESTRUTURA DE ARQUIVOS

```
client/src/
├── App.tsx                    # Router principal (34 rotas)
├── main.tsx                   # Entry point
├── index.css                  # CSS variables (tema preto/branco)
├── components/
│   ├── admin/layout.tsx       # Sidebar + header admin (216 linhas)
│   ├── mobile/layout.tsx      # Layout mobile com bottom nav
│   ├── torres-logo.tsx        # Logo SVG inline
│   ├── places-autocomplete.tsx # Google Places input
│   ├── pwa-install-prompt.tsx  # PWA install banner
│   └── ui/                    # 44 componentes shadcn/ui
├── hooks/
│   ├── use-auth.tsx           # AuthProvider + Supabase session
│   ├── use-audit.ts           # Audit logging
│   ├── use-geolocation.ts     # GPS tracking
│   ├── use-mobile.tsx         # Responsive detection
│   ├── use-notification-sound.ts
│   └── use-toast.ts
├── lib/
│   ├── queryClient.ts         # TanStack Query + apiRequest helper
│   ├── supabase.ts            # Supabase client init
│   ├── offlineQueue.ts        # Offline request queue
│   ├── presentation.ts        # Presentation utilities
│   └── utils.ts               # cn() helper
└── pages/
    ├── home.tsx               # Landing page institucional (782 linhas)
    ├── not-found.tsx
    ├── admin/                 # 26 páginas administrativas
    │   ├── login.tsx          # Login dual (CPF funcionário / email gestão)
    │   ├── dashboard.tsx      # Dashboard principal
    │   ├── clients.tsx        # Gestão de clientes (2173 linhas)
    │   ├── employees.tsx      # RH/funcionários (2901 linhas)
    │   ├── vehicles.tsx       # Frota/veículos
    │   ├── service-orders.tsx # Ordens de serviço
    │   ├── operational-grid.tsx # Grid operacional (6083 linhas)
    │   ├── mission.tsx        # Gestão de missões
    │   ├── guia-missao.tsx    # Guia de missão OS
    │   ├── tracker.tsx        # Rastreador de veículos
    │   ├── telemetry.tsx      # Telemetria
    │   ├── weapons.tsx        # Armamento (1376 linhas)
    │   ├── trips.tsx          # Viagens
    │   ├── fueling.tsx        # Abastecimento
    │   ├── maintenance.tsx    # Manutenção
    │   ├── timesheets.tsx     # Controle de ponto
    │   ├── financeiro.tsx     # Módulo financeiro (1517 linhas)
    │   ├── balanco-gerencial.tsx # Balanço/DRE (995 linhas)
    │   ├── boletim-medicao.tsx  # Boletim de medição (798 linhas)
    │   ├── escort-billing.tsx   # Faturamento escort
    │   ├── simulador-missao.tsx # Simulador de custos
    │   ├── consultas.tsx      # Consultas (CPF/CNPJ/Placa)
    │   ├── users.tsx          # Gestão de usuários
    │   ├── audit.tsx          # Auditoria
    │   └── profile.tsx        # Perfil do usuário
    └── mobile/                # 9 páginas mobile
        ├── home.tsx           # Menu principal mobile
        ├── missao.tsx         # Workflow missão (2035 linhas)
        ├── checklist.tsx      # Checklist veicular
        ├── perfil.tsx         # Perfil mobile
        ├── meu-rh.tsx         # Dados RH
        ├── selfie.tsx         # Selfie diária
        ├── ponto.tsx          # Registro de ponto
        ├── abastecimento.tsx  # Registro abastecimento
        └── ocorrencia.tsx     # Registro ocorrência

shared/
├── schema.ts                  # Drizzle schema (786 linhas, 28 tabelas)
└── models/chat.ts

server/
├── index.ts                   # Server bootstrap
├── routes.ts                  # API routes (9942 linhas, ~200 endpoints)
├── storage.ts                 # Storage interface + implementation
├── db.ts                      # Database connection (Supabase)
├── db-init.ts                 # Schema verification
├── auth.ts                    # Auth middleware (Bearer token)
├── supabase.ts                # Supabase admin client
├── cron.ts                    # Scheduled tasks
├── contract-pdf.ts            # PDF generation
├── telemetry-engine.ts        # Telemetry processing
├── apibrasil.ts               # API Brasil integration
├── truckscontrol.ts           # Fleet control
├── vite.ts                    # Vite dev server config
└── static.ts                  # Static file serving
```

---

## 3. ROTAS (34 total)

### Públicas
| Path | Componente | Descrição |
|------|-----------|-----------|
| `/` | Home | Landing page institucional |
| `/admin` | LoginPage | Tela de login |

### Admin (Protected)
| Path | Componente |
|------|-----------|
| `/admin/dashboard` | DashboardPage |
| `/admin/clients` | ClientsPage |
| `/admin/employees` | EmployeesPage |
| `/admin/vehicles` | VehiclesPage |
| `/admin/service-orders` | ServiceOrdersPage |
| `/admin/boletim-medicao` | BoletimMedicaoPage |
| `/admin/trips` | TripsPage |
| `/admin/fueling` | FuelingPage |
| `/admin/maintenance` | MaintenancePage |
| `/admin/timesheets` | TimesheetsPage |
| `/admin/tracker` | TrackerPage |
| `/admin/mission` | MissionPage |
| `/admin/operational-grid` | OperationalGridPage |
| `/admin/telemetria` | TelemetryPage |
| `/admin/guia-missao` | GuiaMissaoPage |
| `/admin/simulador-missao` | SimuladorMissaoPage |
| `/admin/armamento` | WeaponsPage |
| `/admin/usuarios` | UsersPage |
| `/admin/auditoria` | AuditPage |
| `/admin/financeiro` | FinanceiroPage |
| `/admin/balanco-gerencial` | BalancoGerencialPage |
| `/admin/perfil` | ProfilePage |

### Mobile (Protected + Selfie Check)
| Path | Componente |
|------|-----------|
| `/mobile` | MobileHomePage |
| `/mobile/missao` | MobileMissaoPage |
| `/mobile/checklist` | MobileChecklistPage |
| `/mobile/perfil` | MobilePerfilPage |
| `/mobile/meu-rh` | MobileRHPage |
| `/mobile/selfie` | MobileSelfiePage (skipSelfieCheck) |
| `/mobile/ponto` | MobilePontoPage |
| `/mobile/abastecimento` | MobileAbastecimentoPage |
| `/mobile/ocorrencia` | MobileOcorrenciaPage |

---

## 4. SIDEBAR (Menu Admin)

```
Dashboard          /admin/dashboard
Clientes           /admin/clients
Funcionários       /admin/employees
Veículos           /admin/vehicles
Armamento          /admin/armamento
Ordens de Serviço  /admin/service-orders
Boletim Medição    /admin/boletim-medicao
Viagens            /admin/trips
Abastecimento      /admin/fueling
Manutenção         /admin/maintenance
Ponto              /admin/timesheets
Rastreador         /admin/tracker
Missão             /admin/mission
Grid Operacional   /admin/operational-grid
Telemetria         /admin/telemetria
Guia de Missão     /admin/guia-missao
Simulador          /admin/simulador-missao
Consultas          /admin/consultas  [role: admin/diretoria only]
Financeiro         /admin/financeiro [role: admin/diretoria only]
Balanço Gerencial  /admin/balanco-gerencial [role: admin/diretoria only]
Usuários           /admin/usuarios [role: admin/diretoria only]
Auditoria          /admin/auditoria [role: admin/diretoria only]
```

---

## 5. TEMA E DESIGN

### Princípios
- Background SEMPRE branco (`bg-white`)
- UI empresarial preto/branco/cinza
- Font: Inter (todas as variações)
- Mobile: NUNCA mostrar clientName
- Shadcn/ui para todos os componentes

### CSS Variables (index.css)
- Light mode: fundo branco, texto preto
- Dark mode: fundo escuro, texto claro
- Sem cores vibrantes - esquema monocromático
- Border-radius padrão: 0.5rem

### Cores de Status
- online: rgb(34 197 94) verde
- away: rgb(245 158 11) amarelo
- busy: rgb(239 68 68) vermelho
- offline: rgb(156 163 175) cinza

---

## 6. AUTENTICAÇÃO

### Fluxo
1. Login por CPF (funcionário) ou Email (gestão)
2. CPF → chama `/api/auth/cpf-lookup` → retorna email sintético `cpf_XXX@torresseguranca.local`
3. `supabase.auth.signInWithPassword({ email, password })`
4. Token Bearer enviado via `Authorization: Bearer <token>` em todas as requests
5. Backend valida token via Supabase e busca user na tabela `users`

### Roles
- `diretoria` — acesso total + criação de diretoria
- `admin` — acesso administrativo (sem criar diretoria)
- `funcionario` — acesso mobile apenas

### Tabela users (SEM coluna password)
```
id, username, name, role, employee_id, must_change_password, 
supabase_uid, email, avatar_url, created_at, 
terms_accepted_at, terms_ip_address, terms_user_agent
```

---

## 7. TABELAS DO BANCO (28 tabelas)

### Core
- users, employees, clients, vehicles, weapons

### Operacional
- service_orders, trips, fueling_records, maintenance_records, timesheets
- mission_photos, login_selfies, vehicle_inspections, inspection_items
- audit_logs, mission_notifications

### Financeiro (Supabase-only, não no Drizzle)
- financial_transactions, financial_categories, financial_accounts
- escort_billings, escort_contracts, escort_routes, service_contracts

### RH
- perfil_acesso, employee_documents

### Config
- operational_bases

---

## 8. API ENDPOINTS (Principais)

### Auth
- POST `/api/auth/cpf-lookup` — busca email por CPF
- GET `/api/auth/me` — perfil do usuário logado
- POST `/api/auth/change-password`
- POST `/api/auth/accept-terms`
- GET `/api/auth/setup-check`
- POST `/api/auth/login-selfie`
- GET `/api/auth/login-selfie-today`

### CRUD Padrão (GET/POST/PATCH/DELETE)
- `/api/clients`
- `/api/employees`
- `/api/vehicles`
- `/api/weapons`
- `/api/service-orders`
- `/api/trips`
- `/api/fueling`
- `/api/maintenance`
- `/api/timesheets`
- `/api/users`

### Operacional
- GET `/api/operational-grid` — grid completo
- GET `/api/vehicle-tracking` — rastreamento
- POST `/api/mission/:id/step` — atualizar etapa missão
- POST `/api/mission/:id/photo` — enviar foto missão
- GET `/api/mission/:id/photos` — listar fotos
- POST `/api/vehicle-inspection` — checklist veicular

### Financeiro
- GET/POST `/api/financial/transactions`
- GET/POST `/api/financial/categories`
- GET/POST `/api/financial/accounts`
- GET `/api/financial/summary`
- GET/POST `/api/escort-billing`
- GET/POST `/api/escort-contracts`
- POST `/api/escort-billing/:id/recalculate`

### Consultas
- GET `/api/cpf-lookup/:cpf`
- GET `/api/cnpj-lookup/:cnpj`
- GET `/api/placa-lookup/:placa`

---

## 9. DEPENDÊNCIAS NPM

### Essenciais (Lovable)
```
@supabase/supabase-js, @tanstack/react-query, wouter,
react-hook-form, @hookform/resolvers, zod, drizzle-zod,
lucide-react, react-icons, recharts, date-fns,
class-variance-authority, clsx, tailwind-merge,
framer-motion, xlsx, jspdf, cmdk
```

### Shadcn/ui (Radix)
```
@radix-ui/react-dialog, @radix-ui/react-select,
@radix-ui/react-tabs, @radix-ui/react-toast,
@radix-ui/react-dropdown-menu, @radix-ui/react-popover,
@radix-ui/react-checkbox, @radix-ui/react-switch,
@radix-ui/react-scroll-area, @radix-ui/react-separator,
@radix-ui/react-tooltip, @radix-ui/react-avatar,
@radix-ui/react-accordion, @radix-ui/react-alert-dialog,
@radix-ui/react-label, @radix-ui/react-progress,
@radix-ui/react-radio-group, @radix-ui/react-slider,
@radix-ui/react-toggle, @radix-ui/react-toggle-group
```

### Backend
```
express, drizzle-orm, pg, @supabase/supabase-js,
nodemailer, node-cron, pdfkit, sharp, qrcode,
express-session, ws, openai
```

---

## 10. REGRAS DE MIGRAÇÃO OBRIGATÓRIAS

1. **NÃO adicionar coluna `password` na tabela users** — autenticação é via Supabase Auth
2. **Manter tema monocromático** — preto/branco/cinza, sem cores vibrantes
3. **Font Inter** em todo o sistema
4. **Mobile nunca mostra clientName** — segurança operacional
5. **Roles: admin e diretoria são admin-equivalentes** para permissões
6. **Bearer token** (não cookies) para autenticação
7. **apiRequest** para todas as chamadas API (com token automático)
8. **queryClient.invalidateQueries** após toda mutation
9. **Manter estrutura de sidebar** exatamente como documentada
10. **CCT SP 2025/2026**: salarioBase 2432.50, periculosidade 30%, VR 40/dia
11. **Workflow missão**: embarque → deslocamento → chegada → operação → retorno → finalizada → encerrada
12. **KM billing**: sempre usar km_chegada como KM inicial, fallback km_saida
13. **Vehicle liberation**: veículo livre quando missionStatus in [finalizada, retorno_base, chegada_base, encerrada]

---

## 11. SUPABASE CONFIG

```
URL: (configurar via VITE_SUPABASE_URL)
ANON KEY: (configurar via VITE_SUPABASE_ANON_KEY)
SERVICE ROLE KEY: (server-side only via SUPABASE_SERVICE_ROLE_KEY)
DATABASE URL: (server-side via SUPABASE_DATABASE_URL)
```

### RLS Policies
- Tabelas financeiras usam RPC `exec_sql` para operações
- Users table: acesso público com filtro por supabase_uid

---

## 12. CONTAGEM TOTAL DE CÓDIGO

| Área | Linhas |
|------|--------|
| Pages Admin (26) | ~24,000 |
| Pages Mobile (9) | ~6,200 |
| Components | ~5,500 |
| Hooks + Lib | ~800 |
| Schema | 786 |
| Routes (API) | 9,942 |
| Storage | 704 |
| Config | ~400 |
| **TOTAL** | **~48,000 linhas** |
