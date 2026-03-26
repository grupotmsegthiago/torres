import { db } from "./db";
import { sql } from "drizzle-orm";

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

    console.log("[db-init] Schema verified OK");
  } catch (err: any) {
    console.error("[db-init] Schema check error:", err.message);
  }
}
