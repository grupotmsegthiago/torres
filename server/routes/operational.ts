import type { Express } from "express";
  import { storage } from "../storage";
  import { supabaseAdmin } from "../supabase";
  import { requireAuth, requireAdminRole } from "../auth";
  import * as truckscontrol from "../truckscontrol";
  import { processTelemetry } from "../telemetry-engine";
  import { nominatimGeocode } from "../db-init";
  import { getHorasElapsedFromDB, calcularFaturamentoLive, extractKmFromText } from "../billing-calc";
  import { haversineDist } from "./_helpers";

  export const lastMissionPos: Map<number, { lat: number; lng: number }> = new Map();
  export const lastRecordedPos: Map<number, { lat: number; lng: number; time: number; osId?: number }> = new Map();
  export const MISSION_POS_MIN_DISTANCE = 50;
  const OFF_ROUTE_THRESHOLD_M = 200;
  const SMART_INTERVAL_DEFAULT_MS = 10 * 60 * 1000;
  const SMART_INTERVAL_FAST_MS = 1 * 60 * 1000;
  const SMART_INTERVAL_DISPLACEMENT_M = 500;

  export function registerOperationalRoutes(app: Express) {
    // ====================== OPERATIONAL GRID ======================

  app.get("/api/operational-grid", requireAuth, requireAdminRole, async (_req, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    const orders = await storage.getServiceOrders();
    const gridVehicles = await storage.getVehicles();
    const todayBRT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const activeOrders = orders.filter(
      (o) => {
        const sdBRT = o.scheduledDate ? new Date(o.scheduledDate).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : null;
        if (sdBRT && sdBRT > todayBRT) return false;
        if ((o.status === "em_andamento" || o.status === "aberta" || o.status === "agendada") && o.missionStatus !== "encerrada") {
          return true;
        }
        const isConcluida = o.status === "concluida" || o.status === "concluída";
        if (isConcluida || o.missionStatus === "encerrada" || o.status === "cancelada" || o.status === "recusada") {
          const cdBRT = o.completedDate ? new Date(o.completedDate).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : null;
          const udBRT = o.updatedAt ? new Date(o.updatedAt).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : null;
          if (sdBRT === todayBRT || cdBRT === todayBRT || udBRT === todayBRT) return true;
        }
        return false;
      }
    );

    for (const ao of activeOrders) {
      if (ao.status === "em_andamento" && (!ao.originLat || !ao.destinationLat)) {
        (async () => {
          try {
            const geoUpdates: any = {};
            if (!ao.originLat && ao.origin) {
              const geo = await nominatimGeocode(ao.origin);
              if (geo) { geoUpdates.originLat = geo.lat; geoUpdates.originLng = geo.lng; }
            }
            if (!ao.destinationLat && ao.destination) {
              const geo = await nominatimGeocode(ao.destination);
              if (geo) { geoUpdates.destinationLat = geo.lat; geoUpdates.destinationLng = geo.lng; }
            }
            if (Object.keys(geoUpdates).length > 0) {
              await storage.updateServiceOrder(ao.id, geoUpdates);
              console.log(`[grid] Auto-geocoded OS ${ao.osNumber}: origin=${geoUpdates.originLat ? "OK" : "skip"} dest=${geoUpdates.destinationLat ? "OK" : "skip"}`);
            }
          } catch (_e) {}
        })();
      }
    }

    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const vehicleFuelCache = new Map<string, number>();
    try {
      const { data: allFuelRecords } = await supabaseAdmin.from("financial_transactions")
        .select("amount, description, created_at")
        .eq("origin_type", "fueling")
        .gte("created_at", todayStr + "T00:00:00")
        .lte("created_at", todayStr + "T23:59:59")
        .order("created_at", { ascending: false })
        .limit(200);
      if (allFuelRecords) {
        for (const fr of allFuelRecords) {
          const desc = (fr.description || "").toUpperCase();
          for (const gv of gridVehicles) {
            const plate = gv.plate?.toUpperCase() || "";
            if (!plate) continue;
            if (desc.includes(plate)) {
              vehicleFuelCache.set(plate, (vehicleFuelCache.get(plate) || 0) + Number(fr.amount || 0));
            }
          }
        }
      }
    } catch (_e) {}

    const vehicleFuelFirstOS = new Map<string, number>();
    const toDateBRT = (d: any) => d ? new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : todayStr;
    for (const o of activeOrders) {
      if (!o.vehicleId) continue;
      const gv = gridVehicles.find(vv => vv.id === o.vehicleId);
      const vPlate = gv?.plate?.toUpperCase() || "";
      if (!vPlate) continue;
      const oDate = toDateBRT(o.scheduledDate);
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
      const oDate = toDateBRT(o.scheduledDate);
      const fuelKey = `${vPlate}:${oDate}`;
      if (!vehicleFuelFirstOS.has(fuelKey) && o.fuelAllocated !== false) {
        vehicleFuelFirstOS.set(fuelKey, o.id);
      }
    }

    const vehicleVazioCosts = new Map<number, number>();
    try {
      const { data: vazioCosts } = await supabaseAdmin.from("mission_costs")
        .select("vehicle_id, amount")
        .is("service_order_id", null)
        .not("vehicle_id", "is", null)
        .gte("created_at", todayStr + "T00:00:00")
        .lte("created_at", todayStr + "T23:59:59");
      if (vazioCosts) {
        for (const vc of vazioCosts) {
          if (vc.vehicle_id) {
            vehicleVazioCosts.set(vc.vehicle_id, (vehicleVazioCosts.get(vc.vehicle_id) || 0) + Number(vc.amount || 0));
          }
        }
      }
    } catch (_e) {}

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

        const { data: lastUpdate } = await supabaseAdmin.from("mission_updates").select("*")
          .eq("service_order_id", o.id).eq("read_by_admin", 0)
          .order("created_at", { ascending: false })
          .limit(1);

        const { data: recentUpdates } = await supabaseAdmin.from("mission_updates").select("*")
          .eq("service_order_id", o.id)
          .order("created_at", { ascending: false })
          .limit(5);

        let liveCost: {
          km_inicial: number; km_atual: number; km_total: number;
          horas_missao: number;
          faturamento: number; pagamento: number; resultado: number; margem_pct: number;
          custo_combustivel: number; custo_pedagio: number; custo_outros: number; custo_total: number;
          contrato_nome: string | null;
          contrato_valores: { valor_acionamento: number; franquia_horas: number; franquia_km: number; valor_hora_extra: number; valor_km_extra: number; valor_km_carregado: number; vrp_base: number } | null;
        } | null = null;

        if ((o.status === "em_andamento" || o.status === "agendada" || o.status === "concluida" || o.status === "concluída" || o.status === "cancelada" || o.missionStatus === "encerrada") && o.type === "escolta" && o.status !== "recusada") {
          try {
            const photos = await storage.getMissionPhotosByOS(o.id);
            const kmSaidaPhoto = photos.find((p: any) => p.step === "km_saida");
            const kmChegadaPhoto = photos.find((p: any) => p.step === "km_chegada");
            const kmFinalPhoto = photos.find((p: any) => p.step === "km_final");
            const kmInicial = kmChegadaPhoto?.kmValue || 0;
            const kmAtual = kmFinalPhoto?.kmValue || kmInicial;

            const parseBRT = (v: any) => { const s = String(v); return new Date(s.includes("Z") || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + "Z"); };
            const missionStartDate = o.missionStartedAt ? parseBRT(o.missionStartedAt) : null;
            const missionEndDate = o.completedDate ? parseBRT(o.completedDate) : null;
            const nowDate = new Date();

            const startTime = missionStartDate ? missionStartDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : undefined;
            const endTime = missionEndDate ? missionEndDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : null;
            const nowTime = endTime || nowDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

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
            const kmFinalNorm = kmAtual > kmInicial ? kmAtual : kmInicial;

            const missionNotStartedYet = !o.missionStatus || o.missionStatus === "aguardando";
            const scheduledInFuture = (() => {
              if (!o.scheduledDate) return false;
              const sched = new Date(String(o.scheduledDate).includes("Z") || /[+-]\d{2}:\d{2}$/.test(String(o.scheduledDate)) ? String(o.scheduledDate) : String(o.scheduledDate) + "Z");
              const nowBRT = new Date();
              return sched.getTime() > nowBRT.getTime();
            })();
            const skipBillingHours = missionNotStartedYet || (o.status === "agendada" && scheduledInFuture);

            const horasCalcRaw = skipBillingHours ? 0 : await getHorasElapsedFromDB(o.id);

            const kmTexto = extractKmFromText(o.destination) || extractKmFromText(o.route);
            let kmRota: number | undefined;
            if (kmTexto) {
              kmRota = kmTexto;
            } else if (o.originLat && o.originLng && o.destinationLat && o.destinationLng) {
              const haversineKm = haversineDist(
                Number(o.originLat), Number(o.originLng),
                Number(o.destinationLat), Number(o.destinationLng)
              ) / 1000;
              kmRota = Math.round(haversineKm * 1.4);
              if (o.pedagioIdaVolta) kmRota *= 2;
            }

            const billing = calcularFaturamentoLive({
              horasMissao: horasCalcRaw,
              kmInicial,
              kmFinal: kmFinalNorm,
              contrato,
              kmRota,
            });

            const hasAcionamento = billing.has_acionamento;
            const fatHoraExtra = billing.fat_hora_extra;
            const fatKmExtra = billing.fat_km;

            let fatBase = billing.fat_total;
            if (fatBase === 0 && o.status === "agendada" && o.valorEstimado) {
              fatBase = Number(o.valorEstimado) || 0;
            }

            const resultado = {
              faturamento: { total: fatBase },
              pagamento: { total: n2(contrato.vrp_base) },
              km_total: billing.km_total,
            };

            const horasCalc = horasCalcRaw;

            let custoCombustivel = 0;
            let custoPedagio = 0;
            let custoOutros = 0;
            let receitasOsGrid = 0;

            const missionHasStarted = o.status !== "agendada" && o.status !== "aberta";

            try {
              const osMissionCosts = await storage.getMissionCostsByOS(o.id);
              for (const mc of osMissionCosts) {
                const amt = Number((mc as any).amount || 0);
                if ((mc as any).costType === "revenue") { receitasOsGrid += amt; continue; }
                const cat = ((mc as any).category || "").toLowerCase();
                if (cat.includes("pedágio") || cat.includes("pedagio")) custoPedagio += amt;
                else if (cat.includes("combustível") || cat.includes("combustivel") || cat.includes("abastecimento")) custoCombustivel += amt;
                else custoOutros += amt;
              }

              if (missionHasStarted) {
                if (custoPedagio === 0 && (o as any).pedagioEstimado) {
                  custoPedagio = Number((o as any).pedagioEstimado) || 0;
                }

                if (o.vehicleId && vehicleVazioCosts.has(o.vehicleId)) {
                  const vazioAmt = vehicleVazioCosts.get(o.vehicleId) || 0;
                  custoPedagio += vazioAmt;
                  vehicleVazioCosts.delete(o.vehicleId);
                }

                if (custoCombustivel === 0 && o.vehicleId) {
                  const oDate = toDateBRT(o.scheduledDate);
                  const vPlate = vehicle?.plate?.toUpperCase() || "";
                  const missionActive = o.missionStatus && !["aguardando", "agendada"].includes(o.missionStatus);
                  if (vPlate && oDate === todayStr && missionActive) {
                    const fuelKey = `${vPlate}:${oDate}`;
                    const firstOsForFuel = vehicleFuelFirstOS.get(fuelKey);
                    if (firstOsForFuel !== o.id) {
                      custoCombustivel = 0;
                    } else {
                      custoCombustivel = vehicleFuelCache.get(vPlate) || 0;
                    }
                  }
                }
              }
            } catch (_e) {}

            resultado.faturamento.total += receitasOsGrid + custoPedagio;
            const custoTotal = resultado.pagamento.total + custoCombustivel + custoPedagio + custoOutros;
            const resultadoComCustos = resultado.faturamento.total - custoTotal;
            const margemComCustos = resultado.faturamento.total > 0 ? (resultadoComCustos / resultado.faturamento.total) * 100 : 0;

            let fuelAllocatedHint: string | null = null;
            if (custoCombustivel === 0 && o.vehicleId) {
              const vPlate2 = vehicle?.plate?.toUpperCase() || "";
              const oDate2 = toDateBRT(o.scheduledDate);
              const fk2 = `${vPlate2}:${oDate2}`;
              const ownerOsId = vehicleFuelFirstOS.get(fk2);
              if (ownerOsId && ownerOsId !== o.id) {
                const ownerOs = activeOrders.find(x => x.id === ownerOsId);
                fuelAllocatedHint = ownerOs?.osNumber || null;
              }
            }

            const frozenFat = Math.round(resultado.faturamento.total * 100) / 100;
            const frozenPag = Math.round(resultado.pagamento.total * 100) / 100;
            const frozenComb = Math.round(custoCombustivel * 100) / 100;
            const frozenPed = Math.round(custoPedagio * 100) / 100;
            const frozenOut = Math.round(custoOutros * 100) / 100;
            const frozenCustoTotal = Math.round(custoTotal * 100) / 100;
            const frozenLucro = Math.round(resultadoComCustos * 100) / 100;
            const frozenMargem = Math.round(margemComCustos * 100) / 100;
            const frozenHoras = Math.round(horasCalc * 100) / 100;
            const frozenKm = billing.km_total;

            if ((o.status === "concluida" || o.status === "concluída" || o.missionStatus === "encerrada") && !(o as any).custos_congelados_em) {
              try {
                await supabaseAdmin.from("service_orders").update({
                  fat_calculado: frozenFat,
                  custo_combustivel_alocado: frozenComb,
                  custo_pedagio_alocado: frozenPed,
                  custo_pagamento_alocado: frozenPag,
                  custo_outros_alocado: frozenOut,
                  custo_total_alocado: frozenCustoTotal,
                  lucro_calculado: frozenLucro,
                  margem_calculada: frozenMargem,
                  horas_missao_calculadas: frozenHoras,
                  km_total_calculado: frozenKm,
                  custos_congelados_em: new Date().toISOString(),
                  custos_congelados_por: "system",
                }).eq("id", o.id);
              } catch (_fe) {}
            }

            const useFrozen = !!(o as any).custos_congelados_em;

            liveCost = {
              km_inicial: kmInicial,
              km_atual: kmFinalNorm,
              km_total: useFrozen ? ((o as any).km_total_calculado ?? frozenKm) : frozenKm,
              horas_missao: useFrozen ? (Number((o as any).horas_missao_calculadas) || frozenHoras) : frozenHoras,
              faturamento: useFrozen ? (Number((o as any).fat_calculado) || frozenFat) : frozenFat,
              fat_acionamento: billing.fat_acionamento,
              fat_hora_extra: billing.fat_hora_extra,
              fat_km_extra: billing.fat_km,
              horas_excedentes: billing.horas_excedentes,
              pagamento: useFrozen ? (Number((o as any).custo_pagamento_alocado) || frozenPag) : frozenPag,
              custo_combustivel: useFrozen ? (Number((o as any).custo_combustivel_alocado) || frozenComb) : frozenComb,
              custo_pedagio: useFrozen ? (Number((o as any).custo_pedagio_alocado) || frozenPed) : frozenPed,
              custo_outros: useFrozen ? (Number((o as any).custo_outros_alocado) || frozenOut) : frozenOut,
              custo_total: useFrozen ? (Number((o as any).custo_total_alocado) || frozenCustoTotal) : frozenCustoTotal,
              resultado: useFrozen ? (Number((o as any).lucro_calculado) || frozenLucro) : frozenLucro,
              margem_pct: useFrozen ? (Number((o as any).margem_calculada) || frozenMargem) : frozenMargem,
              frozen: useFrozen,
              fuel_allocated: o.fuelAllocated !== false && (useFrozen ? Number((o as any).custo_combustivel_alocado) > 0 : custoCombustivel > 0),
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
          missionStartedAt: o.missionStartedAt || null,
          status: o.status,
          priority: o.priority || "agendada",
          missionStatus: o.missionStatus,
          lastAgentUpdate: lastUpdate.length > 0 ? {
            id: lastUpdate[0].id,
            message: lastUpdate[0].message,
            missionStep: lastUpdate[0].missionStep,
            agentName: lastUpdate[0].employeeName,
            createdAt: lastUpdate[0].createdAt,
            photoUrl: lastUpdate[0].photoUrl && typeof lastUpdate[0].photoUrl === "string" && lastUpdate[0].photoUrl.startsWith("data:") ? "[has_photo]" : (lastUpdate[0].photoUrl || null),
            hasPhoto: !!lastUpdate[0].photoUrl,
            latitude: lastUpdate[0].latitude || null,
            longitude: lastUpdate[0].longitude || null,
            copiadoPor: lastUpdate[0].copiadoPor || null,
            copiadoEm: lastUpdate[0].copiadoEm || null,
          } : null,
          recentUpdates: recentUpdates.map(u => ({
            id: u.id,
            message: u.message,
            missionStep: u.missionStep,
            agentName: u.employeeName,
            createdAt: u.createdAt,
          })),
          clientName: client?.name || "—",
          origin: o.origin || null,
          destination: o.destination || null,
          escortedDriverName: o.escortedDriverName || null,
          escortedDriverPhone: o.escortedDriverPhone || null,
          escortedVehiclePlate: o.escortedVehiclePlate || null,
          waypoints: (o as any).waypoints || [],
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

  app.get("/api/vehicle-tracking", requireAuth, requireAdminRole, async (_req, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    const allVehicles = await storage.getVehicles();
    const orders = await storage.getServiceOrders();
    const todayBRT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
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
                  supabaseAdmin.from("mission_positions").insert({
                    service_order_id: osId,
                    vehicle_id: v.id,
                    latitude: trackerData.latitude,
                    longitude: trackerData.longitude,
                    speed: trackerData.speed ?? 0,
                    ignition: trackerData.ignition ? 1 : 0,
                  }).then(({ error }) => { if (error) console.error("[mission-pos] Insert error:", error.message); });
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
                const kit = linkedOrder.kitId ? await storage.getWeaponKit(linkedOrder.kitId) : null;
                const agentLoc1 = linkedOrder.assignedEmployeeId ? agentLocs.find(a => a.employeeId === linkedOrder.assignedEmployeeId) : null;
                const agentLoc2 = linkedOrder.assignedEmployee2Id ? agentLocs.find(a => a.employeeId === linkedOrder.assignedEmployee2Id) : null;
                const { data: lastUpd } = await supabaseAdmin.from("mission_updates").select("*")
                  .eq("service_order_id", linkedOrder.id).eq("read_by_admin", 0)
                  .order("created_at", { ascending: false })
                  .limit(1);
                const { data: recentUpds } = await supabaseAdmin.from("mission_updates").select("*")
                  .eq("service_order_id", linkedOrder.id)
                  .order("created_at", { ascending: false })
                  .limit(5);
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
                    photoUrl: lastUpd[0].photoUrl && typeof lastUpd[0].photoUrl === "string" && lastUpd[0].photoUrl.startsWith("data:") ? "[has_photo]" : (lastUpd[0].photoUrl || null),
                    hasPhoto: !!lastUpd[0].photoUrl,
                    latitude: lastUpd[0].latitude || null,
                    longitude: lastUpd[0].longitude || null,
                    copiadoPor: lastUpd[0].copiadoPor || null,
                    copiadoEm: lastUpd[0].copiadoEm || null,
                  } : null,
                  recentUpdates: recentUpds.map(u => ({
                    id: u.id,
                    message: u.message,
                    missionStep: u.missionStep,
                    agentName: u.employeeName,
                    createdAt: u.createdAt,
                  })),
                  scheduledDate: linkedOrder.scheduledDate,
                  missionStartedAt: linkedOrder.missionStartedAt || null,
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
                  kitId: linkedOrder.kitId || null,
                  kitName: kit?.name || null,
                  waypoints: (linkedOrder as any).waypoints || [],
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
              (o) => {
                if (o.vehicleId !== v.id || o.id === linkedOrder?.id) return false;
                if (o.status === "concluida" || o.status === "concluída" || o.status === "cancelada" || o.status === "recusada" || o.missionStatus === "encerrada") {
                  const oDate = o.completedDate
                    ? new Date(o.completedDate).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
                    : o.scheduledDate
                      ? new Date(o.scheduledDate).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
                      : null;
                  return oDate === todayBRT;
                }
                return true;
              }
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
                missionStatus: u.missionStatus || null,
                priority: u.priority || "agendada",
                scheduledDate: u.scheduledDate,
                completedDate: u.completedDate || null,
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


  }
  