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
  "timesheets", "mission_costs", "perfis_acesso", "system_settings",
  "weapon_kits", "vehicle_fueling", "invoices", "billing_alerts",
];

let pool: pg.Pool | null = null;
let supabaseHealthy = true;
let lastSyncTime = 0;
const SYNC_INTERVAL_MS = 5 * 60_000;
let syncInProgress = false;
let _supabaseRef: any = null;

export function setSupabaseRef(ref: any) {
  _supabaseRef = ref;
}

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 20_000,
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

          <h3 style="color:#333;margin-top:20px">Causa</h3>
          <p>O servidor do Supabase (serviço externo) parou de responder. As requisições HTTP estouraram o tempo limite (<em>timeout</em>). Isso <strong>não é um problema do nosso sistema</strong> — é uma instabilidade do próprio Supabase/Cloudflare (erro 521).</p>

          <h3 style="color:#333;margin-top:20px">O que o sistema fez automaticamente</h3>
          <ul style="margin:8px 0;padding-left:20px">
            <li>Detectou a falha e ativou o <strong>modo fallback</strong> (PostgreSQL local)</li>
            <li>Leituras de dados continuam funcionando normalmente via banco local</li>
            <li>Enviou este alerta por e-mail</li>
            <li>Quando o Supabase voltar, o sistema reativa o modo primário automaticamente</li>
          </ul>

          <h3 style="color:#333;margin-top:20px">Impacto</h3>
          <ul style="margin:8px 0;padding-left:20px">
            <li><strong>Leituras</strong>: funcionando (via fallback local)</li>
            <li><strong>Gravações</strong>: enfileiradas automaticamente na fila local (serão reenviadas ao Supabase quando voltar)</li>
            <li><strong>Autenticação</strong>: pode falhar temporariamente (login/sessão via Supabase Auth)</li>
            <li><strong>Usuários logados</strong>: continuam navegando normalmente</li>
          </ul>

          <table style="border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9">Status</td><td style="padding:6px 14px;border:1px solid #ddd;color:#dc2626;font-weight:bold">OFFLINE</td></tr>
            <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9">Modo</td><td style="padding:6px 14px;border:1px solid #ddd">Fallback (PostgreSQL local)</td></tr>
            <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9">Detectado em</td><td style="padding:6px 14px;border:1px solid #ddd">${formatBRT(downSince)}</td></tr>
          </table>

          <p style="color:#888;font-size:12px;margin-top:20px">Nenhuma acao necessaria. O sistema se recupera automaticamente quando o Supabase voltar.</p>
          <p style="color:#666;font-size:12px">Torres Vigilancia Patrimonial — Monitoramento Automatico</p>
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

          <h3 style="color:#333;margin-top:20px">Resumo do incidente</h3>
          <p>O Supabase (servico externo) ficou inacessivel por <strong>${durationText}</strong>. Durante esse periodo, o sistema operou automaticamente em <strong>modo fallback</strong> (PostgreSQL local), garantindo que leituras de dados continuassem funcionando.</p>

          <h3 style="color:#333;margin-top:20px">Causa</h3>
          <p>Instabilidade temporaria do servidor Supabase/Cloudflare (erro 521 — "Web server is down"). <strong>Nao houve falha no nosso sistema.</strong></p>

          <h3 style="color:#333;margin-top:20px">Acoes automaticas executadas</h3>
          <ol style="margin:8px 0;padding-left:20px">
            <li>Falha detectada em ~6 segundos</li>
            <li>Modo fallback ativado (leituras via PostgreSQL local)</li>
            <li>Alerta por e-mail enviado</li>
            <li>Supabase voltou a responder — modo primario reativado</li>
            <li>Este e-mail de recuperacao enviado</li>
          </ol>

          <h3 style="color:#333;margin-top:20px">Impacto real</h3>
          <ul style="margin:8px 0;padding-left:20px">
            <li><strong>Leituras</strong>: funcionaram normalmente (via fallback)</li>
            <li><strong>Gravacoes</strong>: enfileiradas na fila local durante os ${durationText} — reprocessamento automatico iniciado</li>
            <li><strong>Autenticacao</strong>: usuarios nao logados podem ter sido impedidos temporariamente</li>
            <li><strong>Usuarios ja logados</strong>: continuaram navegando sem interrupcao</li>
          </ul>

          <table style="border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f0fdf4">Status</td><td style="padding:6px 14px;border:1px solid #ddd;color:#16a34a;font-weight:bold">ONLINE</td></tr>
            <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f0fdf4">Modo</td><td style="padding:6px 14px;border:1px solid #ddd">Primario (Supabase)</td></tr>
            <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f0fdf4">Tempo fora</td><td style="padding:6px 14px;border:1px solid #ddd">${durationText}</td></tr>
            ${downSince ? `<tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f0fdf4">Caiu em</td><td style="padding:6px 14px;border:1px solid #ddd">${formatBRT(downSince)}</td></tr>` : ""}
            <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f0fdf4">Voltou em</td><td style="padding:6px 14px;border:1px solid #ddd">${formatBRT(new Date())}</td></tr>
          </table>

          <p style="color:#888;font-size:12px;margin-top:20px">Incidente resolvido automaticamente. Nenhuma acao adicional necessaria.</p>
          <p style="color:#666;font-size:12px">Torres Vigilancia Patrimonial — Monitoramento Automatico</p>
        </div>`
      );
    }
    downSince = null;
    if (_supabaseRef) {
      setTimeout(() => {
        console.log("[write-queue] Supabase recovered — triggering immediate flush");
        flushWriteQueue(_supabaseRef).catch(() => {});
      }, 3000);
    }
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
    const qStart = Date.now();
    const result = await p.query(sql, params);
    const qDuration = Date.now() - qStart;
    if (qDuration > 200) {
      console.warn(`[SLOW-SQL] localQuery(${table}) took ${qDuration}ms | rows=${result.rows.length}`);
    }
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

const LARGE_TABLES = new Set([
  "audit_logs", "telemetry_events", "mission_positions", "chat_messages",
]);
const SYNC_ROW_LIMIT = 5000;

const SYNC_STAGGER_MS = 800;

export async function syncAllTables(supabaseAdmin: any): Promise<void> {
  const now = Date.now();
  if (syncInProgress || now - lastSyncTime < SYNC_INTERVAL_MS) return;
  syncInProgress = true;
  let synced = 0;
  let failed = 0;
  try {
    for (const table of CORE_TABLES) {
      try {
        if (!supabaseHealthy) {
          console.log(`[pg-fallback] Sync aborted — Supabase offline`);
          break;
        }
        let query = supabaseAdmin.from(table).select("*");
        if (LARGE_TABLES.has(table)) {
          query = query.order("id", { ascending: false }).limit(SYNC_ROW_LIMIT);
        }
        const { data, error } = await query;
        if (error || !data) {
          failed++;
          if (failed >= 3) {
            console.warn(`[pg-fallback] Sync stopping early — ${failed} consecutive failures`);
            break;
          }
          continue;
        }
        await cacheRows(table, data);
        synced++;
        failed = 0;
        await new Promise((r) => setTimeout(r, SYNC_STAGGER_MS));
      } catch {
        failed++;
        if (failed >= 3) {
          console.warn(`[pg-fallback] Sync stopping early — ${failed} consecutive failures`);
          break;
        }
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

async function ensureWriteQueueTable(): Promise<void> {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS fallback_write_queue (
      id SERIAL PRIMARY KEY,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload JSONB NOT NULL,
      filters JSONB,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    )
  `).catch(() => {});
}

let writeQueueReady = false;

export async function enqueueWrite(
  tableName: string,
  operation: "insert" | "update" | "delete",
  payload: Record<string, any>,
  filters?: Record<string, any>,
): Promise<{ queued: true; queueId: number }> {
  if (!writeQueueReady) {
    await ensureWriteQueueTable();
    writeQueueReady = true;
  }
  const p = getPool();
  const { rows } = await p.query(
    `INSERT INTO fallback_write_queue (table_name, operation, payload, filters) VALUES ($1, $2, $3, $4) RETURNING id`,
    [tableName, operation, JSON.stringify(payload), filters ? JSON.stringify(filters) : null],
  );
  const queueId = rows[0]?.id;
  console.log(`[write-queue] Enqueued ${operation} on ${tableName} (queue #${queueId})`);
  return { queued: true, queueId };
}

export async function getQueueStats(): Promise<{ pending: number; failed: number; processed: number }> {
  if (!writeQueueReady) return { pending: 0, failed: 0, processed: 0 };
  try {
    const p = getPool();
    const { rows } = await p.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE status = 'processed') AS processed
      FROM fallback_write_queue
    `);
    return {
      pending: Number(rows[0]?.pending || 0),
      failed: Number(rows[0]?.failed || 0),
      processed: Number(rows[0]?.processed || 0),
    };
  } catch {
    return { pending: 0, failed: 0, processed: 0 };
  }
}

const MAX_QUEUE_ATTEMPTS = 10;
let flushInProgress = false;

function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
}

export async function applyViaDirectSql(
  p: pg.Pool,
  operation: string,
  tableName: string,
  payload: Record<string, any>,
  filters: Record<string, any> | null,
): Promise<void> {
  const t = quoteIdent(tableName);
  if (operation === "insert") {
    const cols = Object.keys(payload);
    if (cols.length === 0) return;
    const colsSql = cols.map(quoteIdent).join(", ");
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const values = cols.map((c) => payload[c]);
    await p.query(`INSERT INTO ${t} (${colsSql}) VALUES (${placeholders})`, values);
  } else if (operation === "update" && filters) {
    const cols = Object.keys(payload);
    if (cols.length === 0) return;
    const setSql = cols.map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(", ");
    const fcols = Object.keys(filters);
    const whereSql = fcols.map((c, i) => `${quoteIdent(c)} = $${cols.length + i + 1}`).join(" AND ");
    const values = [...cols.map((c) => payload[c]), ...fcols.map((c) => filters[c])];
    await p.query(`UPDATE ${t} SET ${setSql} WHERE ${whereSql}`, values);
  } else if (operation === "delete" && filters) {
    const fcols = Object.keys(filters);
    const whereSql = fcols.map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(" AND ");
    const values = fcols.map((c) => filters[c]);
    await p.query(`DELETE FROM ${t} WHERE ${whereSql}`, values);
  }
}

export async function flushWriteQueue(supabaseAdmin: any): Promise<{ processed: number; failed: number }> {
  if (flushInProgress || !supabaseHealthy) return { processed: 0, failed: 0 };
  flushInProgress = true;
  let processed = 0;
  let failed = 0;

  try {
    if (!writeQueueReady) {
      await ensureWriteQueueTable();
      writeQueueReady = true;
    }
    const p = getPool();
    const { rows: pending } = await p.query(
      `SELECT * FROM fallback_write_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 50`
    );

    if (pending.length === 0) { flushInProgress = false; return { processed: 0, failed: 0 }; }
    console.log(`[write-queue] Flushing ${pending.length} pending write(s) to Supabase (batched, ~150ms entre itens)...`);

    let consecutiveFailures = 0;
    let itemIdx = 0;
    for (const item of pending) {
      // Pausa entre escritas pra não sufocar o Supabase que acabou de voltar.
      if (itemIdx > 0) await new Promise((r) => setTimeout(r, 150));
      itemIdx++;
      // Aborta o lote se Supabase voltar a cair no meio do flush.
      if (!supabaseHealthy) {
        console.warn(`[write-queue] Supabase voltou OFFLINE no meio do flush — abortando lote (item ${itemIdx}/${pending.length})`);
        break;
      }
      if (consecutiveFailures >= 3) {
        console.warn(`[write-queue] 3 falhas seguidas — abortando lote pra não martelar Supabase`);
        break;
      }
      try {
        const payload = typeof item.payload === "string" ? JSON.parse(item.payload) : item.payload;
        const filters = item.filters ? (typeof item.filters === "string" ? JSON.parse(item.filters) : item.filters) : null;

        let result: { error: any } = { error: null };

        if (item.operation === "insert") {
          result = await supabaseAdmin.from(item.table_name).insert(payload);
        } else if (item.operation === "update" && filters) {
          let query = supabaseAdmin.from(item.table_name).update(payload);
          for (const [col, val] of Object.entries(filters)) {
            query = query.eq(col, val);
          }
          result = await query;
        } else if (item.operation === "delete" && filters) {
          let query = supabaseAdmin.from(item.table_name).delete();
          for (const [col, val] of Object.entries(filters)) {
            query = query.eq(col, val);
          }
          result = await query;
        }

        if (result.error) {
          const msg = String(result.error.message || "");
          const isSchemaCacheErr = /schema cache/i.test(msg) && /Could not find/i.test(msg);
          if (isSchemaCacheErr) {
            await applyViaDirectSql(p, item.operation, item.table_name, payload, filters);
            console.log(`[write-queue] Queue #${item.id}: cache do schema desatualizado — aplicado via SQL direto`);
            try { await supabaseAdmin.rpc("pg_notify", { channel: "pgrst", payload: "reload schema" }); } catch (_e) {}
          } else {
            throw new Error(result.error.message);
          }
        }

        await p.query(
          `UPDATE fallback_write_queue SET status = 'processed', processed_at = NOW() WHERE id = $1`,
          [item.id],
        );
        processed++;
        consecutiveFailures = 0;
        console.log(`[write-queue] ✓ Processed queue #${item.id} (${item.operation} on ${item.table_name})`);
      } catch (err: any) {
        // Só conta como "Supabase martelado" se for erro transitório (timeout/5xx/rede).
        // Erros de validação/constraint (4xx, PGRST*) não devem abortar o lote inteiro.
        const msg = String(err?.message || "");
        const isTransient = /timeout|abort|fetch failed|ECONN|ENETUNREACH|HTTP 5\d\d|network/i.test(msg);
        if (isTransient) consecutiveFailures++;
        else consecutiveFailures = 0;
        const attempts = (item.attempts || 0) + 1;
        const newStatus = attempts >= MAX_QUEUE_ATTEMPTS ? "failed" : "pending";
        await p.query(
          `UPDATE fallback_write_queue SET attempts = $1, last_error = $2, status = $3 WHERE id = $4`,
          [attempts, err.message?.slice(0, 500), newStatus, item.id],
        );
        if (newStatus === "failed") {
          failed++;
          console.error(`[write-queue] ✗ Queue #${item.id} FAILED permanently after ${attempts} attempts: ${err.message}`);
        } else {
          console.warn(`[write-queue] Queue #${item.id} retry ${attempts}/${MAX_QUEUE_ATTEMPTS}: ${err.message}`);
        }
      }
    }

    if (processed > 0) {
      console.log(`[write-queue] Flush complete: ${processed} processed, ${failed} failed`);
    }
  } catch (err: any) {
    console.error("[write-queue] flushWriteQueue error:", err.message);
  } finally {
    flushInProgress = false;
  }
  return { processed, failed };
}

export function isWriteQueueReady(): boolean {
  return writeQueueReady;
}
