import type { Express } from "express";
import { type Server } from "http";
import { randomBytes } from "crypto";
import { storage, toCamelObj, toCamelArray, toSnakeObj } from "./storage";
import { requireAuth, requireAdminRole, requireDiretoria } from "./auth";
import { supabaseAdmin, getSupabaseStats } from "./supabase";
import { getSlowRoutes } from "./index";
import {
  insertClientSchema, insertEmployeeSchema, insertVehicleSchema,
  insertServiceOrderSchema, insertTripSchema, insertVehicleMaintenanceSchema,
  insertVehicleFuelingSchema, insertTimesheetSchema, insertMissionPhotoSchema,
  insertEmployeeDocumentSchema, insertWeaponSchema, insertWeaponAssignmentSchema,
  insertVehicleAssignmentSchema, insertGerenciadoraSchema,
  type InsertTelemetryEvent,
  insertReferencePointSchema,
} from "@shared/schema";
import * as apibrasil from "./apibrasil";
import * as truckscontrol from "./truckscontrol";
import { generateContractPDF } from "./contract-pdf";
import { processTelemetry } from "./telemetry-engine";
import { nominatimGeocode, nominatimReverseGeocode } from "./db-init";
import { logSystemAudit } from "./audit";
import { getHorasElapsedFromDB, calcularFaturamentoLive } from "./billing-calc";
import { isSupabaseHealthy, syncAllTables, testLocalDb, flushWriteQueue, getQueueStats, setSupabaseRef } from "./pg-fallback";
import OpenAI from "openai";
import {
  parseEmailList, createSmtpTransporter, getSmtpFrom,
  SMTP_BCC_OS, SMTP_BCC_WELCOME,
  haversineDist, decodePolyline, distPointToSegment, distToPolyline, findClosestIndex,
  MISSION_STEPS, STEP_REQUIRED_PHOTOS,
  toSafeUser, logFinancialAudit,
  createAutoTransaction, removeAutoTransaction,
} from "./routes/_helpers";


async function ensureInterTables() {
  const migrations = [
    // Adiciona colunas Inter na tabela invoices
    "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gateway TEXT DEFAULT 'asaas'",
    "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS inter_codigo_solicitacao TEXT",
    // Tabela de extrato Inter
    `CREATE TABLE IF NOT EXISTS inter_extrato_lancamentos (
      id SERIAL PRIMARY KEY,
      data_entrada TEXT NOT NULL,
      tipo_transacao TEXT,
      tipo_operacao TEXT NOT NULL,
      valor NUMERIC(14,2) NOT NULL,
      titulo TEXT,
      descricao TEXT,
      codigo_transacao TEXT UNIQUE,
      detalhes JSONB,
      invoice_id INTEGER,
      reconciled_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    "CREATE INDEX IF NOT EXISTS idx_inter_extrato_data ON inter_extrato_lancamentos(data_entrada)",
    // Tabela de pagamentos Inter
    `CREATE TABLE IF NOT EXISTS inter_pagamentos (
      id SERIAL PRIMARY KEY,
      tipo TEXT NOT NULL,
      codigo_transacao_inter TEXT UNIQUE,
      valor NUMERIC(14,2) NOT NULL,
      data_pagamento TEXT NOT NULL,
      descricao TEXT,
      cod_barras TEXT,
      beneficiario_nome TEXT,
      beneficiario_cpf_cnpj TEXT,
      pix_chave TEXT,
      pix_destino_nome TEXT,
      pix_destino_cpf_cnpj TEXT,
      status TEXT NOT NULL DEFAULT 'PENDENTE',
      error_msg TEXT,
      financial_transaction_id TEXT,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    // Tabela de webhooks Inter
    `CREATE TABLE IF NOT EXISTS inter_webhook_events (
      id SERIAL PRIMARY KEY,
      evento TEXT NOT NULL,
      codigo_solicitacao TEXT,
      payload JSONB NOT NULL,
      processed BOOLEAN DEFAULT FALSE,
      error_msg TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    "CREATE INDEX IF NOT EXISTS idx_inter_webhook_codigo ON inter_webhook_events(codigo_solicitacao)",
    "CREATE INDEX IF NOT EXISTS idx_invoices_inter_codigo ON invoices(inter_codigo_solicitacao)",
  ];

  try {
    for (const q of migrations) {
      await supabaseAdmin.rpc("exec_sql", { query: q });
    }
    try { await supabaseAdmin.rpc("exec_sql", { query: "NOTIFY pgrst, 'reload schema'" }); } catch (_n) {}
    console.log("[Inter] Schema (invoices.gateway + 3 tabelas Inter) garantido via Supabase RPC");
  } catch (rpcErr: any) {
    console.error("[Inter] CRITICAL: falha ao criar schema Inter:", rpcErr?.message);
  }
}

async function ensureFinancialOriginColumns() {
  const migrations = [
    "ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS origin_type TEXT DEFAULT 'manual'",
    "ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS origin_id TEXT",
    "ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS conciliado_em TIMESTAMP",
    "ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS conciliado_ref TEXT",
    "CREATE INDEX IF NOT EXISTS idx_financial_origin ON financial_transactions(origin_type, origin_id)",
    "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS valor_estimado REAL",
    "ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS vigilante2_id INTEGER",
    "ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS vigilante2_name TEXT",
    "ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS fat_acionamento NUMERIC DEFAULT 0",
    "ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS fat_km NUMERIC DEFAULT 0",
    "ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS fat_hora_extra NUMERIC DEFAULT 0",
    "ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS fat_km_carregado NUMERIC DEFAULT 0",
    "ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS fat_km_vazio NUMERIC DEFAULT 0",
    "ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS valor_franquia NUMERIC DEFAULT 0",
    "ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS valor_km_extra NUMERIC DEFAULT 0",
    "ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS km_excedente NUMERIC DEFAULT 0",
    "ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS km_franquia NUMERIC DEFAULT 0",
    "ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS km_faturado NUMERIC DEFAULT 0",
    "ALTER TABLE escort_billings ADD COLUMN IF NOT EXISTS observacoes TEXT",
    "ALTER TABLE escort_contracts ADD COLUMN IF NOT EXISTS tabela_cancelamento NUMERIC DEFAULT 0",
    "ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS gasoline_price DECIMAL(10,3)",
    "ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ethanol_price DECIMAL(10,3)",
    "ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS fuel_recommendation TEXT",
    "ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS recommendation_followed BOOLEAN",
    "ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ai_validation_status TEXT",
    "ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ai_validation_result JSONB",
    "ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ticketlog_valor_tl DECIMAL(10,2)",
    "ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ticketlog_litros_tl DECIMAL(10,2)",
    "ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ticketlog_diff_valor DECIMAL(10,2)",
    "ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ticketlog_validated_at TIMESTAMP",
    "ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ticketlog_message TEXT",
    "ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ticketlog_estab_nome TEXT",
    "ALTER TABLE vehicle_fueling ADD COLUMN IF NOT EXISTS ticketlog_attempts INTEGER DEFAULT 0",
    `CREATE TABLE IF NOT EXISTS ticketlog_postos (
       id SERIAL PRIMARY KEY,
       nome_posto TEXT NOT NULL,
       codigo_estabelecimento TEXT NOT NULL,
       endereco TEXT,
       cidade TEXT,
       ativo BOOLEAN DEFAULT TRUE,
       notas TEXT,
       created_at TIMESTAMP DEFAULT NOW()
     )`,
    "CREATE INDEX IF NOT EXISTS idx_ticketlog_postos_nome ON ticketlog_postos(LOWER(nome_posto))",
    "CREATE INDEX IF NOT EXISTS idx_vfueling_tl_status ON vehicle_fueling(ticketlog_status)",
    // ─── Control iD (iDFace MAX via Cloud) ───
    `CREATE TABLE IF NOT EXISTS control_id_devices (
       id SERIAL PRIMARY KEY,
       nome TEXT NOT NULL,
       tipo TEXT DEFAULT 'idface_cloud',
       base_url TEXT NOT NULL,
       login TEXT NOT NULL,
       password_enc TEXT NOT NULL,
       session_token TEXT,
       session_expires TIMESTAMP,
       ativo BOOLEAN DEFAULT TRUE,
       notas TEXT,
       last_sync_at TIMESTAMP,
       last_sync_status TEXT,
       last_sync_message TEXT,
       created_at TIMESTAMP DEFAULT NOW()
     )`,
    `CREATE TABLE IF NOT EXISTS control_id_users_map (
       id SERIAL PRIMARY KEY,
       device_id INTEGER NOT NULL,
       employee_id INTEGER NOT NULL,
       control_id_user_id TEXT NOT NULL,
       control_id_user_name TEXT,
       matricula TEXT,
       ativo BOOLEAN DEFAULT TRUE,
       created_at TIMESTAMP DEFAULT NOW()
     )`,
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_cidmap_device_user ON control_id_users_map(device_id, control_id_user_id)",
    "CREATE INDEX IF NOT EXISTS idx_cidmap_employee ON control_id_users_map(employee_id)",
    `CREATE TABLE IF NOT EXISTS control_id_punches (
       id SERIAL PRIMARY KEY,
       device_id INTEGER NOT NULL,
       control_id_user_id TEXT NOT NULL,
       employee_id INTEGER,
       punch_at TIMESTAMP NOT NULL,
       direction TEXT,
       source TEXT,
       raw_event JSONB,
       external_id TEXT,
       processed BOOLEAN DEFAULT FALSE,
       created_at TIMESTAMP DEFAULT NOW()
     )`,
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_cidpunch_device_external ON control_id_punches(device_id, external_id)",
    "CREATE INDEX IF NOT EXISTS idx_cidpunch_employee_time ON control_id_punches(employee_id, punch_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_cidpunch_device_time ON control_id_punches(device_id, punch_at DESC)",
  ];

  let ok = false;
  try {
    for (const q of migrations) {
      await supabaseAdmin.rpc("exec_sql", { query: q });
    }
    ok = true;
    try { await supabaseAdmin.rpc("exec_sql", { query: "NOTIFY pgrst, 'reload schema'" }); } catch (_n) {}
    console.log("[Financial] All columns ensured via Supabase RPC");
  } catch (rpcErr: any) {
    console.log("[Financial] Supabase RPC failed:", rpcErr?.message);
    console.error("[Financial] CRITICAL: column migration failed");
  }

  if (!ok) {
    const { error } = await supabaseAdmin.from("financial_transactions").select("origin_type, origin_id").limit(1);
    if (error) {
      console.error("[Financial] CRITICAL: origin columns missing. Auto-transactions will NOT work.");
    }
  }

  try {
    await supabaseAdmin.rpc("exec_sql", {
      query: `
        CREATE OR REPLACE VIEW v_resumo_financeiro AS
        SELECT
          TO_CHAR(due_date, 'YYYY-MM') AS periodo,
          COALESCE(origin_type, 'manual') AS origin_type,
          COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS total_receitas,
          COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS total_despesas,
          COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS saldo,
          COALESCE(SUM(CASE WHEN type = 'INCOME' AND status = 'PAID' THEN amount ELSE 0 END), 0) AS receitas_pagas,
          COALESCE(SUM(CASE WHEN type = 'EXPENSE' AND status = 'PAID' THEN amount ELSE 0 END), 0) AS despesas_pagas,
          COALESCE(SUM(CASE WHEN type = 'INCOME' AND status = 'PAID' THEN amount ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN type = 'EXPENSE' AND status = 'PAID' THEN amount ELSE 0 END), 0) AS saldo_realizado,
          COUNT(*) AS total_lancamentos,
          COUNT(*) FILTER (WHERE type = 'INCOME') AS count_receitas,
          COUNT(*) FILTER (WHERE type = 'EXPENSE') AS count_despesas
        FROM financial_transactions
        GROUP BY TO_CHAR(due_date, 'YYYY-MM'), COALESCE(origin_type, 'manual')
        ORDER BY periodo DESC, origin_type
      `
    });
    console.log("[Financial] v_resumo_financeiro view created/updated OK");
  } catch (_e) {
    console.log("[Financial] v_resumo_financeiro view creation skipped");
  }

  try {
    const { data: billingsToFix } = await supabaseAdmin.from("escort_billings")
      .select("id, service_order_id, vigilante2_id, placa_viatura")
      .or("vigilante2_id.is.null,placa_viatura.is.null");
    if (billingsToFix && billingsToFix.length > 0) {
      const soIds = [...new Set(billingsToFix.map((b: any) => b.service_order_id).filter(Boolean))];
      const { data: orders } = await supabaseAdmin.from("service_orders")
        .select("id, assigned_employee_2_id, vehicle_id").in("id", soIds);
      const soMap = new Map((orders || []).map((o: any) => [o.id, o]));

      const empIds = [...new Set((orders || []).map((o: any) => o.assigned_employee_2_id).filter(Boolean))];
      const vehIds = [...new Set((orders || []).map((o: any) => o.vehicle_id).filter(Boolean))];
      const [{ data: emps }, { data: vehs }] = await Promise.all([
        empIds.length ? supabaseAdmin.from("employees").select("id, name").in("id", empIds) : { data: [] },
        vehIds.length ? supabaseAdmin.from("vehicles").select("id, plate").in("id", vehIds) : { data: [] },
      ]);
      const empMap = new Map((emps || []).map((e: any) => [e.id, e.name]));
      const vehMap = new Map((vehs || []).map((v: any) => [v.id, v.plate]));

      let fixedV2 = 0, fixedPlate = 0;
      for (const b of billingsToFix) {
        if (!b.service_order_id) continue;
        const so = soMap.get(b.service_order_id);
        if (!so) continue;
        const updates: any = {};
        if (!b.vigilante2_id && so.assigned_employee_2_id) {
          const name = empMap.get(so.assigned_employee_2_id);
          if (name) { updates.vigilante2_id = so.assigned_employee_2_id; updates.vigilante2_name = name; fixedV2++; }
        }
        if (!b.placa_viatura && so.vehicle_id) {
          const plate = vehMap.get(so.vehicle_id);
          if (plate) { updates.placa_viatura = plate; fixedPlate++; }
        }
        if (Object.keys(updates).length > 0) {
          await supabaseAdmin.from("escort_billings").update(updates).eq("id", b.id);
        }
      }
      if (fixedV2 > 0) console.log(`[Financial] Backfilled vigilante2 on ${fixedV2} billings`);
      if (fixedPlate > 0) console.log(`[Financial] Backfilled placa_viatura on ${fixedPlate} billings`);
    }
  } catch (bfErr: any) {
    console.log("[Financial] billing backfill skip:", bfErr?.message || "unknown");
  }
}
ensureFinancialOriginColumns();
ensureInterTables();

async function syncMissingAutoTransactions() {
  try {
    // Pagina pra superar o limite default de 1000 do Supabase REST.
    // Sem isso, acima de 1000 linhas o set fica incompleto e o sync re-insere
    // transações já existentes a cada restart (gerando duplicatas).
    const txSet = new Set<string>();
    {
      const PAGE = 1000;
      let off = 0;
      while (true) {
        const { data: page, error } = await supabaseAdmin
          .from("financial_transactions")
          .select("origin_type, origin_id")
          .order("id", { ascending: true })
          .range(off, off + PAGE - 1);
        if (error) throw error;
        if (!page || page.length === 0) break;
        for (const t of page) txSet.add(`${t.origin_type}:${t.origin_id}`);
        if (page.length < PAGE) break;
        off += PAGE;
      }
    }

    const fuelings = await storage.getVehicleFuelings();
    for (const f of fuelings) {
      if (txSet.has(`fueling:${f.id}`)) continue;
      if (!f.totalCost || Number(f.totalCost) <= 0) continue;
      const vehicle = f.vehicleId ? await storage.getVehicle(f.vehicleId) : null;
      const driver = f.driverId ? await storage.getEmployee(f.driverId) : null;
      const plateStr = vehicle?.plate || "";
      const agentStr = driver?.name ? ` - Agente: ${driver.name}` : "";
      await supabaseAdmin.from("financial_transactions").insert({
        description: `ABASTECIMENTO ${plateStr}${agentStr} - ${f.fuelType || "diesel"} ${f.liters}L`.toUpperCase().trim(),
        amount: Number(f.totalCost),
        type: "EXPENSE",
        status: "PAID",
        due_date: f.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        origin_type: "fueling",
        origin_id: String(f.id),
        category_name: "Combustível",
        entity_name: [plateStr, driver?.name, f.station].filter(Boolean).join(" | ") || null,
        created_by: "SISTEMA",
      });
      console.log(`[Sync] Created missing fueling transaction for fueling #${f.id} (R$ ${f.totalCost})`);
    }

    const maintenances = await storage.getVehicleMaintenances();
    for (const m of maintenances) {
      if (txSet.has(`maintenance:${m.id}`)) continue;
      if (!m.cost || Number(m.cost) <= 0) continue;
      const vehicle = m.vehicleId ? await storage.getVehicle(m.vehicleId) : null;
      await supabaseAdmin.from("financial_transactions").insert({
        description: `MANUTENÇÃO ${vehicle?.plate || ""} - ${m.type} ${m.description || ""}`.toUpperCase().trim(),
        amount: Number(m.cost),
        type: "EXPENSE",
        status: "PAID",
        due_date: m.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        origin_type: "maintenance",
        origin_id: String(m.id),
        category_name: "Manutenção Veicular",
        entity_name: m.provider || null,
        created_by: "SISTEMA",
      });
      console.log(`[Sync] Created missing maintenance transaction for maintenance #${m.id} (R$ ${m.cost})`);
    }
  } catch (err: any) {
    console.error("[Sync] Error syncing auto-transactions:", err.message);
  }
}

async function syncFuelingMissionCosts() {
  try {
    const { data: activeOs } = await supabaseAdmin.from("service_orders")
      .select("id, os_number, vehicle_id, created_at, scheduled_date, mission_status")
      .in("status", ["ativa", "em_andamento", "em andamento"]);
    if (!activeOs?.length) return;

    for (const os of activeOs) {
      if (!os.vehicle_id) continue;

      const missionStarted = os.mission_status && !["aguardando", "agendada"].includes(os.mission_status);
      if (!missionStarted) continue;

      const osDateBRT = new Date(os.scheduled_date || os.created_at)
        .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

      const { data: vData } = await supabaseAdmin.from("vehicles").select("plate").eq("id", os.vehicle_id).single();
      const plate = vData?.plate || "";

      const { data: fuelings } = await supabaseAdmin.from("vehicle_fueling")
        .select("id, vehicle_id, driver_id, total_cost, fuel_type, liters, station, latitude, longitude, created_at, date")
        .eq("vehicle_id", os.vehicle_id)
        .eq("date", osDateBRT)
        .order("created_at", { ascending: true });

      for (const f of (fuelings || [])) {
        if (!f.total_cost || Number(f.total_cost) <= 0) continue;

        const { data: alreadyLinked } = await supabaseAdmin.from("mission_costs")
          .select("id")
          .ilike("description", `%[F#${f.id}]%`)
          .limit(1);
        if (alreadyLinked?.length) continue;

        const desc = `Abastecimento ${plate} - ${f.fuel_type || "gasolina"} ${f.liters}L (${f.station || "posto"}) [F#${f.id}]`;
        const { error } = await supabaseAdmin.from("mission_costs").insert({
          service_order_id: os.id,
          vehicle_id: os.vehicle_id,
          employee_id: f.driver_id || null,
          category: "Combustível",
          description: desc,
          amount: Number(f.total_cost).toFixed(2),
          cost_type: "expense",
          latitude: f.latitude || null,
          longitude: f.longitude || null,
        });
        if (!error) {
          console.log(`[Sync] Linked fueling #${f.id} R$${f.total_cost} to ${os.os_number} (date: ${osDateBRT})`);
        }
      }
    }
  } catch (err: any) {
    console.error("[Sync] Error syncing fueling mission costs:", err.message);
  }
}

setTimeout(() => {
  if (!isSupabaseHealthy()) {
    console.log("[Sync] Skipping auto-tx sync — Supabase offline at startup");
    return;
  }
  syncMissingAutoTransactions().catch(e => console.error("[Sync] auto-tx error:", e.message));
  setTimeout(() => syncFuelingMissionCosts().catch(e => console.error("[Sync] fueling-cost error:", e.message)), 15000);
}, 30000);

const DEFAULT_REPORT_TEMPLATE = `*TORRES VIGILÂNCIA PATRIMONIAL*
*OS {{osNumber}}* | *STATUS:* {{transitStatus}}

🗓 *DATA:* {{date}}    *HORA:* {{time}}
🛡 *OPERAÇÃO:* {{statusLabel}}
🏢 *CLIENTE:* {{clientName}}

📍 *ORIGEM:* {{origin}}{{waypointsBlock}}
🏁 *DESTINO:* {{destination}}

🚛 *VEÍCULO:* {{driverPlate}}
👤 *MOTORISTA:* {{driverName}}
📞 *CONTATO:* {{driverPhone}}

🚔 *VIATURA:* {{vehiclePlate}}
👮 *AGENTE 01:* {{agent1}}
👮 *AGENTE 02:* {{agent2}}

📈 *PROGRESSO DA MISSÃO:* {{progress}}%
🔲 *ATUALIZAÇÃO:* {{etapaAvancada}}
🏙️ *LOCALIZAÇÃO:* {{locationAddr}}{{etaLine}}{{mapsBlock}}`;

async function ensureSystemSettingsTable() {
  try {
    try {
      await supabaseAdmin.rpc("exec_sql", { query: `CREATE TABLE IF NOT EXISTS system_settings (id SERIAL PRIMARY KEY, key TEXT NOT NULL UNIQUE, value TEXT NOT NULL, updated_at TIMESTAMP DEFAULT NOW())` });
    } catch (_e) {}
    const { data: existing } = await supabaseAdmin.from("system_settings").select("*").eq("key", "report_template");
    if (!existing?.length) {
      await supabaseAdmin.from("system_settings").insert({ key: "report_template", value: DEFAULT_REPORT_TEMPLATE });
    } else {
      let val = existing[0].value;
      let changed = false;
      if (val.includes("ETAPA AVANÇADA")) {
        val = val.replace(/ETAPA AVANÇADA/g, "ATUALIZAÇÃO");
        changed = true;
      }
      if (val.includes("📣 *OCORRÊNCIA:*")) {
        val = val.replace(/📣 \*OCORRÊNCIA:\* /g, "");
        changed = true;
      }
      if (val.includes("📍 *ORIGEM:* {{origin}}") && !val.includes("{{waypointsBlock}}")) {
        val = val.replace("📍 *ORIGEM:* {{origin}}", "📍 *ORIGEM:* {{origin}}{{waypointsBlock}}");
        changed = true;
      }
      if (changed) {
        await supabaseAdmin.from("system_settings").update({ value: val, updated_at: new Date().toISOString() }).eq("key", "report_template");
      }
    }
  } catch (e) {
    console.error("[system_settings] init error:", e);
  }
}

  import { registerClientRoutes } from "./routes/clients";
  import { registerEmployeeRoutes } from "./routes/employees";
  import { registerVehicleRoutes } from "./routes/vehicles";
  import { registerServiceOrderRoutes } from "./routes/service-orders";
  import { registerFleetRoutes } from "./routes/fleet";
  import { registerConsultaRoutes } from "./routes/consultas";
  import { registerOperationalRoutes } from "./routes/operational";
  import { registerMissionRoutes } from "./routes/mission";
  import { registerHRRoutes } from "./routes/hr";
  import { registerEscortRoutes } from "./routes/escort";
  import { registerMobileRoutes } from "./routes/mobile";
  import { registerChatRoutes } from "./routes/chat";
  import { registerBoletimApprovalRoutes } from "./routes/boletim-approval";
  import { registerLeadRoutes } from "./routes/leads";
  import { registerConciliacaoRoutes } from "./routes/conciliacao";
  import { registerFixedCostsRoutes } from "./routes/fixed-costs";
  import { registerHolidaysRoutes } from "./routes/holidays";
  import { registerDailyAllowancesRoutes } from "./routes/daily-allowances";
  import { registerInterRoutes } from "./routes/inter";
  import { registerControlIdRoutes } from "./routes/control-id";
  import { registerRelatorioHorasRoutes } from "./routes/relatorio-horas";
  import { registerBrandedContractRoutes } from "./routes/branded-contracts";
  import { registerProbationContractRoutes } from "./routes/probation-contracts";
  import { registerPermanentContractRoutes } from "./routes/permanent-contracts";
  import { registerPendenciasRoutes } from "./routes/pendencias";

  export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

    app.get("/api/health", async (_req, res) => {
      const localDb = await testLocalDb();
      const queueStats = await getQueueStats();
      const supa = getSupabaseStats();
      res.json({
        ok: true,
        ts: Date.now(),
        supabase: isSupabaseHealthy() ? "online" : "offline",
        localDb: localDb ? "online" : "offline",
        mode: isSupabaseHealthy() ? "primary" : "fallback",
        writeQueue: queueStats,
        supabaseStats: supa,
      });
    });

    app.post("/api/admin/send-daily-summary", requireAuth, requireAdminRole, async (_req, res) => {
      try {
        const { sendDailySummaryEmail } = await import("./cron");
        const result = await sendDailySummaryEmail();
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
      }
    });

    app.get("/api/financeiro/resumo-diretoria", requireAuth, requireAdminRole, async (req, res) => {
      try {
        const { getDiretoriaSnapshot } = await import("./financial-snapshot");
        const targetDate = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
          ? req.query.date
          : undefined;
        const snap = await getDiretoriaSnapshot(targetDate);
        res.json(snap);
      } catch (err: any) {
        res.status(500).json({ message: err?.message || "Erro ao gerar resumo" });
      }
    });

    app.get("/api/health/slow-routes", requireAuth, requireAdminRole, (_req, res) => {
      const routes = getSlowRoutes();
      const summary: Record<string, { count: number; avgMs: number; maxMs: number }> = {};
      for (const r of routes) {
        const key = `${r.method} ${r.path}`;
        if (!summary[key]) summary[key] = { count: 0, avgMs: 0, maxMs: 0 };
        summary[key].count++;
        summary[key].avgMs += r.duration;
        if (r.duration > summary[key].maxMs) summary[key].maxMs = r.duration;
      }
      for (const k of Object.keys(summary)) {
        summary[k].avgMs = Math.round(summary[k].avgMs / summary[k].count);
      }
      const sorted = Object.entries(summary)
        .sort((a, b) => b[1].maxMs - a[1].maxMs)
        .map(([route, stats]) => ({ route, ...stats }));
      res.json({ threshold: 500, totalSlow: routes.length, routes: sorted, recent: routes.slice(-10) });
    });

    app.get("/api/health/memory", requireAuth, (_req, res) => {
      const mem = process.memoryUsage();
      res.json({
        rss_mb: Math.round(mem.rss / 1048576),
        heapTotal_mb: Math.round(mem.heapTotal / 1048576),
        heapUsed_mb: Math.round(mem.heapUsed / 1048576),
        external_mb: Math.round(mem.external / 1048576),
        uptime_min: Math.round(process.uptime() / 60),
      });
    });

    setSupabaseRef(supabaseAdmin);
    const localFallbackEnabled = (process.env.DISABLE_LOCAL_FALLBACK ?? "true").toLowerCase() === "false";
    if (localFallbackEnabled) {
      syncAllTables(supabaseAdmin).catch(() => {});
      setInterval(() => syncAllTables(supabaseAdmin).catch(() => {}), 5 * 60_000);
      setInterval(() => flushWriteQueue(supabaseAdmin).catch(() => {}), 30_000);
    } else {
      console.log("[storage] Fallback PostgreSQL local DESATIVADO — operando 100% no Supabase");
    }

    app.get("/api/write-queue/stats", requireAuth, async (_req, res) => {
      const stats = await getQueueStats();
      res.json(stats);
    });

    app.post("/api/write-queue/flush", requireAuth, async (_req, res) => {
      const result = await flushWriteQueue(supabaseAdmin);
      res.json(result);
    });

  const tokenFailureRateMap = new Map<string, number>();
  app.post("/api/auth/token-failure", async (req, res) => {
    try {
      const clientIp = req.ip || "unknown";
      const now = Date.now();
      const lastCall = tokenFailureRateMap.get(clientIp) || 0;
      if (now - lastCall < 10000) {
        return res.status(429).json({ ok: false, error: "rate_limited" });
      }
      tokenFailureRateMap.set(clientIp, now);
      if (tokenFailureRateMap.size > 5000) {
        const oldest = [...tokenFailureRateMap.entries()].sort((a, b) => a[1] - b[1]).slice(0, 2500);
        for (const [k] of oldest) tokenFailureRateMap.delete(k);
      }

      const { employeeId, employeeName, error: errMsg } = req.body || {};
      const errorStr = String(errMsg || "unknown").slice(0, 500);
      const { error: insertErr } = await supabaseAdmin.from("token_failure_logs").insert({
        employee_id: employeeId || null,
        employee_name: employeeName ? String(employeeName).slice(0, 100) : "unknown",
        error_message: errorStr,
        user_agent: (req.headers["user-agent"] || "").slice(0, 300),
        ip_address: clientIp,
        created_at: new Date().toISOString(),
      });
      if (insertErr) {
        console.error("[token-failure-log] insert error:", insertErr.message);
        return res.status(500).json({ ok: false });
      }
      res.json({ ok: true });
    } catch (e: unknown) {
      console.error("[token-failure-log]", e);
      res.status(500).json({ ok: false });
    }
  });

  try { await Promise.race([ensureSystemSettingsTable(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000))]); } catch (_e) { console.log("[init] ensureSystemSettingsTable skipped (timeout/error)"); }

  try {
    const autoFixFn = async () => {
      const allOrders = await storage.getServiceOrders();
      const stuckOrders = allOrders.filter(o =>
        (o.missionStatus === "finalizada" || o.missionStatus === "encerrada") &&
        o.status !== "concluida" && o.status !== "concluída" && o.status !== "cancelada"
      );
      for (const o of stuckOrders) {
        await storage.updateServiceOrder(o.id, {
          status: "concluida",
          completedDate: o.completedDate || new Date(),
        });
        console.log(`[auto-fix] OS ${o.osNumber || o.id} mission=${o.missionStatus} → status concluida`);
      }
      if (stuckOrders.length > 0) console.log(`[auto-fix] ${stuckOrders.length} OS corrigida(s)`);
    };
    await Promise.race([autoFixFn(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000))]);
  } catch (e: any) {
    console.log("[auto-fix] skipped:", e.message);
  }

  app.get("/api/dashboard/alertas-mickael", requireAuth, async (req: any, res) => {
    try {
      const u = req.user;
      if (!u) return res.json({ osPendentes: 0, docsPendentes: 0, boletinsPendentes: 0, employeesComDocPendente: [] });
      const isAllowed = u.role === "diretoria" || (u.name || "").toLowerCase().includes("mickael");
      if (!isAllowed) return res.json({ osPendentes: 0, docsPendentes: 0, boletinsPendentes: 0, employeesComDocPendente: [] });

      const [osRes, empsRes, billingsRes] = await Promise.all([
        supabaseAdmin.from("service_orders").select("id", { count: "exact" }).eq("status", "pendente"),
        supabaseAdmin.from("employees").select("id, name, cnh_expiry, cnv_expiry, cnv_number, status").eq("status", "ativo"),
        supabaseAdmin.from("escort_billings").select("id", { count: "exact" }).eq("status", "APROVADA"),
      ]);
      const osPendentes = osRes.data?.length || 0;
      const emps = empsRes.data;
      const today = new Date().toISOString().split("T")[0];
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const twoYearsAgoStr = twoYearsAgo.toISOString().split("T")[0];

      const employeesComDocPendente: string[] = [];
      (emps || []).forEach((e: any) => {
        const issues: string[] = [];
        if (!e.cnv_expiry || e.cnv_expiry < today) issues.push("CNV");
        if (!e.cnh_expiry || e.cnh_expiry < today) issues.push("CNH");
        if (e.cnv_expiry && e.cnv_expiry < twoYearsAgoStr) issues.push("Reciclagem");
        if (issues.length > 0) employeesComDocPendente.push(e.name);
      });

      const billingsPend = billingsRes.data;
      const boletinsPendentes = billingsPend?.length || 0;

      res.json({ osPendentes, docsPendentes: employeesComDocPendente.length, boletinsPendentes, employeesComDocPendente });
    } catch (e: any) {
      console.error("[alertas-mickael] erro:", e.message);
      res.json({ osPendentes: 0, docsPendentes: 0, boletinsPendentes: 0, employeesComDocPendente: [] });
    }
  });

  app.get("/api/system-settings/:key", requireAuth, async (req, res) => {
    try {
      const { data: rows } = await supabaseAdmin.from("system_settings").select("*").eq("key", req.params.key);
      if (!rows?.length) return res.status(404).json({ message: "Setting not found" });
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/system-settings/:key", requireAdminRole, async (req, res) => {
    try {
      const { value } = req.body;
      if (typeof value !== "string") return res.status(400).json({ message: "value must be a string" });
      const { data: existing } = await supabaseAdmin.from("system_settings").select("*").eq("key", req.params.key);
      if (!existing?.length) {
        const { data: result } = await supabaseAdmin.from("system_settings").insert({ key: req.params.key, value }).select().single();
        return res.json(result);
      }
      const { data: result } = await supabaseAdmin.from("system_settings")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("key", req.params.key)
        .select().single();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/auth/setup-check", async (_req, res) => {
    const hasUsers = await storage.hasAnyUsers();
    res.json({ needsSetup: !hasUsers });
  });

  app.post("/api/auth/setup", async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ message: "Campos obrigatórios: email, password, name" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Senha deve ter no mínimo 6 caracteres" });
    }

    try {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email.toLowerCase().trim(),
        password,
        email_confirm: true,
      });

      if (authError) {
        return res.status(400).json({ message: authError.message });
      }

      let user;
      try {
        user = await storage.createFirstAdmin({
          supabaseUid: authData.user.id,
          email: email.toLowerCase().trim(),
          name,
        });
      } catch (dbErr: any) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
        return res.status(403).json({ message: dbErr.message || "Sistema já possui usuários cadastrados" });
      }

      res.status(201).json(toSafeUser(user));
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Erro ao criar conta" });
    }
  });

  app.post("/api/auth/cpf-lookup", async (req, res) => {
    const { cpf } = req.body;
    if (!cpf) return res.status(400).json({ message: "CPF obrigatório" });
    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11) return res.status(400).json({ message: "CPF inválido" });

    const allEmployees = await storage.getEmployees();
    const emp = allEmployees.find((e) => e.cpf?.replace(/\D/g, "") === cleanCpf);
    if (!emp) return res.status(404).json({ message: "CPF não encontrado no cadastro de funcionários" });

    const allUsers = await storage.getUsers();
    const user = allUsers.find((u) => u.employeeId === emp.id);
    if (!user || !user.email) return res.status(404).json({ message: "Nenhum usuário vinculado a este CPF. Contate o administrador." });

    res.json({ email: user.email, name: emp.name });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const safe = toSafeUser(req.user);
    let matricula: string | null = null;
    if (req.user!.employeeId) {
      const emp = await storage.getEmployee(req.user!.employeeId);
      if (emp) matricula = emp.matricula || null;
    }
    res.json({ ...safe, matricula, termsAcceptedAt: req.user!.termsAcceptedAt || null });
  });

  app.post("/api/auth/accept-terms", requireAuth, async (req, res) => {
    const user = req.user!;
    const ipAddress = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || null;
    const userAgent = req.headers["user-agent"] || null;
    await supabaseAdmin.from("users").update({
      terms_accepted_at: new Date().toISOString(),
      terms_ip_address: ipAddress,
      terms_user_agent: userAgent,
    }).eq("id", user.id);

    await supabaseAdmin.from("audit_logs").insert({
      user_id: user.id,
      user_name: user.name || "—",
      user_role: user.role || "—",
      action: "terms_accepted",
      page: "/auth",
      details: `Termo de uso aceito. IP: ${ipAddress}`,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    res.json({ ok: true, termsAcceptedAt: new Date() });
  });

  app.post("/api/auth/login-selfie", requireAuth, async (req, res) => {
    const user = req.user!;
    const { photoData, latitude, longitude } = req.body;
    if (!photoData || typeof photoData !== "string" || photoData.length < 1000) {
      return res.status(400).json({ message: "Foto obrigatória" });
    }
    if (photoData.length > 5_000_000) {
      return res.status(400).json({ message: "Foto muito grande. Máximo 5MB." });
    }
    if (!photoData.startsWith("data:image/")) {
      return res.status(400).json({ message: "Formato de foto inválido" });
    }

    const ipAddress = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || null;
    const userAgent = req.headers["user-agent"] || null;

    await supabaseAdmin.from("login_selfies").insert({
      user_id: user.id,
      employee_id: user.employeeId,
      user_name: user.name || "—",
      photo_data: photoData,
      latitude: latitude || null,
      longitude: longitude || null,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    await supabaseAdmin.from("audit_logs").insert({
      user_id: user.id,
      user_name: user.name || "—",
      user_role: user.role || "—",
      action: "login_selfie",
      page: "/login",
      details: `Selfie de login registrada. IP: ${ipAddress}`,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    res.json({ ok: true });
  });

  app.get("/api/auth/login-selfie-today", requireAuth, async (req, res) => {
    const user = req.user!;
    const todayBRT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const midnightUTC = new Date(todayBRT + "T03:00:00.000Z");

    const { data: result } = await supabaseAdmin.from("login_selfies").select("id")
      .eq("user_id", user.id)
      .gte("created_at", midnightUTC.toISOString())
      .limit(1);

    res.json({ hasSelfieToday: (result?.length || 0) > 0 });
  });

  app.get("/api/admin/login-selfies", requireAuth, async (req, res) => {
    const user = req.user!;
    if (user.role !== "diretoria" && user.role !== "admin") {
      return res.status(403).json({ message: "Acesso restrito" });
    }
    const { data: selfies } = await supabaseAdmin.from("login_selfies")
      .select("id, user_id, employee_id, user_name, latitude, longitude, created_at")
      .order("created_at", { ascending: false }).limit(100);
    res.json(toCamelArray(selfies || []));
  });

  app.get("/api/admin/login-selfie/:id", requireAuth, async (req, res) => {
    const user = req.user!;
    if (user.role !== "diretoria" && user.role !== "admin") {
      return res.status(403).json({ message: "Acesso restrito" });
    }
    const id = parseInt(req.params.id);
    const { data: result } = await supabaseAdmin.from("login_selfies").select("*").eq("id", id).limit(1);
    if (!result?.length) return res.status(404).json({ message: "Selfie não encontrada" });
    res.json(toCamelObj(result[0]));
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "Senha deve ter no mínimo 6 caracteres" });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.supabaseUid!, {
      password: newPassword,
    });

    if (error) {
      return res.status(500).json({ message: "Erro ao atualizar senha: " + error.message });
    }

    await storage.updateUser(req.user!.id, { mustChangePassword: 0, plainPassword: newPassword } as any);

    res.json({ message: "Senha atualizada com sucesso" });
  });

  app.get("/api/auth/perfil", requireAuth, async (req, res) => {
    const perfil = await storage.getPerfilAcesso(req.user!.role);
    res.json({
      user: toSafeUser(req.user!),
      permissions: perfil ? JSON.parse(perfil.permissions) : [],
      role: perfil?.label || req.user!.role,
    });
  });

  app.get("/api/auth/perfis", requireAuth, requireAdminRole, async (_req, res) => {
    const perfis = await storage.getAllPerfis();
    res.json(perfis);
  });


    // === MODULE ROUTES ===
    registerClientRoutes(app);
    registerEmployeeRoutes(app);
    registerVehicleRoutes(app);
    registerServiceOrderRoutes(app);
    registerFleetRoutes(app);
    registerConsultaRoutes(app);
    registerOperationalRoutes(app);
    registerMissionRoutes(app);
    registerHRRoutes(app);
    registerEscortRoutes(app);
    registerMobileRoutes(app);
    registerProbationContractRoutes(app);
    registerPermanentContractRoutes(app);
    registerPendenciasRoutes(app);
    registerChatRoutes(app);
    registerBoletimApprovalRoutes(app);
    registerLeadRoutes(app);
    registerConciliacaoRoutes(app);
    registerFixedCostsRoutes(app);
    registerHolidaysRoutes(app);
    registerInterRoutes(app);
    registerDailyAllowancesRoutes(app);
    registerControlIdRoutes(app);
    registerRelatorioHorasRoutes(app);
    registerBrandedContractRoutes(app);

  
  // ===== WEAPONS =====
  app.get("/api/weapons", requireAdminRole, async (_req, res) => {
    const list = await storage.getWeapons();
    res.json(list);
  });

  app.get("/api/weapons/:id", requireAdminRole, async (req, res) => {
    const w = await storage.getWeapon(parseInt(req.params.id));
    if (!w) return res.status(404).json({ message: "Arma não encontrada" });
    res.json(w);
  });

  app.post("/api/weapons", requireAdminRole, async (req, res) => {
    const parsed = insertWeaponSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const w = await storage.createWeapon(parsed.data);
    res.status(201).json(w);
  });

  app.patch("/api/weapons/:id", requireAdminRole, async (req, res) => {
    const parsed = insertWeaponSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const w = await storage.updateWeapon(parseInt(req.params.id), parsed.data);
    if (!w) return res.status(404).json({ message: "Arma não encontrada" });
    res.json(w);
  });

  app.delete("/api/weapons/:id", requireAuth, requireDiretoria, async (req, res) => {
    await storage.deleteWeapon(parseInt(req.params.id));
    res.json({ ok: true });
  });

  app.get("/api/weapon-assignments/:weaponId", requireAdminRole, async (req, res) => {
    const list = await storage.getWeaponAssignments(parseInt(req.params.weaponId));
    res.json(list);
  });

  app.post("/api/weapon-assignments", requireAdminRole, async (req, res) => {
    const parsed = insertWeaponAssignmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    if (parsed.data.action !== "vincular" && parsed.data.action !== "desvincular") {
      return res.status(400).json({ message: "Ação inválida. Use 'vincular' ou 'desvincular'." });
    }
    const weapon = await storage.getWeapon(parsed.data.weaponId);
    if (!weapon) return res.status(404).json({ message: "Arma não encontrada" });
    const emp = await storage.getEmployee(parsed.data.employeeId);
    if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });
    const a = await storage.createWeaponAssignment(parsed.data);
    if (parsed.data.action === "vincular") {
      await storage.updateWeapon(parsed.data.weaponId, {
        assignedEmployeeId: parsed.data.employeeId,
        status: "em uso",
      });
    } else {
      await storage.updateWeapon(parsed.data.weaponId, {
        assignedEmployeeId: null,
        status: "disponível",
      });
    }
    res.status(201).json(a);
  });

  // ===== VEHICLE ASSIGNMENTS =====
  app.get("/api/vehicle-assignments/:vehicleId", requireAdminRole, async (req, res) => {
    const list = await storage.getVehicleAssignments(parseInt(req.params.vehicleId));
    res.json(list);
  });

  app.post("/api/vehicle-assignments", requireAdminRole, async (req, res) => {
    const parsed = insertVehicleAssignmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    if (parsed.data.action !== "vincular" && parsed.data.action !== "desvincular") {
      return res.status(400).json({ message: "Ação inválida. Use 'vincular' ou 'desvincular'." });
    }
    const vehicle = await storage.getVehicle(parsed.data.vehicleId);
    if (!vehicle) return res.status(404).json({ message: "Veículo não encontrado" });
    const emp = await storage.getEmployee(parsed.data.employeeId);
    if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });
    const a = await storage.createVehicleAssignment(parsed.data);
    res.status(201).json(a);
  });

  // ===== WEAPON KITS =====
  app.get("/api/weapon-kits", requireAdminRole, async (_req, res) => {
    const kits = await storage.getWeaponKits();
    const enriched = await Promise.all(kits.map(async (kit) => {
      const items = await storage.getWeaponKitItems(kit.id);
      const weaponDetails = await Promise.all(items.map(async (item) => {
        const weapon = await storage.getWeapon(item.weaponId);
        return { ...item, weapon };
      }));
      return { ...kit, items: weaponDetails };
    }));
    res.json(enriched);
  });

  app.get("/api/weapon-kits/:id", requireAdminRole, async (req, res) => {
    const kit = await storage.getWeaponKit(parseInt(req.params.id));
    if (!kit) return res.status(404).json({ message: "Kit não encontrado" });
    const items = await storage.getWeaponKitItems(kit.id);
    const weaponDetails = await Promise.all(items.map(async (item) => {
      const weapon = await storage.getWeapon(item.weaponId);
      return { ...item, weapon };
    }));
    res.json({ ...kit, items: weaponDetails });
  });

  app.post("/api/weapon-kits", requireAdminRole, async (req, res) => {
    try {
      const { name, description, weaponIds } = req.body;
      if (!name || typeof name !== "string") return res.status(400).json({ message: "Nome do kit é obrigatório" });
      if (!weaponIds || !Array.isArray(weaponIds) || weaponIds.length === 0) {
        return res.status(400).json({ message: "Selecione ao menos uma arma para o kit" });
      }
      const uniqueIds = [...new Set(weaponIds.map(Number))];
      const allKits = await storage.getWeaponKits();
      const usedWeaponIds = new Set<number>();
      for (const k of allKits) {
        const items = await storage.getWeaponKitItems(k.id);
        items.forEach(i => usedWeaponIds.add(i.weaponId));
      }
      for (const wid of uniqueIds) {
        const w = await storage.getWeapon(wid);
        if (!w) return res.status(400).json({ message: `Arma ID ${wid} não encontrada` });
        if (usedWeaponIds.has(wid)) return res.status(400).json({ message: `Arma "${w.type} ${w.brand} ${w.model} - ${w.serialNumber}" já está vinculada a outro kit` });
      }
      const kit = await storage.createWeaponKit({ name, description: description || null, status: "disponível" });
      for (const weaponId of uniqueIds) {
        await storage.createWeaponKitItem({ kitId: kit.id, weaponId });
      }
      res.status(201).json(kit);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/weapon-kits/:id", requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, description, status, weaponIds } = req.body;
      const existing = await storage.getWeaponKit(id);
      if (!existing) return res.status(404).json({ message: "Kit não encontrado" });
      const updated = await storage.updateWeaponKit(id, {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
      });
      if (!updated) return res.status(404).json({ message: "Kit não encontrado" });
      if (weaponIds && Array.isArray(weaponIds)) {
        const uniqueIds = [...new Set(weaponIds.map(Number))];
        const allKits = await storage.getWeaponKits();
        const usedWeaponIds = new Set<number>();
        for (const k of allKits) {
          if (k.id === id) continue;
          const items = await storage.getWeaponKitItems(k.id);
          items.forEach(i => usedWeaponIds.add(i.weaponId));
        }
        for (const wid of uniqueIds) {
          const w = await storage.getWeapon(wid);
          if (!w) return res.status(400).json({ message: `Arma ID ${wid} não encontrada` });
          if (usedWeaponIds.has(wid)) return res.status(400).json({ message: `Arma "${w.type} ${w.brand} ${w.model} - ${w.serialNumber}" já está vinculada a outro kit` });
        }
        await storage.deleteWeaponKitItemsByKit(id);
        for (const weaponId of uniqueIds) {
          await storage.createWeaponKitItem({ kitId: id, weaponId });
        }
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/weapon-kits/send-docs", requireAdminRole, async (req, res) => {
    try {
      const { kitId, email } = req.body;
      if (!kitId || !email) return res.status(400).json({ message: "Kit ID e e-mail são obrigatórios" });
      const kit = await storage.getWeaponKit(kitId);
      if (!kit) return res.status(404).json({ message: "Kit não encontrado" });
      res.status(501).json({ message: "Envio por e-mail será configurado com serviço SMTP. Use o download por enquanto." });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/weapon-kits/:id", requireAuth, requireDiretoria, async (req, res) => {
    const kit = await storage.getWeaponKit(parseInt(req.params.id));
    if (!kit) return res.status(404).json({ message: "Kit não encontrado" });
    if (kit.status === "em_uso") return res.status(400).json({ message: "Não é possível excluir um kit em uso" });
    await storage.deleteWeaponKit(parseInt(req.params.id));
    res.json({ message: "Kit excluído" });
  });

  app.post("/api/weapons/ocr", requireAdminRole, async (req, res) => {
    try {
      const { imageData } = req.body;
      if (!imageData || typeof imageData !== "string") {
        return res.status(400).json({ message: "Envie imageData (base64 data URL da imagem/PDF)" });
      }

      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `Você é um sistema especializado em extrair dados de documentos de registro de armas de fogo brasileiros (Certificado de Registro - CR, CRAF, Guia de Tráfego, Porte de Arma, etc).
Extraia os seguintes campos do documento e retorne APENAS um JSON válido (sem markdown, sem texto extra):
{
  "type": "tipo da arma (Revólver, Pistola, Espingarda, Carabina, Fuzil ou Outro)",
  "brand": "marca/fabricante",
  "model": "modelo",
  "caliber": "calibre (use exatamente um destes: .38, .380 ACP, 9mm, .40 S&W, .45 ACP, 12 GA, 5.56x45mm, .308 Win, ou Outro)",
  "serialNumber": "número de série",
  "registrationNumber": "número do registro (CR, CRAF, SINARM, etc)",
  "registrationExpiry": "data de validade no formato YYYY-MM-DD ou vazio se não encontrada",
  "notes": "informações adicionais relevantes encontradas no documento"
}
Se um campo não for encontrado, retorne string vazia "". Nunca invente dados.`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os dados de arma de fogo deste documento:" },
              { type: "image_url", image_url: { url: imageData } },
            ],
          },
        ],
      });

      const text = response.choices?.[0]?.message?.content || "";
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      res.json(parsed);
    } catch (err: any) {
      console.error("OCR weapon error:", err);
      res.status(500).json({ message: "Erro ao processar documento: " + (err.message || "Erro desconhecido") });
    }
  });

  function parseCrafText(text: string): { weapons: any[]; totalFound: number; documentType: string } | null {
    if (!text.includes("SINARM") && !text.includes("CERTIFICADO DE REGISTRO")) return null;

    const calibreMap: Record<string, string> = {
      ".38": ".38", "38": ".38",
      ".380": ".380 ACP", ".380 acp": ".380 ACP", "380 acp": ".380 ACP", "380": ".380 ACP",
      "9mm": "9mm", "9 mm": "9mm",
      ".40": ".40 S&W", ".40 s&w": ".40 S&W", "40 s&w": ".40 S&W", "40": ".40 S&W",
      ".45": ".45 ACP", ".45 acp": ".45 ACP", "45 acp": ".45 ACP",
      "12": "12 GA", "12 ga": "12 GA", "12ga": "12 GA",
      "5.56": "5.56x45mm", "5.56x45": "5.56x45mm", "5.56x45mm": "5.56x45mm",
      ".308": ".308 Win", ".308 win": ".308 Win",
    };
    const especieMap: Record<string, string> = {
      "revolver": "Revólver", "revólver": "Revólver",
      "pistola": "Pistola",
      "espingarda": "Espingarda",
      "carabina": "Carabina",
      "fuzil": "Fuzil",
    };

    const sections = text.split(/(?=Nº Cad\. SINARM:)/);
    const weapons: any[] = [];

    for (const section of sections) {
      if (!section.includes("Nº Cad. SINARM:")) continue;

      let sinarmNum = "", especie = "", marca = "", modelo = "", serial = "";
      let calibre = "", registro = "", validade = "";

      const sinarmLine = section.match(/SINARM:\s*(\d{4}\/\S+)/);
      if (sinarmLine) sinarmNum = sinarmLine[1];

      const regLine = section.match(/Registro:\s*(\d+)/);
      if (regLine) registro = regLine[1];

      const valMatch = section.match(/Data de Validade:\s*\S*\s*(\d{2}\/\d{2}\/\d{4})/);
      if (valMatch) validade = valMatch[1];

      const lines = section.split("\n").map(l => l.replace(/\t/g, " ").trim());
      const nonEmpty = lines.filter(Boolean);

      const valueStartIdx = nonEmpty.findIndex(l => /^\d{4}\/\d+/.test(l));
      if (valueStartIdx >= 0) {
        const sinarmEspLine = nonEmpty[valueStartIdx];
        const sem = sinarmEspLine.match(/^(\d{4}\/\S+)\s+(.+)$/);
        if (sem) {
          sinarmNum = sem[1];
          especie = sem[2].trim();
        }

        if (valueStartIdx + 1 < nonEmpty.length) marca = nonEmpty[valueStartIdx + 1];
        if (valueStartIdx + 2 < nonEmpty.length) {
          const modeloSerialLine = nonEmpty[valueStartIdx + 2];
          const ms = modeloSerialLine.split(/\s+/);
          if (ms.length >= 2) {
            modelo = ms[0];
            serial = ms[ms.length - 1];
          } else {
            modelo = ms[0] || "";
          }
        }
        if (valueStartIdx + 3 < nonEmpty.length) {
          const calibreLine = nonEmpty[valueStartIdx + 3];
          const cp = calibreLine.split(/\s+/);
          calibre = cp[0] || "";
        }
      }

      if (!sinarmNum && !serial) continue;

      const rawEspecie = especie.toLowerCase();
      const type = especieMap[rawEspecie] || "Outro";
      const cleanBrand = marca.replace(/\s*\(.*\)\s*$/, "").trim();
      const rawCalibre = calibre.toLowerCase().trim();
      const mappedCaliber = calibreMap[rawCalibre] || "Outro";

      let registrationExpiry = "";
      if (validade) {
        const parts = validade.split("/");
        if (parts.length === 3) registrationExpiry = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }

      weapons.push({
        type,
        brand: cleanBrand || "",
        model: modelo || "",
        caliber: mappedCaliber,
        serialNumber: serial || "",
        registrationNumber: registro || "",
        registrationExpiry,
        notes: sinarmNum ? `SINARM: ${sinarmNum}` : "",
      });
    }

    if (weapons.length === 0) return null;
    return { weapons, totalFound: weapons.length, documentType: "Certificado de Registro Federal de Arma de Fogo (CRAF)" };
  }

  app.post("/api/weapons/ocr-batch", requireAdminRole, async (req, res) => {
    try {
      const { imageData } = req.body;
      if (!imageData || typeof imageData !== "string") {
        return res.status(400).json({ message: "Envie imageData (base64 data URL da imagem/PDF)" });
      }

      const mimeMatch = imageData.match(/^data:([^;]+);/);
      const mimeType = mimeMatch?.[1] || "";
      const isImage = mimeType.startsWith("image/");
      const isPdf = mimeType === "application/pdf";

      if (!isImage && !isPdf) {
        return res.status(400).json({ message: "Formato não suportado. Envie uma imagem (JPG, PNG) ou PDF." });
      }

      if (isPdf) {
        try {
          const { PDFParse: PDFParseClass } = await import("pdf-parse");
          const base64Data = imageData.split(",")[1] || "";
          const uint8 = new Uint8Array(Buffer.from(base64Data, "base64"));
          const parser = new PDFParseClass(uint8, { verbosity: 0 });
          const pdfResult = await parser.getText();
          const pdfText = typeof pdfResult === "string" ? pdfResult : (pdfResult?.text || "");

          const crafResult = parseCrafText(pdfText);
          if (crafResult && crafResult.weapons.length > 0) {
            console.log(`[CRAF Parser] Extraídas ${crafResult.weapons.length} arma(s) do PDF via parser de texto`);
            return res.json(crafResult);
          }
        } catch (pdfErr: any) {
          console.error("PDF text extraction failed, falling back to AI:", pdfErr.message);
        }
      }

      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const systemPrompt = `Você é um sistema especializado em extrair dados de documentos de registro de armas de fogo brasileiros (CR, CRAF, Guia de Tráfego, Porte de Arma, listas de armamento, planilhas, etc).

O documento pode conter UMA ou VÁRIAS armas. Extraia TODAS as armas encontradas no documento.

Retorne APENAS um JSON válido (sem markdown, sem texto extra) com o seguinte formato:
{
  "weapons": [
    {
      "type": "tipo da arma (Revólver, Pistola, Espingarda, Carabina, Fuzil ou Outro)",
      "brand": "marca/fabricante",
      "model": "modelo",
      "caliber": "calibre (use exatamente um destes: .38, .380 ACP, 9mm, .40 S&W, .45 ACP, 12 GA, 5.56x45mm, .308 Win, ou Outro)",
      "serialNumber": "número de série",
      "registrationNumber": "número do registro (CR, CRAF, SINARM, etc)",
      "registrationExpiry": "data de validade no formato YYYY-MM-DD ou vazio se não encontrada",
      "notes": "informações adicionais relevantes"
    }
  ],
  "totalFound": número_total_de_armas_encontradas,
  "documentType": "tipo do documento (ex: Certificado de Registro, Lista de Armamento, Guia de Tráfego, etc)"
}

Regras:
- Se encontrar múltiplas armas listadas, extraia CADA UMA como item separado no array
- Se encontrar apenas 1 arma, retorne array com 1 item
- Se não conseguir identificar nenhuma arma, retorne array vazio com totalFound: 0
- NUNCA invente dados. Se um campo não for encontrado, retorne string vazia ""
- Preste atenção em tabelas, listas e campos repetidos que indicam múltiplas armas`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia TODAS as armas de fogo encontradas neste documento:" },
              { type: "image_url", image_url: { url: imageData } },
            ],
          },
        ],
      });

      const text = response.choices?.[0]?.message?.content || "";
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);

      if (!parsed.weapons || !Array.isArray(parsed.weapons)) {
        return res.status(422).json({ message: "A IA não retornou um formato válido. Tente novamente." });
      }

      res.json(parsed);
    } catch (err: any) {
      console.error("OCR batch weapon error:", err);
      res.status(500).json({ message: "Erro ao processar documento: " + (err.message || "Erro desconhecido") });
    }
  });

  app.post("/api/weapons/batch", requireAdminRole, async (req, res) => {
    try {
      const { weapons: weaponList } = req.body;
      if (!Array.isArray(weaponList) || weaponList.length === 0) {
        return res.status(400).json({ message: "Envie um array de armas" });
      }

      const results: { success: any[]; errors: { index: number; error: string }[] } = { success: [], errors: [] };

      for (let i = 0; i < weaponList.length; i++) {
        const parsed = insertWeaponSchema.safeParse(weaponList[i]);
        if (!parsed.success) {
          results.errors.push({ index: i, error: parsed.error.errors.map(e => e.message).join(", ") });
          continue;
        }
        try {
          const w = await storage.createWeapon(parsed.data);
          results.success.push(w);
        } catch (err: any) {
          const msg = err.message || "Erro desconhecido";
          if (msg.includes("unique") || msg.includes("duplicate")) {
            results.errors.push({ index: i, error: `Nº série "${parsed.data.serialNumber}" já cadastrado` });
          } else {
            results.errors.push({ index: i, error: msg });
          }
        }
      }

      res.json(results);
    } catch (err: any) {
      console.error("Batch weapon create error:", err);
      res.status(500).json({ message: "Erro ao criar armas em lote: " + (err.message || "Erro desconhecido") });
    }
  });

  const _lastGpsUpdate = new Map<number, number>();
  app.post("/api/agent/location", requireAuth, async (req, res) => {
    const user = req.user!;
    const { latitude, longitude, accuracy, speed, heading } = req.body;
    if (latitude == null || longitude == null) {
      return res.status(400).json({ message: "Latitude e longitude são obrigatórios" });
    }
    const now = Date.now();
    const lastUpdate = _lastGpsUpdate.get(user.id) || 0;
    if (now - lastUpdate < 15_000) {
      return res.json({ throttled: true, message: "Aguarde 15s entre atualizações de GPS" });
    }
    _lastGpsUpdate.set(user.id, now);
    if (_lastGpsUpdate.size > 200) {
      const oldest = [..._lastGpsUpdate.entries()].sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < 50; i++) _lastGpsUpdate.delete(oldest[i][0]);
    }
    const locData = {
      userId: user.id,
      employeeId: user.employeeId || null,
      latitude,
      longitude,
      accuracy: accuracy ?? null,
      speed: speed ?? null,
      heading: heading ?? null,
    };
    const loc = await storage.upsertAgentLocation(locData);
    supabaseAdmin.from("agent_location_history").insert(toSnakeObj(locData)).then(({ error }: any) => {
      if (error) console.error("[agent-location] Failed to log history:", error.message);
    }).catch(() => {});
    res.json(loc);
  });

  app.get("/api/agent/locations", requireAdminRole, async (req, res) => {
    const locations = await storage.getAgentLocations();
    const employees = await storage.getEmployees();
    const empMap = new Map(employees.map((e: any) => [e.id, e]));
    const users = await storage.getUsers();
    const userMap = new Map(users.map((u: any) => [u.id, u]));
    const enriched = locations.map((loc: any) => {
      const emp = loc.employeeId ? empMap.get(loc.employeeId) : null;
      const usr = userMap.get(loc.userId);
      return {
        ...loc,
        employeeName: emp?.name || usr?.name || null,
        employeePhone: emp?.phone || null,
        employeeRole: emp?.role || null,
      };
    });
    res.json(enriched);
  });

  app.get("/api/agent/locations/:userId/history", requireAdminRole, async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ message: "userId inválido" });
      const date = String(req.query.date || new Date().toISOString().slice(0, 10));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: "Formato de data inválido (YYYY-MM-DD)" });
      const startOfDay = new Date(`${date}T00:00:00`);
      const endOfDay = new Date(`${date}T23:59:59`);
      const { data: history } = await supabaseAdmin.from("agent_location_history").select("*")
        .eq("user_id", userId)
        .gte("created_at", startOfDay.toISOString())
        .lte("created_at", endOfDay.toISOString())
        .order("created_at", { ascending: true });
      res.json(toCamelArray(history || []));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/company-documents", requireAuth, async (_req, res) => {
    try {
      const { data: docs } = await supabaseAdmin.from("company_documents")
        .select("id, doc_type, label, file_name, mime_type, uploaded_at")
        .order("doc_type", { ascending: true });
      res.json(toCamelArray(docs || []));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/company-documents", requireAuth, async (req, res) => {
    try {
      const { docType, label, fileName, fileData, mimeType } = req.body;
      if (!docType || !fileName || !fileData || !mimeType) return res.status(400).json({ message: "Campos obrigatórios ausentes" });
      const { data: existingDoc } = await supabaseAdmin.from("company_documents").select("id").eq("doc_type", docType);
      if (existingDoc?.length) {
        await supabaseAdmin.from("company_documents").update({ label, file_name: fileName, file_data: fileData, mime_type: mimeType }).eq("doc_type", docType);
      } else {
        await supabaseAdmin.from("company_documents").insert({ doc_type: docType, label, file_name: fileName, file_data: fileData, mime_type: mimeType });
      }
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/company-documents/:docType", requireAuth, requireDiretoria, async (req, res) => {
    try {
      await supabaseAdmin.from("company_documents").delete().eq("doc_type", req.params.docType);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/homologation-logs/:clientId", requireAuth, async (req, res) => {
    try {
      const { data: logs } = await supabaseAdmin.from("homologation_logs")
        .select("*").eq("client_id", Number(req.params.clientId))
        .order("sent_at", { ascending: false });
      res.json(toCamelArray(logs || []));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/email-config", requireAuth, async (_req, res) => {
    const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    res.json({ configured, host: process.env.SMTP_HOST || "", port: process.env.SMTP_PORT || "587", user: process.env.SMTP_USER || "" });
  });

  app.post("/api/email-test", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { to } = req.body;
      if (!to) return res.status(400).json({ message: "Informe o e-mail de destino" });
      const transporter = createSmtpTransporter();
      if (!transporter) return res.status(500).json({ message: "SMTP não configurado. Defina SMTP_HOST, SMTP_USER/EMAIL_USER e SMTP_PASS/EMAIL_PASS." });
      await transporter.sendMail({
        from: getSmtpFrom(),
        to,
        subject: "Teste de E-mail — Grupo TM SEG",
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;">
  <div style="background:#1a1a1a;padding:20px 30px;text-align:center;">
    <h1 style="color:#fff;font-size:18px;margin:0;">TORRES VIGILÂNCIA PATRIMONIAL LTDA</h1>
    <p style="color:#999;font-size:12px;margin:4px 0 0;">CNPJ: 36.982.392/0001-89</p>
  </div>
  <div style="padding:30px;border:1px solid #e0e0e0;border-top:none;">
    <h2 style="color:#1a1a1a;font-size:16px;">Teste de E-mail</h2>
    <p>Este é um e-mail de teste enviado pelo sistema Torres Gestão.</p>
    <p>Se você recebeu este e-mail, o envio está funcionando corretamente.</p>
    <p style="color:#666;font-size:13px;margin-top:20px;">Enviado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
  </div>
  <div style="background:#f5f5f5;padding:15px 30px;text-align:center;border:1px solid #e0e0e0;border-top:none;">
    <p style="color:#999;font-size:11px;margin:0;">Este e-mail foi enviado automaticamente pelo sistema Torres Gestão.</p>
  </div>
</body></html>`,
      });
      console.log(`[email-test] Email de teste enviado para ${to}`);
      res.json({ success: true, message: `E-mail de teste enviado para ${to}` });
    } catch (err: any) {
      console.error(`[email-test] Erro: ${err.message}`);
      res.status(500).json({ message: `Falha ao enviar: ${err.message}` });
    }
  });

  app.post("/api/homologation/send", requireAuth, async (req, res) => {
    try {
      const { clientId, clientName, recipientEmail, recipientName, documentTypes, includePresentation, includeValues, sentBy, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom } = req.body;
      if (!recipientEmail) {
        return res.status(400).json({ message: "E-mail do destinatário é obrigatório" });
      }
      if ((!documentTypes || documentTypes.length === 0) && !includePresentation && !includeValues) {
        return res.status(400).json({ message: "Selecione ao menos um documento para enviar" });
      }

      const homoTransporter = createSmtpTransporter();
      if (!homoTransporter) {
        return res.status(400).json({ message: "Configurações SMTP não definidas. Configure as variáveis de ambiente SMTP_HOST, SMTP_USER e SMTP_PASS." });
      }

      const docs = documentTypes && documentTypes.length > 0
        ? (await supabaseAdmin.from("company_documents").select("*").in("doc_type", documentTypes)).data || []
        : [];

      const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
      const docLabels: string[] = [];

      for (const doc of docs) {
        const base64Match = doc.file_data.match(/^data:[^;]+;base64,(.+)$/);
        const base64Data = base64Match ? base64Match[1] : doc.file_data;
        attachments.push({
          filename: doc.file_name,
          content: Buffer.from(base64Data, "base64"),
          contentType: doc.mime_type,
        });
        docLabels.push(doc.label);
      }

      if (includePresentation) {
        docLabels.push("Apresentação Institucional");
      }
      if (includeValues) {
        docLabels.push("Tabela de Valores");
      }

      const greeting = recipientName ? `Prezado(a) ${recipientName}` : "Prezado(a)";

      const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a1a1a; padding: 20px 30px; text-align: center;">
    <h1 style="color: #fff; font-size: 18px; margin: 0;">TORRES VIGILÂNCIA PATRIMONIAL LTDA</h1>
    <p style="color: #999; font-size: 12px; margin: 4px 0 0;">CNPJ: 36.982.392/0001-89</p>
  </div>
  <div style="padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
    <p>${greeting},</p>
    <p>É com satisfação que nos apresentamos. A <strong>Torres Vigilância Patrimonial LTDA</strong> é uma empresa especializada em <strong>escolta armada</strong> e <strong>vigilância patrimonial</strong>, atuando com excelência, comprometimento e total conformidade com as exigências legais do setor.</p>
    <p>Para fins de <strong>homologação junto à sua empresa</strong>, seguem em anexo os seguintes documentos:</p>
    <ul style="margin: 15px 0;">
      ${docLabels.map(l => `<li style="margin: 5px 0;">${l}</li>`).join("")}
    </ul>
    <p>Estamos à disposição para quaisquer esclarecimentos ou informações adicionais que se façam necessários.</p>
    <p style="margin-top: 25px;">Atenciosamente,</p>
    <p style="margin: 5px 0;"><strong>Torres Vigilância Patrimonial LTDA</strong></p>
    <p style="color: #666; font-size: 13px; margin: 2px 0;">Tel: (11) 96369-6699</p>
    <p style="color: #666; font-size: 13px; margin: 2px 0;">escolta@torresseguranca.com.br</p>
    <p style="color: #666; font-size: 13px; margin: 2px 0;">www.torresseguranca.com.br</p>
  </div>
  <div style="background: #f5f5f5; padding: 15px 30px; text-align: center; border: 1px solid #e0e0e0; border-top: none;">
    <p style="color: #999; font-size: 11px; margin: 0;">Este e-mail foi enviado automaticamente pelo sistema Torres Gestão.</p>
  </div>
</body>
</html>`;

      await homoTransporter.sendMail({
        from: getSmtpFrom(),
        to: recipientEmail,
        subject: `Documentação para Homologação — Torres Vigilância Patrimonial LTDA`,
        html: htmlBody,
        attachments,
      });

      await supabaseAdmin.from("homologation_logs").insert({
        client_id: clientId,
        client_name: clientName || null,
        recipient_email: recipientEmail,
        recipient_name: recipientName || null,
        documents_sent: docLabels,
        sent_by: sentBy || null,
        status: "enviado",
      });

      res.json({ success: true, message: "E-mail enviado com sucesso" });
    } catch (err: any) {
      console.error("Erro ao enviar e-mail de homologação:", err);
      res.status(500).json({ message: `Erro ao enviar e-mail: ${err.message}` });
    }
  });



  
  return httpServer;
}

  