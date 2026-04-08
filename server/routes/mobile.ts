import type { Express } from "express";
  import { storage, toCamelObj, toCamelArray, toSnakeObj } from "../storage";
  import { supabaseAdmin } from "../supabase";
  import { requireAuth, requireAdminRole, requireDiretoria } from "../auth";
  import { insertReferencePointSchema } from "@shared/schema";
  import { haversineDist, createAutoTransaction } from "./_helpers";

  const HQ_FALLBACK_LAT = -23.4890;
  const HQ_FALLBACK_LNG = -46.7234;
  const HQ_FALLBACK_RADIUS = 2000;

  async function getBaseCoords(): Promise<{ lat: number; lng: number; radius: number; name: string }> {
    const { data: bases } = await supabaseAdmin.from("reference_points").select("*").limit(1);
    if (bases && bases.length > 0) {
      return { lat: bases[0].latitude, lng: bases[0].longitude, radius: bases[0].radius_meters, name: bases[0].name };
    }
    return { lat: HQ_FALLBACK_LAT, lng: HQ_FALLBACK_LNG, radius: HQ_FALLBACK_RADIUS, name: "Sede Torres" };
  }

  export function registerMobileRoutes(app: Express) {
    app.get("/api/mobile/ponto/today", requireAuth, async (req: any, res) => {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) return res.json(null);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const { data: rows } = await supabaseAdmin.from("employee_timesheets").select("*")
        .eq("employee_id", employeeId)
        .gte("date", today.toISOString())
        .lte("date", tomorrow.toISOString())
        .limit(1);
      res.json(rows && rows[0] ? toCamelObj(rows[0]) : null);
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

      const { data: existingRows } = await supabaseAdmin.from("employee_timesheets").select("*")
        .eq("employee_id", employeeId)
        .gte("date", today.toISOString())
        .lte("date", tomorrow.toISOString())
        .limit(1);

      const record = existingRows && existingRows[0] ? toCamelObj<any>(existingRows[0]) : null;
      if (action === "clock_in") {
        if (record?.clockIn) return res.status(400).json({ message: "Entrada já registrada hoje" });
        if (!latitude || !longitude) return res.status(400).json({ message: "Localizacao obrigatoria para bater o ponto de entrada" });
        const parsedLat = parseFloat(latitude);
        const parsedLng = parseFloat(longitude);
        if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng) || parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
          return res.status(400).json({ message: "Coordenadas de localizacao invalidas" });
        }
        const GEOFENCE_RADIUS_METERS = 300;
        const base = await getBaseCoords();
        const distToHQ = haversineDist(parsedLat, parsedLng, base.lat, base.lng);
        const effectiveRadius = Math.max(base.radius, GEOFENCE_RADIUS_METERS);
        if (distToHQ > effectiveRadius) {
          return res.status(403).json({
            message: `Você está a ${Math.round(distToHQ)}m da base (${base.name}). Máximo permitido: ${effectiveRadius}m. Ative o GPS e tente novamente.`,
            code: "GEOFENCE_BLOCKED",
            distance: Math.round(distToHQ),
          });
        }
        if (record) {
          const { data: updated } = await supabaseAdmin.from("employee_timesheets")
            .update({ clock_in: timeStr, clock_in_photo: photo, clock_in_lat: latitude, clock_in_lng: longitude, clock_in_address: address || null })
            .eq("id", record.id).select().single();
          return res.json(toCamelObj(updated));
        }
        const { data: created } = await supabaseAdmin.from("employee_timesheets").insert({
          employee_id: employeeId, date: now.toISOString(),
          clock_in: timeStr, clock_in_photo: photo, clock_in_lat: latitude, clock_in_lng: longitude, clock_in_address: address || null,
        }).select().single();
        return res.json(toCamelObj(created));
      }
      if (!record) return res.status(400).json({ message: "Registre a entrada primeiro" });

      if (!latitude || !longitude) return res.status(400).json({ message: "Localização obrigatória para registrar o ponto" });
      const pLat = parseFloat(latitude);
      const pLng = parseFloat(longitude);
      if (!Number.isFinite(pLat) || !Number.isFinite(pLng) || pLat < -90 || pLat > 90 || pLng < -180 || pLng > 180) {
        return res.status(400).json({ message: "Coordenadas de localização inválidas" });
      }

      const GEOFENCE_RADIUS_METERS = 300;
      if (action === "clock_out") {
        const base = await getBaseCoords();
        const distToBase = haversineDist(pLat, pLng, base.lat, base.lng);
        const effectiveRadius = Math.max(base.radius, GEOFENCE_RADIUS_METERS);
        if (distToBase > effectiveRadius) {
          return res.status(403).json({
            message: `Você está a ${Math.round(distToBase)}m da base (${base.name}). Máximo permitido: ${effectiveRadius}m. Ative o GPS e tente novamente.`,
            code: "GEOFENCE_BLOCKED",
            distance: Math.round(distToBase),
          });
        }
      }

      const updateMap: Record<string, any> = {
        lunch_out: { lunch_out: timeStr, lunch_out_photo: photo, lunch_out_lat: latitude, lunch_out_lng: longitude, lunch_out_address: address || null },
        lunch_in: { lunch_in: timeStr, lunch_in_photo: photo, lunch_in_lat: latitude, lunch_in_lng: longitude, lunch_in_address: address || null },
        clock_out: { clock_out: timeStr, clock_out_photo: photo, clock_out_lat: latitude, clock_out_lng: longitude, clock_out_address: address || null },
      };
      const updates = updateMap[action];
      if (!updates) return res.status(400).json({ message: "Ação inválida" });

      if (action === "lunch_out" && record.lunchOut) return res.status(400).json({ message: "Saída almoço já registrada" });
      if (action === "lunch_in" && !record.lunchOut) return res.status(400).json({ message: "Registre a saída almoço primeiro" });
      if (action === "lunch_in" && record.lunchIn) return res.status(400).json({ message: "Retorno almoço já registrado" });
      if (action === "clock_out" && record.clockOut) return res.status(400).json({ message: "Saída já registrada" });

      const { data: updated } = await supabaseAdmin.from("employee_timesheets")
        .update(updates)
        .eq("id", record.id).select().single();
      res.json(toCamelObj(updated));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/employees/:id/ponto-detalhado/:timesheetId", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const empId = Number(req.params.id);
      const { data: tsRows } = await supabaseAdmin.from("employee_timesheets").select("*").eq("id", Number(req.params.timesheetId)).eq("employee_id", empId).limit(1);
      if (!tsRows || !tsRows[0]) return res.status(404).json({ message: "Registro nao encontrado" });
      const record = toCamelObj<any>(tsRows[0]);

      const employee = await storage.getEmployee(empId);

      const base = await getBaseCoords();
      const checkLocation = (lat: string | null, lng: string | null) => {
        if (!lat || !lng) return { lat: null, lng: null, distance: null, atHQ: false, atHome: false };
        const la = parseFloat(lat), lo = parseFloat(lng);
        const distHQ = haversineDist(la, lo, base.lat, base.lng);
        let distHome: number | null = null;
        let atHome = false;
        if (employee && (employee as any).addressLat && (employee as any).addressLng) {
          distHome = haversineDist(la, lo, parseFloat((employee as any).addressLat), parseFloat((employee as any).addressLng));
          atHome = distHome <= 500;
        }
        return { lat: la, lng: lo, distance: Math.round(distHQ), atHQ: distHQ <= base.radius, atHome, distHome: distHome !== null ? Math.round(distHome) : null };
      };

      res.json({
        ...record,
        employeeName: employee?.name || "--",
        employeeAddress: employee?.address || null,
        clockInGeo: checkLocation(record.clockInLat, record.clockInLng),
        clockOutGeo: checkLocation(record.clockOutLat, record.clockOutLng),
        lunchOutGeo: checkLocation(record.lunchOutLat, record.lunchOutLng),
        lunchInGeo: checkLocation(record.lunchInLat, record.lunchInLng),
        hqAddress: base.name,
        hqRadius: base.radius,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/admin/ponto/liberar-remoto", requireAdminRole, async (req: any, res) => {
    try {
      const { employeeId, action, latitude, longitude, motivo } = req.body;
      if (!employeeId || !action) return res.status(400).json({ message: "employeeId e action são obrigatórios" });

      const user = req.user;
      const now = new Date();
      const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

      const { data: existingR } = await supabaseAdmin.from("employee_timesheets").select("*")
        .eq("employee_id", employeeId)
        .gte("date", today.toISOString())
        .lte("date", tomorrow.toISOString())
        .limit(1);

      const record = existingR && existingR[0] ? toCamelObj<any>(existingR[0]) : null;
      const obs = `[LIBERAÇÃO REMOTA por ${user?.name || "Admin"}: ${motivo || "Falha de GPS"}]`;

      if (action === "clock_in") {
        if (record?.clockIn) return res.status(400).json({ message: "Entrada já registrada hoje" });
        if (record) {
          const { data: updated } = await supabaseAdmin.from("employee_timesheets")
            .update({ clock_in: timeStr, clock_in_lat: latitude || null, clock_in_lng: longitude || null, clock_in_address: obs })
            .eq("id", record.id).select().single();
          return res.json({ ...toCamelObj(updated), liberadoRemotamente: true });
        }
        const { data: created } = await supabaseAdmin.from("employee_timesheets").insert({
          employee_id: employeeId, date: now.toISOString(),
          clock_in: timeStr, clock_in_lat: latitude || null, clock_in_lng: longitude || null, clock_in_address: obs,
        }).select().single();
        return res.json({ ...toCamelObj(created), liberadoRemotamente: true });
      }

      if (!record) return res.status(400).json({ message: "Registre a entrada primeiro" });

      const updateMap2: Record<string, any> = {
        lunch_out: { lunch_out: timeStr, lunch_out_lat: latitude || null, lunch_out_lng: longitude || null, lunch_out_address: obs },
        lunch_in: { lunch_in: timeStr, lunch_in_lat: latitude || null, lunch_in_lng: longitude || null, lunch_in_address: obs },
        clock_out: { clock_out: timeStr, clock_out_lat: latitude || null, clock_out_lng: longitude || null, clock_out_address: obs },
      };
      const updates = updateMap2[action];
      if (!updates) return res.status(400).json({ message: "Ação inválida" });

      const { data: updated } = await supabaseAdmin.from("employee_timesheets")
        .update(updates)
        .eq("id", record.id).select().single();

      console.log(`[ponto] LIBERAÇÃO REMOTA: ${user?.name} liberou ${action} para employee ${employeeId}. Motivo: ${motivo || "Falha GPS"}`);
      res.json({ ...toCamelObj(updated), liberadoRemotamente: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── MOBILE: Abastecimento ──────────────────────────────────────────
  app.get("/api/mobile/abastecimento/vehicles", requireAuth, async (req: any, res) => {
    try {
      const { data: allVehicles } = await supabaseAdmin.from("vehicles").select("id, plate, model, km, last_oil_change_km, frota")
        .not("status", "in", '("inativo","vendido","baixado")')
        .order("plate", { ascending: true });
      res.json(allVehicles || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/mobile/abastecimento/vehicle", requireAuth, async (req: any, res) => {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) return res.json(null);
      const { data: assignments } = await supabaseAdmin.from("vehicle_assignments").select("vehicle_id, vehicles(id, plate, model, km, last_oil_change_km)")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(1);
      const veh = assignments?.[0]?.vehicles;
      res.json(veh || null);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/mobile/abastecimento", requireAuth, async (req: any, res) => {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) return res.status(400).json({ message: "Funcionário não identificado" });
      const { vehicleId, km, liters, costPerLiter, totalCost, fuelType, station, receiptPhoto, pumpPhoto, odometerPhoto, platePhoto, latitude, longitude, address, gasolinePrice, ethanolPrice, fuelRecommendation, recommendationFollowed } = req.body;
      if (!vehicleId || !km) return res.status(400).json({ message: "Veículo e KM obrigatórios" });
      if (!receiptPhoto || typeof receiptPhoto !== "string" || !receiptPhoto.startsWith("data:image/")) return res.status(400).json({ message: "Foto da NF obrigatória (formato inválido)" });
      if (!pumpPhoto || typeof pumpPhoto !== "string" || !pumpPhoto.startsWith("data:image/")) return res.status(400).json({ message: "Foto da bomba obrigatória (formato inválido)" });
      if (!odometerPhoto || typeof odometerPhoto !== "string" || !odometerPhoto.startsWith("data:image/")) return res.status(400).json({ message: "Foto do hodômetro obrigatória (formato inválido)" });

      const { data: vehicleRows } = await supabaseAdmin.from("vehicles").select("*").eq("id", vehicleId).limit(1);
      if (!vehicleRows || !vehicleRows.length) return res.status(404).json({ message: "Veículo não encontrado" });
      const vehicle = vehicleRows;
      const currentKm = vehicle[0]?.km || 0;
      if (vehicle[0] && km < currentKm) {
        return res.status(400).json({ message: `KM informado (${km}) é menor que o KM atual (${currentKm})` });
      }
      if (currentKm > 0) {
        const kmDiff = km - currentKm;
        if (kmDiff > 1500) {
          return res.status(400).json({ message: `KM informado (${km}) é ${kmDiff} km a mais que o atual (${currentKm}). Diferença muito grande — verifique o hodômetro.` });
        }
      }

      const todayDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const { data: dupCheck } = await supabaseAdmin.from("vehicle_fueling")
        .select("id")
        .eq("vehicle_id", vehicleId)
        .eq("date", todayDate)
        .eq("total_cost", String(totalCost || (Number(liters || 0) * Number(costPerLiter || 0))))
        .limit(1);
      if (dupCheck && dupCheck.length > 0) {
        return res.status(409).json({ message: "Abastecimento já registrado — registro duplicado detectado." });
      }

      const { data: fueling } = await supabaseAdmin.from("vehicle_fueling").insert({
        vehicle_id: vehicleId, driver_id: employeeId, date: todayDate,
        liters: liters?.toString() || "0", cost_per_liter: costPerLiter?.toString(), total_cost: totalCost?.toString(),
        km, fuel_type: fuelType || "gasolina", full_tank: true, station,
        receipt_photo: receiptPhoto, pump_photo: pumpPhoto, odometer_photo: odometerPhoto, plate_photo: platePhoto, latitude: latitude ? Number(latitude) : null, longitude: longitude ? Number(longitude) : null, address,
        gasoline_price: gasolinePrice ? gasolinePrice.toString() : null,
        ethanol_price: ethanolPrice ? ethanolPrice.toString() : null,
        fuel_recommendation: fuelRecommendation || null,
        recommendation_followed: recommendationFollowed != null ? recommendationFollowed : null,
        created_by_user_id: req.user?.id || null,
      }).select().single();

      await supabaseAdmin.from("vehicles").update({ km, last_km_update: new Date().toISOString() }).eq("id", vehicleId);

      const derivedTotal = Number(totalCost) > 0 ? Number(totalCost) : (Number(liters || 0) * Number(costPerLiter || 0));
      if (fueling && derivedTotal > 0) {
        const plateStr = vehicle[0]?.plate || "";
        const { data: driverEmp } = await supabaseAdmin.from("employees").select("name").eq("id", employeeId).limit(1).single();
        const agentStr = driverEmp?.name ? ` - Agente: ${driverEmp.name}` : "";
        await createAutoTransaction({
          description: `ABASTECIMENTO ${plateStr}${agentStr} - ${fuelType || "gasolina"} ${liters}L`.toUpperCase().trim(),
          amount: derivedTotal,
          type: "EXPENSE",
          due_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
          origin_type: "fueling",
          origin_id: String(fueling.id),
          category_name: "Combustível",
          entity_name: [plateStr, driverEmp?.name, station].filter(Boolean).join(" | ") || null,
          created_by: "SISTEMA",
        });

        const { data: activeOs } = await supabaseAdmin.from("service_orders")
          .select("id, os_number")
          .eq("vehicle_id", vehicleId)
          .in("status", ["ativa", "em_andamento", "em andamento"])
          .order("created_at", { ascending: false })
          .limit(1);
        const linkedOsId = activeOs?.[0]?.id || null;
        if (linkedOsId) {
          await supabaseAdmin.from("mission_costs").insert({
            service_order_id: linkedOsId,
            vehicle_id: vehicleId,
            employee_id: employeeId,
            category: "Combustível",
            description: `Abastecimento ${plateStr} - ${fuelType || "gasolina"} ${liters}L (${station || "posto"}) [F#${fueling.id}]`,
            amount: derivedTotal.toFixed(2),
            cost_type: "expense",
            latitude: latitude ? Number(latitude) : null,
            longitude: longitude ? Number(longitude) : null,
          });
          console.log(`[Fueling→DRE] Linked fueling #${fueling.id} R$${derivedTotal.toFixed(2)} to OS #${activeOs[0].os_number} (id=${linkedOsId})`);
        }
      }

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

  // ─── MOBILE: Pedágio com Missão (Reembolso = Custo + Receita) ──────
  app.post("/api/mobile/pedagio-missao", requireAuth, async (req: any, res) => {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) return res.status(400).json({ message: "Funcionário não identificado" });

      const { serviceOrderId, amount, photoUrl, latitude, longitude } = req.body;
      const parsedAmount = Number(amount);
      if (!serviceOrderId) return res.status(400).json({ message: "ID da missão obrigatório" });
      if (!parsedAmount || parsedAmount <= 0) return res.status(400).json({ message: "Valor do pedágio obrigatório" });
      if (!photoUrl || typeof photoUrl !== "string" || !photoUrl.startsWith("data:image/"))
        return res.status(400).json({ message: "Foto do comprovante obrigatória" });

      const os = await storage.getServiceOrder(Number(serviceOrderId));
      if (!os) return res.status(404).json({ message: "OS não encontrada" });

      const activeStatuses = ["ativa", "em_andamento", "em_transito", "em trânsito"];
      if (!activeStatuses.includes((os.status || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())) {
        return res.status(400).json({ message: "OS não está ativa ou em andamento" });
      }

      const isAssigned = os.assignedEmployeeId === employeeId || os.assignedEmployee2Id === employeeId;
      if (!isAssigned) {
        return res.status(403).json({ message: "Você não está designado para esta missão" });
      }

      const vehicleId = os.vehicleId || null;
      let vehiclePlate = "Sem viatura";
      if (vehicleId) {
        const { data: vData } = await supabaseAdmin.from("vehicles").select("plate").eq("id", vehicleId).limit(1).single();
        vehiclePlate = vData?.plate || "Desconhecida";
      }
      const { data: empData } = await supabaseAdmin.from("employees").select("name").eq("id", employeeId).limit(1).single();
      const empName = empData?.name || "Agente";
      const osNum = os.osNumber || `OS-${serviceOrderId}`;

      const { data: existingTolls } = await supabaseAdmin.from("mission_costs")
        .select("id")
        .eq("service_order_id", Number(serviceOrderId))
        .eq("category", "Pedágio")
        .eq("cost_type", "expense")
        .eq("amount", parsedAmount.toFixed(2))
        .eq("employee_id", employeeId);
      if (existingTolls && existingTolls.length > 0) {
        return res.status(409).json({ message: "Pedágio com este valor já foi registrado para esta OS. Se for um pedágio diferente, registre com valor distinto." });
      }

      const pedagioIdaVolta = !!(os as any).pedagioIdaVolta;
      const finalAmount = pedagioIdaVolta ? parsedAmount * 2 : parsedAmount;
      const descLabel = pedagioIdaVolta ? `Pedágio (Ida + Volta) - ${empName} (${vehiclePlate})` : `Pedágio - ${empName} (${vehiclePlate})`;

      const { data: costRecord, error: costErr } = await supabaseAdmin.from("mission_costs").insert({
        service_order_id: Number(serviceOrderId),
        vehicle_id: vehicleId,
        employee_id: employeeId,
        category: "Pedágio",
        description: descLabel,
        amount: finalAmount.toFixed(2),
        cost_type: "expense",
        photo_url: photoUrl,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
      }).select().single();
      if (costErr) throw new Error(costErr.message);

      const { data: revRecord, error: revErr } = await supabaseAdmin.from("mission_costs").insert({
        service_order_id: Number(serviceOrderId),
        vehicle_id: vehicleId,
        employee_id: employeeId,
        category: "Pedágio",
        description: descLabel,
        amount: finalAmount.toFixed(2),
        cost_type: "revenue",
        photo_url: photoUrl,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
      }).select().single();
      if (revErr) {
        await supabaseAdmin.from("mission_costs").delete().eq("id", costRecord.id);
        throw new Error("Falha ao criar registro de reembolso: " + revErr.message);
      }

      const todayBRT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const txLabel = pedagioIdaVolta ? "PEDÁGIO (IDA+VOLTA)" : "PEDÁGIO";
      await createAutoTransaction({
        description: `CUSTO MISSÃO ${osNum} - ${txLabel} ${empName} (${vehiclePlate})`.toUpperCase().trim(),
        amount: finalAmount,
        type: "EXPENSE",
        due_date: todayBRT,
        origin_type: "mission_cost",
        origin_id: String(costRecord.id),
        category_name: "Custos de Missão",
        entity_name: vehiclePlate,
        created_by: "SISTEMA",
      });
      await createAutoTransaction({
        description: `RECEITA MISSÃO ${osNum} - ${txLabel} ${empName} (${vehiclePlate})`.toUpperCase().trim(),
        amount: finalAmount,
        type: "INCOME",
        due_date: todayBRT,
        origin_type: "mission_cost",
        origin_id: String(revRecord?.id || costRecord.id),
        category_name: "Receitas de Missão",
        entity_name: vehiclePlate,
        created_by: "SISTEMA",
      });

      console.log(`[pedagio-missao] Agent ${empName} registered R$${finalAmount.toFixed(2)} toll${pedagioIdaVolta ? " (ida+volta)" : ""} for OS ${osNum} (${vehiclePlate})`);
      res.status(201).json({ success: true, costRecord, revRecord, vehiclePlate, osNumber: osNum });
    } catch (err: any) {
      console.error("[pedagio-missao] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ─── MOBILE: Pedágio Vazio (deslocamento sem OS) ──────────────────
  app.post("/api/mobile/pedagio-vazio", requireAuth, async (req: any, res) => {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) return res.status(400).json({ message: "Funcionário não identificado" });

      const { amount, photoUrl, latitude, longitude } = req.body;
      const parsedAmount = Number(amount);
      if (!parsedAmount || parsedAmount <= 0) return res.status(400).json({ message: "Valor do pedágio obrigatório" });
      if (!photoUrl || typeof photoUrl !== "string" || !photoUrl.startsWith("data:image/"))
        return res.status(400).json({ message: "Foto do comprovante obrigatória" });
      if (!latitude || !longitude)
        return res.status(400).json({ message: "Localização GPS obrigatória" });

      const { data: lastAssignment } = await supabaseAdmin
        .from("vehicle_assignments")
        .select("vehicle_id")
        .eq("employee_id", employeeId)
        .eq("action", "vincular")
        .order("created_at", { ascending: false })
        .limit(1);

      let vehicleId = lastAssignment?.[0]?.vehicle_id || null;

      if (!vehicleId) {
        const { data: activeOs } = await supabaseAdmin.from("service_orders")
          .select("vehicle_id")
          .or(`assigned_employee_id.eq.${employeeId},assigned_employee2_id.eq.${employeeId}`)
          .eq("status", "ativa")
          .limit(1);
        if (activeOs?.length && activeOs[0].vehicle_id) {
          vehicleId = activeOs[0].vehicle_id;
        }
      }

      let vehiclePlate = "Sem viatura";
      if (vehicleId) {
        const { data: vData } = await supabaseAdmin.from("vehicles")
          .select("plate").eq("id", vehicleId).limit(1).single();
        vehiclePlate = vData?.plate || "Desconhecida";
      }

      const { data: empData } = await supabaseAdmin.from("employees")
        .select("name").eq("id", employeeId).limit(1).single();
      const empName = empData?.name || "Agente";

      const { data: record, error: insertError } = await supabaseAdmin.from("mission_costs").insert({
        service_order_id: null,
        vehicle_id: vehicleId,
        employee_id: employeeId,
        category: "Pedágio",
        description: `Custo de Deslocamento Vazio - ${empName} (${vehiclePlate})`,
        amount: parsedAmount.toFixed(2),
        cost_type: "expense",
        photo_url: photoUrl,
        latitude: Number(latitude),
        longitude: Number(longitude),
      }).select().single();

      if (insertError) throw new Error(insertError.message);

      const todayBRT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const { error: txError } = await supabaseAdmin.from("financial_transactions").insert({
        type: "EXPENSE",
        status: "PENDING",
        category_name: "Custos Fixos/Deslocamento Extra",
        description: `Pedágio Vazio - ${empName} (${vehiclePlate})`,
        amount: parsedAmount.toFixed(2),
        due_date: todayBRT,
        origin_type: "mission_cost",
        origin_id: String(record.id),
        entity_name: vehiclePlate,
        created_by: "SISTEMA",
      });
      if (txError) {
        console.error("[pedagio-vazio] Financial transaction error:", txError.message);
      }

      console.log(`[pedagio-vazio] Agent ${empName} (${employeeId}) registered R$${parsedAmount.toFixed(2)} toll for vehicle ${vehiclePlate} (${vehicleId})`);
      res.status(201).json({ success: true, record, vehiclePlate });
    } catch (err: any) {
      console.error("[pedagio-vazio] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ─── MOBILE: Ocorrências ───────────────────────────────────────────
  app.get("/api/mobile/ocorrencias", requireAuth, async (req: any, res) => {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) return res.json([]);
      const { data: rows } = await supabaseAdmin.from("employee_occurrences").select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      res.json(toCamelArray(rows || []));
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
      const { data: record } = await supabaseAdmin.from("employee_occurrences").insert({
        employee_id: employeeId, vehicle_id: vehicleId || null, type, description: description.substring(0, 2000),
        photos: validPhotos, latitude, longitude,
      }).select().single();
      res.status(201).json(toCamelObj(record));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── ADMIN: Ocorrências management ─────────────────────────────────
  app.get("/api/ocorrencias", requireAdminRole, async (_req, res) => {
    try {
      const { data: rows } = await supabaseAdmin.from("employee_occurrences").select("*").order("created_at", { ascending: false });
      res.json(toCamelArray(rows || []));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/ocorrencias/:id", requireAdminRole, async (req, res) => {
    try {
      const { status, adminNotes } = req.body;
      const updateData: Record<string, any> = {};
      if (status) updateData.status = status;
      if (adminNotes !== undefined) updateData.admin_notes = adminNotes;
      const { data: updated } = await supabaseAdmin.from("employee_occurrences")
        .update(updateData)
        .eq("id", Number(req.params.id)).select().single();
      if (!updated) return res.status(404).json({ message: "Ocorrência não encontrada" });
      res.json(toCamelObj(updated));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Oil change alert check ─────────────────────────────────────────
  app.get("/api/mobile/oil-alert/:vehicleId", requireAuth, async (req, res) => {
    try {
      const { data: vRows } = await supabaseAdmin.from("vehicles").select("*").eq("id", Number(req.params.vehicleId)).limit(1);
      if (!vRows || !vRows[0]) return res.json({ alert: null });
      const oilKm = vRows[0].last_oil_change_km || 0;
      const currentKm = vRows[0].km || 0;
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
      const { data: rows } = await supabaseAdmin.from("reference_points").select("*").order("name", { ascending: true });
      res.json(toCamelArray(rows || []));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/reference-points", requireAuth, async (req, res) => {
    try {
      const parsed = insertReferencePointSchema.parse(req.body);
      const { data: row } = await supabaseAdmin.from("reference_points").insert(toSnakeObj(parsed)).select().single();
      res.json(toCamelObj(row));
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
      if (radiusMeters !== undefined) updates.radius_meters = radiusMeters;
      if (color !== undefined) updates.color = color;
      const { data: row } = await supabaseAdmin.from("reference_points").update(updates).eq("id", id).select().single();
      if (!row) return res.status(404).json({ message: "Ponto não encontrado" });
      res.json(toCamelObj(row));
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/reference-points/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await supabaseAdmin.from("reference_points").delete().eq("id", id);
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

      const { data: locations } = await supabaseAdmin.from("agent_location_history")
        .select("latitude, longitude, speed, created_at")
        .eq("employee_id", empId)
        .gte("created_at", entrada.toISOString())
        .lte("created_at", saida.toISOString())
        .order("created_at", { ascending: true });

      let horasAtivo = 0;
      let horasSobreaviso = 0;
      let horasNoturno = 0;
      let paradoDesdeMs: number | null = null;

      const locs = locations || [];
      const SPEED_THRESHOLD = 5;
      const SOBREAVISO_MIN = 60;

      for (let i = 0; i < locs.length; i++) {
        const loc = locs[i];
        const locTime = new Date(loc.created_at);
        const nextTime = i < locs.length - 1 ? new Date(locs[i + 1].created_at) : saida;
        const slotHours = (nextTime.getTime() - locTime.getTime()) / (1000 * 60 * 60);
        if (slotHours <= 0) continue;

        const speed = Number(loc.speed || 0);
        const isMoving = speed > SPEED_THRESHOLD;

        if (isMoving) {
          horasAtivo += slotHours;
          paradoDesdeMs = null;
        } else {
          if (paradoDesdeMs === null) paradoDesdeMs = locTime.getTime();
          const minutosParado = (nextTime.getTime() - paradoDesdeMs) / 60000;
          if (minutosParado >= SOBREAVISO_MIN) {
            horasSobreaviso += slotHours;
          } else {
            horasAtivo += slotHours;
          }
        }

        const brHour = Number(locTime.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
        if (brHour >= 22 || brHour < 5) {
          horasNoturno += slotHours;
        }
      }

      if (locs.length === 0) {
        horasAtivo = horasDecimal;
        const cursor = new Date(entrada);
        while (cursor < saida) {
          const brH = Number(cursor.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
          if (brH >= 22 || brH < 5) horasNoturno += 1 / 60;
          cursor.setTime(cursor.getTime() + 60000);
        }
      }

      const horasExtras = Math.max(0, horasDecimal - 8);

      const { data, error } = await supabaseAdmin.from("ponto_operacional").update({
        saida: saida.toISOString(),
        horas_decimal: horasDecimal,
        horas_ativo: +horasAtivo.toFixed(2),
        horas_sobreaviso: +horasSobreaviso.toFixed(2),
        horas_noturno: +horasNoturno.toFixed(2),
        horas_extras: +horasExtras.toFixed(2),
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

  }
  