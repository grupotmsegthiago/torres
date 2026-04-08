import type { Express } from "express";
  import { storage, toCamelObj, toCamelArray } from "../storage";
  import { supabaseAdmin } from "../supabase";
  import { requireAuth, requireAdminRole, requireDiretoria } from "../auth";
  import { insertGerenciadoraSchema } from "@shared/schema";
  import * as truckscontrol from "../truckscontrol";
  import { lastMissionPos, lastRecordedPos, MISSION_POS_MIN_DISTANCE } from "./operational";
  import { createSmtpTransporter, getSmtpFrom, parseEmailList, MISSION_STEPS, STEP_REQUIRED_PHOTOS, nowBRTString, haversineDist } from "./_helpers";
  import { calcularEscolta, extractKmFromText } from "../billing-calc";
  import { logSystemAudit } from "../audit";
  import { randomUUID } from "crypto";

  export function registerMissionRoutes(app: Express) {
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

    const simulateOsId = req.query.osId ? parseInt(req.query.osId as string) : null;
    if (simulateOsId && (user.role === "admin" || user.role === "diretoria")) {
      const active = await storage.getServiceOrder(simulateOsId);
      if (!active) return res.json(null);

      const [client, vehicle, emp1, emp2] = await Promise.all([
        storage.getClient(active.clientId),
        active.vehicleId ? storage.getVehicle(active.vehicleId) : null,
        active.assignedEmployeeId ? storage.getEmployee(active.assignedEmployeeId) : null,
        active.assignedEmployee2Id ? storage.getEmployee(active.assignedEmployee2Id) : null,
      ]);
      const photos = await storage.getMissionPhotosByOS(active.id);
      const completedSteps = photos.map((p) => p.step);

      let agentLocation: { lat: string; lng: string } | null = null;
      if (active.assignedEmployeeId) {
        const { data: loc } = await supabaseAdmin
          .from("agent_locations")
          .select("latitude, longitude")
          .eq("employee_id", active.assignedEmployeeId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .single();
        if (loc) agentLocation = { lat: String(loc.latitude), lng: String(loc.longitude) };
      }

      return res.json({
        ...active,
        serviceOrderId: active.id,
        clientName: client?.name || "—",
        vehiclePlate: vehicle?.plate || "—",
        vehicleModel: vehicle?.model || "—",
        employee1Name: emp1?.name || "—",
        employee2Name: emp2?.name || "—",
        employeeId: active.assignedEmployeeId,
        completedSteps,
        escortedDriverName: active.escortedDriverName || null,
        escortedDriverPhone: active.escortedDriverPhone || null,
        escortedVehiclePlate: active.escortedVehiclePlate || null,
        missionStartedAt: active.missionStartedAt || null,
        origin: active.origin || null,
        destination: active.destination || null,
        route: active.route || null,
        agentLocation,
        scheduledMissions: [],
      });
    }

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
      await supabaseAdmin.from("mission_updates").insert({
        service_order_id: serviceOrderId,
        os_number: so.osNumber || null,
        employee_id: user.employeeId,
        employee_name: emp?.name || user.name || "—",
        message: message.trim(),
        mission_step: missionStep || so.missionStatus || null,
        latitude: latitude || null,
        longitude: longitude || null,
        photo_url: validatedPhotoUrl,
        read_by_admin: 0,
      });
      console.log(`[mission-update] Atualização salva: agente=${emp?.name || user.name} OS=${so.osNumber} msg="${message.trim().substring(0, 50)}"`);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[mission-update] Erro ao salvar:", err.message);
      res.status(500).json({ message: "Erro ao salvar atualização" });
    }
  });

  app.get("/api/service-orders/:id/updates", requireAuth, async (req, res) => {
    const osId = parseInt(req.params.id);
    if (isNaN(osId)) return res.status(400).json({ message: "ID inválido" });
    try {
      const { data: results, error } = await supabaseAdmin.from("mission_updates").select("*")
        .eq("service_order_id", osId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      res.json(toCamelArray(results || []));
    } catch (err: any) {
      console.error(`[mission-updates] GET /updates/${osId} error:`, err.message);
      res.json([]);
    }
  });

  app.get("/api/mission/updates", requireAuth, requireAdminRole, async (req, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    const unreadOnly = req.query.unread === "true";
    const limit = parseInt(req.query.limit as string) || 50;

    const stripBase64 = (m: any) => {
      if (m.photoUrl && typeof m.photoUrl === "string" && m.photoUrl.startsWith("data:")) {
        return { ...m, photoUrl: "[has_photo]", hasPhoto: true };
      }
      return { ...m, hasPhoto: !!m.photoUrl };
    };

    let missionResults: any[];
    if (unreadOnly) {
      try {
        const { data, error } = await supabaseAdmin.from("mission_updates").select("*").eq("read_by_admin", 0).order("created_at", { ascending: false }).limit(limit);
        if (error) throw error;
        missionResults = toCamelArray(data || []);
      } catch (_e) { missionResults = []; }
    } else {
      const [missionRes, telRes] = await Promise.all([
        supabaseAdmin.from("mission_updates").select("*").order("created_at", { ascending: false }).limit(limit).then(r => r).catch(() => ({ data: [] as any[] })),
        supabaseAdmin.from("telemetry_events").select("*").order("created_at", { ascending: false }).limit(limit),
      ]);
      missionResults = toCamelArray(missionRes.data || []);
      const telEvents = toCamelArray(telRes.data || []);
      const telAsMission = telEvents.map(t => ({
        id: `tel-${t.id}`,
        serviceOrderId: null,
        osNumber: null,
        employeeId: null,
        employeeName: t.driverName || t.plate,
        message: t.details || `${t.eventType}: ${t.value}`,
        missionStep: null,
        latitude: t.latitude ? String(t.latitude) : null,
        longitude: t.longitude ? String(t.longitude) : null,
        photoUrl: null,
        hasPhoto: false,
        readByAdmin: 1,
        createdAt: t.createdAt,
        _type: "telemetry",
        _eventType: t.eventType,
        _plate: t.plate,
        _value: t.value,
        _address: t.address,
      }));
      const merged = [...missionResults.map(m => stripBase64({ ...m, _type: "mission" })), ...telAsMission]
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
        .slice(0, limit);
      return res.json(merged);
    }

    res.json(missionResults.map(stripBase64));
  });

  app.get("/api/mission/updates/:id/photo", requireAuth, requireAdminRole, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido" });
    try {
      const { data: rows, error } = await supabaseAdmin.from("mission_updates").select("photo_url").eq("id", id).limit(1);
      if (error) throw error;
      if (!rows || rows.length === 0) return res.status(404).json({ message: "Atualização não encontrada" });
      res.json({ photoUrl: rows[0].photo_url });
    } catch (err: any) {
      console.error(`[mission-updates] photo/${id} error:`, err.message);
      res.status(500).json({ message: "Erro ao buscar foto" });
    }
  });

  app.patch("/api/mission/updates/mark-read", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { ids } = req.body;
      if (ids && Array.isArray(ids)) {
        for (const id of ids) {
          await supabaseAdmin.from("mission_updates").update({ read_by_admin: 1 }).eq("id", id);
        }
      } else {
        await supabaseAdmin.from("mission_updates").update({ read_by_admin: 1 }).eq("read_by_admin", 0);
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("[mission-updates] mark-read error:", err.message);
      res.json({ success: true });
    }
  });

  app.post("/api/mission/updates/:id/copy-audit", requireAuth, requireAdminRole, async (req: any, res) => {
    try {
      const updateId = Number(req.params.id);
      const userName = req.user?.name || req.user?.email || "Admin";

      await supabaseAdmin.from("mission_updates").update({ copiado_por: userName, copiado_em: nowBRTString() }).eq("id", updateId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("copy-audit error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mission/updates/:id/forward", requireAuth, requireAdminRole, async (req: any, res) => {
    try {
      const updateId = Number(req.params.id);
      const { recipientEmail, customMessage } = req.body;
      if (!recipientEmail) return res.status(400).json({ message: "Email do destinatário é obrigatório" });

      const { data: updateRows } = await supabaseAdmin.from("mission_updates").select("*").eq("id", updateId).limit(1);
      if (!updateRows || updateRows.length === 0) return res.status(404).json({ message: "Atualização não encontrada" });
      const update = toCamelObj<any>(updateRows[0]);

      const os = await storage.getServiceOrder(update.serviceOrderId);
      if (!os) return res.status(404).json({ message: "OS não encontrada" });

      const client = await storage.getClient(os.clientId);

      const transporter = createSmtpTransporter();
      if (!transporter) return res.status(500).json({ message: "SMTP não configurado" });

      const missionLabelMap: Record<string, string> = {
        aguardando: "Saída da Base", checkout_armamento: "Saída da Base", checkout_viatura: "Saída da Base", checkout_km_saida: "Saída da Base",
        em_transito_origem: "Na Origem", checkin_chegada_km: "Na Origem", checkin_veiculo_escoltado: "Na Origem", checkin_dados_motorista: "Na Origem",
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
      await supabaseAdmin.from("mission_updates").insert({
        service_order_id: serviceOrderId,
        os_number: so.osNumber || null,
        employee_id: user.employeeId,
        employee_name: emp?.name || user.name || "—",
        message: alertMsg,
        mission_step: so.missionStatus || null,
        latitude: latitude || null,
        longitude: longitude || null,
        photo_url: photoData,
        read_by_admin: 0,
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
        completedDate: nowBRTString(),
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
      try { await supabaseAdmin.from("mission_positions").delete().eq("service_order_id", serviceOrderId); } catch (_e) { console.error("[cleanup] Failed to delete mission_positions for OS", serviceOrderId); }

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
              const kmInicial = n(kmChegadaPhoto?.kmValue || 0);
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
                data_missao: so.missionStartedAt || so.scheduledDate || new Date().toISOString(),
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
        completedDate: nowBRTString(),
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
      try { await supabaseAdmin.from("mission_positions").delete().eq("service_order_id", serviceOrderId); } catch (_e) { console.error("[cleanup] Failed to delete mission_positions for OS", serviceOrderId); }

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

    const { serviceOrderId, latitude, longitude } = req.body;
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


    if (currentStep === "aguardando" && so.scheduledDate) {
      const scheduled = new Date(String(so.scheduledDate).includes("Z") || /[+-]\d{2}:\d{2}$/.test(String(so.scheduledDate)) ? so.scheduledDate : so.scheduledDate + "Z");
      const diffMin = (scheduled.getTime() - Date.now()) / (1000 * 60);
      if (diffMin > 30 && !so.earlyStartApproved) {
        let withinOriginRadius = false;
        if (latitude && longitude && so.originLat && so.originLng) {
          const distM = haversineDist(Number(latitude), Number(longitude), Number(so.originLat), Number(so.originLng));
          const ORIGIN_RADIUS_M = 1000;
          withinOriginRadius = distM <= ORIGIN_RADIUS_M;
          if (withinOriginRadius) {
            console.log(`[early-start] OS ${so.osNumber}: Agent within ${Math.round(distM)}m of origin (limit ${ORIGIN_RADIUS_M}m) — early start allowed`);
          }
        }
        if (!withinOriginRadius) {
          return res.status(403).json({ message: "EARLY_START_BLOCKED: Início antecipado bloqueado. Missão agendada para mais tarde. Aguarde autorização da central.", code: "EARLY_START" });
        }
      }
    }

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

    if (!so.missionStartedAt && ["checkout_armamento", "checkout_viatura", "checkout_km_saida", "em_transito_origem"].includes(currentStep)) {
      const nowUTC = new Date().toISOString().replace(/\.\d{3}Z$/, "");
      if (so.scheduledDate) {
        const scheduledStr = typeof so.scheduledDate === "string" ? so.scheduledDate : new Date(so.scheduledDate).toISOString().replace(/\.\d{3}Z$/, "");
        const nowMs = new Date().getTime();
        const schedMs = new Date(scheduledStr + "Z").getTime();
        const diffMin = (schedMs - nowMs) / 60000;
        if (diffMin > 0 && diffMin <= 30) {
          updates.missionStartedAt = scheduledStr;
        } else {
          updates.missionStartedAt = nowUTC;
        }
      } else {
        updates.missionStartedAt = nowUTC;
      }
    }

    if (nextStep === "finalizada") {
      updates.completedDate = nowBRTString();
      updates.status = "concluida";
      lastMissionPos.delete(serviceOrderId);
      try { await supabaseAdmin.from("mission_positions").delete().eq("service_order_id", serviceOrderId); } catch (_e) { console.error("[cleanup] Failed to delete mission_positions for OS", serviceOrderId); }
    }

    if (nextStep === "encerrada") {
      if (updates.status !== "concluida") updates.status = "concluida";
      lastMissionPos.delete(serviceOrderId);
      try { await supabaseAdmin.from("mission_positions").delete().eq("service_order_id", serviceOrderId); } catch (_e) { console.error("[cleanup] Failed to delete mission_positions for OS", serviceOrderId); }
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
      em_transito_origem: "Em Trânsito Origem", checkin_chegada_km: "Na Origem",
      checkin_veiculo_escoltado: "Na Origem", checkin_dados_motorista: "Na Origem", iniciar_missao: "Início Missão",
      em_transito_destino: "Em Trânsito Destino", chegada_destino: "Chegada Destino",
      checkout_km_final: "KM Final", finalizada: "Finalizada",
      chegada_base: "Chegada Base", encerrada: "Encerrada",
    };
    try {
      const stepToLabel = STEP_ALERT_LABELS[nextStep] || nextStep;
      await supabaseAdmin.from("mission_updates").insert({
        service_order_id: serviceOrderId,
        os_number: so.osNumber || null,
        employee_id: user.employeeId,
        employee_name: emp?.fullName || emp?.name || user.name || "—",
        message: `🔄 ${stepToLabel}`,
        mission_step: nextStep,
        latitude: geo?.lat?.toString() || null,
        longitude: geo?.lng?.toString() || null,
        photo_url: null,
        read_by_admin: 0,
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
        const kmInicial = kmChegadaPhoto?.kmValue || 0;
        const kmFinal = kmFinalPhoto?.kmValue || 0;

        const toBRTe = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
        const scheduledTime = so.scheduledDate ? toBRTe(new Date(so.scheduledDate)) : undefined;
        const startTime = so.missionStartedAt ? toBRTe(new Date(so.missionStartedAt as string)) : undefined;
        const completedDateVal = updated.completedDate || so.completedDate;
        const endTime = completedDateVal ? toBRTe(new Date(completedDateVal as string)) : undefined;

        let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };

        if (so.escortContractId) {
          const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", so.escortContractId).limit(1);
          if (cc?.length) contrato = cc[0];
        } else if (so.clientId) {
          const { data: clientContracts } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.clientId).limit(1);
          if (clientContracts?.length) contrato = clientContracts[0];
        }

        {
          const osMissionCosts = await storage.getMissionCostsByOS(serviceOrderId);
          let despPedagio = 0, despCombustivel = 0, despOutras = 0, receitasOsEnc = 0;
          for (const mc of osMissionCosts) {
            const amt = Number(mc.amount) || 0;
            if ((mc as any).costType === "revenue") { receitasOsEnc += amt; }
            else {
              const cat = (mc.category || "").toLowerCase();
              if (cat.includes("pedágio") || cat.includes("pedagio")) despPedagio += amt;
              else if (cat.includes("combustível") || cat.includes("combustivel") || cat.includes("abastecimento")) despCombustivel += amt;
              else despOutras += amt;
            }
          }
          const pedagioEstimado = Number((so as any).pedagioEstimado) || 0;
          if (pedagioEstimado > 0 && despPedagio === 0) despPedagio = pedagioEstimado;

          const kmRotaEnc = extractKmFromText(so.destination) || extractKmFromText(so.route) || undefined;

          const resultado = calcularEscolta({
            km_inicial: kmInicial, km_final: kmFinal > kmInicial ? kmFinal : kmInicial, km_vazio: 0,
            horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
            horario_inicio: startTime, horario_fim: endTime, horario_agendado: scheduledTime,
            despesas_pedagio: despPedagio, despesas_combustivel: despCombustivel, despesas_outras: despOutras, receitas_os: receitasOsEnc, contrato,
            kmRota: kmRotaEnc,
          });

          const client = so.clientId ? await storage.getClient(so.clientId) : null;
          const emp = so.assignedEmployeeId ? await storage.getEmployee(so.assignedEmployeeId) : null;
          const emp2 = so.assignedEmployee2Id ? await storage.getEmployee(so.assignedEmployee2Id) : null;

          const nb = (v: any) => Number(v) || 0;
          const billingPayload = {
            service_order_id: serviceOrderId,
            client_id: so.clientId, client_name: client?.name || "—",
            contract_id: contrato.id || null,
            km_inicial: nb(kmInicial), km_final: nb(kmFinal > kmInicial ? kmFinal : kmInicial), km_vazio: 0,
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
            fat_total: nb(resultado.fat_total), receitas_os: nb(receitasOsEnc),
            valor_franquia: nb(resultado.valor_franquia), valor_km_extra: nb(resultado.valor_km_extra),
            pag_vrp: nb(resultado.pag_vrp), pag_periculosidade: nb(resultado.pag_periculosidade),
            pag_adicional_noturno: nb(resultado.pag_adicional_noturno),
            pag_reembolsos: nb(resultado.pag_reembolsos), pag_total: nb(resultado.pag_total),
            despesas_pedagio: nb(despPedagio), despesas_combustivel: nb(despCombustivel), despesas_outras: nb(despOutras),
            resultado_bruto: nb(resultado.resultado.bruto), resultado_liquido: nb(resultado.resultado.liquido),
            margem_percentual: nb(resultado.resultado.margem_pct),
            vigilante_id: so.assignedEmployeeId, vigilante_name: emp?.name || user.name,
            vigilante2_id: so.assignedEmployee2Id || null, vigilante2_name: emp2?.name || null,
            origem: so.origin || null, destino: so.destination || null,
            placa_viatura: so.vehicleId ? (await storage.getVehicle(so.vehicleId))?.plate || null : null,
            placa_escoltado: so.escortedVehiclePlate || null,
            motorista_escoltado: so.escortedDriverName || null,
            data_missao: so.missionStartedAt || so.scheduledDate || new Date().toISOString(),
            status: "A_VERIFICAR", created_by: user.name,
          };
          const { data: existBill } = await supabaseAdmin.from("escort_billings").select("id").eq("service_order_id", serviceOrderId).order("created_at", { ascending: false }).limit(1);
          if (existBill?.length) {
            const { service_order_id: _sid, created_by: _cb, ...updatePayload } = billingPayload;
            await supabaseAdmin.from("escort_billings").update(updatePayload).eq("id", existBill[0].id);
            console.log(`[auto-billing] OS ${so.osNumber}: UPDATED billing ${existBill[0].id} km_ini=${kmInicial} km_fin=${kmFinal} fat_total=${resultado.fat_total}`);
          } else {
            await supabaseAdmin.from("escort_billings").insert(billingPayload);
            console.log(`[auto-billing] OS ${so.osNumber}: CREATED billing km_ini=${kmInicial} km_fin=${kmFinal} fat_total=${resultado.fat_total}`);
          }
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

      if (currentStep === "aguardando" && so.scheduledDate) {
        const scheduled = new Date(String(so.scheduledDate).includes("Z") || /[+-]\d{2}:\d{2}$/.test(String(so.scheduledDate)) ? so.scheduledDate : so.scheduledDate + "Z");
        const diffMin = (scheduled.getTime() - Date.now()) / (1000 * 60);
        if (diffMin > 30 && !so.earlyStartApproved) {
          let withinOriginSim = false;
          const { latitude: simLat, longitude: simLng } = req.body;
          if (simLat && simLng && so.originLat && so.originLng) {
            const distM = haversineDist(Number(simLat), Number(simLng), Number(so.originLat), Number(so.originLng));
            withinOriginSim = distM <= 1000;
          }
          if (!withinOriginSim) {
            return res.status(403).json({ message: "EARLY_START_BLOCKED: Início antecipado bloqueado. Missão agendada para mais tarde.", code: "EARLY_START" });
          }
        }
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
          await storage.updateServiceOrder(serviceOrderId, { missionStartedAt: nowBRTString() });
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
          updates.completedDate = nowBRTString();
        }

        if (nextStep === "encerrada") {
          updates.status = "concluida";
          lastMissionPos.delete(serviceOrderId);
          try { await supabaseAdmin.from("mission_positions").delete().eq("service_order_id", serviceOrderId); } catch (_e) { console.error("[cleanup] Failed to delete mission_positions for OS", serviceOrderId); }
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

  app.get("/api/missions/:osId/acceptances", requireAuth, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      const isAdmin = req.user!.role === "admin" || req.user!.role === "diretoria";
      const employeeId = req.user!.employeeId;

      if (!isAdmin) {
        const os = await storage.getServiceOrder(osId);
        if (!os) return res.status(404).json({ message: "OS não encontrada" });
        if (os.assignedEmployeeId !== employeeId && os.assignedEmployee2Id !== employeeId) {
          return res.status(403).json({ message: "Acesso negado a esta missão" });
        }
      }

      const { data, error } = await supabaseAdmin
        .from("mission_acceptances").select("*")
        .eq("service_order_id", osId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const enriched = await Promise.all((data || []).map(async (a: any) => {
        const emp = await storage.getEmployee(a.employee_id);
        const base: any = { ...a, employeeName: emp?.name || "Agente" };
        if (isAdmin) {
          base.employeeCpf = emp?.cpf || null;
          base.employeeMatricula = emp?.matricula || null;
        }
        return base;
      }));

      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/employees/:id/acceptances", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const employeeId = Number(req.params.id);
      const { data, error } = await supabaseAdmin
        .from("mission_acceptances").select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const enriched = await Promise.all((data || []).map(async (a: any) => {
        const os = await storage.getServiceOrder(a.service_order_id);
        return { ...a, osNumber: os?.osNumber || "?", osDate: os?.scheduledDate, osType: os?.type };
      }));

      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/missions/:osId/accept", requireAuth, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      const userId = req.user!.id;
      const { locationLat, locationLng, deviceInfo, conversationId } = req.body;
      const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";

      const employeeId = req.user!.employeeId;
      if (!employeeId) return res.status(404).json({ message: "Funcionário não vinculado ao usuário" });
      const emp = await storage.getEmployee(employeeId);
      if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });

      const osCheck = await storage.getServiceOrder(osId);
      if (!osCheck) return res.status(404).json({ message: "OS não encontrada" });
      if (osCheck.assignedEmployeeId !== emp.id && osCheck.assignedEmployee2Id !== emp.id) {
        return res.status(403).json({ message: "Você não está designado para esta missão" });
      }

      let { data: acceptance } = await supabaseAdmin
        .from("mission_acceptances").select("*")
        .eq("service_order_id", osId)
        .eq("employee_id", emp.id)
        .eq("status", "pendente")
        .single();

      if (!acceptance) {
        const { data: existing } = await supabaseAdmin
          .from("mission_acceptances").select("status")
          .eq("service_order_id", osId)
          .eq("employee_id", emp.id)
          .single();
        if (existing?.status === "aceito") return res.status(400).json({ message: "Missão já aceita" });

        const { data: created } = await supabaseAdmin.from("mission_acceptances").insert({
          id: randomUUID(),
          service_order_id: osId,
          employee_id: emp.id,
          status: "pendente",
          acceptance_token: randomUUID(),
        }).select().single();
        acceptance = created;
        if (!acceptance) return res.status(500).json({ message: "Erro ao criar registro de aceite" });
      }

      const now = new Date();
      await supabaseAdmin.from("mission_acceptances").update({
        status: "aceito",
        responded_at: now.toISOString(),
        ip_address: ipAddress,
        device_info: deviceInfo || null,
        location_lat: locationLat || null,
        location_lng: locationLng || null,
      }).eq("id", acceptance.id);

      await storage.updateServiceOrder(osId, { missionStatus: "aceita" });

      const { data: allAcceptances } = await supabaseAdmin
        .from("mission_acceptances").select("status")
        .eq("service_order_id", osId);
      const allAccepted = (allAcceptances || []).every((a: any) => a.status === "aceito");

      const timeBRT = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

      await logSystemAudit({
        userId, userName: req.user!.name || emp.name, userRole: req.user!.role,
        action: "mission_acceptance_accept",
        targetId: String(osId), targetType: "service_order",
        details: JSON.stringify({
          osNumber: osCheck.osNumber, employeeId: emp.id, employeeName: emp.name,
          respondedAt: timeBRT, ipAddress, deviceInfo, locationLat, locationLng,
          acceptanceToken: acceptance.acceptance_token,
          allAccepted,
        }),
        ipAddress,
      });

      const targetConvId = conversationId || null;
      if (targetConvId) {
        const { data: convPart } = await supabaseAdmin
          .from("chat_participants").select("id")
          .eq("conversation_id", targetConvId)
          .eq("user_id", userId)
          .limit(1);
        if (convPart?.length) {
          await supabaseAdmin.from("chat_messages").insert({
            id: randomUUID(),
            conversation_id: targetConvId,
            sender_id: userId,
            type: "system",
            content: `✅ ${emp.name} aceitou a missão ${osCheck.osNumber} — ${timeBRT}`,
          });
        }
      } else {
        const { data: convs } = await supabaseAdmin
          .from("chat_participants").select("conversation_id")
          .eq("user_id", userId);
        if (convs?.length) {
          for (const c of convs) {
            const { data: msgs } = await supabaseAdmin
              .from("chat_messages").select("id, content")
              .eq("conversation_id", c.conversation_id)
              .eq("type", "mission_invite")
              .limit(20);
            const match = (msgs || []).find((m: any) => {
              try { return JSON.parse(m.content || "{}").osId === osId; } catch { return false; }
            });
            if (match) {
              await supabaseAdmin.from("chat_messages").insert({
                id: randomUUID(),
                conversation_id: c.conversation_id,
                sender_id: userId,
                type: "system",
                content: `✅ ${emp.name} aceitou a missão ${osCheck.osNumber} — ${timeBRT}`,
              });
              break;
            }
          }
        }
      }

      res.json({ success: true, allAccepted });
    } catch (err: any) {
      console.error("[mission] accept error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/missions/:osId/refuse", requireAuth, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      const userId = req.user!.id;
      const { notes, deviceInfo, conversationId } = req.body;
      const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";

      if (!notes || !notes.trim()) return res.status(400).json({ message: "Justificativa obrigatória para recusa" });

      const employeeId = req.user!.employeeId;
      if (!employeeId) return res.status(404).json({ message: "Funcionário não vinculado ao usuário" });
      const emp = await storage.getEmployee(employeeId);
      if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });

      const osCheck = await storage.getServiceOrder(osId);
      if (!osCheck) return res.status(404).json({ message: "OS não encontrada" });
      if (osCheck.assignedEmployeeId !== emp.id && osCheck.assignedEmployee2Id !== emp.id) {
        return res.status(403).json({ message: "Você não está designado para esta missão" });
      }

      let { data: acceptance } = await supabaseAdmin
        .from("mission_acceptances").select("*")
        .eq("service_order_id", osId)
        .eq("employee_id", emp.id)
        .eq("status", "pendente")
        .single();

      if (!acceptance) {
        const { data: created } = await supabaseAdmin.from("mission_acceptances").insert({
          id: randomUUID(),
          service_order_id: osId,
          employee_id: emp.id,
          status: "pendente",
          acceptance_token: randomUUID(),
        }).select().single();
        acceptance = created;
        if (!acceptance) return res.status(500).json({ message: "Erro ao criar registro de aceite" });
      }

      const now = new Date();
      await supabaseAdmin.from("mission_acceptances").update({
        status: "recusado",
        responded_at: now.toISOString(),
        ip_address: ipAddress,
        device_info: deviceInfo || null,
        notes: notes.trim(),
      }).eq("id", acceptance.id);

      const timeBRT = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

      await logSystemAudit({
        userId, userName: req.user!.name || emp.name, userRole: req.user!.role,
        action: "mission_acceptance_refuse",
        targetId: String(osId), targetType: "service_order",
        details: JSON.stringify({
          osNumber: osCheck.osNumber, employeeId: emp.id, employeeName: emp.name,
          respondedAt: timeBRT, ipAddress, deviceInfo, reason: notes.trim(),
          acceptanceToken: acceptance.acceptance_token,
        }),
        ipAddress,
      });

      const targetConvId = conversationId || null;
      if (targetConvId) {
        const { data: convPart } = await supabaseAdmin
          .from("chat_participants").select("id")
          .eq("conversation_id", targetConvId)
          .eq("user_id", userId)
          .limit(1);
        if (convPart?.length) {
          await supabaseAdmin.from("chat_messages").insert({
            id: randomUUID(),
            conversation_id: targetConvId,
            sender_id: userId,
            type: "system",
            content: `🔴 ${emp.name} RECUSOU a missão ${osCheck.osNumber} — Motivo: ${notes.trim()} — ${timeBRT}`,
          });
        }
      } else {
        const { data: convs } = await supabaseAdmin
          .from("chat_participants").select("conversation_id")
          .eq("user_id", userId);
        if (convs?.length) {
          for (const c of convs) {
            const { data: msgs } = await supabaseAdmin
              .from("chat_messages").select("id, content")
              .eq("conversation_id", c.conversation_id)
              .eq("type", "mission_invite")
              .limit(20);
            const match = (msgs || []).find((m: any) => {
              try { return JSON.parse(m.content || "{}").osId === osId; } catch { return false; }
            });
            if (match) {
              await supabaseAdmin.from("chat_messages").insert({
                id: randomUUID(),
                conversation_id: c.conversation_id,
                sender_id: userId,
                type: "system",
                content: `🔴 ${emp.name} RECUSOU a missão ${osCheck.osNumber} — Motivo: ${notes.trim()} — ${timeBRT}`,
              });
              break;
            }
          }
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("[mission] refuse error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/missions/:osId/acceptances/:employeeId/comprovante", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      const employeeId = Number(req.params.employeeId);

      const { data: acceptance } = await supabaseAdmin
        .from("mission_acceptances").select("*")
        .eq("service_order_id", osId)
        .eq("employee_id", employeeId)
        .eq("status", "aceito")
        .single();

      if (!acceptance) return res.status(404).json({ message: "Aceite não encontrado" });

      const os = await storage.getServiceOrder(osId);
      const emp = await storage.getEmployee(employeeId);
      if (!os || !emp) return res.status(404).json({ message: "OS ou funcionário não encontrado" });

      const respondedBRT = acceptance.responded_at
        ? new Date(acceptance.responded_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
        : "N/A";

      res.json({
        osNumber: os.osNumber,
        osType: os.type,
        scheduledDate: os.scheduledDate,
        origin: os.origin,
        destination: os.destination,
        employeeName: emp.name,
        employeeCpf: emp.cpf,
        employeeMatricula: emp.matricula,
        status: acceptance.status,
        respondedAt: respondedBRT,
        ipAddress: acceptance.ip_address,
        deviceInfo: acceptance.device_info,
        locationLat: acceptance.location_lat,
        locationLng: acceptance.location_lng,
        acceptanceToken: acceptance.acceptance_token,
        notifiedAt: acceptance.notified_at,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/relatorio-aceites", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { startDate, endDate, employeeId, status } = req.query;
      let query = supabaseAdmin.from("mission_acceptances").select("*").order("created_at", { ascending: false });

      if (startDate) query = query.gte("created_at", startDate as string);
      if (endDate) query = query.lte("created_at", endDate as string);
      if (employeeId) query = query.eq("employee_id", Number(employeeId));
      if (status) query = query.eq("status", status as string);

      const { data, error } = await query;
      if (error) throw error;

      const enriched = await Promise.all((data || []).map(async (a: any) => {
        const emp = await storage.getEmployee(a.employee_id);
        const os = await storage.getServiceOrder(a.service_order_id);
        return {
          ...a,
          employeeName: emp?.name || "?",
          osNumber: os?.osNumber || "?",
          osDate: os?.scheduledDate,
          osType: os?.type,
        };
      }));

      const total = enriched.length;
      const aceitos = enriched.filter(a => a.status === "aceito").length;
      const recusados = enriched.filter(a => a.status === "recusado").length;
      const expirados = enriched.filter(a => a.status === "expirado").length;
      const pendentes = enriched.filter(a => a.status === "pendente").length;

      res.json({
        summary: { total, aceitos, recusados, expirados, pendentes },
        data: enriched,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/laudo/:osId", requireAuth, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      if (!osId) return res.status(400).json({ message: "ID inválido" });

      const so = await storage.getServiceOrder(osId);
      if (!so) return res.status(404).json({ message: "OS não encontrada" });

      const client = so.clientId ? await storage.getClient(so.clientId) : null;

      const emp1 = so.assignedEmployeeId ? await storage.getEmployee(so.assignedEmployeeId) : null;
      const emp2 = (so as any).assignedEmployee2Id ? await storage.getEmployee((so as any).assignedEmployee2Id) : null;

      const vehicle = so.vehicleId ? await storage.getVehicle(so.vehicleId) : null;

      const { data: photos } = await supabaseAdmin
        .from("mission_photos")
        .select("*")
        .eq("service_order_id", osId)
        .order("created_at", { ascending: true });

      let updates: any[] = [];
      try {
        const { data, error } = await supabaseAdmin.from("mission_updates").select("*").eq("service_order_id", osId).order("created_at", { ascending: true });
        if (!error) updates = data || [];
      } catch (_muErr) {}

      const { data: positions } = await supabaseAdmin
        .from("mission_positions")
        .select("*")
        .eq("service_order_id", osId)
        .order("recorded_at", { ascending: true });

      const { data: costs } = await supabaseAdmin
        .from("mission_costs")
        .select("*")
        .eq("service_order_id", osId)
        .order("created_at", { ascending: true });

      const { data: acceptance } = await supabaseAdmin
        .from("mission_acceptances")
        .select("*")
        .eq("service_order_id", osId)
        .order("created_at", { ascending: false })
        .limit(5);

      const { data: billing } = await supabaseAdmin
        .from("escort_billings")
        .select("*")
        .eq("service_order_id", osId)
        .limit(1);

      const kmSaida = (photos || []).find((p: any) => p.step === "km_saida");
      const kmChegada = [...(photos || [])].reverse().find((p: any) => p.step === "km_chegada");
      const kmFinal = (photos || []).find((p: any) => p.step === "km_final");
      const kmRodados = kmSaida?.km_value && kmFinal?.km_value
        ? Number(kmFinal.km_value) - Number(kmSaida.km_value)
        : null;

      const totalCustos = (costs || []).reduce((sum: number, c: any) => sum + (Number(c.value) || 0), 0);

      const cronologia = (updates || []).map((u: any) => ({
        horario: u.created_at,
        tipo: u.type,
        descricao: u.description,
        local: u.location || null,
        fotoUrl: u.photo_url || null,
      }));

      const evidencias = (photos || []).map((p: any) => ({
        id: p.id,
        step: p.step,
        fotoUrl: p.photo_data,
        km: p.km_value,
        notas: p.notes,
        horario: p.created_at,
      }));

      const laudo = {
        geradoEm: new Date().toISOString(),
        os: {
          id: so.id,
          numero: so.osNumber,
          tipo: so.type,
          status: so.status,
          prioridade: so.priority,
          descricao: so.description,
          rota: (so as any).route || null,
          dataAgendada: so.scheduledDate,
          dataConclusao: so.completedDate,
          missionStartedAt: (so as any).missionStartedAt,
          statusMissao: (so as any).missionStatus,
          escortedDriverName: (so as any).escortedDriverName,
          escortedVehiclePlate: (so as any).escortedVehiclePlate,
          origin: (so as any).origin,
          destination: (so as any).destination,
          notas: so.notes,
        },
        cliente: client ? {
          id: client.id,
          nome: client.name,
          cnpj: (client as any).cnpj || null,
          contato: client.contactPerson,
          telefone: client.phone,
          email: client.email,
        } : null,
        equipe: {
          agente1: emp1 ? { id: emp1.id, nome: emp1.name, matricula: (emp1 as any).matricula, cargo: emp1.role, telefone: emp1.phone } : null,
          agente2: emp2 ? { id: emp2.id, nome: emp2.name, matricula: (emp2 as any).matricula, cargo: emp2.role, telefone: emp2.phone } : null,
        },
        viatura: vehicle ? {
          id: vehicle.id,
          placa: vehicle.plate,
          modelo: vehicle.model,
          marca: vehicle.brand,
          cor: (vehicle as any).color,
          km: vehicle.km,
        } : null,
        km: {
          saida: kmSaida?.km_value || null,
          chegada: kmChegada?.km_value || null,
          final: kmFinal?.km_value || null,
          rodados: kmRodados,
        },
        cronologia,
        evidencias,
        posicoes: (positions || []).map((p: any) => ({
          lat: p.latitude,
          lng: p.longitude,
          horario: p.recorded_at,
          step: p.step,
        })),
        custos: {
          itens: (costs || []).map((c: any) => ({
            tipo: c.cost_type,
            descricao: c.description,
            valor: Number(c.value),
          })),
          total: totalCustos,
        },
        faturamento: billing?.[0] ? {
          status: billing[0].status,
          valorTotal: Number(billing[0].total_value || 0),
          valorEscolta: Number(billing[0].escort_value || 0),
        } : null,
        aceites: (acceptance || []).map((a: any) => ({
          agenteId: a.employee_id,
          status: a.status,
          respondidoEm: a.responded_at,
          motivo: a.rejection_reason,
        })),
      };

      res.json(laudo);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });


  }
  