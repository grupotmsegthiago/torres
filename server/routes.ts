import type { Express } from "express";
import { type Server } from "http";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { db } from "./db";
import { eq, desc, sql, and, gte, lte, like, or, ilike } from "drizzle-orm";
import { requireAuth, requireAdminRole } from "./auth";
import { supabaseAdmin } from "./supabase";
import {
  insertClientSchema, insertEmployeeSchema, insertVehicleSchema,
  insertServiceOrderSchema, insertTripSchema, insertVehicleMaintenanceSchema,
  insertVehicleFuelingSchema, insertTimesheetSchema, insertMissionPhotoSchema,
  insertEmployeeDocumentSchema, insertWeaponSchema, insertWeaponAssignmentSchema,
  insertVehicleAssignmentSchema, insertGerenciadoraSchema,
  type InsertTelemetryEvent,
  employeeAbsences, employeeFines, employeeTimesheets, employeePayslips,
  employeeDisciplinary,
  auditLogs, users, loginSelfies,
} from "@shared/schema";
import * as apibrasil from "./apibrasil";
import * as truckscontrol from "./truckscontrol";
import { processTelemetry } from "./telemetry-engine";
import OpenAI from "openai";

const MISSION_STEPS = [
  "missao_paga",
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
  "em_prontidao",
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
  checkout_km_final: ["km_final"],
  chegada_destino: ["foto_local_destino"],
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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

  app.delete("/api/clients/:id", requireAuth, async (req, res) => {
    await storage.deleteClient(Number(req.params.id));
    res.json({ message: "Cliente removido" });
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

  app.delete("/api/client-vehicles/:id", requireAuth, async (req, res) => {
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
    const dateFields = ["birthDate", "hireDate", "vacationExpiry"];
    for (const f of dateFields) { if (body[f] === "") body[f] = null; }
    const matricula = await storage.getNextMatricula();
    body.matricula = matricula;
    const parsed = insertEmployeeSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.createEmployee(parsed.data);
    if (data.cpf) {
      apibrasil.autoConsultaFuncionario(data.cpf, req.user!.id).catch(() => {});
    }
    res.status(201).json(data);
  });

  app.patch("/api/employees/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const body = { ...req.body };
    const dateFields = ["birthDate", "hireDate", "vacationExpiry"];
    for (const f of dateFields) { if (body[f] === "") body[f] = null; }
    delete body.matricula;
    const parsed = insertEmployeeSchema.partial().safeParse(body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.updateEmployee(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Funcionário não encontrado" });
    res.json(data);
  });

  app.delete("/api/employees/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    await storage.deleteEmployee(Number(req.params.id));
    res.json({ message: "Funcionário removido" });
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

  app.delete("/api/employee-salaries/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    await storage.deleteEmployeeSalary(Number(req.params.id));
    res.json({ message: "Registro salarial removido" });
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

  app.delete("/api/vehicles/:id", requireAuth, async (req, res) => {
    await storage.deleteVehicle(Number(req.params.id));
    res.json({ message: "Veículo removido" });
  });

  app.get("/api/service-orders", requireAuth, async (_req, res) => {
    const data = await storage.getServiceOrders();
    res.json(data);
  });

  app.get("/api/boletim-medicao/os-concluidas", requireAuth, async (_req, res) => {
    try {
      const allOrders = await storage.getServiceOrders();
      const concluidas = allOrders.filter(o => o.status === "concluida" || o.missionStatus === "encerrada");

      const enriched = await Promise.all(concluidas.map(async (os) => {
        const [client, vehicle, emp1, emp2, kit] = await Promise.all([
          os.clientId ? storage.getClient(os.clientId) : null,
          os.vehicleId ? storage.getVehicle(os.vehicleId) : null,
          os.assignedEmployeeId ? storage.getEmployee(os.assignedEmployeeId) : null,
          os.assignedEmployee2Id ? storage.getEmployee(os.assignedEmployee2Id) : null,
          os.kitId ? storage.getWeaponKit(os.kitId) : null,
        ]);

        const photos = await storage.getMissionPhotosByOS(os.id);
        const kmSaidaPhoto = photos.find(p => p.step === "km_saida");
        const kmFinalPhoto = photos.find(p => p.step === "km_final");

        const { data: billing } = await supabaseAdmin.from("escort_billings")
          .select("*").eq("service_order_id", os.id).limit(1);

        let clientContract: any = null;
        if (os.clientId) {
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
          km_inicial: kmSaidaPhoto?.kmValue || 0,
          km_final: kmFinalPhoto?.kmValue || 0,
          km_total: (kmFinalPhoto?.kmValue || 0) - (kmSaidaPhoto?.kmValue || 0),
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

  app.get("/api/service-orders/:id", requireAuth, async (req, res) => {
    const data = await storage.getServiceOrder(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "OS não encontrada" });
    res.json(data);
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
    if (parsed.data.kitId) {
      const kit = await storage.getWeaponKit(parsed.data.kitId);
      if (!kit) return res.status(400).json({ message: "Kit de armamento não encontrado" });
      if (kit.status === "em_uso") return res.status(400).json({ message: "Kit já está em uso em outra OS" });
    }
    const data = await storage.createServiceOrder(parsed.data);
    if (data.kitId) {
      await storage.updateWeaponKit(data.kitId, { status: "em_uso" });
    }
    if (data.vehicleId) {
      await storage.updateVehicle(data.vehicleId, { status: "em_uso" });
    }
    res.status(201).json(data);
  });

  app.patch("/api/service-orders/:id", requireAuth, async (req, res) => {
    const parsed = insertServiceOrderSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });

    if (parsed.data.status === "em_andamento" && (parsed.data.missionStatus === "missao_paga" || parsed.data.missionStatus === "aguardando")) {
      const existing = await storage.getServiceOrder(Number(req.params.id));
      if (existing && !existing.assignedEmployeeId) {
        return res.status(400).json({ message: "Atribua pelo menos um funcionário antes de iniciar a missão" });
      }
    }

    const existing = await storage.getServiceOrder(Number(req.params.id));

    if (parsed.data.missionStatus && existing?.missionStatus === "missao_paga" && parsed.data.missionStatus !== "missao_paga") {
      const user = req.user!;
      if (user.role !== "admin" && user.role !== "diretoria") {
        return res.status(403).json({ message: "Apenas administradores podem confirmar o pagamento da missão" });
      }
    }
    if (parsed.data.kitId && parsed.data.kitId !== existing?.kitId) {
      const kit = await storage.getWeaponKit(parsed.data.kitId);
      if (!kit) return res.status(400).json({ message: "Kit de armamento não encontrado" });
      if (kit.status === "em_uso") return res.status(400).json({ message: "Kit já está em uso em outra OS" });
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
    }

    res.json(data);
  });

  app.delete("/api/service-orders/:id", requireAuth, async (req, res) => {
    const existing = await storage.getServiceOrder(Number(req.params.id));
    if (existing?.kitId) {
      await storage.updateWeaponKit(existing.kitId, { status: "disponível" });
    }
    if (existing?.vehicleId) {
      await storage.updateVehicle(existing.vehicleId, { status: "disponível" });
    }
    await storage.deleteServiceOrder(Number(req.params.id));
    res.json({ message: "OS removida" });
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

      const logoPath = path.resolve("attached_assets/image_1772056652908.png");
      const hasLogo = fs.existsSync(logoPath);

      const doc = new PDFDocument({ size: "A4", margin: 30 });
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
        gradientRect(LM, y, W, 22);
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#ffffff").text(title.toUpperCase(), LM, y + 6, { width: W, align: "center", lineBreak: false });
        doc.restore();
        y += 22;
      };

      const fieldRow = (label: string, value: string, valueX = 160) => {
        const rH = 18;
        hLine(LM, y + rH, W);
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text(label.toUpperCase() + ":", LABEL_X, y + 4, { width: valueX - LABEL_X - 5, lineBreak: false });
        doc.restore();
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text(value || "\u2014", LM + valueX, y + 4, { width: W - valueX - PAD, lineBreak: false });
        doc.restore();
        y += rH;
      };

      const fieldRow2 = (l1: string, v1: string, l2: string, v2: string, splitAt = 0.5) => {
        const rH = 18;
        hLine(LM, y + rH, W);
        const col1W = Math.floor(W * splitAt);
        const vOff = 120;
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text(l1.toUpperCase() + ":", LABEL_X, y + 4, { width: vOff - PAD, lineBreak: false });
        doc.restore();
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text(v1 || "\u2014", LM + vOff, y + 4, { width: col1W - vOff - 10, lineBreak: false });
        doc.restore();
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text(l2.toUpperCase() + ":", LM + col1W + PAD, y + 4, { width: vOff - PAD, lineBreak: false });
        doc.restore();
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text(v2 || "\u2014", LM + col1W + vOff, y + 4, { width: W - col1W - vOff - PAD, lineBreak: false });
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
        try { doc.image(logoPath, LM + 12, y + 6, { height: 38 }); } catch {}
      }

      y += 50;

      fillRect(LM, y, W, 20, BG_ALT);
      borderRect(LM, y, W, 20);
      const osLabelW = 100;
      doc.save();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("FOLHA / OS", LABEL_X, y + 5, { width: osLabelW, lineBreak: false });
      doc.restore();
      doc.save();
      doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK).text(os.osNumber, LM + osLabelW + PAD, y + 4, { width: 140, lineBreak: false });
      doc.restore();

      doc.save();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("OPERA\u00c7\u00c3O", LM + W - 200, y + 5, { width: 80, lineBreak: false });
      doc.restore();
      doc.save();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text((os.type || "ESCOLTA").toUpperCase(), LM + W - 110, y + 5, { width: 100, lineBreak: false });
      doc.restore();
      y += 20;

      if (os.route) {
        fillRect(LM, y, W, 28, "#ffffff");
        borderRect(LM, y, W, 28);
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("ROTA", LABEL_X, y + 4, { width: osLabelW, lineBreak: false });
        doc.restore();
        doc.save();
        doc.font("Helvetica").fontSize(7.5).fillColor(DARK).text(os.route, LM + osLabelW + PAD, y + 4, { width: W - osLabelW - PAD * 3 });
        doc.restore();
        y += 28;
      }

      sectionHeader("Empresa Contratante / Cliente");
      fillRect(LM, y, W, 22, "#ffffff");
      borderRect(LM, y, W, 22);
      doc.save();
      doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK).text((client?.name || "\u2014").toUpperCase(), LM, y + 5, { width: W, align: "center", lineBreak: false });
      doc.restore();
      y += 22;

      if (os.requesterName) {
        fillRect(LM, y, W, 18, BG_ALT);
        borderRect(LM, y, W, 18);
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("SOLICITANTE:", LABEL_X, y + 4, { width: osLabelW, lineBreak: false });
        doc.restore();
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text(os.requesterName, LM + osLabelW + PAD, y + 4, { width: W - osLabelW - PAD * 2, lineBreak: false });
        doc.restore();
        y += 18;
      }

      const dateVal = os.scheduledDate ? new Date(os.scheduledDate).toLocaleDateString("pt-BR") : "\u2014";
      const timeVal = os.scheduledDate ? new Date(os.scheduledDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "\u2014";
      fillRect(LM, y, W, 18, "#ffffff");
      borderRect(LM, y, W, 18);
      const col3W = Math.floor(W / 3);
      doc.save();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("DATA:", LABEL_X, y + 4, { width: 40, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text(dateVal, LABEL_X + 42, y + 4, { width: col3W - 52, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("HOR\u00c1RIO:", LM + col3W + PAD, y + 4, { width: 55, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text(timeVal, LM + col3W + 65, y + 4, { width: col3W - 70, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("PRIORIDADE:", LM + col3W * 2 + PAD, y + 4, { width: 72, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text((os.priority || "").toUpperCase(), LM + col3W * 2 + 82, y + 4, { width: col3W - 92, lineBreak: false });
      doc.restore();
      y += 18;

      y += 4;

      const renderAgent = (emp: any, roleLabel: string) => {
        sectionHeader(`Identifica\u00e7\u00e3o do Agente : ${roleLabel}`);

        const photoSize = 60;
        const photoX = LM + 6;
        const photoY = y + 4;
        const hasPhoto = emp?.photoUrl && emp.photoUrl.startsWith("data:");
        const photoBuffer = hasPhoto ? parseDataUri(emp.photoUrl) : null;
        const showPhoto = !!photoBuffer;

        const dataX = showPhoto ? LM + photoSize + 18 : LABEL_X;
        const dataW = showPhoto ? W - photoSize - 24 : W - PAD * 2;

        if (showPhoto) {
          try {
            doc.save()
              .roundedRect(photoX, photoY, photoSize, photoSize, 4).clip()
              .image(photoBuffer!, photoX, photoY, { width: photoSize, height: photoSize })
              .restore();
            doc.save().roundedRect(photoX, photoY, photoSize, photoSize, 4).lineWidth(1).strokeColor("#cccccc").stroke().restore();
          } catch {}
        }

        const vOff = 120;
        const rightCol = Math.floor(dataW * 0.55);
        const rH = 16;

        const agentRow = (l1: string, v1: string, l2: string, v2: string) => {
          hLine(LM, y + rH, W);
          doc.save();
          doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text(l1.toUpperCase() + ":", dataX, y + 3, { width: vOff - PAD, lineBreak: false });
          doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text(v1 || "\u2014", dataX + 50, y + 3, { width: rightCol - 55, lineBreak: false });
          doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text(l2.toUpperCase() + ":", dataX + rightCol, y + 3, { width: 70, lineBreak: false });
          doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text(v2 || "\u2014", dataX + rightCol + 70, y + 3, { width: dataW - rightCol - 75, lineBreak: false });
          doc.restore();
          y += rH;
        };

        hLine(LM, y + rH, W);
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("NOME:", dataX, y + 3, { width: 45, lineBreak: false });
        doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK).text((emp?.name || "\u2014").toUpperCase(), dataX + 50, y + 2, { width: dataW - 55, lineBreak: false });
        doc.restore();
        y += rH;

        agentRow("CPF", emp?.cpf || "\u2014", "RG", emp?.rg || "\u2014");
        agentRow("CNH", emp?.cnhNumber || "\u2014", "Contato", emp?.phone || "\u2014");
        agentRow("CNV", emp?.cnvNumber || "\u2014", "Val CNH", emp?.cnhExpiry ? new Date(emp.cnhExpiry).toLocaleDateString("pt-BR") : "\u2014");
        agentRow("Matr\u00edcula", emp?.matricula || "\u2014", "Val CNV", emp?.cnvExpiry ? new Date(emp.cnvExpiry).toLocaleDateString("pt-BR") : "\u2014");

        if (emp?.vestNumber) {
          agentRow("Colete", `${emp.vestNumber} ${emp.vestBrand || ""}`.trim(), "Val Colete", emp.vestExpiry ? new Date(emp.vestExpiry).toLocaleDateString("pt-BR") : "\u2014");
        }

        y += 6;
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
          doc.text(`${w.weapon?.type || "\u2014"} ${w.weapon?.model || ""}`.trim(), cx + 6, y + 4, { width: colWs[0] - 8, lineBreak: false });
          cx += colWs[0];
          doc.font("Helvetica").fontSize(8).fillColor(DARK);
          doc.text(w.weapon?.caliber || "\u2014", cx + 6, y + 4, { width: colWs[1] - 8, lineBreak: false });
          cx += colWs[1];
          doc.text(w.weapon?.serialNumber || "\u2014", cx + 6, y + 4, { width: colWs[2] - 8, lineBreak: false });
          cx += colWs[2];
          doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK);
          doc.text("12 proj.", cx + 6, y + 4, { width: colWs[3] - 8, lineBreak: false });
          doc.restore();
          y += 18;
        }
        y += 6;
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
        doc.text(modelStr || "\u2014", LM + 6, y + 4, { width: col4W - 8, lineBreak: false });
        doc.text(vehicle.color || "\u2014", LM + col4W + 6, y + 4, { width: col4W - 8, lineBreak: false });
        doc.text(vehicle.plate, LM + col4W * 2 + 6, y + 4, { width: col4W - 8, lineBreak: false });
        const trackerStr = trackerType ? `${trackerType} / ${vehicle.truckscontrolIdentifier || vehicle.trackerId || vehicle.plate}` : "\u2014";
        doc.text(trackerStr, LM + col4W * 3 + 6, y + 4, { width: col4W - 8, lineBreak: false });
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

        if (validPhotos.length > 0) {
          y += 4;
          const photoRowH = 65;
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
          y += photoRowH + 12;
        }

        y += 6;
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

      if (os.description || os.notes) {
        sectionHeader("Informa\u00e7\u00f5es Complementares / Observa\u00e7\u00f5es");
        fillRect(LM, y, W, 40, "#ffffff");
        borderRect(LM, y, W, 40);
        doc.save();
        doc.font("Helvetica").fontSize(8).fillColor(DARK);
        const infoText = [os.description, os.notes].filter(Boolean).join("\n");
        doc.text(infoText || "\u2014", LABEL_X, y + 6, { width: W - PAD * 2 });
        doc.restore();
        y += 44;
      }

      const footerY = Math.max(y + 30, 720);

      gradientRect(LM, footerY, W, 28);
      doc.save();
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff").text(
        "ATENCIOSAMENTE, DEPARTAMENTO DE ESCOLTA ARMADA \u2014 TORRES VIGIL\u00c2NCIA PATRIMONIAL",
        LM, footerY + 9, { width: W, align: "center", lineBreak: false }
      );
      doc.restore();

      const infoY = footerY + 32;
      const qrSize = 55;
      doc.image(qrBuffer, LM + W - qrSize - 2, infoY, { width: qrSize });

      doc.save();
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(DARK).text("TORRES VIGIL\u00c2NCIA PATRIMONIAL LTDA", LM, infoY + 2, { width: W - qrSize - 15 });
      doc.font("Helvetica").fontSize(7).fillColor(LIGHT_GRAY).text("CNPJ 36.982.392/0001-89", LM, infoY + 14, { width: W - qrSize - 15 });
      doc.font("Helvetica").fontSize(7).fillColor(LIGHT_GRAY).text("Tel: (21) 97063-4379  |  www.torresvigilancia.com.br", LM, infoY + 25, { width: W - qrSize - 15 });
      doc.font("Helvetica").fontSize(6.5).fillColor("#a3a3a3").text(
        `Documento gerado eletronicamente em ${new Date().toLocaleDateString("pt-BR")}, ${new Date().toLocaleTimeString("pt-BR")}`,
        LM, infoY + 40, { width: W - qrSize - 15 }
      );
      doc.restore();

      doc.end();
    } catch (error: any) {
      console.error("PDF generation error:", error);
      res.status(500).json({ message: "Erro ao gerar PDF" });
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

  app.delete("/api/trips/:id", requireAuth, async (req, res) => {
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
    res.status(201).json(data);
  });

  app.patch("/api/maintenance/:id", requireAuth, async (req, res) => {
    const parsed = insertVehicleMaintenanceSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.updateVehicleMaintenance(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Manutenção não encontrada" });
    res.json(data);
  });

  app.delete("/api/maintenance/:id", requireAuth, async (req, res) => {
    await storage.deleteVehicleMaintenance(Number(req.params.id));
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

  app.post("/api/fueling", requireAuth, async (req, res) => {
    const parsed = insertVehicleFuelingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.createVehicleFueling(parsed.data);
    res.status(201).json(data);
  });

  app.patch("/api/fueling/:id", requireAuth, async (req, res) => {
    const parsed = insertVehicleFuelingSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.updateVehicleFueling(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Abastecimento não encontrado" });
    res.json(data);
  });

  app.delete("/api/fueling/:id", requireAuth, async (req, res) => {
    await storage.deleteVehicleFueling(Number(req.params.id));
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

  app.delete("/api/timesheets/:id", requireAuth, async (req, res) => {
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
    const today = new Date().toISOString().split("T")[0];
    const todayLogs = logs.filter(l => l.createdAt && l.createdAt.toISOString().startsWith(today));
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
    const activeOrders = orders.filter(
      (o) => o.status === "em_andamento" || o.status === "aberta"
    );

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
            const pos = vehicle.truckscontrolIdentifier
              ? truckscontrol.findPositionByIdentifier(tcPositions, vehicle.truckscontrolIdentifier)
              : truckscontrol.findPositionByPlate(tcPositions, vehicle.plate);
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

        return {
          id: o.id,
          osNumber: o.osNumber,
          scheduledDate: o.scheduledDate,
          status: o.status,
          priority: o.priority || "agendada",
          missionStatus: o.missionStatus,
          clientName: client?.name || "—",
          employee1: emp1 ? {
            name: formatName(emp1.name),
            phone: emp1.phone || null,
          } : null,
          employee2: emp2 ? {
            name: formatName(emp2.name),
            phone: emp2.phone || null,
          } : null,
          vehicle: vehicle ? {
            plate: vehicle.plate,
            model: vehicle.model,
            hasTracker: vHasTracker,
          } : null,
          tracker: trackerData,
        };
      })
    );

    res.json(enriched);
  });

  app.get("/api/vehicle-tracking", requireAuth, async (_req, res) => {
    const allVehicles = await storage.getVehicles();
    const orders = await storage.getServiceOrders();
    const activeOrders = orders.filter(
      (o) => o.status === "em_andamento"
    );
    const scheduledOrders = orders.filter(
      (o) => o.status === "aberta"
    );

    const tcPositions = await truckscontrol.getCachedPositions();

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
        } | null = null;

        const trackerType = v.trackerType || "none";
        let hasTracker = false;
        let gotLiveData = false;

        if (trackerType === "truckscontrol") {
          hasTracker = true;
          const vehiclePositions = tcPositions.filter(p => p.deviceType === "vehicle");
          if (vehiclePositions.length > 0) {
            const pos = v.truckscontrolIdentifier
              ? truckscontrol.findPositionByIdentifier(vehiclePositions, v.truckscontrolIdentifier)
              : truckscontrol.findPositionByPlate(vehiclePositions, v.plate);
            if (pos) {
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
                isLiveData: true,
              };
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
                if (trackerData) {
                  gotLiveData = true;
                  trackerData.isLiveData = true;
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

        if (gotLiveData && trackerData) {
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

        const linkedOrder = activeOrders.find((o) => o.vehicleId === v.id);

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
          status: v.status,
          hasTracker,
          trackerId: v.trackerId || v.truckscontrolIdentifier,
          trackerType: v.trackerType || "none",
          truckscontrolIdentifier: v.truckscontrolIdentifier,
          iconType: v.iconType || "polo",
          noSignalSince,
          deviceType: "vehicle" as const,
          tracker: trackerData,
          activeOs: linkedOrder
            ? await (async () => {
                const client = await storage.getClient(linkedOrder.clientId);
                const emp1 = linkedOrder.assignedEmployeeId ? await storage.getEmployee(linkedOrder.assignedEmployeeId) : null;
                const emp2 = linkedOrder.assignedEmployee2Id ? await storage.getEmployee(linkedOrder.assignedEmployee2Id) : null;
                return {
                  id: linkedOrder.id,
                  osNumber: linkedOrder.osNumber,
                  missionStatus: linkedOrder.missionStatus,
                  clientName: client?.name || "—",
                  priority: linkedOrder.priority || "agendada",
                  employee1: emp1 ? { id: emp1.id, name: emp1.name, phone: emp1.phone || null } : null,
                  employee2: emp2 ? { id: emp2.id, name: emp2.name, phone: emp2.phone || null } : null,
                };
              })()
            : null,
          scheduledOs: (() => {
            const scheduled = scheduledOrders.find((o) => o.vehicleId === v.id);
            return scheduled ? { id: scheduled.id, osNumber: scheduled.osNumber, scheduledDate: scheduled.scheduledDate } : null;
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
    const validCommands = ["bloquear", "desbloquear", "sirene"] as const;

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

    console.log(`[command] Enviando ${command} para veículo ${vehicle.plate} (veiID=${veiID}) por ${req.user?.name || req.user?.email}`);
    const result = await truckscontrol.sendCommand(veiID, command as any);
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

  app.delete("/api/gerenciadoras/:id", requireAuth, requireAdminRole, async (req, res) => {
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
    const active = orders.find(
      (o) => (o.status === "em_andamento" || o.status === "agendada") && o.missionStatus !== "encerrada"
    );
    if (!active) return res.json(null);

    const [client, vehicle, emp1, emp2] = await Promise.all([
      storage.getClient(active.clientId),
      active.vehicleId ? storage.getVehicle(active.vehicleId) : null,
      active.assignedEmployeeId ? storage.getEmployee(active.assignedEmployeeId) : null,
      active.assignedEmployee2Id ? storage.getEmployee(active.assignedEmployee2Id) : null,
    ]);

    const photos = await storage.getMissionPhotosByOS(active.id);
    const completedSteps = photos.map((p) => p.step);

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
    });
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
    });
  });

  app.get("/api/mission/photos/:serviceOrderId", requireAuth, async (req, res) => {
    const user = req.user!;
    const soId = Number(req.params.serviceOrderId);
    const so = await storage.getServiceOrder(soId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    if (user.role !== "admin" && user.employeeId) {
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

    if (user.role !== "admin" && user.employeeId) {
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
      return res.status(400).json({ message: "Campos obrigatórios: serviceOrderId, step, photoData" });
    }

    if (!ALL_VALID_PHOTO_STEPS.has(step)) {
      return res.status(400).json({ message: "Etapa de foto inválida" });
    }

    const so = await storage.getServiceOrder(serviceOrderId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    if (so.status !== "em_andamento" && so.status !== "agendada") {
      return res.status(400).json({ message: "OS não está em andamento" });
    }

    if (so.status === "agendada") {
      await storage.updateServiceOrder(so.id, { status: "em_andamento" });
    }

    const currentStepPhotos = STEP_REQUIRED_PHOTOS[so.missionStatus as string];
    if (!currentStepPhotos || !currentStepPhotos.includes(step)) {
      return res.status(400).json({ message: "Foto não pertence à etapa atual da missão" });
    }

    const isAssigned =
      so.assignedEmployeeId === user.employeeId ||
      so.assignedEmployee2Id === user.employeeId;
    if (!isAssigned) return res.status(403).json({ message: "Você não está atribuído a esta OS" });

    const kmSteps = ["km_saida", "km_chegada", "km_final"];
    if (kmSteps.includes(step) && (!kmValue || Number(kmValue) <= 0)) {
      return res.status(400).json({ message: "Valor de KM obrigatório para esta etapa" });
    }

    const photo = await storage.createMissionPhoto({
      serviceOrderId,
      employeeId: user.employeeId,
      step,
      photoData,
      kmValue: kmValue ? Number(kmValue) : null,
      latitude: latitude || null,
      longitude: longitude || null,
      notes: null,
    });

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

    if (so.missionStartedAt) {
      return res.json(so);
    }

    const updated = await storage.updateServiceOrder(serviceOrderId, {
      missionStartedAt: new Date(),
    });
    res.json(updated);
  });

  app.post("/api/mission/advance", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.status(403).json({ message: "Usuário não é funcionário" });

    const { serviceOrderId } = req.body;
    const so = await storage.getServiceOrder(serviceOrderId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    const isAssigned =
      so.assignedEmployeeId === user.employeeId ||
      so.assignedEmployee2Id === user.employeeId;
    if (!isAssigned) return res.status(403).json({ message: "Você não está atribuído a esta OS" });

    const currentIdx = MISSION_STEPS.indexOf(so.missionStatus as any);
    if (currentIdx < 0 || currentIdx >= MISSION_STEPS.length - 1) {
      return res.status(400).json({ message: "Missão já finalizada ou status inválido" });
    }

    const currentStep = MISSION_STEPS[currentIdx];

    if (currentStep === "missao_paga") {
      return res.status(403).json({ message: "Aguardando confirmação de pagamento pela administração" });
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

    const nextStep = MISSION_STEPS[currentIdx + 1];
    const updates: any = { missionStatus: nextStep };

    if (nextStep === "encerrada") {
      updates.status = "concluida";
      updates.completedDate = new Date();
    }

    const updated = await storage.updateServiceOrder(serviceOrderId, updates);

    if (nextStep === "encerrada" && so.kitId) {
      await storage.updateWeaponKit(so.kitId, { status: "disponível" });
    }

    if (nextStep === "encerrada") {
      try {
        const photos = await storage.getMissionPhotosByOS(serviceOrderId);
        const kmSaidaPhoto = photos.find(p => p.step === "km_saida");
        const kmFinalPhoto = photos.find(p => p.step === "km_final");
        const kmInicial = kmSaidaPhoto?.kmValue || 0;
        const kmFinal = kmFinalPhoto?.kmValue || 0;

        const scheduledTime = so.scheduledDate ? new Date(so.scheduledDate).toTimeString().slice(0, 5) : undefined;
        const startTime = so.missionStartedAt ? new Date(so.missionStartedAt).toTimeString().slice(0, 5) : undefined;
        const endTime = updates.completedDate ? new Date(updates.completedDate).toTimeString().slice(0, 5) : undefined;

        let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };

        if (so.clientId) {
          const { data: clientContracts } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.clientId).limit(1);
          if (clientContracts?.length) contrato = clientContracts[0];
        }

        if (kmFinal > kmInicial) {
          const resultado = calcularEscolta({
            km_inicial: kmInicial, km_final: kmFinal, km_vazio: 0,
            horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
            horario_inicio: startTime, horario_fim: endTime, horario_agendado: scheduledTime,
            despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0, contrato,
          });

          const client = so.clientId ? await storage.getClient(so.clientId) : null;
          const emp = so.assignedEmployeeId ? await storage.getEmployee(so.assignedEmployeeId) : null;

          await supabaseAdmin.from("escort_billings").insert({
            service_order_id: serviceOrderId,
            client_id: so.clientId, client_name: client?.name || "—",
            contract_id: contrato.id || null,
            km_inicial: kmInicial, km_final: kmFinal, km_vazio: 0,
            km_carregado: resultado.km_carregado, km_total: resultado.km_total,
            km_faturado: resultado.km_faturado, km_franquia: resultado.km_franquia,
            km_excedente: resultado.km_excedente,
            horario_agendado: scheduledTime || null,
            horario_inicio: startTime || null, horario_fim: endTime || null,
            horario_inicio_considerado: resultado.horario_inicio_considerado,
            horas_missao: resultado.horas_trabalhadas, horas_trabalhadas: resultado.horas_trabalhadas,
            horas_estadia: 0, teve_pernoite: false, is_noturno: resultado.is_noturno,
            fat_km: resultado.fat_km, fat_km_carregado: resultado.faturamento.km_carregado,
            fat_km_vazio: resultado.faturamento.km_vazio,
            fat_estadia: resultado.fat_estadia, fat_pernoite: resultado.fat_pernoite,
            fat_diaria: resultado.fat_pernoite, fat_adicional_noturno: resultado.fat_adicional_noturno,
            fat_total: resultado.fat_total,
            valor_franquia: resultado.valor_franquia, valor_km_extra: resultado.valor_km_extra,
            pag_vrp: resultado.pag_vrp, pag_periculosidade: resultado.pag_periculosidade,
            pag_adicional_noturno: resultado.pag_adicional_noturno,
            pag_reembolsos: resultado.pag_reembolsos, pag_total: resultado.pag_total,
            resultado_bruto: resultado.resultado.bruto, resultado_liquido: resultado.resultado.liquido,
            margem_percentual: resultado.resultado.margem_pct,
            vigilante_id: so.assignedEmployeeId, vigilante_name: emp?.name || user.name,
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
    res.json(updated);
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
    const { action, page, details } = req.body;
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
    });
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

  app.delete("/api/absences/:id", requireAuth, requireAdmin, async (req, res) => {
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

  app.delete("/api/fines/:id", requireAuth, requireAdmin, async (req, res) => {
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

  app.delete("/api/disciplinary/:id", requireAuth, requireAdmin, async (req, res) => {
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

  app.delete("/api/timesheets/:id", requireAuth, requireAdmin, async (req, res) => {
    await db.delete(employeeTimesheets).where(eq(employeeTimesheets.id, Number(req.params.id)));
    res.json({ ok: true });
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

  app.delete("/api/payslips/:id", requireAuth, requireAdmin, async (req, res) => {
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

    const tempPassword = "Torres@" + randomBytes(4).toString("hex");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.supabaseUid, {
      password: tempPassword,
    });

    if (error) return res.status(500).json({ message: "Erro ao resetar senha: " + error.message });
    await storage.updateUser(id, { mustChangePassword: 1 } as any);
    res.json({ ...toSafeUser(user), tempPassword, mustChangePassword: true });
  });

  app.delete("/api/users/:id", requireAuth, requireAdminRole, async (req, res) => {
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
    const { email, name, role, employeeId } = req.body;
    if (!email || !name) {
      return res.status(400).json({ message: "Campos obrigatórios: email, name" });
    }
    if (role === "diretoria" && req.user!.role !== "diretoria") {
      return res.status(403).json({ message: "Sem permissão para criar usuários Diretoria" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await storage.getUserByEmail(normalizedEmail);
    if (existing) return res.status(409).json({ message: "Usuário já existe" });

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

  // ===== EMPLOYEE DOCUMENTS =====
  app.get("/api/employee-documents/:employeeId", requireAuth, async (req, res) => {
    const docs = await storage.getEmployeeDocuments(parseInt(req.params.employeeId));
    res.json(docs);
  });

  app.post("/api/employee-documents", requireAdminRole, async (req, res) => {
    const parsed = insertEmployeeDocumentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const emp = await storage.getEmployee(parsed.data.employeeId);
    if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });
    const doc = await storage.createEmployeeDocument(parsed.data);
    res.status(201).json(doc);
  });

  app.patch("/api/employee-documents/:id", requireAdminRole, async (req, res) => {
    const parsed = insertEmployeeDocumentSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const doc = await storage.updateEmployeeDocument(parseInt(req.params.id), parsed.data);
    if (!doc) return res.status(404).json({ message: "Documento não encontrado" });
    res.json(doc);
  });

  app.delete("/api/employee-documents/:id", requireAdminRole, async (req, res) => {
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

  app.delete("/api/weapons/:id", requireAdminRole, async (req, res) => {
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

  app.delete("/api/weapon-kits/:id", requireAdminRole, async (req, res) => {
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
    const loc = await storage.upsertAgentLocation({
      userId: user.id,
      employeeId: user.employeeId || null,
      latitude,
      longitude,
      accuracy: accuracy ?? null,
      speed: speed ?? null,
      heading: heading ?? null,
    });
    res.json(loc);
  });

  app.get("/api/agent/locations", requireAuth, async (req, res) => {
    const locations = await storage.getAgentLocations();
    res.json(locations);
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

  app.delete("/api/financial/categories/:id", requireAdminRole, async (req, res) => {
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

  app.delete("/api/financial/accounts/:id", requireAdminRole, async (req, res) => {
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
            due_date: d.toISOString().split("T")[0],
            payment_date: status === "PAID" ? d.toISOString().split("T")[0] : null,
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
      const { description, amount, type, status, due_date, payment_date, category_id, category_name, account_id, account_name, entity_type, entity_name, notes, status_conciliacao } = req.body;
      const { data, error } = await supabaseAdmin.from("financial_transactions").update({
        description, amount, type, status, due_date, payment_date,
        category_id, category_name, account_id, account_name,
        entity_type, entity_name, notes, status_conciliacao,
        updated_by: user.name,
      }).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
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

  app.delete("/api/financial/transactions/:id", requireAdminRole, async (req, res) => {
    try {
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
      const today = new Date().toISOString().split("T")[0];
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

  app.delete("/api/service-contracts/:id", requireAdminRole, async (req, res) => {
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
    contrato: {
      valor_km_carregado: number; valor_km_vazio: number; franquia_minima_km: number;
      valor_hora_estadia: number; valor_diaria: number; vrp_base: number;
      adicional_noturno_vrp_pct: number; adicional_noturno_km_pct: number;
      adicional_periculosidade_pct: number; periculosidade_horas_limite: number;
    };
  }) {
    const { km_inicial, km_final, km_vazio, horas_estadia, teve_pernoite, horario_inicio, horario_fim, horario_agendado, despesas_pedagio, despesas_combustivel, despesas_outras, contrato } = dados;

    if (km_final < km_inicial) throw new Error("KM final não pode ser menor que KM inicial");

    const { inicio_considerado, usou_agendado } = calcularInicioCobranca(horario_agendado, horario_inicio);
    const horas_trabalhadas_calc = horario_fim ? calcularHorasTrabalhadas(inicio_considerado, horario_fim) : dados.horas_missao;
    const horas_missao = horas_trabalhadas_calc > 0 ? horas_trabalhadas_calc : dados.horas_missao;

    const km_total = km_final - km_inicial;
    const km_carregado = Math.max(0, km_total - km_vazio);

    const km_franquia = contrato.franquia_minima_km;
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

    const fat_km_carregado = km_faturado_carregado * contrato.valor_km_carregado;
    const fat_km_vazio = km_vazio * contrato.valor_km_vazio;
    const fat_km = fat_km_carregado + fat_km_vazio;
    const valor_franquia = Math.min(km_carregado, km_franquia) * contrato.valor_km_carregado;
    const valor_km_extra = km_excedente * contrato.valor_km_carregado;

    const fat_estadia = horas_estadia * contrato.valor_hora_estadia;
    const fat_pernoite = teve_pernoite ? contrato.valor_diaria : 0;
    let fat_adicional_noturno = 0;
    if (isNoturno) {
      fat_adicional_noturno = fat_km * (contrato.adicional_noturno_km_pct / 100);
    }
    const fat_total = fat_km + fat_estadia + fat_pernoite + fat_adicional_noturno + despesas_total;

    let pag_vrp = contrato.vrp_base;
    let pag_periculosidade = 0;
    if (horas_missao > contrato.periculosidade_horas_limite) {
      const horas_extras = horas_missao - contrato.periculosidade_horas_limite;
      const valor_hora_base = contrato.vrp_base / contrato.periculosidade_horas_limite;
      pag_periculosidade = horas_extras * valor_hora_base * (contrato.adicional_periculosidade_pct / 100);
    }
    let pag_adicional_noturno = 0;
    if (isNoturno) {
      pag_adicional_noturno = pag_vrp * (contrato.adicional_noturno_vrp_pct / 100);
    }
    const pag_reembolsos = despesas_total;
    const pag_total = pag_vrp + pag_periculosidade + pag_adicional_noturno + pag_reembolsos;

    const resultado_bruto = fat_total - pag_total;
    const resultado_liquido = resultado_bruto - despesas_total;
    const margem_pct = fat_total > 0 ? (resultado_liquido / fat_total) * 100 : 0;

    const r = (v: number) => Math.round(v * 100) / 100;

    return {
      km_carregado, km_vazio, km_total, km_faturado: km_faturado_carregado, require_photo, is_noturno: isNoturno,
      km_franquia, km_excedente: r(km_excedente), valor_franquia: r(valor_franquia), valor_km_extra: r(valor_km_extra),
      horario_inicio_considerado: inicio_considerado, usou_agendado, horas_trabalhadas: r(horas_missao),
      faturamento: {
        km_carregado: r(fat_km_carregado), km_vazio: r(fat_km_vazio),
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

  app.delete("/api/escort/contracts/:id", requireAdminRole, async (req, res) => {
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

      const { data, error } = await supabaseAdmin.from("escort_billings").insert({
        ...body, client_id: clientId, client_name: clientName,
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
      const { data, error } = await supabaseAdmin.from("escort_billings").update(req.body).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
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

      const { data, error } = await supabaseAdmin.from("escort_billings").insert({
        client_id: clientId, client_name: clientName,
        contract_id: body.contract_id, route_id: body.route_id,
        service_order_id: body.service_order_id,
        km_inicial: kmIni, km_final: kmFin, km_vazio: Number(body.km_vazio || 0),
        km_carregado: resultado.km_carregado, km_total: resultado.km_total,
        km_faturado: resultado.km_faturado, km_franquia: resultado.km_franquia,
        km_excedente: resultado.km_excedente,
        horario_agendado: body.horario_agendado || null,
        horario_inicio: body.horario_inicio || null, horario_fim: body.horario_fim || null,
        horario_inicio_considerado: resultado.horario_inicio_considerado,
        horas_missao: resultado.horas_trabalhadas, horas_estadia: Number(body.horas_estadia || 0),
        horas_trabalhadas: resultado.horas_trabalhadas,
        teve_pernoite: !!body.teve_pernoite, is_noturno: resultado.is_noturno,
        despesas_pedagio: Number(body.despesas_pedagio || 0), despesas_combustivel: Number(body.despesas_combustivel || 0),
        despesas_outras: Number(body.despesas_outras || 0),
        desp_total: resultado.despesas.total,
        fat_km: resultado.fat_km, fat_km_carregado: resultado.faturamento.km_carregado,
        fat_km_vazio: resultado.faturamento.km_vazio,
        fat_estadia: resultado.fat_estadia, fat_pernoite: resultado.fat_pernoite,
        fat_diaria: resultado.fat_pernoite,
        fat_adicional_noturno: resultado.fat_adicional_noturno, fat_total: resultado.fat_total,
        valor_franquia: resultado.valor_franquia, valor_km_extra: resultado.valor_km_extra,
        pag_vrp: resultado.pag_vrp, pag_periculosidade: resultado.pag_periculosidade,
        pag_adicional_noturno: resultado.pag_adicional_noturno, pag_reembolsos: resultado.pag_reembolsos,
        pag_total: resultado.pag_total,
        resultado_bruto: resultado.resultado.bruto, resultado_liquido: resultado.resultado.liquido,
        margem_percentual: resultado.resultado.margem_pct,
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

  app.delete("/api/escort/routes/:id", requireAdminRole, async (req, res) => {
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

  return httpServer;
}
