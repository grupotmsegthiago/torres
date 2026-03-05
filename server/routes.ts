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
