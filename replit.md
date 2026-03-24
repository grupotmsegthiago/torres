# Torres Vigilância Patrimonial - Website & Sistema Interno

## Overview
This project delivers an institutional landing page and an internal management system for Torres Vigilância Patrimonial, a Brazilian security company. The system's core purpose is to streamline operational workflows, manage company assets, track personnel and vehicles, and enhance overall operational efficiency. It provides robust user and role management, detailed asset tracking (vehicles, weapons), automated operational processes (service orders, mission workflows), and real-time operational oversight. The strategic goal is to provide a comprehensive, integrated platform that supports company growth, ensures regulatory compliance, and elevates the quality of security services.

## User Preferences
I prefer clear and direct communication. When making changes, prioritize iterative development with clear explanations for each step. For any significant architectural or design decisions, please ask for my approval before proceeding. Ensure all code is well-documented and follows modern TypeScript and React best practices. I value a clean, maintainable codebase.

## System Architecture
The system employs a modern web stack: React with TypeScript and Vite for the frontend, and Express with Supabase Auth for the backend. PostgreSQL, managed via Drizzle ORM, serves as the primary database. Tailwind CSS is utilized for styling, maintaining a professional monochrome aesthetic (black/white) with Montserrat/Inter typography. UI components adhere to an "Enterprise UI" design, ensuring a consistent and polished user experience.

**Key Architectural Decisions & Implementations:**
-   **Authentication & Authorization:** JWT-based authentication via Supabase Auth, implementing robust Role-Based Access Control (RBAC) through a `perfis_acesso` table. Session cookies are not used.
-   **Data Layer:** Drizzle ORM facilitates database interactions, with a generic `DatabaseStorage` class for CRUD operations.
-   **Operational Grid:** A central feature providing real-time vehicle tracking, status monitoring (speed, idle, signal loss), and integration with risk management companies.
-   **Mobile Interface for Field Agents:** A dedicated mobile-first experience for `funcionario` roles, supporting mission workflows, checklists, GPS tracking, and photo capture.
-   **Smart OCR Integration:** Utilizes OpenAI Vision for intelligent data extraction from documents (CNH, CNV, weapon registrations) to auto-fill forms.
-   **Vehicle Tracking Integration:** Real-time vehicle positions and telemetry are sourced from the TrucksControl / NewRastreamentoOnline SOAP webservice.
-   **API Design:** All API endpoints are defined in `server/routes.ts`, covering comprehensive CRUD and operational functionalities across various entities.
-   **UI/UX Design System:** A professional black/white aesthetic, specific typography, and standardized UI elements ensure visual consistency. The `DIRETORIA` role is visually highlighted.
-   **Google Maps Integration:** Used for location services, autocomplete, and mapping in the operational grid and escort calculation.
-   **Automated Tasks:** Cron jobs manage fleet monitoring and HR compliance checks.
-   **Login Selfie Enforcement:** `funcionario` users must take a selfie upon login, enforced by a protected route and stored in the `login_selfies` table.
-   **Audit System:** Comprehensive tracking of vigilante actions, page views, and security events (e.g., screenshot attempts, tab visibility changes) with an admin dashboard for monitoring and alerting.
-   **Financial Module:** Manages accounts payable/receivable with transaction CRUD, installment support, reporting, and category breakdown.
-   **Escort Calculation Engine:** Manages escort billing, client-specific price tables, frequent routes, and generates numbered Mission Bulletins (Boletim de Missão) with detailed calculation rules (KM, minimums, nocturnal/hazardous additions).
-   **OS Logic (Ordem de Serviço):** Implements the complete OS processing flow:
    - **Status Flow:** Funcionário fills OS data → status "A_VERIFICAR" → Administrativo reviews → "APROVADA" (auto-generates BO) or "REJEITADA" (solicita correção com motivo).
    - **Horário de Início Rule:** `Inicio_Missao = max(Horario_Agendado, Horario_Chegada_Real)` — if vigilante arrives early, scheduled time is used; if late, real arrival time is used.
    - **Franchise-Based Billing:** KM excedente is calculated as `max(0, KM_Carregado - Franquia_Cliente)`. Value breakdown shows franchise vs excess KM charges.
    - **Auto-Submit on Mission Close:** When a mission reaches "encerrada" status, the system automatically creates an `escort_billings` record with status "A_VERIFICAR", pulling KM from mission photos and times from mission lifecycle.
    - **Admin Review Panel:** In Financeiro > Boletim Medição tab, pending OS ("A Verificar") are displayed with full summary (horário considerado, horas trabalhadas, KM, franquia, excedente, valor total) and Aprovar/Rejeitar buttons.
    - **API Endpoints:** `POST /api/escort/billings/submit-os` (mobile submit), `POST /api/escort/billings/:id/revisar` (admin review), `GET /api/escort/billings/pendentes` (pending list).
    - **DB Columns Added:** `horario_agendado`, `horario_inicio_considerado`, `horas_trabalhadas`, `km_franquia`, `km_excedente`, `valor_franquia`, `valor_km_extra`, `revisado_por`, `revisado_em`, `motivo_rejeicao`, margin/result fields.
-   **Client "Pasta" System:** `/admin/calculo-escolta` is a client-centric management page. Selecting a client opens their "pasta" with 5 tabs: **Veículos** (client vehicles with CRUD + auto-registration from missions), **Tabelas** (price tables + frequent routes per client), **Contratos** (service contracts with validity/signature control), **Relatório de Missões** (completed missions with period filter), and **Relatório de Faturamento** (billing summary with open vs closed boletins).
-   **Client Vehicles (`client_vehicles`):** Table tracks vehicles associated with each client. Plates are unique per client. Auto-upsert: when a field agent fills the escorted vehicle plate during a mission, the plate (and driver info) is automatically registered/updated in `client_vehicles`. Full CRUD via `GET/POST /api/clients/:id/vehicles`, `PATCH/DELETE /api/client-vehicles/:id`.
-   **Service Contracts:** Full CRUD for `service_contracts` table with vigência (indeterminado/determinado), multa/juros mora, aviso prévio, armamento, and contratante details. **Contract PDF Generator** (`client/src/lib/contractPdf.ts`): Generates a complete multi-page A4 PDF with 12 clauses covering object, vigência, obrigações (contratada/contratante), responsabilidade civil, preço/pagamento, reajuste, penalidades, rescisão, confidencialidade, disposições gerais, and foro. Includes company logo, signature lines, and witness section. Download button on each contract card in the client pasta.
-   **Boletim de Medição (Separate Page):** Moved from Financeiro tab to its own dedicated page at `/admin/boletim-medicao`, accessible via sidebar menu item below "Ordens de Serviço". Displays completed OS grouped by client with data pre-filled from OS records (KM from mission photos, plates, agents, times). Includes filter buttons (Todas/A Verificar/Aprovadas/Rejeitadas), client-grouped accordion view with per-client totals, detailed modal with full OS breakdown, and approve/reject workflow. Only pedágios remain as extra expense (pernoite/gasolina/combustível removed). The Financeiro page now has 5 tabs (Pagar, Receber, Conferência, Relatório, Fechamento).

## External Dependencies
-   **Supabase:** Provides authentication (Supabase Auth) and PostgreSQL database hosting.
-   **OpenAI Vision:** Used for OCR capabilities in document processing.
-   **TrucksControl / NewRastreamentoOnline:** SOAP webservice for real-time vehicle tracking data, remote commands, and vehicle mirroring functionalities.
-   **BrasilAPI:** Utilized for CPF lookup functionality.
-   **Google Maps Platform:** Provides mapping services, Places API for autocomplete, and location functionalities.
-   **Framer Motion:** Used for frontend animations.
-   **Lucide React / React Icons:** Icon libraries for the user interface.