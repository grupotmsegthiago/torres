import { db } from "./db";
import { sql, and, or, eq, isNull } from "drizzle-orm";
import { serviceOrders } from "@shared/schema";

export async function ensureDbSchema() {
  try {
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_uid TEXT UNIQUE
    `);
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE
    `);
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT
    `);
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()
    `);
    await db.execute(sql`
      ALTER TABLE users ALTER COLUMN username DROP NOT NULL
    `).catch(() => {});
    await db.execute(sql`
      ALTER TABLE users ALTER COLUMN password DROP NOT NULL
    `).catch(() => {});

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS perfis_acesso (
        id SERIAL PRIMARY KEY,
        role TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        permissions TEXT NOT NULL
      )
    `);

    await db.execute(sql`
      INSERT INTO perfis_acesso (role, label, permissions) VALUES
      ('diretoria', 'Diretoria', '["*"]'),
      ('admin', 'Administrador', '["dashboard","clients","employees","vehicles","trips","fueling","maintenance","timesheets","tracker","service_orders","mission","operational_grid","consultas","guia_missao","users"]'),
      ('funcionario', 'Funcionário', '["dashboard","mission","timesheets","guia_missao"]')
      ON CONFLICT (role) DO NOTHING
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS employee_documents (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        file_data TEXT,
        file_name TEXT,
        expiry_date DATE,
        issue_date DATE,
        document_number TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS weapons (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        caliber TEXT NOT NULL,
        serial_number TEXT NOT NULL UNIQUE,
        registration_number TEXT,
        registration_expiry DATE,
        registration_file_data TEXT,
        status TEXT NOT NULL DEFAULT 'disponível',
        assigned_employee_id INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS weapon_assignments (
        id SERIAL PRIMARY KEY,
        weapon_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        service_order_id INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vehicle_assignments (
        id SERIAL PRIMARY KEY,
        vehicle_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        service_order_id INTEGER,
        km_at_action INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS block_type TEXT
    `);
    await db.execute(sql`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS block_reason TEXT
    `);

    await db.execute(sql`
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS tracker_type TEXT
    `);
    await db.execute(sql`
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS truckscontrol_identifier TEXT
    `);
    await db.execute(sql`
      ALTER TABLE weapons ADD COLUMN IF NOT EXISTS photo_data TEXT
    `);

    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS icon_type TEXT DEFAULT 'polo'`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_latitude TEXT`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_longitude TEXT`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_ignition INTEGER`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_speed INTEGER`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_gps_signal INTEGER`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_address TEXT`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_position_time TEXT`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS stopped_since TEXT`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ignition_on_since TEXT`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS no_signal_since TEXT`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS frota TEXT`);
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS route TEXT`);
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS requester_name TEXT`);
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS origin TEXT`);
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS destination TEXT`);
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS escorted_driver_phone TEXT`);
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS base_return_km TEXT`);
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS base_clean_status TEXT`);
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS base_clean_notes TEXT`);
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS base_checklist_confirmed BOOLEAN`);
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS early_start_approved BOOLEAN DEFAULT false`);
    await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnh_expiry TIMESTAMP`);
    await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnv_number TEXT`);
    await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnv_expiry TIMESTAMP`);
    await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS vest_number TEXT`);
    await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS vest_brand TEXT`);
    await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS vest_protection TEXT`);
    await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS vest_expiry TIMESTAMP`);
    await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS ammo_count INTEGER`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS initial_km INTEGER DEFAULT 0`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_km_update TIMESTAMP`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS document_file TEXT`);
    await db.execute(sql`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS full_tank BOOLEAN DEFAULT true`);
    await db.execute(sql`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS receipt_photo TEXT`);

    await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS address_lat REAL`);
    await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS address_lng REAL`);
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS origin_lat REAL`);
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS origin_lng REAL`);
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS destination_lat REAL`);
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS destination_lng REAL`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS gerenciadoras (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        cnpj TEXT,
        api_url TEXT,
        api_key TEXT,
        api_type TEXT DEFAULT 'webhook',
        contact_name TEXT,
        contact_phone TEXT,
        contact_email TEXT,
        active INTEGER DEFAULT 1,
        notes TEXT,
        tc_permissao_comando INTEGER DEFAULT 1,
        tc_ie INTEGER DEFAULT 0,
        tc_tie INTEGER DEFAULT 0,
        tc_validade TEXT,
        tc_posso_cancelar INTEGER DEFAULT 1,
        tc_comando_exclusivo INTEGER DEFAULT 0,
        tc_compartilhar_dados INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS telemetry_events (
        id SERIAL PRIMARY KEY,
        vehicle_id INTEGER,
        plate TEXT NOT NULL,
        event_type TEXT NOT NULL,
        value REAL,
        duration INTEGER,
        latitude REAL,
        longitude REAL,
        address TEXT,
        driver_name TEXT,
        details TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_telemetry_event_type ON telemetry_events(event_type)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON telemetry_events(created_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_telemetry_plate ON telemetry_events(plate)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS agent_locations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        employee_id INTEGER,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        speed REAL,
        heading REAL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS agent_location_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        employee_id INTEGER,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        speed REAL,
        heading REAL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_alh_user_date ON agent_location_history(user_id, created_at)`);

    await db.execute(sql`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS tc_permissao_comando INTEGER DEFAULT 1`);
    await db.execute(sql`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS tc_ie INTEGER DEFAULT 0`);
    await db.execute(sql`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS tc_tie INTEGER DEFAULT 0`);
    await db.execute(sql`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS tc_validade TEXT`);
    await db.execute(sql`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS tc_posso_cancelar INTEGER DEFAULT 1`);
    await db.execute(sql`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS tc_comando_exclusivo INTEGER DEFAULT 0`);
    await db.execute(sql`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS tc_compartilhar_dados INTEGER DEFAULT 0`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS employee_absences (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP,
        reason TEXT,
        document_url TEXT,
        status TEXT NOT NULL DEFAULT 'pendente',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS employee_fines (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        vehicle_id INTEGER,
        date TIMESTAMP NOT NULL,
        infraction TEXT NOT NULL,
        amount REAL,
        points INTEGER,
        status TEXT NOT NULL DEFAULT 'pendente',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS employee_disciplinary (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        date TIMESTAMP NOT NULL,
        reason TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'ativa',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS employee_timesheets (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        date TIMESTAMP NOT NULL,
        clock_in TEXT,
        clock_out TEXT,
        lunch_out TEXT,
        lunch_in TEXT,
        overtime REAL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS employee_payslips (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        gross_salary REAL,
        net_salary REAL,
        deductions REAL,
        benefits REAL,
        document_url TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP`).catch(() => {});
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_ip_address TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_user_agent TEXT`).catch(() => {});

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        user_name TEXT,
        user_role TEXT,
        action TEXT NOT NULL,
        page TEXT,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        latitude REAL,
        longitude REAL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.execute(sql`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS latitude REAL`).catch(() => {});
    await db.execute(sql`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS longitude REAL`).catch(() => {});

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS token_failure_logs (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER,
        employee_name TEXT,
        error_message TEXT,
        user_agent TEXT,
        ip_address TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS login_selfies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        employee_id INTEGER,
        user_name TEXT,
        photo_data TEXT NOT NULL,
        latitude TEXT,
        longitude TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS company_documents (
        id SERIAL PRIMARY KEY,
        doc_type TEXT NOT NULL,
        label TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_data TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS homologation_logs (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL,
        client_name TEXT,
        recipient_email TEXT NOT NULL,
        recipient_name TEXT,
        documents_sent TEXT[],
        sent_by TEXT,
        status TEXT NOT NULL DEFAULT 'enviado',
        sent_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS mission_updates (
        id SERIAL PRIMARY KEY,
        service_order_id INTEGER NOT NULL,
        os_number TEXT,
        employee_id INTEGER,
        employee_name TEXT,
        message TEXT NOT NULL,
        mission_step TEXT,
        latitude TEXT,
        longitude TEXT,
        photo_url TEXT,
        read_by_admin INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      ALTER TABLE mission_updates ADD COLUMN IF NOT EXISTS photo_url TEXT
    `).catch(() => {});

    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_oil_change_km INTEGER`).catch(() => {});

    await db.execute(sql`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS pump_photo TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS odometer_photo TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS latitude TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS longitude TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS address TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS plate_photo TEXT`).catch(() => {});

    await db.execute(sql`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS clock_in_photo TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS clock_out_photo TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS lunch_out_photo TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS lunch_in_photo TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS clock_in_lat TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS clock_in_lng TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS clock_out_lat TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS clock_out_lng TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS lunch_out_lat TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS lunch_out_lng TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS lunch_in_lat TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS lunch_in_lng TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS clock_in_address TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS clock_out_address TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS lunch_out_address TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS lunch_in_address TEXT`).catch(() => {});

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS employee_occurrences (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        vehicle_id INTEGER,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        photos TEXT[],
        latitude TEXT,
        longitude TEXT,
        status TEXT NOT NULL DEFAULT 'aberta',
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS reference_points (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        radius_meters INTEGER NOT NULL DEFAULT 500,
        color TEXT NOT NULL DEFAULT '#6366f1',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      UPDATE service_orders SET mission_status = 'aguardando' WHERE mission_status = 'missao_paga'
    `).catch(() => {});

    await db.execute(sql`
      ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS escort_contract_id TEXT
    `).catch(() => {});

    await db.execute(sql`
      ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS waypoints JSONB DEFAULT '[]'::jsonb
    `).catch(() => {});

    await db.execute(sql`
      ALTER TABLE mission_costs ADD COLUMN IF NOT EXISTS cost_type TEXT DEFAULT 'expense'
    `).catch(() => {});

    await db.execute(sql`
      ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS receitas_os NUMERIC(10,2) DEFAULT 0
    `).catch(() => {});

    await db.execute(sql`
      ALTER TABLE escort_contracts ADD COLUMN IF NOT EXISTS name TEXT
    `).catch(() => {});

    await db.execute(sql`
      UPDATE vehicles SET last_latitude = NULL, last_longitude = NULL
      WHERE CAST(COALESCE(NULLIF(last_latitude, ''), '1') AS NUMERIC) = 0
        AND CAST(COALESCE(NULLIF(last_longitude, ''), '1') AS NUMERIC) = 0
    `).catch(() => {});

    await db.execute(sql`
      ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS early_start_approved BOOLEAN DEFAULT false
    `).catch(() => {});

    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS origin_lat REAL`).catch(() => {});
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS origin_lng REAL`).catch(() => {});
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS destination_lat REAL`).catch(() => {});
    await db.execute(sql`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS destination_lng REAL`).catch(() => {});

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS mission_positions (
        id SERIAL PRIMARY KEY,
        service_order_id INTEGER NOT NULL,
        vehicle_id INTEGER,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        speed REAL,
        ignition INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mission_pos_so ON mission_positions(service_order_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mission_pos_created ON mission_positions(created_at)`);

    await db.execute(sql`ALTER TABLE mission_costs ALTER COLUMN service_order_id DROP NOT NULL`).catch(() => {});
    await db.execute(sql`ALTER TABLE mission_costs ADD COLUMN IF NOT EXISTS vehicle_id INTEGER`).catch(() => {});
    await db.execute(sql`ALTER TABLE mission_costs ADD COLUMN IF NOT EXISTS employee_id INTEGER`).catch(() => {});
    await db.execute(sql`ALTER TABLE mission_costs ADD COLUMN IF NOT EXISTS photo_url TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE mission_costs ADD COLUMN IF NOT EXISTS latitude TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE mission_costs ADD COLUMN IF NOT EXISTS longitude TEXT`).catch(() => {});

    await db.execute(sql`ALTER TABLE mission_updates ADD COLUMN IF NOT EXISTS copiado_por TEXT`).catch(() => {});
    await db.execute(sql`ALTER TABLE mission_updates ADD COLUMN IF NOT EXISTS copiado_em TIMESTAMP`).catch(() => {});

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        client_id INTEGER,
        client_name TEXT NOT NULL,
        client_cpf_cnpj TEXT,
        asaas_customer_id TEXT,
        asaas_payment_id TEXT,
        service_order_id INTEGER,
        description TEXT NOT NULL,
        value DECIMAL(12,2) NOT NULL,
        net_value DECIMAL(12,2),
        due_date TEXT NOT NULL,
        billing_type TEXT NOT NULL DEFAULT 'BOLETO',
        status TEXT NOT NULL DEFAULT 'PENDING',
        invoice_url TEXT,
        bank_slip_url TEXT,
        pix_qr_code TEXT,
        pix_copia_e_cola TEXT,
        payment_date TEXT,
        external_reference TEXT,
        notes TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log("[db-init] Schema verified OK");

    backfillOrderCoords().catch(e => console.error("[db-init] backfill coords error:", e.message));
  } catch (err: any) {
    console.error("[db-init] Schema check error:", err.message);
  }
}

export async function nominatimReverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const resp = await fetch(url, { headers: { "User-Agent": "TorresVP/1.0" }, signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    if (!data || !data.address) return null;
    const a = data.address;
    const road = a.road || a.highway || a.pedestrian || "";
    const number = a.house_number || "";
    const suburb = a.suburb || a.neighbourhood || "";
    const city = a.city || a.town || a.municipality || a.county || "";
    const state = a.state || "";
    const stateCode = state.length === 2 ? state : (
      { "São Paulo": "SP", "Rio de Janeiro": "RJ", "Minas Gerais": "MG", "Bahia": "BA", "Paraná": "PR",
        "Rio Grande do Sul": "RS", "Pernambuco": "PE", "Ceará": "CE", "Pará": "PA", "Maranhão": "MA",
        "Santa Catarina": "SC", "Goiás": "GO", "Paraíba": "PB", "Espírito Santo": "ES", "Amazonas": "AM",
        "Rio Grande do Norte": "RN", "Alagoas": "AL", "Piauí": "PI", "Mato Grosso": "MT", "Mato Grosso do Sul": "MS",
        "Distrito Federal": "DF", "Sergipe": "SE", "Rondônia": "RO", "Tocantins": "TO", "Acre": "AC",
        "Amapá": "AP", "Roraima": "RR" }[state] || state
    );
    let parts: string[] = [];
    if (road) parts.push(number ? `${road}, ${number}` : road);
    if (suburb && !road.includes(suburb)) parts.push(suburb);
    if (city) parts.push(`${city}/${stateCode}`);
    return parts.length > 0 ? parts.join(", ") : (data.display_name || null);
  } catch {
    return null;
  }
}

export async function nominatimGeocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=br&limit=1`;
    const resp = await fetch(url, { headers: { "User-Agent": "TorresVP/1.0" }, signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const data = await resp.json() as any[];
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };

    const cityMatch = address.match(/,\s*([^,]+?)\s*-\s*([A-Z]{2})\s*,?\s*Brasil/i);
    if (cityMatch) {
      const simpler = `${cityMatch[1].trim()}, ${cityMatch[2]}, Brasil`;
      await new Promise(r => setTimeout(r, 1100));
      const url2 = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(simpler)}&countrycodes=br&limit=1`;
      const resp2 = await fetch(url2, { headers: { "User-Agent": "TorresVP/1.0" }, signal: AbortSignal.timeout(5000) });
      if (!resp2.ok) return null;
      const data2 = await resp2.json() as any[];
      if (data2.length > 0) {
        console.log(`[geocode] Fallback OK: "${address}" → "${simpler}" (${data2[0].lat},${data2[0].lon})`);
        return { lat: parseFloat(data2[0].lat), lng: parseFloat(data2[0].lon) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function backfillOrderCoords() {
  const orders = await db.select({
    id: serviceOrders.id,
    osNumber: serviceOrders.osNumber,
    origin: serviceOrders.origin,
    destination: serviceOrders.destination,
    originLat: serviceOrders.originLat,
    destinationLat: serviceOrders.destinationLat,
  }).from(serviceOrders).where(
    and(
      or(eq(serviceOrders.status, "em_andamento"), eq(serviceOrders.status, "agendada")),
      or(isNull(serviceOrders.originLat), isNull(serviceOrders.destinationLat))
    )
  );
  if (orders.length === 0) return;
  console.log(`[db-init] Backfilling coordinates for ${orders.length} order(s)...`);
  for (const o of orders) {
    const updates: any = {};
    if (!o.originLat && o.origin) {
      const geo = await nominatimGeocode(o.origin);
      if (geo) { updates.originLat = geo.lat; updates.originLng = geo.lng; }
      await new Promise(r => setTimeout(r, 1100));
    }
    if (!o.destinationLat && o.destination) {
      const geo = await nominatimGeocode(o.destination);
      if (geo) { updates.destinationLat = geo.lat; updates.destinationLng = geo.lng; }
      await new Promise(r => setTimeout(r, 1100));
    }
    if (Object.keys(updates).length > 0) {
      await db.update(serviceOrders).set(updates).where(eq(serviceOrders.id, o.id));
      console.log(`[db-init] Geocoded ${o.osNumber}: origin=${updates.originLat ? "OK" : "skip"} dest=${updates.destinationLat ? "OK" : "skip"}`);
    }
  }
}

export async function ensureCalcMissionRPC() {
  try {
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION calc_mission_elapsed_hours(p_os_id integer)
      RETURNS numeric AS $$
        SELECT COALESCE(
          EXTRACT(EPOCH FROM (
            COALESCE(completed_date, NOW()) - mission_started_at
          )) / 3600.0,
          0
        )
        FROM service_orders WHERE id = p_os_id;
      $$ LANGUAGE sql STABLE;
    `);
    console.log("[db-init] calc_mission_elapsed_hours RPC created OK");
  } catch (e: any) {
    console.error("[db-init] calc_mission_elapsed_hours error:", e.message);
  }
}
