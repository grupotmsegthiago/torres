import type { Express } from "express";
import { type Server } from "http";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { db } from "./db";
import { eq, desc, asc, sql, and, gte, lte, like, or, ilike } from "drizzle-orm";
import { requireAuth, requireAdminRole, requireDiretoria } from "./auth";
import { supabaseAdmin } from "./supabase";
import {
  insertClientSchema, insertEmployeeSchema, insertVehicleSchema,
  insertServiceOrderSchema, insertTripSchema, insertVehicleMaintenanceSchema,
  insertVehicleFuelingSchema, insertTimesheetSchema, insertMissionPhotoSchema,
  insertEmployeeDocumentSchema, insertWeaponSchema, insertWeaponAssignmentSchema,
  insertVehicleAssignmentSchema, insertGerenciadoraSchema,
  type InsertTelemetryEvent,
  employeeAbsences, employeeFines, employeeTimesheets, employeePayslips,
  employeeDisciplinary, employeeOccurrences, vehicles, vehicleFueling,
  auditLogs, users, loginSelfies, employeeSalaryDiscounts,
  companyDocuments, homologationLogs, missionUpdates,
  referencePoints, insertReferencePointSchema,
  missionPositions, missionPhotos,
  agentLocationHistory, systemSettings,
} from "@shared/schema";
import nodemailer from "nodemailer";
import * as apibrasil from "./apibrasil";
import * as truckscontrol from "./truckscontrol";
import { generateContractPDF } from "./contract-pdf";
import { processTelemetry } from "./telemetry-engine";
import OpenAI from "openai";

function createSmtpTransporter() {
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

function getSmtpFrom() {
  return `"Grupo TM SEG" <${process.env.SMTP_FROM || process.env.SMTP_USER || "adm@grupotmseg.com.br"}>`;
}

const SMTP_BCC_OS = "thiago@grupotmseg.com.br, operacional@grupotmseg.com.br";
const SMTP_BCC_WELCOME = "thiago@grupotmseg.com.br";

const lastMissionPos: Map<number, { lat: number; lng: number }> = new Map();
const lastRecordedPos: Map<number, { lat: number; lng: number; time: number; osId?: number }> = new Map();
const MISSION_POS_MIN_DISTANCE = 50;
const OFF_ROUTE_THRESHOLD_M = 200;
const SMART_INTERVAL_DEFAULT_MS = 10 * 60 * 1000;
const SMART_INTERVAL_FAST_MS = 1 * 60 * 1000;
const SMART_INTERVAL_DISPLACEMENT_M = 500;

async function ensureFinancialOriginColumns() {
  const migrations = [
    "ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS origin_type TEXT DEFAULT 'manual'",
    "ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS origin_id TEXT",
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
  ];

  let ok = false;
  try {
    for (const q of migrations) {
      await supabaseAdmin.rpc("exec_sql", { query: q });
    }
    ok = true;
    console.log("[Financial] All columns ensured via Supabase RPC");
  } catch (rpcErr: any) {
    console.log("[Financial] Supabase RPC failed, trying direct SQL:", rpcErr?.message);
    try {
      for (const q of migrations) {
        await db.execute(sql.raw(q));
      }
      try { await db.execute(sql`NOTIFY pgrst, 'reload schema'`); } catch (_n) {}
      ok = true;
      console.log("[Financial] All columns ensured via direct SQL (fallback)");
    } catch (dbErr: any) {
      console.error("[Financial] CRITICAL: column migration failed:", dbErr?.message);
    }
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
    const { data: billingsToFix } = await supabaseAdmin.from("escort_billings").select("id, service_order_id, vigilante2_id, placa_viatura");
    if (billingsToFix && billingsToFix.length > 0) {
      let fixedV2 = 0, fixedPlate = 0;
      for (const b of billingsToFix) {
        if (!b.service_order_id) continue;
        const so = await storage.getServiceOrder(b.service_order_id);
        if (!so) continue;
        const updates: any = {};
        if (!b.vigilante2_id && so.assignedEmployee2Id) {
          const emp2 = await storage.getEmployee(so.assignedEmployee2Id);
          if (emp2) { updates.vigilante2_id = so.assignedEmployee2Id; updates.vigilante2_name = emp2.name; fixedV2++; }
        }
        if (!b.placa_viatura && so.vehicleId) {
          const veh = await storage.getVehicle(so.vehicleId);
          if (veh?.plate) { updates.placa_viatura = veh.plate; fixedPlate++; }
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

async function syncMissingAutoTransactions() {
  try {
    const { data: existingTx } = await supabaseAdmin.from("financial_transactions").select("origin_type, origin_id");
    const txSet = new Set((existingTx || []).map((t: any) => `${t.origin_type}:${t.origin_id}`));

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
setTimeout(() => syncMissingAutoTransactions(), 5000);

async function createAutoTransaction(params: {
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  due_date: string;
  origin_type: string;
  origin_id: string;
  category_name?: string;
  entity_name?: string;
  created_by?: string;
}) {
  try {
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
      created_by: params.created_by || "SISTEMA",
    }).select().single();
    if (error) console.error("[AutoTransaction] create error:", error.message);
    return data;
  } catch (e: any) {
    console.error("[AutoTransaction] create exception:", e.message);
    return null;
  }
}

async function removeAutoTransaction(origin_type: string, origin_id: string) {
  try {
    const { error } = await supabaseAdmin.from("financial_transactions")
      .delete()
      .eq("origin_type", origin_type)
      .eq("origin_id", origin_id);
    if (error) console.error("[AutoTransaction] remove error:", error.message);
  } catch (e: any) {
    console.error("[AutoTransaction] remove exception:", e.message);
  }
}

function haversineDist(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

function distPointToSegment(pt: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => d * Math.PI / 180;
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
  return Math.sqrt(dLat * dLat + dLng * dLng) * 6371000;
}

function distToPolyline(pt: { lat: number; lng: number }, polyline: { lat: number; lng: number }[]): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) return haversineDist(pt.lat, pt.lng, polyline[0].lat, polyline[0].lng);
  let minDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distPointToSegment(pt, polyline[i], polyline[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function findClosestIndex(pt: { lat: number; lng: number }, polyline: { lat: number; lng: number }[]): number {
  let minDist = Infinity, idx = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distPointToSegment(pt, polyline[i], polyline[i + 1]);
    if (d < minDist) { minDist = d; idx = i + 1; }
  }
  return idx;
}

const MISSION_STEPS = [
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
  "encerrada",
] as const;

const STEP_REQUIRED_PHOTOS: Record<string, string[]> = {
  checkout_armamento: ["arma_pistola_1", "arma_pistola_2", "arma_espingarda"],
  checkout_viatura: ["viatura_frente", "viatura_lateral_esq", "viatura_lateral_dir", "viatura_traseira"],
  checkout_km_saida: ["km_saida"],
  checkin_chegada_km: ["km_chegada", "agente_equipado"],
  checkin_veiculo_escoltado: ["escoltado_frente", "escoltado_traseira"],
  chegada_destino: ["foto_local_destino", "km_final"],
  checkout_km_final: ["km_final"],
  checkout_viatura_retorno: ["viatura_retorno_frente", "viatura_retorno_lateral_esq", "viatura_retorno_lateral_dir", "viatura_retorno_traseira"],
  chegada_base: ["base_viatura_frente", "base_viatura_lateral_esq", "base_viatura_lateral_dir", "base_viatura_traseira", "base_hodometro"],
};

function toSafeUser(user: any) {
  const { password, ...safe } = user;
  return {
    ...safe,
    mustChangePassword: user.mustChangePassword === 1 || user.mustChangePassword === true,
  };
}

const DEFAULT_REPORT_TEMPLATE = `*TORRES VIGILÂNCIA PATRIMONIAL*
*OS {{osNumber}}* | *STATUS:* {{transitStatus}}

🗓 *DATA:* {{date}}    *HORA:* {{time}}
🛡 *OPERAÇÃO:* {{statusLabel}}
🏢 *CLIENTE:* {{clientName}}

📍 *ORIGEM:* {{origin}}
🏁 *DESTINO:* {{destination}}

🚛 *VEÍCULO:* {{driverPlate}}
👤 *MOTORISTA:* {{driverName}}
📞 *CONTATO:* {{driverPhone}}

🚔 *VIATURA:* {{vehiclePlate}}
👮 *AGENTE 01:* {{agent1}}
👮 *AGENTE 02:* {{agent2}}

📈 *PROGRESSO DA MISSÃO:* {{progress}}%
📣 *OCORRÊNCIA:* 🔲 *ETAPA AVANÇADA:* {{etapaAvancada}}
🏙️ *LOCALIZAÇÃO:* {{locationAddr}}{{etaLine}}{{mapsBlock}}`;

async function ensureSystemSettingsTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, "report_template"));
    if (existing.length === 0) {
      await db.insert(systemSettings).values({ key: "report_template", value: DEFAULT_REPORT_TEMPLATE });
    } else if (existing[0].value !== DEFAULT_REPORT_TEMPLATE) {
      await db.update(systemSettings)
        .set({ value: DEFAULT_REPORT_TEMPLATE, updatedAt: new Date() })
        .where(eq(systemSettings.key, "report_template"));
      console.log("[system_settings] report_template atualizado para versão mais recente");
    }
  } catch (e) {
    console.error("[system_settings] init error:", e);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  await ensureSystemSettingsTable();

  try {
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
  } catch (e: any) {
    console.error("[auto-fix] Erro ao corrigir OS travadas:", e.message);
  }

  app.get("/api/system-settings/:key", requireAuth, async (req, res) => {
    try {
      const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, req.params.key));
      if (rows.length === 0) return res.status(404).json({ message: "Setting not found" });
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/system-settings/:key", requireAdminRole, async (req, res) => {
    try {
      const { value } = req.body;
      if (typeof value !== "string") return res.status(400).json({ message: "value must be a string" });
      const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, req.params.key));
      if (existing.length === 0) {
        const result = await db.insert(systemSettings).values({ key: req.params.key, value }).returning();
        return res.json(result[0]);
      }
      const result = await db.update(systemSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(systemSettings.key, req.params.key))
        .returning();
      res.json(result[0]);
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

  app.get("/api/auth/me", requireAuth, (req, res) => {
    const safe = toSafeUser(req.user);
    res.json({ ...safe, termsAcceptedAt: req.user!.termsAcceptedAt || null });
  });

  app.post("/api/auth/accept-terms", requireAuth, async (req, res) => {
    const user = req.user!;
    const ipAddress = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || null;
    const userAgent = req.headers["user-agent"] || null;
    await db.update(users).set({
      termsAcceptedAt: new Date(),
      termsIpAddress: ipAddress,
      termsUserAgent: userAgent,
    }).where(eq(users.id, user.id));

    await db.insert(auditLogs).values({
      userId: user.id,
      userName: user.name || "—",
      userRole: user.role || "—",
      action: "terms_accepted",
      page: "/auth",
      details: `Termo de uso aceito. IP: ${ipAddress}`,
      ipAddress,
      userAgent,
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

    await db.insert(loginSelfies).values({
      userId: user.id,
      employeeId: user.employeeId,
      userName: user.name || "—",
      photoData,
      latitude: latitude || null,
      longitude: longitude || null,
      ipAddress,
      userAgent,
    });

    await db.insert(auditLogs).values({
      userId: user.id,
      userName: user.name || "—",
      userRole: user.role || "—",
      action: "login_selfie",
      page: "/login",
      details: `Selfie de login registrada. IP: ${ipAddress}`,
      ipAddress,
      userAgent,
    });

    res.json({ ok: true });
  });

  app.get("/api/auth/login-selfie-today", requireAuth, async (req, res) => {
    const user = req.user!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await db.select({ id: loginSelfies.id })
      .from(loginSelfies)
      .where(
        and(
          eq(loginSelfies.userId, user.id),
          gte(loginSelfies.createdAt, today)
        )
      )
      .limit(1);

    res.json({ hasSelfieToday: result.length > 0 });
  });

  app.get("/api/admin/login-selfies", requireAuth, async (req, res) => {
    const user = req.user!;
    if (user.role !== "diretoria" && user.role !== "admin") {
      return res.status(403).json({ message: "Acesso restrito" });
    }
    const selfies = await db.select({
      id: loginSelfies.id,
      userId: loginSelfies.userId,
      employeeId: loginSelfies.employeeId,
      userName: loginSelfies.userName,
      latitude: loginSelfies.latitude,
      longitude: loginSelfies.longitude,
      createdAt: loginSelfies.createdAt,
    }).from(loginSelfies).orderBy(sql`created_at DESC`).limit(100);
    res.json(selfies);
  });

  app.get("/api/admin/login-selfie/:id", requireAuth, async (req, res) => {
    const user = req.user!;
    if (user.role !== "diretoria" && user.role !== "admin") {
      return res.status(403).json({ message: "Acesso restrito" });
    }
    const id = parseInt(req.params.id);
    const result = await db.select().from(loginSelfies).where(eq(loginSelfies.id, id)).limit(1);
    if (!result.length) return res.status(404).json({ message: "Selfie não encontrada" });
    res.json(result[0]);
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

    await storage.updateUser(req.user!.id, { mustChangePassword: 0 } as any);

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

  app.get("/api/clients", requireAuth, async (_req, res) => {
    const data = await storage.getClients();
    res.json(data);
  });

  app.get("/api/clients/:id", requireAuth, async (req, res) => {
    const data = await storage.getClient(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Cliente não encontrado" });
    res.json(data);
  });

  app.get("/api/clients/:id/contrato-pdf", requireAuth, async (req, res) => {
    try {
      const client = await storage.getClient(Number(req.params.id));
      if (!client) return res.status(404).json({ message: "Cliente não encontrado" });

      const dateParam = req.query.date as string | undefined;
      let contractDate: string | undefined;
      if (dateParam) {
        const d = new Date(dateParam + "T12:00:00");
        if (!isNaN(d.getTime())) {
          contractDate = d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
        }
      }

      generateContractPDF(res, {
        clientName: client.name,
        clientCnpj: client.cnpj || "_______________",
        clientAddress: client.address || "_______________",
        clientCity: client.city || "_______________",
        clientState: client.state || "__",
        clientZip: client.zip || "________",
        clientContact: client.contactPerson || "_______________",
        contractDate,
      });
    } catch (err: any) {
      console.error("[Contract PDF] Error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Erro ao gerar contrato" });
    }
  });

  app.post("/api/clients", requireAuth, async (req, res) => {
    const parsed = insertClientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.createClient(parsed.data);
    const doc = data.cnpj || data.cpf || "";
    if (doc.replace(/\D/g, "").length >= 11) {
      apibrasil.autoConsultaCliente(doc, req.user!.id).catch(() => {});
    }
    res.status(201).json(data);
  });

  app.patch("/api/clients/:id", requireAuth, async (req, res) => {
    const parsed = insertClientSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.updateClient(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Cliente não encontrado" });
    res.json(data);
  });

  app.delete("/api/clients/:id", requireAuth, requireDiretoria, async (req, res) => {
    const clientId = Number(req.params.id);
    try {
      await supabaseAdmin.from("client_vehicles").delete().eq("client_id", clientId);
      await storage.deleteClient(clientId);
      res.json({ message: "Cliente removido" });
    } catch (err: any) {
      console.error("Erro ao remover cliente:", err.message);
      res.status(500).json({ message: "Erro ao remover. Existem OS ou contratos vinculados a este cliente." });
    }
  });

  app.get("/api/clients/:id/vehicles", requireAuth, async (req, res) => {
    const data = await storage.getClientVehicles(Number(req.params.id));
    res.json(data);
  });

  app.post("/api/clients/:id/vehicles", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    const { plate, model, brand, color, driverName, driverPhone, notes } = req.body;
    if (!plate) return res.status(400).json({ message: "Placa é obrigatória" });
    const existing = await storage.getClientVehicleByPlate(clientId, plate);
    if (existing) return res.status(409).json({ message: "Placa já cadastrada para este cliente", vehicle: existing });
    const data = await storage.createClientVehicle({ clientId, plate: plate.toUpperCase(), model, brand, color, driverName, driverPhone, notes });
    res.status(201).json(data);
  });

  app.patch("/api/client-vehicles/:id", requireAuth, async (req, res) => {
    const existing = await storage.getClientVehicle(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Veículo não encontrado" });
    if (req.body.plate && req.body.plate.toUpperCase() !== existing.plate) {
      const dup = await storage.getClientVehicleByPlate(existing.clientId, req.body.plate.toUpperCase());
      if (dup) return res.status(400).json({ message: "Placa já cadastrada para este cliente" });
    }
    const data = await storage.updateClientVehicle(Number(req.params.id), req.body);
    res.json(data);
  });

  app.delete("/api/client-vehicles/:id", requireAuth, requireDiretoria, async (req, res) => {
    await storage.deleteClientVehicle(Number(req.params.id));
    res.json({ message: "Veículo removido" });
  });

  app.get("/api/employees", requireAuth, async (req, res) => {
    const data = await storage.getEmployees();
    if (req.user!.role !== "diretoria") {
      const sanitized = data.map((e: any) => ({ ...e, blockType: null, blockReason: null }));
      return res.json(sanitized);
    }
    res.json(data);
  });

  app.get("/api/employees/next-matricula", requireAuth, async (_req, res) => {
    const matricula = await storage.getNextMatricula();
    res.json({ matricula });
  });

  app.get("/api/employees/:id", requireAuth, async (req, res) => {
    const data = await storage.getEmployee(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Funcionário não encontrado" });
    if (req.user!.role !== "diretoria") {
      const { blockType, blockReason, ...safe } = data as any;
      return res.json(safe);
    }
    res.json(data);
  });

  app.post("/api/employees", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const body = { ...req.body };
    const dateFields = ["birthDate", "hireDate", "vacationExpiry", "cnhExpiry", "cnvExpiry"];
    for (const f of dateFields) { if (body[f] === "") body[f] = null; }
    const matricula = await storage.getNextMatricula();
    body.matricula = matricula;
    const parsed = insertEmployeeSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.createEmployee(parsed.data);
    if (data.cpf) {
      apibrasil.autoConsultaFuncionario(data.cpf, req.user!.id).catch(() => {});
    }

    let autoUserCreated = false;
    let autoUserError: string | null = null;
    if (data.cpf) {
      const cleanCpf = data.cpf.replace(/\D/g, "");
      if (cleanCpf.length === 11) {
        const syntheticEmail = `cpf_${cleanCpf}@torresseguranca.local`;
        const existingUser = await storage.getUserByEmail(syntheticEmail);
        if (existingUser) {
          autoUserError = "Já existe um login para este CPF";
        } else {
          try {
            const defaultPassword = "torres@123";
            const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
              email: syntheticEmail,
              password: defaultPassword,
              email_confirm: true,
            });
            if (authError) {
              autoUserError = authError.message;
            } else {
              try {
                await storage.createUser({
                  supabaseUid: authData.user.id,
                  email: syntheticEmail,
                  name: data.name,
                  role: "funcionario",
                  employeeId: data.id,
                  mustChangePassword: 1,
                });
                autoUserCreated = true;
              } catch (dbErr: any) {
                await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
                autoUserError = dbErr.message;
              }
            }
          } catch (err: any) {
            autoUserError = err.message;
          }
        }
      }
    }

    res.status(201).json({ ...data, autoUserCreated, autoUserError });
  });

  app.patch("/api/employees/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const body = { ...req.body };
    const dateFields = ["birthDate", "hireDate", "vacationExpiry", "cnhExpiry", "cnvExpiry"];
    for (const f of dateFields) { if (body[f] === "") body[f] = null; }
    delete body.matricula;
    const parsed = insertEmployeeSchema.partial().safeParse(body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.updateEmployee(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Funcionário não encontrado" });
    res.json(data);
  });

  app.delete("/api/employees/:id", requireAuth, requireDiretoria, async (req, res) => {
    const empId = Number(req.params.id);
    try {
      await supabaseAdmin.from("employee_documents").delete().eq("employee_id", empId);
      await supabaseAdmin.from("employee_salaries").delete().eq("employee_id", empId);
      await supabaseAdmin.from("employee_absences").delete().eq("employee_id", empId);
      await supabaseAdmin.from("employee_fines").delete().eq("employee_id", empId);
      await supabaseAdmin.from("employee_disciplinary").delete().eq("employee_id", empId);
      await supabaseAdmin.from("timesheets").delete().eq("employee_id", empId);
      await supabaseAdmin.from("payslips").delete().eq("employee_id", empId);
      await supabaseAdmin.from("weapon_movements").delete().eq("employee_id", empId);
      await supabaseAdmin.from("vehicle_assignments").delete().eq("employee_id", empId);
      await supabaseAdmin.from("mission_updates").delete().eq("employee_id", empId);
      await storage.deleteEmployee(empId);
      res.json({ message: "Funcionário removido" });
    } catch (err: any) {
      console.error("Erro ao remover funcionário:", err.message);
      res.status(500).json({ message: "Erro ao remover funcionário. Verifique se existem OS vinculadas." });
    }
  });

  app.get("/api/employees/:id/salaries", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const salaries = await storage.getEmployeeSalaries(Number(req.params.id));
    res.json(salaries);
  });

  app.post("/api/employees/:id/salaries", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const emp = await storage.getEmployee(Number(req.params.id));
    if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });
    const { baseSalary, effectiveDate, reason, notes } = req.body;
    if (!baseSalary || !effectiveDate) return res.status(400).json({ message: "Salário e data são obrigatórios" });
    const salary = await storage.createEmployeeSalary({
      employeeId: emp.id,
      baseSalary: String(baseSalary),
      effectiveDate,
      reason: reason || null,
      notes: notes || null,
    });
    res.status(201).json(salary);
  });

  app.delete("/api/employee-salaries/:id", requireAuth, requireDiretoria, async (req, res) => {
    await storage.deleteEmployeeSalary(Number(req.params.id));
    res.json({ message: "Registro salarial removido" });
  });

  app.get("/api/employees/:id/salary-discounts", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const empId = Number(req.params.id);
    const month = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const rows = await db.select().from(employeeSalaryDiscounts)
      .where(and(eq(employeeSalaryDiscounts.employeeId, empId), eq(employeeSalaryDiscounts.month, month), eq(employeeSalaryDiscounts.year, year)))
      .orderBy(desc(employeeSalaryDiscounts.createdAt));
    res.json(rows);
  });

  app.post("/api/employees/:id/salary-discounts", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const empId = Number(req.params.id);
    const { month, year, type, description, amount } = req.body;
    if (!type || !description || !amount || !month || !year) return res.status(400).json({ message: "Campos obrigatórios: tipo, descrição, valor, mês e ano" });
    const adminName = req.user!.name || req.user!.username || "Admin";
    const [row] = await db.insert(employeeSalaryDiscounts).values({
      employeeId: empId, month: Number(month), year: Number(year),
      type, description, amount: String(amount), createdBy: adminName,
    }).returning();
    res.status(201).json(row);
  });

  app.delete("/api/salary-discounts/:id", requireAuth, requireDiretoria, async (req, res) => {
    await db.delete(employeeSalaryDiscounts).where(eq(employeeSalaryDiscounts.id, Number(req.params.id)));
    res.json({ ok: true });
  });

  app.get("/api/employees/:id/salary-summary", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    try {
      const empId = Number(req.params.id);
      const month = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
      const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
      const emp = await storage.getEmployee(empId);
      if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });

      const CCT = { salarioBase: 2432.50, periculosidadePct: 30, valeRefeicaoDia: 40.00, cestaBasica: 208.45, diasUteisMes: 22 };
      const periculosidade = CCT.salarioBase * (CCT.periculosidadePct / 100);
      const valeRefeicaoMes = CCT.valeRefeicaoDia * CCT.diasUteisMes;
      const totalBruto = CCT.salarioBase + periculosidade + valeRefeicaoMes + CCT.cestaBasica;

      let proporcional = false;
      let diasTrabalhados = 30;
      let fatorProporcional = 1;
      if (emp.hireDate) {
        const hire = new Date(emp.hireDate);
        const hireMonth = hire.getMonth() + 1;
        const hireYear = hire.getFullYear();
        if (hireYear === year && hireMonth === month) {
          const hireDay = hire.getDate();
          const daysInMonth = new Date(year, month, 0).getDate();
          diasTrabalhados = daysInMonth - hireDay + 1;
          fatorProporcional = diasTrabalhados / 30;
          proporcional = true;
        }
      }

      const salarioProporcional = +(CCT.salarioBase * fatorProporcional).toFixed(2);
      const periculosidadeProporcional = +(periculosidade * fatorProporcional).toFixed(2);
      const vrProporcional = +(valeRefeicaoMes * fatorProporcional).toFixed(2);
      const cestaProporcional = +(CCT.cestaBasica * fatorProporcional).toFixed(2);
      const totalVencimentos = +(salarioProporcional + periculosidadeProporcional + vrProporcional + cestaProporcional).toFixed(2);

      const discounts = await db.select().from(employeeSalaryDiscounts)
        .where(and(eq(employeeSalaryDiscounts.employeeId, empId), eq(employeeSalaryDiscounts.month, month), eq(employeeSalaryDiscounts.year, year)));
      const totalDescontos = discounts.reduce((sum, d) => sum + Number(d.amount), 0);
      const liquido = +(totalVencimentos - totalDescontos).toFixed(2);

      res.json({
        employee: { id: emp.id, name: emp.name, matricula: emp.matricula, role: emp.role, hireDate: emp.hireDate, cpf: emp.cpf },
        month, year, proporcional, diasTrabalhados, fatorProporcional,
        vencimentos: {
          salarioBase: salarioProporcional,
          periculosidade: periculosidadeProporcional,
          valeRefeicao: vrProporcional,
          cestaBasica: cestaProporcional,
          total: totalVencimentos,
        },
        descontos: discounts.map(d => ({ id: d.id, type: d.type, description: d.description, amount: Number(d.amount), createdBy: d.createdBy, createdAt: d.createdAt })),
        totalDescontos,
        liquido,
        cctRef: { salarioBase: CCT.salarioBase, periculosidadePct: CCT.periculosidadePct, valeRefeicaoDia: CCT.valeRefeicaoDia, cestaBasica: CCT.cestaBasica, totalBruto },
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/payroll/sync-financial", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const month = Number(req.body.month) || new Date().getMonth() + 1;
      const year = Number(req.body.year) || new Date().getFullYear();
      const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
      const mesLabel = MESES[month - 1];

      const allEmployees = await storage.getEmployees();
      const activeEmployees = allEmployees.filter((e: any) => e.status === "ativo" && (e.role?.toLowerCase().includes("vigilante") || e.role?.toLowerCase().includes("escolta")));

      const CCT = { salarioBase: 2432.50, periculosidadePct: 30, valeRefeicaoDia: 40.00, cestaBasica: 208.45, diasUteisMes: 22 };
      const periculosidade = CCT.salarioBase * (CCT.periculosidadePct / 100);
      const valeRefeicaoMes = CCT.valeRefeicaoDia * CCT.diasUteisMes;
      const totalBruto = CCT.salarioBase + periculosidade + valeRefeicaoMes + CCT.cestaBasica;

      const dueDate = `${year}-${String(month).padStart(2, "0")}-05`;
      let created = 0;
      let skipped = 0;

      for (const emp of activeEmployees) {
        const originId = `payroll-${emp.id}-${year}-${month}`;

        const { data: existing } = await supabaseAdmin.from("financial_transactions")
          .select("id").eq("origin_type", "payroll").eq("origin_id", originId).limit(1);
        if (existing && existing.length > 0) { skipped++; continue; }

        let fatorProporcional = 1;
        let diasTrabalhados = 30;
        if (emp.hireDate) {
          const hire = new Date(emp.hireDate);
          if (hire.getFullYear() === year && hire.getMonth() + 1 === month) {
            const hireDay = hire.getDate();
            const daysInMonth = new Date(year, month, 0).getDate();
            diasTrabalhados = daysInMonth - hireDay + 1;
            fatorProporcional = diasTrabalhados / 30;
          }
        }

        const discounts = await db.select().from(employeeSalaryDiscounts)
          .where(and(eq(employeeSalaryDiscounts.employeeId, emp.id), eq(employeeSalaryDiscounts.month, month), eq(employeeSalaryDiscounts.year, year)));
        const totalDescontos = discounts.reduce((sum, d) => sum + Number(d.amount), 0);
        const liquido = +((totalBruto * fatorProporcional) - totalDescontos).toFixed(2);

        await createAutoTransaction({
          description: `FOLHA DE PAGAMENTO - ${emp.name?.toUpperCase()} - ${mesLabel.toUpperCase()}/${year}`,
          amount: Math.max(0, liquido),
          type: "EXPENSE",
          due_date: dueDate,
          origin_type: "payroll",
          origin_id: originId,
          category_name: "Recursos Humanos",
          entity_name: emp.name || "",
          created_by: req.user!.name || req.user!.username || "SISTEMA",
        });
        created++;
      }

      res.json({ message: `Folha sincronizada: ${created} lançamento(s) criado(s), ${skipped} já existente(s)`, created, skipped });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/employees/apply-cct-kit", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const CCT = { salarioBase: 2432.50, periculosidadePct: 30, valeRefeicaoDia: 43.00, cestaBasica: 208.45, diasUteisMes: 22 };
      const allEmployees = await storage.getEmployees();
      const vigilantes = allEmployees.filter((e: any) => e.status === "ativo" && (e.role?.toLowerCase().includes("vigilante") || e.role?.toLowerCase().includes("escolta")));
      const effectiveDate = req.body.effectiveDate || new Date().toISOString().slice(0, 10);
      const reason = `Kit CCT SP 2025/2026 (Base R$${CCT.salarioBase.toFixed(2)} + Periculosidade ${CCT.periculosidadePct}% R$${(CCT.salarioBase * CCT.periculosidadePct / 100).toFixed(2)} + VR R$${CCT.valeRefeicaoDia}/dia + Cesta R$${CCT.cestaBasica})`;
      let count = 0;
      for (const emp of vigilantes) {
        await storage.createEmployeeSalary({
          employeeId: emp.id,
          baseSalary: String(CCT.salarioBase),
          effectiveDate,
          reason,
          notes: `Pgto 5º dia útil | Periculosidade: R$${(CCT.salarioBase * CCT.periculosidadePct / 100).toFixed(2)} | VR: R$${(CCT.valeRefeicaoDia * CCT.diasUteisMes).toFixed(2)}/mês | Cesta: R$${CCT.cestaBasica}`,
        });
        count++;
      }
      res.json({ message: `Kit CCT aplicado para ${count} vigilante(s)`, count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const CCT_CONFIG = {
    salarioBase: 2432.50, periculosidadePct: 30, valeRefeicaoDia: 40.00,
    cestaBasica: 208.45, diasUteisMes: 22, encargosSociaisPct: 80,
    horaExtraValor: 22.99,
  };

  app.get("/api/employees/monthly-hours", requireAuth, async (req, res) => {
    try {
      const month = Number(req.query.month) || new Date().getMonth() + 1;
      const year = Number(req.query.year) || new Date().getFullYear();
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endMonth = month === 12 ? 1 : month + 1;
      const endYear = month === 12 ? year + 1 : year;
      const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

      const { data: billings } = await supabaseAdmin
        .from("escort_billings")
        .select("service_order_id, horas_trabalhadas, horas_missao")
        .gte("data_missao", startDate)
        .lt("data_missao", endDate);

      const sos = await storage.getServiceOrders();
      const relevantOsIds = new Set((billings || []).map((b: any) => b.service_order_id));
      const osMap = new Map<number, any>();
      for (const os of sos) {
        if (relevantOsIds.has(os.id)) osMap.set(os.id, os);
      }

      const employeeHours: Record<number, { totalHours: number; missions: number }> = {};
      for (const b of (billings || [])) {
        const os = osMap.get(b.service_order_id);
        if (!os) continue;
        const hours = Number(b.horas_trabalhadas || b.horas_missao || 0);
        for (const empId of [os.assignedEmployeeId, os.assignedEmployee2Id]) {
          if (!empId) continue;
          if (!employeeHours[empId]) employeeHours[empId] = { totalHours: 0, missions: 0 };
          employeeHours[empId].totalHours += hours;
          employeeHours[empId].missions += 1;
        }
      }

      res.json(employeeHours);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/employees/:id/cost-detail", requireAuth, async (req, res) => {
    try {
      const empId = Number(req.params.id);
      const emp = await storage.getEmployee(empId);
      if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });

      const month = Number(req.query.month) || new Date().getMonth() + 1;
      const year = Number(req.query.year) || new Date().getFullYear();
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endMonth = month === 12 ? 1 : month + 1;
      const endYear = month === 12 ? year + 1 : year;
      const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

      const { data: billings } = await supabaseAdmin
        .from("escort_billings")
        .select("service_order_id, horas_trabalhadas, horas_missao, data_missao")
        .gte("data_missao", startDate)
        .lt("data_missao", endDate);

      const sos = await storage.getServiceOrders();
      let totalHours = 0;
      let missions = 0;
      const missionDetails: any[] = [];
      for (const b of (billings || [])) {
        const os = sos.find((o: any) => o.id === b.service_order_id);
        if (!os) continue;
        if (os.assignedEmployeeId !== empId && os.assignedEmployee2Id !== empId) continue;
        const hours = Number(b.horas_trabalhadas || b.horas_missao || 0);
        totalHours += hours;
        missions++;
        missionDetails.push({ osNumber: os.osNumber, date: b.data_missao, hours });
      }

      const salarioBase = CCT_CONFIG.salarioBase;
      const periculosidade = salarioBase * (CCT_CONFIG.periculosidadePct / 100);
      const salarioComPeric = salarioBase + periculosidade;
      const horasContratuais = 220;
      const horasExtras = Math.max(0, totalHours - horasContratuais);
      const custoHorasExtras = horasExtras * CCT_CONFIG.horaExtraValor;
      const dsrHorasExtras = horasExtras > 0 ? (custoHorasExtras / 6) : 0;
      const subtotalRemuneracao = salarioComPeric + custoHorasExtras + dsrHorasExtras;
      const encargos = subtotalRemuneracao * (CCT_CONFIG.encargosSociaisPct / 100);
      const valeRefeicao = CCT_CONFIG.valeRefeicaoDia * CCT_CONFIG.diasUteisMes;
      const cestaBasica = CCT_CONFIG.cestaBasica;
      const totalBeneficios = valeRefeicao + cestaBasica;
      const custoTotal = subtotalRemuneracao + encargos + totalBeneficios;

      res.json({
        employee: { id: emp.id, name: emp.name, role: emp.role },
        month, year,
        totalHours: Math.round(totalHours * 100) / 100,
        missions,
        missionDetails,
        breakdown: {
          salarioBase, periculosidade, salarioComPeric,
          horasContratuais, horasExtras: Math.round(horasExtras * 100) / 100,
          custoHorasExtras: Math.round(custoHorasExtras * 100) / 100,
          dsrHorasExtras: Math.round(dsrHorasExtras * 100) / 100,
          subtotalRemuneracao: Math.round(subtotalRemuneracao * 100) / 100,
          encargosSociaisPct: CCT_CONFIG.encargosSociaisPct,
          encargos: Math.round(encargos * 100) / 100,
          valeRefeicao, cestaBasica, totalBeneficios,
          custoTotal: Math.round(custoTotal * 100) / 100,
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/cpf-lookup/:cpf", requireAuth, async (req, res) => {
    const cpf = String(req.params.cpf).replace(/\D/g, "");
    if (cpf.length !== 11) return res.status(400).json({ message: "CPF inválido" });

    try {
      const response = await fetch(`https://brasilapi.com.br/api/cpf/v1/${cpf}`);
      if (response.ok) {
        const data = await response.json();
        const normalized: Record<string, string> = {};
        if (data.nome) normalized.nome = data.nome;
        if (data.data_nascimento) normalized.data_nascimento = data.data_nascimento;
        if (data.nome_mae) normalized.nome_mae = data.nome_mae;
        if (data.situacao) normalized.situacao = data.situacao;
        return res.json(normalized);
      }
    } catch {}

    return res.status(404).json({ message: "CPF não encontrado nas bases públicas. Use o Cadastro Inteligente para preencher os dados via documento." });
  });

  app.post("/api/employees/ocr", requireAdminRole, async (req, res) => {
    try {
      const { imageData } = req.body;
      if (!imageData || typeof imageData !== "string") {
        return res.status(400).json({ message: "Envie imageData (base64 data URL da imagem)" });
      }

      console.log(`[ocr] Employee OCR request received, imageData length: ${imageData.length}, user: ${req.user?.email}`);

      const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

      if (!apiKey) {
        console.error("[ocr] AI_INTEGRATIONS_OPENAI_API_KEY not set");
        return res.status(500).json({ message: "Chave de API de IA não configurada" });
      }

      const openai = new OpenAI({ apiKey, baseURL });

      console.log("[ocr] Sending to OpenAI...");
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `Você é um sistema especializado em extrair dados de documentos brasileiros de identificação pessoal (RG, CNH, CPF, CNV, CTPS, Certificado de Reservista, comprovantes de residência, etc).
Extraia os seguintes campos do documento e retorne APENAS um JSON válido (sem markdown, sem texto extra):
{
  "name": "nome completo da pessoa",
  "cpf": "CPF no formato 000.000.000-00",
  "rg": "número do RG com órgão emissor",
  "cnhNumber": "número da CNH se for CNH",
  "birthDate": "data de nascimento no formato YYYY-MM-DD",
  "motherName": "nome da mãe",
  "fatherName": "nome do pai",
  "nationality": "nacionalidade (ex: Brasileira)",
  "maritalStatus": "estado civil se visível",
  "address": "endereço completo se visível no documento",
  "notes": "tipo do documento identificado e informações adicionais relevantes"
}
Se um campo não for encontrado no documento, retorne string vazia "". Nunca invente dados.
Para datas, sempre converta para o formato YYYY-MM-DD.
Para CPF, formate como 000.000.000-00.`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os dados pessoais deste documento de identificação brasileiro:" },
              { type: "image_url", image_url: { url: imageData } },
            ],
          },
        ],
      });

      const text = response.choices?.[0]?.message?.content || "";
      console.log("[ocr] OpenAI raw response:", text.substring(0, 500));
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      console.log("[ocr] Parsed result:", JSON.stringify(parsed));
      res.json(parsed);
    } catch (err: any) {
      console.error("[ocr] Employee OCR error:", err.message || err);
      res.status(500).json({ message: "Erro ao processar documento: " + (err.message || "Erro desconhecido") });
    }
  });

  app.post("/api/employees/ocr-document", requireAdminRole, async (req, res) => {
    try {
      const { imageData, docType } = req.body;
      if (!imageData || typeof imageData !== "string") {
        return res.status(400).json({ message: "Envie imageData (base64 data URL)" });
      }

      const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
      if (!apiKey) return res.status(500).json({ message: "Chave de API de IA não configurada" });

      const openai = new OpenAI({ apiKey, baseURL });

      const systemPrompt = `Você é um sistema especializado em extrair dados de documentos brasileiros.
O documento sendo analisado é do tipo: "${docType || 'Documento geral'}".
Extraia os seguintes campos e retorne APENAS um JSON válido (sem markdown):
{
  "documentNumber": "número do documento (registro, matrícula, protocolo, nº CNH, etc)",
  "issueDate": "data de emissão no formato YYYY-MM-DD",
  "expiryDate": "data de validade no formato YYYY-MM-DD",
  "notes": "tipo do documento identificado e informações relevantes (nome do titular, órgão emissor, categoria CNH, etc)"
}
Se um campo não for encontrado, retorne string vazia "". Nunca invente dados.
Para datas, converta para YYYY-MM-DD. Se só houver ano, use YYYY-01-01.`;

      const isPdf = imageData.startsWith("data:application/pdf");
      let messages: any[];

      if (isPdf) {
        const base64Content = imageData.split(",")[1];
        const pdfBuffer = Buffer.from(base64Content, "base64");

        let pdfText = "";
        try {
          const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
          const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
          const numPages = Math.min(doc.numPages, 3);
          for (let i = 1; i <= numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            pdfText += content.items.map((item: any) => item.str).join(" ") + "\n";
          }
        } catch (pdfErr: any) {
          console.error("[ocr-document] PDF text extraction error:", pdfErr.message);
          pdfText = "Não foi possível extrair texto do PDF";
        }

        console.log(`[ocr-document] PDF text extracted (${pdfText.length} chars): ${pdfText.substring(0, 300)}...`);

        messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extraia os dados deste documento (${docType || "documento"}). Texto extraído do PDF:\n\n${pdfText}` },
        ];
      } else {
        messages = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: `Extraia os dados deste documento (${docType || "documento"}):` },
              { type: "image_url", image_url: { url: imageData } },
            ],
          },
        ];
      }

      const response = await openai.chat.completions.create({
        model: isPdf ? "gpt-5-mini" : "gpt-5-mini",
        messages,
      });

      const text = response.choices?.[0]?.message?.content || "";
      console.log("[ocr-document] AI response:", text.substring(0, 300));
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      res.json(parsed);
    } catch (err: any) {
      console.error("[ocr-document] Error:", err.message || err);
      res.status(500).json({ message: "Erro ao processar documento" });
    }
  });

  app.get("/api/vehicles", requireAuth, async (_req, res) => {
    const data = await storage.getVehicles();
    res.json(data);
  });

  app.get("/api/vehicles/:id", requireAuth, async (req, res) => {
    const data = await storage.getVehicle(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Veículo não encontrado" });
    res.json(data);
  });

  app.post("/api/vehicles", requireAuth, async (req, res) => {
    const parsed = insertVehicleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.createVehicle(parsed.data);
    if (data.plate) {
      apibrasil.autoConsultaVeiculo(data.plate, req.user!.id).catch(() => {});
    }
    res.status(201).json(data);
  });

  app.patch("/api/vehicles/:id", requireAuth, async (req, res) => {
    const parsed = insertVehicleSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.updateVehicle(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Veículo não encontrado" });
    res.json(data);
  });

  app.patch("/api/vehicles/:id/km", requireAuth, async (req, res) => {
    const { km, initialKm } = req.body;
    const updates: any = {};
    if (km !== undefined) updates.km = Number(km);
    if (initialKm !== undefined) updates.initialKm = Number(initialKm);
    updates.lastKmUpdate = new Date();
    const vehicle = await storage.getVehicle(Number(req.params.id));
    if (vehicle && km !== undefined) {
      const lastOilKm = (vehicle as any).lastOilChangeKm || 0;
      const kmRodados = Number(km) - lastOilKm;
      if (kmRodados >= 9000 && vehicle.status !== "manutenção") {
        updates.status = "manutenção";
        console.log(`[auto-maint] Vehicle ${vehicle.plate} reached ${kmRodados} km since last oil change, auto-set to manutenção`);
      }
    }
    const data = await storage.updateVehicle(Number(req.params.id), updates);
    if (!data) return res.status(404).json({ message: "Veículo não encontrado" });
    res.json(data);
  });

  app.delete("/api/vehicles/:id", requireAuth, requireDiretoria, async (req, res) => {
    const vehId = Number(req.params.id);
    try {
      await supabaseAdmin.from("vehicle_assignments").delete().eq("vehicle_id", vehId);
      await storage.deleteVehicle(vehId);
      res.json({ message: "Veículo removido" });
    } catch (err: any) {
      console.error("Erro ao remover veículo:", err.message);
      res.status(500).json({ message: "Erro ao remover. Existem OS vinculadas a este veículo." });
    }
  });

  app.get("/api/service-orders", requireAuth, async (_req, res) => {
    const data = await storage.getServiceOrders();
    const enriched = await Promise.all(data.map(async (os) => {
      const photos = await storage.getMissionPhotosByOS(os.id);
      const findLast = (step: string) => {
        for (let i = photos.length - 1; i >= 0; i--) {
          if (photos[i].step === step) return photos[i];
        }
        return undefined;
      };
      const kmSaida = photos.find(p => p.step === "km_saida");
      const kmChegada = findLast("km_chegada");
      const kmFinal = findLast("km_final");
      const baseHodometro = findLast("base_hodometro");
      return {
        ...os,
        missionKm: {
          saida_base: kmSaida?.kmValue ?? null,
          chegada_origem: kmChegada?.kmValue ?? null,
          chegada_destino: kmFinal?.kmValue ?? null,
          fim_missao: baseHodometro?.kmValue ?? kmFinal?.kmValue ?? null,
        },
      };
    }));
    res.json(enriched);
  });

  app.get("/api/boletim-medicao/os-concluidas", requireAuth, async (_req, res) => {
    try {
      const allOrders = await storage.getServiceOrders();
      const concluidas = allOrders.filter(o =>
        o.status === "concluida" || o.missionStatus === "encerrada" ||
        o.status === "em_andamento" || (o.status === "agendada" && o.missionStartedAt) ||
        o.status === "cancelada"
      );

      const enriched = await Promise.all(concluidas.map(async (os) => {
        const [client, vehicle, emp1, emp2, kit] = await Promise.all([
          os.clientId ? storage.getClient(os.clientId) : null,
          os.vehicleId ? storage.getVehicle(os.vehicleId) : null,
          os.assignedEmployeeId ? storage.getEmployee(os.assignedEmployeeId) : null,
          os.assignedEmployee2Id ? storage.getEmployee(os.assignedEmployee2Id) : null,
          os.kitId ? storage.getWeaponKit(os.kitId) : null,
        ]);

        const photos = await storage.getMissionPhotosByOS(os.id);
        const kmSaidaPhoto = [...photos].reverse().find(p => p.step === "km_saida");
        const kmChegadaPhoto = [...photos].reverse().find(p => p.step === "km_chegada");
        const kmFinalPhoto = [...photos].reverse().find(p => p.step === "km_final");

        const stepLogs = (os.stepLogs || []) as any[];
        const getLogTime = (steps: string[]) => {
          for (const s of steps) {
            const entry = [...stepLogs].reverse().find((l: any) => l.step === s && l.timestamp);
            if (entry) return entry.timestamp;
          }
          return null;
        };
        const horaChegadaOrigem = getLogTime(["checkin_chegada_km", "em_transito_origem"]);
        const horaFimMissao = os.completedDate || getLogTime(["encerrada", "finalizada", "checkout_km_final"]);

        const { data: billing } = await supabaseAdmin.from("escort_billings")
          .select("*").eq("service_order_id", os.id).limit(1);

        let clientContract: any = null;
        if (os.escortContractId) {
          const { data: contracts } = await supabaseAdmin.from("escort_contracts")
            .select("*").eq("id", os.escortContractId).limit(1);
          if (contracts?.length) clientContract = contracts[0];
        } else if (os.clientId) {
          const { data: contracts } = await supabaseAdmin.from("escort_contracts")
            .select("*").eq("client_id", os.clientId).eq("status", "Ativo").limit(1);
          if (contracts?.length) clientContract = contracts[0];
        }

        return {
          ...os,
          clientName: client?.name || "—",
          clientCnpj: client?.cnpj || null,
          vehiclePlate: vehicle?.plate || null,
          vehicleModel: vehicle?.model || null,
          employee1Name: emp1?.name || null,
          employee2Name: emp2?.name || null,
          kitName: kit?.name || null,
          km_inicial: kmChegadaPhoto?.kmValue || kmSaidaPhoto?.kmValue || 0,
          km_chegada_origem: kmChegadaPhoto?.kmValue || null,
          km_final: kmFinalPhoto?.kmValue || 0,
          km_total: (kmFinalPhoto?.kmValue || 0) - (kmChegadaPhoto?.kmValue || kmSaidaPhoto?.kmValue || 0),
          hora_chegada_origem: horaChegadaOrigem,
          hora_fim_missao: horaFimMissao,
          billing: billing?.[0] || null,
          hasContract: !!clientContract,
          contractId: clientContract?.id || null,
          contractValues: clientContract ? {
            valor_km_carregado: clientContract.valor_km_carregado,
            franquia_minima_km: clientContract.franquia_minima_km,
          } : null,
        };
      }));

      res.json(enriched);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/boletim-medicao/calcular/:osId", requireAdminRole, async (req, res) => {
    try {
      const serviceOrderId = Number(req.params.osId);
      const so = await storage.getServiceOrder(serviceOrderId);
      if (!so) return res.status(404).json({ message: "OS nao encontrada" });

      const isLive = so.status !== "concluida" && so.missionStatus !== "encerrada";

      const { data: existing } = await supabaseAdmin.from("escort_billings")
        .select("id, status").eq("service_order_id", serviceOrderId).limit(1);
      const existingBilling = existing?.[0];
      const canRecalculate = !existingBilling || existingBilling.status === "REJEITADA" || existingBilling.status === "A_VERIFICAR" || isLive;
      if (!canRecalculate) return res.status(400).json({ message: "Billing já aprovado — não pode ser recalculado" });
      if (existingBilling) {
        await supabaseAdmin.from("escort_billings").delete().eq("service_order_id", serviceOrderId);
      }

      const photos = await storage.getMissionPhotosByOS(serviceOrderId);
      const kmSaidaPhoto = photos.find((p: any) => p.step === "km_saida");
      const kmChegadaPhoto = [...photos].reverse().find((p: any) => p.step === "km_chegada");
      const kmFinalPhoto = photos.find((p: any) => p.step === "km_final");
      const kmInicial = kmChegadaPhoto?.kmValue || kmSaidaPhoto?.kmValue || 0;
      const kmFinal = kmFinalPhoto?.kmValue || 0;

      const toBRT = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
      const scheduledTime = so.scheduledDate ? toBRT(new Date(so.scheduledDate)) : undefined;
      const startTime = so.missionStartedAt ? toBRT(new Date(so.missionStartedAt as string)) : undefined;
      const completedDateValid = so.completedDate && new Date(so.completedDate as string).getFullYear() > 2000;
      const endTime = completedDateValid ? toBRT(new Date(so.completedDate as string)) : (isLive ? toBRT(new Date()) : undefined);

      let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };

      if (so.escortContractId) {
        const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", so.escortContractId).limit(1);
        if (cc?.length) contrato = cc[0];
      } else if (so.clientId) {
        const { data: clientContracts } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.clientId).eq("status", "Ativo").limit(1);
        if (clientContracts?.length) contrato = clientContracts[0];
      }

      const kmFinalNorm = kmFinal > kmInicial ? kmFinal : kmInicial;
      console.log(`[CALCULAR] OS ${so.osNumber}: contrato.valor_acionamento=${contrato.valor_acionamento}, contrato.valor_km_carregado=${contrato.valor_km_carregado}, contrato.franquia_km=${contrato.franquia_km}, contrato.franquia_horas=${contrato.franquia_horas}, kmInicial=${kmInicial}, kmFinal=${kmFinalNorm}, startTime=${startTime}, endTime=${endTime}, scheduledTime=${scheduledTime}`);
      const resultado = calcularEscolta({
        km_inicial: kmInicial, km_final: kmFinalNorm, km_vazio: 0,
        horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
        horario_inicio: startTime, horario_fim: endTime, horario_agendado: scheduledTime,
        despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0, contrato,
      });
      console.log(`[CALCULAR] OS ${so.osNumber}: resultado.fat_total=${resultado.fat_total}, resultado.fat_acionamento=${resultado.fat_acionamento}, resultado.modelo_acionamento=${resultado.modelo_acionamento}, resultado.km_total=${resultado.km_total}`);

      const client = so.clientId ? await storage.getClient(so.clientId) : null;
      const emp = so.assignedEmployeeId ? await storage.getEmployee(so.assignedEmployeeId) : null;
      const emp2 = (so as any).assignedEmployee2Id ? await storage.getEmployee((so as any).assignedEmployee2Id) : null;
      const user = req.user!;

      const n = (v: any) => Number(v) || 0;
      const { data, error } = await supabaseAdmin.from("escort_billings").insert({
        service_order_id: serviceOrderId,
        client_id: so.clientId, client_name: client?.name || "--",
        contract_id: contrato.id || null,
        km_inicial: n(kmInicial), km_final: n(kmFinalNorm), km_vazio: 0,
        km_carregado: n(resultado.km_carregado), km_total: n(resultado.km_total),
        km_faturado: n(resultado.km_faturado), km_franquia: n(resultado.km_franquia),
        km_excedente: n(resultado.km_excedente),
        horario_agendado: scheduledTime || null,
        horario_inicio: startTime || null, horario_fim: endTime || null,
        horario_inicio_considerado: resultado.horario_inicio_considerado,
        horas_missao: n(resultado.horas_trabalhadas), horas_trabalhadas: n(resultado.horas_trabalhadas),
        horas_estadia: 0, teve_pernoite: false, is_noturno: resultado.is_noturno,
        fat_acionamento: n(resultado.fat_acionamento), fat_hora_extra: n(resultado.fat_hora_extra),
        fat_km: n(resultado.fat_km), fat_km_carregado: n(resultado.faturamento.km_carregado),
        fat_km_vazio: n(resultado.faturamento.km_vazio),
        fat_estadia: n(resultado.fat_estadia), fat_pernoite: n(resultado.fat_pernoite),
        fat_diaria: n(resultado.fat_pernoite), fat_adicional_noturno: n(resultado.fat_adicional_noturno),
        fat_total: n(resultado.fat_total),
        valor_franquia: n(resultado.valor_franquia), valor_km_extra: n(resultado.valor_km_extra),
        pag_vrp: n(resultado.pag_vrp), pag_periculosidade: n(resultado.pag_periculosidade),
        pag_adicional_noturno: n(resultado.pag_adicional_noturno),
        pag_reembolsos: n(resultado.pag_reembolsos), pag_total: n(resultado.pag_total),
        resultado_bruto: n(resultado.resultado.bruto), resultado_liquido: n(resultado.resultado.liquido),
        margem_percentual: n(resultado.resultado.margem_pct),
        vigilante_id: so.assignedEmployeeId, vigilante_name: emp?.name || user.name,
        vigilante2_id: (so as any).assignedEmployee2Id || null, vigilante2_name: emp2?.name || null,
        os_number: so.osNumber || null,
        origem: so.origin || null, destino: so.destination || null,
        placa_viatura: so.vehicleId ? (await storage.getVehicle(so.vehicleId))?.plate || null : null,
        placa_escoltado: (so as any).escortedVehiclePlate || null,
        motorista_escoltado: (so as any).escortedDriverName || null,
        data_missao: so.scheduledDate || new Date().toISOString(),
        status: "A_VERIFICAR", created_by: user.name,
      }).select().single();
      if (error) throw error;

      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/boletim-medicao/os/:id/diretoria-override", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "diretoria") {
        return res.status(403).json({ message: "Apenas diretoria pode alterar esses campos" });
      }
      const osId = Number(req.params.id);
      const so = await storage.getServiceOrder(osId);
      if (!so) return res.status(404).json({ message: "OS não encontrada" });

      const { data: existingBilling } = await supabaseAdmin.from("escort_billings")
        .select("status").eq("service_order_id", osId).limit(1);

      if (existingBilling?.[0] && ["APROVADA", "FATURADO", "PAGO"].includes(existingBilling[0].status)) {
        return res.status(403).json({ message: "Boletim aprovado — valores travados. Não é possível alterar." });
      }

      const { completedDate, hora_chegada_origem, km_chegada_origem, km_fim_missao } = req.body;

      const updates: any = {};
      if (completedDate !== undefined) updates.completedDate = completedDate ? new Date(completedDate) : null;

      if (Object.keys(updates).length > 0) {
        await storage.updateServiceOrder(osId, updates);
      }

      if (km_chegada_origem !== undefined && km_chegada_origem !== null) {
        const photos = await storage.getMissionPhotosByOS(osId);
        const existing = [...photos].reverse().find(p => p.step === "km_chegada");
        if (existing) {
          await db.execute(sql`UPDATE mission_photos SET km_value = ${Number(km_chegada_origem)} WHERE id = ${existing.id}`);
        } else {
          await db.execute(sql`INSERT INTO mission_photos (service_order_id, employee_id, step, photo_data, km_value, notes) VALUES (${osId}, ${0}, ${"km_chegada"}, ${"[ajuste-manual]"}, ${Number(km_chegada_origem)}, ${"Ajuste Manual"})`);
        }
      }

      if (km_fim_missao !== undefined && km_fim_missao !== null) {
        const photos = await storage.getMissionPhotosByOS(osId);
        const existing = [...photos].reverse().find(p => p.step === "km_final");
        if (existing) {
          await db.execute(sql`UPDATE mission_photos SET km_value = ${Number(km_fim_missao)} WHERE id = ${existing.id}`);
        } else {
          await db.execute(sql`INSERT INTO mission_photos (service_order_id, employee_id, step, photo_data, km_value, notes) VALUES (${osId}, ${0}, ${"km_final"}, ${"[ajuste-manual]"}, ${Number(km_fim_missao)}, ${"Ajuste Manual"})`);
        }
      }

      if (hora_chegada_origem !== undefined) {
        const currentLogs = ((so.stepLogs || []) as any[]).slice();
        const existingIdx = currentLogs.findIndex((l: any) => l.step === "checkin_chegada_km");
        if (existingIdx >= 0) {
          currentLogs[existingIdx] = { ...currentLogs[existingIdx], timestamp: hora_chegada_origem };
        } else if (hora_chegada_origem) {
          currentLogs.push({ step: "checkin_chegada_km", timestamp: hora_chegada_origem });
        }
        await storage.updateServiceOrder(osId, { stepLogs: currentLogs });
      }

      if (existingBilling?.[0] && existingBilling[0].status === "A_VERIFICAR") {
        const updatedSo = await storage.getServiceOrder(osId);
        if (updatedSo) {
          const phs = await storage.getMissionPhotosByOS(osId);
          const kmSP = [...phs].reverse().find((p: any) => p.step === "km_saida");
          const kmCP = [...phs].reverse().find((p: any) => p.step === "km_chegada");
          const kmFP = [...phs].reverse().find((p: any) => p.step === "km_final");
          const kmI = kmCP?.kmValue || kmSP?.kmValue || 0;
          const kmF = kmFP?.kmValue || 0;
          const toBRT = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
          const sTime = updatedSo.scheduledDate ? toBRT(new Date(updatedSo.scheduledDate)) : undefined;

          const updatedLogs = (updatedSo.stepLogs || []) as any[];
          const checkinEntry = [...updatedLogs].reverse().find((l: any) => l.step === "checkin_chegada_km" && l.timestamp);
          const stTime = checkinEntry ? toBRT(new Date(checkinEntry.timestamp)) : (updatedSo.missionStartedAt ? toBRT(new Date(updatedSo.missionStartedAt as string)) : undefined);

          const cdValid = updatedSo.completedDate && new Date(updatedSo.completedDate as string).getFullYear() > 2000;
          const eTime = cdValid ? toBRT(new Date(updatedSo.completedDate as string)) : undefined;

          let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
          if (updatedSo.escortContractId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", updatedSo.escortContractId).limit(1);
            if (cc?.length) contrato = cc[0];
          } else if (updatedSo.clientId) {
            const { data: cc2 } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", updatedSo.clientId).eq("status", "Ativo").limit(1);
            if (cc2?.length) contrato = cc2[0];
          }

          const kmFN = kmF > kmI ? kmF : kmI;
          const resultado = calcularEscolta({
            km_inicial: kmI, km_final: kmFN, km_vazio: 0,
            horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
            horario_inicio: stTime, horario_fim: eTime, horario_agendado: sTime,
            despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0, contrato,
          });

          const n = (v: any) => Number(v) || 0;
          await supabaseAdmin.from("escort_billings").update({
            km_inicial: n(kmI), km_final: n(kmFN), km_total: n(resultado.km_total),
            km_carregado: n(resultado.km_carregado), km_faturado: n(resultado.km_faturado),
            km_franquia: n(resultado.km_franquia), km_excedente: n(resultado.km_excedente),
            horario_inicio: stTime || null, horario_fim: eTime || null,
            horario_inicio_considerado: resultado.horario_inicio_considerado,
            horas_missao: n(resultado.horas_trabalhadas), horas_trabalhadas: n(resultado.horas_trabalhadas),
            fat_acionamento: n(resultado.fat_acionamento), fat_hora_extra: n(resultado.fat_hora_extra),
            fat_km: n(resultado.fat_km), fat_km_carregado: n(resultado.faturamento.km_carregado),
            fat_km_vazio: n(resultado.faturamento.km_vazio),
            fat_estadia: n(resultado.fat_estadia), fat_pernoite: n(resultado.fat_pernoite),
            fat_adicional_noturno: n(resultado.fat_adicional_noturno), fat_total: n(resultado.fat_total),
          }).eq("service_order_id", osId);
        }
      }

      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/service-orders/:id", requireAuth, async (req, res) => {
    const data = await storage.getServiceOrder(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "OS não encontrada" });
    res.json(data);
  });

  app.get("/api/service-orders/:id/step-data", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
      const osId = Number(req.params.id);
      const os = await storage.getServiceOrder(osId);
      if (!os) return res.status(404).json({ message: "OS não encontrada" });
      const photos = await storage.getMissionPhotosByOS(osId);
      const stepLogs = (os.stepLogs || []) as any[];
      const kmSaida = [...photos].reverse().find(p => p.step === "km_saida");
      const kmChegada = [...photos].reverse().find(p => p.step === "km_chegada");
      const kmFinal = [...photos].reverse().find(p => p.step === "km_final");
      const kmBase = [...photos].reverse().find(p => p.step === "base_hodometro");

      const STEPS_FOR_GRID = [
        { key: "checkout_km_saida", label: "Saída Base", hasKm: true, kmStep: "km_saida" },
        { key: "em_transito_origem", label: "Em Trânsito Origem", hasKm: false },
        { key: "checkin_chegada_km", label: "Chegada Origem", hasKm: true, kmStep: "km_chegada" },
        { key: "iniciar_missao", label: "Início Missão", hasKm: false },
        { key: "em_transito_destino", label: "Em Trânsito Destino", hasKm: false },
        { key: "chegada_destino", label: "Chegada Destino", hasKm: true, kmStep: "km_final" },
        { key: "finalizada", label: "Missão Finalizada", hasKm: false },
        { key: "retorno_base", label: "Retorno Base", hasKm: false },
        { key: "chegada_base", label: "Chegada Base", hasKm: true, kmStep: "base_hodometro" },
      ];

      const kmMap: Record<string, number | null> = {
        km_saida: kmSaida?.kmValue ?? null,
        km_chegada: kmChegada?.kmValue ?? null,
        km_final: kmFinal?.kmValue ?? null,
        base_hodometro: kmBase?.kmValue ?? null,
      };

      const steps = STEPS_FOR_GRID.map(s => {
        const logEntry = [...stepLogs].reverse().find((l: any) => l.step === s.key);
        return {
          key: s.key,
          label: s.label,
          hasKm: s.hasKm,
          kmStep: s.kmStep || null,
          timestamp: logEntry?.timestamp || logEntry?.completedAt || null,
          km: s.kmStep ? (kmMap[s.kmStep] ?? null) : null,
          agentName: logEntry?.agentName || null,
        };
      });

      res.json({ steps, completedDate: os.completedDate || null, missionStartedAt: os.missionStartedAt || null });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/service-orders/:id/step-adjustments", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin" && req.user!.role !== "diretoria") {
        return res.status(403).json({ message: "Apenas Admin/Diretoria pode realizar ajustes manuais" });
      }
      const osId = Number(req.params.id);
      const os = await storage.getServiceOrder(osId);
      if (!os) return res.status(404).json({ message: "OS não encontrada" });

      const { adjustments } = req.body as { adjustments: { stepKey: string; timestamp?: string | null; km?: number | null; kmStep?: string | null }[] };
      if (!adjustments || !Array.isArray(adjustments)) return res.status(400).json({ message: "Dados inválidos" });

      const adminName = req.user!.name || req.user!.username || "Admin";
      const currentLogs = ((os.stepLogs || []) as any[]).slice();
      const auditEntries: string[] = [];

      for (const adj of adjustments) {
        if (adj.timestamp !== undefined) {
          const existingIdx = currentLogs.findIndex((l: any) => l.step === adj.stepKey);
          if (adj.timestamp) {
            if (existingIdx >= 0) {
              const oldTs = currentLogs[existingIdx].timestamp || currentLogs[existingIdx].completedAt;
              currentLogs[existingIdx] = { ...currentLogs[existingIdx], timestamp: adj.timestamp, completedAt: adj.timestamp };
              auditEntries.push(`Etapa "${adj.stepKey}" horário alterado de "${oldTs || 'vazio'}" para "${adj.timestamp}"`);
            } else {
              currentLogs.push({ step: adj.stepKey, timestamp: adj.timestamp, completedAt: adj.timestamp, agentName: `[Ajuste: ${adminName}]` });
              auditEntries.push(`Etapa "${adj.stepKey}" horário inserido: "${adj.timestamp}"`);
            }
          } else if (existingIdx >= 0) {
            const oldTs = currentLogs[existingIdx].timestamp || currentLogs[existingIdx].completedAt;
            currentLogs.splice(existingIdx, 1);
            auditEntries.push(`Etapa "${adj.stepKey}" horário removido (era "${oldTs}")`);
          }
        }

        if (adj.km !== undefined && adj.kmStep) {
          const photos = await storage.getMissionPhotosByOS(osId);
          const existing = [...photos].reverse().find(p => p.step === adj.kmStep);
          if (existing && adj.km !== null) {
            const oldKm = existing.kmValue;
            await db.execute(sql`UPDATE mission_photos SET km_value = ${Number(adj.km)} WHERE id = ${existing.id}`);
            auditEntries.push(`KM "${adj.kmStep}" alterado de ${oldKm ?? 'vazio'} para ${adj.km}`);
          } else if (!existing && adj.km !== null) {
            await db.execute(sql`INSERT INTO mission_photos (service_order_id, employee_id, step, photo_data, km_value, notes) VALUES (${osId}, ${0}, ${adj.kmStep}, ${'[ajuste-manual]'}, ${Number(adj.km)}, ${`Ajuste manual por ${adminName}`})`);
            auditEntries.push(`KM "${adj.kmStep}" inserido manualmente: ${adj.km}`);
          }
          if (adj.km !== null && os.vehicleId && ["km_saida", "km_chegada", "km_final", "base_hodometro"].includes(adj.kmStep)) {
            const veh = await storage.getVehicle(os.vehicleId);
            if (veh && Number(adj.km) >= (veh.km || 0)) {
              await storage.updateVehicle(os.vehicleId, { km: Number(adj.km), lastKmUpdate: new Date() });
              auditEntries.push(`Último KM da viatura ${veh.plate} atualizado para ${adj.km}`);
            }
          }
        }
      }

      await storage.updateServiceOrder(osId, { stepLogs: currentLogs });

      if (auditEntries.length > 0) {
        const auditMessage = `AJUSTE MANUAL por ${adminName}:\n${auditEntries.join("\n")}`;
        await supabaseAdmin.from("mission_updates").insert({
          service_order_id: osId,
          os_number: os.osNumber,
          employee_id: null,
          employee_name: adminName,
          message: auditMessage,
          mission_step: "ajuste_manual",
          latitude: null,
          longitude: null,
          photo_url: null,
          read_by_admin: 1,
        });
        console.log(`[Audit] Step adjustment on OS #${os.osNumber} by ${adminName}: ${auditEntries.length} changes`);
      }

      const { data: existingBilling } = await supabaseAdmin.from("escort_billings")
        .select("id, status").eq("service_order_id", osId).limit(1);
      if (existingBilling?.[0] && existingBilling[0].status === "A_VERIFICAR") {
        const updatedSo = await storage.getServiceOrder(osId);
        if (updatedSo) {
          const phs = await storage.getMissionPhotosByOS(osId);
          const kmSP = [...phs].reverse().find((p: any) => p.step === "km_saida");
          const kmCP = [...phs].reverse().find((p: any) => p.step === "km_chegada");
          const kmFP = [...phs].reverse().find((p: any) => p.step === "km_final");
          const kmI = kmCP?.kmValue || kmSP?.kmValue || 0;
          const kmF = kmFP?.kmValue || 0;
          const toBRT = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
          const sTime = updatedSo.scheduledDate ? toBRT(new Date(updatedSo.scheduledDate)) : undefined;

          const updatedLogs = (updatedSo.stepLogs || []) as any[];
          const checkinEntry = [...updatedLogs].reverse().find((l: any) => l.step === "checkin_chegada_km" && (l.timestamp || l.completedAt));
          const stTime = checkinEntry ? toBRT(new Date(checkinEntry.timestamp || checkinEntry.completedAt)) : (updatedSo.missionStartedAt ? toBRT(new Date(updatedSo.missionStartedAt as string)) : undefined);

          const cdValid = updatedSo.completedDate && new Date(updatedSo.completedDate as string).getFullYear() > 2000;
          const eTime = cdValid ? toBRT(new Date(updatedSo.completedDate as string)) : undefined;

          let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
          if (updatedSo.escortContractId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", updatedSo.escortContractId).limit(1);
            if (cc?.length) contrato = cc[0];
          } else if (updatedSo.clientId) {
            const { data: cc2 } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", updatedSo.clientId).eq("status", "Ativo").limit(1);
            if (cc2?.length) contrato = cc2[0];
          }

          const kmFN = kmF > kmI ? kmF : kmI;
          const resultado = calcularEscolta({
            contrato, km_inicial: kmI, km_final: kmFN,
            km_vazio: 0, horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
            horario_agendado: sTime, horario_inicio: stTime, horario_fim: eTime,
            despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0,
          });

          await supabaseAdmin.from("escort_billings").update({
            km_inicial: kmI, km_final: kmFN,
            horario_inicio: stTime || null, horario_fim: eTime || null,
            ...resultado,
          }).eq("id", existingBilling[0].id);
        }
      }

      res.json({ ok: true, changes: auditEntries.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/service-orders/:id/fuel-allocation", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin" && req.user!.role !== "diretoria") {
        return res.status(403).json({ message: "Apenas Admin/Diretoria" });
      }
      const osId = Number(req.params.id);
      const os = await storage.getServiceOrder(osId);
      if (!os) return res.status(404).json({ message: "OS não encontrada" });

      const { allocated } = req.body as { allocated: boolean };
      await db.update(serviceOrders).set({ fuelAllocated: allocated }).where(eq(serviceOrders.id, osId));

      if (allocated && os.vehicleId) {
        const vehicle = await storage.getVehicle(os.vehicleId);
        const vPlate = vehicle?.plate?.toUpperCase() || "";
        const osDate = os.scheduledDate
          ? new Date(os.scheduledDate).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];
        if (vPlate) {
          const allOrders = await storage.getServiceOrders();
          const sameDaySameVehicle = allOrders.filter(o =>
            o.id !== osId &&
            o.vehicleId === os.vehicleId &&
            o.status !== "concluída" && o.status !== "concluida" && o.status !== "cancelada" &&
            o.missionStatus !== "encerrada" &&
            ((o.scheduledDate ? new Date(o.scheduledDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]) === osDate)
          );
          for (const other of sameDaySameVehicle) {
            if (other.fuelAllocated === true) {
              await db.update(serviceOrders).set({ fuelAllocated: false }).where(eq(serviceOrders.id, other.id));
            }
          }
        }
      }

      res.json({ ok: true, fuelAllocated: allocated });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/service-orders/:id/enriched", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
      const os = await storage.getServiceOrder(Number(req.params.id));
      if (!os) return res.status(404).json({ message: "OS não encontrada" });

      const [client, vehicle, emp1, emp2, kit] = await Promise.all([
        os.clientId ? storage.getClient(os.clientId) : null,
        os.vehicleId ? storage.getVehicle(os.vehicleId) : null,
        os.assignedEmployeeId ? storage.getEmployee(os.assignedEmployeeId) : null,
        os.assignedEmployee2Id ? storage.getEmployee(os.assignedEmployee2Id) : null,
        os.kitId ? storage.getWeaponKit(os.kitId) : null,
      ]);

      const photos = await storage.getMissionPhotosByOS(os.id);

      const { data: billing } = await supabaseAdmin.from("escort_billings")
        .select("*").eq("service_order_id", os.id).limit(1);

      res.json({
        ...os,
        clientName: client?.name || "—",
        clientCnpj: client?.cnpj || null,
        vehiclePlate: vehicle?.plate || null,
        vehicleModel: vehicle?.model || null,
        employee1Name: emp1?.name || null,
        employee2Name: emp2?.name || null,
        kitName: kit?.name || null,
        photos: photos.map(p => ({ step: p.step, kmValue: p.kmValue, notes: p.notes, createdAt: p.createdAt, latitude: p.latitude, longitude: p.longitude })),
        billing: billing?.[0] || null,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/service-orders", requireAuth, async (req, res) => {
    const parsed = insertServiceOrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });

    const employeeIds = [parsed.data.assignedEmployeeId, parsed.data.assignedEmployee2Id].filter((id): id is number => id != null && id > 0);
    const missingDocs: string[] = [];
    const expiredDocs: string[] = [];
    for (const empId of employeeIds) {
      const emp = await storage.getEmployee(empId);
      if (!emp) return res.status(400).json({ message: `Agente com ID ${empId} não encontrado` });
      const label = emp.name;

      const empDocs = await storage.getEmployeeDocuments(empId);
      const cnhDoc = empDocs.find((d: any) => d.type === "CNH");
      const cnvDoc = empDocs.find((d: any) => d.type === "CNV");

      const cnhNumber = emp.cnhNumber || cnhDoc?.documentNumber || null;
      const cnhExpiry = emp.cnhExpiry || cnhDoc?.expiryDate || null;
      const cnvNumber = emp.cnvNumber || cnvDoc?.documentNumber || null;
      const cnvExpiry = emp.cnvExpiry || cnvDoc?.expiryDate || null;

      if (!cnhNumber) missingDocs.push(`CNH (número) de ${label}`);
      if (!cnhExpiry) missingDocs.push(`Validade da CNH de ${label}`);
      if (!cnvNumber) missingDocs.push(`CNV (número) de ${label}`);
      if (!cnvExpiry) missingDocs.push(`Validade da CNV de ${label}`);

      if (cnhExpiry || cnvExpiry) {
        const syncFields: any = {};
        if (cnhNumber && !emp.cnhNumber) syncFields.cnhNumber = cnhNumber;
        if (cnhExpiry && !emp.cnhExpiry) syncFields.cnhExpiry = cnhExpiry;
        if (cnvNumber && !emp.cnvNumber) syncFields.cnvNumber = cnvNumber;
        if (cnvExpiry && !emp.cnvExpiry) syncFields.cnvExpiry = cnvExpiry;
        if (Object.keys(syncFields).length > 0) {
          try { await storage.updateEmployee(empId, syncFields); } catch {}
        }
      }

      if (cnhExpiry) {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        if (cnhExpiry < todayStr) expiredDocs.push(`CNH de ${label}`);
      }
      if (cnvExpiry) {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        if (cnvExpiry < todayStr) expiredDocs.push(`CNV de ${label}`);
      }
    }
    if (missingDocs.length > 0) {
      return res.status(400).json({ message: `Dados obrigatórios faltando: ${missingDocs.join(", ")}` });
    }
    if (expiredDocs.length > 0) {
      return res.status(400).json({ message: `Documentos vencidos: ${expiredDocs.join(", ")} — não é possível criar a OS com documentos vencidos` });
    }

    const allOrders = await storage.getServiceOrders();
    let maxNum = 0;
    for (const o of allOrders) {
      const match = o.osNumber.match(/TOR-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    parsed.data.osNumber = `TOR-${String(maxNum + 1).padStart(4, "0")}`;

    if (parsed.data.kitId) {
      const kit = await storage.getWeaponKit(parsed.data.kitId);
      if (!kit) return res.status(400).json({ message: "Kit de armamento não encontrado" });
      if (kit.status === "em_uso") {
        const ordersWithKit = allOrders.filter(o => o.kitId === parsed.data.kitId && (o.status === "em_andamento" || o.status === "agendada") && o.missionStatus !== "encerrada");
        const newA1 = Number(parsed.data.assignedEmployeeId) || 0;
        const newA2 = Number(parsed.data.assignedEmployee2Id) || 0;
        for (const activeWithKit of ordersWithKit) {
          const curA1 = Number(activeWithKit.assignedEmployeeId) || 0;
          const curA2 = Number(activeWithKit.assignedEmployee2Id) || 0;
          const sameTeam = newA1 > 0 && curA1 > 0 && newA1 === curA1 && newA2 === curA2;
          if (sameTeam) continue;
          const isEmAndamento = activeWithKit.status === "em_andamento" && activeWithKit.missionStatus !== "aguardando";
          if (isEmAndamento) {
            return res.status(400).json({ message: `Kit já está em uso na OS ${activeWithKit.osNumber} (em andamento) com equipe diferente` });
          }
          await storage.updateServiceOrder(activeWithKit.id, { kitId: null });
        }
        if (ordersWithKit.length === 0) {
          await storage.updateWeaponKit(parsed.data.kitId, { status: "disponível" });
        }
      }
    }
    if (!parsed.data.valorEstimado && parsed.data.escortContractId) {
      try {
        const { data: cc } = await supabaseAdmin.from("escort_contracts").select("valor_km_carregado, franquia_minima_km, valor_acionamento").eq("id", parsed.data.escortContractId).limit(1);
        if (cc?.[0]) {
          const c = cc[0];
          const est = (Number(c.valor_acionamento || 0)) + (Number(c.valor_km_carregado || 2.80) * Number(c.franquia_minima_km || 50));
          if (est > 0) (parsed.data as any).valorEstimado = est;
        }
      } catch (_e) {}
    }

    const sanitizeDates = (d: any) => {
      for (const field of ["missionStartedAt", "completedDate", "scheduledDate"]) {
        if (d[field]) {
          const dt = new Date(d[field]);
          if (isNaN(dt.getTime()) || dt.getFullYear() <= 1970) d[field] = null;
        }
      }
    };
    sanitizeDates(parsed.data);
    parsed.data.createdByUserId = req.user?.id || null;
    const data = await storage.createServiceOrder(parsed.data);
    if (data.kitId) {
      await storage.updateWeaponKit(data.kitId, { status: "em_uso" });
    }
    if (data.vehicleId) {
      await storage.updateVehicle(data.vehicleId, { status: "em_uso" });
    }

    (async () => {
      try {
        const client = await storage.getClient(data.clientId);
        const recipientEmail = client?.emailOperacional || client?.email;
        if (!recipientEmail) return;
        const transporter = createSmtpTransporter();
        if (!transporter) return;

        const [emp1, emp2, vehicle] = await Promise.all([
          data.assignedEmployeeId ? storage.getEmployee(data.assignedEmployeeId) : null,
          data.assignedEmployee2Id ? storage.getEmployee(data.assignedEmployee2Id) : null,
          data.vehicleId ? storage.getVehicle(data.vehicleId) : null,
        ]);

        const scheduledStr = data.scheduledDate
          ? new Date(data.scheduledDate).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
          : "A definir";
        const agentsStr = [emp1?.fullName || emp1?.name, emp2?.fullName || emp2?.name].filter(Boolean).join(" / ") || "A definir";
        const vehicleStr = vehicle ? `${vehicle.model || ""} - ${vehicle.plate}`.trim() : "A definir";

        const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#333;line-height:1.6;max-width:600px;margin:0 auto;">
  <div style="background:#1a1a1a;padding:20px 30px;text-align:center;">
    <h1 style="color:#fff;font-size:18px;margin:0;">TORRES VIGILÂNCIA PATRIMONIAL LTDA</h1>
    <p style="color:#999;font-size:12px;margin:4px 0 0;">CNPJ: 36.982.392/0001-89</p>
  </div>
  <div style="padding:30px;border:1px solid #e0e0e0;border-top:none;">
    <h2 style="color:#1a1a1a;font-size:16px;margin:0 0 20px;">PRÉ-ALERTA DE ESCOLTA ARMADA</h2>
    <p>Prezado(a) ${client.contactPerson || client.name},</p>
    <p>Informamos que foi criada uma nova Ordem de Serviço de escolta armada para a sua empresa. Seguem os detalhes:</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;width:40%;">OS Número</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${data.osNumber}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Data/Hora Prevista</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${scheduledStr}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Origem</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${data.origin || "—"}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Destino</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${data.destination || "—"}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Agentes</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${agentsStr}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Viatura</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${vehicleStr}</td></tr>
      ${data.description ? `<tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Observações</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${data.description}</td></tr>` : ""}
    </table>
    <p>A equipe de escolta entrará em contato no horário previsto para início da operação.</p>
    <p style="margin-top:25px;">Atenciosamente,</p>
    <p style="margin:5px 0;"><strong>Torres Vigilância Patrimonial LTDA</strong></p>
    <p style="color:#666;font-size:13px;margin:2px 0;">Tel: (11) 96369-6699</p>
    <p style="color:#666;font-size:13px;margin:2px 0;">escolta@torresseguranca.com.br</p>
  </div>
  <div style="background:#f5f5f5;padding:15px 30px;text-align:center;border:1px solid #e0e0e0;border-top:none;">
    <p style="color:#999;font-size:11px;margin:0;">Este e-mail foi enviado automaticamente pelo sistema Torres Gestão.</p>
  </div>
</body></html>`;

        await transporter.sendMail({
          from: getSmtpFrom(),
          to: recipientEmail,
          bcc: SMTP_BCC_OS,
          subject: `Pré-Alerta de Escolta Armada — ${data.osNumber}`,
          html: htmlBody,
        });
        console.log(`[pre-alert] Email enviado para ${recipientEmail} (OS ${data.osNumber})`);
      } catch (err: any) {
        console.error(`[pre-alert] Erro ao enviar email: ${err.message}`);
      }
    })();

    res.status(201).json(data);
  });

  app.patch("/api/service-orders/:id", requireAuth, async (req, res) => {
    const parsed = insertServiceOrderSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });

    if (parsed.data.status === "em_andamento" && parsed.data.missionStatus === "aguardando") {
      const existing = await storage.getServiceOrder(Number(req.params.id));
      if (existing && !existing.assignedEmployeeId) {
        return res.status(400).json({ message: "Atribua pelo menos um funcionário antes de iniciar a missão" });
      }
    }

    const existing = await storage.getServiceOrder(Number(req.params.id));

    if (existing && existing.status === "em_andamento" && existing.missionStatus !== "aguardando") {
      const changedA1 = parsed.data.assignedEmployeeId !== undefined && parsed.data.assignedEmployeeId !== existing.assignedEmployeeId;
      const changedA2 = parsed.data.assignedEmployee2Id !== undefined && parsed.data.assignedEmployee2Id !== existing.assignedEmployee2Id;
      if (changedA1 || changedA2) {
        const stepLogs: any[] = existing.stepLogs ? (typeof existing.stepLogs === "string" ? JSON.parse(existing.stepLogs as string) : existing.stepLogs as any[]) : [];
        if (stepLogs.length > 0) {
          const forceReassign = req.body._forceReassign === true;
          if (!forceReassign) {
            return res.status(409).json({
              message: "Esta OS já possui registros de missão com a equipe atual. Trocar a equipe pode causar inconsistência nos dados de auditoria. Confirme a troca para prosseguir.",
              code: "REASSIGN_IN_PROGRESS",
              existingSteps: stepLogs.length,
            });
          }
          const oldA1 = existing.assignedEmployeeId;
          const oldA2 = existing.assignedEmployee2Id;
          const newA1 = changedA1 ? parsed.data.assignedEmployeeId : existing.assignedEmployeeId;
          const newA2 = changedA2 ? parsed.data.assignedEmployee2Id : existing.assignedEmployee2Id;
          const newEmp1 = newA1 ? await storage.getEmployee(newA1) : null;
          const removedIds = [oldA1, oldA2].filter(id => id && id !== newA1 && id !== newA2) as number[];
          if (removedIds.length > 0) {
            const photos = await storage.getMissionPhotosByOS(existing.id);
            const photosToReassign = photos.filter(p => removedIds.includes(p.employeeId));
            if (photosToReassign.length > 0 && newA1) {
              for (const photo of photosToReassign) {
                await db.update(missionPhotos).set({ employeeId: newA1 }).where(eq(missionPhotos.id, photo.id));
              }
            }
            const fixedLogs = stepLogs.map((l: any) => {
              if (removedIds.includes(l.agentId) && newA1) {
                return { ...l, agentId: newA1, agentName: newEmp1?.name || "—", _reassigned: true };
              }
              return l;
            });
            (parsed.data as any).stepLogs = fixedLogs;
            try {
              await supabaseAdmin.from("mission_updates")
                .update({ employee_id: newA1, employee_name: newEmp1?.name || "—" })
                .eq("service_order_id", existing.id)
                .in("employee_id", removedIds);
            } catch (_e) {}
          }
          console.log(`[security] OS #${existing.osNumber}: equipe reassigned by admin (force). Old: [${oldA1},${oldA2}] -> New: [${newA1},${newA2}]. ${stepLogs.length} step logs migrated.`);
        }
      }
    }

    if (parsed.data.kitId && parsed.data.kitId !== existing?.kitId) {
      const kit = await storage.getWeaponKit(parsed.data.kitId);
      if (!kit) return res.status(400).json({ message: "Kit de armamento não encontrado" });
      if (kit.status === "em_uso") {
        const allOrders = await storage.getServiceOrders();
        const ordersWithKit = allOrders.filter(o => o.kitId === parsed.data.kitId && o.id !== Number(req.params.id) && (o.status === "em_andamento" || o.status === "agendada") && o.missionStatus !== "encerrada");
        const newA1 = Number(parsed.data.assignedEmployeeId ?? existing?.assignedEmployeeId) || 0;
        const newA2 = Number(parsed.data.assignedEmployee2Id ?? existing?.assignedEmployee2Id) || 0;
        for (const activeWithKit of ordersWithKit) {
          const curA1 = Number(activeWithKit.assignedEmployeeId) || 0;
          const curA2 = Number(activeWithKit.assignedEmployee2Id) || 0;
          const sameTeam = newA1 > 0 && curA1 > 0 && newA1 === curA1 && newA2 === curA2;
          if (sameTeam) continue;
          const isEmAndamento = activeWithKit.status === "em_andamento" && activeWithKit.missionStatus !== "aguardando";
          if (isEmAndamento) {
            return res.status(400).json({ message: `Kit já está em uso na OS ${activeWithKit.osNumber} (em andamento) com equipe diferente` });
          }
          await storage.updateServiceOrder(activeWithKit.id, { kitId: null });
        }
        if (ordersWithKit.length === 0) {
          await storage.updateWeaponKit(parsed.data.kitId, { status: "disponível" });
        }
      }
    }
    if (parsed.data.escortContractId && parsed.data.escortContractId !== existing?.escortContractId && !parsed.data.valorEstimado) {
      try {
        const { data: cc } = await supabaseAdmin.from("escort_contracts").select("valor_km_carregado, franquia_minima_km, valor_acionamento").eq("id", parsed.data.escortContractId).limit(1);
        if (cc?.[0]) {
          const c = cc[0];
          const est = (Number(c.valor_acionamento || 0)) + (Number(c.valor_km_carregado || 2.80) * Number(c.franquia_minima_km || 50));
          if (est > 0) (parsed.data as any).valorEstimado = est;
        }
      } catch (_e) {}
    }

    for (const field of ["missionStartedAt", "completedDate", "scheduledDate"]) {
      if ((parsed.data as any)[field]) {
        const dt = new Date((parsed.data as any)[field]);
        if (isNaN(dt.getTime()) || dt.getFullYear() <= 1970) (parsed.data as any)[field] = null;
      }
    }

    const wasFinished = existing && (existing.status === "concluída" || existing.status === "concluida" || existing.status === "cancelada");
    const isReopening = wasFinished && parsed.data.status && !["concluída", "concluida", "cancelada"].includes(parsed.data.status);
    if (isReopening) {
      try { await removeAutoTransaction("service_order", String(req.params.id)); } catch (_e) {}
    }

    const data = await storage.updateServiceOrder(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "OS não encontrada" });

    if (existing && existing.kitId && existing.kitId !== data.kitId) {
      await storage.updateWeaponKit(existing.kitId, { status: "disponível" });
    }
    if (data.kitId && (!existing || existing.kitId !== data.kitId)) {
      await storage.updateWeaponKit(data.kitId, { status: "em_uso" });
    }
    if (data.kitId && (data.missionStatus === "encerrada" || data.status === "concluída" || data.status === "cancelada")) {
      await storage.updateWeaponKit(data.kitId, { status: "disponível" });
    }

    if (existing && existing.vehicleId && existing.vehicleId !== data.vehicleId) {
      await storage.updateVehicle(existing.vehicleId, { status: "disponível" });
    }
    if (data.vehicleId && (!existing || existing.vehicleId !== data.vehicleId)) {
      await storage.updateVehicle(data.vehicleId, { status: "em_uso" });
    }
    const isFinished = data.missionStatus === "encerrada" || data.missionStatus === "finalizada" ||
      data.status === "concluida" || data.status === "concluída" || data.status === "cancelada";
    if (data.vehicleId && isFinished) {
      await storage.updateVehicle(data.vehicleId, { status: "disponível" });

      try {
        const vehicle = await storage.getVehicle(data.vehicleId);
        if (vehicle && vehicle.trackerType === "truckscontrol" && vehicle.truckscontrolIdentifier) {
          const espelhados = await truckscontrol.listEspelhados();
          if (espelhados.success && espelhados.vehicles.length > 0) {
            const veiID = vehicle.truckscontrolIdentifier;
            const veiculoEspelhado = espelhados.vehicles.filter(e => String(e.veiID) === String(veiID));
            for (const esp of veiculoEspelhado) {
              console.log(`[auto-cancel] Cancelando espelhamento veiID=${veiID} CNPJ=${esp.cgccpf} (missão finalizada OS #${data.osNumber})`);
              await truckscontrol.cancelEspelhamento(Number(veiID), esp.cgccpf);
            }
          }
        }
      } catch (err: any) {
        console.log(`[auto-cancel] Erro ao cancelar espelhamento automático: ${err.message}`);
      }
    }

    const billingRelevantFields = ["completedDate", "missionStartedAt", "scheduledDate", "kmSaida", "kmRetorno", "kmOrigem", "kmDestino"];
    const changedBillingFields = existing && billingRelevantFields.some(f => {
      const oldVal = (existing as any)[f];
      const newVal = (parsed.data as any)[f];
      return newVal !== undefined && String(newVal || "") !== String(oldVal || "");
    });
    const isConcluded = ["concluída", "concluida"].includes(data.status || "") || data.missionStatus === "encerrada";
    if (changedBillingFields && isConcluded && data.type === "escolta") {
      try {
        const { data: existingBilling } = await supabaseAdmin.from("escort_billings")
          .select("*")
          .eq("service_order_id", data.id)
          .order("created_at", { ascending: false })
          .limit(1);
        const bill = existingBilling?.[0];
        if (bill && bill.status === "A_VERIFICAR") {
          let contrato: any = null;
          if (bill.contract_id) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", bill.contract_id).single();
            contrato = cc;
          }
          if (!contrato) {
            contrato = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
          }

          const kmIni = Number((data as any).kmSaida || bill.km_inicial || 0);
          const kmFin = Number((data as any).kmRetorno || bill.km_final || 0);
          const horarioInicio = data.missionStartedAt ? new Date(data.missionStartedAt).toISOString() : (bill.horario_inicio || null);
          const horarioFim = data.completedDate ? new Date(data.completedDate).toISOString() : (bill.horario_fim || null);
          const horarioAgendado = data.scheduledDate ? new Date(data.scheduledDate).toISOString() : (bill.horario_agendado || null);

          const resultado = calcularEscolta({
            km_inicial: kmIni, km_final: kmFin, km_vazio: Number(bill.km_vazio || 0),
            horas_missao: 0, horas_estadia: Number(bill.horas_estadia || 0),
            teve_pernoite: !!bill.teve_pernoite, horario_inicio: horarioInicio, horario_fim: horarioFim,
            horario_agendado: horarioAgendado,
            despesas_pedagio: Number(bill.despesas_pedagio || 0), despesas_combustivel: Number(bill.despesas_combustivel || 0),
            despesas_outras: Number(bill.despesas_outras || 0), contrato,
          });

          const nb = (v: any) => Number(v) || 0;
          await supabaseAdmin.from("escort_billings").update({
            km_inicial: nb(kmIni), km_final: nb(kmFin),
            km_carregado: nb(resultado.km_carregado), km_total: nb(resultado.km_total),
            km_faturado: nb(resultado.km_faturado), km_franquia: nb(resultado.km_franquia),
            km_excedente: nb(resultado.km_excedente),
            horario_agendado: horarioAgendado, horario_inicio: horarioInicio, horario_fim: horarioFim,
            horario_inicio_considerado: resultado.horario_inicio_considerado,
            horas_missao: nb(resultado.horas_trabalhadas), horas_trabalhadas: nb(resultado.horas_trabalhadas),
            is_noturno: resultado.is_noturno,
            fat_acionamento: nb(resultado.fat_acionamento), fat_hora_extra: nb(resultado.fat_hora_extra),
            fat_km: nb(resultado.fat_km), fat_km_carregado: nb(resultado.faturamento.km_carregado),
            fat_km_vazio: nb(resultado.faturamento.km_vazio),
            fat_estadia: nb(resultado.fat_estadia), fat_pernoite: nb(resultado.fat_pernoite),
            fat_diaria: nb(resultado.fat_pernoite),
            fat_adicional_noturno: nb(resultado.fat_adicional_noturno), fat_total: nb(resultado.fat_total),
            valor_franquia: nb(resultado.valor_franquia), valor_km_extra: nb(resultado.valor_km_extra),
            pag_vrp: nb(resultado.pag_vrp), pag_periculosidade: nb(resultado.pag_periculosidade),
            pag_adicional_noturno: nb(resultado.pag_adicional_noturno), pag_reembolsos: nb(resultado.pag_reembolsos),
            pag_total: nb(resultado.pag_total),
            resultado_bruto: nb(resultado.resultado.bruto), resultado_liquido: nb(resultado.resultado.liquido),
            margem_percentual: nb(resultado.resultado.margem_pct),
          }).eq("id", bill.id);
          console.log(`[OS-Billing] Auto-recalculated billing #${bill.id} for OS ${data.osNumber} (fields changed: ${billingRelevantFields.filter(f => (parsed.data as any)[f] !== undefined).join(", ")})`);
        }
      } catch (recalcErr: any) {
        console.error(`[OS-Billing] Auto-recalc failed for OS ${data.osNumber}:`, recalcErr.message);
      }
    }

    const wasCanceled = existing && !["cancelada"].includes(existing.status || "") && data.status === "cancelada";
    if (wasCanceled) {
      try { await removeAutoTransaction("service_order", String(data.id)); } catch (_e) {}
    }

    const wasNotFinished = existing && !["concluída", "concluida"].includes(existing.status || "");
    const isNowFinished = ["concluída", "concluida"].includes(data.status || "");
    if (wasNotFinished && isNowFinished && data.type === "escolta") {
      try {
        const { data: billing } = await supabaseAdmin.from("escort_billings")
          .select("fat_total, client_name")
          .eq("service_order_id", data.id)
          .order("created_at", { ascending: false })
          .limit(1);
        const billingRow = billing?.[0];
        const fatTotal = billingRow ? Number(billingRow.fat_total || 0) : 0;
        const revenueAmount = fatTotal > 0 ? fatTotal : Number((data as any).valorEstimado || 0);
        const clientName = billingRow?.client_name || (data.clientId ? (await storage.getClient(data.clientId))?.name : null) || "—";
        const vehicle = data.vehicleId ? await storage.getVehicle(data.vehicleId) : null;
        const plateStr = vehicle?.plate || "";

        if (revenueAmount > 0) {
          await removeAutoTransaction("service_order", String(data.id));
          await createAutoTransaction({
            description: `RECEITA OS ${data.osNumber} - ${clientName} ${plateStr}`.toUpperCase().trim(),
            amount: revenueAmount,
            type: "INCOME",
            due_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
            origin_type: "service_order",
            origin_id: String(data.id),
            category_name: "Receita de Escolta",
            entity_name: clientName,
            created_by: req.user?.name || "SISTEMA",
          });
          if (fatTotal > 0) await storage.updateServiceOrder(data.id, { valorEstimado: fatTotal } as any);
          console.log(`[OS-Financial] Auto INCOME via PATCH for OS ${data.osNumber}: R$ ${revenueAmount}`);
        }
      } catch (revErr: any) {
        console.error(`[OS-Financial] Revenue auto-tx via PATCH failed:`, revErr.message);
      }
    }

    res.json(data);
  });

  app.delete("/api/service-orders/:id", requireAuth, requireDiretoria, async (req, res) => {
    const osId = Number(req.params.id);
    try {
      const existing = await storage.getServiceOrder(osId);
      if (existing?.kitId) {
        await storage.updateWeaponKit(existing.kitId, { status: "disponível" });
      }
      if (existing?.vehicleId) {
        await storage.updateVehicle(existing.vehicleId, { status: "disponível" });
      }
      await supabaseAdmin.from("escort_billings").delete().eq("service_order_id", osId);
      await supabaseAdmin.from("mission_updates").delete().eq("service_order_id", osId);
      await supabaseAdmin.from("mission_photos").delete().eq("service_order_id", osId);
      await supabaseAdmin.from("weapon_movements").delete().eq("service_order_id", osId);
      await supabaseAdmin.from("vehicle_assignments").delete().eq("service_order_id", osId);
      await storage.deleteServiceOrder(osId);
      res.json({ message: "OS removida" });
    } catch (err: any) {
      console.error("Erro ao remover OS:", err.message);
      res.status(500).json({ message: "Erro ao remover OS: " + (err.message || "erro interno") });
    }
  });

  app.post("/api/service-orders/:id/approve-early-start", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (user.role !== "admin") return res.status(403).json({ message: "Somente admin pode autorizar início antecipado" });
    const so = await storage.getServiceOrder(Number(req.params.id));
    if (!so) return res.status(404).json({ message: "OS não encontrada" });
    const updated = await storage.updateServiceOrder(so.id, { earlyStartApproved: true });
    res.json(updated);
  });

  app.get("/api/service-orders/:id/pdf", requireAuth, async (req, res) => {
    try {
      const PDFDocument = (await import("pdfkit")).default;
      const QRCode = (await import("qrcode")).default;
      const path = await import("path");
      const fs = await import("fs");

      const os = await storage.getServiceOrder(Number(req.params.id));
      if (!os) return res.status(404).json({ message: "OS não encontrada" });

      const client = os.clientId ? await storage.getClient(os.clientId) : null;
      const emp1 = os.assignedEmployeeId ? await storage.getEmployee(os.assignedEmployeeId) : null;
      const emp2 = os.assignedEmployee2Id ? await storage.getEmployee(os.assignedEmployee2Id) : null;
      const vehicle = os.vehicleId ? await storage.getVehicle(os.vehicleId) : null;
      let kitItems: any[] = [];
      if (os.kitId) {
        const rawItems = await storage.getWeaponKitItems(os.kitId);
        kitItems = await Promise.all(rawItems.map(async (item) => {
          const weapon = await storage.getWeapon(item.weaponId);
          return { ...item, weapon };
        }));
      }

      const qrData = `TORRES|OS:${os.osNumber}|${new Date().toISOString().slice(0, 10)}`;
      const qrBuffer = await QRCode.toBuffer(qrData, { width: 80, margin: 1, color: { dark: "#000000", light: "#ffffff" } });

      let osLogoBuffer: Buffer | null = null;
      try {
        const logoSrc = path.resolve("attached_assets/WhatsApp_Image_2026-03-19_at_18.44.30_1774459865687.jpeg");
        if (fs.existsSync(logoSrc)) {
          osLogoBuffer = await sharp(logoSrc)
            .negate({ alpha: false })
            .flatten({ background: { r: 34, g: 34, b: 34 } })
            .png()
            .toBuffer();
        }
      } catch {}
      const hasLogo = !!osLogoBuffer;

      const PAGE_H = 841.89;
      const doc = new PDFDocument({ size: "A4", margin: 30, autoFirstPage: false, bufferPages: true });
      doc.addPage({ size: "A4", margin: 30 });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename=OS_${os.osNumber}.pdf`);
      doc.pipe(res);

      const W = 535;
      const LM = 30;
      const PAD = 10;
      const LABEL_X = LM + PAD;
      const DARK = "#1a1a1a";
      const GRAY = "#555555";
      const LIGHT_GRAY = "#999999";
      const BG_ALT = "#f5f5f5";
      let y = 30;
      const MAX_Y = PAGE_H - 120;

      const parseDataUri = (dataUri: string | null | undefined): Buffer | null => {
        try {
          if (!dataUri) return null;
          if (dataUri.startsWith("data:")) {
            const base64 = dataUri.split(",")[1];
            if (!base64) return null;
            return Buffer.from(base64, "base64");
          }
          if (/^[A-Za-z0-9+/=\s]+$/.test(dataUri) && dataUri.length > 100) {
            return Buffer.from(dataUri, "base64");
          }
          return null;
        } catch { return null; }
      };

      const gradientRect = (x: number, yy: number, w: number, h: number) => {
        const grad = doc.linearGradient(x, yy, x + w, yy);
        grad.stop(0, "#000000").stop(1, "#2C3E50");
        doc.save().rect(x, yy, w, h).fill(grad).restore();
      };
      const fillRect = (x: number, yy: number, w: number, h: number, color: string) => {
        doc.save().rect(x, yy, w, h).fill(color).restore();
      };
      const borderRect = (x: number, yy: number, w: number, h: number, color = "#d4d4d4", lw = 0.5) => {
        doc.save().rect(x, yy, w, h).lineWidth(lw).strokeColor(color).stroke().restore();
      };
      const hLine = (x: number, yy: number, w: number, color = "#d4d4d4") => {
        doc.save().moveTo(x, yy).lineTo(x + w, yy).lineWidth(0.5).strokeColor(color).stroke().restore();
      };

      const sectionHeader = (title: string) => {
        if (y > MAX_Y) return;
        gradientRect(LM, y, W, 20);
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff").text(title.toUpperCase(), LM, y + 5, { width: W, align: "center", lineBreak: false });
        doc.restore();
        y += 20;
      };

      const fieldRow = (label: string, value: string, valueX = 160) => {
        if (y > MAX_Y) return;
        const rH = 16;
        const vPad = Math.floor((rH - 8) / 2);
        hLine(LM, y + rH, W);
        doc.save();
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(GRAY).text(label.toUpperCase() + ":", LABEL_X, y + vPad, { width: valueX - LABEL_X - 5, lineBreak: false });
        doc.restore();
        doc.save();
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(DARK).text(value || "\u2014", LM + valueX, y + vPad, { width: W - valueX - PAD, lineBreak: false });
        doc.restore();
        y += rH;
      };

      const fieldRow2 = (l1: string, v1: string, l2: string, v2: string, splitAt = 0.5) => {
        if (y > MAX_Y) return;
        const rH = 16;
        const vPad = Math.floor((rH - 8) / 2);
        hLine(LM, y + rH, W);
        const col1W = Math.floor(W * splitAt);
        const vOff = 120;
        doc.save();
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(GRAY).text(l1.toUpperCase() + ":", LABEL_X, y + vPad, { width: vOff - PAD, lineBreak: false });
        doc.restore();
        doc.save();
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(DARK).text(v1 || "\u2014", LM + vOff, y + vPad, { width: col1W - vOff - 10, lineBreak: false });
        doc.restore();
        doc.save();
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(GRAY).text(l2.toUpperCase() + ":", LM + col1W + PAD, y + vPad, { width: vOff - PAD, lineBreak: false });
        doc.restore();
        doc.save();
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(DARK).text(v2 || "\u2014", LM + col1W + vOff, y + vPad, { width: W - col1W - vOff - PAD, lineBreak: false });
        doc.restore();
        y += rH;
      };

      gradientRect(LM, y, W, 50);
      doc.save();
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#d4d4d4").text("TORRES VIGIL\u00c2NCIA PATRIMONIAL LTDA", LM, y + 8, { width: W, align: "center", lineBreak: false });
      doc.restore();
      doc.save();
      doc.font("Helvetica-Bold").fontSize(14).fillColor("#ffffff").text("RELAT\u00d3RIO DE OPERA\u00c7\u00c3O DE ESCOLTA", LM, y + 22, { width: W, align: "center", lineBreak: false });
      doc.restore();

      if (hasLogo) {
        try { doc.image(osLogoBuffer!, LM + 8, y + 4, { height: 42 }); } catch {}
      }

      y += 50;

      fillRect(LM, y, W, 20, BG_ALT);
      borderRect(LM, y, W, 20);
      const halfW = Math.floor(W / 2);
      const osLabelW = 100;
      doc.save();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("FOLHA / OS", LABEL_X, y + 6, { width: osLabelW, lineBreak: false });
      doc.restore();
      doc.save();
      doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK).text(os.osNumber, LM + osLabelW + PAD, y + 5, { width: 140, lineBreak: false });
      doc.restore();
      doc.save();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("OPERA\u00c7\u00c3O", LM + W - 200, y + 6, { width: 80, lineBreak: false });
      doc.restore();
      doc.save();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text((os.type || "ESCOLTA").toUpperCase(), LM + W - 110, y + 6, { width: 100, lineBreak: false });
      doc.restore();
      y += 20;

      if (os.route) {
        fillRect(LM, y, W, 24, "#ffffff");
        borderRect(LM, y, W, 24);
        doc.save();
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(GRAY).text("ROTA", LABEL_X, y + 8, { width: osLabelW, lineBreak: false });
        doc.restore();
        const routeText = os.route.length > 200 ? os.route.substring(0, 200) + "..." : os.route;
        doc.save();
        doc.font("Helvetica").fontSize(6.5).fillColor(DARK).text(routeText, LM + osLabelW + PAD, y + 5, { width: W - osLabelW - PAD * 3, lineBreak: true, height: 16, ellipsis: true });
        doc.restore();
        y += 24;
      }

      sectionHeader("Empresa Contratante / Cliente");
      fillRect(LM, y, W, 22, "#ffffff");
      borderRect(LM, y, W, 22);
      doc.save();
      doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK).text((client?.name || "\u2014").toUpperCase(), LM, y + 6, { width: W, align: "center", lineBreak: false });
      doc.restore();
      y += 22;

      if (os.requesterName) {
        fillRect(LM, y, W, 18, BG_ALT);
        borderRect(LM, y, W, 18);
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("SOLICITANTE:", LABEL_X, y + 5, { width: osLabelW, lineBreak: false });
        doc.restore();
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text(os.requesterName, LM + osLabelW + PAD, y + 5, { width: W - osLabelW - PAD * 2, lineBreak: false });
        doc.restore();
        y += 18;
      }

      const dateVal = os.scheduledDate ? new Date(os.scheduledDate).toLocaleDateString("pt-BR") : "\u2014";
      const timeVal = os.scheduledDate ? new Date(os.scheduledDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "\u2014";
      fillRect(LM, y, W, 18, "#ffffff");
      borderRect(LM, y, W, 18);
      const col3W = Math.floor(W / 3);
      doc.save();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("DATA:", LABEL_X, y + 5, { width: 40, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text(dateVal, LABEL_X + 42, y + 5, { width: col3W - 52, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("HOR\u00c1RIO:", LM + col3W + PAD, y + 5, { width: 55, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text(timeVal, LM + col3W + 65, y + 5, { width: col3W - 70, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("PRIORIDADE:", LM + col3W * 2 + PAD, y + 5, { width: 72, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text((os.priority || "").toUpperCase(), LM + col3W * 2 + 82, y + 5, { width: col3W - 92, lineBreak: false });
      doc.restore();
      y += 18;

      y += 2;

      const renderAgent = (emp: any, roleLabel: string) => {
        if (y > MAX_Y) return;
        sectionHeader(`Identifica\u00e7\u00e3o do Agente : ${roleLabel}`);

        const photoSize = 65;
        const photoMargin = 6;
        const hasPhoto = emp?.photoUrl && emp.photoUrl.startsWith("data:");
        const photoBuffer = hasPhoto ? parseDataUri(emp.photoUrl) : null;

        const photoX = LM + photoMargin;
        const photoY = y + 2;
        const dataStartX = LM + photoSize + photoMargin * 2 + 4;
        const dataW = W - photoSize - photoMargin * 2 - 4;

        doc.save().roundedRect(photoX, photoY, photoSize, photoSize, 4).lineWidth(0.8).strokeColor("#cccccc").stroke().restore();

        if (photoBuffer) {
          try {
            doc.save()
              .roundedRect(photoX, photoY, photoSize, photoSize, 4).clip()
              .image(photoBuffer, photoX, photoY, { width: photoSize, height: photoSize })
              .restore();
          } catch {}
        } else {
          doc.save();
          doc.font("Helvetica").fontSize(7).fillColor(LIGHT_GRAY).text("SEM", photoX, photoY + 26, { width: photoSize, align: "center", lineBreak: false });
          doc.text("FOTO", photoX, photoY + 35, { width: photoSize, align: "center", lineBreak: false });
          doc.restore();
        }

        const rH = 14;
        const vPad = Math.floor((rH - 7) / 2);
        const labelX = dataStartX + 4;
        const labelW = 55;
        const valX = labelX + labelW;
        const rightCol = Math.floor(dataW * 0.55);

        const agentRow = (l1: string, v1: string, l2: string, v2: string) => {
          if (y > MAX_Y) return;
          hLine(dataStartX, y + rH, dataW);
          doc.save();
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor(GRAY).text(l1.toUpperCase() + ":", labelX, y + vPad, { width: labelW, lineBreak: false });
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor(DARK).text(v1 || "\u2014", valX, y + vPad, { width: rightCol - labelW - 5, lineBreak: false });
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor(GRAY).text(l2.toUpperCase() + ":", labelX + rightCol, y + vPad, { width: labelW, lineBreak: false });
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor(DARK).text(v2 || "\u2014", valX + rightCol, y + vPad, { width: dataW - rightCol - labelW - 5, lineBreak: false });
          doc.restore();
          y += rH;
        };

        hLine(dataStartX, y + rH, dataW);
        doc.save();
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(GRAY).text("NOME:", labelX, y + vPad, { width: labelW, lineBreak: false });
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(DARK).text((emp?.name || "\u2014").toUpperCase(), valX, y + vPad - 1, { width: dataW - labelW - 10, lineBreak: false });
        doc.restore();
        y += rH;

        agentRow("CPF", emp?.cpf || "\u2014", "RG", emp?.rg || "\u2014");
        agentRow("CNH", emp?.cnhNumber || "\u2014", "Contato", emp?.phone || "\u2014");
        agentRow("CNV", emp?.cnvNumber || "\u2014", "Val CNH", emp?.cnhExpiry ? new Date(emp.cnhExpiry).toLocaleDateString("pt-BR") : "\u2014");
        agentRow("Matr\u00edcula", emp?.matricula || "\u2014", "Val CNV", emp?.cnvExpiry ? new Date(emp.cnvExpiry).toLocaleDateString("pt-BR") : "\u2014");

        if (emp?.vestNumber) {
          agentRow("Colete", `${emp.vestNumber} ${emp.vestBrand || ""}`.trim(), "Val Colete", emp.vestExpiry ? new Date(emp.vestExpiry).toLocaleDateString("pt-BR") : "\u2014");
        }

        y = Math.max(y, photoY + photoSize + 2);
        y += 4;
      };

      if (emp1) renderAgent(emp1, "L\u00cdDER / MOTORISTA");
      if (emp2) renderAgent(emp2, "ESCOLTA AUXILIAR");

      if (kitItems.length > 0) {
        sectionHeader("Armamento Designado");

        const colWs = [Math.floor(W * 0.30), Math.floor(W * 0.18), Math.floor(W * 0.30), W - Math.floor(W * 0.30) - Math.floor(W * 0.18) - Math.floor(W * 0.30)];
        fillRect(LM, y, W, 16, "#e0e0e0");
        borderRect(LM, y, W, 16);
        let cx = LM;
        const thLabels = ["TIPO / MODELO", "CALIBRE", "N\u00ba S\u00c9RIE", "MUNI\u00c7\u00c3O"];
        doc.save();
        doc.font("Helvetica-Bold").fontSize(7).fillColor(GRAY);
        for (let i = 0; i < 4; i++) {
          doc.text(thLabels[i], cx + 6, y + 4, { width: colWs[i] - 8, lineBreak: false });
          cx += colWs[i];
        }
        doc.restore();
        y += 16;

        for (const w of kitItems) {
          borderRect(LM, y, W, 18);
          cx = LM;
          doc.save();
          doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK);
          doc.text(`${w.weapon?.type || "\u2014"} ${w.weapon?.model || ""}`.trim(), cx + 6, y + 5, { width: colWs[0] - 8, lineBreak: false });
          cx += colWs[0];
          doc.font("Helvetica").fontSize(8).fillColor(DARK);
          doc.text(w.weapon?.caliber || "\u2014", cx + 6, y + 5, { width: colWs[1] - 8, lineBreak: false });
          cx += colWs[1];
          doc.text(w.weapon?.serialNumber || "\u2014", cx + 6, y + 5, { width: colWs[2] - 8, lineBreak: false });
          cx += colWs[2];
          doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK);
          doc.text("12 proj.", cx + 6, y + 5, { width: colWs[3] - 8, lineBreak: false });
          doc.restore();
          y += 18;
        }
        y += 4;
      }

      if (vehicle) {
        sectionHeader("Dados da Viatura e Rastreamento");

        const trackerType = vehicle.trackerType === "truckscontrol" ? "TrucksControl" : vehicle.trackerType === "custom" ? "OnixSat" : null;
        const modelStr = `${vehicle.brand || ""} ${vehicle.model || ""}`.trim();

        const col4W = Math.floor(W / 4);
        fillRect(LM, y, W, 18, BG_ALT);
        borderRect(LM, y, W, 18);
        doc.save();
        doc.font("Helvetica-Bold").fontSize(7).fillColor(GRAY);
        doc.text("VIATURA", LM + 6, y + 5, { width: col4W - 8, lineBreak: false });
        doc.text("COR", LM + col4W + 6, y + 5, { width: col4W - 8, lineBreak: false });
        doc.text("PLACA", LM + col4W * 2 + 6, y + 5, { width: col4W - 8, lineBreak: false });
        doc.text("RASTREADOR / ID", LM + col4W * 3 + 6, y + 5, { width: col4W - 8, lineBreak: false });
        doc.restore();
        y += 18;

        borderRect(LM, y, W, 18);
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK);
        doc.text(modelStr || "\u2014", LM + 6, y + 5, { width: col4W - 8, lineBreak: false });
        doc.text(vehicle.color || "\u2014", LM + col4W + 6, y + 5, { width: col4W - 8, lineBreak: false });
        doc.text(vehicle.plate, LM + col4W * 2 + 6, y + 5, { width: col4W - 8, lineBreak: false });
        const trackerStr = trackerType ? `${trackerType} / ${vehicle.truckscontrolIdentifier || vehicle.trackerId || vehicle.plate}` : "\u2014";
        doc.text(trackerStr, LM + col4W * 3 + 6, y + 5, { width: col4W - 8, lineBreak: false });
        doc.restore();
        y += 18;

        const vehPhotos: { label: string; data: string | null }[] = [
          { label: "FRONTAL", data: vehicle.photoFront || null },
          { label: "TRASEIRA", data: vehicle.photoRear || null },
          { label: "LATERAL ESQ.", data: vehicle.photoLeft || null },
          { label: "LATERAL DIR.", data: vehicle.photoRight || null },
        ];
        const validPhotos = vehPhotos.filter(p => {
          if (!p.data) return false;
          const buf = parseDataUri(p.data);
          return buf && buf.length > 100;
        });

        if (validPhotos.length > 0 && y < MAX_Y) {
          y += 2;
          const photoRowH = 55;
          const gap = 6;
          const totalGaps = (validPhotos.length - 1) * gap;
          const photoW = Math.floor((W - totalGaps) / validPhotos.length);
          let px = LM;
          for (const vp of validPhotos) {
            const buf = parseDataUri(vp.data!);
            if (buf) {
              try {
                doc.save()
                  .rect(px, y, photoW, photoRowH).clip()
                  .image(buf, px, y, { width: photoW, height: photoRowH })
                  .restore();
                borderRect(px, y, photoW, photoRowH, "#cccccc");
              } catch {
                fillRect(px, y, photoW, photoRowH, "#e5e5e5");
                borderRect(px, y, photoW, photoRowH, "#cccccc");
              }
              doc.save();
              doc.font("Helvetica").fontSize(6).fillColor(LIGHT_GRAY).text(vp.label, px, y + photoRowH + 2, { width: photoW, align: "center", lineBreak: false });
              doc.restore();
            }
            px += photoW + gap;
          }
          y += photoRowH + 10;
        }

        y += 4;
      }

      if (os.escortedDriverName || os.escortedVehiclePlate) {
        sectionHeader("Dados da Carga / Ve\u00edculo Cliente");
        if (os.escortedDriverName) {
          fieldRow2("Motorista", os.escortedDriverName, "Telefone", "");
        }
        if (os.escortedVehiclePlate) {
          fieldRow2("Ve\u00edculo", os.escortedVehiclePlate, "GR/Doc", "");
        }
        y += 6;
      }

      if ((os.description || os.notes) && y < MAX_Y) {
        sectionHeader("Informa\u00e7\u00f5es Complementares / Observa\u00e7\u00f5es");
        const obsH = 30;
        fillRect(LM, y, W, obsH, "#ffffff");
        borderRect(LM, y, W, obsH);
        doc.save();
        doc.font("Helvetica").fontSize(7).fillColor(DARK);
        const infoText = [os.description, os.notes].filter(Boolean).join(" | ");
        const truncInfo = infoText.length > 300 ? infoText.substring(0, 300) + "..." : infoText;
        doc.text(truncInfo || "\u2014", LABEL_X, y + 6, { width: W - PAD * 2, height: obsH - 10, lineBreak: true, ellipsis: true });
        doc.restore();
        y += obsH + 2;
      }

      const footerH = 80;
      const footerY = Math.min(Math.max(y + 20, 700), PAGE_H - 30 - footerH);

      gradientRect(LM, footerY, W, 24);
      doc.save();
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#ffffff").text(
        "ATENCIOSAMENTE, DEPARTAMENTO DE ESCOLTA ARMADA \u2014 TORRES VIGIL\u00c2NCIA PATRIMONIAL",
        LM, footerY + 7, { width: W, align: "center", lineBreak: false }
      );
      doc.restore();

      const infoY = footerY + 28;
      const qrSize = 48;
      doc.image(qrBuffer, LM + W - qrSize - 2, infoY, { width: qrSize });

      const infoW = W - qrSize - 20;
      doc.save();
      doc.font("Helvetica-Bold").fontSize(7).fillColor(DARK).text("TORRES VIGIL\u00c2NCIA PATRIMONIAL LTDA", LM, infoY + 2, { width: infoW, align: "center", lineBreak: false });
      doc.font("Helvetica").fontSize(6.5).fillColor(LIGHT_GRAY).text("CNPJ 36.982.392/0001-89", LM, infoY + 12, { width: infoW, align: "center", lineBreak: false });
      doc.font("Helvetica").fontSize(6.5).fillColor(LIGHT_GRAY).text("Tel: (11) 96369-6699  |  www.torresseguranca.com.br", LM, infoY + 22, { width: infoW, align: "center", lineBreak: false });
      doc.font("Helvetica").fontSize(6).fillColor("#a3a3a3").text(
        `Documento gerado eletronicamente em ${new Date().toLocaleDateString("pt-BR")}, ${new Date().toLocaleTimeString("pt-BR")}`,
        LM, infoY + 34, { width: infoW, align: "center", lineBreak: false }
      );
      doc.restore();

      const pageRange = doc.bufferedPageRange();
      if (pageRange.count > 1) {
        for (let i = pageRange.count - 1; i > 0; i--) {
          doc.removePage(i);
        }
      }

      doc.end();
    } catch (error: any) {
      console.error("PDF generation error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Erro ao gerar PDF" });
      }
    }
  });

  app.get("/api/service-orders/:id/positions", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "ID inválido" });
      const positions = await db.select().from(missionPositions)
        .where(eq(missionPositions.serviceOrderId, id))
        .orderBy(missionPositions.createdAt);
      res.json(positions);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/service-orders/:id/costs", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "ID inválido" });
      const costs = await storage.getMissionCostsByOS(id);
      res.json(costs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/service-orders/:id/costs", requireAuth, async (req, res) => {
    try {
      const serviceOrderId = Number(req.params.id);
      if (!Number.isInteger(serviceOrderId) || serviceOrderId <= 0) return res.status(400).json({ message: "ID inválido" });
      const os = await storage.getServiceOrder(serviceOrderId);
      if (!os) return res.status(404).json({ message: "OS não encontrada" });
      const { category, description, amount } = req.body;
      if (!category || typeof category !== "string") return res.status(400).json({ message: "Categoria é obrigatória" });
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ message: "Valor deve ser positivo" });
      const cost = await storage.createMissionCost({ serviceOrderId, category, description: description || null, amount: numAmount.toFixed(2) });

      if (cost) {
        const osNum = os.osNumber || `OS-${serviceOrderId}`;
        await createAutoTransaction({
          description: `CUSTO MISSÃO ${osNum} - ${category} ${description || ""}`.toUpperCase().trim(),
          amount: numAmount,
          type: "EXPENSE",
          due_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
          origin_type: "mission_cost",
          origin_id: String(cost.id),
          category_name: "Custos de Missão",
          entity_name: null,
          created_by: "SISTEMA",
        });
      }

      res.json(cost);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/service-orders/:id/costs/:costId", requireAuth, async (req, res) => {
    try {
      const serviceOrderId = Number(req.params.id);
      const costId = Number(req.params.costId);
      if (!Number.isInteger(costId) || costId <= 0) return res.status(400).json({ message: "ID inválido" });
      const costs = await storage.getMissionCostsByOS(serviceOrderId);
      const exists = costs.find(c => c.id === costId);
      if (!exists) return res.status(404).json({ message: "Custo não encontrado nesta OS" });
      await storage.deleteMissionCost(costId);
      await removeAutoTransaction("mission_cost", String(costId));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/service-orders/:id/route", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "ID inválido" });
      const os = await storage.getServiceOrder(id);
      if (!os) return res.status(404).json({ message: "OS não encontrada" });

      const positions = await db.select().from(missionPositions)
        .where(eq(missionPositions.serviceOrderId, id))
        .orderBy(missionPositions.createdAt);

      let plannedRoute: string | null = os.route || null;

      const stepLogs: any[] = Array.isArray(os.stepLogs) ? os.stepLogs : [];
      const departGeo = stepLogs.find((l: any) => l.step === "checkout_km_saida" && l.geo)?.geo;
      let startLat: number | null = null;
      let startLng: number | null = null;
      if (departGeo?.latitude && departGeo?.longitude) {
        startLat = departGeo.latitude;
        startLng = departGeo.longitude;
      } else if (os.assignedEmployeeId) {
        const emp = await storage.getEmployee(os.assignedEmployeeId);
        if (emp?.addressLat && emp?.addressLng) {
          startLat = emp.addressLat;
          startLng = emp.addressLng;
        }
      }

      const hasOrigin = os.originLat != null && os.originLng != null;
      const hasDest = os.destinationLat != null && os.destinationLng != null;
      const hasStart = startLat != null && startLng != null;

      if (plannedRoute && hasStart && hasOrigin && hasDest) {
        const decoded = decodePolyline(plannedRoute);
        if (decoded.length > 0) {
          const firstPt = decoded[0];
          const distToStart = haversineDistance(firstPt.lat, firstPt.lng, startLat!, startLng!);
          if (distToStart > 5) {
            plannedRoute = null;
            await storage.updateServiceOrder(id, { route: null } as any).catch(() => {});
          }
        }
      }

      if (!plannedRoute && (hasOrigin || hasDest)) {
        const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
        if (apiKey) {
          try {
            let dirOrigin = "";
            let dirDest = "";
            let waypointsParam = "";

            if (hasStart && hasOrigin && hasDest) {
              dirOrigin = `${startLat},${startLng}`;
              dirDest = `${os.destinationLat},${os.destinationLng}`;
              waypointsParam = `&waypoints=${os.originLat},${os.originLng}`;
            } else if (hasOrigin && hasDest) {
              dirOrigin = `${os.originLat},${os.originLng}`;
              dirDest = `${os.destinationLat},${os.destinationLng}`;
            } else if (hasStart && hasOrigin) {
              dirOrigin = `${startLat},${startLng}`;
              dirDest = `${os.originLat},${os.originLng}`;
            } else if (hasStart && hasDest) {
              dirOrigin = `${startLat},${startLng}`;
              dirDest = `${os.destinationLat},${os.destinationLng}`;
            } else if (hasOrigin) {
              dirOrigin = `${os.originLat},${os.originLng}`;
              dirDest = `${os.originLat},${os.originLng}`;
            } else {
              dirOrigin = `${os.destinationLat},${os.destinationLng}`;
              dirDest = `${os.destinationLat},${os.destinationLng}`;
            }

            if (dirOrigin && dirDest) {
              const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${dirOrigin}&destination=${dirDest}${waypointsParam}&key=${apiKey}`;
              const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
              if (resp.ok) {
                const data = await resp.json();
                if (data.routes && data.routes.length > 0) {
                  plannedRoute = data.routes[0].overview_polyline?.points || null;
                  if (plannedRoute) {
                    await storage.updateServiceOrder(id, { route: plannedRoute }).catch(() => {});
                  }
                }
              }
            }
          } catch (_e) {}
        }
      }

      let segments: { lat: number; lng: number; onRoute: boolean }[] = [];
      let remainingRoute: { lat: number; lng: number }[] = [];

      if (positions.length > 0) {
        const decodedRoute = plannedRoute ? decodePolyline(plannedRoute) : [];
        let lastOnRouteIdx = -1;

        segments = positions.map((p) => {
          const pt = { lat: p.latitude, lng: p.longitude };
          if (decodedRoute.length === 0) return { ...pt, onRoute: true };
          const dist = distToPolyline(pt, decodedRoute);
          const onRoute = dist <= OFF_ROUTE_THRESHOLD_M;
          if (onRoute) {
            const idx = findClosestIndex(pt, decodedRoute);
            if (idx > lastOnRouteIdx) lastOnRouteIdx = idx;
          }
          return { ...pt, onRoute };
        });

        if (decodedRoute.length > 0) {
          const startIdx = lastOnRouteIdx >= 0 ? lastOnRouteIdx + 1 : 0;
          if (startIdx < decodedRoute.length) {
            remainingRoute = decodedRoute.slice(startIdx);
          }
        }
      } else if (plannedRoute) {
        remainingRoute = decodePolyline(plannedRoute);
      }

      res.json({
        plannedRoute,
        positions,
        segments,
        remainingRoute,
        start: hasStart ? { lat: startLat, lng: startLng, label: "Saída Base" } : null,
        origin: hasOrigin ? { lat: os.originLat, lng: os.originLng, label: os.origin || "Origem" } : null,
        destination: hasDest ? { lat: os.destinationLat, lng: os.destinationLng, label: os.destination || "Destino" } : null,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/service-orders/:id/relatorio-missao", requireAuth, async (req, res) => {
    try {
      const PDFDocument = (await import("pdfkit")).default;
      const path = await import("path");
      const fs = await import("fs");

      const os = await storage.getServiceOrder(Number(req.params.id));
      if (!os) return res.status(404).json({ message: "OS nao encontrada" });

      const client = os.clientId ? await storage.getClient(os.clientId) : null;
      const emp1 = os.assignedEmployeeId ? await storage.getEmployee(os.assignedEmployeeId) : null;
      const emp2 = os.assignedEmployee2Id ? await storage.getEmployee(os.assignedEmployee2Id) : null;
      const vehicle = os.vehicleId ? await storage.getVehicle(os.vehicleId) : null;
      const photos = await storage.getMissionPhotosByOS(os.id);
      const updates = await db.select().from(missionUpdates).where(eq(missionUpdates.serviceOrderId, os.id)).orderBy(missionUpdates.createdAt);
      const stepLogs: any[] = Array.isArray(os.stepLogs) ? os.stepLogs : [];

      let kitItems: any[] = [];
      if (os.kitId) {
        const rawItems = await storage.getWeaponKitItems(os.kitId);
        kitItems = await Promise.all(rawItems.map(async (item) => {
          const weapon = await storage.getWeapon(item.weaponId);
          return { ...item, weapon };
        }));
      }

      const sharpMod = (await import("sharp")).default;
      let osLogoBuffer: Buffer | null = null;
      try {
        const logoSrc = path.resolve("attached_assets/WhatsApp_Image_2026-03-19_at_18.44.30_1774459865687.jpeg");
        if (fs.existsSync(logoSrc)) {
          osLogoBuffer = await sharpMod(logoSrc).resize(120).png().toBuffer();
        }
      } catch {}

      const PAGE_W = 595.28;
      const PAGE_H = 841.89;
      const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false, bufferPages: true });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename=Relatorio_Missao_${os.osNumber}.pdf`);
      doc.pipe(res);

      const LM = 40;
      const RM = 40;
      const W = PAGE_W - LM - RM;
      const CONTENT_BOTTOM = PAGE_H - 36;
      const PRIMARY = "#111111";
      const ACCENT = "#0f172a";
      const BLUE = "#1d4ed8";
      const GRAY_BG = "#f1f5f9";
      const GRAY_BORDER = "#cbd5e1";
      const GRAY_TEXT = "#475569";
      const GREEN = "#047857";
      const AMBER = "#b45309";

      function sanitize(text: string | null | undefined): string {
        if (!text) return "--";
        return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, (ch) => {
          const map: Record<string, string> = {
            "\u00e1": "a", "\u00e0": "a", "\u00e3": "a", "\u00e2": "a",
            "\u00e9": "e", "\u00ea": "e", "\u00ed": "i", "\u00f3": "o",
            "\u00f4": "o", "\u00f5": "o", "\u00fa": "u", "\u00fc": "u",
            "\u00e7": "c", "\u00c1": "A", "\u00c0": "A", "\u00c3": "A",
            "\u00c2": "A", "\u00c9": "E", "\u00ca": "E", "\u00cd": "I",
            "\u00d3": "O", "\u00d4": "O", "\u00d5": "O", "\u00da": "U",
            "\u00dc": "U", "\u00c7": "C", "\u2014": "-", "\u2013": "-",
            "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
            "\u2026": "...", "\u00ba": "o", "\u00aa": "a", "\u00b0": "o",
            "\u2192": "->", "\u2190": "<-",
          };
          return map[ch] || "";
        });
      }

      function isInvalidDate(dt: Date): boolean {
        return isNaN(dt.getTime()) || dt.getTime() <= 0 || dt.getFullYear() <= 1970;
      }
      function fmtDate(d: any) {
        if (!d) return "--";
        const dt = new Date(d);
        if (isInvalidDate(dt)) return "--";
        return dt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      }
      function fmtTime(d: any) {
        if (!d) return "--";
        const dt = new Date(d);
        if (isInvalidDate(dt)) return "--";
        return dt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" });
      }
      function fmtTimeShort(d: any) {
        if (!d) return "--";
        const dt = new Date(d);
        if (isInvalidDate(dt)) return "--";
        return dt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
      }

      function gmapsUrl(lat: number | string | null, lng: number | string | null): string | null {
        if (lat == null || lng == null) return null;
        return `https://www.google.com/maps?q=${lat},${lng}`;
      }

      let pageNum = 0;
      function drawFooter() {
        doc.save();
        doc.rect(0, PAGE_H - 28, PAGE_W, 28).fill("#f8fafc");
        doc.moveTo(0, PAGE_H - 28).lineTo(PAGE_W, PAGE_H - 28).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
        doc.font("Helvetica").fontSize(6.5).fillColor(GRAY_TEXT)
          .text("Torres Vigilancia Patrimonial - Documento interno e confidencial. Reproducao proibida.", LM, PAGE_H - 20, { width: W * 0.7 });
        doc.font("Helvetica-Bold").fontSize(7).fillColor(ACCENT)
          .text(`${os.osNumber} - Pag. ${pageNum}`, LM, PAGE_H - 20, { width: W, align: "right" });
        doc.restore();
      }

      function newPage() {
        doc.addPage({ size: "A4", margin: 0 });
        pageNum++;
        drawFooter();
        doc.y = 40;
      }

      function ensureSpace(needed: number) {
        if (doc.y + needed > CONTENT_BOTTOM) newPage();
      }

      function sectionTitle(title: string) {
        ensureSpace(28);
        doc.y += 10;
        doc.save();
        doc.rect(LM, doc.y, W, 20).fill("#e2e8f0");
        doc.rect(LM, doc.y, W, 20).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(ACCENT)
          .text(title.toUpperCase(), LM, doc.y + 5.5, { width: W, align: "center", lineBreak: false });
        doc.restore();
        doc.y += 24;
      }

      function measureFieldCellHeight(w: number, value: string): number {
        const textW = w - 12;
        doc.font("Helvetica-Bold").fontSize(8);
        const textH = doc.heightOfString(value || "--", { width: textW });
        return Math.max(30, 16 + textH + 4);
      }

      function drawFieldCell(x: number, y: number, w: number, h: number, label: string, value: string, options?: { valueColor?: string; link?: string | null }) {
        const savedY = doc.y;
        doc.save();
        doc.rect(x, y, w, h).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
        doc.rect(x, y, w, 12).fill("#f8fafc");
        doc.rect(x, y, w, 12).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
        doc.font("Helvetica-Bold").fontSize(6).fillColor(GRAY_TEXT)
          .text(label.toUpperCase(), x + 6, y + 3, { width: w - 12, lineBreak: false });
        const valColor = options?.link ? BLUE : (options?.valueColor || PRIMARY);
        doc.font("Helvetica-Bold").fontSize(8).fillColor(valColor)
          .text(value || "--", x + 6, y + 16, { width: w - 12, link: options?.link || undefined });
        doc.restore();
        doc.y = savedY;
      }

      function drawKmTimeCard(x: number, y: number, w: number, h: number, label: string, value: string, color: string) {
        const savedY = doc.y;
        doc.save();
        doc.rect(x, y, w, h).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
        doc.rect(x, y, w, 14).fill("#e2e8f0");
        doc.rect(x, y, w, 14).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
        doc.font("Helvetica-Bold").fontSize(5.5).fillColor(GRAY_TEXT)
          .text(label, x + 2, y + 3, { width: w - 4, align: "center", lineBreak: false });
        doc.font("Helvetica-Bold").fontSize(14).fillColor(color)
          .text(value, x + 2, y + 18, { width: w - 4, align: "center", lineBreak: false });
        doc.restore();
        doc.y = savedY;
      }

      function drawTableHeader(cols: { text: string; w: number }[]) {
        doc.save();
        doc.rect(LM, doc.y, W, 18).fill("#e2e8f0");
        doc.rect(LM, doc.y, W, 18).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
        let cx = LM;
        for (const col of cols) {
          doc.font("Helvetica-Bold").fontSize(7).fillColor(GRAY_TEXT)
            .text(col.text, cx + 8, doc.y + 5, { width: col.w - 16, lineBreak: false });
          if (cx > LM) {
            doc.moveTo(cx, doc.y).lineTo(cx, doc.y + 18).lineWidth(0.3).strokeColor(GRAY_BORDER).stroke();
          }
          cx += col.w;
        }
        doc.restore();
        doc.y += 18;
      }

      function drawTableRow(cols: { text: string; w: number; bold?: boolean; color?: string }[], bg?: string) {
        const rH = 20;
        doc.save();
        doc.rect(LM, doc.y, W, rH).fill(bg || "#ffffff");
        doc.rect(LM, doc.y, W, rH).lineWidth(0.3).strokeColor(GRAY_BORDER).stroke();
        let cx = LM;
        for (const col of cols) {
          if (cx > LM) {
            doc.moveTo(cx, doc.y).lineTo(cx, doc.y + rH).lineWidth(0.3).strokeColor(GRAY_BORDER).stroke();
          }
          doc.font(col.bold ? "Helvetica-Bold" : "Helvetica").fontSize(7.5).fillColor(col.color || PRIMARY)
            .text(col.text, cx + 8, doc.y + 6, { width: col.w - 16, lineBreak: false });
          cx += col.w;
        }
        doc.restore();
        doc.y += rH;
      }

      newPage();

      doc.save();
      doc.rect(0, 0, PAGE_W, 72).fill(ACCENT);
      if (osLogoBuffer) {
        try { doc.image(osLogoBuffer, LM, 10, { width: 48 }); } catch {}
      }
      doc.font("Helvetica-Bold").fontSize(14).fillColor("#ffffff")
        .text("TORRES VIGILANCIA PATRIMONIAL", LM + 58, 14, { width: W - 170, lineBreak: false });
      doc.font("Helvetica").fontSize(7.5).fillColor("#94a3b8")
        .text("CNPJ: 36.982.392/0001-89", LM + 58, 32);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#e2e8f0")
        .text("RELATORIO DE MISSAO", LM + 58, 48);
      doc.rect(PAGE_W - RM - 90, 12, 90, 46).fill("#ffffff");
      doc.rect(PAGE_W - RM - 90, 12, 90, 46).lineWidth(0.5).strokeColor("#e2e8f0").stroke();
      doc.font("Helvetica").fontSize(6.5).fillColor(GRAY_TEXT)
        .text("ORDEM DE SERVICO", PAGE_W - RM - 84, 18, { width: 78, align: "center" });
      doc.font("Helvetica-Bold").fontSize(14).fillColor(BLUE)
        .text(os.osNumber, PAGE_W - RM - 84, 34, { width: 78, align: "center" });
      doc.restore();

      doc.y = 82;

      const statusLabel = os.status === "concluida" || os.status === "conclu\u00edda" ? "CONCLUIDA" : (os.status?.toUpperCase() || "--");
      const qW = W / 4;
      const clientName = sanitize(client?.name);
      const topRowH = Math.max(30, measureFieldCellHeight(qW, statusLabel), measureFieldCellHeight(qW, clientName));
      drawFieldCell(LM, doc.y, qW, topRowH, "Status", statusLabel, { valueColor: statusLabel === "CONCLUIDA" ? GREEN : BLUE });
      drawFieldCell(LM + qW, doc.y, qW, topRowH, "Prioridade", os.priority?.toUpperCase() || "--", { valueColor: os.priority === "imediata" ? "#dc2626" : PRIMARY });
      drawFieldCell(LM + qW * 2, doc.y, qW, topRowH, "Tipo", (os.type || "ESCOLTA").toUpperCase());
      drawFieldCell(LM + qW * 3, doc.y, qW, topRowH, "Cliente", clientName);
      doc.y += topRowH + 4;

      const origemStepGeo = stepLogs.find((l: any) => l.step === "em_transito_origem")?.geo;
      const destinoStepGeo = stepLogs.find((l: any) => l.step === "chegada_destino")?.geo;
      const origemText = os.origin || (origemStepGeo ? `GPS: ${Number(origemStepGeo.lat).toFixed(5)}, ${Number(origemStepGeo.lng).toFixed(5)}` : null);
      const destinoText = os.destination || (destinoStepGeo ? `GPS: ${Number(destinoStepGeo.lat).toFixed(5)}, ${Number(destinoStepGeo.lng).toFixed(5)}` : null);
      const origemLink = os.originLat && os.originLng ? gmapsUrl(os.originLat, os.originLng) : (origemStepGeo ? gmapsUrl(origemStepGeo.lat, origemStepGeo.lng) : null);
      const destinoLink = os.destinationLat && os.destinationLng ? gmapsUrl(os.destinationLat, os.destinationLng) : (destinoStepGeo ? gmapsUrl(destinoStepGeo.lat, destinoStepGeo.lng) : null);

      sectionTitle("Dados da Missao");
      const hW = W / 2;
      const fH = 30;
      const rowH1 = Math.max(measureFieldCellHeight(hW, sanitize(os.requesterName)), measureFieldCellHeight(hW, fmtDate(os.scheduledDate)));
      ensureSpace(rowH1);
      drawFieldCell(LM, doc.y, hW, rowH1, "Solicitante", sanitize(os.requesterName));
      drawFieldCell(LM + hW, doc.y, hW, rowH1, "Data Agendada", fmtDate(os.scheduledDate));
      doc.y += rowH1;
      const origemVal = sanitize(origemText);
      const destinoVal = sanitize(destinoText);
      const rowH2 = Math.max(measureFieldCellHeight(hW, origemVal), measureFieldCellHeight(hW, destinoVal));
      ensureSpace(rowH2);
      drawFieldCell(LM, doc.y, hW, rowH2, "Origem", origemVal, { link: origemLink });
      drawFieldCell(LM + hW, doc.y, hW, rowH2, "Destino", destinoVal, { link: destinoLink });
      doc.y += rowH2;
      const rowH3 = Math.max(measureFieldCellHeight(hW, fmtDate(os.missionStartedAt)), measureFieldCellHeight(hW, fmtDate(os.completedDate)));
      ensureSpace(rowH3);
      drawFieldCell(LM, doc.y, hW, rowH3, "Inicio da Missao", fmtDate(os.missionStartedAt), { valueColor: BLUE });
      drawFieldCell(LM + hW, doc.y, hW, rowH3, "Conclusao", fmtDate(os.completedDate), { valueColor: GREEN });
      doc.y += rowH3;
      if (os.route) {
        const routeVal = sanitize(os.route);
        const routeH = measureFieldCellHeight(W, routeVal);
        ensureSpace(routeH);
        drawFieldCell(LM, doc.y, W, routeH, "Rota", routeVal);
        doc.y += routeH;
      }
      if (os.description) {
        const descVal = sanitize(os.description);
        const descH = measureFieldCellHeight(W, descVal);
        ensureSpace(descH);
        drawFieldCell(LM, doc.y, W, descH, "Observacoes", descVal);
        doc.y += descH;
      }
      doc.y += 6;

      sectionTitle("Equipe Operacional");
      const teamW = W / 2;
      function measureTeamCardHeight(emp: any, hasEmp: boolean): number {
        if (!hasEmp || !emp) return 52;
        let h = 14 + 4;
        doc.font("Helvetica-Bold").fontSize(8.5);
        h += doc.heightOfString(sanitize(emp.fullName || emp.name).toUpperCase(), { width: teamW - 16 }) + 2;
        if (emp.cpf) h += 12;
        if ((emp as any).cnhNumber) h += 12;
        return Math.max(52, h + 4);
      }
      const teamH1 = measureTeamCardHeight(emp1, !!emp1);
      const teamH2 = measureTeamCardHeight(emp2, !!emp2);
      const teamH = Math.max(teamH1, teamH2);
      ensureSpace(teamH);
      const teamBaseY = doc.y;
      if (emp1) {
        doc.save();
        doc.rect(LM, teamBaseY, teamW, teamH).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
        doc.rect(LM, teamBaseY, teamW, 14).fill("#dbeafe");
        doc.rect(LM, teamBaseY, teamW, 14).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
        doc.font("Helvetica-Bold").fontSize(6.5).fillColor(BLUE).text("AGENTE PRINCIPAL", LM + 8, teamBaseY + 3.5, { width: teamW - 16 });
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(PRIMARY).text(sanitize(emp1.fullName || emp1.name).toUpperCase(), LM + 8, teamBaseY + 18, { width: teamW - 16 });
        let emp1Y = teamBaseY + 18;
        doc.font("Helvetica-Bold").fontSize(8.5);
        emp1Y += doc.heightOfString(sanitize(emp1.fullName || emp1.name).toUpperCase(), { width: teamW - 16 }) + 2;
        if (emp1.cpf) { doc.font("Helvetica").fontSize(7).fillColor(GRAY_TEXT).text(`CPF: ${emp1.cpf}`, LM + 8, emp1Y, { width: teamW - 16 }); emp1Y += 12; }
        if ((emp1 as any).cnhNumber) { doc.font("Helvetica").fontSize(7).fillColor(GRAY_TEXT).text(`CNH: ${(emp1 as any).cnhNumber}`, LM + 8, emp1Y, { width: teamW - 16 }); }
        doc.restore();
      }
      if (emp2) {
        const ex = LM + teamW;
        doc.save();
        doc.rect(ex, teamBaseY, teamW, teamH).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
        doc.rect(ex, teamBaseY, teamW, 14).fill("#dbeafe");
        doc.rect(ex, teamBaseY, teamW, 14).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
        doc.font("Helvetica-Bold").fontSize(6.5).fillColor(BLUE).text("AGENTE AUXILIAR", ex + 8, teamBaseY + 3.5, { width: teamW - 16 });
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(PRIMARY).text(sanitize(emp2.fullName || emp2.name).toUpperCase(), ex + 8, teamBaseY + 18, { width: teamW - 16 });
        let emp2Y = teamBaseY + 18;
        doc.font("Helvetica-Bold").fontSize(8.5);
        emp2Y += doc.heightOfString(sanitize(emp2.fullName || emp2.name).toUpperCase(), { width: teamW - 16 }) + 2;
        if (emp2.cpf) { doc.font("Helvetica").fontSize(7).fillColor(GRAY_TEXT).text(`CPF: ${emp2.cpf}`, ex + 8, emp2Y, { width: teamW - 16 }); }
        doc.restore();
      }
      doc.y = teamBaseY + teamH + 6;

      if (vehicle) {
        ensureSpace(36);
        const vColW = W / 3;
        drawFieldCell(LM, doc.y, vColW, fH, "Viatura", `${vehicle.plate} - ${vehicle.brand || ""} ${vehicle.model || ""}`.trim());
        drawFieldCell(LM + vColW, doc.y, vColW, fH, "Chassi", vehicle.chassi || "--");
        drawFieldCell(LM + vColW * 2, doc.y, vColW, fH, "RENAVAM", vehicle.renavam || "--");
        doc.y += fH + 6;
      }

      if (kitItems.length > 0) {
        sectionTitle("Armamento Designado");
        const colW = [W * 0.22, W * 0.22, W * 0.18, W * 0.38];
        drawTableHeader([
          { text: "TIPO", w: colW[0] },
          { text: "MODELO", w: colW[1] },
          { text: "CALIBRE", w: colW[2] },
          { text: "No. SERIE", w: colW[3] },
        ]);
        for (let i = 0; i < kitItems.length; i++) {
          const ww = kitItems[i].weapon;
          if (ww) {
            ensureSpace(22);
            drawTableRow([
              { text: ww.type || "--", w: colW[0] },
              { text: ww.model || "--", w: colW[1] },
              { text: ww.caliber || "--", w: colW[2] },
              { text: ww.serialNumber || "--", w: colW[3], bold: true },
            ], i % 2 === 0 ? "#ffffff" : "#f8fafc");
          }
        }
        doc.y += 6;
      }

      if (os.escortedDriverName || os.escortedVehiclePlate) {
        sectionTitle("Veiculo Escoltado");
        ensureSpace(34);
        const escColW = W / 3;
        drawFieldCell(LM, doc.y, escColW, fH, "Motorista", sanitize(os.escortedDriverName));
        drawFieldCell(LM + escColW, doc.y, escColW, fH, "Telefone", sanitize(os.escortedDriverPhone));
        drawFieldCell(LM + escColW * 2, doc.y, escColW, fH, "Placa", sanitize(os.escortedVehiclePlate));
        doc.y += fH + 6;
      }

      const kmSaidaPhoto = photos.find(p => p.step === "km_saida");
      const kmChegadaPhoto = [...photos].reverse().find(p => p.step === "km_chegada");
      const kmFinalPhoto = [...photos].reverse().find(p => p.step === "km_final");
      const baseHodo = [...photos].reverse().find(p => p.step === "base_hodometro");

      sectionTitle("Quilometragem");
      ensureSpace(48);
      const kmBoxW = W / 4;
      const kmY = doc.y;
      const kmCards = [
        { label: "KM SAIDA BASE", value: kmSaidaPhoto?.kmValue ? String(kmSaidaPhoto.kmValue) : "--" },
        { label: "KM CHEGADA ORIGEM", value: kmChegadaPhoto?.kmValue ? String(kmChegadaPhoto.kmValue) : "--" },
        { label: "KM CHEGADA DESTINO", value: kmFinalPhoto?.kmValue ? String(kmFinalPhoto.kmValue) : "--" },
        { label: "KM RETORNO BASE", value: baseHodo?.kmValue ? String(baseHodo.kmValue) : (os.baseReturnKm ? String(os.baseReturnKm) : "--") },
      ];
      for (let i = 0; i < 4; i++) {
        drawKmTimeCard(LM + i * kmBoxW, kmY, kmBoxW, 40, kmCards[i].label, kmCards[i].value, BLUE);
      }
      doc.y = kmY + 44;

      const allKmValues = photos.filter(p => p.kmValue).map(p => p.kmValue!);
      if (os.baseReturnKm) allKmValues.push(os.baseReturnKm);
      const maxKm = allKmValues.length > 0 ? Math.max(...allKmValues) : 0;
      const minKm = kmSaidaPhoto?.kmValue || (allKmValues.length > 0 ? Math.min(...allKmValues) : 0);
      const totalKm = maxKm - minKm;
      if (totalKm > 0) {
        doc.save();
        doc.rect(LM, doc.y, W, 20).fill("#d1fae5");
        doc.rect(LM, doc.y, W, 20).lineWidth(0.5).strokeColor("#a7f3d0").stroke();
        doc.font("Helvetica-Bold").fontSize(9).fillColor(GREEN)
          .text(`KM TOTAL PERCORRIDO: ${totalKm} km`, LM + 8, doc.y + 5, { width: W - 16, align: "center", lineBreak: false });
        doc.restore();
        doc.y += 24;
      }

      const tSaida = stepLogs.find((l: any) => l.step === "checkout_km_saida");
      const tChegCliente = stepLogs.find((l: any) => l.step === "em_transito_origem");
      const tChegDestino = stepLogs.find((l: any) => l.step === "em_transito_destino") || stepLogs.find((l: any) => l.step === "chegada_destino");
      const tFim = [...stepLogs].reverse().find((l: any) => l.step === "encerrada" || l.step === "finalizada");

      sectionTitle("Horarios da Missao");
      ensureSpace(48);
      const timeBoxW = W / 4;
      const timeY = doc.y;
      const timeCards = [
        { label: "SAIDA DA BASE", value: fmtTimeShort(tSaida?.completedAt) },
        { label: "CHEGADA CLIENTE", value: fmtTimeShort(tChegCliente?.completedAt) },
        { label: "CHEGADA DESTINO", value: fmtTimeShort(tChegDestino?.completedAt) },
        { label: "FIM DE MISSAO", value: fmtTimeShort(tFim?.completedAt) },
      ];
      for (let i = 0; i < 4; i++) {
        drawKmTimeCard(LM + i * timeBoxW, timeY, timeBoxW, 40, timeCards[i].label, timeCards[i].value, i === 3 ? GREEN : BLUE);
      }
      doc.y = timeY + 44;

      if (os.baseCleanStatus) {
        ensureSpace(24);
        const cleanLabel = os.baseCleanStatus.toUpperCase();
        const cleanColor = cleanLabel === "LIMPA" ? GREEN : "#dc2626";
        const cleanBg = cleanLabel === "LIMPA" ? "#d1fae5" : "#fee2e2";
        doc.save();
        doc.rect(LM, doc.y, W, 20).fill(cleanBg);
        doc.rect(LM, doc.y, W, 20).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(cleanColor)
          .text(`Limpeza: ${cleanLabel}${os.baseChecklistConfirmed ? "  |  Checklist: CONFIRMADO" : ""}${os.baseCleanNotes ? `  |  Obs: ${sanitize(os.baseCleanNotes)}` : ""}`,
            LM + 8, doc.y + 5, { width: W - 16, lineBreak: false });
        doc.restore();
        doc.y += 24;
      }

      if (stepLogs.length > 0) {
        sectionTitle("Cronologia da Missao");
        const stepLabels: Record<string, string> = {
          aguardando: "Ciencia da Missao", checkout_armamento: "Conf. Armamento",
          checkout_viatura: "Conf. Viatura", checkout_km_saida: "Registro KM Saida", em_transito_origem: "Em Transito p/ Origem",
          checkin_chegada_km: "Chegada KM Registrado", checkin_veiculo_escoltado: "Veic. Escoltado Conferido",
          checkin_dados_motorista: "Dados Motorista Conferidos", iniciar_missao: "Inicio da Missao",
          em_transito_destino: "Em Transito p/ Destino", chegada_destino: "Chegada ao Destino",
          checkout_km_final: "Registro KM Final", checkout_viatura_retorno: "Conf. Viatura Retorno",
          finalizada: "Missao Finalizada", retorno_base: "Retorno a Base",
          chegada_base: "Chegada na Base", encerrada: "Operacao Encerrada",
        };
        const stepColors: Record<string, string> = {
          aguardando: "#6366f1", checkout_armamento: AMBER, checkout_viatura: AMBER,
          checkout_km_saida: BLUE, em_transito_origem: BLUE, checkin_chegada_km: "#0891b2", checkin_veiculo_escoltado: "#0891b2",
          checkin_dados_motorista: "#0891b2", iniciar_missao: GREEN, em_transito_destino: BLUE,
          chegada_destino: GREEN, checkout_km_final: BLUE, checkout_viatura_retorno: AMBER,
          finalizada: GREEN, retorno_base: BLUE, chegada_base: GREEN, encerrada: GREEN,
        };

        const stepToPhotoStep: Record<string, string> = {
          checkout_km_saida: "km_saida",
          checkin_chegada_km: "km_chegada",
          checkout_km_final: "km_final",
          chegada_destino: "km_final",
        };

        const colWStep = Math.floor(W * 0.34);
        const colWTime = Math.floor(W * 0.14);
        const colWKm = Math.floor(W * 0.14);
        const colWAgent = W - colWStep - colWTime - colWKm;
        drawTableHeader([
          { text: "ETAPA", w: colWStep },
          { text: "HORARIO", w: colWTime },
          { text: "KM", w: colWKm },
          { text: "AGENTE", w: colWAgent },
        ]);

        for (let i = 0; i < stepLogs.length; i++) {
          const log = stepLogs[i];
          const stepName = stepLabels[log.step] || log.step;
          const dotColor = stepColors[log.step] || BLUE;
          const rH = log.geo ? 30 : 20;
          ensureSpace(rH + 2);

          const photoStep = stepToPhotoStep[log.step];
          const matchedPhoto = photoStep ? photos.find(p => p.step === photoStep) : null;
          const kmText = matchedPhoto?.kmValue ? String(matchedPhoto.kmValue) : "";

          const rowBg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
          doc.save();
          doc.rect(LM, doc.y, W, rH).fill(rowBg);
          doc.rect(LM, doc.y, W, rH).lineWidth(0.3).strokeColor(GRAY_BORDER).stroke();
          doc.moveTo(LM + colWStep, doc.y).lineTo(LM + colWStep, doc.y + rH).lineWidth(0.3).strokeColor(GRAY_BORDER).stroke();
          doc.moveTo(LM + colWStep + colWTime, doc.y).lineTo(LM + colWStep + colWTime, doc.y + rH).lineWidth(0.3).strokeColor(GRAY_BORDER).stroke();
          doc.moveTo(LM + colWStep + colWTime + colWKm, doc.y).lineTo(LM + colWStep + colWTime + colWKm, doc.y + rH).lineWidth(0.3).strokeColor(GRAY_BORDER).stroke();

          doc.circle(LM + 14, doc.y + 8, 3).fill(dotColor);
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor(PRIMARY)
            .text(stepName, LM + 24, doc.y + 5, { width: colWStep - 32, lineBreak: false });
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor(dotColor)
            .text(fmtTime(log.completedAt), LM + colWStep + 8, doc.y + 5, { width: colWTime - 16, lineBreak: false });
          if (kmText) {
            doc.font("Helvetica-Bold").fontSize(7.5).fillColor(PRIMARY)
              .text(kmText, LM + colWStep + colWTime + 8, doc.y + 5, { width: colWKm - 16, lineBreak: false });
          }

          const agentName = sanitize(log.agentName);
          const shortAgent = agentName.length > 28 ? agentName.substring(0, 28) + "..." : agentName;
          doc.font("Helvetica").fontSize(7).fillColor(GRAY_TEXT)
            .text(shortAgent, LM + colWStep + colWTime + colWKm + 8, doc.y + 6, { width: colWAgent - 16, lineBreak: false });

          if (log.geo) {
            const gpsLink = gmapsUrl(log.geo.lat, log.geo.lng);
            doc.font("Helvetica").fontSize(5.5).fillColor("#6366f1")
              .text(`GPS: ${Number(log.geo.lat).toFixed(5)}, ${Number(log.geo.lng).toFixed(5)}`, LM + 24, doc.y + 18, { width: colWStep - 32, lineBreak: false, link: gpsLink || undefined });
          }
          doc.restore();
          doc.y += rH;
        }
        doc.y += 6;
      }

      if (updates.length > 0) {
        sectionTitle("Atualizacoes do Agente em Campo");
        const updStepLabels: Record<string, string> = {
          em_transito_origem: "Em Transito p/ Origem", em_transito_destino: "Em Transito p/ Destino",
          checkin_chegada_km: "Chegada na Origem", iniciar_missao: "Inicio de Missao",
          checkout_km_saida: "KM Saida", checkout_viatura: "Conf. Viatura",
          checkin_veiculo_escoltado: "Veic. Escoltado", checkin_dados_motorista: "Dados Motorista",
          chegada_destino: "Chegada Destino", checkout_km_final: "KM Final",
          checkout_viatura_retorno: "Conf. Retorno", encerrada: "Encerrada",
        };
        for (const upd of updates) {
          const msgText = sanitize(upd.message);
          let imgBuf: Buffer | null = null;
          if (upd.photoUrl) {
            try {
              const isB64 = upd.photoUrl.startsWith("data:");
              if (isB64) {
                const b64 = upd.photoUrl.split(",")[1];
                imgBuf = Buffer.from(b64, "base64");
              }
            } catch {}
          }

          const hasPhoto = !!imgBuf;
          const photoW = hasPhoto ? 130 : 0;
          const photoH = hasPhoto ? 100 : 0;
          const infoX = LM + (hasPhoto ? photoW + 12 : 12);
          const infoW = W - (hasPhoto ? photoW + 20 : 20);
          const charsPerLine = Math.floor(infoW / 4.2);
          const msgLines = Math.max(1, Math.ceil(msgText.length / charsPerLine));
          const msgBlockH = msgLines * 10;
          const infoContentH = 22 + 14 + msgBlockH + (upd.latitude ? 14 : 0) + (upd.missionStep ? 12 : 0);
          const cardH = Math.max(hasPhoto ? photoH + 10 : 0, infoContentH) + 4;
          ensureSpace(cardH + 8);

          const cardY = doc.y;
          doc.save();
          doc.rect(LM, cardY, W, cardH).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
          doc.rect(LM, cardY, 4, cardH).fill(BLUE);

          if (hasPhoto && imgBuf) {
            doc.save();
            try {
              doc.rect(LM + 8, cardY + 5, photoW, photoH).clip();
              doc.image(imgBuf, LM + 8, cardY + 5, { width: photoW, height: photoH });
            } catch {} finally { doc.restore(); }
            doc.rect(LM + 8, cardY + 5, photoW, photoH).lineWidth(0.3).strokeColor(GRAY_BORDER).stroke();
          }

          let curY = cardY + 6;
          doc.font("Helvetica-Bold").fontSize(8).fillColor(BLUE)
            .text(fmtTime(upd.createdAt), infoX, curY, { width: 70, lineBreak: false });
          doc.font("Helvetica-Bold").fontSize(8).fillColor(PRIMARY)
            .text(sanitize(upd.employeeName) || "Agente", infoX + 72, curY, { width: infoW - 72, lineBreak: false });
          curY += 14;

          if (upd.missionStep) {
            const stepBadge = updStepLabels[upd.missionStep] || upd.missionStep;
            const badgeW = Math.min(stepBadge.length * 5.5 + 12, infoW);
            doc.save();
            doc.rect(infoX, curY, badgeW, 12).fill("#e0e7ff");
            doc.font("Helvetica-Bold").fontSize(6).fillColor("#4338ca")
              .text(stepBadge, infoX + 4, curY + 3, { width: badgeW - 8, lineBreak: false });
            doc.restore();
            curY += 14;
          }

          doc.font("Helvetica").fontSize(7.5).fillColor(PRIMARY)
            .text(msgText, infoX, curY, { width: infoW });
          curY += msgBlockH + 4;

          if (upd.latitude && upd.longitude) {
            const updGpsLink = gmapsUrl(upd.latitude, upd.longitude);
            doc.font("Helvetica").fontSize(5.5).fillColor("#6366f1")
              .text(`GPS: ${Number(upd.latitude).toFixed(5)}, ${Number(upd.longitude).toFixed(5)}`, infoX, curY, { width: infoW, lineBreak: false, link: updGpsLink || undefined });
          }

          doc.restore();
          doc.y = cardY + cardH + 6;
        }
        doc.y += 6;
      }

      if (photos.length > 0) {
        sectionTitle("Registro Fotografico");
        const photoLabels: Record<string, string> = {
          arma_pistola_1: "Pistola 1", arma_pistola_2: "Pistola 2", arma_espingarda: "Espingarda",
          viatura_frente: "Viatura - Frente", viatura_lateral_esq: "Viatura - Lat. Esq.",
          viatura_lateral_dir: "Viatura - Lat. Dir.", viatura_traseira: "Viatura - Traseira",
          km_saida: "Hodometro - Saida", km_chegada: "Hodometro - Chegada", agente_equipado: "Agente Equipado",
          escoltado_frente: "Escoltado - Frente", escoltado_traseira: "Escoltado - Traseira",
          foto_local_destino: "Local de Destino", km_final: "Hodometro - Final",
          viatura_retorno_frente: "Retorno - Frente", viatura_retorno_lateral_esq: "Retorno - Lat. Esq.",
          viatura_retorno_lateral_dir: "Retorno - Lat. Dir.", viatura_retorno_traseira: "Retorno - Traseira",
          base_viatura_frente: "Base - Frente", base_viatura_lateral_esq: "Base - Lat. Esq.",
          base_viatura_lateral_dir: "Base - Lat. Dir.", base_viatura_traseira: "Base - Traseira",
          base_hodometro: "Base - Hodometro",
        };

        const photoGroups: { title: string; steps: string[] }[] = [
          { title: "CONFERENCIA ARMAMENTO", steps: ["arma_pistola_1", "arma_pistola_2", "arma_espingarda"] },
          { title: "CONFERENCIA VIATURA - SAIDA", steps: ["viatura_frente", "viatura_lateral_esq", "viatura_lateral_dir", "viatura_traseira"] },
          { title: "HODOMETRO E AGENTE", steps: ["km_saida", "km_chegada", "agente_equipado"] },
          { title: "VEICULO ESCOLTADO", steps: ["escoltado_frente", "escoltado_traseira"] },
          { title: "LOCAL DE DESTINO E KM FINAL", steps: ["foto_local_destino", "km_final"] },
          { title: "VIATURA - RETORNO", steps: ["viatura_retorno_frente", "viatura_retorno_lateral_esq", "viatura_retorno_lateral_dir", "viatura_retorno_traseira"] },
          { title: "CHEGADA NA BASE", steps: ["base_viatura_frente", "base_viatura_lateral_esq", "base_viatura_lateral_dir", "base_viatura_traseira", "base_hodometro"] },
        ];

        const imgPerRow = 2;
        const imgGap = 10;
        const imgW = Math.floor((W - imgGap) / imgPerRow);
        const imgH = 140;

        for (const group of photoGroups) {
          const groupPhotos = photos.filter(p => group.steps.includes(p.step) && p.photoData);
          if (groupPhotos.length === 0) continue;

          ensureSpace(30);
          doc.save();
          doc.rect(LM, doc.y, W, 18).fill("#e2e8f0");
          doc.rect(LM, doc.y, W, 18).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
          doc.font("Helvetica-Bold").fontSize(7).fillColor(ACCENT)
            .text(group.title, LM, doc.y + 5, { width: W, align: "center", lineBreak: false });
          doc.restore();
          doc.y += 22;

          let col = 0;
          let rowStartY = doc.y;

          for (const photo of groupPhotos) {
            try {
              if (!photo.photoData) continue;
              const isBase64 = photo.photoData.startsWith("data:");
              const base64Data = isBase64 ? photo.photoData.split(",")[1] : photo.photoData;
              const imgBuf = Buffer.from(base64Data, "base64");

              if (col === 0) {
                ensureSpace(imgH + 28);
                rowStartY = doc.y;
              }

              const x = LM + col * (imgW + imgGap);

              doc.save();
              doc.rect(x, rowStartY, imgW, imgH + 22).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
              doc.rect(x, rowStartY, imgW, 18).fill("#f8fafc");
              doc.rect(x, rowStartY, imgW, 18).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
              doc.font("Helvetica-Bold").fontSize(7).fillColor(BLUE)
                .text(photoLabels[photo.step] || photo.step, x + 6, rowStartY + 3, { width: imgW * 0.55, lineBreak: false });
              const timeStr = fmtTimeShort(photo.createdAt);
              const kmStr = photo.kmValue ? `KM: ${photo.kmValue}` : "";
              doc.font("Helvetica").fontSize(6).fillColor(GRAY_TEXT)
                .text([timeStr, kmStr].filter(Boolean).join(" | "), x + 6, rowStartY + 10, { width: imgW - 12, lineBreak: false });
              doc.restore();

              doc.save();
              try {
                doc.rect(x + 1, rowStartY + 18, imgW - 2, imgH + 2).clip();
                doc.image(imgBuf, x + 1, rowStartY + 18, { width: imgW - 2, height: imgH + 2 });
              } catch {} finally {
                doc.restore();
              }

              col++;
              if (col >= imgPerRow) {
                col = 0;
                rowStartY += imgH + 26;
                doc.y = rowStartY;
              }
            } catch {}
          }
          if (col > 0) {
            doc.y = rowStartY + imgH + 26;
          }
          doc.y += 6;
        }
      }

      // === BOLETIM DE MEDICAO (Financial Section) ===
      try {
        const kmSaidaPhoto = photos.find((p: any) => p.step === "km_saida");
        const kmChegadaPhoto = [...photos].reverse().find((p: any) => p.step === "km_chegada");
        const kmFinalPhoto = photos.find((p: any) => p.step === "km_final");
        const kmInicial = kmChegadaPhoto?.kmValue || kmSaidaPhoto?.kmValue || 0;
        let kmFinal = kmFinalPhoto?.kmValue || 0;
        if (kmFinal <= kmInicial) kmFinal = kmInicial;

        const scheduledTime = os.scheduledDate ? new Date(os.scheduledDate).toTimeString().slice(0, 5) : undefined;
        const startTime = os.missionStartedAt ? new Date(os.missionStartedAt as string).toTimeString().slice(0, 5) : undefined;
        let endTimeCalc: string | undefined;
        if (os.completedDate) {
          endTimeCalc = new Date(os.completedDate as string).toTimeString().slice(0, 5);
        } else {
          endTimeCalc = new Date().toTimeString().slice(0, 5);
        }

        let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
        if (os.escortContractId) {
          const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", os.escortContractId).limit(1);
          if (cc?.length) contrato = cc[0];
        } else if (os.clientId) {
          const { data: clientContracts } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", os.clientId).eq("status", "Ativo").limit(1);
          if (clientContracts?.length) contrato = clientContracts[0];
        }

        const resultado = calcularEscolta({
          km_inicial: kmInicial, km_final: kmFinal, km_vazio: 0,
          horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
          horario_inicio: startTime, horario_fim: endTimeCalc, horario_agendado: scheduledTime,
          despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0, contrato,
        });

        const isLive = os.status !== "concluida" && os.missionStatus !== "encerrada";
        const BRL = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

        ensureSpace(240);
        doc.y += 4;
        sectionTitle(isLive ? "Boletim de Medicao (Estimativa em Tempo Real)" : "Boletim de Medicao");

        if (isLive) {
          doc.font("Helvetica-Bold").fontSize(7).fillColor("#dc2626")
            .text("* Valores estimados com base nos dados disponiveis ate o momento. O calculo final sera feito apos encerramento da missao.", LM, doc.y, { width: W });
          doc.y += 12;
        }

        const tblY = doc.y;
        const col1W = W * 0.55;
        const col2W = W * 0.45;

        doc.save();
        doc.rect(LM, tblY, W, 18).fill("#0f172a");
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff")
          .text("FATURAMENTO (Cliente)", LM + 6, tblY + 4, { width: col1W - 12 });
        doc.text("PAGAMENTO (VRP/Agente)", LM + col1W + 6, tblY + 4, { width: col2W - 12 });
        doc.restore();
        doc.y = tblY + 18;

        const fatRows: [string, string][] = [
          ["KM Total", `${resultado.km_total} km`],
          ["KM Carregado", `${resultado.km_carregado} km`],
          ["KM Faturado (franquia)", `${resultado.km_faturado} km`],
          ["Valor KM Carregado", BRL(resultado.faturamento.km_carregado)],
          ["Valor KM Vazio", BRL(resultado.faturamento.km_vazio)],
          ["Estadia", BRL(resultado.faturamento.estadia)],
          ["Adicional Noturno", BRL(resultado.faturamento.adicional_noturno)],
          ["Pernoite/Diaria", BRL(resultado.faturamento.diaria)],
        ];
        const pagRows: [string, string][] = [
          ["VRP Base", BRL(resultado.pagamento.vrp)],
          ["Hora Extra / Periculosidade", BRL(resultado.pagamento.periculosidade)],
          ["Adicional Noturno", BRL(resultado.pagamento.adicional_noturno)],
          ["Reembolsos", BRL(resultado.pagamento.reembolsos)],
          ["", ""],
          ["Horas Trabalhadas", `${resultado.horas_trabalhadas.toFixed(1)}h`],
          [resultado.is_noturno ? "Noturno: SIM" : "Noturno: NAO", ""],
          ["", ""],
        ];

        const maxRows = Math.max(fatRows.length, pagRows.length);
        for (let i = 0; i < maxRows; i++) {
          const rowY = doc.y;
          const bg = i % 2 === 0 ? "#f8fafc" : "#ffffff";
          doc.save();
          doc.rect(LM, rowY, W, 14).fill(bg);
          doc.rect(LM, rowY, W, 14).lineWidth(0.3).strokeColor(GRAY_BORDER).stroke();
          doc.moveTo(LM + col1W, rowY).lineTo(LM + col1W, rowY + 14).lineWidth(0.3).strokeColor(GRAY_BORDER).stroke();
          doc.restore();

          if (fatRows[i]) {
            doc.font("Helvetica").fontSize(7).fillColor(GRAY_TEXT)
              .text(fatRows[i][0], LM + 6, rowY + 3, { width: col1W * 0.55, lineBreak: false });
            doc.font("Helvetica-Bold").fontSize(7).fillColor(PRIMARY)
              .text(fatRows[i][1], LM + col1W * 0.55, rowY + 3, { width: col1W * 0.4, align: "right", lineBreak: false });
          }
          if (pagRows[i]) {
            doc.font("Helvetica").fontSize(7).fillColor(GRAY_TEXT)
              .text(pagRows[i][0], LM + col1W + 6, rowY + 3, { width: col2W * 0.55, lineBreak: false });
            doc.font("Helvetica-Bold").fontSize(7).fillColor(PRIMARY)
              .text(pagRows[i][1], LM + col1W + col2W * 0.55, rowY + 3, { width: col2W * 0.4, align: "right", lineBreak: false });
          }
          doc.y = rowY + 14;
        }

        const totY = doc.y;
        doc.save();
        doc.rect(LM, totY, col1W, 20).fill("#047857");
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff")
          .text("TOTAL FATURAMENTO", LM + 6, totY + 4, { width: col1W * 0.55 });
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
          .text(BRL(resultado.fat_total), LM + col1W * 0.55, totY + 4, { width: col1W * 0.4, align: "right" });
        doc.restore();

        doc.save();
        doc.rect(LM + col1W, totY, col2W, 20).fill("#dc2626");
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff")
          .text("TOTAL PAGAMENTO", LM + col1W + 6, totY + 4, { width: col2W * 0.55 });
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
          .text(BRL(resultado.pag_total), LM + col1W + col2W * 0.55, totY + 4, { width: col2W * 0.4, align: "right" });
        doc.restore();
        doc.y = totY + 20;

        const resY = doc.y;
        doc.save();
        const resColor = resultado.resultado.liquido >= 0 ? "#047857" : "#dc2626";
        doc.rect(LM, resY, W, 22).fill("#f1f5f9");
        doc.rect(LM, resY, W, 22).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(PRIMARY)
          .text("RESULTADO LIQUIDO", LM + 6, resY + 5);
        doc.font("Helvetica-Bold").fontSize(10).fillColor(resColor)
          .text(BRL(resultado.resultado.liquido), LM + W * 0.35, resY + 4, { width: W * 0.25, align: "right" });
        doc.font("Helvetica").fontSize(7).fillColor(GRAY_TEXT)
          .text(`Margem: ${resultado.resultado.margem_pct.toFixed(1)}%`, LM + W * 0.65, resY + 6, { width: W * 0.3, align: "right" });
        doc.restore();
        doc.y = resY + 28;
      } catch (calcErr: any) {
        console.error("[relatorio-missao] Calculo financeiro error (non-fatal):", calcErr.message);
      }

      ensureSpace(50);
      doc.y += 8;
      doc.save();
      doc.moveTo(LM, doc.y).lineTo(LM + W, doc.y).lineWidth(0.5).strokeColor(GRAY_BORDER).stroke();
      doc.restore();
      doc.y += 10;
      doc.font("Helvetica").fontSize(6.5).fillColor(GRAY_TEXT)
        .text(`Relatorio gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, LM, doc.y, { width: W, align: "center" });
      doc.y += 12;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(ACCENT)
        .text("Torres Vigilancia Patrimonial", LM, doc.y, { width: W, align: "center" });
      doc.y += 12;
      doc.font("Helvetica").fontSize(6).fillColor(GRAY_TEXT)
        .text("Documento interno e confidencial - Reproducao proibida sem autorizacao", LM, doc.y, { width: W, align: "center" });

      doc.end();
    } catch (error: any) {
      console.error("Mission report PDF error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Erro ao gerar relatorio da missao" });
      }
    }
  });

  app.get("/api/trips", requireAuth, async (_req, res) => {
    const data = await storage.getTrips();
    res.json(data);
  });

  app.get("/api/trips/:id", requireAuth, async (req, res) => {
    const data = await storage.getTrip(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Viagem não encontrada" });
    res.json(data);
  });

  app.post("/api/trips", requireAuth, async (req, res) => {
    const parsed = insertTripSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.createTrip(parsed.data);
    res.status(201).json(data);
  });

  app.patch("/api/trips/:id", requireAuth, async (req, res) => {
    const parsed = insertTripSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.updateTrip(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Viagem não encontrada" });
    res.json(data);
  });

  app.delete("/api/trips/:id", requireAuth, requireDiretoria, async (req, res) => {
    await storage.deleteTrip(Number(req.params.id));
    res.json({ message: "Viagem removida" });
  });

  app.get("/api/maintenance", requireAuth, async (_req, res) => {
    const data = await storage.getVehicleMaintenances();
    res.json(data);
  });

  app.get("/api/maintenance/:id", requireAuth, async (req, res) => {
    const data = await storage.getVehicleMaintenance(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Manutenção não encontrada" });
    res.json(data);
  });

  app.post("/api/maintenance", requireAuth, async (req, res) => {
    const parsed = insertVehicleMaintenanceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.createVehicleMaintenance(parsed.data);

    if (data && Number(parsed.data.cost) > 0) {
      const vehicle = parsed.data.vehicleId ? await storage.getVehicle(parsed.data.vehicleId) : null;
      const plateStr = vehicle?.plate || "";
      await createAutoTransaction({
        description: `MANUTENÇÃO ${plateStr} - ${parsed.data.type} ${parsed.data.description || ""}`.toUpperCase().trim(),
        amount: Number(parsed.data.cost),
        type: "EXPENSE",
        due_date: parsed.data.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        origin_type: "maintenance",
        origin_id: String(data.id),
        category_name: "Manutenção Veicular",
        entity_name: parsed.data.provider || null,
        created_by: "SISTEMA",
      });
    }

    res.status(201).json(data);
  });

  app.patch("/api/maintenance/:id", requireAuth, async (req, res) => {
    const parsed = insertVehicleMaintenanceSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.updateVehicleMaintenance(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Manutenção não encontrada" });

    const newCost = Number(data.cost || 0);
    if (newCost > 0) {
      await removeAutoTransaction("maintenance", String(data.id));
      const vehicle = data.vehicleId ? await storage.getVehicle(data.vehicleId) : null;
      await createAutoTransaction({
        description: `MANUTENÇÃO ${vehicle?.plate || ""} - ${data.type} ${data.description || ""}`.toUpperCase().trim(),
        amount: newCost,
        type: "EXPENSE",
        due_date: data.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        origin_type: "maintenance",
        origin_id: String(data.id),
        category_name: "Manutenção Veicular",
        entity_name: data.provider || null,
        created_by: "SISTEMA",
      });
    } else {
      await removeAutoTransaction("maintenance", String(data.id));
    }

    res.json(data);
  });

  app.delete("/api/maintenance/:id", requireAuth, requireDiretoria, async (req, res) => {
    const maintId = Number(req.params.id);
    await storage.deleteVehicleMaintenance(maintId);
    await removeAutoTransaction("maintenance", String(maintId));
    res.json({ message: "Manutenção removida" });
  });

  app.get("/api/fueling", requireAuth, async (_req, res) => {
    const data = await storage.getVehicleFuelings();
    res.json(data);
  });

  app.get("/api/fueling/:id", requireAuth, async (req, res) => {
    const data = await storage.getVehicleFueling(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Abastecimento não encontrado" });
    res.json(data);
  });

  async function syncVehicleKmFromFuelings(vehicleId: number) {
    const allFuelings = await storage.getVehicleFuelings();
    const vehicleFuelings = allFuelings.filter(f => f.vehicleId === vehicleId);
    if (vehicleFuelings.length === 0) return;
    const maxKm = Math.max(...vehicleFuelings.map(f => f.km));
    await storage.updateVehicle(vehicleId, {
      km: maxKm,
      lastKmUpdate: new Date(),
    } as any);
  }

  app.post("/api/fueling", requireAuth, async (req, res) => {
    const parsed = insertVehicleFuelingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    if (parsed.data.vehicleId && parsed.data.km) {
      const vehicle = await storage.getVehicle(parsed.data.vehicleId);
      if (vehicle && parsed.data.km < vehicle.km) {
        return res.status(400).json({ message: `KM informado (${parsed.data.km}) é menor que o KM atual do veículo (${vehicle.km}). Verifique o hodômetro.` });
      }
    }
    parsed.data.createdByUserId = req.user?.id || null;
    const data = await storage.createVehicleFueling(parsed.data);
    if (parsed.data.vehicleId) {
      await syncVehicleKmFromFuelings(parsed.data.vehicleId);
    }

    if (data && Number(parsed.data.totalCost) > 0) {
      const vehicle = parsed.data.vehicleId ? await storage.getVehicle(parsed.data.vehicleId) : null;
      const plateStr = vehicle?.plate || "";
      const driverEmp = parsed.data.driverId ? await storage.getEmployee(parsed.data.driverId) : null;
      const agentStr = driverEmp?.name ? ` - Agente: ${driverEmp.name}` : "";
      await createAutoTransaction({
        description: `ABASTECIMENTO ${plateStr}${agentStr} - ${parsed.data.fuelType || "diesel"} ${parsed.data.liters}L`.toUpperCase().trim(),
        amount: Number(parsed.data.totalCost),
        type: "EXPENSE",
        due_date: parsed.data.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        origin_type: "fueling",
        origin_id: String(data.id),
        category_name: "Combustível",
        entity_name: [plateStr, driverEmp?.name, parsed.data.station].filter(Boolean).join(" | ") || null,
        created_by: "SISTEMA",
      });
    }

    res.status(201).json(data);
  });

  app.patch("/api/fueling/:id", requireAuth, async (req, res) => {
    const parsed = insertVehicleFuelingSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.updateVehicleFueling(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Abastecimento não encontrado" });
    if (data.vehicleId) {
      await syncVehicleKmFromFuelings(data.vehicleId);
    }

    const newCost = Number(data.totalCost || 0);
    if (newCost > 0) {
      await removeAutoTransaction("fueling", String(data.id));
      const vehicle = data.vehicleId ? await storage.getVehicle(data.vehicleId) : null;
      const driverEmp = data.driverId ? await storage.getEmployee(data.driverId) : null;
      const agentStr = driverEmp?.name ? ` - Agente: ${driverEmp.name}` : "";
      await createAutoTransaction({
        description: `ABASTECIMENTO ${vehicle?.plate || ""}${agentStr} - ${data.fuelType || "diesel"} ${data.liters}L`.toUpperCase().trim(),
        amount: newCost,
        type: "EXPENSE",
        due_date: data.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        origin_type: "fueling",
        origin_id: String(data.id),
        category_name: "Combustível",
        entity_name: [vehicle?.plate, driverEmp?.name, data.station].filter(Boolean).join(" | ") || null,
        created_by: "SISTEMA",
      });
    } else {
      await removeAutoTransaction("fueling", String(data.id));
    }

    res.json(data);
  });

  app.delete("/api/fueling/:id", requireAuth, requireDiretoria, async (req, res) => {
    const fuelingId = Number(req.params.id);
    const existing = await storage.getVehicleFueling(fuelingId);
    await storage.deleteVehicleFueling(fuelingId);
    if (existing?.vehicleId) {
      await syncVehicleKmFromFuelings(existing.vehicleId);
    }
    await removeAutoTransaction("fueling", String(fuelingId));
    res.json({ message: "Abastecimento removido" });
  });

  app.get("/api/timesheets", requireAuth, async (_req, res) => {
    const data = await storage.getTimesheets();
    res.json(data);
  });

  app.get("/api/timesheets/:id", requireAuth, async (req, res) => {
    const data = await storage.getTimesheet(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Ponto não encontrado" });
    res.json(data);
  });

  app.post("/api/timesheets", requireAuth, async (req, res) => {
    const parsed = insertTimesheetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.createTimesheet(parsed.data);
    res.status(201).json(data);
  });

  app.patch("/api/timesheets/:id", requireAuth, async (req, res) => {
    const parsed = insertTimesheetSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.updateTimesheet(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Ponto não encontrado" });
    res.json(data);
  });

  app.delete("/api/timesheets/:id", requireAuth, requireDiretoria, async (req, res) => {
    await storage.deleteTimesheet(Number(req.params.id));
    res.json({ message: "Ponto removido" });
  });

  // ====================== DATAJUD (CNJ) LOOKUP ======================

  const DATAJUD_API_KEY = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";
  const DATAJUD_TRIBUNALS = [
    "tjsp", "tjrj", "tjmg", "tjrs", "tjpr", "tjsc", "tjba", "tjgo", "tjdf",
    "tjpe", "tjce", "tjma", "tjpa", "tjpb", "tjrn", "tjal", "tjse", "tjes",
    "tjms", "tjmt", "tjam", "tjro", "tjac", "tjap", "tjto", "tjpi", "tjrr",
    "trt1", "trt2", "trt3", "trt4", "trt5", "trt6", "trt7", "trt8", "trt9",
    "trt10", "trt11", "trt12", "trt13", "trt14", "trt15", "trt16", "trt17",
    "trt18", "trt19", "trt20", "trt21", "trt22", "trt23", "trt24",
  ];

  app.get("/api/datajud/:cnpj", requireAuth, async (req, res) => {
    const cnpj = req.params.cnpj.replace(/\D/g, "");
    if (cnpj.length !== 14) return res.status(400).json({ message: "CNPJ inválido" });

    const tribunals = (req.query.tribunals as string || "tjsp,trt2,trt15").split(",").map(t => t.trim().toLowerCase());
    const size = Math.min(Number(req.query.size) || 10, 50);

    const allResults: any[] = [];

    for (const tribunal of tribunals) {
      if (!DATAJUD_TRIBUNALS.includes(tribunal)) continue;
      try {
        const response = await fetch(`https://api-publica.datajud.cnj.jus.br/api_publica_${tribunal}/_search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `APIKey ${DATAJUD_API_KEY}`,
          },
          body: JSON.stringify({
            query: {
              bool: {
                should: [
                  { match: { "numeroProcesso": cnpj } },
                  { wildcard: { "numeroProcesso": `*${cnpj}*` } },
                ],
                minimum_should_match: 1,
              },
            },
            size,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const hits = data.hits?.hits || [];
          for (const hit of hits) {
            const src = hit._source;
            allResults.push({
              tribunal: src.tribunal || tribunal.toUpperCase(),
              numeroProcesso: src.numeroProcesso || "",
              classe: src.classe?.nome || "",
              assuntos: (src.assuntos || []).map((a: any) => a.nome).join(", "),
              dataAjuizamento: src.dataAjuizamento || "",
              grau: src.grau || "",
              orgaoJulgador: src.orgaoJulgador?.nome || "",
              ultimaAtualizacao: src.dataHoraUltimaAtualizacao || "",
              nivelSigilo: src.nivelSigilo || 0,
              movimentos: (src.movimentos || []).slice(0, 5).map((m: any) => ({
                nome: m.nome,
                dataHora: m.dataHora,
              })),
            });
          }
        }
      } catch {
      }
    }

    res.json({
      cnpj,
      totalResultados: allResults.length,
      processos: allResults,
    });
  });

  // ====================== VEHICLE PLATE LOOKUP ======================

  app.get("/api/plate-lookup/:plate", requireAuth, async (req, res) => {
    const plate = req.params.plate.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (plate.length !== 7) return res.status(400).json({ message: "Placa inválida. Use formato ABC1D23 ou ABC1234" });

    const token = process.env.WDAPI_TOKEN;
    if (!token) return res.status(503).json({ message: "Token da WD API não configurado" });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`https://wdapi2.com.br/consulta/${plate}/${token}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          return res.status(401).json({ message: "Falha de autenticação na API" });
        if (response.status === 429)
          return res.status(429).json({ message: "Limite de consultas excedido" });
        return res.status(response.status).json({ message: `Servidor indisponível (${response.status})` });
      }

      const data = await response.json();

      if (data.error || data.ERRO || data.codigoRetorno === "0" || data.mensagemRetorno?.toLowerCase().includes("não encontr")) {
        return res.status(404).json({ message: data.mensagemRetorno || data.ERRO || "Veículo não encontrado na base de dados" });
      }

      const result = {
        plate: data.placa || plate,
        brand: data.MARCA || data.marca || "",
        model: data.MODELO || data.modelo || "",
        year: parseInt(data.anoModelo || data.ano || "0") || null,
        color: data.cor || "",
        chassi: data.chassi || "",
        fuel: data.combustivel || "",
        type: data.tipo || "",
        city: data.municipio || "",
        state: data.uf || "",
      };

      const hasData = result.brand?.trim() || result.model?.trim() || result.year || result.color?.trim() || result.chassi?.trim();
      if (!hasData) {
        return res.status(404).json({ message: "Placa não encontrada ou sem dados disponíveis na base" });
      }

      res.json(result);
    } catch (err: any) {
      if (err.name === "AbortError") {
        return res.status(504).json({ message: "Tempo limite excedido na consulta" });
      }
      res.status(500).json({ message: "Erro ao consultar placa: " + (err.message || "erro desconhecido") });
    }
  });

  // ====================== API BRASIL CONSULTAS (admin + diretoria) ======================

  const requireAdmin = (req: any, res: any, next: any) => {
    if (req.user?.role !== "admin" && req.user?.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    next();
  };

  app.get("/api/consulta/multas-prf/:placa", requireAuth, requireAdmin, async (req, res) => {
    const placa = String(req.params.placa).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (placa.length < 7) return res.status(400).json({ message: "Placa inválida" });
    const result = await apibrasil.consultaMultasPRF(placa, req.user!.id);
    res.status(result.status || 200).json(result);
  });

  app.get("/api/consulta/cnh/:cpf", requireAuth, requireAdmin, async (req, res) => {
    const cpf = String(req.params.cpf).replace(/\D/g, "");
    if (cpf.length !== 11) return res.status(400).json({ message: "CPF inválido" });
    const result = await apibrasil.consultaCNH(cpf, req.user!.id);
    res.status(result.status || 200).json(result);
  });

  app.get("/api/consulta/processos/:cpf", requireAuth, requireAdmin, async (req, res) => {
    const cpf = String(req.params.cpf).replace(/\D/g, "");
    if (cpf.length !== 11) return res.status(400).json({ message: "CPF inválido" });
    const result = await apibrasil.consultaProcessos(cpf, req.user!.id);
    res.status(result.status || 200).json(result);
  });

  app.get("/api/consulta/spc/:document", requireAuth, requireAdmin, async (req, res) => {
    const doc = String(req.params.document).replace(/\D/g, "");
    if (doc.length !== 11 && doc.length !== 14) return res.status(400).json({ message: "CPF/CNPJ inválido" });
    const result = await apibrasil.consultaSPC(doc, req.user!.id);
    res.status(result.status || 200).json(result);
  });

  app.get("/api/consulta/quod/:document", requireAuth, requireAdmin, async (req, res) => {
    const doc = String(req.params.document).replace(/\D/g, "");
    if (doc.length !== 11 && doc.length !== 14) return res.status(400).json({ message: "CPF/CNPJ inválido" });
    const result = await apibrasil.consultaQuodScore(doc, req.user!.id);
    res.status(result.status || 200).json(result);
  });

  app.get("/api/consulta/protesto/:document", requireAuth, requireAdmin, async (req, res) => {
    const doc = String(req.params.document).replace(/\D/g, "");
    if (doc.length !== 11 && doc.length !== 14) return res.status(400).json({ message: "CPF/CNPJ inválido" });
    const result = await apibrasil.consultaProtestoNacional(doc, req.user!.id);
    res.status(result.status || 200).json(result);
  });

  app.get("/api/consulta/situacao-eleitoral/:cpf", requireAuth, requireAdmin, async (req, res) => {
    const cpf = String(req.params.cpf).replace(/\D/g, "");
    if (cpf.length !== 11) return res.status(400).json({ message: "CPF inválido" });
    const result = await apibrasil.consultaSituacaoEleitoral(cpf, req.user!.id);
    res.status(result.status || 200).json(result);
  });

  app.post("/api/consulta/emitir-nf", requireAuth, requireAdmin, async (req, res) => {
    if (!req.body || typeof req.body !== "object") return res.status(400).json({ message: "Dados da NF inválidos" });
    const result = await apibrasil.emitirNotaFiscal(req.body, req.user!.id);
    res.status(result.status || 200).json(result);
  });

  app.get("/api/consulta/analise-risco/:document", requireAuth, requireAdmin, async (req, res) => {
    const doc = String(req.params.document).replace(/\D/g, "");
    if (doc.length !== 11 && doc.length !== 14) return res.status(400).json({ message: "CPF/CNPJ inválido" });

    const results: any = { document: doc, type: doc.length === 14 ? "CNPJ" : "CPF" };

    if (doc.length === 14) {
      try {
        const receitaRes = await fetch(`https://receitaws.com.br/v1/cnpj/${doc}`, {
          headers: { "Authorization": `Bearer ${process.env.RECEITAWS_TOKEN || ""}` },
        });
        const receitaData = await receitaRes.json();
        results.receita = {
          success: receitaData.status === "OK",
          data: receitaData,
        };

        if (receitaData.status === "OK") {
          const risks: string[] = [];
          if (receitaData.situacao !== "ATIVA") risks.push(`Situação cadastral: ${receitaData.situacao}`);
          if (receitaData.motivo_situacao) risks.push(`Motivo: ${receitaData.motivo_situacao}`);
          if (receitaData.situacao_especial) risks.push(`Situação especial: ${receitaData.situacao_especial}`);
          const capital = parseFloat(receitaData.capital_social || "0");
          if (capital < 10000) risks.push(`Capital social baixo: R$ ${capital.toLocaleString("pt-BR")}`);

          const abertura = receitaData.abertura;
          if (abertura) {
            const parts = abertura.split("/");
            if (parts.length === 3) {
              const openDate = new Date(+parts[2], +parts[1] - 1, +parts[0]);
              const diffYears = (Date.now() - openDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
              if (diffYears < 2) risks.push(`Empresa recente (aberta em ${abertura})`);
            }
          }

          results.riskLevel = risks.length === 0 ? "BAIXO" : risks.length <= 2 ? "MEDIO" : "ALTO";
          results.risks = risks;
          results.companyInfo = {
            nome: receitaData.nome,
            fantasia: receitaData.fantasia,
            situacao: receitaData.situacao,
            abertura: receitaData.abertura,
            tipo: receitaData.tipo,
            porte: receitaData.porte,
            natureza: receitaData.natureza_juridica,
            capitalSocial: receitaData.capital_social,
            atividadePrincipal: receitaData.atividade_principal?.[0]?.text,
            socios: receitaData.qsa?.map((s: any) => ({ nome: s.nome, qualificacao: s.qual })),
            simples: receitaData.simples?.optante ? "Sim" : "Não",
            endereco: `${receitaData.logradouro}, ${receitaData.numero} - ${receitaData.bairro}, ${receitaData.municipio}/${receitaData.uf}`,
            telefone: receitaData.telefone,
            email: receitaData.email,
          };
        }
      } catch (e: any) {
        results.receita = { success: false, error: e.message };
        results.riskLevel = "INDETERMINADO";
        results.risks = ["Erro ao consultar ReceitaWS"];
      }
    } else {
      results.riskLevel = "INDETERMINADO";
      results.risks = ["Análise de risco via ReceitaWS disponível apenas para CNPJ"];
      results.receita = { success: false, error: "CPF não suportado pela ReceitaWS" };
    }

    await storage.createApiLog({
      endpoint: "/receitaws/cnpj",
      method: "GET",
      requestData: JSON.stringify({ document: doc }),
      responseStatus: results.receita?.success ? 200 : 400,
      responseData: JSON.stringify(results).substring(0, 5000),
      userId: req.user!.id,
      source: "analise_risco",
    });

    res.json(results);
  });

  app.get("/api/api-logs", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const logs = await storage.getRecentApiLogs(limit);
    const safeLogs = logs.map(({ responseData, requestData, ...rest }) => ({
      ...rest,
      hasResponseData: !!responseData,
      requestPreview: requestData ? requestData.substring(0, 100) : null,
    }));
    res.json(safeLogs);
  });

  app.get("/api/api-logs/stats", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const logs = await storage.getRecentApiLogs(500);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const todayLogs = logs.filter(l => l.createdAt && l.createdAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) === today);
    const byEndpoint: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const l of logs) {
      byEndpoint[l.endpoint] = (byEndpoint[l.endpoint] || 0) + 1;
      const s = l.responseStatus ? (l.responseStatus >= 200 && l.responseStatus < 300 ? "success" : "error") : "unknown";
      byStatus[s] = (byStatus[s] || 0) + 1;
    }
    res.json({
      total: logs.length,
      today: todayLogs.length,
      byEndpoint,
      byStatus,
    });
  });

  app.get("/api/api-logs/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const logs = await storage.getRecentApiLogs(500);
    const log = logs.find(l => l.id === Number(req.params.id));
    if (!log) return res.status(404).json({ message: "Log não encontrado" });
    res.json(log);
  });

  // ====================== OPERATIONAL GRID ======================

  app.get("/api/operational-grid", requireAuth, async (_req, res) => {
    const orders = await storage.getServiceOrders();
    const gridVehicles = await storage.getVehicles();
    const todayBRT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const activeOrders = orders.filter(
      (o) => {
        if ((o.status === "em_andamento" || o.status === "aberta" || o.status === "agendada") && o.missionStatus !== "encerrada") return true;
        if (o.status === "concluida" || o.missionStatus === "encerrada" || o.status === "cancelada") {
          const oDate = o.scheduledDate ? new Date(o.scheduledDate).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
            : o.completedDate ? new Date(o.completedDate).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
            : o.updatedAt ? new Date(o.updatedAt).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : null;
          if (oDate === todayBRT) return true;
        }
        return false;
      }
    );

    const todayStr = new Date().toISOString().split("T")[0];
    const vehicleFuelCache = new Map<string, number>();
    try {
      const { data: allFuelToday } = await supabaseAdmin.from("financial_transactions")
        .select("amount, description")
        .eq("origin_type", "fueling")
        .gte("due_date", todayStr)
        .lte("due_date", todayStr);
      if (allFuelToday) {
        for (const fr of allFuelToday) {
          const desc = (fr.description || "").toUpperCase();
          for (const gv of gridVehicles) {
            const plate = gv.plate?.toUpperCase() || "";
            if (plate && desc.includes(plate)) {
              vehicleFuelCache.set(plate, (vehicleFuelCache.get(plate) || 0) + Number(fr.amount || 0));
            }
          }
        }
      }
    } catch (_e) {}

    const vehicleFuelFirstOS = new Map<string, number>();
    for (const o of activeOrders) {
      if (!o.vehicleId) continue;
      const gv = gridVehicles.find(vv => vv.id === o.vehicleId);
      const vPlate = gv?.plate?.toUpperCase() || "";
      if (!vPlate) continue;
      const oDate = o.scheduledDate
        ? new Date(o.scheduledDate).toISOString().split("T")[0]
        : todayStr;
      const fuelKey = `${vPlate}:${oDate}`;
      if (o.fuelAllocated === true) {
        vehicleFuelFirstOS.set(fuelKey, o.id);
      }
    }
    for (const o of activeOrders) {
      if (!o.vehicleId) continue;
      const gv = gridVehicles.find(vv => vv.id === o.vehicleId);
      const vPlate = gv?.plate?.toUpperCase() || "";
      if (!vPlate) continue;
      const oDate = o.scheduledDate
        ? new Date(o.scheduledDate).toISOString().split("T")[0]
        : todayStr;
      const fuelKey = `${vPlate}:${oDate}`;
      if (!vehicleFuelFirstOS.has(fuelKey) && o.fuelAllocated !== false) {
        vehicleFuelFirstOS.set(fuelKey, o.id);
      }
    }

    const enriched = await Promise.all(
      activeOrders.map(async (o) => {
        const [client, vehicle, emp1, emp2] = await Promise.all([
          storage.getClient(o.clientId),
          o.vehicleId ? storage.getVehicle(o.vehicleId) : null,
          o.assignedEmployeeId ? storage.getEmployee(o.assignedEmployeeId) : null,
          o.assignedEmployee2Id ? storage.getEmployee(o.assignedEmployee2Id) : null,
        ]);

        const formatName = (name?: string) => {
          if (!name) return null;
          const parts = name.trim().split(/\s+/);
          if (parts.length <= 1) return name;
          return `${parts[0]} ${parts[parts.length - 1]}`;
        };

        let trackerData: {
          latitude?: number;
          longitude?: number;
          ignition?: boolean;
          lastPositionTime?: string;
          gpsSignal?: boolean;
          speed?: number;
          address?: string;
        } | null = null;

        const vTrackerType = vehicle?.trackerType || "none";
        let vHasTracker = false;

        if (vehicle && vTrackerType === "truckscontrol") {
          vHasTracker = true;
          const tcPositions = await truckscontrol.getCachedPositions();
          if (tcPositions.length > 0) {
            let pos = vehicle.truckscontrolIdentifier
              ? truckscontrol.findPositionByIdentifier(tcPositions, vehicle.truckscontrolIdentifier)
              : null;
            if (!pos) pos = truckscontrol.findPositionByPlate(tcPositions, vehicle.plate);
            if (pos) {
              trackerData = {
                latitude: pos.latitude,
                longitude: pos.longitude,
                ignition: pos.ignition,
                lastPositionTime: pos.lastPositionTime,
                gpsSignal: pos.gpsSignal,
                speed: pos.speed,
                address: pos.address,
              };
            }
          }
        } else if (vehicle && vTrackerType === "custom" && vehicle.trackerId && vehicle.trackerApiUrl) {
          vHasTracker = true;
          try {
            const url = new URL(vehicle.trackerApiUrl);
            if (url.protocol === "https:") {
              const resp = await fetch(vehicle.trackerApiUrl, { signal: AbortSignal.timeout(5000) });
              if (resp.ok) {
                trackerData = await resp.json();
              }
            }
          } catch (_e) {
            trackerData = null;
          }
        }

        const lastUpdate = await db.select()
          .from(missionUpdates)
          .where(and(eq(missionUpdates.serviceOrderId, o.id), eq(missionUpdates.readByAdmin, 0)))
          .orderBy(desc(missionUpdates.createdAt))
          .limit(1);

        let liveCost: {
          km_inicial: number; km_atual: number; km_total: number;
          horas_missao: number;
          faturamento: number; pagamento: number; resultado: number; margem_pct: number;
          custo_combustivel: number; custo_pedagio: number; custo_outros: number; custo_total: number;
          contrato_nome: string | null;
          contrato_valores: { valor_acionamento: number; franquia_horas: number; franquia_km: number; valor_hora_extra: number; valor_km_extra: number; valor_km_carregado: number; vrp_base: number } | null;
        } | null = null;

        if ((o.status === "em_andamento" || o.status === "concluida" || o.status === "cancelada" || o.missionStatus === "encerrada") && o.type === "escolta") {
          try {
            const photos = await storage.getMissionPhotosByOS(o.id);
            const kmSaidaPhoto = photos.find((p: any) => p.step === "km_saida");
            const kmChegadaPhoto = photos.find((p: any) => p.step === "km_chegada");
            const kmFinalPhoto = photos.find((p: any) => p.step === "km_final");
            const kmInicial = kmChegadaPhoto?.kmValue || kmSaidaPhoto?.kmValue || 0;
            const kmAtual = kmFinalPhoto?.kmValue || kmChegadaPhoto?.kmValue || kmInicial;

            const scheduledTime = o.scheduledDate ? new Date(o.scheduledDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : undefined;
            const startTime = o.missionStartedAt ? new Date(o.missionStartedAt as string).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : undefined;
            const endTime = o.completedDate ? new Date(o.completedDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : null;
            const nowTime = endTime || new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

            let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
            let contratoNome: string | null = null;

            if (o.escortContractId) {
              const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", o.escortContractId).limit(1);
              if (cc?.length) { contrato = cc[0]; contratoNome = cc[0].contract_name || cc[0].client_name || null; }
            } else if (o.clientId) {
              const { data: clientContracts } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", o.clientId).eq("status", "Ativo").limit(1);
              if (clientContracts?.length) { contrato = clientContracts[0]; contratoNome = clientContracts[0].contract_name || clientContracts[0].client_name || null; }
            }

            const n2 = (v: any) => Number(v) || 0;
            const franquiaHoras = n2(contrato.franquia_horas);
            const horasCalcRaw = startTime ? calcularHorasTrabalhadas(startTime, nowTime) : 0;

            const kmFinalNorm = kmAtual > kmInicial ? kmAtual : kmInicial;
            const kmTotal = kmFinalNorm - kmInicial;
            const franquiaKm = n2(contrato.franquia_km) || n2(contrato.franquia_minima_km);
            const kmExcedente = Math.max(0, kmTotal - franquiaKm);
            const valorAcionamento = n2(contrato.valor_acionamento);
            const hasAcionamento = valorAcionamento > 0;
            const valorKmExtra = n2(contrato.valor_km_extra) || n2(contrato.valor_km_carregado);
            const valorHoraExtra = n2(contrato.valor_hora_extra) || n2(contrato.valor_hora_estadia);

            let fatProvisorio: number;
            let fatHoraExtra = 0;
            let fatKmExtra = 0;
            if (hasAcionamento) {
              fatProvisorio = valorAcionamento;
              if (kmExcedente > 0) {
                fatKmExtra = kmExcedente * valorKmExtra;
                fatProvisorio += fatKmExtra;
              }
              if (franquiaHoras > 0 && horasCalcRaw > franquiaHoras) {
                fatHoraExtra = (horasCalcRaw - franquiaHoras) * valorHoraExtra;
                fatProvisorio += fatHoraExtra;
              }
            } else {
              const kmFaturado = Math.max(kmTotal, franquiaKm);
              fatProvisorio = kmFaturado * n2(contrato.valor_km_carregado);
            }

            const resultado = {
              faturamento: { total: Math.round(fatProvisorio * 100) / 100 },
              pagamento: { total: n2(contrato.vrp_base) },
              km_total: kmTotal,
            };

            const horasCalc = horasCalcRaw;

            let custoCombustivel = 0;
            let custoPedagio = 0;
            let custoOutros = 0;
            try {
              const osMissionCosts = await storage.getMissionCostsByOS(o.id);
              for (const mc of osMissionCosts) {
                const amt = Number((mc as any).amount || 0);
                const cat = ((mc as any).category || "").toLowerCase();
                if (cat.includes("pedágio") || cat.includes("pedagio")) custoPedagio += amt;
                else custoOutros += amt;
              }

              if (o.vehicleId) {
                const oDate = o.scheduledDate
                  ? new Date(o.scheduledDate).toISOString().split("T")[0]
                  : todayStr;
                const vPlate = vehicle?.plate?.toUpperCase() || "";
                if (vPlate) {
                  const fuelKey = `${vPlate}:${oDate}`;
                  const firstOsForFuel = vehicleFuelFirstOS.get(fuelKey);
                  if (firstOsForFuel !== o.id) {
                    custoCombustivel = 0;
                  } else {
                    custoCombustivel = vehicleFuelCache.get(vPlate) || 0;
                  }
                }
              }
            } catch (_e) {}

            const custoTotal = resultado.pagamento.total + custoCombustivel + custoPedagio + custoOutros;
            const resultadoComCustos = resultado.faturamento.total - custoTotal;
            const margemComCustos = resultado.faturamento.total > 0 ? (resultadoComCustos / resultado.faturamento.total) * 100 : 0;

            let fuelAllocatedHint: string | null = null;
            if (custoCombustivel === 0 && o.vehicleId) {
              const vPlate2 = vehicle?.plate?.toUpperCase() || "";
              const oDate2 = o.scheduledDate ? new Date(o.scheduledDate).toISOString().split("T")[0] : todayStr;
              const fk2 = `${vPlate2}:${oDate2}`;
              const ownerOsId = vehicleFuelFirstOS.get(fk2);
              if (ownerOsId && ownerOsId !== o.id) {
                const ownerOs = activeOrders.find(x => x.id === ownerOsId);
                fuelAllocatedHint = ownerOs?.osNumber || null;
              }
            }

            liveCost = {
              km_inicial: kmInicial,
              km_atual: kmFinalNorm,
              km_total: resultado.km_total,
              horas_missao: Math.round(horasCalc * 100) / 100,
              faturamento: resultado.faturamento.total,
              fat_hora_extra: Math.round(fatHoraExtra * 100) / 100,
              fat_km_extra: Math.round(fatKmExtra * 100) / 100,
              pagamento: resultado.pagamento.total,
              custo_combustivel: custoCombustivel,
              custo_pedagio: custoPedagio,
              custo_outros: custoOutros,
              custo_total: custoTotal,
              resultado: resultadoComCustos,
              margem_pct: Math.round(margemComCustos * 100) / 100,
              fuel_allocated: o.fuelAllocated !== false && custoCombustivel > 0,
              fuel_allocated_hint: fuelAllocatedHint,
              contrato_nome: contratoNome || contrato.name || null,
              contrato_valores: {
                valor_acionamento: contrato.valor_acionamento || 0,
                franquia_horas: contrato.franquia_horas || 0,
                franquia_km: contrato.franquia_km || contrato.franquia_minima_km || 0,
                valor_hora_extra: contrato.valor_hora_extra || 0,
                valor_km_extra: contrato.valor_km_extra || 0,
                valor_km_carregado: contrato.valor_km_carregado || 0,
                vrp_base: contrato.vrp_base || 0,
              },
            };
          } catch (e: any) {
            console.error(`[grid] liveCost error OS ${o.osNumber}:`, e.message);
          }
        }

        return {
          id: o.id,
          osNumber: o.osNumber,
          scheduledDate: o.scheduledDate,
          status: o.status,
          priority: o.priority || "agendada",
          missionStatus: o.missionStatus,
          lastAgentUpdate: lastUpdate.length > 0 ? {
            id: lastUpdate[0].id,
            message: lastUpdate[0].message,
            missionStep: lastUpdate[0].missionStep,
            agentName: lastUpdate[0].employeeName,
            createdAt: lastUpdate[0].createdAt,
            photoUrl: lastUpdate[0].photoUrl || null,
            latitude: lastUpdate[0].latitude || null,
            longitude: lastUpdate[0].longitude || null,
          } : null,
          clientName: client?.name || "—",
          origin: o.origin || null,
          destination: o.destination || null,
          escortedDriverName: o.escortedDriverName || null,
          escortedDriverPhone: o.escortedDriverPhone || null,
          escortedVehiclePlate: o.escortedVehiclePlate || null,
          employee1: emp1 ? {
            name: formatName(emp1.name),
            fullName: emp1.name,
            phone: emp1.phone || null,
          } : null,
          employee2: emp2 ? {
            name: formatName(emp2.name),
            fullName: emp2.name,
            phone: emp2.phone || null,
          } : null,
          vehicle: vehicle ? {
            plate: vehicle.plate,
            model: vehicle.model,
            brand: vehicle.brand || "",
            hasTracker: vHasTracker,
          } : null,
          tracker: trackerData,
          liveCost,
        };
      })
    );

    res.json(enriched);
  });

  app.get("/api/vehicle-tracking", requireAuth, async (_req, res) => {
    const allVehicles = await storage.getVehicles();
    const orders = await storage.getServiceOrders();
    const FINISHED_MISSION = ["finalizada", "retorno_base", "chegada_base", "encerrada"];
    const activeOrders = orders.filter(
      (o) => (o.status === "em_andamento" || (o.status === "agendada" && o.missionStatus))
    );
    const vehicleActiveOrders = activeOrders.filter(
      (o) => !FINISHED_MISSION.includes(o.missionStatus || "")
    );
    const scheduledOrders = orders.filter(
      (o) => (o.status === "aberta" || o.status === "agendada" || (o.status === "em_andamento" && o.missionStatus === "aguardando")) && (!o.missionStatus || o.missionStatus === "aguardando")
    );

    const tcPositions = await truckscontrol.getCachedPositions();
    const plates = allVehicles.map(v => v.plate);
    const lastAlertMap = await storage.getLastAlertByPlates(plates);
    const agentLocs = await storage.getAgentLocations();

    const tracked = await Promise.all(
      allVehicles.map(async (v) => {
        let trackerData: {
          veiID?: number;
          latitude?: number;
          longitude?: number;
          ignition?: boolean;
          lastPositionTime?: string;
          gpsSignal?: boolean;
          speed?: number;
          address?: string;
          stoppedSince?: string | null;
          ignitionOnSince?: string | null;
          isLiveData?: boolean;
          voltage?: number;
        } | null = null;

        const trackerType = v.trackerType || "none";
        let hasTracker = false;
        let gotLiveData = false;

        if (trackerType === "truckscontrol") {
          hasTracker = true;
          const vehiclePositions = tcPositions.filter(p => p.deviceType === "vehicle");
          if (vehiclePositions.length > 0) {
            let pos = v.truckscontrolIdentifier
              ? truckscontrol.findPositionByIdentifier(vehiclePositions, v.truckscontrolIdentifier)
              : null;
            if (!pos) pos = truckscontrol.findPositionByPlate(vehiclePositions, v.plate);
            if (pos) {
              const hasValidCoords = pos.latitude !== 0 || pos.longitude !== 0;
              if (hasValidCoords) {
                gotLiveData = true;
                trackerData = {
                  veiID: pos.veiID,
                  latitude: pos.latitude,
                  longitude: pos.longitude,
                  ignition: pos.ignition,
                  lastPositionTime: pos.lastPositionTime,
                  gpsSignal: pos.gpsSignal,
                  speed: pos.speed,
                  address: pos.address,
                  voltage: pos.voltage,
                  isLiveData: true,
                };
              } else {
                hasTracker = true;
                gotLiveData = false;
              }
            }
          }
        } else if (trackerType === "custom" && v.trackerId && v.trackerApiUrl) {
          hasTracker = true;
          try {
            const url = new URL(v.trackerApiUrl);
            if (url.protocol === "https:") {
              const resp = await fetch(v.trackerApiUrl, { signal: AbortSignal.timeout(5000) });
              if (resp.ok) {
                trackerData = await resp.json();
                if (trackerData && (trackerData.latitude !== 0 || trackerData.longitude !== 0)) {
                  gotLiveData = true;
                  trackerData.isLiveData = true;
                } else {
                  trackerData = null;
                }
              }
            }
          } catch (_e) {
            trackerData = null;
          }
        }

        const now = new Date().toISOString();
        let stoppedSince = v.stoppedSince || null;
        let ignitionOnSince = v.ignitionOnSince || null;
        let noSignalSince = v.noSignalSince || null;

        if (gotLiveData && trackerData && (trackerData.latitude !== 0 || trackerData.longitude !== 0)) {
          noSignalSince = null;

          const prevIgnition = v.lastIgnition === 1;
          const curIgnition = trackerData.ignition === true;
          const curSpeed = trackerData.speed ?? 0;
          const isStopped = curSpeed < 2;

          if (isStopped) {
            if (!stoppedSince) {
              stoppedSince = trackerData.lastPositionTime || now;
            }
          } else {
            stoppedSince = null;
          }

          if (curIgnition) {
            if (!prevIgnition || !ignitionOnSince) {
              ignitionOnSince = ignitionOnSince || trackerData.lastPositionTime || now;
            }
          } else {
            ignitionOnSince = null;
          }

          trackerData.stoppedSince = stoppedSince;
          trackerData.ignitionOnSince = ignitionOnSince;

          let positionValid = true;
          if (v.truckscontrolIdentifier) {
            const tcVeiID = parseInt(v.truckscontrolIdentifier);
            if (!isNaN(tcVeiID)) {
              positionValid = truckscontrol.recordPosition(tcVeiID, trackerData.latitude, trackerData.longitude, trackerData.speed ?? 0, trackerData.ignition === true);
            }
          }

          if (positionValid) {
            const linkedMissionOrder = activeOrders.find((o) => o.vehicleId === v.id && o.missionStatus && o.status === "em_andamento");
            if (linkedMissionOrder && trackerData.latitude != null && trackerData.longitude != null) {
              const osId = linkedMissionOrder.id;
              const prevMission = lastMissionPos.get(osId);
              const distMission = prevMission ? haversineDist(prevMission.lat, prevMission.lng, trackerData.latitude, trackerData.longitude) : Infinity;
              if (distMission >= MISSION_POS_MIN_DISTANCE) {
                const prevRec = lastRecordedPos.get(v.id);
                const now = Date.now();
                const isNewMission = !prevRec || prevRec.osId !== osId;
                const displacement = prevRec && !isNewMission ? haversineDist(prevRec.lat, prevRec.lng, trackerData.latitude, trackerData.longitude) : Infinity;
                const elapsed = prevRec && !isNewMission ? now - prevRec.time : Infinity;
                const interval = displacement >= SMART_INTERVAL_DISPLACEMENT_M ? SMART_INTERVAL_FAST_MS : SMART_INTERVAL_DEFAULT_MS;

                if (isNewMission || elapsed >= interval) {
                  lastRecordedPos.set(v.id, { lat: trackerData.latitude, lng: trackerData.longitude, time: now, osId });
                  lastMissionPos.set(osId, { lat: trackerData.latitude, lng: trackerData.longitude });
                  db.insert(missionPositions).values({
                    serviceOrderId: osId,
                    vehicleId: v.id,
                    latitude: trackerData.latitude,
                    longitude: trackerData.longitude,
                    speed: trackerData.speed ?? 0,
                    ignition: trackerData.ignition ? 1 : 0,
                  }).catch((e) => console.error("[mission-pos] Insert error:", e.message));
                }
              }
            }
          }

          storage.updateVehicle(v.id, {
            lastLatitude: String(trackerData.latitude),
            lastLongitude: String(trackerData.longitude),
            lastIgnition: trackerData.ignition ? 1 : 0,
            lastSpeed: trackerData.speed ?? 0,
            lastGpsSignal: trackerData.gpsSignal ? 1 : 0,
            lastAddress: trackerData.address || null,
            lastPositionTime: trackerData.lastPositionTime || null,
            stoppedSince,
            ignitionOnSince,
            noSignalSince: null,
          } as any).catch(() => {});
        } else if (hasTracker && !gotLiveData) {
          if (!noSignalSince) {
            noSignalSince = v.lastPositionTime || now;
            storage.updateVehicle(v.id, { noSignalSince } as any).catch(() => {});
          }

          if (v.lastLatitude && v.lastLongitude) {
            if (!stoppedSince && v.lastPositionTime) {
              stoppedSince = v.lastPositionTime;
              storage.updateVehicle(v.id, { stoppedSince, ignitionOnSince: null } as any).catch(() => {});
            }

            trackerData = {
              latitude: parseFloat(v.lastLatitude),
              longitude: parseFloat(v.lastLongitude),
              ignition: false,
              lastPositionTime: v.lastPositionTime || undefined,
              gpsSignal: false,
              speed: 0,
              address: v.lastAddress || undefined,
              stoppedSince: stoppedSince,
              ignitionOnSince: null,
              isLiveData: false,
            };
          }
        }

        const vehicleOrders = vehicleActiveOrders.filter((o) => o.vehicleId === v.id);
        const linkedOrder = vehicleOrders.length > 0
          ? vehicleOrders.sort((a, b) => {
              const aInProgress = a.status === "em_andamento" && a.missionStatus !== "aguardando" ? 1 : 0;
              const bInProgress = b.status === "em_andamento" && b.missionStatus !== "aguardando" ? 1 : 0;
              if (aInProgress !== bInProgress) return bInProgress - aInProgress;
              const da = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
              const db2 = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;
              return da - db2;
            })[0]
          : undefined;

        return {
          id: v.id,
          plate: v.plate,
          model: v.model,
          brand: v.brand,
          year: v.year,
          color: v.color,
          chassi: v.chassi,
          renavam: v.renavam,
          km: v.km,
          initialKm: v.initialKm,
          lastKmUpdate: v.lastKmUpdate,
          status: v.status,
          hasTracker,
          trackerId: v.trackerId || v.truckscontrolIdentifier,
          trackerType: v.trackerType || "none",
          truckscontrolIdentifier: v.truckscontrolIdentifier,
          iconType: v.iconType || "polo",
          photoFront: v.photoFront || null,
          noSignalSince,
          deviceType: "vehicle" as const,
          idleSamePlace: v.truckscontrolIdentifier ? truckscontrol.getIdleSamePlaceInfo(parseInt(v.truckscontrolIdentifier)) : null,
          tracker: trackerData,
          activeOs: linkedOrder
            ? await (async () => {
                const client = await storage.getClient(linkedOrder.clientId);
                const emp1 = linkedOrder.assignedEmployeeId ? await storage.getEmployee(linkedOrder.assignedEmployeeId) : null;
                const emp2 = linkedOrder.assignedEmployee2Id ? await storage.getEmployee(linkedOrder.assignedEmployee2Id) : null;
                const agentLoc1 = linkedOrder.assignedEmployeeId ? agentLocs.find(a => a.employeeId === linkedOrder.assignedEmployeeId) : null;
                const agentLoc2 = linkedOrder.assignedEmployee2Id ? agentLocs.find(a => a.employeeId === linkedOrder.assignedEmployee2Id) : null;
                const lastUpd = await db.select()
                  .from(missionUpdates)
                  .where(and(eq(missionUpdates.serviceOrderId, linkedOrder.id), eq(missionUpdates.readByAdmin, 0)))
                  .orderBy(desc(missionUpdates.createdAt))
                  .limit(1);
                return {
                  id: linkedOrder.id,
                  osNumber: linkedOrder.osNumber,
                  status: linkedOrder.status,
                  missionStatus: linkedOrder.missionStatus,
                  lastAgentUpdate: lastUpd.length > 0 ? {
                    id: lastUpd[0].id,
                    message: lastUpd[0].message,
                    missionStep: lastUpd[0].missionStep,
                    agentName: lastUpd[0].employeeName,
                    createdAt: lastUpd[0].createdAt,
                    photoUrl: lastUpd[0].photoUrl || null,
                    latitude: lastUpd[0].latitude || null,
                    longitude: lastUpd[0].longitude || null,
                  } : null,
                  scheduledDate: linkedOrder.scheduledDate,
                  clientName: client?.name || "—",
                  priority: linkedOrder.priority || "agendada",
                  employee1: emp1 ? { id: emp1.id, name: emp1.name, phone: emp1.phone || null, addressLat: emp1.addressLat || null, addressLng: emp1.addressLng || null } : null,
                  employee2: emp2 ? { id: emp2.id, name: emp2.name, phone: emp2.phone || null, addressLat: emp2.addressLat || null, addressLng: emp2.addressLng || null } : null,
                  agentLocation: agentLoc1 ? { latitude: agentLoc1.latitude, longitude: agentLoc1.longitude, accuracy: agentLoc1.accuracy, updatedAt: agentLoc1.updatedAt } : null,
                  agentLocation2: agentLoc2 ? { latitude: agentLoc2.latitude, longitude: agentLoc2.longitude, accuracy: agentLoc2.accuracy, updatedAt: agentLoc2.updatedAt } : null,
                  origin: linkedOrder.origin || null,
                  destination: linkedOrder.destination || null,
                  originLat: linkedOrder.originLat || null,
                  originLng: linkedOrder.originLng || null,
                  destinationLat: linkedOrder.destinationLat || null,
                  destinationLng: linkedOrder.destinationLng || null,
                  escortedDriverName: linkedOrder.escortedDriverName || null,
                  escortedDriverPhone: linkedOrder.escortedDriverPhone || null,
                  escortedVehiclePlate: linkedOrder.escortedVehiclePlate || null,
                  earlyStartApproved: linkedOrder.earlyStartApproved || false,
                };
              })()
            : null,
          lastAlert: (() => {
            const alert = lastAlertMap.get(v.plate);
            if (!alert) return null;
            return {
              eventType: alert.eventType,
              value: alert.value,
              details: alert.details,
              createdAt: alert.createdAt,
            };
          })(),
          scheduledOs: (() => {
            const scheduled = scheduledOrders.find((o) => o.vehicleId === v.id && o.id !== linkedOrder?.id);
            return scheduled ? { id: scheduled.id, osNumber: scheduled.osNumber, scheduledDate: scheduled.scheduledDate, priority: scheduled.priority } : null;
          })(),
          upcomingOrders: await (async () => {
            const upcoming = orders.filter(
              (o) => o.vehicleId === v.id && o.id !== linkedOrder?.id &&
              o.status !== "concluída" && o.status !== "concluida" && o.status !== "cancelada" &&
              o.missionStatus !== "encerrada"
            );
            const results = [];
            for (const u of upcoming) {
              const [cl, e1, e2] = await Promise.all([
                storage.getClient(u.clientId),
                u.assignedEmployeeId ? storage.getEmployee(u.assignedEmployeeId) : null,
                u.assignedEmployee2Id ? storage.getEmployee(u.assignedEmployee2Id) : null,
              ]);
              results.push({
                id: u.id,
                osNumber: u.osNumber,
                status: u.status,
                priority: u.priority || "agendada",
                scheduledDate: u.scheduledDate,
                clientName: cl?.name || "—",
                origin: u.origin || null,
                destination: u.destination || null,
                employee1Name: e1?.name || null,
                employee1Phone: e1?.phone || null,
                employee2Name: e2?.name || null,
                employee2Phone: e2?.phone || null,
                escortedDriverName: u.escortedDriverName || null,
                escortedDriverPhone: u.escortedDriverPhone || null,
                escortedVehiclePlate: u.escortedVehiclePlate || null,
                type: u.type || null,
              });
            }
            results.sort((a, b) => {
              const da = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
              const db = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;
              return da - db;
            });
            return results;
          })(),
        };
      })
    );

    const spyPositions = tcPositions.filter(p => p.deviceType === "spy");
    const spyEntries = spyPositions.map((sp, idx) => ({
      id: -(idx + 1000),
      plate: sp.plate,
      model: sp.identifier,
      brand: "SPY",
      color: null,
      status: sp.coupled ? "acoplado" : "desacoplado",
      hasTracker: true,
      trackerId: String(sp.veiID),
      trackerType: "truckscontrol",
      deviceType: "spy" as const,
      batteryLevel: sp.batteryLevel,
      coupled: sp.coupled,
      tracker: sp.latitude !== 0 || sp.longitude !== 0
        ? {
            latitude: sp.latitude,
            longitude: sp.longitude,
            ignition: false,
            lastPositionTime: sp.lastPositionTime,
            gpsSignal: sp.gpsSignal,
            speed: sp.speed,
            address: sp.address,
          }
        : null,
      activeOs: null,
      scheduledOs: null,
      upcomingOrders: [],
    }));

    try {
      const telemetryData = tracked
        .filter(t => t.deviceType === "vehicle" && t.tracker && t.tracker.isLiveData !== false)
        .map(t => ({
          vehicleId: t.id,
          plate: t.plate,
          speed: t.tracker!.speed ?? 0,
          ignition: t.tracker!.ignition ?? false,
          latitude: t.tracker!.latitude,
          longitude: t.tracker!.longitude,
          address: t.tracker!.address,
          stoppedSince: t.tracker!.stoppedSince,
          ignitionOnSince: t.tracker!.ignitionOnSince,
          driverName: t.activeOs?.employee1?.name || null,
          truckscontrolId: t.truckscontrolIdentifier ? parseInt(t.truckscontrolIdentifier) : null,
        }));
      if (telemetryData.length > 0) {
        processTelemetry(telemetryData);
      }
    } catch (_e) {}

    res.json([...tracked, ...spyEntries]);
  });

  app.get("/api/truckscontrol/test", requireAuth, requireAdminRole, async (_req, res) => {
    const result = await truckscontrol.testConnection();
    res.json(result);
  });

  app.get("/api/truckscontrol/debug", requireAuth, requireAdminRole, async (_req, res) => {
    const result = await truckscontrol.debugLogin();
    res.json(result);
  });

  app.get("/api/truckscontrol/positions", requireAuth, requireAdminRole, async (_req, res) => {
    const positions = await truckscontrol.getCachedPositions();
    res.json(positions);
  });

  app.get("/api/truckscontrol/spy", requireAuth, requireAdminRole, async (_req, res) => {
    const spyPositions = await truckscontrol.fetchSpyPositions();
    const spyDevices = truckscontrol.getSpyDevices();
    res.json({ devices: spyDevices, positions: spyPositions });
  });

  app.post("/api/truckscontrol/command", requireAuth, requireAdminRole, async (req, res) => {
    const vehicleId = Number(req.body.vehicleId);
    const command = String(req.body.command || "");
    const mensagem = req.body.mensagem ? String(req.body.mensagem) : undefined;
    const validCommands = ["bloquear", "desbloquear", "sirene", "aviso_cabine_on", "aviso_cabine_off", "mensagem_texto"] as const;

    if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
      return res.status(400).json({ success: false, message: "vehicleId deve ser um número inteiro positivo." });
    }
    if (!validCommands.includes(command as any)) {
      return res.status(400).json({ success: false, message: `Comando inválido. Use: ${validCommands.join(", ")}` });
    }

    const vehicle = await storage.getVehicle(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: "Veículo não encontrado." });
    }

    if (command === "bloquear") {
      const orders = await storage.getServiceOrders();
      const activeOs = orders.find(
        (o) => o.vehicleId === vehicleId && o.status === "em_andamento" && o.missionStatus && o.missionStatus !== "encerrada"
      );
      if (!activeOs) {
        return res.status(403).json({ success: false, message: "Bloqueio permitido apenas quando a viatura estiver EM SERVIÇO (com missão em andamento)." });
      }
    }

    let veiID: number | null = null;

    if (vehicle.truckscontrolIdentifier) {
      const parsed = parseInt(vehicle.truckscontrolIdentifier);
      if (!isNaN(parsed) && parsed > 0) veiID = parsed;
    }

    if (!veiID) {
      let tcCache = truckscontrol.getVehicleCache();
      if (tcCache.length === 0) {
        const positions = await truckscontrol.getCachedPositions();
        if (positions.length > 0) {
          tcCache = truckscontrol.getVehicleCache();
        }
      }
      const cleanPlate = vehicle.plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      const found = tcCache.find(tc => tc.placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase() === cleanPlate);
      if (found) {
        veiID = found.veiID;
      }
    }

    if (!veiID) {
      return res.status(400).json({ success: false, message: "Veículo sem identificador TrucksControl configurado. Configure o campo 'truckscontrolIdentifier' no cadastro do veículo." });
    }

    console.log(`[command] Enviando ${command} para veículo ${vehicle.plate} (veiID=${veiID}) por ${req.user?.name || req.user?.email}${mensagem ? ` msg="${mensagem}"` : ""}`);
    const result = await truckscontrol.sendCommand(veiID, command as any, mensagem);
    if (!result.success) {
      return res.status(502).json(result);
    }
    res.json(result);
  });

  // ====================== GERENCIADORA ROUTES ======================

  app.get("/api/gerenciadoras", requireAuth, requireAdminRole, async (_req, res) => {
    const list = await storage.getGerenciadoras();
    res.json(list);
  });

  app.post("/api/gerenciadoras", requireAuth, requireAdminRole, async (req, res) => {
    const parsed = insertGerenciadoraSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.flatten() });
    const g = await storage.createGerenciadora(parsed.data);
    res.json(g);
  });

  app.patch("/api/gerenciadoras/:id", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const parsed = insertGerenciadoraSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.flatten() });
    const updated = await storage.updateGerenciadora(id, parsed.data);
    if (!updated) return res.status(404).json({ message: "Gerenciadora não encontrada" });
    res.json(updated);
  });

  app.delete("/api/gerenciadoras/:id", requireAuth, requireDiretoria, async (req, res) => {
    await storage.deleteGerenciadora(Number(req.params.id));
    res.json({ success: true });
  });

  app.post("/api/gerenciadoras/:id/mirror", requireAuth, requireAdminRole, async (req, res) => {
    const gerenciadora = await storage.getGerenciadora(Number(req.params.id));
    if (!gerenciadora) return res.status(404).json({ message: "Gerenciadora não encontrada" });
    if (!gerenciadora.apiUrl) return res.status(400).json({ message: "Gerenciadora sem URL de API configurada" });

    try {
      const parsedUrl = new URL(gerenciadora.apiUrl);
      if (parsedUrl.protocol !== "https:") {
        return res.status(400).json({ message: "URL deve usar HTTPS" });
      }
      const hostname = parsedUrl.hostname.toLowerCase();
      if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname.startsWith("192.168.") || hostname.startsWith("10.") || hostname.startsWith("169.254.") || hostname.endsWith(".local")) {
        return res.status(400).json({ message: "URL de rede interna não permitida" });
      }
    } catch {
      return res.status(400).json({ message: "URL inválida" });
    }

    const { vehicleData } = req.body;
    try {
      const response = await fetch(gerenciadora.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(gerenciadora.apiKey ? { Authorization: `Bearer ${gerenciadora.apiKey}` } : {}),
        },
        body: JSON.stringify({
          source: "torres_vigilancia",
          timestamp: new Date().toISOString(),
          data: vehicleData,
        }),
        signal: AbortSignal.timeout(10000),
      });

      await storage.createApiLog({
        endpoint: gerenciadora.apiUrl,
        method: "POST",
        requestData: JSON.stringify({ vehicleCount: vehicleData?.length || 0 }),
        responseStatus: response.status,
        responseData: response.ok ? "OK" : await response.text().catch(() => "error"),
        userId: req.user?.id || null,
        source: "mirror_gerenciadora",
      });

      if (response.ok) {
        res.json({ success: true, message: `Espelhamento enviado para ${gerenciadora.name}` });
      } else {
        res.status(502).json({ success: false, message: `Erro ao enviar: HTTP ${response.status}` });
      }
    } catch (err: any) {
      await storage.createApiLog({
        endpoint: gerenciadora.apiUrl!,
        method: "POST",
        requestData: JSON.stringify({ vehicleCount: vehicleData?.length || 0 }),
        responseStatus: 0,
        responseData: err.message,
        userId: req.user?.id || null,
        source: "mirror_gerenciadora",
      });
      res.status(502).json({ success: false, message: `Falha na conexão: ${err.message}` });
    }
  });

  app.get("/api/telemetry/events", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { eventType, plate, from, to, limit } = req.query;
      const filters: { eventType?: string; plate?: string; from?: Date; to?: Date; limit?: number } = {};
      if (eventType) filters.eventType = String(eventType);
      if (plate) filters.plate = String(plate);
      if (from) filters.from = new Date(String(from));
      if (to) filters.to = new Date(String(to));
      filters.limit = limit ? parseInt(String(limit)) : 500;
      const events = await storage.getTelemetryEvents(filters);
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/telemetry/summary", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { from, to } = req.query;
      const filters: { from?: Date; to?: Date } = {};
      if (from) filters.from = new Date(String(from));
      if (to) filters.to = new Date(String(to));

      const [speedEvents, idleEvents] = await Promise.all([
        storage.getTelemetryEvents({ ...filters, eventType: "excesso_velocidade", limit: 1000 }),
        storage.getTelemetryEvents({ ...filters, eventType: "idle_excessivo", limit: 1000 }),
      ]);

      const plateStats = new Map<string, { speedCount: number; maxSpeed: number; idleCount: number; totalIdleMin: number }>();

      for (const e of speedEvents) {
        const s = plateStats.get(e.plate) || { speedCount: 0, maxSpeed: 0, idleCount: 0, totalIdleMin: 0 };
        s.speedCount++;
        s.maxSpeed = Math.max(s.maxSpeed, e.value || 0);
        plateStats.set(e.plate, s);
      }

      for (const e of idleEvents) {
        const s = plateStats.get(e.plate) || { speedCount: 0, maxSpeed: 0, idleCount: 0, totalIdleMin: 0 };
        s.idleCount++;
        s.totalIdleMin += e.duration || 0;
        plateStats.set(e.plate, s);
      }

      const ranking = Array.from(plateStats.entries())
        .map(([plate, stats]) => ({ plate, ...stats }))
        .sort((a, b) => (b.speedCount + b.idleCount) - (a.speedCount + a.idleCount));

      const idleFuelCostEstimate = idleEvents.reduce((acc, e) => acc + (e.duration || 0), 0) * 0.015 * 6.5;

      res.json({
        totalSpeedEvents: speedEvents.length,
        totalIdleEvents: idleEvents.length,
        totalIdleMinutes: idleEvents.reduce((acc, e) => acc + (e.duration || 0), 0),
        idleFuelCostEstimate: Math.round(idleFuelCostEstimate * 100) / 100,
        ranking,
        recentSpeed: speedEvents.slice(0, 20),
        recentIdle: idleEvents.slice(0, 20),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/truckscontrol/espelhados", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const result = await truckscontrol.listEspelhados();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get("/api/truckscontrol/espelhamentos-pendentes", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const result = await truckscontrol.listEspelhamentosPendentes();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/truckscontrol/espelhar", requireAuth, requireAdminRole, async (req, res) => {
    const { veiID, cnpj, cmd, IE, TIE, validade, possoCancelar, comandoExclusivo, compartilharDados } = req.body;
    if (!veiID || !cnpj) return res.status(400).json({ success: false, message: "veiID e cnpj são obrigatórios" });
    try {
      const result = await truckscontrol.createEspelhamento(veiID, cnpj, { cmd, IE, TIE, validade, possoCancelar, comandoExclusivo, compartilharDados });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/truckscontrol/espelhar/diagnostico", requireAuth, requireAdminRole, async (req, res) => {
    const { veiID, cnpj } = req.body;
    if (!veiID || !cnpj) return res.status(400).json({ success: false, message: "veiID e cnpj são obrigatórios" });
    try {
      const result = await truckscontrol.diagnosticoEspelhamento(veiID, cnpj);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/truckscontrol/espelhamento/aceitar", requireAuth, requireAdminRole, async (req, res) => {
    const { veiID, desc } = req.body;
    if (!veiID) return res.status(400).json({ success: false, message: "veiID é obrigatório" });
    try {
      const result = await truckscontrol.acceptEspelhamento(veiID, desc);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/truckscontrol/espelhamento/rejeitar", requireAuth, requireAdminRole, async (req, res) => {
    const { veiID } = req.body;
    if (!veiID) return res.status(400).json({ success: false, message: "veiID é obrigatório" });
    try {
      const result = await truckscontrol.rejectEspelhamento(veiID);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/truckscontrol/espelhamento/cancelar", requireAuth, requireAdminRole, async (req, res) => {
    const { veiID, cnpj } = req.body;
    if (!veiID || !cnpj) return res.status(400).json({ success: false, message: "veiID e cnpj são obrigatórios" });
    try {
      const result = await truckscontrol.cancelEspelhamentoProprietario(veiID, cnpj);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ====================== MISSION ROUTES ======================

  app.get("/api/mission/active", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.json(null);

    const orders = await storage.getServiceOrdersByEmployee(user.employeeId);
    const allActive = orders.filter(
      (o) => (o.status === "em_andamento" || o.status === "agendada") && o.missionStatus !== "encerrada"
    );

    const emAndamento = allActive.find(o => o.status === "em_andamento");
    const nowMs = Date.now();
    const agendadas = allActive
      .filter(o => o.status === "agendada")
      .sort((a, b) => {
        const da = a.scheduledDate ? Math.abs(new Date(a.scheduledDate).getTime() - nowMs) : Infinity;
        const db = b.scheduledDate ? Math.abs(new Date(b.scheduledDate).getTime() - nowMs) : Infinity;
        return da - db;
      });
    const active = emAndamento || agendadas[0];
    if (!active) return res.json(null);

    const scheduled = allActive
      .filter(o => o.id !== active.id && o.status === "agendada")
      .sort((a, b) => {
        const da = a.scheduledDate ? Math.abs(new Date(a.scheduledDate).getTime() - nowMs) : Infinity;
        const db = b.scheduledDate ? Math.abs(new Date(b.scheduledDate).getTime() - nowMs) : Infinity;
        return da - db;
      });

    const [client, vehicle, emp1, emp2] = await Promise.all([
      storage.getClient(active.clientId),
      active.vehicleId ? storage.getVehicle(active.vehicleId) : null,
      active.assignedEmployeeId ? storage.getEmployee(active.assignedEmployeeId) : null,
      active.assignedEmployee2Id ? storage.getEmployee(active.assignedEmployee2Id) : null,
    ]);

    const photos = await storage.getMissionPhotosByOS(active.id);
    const completedSteps = photos.map((p) => p.step);

    const scheduledMissions = await Promise.all(
      scheduled.map(async (o) => {
        const c = await storage.getClient(o.clientId);
        return {
          id: o.id,
          osNumber: o.osNumber,
          clientName: c?.name || "—",
          scheduledDate: o.scheduledDate,
          route: o.route || null,
          origin: o.origin || null,
          destination: o.destination || null,
          status: o.status,
          missionStatus: o.missionStatus,
          priority: o.priority,
        };
      })
    );

    res.json({
      ...active,
      serviceOrderId: active.id,
      clientName: client?.name || "—",
      vehiclePlate: vehicle?.plate || "—",
      vehicleModel: vehicle?.model || "—",
      employee1Name: emp1?.name || "—",
      employee2Name: emp2?.name || "—",
      employeeId: user.employeeId,
      completedSteps,
      escortedDriverName: active.escortedDriverName || null,
      escortedDriverPhone: active.escortedDriverPhone || null,
      escortedVehiclePlate: active.escortedVehiclePlate || null,
      missionStartedAt: active.missionStartedAt || null,
      origin: active.origin || null,
      destination: active.destination || null,
      route: active.route || null,
      scheduledMissions,
    });
  });

  app.get("/api/mission/scheduled", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.json([]);

    const orders = await storage.getServiceOrdersByEmployee(user.employeeId);
    const scheduled = orders
      .filter((o) => (o.status === "agendada" || o.status === "aberta") && o.missionStatus !== "encerrada")
      .sort((a, b) => {
        const da = a.scheduledDate ? new Date(a.scheduledDate).getTime() : Infinity;
        const db = b.scheduledDate ? new Date(b.scheduledDate).getTime() : Infinity;
        return da - db;
      });

    const result = await Promise.all(
      scheduled.map(async (o) => {
        const c = await storage.getClient(o.clientId);
        return {
          id: o.id,
          osNumber: o.osNumber,
          clientName: c?.name || "—",
          scheduledDate: o.scheduledDate,
          route: o.route || null,
          origin: o.origin || null,
          destination: o.destination || null,
          status: o.status,
          missionStatus: o.missionStatus,
          priority: o.priority,
        };
      })
    );

    res.json(result);
  });

  app.post("/api/mission/update", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.status(403).json({ message: "Usuário não é funcionário" });

    const { serviceOrderId, message, missionStep, latitude, longitude, photoUrl } = req.body;
    if (!serviceOrderId || !message?.trim()) {
      return res.status(400).json({ message: "OS e mensagem são obrigatórios" });
    }

    let validatedPhotoUrl: string | null = null;
    if (photoUrl) {
      if (typeof photoUrl === "string" && photoUrl.startsWith("data:image/") && photoUrl.length <= 5 * 1024 * 1024) {
        validatedPhotoUrl = photoUrl;
      }
    }

    const so = await storage.getServiceOrder(serviceOrderId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    const emp = await storage.getEmployee(user.employeeId);

    try {
      await db.insert(missionUpdates).values({
        serviceOrderId,
        osNumber: so.osNumber || null,
        employeeId: user.employeeId,
        employeeName: emp?.name || user.name || "—",
        message: message.trim(),
        missionStep: missionStep || so.missionStatus || null,
        latitude: latitude || null,
        longitude: longitude || null,
        photoUrl: validatedPhotoUrl,
        readByAdmin: 0,
      });
      console.log(`[mission-update] Atualização salva: agente=${emp?.name || user.name} OS=${so.osNumber} msg="${message.trim().substring(0, 50)}"`);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[mission-update] Erro ao salvar:", err.message);
      res.status(500).json({ message: "Erro ao salvar atualização" });
    }
  });

  app.get("/api/mission/updates", requireAuth, requireAdminRole, async (req, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    const unreadOnly = req.query.unread === "true";
    const limit = parseInt(req.query.limit as string) || 50;

    let results;
    if (unreadOnly) {
      results = await db.select().from(missionUpdates).where(eq(missionUpdates.readByAdmin, 0)).orderBy(desc(missionUpdates.createdAt)).limit(limit);
    } else {
      results = await db.select().from(missionUpdates).orderBy(desc(missionUpdates.createdAt)).limit(limit);
    }
    res.json(results);
  });

  app.patch("/api/mission/updates/mark-read", requireAuth, requireAdminRole, async (req, res) => {
    const { ids } = req.body;
    if (ids && Array.isArray(ids)) {
      for (const id of ids) {
        await db.update(missionUpdates).set({ readByAdmin: 1 }).where(eq(missionUpdates.id, id));
      }
    } else {
      await db.update(missionUpdates).set({ readByAdmin: 1 }).where(eq(missionUpdates.readByAdmin, 0));
    }
    res.json({ success: true });
  });

  app.post("/api/mission/updates/:id/forward", requireAuth, requireAdminRole, async (req: any, res) => {
    try {
      const updateId = Number(req.params.id);
      const { recipientEmail, customMessage } = req.body;
      if (!recipientEmail) return res.status(400).json({ message: "Email do destinatário é obrigatório" });

      const [update] = await db.select().from(missionUpdates).where(eq(missionUpdates.id, updateId)).limit(1);
      if (!update) return res.status(404).json({ message: "Atualização não encontrada" });

      const os = await storage.getServiceOrder(update.serviceOrderId);
      if (!os) return res.status(404).json({ message: "OS não encontrada" });

      const client = await storage.getClient(os.clientId);

      const transporter = createSmtpTransporter();
      if (!transporter) return res.status(500).json({ message: "SMTP não configurado" });

      const missionLabelMap: Record<string, string> = {
        aguardando: "Saída da Base", checkout_armamento: "Saída da Base", checkout_viatura: "Saída da Base", checkout_km_saida: "Saída da Base",
        em_transito_origem: "Chegada na Origem", checkin_chegada_km: "Chegada na Origem", checkin_veiculo_escoltado: "Chegada na Origem", checkin_dados_motorista: "Chegada na Origem",
        iniciar_missao: "Em Missão", em_transito_destino: "Em Trânsito Destino",
        checkout_km_final: "Término de Missão", checkout_viatura_retorno: "Término de Missão",
        finalizada: "Missão Finalizada", retorno_base: "Retorno à Base", chegada_base: "Chegada na Base", encerrada: "Missão Encerrada",
      };
      const stepLabel = update.missionStep ? (missionLabelMap[update.missionStep] || update.missionStep) : "Atualização";
      const timeStr = update.createdAt ? new Date(update.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
      const locationLink = update.latitude && update.longitude ? `https://www.google.com/maps?q=${update.latitude},${update.longitude}&z=17&hl=pt-BR` : null;

      let photoHtml = "";
      if (update.photoUrl && update.photoUrl.startsWith("data:image/")) {
        photoHtml = `<div style="margin:15px 0;text-align:center;"><img src="${update.photoUrl}" style="max-width:100%;max-height:400px;border-radius:8px;border:1px solid #e0e0e0;" alt="Foto da operação" /></div>`;
      }

      const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#333;line-height:1.6;max-width:600px;margin:0 auto;">
  <div style="background:#1a1a1a;padding:20px 30px;text-align:center;">
    <h1 style="color:#fff;font-size:18px;margin:0;">TORRES VIGILÂNCIA PATRIMONIAL LTDA</h1>
    <p style="color:#999;font-size:12px;margin:4px 0 0;">CNPJ: 36.982.392/0001-89</p>
  </div>
  <div style="padding:30px;border:1px solid #e0e0e0;border-top:none;">
    <h2 style="color:#1a1a1a;font-size:16px;margin:0 0 20px;">ATUALIZAÇÃO DE ESCOLTA — ${os.osNumber}</h2>
    <p>Prezado(a) ${client?.contactPerson || client?.name || "Cliente"},</p>
    <p>Segue atualização da operação de escolta armada:</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;width:40%;">OS</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${os.osNumber}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Status</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${stepLabel}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Horário</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${timeStr}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Agente</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${update.employeeName || "—"}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Mensagem</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${update.message}</td></tr>
      ${locationLink ? `<tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Localização</td><td style="padding:8px 12px;border:1px solid #e0e0e0;"><a href="${locationLink}" style="color:#2563eb;">Ver no mapa</a></td></tr>` : ""}
      ${customMessage ? `<tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Observação</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${customMessage}</td></tr>` : ""}
    </table>
    ${photoHtml}
    <p style="margin-top:25px;">Atenciosamente,</p>
    <p style="margin:5px 0;"><strong>Torres Vigilância Patrimonial LTDA</strong></p>
    <p style="color:#666;font-size:13px;margin:2px 0;">Tel: (11) 96369-6699</p>
    <p style="color:#666;font-size:13px;margin:2px 0;">escolta@torresseguranca.com.br</p>
  </div>
  <div style="background:#f5f5f5;padding:15px 30px;text-align:center;border:1px solid #e0e0e0;border-top:none;">
    <p style="color:#999;font-size:11px;margin:0;">Este e-mail foi enviado automaticamente pelo sistema Torres Gestão.</p>
  </div>
</body></html>`;

      await transporter.sendMail({
        from: getSmtpFrom(),
        to: recipientEmail,
        bcc: SMTP_BCC_OS,
        subject: `Atualização de Escolta — ${os.osNumber} — ${stepLabel}`,
        html: htmlBody,
      });

      const forward = await storage.createClientForward({
        serviceOrderId: os.id,
        missionUpdateId: updateId,
        clientId: os.clientId,
        recipientEmail,
        subject: `Atualização de Escolta — ${os.osNumber} — ${stepLabel}`,
        message: customMessage || update.message,
        photoIncluded: !!update.photoUrl,
        sentBy: req.user?.name || req.user?.email || "admin",
      });

      console.log(`[forward] Email enviado para ${recipientEmail} (OS ${os.osNumber}, update #${updateId})`);
      res.json(forward);
    } catch (err: any) {
      console.error(`[forward] Erro: ${err.message}`);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/service-orders/:id/forwards", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "ID inválido" });
      const forwards = await storage.getClientForwardsByOS(id);
      res.json(forwards);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/mission/status/:serviceOrderId", requireAuth, async (req, res) => {
    const user = req.user!;
    const soId = Number(req.params.serviceOrderId);
    const so = await storage.getServiceOrder(soId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    if (user.role !== "admin" && user.employeeId) {
      const isAssigned = so.assignedEmployeeId === user.employeeId || so.assignedEmployee2Id === user.employeeId;
      if (!isAssigned) return res.status(403).json({ message: "Acesso negado" });
    }

    const photos = await storage.getMissionPhotosByOS(soId);
    const completedSteps = photos.map((p) => p.step);

    res.json({
      missionStatus: so.missionStatus,
      completedSteps,
      photoCount: photos.length,
      stepLogs: so.stepLogs || [],
    });
  });

  app.get("/api/mission/photos/:serviceOrderId", requireAuth, async (req, res) => {
    const user = req.user!;
    const soId = Number(req.params.serviceOrderId);
    const so = await storage.getServiceOrder(soId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    const isAdminRole = user.role === "admin" || user.role === "diretoria";
    if (!isAdminRole) {
      if (!user.employeeId) return res.status(403).json({ message: "Acesso negado" });
      const isAssigned = so.assignedEmployeeId === user.employeeId || so.assignedEmployee2Id === user.employeeId;
      if (!isAssigned) return res.status(403).json({ message: "Acesso negado" });
    }

    const photos = await storage.getMissionPhotosByOS(soId);
    const stripped = photos.map(({ photoData, ...rest }) => rest);
    res.json(stripped);
  });

  app.get("/api/mission/photo/:id", requireAuth, async (req, res) => {
    const user = req.user!;
    const photo = await storage.getMissionPhoto(Number(req.params.id));
    if (!photo) return res.status(404).json({ message: "Foto não encontrada" });

    const isAdminRole = user.role === "admin" || user.role === "diretoria";
    if (!isAdminRole) {
      if (!user.employeeId) return res.status(403).json({ message: "Acesso negado" });
      const so = await storage.getServiceOrder(photo.serviceOrderId);
      if (so) {
        const isAssigned = so.assignedEmployeeId === user.employeeId || so.assignedEmployee2Id === user.employeeId;
        if (!isAssigned) return res.status(403).json({ message: "Acesso negado" });
      }
    }

    res.json(photo);
  });

  const ALL_VALID_PHOTO_STEPS = new Set(
    Object.values(STEP_REQUIRED_PHOTOS).flat()
  );

  app.post("/api/mission/photo", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.status(403).json({ message: "Usuário não é funcionário" });

    const { serviceOrderId, step, photoData, kmValue, latitude, longitude } = req.body;
    if (!serviceOrderId || !step || !photoData) {
      console.log(`[mission-photo] Rejected: missing fields. serviceOrderId=${serviceOrderId}, step=${step}, hasPhotoData=${!!photoData}`);
      return res.status(400).json({ message: "Campos obrigatórios: serviceOrderId, step, photoData" });
    }

    if (!ALL_VALID_PHOTO_STEPS.has(step)) {
      console.log(`[mission-photo] Rejected: invalid step '${step}'. Valid steps: ${[...ALL_VALID_PHOTO_STEPS].join(", ")}`);
      return res.status(400).json({ message: "Etapa de foto inválida" });
    }

    const so = await storage.getServiceOrder(serviceOrderId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    if (so.status !== "em_andamento" && so.status !== "agendada") {
      console.log(`[mission-photo] Rejected: OS #${so.osNumber} status='${so.status}' (esperado em_andamento ou agendada)`);
      return res.status(400).json({ message: "OS não está em andamento" });
    }

    if (so.status === "agendada") {
      await storage.updateServiceOrder(so.id, { status: "em_andamento" });
    }

    const currentStepPhotos = STEP_REQUIRED_PHOTOS[so.missionStatus as string];
    if (!currentStepPhotos || !currentStepPhotos.includes(step)) {
      console.log(`[mission-photo] Rejected: foto step '${step}' não pertence a missionStatus='${so.missionStatus}'. Expected: ${currentStepPhotos?.join(", ") || "none"}`);
      return res.status(400).json({ message: `Foto não pertence à etapa atual da missão (etapa: ${so.missionStatus}, foto: ${step})` });
    }

    const isAssigned =
      so.assignedEmployeeId === user.employeeId ||
      so.assignedEmployee2Id === user.employeeId;
    if (!isAssigned) return res.status(403).json({ message: "Você não está atribuído a esta OS" });

    const kmSteps = ["km_saida", "km_chegada", "km_final", "base_hodometro"];
    if (kmSteps.includes(step) && (!kmValue || Number(kmValue) <= 0)) {
      return res.status(400).json({ message: "Valor de KM obrigatório para esta etapa" });
    }

    let photo;
    try {
      photo = await storage.createMissionPhoto({
        serviceOrderId,
        employeeId: user.employeeId,
        step,
        photoData,
        kmValue: kmValue ? Number(kmValue) : null,
        latitude: latitude || null,
        longitude: longitude || null,
        notes: null,
      });
      console.log(`[mission-photo] OK: step='${step}' OS #${so.osNumber} by employee #${user.employeeId}, photo id=${photo.id}`);
    } catch (dbErr: any) {
      console.error(`[mission-photo] DB insert error: ${dbErr.message}`);
      return res.status(500).json({ message: "Erro ao salvar foto no banco de dados" });
    }

    if (kmValue && Number(kmValue) > 0 && so.vehicleId && ["km_saida", "km_chegada", "km_final", "base_hodometro"].includes(step)) {
      try {
        const veh = await storage.getVehicle(so.vehicleId);
        if (veh && Number(kmValue) >= (veh.km || 0)) {
          await storage.updateVehicle(so.vehicleId, { km: Number(kmValue), lastKmUpdate: new Date() });
        }
      } catch {}
    }

    const PHOTO_STEP_LABELS: Record<string, string> = {
      km_saida: "KM Saída", km_chegada: "KM Chegada", km_final: "KM Final",
      base_hodometro: "Hodômetro Base", viatura_frente: "Viatura Frente",
      viatura_lateral: "Viatura Lateral", viatura_traseira: "Viatura Traseira",
      viatura_painel: "Viatura Painel", carga_frente: "Carga Frente",
      carga_lateral: "Carga Lateral", carga_traseira: "Carga Traseira",
      carga_lacre: "Carga Lacre", motorista_cnh: "CNH Motorista",
      motorista_foto: "Foto Motorista", doc_crlv: "CRLV", doc_nota: "Nota Fiscal",
      destino_entrega: "Entrega Destino", destino_carga: "Carga Destino",
      base_viatura_retorno: "Viatura Retorno",
    };
    const emp = await storage.getEmployee(user.employeeId);
    const stepLabel = PHOTO_STEP_LABELS[step] || step;
    const alertMsg = kmValue
      ? `📷 Foto: ${stepLabel} — KM ${Number(kmValue).toLocaleString("pt-BR")}`
      : `📷 Foto: ${stepLabel}`;
    try {
      await db.insert(missionUpdates).values({
        serviceOrderId,
        osNumber: so.osNumber || null,
        employeeId: user.employeeId,
        employeeName: emp?.name || user.name || "—",
        message: alertMsg,
        missionStep: so.missionStatus || null,
        latitude: latitude || null,
        longitude: longitude || null,
        photoUrl: photoData,
        readByAdmin: 0,
      });
      console.log(`[mission-photo] Alert created for OS #${so.osNumber} step=${step}`);
    } catch (alertErr: any) {
      console.error(`[mission-photo] Alert insert error (non-fatal): ${alertErr.message}`);
    }

    const { photoData: _, ...safePhoto } = photo;
    res.status(201).json(safePhoto);
  });

  app.post("/api/mission/escort-data", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.status(403).json({ message: "Usuário não é funcionário" });

    const { serviceOrderId, driverName, vehiclePlate, driverPhone } = req.body;
    if (!serviceOrderId || !driverName || !vehiclePlate) {
      return res.status(400).json({ message: "Campos obrigatórios: serviceOrderId, driverName, vehiclePlate" });
    }

    const so = await storage.getServiceOrder(serviceOrderId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    const isAssigned =
      so.assignedEmployeeId === user.employeeId ||
      so.assignedEmployee2Id === user.employeeId;
    if (!isAssigned) return res.status(403).json({ message: "Você não está atribuído a esta OS" });

    const updated = await storage.updateServiceOrder(serviceOrderId, {
      escortedDriverName: driverName,
      escortedDriverPhone: driverPhone || null,
      escortedVehiclePlate: vehiclePlate,
    });

    if (vehiclePlate && so.clientId) {
      try {
        const existing = await storage.getClientVehicleByPlate(so.clientId, vehiclePlate);
        if (!existing) {
          await storage.createClientVehicle({
            clientId: so.clientId,
            plate: vehiclePlate.toUpperCase(),
            driverName: driverName || null,
            driverPhone: driverPhone || null,
          });
        } else {
          const updates: any = {};
          if (driverName && driverName !== existing.driverName) updates.driverName = driverName;
          if (driverPhone && driverPhone !== existing.driverPhone) updates.driverPhone = driverPhone;
          if (Object.keys(updates).length > 0) await storage.updateClientVehicle(existing.id, updates);
        }
      } catch (_) {}
    }

    res.json(updated);
  });

  app.post("/api/mission/start", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.status(403).json({ message: "Usuário não é funcionário" });

    const { serviceOrderId } = req.body;
    const so = await storage.getServiceOrder(serviceOrderId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    const isAssigned =
      so.assignedEmployeeId === user.employeeId ||
      so.assignedEmployee2Id === user.employeeId;
    if (!isAssigned) return res.status(403).json({ message: "Você não está atribuído a esta OS" });

    if (so.missionStatus !== "iniciar_missao") {
      return res.status(400).json({ message: "Etapa atual não permite iniciar missão" });
    }

    res.json(so);
  });

  app.post("/api/mission/rollback-step", requireAdminRole, async (req, res) => {
    try {
      const { serviceOrderId } = req.body;
      const so = await storage.getServiceOrder(serviceOrderId);
      if (!so) return res.status(404).json({ message: "OS nao encontrada" });

      if (!so.missionStatus) return res.status(400).json({ message: "OS nao possui etapa de missao" });

      const currentIdx = MISSION_STEPS.indexOf(so.missionStatus as any);
      if (currentIdx < 0) return res.status(400).json({ message: "Status de missao invalido: " + so.missionStatus });
      if (currentIdx === 0) return res.status(400).json({ message: "Ja esta na primeira etapa, nao e possivel voltar" });

      const previousStep = MISSION_STEPS[currentIdx - 1];

      const updates: any = { missionStatus: previousStep };

      if (so.missionStatus === "encerrada") {
        updates.status = "em_andamento";
        updates.completedDate = null;

        if (so.kitId) {
          try { await storage.updateWeaponKit(so.kitId, { status: "em_uso" }); } catch (_e) {}
        }

        try {
          await supabaseAdmin.from("escort_billings")
            .delete()
            .eq("service_order_id", serviceOrderId);
        } catch (_e) {}

        try {
          await removeAutoTransaction("service_order", String(serviceOrderId));
          console.log(`[OS-Financial] Removed auto-transaction for rollback OS ${so.osNumber}`);
        } catch (_e) {}
      }

      const existingLogs = Array.isArray(so.stepLogs) ? so.stepLogs : [];
      const user = req.user!;
      const rollbackEntry = {
        step: `rollback_${so.missionStatus}_to_${previousStep}`,
        completedAt: new Date().toISOString(),
        agentName: `ADMIN: ${user.name}`,
        agentId: user.id,
        geo: null,
        nextStep: previousStep,
      };
      updates.stepLogs = [...existingLogs, rollbackEntry];

      const updated = await storage.updateServiceOrder(serviceOrderId, updates);
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/mission/cancel", requireAdminRole, async (req, res) => {
    try {
      const { serviceOrderId, reason } = req.body;
      const so = await storage.getServiceOrder(serviceOrderId);
      if (!so) return res.status(404).json({ message: "OS nao encontrada" });

      const updates: any = {
        status: "cancelada",
        missionStatus: so.missionStatus,
        completedDate: new Date(),
      };

      if (so.kitId) {
        try { await storage.updateWeaponKit(so.kitId, { status: "disponível" }); } catch (_e) {}
      }
      if (so.vehicleId) {
        try { await storage.updateVehicle(so.vehicleId, { status: "disponível" }); } catch (_e) {}
      }

      const existingLogs = Array.isArray(so.stepLogs) ? so.stepLogs : [];
      const user = req.user!;
      const cancelEntry = {
        step: "cancelada",
        completedAt: new Date().toISOString(),
        agentName: `ADMIN: ${user.name}`,
        agentId: user.id,
        geo: null,
        nextStep: "cancelada",
        reason: reason || "Cancelada pelo administrador",
      };
      updates.stepLogs = [...existingLogs, cancelEntry];

      lastMissionPos.delete(serviceOrderId);
      try { await db.delete(missionPositions).where(eq(missionPositions.serviceOrderId, serviceOrderId)); } catch (_e) { console.error("[cleanup] Failed to delete mission_positions for OS", serviceOrderId); }

      try {
        await removeAutoTransaction("service_order", String(serviceOrderId));
        console.log(`[OS-Financial] Removed auto-transaction for cancelled OS ${so.osNumber}`);
      } catch (_e) {}

      const updated = await storage.updateServiceOrder(serviceOrderId, updates);

      if (so.type === "escolta") {
        try {
          await supabaseAdmin.from("escort_billings").delete().eq("service_order_id", serviceOrderId);

          const n = (v: any) => Number(v) || 0;

          let contrato: any = { valor_acionamento: 0, valor_cancelamento: 0, tabela_cancelamento: 0, valor_km_carregado: 2.80, valor_km_vazio: 1.40, valor_km_extra: 0, franquia_km: 50, franquia_minima_km: 50, franquia_horas: 0, valor_hora_extra: 50, valor_hora_estadia: 50, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
          if (so.escortContractId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", so.escortContractId).limit(1);
            if (cc?.length) contrato = cc[0];
          } else if (so.clientId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.clientId).eq("status", "Ativo").limit(1);
            if (cc?.length) contrato = cc[0];
          }

          const stepsDeslocamento = ["checkout_armamento", "checkout_viatura", "checkout_km_saida", "em_transito_origem"];
          const stepsChegouOrigem = ["checkin_chegada_km", "checkin_veiculo_escoltado", "checkin_dados_motorista", "iniciar_missao", "em_transito_destino", "chegada_destino", "checkout_km_final", "checkout_viatura_retorno", "finalizada", "retorno_base", "chegada_base", "encerrada"];
          const missionStatus = so.missionStatus as string || "aguardando";

          const cenario = stepsChegouOrigem.includes(missionStatus) ? "B" :
                          stepsDeslocamento.includes(missionStatus) ? "A" : null;

          if (cenario) {
            let fatCancelamento = 0;
            let fatHoraExtra = 0;
            let fatKmExcedente = 0;
            let cenarioDesc = "";

            if (cenario === "A") {
              fatCancelamento = n(contrato.tabela_cancelamento) || n(contrato.valor_cancelamento) || 0;
              cenarioDesc = "CANCELADA EM DESLOCAMENTO (Tabela Cancelamento)";
            } else {
              fatCancelamento = n(contrato.valor_acionamento) || 0;
              cenarioDesc = "CANCELADA NA ORIGEM (Acionamento)";

              const logChegada = existingLogs.find((l: any) => l.step === "checkin_chegada_km");
              if (logChegada) {
                const chegadaTime = new Date(logChegada.completedAt || logChegada.timestamp);
                const cancelTime = new Date();
                const horasEspera = (cancelTime.getTime() - chegadaTime.getTime()) / (1000 * 60 * 60);
                if (horasEspera > 3) {
                  const horasExcedentes = horasEspera - (n(contrato.franquia_horas) || 3);
                  if (horasExcedentes > 0) {
                    const valorHoraExtra = n(contrato.valor_hora_extra) || n(contrato.valor_hora_estadia) || 50;
                    fatHoraExtra = Math.round(horasExcedentes * valorHoraExtra * 100) / 100;
                    cenarioDesc += ` + HE ${horasExcedentes.toFixed(1)}h`;
                  }
                }
              }

              const photos = await storage.getMissionPhotosByOS(serviceOrderId);
              const kmSaidaPhoto = photos.find((p: any) => p.step === "km_saida");
              const kmChegadaPhoto = [...photos].reverse().find((p: any) => p.step === "km_chegada");
              if (kmSaidaPhoto?.kmValue && kmChegadaPhoto?.kmValue) {
                const distanciaBaseOrigem = Math.abs(n(kmChegadaPhoto.kmValue) - n(kmSaidaPhoto.kmValue));
                if (distanciaBaseOrigem > 100) {
                  const kmExcedente = distanciaBaseOrigem - (n(contrato.franquia_km) || n(contrato.franquia_minima_km) || 100);
                  if (kmExcedente > 0) {
                    const valorKmExtra = n(contrato.valor_km_extra) || n(contrato.valor_km_carregado) || 2.80;
                    fatKmExcedente = Math.round(kmExcedente * valorKmExtra * 100) / 100;
                    cenarioDesc += ` + KM Exc. ${kmExcedente.toFixed(0)}km`;
                  }
                }
              }
            }

            const fatTotal = fatCancelamento + fatHoraExtra + fatKmExcedente;

            if (fatTotal > 0) {
              const client = so.clientId ? await storage.getClient(so.clientId) : null;
              const emp = so.assignedEmployeeId ? await storage.getEmployee(so.assignedEmployeeId) : null;
              const vehicle = so.vehicleId ? await storage.getVehicle(so.vehicleId) : null;

              const photos = await storage.getMissionPhotosByOS(serviceOrderId);
              const kmSaidaPhoto = photos.find((p: any) => p.step === "km_saida");
              const kmChegadaPhoto = [...photos].reverse().find((p: any) => p.step === "km_chegada");
              const kmInicial = n(kmChegadaPhoto?.kmValue || kmSaidaPhoto?.kmValue || 0);
              const kmFinal = kmInicial;

              const toBRT = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });

              await supabaseAdmin.from("escort_billings").insert({
                service_order_id: serviceOrderId,
                client_id: so.clientId, client_name: client?.name || "--",
                contract_id: contrato.id || null,
                km_inicial: kmInicial, km_final: kmFinal, km_vazio: 0,
                km_carregado: 0, km_total: 0, km_faturado: 0, km_franquia: 0, km_excedente: 0,
                horario_agendado: so.scheduledDate ? toBRT(new Date(so.scheduledDate)) : null,
                horario_inicio: so.missionStartedAt ? toBRT(new Date(so.missionStartedAt as string)) : null,
                horario_fim: toBRT(new Date()),
                horas_missao: 0, horas_trabalhadas: 0, horas_estadia: 0,
                teve_pernoite: false, is_noturno: false,
                fat_acionamento: cenario === "B" ? fatCancelamento : 0,
                fat_hora_extra: fatHoraExtra,
                fat_km: fatKmExcedente, fat_km_carregado: 0, fat_km_vazio: 0,
                fat_estadia: 0, fat_pernoite: 0, fat_diaria: 0, fat_adicional_noturno: 0,
                fat_total: fatTotal,
                valor_franquia: 0, valor_km_extra: fatKmExcedente,
                pag_vrp: 0, pag_periculosidade: 0, pag_adicional_noturno: 0,
                pag_reembolsos: 0, pag_total: 0,
                resultado_bruto: fatTotal, resultado_liquido: fatTotal, margem_percentual: 100,
                vigilante_id: so.assignedEmployeeId, vigilante_name: emp?.name || "--",
                origem: so.origin || null, destino: so.destination || null,
                placa_viatura: vehicle?.plate || null,
                data_missao: so.scheduledDate || new Date().toISOString(),
                status: "CANCELADO", created_by: user.name,
                observacoes: `${cenarioDesc} | Motivo: ${reason || "Cancelada pelo administrador"} | Cenário ${cenario}`,
              });

              await createAutoTransaction({
                description: `CANCELAMENTO OS ${so.osNumber} - ${client?.name || "--"} ${vehicle?.plate || ""}`.toUpperCase().trim(),
                amount: fatTotal,
                type: "INCOME",
                due_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
                origin_type: "service_order",
                origin_id: String(serviceOrderId),
                category_name: "Receita de Escolta",
                entity_name: client?.name || "--",
                created_by: user.name,
              });

              console.log(`[OS-Cancel-Billing] OS ${so.osNumber}: Cenário ${cenario} — Total R$ ${fatTotal.toFixed(2)} (cancelamento=${fatCancelamento}, HE=${fatHoraExtra}, KM=${fatKmExcedente})`);
            } else {
              console.log(`[OS-Cancel-Billing] OS ${so.osNumber}: Cenário ${cenario} mas sem valores no contrato — nenhum faturamento gerado`);
            }
          } else {
            console.log(`[OS-Cancel-Billing] OS ${so.osNumber}: Missão em status '${missionStatus}' — sem faturamento de cancelamento (viatura não saiu)`);
          }
        } catch (billingErr: any) {
          console.error(`[OS-Cancel-Billing] Erro ao gerar billing de cancelamento para OS ${so.osNumber}:`, billingErr.message);
        }
      }

      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/mission/finish", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { serviceOrderId } = req.body;
      const so = await storage.getServiceOrder(serviceOrderId);
      if (!so) return res.status(404).json({ message: "OS não encontrada" });

      const updates: any = {
        status: "concluída",
        missionStatus: "encerrada",
        completedDate: new Date(),
      };

      if (so.kitId) {
        try { await storage.updateWeaponKit(so.kitId, { status: "disponível" }); } catch (_e) {}
      }
      if (so.vehicleId) {
        try { await storage.updateVehicle(so.vehicleId, { status: "disponível" }); } catch (_e) {}
      }

      const existingLogs = Array.isArray(so.stepLogs) ? so.stepLogs : [];
      const user = req.user!;
      const finishEntry = {
        step: "encerrada",
        completedAt: new Date().toISOString(),
        agentName: `ADMIN: ${user.name}`,
        agentId: user.id,
        geo: null,
        nextStep: "encerrada",
        reason: "Missão finalizada pelo administrador",
      };
      updates.stepLogs = [...existingLogs, finishEntry];

      lastMissionPos.delete(serviceOrderId);
      try { await db.delete(missionPositions).where(eq(missionPositions.serviceOrderId, serviceOrderId)); } catch (_e) { console.error("[cleanup] Failed to delete mission_positions for OS", serviceOrderId); }

      const updated = await storage.updateServiceOrder(serviceOrderId, updates);

      if (so.type === "escolta") {
        try {
          const { data: billing } = await supabaseAdmin.from("escort_billings")
            .select("fat_total, client_name")
            .eq("service_order_id", serviceOrderId)
            .order("created_at", { ascending: false })
            .limit(1);
          const billingRow = billing?.[0];
          const fatTotal = billingRow ? Number(billingRow.fat_total || 0) : 0;
          const revenueAmount = fatTotal > 0 ? fatTotal : Number((so as any).valorEstimado || 0);
          const clientName = billingRow?.client_name || (so.clientId ? (await storage.getClient(so.clientId))?.name : null) || "—";
          const vehicle = so.vehicleId ? await storage.getVehicle(so.vehicleId) : null;
          const plateStr = vehicle?.plate || "";

          if (revenueAmount > 0) {
            await removeAutoTransaction("service_order", String(serviceOrderId));
            await createAutoTransaction({
              description: `RECEITA OS ${so.osNumber} - ${clientName} ${plateStr}`.toUpperCase().trim(),
              amount: revenueAmount,
              type: "INCOME",
              due_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
              origin_type: "service_order",
              origin_id: String(serviceOrderId),
              category_name: "Receita de Escolta",
              entity_name: clientName,
              created_by: user.name,
            });
            if (fatTotal > 0) await storage.updateServiceOrder(serviceOrderId, { valorEstimado: fatTotal } as any);
            console.log(`[OS-Financial] Auto INCOME created for OS ${so.osNumber}: R$ ${revenueAmount} (billing: ${fatTotal}, estimado: ${(so as any).valorEstimado || 0})`);
          }
        } catch (e: any) {
          console.error(`[OS-Financial] Failed to create auto-transaction for OS ${so.osNumber}:`, e.message);
        }
      }

      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/mission/advance", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.status(403).json({ message: "Usuário não é funcionário" });

    const { serviceOrderId } = req.body;
    const so = await storage.getServiceOrder(serviceOrderId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    if (so.status !== "em_andamento" && so.status !== "agendada") {
      return res.status(403).json({ message: "OS não está em andamento. Aguarde a liberação pela administração." });
    }

    const isAssigned =
      so.assignedEmployeeId === user.employeeId ||
      so.assignedEmployee2Id === user.employeeId;
    if (!isAssigned) return res.status(403).json({ message: "Você não está atribuído a esta OS" });

    const currentIdx = MISSION_STEPS.indexOf(so.missionStatus as any);
    if (currentIdx < 0 || currentIdx >= MISSION_STEPS.length - 1) {
      return res.status(400).json({ message: "Missão já finalizada ou status inválido" });
    }

    const currentStep = MISSION_STEPS[currentIdx];


    if (so.status === "agendada" && currentStep === "aguardando") {
      await storage.updateServiceOrder(serviceOrderId, { status: "em_andamento" });
    }
    const requiredPhotos = STEP_REQUIRED_PHOTOS[currentStep];
    if (requiredPhotos) {
      const photos = await storage.getMissionPhotosByOS(serviceOrderId);
      const existingSteps = photos.map((p) => p.step);
      const missing = requiredPhotos.filter((s) => !existingSteps.includes(s));
      if (missing.length > 0) {
        return res.status(400).json({
          message: `Fotos obrigatórias pendentes: ${missing.join(", ")}`,
          missing,
        });
      }
    }

    if (currentStep === "checkin_dados_motorista") {
      if (!so.escortedDriverName || !so.escortedVehiclePlate) {
        return res.status(400).json({
          message: "Dados do motorista e placa do veículo escoltado são obrigatórios",
        });
      }
    }

    if (currentStep === "chegada_base") {
      if (!so.baseReturnKm) {
        return res.status(400).json({ message: "Quilometragem de retorno obrigatória" });
      }
      if (!so.baseCleanStatus) {
        return res.status(400).json({ message: "Status de limpeza da viatura obrigatório" });
      }
      if (!so.baseChecklistConfirmed) {
        return res.status(400).json({ message: "Checklist da viatura obrigatório" });
      }
    }

    let nextStep = MISSION_STEPS[currentIdx + 1];
    if (currentStep === "chegada_destino") {
      nextStep = "finalizada";
    }
    const updates: any = { missionStatus: nextStep };

    if (currentStep === "em_transito_origem" && !so.missionStartedAt) {
      const now = new Date();
      if (so.scheduledDate) {
        const scheduled = new Date(so.scheduledDate);
        updates.missionStartedAt = now < scheduled ? scheduled : now;
      } else {
        updates.missionStartedAt = now;
      }
    }

    if (nextStep === "finalizada") {
      updates.completedDate = new Date();
      updates.status = "concluida";
      lastMissionPos.delete(serviceOrderId);
      try { await db.delete(missionPositions).where(eq(missionPositions.serviceOrderId, serviceOrderId)); } catch (_e) { console.error("[cleanup] Failed to delete mission_positions for OS", serviceOrderId); }
    }

    if (nextStep === "encerrada") {
      if (updates.status !== "concluida") updates.status = "concluida";
      lastMissionPos.delete(serviceOrderId);
      try { await db.delete(missionPositions).where(eq(missionPositions.serviceOrderId, serviceOrderId)); } catch (_e) { console.error("[cleanup] Failed to delete mission_positions for OS", serviceOrderId); }
    }

    const existingLogs = Array.isArray(so.stepLogs) ? so.stepLogs : [];
    const geo = req.body.latitude && req.body.longitude ? { lat: req.body.latitude, lng: req.body.longitude } : null;
    const emp = await storage.getEmployee(user.employeeId);
    const stepLogEntry = {
      step: currentStep,
      completedAt: new Date().toISOString(),
      agentName: emp?.fullName || user.name || "—",
      agentId: user.employeeId,
      geo,
      nextStep,
    };
    updates.stepLogs = [...existingLogs, stepLogEntry];

    const updated = await storage.updateServiceOrder(serviceOrderId, updates);

    const STEP_ALERT_LABELS: Record<string, string> = {
      aguardando: "Aguardando", checkout_km_saida: "Checkout KM Saída",
      em_transito_origem: "Em Trânsito Origem", checkin_chegada_km: "Chegada Cliente",
      checkin_dados_motorista: "Dados Motorista", iniciar_missao: "Início Missão",
      em_transito_destino: "Em Trânsito Destino", chegada_destino: "Chegada Destino",
      checkout_km_final: "KM Final", finalizada: "Finalizada",
      chegada_base: "Chegada Base", encerrada: "Encerrada",
    };
    try {
      const stepFromLabel = STEP_ALERT_LABELS[currentStep] || currentStep;
      const stepToLabel = STEP_ALERT_LABELS[nextStep] || nextStep;
      await db.insert(missionUpdates).values({
        serviceOrderId,
        osNumber: so.osNumber || null,
        employeeId: user.employeeId,
        employeeName: emp?.fullName || emp?.name || user.name || "—",
        message: `🔄 Etapa avançada: ${stepFromLabel} → ${stepToLabel}`,
        missionStep: nextStep,
        latitude: geo?.lat?.toString() || null,
        longitude: geo?.lng?.toString() || null,
        photoUrl: null,
        readByAdmin: 0,
      });
      console.log(`[mission-advance] Alert created: ${currentStep} → ${nextStep} OS #${so.osNumber}`);
    } catch (alertErr: any) {
      console.error(`[mission-advance] Alert insert error (non-fatal): ${alertErr.message}`);
    }

    if (nextStep === "finalizada" && so.kitId) {
      await storage.updateWeaponKit(so.kitId, { status: "disponível" });
    }

    if (nextStep === "finalizada" && so.vehicleId) {
      try {
        await storage.updateVehicle(so.vehicleId, { status: "disponível" });
        const veh = await storage.getVehicle(so.vehicleId);
        const photos = await storage.getMissionPhotosByOS(serviceOrderId);
        const allKmValues = [
          so.baseReturnKm ? Number(so.baseReturnKm) : 0,
          ...photos.filter(p => p.kmValue).map(p => Number(p.kmValue)),
        ].filter(v => v > 0);
        const highestKm = Math.max(...allKmValues, 0);
        if (veh && highestKm > 0 && highestKm >= (veh.km || 0)) {
          await storage.updateVehicle(so.vehicleId, { km: highestKm, lastKmUpdate: new Date() });
        }
      } catch (kmErr: any) {
        console.error("Vehicle KM/status update on finalizada failed:", kmErr.message);
      }
    }

    if (nextStep === "encerrada" && so.kitId) {
      try { await storage.updateWeaponKit(so.kitId, { status: "disponível" }); } catch (_e) {}
    }

    if (nextStep === "encerrada") {
      try {
        const photos = await storage.getMissionPhotosByOS(serviceOrderId);
        const kmSaidaPhoto = photos.find(p => p.step === "km_saida");
        const kmChegadaPhoto = [...photos].reverse().find(p => p.step === "km_chegada");
        const kmFinalPhoto = photos.find(p => p.step === "km_final");
        const kmInicial = kmChegadaPhoto?.kmValue || kmSaidaPhoto?.kmValue || 0;
        const kmFinal = kmFinalPhoto?.kmValue || 0;

        const scheduledTime = so.scheduledDate ? new Date(so.scheduledDate).toTimeString().slice(0, 5) : undefined;
        const startTime = so.missionStartedAt ? new Date(so.missionStartedAt).toTimeString().slice(0, 5) : undefined;
        const completedDateVal = updated.completedDate || so.completedDate;
        const endTime = completedDateVal ? new Date(completedDateVal as string).toTimeString().slice(0, 5) : undefined;

        let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };

        if (so.escortContractId) {
          const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", so.escortContractId).limit(1);
          if (cc?.length) contrato = cc[0];
        } else if (so.clientId) {
          const { data: clientContracts } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.clientId).limit(1);
          if (clientContracts?.length) contrato = clientContracts[0];
        }

        {
          const resultado = calcularEscolta({
            km_inicial: kmInicial, km_final: kmFinal > kmInicial ? kmFinal : kmInicial, km_vazio: 0,
            horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
            horario_inicio: startTime, horario_fim: endTime, horario_agendado: scheduledTime,
            despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0, contrato,
          });

          const client = so.clientId ? await storage.getClient(so.clientId) : null;
          const emp = so.assignedEmployeeId ? await storage.getEmployee(so.assignedEmployeeId) : null;
          const emp2 = so.assignedEmployee2Id ? await storage.getEmployee(so.assignedEmployee2Id) : null;

          const nb = (v: any) => Number(v) || 0;
          await supabaseAdmin.from("escort_billings").insert({
            service_order_id: serviceOrderId,
            client_id: so.clientId, client_name: client?.name || "—",
            contract_id: contrato.id || null,
            km_inicial: nb(kmInicial), km_final: nb(kmFinal), km_vazio: 0,
            km_carregado: nb(resultado.km_carregado), km_total: nb(resultado.km_total),
            km_faturado: nb(resultado.km_faturado), km_franquia: nb(resultado.km_franquia),
            km_excedente: nb(resultado.km_excedente),
            horario_agendado: scheduledTime || null,
            horario_inicio: startTime || null, horario_fim: endTime || null,
            horario_inicio_considerado: resultado.horario_inicio_considerado,
            horas_missao: nb(resultado.horas_trabalhadas), horas_trabalhadas: nb(resultado.horas_trabalhadas),
            horas_estadia: 0, teve_pernoite: false, is_noturno: resultado.is_noturno,
            fat_acionamento: nb(resultado.fat_acionamento), fat_hora_extra: nb(resultado.fat_hora_extra),
            fat_km: nb(resultado.fat_km), fat_km_carregado: nb(resultado.faturamento.km_carregado),
            fat_km_vazio: nb(resultado.faturamento.km_vazio),
            fat_estadia: nb(resultado.fat_estadia), fat_pernoite: nb(resultado.fat_pernoite),
            fat_diaria: nb(resultado.fat_pernoite), fat_adicional_noturno: nb(resultado.fat_adicional_noturno),
            fat_total: nb(resultado.fat_total),
            valor_franquia: nb(resultado.valor_franquia), valor_km_extra: nb(resultado.valor_km_extra),
            pag_vrp: nb(resultado.pag_vrp), pag_periculosidade: nb(resultado.pag_periculosidade),
            pag_adicional_noturno: nb(resultado.pag_adicional_noturno),
            pag_reembolsos: nb(resultado.pag_reembolsos), pag_total: nb(resultado.pag_total),
            resultado_bruto: nb(resultado.resultado.bruto), resultado_liquido: nb(resultado.resultado.liquido),
            margem_percentual: nb(resultado.resultado.margem_pct),
            vigilante_id: so.assignedEmployeeId, vigilante_name: emp?.name || user.name,
            vigilante2_id: so.assignedEmployee2Id || null, vigilante2_name: emp2?.name || null,
            origem: so.origin || null, destino: so.destination || null,
            placa_viatura: so.vehicleId ? (await storage.getVehicle(so.vehicleId))?.plate || null : null,
            placa_escoltado: so.escortedVehiclePlate || null,
            motorista_escoltado: so.escortedDriverName || null,
            data_missao: so.scheduledDate || new Date().toISOString(),
            status: "A_VERIFICAR", created_by: user.name,
          });
        }
      } catch (billingErr: any) {
        console.error("Auto-billing creation failed (non-blocking):", billingErr.message);
      }

      if (so.type === "escolta") {
        try {
          const { data: billing } = await supabaseAdmin.from("escort_billings")
            .select("fat_total, client_name")
            .eq("service_order_id", serviceOrderId)
            .order("created_at", { ascending: false })
            .limit(1);
          const billingRow = billing?.[0];
          const fatTotal = billingRow ? Number(billingRow.fat_total || 0) : 0;
          const revenueAmount = fatTotal > 0 ? fatTotal : Number((so as any).valorEstimado || 0);
          const clientName = billingRow?.client_name || (so.clientId ? (await storage.getClient(so.clientId))?.name : null) || "—";
          const vehicle = so.vehicleId ? await storage.getVehicle(so.vehicleId) : null;
          const plateStr = vehicle?.plate || "";

          if (revenueAmount > 0) {
            await removeAutoTransaction("service_order", String(serviceOrderId));
            await createAutoTransaction({
              description: `RECEITA OS ${so.osNumber} - ${clientName} ${plateStr}`.toUpperCase().trim(),
              amount: revenueAmount,
              type: "INCOME",
              due_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
              origin_type: "service_order",
              origin_id: String(serviceOrderId),
              category_name: "Receita de Escolta",
              entity_name: clientName,
              created_by: emp?.name || user.name,
            });
            if (fatTotal > 0) await storage.updateServiceOrder(serviceOrderId, { valorEstimado: fatTotal } as any);
            console.log(`[OS-Financial] Auto INCOME created via advance for OS ${so.osNumber}: R$ ${revenueAmount}`);
          }
        } catch (revErr: any) {
          console.error(`[OS-Financial] Revenue auto-tx via advance failed for OS ${so.osNumber}:`, revErr.message);
        }
      }
    }

    res.json(updated);
  });

  app.post("/api/mission/base-clean", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.status(403).json({ message: "Usuário não é funcionário" });

    const { serviceOrderId, cleanStatus, cleanNotes, baseReturnKm, checklistConfirmed } = req.body;
    const so = await storage.getServiceOrder(serviceOrderId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    const isAssigned =
      so.assignedEmployeeId === user.employeeId ||
      so.assignedEmployee2Id === user.employeeId;
    if (!isAssigned) return res.status(403).json({ message: "Você não está atribuído a esta OS" });

    if (so.missionStatus !== "chegada_base") {
      return res.status(400).json({ message: "Ação disponível apenas na etapa de chegada à base" });
    }

    if (!cleanStatus || !["limpa", "suja"].includes(cleanStatus)) {
      return res.status(400).json({ message: "Status de limpeza inválido" });
    }
    if (cleanStatus === "suja" && (!cleanNotes || !cleanNotes.trim())) {
      return res.status(400).json({ message: "Motivo obrigatório quando viatura está suja" });
    }
    if (!baseReturnKm || Number(baseReturnKm) <= 0) {
      return res.status(400).json({ message: "Quilometragem de retorno obrigatória" });
    }
    if (!checklistConfirmed) {
      return res.status(400).json({ message: "Checklist da viatura obrigatório" });
    }

    const updated = await storage.updateServiceOrder(serviceOrderId, {
      baseCleanStatus: cleanStatus,
      baseCleanNotes: cleanStatus === "suja" ? cleanNotes.trim() : null,
      baseReturnKm: String(baseReturnKm),
      baseChecklistConfirmed: true,
    });

    if (so.vehicleId && Number(baseReturnKm) > 0) {
      try {
        const veh = await storage.getVehicle(so.vehicleId);
        if (veh && Number(baseReturnKm) >= (veh.km || 0)) {
          await storage.updateVehicle(so.vehicleId, { km: Number(baseReturnKm), lastKmUpdate: new Date() });
        }
      } catch {}
    }

    res.json(updated);
  });

  app.post("/api/mission/simulate-step", requireAdminRole, async (req, res) => {
    try {
      const { serviceOrderId, action } = req.body;
      const so = await storage.getServiceOrder(serviceOrderId);
      if (!so) return res.status(404).json({ message: "OS nao encontrada" });

      const currentStep = so.missionStatus as string;
      const currentIdx = MISSION_STEPS.indexOf(currentStep as any);
      if (currentIdx < 0 || currentIdx >= MISSION_STEPS.length - 1) {
        return res.status(400).json({ message: "Missao ja finalizada ou status invalido" });
      }

      if (so.status === "agendada" && currentStep === "aguardando") {
        await storage.updateServiceOrder(serviceOrderId, { status: "em_andamento" });
      }

      const requiredPhotos = STEP_REQUIRED_PHOTOS[currentStep];
      if (requiredPhotos && action === "upload_photos") {
        const existingPhotos = await storage.getMissionPhotosByOS(serviceOrderId);
        const existingSteps = existingPhotos.map(p => p.step);
        const missing = requiredPhotos.filter(s => !existingSteps.includes(s));

        const empId = so.assignedEmployeeId || 0;
        const simPhoto = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsM" +
          "DhEQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQU" +
          "FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAKAAoDASIAAhEBAxEB/8QAFQABAQAA" +
          "AAAAAAAAAAAAAAAAAkn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQ" +
          "EAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==";

        const baseKm = so.vehicleId ? ((await storage.getVehicle(so.vehicleId))?.km || 100) : 100;
        const kmSteps = ["km_saida", "km_chegada", "km_final", "base_hodometro"];
        const kmIncrement: Record<string, number> = { km_saida: 0, km_chegada: 50, km_final: 50, base_hodometro: 80 };

        for (const step of missing) {
          const kmVal = kmSteps.includes(step) ? baseKm + (kmIncrement[step] || 0) : null;
          await storage.createMissionPhoto({
            serviceOrderId, employeeId: empId, step,
            photoData: simPhoto,
            kmValue: kmVal, latitude: "-23.4827", longitude: "-46.7346", notes: "SIMULACAO",
          });
          if (kmVal && so.vehicleId && kmSteps.includes(step)) {
            try {
              const veh = await storage.getVehicle(so.vehicleId);
              if (veh && kmVal >= (veh.km || 0)) {
                await storage.updateVehicle(so.vehicleId, { km: kmVal, lastKmUpdate: new Date() });
              }
            } catch {}
          }
        }
        return res.json({ message: `${missing.length} fotos simuladas enviadas`, step: currentStep, photosUploaded: missing });
      }

      if (action === "escort_data" && currentStep === "checkin_dados_motorista") {
        if (!so.escortedDriverName || !so.escortedVehiclePlate) {
          await storage.updateServiceOrder(serviceOrderId, {
            escortedDriverName: so.escortedDriverName || "Joao Silva (SIM)",
            escortedVehiclePlate: so.escortedVehiclePlate || "ABC1D23",
            escortedDriverPhone: so.escortedDriverPhone || "(11) 99999-0000",
          });
        }
        return res.json({ message: "Dados do motorista preenchidos (simulacao)" });
      }

      if (action === "start_mission" && currentStep === "iniciar_missao") {
        if (!so.missionStartedAt) {
          await storage.updateServiceOrder(serviceOrderId, { missionStartedAt: new Date() });
        }
        return res.json({ message: "Missao iniciada (simulacao)" });
      }

      if (action === "base_clean" && currentStep === "chegada_base") {
        const baseKm = so.vehicleId ? ((await storage.getVehicle(so.vehicleId))?.km || 100) + 10 : 999;
        await storage.updateServiceOrder(serviceOrderId, {
          baseCleanStatus: "limpa",
          baseCleanNotes: null,
          baseReturnKm: String(baseKm),
          baseChecklistConfirmed: true,
        });
        if (so.vehicleId) {
          try {
            const veh = await storage.getVehicle(so.vehicleId);
            if (veh && baseKm >= (veh.km || 0)) {
              await storage.updateVehicle(so.vehicleId, { km: baseKm, lastKmUpdate: new Date() });
            }
          } catch {}
        }
        return res.json({ message: `Viatura limpa, KM retorno: ${baseKm} (simulacao)` });
      }

      if (action === "advance") {
        let nextStep = MISSION_STEPS[currentIdx + 1];
        if (currentStep === "chegada_destino") nextStep = "finalizada";
        const updates: any = { missionStatus: nextStep };

        if (nextStep === "finalizada") {
          updates.completedDate = new Date();
        }

        if (nextStep === "encerrada") {
          updates.status = "concluida";
          lastMissionPos.delete(serviceOrderId);
          try { await db.delete(missionPositions).where(eq(missionPositions.serviceOrderId, serviceOrderId)); } catch (_e) { console.error("[cleanup] Failed to delete mission_positions for OS", serviceOrderId); }
        }

        const existingLogs = Array.isArray(so.stepLogs) ? so.stepLogs : [];
        const user = req.user!;
        updates.stepLogs = [...existingLogs, {
          step: currentStep, completedAt: new Date().toISOString(),
          agentName: `SIMULACAO (${user.name})`, agentId: user.id,
          geo: { lat: -23.4827, lng: -46.7346 }, nextStep,
        }];

        const updated = await storage.updateServiceOrder(serviceOrderId, updates);

        if (nextStep === "finalizada" && so.kitId) {
          await storage.updateWeaponKit(so.kitId, { status: "disponível" });
        }
        if (nextStep === "finalizada" && so.vehicleId) {
          try {
            await storage.updateVehicle(so.vehicleId, { status: "disponível" });
            const veh = await storage.getVehicle(so.vehicleId);
            const photos = await storage.getMissionPhotosByOS(serviceOrderId);
            const allKmValues = [
              so.baseReturnKm ? Number(so.baseReturnKm) : 0,
              ...photos.filter(p => p.kmValue).map(p => Number(p.kmValue)),
            ].filter(v => v > 0);
            const highestKm = Math.max(...allKmValues, 0);
            if (veh && highestKm > 0 && highestKm >= (veh.km || 0)) {
              await storage.updateVehicle(so.vehicleId, { km: highestKm, lastKmUpdate: new Date() });
            }
          } catch {}
        }
        if (nextStep === "encerrada" && so.kitId) {
          try { await storage.updateWeaponKit(so.kitId, { status: "disponível" }); } catch (_e) {}
        }

        return res.json({ message: `Avancou: ${currentStep} -> ${nextStep}`, missionStatus: nextStep, updated });
      }

      res.status(400).json({ message: "Acao invalida. Use: upload_photos, escort_data, start_mission, base_clean, advance" });
    } catch (err: any) {
      console.error("Simulation error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/mission/nova-entrega", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.status(403).json({ message: "Usuário não é funcionário" });

    const { serviceOrderId } = req.body;
    const so = await storage.getServiceOrder(serviceOrderId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    const isAssigned =
      so.assignedEmployeeId === user.employeeId ||
      so.assignedEmployee2Id === user.employeeId;
    if (!isAssigned) return res.status(403).json({ message: "Você não está atribuído a esta OS" });

    if (so.missionStatus !== "chegada_destino") {
      return res.status(400).json({ message: "Ação disponível apenas na etapa de chegada no destino" });
    }

    const updated = await storage.updateServiceOrder(serviceOrderId, {
      missionStatus: "em_transito_destino",
    });
    res.json(updated);
  });

  // ====================== AUDIT LOG ======================

  app.post("/api/audit-log", requireAuth, async (req, res) => {
    const user = req.user!;
    const { action, page, details, latitude, longitude } = req.body;
    if (!action) return res.status(400).json({ message: "action obrigatória" });
    const ipAddress = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || null;
    const userAgent = req.headers["user-agent"] || null;
    await db.insert(auditLogs).values({
      userId: user.id,
      userName: user.name || user.username || "—",
      userRole: user.role || "—",
      action,
      page: page || null,
      details: details || null,
      ipAddress,
      userAgent,
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
    });

    const securityActions = ["screenshot_attempt", "tab_hidden", "window_blur"];
    if (securityActions.includes(action) && latitude && longitude && user.employeeId) {
      try {
        const emp = await storage.getEmployee(user.employeeId);
        if (emp && emp.addressLat && emp.addressLng) {
          const dlat = (Number(latitude) - Number(emp.addressLat)) * 111320;
          const dlng = (Number(longitude) - Number(emp.addressLng)) * 111320 * Math.cos(Number(emp.addressLat) * Math.PI / 180);
          const distMeters = Math.sqrt(dlat * dlat + dlng * dlng);
          if (distMeters <= 500) {
            const actionLabels: Record<string, string> = {
              screenshot_attempt: "Captura de Tela (Print Screen)",
              tab_hidden: "Aba Oculta (troca de app/print)",
              window_blur: "Perda de Foco (possível captura)",
            };
            const timeStr = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
            const html = `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <div style="background:#0f172a;padding:20px 24px;border-radius:8px 8px 0 0">
                  <h2 style="color:#fff;margin:0;font-size:18px">⚠️ ALERTA DE SEGURANÇA — Torres Vigilância</h2>
                </div>
                <div style="background:#fff;border:1px solid #e2e8f0;padding:24px;border-radius:0 0 8px 8px">
                  <p style="color:#dc2626;font-weight:bold;font-size:15px;margin:0 0 16px">
                    Evento de segurança detectado na RESIDÊNCIA do funcionário
                  </p>
                  <table style="width:100%;border-collapse:collapse;font-size:14px">
                    <tr><td style="padding:8px 0;color:#64748b;width:140px">Funcionário:</td><td style="padding:8px 0;font-weight:bold">${emp.fullName || emp.name}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">CPF:</td><td style="padding:8px 0">${emp.cpf || "—"}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Evento:</td><td style="padding:8px 0;color:#dc2626;font-weight:bold">${actionLabels[action] || action}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Página:</td><td style="padding:8px 0">${page || "—"}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Data/Hora:</td><td style="padding:8px 0">${timeStr}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">GPS Evento:</td><td style="padding:8px 0">${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">GPS Residência:</td><td style="padding:8px 0">${Number(emp.addressLat).toFixed(6)}, ${Number(emp.addressLng).toFixed(6)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Distância:</td><td style="padding:8px 0;font-weight:bold">${Math.round(distMeters)} metros</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Endereço:</td><td style="padding:8px 0">${emp.address || "—"}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">IP:</td><td style="padding:8px 0;font-size:12px">${ipAddress || "—"}</td></tr>
                  </table>
                  <div style="margin-top:20px;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px">
                    <p style="margin:0;font-size:13px;color:#991b1b">
                      Este alerta indica que o funcionário realizou uma ação suspeita enquanto estava
                      na proximidade de sua residência cadastrada (raio de 500m).
                    </p>
                  </div>
                </div>
                <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:16px">
                  Torres Vigilância Patrimonial — Sistema de Auditoria Automatizada
                </p>
              </div>
            `;
            const auditTransporter = createSmtpTransporter();
            if (auditTransporter) {
              auditTransporter.sendMail({
                from: getSmtpFrom(),
                to: "thiago@grupotmseg.com.br",
                subject: `⚠️ ALERTA: ${actionLabels[action] || action} na residência — ${emp.fullName || emp.name}`,
                html,
              }).catch((err: any) => console.error("[audit-alert] Erro ao enviar email:", err.message));
            }
          }
        }
      } catch (err: any) {
        console.error("[audit-alert] Erro na verificação de proximidade:", err.message);
      }
    }

    res.json({ ok: true });
  });

  app.get("/api/audit-logs", requireAuth, requireAdmin, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const action = req.query.action ? String(req.query.action) : null;
    const search = req.query.search ? String(req.query.search) : null;
    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : null;
    const dateTo = req.query.dateTo ? String(req.query.dateTo) : null;
    const securityOnly = req.query.securityOnly === "true";

    const conditions: any[] = [];
    if (userId) conditions.push(eq(auditLogs.userId, userId));
    if (action) conditions.push(eq(auditLogs.action, action));
    if (search) conditions.push(or(
      ilike(auditLogs.details, `%${search}%`),
      ilike(auditLogs.userName, `%${search}%`),
      ilike(auditLogs.page, `%${search}%`),
    ));
    if (dateFrom) conditions.push(gte(auditLogs.createdAt, new Date(dateFrom)));
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(lte(auditLogs.createdAt, endDate));
    }
    if (securityOnly) {
      conditions.push(or(
        eq(auditLogs.action, "screenshot_attempt"),
        eq(auditLogs.action, "tab_hidden"),
        eq(auditLogs.action, "window_blur"),
        eq(auditLogs.action, "context_menu"),
      ));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = whereClause
      ? await db.select().from(auditLogs).where(whereClause).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset)
      : await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset);

    const countQuery = whereClause
      ? await db.select({ count: sql<number>`COUNT(*)` }).from(auditLogs).where(whereClause)
      : await db.select({ count: sql<number>`COUNT(*)` }).from(auditLogs);

    const total = Number(countQuery[0]?.count || 0);

    res.json({ logs: rows, total });
  });

  app.get("/api/audit-logs/stats", requireAuth, requireAdmin, async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalResult, todayResult, securityResult, usersResult] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(auditLogs),
      db.select({ count: sql<number>`COUNT(*)` }).from(auditLogs).where(gte(auditLogs.createdAt, today)),
      db.select({ count: sql<number>`COUNT(*)` }).from(auditLogs).where(
        or(
          eq(auditLogs.action, "screenshot_attempt"),
          eq(auditLogs.action, "tab_hidden"),
          eq(auditLogs.action, "window_blur"),
          eq(auditLogs.action, "context_menu"),
        )
      ),
      db.select({
        userId: auditLogs.userId,
        userName: auditLogs.userName,
        count: sql<number>`COUNT(*)`,
      }).from(auditLogs).groupBy(auditLogs.userId, auditLogs.userName).orderBy(desc(sql`COUNT(*)`)).limit(10),
    ]);

    const actionCounts = await db.select({
      action: auditLogs.action,
      count: sql<number>`COUNT(*)`,
    }).from(auditLogs).groupBy(auditLogs.action).orderBy(desc(sql`COUNT(*)`));

    res.json({
      total: Number(totalResult[0]?.count || 0),
      today: Number(todayResult[0]?.count || 0),
      securityAlerts: Number(securityResult[0]?.count || 0),
      topUsers: usersResult,
      actionCounts,
    });
  });

  // ====================== HR MOBILE (próprio funcionário) ======================

  app.get("/api/my/hr-summary", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.status(403).json({ message: "Usuário não é funcionário" });
    const empId = user.employeeId;

    const [absRows, fineRows, tsRows, psRows, discRows] = await Promise.all([
      db.select().from(employeeAbsences).where(eq(employeeAbsences.employeeId, empId)).orderBy(desc(employeeAbsences.startDate)),
      db.select().from(employeeFines).where(eq(employeeFines.employeeId, empId)).orderBy(desc(employeeFines.date)),
      db.select().from(employeeTimesheets).where(eq(employeeTimesheets.employeeId, empId)).orderBy(desc(employeeTimesheets.date)),
      db.select().from(employeePayslips).where(eq(employeePayslips.employeeId, empId)).orderBy(desc(employeePayslips.year), desc(employeePayslips.month)),
      db.select().from(employeeDisciplinary).where(eq(employeeDisciplinary.employeeId, empId)).orderBy(desc(employeeDisciplinary.date)),
    ]);

    res.json({ absences: absRows, fines: fineRows, timesheets: tsRows, payslips: psRows, disciplinary: discRows });
  });

  // ====================== HR: FALTAS/ATESTADOS ======================

  app.get("/api/employees/:id/absences", requireAuth, requireAdmin, async (req, res) => {
    const employeeId = Number(req.params.id);
    const rows = await db.select().from(employeeAbsences).where(eq(employeeAbsences.employeeId, employeeId)).orderBy(desc(employeeAbsences.startDate));
    res.json(rows);
  });

  app.post("/api/employees/:id/absences", requireAuth, requireAdmin, async (req, res) => {
    const employeeId = Number(req.params.id);
    const data = { ...req.body, employeeId };
    const [row] = await db.insert(employeeAbsences).values(data).returning();
    res.status(201).json(row);
  });

  app.delete("/api/absences/:id", requireAuth, requireDiretoria, async (req, res) => {
    await db.delete(employeeAbsences).where(eq(employeeAbsences.id, Number(req.params.id)));
    res.json({ ok: true });
  });

  // ====================== HR: MULTAS ======================

  app.get("/api/employees/:id/fines", requireAuth, requireAdmin, async (req, res) => {
    const employeeId = Number(req.params.id);
    const rows = await db.select().from(employeeFines).where(eq(employeeFines.employeeId, employeeId)).orderBy(desc(employeeFines.date));
    res.json(rows);
  });

  app.post("/api/employees/:id/fines", requireAuth, requireAdmin, async (req, res) => {
    const employeeId = Number(req.params.id);
    const data = { ...req.body, employeeId, vehicleId: req.body.vehicleId ? Number(req.body.vehicleId) : null };
    const [row] = await db.insert(employeeFines).values(data).returning();
    res.status(201).json(row);
  });

  app.delete("/api/fines/:id", requireAuth, requireDiretoria, async (req, res) => {
    await db.delete(employeeFines).where(eq(employeeFines.id, Number(req.params.id)));
    res.json({ ok: true });
  });

  // ====================== HR: DISCIPLINAR ======================

  app.get("/api/employees/:id/disciplinary", requireAuth, requireAdmin, async (req, res) => {
    const employeeId = Number(req.params.id);
    const rows = await db.select().from(employeeDisciplinary).where(eq(employeeDisciplinary.employeeId, employeeId)).orderBy(desc(employeeDisciplinary.date));
    res.json(rows);
  });

  app.post("/api/employees/:id/disciplinary", requireAuth, requireAdmin, async (req, res) => {
    const employeeId = Number(req.params.id);
    const allowedTypes = ["Advertência", "Suspensão"];
    const allowedStatuses = ["ativa", "cumprida", "revogada"];
    const { type, date, reason, description, status } = req.body;

    if (!type || !allowedTypes.includes(type)) {
      return res.status(400).json({ message: "Tipo inválido. Use: Advertência ou Suspensão" });
    }
    if (!date) {
      return res.status(400).json({ message: "Data é obrigatória" });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: "Motivo é obrigatório" });
    }
    const finalStatus = status && allowedStatuses.includes(status) ? status : "ativa";

    const data = { employeeId, type, date: new Date(date), reason: reason.trim(), description: description?.trim() || null, status: finalStatus };
    const [row] = await db.insert(employeeDisciplinary).values(data).returning();
    res.status(201).json(row);
  });

  app.delete("/api/disciplinary/:id", requireAuth, requireDiretoria, async (req, res) => {
    await db.delete(employeeDisciplinary).where(eq(employeeDisciplinary.id, Number(req.params.id)));
    res.json({ ok: true });
  });

  // ====================== HR: FOLHA DE PONTO ======================

  app.get("/api/employees/:id/timesheets", requireAuth, requireAdmin, async (req, res) => {
    const employeeId = Number(req.params.id);
    const rows = await db.select().from(employeeTimesheets).where(eq(employeeTimesheets.employeeId, employeeId)).orderBy(desc(employeeTimesheets.date));
    res.json(rows);
  });

  app.post("/api/employees/:id/timesheets", requireAuth, requireAdmin, async (req, res) => {
    const employeeId = Number(req.params.id);
    const data = { ...req.body, employeeId };
    const [row] = await db.insert(employeeTimesheets).values(data).returning();
    res.status(201).json(row);
  });

  app.get("/api/employees/:id/folha-ponto-excel", requireAuth, requireAdmin, async (req, res) => {
    try {
      const XLSX = await import("xlsx");
      const employeeId = Number(req.params.id);
      const month = Number(req.query.month) || new Date().getMonth() + 1;
      const year = Number(req.query.year) || new Date().getFullYear();

      const employee = await storage.getEmployee(employeeId);
      if (!employee) return res.status(404).json({ message: "Funcionário não encontrado" });

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      const daysInMonth = endDate.getDate();

      const timesheetRows = await db.select().from(employeeTimesheets).where(
        and(
          eq(employeeTimesheets.employeeId, employeeId),
          gte(employeeTimesheets.date, startDate),
          lte(employeeTimesheets.date, endDate)
        )
      ).orderBy(employeeTimesheets.date);

      const absenceRows = await db.select().from(employeeAbsences).where(
        and(
          eq(employeeAbsences.employeeId, employeeId),
          gte(employeeAbsences.startDate, startDate),
          lte(employeeAbsences.startDate, endDate)
        )
      );

      const discRows = await db.select().from(employeeDisciplinary).where(
        and(
          eq(employeeDisciplinary.employeeId, employeeId),
          gte(employeeDisciplinary.date, startDate),
          lte(employeeDisciplinary.date, endDate)
        )
      );

      const tsMap = new Map<string, any>();
      for (const ts of timesheetRows) {
        const d = new Date(ts.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        tsMap.set(key, ts);
      }

      const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      const DAYS_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

      const wb = XLSX.utils.book_new();
      const rows: any[][] = [];

      rows.push(["", "", "", "", "EMPRESA:", "", "GRUPO TORRES PATRIMONIAL", "", "", "", "", "", "", "", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
      rows.push(["", "", "", "", "ENDEREÇO:", "", "", "", "", "", "", "", "", "Ficha Individual - Art 74/3 CLT", ""]);
      rows.push(["", "", "", "", "BAIRRO:", "", "", "", "", "", "", "", "", "Portaria Nº 3082 de 11/04/98", ""]);
      rows.push(["", "", "", "", `CODIGO: ${employee.matricula}`, "", employee.name, "", "", "", "", employee.role?.toUpperCase() || "VIGILANTE DE ESCOLTA ARMADA", "", "", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", `MÊS: ${MONTHS_PT[month - 1].toUpperCase()} / ${year}`, ""]);
      rows.push(["", "", "", "", `CARGO: ${employee.role?.toUpperCase() || "VIGILANTE DE ESCOLTA ARMADA"}`, "", "", "", "", "", "", "", "", "", ""]);
      rows.push(["", "", "", "", `DEPTO/ SETOR/ SEÇÃO: 0001/ 0002 / 0000`, "", "", "", "", "", "", "", "", "", ""]);
      rows.push([]);

      rows.push([
        "DATA", "", "DIA", "TIPO", "ENTRADA", "SAÍDA ALM.", "RETORNO ALM.", "SAÍDA", "PERNOITE", "HORAS DESC.", "TOTAL HORAS", "DIÁRIA", "AD. NOT.", "ASS. FUNCIONÁRIO", "OBSERVAÇÕES"
      ]);

      let totalOvertime = 0;
      let totalDays = 0;
      let folgaCount = 0;

      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month - 1, day);
        const dayStr = DAYS_PT[d.getDay()];
        const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const ts = tsMap.get(dateKey);

        const isSunday = d.getDay() === 0;
        let tipo = "";

        if (ts) {
          totalDays++;
          if (ts.overtime) totalOvertime += Number(ts.overtime);
          tipo = "ESCOLTA";
        } else if (isSunday) {
          tipo = "FOLGA";
          folgaCount++;
        }

        rows.push([
          `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
          "",
          dayStr,
          tipo,
          ts?.clockIn || "",
          ts?.lunchOut || "",
          ts?.lunchIn || "",
          ts?.clockOut || "",
          "",
          "",
          ts?.overtime ? `${ts.overtime}h` : "",
          "",
          "",
          "",
          ts?.notes || ""
        ]);
      }

      rows.push([]);
      rows.push(["TOTAL", "", "", "", "", "", "", "", "", "", `${totalOvertime}h`, "", "", "", ""]);
      rows.push([]);

      const justificadas = absenceRows.filter(a => a.status === "aprovado").length;
      const naoJustificadas = absenceRows.filter(a => a.status !== "aprovado").length;
      const suspensoes = discRows.filter(d => d.type === "Suspensão").length;
      const advertencias = discRows.filter(d => d.type === "Advertência").length;

      rows.push(["FALTAS", "", "", absenceRows.length, "", `JUSTIFICADAS: ${justificadas}`, "", "", `NÃO JUSTIFICADAS: ${naoJustificadas}`, "", "", "", "", "", ""]);
      rows.push([]);
      rows.push(["FOLGAS", "", "", folgaCount, "", "SUSPENSÃO", "", "", suspensoes, "", "ADVERTÊNCIA", "", "", advertencias, ""]);
      rows.push([]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "ASSINATURA COLABORADOR", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "____________________________", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", employee.name, ""]);
      rows.push([]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "VISTO SUPERVISOR OPERACIONAL", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "____________________________", ""]);
      rows.push([]);
      rows.push(["Hora Extra 60%", "", "", "", "", "", "", "", totalOvertime, "", "", "", "", "", ""]);
      rows.push(["Diárias", "", "", "", "", "", "", "", totalDays, "", "", "", "", "", ""]);

      const ws = XLSX.utils.aoa_to_sheet(rows);

      ws["!cols"] = [
        { wch: 14 }, { wch: 2 }, { wch: 5 }, { wch: 10 },
        { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
        { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 8 },
        { wch: 8 }, { wch: 30 }, { wch: 20 }
      ];

      ws["!merges"] = [
        { s: { r: 0, c: 6 }, e: { r: 0, c: 10 } },
        { s: { r: 4, c: 6 }, e: { r: 4, c: 10 } },
      ];

      XLSX.utils.book_append_sheet(wb, ws, `PONTO ${MONTHS_PT[month - 1].toUpperCase()}`);

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const filename = `Folha_Ponto_${employee.name.replace(/\s+/g, "_")}_${MONTHS_PT[month - 1]}_${year}.xlsx`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(Buffer.from(buf));
    } catch (err: any) {
      console.error("[folha-ponto-excel]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ====================== HR: HOLERITES ======================

  app.get("/api/employees/:id/payslips", requireAuth, requireAdmin, async (req, res) => {
    const employeeId = Number(req.params.id);
    const rows = await db.select().from(employeePayslips).where(eq(employeePayslips.employeeId, employeeId)).orderBy(desc(employeePayslips.year), desc(employeePayslips.month));
    res.json(rows);
  });

  app.post("/api/employees/:id/payslips", requireAuth, requireAdmin, async (req, res) => {
    const employeeId = Number(req.params.id);
    const data = { ...req.body, employeeId };
    const [row] = await db.insert(employeePayslips).values(data).returning();
    res.status(201).json(row);
  });

  app.delete("/api/payslips/:id", requireAuth, requireDiretoria, async (req, res) => {
    await db.delete(employeePayslips).where(eq(employeePayslips.id, Number(req.params.id)));
    res.json({ ok: true });
  });

  // ====================== TESTAR TODAS APIs ======================

  app.post("/api/consulta/testar-todas", requireAuth, requireAdmin, async (req, res) => {
    const cpfTeste = "00000000000";
    const cnpjTeste = "00000000000000";
    const placaTeste = "ABC1D23";

    const results: Record<string, any> = {};

    const tests = [
      { name: "Multas PRF", fn: () => apibrasil.consultaMultasPRF(placaTeste, req.user!.id, "teste_api") },
      { name: "Dados Veículo", fn: () => apibrasil.consultaDadosVeiculo(placaTeste, req.user!.id, "teste_api") },
      { name: "CNH", fn: () => apibrasil.consultaCNH(cpfTeste, req.user!.id, "teste_api") },
      { name: "Processos", fn: () => apibrasil.consultaProcessos(cpfTeste, req.user!.id, "teste_api") },
      { name: "SPC/Serasa", fn: () => apibrasil.consultaSPC(cpfTeste, req.user!.id, "teste_api") },
      { name: "Score Quod", fn: () => apibrasil.consultaQuodScore(cpfTeste, req.user!.id, "teste_api") },
      { name: "Protesto Nacional", fn: () => apibrasil.consultaProtestoNacional(cnpjTeste, req.user!.id, "teste_api") },
      { name: "Situação Eleitoral", fn: () => apibrasil.consultaSituacaoEleitoral(cpfTeste, req.user!.id, "teste_api") },
    ];

    const startTime = Date.now();
    const settled = await Promise.allSettled(tests.map(t => t.fn()));
    const elapsed = Date.now() - startTime;

    let successCount = 0;
    let errorCount = 0;

    tests.forEach((t, i) => {
      const s = settled[i];
      if (s.status === "fulfilled") {
        results[t.name] = { status: s.value.status, success: s.value.success, data: s.value.data };
        if (s.value.success) successCount++; else errorCount++;
      } else {
        results[t.name] = { status: 0, success: false, error: s.reason?.message || "Erro desconhecido" };
        errorCount++;
      }
    });

    let datajudResult: any = null;
    try {
      const djRes = await fetch("https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==",
        },
        body: JSON.stringify({ query: { match: { numeroProcesso: "0000000000000000000" } }, size: 1 }),
      });
      datajudResult = { status: djRes.status, success: djRes.ok, message: djRes.ok ? "API pública acessível" : "Erro" };
      if (djRes.ok) successCount++;
    } catch (e: any) {
      datajudResult = { status: 0, success: false, error: e.message };
      errorCount++;
    }
    results["DataJud (CNJ)"] = datajudResult;

    res.json({
      totalApis: tests.length + 1,
      success: successCount,
      errors: errorCount,
      elapsed: `${elapsed}ms`,
      tokenConfigured: !!process.env.APIBRASIL_TOKEN,
      results,
    });
  });

  // ====================== USER MANAGEMENT (admin/diretoria only) ======================

  app.get("/api/users", requireAuth, requireAdminRole, async (req, res) => {
    const allUsers = await storage.getUsers();
    const filtered = req.user!.role === "diretoria"
      ? allUsers
      : allUsers.filter(u => u.role !== "diretoria");
    res.json(filtered.map(toSafeUser));
  });

  app.post("/api/users", requireAuth, requireAdminRole, async (req, res) => {
    const { email, name, role, employeeId } = req.body;
    if (!email || !name) {
      return res.status(400).json({ message: "Campos obrigatórios: email, name" });
    }
    if (role === "diretoria" && req.user!.role !== "diretoria") {
      return res.status(403).json({ message: "Sem permissão para criar usuários Diretoria" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await storage.getUserByEmail(normalizedEmail);
    if (existing) return res.status(409).json({ message: "E-mail já cadastrado" });

    const tempPassword = "Torres@" + randomBytes(4).toString("hex");

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,
    });

    if (authError) {
      return res.status(400).json({ message: "Erro ao criar conta: " + authError.message });
    }

    let user;
    try {
      user = await storage.createUser({
        supabaseUid: authData.user.id,
        email: normalizedEmail,
        name,
        role: role || "funcionario",
        employeeId: employeeId || null,
        mustChangePassword: 1,
      });
    } catch (dbErr: any) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return res.status(500).json({ message: "Erro ao criar usuário local: " + dbErr.message });
    }

    res.status(201).json({ ...toSafeUser(user), tempPassword });
  });

  app.patch("/api/users/:id", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const target = await storage.getUser(id);
    if (!target) return res.status(404).json({ message: "Usuário não encontrado" });
    if (target.role === "diretoria" && req.user!.role !== "diretoria") {
      return res.status(403).json({ message: "Sem permissão para editar usuários Diretoria" });
    }

    const { name, role, employeeId } = req.body;
    const updateData: any = {};
    if (name) updateData.name = name;
    if (role) {
      if (role === "diretoria" && req.user!.role !== "diretoria") {
        return res.status(403).json({ message: "Sem permissão para atribuir role Diretoria" });
      }
      updateData.role = role;
    }
    if (employeeId !== undefined) updateData.employeeId = employeeId || null;

    const updated = await storage.updateUser(id, updateData);
    if (!updated) return res.status(404).json({ message: "Usuário não encontrado" });
    res.json(toSafeUser(updated));
  });

  app.patch("/api/users/:id/reset-password", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const user = await storage.getUser(id);
    if (!user || !user.supabaseUid) return res.status(404).json({ message: "Usuário não encontrado" });
    if (user.role === "diretoria" && req.user!.role !== "diretoria") {
      return res.status(403).json({ message: "Sem permissão para resetar senha de Diretoria" });
    }

    const newPassword = "torres@123";
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.supabaseUid, {
      password: newPassword,
    });

    if (error) return res.status(500).json({ message: "Erro ao resetar senha: " + error.message });
    await storage.updateUser(id, { mustChangePassword: 1 } as any);
    res.json({ ...toSafeUser(user), newPassword, mustChangePassword: true });
  });

  app.get("/api/users/by-employee/:employeeId", requireAuth, requireAdminRole, async (req, res) => {
    const employeeId = Number(req.params.employeeId);
    const allUsers = await storage.getUsers();
    const user = allUsers.find(u => u.employeeId === employeeId);
    if (!user) return res.status(404).json({ message: "Sem acesso" });
    res.json(toSafeUser(user));
  });

  app.delete("/api/users/:id", requireAuth, requireDiretoria, async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user!.id) {
      return res.status(400).json({ message: "Você não pode excluir seu próprio usuário" });
    }

    const user = await storage.getUser(id);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado" });
    if (user.role === "diretoria" && req.user!.role !== "diretoria") {
      return res.status(403).json({ message: "Sem permissão para excluir usuários Diretoria" });
    }

    if (user.supabaseUid) {
      await supabaseAdmin.auth.admin.deleteUser(user.supabaseUid).catch(() => {});
    }
    await storage.deleteUser(id);
    res.json({ message: "Usuário excluído" });
  });

  app.post("/api/auth/register", requireAuth, requireAdminRole, async (req, res) => {
    const { email, username, name, role, employeeId, password: reqPassword } = req.body;
    const emailToUse = email || username;
    if (!emailToUse || !name) {
      return res.status(400).json({ message: "Campos obrigatórios: email, name" });
    }
    if (role === "diretoria" && req.user!.role !== "diretoria") {
      return res.status(403).json({ message: "Sem permissão para criar usuários Diretoria" });
    }

    const normalizedEmail = emailToUse.toLowerCase().trim();
    const existing = await storage.getUserByEmail(normalizedEmail);
    if (existing) return res.status(409).json({ message: "Usuário já existe" });

    const tempPassword = reqPassword || "torres@123";

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,
    });

    if (authError) {
      return res.status(400).json({ message: "Erro ao criar conta: " + authError.message });
    }

    let user;
    try {
      user = await storage.createUser({
        supabaseUid: authData.user.id,
        email: normalizedEmail,
        name,
        role: role || "funcionario",
        employeeId: employeeId || null,
        mustChangePassword: 1,
      });
    } catch (dbErr: any) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return res.status(500).json({ message: "Erro ao criar usuário local: " + dbErr.message });
    }

    res.status(201).json({ ...toSafeUser(user), tempPassword });
  });

  app.post("/api/auth/register-by-cpf", requireAuth, requireAdminRole, async (req, res) => {
    const { cpf, name, employeeId } = req.body;
    if (!cpf || !name) {
      return res.status(400).json({ message: "Campos obrigatórios: cpf, name" });
    }
    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      return res.status(400).json({ message: "CPF inválido" });
    }

    const syntheticEmail = `cpf_${cleanCpf}@torresseguranca.local`;
    const existing = await storage.getUserByEmail(syntheticEmail);
    if (existing) return res.status(409).json({ message: "Já existe um acesso para este CPF" });

    const defaultPassword = "torres@123";

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail,
      password: defaultPassword,
      email_confirm: true,
    });

    if (authError) {
      return res.status(400).json({ message: "Erro ao criar conta: " + authError.message });
    }

    let user;
    try {
      user = await storage.createUser({
        supabaseUid: authData.user.id,
        email: syntheticEmail,
        name,
        role: "funcionario",
        employeeId: employeeId || null,
        mustChangePassword: 1,
      });
    } catch (dbErr: any) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return res.status(500).json({ message: "Erro ao criar usuário local: " + dbErr.message });
    }

    res.status(201).json({ ...toSafeUser(user) });
  });

  // ===== EMPLOYEE DOCUMENTS =====
  app.get("/api/employee-documents/:employeeId", requireAuth, async (req, res) => {
    const docs = await storage.getEmployeeDocuments(parseInt(req.params.employeeId));
    res.json(docs);
  });

  const syncDocToEmployee = async (docType: string, employeeId: number, documentNumber?: string | null, expiryDate?: string | null) => {
    if (docType !== "CNH" && docType !== "CNV") return;
    try {
      const emp = await storage.getEmployee(employeeId);
      if (!emp) return;
      const syncFields: any = {};
      if (docType === "CNH") {
        if (documentNumber && !emp.cnhNumber) syncFields.cnhNumber = documentNumber;
        if (expiryDate && !emp.cnhExpiry) syncFields.cnhExpiry = expiryDate;
      } else if (docType === "CNV") {
        if (documentNumber && !emp.cnvNumber) syncFields.cnvNumber = documentNumber;
        if (expiryDate && !emp.cnvExpiry) syncFields.cnvExpiry = expiryDate;
      }
      if (Object.keys(syncFields).length > 0) {
        await storage.updateEmployee(employeeId, syncFields);
      }
    } catch {}
  };

  app.post("/api/employee-documents", requireAdminRole, async (req, res) => {
    const parsed = insertEmployeeDocumentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const emp = await storage.getEmployee(parsed.data.employeeId);
    if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });
    const doc = await storage.createEmployeeDocument(parsed.data);
    await syncDocToEmployee(parsed.data.type, parsed.data.employeeId, parsed.data.documentNumber, parsed.data.expiryDate);
    res.status(201).json(doc);
  });

  app.patch("/api/employee-documents/:id", requireAdminRole, async (req, res) => {
    const parsed = insertEmployeeDocumentSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const doc = await storage.updateEmployeeDocument(parseInt(req.params.id), parsed.data);
    if (!doc) return res.status(404).json({ message: "Documento não encontrado" });
    if (doc.type && doc.employeeId) {
      await syncDocToEmployee(doc.type, doc.employeeId, doc.documentNumber, doc.expiryDate);
    }
    res.json(doc);
  });

  app.delete("/api/employee-documents/:id", requireAuth, requireDiretoria, async (req, res) => {
    await storage.deleteEmployeeDocument(parseInt(req.params.id));
    res.json({ ok: true });
  });

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

  app.post("/api/agent/location", requireAuth, async (req, res) => {
    const user = req.user!;
    const { latitude, longitude, accuracy, speed, heading } = req.body;
    if (latitude == null || longitude == null) {
      return res.status(400).json({ message: "Latitude e longitude são obrigatórios" });
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
    try {
      await db.insert(agentLocationHistory).values(locData);
    } catch (histErr: any) {
      console.error("[agent-location] Failed to log history:", histErr.message);
    }
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
      const history = await db.select().from(agentLocationHistory)
        .where(and(
          eq(agentLocationHistory.userId, userId),
          gte(agentLocationHistory.createdAt, startOfDay),
          lte(agentLocationHistory.createdAt, endOfDay),
        ))
        .orderBy(asc(agentLocationHistory.createdAt));
      res.json(history);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== FINANCIAL MODULE ====================

  // Financial Categories
  app.get("/api/financial/categories", requireAuth, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("financial_categories").select("*").order("name");
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/financial/categories", requireAdminRole, async (req, res) => {
    try {
      const { name, type, group, recurrence_type, tag, scope, is_deduction } = req.body;
      if (!name || !type || !group) return res.status(400).json({ message: "name, type e group são obrigatórios" });
      const { data, error } = await supabaseAdmin.from("financial_categories").insert({ name, type, group, recurrence_type: recurrence_type || "VARIAVEL", tag: tag || "OPERACIONAL", scope: scope || "EMPRESA", is_deduction: is_deduction || false }).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/financial/categories/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("financial_categories").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Financial Accounts
  app.get("/api/financial/accounts", requireAuth, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("financial_accounts").select("*").order("name");
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/financial/accounts", requireAdminRole, async (req, res) => {
    try {
      const { name, initial_balance, bank_name, account_number, status } = req.body;
      if (!name) return res.status(400).json({ message: "name é obrigatório" });
      const { data, error } = await supabaseAdmin.from("financial_accounts").insert({ name, initial_balance: initial_balance || 0, bank_name, account_number, status: status || "Ativo" }).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/financial/accounts/:id", requireAdminRole, async (req, res) => {
    try {
      const { name, initial_balance, bank_name, account_number, status } = req.body;
      const { data, error } = await supabaseAdmin.from("financial_accounts").update({ name, initial_balance, bank_name, account_number, status }).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/financial/accounts/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("financial_accounts").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Financial Transactions
  app.get("/api/financial/transactions", requireAuth, async (req, res) => {
    try {
      const { type, status, from, to, search } = req.query;
      let query = supabaseAdmin.from("financial_transactions").select("*").order("due_date", { ascending: false });
      if (type) query = query.eq("type", type as string);
      if (status) query = query.eq("status", status as string);
      if (from) query = query.gte("due_date", from as string);
      if (to) query = query.lte("due_date", to as string);
      if (search) query = query.or(`description.ilike.%${search}%,entity_name.ilike.%${search}%,category_name.ilike.%${search}%`);
      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/financial/transactions", requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const { description, amount, type, status, due_date, payment_date, category_id, category_name, account_id, account_name, entity_type, entity_name, notes, installments } = req.body;
      if (!description || !amount || !type || !due_date) return res.status(400).json({ message: "description, amount, type e due_date são obrigatórios" });

      if (installments && installments > 1) {
        const installmentGroup = crypto.randomUUID();
        const baseDate = new Date(due_date);
        const payloads = [];
        for (let i = 0; i < installments; i++) {
          const d = new Date(baseDate);
          d.setMonth(d.getMonth() + i);
          payloads.push({
            description: `${description} (${i + 1}/${installments})`,
            amount: Math.round((amount / installments) * 100) / 100,
            type, status: status || "PENDING",
            due_date: d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
            payment_date: status === "PAID" ? d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : null,
            category_id, category_name, account_id, account_name,
            entity_type, entity_name, notes,
            installment_group: installmentGroup,
            installment_number: i + 1,
            installment_total: installments,
            created_by: user.name,
          });
        }
        const { data, error } = await supabaseAdmin.from("financial_transactions").insert(payloads).select();
        if (error) throw error;
        res.json(data);
      } else {
        const { data, error } = await supabaseAdmin.from("financial_transactions").insert({
          description, amount, type, status: status || "PENDING",
          due_date, payment_date, category_id, category_name,
          account_id, account_name, entity_type, entity_name, notes,
          created_by: user.name,
        }).select().single();
        if (error) throw error;
        res.json(data);
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/financial/transactions/:id", requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const { data: existing, error: chkErr } = await supabaseAdmin.from("financial_transactions").select("*").eq("id", req.params.id).single();
      if (chkErr || !existing) return res.status(404).json({ message: "Lançamento não encontrado" });
      if (existing.origin_type && existing.origin_type !== "manual") {
        return res.status(403).json({ message: "Lançamentos automáticos não podem ser editados manualmente" });
      }
      const { description, amount, type, status, due_date, payment_date, category_id, category_name, account_id, account_name, entity_type, entity_name, notes, status_conciliacao, update_scope } = req.body;

      const updatePayload: any = {
        description, amount, type, status, due_date, payment_date,
        category_id, category_name, account_id, account_name,
        entity_type, entity_name, notes, status_conciliacao,
        updated_by: user.name,
      };

      if (update_scope === "future" && existing.installment_group && existing.installment_number) {
        const { data: siblings, error: sibErr } = await supabaseAdmin
          .from("financial_transactions")
          .select("id, installment_number, due_date")
          .eq("installment_group", existing.installment_group)
          .gte("installment_number", existing.installment_number)
          .order("installment_number", { ascending: true });

        if (sibErr) throw sibErr;

        const baseDueDate = new Date(due_date);
        const originalDueDate = new Date(existing.due_date);
        const monthDiff = (baseDueDate.getFullYear() - originalDueDate.getFullYear()) * 12 + (baseDueDate.getMonth() - originalDueDate.getMonth());

        const updates = (siblings || []).map((sib: any) => {
          const offset = sib.installment_number - existing.installment_number;
          const newDue = new Date(baseDueDate);
          newDue.setMonth(newDue.getMonth() + offset);
          const sibDueStr = newDue.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

          const baseDesc = description.replace(/\s*\(\d+\/\d+\)\s*$/, "");
          return supabaseAdmin.from("financial_transactions").update({
            description: `${baseDesc} (${sib.installment_number}/${existing.installment_total})`,
            amount, type,
            category_id, category_name,
            account_id, account_name,
            entity_name, notes,
            due_date: sibDueStr,
            payment_date: (sib.installment_number === existing.installment_number && status === "PAID") ? sibDueStr : null,
            status: sib.installment_number === existing.installment_number ? status : "PENDING",
            updated_by: user.name,
          }).eq("id", sib.id);
        });

        await Promise.all(updates);

        const { data: updated, error: refetchErr } = await supabaseAdmin
          .from("financial_transactions").select("*").eq("id", req.params.id).single();
        if (refetchErr) throw refetchErr;
        res.json({ ...updated, updated_count: siblings?.length || 1 });
      } else {
        const { data, error } = await supabaseAdmin.from("financial_transactions").update(updatePayload).eq("id", req.params.id).select().single();
        if (error) throw error;
        res.json(data);
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/financial/transactions/:id/toggle-status", requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const { data: existing, error: fetchErr } = await supabaseAdmin.from("financial_transactions").select("*").eq("id", req.params.id).single();
      if (fetchErr || !existing) return res.status(404).json({ message: "Lançamento não encontrado" });
      const newStatus = existing.status === "PAID" ? "PENDING" : "PAID";
      const { data, error } = await supabaseAdmin.from("financial_transactions").update({
        status: newStatus,
        payment_date: newStatus === "PAID" ? existing.due_date : null,
        updated_by: user.name,
      }).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/financial/transactions/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { data: existing, error: chkErr } = await supabaseAdmin.from("financial_transactions").select("origin_type").eq("id", req.params.id).single();
      if (chkErr || !existing) return res.status(404).json({ message: "Lançamento não encontrado" });
      if (existing.origin_type && existing.origin_type !== "manual") {
        return res.status(403).json({ message: "Lançamentos automáticos não podem ser excluídos manualmente. Exclua o registro de origem." });
      }
      const { error } = await supabaseAdmin.from("financial_transactions").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/financial/summary", requireAuth, async (req, res) => {
    try {
      const { data: all, error } = await supabaseAdmin.from("financial_transactions").select("*");
      if (error) throw error;
      const txs = all || [];
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const expenses = txs.filter((t: any) => t.type === "EXPENSE");
      const incomes = txs.filter((t: any) => t.type === "INCOME");
      res.json({
        totalExpenses: expenses.reduce((a: number, t: any) => a + Number(t.amount), 0),
        paidExpenses: expenses.filter((t: any) => t.status === "PAID").reduce((a: number, t: any) => a + Number(t.amount), 0),
        pendingExpenses: expenses.filter((t: any) => t.status === "PENDING").reduce((a: number, t: any) => a + Number(t.amount), 0),
        overdueExpenses: expenses.filter((t: any) => t.status === "PENDING" && t.due_date < today).length,
        totalIncomes: incomes.reduce((a: number, t: any) => a + Number(t.amount), 0),
        paidIncomes: incomes.filter((t: any) => t.status === "PAID").reduce((a: number, t: any) => a + Number(t.amount), 0),
        pendingIncomes: incomes.filter((t: any) => t.status === "PENDING").reduce((a: number, t: any) => a + Number(t.amount), 0),
        overdueIncomes: incomes.filter((t: any) => t.status === "PENDING" && t.due_date < today).length,
        totalTransactions: txs.length,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/financial/dre-operacao/:osId", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      if (!osId) return res.status(400).json({ message: "ID inválido" });
      const so = await storage.getServiceOrder(osId);
      if (!so) return res.status(404).json({ message: "OS não encontrada" });

      const client = so.clientId ? await storage.getClient(so.clientId) : null;
      const vehicle = so.vehicleId ? await storage.getVehicle(so.vehicleId) : null;
      const employee1 = so.assignedEmployeeId ? await storage.getEmployee(so.assignedEmployeeId) : null;
      const employee2 = (so as any).assignedEmployee2Id ? await storage.getEmployee((so as any).assignedEmployee2Id) : null;

      let { data: billing } = await supabaseAdmin.from("escort_billings")
        .select("*")
        .eq("service_order_id", osId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!billing?.length) {
        const { data: b2 } = await supabaseAdmin.from("escort_billings")
          .select("*")
          .eq("service_order_id", String(osId))
          .order("created_at", { ascending: false })
          .limit(1);
        if (b2?.length) billing = b2;
      }
      let billingRow = billing?.[0] || null;

      if (!billingRow && so.type === "escolta" && (so.status === "em_andamento" || so.status === "concluida" || so.status === "concluída")) {
        try {
          let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
          if (so.escortContractId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", so.escortContractId).limit(1);
            if (cc?.length) contrato = cc[0];
          } else if (so.clientId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.clientId).eq("status", "Ativo").limit(1);
            if (cc?.length) contrato = cc[0];
          }
          const missionPhotos = await storage.getMissionPhotosByOS(osId);
          const kmSaidaP = missionPhotos.find((p: any) => p.step === "km_saida");
          const kmChegadaP = [...missionPhotos].reverse().find((p: any) => p.step === "km_chegada");
          const kmFinalP = missionPhotos.find((p: any) => p.step === "km_final");
          const kmInicial = Number(kmChegadaP?.kmValue || kmSaidaP?.kmValue || 0);
          const kmFinal = Number(kmFinalP?.kmValue || 0);
          const startedAt = so.missionStartedAt || so.scheduledDate;
          const now = new Date();
          const horasMissao = startedAt ? Math.max(0, (now.getTime() - new Date(startedAt).getTime()) / 3600000) : 0;
          const nb = (v: any) => Number(v) || 0;
          const franquiaKm = nb(contrato.franquia_km || contrato.franquia_minima_km);
          const km_carregado = Math.max(0, kmFinal - kmInicial);
          const km_excedente = Math.max(0, km_carregado - franquiaKm);
          const hasAcion = nb(contrato.valor_acionamento) > 0;
          const franquiaHoras = nb(contrato.franquia_horas);
          const horasExc = franquiaHoras > 0 ? Math.max(0, horasMissao - franquiaHoras) : 0;
          let fat_total = 0;
          let fat_acionamento = 0;
          let fat_km = 0;
          let fat_hora_extra = 0;
          if (hasAcion) {
            fat_acionamento = nb(contrato.valor_acionamento);
            fat_km = km_excedente * nb(contrato.valor_km_extra || contrato.valor_km_carregado);
            fat_hora_extra = horasExc * nb(contrato.valor_hora_extra);
            fat_total = fat_acionamento + fat_km + fat_hora_extra;
          } else {
            const resultado = calcularEscolta({
              km_inicial: kmInicial, km_final: kmFinal, km_vazio: 0,
              horas_missao: horasMissao, horas_estadia: 0,
              teve_pernoite: false, horario_inicio: startedAt ? new Date(startedAt).toTimeString().slice(0,5) : "08:00",
              horario_fim: now.toTimeString().slice(0,5), horario_agendado: null,
              despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0, contrato,
            });
            fat_total = resultado.fat_total;
          }
          const r = (v: number) => Math.round(v * 100) / 100;
          billingRow = {
            id: "calc-realtime",
            service_order_id: osId,
            client_id: so.clientId,
            client_name: client?.name || "—",
            contract_id: contrato.id || null,
            km_inicial: kmInicial, km_final: kmFinal,
            km_carregado: r(km_carregado), km_excedente: r(km_excedente),
            horas_trabalhadas: r(horasMissao), horas_missao: r(horasMissao),
            fat_acionamento: r(fat_acionamento), fat_km: r(fat_km),
            fat_hora_extra: r(fat_hora_extra), fat_total: r(fat_total),
            pag_vrp: r(nb(contrato.vrp_base)), pag_periculosidade: 0,
            pag_adicional_noturno: 0, pag_reembolsos: 0,
            pag_total: r(nb(contrato.vrp_base)),
            despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0,
            placa_viatura: vehicle?.plate || null,
            vigilante1_id: so.assignedEmployeeId,
            vigilante2_id: (so as any).assignedEmployee2Id,
          } as any;
          console.log(`[DRE-OS ${osId}] billing calculated in realtime: fat_total=${fat_total}`);
        } catch (calcErr: any) {
          console.error(`[DRE-OS ${osId}] realtime billing calc error:`, calcErr.message);
        }
      }

      const { data: txDirect } = await supabaseAdmin.from("financial_transactions")
        .select("*")
        .eq("origin_id", String(osId))
        .eq("origin_type", "service_order");

      const osMissionCosts = await storage.getMissionCostsByOS(osId);

      const osStartDate = so.scheduledDate || so.createdAt;
      const osEndDate = (so.status === "concluida" || so.status === "concluída") ? ((so as any).completedDate || osStartDate) : new Date().toISOString();
      const dateFrom = osStartDate ? new Date(osStartDate).toISOString().split("T")[0] : null;
      const dateTo = osEndDate ? new Date(osEndDate).toISOString().split("T")[0] : dateFrom;

      let fuelingTx: any[] = [];
      let fuelProrateDivisor = 1;
      if (so.vehicleId && dateFrom) {
        const vPlate = vehicle?.plate?.toUpperCase() || "";
        if (vPlate) {
          const { data: fuelByOrigin } = await supabaseAdmin.from("financial_transactions")
            .select("*")
            .eq("origin_type", "fueling")
            .gte("due_date", dateFrom)
            .lte("due_date", dateTo || dateFrom);
          const filteredByOrigin = (fuelByOrigin || []).filter((r: any) => (r.description || "").toUpperCase().includes(vPlate));

          if (filteredByOrigin.length > 0) {
            fuelingTx = filteredByOrigin;
          } else {
            const { data: fuelByDesc } = await supabaseAdmin.from("financial_transactions")
              .select("*")
              .eq("type", "EXPENSE")
              .gte("due_date", dateFrom)
              .lte("due_date", dateTo || dateFrom);
            fuelingTx = (fuelByDesc || []).filter((r: any) => {
              const desc = (r.description || "").toUpperCase();
              return desc.includes("ABASTECIMENTO") && desc.includes(vPlate);
            });
          }

          const sameDayVehicleOrders = orders.filter((ox: any) => {
            if (ox.vehicleId !== so.vehicleId) return false;
            if (ox.status === "cancelada") return false;
            const oxDate = ox.scheduledDate ? new Date(ox.scheduledDate).toISOString().split("T")[0] : null;
            return oxDate === dateFrom;
          });
          if (sameDayVehicleOrders.length > 1) {
            fuelProrateDivisor = sameDayVehicleOrders.length;
          }
        }
      }

      let missionCostPedagio = 0;
      let missionCostOutros = 0;
      const missionCostExpenses: any[] = [];
      for (const mc of osMissionCosts) {
        const amt = Number((mc as any).amount || 0);
        const cat = ((mc as any).category || "").toLowerCase();
        if (cat.includes("pedágio") || cat.includes("pedagio")) {
          missionCostPedagio += amt;
        } else {
          missionCostOutros += amt;
        }
        missionCostExpenses.push({
          id: `mc-${mc.id}`,
          description: (mc as any).description || (mc as any).category || "Custo de missão",
          amount: amt,
          type: "EXPENSE",
          category_name: (mc as any).category,
          origin_type: "mission_cost",
        });
      }

      const diarias: { agentName: string; valor: number }[] = [];
      let totalPagFromBilling = 0;
      if (billingRow) {
        const pagTotal = Number(billingRow.pag_total || 0);
        const vrp = Number(billingRow.pag_vrp || 0);
        const pericul = Number(billingRow.pag_periculosidade || 0);
        const adicNoturno = Number(billingRow.pag_adicional_noturno || 0);
        const reembolsos = Number(billingRow.pag_reembolsos || 0);
        totalPagFromBilling = pagTotal > 0 ? pagTotal : (vrp + pericul + adicNoturno + reembolsos);
      }

      if (totalPagFromBilling === 0 && so.type === "escolta" && so.status === "em_andamento") {
        try {
          const photos = await storage.getMissionPhotosByOS(osId);
          const kmSaidaPhoto = photos.find((p: any) => p.step === "km_saida");
          const kmChegadaPhoto = photos.find((p: any) => p.step === "km_chegada");
          const kmFinalPhoto = photos.find((p: any) => p.step === "km_final");
          const kmInicial = kmChegadaPhoto?.kmValue || kmSaidaPhoto?.kmValue || 0;
          const kmAtual = kmFinalPhoto?.kmValue || kmChegadaPhoto?.kmValue || kmInicial;
          const startTime = so.missionStartedAt ? new Date(so.missionStartedAt as string).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : undefined;
          const nowTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
          const scheduledTime = so.scheduledDate ? new Date(so.scheduledDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : undefined;

          let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
          if (so.escortContractId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", so.escortContractId).limit(1);
            if (cc?.length) contrato = cc[0];
          } else if (so.clientId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.clientId).eq("status", "Ativo").limit(1);
            if (cc?.length) contrato = cc[0];
          }

          const kmFinalNorm = kmAtual > kmInicial ? kmAtual : kmInicial;
          const resultadoCalc = calcularEscolta({
            km_inicial: kmInicial, km_final: kmFinalNorm, km_vazio: 0,
            horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
            horario_inicio: startTime, horario_fim: nowTime, horario_agendado: scheduledTime,
            despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0, contrato,
          });
          totalPagFromBilling = resultadoCalc.pagamento.total;
        } catch (_calcErr) {
          console.error("[DRE-OS] calcularEscolta fallback error:", (_calcErr as any)?.message);
        }
      }

      if (totalPagFromBilling > 0) {
        const agentCount = [employee1, employee2].filter(Boolean).length || 1;
        const names = [employee1?.name, employee2?.name].filter(Boolean);
        for (let i = 0; i < agentCount; i++) {
          diarias.push({ agentName: names[i] || `Agente ${i + 1}`, valor: totalPagFromBilling / agentCount });
        }
      }
      const totalDiarias = diarias.reduce((s, d) => s + d.valor, 0);

      const directExpenses = (txDirect || []).filter((t: any) => t.type === "EXPENSE");
      const proratedFuelingTx = fuelingTx.map((t: any) => ({
        ...t,
        amount: Math.round((Number(t.amount || 0) / fuelProrateDivisor) * 100) / 100,
        originalAmount: Number(t.amount || 0),
        prorated: fuelProrateDivisor > 1,
      }));
      const allExpenses = [
        ...directExpenses,
        ...missionCostExpenses,
        ...proratedFuelingTx,
      ];
      const uniqueExpenses = Array.from(new Map(allExpenses.map((t: any) => [t.id, t])).values());

      const totalFueling = proratedFuelingTx.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      const totalOtherExpenses = directExpenses.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);

      const billingPedagio = Number(billingRow?.despesas_pedagio || 0);
      const billingCombustivel = Number(billingRow?.despesas_combustivel || 0);
      const billingOutras = Number(billingRow?.despesas_outras || 0);
      const billingDespesasTotal = billingPedagio + billingCombustivel + billingOutras;

      console.log(`[DRE-OS ${osId}] missionCosts=${osMissionCosts.length} pedagio=${missionCostPedagio} outros=${missionCostOutros} fueling=${fuelingTx.length}/${totalFueling} direct=${directExpenses.length} diarias=${totalDiarias}`);

      const revenue = (txDirect || []).filter((t: any) => t.type === "INCOME");
      const totalRevenue = revenue.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      const billingFatTotal = Number(billingRow?.fat_total || 0);
      const estimadoFallback = totalRevenue === 0 && (so as any).valorEstimado ? Number((so as any).valorEstimado) : 0;
      const effectiveRevenue = totalRevenue > 0 ? totalRevenue : (billingFatTotal > 0 ? billingFatTotal : estimadoFallback);
      const txExpenseTotal = uniqueExpenses.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      const totalExpense = txExpenseTotal + totalDiarias + billingDespesasTotal;
      const netResult = effectiveRevenue - totalExpense;
      const margemPct = effectiveRevenue > 0 ? ((netResult / effectiveRevenue) * 100) : 0;

      let enrichedBilling = billingRow;
      if (billingRow && !billingRow.fat_acionamento && Number(billingRow.fat_total || 0) > 0) {
        try {
          let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
          if (billingRow.contract_id) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", billingRow.contract_id).limit(1);
            if (cc?.length) contrato = cc[0];
          } else if (so.clientId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.clientId).eq("status", "Ativo").limit(1);
            if (cc?.length) contrato = cc[0];
          }

          const nb = (v: any) => Number(v) || 0;
          const hasAcionamento = contrato.valor_acionamento != null && nb(contrato.valor_acionamento) > 0;
          if (hasAcionamento) {
            const valorAcionamento = nb(contrato.valor_acionamento);
            const valorKmExtra = nb(contrato.valor_km_extra || contrato.valor_km_carregado);
            const valorHoraExtra = nb(contrato.valor_hora_extra);
            const franquiaKm = nb(contrato.franquia_km || contrato.franquia_minima_km);
            const franquiaHoras = nb(contrato.franquia_horas);
            const kmExc = nb(billingRow.km_excedente);
            const horasMissao = nb(billingRow.horas_trabalhadas || billingRow.horas_missao);
            const horasExcedentes = franquiaHoras > 0 ? Math.max(0, horasMissao - franquiaHoras) : 0;
            enrichedBilling = {
              ...billingRow,
              fat_acionamento: Math.round(valorAcionamento * 100) / 100,
              fat_hora_extra: Math.round(horasExcedentes * valorHoraExtra * 100) / 100,
              fat_km: Math.round(kmExc * valorKmExtra * 100) / 100,
              franquia_horas: franquiaHoras,
              franquia_km: franquiaKm,
            };
          }
        } catch (_e) { /* keep original billing */ }
      }

      res.json({
        os: {
          id: so.id,
          osNumber: so.osNumber,
          type: so.type,
          status: so.status,
          scheduledDate: so.scheduledDate,
          completedDate: (so as any).completedDate,
          clientName: client?.name || "—",
          vehiclePlate: vehicle?.plate || "—",
          employee1Name: employee1?.name || null,
          employee2Name: employee2?.name || null,
          valorEstimado: (so as any).valorEstimado || null,
        },
        billing: enrichedBilling,
        revenue,
        expenses: uniqueExpenses,
        diarias,
        components: {
          receita: effectiveRevenue,
          combustivel: totalFueling + billingCombustivel,
          pedagio: missionCostPedagio + billingPedagio,
          diarias: totalDiarias,
          custosMissao: missionCostPedagio + missionCostOutros,
          despesasBilling: billingDespesasTotal,
          outrosCustos: totalOtherExpenses + missionCostOutros + billingOutras,
          revenueSource: totalRevenue > 0 ? "transaction" : (billingFatTotal > 0 ? "billing" : (estimadoFallback > 0 ? "estimado" : "none")),
        },
        totals: {
          totalRevenue: effectiveRevenue,
          totalExpense,
          netResult,
          margemPct: Math.round(margemPct * 100) / 100,
          usedEstimado: estimadoFallback > 0,
          usedBilling: totalRevenue === 0 && billingFatTotal > 0,
        },
      });
    } catch (err: any) {
      console.error("[DRE-OS] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/financial/resumo", requireAuth, async (req, res) => {
    try {
      const { from, to } = req.query;

      let viewData: any[] | null = null;
      try {
        let vQuery = supabaseAdmin.from("v_resumo_financeiro").select("*");
        if (from) vQuery = vQuery.gte("periodo", (from as string).substring(0, 7));
        if (to) vQuery = vQuery.lte("periodo", (to as string).substring(0, 7));
        const { data: vd, error: vErr } = await vQuery;
        if (!vErr && vd) viewData = vd;
      } catch (_) {}

      if (viewData) {
        const result: any = {
          receita_total: 0, receita_realizada: 0, receita_pendente: 0,
          despesa_total: 0, despesa_realizada: 0, despesa_pendente: 0,
          saldo_previsto: 0, saldo_realizado: 0,
          total_lancamentos: 0, lancamentos_auto: 0, lancamentos_manual: 0,
          por_origem: {} as Record<string, { count: number; total: number }>,
          por_periodo: [] as any[],
          fonte: "v_resumo_financeiro",
        };
        const periodMap: Record<string, any> = {};
        for (const row of viewData) {
          const receitas = Number(row.total_receitas || 0);
          const despesas = Number(row.total_despesas || 0);
          const receitasPagas = Number(row.receitas_pagas || 0);
          const despesasPagas = Number(row.despesas_pagas || 0);
          const cnt = Number(row.total_lancamentos || 0);

          result.receita_total += receitas;
          result.despesa_total += despesas;
          result.receita_realizada += receitasPagas;
          result.despesa_realizada += despesasPagas;
          result.receita_pendente += receitas - receitasPagas;
          result.despesa_pendente += despesas - despesasPagas;
          result.total_lancamentos += cnt;

          if (row.origin_type !== "manual") {
            if (!result.por_origem[row.origin_type]) result.por_origem[row.origin_type] = { count: 0, total: 0 };
            result.por_origem[row.origin_type].count += cnt;
            result.por_origem[row.origin_type].total += receitas + despesas;
            result.lancamentos_auto += cnt;
          } else {
            result.lancamentos_manual += cnt;
          }

          if (!periodMap[row.periodo]) {
            periodMap[row.periodo] = { periodo: row.periodo, total_receitas: 0, total_despesas: 0, saldo: 0, receitas_pagas: 0, despesas_pagas: 0, saldo_realizado: 0 };
          }
          periodMap[row.periodo].total_receitas += receitas;
          periodMap[row.periodo].total_despesas += despesas;
          periodMap[row.periodo].receitas_pagas += receitasPagas;
          periodMap[row.periodo].despesas_pagas += despesasPagas;
        }
        for (const p of Object.values(periodMap)) {
          p.saldo = p.total_receitas - p.total_despesas;
          p.saldo_realizado = p.receitas_pagas - p.despesas_pagas;
        }
        result.por_periodo = Object.values(periodMap).sort((a: any, b: any) => b.periodo.localeCompare(a.periodo));
        result.saldo_previsto = result.receita_total - result.despesa_total;
        result.saldo_realizado = result.receita_realizada - result.despesa_realizada;
        return res.json(result);
      }

      let query = supabaseAdmin.from("financial_transactions").select("*");
      if (from) query = query.gte("due_date", from as string);
      if (to) query = query.lte("due_date", to as string);
      const { data: all, error } = await query;
      if (error) throw error;
      const txs = all || [];
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

      const incomes = txs.filter((t: any) => t.type === "INCOME");
      const expenses = txs.filter((t: any) => t.type === "EXPENSE");
      const paidIncomes = incomes.filter((t: any) => t.status === "PAID");
      const paidExpenses = expenses.filter((t: any) => t.status === "PAID");

      const autoTxs = txs.filter((t: any) => t.origin_type && t.origin_type !== "manual");
      const manualTxs = txs.filter((t: any) => !t.origin_type || t.origin_type === "manual");

      const byOrigin: Record<string, { count: number; total: number }> = {};
      for (const t of autoTxs) {
        const key = t.origin_type || "unknown";
        if (!byOrigin[key]) byOrigin[key] = { count: 0, total: 0 };
        byOrigin[key].count++;
        byOrigin[key].total += Number(t.amount);
      }

      res.json({
        receita_total: incomes.reduce((a: number, t: any) => a + Number(t.amount), 0),
        receita_realizada: paidIncomes.reduce((a: number, t: any) => a + Number(t.amount), 0),
        receita_pendente: incomes.filter((t: any) => t.status === "PENDING").reduce((a: number, t: any) => a + Number(t.amount), 0),
        despesa_total: expenses.reduce((a: number, t: any) => a + Number(t.amount), 0),
        despesa_realizada: paidExpenses.reduce((a: number, t: any) => a + Number(t.amount), 0),
        despesa_pendente: expenses.filter((t: any) => t.status === "PENDING").reduce((a: number, t: any) => a + Number(t.amount), 0),
        saldo_previsto: incomes.reduce((a: number, t: any) => a + Number(t.amount), 0) - expenses.reduce((a: number, t: any) => a + Number(t.amount), 0),
        saldo_realizado: paidIncomes.reduce((a: number, t: any) => a + Number(t.amount), 0) - paidExpenses.reduce((a: number, t: any) => a + Number(t.amount), 0),
        vencidos: txs.filter((t: any) => t.status === "PENDING" && t.due_date?.split("T")[0] < today).length,
        total_lancamentos: txs.length,
        lancamentos_auto: autoTxs.length,
        lancamentos_manual: manualTxs.length,
        por_origem: byOrigin,
        fonte: "financial_transactions",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== SERVICE CONTRACTS ====================
  app.get("/api/service-contracts", requireAuth, async (req, res) => {
    try {
      const { client_id } = req.query;
      let query = supabaseAdmin.from("service_contracts").select("*").order("created_at", { ascending: false });
      if (client_id) query = query.eq("client_id", client_id);
      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/service-contracts", requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const { data, error } = await supabaseAdmin.from("service_contracts").insert({ ...req.body, created_by: user.name }).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/service-contracts/:id", requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("service_contracts").update({ ...req.body, updated_at: new Date().toISOString() }).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/service-contracts/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("service_contracts").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ==================== ESCORT CALCULATION ENGINE ====================

  function calcularInicioCobranca(agendado?: string, chegadaReal?: string): { inicio_considerado: string; usou_agendado: boolean } {
    if (!agendado && !chegadaReal) return { inicio_considerado: "00:00", usou_agendado: false };
    if (!agendado) return { inicio_considerado: chegadaReal!, usou_agendado: false };
    if (!chegadaReal) return { inicio_considerado: agendado, usou_agendado: true };
    const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
    const minAg = toMin(agendado);
    const minReal = toMin(chegadaReal);
    if (minReal <= minAg) return { inicio_considerado: agendado, usou_agendado: true };
    return { inicio_considerado: chegadaReal, usou_agendado: false };
  }

  function calcularHorasTrabalhadas(inicio: string, fim?: string): number {
    if (!fim) return 0;
    const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
    let diff = toMin(fim) - toMin(inicio);
    if (diff < 0) diff += 24 * 60;
    return Math.round((diff / 60) * 100) / 100;
  }

  function calcularEscolta(dados: {
    km_inicial: number; km_final: number; km_vazio: number;
    horas_missao: number; horas_estadia: number; teve_pernoite: boolean;
    horario_inicio?: string; horario_fim?: string;
    horario_agendado?: string;
    despesas_pedagio: number; despesas_combustivel: number; despesas_outras: number;
    contrato: any;
  }) {
    const { km_inicial, km_final, km_vazio, horas_estadia, teve_pernoite, horario_inicio, horario_fim, horario_agendado, despesas_pedagio, despesas_combustivel, despesas_outras, contrato } = dados;

    if (km_final < km_inicial) throw new Error("KM final não pode ser menor que KM inicial");

    const n = (v: any) => Number(v) || 0;
    const hasAcionamento = n(contrato.valor_acionamento) > 0;
    const franquiaKm = n(contrato.franquia_km) || n(contrato.franquia_minima_km);
    const franquiaHoras = n(contrato.franquia_horas);
    const valorKmCarregado = n(contrato.valor_km_carregado);
    const valorKmVazio = n(contrato.valor_km_vazio);
    const valorKmExtra = n(contrato.valor_km_extra) || valorKmCarregado;
    const valorHoraExtra = n(contrato.valor_hora_extra) || n(contrato.valor_hora_estadia);
    const valorAcionamento = n(contrato.valor_acionamento);

    const { inicio_considerado, usou_agendado } = calcularInicioCobranca(horario_agendado, horario_inicio);
    const horas_trabalhadas_calc = horario_fim ? calcularHorasTrabalhadas(inicio_considerado, horario_fim) : dados.horas_missao;
    const horas_missao = horas_trabalhadas_calc > 0 ? horas_trabalhadas_calc : dados.horas_missao;

    const km_total = km_final - km_inicial;
    const km_carregado = Math.max(0, km_total - km_vazio);

    const km_franquia = franquiaKm;
    const km_excedente = Math.max(0, km_carregado - km_franquia);
    const km_faturado_carregado = Math.max(km_carregado, km_franquia);
    const require_photo = km_total > 500;

    const isNoturno = (() => {
      const checkHour = (t?: string) => {
        if (!t) return false;
        const h = parseInt(t.split(":")[0]);
        return h >= 22 || h < 5;
      };
      return checkHour(inicio_considerado) || checkHour(horario_fim);
    })();

    const despesas_total = despesas_pedagio + despesas_combustivel + despesas_outras;

    let fat_km_carregado: number;
    let fat_km_vazio: number;
    let fat_km: number;
    let valor_franquia: number;
    let valor_km_extra_calc: number;
    let fat_acionamento = 0;
    let fat_hora_extra = 0;

    if (hasAcionamento) {
      fat_acionamento = valorAcionamento;
      fat_km_carregado = km_excedente * valorKmExtra;
      fat_km_vazio = km_vazio * valorKmVazio;
      fat_km = fat_km_carregado + fat_km_vazio;
      valor_franquia = valorAcionamento;
      valor_km_extra_calc = fat_km_carregado;
      const horasExcedentes = Math.max(0, horas_missao - franquiaHoras);
      fat_hora_extra = horasExcedentes * valorHoraExtra;
    } else {
      fat_km_carregado = km_faturado_carregado * valorKmCarregado;
      fat_km_vazio = km_vazio * valorKmVazio;
      fat_km = fat_km_carregado + fat_km_vazio;
      valor_franquia = Math.min(km_carregado, km_franquia) * valorKmCarregado;
      valor_km_extra_calc = km_excedente * valorKmCarregado;
    }

    const fat_estadia = horas_estadia * n(contrato.valor_hora_estadia);
    const fat_pernoite = teve_pernoite ? n(contrato.valor_diaria) : 0;
    let fat_adicional_noturno = 0;
    if (isNoturno) {
      fat_adicional_noturno = (hasAcionamento ? (fat_acionamento + fat_km) : fat_km) * (n(contrato.adicional_noturno_km_pct) / 100);
    }
    const fat_total = (hasAcionamento ? fat_acionamento : 0) + fat_km + fat_hora_extra + fat_estadia + fat_pernoite + fat_adicional_noturno + despesas_total;

    let pag_vrp = n(contrato.vrp_base);
    let pag_periculosidade = 0;
    const periculosidadeHorasLimite = n(contrato.periculosidade_horas_limite);
    if (periculosidadeHorasLimite > 0 && horas_missao > periculosidadeHorasLimite) {
      const horas_extras = horas_missao - periculosidadeHorasLimite;
      const valor_hora_base = pag_vrp / periculosidadeHorasLimite;
      pag_periculosidade = horas_extras * valor_hora_base * (n(contrato.adicional_periculosidade_pct) / 100);
    }
    let pag_adicional_noturno = 0;
    if (isNoturno) {
      pag_adicional_noturno = pag_vrp * (n(contrato.adicional_noturno_vrp_pct) / 100);
    }
    const pag_reembolsos = despesas_total;
    const pag_total = pag_vrp + pag_periculosidade + pag_adicional_noturno + pag_reembolsos;

    const resultado_bruto = fat_total - pag_total;
    const resultado_liquido = resultado_bruto - despesas_total;
    const margem_pct = fat_total > 0 ? (resultado_liquido / fat_total) * 100 : 0;

    const r = (v: number) => Math.round(v * 100) / 100;

    return {
      km_carregado, km_vazio, km_total, km_faturado: km_faturado_carregado, require_photo, is_noturno: isNoturno,
      km_franquia, km_excedente: r(km_excedente), valor_franquia: r(valor_franquia), valor_km_extra: r(valor_km_extra_calc),
      horario_inicio_considerado: inicio_considerado, usou_agendado, horas_trabalhadas: r(horas_missao),
      modelo_acionamento: hasAcionamento,
      fat_acionamento: r(fat_acionamento), fat_hora_extra: r(fat_hora_extra),
      franquia_horas: franquiaHoras, franquia_km: franquiaKm,
      faturamento: {
        acionamento: r(fat_acionamento), km_carregado: r(fat_km_carregado), km_vazio: r(fat_km_vazio),
        hora_extra: r(fat_hora_extra),
        estadia: r(fat_estadia), diaria: fat_pernoite, adicional_noturno: r(fat_adicional_noturno),
        total: r(fat_total),
      },
      pagamento: {
        vrp: pag_vrp, periculosidade: r(pag_periculosidade),
        adicional_noturno: r(pag_adicional_noturno), reembolsos: pag_reembolsos,
        total: r(pag_total),
      },
      despesas: { pedagio: despesas_pedagio, combustivel: despesas_combustivel, outras: despesas_outras, total: despesas_total },
      resultado: { bruto: r(resultado_bruto), liquido: r(resultado_liquido), margem_pct: r(margem_pct) },
      fat_km: r(fat_km), fat_estadia: r(fat_estadia), fat_pernoite,
      fat_adicional_noturno: r(fat_adicional_noturno), fat_total: r(fat_total),
      pag_vrp, pag_periculosidade: r(pag_periculosidade),
      pag_adicional_noturno: r(pag_adicional_noturno), pag_reembolsos, pag_total: r(pag_total),
    };
  }

  // Escort Contracts CRUD
  app.get("/api/escort/contracts", requireAuth, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("escort_contracts").select("*").order("client_name");
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/escort/contracts", requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("escort_contracts").insert(req.body).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/escort/contracts/:id", requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("escort_contracts").update(req.body).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/escort/contracts/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("escort_contracts").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/escort/calculate", requireAuth, async (req, res) => {
    try {
      const { contract_id, km_inicial, km_final, km_vazio, horas_missao, horas_estadia, teve_pernoite, horario_inicio, horario_fim, horario_agendado, despesas_pedagio, despesas_combustivel, despesas_outras, is_noturno, despesas } = req.body;

      const kmIni = Number(km_inicial || 0);
      const kmFin = Number(km_final || 0);
      if (kmFin < kmIni) return res.status(400).json({ message: "KM final não pode ser menor que KM inicial" });

      let contrato: any;
      if (contract_id) {
        const { data, error } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", contract_id).single();
        if (error || !data) return res.status(404).json({ message: "Contrato não encontrado" });
        contrato = data;
      } else {
        contrato = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
      }

      const desp = despesas || {};
      const resultado = calcularEscolta({
        km_inicial: kmIni, km_final: kmFin, km_vazio: Number(km_vazio || 0),
        horas_missao: Number(horas_missao || 0), horas_estadia: Number(horas_estadia || 0),
        teve_pernoite: !!teve_pernoite, horario_inicio, horario_fim, horario_agendado,
        despesas_pedagio: Number(desp.pedagio || despesas_pedagio || 0),
        despesas_combustivel: Number(desp.combustivel || despesas_combustivel || 0),
        despesas_outras: Number(desp.outras || despesas_outras || 0), contrato,
      });

      res.json({ status: "sucesso", ...resultado, require_foto_hodometro: resultado.require_photo });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Escort Billing - Save (with auto BO generation)
  app.post("/api/escort/billings", requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const body = req.body;
      if (Number(body.km_final) < Number(body.km_inicial)) return res.status(400).json({ message: "KM final não pode ser menor que KM inicial" });
      const km_total = Number(body.km_final) - Number(body.km_inicial);
      if (km_total > 500 && !body.foto_hodometro_fim) return res.status(400).json({ message: "Foto do hodômetro é obrigatória para diferença maior que 500 KM" });

      let clientId = body.client_id;
      let clientName = body.client_name;
      if (!clientId && body.route_id) {
        const { data: route } = await supabaseAdmin.from("escort_routes").select("client_id, client_name").eq("id", body.route_id).single();
        if (route?.client_id) { clientId = route.client_id; clientName = clientName || route.client_name; }
      }

      const now = new Date();
      const boletimNumero = `BO-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}-${String(Math.random().toString(36).substring(2, 6)).toUpperCase()}`;

      const VALID_BILLING_STATUSES = ["A_VERIFICAR", "FATURADO", "PAGO", "CANCELADO", "APROVADA", "REJEITADA"];
      const safeStatus = VALID_BILLING_STATUSES.includes(body.status) ? body.status : "A_VERIFICAR";
      const { data, error } = await supabaseAdmin.from("escort_billings").insert({
        ...body, client_id: clientId, client_name: clientName,
        status: safeStatus,
        created_by: user.name, boletim_numero: boletimNumero, boletim_gerado: true,
      }).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Escort Billings - List
  app.get("/api/escort/billings", requireAuth, async (req, res) => {
    try {
      const { client_id, status, from, to } = req.query;
      let query = supabaseAdmin.from("escort_billings").select("*").order("created_at", { ascending: false });
      if (client_id) query = query.eq("client_id", client_id);
      if (status) query = query.eq("status", status as string);
      if (from) query = query.gte("created_at", from as string);
      if (to) query = query.lte("created_at", to as string);
      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/escort/billings/:id", requireAdminRole, async (req, res) => {
    try {
      const { data: existing, error: fetchErr } = await supabaseAdmin.from("escort_billings").select("status").eq("id", req.params.id).single();
      if (fetchErr || !existing) return res.status(404).json({ message: "Registro não encontrado" });

      const LOCKED_STATUSES = ["APROVADA", "FATURADO", "PAGO"];
      const STATUS_ONLY_FIELDS = ["status", "observacoes", "notas"];

      if (LOCKED_STATUSES.includes(existing.status)) {
        const updateBody = { ...req.body };
        const attemptedFields = Object.keys(updateBody);
        const blockedFields = attemptedFields.filter(f => !STATUS_ONLY_FIELDS.includes(f));
        if (blockedFields.length > 0) {
          return res.status(403).json({
            message: `Boletim aprovado — valores de cálculo estão travados. Apenas status e observações podem ser alterados.`,
          });
        }
      }

      const updateBody = { ...req.body };
      if (updateBody.status) {
        const VALID_BILLING_STATUSES = ["A_VERIFICAR", "FATURADO", "PAGO", "CANCELADO", "APROVADA", "REJEITADA"];
        if (!VALID_BILLING_STATUSES.includes(updateBody.status)) {
          return res.status(400).json({ message: `Status inválido: ${updateBody.status}. Valores aceitos: ${VALID_BILLING_STATUSES.join(", ")}` });
        }
      }
      const { data, error } = await supabaseAdmin.from("escort_billings").update(updateBody).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/escort/billings/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      await removeAutoTransaction("escort_billing", req.params.id);
      const { error } = await supabaseAdmin.from("escort_billings").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/escort/billings/submit-os", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const body = req.body;

      const kmIni = Number(body.km_inicial || 0);
      const kmFin = Number(body.km_final || 0);
      if (kmFin < kmIni) return res.status(400).json({ message: "KM final não pode ser menor que KM inicial" });

      let clientId = body.client_id;
      let clientName = body.client_name;
      if (!clientId && body.route_id) {
        const { data: route } = await supabaseAdmin.from("escort_routes").select("client_id, client_name").eq("id", body.route_id).single();
        if (route?.client_id) { clientId = route.client_id; clientName = clientName || route.client_name; }
      }

      let contrato: any = null;
      if (body.contract_id) {
        const { data } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", body.contract_id).single();
        contrato = data;
      }
      if (!contrato) {
        contrato = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
      }

      const resultado = calcularEscolta({
        km_inicial: kmIni, km_final: kmFin, km_vazio: Number(body.km_vazio || 0),
        horas_missao: Number(body.horas_missao || 0), horas_estadia: Number(body.horas_estadia || 0),
        teve_pernoite: !!body.teve_pernoite, horario_inicio: body.horario_inicio, horario_fim: body.horario_fim,
        horario_agendado: body.horario_agendado,
        despesas_pedagio: Number(body.despesas_pedagio || 0), despesas_combustivel: Number(body.despesas_combustivel || 0),
        despesas_outras: Number(body.despesas_outras || 0), contrato,
      });

      const nb = (v: any) => Number(v) || 0;
      const { data, error } = await supabaseAdmin.from("escort_billings").insert({
        client_id: clientId, client_name: clientName,
        contract_id: body.contract_id, route_id: body.route_id,
        service_order_id: body.service_order_id,
        km_inicial: nb(kmIni), km_final: nb(kmFin), km_vazio: nb(body.km_vazio),
        km_carregado: nb(resultado.km_carregado), km_total: nb(resultado.km_total),
        km_faturado: nb(resultado.km_faturado), km_franquia: nb(resultado.km_franquia),
        km_excedente: nb(resultado.km_excedente),
        horario_agendado: body.horario_agendado || null,
        horario_inicio: body.horario_inicio || null, horario_fim: body.horario_fim || null,
        horario_inicio_considerado: resultado.horario_inicio_considerado,
        horas_missao: nb(resultado.horas_trabalhadas), horas_estadia: nb(body.horas_estadia),
        horas_trabalhadas: nb(resultado.horas_trabalhadas),
        teve_pernoite: !!body.teve_pernoite, is_noturno: resultado.is_noturno,
        despesas_pedagio: nb(body.despesas_pedagio), despesas_combustivel: nb(body.despesas_combustivel),
        despesas_outras: nb(body.despesas_outras),
        desp_total: nb(resultado.despesas.total),
        fat_acionamento: nb(resultado.fat_acionamento), fat_hora_extra: nb(resultado.fat_hora_extra),
        fat_km: nb(resultado.fat_km), fat_km_carregado: nb(resultado.faturamento.km_carregado),
        fat_km_vazio: nb(resultado.faturamento.km_vazio),
        fat_estadia: nb(resultado.fat_estadia), fat_pernoite: nb(resultado.fat_pernoite),
        fat_diaria: nb(resultado.fat_pernoite),
        fat_adicional_noturno: nb(resultado.fat_adicional_noturno), fat_total: nb(resultado.fat_total),
        valor_franquia: nb(resultado.valor_franquia), valor_km_extra: nb(resultado.valor_km_extra),
        pag_vrp: nb(resultado.pag_vrp), pag_periculosidade: nb(resultado.pag_periculosidade),
        pag_adicional_noturno: nb(resultado.pag_adicional_noturno), pag_reembolsos: nb(resultado.pag_reembolsos),
        pag_total: nb(resultado.pag_total),
        resultado_bruto: nb(resultado.resultado.bruto), resultado_liquido: nb(resultado.resultado.liquido),
        margem_percentual: nb(resultado.resultado.margem_pct),
        vigilante_id: body.vigilante_id || user.id, vigilante_name: body.vigilante_name || user.name,
        origem: body.origem, destino: body.destino,
        placa_viatura: body.placa_viatura, placa_escoltado: body.placa_escoltado,
        motorista_escoltado: body.motorista_escoltado,
        data_missao: body.data_missao || new Date().toISOString(),
        observacoes: body.observacoes, notas: body.notas,
        status: "A_VERIFICAR", created_by: user.name,
      }).select().single();
      if (error) throw error;

      res.json({ ...data, resumo_calculo: resultado });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/escort/billings/:id/salvar", requireAdminRole, async (req, res) => {
    try {
      const { data: existing, error: fetchErr } = await supabaseAdmin.from("escort_billings").select("status").eq("id", req.params.id).single();
      if (fetchErr || !existing) return res.status(404).json({ message: "Registro não encontrado" });

      const LOCKED_STATUSES = ["APROVADA", "FATURADO", "PAGO"];
      if (LOCKED_STATUSES.includes(existing.status)) {
        return res.status(403).json({ message: "Boletim aprovado — valores travados. Não é possível alterar." });
      }

      const { observacoes, despesas_pedagio } = req.body;
      const updateData: any = {};
      if (observacoes !== undefined) updateData.observacoes = observacoes;
      if (despesas_pedagio !== undefined) updateData.despesas_pedagio = Number(despesas_pedagio) || 0;

      const { data, error } = await supabaseAdmin.from("escort_billings").update(updateData).eq("id", req.params.id).select().single();
      if (error) throw error;

      if (data && despesas_pedagio !== undefined) {
        const fatTotal = Number(data.fat_total || 0);
        const pagTotal = Number(data.pag_total || 0);
        const pedagio = Number(data.despesas_pedagio || 0);
        const combustivel = Number(data.despesas_combustivel || 0);
        const outras = Number(data.despesas_outras || 0);
        const despTotal = pedagio + combustivel + outras;
        const resultado = fatTotal - pagTotal - despTotal;
        await supabaseAdmin.from("escort_billings").update({ resultado_liquido: resultado, resultado_bruto: fatTotal - pagTotal }).eq("id", req.params.id);
        data.resultado_liquido = resultado;
        data.resultado_bruto = fatTotal - pagTotal;
      }
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/escort/billings/:id/revisar", requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const { acao, motivo_rejeicao } = req.body;

      if (!["APROVADA", "REJEITADA"].includes(acao)) {
        return res.status(400).json({ message: "Ação deve ser APROVADA ou REJEITADA" });
      }

      const { data: billing, error: fetchErr } = await supabaseAdmin.from("escort_billings").select("*").eq("id", req.params.id).single();
      if (fetchErr || !billing) return res.status(404).json({ message: "Registro não encontrado" });
      if (billing.status !== "A_VERIFICAR") return res.status(400).json({ message: "Somente OS com status 'A Verificar' podem ser revisadas" });

      const updateData: any = {
        status: acao === "APROVADA" ? "APROVADA" : "REJEITADA",
        revisado_por: user.name,
        revisado_em: new Date().toISOString(),
      };
      if (acao === "REJEITADA" && motivo_rejeicao) updateData.motivo_rejeicao = motivo_rejeicao;

      if (acao === "APROVADA") {
        const now = new Date();
        updateData.boletim_numero = `BO-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}-${String(Math.random().toString(36).substring(2, 6)).toUpperCase()}`;
        updateData.boletim_gerado = true;
      }

      const { data, error } = await supabaseAdmin.from("escort_billings").update(updateData).eq("id", req.params.id).select().single();
      if (error) throw error;

      if (acao === "APROVADA" && data && Number(data.fat_total) > 0) {
        await createAutoTransaction({
          description: `ESCOLTA ${data.boletim_numero || ""} - ${data.client_name || "Cliente"} (${data.origem || ""} → ${data.destino || ""})`.trim(),
          amount: Number(data.fat_total),
          type: "INCOME",
          due_date: (data.data_missao || data.created_at || new Date().toISOString()).split("T")[0],
          origin_type: "escort_billing",
          origin_id: data.id,
          category_name: "Faturamento Escolta",
          entity_name: data.client_name || null,
          created_by: user.name,
        });
      }

      if (acao === "REJEITADA") {
        await removeAutoTransaction("escort_billing", req.params.id);
      }

      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/escort/billings/:id/reabrir", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const user = req.user!;
      const { data: billing, error: fetchErr } = await supabaseAdmin.from("escort_billings").select("*").eq("id", req.params.id).single();
      if (fetchErr || !billing) return res.status(404).json({ message: "Registro não encontrado" });
      if (billing.status !== "APROVADA") return res.status(400).json({ message: "Somente OS com status 'APROVADA' podem ser reabertas" });

      const { data, error } = await supabaseAdmin.from("escort_billings").update({
        status: "A_VERIFICAR",
        revisado_por: null,
        revisado_em: null,
        boletim_gerado: false,
      }).eq("id", req.params.id).select().single();
      if (error) throw error;

      await removeAutoTransaction("escort_billing", req.params.id);
      console.log(`[Billing] OS reaberta por ${user.name}: billing ${req.params.id}`);

      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/escort/billings/pendentes", requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("escort_billings").select("*").eq("status", "A_VERIFICAR").order("created_at", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Escort Routes (Rotas Frequentes) CRUD
  app.get("/api/escort/routes", requireAuth, async (req, res) => {
    try {
      const { client_id } = req.query;
      let query = supabaseAdmin.from("escort_routes").select("*").order("name");
      if (client_id) query = query.eq("client_id", client_id);
      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/escort/routes", requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("escort_routes").insert(req.body).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/escort/routes/:id", requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("escort_routes").update(req.body).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/escort/routes/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("escort_routes").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Gerar Boletim de Missão
  app.post("/api/escort/billings/:id/gerar-boletim", requireAdminRole, async (req, res) => {
    try {
      const { data: billing, error: fetchErr } = await supabaseAdmin.from("escort_billings").select("*").eq("id", req.params.id).single();
      if (fetchErr || !billing) return res.status(404).json({ message: "Faturamento não encontrado" });

      if (billing.boletim_gerado) return res.json({ ...billing, message: "Boletim já gerado anteriormente" });

      const now = new Date();
      const boletimNumero = `BO-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}-${String(billing.id).slice(-4).toUpperCase()}`;

      const { data, error } = await supabaseAdmin.from("escort_billings")
        .update({ boletim_numero: boletimNumero, boletim_gerado: true })
        .eq("id", req.params.id).select().single();
      if (error) throw error;

      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/financial/dashboard", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { data: billings, error: bErr } = await supabaseAdmin.from("escort_billings").select("*").order("data_missao", { ascending: true });
      if (bErr) throw bErr;

      const { data: transactions, error: tErr } = await supabaseAdmin.from("financial_transactions").select("*");
      if (tErr) throw tErr;

      const { data: vehicles } = await supabaseAdmin.from("vehicles").select("id, plate, model");
      const { data: employees } = await supabaseAdmin.from("employees").select("id, name");

      const allTimesheets = await storage.getTimesheets();

      const txns = transactions || [];

      const allOrders = await storage.getServiceOrders();
      const todayBRT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

      const todayEscoltaOs = allOrders.filter((so: any) => {
        if (so.type !== "escolta" || so.missionStatus === "aguardando") return false;
        if (so.status === "em_andamento") return true;
        const oDate = so.scheduledDate
          ? new Date(so.scheduledDate).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
          : so.completedDate
            ? new Date(so.completedDate).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
            : null;
        return oDate === todayBRT && (so.status === "concluida" || so.status === "concluída" || so.status === "cancelada");
      });
      const todayOsIds = new Set(todayEscoltaOs.map((so: any) => so.id));

      const items = (billings || []).filter((b: any) => !todayOsIds.has(b.service_order_id));

      const calcHorasBRT = (startDate: Date, endDate: Date): number => {
        const startTime = startDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
        const endTime = endDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
        const [sh, sm] = startTime.split(":").map(Number);
        const [eh, em] = endTime.split(":").map(Number);
        let startMin = sh * 60 + sm;
        let endMin = eh * 60 + em;
        if (endMin < startMin) endMin += 24 * 60;
        return (endMin - startMin) / 60;
      };

      for (const so of todayEscoltaOs) {
        try {
          const nb = (v: any) => Number(v) || 0;
          let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
          if (so.escortContractId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", so.escortContractId).limit(1);
            if (cc?.length) contrato = cc[0];
          } else if (so.clientId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.clientId).eq("status", "Ativo").limit(1);
            if (cc?.length) contrato = cc[0];
          }
          const photos = await storage.getMissionPhotosByOS(so.id);
          const kmSaidaP = photos.find((p: any) => p.step === "km_saida");
          const kmChegadaP = photos.find((p: any) => p.step === "km_chegada");
          const kmFinalP = photos.find((p: any) => p.step === "km_final");
          const kmInicial = nb(kmChegadaP?.kmValue || kmSaidaP?.kmValue);
          const kmAtual = nb(kmFinalP?.kmValue || kmChegadaP?.kmValue || kmInicial);
          const km_carregado = Math.max(0, kmAtual - kmInicial);

          const startedAt = so.missionStartedAt ? new Date(so.missionStartedAt) : null;
          const endedAt = so.completedDate ? new Date(so.completedDate) : null;
          const endRef = endedAt || new Date();
          const horasMissao = startedAt ? calcHorasBRT(startedAt, endRef) : 0;

          const franquiaKm = nb(contrato.franquia_km) || nb(contrato.franquia_minima_km);
          const km_excedente = Math.max(0, km_carregado - franquiaKm);
          const hasAcion = nb(contrato.valor_acionamento) > 0;
          const franquiaHoras = nb(contrato.franquia_horas);
          let fat_total = 0, fat_acionamento = 0, fat_km = 0, fat_hora_extra = 0;
          if (hasAcion) {
            fat_acionamento = nb(contrato.valor_acionamento);
            fat_km = km_excedente * (nb(contrato.valor_km_extra) || nb(contrato.valor_km_carregado));
            if (franquiaHoras > 0 && horasMissao > franquiaHoras) {
              fat_hora_extra = (horasMissao - franquiaHoras) * nb(contrato.valor_hora_extra);
            }
            fat_total = fat_acionamento + fat_km + fat_hora_extra;
          } else {
            const km_faturado = Math.max(km_carregado, franquiaKm);
            fat_km = km_faturado * nb(contrato.valor_km_carregado);
            fat_total = fat_km;
          }

          const existingBilling = (billings || []).find((b: any) => b.service_order_id === so.id);
          const despesas_pedagio = nb(existingBilling?.despesas_pedagio);
          const despesas_combustivel = nb(existingBilling?.despesas_combustivel);
          const despesas_outras = nb(existingBilling?.despesas_outras);

          const r = (v: number) => Math.round(v * 100) / 100;
          const client = so.clientId ? await storage.getClient(so.clientId) : null;
          const emp = so.assignedEmployeeId ? await storage.getEmployee(so.assignedEmployeeId) : null;
          const emp2 = so.assignedEmployee2Id ? await storage.getEmployee(so.assignedEmployee2Id) : null;
          const vehicle = so.vehicleId ? await storage.getVehicle(so.vehicleId) : null;
          items.push({
            id: existingBilling?.id || `calc-${so.id}`, service_order_id: so.id,
            client_id: so.clientId, client_name: client?.name || "--",
            contract_id: contrato.id || null,
            km_inicial: kmInicial, km_final: kmAtual, km_vazio: 0,
            km_carregado: r(km_carregado), km_total: r(km_carregado),
            km_faturado: r(Math.max(km_carregado, franquiaKm)), km_franquia: r(franquiaKm),
            km_excedente: r(km_excedente),
            horas_missao: r(horasMissao), horas_trabalhadas: r(horasMissao),
            fat_acionamento: r(fat_acionamento), fat_km: r(fat_km), fat_hora_extra: r(fat_hora_extra), fat_total: r(fat_total),
            pag_vrp: r(nb(contrato.vrp_base)), pag_total: r(nb(contrato.vrp_base)),
            resultado_bruto: r(fat_total - nb(contrato.vrp_base)),
            resultado_liquido: r(fat_total - nb(contrato.vrp_base)),
            vigilante_id: so.assignedEmployeeId, vigilante_name: emp?.name || "--",
            vigilante2_id: so.assignedEmployee2Id || null, vigilante2_name: emp2?.name || null,
            origem: so.origin || null, destino: so.destination || null,
            placa_viatura: vehicle?.plate || null,
            data_missao: so.scheduledDate || so.createdAt || new Date().toISOString(),
            status: existingBilling?.status || "A_VERIFICAR",
            despesas_pedagio, despesas_combustivel, despesas_outras,
          });
        } catch (err: any) {
          console.error(`[dashboard] calc billing for OS ${so.osNumber}: ${err.message}`);
        }
      }

      const incomeTotal = txns.filter((t: any) => t.type === "INCOME").reduce((a: number, t: any) => a + Number(t.amount || 0), 0);
      const incomePaid = txns.filter((t: any) => t.type === "INCOME" && t.status === "PAID").reduce((a: number, t: any) => a + Number(t.amount || 0), 0);
      const expenseTotal = txns.filter((t: any) => t.type === "EXPENSE").reduce((a: number, t: any) => a + Number(t.amount || 0), 0);
      const expensePaid = txns.filter((t: any) => t.type === "EXPENSE" && t.status === "PAID").reduce((a: number, t: any) => a + Number(t.amount || 0), 0);
      const escortIncome = txns.filter((t: any) => t.origin_type === "escort_billing").reduce((a: number, t: any) => a + Number(t.amount || 0), 0);
      const fuelingExpense = txns.filter((t: any) => t.origin_type === "fueling").reduce((a: number, t: any) => a + Number(t.amount || 0), 0);
      const maintenanceExpense = txns.filter((t: any) => t.origin_type === "maintenance").reduce((a: number, t: any) => a + Number(t.amount || 0), 0);
      const missionCostExpense = txns.filter((t: any) => t.origin_type === "mission_cost").reduce((a: number, t: any) => a + Number(t.amount || 0), 0);

      const revenueByDay: Record<string, number> = {};
      txns.filter((t: any) => t.type === "INCOME").forEach((t: any) => {
        const d = (t.due_date)?.split("T")[0];
        if (!d) return;
        revenueByDay[d] = (revenueByDay[d] || 0) + Number(t.amount || 0);
      });

      const expensesByDay: Record<string, number> = {};
      txns.filter((t: any) => t.type === "EXPENSE").forEach((t: any) => {
        const d = (t.due_date)?.split("T")[0];
        if (!d) return;
        expensesByDay[d] = (expensesByDay[d] || 0) + Number(t.amount || 0);
      });

      const missionsByDay: Record<string, any[]> = {};
      items.forEach((b: any) => {
        const d = b.data_missao ? new Date(b.data_missao).toISOString().split("T")[0] : b.created_at?.split("T")[0];
        if (!d) return;
        if (!missionsByDay[d]) missionsByDay[d] = [];
        missionsByDay[d].push(b);
      });

      const calcFat = (b: any) => Number(b.fat_acionamento || 0) + Number(b.fat_hora_extra || 0) + Number(b.fat_km || 0) + Number(b.despesas_pedagio || 0);
      const byVehicle: Record<string, { plate: string; model: string; fat_total: number; pag_total: number; missions: number; despesas: number }> = {};
      items.forEach((b: any) => {
        const plate = b.placa_viatura || "SEM PLACA";
        if (!byVehicle[plate]) {
          const v = (vehicles || []).find((v: any) => v.plate === plate);
          byVehicle[plate] = { plate, model: v?.model || "", fat_total: 0, pag_total: 0, missions: 0, despesas: 0 };
        }
        byVehicle[plate].fat_total += calcFat(b);
        byVehicle[plate].pag_total += Number(b.pag_total || 0);
        byVehicle[plate].missions += 1;
        byVehicle[plate].despesas += Number(b.despesas_pedagio || 0) + Number(b.despesas_combustivel || 0) + Number(b.despesas_outras || 0);
      });

      const timesheetHoursByEmployee: Record<number, number> = {};
      allTimesheets.forEach((ts: any) => {
        const empId = ts.employeeId;
        if (!empId) return;
        let hours = 0;
        if (ts.hoursWorked != null && Number(ts.hoursWorked) > 0) {
          hours = Number(ts.hoursWorked);
        } else if (ts.checkIn && ts.checkOut) {
          const parseTime = (t: string) => { const [h, m] = t.split(":").map(Number); return h + (m || 0) / 60; };
          let worked = parseTime(ts.checkOut) - parseTime(ts.checkIn);
          if (ts.checkOutLunch && ts.checkInLunch) {
            worked -= (parseTime(ts.checkInLunch) - parseTime(ts.checkOutLunch));
          }
          if (worked > 0) hours = worked;
        }
        timesheetHoursByEmployee[empId] = (timesheetHoursByEmployee[empId] || 0) + hours;
      });

      const byAgent: Record<string, { id: number; name: string; fat_total: number; pag_total: number; missions: number; horas_trabalhadas: number }> = {};
      items.forEach((b: any) => {
        const name = b.vigilante_name || "SEM AGENTE";
        const id = b.vigilante_id || 0;
        const key = String(id || name);
        if (!byAgent[key]) byAgent[key] = { id, name, fat_total: 0, pag_total: 0, missions: 0, horas_trabalhadas: 0 };
        byAgent[key].fat_total += calcFat(b);
        byAgent[key].pag_total += Number(b.pag_total || 0);
        byAgent[key].missions += 1;

        if (b.vigilante2_id && b.vigilante2_name) {
          const key2 = String(b.vigilante2_id);
          if (!byAgent[key2]) byAgent[key2] = { id: b.vigilante2_id, name: b.vigilante2_name, fat_total: 0, pag_total: 0, missions: 0, horas_trabalhadas: 0 };
          byAgent[key2].fat_total += calcFat(b);
          byAgent[key2].pag_total += Number(b.pag_total || 0);
          byAgent[key2].missions += 1;
        }
      });

      Object.values(byAgent).forEach((agent) => {
        agent.horas_trabalhadas = timesheetHoursByEmployee[agent.id] || 0;
      });

      const osLookup = new Map(allOrders.map((so: any) => [so.id, so]));

      const byMission = items.map((b: any) => {
        const fat = calcFat(b);
        const desp = Number(b.despesas_pedagio || 0) + Number(b.despesas_combustivel || 0) + Number(b.despesas_outras || 0);
        const pag = Number(b.pag_total || 0);
        const lucro = fat - pag - desp;
        const so = osLookup.get(b.service_order_id);
        return {
        id: b.id,
        os_number: so?.osNumber || b.os_number || null,
        data: b.data_missao || b.created_at,
        origem: b.origem,
        destino: b.destino,
        placa_viatura: b.placa_viatura,
        vigilante: b.vigilante_name,
        vigilante_id: b.vigilante_id || 0,
        vigilante2: b.vigilante2_name || null,
        vigilante2_id: b.vigilante2_id || null,
        fat_total: fat,
        fat_acionamento: Number(b.fat_acionamento || 0),
        fat_hora_extra: Number(b.fat_hora_extra || 0),
        fat_km: Number(b.fat_km || 0),
        fat_adicional_noturno: Number(b.fat_adicional_noturno || 0),
        fat_estadia: Number(b.fat_estadia || 0),
        fat_pernoite: Number(b.fat_pernoite || 0),
        pag_total: pag,
        pag_vrp: Number(b.pag_vrp || 0),
        despesas: desp,
        despesas_pedagio: Number(b.despesas_pedagio || 0),
        despesas_combustivel: Number(b.despesas_combustivel || 0),
        lucro,
        margem: fat > 0 ? Math.round((lucro / fat) * 10000) / 100 : 0,
        km_total: Number(b.km_total || 0),
        km_carregado: Number(b.km_carregado || 0),
        km_franquia: Number(b.km_franquia || 0),
        km_excedente: Number(b.km_excedente || 0),
        horas_trabalhadas: Number(b.horas_trabalhadas || 0),
        horas_missao: Number(b.horas_missao || 0),
        boletim: b.boletim_numero,
        status: b.status,
        client_name: b.client_name,
        observacoes: b.observacoes || null,
      };
      });

      const expenseTransactions = txns
        .filter((t: any) => t.type === "EXPENSE")
        .map((t: any) => ({
          id: t.id,
          date: t.due_date?.split("T")[0] || t.created_at?.split("T")[0],
          amount: Number(t.amount || 0),
          origin_type: t.origin_type || "other",
          description: t.description || "",
          entity_name: t.entity_name || "",
          category_name: t.category_name || "",
          status: t.status,
        }));

      const timesheetsByAgent = allTimesheets.map((ts: any) => ({
        employeeId: ts.employeeId,
        date: ts.date,
        hoursWorked: (() => {
          if (ts.hoursWorked != null && Number(ts.hoursWorked) > 0) return Number(ts.hoursWorked);
          if (ts.checkIn && ts.checkOut) {
            const parseT = (t: string) => { const [h, m] = t.split(":").map(Number); return h + (m || 0) / 60; };
            let w = parseT(ts.checkOut) - parseT(ts.checkIn);
            if (ts.checkOutLunch && ts.checkInLunch) w -= (parseT(ts.checkInLunch) - parseT(ts.checkOutLunch));
            return w > 0 ? Math.round(w * 100) / 100 : 0;
          }
          return 0;
        })(),
      }));

      res.json({
        billings: items,
        missionsByDay,
        revenueByDay,
        expensesByDay,
        expenseTransactions,
        timesheetsByAgent,
        byVehicle: Object.values(byVehicle),
        byAgent: Object.values(byAgent),
        byMission,
        vehicles: vehicles || [],
        employees: employees || [],
        totals: {
          faturamento: incomeTotal,
          faturamento_realizado: incomePaid,
          custos_operacionais: expenseTotal,
          custos_realizados: expensePaid,
          saldo_previsto: incomeTotal - expenseTotal,
          saldo_realizado: incomePaid - expensePaid,
          escort_income: escortIncome,
          fueling_expense: fuelingExpense,
          maintenance_expense: maintenanceExpense,
          mission_cost_expense: missionCostExpense,
          despesas_gerais: expensePaid,
          receitas_gerais: incomePaid,
          total_missoes: items.length,
          total_km: items.reduce((a: number, b: any) => a + Number(b.km_total || 0), 0),
        },
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/service-contracts/:id/pdf", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const PDFDocument = (await import("pdfkit")).default;
      const { data: sc, error } = await supabaseAdmin.from("service_contracts").select("*").eq("id", req.params.id).single();
      if (error || !sc) return res.status(404).json({ message: "Contrato não encontrado" });

      const { data: priceTable } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", sc.client_id).eq("status", "ativo").maybeSingle();

      const doc = new PDFDocument({ size: "A4", margins: { top: 60, bottom: 60, left: 65, right: 65 }, autoFirstPage: false });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename=MINUTA_${sc.contract_number || sc.id.slice(0, 8)}.pdf`);
      doc.pipe(res);

      const fs = await import("fs");
      const path = await import("path");
      const W = 465;
      const LM = 65;
      const BRAND = "#111111";
      const BRAND_ACCENT = "#1a1a1a";
      const DARK = "#111111";
      const GRAY = "#333333";
      const LIGHT = "#777777";
      const ACCENT_LINE = "#222222";
      let y = 55;

      let logoBuffer: Buffer | null = null;
      try {
        const sharp = (await import("sharp")).default;
        const logoSrc = path.resolve("attached_assets/WhatsApp_Image_2026-03-19_at_18.44.30_1774457182066.jpeg");
        if (fs.existsSync(logoSrc)) {
          logoBuffer = await sharp(logoSrc)
            .resize({ height: 120 })
            .negate({ alpha: false })
            .flatten({ background: { r: 17, g: 17, b: 17 } })
            .png()
            .toBuffer();
        }
      } catch {}

      const HEADER_H = 46;
      const FOOTER_H = 30;
      const CONTENT_TOP = HEADER_H + 16;
      const CONTENT_BOTTOM = 795 - FOOTER_H - 20;

      let currentPage = 0;

      const startNewPage = () => {
        doc.addPage({ size: "A4", margins: { top: 60, bottom: 60, left: 65, right: 65 } });
        currentPage++;
        doc.save().rect(0, 0, 595.28, HEADER_H).fill(BRAND).restore();
        const hasLogo = !!logoBuffer;
        if (hasLogo) { try { doc.image(logoBuffer!, LM + 4, 6, { height: 34 }); } catch {} }
        const textX = hasLogo ? LM + 40 : LM;
        const textW = hasLogo ? W - 40 : W;
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
          .text("TORRES VIGILÂNCIA PATRIMONIAL", textX, 12, { width: textW, lineBreak: false });
        doc.font("Helvetica").fontSize(6.5).fillColor("#aaaaaa")
          .text("CNPJ: 36.982.392/0001-89", textX, 24, { width: textW, lineBreak: false });
        const fY = 795 - FOOTER_H;
        doc.save().rect(0, fY, 595.28, FOOTER_H + 10).fill(BRAND).restore();
        doc.font("Helvetica").fontSize(6).fillColor("#cccccc")
          .text("www.torresseguranca.com.br  •  @grupotorres.seguranca  •  (11) 96369-6699  •  escolta@torresseguranca.com.br", LM, fY + 8, { width: W, align: "center", lineBreak: false });
        y = CONTENT_TOP;
      };

      startNewPage();

      const checkPage = (need = 80) => { if (y > CONTENT_BOTTOM - need) { startNewPage(); } };
      const hLine = (yy: number) => { doc.save().moveTo(LM, yy).lineTo(LM + W, yy).lineWidth(0.6).strokeColor(ACCENT_LINE).stroke().restore(); };
      const thinLine = (yy: number) => { doc.save().moveTo(LM, yy).lineTo(LM + W, yy).lineWidth(0.3).strokeColor("#dddddd").stroke().restore(); };

      const safeText = (text: string, x: number, yPos: number, opts: any = {}) => {
        const font = opts.font || "Helvetica";
        const size = opts.size || 9;
        const color = opts.color || GRAY;
        const width = opts.width || W;
        const lineGap = opts.lineGap ?? 3;
        const align = opts.align || "justify";

        doc.font(font).fontSize(size);
        const totalH = doc.heightOfString(text, { width, lineGap });
        const availH = CONTENT_BOTTOM - yPos;

        if (totalH <= availH + 2) {
          doc.fillColor(color).text(text, x, yPos, { width, lineGap, align, lineBreak: true });
          return yPos + totalH;
        }

        const words = text.split(" ");
        let chunk = "";
        let curY = yPos;

        for (let i = 0; i < words.length; i++) {
          const test = chunk ? chunk + " " + words[i] : words[i];
          doc.font(font).fontSize(size);
          const testH = doc.heightOfString(test, { width, lineGap });
          const remain = CONTENT_BOTTOM - curY;

          if (testH > remain && chunk) {
            doc.font(font).fontSize(size).fillColor(color)
              .text(chunk, x, curY, { width, lineGap, align, lineBreak: true });
            startNewPage();
            curY = y;
            chunk = words[i];
          } else {
            chunk = test;
          }
        }
        if (chunk) {
          doc.font(font).fontSize(size).fillColor(color)
            .text(chunk, x, curY, { width, lineGap, align, lineBreak: true });
          doc.font(font).fontSize(size);
          curY += doc.heightOfString(chunk, { width, lineGap });
        }
        return curY;
      };

      const writeText = (text: string, opts: any = {}) => {
        doc.font(opts.font || "Helvetica").fontSize(opts.size || 9);
        const h = doc.heightOfString(text, { width: W, lineGap: 3 });
        const gap = opts.gap || 8;
        if (h + gap <= CONTENT_BOTTOM - y) {
          doc.fillColor(opts.color || GRAY)
            .text(text, LM, y, { width: W, lineGap: 3, align: opts.align || "justify", lineBreak: true });
          y += h + gap;
        } else {
          checkPage(Math.min(h + gap, 60));
          y = safeText(text, LM, y, { font: opts.font, size: opts.size, color: opts.color, align: opts.align });
          y += gap;
        }
      };

      const clauseTitle = (num: number, title: string) => {
        const label = `Cláusula ${num} – ${title}`;
        doc.font("Helvetica-Bold").fontSize(9);
        const titleH = doc.heightOfString(label, { width: W - 16 });
        const barH = Math.max(20, titleH + 8);
        checkPage(barH + 6);
        y += 4;
        doc.save().rect(LM, y - 2, W, barH).fill(BRAND_ACCENT).restore();
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
          .text(label, LM + 8, y + 3, { width: W - 16, lineBreak: true });
        y += barH + 6;
      };

      const subItem = (code: string, text: string) => {
        const full = `${code} - ${text}`;
        doc.font("Helvetica").fontSize(8.5);
        const h = doc.heightOfString(full, { width: W - 10, lineGap: 2 });
        const gap = 5;
        if (h + gap <= CONTENT_BOTTOM - y) {
          doc.fillColor(GRAY).text(full, LM + 10, y, { width: W - 10, lineGap: 2, align: "justify", lineBreak: true });
          y += h + gap;
        } else {
          checkPage(Math.min(h + gap, 40));
          y = safeText(full, LM + 10, y, { size: 8.5, width: W - 10, lineGap: 2 });
          y += gap;
        }
      };

      const contratanteNome = sc.contratante_razao || sc.client_name || "_______________";
      const contratanteCnpj = sc.contratante_cnpj || "_______________";
      const contratanteEndereco = sc.contratante_endereco || "_______________";
      const contratanteRepresentante = sc.contratante_representante || "seu representante legal";
      const avisoPrevioDias = sc.aviso_previo_dias || 30;

      doc.font("Helvetica-Bold").fontSize(13).fillColor(DARK)
        .text("MINUTA DE CONTRATO", LM, y, { width: W, align: "center", lineBreak: false });
      y += 16;
      doc.font("Helvetica").fontSize(9).fillColor(LIGHT)
        .text("PRESTAÇÃO DE SERVIÇOS DE ESCOLTA ARMADA", LM, y, { width: W, align: "center", lineBreak: false });
      y += 22;

      hLine(y); y += 15;

      const contratanteFullText = `CONTRATANTE: ${contratanteNome}. Pessoa jurídica de direito privado, inscrita no CNPJ/MF sob nº ${contratanteCnpj}, com sede fiscal na ${contratanteEndereco}, representado neste ato por ${contratanteRepresentante}.`;
      doc.font("Helvetica").fontSize(9);
      const contratanteH = doc.heightOfString(contratanteFullText, { width: W, lineGap: 3 });
      if (contratanteH + 15 <= CONTENT_BOTTOM - y) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK).text("CONTRATANTE: ", LM, y, { continued: true, width: W });
        doc.font("Helvetica").fontSize(9).fillColor(GRAY)
          .text(`${contratanteNome}. Pessoa jurídica de direito privado, inscrita no CNPJ/MF sob nº ${contratanteCnpj}, com sede fiscal na ${contratanteEndereco}, representado neste ato por ${contratanteRepresentante}.`, { width: W, lineGap: 3, align: "justify" });
        y += contratanteH + 15;
      } else {
        checkPage(40);
        y = safeText(contratanteFullText, LM, y, { font: "Helvetica", size: 9 });
        y += 15;
      }

      const contratadaFullText = "CONTRATADA: TORRES VIGILÂNCIA PATRIMONIAL LTDA. Pessoa jurídica de direito privado, inscrita no CNPJ/MF sob nº 36.982.392/0001-89, com sede fiscal em São Paulo/SP.";
      doc.font("Helvetica").fontSize(9);
      const contratadaH = doc.heightOfString(contratadaFullText, { width: W, lineGap: 3 });
      if (contratadaH + 15 <= CONTENT_BOTTOM - y) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK).text("CONTRATADA: ", LM, y, { continued: true, width: W });
        doc.font("Helvetica").fontSize(9).fillColor(GRAY)
          .text("TORRES VIGILÂNCIA PATRIMONIAL LTDA. Pessoa jurídica de direito privado, inscrita no CNPJ/MF sob nº 36.982.392/0001-89, com sede fiscal em São Paulo/SP.", { width: W, lineGap: 3, align: "justify" });
        y += contratadaH + 12;
      } else {
        checkPage(40);
        y = safeText(contratadaFullText, LM, y, { font: "Helvetica", size: 9 });
        y += 12;
      }

      checkPage(30);
      writeText("As partes, acima nomeadas e qualificadas, têm entre si como justo e acordado o presente Contrato de Prestação de Serviços de Escolta Armada, que se regerão pelos termos, cláusulas, obrigações e condições adiante articuladas:");

      clauseTitle(1, "Do Objeto");
      writeText(`A CONTRATADA prestará à CONTRATANTE os serviços especializados de Escolta Armada, através do acompanhamento ostensivo de caminhões e veículos de carga, denominados auto cargas, que transportam mercadorias consideradas de alto risco, quanto a roubos e furtos, conforme discriminação contida no Quadro Resumo, que fica fazendo parte integrante deste instrumento.`);
      subItem("1.1", "A segurança será realizada através do acompanhamento ostensivo de caminhões e veículos de carga, em vias públicas em geral, contando com o apoio de Viaturas de Escolta, devidamente identificadas com o brasão da CONTRATADA, equipadas com sistema de rádio comunicação e dotadas de 04 (quatro) portas, podendo ser inclusive rastreadas via satélite.");
      subItem("1.2", "Os serviços de Escolta Armada serão prestados por vigilantes identificados através de crachá de identificação, treinados, uniformizados, armados e munidos de equipamentos e materiais indispensáveis à execução dos serviços, definidos e discriminados na Cláusula 6 abaixo, obedecida a legislação vigente e as tratativas entre as partes.");

      clauseTitle(2, "Do Quadro Resumo");
      writeText("As partes acordam que o Quadro Resumo, parte integrante do presente instrumento, definirá todos os aspectos operacionais, técnicos e financeiros dos serviços a serem prestados pela CONTRATADA à CONTRATANTE.");

      if (priceTable) {
        checkPage(200);
        y += 5;
        const priceRows = [
          ["KM Carregado", `R$ ${Number(priceTable.valor_km_carregado || 0).toFixed(2)} / km`],
          ["KM Vazio", `R$ ${Number(priceTable.valor_km_vazio || 0).toFixed(2)} / km`],
          ["Franquia Mínima", `${Number(priceTable.franquia_minima_km || 0)} km`],
          ["Hora Estadia", `R$ ${Number(priceTable.valor_hora_estadia || 0).toFixed(2)} / hora`],
          ["Diária / Pernoite", `R$ ${Number(priceTable.valor_diaria || 0).toFixed(2)}`],
          ["VRP Base", `R$ ${Number(priceTable.vrp_base || 0).toFixed(2)}`],
          ["Adic. Noturno (VRP)", `${Number(priceTable.adicional_noturno_vrp_pct || 0)}%`],
          ["Adic. Noturno (KM)", `${Number(priceTable.adicional_noturno_km_pct || 0)}%`],
          ["Periculosidade", `${Number(priceTable.adicional_periculosidade_pct || 0)}%`],
        ];
        doc.save().rect(LM, y, W, 18).fill("#222222").restore();
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff").text("QUADRO RESUMO – VALORES", LM + 10, y + 4, { width: W - 20, align: "center", lineBreak: false });
        y += 20;
        priceRows.forEach(([label, value], i) => {
          checkPage(20);
          if (i % 2 === 0) doc.save().rect(LM, y - 2, W, 18).fill("#f5f5f5").restore();
          doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text(label, LM + 10, y + 2, { width: 200, lineBreak: false });
          doc.font("Helvetica").fontSize(8.5).fillColor(DARK).text(value, LM + 220, y + 2, { width: 230, lineBreak: false });
          y += 18;
        });
        y += 10;
      }

      clauseTitle(3, "Dos Documentos Integrantes");
      writeText("Para melhor caracterização do objeto deste CONTRATO, bem como para definir procedimentos decorrentes das obrigações ora contraídos, integram este instrumento, como se nele estivessem transcritos, os dispositivos pertinentes às normas de segurança; as atas; as correspondências entre as partes, às trocadas e as futuras, e, mais, os documentos técnicos dos serviços solicitados.");

      clauseTitle(4, "Das Alterações dos Serviços");
      writeText("Os serviços prestados poderão sofrer alterações, desde que, antecipadamente, sejam submetidos à análise da CONTRATANTE, através de correspondência própria enviada pela CONTRATADA, levando-se em conta que tais alterações ocorram para melhor adequá-los em razão de operacionalidade e/ou prioridades.");

      clauseTitle(5, "Da Individualização dos Serviços");
      writeText("Os serviços a serem prestados pela CONTRATADA à CONTRATANTE estão descritos e individualizados no Quadro Resumo anexo, que faz parte integrante deste instrumento.");

      clauseTitle(6, "Dos Vigilantes, Do Armamento e Dos Equipamentos Indispensáveis à Execução dos Serviços");
      writeText("Os vigilantes, o armamento e os equipamentos indispensáveis à execução dos serviços de Escolta Armada serão fornecidos pela contratada, sendo todos de sua responsabilidade e patrimônio.");
      subItem("6.1", `A contratada disponibilizará ${sc.num_vigilantes ? String(sc.num_vigilantes).padStart(2, '0') + ` (${['Zero','Um','Dois','Três','Quatro','Cinco'][sc.num_vigilantes] || sc.num_vigilantes})` : "02 (Dois)"} Vigilantes de Escolta Armada por operação.`);
      subItem("6.2", "A contratada disponibilizará para cada operação:");
      subItem("6.2.1", "01 (um) Revólver Calibre 38 de 5 (cinco) ou de 6 (seis) tiros;");
      subItem("6.2.2", "01 (uma) Espingarda Calibre 12 Pistol Grip, tipo Pump ou similar;");
      subItem("6.2.3", "12 (doze) cartuchos de munição calibre 38, sendo 6 (seis) cartuchos empregados no municiamento da arma e 6 (seis) no carregador adicional;");
      subItem("6.2.4", "02 (dois) Coletes à prova de bala nível II-A;");
      subItem("6.2.5", "14 (quatorze) Cartuchos de munição calibre 12, sendo 07 (sete) empregados no municiamento da arma e 07 (sete) armazenados em estojo para municiamento adicional;");
      subItem("6.2.6", "01 (um) Rádio transceptor para comunicação entre a equipe, a base e se for o caso entre a contratante;");
      subItem("6.2.7", "01 (um) veículo (viatura) de passageiros com capacidade para 5 (cinco) ocupantes, motor 1.0 ou superior, com 4 (quatro) portas, preferencialmente com menos de 2 (dois) anos de uso e/ou fabricação, devidamente identificada com o brasão da empresa e demais elementos de identificação de escolta armada e contatos da empresa, equipado com sistema de rastreamento de veículo tipo satelital e com 2 (dois) botões de pânico a ser acionado em casos de emergências e/ou ocorrências durante a operação;");
      subItem("6.3", "A contratada fornecerá a seus funcionários envolvidos na prestação dos serviços conjuntos completos de uniforme, sendo capote, calça terbrim cor preta, camisa terbrim cor preta com brasão de identificação, boina feltro preta, coturnos de cano de lona preta, cordão fiel, coldre de arma com cinto modelo robocop, cinto de lona para calças e capa de colete.");

      clauseTitle(7, "Do Prazo de Vigência");
      if (sc.vigencia_tipo === "determinado") {
        const fmtDate = (d: string | null) => d ? new Date(d + "T12:00").toLocaleDateString("pt-BR") : "___/___/______";
        writeText(`O prazo de vigência deste contrato é de ${fmtDate(sc.vigencia_inicio)} a ${fmtDate(sc.vigencia_fim)}, sendo que, qualquer das partes poderá rescindi-lo, a qualquer momento, desde que, notifique a outra, com prévia antecedência de ${avisoPrevioDias} (${avisoPrevioDias === 30 ? "trinta" : avisoPrevioDias}) dias.`);
      } else {
        writeText(`O prazo de vigência deste contrato é por tempo indeterminado, sendo que, qualquer das partes poderá rescindi-lo, a qualquer momento, desde que, notifique a outra, com prévia antecedência de ${avisoPrevioDias} (${avisoPrevioDias === 30 ? "trinta" : avisoPrevioDias}) dias.`);
      }

      clauseTitle(8, "Do Preço");
      writeText("Os valores inerentes às operações de Escolta Armada serão cobrados conforme o destino da missão, o tempo do deslocamento, os pernoites e os serviços de preservação, podendo estas ser Urbanas ou Rodoviárias dentro da Região da Grande São Paulo ou Operações Estaduais ou Interestaduais, desde que estas se iniciem no Estado de São Paulo; de forma tal que a cada evento de escolta será tratado individualmente e seus custos previamente acordados, sendo estes, descritos no Anexo I.");
      subItem("8.1", "O valor dos serviços contratados será pago nas datas, condições e periodicidade constantes da Cláusula 9, abaixo.");
      subItem("8.2", "A CONTRATANTE será considerada inadimplente, caso deixe de pagar, na data de vencimento normal da obrigação, o valor dos serviços prestados, constituindo tal fato motivo justo para a rescisão contratual pela CONTRATADA, cabendo ainda a esta o direito de cobrar seu crédito, com os acréscimos constantes do item seguinte.");
      subItem("8.3", "No preço do serviço ajustado não estão computados qualquer expectativa inflacionária, razão pela qual sobre os pagamentos vincendos não se aplicarão qualquer índice deflacionário e/ou congelamento e/ou restrições de atualização monetária, tais como, exemplificativamente, tablitas, deflatores, planos econômicos de governo etc.");

      clauseTitle(9, "Do Faturamento dos Serviços e Forma de Pagamento");
      writeText("O pagamento será efetuado pela CONTRATANTE à CONTRATADA posterior a execução do serviço prestado, conforme acordado entre as partes.");
      subItem("9.1", "Os serviços que ultrapassarem a carga horária contratada, ou seja, o tempo predeterminado por missão será cobrado horas adicionais, com o valor acordado entre as partes, da mesma forma os serviços que ultrapassarem a quilometragem contratada, ou seja, a distância predeterminada por missão será cobrado quilômetros adicionais, com o valor acordado entre as partes, conforme ANEXO I; ficando avençado que os valores correspondentes à prestação destes serviços serão totalizados e faturados conforme caput da Cláusula 9 deste contrato.");

      clauseTitle(10, "Da Alteração de Preços");
      subItem("10.1", `Os preços estabelecidos no presente contrato serão atualizados por eventuais aumentos advindos de custos setoriais, equipamentos, materiais e, especialmente, aqueles relacionados com os reajustes dos empregados da CONTRATADA, provenientes de Acordo ou Dissídio Coletivo da Categoria, bem como novos encargos, taxas ou tributos criados pelo Poder Público Federal, Estadual ou Municipal, que impactem a planilha de composição de preços da CONTRATADA, ensejarão uma atualização dos preços contratuais, mediante prévia comunicação escrita da CONTRATADA à CONTRATANTE e mediante prévio acordo entre as partes.`);
      subItem("10.2", "Fica previamente acordado entre as partes que, caso ocorra uma elevação desproporcional dos índices de custeio deste contrato, em função de reajustes dos custos diretos e indiretos, haverá uma negociação entre as partes, visando a readequação dos preços contratuais, a fim de que se recomponha o equilíbrio econômico-financeiro do contrato.");

      clauseTitle(11, "Da Rescisão Contratual");
      subItem("11.1", `O presente contrato poderá ser rescindido, sem a incidência de multa, por qualquer das partes, mediante prévio aviso, por escrito, com antecedência mínima de ${avisoPrevioDias} (${avisoPrevioDias === 30 ? "trinta" : avisoPrevioDias}) dias, contados da data em que a outra parte receber a aludida comunicação, devidamente protocolizada.`);

      clauseTitle(12, "Da Responsabilidade das Partes");
      writeText("A CONTRATADA é responsável, direta e exclusiva, pela execução integral dos serviços objeto do presente contrato, bem como por eventuais danos, que por si, seus prepostos, empregados, por dolo ou culpa, causarem à CONTRATANTE, desde que devidamente comprovados e comunicados por escrito, pela CONTRATANTE à CONTRATADA, até o segundo dia útil posterior à ocorrência.");
      subItem("12.1", "A CONTRATADA compromete-se a utilizar, na prestação dos serviços, profissionais previamente selecionados, sem antecedentes criminais e político-sociais, bem como profissionais que melhor se adaptem às características exigidas pela CONTRATANTE.");
      subItem("12.2", "Os serviços de escolta armada serão prestados por vigilantes treinados, uniformizados, equipados e armados, sempre de comum acordo entre as partes e em conformidade com a Lei nº 7.102, de 20/06/83 e a Lei nº 9.017, de 30/03/95.");
      subItem("12.3", "A CONTRATADA fica assegurada no direito de promover substituições, quando necessário, de vigilantes e outros elementos destacados para os serviços aqui descritos e contratado sendo dever da CONTRATADA, promover a substituição imediatamente após comunicação por escrito da CONTRATANTE, qualquer de seus empregados ou prepostos cuja permanência nos locais de prestação de serviço for julgada inconveniente.");
      subItem("12.4", "A CONTRATADA não será responsável por eventos decorrentes de deficiência operacional, se esta for proveniente de alterações de ordens ou rotinas dadas unilateralmente pela CONTRATANTE aos vigilantes e prepostos da CONTRATADA.");
      subItem("12.5", "Fica entendido entre as partes contratantes que, ao vigilante, não se deve dar incumbência fora de suas atividades específicas.");
      subItem("12.6", "A CONTRATADA manterá um serviço de inspeção de seus vigilantes e prepostos, verificando periodicamente, o andamento dos serviços e procedimentos de segurança, sem que isto implique em quaisquer ônus ou acréscimo no preço pago pela CONTRATANTE.");

      clauseTitle(13, "Dos Ressarcimentos e Reembolsos");
      writeText("Correrão por conta exclusiva da CONTRATANTE, todas as despesas referentes a pedágios em estradas estaduais e federais, bem como estadias e despesas em viagens, quando as mesmas forem decorrentes de despesas extraordinárias para os serviços previamente acordados, desde que as mesmas sejam devidamente autorizadas pela CONTRATANTE, devendo, referidas despesas, ser ressarcidas ou reembolsadas, mediante a apresentação, por parte da CONTRATADA, dos respectivos comprovantes e/ou notas fiscais referentes aos desembolsos.");

      clauseTitle(14, "Das Omissões do Contrato");
      writeText("Quaisquer fatos ou casos omissos no presente contrato não ensejarão a sua rescisão.");
      subItem("14.1", "O presente contrato obriga as partes, por si, seus herdeiros e sucessores, a qualquer título.");
      subItem("14.2", "Qualquer alteração ou modificação às cláusulas e condições deste contrato somente será válida se feita por documento escrito, assinado pelas partes e testemunhas, que se constituirá em aditivo ao presente.");

      clauseTitle(15, "Da Exclusão do Vínculo Empregatício");
      writeText("O presente contrato, em razão do seu objetivo e natureza, não gera para a CONTRATANTE, em relação aos empregados e prepostos da CONTRATADA, qualquer vínculo de natureza trabalhista e/ou previdenciária, respondendo exclusivamente a CONTRATADA por toda e qualquer ação trabalhista e/ou indenizatória por eles propostas, bem como pelo resultado delas.");

      clauseTitle(16, "Das Disposições Gerais");
      subItem("16.1", "A CONTRATADA somente será responsável pela prestação dos serviços objeto deste contrato, não podendo garantir a inocorrência de fatos delituosos contra o patrimônio da CONTRATANTE ou de terceiros, nem responder pelo desaparecimento, furto, roubo, dano ou destruição de quaisquer bens, cargas ou objetos de propriedade da CONTRATANTE ou de terceiros ou por qualquer outro dano ou prejuízo que venha a ser causado à CONTRATANTE ou a terceiros que não tenha sido causado diretamente pelos funcionários e/ou preposto da CONTRATADA.");
      subItem("16.2", "Fica convencionado que a CONTRATADA, em relação aos seus funcionários alocados na CONTRATANTE, se responsabiliza por quaisquer ônus decorrentes de fiscalizações realizadas pelo Ministério do Trabalho e do Emprego, através das Delegacias Regionais do Trabalho, tais como notificações para apresentação de documentos, registros de empregados, esclarecimentos, e outros que forem pertinentes à situação, além da apresentação de defesas e recursos administrativos decorrentes de autuações fiscais, com o necessário pagamento das multas administrativas impostas.");
      subItem("16.3", 'É vedado a qualquer das partes utilizar o presente objeto contratual em garantias para transações bancárias e/ou financeiras de qualquer espécie, efetuar operação de desconto, negociar, repassar ou de qualquer forma ceder os créditos decorrentes da execução desse a Bancos, empresas de "factoring" ou terceiros, sem prévia autorização por escrito da outra parte.');
      subItem("16.4", "Ficam desde já convencionados que o presente contrato não irá configurar nenhum outro direito para as partes, além da prestação dos serviços supramencionados, devendo este contrato ser interpretado sob o ponto de vista restritivo, de modo a não permitir qualquer interpretação diferente da objetivada pelas partes.");
      subItem("16.5", "Eventual tolerância de uma parte a infrações ou descumprimento das condições estipuladas no presente contrato, cometidas pela outra parte, será tida como ato de mera liberalidade, não se constituindo em perdão, precedente, novação ou renúncia a direitos que a legislação ou o contrato assegurem às partes.");
      subItem("16.6", "A assinatura do presente contrato representa a aceitação de todas as disposições nele contidas, prevalecendo sobre todas as tratativas e entendimentos mantidos anteriormente entre as partes.");
      subItem("16.7", "Se qualquer cláusula ou dispositivo deste contrato for considerado nulo ou sem efeito, no todo ou em parte, as demais deverão permanecer válidas e serão interpretadas de forma a preservar sua validade.");
      subItem("16.8", "O presente contrato expressa todos os acordos e condições estipulados pelas partes com relação ao objeto contrato, substituindo todos os eventuais contratos e seus anexos anteriormente firmados entre elas, os quais neste ato são tidos como rescindidos ofertando-se as partes mútua quitação para nada mais reclamar.");

      clauseTitle(17, "Do Sigilo");
      writeText("Toda e qualquer informação relativa ao objeto do presente será sempre considerada sigilosa e confidencial, ficando expressamente vedado à CONTRATADA, bem como aos seus empregados ou prepostos, delas dar conhecimento a terceiros não autorizados, sob pena de responsabilização civil e criminal.");

      clauseTitle(18, "Do Foro");
      writeText("As partes elegem o Foro Central de São Paulo – SP para dirimir eventuais dúvidas ou divergências que as partes venham a ter com relação ao presente contrato. E, por estarem assim ajustadas, declaram as partes aceitar as disposições estabelecidas nas cláusulas do presente contrato, que, após lido e achado conforme, vai assinado pelos representantes legais das partes e pelas testemunhas abaixo.");

      y += 10;
      checkPage(30);
      const fmtDateSig = (d: string | null) => d ? new Date(d + "T12:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      doc.font("Helvetica").fontSize(9).fillColor(DARK).text(`São Paulo, ${fmtDateSig(sc.data_assinatura)}.`, LM, y, { width: W, align: "center", lineBreak: false });
      y += 35;

      const SIG_BLOCK_H = 220;
      if (y + SIG_BLOCK_H > CONTENT_BOTTOM) { startNewPage(); }
      y += 15;
      const sigW = W / 2 - 20;
      const sigY = y;
      const SIG_LINE_OFFSET = 70;

      doc.save().rect(LM, sigY, sigW, 3).fill(BRAND).restore();
      doc.save().moveTo(LM, sigY + SIG_LINE_OFFSET).lineTo(LM + sigW, sigY + SIG_LINE_OFFSET).lineWidth(0.5).strokeColor(ACCENT_LINE).stroke().restore();
      doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK).text("CONTRATADA", LM, sigY + SIG_LINE_OFFSET + 6, { width: sigW, align: "center", lineBreak: false });
      doc.font("Helvetica").fontSize(8).fillColor(GRAY).text("TORRES VIGILÂNCIA PATRIMONIAL LTDA", LM, sigY + SIG_LINE_OFFSET + 20, { width: sigW, align: "center", lineBreak: false });
      doc.font("Helvetica").fontSize(7).fillColor(LIGHT).text("CNPJ: 36.982.392/0001-89", LM, sigY + SIG_LINE_OFFSET + 33, { width: sigW, align: "center", lineBreak: false });

      const sig2X = LM + sigW + 40;
      doc.save().rect(sig2X, sigY, sigW, 3).fill(BRAND).restore();
      doc.save().moveTo(sig2X, sigY + SIG_LINE_OFFSET).lineTo(sig2X + sigW, sigY + SIG_LINE_OFFSET).lineWidth(0.5).strokeColor(ACCENT_LINE).stroke().restore();
      doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK).text("CONTRATANTE", sig2X, sigY + SIG_LINE_OFFSET + 6, { width: sigW, align: "center", lineBreak: false });
      const contratanteNomeFontSize = contratanteNome.length > 50 ? 5.5 : contratanteNome.length > 35 ? 6.5 : 8;
      doc.font("Helvetica").fontSize(contratanteNomeFontSize).fillColor(GRAY).text(contratanteNome, sig2X, sigY + SIG_LINE_OFFSET + 20, { width: sigW, align: "center", lineBreak: true });
      doc.font("Helvetica").fontSize(7).fillColor(LIGHT).text(`CNPJ: ${contratanteCnpj}`, sig2X, sigY + SIG_LINE_OFFSET + 35, { width: sigW, align: "center", lineBreak: false });

      y = sigY + SIG_LINE_OFFSET + 55;

      doc.save().rect(LM, y - 2, W, 18).fill(BRAND_ACCENT).restore();
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff").text("TESTEMUNHAS", LM + 8, y + 2, { width: W - 16, lineBreak: false });
      y += 24;

      const drawWitness = (num: number, rg: string, cpf: string) => {
        checkPage(60);
        doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text(`Testemunha ${num}:`, LM, y, { lineBreak: false });
        y += 14;
        doc.save().moveTo(LM, y + 12).lineTo(LM + W, y + 12).lineWidth(0.4).strokeColor("#cccccc").stroke().restore();
        y += 18;
        doc.font("Helvetica-Bold").fontSize(7).fillColor(LIGHT).text("RG:", LM, y, { lineBreak: false });
        doc.font("Helvetica").fontSize(8).fillColor(DARK).text(rg || "______________________", LM + 20, y, { lineBreak: false });
        doc.font("Helvetica-Bold").fontSize(7).fillColor(LIGHT).text("CPF:", LM + W / 2, y, { lineBreak: false });
        doc.font("Helvetica").fontSize(8).fillColor(DARK).text(cpf || "______________________", LM + W / 2 + 25, y, { lineBreak: false });
        y += 25;
      };

      drawWitness(1, sc.testemunha1_rg || "", sc.testemunha1_cpf || "");
      drawWitness(2, sc.testemunha2_rg || "", sc.testemunha2_cpf || "");

      doc.end();
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ message: err.message });
      } else {
        res.end();
      }
    }
  });

  // Client Billing Report (monthly)
  app.get("/api/escort/relatorio/:clientId", requireAuth, async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { data: billings, error } = await supabaseAdmin.from("escort_billings").select("*")
        .eq("client_id", clientId).gte("created_at", startOfMonth).lte("created_at", endOfMonth)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const items = billings || [];
      const totais = {
        total_missoes: items.length,
        total_km: items.reduce((a: number, b: any) => a + Number(b.km_total || 0), 0),
        total_faturamento: items.reduce((a: number, b: any) => a + Number(b.fat_total || 0), 0),
        total_pagamento_operacional: items.reduce((a: number, b: any) => a + Number(b.pag_total || 0), 0),
        total_pedagio: items.reduce((a: number, b: any) => a + Number(b.despesas_pedagio || 0), 0),
        total_combustivel: items.reduce((a: number, b: any) => a + Number(b.despesas_combustivel || 0), 0),
        lucro_bruto: 0,
        missoes_noturnas: items.filter((b: any) => b.is_noturno).length,
        periodo: `${now.toLocaleString("pt-BR", { month: "long", year: "numeric" })}`,
      };
      totais.lucro_bruto = Math.round((totais.total_faturamento - totais.total_pagamento_operacional) * 100) / 100;

      const { data: client } = await supabaseAdmin.from("clients").select("name").eq("id", clientId).single();

      res.json({
        client_name: client?.name || `Cliente #${clientId}`,
        periodo: totais.periodo,
        totais,
        missoes: items,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/company-documents", requireAuth, async (_req, res) => {
    try {
      const docs = await db.select({
        id: companyDocuments.id,
        docType: companyDocuments.docType,
        label: companyDocuments.label,
        fileName: companyDocuments.fileName,
        mimeType: companyDocuments.mimeType,
        uploadedAt: companyDocuments.uploadedAt,
      }).from(companyDocuments).orderBy(companyDocuments.docType);
      res.json(docs);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/company-documents", requireAuth, async (req, res) => {
    try {
      const { docType, label, fileName, fileData, mimeType } = req.body;
      if (!docType || !fileName || !fileData || !mimeType) return res.status(400).json({ message: "Campos obrigatórios ausentes" });
      const existing = await db.select().from(companyDocuments).where(eq(companyDocuments.docType, docType));
      if (existing.length > 0) {
        await db.update(companyDocuments).set({ label, fileName, fileData, mimeType }).where(eq(companyDocuments.docType, docType));
      } else {
        await db.insert(companyDocuments).values({ docType, label, fileName, fileData, mimeType });
      }
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/company-documents/:docType", requireAuth, requireDiretoria, async (req, res) => {
    try {
      await db.delete(companyDocuments).where(eq(companyDocuments.docType, req.params.docType));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/homologation-logs/:clientId", requireAuth, async (req, res) => {
    try {
      const logs = await db.select().from(homologationLogs)
        .where(eq(homologationLogs.clientId, Number(req.params.clientId)))
        .orderBy(desc(homologationLogs.sentAt));
      res.json(logs);
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
        ? await db.select().from(companyDocuments).where(
            sql`${companyDocuments.docType} IN (${sql.join(documentTypes.map((d: string) => sql`${d}`), sql`, `)})`
          )
        : [];

      const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
      const docLabels: string[] = [];

      for (const doc of docs) {
        const base64Match = doc.fileData.match(/^data:[^;]+;base64,(.+)$/);
        const base64Data = base64Match ? base64Match[1] : doc.fileData;
        attachments.push({
          filename: doc.fileName,
          content: Buffer.from(base64Data, "base64"),
          contentType: doc.mimeType,
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

      await db.insert(homologationLogs).values({
        clientId,
        clientName: clientName || null,
        recipientEmail,
        recipientName: recipientName || null,
        documentsSent: docLabels,
        sentBy: sentBy || null,
        status: "enviado",
      });

      res.json({ success: true, message: "E-mail enviado com sucesso" });
    } catch (err: any) {
      console.error("Erro ao enviar e-mail de homologação:", err);
      res.status(500).json({ message: `Erro ao enviar e-mail: ${err.message}` });
    }
  });

  // ─── MOBILE: Folha de Ponto (Clock In/Out with photo + GPS) ──────────
  const HQ_LAT = -23.4827;
  const HQ_LNG = -46.7346;
  const HQ_RADIUS_METERS = 500;

  function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  app.get("/api/mobile/ponto/today", requireAuth, async (req: any, res) => {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) return res.json(null);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const rows = await db.select().from(employeeTimesheets)
        .where(and(
          eq(employeeTimesheets.employeeId, employeeId),
          gte(employeeTimesheets.date, today),
          lte(employeeTimesheets.date, tomorrow),
        )).limit(1);
      res.json(rows[0] || null);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/mobile/ponto/clock", requireAuth, async (req: any, res) => {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) return res.status(400).json({ message: "Funcionário não identificado" });
      const { action, photo, latitude, longitude, address } = req.body;
      if (!action) return res.status(400).json({ message: "Ação obrigatória" });
      if (!photo || typeof photo !== "string" || !photo.startsWith("data:image/")) return res.status(400).json({ message: "Foto obrigatória (formato inválido)" });
      if (photo.length > 5 * 1024 * 1024) return res.status(400).json({ message: "Foto excede 5MB" });

      const now = new Date();
      const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const existing = await db.select().from(employeeTimesheets)
        .where(and(
          eq(employeeTimesheets.employeeId, employeeId),
          gte(employeeTimesheets.date, today),
          lte(employeeTimesheets.date, tomorrow),
        )).limit(1);

      const record = existing[0];
      if (action === "clock_in") {
        if (record?.clockIn) return res.status(400).json({ message: "Entrada já registrada hoje" });
        if (!latitude || !longitude) return res.status(400).json({ message: "Localizacao obrigatoria para bater o ponto de entrada" });
        const parsedLat = parseFloat(latitude);
        const parsedLng = parseFloat(longitude);
        if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng) || parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
          return res.status(400).json({ message: "Coordenadas de localizacao invalidas" });
        }
        const distToHQ = haversineMeters(parsedLat, parsedLng, HQ_LAT, HQ_LNG);
        if (distToHQ > HQ_RADIUS_METERS) {
          return res.status(403).json({
            message: `Voce nao esta na sede da empresa. Distancia: ${Math.round(distToHQ)}m (maximo ${HQ_RADIUS_METERS}m). Dirija-se a Av. Raimundo Pereira de Magalhaes, 5720 - Pirituba, SP.`,
            code: "GEOFENCE_BLOCKED",
            distance: Math.round(distToHQ),
          });
        }
        if (record) {
          const [updated] = await db.update(employeeTimesheets)
            .set({ clockIn: timeStr, clockInPhoto: photo, clockInLat: latitude, clockInLng: longitude, clockInAddress: address || null })
            .where(eq(employeeTimesheets.id, record.id)).returning();
          return res.json(updated);
        }
        const [created] = await db.insert(employeeTimesheets).values({
          employeeId, date: now,
          clockIn: timeStr, clockInPhoto: photo, clockInLat: latitude, clockInLng: longitude, clockInAddress: address || null,
        }).returning();
        return res.json(created);
      }
      if (!record) return res.status(400).json({ message: "Registre a entrada primeiro" });

      if (!latitude || !longitude) return res.status(400).json({ message: "Localização obrigatória para registrar o ponto" });
      const pLat = parseFloat(latitude);
      const pLng = parseFloat(longitude);
      if (!Number.isFinite(pLat) || !Number.isFinite(pLng) || pLat < -90 || pLat > 90 || pLng < -180 || pLng > 180) {
        return res.status(400).json({ message: "Coordenadas de localização inválidas" });
      }

      const updateMap: Record<string, any> = {
        lunch_out: { lunchOut: timeStr, lunchOutPhoto: photo, lunchOutLat: latitude, lunchOutLng: longitude, lunchOutAddress: address || null },
        lunch_in: { lunchIn: timeStr, lunchInPhoto: photo, lunchInLat: latitude, lunchInLng: longitude, lunchInAddress: address || null },
        clock_out: { clockOut: timeStr, clockOutPhoto: photo, clockOutLat: latitude, clockOutLng: longitude, clockOutAddress: address || null },
      };
      const updates = updateMap[action];
      if (!updates) return res.status(400).json({ message: "Ação inválida" });

      if (action === "lunch_out" && record.lunchOut) return res.status(400).json({ message: "Saída almoço já registrada" });
      if (action === "lunch_in" && !record.lunchOut) return res.status(400).json({ message: "Registre a saída almoço primeiro" });
      if (action === "lunch_in" && record.lunchIn) return res.status(400).json({ message: "Retorno almoço já registrado" });
      if (action === "clock_out" && record.clockOut) return res.status(400).json({ message: "Saída já registrada" });

      const [updated] = await db.update(employeeTimesheets)
        .set(updates)
        .where(eq(employeeTimesheets.id, record.id)).returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/employees/:id/ponto-detalhado/:timesheetId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const empId = Number(req.params.id);
      const ts = await db.select().from(employeeTimesheets).where(and(eq(employeeTimesheets.id, Number(req.params.timesheetId)), eq(employeeTimesheets.employeeId, empId))).limit(1);
      if (!ts[0]) return res.status(404).json({ message: "Registro nao encontrado" });
      const record = ts[0];

      const employee = await storage.getEmployee(empId);

      const checkLocation = (lat: string | null, lng: string | null) => {
        if (!lat || !lng) return { lat: null, lng: null, distance: null, atHQ: false, atHome: false };
        const la = parseFloat(lat), lo = parseFloat(lng);
        const distHQ = haversineMeters(la, lo, HQ_LAT, HQ_LNG);
        let distHome: number | null = null;
        let atHome = false;
        if (employee && (employee as any).addressLat && (employee as any).addressLng) {
          distHome = haversineMeters(la, lo, parseFloat((employee as any).addressLat), parseFloat((employee as any).addressLng));
          atHome = distHome <= 500;
        }
        return { lat: la, lng: lo, distance: Math.round(distHQ), atHQ: distHQ <= HQ_RADIUS_METERS, atHome, distHome: distHome !== null ? Math.round(distHome) : null };
      };

      res.json({
        ...record,
        employeeName: employee?.name || "--",
        employeeAddress: employee?.address || null,
        clockInGeo: checkLocation(record.clockInLat, record.clockInLng),
        clockOutGeo: checkLocation(record.clockOutLat, record.clockOutLng),
        lunchOutGeo: checkLocation(record.lunchOutLat, record.lunchOutLng),
        lunchInGeo: checkLocation(record.lunchInLat, record.lunchInLng),
        hqAddress: "Av. Raimundo Pereira de Magalhaes, 5720 - Pirituba, SP",
        hqRadius: HQ_RADIUS_METERS,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── MOBILE: Abastecimento ──────────────────────────────────────────
  app.get("/api/mobile/abastecimento/vehicles", requireAuth, async (req: any, res) => {
    try {
      const allVehicles = await db.execute(sql`
        SELECT id, plate, model, km, last_oil_change_km, frota
        FROM vehicles
        WHERE status IS NULL OR status NOT IN ('inativo', 'vendido', 'baixado')
        ORDER BY plate ASC
      `);
      res.json(allVehicles.rows || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/mobile/abastecimento/vehicle", requireAuth, async (req: any, res) => {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) return res.json(null);
      const assignments = await db.execute(sql`
        SELECT v.id, v.plate, v.model, v.km, v.last_oil_change_km
        FROM vehicle_assignments va
        JOIN vehicles v ON v.id = va.vehicle_id
        WHERE va.employee_id = ${employeeId}
        ORDER BY va.created_at DESC
        LIMIT 1
      `);
      res.json(assignments.rows?.[0] || null);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/mobile/abastecimento", requireAuth, async (req: any, res) => {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) return res.status(400).json({ message: "Funcionário não identificado" });
      const { vehicleId, km, liters, costPerLiter, totalCost, fuelType, station, receiptPhoto, pumpPhoto, odometerPhoto, platePhoto, latitude, longitude, address } = req.body;
      if (!vehicleId || !km) return res.status(400).json({ message: "Veículo e KM obrigatórios" });
      if (!receiptPhoto || typeof receiptPhoto !== "string" || !receiptPhoto.startsWith("data:image/")) return res.status(400).json({ message: "Foto da NF obrigatória (formato inválido)" });
      if (!pumpPhoto || typeof pumpPhoto !== "string" || !pumpPhoto.startsWith("data:image/")) return res.status(400).json({ message: "Foto da bomba obrigatória (formato inválido)" });
      if (!odometerPhoto || typeof odometerPhoto !== "string" || !odometerPhoto.startsWith("data:image/")) return res.status(400).json({ message: "Foto do hodômetro obrigatória (formato inválido)" });

      const vehicle = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
      if (!vehicle.length) return res.status(404).json({ message: "Veículo não encontrado" });
      if (vehicle[0] && km < (vehicle[0].km || 0)) {
        return res.status(400).json({ message: `KM informado (${km}) é menor que o KM atual (${vehicle[0].km})` });
      }

      const [fueling] = await db.insert(vehicleFueling).values({
        vehicleId, driverId: employeeId, date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        liters: liters?.toString() || "0", costPerLiter: costPerLiter?.toString(), totalCost: totalCost?.toString(),
        km, fuelType: fuelType || "gasolina", fullTank: true, station,
        receiptPhoto, pumpPhoto, odometerPhoto, platePhoto, latitude, longitude, address,
      }).returning();

      await db.update(vehicles).set({ km, lastKmUpdate: new Date() }).where(eq(vehicles.id, vehicleId));

      const oilKm = vehicle[0]?.lastOilChangeKm || 0;
      const kmSinceOil = km - oilKm;
      let oilAlert = null;
      if (oilKm > 0 && kmSinceOil >= 9000) {
        oilAlert = kmSinceOil >= 10000
          ? `ATENÇÃO: Troca de óleo VENCIDA! ${kmSinceOil.toLocaleString("pt-BR")} km desde última troca.`
          : `Aviso: Faltam ${(10000 - kmSinceOil).toLocaleString("pt-BR")} km para troca de óleo.`;
      }

      res.status(201).json({ fueling, oilAlert });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── MOBILE: Ocorrências ───────────────────────────────────────────
  app.get("/api/mobile/ocorrencias", requireAuth, async (req: any, res) => {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) return res.json([]);
      const rows = await db.select().from(employeeOccurrences)
        .where(eq(employeeOccurrences.employeeId, employeeId))
        .orderBy(desc(employeeOccurrences.createdAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/mobile/ocorrencias", requireAuth, async (req: any, res) => {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) return res.status(400).json({ message: "Funcionário não identificado" });
      const { type, description, photos, vehicleId, latitude, longitude } = req.body;
      if (!type || !description) return res.status(400).json({ message: "Tipo e descrição obrigatórios" });
      const validTypes = ["acidente", "quebra", "avaria", "manutencao", "seguranca", "outro"];
      if (!validTypes.includes(type)) return res.status(400).json({ message: "Tipo inválido" });
      const validPhotos = (photos || []).filter((p: any) => typeof p === "string" && p.startsWith("data:image/")).slice(0, 5);
      const [record] = await db.insert(employeeOccurrences).values({
        employeeId, vehicleId: vehicleId || null, type, description: description.substring(0, 2000),
        photos: validPhotos, latitude, longitude,
      }).returning();
      res.status(201).json(record);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── ADMIN: Ocorrências management ─────────────────────────────────
  app.get("/api/ocorrencias", requireAdminRole, async (_req, res) => {
    try {
      const rows = await db.select().from(employeeOccurrences).orderBy(desc(employeeOccurrences.createdAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/ocorrencias/:id", requireAdminRole, async (req, res) => {
    try {
      const { status, adminNotes } = req.body;
      const [updated] = await db.update(employeeOccurrences)
        .set({ ...(status && { status }), ...(adminNotes !== undefined && { adminNotes }) })
        .where(eq(employeeOccurrences.id, Number(req.params.id))).returning();
      if (!updated) return res.status(404).json({ message: "Ocorrência não encontrada" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Oil change alert check ─────────────────────────────────────────
  app.get("/api/mobile/oil-alert/:vehicleId", requireAuth, async (req, res) => {
    try {
      const v = await db.select().from(vehicles).where(eq(vehicles.id, Number(req.params.vehicleId))).limit(1);
      if (!v[0]) return res.json({ alert: null });
      const oilKm = v[0].lastOilChangeKm || 0;
      const currentKm = v[0].km || 0;
      if (oilKm === 0) return res.json({ alert: null, oilKm: 0, currentKm });
      const diff = currentKm - oilKm;
      let alert = null;
      if (diff >= 10000) alert = `Troca de óleo VENCIDA! ${diff.toLocaleString("pt-BR")} km desde última troca.`;
      else if (diff >= 9000) alert = `Faltam ${(10000 - diff).toLocaleString("pt-BR")} km para troca de óleo.`;
      res.json({ alert, oilKm, currentKm, kmSinceOil: diff });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Reference Points CRUD ──────────────────────────────────────────
  app.get("/api/reference-points", requireAuth, async (_req, res) => {
    try {
      const rows = await db.select().from(referencePoints).orderBy(referencePoints.name);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/reference-points", requireAuth, async (req, res) => {
    try {
      const parsed = insertReferencePointSchema.parse(req.body);
      const [row] = await db.insert(referencePoints).values(parsed).returning();
      res.json(row);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/reference-points/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, latitude, longitude, radiusMeters, color } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (latitude !== undefined) updates.latitude = latitude;
      if (longitude !== undefined) updates.longitude = longitude;
      if (radiusMeters !== undefined) updates.radiusMeters = radiusMeters;
      if (color !== undefined) updates.color = color;
      const [row] = await db.update(referencePoints).set(updates).where(eq(referencePoints.id, id)).returning();
      if (!row) return res.status(404).json({ message: "Ponto não encontrado" });
      res.json(row);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/reference-points/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await db.delete(referencePoints).where(eq(referencePoints.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ============== PONTO OPERACIONAL ==============

  app.get("/api/ponto-operacional/aberto", requireAuth, async (req: any, res) => {
    try {
      const empId = req.user!.employeeId;
      if (!empId) return res.json(null);
      const { data } = await supabaseAdmin.from("ponto_operacional")
        .select("*").eq("employee_id", empId).eq("status", "aberto").order("entrada", { ascending: false }).limit(1);
      res.json(data?.[0] || null);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/ponto-operacional/entrada", requireAuth, async (req: any, res) => {
    try {
      const empId = req.user!.employeeId;
      if (!empId) return res.status(400).json({ message: "Usuário não vinculado a funcionário" });
      const { data: open } = await supabaseAdmin.from("ponto_operacional")
        .select("id").eq("employee_id", empId).eq("status", "aberto").limit(1);
      if (open?.length) return res.status(409).json({ message: "Já existe um ponto em aberto. Finalize antes de abrir outro." });
      const emp = await storage.getEmployee(empId);
      const { data, error } = await supabaseAdmin.from("ponto_operacional").insert({
        employee_id: empId,
        employee_name: emp?.name || req.user!.name || "—",
        entrada: new Date().toISOString(),
        status: "aberto",
        observacao: req.body.observacao || null,
      }).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/ponto-operacional/saida", requireAuth, async (req: any, res) => {
    try {
      const empId = req.user!.employeeId;
      if (!empId) return res.status(400).json({ message: "Usuário não vinculado a funcionário" });
      const { data: open } = await supabaseAdmin.from("ponto_operacional")
        .select("*").eq("employee_id", empId).eq("status", "aberto").order("entrada", { ascending: false }).limit(1);
      if (!open?.length) return res.status(404).json({ message: "Nenhum ponto em aberto encontrado." });
      const ponto = open[0];
      const saida = new Date();
      const entrada = new Date(ponto.entrada);
      const diffMs = saida.getTime() - entrada.getTime();
      const horasDecimal = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
      const { data, error } = await supabaseAdmin.from("ponto_operacional").update({
        saida: saida.toISOString(),
        horas_decimal: horasDecimal,
        status: "fechado",
        observacao: req.body.observacao || ponto.observacao,
        updated_at: saida.toISOString(),
      }).eq("id", ponto.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/ponto-operacional/resumo-mensal", requireAuth, async (req: any, res) => {
    try {
      const isAdmin = req.user!.role === "admin" || req.user!.role === "diretoria";
      if (!isAdmin) return res.status(403).json({ message: "Acesso negado" });
      const mes = req.query.mes ? String(req.query.mes) : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
      const inicioMes = `${mes}-01T00:00:00-03:00`;
      const [y, m] = mes.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const fimMes = `${mes}-${String(lastDay).padStart(2, "0")}T23:59:59-03:00`;

      const { data: pontos } = await supabaseAdmin.from("ponto_operacional")
        .select("*").gte("entrada", inicioMes).lte("entrada", fimMes).order("entrada", { ascending: true });

      const { data: abertos } = await supabaseAdmin.from("ponto_operacional")
        .select("*").eq("status", "aberto");

      const allTimesheetsRaw = await storage.getTimesheets();
      const mesTimesheets = allTimesheetsRaw.filter((ts: any) => {
        const tsDate = ts.date ? new Date(ts.date).toISOString().slice(0, 7) : null;
        return tsDate === mes;
      });

      const allEmployees = await storage.getEmployees();
      const activeEmployees = allEmployees.filter((e: any) => e.status === "ativo" && (e.role?.toLowerCase().includes("vigilante") || e.role?.toLowerCase().includes("escolta")));

      const SALARIO_BASE = 2432.50;
      const LIMITE_HORAS = 220;
      const VALOR_HORA = +(SALARIO_BASE / LIMITE_HORAS).toFixed(2);

      const parseTimeToHours = (checkIn: string, checkOut: string, checkOutLunch?: string, checkInLunch?: string): number => {
        if (!checkIn || !checkOut) return 0;
        const [hi, mi] = checkIn.split(":").map(Number);
        const [ho, mo] = checkOut.split(":").map(Number);
        let startMin = hi * 60 + (mi || 0);
        let endMin = ho * 60 + (mo || 0);
        if (endMin <= startMin) endMin += 24 * 60;
        let worked = (endMin - startMin) / 60;
        if (checkOutLunch && checkInLunch) {
          const [loh, lom] = checkOutLunch.split(":").map(Number);
          const [lih, lim] = checkInLunch.split(":").map(Number);
          const lunchMin = (lih * 60 + (lim || 0)) - (loh * 60 + (lom || 0));
          if (lunchMin > 0) worked -= lunchMin / 60;
        }
        return Math.max(0, worked);
      };

      const resumo = activeEmployees.map((emp: any) => {
        const empPontos = (pontos || []).filter((p: any) => p.employee_id === emp.id);
        const empAberto = (abertos || []).find((p: any) => p.employee_id === emp.id && p.status === "aberto");
        const horasPontoOp = empPontos.reduce((acc: number, p: any) => acc + (Number(p.horas_decimal) || 0), 0);

        const empTimesheets = mesTimesheets.filter((ts: any) => ts.employeeId === emp.id);
        const nowBRT = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
        const todayDateStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        const horasTimesheet = empTimesheets.reduce((acc: number, ts: any) => {
          if (ts.hoursWorked != null && Number(ts.hoursWorked) > 0) return acc + Number(ts.hoursWorked);
          if (ts.checkOut && ts.checkOut.length > 0) return acc + parseTimeToHours(ts.checkIn, ts.checkOut, ts.checkOutLunch, ts.checkInLunch);
          if (ts.checkIn && (!ts.checkOut || ts.checkOut.length === 0)) {
            const tsDateStr = ts.date ? (typeof ts.date === "string" ? ts.date.slice(0, 10) : new Date(ts.date).toISOString().slice(0, 10)) : "";
            if (tsDateStr === todayDateStr) {
              return acc + parseTimeToHours(ts.checkIn, nowBRT);
            }
          }
          return acc;
        }, 0);

        const totalHoras = horasPontoOp + horasTimesheet;
        const jornadasPonto = empPontos.filter((p: any) => p.status === "fechado").length;
        const jornadasTimesheet = empTimesheets.filter((ts: any) => ts.checkOut && ts.checkOut.length > 0).length;
        const jornadasConcluidas = jornadasPonto + jornadasTimesheet;
        const horasExtras = Math.max(0, totalHoras - LIMITE_HORAS);
        const custoHoraExtra = +(horasExtras * VALOR_HORA * 1.5).toFixed(2);
        const bonusFuncionario = +(custoHoraExtra * 0.5).toFixed(2);
        const custoEmpresa = +(custoHoraExtra * 0.5).toFixed(2);

        const timesheetRegistros = empTimesheets.map((ts: any) => {
          let hours = 0;
          if (ts.hoursWorked != null && Number(ts.hoursWorked) > 0) {
            hours = Number(ts.hoursWorked);
          } else if (ts.checkOut && ts.checkOut.length > 0) {
            hours = parseTimeToHours(ts.checkIn, ts.checkOut, ts.checkOutLunch, ts.checkInLunch);
          } else if (ts.checkIn && (!ts.checkOut || ts.checkOut.length === 0)) {
            const tsDateStr2 = ts.date ? (typeof ts.date === "string" ? ts.date.slice(0, 10) : new Date(ts.date).toISOString().slice(0, 10)) : "";
            if (tsDateStr2 === todayDateStr) {
              hours = parseTimeToHours(ts.checkIn, nowBRT);
            }
          }
          const tsDate = new Date(ts.date);
          tsDate.setHours(
            ts.checkIn ? Number(ts.checkIn.split(":")[0]) : 8,
            ts.checkIn ? Number(ts.checkIn.split(":")[1] || 0) : 0
          );
          return {
            id: `ts-${ts.id}`,
            employee_id: emp.id,
            entrada: tsDate.toISOString(),
            saida: ts.checkOut ? (() => { const d = new Date(ts.date); d.setHours(Number(ts.checkOut.split(":")[0]), Number(ts.checkOut.split(":")[1] || 0)); return d.toISOString(); })() : null,
            horas_decimal: +hours.toFixed(2),
            status: ts.checkOut ? "fechado" : "aberto",
            origem: "folha_ponto",
          };
        });

        const allRegistros = [...empPontos.map((p: any) => ({ ...p, origem: p.origem || "ponto_operacional" })), ...timesheetRegistros];
        allRegistros.sort((a: any, b: any) => new Date(a.entrada).getTime() - new Date(b.entrada).getTime());

        const tsAberto = empTimesheets.find((ts: any) => !ts.checkOut || ts.checkOut.length === 0);
        const pontoAbertoFinal = empAberto
          ? { id: empAberto.id, entrada: empAberto.entrada }
          : tsAberto
            ? { id: `ts-${tsAberto.id}`, entrada: (() => { const d = new Date(tsAberto.date); d.setHours(Number((tsAberto.checkIn || "08:00").split(":")[0]), Number((tsAberto.checkIn || "08:00").split(":")[1] || 0)); return d.toISOString(); })() }
            : null;

        return {
          employeeId: emp.id,
          employeeName: emp.name,
          role: emp.role,
          totalHoras: +totalHoras.toFixed(2),
          horasPontoOp: +horasPontoOp.toFixed(2),
          horasTimesheet: +horasTimesheet.toFixed(2),
          jornadasConcluidas,
          limiteHoras: LIMITE_HORAS,
          horasExtras: +horasExtras.toFixed(2),
          custoHoraExtra,
          bonusFuncionario,
          custoEmpresa,
          valorHora: VALOR_HORA,
          pontoAberto: pontoAbertoFinal,
          status: totalHoras >= LIMITE_HORAS ? "hora_extra" : totalHoras >= 190 ? "alerta" : "normal",
          registros: allRegistros,
        };
      });

      resumo.sort((a: any, b: any) => b.totalHoras - a.totalHoras);
      res.json({ mes, resumo, limiteHoras: LIMITE_HORAS, valorHora: VALOR_HORA, salarioBase: SALARIO_BASE });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/ponto-operacional/historico/:employeeId", requireAuth, async (req: any, res) => {
    try {
      const isAdmin = req.user!.role === "admin" || req.user!.role === "diretoria";
      const empId = Number(req.params.employeeId);
      if (!isAdmin && req.user!.employeeId !== empId) return res.status(403).json({ message: "Acesso negado" });
      const { data } = await supabaseAdmin.from("ponto_operacional")
        .select("*").eq("employee_id", empId).order("entrada", { ascending: false }).limit(100);
      res.json(data || []);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/ponto-operacional/:id", requireAuth, async (req: any, res) => {
    try {
      const isAdmin = req.user!.role === "admin" || req.user!.role === "diretoria";
      if (!isAdmin) return res.status(403).json({ message: "Acesso negado" });
      await supabaseAdmin.from("ponto_operacional").delete().eq("id", req.params.id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  return httpServer;
}
