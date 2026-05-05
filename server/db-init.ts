import { supabaseAdmin } from "./supabase";
import { toCamelArray } from "./storage";
import pg from "pg";

async function execSqlViaRpc(query: string) {
  const { error } = await supabaseAdmin.rpc("exec_sql", { query });
  if (error) throw error;
}

let _pgClient: pg.Client | null = null;
let _pgClientConnecting = false;

async function getSupaPgClient(): Promise<pg.Client> {
  if (_pgClient) return _pgClient;
  if (_pgClientConnecting) {
    await new Promise(r => setTimeout(r, 500));
    if (_pgClient) return _pgClient;
  }
  _pgClientConnecting = true;
  const dbUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("No SUPABASE_DATABASE_URL or DATABASE_URL");
  const client = new pg.Client({
    connectionString: dbUrl,
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
  });
  client.on("error", (err) => {
    console.error("[db-init] PG client error:", err.message);
    _pgClient = null;
  });
  await client.connect();
  _pgClient = client;
  _pgClientConnecting = false;
  return client;
}

async function execSqlViaPg(query: string) {
  const client = await getSupaPgClient();
  await client.query(query);
}

export async function closeDbInitClient() {
  if (_pgClient) {
    await _pgClient.end().catch(() => {});
    _pgClient = null;
  }
}

let _useDirectPg = false;

async function execSql(query: string) {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("DDL timeout 15s")), 15000));
  if (_useDirectPg) {
    await Promise.race([execSqlViaPg(query), timeout]);
    return;
  }
  try {
    await Promise.race([execSqlViaRpc(query), timeout]);
  } catch (e: any) {
    if (e.message?.includes("exec_sql") || e.message?.includes("schema cache")) {
      if (!_useDirectPg) {
        console.log("[db-init] exec_sql RPC not found, creating via direct PG and switching to PG mode...");
        await execSqlViaPg(`
          CREATE OR REPLACE FUNCTION exec_sql(query text)
          RETURNS void AS $$ BEGIN EXECUTE query; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
        `);
        await execSqlViaPg(`NOTIFY pgrst, 'reload schema'`).catch(() => {});
        console.log("[db-init] exec_sql RPC created OK — using direct PG for this session");
        _useDirectPg = true;
      }
      await Promise.race([execSqlViaPg(query), timeout]);
      return;
    }
    throw e;
  }
}

export async function ensureDbSchema() {
  try {
    const connTest = new Promise((_, reject) => setTimeout(() => reject(new Error("Supabase conn test timeout")), 10000));
    await Promise.race([
      supabaseAdmin.from("users").select("id").limit(1).then(({ error }) => { if (error) throw error; }),
      connTest
    ]);
  } catch (e: any) {
    console.log("[db-init] Schema check skipped (Supabase unreachable):", e.message);
    return;
  }
  try {
    await execSql(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_uid TEXT UNIQUE
    `);
    await execSql(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE
    `);
    await execSql(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT
    `);
    await execSql(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()
    `);
    await execSql(`
      ALTER TABLE users ALTER COLUMN username DROP NOT NULL
    `).catch(() => {});
    await execSql(`
      ALTER TABLE users ALTER COLUMN password DROP NOT NULL
    `).catch(() => {});

    await execSql(`
      CREATE TABLE IF NOT EXISTS perfis_acesso (
        id SERIAL PRIMARY KEY,
        role TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        permissions TEXT NOT NULL
      )
    `);

    await execSql(`
      INSERT INTO perfis_acesso (role, label, permissions) VALUES
      ('diretoria', 'Diretoria', '["*"]'),
      ('admin', 'Administrador', '["dashboard","clients","employees","vehicles","trips","fueling","maintenance","timesheets","tracker","service_orders","mission","operational_grid","consultas","guia_missao","users"]'),
      ('funcionario', 'Funcionário', '["dashboard","mission","timesheets","guia_missao"]')
      ON CONFLICT (role) DO NOTHING
    `);

    await execSql(`
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

    await execSql(`
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

    await execSql(`
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

    await execSql(`
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

    await execSql(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS block_type TEXT
    `);
    await execSql(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS block_reason TEXT
    `);

    await execSql(`
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS tracker_type TEXT
    `);
    await execSql(`
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS truckscontrol_identifier TEXT
    `);
    await execSql(`
      ALTER TABLE weapons ADD COLUMN IF NOT EXISTS photo_data TEXT
    `);

    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS icon_type TEXT DEFAULT 'polo'`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_latitude TEXT`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_longitude TEXT`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_ignition INTEGER`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_speed INTEGER`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_gps_signal INTEGER`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_address TEXT`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_position_time TEXT`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS stopped_since TEXT`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ignition_on_since TEXT`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS no_signal_since TEXT`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS frota TEXT`);
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS route TEXT`);
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS requester_name TEXT`);
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS origin TEXT`);
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS destination TEXT`);
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS escorted_driver_phone TEXT`);
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS base_return_km TEXT`);
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS base_clean_status TEXT`);
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS base_clean_notes TEXT`);
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS base_checklist_confirmed BOOLEAN`);
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS early_start_approved BOOLEAN DEFAULT false`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnh_expiry TIMESTAMP`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnv_number TEXT`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnv_expiry TIMESTAMP`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS vest_number TEXT`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS vest_brand TEXT`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS vest_protection TEXT`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS vest_expiry TIMESTAMP`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS ammo_count INTEGER`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS initial_km INTEGER DEFAULT 0`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_km_update TIMESTAMP`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS document_file TEXT`);
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS full_tank BOOLEAN DEFAULT true`);
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS receipt_photo TEXT`);

    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS address_lat REAL`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS address_lng REAL`);
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS origin_lat REAL`);
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS origin_lng REAL`);
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS destination_lat REAL`);
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS destination_lng REAL`);

    await execSql(`
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

    await execSql(`
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

    await execSql(`CREATE INDEX IF NOT EXISTS idx_telemetry_event_type ON telemetry_events(event_type)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON telemetry_events(created_at)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_telemetry_plate ON telemetry_events(plate)`);

    await execSql(`
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

    await execSql(`
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
    await execSql(`CREATE INDEX IF NOT EXISTS idx_al_user_id ON agent_locations(user_id)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_al_updated ON agent_locations(updated_at DESC)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_alh_user_date ON agent_location_history(user_id, created_at DESC)`);

    await execSql(`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS tc_permissao_comando INTEGER DEFAULT 1`);
    await execSql(`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS tc_ie INTEGER DEFAULT 0`);
    await execSql(`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS tc_tie INTEGER DEFAULT 0`);
    await execSql(`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS tc_validade TEXT`);
    await execSql(`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS tc_posso_cancelar INTEGER DEFAULT 1`);
    await execSql(`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS tc_comando_exclusivo INTEGER DEFAULT 0`);
    await execSql(`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS tc_compartilhar_dados INTEGER DEFAULT 0`);

    await execSql(`
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

    await execSql(`
      CREATE TABLE IF NOT EXISTS employee_fines (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        vehicle_id INTEGER,
        date TIMESTAMP NOT NULL,
        infraction TEXT NOT NULL,
        amount DECIMAL(10,2),
        points INTEGER,
        status TEXT NOT NULL DEFAULT 'pendente',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await execSql(`
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

    await execSql(`
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

    await execSql(`
      CREATE TABLE IF NOT EXISTS employee_payslips (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        gross_salary DECIMAL(10,2),
        net_salary DECIMAL(10,2),
        deductions DECIMAL(10,2),
        benefits DECIMAL(10,2),
        document_url TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS salario_base DECIMAL(10,2)`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS horas_extras DECIMAL(10,2)`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS adicional_noturno DECIMAL(10,2)`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS periculosidade DECIMAL(10,2)`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS beneficios DECIMAL(10,2)`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS descontos DECIMAL(10,2)`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pendente'`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS data_pagamento TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS financial_transaction_id INTEGER`).catch(() => {});

    const decimalMigrations = [
      `ALTER TABLE employee_payslips ALTER COLUMN gross_salary TYPE DECIMAL(10,2) USING gross_salary::DECIMAL(10,2)`,
      `ALTER TABLE employee_payslips ALTER COLUMN net_salary TYPE DECIMAL(10,2) USING net_salary::DECIMAL(10,2)`,
      `ALTER TABLE employee_payslips ALTER COLUMN deductions TYPE DECIMAL(10,2) USING deductions::DECIMAL(10,2)`,
      `ALTER TABLE employee_payslips ALTER COLUMN benefits TYPE DECIMAL(10,2) USING benefits::DECIMAL(10,2)`,
      `ALTER TABLE employee_payslips ALTER COLUMN salario_base TYPE DECIMAL(10,2) USING salario_base::DECIMAL(10,2)`,
      `ALTER TABLE employee_payslips ALTER COLUMN horas_extras TYPE DECIMAL(10,2) USING horas_extras::DECIMAL(10,2)`,
      `ALTER TABLE employee_payslips ALTER COLUMN adicional_noturno TYPE DECIMAL(10,2) USING adicional_noturno::DECIMAL(10,2)`,
      `ALTER TABLE employee_payslips ALTER COLUMN periculosidade TYPE DECIMAL(10,2) USING periculosidade::DECIMAL(10,2)`,
      `ALTER TABLE employee_payslips ALTER COLUMN beneficios TYPE DECIMAL(10,2) USING beneficios::DECIMAL(10,2)`,
      `ALTER TABLE employee_payslips ALTER COLUMN descontos TYPE DECIMAL(10,2) USING descontos::DECIMAL(10,2)`,
      `ALTER TABLE employee_fines ALTER COLUMN amount TYPE DECIMAL(10,2) USING amount::DECIMAL(10,2)`,
    ];
    for (const sql of decimalMigrations) {
      try { await execSql(sql); } catch (e: any) {
        if (!e.message?.includes("already") && !e.message?.includes("type \"numeric\"")) {
          console.warn(`[db-init] DECIMAL migration warning: ${e.message?.slice(0, 100)}`);
        }
      }
    }

    await execSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP`).catch(() => {});
    await execSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_ip_address TEXT`).catch(() => {});
    await execSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_user_agent TEXT`).catch(() => {});

    await execSql(`
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
    await execSql(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS latitude REAL`).catch(() => {});
    await execSql(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS longitude REAL`).catch(() => {});

    await execSql(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_cycle TEXT
    `);
    await execSql(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS prazo_aprovacao_dias INTEGER
    `);
    await execSql(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER
    `);
    await execSql(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_cutoff_day INTEGER
    `);
    await execSql(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_financeiro TEXT
    `);
    await execSql(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_operacional TEXT
    `);
    await execSql(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_contratual TEXT
    `);
    await execSql(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_medicao TEXT
    `);
    await execSql(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS razao_social TEXT
    `);
    await execSql(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS nome_fantasia TEXT
    `);

    await execSql(`
      CREATE TABLE IF NOT EXISTS billing_alerts (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL,
        client_name TEXT,
        alert_type TEXT NOT NULL,
        message TEXT NOT NULL,
        billing_ids TEXT,
        os_numbers TEXT,
        period_start TEXT,
        period_end TEXT,
        resolved BOOLEAN DEFAULT FALSE,
        resolved_at TIMESTAMPTZ,
        resolved_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await execSql(`
      CREATE TABLE IF NOT EXISTS system_audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        user_name TEXT,
        user_role TEXT,
        action TEXT NOT NULL,
        target_id TEXT,
        target_type TEXT,
        details TEXT,
        ip_address TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await execSql(`
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

    await execSql(`
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

    await execSql(`
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

    await execSql(`
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

    await execSql(`
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
    console.log("[db-init] mission_updates table ensured");

    await execSql(`
      ALTER TABLE mission_updates ADD COLUMN IF NOT EXISTS photo_url TEXT
    `).catch(() => {});

    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_oil_change_km INTEGER`).catch(() => {});

    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS pump_photo TEXT`).catch(() => {});
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS odometer_photo TEXT`).catch(() => {});
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS latitude TEXT`).catch(() => {});
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS longitude TEXT`).catch(() => {});
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS address TEXT`).catch(() => {});
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS plate_photo TEXT`).catch(() => {});

    await execSql(`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS clock_in_photo TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS clock_out_photo TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS lunch_out_photo TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS lunch_in_photo TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS clock_in_lat TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS clock_in_lng TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS clock_out_lat TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS clock_out_lng TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS lunch_out_lat TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS lunch_out_lng TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS lunch_in_lat TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS lunch_in_lng TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS clock_in_address TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS clock_out_address TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS lunch_out_address TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_timesheets ADD COLUMN IF NOT EXISTS lunch_in_address TEXT`).catch(() => {});

    await execSql(`
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

    await execSql(`
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

    await execSql(`
      UPDATE service_orders SET mission_status = 'aguardando' WHERE mission_status = 'missao_paga'
    `).catch(() => {});

    await execSql(`
      ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS escort_contract_id TEXT
    `).catch(() => {});

    await execSql(`
      ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS waypoints JSONB DEFAULT '[]'::jsonb
    `).catch(() => {});

    await execSql(`
      ALTER TABLE mission_costs ADD COLUMN IF NOT EXISTS cost_type TEXT DEFAULT 'expense'
    `).catch(() => {});

    await execSql(`
      ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS receitas_os NUMERIC(10,2) DEFAULT 0
    `).catch(() => {});

    await execSql(`
      ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS faturado_em TIMESTAMPTZ
    `).catch(() => {});
    await execSql(`
      ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS faturado_por TEXT
    `).catch(() => {});
    await execSql(`
      ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS invoice_id INTEGER
    `).catch(() => {});
    await execSql(`
      ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS pago_em TIMESTAMPTZ
    `).catch(() => {});

    await execSql(`
      ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS margem_percentual NUMERIC(10,2) DEFAULT 0
    `).catch(() => {});

    await execSql(`
      ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS os_number TEXT
    `).catch(() => {});

    await execSql(`
      ALTER TABLE escort_contracts ADD COLUMN IF NOT EXISTS name TEXT
    `).catch(() => {});

    await execSql(`
      ALTER TABLE escort_contracts ADD COLUMN IF NOT EXISTS hora_extra_fracionada BOOLEAN DEFAULT true
    `).catch(() => {});

    await execSql(`
      UPDATE vehicles SET last_latitude = NULL, last_longitude = NULL
      WHERE CAST(COALESCE(NULLIF(last_latitude, ''), '1') AS NUMERIC) = 0
        AND CAST(COALESCE(NULLIF(last_longitude, ''), '1') AS NUMERIC) = 0
    `).catch(() => {});

    await execSql(`
      UPDATE service_orders
      SET fat_calculado = 0,
          lucro_calculado = (0 - COALESCE(custo_total_alocado, 0)),
          margem_calculada = 0,
          valor_estimado = 0,
          pedagio_estimado = 0
      WHERE status IN ('recusada', 'cancelada')
        AND (COALESCE(fat_calculado, 0) > 0 OR COALESCE(valor_estimado, 0) > 0)
    `).catch(() => {});

    await execSql(`
      ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS early_start_approved BOOLEAN DEFAULT false
    `).catch(() => {});

    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS origin_lat REAL`).catch(() => {});
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS origin_lng REAL`).catch(() => {});
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS destination_lat REAL`).catch(() => {});
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS destination_lng REAL`).catch(() => {});

    await execSql(`
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
    await execSql(`CREATE INDEX IF NOT EXISTS idx_mission_pos_so ON mission_positions(service_order_id)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_mission_pos_created ON mission_positions(created_at)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_mission_pos_so_created ON mission_positions(service_order_id, created_at DESC)`).catch(() => {});

    await execSql(`ALTER TABLE mission_costs ALTER COLUMN service_order_id DROP NOT NULL`).catch(() => {});
    await execSql(`ALTER TABLE mission_costs ADD COLUMN IF NOT EXISTS vehicle_id INTEGER`).catch(() => {});
    await execSql(`ALTER TABLE mission_costs ADD COLUMN IF NOT EXISTS employee_id INTEGER`).catch(() => {});
    await execSql(`ALTER TABLE mission_costs ADD COLUMN IF NOT EXISTS photo_url TEXT`).catch(() => {});
    await execSql(`ALTER TABLE mission_costs ADD COLUMN IF NOT EXISTS latitude TEXT`).catch(() => {});
    await execSql(`ALTER TABLE mission_costs ADD COLUMN IF NOT EXISTS longitude TEXT`).catch(() => {});

    await execSql(`ALTER TABLE mission_updates ADD COLUMN IF NOT EXISTS copiado_por TEXT`).catch(() => {});
    await execSql(`ALTER TABLE mission_updates ADD COLUMN IF NOT EXISTS copiado_em TIMESTAMP`).catch(() => {});

    await execSql(`
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

    await execSql(`
      CREATE TABLE IF NOT EXISTS mission_acceptances (
        id TEXT PRIMARY KEY,
        service_order_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        user_id INTEGER,
        status TEXT NOT NULL DEFAULT 'pendente',
        notified_at TIMESTAMP DEFAULT NOW(),
        responded_at TIMESTAMP,
        ip_address TEXT,
        device_info TEXT,
        location_lat DECIMAL(10,7),
        location_lng DECIMAL(10,7),
        acceptance_token TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await execSql(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS provider_cnpj TEXT`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_invoices_provider_cnpj ON invoices (provider_cnpj)`).catch(() => {});
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS km_gps_calculado REAL`).catch(() => {});
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS pontos_gps INTEGER`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_so_status_fat ON service_orders (status, fat_calculado)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_so_created_at ON service_orders (created_at DESC)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_so_status_created ON service_orders (status, created_at DESC)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_so_client_id ON service_orders (client_id)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_emp_created_at ON employees (created_at DESC)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_ft_origin ON financial_transactions (origin_type, origin_id)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_eb_so_id ON escort_billings (service_order_id)`).catch(() => {});

    await execSql(`ALTER TABLE vehicle_fueling ALTER COLUMN latitude TYPE real USING latitude::real`).catch(() => {});
    await execSql(`ALTER TABLE vehicle_fueling ALTER COLUMN longitude TYPE real USING longitude::real`).catch(() => {});
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ticketlog_autorizacao TEXT`).catch(() => {});
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ticketlog_status TEXT`).catch(() => {});
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ticketlog_nfe_data JSONB`).catch(() => {});
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ticketlog_codigo_estab TEXT`).catch(() => {});
    await execSql(`ALTER TABLE mission_photos ALTER COLUMN latitude TYPE real USING latitude::real`).catch(() => {});
    await execSql(`ALTER TABLE mission_photos ALTER COLUMN longitude TYPE real USING longitude::real`).catch(() => {});
    await execSql(`ALTER TABLE mission_photos ADD COLUMN IF NOT EXISTS ai_inspection_status TEXT DEFAULT NULL`).catch(() => {});
    await execSql(`ALTER TABLE mission_photos ADD COLUMN IF NOT EXISTS ai_inspection_result JSONB DEFAULT NULL`).catch(() => {});

    await execSql(`
      CREATE TABLE IF NOT EXISTS inspection_logs (
        id SERIAL PRIMARY KEY,
        mission_photo_id INTEGER REFERENCES mission_photos(id),
        service_order_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        step TEXT NOT NULL,
        expected_plate TEXT,
        detected_plate TEXT,
        plate_match BOOLEAN,
        expected_item TEXT,
        item_detected BOOLEAN,
        item_condition TEXT,
        divergences JSONB DEFAULT '[]',
        ai_raw_response TEXT,
        status TEXT NOT NULL DEFAULT 'pendente',
        alerted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_inspection_logs_so ON inspection_logs (service_order_id)`).catch(() => {});
    await execSql(`ALTER TABLE vehicles ALTER COLUMN last_latitude TYPE real USING last_latitude::real`).catch(() => {});
    await execSql(`ALTER TABLE vehicles ALTER COLUMN last_longitude TYPE real USING last_longitude::real`).catch(() => {});
    await execSql(`ALTER TABLE mission_costs ALTER COLUMN latitude TYPE real USING latitude::real`).catch(() => {});
    await execSql(`ALTER TABLE mission_costs ALTER COLUMN longitude TYPE real USING longitude::real`).catch(() => {});

    await ensureRealtimePublication();

    console.log("[db-init] Schema verified OK");

    backfillOrderCoords().catch(e => console.error("[db-init] backfill coords error:", e.message));
  } catch (err: any) {
    console.error("[db-init] Schema check error:", err.message);
  } finally {
    await closeDbInitClient();
  }
}

const REALTIME_TABLES = [
  "service_orders", "mission_updates", "mission_acceptances",
  "chat_conversations", "chat_messages", "chat_presence",
  "mission_positions", "agent_locations",
  "mission_costs", "financial_transactions", "vehicle_fueling",
  "escort_billings", "billing_alerts", "invoices",
  "clients", "employees", "vehicles",
  "ponto_registros", "timesheets", "holerites",
  "users", "weapon_kits", "system_settings",
  "weapons", "weapon_assignments",
  "fixed_costs", "holidays", "agent_daily_allowances",
  "employee_salaries", "employee_documents",
  "vehicle_maintenance", "vehicle_assignments",
  "client_vehicles", "client_forwards",
  "mission_photos", "trips", "gerenciadoras",
  "absences", "fines", "salary_discounts",
];

async function ensureRealtimePublication() {
  try {
    const { data: existing } = await supabaseAdmin.rpc("exec_sql", {
      query: `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'`
    });

    const existingTables = new Set<string>();
    if (Array.isArray(existing)) {
      existing.forEach((r: any) => existingTables.add(r.tablename));
    }

    const missing = REALTIME_TABLES.filter(t => !existingTables.has(t));
    if (missing.length === 0) {
      console.log(`[db-init] Realtime publication OK (${REALTIME_TABLES.length} tables)`);
      return;
    }

    for (const table of missing) {
      try {
        await execSql(`ALTER PUBLICATION supabase_realtime ADD TABLE ${table}`);
      } catch {}
    }
    console.log(`[db-init] Realtime publication: added ${missing.length} table(s): ${missing.join(", ")}`);
  } catch (e: any) {
    console.warn("[db-init] Realtime publication check skipped:", e.message);
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
  const { data: ordersRaw } = await supabaseAdmin.from("service_orders")
    .select("id, os_number, origin, destination, origin_lat, destination_lat")
    .in("status", ["em_andamento", "agendada"])
    .or("origin_lat.is.null,destination_lat.is.null");
  const orders = toCamelArray(ordersRaw || []) as any[];
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
      const snakeUpdates: any = {};
      if (updates.originLat !== undefined) snakeUpdates.origin_lat = updates.originLat;
      if (updates.originLng !== undefined) snakeUpdates.origin_lng = updates.originLng;
      if (updates.destinationLat !== undefined) snakeUpdates.destination_lat = updates.destinationLat;
      if (updates.destinationLng !== undefined) snakeUpdates.destination_lng = updates.destinationLng;
      await supabaseAdmin.from("service_orders").update(snakeUpdates).eq("id", o.id);
      console.log(`[db-init] Geocoded ${o.osNumber}: origin=${updates.originLat ? "OK" : "skip"} dest=${updates.destinationLat ? "OK" : "skip"}`);
    }
  }
}

export async function ensureCalcMissionRPC() {
  try {
    await execSql(`
      CREATE OR REPLACE FUNCTION calc_mission_elapsed_hours(p_os_id integer)
      RETURNS numeric AS $$
        SELECT COALESCE(
          FLOOR(
            EXTRACT(EPOCH FROM (
              COALESCE(completed_date, (NOW() AT TIME ZONE 'America/Sao_Paulo')::timestamp) - mission_started_at
            )) / 60.0
          ) * 60.0 / 3600.0,
          0
        )
        FROM service_orders WHERE id = p_os_id;
      $$ LANGUAGE sql STABLE;
    `);
    console.log("[db-init] calc_mission_elapsed_hours RPC created OK");
  } catch (e: any) {
    console.error("[db-init] calc_mission_elapsed_hours error:", e.message);
  }

  try {
    await execSql(`
      CREATE OR REPLACE FUNCTION fn_ajustar_data_missao()
      RETURNS TRIGGER AS $$
      BEGIN
        IF (NEW.mission_started_at IS NOT NULL AND NEW.scheduled_date IS NOT NULL
            AND NEW.mission_started_at < NEW.scheduled_date) THEN
          NEW.scheduled_date := NEW.mission_started_at;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await execSql(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ajustar_data_missao'
        ) THEN
          CREATE TRIGGER trg_ajustar_data_missao
          BEFORE UPDATE ON service_orders
          FOR EACH ROW
          WHEN (OLD.mission_started_at IS NULL AND NEW.mission_started_at IS NOT NULL)
          EXECUTE FUNCTION fn_ajustar_data_missao();
        END IF;
      END $$;
    `);
    console.log("[db-init] fn_ajustar_data_missao trigger created OK");
  } catch (e: any) {
    console.error("[db-init] fn_ajustar_data_missao error:", e.message);
  }

  try {
    await execSql(`
      CREATE TABLE IF NOT EXISTS boletim_approvals (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        client_id INTEGER NOT NULL,
        client_name TEXT,
        client_email TEXT,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        billing_ids TEXT[] NOT NULL DEFAULT '{}',
        total_value NUMERIC(12,2) DEFAULT 0,
        os_count INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDENTE',
        approved_at TIMESTAMPTZ,
        approved_by_name TEXT,
        approved_by_ip TEXT,
        sent_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_boletim_approvals_token ON boletim_approvals(token)`);
    await execSql(`ALTER TABLE boletim_approvals ALTER COLUMN billing_ids TYPE TEXT[] USING billing_ids::TEXT[]`);
    await execSql(`ALTER TABLE boletim_approvals ADD COLUMN IF NOT EXISTS sent_by TEXT`);
    await execSql(`ALTER TABLE boletim_approvals ADD COLUMN IF NOT EXISTS sent_by_user_id INTEGER`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_boletim_approvals_client_status ON boletim_approvals(client_id, status)`);
    console.log("[db-init] boletim_approvals table ensured");
  } catch (e: any) {
    console.error("[db-init] boletim_approvals error:", e.message);
  }

  // ─── push_subscriptions (Web Push API) ───
  try {
    await execSql(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        endpoint TEXT UNIQUE NOT NULL,
        p256dh TEXT NOT NULL,
        auth_key TEXT NOT NULL,
        user_id INTEGER,
        user_email TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_push_subs_email ON push_subscriptions(user_email)`);
    console.log("[db-init] push_subscriptions table ensured");
  } catch (e: any) {
    console.error("[db-init] push_subscriptions error:", e.message);
  }

  try {
    await execSql(`
      CREATE TABLE IF NOT EXISTS driver_sessions (
        id SERIAL PRIMARY KEY,
        vehicle_id INTEGER NOT NULL,
        vehicle_plate TEXT,
        vehicle_prefix TEXT,
        vehicle_year INTEGER,
        driver_id INTEGER NOT NULL,
        partner_id INTEGER,
        driver_name TEXT NOT NULL,
        partner_name TEXT,
        km_start INTEGER,
        km_end INTEGER,
        status TEXT NOT NULL DEFAULT 'ativo',
        started_at TIMESTAMPTZ DEFAULT NOW(),
        ended_at TIMESTAMPTZ,
        started_by_user_id INTEGER,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await execSql(`
      CREATE TABLE IF NOT EXISTS driver_shifts (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES driver_sessions(id) ON DELETE CASCADE,
        driver_id INTEGER NOT NULL,
        driver_name TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMPTZ,
        duration_minutes NUMERIC(10,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_driver_sessions_status ON driver_sessions(status)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_driver_sessions_vehicle ON driver_sessions(vehicle_id)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_driver_shifts_session ON driver_shifts(session_id)`);
    console.log("[db-init] driver_sessions + driver_shifts tables ensured");
  } catch (e: any) {
    console.error("[db-init] driver_sessions error:", e.message);
  }

  // Custos Fixos da Operação (Aluguel, Água, Luz, Internet, Softwares etc.)
  try {
    await execSql(`
      CREATE TABLE IF NOT EXISTS fixed_costs (
        id SERIAL PRIMARY KEY,
        description TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Outros',
        monthly_value NUMERIC(12,2) NOT NULL DEFAULT 0,
        due_day INTEGER,
        active BOOLEAN NOT NULL DEFAULT true,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_fixed_costs_active ON fixed_costs(active)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_fixed_costs_category ON fixed_costs(category)`);
    console.log("[db-init] fixed_costs table ensured");
  } catch (e: any) {
    console.error("[db-init] fixed_costs error:", e.message);
  }

  // Garante colunas de benefícios em employee_salaries (cálculo de custo/hora real do agente)
  try {
    await execSql(`ALTER TABLE employee_salaries ADD COLUMN IF NOT EXISTS vale_refeicao_mensal NUMERIC(10,2) DEFAULT 0`);
    await execSql(`ALTER TABLE employee_salaries ADD COLUMN IF NOT EXISTS vale_transporte_mensal NUMERIC(10,2) DEFAULT 0`);
    await execSql(`ALTER TABLE employee_salaries ADD COLUMN IF NOT EXISTS beneficios_outros NUMERIC(10,2) DEFAULT 0`);
    await execSql(`ALTER TABLE employee_salaries ADD COLUMN IF NOT EXISTS encargos_pct NUMERIC(5,2) DEFAULT 80.00`);
    await execSql(`ALTER TABLE employee_salaries ADD COLUMN IF NOT EXISTS horas_mensais NUMERIC(6,2) DEFAULT 220.00`);
    // Novas colunas (CCT atual): VR diário (R$ 43/dia útil) + Cesta Básica mensal (R$ 200)
    await execSql(`ALTER TABLE employee_salaries ADD COLUMN IF NOT EXISTS vale_refeicao_diario NUMERIC(10,2) DEFAULT 43.00`);
    await execSql(`ALTER TABLE employee_salaries ADD COLUMN IF NOT EXISTS cesta_basica NUMERIC(10,2) DEFAULT 200.00`);
    // Folha 2025: periculosidade, dependentes IR, ajuda de custo fixa
    await execSql(`ALTER TABLE employee_salaries ADD COLUMN IF NOT EXISTS periculosidade_pct NUMERIC(5,2) DEFAULT 30.00`);
    await execSql(`ALTER TABLE employee_salaries ADD COLUMN IF NOT EXISTS dependentes_ir INTEGER DEFAULT 0`);
    await execSql(`ALTER TABLE employee_salaries ADD COLUMN IF NOT EXISTS ajuda_custo_mensal NUMERIC(10,2) DEFAULT 0`);
    // Backfill: registros antigos vêm com NULL → aplica padrão Folha 2025 (vigilantes = 30% periculosidade)
    await execSql(`UPDATE employee_salaries SET periculosidade_pct = 30.00 WHERE periculosidade_pct IS NULL`);
    await execSql(`UPDATE employee_salaries SET dependentes_ir = 0 WHERE dependentes_ir IS NULL`);
    await execSql(`UPDATE employee_salaries SET ajuda_custo_mensal = 0 WHERE ajuda_custo_mensal IS NULL`);
    console.log("[db-init] employee_salaries benefit columns ensured (VR diário + cesta + folha 2025)");
  } catch (e: any) {
    console.error("[db-init] employee_salaries alter error:", e.message);
  }

  // Feriados (para cálculo de dias úteis do VR)
  try {
    await execSql(`
      CREATE TABLE IF NOT EXISTS holidays (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        name TEXT NOT NULL,
        national BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date)`);
    // Seed feriados nacionais 2026 (idempotente via ON CONFLICT)
    const seed2026: Array<[string, string]> = [
      ["2026-01-01", "Confraternização Universal"],
      ["2026-02-16", "Carnaval"],
      ["2026-02-17", "Carnaval"],
      ["2026-02-18", "Quarta-feira de Cinzas"],
      ["2026-04-03", "Sexta-feira Santa"],
      ["2026-04-21", "Tiradentes"],
      ["2026-05-01", "Dia do Trabalho"],
      ["2026-06-04", "Corpus Christi"],
      ["2026-09-07", "Independência do Brasil"],
      ["2026-10-12", "Nossa Senhora Aparecida"],
      ["2026-11-02", "Finados"],
      ["2026-11-15", "Proclamação da República"],
      ["2026-11-20", "Consciência Negra"],
      ["2026-12-25", "Natal"],
    ];
    for (const [d, n] of seed2026) {
      await execSql(
        `INSERT INTO holidays (date, name, national) VALUES ('${d}', '${n.replace(/'/g, "''")}', true) ON CONFLICT (date) DO NOTHING`
      );
    }
    console.log("[db-init] holidays table ensured (+ seed 2026)");
  } catch (e: any) {
    console.error("[db-init] holidays error:", e.message);
  }

  // Diárias de Lançamento Manual (ajudas pontuais por agente/dia)
  try {
    await execSql(`
      CREATE TABLE IF NOT EXISTS agent_daily_allowances (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        date DATE NOT NULL,
        amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_daily_allow_emp_date ON agent_daily_allowances(employee_id, date)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_daily_allow_date ON agent_daily_allowances(date)`);
    console.log("[db-init] agent_daily_allowances table ensured");
  } catch (e: any) {
    console.error("[db-init] agent_daily_allowances error:", e.message);
  }

  try {
    await execSql(`
      CREATE TABLE IF NOT EXISTS customer_billing_profiles (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        cnpj TEXT NOT NULL DEFAULT '',
        razao_social TEXT NOT NULL DEFAULT '',
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_cbp_client ON customer_billing_profiles(client_id)`);
    console.log("[db-init] customer_billing_profiles table ensured");
  } catch (e: any) {
    console.error("[db-init] customer_billing_profiles error:", e.message);
  }

  try {
    await execSql(`
      CREATE TABLE IF NOT EXISTS billing_splits (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER,
        client_id INTEGER NOT NULL,
        profile_id INTEGER,
        cnpj TEXT NOT NULL DEFAULT '',
        razao_social TEXT NOT NULL DEFAULT '',
        valor NUMERIC(12,2) NOT NULL DEFAULT 0,
        billing_ids TEXT[] DEFAULT '{}',
        asaas_payment_id TEXT,
        status TEXT DEFAULT 'PENDING',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by TEXT
      )
    `);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_bsplits_invoice ON billing_splits(invoice_id)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_bsplits_client ON billing_splits(client_id)`);
    console.log("[db-init] billing_splits table ensured");
  } catch (e: any) {
    console.error("[db-init] billing_splits error:", e.message);
  }

  await closeDbInitClient();
}
