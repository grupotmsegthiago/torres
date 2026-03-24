# Torres Vigilância Patrimonial - Website & Sistema Interno

## Overview
This project develops an institutional landing page and an internal management system for Torres Vigilância Patrimonial, a Brazilian security company authorized by the Federal Police. The system aims to streamline operational workflows, manage assets, track employees and vehicles, and enhance overall efficiency. Key capabilities include comprehensive user and role management, detailed asset tracking (vehicles, weapons), automated operational processes like service order management and mission workflows, and real-time operational oversight through an advanced grid system. The business vision is to provide a robust, integrated platform that supports the company's growth, ensures compliance, and improves the quality of security services offered.

## User Preferences
I prefer clear and direct communication. When making changes, prioritize iterative development with clear explanations for each step. For any significant architectural or design decisions, please ask for my approval before proceeding. Ensure all code is well-documented and follows modern TypeScript and React best practices. I value a clean, maintainable codebase.

## System Architecture
The system is built on a modern web stack: React with TypeScript and Vite for the frontend, and Express with Supabase Auth for the backend. PostgreSQL, managed via Drizzle ORM, serves as the primary database. Tailwind CSS is used for styling, ensuring a consistent and professional brand aesthetic with a monochrome color palette (black/white) and specific typography (Montserrat/Inter). UI components adhere to an "Enterprise UI" redesign featuring standardized input fields, buttons, and table styles for a polished user experience.

**Key Technical Implementations & Design Choices:**
-   **Authentication:** JWT-based authentication via Supabase Auth, with robust Role-Based Access Control (RBAC) managed through a `perfis_acesso` table. No session cookies are used.
-   **Data Management:** Drizzle ORM facilitates database interactions. A `DatabaseStorage` class provides generic CRUD operations for various entities.
-   **Operational Grid:** A central feature providing real-time vehicle tracking, status monitoring (speed alerts, idle/stopped time, signal loss), SP Rodízio detection, and integration with risk management companies (Gerenciadoras).
-   **Mobile Interface (Field Agents):** A dedicated mobile-first interface for field agents, accessible to users with the `funcionario` role, supporting mission workflows, checklists, GPS tracking, and photo capture with compression.
-   **Smart OCR Uploads:** Integration with OpenAI Vision for intelligent data extraction from documents (CNH, CNV, weapon registrations) during employee and weapon registration, auto-filling form fields.
-   **Vehicle Tracking Integration:** Utilizes TrucksControl / NewRastreamentoOnline SOAP webservice for real-time vehicle positions and telemetry (ignition, GPS, speed).
-   **API Design:** All API endpoints are defined in `server/routes.ts`, covering comprehensive CRUD and operational functionalities for entities like clients, employees, vehicles, service orders, and weapons.
-   **Brand & UI Design System:** Professional black/white aesthetic, Montserrat/Inter fonts, specific styling for UI elements (inputs, buttons, tables) ensuring consistency. DIRETORIA role is visually accented with a crown icon and amber/golden tones.
-   **Google Maps Integration:** Used for location services and autocomplete, particularly in the Escort Calculator and operational grid.
-   **Automated Tasks:** Cron jobs are set up for fleet monitoring and HR compliance checks using `node-cron`.

## External Dependencies
-   **Supabase:** Primary authentication provider (Supabase Auth) and PostgreSQL database hosting.
-   **OpenAI Vision:** Integrated via Replit AI Integrations for OCR capabilities in document processing (employee and weapon registration).
-   **TrucksControl / NewRastreamentoOnline:** SOAP webservice for real-time vehicle tracking data. Supports sending remote commands (bloquear/desbloquear/sirene) via `POST /api/truckscontrol/command` with `{vehicleId, command}`. Commands resolve the TC `veiID` from the vehicle's `truckscontrolIdentifier` or by plate match in the TC vehicle cache. Also supports **vehicle mirroring (espelhamento)** via `RequestNovoEspelhamentoVeiculo`, `RequestVeiculoEspelhado`, `RequestEspelhamentoPendenteVeiculo`, `RequestAREspelhamentoVeiculo`, and `RequestCancelarEspelhamentoVeiculo` XML endpoints. The gerenciadoras table stores TC-specific config: `tc_permissao_comando`, `tc_ie`, `tc_tie`, `tc_validade`, `tc_posso_cancelar`, `tc_comando_exclusivo`, `tc_compartilhar_dados`. Frontend dialog at operational grid has 3 tabs: Cadastro (CRUD + espelhar), Espelhados (list mirrored vehicles), Pendentes (accept/reject pending mirrors).
-   **BrasilAPI:** Used for CPF lookup functionality.
-   **PWA (Progressive Web App):** Manifest at `/manifest.json`, service worker at `/sw.js`, install prompt component in `pwa-install-prompt.tsx`. Supports "Add to Home Screen" on Android (via beforeinstallprompt) and iOS (guide for Safari share menu). Cached assets for offline access. Icons generated from favicon in sizes 72–512px.
-   **Telemetry Engine:** Automatic detection of speed violations (>120 km/h) and excessive idle (engine on + stopped >5 min). Events are logged to `telemetry_events` table with plate, speed/duration, GPS position, address, and driver name. Processed on every vehicle-tracking API poll. Dashboard at `/admin/telemetria` shows: 4 KPI cards, speed/idle event tables, vehicle ranking, and estimated fuel cost from idle (0.015 L/min × R$6.50/L).
-   **Google Maps Platform:** Provides mapping services, Places API for autocomplete, and location functionalities.
-   **Framer Motion:** For animations in the frontend.
-   **Lucide React / React Icons:** Icon libraries for the user interface.

## Mission Workflow (18 Steps)
The mobile mission page (`/mobile/missao`) implements an 18-step digital OS workflow for armed escorts:
1. **Dados da Missão** (aguardando) — Agent must check "Ciente" (acknowledgment) checkbox before proceeding
2. **Armamento** (checkout_armamento) — Photos of 3 weapons with serial number visible instruction
3. **Viatura** (checkout_viatura) — 4 vehicle photos + **mandatory checklist**: estepe, chave de roda, macaco, triângulo
4. **KM de Saída** (checkout_km_saida) — Odometer photo + KM input
5. **Em Trânsito** (em_transito_origem) — Navigation + status updates + hourly alert banner
6. **KM Chegada** (checkin_chegada_km) — Odometer photo + KM input + **agent equipped photo** (in front of vehicle)
7. **Veículo Escoltado** (checkin_veiculo_escoltado) — 2 photos of escorted truck
8. **Dados do Motorista** (checkin_dados_motorista) — Driver name, phone, plate form (pre-filled from OS)
9. **Iniciar Missão** (iniciar_missao) — Confirmation + timer start
10. **Em Trânsito ao Destino** (em_transito_destino) — Navigation + status updates + hourly alert
11. **Chegada no Destino** (chegada_destino) — **Destination photo** required + option for new delivery or finalize
12. **KM Final** (checkout_km_final) — Odometer photo + KM input
13. **Viatura Retorno** (checkout_viatura_retorno) — 4 vehicle photos
14. **Entregas Finalizadas** (finalizada) — Transition to logistical closure
15. **Em Prontidão** (em_prontidao) — Team standby status, awaiting release
16. **Retorno à Base** (retorno_base) — In-transit back to base
17. **Chegada na Base** (chegada_base) — VTR checklist (4 items), 5 vehicle photos (4 angles + odometer), KM input, cleanliness status (Limpa/Suja with reason if dirty). Data saved via `/api/mission/base-clean` with server-side validation. Backend enforces checklist confirmation, KM, and clean status before advancing.
18. **Operação Encerrada** (encerrada) — Final state, OS marked as concluída, weapon kit released

## HR Module
The employee HR module (`/mobile/meu-rh`) provides 5 tabs:
- **Faltas** — Absences and medical certificates
- **Multas** — Traffic fines/infractions
- **Disciplinar** — Advertências (warnings) and suspensões (suspensions) with status tracking (ativa/cumprida/revogada)
- **Ponto** — Timesheets with clock in/out
- **Holerite** — Payslips with gross/net/deductions/benefits

Admin manages all HR records via the employee dialog (`/admin/funcionarios`).

## Login Selfie (Registro de Presença)
Every time a `funcionario` user logs in, they must take a selfie before accessing the mobile system. Flow: login → terms (if needed) → selfie capture → mobile home.
- **Page**: `/mobile/selfie` — camera opens automatically (front-facing), user captures, reviews, and confirms
- **Enforcement**: `MobileProtectedRoute` checks `/api/auth/login-selfie-today`; if no selfie today, redirects to selfie page. All mobile routes (`/mobile/*`) are protected except `/mobile/selfie` itself.
- **Storage**: `login_selfies` table stores userId, employeeId, userName, photoData (base64 JPEG), GPS coordinates, IP, user-agent, timestamp
- **Backend**: `POST /api/auth/login-selfie` (validates format/size), `GET /api/auth/login-selfie-today` (checks if selfie exists for today)
- **Admin access**: `GET /api/admin/login-selfies` (list, last 100, no photo data), `GET /api/admin/login-selfie/:id` (full detail with photo)

## Audit System (Auditoria)
Complete tracking of all vigilante actions with security alerting. Page: `/admin/auditoria` (admin/diretoria only).
- **Tracked actions**: page_view, mission_step_advance, photo_captured, mission_status_update, login_selfie, terms_accepted
- **Security detection**: screenshot_attempt (PrintScreen, Cmd+Shift+3/4/5, Ctrl+Shift+S), tab_hidden (visibility change), window_blur (focus loss), context_menu (right-click)
- **Hook**: `useAuditLog(page)` for page views, `useScreenshotDetection(page)` for security monitoring (both active in MobileLayout), `logAuditAction(action, page, details)` for manual logging
- **Backend**: `POST /api/audit-log` (log events), `GET /api/audit-logs` (filterable: userId, action, search, dateFrom/dateTo, securityOnly), `GET /api/audit-logs/stats` (totals, today count, security alerts, top users, action distribution)
- **Admin page**: Stats cards (total, today, security alerts, active users), top users/action types panels, full log table with severity highlighting (red for screenshot attempts, amber for warnings), filters, pagination
- **Table**: audit_logs (id, userId, userName, userRole, action, page, details, ipAddress, userAgent, createdAt)

## Financial Module (Contas a Pagar / Receber)
Complete financial management for the company. Page: `/admin/financeiro` (admin/diretoria only).
- **5 Tabs**: Contas a Pagar (EXPENSE), Contas a Receber (INCOME), Conferência (overdue review), Relatório (analytics), Fechamento (period close)
- **Features**: CRUD transactions, toggle PENDING/PAID status, installment support (2-36x), period filters (Day/Week/Month/Custom/All), status filters (All/Pending/Paid/Overdue), text search, CSV export, print, category breakdown charts
- **Transaction Form**: Type toggle (Receita/Despesa), description, amount, due date, category select, bank account select, entity name, status, notes, recurrence (single/installment)
- **Quick Category Modal**: Create categories inline with DRE group classification
- **Backend endpoints**: GET/POST /api/financial/transactions, PUT/DELETE /api/financial/transactions/:id, PATCH /api/financial/transactions/:id/toggle-status, GET /api/financial/summary, GET/POST/DELETE /api/financial/categories, GET/POST/PUT/DELETE /api/financial/accounts
- **Tables (Supabase)**: financial_transactions (id UUID, description, amount, type INCOME/EXPENSE, status PENDING/PAID/CANCELLED, due_date, payment_date, category_id, category_name, account_id, account_name, entity_type, entity_name, notes, status_conciliacao, installment_group, installment_number, installment_total, created_at, created_by, updated_by), financial_categories (id UUID, name, type, is_deduction, group, recurrence_type, tag, scope), financial_accounts (id UUID, name, initial_balance, bank_name, account_number, status)
- **Pre-seeded categories**: 17 categories covering Receita de Escolta, Combustível, Folha de Pagamento, ISSQN, PIS/COFINS, etc.

## Escort Calculation Engine (Motor de Cálculo de Escolta)
Complete escort billing calculation with differentiated KM, hazard pay, and night premium. Page: `/admin/calculo-escolta` (admin/diretoria only).
- **4 Tabs**: Calculadora (live calculation), Faturamentos (billing history), Contratos (client contract management), Relatório (monthly client report)
- **Calculation rules**:
  - KM carregado vs KM vazio (retorno) with different rates
  - Franquia mínima de KM (minimum KM billing floor)
  - Periculosidade: 30% additional on base hourly rate when mission exceeds 8 hours
  - Adicional noturno: 20% on VRP + 15% on billed KM when mission occurs between 22:00-05:00
  - Validation: KM final must be >= KM inicial; photo required if difference > 500 KM
- **Contracts**: Per-client customizable rates (valor_km_carregado, valor_km_vazio, VRP, hazard/night percentages, hour limits)
- **Output**: Split view — client billing (faturamento) vs operational payment (vigilante VRP + extras + reimbursements) + gross profit
- **Report**: Monthly per-client summary with total missions, KM, billing, operational costs, profit, tolls, fuel, night missions count
- **Backend endpoints**: POST /api/escort/calculate, GET/POST/PUT/DELETE /api/escort/contracts, GET/POST/PUT /api/escort/billings, GET /api/escort/relatorio/:clientId
- **Tables (Supabase)**: escort_contracts (client rates, percentages, limits), escort_billings (full calculation breakdown per mission)