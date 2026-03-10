import type { Express } from "express";
import { type Server } from "http";
import passport from "passport";
import { storage } from "./storage";
import { requireAuth, hashPassword } from "./auth";
import {
  insertClientSchema, insertEmployeeSchema, insertVehicleSchema,
  insertServiceOrderSchema, insertTripSchema, insertVehicleMaintenanceSchema,
  insertVehicleFuelingSchema, insertTimesheetSchema, insertMissionPhotoSchema,
} from "@shared/schema";
import * as apibrasil from "./apibrasil";

const MISSION_STEPS = [
  "aguardando",
  "km_saida",
  "checklist_saida",
  "em_transito_origem",
  "km_chegada_origem",
  "fotos_cliente",
  "em_transito_destino",
  "km_chegada_destino",
  "checklist_retorno",
  "finalizada",
] as const;

const STEP_REQUIRED_PHOTOS: Record<string, string[]> = {
  km_saida: ["km_saida"],
  checklist_saida: ["checklist_saida_frente", "checklist_saida_lateral_esq", "checklist_saida_lateral_dir", "checklist_saida_traseira"],
  km_chegada_origem: ["km_chegada_origem"],
  fotos_cliente: ["foto_viatura_cliente", "foto_veiculo_cliente_frente", "foto_veiculo_cliente_traseira"],
  km_chegada_destino: ["km_chegada_destino"],
  checklist_retorno: ["checklist_retorno_frente", "checklist_retorno_lateral_esq", "checklist_retorno_lateral_dir", "checklist_retorno_traseira"],
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Credenciais inválidas" });
      req.logIn(user, (err) => {
        if (err) return next(err);
        const { password, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Erro ao sair" });
      res.json({ message: "Logout realizado" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Não autorizado" });
    const { password, ...safeUser } = req.user!;
    res.json(safeUser);
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

  app.get("/api/employees/:id", requireAuth, async (req, res) => {
    const data = await storage.getEmployee(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Funcionário não encontrado" });
    res.json(data);
  });

  app.post("/api/employees", requireAuth, async (req, res) => {
    const parsed = insertEmployeeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.createEmployee(parsed.data);
    if (data.cpf) {
      apibrasil.autoConsultaFuncionario(data.cpf, req.user!.id).catch(() => {});
    }
    res.status(201).json(data);
  });

  app.patch("/api/employees/:id", requireAuth, async (req, res) => {
    const parsed = insertEmployeeSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const data = await storage.updateEmployee(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Funcionário não encontrado" });
    res.json(data);
  });

  app.delete("/api/employees/:id", requireAuth, async (req, res) => {
    await storage.deleteEmployee(Number(req.params.id));
    res.json({ message: "Funcionário removido" });
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

  // ====================== API BRASIL CONSULTAS (admin-only) ======================

  const requireAdmin = (req: any, res: any, next: any) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Acesso negado" });
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

  app.get("/api/consulta/analise-credito/:document", requireAuth, requireAdmin, async (req, res) => {
    const doc = String(req.params.document).replace(/\D/g, "");
    if (doc.length !== 11 && doc.length !== 14) return res.status(400).json({ message: "CPF/CNPJ inválido" });
    const result = await apibrasil.analiseCredito(doc, req.user!.id);
    res.json(result);
  });

  app.get("/api/api-logs", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ message: "Acesso negado" });
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
    if (req.user!.role !== "admin") return res.status(403).json({ message: "Acesso negado" });
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
    if (req.user!.role !== "admin") return res.status(403).json({ message: "Acesso negado" });
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
      clientName: client?.name || "—",
      vehiclePlate: vehicle?.plate || "—",
      vehicleModel: vehicle?.model || "—",
      employee1Name: emp1?.name || "—",
      employee2Name: emp2?.name || "—",
      completedSteps,
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

    const { serviceOrderId, step, photoData, kmValue } = req.body;
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

    const isAssigned =
      so.assignedEmployeeId === user.employeeId ||
      so.assignedEmployee2Id === user.employeeId;
    if (!isAssigned) return res.status(403).json({ message: "Você não está atribuído a esta OS" });

    const kmSteps = ["km_saida", "km_chegada_origem", "km_chegada_destino"];
    if (kmSteps.includes(step) && (!kmValue || Number(kmValue) <= 0)) {
      return res.status(400).json({ message: "Valor de KM obrigatório para esta etapa" });
    }

    const photo = await storage.createMissionPhoto({
      serviceOrderId,
      employeeId: user.employeeId,
      step,
      photoData,
      kmValue: kmValue ? Number(kmValue) : null,
      notes: null,
    });

    const { photoData: _, ...safePhoto } = photo;
    res.status(201).json(safePhoto);
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

    const nextStep = MISSION_STEPS[currentIdx + 1];
    const updates: any = { missionStatus: nextStep };
    if (nextStep === "finalizada") {
      updates.status = "concluida";
      updates.completedDate = new Date();
    }

    const updated = await storage.updateServiceOrder(serviceOrderId, updates);
    res.json(updated);
  });

  // ====================== AUTH REGISTER (admin only) ======================

  app.post("/api/auth/register", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Apenas administradores podem criar usuários" });
    }

    const { username, password, name, role, employeeId } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ message: "Campos obrigatórios: username, password, name" });
    }

    const existing = await storage.getUserByUsername(username);
    if (existing) return res.status(409).json({ message: "Usuário já existe" });

    const hashedPassword = await hashPassword(password);
    const user = await storage.createUser({
      username,
      password: hashedPassword,
      name,
      role: role || "funcionario",
      employeeId: employeeId || null,
    });

    const { password: _, ...safeUser } = user;
    res.status(201).json(safeUser);
  });

  return httpServer;
}
