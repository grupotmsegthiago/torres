# Torres Vigilância Patrimonial - Website & Sistema Interno

## Overview
Institutional landing page and internal management system for Torres Vigilância Patrimonial, a security company authorized by the Brazilian Federal Police.

## Architecture
- **Frontend**: React + TypeScript + Vite
- **Backend**: Express + Passport.js (session auth)
- **Database**: PostgreSQL via Drizzle ORM (Neon serverless)
- **Styling**: Tailwind CSS with custom theme
- **Animations**: Framer Motion
- **Icons**: Lucide React + React Icons

## Key Files

### Landing Page
- `client/src/pages/home.tsx` - Main landing page (Navbar, Hero, Services, About, Escort Calculator, Contact, Footer)
- `client/src/index.css` - Theme variables
- `client/index.html` - SEO meta tags

### Internal System (Área Interna)
- `shared/schema.ts` - Database schema (users, clients, employees, vehicles, service_orders, trips, vehicle_maintenance, vehicle_fueling, timesheets)
- `server/db.ts` - Database connection
- `server/auth.ts` - Authentication (Passport.js + express-session + connect-pg-simple)
- `server/storage.ts` - DatabaseStorage with full CRUD operations
- `server/routes.ts` - All API endpoints (auth + CRUD for all entities)
- `client/src/hooks/use-auth.tsx` - Auth context/provider
- `client/src/components/admin/layout.tsx` - Admin dashboard layout with sidebar
- `client/src/pages/admin/` - All admin pages:
  - `login.tsx` - Login page
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

## Features

### Landing Page
- Responsive navigation with mobile menu + "Área Interna" link
- Hero with team photo background
- Services: Vigilância Patrimonial, Escolta Armada, Central de Monitoramento, Facilities
- Escort quote calculator (WhatsApp integration)
- Contact section

### Internal System
- Session-based authentication (default: admin / admin123)
- Full CRUD for: Clients, Employees, Vehicles, Service Orders, Trips, Fueling, Maintenance, Timesheets
- Dashboard with real-time stats
- Vehicle average consumption calculation
- Service order workflow (aberta → em_andamento → concluída)
- Trip tracking linked to service orders
- Vehicle tracker placeholder (ready for API integration)
- PDF presentation generator per client (jsPDF) — professional multi-page presentation with company info
- CNPJ auto-fill via BrasilAPI (auto-formats and fetches company data)

### Operational Grid
- Real-time operational monitoring page (`/admin/operational-grid`)
- Shows all active/open service orders with enriched data
- Columns: OS#, scheduled date/time, client name, agents (First Last format) with WhatsApp links, mission status, location (map link), ignition (green/red key icon), last position time (color-coded: green <5min, yellow 5-30min, red >30min), GPS signal, edit button
- Auto-refreshes every 15 seconds
- Tracker integration: fetches from vehicle's `trackerApiUrl` when configured; shows "Sem rastreador" placeholder when not
- Backend: `GET /api/operational-grid` joins service orders with clients, employees, vehicles, and tracker data

### Mission Workflow System
- Step-by-step employee mission workflow with mandatory photo documentation
- Mission steps: km_saida → checklist_saida → em_transito_origem → km_chegada_origem → fotos_cliente → em_transito_destino → km_chegada_destino → checklist_retorno → finalizada
- Each OS supports 2 assigned employees with real-time status visibility (5s polling)
- Photo capture with client-side compression (max 1024px, JPEG quality 0.7)
- KM readings required at departure, client arrival, and destination arrival
- Vehicle checklist photos (4 angles) at departure and return
- Client site photos (3 shots: vehicle at client, client vehicle front/back)
- Admin can create employee user accounts (Criar Acesso) from employees page
- Mission status badges visible on service orders list
- Authorization: employees can only access their own assigned missions
- Express body limit increased to 10mb for photo uploads
- Mission page: `/admin/mission` — military/operational aesthetic with olive gradient, Torres shield watermark, golden action buttons, real-time timer
- Screenshot/print protection: @media print makes everything black; .no-print-zone disables text selection

## Database Tables
users, clients, employees, vehicles, service_orders, trips, vehicle_maintenance, vehicle_fueling, timesheets, mission_photos

## Brand
- Colors: Black/white professional aesthetic
- Fonts: Montserrat (primary), Inter (fallback)
- Logo: Vectorized, uses CSS `invert` filter on dark backgrounds
