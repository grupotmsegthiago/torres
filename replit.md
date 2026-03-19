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
- `shared/schema.ts` - Database schema (users, perfis_acesso, clients, employees, vehicles, service_orders, trips, vehicle_maintenance, vehicle_fueling, timesheets, mission_photos, api_logs, employee_salaries, employee_documents, weapons, weapon_assignments, vehicle_assignments, weapon_kits, weapon_kit_items, gerenciadoras)
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
  - `service-orders.tsx` - Service orders (OS) with professional document-style form layout, PDF generation, route/requesterName fields, agent credential display (CPF, RG, CNH, CNV, vest), vehicle info with photos/tracker, kit table, PDF download via authenticated fetch
  - `trips.tsx` - Trip control linked to OS
  - `fueling.tsx` - Vehicle fueling records
  - `maintenance.tsx` - Vehicle maintenance control
  - `timesheets.tsx` - Employee timesheet/punch clock
  - `tracker.tsx` - Vehicle tracker (API placeholder)
  - `mission.tsx` - Armed escort mission workflow
  - `operational-grid.tsx` - Real-time operational grid with numbered vehicles, info tooltip (full vehicle data + tracker ID), SP rodízio detection (red highlight), speed alert >110 km/h, ignition, GPS, map link, idle time tracking, OS/status/client display, gerenciadora mirroring button
  - `guia-missao.tsx` - Mission step guide
  - `weapons.tsx` - Weapon registration, PDF upload, agent linking/unlinking with audit history, weapon kits management (Armas/Kits tabs)
  - `users.tsx` - User management (admin/diretoria only)

## Environment Variables
- `SUPABASE_URL` / `VITE_SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` - Supabase anon key (frontend)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (backend admin operations)
- `SUPABASE_DATABASE_URL` - Direct PostgreSQL connection string to Supabase
- `APIBRASIL_TOKEN` - API Brasil authentication token
- `APIBRASIL_DEVICE_*` - API Brasil device tokens for each service

## Database Tables
users, perfis_acesso, clients, employees, employee_salaries, employee_documents, vehicles, service_orders, trips, vehicle_maintenance, vehicle_fueling, timesheets, mission_photos, api_logs, weapons, weapon_assignments, vehicle_assignments, weapon_kits, weapon_kit_items, gerenciadoras

## Weapon Kits (Kits de Armamento)
- `weapon_kits` table: id, name, description, status (disponível/em_uso), created_at
- `weapon_kit_items` table: id, kit_id, weapon_id, created_at
- Standard kit composition: 2x Revólver .38 + 1x Espingarda 12 GA
- Kit status lifecycle: created as "disponível" → "em_uso" when assigned to OS → "disponível" when OS finalized/cancelled/deleted
- Service orders have `kit_id` column linking to a weapon kit
- Kit status is managed automatically via OS create/update/delete/mission-advance
- Validation: can't assign kit already "em_uso", can't delete kit "em_uso"
- UI: weapons.tsx has Armas/Kits tabs; service-orders.tsx has kit selector showing available kits

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

## Gerenciadoras (Risk Management Companies)
- `gerenciadoras` table: name, cnpj, api_url, api_key, api_type (webhook/rest/soap), contact_name, contact_phone, contact_email, active, notes
- **Mirroring**: "Espelhar" button in vehicle grid sends real-time vehicle tracking data (positions, speed, ignition, OS) to gerenciadora's API via POST webhook
- API logs recorded for each mirror attempt (success/failure)
- CRUD management via modal dialog in operational grid

## Operational Grid Features
- **Numbered vehicles**: Sequential (01, 02, ...) identification
- **Vehicle info tooltip**: "i" icon shows full vehicle data (brand, model, year, color, chassi, renavam, KM, tracker type/ID)
- **SP Rodízio detection**: Plates restricted by São Paulo rodízio rules highlighted in red with pulsing "RODÍZIO SP" badge
- **Speed alert**: Banner alert when any vehicle exceeds 110 km/h with plate, speed, location
- **Idle time tracking**: Shows duration when vehicle has ignition ON but speed = 0 (amber badge with pause icon)
- **Stopped time tracking**: Shows duration when vehicle is stopped with ignition OFF (red badge with XCircle icon)
- **No-signal telemetry**: When TrucksControl API returns no data, system keeps last known position, calculates time without signal (`noSignalSince`), shows gray WifiOff badge with elapsed time. Map marker turns gray (#6b7280). Info window shows "Sem sinal há X — posição mantida". Stat card "Sem Sinal" appears in header when count > 0
- **Moving indicator**: Shows speed in green badge when vehicle is in motion
- **OS/Status/Client**: Shows assigned OS number, mission status badge, and client name

## Database Configuration
- **EXCLUSIVE Supabase**: `server/db.ts` uses only `SUPABASE_DATABASE_URL` (no fallback to Replit DB)
- **`drizzle.config.ts`**: Also prioritizes `SUPABASE_DATABASE_URL`
- **Vehicle persistence columns**: `last_latitude`, `last_longitude`, `last_ignition`, `last_speed`, `last_gps_signal`, `last_address`, `last_position_time`, `stopped_since`, `ignition_on_since`, `no_signal_since`

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

## Brand & UI Design System
- Colors: Black/white professional aesthetic (monochrome system — NO olive/military colors)
- Fonts: Montserrat (primary), Inter (fallback)
- Logo: Vectorized, uses CSS `invert` filter on dark backgrounds
- DIRETORIA role: Crown icon, amber/golden accent
- **Enterprise UI (March 2026 Redesign)**:
  - Labels: `text-sm font-semibold text-neutral-700` — never smaller than inputs
  - Inputs/Textareas: `h-10 rounded-lg border-neutral-300 shadow-sm` with `focus:ring-2 focus:ring-neutral-900/10`
  - Native selects: Same h-10/rounded-lg/shadow-sm styling as inputs
  - Table headers: `text-xs font-semibold uppercase tracking-wider text-neutral-500`
  - Table cells: `px-4 py-3.5 text-sm text-neutral-700`
  - Buttons: `rounded-lg font-semibold shadow-sm` with smooth transitions
  - All base components in `client/src/components/ui/` updated globally

## Automated Tasks (Cron Jobs)
- **Fleet Monitoring**: Daily at 02:00 AM
- **HR Compliance**: Every 90 days (1st of quarter at 03:00 AM)
- Implementation: `server/cron.ts` using node-cron
