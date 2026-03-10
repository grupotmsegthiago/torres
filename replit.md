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
- `shared/schema.ts` - Database schema (users, perfis_acesso, clients, employees, vehicles, service_orders, trips, vehicle_maintenance, vehicle_fueling, timesheets, mission_photos, api_logs, employee_salaries)
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
  - `service-orders.tsx` - Service orders (OS) with workflow
  - `trips.tsx` - Trip control linked to OS
  - `fueling.tsx` - Vehicle fueling records
  - `maintenance.tsx` - Vehicle maintenance control
  - `timesheets.tsx` - Employee timesheet/punch clock
  - `tracker.tsx` - Vehicle tracker (API placeholder)
  - `mission.tsx` - Armed escort mission workflow
  - `operational-grid.tsx` - Real-time operational monitoring
  - `consultas.tsx` - API Brasil consultation module
  - `guia-missao.tsx` - Mission step guide
  - `users.tsx` - User management (admin/diretoria only)

## Environment Variables
- `SUPABASE_URL` / `VITE_SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` - Supabase anon key (frontend)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (backend admin operations)
- `SUPABASE_DATABASE_URL` - Direct PostgreSQL connection string to Supabase
- `APIBRASIL_TOKEN` - API Brasil authentication token
- `APIBRASIL_DEVICE_*` - API Brasil device tokens for each service

## Database Tables
users, perfis_acesso, clients, employees, employee_salaries, vehicles, service_orders, trips, vehicle_maintenance, vehicle_fueling, timesheets, mission_photos, api_logs

## Users Table Schema
- `id` (serial PK), `supabase_uid` (text, unique - links to Supabase Auth), `email` (text, unique), `username` (text, nullable - legacy), `password` (text, nullable - legacy), `name` (text), `role` (text), `employee_id` (int), `must_change_password` (int, legacy), `avatar_url` (text), `created_at` (timestamp)

## Google Maps Integration
- `VITE_GOOGLE_MAPS_API_KEY` - API key for Maps JS + Places library
- Script loaded in `client/index.html` with `libraries=places`
- `PlacesAutocomplete` component at `client/src/components/places-autocomplete.tsx` - wraps Input with Google Places city autocomplete (Brazil only)
- Used in EscortCalculator section (Origem/Destino inputs) on landing page
- Dark-themed `.pac-*` styles in `client/src/index.css`

## Brand
- Colors: Black/white professional aesthetic (monochrome system — NO olive/military colors)
- Fonts: Montserrat (primary), Inter (fallback)
- Logo: Vectorized, uses CSS `invert` filter on dark backgrounds
- DIRETORIA role: Crown icon, amber/golden accent

## Automated Tasks (Cron Jobs)
- **Fleet Monitoring**: Daily at 02:00 AM
- **HR Compliance**: Every 90 days (1st of quarter at 03:00 AM)
- Implementation: `server/cron.ts` using node-cron
