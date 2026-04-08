import pg from "pg";

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
  if (supabaseHealthy && !healthy) {
    console.warn("[pg-fallback] Supabase marked UNHEALTHY — fallback mode ON");
  } else if (!supabaseHealthy && healthy) {
    console.log("[pg-fallback] Supabase recovered — primary mode ON");
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
    await client.query("BEGIN");
    await client.query(`DELETE FROM "${table}"`);
    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => `"${c}"`).join(", ");
    for (const row of rows) {
      const vals = cols.map((c) => row[c]);
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
      try {
        await client.query(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, vals);
      } catch {}
    }
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
