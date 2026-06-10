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
      CREATE TABLE IF NOT EXISTS branded_contracts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type TEXT NOT NULL CHECK (entity_type IN ('client','employee')),
        entity_id INTEGER NOT NULL,
        title TEXT NOT NULL DEFAULT 'CONTRATO',
        fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        clauses TEXT NOT NULL DEFAULT '',
        witnesses JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_branded_contracts_entity ON branded_contracts(entity_type, entity_id)`);
    await execSql(`ALTER TABLE branded_contracts
      ADD COLUMN IF NOT EXISTS signature_data TEXT,
      ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS signed_by_name TEXT,
      ADD COLUMN IF NOT EXISTS signed_by_doc TEXT,
      ADD COLUMN IF NOT EXISTS signed_ip TEXT,
      ADD COLUMN IF NOT EXISTS signed_user_agent TEXT`);

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
      CREATE TABLE IF NOT EXISTS employee_dependents (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        birth_date DATE NOT NULL,
        parentesco TEXT NOT NULL DEFAULT 'filho',
        cpf TEXT,
        certidao_data TEXT,
        certidao_file_name TEXT,
        deduz_ir BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_employee_dependents_employee ON employee_dependents(employee_id)`);

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
    // SSX Tracking — código de integração da viatura no portal SSX (1 por veículo).
    // Quando preenchido, habilita stream HLS + hover-card de câmeras + alertas IA.
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ssx_integration_code TEXT`);
    // Alertas de IA recebidos via webhook SSX (fadiga, celular, fumando, pânico, etc).
    await execSql(`
      CREATE TABLE IF NOT EXISTS vehicle_ai_alerts (
        id SERIAL PRIMARY KEY,
        vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
        integration_code TEXT NOT NULL,
        tipo TEXT NOT NULL,
        gravidade TEXT DEFAULT 'alta',
        ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB,
        ack_by TEXT,
        ack_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_vehicle_ai_alerts_ocorrido ON vehicle_ai_alerts (ocorrido_em DESC)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_vehicle_ai_alerts_vehicle ON vehicle_ai_alerts (vehicle_id, ocorrido_em DESC)`);
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
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS dependentes_declarados BOOLEAN DEFAULT FALSE`);
    // Regime de contratação: "clt" (default) ou "fixo" (sem encargos/descontos).
    // Funcionários "fixo" recebem o valor bruto como líquido (PJ, autônomo,
    // freelancer pago por fora, estagiário sem encargos, etc).
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS tipo_contratacao TEXT DEFAULT 'clt'`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS initial_km INTEGER DEFAULT 0`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_km_update TIMESTAMP`);
    await execSql(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS document_file TEXT`);
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS full_tank BOOLEAN DEFAULT true`);
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS receipt_photo TEXT`);

    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS address_lat REAL`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS address_lng REAL`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnh_categoria TEXT`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS orgao_emissor TEXT`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS uf_emissor TEXT`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS address_number TEXT`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS address_complement TEXT`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS bairro TEXT`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS city TEXT`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS state TEXT`);
    await execSql(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS zip TEXT`);
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
    await execSql(`CREATE INDEX IF NOT EXISTS idx_al_updated ON agent_locations(updated_at DESC)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_alh_user_date ON agent_location_history(user_id, created_at DESC)`);
    // agent_locations DEVE ter UNIQUE em user_id (1 linha viva por agente). Sem isso, o .upsert({ onConflict: "user_id" })
    // em storage.ts → upsertAgentLocation cai no fallback toda atualização de GPS. Dedupe antes (idempotente: mantém o id maior por user_id).
    await execSql(`DELETE FROM agent_locations a USING agent_locations b WHERE a.user_id = b.user_id AND a.id < b.id`).catch(() => {});
    await execSql(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_agent_loc_user ON agent_locations(user_id)`).catch(() => {});
    // Índice antigo não-único redundante (uniq_agent_loc_user já cobre lookup por user_id).
    await execSql(`DROP INDEX IF EXISTS idx_al_user_id`).catch(() => {});

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
    await execSql(`ALTER TABLE employee_absences ADD COLUMN IF NOT EXISTS rhid_external_id TEXT`);
    await execSql(`ALTER TABLE employee_absences ADD COLUMN IF NOT EXISTS rhid_synced_at TIMESTAMP`);
    await execSql(`ALTER TABLE employee_absences ADD COLUMN IF NOT EXISTS rhid_sync_error TEXT`);

    // Fila de sincronização Control iD / RHID Cloud (push do ERP → RHID).
    // kind: 'punch' | 'absence' | 'employee'
    // op:   'create' | 'update' | 'delete'
    // ref_id: id local do registro afetado (control_id_punches.id, employee_absences.id, employees.id)
    // payload: snapshot do que precisa ser enviado (caso o registro local seja apagado depois)
    // status: 'pending' | 'done' | 'error' | 'unsupported' | 'skipped'
    await execSql(`
      CREATE TABLE IF NOT EXISTS rhid_sync_queue (
        id BIGSERIAL PRIMARY KEY,
        kind TEXT NOT NULL,
        op TEXT NOT NULL,
        ref_id BIGINT,
        employee_id INTEGER,
        device_id INTEGER,
        payload JSONB,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        rhid_response JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        next_attempt_at TIMESTAMP DEFAULT NOW(),
        processed_at TIMESTAMP
      )
    `);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_rhid_sync_queue_pending ON rhid_sync_queue (status, next_attempt_at) WHERE status = 'pending'`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_rhid_sync_queue_ref ON rhid_sync_queue (kind, ref_id)`);

    // Histórico das rodadas de conciliação de ponto (nosso sistema × RHID/AFD).
    // Cada linha guarda os totais, as ações automáticas tomadas e o detalhe
    // completo (por funcionário + tag "validado") da última validação.
    await execSql(`
      CREATE TABLE IF NOT EXISTS rhid_reconciliation_runs (
        id BIGSERIAL PRIMARY KEY,
        run_at TIMESTAMP DEFAULT NOW(),
        period_from TEXT,
        period_to TEXT,
        triggered_by TEXT,
        totals JSONB,
        actions JSONB,
        detail JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_rhid_recon_runs_at ON rhid_reconciliation_runs (run_at DESC)`);

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
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS dsr DECIMAL(10,2)`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS vale_refeicao DECIMAL(10,2)`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS ajuda_custo DECIMAL(10,2)`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS beneficios DECIMAL(10,2)`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS descontos DECIMAL(10,2)`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pendente'`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS data_pagamento TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS financial_transaction_id INTEGER`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS assinatura_status TEXT DEFAULT 'pendente'`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS assinado_em TIMESTAMP`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS assinatura_facial_foto TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS assinatura_desenho TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS assinatura_termo TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS assinatura_ip TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS assinatura_user_agent TEXT`).catch(() => {});

    // ===== Treinamentos do funcionário (onboarding) =====
    await execSql(`
      CREATE TABLE IF NOT EXISTS employee_trainings (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        completed_at DATE NOT NULL,
        expiry_date DATE,
        certificate_url TEXT,
        instructor TEXT,
        carga_horaria INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_trainings_employee ON employee_trainings (employee_id)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_trainings_type ON employee_trainings (type)`).catch(() => {});

    // ===== Contratos de Experiência (45 dias para vigilantes) =====
    await execSql(`
      CREATE TABLE IF NOT EXISTS employee_probation_contracts (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        duration_days INTEGER NOT NULL DEFAULT 45,
        funcao TEXT NOT NULL,
        remuneracao DECIMAL(10,2) NOT NULL,
        local_trabalho TEXT DEFAULT 'O MESMO DA EMPRESA',
        jornada TEXT DEFAULT 'A jornada de trabalho será flexível',
        cidade_contrato TEXT DEFAULT 'SAO PAULO',
        assinatura_status TEXT NOT NULL DEFAULT 'pendente',
        assinado_em TIMESTAMP,
        assinatura_facial_foto TEXT,
        assinatura_desenho TEXT,
        assinatura_termo TEXT,
        assinatura_ip TEXT,
        assinatura_user_agent TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_probation_employee ON employee_probation_contracts (employee_id)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_probation_status ON employee_probation_contracts (assinatura_status)`).catch(() => {});
    await execSql(`ALTER TABLE employee_probation_contracts ADD COLUMN IF NOT EXISTS bypass_diretoria BOOLEAN DEFAULT FALSE`).catch(() => {});
    await execSql(`ALTER TABLE employee_probation_contracts ADD COLUMN IF NOT EXISTS bypass_by INTEGER`).catch(() => {});
    await execSql(`ALTER TABLE employee_probation_contracts ADD COLUMN IF NOT EXISTS bypass_by_name TEXT`).catch(() => {});
    await execSql(`ALTER TABLE employee_probation_contracts ADD COLUMN IF NOT EXISTS bypass_at TIMESTAMP`).catch(() => {});
    await execSql(`ALTER TABLE employee_probation_contracts ADD COLUMN IF NOT EXISTS bypass_reason TEXT`).catch(() => {});
    // Grandfather: contratos pendentes criados antes da entrada em vigor da regra
    // recebem bypass automático para não bloquear vigilantes pré-existentes.
    // Idempotente — após marcados, não são mais alvo do UPDATE.
    await execSql(`
      UPDATE employee_probation_contracts
      SET bypass_diretoria = true,
          bypass_by_name = 'Sistema (regra retroativa)',
          bypass_at = NOW(),
          bypass_reason = 'Funcionário pré-existente — assinatura obrigatória vigora apenas para cadastros a partir de 11/05/2026'
      WHERE assinatura_status <> 'assinado'
        AND COALESCE(bypass_diretoria, false) = false
        AND created_at < '2026-05-11T15:00:00-03:00'
    `).catch(() => {});

    // ===== Contratos Definitivos (CLT, prazo indeterminado) =====
    // Gerado automaticamente quando o Contrato de Experiência (45d) vence
    // estando assinado. Mesmo padrão de assinatura/bypass do probation.
    await execSql(`
      CREATE TABLE IF NOT EXISTS employee_permanent_contracts (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        probation_contract_id INTEGER,
        start_date DATE NOT NULL,
        funcao TEXT NOT NULL,
        remuneracao DECIMAL(10,2) NOT NULL,
        local_trabalho TEXT DEFAULT 'O MESMO DA EMPRESA',
        jornada TEXT DEFAULT 'A jornada de trabalho será flexível',
        cidade_contrato TEXT DEFAULT 'SAO PAULO',
        assinatura_status TEXT NOT NULL DEFAULT 'pendente',
        assinado_em TIMESTAMP,
        assinatura_facial_foto TEXT,
        assinatura_desenho TEXT,
        assinatura_termo TEXT,
        assinatura_ip TEXT,
        assinatura_user_agent TEXT,
        bypass_diretoria BOOLEAN DEFAULT FALSE,
        bypass_by INTEGER,
        bypass_by_name TEXT,
        bypass_at TIMESTAMP,
        bypass_reason TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_permanent_employee ON employee_permanent_contracts (employee_id)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_permanent_status ON employee_permanent_contracts (assinatura_status)`).catch(() => {});
    await execSql(`CREATE UNIQUE INDEX IF NOT EXISTS uq_permanent_per_probation ON employee_permanent_contracts (probation_contract_id) WHERE probation_contract_id IS NOT NULL`).catch(() => {});

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
    await execSql(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_number TEXT`).catch(() => {});
    await execSql(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_complement TEXT`).catch(() => {});
    await execSql(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS bairro TEXT`).catch(() => {});
    await execSql(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS inscricao_municipal TEXT`).catch(() => {});
    await execSql(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS inscricao_estadual TEXT`).catch(() => {});
    await execSql(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_person TEXT`).catch(() => {});
    await execSql(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp_group_id TEXT`).catch(() => {});
    // Tabela de controle do "Agente Central": rastreia última cobrança de
    // atualização enviada via WhatsApp pra cada OS, pra não spamar (intervalo
    // mínimo de 30min entre cobranças). Linha é deletada quando o vigilante
    // posta nova mission_update (reset).
    await execSql(`
      CREATE TABLE IF NOT EXISTS agent_central_reminders (
        service_order_id INTEGER PRIMARY KEY,
        last_reminded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reminder_count INTEGER NOT NULL DEFAULT 0
      )
    `).catch(() => {});
    // Pedidos de atualização feitos DENTRO de um grupo WhatsApp (ex:
    // "OP. TMSEG X TORRES (EASP)"). Quando alguém cobra atualização no grupo,
    // o Agente Central registra o pedido aqui, cobra os agentes da OS por DM e
    // responde no grupo. Quando o agente posta a próxima mission_update, o
    // pedido aberto é resolvido: a atualização é encaminhada de volta pro
    // grupo mencionando quem pediu, e fulfilled_at é preenchido.
    await execSql(`
      CREATE TABLE IF NOT EXISTS agent_central_group_requests (
        id SERIAL PRIMARY KEY,
        group_id TEXT NOT NULL,
        service_order_id INTEGER NOT NULL,
        requester_name TEXT,
        requester_phone TEXT,
        source_message_id TEXT,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        fulfilled_at TIMESTAMPTZ
      )
    `).catch(() => {});
    await execSql(`
      CREATE INDEX IF NOT EXISTS idx_acgr_open
      ON agent_central_group_requests (service_order_id)
      WHERE fulfilled_at IS NULL
    `).catch(() => {});
    // Ack DEFERIDO (jun/2026): a Central espera ACK_WINDOW_MIN antes de responder
    // no grupo. Se a equipe falar no grupo nesse meio-tempo (ou a atualização
    // chegar), o ack é suprimido. ack_decide_at = quando decidir; ack_resolved_at
    // = quando foi decidido; ack_resolution = 'sent'|'team_handled'|'fulfilled'.
    await execSql(`ALTER TABLE agent_central_group_requests ADD COLUMN IF NOT EXISTS ack_decide_at TIMESTAMPTZ`).catch(() => {});
    await execSql(`ALTER TABLE agent_central_group_requests ADD COLUMN IF NOT EXISTS ack_resolved_at TIMESTAMPTZ`).catch(() => {});
    await execSql(`ALTER TABLE agent_central_group_requests ADD COLUMN IF NOT EXISTS ack_resolution TEXT`).catch(() => {});
    // Índice pro flush: pega só os acks pendentes (deferido e ainda não resolvido).
    await execSql(`
      CREATE INDEX IF NOT EXISTS idx_acgr_ack_pending
      ON agent_central_group_requests (ack_decide_at)
      WHERE ack_decide_at IS NOT NULL AND ack_resolved_at IS NULL
    `).catch(() => {});
    // Permite batidas manuais sem external_id (RHID ainda não sincronizou).
    await execSql(`ALTER TABLE control_id_punches ALTER COLUMN external_id DROP NOT NULL`).catch(() => {});
    // Permite batidas manuais sem device_id / control_id_user_id (funcionário ainda
    // não mapeado a um aparelho). O ERP é a fonte da verdade — nunca perder o registro
    // local mesmo sem mapping.
    await execSql(`ALTER TABLE control_id_punches ALTER COLUMN device_id DROP NOT NULL`).catch(() => {});
    await execSql(`ALTER TABLE control_id_punches ALTER COLUMN control_id_user_id DROP NOT NULL`).catch(() => {});

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
      CREATE TABLE IF NOT EXISTS system_notifications (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'critical',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        target_role TEXT NOT NULL DEFAULT 'all',
        require_ack BOOLEAN NOT NULL DEFAULT TRUE,
        related_type TEXT,
        related_id INTEGER,
        acked_by_user_ids INTEGER[] NOT NULL DEFAULT '{}'::int[],
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_sysnotif_created ON system_notifications(created_at DESC)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_sysnotif_target ON system_notifications(target_role, expires_at)`);

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

    // Telemetria do banco — amostras coletadas a cada 2min, mantém 7 dias.
    await execSql(`
      CREATE TABLE IF NOT EXISTS db_health_samples (
        id BIGSERIAL PRIMARY KEY,
        sampled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        latency_ms INTEGER NOT NULL,
        active_connections INTEGER,
        idle_connections INTEGER,
        total_connections INTEGER,
        max_connections INTEGER,
        long_query_count INTEGER DEFAULT 0,
        node_cpu_pct REAL,
        node_mem_mb INTEGER,
        fallback_active BOOLEAN DEFAULT FALSE,
        db_size_mb INTEGER
      )
    `);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_db_health_sampled ON db_health_samples(sampled_at DESC)`);
    // Colunas aditivas para histórico das novas métricas (cache, idle-in-tx, tuplas lidas/escritas).
    await execSql(`ALTER TABLE db_health_samples ADD COLUMN IF NOT EXISTS cache_hit_ratio REAL`);
    await execSql(`ALTER TABLE db_health_samples ADD COLUMN IF NOT EXISTS idle_in_transaction INTEGER`);
    await execSql(`ALTER TABLE db_health_samples ADD COLUMN IF NOT EXISTS tuples_read BIGINT`);
    await execSql(`ALTER TABLE db_health_samples ADD COLUMN IF NOT EXISTS tuples_written BIGINT`);
    // Recarrega o schema cache do PostgREST imediatamente: sem isso, os primeiros
    // inserts do sampler (via supabaseAdmin REST) falhariam em silêncio até o cache
    // recarregar sozinho, gravando NULL nas colunas novas logo após o deploy.
    await execSql(`NOTIFY pgrst, 'reload schema'`).catch(() => {});

    // RPC SECURITY DEFINER expõe estatísticas de pg_stat_activity sem dar acesso direto.
    await execSql(`
      CREATE OR REPLACE FUNCTION public.db_telemetry_snapshot() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $f$
      DECLARE r jsonb;
      BEGIN
        SELECT jsonb_build_object(
          'active_connections', (SELECT count(*) FROM pg_stat_activity WHERE state='active'),
          'idle_connections', (SELECT count(*) FROM pg_stat_activity WHERE state='idle'),
          'total_connections', (SELECT count(*) FROM pg_stat_activity),
          'max_connections', current_setting('max_connections')::int,
          'long_queries', COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'pid', pid,
              'duration_s', extract(epoch from (now() - query_start))::int,
              'state', state,
              'query', left(query, 200),
              'application_name', application_name,
              'client_addr', client_addr::text
            )) FROM pg_stat_activity
            WHERE state='active'
              AND query_start < now() - interval '5 seconds'
              AND query NOT ILIKE '%pg_stat_activity%'
              AND query NOT ILIKE '%db_telemetry_snapshot%'
          ), '[]'::jsonb),
          'db_size_mb', (pg_database_size(current_database())/1024/1024)::int,
          'cache_hit_ratio', (SELECT round((sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read) + 0.000001) * 100)::numeric, 2) FROM pg_statio_user_tables),
          'idle_in_transaction', (SELECT count(*) FROM pg_stat_activity WHERE state='idle in transaction'),
          'tuples_read', (SELECT COALESCE(sum(seq_tup_read + idx_tup_fetch), 0) FROM pg_stat_user_tables),
          'tuples_written', (SELECT COALESCE(sum(n_tup_ins + n_tup_upd + n_tup_del), 0) FROM pg_stat_user_tables),
          'sampled_at', now()
        ) INTO r;
        RETURN r;
      END $f$
    `);
    // Garante que NÃO há acesso para anon/authenticated. Apenas service_role
    // (usado pelo supabaseAdmin no servidor) deve invocar a função — o texto
    // das queries em pg_stat_activity pode conter dados sensíveis.
    await execSql(`REVOKE ALL ON FUNCTION public.db_telemetry_snapshot() FROM PUBLIC, anon, authenticated`);
    await execSql(`GRANT EXECUTE ON FUNCTION public.db_telemetry_snapshot() TO service_role`);

    // RPC de monitoramento: top 10 tabelas do schema public por tamanho total
    // (dados + índices). Read-only sobre catálogo do Postgres; usado na tela
    // "Banco de Dados". Retorna jsonb array já ordenado decrescente.
    await execSql(`
      CREATE OR REPLACE FUNCTION public.db_table_sizes()
      RETURNS jsonb
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public, pg_catalog
      AS $$
        SELECT COALESCE(jsonb_agg(t ORDER BY t.total_size_bytes DESC), '[]'::jsonb)
        FROM (
          SELECT
            c.relname AS table_name,
            pg_size_pretty(pg_table_size(c.oid)) AS data_size,
            pg_size_pretty(pg_indexes_size(c.oid)) AS index_size,
            pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
            pg_total_relation_size(c.oid) AS total_size_bytes
          FROM pg_class c
          JOIN pg_namespace n ON (n.oid = c.relnamespace)
          WHERE c.relkind = 'r' AND n.nspname = 'public'
          ORDER BY pg_total_relation_size(c.oid) DESC
          LIMIT 10
        ) t;
      $$;
    `);
    await execSql(`REVOKE ALL ON FUNCTION public.db_table_sizes() FROM PUBLIC, anon, authenticated`);
    await execSql(`GRANT EXECUTE ON FUNCTION public.db_table_sizes() TO service_role`);

    // Relatórios de IA da telemetria do banco (gerados a cada 10 min). Guardamos
    // apenas os últimos 6 (poda no app). status: 'good' | 'warn' | 'bad'.
    await execSql(`
      CREATE TABLE IF NOT EXISTS db_ai_reports (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        status TEXT NOT NULL DEFAULT 'good',
        headline TEXT NOT NULL DEFAULT '',
        analysis TEXT NOT NULL DEFAULT '',
        metrics JSONB
      );
    `);

    // Diagnóstico de causa raiz: top consultas por carga (pg_stat_statements).
    // Read-only, SECURITY DEFINER (pra enxergar a view de estatísticas), filtra
    // ruído de introspecção/realtime e mostra média por chamada + cache hit, pra
    // a IA apontar QUAL consulta está pesando e o porquê. Extensão já confirmada
    // (pg_stat_statements 1.11) na inspeção do Supabase de produção.
    await execSql(`
      CREATE OR REPLACE FUNCTION public.db_top_queries()
      RETURNS TABLE (
        query text,
        calls bigint,
        total_ms numeric,
        mean_ms numeric,
        rows bigint,
        cache_hit_pct numeric
      )
      LANGUAGE sql
      SECURITY DEFINER
      STABLE
      SET search_path = public, extensions, pg_catalog
      AS $$
        SELECT
          left(regexp_replace(s.query, '\\s+', ' ', 'g'), 300) AS query,
          s.calls,
          round(s.total_exec_time)::numeric AS total_ms,
          round(s.mean_exec_time)::numeric  AS mean_ms,
          s.rows,
          CASE WHEN (s.shared_blks_hit + s.shared_blks_read) > 0
            THEN round(100.0 * s.shared_blks_hit / (s.shared_blks_hit + s.shared_blks_read), 1)
            ELSE NULL END AS cache_hit_pct
        FROM pg_stat_statements s
        WHERE s.calls > 1
          -- Allowlist: só as consultas de DADOS do app (PostgREST em tabelas public).
          AND s.query ILIKE '%pgrst_source%'
          AND s.query ILIKE '%"public"."%'
          -- Tira plumbing do PostgREST (chamadas de RPC) e a própria telemetria.
          AND s.query NOT ILIKE '%pgrst_scalar%'
          AND s.query NOT ILIKE '%db_telemetry_snapshot%'
          AND s.query NOT ILIKE '%db_top_queries%'
          AND s.query NOT ILIKE '%db_table_sizes%'
          AND s.query NOT ILIKE '%db_health_samples%'
          AND s.query NOT ILIKE '%db_ai_reports%'
        ORDER BY s.mean_exec_time DESC
        LIMIT 8
      $$;
    `);
    await execSql(`REVOKE ALL ON FUNCTION public.db_top_queries() FROM PUBLIC, anon, authenticated`);
    await execSql(`GRANT EXECUTE ON FUNCTION public.db_top_queries() TO service_role`);

    // Recarrega o schema cache do PostgREST p/ a nova função/tabela ficarem
    // visíveis via supabaseAdmin imediatamente (sem isso, a 1ª chamada dá "Could
    // not find the function/table ... in the schema cache" até recarregar sozinho).
    await execSql(`NOTIFY pgrst, 'reload schema'`);

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
    await execSql(`ALTER TABLE mission_updates ADD COLUMN IF NOT EXISTS whatsapp_forwarded_at TIMESTAMPTZ`).catch(() => {});
    await execSql(`ALTER TABLE mission_updates ADD COLUMN IF NOT EXISTS whatsapp_forward_error TEXT`).catch(() => {});
    await execSql(`ALTER TABLE mission_updates ADD COLUMN IF NOT EXISTS whatsapp_forward_claimed_at TIMESTAMPTZ`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_mu_pending_forward ON mission_updates (created_at DESC) WHERE whatsapp_forwarded_at IS NULL AND photo_url IS NOT NULL`).catch(() => {});
    await execSql(`CREATE TABLE IF NOT EXISTS whatsapp_group_throttle (group_id TEXT PRIMARY KEY, last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(() => {});

    // ────────────────────────────────────────────────────────────────
    // WhatsApp embarcado — chats + mensagens (populadas via webhook
    // Z-API + nossas próprias rotas de envio). A Z-API multi-device
    // não permite buscar histórico antigo via API, então tudo que
    // aparece aqui veio em tempo real a partir do momento em que o
    // webhook foi ativado ou do nosso send.
    // ────────────────────────────────────────────────────────────────
    await execSql(`
      CREATE TABLE IF NOT EXISTS whatsapp_chats (
        chat_id TEXT PRIMARY KEY,
        name TEXT,
        is_group BOOLEAN NOT NULL DEFAULT false,
        last_message_at TIMESTAMPTZ,
        last_message_text TEXT,
        last_message_from_me BOOLEAN,
        unread_count INTEGER NOT NULL DEFAULT 0,
        pinned BOOLEAN NOT NULL DEFAULT false,
        archived BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_wc_last_msg ON whatsapp_chats (last_message_at DESC NULLS LAST)`).catch(() => {});

    await execSql(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id BIGSERIAL PRIMARY KEY,
        chat_id TEXT NOT NULL,
        zapi_message_id TEXT,
        from_me BOOLEAN NOT NULL,
        sender_phone TEXT,
        sender_name TEXT,
        type TEXT NOT NULL DEFAULT 'text',
        body TEXT,
        media_url TEXT,
        media_mime TEXT,
        status TEXT,
        ts TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_wm_chat_ts ON whatsapp_messages (chat_id, ts DESC)`).catch(() => {});
    await execSql(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_wm_zapi_id ON whatsapp_messages (zapi_message_id) WHERE zapi_message_id IS NOT NULL`).catch(() => {});

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
    await execSql(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nfse_error_message TEXT`).catch(() => {});
    await execSql(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nfse_observations TEXT`).catch(() => {});
    await execSql(`NOTIFY pgrst, 'reload schema'`).catch(() => {});
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS km_gps_calculado REAL`).catch(() => {});
    await execSql(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS pontos_gps INTEGER`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_so_status_fat ON service_orders (status, fat_calculado)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_so_created_at ON service_orders (created_at DESC)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_so_status_created ON service_orders (status, created_at DESC)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_so_client_id ON service_orders (client_id)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_emp_created_at ON employees (created_at DESC)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_ft_origin ON financial_transactions (origin_type, origin_id)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_eb_so_id ON escort_billings (service_order_id)`).catch(() => {});
    // Trava de duplicação: uma OS só pode ter UM billing. Previne race condition em UPSERTs concorrentes
    // e INSERTs cegos (mission.ts cancelamento, escort.ts manual). Veja replit.md §"Regras INTOCÁVEIS".
    // ATENÇÃO: o índice NÃO pode ser parcial (sem WHERE) porque o Postgres exige índice unique TOTAL pra
    // suportar `INSERT ... ON CONFLICT (service_order_id)` (usado por `.upsert({ onConflict })` do
    // supabase-js no cron e em mission.ts/escort.ts). Índice parcial gera erro 42P10 silencioso, billing
    // nunca persiste, e a UI mostra "Sem Cálculo" (caso real corrigido em 25/05/2026). NULLs em UNIQUE
    // são considerados distintos no Postgres, então billings avulsos (service_order_id NULL) continuam OK.
    await execSql(`DROP INDEX IF EXISTS uniq_eb_so_id_partial`).catch(() => {});
    await execSql(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uniq_eb_so_id' AND indexdef LIKE '%WHERE%') THEN
        DROP INDEX uniq_eb_so_id;
      END IF;
    END $$`).catch(() => {});
    await execSql(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_eb_so_id ON escort_billings (service_order_id)`).catch((e: any) => {
      console.warn(`[db-init] uniq_eb_so_id falhou (provavelmente já existem duplicatas): ${e?.message || e}`);
    });
    // FKs sem índice (Supabase Advisor 0001_unindexed_foreign_keys) — escort_billings/chat_messages.
    await execSql(`CREATE INDEX IF NOT EXISTS idx_eb_client_id ON escort_billings (client_id)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_chat_msg_conversation ON chat_messages (conversation_id)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_chat_msg_sender ON chat_messages (sender_id)`).catch(() => {});

    await execSql(`ALTER TABLE vehicle_fueling ALTER COLUMN latitude TYPE real USING latitude::real`).catch(() => {});
    await execSql(`ALTER TABLE vehicle_fueling ALTER COLUMN longitude TYPE real USING longitude::real`).catch(() => {});
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ticketlog_autorizacao TEXT`).catch(() => {});
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ticketlog_status TEXT`).catch(() => {});
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ticketlog_nfe_data JSONB`).catch(() => {});
    await execSql(`ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ticketlog_codigo_estab TEXT`).catch(() => {});

    // Índices criados em 2026-05 pra cortar o statement_timeout recorrente em
    // /api/fueling. O primeiro suporta syncVehicleKmFromFuelings() (MAX(km)
    // por veículo); o segundo acelera o ORDER BY created_at DESC do listing.
    await execSql(`CREATE INDEX IF NOT EXISTS idx_vfueling_vehicle_km ON vehicle_fueling(vehicle_id, km DESC)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_vfueling_created_at ON vehicle_fueling(created_at DESC)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_vfueling_vehicle_date ON vehicle_fueling(vehicle_id, date)`).catch(() => {});
    // Relatório /api/fueling filtra por intervalo de data; sem este índice o Postgres faz seq scan e estoura statement_timeout.
    await execSql(`CREATE INDEX IF NOT EXISTS idx_vf_date_vehicle ON vehicle_fueling(date DESC, vehicle_id)`).catch(() => {});

    // Índices adicionais pra cortar lentidão em tabelas que apareciam nos
    // logs SLOW-SUPA (users 21s, financial_transactions 15-18s, clients 18s).
    await execSql(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_users_supabase_uid ON users(supabase_uid)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_ft_due_date ON financial_transactions(due_date)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_ft_status_due ON financial_transactions(status, due_date)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_ft_type_status ON financial_transactions(type, status)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_clients_cnpj ON clients(cnpj)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_mc_so ON mission_costs(service_order_id)`).catch(() => {});

    // Índices em mission_updates — tabela é polled 30+ vezes/min pelo grid
    // operacional aberto. Patterns vistos no código:
    //   .eq("service_order_id", id).order("created_at", asc)  -> mission.ts:3256, service-orders.ts:2878
    //   .eq("read_by_admin", 0).order("created_at", desc)     -> mission.ts:1184/1246
    //   .order("created_at", desc).limit(N)                    -> mission.ts:1190
    //   .delete().eq("employee_id", id)                        -> employees.ts:220
    await execSql(`CREATE INDEX IF NOT EXISTS idx_mu_so_created ON mission_updates(service_order_id, created_at DESC)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_mu_unread ON mission_updates(read_by_admin, created_at DESC) WHERE read_by_admin = 0`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_mu_created_at ON mission_updates(created_at DESC)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_mu_employee ON mission_updates(employee_id)`).catch(() => {});
    // Índice GIN trigram pra ILIKE '%...%' em description (usado por
    // syncFuelingMissionCosts no padrão "%[F#%"). text_pattern_ops NÃO
    // ajuda nesse padrão (precisa ser GIN + gin_trgm_ops).
    await execSql(`CREATE EXTENSION IF NOT EXISTS pg_trgm`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_mc_description_trgm ON mission_costs USING gin (description gin_trgm_ops)`).catch(() => {});
    // Se a versão errada tiver sido criada num boot anterior, remove pra
    // não confundir o planner.
    await execSql(`DROP INDEX IF EXISTS idx_mc_description_trgm_btree`).catch(() => {});

    // Tabelas geridas anteriormente via exec_sql em runtime (leads.ts, asaas.ts).
    // Movidas pra cá em 2026-05 — runtime exec_sql derrubava o pool.
    await execSql(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        empresa TEXT NOT NULL,
        cnpj TEXT,
        contato_nome TEXT,
        contato_cargo TEXT,
        telefone TEXT,
        email TEXT,
        website TEXT,
        endereco TEXT,
        cidade TEXT DEFAULT 'São Paulo',
        estado TEXT DEFAULT 'SP',
        cep TEXT,
        setor TEXT,
        origem TEXT DEFAULT 'prospecao_ativa',
        status TEXT DEFAULT 'novo',
        temperatura TEXT DEFAULT 'frio',
        valor_estimado REAL DEFAULT 0,
        notas TEXT,
        motivo_perda TEXT,
        proximo_contato TIMESTAMP,
        ultimo_contato TIMESTAMP,
        responsavel TEXT,
        responsavel_id INTEGER,
        google_place_id TEXT,
        google_rating REAL,
        google_total_reviews INTEGER,
        tags TEXT[],
        historico JSONB DEFAULT '[]'::jsonb,
        emails_enviados INTEGER DEFAULT 0,
        convertido_client_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_leads_setor ON leads(setor)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_leads_cidade ON leads(cidade)`).catch(() => {});

    await execSql(`
      CREATE TABLE IF NOT EXISTS email_queue (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
        to_email TEXT NOT NULL,
        to_name TEXT,
        empresa TEXT,
        subject TEXT NOT NULL,
        html_body TEXT NOT NULL,
        status TEXT DEFAULT 'pendente',
        tracking_id TEXT UNIQUE,
        opened_at TIMESTAMP,
        opened_count INTEGER DEFAULT 0,
        replied BOOLEAN DEFAULT FALSE,
        replied_at TIMESTAMP,
        error_message TEXT,
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        campaign_tag TEXT DEFAULT 'apresentacao'
      )
    `).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_email_queue_tracking ON email_queue(tracking_id)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_email_queue_lead ON email_queue(lead_id)`).catch(() => {});
    await execSql(`CREATE INDEX IF NOT EXISTS idx_email_queue_sent ON email_queue(sent_at)`).catch(() => {});

    await execSql(`
      CREATE TABLE IF NOT EXISTS auto_prospect_state (
        id SERIAL PRIMARY KEY,
        query_index INTEGER DEFAULT 0,
        next_page_token TEXT,
        total_found INTEGER DEFAULT 0,
        last_run TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {});
    await execSql(`INSERT INTO auto_prospect_state (id, query_index) VALUES (1, 0) ON CONFLICT (id) DO NOTHING`).catch(() => {});
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

    // cct_presets — múltiplos presets de CCT (vigilancia, siemaco, etc).
    // `cargos` é matched por substring case-insensitive em resolvePresetKeyForCargo.
    await execSql(`CREATE TABLE IF NOT EXISTS cct_presets (
      id SERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      sindicato TEXT DEFAULT '',
      cargos TEXT[] DEFAULT '{}',
      config JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`).catch((e: any) => console.warn("[db-init] cct_presets:", e?.message));

    await ensureRealtimePublication();

    // Seed dos presets canônicos (idempotente — só cria se não existe).
    try {
      const { ensureDefaultPresets } = await import("./lib/cct-config");
      await ensureDefaultPresets();
    } catch (e: any) {
      console.error("[db-init] ensureDefaultPresets:", e?.message);
    }

    console.log("[db-init] Schema verified OK");

    backfillOrderCoords().catch(e => console.error("[db-init] backfill coords error:", e.message));
  } catch (err: any) {
    console.error("[db-init] Schema check error:", err.message);
  } finally {
    await closeDbInitClient();
  }
}

// Lista de tabelas que ficam em supabase_realtime. Reduzida em 2026-05
// de 40 → 29 pra desafogar workers do Realtime e conexões do pool.
// Tabelas removidas eram editadas pontualmente (RH/armamento/feriados/folha)
// e a mutation local já invalida o cache na aba do usuário — só perde
// sync automático entre múltiplas abas/dispositivos pra essas, tradeoff
// aceitável diante das quedas recorrentes do sistema.
const REALTIME_TABLES = [
  "service_orders", "mission_updates", "mission_acceptances",
  "chat_conversations", "chat_messages", "chat_presence",
  "mission_positions", "agent_locations",
  "mission_costs", "financial_transactions", "vehicle_fueling",
  "escort_billings", "billing_alerts", "invoices",
  "clients", "employees", "vehicles",
  "ponto_registros", "timesheets",
  "users", "system_settings",
  "vehicle_maintenance", "vehicle_assignments",
  "client_vehicles", "client_forwards",
  "mission_photos", "trips", "gerenciadoras",
  "whatsapp_chats", "whatsapp_messages",
];

// Removidas em 2026-05 — eram caras (40 tabelas em Realtime saturava pool)
// e raramente editadas em runtime. Mutations já invalidam cache local.
const REALTIME_TABLES_TO_DROP = [
  "holerites", "holidays", "salary_discounts",
  "weapons", "weapon_kits", "weapon_assignments",
  "fixed_costs", "absences", "fines",
  "employee_documents", "employee_salaries", "agent_daily_allowances",
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

    // 1) ADD pras que faltam.
    const missing = REALTIME_TABLES.filter(t => !existingTables.has(t));
    for (const table of missing) {
      try {
        await execSql(`ALTER PUBLICATION supabase_realtime ADD TABLE ${table}`);
      } catch {}
    }

    // 2) DROP das que foram retiradas da lista mas continuam na publicação.
    const toDrop = REALTIME_TABLES_TO_DROP.filter(t => existingTables.has(t));
    for (const table of toDrop) {
      try {
        await execSql(`ALTER PUBLICATION supabase_realtime DROP TABLE ${table}`);
      } catch {}
    }

    if (missing.length === 0 && toDrop.length === 0) {
      console.log(`[db-init] Realtime publication OK (${REALTIME_TABLES.length} tables)`);
    } else {
      console.log(`[db-init] Realtime publication: +${missing.length} added, -${toDrop.length} dropped (final: ${REALTIME_TABLES.length} tables)`);
      if (missing.length > 0) console.log(`[db-init]   added: ${missing.join(", ")}`);
      if (toDrop.length > 0) console.log(`[db-init]   dropped: ${toDrop.join(", ")}`);
    }
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
              COALESCE(completed_date, (NOW() AT TIME ZONE 'America/Sao_Paulo')::timestamp)
              - LEAST(
                  COALESCE(scheduled_date, mission_started_at),
                  COALESCE(mission_started_at, scheduled_date)
                )
            )) / 60.0
          ) * 60.0 / 3600.0,
          0
        )
        FROM service_orders
        WHERE id = p_os_id
          AND mission_started_at IS NOT NULL;
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

  try {
    await execSql(`
      CREATE TABLE IF NOT EXISTS ticketlog_pedagio_audit_notes (
        id SERIAL PRIMARY KEY,
        codigo_fatura TEXT NOT NULL,
        scope TEXT NOT NULL,
        csv_codigo TEXT,
        mission_cost_id INTEGER,
        service_order_id INTEGER,
        status TEXT NOT NULL DEFAULT 'pendente',
        observacao TEXT NOT NULL DEFAULT '',
        created_by_id TEXT,
        created_by_name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        snapshot JSONB
      )
    `);
    await execSql(`ALTER TABLE ticketlog_pedagio_audit_notes ADD COLUMN IF NOT EXISTS snapshot JSONB`);
    await execSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_tlpan_fatura_csv ON ticketlog_pedagio_audit_notes(codigo_fatura, csv_codigo) WHERE csv_codigo IS NOT NULL`,
    );
    await execSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_tlpan_fatura_mc ON ticketlog_pedagio_audit_notes(codigo_fatura, mission_cost_id) WHERE mission_cost_id IS NOT NULL`,
    );
    await execSql(`CREATE INDEX IF NOT EXISTS idx_tlpan_fatura ON ticketlog_pedagio_audit_notes(codigo_fatura)`);
    console.log("[db-init] ticketlog_pedagio_audit_notes table ensured");
  } catch (e: any) {
    console.error("[db-init] ticketlog_pedagio_audit_notes error:", e.message);
  }

  try {
    await execSql(`
      CREATE TABLE IF NOT EXISTS ticketlog_pedagio_audit_notes_history (
        id SERIAL PRIMARY KEY,
        note_id INTEGER,
        codigo_fatura TEXT NOT NULL,
        scope TEXT NOT NULL,
        csv_codigo TEXT,
        mission_cost_id INTEGER,
        service_order_id INTEGER,
        action TEXT NOT NULL,
        previous_status TEXT,
        new_status TEXT,
        previous_observacao TEXT,
        new_observacao TEXT,
        changed_by_id TEXT,
        changed_by_name TEXT,
        changed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_tlpanh_note ON ticketlog_pedagio_audit_notes_history(note_id)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_tlpanh_fatura ON ticketlog_pedagio_audit_notes_history(codigo_fatura)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_tlpanh_fatura_csv ON ticketlog_pedagio_audit_notes_history(codigo_fatura, csv_codigo)`);
    await execSql(`CREATE INDEX IF NOT EXISTS idx_tlpanh_fatura_mc ON ticketlog_pedagio_audit_notes_history(codigo_fatura, mission_cost_id)`);
    console.log("[db-init] ticketlog_pedagio_audit_notes_history table ensured");
  } catch (e: any) {
    console.error("[db-init] ticketlog_pedagio_audit_notes_history error:", e.message);
  }

  await closeDbInitClient();
}
