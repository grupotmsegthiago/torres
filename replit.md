# Torres Vigilância Patrimonial - Website & Sistema Interno

## Overview
Institutional landing page and internal management system for Torres Vigilância Patrimonial, a security company authorized by the Brazilian Federal Police.

## Architecture
- **Frontend**: React + TypeScript + Vite
- **Backend**: Express + Supabase Auth (JWT-based)
- **Database**: PostgreSQL via Drizzle ORM (Supabase project `erjhxwbutjyylxdthuuz`)
- **Auth**: Supabase Auth — email/password login, JWT tokens in Authorization header
- **Styling**: Tailwind CSS with custom theme
- **Animations**: Framer Motion
- **Icons**: Lucide React + React Icons

## Auth System (Supabase Auth)
- **Login flow**: Frontend calls `supabase.auth.signInWithPassword()` → gets JWT → sends to backend via `Authorization: Bearer <token>` → backend verifies with `supabaseAdmin.auth.getUser()` → maps to local user via `supabase_uid`
- **Setup wizard**: First access creates Supabase Auth user + local user with `diretoria` role
- **User creation**: Admin creates user via Supabase Admin API → auto-generates temp password → shows credential card
- **Password change**: Via `supabase.auth.updateUser({ password })` on frontend or Admin API on backend
- **RBAC**: `perfis_acesso` table with role/label/permissions; `diretoria` has full bypass `["*"]`
- **Roles**: `diretoria` (superuser, Crown icon), `admin`, `funcionario` (limited access)
- **No session cookies** — pure JWT auth via Authorization header

## Key Files

### Auth & Config
- `server/supabase.ts` - Supabase Admin + Anon clients
- `server/auth.ts` - JWT middleware (authenticateToken, requireAuth, requireAdminRole)
- `client/src/lib/supabase.ts` - Browser Supabase client
- `client/src/hooks/use-auth.tsx` - Auth context (login/logout via Supabase)
- `client/src/lib/queryClient.ts` - API request helper with auto auth headers

### Landing Page
- `client/src/pages/home.tsx` - Main landing page (Navbar, Hero, Services, About, Escort Calculator, Contact, Footer)
- `client/src/index.css` - Theme variables
- `client/index.html` - SEO meta tags

### Internal System (Área Interna)
- `shared/schema.ts` - Database schema (users, perfis_acesso, clients, employees, vehicles, service_orders, trips, vehicle_maintenance, vehicle_fueling, timesheets, mission_photos, api_logs, employee_salaries, employee_documents, weapons, weapon_assignments, vehicle_assignments)
- `server/db.ts` - Database connection (Supabase PostgreSQL via pg driver with SSL)
- `server/db-init.ts` - Schema migrations and seed data on startup
- `server/storage.ts` - DatabaseStorage with full CRUD operations
- `server/routes.ts` - All API endpoints
- `client/src/components/admin/layout.tsx` - Admin dashboard layout with sidebar
- `client/src/pages/admin/` - All admin pages:
  - `login.tsx` - Login page (email/password) + Setup wizard
  - `profile.tsx` - User profile with permissions and password change
  - `dashboard.tsx` - Dashboard with stats overview
  - `clients.tsx` - Client registration/management
  - `employees.tsx` - Employee management
  - `vehicles.tsx` - Vehicle fleet management with avg consumption
  - `service-orders.tsx` - Service orders (OS) with workflow (priorities: imediata/agendada/reaproveitamento)
  - `trips.tsx` - Trip control linked to OS
  - `fueling.tsx` - Vehicle fueling records
  - `maintenance.tsx` - Vehicle maintenance control
  - `timesheets.tsx` - Employee timesheet/punch clock
  - `tracker.tsx` - Vehicle tracker (API placeholder)
  - `mission.tsx` - Armed escort mission workflow
  - `operational-grid.tsx` - Real-time operational monitoring with professional status display (Saída da Base → Chegada na Origem → Início de Missão → Chegada no Destino → Término de Missão)
  - `guia-missao.tsx` - Mission step guide
  - `weapons.tsx` - Weapon registration, PDF upload, agent linking/unlinking with audit history
  - `users.tsx` - User management (admin/diretoria only)

## Environment Variables
- `SUPABASE_URL` / `VITE_SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` - Supabase anon key (frontend)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (backend admin operations)
- `SUPABASE_DATABASE_URL` - Direct PostgreSQL connection string to Supabase
- `APIBRASIL_TOKEN` - API Brasil authentication token
- `APIBRASIL_DEVICE_*` - API Brasil device tokens for each service

## Database Tables
users, perfis_acesso, clients, employees, employee_salaries, employee_documents, vehicles, service_orders, trips, vehicle_maintenance, vehicle_fueling, timesheets, mission_photos, api_logs, weapons, weapon_assignments, vehicle_assignments

## Employee Documents (CNH/CNV)
- `employee_documents` table: type (CNH/CNV/Certificado/Atestado), file_data (base64), expiry_date, issue_date, document_number
- Expiry tracking: expired (red), warning <30 days (amber), ok (green)
- Contract generation: HTML template with employee data, opens in new tab for printing

## Armamento Module
- `weapons` table: type, brand, model, caliber, serial_number (unique), registration_number, registration_expiry, registration_file_data (PDF base64)
- `weapon_assignments` table: weapon_id, employee_id, action (vincular/desvincular), service_order_id, notes
- Linking updates weapon.assigned_employee_id and status; unlinking clears them
- Registration expiry alerts shown on page
- **OCR Smart Upload**: New weapon form has "Cadastro Inteligente" area — upload photo/PDF of weapon registration → OpenAI Vision extracts type, brand, model, caliber, serial, registration number, expiry → auto-fills form fields
- OpenAI integration via Replit AI Integrations (no API key needed, billed to credits)
- Form starts empty (no pre-selected type/caliber) with placeholder options

## Employee OCR Smart Upload & Documentos Obrigatórios
- New employee form has **3 mandatory document slots**: CNH, CNV, Comprovante de Residência
- Each slot is a drag-zone; uploading a file auto-runs OCR (OpenAI Vision) to extract employee data and fill form fields
- CNH/CNV: extracts name, CPF, RG, CNH number, birth date, parents, nationality, marital status, address
- Comprovante de Residência: extracts address
- On save, attached documents are automatically created as `employee_documents` records linked to the new employee
- Document types in the system: CNH, CNV, Comprovante de Residência, Certificado Curso, Atestado, Outro
- CPF lookup button (magnifying glass) next to CPF field — tries BrasilAPI (public, free) for basic data
- Endpoint: `POST /api/employees/ocr` (requireAdminRole) — receives base64 imageData, returns extracted fields

## TrucksControl Integration (Vehicle Tracking)
- **Service**: TrucksControl / NewRastreamentoOnline SOAP webservice
- **Base URL**: `https://webservice.newrastreamentoonline.com.br/`
- **Server module**: `server/truckscontrol.ts` — SOAP XML client with 5-min position cache
- **Env vars**: `TRUCKSCONTROL_CHAVE` (integration key), `TRUCKSCONTROL_SENHA` (password)
- **Vehicle schema fields**: `tracker_type` (truckscontrol/custom/none), `truckscontrol_identifier` (optional, falls back to plate matching)
- **API endpoints**: `GET /api/truckscontrol/test` (connection test), `GET /api/truckscontrol/positions` (all positions), `GET /api/truckscontrol/spy` (SPY devices + positions)
- **Operational Grid**: `/api/vehicle-tracking` merges TrucksControl positions with vehicle data (lat, lng, speed, ignition, GPS, address)
- **Vehicle form**: Tracker section with type selector, TrucksControl identifier field, connection test button
- **SPY Integration**: Portable tracker devices (SpyTrack eqp=7, SpyTrack2 eqp=14). Uses `RequestSpy` (list devices) and `RequestMensagemSpy` (positions with lat/lon/speed/battery/coupled status). SPY devices appear on operational grid map (purple circle markers) and in a separate "SPY Trackers" table below the vehicles table. Responses are ZIP-compressed like vehicle data. Rate limit: 5 min between same request type. SPY `mId` tracking separate from vehicle `lastMid`.

## Vehicle Assignments
- `vehicle_assignments` table: vehicle_id, employee_id, action (vincular/desvincular), km_at_action, service_order_id, notes
- Full audit trail for multas/fines traceability

## Users Table Schema
- `id` (serial PK), `supabase_uid` (text, unique - links to Supabase Auth), `email` (text, unique), `username` (text, nullable - legacy), `password` (text, nullable - legacy), `name` (text), `role` (text), `employee_id` (int), `must_change_password` (int, legacy), `avatar_url` (text), `created_at` (timestamp)

## Google Maps Integration
- `VITE_GOOGLE_MAPS_API_KEY` - API key for Maps JS + Places library
- Script loaded in `client/index.html` with `libraries=places`
- `PlacesAutocomplete` component at `client/src/components/places-autocomplete.tsx` - wraps Input with Google Places city autocomplete (Brazil only)
- Used in EscortCalculator section (Origem/Destino inputs) on landing page
- Dark-themed `.pac-*` styles in `client/src/index.css`

### Mobile Interface (Agentes de Campo)
- `client/src/components/mobile/layout.tsx` - Mobile layout with bottom navigation bar (Início, Minha Missão, Checklist, Perfil)
- `client/src/pages/mobile/home.tsx` - Agent home page with active mission card
- `client/src/pages/mobile/missao.tsx` - Full mission workflow (camera, GPS, KM, driver data)
- `client/src/pages/mobile/checklist.tsx` - Mission step checklist with progress
- `client/src/pages/mobile/perfil.tsx` - Agent profile with logout
- Routes: `/mobile`, `/mobile/missao`, `/mobile/checklist`, `/mobile/perfil`, `/mobile-test`
- Auto-redirect: `funcionario` role users redirected to `/mobile` after login
- Camera: Uses browser `capture="environment"` API for photos (compressed to 800px JPEG 70%)
- GPS: `navigator.geolocation` with high accuracy for each photo
- Telemetry: KM values tracked at checkout, checkin, and final; timestamps per step
- Admin/Diretoria can access via sidebar link "Mobile (Agente)"

## Brand
- Colors: Black/white professional aesthetic (monochrome system — NO olive/military colors)
- Fonts: Montserrat (primary), Inter (fallback)
- Logo: Vectorized, uses CSS `invert` filter on dark backgrounds
- DIRETORIA role: Crown icon, amber/golden accent

## Automated Tasks (Cron Jobs)
- **Fleet Monitoring**: Daily at 02:00 AM
- **HR Compliance**: Every 90 days (1st of quarter at 03:00 AM)
- Implementation: `server/cron.ts` using node-cron
