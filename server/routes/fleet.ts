import type { Express } from "express";
  import { storage, toCamelArray } from "../storage";
  import { supabaseAdmin } from "../supabase";
  import { requireAuth, requireAdminRole, requireDiretoria } from "../auth";
  import { insertTripSchema, insertVehicleMaintenanceSchema, insertVehicleFuelingSchema, insertTimesheetSchema, vehicleFueling } from "@shared/schema";

  import { logFinancialAudit, createAutoTransaction, removeAutoTransaction, createSmtpTransporter, getSmtpFrom } from "./_helpers";
  import { notifyVehicleMaintenance } from "../notifications";

  async function runAiValidation(fuelingId: number) {
    const fueling = await storage.getVehicleFueling(fuelingId);
    if (!fueling) return;
    const receiptUrl = fueling.receiptPhoto;
    if (!receiptUrl) {
      await supabaseAdmin.from("vehicle_fueling").update({ ai_validation_status: "sem_foto", ai_validation_result: { status: "sem_foto", observacao: "Sem foto de NF" } }).eq("id", fuelingId);
      return;
    }
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    if (!apiKey) { console.log("[ai-validate] No AI key configured, skipping"); return; }

    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey, baseURL });

    const totalCost = Number(fueling.totalCost) || 0;
    const liters = Number(fueling.liters) || 0;
    const costPerLiter = Number(fueling.costPerLiter) || 0;
    const fuelType = fueling.fuelType || "gasolina";
    const station = fueling.station || "";

    await supabaseAdmin.from("vehicle_fueling").update({ ai_validation_status: "pendente" }).eq("id", fuelingId);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é um auditor de notas fiscais de abastecimento de combustível.
Analise a foto do cupom/nota fiscal e compare com os dados informados pelo motorista.
Dados informados:
- Valor total: R$ ${totalCost.toFixed(2)}
- Litros: ${liters.toFixed(2)}L
- Preço/litro: R$ ${costPerLiter.toFixed(3)}
- Combustível: ${fuelType}
- Posto: ${station}

Responda APENAS com um JSON válido (sem markdown):
{
  "validado": true ou false,
  "valor_nf": valor extraído da NF ou null,
  "litros_nf": litros extraídos ou null,
  "preco_litro_nf": preço por litro extraído ou null,
  "combustivel_nf": tipo de combustível na NF ou null,
  "posto_nf": nome do posto na NF ou null,
  "divergencias": ["lista de divergências encontradas"] ou [],
  "observacao": "breve observação da análise"
}
Se a imagem estiver ilegível ou não for uma NF, retorne validado=false com observação explicativa.`
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Analise esta nota fiscal de abastecimento:" },
            { type: "image_url", image_url: { url: receiptUrl } },
          ],
        },
      ],
      max_tokens: 500,
    });

    const raw = response.choices[0]?.message?.content || "";
    let result: any;
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      result = { validado: false, observacao: raw, divergencias: ["Não foi possível analisar automaticamente"] };
    }

    const status = result.validado ? "validado" : "verificar";
    await supabaseAdmin.from("vehicle_fueling").update({
      ai_validation_status: status,
      ai_validation_result: { status, ...result },
    }).eq("id", fuelingId);

    console.log(`[ai-validate] Fueling #${fuelingId} → ${status}`);

    if (status === "verificar") {
      try {
        const vehicle = fueling.vehicleId ? await storage.getVehicle(fueling.vehicleId) : null;
        const driver = fueling.driverId ? await storage.getEmployee(fueling.driverId) : null;
        const plate = vehicle?.plate || "N/A";
        const agentName = driver?.name || "N/A";
        const divergencias = (result.divergencias || []).map((d: string) => `<li style="color:#c0392b">${d}</li>`).join("");
        const valorInfo = fueling.totalCost ? `R$ ${Number(fueling.totalCost).toFixed(2)}` : "N/A";
        const valorNF = result.valor_nf != null ? `R$ ${Number(result.valor_nf).toFixed(2)}` : "N/A";
        const litrosInfo = fueling.liters ? `${Number(fueling.liters).toFixed(2)}L` : "N/A";
        const litrosNF = result.litros_nf != null ? `${Number(result.litros_nf).toFixed(2)}L` : "N/A";
        const dataBR = fueling.date ? new Date(fueling.date + "T12:00:00").toLocaleDateString("pt-BR") : "N/A";
        const posto = fueling.station || "N/A";

        const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#c0392b;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0">
              <h2 style="margin:0;font-size:18px">⚠️ Alerta: Divergência na Validação de Abastecimento</h2>
            </div>
            <div style="background:#fff;border:1px solid #e0e0e0;padding:24px;border-radius:0 0 8px 8px">
              <p style="margin:0 0 16px;color:#333">A validação automática da IA encontrou divergência(s) na nota fiscal do abastecimento abaixo:</p>
              <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
                <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold;width:40%">ID Abastecimento</td><td style="padding:6px 12px">#${fuelingId}</td></tr>
                <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Data</td><td style="padding:6px 12px">${dataBR}</td></tr>
                <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Veículo</td><td style="padding:6px 12px">${plate} ${vehicle?.model || ""}</td></tr>
                <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Agente</td><td style="padding:6px 12px">${agentName}</td></tr>
                <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Posto</td><td style="padding:6px 12px">${posto}</td></tr>
                <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Valor Informado</td><td style="padding:6px 12px">${valorInfo}</td></tr>
                <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Valor NF (IA)</td><td style="padding:6px 12px;color:#c0392b;font-weight:bold">${valorNF}</td></tr>
                <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Litros Informados</td><td style="padding:6px 12px">${litrosInfo}</td></tr>
                <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Litros NF (IA)</td><td style="padding:6px 12px;color:#c0392b;font-weight:bold">${litrosNF}</td></tr>
              </table>
              ${divergencias ? `<div style="background:#fdf2f2;border:1px solid #f5c6cb;border-radius:6px;padding:12px;margin-bottom:16px"><p style="margin:0 0 8px;font-weight:bold;color:#c0392b">Divergências encontradas:</p><ul style="margin:0;padding-left:20px">${divergencias}</ul></div>` : ""}
              ${result.observacao ? `<p style="margin:0 0 16px;color:#555"><strong>Observação IA:</strong> ${result.observacao}</p>` : ""}
              <p style="margin:0;font-size:12px;color:#999">Este é um alerta automático gerado pelo sistema Torres Vigilância Patrimonial.</p>
            </div>
          </div>`;

        const transporter = createSmtpTransporter();
        if (transporter) {
          await transporter.sendMail({
            from: getSmtpFrom(),
            to: "escolta@torresseguranca.com.br, thiago@grupotmseg.com.br",
            subject: `⚠️ Divergência Abastecimento #${fuelingId} - ${plate} - ${dataBR}`,
            html,
          });
          console.log(`[ai-validate] Alert email sent for fueling #${fuelingId}`);
        }
      } catch (emailErr: any) {
        console.error(`[ai-validate] Failed to send alert email for #${fuelingId}:`, emailErr.message);
      }
    }
  }

  export function registerFleetRoutes(app: Express) {
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

    const vehicle = parsed.data.vehicleId ? await storage.getVehicle(parsed.data.vehicleId) : null;

    if (vehicle && parsed.data.km && parsed.data.km > 0) {
      const currentBase = (vehicle as any).lastOilChangeKm || 0;
      const updates: any = {};
      if (parsed.data.km >= currentBase) {
        updates.lastOilChangeKm = parsed.data.km;
      }
      // Manutenção registrada como realizada (padrão) devolve o veículo para "em_uso"
      const maintStatus = String((parsed.data as any).status || "realizada").toLowerCase();
      if (maintStatus === "realizada" && (vehicle as any).status === "manutenção") {
        updates.status = "em_uso";
      }
      let willTriggerMaint = false;
      if ((maintStatus === "agendada" || maintStatus === "em_andamento") && (vehicle as any).status !== "manutenção") {
        updates.status = "manutenção";
        willTriggerMaint = true;
      }
      if (Object.keys(updates).length > 0) {
        await storage.updateVehicle(vehicle.id, updates);
      }
      if (willTriggerMaint) {
        const reason = `${parsed.data.type || "manutenção"}${parsed.data.description ? ` — ${parsed.data.description}` : ""}`;
        notifyVehicleMaintenance(
          { id: vehicle.id, plate: vehicle.plate, model: vehicle.model, km: parsed.data.km || vehicle.km },
          reason
        ).catch((e) => console.error("[notify-maint] async err:", e?.message));
      }
    }

    if (data && Number(parsed.data.cost) > 0) {
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

    if (data.vehicleId && data.km && data.km > 0) {
      const vehicle = await storage.getVehicle(data.vehicleId);
      if (vehicle) {
        const currentBase = (vehicle as any).lastOilChangeKm || 0;
        const updates: any = {};
        if (data.km >= currentBase) {
          updates.lastOilChangeKm = data.km;
        }
        const maintStatus = String((data as any).status || "realizada").toLowerCase();
        if (maintStatus === "realizada" && (vehicle as any).status === "manutenção") {
          updates.status = "em_uso";
        }
        if (Object.keys(updates).length > 0) {
          await storage.updateVehicle(vehicle.id, updates);
        }
      }
    }

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

  app.get("/api/fueling", requireAuth, async (req, res) => {
    // Retrocompatível: sem ?page → devolve array completo (telas que fazem
    // agregados — dashboard, relatorio, vehicles, conciliação — continuam
    // funcionando). Com ?page=N&limit=K → modo paginado (20 mais recentes
    // por padrão) que serve a tabela histórica em /admin/fueling.
    const pageRaw = req.query.page;
    if (pageRaw === undefined) {
      const data = await storage.getVehicleFuelings();
      return res.json(data);
    }
    const page = Math.max(1, parseInt(String(pageRaw), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? 20), 10) || 20));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    // PERF: nunca selecionar as colunas de foto (receipt_photo, pump_photo,
    // odometer_photo, plate_photo) — são base64 com MBs cada. Listamos
    // explicitamente as colunas leves; o detail modal carrega o registro
    // completo via GET /api/fueling/:id sob demanda.
    const LIGHT_COLS = [
      "id","vehicle_id","driver_id","date","liters","cost_per_liter","total_cost",
      "km","fuel_type","full_tank","station","notes","latitude","longitude","address",
      "gasoline_price","ethanol_price","fuel_recommendation","recommendation_followed",
      "created_by_user_id","ticketlog_autorizacao","ticketlog_status","ticketlog_nfe_data",
      "ticketlog_codigo_estab","ticketlog_valor_tl","ticketlog_litros_tl","ticketlog_diff_valor",
      "ticketlog_validated_at","ticketlog_message","ticketlog_estab_nome","ticketlog_attempts",
      "ai_validation_status","ai_validation_result","created_at",
    ].join(",");
    const { data, error, count } = await supabaseAdmin
      .from("vehicle_fueling")
      .select(LIGHT_COLS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) return res.status(500).json({ message: "Erro ao listar abastecimentos", detail: error.message });
    // Sinaliza presença de NF (receipt_photo) sem trazer o base64: segunda
    // query select=id where receipt_photo IS NOT NULL, restrita aos 20 IDs.
    const ids = (data || []).map((r: any) => r.id);
    let receiptIds = new Set<number>();
    if (ids.length > 0) {
      const { data: rcpt } = await supabaseAdmin
        .from("vehicle_fueling")
        .select("id")
        .in("id", ids)
        .not("receipt_photo", "is", null);
      receiptIds = new Set((rcpt || []).map((r: any) => r.id));
    }
    const items = toCamelArray(data || []).map((r: any) => ({
      ...r,
      hasReceiptPhoto: receiptIds.has(r.id),
    }));
    const total = count ?? 0;
    res.json({
      data: items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  });

  app.get("/api/fueling/:id", requireAuth, async (req, res) => {
    const data = await storage.getVehicleFueling(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Abastecimento não encontrado" });
    res.json(data);
  });

  // Antes: baixava TODOS os abastecimentos do banco e fazia Math.max em JS pra
  // achar o km máximo de UM veículo. Em ~10k registros isso estourava
  // statement_timeout e derrubava o sistema em /api/fueling.
  // Agora: query pontual pegando só o maior km do veículo específico
  // (apoiada pelo índice idx_vfueling_vehicle_km criado em db-init.ts).
  async function syncVehicleKmFromFuelings(vehicleId: number) {
    const { data, error } = await supabaseAdmin
      .from("vehicle_fueling")
      .select("km")
      .eq("vehicle_id", vehicleId)
      .order("km", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return;
    const maxKm = Number((data as any).km);
    if (!Number.isFinite(maxKm) || maxKm <= 0) return;
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
      if (vehicle && vehicle.km > 0) {
        const kmDiff = parsed.data.km - vehicle.km;
        if (kmDiff > 1500) {
          return res.status(400).json({ message: `KM informado (${parsed.data.km}) é ${kmDiff} km a mais que o KM atual (${vehicle.km}). Diferença muito grande — verifique o hodômetro.` });
        }
      }
    }
    const { data: existing } = await supabaseAdmin.from("vehicle_fueling")
      .select("id")
      .eq("vehicle_id", parsed.data.vehicleId)
      .eq("km", parsed.data.km)
      .eq("date", parsed.data.date)
      .limit(1);
    if (existing && existing.length > 0) {
      return res.status(409).json({ message: "Abastecimento duplicado — já existe um registro com o mesmo veículo, KM e data." });
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
      const fuelAmount = Number(parsed.data.totalCost);
      await createAutoTransaction({
        description: `ABASTECIMENTO ${plateStr}${agentStr} - ${parsed.data.fuelType || "gasolina"} ${parsed.data.liters}L`.toUpperCase().trim(),
        amount: fuelAmount,
        type: "EXPENSE",
        due_date: parsed.data.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        origin_type: "fueling",
        origin_id: String(data.id),
        category_name: "Combustível",
        entity_name: [plateStr, driverEmp?.name, parsed.data.station].filter(Boolean).join(" | ") || null,
        created_by: "SISTEMA",
      });

      if (parsed.data.vehicleId) {
        const { data: activeOs } = await supabaseAdmin.from("service_orders")
          .select("id, os_number")
          .eq("vehicle_id", parsed.data.vehicleId)
          .in("status", ["ativa", "em_andamento", "em andamento"])
          .order("created_at", { ascending: false })
          .limit(1);
        const linkedOsId = activeOs?.[0]?.id || null;
        if (linkedOsId) {
          await supabaseAdmin.from("mission_costs").insert({
            service_order_id: linkedOsId,
            vehicle_id: parsed.data.vehicleId,
            employee_id: parsed.data.driverId || null,
            category: "Combustível",
            description: `Abastecimento ${plateStr} - ${parsed.data.fuelType || "gasolina"} ${parsed.data.liters}L (${parsed.data.station || "posto"}) [F#${data.id}]`,
            amount: fuelAmount.toFixed(2),
            cost_type: "expense",
          });
          console.log(`[Fueling→DRE] Admin linked fueling #${data.id} R$${fuelAmount.toFixed(2)} to OS #${activeOs[0].os_number}`);
        }
      }
    }

    if (data && data.id && parsed.data.receiptPhoto) {
      runAiValidation(data.id).catch(err => console.error(`[ai-validate] Background validation failed for fueling #${data.id}:`, err.message));
    }

    res.status(201).json(data);
  });

  app.patch("/api/fueling/:id", requireAuth, async (req, res) => {
    const parsed = insertVehicleFuelingSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const oldFueling = await storage.getVehicleFueling(Number(req.params.id));
    const data = await storage.updateVehicleFueling(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Abastecimento não encontrado" });
    if (oldFueling) {
      const auditChanges: { field: string; old: any; new_val: any }[] = [];
      for (const f of ["km", "liters", "totalCost", "costPerLiter", "fuelType", "station"]) {
        const ov = (oldFueling as any)[f]; const nv = (data as any)[f];
        if (nv !== undefined && String(ov) !== String(nv)) auditChanges.push({ field: f, old: ov, new_val: nv });
      }
      if (auditChanges.length > 0) await logFinancialAudit("vehicle_fueling", String(data.id), "UPDATE", auditChanges, req.user?.name || "unknown", req.user?.id);
    }
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
    if (existing) {
      await logFinancialAudit("vehicle_fueling", String(fuelingId), "DELETE", [
        { field: "km", old: existing.km, new_val: null },
        { field: "liters", old: existing.liters, new_val: null },
        { field: "totalCost", old: existing.totalCost, new_val: null },
      ], req.user?.name || "unknown", req.user?.id, "Exclusão manual");
    }
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

  // Endpoints de integração automática TicketLog REMOVIDOS (2026-05).
  // Status/buscar-autorizacao/consultar-nfe/upload-nfe/postos/validate-ticketlog
  // ficaram retornando 410 GONE pra qualquer cliente legado descobrir cedo.
  app.all(/^\/api\/ticketlog\/.*/, (_req, res) => {
    res.status(410).json({ message: "Integração TicketLog automática descontinuada. Use o fluxo manual em /admin/fueling." });
  });
  app.all(/^\/api\/fueling\/.*\/(validate-ticketlog|ticketlog-status)$/, (_req, res) => {
    res.status(410).json({ message: "Integração TicketLog automática descontinuada. Use o fluxo manual em /admin/fueling." });
  });
  app.all("/api/fueling/validate-ticketlog/batch", (_req, res) => {
    res.status(410).json({ message: "Integração TicketLog automática descontinuada. Use o fluxo manual em /admin/fueling." });
  });

  app.post("/api/fueling/ai-validate-batch", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { data: pending } = await supabaseAdmin.from("vehicle_fueling")
        .select("id")
        .not("receipt_photo", "is", null)
        .is("ai_validation_status", null)
        .order("id", { ascending: false })
        .limit(50);
      if (!pending || pending.length === 0) return res.json({ queued: 0, message: "Nenhum abastecimento pendente" });
      const queued = pending.length;
      res.json({ queued, message: `${queued} abastecimento(s) enviados para validação IA` });
      (async () => {
        for (const row of pending) {
          try { await runAiValidation(row.id); } catch (err: any) { console.error(`[ai-validate-batch] #${row.id} failed:`, err.message); }
          await new Promise(r => setTimeout(r, 2000));
        }
        console.log(`[ai-validate-batch] Completed ${queued} validations`);
      })();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/fueling/:id/ai-validate", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await runAiValidation(id);
      const updated = await storage.getVehicleFueling(id);
      if (!updated) return res.status(404).json({ message: "Abastecimento não encontrado" });
      const result = (updated as any).aiValidationResult || { status: "sem_foto" };
      res.json(result);
    } catch (err: any) {
      console.error("[ai-validate] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  }
  