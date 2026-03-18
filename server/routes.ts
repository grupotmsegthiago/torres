import type { Express } from "express";
import { type Server } from "http";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { requireAuth, requireAdminRole } from "./auth";
import { supabaseAdmin } from "./supabase";
import {
  insertClientSchema, insertEmployeeSchema, insertVehicleSchema,
  insertServiceOrderSchema, insertTripSchema, insertVehicleMaintenanceSchema,
  insertVehicleFuelingSchema, insertTimesheetSchema, insertMissionPhotoSchema,
  insertEmployeeDocumentSchema, insertWeaponSchema, insertWeaponAssignmentSchema,
  insertVehicleAssignmentSchema,
} from "@shared/schema";
import * as apibrasil from "./apibrasil";
import OpenAI from "openai";

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
  "checkout_km_final",
  "checkout_viatura_retorno",
  "finalizada",
] as const;

const STEP_REQUIRED_PHOTOS: Record<string, string[]> = {
  checkout_armamento: ["arma_pistola_1", "arma_pistola_2", "arma_espingarda"],
  checkout_viatura: ["viatura_frente", "viatura_lateral_esq", "viatura_lateral_dir", "viatura_traseira"],
  checkout_km_saida: ["km_saida"],
  checkin_chegada_km: ["km_chegada"],
  checkin_veiculo_escoltado: ["escoltado_frente", "escoltado_traseira"],
  checkout_km_final: ["km_final"],
  checkout_viatura_retorno: ["viatura_retorno_frente", "viatura_retorno_lateral_esq", "viatura_retorno_lateral_dir", "viatura_retorno_traseira"],
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

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json(toSafeUser(req.user));
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

  app.get("/api/employees", requireAuth, async (_req, res) => {
    const data = await storage.getEmployees();
    res.json(data);
  });

  app.get("/api/employees/next-matricula", requireAuth, async (_req, res) => {
    const matricula = await storage.getNextMatricula();
    res.json({ matricula });
  });

  app.get("/api/employees/:id", requireAuth, async (req, res) => {
    const data = await storage.getEmployee(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Funcionário não encontrado" });
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

    const token = process.env.APIBRASIL_TOKEN;
    const deviceToken = process.env.APIBRASIL_DEVICE_CPF || process.env.APIBRASIL_DEVICE_TOKEN;

    if (!token) {
      try {
        const response = await fetch(`https://brasilapi.com.br/api/cpf/v1/${cpf}`);
        if (!response.ok) return res.status(response.status).json({ message: "CPF não encontrado" });
        const data = await response.json();
        return res.json(data);
      } catch {
        return res.status(500).json({ message: "Erro ao consultar CPF" });
      }
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      };
      if (deviceToken) {
        headers["DeviceToken"] = deviceToken;
      }

      const response = await fetch("https://gateway.apibrasil.io/api/v2/dados/cpf", {
        method: "POST",
        headers,
        body: JSON.stringify({ cpf }),
      });

      const raw = await response.json().catch(() => null);

      await storage.createApiLog({
        endpoint: "/dados/cpf",
        method: "POST",
        requestData: JSON.stringify({ cpf }),
        responseStatus: response.status,
        responseData: JSON.stringify(raw).substring(0, 5000),
        userId: req.user?.id ?? null,
        source: "cpf_lookup",
      });

      if (!response.ok || !raw) {
        try {
          const fallback = await fetch(`https://brasilapi.com.br/api/cpf/v1/${cpf}`);
          if (fallback.ok) {
            const data = await fallback.json();
            return res.json(data);
          }
        } catch {}
        return res.status(response.status || 500).json({ message: "CPF não encontrado" });
      }

      const data = raw?.response || raw;

      const normalized: Record<string, string> = {};
      if (data.nome || data.name || data.nomeCompleto) {
        normalized.nome = data.nome || data.name || data.nomeCompleto || "";
      }
      if (data.data_nascimento || data.dataNascimento || data.nascimento || data.birth_date) {
        let rawDate = data.data_nascimento || data.dataNascimento || data.nascimento || data.birth_date || "";
        if (rawDate.includes("/")) {
          const parts = rawDate.split("/");
          if (parts.length === 3) {
            rawDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
          }
        }
        normalized.data_nascimento = rawDate;
      }
      if (data.nome_mae || data.nomeMae || data.mae || data.mother_name) {
        normalized.nome_mae = data.nome_mae || data.nomeMae || data.mae || data.mother_name || "";
      }
      if (data.nome_pai || data.nomePai || data.pai || data.father_name) {
        normalized.nome_pai = data.nome_pai || data.nomePai || data.pai || data.father_name || "";
      }
      if (data.sexo || data.genero || data.gender) {
        normalized.sexo = data.sexo || data.genero || data.gender || "";
      }
      if (data.situacao || data.situacaoCadastral || data.status) {
        normalized.situacao = data.situacao || data.situacaoCadastral || data.status || "";
      }

      res.json(normalized);
    } catch (err: any) {
      try {
        const fallback = await fetch(`https://brasilapi.com.br/api/cpf/v1/${cpf}`);
        if (fallback.ok) {
          const data = await fallback.json();
          return res.json(data);
        }
      } catch {}
      res.status(500).json({ message: "Erro ao consultar CPF: " + (err.message || "") });
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

  app.get("/api/service-orders/:id", requireAuth, async (req, res) => {
    const data = await storage.getServiceOrder(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "OS não encontrada" });
    res.json(data);
  });

  app.post("/api/service-orders", requireAuth, async (req, res) => {
    const parsed = insertServiceOrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.createServiceOrder(parsed.data);
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

    const data = await storage.updateServiceOrder(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "OS não encontrada" });
    res.json(data);
  });

  app.delete("/api/service-orders/:id", requireAuth, async (req, res) => {
    await storage.deleteServiceOrder(Number(req.params.id));
    res.json({ message: "OS removida" });
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
    if (plate.length < 7) return res.status(400).json({ message: "Placa inválida" });

    const token = process.env.APIBRASIL_TOKEN;
    if (!token) return res.status(503).json({ message: "Token da API Brasil não configurado" });

    try {
      const response = await fetch("https://gateway.apibrasil.io/api/v2/vehicles/dados", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ placa: plate }),
      });

      const data = await response.json();

      if (data.error) {
        return res.status(400).json({ message: data.message || "Erro na consulta" });
      }

      const result = data.response || data;
      res.json({
        plate: result.placa || plate,
        brand: result.marca || result.MARCA || "",
        model: result.modelo || result.MODELO || "",
        year: parseInt(result.ano || result.anoModelo || result.ANO || "0") || null,
        color: result.cor || result.COR || "",
        chassi: result.chassi || result.CHASSI || "",
        fuel: result.combustivel || result.COMBUSTIVEL || "",
        type: result.tipo || result.TIPO || "",
        city: result.municipio || result.MUNICIPIO || "",
        state: result.uf || result.UF || "",
      });
    } catch (err: any) {
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

        if (vehicle?.trackerApiUrl && vehicle?.trackerId) {
          try {
            const resp = await fetch(vehicle.trackerApiUrl);
            if (resp.ok) {
              trackerData = await resp.json();
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
            hasTracker: !!(vehicle.trackerId && vehicle.trackerApiUrl),
          } : null,
          tracker: trackerData,
        };
      })
    );

    res.json(enriched);
  });

  // ====================== MISSION ROUTES ======================

  app.get("/api/mission/active", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.json(null);

    const orders = await storage.getServiceOrdersByEmployee(user.employeeId);
    const active = orders.find(
      (o) => o.status === "em_andamento" && o.missionStatus !== "finalizada"
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
      escortedVehiclePlate: active.escortedVehiclePlate || null,
      missionStartedAt: active.missionStartedAt || null,
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

    if (so.status !== "em_andamento") {
      return res.status(400).json({ message: "OS não está em andamento" });
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

    const { serviceOrderId, driverName, vehiclePlate } = req.body;
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
      escortedVehiclePlate: vehiclePlate,
    });
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

    const nextStep = MISSION_STEPS[currentIdx + 1];
    const updates: any = { missionStatus: nextStep };

    if (nextStep === "finalizada") {
      updates.status = "concluida";
      updates.completedDate = new Date();
    }

    const updated = await storage.updateServiceOrder(serviceOrderId, updates);
    res.json(updated);
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

  return httpServer;
}
