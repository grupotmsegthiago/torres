import pg from "pg";
import nodemailer from "nodemailer";

const ALERT_EMAIL = "thiago@grupotmseg.com.br";
const COOLDOWN_MS = 10 * 60 * 1000;
let lastDownAlertAt = 0;
let lastUpAlertAt = 0;
let downSince: Date | null = null;

function getMailTransporter() {
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host, port, secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false },
  });
}

function sendHealthAlert(subject: string, html: string) {
  const transporter = getMailTransporter();
  if (!transporter) {
    console.warn("[pg-fallback] SMTP não configurado — alerta de saúde não enviado");
    return;
  }
  const from = `"Torres Vigilância - Sistema" <${process.env.SMTP_FROM || process.env.SMTP_USER || "escolta@torresseguranca.com.br"}>`;
  transporter.sendMail({ from, to: ALERT_EMAIL, subject, html }).then(() => {
    console.log(`[pg-fallback] Alerta enviado para ${ALERT_EMAIL}: ${subject}`);
  }).catch((err: any) => {
    console.error(`[pg-fallback] Falha ao enviar alerta: ${err.message}`);
  });
}

function formatBRT(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

const CORE_TABLES = [
  "users", "employees", "vehicles", "clients", "service_orders",
  "escort_billings", "escort_contracts", "financial_transactions",
  "mission_photos", "timesheets", "mission_costs", "client_vehicles",
  "gerenciadoras", "weapons", "weapon_kits", "weapon_kit_items",
  "weapon_assignments", "vehicle_assignments", "vehicle_maintenance",
  "vehicle_fueling", "trips", "employee_salaries", "employee_documents",
  "perfis_acesso", "agent_locations", "invoices", "billing_alerts",
  "chat_conversations", "chat_messages", "mission_acceptances",
  "mission_updates", "mission_positions", "audit_logs", "system_settings",
  "ponto_registros", "holerites", "telemetry_events", "client_forwards",
];

let pool: pg.Pool | null = null;
let supabaseHealthy = true;
let lastSyncTime = 0;
const SYNC_INTERVAL_MS = 60_000;
let syncInProgress = false;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on("error", (err) => {
      console.error("[pg-fallback] Pool error:", err.message);
    });
  }
  return pool;
}

export function isSupabaseHealthy(): boolean {
  return supabaseHealthy;
}

export function setSupabaseHealth(healthy: boolean): void {
  const now = Date.now();
  if (supabaseHealthy && !healthy) {
    console.warn("[pg-fallback] Supabase marked UNHEALTHY — fallback mode ON");
    downSince = new Date();
    if (now - lastDownAlertAt > COOLDOWN_MS) {
      lastDownAlertAt = now;
      sendHealthAlert(
        "⚠️ ALERTA: Sistema em modo FALLBACK — Supabase OFFLINE",
        `<div style="font-family:Arial,sans-serif;max-width:600px">
          <h2 style="color:#dc2626">⚠️ Supabase Fora do Ar</h2>
          <p>O banco de dados principal (Supabase) ficou <strong>inacessível</strong> às <strong>${formatBRT(downSince)}</strong>.</p>
          <p>O sistema ativou automaticamente o <strong>modo fallback</strong> usando o banco local PostgreSQL. Os usuários continuam com acesso de leitura, mas gravações podem falhar enquanto o Supabase estiver fora.</p>
          <table style="border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:4px 12px;border:1px solid #ddd;font-weight:bold">Status</td><td style="padding:4px 12px;border:1px solid #ddd;color:#dc2626">OFFLINE</td></tr>
            <tr><td style="padding:4px 12px;border:1px solid #ddd;font-weight:bold">Modo</td><td style="padding:4px 12px;border:1px solid #ddd">Fallback (PostgreSQL local)</td></tr>
            <tr><td style="padding:4px 12px;border:1px solid #ddd;font-weight:bold">Detectado em</td><td style="padding:4px 12px;border:1px solid #ddd">${formatBRT(downSince)}</td></tr>
          </table>
          <p style="color:#666;font-size:12px">Torres Vigilância Patrimonial — Monitoramento Automático</p>
        </div>`
      );
    }
  } else if (!supabaseHealthy && healthy) {
    console.log("[pg-fallback] Supabase recovered — primary mode ON");
    const downDuration = downSince ? Math.round((now - downSince.getTime()) / 1000) : 0;
    const mins = Math.floor(downDuration / 60);
    const secs = downDuration % 60;
    const durationText = mins > 0 ? `${mins}min ${secs}s` : `${secs}s`;
    if (now - lastUpAlertAt > COOLDOWN_MS) {
      lastUpAlertAt = now;
      sendHealthAlert(
        "✅ RECUPERADO: Supabase voltou ao ar",
        `<div style="font-family:Arial,sans-serif;max-width:600px">
          <h2 style="color:#16a34a">✅ Supabase Recuperado</h2>
          <p>O banco de dados principal voltou ao normal às <strong>${formatBRT(new Date())}</strong>.</p>
          <p>O sistema retornou ao <strong>modo primário</strong> (Supabase).</p>
          <table style="border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:4px 12px;border:1px solid #ddd;font-weight:bold">Status</td><td style="padding:4px 12px;border:1px solid #ddd;color:#16a34a">ONLINE</td></tr>
            <tr><td style="padding:4px 12px;border:1px solid #ddd;font-weight:bold">Modo</td><td style="padding:4px 12px;border:1px solid #ddd">Primário (Supabase)</td></tr>
            <tr><td style="padding:4px 12px;border:1px solid #ddd;font-weight:bold">Tempo fora</td><td style="padding:4px 12px;border:1px solid #ddd">${durationText}</td></tr>
            ${downSince ? `<tr><td style="padding:4px 12px;border:1px solid #ddd;font-weight:bold">Caiu em</td><td style="padding:4px 12px;border:1px solid #ddd">${formatBRT(downSince)}</td></tr>` : ""}
            <tr><td style="padding:4px 12px;border:1px solid #ddd;font-weight:bold">Voltou em</td><td style="padding:4px 12px;border:1px solid #ddd">${formatBRT(new Date())}</td></tr>
          </table>
          <p style="color:#666;font-size:12px">Torres Vigilância Patrimonial — Monitoramento Automático</p>
        </div>`
      );
    }
    downSince = null;
  }
  supabaseHealthy = healthy;
}

export async function localQuery(
  table: string,
  filters?: { column: string; op: string; value: any }[],
  orderBy?: { column: string; ascending?: boolean },
  limit?: number,
): Promise<any[]> {
  const p = getPool();
  let sql = `SELECT * FROM "${table}"`;
  const params: any[] = [];
  if (filters?.length) {
    const clauses = filters.map((f, i) => {
      params.push(f.value);
      const opMap: Record<string, string> = { eq: "=", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=", ilike: "ILIKE", in: "= ANY" };
      const op = opMap[f.op] || f.op;
      if (f.op === "in") {
        return `"${f.column}" = ANY($${i + 1})`;
      }
      return `"${f.column}" ${op} $${i + 1}`;
    });
    sql += " WHERE " + clauses.join(" AND ");
  }
  if (orderBy) {
    sql += ` ORDER BY "${orderBy.column}" ${orderBy.ascending === false ? "DESC" : "ASC"}`;
  }
  if (limit) {
    sql += ` LIMIT ${limit}`;
  }
  try {
    const result = await p.query(sql, params);
    return result.rows;
  } catch (err: any) {
    console.error(`[pg-fallback] localQuery(${table}) error:`, err.message);
    return [];
  }
}

export async function localQuerySingle(
  table: string,
  column: string,
  value: any,
): Promise<any | null> {
  const rows = await localQuery(table, [{ column, op: "eq", value }], undefined, 1);
  return rows.length > 0 ? rows[0] : null;
}

export async function cacheRows(table: string, rows: any[]): Promise<void> {
  if (!rows.length) return;
  const p = getPool();
  const client = await p.connect();
  try {
    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => `"${c}"`).join(", ");

    const { rows: existCheck } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [table]
    );
    if (existCheck.length === 0) {
      const colDefs = cols.map((c) => `"${c}" text`).join(", ");
      await client.query(`CREATE TABLE IF NOT EXISTS "${table}" (${colDefs})`);
    } else {
      const { rows: existCols } = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table]
      );
      const existingSet = new Set(existCols.map((r: any) => r.column_name));
      for (const c of cols) {
        if (!existingSet.has(c)) {
          await client.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${c}" text`).catch(() => {});
        }
      }
    }

    await client.query("BEGIN");
    try {
      await client.query(`ALTER TABLE "${table}" DISABLE TRIGGER ALL`);
    } catch {
      await client.query("ROLLBACK").catch(() => {});
      await client.query("BEGIN");
    }
    await client.query(`DELETE FROM "${table}"`);
    for (const row of rows) {
      const vals = cols.map((c) => row[c]);
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
      try {
        await client.query("SAVEPOINT sp");
        await client.query(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, vals);
        await client.query("RELEASE SAVEPOINT sp");
      } catch {
        await client.query("ROLLBACK TO SAVEPOINT sp").catch(() => {});
      }
    }
    await client.query(`ALTER TABLE "${table}" ENABLE TRIGGER ALL`).catch(() => {});
    await client.query("COMMIT");
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[pg-fallback] cacheRows(${table}) error:`, err.message);
  } finally {
    client.release();
  }
}

export async function syncAllTables(supabaseAdmin: any): Promise<void> {
  const now = Date.now();
  if (syncInProgress || now - lastSyncTime < SYNC_INTERVAL_MS) return;
  syncInProgress = true;
  let synced = 0;
  let failed = 0;
  try {
    for (const table of CORE_TABLES) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const { data, error } = await supabaseAdmin.from(table).select("*");
        clearTimeout(timeout);
        if (error || !data) {
          failed++;
          continue;
        }
        await cacheRows(table, data);
        synced++;
      } catch {
        failed++;
      }
    }
    lastSyncTime = Date.now();
    if (synced > 0) {
      console.log(`[pg-fallback] Sync complete: ${synced} tables cached, ${failed} failed`);
    }
  } finally {
    syncInProgress = false;
  }
}

export async function cacheTableIfOnline(_supabaseAdmin: any, _table: string, _data: any[]): Promise<void> {
}

export async function testLocalDb(): Promise<boolean> {
  try {
    const p = getPool();
    const r = await p.query("SELECT 1 as ok");
    return r.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}
