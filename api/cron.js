var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/lib/logger.ts
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
var init_logger = __esm({
  "server/lib/logger.ts"() {
    "use strict";
  }
});

// server/pg-fallback.ts
import pg from "pg";
import nodemailer from "nodemailer";
function getMailTransporter() {
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false }
  });
}
function sendHealthAlert(subject, html) {
  const transporter = getMailTransporter();
  if (!transporter) {
    console.warn("[pg-fallback] SMTP n\xE3o configurado \u2014 alerta de sa\xFAde n\xE3o enviado");
    return;
  }
  const from = `"Torres Vigil\xE2ncia - Sistema" <${process.env.SMTP_FROM || process.env.SMTP_USER || "escolta@torresseguranca.com.br"}>`;
  transporter.sendMail({ from, to: ALERT_EMAIL, subject, html }).then(() => {
    console.log(`[pg-fallback] Alerta enviado para ${ALERT_EMAIL}: ${subject}`);
  }).catch((err) => {
    console.error(`[pg-fallback] Falha ao enviar alerta: ${err.message}`);
  });
}
function formatBRT(d) {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 2e4,
      connectionTimeoutMillis: 5e3
    });
    pool.on("error", (err) => {
      console.error("[pg-fallback] Pool error:", err.message);
    });
  }
  return pool;
}
function isSupabaseHealthy() {
  return supabaseHealthy;
}
function setSupabaseHealth(healthy) {
  const now = Date.now();
  if (supabaseHealthy && !healthy) {
    console.warn("[pg-fallback] Supabase marked UNHEALTHY \u2014 fallback mode ON");
    downSince = /* @__PURE__ */ new Date();
    prolongedAlertSent = false;
    if (now - lastDownAlertAt > COOLDOWN_MS) {
      lastDownAlertAt = now;
      sendHealthAlert(
        "\u26A0\uFE0F ALERTA: Sistema em modo FALLBACK \u2014 Supabase OFFLINE",
        `<div style="font-family:Arial,sans-serif;max-width:600px">
          <h2 style="color:#dc2626">\u26A0\uFE0F Supabase Fora do Ar</h2>
          <p>O banco de dados principal (Supabase) ficou <strong>inacess\xEDvel</strong> \xE0s <strong>${formatBRT(downSince)}</strong>.</p>

          <h3 style="color:#333;margin-top:20px">Causa</h3>
          <p>O Supabase (nosso banco de dados, hospedado por um servi\xE7o externo) ficou <strong>lento ou parou de responder</strong>: v\xE1rias chamadas seguidas estouraram o tempo limite (<em>timeout</em>). O sistema acompanha as <strong>\xFAltimas 40 chamadas ao banco</strong> e, quando <strong>75% ou mais falham</strong>, entra automaticamente em modo de conting\xEAncia. Pode ser lentid\xE3o/timeout das requisi\xE7\xF5es ou indisponibilidade do Supabase/Cloudflare (erro 521). <strong>N\xE3o \xE9 uma falha do nosso c\xF3digo.</strong></p>

          <h3 style="color:#333;margin-top:20px">O que o sistema fez automaticamente</h3>
          <ul style="margin:8px 0;padding-left:20px">
            <li>Detectou a falha pela taxa de erro nas \xFAltimas 40 chamadas e entrou em <strong>modo de conting\xEAncia</strong></li>
            <li>Parou de depender do Supabase para gravar: novos lan\xE7amentos v\xE3o para uma <strong>fila local segura</strong> e s\xE3o reenviados quando o banco voltar (nada se perde)</li>
            <li>Enviou este alerta por e-mail</li>
            <li>Continua testando o Supabase e reativa o modo normal sozinho assim que ele responder</li>
          </ul>

          <h3 style="color:#333;margin-top:20px">Impacto</h3>
          <ul style="margin:8px 0;padding-left:20px">
            <li><strong>Leituras</strong>: podem ficar lentas ou falhar enquanto o Supabase n\xE3o responde</li>
            <li><strong>Grava\xE7\xF5es</strong>: enfileiradas automaticamente na fila local e reenviadas ao Supabase quando voltar (nada se perde)</li>
            <li><strong>Autentica\xE7\xE3o</strong>: pode falhar temporariamente (login/sess\xE3o via Supabase Auth)</li>
            <li><strong>Usu\xE1rios j\xE1 logados</strong>: continuam navegando normalmente</li>
          </ul>

          <table style="border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9">Status</td><td style="padding:6px 14px;border:1px solid #ddd;color:#dc2626;font-weight:bold">OFFLINE</td></tr>
            <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9">Modo</td><td style="padding:6px 14px;border:1px solid #ddd">Conting\xEAncia (fila de grava\xE7\xE3o)</td></tr>
            <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9">Detectado em</td><td style="padding:6px 14px;border:1px solid #ddd">${formatBRT(downSince)}</td></tr>
          </table>

          <p style="color:#888;font-size:12px;margin-top:20px">Nenhuma acao necessaria. O sistema se recupera automaticamente quando o Supabase voltar.</p>
          <p style="color:#666;font-size:12px">Torres Vigilancia Patrimonial \u2014 Monitoramento Automatico</p>
        </div>`
      );
    }
  } else if (!supabaseHealthy && healthy) {
    console.log("[pg-fallback] Supabase recovered \u2014 primary mode ON");
    prolongedAlertSent = false;
    const downDuration = downSince ? Math.round((now - downSince.getTime()) / 1e3) : 0;
    const mins = Math.floor(downDuration / 60);
    const secs = downDuration % 60;
    const durationText = mins > 0 ? `${mins}min ${secs}s` : `${secs}s`;
    if (now - lastUpAlertAt > COOLDOWN_MS) {
      lastUpAlertAt = now;
      sendHealthAlert(
        "\u2705 RECUPERADO: Supabase voltou ao ar",
        `<div style="font-family:Arial,sans-serif;max-width:600px">
          <h2 style="color:#16a34a">\u2705 Supabase Recuperado</h2>
          <p>O banco de dados principal voltou ao normal \xE0s <strong>${formatBRT(/* @__PURE__ */ new Date())}</strong>.</p>

          <h3 style="color:#333;margin-top:20px">Resumo do incidente</h3>
          <p>O Supabase (servico externo) ficou lento/inacessivel por <strong>${durationText}</strong>. Durante esse periodo, o sistema operou em <strong>modo de contingencia</strong>: as gravacoes ficaram numa fila local segura e foram reenviadas ao banco assim que ele voltou.</p>

          <h3 style="color:#333;margin-top:20px">Causa</h3>
          <p>Lentidao/indisponibilidade temporaria do Supabase: varias chamadas seguidas estouraram o tempo limite (timeout) \u2014 as vezes acompanhado de erro 521 do Cloudflare ("Web server is down"). A contingencia dispara quando 75% das ultimas 40 chamadas ao banco falham. <strong>Nao houve falha no nosso sistema.</strong></p>

          <h3 style="color:#333;margin-top:20px">Acoes automaticas executadas</h3>
          <ol style="margin:8px 0;padding-left:20px">
            <li>Falha detectada pela taxa de erro nas ultimas 40 chamadas ao banco</li>
            <li>Modo de contingencia ativado (gravacoes enfileiradas em fila local)</li>
            <li>Alerta por e-mail enviado</li>
            <li>Supabase voltou a responder \u2014 modo normal reativado e fila reprocessada</li>
            <li>Este e-mail de recuperacao enviado</li>
          </ol>

          <h3 style="color:#333;margin-top:20px">Impacto real</h3>
          <ul style="margin:8px 0;padding-left:20px">
            <li><strong>Leituras</strong>: podem ter ficado lentas ou falhado durante os ${durationText}</li>
            <li><strong>Gravacoes</strong>: enfileiradas na fila local durante os ${durationText} \u2014 reprocessamento automatico concluido</li>
            <li><strong>Autenticacao</strong>: usuarios nao logados podem ter sido impedidos temporariamente</li>
            <li><strong>Usuarios ja logados</strong>: continuaram navegando sem interrupcao</li>
          </ul>

          <table style="border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f0fdf4">Status</td><td style="padding:6px 14px;border:1px solid #ddd;color:#16a34a;font-weight:bold">ONLINE</td></tr>
            <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f0fdf4">Modo</td><td style="padding:6px 14px;border:1px solid #ddd">Primario (Supabase)</td></tr>
            <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f0fdf4">Tempo fora</td><td style="padding:6px 14px;border:1px solid #ddd">${durationText}</td></tr>
            ${downSince ? `<tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f0fdf4">Caiu em</td><td style="padding:6px 14px;border:1px solid #ddd">${formatBRT(downSince)}</td></tr>` : ""}
            <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f0fdf4">Voltou em</td><td style="padding:6px 14px;border:1px solid #ddd">${formatBRT(/* @__PURE__ */ new Date())}</td></tr>
          </table>

          <p style="color:#888;font-size:12px;margin-top:20px">Incidente resolvido automaticamente. Nenhuma acao adicional necessaria.</p>
          <p style="color:#666;font-size:12px">Torres Vigilancia Patrimonial \u2014 Monitoramento Automatico</p>
        </div>`
      );
    }
    downSince = null;
    if (_supabaseRef) {
      setTimeout(() => {
        console.log("[write-queue] Supabase recovered \u2014 triggering immediate flush");
        flushWriteQueue(_supabaseRef).catch(() => {
        });
      }, 3e3);
    }
  }
  supabaseHealthy = healthy;
}
async function localQuery(table, filters, orderBy, limit) {
  const p = getPool();
  let sql = `SELECT * FROM "${table}"`;
  const params = [];
  if (filters?.length) {
    const clauses = filters.map((f, i) => {
      params.push(f.value);
      const opMap = { eq: "=", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=", ilike: "ILIKE", in: "= ANY" };
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
  } catch (err) {
    console.error(`[pg-fallback] localQuery(${table}) error:`, err.message);
    return [];
  }
}
async function localQuerySingle(table, column, value) {
  const rows = await localQuery(table, [{ column, op: "eq", value }], void 0, 1);
  return rows.length > 0 ? rows[0] : null;
}
async function ensureWriteQueueTable() {
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
  `).catch(() => {
  });
}
async function enqueueWrite(tableName, operation, payload, filters) {
  if (!writeQueueReady) {
    await ensureWriteQueueTable();
    writeQueueReady = true;
  }
  const p = getPool();
  const { rows } = await p.query(
    `INSERT INTO fallback_write_queue (table_name, operation, payload, filters) VALUES ($1, $2, $3, $4) RETURNING id`,
    [tableName, operation, JSON.stringify(payload), filters ? JSON.stringify(filters) : null]
  );
  const queueId = rows[0]?.id;
  console.log(`[write-queue] Enqueued ${operation} on ${tableName} (queue #${queueId})`);
  return { queued: true, queueId };
}
function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
}
async function applyViaDirectSql(p, operation, tableName, payload, filters) {
  const t = quoteIdent(tableName);
  if (operation === "insert") {
    const cols = Object.keys(payload);
    if (cols.length === 0) return;
    const colsSql = cols.map(quoteIdent).join(", ");
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const values = cols.map((c) => payload[c]);
    await p.query(`INSERT INTO ${t} (${colsSql}) VALUES (${placeholders})`, values);
  } else if (operation === "upsert") {
    const conflictCol = filters?.onConflict;
    const cols = Object.keys(payload);
    if (cols.length === 0) return;
    const colsSql = cols.map(quoteIdent).join(", ");
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const values = cols.map((c) => payload[c]);
    if (conflictCol) {
      const updateSql = cols.filter((c) => c !== conflictCol).map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(", ");
      const onConflictClause = updateSql ? `ON CONFLICT (${quoteIdent(conflictCol)}) DO UPDATE SET ${updateSql}` : `ON CONFLICT (${quoteIdent(conflictCol)}) DO NOTHING`;
      await p.query(
        `INSERT INTO ${t} (${colsSql}) VALUES (${placeholders}) ${onConflictClause}`,
        values
      );
    } else {
      await p.query(`INSERT INTO ${t} (${colsSql}) VALUES (${placeholders})`, values);
    }
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
async function flushWriteQueue(supabaseAdmin2) {
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
    if (pending.length === 0) {
      flushInProgress = false;
      return { processed: 0, failed: 0 };
    }
    console.log(`[write-queue] Flushing ${pending.length} pending write(s) to Supabase (batched, ~150ms entre itens)...`);
    let consecutiveFailures = 0;
    let itemIdx = 0;
    for (const item of pending) {
      if (itemIdx > 0) await new Promise((r) => setTimeout(r, 150));
      itemIdx++;
      if (!supabaseHealthy) {
        console.warn(`[write-queue] Supabase voltou OFFLINE no meio do flush \u2014 abortando lote (item ${itemIdx}/${pending.length})`);
        break;
      }
      if (consecutiveFailures >= 3) {
        console.warn(`[write-queue] 3 falhas seguidas \u2014 abortando lote pra n\xE3o martelar Supabase`);
        break;
      }
      try {
        const payload = typeof item.payload === "string" ? JSON.parse(item.payload) : item.payload;
        const filters = item.filters ? typeof item.filters === "string" ? JSON.parse(item.filters) : item.filters : null;
        let result = { error: null };
        if (item.operation === "insert") {
          result = await supabaseAdmin2.from(item.table_name).insert(payload);
        } else if (item.operation === "upsert") {
          const onConflict = filters?.onConflict;
          result = await supabaseAdmin2.from(item.table_name).upsert(payload, onConflict ? { onConflict } : void 0);
        } else if (item.operation === "update" && filters) {
          let query = supabaseAdmin2.from(item.table_name).update(payload);
          for (const [col, val] of Object.entries(filters)) {
            query = query.eq(col, val);
          }
          result = await query;
        } else if (item.operation === "delete" && filters) {
          let query = supabaseAdmin2.from(item.table_name).delete();
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
            console.log(`[write-queue] Queue #${item.id}: cache do schema desatualizado \u2014 aplicado via SQL direto`);
            try {
              await supabaseAdmin2.rpc("pg_notify", { channel: "pgrst", payload: "reload schema" });
            } catch (_e) {
            }
          } else {
            throw new Error(result.error.message);
          }
        }
        await p.query(
          `UPDATE fallback_write_queue SET status = 'processed', processed_at = NOW() WHERE id = $1`,
          [item.id]
        );
        processed++;
        consecutiveFailures = 0;
        console.log(`[write-queue] \u2713 Processed queue #${item.id} (${item.operation} on ${item.table_name})`);
      } catch (err) {
        const msg = String(err?.message || "");
        const isTransient = /timeout|abort|fetch failed|ECONN|ENETUNREACH|HTTP 5\d\d|network/i.test(msg);
        if (isTransient) consecutiveFailures++;
        else consecutiveFailures = 0;
        const attempts = (item.attempts || 0) + 1;
        const newStatus = attempts >= MAX_QUEUE_ATTEMPTS ? "failed" : "pending";
        await p.query(
          `UPDATE fallback_write_queue SET attempts = $1, last_error = $2, status = $3 WHERE id = $4`,
          [attempts, err.message?.slice(0, 500), newStatus, item.id]
        );
        if (newStatus === "failed") {
          failed++;
          console.error(`[write-queue] \u2717 Queue #${item.id} FAILED permanently after ${attempts} attempts: ${err.message}`);
        } else {
          console.warn(`[write-queue] Queue #${item.id} retry ${attempts}/${MAX_QUEUE_ATTEMPTS}: ${err.message}`);
        }
      }
    }
    if (processed > 0) {
      console.log(`[write-queue] Flush complete: ${processed} processed, ${failed} failed`);
    }
  } catch (err) {
    console.error("[write-queue] flushWriteQueue error:", err.message);
  } finally {
    flushInProgress = false;
  }
  return { processed, failed };
}
function checkProlongedFallback() {
  if (supabaseHealthy || !downSince || prolongedAlertSent) return;
  const elapsedMs = Date.now() - downSince.getTime();
  if (elapsedMs < PROLONGED_FALLBACK_MS) return;
  prolongedAlertSent = true;
  const mins = Math.floor(elapsedMs / 6e4);
  console.warn(`[pg-fallback] PROLONGED fallback alert \u2014 ${mins}min em modo offline`);
  console.log(JSON.stringify({
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    event: "supabase.fallback.prolonged",
    downSince: downSince.toISOString(),
    elapsedMs,
    thresholdMs: PROLONGED_FALLBACK_MS
  }));
  sendHealthAlert(
    `\u{1F6A8} FALLBACK PROLONGADO: Supabase OFFLINE h\xE1 ${mins}min`,
    `<div style="font-family:Arial,sans-serif;max-width:600px">
      <h2 style="color:#dc2626">\u{1F6A8} Fallback Prolongado</h2>
      <p>O Supabase est\xE1 inacess\xEDvel h\xE1 mais de <strong>${mins} minutos</strong> (desde <strong>${formatBRT(downSince)}</strong>).</p>
      <p>O sistema continua operando em modo fallback (PostgreSQL local). Grava\xE7\xF5es est\xE3o sendo enfileiradas e ser\xE3o reprocessadas quando o Supabase voltar.</p>
      <p style="color:#888;font-size:12px;margin-top:20px">Este alerta \xE9 enviado apenas uma vez por incidente. Pr\xF3ximo alerta apenas na recupera\xE7\xE3o.</p>
    </div>`
  );
}
var ALERT_EMAIL, COOLDOWN_MS, PROLONGED_FALLBACK_MS, lastDownAlertAt, lastUpAlertAt, downSince, prolongedAlertSent, pool, supabaseHealthy, SYNC_INTERVAL_MS, _supabaseRef, writeQueueReady, MAX_QUEUE_ATTEMPTS, flushInProgress, prolongedFallbackInterval;
var init_pg_fallback = __esm({
  "server/pg-fallback.ts"() {
    "use strict";
    ALERT_EMAIL = "thiago@grupotmseg.com.br";
    COOLDOWN_MS = 10 * 60 * 1e3;
    PROLONGED_FALLBACK_MS = 5 * 60 * 1e3;
    lastDownAlertAt = 0;
    lastUpAlertAt = 0;
    downSince = null;
    prolongedAlertSent = false;
    pool = null;
    supabaseHealthy = true;
    SYNC_INTERVAL_MS = 5 * 6e4;
    _supabaseRef = null;
    writeQueueReady = false;
    MAX_QUEUE_ATTEMPTS = 10;
    flushInProgress = false;
    prolongedFallbackInterval = setInterval(checkProlongedFallback, 6e4);
    prolongedFallbackInterval.unref?.();
  }
});

// server/supabase.ts
import { createClient } from "@supabase/supabase-js";
function requireServerEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return { supabaseUrl, supabaseServiceKey, supabaseAnonKey: supabaseAnonKey || "" };
}
function acquireSlot() {
  if (activeFetches < MAX_CONCURRENT) {
    activeFetches++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      activeFetches++;
      resolve();
    });
  });
}
function releaseSlot() {
  activeFetches--;
  if (waitQueue.length > 0) {
    const next = waitQueue.shift();
    next();
  }
}
function logHealthTransition(from, to, reason, extra = {}) {
  const fallbackDurationMs = from === "UNHEALTHY" && to === "HEALTHY" && lastHealthChange ? Date.now() - lastHealthChange : void 0;
  console.log(JSON.stringify({
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    event: "supabase.health.transition",
    from,
    to,
    reason,
    fallbackDurationMs,
    windowSize: healthWindow.length,
    windowFailures: healthWindow.filter((r) => !r).length,
    consecutiveSuccesses,
    ...extra
  }));
}
function recordResult(success) {
  healthWindow.push(success);
  if (healthWindow.length > HEALTH_WINDOW_SIZE) {
    healthWindow.shift();
  }
  if (success) consecutiveSuccesses++;
  else consecutiveSuccesses = 0;
  const now = Date.now();
  if (!currentHealthState && consecutiveSuccesses >= CONSECUTIVE_SUCCESS_FOR_RECOVERY && now - lastHealthChange > HEALTH_COOLDOWN_UP_MS) {
    logHealthTransition("UNHEALTHY", "HEALTHY", "consecutive_successes", {
      consecutiveSuccessesRequired: CONSECUTIVE_SUCCESS_FOR_RECOVERY,
      cooldownMs: HEALTH_COOLDOWN_UP_MS
    });
    currentHealthState = true;
    lastHealthChange = now;
    lastTransitionReason = "consecutive_successes";
    healthWindow.length = 0;
    setSupabaseHealth(true);
    console.log(`[supabase] Health: ONLINE (recovered fast \u2014 ${consecutiveSuccesses} sucessos consecutivos)`);
    return;
  }
  if (healthWindow.length < MIN_RESULTS_FOR_DECISION) return;
  const failures = healthWindow.filter((r) => !r).length;
  const failRatio = failures / healthWindow.length;
  if (currentHealthState && failRatio >= HEALTH_FAIL_RATIO) {
    if (now - lastHealthChange > HEALTH_COOLDOWN_DOWN_MS) {
      logHealthTransition("HEALTHY", "UNHEALTHY", "fail_ratio", {
        failRatio: Number(failRatio.toFixed(2)),
        threshold: HEALTH_FAIL_RATIO,
        cooldownMs: HEALTH_COOLDOWN_DOWN_MS
      });
      currentHealthState = false;
      lastHealthChange = now;
      lastTransitionReason = "fail_ratio";
      setSupabaseHealth(false);
      console.warn(`[supabase] Health: OFFLINE (${failures}/${healthWindow.length} failures, ratio ${(failRatio * 100).toFixed(0)}%)`);
    }
  } else if (!currentHealthState && failRatio <= HEALTH_RECOVER_RATIO) {
    if (now - lastHealthChange > HEALTH_COOLDOWN_UP_MS) {
      logHealthTransition("UNHEALTHY", "HEALTHY", "fail_ratio", {
        failRatio: Number(failRatio.toFixed(2)),
        threshold: HEALTH_RECOVER_RATIO,
        cooldownMs: HEALTH_COOLDOWN_UP_MS
      });
      currentHealthState = true;
      lastHealthChange = now;
      lastTransitionReason = "fail_ratio";
      healthWindow.length = 0;
      setSupabaseHealth(true);
      console.log(`[supabase] Health: ONLINE (recovered, ratio ${(failRatio * 100).toFixed(0)}%)`);
    }
  }
}
async function resilientFetch(url, init) {
  await acquireSlot();
  const fetchStart = Date.now();
  try {
    const response = await attemptFetch(url, init, 0);
    const fetchDuration = Date.now() - fetchStart;
    if (fetchDuration > 500) {
      const method = init?.method || "GET";
      const urlStr = typeof url === "string" ? url : url.toString();
      const path3 = urlStr.replace(/https?:\/\/[^/]+/, "").split("?")[0];
      console.warn(`[SLOW-SUPA] ${method} ${path3} took ${fetchDuration}ms`);
    }
    return response;
  } finally {
    releaseSlot();
  }
}
function flattenHeaders(h) {
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  if (Array.isArray(h)) return Object.fromEntries(h);
  return h;
}
async function attemptFetch(url, init, attempt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const mergedHeaders = {
      ...flattenHeaders(init?.headers),
      "Connection": "keep-alive"
    };
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      keepalive: true,
      headers: mergedHeaders
    });
    clearTimeout(timeout);
    if (response.status === 521 || response.status === 502 || response.status === 503) {
      recordResult(false);
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 300;
        await new Promise((r) => setTimeout(r, delay));
        return attemptFetch(url, init, attempt + 1);
      }
      throw new Error(`Supabase HTTP ${response.status}`);
    }
    recordResult(true);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    recordResult(false);
    if (attempt < MAX_RETRIES - 1) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 300;
      await new Promise((r) => setTimeout(r, delay));
      return attemptFetch(url, init, attempt + 1);
    }
    throw err;
  }
}
function getSupabaseAdminClient() {
  if (!_supabaseAdmin) {
    const { supabaseUrl, supabaseServiceKey } = requireServerEnv();
    _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, sharedOpts);
  }
  return _supabaseAdmin;
}
function getSupabaseAnonClient() {
  if (!_supabaseAnon) {
    const { supabaseUrl, supabaseAnonKey } = requireServerEnv();
    _supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, sharedOpts);
  }
  return _supabaseAnon;
}
function createSupabaseProxy(getClient) {
  return new Proxy({}, {
    get(_target, prop) {
      const client = getClient();
      const value = Reflect.get(client, prop, client);
      return typeof value === "function" ? value.bind(client) : value;
    }
  });
}
var MAX_RETRIES, BASE_DELAY_MS, FETCH_TIMEOUT_MS, MAX_CONCURRENT, HEALTH_WINDOW_SIZE, HEALTH_FAIL_RATIO, HEALTH_RECOVER_RATIO, HEALTH_COOLDOWN_DOWN_MS, HEALTH_COOLDOWN_UP_MS, MIN_RESULTS_FOR_DECISION, CONSECUTIVE_SUCCESS_FOR_RECOVERY, activeFetches, waitQueue, healthWindow, lastHealthChange, currentHealthState, consecutiveSuccesses, lastTransitionReason, sharedOpts, _supabaseAdmin, _supabaseAnon, supabaseAdmin, supabaseAnon;
var init_supabase = __esm({
  "server/supabase.ts"() {
    "use strict";
    init_pg_fallback();
    MAX_RETRIES = 2;
    BASE_DELAY_MS = 400;
    FETCH_TIMEOUT_MS = 12e3;
    MAX_CONCURRENT = 16;
    HEALTH_WINDOW_SIZE = 40;
    HEALTH_FAIL_RATIO = 0.75;
    HEALTH_RECOVER_RATIO = 0.3;
    HEALTH_COOLDOWN_DOWN_MS = 9e4;
    HEALTH_COOLDOWN_UP_MS = 3e4;
    MIN_RESULTS_FOR_DECISION = 15;
    CONSECUTIVE_SUCCESS_FOR_RECOVERY = 10;
    activeFetches = 0;
    waitQueue = [];
    healthWindow = [];
    lastHealthChange = 0;
    currentHealthState = true;
    consecutiveSuccesses = 0;
    lastTransitionReason = "startup";
    sharedOpts = {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: resilientFetch
      },
      db: { schema: "public" }
    };
    _supabaseAdmin = null;
    _supabaseAnon = null;
    supabaseAdmin = createSupabaseProxy(getSupabaseAdminClient);
    supabaseAnon = createSupabaseProxy(getSupabaseAnonClient);
  }
});

// shared/contact-validation.ts
var init_contact_validation = __esm({
  "shared/contact-validation.ts"() {
    "use strict";
  }
});

// server/lib/normalize-contact.ts
function normalizePhone(value) {
  if (value === null || value === void 0) return null;
  const str = String(value).trim();
  if (!str) return null;
  const digits = str.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length > 11) return digits.slice(-11);
  return digits;
}
function normalizeZip(value) {
  if (value === null || value === void 0) return null;
  const str = String(value).trim();
  if (!str) return null;
  const digits = str.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length > 8) return digits.slice(0, 8);
  return digits;
}
function normalizeContactFields(obj, fields) {
  const out = { ...obj };
  for (const key of fields.phones || []) {
    if (key in out) out[key] = normalizePhone(out[key]);
  }
  for (const key of fields.zips || []) {
    if (key in out) out[key] = normalizeZip(out[key]);
  }
  return out;
}
var init_normalize_contact = __esm({
  "server/lib/normalize-contact.ts"() {
    "use strict";
    init_contact_validation();
  }
});

// server/storage.ts
import pg2 from "pg";
function getDirectPool() {
  if (!_directPool) {
    const supabaseDbUrl = process.env.SUPABASE_DATABASE_URL;
    if (supabaseDbUrl) {
      _directPool = new pg2.Pool({
        connectionString: supabaseDbUrl,
        ssl: { rejectUnauthorized: false },
        max: 3,
        idleTimeoutMillis: 2e4,
        connectionTimeoutMillis: 1e4
      });
      console.log("[storage] getDirectPool usando SUPABASE_DATABASE_URL (banco prim\xE1rio)");
    } else {
      _directPool = new pg2.Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 2e4, connectionTimeoutMillis: 5e3 });
      console.warn("[storage] SUPABASE_DATABASE_URL ausente \u2014 caindo para DATABASE_URL local (n\xE3o recomendado)");
    }
  }
  return _directPool;
}
function isSchemaCacheError(msg) {
  return /schema cache/i.test(msg) && /Could not find/i.test(msg);
}
function isLocalFresh(table) {
  const lastSync = localCacheAge.get(table) || 0;
  return Date.now() - lastSync < LOCAL_CACHE_TTL_MS;
}
function markLocalFresh(table) {
  localCacheAge.set(table, Date.now());
}
function memGet(key) {
  const entry = memCache.get(key);
  if (entry && Date.now() - entry.ts < MEM_CACHE_TTL_MS) return entry.data;
  return null;
}
function memSet(key, data) {
  memCache.set(key, { data, ts: Date.now() });
}
function memInvalidate(key) {
  memCache.delete(key);
}
async function resilientList(table, supaFn, orderCol, orderAsc, filters) {
  if (!DISABLE_LOCAL_FALLBACK && !isSupabaseHealthy() && isLocalFresh(table)) {
    const local = await localQuery(
      table,
      filters,
      orderCol ? { column: orderCol, ascending: orderAsc } : void 0
    );
    if (local.length > 0) return local.map((r) => toCamelObj(r));
  }
  try {
    const { data, error } = await supaFn();
    if (error) throw error;
    markLocalFresh(table);
    return toCamelArray(data || []);
  } catch (err) {
    if (DISABLE_LOCAL_FALLBACK) {
      console.error(`[resilient] ${table} list erro Supabase (fallback local desativado):`, err.message || err);
      throw err;
    }
    console.warn(`[resilient] ${table} list fallback: ${err.message || err}`);
    const local = await localQuery(
      table,
      filters,
      orderCol ? { column: orderCol, ascending: orderAsc } : void 0
    );
    return local.map((r) => toCamelObj(r));
  }
}
async function resilientGet(table, filters, supaFn) {
  if (!DISABLE_LOCAL_FALLBACK && !isSupabaseHealthy() && isLocalFresh(table)) {
    const rows = await localQuery(table, filters, void 0, 1);
    if (rows.length > 0) return toCamelObj(rows[0]);
  }
  try {
    const { data, error } = await supaFn();
    if (error && error.code !== "PGRST116") throw error;
    markLocalFresh(table);
    return data ? toCamelObj(data) : void 0;
  } catch (err) {
    if (DISABLE_LOCAL_FALLBACK) {
      console.error(`[resilient] ${table} get erro Supabase (fallback local desativado):`, err.message || err);
      throw err;
    }
    console.warn(`[resilient] ${table} get fallback: ${err.message || err}`);
    const rows = await localQuery(table, filters, void 0, 1);
    return rows.length > 0 ? toCamelObj(rows[0]) : void 0;
  }
}
async function resilientInsert(table, snakePayload) {
  try {
    const { data, error } = await supabaseAdmin.from(table).insert(snakePayload).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj(data);
  } catch (err) {
    if (isSchemaCacheError(err.message || "")) {
      try {
        await applyViaDirectSql(getDirectPool(), "insert", table, snakePayload, null);
        console.log(`[resilient] ${table} insert aplicado via SQL direto (cache do PostgREST desatualizado)`);
        try {
          await supabaseAdmin.rpc("pg_notify", { channel: "pgrst", payload: "reload schema" });
        } catch (_e) {
        }
        return toCamelObj(snakePayload);
      } catch (sqlErr) {
        console.error(`[resilient] ${table} SQL direto tamb\xE9m falhou: ${sqlErr.message}`);
        throw sqlErr;
      }
    }
    if (DISABLE_LOCAL_FALLBACK) {
      console.error(`[resilient] ${table} insert erro Supabase (queue local desativada):`, err.message);
      throw err;
    }
    console.warn(`[resilient] ${table} insert fallback to queue: ${err.message}`);
    const { queueId } = await enqueueWrite(table, "insert", snakePayload);
    return { ...toCamelObj(snakePayload), _queued: true, _queueId: queueId };
  }
}
async function resilientUpdate(table, snakePayload, filters) {
  try {
    let query = supabaseAdmin.from(table).update(snakePayload);
    for (const [col, val] of Object.entries(filters)) {
      query = query.eq(col, val);
    }
    const { data, error } = await query.select().single();
    if (error) throw new Error(error.message);
    return data ? toCamelObj(data) : void 0;
  } catch (err) {
    if (isSchemaCacheError(err.message || "")) {
      try {
        await applyViaDirectSql(getDirectPool(), "update", table, snakePayload, filters);
        console.log(`[resilient] ${table} update aplicado via SQL direto (cache do PostgREST desatualizado)`);
        try {
          await supabaseAdmin.rpc("pg_notify", { channel: "pgrst", payload: "reload schema" });
        } catch (_e) {
        }
        return toCamelObj({ ...snakePayload, ...filters });
      } catch (sqlErr) {
        console.error(`[resilient] ${table} SQL direto tamb\xE9m falhou: ${sqlErr.message}`);
        throw sqlErr;
      }
    }
    if (DISABLE_LOCAL_FALLBACK) {
      console.error(`[resilient] ${table} update erro Supabase (queue local desativada):`, err.message);
      throw err;
    }
    console.warn(`[resilient] ${table} update fallback to queue: ${err.message}`);
    await enqueueWrite(table, "update", snakePayload, filters);
    return toCamelObj({ ...snakePayload, ...filters });
  }
}
async function resilientDelete(table, filters) {
  try {
    let query = supabaseAdmin.from(table).delete();
    for (const [col, val] of Object.entries(filters)) {
      query = query.eq(col, val);
    }
    const { error } = await query;
    if (error) throw new Error(error.message);
  } catch (err) {
    if (DISABLE_LOCAL_FALLBACK) {
      console.error(`[resilient] ${table} delete erro Supabase (queue local desativada):`, err.message);
      throw err;
    }
    console.warn(`[resilient] ${table} delete fallback to queue: ${err.message}`);
    await enqueueWrite(table, "delete", {}, filters);
  }
}
function camelToSnake(str) {
  return str.replace(/([a-z])(\d)/g, "$1_$2").replace(/(\d)([A-Z])/g, "$1_$2").replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}
function snakeToCamel(str) {
  return str.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}
function toSnakeObj(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === void 0) continue;
    out[camelToSnake(k)] = v;
  }
  return out;
}
function toCamelObj(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[snakeToCamel(k)] = v;
  }
  return out;
}
function toCamelArray(arr) {
  return arr.map((r) => toCamelObj(r));
}
var _directPool, LOCAL_CACHE_TTL_MS, localCacheAge, MEM_CACHE_TTL_MS, memCache, DISABLE_LOCAL_FALLBACK, VEHICLE_LIST_COLS, DatabaseStorage, storage;
var init_storage = __esm({
  "server/storage.ts"() {
    "use strict";
    init_supabase();
    init_pg_fallback();
    init_normalize_contact();
    _directPool = null;
    LOCAL_CACHE_TTL_MS = 45e3;
    localCacheAge = /* @__PURE__ */ new Map();
    MEM_CACHE_TTL_MS = 12e4;
    memCache = /* @__PURE__ */ new Map();
    DISABLE_LOCAL_FALLBACK = (process.env.DISABLE_LOCAL_FALLBACK ?? "true").toLowerCase() !== "false";
    VEHICLE_LIST_COLS = "id,plate,model,brand,year,color,chassi,renavam,status,tracker_id,tracker_api_url,tracker_type,truckscontrol_identifier,ssx_integration_code,km,initial_km,last_km_update,frota,photo_front,icon_type,last_latitude,last_longitude,last_ignition,last_speed,last_gps_signal,last_address,last_position_time,stopped_since,ignition_on_since,no_signal_since,last_oil_change_km,notes,created_at";
    DatabaseStorage = class {
      async getUser(id) {
        return resilientGet("users", [{ column: "id", op: "eq", value: id }], () => supabaseAdmin.from("users").select("*").eq("id", id).single());
      }
      async getUserByEmail(email) {
        return resilientGet("users", [{ column: "email", op: "ilike", value: email.toLowerCase() }], () => supabaseAdmin.from("users").select("*").ilike("email", email).single());
      }
      async getUserBySupabaseUid(uid) {
        return resilientGet("users", [{ column: "supabase_uid", op: "eq", value: uid }], () => supabaseAdmin.from("users").select("*").eq("supabase_uid", uid).single());
      }
      async getUsers() {
        return resilientList("users", () => supabaseAdmin.from("users").select("*").order("id"), "id", true);
      }
      async createUser(user) {
        return resilientInsert("users", toSnakeObj(user));
      }
      async updateUser(id, userData) {
        return resilientUpdate("users", toSnakeObj(userData), { id });
      }
      async deleteUser(id) {
        return resilientDelete("users", { id });
      }
      async hasAnyUsers() {
        const { data, error } = await supabaseAdmin.from("users").select("id").limit(1);
        if (error) return true;
        return (data || []).length > 0;
      }
      async createFirstAdmin(adminData) {
        const { data: existing } = await supabaseAdmin.from("users").select("id").limit(1);
        if (existing && existing.length > 0) {
          throw new Error("Sistema j\xE1 possui usu\xE1rios cadastrados");
        }
        const { data, error } = await supabaseAdmin.from("users").insert({
          supabase_uid: adminData.supabaseUid,
          email: adminData.email.toLowerCase().trim(),
          name: adminData.name,
          role: "diretoria"
        }).select().single();
        if (error) throw new Error(error.message);
        return toCamelObj(data);
      }
      async getPerfilAcesso(role) {
        return resilientGet("perfis_acesso", [{ column: "role", op: "eq", value: role }], () => supabaseAdmin.from("perfis_acesso").select("*").eq("role", role).single());
      }
      async getAllPerfis() {
        return resilientList("perfis_acesso", () => supabaseAdmin.from("perfis_acesso").select("*"));
      }
      async getClients() {
        const cached = memGet("clients");
        if (cached) return cached;
        const result = await resilientList("clients", () => supabaseAdmin.from("clients").select("*").order("created_at", { ascending: false }), "created_at", false);
        memSet("clients", result);
        return result;
      }
      async getClient(id) {
        return resilientGet("clients", [{ column: "id", op: "eq", value: id }], () => supabaseAdmin.from("clients").select("*").eq("id", id).single());
      }
      async createClient(client) {
        memInvalidate("clients");
        const normalized = normalizeContactFields(client, { phones: ["phone"], zips: ["zip"] });
        return resilientInsert("clients", toSnakeObj(normalized));
      }
      async updateClient(id, client) {
        memInvalidate("clients");
        const normalized = normalizeContactFields(client, { phones: ["phone"], zips: ["zip"] });
        return resilientUpdate("clients", toSnakeObj(normalized), { id });
      }
      async deleteClient(id) {
        memInvalidate("clients");
        return resilientDelete("clients", { id });
      }
      async getClientVehicles(clientId) {
        return resilientList(
          "client_vehicles",
          () => supabaseAdmin.from("client_vehicles").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
          "created_at",
          false,
          [{ column: "client_id", op: "eq", value: clientId }]
        );
      }
      async getClientVehicle(id) {
        return resilientGet("client_vehicles", [{ column: "id", op: "eq", value: id }], () => supabaseAdmin.from("client_vehicles").select("*").eq("id", id).single());
      }
      async getClientVehicleByPlate(clientId, plate) {
        return resilientGet("client_vehicles", [{ column: "client_id", op: "eq", value: clientId }, { column: "plate", op: "ilike", value: plate }], () => supabaseAdmin.from("client_vehicles").select("*").eq("client_id", clientId).ilike("plate", plate).single());
      }
      async createClientVehicle(v) {
        const normalized = normalizeContactFields(v, { phones: ["driverPhone"] });
        return resilientInsert("client_vehicles", toSnakeObj(normalized));
      }
      async updateClientVehicle(id, v) {
        const normalized = normalizeContactFields(v, { phones: ["driverPhone"] });
        return resilientUpdate("client_vehicles", toSnakeObj(normalized), { id });
      }
      async deleteClientVehicle(id) {
        return resilientDelete("client_vehicles", { id });
      }
      async getEmployees() {
        const cached = memGet("employees");
        if (cached) return cached;
        const result = await resilientList("employees", () => supabaseAdmin.from("employees").select("*").order("created_at", { ascending: false }), "created_at", false);
        memSet("employees", result);
        return result;
      }
      async getEmployee(id) {
        return resilientGet("employees", [{ column: "id", op: "eq", value: id }], () => supabaseAdmin.from("employees").select("*").eq("id", id).single());
      }
      async createEmployee(employee) {
        memInvalidate("employees");
        const normalized = normalizeContactFields(employee, { phones: ["phone"], zips: ["zip"] });
        return resilientInsert("employees", toSnakeObj(normalized));
      }
      async updateEmployee(id, employee) {
        memInvalidate("employees");
        const normalized = normalizeContactFields(employee, { phones: ["phone"], zips: ["zip"] });
        return resilientUpdate("employees", toSnakeObj(normalized), { id });
      }
      async deleteEmployee(id) {
        memInvalidate("employees");
        return resilientDelete("employees", { id });
      }
      async getVehicles() {
        const cached = memGet("vehicles");
        if (cached) return cached;
        const result = await resilientList("vehicles", () => supabaseAdmin.from("vehicles").select(VEHICLE_LIST_COLS).order("created_at", { ascending: false }), "created_at", false);
        memSet("vehicles", result);
        return result;
      }
      async getVehicle(id) {
        return resilientGet("vehicles", [{ column: "id", op: "eq", value: id }], () => supabaseAdmin.from("vehicles").select("*").eq("id", id).single());
      }
      async createVehicle(vehicle) {
        memInvalidate("vehicles");
        return resilientInsert("vehicles", toSnakeObj(vehicle));
      }
      async updateVehicle(id, vehicle) {
        memInvalidate("vehicles");
        return resilientUpdate("vehicles", toSnakeObj(vehicle), { id });
      }
      async deleteVehicle(id) {
        memInvalidate("vehicles");
        return resilientDelete("vehicles", { id });
      }
      async getServiceOrders() {
        return resilientList("service_orders", () => supabaseAdmin.from("service_orders").select("*").order("created_at", { ascending: false }), "created_at", false);
      }
      async getServiceOrder(id) {
        return resilientGet("service_orders", [{ column: "id", op: "eq", value: id }], () => supabaseAdmin.from("service_orders").select("*").eq("id", id).single());
      }
      async createServiceOrder(order) {
        const normalized = normalizeContactFields(order, { phones: ["escortedDriverPhone"] });
        const snake = toSnakeObj(normalized);
        if (Array.isArray(snake.extra_drivers)) {
          snake.extra_drivers = snake.extra_drivers.map((d) => d && typeof d === "object" ? { ...d, phone: normalizePhone(d.phone) } : d);
        }
        console.log(`[DEBUG-STORAGE] createServiceOrder escorted:`, JSON.stringify({ dn: snake.escorted_driver_name, dp: snake.escorted_driver_phone, vp: snake.escorted_vehicle_plate }));
        return resilientInsert("service_orders", snake);
      }
      async updateServiceOrder(id, order) {
        const normalized = normalizeContactFields(order, { phones: ["escortedDriverPhone"] });
        const snake = toSnakeObj(normalized);
        if (Array.isArray(snake.extra_drivers)) {
          snake.extra_drivers = snake.extra_drivers.map((d) => d && typeof d === "object" ? { ...d, phone: normalizePhone(d.phone) } : d);
        }
        if (snake.escorted_driver_name !== void 0 || snake.escorted_driver_phone !== void 0) {
          console.log(`[DEBUG-STORAGE] updateServiceOrder #${id} escorted:`, JSON.stringify({ dn: snake.escorted_driver_name, dp: snake.escorted_driver_phone, vp: snake.escorted_vehicle_plate }));
        }
        return resilientUpdate("service_orders", snake, { id });
      }
      async deleteServiceOrder(id) {
        return resilientDelete("service_orders", { id });
      }
      async getTrips() {
        return resilientList("trips", () => supabaseAdmin.from("trips").select("*").order("created_at", { ascending: false }), "created_at", false);
      }
      async getTrip(id) {
        return resilientGet("trips", [{ column: "id", op: "eq", value: id }], () => supabaseAdmin.from("trips").select("*").eq("id", id).single());
      }
      async createTrip(trip) {
        return resilientInsert("trips", toSnakeObj(trip));
      }
      async updateTrip(id, trip) {
        return resilientUpdate("trips", toSnakeObj(trip), { id });
      }
      async deleteTrip(id) {
        return resilientDelete("trips", { id });
      }
      async getVehicleMaintenances() {
        return resilientList("vehicle_maintenance", () => supabaseAdmin.from("vehicle_maintenance").select("*").order("created_at", { ascending: false }), "created_at", false);
      }
      async getVehicleMaintenance(id) {
        return resilientGet("vehicle_maintenance", [{ column: "id", op: "eq", value: id }], () => supabaseAdmin.from("vehicle_maintenance").select("*").eq("id", id).single());
      }
      async createVehicleMaintenance(m) {
        return resilientInsert("vehicle_maintenance", toSnakeObj(m));
      }
      async updateVehicleMaintenance(id, m) {
        return resilientUpdate("vehicle_maintenance", toSnakeObj(m), { id });
      }
      async deleteVehicleMaintenance(id) {
        return resilientDelete("vehicle_maintenance", { id });
      }
      async getVehicleFuelings() {
        const LIGHT_COLS = "id,vehicle_id,driver_id,date,liters,cost_per_liter,total_cost,km,fuel_type,full_tank,station,notes,latitude,longitude,address,gasoline_price,ethanol_price,fuel_recommendation,recommendation_followed,created_by_user_id,ticketlog_autorizacao,ticketlog_status,ticketlog_nfe_data,ticketlog_codigo_estab,ticketlog_valor_tl,ticketlog_litros_tl,ticketlog_diff_valor,ticketlog_validated_at,ticketlog_message,ticketlog_estab_nome,ticketlog_attempts,ai_validation_status,ai_validation_result,created_at";
        return resilientList("vehicle_fueling", () => supabaseAdmin.from("vehicle_fueling").select(LIGHT_COLS).order("created_at", { ascending: false }), "created_at", false);
      }
      async getVehicleFueling(id) {
        return resilientGet("vehicle_fueling", [{ column: "id", op: "eq", value: id }], () => supabaseAdmin.from("vehicle_fueling").select("*").eq("id", id).single());
      }
      async createVehicleFueling(f) {
        return resilientInsert("vehicle_fueling", toSnakeObj(f));
      }
      async updateVehicleFueling(id, f) {
        return resilientUpdate("vehicle_fueling", toSnakeObj(f), { id });
      }
      async deleteVehicleFueling(id) {
        return resilientDelete("vehicle_fueling", { id });
      }
      async getTimesheets() {
        return resilientList("timesheets", () => supabaseAdmin.from("timesheets").select("*").order("created_at", { ascending: false }), "created_at", false);
      }
      async getTimesheet(id) {
        return resilientGet("timesheets", [{ column: "id", op: "eq", value: id }], () => supabaseAdmin.from("timesheets").select("*").eq("id", id).single());
      }
      async createTimesheet(t) {
        return resilientInsert("timesheets", toSnakeObj(t));
      }
      async updateTimesheet(id, t) {
        return resilientUpdate("timesheets", toSnakeObj(t), { id });
      }
      async deleteTimesheet(id) {
        return resilientDelete("employee_timesheets", { id });
      }
      async getMissionPhotosByOS(serviceOrderId) {
        return resilientList(
          "mission_photos",
          () => supabaseAdmin.from("mission_photos").select("*").eq("service_order_id", serviceOrderId).order("created_at"),
          "created_at",
          true,
          [{ column: "service_order_id", op: "eq", value: serviceOrderId }]
        );
      }
      async getMissionPhoto(id) {
        return resilientGet("mission_photos", [{ column: "id", op: "eq", value: id }], () => supabaseAdmin.from("mission_photos").select("*").eq("id", id).single());
      }
      async createMissionPhoto(photo) {
        const { data, error } = await supabaseAdmin.from("mission_photos").insert(toSnakeObj(photo)).select().single();
        if (error) throw new Error(error.message);
        return toCamelObj(data);
      }
      async getServiceOrdersByEmployee(employeeId) {
        try {
          const { data, error } = await supabaseAdmin.from("service_orders").select("*").or(`assigned_employee_id.eq.${employeeId},assigned_employee_2_id.eq.${employeeId}`).order("created_at", { ascending: false });
          if (error) throw error;
          return toCamelArray(data || []);
        } catch (err) {
          console.warn(`[resilient] service_orders by employee fallback: ${err.message || err}`);
          const all = await localQuery("service_orders", void 0, { column: "created_at", ascending: false });
          return all.filter((r) => Number(r.assigned_employee_id) === employeeId || Number(r.assigned_employee_2_id) === employeeId).map((r) => toCamelObj(r));
        }
      }
      async createApiLog(logEntry) {
        try {
          const { data, error } = await supabaseAdmin.from("api_logs").insert(toSnakeObj(logEntry)).select().single();
          if (error) {
            console.error("[api_logs] insert error:", error.message);
            return null;
          }
          return toCamelObj(data);
        } catch (e) {
          console.error("[api_logs] unexpected error:", e.message);
          return null;
        }
      }
      async getRecentApiLogs(limit = 100) {
        return resilientList("api_logs", () => supabaseAdmin.from("api_logs").select("*").order("created_at", { ascending: false }).limit(limit), "created_at", false);
      }
      async getEmployeeSalaries(employeeId) {
        return resilientList(
          "employee_salaries",
          () => supabaseAdmin.from("employee_salaries").select("*").eq("employee_id", employeeId).order("effective_date", { ascending: false }),
          "effective_date",
          false,
          [{ column: "employee_id", op: "eq", value: employeeId }]
        );
      }
      async createEmployeeSalary(salary) {
        return resilientInsert("employee_salaries", toSnakeObj(salary));
      }
      async deleteEmployeeSalary(id) {
        return resilientDelete("employee_salaries", { id });
      }
      async getNextMatricula() {
        const { data } = await supabaseAdmin.from("employees").select("id").order("id", { ascending: false }).limit(1);
        const nextId = data && data.length > 0 ? data[0].id + 1 : 1;
        return "TVP-" + String(nextId).padStart(4, "0");
      }
      async getEmployeeDocuments(employeeId) {
        return resilientList(
          "employee_documents",
          () => supabaseAdmin.from("employee_documents").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false }),
          "created_at",
          false,
          [{ column: "employee_id", op: "eq", value: employeeId }]
        );
      }
      async createEmployeeDocument(doc) {
        return resilientInsert("employee_documents", toSnakeObj(doc));
      }
      async updateEmployeeDocument(id, doc) {
        return resilientUpdate("employee_documents", toSnakeObj(doc), { id });
      }
      async deleteEmployeeDocument(id) {
        return resilientDelete("employee_documents", { id });
      }
      async getWeapons() {
        return resilientList("weapons", () => supabaseAdmin.from("weapons").select("*").order("created_at", { ascending: false }), "created_at", false);
      }
      async getWeapon(id) {
        return resilientGet("weapons", [{ column: "id", op: "eq", value: id }], () => supabaseAdmin.from("weapons").select("*").eq("id", id).single());
      }
      async createWeapon(weapon) {
        return resilientInsert("weapons", toSnakeObj(weapon));
      }
      async updateWeapon(id, weapon) {
        return resilientUpdate("weapons", toSnakeObj(weapon), { id });
      }
      async deleteWeapon(id) {
        return resilientDelete("weapons", { id });
      }
      async getWeaponAssignments(weaponId) {
        return resilientList(
          "weapon_assignments",
          () => supabaseAdmin.from("weapon_assignments").select("*").eq("weapon_id", weaponId).order("created_at", { ascending: false }),
          "created_at",
          false,
          [{ column: "weapon_id", op: "eq", value: weaponId }]
        );
      }
      async createWeaponAssignment(a) {
        return resilientInsert("weapon_assignments", toSnakeObj(a));
      }
      async getVehicleAssignments(vehicleId) {
        return resilientList(
          "vehicle_assignments",
          () => supabaseAdmin.from("vehicle_assignments").select("*").eq("vehicle_id", vehicleId).order("created_at", { ascending: false }),
          "created_at",
          false,
          [{ column: "vehicle_id", op: "eq", value: vehicleId }]
        );
      }
      async createVehicleAssignment(a) {
        return resilientInsert("vehicle_assignments", toSnakeObj(a));
      }
      async getGerenciadoras() {
        return resilientList("gerenciadoras", () => supabaseAdmin.from("gerenciadoras").select("*").order("name"), "name", true);
      }
      async getGerenciadora(id) {
        return resilientGet("gerenciadoras", [{ column: "id", op: "eq", value: id }], () => supabaseAdmin.from("gerenciadoras").select("*").eq("id", id).single());
      }
      async createGerenciadora(g) {
        const normalized = normalizeContactFields(g, { phones: ["contactPhone"] });
        return resilientInsert("gerenciadoras", toSnakeObj(normalized));
      }
      async updateGerenciadora(id, g) {
        const normalized = normalizeContactFields(g, { phones: ["contactPhone"] });
        return resilientUpdate("gerenciadoras", toSnakeObj(normalized), { id });
      }
      async deleteGerenciadora(id) {
        return resilientDelete("gerenciadoras", { id });
      }
      async getWeaponKits() {
        return resilientList("weapon_kits", () => supabaseAdmin.from("weapon_kits").select("*").order("name"), "name", true);
      }
      async getWeaponKit(id) {
        return resilientGet("weapon_kits", [{ column: "id", op: "eq", value: id }], () => supabaseAdmin.from("weapon_kits").select("*").eq("id", id).single());
      }
      async createWeaponKit(kit) {
        return resilientInsert("weapon_kits", toSnakeObj(kit));
      }
      async updateWeaponKit(id, kit) {
        return resilientUpdate("weapon_kits", toSnakeObj(kit), { id });
      }
      async deleteWeaponKit(id) {
        await resilientDelete("weapon_kit_items", { kit_id: id });
        await resilientDelete("weapon_kits", { id });
      }
      async getWeaponKitItems(kitId) {
        return resilientList(
          "weapon_kit_items",
          () => supabaseAdmin.from("weapon_kit_items").select("*").eq("kit_id", kitId),
          void 0,
          void 0,
          [{ column: "kit_id", op: "eq", value: kitId }]
        );
      }
      async createWeaponKitItem(item) {
        return resilientInsert("weapon_kit_items", toSnakeObj(item));
      }
      async deleteWeaponKitItem(id) {
        return resilientDelete("weapon_kit_items", { id });
      }
      async deleteWeaponKitItemsByKit(kitId) {
        return resilientDelete("weapon_kit_items", { kit_id: kitId });
      }
      async createTelemetryEvent(e) {
        return resilientInsert("telemetry_events", toSnakeObj(e));
      }
      async getTelemetryEvents(filters) {
        try {
          let query = supabaseAdmin.from("telemetry_events").select("*");
          if (filters?.eventType) query = query.eq("event_type", filters.eventType);
          if (filters?.plate) query = query.eq("plate", filters.plate);
          if (filters?.from) query = query.gte("created_at", filters.from.toISOString());
          if (filters?.to) query = query.lte("created_at", filters.to.toISOString());
          query = query.order("created_at", { ascending: false });
          if (filters?.limit) query = query.limit(filters.limit);
          const { data, error } = await query;
          if (error) throw error;
          return toCamelArray(data || []);
        } catch (err) {
          console.warn(`[resilient] telemetry_events fallback: ${err.message || err}`);
          const localFilters = [];
          if (filters?.eventType) localFilters.push({ column: "event_type", op: "eq", value: filters.eventType });
          if (filters?.plate) localFilters.push({ column: "plate", op: "eq", value: filters.plate });
          if (filters?.from) localFilters.push({ column: "created_at", op: "gte", value: filters.from.toISOString() });
          if (filters?.to) localFilters.push({ column: "created_at", op: "lte", value: filters.to.toISOString() });
          const local = await localQuery("telemetry_events", localFilters.length > 0 ? localFilters : void 0, { column: "created_at", ascending: false }, filters?.limit);
          return local.map((r) => toCamelObj(r));
        }
      }
      async getLastAlertByPlates(plates) {
        const result = /* @__PURE__ */ new Map();
        if (plates.length === 0) return result;
        const { data } = await supabaseAdmin.from("telemetry_events").select("*").in("plate", plates).order("created_at", { ascending: false });
        for (const row of data || []) {
          const camel = toCamelObj(row);
          if (!result.has(camel.plate)) {
            result.set(camel.plate, camel);
          }
        }
        return result;
      }
      async upsertAgentLocation(data) {
        const payload = toSnakeObj(data);
        payload.updated_at = (/* @__PURE__ */ new Date()).toISOString();
        try {
          const { data: result, error } = await supabaseAdmin.from("agent_locations").upsert(payload, { onConflict: "user_id" }).select().single();
          if (error) throw new Error(error.message);
          return toCamelObj(result);
        } catch (err) {
          console.warn(`[resilient] agent_locations upsert fallback: ${err.message}`);
          await enqueueWrite("agent_locations", "upsert", payload, { onConflict: "user_id" });
          return toCamelObj(payload);
        }
      }
      async getAgentLocations() {
        return resilientList("agent_locations", () => supabaseAdmin.from("agent_locations").select("*").order("updated_at", { ascending: false }), "updated_at", false);
      }
      async getMissionCostsByOS(serviceOrderId) {
        return resilientList(
          "mission_costs",
          () => supabaseAdmin.from("mission_costs").select("*").eq("service_order_id", serviceOrderId).order("created_at", { ascending: false }),
          "created_at",
          false,
          [{ column: "service_order_id", op: "eq", value: serviceOrderId }]
        );
      }
      async createMissionCost(cost) {
        return resilientInsert("mission_costs", toSnakeObj(cost));
      }
      async deleteMissionCost(id) {
        return resilientDelete("mission_costs", { id });
      }
      async getClientForwardsByOS(serviceOrderId) {
        return resilientList(
          "client_forwards",
          () => supabaseAdmin.from("client_forwards").select("*").eq("service_order_id", serviceOrderId).order("created_at", { ascending: false }),
          "created_at",
          false,
          [{ column: "service_order_id", op: "eq", value: serviceOrderId }]
        );
      }
      async createClientForward(forward) {
        return resilientInsert("client_forwards", toSnakeObj(forward));
      }
    };
    storage = new DatabaseStorage();
  }
});

// server/apibrasil.ts
function getDeviceTokenForEndpoint(endpoint) {
  const map = {
    "/vehicles/dados": process.env.APIBRASIL_DEVICE_PLACA_DADOS,
    "/vehicles/multas": process.env.APIBRASIL_DEVICE_MULTAS,
    "/vehicles/cnh": process.env.APIBRASIL_DEVICE_CNH,
    "/judiciais/processos": process.env.APIBRASIL_DEVICE_PROCESSOS,
    "/credito/spc": process.env.APIBRASIL_DEVICE_SPC,
    "/credito/quod": process.env.APIBRASIL_DEVICE_QUOD,
    "/credito/protesto": process.env.APIBRASIL_DEVICE_PROTESTO,
    "/dados/situacao-eleitoral": process.env.APIBRASIL_DEVICE_ELEITORAL,
    "/nfe/emitir": process.env.APIBRASIL_DEVICE_NOTAS,
    "/cnpj/certidao-negativa": process.env.APIBRASIL_DEVICE_CERTIDAO_PJ
  };
  return map[endpoint] || process.env.APIBRASIL_DEVICE_TOKEN || null;
}
function getToken() {
  return process.env.APIBRASIL_TOKEN || null;
}
async function apiRequest(endpoint, method, body, userId, source = "manual") {
  const token = getToken();
  if (!token) {
    await storage.createApiLog({
      endpoint,
      method,
      requestData: JSON.stringify(body),
      responseStatus: 503,
      responseData: JSON.stringify({ error: "Token APIBRASIL_TOKEN n\xE3o configurado" }),
      userId: userId ?? null,
      source
    });
    return { success: false, data: { error: "Token APIBRASIL_TOKEN n\xE3o configurado" }, status: 503 };
  }
  const deviceToken = getDeviceTokenForEndpoint(endpoint);
  try {
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
    if (deviceToken) {
      headers["DeviceToken"] = deviceToken;
    }
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      body: method !== "GET" ? JSON.stringify(body) : void 0
    });
    const responseData = await response.json().catch(() => ({ error: "Resposta inv\xE1lida" }));
    const status = response.status;
    const logData = typeof responseData === "object" ? JSON.stringify(responseData).substring(0, 5e3) : String(responseData).substring(0, 5e3);
    if (status >= 400 || !response.ok) {
      await storage.createApiLog({
        endpoint,
        method,
        requestData: JSON.stringify(body),
        responseStatus: status,
        responseData: logData,
        userId: userId ?? null,
        source
      });
    }
    if (!response.ok) {
      const errMsg = responseData?.message || responseData?.error || `HTTP ${status}`;
      return { success: false, data: { error: errMsg, details: responseData }, status };
    }
    return { success: true, data: responseData?.response || responseData, status };
  } catch (err) {
    await storage.createApiLog({
      endpoint,
      method,
      requestData: JSON.stringify(body),
      responseStatus: 0,
      responseData: JSON.stringify({ error: err.message }),
      userId: userId ?? null,
      source
    });
    return { success: false, data: { error: `Erro de conex\xE3o: ${err.message}` }, status: 0 };
  }
}
async function consultaMultasPRF(placa, userId, source = "manual") {
  return apiRequest("/vehicles/multas", "POST", { placa }, userId, source);
}
async function consultaCNH(cpf, userId, source = "manual") {
  return apiRequest("/vehicles/cnh", "POST", { cpf: cpf.replace(/\D/g, "") }, userId, source);
}
async function consultaProcessos(cpf, userId, source = "manual") {
  return apiRequest("/judiciais/processos", "POST", { cpf: cpf.replace(/\D/g, "") }, userId, source);
}
async function consultaSituacaoEleitoral(cpf, userId, source = "manual") {
  return apiRequest("/dados/situacao-eleitoral", "POST", { cpf: cpf.replace(/\D/g, "") }, userId, source);
}
var API_BASE;
var init_apibrasil = __esm({
  "server/apibrasil.ts"() {
    "use strict";
    init_storage();
    API_BASE = "https://gateway.apibrasil.io/api/v2";
  }
});

// server/lib/hours-calc.ts
function ymdBRT(iso) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() - 3 * 36e5).toISOString().slice(0, 10);
}
function minuteKeyBRT(iso) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() - 3 * 36e5).toISOString().slice(0, 16);
}
function computeWorkedHours(punches) {
  const sorted = punches.filter((p) => p && p.punch_at != null).map((p) => typeof p.punch_at === "string" ? new Date(p.punch_at) : p.punch_at).sort((a, b) => a.getTime() - b.getTime());
  const seen = /* @__PURE__ */ new Set();
  const clean = [];
  for (const d of sorted) {
    const key = minuteKeyBRT(d);
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(d);
  }
  const perDayMinutes = /* @__PURE__ */ new Map();
  const pairs = [];
  let totalMinutes = 0;
  let cappedMinutes = 0;
  let pairsTruncated = 0;
  let i = 0;
  for (; i + 1 < clean.length; i += 2) {
    const entrada = clean[i];
    const saida = clean[i + 1];
    const diffMin = (saida.getTime() - entrada.getTime()) / 6e4;
    if (diffMin <= 0) continue;
    pairs.push({ entrada, saida });
    let countedMin = diffMin;
    if (diffMin > MAX_PAIR_MINUTES) {
      cappedMinutes += diffMin - MAX_PAIR_MINUTES;
      countedMin = MAX_PAIR_MINUTES;
      pairsTruncated++;
    }
    const dayKey = ymdBRT(entrada);
    perDayMinutes.set(dayKey, (perDayMinutes.get(dayKey) || 0) + countedMin);
    totalMinutes += countedMin;
  }
  const hasOpenShift = i < clean.length;
  const openShiftSince = hasOpenShift ? clean[clean.length - 1] : null;
  let daysWorked = 0;
  for (const min of Array.from(perDayMinutes.values())) {
    if (min > 0) daysWorked++;
  }
  return {
    totalMinutes: Math.round(totalMinutes),
    totalHours: Math.round(totalMinutes / 60 * 100) / 100,
    perDayMinutes,
    daysWorked,
    hasOpenShift,
    openShiftSince,
    pairs,
    cappedMinutes: Math.round(cappedMinutes),
    pairsTruncated
  };
}
var MAX_PAIR_MINUTES;
var init_hours_calc = __esm({
  "server/lib/hours-calc.ts"() {
    "use strict";
    MAX_PAIR_MINUTES = 16 * 60;
  }
});

// server/lib/control-id-parsers.ts
import crypto from "node:crypto";
function getEncKey() {
  const raw = process.env.CONTROLID_ENC_KEY || process.env.SESSION_SECRET || "torres-default-encryption-key-change-me-please-32";
  return crypto.createHash("sha256").update(raw).digest();
}
function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}
function decryptSecret(b64) {
  try {
    const buf = Buffer.from(b64, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", getEncKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString("utf8");
  } catch (err) {
    throw new Error(`Falha ao descriptografar credencial: ${err.message}`);
  }
}
function parseRhidDate(d) {
  if (!d) return /* @__PURE__ */ new Date(0);
  if (typeof d === "string") {
    const m = d.match(/\/Date\((\d+)([+-]\d{4})?\)\//);
    if (m) return new Date(parseInt(m[1]));
    return new Date(d);
  }
  return new Date(d);
}
function parseRhidAfdRecords(afdData, since) {
  const records = Array.isArray(afdData) ? afdData : afdData?.data || afdData?.records || [];
  const sinceMs = since ? since.getTime() : Date.now() - 7 * 24 * 60 * 60 * 1e3;
  const events = [];
  for (const rec of records) {
    const punchDate = parseRhidDate(
      rec.dateTime || rec.DateTime || rec.PunchDate || rec.punchDate || rec.Date || rec.date
    );
    if (punchDate.getTime() <= 0 || punchDate.getTime() < sinceMs) continue;
    const personId = String(
      rec.idPerson || rec.IdPerson || rec.PersonId || rec.personId || rec.EmployeeId || rec.id || ""
    );
    const personName = rec.personName || rec.PersonName || rec.Name || rec.name || "";
    const punchIso = punchDate.toISOString();
    events.push({
      id: `rhid_${rec.id || personId}_${punchDate.getTime()}`,
      userId: personId,
      userName: personName,
      time: punchIso,
      direction: "unknown",
      source: rec.faceScore > 0 ? "facial" : void 0,
      raw: rec
    });
  }
  return events;
}
function normalizeEvent(raw) {
  const id = String(
    raw.id ?? raw.event_id ?? raw.access_log_id ?? raw.uuid ?? `${raw.user_id || raw.userId}-${raw.time}`
  );
  let t = raw.time ?? raw.timestamp ?? raw.date ?? raw.event_time ?? raw.access_time;
  let punchIso;
  if (typeof t === "number") {
    punchIso = new Date(t < 1e12 ? t * 1e3 : t).toISOString();
  } else if (typeof t === "string") {
    const num2 = Number(t);
    if (!isNaN(num2) && num2 > 1e9) {
      punchIso = new Date(num2 < 1e12 ? num2 * 1e3 : num2).toISOString();
    } else {
      punchIso = new Date(t).toISOString();
    }
  } else {
    punchIso = (/* @__PURE__ */ new Date()).toISOString();
  }
  const dirRaw = String(raw.direction || raw.flow || raw.tipo || raw.event || "").toLowerCase();
  let direction = "unknown";
  if (/in|entrada|1/.test(dirRaw)) direction = "in";
  else if (/out|saida|saída|2/.test(dirRaw)) direction = "out";
  const srcRaw = String(raw.source || raw.identification_method || raw.type || "").toLowerCase();
  let source;
  if (/face|facial/.test(srcRaw)) source = "facial";
  else if (/rfid|card|cartao|cartão/.test(srcRaw)) source = "rfid";
  else if (/digital|fingerprint|biometr/.test(srcRaw)) source = "digital";
  else if (/pass|senha|password/.test(srcRaw)) source = "senha";
  return {
    id,
    userId: String(raw.user_id ?? raw.userId ?? raw.person_id ?? raw.matricula ?? raw.idUser ?? ""),
    userName: raw.user_name || raw.userName || raw.name || raw.nome,
    time: punchIso,
    direction,
    source,
    raw
  };
}
function minuteKeyBRT2(d) {
  const date = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const time = d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${date} ${time}`;
}
function normalizeName(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}
function nameTokens(s) {
  return normalizeName(s).split(" ").filter((t) => t.length >= 3);
}
function nameMatchScore(a, b) {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.includes(t)) common++;
  return common / Math.max(ta.length, tb.length);
}
function monthToFechamento(monthYear) {
  const [yyyy, mm] = monthYear.split("-").map(Number);
  let start = new Date(Date.UTC(yyyy, mm - 2, 26, 3));
  const end = new Date(Date.UTC(yyyy, mm - 1, 26, 3));
  const minStart = new Date(Date.UTC(2026, 2, 1, 3));
  if (start.getTime() < minStart.getTime()) start = minStart;
  return { start, end };
}
function rhidNumericCore(externalId) {
  if (externalId == null) return null;
  const s = String(externalId).trim();
  const m = s.match(/^rhid_(\d+)_\d+$/);
  if (m) return m[1];
  if (/^\d+$/.test(s)) return s;
  return null;
}
function dedupPunchesByCore(punches) {
  const pureCoreDays = /* @__PURE__ */ new Map();
  for (const p of punches) {
    const ext = p.external_id == null ? "" : String(p.external_id).trim();
    if (/^\d+$/.test(ext)) {
      const day = minuteKeyBRT2(new Date(p.punch_at)).slice(0, 10);
      const set = pureCoreDays.get(ext) || /* @__PURE__ */ new Set();
      set.add(day);
      pureCoreDays.set(ext, set);
    }
  }
  if (pureCoreDays.size === 0) return punches;
  return punches.filter((p) => {
    const ext = p.external_id == null ? "" : String(p.external_id).trim();
    const m = ext.match(/^rhid_(\d+)_\d+$/);
    if (!m) return true;
    const days = pureCoreDays.get(m[1]);
    if (!days) return true;
    const day = minuteKeyBRT2(new Date(p.punch_at)).slice(0, 10);
    return !days.has(day);
  });
}
function decideImport(params) {
  if (params.externalIdExists) return "skip";
  if (params.localExternalIdAtMinute === void 0) return "insert";
  return params.localExternalIdAtMinute === params.eventExternalId ? "skip" : "adopt-external-id";
}
var init_control_id_parsers = __esm({
  "server/lib/control-id-parsers.ts"() {
    "use strict";
  }
});

// server/lib/espelho-ponto.ts
function ymdBRT2(d) {
  return new Date(d.getTime() - 3 * 36e5).toISOString().slice(0, 10);
}
function fmtBRT(d) {
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  });
}
function nightMinutesBRT(startMs, endMs) {
  if (!(endMs > startMs)) return 0;
  let count = 0;
  for (let t = startMs; t < endMs; t += 6e4) {
    const h = Number(new Date(t).toLocaleString("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hour12: false
    }));
    if (h >= 22 || h < 5) count++;
  }
  return count;
}
function hhmm(min) {
  if (min <= 0) return "";
  const t = Math.round(min);
  if (t <= 0) return "";
  const h = Math.floor(t / 60), m = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function isMidnightCloseMarker(d) {
  return fmtBRT(d) === "23:59";
}
function isMidnightOpenMarker(d) {
  const t = fmtBRT(d);
  return t === "00:00" || t === "00:01";
}
function buildEspelhoPonto(punches, fromYmd, toYmd, jornadaDiariaMin) {
  const sorted = punches.filter((p) => p && p.punch_at != null).map((p) => ({ d: typeof p.punch_at === "string" ? new Date(p.punch_at) : p.punch_at, source: p.source ?? null })).filter((p) => p.d.getTime() > 0).sort((a, b) => a.d.getTime() - b.d.getTime());
  const seen = /* @__PURE__ */ new Set();
  const clean = [];
  for (const p of sorted) {
    const k = minuteKeyBRT2(p.d);
    if (seen.has(k)) continue;
    seen.add(k);
    clean.push(p);
  }
  const stitched = [];
  for (let i = 0; i < clean.length; i++) {
    const cur2 = clean[i];
    const next = clean[i + 1];
    if (next && isMidnightCloseMarker(cur2.d) && isMidnightOpenMarker(next.d) && ymdBRT2(next.d) > ymdBRT2(cur2.d) && next.d.getTime() - cur2.d.getTime() <= 3 * 6e4) {
      i++;
      continue;
    }
    stitched.push(cur2);
  }
  const HARD_MAX_GAP_MIN = 18 * 60;
  const LONG_SHIFT_WARN_MIN = 16 * 60;
  const SHORT_PAIR_WARN_MIN = 3;
  const pairs = [];
  const orphans = [];
  for (let k = 0; k < stitched.length; ) {
    const ent = stitched[k];
    const nxt = stitched[k + 1];
    if (nxt && nxt.d.getTime() - ent.d.getTime() <= HARD_MAX_GAP_MIN * 6e4) {
      const durMin = (nxt.d.getTime() - ent.d.getTime()) / 6e4;
      pairs.push({ ent: ent.d, sai: nxt.d, entSrc: ent.source, long: durMin > LONG_SHIFT_WARN_MIN });
      k += 2;
    } else {
      orphans.push(ent.d);
      k += 1;
    }
  }
  const pairsByDay = /* @__PURE__ */ new Map();
  for (const p of pairs) {
    const k = ymdBRT2(p.ent);
    if (!pairsByDay.has(k)) pairsByDay.set(k, []);
    pairsByDay.get(k).push(p);
  }
  const validation = [];
  const days = [];
  let totalMin = 0, totalNoturno = 0, totalExtra = 0;
  const labelOf = (cur2) => `${String(cur2.getDate()).padStart(2, "0")}/${String(cur2.getMonth() + 1).padStart(2, "0")}/${String(cur2.getFullYear()).slice(-2)}`;
  const cur = /* @__PURE__ */ new Date(fromYmd + "T12:00:00-03:00");
  const last = /* @__PURE__ */ new Date(toYmd + "T12:00:00-03:00");
  while (cur.getTime() <= last.getTime()) {
    const ymd = cur.toISOString().slice(0, 10);
    const label = labelOf(cur);
    const weekday = WEEKDAYS[cur.getDay()];
    const dayPairs = (pairsByDay.get(ymd) || []).sort((a, b) => a.ent.getTime() - b.ent.getTime());
    const issues = [];
    const tratamentos = [];
    let dayMin = 0, dayNoturno = 0;
    const marcacoes = [];
    for (const p of dayPairs) {
      const entTxt = fmtBRT(p.ent);
      const crossesDay = ymdBRT2(p.sai) > ymd;
      const saiTxt = crossesDay ? `${fmtBRT(p.sai)} (+1)` : fmtBRT(p.sai);
      marcacoes.push(entTxt, saiTxt);
      const diffMin = (p.sai.getTime() - p.ent.getTime()) / 6e4;
      if (diffMin <= 0) {
        issues.push(`Hor\xE1rio inconsistente: sa\xEDda ${fmtBRT(p.sai)} n\xE3o \xE9 posterior \xE0 entrada ${entTxt}`);
        tratamentos.push({ horario: entTxt, ocorr: "D", motivo: "HOR\xC1RIO INCONSISTENTE" });
        continue;
      }
      if (diffMin <= SHORT_PAIR_WARN_MIN) {
        issues.push(`Par muito curto (${diffMin} min): ${entTxt}\u2192${fmtBRT(p.sai)} \u2014 poss\xEDvel batida duplicada`);
        tratamentos.push({ horario: entTxt, ocorr: "P", motivo: "PAR MUITO CURTO \u2014 CONFERIR" });
      }
      dayMin += diffMin;
      dayNoturno += nightMinutesBRT(p.ent.getTime(), p.sai.getTime());
      if (p.long) {
        issues.push(`Turno longo (${hhmm(diffMin)}): ${entTxt}\u2192${fmtBRT(p.sai)} \u2014 conferir se h\xE1 batida faltando`);
        tratamentos.push({ horario: entTxt, ocorr: "P", motivo: "TURNO LONGO \u2014 CONFERIR" });
      }
      const src = (p.entSrc || "").toLowerCase();
      if (src.includes("manual") || src.includes("mobile") || src.includes("web")) {
        tratamentos.push({ horario: entTxt, ocorr: "I", motivo: "MARCA\xC7\xC3O MOBILE/WEB" });
      }
    }
    for (const o of orphans) {
      if (ymdBRT2(o) !== ymd) continue;
      const t = fmtBRT(o);
      marcacoes.push(t);
      issues.push(`Batida incompleta: entrada ${t} sem sa\xEDda`);
      tratamentos.push({ horario: t, ocorr: "D", motivo: "ENTRADA SEM SA\xCDDA" });
    }
    const jornada = { ent1: "", sai1: "", ent2: "", sai2: "", ent3: "", sai3: "" };
    const fmtPairSai = (p) => ymdBRT2(p.sai) > ymd ? `${fmtBRT(p.sai)}` : fmtBRT(p.sai);
    if (dayPairs[0]) {
      jornada.ent1 = fmtBRT(dayPairs[0].ent);
      jornada.sai1 = fmtPairSai(dayPairs[0]);
    }
    if (dayPairs[1]) {
      jornada.ent2 = fmtBRT(dayPairs[1].ent);
      jornada.sai2 = fmtPairSai(dayPairs[1]);
    }
    if (dayPairs[2]) {
      jornada.ent3 = fmtBRT(dayPairs[2].ent);
      jornada.sai3 = fmtPairSai(dayPairs[2]);
    }
    if (dayPairs.length > 3) {
      issues.push(`${dayPairs.length} pares de batida no dia \u2014 exibindo os 3 primeiros na jornada`);
    }
    const dayExtra = Math.max(0, dayMin - jornadaDiariaMin);
    totalMin += dayMin;
    totalNoturno += dayNoturno;
    totalExtra += dayExtra;
    for (const iss of issues) {
      validation.push({
        date: ymd,
        label,
        severity: iss.startsWith("Batida incompleta") || iss.startsWith("Hor\xE1rio inconsistente") ? "erro" : "aviso",
        message: `${label}: ${iss}`
      });
    }
    days.push({
      date: ymd,
      label,
      weekday,
      marcacoes,
      jornada,
      duracao: hhmm(dayMin),
      noturno: hhmm(dayNoturno),
      extra: hhmm(dayExtra),
      ch: "00030",
      tratamentos,
      issues
    });
    cur.setDate(cur.getDate() + 1);
  }
  const hasBlocking = validation.some((v) => v.severity === "erro");
  return {
    days,
    totalHHMM: hhmm(totalMin),
    totalNoturnoHHMM: hhmm(totalNoturno),
    totalExtraHHMM: hhmm(totalExtra),
    validation,
    hasBlocking
  };
}
var WEEKDAYS;
var init_espelho_ponto = __esm({
  "server/lib/espelho-ponto.ts"() {
    "use strict";
    init_control_id_parsers();
    WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
  }
});

// server/lib/brt-date.ts
function brtDateKey(value) {
  if (!value) return null;
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  }
  const hasZ = /[Zz]$/.test(s);
  const off = s.match(/([+-]\d{2}):?(\d{2})$/);
  const isBRTOffset = !!off && off[1] === "-03" && off[2] === "00";
  if (hasZ || off && !isBRTOffset) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? m[1] : d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  }
  return m[1];
}
var init_brt_date = __esm({
  "server/lib/brt-date.ts"() {
    "use strict";
  }
});

// server/lib/locked-periods.ts
function isMissingTableError(message) {
  const m = String(message || "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find") || m.includes("42p01");
}
async function getLockedPeriods(deviceId) {
  const { data, error } = await supabaseAdmin.from("control_id_locked_periods").select("id, start_date, end_date, device_id, note").order("start_date", { ascending: false });
  if (error) {
    if (isMissingTableError(error.message)) {
      console.warn(`[locked-periods] tabela ainda n\xE3o existe \u2014 tratando como sem per\xEDodos fechados: ${error.message}`);
      return [];
    }
    throw new Error(`[locked-periods] FAIL-CLOSED: n\xE3o foi poss\xEDvel ler per\xEDodos fechados, abortando para n\xE3o desfazer fechamento de folha: ${error.message}`);
  }
  return (data || []).filter((r) => deviceId == null || r.device_id == null || Number(r.device_id) === Number(deviceId)).map((r) => ({
    id: Number(r.id),
    startDate: String(r.start_date).slice(0, 10),
    endDate: String(r.end_date).slice(0, 10),
    deviceId: r.device_id == null ? null : Number(r.device_id),
    note: r.note ?? null
  }));
}
function isDateLocked(punchAt, periods) {
  if (!periods.length) return false;
  const ymd = brtDateKey(punchAt);
  if (!ymd) return false;
  for (const p of periods) {
    if (ymd >= p.startDate && ymd <= p.endDate) return true;
  }
  return false;
}
var init_locked_periods = __esm({
  "server/lib/locked-periods.ts"() {
    "use strict";
    init_supabase();
    init_brt_date();
  }
});

// shared/cct-config.ts
import { z } from "zod";
function resolvePresetKeyForCargo(cargo) {
  const c = (cargo || "").toLowerCase();
  if (!c) return CCT_PRESET_VIGILANCIA;
  if (c.includes("limpeza")) return CCT_PRESET_SIEMACO;
  if (c.includes("vigilante") || c.includes("escolta") || c.includes("operador") || c.includes("operacional")) {
    return CCT_PRESET_VIGILANCIA;
  }
  return CCT_PRESET_VIGILANCIA;
}
var cestaBasicaIIFaixasSchema, cctConfigSchema, DEFAULT_CCT_CONFIG, CCT_CONFIG_SETTING_KEY, CCT_PRESET_VIGILANCIA, CCT_PRESET_SIEMACO, DEFAULT_SIEMACO_PRESET, DEFAULT_VIGILANCIA_PRESET;
var init_cct_config = __esm({
  "shared/cct-config.ts"() {
    "use strict";
    cestaBasicaIIFaixasSchema = z.object({
      semFalta: z.number().nonnegative().default(0),
      umAtestado: z.number().nonnegative().default(0),
      doisAtestados: z.number().nonnegative().default(0),
      tresOuMaisAtestados: z.number().nonnegative().default(0)
    });
    cctConfigSchema = z.object({
      label: z.string().min(1).default("CCT SP 2025/2026"),
      sindicato: z.string().default(""),
      salarioBase: z.number().nonnegative().default(2432.5),
      periculosidadePct: z.number().nonnegative().default(30),
      valeRefeicaoDia: z.number().nonnegative().default(43),
      valeAlimentacaoDia: z.number().nonnegative().default(0),
      cestaBasica: z.number().nonnegative().default(208.45),
      cestaBasicaIIFaixas: cestaBasicaIIFaixasSchema.optional(),
      escala: z.string().default(""),
      jornada: z.string().default(""),
      diasUteisMes: z.number().int().positive().default(22),
      encargosSociaisPct: z.number().nonnegative().default(80),
      horaExtraValor: z.number().nonnegative().default(22.99),
      pagamentoDiaUtil: z.number().int().positive().default(5),
      fgtsPct: z.number().nonnegative().default(8),
      inssPatronalPct: z.number().nonnegative().default(20),
      seguroVidaMensal: z.number().nonnegative().default(0)
    });
    DEFAULT_CCT_CONFIG = cctConfigSchema.parse({});
    CCT_CONFIG_SETTING_KEY = "cct_sp_config";
    CCT_PRESET_VIGILANCIA = "vigilancia";
    CCT_PRESET_SIEMACO = "siemaco";
    DEFAULT_SIEMACO_PRESET = {
      key: CCT_PRESET_SIEMACO,
      label: "CCT SIEMACO 2025/2026",
      sindicato: "SIEMACO",
      cargos: ["Auxiliar de Limpeza"],
      config: {
        label: "CCT SIEMACO 2025/2026",
        sindicato: "SIEMACO",
        salarioBase: 1837.4,
        periculosidadePct: 0,
        valeRefeicaoDia: 21.8,
        valeAlimentacaoDia: 0,
        // VA é mensal (R$ 151,91), tratado fora da fórmula diária
        cestaBasica: 0,
        // SIEMACO usa Cesta Básica II por assiduidade (faixas abaixo)
        cestaBasicaIIFaixas: {
          semFalta: 315,
          umAtestado: 240,
          doisAtestados: 140,
          tresOuMaisAtestados: 0
        },
        escala: "5x2 (segunda a sexta)",
        jornada: "Seg-Qui 07h-17h / Sex 07h-16h",
        diasUteisMes: 22,
        encargosSociaisPct: 80,
        horaExtraValor: 0,
        pagamentoDiaUtil: 5,
        fgtsPct: 8,
        inssPatronalPct: 20,
        seguroVidaMensal: 0
      }
    };
    DEFAULT_VIGILANCIA_PRESET = {
      key: CCT_PRESET_VIGILANCIA,
      label: "CCT SP Vigil\xE2ncia 2025/2026",
      sindicato: "SINDESP-SP",
      cargos: ["Vigilante", "Escolta", "Operador", "Operacional"],
      config: DEFAULT_CCT_CONFIG
    };
  }
});

// server/lib/cct-config.ts
var cct_config_exports = {};
__export(cct_config_exports, {
  ensureDefaultPresets: () => ensureDefaultPresets,
  getCctConfig: () => getCctConfig,
  getCctConfigByCargo: () => getCctConfigByCargo,
  getCctPreset: () => getCctPreset,
  getCctPresetByCargo: () => getCctPresetByCargo,
  invalidateCctConfigCache: () => invalidateCctConfigCache,
  listCctPresets: () => listCctPresets,
  saveCctConfig: () => saveCctConfig,
  savePreset: () => savePreset
});
async function loadAllPresetsRaw() {
  const out = {};
  try {
    const { data } = await supabaseAdmin.from("cct_presets").select("key, label, sindicato, cargos, config");
    for (const row of data || []) {
      try {
        const cfg = cctConfigSchema.parse({ ...DEFAULT_CCT_CONFIG, ...row.config || {} });
        out[row.key] = {
          key: row.key,
          label: row.label || cfg.label,
          sindicato: row.sindicato || cfg.sindicato || "",
          cargos: row.cargos || [],
          config: cfg
        };
      } catch (e) {
        console.error("[cct-config] preset inv\xE1lido em cct_presets, ignorando:", row.key, e);
      }
    }
  } catch (e) {
    console.error("[cct-config] erro ao ler cct_presets:", e);
  }
  if (!out[CCT_PRESET_VIGILANCIA]) {
    try {
      const { data } = await supabaseAdmin.from("system_settings").select("value").eq("key", CCT_CONFIG_SETTING_KEY).limit(1);
      if (data && data.length > 0) {
        const parsed = JSON.parse(data[0].value);
        const cfg = cctConfigSchema.parse({ ...DEFAULT_CCT_CONFIG, ...parsed });
        out[CCT_PRESET_VIGILANCIA] = {
          ...DEFAULT_VIGILANCIA_PRESET,
          config: cfg
        };
      }
    } catch (e) {
      console.error("[cct-config] erro ao ler cct_sp_config legado:", e);
    }
  }
  if (!out[CCT_PRESET_VIGILANCIA]) out[CCT_PRESET_VIGILANCIA] = DEFAULT_VIGILANCIA_PRESET;
  if (!out[CCT_PRESET_SIEMACO]) out[CCT_PRESET_SIEMACO] = DEFAULT_SIEMACO_PRESET;
  return out;
}
async function loadPresets() {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.presets;
  const presets = await loadAllPresetsRaw();
  cache = { presets, loadedAt: Date.now() };
  return presets;
}
async function listCctPresets() {
  const presets = await loadPresets();
  return Object.values(presets).sort((a, b) => a.key.localeCompare(b.key));
}
async function getCctPreset(key) {
  const presets = await loadPresets();
  return presets[key] || presets[CCT_PRESET_VIGILANCIA] || DEFAULT_VIGILANCIA_PRESET;
}
async function getCctPresetByCargo(cargo) {
  const key = resolvePresetKeyForCargo(cargo);
  return getCctPreset(key);
}
async function getCctConfig() {
  const p = await getCctPreset(CCT_PRESET_VIGILANCIA);
  return p.config;
}
async function getCctConfigByCargo(cargo) {
  const p = await getCctPresetByCargo(cargo);
  return p.config;
}
async function savePreset(input) {
  const cfg = cctConfigSchema.parse({ ...DEFAULT_CCT_CONFIG, ...input.config || {} });
  const payload = {
    key: input.key,
    label: input.label || cfg.label,
    sindicato: input.sindicato || cfg.sindicato || "",
    cargos: input.cargos || [],
    config: cfg,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const { data: existing } = await supabaseAdmin.from("cct_presets").select("id").eq("key", input.key).limit(1);
  if (!existing || existing.length === 0) {
    await supabaseAdmin.from("cct_presets").insert(payload);
  } else {
    await supabaseAdmin.from("cct_presets").update(payload).eq("key", input.key);
  }
  if (input.key === CCT_PRESET_VIGILANCIA) {
    await syncLegacyCctSettings(cfg).catch(() => {
    });
  }
  invalidateCctConfigCache();
  return { key: payload.key, label: payload.label, sindicato: payload.sindicato, cargos: payload.cargos, config: cfg };
}
async function syncLegacyCctSettings(cfg) {
  const value = JSON.stringify(cfg);
  const { data: existing } = await supabaseAdmin.from("system_settings").select("id").eq("key", CCT_CONFIG_SETTING_KEY).limit(1);
  if (!existing || existing.length === 0) {
    await supabaseAdmin.from("system_settings").insert({ key: CCT_CONFIG_SETTING_KEY, value });
  } else {
    await supabaseAdmin.from("system_settings").update({ value, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("key", CCT_CONFIG_SETTING_KEY);
  }
}
async function saveCctConfig(input) {
  const cfg = cctConfigSchema.parse({ ...DEFAULT_CCT_CONFIG, ...input });
  const preset = await savePreset({
    key: CCT_PRESET_VIGILANCIA,
    label: cfg.label,
    sindicato: cfg.sindicato || "SINDESP-SP",
    cargos: ["Vigilante", "Escolta", "Operador", "Operacional"],
    config: cfg
  });
  return preset.config;
}
async function ensureDefaultPresets() {
  try {
    const { data } = await supabaseAdmin.from("cct_presets").select("key");
    const existing = new Set((data || []).map((r) => r.key));
    if (!existing.has(CCT_PRESET_SIEMACO)) {
      await supabaseAdmin.from("cct_presets").insert({
        key: DEFAULT_SIEMACO_PRESET.key,
        label: DEFAULT_SIEMACO_PRESET.label,
        sindicato: DEFAULT_SIEMACO_PRESET.sindicato,
        cargos: DEFAULT_SIEMACO_PRESET.cargos,
        config: DEFAULT_SIEMACO_PRESET.config
      });
      console.log("[cct-config] preset SIEMACO criado (default)");
    }
    if (!existing.has(CCT_PRESET_VIGILANCIA)) {
      let cfg = DEFAULT_VIGILANCIA_PRESET.config;
      try {
        const { data: legacy } = await supabaseAdmin.from("system_settings").select("value").eq("key", CCT_CONFIG_SETTING_KEY).limit(1);
        if (legacy && legacy.length > 0) {
          const parsed = JSON.parse(legacy[0].value);
          cfg = cctConfigSchema.parse({ ...DEFAULT_CCT_CONFIG, ...parsed });
        }
      } catch {
      }
      await supabaseAdmin.from("cct_presets").insert({
        key: DEFAULT_VIGILANCIA_PRESET.key,
        label: cfg.label || DEFAULT_VIGILANCIA_PRESET.label,
        sindicato: cfg.sindicato || DEFAULT_VIGILANCIA_PRESET.sindicato,
        cargos: DEFAULT_VIGILANCIA_PRESET.cargos,
        config: cfg
      });
      console.log("[cct-config] preset Vigil\xE2ncia criado (herdado do system_settings ou default)");
    }
  } catch (e) {
    console.error("[cct-config] ensureDefaultPresets falhou:", e);
  }
}
function invalidateCctConfigCache() {
  cache = null;
}
var cache, TTL_MS;
var init_cct_config2 = __esm({
  "server/lib/cct-config.ts"() {
    "use strict";
    init_supabase();
    init_cct_config();
    cache = null;
    TTL_MS = 3e4;
  }
});

// shared/payroll-period.ts
var payroll_period_exports = {};
__export(payroll_period_exports, {
  formatPayrollPeriodWithMonthName: () => formatPayrollPeriodWithMonthName,
  getPayrollPeriod: () => getPayrollPeriod,
  getPayrollPeriodForDate: () => getPayrollPeriodForDate
});
function pad2(n) {
  return String(n).padStart(2, "0");
}
function ymdUtc(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function getPayrollPeriod(year, month) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error(`getPayrollPeriod: par\xE2metros inv\xE1lidos (year=${year}, month=${month})`);
  }
  const start = new Date(Date.UTC(year, month - 2, 26));
  const end = new Date(Date.UTC(year, month - 1, 26));
  const lastInclusive = new Date(Date.UTC(year, month - 1, 25));
  const startDate = ymdUtc(start);
  const endDate = ymdUtc(lastInclusive);
  const sMon = MESES_PT_SHORT[start.getUTCMonth()];
  const eMon = MESES_PT_SHORT[lastInclusive.getUTCMonth()];
  const labelShort = `26/${sMon} \u2192 25/${eMon}`;
  const label = `${labelShort}/${year}`;
  return { month, year, start, end, startDate, endDate, label, labelShort };
}
function getPayrollPeriodForDate(date) {
  const brt = new Date(date.getTime() - 3 * 36e5);
  const day = brt.getUTCDate();
  const y = brt.getUTCFullYear();
  const m = brt.getUTCMonth() + 1;
  if (day <= 25) return getPayrollPeriod(y, m);
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  return getPayrollPeriod(nextY, nextM);
}
function formatPayrollPeriodWithMonthName(p) {
  return `${MESES_PT_LONG[p.month - 1]}/${p.year} (${p.labelShort})`;
}
var MESES_PT_SHORT, MESES_PT_LONG;
var init_payroll_period = __esm({
  "shared/payroll-period.ts"() {
    "use strict";
    MESES_PT_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    MESES_PT_LONG = ["Janeiro", "Fevereiro", "Mar\xE7o", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  }
});

// server/auth.ts
var AUTH_CACHE_STALE_MS, requireAuth, requireAdminRole;
var init_auth = __esm({
  "server/auth.ts"() {
    "use strict";
    init_supabase();
    init_pg_fallback();
    init_storage();
    AUTH_CACHE_STALE_MS = 30 * 6e4;
    requireAuth = (req, res, next) => {
      if (!req.user) {
        if (req.supabaseUid) {
          return res.status(403).json({
            message: "Usu\xE1rio autenticado, mas n\xE3o cadastrado no sistema. Contate o administrador.",
            code: "USER_NOT_REGISTERED"
          });
        }
        return res.status(401).json({ message: "N\xE3o autorizado" });
      }
      next();
    };
    requireAdminRole = (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ message: "N\xE3o autorizado" });
      }
      if (req.user.role === "diretoria") return next();
      if (req.user.role === "admin") return next();
      return res.status(403).json({ message: "Acesso restrito a administradores" });
    };
  }
});

// server/routes/holidays.ts
var holidays_exports = {};
__export(holidays_exports, {
  countBusinessDays: () => countBusinessDays,
  invalidateHolidayCache: () => invalidateHolidayCache,
  loadHolidaySet: () => loadHolidaySet,
  monthRange: () => monthRange,
  payrollPeriodRange: () => payrollPeriodRange,
  registerHolidaysRoutes: () => registerHolidaysRoutes
});
import { z as z2 } from "zod";
function countBusinessDays(fromISO, toISO, holidaySet) {
  const from = /* @__PURE__ */ new Date(fromISO + "T00:00:00");
  const to = /* @__PURE__ */ new Date(toISO + "T00:00:00");
  if (to < from) return 0;
  let count = 0;
  const cur = new Date(from);
  while (cur <= to) {
    const dow = cur.getDay();
    const iso = cur.toISOString().slice(0, 10);
    if (dow >= 1 && dow <= 5 && !holidaySet.has(iso)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
function monthRange(year, month) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(first), to: fmt(last) };
}
function payrollPeriodRange(year, month) {
  const start = new Date(Date.UTC(year, month - 2, 26));
  const end = new Date(Date.UTC(year, month - 1, 25));
  const fmt = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { from: fmt(start), to: fmt(end) };
}
function invalidateHolidayCache() {
  holidayCache.clear();
}
async function loadHolidaySet(fromISO, toISO) {
  const key = `${fromISO || ""}|${toISO || ""}`;
  const hit = holidayCache.get(key);
  if (hit && Date.now() - hit.loadedAt < HOLIDAY_CACHE_TTL_MS) {
    return hit.set;
  }
  let q = supabaseAdmin.from("holidays").select("date");
  if (fromISO) q = q.gte("date", fromISO);
  if (toISO) q = q.lte("date", toISO);
  const { data } = await q;
  const set = new Set((data || []).map((h) => String(h.date).slice(0, 10)));
  holidayCache.set(key, { set, loadedAt: Date.now() });
  return set;
}
function registerHolidaysRoutes(app) {
  app.get("/api/holidays", requireAuth, async (req, res) => {
    const year = req.query.year ? Number(req.query.year) : null;
    let q = supabaseAdmin.from("holidays").select("*").order("date", { ascending: true });
    if (year) q = q.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
    const { data, error } = await q;
    if (error) return res.status(500).json({ message: error.message });
    res.json(data || []);
  });
  app.post("/api/holidays", requireAuth, requireAdminRole, async (req, res) => {
    const parsed = insertSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inv\xE1lidos", errors: parsed.error.errors });
    const { data, error } = await supabaseAdmin.from("holidays").insert({ date: parsed.data.date, name: parsed.data.name, national: parsed.data.national ?? true }).select().single();
    if (error) return res.status(500).json({ message: error.message });
    invalidateHolidayCache();
    res.status(201).json(data);
  });
  app.delete("/api/holidays/:id", requireAuth, requireAdminRole, async (req, res) => {
    const { error } = await supabaseAdmin.from("holidays").delete().eq("id", Number(req.params.id));
    if (error) return res.status(500).json({ message: error.message });
    invalidateHolidayCache();
    res.json({ ok: true });
  });
}
var HOLIDAY_CACHE_TTL_MS, holidayCache, insertSchema;
var init_holidays = __esm({
  "server/routes/holidays.ts"() {
    "use strict";
    init_supabase();
    init_auth();
    HOLIDAY_CACHE_TTL_MS = 5 * 60 * 1e3;
    holidayCache = /* @__PURE__ */ new Map();
    insertSchema = z2.object({
      date: z2.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      name: z2.string().min(1),
      national: z2.boolean().optional().default(true)
    });
  }
});

// server/control-id.ts
var control_id_exports = {};
__export(control_id_exports, {
  RhidUnsupportedError: () => RhidUnsupportedError,
  autoImportPersons: () => autoImportPersons,
  buildEspelhoRhid: () => buildEspelhoRhid,
  buildFolhaPonto: () => buildFolhaPonto,
  buildFolhaStats: () => buildFolhaStats,
  buildPainelMes: () => buildPainelMes,
  buildSyncDiagnostic: () => buildSyncDiagnostic,
  createManualPunch: () => createManualPunch,
  createRhidPerson: () => createRhidPerson,
  createRhidPunch: () => createRhidPunch,
  decryptSecret: () => decryptSecret,
  deleteLocalPunch: () => deleteLocalPunch,
  deleteRhidPunch: () => deleteRhidPunch,
  encryptSecret: () => encryptSecret,
  enqueueRhidSync: () => enqueueRhidSync,
  fetchAllEvents: () => fetchAllEvents,
  fetchEvents: () => fetchEvents,
  fetchUsers: () => fetchUsers,
  getDeviceSyncProgress: () => getDeviceSyncProgress,
  loginDevice: () => loginDevice,
  monthToFechamento: () => monthToFechamento,
  processRhidSyncQueue: () => processRhidSyncQueue,
  registerEmployeeInRhid: () => registerEmployeeInRhid,
  syncAllDevices: () => syncAllDevices,
  syncDevice: () => syncDevice,
  syncEmployeeStatusToRhid: () => syncEmployeeStatusToRhid,
  testConnection: () => testConnection,
  updateLocalPunch: () => updateLocalPunch,
  updateRhidPerson: () => updateRhidPerson,
  updateRhidPunch: () => updateRhidPunch
});
async function tryFetch(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs || 15e3);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
function joinUrl(base, path3) {
  return `${String(base).replace(/\/+$/, "")}${path3.startsWith("/") ? path3 : `/${path3}`}`;
}
async function loginDevice(device) {
  const password = decryptSecret(device.password_enc);
  if (device.tipo === "rhid_cloud") {
    return loginRhidCloud(device, password);
  }
  const candidates = [
    { url: joinUrl(device.base_url, "/login"), parse: (j) => j?.session || j?.token || j?.access_token },
    { url: joinUrl(device.base_url, "/api/login"), parse: (j) => j?.token || j?.access_token || j?.session },
    { url: joinUrl(device.base_url, "/api/auth/login"), parse: (j) => j?.token || j?.access_token }
  ];
  let lastErr = "";
  for (const c of candidates) {
    try {
      const r = await tryFetch(c.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: device.login, password, username: device.login })
      });
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        const token = c.parse(j);
        if (token) {
          const expires = new Date(Date.now() + 12 * 60 * 60 * 1e3).toISOString();
          await supabaseAdmin.from("control_id_devices").update({
            session_token: token,
            session_expires: expires
          }).eq("id", device.id);
          return token;
        }
        lastErr = `Endpoint ${c.url} respondeu OK mas sem token`;
      } else {
        lastErr = `${c.url} \u2192 HTTP ${r.status}`;
      }
    } catch (err) {
      lastErr = `${c.url} \u2192 ${err.message}`;
    }
  }
  throw new Error(`Falha no login Control iD: ${lastErr}`);
}
async function loginRhidCloud(device, password) {
  const url = joinUrl(device.base_url, "/login.svc/");
  const r = await tryFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: device.login, password }),
    timeoutMs: 2e4
  });
  if (!r.ok) throw new Error(`RHID login falhou: HTTP ${r.status}`);
  const j = await r.json().catch(() => ({}));
  const token = j?.accessToken || j?.access_token || j?.token || "";
  if (!token) throw new Error("RHID login: resposta sem accessToken");
  const expires = new Date(Date.now() + 12 * 60 * 60 * 1e3).toISOString();
  await supabaseAdmin.from("control_id_devices").update({
    session_token: token,
    session_expires: expires
  }).eq("id", device.id);
  console.log(`[RHID] Login OK para ${device.login}`);
  return token;
}
async function getOrLoginToken(device) {
  if (device.session_token && device.session_expires) {
    const expires = new Date(device.session_expires).getTime();
    if (expires > Date.now() + 6e4) return device.session_token;
  }
  return loginDevice(device);
}
async function postJson(device, token, path3, body) {
  const url = joinUrl(device.base_url, path3);
  let r = await tryFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Session": token, "Authorization": `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  if (r.status === 401 || r.status === 403) {
    const newToken = await loginDevice(device);
    r = await tryFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Session": newToken, "Authorization": `Bearer ${newToken}` },
      body: JSON.stringify(body)
    });
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`POST ${path3} \u2192 HTTP ${r.status} ${txt.slice(0, 200)}`);
  }
  return r.json();
}
async function fetchEvents(device, since) {
  if (device.tipo === "rhid_cloud") {
    return fetchEventsRhid(device, since);
  }
  const token = await getOrLoginToken(device);
  const sinceIso = since ? since.toISOString() : new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString();
  const sinceUnix = Math.floor(new Date(sinceIso).getTime() / 1e3);
  try {
    const j = await postJson(device, token, "/load_objects", {
      object: "access_logs",
      where: { time: { ">=": sinceUnix } },
      order: { time: "asc" },
      limit: 500
    });
    const list = j?.access_logs || j?.events || j?.objects || [];
    if (Array.isArray(list)) return list.map(normalizeEvent);
  } catch {
  }
  try {
    const url = joinUrl(device.base_url, `/api/events?from=${encodeURIComponent(sinceIso)}&limit=500`);
    const r = await tryFetch(url, { headers: { "Authorization": `Bearer ${token}`, "Session": token } });
    if (r.ok) {
      const j = await r.json();
      const list = j?.events || j?.data || j || [];
      if (Array.isArray(list)) return list.map(normalizeEvent);
    }
  } catch {
  }
  try {
    const url = joinUrl(device.base_url, `/api/access_logs?since=${encodeURIComponent(sinceIso)}&limit=500`);
    const r = await tryFetch(url, { headers: { "Authorization": `Bearer ${token}`, "Session": token } });
    if (r.ok) {
      const j = await r.json();
      const list = j?.access_logs || j?.data || j || [];
      if (Array.isArray(list)) return list.map(normalizeEvent);
    }
  } catch {
  }
  return [];
}
async function fetchEventsRhid(device, since) {
  const afdUrl = joinUrl(device.base_url, "/customerdb/afd.svc/a");
  const token = await getOrLoginToken(device);
  let afdRes = await tryFetch(afdUrl, {
    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
    timeoutMs: 6e4
  });
  if (!afdRes.ok) {
    const newToken = await loginDevice(device);
    afdRes = await tryFetch(afdUrl, {
      headers: { "Authorization": `Bearer ${newToken}`, "Accept": "application/json" },
      timeoutMs: 6e4
    });
  }
  if (!afdRes.ok) {
    const body = await afdRes.text().catch(() => "");
    throw new Error(`RHID AFD falhou: HTTP ${afdRes.status} ${body.slice(0, 200)}`);
  }
  const afdData = await afdRes.json();
  return parseRhidAfdRecords(afdData, since);
}
async function fetchAllEvents(device) {
  if (device.tipo === "rhid_cloud") {
    return fetchEventsRhid(device, /* @__PURE__ */ new Date(0));
  }
  return fetchEvents(device, /* @__PURE__ */ new Date(0));
}
async function fetchUsers(device) {
  if (device.tipo === "rhid_cloud") {
    return fetchUsersRhid(device);
  }
  const token = await getOrLoginToken(device);
  try {
    const j = await postJson(device, token, "/load_objects", { object: "users", limit: 1e3 });
    const list = j?.users || j?.objects || [];
    if (Array.isArray(list)) {
      return list.map((u) => ({
        id: String(u.id ?? u.user_id ?? u.userId),
        name: String(u.name || u.nome || u.user_name || ""),
        matricula: u.matricula || u.registration || u.pis || void 0
      }));
    }
  } catch {
  }
  return [];
}
async function fetchUsersRhid(device) {
  const token = await getOrLoginToken(device);
  const PAGE = 100;
  let curToken = token;
  const persons = [];
  for (let start = 0, page = 0; page < 200; start += PAGE, page++) {
    const personUrl = joinUrl(device.base_url, `/api.svc/person?start=${start}&length=${PAGE}`);
    let personRes = await tryFetch(personUrl, {
      headers: { "Authorization": `Bearer ${curToken}`, "Accept": "application/json" },
      timeoutMs: 2e4
    });
    if (personRes.status === 401 || personRes.status === 403) {
      curToken = await loginDevice(device);
      personRes = await tryFetch(personUrl, {
        headers: { "Authorization": `Bearer ${curToken}`, "Accept": "application/json" },
        timeoutMs: 2e4
      });
    }
    if (!personRes.ok) throw new Error(`RHID persons falhou: HTTP ${personRes.status}`);
    const personData = await personRes.json();
    const batch = Array.isArray(personData) ? personData : personData?.records || personData?.data || [];
    if (batch.length === 0) break;
    persons.push(...batch);
    if (batch.length < PAGE) break;
  }
  return persons.map((p) => ({
    id: String(p.id || p.Id || p.PersonId || ""),
    name: String(p.name || p.Name || p.PersonName || ""),
    matricula: p.registration || p.Registration || p.pis || p.Pis || void 0,
    cpf: p.cpf != null ? String(p.cpf).replace(/\D/g, "") : void 0
  }));
}
async function createRhidPerson(deviceId, fields) {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} n\xE3o encontrado`);
  if (device.tipo !== "rhid_cloud") throw new Error("Cria\xE7\xE3o de pessoa suportada apenas em RHID Cloud");
  const token = await getOrLoginToken(device);
  const url = joinUrl(device.base_url, "/api.svc/person");
  const fullPayload = {
    name: fields.name,
    cpf: fields.cpf,
    pis: fields.pis,
    // OBRIGATÓRIO e único no RHID
    registration: fields.registration,
    idCompany: fields.idCompany ?? 1,
    // Torres: empresa #1
    idDepartment: fields.idDepartment ?? 5,
    // Torres: depto TORRES ESCOLTA (id=5)
    status: fields.status ?? 1,
    // 1 = ativo
    isAdmin: fields.isAdmin ?? false,
    getTemplates: fields.getTemplates ?? false,
    numberOfTemplates: fields.numberOfTemplates ?? 0,
    code: fields.code ?? 0,
    password: fields.password ?? 0,
    rfid: fields.rfid ?? 0,
    barCode: fields.barCode ?? 0,
    linkedDeviceIds: fields.linkedDeviceIds ?? [],
    templates: fields.templates ?? []
  };
  const body = JSON.stringify([fullPayload]);
  let curToken = token;
  let r = await tryFetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${curToken}`, "Content-Type": "application/json", "Accept": "application/json" },
    body,
    timeoutMs: 2e4
  });
  if (r.status === 401 || r.status === 403) {
    curToken = await loginDevice(device);
    r = await tryFetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${curToken}`, "Content-Type": "application/json", "Accept": "application/json" },
      body,
      timeoutMs: 2e4
    });
  }
  if (!r.ok) {
    const txt = (await r.text().catch(() => "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    throw new Error(`RHID POST person falhou: HTTP ${r.status} ${txt}`);
  }
  const json = await r.json().catch(() => ({}));
  if (Array.isArray(json?.errors) && json.errors.length > 0) {
    const e0 = json.errors[0];
    throw new Error(`RHID rejeitou pessoa: ${e0?.reason || JSON.stringify(e0)}`);
  }
  const created = Array.isArray(json?.success) && json.success.length > 0 ? json.success[0] : null;
  if (created && (created.id ?? created.Id)) {
    console.log(`[RHID] POST person OK id=${created.id ?? created.Id}`);
    return created;
  }
  if (json?.id ?? json?.Id) return json;
  console.warn(`[RHID] POST person sem id no retorno: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}
async function updateRhidPerson(deviceId, personId, fields) {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} n\xE3o encontrado`);
  const token = await getOrLoginToken(device);
  const url = joinUrl(device.base_url, "/api.svc/person");
  const getR = await tryFetch(joinUrl(device.base_url, `/api.svc/person/${personId}`), {
    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
    timeoutMs: 1e4
  });
  const current = getR.ok ? await getR.json().catch(() => ({})) : {};
  const payload = { ...current, ...fields, id: Number(personId) };
  const r = await tryFetch(url, {
    method: "PUT",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: 15e3
  });
  if (!r.ok) {
    const txt = (await r.text().catch(() => "")).slice(0, 200);
    throw new Error(`RHID PUT person falhou: HTTP ${r.status} ${txt}`);
  }
  console.log(`[RHID] PUT person id=${personId} OK`);
}
async function syncEmployeeStatusToRhid(employeeId, ourStatus) {
  try {
    const { data: mappings } = await supabaseAdmin.from("control_id_users_map").select("*").eq("employee_id", employeeId).eq("ativo", true).order("id", { ascending: false }).limit(1);
    if (!mappings || mappings.length === 0) return;
    const map = mappings[0];
    const rhidStatus = ourStatus === "ativo" ? 1 : 0;
    await updateRhidPerson(Number(map.device_id), map.control_id_user_id, { status: rhidStatus });
    console.log(`[RHID] Funcion\xE1rio #${employeeId} status sincronizado: ${ourStatus} \u2192 rhid status=${rhidStatus}`);
  } catch (e) {
    console.warn(`[RHID] Falha ao sincronizar status do funcion\xE1rio #${employeeId}:`, e.message);
  }
}
async function registerEmployeeInRhid(employeeId, deviceId) {
  const { data: emp } = await supabaseAdmin.from("employees").select("id, name, cpf, pis, matricula, status").eq("id", employeeId).maybeSingle();
  if (!emp) throw new Error(`Funcion\xE1rio #${employeeId} n\xE3o encontrado`);
  if (!emp.cpf) throw new Error("Funcion\xE1rio sem CPF cadastrado");
  if (!emp.name) throw new Error("Funcion\xE1rio sem nome cadastrado");
  const cpfDigits = String(emp.cpf).replace(/\D/g, "");
  if (cpfDigits.length !== 11) throw new Error("CPF inv\xE1lido");
  const pisDigits = String(emp.pis || "").replace(/\D/g, "");
  if (pisDigits.length !== 11) {
    throw new Error("Funcion\xE1rio sem PIS v\xE1lido. Cadastre o PIS (11 d\xEDgitos) antes de registrar no Control iD.");
  }
  let device = null;
  if (deviceId) {
    const { data } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
    device = data;
  } else {
    const { data } = await supabaseAdmin.from("control_id_devices").select("*").eq("tipo", "rhid_cloud").order("id").limit(1).maybeSingle();
    device = data;
  }
  if (!device) throw new Error("Nenhum aparelho Control iD configurado");
  const targetDeviceId = Number(device.id);
  const { data: existingMap } = await supabaseAdmin.from("control_id_users_map").select("*").eq("device_id", targetDeviceId).eq("employee_id", employeeId).eq("ativo", true).order("id", { ascending: false }).limit(1).maybeSingle();
  if (existingMap) {
    return {
      status: "already_mapped",
      rhidPersonId: String(existingMap.control_id_user_id),
      deviceId: targetDeviceId,
      mappingId: Number(existingMap.id),
      punchesBackfilled: 0
    };
  }
  const persons = await fetchUsers(device);
  const existingPerson = persons.find((p) => p.cpf && p.cpf === cpfDigits);
  let rhidPersonId;
  let status;
  if (existingPerson) {
    rhidPersonId = String(existingPerson.id);
    status = "linked_existing";
    if (existingPerson.status === 0 || existingPerson.status === false) {
      try {
        await updateRhidPerson(targetDeviceId, rhidPersonId, { status: 1 });
        console.log(`[RHID] Pessoa id=${rhidPersonId} reativada automaticamente`);
      } catch (e) {
        console.warn(`[RHID] N\xE3o foi poss\xEDvel reativar pessoa id=${rhidPersonId}:`, e);
      }
    }
  } else {
    const created = await createRhidPerson(targetDeviceId, {
      name: emp.name,
      cpf: Number(cpfDigits),
      pis: Number(pisDigits),
      registration: emp.matricula || String(employeeId)
    });
    const newId = created?.id ?? created?.Id ?? created?.PersonId;
    if (!newId) {
      const refetched = await fetchUsers(device);
      const found = refetched.find((p) => p.cpf && p.cpf === cpfDigits);
      if (!found) throw new Error("Pessoa criada no RHID mas id n\xE3o retornado");
      rhidPersonId = String(found.id);
    } else {
      rhidPersonId = String(newId);
    }
    status = "created";
  }
  const { data: mapping, error: mapErr } = await supabaseAdmin.from("control_id_users_map").insert({
    device_id: targetDeviceId,
    employee_id: employeeId,
    control_id_user_id: rhidPersonId,
    control_id_user_name: emp.name,
    matricula: emp.matricula || null,
    ativo: true
  }).select().single();
  if (mapErr) throw new Error(`Erro ao salvar mapping: ${mapErr.message}`);
  const { data: backfilled } = await supabaseAdmin.from("control_id_punches").update({ employee_id: employeeId }).eq("device_id", targetDeviceId).eq("control_id_user_id", rhidPersonId).is("employee_id", null).select("id");
  return {
    status,
    rhidPersonId,
    deviceId: targetDeviceId,
    mappingId: Number(mapping.id),
    punchesBackfilled: (backfilled || []).length
  };
}
async function testConnection(device) {
  try {
    await loginDevice(device);
    const users = await fetchUsers(device).catch(() => []);
    return { ok: true, message: `Conex\xE3o OK. ${users.length} usu\xE1rio(s) encontrados no aparelho.`, details: { totalUsers: users.length } };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}
async function syncDevice(deviceId, opts = {}) {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} n\xE3o encontrado`);
  if (!device.ativo && !opts.fullBackfill) return { fetched: 0, saved: 0, mapped: 0, skipped: 0, message: "Device inativo" };
  let since = null;
  if (!opts.fullBackfill) {
    if (device.last_sync_at) since = new Date(device.last_sync_at);
    const { data: lastPunch } = await supabaseAdmin.from("control_id_punches").select("punch_at").eq("device_id", deviceId).order("punch_at", { ascending: false }).limit(1).maybeSingle();
    if (lastPunch?.punch_at) since = new Date(lastPunch.punch_at);
    if (since) since = new Date(since.getTime() - 6 * 60 * 60 * 1e3);
  } else {
    since = /* @__PURE__ */ new Date(0);
  }
  let events = [];
  try {
    events = opts.fullBackfill ? await fetchAllEvents(device) : await fetchEvents(device, since);
  } catch (err) {
    await supabaseAdmin.from("control_id_devices").update({
      last_sync_at: (/* @__PURE__ */ new Date()).toISOString(),
      last_sync_status: "erro",
      last_sync_message: err.message
    }).eq("id", deviceId);
    throw err;
  }
  if (events.length === 0) {
    await supabaseAdmin.from("control_id_devices").update({
      last_sync_at: (/* @__PURE__ */ new Date()).toISOString(),
      last_sync_status: "ok",
      last_sync_message: "Nenhuma batida nova"
    }).eq("id", deviceId);
    return { fetched: 0, saved: 0, mapped: 0, skipped: 0, message: "Nenhuma batida nova" };
  }
  const { data: mappings } = await supabaseAdmin.from("control_id_users_map").select("control_id_user_id, employee_id").eq("device_id", deviceId).eq("ativo", true);
  const mapByUserId = /* @__PURE__ */ new Map();
  (mappings || []).forEach((m) => mapByUserId.set(String(m.control_id_user_id), Number(m.employee_id)));
  const externalIds = events.map((e) => e.id);
  const { data: existing } = await supabaseAdmin.from("control_id_punches").select("external_id").eq("device_id", deviceId).in("external_id", externalIds);
  const existingSet = new Set((existing || []).map((e) => String(e.external_id)));
  const eventCores = Array.from(new Set(
    events.map((e) => rhidNumericCore(e.id)).filter((x) => !!x)
  ));
  const localByCore = /* @__PURE__ */ new Map();
  if (eventCores.length) {
    const CORE_CHUNK = 500;
    for (let i = 0; i < eventCores.length; i += CORE_CHUNK) {
      const chunk = eventCores.slice(i, i + CORE_CHUNK);
      const { data: localNum } = await supabaseAdmin.from("control_id_punches").select("id, external_id, employee_id").eq("device_id", deviceId).in("external_id", chunk);
      for (const l of localNum || []) {
        localByCore.set(String(l.external_id), {
          id: Number(l.id),
          externalId: String(l.external_id),
          employeeId: l.employee_id != null ? String(l.employee_id) : null
        });
      }
    }
  }
  const mappedEmpIds = Array.from(new Set(
    events.map((e) => mapByUserId.get(e.userId)).filter((x) => !!x)
  ));
  const localMinuteByEmp = /* @__PURE__ */ new Map();
  if (mappedEmpIds.length) {
    const times = events.map((e) => new Date(e.time).getTime()).filter((t) => t > 0);
    const minTs = Math.min(...times), maxTs = Math.max(...times);
    const { data: locals } = await supabaseAdmin.from("control_id_punches").select("id, employee_id, punch_at, external_id").in("employee_id", mappedEmpIds).gte("punch_at", new Date(minTs - 6e4).toISOString()).lte("punch_at", new Date(maxTs + 6e4).toISOString());
    for (const l of locals || []) {
      if (l.employee_id == null) continue;
      const emp = Number(l.employee_id);
      const m = localMinuteByEmp.get(emp) || /* @__PURE__ */ new Map();
      const mk = minuteKeyBRT2(new Date(l.punch_at));
      if (!m.has(mk)) m.set(mk, { id: Number(l.id), externalId: l.external_id ?? null });
      localMinuteByEmp.set(emp, m);
    }
  }
  const lockedPeriods = await getLockedPeriods(deviceId);
  let saved = 0, mapped = 0, skipped = 0, skippedLocked = 0;
  const toInsert = [];
  const extIdAdoptions = [];
  const seenInBatch = /* @__PURE__ */ new Set();
  for (const ev of events) {
    if (seenInBatch.has(ev.id)) {
      skipped++;
      continue;
    }
    seenInBatch.add(ev.id);
    if (isDateLocked(ev.time, lockedPeriods)) {
      skipped++;
      skippedLocked++;
      continue;
    }
    const employeeId = mapByUserId.get(ev.userId) || null;
    const externalIdExists = existingSet.has(ev.id);
    const core = rhidNumericCore(ev.id);
    if (core) {
      const idHit = localByCore.get(core);
      const sameEmployee = employeeId != null && idHit?.employeeId != null && String(idHit.employeeId) === String(employeeId);
      if (idHit && idHit.id > 0 && idHit.externalId === core && !externalIdExists && sameEmployee) {
        extIdAdoptions.push({ id: idHit.id, external_id: ev.id });
        idHit.externalId = ev.id;
        skipped++;
        continue;
      }
    }
    if (employeeId) {
      const mk = minuteKeyBRT2(new Date(ev.time));
      const m = localMinuteByEmp.get(employeeId);
      const hit = m?.get(mk);
      const decision = decideImport({
        externalIdExists,
        localExternalIdAtMinute: hit ? hit.externalId : void 0,
        eventExternalId: ev.id
      });
      if (decision === "skip") {
        skipped++;
        continue;
      }
      if (decision === "adopt-external-id") {
        if (hit && hit.id > 0) {
          extIdAdoptions.push({ id: hit.id, external_id: ev.id });
          hit.externalId = ev.id;
        }
        skipped++;
        continue;
      }
      if (m) m.set(mk, { id: -1, externalId: ev.id });
      else localMinuteByEmp.set(employeeId, /* @__PURE__ */ new Map([[mk, { id: -1, externalId: ev.id }]]));
    } else if (externalIdExists) {
      skipped++;
      continue;
    }
    if (employeeId) mapped++;
    toInsert.push({
      device_id: deviceId,
      control_id_user_id: ev.userId,
      employee_id: employeeId,
      punch_at: ev.time,
      direction: ev.direction || "unknown",
      source: ev.source || null,
      raw_event: ev.raw,
      external_id: ev.id,
      processed: false
    });
    saved++;
  }
  if (toInsert.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin.from("control_id_punches").upsert(chunk, { onConflict: "device_id,external_id", ignoreDuplicates: true });
      if (error) throw new Error(`Erro ao salvar batidas (lote ${i / CHUNK + 1}): ${error.message}`);
    }
  }
  if (extIdAdoptions.length > 0) {
    for (const a of extIdAdoptions) {
      const { error } = await supabaseAdmin.from("control_id_punches").update({ external_id: a.external_id }).eq("id", a.id);
      if (error) console.warn(`[ControlID] Falha ao adotar external_id em punch #${a.id}: ${error.message}`);
    }
    console.log(`[ControlID] ${extIdAdoptions.length} batida(s) local(is) adotaram o external_id can\xF4nico do AFD.`);
  }
  await supabaseAdmin.from("control_id_devices").update({
    last_sync_at: (/* @__PURE__ */ new Date()).toISOString(),
    last_sync_status: "ok",
    last_sync_message: `${saved} nova(s), ${mapped} mapeada(s), ${skipped} duplicada(s)${skippedLocked ? `, ${skippedLocked} em per\xEDodo fechado` : ""}`
  }).eq("id", deviceId);
  console.log(`[ControlID] Sync device #${deviceId}: ${events.length} eventos, ${saved} novos, ${mapped} mapeados${skippedLocked ? `, ${skippedLocked} ignorados (per\xEDodo fechado por folha)` : ""}`);
  return { fetched: events.length, saved, mapped, skipped, message: `${saved} batida(s) nova(s)` };
}
async function buildSyncDiagnostic() {
  const { data: emps } = await supabaseAdmin.from("employees").select("id, name, role").eq("status", "ativo").order("name");
  const empIds = (emps || []).map((e) => e.id);
  const { data: maps } = await supabaseAdmin.from("control_id_users_map").select("employee_id, control_id_user_id, device_id, ativo").in("employee_id", empIds);
  const mappedEmpIds = new Set((maps || []).filter((m) => m.ativo).map((m) => m.employee_id));
  const unmappedEmployees = (emps || []).filter((e) => !mappedEmpIds.has(e.id));
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 36e5).toISOString();
  const { data: orphans } = await supabaseAdmin.from("control_id_punches").select("control_id_user_id, device_id, punch_at").is("employee_id", null).gte("punch_at", sevenDaysAgo).order("punch_at", { ascending: false });
  const orphanByUser = /* @__PURE__ */ new Map();
  for (const p of orphans || []) {
    const key = `${p.device_id}::${p.control_id_user_id}`;
    const cur = orphanByUser.get(key);
    if (!cur) {
      orphanByUser.set(key, { controlIdUserId: p.control_id_user_id, deviceId: p.device_id, count: 1, lastPunchAt: p.punch_at });
    } else {
      cur.count++;
      if (p.punch_at > cur.lastPunchAt) cur.lastPunchAt = p.punch_at;
    }
  }
  const { data: devices } = await supabaseAdmin.from("control_id_devices").select("*").eq("ativo", true);
  const personsByDevice = /* @__PURE__ */ new Map();
  for (const dev of devices || []) {
    try {
      const persons = await fetchUsers(dev);
      const m = /* @__PURE__ */ new Map();
      persons.forEach((p) => m.set(String(p.id), p.name));
      personsByDevice.set(dev.id, m);
    } catch {
      personsByDevice.set(dev.id, /* @__PURE__ */ new Map());
    }
  }
  const orphanList = Array.from(orphanByUser.values()).map((o) => ({
    controlIdUserId: o.controlIdUserId,
    deviceId: o.deviceId,
    rhidName: personsByDevice.get(o.deviceId)?.get(o.controlIdUserId) || null,
    punchCount: o.count,
    lastPunchAt: o.lastPunchAt
  })).sort((a, b) => b.punchCount - a.punchCount);
  const deviceStatusPromises = (devices || []).map(async (d) => {
    const { data: lastP } = await supabaseAdmin.from("control_id_punches").select("punch_at").eq("device_id", d.id).order("punch_at", { ascending: false }).limit(1).maybeSingle();
    return {
      id: d.id,
      nome: d.nome,
      tipo: d.tipo,
      lastSyncAt: d.last_sync_at,
      lastSyncStatus: d.last_sync_status,
      lastSyncMessage: d.last_sync_message,
      lastEventAt: lastP?.punch_at || null
    };
  });
  const deviceStatus = await Promise.all(deviceStatusPromises);
  return {
    unmappedEmployees: unmappedEmployees.map((e) => ({ id: e.id, name: e.name, role: e.role })),
    orphanPunches: orphanList,
    orphanTotal: orphanList.reduce((a, b) => a + b.punchCount, 0),
    devices: deviceStatus,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function autoImportPersons(deviceId) {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} n\xE3o encontrado`);
  const persons = await fetchUsers(device);
  console.log(`[ControlID] Auto-import: ${persons.length} pessoas no aparelho`);
  const { data: employees } = await supabaseAdmin.from("employees").select("id, name").in("status", ["ativo", "active"]);
  const localList = employees || [];
  const { data: existingMappings } = await supabaseAdmin.from("control_id_users_map").select("control_id_user_id").eq("device_id", deviceId).eq("ativo", true);
  const mappedIds = new Set((existingMappings || []).map((m) => String(m.control_id_user_id)));
  const matched = [];
  const unmatched = [];
  let alreadyMapped = 0;
  const toInsert = [];
  for (const p of persons) {
    if (mappedIds.has(p.id)) {
      alreadyMapped++;
      continue;
    }
    let bestEmp = null;
    let bestScore = 0;
    for (const emp of localList) {
      const s = nameMatchScore(p.name, emp.name);
      if (s > bestScore) {
        bestScore = s;
        bestEmp = emp;
      }
    }
    if (bestEmp && bestScore >= 0.5) {
      toInsert.push({
        device_id: deviceId,
        employee_id: bestEmp.id,
        control_id_user_id: p.id,
        control_id_user_name: p.name,
        matricula: p.matricula || null,
        ativo: true
      });
      matched.push({ rhidId: p.id, rhidName: p.name, employeeId: bestEmp.id, employeeName: bestEmp.name, score: Number(bestScore.toFixed(2)) });
    } else {
      unmatched.push({ rhidId: p.id, rhidName: p.name });
    }
  }
  if (toInsert.length > 0) {
    const { error } = await supabaseAdmin.from("control_id_users_map").insert(toInsert);
    if (error) throw new Error(`Erro ao salvar mappings: ${error.message}`);
    for (const m of toInsert) {
      await supabaseAdmin.from("control_id_punches").update({ employee_id: m.employee_id }).eq("device_id", deviceId).eq("control_id_user_id", m.control_id_user_id).is("employee_id", null);
    }
  }
  return { created: toInsert.length, alreadyMapped, matched, unmatched };
}
async function createManualPunch(params) {
  const { employeeId, punchAt, direction = "unknown", source = "manual" } = params;
  let mapping = null;
  if (params.deviceId) {
    const { data } = await supabaseAdmin.from("control_id_users_map").select("*").eq("employee_id", employeeId).eq("device_id", params.deviceId).eq("ativo", true).maybeSingle();
    mapping = data;
  } else {
    const { data } = await supabaseAdmin.from("control_id_users_map").select("*").eq("employee_id", employeeId).eq("ativo", true).limit(1).maybeSingle();
    mapping = data;
  }
  const { data: punch, error } = await supabaseAdmin.from("control_id_punches").insert({
    device_id: mapping?.device_id || null,
    control_id_user_id: mapping?.control_id_user_id || null,
    employee_id: employeeId,
    punch_at: punchAt.toISOString(),
    direction,
    source,
    is_manual: true,
    external_id: null,
    rhid_synced_at: null,
    rhid_sync_error: mapping ? null : "Funcion\xE1rio n\xE3o mapeado a nenhum aparelho",
    raw_event: { manual: true, createdBy: "system" }
  }).select("id").single();
  if (error) throw new Error(`Erro ao salvar batida local: ${error.message}`);
  let rhidSynced = false;
  let rhidError;
  if (mapping) {
    const r = await enqueueRhidSync({
      kind: "punch",
      op: "create",
      refId: punch.id,
      employeeId,
      deviceId: Number(mapping.device_id),
      payload: {
        rhidPersonId: String(mapping.control_id_user_id),
        dateTime: punchAt.toISOString(),
        tipo: 3
      }
    });
    rhidSynced = r.pushedNow;
    rhidError = r.pushError;
  } else {
    rhidError = "Funcion\xE1rio n\xE3o mapeado a nenhum aparelho";
  }
  return { punchId: punch.id, rhidSynced, rhidError };
}
async function updateLocalPunch(punchId, fields) {
  const { data: punch } = await supabaseAdmin.from("control_id_punches").select("*").eq("id", punchId).maybeSingle();
  if (!punch) throw new Error("Batida n\xE3o encontrada");
  const upd = {};
  if (fields.punchAt) upd.punch_at = fields.punchAt.toISOString();
  if (fields.direction !== void 0) upd.direction = fields.direction;
  const { error } = await supabaseAdmin.from("control_id_punches").update(upd).eq("id", punchId);
  if (error) throw new Error(error.message);
  let rhidSynced = false;
  let rhidError;
  if (punch.external_id && punch.device_id) {
    const r = await enqueueRhidSync({
      kind: "punch",
      op: "update",
      refId: punchId,
      employeeId: punch.employee_id,
      deviceId: Number(punch.device_id),
      payload: {
        externalId: String(punch.external_id),
        dateTime: (fields.punchAt || new Date(punch.punch_at)).toISOString()
      }
    });
    rhidSynced = r.pushedNow;
    rhidError = r.pushError;
  }
  return { ok: true, rhidSynced, rhidError };
}
async function deleteLocalPunch(punchId) {
  const { data: punch } = await supabaseAdmin.from("control_id_punches").select("*").eq("id", punchId).maybeSingle();
  let rhidQueued = false;
  if (punch?.external_id && punch?.device_id) {
    const r = await enqueueRhidSync({
      kind: "punch",
      op: "delete",
      refId: punchId,
      employeeId: punch.employee_id,
      deviceId: Number(punch.device_id),
      payload: { externalId: String(punch.external_id) },
      tryNow: false
    });
    if (!r.queueId) {
      throw new Error("N\xE3o foi poss\xEDvel enfileirar exclus\xE3o no RHID \u2014 batida local preservada");
    }
    rhidQueued = true;
  }
  const { error } = await supabaseAdmin.from("control_id_punches").delete().eq("id", punchId);
  if (error) throw new Error(error.message);
  return { ok: true, rhidQueued };
}
async function createRhidPunch(deviceId, rhidPersonId, dateTime, tipo = 3) {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} n\xE3o encontrado`);
  if (device.tipo !== "rhid_cloud") throw new Error("Create punch suportado apenas em RHID Cloud");
  const token = await getOrLoginToken(device);
  const url = joinUrl(device.base_url, `/customerdb/afd.svc/a`);
  const body = {
    idPerson: Number(rhidPersonId),
    dateTime: `/Date(${dateTime.getTime()}-0300)/`,
    Tipo: tipo,
    approvalStatus: 2
  };
  let r = await tryFetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 2e4
  });
  if (r.status === 401 || r.status === 403) {
    const newToken = await loginDevice(device);
    r = await tryFetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${newToken}`, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 2e4
    });
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`RHID POST punch falhou: HTTP ${r.status} ${txt.slice(0, 200)}`);
  }
  return await r.json().catch(() => ({}));
}
async function updateRhidPunch(deviceId, rhidPunchId, fields) {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} n\xE3o encontrado`);
  if (device.tipo !== "rhid_cloud") throw new Error("Update punch suportado apenas em RHID Cloud");
  const token = await getOrLoginToken(device);
  const url = joinUrl(device.base_url, `/customerdb/afd.svc/${rhidPunchId}`);
  const body = { ...fields };
  if (fields.dateTime instanceof Date) {
    body.dateTime = `/Date(${fields.dateTime.getTime()}-0300)/`;
  }
  let r = await tryFetch(url, {
    method: "PUT",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 2e4
  });
  if (r.status === 401 || r.status === 403) {
    const newToken = await loginDevice(device);
    r = await tryFetch(url, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${newToken}`, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 2e4
    });
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`RHID PUT punch falhou: HTTP ${r.status} ${txt.slice(0, 200)}`);
  }
  return await r.json().catch(() => ({}));
}
async function getDeviceSyncProgress(deviceId) {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} n\xE3o encontrado`);
  let rhidTotal = 0, rhidEmployees = 0;
  let rhidLastPunchAt = null;
  try {
    const events = await fetchAllEvents(device);
    rhidTotal = events.length;
    if (events.length > 0) {
      rhidLastPunchAt = events.reduce((m, e) => e.time > m ? e.time : m, events[0].time);
    }
    const persons = await fetchUsers(device);
    rhidEmployees = persons.length;
  } catch (e) {
    console.error(`[ControlID] getDeviceSyncProgress fetch failed:`, e.message);
  }
  const { count: localTotal } = await supabaseAdmin.from("control_id_punches").select("*", { count: "exact", head: true }).eq("device_id", deviceId);
  const { data: lastLocal } = await supabaseAdmin.from("control_id_punches").select("punch_at").eq("device_id", deviceId).order("punch_at", { ascending: false }).limit(1).maybeSingle();
  const { count: mappedEmployees } = await supabaseAdmin.from("control_id_users_map").select("*", { count: "exact", head: true }).eq("device_id", deviceId).eq("ativo", true);
  const total = Number(localTotal || 0);
  const missing = Math.max(0, rhidTotal - total);
  const percent = rhidTotal > 0 ? Math.min(100, Math.round(total / rhidTotal * 100)) : 100;
  const isRunning = device.last_sync_status === "sincronizando";
  return {
    deviceId: device.id,
    deviceName: device.nome,
    rhidTotal,
    localTotal: total,
    missing,
    percent,
    rhidEmployees,
    mappedEmployees: Number(mappedEmployees || 0),
    unmappedEmployees: Math.max(0, rhidEmployees - Number(mappedEmployees || 0)),
    lastSyncAt: device.last_sync_at,
    lastSyncStatus: device.last_sync_status,
    lastSyncMessage: device.last_sync_message,
    isRunning,
    rhidLastPunchAt,
    localLastPunchAt: lastLocal?.punch_at || null
  };
}
async function syncAllDevices() {
  const { data: devices } = await supabaseAdmin.from("control_id_devices").select("id").eq("ativo", true);
  if (!devices || devices.length === 0) return { devices: 0, totalSaved: 0 };
  let totalSaved = 0;
  for (const d of devices) {
    try {
      const r = await syncDevice(Number(d.id));
      totalSaved += r.saved;
    } catch (err) {
      console.error(`[ControlID] Sync device #${d.id} falhou:`, err.message);
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  return { devices: devices.length, totalSaved };
}
async function buildFolhaStats(employeeId, monthYear, opts = {}) {
  const multiplicadorHE = opts.multiplicadorHE ?? 1.6;
  const [yyyy, mm] = monthYear.split("-").map(Number);
  const monthEndStr = new Date(Date.UTC(yyyy, mm, 0)).toISOString().slice(0, 10);
  const { data: salaryRows } = await supabaseAdmin.from("employee_salaries").select("base_salary, horas_mensais, encargos_pct, periculosidade_pct, vale_refeicao_diario, cesta_basica, effective_date").eq("employee_id", employeeId).lte("effective_date", monthEndStr).order("effective_date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1);
  const horasMensaisPonto = salaryRows && salaryRows[0] && salaryRows[0].horas_mensais ? Number(salaryRows[0].horas_mensais) : 220;
  const dias = await buildFolhaPonto(employeeId, monthYear, { horasMensais: horasMensaisPonto });
  const hoursWorked = dias.reduce((s, d) => s + (Number(d.workedMin) || 0), 0) / 60;
  const daysWorked = dias.filter((d) => Number(d.hoursWorked) > 0).length;
  const horasNoturnas = dias.reduce((s, d) => s + (Number(d.noturnoMin) || 0), 0) / 60;
  const empRow = opts.employee ? [{ role: opts.employee.role, tipo_contratacao: opts.employee.tipo_contratacao }] : (await supabaseAdmin.from("employees").select("role, tipo_contratacao").eq("id", employeeId).limit(1)).data;
  const empRole = empRow && empRow[0] && empRow[0].role || "";
  const isClt = !empRow || !empRow[0] || empRow[0].tipo_contratacao !== "fixo";
  const { getCctConfigByCargo: getCctConfigByCargo2 } = await Promise.resolve().then(() => (init_cct_config2(), cct_config_exports));
  const CCT = await getCctConfigByCargo2(empRole);
  const sal = salaryRows && salaryRows[0];
  const baseSalary = sal ? Number(sal.base_salary) || 0 : 0;
  const hoursLimit = sal && sal.horas_mensais ? Number(sal.horas_mensais) : 220;
  const encargosPct = sal && sal.encargos_pct != null ? Number(sal.encargos_pct) : 80;
  const periculosidadePct = sal && sal.periculosidade_pct != null ? Number(sal.periculosidade_pct) : CCT.periculosidadePct;
  const vrDiario = sal && sal.vale_refeicao_diario != null ? Number(sal.vale_refeicao_diario) : CCT.valeRefeicaoDia;
  let cestaBasica = sal && sal.cesta_basica != null ? Number(sal.cesta_basica) : CCT.cestaBasica;
  let cestaBasicaIIAtestados = 0;
  let cestaBasicaIIFaixa = null;
  const faixas = CCT.cestaBasicaIIFaixas;
  if (faixas) {
    try {
      const { getPayrollPeriod: getPayrollPeriod2 } = await Promise.resolve().then(() => (init_payroll_period(), payroll_period_exports));
      const periodAbs = getPayrollPeriod2(yyyy, mm);
      const { data: absRows } = await supabaseAdmin.from("employee_absences").select("id, type, start_date, end_date, status").eq("employee_id", employeeId).eq("status", "aprovado").gte("start_date", `${periodAbs.startDate}T00:00:00`).lte("start_date", `${periodAbs.endDate}T23:59:59`);
      const qualificados = (absRows || []).filter((a) => {
        const t = String(a.type || "").toLowerCase();
        return t.includes("atestado") || t.includes("afasta") || t.includes("justif");
      });
      cestaBasicaIIAtestados = qualificados.length;
      if (cestaBasicaIIAtestados >= 3) {
        cestaBasica = faixas.tresOuMaisAtestados;
        cestaBasicaIIFaixa = "3+ atestados";
      } else if (cestaBasicaIIAtestados === 2) {
        cestaBasica = faixas.doisAtestados;
        cestaBasicaIIFaixa = "2 atestados";
      } else if (cestaBasicaIIAtestados === 1) {
        cestaBasica = faixas.umAtestado;
        cestaBasicaIIFaixa = "1 atestado";
      } else {
        cestaBasica = faixas.semFalta;
        cestaBasicaIIFaixa = "sem falta";
      }
    } catch (e) {
      console.error("[calcularFolha] erro ao calcular Cesta B\xE1sica II:", e?.message);
    }
  }
  const { countBusinessDays: countBusinessDays2, loadHolidaySet: loadHolidaySet2, payrollPeriodRange: payrollPeriodRange2 } = await Promise.resolve().then(() => (init_holidays(), holidays_exports));
  const { from, to } = payrollPeriodRange2(yyyy, mm);
  const holidaySet = await loadHolidaySet2(from, to);
  const nowBrt = new Date((/* @__PURE__ */ new Date()).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const periodStartBrt = /* @__PURE__ */ new Date(`${from}T00:00:00-03:00`);
  const periodEndBrt = /* @__PURE__ */ new Date(`${to}T23:59:59-03:00`);
  const isMesFuturo = nowBrt.getTime() < periodStartBrt.getTime();
  const isMesCorrente = !isMesFuturo && nowBrt.getTime() <= periodEndBrt.getTime();
  const msPerDay = 24 * 3600 * 1e3;
  const totalDiasMes = Math.round(
    (periodEndBrt.getTime() - periodStartBrt.getTime()) / msPerDay
  ) + 1;
  let diasCorridosElapsed;
  let cutoffIso;
  if (isMesFuturo) {
    diasCorridosElapsed = 0;
    cutoffIso = from;
  } else if (isMesCorrente) {
    diasCorridosElapsed = Math.min(
      totalDiasMes,
      Math.floor((nowBrt.getTime() - periodStartBrt.getTime()) / msPerDay) + 1
    );
    const cutoffDate = new Date(periodStartBrt.getTime() + (diasCorridosElapsed - 1) * msPerDay);
    const cy = cutoffDate.getFullYear();
    const cm = String(cutoffDate.getMonth() + 1).padStart(2, "0");
    const cd = String(cutoffDate.getDate()).padStart(2, "0");
    cutoffIso = `${cy}-${cm}-${cd}`;
  } else {
    diasCorridosElapsed = totalDiasMes;
    cutoffIso = to;
  }
  const diasUteisTotal = countBusinessDays2(from, to, holidaySet);
  const diasUteis = isMesCorrente ? countBusinessDays2(from, cutoffIso, holidaySet) : isMesFuturo ? 0 : diasUteisTotal;
  const fatorRateio = totalDiasMes > 0 ? diasCorridosElapsed / totalDiasMes : 0;
  const horasNormais = Math.min(hoursWorked, hoursLimit);
  const horaExtra = Math.max(0, hoursWorked - hoursLimit);
  const fatorPericVH = 1 + (periculosidadePct || 0) / 100;
  const valorHora = hoursLimit > 0 ? baseSalary * fatorPericVH / hoursLimit : 0;
  const valorHoraExtra = Math.round(valorHora * 100) / 100 * multiplicadorHE;
  const multiplicadorAdicNot = CCT.multiplicadorAdicNot ?? 1.8;
  const adicionalNoturno = +(valorHora * multiplicadorAdicNot * horasNoturnas).toFixed(2);
  const baseSalaryReal = +(baseSalary * fatorRateio).toFixed(2);
  const periculosidade = +(baseSalaryReal * (periculosidadePct / 100)).toFixed(2);
  const custoExtra = +(valorHoraExtra * horaExtra).toFixed(2);
  const valeRefeicao = +(vrDiario * diasUteis).toFixed(2);
  const cestaBasicaReal = +(cestaBasica * fatorRateio).toFixed(2);
  let diarias = 0;
  try {
    const cutoffStr = isMesCorrente || isMesFuturo ? cutoffIso : to;
    const { data: diariaRows } = await supabaseAdmin.from("operational_payments").select("amount").eq("employee_id", employeeId).eq("type", "diaria").gte("payment_date", from).lte("payment_date", cutoffStr);
    if (Array.isArray(diariaRows)) {
      diarias = diariaRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    }
  } catch {
  }
  diarias = +diarias.toFixed(2);
  const vencimentosTotal = +(baseSalaryReal + periculosidade + custoExtra + adicionalNoturno).toFixed(2);
  const beneficiosTotal = +(valeRefeicao + diarias + cestaBasicaReal).toFixed(2);
  const baseRecolhimentos = baseSalaryReal + periculosidade + custoExtra + adicionalNoturno;
  const fgtsPct = isClt ? CCT.fgtsPct ?? 8 : 0;
  const inssPatronalPct = isClt ? CCT.inssPatronalPct ?? 20 : 0;
  const seguroVidaMensal = isClt ? CCT.seguroVidaMensal ?? 0 : 0;
  const fgts = +(baseRecolhimentos * (fgtsPct / 100)).toFixed(2);
  const inssPatronal = +(baseRecolhimentos * (inssPatronalPct / 100)).toFixed(2);
  const seguroVida = +(Number(seguroVidaMensal) * fatorRateio).toFixed(2);
  const recolhimentosTotal = +(fgts + inssPatronal + seguroVida).toFixed(2);
  const custoTotalEstimado = +(vencimentosTotal + beneficiosTotal).toFixed(2);
  const custoBase = baseSalaryReal;
  const encargosPctEfetivo = isClt ? encargosPct : 0;
  const custoComEncargos = +((custoBase + periculosidade + custoExtra + adicionalNoturno) * (1 + encargosPctEfetivo / 100) + beneficiosTotal).toFixed(2);
  let faturamentoBruto = 0;
  let faturamentoEmpregado = 0;
  let faturamentoOsCount = 0;
  let faturamentoMargem = 0;
  try {
    const monthStartIso = `${monthYear}-01T00:00:00-03:00`;
    const lastDayCap = isMesCorrente && !isMesFuturo ? String(nowBrt.getDate()).padStart(2, "0") : String(new Date(yyyy, mm, 0).getDate()).padStart(2, "0");
    const monthEndIso = `${monthYear}-${lastDayCap}T23:59:59-03:00`;
    const { data: osRows } = await supabaseAdmin.from("service_orders").select("id, status, assigned_employee_id, assigned_employee_2_id").or(`assigned_employee_id.eq.${employeeId},assigned_employee_2_id.eq.${employeeId}`).gte("scheduled_date", monthStartIso).lte("scheduled_date", monthEndIso).not("status", "eq", "recusada");
    const osIds = (osRows || []).map((o) => o.id);
    if (osIds.length > 0) {
      const { data: billRows } = await supabaseAdmin.from("escort_billings").select("service_order_id, fat_total, resultado_liquido").in("service_order_id", osIds);
      for (const b of billRows || []) {
        const os = (osRows || []).find((o) => o.id === b.service_order_id);
        const hasDoubleAgent = os && os.assigned_employee_id && os.assigned_employee_2_id;
        const share = hasDoubleAgent ? 0.5 : 1;
        const total = Number(b.fat_total || 0);
        const liquido = Number(b.resultado_liquido || 0);
        if (total > 0) {
          faturamentoBruto += total;
          faturamentoEmpregado += total * share;
          faturamentoMargem += liquido * share;
          faturamentoOsCount += 1;
        }
      }
    }
  } catch (err) {
    console.error("[buildFolhaStats] erro ao calcular faturamento:", err);
  }
  faturamentoBruto = +faturamentoBruto.toFixed(2);
  faturamentoEmpregado = +faturamentoEmpregado.toFixed(2);
  faturamentoMargem = +faturamentoMargem.toFixed(2);
  const baseTributavelFunc = vencimentosTotal;
  const inssFuncionario = isClt ? +(baseTributavelFunc * 0.12).toFixed(2) : 0;
  const irrfFuncionario = isClt ? +(baseTributavelFunc * 0.22).toFixed(2) : 0;
  const fgtsFuncionario = fgts;
  const liquidoFuncionario = +(baseTributavelFunc - inssFuncionario - irrfFuncionario).toFixed(2);
  return {
    employeeId,
    monthYear,
    hoursWorked: +hoursWorked.toFixed(2),
    hoursLimit,
    horasNormais: +horasNormais.toFixed(2),
    horaExtra: +horaExtra.toFixed(2),
    horasRestantes: +Math.max(0, hoursLimit - hoursWorked).toFixed(2),
    percentUsed: hoursLimit > 0 ? +(hoursWorked / hoursLimit * 100).toFixed(1) : 0,
    daysWorked,
    baseSalary: baseSalaryReal,
    baseSalaryMensal: baseSalary,
    valorHora: +valorHora.toFixed(2),
    valorHoraExtra: +valorHoraExtra.toFixed(2),
    custoExtra,
    custoBase: +custoBase.toFixed(2),
    // Adicional noturno (22h–05h) — hora cheia 1,80× (modelo Torres)
    horasNoturnas: +horasNoturnas.toFixed(2),
    adicionalNoturno,
    multiplicadorAdicNot,
    // Novos componentes detalhados (ratados quando mês corrente)
    periculosidade,
    periculosidadePct,
    valeRefeicao,
    vrDiario,
    diasUteis,
    diasUteisTotal,
    diasCorridosElapsed,
    totalDiasMes,
    fatorRateio: +fatorRateio.toFixed(4),
    isMesCorrente,
    diarias,
    cestaBasica: cestaBasicaReal,
    cestaBasicaMensal: cestaBasica,
    cestaBasicaIIAtestados,
    cestaBasicaIIFaixa,
    cestaBasicaIIAplicada: !!faixas,
    vencimentosTotal,
    beneficiosTotal,
    // Recolhimentos detalhados
    fgts,
    fgtsPct,
    inssPatronal,
    inssPatronalPct,
    seguroVida,
    recolhimentosTotal,
    // Deduções do FUNCIONÁRIO (modelo Torres — exibição; NÃO entram no custo empresa)
    baseTributavelFuncionario: +baseTributavelFunc.toFixed(2),
    inssFuncionario,
    irrfFuncionario,
    fgtsFuncionario,
    liquidoFuncionario,
    encargosPct: encargosPctEfetivo,
    isClt,
    custoComEncargos,
    custoTotalEstimado,
    // Faturamento atribuído ao funcionário no mês
    faturamentoBruto,
    faturamentoEmpregado,
    faturamentoMargem,
    faturamentoOsCount,
    hasSalary: !!sal
  };
}
async function buildEspelhoRhid(employeeId, fromYmd, toYmd) {
  const start = /* @__PURE__ */ new Date(fromYmd + "T00:00:00-03:00");
  const end = /* @__PURE__ */ new Date(toYmd + "T00:00:00-03:00");
  end.setHours(end.getHours() + 18 + 24);
  const { data: empData } = await supabaseAdmin.from("employees").select("id, name, matricula, cpf, pis, role, hire_date, address, sindicato, category").eq("id", employeeId).maybeSingle();
  const employee = empData || {};
  const { data: punchesRaw } = await supabaseAdmin.from("control_id_punches").select("id, punch_at, direction, source, control_id_user_id, external_id").eq("employee_id", employeeId).gte("punch_at", start.toISOString()).lte("punch_at", end.toISOString()).order("punch_at", { ascending: true });
  const punches = dedupPunchesByCore(punchesRaw || []);
  const { data: salRows } = await supabaseAdmin.from("employee_salaries").select("horas_mensais, effective_date").eq("employee_id", employeeId).lte("effective_date", toYmd).order("effective_date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1);
  const horasMensais = salRows && salRows[0] && salRows[0].horas_mensais ? Number(salRows[0].horas_mensais) : 220;
  const jornadaDiariaMin = horasMensais * 60 / 25;
  const espelho = buildEspelhoPonto(punches || [], fromYmd, toYmd, jornadaDiariaMin);
  const days = espelho.days.map((d) => ({
    date: d.date,
    label: d.label,
    weekday: d.weekday,
    marcacoes: d.marcacoes,
    jornada: d.jornada,
    duracao: d.duracao,
    noturno: d.noturno,
    extra: d.extra,
    ch: d.ch,
    tratamentos: d.tratamentos,
    issues: d.issues
  }));
  const totalHHMM = espelho.totalHHMM;
  return {
    company: {
      name: "TORRES VIGILANCIA PATRIMONIAL LTDA",
      cnpj: "36.982.392/0001-89",
      cei: "",
      endereco: "AV RAIMUNDO PEREIRA DE MAGALH\xC3ES, 5720 - PIRITUBA - 02939000 - S\xC3O PAULO - SP"
    },
    employee: {
      id: employee.id,
      name: (employee.name || "").toUpperCase(),
      matricula: employee.matricula || "",
      cpf: employee.cpf || "",
      pis: employee.pis || employee.cpf || "",
      role: (employee.role || "").toUpperCase(),
      admissao: employee.hire_date ? (/* @__PURE__ */ new Date(employee.hire_date + "T12:00:00")).toLocaleDateString("pt-BR") : "",
      centroCusto: (employee.category || "").toUpperCase() || "\u2014",
      departamento: "TORRES"
    },
    periodo: { from: fromYmd, to: toYmd },
    days,
    totalHHMM,
    totalNoturnoHHMM: espelho.totalNoturnoHHMM,
    totalExtraHHMM: espelho.totalExtraHHMM,
    validation: espelho.validation,
    hasBlocking: espelho.hasBlocking,
    horariosContratuais: [
      { codigo: "00030", ent1: "04:00", sai1: "23:59", ent2: "", sai2: "" }
    ],
    emitidoEm: (/* @__PURE__ */ new Date()).toLocaleString("pt-BR")
  };
}
async function buildPainelMes(monthYear) {
  const { start: monthStart, end: monthEnd } = monthToFechamento(monthYear);
  const todayBrt = new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10);
  const todayMs = Date.now();
  const isCurrentMonth = todayMs >= monthStart.getTime() && todayMs < monthEnd.getTime();
  const { data: emps } = await supabaseAdmin.from("employees").select("id, name, role, status").ilike("role", "%vigilante%").order("name", { ascending: true });
  if (!emps || emps.length === 0) return [];
  const empIds = emps.map((e) => e.id);
  const { data: maps } = await supabaseAdmin.from("control_id_users_map").select("employee_id, ativo").in("employee_id", empIds);
  const mappedSet = new Set((maps || []).filter((m) => m.ativo).map((m) => m.employee_id));
  const { data: punches } = await supabaseAdmin.from("control_id_punches").select("employee_id, punch_at, source, device_id").in("employee_id", empIds).gte("punch_at", monthStart.toISOString()).lt("punch_at", monthEnd.toISOString()).order("punch_at", { ascending: true });
  const byEmp = /* @__PURE__ */ new Map();
  for (const p of punches || []) {
    if (!byEmp.has(p.employee_id)) byEmp.set(p.employee_id, []);
    byEmp.get(p.employee_id).push(p);
  }
  const { data: absences } = await supabaseAdmin.from("employee_absences").select("employee_id, type, start_date, end_date").in("employee_id", empIds).lte("start_date", monthEnd.toISOString().slice(0, 10)).gte("end_date", monthStart.toISOString().slice(0, 10));
  const absByEmp = /* @__PURE__ */ new Map();
  for (const a of absences || []) {
    if (!absByEmp.has(a.employee_id)) absByEmp.set(a.employee_id, []);
    absByEmp.get(a.employee_id).push(a);
  }
  const todayStartIso = `${todayBrt}T00:00:00-03:00`;
  const todayEndIso = `${todayBrt}T23:59:59-03:00`;
  const dutyByEmp = /* @__PURE__ */ new Map();
  if (isCurrentMonth) {
    const [todayRes, openRes] = await Promise.all([
      supabaseAdmin.from("service_orders").select("id, os_number, status, mission_status, scheduled_date, assigned_employee_id, assigned_employee_2_id").gte("scheduled_date", todayStartIso).lte("scheduled_date", todayEndIso).order("scheduled_date", { ascending: true }),
      supabaseAdmin.from("service_orders").select("id, os_number, status, mission_status, scheduled_date, assigned_employee_id, assigned_employee_2_id").eq("status", "em_andamento").order("scheduled_date", { ascending: true })
    ]);
    const seenIds = /* @__PURE__ */ new Set();
    const todaySos = [];
    for (const so of [...todayRes.data || [], ...openRes.data || []]) {
      if (seenIds.has(so.id)) continue;
      seenIds.add(so.id);
      todaySos.push(so);
    }
    todaySos.sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());
    {
      const partnerIds = /* @__PURE__ */ new Set();
      for (const so of todaySos || []) {
        if (so.assigned_employee_id) partnerIds.add(so.assigned_employee_id);
        if (so.assigned_employee_2_id) partnerIds.add(so.assigned_employee_2_id);
      }
      const { data: partnerEmps } = partnerIds.size > 0 ? await supabaseAdmin.from("employees").select("id, name").in("id", Array.from(partnerIds)) : { data: [] };
      const empNameById = /* @__PURE__ */ new Map();
      for (const p of partnerEmps || []) empNameById.set(p.id, p.name);
      for (const so of todaySos || []) {
        const a = so.assigned_employee_id;
        const b = so.assigned_employee_2_id;
        if (a && !dutyByEmp.has(a)) {
          dutyByEmp.set(a, {
            osNumber: so.os_number || null,
            status: so.status || null,
            missionStatus: so.mission_status || null,
            scheduledDate: so.scheduled_date || null,
            partnerId: b || null,
            partnerName: b ? empNameById.get(b) || null : null
          });
        }
        if (b && !dutyByEmp.has(b)) {
          dutyByEmp.set(b, {
            osNumber: so.os_number || null,
            status: so.status || null,
            missionStatus: so.mission_status || null,
            scheduledDate: so.scheduled_date || null,
            partnerId: a || null,
            partnerName: a ? empNameById.get(a) || null : null
          });
        }
      }
    }
  }
  const HOURS_LIMIT = 220;
  const OPEN_PUNCH_MIN_GAP_MIN = 30;
  const result = [];
  for (const e of emps) {
    const list = (byEmp.get(e.id) || []).sort((a, b) => new Date(a.punch_at).getTime() - new Date(b.punch_at).getTime());
    const calc = computeWorkedHours(list);
    const totalMin = calc.totalMinutes;
    const daysWorked = calc.daysWorked;
    const dayMap = /* @__PURE__ */ new Map();
    for (const p of list) {
      const dayKey = ymdBRT(p.punch_at);
      if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
      dayMap.get(dayKey).push(p);
    }
    const todayPunches = isCurrentMonth ? dayMap.get(todayBrt) || [] : [];
    const lastPunch = list.length > 0 ? list[list.length - 1] : null;
    const penultPunch = list.length > 1 ? list[list.length - 2] : null;
    const lastPunchAt = lastPunch?.punch_at || null;
    const penultPunchAt = penultPunch?.punch_at || null;
    const punchOrigin = (p) => {
      if (!p) return null;
      if (p.source === "manual") return "APP";
      if (p.device_id) return "CONTROLID";
      return null;
    };
    const lastPunchOrigin = punchOrigin(lastPunch);
    const lastPunchSource = lastPunch?.source || null;
    const penultPunchOrigin = punchOrigin(penultPunch);
    const penultPunchSource = penultPunch?.source || null;
    const absToday = isCurrentMonth ? (absByEmp.get(e.id) || []).find((a) => a.start_date <= todayBrt && a.end_date >= todayBrt) : null;
    const yesterdayBrt = new Date(Date.now() - 3 * 36e5 - 24 * 36e5).toISOString().slice(0, 10);
    const yesterdayPunches = isCurrentMonth ? dayMap.get(yesterdayBrt) || [] : [];
    const SHIFT_CROSS_MAX_GAP_MIN = 5 * 60;
    let yesterdayOpen = yesterdayPunches.length > 0 && yesterdayPunches.length % 2 === 1;
    if (yesterdayOpen && todayPunches.length > 0) {
      const lastYestMs = new Date(yesterdayPunches[yesterdayPunches.length - 1].punch_at).getTime();
      const firstTodayMs = new Date(todayPunches[0].punch_at).getTime();
      const gapMin = (firstTodayMs - lastYestMs) / 6e4;
      if (gapMin > SHIFT_CROSS_MAX_GAP_MIN) yesterdayOpen = false;
    }
    let todayStatus;
    let openSinceMinutes = null;
    if (!isCurrentMonth) {
      todayStatus = "MES_PASSADO";
    } else if (!mappedSet.has(e.id)) {
      todayStatus = "NAO_MAPEADO";
    } else if (absToday) {
      todayStatus = "AUSENCIA";
    } else if (todayPunches.length === 0 && yesterdayOpen) {
      todayStatus = "EM_ABERTO";
      const lastMs = new Date(yesterdayPunches[yesterdayPunches.length - 1].punch_at).getTime();
      openSinceMinutes = Math.round((Date.now() - lastMs) / 6e4);
    } else if (todayPunches.length === 0) {
      todayStatus = "NAO_BATEU";
    } else if (todayPunches.length === 1) {
      const lastMs = new Date(todayPunches[0].punch_at).getTime();
      const gap = (Date.now() - lastMs) / 6e4;
      if (yesterdayOpen) {
        todayStatus = "COMPLETO";
      } else if (gap > OPEN_PUNCH_MIN_GAP_MIN) {
        todayStatus = "EM_ABERTO";
        openSinceMinutes = Math.round(gap);
      } else {
        todayStatus = "EM_ANDAMENTO";
      }
    } else if (todayPunches.length % 2 === 1) {
      if (yesterdayOpen) {
        todayStatus = "COMPLETO";
      } else {
        todayStatus = "EM_ABERTO";
        const lastMs = new Date(todayPunches[todayPunches.length - 1].punch_at).getTime();
        openSinceMinutes = Math.round((Date.now() - lastMs) / 6e4);
      }
    } else {
      if (yesterdayOpen) {
        todayStatus = "EM_ABERTO";
        const lastMs = new Date(todayPunches[todayPunches.length - 1].punch_at).getTime();
        openSinceMinutes = Math.round((Date.now() - lastMs) / 6e4);
      } else {
        todayStatus = "COMPLETO";
      }
    }
    const hoursWorked = +(totalMin / 60).toFixed(2);
    const duty = dutyByEmp.get(e.id) || null;
    let unifiedStatus = todayStatus;
    let pontoConflict = null;
    const dutyIsActive = !!duty && duty.status !== "concluida" && duty.status !== "cancelada" && duty.status !== "recusada";
    if (dutyIsActive && todayStatus !== "AUSENCIA") {
      unifiedStatus = "TRABALHANDO";
      if (todayStatus === "COMPLETO") pontoConflict = "PONTO_FECHADO";
      else if (todayStatus === "NAO_BATEU") pontoConflict = "SEM_BATIDA";
    }
    result.push({
      employeeId: e.id,
      name: e.name,
      role: e.role,
      status: e.status,
      mapped: mappedSet.has(e.id),
      hoursWorked,
      hoursLimit: HOURS_LIMIT,
      hoursRemaining: +(HOURS_LIMIT - hoursWorked).toFixed(2),
      percentUsed: +(hoursWorked / HOURS_LIMIT * 100).toFixed(1),
      daysWorked,
      todayStatus,
      unifiedStatus,
      pontoConflict,
      todayPunchCount: todayPunches.length,
      openSinceMinutes,
      lastPunchAt,
      lastPunchSource,
      lastPunchOrigin,
      penultPunchAt,
      penultPunchSource,
      penultPunchOrigin,
      absenceType: absToday ? absToday.type : null,
      onDutyToday: !!duty,
      dutyOsNumber: duty?.osNumber || null,
      dutyStatus: duty?.status || null,
      dutyMissionStatus: duty?.missionStatus || null,
      dutyScheduledAt: duty?.scheduledDate || null,
      partnerId: duty?.partnerId || null,
      partnerName: duty?.partnerName || null
    });
  }
  return result;
}
function nightMinutesBRT2(startMs, endMs) {
  if (!(endMs > startMs)) return 0;
  let count = 0;
  for (let t = startMs; t < endMs; t += 6e4) {
    const h = Number(new Date(t).toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
    if (h >= 22 || h < 5) count++;
  }
  return count;
}
async function buildFolhaPonto(employeeId, monthYear, opts = {}) {
  const { start, end } = monthToFechamento(monthYear);
  const { data: punchesRaw } = await supabaseAdmin.from("control_id_punches").select("id, punch_at, direction, source, control_id_user_id, external_id").eq("employee_id", employeeId).gte("punch_at", start.toISOString()).lt("punch_at", end.toISOString()).order("punch_at", { ascending: true });
  if (!punchesRaw || punchesRaw.length === 0) return [];
  const punches = dedupPunchesByCore(punchesRaw);
  let horasMensais;
  if (opts.horasMensais != null) {
    horasMensais = opts.horasMensais;
  } else {
    const [yyyyJ, mmJ] = monthYear.split("-").map(Number);
    const monthEndStrJ = new Date(Date.UTC(yyyyJ, mmJ, 0)).toISOString().slice(0, 10);
    const { data: salRows } = await supabaseAdmin.from("employee_salaries").select("horas_mensais, effective_date").eq("employee_id", employeeId).lte("effective_date", monthEndStrJ).order("effective_date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1);
    horasMensais = salRows && salRows[0] && salRows[0].horas_mensais ? Number(salRows[0].horas_mensais) : 220;
  }
  const jornadaDiariaMin = horasMensais * 60 / 25;
  const NORMAL_DAILY_CAP_MIN = 1199;
  const dayMap = /* @__PURE__ */ new Map();
  for (const p of punches) {
    const dt = new Date(p.punch_at);
    const dayKey = new Date(dt.getTime() - 3 * 36e5).toISOString().slice(0, 10);
    if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
    dayMap.get(dayKey).push(p);
  }
  const result = [];
  for (const [day, dayPunches] of Array.from(dayMap.entries())) {
    const sorted = dayPunches.sort((a, b) => new Date(a.punch_at).getTime() - new Date(b.punch_at).getTime());
    const fmt = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    const entry = {
      date: day,
      clockIn: sorted[0] ? fmt(sorted[0].punch_at) : null,
      lunchOut: sorted.length >= 4 ? fmt(sorted[1].punch_at) : null,
      lunchIn: sorted.length >= 4 ? fmt(sorted[2].punch_at) : null,
      clockOut: sorted.length >= 2 ? fmt(sorted[sorted.length - 1].punch_at) : null,
      totalPunches: sorted.length,
      sources: Array.from(new Set(sorted.map((p) => p.source).filter(Boolean))),
      punches: sorted.map((p) => ({
        id: p.id,
        punchAt: p.punch_at,
        time: fmt(p.punch_at),
        direction: p.direction,
        source: p.source
      }))
    };
    if (entry.clockIn && entry.clockOut) {
      const inMs = new Date(sorted[0].punch_at).getTime();
      const outMs = new Date(sorted[sorted.length - 1].punch_at).getTime();
      let workedMin = (outMs - inMs) / 6e4;
      if (entry.lunchOut && entry.lunchIn && sorted.length >= 4) {
        const lunchMin = (new Date(sorted[2].punch_at).getTime() - new Date(sorted[1].punch_at).getTime()) / 6e4;
        workedMin -= lunchMin;
      }
      workedMin = Math.min(workedMin, NORMAL_DAILY_CAP_MIN);
      entry.hoursWorked = (workedMin / 60).toFixed(2);
      entry.workedMin = Math.round(workedMin);
      entry.normaisMin = Math.min(Math.round(workedMin), NORMAL_DAILY_CAP_MIN);
      const extraMin = Math.max(0, workedMin - jornadaDiariaMin);
      entry.extraMin = Math.round(extraMin);
      entry.jornadaDiariaMin = Math.round(jornadaDiariaMin);
      let noturnoMin = nightMinutesBRT2(inMs, outMs);
      if (entry.lunchOut && entry.lunchIn && sorted.length >= 4) {
        noturnoMin -= nightMinutesBRT2(
          new Date(sorted[1].punch_at).getTime(),
          new Date(sorted[2].punch_at).getTime()
        );
      }
      entry.noturnoMin = Math.max(0, Math.round(noturnoMin));
    } else {
      entry.workedMin = 0;
      entry.normaisMin = 0;
      entry.extraMin = 0;
      entry.jornadaDiariaMin = Math.round(jornadaDiariaMin);
      entry.noturnoMin = 0;
    }
    result.push(entry);
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
function backoffMinutes(attempt) {
  const steps = [1, 5, 15, 60, 240, 720, 720, 720];
  return steps[Math.min(attempt, steps.length - 1)];
}
async function enqueueRhidSync(params) {
  const initialStatus = params.kind === "absence" ? "unsupported" : params.initialStatus ?? "pending";
  const { data: row, error } = await supabaseAdmin.from("rhid_sync_queue").insert({
    kind: params.kind,
    op: params.op,
    ref_id: params.refId != null ? Number(params.refId) : null,
    employee_id: params.employeeId ?? null,
    device_id: params.deviceId ?? null,
    payload: params.payload ?? {},
    status: initialStatus,
    attempts: 0,
    next_attempt_at: (/* @__PURE__ */ new Date()).toISOString()
  }).select("id").single();
  if (error) {
    console.error("[RHID-Q] Falha ao enfileirar:", error.message);
    return { queueId: 0, pushedNow: false, pushError: error.message };
  }
  const queueId = Number(row.id);
  if (initialStatus === "pending" && params.tryNow !== false) {
    try {
      await processRhidQueueItem(queueId);
      return { queueId, pushedNow: true };
    } catch (e) {
      return { queueId, pushedNow: false, pushError: e?.message };
    }
  }
  return { queueId, pushedNow: false };
}
async function processRhidQueueItem(queueId) {
  const { data: claimed } = await supabaseAdmin.from("rhid_sync_queue").update({ status: "processing" }).eq("id", queueId).eq("status", "pending").select("*").maybeSingle();
  if (!claimed) return;
  try {
    const response = await executeRhidPush(claimed);
    await supabaseAdmin.from("rhid_sync_queue").update({
      status: "done",
      processed_at: (/* @__PURE__ */ new Date()).toISOString(),
      rhid_response: response ?? null,
      last_error: null,
      attempts: (claimed.attempts || 0) + 1
    }).eq("id", queueId);
  } catch (e) {
    if (e instanceof RhidUnsupportedError) {
      await supabaseAdmin.from("rhid_sync_queue").update({
        status: "unsupported",
        attempts: (claimed.attempts || 0) + 1,
        last_error: String(e?.message || e).slice(0, 1e3),
        processed_at: (/* @__PURE__ */ new Date()).toISOString(),
        next_attempt_at: null
      }).eq("id", queueId);
      return;
    }
    const attempts = (claimed.attempts || 0) + 1;
    const giveUp = attempts >= MAX_RHID_ATTEMPTS;
    const nextAttemptAt = giveUp ? null : new Date(Date.now() + backoffMinutes(attempts) * 6e4).toISOString();
    await supabaseAdmin.from("rhid_sync_queue").update({
      status: giveUp ? "error" : "pending",
      attempts,
      last_error: String(e?.message || e).slice(0, 1e3),
      next_attempt_at: nextAttemptAt,
      processed_at: giveUp ? (/* @__PURE__ */ new Date()).toISOString() : null
    }).eq("id", queueId);
    if (!giveUp) throw e;
  }
}
async function executeRhidPush(item) {
  const kind = item.kind;
  const op = item.op;
  const payload = item.payload || {};
  if (kind === "punch") {
    if (op === "create") {
      if (!item.device_id) throw new Error("device_id ausente na fila");
      if (!payload.rhidPersonId) throw new Error("rhidPersonId ausente no payload");
      if (!payload.dateTime) throw new Error("dateTime ausente no payload");
      const result = await createRhidPunch(
        Number(item.device_id),
        String(payload.rhidPersonId),
        new Date(payload.dateTime),
        Number(payload.tipo ?? 3)
      );
      const extractedId = result?.newID ?? result?.NewID ?? result?.newId ?? result?.NewId ?? result?.id ?? result?.Id ?? result?.ID ?? result?.idAfd ?? result?.IdAfd ?? result?.id_afd ?? result?.Punch?.id ?? result?.punch?.id;
      if (item.ref_id) {
        if (extractedId == null) {
          throw new Error(`RHID criou batida mas n\xE3o retornou ID reconhec\xEDvel. Resposta: ${JSON.stringify(result).slice(0, 300)}`);
        }
        await supabaseAdmin.from("control_id_punches").update({
          external_id: String(extractedId),
          rhid_synced_at: (/* @__PURE__ */ new Date()).toISOString(),
          rhid_sync_error: null
        }).eq("id", Number(item.ref_id));
      }
      return result;
    }
    if (op === "update") {
      throw new RhidUnsupportedError(
        "RHID/AFD n\xE3o permite editar batida (append-only). Corre\xE7\xE3o tratada pela concilia\xE7\xE3o di\xE1ria."
      );
    }
    if (op === "delete") {
      throw new RhidUnsupportedError(
        "RHID/AFD n\xE3o permite excluir batida (append-only). Diverg\xEAncia reportada na concilia\xE7\xE3o para ajuste manual."
      );
    }
  }
  if (kind === "employee") {
    if (!item.employee_id) throw new Error("employee_id ausente");
    if (op === "create" || op === "update") {
      const reg = await registerEmployeeInRhid(Number(item.employee_id), item.device_id ?? void 0);
      const { data: emp } = await supabaseAdmin.from("employees").select("id, name, cpf, pis, matricula, status").eq("id", item.employee_id).maybeSingle();
      if (emp) {
        const fields = {
          name: emp.name,
          registration: emp.matricula || String(emp.id),
          status: emp.status === "ativo" ? 1 : 0
        };
        await updateRhidPerson(reg.deviceId, reg.rhidPersonId, fields);
      }
      return { mappingId: reg.mappingId, rhidPersonId: reg.rhidPersonId, status: reg.status };
    }
    if (op === "delete") {
      const { data: maps } = await supabaseAdmin.from("control_id_users_map").select("*").eq("employee_id", item.employee_id).eq("ativo", true);
      for (const m of maps || []) {
        try {
          await updateRhidPerson(Number(m.device_id), String(m.control_id_user_id), { status: 0 });
        } catch (e) {
          console.warn(`[RHID-Q] Falha ao inativar pessoa #${m.control_id_user_id}:`, e.message);
        }
      }
      return { inativated: (maps || []).length };
    }
  }
  if (kind === "absence") {
    throw new Error("Endpoint RHID para tratamentos (folgas/faltas) ainda n\xE3o habilitado");
  }
  throw new Error(`kind/op n\xE3o suportado: ${kind}/${op}`);
}
async function processRhidSyncQueue(maxItems = 50) {
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const { data: items } = await supabaseAdmin.from("rhid_sync_queue").select("id").eq("status", "pending").lte("next_attempt_at", nowIso).order("id", { ascending: true }).limit(maxItems);
  let done = 0, failed = 0;
  for (const it of items || []) {
    try {
      await processRhidQueueItem(Number(it.id));
      done++;
    } catch {
      failed++;
    }
  }
  return { processed: (items || []).length, done, failed };
}
async function deleteRhidPunch(deviceId, rhidPunchId) {
  const { data: device } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device) throw new Error(`Device #${deviceId} n\xE3o encontrado`);
  if (device.tipo !== "rhid_cloud") throw new Error("Delete punch suportado apenas em RHID Cloud");
  const token = await getOrLoginToken(device);
  const url = joinUrl(device.base_url, `/customerdb/afd.svc/${encodeURIComponent(rhidPunchId)}`);
  let r = await tryFetch(url, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
    timeoutMs: 2e4
  });
  if (r.status === 401 || r.status === 403) {
    const newToken = await loginDevice(device);
    r = await tryFetch(url, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${newToken}`, "Accept": "application/json" },
      timeoutMs: 2e4
    });
  }
  if (!r.ok) throw new Error(`RHID DELETE punch falhou: ${r.status} ${await r.text().catch(() => "")}`);
  return { ok: true };
}
var MAX_RHID_ATTEMPTS, RhidUnsupportedError;
var init_control_id = __esm({
  "server/control-id.ts"() {
    "use strict";
    init_supabase();
    init_hours_calc();
    init_espelho_ponto();
    init_control_id_parsers();
    init_locked_periods();
    MAX_RHID_ATTEMPTS = 8;
    RhidUnsupportedError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "RhidUnsupportedError";
      }
    };
  }
});

// server/rhid-reconciliation.ts
import nodemailer2 from "nodemailer";
function classifyMark(oursCount, rhidCount) {
  const inOurs = oursCount > 0, inRhid = rhidCount > 0;
  if (inOurs && oursCount > 1 || inRhid && rhidCount > 1) return "duplicada";
  if (inOurs && inRhid) return "validado";
  if (inOurs && !inRhid) return "faltando_no_rhid";
  return "faltando_no_local";
}
function onlyDigits(s) {
  return String(s ?? "").replace(/\D/g, "");
}
function resolvePeriod(fromYmd, toYmd) {
  if (fromYmd && toYmd) {
    const start2 = /* @__PURE__ */ new Date(`${fromYmd}T00:00:00-03:00`);
    const end2 = /* @__PURE__ */ new Date(`${toYmd}T23:59:59-03:00`);
    return { start: start2, end: end2, fromYmd, toYmd };
  }
  const nowBRT = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [yy, mm] = nowBRT.split("-");
  const { start, end } = monthToFechamento(`${yy}-${mm}`);
  return {
    start,
    end,
    fromYmd: start.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
    toYmd: end.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  };
}
async function buildReconciliation(opts = {}) {
  const { start, end, fromYmd, toYmd } = resolvePeriod(opts.fromYmd, opts.toYmd);
  let device = null;
  if (opts.deviceId) {
    const { data } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", opts.deviceId).maybeSingle();
    device = data;
  } else {
    const { data } = await supabaseAdmin.from("control_id_devices").select("*").eq("tipo", "rhid_cloud").eq("ativo", true).order("id").limit(1).maybeSingle();
    device = data;
  }
  const deviceId = device ? Number(device.id) : null;
  const { data: emps } = await supabaseAdmin.from("employees").select("id, name, cpf, pis, matricula, status").eq("status", "ativo").order("name");
  const employees = emps || [];
  const empIds = employees.map((e) => e.id);
  const { data: maps } = await supabaseAdmin.from("control_id_users_map").select("employee_id, device_id, control_id_user_id, control_id_user_name, ativo").in("employee_id", empIds.length ? empIds : [-1]).eq("ativo", true);
  const mapByEmp = /* @__PURE__ */ new Map();
  for (const m of maps || []) {
    if (deviceId == null || Number(m.device_id) === deviceId) mapByEmp.set(Number(m.employee_id), m);
  }
  const { data: ourPunches } = await supabaseAdmin.from("control_id_punches").select("employee_id, punch_at, source, external_id").gte("punch_at", start.toISOString()).lt("punch_at", end.toISOString()).not("employee_id", "is", null);
  const oursByEmp = /* @__PURE__ */ new Map();
  for (const p of ourPunches || []) {
    const arr = oursByEmp.get(Number(p.employee_id)) || [];
    arr.push(p);
    oursByEmp.set(Number(p.employee_id), arr);
  }
  const rhidByUser = /* @__PURE__ */ new Map();
  if (device) {
    const events = await fetchAllEvents(device);
    for (const ev of events) {
      const t = new Date(ev.time).getTime();
      if (t < start.getTime() || t >= end.getTime()) continue;
      const arr = rhidByUser.get(String(ev.userId)) || [];
      arr.push({ minute: minuteKeyBRT2(new Date(ev.time)), source: ev.source || "facial" });
      rhidByUser.set(String(ev.userId), arr);
    }
  }
  const result = {
    period: { fromYmd, toYmd },
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    deviceId,
    totals: { employees: 0, validado: 0, faltandoNoRhid: 0, faltandoNoLocal: 0, duplicadas: 0, identidadeProblemas: 0, semMapping: 0 },
    employees: []
  };
  for (const emp of employees) {
    const map = mapByEmp.get(Number(emp.id)) || null;
    const rhidUserId = map ? String(map.control_id_user_id) : null;
    const cpfD = onlyDigits(emp.cpf);
    const pisD = onlyDigits(emp.pis);
    const warnings = [];
    if (!map) warnings.push("Sem v\xEDnculo (mapping) com o RHID");
    if (cpfD.length !== 11) warnings.push("CPF ausente ou inv\xE1lido (precisa 11 d\xEDgitos)");
    if (pisD.length !== 11) warnings.push("PIS ausente ou inv\xE1lido (precisa 11 d\xEDgitos)");
    if (cpfD.length === 11 && pisD.length === 11 && cpfD === pisD) warnings.push("CPF e PIS s\xE3o iguais (prov\xE1vel digita\xE7\xE3o trocada)");
    if (map && map.control_id_user_name && emp.name) {
      const score = nameMatchScore(emp.name, map.control_id_user_name);
      if (score < 0.5) warnings.push(`Nome diverge do RHID ("${emp.name}" \xD7 "${map.control_id_user_name}")`);
    }
    const ourMarks = oursByEmp.get(Number(emp.id)) || [];
    const oursByMinute = /* @__PURE__ */ new Map();
    for (const p of ourMarks) {
      const k = minuteKeyBRT2(new Date(p.punch_at));
      const cur = oursByMinute.get(k) || { count: 0, source: p.source };
      cur.count++;
      oursByMinute.set(k, cur);
    }
    const rhidMarks = rhidUserId ? rhidByUser.get(rhidUserId) || [] : [];
    const rhidByMinute = /* @__PURE__ */ new Map();
    for (const r of rhidMarks) {
      const cur = rhidByMinute.get(r.minute) || { count: 0, source: r.source };
      cur.count++;
      rhidByMinute.set(r.minute, cur);
    }
    const allMinutes = /* @__PURE__ */ new Set([...Array.from(oursByMinute.keys()), ...Array.from(rhidByMinute.keys())]);
    const marks = [];
    let validado = 0, faltandoNoRhid = 0, faltandoNoLocal = 0, duplicadas = 0;
    for (const minute of Array.from(allMinutes).sort()) {
      const o = oursByMinute.get(minute);
      const r = rhidByMinute.get(minute);
      const inOurs = !!o, inRhid = !!r;
      const status = classifyMark(o?.count || 0, r?.count || 0);
      if (status === "duplicada") duplicadas++;
      else if (status === "validado") validado++;
      else if (status === "faltando_no_rhid") faltandoNoRhid++;
      else faltandoNoLocal++;
      marks.push({
        minuteBRT: minute,
        status,
        inOurs,
        inRhid,
        oursCount: o?.count || 0,
        rhidCount: r?.count || 0,
        source: o?.source ?? r?.source ?? null
      });
    }
    const re = {
      employeeId: Number(emp.id),
      name: emp.name,
      cpf: emp.cpf || null,
      pis: emp.pis || null,
      matricula: emp.matricula || null,
      rhidUserId,
      rhidName: map ? map.control_id_user_name || null : null,
      mappingOk: !!map,
      identidadeWarnings: warnings,
      counts: { ours: ourMarks.length, rhid: rhidMarks.length, validado, faltandoNoRhid, faltandoNoLocal, duplicadas },
      marks
    };
    result.employees.push(re);
    result.totals.validado += validado;
    result.totals.faltandoNoRhid += faltandoNoRhid;
    result.totals.faltandoNoLocal += faltandoNoLocal;
    result.totals.duplicadas += duplicadas;
    if (warnings.length) result.totals.identidadeProblemas++;
    if (!map) result.totals.semMapping++;
  }
  result.totals.employees = result.employees.length;
  return result;
}
function extractRhidPunchId(result) {
  const id = result?.newID ?? result?.NewID ?? result?.newId ?? result?.NewId ?? result?.id ?? result?.Id ?? result?.ID ?? result?.idAfd ?? result?.IdAfd ?? result?.id_afd ?? result?.Punch?.id ?? result?.punch?.id;
  return id == null ? null : String(id);
}
function exportPunchDisposition(opts) {
  if (opts.noIdentity) return "skip_no_mapping";
  if (opts.hasExternalId) return "stuck_external_id";
  return "export";
}
async function exportMissingToRhid(recon) {
  let exported = 0, exportFailed = 0, exportSkippedNoMapping = 0, exportStuck = 0;
  const errors = [];
  const exportedKeys = /* @__PURE__ */ new Set();
  if (!recon.deviceId) return { exported, exportFailed, exportSkippedNoMapping, exportStuck, errors, exportedKeys };
  const stampError = async (punchId, msg) => {
    await supabaseAdmin.from("control_id_punches").update({
      rhid_sync_error: msg.slice(0, 500)
    }).eq("id", punchId);
  };
  const lockedPeriods = await getLockedPeriods(recon.deviceId);
  const { start, end } = resolvePeriod(recon.period.fromYmd, recon.period.toYmd);
  for (const emp of recon.employees) {
    const missingMinutes = new Set(emp.marks.filter((m) => m.status === "faltando_no_rhid").map((m) => m.minuteBRT));
    if (!missingMinutes.size) continue;
    const noIdentity = !emp.mappingOk || !emp.rhidUserId;
    const { data: punches } = await supabaseAdmin.from("control_id_punches").select("id, punch_at, external_id").eq("employee_id", emp.employeeId).gte("punch_at", start.toISOString()).lt("punch_at", end.toISOString());
    let skippedThisEmp = 0;
    const seen = /* @__PURE__ */ new Set();
    for (const p of punches || []) {
      const mk = minuteKeyBRT2(new Date(p.punch_at));
      if (!missingMinutes.has(mk)) continue;
      if (isDateLocked(p.punch_at, lockedPeriods)) continue;
      const disposition = exportPunchDisposition({ noIdentity, hasExternalId: !!p.external_id });
      if (disposition === "skip_no_mapping") {
        exportSkippedNoMapping++;
        skippedThisEmp++;
        await stampError(p.id, "N\xE3o exportada pro RHID: funcion\xE1rio sem v\xEDnculo (mapping) ativo no aparelho");
        continue;
      }
      if (disposition === "stuck_external_id") {
        exportStuck++;
        await stampError(p.id, "Batida com external_id por\xE9m ausente no RHID neste minuto \u2014 revisar (poss\xEDvel id obsoleto)");
        continue;
      }
      if (seen.has(mk)) continue;
      seen.add(mk);
      try {
        const result = await createRhidPunch(recon.deviceId, emp.rhidUserId, new Date(p.punch_at), 3);
        const extractedId = extractRhidPunchId(result);
        await supabaseAdmin.from("control_id_punches").update({
          external_id: extractedId ?? String(p.external_id ?? ""),
          rhid_synced_at: (/* @__PURE__ */ new Date()).toISOString(),
          rhid_sync_error: extractedId ? null : "RHID criou batida mas n\xE3o retornou ID"
        }).eq("id", p.id);
        exported++;
        exportedKeys.add(`${emp.employeeId}|${mk}`);
      } catch (e) {
        exportFailed++;
        const m = `${e?.message || e}`;
        errors.push(`Export ${emp.name} ${mk}: ${m}`.slice(0, 200));
        await stampError(p.id, `Falha ao exportar pro RHID: ${m}`);
      }
    }
    if (skippedThisEmp > 0) {
      const idWarn = emp.identidadeWarnings.length ? ` (${emp.identidadeWarnings.join("; ")})` : "";
      errors.push(`Export ${emp.name}: ${skippedThisEmp} batida(s) n\xE3o exportada(s) \u2014 sem v\xEDnculo/identidade no RHID${idWarn}`.slice(0, 200));
    }
  }
  return { exported, exportFailed, exportSkippedNoMapping, exportStuck, errors, exportedKeys };
}
function getMailTransporter2() {
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer2.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false }
  });
}
function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function reconRecipients(override) {
  if (override && override.length) return override;
  const env = process.env.RHID_RECON_RECIPIENTS || process.env.RH_RECIPIENTS || "";
  const list = env.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return list;
}
async function sendReconciliationEmail(recon, actions, opts) {
  const t = recon.totals;
  const hasDivergence = t.faltandoNoRhid > 0 || t.faltandoNoLocal > 0 || t.duplicadas > 0 || t.identidadeProblemas > 0 || actions.exportFailed > 0;
  if (!hasDivergence && !opts?.force) {
    return { sent: false, message: "Sem diverg\xEAncias \u2014 e-mail n\xE3o enviado." };
  }
  const transporter = getMailTransporter2();
  if (!transporter) return { sent: false, message: "SMTP n\xE3o configurado (SMTP_USER/SMTP_PASS)." };
  const recipients = reconRecipients(opts?.recipientsOverride);
  if (!recipients.length) return { sent: false, message: "Sem destinat\xE1rios (defina RHID_RECON_RECIPIENTS)." };
  const probEmployees = recon.employees.filter((e) => e.counts.faltandoNoRhid > 0 || e.counts.faltandoNoLocal > 0 || e.counts.duplicadas > 0 || e.identidadeWarnings.length > 0);
  const rows = probEmployees.map((e) => {
    const w = e.identidadeWarnings.length ? `<div style="color:#b45309;font-size:12px">\u26A0 ${e.identidadeWarnings.map(escapeHtml).join("; ")}</div>` : "";
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(e.name)}${w}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;color:#16a34a">${e.counts.validado}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;color:#dc2626">${e.counts.faltandoNoRhid}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;color:#2563eb">${e.counts.faltandoNoLocal}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;color:#9333ea">${e.counts.duplicadas}</td>
    </tr>`;
  }).join("");
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;color:#111">
    <h2 style="color:#0f172a">Valida\xE7\xE3o de Ponto \u2014 RHID \xD7 Sistema</h2>
    <p style="color:#475569">Per\xEDodo <b>${recon.period.fromYmd}</b> a <b>${recon.period.toYmd}</b> \xB7 ${new Date(recon.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
    <table style="border-collapse:collapse;margin:12px 0">
      <tr>
        <td style="padding:8px 14px;background:#f0fdf4;border-radius:6px"><b style="color:#16a34a;font-size:20px">${t.validado}</b><br>validados</td>
        <td style="width:8px"></td>
        <td style="padding:8px 14px;background:#fef2f2;border-radius:6px"><b style="color:#dc2626;font-size:20px">${t.faltandoNoRhid}</b><br>faltam no RHID</td>
        <td style="width:8px"></td>
        <td style="padding:8px 14px;background:#eff6ff;border-radius:6px"><b style="color:#2563eb;font-size:20px">${t.faltandoNoLocal}</b><br>faltam em n\xF3s</td>
        <td style="width:8px"></td>
        <td style="padding:8px 14px;background:#faf5ff;border-radius:6px"><b style="color:#9333ea;font-size:20px">${t.duplicadas}</b><br>duplicadas</td>
      </tr>
    </table>
    <p style="color:#475569">A\xE7\xF5es autom\xE1ticas: importadas <b>${actions.imported}</b> \xB7 exportadas (corretivas) <b>${actions.exported}</b> \xB7 falhas export <b>${actions.exportFailed}</b> \xB7 n\xE3o exportadas (sem v\xEDnculo) <b>${actions.exportSkippedNoMapping}</b> \xB7 revisar (id obsoleto) <b>${actions.exportStuck}</b> \xB7 problemas de identidade <b>${t.identidadeProblemas}</b></p>
    ${probEmployees.length ? `
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:8px">
      <thead><tr style="background:#f8fafc;text-align:left">
        <th style="padding:6px 8px">Funcion\xE1rio</th><th style="padding:6px 8px">Validados</th>
        <th style="padding:6px 8px">Faltam RHID</th><th style="padding:6px 8px">Faltam n\xF3s</th><th style="padding:6px 8px">Dup.</th>
      </tr></thead><tbody>${rows}</tbody>
    </table>` : `<p style="color:#16a34a"><b>Tudo validado.</b></p>`}
    <p style="color:#94a3b8;font-size:12px;margin-top:18px">Torres Vigil\xE2ncia \u2014 valida\xE7\xE3o autom\xE1tica de ponto. Nosso sistema \xE9 a fonte da verdade.</p>
  </div>`;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: recipients,
    subject: `[Ponto] Valida\xE7\xE3o RHID ${recon.period.fromYmd}\u2014${recon.period.toYmd}: ${t.faltandoNoRhid + t.faltandoNoLocal + t.duplicadas} diverg\xEAncia(s)`,
    html
  });
  return { sent: true, message: `E-mail enviado para ${recipients.join(", ")}` };
}
async function runDailyReconciliation(opts = {}) {
  const doImport = opts.doImport !== false;
  const doExport = opts.doExport !== false;
  const sendEmail = opts.sendEmail !== false;
  const actions = { imported: 0, importSkipped: 0, exported: 0, exportFailed: 0, exportSkippedNoMapping: 0, exportStuck: 0, errors: [] };
  let deviceId = opts.deviceId ?? null;
  if (deviceId == null) {
    const { data } = await supabaseAdmin.from("control_id_devices").select("id").eq("tipo", "rhid_cloud").eq("ativo", true).order("id").limit(1).maybeSingle();
    deviceId = data ? Number(data.id) : null;
  }
  if (doImport && deviceId != null) {
    try {
      const r = await syncDevice(deviceId, { fullBackfill: true });
      actions.imported = r.saved;
      actions.importSkipped = r.skipped;
    } catch (e) {
      actions.errors.push(`Import: ${e?.message || e}`.slice(0, 200));
    }
  }
  const recon = await buildReconciliation({ fromYmd: opts.fromYmd, toYmd: opts.toYmd, deviceId: deviceId ?? void 0 });
  if (doExport) {
    try {
      const r = await exportMissingToRhid(recon);
      actions.exported = r.exported;
      actions.exportFailed = r.exportFailed;
      actions.exportSkippedNoMapping = r.exportSkippedNoMapping;
      actions.exportStuck = r.exportStuck;
      actions.errors.push(...r.errors);
      if (r.exportedKeys.size) {
        for (const emp of recon.employees) {
          for (const mark of emp.marks) {
            if (mark.status === "faltando_no_rhid" && r.exportedKeys.has(`${emp.employeeId}|${mark.minuteBRT}`)) {
              mark.status = "validado";
              mark.inRhid = true;
              mark.rhidCount = Math.max(1, mark.rhidCount);
              emp.counts.faltandoNoRhid--;
              emp.counts.validado++;
              recon.totals.faltandoNoRhid--;
              recon.totals.validado++;
            }
          }
        }
      }
    } catch (e) {
      actions.errors.push(`Export: ${e?.message || e}`.slice(0, 200));
    }
  }
  let runId = null;
  try {
    const { data, error } = await supabaseAdmin.from("rhid_reconciliation_runs").insert({
      run_at: (/* @__PURE__ */ new Date()).toISOString(),
      period_from: recon.period.fromYmd,
      period_to: recon.period.toYmd,
      triggered_by: opts.triggeredBy || "cron",
      totals: recon.totals,
      actions,
      detail: recon.employees
    }).select("id").single();
    if (error) actions.errors.push(`Persist: ${error.message}`.slice(0, 200));
    runId = data ? Number(data.id) : null;
  } catch (e) {
    actions.errors.push(`Persist: ${e?.message || e}`.slice(0, 200));
  }
  let email = { sent: false, message: "E-mail desativado." };
  if (sendEmail) {
    try {
      email = await sendReconciliationEmail(recon, actions, { recipientsOverride: opts.recipientsOverride, force: opts.forceEmail });
    } catch (e) {
      email = { sent: false, message: `Erro e-mail: ${e?.message || e}` };
    }
  }
  return { recon, actions, email, runId };
}
var init_rhid_reconciliation = __esm({
  "server/rhid-reconciliation.ts"() {
    "use strict";
    init_supabase();
    init_control_id();
    init_control_id_parsers();
    init_locked_periods();
  }
});

// server/lib/folha-historico.ts
function num(v) {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function prevMonthRef(d = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit"
  }).format(d);
  const [y, m] = parts.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, "0")}`;
}
async function snapshotFolhaMes(mesRef, opts = {}) {
  const source = opts.source || "auto";
  const { buildFolhaStats: buildFolhaStats2 } = await Promise.resolve().then(() => (init_control_id(), control_id_exports));
  const { data: employees, error } = await supabaseAdmin.from("employees").select("id, name, status, role, tipo_contratacao");
  if (error) throw new Error(error.message);
  const ativos = (employees || []).filter(
    (e) => !INATIVOS.has(String(e.status || "").toLowerCase())
  );
  const CONCURRENCY = 6;
  const statsByIdx = new Array(ativos.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (cursor < ativos.length) {
      const i = cursor++;
      const emp = ativos[i];
      try {
        statsByIdx[i] = await buildFolhaStats2(emp.id, mesRef, {
          multiplicadorHE: 1.6,
          employee: { role: emp.role, tipo_contratacao: emp.tipo_contratacao }
        });
      } catch (e) {
        console.warn(`[folha-historico] buildFolhaStats(${emp.id}, ${mesRef}) falhou:`, e?.message || e);
        statsByIdx[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ativos.length) }, () => worker()));
  const rows = [];
  let skipped = 0;
  for (let i = 0; i < ativos.length; i++) {
    const emp = ativos[i];
    const s = statsByIdx[i];
    if (!s) {
      skipped++;
      continue;
    }
    rows.push({
      employee_id: emp.id,
      employee_name: emp.name,
      month_year: mesRef,
      horas_trabalhadas: num(s.hoursWorked),
      horas_extra: num(s.horaExtra),
      horas_noturnas: num(s.horasNoturnas),
      base_salary: num(s.baseSalary),
      periculosidade: num(s.periculosidade),
      custo_extra: num(s.custoExtra),
      adicional_noturno: num(s.adicionalNoturno),
      vencimentos_total: num(s.vencimentosTotal),
      vale_refeicao: num(s.valeRefeicao),
      cesta_basica: num(s.cestaBasica),
      diarias: num(s.diarias),
      beneficios_total: num(s.beneficiosTotal),
      fgts: num(s.fgts),
      inss_patronal: num(s.inssPatronal),
      seguro_vida: num(s.seguroVida),
      recolhimentos_total: num(s.recolhimentosTotal),
      custo_real: num(s.custoTotalEstimado),
      custo_com_encargos: num(s.custoComEncargos),
      valor_hora: num(s.valorHora),
      valor_hora_extra: num(s.valorHoraExtra),
      inss_funcionario: num(s.inssFuncionario),
      irrf_funcionario: num(s.irrfFuncionario),
      liquido_funcionario: num(s.liquidoFuncionario),
      stats_json: s,
      source
    });
  }
  let saved = 0;
  if (rows.length) {
    const { error: upErr } = await supabaseAdmin.from("folha_historico_mensal").upsert(rows, { onConflict: "employee_id,month_year" });
    if (upErr) throw new Error(upErr.message);
    saved = rows.length;
  }
  return { mes: mesRef, ativos: ativos.length, saved, skipped };
}
async function snapshotFolhaMesIfMissing(mesRef, opts = {}) {
  const { count, error } = await supabaseAdmin.from("folha_historico_mensal").select("id", { count: "exact", head: true }).eq("month_year", mesRef);
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) return null;
  return snapshotFolhaMes(mesRef, { source: opts.source || "auto-catchup" });
}
var INATIVOS;
var init_folha_historico = __esm({
  "server/lib/folha-historico.ts"() {
    "use strict";
    init_supabase();
    INATIVOS = /* @__PURE__ */ new Set(["inativo", "desligado", "bloqueado", "demitido"]);
  }
});

// server/email-vencimentos.ts
import nodemailer3 from "nodemailer";
function getMailTransporter3() {
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer3.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false }
  });
}
function fmtBR(v) {
  return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function escapeHtml2(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
async function sendVencimentosDoDiaEmail(opts) {
  const transporter = getMailTransporter3();
  if (!transporter) {
    return { success: false, message: "SMTP n\xE3o configurado", pagar: 0, receber: 0, total: 0 };
  }
  const today = opts?.targetDate || (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const recipients = opts?.recipientsOverride && opts.recipientsOverride.length ? opts.recipientsOverride : VENCIMENTOS_RECIPIENTS_DEFAULT;
  try {
    const { data, error } = await supabaseAdmin.from("financial_transactions").select("id, type, status, due_date, description, amount, entity_name, fornecedor_id, category_name, solicitado_por").eq("due_date", today).eq("status", "PENDING").order("type", { ascending: true }).order("amount", { ascending: false });
    if (error) throw error;
    const rows = data || [];
    const fornecedorIds = Array.from(new Set(rows.map((r) => r.fornecedor_id).filter(Boolean)));
    const fornecedorMap = /* @__PURE__ */ new Map();
    if (fornecedorIds.length) {
      const { data: forn } = await supabaseAdmin.from("fornecedores").select("id, razao_social, nome_fantasia").in("id", fornecedorIds);
      for (const f of forn || []) {
        fornecedorMap.set(f.id, f.razao_social || f.nome_fantasia || "");
      }
    }
    const pagar = rows.filter((r) => r.type === "EXPENSE");
    const receber = rows.filter((r) => r.type === "INCOME");
    const totalPagar = pagar.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalReceber = receber.reduce((s, r) => s + Number(r.amount || 0), 0);
    const dataBR = (/* @__PURE__ */ new Date(today + "T12:00:00")).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const renderTable = (lista, kind) => {
      const headerColor = kind === "PAGAR" ? "#dc2626" : "#16a34a";
      const headerLabel = kind === "PAGAR" ? "Contas a Pagar" : "Contas a Receber";
      if (!lista.length) {
        return `
        <div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <div style="background:${headerColor};color:#fff;padding:10px 14px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${headerLabel} \u2014 ${dataBR}</div>
          <div style="padding:14px;background:#f9fafb;color:#6b7280;font-size:13px;font-style:italic;">Nenhum lan\xE7amento vencendo nesta data.</div>
        </div>`;
      }
      const linhas = lista.map((r) => {
        const favorecido = r.entity_name && r.entity_name.trim() || (r.fornecedor_id ? fornecedorMap.get(r.fornecedor_id) : "") || "\u2014";
        return `
          <tr>
            <td style="padding:8px 10px;border-top:1px solid #e5e7eb;font-size:12px;color:#1f2937;">${escapeHtml2(r.description || "\u2014")}</td>
            <td style="padding:8px 10px;border-top:1px solid #e5e7eb;font-size:12px;color:#374151;">${escapeHtml2(favorecido)}</td>
            <td style="padding:8px 10px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;">${escapeHtml2(r.category_name || "\u2014")}</td>
            <td style="padding:8px 10px;border-top:1px solid #e5e7eb;font-size:13px;color:${headerColor};font-weight:700;text-align:right;white-space:nowrap;">R$ ${fmtBR(Number(r.amount || 0))}</td>
          </tr>`;
      }).join("");
      const total = lista.reduce((s, r) => s + Number(r.amount || 0), 0);
      return `
      <div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <div style="background:${headerColor};color:#fff;padding:10px 14px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">
          ${headerLabel} \u2014 ${dataBR} \xB7 ${lista.length} lan\xE7amento(s) \xB7 R$ ${fmtBR(total)}
        </div>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#fff;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Descri\xE7\xE3o</th>
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Favorecido</th>
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Categoria</th>
              <th style="padding:8px 10px;text-align:right;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Valor</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`;
    };
    const saldoLiquido = totalReceber - totalPagar;
    const saldoColor = saldoLiquido >= 0 ? "#16a34a" : "#dc2626";
    const html = `
    <div style="font-family:Arial,sans-serif;max-width:780px;margin:0 auto;background:#f9fafb;padding:20px;">
      <div style="background:#0f172a;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:0.7;">Torres Vigil\xE2ncia Patrimonial</div>
        <h1 style="margin:4px 0 0;font-size:20px;font-weight:800;">Vencimentos do Dia \u2014 ${dataBR}</h1>
      </div>
      <div style="background:#fff;padding:20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;">
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:18px;">
          <tr>
            <td style="width:33%;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;text-align:center;">
              <div style="font-size:10px;text-transform:uppercase;color:#991b1b;font-weight:700;">A Pagar Hoje</div>
              <div style="font-size:20px;font-weight:800;color:#dc2626;margin-top:4px;">R$ ${fmtBR(totalPagar)}</div>
              <div style="font-size:11px;color:#991b1b;">${pagar.length} lan\xE7amento(s)</div>
            </td>
            <td style="width:1%;"></td>
            <td style="width:33%;padding:12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;text-align:center;">
              <div style="font-size:10px;text-transform:uppercase;color:#065f46;font-weight:700;">A Receber Hoje</div>
              <div style="font-size:20px;font-weight:800;color:#16a34a;margin-top:4px;">R$ ${fmtBR(totalReceber)}</div>
              <div style="font-size:11px;color:#065f46;">${receber.length} lan\xE7amento(s)</div>
            </td>
            <td style="width:1%;"></td>
            <td style="width:33%;padding:12px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;text-align:center;">
              <div style="font-size:10px;text-transform:uppercase;color:#334155;font-weight:700;">Saldo L\xEDquido do Dia</div>
              <div style="font-size:20px;font-weight:800;color:${saldoColor};margin-top:4px;">R$ ${fmtBR(saldoLiquido)}</div>
              <div style="font-size:11px;color:#334155;">Receber \u2212 Pagar</div>
            </td>
          </tr>
        </table>
        ${renderTable(receber, "RECEBER")}
        ${renderTable(pagar, "PAGAR")}
        <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;text-align:center;">
          Resumo gerado automaticamente \xE0s 07h (BRT) \xB7 Torres Vigil\xE2ncia Patrimonial<br>
          Lan\xE7amentos com status PENDING e vencimento em ${dataBR}.
        </p>
      </div>
    </div>`;
    const subject = `[Financeiro] Vencimentos ${dataBR} \u2014 Pagar R$ ${fmtBR(totalPagar)} \xB7 Receber R$ ${fmtBR(totalReceber)}`;
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipients,
      subject,
      html
    });
    console.log(`[vencimentos] ${dataBR}: ${pagar.length} pagar (R$ ${fmtBR(totalPagar)}) + ${receber.length} receber (R$ ${fmtBR(totalReceber)}) \u2192 ${recipients.join(", ")}`);
    return { success: true, message: `E-mail enviado para ${recipients.join(", ")}`, pagar: pagar.length, receber: receber.length, total: rows.length };
  } catch (err) {
    console.error(`[vencimentos] ERRO: ${err.message}`);
    return { success: false, message: err.message, pagar: 0, receber: 0, total: 0 };
  }
}
var VENCIMENTOS_RECIPIENTS_DEFAULT;
var init_email_vencimentos = __esm({
  "server/email-vencimentos.ts"() {
    "use strict";
    init_supabase();
    VENCIMENTOS_RECIPIENTS_DEFAULT = [
      "adm@grupotmseg.com.br",
      "diretoria@torresseguranca.com.br"
    ];
  }
});

// server/services/inter/client.ts
var client_exports = {};
__export(client_exports, {
  getInterClient: () => getInterClient,
  isInterConfigured: () => isInterConfigured
});
import https from "https";
import fs from "fs";
import path from "path";
function getInterCa() {
  if (_interCa !== null) return _interCa || null;
  try {
    const caPath = path.join(__dirname, "inter-ca.pem");
    _interCa = fs.readFileSync(caPath, "utf8");
    return _interCa;
  } catch {
    _interCa = "";
    return null;
  }
}
function normalizePem(s) {
  return s.includes("\\n") ? s.replace(/\\n/g, "\n") : s;
}
function loadCertKey() {
  const cert = process.env.INTER_CERT_CRT;
  const key = process.env.INTER_CERT_KEY;
  if (!cert || !key) {
    throw new Error("INTER_CERT_CRT e INTER_CERT_KEY s\xE3o obrigat\xF3rios para mTLS");
  }
  return { cert: normalizePem(cert), key: normalizePem(key) };
}
function getInterClient() {
  if (!_instance) _instance = new InterClient();
  return _instance;
}
function isInterConfigured() {
  return getInterClient().isConfigured();
}
var BASE_URLS, _interCa, InterClient, _instance;
var init_client = __esm({
  "server/services/inter/client.ts"() {
    "use strict";
    BASE_URLS = {
      prod: "https://cdpj.partners.bancointer.com.br",
      sandbox: "https://cdpj-sandbox.partners.uatinter.co"
    };
    _interCa = null;
    InterClient = class {
      tokens = /* @__PURE__ */ new Map();
      isConfigured() {
        return !!(process.env.INTER_CLIENT_ID && process.env.INTER_CLIENT_SECRET && process.env.INTER_CERT_CRT && process.env.INTER_CERT_KEY);
      }
      getBaseUrl() {
        return process.env.INTER_AMBIENTE === "prod" ? BASE_URLS.prod : BASE_URLS.sandbox;
      }
      getAmbiente() {
        return process.env.INTER_AMBIENTE === "prod" ? "prod" : "sandbox";
      }
      getContaCorrente() {
        return process.env.INTER_CONTA_CORRENTE || "";
      }
      /** Request HTTPS com mTLS. Resolve com JSON parsed, texto ou Buffer. */
      rawRequest(opts) {
        const { method, path: path3, body, contentType, headers = {}, rawBuffer } = opts;
        const { cert, key } = loadCertKey();
        const url = new URL(this.getBaseUrl() + path3);
        const finalHeaders = { ...headers };
        if (body != null) {
          finalHeaders["Content-Type"] = contentType || "application/json";
          finalHeaders["Content-Length"] = Buffer.byteLength(body).toString();
        }
        return new Promise((resolve, reject) => {
          const ca = getInterCa();
          const req = https.request(
            {
              method,
              hostname: url.hostname,
              port: 443,
              path: url.pathname + url.search,
              cert,
              key,
              ...ca ? { ca } : {},
              headers: finalHeaders
            },
            (res) => {
              const chunks = [];
              res.on("data", (c) => chunks.push(c));
              res.on("end", () => {
                const buf = Buffer.concat(chunks);
                const status = res.statusCode || 0;
                if (status >= 200 && status < 300) {
                  if (rawBuffer) return resolve(buf);
                  const txt = buf.toString("utf8");
                  if (!txt) return resolve(void 0);
                  try {
                    resolve(JSON.parse(txt));
                  } catch {
                    resolve(txt);
                  }
                } else {
                  const txt = buf.toString("utf8");
                  const err = new Error(`Inter API ${status} ${method} ${path3}: ${txt.slice(0, 500)}`);
                  err.status = status;
                  err.body = txt;
                  reject(err);
                }
              });
            }
          );
          req.on("error", reject);
          if (body != null) req.write(body);
          req.end();
        });
      }
      /** Obtém token OAuth2 com cache por escopo. Renova automaticamente. */
      async getToken(scopes) {
        const cached = this.tokens.get(scopes);
        if (cached && cached.expiresAt > Date.now() + 6e4) return cached.accessToken;
        const clientId = process.env.INTER_CLIENT_ID;
        const clientSecret = process.env.INTER_CLIENT_SECRET;
        const form = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          scope: scopes,
          grant_type: "client_credentials"
        }).toString();
        const data = await this.rawRequest({
          method: "POST",
          path: "/oauth/v2/token",
          body: form,
          contentType: "application/x-www-form-urlencoded"
        });
        this.tokens.set(scopes, {
          accessToken: data.access_token,
          expiresAt: Date.now() + data.expires_in * 1e3
        });
        return data.access_token;
      }
      /** Chamada autenticada às APIs Inter. */
      async call(opts) {
        const { method, path: path3, scopes, body, query, useContaCorrente, rawBuffer } = opts;
        if (!this.isConfigured()) {
          throw new Error(
            "Banco Inter n\xE3o configurado. Defina INTER_CLIENT_ID, INTER_CLIENT_SECRET, INTER_CONTA_CORRENTE, INTER_CERT_CRT, INTER_CERT_KEY."
          );
        }
        const token = await this.getToken(scopes);
        let fullPath = path3;
        if (query) {
          const qs = new URLSearchParams(
            Object.entries(query).filter(([_, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)])
          ).toString();
          if (qs) fullPath += (path3.includes("?") ? "&" : "?") + qs;
        }
        const headers = { Authorization: `Bearer ${token}` };
        if (useContaCorrente && this.getContaCorrente()) {
          headers["x-conta-corrente"] = this.getContaCorrente();
        }
        return this.rawRequest({
          method,
          path: fullPath,
          body: body == null ? void 0 : JSON.stringify(body),
          headers,
          rawBuffer
        });
      }
      /** Limpa cache de tokens (útil após troca de credenciais). */
      resetTokens() {
        this.tokens.clear();
      }
    };
    _instance = null;
  }
});

// server/services/inter/banking.ts
var banking_exports = {};
__export(banking_exports, {
  consultarExtrato: () => consultarExtrato,
  consultarExtratoCompleto: () => consultarExtratoCompleto,
  consultarPagamentoBoleto: () => consultarPagamentoBoleto,
  consultarSaldo: () => consultarSaldo,
  pagarBoleto: () => pagarBoleto,
  realizarPix: () => realizarPix
});
async function consultarSaldo() {
  const client = getInterClient();
  return client.call({
    method: "GET",
    path: "/banking/v2/saldo",
    scopes: EXTRATO_SCOPES,
    useContaCorrente: true
  });
}
async function consultarExtrato(dataInicio, dataFim) {
  const client = getInterClient();
  return client.call({
    method: "GET",
    path: "/banking/v2/extrato",
    scopes: EXTRATO_SCOPES,
    useContaCorrente: true,
    query: { dataInicio, dataFim }
  });
}
async function consultarExtratoCompleto(dataInicio, dataFim, pagina = 0, tamanhoPagina = 50) {
  const client = getInterClient();
  return client.call({
    method: "GET",
    path: "/banking/v2/extrato/completo",
    scopes: EXTRATO_SCOPES,
    useContaCorrente: true,
    query: { dataInicio, dataFim, pagina, tamanhoPagina }
  });
}
async function pagarBoleto(input) {
  const client = getInterClient();
  return client.call({
    method: "POST",
    path: "/banking/v2/pagamento",
    scopes: PAG_BOLETO_SCOPES,
    useContaCorrente: true,
    body: input
  });
}
async function consultarPagamentoBoleto(codigoTransacao) {
  const client = getInterClient();
  return client.call({
    method: "GET",
    path: `/banking/v2/pagamento/${codigoTransacao}`,
    scopes: PAG_BOLETO_SCOPES,
    useContaCorrente: true
  });
}
async function realizarPix(input) {
  const client = getInterClient();
  const body = {
    valor: input.valor.toFixed(2),
    descricao: input.descricao || "",
    destinatario: input.destinatario
  };
  if (input.dataPagamento) body.dataPagamento = input.dataPagamento;
  return client.call({
    method: "POST",
    path: "/banking/v2/pix",
    scopes: PIX_OUT_SCOPES,
    useContaCorrente: true,
    body
  });
}
var EXTRATO_SCOPES, PAG_BOLETO_SCOPES, PIX_OUT_SCOPES;
var init_banking = __esm({
  "server/services/inter/banking.ts"() {
    "use strict";
    init_client();
    EXTRATO_SCOPES = "extrato.read";
    PAG_BOLETO_SCOPES = "pagamento-boleto.read pagamento-boleto.write";
    PIX_OUT_SCOPES = "pagamento-pix.write";
  }
});

// server/audit.ts
async function logSystemAudit(params) {
  try {
    await supabaseAdmin.from("system_audit_logs").insert({
      user_id: params.userId ?? null,
      user_name: params.userName ?? null,
      user_role: params.userRole ?? null,
      action: params.action,
      target_id: params.targetId ?? null,
      target_type: params.targetType ?? null,
      details: params.details ?? null,
      ip_address: params.ipAddress ?? null
    });
  } catch (_e) {
  }
}
var init_audit = __esm({
  "server/audit.ts"() {
    "use strict";
    init_supabase();
  }
});

// server/routes/_helpers.ts
var helpers_exports = {};
__export(helpers_exports, {
  MISSION_STEPS: () => MISSION_STEPS,
  SMTP_BCC_OS: () => SMTP_BCC_OS,
  SMTP_BCC_WELCOME: () => SMTP_BCC_WELCOME,
  STEP_REQUIRED_PHOTOS: () => STEP_REQUIRED_PHOTOS,
  createAutoTransaction: () => createAutoTransaction,
  createSmtpTransporter: () => createSmtpTransporter,
  decodePolyline: () => decodePolyline,
  distPointToSegment: () => distPointToSegment,
  distToPolyline: () => distToPolyline,
  findClosestIndex: () => findClosestIndex,
  getSmtpFrom: () => getSmtpFrom,
  haversineDist: () => haversineDist,
  logFinancialAudit: () => logFinancialAudit,
  nowBRTString: () => nowBRTString,
  parseEmailList: () => parseEmailList,
  removeAutoTransaction: () => removeAutoTransaction,
  resilientSupabaseSelect: () => resilientSupabaseSelect,
  resilientSupabaseSingle: () => resilientSupabaseSingle,
  toSafeUser: () => toSafeUser
});
import nodemailer4 from "nodemailer";
async function resilientSupabaseSelect(table, buildQuery) {
  try {
    const { data, error } = await buildQuery(supabaseAdmin.from(table));
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn(`[resilient-route] ${table} fallback: ${err.message || err}`);
    return localQuery(table);
  }
}
async function resilientSupabaseSingle(table, column, value, buildQuery) {
  try {
    const query = buildQuery ? buildQuery(supabaseAdmin.from(table)) : supabaseAdmin.from(table).select("*").eq(column, value).single();
    const { data, error } = await query;
    if (error && error.code !== "PGRST116") throw error;
    return data || null;
  } catch (err) {
    console.warn(`[resilient-route] ${table}.${column}=${value} fallback: ${err.message || err}`);
    return localQuerySingle(table, column, value);
  }
}
function nowBRTString() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function parseEmailList(raw) {
  if (!raw) return [];
  return raw.split(/[\n,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}
function createSmtpTransporter() {
  if (_transporter) return _transporter;
  if (_transporterInitTried) return null;
  _transporterInitTried = true;
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD;
  if (!user || !pass) {
    console.warn("[smtp] n\xE3o configurado \u2014 defina SMTP_USER/SMTP_PASS (ou EMAIL_USER/EMAIL_PASS)");
    return null;
  }
  _transporter = nodemailer4.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false },
    pool: true,
    maxConnections: 5,
    maxMessages: 100
  });
  console.log(`[smtp] transporter pronto (${host}:${port}, user=${user})`);
  return _transporter;
}
function getSmtpFrom() {
  return `"Torres Vigil\xE2ncia Patrimonial" <${process.env.SMTP_FROM || process.env.SMTP_USER || "escolta@torresseguranca.com.br"}>`;
}
function haversineDist(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 31) << shift;
      shift += 5;
    } while (byte >= 32);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 31) << shift;
      shift += 5;
    } while (byte >= 32);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}
function distPointToSegment(pt, a, b) {
  const toRad = (d) => d * Math.PI / 180;
  const px = toRad(pt.lng) * Math.cos(toRad(pt.lat));
  const py = toRad(pt.lat);
  const ax = toRad(a.lng) * Math.cos(toRad(a.lat));
  const ay = toRad(a.lat);
  const bx = toRad(b.lng) * Math.cos(toRad(b.lat));
  const by = toRad(b.lat);
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 0) {
    t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  }
  const cx = ax + t * dx, cy = ay + t * dy;
  const dLat = py - cy, dLng = px - cx;
  return Math.sqrt(dLat * dLat + dLng * dLng) * 6371e3;
}
function distToPolyline(pt, polyline) {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) return haversineDist(pt.lat, pt.lng, polyline[0].lat, polyline[0].lng);
  let minDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distPointToSegment(pt, polyline[i], polyline[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}
function findClosestIndex(pt, polyline) {
  let minDist = Infinity, idx = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distPointToSegment(pt, polyline[i], polyline[i + 1]);
    if (d < minDist) {
      minDist = d;
      idx = i + 1;
    }
  }
  return idx;
}
function toSafeUser(user) {
  const { password, ...safe } = user;
  return {
    ...safe,
    mustChangePassword: user.mustChangePassword === 1 || user.mustChangePassword === true
  };
}
async function logFinancialAudit(targetTable, targetId, action, changes, changedBy, changedById, reason) {
  try {
    const rows = changes.map((c) => ({
      target_table: targetTable,
      target_id: targetId,
      action,
      field_name: c.field,
      old_value: c.old != null ? String(c.old) : null,
      new_value: c.new_val != null ? String(c.new_val) : null,
      changed_by: changedBy,
      changed_by_id: changedById || null,
      reason: reason || null
    }));
    await supabaseAdmin.from("financial_audit_logs").insert(rows);
  } catch (_e) {
  }
}
async function createAutoTransaction(params) {
  try {
    if (params.origin_type && params.origin_id) {
      const { data: existing } = await supabaseAdmin.from("financial_transactions").select("id, conciliado_em").eq("origin_type", params.origin_type).eq("origin_id", params.origin_id).limit(1);
      if (existing && existing.length > 0) {
        if (existing[0].conciliado_em) {
          console.log(`[AutoTransaction] Pulando atualiza\xE7\xE3o \u2014 transa\xE7\xE3o ${existing[0].id} j\xE1 conciliada em ${existing[0].conciliado_em}`);
          return existing[0];
        }
        const { data: updated, error: upErr } = await supabaseAdmin.from("financial_transactions").update({
          description: params.description,
          amount: params.amount,
          type: params.type,
          due_date: params.due_date,
          category_name: params.category_name || null,
          entity_name: params.entity_name || null
        }).eq("id", existing[0].id).select().single();
        if (upErr) console.error("[AutoTransaction] update error:", upErr.message);
        return updated;
      }
    }
    const { data, error } = await supabaseAdmin.from("financial_transactions").insert({
      description: params.description,
      amount: params.amount,
      type: params.type,
      status: "PENDING",
      due_date: params.due_date,
      origin_type: params.origin_type,
      origin_id: params.origin_id,
      category_name: params.category_name || null,
      entity_name: params.entity_name || null,
      created_by: params.created_by || "SISTEMA"
    }).select().single();
    if (error) console.error("[AutoTransaction] create error:", error.message);
    return data;
  } catch (e) {
    console.error("[AutoTransaction] create exception:", e.message);
    return null;
  }
}
async function removeAutoTransaction(origin_type, origin_id) {
  try {
    const { error } = await supabaseAdmin.from("financial_transactions").delete().eq("origin_type", origin_type).eq("origin_id", origin_id);
    if (error) console.error("[AutoTransaction] remove error:", error.message);
  } catch (e) {
    console.error("[AutoTransaction] remove exception:", e.message);
  }
}
var _transporter, _transporterInitTried, SMTP_BCC_OS, SMTP_BCC_WELCOME, MISSION_STEPS, STEP_REQUIRED_PHOTOS;
var init_helpers = __esm({
  "server/routes/_helpers.ts"() {
    "use strict";
    init_supabase();
    init_pg_fallback();
    _transporter = null;
    _transporterInitTried = false;
    SMTP_BCC_OS = ["thiago@grupotmseg.com.br", "operacional@grupotmseg.com.br"];
    SMTP_BCC_WELCOME = ["thiago@grupotmseg.com.br"];
    MISSION_STEPS = [
      "aguardando",
      "checkout_armamento",
      "checkout_viatura",
      "checkout_km_saida",
      "em_transito_origem",
      "checkin_chegada_km",
      "checkin_veiculo_escoltado",
      "checkin_dados_motorista",
      "iniciar_missao",
      "em_transito_destino",
      "chegada_destino",
      "checkout_km_final",
      "checkout_viatura_retorno",
      "finalizada",
      "retorno_base",
      "chegada_base",
      "encerrada"
    ];
    STEP_REQUIRED_PHOTOS = {
      checkout_armamento: ["arma_pistola_1", "arma_pistola_2", "arma_espingarda"],
      checkout_viatura: ["viatura_frente", "viatura_lateral_esq", "viatura_lateral_dir", "viatura_traseira"],
      checkout_km_saida: ["km_saida"],
      checkin_chegada_km: ["km_chegada", "agente_equipado"],
      checkin_veiculo_escoltado: ["escoltado_frente", "escoltado_traseira"],
      chegada_destino: ["foto_local_destino", "km_final"],
      checkout_km_final: ["km_final"],
      checkout_viatura_retorno: ["viatura_retorno_frente", "viatura_retorno_lateral_esq", "viatura_retorno_lateral_dir", "viatura_retorno_traseira"],
      chegada_base: ["base_viatura_frente", "base_viatura_lateral_esq", "base_viatura_lateral_dir", "base_viatura_traseira", "base_hodometro"]
    };
  }
});

// server/lib/swr-cache.ts
function bustSwrCache(prefix) {
  if (!prefix) {
    store.clear();
    inflight.clear();
    persistChecked.clear();
    if (!PERSIST_DISABLED) {
      void supabaseAdmin.from(PERSIST_TABLE).delete().neq("key", "").then(() => {
      });
    }
    return;
  }
  for (const k of Array.from(store.keys())) {
    if (k === prefix || k.startsWith(prefix)) store.delete(k);
  }
  for (const k of Array.from(inflight.keys())) {
    if (k === prefix || k.startsWith(prefix)) inflight.delete(k);
  }
  for (const k of Array.from(persistChecked)) {
    if (k === prefix || k.startsWith(prefix)) persistChecked.delete(k);
  }
  if (!PERSIST_DISABLED) {
    void supabaseAdmin.from(PERSIST_TABLE).delete().like("key", `${prefix}%`).then(() => {
    });
  }
}
var store, inflight, PERSIST_TABLE, PERSIST_DISABLED, persistChecked, MAX_PERSIST_AGE_MS;
var init_swr_cache = __esm({
  "server/lib/swr-cache.ts"() {
    "use strict";
    init_supabase();
    store = /* @__PURE__ */ new Map();
    inflight = /* @__PURE__ */ new Map();
    PERSIST_TABLE = "swr_cache_snapshots";
    PERSIST_DISABLED = !!process.env.NODE_TEST_CONTEXT || process.env.NODE_ENV === "test";
    persistChecked = /* @__PURE__ */ new Set();
    MAX_PERSIST_AGE_MS = 24 * 60 * 60 * 1e3;
  }
});

// server/lib/balanco-cache.ts
function bustBalancoCaches() {
  bustSwrCache("operational-grid");
  bustSwrCache("financial-dashboard");
}
var init_balanco_cache = __esm({
  "server/lib/balanco-cache.ts"() {
    "use strict";
    init_swr_cache();
  }
});

// server/lib/asaas-helpers.ts
function buildInvoiceDescription(_clientName, periodoInicio, periodoFim, _osCount) {
  const inicioDate = /* @__PURE__ */ new Date(periodoInicio + "T12:00:00Z");
  const fimDate = /* @__PURE__ */ new Date(periodoFim + "T12:00:00Z");
  const inicio = inicioDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const fim = fimDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const mesRef = MESES_PT[inicioDate.getUTCMonth()];
  const anoRef = inicioDate.getUTCFullYear();
  return `Referente aos servi\xE7os de Escolta Armada - Per\xEDodo: ${inicio} a ${fim} (${mesRef}/${anoRef})`;
}
function parseInvoicePeriodInfo(description, dueDateISO) {
  const desc = String(description || "");
  const m = desc.match(
    /Per[íi]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})\s*\(([^)]+)\)/i
  );
  if (m) {
    const inicio = m[1];
    const fim = m[2];
    const competencia2 = m[3].trim();
    const dataExecucao = inicio === fim ? inicio : `${inicio} a ${fim}`;
    return { competencia: competencia2, dataExecucao };
  }
  let competencia = "";
  if (dueDateISO) {
    const d = /* @__PURE__ */ new Date(String(dueDateISO).slice(0, 10) + "T12:00:00Z");
    if (!isNaN(d.getTime())) {
      competencia = `${MESES_PT[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
    }
  }
  return { competencia, dataExecucao: "" };
}
function formatNfNumber(nfseNumber) {
  const n = String(nfseNumber || "").trim();
  if (!n) return null;
  if (n.toLowerCase().startsWith("inv_")) return null;
  return n;
}
function buildNfClientEmail(invoice) {
  const dueDateFormatted = (/* @__PURE__ */ new Date(invoice.due_date + "T12:00:00")).toLocaleDateString("pt-BR");
  const valueFormatted = fmtBRL(invoice.value);
  const inssRetido = Number(invoice.valor_inss_retido || 0);
  const temInss = inssRetido > 5e-3;
  const inssAliq = Number(invoice.inss_aliquota || 0);
  const liquidoPagar = temInss ? Number((invoice.value - inssRetido).toFixed(2)) : invoice.value;
  const liquidoFormatted = fmtBRL(liquidoPagar);
  const inssFormatted = fmtBRL(inssRetido);
  const pixCode = String(invoice.pix_copia_e_cola || "").trim();
  const { competencia, dataExecucao } = parseInvoicePeriodInfo(invoice.description, invoice.due_date);
  const nfNumber = formatNfNumber(invoice.nfse_number);
  const subject = nfNumber ? `Presta\xE7\xE3o de Servi\xE7o de Escolta Armada Torres \u2013 NF n\xBA ${nfNumber}` : `Presta\xE7\xE3o de Servi\xE7o de Escolta Armada Torres`;
  const links = [];
  if (invoice.bank_slip_url) {
    links.push(`<a href="${invoice.bank_slip_url}" style="display:inline-block;background:#0066cc;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;margin:4px;">\u{1F3E6} BOLETO BANC\xC1RIO</a>`);
  }
  if (invoice.nfse_url) {
    links.push(`<a href="${invoice.nfse_url}" style="display:inline-block;background:#059669;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;margin:4px;">\u{1F4CB} NOTA FISCAL</a>`);
  }
  const infoRow = (label, val) => `<tr><td style="padding:5px 0;color:#666;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:5px 0;font-weight:bold;text-align:right;color:#1a1a2e;">${val}</td></tr>`;
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;">
<div style="max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <div style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#fff;font-size:18px;margin:0;">Torres Vigil\xE2ncia Patrimonial</h1>
    <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Escolta Armada</p>
  </div>
  <div style="padding:24px;">
    <p style="font-size:14px;color:#1a1a1a;margin:0 0 16px;">Prezados,</p>
    <p style="font-size:13px;color:#4a4a4a;line-height:1.6;margin:0 0 16px;">
      Encaminhamos abaixo as informa\xE7\xF5es referentes \xE0 presta\xE7\xE3o de servi\xE7o de escolta armada:
    </p>
    <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:0 0 20px;">
      <table style="width:100%;font-size:13px;color:#333;">
        ${infoRow("Compet\xEAncia:", competencia || "\u2014")}
        ${infoRow("Data de Execu\xE7\xE3o:", dataExecucao || "\u2014")}
        ${infoRow("N\xBA da Nota Fiscal:", nfNumber || "\u2014")}
        ${infoRow("Servi\xE7o Prestado:", "Escolta Armada")}
        ${infoRow("Valor Total da Presta\xE7\xE3o de Servi\xE7o:", valueFormatted)}
        ${temInss ? `
        ${infoRow(`(-) Reten\xE7\xE3o INSS${inssAliq ? ` (${inssAliq.toFixed(2).replace(".", ",")}%)` : ""}:`, `- ${inssFormatted}`)}
        ${infoRow("Valor l\xEDquido a pagar:", liquidoFormatted)}
        ` : ``}
        ${infoRow("Vencimento:", dueDateFormatted)}
      </table>
    </div>
    <p style="font-size:13px;color:#4a4a4a;line-height:1.6;margin:0 0 8px;">
      Para pagamento, disponibilizamos as seguintes op\xE7\xF5es:
    </p>
    <ul style="font-size:13px;color:#333;line-height:1.6;margin:0 0 16px;padding-left:20px;">
      <li><strong>Boleto Banc\xE1rio</strong></li>
      ${pixCode ? `<li><strong>PIX (Copia e Cola):</strong></li>` : ``}
    </ul>
    ${pixCode ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin:0 0 20px;">
      <div style="background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:10px;word-break:break-all;font-family:monospace;font-size:12px;color:#166534;text-align:center;">
        ${pixCode}
      </div>
    </div>` : ``}
    ${links.length > 0 ? `<div style="text-align:center;margin:20px 0;">${links.join("\n")}</div>` : ""}
    <p style="font-size:13px;color:#4a4a4a;line-height:1.6;margin:20px 0 0;">
      Permanecemos \xE0 disposi\xE7\xE3o para quaisquer esclarecimentos.
    </p>
    <p style="font-size:12px;color:#888;line-height:1.5;margin:16px 0 0;">
      Em caso de d\xFAvidas, entre em contato conosco pelo e-mail 
      <a href="mailto:diretoria@torresseguranca.com.br" style="color:#1a1a2e;">diretoria@torresseguranca.com.br</a> 
      ou pelo telefone (11) 96369-6699.
    </p>
  </div>
  <div style="background:#f8f9fa;padding:16px;text-align:center;border-top:1px solid #eee;">
    <p style="color:#888;font-size:11px;margin:2px 0;"><strong>Torres Vigil\xE2ncia Patrimonial</strong></p>
    <p style="color:#999;font-size:10px;margin:2px 0;">CNPJ 36.982.392/0001-89</p>
    <p style="color:#999;font-size:10px;margin:2px 0;">\u{1F4DE} (11) 96369-6699 | \u2709\uFE0F escolta@torresseguranca.com.br</p>
  </div>
</div>
</body></html>`;
  return { subject, html };
}
function buildInssObservation(retemInss, aliquota, valor) {
  if (!retemInss) return INSS_DISPENSA_OBSERVACAO;
  return `${INSS_OBSERVACAO_LEGAL} Al\xEDquota: ${aliquota.toFixed(2)}%. Valor retido: R$ ${valor.toFixed(2).replace(".", ",")}.`;
}
function buildValoresObservation(grossValue, retemInss, inssAliquota) {
  const brl = (v) => `R$ ${v.toFixed(2).replace(".", ",")}`;
  if (!retemInss) return `Valor bruto: ${brl(grossValue)}.`;
  const inssValor = Number((grossValue * inssAliquota / 100).toFixed(2));
  const liquido = Number((grossValue - inssValor).toFixed(2));
  return `Valor bruto: ${brl(grossValue)}. INSS retido (${inssAliquota.toFixed(2)}%): ${brl(inssValor)}. Valor l\xEDquido: ${brl(liquido)}.`;
}
function netBoletoValue(grossValue, opts) {
  const retemInss = !!opts?.retemInss;
  const inssAliquota = retemInss ? Number(opts?.inssAliquota ?? 11) : 0;
  const inssValor = retemInss ? Number((grossValue * inssAliquota / 100).toFixed(2)) : 0;
  const boleto = Number((grossValue - inssValor).toFixed(2));
  return { boleto, inssValor, inssAliquota };
}
function todayDateStr() {
  return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
}
function buildNfseInvoicePayload(opts) {
  const retemInss = !!opts.retemInss;
  const inssAliquota = retemInss ? Number(opts.inssAliquota ?? 11) : 0;
  const inssValor = retemInss ? Number((opts.value * inssAliquota / 100).toFixed(2)) : 0;
  const inssObs = buildInssObservation(retemInss, inssAliquota, inssValor);
  const baseObs = opts.observations || `CNAE ${CNAE_PRINCIPAL}. ${opts.description || ""}`.trim();
  const serviceDescription = opts.description && opts.description.trim() || DESCRICAO_SERVICO_FIXA;
  const payload = {
    serviceDescription,
    observations: `${baseObs} ${inssObs} ${SIMPLES_NACIONAL_OBSERVACAO} ${buildValoresObservation(opts.value, retemInss, inssAliquota)}`.trim(),
    value: opts.value,
    deductions: 0,
    effectiveDate: todayDateStr(),
    municipalServiceCode: CODIGO_SERVICO_MUNICIPAL_CODE,
    municipalServiceName: DESCRICAO_SERVICO_FIXA,
    taxes: {
      retainIss: false,
      iss: ISS_ALIQUOTA,
      cofins: 0,
      csll: 0,
      inss: inssAliquota,
      ir: 0,
      pis: 0
    }
  };
  if (opts.municipalServiceIdOverride) {
    payload.municipalServiceId = opts.municipalServiceIdOverride;
  }
  if (opts.paymentId) payload.payment = opts.paymentId;
  if (opts.customerId) payload.customer = opts.customerId;
  return payload;
}
function fmtBRL(val) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function isValidEmail(raw) {
  const s = String(raw || "").trim();
  if (!s) return false;
  const parts = s.split(/[;,]\s*/).map((e) => e.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return parts.every((e) => re.test(e));
}
function shouldBlockNfEmission(clientEmail) {
  return clientEmail !== void 0 && !isValidEmail(clientEmail);
}
function isNfErrorStatus(status) {
  return NF_ERROR_STATUSES.includes(String(status || "").toUpperCase());
}
function isNfOkStatus(status) {
  return NF_OK_STATUSES.includes(String(status || "").toUpperCase());
}
function extractConcreteNfErrorMessage(nfObj) {
  const candidates = [
    nfObj?.rejectionReason,
    nfObj?.rejectionMessage,
    nfObj?.statusDescription,
    nfObj?.errorMessage,
    nfObj?.error,
    Array.isArray(nfObj?.errors) ? nfObj.errors[0]?.description || nfObj.errors[0]?.message || nfObj.errors[0]?.code : void 0,
    nfObj?.observations
  ];
  for (const c of candidates) {
    const s = String(c || "").trim();
    if (s) return s.slice(0, 1e3);
  }
  return null;
}
function genericNfErrorMessage(status) {
  const st = String(status || "ERRO").toUpperCase();
  return `NF com erro no Asaas (status: ${st}). Verifique os dados do cliente (e-mail, endere\xE7o, inscri\xE7\xE3o municipal) e use "Resolver agora" para reemitir.`;
}
function resolveNfErrorMessage(nfObj, status, existing) {
  const concrete = extractConcreteNfErrorMessage(nfObj);
  if (concrete) return concrete;
  const prev = String(existing || "").trim();
  if (prev) return prev;
  return genericNfErrorMessage(status || nfObj?.status);
}
var TORRES_CNPJ, CNAE_PRINCIPAL, CODIGO_SERVICO_MUNICIPAL_CODE, ISS_ALIQUOTA, DESCRICAO_SERVICO_FIXA, INSS_OBSERVACAO_LEGAL, INSS_DISPENSA_OBSERVACAO, SIMPLES_NACIONAL_OBSERVACAO, MESES_PT, cleanCnpj, MISSING_EMAIL_NF_MSG, NF_ERROR_STATUSES, NF_OK_STATUSES;
var init_asaas_helpers = __esm({
  "server/lib/asaas-helpers.ts"() {
    "use strict";
    TORRES_CNPJ = "36982392000189";
    CNAE_PRINCIPAL = "7870";
    CODIGO_SERVICO_MUNICIPAL_CODE = "07870";
    ISS_ALIQUOTA = 0;
    DESCRICAO_SERVICO_FIXA = "Vigil\xE2ncia, seguran\xE7a ou monitoramento de bens, pessoas e semoventes";
    INSS_OBSERVACAO_LEGAL = "Reten\xE7\xE3o de INSS sobre cess\xE3o de m\xE3o-de-obra (Anexo IV) \u2014 Art. 111, II da IN RFB n\xBA 2.110/2022.";
    INSS_DISPENSA_OBSERVACAO = "De acordo com o artigo 115 da IN RFB n\xBA 2.110/2022, a contratante fica dispensada de efetuar a reten\xE7\xE3o de INSS.";
    SIMPLES_NACIONAL_OBSERVACAO = "Empresa optante pelo Simples Nacional. Dispensada da reten\xE7\xE3o de PIS, COFINS e CSLL, conforme art. 30 da Lei n\xBA 10.833/2003.";
    MESES_PT = [
      "Janeiro",
      "Fevereiro",
      "Mar\xE7o",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro"
    ];
    cleanCnpj = (v) => String(v || "").replace(/\D/g, "");
    MISSING_EMAIL_NF_MSG = 'NF n\xE3o emitida: e-mail do cliente ausente ou inv\xE1lido no cadastro. Preencha o e-mail do cliente e clique em "Resolver agora" para reemitir.';
    NF_ERROR_STATUSES = ["ERROR", "ERRO", "REJECTED", "DENIED", "FAILED", "FALHA"];
    NF_OK_STATUSES = ["AUTHORIZED", "SYNCHRONIZED", "ISSUED"];
  }
});

// server/asaas.ts
var asaas_exports = {};
__export(asaas_exports, {
  PAID_STATUSES: () => PAID_STATUSES,
  autoLinkOrphanBillingsForInvoice: () => autoLinkOrphanBillingsForInvoice,
  emitInvoiceAuto: () => emitInvoiceAuto,
  getAsaasBalance: () => getAsaasBalance,
  isAlreadyPaidStatus: () => isAlreadyPaidStatus,
  isStatusRegression: () => isStatusRegression,
  nfReconcileState: () => nfReconcileState,
  normalizeBoletimStatus: () => normalizeBoletimStatus,
  normalizeInvoiceStatus: () => normalizeInvoiceStatus,
  reconcileAllInvoicesAsaas: () => reconcileAllInvoicesAsaas,
  reconcileInvoiceFromAsaas: () => reconcileInvoiceFromAsaas,
  registerAsaasRoutes: () => registerAsaasRoutes
});
function isStatusRegression(incoming) {
  return REGRESSION_STATUSES.includes(String(incoming || "").toUpperCase());
}
function isAlreadyPaidStatus(status) {
  return PAID_STATUSES.includes(String(status || "").toUpperCase());
}
function getApiKey() {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("ASAAS_API_KEY n\xE3o configurada");
  return key;
}
function buildNfseInvoicePayload2(opts) {
  const raw = process.env.ASAAS_MUNICIPAL_SERVICE_ID;
  let override;
  if (raw && raw.trim()) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) {
      override = n;
    } else {
      console.error(`[asaas] \u26A0\uFE0F  ASAAS_MUNICIPAL_SERVICE_ID inv\xE1lida ("${raw}") \u2014 NFS-e pode sair com c\xF3digo errado. Esperado: n\xFAmero positivo (ex: 402 para c\xF3digo 07870).`);
    }
  } else {
    console.warn("[asaas] \u26A0\uFE0F  ASAAS_MUNICIPAL_SERVICE_ID n\xE3o definida \u2014 Asaas usar\xE1 o servi\xE7o default da conta (risco de emitir com c\xF3digo errado).");
  }
  const payload = buildNfseInvoicePayload({
    ...opts,
    municipalServiceIdOverride: override
  });
  console.log("[asaas] NFS-e payload:", JSON.stringify({
    municipalServiceCode: payload.municipalServiceCode,
    municipalServiceName: payload.municipalServiceName,
    municipalServiceId: payload.municipalServiceId ?? "(omitido)"
  }));
  return payload;
}
async function sendBillingEmail(invoice, clientEmail) {
  const transporter = createSmtpTransporter();
  if (!transporter || !clientEmail) {
    console.log(`[billing-email] Skipped: ${!transporter ? "SMTP not configured" : "No client email"}`);
    return;
  }
  const { subject, html } = buildNfClientEmail(invoice);
  try {
    await transporter.sendMail({
      from: getSmtpFrom(),
      to: clientEmail,
      bcc: ["thiago@grupotmseg.com.br", "financeiro@torresseguranca.com.br"],
      subject,
      html
    });
    await supabaseAdmin.from("invoices").update({
      email_sent: true,
      email_sent_at: nowBRTString(),
      email_sent_to: clientEmail
    }).eq("id", invoice.id);
    console.log(`[billing-email] \u2713 Fatura #${invoice.id} enviada para ${clientEmail}`);
  } catch (err) {
    console.error(`[billing-email] \u2717 Erro ao enviar fatura #${invoice.id} para ${clientEmail}: ${err.message}`);
  }
}
async function emitNfseImmediate(opts) {
  if (shouldBlockNfEmission(opts.clientEmail)) {
    throw new Error(MISSING_EMAIL_NF_MSG);
  }
  const payload = buildNfseInvoicePayload2(opts);
  const result = await asaasRequest("POST", "/invoices", payload);
  const nfId = result.id;
  console.log(`[asaas] NFS-e criada via /invoices: id=${nfId}, status=${result.status}`);
  if (nfId && result.status !== "AUTHORIZED" && result.status !== "PROCESSING") {
    try {
      const authResult = await asaasRequest("POST", `/invoices/${nfId}/authorize`);
      console.log(`[asaas] NFS-e ${nfId} authorize called: status=${authResult.status}`);
      return { id: nfId, status: authResult.status || "AUTHORIZED", number: authResult.number ? String(authResult.number) : void 0 };
    } catch (authErr) {
      console.log(`[asaas] NFS-e ${nfId} authorize failed (non-blocking): ${authErr.message}`);
    }
  }
  return { id: nfId, status: result.status || "SCHEDULED", number: result.number ? String(result.number) : void 0 };
}
function normalizeInvoiceStatus(invoice, opts) {
  const payStatus = String(invoice?.status || "").toUpperCase();
  const nfStatus = String(invoice?.nfse_status || "").toUpperCase();
  const emiteNf = opts?.emiteNf !== false;
  if (["RECEIVED", "CONFIRMED", "PAGO", "RECEIVED_IN_CASH"].includes(payStatus)) return "PAGO";
  if (["CANCELLED", "CANCELED"].includes(payStatus)) return "NF_CANCELADA";
  if (!emiteNf) {
    if (payStatus === "OVERDUE") return "VENCIDO";
    return "AGUARDANDO_PAGAMENTO";
  }
  if (nfStatus.includes("CANCEL")) return "NF_CANCELADA";
  if (["ERROR", "ERRO", "REJECTED", "DENIED", "FAILED", "FALHA"].includes(nfStatus)) return "NF_ERRO";
  if (["AUTHORIZED", "SYNCHRONIZED", "ISSUED"].includes(nfStatus)) return "NF_EMITIDA";
  if (["PROCESSING", "WAITING_MUNICIPAL_PROCESSING", "SCHEDULED", "PENDING"].includes(nfStatus)) return "NF_PROCESSANDO";
  if (payStatus === "OVERDUE") return "VENCIDO";
  return "AUTORIZADO";
}
function normalizeBoletimStatus(approval) {
  const st = String(approval?.status || "").toUpperCase();
  if (st === "PENDENTE") return "PENDENTE_APROVACAO";
  if (st === "APROVADO") return "AUTORIZADO";
  return "OUTRO";
}
async function autoLinkOrphanBillingsForInvoice(invoice, opts = {}) {
  const dryRun = !!opts.dryRun;
  try {
    if (!invoice?.id) return { linked: 0, reason: "invoice inv\xE1lida" };
    if (!invoice.value || Number(invoice.value) <= 0) return { linked: 0, reason: "valor zero" };
    const { data: already } = await supabaseAdmin.from("escort_billings").select("id").eq("invoice_id", invoice.id).limit(1);
    if (already && already.length > 0) return { linked: 0, reason: "j\xE1 vinculada" };
    const target = Number(invoice.value);
    const invCnpj = cleanCnpj(invoice.client_cpf_cnpj);
    const candidateClientIds = /* @__PURE__ */ new Set();
    if (invoice.client_id) candidateClientIds.add(Number(invoice.client_id));
    if (invCnpj && invCnpj !== TORRES_CNPJ) {
      const root = invCnpj.slice(0, 8);
      const { data: matched } = await supabaseAdmin.from("clients").select("id, cnpj").like("cnpj", `${root}%`).limit(20);
      for (const c of matched || []) {
        const cn = cleanCnpj(c.cnpj);
        if (cn === invCnpj || cn.startsWith(root)) candidateClientIds.add(c.id);
      }
    }
    if (candidateClientIds.size === 0) {
      return { linked: 0, reason: `Sem CNPJ v\xE1lido na fatura (CNPJ inv: ${invoice.client_cpf_cnpj || "\u2014"}) \u2014 n\xE3o foi poss\xEDvel identificar o cliente no cadastro` };
    }
    const desc = String(invoice.description || "");
    const pm = desc.match(/(\d{2}\/\d{2}\/\d{4})\s*(?:a|até|-)\s*(\d{2}\/\d{2}\/\d{4})/i);
    let periodStart, periodEnd, periodSource;
    if (pm) {
      const [d1, m1, y1] = pm[1].split("/");
      const [d2, m2, y2] = pm[2].split("/");
      periodStart = `${y1}-${m1}-${d1}`;
      periodEnd = `${y2}-${m2}-${d2}`;
      periodSource = "descri\xE7\xE3o";
    } else if (invoice.due_date) {
      const due = String(invoice.due_date).slice(0, 10);
      const dueDate = /* @__PURE__ */ new Date(`${due}T12:00:00-03:00`);
      const start = new Date(dueDate);
      start.setDate(start.getDate() - 45);
      periodStart = start.toISOString().slice(0, 10);
      periodEnd = due;
      periodSource = "vencimento -45d";
    } else {
      const cr = String(invoice.created_at || "").slice(0, 10) || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const crDate = /* @__PURE__ */ new Date(`${cr}T12:00:00-03:00`);
      const start = new Date(crDate);
      start.setDate(start.getDate() - 45);
      const end = new Date(crDate);
      end.setDate(end.getDate() + 15);
      periodStart = start.toISOString().slice(0, 10);
      periodEnd = end.toISOString().slice(0, 10);
      periodSource = "cria\xE7\xE3o \xB1";
    }
    const { data: orphans } = await supabaseAdmin.from("escort_billings").select("id, client_id, fat_total, fat_acionamento, fat_hora_extra, fat_km, despesas_pedagio, receitas_os, valor_franquia, valor_km_extra, status, data_missao").in("client_id", Array.from(candidateClientIds)).is("invoice_id", null).gte("data_missao", `${periodStart}T00:00:00-03:00`).lte("data_missao", `${periodEnd}T23:59:59-03:00`).neq("status", "CANCELADO").neq("status", "REJEITADA").limit(500);
    if (!orphans || orphans.length === 0) {
      return { linked: 0, reason: `Nenhuma OS aprovada/em medi\xE7\xE3o no per\xEDodo ${periodStart}\u2192${periodEnd} (${periodSource}) para ${invoice.client_name || "cliente"} (CNPJ ${invoice.client_cpf_cnpj || "\u2014"})` };
    }
    const valorOf = (b) => {
      const v = Number(b.fat_total || 0);
      if (v > 0) return v;
      return Number(b.fat_acionamento || b.valor_franquia || 0) + Number(b.fat_hora_extra || 0) + Number(b.fat_km || b.valor_km_extra || 0) + Number(b.despesas_pedagio || 0) + Number(b.receitas_os || 0);
    };
    const tol = Math.max(target * 0.02, 1);
    const totalSum = orphans.reduce((s, b) => s + valorOf(b), 0);
    if (Math.abs(totalSum - target) <= tol) {
      const ids = orphans.map((b) => b.id);
      if (!dryRun) {
        const { error } = await supabaseAdmin.from("escort_billings").update({ invoice_id: invoice.id, status: "FATURADO" }).in("id", ids);
        if (error) return { linked: 0, reason: error.message };
        bustBalancoCaches();
        console.log(`[auto-link] invoice #${invoice.id} (${invoice.client_name}): ${ids.length} OS vinculadas (TODAS, soma R$${totalSum.toFixed(2)} \u2248 R$${target.toFixed(2)}, ${periodSource})`);
      }
      return { linked: ids.length, matchedBy: "soma_total" };
    }
    const single = orphans.find((b) => Math.abs(valorOf(b) - target) <= tol);
    if (single) {
      if (!dryRun) {
        const { error } = await supabaseAdmin.from("escort_billings").update({ invoice_id: invoice.id, status: "FATURADO" }).eq("id", single.id);
        if (error) return { linked: 0, reason: error.message };
        bustBalancoCaches();
        console.log(`[auto-link] invoice #${invoice.id} (${invoice.client_name}): 1 OS vinculada (single match R$${valorOf(single).toFixed(2)} \u2248 R$${target.toFixed(2)}, ${periodSource})`);
      }
      return { linked: 1, matchedBy: "single_billing" };
    }
    const cents = orphans.slice(0, 12).map((b) => ({ id: b.id, c: Math.round(valorOf(b) * 100) }));
    const targetC = Math.round(target * 100);
    const tolC = Math.round(tol * 100);
    let bestSubset = null;
    let bestDiff = Infinity;
    const n = cents.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      let sum = 0;
      const picks = [];
      for (let i = 0; i < n; i++) if (mask & 1 << i) {
        sum += cents[i].c;
        picks.push(cents[i].id);
      }
      const diff = Math.abs(sum - targetC);
      if (diff <= tolC && diff < bestDiff) {
        bestDiff = diff;
        bestSubset = picks;
        if (diff === 0) break;
      }
    }
    if (bestSubset && bestSubset.length > 0) {
      if (!dryRun) {
        const { error } = await supabaseAdmin.from("escort_billings").update({ invoice_id: invoice.id, status: "FATURADO" }).in("id", bestSubset);
        if (error) return { linked: 0, reason: error.message };
        bustBalancoCaches();
        console.log(`[auto-link] invoice #${invoice.id} (${invoice.client_name}): ${bestSubset.length} OS vinculadas (subset diff R$${(bestDiff / 100).toFixed(2)}, ${periodSource})`);
      }
      return { linked: bestSubset.length, matchedBy: "subset" };
    }
    const valores = orphans.map(valorOf).sort((a, b) => b - a).slice(0, 5).map((v) => `R$${v.toFixed(2)}`).join(", ");
    const gap = target - totalSum;
    const gapLabel = gap > 0 ? `Faltam R$${gap.toFixed(2)} em medi\xE7\xF5es para fechar o valor da fatura \u2014 provavelmente o operacional ainda n\xE3o cadastrou/aprovou todas as OS desse per\xEDodo.` : `Excesso de R$${Math.abs(gap).toFixed(2)} em medi\xE7\xF5es \u2014 a soma das OS \xE9 maior que a fatura. Confira se foi cobrado a menos ou se h\xE1 OS de outro per\xEDodo misturada.`;
    return { linked: 0, reason: `Encontradas ${orphans.length} OS aprovadas no per\xEDodo somando R$${totalSum.toFixed(2)} (${valores}${orphans.length > 5 ? "\u2026" : ""}), mas nenhuma combina\xE7\xE3o bate R$${target.toFixed(2)} (tol \xB1R$${tol.toFixed(2)}). ${gapLabel}` };
  } catch (e) {
    console.error(`[auto-link] erro inesperado invoice #${invoice?.id}:`, e?.message);
    return { linked: 0, reason: e?.message };
  }
}
async function reconcileInvoiceFromAsaas(invoice) {
  if (!invoice?.asaas_payment_id || !process.env.ASAAS_API_KEY) return { updated: false };
  const updates = {};
  let changed = false;
  let livePayment = null;
  try {
    const payment = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}`);
    livePayment = payment;
    if (payment?.status && payment.status !== invoice.status) {
      if (isAlreadyPaidStatus(invoice.status) && isStatusRegression(payment.status)) {
        console.log(`[reconcile] invoice #${invoice.id} status atual=${invoice.status} (pago) \u2014 IGNORANDO regress\xE3o p/ ${payment.status} vinda do Asaas.`);
      } else {
        updates.status = payment.status;
        changed = true;
      }
    }
    if (payment?.netValue && Number(payment.netValue) !== Number(invoice.net_value || 0)) {
      updates.net_value = payment.netValue;
      changed = true;
    }
    if (payment?.invoiceUrl && payment.invoiceUrl !== invoice.invoice_url) {
      updates.invoice_url = payment.invoiceUrl;
      changed = true;
    }
    const bsUrl = payment?.bankSlip?.url || payment?.bankSlipUrl;
    if (bsUrl && bsUrl !== invoice.bank_slip_url) {
      updates.bank_slip_url = bsUrl;
      changed = true;
    }
    if (payment?.paymentDate && payment.paymentDate !== invoice.payment_date) {
      updates.payment_date = payment.paymentDate;
      changed = true;
    }
  } catch (e) {
    console.log(`[reconcile] payment fetch invoice #${invoice.id} (${invoice.asaas_payment_id}): ${e.message}`);
  }
  const liveStatus = String(livePayment?.status || "").toUpperCase();
  const stillOpen = ["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"].includes(liveStatus);
  const customerId = livePayment?.customer;
  const targetValue = Number(livePayment?.value || invoice.value || 0);
  if (stillOpen && customerId && targetValue > 0) {
    try {
      const search = await asaasRequest("GET", `/payments?customer=${encodeURIComponent(customerId)}&status=RECEIVED&limit=50`);
      const candidates = (search?.data || []).filter((p) => {
        if (!p?.id || p.id === invoice.asaas_payment_id) return false;
        if (Math.abs(Number(p.value || 0) - targetValue) > 0.01) return false;
        const desc = String(p.description || "").toLowerCase();
        return desc.includes("pix recebido") || desc.includes("pix recebida");
      });
      const free = [];
      for (const c of candidates) {
        const { data: linked } = await supabaseAdmin.from("invoices").select("id").eq("asaas_payment_id", c.id).limit(1);
        if (!linked || linked.length === 0) free.push(c);
      }
      if (free.length === 1) {
        const pix = free[0];
        console.log(`[reconcile] PIX \xF3rf\xE3o detectado p/ invoice #${invoice.id}: ${invoice.asaas_payment_id} (PENDING) \u2192 ${pix.id} (RECEIVED, R$${pix.value}, pago em ${pix.paymentDate})`);
        updates.asaas_payment_id = pix.id;
        updates.status = pix.status;
        if (pix.netValue) updates.net_value = pix.netValue;
        if (pix.paymentDate) updates.payment_date = pix.paymentDate;
        if (pix.invoiceUrl) updates.invoice_url = pix.invoiceUrl;
        changed = true;
      } else if (free.length > 1) {
        console.log(`[reconcile] invoice #${invoice.id} tem ${free.length} candidatos PIX \xF3rf\xE3os \u2014 pulando auto-relink (precisa decis\xE3o manual): ${free.map((c) => c.id).join(", ")}`);
      }
    } catch (e) {
      console.log(`[reconcile] busca PIX \xF3rf\xE3o p/ invoice #${invoice.id}: ${e.message}`);
    }
  }
  if (invoice.nfse_number && String(invoice.nfse_number).startsWith("inv_")) {
    try {
      const nf = await asaasRequest("GET", `/invoices/${invoice.nfse_number}`);
      if (nf?.status && nf.status !== invoice.nfse_status) {
        updates.nfse_status = nf.status;
        changed = true;
      }
      if (nf?.status && isNfErrorStatus(nf.status)) {
        const msg = resolveNfErrorMessage(nf, nf.status, invoice.nfse_error_message);
        if (msg !== invoice.nfse_error_message) {
          updates.nfse_error_message = msg;
          changed = true;
        }
      } else if (nf?.status && isNfOkStatus(nf.status) && invoice.nfse_error_message) {
        updates.nfse_error_message = null;
        changed = true;
      }
      if (nf?.pdfUrl && nf.pdfUrl !== invoice.nfse_url) {
        updates.nfse_url = nf.pdfUrl;
        changed = true;
      } else if (nf?.xmlUrl && !invoice.nfse_url) {
        updates.nfse_url = nf.xmlUrl;
        changed = true;
      }
      if (nf?.number && String(nf.number) !== invoice.nfse_number) {
        updates.nfse_number = String(nf.number);
        changed = true;
      }
    } catch (e) {
      console.log(`[reconcile] /invoices fetch invoice #${invoice.id}: ${e.message}`);
    }
  } else {
    try {
      const fi = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}/fiscalInfo`);
      if (fi?.status && fi.status !== invoice.nfse_status) {
        updates.nfse_status = fi.status;
        changed = true;
      }
      if (fi?.status && isNfErrorStatus(fi.status)) {
        const msg = resolveNfErrorMessage(fi, fi.status, invoice.nfse_error_message);
        if (msg !== invoice.nfse_error_message) {
          updates.nfse_error_message = msg;
          changed = true;
        }
      } else if (fi?.status && isNfOkStatus(fi.status) && invoice.nfse_error_message) {
        updates.nfse_error_message = null;
        changed = true;
      }
      if (fi?.externalUrl && fi.externalUrl !== invoice.nfse_url) {
        updates.nfse_url = fi.externalUrl;
        changed = true;
      }
      if (fi?.number && String(fi.number) !== invoice.nfse_number) {
        updates.nfse_number = String(fi.number);
        changed = true;
      } else if (fi?.rpsNumber && !invoice.nfse_number) {
        updates.nfse_number = `RPS-${fi.rpsNumber}`;
        changed = true;
      }
    } catch (_e) {
    }
  }
  if (changed) {
    updates.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    await supabaseAdmin.from("invoices").update(updates).eq("id", invoice.id);
  }
  try {
    await autoLinkOrphanBillingsForInvoice({ ...invoice, ...updates });
  } catch (e) {
    console.log(`[reconcile] auto-link falhou p/ invoice #${invoice.id}: ${e?.message}`);
  }
  return { updated: changed, changes: changed ? updates : void 0 };
}
async function reconcileAllInvoicesAsaas(opts) {
  if (!process.env.ASAAS_API_KEY) {
    nfReconcileState.lastError = "ASAAS_API_KEY n\xE3o configurada";
    return nfReconcileState;
  }
  if (nfReconcileState.running) return nfReconcileState;
  nfReconcileState.running = true;
  nfReconcileState.startedAt = (/* @__PURE__ */ new Date()).toISOString();
  nfReconcileState.processed = 0;
  nfReconcileState.updated = 0;
  nfReconcileState.errors = 0;
  nfReconcileState.lastError = null;
  const force = opts?.force === true;
  const pageSize = 100;
  const maxTotal = opts?.limit ?? 1e4;
  try {
    let offset = 0;
    let totalSeen = 0;
    while (totalSeen < maxTotal) {
      const { data: invoices, error } = await supabaseAdmin.from("invoices").select("*").not("asaas_payment_id", "is", null).order("updated_at", { ascending: true, nullsFirst: true }).range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!invoices || invoices.length === 0) break;
      for (const inv of invoices) {
        try {
          let skipReconcile = false;
          if (!force) {
            const payTerminal = ["RECEIVED", "CONFIRMED"].includes(String(inv.status || "").toUpperCase());
            const nfStatusUp = String(inv.nfse_status || "").toUpperCase();
            const numIsFinal = inv.nfse_number && !String(inv.nfse_number).startsWith("inv_");
            const isCanceled = ["CANCELED", "CANCELLED"].includes(nfStatusUp);
            const nfTerminal = isCanceled || ["AUTHORIZED", "SYNCHRONIZED"].includes(nfStatusUp) && numIsFinal && !!inv.nfse_url;
            const recentlyUpdated = inv.updated_at && Date.now() - new Date(inv.updated_at).getTime() < 8 * 60 * 1e3;
            if (payTerminal && nfTerminal) skipReconcile = true;
            if (recentlyUpdated && nfTerminal) skipReconcile = true;
          }
          if (!skipReconcile) {
            const r = await reconcileInvoiceFromAsaas(inv);
            nfReconcileState.processed += 1;
            if (r.updated) {
              nfReconcileState.updated += 1;
              console.log(`[reconcile] invoice #${inv.id} atualizada:`, JSON.stringify(r.changes));
            }
          } else {
            await autoLinkOrphanBillingsForInvoice(inv);
          }
        } catch (e) {
          nfReconcileState.errors += 1;
          nfReconcileState.lastError = e?.message || String(e);
        }
      }
      totalSeen += invoices.length;
      if (invoices.length < pageSize) break;
      offset += pageSize;
    }
    console.log(`[reconcile] pagina\xE7\xE3o conclu\xEDda: ${totalSeen} invoices percorridas`);
  } catch (e) {
    nfReconcileState.errors += 1;
    nfReconcileState.lastError = e?.message || String(e);
  } finally {
    nfReconcileState.completedAt = (/* @__PURE__ */ new Date()).toISOString();
    nfReconcileState.running = false;
    console.log(`[reconcile] conclu\xEDdo: processadas=${nfReconcileState.processed}, atualizadas=${nfReconcileState.updated}, erros=${nfReconcileState.errors}`);
  }
  return nfReconcileState;
}
async function asaasRequest(method, path3, body) {
  const apiKey = getApiKey();
  const url = `${ASAAS_API_URL}${path3}`;
  const headers = {
    "Content-Type": "application/json",
    "access_token": apiKey,
    "User-Agent": "TorresVP/1.0"
  };
  const opts = { method, headers };
  if (body && method !== "GET") {
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(url, opts);
  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { rawText: text };
  }
  if (!resp.ok) {
    const errMsg = data?.errors?.[0]?.description || data?.message || `Asaas API error ${resp.status}`;
    throw new Error(errMsg);
  }
  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    const errMsg = data.errors[0]?.description || data.errors[0]?.code || "Erro de valida\xE7\xE3o Asaas";
    throw new Error(errMsg);
  }
  return data;
}
async function getAsaasBalance() {
  try {
    if (!process.env.ASAAS_API_KEY) {
      return { connected: false, message: "ASAAS_API_KEY n\xE3o configurada" };
    }
    const result = await asaasRequest("GET", "/finance/balance");
    const saldoAtual = Number(result?.balance ?? result?.currentBalance ?? 0);
    let saldoAReceber = 0;
    try {
      const stats = await asaasRequest("GET", "/finance/payment/statistics");
      saldoAReceber = Number(stats?.value ?? stats?.totalValue ?? stats?.netValue ?? 0);
    } catch {
      saldoAReceber = Number(result?.receivableBalance ?? result?.totalReceivable ?? 0);
    }
    const balance = saldoAtual + saldoAReceber;
    return { connected: true, balance, saldoAtual, saldoAReceber };
  } catch (err) {
    return { connected: false, message: err?.message || "Erro ao consultar saldo Asaas" };
  }
}
async function ensureInvoicesTable() {
}
async function findOrCreateAsaasCustomer(name, cpfCnpj, email, phone, address, city, state, zip, opts = {}) {
  const cleanDoc = cpfCnpj.replace(/[^\d]/g, "");
  if (!cleanDoc) throw new Error("CPF/CNPJ \xE9 obrigat\xF3rio para criar cobran\xE7a no Asaas");
  function fallbackParse(raw) {
    if (!raw) return { addressNumber: "S/N", complement: void 0 };
    const parts = raw.split(",").map((s) => s.trim());
    return { addressNumber: parts[1] || "S/N", complement: parts.slice(2).join(", ") || void 0 };
  }
  const fb = fallbackParse(address);
  const finalAddress = address ? address.split(",")[0].trim() : void 0;
  const finalNumber = opts.addressNumber || fb.addressNumber;
  const finalComplement = opts.complement || fb.complement;
  try {
    console.log(`[asaas] Buscando customer por CNPJ limpo=${cleanDoc} (original="${cpfCnpj}")`);
    const search = await asaasRequest("GET", `/customers?cpfCnpj=${cleanDoc}`);
    console.log(`[asaas] /customers?cpfCnpj=${cleanDoc} \u2192 ${search?.data?.length || 0} resultado(s)`);
    if (search.data && search.data.length > 0) {
      const existing = search.data[0];
      console.log(`[asaas] Customer existente encontrado: id=${existing.id} name="${existing.name}"`);
      const updatePayload = {};
      if (!existing.email && email) {
        const emails2 = email.split(/[;,]\s*/);
        updatePayload.email = emails2[0].trim();
        const additionalEmails2 = emails2.slice(1).map((e) => e.trim()).join(",");
        if (additionalEmails2) updatePayload.additionalEmails = additionalEmails2;
        updatePayload.notificationDisabled = true;
      }
      if (!existing.addressNumber && finalAddress) {
        updatePayload.address = finalAddress;
        updatePayload.addressNumber = finalNumber;
        if (finalComplement) updatePayload.complement = finalComplement;
        if (city) updatePayload.cityName = city;
        if (state) updatePayload.state = state;
        if (zip) updatePayload.postalCode = zip.replace(/[^\d]/g, "");
      }
      if (!existing.province && opts.province) updatePayload.province = opts.province;
      if (!existing.municipalInscription && opts.municipalInscription) updatePayload.municipalInscription = opts.municipalInscription;
      if (!existing.stateInscription && opts.stateInscription) updatePayload.stateInscription = opts.stateInscription;
      if (Object.keys(updatePayload).length > 0) {
        try {
          await asaasRequest("PUT", `/customers/${existing.id}`, updatePayload);
          console.log(`[asaas] Customer ${existing.id} atualizado: ${Object.keys(updatePayload).join(", ")}`);
        } catch (e) {
          console.log(`[asaas] Falha ao atualizar customer: ${e.message}`);
        }
      }
      return existing.id;
    }
  } catch {
  }
  const emails = (email || "").split(/[;,]\s*/);
  const primaryEmail = emails[0]?.trim() || void 0;
  const additionalEmails = emails.slice(1).map((e) => e.trim()).join(",") || void 0;
  const customerPayload = {
    name,
    cpfCnpj: cleanDoc,
    notificationDisabled: true
  };
  if (finalAddress) customerPayload.address = finalAddress;
  if (finalNumber) customerPayload.addressNumber = finalNumber;
  if (finalComplement) customerPayload.complement = finalComplement;
  if (primaryEmail) customerPayload.email = primaryEmail;
  if (additionalEmails) customerPayload.additionalEmails = additionalEmails;
  if (phone) customerPayload.mobilePhone = phone.replace(/[^\d]/g, "");
  if (city) customerPayload.cityName = city;
  if (state) customerPayload.state = state;
  if (zip) customerPayload.postalCode = zip.replace(/[^\d]/g, "");
  if (opts.province) customerPayload.province = opts.province;
  if (opts.municipalInscription) customerPayload.municipalInscription = opts.municipalInscription;
  if (opts.stateInscription) customerPayload.stateInscription = opts.stateInscription;
  const customer = await asaasRequest("POST", "/customers", customerPayload);
  return customer.id;
}
async function emitInvoiceAuto(invoiceId, opts) {
  if (!process.env.ASAAS_API_KEY) {
    return { success: false, message: "Asaas n\xE3o configurado (ASAAS_API_KEY)", nfEmitted: false };
  }
  const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", invoiceId).single();
  if (!invoice) return { success: false, message: "Fatura n\xE3o encontrada", nfEmitted: false };
  if (invoice.status !== "AGUARDANDO_FATURAMENTO") {
    return { success: false, message: `Status inv\xE1lido: ${invoice.status}`, nfEmitted: false };
  }
  const clientId = invoice.client_id;
  const clientCols = "id, cnpj, cpf, emite_nf, retem_inss, inss_aliquota, address, address_number, address_complement, bairro, city, state, zip, email, email_financeiro, email_contratual, email_operacional, phone, name, inscricao_municipal, inscricao_estadual";
  let clientData = null;
  if (clientId) {
    const r = await supabaseAdmin.from("clients").select(clientCols).eq("id", clientId).maybeSingle();
    clientData = r.data;
  }
  if (!clientData && invoice.client_name) {
    const r = await supabaseAdmin.from("clients").select(clientCols).ilike("name", invoice.client_name).limit(1);
    clientData = r.data?.[0] || null;
  }
  const cpfCnpj = (clientData?.cnpj || clientData?.cpf || invoice.client_cpf_cnpj || "").toString().replace(/[^\d]/g, "");
  if (!cpfCnpj || cpfCnpj.length < 11) return { success: false, message: "Cliente sem CPF/CNPJ cadastrado", nfEmitted: false };
  const clientName = clientData?.name || invoice.client_name;
  const clientEmail = clientData?.email_financeiro || clientData?.email || clientData?.email_contratual || clientData?.email_operacional || void 0;
  const clientPhone = clientData?.phone || void 0;
  const emiteNf = clientData?.emite_nf === true;
  const retemInss = clientData?.retem_inss === true;
  const inssAliquota = retemInss ? Number(clientData?.inss_aliquota ?? 11) : 0;
  const totalValue = parseFloat(invoice.value);
  const billingType = opts.billingType || "BOLETO";
  if (totalValue <= 0) return { success: false, message: "Valor da fatura \xE9 R$ 0,00", nfEmitted: false };
  const { boleto: boletoValue, inssValor } = netBoletoValue(totalValue, { retemInss, inssAliquota });
  const asaasCustomerId = await findOrCreateAsaasCustomer(
    clientName,
    cpfCnpj,
    clientEmail,
    clientPhone,
    clientData?.address,
    clientData?.city,
    clientData?.state,
    clientData?.zip,
    {
      addressNumber: clientData?.address_number || void 0,
      complement: clientData?.address_complement || void 0,
      province: clientData?.bairro || void 0,
      municipalInscription: clientData?.inscricao_municipal || void 0,
      stateInscription: clientData?.inscricao_estadual || void 0
    }
  );
  const paymentPayload = {
    customer: asaasCustomerId,
    billingType,
    value: boletoValue,
    dueDate: opts.dueDate,
    description: (invoice.description || `Escolta Armada \u2014 ${clientName}`).substring(0, 500),
    externalReference: invoice.external_reference || `FATURA-${invoiceId}`,
    notificationDisabled: true
  };
  if (emiteNf) {
    paymentPayload.postalService = false;
    const inssObs = retemInss ? ` ${buildInssObservation(true, inssAliquota, inssValor)}` : "";
    paymentPayload.fiscalObservations = `CNAE ${CNAE_PRINCIPAL}. ${DESCRICAO_SERVICO_FIXA}.${inssObs}`.substring(0, 500);
  }
  console.log(`[asaas] [auto] Emitindo fatura #${invoiceId} para ${clientName}: bruto=R$${totalValue.toFixed(2)} boleto=R$${boletoValue.toFixed(2)}${retemInss ? ` (INSS retido R$${inssValor.toFixed(2)})` : ""} venc=${opts.dueDate}`);
  const payment = await asaasRequest("POST", "/payments", paymentPayload);
  const updates = {
    asaas_customer_id: asaasCustomerId,
    asaas_payment_id: payment.id,
    client_cpf_cnpj: cpfCnpj,
    due_date: opts.dueDate,
    billing_type: billingType,
    status: payment.status || "PENDING",
    invoice_url: payment.invoiceUrl,
    bank_slip_url: payment.bankSlip?.url || payment.bankSlipUrl,
    valor_inss_retido: retemInss ? inssValor : null,
    inss_aliquota: retemInss ? inssAliquota : null,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  let nfEmitted = false;
  if (emiteNf) {
    try {
      const nfResult = await emitNfseImmediate({
        paymentId: payment.id,
        value: totalValue,
        description: invoice.description || DESCRICAO_SERVICO_FIXA,
        clientEmail,
        retemInss,
        inssAliquota
      });
      updates.nfse_status = nfResult.status === "AUTHORIZED" || nfResult.status === "SYNCHRONIZED" ? "AUTHORIZED" : nfResult.status;
      if (nfResult.number) updates.nfse_number = String(nfResult.number);
      nfEmitted = true;
      console.log(`[asaas] [auto] NFS-e emitida para fatura #${invoiceId}: ${nfResult.status}`);
    } catch (nfErr) {
      console.error(`[asaas] [auto] NFS-e falhou para fatura #${invoiceId}: ${nfErr.message}`);
      updates.nfse_status = "ERRO";
      updates.nfse_error_message = String(nfErr?.message || "Erro").slice(0, 1e3);
    }
  }
  await supabaseAdmin.from("invoices").update(updates).eq("id", invoiceId);
  const billingIdsMatch = (invoice.notes || "").match(/Billing IDs: (.+)$/);
  if (billingIdsMatch) {
    const bIds = billingIdsMatch[1].split(",").map((s) => s.trim());
    await supabaseAdmin.from("escort_billings").update({
      status: "FATURADO",
      invoice_id: invoiceId,
      faturado_em: (/* @__PURE__ */ new Date()).toISOString(),
      faturado_por: opts.actorName || "Auto-Aprova\xE7\xE3o Cliente"
    }).in("id", bIds);
    bustBalancoCaches();
  }
  await logSystemAudit({
    action: "EMITIR_FATURA_AUTO_APROVACAO",
    targetId: String(invoiceId),
    targetType: "invoice",
    details: `Fatura #${invoiceId} auto-emitida ap\xF3s aprova\xE7\xE3o do cliente. ${clientName} R$${totalValue.toFixed(2)} venc=${opts.dueDate}. Asaas=${payment.id}${nfEmitted ? " + NFS-e" : ""}`
  });
  return {
    success: true,
    message: `Cobran\xE7a ${billingType} gerada${nfEmitted ? " + NFS-e emitida" : ""}. Asaas=${payment.id}`,
    nfEmitted,
    paymentId: payment.id
  };
}
function registerAsaasRoutes(app) {
  ensureInvoicesTable().catch((e) => console.log("[asaas] table check:", e.message));
  app.get("/api/asaas/status", requireAdminRole, async (req, res) => {
    try {
      const user = req.user;
      if (user?.role !== "diretoria") {
        return res.status(403).json({ connected: false, message: "Acesso restrito \xE0 diretoria." });
      }
      const hasKey = !!process.env.ASAAS_API_KEY;
      if (!hasKey) {
        return res.json({ connected: false, message: "ASAAS_API_KEY n\xE3o configurada" });
      }
      const result = await asaasRequest("GET", "/finance/balance");
      res.json({ connected: true, balance: result });
    } catch (err) {
      res.json({ connected: false, message: err.message });
    }
  });
  const TRANSFER_PIX_KEY = "escolta@torresseguranca.com.br";
  const TRANSFER_RESERVE = 100;
  app.post("/api/asaas/webhook-transfer-approve", async (req, res) => {
    const headerToken = req.headers["asaas-access-token"] || req.headers["x-asaas-access-token"] || req.headers["authorization"] || "";
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN || "";
    const body = req.body || {};
    const event = String(body?.event || "").toUpperCase();
    const candidates = [body?.transfer, body?.data, body?.payload?.transfer, body?.payload, body];
    let transfer = {};
    for (const c of candidates) {
      if (c && typeof c === "object" && (c.pixAddressKey || c.pix_address_key || c.id || c.value || c.operationType)) {
        transfer = c;
        break;
      }
    }
    const pixKeyRaw = String(
      transfer?.pixAddressKey ?? transfer?.pix_address_key ?? transfer?.bankAccount?.pixAddressKey ?? transfer?.bankAccount?.pix_address_key ?? transfer?.bank_account?.pixAddressKey ?? body?.pixAddressKey ?? body?.transfer?.bankAccount?.pixAddressKey ?? ""
    );
    const pixKey = pixKeyRaw.trim().toLowerCase();
    const operationType = String(transfer?.operationType ?? transfer?.operation_type ?? body?.operationType ?? "").toUpperCase();
    const value = Number(transfer?.value ?? body?.value ?? 0);
    const transferId = String(transfer?.id ?? body?.id ?? "?");
    const expectedKey = TRANSFER_PIX_KEY.toLowerCase();
    const hex = (s) => Buffer.from(s, "utf8").toString("hex");
    console.log(`[asaas-webhook-approve] >>> event=${event} id=${transferId} type=${operationType} value=${value}`);
    console.log(`[asaas-webhook-approve] >>> pixKeyRecebida(len=${pixKey.length}, hex=${hex(pixKey).slice(0, 80)})`);
    console.log(`[asaas-webhook-approve] >>> pixKeyEsperada(len=${expectedKey.length}, hex=${hex(expectedKey).slice(0, 80)})`);
    console.log(`[asaas-webhook-approve] >>> headers: ${JSON.stringify({ "asaas-access-token-presente": !!req.headers["asaas-access-token"], "x-asaas-access-token-presente": !!req.headers["x-asaas-access-token"], "authorization-presente": !!req.headers["authorization"], "user-agent": req.headers["user-agent"] })}`);
    console.log(`[asaas-webhook-approve] >>> body raw keys=${Object.keys(body).join(",")}`);
    if (!expectedToken) {
      console.error(`[asaas-webhook-approve] BLOQUEADO: ASAAS_WEBHOOK_TOKEN n\xE3o configurado no servidor.`);
      return res.status(200).json({ status: "REFUSED", refuseReason: "Servidor sem ASAAS_WEBHOOK_TOKEN configurado." });
    }
    const tokenLimpo = headerToken.replace(/^Bearer\s+/i, "").trim();
    if (tokenLimpo !== expectedToken) {
      console.error(`[asaas-webhook-approve] BLOQUEADO: token inv\xE1lido. recebido(len=${tokenLimpo.length}) esperado(len=${expectedToken.length})`);
      return res.status(401).json({ status: "REFUSED", refuseReason: "Token de autentica\xE7\xE3o do webhook inv\xE1lido." });
    }
    const APPROVAL_EVENTS = ["TRANSFER_CREATED", "TRANSFER_PENDING", "TRANSFER_AUTHORIZATION_REQUIRED", ""];
    if (event && !APPROVAL_EVENTS.includes(event)) {
      console.log(`[asaas-webhook-approve] OK (notifica\xE7\xE3o ${event} apenas \u2014 sem decis\xE3o de aprova\xE7\xE3o).`);
      return res.status(200).json({ status: "APPROVED" });
    }
    if (operationType && operationType !== "PIX") {
      console.warn(`[asaas-webhook-approve] BLOQUEADO: operationType=${operationType} (esperado PIX).`);
      return res.status(200).json({ status: "REFUSED", refuseReason: `Tipo de opera\xE7\xE3o ${operationType} n\xE3o permitido (somente PIX).` });
    }
    if (!pixKey) {
      console.warn(`[asaas-webhook-approve] OK SEM A\xC7\xC3O: pixKey vazia no body.`);
      return res.status(200).json({ status: "APPROVED" });
    }
    if (pixKey !== expectedKey) {
      console.warn(`[asaas-webhook-approve] BLOQUEADO: chave PIX "${pixKey}" != "${expectedKey}".`);
      return res.status(200).json({ status: "REFUSED", refuseReason: `Chave PIX de destino n\xE3o autorizada.` });
    }
    console.log(`[asaas-webhook-approve] APROVADO automaticamente: id=${transferId} valor=R$${value.toFixed(2)} -> ${TRANSFER_PIX_KEY}`);
    return res.status(200).json({ status: "APPROVED" });
  });
  app.get("/api/asaas/webhook-config", requireAdminRole, async (req, res) => {
    const user = req.user;
    if (user?.role !== "diretoria") {
      return res.status(403).json({ message: "Acesso restrito \xE0 diretoria." });
    }
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const webhookUrl = `${proto}://${host}/api/asaas/webhook-transfer-approve`;
    res.json({
      webhookUrl,
      tokenConfigured: !!process.env.ASAAS_WEBHOOK_TOKEN,
      chaveAutorizada: TRANSFER_PIX_KEY
    });
  });
  app.get("/api/asaas/transfers-pending", requireAdminRole, async (req, res) => {
    try {
      const user = req.user;
      if (user?.role !== "diretoria") {
        return res.status(403).json({ message: "Acesso restrito \xE0 diretoria." });
      }
      if (!process.env.ASAAS_API_KEY) {
        return res.json({ pending: [], count: 0, total: 0 });
      }
      const result = await asaasRequest("GET", "/transfers?status=PENDING&limit=20");
      const pending = Array.isArray(result?.data) ? result.data : [];
      const total = pending.reduce((s, t) => s + Number(t?.value || 0), 0);
      res.json({ pending, count: pending.length, total });
    } catch (err) {
      console.error(`[asaas-pending] erro:`, err.message);
      res.json({ pending: [], count: 0, total: 0, error: err.message });
    }
  });
  app.post("/api/asaas/transfer-pix-escolta", requireAdminRole, async (req, res) => {
    try {
      const user = req.user;
      if (user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode realizar transfer\xEAncias." });
      }
      const apiKey = process.env.ASAAS_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ message: "ASAAS_API_KEY n\xE3o configurada" });
      }
      const balRes = await asaasRequest("GET", "/finance/balance");
      const saldo = Number(balRes?.balance ?? balRes?.currentBalance ?? 0);
      if (!Number.isFinite(saldo) || saldo <= TRANSFER_RESERVE) {
        return res.status(400).json({
          message: `Saldo insuficiente. Atual: R$ ${saldo.toFixed(2)}. M\xEDnimo de R$ ${TRANSFER_RESERVE.toFixed(2)} deve permanecer na conta.`,
          saldo,
          reserva: TRANSFER_RESERVE
        });
      }
      const valor = Math.round((saldo - TRANSFER_RESERVE) * 100) / 100;
      const transferBody = {
        value: valor,
        operationType: "PIX",
        pixAddressKey: TRANSFER_PIX_KEY,
        pixAddressKeyType: "EMAIL",
        description: "Transferencia automatica de saldo"
      };
      const url = `${ASAAS_API_URL}/transfers`;
      console.log(`[asaas-transfer] >>> POST ${url}`);
      console.log(`[asaas-transfer] >>> Body:`, JSON.stringify(transferBody));
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "access_token": apiKey,
          "User-Agent": "TorresVP/1.0",
          "Accept": "application/json"
        },
        body: JSON.stringify(transferBody)
      });
      const text = await resp.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = { rawText: text };
      }
      console.log(`[asaas-transfer] <<< HTTP ${resp.status} body:`, text.slice(0, 1e3));
      const errorsArr = Array.isArray(data?.errors) ? data.errors : [];
      const hasErrors = !resp.ok || errorsArr.length > 0;
      if (hasErrors) {
        const detalhes = errorsArr.map((e) => {
          const code = e?.code ? `[${e.code}] ` : "";
          const field = e?.field ? `(${e.field}) ` : "";
          return `${code}${field}${e?.description || JSON.stringify(e)}`;
        });
        const mensagemBase = detalhes.length > 0 ? detalhes.join(" | ") : data?.message || `HTTP ${resp.status}`;
        let dica = "";
        const msgLower = mensagemBase.toLowerCase();
        if (msgLower.includes("string did not match") || msgLower.includes("expected pattern")) {
          dica = " \u2014 Poss\xEDvel causa: a chave PIX de destino precisa ser cadastrada como 'Conta de transfer\xEAncia' no painel Asaas (Transfer\xEAncias \u2192 Cadastrar nova conta) antes de poder receber via API. Tente cadastrar manualmente uma vez no painel.";
        } else if (msgLower.includes("not authorized") || msgLower.includes("permiss")) {
          dica = " \u2014 Verifique se a sua conta Asaas tem 'Transfer\xEAncia via API' habilitada (em Integra\xE7\xF5es).";
        } else if (msgLower.includes("saldo") || msgLower.includes("balance")) {
          dica = " \u2014 O Asaas pode ter um saldo bloqueado/em libera\xE7\xE3o diferente do dispon\xEDvel.";
        }
        return res.status(400).json({
          message: `Asaas recusou a transfer\xEAncia: ${mensagemBase}${dica}`,
          asaasStatus: resp.status,
          asaasErrors: errorsArr,
          asaasResponse: data,
          requestBody: transferBody
        });
      }
      console.log(`[asaas-transfer] SUCESSO id=${data?.id} status=${data?.status}`);
      return res.json({
        success: true,
        valor,
        saldoAnterior: saldo,
        saldoReservado: TRANSFER_RESERVE,
        chavePix: TRANSFER_PIX_KEY,
        transfer: data
      });
    } catch (err) {
      console.error(`[asaas-transfer] EXCE\xC7\xC3O:`, err?.message, err?.stack);
      return res.status(500).json({ message: err?.message || "Erro ao realizar transfer\xEAncia" });
    }
  });
  app.get("/api/asaas/customers", requireAdminRole, async (req, res) => {
    try {
      const q = req.query.q || "";
      const offset = parseInt(req.query.offset) || 0;
      const limit = parseInt(req.query.limit) || 20;
      let path3 = `/customers?offset=${offset}&limit=${limit}`;
      if (q) path3 += `&name=${encodeURIComponent(q)}`;
      const data = await asaasRequest("GET", path3);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.get("/api/invoices", requireAdminRole, async (req, res) => {
    try {
      const status = req.query.status;
      const clientId = req.query.clientId;
      const month = req.query.month;
      let query = supabaseAdmin.from("invoices").select("*").order("created_at", { ascending: false });
      if (status && status !== "ALL") {
        query = query.eq("status", status);
      }
      if (clientId) {
        query = query.eq("client_id", parseInt(clientId));
      }
      if (month) {
        query = query.gte("due_date", `${month}-01`).lte("due_date", `${month}-31`);
      }
      const { data, error } = await query.limit(200);
      if (error) throw error;
      const invoices = data || [];
      if (process.env.ASAAS_API_KEY && invoices.length > 0) {
        const toSync = invoices.filter(
          (inv) => inv.asaas_payment_id && ["PENDING", "CONFIRMED", "OVERDUE"].includes(inv.status) && (!inv.updated_at || Date.now() - new Date(inv.updated_at).getTime() > 5 * 60 * 1e3)
        );
        if (toSync.length > 0) {
          (async () => {
            for (const inv of toSync) {
              try {
                const payment = await asaasRequest("GET", `/payments/${inv.asaas_payment_id}`);
                const upd = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
                if (payment.status && payment.status !== inv.status) upd.status = payment.status;
                if (payment.value || payment.netValue) upd.net_value = payment.value || payment.netValue;
                if (payment.invoiceUrl) upd.invoice_url = payment.invoiceUrl;
                if (payment.paymentDate) upd.payment_date = payment.paymentDate;
                if (Object.keys(upd).length > 1) {
                  await supabaseAdmin.from("invoices").update(upd).eq("id", inv.id).not("status", "in", `(${PAID_STATUSES.map((s) => `"${s}"`).join(",")})`);
                  console.log(`[asaas] Auto-sync invoice #${inv.id}: ${inv.status} \u2192 ${upd.status || inv.status}`);
                }
              } catch (e) {
                console.log(`[asaas] Auto-sync error invoice #${inv.id}: ${e.message}`);
              }
            }
          })();
        }
      }
      res.json(invoices);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/invoices", requireAdminRole, async (req, res) => {
    try {
      const { clientName, clientCpfCnpj, clientId, serviceOrderId, description, value, dueDate, billingType, notes, sendToAsaas, clientEmail: bodyClientEmail } = req.body;
      if (!clientName || !value || !dueDate || !description) {
        return res.status(400).json({ message: "Campos obrigat\xF3rios: clientName, value, dueDate, description" });
      }
      if (serviceOrderId) {
        const { data: existingInvoice } = await supabaseAdmin.from("invoices").select("id, asaas_payment_id, status").eq("service_order_id", serviceOrderId).in("status", ["PENDING", "CONFIRMED", "RECEIVED", "OVERDUE"]).limit(1);
        if (existingInvoice?.length) {
          return res.status(409).json({
            message: `J\xE1 existe fatura ativa (ID ${existingInvoice[0].id}) para esta OS. Cancele-a primeiro se deseja gerar outra.`,
            existingInvoiceId: existingInvoice[0].id
          });
        }
      }
      let asaasCustomerId = null;
      let asaasPaymentId = null;
      let invoiceUrl = null;
      let bankSlipUrl = null;
      let pixQrCode = null;
      let pixCopiaECola = null;
      let status = "PENDING";
      let clientEmail = bodyClientEmail || void 0;
      let clientPhone;
      let clientAddress;
      let clientCity;
      let clientState;
      let clientZip;
      if (clientId) {
        const { data: cliInfo } = await supabaseAdmin.from("clients").select("email, email_financeiro, email_contratual, email_operacional, phone, address, address_number, address_complement, bairro, city, state, zip, inscricao_municipal, inscricao_estadual").eq("id", clientId).single();
        if (!clientEmail) clientEmail = cliInfo?.email_financeiro || cliInfo?.email || cliInfo?.email_contratual || cliInfo?.email_operacional || void 0;
        clientPhone = cliInfo?.phone || void 0;
        clientAddress = cliInfo?.address || void 0;
        clientCity = cliInfo?.city || void 0;
        clientState = cliInfo?.state || void 0;
        clientZip = cliInfo?.zip || void 0;
        clientPhone;
        var clientOpts = {
          addressNumber: cliInfo?.address_number || void 0,
          complement: cliInfo?.address_complement || void 0,
          province: cliInfo?.bairro || void 0,
          municipalInscription: cliInfo?.inscricao_municipal || void 0,
          stateInscription: cliInfo?.inscricao_estadual || void 0
        };
      }
      if (sendToAsaas && process.env.ASAAS_API_KEY) {
        asaasCustomerId = await findOrCreateAsaasCustomer(clientName, clientCpfCnpj || "", clientEmail, clientPhone, clientAddress, clientCity, clientState, clientZip, clientOpts);
        let emiteNf = false;
        let retemInss = false;
        let inssAliquota = 11;
        if (clientId) {
          const { data: cliData } = await supabaseAdmin.from("clients").select("emite_nf, retem_inss, inss_aliquota").eq("id", clientId).single();
          emiteNf = cliData?.emite_nf === true;
          retemInss = cliData?.retem_inss === true;
          inssAliquota = Number(cliData?.inss_aliquota ?? 11);
        }
        const parsedValue = parseFloat(value);
        if (!parsedValue || parsedValue <= 0) {
          return res.status(400).json({ message: "Valor da cobran\xE7a deve ser maior que R$ 0,00. OS recusada/cancelada n\xE3o pode gerar cobran\xE7a." });
        }
        const { boleto: boletoValue, inssValor: inssValorBoleto } = netBoletoValue(parsedValue, { retemInss, inssAliquota });
        if (retemInss) {
          console.log(`[asaas] Cobran\xE7a c/ reten\xE7\xE3o INSS: bruto=R$${parsedValue.toFixed(2)} boleto=R$${boletoValue.toFixed(2)} (INSS R$${inssValorBoleto.toFixed(2)} @ ${inssAliquota}%)`);
        }
        const paymentPayload = {
          customer: asaasCustomerId,
          billingType: billingType || "BOLETO",
          value: boletoValue,
          dueDate,
          description,
          externalReference: serviceOrderId ? `OS-${serviceOrderId}` : void 0,
          notificationDisabled: true
        };
        if (emiteNf) {
          paymentPayload.postalService = false;
          paymentPayload.fiscalObservations = `CNAE ${CNAE_PRINCIPAL} - Atividades de Vigil\xE2ncia e Seguran\xE7a Privada`;
        }
        try {
          const payment = await asaasRequest("POST", "/payments", paymentPayload);
          asaasPaymentId = payment.id;
          invoiceUrl = payment.invoiceUrl;
          bankSlipUrl = payment.bankSlip?.url || payment.bankSlipUrl;
          status = payment.status || "PENDING";
          if (billingType === "PIX" || billingType === "UNDEFINED") {
            try {
              const pixData = await asaasRequest("GET", `/payments/${payment.id}/pixQrCode`);
              pixQrCode = pixData.encodedImage;
              pixCopiaECola = pixData.payload;
            } catch {
            }
          }
          if (asaasPaymentId && emiteNf) {
            try {
              const nfResult = await emitNfseImmediate({
                paymentId: asaasPaymentId,
                value: parsedValue,
                description: description || DESCRICAO_SERVICO_FIXA,
                clientEmail,
                retemInss,
                inssAliquota
              });
              console.log(`[asaas] NFS-e emitida imediatamente para payment ${asaasPaymentId}: id=${nfResult.id}, status=${nfResult.status}`);
            } catch (nfErr) {
              console.log(`[asaas] NFS-e auto-emission (individual) non-blocking: ${nfErr.message}`);
            }
          } else if (asaasPaymentId && !emiteNf) {
            console.log(`[asaas] NFS-e N\xC3O emitida (cliente ${clientId} com emite_nf=false). Apenas boleto/cobran\xE7a gerada.`);
          }
          await logSystemAudit({
            userId: req.user?.id,
            userName: req.user?.name,
            userRole: req.user?.role,
            action: "ASAAS_COBRANCA_GERADA",
            targetId: asaasPaymentId,
            targetType: "invoice",
            details: `Cobran\xE7a ${billingType || "BOLETO"} R$${parseFloat(value).toFixed(2)} gerada para ${clientName}. Asaas ID: ${asaasPaymentId}`,
            ipAddress: req.ip
          });
        } catch (asaasErr) {
          await logSystemAudit({
            userId: req.user?.id,
            userName: req.user?.name,
            userRole: req.user?.role,
            action: "ASAAS_COBRANCA_ERRO",
            targetId: serviceOrderId ? String(serviceOrderId) : "manual",
            targetType: "invoice",
            details: `ERRO ao gerar cobran\xE7a para ${clientName}: ${asaasErr.message}`,
            ipAddress: req.ip
          });
          throw asaasErr;
        }
      }
      const userId = req.user?.id;
      let inssAliquotaPersist = null;
      let inssValorPersist = null;
      if (clientId) {
        const { data: cliInss } = await supabaseAdmin.from("clients").select("retem_inss, inss_aliquota").eq("id", clientId).single();
        if (cliInss?.retem_inss === true) {
          inssAliquotaPersist = Number(cliInss.inss_aliquota ?? 11);
          inssValorPersist = Number((parseFloat(value) * inssAliquotaPersist / 100).toFixed(2));
        }
      }
      const { data, error } = await supabaseAdmin.from("invoices").insert({
        client_id: clientId || null,
        client_name: clientName,
        client_cpf_cnpj: clientCpfCnpj || null,
        asaas_customer_id: asaasCustomerId,
        asaas_payment_id: asaasPaymentId,
        service_order_id: serviceOrderId || null,
        description,
        value: parseFloat(value),
        due_date: dueDate,
        billing_type: billingType || "BOLETO",
        status,
        invoice_url: invoiceUrl,
        bank_slip_url: bankSlipUrl,
        pix_qr_code: pixQrCode,
        pix_copia_e_cola: pixCopiaECola,
        notes: notes || null,
        external_reference: serviceOrderId ? `OS-${serviceOrderId}` : null,
        valor_inss_retido: inssValorPersist,
        inss_aliquota: inssAliquotaPersist,
        provider_cnpj: TORRES_CNPJ,
        created_by: userId
      }).select().single();
      if (error) {
        if (asaasPaymentId) {
          try {
            await asaasRequest("DELETE", `/payments/${asaasPaymentId}`);
            console.error(`[Asaas] Cobran\xE7a ${asaasPaymentId} cancelada (falha no DB: ${error.message})`);
            await logSystemAudit({
              userId: req.user?.id,
              userName: req.user?.name,
              userRole: req.user?.role,
              action: "ASAAS_COBRANCA_COMPENSACAO",
              targetId: asaasPaymentId,
              targetType: "invoice",
              details: `Cobran\xE7a ${asaasPaymentId} cancelada automaticamente ap\xF3s falha no DB: ${error.message}`,
              ipAddress: req.ip
            });
          } catch (cancelErr) {
            console.error(`[Asaas] CR\xCDTICO: Falha ao cancelar cobran\xE7a \xF3rf\xE3 ${asaasPaymentId}: ${cancelErr.message}`);
          }
        }
        throw error;
      }
      console.log(`[billing-email] Fatura #${data.id} criada \u2014 aguardando anexo de NF para envio.`);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.patch("/api/invoices/:id", requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const user = req.user;
      const { data: existing } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!existing) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      if (updates.status === "CANCELLED" && user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode cancelar faturas." });
      }
      if (updates.status === "CANCELLED" && existing.asaas_payment_id && process.env.ASAAS_API_KEY) {
        try {
          await asaasRequest("DELETE", `/payments/${existing.asaas_payment_id}`);
        } catch (e) {
          console.log("[asaas] Cancel payment error:", e.message);
        }
      }
      const { data, error } = await supabaseAdmin.from("invoices").update({ ...updates, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/invoices/:id/attach-nf", requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { nf_anexo_url } = req.body;
      if (!nf_anexo_url) return res.status(400).json({ message: "URL do anexo da NF \xE9 obrigat\xF3ria" });
      const { data: existing } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!existing) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      const { data, error } = await supabaseAdmin.from("invoices").update({ nf_anexo_url, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).select().single();
      if (error) throw error;
      const user = req.user;
      await logSystemAudit({
        userId: user?.id,
        userName: user?.name,
        userRole: user?.role,
        action: "ANEXAR_NF",
        targetId: String(id),
        targetType: "invoice",
        details: `NF anexada \xE0 fatura #${id}`,
        ipAddress: req.ip
      });
      if (!existing.email_sent) {
        let clientEmail = "";
        if (existing.client_id) {
          const { data: cli } = await supabaseAdmin.from("clients").select("email, email_financeiro").eq("id", existing.client_id).single();
          clientEmail = cli?.email_financeiro || cli?.email || cli?.email_contratual || cli?.email_operacional || "";
        }
        if (clientEmail) {
          sendBillingEmail({
            id: existing.id,
            client_name: existing.client_name,
            value: Number(existing.value),
            due_date: existing.due_date,
            billing_type: existing.billing_type,
            description: existing.description,
            invoice_url: existing.invoice_url,
            bank_slip_url: existing.bank_slip_url,
            nfse_url: nf_anexo_url || existing.nfse_url || null,
            nfse_number: existing.nfse_number || null,
            pix_copia_e_cola: existing.pix_copia_e_cola,
            service_order_id: existing.service_order_id || null,
            valor_inss_retido: existing.valor_inss_retido,
            inss_aliquota: existing.inss_aliquota
          }, clientEmail).catch((e) => console.error(`[billing-email] async error ap\xF3s attach-nf: ${e.message}`));
          console.log(`[billing-email] Disparando envio para ${clientEmail} (fatura #${id} \u2014 NF anexada)`);
        } else {
          console.log(`[billing-email] Fatura #${id}: NF anexada por\xE9m cliente sem e-mail cadastrado.`);
        }
      } else {
        console.log(`[billing-email] Fatura #${id}: NF re-anexada \u2014 e-mail j\xE1 havia sido enviado, n\xE3o reenvia.`);
      }
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.delete("/api/invoices/:id/attach-nf", requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { data, error } = await supabaseAdmin.from("invoices").update({ nf_anexo_url: null, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/invoices/:id/resend-email", requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      let email = req.body.email || "";
      if (!email && invoice.client_id) {
        const { data: cli } = await supabaseAdmin.from("clients").select("email, email_financeiro").eq("id", invoice.client_id).single();
        email = cli?.email_financeiro || cli?.email || cli?.email_contratual || cli?.email_operacional || "";
      }
      if (!email) return res.status(400).json({ message: "E-mail do cliente n\xE3o encontrado. Informe no campo 'email'." });
      await sendBillingEmail({
        id: invoice.id,
        client_name: invoice.client_name,
        value: invoice.value,
        due_date: invoice.due_date,
        billing_type: invoice.billing_type,
        description: invoice.description,
        invoice_url: invoice.invoice_url,
        bank_slip_url: invoice.bank_slip_url,
        nfse_url: invoice.nfse_url,
        nfse_number: invoice.nfse_number,
        pix_copia_e_cola: invoice.pix_copia_e_cola,
        service_order_id: invoice.service_order_id,
        valor_inss_retido: invoice.valor_inss_retido,
        inss_aliquota: invoice.inss_aliquota
      }, email);
      res.json({ success: true, message: `E-mail enviado para ${email}` });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.delete("/api/invoices/:id", requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user;
      if (user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode excluir faturas." });
      }
      const { data: existing } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!existing) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      if (existing.asaas_payment_id && process.env.ASAAS_API_KEY) {
        try {
          await asaasRequest("DELETE", `/payments/${existing.asaas_payment_id}`);
        } catch (e) {
          console.log("[asaas] Delete payment error:", e.message);
        }
      }
      const { error } = await supabaseAdmin.from("invoices").delete().eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/invoices/:id/sync", requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      if (!invoice.asaas_payment_id) return res.status(400).json({ message: "Fatura sem v\xEDnculo com Asaas" });
      const payment = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}`);
      const willRegress = isAlreadyPaidStatus(invoice.status) && isStatusRegression(payment.status);
      const updates = {
        status: willRegress ? invoice.status : payment.status,
        net_value: payment.value || payment.netValue,
        invoice_url: payment.invoiceUrl,
        bank_slip_url: payment.bankSlip?.url || payment.bankSlipUrl,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (willRegress) console.log(`[asaas] /sync invoice #${id}: mantendo status local ${invoice.status} (Asaas reportou ${payment.status} \u2014 regress\xE3o bloqueada).`);
      if (payment.paymentDate && !willRegress) updates.payment_date = payment.paymentDate;
      if (invoice.nfse_number && invoice.nfse_number.startsWith("inv_")) {
        try {
          const nfData = await asaasRequest("GET", `/invoices/${invoice.nfse_number}`);
          if (nfData) {
            updates.nfse_status = nfData.status || null;
            if (isNfErrorStatus(nfData.status)) updates.nfse_error_message = resolveNfErrorMessage(nfData, nfData.status, invoice.nfse_error_message);
            else if (isNfOkStatus(nfData.status)) updates.nfse_error_message = null;
            if (nfData.pdfUrl) updates.nfse_url = nfData.pdfUrl;
            else if (nfData.xmlUrl) updates.nfse_url = nfData.xmlUrl;
            if (nfData.number) updates.nfse_number = String(nfData.number);
            console.log(`[asaas] NFS-e sync via /invoices: status=${nfData.status}, number=${nfData.number || "N/A"}, pdfUrl=${nfData.pdfUrl || "N/A"}`);
          }
        } catch (nfErr) {
          console.log(`[asaas] NFS-e /invoices fetch (non-blocking): ${nfErr.message}`);
        }
      } else {
        try {
          const fiscalInfo = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}/fiscalInfo`);
          if (fiscalInfo) {
            updates.nfse_status = fiscalInfo.status || null;
            if (isNfErrorStatus(fiscalInfo.status)) updates.nfse_error_message = resolveNfErrorMessage(fiscalInfo, fiscalInfo.status, invoice.nfse_error_message);
            else if (isNfOkStatus(fiscalInfo.status)) updates.nfse_error_message = null;
            if (fiscalInfo.externalUrl) updates.nfse_url = fiscalInfo.externalUrl;
            if (fiscalInfo.number) updates.nfse_number = String(fiscalInfo.number);
            else if (fiscalInfo.rpsNumber) updates.nfse_number = `RPS-${fiscalInfo.rpsNumber}`;
            console.log(`[asaas] NFS-e sync via fiscalInfo: status=${fiscalInfo.status}, number=${fiscalInfo.number || fiscalInfo.rpsNumber || "N/A"}, url=${fiscalInfo.externalUrl || "N/A"}`);
          }
        } catch (nfErr) {
          console.log(`[asaas] NFS-e fiscalInfo fetch (non-blocking): ${nfErr.message}`);
        }
      }
      const { data, error } = await supabaseAdmin.from("invoices").update(updates).eq("id", id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/invoices/:id/emit-nfse", requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      if (!invoice.asaas_payment_id) return res.status(400).json({ message: "Fatura sem v\xEDnculo com Asaas. A NFS-e s\xF3 pode ser emitida para cobran\xE7as integradas." });
      const cpfCnpj = invoice.client_cpf_cnpj || "";
      if (!cpfCnpj) return res.status(400).json({ message: "CPF/CNPJ do cliente n\xE3o informado. Atualize o cadastro do cliente." });
      let clientEmail;
      if (invoice.client_id) {
        const { data: cli } = await supabaseAdmin.from("clients").select("email, email_financeiro, email_contratual, email_operacional").eq("id", invoice.client_id).single();
        clientEmail = cli?.email_financeiro || cli?.email || cli?.email_contratual || cli?.email_operacional || void 0;
      }
      let result;
      try {
        result = await emitNfseImmediate({
          paymentId: invoice.asaas_payment_id,
          value: parseFloat(invoice.value),
          description: invoice.description || DESCRICAO_SERVICO_FIXA,
          clientEmail
        });
      } catch (emitErr) {
        throw new Error(`Erro ao emitir NFS-e: ${emitErr.message}`);
      }
      const updates = {
        nfse_status: result.status || "AUTHORIZED",
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (result.number) updates.nfse_number = String(result.number);
      else if (result.id) updates.nfse_number = String(result.id);
      const { data, error } = await supabaseAdmin.from("invoices").update(updates).eq("id", id).select().single();
      if (error) throw error;
      const user = req.user;
      await logSystemAudit({
        userId: user?.id,
        userName: user?.name,
        userRole: user?.role,
        action: "EMITIR_NFSE",
        targetId: invoice.asaas_payment_id,
        targetType: "invoice",
        details: `NFS-e emitida imediatamente para fatura #${id} (${invoice.asaas_payment_id}). Status: ${result.status}`,
        ipAddress: req.ip
      });
      console.log(`[asaas] NFS-e emitida imediatamente: payment=${invoice.asaas_payment_id}, status=${result.status}, id=${result.id}`);
      res.json({ ...data, nfseResult: result });
    } catch (err) {
      console.error("[asaas] Erro NFS-e:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/invoices/:id/resolver-nf-erro", requireAdminRole, async (req, res) => {
    try {
      const user = req.user;
      if (user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode reprocessar Notas Fiscais." });
      }
      const id = parseInt(req.params.id);
      const emailRaw = String(req.body?.email || "").trim();
      const emails = emailRaw.split(/[;,]\s*/).map((e) => e.trim()).filter(Boolean);
      const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
      if (emails.length === 0 || !emails.every(emailValido)) {
        return res.status(400).json({ message: "Informe um e-mail v\xE1lido (separe v\xE1rios por v\xEDrgula)." });
      }
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura n\xE3o encontrada." });
      if (!invoice.asaas_payment_id) {
        return res.status(400).json({ message: "Fatura sem v\xEDnculo com Asaas. A NFS-e s\xF3 pode ser emitida para cobran\xE7as integradas." });
      }
      const nfStatusUp = String(invoice.nfse_status || "").toUpperCase();
      const emErro = ["ERROR", "ERRO", "REJECTED", "DENIED", "FAILED", "FALHA"].includes(nfStatusUp) || !!invoice.nfse_error_message;
      const jaEmitida = ["AUTHORIZED", "SYNCHRONIZED", "ISSUED"].includes(nfStatusUp);
      if (!emErro || jaEmitida) {
        return res.status(409).json({ message: "Esta fatura n\xE3o est\xE1 com NF em erro \u2014 reprocessar n\xE3o \xE9 permitido para evitar emiss\xE3o duplicada. Cancele a NF atual primeiro, se necess\xE1rio." });
      }
      const cpfCnpj = String(invoice.client_cpf_cnpj || "").replace(/[^\d]/g, "");
      if (!cpfCnpj) {
        return res.status(400).json({ message: "CPF/CNPJ do cliente n\xE3o informado. Atualize o cadastro do cliente." });
      }
      if (invoice.client_id) {
        const { error: updErr } = await supabaseAdmin.from("clients").update({ email_financeiro: emails[0] }).eq("id", invoice.client_id);
        if (updErr) console.error(`[resolver-nf-erro #${id}] erro ao salvar e-mail no cliente ${invoice.client_id}: ${updErr.message}`);
      }
      try {
        const search = await asaasRequest("GET", `/customers?cpfCnpj=${cpfCnpj}`);
        if (search?.data?.length > 0) {
          const customerId = search.data[0].id;
          const putPayload = { email: emails[0] };
          const extra = emails.slice(1).join(",");
          if (extra) putPayload.additionalEmails = extra;
          await asaasRequest("PUT", `/customers/${customerId}`, putPayload);
          console.log(`[resolver-nf-erro #${id}] e-mail do customer Asaas ${customerId} atualizado.`);
        } else {
          console.warn(`[resolver-nf-erro #${id}] nenhum customer Asaas encontrado para cpfCnpj ${cpfCnpj}.`);
        }
      } catch (e) {
        console.error(`[resolver-nf-erro #${id}] falha ao atualizar customer Asaas: ${e.message}`);
      }
      let result;
      try {
        result = await emitNfseImmediate({
          paymentId: invoice.asaas_payment_id,
          value: parseFloat(invoice.value),
          description: invoice.description || DESCRICAO_SERVICO_FIXA,
          clientEmail: emails[0]
        });
      } catch (emitErr) {
        await supabaseAdmin.from("invoices").update({ nfse_error_message: emitErr.message, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id);
        return res.status(502).json({ message: `E-mail atualizado, mas a re-emiss\xE3o falhou: ${emitErr.message}` });
      }
      const updates = {
        nfse_status: result.status || "AUTHORIZED",
        nfse_error_message: null,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (result.number) updates.nfse_number = String(result.number);
      else if (result.id) updates.nfse_number = String(result.id);
      const { data, error } = await supabaseAdmin.from("invoices").update(updates).eq("id", id).select().single();
      if (error) throw error;
      await logSystemAudit({
        userId: user?.id,
        userName: user?.name,
        userRole: user?.role,
        action: "RESOLVER_NF_ERRO",
        targetId: invoice.asaas_payment_id,
        targetType: "invoice",
        details: `NF com erro resolvida: e-mail corrigido para "${emailRaw}" e NFS-e re-emitida (fatura #${id}). Status: ${result.status}`,
        ipAddress: req.ip
      });
      console.log(`[resolver-nf-erro #${id}] resolvido: e-mail atualizado e NFS-e re-emitida (status ${result.status}).`);
      res.json({ ...data, nfseResult: result, message: "E-mail atualizado e NFS-e re-emitida." });
    } catch (err) {
      console.error("[resolver-nf-erro] erro:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/invoices/:id/cancel-nfse", requireAdminRole, async (req, res) => {
    try {
      const user = req.user;
      if (user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode cancelar Notas Fiscais." });
      }
      const id = parseInt(req.params.id);
      const localOnly = !!req.body?.localOnly;
      const reason = req.body?.reason ? String(req.body.reason).slice(0, 500) : null;
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      if (!invoice.nfse_status) return res.status(400).json({ message: "Esta fatura n\xE3o possui NFS-e emitida." });
      let cancelStatus = "CANCELED";
      let cancelMessage = "NFS-e cancelada localmente.";
      if (!localOnly) {
        let nfId = null;
        if (invoice.nfse_number && String(invoice.nfse_number).startsWith("inv_")) {
          nfId = String(invoice.nfse_number);
        } else if (invoice.asaas_payment_id) {
          try {
            const fiscalInfo = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}/fiscalInfo`);
            nfId = fiscalInfo?.id || null;
          } catch {
          }
        }
        if (nfId) {
          try {
            const cancelResult = await asaasRequest("POST", `/invoices/${nfId}/cancel`);
            cancelStatus = cancelResult?.status || "CANCELED";
            cancelMessage = `NFS-e ${nfId} cancelada no Asaas (status: ${cancelStatus}).`;
            console.log(`[asaas] NFS-e ${nfId} cancelada com sucesso. Status: ${cancelStatus}`);
          } catch (cancelErr) {
            console.error(`[asaas] Erro ao cancelar NFS-e ${nfId}: ${cancelErr.message}`);
            return res.status(500).json({ message: `Erro ao cancelar NFS-e no Asaas: ${cancelErr.message}. Se a NF j\xE1 foi cancelada na prefeitura, marque como cancelamento local.` });
          }
        } else {
          console.log(`[asaas] NFS-e da fatura #${id} sem ID Asaas. Marcando como cancelada localmente.`);
        }
      } else {
        cancelMessage = `NFS-e marcada como cancelada localmente (j\xE1 cancelada externamente)${reason ? `: ${reason}` : ""}.`;
        console.log(`[asaas] NFS-e da fatura #${id} marcada como cancelada localmente. ${reason || ""}`);
      }
      let paymentCanceled = false;
      let paymentCancelMsg = "";
      const isCancelStatus = ["CANCELED", "PROCESSING_CANCELLATION"].includes(cancelStatus);
      if (isCancelStatus && invoice.asaas_payment_id && !["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(invoice.status)) {
        try {
          await asaasRequest("DELETE", `/payments/${invoice.asaas_payment_id}`);
          paymentCanceled = true;
          paymentCancelMsg = " Cobran\xE7a Asaas tamb\xE9m cancelada.";
          console.log(`[asaas] Cobran\xE7a ${invoice.asaas_payment_id} cancelada (NFS-e cancelada).`);
        } catch (payErr) {
          paymentCancelMsg = ` Aten\xE7\xE3o: NF cancelada mas cobran\xE7a Asaas n\xE3o p\xF4de ser cancelada (${payErr.message}). Cancele manualmente no painel Asaas.`;
          console.error(`[asaas] Falha ao cancelar pagamento ${invoice.asaas_payment_id}: ${payErr.message}`);
        }
      } else if (isCancelStatus && invoice.asaas_payment_id) {
        paymentCancelMsg = ` Cobran\xE7a N\xC3O foi cancelada porque o pagamento j\xE1 foi recebido (status ${invoice.status}).`;
      }
      const updates = {
        nfse_status: cancelStatus,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (paymentCanceled) updates.status = "CANCELED";
      const { data: updated, error: updErr } = await supabaseAdmin.from("invoices").update(updates).eq("id", id).select().single();
      if (updErr) throw updErr;
      await logSystemAudit({
        userId: user?.id,
        userName: user?.name,
        userRole: user?.role,
        action: "CANCELAR_NFSE",
        targetId: String(id),
        targetType: "invoice",
        details: `NFS-e da fatura #${id} cancelada por ${user?.name || "diretoria"}. ${cancelMessage}${paymentCancelMsg}`,
        ipAddress: req.ip
      });
      res.json({ success: true, message: cancelMessage + paymentCancelMsg, invoice: updated });
    } catch (err) {
      console.error("[asaas] Erro ao cancelar NFS-e:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/invoices/:id/emitir", requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { dueDate, billingType } = req.body;
      if (!dueDate) return res.status(400).json({ message: "Data de vencimento \xE9 obrigat\xF3ria." });
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura n\xE3o encontrada." });
      if (invoice.status !== "AGUARDANDO_FATURAMENTO") {
        return res.status(400).json({ message: `Fatura n\xE3o est\xE1 aguardando faturamento. Status atual: ${invoice.status}` });
      }
      const clientId = invoice.client_id;
      const clientCols = "*";
      let clientData = null;
      let lookupSteps = [];
      if (clientId) {
        const r = await supabaseAdmin.from("clients").select(clientCols).eq("id", clientId).maybeSingle();
        if (r.error) console.log(`[emitir #${id}] STEP1 by id=${clientId} ERROR:`, r.error.message);
        clientData = r.data || null;
        lookupSteps.push(`STEP1 by id=${clientId}: ${clientData ? `FOUND name="${clientData.name}" cnpj="${clientData.cnpj || ""}" cpf="${clientData.cpf || ""}"` : "NOT FOUND"}`);
      } else {
        lookupSteps.push("STEP1 skipped (invoice.client_id vazio)");
      }
      if (!clientData && invoice.client_name) {
        const r = await supabaseAdmin.from("clients").select(clientCols).ilike("name", invoice.client_name).limit(1);
        if (r.error) console.log(`[emitir #${id}] STEP2 by name="${invoice.client_name}" ERROR:`, r.error.message);
        const arr = r.data || [];
        clientData = arr.length > 0 ? arr[0] : null;
        lookupSteps.push(`STEP2 by name="${invoice.client_name}": ${clientData ? `FOUND id=${clientData.id} cnpj="${clientData.cnpj || ""}" cpf="${clientData.cpf || ""}"` : `NOT FOUND (array vazio: ${arr.length === 0})`}`);
      } else if (!clientData) {
        lookupSteps.push("STEP2 skipped (sem invoice.client_name)");
      }
      const rawCnpjClient = clientData?.cnpj || clientData?.cpf || "";
      const rawCnpjInvoice = invoice.client_cpf_cnpj || "";
      const cpfCnpj = String(rawCnpjClient || rawCnpjInvoice || "").replace(/[^\d]/g, "");
      lookupSteps.push(`STEP3 final: cliente="${rawCnpjClient}" invoice="${rawCnpjInvoice}" \u2192 limpo="${cpfCnpj}" (len=${cpfCnpj.length})`);
      console.log(`[emitir #${id}] LOOKUP:
  - ${lookupSteps.join("\n  - ")}`);
      if (!cpfCnpj || cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
        return res.status(400).json({
          message: `Cliente sem CPF/CNPJ v\xE1lido. Detalhes: client_id=${clientId || "vazio"}, client_name="${invoice.client_name || ""}", cnpj_cliente="${rawCnpjClient || "vazio"}", cnpj_fatura="${rawCnpjInvoice || "vazio"}". Atualize o cadastro do cliente.`
        });
      }
      const clientName = clientData?.name || invoice.client_name;
      const clientEmail = clientData?.email_financeiro || clientData?.email || clientData?.email_contratual || clientData?.email_operacional || void 0;
      const clientPhone = clientData?.phone || void 0;
      const emiteNf = clientData?.emite_nf === true;
      const totalValue = parseFloat(invoice.value);
      const retemInss = clientData?.retem_inss === true;
      const inssAliquota = retemInss ? Number(clientData?.inss_aliquota ?? 11) : 0;
      const { boleto: boletoValue, inssValor } = netBoletoValue(totalValue, { retemInss, inssAliquota });
      if (totalValue <= 0) return res.status(400).json({ message: "Valor da fatura \xE9 R$ 0,00." });
      if (!process.env.ASAAS_API_KEY) return res.status(400).json({ message: "Asaas n\xE3o configurado (ASAAS_API_KEY)." });
      const asaasCustomerId = await findOrCreateAsaasCustomer(
        clientName,
        cpfCnpj,
        clientEmail,
        clientPhone,
        clientData?.address,
        clientData?.city,
        clientData?.state,
        clientData?.zip,
        {
          addressNumber: clientData?.address_number || void 0,
          complement: clientData?.address_complement || void 0,
          province: clientData?.bairro || void 0,
          municipalInscription: clientData?.inscricao_municipal || void 0,
          stateInscription: clientData?.inscricao_estadual || void 0
        }
      );
      if (clientData?.id && clientData.asaas_customer_id !== asaasCustomerId) {
        const { error: updErr } = await supabaseAdmin.from("clients").update({ asaas_customer_id: asaasCustomerId }).eq("id", clientData.id);
        if (updErr) console.log(`[emitir #${id}] asaas_customer_id n\xE3o persistido: ${updErr.message}`);
        else console.log(`[emitir #${id}] clients.asaas_customer_id=${asaasCustomerId} salvo (cliente ${clientData.id})`);
      }
      const paymentPayload = {
        customer: asaasCustomerId,
        billingType: billingType || "BOLETO",
        value: boletoValue,
        dueDate,
        description: (invoice.description || `Escolta Armada \u2014 ${clientName}`).substring(0, 500),
        externalReference: invoice.external_reference || `FATURA-${id}`,
        notificationDisabled: true
      };
      if (emiteNf) {
        paymentPayload.postalService = false;
        const inssObs = retemInss ? ` ${buildInssObservation(true, inssAliquota, inssValor)}` : "";
        paymentPayload.fiscalObservations = `CNAE ${CNAE_PRINCIPAL}. ${DESCRICAO_SERVICO_FIXA}.${inssObs}`.substring(0, 500);
      }
      console.log(`[asaas] Emitindo fatura #${id} para ${clientName}: bruto R$${totalValue.toFixed(2)}${retemInss ? ` \u2212 INSS R$${inssValor.toFixed(2)} = boleto R$${boletoValue.toFixed(2)}` : ""} venc=${dueDate}`);
      const payment = await asaasRequest("POST", "/payments", paymentPayload);
      const updates = {
        asaas_customer_id: asaasCustomerId,
        asaas_payment_id: payment.id,
        client_cpf_cnpj: cpfCnpj,
        due_date: dueDate,
        billing_type: billingType || "BOLETO",
        status: payment.status || "PENDING",
        invoice_url: payment.invoiceUrl,
        bank_slip_url: payment.bankSlip?.url || payment.bankSlipUrl,
        valor_inss_retido: retemInss ? inssValor : null,
        inss_aliquota: retemInss ? inssAliquota : null,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (billingType === "PIX" || billingType === "UNDEFINED") {
        try {
          const pixData = await asaasRequest("GET", `/payments/${payment.id}/pixQrCode`);
          updates.pix_qr_code = pixData.encodedImage;
          updates.pix_copia_e_cola = pixData.payload;
        } catch {
        }
      }
      if (emiteNf) {
        try {
          const nfResult = await emitNfseImmediate({
            paymentId: payment.id,
            value: totalValue,
            description: invoice.description || DESCRICAO_SERVICO_FIXA,
            clientEmail
          });
          updates.nfse_status = nfResult.status === "AUTHORIZED" || nfResult.status === "SYNCHRONIZED" ? "AUTHORIZED" : nfResult.status;
          if (nfResult.number) updates.nfse_number = String(nfResult.number);
          console.log(`[asaas] NFS-e emitida para fatura #${id}: ${nfResult.status}`);
        } catch (nfErr) {
          console.error(`[asaas] NFS-e falhou para fatura #${id}: ${nfErr.message}`);
          updates.nfse_status = "ERRO";
          updates.nfse_error_message = String(nfErr?.message || "Erro desconhecido ao emitir NFS-e").slice(0, 1e3);
        }
      }
      const { data: updated, error: updateErr } = await supabaseAdmin.from("invoices").update(updates).eq("id", id).select().single();
      if (updateErr) throw updateErr;
      const billingIdsMatch = (invoice.notes || "").match(/Billing IDs: (.+)$/);
      if (billingIdsMatch) {
        const bIds = billingIdsMatch[1].split(",").map((s) => s.trim());
        await supabaseAdmin.from("escort_billings").update({
          status: "FATURADO",
          invoice_id: id,
          faturado_em: (/* @__PURE__ */ new Date()).toISOString(),
          faturado_por: req.user?.name || "Admin"
        }).in("id", bIds);
        bustBalancoCaches();
        console.log(`[asaas] ${bIds.length} billing(s) marcados como FATURADO`);
      }
      await logSystemAudit({
        userId: req.user?.id,
        userName: req.user?.name,
        userRole: req.user?.role,
        action: "EMITIR_FATURA_APROVADA",
        targetId: String(id),
        targetType: "invoice",
        details: `Fatura #${id} emitida via Asaas. ${clientName} R$${totalValue.toFixed(2)} venc=${dueDate}. Asaas=${payment.id}`,
        ipAddress: req.ip
      });
      res.json({ success: true, message: `Boleto gerado${emiteNf ? " + NF-e emitida" : ""}. Asaas: ${payment.id}`, invoice: updated });
    } catch (err) {
      console.error("[asaas] Erro ao emitir fatura aprovada:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/invoices/:id/resend", requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      if (!invoice.asaas_payment_id) return res.status(400).json({ message: "Fatura sem v\xEDnculo com Asaas" });
      await asaasRequest("POST", `/payments/${invoice.asaas_payment_id}/resendNotification`, {});
      const now = (/* @__PURE__ */ new Date()).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      await logSystemAudit({
        userId: req.user?.id,
        userName: req.user?.name,
        userRole: req.user?.role,
        action: "ASAAS_NOTIFICACAO_REENVIADA",
        targetId: invoice.asaas_payment_id,
        targetType: "invoice",
        details: `Notifica\xE7\xE3o reenviada para cobran\xE7a ${invoice.asaas_payment_id} (R$${parseFloat(invoice.value).toFixed(2)}) \xE0s ${now}`,
        ipAddress: req.ip
      });
      res.json({ success: true, message: "Notifica\xE7\xE3o reenviada", timestamp: now });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.get("/api/invoices/:id/notifications", requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      if (!invoice.asaas_payment_id) return res.status(400).json({ message: "Fatura sem v\xEDnculo com Asaas" });
      let notifications = [];
      let paymentDetails = null;
      try {
        paymentDetails = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}`);
      } catch {
      }
      try {
        const notifData = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}/notifications`);
        if (notifData?.data) notifications = notifData.data;
        else if (Array.isArray(notifData)) notifications = notifData;
      } catch {
      }
      const { data: auditLogs } = await supabaseAdmin.from("system_audit_log").select("action, details, created_at").or(`target_id.eq.${invoice.asaas_payment_id},and(target_type.eq.invoice,target_id.eq.${invoice.id})`).order("created_at", { ascending: true }).limit(20);
      const timeline = [];
      if (invoice.created_at) {
        timeline.push({
          type: "created",
          icon: "receipt",
          label: "Cobran\xE7a criada no Asaas",
          detail: `${invoice.billing_type} \u2022 R$ ${parseFloat(invoice.value).toFixed(2)}`,
          timestamp: invoice.created_at
        });
      }
      if (auditLogs) {
        for (const log2 of auditLogs) {
          if (log2.action === "ASAAS_COBRANCA_GERADA") {
            continue;
          }
          if (log2.action === "ASAAS_NOTIFICACAO_REENVIADA") {
            timeline.push({
              type: "resent",
              icon: "send",
              label: "Notifica\xE7\xE3o reenviada manualmente",
              detail: log2.details,
              timestamp: log2.created_at
            });
          }
          if (log2.action?.startsWith("ASAAS_WEBHOOK_")) {
            const evtName = log2.action.replace("ASAAS_WEBHOOK_", "");
            timeline.push({
              type: "webhook",
              icon: "webhook",
              label: `Evento Asaas: ${evtName}`,
              detail: log2.details,
              timestamp: log2.created_at
            });
          }
          if (log2.action === "EMITIR_NFSE") {
            timeline.push({
              type: "sent",
              icon: "receipt",
              label: "NFS-e solicitada ao Asaas",
              detail: log2.details,
              timestamp: log2.created_at
            });
          }
          if (log2.action === "CANCELAR_NFSE") {
            timeline.push({
              type: "error",
              icon: "alert",
              label: "NFS-e cancelada (Diretoria)",
              detail: log2.details,
              timestamp: log2.created_at
            });
          }
          if (log2.action === "ANEXAR_NF") {
            timeline.push({
              type: "resent",
              icon: "receipt",
              label: "NF anexada manualmente",
              detail: log2.details,
              timestamp: log2.created_at
            });
          }
        }
      }
      for (const n of notifications) {
        const eventLabel = n.event === "PAYMENT_CREATED" ? "E-mail de cobran\xE7a enviado" : n.event === "PAYMENT_RECEIVED" ? "E-mail de confirma\xE7\xE3o de pagamento" : n.event === "PAYMENT_OVERDUE" ? "E-mail de cobran\xE7a vencida" : n.event === "PAYMENT_DUEDATE_WARNING" ? "E-mail de lembrete de vencimento" : `Notifica\xE7\xE3o: ${n.event || "desconhecido"}`;
        timeline.push({
          type: n.status === "FAILED" || n.status === "BOUNCED" ? "error" : n.status === "READ" ? "read" : "sent",
          icon: n.status === "FAILED" || n.status === "BOUNCED" ? "alert" : n.status === "READ" ? "eye" : "mail",
          label: eventLabel,
          detail: n.emailAddress ? `Para: ${n.emailAddress}` : void 0,
          status: n.status,
          timestamp: n.scheduleDate || n.dateCreated
        });
      }
      const emailStatus = paymentDetails?.lastInvoiceViewedDate ? "VIEWED" : notifications.some((n) => n.status === "BOUNCED" || n.status === "FAILED") ? "BOUNCE" : notifications.some((n) => n.status === "READ") ? "READ" : notifications.some((n) => n.status === "SENT" || n.status === "DELIVERED") ? "SENT" : notifications.length > 0 ? "QUEUED" : "UNKNOWN";
      const customerEmail = paymentDetails?.customer?.email || null;
      timeline.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
      res.json({
        emailStatus,
        customerEmail,
        lastViewedDate: paymentDetails?.lastInvoiceViewedDate || null,
        notifications,
        timeline,
        paymentStatus: paymentDetails?.status
      });
    } catch (err) {
      console.error("[asaas] notifications error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.get("/api/invoices/:id/nfse-pdf", requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).send("Fatura n\xE3o encontrada");
      let pdfUrl = invoice.nfse_url || null;
      let nfId = null;
      if (invoice.nfse_number && String(invoice.nfse_number).startsWith("inv_")) {
        nfId = String(invoice.nfse_number);
      } else if (invoice.asaas_payment_id) {
        try {
          const fiscalInfo = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}/fiscalInfo`);
          nfId = fiscalInfo?.id || null;
          if (!pdfUrl && fiscalInfo?.pdfUrl) pdfUrl = fiscalInfo.pdfUrl;
        } catch {
        }
      }
      if (!pdfUrl && nfId) {
        try {
          const nfDetails = await asaasRequest("GET", `/invoices/${nfId}`);
          pdfUrl = nfDetails?.pdfUrl || nfDetails?.pdf || null;
        } catch {
        }
      }
      if (!pdfUrl) return res.status(404).send("PDF da NFS-e indispon\xEDvel");
      const upstream = await fetch(pdfUrl, { redirect: "follow" });
      if (!upstream.ok) return res.status(502).send("Falha ao obter PDF do Asaas");
      const ct = (upstream.headers.get("content-type") || "").toLowerCase();
      let buf = Buffer.from(await upstream.arrayBuffer());
      const isPdf = ct.includes("pdf") || buf.length >= 4 && buf.slice(0, 4).toString() === "%PDF";
      if (isPdf) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="nfse-${id}.pdf"`);
      } else {
        let html = buf.toString("utf-8");
        html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
        html = html.replace(/\son[a-z]+="[^"]*"/gi, "");
        html = html.replace(/\son[a-z]+='[^']*'/gi, "");
        if (!/<base\s/i.test(html)) {
          const base = `<base href="${new URL(pdfUrl).origin}/" target="_blank">`;
          html = html.replace(/<head[^>]*>/i, (m) => `${m}${base}`);
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        buf = Buffer.from(html, "utf-8");
      }
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Cache-Control", "no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.removeHeader("Content-Security-Policy");
      res.removeHeader("ETag");
      res.removeHeader("Last-Modified");
      res.send(buf);
    } catch (err) {
      console.error("[asaas] nfse-pdf error:", err.message);
      res.status(500).send(err.message);
    }
  });
  app.get("/api/invoices/:id/pix", requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      if (!invoice.asaas_payment_id) return res.status(400).json({ message: "Fatura sem v\xEDnculo com Asaas" });
      const pixData = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}/pixQrCode`);
      await supabaseAdmin.from("invoices").update({
        pix_qr_code: pixData.encodedImage,
        pix_copia_e_cola: pixData.payload
      }).eq("id", id);
      res.json({ qrCode: pixData.encodedImage, copiaECola: pixData.payload });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/asaas/webhook", async (req, res) => {
    try {
      const rawAuth = req.headers["authorization"] || "";
      const bearer = rawAuth.toLowerCase().startsWith("bearer ") ? rawAuth.slice(7).trim() : rawAuth.trim();
      const webhookToken = (req.headers["asaas-access-token"] || req.headers["x-asaas-access-token"] || bearer || "").trim();
      const expectedToken = (process.env.ASAAS_WEBHOOK_TOKEN || process.env.ASAAS_API_KEY || "").trim();
      if (!expectedToken) {
        console.error("[asaas] Webhook ACEITO sem valida\xE7\xE3o: ASAAS_WEBHOOK_TOKEN n\xE3o configurado.");
      } else if (webhookToken !== expectedToken) {
        console.warn(`[asaas] Webhook REJEITADO: token inv\xE1lido. recebido(len=${webhookToken.length}) esperado(len=${expectedToken.length}) IP=${req.ip} UA=${req.headers["user-agent"]}`);
        await logSystemAudit({
          userId: null,
          userName: "SISTEMA",
          userRole: "system",
          action: "ASAAS_WEBHOOK_REJEITADO",
          targetId: "N/A",
          targetType: "security",
          details: `Webhook rejeitado por token inv\xE1lido. IP: ${req.ip}. UA: ${req.headers["user-agent"]}. Headers recebidos: ${Object.keys(req.headers).join(", ")}`,
          ipAddress: req.ip
        });
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { event, payment } = req.body;
      console.log(`[asaas] Webhook received: ${event}`);
      if (!payment?.id) return res.json({ received: true });
      const statusMap = {
        "PAYMENT_CONFIRMED": "CONFIRMED",
        "PAYMENT_RECEIVED": "RECEIVED",
        "PAYMENT_OVERDUE": "OVERDUE",
        "PAYMENT_DELETED": "CANCELLED",
        "PAYMENT_REFUNDED": "REFUNDED",
        "PAYMENT_UPDATED": payment.status
      };
      const newStatus = statusMap[event];
      if (!newStatus) return res.json({ received: true });
      const updates = {
        status: newStatus,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (payment.paymentDate) updates.payment_date = payment.paymentDate;
      if (payment.value || payment.netValue) updates.net_value = payment.value || payment.netValue;
      const isRegression = isStatusRegression(newStatus);
      let updateQuery = supabaseAdmin.from("invoices").update(updates).eq("asaas_payment_id", payment.id);
      if (isRegression) updateQuery = updateQuery.not("status", "in", `(${PAID_STATUSES.map((s) => `"${s}"`).join(",")})`);
      const { data: updatedInvoice } = await updateQuery.select("id, client_name, value, service_order_id").maybeSingle();
      if (!updatedInvoice && isRegression) {
        console.log(`[asaas] Webhook ${event} IGNORADO (fatura j\xE1 em status pago protegido contra regress\xE3o p/ ${newStatus}). asaas_payment_id=${payment.id}`);
        await logSystemAudit({
          userId: null,
          userName: "Asaas Webhook",
          userRole: "system",
          action: `ASAAS_WEBHOOK_${event}_IGNORADO`,
          targetId: payment.id,
          targetType: "asaas_payment",
          details: `Webhook ${event} ignorado: fatura j\xE1 em status pago, evitando regress\xE3o p/ ${newStatus}. Payment Asaas: ${payment.id}.`,
          ipAddress: req.ip
        });
        return res.json({ received: true, ignored: true, reason: "already-paid-protected" });
      }
      if (updatedInvoice && (newStatus === "CONFIRMED" || newStatus === "RECEIVED")) {
        try {
          await supabaseAdmin.from("escort_billings").update({ status: "PAGO", pago_em: (/* @__PURE__ */ new Date()).toISOString() }).eq("invoice_id", updatedInvoice.id);
          bustBalancoCaches();
        } catch (_e) {
        }
        try {
          const { createAutoTransaction: createAutoTransaction2 } = await Promise.resolve().then(() => (init_helpers(), helpers_exports));
          await createAutoTransaction2({
            description: `Recebimento Asaas - ${updatedInvoice.client_name} (${payment.id})`,
            amount: payment.netValue || updatedInvoice.value,
            type: "INCOME",
            category: "Faturamento",
            origin_type: "invoice",
            origin_id: String(updatedInvoice.id)
          });
        } catch (_e) {
        }
      }
      await logSystemAudit({
        userId: null,
        userName: "Asaas Webhook",
        userRole: "system",
        action: `ASAAS_WEBHOOK_${event}`,
        targetId: payment.id,
        targetType: "asaas_payment",
        details: `Payment ${payment.id} \u2192 ${newStatus}. Valor: R$${payment.value || 0}. L\xEDquido: R$${payment.netValue || 0}. Data pgto: ${payment.paymentDate || "\u2014"}`,
        ipAddress: req.ip
      });
      console.log(`[asaas] Webhook: payment ${payment.id} \u2192 ${newStatus}`);
      res.json({ received: true });
    } catch (err) {
      console.error("[asaas] Webhook error:", err.message);
      res.json({ received: true });
    }
  });
  app.get("/api/asaas/payments", requireAdminRole, async (req, res) => {
    try {
      const offset = parseInt(req.query.offset) || 0;
      const limit = parseInt(req.query.limit) || 20;
      const status = req.query.status;
      let path3 = `/payments?offset=${offset}&limit=${limit}`;
      if (status) path3 += `&status=${status}`;
      const data = await asaasRequest("GET", path3);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  const gerarFaturaLocks = /* @__PURE__ */ new Map();
  app.get("/api/billing-profiles/:clientId", requireAdminRole, async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      if (!clientId) return res.status(400).json({ message: "clientId inv\xE1lido" });
      const { data, error } = await supabaseAdmin.from("customer_billing_profiles").select("*").eq("client_id", clientId).order("is_default", { ascending: false }).order("created_at", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/billing-profiles/:clientId", requireAdminRole, async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      if (!clientId) return res.status(400).json({ message: "clientId inv\xE1lido" });
      const { label, cnpj, razao_social, is_default } = req.body;
      if (!cnpj || !razao_social) return res.status(400).json({ message: "CNPJ e Raz\xE3o Social s\xE3o obrigat\xF3rios" });
      const { data, error } = await supabaseAdmin.from("customer_billing_profiles").insert({ client_id: clientId, label: label || "", cnpj, razao_social, is_default: is_default || false }).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.delete("/api/billing-profiles/:id", requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) return res.status(400).json({ message: "ID inv\xE1lido" });
      const { error } = await supabaseAdmin.from("customer_billing_profiles").delete().eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/boletim-medicao/gerar-fatura/:clientId", requireAdminRole, async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      if (!clientId) return res.status(400).json({ message: "clientId inv\xE1lido" });
      const lastCall = gerarFaturaLocks.get(clientId);
      if (lastCall && Date.now() - lastCall < 1e4) {
        return res.status(409).json({ message: "Fatura j\xE1 est\xE1 sendo gerada para este cliente. Aguarde alguns segundos." });
      }
      gerarFaturaLocks.set(clientId, Date.now());
      const { billingType, sendToAsaas, dueDate, startDate, endDate, expectedTotal, splits } = req.body;
      const user = req.user;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Per\xEDodo obrigat\xF3rio. Informe startDate e endDate." });
      }
      const fromDate = `${startDate}T00:00:00`;
      const toDate = `${endDate}T23:59:59`;
      const FATURAVEIS = ["APROVADA", "A_VERIFICAR", "PENDENTE", "ENVIADA_APROVACAO", "CANCELADA", "CANCELADO"];
      let query = supabaseAdmin.from("escort_billings").select("*").eq("client_id", clientId).in("status", FATURAVEIS).gte("data_missao", fromDate).lte("data_missao", toDate);
      const { data: rawBillings, error: billErr } = await query;
      if (billErr) throw billErr;
      const soIds = (rawBillings || []).map((b) => b.service_order_id).filter(Boolean);
      const soStatusMap = /* @__PURE__ */ new Map();
      if (soIds.length > 0) {
        const { data: sos } = await supabaseAdmin.from("service_orders").select("id, status").in("id", soIds);
        for (const so of sos || []) soStatusMap.set(String(so.id), String(so.status || "").toLowerCase());
      }
      const billings = (rawBillings || []).filter((b) => {
        const soSt = soStatusMap.get(String(b.service_order_id)) || "";
        return soSt !== "recusada";
      });
      if (billings.length === 0) {
        const { data: allBillings } = await supabaseAdmin.from("escort_billings").select("id, status").eq("client_id", clientId).gte("data_missao", fromDate).lte("data_missao", toDate);
        const faturados = allBillings?.filter((b) => b.status === "FATURADO" || b.status === "FATURADA").length || 0;
        if (faturados > 0) {
          return res.status(400).json({ message: `Todas as ${faturados} OS neste per\xEDodo j\xE1 foram faturadas. Para gerar nova fatura, exclua a fatura existente primeiro.` });
        }
        return res.status(400).json({ message: `Nenhuma OS fatur\xE1vel no per\xEDodo ${startDate} a ${endDate}. S\xF3 h\xE1 OS recusadas/faturadas.` });
      }
      console.log(`[asaas] Faturando ${billings.length} OS(s) para cliente ${clientId}. Per\xEDodo: ${startDate} a ${endDate}. Status: ${[...new Set(billings.map((b) => b.status))].join(", ")}`);
      const clientName = billings[0].client_name || "Cliente";
      const osDescriptions = [];
      let totalValue = 0;
      const billingIds = [];
      const breakdown = [];
      for (const b of billings) {
        const acionamento = Number(b.fat_acionamento || 0);
        const horaExtra = Number(b.fat_hora_extra || 0);
        const km = Number(b.fat_km || 0);
        const pedagio = Number(b.despesas_pedagio || 0);
        const adNoturno = Number(b.fat_adicional_noturno || 0);
        const estadia = Number(b.fat_estadia || 0);
        const pernoite = Number(b.fat_pernoite || 0);
        const outras = Number(b.despesas_outras || 0);
        const reembolso = Number(b.receitas_os || 0);
        const fatTotalSalvo = Number(b.fat_total || 0);
        const fatComponentes = acionamento + horaExtra + km + adNoturno + estadia + pernoite + pedagio + outras + reembolso;
        const fat = fatTotalSalvo > 0 ? fatTotalSalvo : fatComponentes;
        totalValue += fat;
        billingIds.push(b.id);
        const osRef = b.boletim_numero || `OS-${b.service_order_id}`;
        const route = [b.origem, b.destino].filter(Boolean).join(" \u2192 ");
        const dataMissao = b.data_missao ? new Date(b.data_missao).toLocaleDateString("pt-BR") : "";
        osDescriptions.push(`${osRef} ${dataMissao} ${route} ${fmtBRL(fat)}`.trim());
        breakdown.push({
          billingId: b.id,
          serviceOrderId: b.service_order_id,
          osRef,
          status: b.status,
          dataMissao: b.data_missao,
          route,
          fatAcionamento: acionamento,
          fatHoraExtra: horaExtra,
          fatKm: km,
          despesasPedagio: pedagio,
          fatAdicionalNoturno: adNoturno,
          fatTotalSalvo,
          fatComponentes,
          fatUsado: fat,
          suspeito: fat > 1e6 || fat < 0
        });
        console.log(`[billing-audit] ${osRef}: acion=${acionamento} hExtra=${horaExtra} km=${km} ped=${pedagio} adNoturno=${adNoturno} | componentes=${fatComponentes} fat_total=${fatTotalSalvo} \u2192 usado=${fat}`);
      }
      console.log(`[billing-audit] TOTAL para fatura: R$${totalValue.toFixed(2)} (${billings.length} OS). Per\xEDodo: ${startDate} a ${endDate}`);
      if (totalValue <= 0) {
        return res.status(400).json({ message: `Valor total \xE9 R$0,00. Verifique o Boletim de Medi\xE7\xE3o.` });
      }
      if (expectedTotal && Math.abs(totalValue - Number(expectedTotal)) > 0.01) {
        const diff = Math.abs(totalValue - Number(expectedTotal));
        const msg = `BLOQUEADO: Soma do backend (R$${totalValue.toFixed(2)}) difere do frontend (R$${Number(expectedTotal).toFixed(2)}). Diferen\xE7a: R$${diff.toFixed(2)}`;
        console.error(`[billing-audit] ${msg}`);
        gerarFaturaLocks.delete(clientId);
        return res.status(400).json({
          message: msg,
          code: "TOTAL_MISMATCH",
          backendTotal: Number(totalValue.toFixed(2)),
          frontendTotal: Number(Number(expectedTotal).toFixed(2)),
          diff: Number(diff.toFixed(2)),
          osCount: billings.length,
          startDate,
          endDate,
          breakdown: breakdown.sort((a, b) => (b.fatUsado || 0) - (a.fatUsado || 0))
        });
      }
      if (splits && Array.isArray(splits) && splits.length > 0) {
        const splitsSum = splits.reduce((s, sp) => s + (Number(sp.valor) || 0), 0);
        if (Math.round(splitsSum * 100) > Math.round(totalValue * 100)) {
          gerarFaturaLocks.delete(clientId);
          return res.status(400).json({ message: `BLOQUEADO: Soma das parcelas (R$${splitsSum.toFixed(2)}) excede o valor total aprovado (R$${totalValue.toFixed(2)}).` });
        }
        if (Math.abs(splitsSum - totalValue) > 0.01) {
          gerarFaturaLocks.delete(clientId);
          return res.status(400).json({ message: `BLOQUEADO: Soma das parcelas (R$${splitsSum.toFixed(2)}) n\xE3o confere com o total (R$${totalValue.toFixed(2)}). Diferen\xE7a: R$${Math.abs(splitsSum - totalValue).toFixed(2)}.` });
        }
        for (const sp of splits) {
          if (!sp.cnpj || !sp.razao_social) {
            gerarFaturaLocks.delete(clientId);
            return res.status(400).json({ message: "Todos os CNPJs da divis\xE3o precisam ter CNPJ e Raz\xE3o Social preenchidos." });
          }
          if ((Number(sp.valor) || 0) <= 0) {
            gerarFaturaLocks.delete(clientId);
            return res.status(400).json({ message: `Valor inv\xE1lido para o CNPJ ${sp.razao_social}. Informe um valor maior que zero.` });
          }
        }
        console.log(`[billing-audit] SPLIT detectado: ${splits.length} parcelas. Soma: R$${splitsSum.toFixed(2)}`);
      }
      const now = /* @__PURE__ */ new Date();
      const invoiceDueDate = dueDate || new Date(now.getFullYear(), now.getMonth() + 1, 15).toISOString().split("T")[0];
      const datasOs = billings.map((b) => b.data_missao || b.created_at).filter(Boolean).sort();
      const periodoInicio = datasOs[0]?.split("T")[0] || invoiceDueDate;
      const periodoFim = datasOs[datasOs.length - 1]?.split("T")[0] || invoiceDueDate;
      const descricaoFiscal = buildInvoiceDescription(clientName, periodoInicio, periodoFim);
      console.log(`[billing-audit] Detalhamento interno (${billings.length} OS):
${osDescriptions.join("\n")}`);
      const { data: clientData } = await supabaseAdmin.from("clients").select("cnpj, cpf, emite_nf, retem_inss, inss_aliquota, billing_cycle, address, address_number, address_complement, bairro, city, state, zip, email, email_financeiro, email_contratual, email_operacional, phone, inscricao_municipal, inscricao_estadual").eq("id", clientId).single();
      const cpfCnpj = clientData?.cnpj || clientData?.cpf || "";
      const emiteNfConsolidado = clientData?.emite_nf === true;
      const retemInssConsolidado = clientData?.retem_inss === true;
      const inssAliquotaConsolidado = Number(clientData?.inss_aliquota ?? 11);
      const inssValorConsolidado = retemInssConsolidado ? Number((totalValue * inssAliquotaConsolidado / 100).toFixed(2)) : 0;
      if (clientData?.billing_cycle === "quinzenal") {
        const { data: allInPeriod } = await supabaseAdmin.from("escort_billings").select("id, status, boletim_numero, service_order_id, data_missao").eq("client_id", clientId).gte("data_missao", fromDate).lte("data_missao", toDate).not("status", "in", '("RECUSADA","CANCELADA","CANCELADO","FATURADA","FATURADO","PAGO","REJEITADA")');
        const blocking = (allInPeriod || []).filter(
          (b) => !["APROVADA"].includes(b.status)
        );
        if (blocking.length > 0) {
          gerarFaturaLocks.delete(clientId);
          const osList = blocking.map((b) => ({
            id: b.id,
            osRef: b.boletim_numero || `OS-${b.service_order_id}`,
            status: b.status,
            dataMissao: b.data_missao
          }));
          const refs = osList.map((o) => `${o.osRef} (${o.status})`).slice(0, 10).join(", ");
          const extra = osList.length > 10 ? ` +${osList.length - 10} OS` : "";
          return res.status(409).json({
            code: "QUINZENA_INCOMPLETA",
            message: `BLOQUEADO: ${blocking.length} OS desta quinzena ainda N\xC3O est\xE1(\xE3o) aprovada(s) para faturamento. Regularize antes de faturar: ${refs}${extra}.`,
            pendingOs: osList,
            totalPendente: blocking.length,
            periodo: { startDate, endDate }
          });
        }
        console.log(`[asaas] Valida\xE7\xE3o quinzenal OK para cliente ${clientId}: 0 OS pendentes no per\xEDodo ${startDate} a ${endDate}.`);
      }
      const clientEmailConsolidado = clientData?.email_financeiro || clientData?.email || clientData?.email_contratual || clientData?.email_operacional || void 0;
      const clientPhoneConsolidado = clientData?.phone || void 0;
      if (splits && Array.isArray(splits) && splits.length > 1) {
        console.log(`[billing] SPLIT MODE: ${splits.length} faturas para ${splits.length} CNPJs`);
        const createdInvoices = [];
        for (let idx = 0; idx < splits.length; idx++) {
          const sp = splits[idx];
          const splitValue = Number(sp.valor);
          const splitCnpj = String(sp.cnpj || "").replace(/\D/g, "");
          const splitName = sp.razao_social || clientName;
          const splitDescricao = `${buildInvoiceDescription(splitName, periodoInicio, periodoFim)} - ${splitName}`;
          let spAsaasCustomerId = null;
          let spAsaasPaymentId = null;
          let spInvoiceUrl = null;
          let spBankSlipUrl = null;
          let spPixQrCode = null;
          let spPixCopiaECola = null;
          let spInvoiceStatus = "PENDING";
          let spNfseStatus = null;
          let spNfseNumber = null;
          let spNfseErrorMessage = null;
          const spInssValor = retemInssConsolidado ? Number((splitValue * inssAliquotaConsolidado / 100).toFixed(2)) : 0;
          if (sendToAsaas && process.env.ASAAS_API_KEY && splitCnpj) {
            try {
              spAsaasCustomerId = await findOrCreateAsaasCustomer(splitName, splitCnpj, clientEmailConsolidado, clientPhoneConsolidado, clientData?.address, clientData?.city, clientData?.state, clientData?.zip, {
                addressNumber: clientData?.address_number || void 0,
                complement: clientData?.address_complement || void 0,
                province: clientData?.bairro || void 0,
                municipalInscription: clientData?.inscricao_municipal || void 0,
                stateInscription: clientData?.inscricao_estadual || void 0
              });
              const payload = {
                customer: spAsaasCustomerId,
                billingType: billingType || "BOLETO",
                value: Number((splitValue - spInssValor).toFixed(2)),
                dueDate: invoiceDueDate,
                description: splitDescricao.substring(0, 500),
                externalReference: `FATURA-SPLIT-${clientId}-${idx + 1}de${splits.length}-${now.getTime()}`,
                notificationDisabled: true
              };
              if (emiteNfConsolidado) {
                payload.postalService = false;
                const inssObs = retemInssConsolidado ? ` ${INSS_OBSERVACAO_LEGAL} Al\xEDquota: ${inssAliquotaConsolidado.toFixed(2)}%. Valor retido: R$ ${spInssValor.toFixed(2).replace(".", ",")}.` : "";
                payload.fiscalObservations = `CNAE ${CNAE_PRINCIPAL}. ${DESCRICAO_SERVICO_FIXA}. Per\xEDodo: ${periodoInicio} a ${periodoFim}.${inssObs}`;
              }
              console.log(`[asaas] SPLIT ${idx + 1}/${splits.length} \u2014 CNPJ ${splitCnpj}, Valor R$${splitValue.toFixed(2)}. Payload:`, JSON.stringify(payload));
              const payment = await asaasRequest("POST", "/payments", payload);
              spAsaasPaymentId = payment.id;
              spInvoiceUrl = payment.invoiceUrl;
              spBankSlipUrl = payment.bankSlip?.url || payment.bankSlipUrl;
              spInvoiceStatus = payment.status || "PENDING";
              if (billingType === "PIX" || billingType === "UNDEFINED") {
                try {
                  const pixData = await asaasRequest("GET", `/payments/${payment.id}/pixQrCode`);
                  spPixQrCode = pixData.encodedImage;
                  spPixCopiaECola = pixData.payload;
                } catch {
                }
              }
              if (spAsaasPaymentId && emiteNfConsolidado) {
                try {
                  const nfResult = await emitNfseImmediate({
                    paymentId: spAsaasPaymentId,
                    value: splitValue,
                    description: splitDescricao.substring(0, 500),
                    observations: `CNAE ${CNAE_PRINCIPAL}. Per\xEDodo: ${periodoInicio} a ${periodoFim}. ${billings.length} miss\xE3o(\xF5es). Split ${idx + 1}/${splits.length}.`,
                    clientEmail: clientEmailConsolidado,
                    retemInss: retemInssConsolidado,
                    inssAliquota: inssAliquotaConsolidado
                  });
                  spNfseStatus = nfResult.status || "AUTHORIZED";
                  if (nfResult.number) spNfseNumber = String(nfResult.number);
                  else if (nfResult.id) spNfseNumber = String(nfResult.id);
                  console.log(`[asaas] NFS-e split ${idx + 1} emitida para payment ${spAsaasPaymentId}. ID: ${nfResult.id}`);
                } catch (nfErr) {
                  spNfseStatus = "ERROR";
                  spNfseErrorMessage = String(nfErr?.message || "Erro desconhecido ao emitir NFS-e").slice(0, 1e3);
                  console.log(`[asaas] NFS-e split ${idx + 1} error: ${nfErr.message}`);
                }
              } else if (spAsaasPaymentId && !emiteNfConsolidado) {
                console.log(`[asaas] NFS-e split ${idx + 1} N\xC3O emitida (cliente ${clientId} com emite_nf=false).`);
              }
              await logSystemAudit({
                userId: user?.id,
                userName: user?.name,
                userRole: user?.role,
                action: "ASAAS_FATURA_SPLIT",
                targetId: spAsaasPaymentId,
                targetType: "invoice",
                details: `Fatura split ${idx + 1}/${splits.length} \u2014 CNPJ ${splitCnpj} (${splitName}). R$${splitValue.toFixed(2)}. Asaas: ${spAsaasPaymentId}`,
                ipAddress: req.ip
              });
            } catch (asaasErr) {
              console.error(`[asaas] Erro split ${idx + 1}: ${asaasErr.message}`);
              await logSystemAudit({
                userId: user?.id,
                userName: user?.name,
                userRole: user?.role,
                action: "ASAAS_FATURA_ERRO",
                targetId: String(clientId),
                targetType: "invoice",
                details: `ERRO fatura split ${idx + 1}/${splits.length} CNPJ ${splitCnpj}: ${asaasErr.message}. Valor: R$${splitValue.toFixed(2)}`,
                ipAddress: req.ip
              });
            }
          }
          const { data: spInvoice, error: spInvErr } = await supabaseAdmin.from("invoices").insert({
            client_id: clientId,
            client_name: splitName,
            client_cpf_cnpj: splitCnpj || cpfCnpj || null,
            asaas_customer_id: spAsaasCustomerId,
            asaas_payment_id: spAsaasPaymentId,
            description: splitDescricao,
            value: splitValue,
            due_date: invoiceDueDate,
            billing_type: billingType || "BOLETO",
            status: spInvoiceStatus,
            invoice_url: spInvoiceUrl,
            bank_slip_url: spBankSlipUrl,
            pix_qr_code: spPixQrCode,
            pix_copia_e_cola: spPixCopiaECola,
            nfse_status: spNfseStatus,
            nfse_number: spNfseNumber,
            nfse_error_message: spNfseErrorMessage,
            notes: `${DESCRICAO_SERVICO_FIXA} - Per\xEDodo: ${periodoInicio} a ${periodoFim}. ${billings.length} miss\xE3o(\xF5es). Split ${idx + 1}/${splits.length} \u2014 CNPJ ${splitCnpj}.`,
            external_reference: `BOLETIM-${clientId}-${billingIds.length}OS-SPLIT${idx + 1}`,
            provider_cnpj: TORRES_CNPJ,
            valor_inss_retido: retemInssConsolidado ? spInssValor : null,
            inss_aliquota: retemInssConsolidado ? inssAliquotaConsolidado : null,
            created_by: user?.id
          }).select().single();
          if (spInvErr) throw spInvErr;
          createdInvoices.push(spInvoice);
          await supabaseAdmin.from("billing_splits").insert({
            invoice_id: spInvoice.id,
            client_id: clientId,
            profile_id: sp.profile_id || null,
            cnpj: sp.cnpj,
            razao_social: sp.razao_social,
            valor: splitValue,
            billing_ids: billingIds,
            status: spAsaasPaymentId ? "SENT" : "PENDING",
            created_by: user?.name || "Sistema"
          });
          if (sp.save_profile) {
            const { data: existing } = await supabaseAdmin.from("customer_billing_profiles").select("id").eq("client_id", clientId).eq("cnpj", sp.cnpj).maybeSingle();
            if (!existing) {
              await supabaseAdmin.from("customer_billing_profiles").insert({
                client_id: clientId,
                label: sp.label || "",
                cnpj: sp.cnpj,
                razao_social: sp.razao_social,
                is_default: false
              });
              console.log(`[billing] Novo perfil CNPJ salvo para cliente ${clientId}: ${sp.cnpj}`);
            }
          }
        }
        const primaryInvoice = createdInvoices[0];
        const { error: updateErr2 } = await supabaseAdmin.from("escort_billings").update({
          status: "FATURADO",
          faturado_em: (/* @__PURE__ */ new Date()).toISOString(),
          faturado_por: user?.name || "Sistema",
          invoice_id: primaryInvoice.id
        }).in("id", billingIds);
        if (updateErr2) {
          console.error("[billing] Erro ao atualizar status para FATURADO:", updateErr2.message);
        } else {
          bustBalancoCaches();
        }
        await logSystemAudit({
          userId: user?.id,
          userName: user?.name,
          userRole: user?.role,
          action: "GERAR_FATURA_SPLIT",
          targetId: createdInvoices.map((i) => i.id).join(","),
          targetType: "invoice",
          details: `${createdInvoices.length} faturas split para ${clientName}. ${billings.length} OS(s). Total: R$${totalValue.toFixed(2)}. Invoices: ${createdInvoices.map((i) => `#${i.id} (R$${Number(i.value).toFixed(2)})`).join(", ")}`,
          ipAddress: req.ip
        });
        console.log(`[billing] SPLIT conclu\xEDdo: ${createdInvoices.length} faturas criadas. IDs: ${createdInvoices.map((i) => i.id).join(", ")}`);
        gerarFaturaLocks.delete(clientId);
        return res.json({
          invoice: primaryInvoice,
          invoices: createdInvoices,
          billingIds,
          totalValue,
          missionsCount: billings.length,
          splitCount: createdInvoices.length
        });
      }
      let asaasCustomerId = null;
      let asaasPaymentId = null;
      let invoiceUrl = null;
      let bankSlipUrl = null;
      let pixQrCode = null;
      let pixCopiaECola = null;
      let invoiceStatus = "PENDING";
      let nfseStatus = null;
      let nfseNumber = null;
      let nfseErrorMessage = null;
      if (sendToAsaas && process.env.ASAAS_API_KEY && cpfCnpj) {
        try {
          asaasCustomerId = await findOrCreateAsaasCustomer(clientName, cpfCnpj, clientEmailConsolidado, clientPhoneConsolidado, clientData?.address, clientData?.city, clientData?.state, clientData?.zip, {
            addressNumber: clientData?.address_number || void 0,
            complement: clientData?.address_complement || void 0,
            province: clientData?.bairro || void 0,
            municipalInscription: clientData?.inscricao_municipal || void 0,
            stateInscription: clientData?.inscricao_estadual || void 0
          });
          const consolidadoPayload = {
            customer: asaasCustomerId,
            billingType: billingType || "BOLETO",
            value: Number((totalValue - inssValorConsolidado).toFixed(2)),
            dueDate: invoiceDueDate,
            description: descricaoFiscal.substring(0, 500),
            externalReference: `FATURA-${clientId}-${now.getTime()}`,
            notificationDisabled: true
          };
          if (emiteNfConsolidado) {
            consolidadoPayload.postalService = false;
            const inssObsPayment = retemInssConsolidado ? ` ${INSS_OBSERVACAO_LEGAL} Al\xEDquota: ${inssAliquotaConsolidado.toFixed(2)}%. Valor retido: R$ ${inssValorConsolidado.toFixed(2).replace(".", ",")}.` : "";
            consolidadoPayload.fiscalObservations = `CNAE ${CNAE_PRINCIPAL}. ${DESCRICAO_SERVICO_FIXA}. Per\xEDodo: ${periodoInicio} a ${periodoFim}.${inssObsPayment}`;
          }
          console.log(`[asaas] PAYLOAD AUDIT \u2014 Enviando para Asaas:`, JSON.stringify(consolidadoPayload, null, 2));
          const payment = await asaasRequest("POST", "/payments", consolidadoPayload);
          asaasPaymentId = payment.id;
          invoiceUrl = payment.invoiceUrl;
          bankSlipUrl = payment.bankSlip?.url || payment.bankSlipUrl;
          invoiceStatus = payment.status || "PENDING";
          if (billingType === "PIX" || billingType === "UNDEFINED") {
            try {
              const pixData = await asaasRequest("GET", `/payments/${payment.id}/pixQrCode`);
              pixQrCode = pixData.encodedImage;
              pixCopiaECola = pixData.payload;
            } catch {
            }
          }
          if (asaasPaymentId && emiteNfConsolidado) {
            try {
              const nfResult = await emitNfseImmediate({
                paymentId: asaasPaymentId,
                value: totalValue,
                description: descricaoFiscal.substring(0, 500),
                observations: `CNAE ${CNAE_PRINCIPAL}. Per\xEDodo: ${periodoInicio} a ${periodoFim}. ${billings.length} miss\xE3o(\xF5es).`,
                clientEmail: clientEmailConsolidado,
                retemInss: retemInssConsolidado,
                inssAliquota: inssAliquotaConsolidado
              });
              nfseStatus = nfResult.status || "AUTHORIZED";
              if (nfResult.number) nfseNumber = String(nfResult.number);
              else if (nfResult.id) nfseNumber = String(nfResult.id);
              console.log(`[asaas] NFS-e emitida imediatamente para payment ${asaasPaymentId}. ID: ${nfResult.id}, Status: ${nfseStatus}`);
            } catch (nfErr) {
              nfseStatus = "ERROR";
              nfseErrorMessage = String(nfErr?.message || "Erro desconhecido ao emitir NFS-e").slice(0, 1e3);
              console.log(`[asaas] NFS-e auto-emission error (non-blocking): ${nfErr.message}`);
            }
          } else if (asaasPaymentId && !emiteNfConsolidado) {
            console.log(`[asaas] NFS-e N\xC3O emitida (cliente ${clientId} com emite_nf=false). Apenas cobran\xE7a consolidada gerada.`);
          }
          await logSystemAudit({
            userId: user?.id,
            userName: user?.name,
            userRole: user?.role,
            action: "ASAAS_FATURA_CONSOLIDADA",
            targetId: asaasPaymentId,
            targetType: "invoice",
            details: `Fatura consolidada ${billingType || "BOLETO"} R$${totalValue.toFixed(2)} para ${clientName}. ${billings.length} OS(s). CNAE ${CNAE_PRINCIPAL}. Per\xEDodo: ${periodoInicio} a ${periodoFim}. Asaas: ${asaasPaymentId}`,
            ipAddress: req.ip
          });
        } catch (asaasErr) {
          console.error("[asaas] Erro ao gerar cobran\xE7a:", asaasErr.message);
          await logSystemAudit({
            userId: user?.id,
            userName: user?.name,
            userRole: user?.role,
            action: "ASAAS_FATURA_ERRO",
            targetId: String(clientId),
            targetType: "invoice",
            details: `ERRO fatura consolidada ${clientName}: ${asaasErr.message}. ${billings.length} OS(s). Valor: R$${totalValue.toFixed(2)}`,
            ipAddress: req.ip
          });
        }
      }
      const { data: invoice, error: invErr } = await supabaseAdmin.from("invoices").insert({
        client_id: clientId,
        client_name: clientName,
        client_cpf_cnpj: cpfCnpj || null,
        asaas_customer_id: asaasCustomerId,
        asaas_payment_id: asaasPaymentId,
        description: descricaoFiscal,
        value: totalValue,
        due_date: invoiceDueDate,
        billing_type: billingType || "BOLETO",
        status: invoiceStatus,
        invoice_url: invoiceUrl,
        bank_slip_url: bankSlipUrl,
        pix_qr_code: pixQrCode,
        pix_copia_e_cola: pixCopiaECola,
        nfse_status: nfseStatus,
        nfse_number: nfseNumber,
        nfse_error_message: nfseErrorMessage,
        notes: `${DESCRICAO_SERVICO_FIXA} - Per\xEDodo: ${periodoInicio} a ${periodoFim}. ${billings.length} miss\xE3o(\xF5es) aprovada(s).`,
        external_reference: `BOLETIM-${clientId}-${billingIds.length}OS`,
        provider_cnpj: TORRES_CNPJ,
        valor_inss_retido: retemInssConsolidado ? inssValorConsolidado : null,
        inss_aliquota: retemInssConsolidado ? inssAliquotaConsolidado : null,
        created_by: user?.id
      }).select().single();
      if (invErr) throw invErr;
      const { error: updateErr } = await supabaseAdmin.from("escort_billings").update({
        status: "FATURADO",
        faturado_em: (/* @__PURE__ */ new Date()).toISOString(),
        faturado_por: user?.name || "Sistema",
        invoice_id: invoice.id
      }).in("id", billingIds);
      if (updateErr) {
        console.error("[billing] Erro ao atualizar status para FATURADO:", updateErr.message);
      } else {
        bustBalancoCaches();
      }
      await logSystemAudit({
        userId: user?.id,
        userName: user?.name,
        userRole: user?.role,
        action: "GERAR_FATURA",
        targetId: String(invoice.id),
        targetType: "invoice",
        details: `Fatura consolidada para ${clientName}. ${billings.length} OS(s). Valor: R$${totalValue.toFixed(2)}. IDs: ${billingIds.join(", ")}. Asaas: ${asaasPaymentId || "n\xE3o enviado"}`,
        ipAddress: req.ip
      });
      res.json({
        invoice,
        billingIds,
        totalValue,
        missionsCount: billings.length
      });
    } catch (err) {
      console.error("[billing] Erro ao gerar fatura:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.delete("/api/invoices/:id", requireAdminRole, async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      if (isNaN(invoiceId)) return res.status(400).json({ message: "ID inv\xE1lido" });
      const user = req.user;
      if (user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode excluir faturas." });
      }
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", invoiceId).single();
      if (!invoice) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      if (invoice.status === "PAGO") {
        return res.status(400).json({ message: "N\xE3o \xE9 poss\xEDvel excluir fatura j\xE1 paga" });
      }
      const { data: linkedBillings } = await supabaseAdmin.from("escort_billings").select("id").eq("invoice_id", invoiceId);
      if (linkedBillings && linkedBillings.length > 0) {
        const billingIds = linkedBillings.map((b) => b.id);
        await supabaseAdmin.from("escort_billings").update({ status: "APROVADA", invoice_id: null, faturado_em: null, faturado_por: null }).in("id", billingIds);
        bustBalancoCaches();
      }
      if (invoice.asaas_payment_id && process.env.ASAAS_API_KEY) {
        try {
          await asaasRequest("DELETE", `/payments/${invoice.asaas_payment_id}`);
        } catch (e) {
          console.log("[asaas] Delete payment error:", e.message);
        }
      }
      await supabaseAdmin.from("financial_transactions").delete().eq("reference_id", `INV-${invoiceId}`);
      await supabaseAdmin.from("invoices").delete().eq("id", invoiceId);
      await logSystemAudit({
        userId: user?.id,
        userName: user?.name,
        userRole: user?.role,
        action: "DELETE_FATURA",
        targetId: String(invoiceId),
        targetType: "invoice",
        details: `Fatura #${invoiceId} exclu\xEDda. ${linkedBillings?.length || 0} billing(s) revertidos para APROVADA.`,
        ipAddress: req.ip
      });
      res.json({ success: true, revertedBillings: linkedBillings?.length || 0 });
    } catch (err) {
      console.error("[billing] Erro ao excluir fatura:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.get("/api/relatorio-nf", requireAdminRole, async (req, res) => {
    try {
      const from = req.query.from || "";
      const to = req.query.to || "";
      const fromIso = from ? `${from}T00:00:00` : "1900-01-01";
      const toIso = to ? `${to}T23:59:59.999` : "2999-12-31";
      const { data: billingsBase, error: bbErr } = await supabaseAdmin.from("escort_billings").select("id, client_id, client_name, data_missao, fat_total, fat_acionamento, fat_hora_extra, fat_km, despesas_pedagio, receitas_os, valor_franquia, valor_km_extra, status, service_order_id, invoice_id, boletim_numero, created_at").gte("data_missao", fromIso).lte("data_missao", toIso);
      if (bbErr) throw bbErr;
      const validBillings = (billingsBase || []).filter((b) => {
        const st = String(b.status || "").toUpperCase();
        return !(st === "CANCELADO" || st === "CANCELADA" || st === "REJEITADA" || st === "REJEITADO");
      });
      const billingValor2 = (b) => {
        const v = Number(b.fat_total || 0);
        if (v > 0) return v;
        return Number(b.fat_acionamento || b.valor_franquia || 0) + Number(b.fat_hora_extra || 0) + Number(b.fat_km || b.valor_km_extra || 0) + Number(b.despesas_pedagio || 0) + Number(b.receitas_os || 0);
      };
      const invIdsFromBills = Array.from(new Set(validBillings.map((b) => b.invoice_id).filter(Boolean)));
      const billingIdsAll = validBillings.map((b) => String(b.id));
      const { data: invoicesRaw } = invIdsFromBills.length > 0 ? await supabaseAdmin.from("invoices").select("*").in("id", invIdsFromBills) : { data: [] };
      const invErr = null;
      const invoiceMap = /* @__PURE__ */ new Map();
      for (const inv of invoicesRaw || []) invoiceMap.set(inv.id, inv);
      const { data: invoicesCreatedInPeriod } = await supabaseAdmin.from("invoices").select("*").gte("created_at", fromIso).lte("created_at", toIso);
      for (const inv of invoicesCreatedInPeriod || []) {
        if (!invoiceMap.has(inv.id)) invoiceMap.set(inv.id, inv);
      }
      const PAID_OR_CANCELED = /* @__PURE__ */ new Set([
        "RECEIVED",
        "CONFIRMED",
        "RECEIVED_IN_CASH",
        "PAGO",
        "CANCELLED",
        "CANCELED",
        "REFUNDED",
        "REFUND_REQUESTED"
      ]);
      const { data: invoicesOpen } = await supabaseAdmin.from("invoices").select("*");
      const openInvoicesAdded = [];
      for (const inv of invoicesOpen || []) {
        const st = String(inv.status || "").toUpperCase();
        if (PAID_OR_CANCELED.has(st)) continue;
        if (String(inv.nfse_status || "").toUpperCase().includes("CANCEL")) continue;
        if (!invoiceMap.has(inv.id)) {
          invoiceMap.set(inv.id, inv);
          openInvoicesAdded.push(inv);
        }
      }
      const invoiceIsTorres = (inv) => {
        if (!inv) return false;
        const pc = cleanCnpj(inv.provider_cnpj);
        if (!pc) return true;
        return pc === TORRES_CNPJ;
      };
      const { data: allApprovals } = await supabaseAdmin.from("boletim_approvals").select("*").order("created_at", { ascending: false }).limit(2e3);
      const billingToApproval = /* @__PURE__ */ new Map();
      for (const ap of allApprovals || []) {
        for (const bid of ap.billing_ids || []) {
          const key = String(bid);
          const cur = billingToApproval.get(key);
          if (!cur) {
            billingToApproval.set(key, ap);
            continue;
          }
          const curApr = String(cur.status || "").toUpperCase() === "APROVADO" ? 1 : 0;
          const newApr = String(ap.status || "").toUpperCase() === "APROVADO" ? 1 : 0;
          if (newApr > curApr) {
            billingToApproval.set(key, ap);
            continue;
          }
          if (newApr === curApr && String(ap.created_at || "") > String(cur.created_at || "")) {
            billingToApproval.set(key, ap);
          }
        }
      }
      const invClientIds = (invoicesCreatedInPeriod || []).map((i) => i.client_id).filter(Boolean);
      const openInvClientIds = openInvoicesAdded.map((i) => i.client_id).filter(Boolean);
      const allClientIds = Array.from(/* @__PURE__ */ new Set([
        ...validBillings.map((b) => b.client_id).filter(Boolean),
        ...invClientIds,
        ...openInvClientIds
      ]));
      const clientMap = /* @__PURE__ */ new Map();
      if (allClientIds.length > 0) {
        const { data: clientsData } = await supabaseAdmin.from("clients").select("id, name, nome_fantasia, cnpj, cpf, emite_nf, email_financeiro, email, email_contratual, email_operacional").in("id", allClientIds);
        for (const c of clientsData || []) {
          clientMap.set(c.id, { name: c.name, fantasia: c.nome_fantasia || null, cpfCnpj: c.cnpj || c.cpf || null, emiteNf: c.emite_nf !== false, email: c.email_financeiro || c.email || c.email_contratual || c.email_operacional || null });
        }
      }
      const allSoIds = Array.from(new Set(validBillings.map((b) => b.service_order_id).filter(Boolean)));
      const osNumMap = /* @__PURE__ */ new Map();
      if (allSoIds.length > 0) {
        const { data: sosAll } = await supabaseAdmin.from("service_orders").select("id, os_number").in("id", allSoIds);
        for (const so of sosAll || []) osNumMap.set(so.id, so.os_number);
      }
      const osLabel = (b) => osNumMap.get(b.service_order_id) || `OS-${b.service_order_id}`;
      const fatGroups = /* @__PURE__ */ new Map();
      const bolGroups = /* @__PURE__ */ new Map();
      const avulsos = [];
      for (const b of validBillings) {
        const inv = b.invoice_id ? invoiceMap.get(b.invoice_id) : null;
        if (inv && invoiceIsTorres(inv)) {
          const g = fatGroups.get(inv.id) || { inv, bills: [] };
          g.bills.push(b);
          fatGroups.set(inv.id, g);
          continue;
        }
        const ap = billingToApproval.get(String(b.id));
        if (ap) {
          const g = bolGroups.get(ap.id) || { ap, bills: [] };
          g.bills.push(b);
          bolGroups.set(ap.id, g);
          continue;
        }
        avulsos.push(b);
      }
      const rows = [];
      for (const { inv, bills } of fatGroups.values()) {
        const cli = clientMap.get(inv.client_id) || bills[0] && clientMap.get(bills[0].client_id);
        const ns = normalizeInvoiceStatus(inv, { emiteNf: cli?.emiteNf });
        const earliest = bills.map((b) => b.data_missao).sort()[0];
        rows.push({
          id: `INV-${inv.id}`,
          source: "INVOICE",
          sourceId: inv.id,
          clientId: inv.client_id,
          clientName: cli?.name || inv.client_name,
          clientFantasia: cli?.fantasia || null,
          clientCpfCnpj: cli?.cpfCnpj || inv.client_cpf_cnpj,
          clientEmail: cli?.email || null,
          description: inv.description,
          value: Number(inv.value || 0),
          netValue: inv.net_value != null ? Number(inv.net_value) : null,
          dueDate: inv.due_date,
          paymentDate: inv.payment_date,
          createdAt: earliest || inv.created_at,
          updatedAt: inv.updated_at,
          asaasPaymentId: inv.asaas_payment_id,
          invoiceUrl: inv.invoice_url,
          nfseUrl: inv.nfse_url,
          nfseNumber: inv.nfse_number && !String(inv.nfse_number).startsWith("inv_") ? inv.nfse_number : null,
          osCount: bills.length,
          osList: Array.from(new Map(bills.filter((b) => b.service_order_id).map((b) => [b.service_order_id, { id: b.service_order_id, osNumber: osLabel(b), value: billingValor2(b) }])).values()),
          rawStatus: inv.status,
          rawNfseStatus: inv.nfse_status,
          nfseErrorMessage: inv.nfse_error_message || null,
          rawBoletimStatus: null,
          normalizedStatus: ns,
          invoiceId: inv.id,
          approvalToken: null,
          approvalUrl: null,
          reminderCount: inv.reminder_count || 0,
          lastReminderSentAt: inv.last_reminder_sent_at || null
        });
      }
      const extraInvoices = [...invoicesCreatedInPeriod || [], ...openInvoicesAdded];
      const extraInvIds = Array.from(new Set(
        extraInvoices.filter((inv) => invoiceIsTorres(inv) && !fatGroups.has(inv.id)).map((inv) => inv.id)
      ));
      const reverseBillingsByInvoice = /* @__PURE__ */ new Map();
      if (extraInvIds.length > 0) {
        const { data: reverseBills } = await supabaseAdmin.from("escort_billings").select("id, invoice_id, service_order_id, client_name, data_missao").in("invoice_id", extraInvIds).limit(2e4);
        for (const b of reverseBills || []) {
          if (!b.invoice_id) continue;
          const arr = reverseBillingsByInvoice.get(b.invoice_id) || [];
          arr.push(b);
          reverseBillingsByInvoice.set(b.invoice_id, arr);
        }
        const newSoIds = Array.from(new Set(
          (reverseBills || []).map((b) => b.service_order_id).filter((id) => id && !osNumMap.has(id))
        ));
        if (newSoIds.length > 0) {
          const { data: newSos } = await supabaseAdmin.from("service_orders").select("id, os_number").in("id", newSoIds);
          for (const so of newSos || []) osNumMap.set(so.id, so.os_number);
        }
      }
      const seenExtra = /* @__PURE__ */ new Set();
      for (const inv of extraInvoices) {
        if (!invoiceIsTorres(inv)) continue;
        if (fatGroups.has(inv.id)) continue;
        if (seenExtra.has(inv.id)) continue;
        seenExtra.add(inv.id);
        let linkedBills = reverseBillingsByInvoice.get(inv.id) || [];
        let osListExtra = Array.from(new Map(
          linkedBills.filter((b) => b.service_order_id).map((b) => [b.service_order_id, { id: b.service_order_id, osNumber: osNumMap.get(b.service_order_id) || `OS-${b.service_order_id}` }])
        ).values());
        const cli = clientMap.get(inv.client_id);
        const ns = normalizeInvoiceStatus(inv, { emiteNf: cli?.emiteNf });
        let noLinkReason = null;
        if (osListExtra.length === 0) {
          const result = await autoLinkOrphanBillingsForInvoice(inv);
          if (result.linked > 0) {
            const { data: justLinked } = await supabaseAdmin.from("escort_billings").select("id, invoice_id, service_order_id, client_name, data_missao").eq("invoice_id", inv.id).limit(500);
            const newSoIds = (justLinked || []).map((b) => b.service_order_id).filter((id) => id && !osNumMap.has(id));
            if (newSoIds.length > 0) {
              const { data: newSos } = await supabaseAdmin.from("service_orders").select("id, os_number").in("id", Array.from(new Set(newSoIds)));
              for (const so of newSos || []) osNumMap.set(so.id, so.os_number);
            }
            linkedBills = justLinked || [];
            osListExtra = Array.from(new Map(
              linkedBills.filter((b) => b.service_order_id).map((b) => [b.service_order_id, { id: b.service_order_id, osNumber: osNumMap.get(b.service_order_id) || `OS-${b.service_order_id}` }])
            ).values());
          } else {
            noLinkReason = result.reason || "Sem informa\xE7\xE3o";
          }
        }
        rows.push({
          id: `INV-${inv.id}`,
          source: "INVOICE",
          sourceId: inv.id,
          clientId: inv.client_id,
          clientName: cli?.name || inv.client_name,
          clientFantasia: cli?.fantasia || null,
          clientCpfCnpj: cli?.cpfCnpj || inv.client_cpf_cnpj,
          clientEmail: cli?.email || null,
          description: inv.description,
          value: Number(inv.value || 0),
          netValue: inv.net_value != null ? Number(inv.net_value) : null,
          dueDate: inv.due_date,
          paymentDate: inv.payment_date,
          createdAt: inv.created_at,
          updatedAt: inv.updated_at,
          asaasPaymentId: inv.asaas_payment_id,
          invoiceUrl: inv.invoice_url,
          nfseUrl: inv.nfse_url,
          nfseNumber: inv.nfse_number && !String(inv.nfse_number).startsWith("inv_") ? inv.nfse_number : null,
          osCount: osListExtra.length,
          osList: osListExtra,
          noLinkReason,
          rawStatus: inv.status,
          rawNfseStatus: inv.nfse_status,
          nfseErrorMessage: inv.nfse_error_message || null,
          rawBoletimStatus: null,
          normalizedStatus: ns,
          invoiceId: inv.id,
          approvalToken: null,
          approvalUrl: null,
          reminderCount: inv.reminder_count || 0,
          lastReminderSentAt: inv.last_reminder_sent_at || null
        });
      }
      const STATUSES = ["AGUARDANDO_BOLETIM", "PENDENTE_APROVACAO", "AUTORIZADO", "AGUARDANDO_PAGAMENTO", "NF_PROCESSANDO", "NF_EMITIDA", "NF_ERRO", "NF_CANCELADA", "PAGO", "VENCIDO", "OUTRO"];
      const totals = {};
      for (const st of STATUSES) {
        const subset = rows.filter((r) => r.normalizedStatus === st);
        totals[st] = { count: subset.length, value: subset.reduce((s, r) => s + Number(r.value || 0), 0) };
      }
      const validRows = rows.filter((r) => r.normalizedStatus !== "NF_CANCELADA");
      totals.total = { count: validRows.length, value: validRows.reduce((s, r) => s + Number(r.value || 0), 0) };
      rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      res.json({
        rows,
        totals,
        lastSync: nfReconcileState,
        period: { from, to }
      });
    } catch (err) {
      console.error("[relatorio-nf] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/asaas/reconcile-all", requireAdminRole, async (req, res) => {
    try {
      const force = req.body?.force === true;
      const limit = Number(req.body?.limit) || 80;
      reconcileAllInvoicesAsaas({ force, limit }).catch((e) => console.log("[reconcile-all] bg error:", e?.message));
      res.json({ started: true, state: nfReconcileState });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.get("/api/asaas/reconcile-status", requireAdminRole, async (_req, res) => {
    res.json(nfReconcileState);
  });
  app.post("/api/relatorio-nf/delete-row", requireAdminRole, async (req, res) => {
    try {
      const user = req.user;
      if (user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode excluir registros." });
      }
      const source = String(req.body?.source || "").toUpperCase();
      const rawId = req.body?.sourceId;
      const reason = String(req.body?.reason || "").slice(0, 500);
      if (rawId === void 0 || rawId === null || rawId === "" || !["BOLETIM", "INVOICE", "BILLING_AVULSO"].includes(source)) {
        return res.status(400).json({ message: "source (BOLETIM|INVOICE|BILLING_AVULSO) e sourceId obrigat\xF3rios" });
      }
      if (source === "BILLING_AVULSO") {
        const sourceId2 = String(rawId);
        const { data: bil } = await supabaseAdmin.from("billings").select("*").eq("id", sourceId2).maybeSingle();
        if (!bil) return res.status(404).json({ message: "Billing n\xE3o encontrada" });
        if (bil.invoice_id) return res.status(400).json({ message: "Billing j\xE1 est\xE1 vinculada a uma fatura. Exclua a fatura primeiro." });
        if (bil.boletim_id) return res.status(400).json({ message: "Billing est\xE1 vinculada a um boletim. Exclua o boletim primeiro." });
        const { error: error2 } = await supabaseAdmin.from("billings").delete().eq("id", sourceId2);
        if (error2) throw error2;
        console.log(`[relatorio-nf] Billing avulsa ${sourceId2} (${bil.client_name}, R$${billingValor(bil)}) EXCLU\xCDDA por ${user.email}. Motivo: ${reason || "\u2014"}`);
        return res.json({ success: true, removed: { source, sourceId: sourceId2, clientName: bil.client_name, value: billingValor(bil) } });
      }
      if (source === "BOLETIM") {
        const sourceId2 = String(rawId);
        const { data: ap } = await supabaseAdmin.from("boletim_approvals").select("*").eq("id", sourceId2).maybeSingle();
        if (!ap) return res.status(404).json({ message: "Boletim n\xE3o encontrado" });
        const { error: error2 } = await supabaseAdmin.from("boletim_approvals").delete().eq("id", sourceId2);
        if (error2) throw error2;
        console.log(`[relatorio-nf] Boletim ${sourceId2} (${ap.client_name}, R$${ap.total_value}) EXCLU\xCDDO por ${user.email}. Motivo: ${reason || "\u2014"}`);
        return res.json({ success: true, removed: { source, sourceId: sourceId2, clientName: ap.client_name, value: Number(ap.total_value || 0) } });
      }
      const sourceId = Number(rawId);
      if (!sourceId) return res.status(400).json({ message: "sourceId inv\xE1lido para INVOICE" });
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", sourceId).maybeSingle();
      if (!invoice) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      if (invoice.asaas_payment_id && process.env.ASAAS_API_KEY) {
        try {
          await asaasRequest("DELETE", `/payments/${invoice.asaas_payment_id}`);
        } catch (e) {
          console.log("[asaas] delete payment err:", e.message);
        }
      }
      try {
        await supabaseAdmin.from("billings").update({ invoice_id: null }).eq("invoice_id", sourceId);
      } catch {
      }
      try {
        await supabaseAdmin.from("escort_billings").update({ invoice_id: null }).eq("invoice_id", sourceId);
      } catch {
      }
      const { error } = await supabaseAdmin.from("invoices").delete().eq("id", sourceId);
      if (error) throw error;
      console.log(`[relatorio-nf] Invoice ${sourceId} (cliente=${invoice.client_id}, R$${invoice.value}) EXCLU\xCDDA por ${user.email}. Motivo: ${reason || "\u2014"}`);
      return res.json({ success: true, removed: { source, sourceId, value: Number(invoice.value || 0) } });
    } catch (err) {
      console.error("[relatorio-nf delete-row] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/relatorio-nf/mark-emitted", requireAdminRole, async (req, res) => {
    try {
      const user = req.user;
      if (user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode marcar NF como emitida." });
      }
      const invoiceId = Number(req.body?.invoiceId);
      const nfNumber = String(req.body?.nfNumber || "").trim().slice(0, 60) || null;
      const note = String(req.body?.note || "").slice(0, 500);
      if (!invoiceId) return res.status(400).json({ message: "invoiceId obrigat\xF3rio" });
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
      if (!invoice) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      const updates = {
        nfse_status: "AUTHORIZED",
        nfse_observations: `[Marcada manualmente como emitida por ${user.email} em ${(/* @__PURE__ */ new Date()).toISOString()}]${note ? ` ${note}` : ""}${invoice.nfse_observations ? ` | ${invoice.nfse_observations}` : ""}`.slice(0, 1e3)
      };
      if (nfNumber) updates.nfse_number = nfNumber;
      if (!invoice.nfse_authorized_at) updates.nfse_authorized_at = (/* @__PURE__ */ new Date()).toISOString();
      const { error } = await supabaseAdmin.from("invoices").update(updates).eq("id", invoiceId);
      if (error) throw error;
      console.log(`[relatorio-nf] Invoice ${invoiceId} marcada como NF EMITIDA por ${user.email}. NF=${nfNumber || "\u2014"}`);
      res.json({ success: true });
    } catch (err) {
      console.error("[relatorio-nf mark-emitted] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/invoices/:id/receive-in-cash", requireAdminRole, async (req, res) => {
    try {
      const user = req.user;
      const invoiceId = Number(req.params.id);
      const paymentDate = String(req.body?.paymentDate || "").trim();
      const value = Number(req.body?.value || 0);
      const notes = String(req.body?.notes || "").slice(0, 500);
      const method = String(req.body?.method || "PIX").toUpperCase();
      if (!invoiceId) return res.status(400).json({ message: "invoiceId obrigat\xF3rio" });
      if (!paymentDate || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
        return res.status(400).json({ message: "paymentDate (YYYY-MM-DD) obrigat\xF3rio" });
      }
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
      if (!invoice) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      const finalValue = value > 0 ? value : Number(invoice.value || 0);
      if (isAlreadyPaidStatus(invoice.status)) {
        console.log(`[receive-in-cash] invoice #${invoiceId} j\xE1 em status pago (${invoice.status}) \u2014 no-op idempotente.`);
        return res.json({ success: true, alreadyPaid: true, status: invoice.status });
      }
      let asaasOk = false;
      let asaasMsg = "";
      let relinkedPaymentId = null;
      let relinkedNetValue = null;
      let relinkedPaymentDate = null;
      if (invoice.asaas_payment_id && process.env.ASAAS_API_KEY) {
        try {
          await asaasRequest("POST", `/payments/${invoice.asaas_payment_id}/receiveInCash`, {
            paymentDate,
            value: finalValue,
            notifyCustomer: false
          });
          asaasOk = true;
        } catch (e) {
          asaasMsg = e?.message || String(e);
          console.log(`[receive-in-cash] Asaas falhou p/ invoice #${invoiceId}: ${asaasMsg}`);
          const looksRemoved = /cobran[cç]a\s+remov/i.test(asaasMsg) || /deletad[ao]/i.test(asaasMsg);
          if (looksRemoved) {
            try {
              const original = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}`);
              const customerId = original?.customer;
              const targetValue = Number(invoice.value || finalValue);
              const invoiceDueMs = invoice.due_date ? new Date(invoice.due_date).getTime() : NaN;
              if (customerId) {
                const search = await asaasRequest("GET", `/payments?customer=${encodeURIComponent(customerId)}&limit=100`);
                const paidStatuses = /* @__PURE__ */ new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
                const candidates = (search?.data || []).filter((p) => {
                  if (!p?.id) return false;
                  if (p.id === invoice.asaas_payment_id) return false;
                  if (!paidStatuses.has(String(p.status || "").toUpperCase())) return false;
                  if (Math.abs(Number(p.value || 0) - targetValue) > 0.01) return false;
                  if (!Number.isFinite(invoiceDueMs)) return false;
                  const ref = p.paymentDate || p.dueDate;
                  if (!ref) return false;
                  const diffDays = Math.abs(new Date(ref).getTime() - invoiceDueMs) / 864e5;
                  if (diffDays > 45) return false;
                  return true;
                });
                const free = [];
                for (const c of candidates) {
                  const { data: linked } = await supabaseAdmin.from("invoices").select("id").eq("asaas_payment_id", c.id).limit(1);
                  if (!linked || linked.length === 0) free.push(c);
                }
                if (free.length === 1) {
                  const paid = free[0];
                  relinkedPaymentId = paid.id;
                  relinkedNetValue = paid.netValue ? Number(paid.netValue) : null;
                  relinkedPaymentDate = paid.paymentDate || null;
                  asaasOk = true;
                  asaasMsg = `cobran\xE7a removida \u2014 re-vinculado automaticamente \xE0 cobran\xE7a paga g\xEAmea ${paid.id} (RECEIVED em ${paid.paymentDate})`;
                  console.log(`[receive-in-cash] auto-relink invoice #${invoiceId}: ${invoice.asaas_payment_id} (removida) \u2192 ${paid.id} (${paid.status}, R$${paid.value}, pago em ${paid.paymentDate})`);
                } else if (free.length > 1) {
                  asaasMsg = `${asaasMsg} \u2014 ${free.length} cobran\xE7as pagas candidatas (precisa decis\xE3o manual): ${free.map((c) => c.id).join(", ")}`;
                }
              }
            } catch (e2) {
              console.log(`[receive-in-cash] busca cobran\xE7a paga g\xEAmea falhou p/ invoice #${invoiceId}: ${e2.message}`);
            }
          }
        }
      }
      const noteHistory = `[Baixa manual ${method} por ${user.email} em ${(/* @__PURE__ */ new Date()).toISOString()} \u2014 pago em ${paymentDate}, R$${finalValue.toFixed(2)}${notes ? ` \u2014 ${notes}` : ""}${asaasOk ? " \u2014 sync Asaas OK" : asaasMsg ? ` \u2014 Asaas: ${asaasMsg}` : ""}]`;
      const dbUpdate = {
        status: relinkedPaymentId ? "RECEIVED" : "RECEIVED_IN_CASH",
        payment_date: relinkedPaymentDate || paymentDate,
        net_value: relinkedNetValue ?? finalValue,
        nfse_observations: `${noteHistory}${invoice.nfse_observations ? ` | ${invoice.nfse_observations}` : ""}`.slice(0, 2e3),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (relinkedPaymentId) dbUpdate.asaas_payment_id = relinkedPaymentId;
      const { error } = await supabaseAdmin.from("invoices").update(dbUpdate).eq("id", invoiceId);
      if (error) throw error;
      console.log(`[receive-in-cash] Invoice #${invoiceId} (${method}) baixada por ${user.email} \u2014 R$${finalValue} em ${paymentDate}. AsaasSync=${asaasOk}`);
      res.json({ success: true, asaasSynced: asaasOk, asaasMessage: asaasMsg || null });
    } catch (err) {
      console.error("[receive-in-cash] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.get("/api/invoices/:id/rastreio", requireAdminRole, async (req, res) => {
    try {
      const invoiceId = Number(req.params.id);
      if (!invoiceId) return res.status(400).json({ message: "invoiceId obrigat\xF3rio" });
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
      if (!invoice) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      const toMs = (raw) => {
        if (!raw) return 0;
        let s = String(raw).trim();
        if (!s) return 0;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T12:00:00-03:00`;
        else if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(s)) s = `${s}-03:00`;
        const ms = new Date(s).getTime();
        return Number.isFinite(ms) ? ms : 0;
      };
      const events = [];
      let creatorName = null;
      if (invoice.created_by) {
        const { data: u } = await supabaseAdmin.from("users").select("name, email").eq("id", invoice.created_by).maybeSingle();
        creatorName = u?.name || u?.email || null;
      }
      events.push({
        ts: toMs(invoice.created_at),
        at: invoice.created_at || null,
        kind: "criada",
        who: creatorName,
        title: "Fatura criada",
        detail: `Valor ${Number(invoice.value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} \xB7 venc. ${invoice.due_date || "\u2014"} \xB7 ${invoice.gateway === "inter" ? "Banco Inter" : "Asaas"}`,
        value: Number(invoice.value || 0) || null
      });
      const { data: audits } = await supabaseAdmin.from("system_audit_logs").select("user_name, user_role, action, details, ip_address, created_at").eq("target_type", "invoice").eq("target_id", String(invoiceId)).order("created_at", { ascending: true });
      for (const a of audits || []) {
        let detail = null;
        try {
          const d = typeof a.details === "string" ? a.details : JSON.stringify(a.details);
          detail = d && d !== "null" && d !== "{}" ? d : null;
        } catch {
          detail = null;
        }
        events.push({
          ts: toMs(a.created_at),
          at: a.created_at || null,
          kind: "auditoria",
          who: a.user_name || null,
          title: String(a.action || "A\xE7\xE3o").replace(/_/g, " "),
          detail: [detail, a.ip_address ? `IP ${a.ip_address}` : null].filter(Boolean).join(" \xB7 ") || null,
          value: null
        });
      }
      if (invoice.nfse_observations) {
        const chunks = String(invoice.nfse_observations).split(" | ");
        for (const c of chunks) {
          const inner = c.replace(/^\[/, "").replace(/\]$/, "").trim();
          if (!inner) continue;
          const whoM = inner.match(/ por (.+?) em /);
          const tsM = inner.match(/ em (\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/);
          const valM = inner.match(/R\$\s?([\d.]+)/);
          const isBaixa = /^Baixa manual/i.test(inner);
          const isVenc = /^Vencimento alterado/i.test(inner);
          const methodM = inner.match(/^Baixa manual (\w+)/i);
          events.push({
            ts: toMs(tsM?.[1]),
            at: tsM?.[1] || null,
            kind: isBaixa ? "baixa" : isVenc ? "vencimento" : "nota",
            who: whoM?.[1]?.trim() || null,
            title: isBaixa ? `Baixa manual${methodM ? ` em ${methodM[1].toUpperCase()}` : ""}` : isVenc ? "Vencimento alterado" : "Anota\xE7\xE3o",
            detail: inner,
            value: valM ? Number(valM[1]) || null : null
          });
        }
      }
      const { data: extrato } = await supabaseAdmin.from("inter_extrato_lancamentos").select("data_entrada, tipo_transacao, tipo_operacao, valor, titulo, descricao, reconciled_at").eq("invoice_id", invoiceId).order("data_entrada", { ascending: true });
      for (const e of extrato || []) {
        const credito = String(e.tipo_operacao || "").toUpperCase() === "C";
        events.push({
          ts: toMs(e.reconciled_at) || toMs(e.data_entrada),
          at: e.data_entrada || null,
          kind: "banco",
          who: "Banco Inter",
          title: credito ? "Dinheiro recebido na conta" : "D\xE9bito na conta",
          detail: [e.tipo_transacao, e.titulo, e.descricao].filter(Boolean).join(" \xB7 ") || null,
          value: Number(e.valor || 0) || null
        });
      }
      const { data: fts } = await supabaseAdmin.from("financial_transactions").select("type, amount, description, category, created_at").eq("origin_type", "invoice").eq("origin_id", String(invoiceId)).order("created_at", { ascending: true });
      for (const f of fts || []) {
        events.push({
          ts: toMs(f.created_at),
          at: f.created_at || null,
          kind: "financeiro",
          who: null,
          title: String(f.type || "").toUpperCase() === "INCOME" ? "Receita registrada no caixa" : "Lan\xE7amento financeiro",
          detail: [f.description, f.category].filter(Boolean).join(" \xB7 ") || null,
          value: Number(f.amount || 0) || null
        });
      }
      events.sort((a, b) => a.ts - b.ts);
      res.json({
        invoice: {
          id: invoice.id,
          client_name: invoice.client_name,
          value: invoice.value,
          net_value: invoice.net_value,
          status: invoice.status,
          payment_date: invoice.payment_date,
          due_date: invoice.due_date,
          gateway: invoice.gateway,
          asaas_payment_id: invoice.asaas_payment_id,
          inter_codigo_solicitacao: invoice.inter_codigo_solicitacao,
          service_order_id: invoice.service_order_id
        },
        events
      });
    } catch (err) {
      console.error("[invoice-rastreio] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/invoices/:id/change-due-date", requireAdminRole, async (req, res) => {
    try {
      const user = req.user;
      if (user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode alterar o vencimento de faturas." });
      }
      const invoiceId = Number(req.params.id);
      const newDueDate = String(req.body?.dueDate || "").trim();
      const reason = String(req.body?.reason || "").trim();
      if (!invoiceId) return res.status(400).json({ message: "invoiceId obrigat\xF3rio" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDueDate)) {
        return res.status(400).json({ message: "dueDate (YYYY-MM-DD) obrigat\xF3rio" });
      }
      const parsed = /* @__PURE__ */ new Date(newDueDate + "T12:00:00");
      if (Number.isNaN(parsed.getTime()) || newDueDate.slice(0, 10) !== parsed.toISOString().slice(0, 10)) {
        return res.status(400).json({ message: "dueDate inv\xE1lida (data inexistente no calend\xE1rio)" });
      }
      if (reason.length < 5) {
        return res.status(400).json({ message: "Motivo obrigat\xF3rio (m\xEDn. 5 caracteres)" });
      }
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
      if (!invoice) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      if (isAlreadyPaidStatus(invoice.status)) {
        return res.status(409).json({ message: `Fatura j\xE1 est\xE1 paga (${invoice.status}) \u2014 vencimento n\xE3o pode ser alterado.` });
      }
      const blockedStatuses = /* @__PURE__ */ new Set(["CANCELLED", "CANCELADA", "CANCELADO", "REFUNDED", "REFUND_REQUESTED"]);
      if (blockedStatuses.has(String(invoice.status || "").toUpperCase())) {
        return res.status(409).json({ message: `Fatura est\xE1 ${invoice.status} \u2014 vencimento n\xE3o pode ser alterado.` });
      }
      const oldDueDate = invoice.due_date ? String(invoice.due_date).slice(0, 10) : "(sem data)";
      if (oldDueDate === newDueDate) {
        return res.status(400).json({ message: "Vencimento informado \xE9 igual ao atual." });
      }
      let asaasOk = false;
      let asaasMsg = "";
      if (invoice.asaas_payment_id && process.env.ASAAS_API_KEY) {
        try {
          await asaasRequest("POST", `/payments/${invoice.asaas_payment_id}`, { dueDate: newDueDate });
          asaasOk = true;
        } catch (e) {
          asaasMsg = e?.message || String(e);
          console.log(`[change-due-date] Asaas falhou p/ invoice #${invoiceId}: ${asaasMsg}`);
        }
      }
      const noteHistory = `[Vencimento alterado por ${user.email} em ${(/* @__PURE__ */ new Date()).toISOString()}: ${oldDueDate} \u2192 ${newDueDate} \u2014 Motivo: ${reason}${asaasOk ? " \u2014 sync Asaas OK" : invoice.asaas_payment_id ? ` \u2014 Asaas FALHOU: ${asaasMsg}` : ""}]`;
      const { error } = await supabaseAdmin.from("invoices").update({
        due_date: newDueDate,
        nfse_observations: `${noteHistory}${invoice.nfse_observations ? ` | ${invoice.nfse_observations}` : ""}`.slice(0, 2e3),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("id", invoiceId);
      if (error) throw error;
      try {
        await logSystemAudit({
          user_id: user?.id || null,
          user_email: user?.email || null,
          action: "invoice_due_date_changed",
          target_type: "invoice",
          target_id: String(invoiceId),
          details: { old_due_date: oldDueDate, new_due_date: newDueDate, reason, asaas_synced: asaasOk, asaas_message: asaasMsg || null }
        });
      } catch (e) {
        console.log(`[change-due-date] audit falhou: ${e?.message}`);
      }
      console.log(`[change-due-date] Invoice #${invoiceId}: ${oldDueDate} \u2192 ${newDueDate} por ${user.email}. AsaasSync=${asaasOk}. Motivo: ${reason}`);
      res.json({ success: true, oldDueDate, newDueDate, asaasSynced: asaasOk, asaasMessage: asaasMsg || null });
    } catch (err) {
      console.error("[change-due-date] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.get("/api/relatorio-nf/orphan-invoices", requireAdminRole, async (req, res) => {
    try {
      const { data: invs } = await supabaseAdmin.from("invoices").select("id, client_id, client_name, value, description, status, due_date, created_at, asaas_payment_id, nfse_number, invoice_url").is("asaas_payment_id", null).order("id", { ascending: false }).limit(500);
      const orphans = (invs || []).filter((i) => {
        const st = String(i.status || "").toUpperCase();
        if (st === "RECEIVED_IN_CASH") return false;
        return true;
      });
      const total = orphans.reduce((s, i) => s + Number(i.value || 0), 0);
      res.json({ count: orphans.length, totalValue: total, invoices: orphans });
    } catch (err) {
      console.error("[orphan-invoices] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/relatorio-nf/cleanup-orphans", requireAdminRole, async (req, res) => {
    try {
      const user = req.user;
      if (user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode limpar registros \xF3rf\xE3os." });
      }
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => Number(x)).filter((x) => Number.isFinite(x)) : [];
      if (ids.length === 0) return res.status(400).json({ message: "ids obrigat\xF3rios" });
      const { data: toDelete } = await supabaseAdmin.from("invoices").select("id, asaas_payment_id, status, value, client_name").in("id", ids);
      const safeIds = [];
      for (const inv of toDelete || []) {
        if (inv.asaas_payment_id) continue;
        const st = String(inv.status || "").toUpperCase();
        if (st === "RECEIVED_IN_CASH") continue;
        safeIds.push(inv.id);
      }
      if (safeIds.length === 0) return res.json({ deleted: 0, skipped: ids.length });
      await supabaseAdmin.from("escort_billings").update({ invoice_id: null }).in("invoice_id", safeIds);
      const { error } = await supabaseAdmin.from("invoices").delete().in("id", safeIds);
      if (error) throw error;
      console.log(`[cleanup-orphans] ${safeIds.length} invoice(s) \xF3rf\xE3(s) deletada(s) por ${user.email}: [${safeIds.join(", ")}]`);
      res.json({ deleted: safeIds.length, skipped: ids.length - safeIds.length, deletedIds: safeIds });
    } catch (err) {
      console.error("[cleanup-orphans] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.get("/api/relatorio-nf/suggest-os-link/:invoiceId", requireAdminRole, async (req, res) => {
    try {
      const invoiceId = Number(req.params.invoiceId);
      if (!Number.isFinite(invoiceId)) return res.status(400).json({ message: "invoiceId inv\xE1lido" });
      const { data: inv } = await supabaseAdmin.from("invoices").select("id, client_id, client_name, value, due_date, description, created_at").eq("id", invoiceId).single();
      if (!inv) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      const { data: orphans } = await supabaseAdmin.from("escort_billings").select("id, client_id, client_name, data_missao, fat_total, fat_acionamento, fat_hora_extra, fat_km, despesas_pedagio, receitas_os, valor_franquia, valor_km_extra, status, service_order_id, invoice_id").eq("client_id", inv.client_id).is("invoice_id", null).neq("status", "CANCELADO").neq("status", "REJEITADA").order("data_missao", { ascending: false }).limit(500);
      const valorOf = (b) => {
        const v = Number(b.fat_total || 0);
        if (v > 0) return v;
        return Number(b.fat_acionamento || b.valor_franquia || 0) + Number(b.fat_hora_extra || 0) + Number(b.fat_km || b.valor_km_extra || 0) + Number(b.despesas_pedagio || 0) + Number(b.receitas_os || 0);
      };
      const soIds = Array.from(new Set((orphans || []).map((b) => b.service_order_id).filter(Boolean)));
      const osNumMap = /* @__PURE__ */ new Map();
      if (soIds.length > 0) {
        const { data: sos } = await supabaseAdmin.from("service_orders").select("id, os_number").in("id", soIds);
        for (const so of sos || []) osNumMap.set(so.id, so.os_number);
      }
      const periodMatch = String(inv.description || "").match(/(\d{2}\/\d{2}\/\d{4})\s*(?:a|até|-)\s*(\d{2}\/\d{2}\/\d{4})/i);
      let periodStart = null;
      let periodEnd = null;
      if (periodMatch) {
        const [d1, m1, y1] = periodMatch[1].split("/");
        const [d2, m2, y2] = periodMatch[2].split("/");
        periodStart = `${y1}-${m1}-${d1}`;
        periodEnd = `${y2}-${m2}-${d2}`;
      }
      const candidates = (orphans || []).map((b) => {
        const valor = valorOf(b);
        const inPeriod = periodStart && periodEnd && b.data_missao && b.data_missao >= periodStart && b.data_missao <= periodEnd;
        let score = 0;
        if (inPeriod) score += 100;
        if (b.service_order_id) score += 20;
        return {
          id: b.id,
          serviceOrderId: b.service_order_id,
          osNumber: b.service_order_id ? osNumMap.get(b.service_order_id) || `OS#${b.service_order_id}` : null,
          dataMissao: b.data_missao,
          valor,
          status: b.status,
          inPeriod: !!inPeriod,
          score
        };
      }).sort((a, b) => b.score - a.score || (b.dataMissao || "").localeCompare(a.dataMissao || ""));
      const target = Number(inv.value || 0);
      const inPeriodOnes = candidates.filter((c) => c.inPeriod);
      const sumInPeriod = inPeriodOnes.reduce((s, c) => s + c.valor, 0);
      const matchByPeriod = target > 0 && Math.abs(sumInPeriod - target) / target < 0.05;
      res.json({
        invoice: { id: inv.id, clientId: inv.client_id, clientName: inv.client_name, value: target, dueDate: inv.due_date, description: inv.description },
        period: periodStart && periodEnd ? { start: periodStart, end: periodEnd } : null,
        candidates,
        autoSuggest: {
          matchByPeriod,
          suggestedIds: matchByPeriod ? inPeriodOnes.map((c) => c.id) : [],
          sumInPeriod,
          targetValue: target
        }
      });
    } catch (err) {
      console.error("[suggest-os-link] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/relatorio-nf/link-os", requireAdminRole, async (req, res) => {
    try {
      const user = req.user;
      const invoiceId = Number(req.body?.invoiceId);
      const billingIds = Array.isArray(req.body?.billingIds) ? req.body.billingIds.map((x) => Number(x)).filter((x) => Number.isFinite(x)) : [];
      if (!Number.isFinite(invoiceId) || billingIds.length === 0) {
        return res.status(400).json({ message: "invoiceId e billingIds obrigat\xF3rios" });
      }
      const { data: inv } = await supabaseAdmin.from("invoices").select("id, client_id, client_name").eq("id", invoiceId).single();
      if (!inv) return res.status(404).json({ message: "Fatura n\xE3o encontrada" });
      const { data: bills } = await supabaseAdmin.from("escort_billings").select("id, client_id, invoice_id, status").in("id", billingIds);
      const safeIds = [];
      for (const b of bills || []) {
        if (b.client_id !== inv.client_id) continue;
        if (b.invoice_id) continue;
        safeIds.push(b.id);
      }
      if (safeIds.length === 0) return res.json({ linked: 0, skipped: billingIds.length });
      const { error } = await supabaseAdmin.from("escort_billings").update({ invoice_id: invoiceId, status: "FATURADO" }).in("id", safeIds);
      if (error) throw error;
      bustBalancoCaches();
      console.log(`[link-os] ${safeIds.length} billing(s) vinculada(s) \xE0 invoice ${invoiceId} (${inv.client_name}) por ${user?.email}: [${safeIds.join(", ")}]`);
      res.json({ linked: safeIds.length, skipped: billingIds.length - safeIds.length, linkedIds: safeIds });
    } catch (err) {
      console.error("[link-os] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/relatorio-nf/auto-link-bulk", requireAdminRole, async (req, res) => {
    try {
      const user = req.user;
      let invoiceIds = Array.isArray(req.body?.invoiceIds) ? req.body.invoiceIds.map((x) => Number(x)).filter((x) => Number.isFinite(x)) : [];
      if (invoiceIds.length === 0) {
        const { data: allInvs } = await supabaseAdmin.from("invoices").select("id, client_id, value").limit(5e3);
        const ids = (allInvs || []).map((i) => i.id);
        if (ids.length > 0) {
          const { data: linkedBills } = await supabaseAdmin.from("escort_billings").select("invoice_id").in("invoice_id", ids).limit(5e4);
          const withLink = new Set((linkedBills || []).map((b) => b.invoice_id));
          invoiceIds = (allInvs || []).filter((i) => i.client_id && Number(i.value || 0) > 0 && !withLink.has(i.id)).map((i) => i.id);
        }
      }
      if (invoiceIds.length === 0) {
        return res.json({ processed: 0, linked: 0, perInvoice: [], message: "Nenhuma fatura \xF3rf\xE3 encontrada." });
      }
      const valorOf = (b) => {
        const v = Number(b.fat_total || 0);
        if (v > 0) return v;
        return Number(b.fat_acionamento || b.valor_franquia || 0) + Number(b.fat_hora_extra || 0) + Number(b.fat_km || b.valor_km_extra || 0) + Number(b.despesas_pedagio || 0) + Number(b.receitas_os || 0);
      };
      const results = [];
      let totalLinked = 0;
      const { data: invs } = await supabaseAdmin.from("invoices").select("id, client_id, client_name, value, description").in("id", invoiceIds);
      for (const inv of invs || []) {
        const target = Number(inv.value || 0);
        if (!inv.client_id || target <= 0) {
          results.push({ invoiceId: inv.id, clientName: inv.client_name, value: target, linked: 0, reason: "sem cliente ou valor zerado" });
          continue;
        }
        const m = String(inv.description || "").match(/(\d{2}\/\d{2}\/\d{4})\s*(?:a|até|-)\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (!m) {
          results.push({ invoiceId: inv.id, clientName: inv.client_name, value: target, linked: 0, reason: "sem per\xEDodo na descri\xE7\xE3o" });
          continue;
        }
        const [d1, m1, y1] = m[1].split("/");
        const [d2, m2, y2] = m[2].split("/");
        const periodStart = `${y1}-${m1}-${d1}`;
        const periodEnd = `${y2}-${m2}-${d2}`;
        const { data: orphans } = await supabaseAdmin.from("escort_billings").select("id, client_id, data_missao, fat_total, fat_acionamento, fat_hora_extra, fat_km, despesas_pedagio, receitas_os, valor_franquia, valor_km_extra, status").eq("client_id", inv.client_id).is("invoice_id", null).neq("status", "CANCELADO").neq("status", "REJEITADA").gte("data_missao", periodStart).lte("data_missao", periodEnd).limit(500);
        const inPeriod = orphans || [];
        const sum = inPeriod.reduce((s, b) => s + valorOf(b), 0);
        const matches = target > 0 && Math.abs(sum - target) / target < 0.05;
        if (!matches || inPeriod.length === 0) {
          results.push({
            invoiceId: inv.id,
            clientName: inv.client_name,
            value: target,
            linked: 0,
            reason: inPeriod.length === 0 ? "nenhuma OS \xF3rf\xE3 no per\xEDodo" : `soma R$${sum.toFixed(2)} \u2260 alvo R$${target.toFixed(2)}`
          });
          continue;
        }
        const ids = inPeriod.map((b) => b.id);
        const { error } = await supabaseAdmin.from("escort_billings").update({ invoice_id: inv.id, status: "FATURADO" }).in("id", ids);
        if (error) {
          results.push({ invoiceId: inv.id, clientName: inv.client_name, value: target, linked: 0, reason: error.message });
          continue;
        }
        bustBalancoCaches();
        totalLinked += ids.length;
        results.push({ invoiceId: inv.id, clientName: inv.client_name, value: target, linked: ids.length });
      }
      await logSystemAudit({
        userId: user?.id,
        userName: user?.name,
        userRole: user?.role,
        action: "RELATORIO_NF_AUTOLINK_BULK",
        targetId: invoiceIds.join(","),
        targetType: "invoice",
        details: `Auto-v\xEDnculo em lote: ${invoiceIds.length} fatura(s) processada(s), ${totalLinked} OS vinculadas. Sucessos: ${results.filter((r) => r.linked > 0).length}/${invoiceIds.length}.`,
        ipAddress: req.ip
      });
      console.log(`[auto-link-bulk] ${invoiceIds.length} fatura(s) processada(s) por ${user?.email}: ${totalLinked} OS vinculada(s)`);
      res.json({
        processed: invoiceIds.length,
        linked: totalLinked,
        successful: results.filter((r) => r.linked > 0).length,
        perInvoice: results,
        message: `${totalLinked} OS vinculadas em ${results.filter((r) => r.linked > 0).length} de ${invoiceIds.length} faturas processadas.`
      });
    } catch (err) {
      console.error("[auto-link-bulk] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.get("/api/auditoria-faturamento", requireAdminRole, async (req, res) => {
    try {
      const today = (/* @__PURE__ */ new Date()).toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 10);
      const defaultFrom = today.slice(0, 8) + "01";
      const fromDate = String(req.query.from || defaultFrom);
      const toDate = String(req.query.to || today);
      const onlyClient = req.query.clientId ? Number(req.query.clientId) : null;
      const lastDayOfMonth = (ym) => {
        const [y, m] = ym.split("-").map(Number);
        return new Date(y, m, 0).getDate();
      };
      const quinzenaInfo = (dateStr) => {
        const [y, m, d] = dateStr.split("-").map(Number);
        const ym = `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}`;
        if (d <= 15) {
          return {
            q: 1,
            start: `${ym}-01`,
            end: `${ym}-15`,
            // Convenção: deve ser faturado até o dia 17 do mesmo mês
            dueBy: `${ym}-17`
          };
        }
        const last = lastDayOfMonth(ym).toString().padStart(2, "0");
        let nyy = y, nmm = m + 1;
        if (nmm > 12) {
          nmm = 1;
          nyy += 1;
        }
        const nextMonth = `${nyy.toString().padStart(4, "0")}-${nmm.toString().padStart(2, "0")}`;
        return {
          q: 2,
          start: `${ym}-16`,
          end: `${ym}-${last}`,
          dueBy: `${nextMonth}-02`
        };
      };
      const mensalInfo = (dateStr) => {
        const [y, m] = dateStr.split("-").map(Number);
        const ym = `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}`;
        const last = lastDayOfMonth(ym).toString().padStart(2, "0");
        let nyy = y, nmm = m + 1;
        if (nmm > 12) {
          nmm = 1;
          nyy += 1;
        }
        const nextMonth = `${nyy.toString().padStart(4, "0")}-${nmm.toString().padStart(2, "0")}`;
        return {
          start: `${ym}-01`,
          end: `${ym}-${last}`,
          dueBy: `${nextMonth}-05`
          // mensal: até o 5º dia útil aprox
        };
      };
      let billingsQuery = supabaseAdmin.from("escort_billings").select("id, client_id, client_name, data_missao, fat_total, fat_acionamento, fat_hora_extra, fat_km, despesas_pedagio, receitas_os, valor_franquia, valor_km_extra, fat_adicional_noturno, status, service_order_id, invoice_id, boletim_numero, created_at").gte("data_missao", fromDate).lte("data_missao", toDate).order("data_missao", { ascending: false }).limit(5e3);
      if (onlyClient) billingsQuery = billingsQuery.eq("client_id", onlyClient);
      const { data: billings, error: bErr } = await billingsQuery;
      if (bErr) throw bErr;
      const clientIds = Array.from(/* @__PURE__ */ new Set([
        ...(billings || []).map((b) => b.client_id).filter(Boolean),
        ...onlyClient ? [onlyClient] : []
      ]));
      const clientMap = /* @__PURE__ */ new Map();
      if (clientIds.length > 0) {
        const { data: cls } = await supabaseAdmin.from("clients").select("id, name, billing_cycle, payment_terms_days").in("id", clientIds);
        for (const c of cls || []) clientMap.set(c.id, c);
      }
      const invoiceIds = Array.from(new Set((billings || []).map((b) => b.invoice_id).filter(Boolean)));
      const invoiceMap = /* @__PURE__ */ new Map();
      if (invoiceIds.length > 0) {
        const { data: invs } = await supabaseAdmin.from("invoices").select("id, status, value, payment_date, due_date, asaas_payment_id, nfse_status, nfse_number, nfse_url, invoice_url").in("id", invoiceIds);
        for (const i of invs || []) invoiceMap.set(i.id, i);
      }
      const billingSoIds = Array.from(new Set((billings || []).map((b) => b.service_order_id).filter(Boolean)));
      const { data: sosWithBilling } = billingSoIds.length > 0 ? await supabaseAdmin.from("service_orders").select("id, os_number, status, mission_status, valor_estimado, completed_date, scheduled_date, client_id").in("id", billingSoIds) : { data: [] };
      let sosCompletedQ = supabaseAdmin.from("service_orders").select("id, os_number, status, mission_status, valor_estimado, completed_date, scheduled_date, client_id").in("status", ["concluida", "encerrada", "finalizada"]).gte("scheduled_date", `${fromDate}T00:00:00`).lte("scheduled_date", `${toDate}T23:59:59`).neq("status", "CANCELADO").limit(5e3);
      if (onlyClient) sosCompletedQ = sosCompletedQ.eq("client_id", onlyClient);
      const { data: sosCompleted } = await sosCompletedQ;
      const soMap = /* @__PURE__ */ new Map();
      for (const s of sosWithBilling || []) soMap.set(s.id, s);
      for (const s of sosCompleted || []) if (!soMap.has(s.id)) soMap.set(s.id, s);
      const billedSoIds = new Set(billingSoIds);
      const valorOf = (b) => {
        const v = Number(b.fat_total || 0);
        if (v > 0) return v;
        return Number(b.fat_acionamento || b.valor_franquia || 0) + Number(b.fat_hora_extra || 0) + Number(b.fat_km || b.valor_km_extra || 0) + Number(b.despesas_pedagio || 0) + Number(b.fat_adicional_noturno || 0) + Number(b.receitas_os || 0);
      };
      const stageOf = (billing, inv) => {
        const st = String(billing?.status || "").toUpperCase();
        if (inv) {
          if (!inv.asaas_payment_id) {
            return "FATURADA_LOCAL";
          }
          const stPay = String(inv.status || "").toUpperCase();
          if (["RECEIVED", "CONFIRMED", "PAID"].includes(stPay)) return "PAGO";
          const nf = String(inv.nfse_status || "").toUpperCase();
          if (["AUTHORIZED", "SYNCHRONIZED"].includes(nf) && inv.nfse_number && !String(inv.nfse_number).startsWith("inv_")) {
            return "NF_EMITIDA";
          }
          if (["OVERDUE"].includes(stPay)) return "VENCIDA";
          return "ENVIADA";
        }
        if (st === "FATURADO" || st === "FATURADA") return "FATURADA_FALSA";
        if (st === "APROVADA") return "APROVADA";
        if (st === "CANCELADO" || st === "CANCELADA" || st === "REJEITADA" || st === "RECUSADA") return "CANCELADA";
        return "PENDENTE";
      };
      const rows = [];
      for (const b of billings || []) {
        const cli = clientMap.get(b.client_id);
        const cycle = String(cli?.billing_cycle || "mensal").toLowerCase();
        const isQuinz = cycle === "quinzenal" || cycle === "quinzena";
        const period = isQuinz ? quinzenaInfo(b.data_missao) : mensalInfo(b.data_missao);
        const inv = b.invoice_id ? invoiceMap.get(b.invoice_id) : null;
        const so = b.service_order_id ? soMap.get(b.service_order_id) : null;
        const valorBilling = valorOf(b);
        const valorOp = Number(so?.valor_estimado || 0);
        const stage = stageOf(b, inv);
        const hasInvoice = !!inv;
        const lateNoInvoice = !hasInvoice && period.dueBy < today;
        const divergence = valorOp > 0 && valorBilling > 0 ? Math.abs(valorOp - valorBilling) / Math.max(valorOp, valorBilling) : 0;
        rows.push({
          tipo: "BILLING",
          billingId: b.id,
          soId: b.service_order_id,
          osNumber: so?.os_number || b.boletim_numero || (b.service_order_id ? `OS#${b.service_order_id}` : "\u2014"),
          dataMissao: b.data_missao,
          clientId: b.client_id,
          clientName: b.client_name || cli?.name || "\u2014",
          billingCycle: isQuinz ? "quinzenal" : "mensal",
          quinzena: isQuinz ? `Q${period.q}` : "M",
          periodoStart: period.start,
          periodoEnd: period.end,
          dueBy: period.dueBy,
          valorOperacional: valorOp || null,
          valorBilling,
          valorFatura: inv ? Number(inv.value || 0) : null,
          statusMedicao: b.status,
          invoiceId: b.invoice_id,
          invoiceStatus: inv?.status || null,
          invoiceUrl: inv?.invoice_url || null,
          asaasPaymentId: inv?.asaas_payment_id || null,
          nfseStatus: inv?.nfse_status || null,
          nfseNumber: inv?.nfse_number || null,
          paymentDate: inv?.payment_date || null,
          stage,
          atraso: lateNoInvoice && stage !== "CANCELADA",
          esquecida: false,
          divergenciaPct: divergence > 1e-3 ? Number((divergence * 100).toFixed(2)) : 0
        });
      }
      for (const s of sosCompleted || []) {
        if (billedSoIds.has(s.id)) continue;
        const cli = clientMap.get(s.client_id);
        const cycle = String(cli?.billing_cycle || "mensal").toLowerCase();
        const isQuinz = cycle === "quinzenal" || cycle === "quinzena";
        const dataRef = (s.completed_date || s.scheduled_date || "").slice(0, 10);
        if (!dataRef) continue;
        const period = isQuinz ? quinzenaInfo(dataRef) : mensalInfo(dataRef);
        rows.push({
          tipo: "OS_ESQUECIDA",
          billingId: null,
          soId: s.id,
          osNumber: s.os_number,
          dataMissao: dataRef,
          clientId: s.client_id,
          clientName: cli?.name || "\u2014",
          billingCycle: isQuinz ? "quinzenal" : "mensal",
          quinzena: isQuinz ? `Q${period.q}` : "M",
          periodoStart: period.start,
          periodoEnd: period.end,
          dueBy: period.dueBy,
          valorOperacional: Number(s.valor_estimado || 0) || null,
          valorBilling: 0,
          valorFatura: null,
          statusMedicao: "SEM_BOLETIM",
          invoiceId: null,
          invoiceStatus: null,
          invoiceUrl: null,
          asaasPaymentId: null,
          nfseStatus: null,
          nfseNumber: null,
          paymentDate: null,
          stage: "ESQUECIDA",
          atraso: period.dueBy < today,
          esquecida: true,
          divergenciaPct: 0
        });
      }
      const totals = {
        totalLinhas: rows.length,
        totalEsquecidas: rows.filter((r) => r.esquecida).length,
        totalAtrasadas: rows.filter((r) => r.atraso).length,
        totalPagas: rows.filter((r) => r.stage === "PAGO").length,
        totalNFEmitidas: rows.filter((r) => r.stage === "NF_EMITIDA").length,
        totalEnviadas: rows.filter((r) => r.stage === "ENVIADA" || r.stage === "VENCIDA").length,
        totalAprovadas: rows.filter((r) => r.stage === "APROVADA").length,
        totalPendentes: rows.filter((r) => r.stage === "PENDENTE").length,
        totalDivergencia: rows.filter((r) => r.divergenciaPct > 5).length,
        totalFalsasFaturadas: rows.filter((r) => r.stage === "FATURADA_FALSA").length,
        totalFaturadasLocal: rows.filter((r) => r.stage === "FATURADA_LOCAL").length,
        valorTotalPeriodo: rows.reduce((s, r) => s + (r.valorBilling || r.valorOperacional || 0), 0),
        valorPago: rows.filter((r) => r.stage === "PAGO").reduce((s, r) => s + (r.valorFatura || r.valorBilling || 0), 0),
        valorEnviado: rows.filter((r) => r.stage === "ENVIADA" || r.stage === "VENCIDA" || r.stage === "NF_EMITIDA").reduce((s, r) => s + (r.valorFatura || r.valorBilling || 0), 0),
        valorEsquecido: rows.filter((r) => r.esquecida).reduce((s, r) => s + (r.valorOperacional || 0), 0)
      };
      const saudePct = totals.valorTotalPeriodo > 0 ? Number(((totals.valorPago + totals.valorEnviado) / totals.valorTotalPeriodo * 100).toFixed(1)) : 0;
      res.json({
        period: { from: fromDate, to: toDate, today },
        totals: { ...totals, saudePct },
        rows
      });
    } catch (err) {
      console.error("[auditoria-faturamento] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/auditoria-faturamento/reconcile-falsos", async (req, res) => {
    try {
      const user = req.user;
      const { ids } = req.body || {};
      let q = supabaseAdmin.from("escort_billings").select("id, client_id, client_name, invoice_id, status, data_missao").in("status", ["FATURADO", "FATURADA"]);
      if (Array.isArray(ids) && ids.length > 0) q = q.in("id", ids);
      const { data: candidates, error: candErr } = await q.limit(5e3);
      if (candErr) throw candErr;
      const invIds = Array.from(new Set((candidates || []).map((b) => b.invoice_id).filter(Boolean)));
      let invMap = /* @__PURE__ */ new Map();
      if (invIds.length > 0) {
        const { data: invs } = await supabaseAdmin.from("invoices").select("id").in("id", invIds);
        for (const i of invs || []) invMap.set(i.id, i);
      }
      const toRevert = (candidates || []).filter(
        (b) => !b.invoice_id || !invMap.has(b.invoice_id)
      );
      if (toRevert.length === 0) {
        return res.json({ reverted: 0, message: "Nenhum status falso encontrado.", ids: [] });
      }
      const revertIds = toRevert.map((b) => b.id);
      const { error: updErr } = await supabaseAdmin.from("escort_billings").update({ status: "APROVADA", invoice_id: null, faturado_em: null, faturado_por: null }).in("id", revertIds);
      if (updErr) throw updErr;
      bustBalancoCaches();
      await logSystemAudit({
        userId: user?.id,
        userName: user?.name,
        userRole: user?.role,
        action: "AUDITORIA_RECONCILE_FALSOS",
        targetId: revertIds.join(","),
        targetType: "escort_billing",
        details: `${revertIds.length} billing(s) revertido(s) de FATURADO\u2192APROVADA por status falso (invoice_id NULL ou deletada). IDs: ${revertIds.slice(0, 50).join(", ")}${revertIds.length > 50 ? "\u2026" : ""}`,
        ipAddress: req.ip
      });
      console.log(`[auditoria] reconcile-falsos: ${revertIds.length} billing(s) revertidos pra APROVADA`);
      res.json({
        reverted: revertIds.length,
        ids: revertIds,
        message: `${revertIds.length} OS retornaram para APROVADA e est\xE3o prontas para refaturar.`
      });
    } catch (err) {
      console.error("[auditoria-faturamento/reconcile-falsos] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  console.log("[asaas] Rotas de faturamento Asaas registradas");
}
var ASAAS_API_URL, PAID_STATUSES, REGRESSION_STATUSES, nfReconcileState;
var init_asaas = __esm({
  "server/asaas.ts"() {
    "use strict";
    init_auth();
    init_supabase();
    init_audit();
    init_helpers();
    init_balanco_cache();
    init_asaas_helpers();
    ASAAS_API_URL = process.env.ASAAS_API_URL || "https://www.asaas.com/api/v3";
    PAID_STATUSES = ["RECEIVED_IN_CASH", "RECEIVED", "CONFIRMED", "PAGO"];
    REGRESSION_STATUSES = ["OVERDUE", "PENDING", "AWAITING_RISK_ANALYSIS", "AWAITING_PAYMENT"];
    nfReconcileState = {
      startedAt: null,
      completedAt: null,
      processed: 0,
      updated: 0,
      errors: 0,
      lastError: null,
      running: false
    };
  }
});

// server/jobs/diarias-jornada-longa.ts
var diarias_jornada_longa_exports = {};
__export(diarias_jornada_longa_exports, {
  DIARIA_LONG_SHIFT_LIMITE_HORAS: () => DIARIA_LONG_SHIFT_LIMITE_HORAS,
  DIARIA_LONG_SHIFT_VALOR: () => DIARIA_LONG_SHIFT_VALOR,
  processDiariasJornadaLonga: () => processDiariasJornadaLonga
});
function quinzenaRange(targetYmd) {
  const [yyyy, mm, dd] = targetYmd.split("-").map((n) => parseInt(n, 10));
  const lastDay = new Date(yyyy, mm, 0).getDate();
  if (dd <= 15) {
    return {
      label: `Q1/${yyyy}-${String(mm).padStart(2, "0")}`,
      startYmd: `${yyyy}-${String(mm).padStart(2, "0")}-01`,
      endYmd: `${yyyy}-${String(mm).padStart(2, "0")}-15`
    };
  }
  return {
    label: `Q2/${yyyy}-${String(mm).padStart(2, "0")}`,
    startYmd: `${yyyy}-${String(mm).padStart(2, "0")}-16`,
    endYmd: `${yyyy}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  };
}
async function processDiariasJornadaLonga(targetYmd) {
  const { label: quinzenaLabel, startYmd, endYmd } = quinzenaRange(targetYmd);
  const startIso = `${startYmd}T00:00:00-03:00`;
  const endIso = `${endYmd}T23:59:59-03:00`;
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const { data: employees } = await supabaseAdmin.from("employees").select("id, name, status");
  const empMap = /* @__PURE__ */ new Map();
  for (const e of employees || []) empMap.set(e.id, e.name);
  const empIds = Array.from(empMap.keys());
  if (empIds.length === 0) {
    return {
      quinzena: quinzenaLabel,
      quinzenaInicio: startYmd,
      quinzenaFim: endYmd,
      paresLongosDetectados: 0,
      linhasRemovidas: 0,
      linhasCriadas: 0,
      agentes: []
    };
  }
  const punchStart = new Date(startMs - 24 * 3600 * 1e3).toISOString();
  const punchEnd = new Date(endMs + 3 * 24 * 3600 * 1e3).toISOString();
  const { data: punches } = await supabaseAdmin.from("control_id_punches").select("employee_id, punch_at").in("employee_id", empIds).gte("punch_at", punchStart).lt("punch_at", punchEnd).order("punch_at", { ascending: true });
  const punchesByEmp = /* @__PURE__ */ new Map();
  for (const p of punches || []) {
    if (!punchesByEmp.has(p.employee_id)) punchesByEmp.set(p.employee_id, []);
    punchesByEmp.get(p.employee_id).push({ punch_at: p.punch_at });
  }
  const paresLongos = [];
  for (const [empId, pl] of Array.from(punchesByEmp.entries())) {
    const r = computeWorkedHours(pl);
    for (const par of r.pairs) {
      const horas = (par.saida.getTime() - par.entrada.getTime()) / 36e5;
      if (horas <= DIARIA_LONG_SHIFT_LIMITE_HORAS) continue;
      const entradaMs = par.entrada.getTime();
      if (entradaMs < startMs || entradaMs > endMs) continue;
      paresLongos.push({ employeeId: empId, entrada: par.entrada, saida: par.saida, horas });
    }
  }
  let allOs = [];
  if (paresLongos.length > 0) {
    const overlappingStart = new Date(Math.min(...paresLongos.map((p) => p.entrada.getTime()))).toISOString();
    const overlappingEnd = new Date(Math.max(...paresLongos.map((p) => p.saida.getTime()))).toISOString();
    const { data: osList } = await supabaseAdmin.from("service_orders").select("id, os_number, assigned_employee_id, assigned_employee_2_id, mission_started_at, completed_date").or(
      `and(mission_started_at.gte.${overlappingStart},mission_started_at.lte.${overlappingEnd}),and(completed_date.gte.${overlappingStart},completed_date.lte.${overlappingEnd}),and(mission_started_at.lte.${overlappingStart},completed_date.gte.${overlappingEnd})`
    ).neq("status", "recusada").neq("status", "cancelada");
    allOs = osList || [];
  }
  const porAgente = /* @__PURE__ */ new Map();
  function bump(agId, valor, osNumber) {
    if (!porAgente.has(agId)) {
      porAgente.set(agId, {
        employeeId: agId,
        employeeName: empMap.get(agId) || `#${agId}`,
        pares: 0,
        totalValor: 0,
        osNumbers: /* @__PURE__ */ new Set()
      });
    }
    const x = porAgente.get(agId);
    x.pares += 1;
    x.totalValor += valor;
    if (osNumber) x.osNumbers.add(osNumber);
  }
  for (const par of paresLongos) {
    const parEntradaMs = par.entrada.getTime();
    const parSaidaMs = par.saida.getTime();
    const osSobreposta = allOs.find((o) => {
      const isAgent = o.assigned_employee_id === par.employeeId || o.assigned_employee_2_id === par.employeeId;
      if (!isAgent) return false;
      const ini = o.mission_started_at ? new Date(o.mission_started_at).getTime() : null;
      const fim = o.completed_date ? new Date(o.completed_date).getTime() : Date.now();
      if (ini == null) return false;
      return ini <= parSaidaMs && fim >= parEntradaMs;
    });
    const agentesDestino = osSobreposta ? [osSobreposta.assigned_employee_id, osSobreposta.assigned_employee_2_id].filter((x) => Boolean(x)) : [par.employeeId];
    for (const agId of agentesDestino) {
      bump(agId, DIARIA_LONG_SHIFT_VALOR, osSobreposta?.os_number || null);
    }
  }
  const { data: oldRows } = await supabaseAdmin.from("agent_daily_allowances").select("id, description").gte("date", startYmd).lte("date", endYmd).or(`description.ilike.${DESC_PREFIX_NEW}%,description.ilike.${DESC_PREFIX_OLD}%`);
  const idsToDelete = (oldRows || []).map((r) => r.id);
  let linhasRemovidas = 0;
  if (idsToDelete.length > 0) {
    const { error: delErr } = await supabaseAdmin.from("agent_daily_allowances").delete().in("id", idsToDelete);
    if (delErr) console.error("[diarias-quinzena] erro ao deletar antigas:", delErr);
    else linhasRemovidas = idsToDelete.length;
  }
  let linhasCriadas = 0;
  const agentesOut = [];
  for (const resumo of Array.from(porAgente.values())) {
    const osList = Array.from(resumo.osNumbers).sort();
    const osTxt = osList.length > 0 ? ` \u2014 OSs: ${osList.join(", ")}` : "";
    const descricao = `${DESC_PREFIX_NEW} \u2014 ${quinzenaLabel} \u2014 ${resumo.pares} jornada${resumo.pares === 1 ? "" : "s"} >16h${osTxt} \u2014 R$ ${DIARIA_LONG_SHIFT_VALOR.toFixed(2).replace(".", ",")} \xD7 ${resumo.pares}`;
    const { error: insErr } = await supabaseAdmin.from("agent_daily_allowances").insert({
      employee_id: resumo.employeeId,
      date: endYmd,
      amount: resumo.totalValor.toFixed(2),
      description: descricao
    });
    if (insErr) {
      console.error("[diarias-quinzena] erro ao inserir:", insErr);
    } else {
      linhasCriadas++;
    }
    agentesOut.push({
      employeeId: resumo.employeeId,
      employeeName: resumo.employeeName,
      pares: resumo.pares,
      totalValor: +resumo.totalValor.toFixed(2),
      osNumbers: osList
    });
  }
  agentesOut.sort((a, b) => a.employeeName.localeCompare(b.employeeName, "pt-BR"));
  return {
    quinzena: quinzenaLabel,
    quinzenaInicio: startYmd,
    quinzenaFim: endYmd,
    paresLongosDetectados: paresLongos.length,
    linhasRemovidas,
    linhasCriadas,
    agentes: agentesOut
  };
}
var DIARIA_LONG_SHIFT_VALOR, DIARIA_LONG_SHIFT_LIMITE_HORAS, DESC_PREFIX_NEW, DESC_PREFIX_OLD;
var init_diarias_jornada_longa = __esm({
  "server/jobs/diarias-jornada-longa.ts"() {
    "use strict";
    init_supabase();
    init_hours_calc();
    DIARIA_LONG_SHIFT_VALOR = 43;
    DIARIA_LONG_SHIFT_LIMITE_HORAS = 16;
    DESC_PREFIX_NEW = "[AUTO-Q] Di\xE1rias jornada >16h";
    DESC_PREFIX_OLD = "[AUTO] Jornada >16h";
  }
});

// server/permanent-contract-pdf.ts
import PDFDocument from "pdfkit";
import fs2 from "fs";
import path2 from "path";
function fmtDateBr(d) {
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}
function fmtDateExtenso(d) {
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return `${String(day).padStart(2, "0")} de ${MESES_PT3[m - 1]} de ${y}`;
}
function fmtBrl(v) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function loadLogo() {
  const candidates = [
    path2.join(process.cwd(), "client/public/icon-192x192.png"),
    path2.join(process.cwd(), "client/public/logo-torres-dark.jpeg")
  ];
  for (const p of candidates) {
    try {
      if (fs2.existsSync(p)) return fs2.readFileSync(p);
    } catch {
    }
  }
  return null;
}
function applyTemplate(tpl, vars) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}
function generatePermanentContractPDF(res, data, template = DEFAULT_PERMANENT_TEMPLATE) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 30, bottom: 25, left: 40, right: 40 }
  });
  res.setHeader("Content-Type", "application/pdf");
  const safeName = data.employeeName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  res.setHeader("Content-Disposition", `inline; filename="Contrato_Definitivo_${safeName}.pdf"`);
  doc.pipe(res);
  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const LM = doc.page.margins.left;
  const F_NORMAL = "Helvetica";
  const F_BOLD = "Helvetica-Bold";
  const SZ = 9;
  const SZ_TITLE = 12;
  const LG = 2;
  const PARA_GAP = 0.5;
  const vars = {
    empresa_nome: COMPANY.name,
    empresa_endereco: COMPANY.address,
    empresa_cidade: COMPANY.city,
    empresa_estado: COMPANY.state,
    empresa_cnpj: COMPANY.cnpj,
    empregado_nome: data.employeeName.toUpperCase(),
    empregado_endereco: data.employeeAddress.toUpperCase(),
    empregado_bairro: data.employeeNeighborhood.toUpperCase(),
    empregado_cidade: data.employeeCity.toUpperCase(),
    empregado_estado: data.employeeState.toUpperCase(),
    ctps_numero: data.ctpsNumber,
    ctps_serie: data.ctpsSerie,
    funcao: data.funcao.toUpperCase(),
    remuneracao: fmtBrl(Number(data.remuneracao)),
    data_inicio: fmtDateBr(data.startDate),
    cidade_contrato: data.cidadeContrato.toUpperCase(),
    data_extenso: fmtDateExtenso(data.startDate),
    jornada: data.jornada || template.jornadaPadrao,
    local_trabalho: data.localTrabalho || "O MESMO DA EMPRESA"
  };
  const sub = (s) => applyTemplate(s, vars);
  doc.fillColor("#000000").strokeColor("#000000");
  const logo = loadLogo();
  const headerY = doc.y;
  if (logo) {
    try {
      doc.image(logo, LM, headerY, { width: 42, height: 42 });
    } catch {
    }
  }
  doc.font(F_BOLD).fontSize(11).fillColor("#000000").text(COMPANY.name, LM + 50, headerY + 4, { width: W - 50 });
  doc.font(F_NORMAL).fontSize(8).text(`CNPJ: ${COMPANY.cnpj}`, LM + 50, headerY + 18, { width: W - 50 }).text(`${COMPANY.address} \u2014 ${COMPANY.city}/${COMPANY.state}`, LM + 50, headerY + 28, { width: W - 50 });
  doc.moveTo(LM, headerY + 48).lineTo(LM + W, headerY + 48).strokeColor("#000000").lineWidth(0.8).stroke();
  doc.y = headerY + 54;
  doc.font(F_BOLD).fontSize(SZ_TITLE).fillColor("#000000").text("CONTRATO INDIVIDUAL DE TRABALHO \u2014 PRAZO INDETERMINADO", LM, doc.y, { width: W, align: "center" });
  doc.moveDown(0.5);
  function para(text, opts = {}) {
    doc.font(F_NORMAL).fontSize(SZ).fillColor("#000000");
    doc.text(text, LM, doc.y, { align: opts.align || "justify", lineGap: LG, width: W });
    doc.moveDown(opts.gap ?? PARA_GAP);
  }
  para(sub(template.cabecalho));
  para(sub(template.clausula1));
  para(sub(template.clausula2));
  para(sub(template.clausula3Titulo), { gap: 0.15 });
  para(sub(vars.jornada), { align: "center" });
  para(sub(template.clausula4Titulo), { gap: 0.15 });
  para(vars.remuneracao, { align: "center" });
  para(sub(template.clausula5));
  para(sub(template.clausula6));
  para(sub(template.clausula7));
  para(sub(template.clausula8));
  para(sub(template.fechamento));
  doc.moveDown(0.4);
  doc.font(F_NORMAL).fontSize(SZ).fillColor("#000000").text(`${vars.cidade_contrato}, ${vars.data_extenso}.`, LM, doc.y, { width: W });
  doc.moveDown(1.4);
  const colW = (W - 20) / 2;
  const colLx = LM;
  const colRx = LM + colW + 20;
  let yAss = doc.y;
  if (data.signatureDrawing && /^data:image\//i.test(data.signatureDrawing)) {
    try {
      const base64 = data.signatureDrawing.split(",")[1];
      const imgBuf = Buffer.from(base64, "base64");
      doc.image(imgBuf, colRx + 20, yAss - 22, { width: colW - 40, height: 22, align: "center" });
    } catch {
    }
  }
  doc.font(F_NORMAL).fontSize(SZ).fillColor("#000000");
  doc.text("____________________________________", colLx, yAss, { width: colW, align: "center" });
  doc.text(COMPANY.name, colLx, yAss + 10, { width: colW, align: "center" });
  doc.text("____________________________________", colRx, yAss, { width: colW, align: "center" });
  doc.text(vars.empregado_nome, colRx, yAss + 10, { width: colW, align: "center" });
  yAss = yAss + 38;
  doc.text("____________________________________", colLx, yAss, { width: colW, align: "center" });
  doc.text("Testemunha", colLx, yAss + 10, { width: colW, align: "center" });
  doc.text("____________________________________", colRx, yAss, { width: colW, align: "center" });
  doc.text("Testemunha", colRx, yAss + 10, { width: colW, align: "center" });
  doc.y = yAss + 36;
  if (data.signedAt) {
    const evY = doc.y + 10;
    if (evY < doc.page.height - doc.page.margins.bottom - 30) {
      doc.font(F_NORMAL).fontSize(6).fillColor("#000000");
      const ts = new Date(data.signedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      doc.text(`Assinado eletronicamente em ${ts} (BRT) \u2014 IP: ${data.signatureIp || "-"} \u2014 Funcion\xE1rio: ${data.employeeName} \u2014 Aceitou termo de ci\xEAncia e validade jur\xEDdica da assinatura eletr\xF4nica conforme MP 2.200-2/2001 e Lei 14.063/2020.`, LM, evY, { width: W, align: "center" });
    }
  }
  doc.end();
}
var DEFAULT_PERMANENT_TEMPLATE, COMPANY, MESES_PT3;
var init_permanent_contract_pdf = __esm({
  "server/permanent-contract-pdf.ts"() {
    "use strict";
    DEFAULT_PERMANENT_TEMPLATE = {
      cabecalho: `Pelo presente instrumento particular de Contrato Individual de Trabalho por Prazo Indeterminado, a empresa {{empresa_nome}} com sede \xE0 {{empresa_endereco}} Cidade {{empresa_cidade}} Estado {{empresa_estado}}, inscrita no CNPJ do MF sob N\xBA {{empresa_cnpj}}, denominada Empregadora, E O SR.(A) {{empregado_nome}}, DOMICILIADO \xC0 {{empregado_endereco}}, NO BAIRRO {{empregado_bairro}}, NA CIDADE DE {{empregado_cidade}}/{{empregado_estado}}, PORTADOR DA CTPS N\xBA/S\xC9RIE {{ctps_numero}}/{{ctps_serie}} DORAVANTE CHAMADO EMPREGADO, FICA JUSTO E ACERTADO, EM SEQU\xCANCIA AO CONTRATO DE EXPERI\xCANCIA J\xC1 CUMPRIDO, O PRESENTE CONTRATO INDIVIDUAL DE TRABALHO POR PRAZO INDETERMINADO, REGIDO PELAS SEGUINTES CL\xC1USULAS:`,
      clausula1: `1 - O Empregado continuar\xE1 trabalhando para a Empregadora na fun\xE7\xE3o de {{funcao}} e mais as fun\xE7\xF5es que vierem a ser objeto de ordens verbais, cartas ou avisos, segundo as necessidades da Empregadora desde que compat\xEDveis com suas atribui\xE7\xF5es.`,
      clausula2: `2 - O local de trabalho situa-se {{local_trabalho}}, podendo a Empregadora, a qualquer tempo, transferir o Empregado a t\xEDtulo tempor\xE1rio ou definitivo, tanto no \xE2mbito da unidade para a qual foi admitido, como para outras, em qualquer localidade deste Estado ou de outro dentro do Pa\xEDs, em conformidade com o par\xE1grafo 1\xBA do artigo 469 da Consolida\xE7\xE3o das Leis do Trabalho.`,
      clausula3Titulo: `3 - O hor\xE1rio de trabalho do empregado ser\xE1 o seguinte:`,
      jornadaPadrao: `A jornada de trabalho ser\xE1 flex\xEDvel`,
      clausula4Titulo: `4 - O Empregado perceber\xE1 a remunera\xE7\xE3o de:`,
      clausula5: `5 - O presente contrato \xE9 por PRAZO INDETERMINADO, com in\xEDcio em {{data_inicio}}, sucedendo o Contrato de Experi\xEAncia cumprido pelo Empregado, na forma do art. 451 da CLT.`,
      clausula6: `6 - Al\xE9m dos descontos previstos na Lei, reserva-se a Empregadora o direito de descontar do Empregado as import\xE2ncias correspondentes aos danos causados por ele, com fundamento no par\xE1grafo 1\xBA do artigo 462 da Consolida\xE7\xE3o das Leis de Trabalho.`,
      clausula7: `7 - O Empregado fica ciente do Regulamento da Empresa e das Normas de Seguran\xE7a que regulam suas atividades na Empregadora e se compromete a usar os equipamentos de seguran\xE7a fornecidos, sob a pena de ser punido por falta grave, nos termos da Legisla\xE7\xE3o vigente e demais disposi\xE7\xF5es inerentes \xE0 seguran\xE7a e medicina do trabalho.`,
      clausula8: `8 - A rescis\xE3o do presente contrato observar\xE1 as regras da CLT aplic\xE1veis aos contratos por prazo indeterminado, inclusive quanto a aviso pr\xE9vio, multa do FGTS e demais verbas rescis\xF3rias.`,
      fechamento: `Tendo assim contratado, assinam o presente instrumento, em duas vias, na presen\xE7a da testemunha abaixo.`
    };
    COMPANY = {
      name: "TORRES VIGILANCIA PATRIMONIAL LTDA",
      address: "AV RAIMUNDO PEREIRA DE MAGALHAES, 5720 PIRITUBA",
      city: "SAO PAULO",
      state: "SP",
      cnpj: "36.982.392/0001-89"
    };
    MESES_PT3 = ["Janeiro", "Fevereiro", "Mar\xE7o", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  }
});

// server/routes/permanent-contracts.ts
var permanent_contracts_exports = {};
__export(permanent_contracts_exports, {
  autoCreatePermanentContractFromProbation: () => autoCreatePermanentContractFromProbation,
  registerPermanentContractRoutes: () => registerPermanentContractRoutes,
  syncDuePermanentContracts: () => syncDuePermanentContracts
});
async function loadPermanentTemplate() {
  try {
    const { data } = await supabaseAdmin.from("system_settings").select("value").eq("key", "permanent_contract_template").limit(1);
    if (data && data.length && data[0].value) {
      const parsed = JSON.parse(data[0].value);
      return { ...DEFAULT_PERMANENT_TEMPLATE, ...parsed };
    }
  } catch (_e) {
  }
  return DEFAULT_PERMANENT_TEMPLATE;
}
function todayBrtIso() {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(/* @__PURE__ */ new Date());
}
function isoLessOrEqual(a, b) {
  return a <= b;
}
async function autoCreatePermanentContractFromProbation(probation) {
  try {
    if (!probation?.id) return { created: false };
    if (probation.assinatura_status !== "assinado") return { created: false };
    const today = todayBrtIso();
    const probationEnd = typeof probation.end_date === "string" ? probation.end_date.split("T")[0] : probation.end_date;
    if (!probationEnd) return { created: false };
    if (!isoLessOrEqual(probationEnd, today)) return { created: false };
    const { data: existing } = await supabaseAdmin.from("employee_permanent_contracts").select("id").eq("probation_contract_id", probation.id).limit(1);
    if (existing && existing.length > 0) {
      return { created: false, contractId: existing[0].id };
    }
    const [y, m, d] = probationEnd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 1);
    const startIso = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    const payload = {
      employee_id: probation.employee_id,
      probation_contract_id: probation.id,
      start_date: startIso,
      funcao: probation.funcao,
      remuneracao: String(probation.remuneracao),
      local_trabalho: probation.local_trabalho || "O MESMO DA EMPRESA",
      jornada: probation.jornada || "A jornada de trabalho ser\xE1 flex\xEDvel",
      cidade_contrato: probation.cidade_contrato || "SAO PAULO",
      assinatura_status: "pendente"
    };
    const { data, error } = await supabaseAdmin.from("employee_permanent_contracts").insert(payload).select().single();
    if (error) return { created: false, error: error.message };
    return { created: true, contractId: data.id };
  } catch (err) {
    return { created: false, error: err.message };
  }
}
async function syncDuePermanentContracts() {
  const today = todayBrtIso();
  const { data: probations } = await supabaseAdmin.from("employee_probation_contracts").select("id, employee_id, end_date, funcao, remuneracao, local_trabalho, jornada, cidade_contrato, assinatura_status").eq("assinatura_status", "assinado").lte("end_date", today);
  let created = 0;
  let errors = 0;
  const list = probations || [];
  for (const p of list) {
    const r = await autoCreatePermanentContractFromProbation(p);
    if (r.created) created++;
    if (r.error) errors++;
  }
  return { scanned: list.length, created, errors };
}
async function loadContractWithEmployee(id) {
  const { data: rows } = await supabaseAdmin.from("employee_permanent_contracts").select("*").eq("id", id).limit(1);
  if (!rows || rows.length === 0) return null;
  const c = rows[0];
  const { data: empRows } = await supabaseAdmin.from("employees").select("id,name,role,cpf,address,hire_date,pis,rg").eq("id", c.employee_id).limit(1);
  const emp = empRows && empRows[0] ? empRows[0] : null;
  return { contract: c, employee: emp };
}
function registerPermanentContractRoutes(app) {
  app.get("/api/permanent-contracts", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("employee_permanent_contracts").select("*").order("created_at", { ascending: false });
      if (error) return res.status(500).json({ message: error.message });
      const empIds = Array.from(new Set((data || []).map((c) => c.employee_id)));
      let empMap = {};
      if (empIds.length > 0) {
        const { data: emps } = await supabaseAdmin.from("employees").select("id,name,role,matricula").in("id", empIds);
        empMap = Object.fromEntries((emps || []).map((e) => [e.id, e]));
      }
      const list = (data || []).map((c) => ({
        ...toCamelObj(c),
        employee: empMap[c.employee_id] ? toCamelObj(empMap[c.employee_id]) : null
      }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.get("/api/employees/:id/permanent-contracts", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const employeeId = Number(req.params.id);
      const { data } = await supabaseAdmin.from("employee_permanent_contracts").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false });
      res.json(toCamelArray(data || []));
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/permanent-contracts/sync-due", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const r = await syncDuePermanentContracts();
      res.json(r);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.get("/api/mobile/my-permanent-contracts", requireAuth, async (req, res) => {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) return res.json([]);
      const { data } = await supabaseAdmin.from("employee_permanent_contracts").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false });
      res.json(toCamelArray(data || []));
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/permanent-contracts/:id/sign", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { facialFoto, assinaturaDesenho, termoAceito, termoTexto } = req.body || {};
      if (!facialFoto || !/^data:image\//i.test(facialFoto)) {
        return res.status(400).json({ message: "Foto facial obrigat\xF3ria" });
      }
      if (!assinaturaDesenho || !/^data:image\//i.test(assinaturaDesenho)) {
        return res.status(400).json({ message: "Assinatura digital obrigat\xF3ria" });
      }
      if (!termoAceito) {
        return res.status(400).json({ message: "\xC9 necess\xE1rio aceitar o termo de ci\xEAncia" });
      }
      const { data: rows } = await supabaseAdmin.from("employee_permanent_contracts").select("*").eq("id", id).limit(1);
      if (!rows?.length) return res.status(404).json({ message: "Contrato n\xE3o encontrado" });
      const contract = rows[0];
      if (!req.user.employeeId || contract.employee_id !== req.user.employeeId) {
        return res.status(403).json({ message: "Contrato n\xE3o pertence a este funcion\xE1rio" });
      }
      if (contract.assinatura_status === "assinado") {
        return res.status(400).json({ message: "Contrato j\xE1 assinado" });
      }
      const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
      const ua = req.headers["user-agent"] || "";
      const { data: updated, error } = await supabaseAdmin.from("employee_permanent_contracts").update({
        assinatura_status: "assinado",
        assinado_em: (/* @__PURE__ */ new Date()).toISOString(),
        assinatura_facial_foto: facialFoto,
        assinatura_desenho: assinaturaDesenho,
        assinatura_termo: termoTexto || "Declaro que li e estou de acordo com todas as cl\xE1usulas do presente Contrato Individual de Trabalho por Prazo Indeterminado, reconhecendo a validade jur\xEDdica desta assinatura eletr\xF4nica nos termos da MP 2.200-2/2001 e Lei 14.063/2020.",
        assinatura_ip: ip,
        assinatura_user_agent: ua
      }).eq("id", id).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(toCamelObj(updated));
    } catch (err) {
      console.error("[sign-permanent]", err);
      res.status(500).json({ message: err.message });
    }
  });
  app.get("/api/permanent-contracts/:id/pdf", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const result = await loadContractWithEmployee(id);
      if (!result) return res.status(404).json({ message: "Contrato n\xE3o encontrado" });
      const { contract, employee } = result;
      if (!employee) return res.status(404).json({ message: "Funcion\xE1rio n\xE3o encontrado" });
      const isAdmin = req.user.role === "admin" || req.user.role === "diretoria";
      const isOwner = req.user.employeeId && req.user.employeeId === contract.employee_id;
      if (!isAdmin && !isOwner) return res.status(403).json({ message: "Acesso negado" });
      const data = {
        employeeName: employee.name || "",
        employeeAddress: employee.address || "ENDERE\xC7O N\xC3O INFORMADO",
        employeeNeighborhood: "\u2014",
        employeeCity: "\u2014",
        employeeState: "SP",
        ctpsNumber: "\u2014",
        ctpsSerie: "\u2014",
        funcao: contract.funcao,
        remuneracao: Number(contract.remuneracao),
        startDate: typeof contract.start_date === "string" ? contract.start_date.split("T")[0] : contract.start_date,
        cidadeContrato: contract.cidade_contrato || "SAO PAULO",
        localTrabalho: contract.local_trabalho,
        jornada: contract.jornada,
        signatureFacial: contract.assinatura_facial_foto,
        signatureDrawing: contract.assinatura_desenho,
        signedAt: contract.assinado_em,
        signatureIp: contract.assinatura_ip
      };
      const template = await loadPermanentTemplate();
      generatePermanentContractPDF(res, data, template);
    } catch (err) {
      console.error("[permanent-pdf]", err);
      if (!res.headersSent) res.status(500).json({ message: err.message });
    }
  });
  app.get("/api/permanent-contracts-template", requireAuth, async (_req, res) => {
    try {
      const template = await loadPermanentTemplate();
      res.json({ template, default: DEFAULT_PERMANENT_TEMPLATE });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.put("/api/permanent-contracts-template", requireAdminRole, async (req, res) => {
    try {
      const incoming = req.body?.template;
      if (!incoming || typeof incoming !== "object") {
        return res.status(400).json({ message: "Template inv\xE1lido" });
      }
      const merged = { ...DEFAULT_PERMANENT_TEMPLATE, ...incoming };
      const value = JSON.stringify(merged);
      const { data: existing } = await supabaseAdmin.from("system_settings").select("id").eq("key", "permanent_contract_template").limit(1);
      if (!existing?.length) {
        await supabaseAdmin.from("system_settings").insert({ key: "permanent_contract_template", value });
      } else {
        await supabaseAdmin.from("system_settings").update({ value, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("key", "permanent_contract_template");
      }
      res.json({ template: merged });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/permanent-contracts/:id/bypass", requireAuth, async (req, res) => {
    try {
      if (req.user.role !== "diretoria") {
        return res.status(403).json({ message: "Apenas a Diretoria pode liberar contrato sem assinatura" });
      }
      const id = Number(req.params.id);
      const reason = String(req.body?.reason || "").trim();
      if (!reason || reason.length < 5) {
        return res.status(400).json({ message: "Motivo da libera\xE7\xE3o obrigat\xF3rio (m\xEDnimo 5 caracteres)" });
      }
      const { data: rows } = await supabaseAdmin.from("employee_permanent_contracts").select("id, assinatura_status, bypass_diretoria").eq("id", id).limit(1);
      if (!rows?.length) return res.status(404).json({ message: "Contrato n\xE3o encontrado" });
      if (rows[0].assinatura_status === "assinado") {
        return res.status(400).json({ message: "Contrato j\xE1 foi assinado \u2014 bypass desnecess\xE1rio" });
      }
      if (rows[0].bypass_diretoria) {
        return res.status(400).json({ message: "Contrato j\xE1 estava liberado" });
      }
      const { data: updated, error } = await supabaseAdmin.from("employee_permanent_contracts").update({
        bypass_diretoria: true,
        bypass_by: req.user.id,
        bypass_by_name: req.user.name || req.user.username || "Diretoria",
        bypass_at: (/* @__PURE__ */ new Date()).toISOString(),
        bypass_reason: reason
      }).eq("id", id).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(toCamelObj(updated));
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/permanent-contracts/:id/bypass-revoke", requireAuth, async (req, res) => {
    try {
      if (req.user.role !== "diretoria") {
        return res.status(403).json({ message: "Apenas a Diretoria pode revogar a libera\xE7\xE3o" });
      }
      const id = Number(req.params.id);
      const { data: updated, error } = await supabaseAdmin.from("employee_permanent_contracts").update({
        bypass_diretoria: false,
        bypass_by: null,
        bypass_by_name: null,
        bypass_at: null,
        bypass_reason: null
      }).eq("id", id).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(toCamelObj(updated));
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app.get("/api/permanent-contracts/:id/signature", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { data: rows } = await supabaseAdmin.from("employee_permanent_contracts").select("id, employee_id, assinatura_status, assinado_em, assinatura_facial_foto, assinatura_desenho, assinatura_termo, assinatura_ip, assinatura_user_agent").eq("id", id).limit(1);
      if (!rows?.length) return res.status(404).json({ message: "Contrato n\xE3o encontrado" });
      res.json(toCamelObj(rows[0]));
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
}
var init_permanent_contracts = __esm({
  "server/routes/permanent-contracts.ts"() {
    "use strict";
    init_supabase();
    init_auth();
    init_storage();
    init_permanent_contract_pdf();
  }
});

// server/truckscontrol.ts
import AdmZip from "adm-zip";
function pruneLRU(map, max) {
  if (map.size <= max) return;
  const excess = map.size - max;
  const iter = map.keys();
  for (let i = 0; i < excess; i++) {
    const k = iter.next().value;
    if (k !== void 0) map.delete(k);
  }
}
function getConfig() {
  const login = process.env.TRUCKSCONTROL_CHAVE;
  const senha = process.env.TRUCKSCONTROL_SENHA;
  if (!login || !senha) return null;
  return { login, senha };
}
function parseXmlValue(xml, tag) {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : "";
}
async function postXml(xmlBody) {
  const fullXml = `<?xml version="1.0" encoding="utf-8"?>${xmlBody}`;
  const resp = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: fullXml,
    signal: AbortSignal.timeout(5e3)
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  }
  const raw = Buffer.from(await resp.arrayBuffer());
  if (raw[0] === 80 && raw[1] === 75) {
    const zip = new AdmZip(raw);
    const entries = zip.getEntries();
    if (entries.length > 0) {
      return entries[0].getData().toString("utf-8");
    }
    return "";
  }
  return raw.toString("utf-8");
}
async function sendCommand(veiID, command, mensagem) {
  const config = getConfig();
  if (!config) {
    return { success: false, message: "Credenciais TrucksControl n\xE3o configuradas." };
  }
  const commandMap = {
    bloquear: { cmd: 1, label: "Bloquear" },
    desbloquear: { cmd: 2, label: "Desbloquear" },
    sirene: { cmd: 3, label: "Sirene/Alerta" },
    aviso_cabine_on: { cmd: 5, label: "Aviso de Cabine (Ligar)" },
    aviso_cabine_off: { cmd: 5, label: "Aviso de Cabine (Desligar)" },
    mensagem_texto: { cmd: 4, label: "Mensagem de Texto" }
  };
  const cmdInfo = commandMap[command];
  if (!cmdInfo) {
    return { success: false, message: `Comando desconhecido: ${command}` };
  }
  const msgTag = command === "mensagem_texto" && mensagem ? `<msg>${escapeXml(mensagem)}</msg>` : "";
  try {
    const xml = `<RequestEnvioComando login="${config.login}" senha="${config.senha}"><comando><veiID>${veiID}</veiID><cmd>${cmdInfo.cmd}</cmd>${msgTag}</comando></RequestEnvioComando>`;
    const response = await postXml(xml);
    const cleanResponse = response.replace(/<\?xml[^?]*\?>/, "").trim();
    console.log(`[truckscontrol] Resposta crua comando ${command} veiID=${veiID}: "${cleanResponse.substring(0, 300)}"`);
    if (response.includes("<erro>") || response.includes("<Erro>") || response.includes("<ErrorRequest>")) {
      const erroMsg = parseXmlValue(response, "erro") || parseXmlValue(response, "Erro");
      console.log(`[truckscontrol] ERRO ao enviar comando ${command} para veiID=${veiID}: ${erroMsg}`);
      return { success: false, message: `Erro: ${erroMsg}`, rawResponse: response.substring(0, 500) };
    }
    if (!cleanResponse) {
      console.log(`[truckscontrol] AVISO: Resposta vazia para comando ${command} veiID=${veiID} \u2014 comando pode n\xE3o ter sido entregue ao dispositivo`);
      return {
        success: true,
        message: `Comando "${cmdInfo.label}" aceito pela API (resposta vazia \u2014 entrega ao dispositivo n\xE3o confirmada).`,
        rawResponse: "empty"
      };
    }
    const status = parseXmlValue(response, "status") || parseXmlValue(response, "Status");
    console.log(`[truckscontrol] Comando ${command} enviado para veiID=${veiID} \u2014 status: ${status || "OK"}`);
    return {
      success: true,
      message: `Comando "${cmdInfo.label}" enviado com sucesso.${status ? ` Status: ${status}` : ""}`
    };
  } catch (err) {
    console.log(`[truckscontrol] Erro ao enviar comando ${command}: ${err.message}`);
    return { success: false, message: `Erro de conex\xE3o: ${err.message}` };
  }
}
function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function getVehicleCache() {
  return vehicleCache;
}
var vehicleCache, messagesByVehicle, lastValidMessageByVehicle, messagesBySpy, lastValidMessageBySpy, positionHistory, VEHICLE_MSG_MAP_MAX, SPY_MSG_MAP_MAX, POSITION_HISTORY_MAP_MAX, POSITION_HISTORY_TTL_MS, _g, BASE_URL, VEHICLE_CACHE_TTL, API_INTERVALS, FETCH_ALL_MIN_INTERVAL, CACHE_TTL, espelhamentoSeqId;
var init_truckscontrol = __esm({
  "server/truckscontrol.ts"() {
    "use strict";
    vehicleCache = [];
    messagesByVehicle = /* @__PURE__ */ new Map();
    lastValidMessageByVehicle = /* @__PURE__ */ new Map();
    messagesBySpy = /* @__PURE__ */ new Map();
    lastValidMessageBySpy = /* @__PURE__ */ new Map();
    positionHistory = /* @__PURE__ */ new Map();
    VEHICLE_MSG_MAP_MAX = 500;
    SPY_MSG_MAP_MAX = 500;
    POSITION_HISTORY_MAP_MAX = 500;
    POSITION_HISTORY_TTL_MS = 60 * 60 * 1e3;
    _g = globalThis;
    if (_g.__trucks_sweep_interval) clearInterval(_g.__trucks_sweep_interval);
    _g.__trucks_sweep_interval = setInterval(() => {
      try {
        const cutoff = Date.now() - POSITION_HISTORY_TTL_MS;
        for (const [k, hist] of positionHistory) {
          const last = hist[hist.length - 1];
          if (!last || last.timestamp < cutoff) positionHistory.delete(k);
        }
        pruneLRU(positionHistory, POSITION_HISTORY_MAP_MAX);
        pruneLRU(messagesByVehicle, VEHICLE_MSG_MAP_MAX);
        pruneLRU(lastValidMessageByVehicle, VEHICLE_MSG_MAP_MAX);
        pruneLRU(messagesBySpy, SPY_MSG_MAP_MAX);
        pruneLRU(lastValidMessageBySpy, SPY_MSG_MAP_MAX);
      } catch (_e) {
      }
    }, 10 * 60 * 1e3);
    _g.__trucks_sweep_interval.unref?.();
    BASE_URL = "https://webservice.newrastreamentoonline.com.br/";
    VEHICLE_CACHE_TTL = 5 * 60 * 1e3;
    API_INTERVALS = {
      RequestVeiculo: 5 * 60 * 1e3,
      RequestMensagemCB: 5 * 60 * 1e3,
      RequestSpy: 5 * 60 * 1e3,
      RequestMensagemSpy: 30 * 1e3,
      RequestVeiculoEspelhado: 5 * 60 * 1e3,
      RequestDadosVeiculo: 30 * 1e3
    };
    FETCH_ALL_MIN_INTERVAL = 5 * 60 * 1e3;
    CACHE_TTL = 5 * 60 * 1e3;
    espelhamentoSeqId = Date.now();
  }
});

// server/billing-calc.ts
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
async function getHorasElapsedFromDB(osId) {
  try {
    const { data, error } = await supabaseAdmin.rpc("calc_mission_elapsed_hours", { p_os_id: osId });
    if (error) throw error;
    return Math.max(0, Number(data) || 0);
  } catch (e) {
    console.error(`[calc] RPC calc_mission_elapsed_hours failed for OS ${osId}:`, e.message);
    return 0;
  }
}
function calcHorasElapsedLocal(missionStartedAt, completedDate, scheduledDate) {
  if (!missionStartedAt) return 0;
  const parseDate = (v) => {
    const s = String(v);
    return new Date(s.includes("Z") || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + "Z");
  };
  const realStart = parseDate(missionStartedAt);
  const start = scheduledDate ? (() => {
    const sched = parseDate(scheduledDate);
    return realStart.getTime() < sched.getTime() ? realStart : sched;
  })() : realStart;
  const end = completedDate ? parseDate(completedDate) : /* @__PURE__ */ new Date();
  const diffMs = end.getTime() - start.getTime();
  const diffMinutes = Math.floor(diffMs / (1e3 * 60));
  return Math.max(0, diffMinutes / 60);
}
function extractKmFromText(text) {
  if (!text) return null;
  const match = text.match(/(\d+)\s*km/i);
  if (match) return parseInt(match[1], 10);
  return null;
}
function calcularFaturamentoLive(params) {
  const { horasMissao, kmInicial, kmFinal, contrato, kmRota } = params;
  const n2 = (v) => Number(v) || 0;
  const franquiaHoras = n2(contrato.franquia_horas);
  const franquiaKm = n2(contrato.franquia_km) || n2(contrato.franquia_minima_km);
  const valorAcionamento = n2(contrato.valor_acionamento);
  const hasAcionamento = valorAcionamento > 0;
  const valorKmExtra = n2(contrato.valor_km_extra) || n2(contrato.valor_km_carregado);
  const valorHoraExtra = n2(contrato.valor_hora_extra) || n2(contrato.valor_hora_estadia);
  const kmOdometro = Math.max(0, kmFinal - kmInicial);
  const kmRotaLimitado = kmRota && kmRota > 0 && kmOdometro > kmRota;
  let kmTotal = kmRotaLimitado ? kmRota : kmOdometro;
  let kmAbsurdoLimitado = false;
  if (!kmRotaLimitado && (!kmRota || kmRota <= 0) && horasMissao >= 1) {
    const tetoFisico = horasMissao * 140;
    if (kmTotal > tetoFisico) {
      kmTotal = tetoFisico;
      kmAbsurdoLimitado = true;
    }
  }
  const kmExcedente = Math.max(0, kmTotal - franquiaKm);
  let fatAcionamento = 0;
  let fatKm = 0;
  let fatHoraExtra = 0;
  let horasExcedentes = 0;
  if (hasAcionamento) {
    fatAcionamento = valorAcionamento;
    fatKm = kmExcedente * valorKmExtra;
    horasExcedentes = franquiaHoras > 0 ? Math.max(0, horasMissao - franquiaHoras) : 0;
    fatHoraExtra = horasExcedentes * valorHoraExtra;
  } else {
    const kmFaturado = Math.max(kmTotal, franquiaKm);
    fatKm = kmFaturado * n2(contrato.valor_km_carregado);
  }
  const fatTotal = fatAcionamento + fatKm + fatHoraExtra;
  const r = (v) => Math.round(v * 100) / 100;
  return {
    fat_acionamento: r(fatAcionamento),
    fat_km: r(fatKm),
    fat_hora_extra: r(fatHoraExtra),
    fat_total: r(fatTotal),
    horas_excedentes: r(horasExcedentes),
    km_total: kmTotal,
    km_excedente: r(kmExcedente),
    franquia_horas: franquiaHoras,
    franquia_km: franquiaKm,
    has_acionamento: hasAcionamento,
    km_rota_limitado: !!kmRotaLimitado,
    km_absurdo_limitado: kmAbsurdoLimitado
  };
}
function splitMissionCostsForBilling(mcs) {
  let despesas_pedagio = 0;
  let despesas_combustivel = 0;
  let despesas_outras = 0;
  let receitas_os = 0;
  const revenueItems = [];
  const n = (v) => Number(v) || 0;
  const r = (v) => Math.round(v * 100) / 100;
  for (const mc of mcs || []) {
    const amt = n(mc.amount);
    const isRevenue = (mc.cost_type ?? mc.costType) === "revenue";
    const catRaw = String(mc.category || "").trim().toLowerCase();
    const isPedagioExpenseCat = catRaw === "ped\xE1gio" || catRaw === "pedagio";
    const isCombustivel = catRaw.includes("combust\xEDvel") || catRaw.includes("combustivel") || catRaw.includes("abastecimento");
    if (isRevenue) {
      if (isPedagioExpenseCat) continue;
      receitas_os += amt;
      revenueItems.push({
        id: mc.id,
        description: mc.description || mc.category || "Receita OS",
        amount: amt,
        category: mc.category || "Outros"
      });
    } else {
      if (isPedagioExpenseCat) despesas_pedagio += amt;
      else if (isCombustivel) despesas_combustivel += amt;
      else despesas_outras += amt;
    }
  }
  return {
    despesas_pedagio: r(despesas_pedagio),
    despesas_combustivel: r(despesas_combustivel),
    despesas_outras: r(despesas_outras),
    receitas_os: r(receitas_os),
    revenueItems
  };
}
function shouldSkipBillingHours(so, now = Date.now()) {
  const missionNotStartedYet = !so.mission_status || so.mission_status === "aguardando";
  const scheduledInFuture = (() => {
    if (!so.scheduled_date) return false;
    const s = String(so.scheduled_date);
    const sched = new Date(s.includes("Z") || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + "Z");
    return sched.getTime() > now;
  })();
  return missionNotStartedYet || so.status === "agendada" && scheduledInFuture;
}
function resolveContractForOs(so, contractMap, clientContractMap, defaultContract = DEFAULT_BILLING_CONTRACT) {
  if (so.escort_contract_id && contractMap.has(so.escort_contract_id)) {
    return contractMap.get(so.escort_contract_id);
  }
  if (so.client_id && clientContractMap.has(so.client_id)) {
    return clientContractMap.get(so.client_id);
  }
  return defaultContract;
}
function computeBillingPayloadForOs(input) {
  const { so, contrato, photos, mCosts, horasMissao, clientName, empName, emp2Name, vehPlate } = input;
  const now = input.nowDate ?? /* @__PURE__ */ new Date();
  const n = (v) => Number(v) || 0;
  const r = (v) => Math.round(v * 100) / 100;
  const toBRT = (d) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
  const kmChegadaPhoto = photos.find((p) => p.step === "km_chegada");
  const kmSaidaPhoto = photos.find((p) => p.step === "km_saida");
  const kmFinalPhoto = photos.find((p) => p.step === "km_final");
  const kmInicial = n(kmChegadaPhoto?.km_value) || n(kmSaidaPhoto?.km_value);
  const kmFinalVal = n(kmFinalPhoto?.km_value);
  const kmFinal = kmFinalVal > kmInicial ? kmFinalVal : kmInicial;
  const missionEndDate = so.completed_date ? new Date(so.completed_date) : now;
  const scheduledDate = so.scheduled_date ? new Date(so.scheduled_date) : null;
  const missionStartDate = so.mission_started_at ? new Date(so.mission_started_at) : null;
  const scheduledTime = scheduledDate ? toBRT(scheduledDate) : void 0;
  const startTime = missionStartDate ? toBRT(missionStartDate) : void 0;
  const endTime = toBRT(missionEndDate);
  const billingStartDate = missionStartDate || scheduledDate;
  const inicioConsiderado = billingStartDate ? toBRT(billingStartDate) : startTime || scheduledTime || "00:00";
  const km_total = kmFinal - kmInicial;
  const km_carregado = Math.max(0, km_total);
  const billing = calcularFaturamentoLive({ horasMissao, kmInicial, kmFinal, contrato });
  let { fat_acionamento, fat_km, fat_hora_extra, fat_total } = billing;
  const { km_excedente, has_acionamento: hasAcionamento } = billing;
  const franquiaKm = billing.franquia_km;
  const isNoturno = (() => {
    const checkH = (t) => {
      if (!t) return false;
      const h = parseInt(t.split(":")[0]);
      return h >= 22 || h < 5;
    };
    return checkH(inicioConsiderado) || checkH(endTime);
  })();
  if (isNoturno) {
    fat_total += (hasAcionamento ? fat_acionamento + fat_km : fat_km) * (n(contrato.adicional_noturno_km_pct) / 100);
  }
  const { despesas_pedagio, despesas_combustivel, despesas_outras, receitas_os } = splitMissionCostsForBilling(mCosts);
  fat_total += despesas_pedagio + receitas_os;
  const pag_vrp = n(contrato.vrp_base);
  const resultado_bruto = fat_total - pag_vrp;
  return {
    service_order_id: so.id,
    client_id: so.client_id,
    client_name: clientName || "--",
    contract_id: contrato.id || null,
    km_inicial: n(kmInicial),
    km_final: n(kmFinal),
    km_vazio: 0,
    km_carregado: n(km_carregado),
    km_total: n(km_total),
    km_faturado: n(Math.max(km_carregado, franquiaKm)),
    km_franquia: n(franquiaKm),
    km_excedente: n(km_excedente),
    horario_agendado: scheduledTime || null,
    horario_inicio: startTime || null,
    horario_fim: endTime || null,
    horario_inicio_considerado: inicioConsiderado,
    horas_missao: r(horasMissao),
    horas_trabalhadas: r(horasMissao),
    horas_estadia: 0,
    teve_pernoite: false,
    is_noturno: isNoturno,
    fat_acionamento: r(fat_acionamento),
    fat_km: r(fat_km),
    fat_hora_extra: r(fat_hora_extra),
    fat_total: r(fat_total),
    valor_franquia: hasAcionamento ? r(fat_acionamento) : r(Math.min(km_carregado, franquiaKm) * n(contrato.valor_km_carregado)),
    valor_km_extra: r(km_excedente * (hasAcionamento ? n(contrato.valor_km_extra) : n(contrato.valor_km_carregado))),
    pag_vrp: r(pag_vrp),
    pag_total: r(pag_vrp),
    resultado_bruto: r(resultado_bruto),
    resultado_liquido: r(resultado_bruto),
    margem_percentual: fat_total > 0 ? r(resultado_bruto / fat_total * 100) : 0,
    vigilante_id: so.assigned_employee_id,
    vigilante_name: empName || "--",
    vigilante2_id: so.assigned_employee_2_id || null,
    vigilante2_name: emp2Name || null,
    origem: so.origin || null,
    destino: so.destination || null,
    placa_viatura: vehPlate || null,
    placa_escoltado: so.escorted_vehicle_plate || null,
    motorista_escoltado: so.escorted_driver_name || null,
    despesas_pedagio: r(despesas_pedagio),
    despesas_combustivel: r(despesas_combustivel),
    despesas_outras: r(despesas_outras),
    receitas_os: r(receitas_os),
    data_missao: (() => {
      const a = so.mission_started_at ? new Date(so.mission_started_at).getTime() : Infinity;
      const b = so.scheduled_date ? new Date(so.scheduled_date).getTime() : Infinity;
      if (a === Infinity && b === Infinity) return now;
      return a <= b ? so.mission_started_at : so.scheduled_date;
    })(),
    status: "A_VERIFICAR",
    created_by: "CRON"
  };
}
var DEFAULT_BILLING_CONTRACT;
var init_billing_calc = __esm({
  "server/billing-calc.ts"() {
    "use strict";
    init_supabase();
    DEFAULT_BILLING_CONTRACT = {
      valor_km_carregado: 2.8,
      valor_km_vazio: 1.4,
      valor_km_extra: 2.4,
      franquia_minima_km: 50,
      franquia_km: 50,
      franquia_horas: 3,
      valor_hora_estadia: 50,
      valor_hora_extra: 110,
      valor_acionamento: 0,
      valor_diaria: 200,
      vrp_base: 150,
      adicional_noturno_vrp_pct: 20,
      adicional_noturno_km_pct: 15,
      adicional_periculosidade_pct: 30
    };
  }
});

// server/financial-snapshot.ts
function brtToday() {
  return (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function ymdAddDays(ymd, days) {
  const d = /* @__PURE__ */ new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function startOfWeekMonday(ymd) {
  const d = /* @__PURE__ */ new Date(ymd + "T12:00:00Z");
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
function startOfMonth(ymd) {
  return ymd.slice(0, 7) + "-01";
}
function endOfMonth(ymd) {
  const [y, m] = ymd.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}
function daysInMonth(ymd) {
  const [y, m] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function extractDateBRT(v) {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  try {
    return new Date(s).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  } catch {
    return null;
  }
}
function billingFat(b) {
  return Number(b?.fat_total) || 0;
}
function billingPag(b) {
  return Number(b?.pag_total) || (Number(b?.pag_vrp) || 0) + (Number(b?.pag_periculosidade) || 0) + (Number(b?.pag_adicional_noturno) || 0) + (Number(b?.pag_reembolsos) || 0);
}
function billingDesp(b) {
  return Number(b?.desp_total) || (Number(b?.desp_pedagio) || Number(b?.despesas_pedagio) || 0) + (Number(b?.desp_combustivel) || Number(b?.despesas_combustivel) || 0) + (Number(b?.desp_outras) || Number(b?.despesas_outras) || 0);
}
function dedupBillingsBySO(rows) {
  const map = /* @__PURE__ */ new Map();
  for (const b of rows) {
    const id = Number(b.service_order_id);
    if (!id) continue;
    const ex = map.get(id);
    if (!ex || new Date(b.created_at || 0) > new Date(ex.created_at || 0)) map.set(id, b);
  }
  return Array.from(map.values());
}
function sumBillingsFat(rows, orderById) {
  let total = 0;
  for (const b of rows) {
    const so = orderById.get(Number(b.service_order_id));
    if (so && isCancelledStatus(so.status)) continue;
    total += billingFat(b);
  }
  return total;
}
async function getDiretoriaSnapshot(targetDate) {
  const todayBRT = targetDate || brtToday();
  const todayLabel = (/* @__PURE__ */ new Date(todayBRT + "T12:00:00")).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
  const diaSemana = (/* @__PURE__ */ new Date(todayBRT + "T12:00:00")).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" });
  const todayStart = todayBRT + "T00:00:00";
  const todayEnd = todayBRT + "T23:59:59";
  const histStartYmd = ymdAddDays(todayBRT, -30);
  const histEndYmd = ymdAddDays(todayBRT, -1);
  const weekStartYmd = startOfWeekMonday(todayBRT);
  const weekEndYmd = ymdAddDays(weekStartYmd, 6);
  const monthStartYmd = startOfMonth(todayBRT);
  const monthEndYmd = endOfMonth(todayBRT);
  const [
    todayBillingsRes,
    weekBillingsRes,
    monthBillingsRes,
    histBillingsRes,
    transactionsRes,
    clientsRes,
    vehiclesRes,
    contractsRes,
    asaasBalance
  ] = await Promise.all([
    supabaseAdmin.from("escort_billings").select("*").gte("data_missao", todayStart).lte("data_missao", todayEnd),
    supabaseAdmin.from("escort_billings").select("*").gte("data_missao", weekStartYmd + "T00:00:00").lte("data_missao", weekEndYmd + "T23:59:59"),
    supabaseAdmin.from("escort_billings").select("*").gte("data_missao", monthStartYmd + "T00:00:00").lte("data_missao", monthEndYmd + "T23:59:59"),
    supabaseAdmin.from("escort_billings").select("km_total,pag_total,pag_vrp,pag_periculosidade,pag_adicional_noturno,pag_reembolsos,desp_total,desp_pedagio,despesas_pedagio,desp_combustivel,despesas_combustivel,desp_outras,despesas_outras").gte("data_missao", histStartYmd + "T00:00:00").lte("data_missao", histEndYmd + "T23:59:59"),
    supabaseAdmin.from("financial_transactions").select("*").or(`and(due_date.gte.${monthStartYmd},due_date.lte.${monthEndYmd}),and(payment_date.gte.${monthStartYmd},payment_date.lte.${monthEndYmd}),and(created_at.gte.${monthStartYmd}T00:00:00,created_at.lte.${monthEndYmd}T23:59:59)`),
    supabaseAdmin.from("clients").select("id, name, company_name"),
    supabaseAdmin.from("vehicles").select("*"),
    supabaseAdmin.from("escort_contracts").select("*"),
    getAsaasBalance()
  ]);
  const contractById = /* @__PURE__ */ new Map();
  const contractByClient = /* @__PURE__ */ new Map();
  for (const c of contractsRes.data || []) {
    contractById.set(c.id, c);
    if (c.status === "Ativo" && c.client_id) contractByClient.set(c.client_id, c);
  }
  const defaultContrato = { valor_km_carregado: 2.8, valor_km_vazio: 1.4, valor_km_extra: 2.4, franquia_minima_km: 50, franquia_km: 50, franquia_horas: 3, valor_hora_estadia: 50, valor_hora_extra: 110, valor_acionamento: 0 };
  const allOrders = await storage.getServiceOrders();
  const employees = await storage.getEmployees();
  const clientMap = /* @__PURE__ */ new Map();
  for (const c of clientsRes.data || []) {
    clientMap.set(c.id, c.company_name || c.name || `Cliente #${c.id}`);
  }
  const todayOrders = allOrders.filter((so) => {
    const sd = extractDateBRT(so.scheduledDate);
    const cd = extractDateBRT(so.completedDate);
    const ms = so.missionStartedAt ? extractDateBRT(so.missionStartedAt) : null;
    return sd === todayBRT || cd === todayBRT || ms === todayBRT;
  });
  const escoltaOrders = todayOrders.filter((so) => so.type === "escolta");
  const concluidas = todayOrders.filter((so) => so.status === "concluida" || so.status === "conclu\xEDda" || so.missionStatus === "encerrada");
  const emAndamento = todayOrders.filter((so) => so.status === "em_andamento");
  const canceladas = todayOrders.filter((so) => isCancelledStatus(so.status));
  const todayBillings = dedupBillingsBySO(todayBillingsRes.data || []);
  const billingBySO = /* @__PURE__ */ new Map();
  for (const b of todayBillings) billingBySO.set(Number(b.service_order_id), b);
  const orderById = /* @__PURE__ */ new Map();
  for (const so of todayOrders) orderById.set(so.id, so);
  let fatBilling = 0;
  let custoEscolta = 0;
  let kmTotal = 0;
  let despPedagio = 0;
  let despCombustivel = 0;
  for (const b of todayBillings) {
    const so = orderById.get(Number(b.service_order_id));
    if (so && isCancelledStatus(so.status)) continue;
    fatBilling += billingFat(b);
    custoEscolta += billingPag(b) + billingDesp(b);
    kmTotal += Number(b.km_total) || 0;
    despPedagio += Number(b.desp_pedagio) || Number(b.despesas_pedagio) || 0;
    despCombustivel += Number(b.desp_combustivel) || Number(b.despesas_combustivel) || 0;
  }
  for (const so of todayOrders) {
    if (billingBySO.has(so.id)) continue;
    if (isCancelledStatus(so.status)) continue;
    const soFat = Number(so.fat_calculado) || 0;
    const soCusto = Number(so.custo_total_alocado) || 0;
    if (soFat > 0) fatBilling += soFat;
    custoEscolta += soCusto;
    kmTotal += Number(so.km_total_calculado) || 0;
  }
  let fatExtraLive = 0;
  const ordensOut = [];
  for (const so of todayOrders) {
    const billing = billingBySO.get(so.id);
    let fat = billing ? billingFat(billing) : Number(so.fat_calculado) || 0;
    let custo = Number(so.custo_total_alocado) || 0;
    if (billing) {
      const bPag = billingPag(billing);
      const bDesp = billingDesp(billing);
      if (bPag + bDesp > 0) custo = bPag + bDesp;
    }
    if (isCancelledStatus(so.status)) {
      fat = 0;
      custo = 0;
    }
    let horasMissao = 0;
    let fatLive = fat;
    let isLive = false;
    const isFinalized = so.status === "concluida" || so.status === "conclu\xEDda" || so.missionStatus === "encerrada";
    if (!isCancelledStatus(so.status) && !isFinalized && so.missionStartedAt) {
      horasMissao = calcHorasElapsedLocal(so.missionStartedAt, void 0, so.scheduledDate);
      if (horasMissao > 0) {
        const contrato = so.escortContractId && contractById.has(so.escortContractId) ? contractById.get(so.escortContractId) : so.clientId && contractByClient.has(so.clientId) ? contractByClient.get(so.clientId) : defaultContrato;
        const kmInicial = Number(billing?.km_inicial) || 0;
        const kmFinal = Number(billing?.km_final) || kmInicial;
        let kmRota = extractKmFromText(so.destination) || extractKmFromText(so.route) || void 0;
        if (!kmRota && so.originLat && so.originLng && so.destinationLat && so.destinationLng) {
          const haversineKm = haversineDistanceKm(
            Number(so.originLat),
            Number(so.originLng),
            Number(so.destinationLat),
            Number(so.destinationLng)
          );
          kmRota = Math.round(haversineKm * 1.4);
          if (so.pedagioIdaVolta) kmRota *= 2;
        }
        const liveCalc = calcularFaturamentoLive({ horasMissao, kmInicial, kmFinal, contrato, kmRota });
        const baseFat = billing ? billingFat(billing) : 0;
        const delta = Math.max(0, liveCalc.fat_total - baseFat);
        if (delta > 0) {
          fatLive = fat + delta;
          fatExtraLive += delta;
          isLive = true;
        }
      }
    }
    ordensOut.push({
      id: so.id,
      osNumber: so.osNumber || "-",
      clientName: billing?.client_name || clientMap.get(so.clientId) || "-",
      status: so.status,
      fat,
      fatLive,
      custo,
      kmTotal: Number(billing?.km_total) || Number(so.km_total_calculado) || 0,
      horasMissao,
      isLive
    });
  }
  const fatLiveTotal = fatBilling + fatExtraLive;
  const allTx = transactionsRes.data || [];
  const effectiveTxDate = (t) => {
    if (t.payment_date) return String(t.payment_date).slice(0, 10);
    if (t.due_date) return String(t.due_date).slice(0, 10);
    return extractDateBRT(t.created_at);
  };
  const monthTx = allTx.filter((t) => {
    const eff = effectiveTxDate(t);
    return eff && eff >= monthStartYmd && eff <= monthEndYmd;
  });
  const todayTx = monthTx.filter((t) => effectiveTxDate(t) === todayBRT);
  let despesasAvulsas = 0;
  let receitasAvulsas = 0;
  for (const t of todayTx) {
    if (AUTO_ORIGINS.has(String(t.origin_type || ""))) continue;
    const amt = Math.abs(Number(t.amount) || 0);
    if (t.type === "EXPENSE" || t.type === "despesa") despesasAvulsas += amt;
    else if (t.type === "INCOME" || t.type === "receita") receitasAvulsas += amt;
  }
  const custoTotal = custoEscolta + despesasAvulsas;
  const resultado = fatLiveTotal + receitasAvulsas - custoTotal;
  const denomMargem = fatLiveTotal + receitasAvulsas;
  const margem = denomMargem > 0 ? resultado / denomMargem * 100 : 0;
  let histKmTotal = 0;
  let histCustoTotal = 0;
  for (const b of histBillingsRes.data || []) {
    const km = Number(b.km_total) || 0;
    if (km <= 0) continue;
    histKmTotal += km;
    histCustoTotal += billingPag(b) + billingDesp(b);
  }
  const custoPorKmHist = histKmTotal > 0 ? histCustoTotal / histKmTotal : 0;
  const custoPorKmHoje = kmTotal > 0 ? custoEscolta / kmTotal : 0;
  const variacaoPct = custoPorKmHist > 0 && custoPorKmHoje > 0 ? (custoPorKmHoje - custoPorKmHist) / custoPorKmHist * 100 : 0;
  let analiseStatus;
  if (kmTotal <= 0 || custoPorKmHist <= 0) {
    analiseStatus = { color: "#475569", bg: "#f1f5f9", label: "Sem base de compara\xE7\xE3o", msg: "Ainda n\xE3o h\xE1 hist\xF3rico suficiente para avaliar." };
  } else if (variacaoPct <= 10) {
    analiseStatus = { color: "#15803d", bg: "#dcfce7", label: "Dentro do esperado", msg: "Custo por km est\xE1 alinhado com a m\xE9dia dos \xFAltimos 30 dias." };
  } else if (variacaoPct <= 25) {
    analiseStatus = { color: "#a16207", bg: "#fef3c7", label: "Aten\xE7\xE3o", msg: `Custo por km ${variacaoPct.toFixed(1)}% acima da m\xE9dia hist\xF3rica. Revisar combust\xEDvel, ped\xE1gio e horas extras.` };
  } else {
    analiseStatus = { color: "#b91c1c", bg: "#fee2e2", label: "Acima do padr\xE3o", msg: `Custo por km ${variacaoPct.toFixed(1)}% acima da m\xE9dia hist\xF3rica. Opera\xE7\xE3o cara \u2014 investigar despesas e roteiriza\xE7\xE3o.` };
  }
  const activeVehicles = (vehiclesRes.data || []).filter((v) => isActiveVehicle({ status: v.status, trackerId: v.tracker_id, truckscontrolIdentifier: v.truckscontrol_identifier }));
  const activeCount = activeVehicles.length;
  const dim = daysInMonth(todayBRT);
  const metaDiaria = META_DIARIA_VIATURA * activeCount;
  const calendarDaysInclusive = (startYmd, endYmd) => {
    const s = (/* @__PURE__ */ new Date(startYmd + "T12:00:00Z")).getTime();
    const e = (/* @__PURE__ */ new Date(endYmd + "T12:00:00Z")).getTime();
    return Math.max(1, Math.round((e - s) / (1e3 * 60 * 60 * 24)) + 1);
  };
  const metaSemanal = metaDiaria * calendarDaysInclusive(weekStartYmd, weekEndYmd);
  const metaMensal = metaDiaria * calendarDaysInclusive(monthStartYmd, monthEndYmd);
  const todayInWeek = todayBRT >= weekStartYmd && todayBRT <= weekEndYmd;
  const todayInMonth = todayBRT >= monthStartYmd && todayBRT <= monthEndYmd;
  const weekDeduped = dedupBillingsBySO(weekBillingsRes.data || []);
  const monthDeduped = dedupBillingsBySO(monthBillingsRes.data || []);
  const fatSemana = sumBillingsFat(weekDeduped, orderById) + (todayInWeek ? fatExtraLive : 0);
  const fatMes = sumBillingsFat(monthDeduped, orderById) + (todayInMonth ? fatExtraLive : 0);
  const pctMeta = metaDiaria > 0 ? fatLiveTotal / metaDiaria * 100 : 0;
  const pctSemana = metaSemanal > 0 ? fatSemana / metaSemanal * 100 : 0;
  const pctMes = metaMensal > 0 ? fatMes / metaMensal * 100 : 0;
  const catMap = /* @__PURE__ */ new Map();
  for (const t of monthTx) {
    if (t.type !== "EXPENSE" && t.type !== "despesa") continue;
    const amt = Math.abs(Number(t.amount) || 0);
    if (amt <= 0) continue;
    const cat = String(t.category_name || t.category || "Outros").trim() || "Outros";
    catMap.set(cat, (catMap.get(cat) || 0) + amt);
  }
  const totalGastosMes = Array.from(catMap.values()).reduce((a, b) => a + b, 0);
  const porCategoria = Array.from(catMap.entries()).map(([categoria, valor]) => ({ categoria, valor, pct: totalGastosMes > 0 ? valor / totalGastosMes * 100 : 0 })).sort((a, b) => b.valor - a.valor);
  const agentesAtivos = employees.filter((e) => e.status === "ativo").length;
  return {
    date: todayBRT,
    diaSemana,
    dataLabel: todayLabel,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    asaas: asaasBalance,
    meta: {
      diariaPorViatura: META_DIARIA_VIATURA,
      viaturasAtivas: activeCount,
      diaria: metaDiaria,
      semanal: metaSemanal,
      mensal: metaMensal,
      diasNoMes: dim
    },
    dia: {
      fatBilling,
      fatLive: fatLiveTotal,
      fatExtraLive,
      receitasAvulsas,
      despesasAvulsas,
      custoEscolta,
      custoTotal,
      resultado,
      margem,
      kmTotal,
      despPedagio,
      despCombustivel,
      metaDiaria,
      pctMeta
    },
    semana: { inicio: weekStartYmd, fim: weekEndYmd, fat: fatSemana, meta: metaSemanal, pct: pctSemana },
    mes: { inicio: monthStartYmd, fim: monthEndYmd, fat: fatMes, meta: metaMensal, pct: pctMes },
    gastosMes: { total: totalGastosMes, porCategoria },
    analiseCustoKm: {
      custoPorKmHoje,
      custoPorKmHist,
      variacaoPct,
      histKmTotal,
      histCustoTotal,
      status: analiseStatus
    },
    ops: {
      totalOS: todayOrders.length,
      escoltas: escoltaOrders.length,
      concluidas: concluidas.length,
      emAndamento: emAndamento.length,
      canceladas: canceladas.length,
      agentesAtivos
    },
    ordens: ordensOut
  };
}
var META_DIARIA_VIATURA, isActiveVehicle, AUTO_ORIGINS, isCancelledStatus;
var init_financial_snapshot = __esm({
  "server/financial-snapshot.ts"() {
    "use strict";
    init_supabase();
    init_storage();
    init_asaas();
    init_billing_calc();
    META_DIARIA_VIATURA = 1800;
    isActiveVehicle = (v) => v.status !== "inativo" && !!(v.trackerId || v.truckscontrolIdentifier);
    AUTO_ORIGINS = /* @__PURE__ */ new Set(["mission_cost", "payroll", "fueling", "escort_billing"]);
    isCancelledStatus = (s) => s === "recusada" || s === "cancelada";
  }
});

// server/platform.ts
function isVercel() {
  return process.env.VERCEL === "1";
}
function shouldRunBackgroundJobs() {
  return !isVercel();
}
var init_platform = __esm({
  "server/platform.ts"() {
    "use strict";
  }
});

// server/cron.ts
var cron_exports = {};
__export(cron_exports, {
  checkMetaAndNotify: () => checkMetaAndNotify,
  executeBillingCron: () => executeBillingCron,
  initCronJobs: () => initCronJobs,
  sendComprovantesPendentesEmail: () => sendComprovantesPendentesEmail,
  sendDailySummaryEmail: () => sendDailySummaryEmail,
  sendPayslipReminderToDiretoria: () => sendPayslipReminderToDiretoria,
  sendRodizioAlerts: () => sendRodizioAlerts,
  sendVencimentosDoDiaEmail: () => sendVencimentosDoDiaEmail
});
import cron from "node-cron";
import nodemailer5 from "nodemailer";
async function sendRodizioAlerts() {
  const now = /* @__PURE__ */ new Date();
  const brHour = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric" }).format(now);
  const brDay = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(now);
  const dayOfWeekMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 };
  const dayNum = dayOfWeekMap[brDay];
  if (!dayNum) {
    log(`CRON Rod\xEDzio: Hoje \xE9 ${brDay} \u2014 sem rod\xEDzio (s\xE1bado/domingo)`, "cron");
    return;
  }
  const digitsToday = RODIZIO_MAP[dayNum];
  if (!digitsToday) return;
  log(`CRON Rod\xEDzio: Verificando ve\xEDculos com final ${digitsToday.join(", ")} (${brDay}, ${brHour}h BRT)`, "cron");
  const tcVehicles = getVehicleCache();
  if (tcVehicles.length === 0) {
    log("CRON Rod\xEDzio: Cache de ve\xEDculos TrucksControl vazio, pulando", "cron");
    return;
  }
  let sent = 0;
  for (const v of tcVehicles) {
    const plate = v.placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (plate.length < 1) continue;
    const lastChar = plate.charAt(plate.length - 1);
    const lastDigit = parseInt(lastChar, 10);
    if (isNaN(lastDigit)) continue;
    if (digitsToday.includes(lastDigit)) {
      try {
        const result = await sendCommand(v.veiID, "mensagem_texto", "ATENCAO, RODIZIO DESSE VEICULO HOJE");
        log(`CRON Rod\xEDzio: Mensagem enviada para ${v.placa} (veiID=${v.veiID}): ${result.message}`, "cron");
        sent++;
      } catch (err) {
        log(`CRON Rod\xEDzio: Erro ao enviar para ${v.placa}: ${err.message}`, "cron");
      }
    }
  }
  log(`CRON Rod\xEDzio: ${sent} mensagem(ns) enviada(s)`, "cron");
}
async function checkMetaAndNotify() {
  try {
    const now = /* @__PURE__ */ new Date();
    const brDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
    const [brYear, brMonth] = brDate.split("-");
    const monthKey = `meta_atingida_${brYear}-${brMonth}`;
    const { data: already } = await supabaseAdmin.from("system_settings").select("id").eq("key", monthKey);
    if (already?.length) return;
    const { data: vehicles } = await supabaseAdmin.from("vehicles").select("*");
    const activeCount = (vehicles || []).filter(isActiveVehicle2).length;
    if (activeCount === 0) return;
    const daysInMonth2 = new Date(Number(brYear), Number(brMonth), 0).getDate();
    const metaMensal = META_DIARIA_VIATURA2 * activeCount * daysInMonth2;
    const monthStart = `${brYear}-${brMonth}-01T00:00:00`;
    const monthEnd = `${brYear}-${brMonth}-${String(daysInMonth2).padStart(2, "0")}T23:59:59`;
    const { data: billings } = await supabaseAdmin.from("escort_billings").select("total_value, created_at").gte("created_at", monthStart).lte("created_at", monthEnd);
    const totalFat = (billings || []).reduce((sum, b) => sum + (Number(b.total_value) || 0), 0);
    if (totalFat < metaMensal) return;
    const pct = (totalFat / metaMensal * 100).toFixed(1);
    const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const transporter = getCronMailTransporter();
    if (!transporter) {
      log(`CRON Meta: Meta atingida (${pct}%) mas SMTP n\xE3o configurado`, "cron");
      return;
    }
    const monthLabel = new Date(Number(brYear), Number(brMonth) - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    await transporter.sendMail({
      from: process.env.SMTP_USER || process.env.EMAIL_USER,
      to: "thiago@grupotmseg.com.br",
      subject: `\u{1F3AF} Meta Atingida \u2014 ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#059669;color:#fff;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="margin:0;font-size:24px;">\u{1F3AF} META ATINGIDA!</h1>
            <p style="margin:5px 0 0;font-size:14px;opacity:0.9;">${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</p>
          </div>
          <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Faturamento Acumulado</td>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:bold;text-align:right;color:#059669;font-size:18px;">${fmt(totalFat)}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Meta do M\xEAs</td>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:bold;text-align:right;">${fmt(metaMensal)}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Atingimento</td>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:bold;text-align:right;color:#059669;">${pct}%</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#6b7280;">Viaturas Ativas</td>
                <td style="padding:10px 0;font-weight:bold;text-align:right;">${activeCount}</td>
              </tr>
            </table>
            <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">Torres Vigil\xE2ncia Patrimonial \u2014 Sistema de Gest\xE3o</p>
          </div>
        </div>
      `
    });
    await supabaseAdmin.from("system_settings").insert({ key: monthKey, value: `${totalFat}` });
    log(`CRON Meta: \u2705 Meta atingida! ${fmt(totalFat)} / ${fmt(metaMensal)} (${pct}%) \u2014 e-mail enviado`, "cron");
  } catch (err) {
    log(`CRON Meta: Erro ao verificar meta: ${err.message}`, "cron");
  }
}
function initCronJobs() {
  if (!shouldRunBackgroundJobs()) return;
  const fire = (bucket) => () => {
    runCronBucket(bucket).catch((e) => log(`CRON bucket ${bucket}: ${e?.message}`, "cron"));
  };
  cron.schedule("* * * * *", fire("minute"));
  cron.schedule("*/3 * * * *", fire("three-min"));
  cron.schedule("*/5 * * * *", fire("five-min"));
  cron.schedule("*/10 * * * *", fire("ten-min"));
  cron.schedule("*/15 * * * *", fire("fifteen-min"));
  cron.schedule("*/30 * * * *", fire("thirty-min"));
  log("CRON: buckets ativos (minute, three-min, five-min, ten-min, fifteen-min, thirty-min) + jobs di\xE1rios BRT via minute", "cron");
}
async function sendPayslipReminderToDiretoria(year, month) {
  let refYear = year, refMonth = month - 1;
  if (refMonth === 0) {
    refMonth = 12;
    refYear -= 1;
  }
  const { data: emps } = await supabaseAdmin.from("employees").select("id, name, role, status, matricula").eq("status", "ativo");
  const employees = emps || [];
  if (employees.length === 0) {
    log(`CRON LembreteHolerite: Nenhum funcion\xE1rio ativo`, "cron");
    return;
  }
  const { data: psRows } = await supabaseAdmin.from("employee_payslips").select("id, employee_id, assinatura_status").eq("year", refYear).eq("month", refMonth);
  const psByEmp = /* @__PURE__ */ new Map();
  for (const r of psRows || []) psByEmp.set(r.employee_id, r);
  const semHolerite = [];
  const naoAssinados = [];
  for (const e of employees) {
    const ps = psByEmp.get(e.id);
    if (!ps) semHolerite.push(e);
    else if (ps.assinatura_status !== "assinado") naoAssinados.push({ ...e, payslipId: ps.id });
  }
  if (semHolerite.length === 0 && naoAssinados.length === 0) {
    log(`CRON LembreteHolerite: Tudo em dia para ${MONTHS_PT[refMonth - 1]}/${refYear}`, "cron");
    return;
  }
  const transporter = getCronMailTransporter();
  if (!transporter) {
    log(`CRON LembreteHolerite: Pend\xEAncias encontradas (${semHolerite.length} sem holerite, ${naoAssinados.length} sem assinatura) mas SMTP n\xE3o configurado`, "cron");
    return;
  }
  const recipients = getDiretoriaRecipients();
  if (recipients.length === 0) {
    log(`CRON LembreteHolerite: Sem destinat\xE1rios da Diretoria configurados`, "cron");
    return;
  }
  const monthLabel = `${MONTHS_PT[refMonth - 1]}/${refYear}`;
  const row = (e) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${e.matricula || "\u2014"}</td><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${e.name}</td><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#64748b;">${e.role || "\u2014"}</td></tr>`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:20px;">
      <div style="background:#1e293b;color:#fff;padding:18px;border-radius:10px 10px 0 0;">
        <h1 style="margin:0;font-size:20px;">Lembrete \u2014 Holerites ${monthLabel}</h1>
        <p style="margin:6px 0 0;font-size:13px;opacity:0.85;">Hoje \xE9 o 5\xBA dia \xFAtil. Pend\xEAncias detectadas:</p>
      </div>
      <div style="background:#f9fafb;padding:18px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;">
        ${semHolerite.length > 0 ? `
          <h2 style="margin:0 0 8px;color:#b91c1c;font-size:15px;">Sem holerite emitido (${semHolerite.length})</h2>
          <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:16px;">
            <thead><tr style="background:#fef2f2;"><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#7f1d1d;">Matr\xEDcula</th><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#7f1d1d;">Funcion\xE1rio</th><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#7f1d1d;">Cargo</th></tr></thead>
            <tbody>${semHolerite.map(row).join("")}</tbody>
          </table>
        ` : ""}
        ${naoAssinados.length > 0 ? `
          <h2 style="margin:0 0 8px;color:#a16207;font-size:15px;">Holerite emitido mas pendente de assinatura (${naoAssinados.length})</h2>
          <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
            <thead><tr style="background:#fef3c7;"><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#78350f;">Matr\xEDcula</th><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#78350f;">Funcion\xE1rio</th><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#78350f;">Cargo</th></tr></thead>
            <tbody>${naoAssinados.map(row).join("")}</tbody>
          </table>
        ` : ""}
        <p style="margin-top:16px;font-size:11px;color:#64748b;">Lembrete autom\xE1tico disparado pelo sistema \xE0s 09:00 BRT do 5\xBA dia \xFAtil. Acesse Gest\xE3o de Holerites para emitir/conferir.</p>
      </div>
    </div>`;
  await transporter.sendMail({
    from: process.env.SMTP_USER || process.env.EMAIL_USER,
    to: recipients.join(","),
    bcc: process.env.SMTP_BCC ? process.env.SMTP_BCC.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : void 0,
    subject: `Lembrete \u2014 Holerites ${monthLabel}: ${semHolerite.length + naoAssinados.length} pend\xEAncia(s)`,
    html
  });
  log(`CRON LembreteHolerite: E-mail enviado \u2014 ${semHolerite.length} sem holerite, ${naoAssinados.length} sem assinatura (ref. ${monthLabel})`, "cron");
}
async function sendComprovantesPendentesEmail() {
  try {
    const MISSION_CATEGORIES = ["CUSTOS DE MISS\xC3O", "COMBUST\xCDVEL", "CUSTOS DE MISSAO", "COMBUSTIVEL"];
    const { data: pagosSemCompRaw } = await supabaseAdmin.from("financial_transactions").select("id, description, amount, payment_date, entity_name, created_by, solicitado_por, category_name, origin_type").eq("type", "EXPENSE").eq("status", "PAID").is("comprovante_url", null).or("origin_type.is.null,origin_type.eq.manual").order("payment_date", { ascending: true }).limit(200);
    const pagosSemComp = (pagosSemCompRaw || []).filter(
      (t) => !MISSION_CATEGORIES.includes(String(t.category_name || "").toUpperCase())
    );
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString();
    const { data: aguardando } = await supabaseAdmin.from("financial_transactions").select("id, description, amount, due_date, entity_name, solicitado_por, created_at").eq("status", "AGUARDANDO_APROVACAO").lt("created_at", cutoff).order("created_at", { ascending: true }).limit(200);
    const semComp = pagosSemComp || [];
    const pendApro = aguardando || [];
    if (semComp.length === 0 && pendApro.length === 0) return;
    const transporter = getCronMailTransporter();
    if (!transporter) {
      log(`CRON Comprovantes: ${semComp.length} pendentes / ${pendApro.length} aguardando \u2014 SMTP n\xE3o configurado`, "cron");
      return;
    }
    const recipients = await getAprovacaoRecipients();
    if (recipients.length === 0) return;
    const fmtMoney = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const fmtDate = (d) => d ? (/* @__PURE__ */ new Date(d + "T12:00:00")).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "\u2014";
    const totalSemComp = semComp.reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalAprov = pendApro.reduce((s, t) => s + Number(t.amount || 0), 0);
    const rowsSem = semComp.slice(0, 50).map(
      (t) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${fmtDate(t.payment_date)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${(t.description || "").toUpperCase()}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${(t.entity_name || "\u2014").toUpperCase()}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;">${fmtMoney(Number(t.amount))}</td></tr>`
    ).join("");
    const rowsApro = pendApro.slice(0, 50).map(
      (t) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${fmtDate(t.due_date)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${(t.description || "").toUpperCase()}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${(t.entity_name || "\u2014").toUpperCase()}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${t.solicitado_por || "\u2014"}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;">${fmtMoney(Number(t.amount))}</td></tr>`
    ).join("");
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:20px;color:#111;">
        <h2 style="margin:0 0 4px;">Lembrete Financeiro \u2014 ${(/* @__PURE__ */ new Date()).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</h2>
        <p style="margin:0 0 16px;color:#555;font-size:13px;">Torres Vigil\xE2ncia Patrimonial \u2014 Pend\xEAncias de Contas a Pagar</p>

        ${pendApro.length > 0 ? `
        <h3 style="background:#fde68a;color:#92400e;padding:8px 12px;border-radius:6px;margin:16px 0 8px;">Aguardando Aprova\xE7\xE3o Diretoria \u2014 ${pendApro.length} (${fmtMoney(totalAprov)})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f3f4f6;"><th style="padding:6px 8px;text-align:left;">Vencimento</th><th style="padding:6px 8px;text-align:left;">Descri\xE7\xE3o</th><th style="padding:6px 8px;text-align:left;">Favorecido</th><th style="padding:6px 8px;text-align:left;">Solicitante</th><th style="padding:6px 8px;text-align:right;">Valor</th></tr></thead>
          <tbody>${rowsApro}</tbody>
        </table>` : ""}

        ${semComp.length > 0 ? `
        <h3 style="background:#fecaca;color:#991b1b;padding:8px 12px;border-radius:6px;margin:24px 0 8px;">Pagamentos Sem Comprovante Anexado \u2014 ${semComp.length} (${fmtMoney(totalSemComp)})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f3f4f6;"><th style="padding:6px 8px;text-align:left;">Pagamento</th><th style="padding:6px 8px;text-align:left;">Descri\xE7\xE3o</th><th style="padding:6px 8px;text-align:left;">Favorecido</th><th style="padding:6px 8px;text-align:right;">Valor</th></tr></thead>
          <tbody>${rowsSem}</tbody>
        </table>
        <p style="margin:12px 0 0;font-size:11px;color:#666;">Anexe o comprovante em <strong>Financeiro &rarr; Contas a Pagar</strong>.</p>` : ""}

        <p style="margin:24px 0 0;font-size:10px;color:#999;text-align:center;">E-mail autom\xE1tico \u2014 Sistema de Gest\xE3o Torres</p>
      </div>`;
    const extraBcc = process.env.SMTP_BCC ? process.env.SMTP_BCC.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : [];
    const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.EMAIL_USER;
    await transporter.sendMail({
      from: fromAddr,
      to: fromAddr,
      bcc: Array.from(/* @__PURE__ */ new Set([...recipients, ...extraBcc])),
      subject: `Financeiro \u2014 ${pendApro.length} aguardando aprova\xE7\xE3o \xB7 ${semComp.length} sem comprovante`,
      html
    });
    log(`CRON Comprovantes: e-mail enviado \u2014 ${pendApro.length} aprova\xE7\xE3o \xB7 ${semComp.length} sem comprovante`, "cron");
  } catch (e) {
    log(`CRON Comprovantes: erro: ${e.message}`, "cron");
  }
}
function getCronMailTransporter() {
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer5.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false }
  });
}
function getDiretoriaRecipients() {
  const raw = process.env.DIRETORIA_EMAIL || DIRETORIA_EMAIL_DEFAULT;
  return raw.split(/[,;]+/).map((s) => s.trim()).filter((s) => /.+@.+\..+/.test(s));
}
async function getAprovacaoRecipients() {
  const REQUIRED = (process.env.APROVACAO_EMAILS_REQUIRED || "simone@torresseguranca.com.br,mickael@torresseguranca.com.br").split(",").map((s) => s.trim()).filter((e) => /.+@.+\..+/.test(e));
  const collected = new Set(REQUIRED);
  try {
    const { data } = await supabaseAdmin.from("users").select("name, email, role").or("role.eq.diretoria,name.ilike.%simone%,name.ilike.%mickael%");
    for (const u of data || []) {
      const e = String(u?.email || "").trim();
      if (/.+@.+\..+/.test(e)) collected.add(e);
    }
  } catch (e) {
  }
  return Array.from(collected);
}
function fmtBR2(v) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtBRTDateTime(iso) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function pctBarColor(pct) {
  if (pct >= 100) return "#16a34a";
  if (pct >= 70) return "#2563eb";
  if (pct >= 40) return "#a16207";
  return "#dc2626";
}
function statusBadgeHtml(status) {
  const map = {
    em_andamento: { bg: "#dbeafe", color: "#1d4ed8", label: "Em Andamento" },
    concluida: { bg: "#dcfce7", color: "#15803d", label: "Conclu\xEDda" },
    "conclu\xEDda": { bg: "#dcfce7", color: "#15803d", label: "Conclu\xEDda" },
    agendada: { bg: "#fef3c7", color: "#a16207", label: "Agendada" },
    aberta: { bg: "#e0e7ff", color: "#4338ca", label: "Aberta" },
    cancelada: { bg: "#fee2e2", color: "#b91c1c", label: "Cancelada" },
    recusada: { bg: "#fee2e2", color: "#b91c1c", label: "Recusada" }
  };
  const s = map[status] || { bg: "#f1f5f9", color: "#475569", label: status };
  return `<span style="display:inline-block;background:${s.bg};color:${s.color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap;">${s.label}</span>`;
}
function metaBlockHtml(label, periodo, fat, meta, pct) {
  const color = pctBarColor(pct);
  const barPct = Math.max(2, Math.min(100, pct));
  return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:10px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:12px;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${label}</td>
          <td style="text-align:right;font-size:12px;color:#64748b;">${periodo}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top:6px;">
            <span style="font-size:18px;font-weight:700;color:#1e293b;">R$ ${fmtBR2(fat)}</span>
            <span style="font-size:12px;color:#64748b;"> / R$ ${fmtBR2(meta)}</span>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top:8px;">
            <div style="background:#f1f5f9;border-radius:6px;height:8px;overflow:hidden;">
              <div style="background:${color};height:8px;width:${barPct}%;"></div>
            </div>
            <div style="text-align:right;font-size:12px;font-weight:700;color:${color};margin-top:4px;">${pct.toFixed(1)}% da meta</div>
          </td>
        </tr>
      </table>
    </div>`;
}
async function sendDailySummaryEmail(targetDate) {
  const transporter = getCronMailTransporter();
  if (!transporter) {
    return { success: false, message: "SMTP n\xE3o configurado" };
  }
  try {
    const snap = await getDiretoriaSnapshot(targetDate);
    const osCards = snap.ordens.slice(0, 30).map((o) => {
      const fatDisplay = o.isLive ? `R$ ${fmtBR2(o.fatLive)} <span style="font-size:10px;color:#2563eb;font-weight:600;">(ao vivo)</span>` : `R$ ${fmtBR2(o.fat)}`;
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;">
        <tr><td style="padding:10px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:13px;font-weight:700;color:#1e293b;">${o.osNumber}</td>
              <td style="text-align:right;">${statusBadgeHtml(o.status)}</td>
            </tr>
            <tr><td colspan="2" style="padding-top:6px;font-size:13px;color:#475569;line-height:1.35;">${o.clientName}</td></tr>
            <tr>
              <td style="padding-top:8px;font-size:12px;color:#64748b;">Faturamento<br><span style="font-size:14px;font-weight:700;color:#16a34a;">${fatDisplay}</span></td>
              <td style="padding-top:8px;text-align:right;font-size:12px;color:#64748b;">Custo<br><span style="font-size:14px;font-weight:700;color:#dc2626;">R$ ${fmtBR2(o.custo)}</span></td>
            </tr>
          </table>
        </td></tr>
      </table>`;
    }).join("");
    const margemColor = snap.dia.margem >= 30 ? "#16a34a" : snap.dia.margem >= 15 ? "#ca8a04" : "#dc2626";
    const asaasHtml = snap.asaas.connected ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-left:4px solid #059669;border-radius:8px;padding:14px 16px;margin-bottom:14px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#047857;font-weight:600;">Saldo Total \u2014 Asaas</div>
          <div style="font-size:24px;font-weight:700;color:#059669;margin-top:4px;">R$ ${fmtBR2(Number(snap.asaas.balance) || 0)}</div>
          <div style="font-size:11px;color:#047857;margin-top:6px;line-height:1.5;">
            Saldo atual: <strong>R$ ${fmtBR2(Number(snap.asaas.saldoAtual) || 0)}</strong>
            &nbsp;\xB7&nbsp; A receber: <strong>R$ ${fmtBR2(Number(snap.asaas.saldoAReceber) || 0)}</strong>
          </div>
        </div>` : `<div style="background:#fef3c7;border:1px solid #fde68a;border-left:4px solid #ca8a04;border-radius:8px;padding:14px 16px;margin-bottom:14px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#92400e;font-weight:600;">Saldo Asaas</div>
          <div style="font-size:13px;color:#92400e;margin-top:4px;">${snap.asaas.message || "Indispon\xEDvel"}</div>
        </div>`;
    const fmtPeriodo = (a, b) => {
      const f = (s) => (/* @__PURE__ */ new Date(s + "T12:00:00")).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      return `${f(a)} \u2192 ${f(b)}`;
    };
    const fatLiveBadge = snap.dia.fatExtraLive > 0 ? `<div style="font-size:11px;color:#2563eb;margin-top:4px;font-weight:600;">+ R$ ${fmtBR2(snap.dia.fatExtraLive)} ao vivo (HE em andamento)</div>` : "";
    const gastosCatRows = snap.gastosMes.porCategoria.slice(0, 8).map((g) => `
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#475569;border-bottom:1px solid #f1f5f9;">${g.categoria}</td>
        <td style="padding:8px 0;font-size:13px;font-weight:700;text-align:right;color:#dc2626;border-bottom:1px solid #f1f5f9;white-space:nowrap;">R$ ${fmtBR2(g.valor)}</td>
        <td style="padding:8px 0 8px 8px;font-size:11px;color:#64748b;text-align:right;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${g.pct.toFixed(1)}%</td>
      </tr>`).join("");
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    @media only screen and (max-width:600px){
      .container{width:100% !important;border-radius:0 !important;}
      .pad{padding:16px !important;}
      .kpi-cell{display:block !important;width:100% !important;margin-bottom:10px !important;}
      .kpi-value{font-size:26px !important;}
      .hero-title{font-size:20px !important;}
    }
  </style>
</head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f3f4f6;margin:0;padding:0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:12px 0;">
    <tr><td align="center">
      <table role="presentation" class="container" width="650" cellpadding="0" cellspacing="0" style="max-width:650px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <tr><td class="pad" style="background:linear-gradient(135deg,#1e293b,#334155);padding:24px 30px;color:#fff;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;opacity:0.7;">Torres Vigil\xE2ncia Patrimonial</div>
          <div class="hero-title" style="font-size:24px;font-weight:700;margin-top:4px;">Resumo Financeiro \u2014 Diretoria</div>
          <div style="font-size:14px;opacity:0.85;margin-top:4px;">${snap.diaSemana}, ${snap.dataLabel}</div>
          <div style="font-size:11px;opacity:0.6;margin-top:6px;">Gerado em ${fmtBRTDateTime(snap.generatedAt)} (BRT)</div>
        </td></tr>

        <tr><td class="pad" style="padding:20px 24px;">

          ${asaasHtml}

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td class="kpi-cell" valign="top" width="33%" style="padding-right:6px;">
                <div style="background:#f0fdf4;border-radius:8px;padding:14px;border-left:4px solid #16a34a;">
                  <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Faturamento Hoje</div>
                  <div class="kpi-value" style="font-size:20px;font-weight:700;color:#16a34a;margin-top:4px;">R$ ${fmtBR2(snap.dia.fatLive)}</div>
                  ${fatLiveBadge}
                </div>
              </td>
              <td class="kpi-cell" valign="top" width="33%" style="padding:0 3px;">
                <div style="background:#fef2f2;border-radius:8px;padding:14px;border-left:4px solid #dc2626;">
                  <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Custos Hoje</div>
                  <div class="kpi-value" style="font-size:20px;font-weight:700;color:#dc2626;margin-top:4px;">R$ ${fmtBR2(snap.dia.custoTotal)}</div>
                </div>
              </td>
              <td class="kpi-cell" valign="top" width="33%" style="padding-left:6px;">
                <div style="background:#eff6ff;border-radius:8px;padding:14px;border-left:4px solid #2563eb;">
                  <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Resultado</div>
                  <div class="kpi-value" style="font-size:20px;font-weight:700;color:${snap.dia.resultado >= 0 ? "#2563eb" : "#dc2626"};margin-top:4px;">R$ ${fmtBR2(snap.dia.resultado)}</div>
                </div>
              </td>
            </tr>
          </table>

          <div style="font-size:14px;font-weight:700;color:#1e293b;margin:8px 0 10px;text-transform:uppercase;letter-spacing:0.5px;">Faturamento \xD7 Meta</div>
          ${metaBlockHtml("Hoje", snap.dataLabel, snap.dia.fatLive, snap.meta.diaria, snap.dia.pctMeta)}
          ${metaBlockHtml("Semana", fmtPeriodo(snap.semana.inicio, snap.semana.fim), snap.semana.fat, snap.semana.meta, snap.semana.pct)}
          ${metaBlockHtml("M\xEAs", fmtPeriodo(snap.mes.inicio, snap.mes.fim), snap.mes.fat, snap.mes.meta, snap.mes.pct)}
          <div style="font-size:11px;color:#64748b;margin:-4px 0 16px;">Meta: R$ ${fmtBR2(snap.meta.diariaPorViatura)} por viatura/dia \xD7 ${snap.meta.viaturasAtivas} ativa(s)</div>

          <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Margem de Lucro</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:${margemColor};">${fmtBR2(snap.dia.margem)}%</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">KM Total Rodados</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;">${fmtBR2(snap.dia.kmTotal)} km</td>
            </tr>
            ${snap.dia.despPedagio > 0 ? `<tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Ped\xE1gio (Escoltas)</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:#dc2626;">R$ ${fmtBR2(snap.dia.despPedagio)}</td>
            </tr>` : ""}
            ${snap.dia.despCombustivel > 0 ? `<tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Combust\xEDvel (Escoltas)</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:#dc2626;">R$ ${fmtBR2(snap.dia.despCombustivel)}</td>
            </tr>` : ""}
            ${snap.dia.receitasAvulsas > 0 ? `<tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Receitas Avulsas</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:#16a34a;">R$ ${fmtBR2(snap.dia.receitasAvulsas)}</td>
            </tr>` : ""}
            ${snap.dia.despesasAvulsas > 0 ? `<tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Despesas Avulsas</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:#dc2626;">R$ ${fmtBR2(snap.dia.despesasAvulsas)}</td>
            </tr>` : ""}
          </table>

          <div style="background:${snap.analiseCustoKm.status.bg};border-radius:8px;padding:14px 16px;margin-bottom:20px;border-left:4px solid ${snap.analiseCustoKm.status.color};">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#475569;font-weight:600;">An\xE1lise de Custo por KM</div>
            <div style="font-size:16px;font-weight:700;color:${snap.analiseCustoKm.status.color};margin-top:4px;">${snap.analiseCustoKm.status.label}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
              <tr><td style="font-size:12px;color:#64748b;padding:4px 0;">Hoje (custo/km)</td><td style="font-size:13px;font-weight:700;text-align:right;color:#1e293b;padding:4px 0;">R$ ${fmtBR2(snap.analiseCustoKm.custoPorKmHoje)}/km</td></tr>
              <tr><td style="font-size:12px;color:#64748b;padding:4px 0;">M\xE9dia 30 dias</td><td style="font-size:13px;font-weight:700;text-align:right;color:#1e293b;padding:4px 0;">R$ ${fmtBR2(snap.analiseCustoKm.custoPorKmHist)}/km</td></tr>
              ${snap.analiseCustoKm.custoPorKmHist > 0 && snap.analiseCustoKm.custoPorKmHoje > 0 ? `<tr><td style="font-size:12px;color:#64748b;padding:4px 0;">Varia\xE7\xE3o</td><td style="font-size:13px;font-weight:700;text-align:right;color:${snap.analiseCustoKm.status.color};padding:4px 0;">${snap.analiseCustoKm.variacaoPct >= 0 ? "+" : ""}${snap.analiseCustoKm.variacaoPct.toFixed(1)}%</td></tr>` : ""}
            </table>
            <div style="font-size:12px;color:#475569;margin-top:8px;line-height:1.4;">${snap.analiseCustoKm.status.msg}</div>
          </div>

          ${snap.gastosMes.total > 0 ? `
          <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">
              <div style="font-size:14px;font-weight:700;color:#334155;">Gastos do M\xEAs por Categoria</div>
              <div style="font-size:13px;font-weight:700;color:#dc2626;">R$ ${fmtBR2(snap.gastosMes.total)}</div>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              ${gastosCatRows}
            </table>
          </div>
          ` : ""}

          <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px;">
            <div style="font-size:14px;font-weight:700;margin-bottom:12px;color:#334155;">Opera\xE7\xF5es do Dia</div>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Total de OS</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;">${snap.ops.totalOS}</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Escoltas</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;">${snap.ops.escoltas}</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Conclu\xEDdas</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;color:#16a34a;">${snap.ops.concluidas}</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Em Andamento</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;color:#2563eb;">${snap.ops.emAndamento}</td></tr>
              ${snap.ops.canceladas > 0 ? `<tr><td style="padding:6px 0;font-size:13px;color:#666;">Canceladas/Recusadas</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;color:#dc2626;">${snap.ops.canceladas}</td></tr>` : ""}
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Efetivo Ativo</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;">${snap.ops.agentesAtivos} agentes</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Viaturas Ativas</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;">${snap.meta.viaturasAtivas}</td></tr>
            </table>
          </div>

          ${snap.ordens.length > 0 ? `
          <div style="margin-bottom:20px;">
            <div style="font-size:14px;font-weight:700;margin-bottom:10px;color:#334155;">Detalhamento por OS</div>
            ${osCards}
          </div>
          ` : ""}

        </td></tr>

        <tr><td class="pad" style="background:#f8fafc;padding:16px 24px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
          Torres Vigil\xE2ncia Patrimonial \u2014 CNPJ 36.982.392/0001-89
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const from = `"Torres Vigil\xE2ncia - Sistema" <${process.env.SMTP_FROM || process.env.SMTP_USER || "escolta@torresseguranca.com.br"}>`;
    const recipients = getDiretoriaRecipients();
    if (recipients.length === 0) {
      const msg = "Nenhum destinat\xE1rio v\xE1lido configurado (defina DIRETORIA_EMAIL com lista separada por v\xEDrgula)";
      log(`CRON ResumoDiario: ${msg}`, "cron");
      return { success: false, message: msg };
    }
    try {
      const info = await transporter.sendMail({
        from,
        to: recipients.join(", "),
        subject: `\u{1F4CA} Resumo Diretoria \u2014 ${snap.dataLabel} | Fat. R$ ${fmtBR2(snap.dia.fatLive)} | Resultado R$ ${fmtBR2(snap.dia.resultado)}`,
        html
      });
      log(`CRON ResumoDiario: E-mail enviado para [${recipients.join(", ")}] (msgId=${info.messageId}, accepted=${(info.accepted || []).length}, rejected=${(info.rejected || []).length}) \u2014 Fat. R$ ${fmtBR2(snap.dia.fatLive)} | Resultado R$ ${fmtBR2(snap.dia.resultado)}`, "cron");
      return { success: true, message: `E-mail enviado para ${recipients.join(", ")}` };
    } catch (sendErr) {
      log(`CRON ResumoDiario: Falha SMTP ao enviar para [${recipients.join(", ")}]: ${sendErr.message} (code=${sendErr.code || "?"}, response=${sendErr.response || "?"})`, "cron");
      return { success: false, message: `Falha SMTP: ${sendErr.message}` };
    }
  } catch (err) {
    log(`CRON ResumoDiario: Erro: ${err.message}`, "cron");
    return { success: false, message: err.message };
  }
}
async function executeBillingCron() {
  const n = (v) => Number(v) || 0;
  const r = (v) => Math.round(v * 100) / 100;
  const cronStart = Date.now();
  const { data: allOrders } = await supabaseAdmin.from("service_orders").select("*");
  if (!allOrders?.length) return;
  const isConcluded = (so) => ["concluida", "conclu\xEDda", "cancelada", "recusada"].includes(so.status) || ["encerrada", "finalizada"].includes(so.mission_status);
  const activeOrders = allOrders.filter(
    (so) => so.type === "escolta" && !isConcluded(so) && so.mission_status !== "aguardando"
  );
  const { data: existingBillingsStatus } = await supabaseAdmin.from("escort_billings").select("service_order_id, status");
  const billedSet = new Set((existingBillingsStatus || []).map((b) => b.service_order_id));
  const unverifBilledSet = new Set((existingBillingsStatus || []).filter((b) => b.status === "A_VERIFICAR").map((b) => b.service_order_id));
  const unbilledConcluded = allOrders.filter(
    (so) => so.type === "escolta" && isConcluded(so) && !billedSet.has(so.id)
  );
  const frozenUnverifCount = allOrders.filter(
    (so) => so.type === "escolta" && isConcluded(so) && unverifBilledSet.has(so.id)
  ).length;
  const seenIds = /* @__PURE__ */ new Set();
  const liveOrders = [...activeOrders, ...unbilledConcluded].filter((so) => {
    if (seenIds.has(so.id)) return false;
    seenIds.add(so.id);
    return true;
  });
  if (!liveOrders.length) {
    log(`CRON Billing: 0 OSs para processar, ${frozenUnverifCount} A_VERIFICAR congeladas`, "cron");
    return;
  }
  log(`CRON Billing: ${activeOrders.length} ativas + ${unbilledConcluded.length} conclu\xEDdas sem billing processadas, ${frozenUnverifCount} A_VERIFICAR congeladas`, "cron");
  const { data: allContracts } = await supabaseAdmin.from("escort_contracts").select("*");
  const contractMap = /* @__PURE__ */ new Map();
  const clientContractMap = /* @__PURE__ */ new Map();
  for (const c of allContracts || []) {
    contractMap.set(c.id, c);
    if (c.status === "Ativo" && c.client_id) {
      clientContractMap.set(c.client_id, c);
    }
  }
  const liveOrderIds = liveOrders.map((so) => so.id);
  const clientIds = Array.from(new Set(liveOrders.map((so) => so.client_id).filter((v) => v != null)));
  const empIds = Array.from(new Set(liveOrders.flatMap((so) => [so.assigned_employee_id, so.assigned_employee_2_id]).filter((v) => v != null)));
  const vehIds = Array.from(new Set(liveOrders.map((so) => so.vehicle_id).filter((v) => v != null)));
  const fetchAllPaged = async (table, columns, idCol, ids, orderCol = "id") => {
    const out = [];
    const pageSize = 1e3;
    let from = 0;
    while (true) {
      const { data, error } = await supabaseAdmin.from(table).select(columns).in(idCol, ids).order(orderCol, { ascending: true }).range(from, from + pageSize - 1);
      if (error) throw error;
      const rows = data || [];
      out.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return out;
  };
  const [photosArr, clientsRes, empsRes, vehsRes, mCostsArr, existBillsRes] = await Promise.all([
    fetchAllPaged("mission_photos", "service_order_id, step, km_value", "service_order_id", liveOrderIds),
    clientIds.length ? supabaseAdmin.from("clients").select("id, name").in("id", clientIds) : Promise.resolve({ data: [] }),
    empIds.length ? supabaseAdmin.from("employees").select("id, name").in("id", empIds) : Promise.resolve({ data: [] }),
    vehIds.length ? supabaseAdmin.from("vehicles").select("id, plate").in("id", vehIds) : Promise.resolve({ data: [] }),
    fetchAllPaged("mission_costs", "service_order_id, category, amount, cost_type", "service_order_id", liveOrderIds),
    supabaseAdmin.from("escort_billings").select("id, service_order_id, status").in("service_order_id", liveOrderIds)
  ]);
  const photosMap = /* @__PURE__ */ new Map();
  for (const p of photosArr) {
    if (!photosMap.has(p.service_order_id)) photosMap.set(p.service_order_id, []);
    photosMap.get(p.service_order_id).push(p);
  }
  const clientNameMap = new Map((clientsRes.data || []).map((c) => [c.id, c.name]));
  const empNameMap = new Map((empsRes.data || []).map((e) => [e.id, e.name]));
  const vehPlateMap = new Map((vehsRes.data || []).map((v) => [v.id, v.plate]));
  const mCostsMap = /* @__PURE__ */ new Map();
  for (const c of mCostsArr) {
    if (!mCostsMap.has(c.service_order_id)) mCostsMap.set(c.service_order_id, []);
    mCostsMap.get(c.service_order_id).push(c);
  }
  const billingIdMap = new Map((existBillsRes.data || []).map((b) => [b.service_order_id, b.id]));
  const billingStatusMap = new Map((existBillsRes.data || []).map((b) => [b.service_order_id, b.status]));
  const FROZEN_STATUSES = /* @__PURE__ */ new Set(["A_VERIFICAR", "APROVADA", "FATURADO", "FATURADA", "PAGO", "CANCELADO", "CANCELADA", "REJEITADA"]);
  const CHUNK_SIZE = 15;
  const processOne = async (so) => {
    try {
      const contrato = resolveContractForOs(so, contractMap, clientContractMap, { ...DEFAULT_BILLING_CONTRACT });
      const skipBillingHoursCron = shouldSkipBillingHours(so);
      const horasMissao = skipBillingHoursCron ? 0 : await getHorasElapsedFromDB(so.id);
      const photos = photosMap.get(so.id) || [];
      const mCosts = mCostsMap.get(so.id) || [];
      const cliName = so.client_id ? clientNameMap.get(so.client_id) || null : null;
      const empName = so.assigned_employee_id ? empNameMap.get(so.assigned_employee_id) || null : null;
      const emp2Name = so.assigned_employee_2_id ? empNameMap.get(so.assigned_employee_2_id) || null : null;
      const vehPlate = so.vehicle_id ? vehPlateMap.get(so.vehicle_id) || null : null;
      const billingPayload = computeBillingPayloadForOs({
        so,
        contrato,
        photos,
        mCosts,
        horasMissao,
        clientName: cliName,
        empName,
        emp2Name,
        vehPlate
      });
      const existId = billingIdMap.get(so.id);
      if (existId) {
        const existStatus = billingStatusMap.get(so.id);
        if (existStatus && FROZEN_STATUSES.has(existStatus)) {
          log(`CRON Billing: OS ${so.os_number} pulada \u2014 billing congelado (status=${existStatus})`, "cron");
          return;
        }
      }
      await supabaseAdmin.from("escort_billings").upsert(billingPayload, { onConflict: "service_order_id" });
      log(`CRON Billing: OS ${so.os_number} recalculada - ${r(horasMissao)}h, ${n(billingPayload.km_total)}km, fat=${r(billingPayload.fat_total)}`, "cron");
    } catch (err) {
      log(`CRON Billing: Erro OS ${so.os_number}: ${err.message}`, "cron");
    }
  };
  for (let i = 0; i < liveOrders.length; i += CHUNK_SIZE) {
    const chunk = liveOrders.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map(processOne));
  }
  const elapsed = ((Date.now() - cronStart) / 1e3).toFixed(1);
  log(`CRON Billing: Ciclo completo em ${elapsed}s (${liveOrders.length} OSs, chunks de ${CHUNK_SIZE})`, "cron");
}
var RODIZIO_MAP, META_DIARIA_VIATURA2, isActiveVehicle2, MONTHS_PT, DIRETORIA_EMAIL_DEFAULT;
var init_cron = __esm({
  "server/cron.ts"() {
    "use strict";
    init_logger();
    init_truckscontrol();
    init_supabase();
    init_billing_calc();
    init_financial_snapshot();
    init_platform();
    init_cron_buckets();
    init_email_vencimentos();
    RODIZIO_MAP = {
      1: [1, 2],
      2: [3, 4],
      3: [5, 6],
      4: [7, 8],
      5: [9, 0]
    };
    META_DIARIA_VIATURA2 = 1800;
    isActiveVehicle2 = (v) => v.status !== "inativo" && !!(v.trackerId || v.truckscontrolIdentifier);
    MONTHS_PT = ["Janeiro", "Fevereiro", "Mar\xE7o", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    DIRETORIA_EMAIL_DEFAULT = "diretoria@torresseguranca.com.br";
  }
});

// shared/documents-catalog.ts
function profileFromRole(role) {
  const r = (role || "").toLowerCase();
  if (r.includes("vigilante") || r.includes("escolt") || r.includes("operacional") || r.includes("operador")) {
    return "vigilante";
  }
  return "admin";
}
function buildRequiredDocsCatalog() {
  return [
    { group: "Identifica\xE7\xE3o e Documentos Pessoais", items: [
      { type: "RG", label: "RG" },
      { type: "CPF", label: "CPF" },
      { type: "CTPS", label: "Carteira de Trabalho (CTPS)" },
      { type: "PIS/PASEP/NIS", label: "PIS/PASEP/NIS" },
      { type: "Comprovante de Resid\xEAncia", label: "Comprovante de Resid\xEAncia" },
      { type: "Fotos 3x4", label: "03 Fotos 3x4 recentes" },
      { type: "T\xEDtulo de Eleitor", label: "T\xEDtulo de Eleitor" },
      { type: "Certificado de Reservista", label: "Certificado de Reservista (homens 18-45)", vigilanteOnly: true }
    ] },
    { group: "Habilita\xE7\xE3o e Forma\xE7\xE3o", items: [
      { type: "CNH", label: "CNH / CNV", vigilanteOnly: true },
      // Decidido com o dono (jun/2026): Pontuação CNH NÃO é obrigatória (opcional).
      { type: "Certid\xE3o de Pontua\xE7\xE3o CNH", label: "Certid\xE3o de Pontua\xE7\xE3o de CNH", vigilanteOnly: true, optional: true },
      // Opcionais (decidido 27/05/2026): aparecem no checklist mas não bloqueiam alerta.
      { type: "Carteira de Vacina\xE7\xE3o", label: "Carteira de Vacina\xE7\xE3o", optional: true },
      { type: "Comprovante de Forma\xE7\xE3o Escolar", label: "Comprovante de Forma\xE7\xE3o Escolar", optional: true },
      { type: "Certificado Forma\xE7\xE3o Vigilante", label: "Certificado de Forma\xE7\xE3o de Vigilante (validade dispensada)", vigilanteOnly: true },
      { type: "Certificado Forma\xE7\xE3o Escolta Armada", label: "Certificado de Forma\xE7\xE3o de Escolta Armada (validade dispensada)", vigilanteOnly: true },
      { type: "Reciclagem Escolta Armada", label: "\xDAltima Reciclagem de Escolta Armada", vigilanteOnly: true },
      { type: "ASO", label: "ASO - Atestado de Sa\xFAde Ocupacional" }
    ] },
    { group: "Dependentes (se necess\xE1rio)", items: [
      { type: "Certid\xE3o Nascimento/Casamento", label: "Certid\xE3o de Casamento", optional: true },
      { type: "Certid\xE3o Nascimento Filhos", label: "Certid\xE3o de Nascimento de Filhos (menores 14 anos)", optional: true },
      { type: "Carteira Vacina\xE7\xE3o/Comprovante Escolar", label: "Carteira de Vacina\xE7\xE3o dos Filhos", optional: true }
    ] },
    { group: "Certid\xF5es Obrigat\xF3rias", items: [
      { type: "Antecedentes Criminais", label: "Antecedentes Criminais", adminOnly: true },
      // Decidido com o dono (jun/2026): Antec. Civil e Militar NÃO são obrigatórios (opcionais).
      { type: "Antecedente Criminal Pol\xEDcia Civil", label: "Antecedente Criminal Pol\xEDcia Civil", vigilanteOnly: true, optional: true },
      { type: "Antecedente Criminal Pol\xEDcia Militar", label: "Antecedente Criminal Pol\xEDcia Militar", vigilanteOnly: true, optional: true },
      { type: "Certid\xE3o de COP", label: "Certid\xE3o de COP (Objeto em P\xE9)", vigilanteOnly: true }
    ] }
  ];
}
function filterDocsCatalogByProfile(catalog, profile) {
  if (profile === "admin") return [];
  const isVig = profile === "vigilante";
  return catalog.map((g) => ({
    group: g.group,
    items: g.items.filter((i) => {
      if (i.vigilanteOnly && !isVig) return false;
      if (i.adminOnly && isVig) return false;
      return true;
    })
  })).filter((g) => g.items.length > 0);
}
function brtToday2() {
  return (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function isReciclagemDue(cnvIssueDate, today = brtToday2()) {
  if (!cnvIssueDate) return false;
  const [y, m, d] = String(cnvIssueDate).split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return false;
  const dueDate = `${y + 2}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return today >= dueDate;
}
var DOCS_WITH_EXPIRY, RECICLAGEM_ESCOLTA_TYPE;
var init_documents_catalog = __esm({
  "shared/documents-catalog.ts"() {
    "use strict";
    DOCS_WITH_EXPIRY = /* @__PURE__ */ new Set([
      "CNH",
      "CNV"
    ]);
    RECICLAGEM_ESCOLTA_TYPE = "Reciclagem Escolta Armada";
  }
});

// server/jobs/document-compliance.ts
var document_compliance_exports = {};
__export(document_compliance_exports, {
  buildDocComplianceReport: () => buildDocComplianceReport,
  sendDocComplianceEmail: () => sendDocComplianceEmail
});
function mandatoryItemsForProfile(role) {
  const profile = profileFromRole(role);
  return filterDocsCatalogByProfile(FULL_CATALOG, profile).filter((g) => g.group !== "Dependentes (se necess\xE1rio)").flatMap((g) => g.items.filter((i) => !i.optional).map((i) => ({ type: i.type, label: i.label })));
}
function isExpired(expiryDate) {
  const exp = (/* @__PURE__ */ new Date(`${expiryDate}T00:00:00-03:00`)).getTime();
  return (exp - Date.now()) / 864e5 < 0;
}
async function buildDocComplianceReport() {
  const { data: employees, error: empErr } = await supabaseAdmin.from("employees").select("id, name, role, status, photo_url, cnv_issue_date").eq("status", "ativo").order("name");
  if (empErr) throw new Error(`Falha ao carregar funcion\xE1rios: ${empErr.message}`);
  if (!employees?.length) return [];
  const empIds = employees.map((e) => e.id);
  const { data: docs, error: docErr } = await supabaseAdmin.from("employee_documents").select("id, employee_id, type, expiry_date").in("employee_id", empIds);
  if (docErr) throw new Error(`Falha ao carregar documentos: ${docErr.message}`);
  const docsByEmp = /* @__PURE__ */ new Map();
  for (const d of docs || []) {
    if (!docsByEmp.has(d.employee_id)) docsByEmp.set(d.employee_id, []);
    docsByEmp.get(d.employee_id).push(d);
  }
  const report = [];
  for (const emp of employees) {
    const empDocs = docsByEmp.get(emp.id) || [];
    const hasType = (type) => {
      if (type === "Fotos 3x4" && emp.photo_url) return true;
      return empDocs.some((d) => d.type === type);
    };
    const missing = [];
    const expired = [];
    const mandatory = mandatoryItemsForProfile(emp.role).filter((it) => it.type !== RECICLAGEM_ESCOLTA_TYPE || isReciclagemDue(emp.cnv_issue_date));
    for (const item of mandatory) {
      const hasIt = item.type === "Antecedentes Criminais" ? hasType("Antecedentes Criminais") || hasType("Antecedente Criminal Pol\xEDcia Civil") || hasType("Antecedente Criminal Pol\xEDcia Militar") : hasType(item.type);
      if (!hasIt) {
        missing.push({ type: item.type, label: item.label });
        continue;
      }
      if (DOCS_WITH_EXPIRY.has(item.type)) {
        const matched = empDocs.filter((d) => d.type === item.type && d.expiry_date).sort((a, b) => String(b.expiry_date).localeCompare(String(a.expiry_date)))[0];
        if (matched && isExpired(matched.expiry_date)) {
          expired.push({ type: item.type, label: item.label, expiryDate: matched.expiry_date });
        }
      }
    }
    if (missing.length || expired.length) {
      report.push({ id: emp.id, name: emp.name, role: emp.role || "\u2014", missing, expired });
    }
  }
  return report;
}
function fmtBRDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function buildHtml(report) {
  const totalMissing = report.reduce((s, r) => s + r.missing.length, 0);
  const totalExpired = report.reduce((s, r) => s + r.expired.length, 0);
  const dataBR = (/* @__PURE__ */ new Date()).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const employeeBlocks = report.map((r) => {
    const missingList = r.missing.length ? `<div style="margin-top:8px"><div style="font-size:12px;font-weight:bold;color:#92400e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Faltantes (${r.missing.length})</div><ul style="margin:0;padding-left:18px;font-size:13px;color:#374151">${r.missing.map((m) => `<li>${m.label}</li>`).join("")}</ul></div>` : "";
    const expiredList = r.expired.length ? `<div style="margin-top:8px"><div style="font-size:12px;font-weight:bold;color:#b91c1c;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Vencidos (${r.expired.length})</div><ul style="margin:0;padding-left:18px;font-size:13px;color:#374151">${r.expired.map((e) => `<li>${e.label} \u2014 venceu em <strong style="color:#b91c1c">${fmtBRDate(e.expiryDate)}</strong></li>`).join("")}</ul></div>` : "";
    return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><div style="font-size:15px;font-weight:bold;color:#111827">${r.name}</div><div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:bold">${r.role}</div></div>${missingList}${expiredList}</div>`;
  }).join("");
  const empty = report.length === 0 ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:20px;text-align:center;color:#065f46;font-weight:bold">Todos os documentos est\xE3o em dia. Nada a regularizar.</div>` : "";
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="background:#f3f4f6;font-family:Arial,sans-serif;margin:0;padding:0">
<div style="max-width:680px;margin:0 auto;padding:20px">
  <div style="background:#1f2937;color:#fff;padding:20px;border-radius:10px 10px 0 0">
    <h1 style="margin:0;font-size:20px">\u{1F4CB} Compliance de Documentos \u2014 RH</h1>
    <p style="margin:4px 0 0;font-size:13px;color:#d1d5db">Relat\xF3rio di\xE1rio \u2014 ${dataBR}</p>
  </div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:16px">
    <table style="width:100%;border-collapse:separate;border-spacing:8px 0">
      <tr>
        <td style="background:#fef3c7;border-radius:8px;padding:12px;text-align:center;width:33%">
          <div style="font-size:11px;font-weight:bold;color:#92400e;text-transform:uppercase">Faltantes</div>
          <div style="font-size:24px;font-weight:bold;color:#92400e;margin-top:2px">${totalMissing}</div>
        </td>
        <td style="background:#fee2e2;border-radius:8px;padding:12px;text-align:center;width:33%">
          <div style="font-size:11px;font-weight:bold;color:#991b1b;text-transform:uppercase">Vencidos</div>
          <div style="font-size:24px;font-weight:bold;color:#991b1b;margin-top:2px">${totalExpired}</div>
        </td>
        <td style="background:#dbeafe;border-radius:8px;padding:12px;text-align:center;width:34%">
          <div style="font-size:11px;font-weight:bold;color:#1e40af;text-transform:uppercase">Funcion\xE1rios</div>
          <div style="font-size:24px;font-weight:bold;color:#1e40af;margin-top:2px">${report.length}</div>
        </td>
      </tr>
    </table>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:16px">
    ${empty}${employeeBlocks}
    <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;text-align:center">Torres Vigil\xE2ncia Patrimonial \u2014 disparo autom\xE1tico di\xE1rio \xE0s 07:00 BRT.</p>
  </div>
</div></body></html>`;
  return { html, totalMissing, totalExpired };
}
async function sendDocComplianceEmail(opts = {}) {
  const report = await buildDocComplianceReport();
  const { html, totalMissing, totalExpired } = buildHtml(report);
  const overrideValid = opts.overrideTo?.filter((e) => typeof e === "string" && EMAIL_RE.test(e));
  const recipients = overrideValid?.length ? overrideValid : [ESCOLTA_EMAIL, ADM_EMAIL];
  if (opts.dryRun) {
    return { success: true, sent: false, totalMissing, totalExpired, employees: report.length, recipients, message: "dry-run" };
  }
  const transporter = createSmtpTransporter();
  if (!transporter) {
    return { success: false, sent: false, totalMissing, totalExpired, employees: report.length, recipients, message: "SMTP n\xE3o configurado" };
  }
  const dataBR = (/* @__PURE__ */ new Date()).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const subject = totalMissing + totalExpired > 0 ? `\u{1F4CB} Documentos pendentes (${totalMissing} faltantes + ${totalExpired} vencidos) \u2014 ${dataBR}` : `\u2705 Documentos em dia \u2014 ${dataBR}`;
  await transporter.sendMail({
    from: getSmtpFrom(),
    to: recipients,
    subject,
    html
  });
  return {
    success: true,
    sent: true,
    totalMissing,
    totalExpired,
    employees: report.length,
    recipients,
    message: `E-mail enviado para ${recipients.join(", ")}`
  };
}
var ESCOLTA_EMAIL, ADM_EMAIL, FULL_CATALOG, EMAIL_RE;
var init_document_compliance = __esm({
  "server/jobs/document-compliance.ts"() {
    "use strict";
    init_supabase();
    init_helpers();
    init_documents_catalog();
    ESCOLTA_EMAIL = "escolta@torresseguranca.com.br";
    ADM_EMAIL = "adm@torresseguranca.com.br";
    FULL_CATALOG = buildRequiredDocsCatalog();
    EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  }
});

// server/lib/whatsapp-store.ts
function isGroupId(id) {
  return id.endsWith("@g.us") || id.endsWith("-group");
}
async function persistOutgoingWhatsappMessage(params) {
  try {
    const chatId = (params.chatId || "").trim();
    if (!chatId) return;
    const ts = params.ts || (/* @__PURE__ */ new Date()).toISOString();
    const type = params.type || "text";
    if (params.messageId) {
      const { data: existing } = await supabaseAdmin.from("whatsapp_messages").select("id").eq("zapi_message_id", params.messageId).maybeSingle();
      if (existing) return;
    }
    const { error: insErr } = await supabaseAdmin.from("whatsapp_messages").insert({
      chat_id: chatId,
      zapi_message_id: params.messageId || null,
      from_me: true,
      sender_phone: null,
      sender_name: params.senderName || "Central Torres",
      type,
      body: params.body ?? null,
      media_url: params.mediaUrl ?? null,
      media_mime: params.mediaMime ?? null,
      status: "sent",
      ts
    });
    if (insErr) {
      console.warn(`[whatsapp-store] insert msg falhou (chat=${chatId} mid=${params.messageId} type=${type}):`, insErr.message);
      return;
    }
    const preview = params.body && params.body.trim() || TYPE_PREVIEW[type] || "Mensagem";
    const { data: existingChat } = await supabaseAdmin.from("whatsapp_chats").select("name").eq("chat_id", chatId).maybeSingle();
    await supabaseAdmin.from("whatsapp_chats").upsert({
      chat_id: chatId,
      name: existingChat?.name || null,
      is_group: isGroupId(chatId),
      last_message_at: ts,
      last_message_text: preview.slice(0, 280),
      last_message_from_me: true,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }, { onConflict: "chat_id" });
  } catch (e) {
    console.warn("[whatsapp-store] persistOutgoing falhou (fail-open):", e?.message);
  }
}
var TYPE_PREVIEW;
var init_whatsapp_store = __esm({
  "server/lib/whatsapp-store.ts"() {
    "use strict";
    init_supabase();
    TYPE_PREVIEW = {
      image: "\u{1F4F7} Foto",
      audio: "\u{1F3B5} \xC1udio",
      video: "\u{1F3AC} V\xEDdeo",
      document: "\u{1F4C4} Documento",
      location: "\u{1F4CD} Localiza\xE7\xE3o"
    };
  }
});

// server/lib/zapi-throttle.ts
function minIntervalMs() {
  const raw = Number(process.env.ZAPI_SEND_MIN_INTERVAL_MS || "");
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_MIN_INTERVAL_MS;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function throttleZapiSend(label, fn, meta) {
  const depthAtEntry = chainPending;
  chainPending += 1;
  if (meta) meta.queueDepth = depthAtEntry;
  const prev = chain;
  let release;
  chain = new Promise((r) => release = r);
  return (async () => {
    try {
      await prev;
      const wait = lastSendAt + minIntervalMs() - Date.now();
      const queueWaitMs = wait > 0 ? wait : 0;
      if (meta) meta.queueWaitMs = queueWaitMs;
      if (wait > 0) {
        console.log(`[Z-API Fila] Aguardando ${(wait / 1e3).toFixed(1)}s (fila=${depthAtEntry}) antes de enviar (${label}).`);
        await sleep(wait);
      }
      const p = fn();
      void Promise.race([p.then(() => void 0, () => void 0), sleep(MAX_HOLD_MS)]).then(() => {
        lastSendAt = Date.now();
        chainPending = Math.max(0, chainPending - 1);
        release();
      });
      return p;
    } catch (e) {
      chainPending = Math.max(0, chainPending - 1);
      release();
      throw e;
    }
  })();
}
var DEFAULT_MIN_INTERVAL_MS, MAX_HOLD_MS, lastSendAt, chain, chainPending;
var init_zapi_throttle = __esm({
  "server/lib/zapi-throttle.ts"() {
    "use strict";
    DEFAULT_MIN_INTERVAL_MS = 2e4;
    MAX_HOLD_MS = 45e3;
    lastSendAt = 0;
    chain = Promise.resolve();
    chainPending = 0;
  }
});

// server/lib/zapi.ts
function sanitize(s) {
  let out = s || "";
  if (TOKEN) out = out.split(TOKEN).join("***TOKEN***");
  if (CLIENT_TOKEN) out = out.split(CLIENT_TOKEN).join("***CLIENT_TOKEN***");
  return out;
}
function isZapiConfigured() {
  return Boolean(INSTANCE_ID && TOKEN && CLIENT_TOKEN);
}
async function getConnectionStatus() {
  if (!isZapiConfigured()) {
    return { configured: false, connected: false, smartphoneConnected: false, confirmed: false, error: "Z-API n\xE3o configurada" };
  }
  try {
    const resp = await fetch(`${BASE}/status`, {
      headers: { "Client-Token": CLIENT_TOKEN }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return {
        configured: true,
        connected: false,
        smartphoneConnected: false,
        confirmed: false,
        error: sanitize(String(data?.error || `HTTP ${resp.status}`))
      };
    }
    return {
      configured: true,
      connected: data?.connected === true,
      smartphoneConnected: data?.smartphoneConnected === true,
      confirmed: true,
      error: data?.error ? sanitize(String(data.error)) : void 0
    };
  } catch (e) {
    return { configured: true, connected: false, smartphoneConnected: false, confirmed: false, error: sanitize(e?.message || "erro de rede") };
  }
}
async function getBotLid() {
  if (!isZapiConfigured()) return null;
  if (_botLidCache) {
    const ttl = _botLidCache.digits ? BOT_LID_TTL_MS : BOT_LID_NULL_TTL_MS;
    if (Date.now() - _botLidCache.at < ttl) return _botLidCache.digits;
  }
  try {
    const resp = await fetch(`${BASE}/device`, { headers: { "Client-Token": CLIENT_TOKEN } });
    if (!resp.ok) {
      console.warn(`[zapi] getBotLid: GET /device retornou ${resp.status}`);
      return _botLidCache?.digits ?? null;
    }
    const data = await resp.json().catch(() => ({}));
    const lidRaw = typeof data?.lid === "string" ? data.lid : "";
    const digits = lidRaw.replace(/\D/g, "") || null;
    _botLidCache = { digits, at: Date.now() };
    return digits;
  } catch {
    return _botLidCache?.digits ?? null;
  }
}
async function getConnectedPhone() {
  if (!isZapiConfigured()) return null;
  if (_connPhoneCache && Date.now() - _connPhoneCache.at < CONN_PHONE_TTL_MS) {
    return _connPhoneCache.digits;
  }
  try {
    const resp = await fetch(`${BASE}/device`, { headers: { "Client-Token": CLIENT_TOKEN } });
    if (!resp.ok) {
      console.warn(`[zapi] getConnectedPhone: GET /device retornou ${resp.status}`);
      return null;
    }
    const data = await resp.json().catch(() => ({}));
    const raw = data?.phone ?? data?.connectedPhone ?? data?.me?.phone ?? "";
    const digits = String(raw).replace(/\D/g, "");
    if (digits) {
      _connPhoneCache = { digits, at: Date.now() };
      _lastConfirmedPhone = digits;
      return digits;
    }
    return null;
  } catch {
    return null;
  }
}
function samePhone(a, b) {
  return a.slice(-11) === b.slice(-11);
}
function isOfficialBotNumber(connectedDigits) {
  if (!EXPECTED_PHONE_DIGITS) return true;
  return samePhone(String(connectedDigits || "").replace(/\D/g, ""), EXPECTED_PHONE_DIGITS);
}
function decideNumberBlockReason(connected, lastConfirmed) {
  if (!EXPECTED_PHONE_DIGITS) return null;
  const known = connected ?? lastConfirmed;
  if (!known) return "unconfirmed";
  return isOfficialBotNumber(known) ? null : "wrong_number";
}
async function assertExpectedNumber() {
  const connected = await getConnectedPhone();
  const reason = decideNumberBlockReason(connected, _lastConfirmedPhone);
  return { ok: reason === null, connected: connected ?? _lastConfirmedPhone ?? void 0, reason: reason ?? void 0 };
}
function normalizePhoneOrGroup(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/^whatsapp:/i, "");
}
function buildSendDelayFields(params, force = false) {
  if (!ZAPI_SEND_DELAYS_ENABLED && !force) return {};
  const out = {};
  if (params.delayTypingSeconds && params.delayTypingSeconds > 0) {
    out.delayTyping = Math.min(15, Math.max(1, Math.round(params.delayTypingSeconds)));
  }
  if (params.delayMessageSeconds && params.delayMessageSeconds > 0) {
    out.delayMessage = Math.min(15, Math.max(1, Math.round(params.delayMessageSeconds)));
  }
  return out;
}
async function sendImageWithCaption(params) {
  if (!isZapiConfigured()) {
    return { ok: false, error: "Z-API n\xE3o configurada (ZAPI_INSTANCE_ID/ZAPI_TOKEN/ZAPI_CLIENT_TOKEN)" };
  }
  const phone = normalizePhoneOrGroup(params.groupOrPhone);
  if (!phone) return { ok: false, error: "groupOrPhone vazio" };
  const numCheck = await assertExpectedNumber();
  if (!numCheck.ok) {
    if (numCheck.reason === "unconfirmed") {
      console.error("[zapi] ENVIO BLOQUEADO (send-image): n\xE3o foi poss\xEDvel confirmar o n\xFAmero conectado na Z-API (transit\xF3rio) \u2014 re-tent\xE1vel.");
      return { ok: false, error: "N\xE3o foi poss\xEDvel confirmar o n\xFAmero conectado na Z-API \u2014 envio bloqueado por seguran\xE7a (transit\xF3rio, re-tent\xE1vel)." };
    }
    console.error("[zapi] ENVIO BLOQUEADO (send-image): inst\xE2ncia conectada num n\xFAmero diferente do oficial da Central. Reconecte o n\xFAmero correto.");
    return { ok: false, blocked: true, error: "Z-API conectada num n\xFAmero diferente do n\xFAmero oficial da Central \u2014 envio bloqueado. Reconecte o n\xFAmero correto." };
  }
  const body = {
    phone,
    image: params.imageBase64OrUrl,
    caption: (params.caption || "").slice(0, 1024),
    // WhatsApp tem limite de ~1024 chars na legenda
    ...buildSendDelayFields(params)
  };
  const label = `send-image:${phone.slice(-8)}`;
  return throttleZapiSend(label, async () => {
    try {
      const resp = await fetch(`${BASE}/send-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": CLIENT_TOKEN
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(2e4)
      });
      const text = await resp.text();
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
      }
      if (!resp.ok) {
        return { ok: false, error: sanitize(`HTTP ${resp.status}: ${text.slice(0, 300)}`), raw: parsed };
      }
      const messageId = parsed?.id || parsed?.messageId;
      if (params.persist !== false) {
        const isHttp = /^https?:\/\//i.test(params.imageBase64OrUrl || "");
        await persistOutgoingWhatsappMessage({
          chatId: phone,
          messageId,
          type: "image",
          body: params.caption || null,
          mediaUrl: isHttp ? params.imageBase64OrUrl : null,
          mediaMime: isHttp ? "image/jpeg" : null,
          senderName: params.senderName
        });
      }
      return { ok: true, messageId, raw: parsed };
    } catch (err) {
      return { ok: false, error: sanitize(err?.message || String(err)) };
    }
  });
}
async function sendText(params) {
  if (!isZapiConfigured()) {
    return { ok: false, error: "Z-API n\xE3o configurada" };
  }
  const phone = normalizePhoneOrGroup(params.groupOrPhone);
  if (!phone) return { ok: false, error: "groupOrPhone vazio" };
  const numCheck = await assertExpectedNumber();
  if (!numCheck.ok) {
    if (numCheck.reason === "unconfirmed") {
      console.error("[zapi] ENVIO BLOQUEADO (send-text): n\xE3o foi poss\xEDvel confirmar o n\xFAmero conectado na Z-API (transit\xF3rio) \u2014 re-tent\xE1vel.");
      return { ok: false, error: "N\xE3o foi poss\xEDvel confirmar o n\xFAmero conectado na Z-API \u2014 envio bloqueado por seguran\xE7a (transit\xF3rio, re-tent\xE1vel)." };
    }
    console.error("[zapi] ENVIO BLOQUEADO (send-text): inst\xE2ncia conectada num n\xFAmero diferente do oficial da Central. Reconecte o n\xFAmero correto.");
    return { ok: false, blocked: true, error: "Z-API conectada num n\xFAmero diferente do n\xFAmero oficial da Central \u2014 envio bloqueado. Reconecte o n\xFAmero correto." };
  }
  const body = {
    phone,
    message: params.message,
    ...buildSendDelayFields(params, params.forceDelay)
  };
  const label = `send-text:${phone.slice(-8)}`;
  return throttleZapiSend(label, async () => {
    try {
      const resp = await fetch(`${BASE}/send-text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": CLIENT_TOKEN
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(3e4)
      });
      const text = await resp.text();
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
      }
      if (!resp.ok) return { ok: false, error: sanitize(`HTTP ${resp.status}: ${text.slice(0, 300)}`), raw: parsed };
      const messageId = parsed?.id || parsed?.messageId;
      if (params.persist !== false) {
        await persistOutgoingWhatsappMessage({
          chatId: phone,
          messageId,
          type: "text",
          body: params.message,
          senderName: params.senderName
        });
      }
      return { ok: true, messageId, raw: parsed };
    } catch (err) {
      return { ok: false, error: sanitize(err?.message || String(err)) };
    }
  });
}
async function sendReaction(params) {
  if (!isZapiConfigured()) {
    return { ok: false, error: "Z-API n\xE3o configurada" };
  }
  const phone = normalizePhoneOrGroup(params.groupOrPhone);
  const messageId = String(params.messageId || "").trim();
  if (!phone) return { ok: false, error: "groupOrPhone vazio" };
  if (!messageId) return { ok: false, error: "messageId vazio" };
  const numCheck = await assertExpectedNumber();
  if (!numCheck.ok) {
    if (numCheck.reason === "unconfirmed") {
      return { ok: false, error: "N\xE3o foi poss\xEDvel confirmar o n\xFAmero conectado na Z-API \u2014 rea\xE7\xE3o bloqueada (transit\xF3rio)." };
    }
    return { ok: false, blocked: true, error: "Z-API conectada num n\xFAmero diferente do oficial \u2014 rea\xE7\xE3o bloqueada." };
  }
  const label = `send-reaction:${phone.slice(-8)}`;
  return throttleZapiSend(label, async () => {
    try {
      const resp = await fetch(`${BASE}/send-reaction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": CLIENT_TOKEN
        },
        body: JSON.stringify({
          phone,
          messageId,
          reaction: params.reaction || "\u2705"
        }),
        signal: AbortSignal.timeout(15e3)
      });
      const text = await resp.text();
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
      }
      if (!resp.ok) return { ok: false, error: sanitize(`HTTP ${resp.status}: ${text.slice(0, 300)}`), raw: parsed };
      return { ok: true, messageId: parsed?.id || parsed?.messageId, raw: parsed };
    } catch (err) {
      return { ok: false, error: sanitize(err?.message || String(err)) };
    }
  });
}
var INSTANCE_ID, TOKEN, CLIENT_TOKEN, BASE, _botLidCache, BOT_LID_TTL_MS, BOT_LID_NULL_TTL_MS, EXPECTED_PHONE_DIGITS, _connPhoneCache, _lastConfirmedPhone, CONN_PHONE_TTL_MS, ZAPI_SEND_DELAYS_ENABLED;
var init_zapi = __esm({
  "server/lib/zapi.ts"() {
    "use strict";
    init_whatsapp_store();
    init_zapi_throttle();
    INSTANCE_ID = process.env.ZAPI_INSTANCE_ID || "";
    TOKEN = process.env.ZAPI_TOKEN || "";
    CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || "";
    BASE = INSTANCE_ID && TOKEN ? `https://api.z-api.io/instances/${INSTANCE_ID}/token/${TOKEN}` : "";
    _botLidCache = null;
    BOT_LID_TTL_MS = 6 * 60 * 60 * 1e3;
    BOT_LID_NULL_TTL_MS = 60 * 1e3;
    EXPECTED_PHONE_DIGITS = (process.env.ZAPI_EXPECTED_PHONE || "5511926839456").replace(/\D/g, "");
    _connPhoneCache = null;
    _lastConfirmedPhone = null;
    CONN_PHONE_TTL_MS = 30 * 1e3;
    ZAPI_SEND_DELAYS_ENABLED = true;
  }
});

// server/lib/whatsapp-humanize.ts
import OpenAI from "openai";
function sleep2(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
function randInt(min, max) {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
function humanDelayMs(minMs = 4e3, maxMs = 18e3) {
  return randInt(minMs, maxMs);
}
function randomTypingSeconds(minS = 2, maxS = 8) {
  return randInt(minS, maxS);
}
function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function brtHour() {
  const h = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hour12: false
    }).format(/* @__PURE__ */ new Date()),
    10
  );
  return Number.isFinite(h) ? h % 24 : 12;
}
function saudacaoPorHora() {
  const h = brtHour();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
function casualize(text, prob = 0.4) {
  let out = text;
  for (const [re, repl] of CASUAL_RE) {
    if (Math.random() < prob) out = out.replace(re, repl);
  }
  return out;
}
function buildReminderFallback(ctx) {
  const saudPool = [...SAUDACOES, saudacaoPorHora(), saudacaoPorHora()];
  const saud = saudPool[randInt(0, saudPool.length - 1)];
  const ident = IDENTIDADES[randInt(0, IDENTIDADES.length - 1)];
  const pedidos = ctx.trigger === "client" ? PEDIDOS_CLIENT : PEDIDOS_CRON;
  const pedido = pedidos[randInt(0, pedidos.length - 1)];
  const fecho = FECHOS[randInt(0, FECHOS.length - 1)];
  const osRefs = [
    `(OS ${ctx.osLabel})`,
    `referente \xE0 OS ${ctx.osLabel}`,
    `na OS ${ctx.osLabel}`,
    `da OS ${ctx.osLabel}`
  ];
  const osRef = osRefs[randInt(0, osRefs.length - 1)];
  const corpo = `${cap(saud)}, ${ident}. Sobre a miss\xE3o ${osRef}: ${pedido}${fecho}`.trim();
  return casualize(corpo);
}
async function buildReminderMessage(ctx) {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) return buildReminderFallback(ctx);
  const ctxInfo = [
    `OS: ${ctx.osLabel}`,
    ctx.estado ? `Estado da miss\xE3o: ${ctx.estado}` : "",
    ctx.lastTime ? `\xDAltima atualiza\xE7\xE3o: ${ctx.lastTime}` : "",
    ctx.elapsed ? `Tempo sem atualiza\xE7\xE3o: ${ctx.elapsed}` : "",
    ctx.trigger === "client" ? "Motivo: o CLIENTE pediu um retorno agora." : "Motivo: lembrete peri\xF3dico da opera\xE7\xE3o."
  ].filter(Boolean).join("\n");
  try {
    const openai = new OpenAI({ apiKey, baseURL, timeout: 4e3, maxRetries: 0 });
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      max_completion_tokens: 120,
      messages: [
        {
          role: "system",
          content: `Voc\xEA \xE9 a "Central Torres", central de uma empresa de escolta/seguran\xE7a, falando NO PRIVADO com um agente de campo via WhatsApp. Escreva UMA mensagem curta (1 a 2 frases) pedindo que o agente registre a ATUALIZA\xC7\xC3O da miss\xE3o NO SISTEMA/APP. Inclua o n\xFAmero da OS naturalmente. VARIE SEMPRE o jeito de falar, a sauda\xE7\xE3o e a estrutura \u2014 NUNCA soe igual a uma mensagem anterior (isso causa bloqueio do WhatsApp). Tom de conversa REAL de WhatsApp entre colegas de trabalho: pode ser informal e descontra\xEDdo, usar abrevia\xE7\xF5es comuns \xE0s vezes (vc, t\xE1, pra, pq, blz, vlw) e nem sempre pontua\xE7\xE3o perfeita \u2014 soe como uma PESSOA digitando no celular, n\xE3o como um rob\xF4 com texto impec\xE1vel. No m\xE1ximo 1 emoji (pode n\xE3o usar). N\xC3O invente hor\xE1rios, locais nem dados que n\xE3o foram fornecidos. Responda s\xF3 com a mensagem, sem aspas.`
        },
        {
          role: "user",
          content: ctxInfo
        }
      ]
    });
    const out = response.choices?.[0]?.message?.content?.trim();
    return out && out.length > 0 ? casualize(out) : buildReminderFallback(ctx);
  } catch (e) {
    console.warn("[whatsapp-humanize] buildReminderMessage falhou:", e?.message);
    return buildReminderFallback(ctx);
  }
}
function varyForwardHeader() {
  return FORWARD_HEADERS[randInt(0, FORWARD_HEADERS.length - 1)];
}
function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function typingSecondsForMessage(msg, minS = 3, maxS = 14) {
  const base = Math.round((msg?.length || 0) / 14) + randInt(0, 2);
  return Math.min(maxS, Math.max(minS, base));
}
function reminderIntervalMinutes(count) {
  const c = Math.max(0, count || 0);
  if (c <= 2) return 30 + randInt(0, 12);
  if (c <= 4) return 50 + randInt(0, 15);
  if (c <= 6) return 80 + randInt(0, 20);
  return 120 + randInt(0, 30);
}
var SAUDACOES, IDENTIDADES, PEDIDOS_CRON, PEDIDOS_CLIENT, FECHOS, CASUAL_PAIRS, CASUAL_RE, FORWARD_HEADERS;
var init_whatsapp_humanize = __esm({
  "server/lib/whatsapp-humanize.ts"() {
    "use strict";
    SAUDACOES = [
      "Ol\xE1",
      "Oi",
      "Fala",
      "E a\xED",
      "Opa",
      "Salve",
      "Prezados",
      "Pessoal",
      "Eai",
      "Boa"
    ];
    IDENTIDADES = [
      "aqui \xE9 a Central Torres",
      "Central Torres falando",
      "da Central de Opera\xE7\xF5es Torres",
      "Central Torres na escuta",
      "aqui \xE9 da Central Torres",
      "\xE9 a Central Torres aqui",
      "Central Torres por aqui"
    ];
    PEDIDOS_CRON = [
      "consegue lan\xE7ar a atualiza\xE7\xE3o da miss\xE3o no sistema?",
      "pode atualizar a situa\xE7\xE3o pelo app, por favor?",
      "manda pra gente a posi\xE7\xE3o atual pelo sistema quando der?",
      "precisamos da atualiza\xE7\xE3o da miss\xE3o no sistema, pode registrar?",
      "d\xE1 um retorno da situa\xE7\xE3o pelo aplicativo, por gentileza?",
      "atualiza a miss\xE3o no sistema pra gente acompanhar?",
      "como est\xE1 a miss\xE3o? Registra a atualiza\xE7\xE3o no sistema, por favor.",
      "consegue dar uma atualizada no sistema pra gente?",
      "tudo certo por a\xED? Atualiza a miss\xE3o no app quando puder.",
      "passa pra gente como est\xE1, \xE9 s\xF3 registrar a atualiza\xE7\xE3o no sistema.",
      "lan\xE7a a atualiza\xE7\xE3o no sistema quando der uma brecha?"
    ];
    PEDIDOS_CLIENT = [
      "o cliente pediu um retorno \u2014 consegue atualizar a miss\xE3o no sistema agora?",
      "chegou uma solicita\xE7\xE3o do cliente, pode lan\xE7ar a atualiza\xE7\xE3o no sistema?",
      "o cliente est\xE1 pedindo posi\xE7\xE3o \u2014 atualiza a miss\xE3o no app, por favor?",
      "precisamos repassar a situa\xE7\xE3o ao cliente, registra a atualiza\xE7\xE3o no sistema?",
      "cliente solicitou status \u2014 manda a atualiza\xE7\xE3o da miss\xE3o pelo sistema, por gentileza?",
      "o cliente cobrou aqui, consegue atualizar a miss\xE3o no sistema rapidinho?",
      "deu uma cobrada do cliente \u2014 lan\xE7a a atualiza\xE7\xE3o no app pra gente repassar?"
    ];
    FECHOS = [
      "",
      " Obrigado!",
      " Valeu!",
      " Conto com voc\xEA.",
      " Agrade\xE7o!",
      " Fico no aguardo.",
      " Vlw!",
      " Abra\xE7o!",
      " Tmj!",
      " Qualquer coisa, chama."
    ];
    CASUAL_PAIRS = [
      ["voc\xEAs", "vcs"],
      ["voc\xEA", "vc"],
      ["est\xE1", "t\xE1"],
      ["estou", "t\xF4"],
      ["para", "pra"],
      ["por favor", "pfv"],
      ["por gentileza", "por favor"],
      ["porque", "pq"],
      ["tamb\xE9m", "tb"],
      ["qualquer", "qq"],
      ["mensagem", "msg"],
      ["quando", "qnd"]
    ];
    CASUAL_RE = CASUAL_PAIRS.map(([word, repl]) => [
      new RegExp(`(?<![A-Za-z\xC0-\xFF])${word}(?![A-Za-z\xC0-\xFF])`, "gi"),
      repl
    ]);
    FORWARD_HEADERS = [
      "Central Torres \u2014 atualiza\xE7\xE3o da miss\xE3o",
      "Central Torres informa",
      "Atualiza\xE7\xE3o da Central Torres",
      "Central de Opera\xE7\xF5es Torres",
      "Central Torres \u2014 segue o retorno",
      "Retorno da Central Torres"
    ];
  }
});

// server/cron-agent-central.ts
var cron_agent_central_exports = {};
__export(cron_agent_central_exports, {
  runAgentCentralCheck: () => runAgentCentralCheck
});
function minutesBetween(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / 6e4);
}
function fmtElapsed(min) {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}
function fmtTimeBRT(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function isPernoiteMessage(msg) {
  if (!msg) return false;
  if (RE_REINICIO.test(msg)) return false;
  return RE_PERNOITE.test(msg);
}
function toIntlPhone(rawPhone) {
  const digits = normalizePhone(rawPhone);
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12) return digits;
  return null;
}
async function runAgentCentralCheck() {
  const result = { scanned: 0, reminded: 0, skipped_nophone: 0, skipped_zapi_off: 0 };
  return result;
  if (!isZapiConfigured()) {
    return { ...result, skipped_zapi_off: 1 };
  }
  const { data: osRows, error: osErr } = await supabaseAdmin.from("service_orders").select("id, os_number, mission_status, mission_started_at, assigned_employee_id, assigned_employee_2_id, status").eq("status", "em_andamento");
  if (osErr) {
    log(`[agent-central] erro buscando OSs: ${osErr.message}`, "cron");
    return result;
  }
  const activeOs = (osRows || []).filter(
    (o) => !FINISHED_MISSION_STATUS.has(String(o.mission_status || "").toLowerCase())
  );
  result.scanned = activeOs.length;
  if (activeOs.length === 0) return result;
  const osIds = activeOs.map((o) => o.id);
  const { data: updates } = await supabaseAdmin.from("mission_updates").select("id, service_order_id, message, created_at").in("service_order_id", osIds).order("created_at", { ascending: false });
  const lastUpdateByOs = /* @__PURE__ */ new Map();
  for (const u of updates || []) {
    if (!lastUpdateByOs.has(u.service_order_id)) {
      lastUpdateByOs.set(u.service_order_id, u);
    }
  }
  const { data: reminders } = await supabaseAdmin.from("agent_central_reminders").select("service_order_id, last_reminded_at, reminder_count").in("service_order_id", osIds);
  const reminderByOs = /* @__PURE__ */ new Map();
  for (const r of reminders || []) {
    reminderByOs.set(r.service_order_id, r);
  }
  const empIdsSet = /* @__PURE__ */ new Set();
  for (const o of activeOs) {
    if (o.assigned_employee_id) empIdsSet.add(o.assigned_employee_id);
    if (o.assigned_employee_2_id) empIdsSet.add(o.assigned_employee_2_id);
  }
  const empIds = Array.from(empIdsSet);
  const empById = /* @__PURE__ */ new Map();
  if (empIds.length > 0) {
    const { data: emps } = await supabaseAdmin.from("employees").select("id, name, phone").in("id", empIds);
    for (const e of emps || []) empById.set(e.id, e);
  }
  const now = /* @__PURE__ */ new Date();
  let firstSendGlobal = true;
  for (const os of shuffle(activeOs)) {
    const lastUpd = lastUpdateByOs.get(os.id);
    const baseTimestampStr = lastUpd?.created_at || os.mission_started_at;
    if (!baseTimestampStr) continue;
    const baseTime = new Date(baseTimestampStr);
    const minutesSinceUpdate = minutesBetween(now, baseTime);
    const pernoite = isPernoiteMessage(lastUpd?.message || null);
    const threshold = pernoite ? GAP_MINUTES_PERNOITE : GAP_MINUTES_RODANDO;
    if (minutesSinceUpdate < threshold) continue;
    const existing = reminderByOs.get(os.id);
    if (existing) {
      const lastRem = new Date(existing.last_reminded_at);
      const minutesSinceReminder = minutesBetween(now, lastRem);
      if (minutesSinceReminder < reminderIntervalMinutes(existing.reminder_count)) continue;
    }
    const phones = [];
    for (const eid of [os.assigned_employee_id, os.assigned_employee_2_id]) {
      if (!eid) continue;
      const emp = empById.get(eid);
      if (!emp) continue;
      const intl = toIntlPhone(emp.phone);
      if (intl) phones.push({ name: emp.name, phone: intl });
    }
    if (phones.length === 0) {
      result.skipped_nophone++;
      log(`[agent-central] OS ${os.os_number || os.id}: sem telefone vinculado, pulando`, "cron");
      continue;
    }
    const lastTime = fmtTimeBRT(baseTimestampStr);
    const elapsed = fmtElapsed(minutesSinceUpdate);
    const estado = pernoite ? "PERNOITE" : "RODANDO";
    const osLabel = os.os_number || `#${os.id}`;
    let sentAny = false;
    for (const p of shuffle(phones)) {
      try {
        const msg = await buildReminderMessage({
          osLabel,
          trigger: "cron",
          estado,
          lastTime,
          elapsed
        });
        if (!firstSendGlobal) await sleep2(humanDelayMs(6e3, 26e3));
        firstSendGlobal = false;
        const r = await sendText({
          groupOrPhone: p.phone,
          message: msg,
          delayTypingSeconds: typingSecondsForMessage(msg)
        });
        if (r.ok) {
          sentAny = true;
          log(`[agent-central] OS ${os.os_number || os.id} \u2192 ${p.name} (${p.phone}) OK`, "cron");
        } else {
          log(`[agent-central] OS ${os.os_number || os.id} \u2192 ${p.name} FALHOU: ${r.error}`, "cron");
        }
      } catch (e) {
        log(`[agent-central] OS ${os.os_number || os.id} \u2192 ${p.name} ERRO: ${e.message}`, "cron");
      }
    }
    if (sentAny) {
      result.reminded++;
      const newCount = (existing?.reminder_count || 0) + 1;
      await supabaseAdmin.from("agent_central_reminders").upsert({
        service_order_id: os.id,
        last_reminded_at: now.toISOString(),
        reminder_count: newCount
      }, { onConflict: "service_order_id" });
    }
  }
  return result;
}
var FINISHED_MISSION_STATUS, GAP_MINUTES_RODANDO, GAP_MINUTES_PERNOITE, RE_PERNOITE, RE_REINICIO;
var init_cron_agent_central = __esm({
  "server/cron-agent-central.ts"() {
    "use strict";
    init_supabase();
    init_zapi();
    init_normalize_contact();
    init_logger();
    init_whatsapp_humanize();
    FINISHED_MISSION_STATUS = /* @__PURE__ */ new Set([
      "encerrada",
      "retorno_base",
      "chegada_base",
      "finalizada",
      "cancelada",
      "recusada"
    ]);
    GAP_MINUTES_RODANDO = 80;
    GAP_MINUTES_PERNOITE = 130;
    RE_PERNOITE = /pernoite/i;
    RE_REINICIO = /\b(rein[ií]cio|reiniciar|reiniciamos|reiniciei|sa[ií]\s*(do)?\s*pernoite|saindo\s*(do)?\s*pernoite|voltei\s+a\s+rodar|em\s+movimento|rodando\s+novamente|retomando\s+viagem)\b/i;
  }
});

// server/lib/agent-central-fleet-resumo.ts
function samePhone11(a, b) {
  return a.slice(-11) === b.slice(-11);
}
function isResumoAuthorizedPhone(phone) {
  const d = normalizePhone(phone);
  if (!d) return false;
  return RESUMO_AUTHORIZED_PHONES.some((auth) => samePhone11(d, auth));
}
function firstName(full) {
  if (!full) return "";
  return String(full).trim().split(/\s+/)[0] || "";
}
function fmtBRL2(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function osDistanciaKm(o) {
  const fromText = extractKmFromText(o.destination) || extractKmFromText(o.route);
  if (fromText) return fromText;
  const oLat = Number(o.origin_lat);
  const oLng = Number(o.origin_lng);
  const dLat = Number(o.destination_lat);
  const dLng = Number(o.destination_lng);
  if (!oLat || !oLng || !dLat || !dLng) return null;
  let km = Math.round(haversineDist(oLat, oLng, dLat, dLng) / 1e3 * 1.4);
  if (o.pedagio_ida_volta) km *= 2;
  return km;
}
function vtrStatusLabel(activeOs) {
  if (!activeOs) return "DISPON\xCDVEL";
  const ms = String(activeOs.mission_status || "").toLowerCase();
  if (FINISHED_MISSION_STATUS2.has(ms)) return "DISPON\xCDVEL";
  if (ms === "aguardando" || ms === "agendada") return "AGENDADA";
  return "EM VIAGEM";
}
async function buildFleetVtrSummary() {
  const today = brtDateKey((/* @__PURE__ */ new Date()).toISOString()) || (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { data: vehicles } = await supabaseAdmin.from("vehicles").select("id, plate, frota, status").order("frota", { ascending: true, nullsFirst: false }).order("id", { ascending: true });
  const vtrs = vehicles || [];
  if (vtrs.length === 0) {
    return "Nenhuma viatura cadastrada no sistema.";
  }
  const { data: osRows } = await supabaseAdmin.from("service_orders").select(
    "id, os_number, vehicle_id, status, mission_status, origin, destination, route, origin_lat, origin_lng, destination_lat, destination_lng, pedagio_ida_volta, scheduled_date, mission_started_at, completed_date, assigned_employee_id, assigned_employee_2_id"
  ).not("vehicle_id", "is", null);
  const allOs = (osRows || []).filter((o) => o.vehicle_id);
  const osTodayByVehicle = /* @__PURE__ */ new Map();
  for (const o of allOs) {
    const vid = o.vehicle_id;
    const day = brtDateKey(o.scheduled_date) || brtDateKey(o.mission_started_at) || brtDateKey(o.completed_date);
    if (day !== today) continue;
    if (!osTodayByVehicle.has(vid)) osTodayByVehicle.set(vid, []);
    osTodayByVehicle.get(vid).push(o);
  }
  const osIdsToday = Array.from(osTodayByVehicle.values()).flat().map((o) => o.id);
  const fatByOs = /* @__PURE__ */ new Map();
  if (osIdsToday.length > 0) {
    const { data: billings } = await supabaseAdmin.from("escort_billings").select("service_order_id, fat_total").in("service_order_id", osIdsToday);
    for (const b of billings || []) {
      fatByOs.set(b.service_order_id, Number(b.fat_total) || 0);
    }
  }
  const empIds = /* @__PURE__ */ new Set();
  for (const o of allOs) {
    if (o.assigned_employee_id) empIds.add(o.assigned_employee_id);
    if (o.assigned_employee_2_id) empIds.add(o.assigned_employee_2_id);
  }
  const nomePorEmp = /* @__PURE__ */ new Map();
  if (empIds.size > 0) {
    const { data: emps } = await supabaseAdmin.from("employees").select("id, name").in("id", Array.from(empIds));
    for (const e of emps || []) {
      nomePorEmp.set(e.id, firstName(e.name));
    }
  }
  const activeOsByVehicle = /* @__PURE__ */ new Map();
  for (const o of allOs) {
    if (o.status !== "em_andamento") continue;
    if (FINISHED_MISSION_STATUS2.has(String(o.mission_status || "").toLowerCase())) continue;
    const vid = o.vehicle_id;
    if (!activeOsByVehicle.has(vid)) activeOsByVehicle.set(vid, o);
  }
  const lines = [];
  lines.push(`\u{1F6E1}\uFE0F *RESUMO VTR \u2014 ${today.split("-").reverse().join("/")}*`);
  lines.push("");
  vtrs.forEach((v, idx) => {
    const n = String(idx + 1).padStart(2, "0");
    const plate = (v.plate || "\u2014").toUpperCase();
    const current = activeOsByVehicle.get(v.id) || null;
    const status = vtrStatusLabel(current);
    lines.push(`VTR ${n} - *${plate}* - *${status}*`);
    lines.push("");
    if (current) {
      lines.push(`Origem: ${current.origin || "\u2014"}`);
      lines.push(`Destino: ${current.destination || "\u2014"}`);
      const dist = osDistanciaKm(current);
      lines.push(`Distancia: ${dist != null ? `${dist} km` : "\u2014"}`);
    } else {
      lines.push("Origem: \u2014");
      lines.push("Destino: \u2014");
      lines.push("Distancia: \u2014");
    }
    lines.push("");
    const todayList = (osTodayByVehicle.get(v.id) || []).slice().sort((a, b) => String(a.scheduled_date || a.mission_started_at || "").localeCompare(String(b.scheduled_date || b.mission_started_at || "")));
    lines.push(`Quantas OS pra ela hoje? ${todayList.length}`);
    const fatTotal = todayList.reduce((sum, o) => sum + (fatByOs.get(o.id) || 0), 0);
    lines.push(`Qual faturamento dela hoje? ${todayList.length > 0 ? fmtBRL2(fatTotal) : "\u2014"}`);
    const agentOs = current || todayList[0] || null;
    const agentes = agentOs ? [agentOs.assigned_employee_id, agentOs.assigned_employee_2_id].map((id) => (typeof id === "number" ? nomePorEmp.get(id) : "") || "").filter(Boolean).join(" e ") : "";
    lines.push(`Nome dos agentes? ${agentes || "\u2014"}`);
    lines.push("");
    const upcoming = todayList.filter((o) => !current || o.id !== current.id);
    if (upcoming.length === 0) {
      lines.push("Tem mais alguma viagem pra ela, ap\xF3s essa? N\xE3o");
    } else {
      const lista = upcoming.map((o) => o.os_number || `#${o.id}`).join(", ");
      lines.push(`Tem mais alguma viagem pra ela, ap\xF3s essa? Sim \u2014 ${lista}`);
    }
    lines.push("");
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
var RESUMO_AUTHORIZED_PHONES, FINISHED_MISSION_STATUS2;
var init_agent_central_fleet_resumo = __esm({
  "server/lib/agent-central-fleet-resumo.ts"() {
    "use strict";
    init_supabase();
    init_normalize_contact();
    init_brt_date();
    init_helpers();
    init_billing_calc();
    RESUMO_AUTHORIZED_PHONES = ["11954563755", "11963696699"];
    FINISHED_MISSION_STATUS2 = /* @__PURE__ */ new Set([
      "encerrada",
      "retorno_base",
      "chegada_base",
      "finalizada",
      "cancelada",
      "recusada"
    ]);
  }
});

// server/lib/watermark-assets.ts
var WM_LOGO_WHITE_B64, WM_WHATSAPP_PATH;
var init_watermark_assets = __esm({
  "server/lib/watermark-assets.ts"() {
    "use strict";
    WM_LOGO_WHITE_B64 = "iVBORw0KGgoAAAANSUhEUgAAAU0AAAFUCAYAAACgKW6XAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAgAElEQVR42u1dB7xUxdV39z0ICChFFLBgiahgr7FGrBQVjR1ji8ZobDFGTYyKXbFgQyyIKMauqKhBsffeEEHFrp/diIoi+7K734yeIX+Oc3fvzJ27e/e9c36/w33s23fvnfafM6cusIBQalQul/N03UDxGYr/USqV/qmux9H1WMUjFJ+i+DTi0xWfr/gSxRcrvpBYfzZK8bmKz6GfL6CfT1Z8EvGJdD2FrsfTZ5r/rnhzeqdcSm3OKW6neFPFl1G7T1V8tuLzqC26bWMUX0T/H0W/P5eup9Pf6Z9HKj5Tf1/12TXqOkHxVYqvVHyF4svpfqPpnpfRz/rel9LvLqTfjaH7rZhyH5hxX0/xRMXj6H1G0/tcQZ9dSW26XvENiq+l978U3vdSxqbfLqbv36b4ZnWff1Gf6PuOZd/T/fh7WZFCjQCaTXS9qfwztZTrR0X9j1pcL9Wizeo5R9Dz/lvOCMG7HI3vmuK435CBPijS9XXFzWluFkJCaYDmjwScBWL8ORS3WP7fQs/W9GLKbTYL80Boc8i2IUf9Purv5xCIHVEj0Lw5Rh9Ua1Mh4d+acX8V3ktAUyjzoHkDTVw9iUvAqQtXhkHaeapGkuYeIGXVqs2liGeZ/xtJf99aSpr03FI9+sGMu7q+IitSqJFA8/oI0EyT+SJqocXzRMr6PNPmHQE0izVsdyXgNKC5V41A87oKoFmTNsNmOVVWpFAjgeZ1dQBNXEAIGI/VCDS3BZ1a1kBzz1qAJhl56gGaJYseV0BTSEDTkY2k+ZCAZm1Ak6z89QLNkkiaQo0MmtdmBTQV3V8j0ByWkeO5TdrevUagOV5AU0jIw5IMx7S2BJo7RxiC6gaaYBT5XRsEzWngPyrWc6FsS5rkeJwV0Hy4RqC5W1ZBU9H2NQLNcRkCzdfET1NIjud+i+epGrV5p6xZz6EPdq4RaI7NEGhO15FaAppCYghyl7KerlGbt8qwIWh4jUDz8gyB5gzF7QU0hRotIqiQAX3eszVSSfwWwCproLlrjUDzsoxJmnI8FxLn9qyCprpuIZLmT4k5sqTTlDBKIdFpZhg0B2cANKOiovYQ0BQSEp1mXB/FWhmCts4qaNbQT/OSDEUEifVcSEDTEzSfrJHLUZZBs1Y6zTECmkJCjeenWS9JM8thlDu1AUOQDTTleC7UGBFBlG08U5JmDUBz84yAZj0jgi6WiCAhIT/QvDpDEUGP0jvpkhTNFm5inHfgJnCgXoXaW84AaJYinNvbW9rbFKAPjD/kuVmKPRewFBLQ9Fs8L7QhQ1DUxnFYjSTNazMEmpK5XUh0mo5sasV8SYXYjiQ+Shd8Ax4BRd5GUijg1WTMuoF8Tq+GomZjqaDXpVRATf/dWYofz5KUyfrgGeqDEfTOJ0MxOvP+pnDdxaSbHEftNP0xAQqi3UjXq+n7psDbJ/XuAwFNIXFuD29VrmX5iZK0v66gKWAp1PA1gurFSYp3VeJ5f5eR7EaVgMS3qFshZh+0ZEHKZoYgAU0hkTSFhcV6LiSgma1ja1sAl9bY5rKAppDEngsL+zu3i05TSEBTWNhB0hTQFJLYc2FhR52muBwJiU5TWFiSEAuJpCksHF6nKeUuhESnKSzsAJqvq59/JaApJM7twsLxDEEzBDSFRNIUFhZJU0gSdggLpwKabyruKKApJKApLBzPev6W4s4CmkICmsLC8UBzpuIFBTSFGiIJsZq41whoCovLkZCQgKZw40iakoRYSEBTWNgBNF8WsBSSapTCwjFBU11fEdAUEkOQsLBbNUrJpynUMM7tN9e7KqGwgKasSKFGAE2zs98ioCkshdWEhOJLmjfJ8Vw4A8dzAU0hAU1hYQFNIdFpCgsLaAoJaIqkKSygKSQkx3NhMQQJCUkSYuFWCJo69rzdAuKnKSSF1YSFY4Hm65KwQ0hAU1i4Os+lufegAKaQ6DSFhStzAXJprroABFwICQloCgv/j4sGMNXx/Al16SNSppC4HAkLRwNmC823q6AukEiYQg0Ve36rOLcL16JcLxh+ztDzT0uXAphCAprCwr9kM7eKCjj/SPOuWY7kQqLTFBZmEqY5jiuw/ExdtjVzTwBTqJFB80YBTeGULeS6rvkqWDFASEgigoSF/yddosHnXrCQC2AKiXO7sLClLK8BzEsgPFIMPkICmsLC3EJOUqamUwxYCmAKiSFIWNhuIS8SeP5RDD5CAprCwpUBU9PnigeLS5GQgKawcHUL+fuK18a5JSQk5S6EhS0x5IqeUry4WMiF2kpE0G0CmsIJYsj1pttDJEwhCaMUFo5IHAwx5GeJhVxIdJrCwtUNPj8qPlgs5EICmgIKwlUAU0mZX6vLsJCAKaArJGGUwq3VQj4dsqw3C2AKtVXQvE5AUziGhfwRxb1CGnxAr76UWN2FBDSFW5OFXHtYLBwYMJvp2k/x/erYv5BInkJS7kK4NQDmpUZ3GcJCTvcxgDlY8UcKMN9T1wUFNIUaxeVoYhKXI0jSIGDTemqRm/E8KqRLEQGm2az/RFZ4TTPUc38loCnUFiTNFkgHJsDZeizkP6jL3oENPqYmkL7f6TDnNE0TsBRq7c7tJv3XR4qnGNCk67zcigJCjWchV2P4H3UZGBow6doZ5lsBVACvwSYu4CmUedC8PQFovqVD6BQfZtGFlQU8G86l6MXQZSkADHsrfpSeMxc2WU1vKO4goCnUmnWaBjQ/VLwo3WcXxd/DvYoidTaUS9H9KVrI+yqeytVAAJqvK24voCnUanWaMNl1OrDucM811e9egfuJnjPbBh9zKrgWJL3QgLmZetYHto0Z5tF0KIshoCnU+qpRmsmuru+qS1e2SLqA9FoAPadIndlMujEqBZciM7d2ZqePqM13hoCmUKsOo4TJ/jYc6XKw+DSfSd8pSgalTCbdKIQuS2HGnn7+G9Nzl6qAphzPhVpvYTWY7DO1ZImTnVxLzL13owQPUfcXqbM+LkVfqcvQwID505hrf0v18xXGFY2dNKLmkRiChNqMTvMtlDQjoj5WJT882zPkuF57CVO796weWH/ZBC5Fd8TVacM8elNxRwFNoVZrPY86nldYTNot6QHLYhK3pBpayNW4PaQuiwV2KTKb43KKn3bZgNmJRcIohdoEaL4DhqBcFSmkg+JxEcc2Ac2UABPGajSEKoaWMDcl9zPfE4u4HAm17hpBLqDJY5fV3x4DICkGotrEkB8LapPQFvIdFc/2yV8A80gigoRafWG1Ivhpdosz2S0L7VupTZS6/nKO4t1TiCE343gQjF+LJ7Cb2PO8gKZQWwij/NA4t8eZ7Aw4+1PpV3GETyckUo/NZinFkGtVy0VxLOQCmkKSsANAkyI9urtOdnh2J8UTLKGXwslCIrVhZeWUYsg7QkBEojED0HxVwFKoLYVRdvOREMg/0IDnKcYR3ldqEcCcdyR/ACzkoQ0+fZmFvBhA76ppqqxIoTYBmiyMMpfQoLC34lmSRT4RYF4PwQahAXNDitwJNj4ImiJpCjUiaKZqCIoJnKuR+4noOd0s5JpOC2khZz6YW/tayOV4LiSx5wF0mlUWaG8TVZLEyNCGLOQazA7C7OgpJN34Lg1PB2YIEpcjoTaRsOOdJMfzCD2niWE/HiRNcUuKtpCvn0LSDaNrPtDMizQ2L+an2SygKdQooHlLqCxHoaz68G7bUXIJ0XP+EjB1MbKVAlvIDVi2D+FS5DCPJJ+mkBiCAurTBrCEH0VxKfopy/qiKRl8FmYBD8WUdbISRikkLkcpvGNXSGHX0tb0nCxp8OWQ3CI0YC4FdXxS36AQNKWEr1BbAc130pI0eelX+vkkZghpSxZy3d4jQ9YhZxL9aqRuSWLwcfKzlcztQo0KmjdlSadZATiboYBbVNx6uZVayLX/6jYhQyIZYA5U/EVSwHQdA9FpCrX1GkG5lN8XExuvBVJRwWfBNhBgfop1yFPoy2GKv0kAmGVmpHqZSvSWHXWakrldqE2Uu6iJpBnx3ospvrdCAbfWkDT4JXX5dWD9JfpgHmKAMoGeuAh/vy+BcNlxHr0hmduFGgk0r0sAmm/yGkE1TjayoPEzZa4xjZoNnseQ9w4MmHke7580SxHMBaNv3c/ct9oYsHkkmduF2oRz+1vq54XqMdmZP+ch8E4tDVqDqAiFz64Byasp8EajdaKXBHApaoF77A3P+QMDzbLUCBISSTMDoGk5am5h0XOWG0h/aYDz+BQs5KaPllH8cEJdMKoP/k9dtqJ7Gz/L3djmVY6p5uksoCnUKKB5bcLaLnWd7Aw4F1F8d4Q/ZznjBh8d371jCiGRaDybmdAHE6XhZ3UxNXhfMwa7e4CmrmraSUBTqCFAU03cfyUAzdeyoouCRasX8BlMX1fOaOVLA0AfKP5tChZyM8a/s7hplT0kTAPwN4MBsJn1/3AP0Jwpx3OhtqLTfDVLk53pOQ+0HH+zBJoFkNaXTwsw1XUvqhWURN+LgDnGloIOnrcT6DRdQFMMQUJtwrl9atb86xhgDKL0dVlK+IEx5Fq/uGQKLkXG6DMiIiN+2dNCfrqJ0OL6VujzHRholsQQJCSSZoZBM8L48UwFa3G5Ti5Fk1KIIc8BjwpU+MwY1A6uFJHEKo26gqYk7BBqM87t07IsIUAbO9Qi1ZmDxHamMfakYCHvhMlNArgUaV3obtUMVEx/KqApJC5HtbCem6N1yIXDHLoPrlK2oZxi0g3z/7+HtJBb0rpNDpClyADmR4o3jqNvhXfY3gM0ZwhoCjUSaF4dAZrleoVRhpTALK43Gyj+uEKbQ1vZDQBpY8zuKQImrxSZ9H21Z0TfuOoDeI9tPUDzNSl3IdRIoHmpK2iyGkE9kk52SP22IaV/6xRS12fJ6vNrxc9bjrChQbMAm8smKQCmac/GVPoiKWCa930cQjibHeeTM2iq6yuyIoUaATTNghsV4b8XBzS/gsWVDwDgW9NzH4Ta3c0pbRZdIMNTaOBEC7k2Qi2egsGnGSKhvolwKfKJ8vk3nB6aPPp1r7gZk0DSfFFWpFAjgeaJHk7PRThyLh0QNLeC52s91zqhc0hiYmPikVUc4csJAHMSSOJpZCna2+KD6fTerN3ngzdE3nMMj3MFTR1dJEdzoUY6ng+3OCPHBc0WCKULAZpbwBHThBYODx2LHQE+cy3H23ICn8bz4P750EYt9ZxjIrwByh4uRfr/RyfpZ2jrGIfcnEZ/+qSAplAjhVH+1gM0sbzBSgFBc6BxxoYjs6azwQLelJKBaGOSbm2W57KDhVzn9jwihaQbedCJXllBreCkv1Tv+rV2SE8q0XvmMjCgeX/IzUVIKO2clOsCULksPgNoA5OCWQRoGiAyUuedqOcMfFw3z19U8T0eBdzM4te6xWEpWsh14uU7QiXdoMJ464bYjCwloVscYu//JaAp1EiguQoDybigaRbe4UkNNlGgaVnk2m9wy9CgZEn4cZpDATeMIV8tBWnYSMLLU4bzpHV8sAzwUqGMbTCf7nF4R/MuI9LwlhASSgs0lwbra9EBNM2EPycgaG5iAU0O0lr3eDwYckIf1827bKMkoM8qHDURgJ4EAGpKAcjXChBDP1+SYyiZ2xSi38AjYWYMl6Mym0P7pOEpISQUPLEFXTuTlBQr27ZFJ/avADpNA+DrVwBNbmgZH3LhRwBnP+1DaAErlH5vAItzcJcirXMm1y5vCZMn3QgdQADj11c954dKY8hA0/ThTgKaQg0FnGqiPwGLsuxSSZCKfzUnsX7ColszpuXeAPYTkFYt9HHdtKk3y3begmnSALjzKeTB3EP9/GPCIzlK6H+GvgrpiWDGb+WYG64BVXOy2VSO50KNdkS/wxE08Sj/RdJQSniPAZY62tXA4Auw/oYGAyNxtlN8BZPGTwn9TBYnH5XWzTfpxqA0jGisn/aJGQ1UhgCJ/4Dzv7gcCTWMr+bJCUBTSzCrJpG2ACj6OVqE0aFbt6FdaCssvFs7tcBP0HpO5lKUC/0cxeM8LPhROmcdXrlRmsdfkMrPj6l3LbNQXKl5LtRwoLm7B2iiJLNfkkUJ+tXFSHIsxwVPAhXzHlN0naDQAMHyVC6cAjCbcejJrM/FhBZynVl/hbT1hTB+93iEUL4KG4aAplDDHM/XAeApOYAmdxlpDvAukzx0eEXm+tM/JeBsSgswdZCAMcgl9ME0/aBVLt3T1hUyy/mnDhuemW9Xi4+mUENKnMZKHKe2i0XSnBIg05EBpF0SuNZgadmtUzIQ5VIqP/xpEpciZiEfB/kp8zXaeFeH+VB0GKtjxHIu1Ogp4lpckxETSHVPaAzKgaHi6QQW4xYI8fxLGnHrgcM3D4SNqiVBDLn5+4Nr2WZox6EOoI/RZ5uJ5VyoUbMd7c8mfTlm7LmRboYGCKc0UsuWIPUWE0pdE3i52QxUzDTt/AeLtU9iIdcZ6XdOQ7pOmJe1UmrBr5NutkJC9ZQ0N7bElbss2vNCxjCbLD6BYqxf1uGitQaUKoB5Vqg6PiTpb1TrjQFOB+1NiGdMa78Zl4dDqz2EhGo58bsavRpIaS71gl5I4Z3ODWUYoaiaHet1XGd1fK4NAJgFKBWxcj0kabbhlmP61+K7nyf6TKFGB87JnpZrA2yrhTA+MCPJqEASmXnPc9NIM+dQTvjFUC5FaiN4qBYW8hjtOtXFiAUb7U6izxRqdL3msZ4WXHPc2j9kEggAtxMDRMdgwgpd0mHRWixY6NuV1XPfDZB0Y15WeHW/heoJOrDZPu9wNC+CDravuBsJNbq/5nqOxywOmvem5ZajFuQfKfqolBA4C1BOY7W0QgsZYG5KesdEgAkS2qVw73yd58zq8F5FBz3sQ6LLFGoNiTt+xTIelRwTEv8IjuX5FMBnswr+jC6ZywuQNHiXFGLI0aVod0sdH283KsVHpVHmOMHR/CTHtrVIDk2h1nZEP9/D9ci2GJpTer/+it8MAJwIRKdCsbWmgPrYA5mUmMSl6HvUAdZTQoNj+YJkiCo7tM9ssOvK0VyoVdUMYg7IVUMq4Yimj70d0zh6ARj1oTK/UfV8yh5x6xMVd0si/Zj4dJYEpRgg6cbH6FJU7yMtj96K2z42RyRJh1CrsaB3UDzVYTGULYti+7SOXiwb0ISELklczzlNp6fzASdWT31CKB9MyoS+SpZccxLkCTBtOl+O5kKtzdH9VE8dnFkUk9KUIjAlG6gTkqRRw3efpZP/uug5QXWgC7M9E9Ap/1HFvbIEMACY/aHscTFmuyTpsFCrtaKvCQuhWEm6rFAPfZ00dVYEnAbkj2aAUwrgzzkyTn5OAMwBJKmaHKNeSTcAMMdrnWHWwAX6/DxP38xp0K9yNBdqtSUwSpaKldUktstqkZaM6dfmOBolqgHXHVF6TkvN9I8D1vEZkdFEI2ZTXZEV43PRz54mUqZQaz2iH+wJmvPKYCgQWKIWEgWA10ZUy9sGXmVPPed01HNG+I+2xCz3W82SPxcDBLImiUH7T3b0OUVg3Uis5kKt1SCk9XOfWyzpcazTxoH5hFpJFVC9cQkIVUzikoRS8ydQY6cJJK4jQ9XxoVo5g7JiIa9SvfRtR4l+no5WVphQW8mxWXAETSNtatDtUyv9Fbx3Dyi9EOWS5OrPqQ1N/6Qjs7bcX2SAI4BLkfY7XTvLySugb4/zUEMEKYsiJNQoBqEWVkitEuiULaUwTqnlQrG5JEUAm5M/J+gbJ1Lseqg6Ps9ANcbmjM8HH12mmTdabdJVDEBCbeGYfrtFt2kDT/7/IuR67FXLxYIuSTp7OwBeIj0n3KccInGIro9T76QbjlLm6ARS5hkiZQq1FWlz0wp6zWpHXbNgzqw1MDDL+vaKvwwAnKZNISzkI7MQQx53HlDht1meUqbOaNRPDEBCbUnavDOmtBm1aL4FC3S+ThbffpTBPUmmoVJCVyYjZR6YVQt5BdC8JoGUOVbcjITamrS5kQUIyzGNKkZ3NyEDyXK7V4hZT5NbYPPYroEA0/Tb+iBh+kiZK4qUKdQWgfO2KtJmVNTQvGO9TgaSAeDUmXmuDxAb7upS9BW0v7mRxp4Zvlw3istFyhRqq6C5IYBMMQZw2hJ5PA2hgbk6FTbL0fWMCj6WZQ9dZyUL+ctZS7rhsMn8wcPwZaTMOVC/SKRMoTYJnNc6SJv8s0wkn2UGov0ocXLZUnO8nBAwTXvvqmcdn4QS5hLk2F92lMgLLJRWAFOozYLm2rAgquk2rS5IJH1smAHgbIYSH2+E0nOCwadMZXqbGu14CgbAWxMU2pslFnMhiRL6+Xp2DEt6FJAa/d6zGMedgVjq3oqfDJQD0wDHn0KX0ahxnxzq4WlQBgn7JNFlCon70f9CFGda6giVY/pwmkV1YhZ0fLAZtKN0cL6hkVhffZusxpDHPFEMUO342vVYDrprneSkk0T/CAlw/k8KOaxCTHoc303DQ7MgjWBuTrXwjzDv5wCcRmWh6+Ws3ogSFmyKHSn5cZIk1MNFyhQSYiUxFKC8FEParCaRaCPDslnQe6GeU73f78inshpwoIX8boitbmpg9cvpngEABjAfkVBJISH7EW4gZCgvugInLLIHdengLBzlGHD+VvFnFQAELeTXQjG5pgY+QezKTgMuxh/Dm4jxR0goWio5xQIqPtFCF2SsDk4zZPX5hWWdZXcfwZOENOhYrg/12YueKe5Ol2O5kFDlY3onKCTWUgE4qxoP9JE4Y8BpwKQ3RMQUDHiSseiPjRISWeXUsLji1330mKBqeVXxwmL8ERKqvuBWU/xdlUxIUe4pZabf7Je1youmlrniMczndN9GtJBbNj7tNTDF0/CDBrMtRcoUEoovjf2jyjG9VCVhsTnqPgfGlHwGgfNgesdtGz03JGx6F1YoDVKt1n2B5coUwBQSimE4MTylyjE9rvX13qwYhlg78zbQaWTXMXKv8imeh+Ol1TMd5FguJOQusfSDRL9FzzhunkYunzHgbMp60mAHI9f2zOrtssEVwZF/FbGWCwn5H9P3Aj1lsexXyEyOfOlLmL8xET8WP1sXn8z9ZYyEhJID54UJy+cWIUb9CKkrE3x8+iv+tEJgQtxN7WIBTCGhMNbYLmoxPhHDfzNuEbMDBDiDAeYqVBXSp1ZSGTazlyS2XEgorH5TZw2akcR/E4ET/CHbSS97A+byit+pkKGqFNOf9j/azUykTCGh8ItU+29+Ycn67eT4DhLnH0Ti9B6LpVhkk8vmVWYb2O8EMIWE0lusW0Bm9KKvjhMMS3sJcDqPQR/FLyTMTm8MP8cJYAoJ1ciiHpEEwhU4Rcfp1vdrKH67Shq/uIaf8xo5ZFRIqNF8Ag+PyIruqlMz/oQHyQKu2ueDFX/uq8NkgHmnCReV/hYSqp3UM7qKK5KrxHmUAGdk3aNdAPBaHDNPccB8XPX5QguIA7uQUM1dkdornhQCOAEIzgOgyLdlrwXYnI40hrcKBri4Okyd+WhpAUwhoTpmfFd8X0Lnd54xfaLizm3VQIFHZp3b00iXFTLqxwJM9ffvqstyYvgREqq/D+fCakE+RAt4bgWJs+wAnM9B2YzmtnJcB+myq+rTayyA6Sthfqx4HQFMIaHsAGdXKJlbqJA2zmWhf6h407ai5wS1xNKmXhOr2172dCvSSVfWEsAUEsqedNRd8cMxgNNlwWuf0KPhGflWehw37dsYonwKnpsOB8zNxKVLSCjDEicc1ZMYh3jdnmshJ2dTa9pwADD3VG38wTPjug0wZyneQABTSCj7wKnrDN1jOV76SEyo59TJcVdoLcd1AEvdlnNYeKOrZP4LHaauvimAKSTUWMB5S4QDfBLLunbu3gXccvINfhwfgBnyEwJmAWozrSk6TCGhxvIxNFnRLw4kcZYAfMtUFK250YABgV5d91Y827KxJAHMmbpMsUiYQkKNKU0ZcDjRcvQMoed8EBy1M31cZ9E9XSCaqpgg6QYHzDdQfSGzUEiosY+hfzKSVAKfQ1sm+M8U7xFVLC2D0T3Lq/d9NtBxHNUWjyteTABTSKh1xU9vC4XaCgmBkx/Xr1a8SNac4QEs9TsdwtpfTAiYRuK+CWLJBTCFhFphPZuZoYCTHdffUrwhd+XJgHSpndX/HaGi8GozJDkZlWUpW0hIKAxw9qUwyUoRLz5GInO/0yF2vaZSJ5YFpv8PN0XP9LtZALOUQLo+OmtlkYWEhNIDTm0MuTVGMoqypwT2Arjd1MQ1iUmXPXWt9whjT1wuRxh8dMmR7dpaXL6QkLgk/Xw9o4oV2cdIZMBlDlmpu8GRPZ+ywUu36UDylayUbMMFNOe1ScekK15JXIqEhNp2vsj9wV8xhD9nCcBK0wyIjsmH1HUyv8vlIL9oKcKpv+TbDp31CAw+AphCQm25lIOWnhS/Ehg4i0zXiVJnoiM7SpcayNTPZyv+LoB0adPTfqv4z2LwERIS4nrOHtp9JkYOSW8LOyXi3ZUlzMh5JNkwhp4hiqdX0F36gCWC/XTIgyn6SyEhISsQ/Y3VwykFkNqKrBjZXZDkONaRHXWi2pFc8Xh4n5YEeS+j1ArXy3FcSEgorp5z2wrGFG8pjkmd/1H8F/Vjx0pHdvZeui7SvurvPgCwbEkqDTPpcq5xJxKHdSEhIRdLdE9wS4py2ykH8Hd8VZfHRZ0hMErA6yt+qoKhp5wUyOld1pWqnEJCQklyTe5dRer09usEsNLgd4fi1SzFzbRVfCyqDCIkX1e/S9wI9M9X6npLIl0KCQmFOK73UXx7TJ9O58xJoEf8jnxHe5Pe8kyyXpcBZEtJAROfqa7vaXVEI+cIFRISyq6RaF8IS6xmYfdxii9C9cZPQh/Fme6ySPlGu8txXEhIKE2pcyk6SqPUWQzhnsRArRzIQd1mGX9T8ZYiXQoJCdVS6txH59MMGb/OwDNJiY4yC4NEy/hI1F0KYAoJCdVS6lwSahFxq3gI8EzCRfY+TyteT6RLISGhurkmgdSp/TpfNwabgLpOL2bGpW8UH6V9PEW6FBISykeqgE8AACAASURBVFItoi5UCrcQw/G8nKJ0WYBnaot/vzSShQgJCQkl1XUa8FxL8WMRhqI0gRMNPdryPtwmFQsJCQllMZqoPbknvcV8LIODJwvN/EFdLlTcS47iQkJCjVhbvJviCxT/GEPfmSgJiLrvQ+qyCgdwISEhoUZ0T1qdJwiOcFHysYq/r3hPFvop0qWQkFBjH9np/79X/E6C7Oqot5xDR/FFxY1ISEioNR/Zu+iUcMYxPk5MOXMhKlNE0gA5igsJCbUl8OxDJTDmRIEn+6xMpYeHwLFfrOJCQkJtxjHegOcAiioqMvBEsHxD8e4mg7roLYWEhNp0OCb9fzDz79QA+pniY/SRXhzUhYSEhP4nNWLd8l1I8jwZjDzioC4kJCQUFVUU5bokJCQkJBQBnqK3FBISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISWqD11qWejyv93uU+Lhx1vzr1h6lZo7mZcRPUtclnpQhYkv6KM+71Go8FflkGOOcx5/I4XllsW4g15NgfwdZqDddiFIdbi1AKtSliweerDVzE/fKck0wQ1kE1ByJ6ZrNvYS/s1wwsunzUGFnAI++6MNgcyGUBPAP3H1+Mddm4s17DPuU53JRgLeZSX4v0ECNF5RLeq73ihRUvonhBxR0Vd6HPutJnOYf7NddgcfCNoZfi9RXvqvhgxX9XfBLV5f6H4gMVD1O8puJldJtqPmg1msSw2WrwaGfqlVsArCnt0rv0/N76fSr1Q6lU+pW6dqc52EnXUqdxWlZxX8WLK+6puDN9t+pmWYs20jM6ghCh29sB1lEHet8OtKb0eupG1070na601vTvO+vP6W860ufdiHtRP/SivliY7oHPaMcFojQlTdO/7DPdnjUU76T4D4r3U+/3R3U9QPFeirdVvLHilWlsuyRei+rL6yq+SfF4xZcrnqD4RsW3Kr5D8Z2KH1H8tOKnFD+q+D71Yv9W18mKp9DvHyW+R/Etim9XPEnxXfq79P0HFb+o+C3FHyp+VfHLiqcrnqH4dfr/o/TdBxTfT894gJ53K937LvqOfvaKoYABOjHHFuNqio+ldnxejkfq66Uf1HWq4qtpUJeJWGxpTTSzwFZQPJH68GYac/3/26hPJ+KYmXFT17tpTO+HsZhM/DDNCc2P0RzR43EdTVq9aXSL08dJF5O+qvf9i+KvaK7oNt6r/v8QzSf9Xg+r/z+hri/oOah+fo/G5n3189f0t5/Q3Hxb8TT6rm7X43Svu9X1GnU9S/FwxWtrQIkQMvKBx3BhaptZg8/SenlZ/fwSvevztMb0mnqT2jGT1ppu6zv0/xn0nWn0/am0Lt8h/pjm+Ufq3u+q6xt0jxfpWfqZz+r+pD796b3o5ycJT7ollYrNaQfvo56xkPp5iOIrdPvU//8bYyHq78ymdtxK83N5r3mpvnAh3LTRqEjXbXHxJAFL83/aTTdSfCZNxhYLIP6XPtdcAG6h35Xw+3T9loBHS6O/TgtIOKCo6yB4j1KNxqdEi/ZeksL1OyzON4yAbbyxDnO5RGCjN5pDFa+Fkm6IMQXQ1FLVl2w+ZY3Me+k10S+JMIOqD5Jst1Z8KYE674OiHndck/RzEXDCthbvV987goSivA0LbC92Jd1gDlv4BQAEV478W9OwSuzwnLn07kOSgCYbnEWpE19lnV2EdpmBKFXhohlMeGcc6Nkk3Q01C81X/xsDUIbQM+cGGN/IsWWf/WLTIGlOS7G/g3drSiiNmPtcT8/6sdp7svlWRHacjxy8WmiT/as+2oYYUyZpfkzPKcRdT75s64sYfVOg3/1ghAJPe0YTnPIOolMoAl6RAaPTWrRsrLo/H1e8twboiuNmJE2YALVgjvo+jDvIZj6giTuKuvZQPIIdvTlQhmh7MWLB6SPSDrF2Or/Jtzm0qVirsbbs/DjxtXplHQDOfAhJs8ZzmZ84itC+L2gDbpdwU8dj6ScwjqUMslmTsxQv6QOaMJ79SBWBJ7sCnOJCrkUcN73pDY08Laj/nF2PiRaowaaRm7pOSgaYW9Mx0izolhr1RxEmgaGbQUIJcbQzbdysHqAZ1Waj7iCJ5Ch0dWk00LSwOW0ZANG632V9gZMdzz9tENDUaoQ+rqDJTkamrSGBMg6AGpqonrvSL6RO9cNprQA0N3aZkGA40HrL81BEr8HgVB0w9Q4faOt74KPrFhkBzfnABTYMvVksklAyuSlLc9lIRjSmn6nLYOPx4Qma2uL/RYOApj6x9XYZTxjHA+F+hTrPy+/VzyfAaSGn/xnVwKBp3nvduIPDjuP3mnvUCSyjpBSzGRwfwCk9a5JmlORZJstvEunk5ozO5QK81zCfUxFdu4H6KOugqdUIi8a1nsMY7o6GnXrPSwBP7Um0tHnZixscNLUBa/U4Cw2MLauRy0UZjlGob80CcJpjwtXoYJ4ANDeFtmVxwRmj3jOurirQxlsyPJdbYL5u5ngymnc8J4m1EUDz47igCVbr9UhdU86QEFMkw6KmU80LX9rgoKkX2xrVQBMW1lqgTC9kvH1GQhnvC5wNIGnaJLKbPI91EzM+l4365V04uuZaqaT5RZzjOdPXTg0wfkULJ1WxlOndupqXvpxJXEk4RANjMXOJ+E2lnRsW1bqgE2oJMDmKFh/NAoj1xYDAeVlCfZ+v9dzavghusVgjfYHz4LjSWELQbInwta3WRt85b9p3vYNKKRFognW/UCMukfV8KQdh5qwEgozNoGrzqXa1WaCHztbz2kLHP1+H4BBH2iROtObvt4xaYDDherIjuReIsc6PQy0WFYCPkUjTcR76sKSgmYR8vBCKNB+/VpcBMdUuSY7n/hPwf4YenzlUBsNQk4P13MflqF60cqXxg3b1SqB2mM91j/r2G3L3+g8drUuWoJg4G7vZ4M6Zrx3qh7/RL77RD6HJOouu+uGzSc/wIzhG6+tccHD93kcHYf6WnLy/Iw/97+j/s+HZc5Dps9n0/1mVFhcMzB0JAbOFObuXqH+eptDTi8jndRyFJk41+hl0ZfLU1eBC28nHU8DTel4mY5kOV7uK2jaWWJ9QLlE8hn4eR87lk6hPZrNd3kcauzImqJg23hoTNFEfPp48KMYTXwntG0vtGk/t13wDhYx+wRytix7H9IcSOLcXY45fgfwO76Twz6uobWOIL4a5q3k0fabH9jLogyuJx9N8ML/T/7+Wxv4GCrt9np5VUTcNNoYDfE5/Zk1QwIR+n90gxryP9hPVoZKKV1Xf2YO+8zZfkxF92QK+xO3na0f550D9/uWfExb0JtYP7KMetIT+XPsq0cusSkaUlYnX1kdjSnTgMmGN4n9vSgqgn700NXZp9v9lycl1ebquQD8vS++1SoVBMYvpKF/AhI3B7GJv0CLbht69ne3Z5M60nOL9yj/HYn/Jdjlf3crnLrH20AdbOSzweb52eg54WLPzNG+OoDhn1wVRhDC35RyOeLGO59CXLyZIHNGD5sDd7CjnOp6Dqm0MPqAJ93/fRX9ay+QwYAByPiFA+yabfA4x9cOdaS1cR0KPbU3iaWfF4AlvYMKOdQTNlmq6yBADRyD/vY/oD3rJMiVr2NLmY8dyajbxrC+QGelUOjL4ujmZ3W+KhyvHINYH5ZhuI30gm1RTlRyiGI5qrl2M/6Rje41/4z+r+TZCG29zBM3nLKnequZltIztfiS1ungmGGnzmjRBUycl0ZFEljFsjsGx+6TMUjaWq6TMg+91Mm1ymB9mHdwN/pPNVdIdNsM8Mc9emiTr73BNwvzYM3LuVUm+Wi3nonnp6xxAk4c/tovxnEiuMij3ekqZLSDtHMKyHs1LAVZBys1htht4n3lSuaexyBxdD3I8ug5lE7McQ6/4mauDMsvZ2Qz/H+ciTcCif4lnuQkImi8mTATcBG0cBmNTdGjfB+DUn6sGmur7/+cImv9nsjDVUNLMOQg1a7j0G5MCl3UNFrDletXSJKmVyuixkpZAhxN2QgLQbErjnSgpRDmBRPc+OM4nypXIM/qUf86IM9f1/WDBfwSxvbkY47OtK2iSpLlYkgUHi6M7ZQOK294ihFmuUMWgYNp4uyNovhAolaARHE712RgUbVLF+yPp8bxL1hIXw2azu+PR3KzN6wJkNuNr8nC694xUVRowYa/yAM0tUjye5yivnytotkACjWVCJzpmEtgQo1fxObpq3WqMo50Zn+09JE0tpfQMkBOxmRkdWxyPsHtUkigSgObzgfNdLmokwZjjaebaiCrtQ9D8xFHS1D6hnTMMmvs7ngQL6GjuGpJaDTzVdcNU9JgRE/ZqD9DcPDRoVgCJkuORadlQg1Jl0mwBVvaio4TycTVQg/7YIS5oMimlR4hEsiT5L0HeDnHbahbIYTFB09UQ9FQKOvQbHDaGAtNrpgGa72UZNCnLug9ojgq5PnmymFT7KuHxfMsUQNNM3rsdpRpMabVumoBpAc4/JJCID4jj2G9RVZRjLrjuoUCTfn7EFVQUnRIzeOFWR9B8MgUQ+IsDCJgxvNXheP5pawJNM/fjgiaM3TRQO+QDlxTJp934JldDkKtzrwdgLusqvcEEPrgWgGnpv8s89WHPVDKUJAHNUJImG5tJDu00Y3JxTNC82RE0n0kBBA7wAM3JMQ1BsWPPoY0zTY2qjILmzgncjUbXomRMmov++riNh0ZvExg0zbv82ROAHqx1dUEAk8VNiJyDxGmk4/UqOPcnOZ6/E6LOS4RPnguojItpCLq5HjrNAKB5b4qgqTOed8wgaJr5sBwEQvj4uV6OknS9q6C6AtW1HqC5XUqS5kTPo/lWqbkZxDvaHeNpSTyuQhipsyEIxmd6qKMdLPwpHpLmmJRA88UUQPNID9C8PWa4obNOkyzBHbJc9peMrkm8XKZT5cnOcarJCmj+cmIt4pjUwHT8ffWaWPDuPcgIFdfKbd79thiS5jYeOs1XQiw4aN+Snoag42Mez2+ptcuRZcN+IIEhKA2XIx3O+ytMaO3Icf2lnTPvg7DwT09f6iKbz+9QUvU1uHoNHNxzjQ6awwKCpi3G2kXM37keUqbl/UexCVSpllIR3Eqsuke47+C4EUEoicGCSwKaxo/xREdJ2oDmn2Naz2+tk8tRMwtVLTluCqMdrOeuEUEvzZd1PFsCl9lolveN2rPknzX30NFe5ygeqKOOqtVPz7xOExq4Y0DQNBP3aIddqwiO4l3rObHKrGpkRAngSjlFreVSWR0kJ9CkutrNvv3CIsZWp+gql8gP076haRiCSJJOWpO7GbJoTfMMB9zHQdKMm+UIk5I8Sj6s95D3wmNUefEx+v8DpM9/hOoZIevP76O/vZsqif5bM5UtvsvUlyeA/rtjAmkDnOOS5rhlWadw3cwk3edgIwSELCGdZLHf4AGau6YgaZ7noVO6LlVnVvfiWR9b0vVVWxxWYKkAmqWYoNmOKdircZMlTG1dU6va1chFsfq9Y/qiuuo0p5kjm2Po7nxx6DpvJIGQj15O02qhdZp1SA1XBBendh4JlpeBtoVIIt1iKdVbonl4Ac3JXF3A0+d4DmC1e2idJu2Arn6A/6ilm1GMtqAvYzmmXvNvtjZEJOwoOoBm+wSS5mKKTzIJETz9UCc5hIq6guajCcdJJ5vYH+LBfdxmXq4mzWMSYo+8k8XQ9e0j2IQEP5sAQ7ZLoz6QLQcu/fwgPbNdzXw0mR/gv9hCrxlowqRqZ4rKu8Q3a8tyPfWZlslzIUseUI4B/GdWAc3BrqnhCAzWIwPOKsSrUirBfnTVKQIHUJo+nbZvbXK7uRkrJ7ouApjg2zqEirqC5svUDp3tZkXdBmrHANMm+GxF+u6q5POqx+jNADlDj3XIctQjw+UuzJp+wGeThTHcP0kKRccjvJHCn6aTWC5U6Wyf43m5ljpNaGxH0k/GAU3UB/av9/Gc6WVPclAxFCo5gHPQdMysVCYpcRZLmzWXggfmQmZ6kxyaHweTpMB7ME5Ym0cSYuRvKWOOSbI9F5Jt/wif/wjJtufL3p5gQ/gwTvExVsL304yD5mMBsOT3UMwsrbLaRXZ8L1HgxeoAnPnMgabesQODZhcPRbl2rO2bJdB0dMEoMAfwppgGJtfa8ijxVtNtJakTVIQ5sqljuQsf0Cy7V7n4ueZOgsXc4lIHibmkfZZx0HwyEJ7oAoivwpxNrVgey6E5h/ylnV2oklrP40qa24cETZ1s1WFSYaz5khkDzRNSAM1BnqUZ0i6uF9WeER6F1W71zBJfyzaa9t3lYGH29UGuB2g+FRBTtGR9vnFH8iyO5it53g640FQr0CzXGjRJ0vzUETS/M0XgM3Q8P80DNMfEAc0M1ZOu1JYpPAN8K6h7jvP+HZcyIux4nknQDB3Pj0YZ0ptPYq5ySaueVq0AS54AqwYHzoyB5oIeOs1C3KqHNTQEne8BmqMcrOdJK4imscvPBTegPp51z7MMmgXwCV7LsTheEut5rUHzxcA5cTFd20aKx0IflLDia2CBoACJuFcJig8wYW/MAGg2uzgYZyUayNKOSR5uU8dXAc0hDuGZtZa+WsDFqY9HeQ0n63kdwMSM0duwQTd5zIskLke22vQtEXXffWqkz4UEIU0hA0W4K5B2ZaM8nPdAJFHJcoQPpUqZFiJFYrVdPi5o7pBC7DmXNsoxYn9PqLefJgP+6a7AH2VU8yx3UVOwpP+fCwXA8p5zMDOgCcaLYlIdWQBJs2bO7eQ83pxGdB0PfyRJVDvFH0Algz/xrG9eic1mcFEwaTOhpLlzCmGU51hitxPlM6xDHO53LnpZcvX5dZUwyh0yBJqoItAxwgPjVDBsINDE9mm3on0hqUU+wYbak5WCjqN++pxCCEfqjYn8S88jNjXO9fVsyg1wsvb5Lf9c70j/fBatqZH0ufndCMWnkP59BH1PZxc7NO21BBFqPM9CN3JW122aydyJfL0dTD9qF6g1suCnuVMKYZT7OUiaTvW1a2QE2tMj8ckbIKVFJewY5gGaRXDHsB3nigmkTF2/aVeegSfh2N/qE5mDbGmj7yL7nECoZ1K/P+bc/qVjlqMX05L8FshI0g8sz2tIzyv12SYEoJ8zd7GipwHvhjQzt5frkOXISGorOJYENe97dJ2zHOU9Fr5594kxUsP5HM+LMY5kPolj/8RL4Qaagy59V+SO6jafTM/2vQ7W8VzSCBO0nnskIX4fSvg2W/ID8Hj6JJyvd/4GPMJDv/VSfFCZqqF6bIbonrhMawJNDL5/JkbnlNm7vFmvUqcAmP0ds1ibvh4ZpZNNUvecFOra0XdHDXSKD6Ss+AfTcexHzx3buEe1D9HXHtbzeclAFB9B7RtOUv6+VLfmII8kHJhkZM2A1RJzcPz81AM0O7dWSTOGDjSPftxGhZMgSm14XZ3bQ0UEWY64pzrkpMQOOaoeBiEDmix+30WyGRwjc/tgj8ztb4GUkrOA/KmO6bww3dsuKahmbnKMPZ8eUVdpXq0pjJ93HJPnUsh639WzhG+ntgiaEWWzcwarPBPIjEsry1G51vk02WRfz+KTGEey+hJqnedr7Ju5ueORF3OB9qxWWM0zCfFrIH03A5usMJ1ZqJsLqMwMWLTNFzSnRh01Qdd6qMeRrsAsrqFc6haGjEpxJc23GwU0Uw1dnH+edDNHdY/cp3fUO8vRToFBMwcpu153yElpK6eaS3uSAcgvkiCBbdxKjUPLAQurlVkZDQewL1uO6U11As3nU0g3OE8PSs/ZJGkbE4Lmm1ksrFYNMFMEzmbPzdDM2YdbRex5BIgfY0mvFve9Tkk7RRQLE7vdsxBcwbhBlKsXHfM5nr9RSc8L9x7tcEwvMyPM0ACg4psa7vGYm9oqHhUTWyDtWPskoMWSEMeKeGOF1TpmvLAauts9CIlamtPw9aTrBp5ql2l1MQSlDJpmgvWxWBrLDhbVw1IcOMxqfrnH8c/ohP9dbVeuEHsetxplpwqgidbJuJnZyxa9ae+EoOIkaUL/PeRw75M9yjGYeX5WknmeUNJ8OSlo10jCbAKJXrsA7pZGijYA6HVdfJVRcq+3TnOHNNx84J1O95joaKw4NmQ6fHSvoXuOTZCVR9NmDgl6fSTNN6P8Py333yWBcv3aJEcy3+O5uj7hkEHrVyQ1up4IDG/kO9cDgGa7DIMmX6s/wvw8D6TkIOAJzxvoqYt/KuRx+JosSJoWafNdnzyS0EljYeDyPkd2+DtjJV8J3KIKnvGw4x1zTQ7xAM234xScg917gq/UbFw5PEHFFzSfdbz/ehRWV/I4pj/uK/G1VtCM0rdDkIEx1q3F/DDzAXSaIz11mnfVGzSHpeVQDu+1h6dfVhHeU0+8zdkEbgJnYaz9jM7CzWhQIj+xo8iPz9vJVv39V1Fhkw6gGQdUPohj4QbQ7GtcYjx28A8hWUeuRoagFzyecVyCjeFYH5e2JDpNU7veVM4EtnkNVPqds6O7gx7T1iZcf99TaevFMfsRrL9YBdxYZdRZnjrq61otaLKBuT1BedAW6Nx7KLa1o+ORXNeWOYlAKEnhKCNlHu6RoHeIR/YnDWSLxAEyFnlUcgxVMzrGaxIm7LgxRdDMAXg97Gm40+V01/bI4oSbro8hqEOWJE3oxw7VVB6YVZ2EhVFQrjrHI4EiKoc2Axb0IunVV5V0cL1djmoFmqtQHRivJLwsHX6JkpOOV/xXyvG3tA6bI3XAEhTZszvpaR6hhBpl6J9iAsCc6FhXOomk+Z5LSix41ljXTSpJlFgC0HzGcz6tD7o3J+srpb9b0HEMnUGTFcc7kOru7EmRXftTjgZzNVFQ+1NRPH3di+awiZLan76j/78bFZcbRpvkEGLzDK3fXiNGSeK4XhdFlktiDtVg34dON80xVWSDTDE8z7Iv83Lv1hM0d0g73hsW1K4ehcV+8d6WeOUSLaDvyOr3Pcv0ZL5TCFBT5rVKjuyhdZqkD+7mAJrz6oAb3ZvHMV3rURfzbGNqkmbCkiRRYa9Naek065AajqeImxERTTZfYh0P8Jovyo8Ekkd1IAEB/kByJ9pQ8cYUIquzMT2VoHJobG+LWsSe16R0LgA7FizzBc4iJJYtRCW1gO9wybLsCZgf+mSYT9NPs8rz9k4QSXO5I6g4xZ5jRFDCAIqXPWLTzfwZ6KBiwRpYzqBZJYuTlaP+xpIVqsjaVYjacJknwqsJVGZFWFuugN5S9s9KPzzNuudxX2JorTILwcI6NwBwxinMVWm3dwVMrbTewDOBbVS5i1JSP80YEud1ni465Tj1zpOCprq+lHAubcne22UBvhZXireBZlZrPVWbOzA3QtU3x8z0LRzEmfCSJHv7vWlkbr/aAzQH1RA0c2DhviBBTe4kxyDfmjIbBXDH8QHNGQlBc2nFH3se09+MG5ueICLo+RrXc4qKTW92KBz4YQ1B03n+ouojKo8ntGdPsGIXMrwBfAf10PP1Bs1ta5nDksW2/pXV2C7FTO7hMtl8vluERaWlkf4Jo0mcC6u5OLenfEy/OGZdcF/QfCFQ5qHXfY7pcU9b8KzOZJzLvKSpXZ0g6UmlENx1SY9tE2JCrMWktdC1xLpHUJyCxk/wSJ67Q60T/7KonCFm544YsFINd3NuaLoT3H1CxGUPTsu5PYbEeZtPRvW41vQEzu0vBZr7W7KjoUv7dL7LRatEXWG11Xca6Hi+YMxosu6gyimmcAL0MbyatuxVyxK+LqnhmuuR4Zn0REtAzCuvJZLkeB3n2P4Lqzxdj0tSUyZglqNEiZmr5KUsO1jTe8VcfK7W89cC9q+tVn05TmE/RZdVyVQ1z/jEItzqQS6qnQXjBkbQz39i86SQsiBT6ZT3bWpVaj1rTrewRLR1qQKJIZF0jPw0QCGmqskqcIDY5J+EupPAsbbD0nRuj/H8AxIc08fETH/nGhH0VtIQQzw6RzhNl5OWka5wPK8EZBzoKgFgMF0869sucQ1dsMH2pOQo3+BaTLlYHl+LOsR51dROwTBhb4eA+2ouDXPou7tnoHRuHtqwWPnnqnxfMNchXkisnMBVqYU56hbJh2yoDcxDgybFTlcbHzOBZodKykwL42GHOYK1t/GYno8BmtXuPxec9xOnTYMFv5nFYtsS510UfalzEkRUFEU3p7cdxrEeXIiTHDuGELOc4ksh5Bgt5UnL8pZsa5ECYE7BJCFpu/JMcjg2GCX4NvUsZhZVEpSq/v2Njm8li59XgRWk/wUzX06sf40DpFUam2Li1dDJVy2GoDjSRQky2fdOCposMus/VaSfqLnyflQKOQ6aMeaguee0UP0N7zDS9fgM353EgdISEfSJY/+V6+HcThtSVw/PC74WF9O5cbX+mfcpX2M239E4a7H8c7XKc6AufboF4mBBHK5DBhVPJh2hDnO6i8B0Ev38E9Pvb8EA/AUWyEwtESxG34GU/JcZC2kiZdDP+qiJVJxsyZAVGWPUH1qJdH53kJFpMsXSa76XeApd76Ejyhhe2S8AqOytIyvo+fcpvh/4PuIHgR8jfisq5h7ufRgB4d1kfJoEfCfNv7thPv451Pxjxc8u0VmNqJ1ToG+nwP8NTyZ+kMoar2/R9WHCjskUAfMA9NHDdMW+nMLub36eBP0wmY07nweTYR3/9Dd67Rqme91ObPr3Hjo5XZwkjycHLirCp8NXT6L2z/bcPEoA6jeq6x9xM04z8fgCrbwQU86yMPXRaG3SzV1Gi3Iq7VLf0iDOJl3MxxQtoifSOL3Y1eD8xjgzR4F0W+jXJCm9zCKMs0k0YhuFqgsy8NlyFPd+mk70QhvUGySJz6Jw5m9J1TadwP9KxUfSWuxuq1xZl8Y51lJuhEJPTVHARuFg+ijfW0vNxL3IhaJ9nNya9WiLrVa1hVOpkVTheZHv4ZoRv8rcy8dNX5ZU1cNSBUZxEy8169CHzEN2awAAFj1JREFUOUtKQtv9o9Zk3DGolEHI9rtcCmqmXCXcoN8vSGuvF63F3lR/q0MFHapIljWwts+XairGQDe7Lgqh6LRsQkJM+GiOA3wsn6isxQzUN8lxCU0GRUiobmsxl/aJSUhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhogbQyqTTHTQ0nJCQk1Nbz9+WylCVcSEhIKLOASddlFP+VatEsJ8ApJCQkFF0Q7NesuJquRTJwgTqXIBYSEhLKooS5LFWSLENpUE0fRtWqFhISajs1N3yKWf2iQJHr/eh7zVDzA3/OVzHORD6rWkGmGCVZl6RqdmWqNjmKquC9BvW417cBJy94FdPQ5Pp97KuqRirXZ/j+jUMBPmthrlDvxb5TrbDcfEX/2NxqtvxNrKJoMLebIuZIk+8cTTBf+BrLhcSIau9meZeca1E+x4Js6dYFcpm0oaoT+hhiaiRlrql4vOKzFQ+C369J9cu1jnPjOP0RShqNU+0v5VrquVqXUG4kVU4tisi51L6JW8/bBbSzUHunrs9XD29HNb23ULyu4p4xQUCXzOyneBMNHIqXpo7Xhd0HKN6MCrwvZrsfAJOpY7yf4nOprrguNn8KSXWLRA2U+n8fesaWBGSdmXvQ8oo3pXdZ3qezQepcTPHqpN/Mx/h+F+qbASSxVpyU6qi/hPr9ytSOVW1lgHHzIMPUjoqPJwlY991BWmUAfZtjz1hIfbaW4g0VrxBnoavvLEzvo3lZH3CAd9bjtKvi1RSvQfNmE6pF3V/xUqbdMSS4roo3oP5a2kjZurQytbOj4r6K16Pvbaw+/y3Nha1oXqxKY7o2fba74q1p3qxAn+1H9e5/r3gI9Z1+70F01e+9IJ+jcNX335OeuyL2H73nboq3o3Hp6NCXPfVY03gvaRsXFEr02qD+H6H4IsUX0tzRc7RLNTCkPtmJ+rJbpbVE7VpHt53eryN79+7Uf4coHqpLYcdodx/qyzVonsQRtnrQOG9S7Z1dJ7QGuWfAyPEITNxcBePIafT9Al0Po891ZxVUZ/2XPh+5ADOYwD2WUt/7F9yjBO/x08/q9/9HUl0netc8/P1F8F1dHH5FmCwa1F+E+93kKhGYZ1GN80foPb9RPFbXU7Ydh+HdtqHnzlX8o+KTK0mc6vOH4V114ftObKKZ+/aljeU7S5+Z8dDvOhjbQD8fxoxZPSqMs3nuHaYdNKbbufQjU9s8Du9YZGPdovh79Yxn1XWvGJv23eZe9F6DoR696buJNIf+W7ZTgZ5bYnPuBFrQH0X0Mf5f//00xYfSfMgx8LwDvvumWbz0u0FwD0136fePMSa9aI6Yd3mLCydmnlF/7K14RtQaUzST2tyTCTQ5EJDQEKrv1ZfPZ5hnOzFsMHPG4Mq+7Pf72eYUPL+3er8PwK4wS28y1U5w6ndXzWtoqXRMEMMtNPJUuvePdN2tSiM06n8OL/SV3u3pd1uze52CLwvP3FL93WdmUvOJTf/HxTURdqx2dL0AvvulkUrN82Bi+YKmede9LO+5e0Qfmb/ZGd7NTM4d+N9Anz4G7/pyhFQ+iMDup4UW0Wct8NGhOFlpYdBXfxqzHlVOARswcNB0r+uODW2cwu5VtoCR6atLKqhNNoAFZO41AevT08/3WUCzBAY9DoZmrh2ogQYWaqEC8KJx8GKuQlHXG2F8PkCpiiRZfv+Do+YptOsS1o8aRJa0SJdasn2K9VXJMmfM+7+Mxk0Gmh8yoHuEAzy83570nTls3pt5+Dv6/Hu67mMDNLjfP6C95vlnV1vP6nc3Q1NPDgWa2Lnfw8DdH7GYmqjRR1CH/0DfHwPfGQoSlqbTAMRMJ2wOHfojdIg2ulxPktK3MKjmO0PN7kn3GQ0LQYN4d6ajmQGddruv7kk97wmYMOa9b4wwAJnNYTcmzWj6Qh/n2ITIWyTNqZY+/x2Mz1zos2eoz+5nfVqk6wZwr1PMAlL3+k8M0BwHzzMLTv+8Wlw9LZM0H4Ex1e/6MklfeiP4EkDfLIyDWF+Z62XsvfQ9P9MqDjYGR6nPvqbNWT/jU5hLP/UTnWQ+pbHRG+87tPEPUb97D/pLb5hf0/f0O0+ljacEG7ym4bix00nK0EdGmmMCxrwNkN5nMUvfGcnxNwaoYT7oU8cyrI96ghFzLnxXg99NNLZPwzwy/fIWArABTbOBsLaOZt8zz96P4cMwJmluzubxvpbTqAHiDtCOgnm29mjRaoCI+Wv+9nro+1ODuQhCg2+ADtQ8wCaq08/Pw8vMMgPGds+57HhupMPFwIXHfOcufawHMGwiHd9JdBwu01G7N7vXGHgPPfG7sqP1NPj9PS4GGZgAmzCJogQ786YWydH83S5M0jTA+QzqeKB/H+CgCb/rS+3DPnuSJC48Hmn96WQmXR0Cvz8VJE0raMIz+5mNC9ptFsuZcTcgPC6C1DNPMiT9V09SvxzP2jiVby56XhBY4XsZ4PwL35D0cVifQEi/pfWzj4KU9Qrp17rT73vQe3QhXSkeSV8m3WEP0g92JL3q4UwCe5i9w+Vwj/fZxo7Hc+zfkeweeNy/F/6mCOC0HNswLkNpj8Z7P6P3N/2jPt+DfocCzA1sLnQwa9Yynw+1CEV/YJImP56vHwM0zb2GMYkYn71nlRPx1WmBpnm57VnHnRZxrN6CNfhqBmQcNEezDjubdeh98LfGVQEnyRo0CD3RyGPRadpA81XotPsdvQPyXC9Cu/Qk+P8t1fQ6ZpLRlfdJEzznQbjvq+wdRrM+e5Qp7/MM+EaRFDGQjc2ZTC+0iAU0m9h3fzpWEsDg4u8a02A4zzACErum6yzHyV6wORgw6Mfa8HcYcy31vc10wZ1tRg14xiPw/eeiJBXatKcz0GzP28SAzEiKC8K9LrG9H5c0YY5o+pYdk82Y7MOO80U45i4LJ6OVaK7NA1VtBGOuO6jG2BykwiL97QB4z4405ig8tMB3N2JrfBeGJRw012EY8QcLaOZRLw3r7x34/+OW+Ys/T4bvnhkSNM3Ad2LH2ff5wmQ6GrMrbskm9WasQ66AifgrOPKUCATWACt+3AVoQPO8CqDZxCTNh+OCJkg1KzG1xQiymJqJ/oujKkzEHSw6I9TBHcT6DUFzKrS1q9H9wgLpj3/LretsvHCTOQve41vuKQHXbnAa0HQcSAdmIewfR9pkkxj1tpNhnJrBePcc09dtjf6ODLxPI9XSbEu/zielgZoDgfv5Cv3WjW26r5NUnCeDpJ6vHei74xloIjCO5sAL/bwVkzSx3ZPZvOoOhqkiu35vJE367slMyjwBjL455jpkgOxctjH/Cb7Dj+dF9q564+oF9x1WBTTXrgSaTG04G8D/GK3+YH+7JR9vmFdPQt+fGzSCDx54JGvscLawlyX9iRngVy36pvUYqF4Gz9mIGVPut0lqdDzqRpO0E13bW/SG5zB90cLsPq/B7x+L6+MFbTmZ6XxWJ1ePr+G+IyP0btuwY/IzAH66/2Zr/RQ8836454twnw3ZkeTmSmDFpPUm1l8jYbF9YwFNrsifi7pk7E8NPq6SJpvEk/iGTC5Bc6CPdJ+vAvfahPXpQPq7h+C9HqpycnjSApo5y/suzLwvpgNIIrhqd7mP2ZEff49z9AUC27xF0iyS2gENfPuD9HgC6FffI3VaCwDdr20SFjPS5iv0C1+3lzD3wg+hHXeBV8A8Hb/pOzD0GBwZ7CJp8vUHpzStMurNMGhihMU/z8b6wtCgOc+VgUk1E5nV6y+so/4O+gzz0qsw/cwF8Jz92Q74L4vFU0toX5Ck86a6vkTHGu0WcQ1NOvPd05llcmHmSoXW86e4RFWtT8j9pYyGH8uk/ID5kjYxfZXph6PIjQUV5C+Cj98UPDbCRrUvm4Cnxxl8BgRmMp7Bjuc9LTqzdiDtGbDoYrFilmK6fUQdz58jnaDWZ66gdWsAUnOpn55lKowb2FG3K3OlMuDzG8tmnK8gadrcezqDK57RAf+dNpT9aSzPA4ncrIkjGUCcBnPlJSZpDmJjuzecOIyHwwqk0zYuZt+S//KaIPEVwN2uKxmqULrNxUxI8x24Xf27AmiOYu5Uc5iqbjcGiluxPlk3SqfJTr64fm/j7mYIpjbfXiaIjA6eKwIW+3UwyJ8ZSxo7QhbpSNDXopcaYDMaoFUNOvkKPKLRpP6jxS2lCH5uCJonwbu+axY36GHe5hO2GmhCOzZmzx4I3xnMAPFgDv4kNeF3zrVYpM0OrSfLbQxQzHvszhbWCNfBB9A8jS1IG9jvgO+txwPusyQYDdDFpinmpnwvWotJYvoYDE7GOm/mz6Zwj9XBK2Ben0NgwDfwu0ssBro8VxFoUK4gaXY0myZzG7O5Sc07UsNmZ+bzPy2SZi5C/7+xcVWDzx5GKzBI+HsxHWN/kJDf4G2MMd/70kZq2nl5BdA07l1LgcrAvO9eFrvH1gw012O/38diTNqCnSo2g/fZnM3RI9g8z1k8F0alCZocEP4EIIIT5Foe2RMBmqfCM3ZjADDJ0lnbETg+Rbvkt9BxM4yDO313BDNWLMRA8y0Gmu0cQPN6dsTpC3HE/ckIUUaJiPXjhqwfR4MEfBfbPC6Gz4wEysHb3GdstcHHmGk2mU6N8NNEn7y7mFvSsqxfprCAgn5VnPZRir2feWjMjXAa/xEso+0Q8GkuzCbXm2ZySemOuk567742Z2+0nmtJsgJodqgCmgXwI9bX0egCY/GBtkmaW9vABdrSAr6rBaZLPop9pz9sIqiueM+cwCIkajwh4jw7GnWaAI6armQCRBFcpr4i4apo0UvHkTRNv10Jz/uc1l9HkkD7kO4Ypel2FtXJZfCds9MATdQFoEvRk/T5WObqsH4EaK5cATRXBofWMkkH3FWimR33R7NIhPYgzZ3ApOJuFY7nz0SFF1om0AAD7CQR/UA6yScI0N6Bo4xxg9iQLfL1WT9cDv3bhS2MufQM1BWbd+kNkth8agiLq0U+wik6StLswYB+TQYQn5B0+Kg+rmkXL73wma/e+dV0rBE6Te0TeTEt8BnU5vtoA1mFvRce1YqkU55KfaijjJ6G/jPvdWKEP+xjcUET/BjNyWqCNqZRXxTYZt4lYj2gW9w0Wvg5JqAY8BiCwgXo/02bHgfgOZmBXH9ow/XsvrvYDIcMyP7KNvKDYNw6MZC6gvlLH2eJ9EJvgEFVDEH7sbXTm+aH6Xu91p6kTUfPk8fA7Yy7H+ERf2wl63mQGHqYYAewARnOfNbuqeDfZ5U0ocMmMmlzAjNgNDMpaRw8dybtelzSnO+4CZ33WoTLiC3DTR6eeZzFtQMljTkAZKadVzGAWoM5to9lE209sgzaXE5eZc71D0VEWfH3N/0yhCy6u+Emg5ImTcoeEYY1c0T+Bja5EvX/W2jRpON192qhfxbAuhE2ty487pq52vyeLZA5GHoLOmLswzci/GHR5ejpKNCk8EP0K/0YdeZw9DNjchGz1uctR8SpBMZcpzkfaLIwUWwrJo25gM0/dBHi7oMvQmjpfBmOQO3C/TDXq3A8v8piy5jAHOnxVLpNFdA8wGxUzHZSACm2wMbiO5wTJNBw1zF0OToDxrWJ5b7wL2HDAuo/ZkYDjCrYs4LOiEuap1tE87lMfL+Cdhfe6DXRL4sGdmF4z5OZNXgx5rj7CvPx6h0jrjfPrKafGmmGFr12Qr9UTxImHRaM+xTdpz9FnPyXSZo4WXdFNw4OmtzKyjwPLuBgRX14JvromU2JS5o8gkofLVne0NkE1o8SWD5JfrGX0I5fthwZmyuBJh4bjYGQ++bxVF7kpvYK8yHUBohb6PPbqc2TILSXL9YmALGH4oAmgdtTLFa/O/x+SQizbLHots33bq8AmltXAM0VMFQZwlebmP9wiwU0O4AR0wDnFFC1oMpkXZjv5rt3W5zb37NseE0wTgtR+1Bl0GILo7SA5iHwXp1BQDMb93Qa6+eoHaeT7eX7iPHO0WY81eJyFD6DFnTUlbAwSqCzeDfCKRrTqZUsMaLNlmN1Ab43i3aGi0msfhCOCnPh2IqgczaAzvcmjA6e9ypzMH+JQsi08eUWknr1dRI4/24XoWS2Rf1ww9Z5zHCBR7hREW4VF1nij2didBTzo5sLk+RTsiiPIyCZxcIUNR0O73QW01eib91wtnD+wSQTlNbWYgD+eIyNuCPze7wMj1NRIbvlnzM54XudaQGmJubqYubUXVzHyECzkvW8E3pPkEpgETaGw9jzZmHSGIv/7UfsNDSEzW9+jB1MemAtHa/Knj3eptPEkw4Y7eaC5V3P+fMpy9Gd0K9zQSfJ1SMdYYNAtzfum7wxzbsSy4OwSxXQPBr6ZK8Id6T2ludxK/0tzKbxBvOf1Wv/cvLCuY3G5jbCuo28UzhaMpXMZTHXJ0bp08yCYg05K8Jx9ULYTXjWG1sCio8sCuXzYNJ+j+nfaFG9DAuuYLOAwsK/jSyb98HflHg4KeujziSF2Xz5NmbgdXSEhQ936DkoUVucda8FicvWZ0VmYR5j89Ok95pljCWWo8ysiCw2KAE+xNynNq8S0taFucKMr2JAMvPkWgAH3T8rWJzXm6CPprIxX531wf3VIoIANJ+A/voWYsLzFuHCHBfvYO9/H8zRL5g3ylCIgf8vLNymCvHUTWwDLFBb+1nUGoPMRloh6UgLHHE1yG5hMQ52pDlp1s/1FQSJ/WEumvm8B1u3a7GEHSPgPveygJVFK0SttYM13kLvvwzowaez/i1XWP8TvCVRtkifxxvTAhkQkagiD+nevoIOPpGDBfA+oHcsVbCkjjVSkS3CxYArLz9hFPkVMtTg73RGlG1ZxMOjFZyCzcAdzI4Iu7D428j0V8zS/h281hesvfMioSgq4lOWEYin0/sBJOQ8uL8cA++qj2R9bO5V2k3GFmXBPhvO2ndHleQJ3BA0pkI2HzN+SwMo48TORxm7TDIZi/63PU/VFuWgb8tQpDdtZh3PQc7G19g6+Qvca2yF2PMN8XeQcCRfIVKpmYGTMQ5GBSpoq/jDEWugBO99u3GQj8g38SQ3BFmyEuWZ7tysid9HuBzNc8ejtm7CNv0LuXHHMg8PYULaCHC9epK5DVZa/6cmOr5D49chh+ZDyeiyTxyXHUqO+lvyMVzBpjeCZ3SkRKEj6ah5J1knr6esPGtY/iYH0Rjb0LFsRwz7XOB/KcSOJH/OM0ktoF01/qY/pwV2KDktr0MRB3uSrvFE/VkM5+1maufxZEBaE3S759Jzta/e4lUW6AD63ln07A4W0MnDhBhKOsorSUq+iZJDHA5gOF8cP/kzbkuhrsuAtXIFUnXoCTgQY6crtLsj9d35pF89KoYFfTNSaexaKSk0yxt5OvXLDpUSyWIkD43r6TTuAy2hsXuRsXO9KkC/PMVR74TRWxHGzzMpeGAkRvLQPPgrzeVdLCoL3eeH03rJudgdyO1qGKnEKkX7NFPi5+NJF/gU6elvoPdeM6oqADyvPwkC+0LocK5CRNrqZNA5xbIZLEwBCWcSwK5Lf7MCtWc7miNdY4x3F8pmdQyl9NuaJNBm2jD2o3Wp7R8jaC6dSHPjWJrDB3IXtSj6f8Fu4+8M2w5mAAAAAElFTkSuQmCC";
    WM_WHATSAPP_PATH = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";
  }
});

// server/lib/photo-watermark.ts
var photo_watermark_exports = {};
__export(photo_watermark_exports, {
  MAX_SEND_DATAURL_BYTES: () => MAX_SEND_DATAURL_BYTES,
  TORRES_CONTACT_FOOTER: () => TORRES_CONTACT_FOOTER,
  applyTorresWatermark: () => applyTorresWatermark,
  decodeBase64Image: () => decodeBase64Image,
  watermarkToDataUrl: () => watermarkToDataUrl
});
import sharp from "sharp";
function decodeBase64Image(s) {
  if (!s) return null;
  const b64 = s.startsWith("data:") ? s.slice(s.indexOf(",") + 1) : s;
  if (!b64) return null;
  if (b64.length > Math.ceil(MAX_INPUT_BYTES * 4 / 3)) throw new Error("base64 grande demais");
  return Buffer.from(b64, "base64");
}
async function watermarkToDataUrl(srcBuf) {
  const wm = await applyTorresWatermark(srcBuf);
  const dataUrl = `data:image/jpeg;base64,${wm.toString("base64")}`;
  if (dataUrl.length > MAX_SEND_DATAURL_BYTES) return null;
  return dataUrl;
}
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
async function applyTorresWatermark(input) {
  const normBuf = await sharp(input).rotate().resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  const meta = await sharp(normBuf).metadata();
  const W = meta.width;
  const H = meta.height;
  const bandH = Math.round(H * 0.16);
  const bandY = H - bandH;
  const pad = Math.round(W * 0.028);
  const cy = bandY + bandH / 2;
  const topPad = Math.round(H * 0.03);
  const logoMeta = await sharp(LOGO_BUF).metadata();
  const logoH = Math.round(H * 0.17);
  const logoBuf = await sharp(LOGO_BUF).resize({ height: logoH }).png().toBuffer();
  const topBandH = logoH + topPad;
  const rowFont = Math.round(bandH * 0.165);
  const rowGap = Math.round(bandH * 0.085);
  const totalRowsH = rowFont * 3 + rowGap * 2;
  const ry = cy - totalRowsH / 2 + rowFont * 0.5;
  const rightEdge = W - pad;
  const badge = Math.round(rowFont * 1.32);
  const gloss = `<rect x="1" y="1" width="22" height="11" rx="5" fill="url(#gloss)"/>`;
  const innerShadow = `<rect x="1" y="13" width="22" height="10" rx="5" fill="#000" opacity="0.14"/>`;
  function brandBadge(type, x, y) {
    const s = badge / 24;
    const open = `<g transform="translate(${x},${y}) scale(${s.toFixed(4)})" filter="url(#drop3d)">`;
    if (type === "instagram") {
      return `${open}
        <rect width="24" height="24" rx="6" fill="url(#igGrad)"/>
        ${innerShadow}${gloss}
        <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="5" fill="none" stroke="#fff" stroke-width="2"/>
        <circle cx="12" cy="12" r="4" fill="none" stroke="#fff" stroke-width="2"/>
        <circle cx="17.3" cy="6.7" r="1.3" fill="#fff"/>
      </g>`;
    }
    if (type === "whatsapp") {
      return `${open}
        <rect width="24" height="24" rx="6" fill="#25D366"/>
        ${innerShadow}${gloss}
        <g transform="translate(4.4,4.4) scale(0.633)"><path d="${WM_WHATSAPP_PATH}" fill="#fff"/></g>
      </g>`;
    }
    return `${open}
      <rect width="24" height="24" rx="6" fill="#2563eb"/>
      ${innerShadow}${gloss}
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="#fff" stroke-width="1.6"/>
      <ellipse cx="12" cy="12" rx="3" ry="7.2" fill="none" stroke="#fff" stroke-width="1.6"/>
      <line x1="4.9" y1="12" x2="19.1" y2="12" stroke="#fff" stroke-width="1.6"/>
      <path d="M6.4 8.2 H17.6 M6.4 15.8 H17.6" stroke="#fff" stroke-width="1.4" fill="none"/>
    </g>`;
  }
  function rowSvg(yBase, type, text) {
    const approxW = text.length * rowFont * 0.62;
    const gap = Math.round(rowFont * 0.62);
    const iconX = rightEdge - approxW - badge - gap;
    const iconY = Math.round(yBase - rowFont * 0.8);
    return `${brandBadge(type, iconX, iconY)}<text x="${rightEdge}" y="${yBase}" text-anchor="end" font-family="Arial, sans-serif" font-weight="700" font-size="${rowFont}" fill="white">${esc(text)}</text>`;
  }
  const rows = rowSvg(Math.round(ry), "instagram", INSTAGRAM) + rowSvg(Math.round(ry + rowFont + rowGap), "whatsapp", WHATSAPP) + rowSvg(Math.round(ry + (rowFont + rowGap) * 2), "site", SITE);
  const overlay = `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0c1a3a" stop-opacity="0"/>
        <stop offset="55%" stop-color="#0c1a3a" stop-opacity="0.72"/>
        <stop offset="100%" stop-color="#0a1430" stop-opacity="0.9"/>
      </linearGradient>
      <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0a1430" stop-opacity="0.85"/>
        <stop offset="60%" stop-color="#0c1a3a" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#0c1a3a" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="igGrad" cx="30%" cy="107%" r="135%">
        <stop offset="0%" stop-color="#fdf497"/>
        <stop offset="8%" stop-color="#fdf497"/>
        <stop offset="33%" stop-color="#fd5949"/>
        <stop offset="55%" stop-color="#d6249f"/>
        <stop offset="80%" stop-color="#285AEB"/>
      </radialGradient>
      <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <filter id="drop3d" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="1.6" stdDeviation="1.6" flood-color="#000" flood-opacity="0.55"/>
      </filter>
    </defs>
    <rect x="0" y="0" width="${W}" height="${topBandH + Math.round(topBandH * 0.5)}" fill="url(#gt)"/>
    <rect x="0" y="${bandY - Math.round(bandH * 0.35)}" width="${W}" height="${bandH + Math.round(bandH * 0.35)}" fill="url(#g)"/>
    ${rows}
  </svg>`;
  return await sharp(normBuf).composite([
    { input: Buffer.from(overlay), top: 0, left: 0 },
    { input: logoBuf, top: Math.round(topPad), left: Math.round(pad) }
  ]).jpeg({ quality: 86 }).toBuffer();
}
var INSTAGRAM, WHATSAPP, SITE, TORRES_CONTACT_FOOTER, MAX_DIM, MAX_SEND_DATAURL_BYTES, MAX_INPUT_BYTES, LOGO_BUF;
var init_photo_watermark = __esm({
  "server/lib/photo-watermark.ts"() {
    "use strict";
    init_watermark_assets();
    INSTAGRAM = "@grupotorres.seguranca";
    WHATSAPP = "(11) 96369-6699";
    SITE = "www.torresseguranca.com.br";
    TORRES_CONTACT_FOOTER = `\u{1F6E1}\uFE0F *Torres Vigil\xE2ncia Patrimonial*
\u{1F4F8} Instagram: ${INSTAGRAM}
\u{1F4AC} WhatsApp: ${WHATSAPP}
\u{1F310} ${SITE}`;
    MAX_DIM = 1600;
    MAX_SEND_DATAURL_BYTES = 7 * 1024 * 1024;
    MAX_INPUT_BYTES = 9 * 1024 * 1024;
    LOGO_BUF = Buffer.from(WM_LOGO_WHITE_B64, "base64");
  }
});

// server/lib/mission-photos.ts
function isStoragePath(v) {
  return typeof v === "string" && v.length > 0 && !v.startsWith("data:") && !v.startsWith("http://") && !v.startsWith("https://");
}
async function signMissionPhoto(path3) {
  const { data, error } = await supabaseAdmin.storage.from(MISSION_PHOTO_BUCKET).createSignedUrl(path3, SIGNED_URL_TTL_SEC);
  if (error) {
    console.warn(`[storage] signMissionPhoto erro (${path3}):`, error.message);
    return null;
  }
  return data?.signedUrl || null;
}
var MISSION_PHOTO_BUCKET, SIGNED_URL_TTL_SEC;
var init_mission_photos = __esm({
  "server/lib/mission-photos.ts"() {
    "use strict";
    init_supabase();
    MISSION_PHOTO_BUCKET = "mission-fotos";
    SIGNED_URL_TTL_SEC = 300;
  }
});

// server/db-init.ts
import pg3 from "pg";
async function nominatimReverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const resp = await fetch(url, { headers: { "User-Agent": "TorresVP/1.0" }, signal: AbortSignal.timeout(5e3) });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data || !data.address) return null;
    const a = data.address;
    const road = a.road || a.highway || a.pedestrian || "";
    const number = a.house_number || "";
    const suburb = a.suburb || a.neighbourhood || "";
    const city = a.city || a.town || a.municipality || a.county || "";
    const state = a.state || "";
    const stateCode = state.length === 2 ? state : {
      "S\xE3o Paulo": "SP",
      "Rio de Janeiro": "RJ",
      "Minas Gerais": "MG",
      "Bahia": "BA",
      "Paran\xE1": "PR",
      "Rio Grande do Sul": "RS",
      "Pernambuco": "PE",
      "Cear\xE1": "CE",
      "Par\xE1": "PA",
      "Maranh\xE3o": "MA",
      "Santa Catarina": "SC",
      "Goi\xE1s": "GO",
      "Para\xEDba": "PB",
      "Esp\xEDrito Santo": "ES",
      "Amazonas": "AM",
      "Rio Grande do Norte": "RN",
      "Alagoas": "AL",
      "Piau\xED": "PI",
      "Mato Grosso": "MT",
      "Mato Grosso do Sul": "MS",
      "Distrito Federal": "DF",
      "Sergipe": "SE",
      "Rond\xF4nia": "RO",
      "Tocantins": "TO",
      "Acre": "AC",
      "Amap\xE1": "AP",
      "Roraima": "RR"
    }[state] || state;
    let parts = [];
    if (road) parts.push(number ? `${road}, ${number}` : road);
    if (suburb && !road.includes(suburb)) parts.push(suburb);
    if (city) parts.push(`${city}/${stateCode}`);
    return parts.length > 0 ? parts.join(", ") : data.display_name || null;
  } catch {
    return null;
  }
}
var init_db_init = __esm({
  "server/db-init.ts"() {
    "use strict";
    init_supabase();
    init_storage();
  }
});

// server/cron-whatsapp-forward.ts
var cron_whatsapp_forward_exports = {};
__export(cron_whatsapp_forward_exports, {
  alreadyForwardedFinal: () => alreadyForwardedFinal,
  buildFinalizedSummary: () => buildFinalizedSummary,
  buildKmResumoByOsId: () => buildKmResumoByOsId,
  buildRichCaption: () => buildRichCaption,
  cidadeFromAddr: () => cidadeFromAddr,
  getKmFinalPhotoByOsId: () => getKmFinalPhotoByOsId,
  hasCompetingFinalCard: () => hasCompetingFinalCard,
  initWhatsappForwardCron: () => initWhatsappForwardCron,
  isFinalCardUpdate: () => isFinalCardUpdate,
  isFinalKmUpdate: () => isFinalKmUpdate,
  isForwardableStep: () => isForwardableStep,
  mapsLink: () => mapsLink,
  parseCoord: () => parseCoord,
  pickCoords: () => pickCoords,
  processPendingForwards: () => processPendingForwards,
  resolveLivePosition: () => resolveLivePosition,
  rotaCidades: () => rotaCidades,
  shouldDiscardPendingForwards: () => shouldDiscardPendingForwards
});
import cron2 from "node-cron";
async function fetchImageBuffer(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15e3) });
  if (!res.ok) throw new Error(`fetch foto ${res.status}`);
  const ab = await res.arrayBuffer();
  if (ab.byteLength > 8 * 1024 * 1024) throw new Error(`foto grande demais (${ab.byteLength}b)`);
  return Buffer.from(ab);
}
function isForwardableStep(step) {
  return Object.prototype.hasOwnProperty.call(FORWARDABLE_STEPS, String(step || ""));
}
function isFinalKmUpdate(message) {
  return /foto:\s*km\s*final\b/i.test(String(message || ""));
}
function isFinalCardUpdate(step, message) {
  return String(step || "") === "finalizada" || isFinalKmUpdate(message);
}
function alreadyForwardedFinal(priorSentUpdates) {
  return (priorSentUpdates || []).some((p) => isFinalCardUpdate(p.mission_step, p.message));
}
function hasCompetingFinalCard(current, siblings, claimNotStaleBeforeIso) {
  const cTs = new Date(current.created_at).getTime();
  const cId = current.id;
  for (const s of siblings || []) {
    if (!isFinalCardUpdate(s.mission_step, s.message)) continue;
    if (s.whatsapp_forwarded_at && !s.whatsapp_forward_error) return true;
    if (s.id === cId) continue;
    const sTs = s.created_at ? new Date(s.created_at).getTime() : 0;
    const inFlight = !!(s.whatsapp_forward_claimed_at && !s.whatsapp_forwarded_at && s.whatsapp_forward_claimed_at >= claimNotStaleBeforeIso);
    if (sTs < cTs || sTs === cTs && (s.id || 0) < cId) {
      if (!s.whatsapp_forwarded_at) return true;
    }
    if (inFlight && (sTs < cTs || sTs === cTs && (s.id || 0) < cId)) return true;
  }
  return false;
}
function fmtMissionStatus(s) {
  if (!s) return "";
  const key = String(s).toLowerCase().trim();
  if (MISSION_STATUS_LABEL[key]) return MISSION_STATUS_LABEL[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmtBrtDate(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
  } catch {
    return "";
  }
}
function fmtBrtTime(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  } catch {
    return "";
  }
}
function fmtBrtDateTime(iso) {
  const d = fmtBrtDate(iso);
  const t = fmtBrtTime(iso);
  if (d && t) return `${d}, ${t}`;
  return d || t || "\u2014";
}
function fmtKm(km) {
  if (km == null || !isFinite(Number(km)) || Number(km) <= 0) return "\u2014";
  return `${Number(km).toLocaleString("pt-BR")} km`;
}
function fmtEta(km) {
  if (!isFinite(km) || km <= 0) return "Chegando";
  const totalMin = Math.round(km / 60 * 60);
  if (totalMin < 60) return `~${totalMin}min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `~${h}h` : `~${h}h${String(m).padStart(2, "0")}`;
}
function fmtKmUpper(km) {
  if (km == null || !isFinite(Number(km)) || Number(km) <= 0) return "\u2014";
  return `${Number(km).toLocaleString("pt-BR")} KM`;
}
function fmtDuracao(aIso, bIso) {
  if (!aIso || !bIso) return "\u2014";
  const ms = new Date(bIso).getTime() - new Date(aIso).getTime();
  if (!isFinite(ms) || ms <= 0) return "\u2014";
  const totalMin = Math.round(ms / 6e4);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}min`;
}
function cidadeFromAddr(addr) {
  if (!addr) return "";
  const parts = String(addr).split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const m = p.match(/^(.+?)\s*-\s*[A-Z]{2}$/);
    if (m) return m[1].trim();
  }
  const noBrasil = parts.filter((p) => !/^brasil$/i.test(p));
  return noBrasil[noBrasil.length - 1] || parts[0] || "";
}
function rotaCidades(origin, destination) {
  const co = cidadeFromAddr(origin) || (origin ? String(origin).trim() : "");
  const cd = cidadeFromAddr(destination) || (destination ? String(destination).trim() : "");
  if (co && cd) return `${co} \u2192 ${cd}`;
  return co || cd || "";
}
function parseCoord(raw) {
  if (raw == null || raw === "") return NaN;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(n) ? n : NaN;
}
function mapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat.toFixed(4)},${lng.toFixed(4)}&z=17&hl=pt-BR`;
}
function pickCoords(...candidates) {
  for (const c of candidates) {
    if (!c) continue;
    const lat = parseCoord(c.lat);
    const lng = parseCoord(c.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}
async function resolveLivePosition(u, soId) {
  const fromUpdate = pickCoords({ lat: u?.latitude, lng: u?.longitude });
  if (fromUpdate) return fromUpdate;
  if (!soId) return null;
  try {
    const { data } = await supabaseAdmin.from("mission_positions").select("latitude, longitude").eq("service_order_id", soId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const fromPos = pickCoords({ lat: data?.latitude, lng: data?.longitude });
    if (fromPos) return fromPos;
  } catch (e) {
    console.warn(`${TAG} resolveLivePosition: falha em mission_positions OS=${soId}:`, e?.message || e);
  }
  try {
    const { data } = await supabaseAdmin.from("mission_updates").select("latitude, longitude").eq("service_order_id", soId).not("latitude", "is", null).not("longitude", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const fromPrev = pickCoords({ lat: data?.latitude, lng: data?.longitude });
    if (fromPrev) return fromPrev;
  } catch (e) {
    console.warn(`${TAG} resolveLivePosition: falha em mission_updates OS=${soId}:`, e?.message || e);
  }
  return null;
}
async function buildRichCaption(u, so, client, stepLabel) {
  const pos = await resolveLivePosition(u, u?.service_order_id ?? so?.id);
  const upLat = pos ? pos.lat : NaN;
  const upLng = pos ? pos.lng : NaN;
  const hasGeo = pos != null;
  const vehicleP = so?.vehicle_id ? supabaseAdmin.from("vehicles").select("plate").eq("id", so.vehicle_id).maybeSingle() : Promise.resolve({ data: null });
  const ag1P = so?.assigned_employee_id ? supabaseAdmin.from("employees").select("name").eq("id", so.assigned_employee_id).maybeSingle() : Promise.resolve({ data: null });
  const ag2P = so?.assigned_employee_2_id ? supabaseAdmin.from("employees").select("name").eq("id", so.assigned_employee_2_id).maybeSingle() : Promise.resolve({ data: null });
  const addrP = hasGeo ? nominatimReverseGeocode(upLat, upLng).catch(() => null) : Promise.resolve(null);
  const [vehRes, ag1Res, ag2Res, addr] = await Promise.all([vehicleP, ag1P, ag2P, addrP]);
  const viaturaPlate = vehRes?.data?.plate;
  const shortName = (full) => {
    if (!full) return "";
    const parts = String(full).trim().split(/\s+/);
    return parts.slice(0, 2).join(" ");
  };
  const ag1Name = shortName(ag1Res?.data?.name);
  const ag2Name = shortName(ag2Res?.data?.name);
  let progressoPct = null;
  let distRestKm = null;
  const oLat = so?.origin_lat != null ? Number(so.origin_lat) : NaN;
  const oLng = so?.origin_lng != null ? Number(so.origin_lng) : NaN;
  const dLat = so?.destination_lat != null ? Number(so.destination_lat) : NaN;
  const dLng = so?.destination_lng != null ? Number(so.destination_lng) : NaN;
  if (hasGeo && isFinite(dLat) && isFinite(dLng)) {
    distRestKm = haversineDist(upLat, upLng, dLat, dLng) / 1e3;
  }
  if (hasGeo && isFinite(oLat) && isFinite(oLng) && isFinite(dLat) && isFinite(dLng)) {
    const total = haversineDist(oLat, oLng, dLat, dLng);
    const done = haversineDist(oLat, oLng, upLat, upLng);
    if (total > 0) {
      const pct = Math.round(done / total * 100);
      progressoPct = Math.max(0, Math.min(99, pct));
    }
  }
  const dataStr = fmtBrtDate(u.created_at);
  const horaStr = fmtBrtTime(u.created_at);
  const statusLabel = fmtMissionStatus(so?.mission_status).toUpperCase();
  const opLabel = fmtMissionStatus(so?.mission_status);
  const clienteNome = String(client?.name || "").toUpperCase();
  const msgUpper = String(u.message || "").toUpperCase();
  const L = [];
  L.push(`\u{1F6E1}\uFE0F *TORRES VIGIL\xC2NCIA PATRIMONIAL*`);
  L.push(`\u{1F6A8} *OS ${u.os_number || ""}* | *STATUS:* ${statusLabel || "\u2014"}`);
  L.push("");
  if (dataStr || horaStr) L.push(`\u{1F4C5} *DATA:* ${dataStr}   \u{1F550} *HORA:* ${horaStr}`);
  if (clienteNome) L.push(`\u{1F3E2} *CLIENTE:* ${clienteNome}`);
  L.push("");
  if (so?.origin) L.push(`\u{1F4CD} *ORIGEM:* ${so.origin}`);
  if (so?.destination) L.push(`\u{1F3C1} *DESTINO:* ${so.destination}`);
  L.push("");
  if (so?.escorted_vehicle_plate) L.push(`\u{1F69B} *VE\xCDCULO:* ${so.escorted_vehicle_plate}`);
  if (so?.escorted_driver_name) L.push(`\u{1F464} *MOTORISTA:* ${so.escorted_driver_name}`);
  if (so?.escorted_driver_phone) L.push(`\u{1F4DE} *CONTATO:* ${so.escorted_driver_phone}`);
  L.push("");
  if (viaturaPlate) L.push(`\u{1F693} *VIATURA:* ${viaturaPlate}`);
  if (ag1Name) L.push(`\u{1F46E} *AGENTE 01:* ${ag1Name}`);
  if (ag2Name) L.push(`\u{1F46E} *AGENTE 02:* ${ag2Name}`);
  L.push("");
  if (progressoPct != null) L.push(`\u{1F4CA} *PROGRESSO DA MISS\xC3O:* ${progressoPct}%`);
  if (distRestKm != null) L.push(`\u{1F697} *DIST\xC2NCIA AT\xC9 DESTINO:* ${Math.round(distRestKm)} km`);
  if (distRestKm != null) L.push(`\u23F1\uFE0F *PREVIS\xC3O DE CHEGADA:* ${fmtEta(distRestKm)}`);
  L.push("");
  if (msgUpper) L.push(`\u{1F4DD} *ATUALIZA\xC7\xC3O:* ${msgUpper}`);
  L.push("");
  if (addr) L.push(`\u{1F4CD} *LOCALIZA\xC7\xC3O:* ${addr}`);
  if (hasGeo) {
    L.push(`\u{1F4CD} *LINK GOOGLE:*`);
    L.push(mapsLink(upLat, upLng));
  }
  return L.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
async function buildFinalizedSummary(u, so, client) {
  const soId = u.service_order_id;
  const updsP = supabaseAdmin.from("mission_updates").select("mission_step, created_at").eq("service_order_id", soId).in("mission_step", ["checkin_chegada_km", "iniciar_missao", "chegada_destino"]).order("created_at", { ascending: true });
  const photosP = supabaseAdmin.from("mission_photos").select("step, km_value, created_at").eq("service_order_id", soId).in("step", ["km_saida", "km_final"]).order("created_at", { ascending: true });
  const msgsP = supabaseAdmin.from("mission_updates").select("message, created_at").eq("service_order_id", soId).not("message", "is", null).order("created_at", { ascending: false }).limit(20);
  const vehicleP = so?.vehicle_id ? supabaseAdmin.from("vehicles").select("plate").eq("id", so.vehicle_id).maybeSingle() : Promise.resolve({ data: null });
  const ag1P = so?.assigned_employee_id ? supabaseAdmin.from("employees").select("name").eq("id", so.assigned_employee_id).maybeSingle() : Promise.resolve({ data: null });
  const ag2P = so?.assigned_employee_2_id ? supabaseAdmin.from("employees").select("name").eq("id", so.assigned_employee_2_id).maybeSingle() : Promise.resolve({ data: null });
  const [updsRes, photosRes, msgsRes, vehRes, ag1Res, ag2Res] = await Promise.all([updsP, photosP, msgsP, vehicleP, ag1P, ag2P]);
  if (updsRes?.error) console.warn(`${TAG} resumo: falha ao ler mission_updates OS=${u.os_number}:`, updsRes.error.message);
  if (photosRes?.error) console.warn(`${TAG} resumo: falha ao ler mission_photos OS=${u.os_number}:`, photosRes.error.message);
  const upds = updsRes?.data || [];
  const photos = photosRes?.data || [];
  const msgs = msgsRes?.data || [];
  const inicioOperTs = so?.mission_started_at || upds.find((x) => x.mission_step === "iniciar_missao")?.created_at || null;
  const fimOperTs = so?.completed_date || u.created_at || null;
  const agendamentoTs = so?.scheduled_date || null;
  const chegadaDestinoTs = upds.find((x) => x.mission_step === "chegada_destino")?.created_at || null;
  const kmInicio = photos.find((p) => p.step === "km_saida")?.km_value ?? null;
  const kmFinal = [...photos].reverse().find((p) => p.step === "km_final")?.km_value ?? null;
  const shortName = (full) => {
    if (!full) return "";
    const parts = String(full).trim().split(/\s+/);
    return parts.slice(0, 2).join(" ");
  };
  const ag1Name = shortName(ag1Res?.data?.name);
  const ag2Name = shortName(ag2Res?.data?.name);
  const viaturaPlate = vehRes?.data?.plate || null;
  const placaVeiculo = so?.escorted_vehicle_plate || null;
  const clienteNome = String(client?.name || "").toUpperCase();
  const rota = rotaCidades(so?.origin, so?.destination);
  const pos = await resolveLivePosition(u, soId);
  const upLat = pos ? pos.lat : NaN;
  const upLng = pos ? pos.lng : NaN;
  const hasGeo = pos != null;
  const chegadaOrigemTs = upds.find((x) => x.mission_step === "checkin_chegada_km")?.created_at || null;
  const gtmNumber = so?.gtm_number ? String(so.gtm_number).trim() : "";
  const origem = so?.origin ? String(so.origin).trim() : "";
  const destino = so?.destination ? String(so.destination).trim() : "";
  const motorista = so?.escorted_driver_name ? String(so.escorted_driver_name).trim() : "";
  const fone = so?.escorted_driver_phone ? String(so.escorted_driver_phone).trim() : "";
  const cavalo = placaVeiculo;
  const kmRodado = kmInicio != null && kmFinal != null && Number(kmFinal) > Number(kmInicio) ? Number(kmFinal) - Number(kmInicio) : null;
  const isSystemMsg = (m) => !m || /^🔄/.test(m) || /^📷/.test(m) || isFinalKmUpdate(m) || /^ajuste manual/i.test(m);
  const agentMsg = msgs.map((x) => String(x?.message || "").trim()).find((m) => m && !isSystemMsg(m)) || "";
  const statusMsg = agentMsg.toUpperCase();
  const L = [];
  L.push(`*TORRES VIGIL\xC2NCIA PATRIMONIAL*`);
  if (u.os_number) L.push(`OS TORRES - ${u.os_number}`);
  if (gtmNumber) L.push(`OS GTM - ${gtmNumber}`);
  L.push("");
  if (rota) L.push(`\u{1F6E1}\uFE0F *OPERA\xC7\xC3O:* ${rota}`);
  L.push("");
  if (viaturaPlate) L.push(`\u{1F694} *VIATURA:* ${viaturaPlate}`);
  if (ag1Name) L.push(`\u{1F977} *AGT 1:* ${ag1Name}`);
  if (ag2Name) L.push(`\u{1F977} *AGT 2:* ${ag2Name}`);
  L.push("");
  if (clienteNome) L.push(`\u{1F454} *CLIENTE:* ${clienteNome}`);
  if (origem) L.push(`\u{1F3E6} *ORIGEM:* ${origem}`);
  if (destino) L.push(`\u{1F3ED} *DESTINO:* ${destino}`);
  if (motorista) L.push(`\u{1F468}\u200D\u{1F9B0} *MOTORISTA:* ${motorista}`);
  if (fone) L.push(`\u{1F4DE} *FONE:* ${fone}`);
  if (cavalo) L.push(`\u{1F69B} *CAVALO:* ${cavalo}`);
  L.push("");
  L.push(`\u{1F551} *IN\xCDCIO PREVISTO:* ${fmtBrtDateTime(agendamentoTs)}`);
  L.push(`\u{1F551} *CHEGADA NA ORIGEM:* ${fmtBrtDateTime(chegadaOrigemTs)}`);
  L.push(`\u{1F9ED} *IN\xCDCIO DE OPERA\xC7\xC3O:* ${fmtBrtDateTime(inicioOperTs)}`);
  L.push(`\u{1F9ED} *FIM DE OPERA\xC7\xC3O:* ${fmtBrtDateTime(fimOperTs)}`);
  L.push("");
  L.push(`\u{1F551} *TOTAL DE HORAS:* ${fmtDuracao(inicioOperTs, fimOperTs)}`);
  L.push(`\u{1F69B} *TOTAL DE KM:* ${fmtKmUpper(kmRodado)}`);
  if (hasGeo) {
    L.push("");
    L.push(`\u{1F4CD} *LOCALIZA\xC7\xC3O:*`);
    L.push(mapsLink(upLat, upLng));
  }
  L.push("");
  L.push(statusMsg ? `\u{1F58B}\uFE0F *STATUS:* CONCLU\xCDDA \u2014 ${statusMsg}` : `\u{1F58B}\uFE0F *STATUS:* CONCLU\xCDDA`);
  return L.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
async function buildKmResumoByOsId(soId) {
  const { data: so, error: soErr } = await supabaseAdmin.from("service_orders").select("id, os_number, mission_started_at, completed_date, scheduled_date").eq("id", soId).maybeSingle();
  if (soErr) console.warn(`${TAG} km-resumo: falha ao ler OS id=${soId}:`, soErr.message);
  if (!so) return null;
  const updsP = supabaseAdmin.from("mission_updates").select("mission_step, created_at").eq("service_order_id", soId).in("mission_step", ["checkin_chegada_km", "iniciar_missao"]).order("created_at", { ascending: true });
  const photosP = supabaseAdmin.from("mission_photos").select("step, km_value, created_at").eq("service_order_id", soId).in("step", ["km_saida", "km_final"]).order("created_at", { ascending: true });
  const [updsRes, photosRes] = await Promise.all([updsP, photosP]);
  const upds = updsRes?.data || [];
  const photos = photosRes?.data || [];
  const chegadaOrigemTs = upds.find((x) => x.mission_step === "checkin_chegada_km")?.created_at || null;
  const inicioOperTs = so.mission_started_at || upds.find((x) => x.mission_step === "iniciar_missao")?.created_at || null;
  const fimOperTs = so.completed_date || null;
  const inicioPrevistoTs = so.scheduled_date || null;
  const kmInicio = photos.find((p) => p.step === "km_saida")?.km_value ?? null;
  const kmFinal = [...photos].reverse().find((p) => p.step === "km_final")?.km_value ?? null;
  const kmRodado = kmInicio != null && kmFinal != null && Number(kmFinal) > Number(kmInicio) ? Number(kmFinal) - Number(kmInicio) : null;
  const L = [];
  L.push(`\u{1F6E1}\uFE0F *CENTRAL TORRES* \u2014 OS ${so.os_number || `#${soId}`}`);
  L.push("");
  L.push(`\u{1F551} *IN\xCDCIO PREVISTO:* ${fmtBrtDateTime(inicioPrevistoTs)}`);
  L.push(`\u{1F551} *CHEGADA NA ORIGEM:* ${fmtBrtDateTime(chegadaOrigemTs)}`);
  L.push(`\u{1F9ED} *IN\xCDCIO DE OPERA\xC7\xC3O:* ${fmtBrtDateTime(inicioOperTs)}`);
  L.push(`\u{1F9ED} *FIM DE OPERA\xC7\xC3O:* ${fmtBrtDateTime(fimOperTs)}`);
  L.push("");
  L.push(`\u{1F6E3}\uFE0F *KM IN\xCDCIO:* ${fmtKm(kmInicio)}`);
  L.push(`\u{1F3C1} *KM FINAL:* ${fmtKm(kmFinal)}`);
  L.push(`\u{1F697} *KM RODADO:* ${fmtKm(kmRodado)}`);
  return L.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
async function getKmFinalPhotoByOsId(soId) {
  const { data, error } = await supabaseAdmin.from("mission_photos").select("photo_data, km_value, created_at").eq("service_order_id", soId).eq("step", "km_final").not("photo_data", "is", null).order("created_at", { ascending: false }).limit(1);
  if (error) {
    console.warn(`${TAG} km-foto: falha ao ler mission_photos OS id=${soId}:`, error.message);
    return null;
  }
  const row = (data || [])[0];
  if (!row?.photo_data) return null;
  return { photoData: row.photo_data, kmValue: row.km_value ?? null };
}
async function claim(id) {
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MIN * 60 * 1e3).toISOString();
  const { data, error } = await supabaseAdmin.from("mission_updates").update({ whatsapp_forward_claimed_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).is("whatsapp_forwarded_at", null).or(`whatsapp_forward_claimed_at.is.null,whatsapp_forward_claimed_at.lt.${staleBefore}`).select("id");
  if (error) {
    console.error(`${TAG} claim falhou id=${id}:`, error.message);
    return false;
  }
  return Array.isArray(data) && data.length === 1;
}
async function releaseClaim(id, errMsg) {
  await supabaseAdmin.from("mission_updates").update({ whatsapp_forward_claimed_at: null, whatsapp_forward_error: errMsg ? errMsg.slice(0, 500) : null }).eq("id", id);
}
async function markDone(id, errMsg) {
  await supabaseAdmin.from("mission_updates").update({ whatsapp_forwarded_at: (/* @__PURE__ */ new Date()).toISOString(), whatsapp_forward_error: errMsg ? errMsg.slice(0, 500) : null }).eq("id", id);
}
async function tryLockFinalCardOs(serviceOrderId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const { data, error } = await supabaseAdmin.from("service_orders").update({ whatsapp_final_card_sent_at: now }).eq("id", serviceOrderId).is("whatsapp_final_card_sent_at", null).select("id");
  if (error) {
    console.error(`${TAG} lock final OS id=${serviceOrderId}:`, error.message);
    return false;
  }
  return Array.isArray(data) && data.length === 1;
}
async function releaseFinalCardOsLock(serviceOrderId) {
  await supabaseAdmin.from("service_orders").update({ whatsapp_final_card_sent_at: null }).eq("id", serviceOrderId);
}
async function markDuplicateFinalSiblings(serviceOrderId, winnerId) {
  const { data: pending, error } = await supabaseAdmin.from("mission_updates").select("id, mission_step, message").eq("service_order_id", serviceOrderId).is("whatsapp_forwarded_at", null).neq("id", winnerId);
  if (error) {
    console.warn(`${TAG} markDuplicateFinalSiblings OS=${serviceOrderId}:`, error.message);
    return;
  }
  for (const row of pending || []) {
    if (!isFinalCardUpdate(row.mission_step, row.message)) continue;
    await markDone(row.id, "skip: fim de miss\xE3o duplicado (card j\xE1 enviado)");
    console.log(`${TAG} \u2298 id=${row.id} OS=${serviceOrderId} final duplicado descartado p\xF3s-envio`);
  }
}
function shouldDiscardPendingForwards(status) {
  return status.confirmed && !status.connected;
}
async function processPendingForwards() {
  if (running) return;
  running = true;
  try {
    if (!isZapiConfigured()) return;
    const cutoff = new Date(Date.now() - LOOKBACK_MIN * 60 * 1e3).toISOString();
    const { data: ups, error } = await supabaseAdmin.from("mission_updates").select("id, service_order_id, os_number, employee_name, message, photo_url, latitude, longitude, mission_step, created_at").is("whatsapp_forwarded_at", null).not("photo_url", "is", null).not("message", "is", null).in("mission_step", Object.keys(FORWARDABLE_STEPS)).gte("created_at", cutoff).order("created_at", { ascending: true }).limit(MAX_PER_RUN);
    if (error) {
      console.error(`${TAG} query falhou:`, error.message);
      return;
    }
    if (!ups || ups.length === 0) return;
    const status = await getConnectionStatus();
    if (shouldDiscardPendingForwards(status)) {
      for (const u of ups) {
        if (!await claim(u.id)) continue;
        await markDone(u.id, "descartado: bot desconectado no momento do envio (backlog n\xE3o \xE9 reenviado ap\xF3s reconex\xE3o)");
        console.log(`${TAG} \u2717 id=${u.id} OS=${u.os_number} descartado (bot desconectado)`);
      }
      return;
    }
    console.log(`${TAG} ${ups.length} candidato(s) pra processar`);
    for (const u of ups) {
      if (!await claim(u.id)) continue;
      const photoUrl = String(u.photo_url || "");
      const msg = String(u.message || "").trim();
      const isFinalizadaStep = String(u.mission_step || "") === "finalizada";
      const isData = photoUrl.startsWith("data:image/");
      const isPath = isStoragePath(photoUrl);
      if (!isData && !isPath || !isFinalizadaStep && !msg) {
        await markDone(u.id, "skip: foto/msg inv\xE1lida");
        continue;
      }
      const isFinalizada = isFinalCardUpdate(u.mission_step, u.message);
      const claimNotStaleBefore = new Date(Date.now() - CLAIM_STALE_MIN * 60 * 1e3).toISOString();
      if (isFinalizada) {
        const { data: siblings, error: sibErr } = await supabaseAdmin.from("mission_updates").select("id, mission_step, message, created_at, whatsapp_forwarded_at, whatsapp_forward_error, whatsapp_forward_claimed_at").eq("service_order_id", u.service_order_id).neq("id", u.id);
        if (sibErr) {
          await releaseClaim(u.id, `db dedup-final: ${sibErr.message}`);
          console.error(`${TAG} \u27F3 id=${u.id} erro transit\xF3rio DEDUP-FINAL:`, sibErr.message);
          continue;
        }
        const sentOk = (siblings || []).filter((s) => s.whatsapp_forwarded_at && !s.whatsapp_forward_error);
        if (alreadyForwardedFinal(sentOk)) {
          await markDone(u.id, "skip: fim de miss\xE3o j\xE1 enviado pra essa OS");
          console.log(`${TAG} \u2298 id=${u.id} OS=${u.os_number} fim de miss\xE3o duplicado, pulando`);
          continue;
        }
        if (hasCompetingFinalCard({ id: u.id, created_at: u.created_at }, siblings || [], claimNotStaleBefore)) {
          await markDone(u.id, "skip: fim de miss\xE3o concorrente (outra linha mais antiga ou em voo)");
          console.log(`${TAG} \u2298 id=${u.id} OS=${u.os_number} final concorrente, pulando`);
          continue;
        }
      }
      const { data: so, error: soErr } = await supabaseAdmin.from("service_orders").select("client_id, status, mission_status, origin, destination, origin_lat, origin_lng, destination_lat, destination_lng, vehicle_id, assigned_employee_id, assigned_employee_2_id, escorted_driver_name, escorted_driver_phone, escorted_vehicle_plate, gtm_number, scheduled_date, mission_started_at, completed_date").eq("id", u.service_order_id).maybeSingle();
      if (soErr) {
        await releaseClaim(u.id, `db service_orders: ${soErr.message}`);
        console.error(`${TAG} \u27F3 id=${u.id} erro transit\xF3rio SO:`, soErr.message);
        continue;
      }
      if (!so) {
        await markDone(u.id, "skip: OS n\xE3o encontrada");
        continue;
      }
      if (so.status === "recusada" || so.status === "cancelada") {
        await markDone(u.id, `skip: OS ${so.status}`);
        continue;
      }
      const { data: client, error: clErr } = await supabaseAdmin.from("clients").select("name, whatsapp_group_id").eq("id", so.client_id).maybeSingle();
      if (clErr) {
        await releaseClaim(u.id, `db clients: ${clErr.message}`);
        console.error(`${TAG} \u27F3 id=${u.id} erro transit\xF3rio CLIENT:`, clErr.message);
        continue;
      }
      const groupId = client?.whatsapp_group_id;
      if (!groupId) {
        await markDone(u.id, "skip: cliente sem whatsapp_group_id");
        continue;
      }
      const { data: thr, error: thrErr } = await supabaseAdmin.from("whatsapp_group_throttle").select("last_sent_at").eq("group_id", String(groupId)).maybeSingle();
      if (thrErr) {
        await releaseClaim(u.id, `db throttle: ${thrErr.message}`);
        console.error(`${TAG} \u27F3 id=${u.id} erro transit\xF3rio THROTTLE:`, thrErr.message);
        continue;
      }
      if (thr?.last_sent_at) {
        const elapsedMs = Date.now() - new Date(thr.last_sent_at).getTime();
        if (elapsedMs < THROTTLE_PER_GROUP_MIN * 60 * 1e3) {
          const waitMin = Math.ceil((THROTTLE_PER_GROUP_MIN * 60 * 1e3 - elapsedMs) / 6e4);
          await releaseClaim(u.id, `throttle: aguardando ${waitMin}min`);
          console.log(`${TAG} \u23F8 id=${u.id} OS=${u.os_number} \u2192 ${client.name} throttle ${waitMin}min`);
          continue;
        }
      }
      const stepLabel = FORWARDABLE_STEPS[String(u.mission_step || "")] || null;
      let caption;
      try {
        caption = isFinalizada ? await buildFinalizedSummary(u, so, client) : await buildRichCaption(u, so, client, stepLabel);
      } catch (capErr) {
        console.warn(`${TAG} caption rico falhou id=${u.id}, usando fallback:`, capErr?.message);
        caption = `*Central Torres Vigilancia*

\u{1F6A8} *${u.os_number || "OS"}* \u2014 ${u.employee_name || "Agente"}

${msg}`;
      }
      let imageToSend = photoUrl;
      if (isPath) {
        const signed = await signMissionPhoto(photoUrl);
        if (!signed) {
          await releaseClaim(u.id, "falha ao assinar foto do storage");
          console.error(`${TAG} \u27F3 id=${u.id} OS=${u.os_number}: falha ao assinar foto`);
          continue;
        }
        imageToSend = signed;
      }
      try {
        const { decodeBase64Image: decodeBase64Image2, watermarkToDataUrl: watermarkToDataUrl2 } = await Promise.resolve().then(() => (init_photo_watermark(), photo_watermark_exports));
        const srcBuf = isData ? decodeBase64Image2(photoUrl) : await fetchImageBuffer(imageToSend);
        if (srcBuf && srcBuf.length > 0) {
          const wm = await watermarkToDataUrl2(srcBuf);
          if (wm) imageToSend = wm;
          else console.warn(`${TAG} marca d'\xE1gua payload grande id=${u.id} OS=${u.os_number}, enviando foto original`);
        }
      } catch (wmErr) {
        console.warn(`${TAG} marca d'\xE1gua falhou id=${u.id} OS=${u.os_number}, enviando foto original:`, wmErr?.message);
      }
      let finalOsLocked = false;
      if (isFinalizada) {
        if (!await tryLockFinalCardOs(u.service_order_id)) {
          await markDone(u.id, "skip: card final j\xE1 enviado/concorrente para essa OS");
          console.log(`${TAG} \u2298 id=${u.id} OS=${u.os_number} lock final da OS ocupado, pulando`);
          continue;
        }
        finalOsLocked = true;
      }
      try {
        const result = await sendImageWithCaption({
          groupOrPhone: String(groupId),
          imageBase64OrUrl: imageToSend,
          caption,
          delayMessageSeconds: typingSecondsForMessage(caption)
        });
        if (result.ok) {
          await markDone(u.id, null);
          if (isFinalizada) await markDuplicateFinalSiblings(u.service_order_id, u.id);
          await supabaseAdmin.from("whatsapp_group_throttle").upsert({ group_id: String(groupId), last_sent_at: (/* @__PURE__ */ new Date()).toISOString() }, { onConflict: "group_id" });
          console.log(`${TAG} \u2713 id=${u.id} OS=${u.os_number} \u2192 ${client.name} msgId=${result.messageId}`);
        } else if (result.blocked) {
          if (finalOsLocked) await releaseFinalCardOsLock(u.service_order_id);
          await markDone(u.id, `descartado: envio bloqueado pela trava do bot (${String(result.error || "").slice(0, 300)})`);
          console.log(`${TAG} \u2717 id=${u.id} OS=${u.os_number} descartado (trava do bot: n\xFAmero errado/desconectado)`);
        } else {
          if (finalOsLocked) await releaseFinalCardOsLock(u.service_order_id);
          await releaseClaim(u.id, String(result.error || "erro desconhecido"));
          console.error(`${TAG} \u27F3 id=${u.id} OS=${u.os_number}: ${result.error}`);
        }
      } catch (e) {
        if (finalOsLocked) await releaseFinalCardOsLock(u.service_order_id);
        await releaseClaim(u.id, String(e?.message || e));
        console.error(`${TAG} \u27F3 id=${u.id} exception:`, e?.message);
      }
    }
  } finally {
    running = false;
  }
}
function initWhatsappForwardCron() {
  if (!shouldRunBackgroundJobs()) return;
  cron2.schedule("*/30 * * * * *", () => {
    processPendingForwards().catch((e) => console.error(`${TAG} crash:`, e?.message));
  });
  console.log(`${TAG} CRON ativo: a cada 30s, lookback ${LOOKBACK_MIN}min, max ${MAX_PER_RUN}/ciclo, claim TTL ${CLAIM_STALE_MIN}min, throttle ${THROTTLE_PER_GROUP_MIN}min/grupo`);
  setTimeout(() => processPendingForwards().catch(() => {
  }), 5e3);
}
var TAG, LOOKBACK_MIN, MAX_PER_RUN, CLAIM_STALE_MIN, THROTTLE_PER_GROUP_MIN, running, FORWARDABLE_STEPS, MISSION_STATUS_LABEL;
var init_cron_whatsapp_forward = __esm({
  "server/cron-whatsapp-forward.ts"() {
    "use strict";
    init_platform();
    init_supabase();
    init_zapi();
    init_mission_photos();
    init_whatsapp_humanize();
    init_helpers();
    init_db_init();
    TAG = "[whatsapp-forward-cron]";
    LOOKBACK_MIN = 120;
    MAX_PER_RUN = 10;
    CLAIM_STALE_MIN = 5;
    THROTTLE_PER_GROUP_MIN = 3;
    running = false;
    FORWARDABLE_STEPS = {
      // 5 marcos formais da missão
      checkin_chegada_km: "Chegada na Origem",
      iniciar_missao: "In\xEDcio de Miss\xE3o",
      checkout_km_saida: "Em Deslocamento para o Destino",
      chegada_destino: "Chegada no Cliente",
      finalizada: "Fim de Miss\xE3o",
      // Atualizações de trânsito (texto livre durante a viagem)
      deslocamento_inicio: "Deslocamento ao In\xEDcio",
      em_transito: "Em Tr\xE2nsito",
      em_transito_destino: "Em Tr\xE2nsito ao Destino",
      em_apoio: "Em Apoio",
      pernoite: "Pernoite"
    };
    MISSION_STATUS_LABEL = {
      agendada: "Agendada",
      aceita: "Aceita",
      deslocamento_inicio: "Deslocamento ao In\xEDcio",
      no_local_origem: "No Local de Origem",
      em_transito: "Em Tr\xE2nsito",
      em_transito_destino: "Em Tr\xE2nsito Destino",
      no_local_destino: "No Local de Destino",
      em_apoio: "Em Apoio",
      pernoite: "Pernoite",
      encerrada: "Encerrada",
      cancelada: "Cancelada",
      recusada: "Recusada"
    };
  }
});

// server/lib/agent-central-mention.ts
var agent_central_mention_exports = {};
__export(agent_central_mention_exports, {
  ESCALATE_AFTER_MIN: () => ESCALATE_AFTER_MIN,
  buildClientSummaryByGroup: () => buildClientSummaryByGroup,
  buildNaturalReply: () => buildNaturalReply,
  ensureBotLid: () => ensureBotLid,
  flushAgentEscalations: () => flushAgentEscalations,
  fulfillGroupRequests: () => fulfillGroupRequests,
  handleFinalKmRequest: () => handleFinalKmRequest,
  handleGroupSummaryRequest: () => handleGroupSummaryRequest,
  handleGroupUpdateRequest: () => handleGroupUpdateRequest,
  handleNaturalConversation: () => handleNaturalConversation,
  handlePrivateSummaryRequest: () => handlePrivateSummaryRequest,
  handleTaggedUpdateAck: () => handleTaggedUpdateAck,
  isBotMentioned: () => isBotMentioned,
  isTeamMemberPhone: () => isTeamMemberPhone,
  isTeamSuffixMatch: () => isTeamSuffixMatch,
  looksLikeFinalKm: () => looksLikeFinalKm,
  looksLikeSummaryRequest: () => looksLikeSummaryRequest,
  looksLikeUpdateRequest: () => looksLikeUpdateRequest,
  phoneSuffix8: () => phoneSuffix8,
  planEscalations: () => planEscalations,
  reactOkOnUpdateRequest: () => reactOkOnUpdateRequest,
  sanitizeFinanceiro: () => sanitizeFinanceiro,
  setBotLidForTest: () => setBotLidForTest,
  shortLocal: () => shortLocal,
  suppressPendingAcksForGroup: () => suppressPendingAcksForGroup
});
import OpenAI2 from "openai";
function looksLikeUpdateRequest(text, hasQuoted) {
  if (hasQuoted) return true;
  const t = (text || "").trim();
  if (t.length < 3) return false;
  return RE_OS.test(t) || RE_KEYWORDS.test(t);
}
function looksLikeSummaryRequest(text) {
  const t = (text || "").trim();
  if (t.length < 4) return false;
  return RE_RESUMO.test(t);
}
function looksLikeFinalKm(text) {
  const t = (text || "").trim();
  if (!RE_KM_FINAL.test(t)) return false;
  if (RE_KM_FINAL_NEG.test(t)) return false;
  return true;
}
function fmtStatusPt(s) {
  const key = String(s || "").toLowerCase().trim();
  if (MISSION_STATUS_LABEL_PT[key]) return MISSION_STATUS_LABEL_PT[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "\u2014";
}
function shortLocal(s) {
  if (!s) return "";
  const t = String(s).replace(/,?\s*Brasil\s*$/i, "").trim();
  const m = t.match(/([A-Za-zÀ-ÿ'.\s]+?)\s*[-,]\s*([A-Z]{2})\s*$/);
  if (m) return `${m[1].trim()}/${m[2]}`;
  const parts = t.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] || t;
}
function startOfTodayBrtIso() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(/* @__PURE__ */ new Date());
  return `${today}T00:00:00-03:00`;
}
function fmtBrtNow() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(/* @__PURE__ */ new Date());
}
function fmtHoraBrt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(d);
}
function fmtDataHoraBrt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const data = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit"
  }).format(d);
  return `${data} \xE0s ${fmtHoraBrt(iso)}`;
}
function fmtDecorrido(iso) {
  if (!iso) return "";
  const start = new Date(iso).getTime();
  if (isNaN(start)) return "";
  const diff = Date.now() - start;
  if (diff < 6e4) return "iniciada agora";
  const totalMin = Math.floor(diff / 6e4);
  const dias = Math.floor(totalMin / 1440);
  const horas = Math.floor(totalMin % 1440 / 60);
  const min = totalMin % 60;
  if (dias > 0) return `em rota h\xE1 ${dias}d${horas > 0 ? ` ${horas}h` : ""}`;
  if (horas > 0) return `em rota h\xE1 ${horas}h${min > 0 ? ` ${min}min` : ""}`;
  return `em rota h\xE1 ${min}min`;
}
function statusEmoji(s) {
  return MISSION_STATUS_EMOJI[String(s || "").toLowerCase().trim()] || "\u{1F69A}";
}
function toIntlPhone2(rawPhone) {
  const digits = normalizePhone(rawPhone);
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12) return digits;
  return null;
}
function firstName2(full) {
  if (!full) return "";
  return String(full).trim().split(/\s+/)[0] || "";
}
async function extractIntent(text) {
  const fallback = { isUpdateRequest: false, osNumbers: [], agentNames: [] };
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) {
    console.warn("[agent-central-mention] AI_INTEGRATIONS_OPENAI_API_KEY ausente \u2014 extractIntent desativado");
    return fallback;
  }
  try {
    const openai = new OpenAI2({ apiKey, baseURL });
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      max_completion_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Voc\xEA analisa mensagens de um grupo de WhatsApp de uma empresa de escolta/seguran\xE7a. O cliente usa o grupo para pedir atualiza\xE7\xE3o de status de uma miss\xE3o (OS) em andamento.

Responda SOMENTE um JSON com este formato exato:
{"is_update_request": boolean, "os_numbers": string[], "agent_names": string[]}

- is_update_request: true se a mensagem pede/cobra uma atualiza\xE7\xE3o, posi\xE7\xE3o, situa\xE7\xE3o, previs\xE3o de chegada ou status de uma miss\xE3o/agente. false se for conversa fiada, agradecimento, ou outra coisa.
- os_numbers: n\xFAmeros de OS citados (ex: "TOR-0123", "0123", "123"). Vazio se nenhum.
- agent_names: primeiros nomes de pessoas/agentes citados de quem se cobra atualiza\xE7\xE3o. Vazio se nenhum.
N\xC3O invente. S\xF3 extraia o que est\xE1 no texto.`
        },
        { role: "user", content: text.slice(0, 800) }
      ]
    });
    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      isUpdateRequest: parsed.is_update_request === true,
      osNumbers: Array.isArray(parsed.os_numbers) ? parsed.os_numbers.map((s) => String(s)) : [],
      agentNames: Array.isArray(parsed.agent_names) ? parsed.agent_names.map((s) => String(s)) : []
    };
  } catch (e) {
    console.warn("[agent-central-mention] extractIntent falhou:", e?.message);
    return fallback;
  }
}
function osDigits(s) {
  const m = String(s || "").match(/\d{1,6}/);
  if (!m) return "";
  return String(parseInt(m[0], 10));
}
async function loadActiveOs() {
  const { data } = await supabaseAdmin.from("service_orders").select("id, os_number, mission_status, mission_started_at, assigned_employee_id, assigned_employee_2_id, status").eq("status", "em_andamento");
  return (data || []).filter(
    (o) => !FINISHED_MISSION_STATUS3.has(String(o.mission_status || "").toLowerCase())
  );
}
function osNumberFromText(text) {
  if (!text) return null;
  const m = text.match(/tor[-\s]?0*\d{2,5}/i);
  return m ? m[0] : null;
}
async function resolveOs(params) {
  const active = await loadActiveOs();
  if (active.length === 0) return { os: null, via: "sem OS ativa" };
  const byDigits = /* @__PURE__ */ new Map();
  for (const o of active) {
    const d = osDigits(o.os_number || "");
    if (d) byDigits.set(d, o);
  }
  for (const raw of params.extract.osNumbers) {
    const d = osDigits(raw);
    if (d && byDigits.has(d)) return { os: byDigits.get(d), via: `n\xBA OS ${raw}` };
  }
  const quotedOs = osNumberFromText(params.quotedText);
  if (quotedOs) {
    const d = osDigits(quotedOs);
    if (d && byDigits.has(d)) return { os: byDigits.get(d), via: `OS citada ${quotedOs}` };
  }
  if (params.extract.agentNames.length > 0) {
    const empIds = /* @__PURE__ */ new Set();
    for (const o of active) {
      if (o.assigned_employee_id) empIds.add(o.assigned_employee_id);
      if (o.assigned_employee_2_id) empIds.add(o.assigned_employee_2_id);
    }
    if (empIds.size > 0) {
      const { data: emps } = await supabaseAdmin.from("employees").select("id, name").in("id", Array.from(empIds));
      const empById = /* @__PURE__ */ new Map();
      for (const e of emps || []) empById.set(e.id, String(e.name || ""));
      for (const nameRaw of params.extract.agentNames) {
        const needle = firstName2(nameRaw).toLowerCase();
        if (!needle || needle.length < 3) continue;
        for (const o of active) {
          const n1 = empById.get(o.assigned_employee_id || -1) || "";
          const n2 = empById.get(o.assigned_employee_2_id || -1) || "";
          if (n1.toLowerCase().includes(needle) || n2.toLowerCase().includes(needle)) {
            return { os: o, via: `agente "${nameRaw}"` };
          }
        }
      }
    }
  }
  try {
    const { data: cli } = await supabaseAdmin.from("clients").select("id").eq("whatsapp_group_id", params.groupId).maybeSingle();
    if (cli?.id) {
      const { data: withClient } = await supabaseAdmin.from("service_orders").select("id, client_id").in("id", active.map((o) => o.id));
      const clientByOs = /* @__PURE__ */ new Map();
      for (const r of withClient || []) clientByOs.set(r.id, r.client_id);
      const matches = active.filter((o) => clientByOs.get(o.id) === cli.id);
      if (matches.length === 1) return { os: matches[0], via: "\xFAnica OS ativa do grupo" };
    }
  } catch {
  }
  return { os: null, via: "n\xE3o resolvida" };
}
async function cobrarAgentes(os) {
  const primaryId = os.assigned_employee_id ?? os.assigned_employee_2_id;
  if (!primaryId) return 0;
  const { data: emps } = await supabaseAdmin.from("employees").select("id, name, phone").eq("id", primaryId).limit(1);
  const emp = (emps || [])[0];
  if (!emp) return 0;
  const intl = toIntlPhone2(emp.phone);
  if (!intl) return 0;
  const osLabel = os.os_number || `#${os.id}`;
  let sent = 0;
  try {
    const msg = await buildReminderMessage({ osLabel, trigger: "client" });
    const r = await sendText({
      groupOrPhone: intl,
      message: msg,
      delayTypingSeconds: randomTypingSeconds()
    });
    if (r.ok) sent++;
  } catch {
  }
  if (sent > 0) {
    await supabaseAdmin.from("agent_central_reminders").upsert(
      { service_order_id: os.id, last_reminded_at: (/* @__PURE__ */ new Date()).toISOString(), reminder_count: 1 },
      { onConflict: "service_order_id" }
    ).then(() => {
    }, () => {
    });
  }
  return sent;
}
async function escalateToSecondAgent(serviceOrderId) {
  try {
    const { data: osRows } = await supabaseAdmin.from("service_orders").select("id, os_number, assigned_employee_id, assigned_employee_2_id").eq("id", serviceOrderId).limit(1);
    const os = (osRows || [])[0];
    if (!os) return false;
    const primaryId = os.assigned_employee_id;
    const secondId = os.assigned_employee_2_id;
    if (!primaryId || !secondId || primaryId === secondId) return false;
    const { data: emps } = await supabaseAdmin.from("employees").select("id, name, phone").eq("id", secondId).limit(1);
    const emp = (emps || [])[0];
    if (!emp) return false;
    const intl = toIntlPhone2(emp.phone);
    if (!intl) return false;
    const osLabel = os.os_number || `#${os.id}`;
    const msg = await buildReminderMessage({ osLabel, trigger: "client" });
    const r = await sendText({
      groupOrPhone: intl,
      message: msg,
      delayTypingSeconds: randomTypingSeconds()
    });
    return !!r.ok;
  } catch (e) {
    console.warn("[agent-central-mention] escalateToSecondAgent falhou:", e?.message);
    return false;
  }
}
function extractQuotedText(rawBody) {
  if (!rawBody || typeof rawBody !== "object") return null;
  const candidates = [
    rawBody.referencedMessage,
    rawBody.quotedMsg,
    rawBody.quotedMessage,
    rawBody.message?.quotedMsg,
    rawBody.text?.referencedMessage
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === "string") return c;
    const t = c.text?.message || c.message || c.text || c.body || c.caption || c.conversation;
    if (t && typeof t === "string") return t;
  }
  return null;
}
function extractQuotedId(rawBody) {
  if (!rawBody || typeof rawBody !== "object") return null;
  return rawBody.referenceMessageId || rawBody.referencedMessageId || rawBody.text?.referenceMessageId || rawBody.image?.referenceMessageId || rawBody.referencedMessage?.messageId || rawBody.quotedMsgId || null;
}
function setBotLidForTest(lid) {
  cachedBotLidDigits = lid ? String(lid).replace(/\D/g, "") || null : null;
}
async function ensureBotLid() {
  if (cachedBotLidDigits) return;
  try {
    const lid = await getBotLid();
    if (lid) cachedBotLidDigits = lid;
  } catch {
  }
}
function isBotMentioned(rawBody, botLid) {
  if (!rawBody || typeof rawBody !== "object") return false;
  const bot = normalizePhone(rawBody.connectedPhone ?? rawBody.ni);
  if (!bot) return false;
  const last8 = bot.slice(-8);
  if (last8.length < 8) return false;
  const lidDigits = (botLid ?? cachedBotLidDigits)?.replace(/\D/g, "") || "";
  const matchesBot = (raw) => {
    const digits = String(raw ?? "").replace(/\D/g, "");
    if (lidDigits && digits === lidDigits) return true;
    if (digits.length > 13) return false;
    const d = normalizePhone(raw);
    return !!d && (d === bot || d.slice(-8) === last8);
  };
  for (const list of [rawBody.mentioned, rawBody.text?.mentioned, rawBody.message?.mentioned]) {
    if (Array.isArray(list) && list.some(matchesBot)) return true;
  }
  const txt = String(
    rawBody.text?.message || rawBody.image?.caption || rawBody.video?.caption || rawBody.caption || ""
  );
  for (const tok of txt.match(/@(\d{6,15})/g) || []) {
    const dg = tok.replace(/\D/g, "");
    if (lidDigits && dg === lidDigits) return true;
    if (dg.length > 13) continue;
    if (dg.slice(-8) === last8) return true;
  }
  return false;
}
async function lookupQuotedBody(messageId) {
  try {
    const { data } = await supabaseAdmin.from("whatsapp_messages").select("body").eq("zapi_message_id", messageId).limit(1).maybeSingle();
    const b = data?.body;
    return typeof b === "string" && b.trim() ? b : null;
  } catch {
    return null;
  }
}
async function buildClientSummaryByGroup(groupId) {
  const { data: cli } = await supabaseAdmin.from("clients").select("id, name").eq("whatsapp_group_id", groupId).maybeSingle();
  if (!cli?.id) return null;
  const clienteNome = String(cli.name || "").toUpperCase();
  const startIso = startOfTodayBrtIso();
  const sel = "id, os_number, mission_status, status, origin, destination, escorted_vehicle_plate, escorted_driver_name, assigned_employee_id, assigned_employee_2_id, completed_date, mission_started_at";
  const { data: activeRows } = await supabaseAdmin.from("service_orders").select(sel).eq("client_id", cli.id).eq("status", "em_andamento");
  const active = (activeRows || []).filter((o) => !FINISHED_MISSION_STATUS3.has(String(o.mission_status || "").toLowerCase())).sort((a, b) => String(a.mission_started_at || "").localeCompare(String(b.mission_started_at || "")));
  const endIso = new Date(new Date(startIso).getTime() + 24 * 60 * 60 * 1e3).toISOString();
  const { data: doneRows } = await supabaseAdmin.from("service_orders").select(sel).eq("client_id", cli.id).gte("completed_date", startIso).lt("completed_date", endIso).not("status", "in", "(cancelada,recusada)");
  const activeIds = new Set(active.map((o) => o.id));
  const doneToday = (doneRows || []).filter((o) => !activeIds.has(o.id)).sort((a, b) => String(b.completed_date || "").localeCompare(String(a.completed_date || "")));
  const empIds = Array.from(new Set(
    active.flatMap((o) => [o.assigned_employee_id, o.assigned_employee_2_id]).filter((id) => typeof id === "number" && id > 0)
  ));
  const nomePorEmp = /* @__PURE__ */ new Map();
  if (empIds.length > 0) {
    const { data: emps } = await supabaseAdmin.from("employees").select("id, name").in("id", empIds);
    for (const e of emps || []) {
      nomePorEmp.set(e.id, firstName2(e.name));
    }
  }
  const equipeDe = (o) => [o.assigned_employee_id, o.assigned_employee_2_id].map((id) => (typeof id === "number" ? nomePorEmp.get(id) : "") || "").filter(Boolean).join(" e ");
  const rotaDe = (o) => [shortLocal(o.origin), shortLocal(o.destination)].filter(Boolean).join(" \u2192 ");
  const DIV = "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501";
  const L = [];
  L.push(`\u{1F6E1}\uFE0F *TORRES VIGIL\xC2NCIA PATRIMONIAL*`);
  L.push(`\u{1F4CB} *Resumo Operacional do Dia*`);
  if (clienteNome) L.push(`\u{1F3E2} ${clienteNome}`);
  L.push(`\u{1F5D3}\uFE0F ${fmtBrtNow()}`);
  L.push(DIV);
  L.push(`\u{1F6A6} Em andamento: *${active.length}*    \u2705 Finalizadas hoje: *${doneToday.length}*`);
  if (active.length === 0 && doneToday.length === 0) {
    L.push("");
    L.push(`Sem viagens em andamento ou finalizadas at\xE9 o momento. \u{1F69A}`);
    L.push("");
    L.push(`_Mensagem autom\xE1tica \u2022 Torres Vigil\xE2ncia Patrimonial_`);
    return L.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  if (active.length > 0) {
    L.push("");
    L.push(`\u25B6\uFE0F *EM ANDAMENTO*`);
    active.forEach((o, i) => {
      L.push("");
      L.push(`*${i + 1}. OS ${o.os_number || `#${o.id}`}*  ${statusEmoji(o.mission_status)} _${fmtStatusPt(o.mission_status)}_`);
      const rota = rotaDe(o);
      if (rota) L.push(`\u{1F4CD} ${rota}`);
      const cargaPartes = [o.escorted_vehicle_plate, o.escorted_driver_name].filter(Boolean).join(" \u2022 ");
      if (cargaPartes) L.push(`\u{1F69B} ${cargaPartes}`);
      const equipe = equipeDe(o);
      if (equipe) L.push(`\u{1F6E1}\uFE0F Equipe Torres: ${equipe}`);
      const decorrido = fmtDecorrido(o.mission_started_at);
      if (decorrido) L.push(`\u{1F552} In\xEDcio ${fmtDataHoraBrt(o.mission_started_at)} \xB7 ${decorrido}`);
    });
  }
  if (doneToday.length > 0) {
    L.push("");
    L.push(DIV);
    L.push(`\u2705 *FINALIZADAS HOJE*`);
    doneToday.forEach((o, i) => {
      L.push("");
      const placa = o.escorted_vehicle_plate || "\u2014";
      L.push(`*${i + 1}. OS ${o.os_number || `#${o.id}`}*  \u2022  \u{1F69B} ${placa}`);
      const rota = rotaDe(o);
      if (rota) L.push(`\u{1F4CD} ${rota}`);
      const horaFim = fmtHoraBrt(o.completed_date);
      if (horaFim) L.push(`\u{1F3C1} Conclu\xEDda \xE0s ${horaFim}`);
    });
  }
  L.push("");
  L.push(DIV);
  L.push(`_Mensagem autom\xE1tica \u2022 Torres Vigil\xE2ncia Patrimonial_`);
  return L.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
async function handleGroupSummaryRequest(parsed) {
  try {
    if (!isResumoAuthorizedPhone(parsed.senderPhone)) {
      console.log(`[agent-central-mention] resumo ignorado \u2014 telefone n\xE3o autorizado (${parsed.senderPhone || "?"})`);
      return;
    }
    const pv = toIntlPhone2(parsed.senderPhone);
    if (!pv) {
      console.log(`[agent-central-mention] resumo autorizado mas sem telefone PV v\xE1lido (${parsed.senderName || "?"})`);
      return;
    }
    const last = summaryThrottle.get(pv) || 0;
    if (Date.now() - last < SUMMARY_THROTTLE_MS) {
      console.log(`[agent-central-mention] resumo PV ${pv} ignorado (throttle ${SUMMARY_THROTTLE_MS / 1e3}s)`);
      return;
    }
    const msg = await buildFleetVtrSummary();
    summaryThrottle.set(pv, Date.now());
    await sendText({ groupOrPhone: pv, message: msg, delayTypingSeconds: randomTypingSeconds() });
    console.log(`[agent-central-mention] resumo VTR enviado no PV de ${parsed.senderName || pv}`);
  } catch (e) {
    console.warn("[agent-central-mention] handleGroupSummaryRequest falhou:", e?.message);
  }
}
async function handlePrivateSummaryRequest(parsed) {
  if (parsed.isGroup) return;
  if (!looksLikeSummaryRequest(parsed.text)) return;
  await handleGroupSummaryRequest(parsed);
}
async function resolveOsForKmFinal(parsed, quotedText) {
  const osNum = osNumberFromText(parsed.text) || osNumberFromText(quotedText);
  if (osNum) {
    const d = osDigits(osNum);
    if (d) {
      const { data: cands } = await supabaseAdmin.from("service_orders").select("id, os_number, scheduled_date").ilike("os_number", `%${d}%`).order("scheduled_date", { ascending: false }).limit(20);
      const match = (cands || []).find((o) => osDigits(o.os_number || "") === d);
      if (match) return { id: match.id, os_number: match.os_number };
    }
  }
  try {
    const { data: cli } = await supabaseAdmin.from("clients").select("id").eq("whatsapp_group_id", parsed.chatId).maybeSingle();
    if (cli?.id) {
      const active = await loadActiveOs();
      if (active.length > 0) {
        const { data: withClient } = await supabaseAdmin.from("service_orders").select("id, client_id").in("id", active.map((o) => o.id));
        const clientByOs = /* @__PURE__ */ new Map();
        for (const r of withClient || []) clientByOs.set(r.id, r.client_id);
        const matches = active.filter((o) => clientByOs.get(o.id) === cli.id);
        if (matches.length === 1) return { id: matches[0].id, os_number: matches[0].os_number };
      }
    }
  } catch {
  }
  return null;
}
async function handleFinalKmRequest(parsed, quotedText) {
  try {
    const os = await resolveOsForKmFinal(parsed, quotedText);
    if (!os) {
      console.log(`[agent-central-mention] "km final" no grupo ${parsed.chatId} mas OS n\xE3o identificada \u2014 ignorando`);
      return;
    }
    const key = `${parsed.chatId}:${os.id}`;
    const last = kmFinalThrottle.get(key) || 0;
    if (Date.now() - last < KM_FINAL_THROTTLE_MS) {
      console.log(`[agent-central-mention] km-resumo OS ${os.os_number || os.id} ignorado (throttle ${KM_FINAL_THROTTLE_MS / 1e3}s)`);
      return;
    }
    const msg = await buildKmResumoByOsId(os.id);
    if (!msg) {
      console.log(`[agent-central-mention] km-resumo OS ${os.os_number || os.id} sem dados \u2014 ignorando`);
      return;
    }
    kmFinalThrottle.set(key, Date.now());
    let sentWithPhoto = false;
    try {
      const foto = await getKmFinalPhotoByOsId(os.id);
      if (foto?.photoData) {
        let imageToSend = foto.photoData;
        try {
          const srcBuf = decodeBase64Image(foto.photoData);
          if (srcBuf && srcBuf.length > 0) {
            const wm = await watermarkToDataUrl(srcBuf);
            if (wm) imageToSend = wm;
          }
        } catch (wmErr) {
          console.warn(`[agent-central-mention] marca d'\xE1gua km-foto OS ${os.os_number || os.id} falhou, foto original:`, wmErr?.message);
        }
        const r = await sendImageWithCaption({
          groupOrPhone: parsed.chatId,
          imageBase64OrUrl: imageToSend,
          caption: msg,
          delayMessageSeconds: randomTypingSeconds()
        });
        sentWithPhoto = r.ok;
        if (!r.ok) {
          console.warn(`[agent-central-mention] km-foto OS ${os.os_number || os.id} falhou: ${r.error} \u2014 fallback texto`);
        }
      } else {
        console.log(`[agent-central-mention] OS ${os.os_number || os.id} sem foto de km_final \u2014 enviando s\xF3 texto`);
      }
    } catch (e) {
      console.warn(`[agent-central-mention] km-foto OS ${os.os_number || os.id} erro: ${e?.message} \u2014 fallback texto`);
    }
    if (!sentWithPhoto) {
      await sendText({ groupOrPhone: parsed.chatId, message: msg, delayTypingSeconds: randomTypingSeconds() });
    }
    console.log(`[agent-central-mention] km-resumo da OS ${os.os_number || os.id} enviado ao grupo ${parsed.chatId}${sentWithPhoto ? " (com foto)" : " (s\xF3 texto)"}`);
  } catch (e) {
    console.warn("[agent-central-mention] handleFinalKmRequest falhou:", e?.message);
  }
}
function phoneSuffix8(phone) {
  const d = normalizePhone(phone);
  return d && d.length >= 8 ? d.slice(-8) : "";
}
function isTeamSuffixMatch(suffixes, phone) {
  const s = phoneSuffix8(phone);
  return s.length === 8 && suffixes.has(s);
}
function planEscalations(rows) {
  const toEscalate = [];
  const toSuppressFulfilled = [];
  for (const r of rows) {
    if (r.fulfilled_at) {
      toSuppressFulfilled.push(r);
      continue;
    }
    toEscalate.push(r);
  }
  return { toEscalate, toSuppressFulfilled };
}
async function loadTeamPhoneSuffixes() {
  const now = Date.now();
  if (teamPhoneCache && now - teamPhoneCache.at < TEAM_PHONE_TTL_MS) {
    return teamPhoneCache.suffixes;
  }
  const suffixes = /* @__PURE__ */ new Set();
  try {
    const { data } = await supabaseAdmin.from("employees").select("phone").not("phone", "is", null);
    for (const e of data || []) {
      const s = phoneSuffix8(e.phone);
      if (s) suffixes.add(s);
    }
  } catch (e) {
    console.warn("[agent-central-mention] loadTeamPhoneSuffixes falhou:", e?.message);
    if (teamPhoneCache) return teamPhoneCache.suffixes;
  }
  teamPhoneCache = { suffixes, at: now };
  return suffixes;
}
async function isTeamMemberPhone(phone) {
  if (!phone) return false;
  const suffixes = await loadTeamPhoneSuffixes();
  return isTeamSuffixMatch(suffixes, phone);
}
async function suppressPendingAcksForGroup(groupId, resolution) {
  try {
    const { data } = await supabaseAdmin.from("agent_central_group_requests").update({ ack_resolved_at: (/* @__PURE__ */ new Date()).toISOString(), ack_resolution: resolution }).eq("group_id", groupId).not("ack_decide_at", "is", null).is("ack_resolved_at", null).select("id");
    return (data || []).length;
  } catch (e) {
    console.warn("[agent-central-mention] suppressPendingAcksForGroup falhou:", e?.message);
    return 0;
  }
}
async function resolveAck(id, resolution) {
  await supabaseAdmin.from("agent_central_group_requests").update({ ack_resolved_at: (/* @__PURE__ */ new Date()).toISOString(), ack_resolution: resolution }).eq("id", id).then(() => {
  }, (e) => console.warn("[agent-central-mention] resolveAck falhou:", e?.message));
}
async function flushAgentEscalations() {
  const res = { escalated: 0, fulfilled: 0, no_second: 0 };
  try {
    if (!isZapiConfigured()) return res;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const { data: due, error } = await supabaseAdmin.from("agent_central_group_requests").select("id, service_order_id, fulfilled_at").not("ack_decide_at", "is", null).is("ack_resolved_at", null).lte("ack_decide_at", nowIso).order("ack_decide_at", { ascending: true });
    if (error) {
      console.warn("[agent-central-mention] flushAgentEscalations query falhou:", error.message);
      return res;
    }
    const rows = due || [];
    if (rows.length === 0) return res;
    let firstSend = true;
    for (const r of rows) {
      if (r.fulfilled_at) {
        await resolveAck(r.id, "fulfilled");
        res.fulfilled++;
        continue;
      }
      let claimedOk = false;
      try {
        const { data: claimed } = await supabaseAdmin.from("agent_central_group_requests").update({ ack_resolved_at: (/* @__PURE__ */ new Date()).toISOString(), ack_resolution: "escalated" }).eq("id", r.id).is("ack_resolved_at", null).is("fulfilled_at", null).select("id");
        claimedOk = !!claimed && claimed.length > 0;
      } catch (e) {
        console.warn("[agent-central-mention] flush claim falhou:", e?.message);
      }
      if (!claimedOk) continue;
      if (!firstSend) await sleep2(humanDelayMs());
      firstSend = false;
      const ok = await escalateToSecondAgent(r.service_order_id);
      if (ok) {
        res.escalated++;
      } else {
        res.no_second++;
        await supabaseAdmin.from("agent_central_group_requests").update({ ack_resolution: "no_second" }).eq("id", r.id).then(() => {
        }, () => {
        });
      }
    }
  } catch (e) {
    console.warn("[agent-central-mention] flushAgentEscalations falhou:", e?.message);
  }
  return res;
}
function sanitizeFinanceiro(msg) {
  if (FINANCEIRO_LEAK.test(msg)) {
    return FINANCEIRO_DEFLEXOES[randInt(0, FINANCEIRO_DEFLEXOES.length - 1)];
  }
  return msg;
}
async function buildNaturalReply(text, senderName) {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) return null;
  const nome = firstName2(senderName);
  try {
    const openai = new OpenAI2({ apiKey, baseURL, timeout: 6e3, maxRetries: 0 });
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      max_completion_tokens: 160,
      messages: [
        {
          role: "system",
          content: `Voc\xEA \xE9 a "Central Torres", atendente HUMANA de uma empresa de escolta/seguran\xE7a patrimonial, conversando num grupo de WhatsApp de um CLIENTE. Responda de forma natural, cordial e BREVE (1 a 2 frases), como uma pessoa de verdade. VARIE SEMPRE as palavras, a sauda\xE7\xE3o e a estrutura \u2014 nunca soe como um rob\xF4 repetindo um template (isso causa bloqueio do WhatsApp). Portugu\xEAs brasileiro, no m\xE1ximo 1 emoji (pode n\xE3o usar nenhum).
REGRAS INVIOL\xC1VEIS:
1) NUNCA invente dados operacionais (hor\xE1rios, locais, KMs, placas, status/posi\xE7\xE3o de miss\xE3o, prazos, previs\xF5es). Se a pessoa perguntar algo assim e voc\xEA n\xE3o tem o dado, diga com naturalidade que vai verificar e j\xE1 retorna \u2014 sem chutar.
2) NUNCA fale sobre valores, pre\xE7os, cobran\xE7as, faturamento, boletos ou qualquer assunto financeiro. Se perguntarem, diga educadamente que o setor financeiro retorna por outro canal.
3) N\xE3o prometa nada espec\xEDfico que dependa de um dado que voc\xEA n\xE3o tem.
Se a pessoa s\xF3 cumprimentou, agradeceu ou fez conversa social, responda no mesmo tom, simp\xE1tico e curto. Responda S\xD3 com a mensagem, sem aspas.`
        },
        {
          role: "user",
          content: `${nome ? `Pessoa que escreveu: ${nome}. ` : ""}Mensagem recebida no grupo: "${text}"`
        }
      ]
    });
    const out = response.choices?.[0]?.message?.content?.trim();
    return out && out.length > 0 ? out : null;
  } catch (e) {
    console.warn("[agent-central-mention] buildNaturalReply falhou:", e?.message);
    return null;
  }
}
async function handleNaturalConversation(parsed) {
  try {
    if (parsed.isGroup || parsed.fromMe) return;
    const text = (parsed.text || "").trim();
    if (text.length < 2) return;
    if (looksLikeSummaryRequest(text)) return;
    const last = naturalReplyThrottle.get(parsed.chatId) || 0;
    if (Date.now() - last < NATURAL_REPLY_THROTTLE_MS) {
      console.log(`[agent-central-mention] conversa natural no grupo ${parsed.chatId} ignorada (throttle ${NATURAL_REPLY_THROTTLE_MS / 1e3}s)`);
      return;
    }
    naturalReplyThrottle.set(parsed.chatId, Date.now());
    const { data: cli } = await supabaseAdmin.from("clients").select("id").eq("whatsapp_group_id", parsed.chatId).maybeSingle();
    if (!cli?.id) {
      console.log(`[agent-central-mention] conversa natural no grupo ${parsed.chatId} ignorada (grupo sem cliente vinculado)`);
      return;
    }
    const raw = await buildNaturalReply(text, parsed.senderName);
    if (!raw) return;
    const reply = sanitizeFinanceiro(raw);
    await sendText({ groupOrPhone: parsed.chatId, message: reply, delayTypingSeconds: randomTypingSeconds() });
    console.log(`[agent-central-mention] resposta natural enviada ao grupo ${parsed.chatId}`);
  } catch (e) {
    console.warn("[agent-central-mention] handleNaturalConversation falhou:", e?.message);
  }
}
async function reactOkOnUpdateRequest(parsed) {
  try {
    if (!parsed.isGroup || parsed.fromMe) return;
    if (!parsed.zapiMessageId) return;
    const last = taggedAckThrottle.get(parsed.chatId) || 0;
    if (Date.now() - last < TAGGED_ACK_THROTTLE_MS) {
      console.log(`[agent-central-mention] rea\xE7\xE3o OK no grupo ${parsed.chatId} ignorada (throttle ${TAGGED_ACK_THROTTLE_MS / 1e3}s)`);
      return;
    }
    taggedAckThrottle.set(parsed.chatId, Date.now());
    const r = await sendReaction({
      groupOrPhone: parsed.chatId,
      messageId: parsed.zapiMessageId,
      reaction: "\u2705"
    });
    if (r.ok) {
      console.log(`[agent-central-mention] rea\xE7\xE3o \u2705 no pedido de atualiza\xE7\xE3o (grupo ${parsed.chatId})`);
    } else {
      console.warn(`[agent-central-mention] rea\xE7\xE3o \u2705 falhou no grupo ${parsed.chatId}: ${r.error}`);
    }
  } catch (e) {
    console.warn("[agent-central-mention] reactOkOnUpdateRequest falhou:", e?.message);
  }
}
async function handleTaggedUpdateAck(parsed) {
  await reactOkOnUpdateRequest(parsed);
}
async function handleGroupUpdateRequest(parsed, rawBody) {
  try {
    if (!parsed.isGroup || parsed.fromMe) return;
    if (!isZapiConfigured()) return;
    await ensureBotLid();
    if (parsed.senderPhone && await isTeamMemberPhone(parsed.senderPhone)) {
      const n = await suppressPendingAcksForGroup(parsed.chatId, "team_handled");
      if (n > 0) {
        console.log(`[agent-central-mention] equipe (${parsed.senderName || parsed.senderPhone}) falou no grupo ${parsed.chatId} \u2014 ${n} ack(s) deferido(s) suprimido(s) (equipe atendendo)`);
      }
    }
    const mentioned = isBotMentioned(rawBody);
    const replyNaturalIfMentioned = async () => {
      if (mentioned) {
        await handleNaturalConversation(parsed);
      } else {
        console.log(`[agent-central-mention] grupo ${parsed.chatId}: mensagem sem men\xE7\xE3o e fora de assunto de OS \u2014 ignorando (n\xE3o responde)`);
      }
    };
    if (looksLikeSummaryRequest(parsed.text) && !RE_OS.test(parsed.text || "")) {
      await handleGroupSummaryRequest(parsed);
      return;
    }
    const quotedId = extractQuotedId(rawBody);
    let quotedText = extractQuotedText(rawBody);
    if (!quotedText && quotedId) quotedText = await lookupQuotedBody(quotedId);
    const hasQuoted = !!quotedText || !!quotedId;
    if (looksLikeFinalKm(parsed.text)) {
      await handleFinalKmRequest(parsed, quotedText);
      return;
    }
    if (!looksLikeUpdateRequest(parsed.text, hasQuoted)) {
      await replyNaturalIfMentioned();
      return;
    }
    const text = (parsed.text || "").trim();
    const extract = await extractIntent(text || quotedText || "");
    if (!extract.isUpdateRequest) {
      await replyNaturalIfMentioned();
      return;
    }
    const { os, via } = await resolveOs({ extract, quotedText, groupId: parsed.chatId });
    if (!os) {
      console.log(`[agent-central-mention] pedido sobre OS no grupo ${parsed.chatId} mas OS n\xE3o resolvida (via=${via}) \u2014 ${isBotMentioned(rawBody) ? "respondendo (marcaram a Central)" : "sil\xEAncio (sem men\xE7\xE3o)"}`);
      await replyNaturalIfMentioned();
      return;
    }
    console.log(`[agent-central-mention] grupo ${parsed.chatId}: pedido de "${parsed.senderName || "?"}" \u2192 OS ${os.os_number || os.id} (via ${via})`);
    const DEDUPE_MIN = 10;
    const sinceIso = new Date(Date.now() - DEDUPE_MIN * 60 * 1e3).toISOString();
    const { data: recent } = await supabaseAdmin.from("agent_central_group_requests").select("id").eq("group_id", parsed.chatId).eq("service_order_id", os.id).is("fulfilled_at", null).gte("requested_at", sinceIso).limit(1);
    const hasRecentOpen = !!(recent && recent.length > 0);
    if (mentioned) {
      const lastCob = mentionCobrancaCooldown.get(os.id) || 0;
      if (Date.now() - lastCob >= MENTION_COBRANCA_COOLDOWN_MS) {
        mentionCobrancaCooldown.set(os.id, Date.now());
        await cobrarAgentes(os);
      } else {
        console.log(`[agent-central-mention] OS ${os.os_number || os.id}: cobran\xE7a por men\xE7\xE3o pulada (cooldown ${MENTION_COBRANCA_COOLDOWN_MS / 1e3}s \u2014 anti-duplicata)`);
      }
      if (!hasRecentOpen) {
        const escalateAt = new Date(Date.now() + ESCALATE_AFTER_MIN * 60 * 1e3).toISOString();
        await supabaseAdmin.from("agent_central_group_requests").insert({
          group_id: parsed.chatId,
          service_order_id: os.id,
          requester_name: parsed.senderName || null,
          requester_phone: parsed.senderPhone || null,
          source_message_id: parsed.zapiMessageId || null,
          ack_decide_at: escalateAt
        }).then(() => {
        }, (e) => console.warn("[agent-central-mention] insert request (men\xE7\xE3o) falhou:", e?.message));
      }
      await reactOkOnUpdateRequest(parsed);
      console.log(`[agent-central-mention] grupo ${parsed.chatId}: Central marcada \u2192 cobrou a equipe + rea\xE7\xE3o \u2705 (OS ${os.os_number || os.id})`);
      return;
    }
    if (hasRecentOpen) {
      console.log(`[agent-central-mention] OS ${os.os_number || os.id} j\xE1 tem pedido aberto recente no grupo \u2014 pulando (anti-spam)`);
      return;
    }
    await reactOkOnUpdateRequest(parsed);
    await cobrarAgentes(os);
    const ackDecideAt = new Date(Date.now() + ESCALATE_AFTER_MIN * 60 * 1e3).toISOString();
    await supabaseAdmin.from("agent_central_group_requests").insert({
      group_id: parsed.chatId,
      service_order_id: os.id,
      requester_name: parsed.senderName || null,
      requester_phone: parsed.senderPhone || null,
      source_message_id: parsed.zapiMessageId || null,
      ack_decide_at: ackDecideAt
    }).then(() => {
    }, (e) => console.warn("[agent-central-mention] insert request falhou:", e?.message));
    console.log(`[agent-central-mention] OS ${os.os_number || os.id} no grupo ${parsed.chatId}: rea\xE7\xE3o \u2705 + 1\xBA agente cobrado por DM; escalonamento p/ 2\xBA armado em ${ESCALATE_AFTER_MIN}min se n\xE3o houver resposta`);
  } catch (e) {
    console.warn("[agent-central-mention] handler falhou:", e?.message);
  }
}
async function fulfillGroupRequests(params) {
  try {
    if (!isZapiConfigured()) return;
    const claimedAt = (/* @__PURE__ */ new Date()).toISOString();
    const { data: open, error: claimErr } = await supabaseAdmin.from("agent_central_group_requests").update({ fulfilled_at: claimedAt }).eq("service_order_id", params.serviceOrderId).is("fulfilled_at", null).select("id, group_id, requester_name, requester_phone");
    if (claimErr) {
      console.warn("[agent-central-mention] claim fulfill falhou:", claimErr.message);
      return;
    }
    if (!open || open.length === 0) return;
    const byRequester = /* @__PURE__ */ new Map();
    for (const r of open) {
      const pv = toIntlPhone2(r.requester_phone);
      if (!pv) continue;
      if (!byRequester.has(pv)) byRequester.set(pv, { ids: [], name: r.requester_name || null });
      const e = byRequester.get(pv);
      e.ids.push(r.id);
    }
    if (byRequester.size === 0) {
      console.warn(`[agent-central-mention] OS ${params.osNumber || params.serviceOrderId}: pedido(s) sem telefone do solicitante \u2014 nada enviado ao PV`);
      return;
    }
    const { data: so } = await supabaseAdmin.from("service_orders").select("id, client_id, mission_status, origin, destination, origin_lat, origin_lng, destination_lat, destination_lng, vehicle_id, assigned_employee_id, assigned_employee_2_id, escorted_driver_name, escorted_driver_phone, escorted_vehicle_plate").eq("id", params.serviceOrderId).maybeSingle();
    let client = null;
    if (so?.client_id) {
      const { data: cl } = await supabaseAdmin.from("clients").select("name").eq("id", so.client_id).maybeSingle();
      client = cl || null;
    }
    const msgBody = (params.message || "").trim();
    const synthUpdate = {
      os_number: params.osNumber || null,
      service_order_id: params.serviceOrderId,
      message: msgBody,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      latitude: null,
      longitude: null
    };
    let firstPvSend = true;
    for (const [pvPhone, info] of Array.from(byRequester.entries())) {
      if (!firstPvSend) await sleep2(humanDelayMs(6e3, 26e3));
      firstPvSend = false;
      const nome = firstName2(info.name);
      const saud = nome ? `${nome}, ` : "";
      let card;
      try {
        const rich = so ? await buildRichCaption(synthUpdate, so, client) : "";
        const header = `${saud}segue a atualiza\xE7\xE3o da OS ${params.osNumber || `#${params.serviceOrderId}`}: \u{1F447}`;
        card = [
          header,
          "",
          rich || `\u{1F4DD} *ATUALIZA\xC7\xC3O:* ${(msgBody || "(sem texto)").toUpperCase()}`,
          "",
          TORRES_CONTACT_FOOTER
        ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
      } catch (capErr) {
        console.warn(`[agent-central-mention] card rico falhou OS ${params.osNumber || params.serviceOrderId}, usando texto simples:`, capErr?.message);
        card = [
          `*${varyForwardHeader()}*`,
          ``,
          `${saud}segue a atualiza\xE7\xE3o da OS ${params.osNumber || `#${params.serviceOrderId}`}:`,
          ``,
          msgBody || "(sem texto)",
          params.employeeName ? `
_Agente: ${firstName2(params.employeeName)}_` : "",
          ``,
          TORRES_CONTACT_FOOTER
        ].filter((l) => l !== "").join("\n");
      }
      const r = await sendText({ groupOrPhone: pvPhone, message: card, delayTypingSeconds: randomTypingSeconds() });
      if (r.ok) {
        console.log(`[agent-central-mention] update da OS ${params.osNumber || params.serviceOrderId} enviada no PV de ${nome || pvPhone}`);
      } else if (r.blocked) {
        console.warn(`[agent-central-mention] envio PV ${pvPhone} bloqueado pela trava do bot \u2014 pedido descartado`);
      } else {
        const { error: unErr } = await supabaseAdmin.from("agent_central_group_requests").update({ fulfilled_at: null }).in("id", info.ids);
        console.warn(`[agent-central-mention] envio PV ${pvPhone} falhou (${r.error}); pedido des-reivindicado${unErr ? ` (erro unclaim: ${unErr.message})` : ""}`);
      }
    }
  } catch (e) {
    console.warn("[agent-central-mention] fulfillGroupRequests falhou:", e?.message);
  }
}
var FINISHED_MISSION_STATUS3, RE_OS, RE_KEYWORDS, RE_RESUMO, RE_KM_FINAL, RE_KM_FINAL_NEG, MISSION_STATUS_LABEL_PT, MISSION_STATUS_EMOJI, cachedBotLidDigits, summaryThrottle, SUMMARY_THROTTLE_MS, kmFinalThrottle, KM_FINAL_THROTTLE_MS, naturalReplyThrottle, NATURAL_REPLY_THROTTLE_MS, taggedAckThrottle, TAGGED_ACK_THROTTLE_MS, mentionCobrancaCooldown, MENTION_COBRANCA_COOLDOWN_MS, ESCALATE_AFTER_MIN, teamPhoneCache, TEAM_PHONE_TTL_MS, FINANCEIRO_LEAK, FINANCEIRO_DEFLEXOES;
var init_agent_central_mention = __esm({
  "server/lib/agent-central-mention.ts"() {
    "use strict";
    init_supabase();
    init_zapi();
    init_agent_central_fleet_resumo();
    init_photo_watermark();
    init_whatsapp_humanize();
    init_normalize_contact();
    init_cron_whatsapp_forward();
    FINISHED_MISSION_STATUS3 = /* @__PURE__ */ new Set([
      "encerrada",
      "retorno_base",
      "chegada_base",
      "finalizada",
      "cancelada",
      "recusada"
    ]);
    RE_OS = /\b(?:tor[-\s]?)?\d{3,5}\b/i;
    RE_KEYWORDS = /(atualiza|atualizar|atualização|posi[cç][aã]o|situa[cç][aã]o|status|nov[ai]dade|retorno|cad[eê]|onde\s+est|qap|previs[aã]o|chegou|chegando|j[aá]\s+chegou|alguma\s+not[ií]cia|alguma\s+previs)/i;
    RE_RESUMO = /\b(resumo|resum[aã]o|panorama|relat[oó]rio\s+do\s+dia|como\s+est[aã]o\s+as\s+viagens|status\s+geral)\b/i;
    RE_KM_FINAL = /\bkm\s*final\b/i;
    RE_KM_FINAL_NEG = /\b(sem|ainda|n[aã]o)\b/i;
    MISSION_STATUS_LABEL_PT = {
      aguardando: "Aguardando",
      agendada: "Agendada",
      aceita: "Aceita",
      deslocamento_inicio: "Deslocamento ao In\xEDcio",
      no_local_origem: "No Local de Origem",
      em_transito: "Em Tr\xE2nsito",
      em_transito_destino: "Em Tr\xE2nsito ao Destino",
      no_local_destino: "No Local de Destino",
      em_apoio: "Em Apoio",
      pernoite: "Pernoite",
      encerrada: "Encerrada",
      finalizada: "Finalizada",
      cancelada: "Cancelada",
      recusada: "Recusada"
    };
    MISSION_STATUS_EMOJI = {
      aguardando: "\u23F3",
      agendada: "\u{1F4C5}",
      aceita: "\u{1F91D}",
      deslocamento_inicio: "\u{1F697}",
      no_local_origem: "\u{1F4CD}",
      em_transito: "\u{1F6E3}\uFE0F",
      em_transito_destino: "\u{1F6E3}\uFE0F",
      no_local_destino: "\u{1F4E6}",
      em_apoio: "\u{1F6E1}\uFE0F",
      pernoite: "\u{1F319}",
      encerrada: "\u{1F3C1}",
      finalizada: "\u{1F3C1}"
    };
    cachedBotLidDigits = null;
    summaryThrottle = /* @__PURE__ */ new Map();
    SUMMARY_THROTTLE_MS = 6e4;
    kmFinalThrottle = /* @__PURE__ */ new Map();
    KM_FINAL_THROTTLE_MS = 6e4;
    naturalReplyThrottle = /* @__PURE__ */ new Map();
    NATURAL_REPLY_THROTTLE_MS = 15e3;
    taggedAckThrottle = /* @__PURE__ */ new Map();
    TAGGED_ACK_THROTTLE_MS = 8e3;
    mentionCobrancaCooldown = /* @__PURE__ */ new Map();
    MENTION_COBRANCA_COOLDOWN_MS = 6e4;
    ESCALATE_AFTER_MIN = 8;
    teamPhoneCache = null;
    TEAM_PHONE_TTL_MS = 5 * 60 * 1e3;
    FINANCEIRO_LEAK = /(r\$\s*\d|\d+\s*(?:reais|mil\s*reais|contos?)|\bpix\b|\bboletos?\b|\bor[çc]ament\w*|\bfatur\w*|\bcobran\w*|\bpre[çc]o\w*)/i;
    FINANCEIRO_DEFLEXOES = [
      "Sobre valores, pe\xE7o que aguarde um pouquinho \u2014 nosso setor financeiro retorna pra voc\xEA por outro canal. \u{1F64F}",
      "Essa parte de valores quem cuida \xE9 o nosso financeiro; eles entram em contato com voc\xEA por outro canal, t\xE1?",
      "Para quest\xF5es de valores, o setor financeiro fala diretamente com voc\xEA por outro canal. Qualquer coisa operacional, estou \xE0 disposi\xE7\xE3o!"
    ];
  }
});

// server/cron-jobs.ts
async function withCronLock(name, fn) {
  if (locks.has(name)) return;
  locks.add(name);
  try {
    await fn();
  } finally {
    locks.delete(name);
  }
}
async function runInterReconcile(diasJanela, contexto) {
  const { isInterConfigured: isInterConfigured2 } = await Promise.resolve().then(() => (init_client(), client_exports));
  if (!isInterConfigured2()) return;
  const { consultarExtrato: consultarExtrato2 } = await Promise.resolve().then(() => (init_banking(), banking_exports));
  const hoje = /* @__PURE__ */ new Date();
  const inicio = new Date(hoje.getTime() - diasJanela * 24 * 60 * 60 * 1e3);
  const dataInicio = ymdBRT(inicio);
  const dataFim = ymdBRT(hoje);
  const extrato = await consultarExtrato2(dataInicio, dataFim);
  const transacoes = extrato.transacoes || [];
  let novosLancamentos = 0;
  let conciliados = 0;
  for (const tx of transacoes) {
    if (tx.tipoOperacao !== "C") continue;
    const { data: existing } = await supabaseAdmin.from("inter_extrato_lancamentos").select("id").eq("data_entrada", tx.dataEntrada).eq("valor", Number(tx.valor || 0).toFixed(2)).eq("tipo_operacao", "C").eq("titulo", tx.titulo || "").maybeSingle();
    if (existing) continue;
    const { data: candidateInvoices } = await supabaseAdmin.from("invoices").select("id, status, due_date, client_name").eq("value", Number(tx.valor || 0).toFixed(2)).in("status", ["PENDING", "OVERDUE"]).order("due_date", { ascending: true });
    const invoice = candidateInvoices && candidateInvoices.length === 1 ? candidateInvoices[0] : null;
    let ambiguousCount = 0;
    if (candidateInvoices && candidateInvoices.length > 1) {
      ambiguousCount = candidateInvoices.length;
      log(
        `CRON Inter-Reconcile[${contexto}]: AMBIGUO \u2014 ${candidateInvoices.length} invoices com valor R$ ${tx.valor} em ${tx.dataEntrada}. Concilia\xE7\xE3o manual necess\xE1ria.`,
        "cron"
      );
    }
    await supabaseAdmin.from("inter_extrato_lancamentos").insert({
      data_entrada: tx.dataEntrada,
      tipo_transacao: tx.tipoTransacao,
      tipo_operacao: tx.tipoOperacao,
      valor: Number(tx.valor || 0).toFixed(2),
      titulo: tx.titulo || null,
      descricao: ambiguousCount > 0 ? `${tx.descricao || ""} [AMBIGUO: ${ambiguousCount} faturas mesmo valor \u2014 conciliar manualmente]` : tx.descricao || null,
      detalhes: tx,
      invoice_id: invoice?.id || null,
      reconciled_at: invoice ? (/* @__PURE__ */ new Date()).toISOString() : null
    });
    novosLancamentos++;
    if (invoice) {
      await supabaseAdmin.from("invoices").update({ status: "RECEIVED", payment_date: tx.dataEntrada }).eq("id", invoice.id);
      conciliados++;
    }
  }
  if (novosLancamentos > 0) {
    log(
      `CRON Inter-Reconcile[${contexto}]: ${novosLancamentos} lan\xE7amento(s), ${conciliados} invoice(s) conciliada(s)`,
      "cron"
    );
  }
}
async function runNfReconcileCron() {
  log("CRON NF-Reconcile: Iniciando reconcilia\xE7\xE3o de NFs com Asaas", "cron");
  try {
    const { reconcileAllInvoicesAsaas: reconcileAllInvoicesAsaas2 } = await Promise.resolve().then(() => (init_asaas(), asaas_exports));
    const result = await reconcileAllInvoicesAsaas2({ limit: 80 });
    log(
      `CRON NF-Reconcile: ${result.processed} processada(s), ${result.updated} atualizada(s), ${result.errors} erro(s)`,
      "cron"
    );
  } catch (e) {
    log(`CRON NF-Reconcile: Erro: ${e.message}`, "cron");
  }
}
async function runControlIdCron() {
  await withCronLock("control-id", async () => {
    if (!isSupabaseHealthy()) return;
    try {
      const { syncAllDevices: syncAllDevices2 } = await Promise.resolve().then(() => (init_control_id(), control_id_exports));
      const r = await syncAllDevices2();
      if (r.devices > 0 && r.totalSaved > 0) {
        log(`CRON ControlID: ${r.devices} aparelho(s), ${r.totalSaved} batida(s) nova(s)`, "cron");
      }
    } catch (e) {
      log(`CRON ControlID: Erro: ${e.message}`, "cron");
    }
  });
}
async function runRhidQueueCron() {
  await withCronLock("rhid-queue", async () => {
    if (!isSupabaseHealthy()) return;
    try {
      const r = await processRhidSyncQueue(50);
      if (r.processed > 0) {
        log(`CRON RHID-Queue: ${r.done} OK, ${r.failed} falhou (de ${r.processed})`, "cron");
      }
    } catch (e) {
      log(`CRON RHID-Queue ERRO: ${e?.message}`, "cron");
    }
  });
}
async function runRhidReconCron() {
  await withCronLock("rhid-recon", async () => {
    if (!isSupabaseHealthy()) return;
    try {
      const r = await runDailyReconciliation({ triggeredBy: "cron" });
      log(
        `CRON RHID-Recon: validado=${r.recon.totals.validado} faltamRhid=${r.recon.totals.faltandoNoRhid} faltamLocal=${r.recon.totals.faltandoNoLocal} dup=${r.recon.totals.duplicadas} | imp=${r.actions.imported} exp=${r.actions.exported} | ${r.email.message}`,
        "cron"
      );
    } catch (e) {
      log(`CRON RHID-Recon ERRO: ${e?.message}`, "cron");
    }
  });
}
async function runFolhaSnapshotCron() {
  await withCronLock("folha-snapshot", async () => {
    if (!isSupabaseHealthy()) return;
    try {
      const mes = prevMonthRef();
      const r = await snapshotFolhaMes(mes, { source: "auto" });
      log(`CRON Folha-Snapshot: m\xEAs=${r.mes} ativos=${r.ativos} salvos=${r.saved} pulados=${r.skipped}`, "cron");
    } catch (e) {
      log(`CRON Folha-Snapshot ERRO: ${e?.message}`, "cron");
    }
  });
}
async function runFolhaCatchupCron() {
  await withCronLock("folha-catchup", async () => {
    if (!isSupabaseHealthy()) return;
    try {
      const mes = prevMonthRef();
      const r = await snapshotFolhaMesIfMissing(mes, { source: "auto-catchup" });
      if (r) {
        log(
          `CRON Folha-Snapshot[catch-up]: m\xEAs=${r.mes} ativos=${r.ativos} salvos=${r.saved} pulados=${r.skipped}`,
          "cron"
        );
      }
    } catch (e) {
      log(`CRON Folha-Snapshot[catch-up] ERRO: ${e?.message}`, "cron");
    }
  });
}
async function runInterReconcileFastCron() {
  await withCronLock("inter-reconcile", async () => {
    if (!isSupabaseHealthy()) return;
    try {
      await runInterReconcile(2, "5min/2d");
    } catch (e) {
      log(`CRON Inter-Reconcile[5min/2d]: Erro: ${e.message}`, "cron");
    }
  });
}
async function runInterReconcileBackfillCron() {
  await withCronLock("inter-reconcile", async () => {
    if (!isSupabaseHealthy()) return;
    try {
      log("CRON Inter-Reconcile[backfill/30d]: iniciando varredura ampla", "cron");
      await runInterReconcile(30, "backfill/30d");
    } catch (e) {
      log(`CRON Inter-Reconcile[backfill/30d]: Erro: ${e.message}`, "cron");
    }
  });
}
async function runDiariasJornadaCron() {
  try {
    const { processDiariasJornadaLonga: processDiariasJornadaLonga2 } = await Promise.resolve().then(() => (init_diarias_jornada_longa(), diarias_jornada_longa_exports));
    const ontemBrt = new Date(Date.now() - 24 * 3600 * 1e3);
    const ymd = new Date(ontemBrt.getTime() - 3 * 36e5).toISOString().slice(0, 10);
    const r = await processDiariasJornadaLonga2(ymd);
    if (r.paresLongosDetectados > 0 || r.linhasCriadas > 0) {
      log(
        `CRON Di\xE1rias>16h: ${r.quinzena} (${r.quinzenaInicio}\u2192${r.quinzenaFim}) pares=${r.paresLongosDetectados} agentes=${r.agentes.length} criadas=${r.linhasCriadas} removidas=${r.linhasRemovidas}`,
        "cron"
      );
    }
  } catch (e) {
    log(`CRON Di\xE1rias>16h: Erro: ${e.message}`, "cron");
  }
}
async function runContratoDefinitivoCron() {
  try {
    const { syncDuePermanentContracts: syncDuePermanentContracts2 } = await Promise.resolve().then(() => (init_permanent_contracts(), permanent_contracts_exports));
    const r = await syncDuePermanentContracts2();
    if (r.scanned > 0 || r.created > 0) {
      log(`CRON Contrato-Definitivo: scanned=${r.scanned} created=${r.created} errors=${r.errors}`, "cron");
    }
  } catch (e) {
    log(`CRON Contrato-Definitivo: Erro: ${e.message}`, "cron");
  }
}
async function runFleetMultasCron() {
  log("CRON: Iniciando monitoramento de frota (multas PRF)", "cron");
  try {
    const vehicles = await storage.getVehicles();
    for (const v of vehicles) {
      if (!v.plate) continue;
      try {
        const result = await consultaMultasPRF(v.plate, void 0, "cron_frota");
        if (result.success) {
          log(`CRON: Ve\xEDculo ${v.plate} - multas consultadas com sucesso`, "cron");
        } else {
          log(`CRON: Ve\xEDculo ${v.plate} - erro: ${result.data?.error || "desconhecido"}`, "cron");
        }
      } catch (err) {
        log(`CRON: Erro ao consultar multas para ${v.plate}: ${err.message}`, "cron");
      }
    }
    log(`CRON: Monitoramento de frota conclu\xEDdo (${vehicles.length} ve\xEDculos)`, "cron");
  } catch (err) {
    log(`CRON: Erro geral no monitoramento de frota: ${err.message}`, "cron");
  }
}
async function runRhComplianceCron() {
  log("CRON: Iniciando compliance de RH (a cada 90 dias)", "cron");
  try {
    const employees = await storage.getEmployees();
    const activeEmployees = employees.filter((e) => e.status === "ativo");
    for (const emp of activeEmployees) {
      if (!emp.cpf) continue;
      const cpf = emp.cpf.replace(/\D/g, "");
      try {
        await consultaCNH(cpf, void 0, "cron_rh");
        log(`CRON RH: CNH consultada para ${emp.name}`, "cron");
      } catch (err) {
        log(`CRON RH: Erro CNH para ${emp.name}: ${err.message}`, "cron");
      }
      try {
        await consultaProcessos(cpf, void 0, "cron_rh");
        log(`CRON RH: Processos consultados para ${emp.name}`, "cron");
      } catch (err) {
        log(`CRON RH: Erro Processos para ${emp.name}: ${err.message}`, "cron");
      }
      try {
        await consultaSituacaoEleitoral(cpf, void 0, "cron_rh");
        log(`CRON RH: Situa\xE7\xE3o eleitoral consultada para ${emp.name}`, "cron");
      } catch (err) {
        log(`CRON RH: Erro Sit. Eleitoral para ${emp.name}: ${err.message}`, "cron");
      }
    }
    log(`CRON: Compliance RH conclu\xEDdo (${activeEmployees.length} funcion\xE1rios)`, "cron");
  } catch (err) {
    log(`CRON: Erro geral compliance RH: ${err.message}`, "cron");
  }
}
async function runRodizioCron() {
  const { sendRodizioAlerts: sendRodizioAlerts2 } = await Promise.resolve().then(() => (init_cron(), cron_exports));
  log("CRON Rod\xEDzio: Disparando alerta BRT", "cron");
  await sendRodizioAlerts2();
}
async function runBillingAlertsCron() {
  if (!isSupabaseHealthy()) {
    log("CRON BillingAlerts: SKIP \u2014 Supabase offline (modo fallback)", "cron");
    return;
  }
  log("CRON BillingAlerts: Verificando linha do tempo de cobran\xE7a", "cron");
  try {
    const now = /* @__PURE__ */ new Date();
    const brDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
    const brDay = Number(brDate.split("-")[2]);
    const brMonth = Number(brDate.split("-")[1]);
    const brYear = Number(brDate.split("-")[0]);
    const { data: allClients } = await supabaseAdmin.from("clients").select("*");
    if (!allClients?.length) return;
    const clientsWithCycle = allClients.filter((c) => c.billing_cycle && c.billing_cycle !== "por_missao");
    let alertsCreated = 0;
    const insertAlert = async (clientId, clientName, alertType, message, osNumbers, billingIds, periodStart, periodEnd) => {
      const { data: existing } = await supabaseAdmin.from("billing_alerts").select("id").eq("client_id", clientId).eq("alert_type", alertType).eq("period_start", periodStart).eq("period_end", periodEnd).eq("resolved", false).limit(1);
      if (existing?.length) return false;
      await supabaseAdmin.from("billing_alerts").insert({
        client_id: clientId,
        client_name: clientName,
        alert_type: alertType,
        message,
        billing_ids: billingIds,
        os_numbers: osNumbers,
        period_start: periodStart,
        period_end: periodEnd
      });
      return true;
    };
    for (const client of clientsWithCycle) {
      const cycle = client.billing_cycle;
      const prazoAprovacao = client.prazo_aprovacao_dias || 10;
      const limiteEmissao = client.billing_cutoff_day || 25;
      let periods = [];
      if (cycle === "quinzenal") {
        periods = [
          { start: `${brYear}-${String(brMonth).padStart(2, "0")}-01`, end: `${brYear}-${String(brMonth).padStart(2, "0")}-15`, cutoff: 15 }
        ];
        const prevMonth = brMonth === 1 ? 12 : brMonth - 1;
        const prevYear = brMonth === 1 ? brYear - 1 : brYear;
        const lastDay = new Date(prevYear, prevMonth, 0).getDate();
        periods.push({
          start: `${prevYear}-${String(prevMonth).padStart(2, "0")}-16`,
          end: `${prevYear}-${String(prevMonth).padStart(2, "0")}-${lastDay}`,
          cutoff: lastDay
        });
      } else if (cycle === "mensal") {
        const prevMonth = brMonth === 1 ? 12 : brMonth - 1;
        const prevYear = brMonth === 1 ? brYear - 1 : brYear;
        const lastDay = new Date(prevYear, prevMonth, 0).getDate();
        periods = [
          {
            start: `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`,
            end: `${prevYear}-${String(prevMonth).padStart(2, "0")}-${lastDay}`,
            cutoff: lastDay
          }
        ];
      }
      for (const period of periods) {
        const periodCutoffDate = new Date(period.end);
        const daysSinceCutoff = Math.floor((now.getTime() - periodCutoffDate.getTime()) / (1e3 * 60 * 60 * 24));
        if (daysSinceCutoff < 1 || daysSinceCutoff > 60) continue;
        const { data: pendingBillings } = await supabaseAdmin.from("escort_billings").select("id, service_order_id, os_number, status, data_missao").eq("client_id", client.id).is("invoice_id", null);
        if (!pendingBillings?.length) continue;
        const missionsInPeriod = pendingBillings.filter((b) => {
          if (!b.data_missao) return false;
          const mDate = b.data_missao.split("T")[0];
          return mDate >= period.start && mDate <= period.end;
        });
        if (!missionsInPeriod.length) continue;
        const notApproved = missionsInPeriod.filter((b) => b.status === "A_VERIFICAR");
        const approvedNotInvoiced = missionsInPeriod.filter((b) => b.status === "APROVADA");
        const osNums = (arr) => arr.map((b) => b.os_number).filter(Boolean).join(", ");
        const bIds = (arr) => arr.map((b) => b.id).join(",");
        const approvalDeadline = prazoAprovacao;
        const anticipation = Math.max(0, approvalDeadline - 5);
        if (notApproved.length > 0 && daysSinceCutoff >= anticipation) {
          const isUrgent = daysSinceCutoff >= approvalDeadline;
          const alertType = isUrgent ? "ATRASO_APROVACAO" : "ANTECIPACAO_APROVACAO";
          const msg = isUrgent ? `\u26A0\uFE0F Pend\xEAncia de Faturamento: ${client.name} possui ${notApproved.length} miss\xE3o(\xF5es) ainda n\xE3o autorizadas pelo cliente. OS: ${osNums(notApproved)}. Per\xEDodo: ${period.start} a ${period.end}` : `Alerta de Antecipa\xE7\xE3o: ${client.name} \u2014 faltam ${approvalDeadline - daysSinceCutoff} dia(s) para o fim do prazo de aprova\xE7\xE3o. ${notApproved.length} OS pendente(s): ${osNums(notApproved)}`;
          if (await insertAlert(
            client.id,
            client.name,
            alertType,
            msg,
            osNums(notApproved),
            bIds(notApproved),
            period.start,
            period.end
          )) {
            alertsCreated++;
            log(`CRON BillingAlerts: ${alertType} \u2192 ${client.name}`, "cron");
          }
        }
        if (daysSinceCutoff >= limiteEmissao - period.cutoff || daysSinceCutoff >= 25) {
          const allUnfatured = missionsInPeriod.filter((b) => !["FATURADO", "PAGO"].includes(b.status));
          if (allUnfatured.length > 0) {
            const msg = `\u{1F534} URGENTE: ${client.name} \u2014 ${allUnfatured.length} OS do ciclo ${period.start} a ${period.end} ainda n\xE3o faturada(s)! O prazo de emiss\xE3o vence hoje. OS: ${osNums(allUnfatured)}`;
            if (await insertAlert(
              client.id,
              client.name,
              "VENCIMENTO_EMISSAO",
              msg,
              osNums(allUnfatured),
              bIds(allUnfatured),
              period.start,
              period.end
            )) {
              alertsCreated++;
              log(`CRON BillingAlerts: VENCIMENTO_EMISSAO \u2192 ${client.name}`, "cron");
            }
          }
        }
        if (approvedNotInvoiced.length > 0 && daysSinceCutoff >= 1) {
          const msg = `Faturamento Pendente: ${client.name} possui ${approvedNotInvoiced.length} miss\xE3o(\xF5es) aprovada(s) do ciclo ${period.start} a ${period.end} aguardando fatura. OS: ${osNums(approvedNotInvoiced)}`;
          if (await insertAlert(
            client.id,
            client.name,
            "PENDENTE_FATURAMENTO",
            msg,
            osNums(approvedNotInvoiced),
            bIds(approvedNotInvoiced),
            period.start,
            period.end
          )) {
            alertsCreated++;
          }
        }
      }
    }
    const { data: allBillings } = await supabaseAdmin.from("escort_billings").select("id, client_id, client_name, os_number, status, data_missao").in("status", ["A_VERIFICAR", "APROVADA"]).is("invoice_id", null);
    if (allBillings?.length) {
      for (const billing of allBillings) {
        if (!billing.data_missao || !billing.client_id) continue;
        if (!billing.os_number) continue;
        const mDate = new Date(billing.data_missao);
        const daysSince = Math.floor((now.getTime() - mDate.getTime()) / (1e3 * 60 * 60 * 24));
        if (daysSince <= 30) continue;
        const { data: existingAlert } = await supabaseAdmin.from("billing_alerts").select("id").eq("client_id", billing.client_id).eq("alert_type", "OS_ESQUECIDA").eq("resolved", false).ilike("os_numbers", `%${billing.os_number}%`).limit(1);
        if (existingAlert?.length) continue;
        const clientRow = allClients.find((c) => c.id === billing.client_id);
        await supabaseAdmin.from("billing_alerts").insert({
          client_id: billing.client_id,
          client_name: billing.client_name || clientRow?.name,
          alert_type: "OS_ESQUECIDA",
          message: `\u{1F534} OS ${billing.os_number} ficou fora do faturamento! Miss\xE3o de ${billing.data_missao?.split("T")[0]} h\xE1 ${daysSince} dias sem faturar. Incluir agora?`,
          os_numbers: billing.os_number
        });
        alertsCreated++;
      }
    }
    log(`CRON BillingAlerts: ${alertsCreated} alerta(s) criado(s)`, "cron");
  } catch (err) {
    log(`CRON BillingAlerts: Erro: ${err.message}`, "cron");
  }
}
async function runProvisaoCron() {
  log("CRON Provis\xE3o: Iniciando provis\xE3o di\xE1ria de sal\xE1rios", "cron");
  try {
    const now = /* @__PURE__ */ new Date();
    const brDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
    const [yearStr, monthStr, dayStr] = brDate.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    const CCT = {
      salarioBase: 2432.5,
      periculosidadePct: 30,
      valeRefeicaoDia: 40,
      cestaBasica: 208.45,
      diasUteisMes: 22,
      horaExtraValor: 22.99
    };
    const periculosidade = CCT.salarioBase * (CCT.periculosidadePct / 100);
    const valeRefeicaoMes = CCT.valeRefeicaoDia * CCT.diasUteisMes;
    const totalBrutoMensal = CCT.salarioBase + periculosidade + valeRefeicaoMes + CCT.cestaBasica;
    const custoDiario = +(totalBrutoMensal / 30).toFixed(2);
    const allEmployees = await storage.getEmployees();
    const activeEmployees = allEmployees.filter(
      (e) => e.status === "ativo" && (e.role?.toLowerCase().includes("vigilante") || e.role?.toLowerCase().includes("escolta"))
    );
    let created = 0;
    let skipped = 0;
    for (const emp of activeEmployees) {
      const originId = `payroll-diario-${emp.id}-${brDate}`;
      const { data: existing } = await supabaseAdmin.from("financial_transactions").select("id").eq("origin_type", "payroll").eq("origin_id", originId).limit(1);
      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }
      if (emp.hireDate) {
        const hire = new Date(emp.hireDate);
        if (hire > now) {
          skipped++;
          continue;
        }
        if (hire.getFullYear() === year && hire.getMonth() + 1 === month && hire.getDate() > day) {
          skipped++;
          continue;
        }
      }
      const { error } = await supabaseAdmin.from("financial_transactions").insert({
        description: `PROVIS\xC3O DI\xC1RIA ${dayStr}/${monthStr} - ${emp.name?.toUpperCase()}`,
        amount: custoDiario,
        type: "EXPENSE",
        status: "PENDING",
        due_date: brDate,
        origin_type: "payroll",
        origin_id: originId,
        category_name: "Recursos Humanos",
        entity_name: emp.name || "",
        created_by: "CRON"
      }).select().single();
      if (error) {
        log(`CRON Provis\xE3o: Erro ao criar provis\xE3o para ${emp.name}: ${error.message}`, "cron");
      } else {
        created++;
      }
    }
    log(
      `CRON Provis\xE3o: ${brDate} \u2014 ${created} provis\xE3o(\xF5es) criada(s), ${skipped} ignorada(s) (${activeEmployees.length} agentes ativos)`,
      "cron"
    );
  } catch (err) {
    log(`CRON Provis\xE3o: Erro geral: ${err.message}`, "cron");
  }
}
async function runJornadaAlertaCron() {
  try {
    log("CRON JornadaAlerta: Verificando agentes com \u2265200h no m\xEAs atual", "cron");
    const now = /* @__PURE__ */ new Date();
    const mes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now).slice(0, 7);
    const [y, m] = mes.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const inicioMes = `${mes}-01T00:00:00-03:00`;
    const fimMes = `${mes}-${String(lastDay).padStart(2, "0")}T23:59:59-03:00`;
    const { data: pontos } = await supabaseAdmin.from("ponto_operacional").select("employee_id, employee_name, horas_decimal").gte("entrada", inicioMes).lte("entrada", fimMes);
    const byEmp = {};
    for (const p of pontos || []) {
      if (!byEmp[p.employee_id]) byEmp[p.employee_id] = { name: p.employee_name || `#${p.employee_id}`, total: 0 };
      byEmp[p.employee_id].total += Number(p.horas_decimal || 0);
    }
    let created = 0;
    for (const [empIdStr, info] of Object.entries(byEmp)) {
      if (info.total < 200) continue;
      const empId = Number(empIdStr);
      const { data: existing } = await supabaseAdmin.from("billing_alerts").select("id").eq("alert_type", "JORNADA_LIMITE").eq("client_id", empId).eq("resolved", false).like("period_start", `${mes}%`).limit(1);
      if (existing && existing.length > 0) continue;
      await supabaseAdmin.from("billing_alerts").insert({
        client_id: empId,
        client_name: info.name,
        alert_type: "JORNADA_LIMITE",
        message: `Agente ${info.name} atingiu ${info.total.toFixed(1)}h neste m\xEAs. Limite: 220h`,
        period_start: `${mes}-01`,
        period_end: `${mes}-${String(lastDay).padStart(2, "0")}`,
        resolved: false
      });
      created++;
    }
    log(
      `CRON JornadaAlerta: ${created} alerta(s) criado(s), ${Object.values(byEmp).filter((e) => e.total >= 200).length} agente(s) \u2265200h`,
      "cron"
    );
  } catch (err) {
    log(`CRON JornadaAlerta: Erro: ${err.message}`, "cron");
  }
}
async function runAceiteExpiradoCron() {
  if (!isSupabaseHealthy()) {
    log("CRON AceiteExpirado: SKIP \u2014 Supabase offline (modo fallback)", "cron");
    return;
  }
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1e3).toISOString();
    const { data: expired } = await supabaseAdmin.from("mission_acceptances").select("id, service_order_id, employee_id").eq("status", "pendente").lt("notified_at", twoHoursAgo);
    if (!expired?.length) return;
    for (const acc of expired) {
      await supabaseAdmin.from("mission_acceptances").update({
        status: "expirado",
        responded_at: (/* @__PURE__ */ new Date()).toISOString(),
        notes: "Expirado automaticamente \u2014 sem resposta em 2 horas"
      }).eq("id", acc.id);
    }
    log(`CRON AceiteExpirado: ${expired.length} aceite(s) expirado(s)`, "cron");
  } catch (err) {
    log(`CRON AceiteExpirado: Erro: ${err.message}`, "cron");
  }
}
async function runVencimentosCron() {
  try {
    log("CRON Vencimentos: disparando e-mail di\xE1rio", "cron");
    await sendVencimentosDoDiaEmail();
  } catch (err) {
    log(`CRON Vencimentos: erro: ${err.message}`, "cron");
  }
}
async function runAlertaFrotaCron() {
  try {
    const { data: vehicles } = await supabaseAdmin.from("vehicles").select("id, plate, model, brand, km, last_oil_change_km, status").not("status", "eq", "inativo");
    if (!vehicles?.length) return;
    const alerts = [];
    for (const v of vehicles) {
      const currentKm = v.km || 0;
      const lastOilKm = v.last_oil_change_km || 0;
      const kmSinceOil = currentKm - lastOilKm;
      const label = `${v.plate} (${v.brand || ""} ${v.model || ""})`.trim();
      if (kmSinceOil >= 1e4) {
        alerts.push(`\u{1F534} ${label}: Troca de \xF3leo VENCIDA (${kmSinceOil.toLocaleString()} km desde \xFAltima troca)`);
        if (v.status !== "manuten\xE7\xE3o") {
          await supabaseAdmin.from("vehicles").update({ status: "manuten\xE7\xE3o" }).eq("id", v.id);
        }
      } else if (kmSinceOil >= 8e3) {
        alerts.push(`\u{1F7E1} ${label}: Troca de \xF3leo em ${(1e4 - kmSinceOil).toLocaleString()} km`);
      }
      const { data: nextMaint } = await supabaseAdmin.from("vehicle_maintenance").select("id, type, next_maintenance_km, next_maintenance_date").eq("vehicle_id", v.id).eq("status", "scheduled").order("next_maintenance_km", { ascending: true }).limit(1);
      if (nextMaint?.length && nextMaint[0].next_maintenance_km) {
        const kmUntil = nextMaint[0].next_maintenance_km - currentKm;
        if (kmUntil <= 0) {
          alerts.push(
            `\u{1F534} ${label}: Manuten\xE7\xE3o "${nextMaint[0].type}" VENCIDA (KM ${nextMaint[0].next_maintenance_km.toLocaleString()} ultrapassado)`
          );
        } else if (kmUntil <= 1e3) {
          alerts.push(`\u{1F7E1} ${label}: Manuten\xE7\xE3o "${nextMaint[0].type}" em ${kmUntil.toLocaleString()} km`);
        }
      }
      if (nextMaint?.length && nextMaint[0].next_maintenance_date) {
        const dueDate = new Date(nextMaint[0].next_maintenance_date);
        const daysUntil = Math.floor((dueDate.getTime() - Date.now()) / (1e3 * 60 * 60 * 24));
        if (daysUntil < 0) {
          alerts.push(`\u{1F534} ${label}: Manuten\xE7\xE3o "${nextMaint[0].type}" vencida h\xE1 ${Math.abs(daysUntil)} dia(s)`);
        } else if (daysUntil <= 7) {
          alerts.push(`\u{1F7E1} ${label}: Manuten\xE7\xE3o "${nextMaint[0].type}" em ${daysUntil} dia(s)`);
        }
      }
    }
    if (alerts.length > 0) {
      await supabaseAdmin.from("audit_logs").insert({
        user_name: "SISTEMA",
        user_role: "system",
        action: "CRON_ALERTA_FROTA",
        details: `${alerts.length} alerta(s) de frota:
${alerts.join("\n")}`
      });
    }
    log(`CRON AlertaFrota: ${alerts.length} alerta(s) de ${vehicles.length} ve\xEDculo(s)`, "cron");
  } catch (err) {
    log(`CRON AlertaFrota: Erro: ${err.message}`, "cron");
  }
}
async function runAlertaDocRhCron() {
  try {
    const { data: employees } = await supabaseAdmin.from("employees").select("id, name, status, cnh_expiry, cnv_expiry, cnv_number, vest_expiry").eq("status", "ativo");
    if (!employees?.length) return;
    const today = /* @__PURE__ */ new Date();
    const alerts = [];
    const checkExpiry = (name, docName, expiryStr) => {
      if (!expiryStr) return;
      const expiry = new Date(expiryStr);
      const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24));
      if (daysUntil < 0) {
        alerts.push(`\u{1F534} ${name}: ${docName} VENCIDO h\xE1 ${Math.abs(daysUntil)} dia(s)`);
      } else if (daysUntil <= 30) {
        alerts.push(`\u{1F7E1} ${name}: ${docName} vence em ${daysUntil} dia(s) (${expiry.toLocaleDateString("pt-BR")})`);
      }
    };
    const checkReciclagem = (name, cnvExpiry) => {
      if (!cnvExpiry) return;
      const cnvDate = new Date(cnvExpiry);
      const twoYearsFromCnv = new Date(cnvDate);
      twoYearsFromCnv.setFullYear(twoYearsFromCnv.getFullYear() + 2);
      const daysUntilRecicla = Math.floor((twoYearsFromCnv.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24));
      if (daysUntilRecicla < 0) {
        alerts.push(`\u{1F534} ${name}: Reciclagem VENCIDA h\xE1 ${Math.abs(daysUntilRecicla)} dia(s)`);
      } else if (daysUntilRecicla <= 60) {
        alerts.push(`\u{1F7E1} ${name}: Reciclagem em ${daysUntilRecicla} dia(s)`);
      }
    };
    for (const emp of employees) {
      checkExpiry(emp.name, "CNH", emp.cnh_expiry);
      checkExpiry(emp.name, "CNV", emp.cnv_expiry);
      checkExpiry(emp.name, "Colete Bal\xEDstico", emp.vest_expiry);
      checkReciclagem(emp.name, emp.cnv_expiry);
    }
    const { data: weapons } = await supabaseAdmin.from("weapons").select("id, model, serial_number, registration_expiry, assigned_employee_id").not("registration_expiry", "is", null);
    if (weapons?.length) {
      for (const w of weapons) {
        const expiry = new Date(w.registration_expiry);
        const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24));
        const label = `Arma ${w.model || ""} (${w.serial_number || "S/N"})`;
        if (daysUntil < 0) {
          alerts.push(`\u{1F534} ${label}: Registro VENCIDO h\xE1 ${Math.abs(daysUntil)} dia(s)`);
        } else if (daysUntil <= 60) {
          alerts.push(`\u{1F7E1} ${label}: Registro vence em ${daysUntil} dia(s)`);
        }
      }
    }
    const { data: docs } = await supabaseAdmin.from("employee_documents").select("id, employee_id, type, expiry_date, file_name").not("expiry_date", "is", null);
    if (docs?.length) {
      const empMap = new Map(employees.map((e) => [e.id, e.name]));
      for (const doc of docs) {
        const expiry = new Date(doc.expiry_date);
        const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24));
        const empName = empMap.get(doc.employee_id) || `Func. #${doc.employee_id}`;
        if (daysUntil < 0) {
          alerts.push(`\u{1F534} ${empName}: Documento "${doc.type}" VENCIDO h\xE1 ${Math.abs(daysUntil)} dia(s)`);
        } else if (daysUntil <= 30) {
          alerts.push(`\u{1F7E1} ${empName}: Documento "${doc.type}" vence em ${daysUntil} dia(s)`);
        }
      }
    }
    if (alerts.length > 0) {
      await supabaseAdmin.from("audit_logs").insert({
        user_name: "SISTEMA",
        user_role: "system",
        action: "CRON_ALERTA_DOCUMENTOS_RH",
        details: `${alerts.length} alerta(s) de documentos:
${alerts.join("\n")}`
      });
    }
    log(`CRON AlertaDocRH: ${alerts.length} alerta(s) de ${employees.length} funcion\xE1rio(s)`, "cron");
  } catch (err) {
    log(`CRON AlertaDocRH: Erro: ${err.message}`, "cron");
  }
}
async function runResumoFinanceiroCron() {
  try {
    log("CRON ResumoFinanceiro: Disparando resumo da diretoria (seg-sex)", "cron");
    const { sendDailySummaryEmail: sendDailySummaryEmail2 } = await Promise.resolve().then(() => (init_cron(), cron_exports));
    await sendDailySummaryEmail2();
  } catch (err) {
    log(`CRON ResumoFinanceiro: Erro: ${err.message}`, "cron");
  }
}
async function runComprovantesCron() {
  log("CRON Comprovantes: verificando pend\xEAncias financeiras", "cron");
  const { sendComprovantesPendentesEmail: sendComprovantesPendentesEmail2 } = await Promise.resolve().then(() => (init_cron(), cron_exports));
  await sendComprovantesPendentesEmail2();
}
async function runPayslipReminderCron() {
  try {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(/* @__PURE__ */ new Date());
    const [yStr, mStr] = today.split("-");
    const year = Number(yStr);
    const month = Number(mStr);
    const { from, to } = monthRange(year, month);
    const holidaySet = await loadHolidaySet(from, to);
    const elapsed = countBusinessDays(from, today, holidaySet);
    if (elapsed !== 5) return;
    log("CRON LembreteHolerite: Hoje \xE9 o 5\xBA dia \xFAtil \u2014 verificando holerites do m\xEAs anterior", "cron");
    const { sendPayslipReminderToDiretoria: sendPayslipReminderToDiretoria2 } = await Promise.resolve().then(() => (init_cron(), cron_exports));
    await sendPayslipReminderToDiretoria2(year, month);
  } catch (err) {
    log(`CRON LembreteHolerite: Erro: ${err.message}`, "cron");
  }
}
async function runDocComplianceCron() {
  try {
    const { sendDocComplianceEmail: sendDocComplianceEmail2 } = await Promise.resolve().then(() => (init_document_compliance(), document_compliance_exports));
    const r = await sendDocComplianceEmail2();
    log(
      `CRON DocCompliance: ${r.message} \u2014 ${r.employees} funcion\xE1rio(s), ${r.totalMissing} faltante(s), ${r.totalExpired} vencido(s)`,
      "cron"
    );
  } catch (e) {
    log(`CRON DocCompliance: Erro: ${e.message}`, "cron");
  }
}
async function runAgentCentralCron() {
  await withCronLock("agent-central", async () => {
    try {
      const { runAgentCentralCheck: runAgentCentralCheck2 } = await Promise.resolve().then(() => (init_cron_agent_central(), cron_agent_central_exports));
      const r = await runAgentCentralCheck2();
      if (r.reminded > 0 || r.skipped_nophone > 0) {
        log(
          `CRON AgenteCentral: ${r.scanned} OSs ativas, ${r.reminded} cobran\xE7as enviadas, ${r.skipped_nophone} sem telefone`,
          "cron"
        );
      }
    } catch (e) {
      log(`CRON AgenteCentral: Erro: ${e.message}`, "cron");
    }
  });
}
async function runAgentCentralEscalationCron() {
  await withCronLock("agent-central-escalation", async () => {
    try {
      const { flushAgentEscalations: flushAgentEscalations2 } = await Promise.resolve().then(() => (init_agent_central_mention(), agent_central_mention_exports));
      const r = await flushAgentEscalations2();
      if (r.escalated > 0 || r.fulfilled > 0 || r.no_second > 0) {
        log(
          `CRON AgenteCentral-Escalonamento: ${r.escalated} 2\xBA agente(s) cobrado(s), ${r.fulfilled} resolvido(s) (1\xBA respondeu), ${r.no_second} sem 2\xBA agente`,
          "cron"
        );
      }
    } catch (e) {
      log(`CRON AgenteCentral-Escalonamento: Erro: ${e.message}`, "cron");
    }
  });
}
var locks;
var init_cron_jobs = __esm({
  "server/cron-jobs.ts"() {
    "use strict";
    init_storage();
    init_apibrasil();
    init_logger();
    init_supabase();
    init_pg_fallback();
    init_hours_calc();
    init_control_id();
    init_rhid_reconciliation();
    init_folha_historico();
    init_holidays();
    init_email_vencimentos();
    locks = /* @__PURE__ */ new Set();
  }
});

// server/whatsapp-monitor.ts
var whatsapp_monitor_exports = {};
__export(whatsapp_monitor_exports, {
  __resetMonitorForTests: () => __resetMonitorForTests,
  decideMonitorAction: () => decideMonitorAction,
  downEmailHtmlForTest: () => downEmailHtmlForTest,
  getMonitorState: () => getMonitorState,
  initWhatsappMonitor: () => initWhatsappMonitor,
  initialMonitorState: () => initialMonitorState,
  runMonitorCheck: () => runMonitorCheck
});
import nodemailer6 from "nodemailer";
function initialMonitorState() {
  return {
    consecutiveDown: 0,
    isDown: false,
    downSince: null,
    lastDownAlertAt: 0,
    lastUpAlertAt: 0
  };
}
function decideMonitorAction(state, connected, now, cfg = DEFAULT_CFG) {
  const s = { ...state };
  if (connected === true) {
    s.consecutiveDown = 0;
    if (s.isDown) {
      s.isDown = false;
      s.downSince = null;
      s.lastUpAlertAt = now;
      return { state: s, action: "send_recovery" };
    }
    return { state: s, action: "none" };
  }
  s.consecutiveDown += 1;
  if (!s.isDown) {
    if (s.consecutiveDown >= cfg.confirmAfter) {
      s.isDown = true;
      s.downSince = now;
      s.lastDownAlertAt = now;
      return { state: s, action: "send_down" };
    }
    return { state: s, action: "none" };
  }
  if (now - s.lastDownAlertAt >= cfg.remindEveryMs) {
    s.lastDownAlertAt = now;
    return { state: s, action: "send_down" };
  }
  return { state: s, action: "none" };
}
function getMonitorState() {
  return { isDown: runtimeState.isDown, downSince: runtimeState.downSince };
}
function alertEmailRecipient() {
  return (process.env.WHATSAPP_ALERT_EMAIL || "thiago@grupotmseg.com.br").trim();
}
function getMailTransporter4() {
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer6.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false }
  });
}
function formatBRT2(ms) {
  return new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function sendAlert(subject, html) {
  const transporter = getMailTransporter4();
  if (!transporter) {
    console.warn("[wa-monitor] SMTP n\xE3o configurado \u2014 alerta n\xE3o enviado");
    return;
  }
  const to = alertEmailRecipient();
  const from = `"Torres Vigil\xE2ncia - Sistema" <${process.env.SMTP_FROM || process.env.SMTP_USER || "escolta@torresseguranca.com.br"}>`;
  transporter.sendMail({ from, to, subject, html }).then(() => console.log(`[wa-monitor] Alerta enviado para ${to}: ${subject}`)).catch((err) => console.error(`[wa-monitor] Falha ao enviar alerta: ${err?.message || err}`));
}
function downEmailHtml(downSince2, reason) {
  if (reason === "wrong_number") {
    return `<div style="font-family:Arial,sans-serif;max-width:600px">
      <h2 style="color:#dc2626">\u26A0\uFE0F WhatsApp do bot est\xE1 no N\xDAMERO ERRADO</h2>
      <p>Desde <strong>${formatBRT2(downSince2)}</strong>, a Z-API est\xE1 conectada, mas a um <strong>n\xFAmero diferente</strong> do n\xFAmero oficial da Central.</p>
      <h3 style="color:#333;margin-top:20px">O que isso significa</h3>
      <p>Por seguran\xE7a, o sistema <strong>bloqueia todos os envios</strong> nesse estado (pra n\xE3o mandar mensagem do n\xFAmero errado). Na pr\xE1tica, o bot est\xE1 <strong>parado</strong>: n\xE3o manda atualiza\xE7\xE3o pro grupo, n\xE3o responde quando \xE9 marcado e n\xE3o cobra os agentes.</p>
      <h3 style="color:#333;margin-top:20px">O que fazer (r\xE1pido)</h3>
      <ol style="margin:8px 0;padding-left:20px">
        <li>Abra o painel da <strong>Z-API</strong>.</li>
        <li><strong>Desconecte</strong> o n\xFAmero que est\xE1 conectado agora (o errado).</li>
        <li><strong>Reconecte o n\xFAmero oficial da Central</strong> lendo o QR Code com o celular certo.</li>
      </ol>
      <p style="color:#888;font-size:12px;margin-top:20px">Voc\xEA receber\xE1 um novo e-mail quando voltar ao n\xFAmero correto. Se continuar assim, este aviso se repete a cada 2 horas.</p>
      <p style="color:#666;font-size:12px">Torres Vigil\xE2ncia Patrimonial \u2014 Monitoramento Autom\xE1tico</p>
    </div>`;
  }
  return `<div style="font-family:Arial,sans-serif;max-width:600px">
    <h2 style="color:#dc2626">\u26A0\uFE0F WhatsApp do bot DESCONECTOU</h2>
    <p>O WhatsApp da Central (o n\xFAmero do bot) ficou <strong>desconectado</strong> \xE0s <strong>${formatBRT2(downSince2)}</strong>.</p>
    <h3 style="color:#333;margin-top:20px">O que isso significa</h3>
    <p>Enquanto estiver desconectado, o bot <strong>n\xE3o envia e n\xE3o recebe</strong> mensagens: n\xE3o vai mandar atualiza\xE7\xE3o pro grupo do cliente, n\xE3o responde quando \xE9 marcado e n\xE3o cobra os agentes.</p>
    <h3 style="color:#333;margin-top:20px">O que fazer (r\xE1pido)</h3>
    <ol style="margin:8px 0;padding-left:20px">
      <li>Abra o painel: <strong>Admin \u2192 WhatsApp</strong>.</li>
      <li>Se aparecer o <strong>QR Code</strong>, abra o WhatsApp do celular do bot \u2192 <em>Aparelhos conectados</em> \u2192 <em>Conectar um aparelho</em> e escaneie.</li>
      <li>Confirme que o status volta para <strong>"WhatsApp conectado"</strong>.</li>
    </ol>
    <p style="color:#888;font-size:12px;margin-top:20px">Voc\xEA receber\xE1 um novo e-mail quando a conex\xE3o voltar. Se continuar ca\xEDdo, este aviso se repete a cada 2 horas.</p>
    <p style="color:#666;font-size:12px">Torres Vigil\xE2ncia Patrimonial \u2014 Monitoramento Autom\xE1tico</p>
  </div>`;
}
function recoveryEmailHtml(downSince2, recoveredAt) {
  const durTxt = downSince2 ? (() => {
    const secs = Math.max(0, Math.round((recoveredAt - downSince2) / 1e3));
    const mins = Math.floor(secs / 60);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}min` : `${mins}min`;
  })() : "\u2014";
  return `<div style="font-family:Arial,sans-serif;max-width:600px">
    <h2 style="color:#16a34a">\u2705 WhatsApp do bot RECONECTOU</h2>
    <p>O WhatsApp da Central voltou ao ar \xE0s <strong>${formatBRT2(recoveredAt)}</strong>.</p>
    <table style="border-collapse:collapse;margin:16px 0">
      ${downSince2 ? `<tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f0fdf4">Caiu em</td><td style="padding:6px 14px;border:1px solid #ddd">${formatBRT2(downSince2)}</td></tr>` : ""}
      <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f0fdf4">Voltou em</td><td style="padding:6px 14px;border:1px solid #ddd">${formatBRT2(recoveredAt)}</td></tr>
      <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f0fdf4">Tempo fora</td><td style="padding:6px 14px;border:1px solid #ddd">${durTxt}</td></tr>
    </table>
    <p style="color:#888;font-size:12px;margin-top:20px">O bot j\xE1 voltou a enviar e receber normalmente. Nenhuma a\xE7\xE3o necess\xE1ria.</p>
    <p style="color:#666;font-size:12px">Torres Vigil\xE2ncia Patrimonial \u2014 Monitoramento Autom\xE1tico</p>
  </div>`;
}
async function readHealth() {
  let status;
  try {
    status = await getConnectionStatus();
  } catch {
    return { connected: null, reason: "unreachable" };
  }
  if (status.connected !== true) {
    return { connected: false, reason: status.configured ? "disconnected" : "not_configured" };
  }
  try {
    const num2 = await assertExpectedNumber();
    if (!num2.ok) return { connected: false, reason: "wrong_number" };
  } catch {
  }
  return { connected: true, reason: null };
}
async function runMonitorCheck(now = Date.now()) {
  const { connected, reason } = await readHealth();
  const prevDownSince = runtimeState.downSince;
  const { state, action } = decideMonitorAction(runtimeState, connected, now);
  runtimeState = state;
  if (action === "send_down" && runtimeState.downSince != null) {
    const r = reason ?? "disconnected";
    const subject = r === "wrong_number" ? "\u26A0\uFE0F ALERTA: WhatsApp do bot no N\xDAMERO ERRADO" : "\u26A0\uFE0F ALERTA: WhatsApp do bot DESCONECTOU";
    sendAlert(subject, downEmailHtml(runtimeState.downSince, r));
  } else if (action === "send_recovery") {
    sendAlert("\u2705 RECUPERADO: WhatsApp do bot reconectou", recoveryEmailHtml(prevDownSince, now));
  }
  return action;
}
function initWhatsappMonitor() {
  if (!shouldRunBackgroundJobs()) return;
  if (!isZapiConfigured()) {
    console.log("[wa-monitor] Z-API n\xE3o configurada \u2014 monitor de conex\xE3o desligado");
    return;
  }
  const enabled = process.env.NODE_ENV === "production" || process.env.WHATSAPP_MONITOR_ENABLED === "true";
  if (!enabled) {
    console.log("[wa-monitor] Monitor desligado fora de produ\xE7\xE3o (defina WHATSAPP_MONITOR_ENABLED=true pra for\xE7ar)");
    return;
  }
  if (timer) return;
  console.log("[wa-monitor] Monitor de conex\xE3o do WhatsApp ativo (checa a cada 3 min)");
  setTimeout(() => {
    runMonitorCheck().catch((e) => console.error("[wa-monitor] erro na 1\xAA checagem:", e?.message || e));
  }, FIRST_CHECK_DELAY_MS);
  timer = setInterval(() => {
    runMonitorCheck().catch((e) => console.error("[wa-monitor] erro na checagem:", e?.message || e));
  }, CHECK_INTERVAL_MS);
}
function downEmailHtmlForTest(downSince2, reason) {
  return downEmailHtml(downSince2, reason);
}
function __resetMonitorForTests() {
  runtimeState = initialMonitorState();
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
var CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS, CONFIRM_AFTER, REMIND_EVERY_MS, DEFAULT_CFG, runtimeState, timer;
var init_whatsapp_monitor = __esm({
  "server/whatsapp-monitor.ts"() {
    "use strict";
    init_zapi();
    init_platform();
    CHECK_INTERVAL_MS = 3 * 60 * 1e3;
    FIRST_CHECK_DELAY_MS = 30 * 1e3;
    CONFIRM_AFTER = 2;
    REMIND_EVERY_MS = 2 * 60 * 60 * 1e3;
    DEFAULT_CFG = {
      confirmAfter: CONFIRM_AFTER,
      remindEveryMs: REMIND_EVERY_MS
    };
    runtimeState = initialMonitorState();
    timer = null;
  }
});

// server/cron-buckets.ts
function getBrtClock(now = /* @__PURE__ */ new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: weekdayMap[parts.weekday] ?? 0,
    ymd: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  };
}
async function runBrtScheduledJobs(brt) {
  const { hour, minute, day, month, weekday } = brt;
  const isWeekday = weekday >= 1 && weekday <= 5;
  if (hour === 0 && minute === 0) {
    await runControlIdCron();
    await runRhidReconCron();
  }
  if (hour === 2 && minute === 0) await runFleetMultasCron();
  if (hour === 2 && minute === 59) await runProvisaoCron();
  if (hour === 3 && minute === 10) await runContratoDefinitivoCron();
  if (hour === 3 && minute === 0 && day === 1 && month % 3 === 1) await runRhComplianceCron();
  if (hour === 3 && minute === 0) await runBillingAlertsCron();
  if (hour === 4 && minute === 0) await runInterReconcileBackfillCron();
  if (hour === 5 && minute === 0 && day === 1) await runFolhaSnapshotCron();
  if (hour === 6 && minute === 0) {
    await runDiariasJornadaCron();
    if (day >= 2 && day <= 5) await runFolhaCatchupCron();
    if (isWeekday) await runResumoFinanceiroCron();
  }
  if (hour === 6 && minute === 30 && isWeekday) await runRodizioCron();
  if (hour === 7 && minute === 0) {
    await runVencimentosCron();
    await runAlertaFrotaCron();
    await runDocComplianceCron();
  }
  if (hour === 8 && minute === 0) {
    await runAlertaDocRhCron();
    await runJornadaAlertaCron();
  }
  if (hour === 9 && minute === 0) {
    await runComprovantesCron();
    if (isWeekday) await runResumoFinanceiroCron();
    await runPayslipReminderCron();
  }
  if (hour === 12 && minute === 0) {
    await runControlIdCron();
    if (isWeekday) await runResumoFinanceiroCron();
  }
  if (hour === 15 && minute === 0 && isWeekday) await runResumoFinanceiroCron();
  if (hour === 16 && minute === 30 && isWeekday) await runRodizioCron();
  if (hour === 18 && minute === 0 && isWeekday) await runResumoFinanceiroCron();
}
async function runBillingWithMeta() {
  if (!isSupabaseHealthy()) {
    log("CRON Billing: SKIP \u2014 Supabase offline (modo fallback)", "cron");
    return;
  }
  const { executeBillingCron: executeBillingCron2, checkMetaAndNotify: checkMetaAndNotify2 } = await Promise.resolve().then(() => (init_cron(), cron_exports));
  await executeBillingCron2();
  await checkMetaAndNotify2();
}
async function runCronBucket(bucket) {
  switch (bucket) {
    case "minute": {
      const { processPendingForwards: processPendingForwards2 } = await Promise.resolve().then(() => (init_cron_whatsapp_forward(), cron_whatsapp_forward_exports));
      await processPendingForwards2();
      await runAgentCentralEscalationCron();
      await runBrtScheduledJobs(getBrtClock());
      break;
    }
    case "three-min": {
      const { runMonitorCheck: runMonitorCheck2 } = await Promise.resolve().then(() => (init_whatsapp_monitor(), whatsapp_monitor_exports));
      await runMonitorCheck2();
      break;
    }
    case "five-min": {
      await runRhidQueueCron();
      await runInterReconcileFastCron();
      await runAgentCentralCron();
      break;
    }
    case "ten-min": {
      await runBillingWithMeta();
      break;
    }
    case "fifteen-min": {
      await runNfReconcileCron();
      break;
    }
    case "thirty-min": {
      await runAceiteExpiradoCron();
      break;
    }
    default: {
      const _exhaustive = bucket;
      throw new Error(`Bucket desconhecido: ${_exhaustive}`);
    }
  }
}
function isCronBucket(value) {
  return CRON_BUCKETS.includes(value);
}
var CRON_BUCKETS;
var init_cron_buckets = __esm({
  "server/cron-buckets.ts"() {
    "use strict";
    init_logger();
    init_pg_fallback();
    init_cron_jobs();
    CRON_BUCKETS = [
      "minute",
      "three-min",
      "five-min",
      "ten-min",
      "fifteen-min",
      "thirty-min"
    ];
  }
});

// server/cron-vercel.ts
init_logger();
init_cron_buckets();
async function runVercelCronJob(job) {
  log(`CRON Vercel: bucket=${job}`, "cron");
  await runCronBucket(job);
  return { ok: true, job };
}
function isVercelCronJob(value) {
  return isCronBucket(value);
}

// api/_cron.ts
function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.authorization;
  return auth === `Bearer ${secret}`;
}
async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const jobParam = typeof req.query.job === "string" ? req.query.job : "";
  if (!isVercelCronJob(jobParam)) {
    return res.status(400).json({
      message: "Par\xE2metro job inv\xE1lido",
      jobs: CRON_BUCKETS
    });
  }
  try {
    const result = await runVercelCronJob(jobParam);
    return res.status(200).json(result);
  } catch (err) {
    console.error(`[cron] job=${jobParam} erro:`, err);
    return res.status(500).json({ message: err?.message || "Cron failed" });
  }
}
export {
  handler as default
};
