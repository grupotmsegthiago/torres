import type { Express } from "express";
  import { storage, toCamelObj } from "../storage";
  import { supabaseAdmin } from "../supabase";
  import { requireAuth, requireAdminRole, requireDiretoria } from "../auth";
  import { insertServiceOrderSchema } from "@shared/schema";
  import * as truckscontrol from "../truckscontrol";
  import { nominatimGeocode, nominatimReverseGeocode } from "../db-init";
  import { parseEmailList, createSmtpTransporter, getSmtpFrom, SMTP_BCC_OS, haversineDist, decodePolyline, distToPolyline, findClosestIndex, createAutoTransaction, removeAutoTransaction } from "./_helpers";
  import { calcularEscolta, splitMissionCostsForBilling } from "../billing-calc";
  import { computeCanceladaBilling } from "../lib/cancelada-billing";
  import { logSystemAudit } from "../audit";
  import { randomUUID } from "crypto";
  import { estimateTolls, getAllTollPlazas } from "../toll-engine";

  // Valor Estimado a partir da Tabela de Preços (contrato de escolta).
  // O valor_acionamento JÁ inclui a franquia (km + horas) → ele É a estimativa base.
  // O excedente (valor_km_extra/valor_hora_extra) só se aplica ALÉM da franquia e
  // não é conhecido na hora de estimar, então fica fora. Fallback legado (contratos
  // antigos sem acionamento): preço por km carregado real (sem default fantasma).
  function estimadoFromContract(c: any): number | null {
    if (!c) return null;
    const acion = Number(c.valor_acionamento || 0);
    if (acion > 0) return acion;
    const kmRate = Number(c.valor_km_carregado || 0);
    const franquiaKm = Number(c.franquia_km || 0) || Number(c.franquia_minima_km || 0);
    const est = kmRate * franquiaKm;
    return est > 0 ? est : null;
  }

  export function registerServiceOrderRoutes(app: Express) {
    app.get("/api/service-orders", requireAuth, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit as string) || 1000));
    const offset = (page - 1) * limit;

    const SO_LIST_COLS = "id,os_number,type,status,mission_status,priority,client_id,vehicle_id,assigned_employee_id,assigned_employee_2_id,kit_id,origin,destination,scheduled_date,completed_date,mission_started_at,created_at,step_logs,notes,escorted_vehicle_plate,escorted_driver_name,escorted_driver_phone,extra_drivers,escort_contract_id,fuel_allocated,created_by_user_id,requester_name,description,cancellation_reason,processo_omega,gtm_number,valor_estimado,pedagio_estimado,pedagio_ida_volta,origin_lat,origin_lng,destination_lat,destination_lng,route,waypoints,km_total_calculado,km_gps_calculado";

    let data: any[];
    try {
      const { data: rows, error } = await supabaseAdmin.from("service_orders")
        .select(SO_LIST_COLS)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      data = rows?.map((r: any) => toCamelObj(r)) || [];
    } catch (err: any) {
      console.warn(`[so-list] supabase error, falling back: ${err.message}`);
      const all = await storage.getServiceOrders();
      data = all.slice(offset, offset + limit);
    }

    const osIds = data.map((o: any) => o.id).filter(Boolean);
    let photosByOs: Map<number, any[]> = new Map();
    if (osIds.length > 0) {
      try {
        const { data: allPhotos } = await supabaseAdmin.from("mission_photos")
          .select("service_order_id, step, km_value")
          .in("service_order_id", osIds);
        for (const p of (allPhotos || [])) {
          const arr = photosByOs.get(p.service_order_id) || [];
          arr.push(p);
          photosByOs.set(p.service_order_id, arr);
        }
      } catch (_e) {}
    }

    const enriched = data.map((os: any) => {
      const photos = photosByOs.get(os.id) || [];
      const findLast = (step: string) => {
        for (let i = photos.length - 1; i >= 0; i--) {
          if (photos[i].step === step) return photos[i];
        }
        return undefined;
      };
      const kmSaida = photos.find((p: any) => p.step === "km_saida");
      const kmChegada = findLast("km_chegada");
      const kmFinal = findLast("km_final");
      const baseHodometro = findLast("base_hodometro");
      return {
        ...os,
        missionKm: {
          saida_base: kmSaida?.km_value ?? null,
          chegada_origem: kmChegada?.km_value ?? null,
          chegada_destino: kmFinal?.km_value ?? null,
          fim_missao: baseHodometro?.km_value ?? kmFinal?.km_value ?? null,
        },
      };
    });
    res.json(enriched);
  });

  app.get("/api/service-orders/invoice-map", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const { data: billings } = await supabaseAdmin
        .from("escort_billings")
        .select("service_order_id, invoice_id, status")
        .not("invoice_id", "is", null);
      const map: Record<string, { invoiceId: number; billingStatus: string }> = {};
      for (const b of billings || []) {
        if (b.service_order_id != null && b.invoice_id != null) {
          map[String(b.service_order_id)] = { invoiceId: b.invoice_id, billingStatus: b.status };
        }
      }
      res.json(map);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/boletim-medicao/os-concluidas", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const allOrders = await storage.getServiceOrders();
      const concluidas = allOrders.filter(o =>
        o.status === "concluida" || o.status === "concluída" || o.missionStatus === "encerrada" ||
        o.status === "em_andamento" || (o.status === "agendada" && o.missionStartedAt) ||
        o.status === "cancelada" || o.status === "recusada"
      );

      const osIds = concluidas.map(o => o.id);
      const clientIds = [...new Set(concluidas.map(o => o.clientId).filter(Boolean))] as number[];
      const vehicleIds = [...new Set(concluidas.map(o => o.vehicleId).filter(Boolean))] as number[];
      const empIds = [...new Set([
        ...concluidas.map(o => o.assignedEmployeeId),
        ...concluidas.map(o => o.assignedEmployee2Id),
      ].filter(Boolean))] as number[];
      const kitIds = [...new Set(concluidas.map(o => o.kitId).filter(Boolean))] as number[];

      // Fotos de KM: buscar SÓ os passos de odômetro (km_chegada/km_final) e PAGINAR.
      // Sem isso, `.in(osIds)` traz todas as fotos das OSs e o Supabase corta em 1000 linhas,
      // fazendo o KM sumir das OSs mais recentes (ficavam fora do corte) → boletim sem KM.
      const fetchKmPhotos = async (ids: number[]) => {
        if (ids.length === 0) return [] as any[];
        const all: any[] = [];
        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await supabaseAdmin
            .from("mission_photos")
            .select("service_order_id, step, km_value")
            .in("service_order_id", ids)
            .in("step", ["km_chegada", "km_final"])
            .range(from, from + pageSize - 1);
          if (error) throw error;
          const batch = data || [];
          all.push(...batch);
          if (batch.length < pageSize) break;
        }
        return all;
      };

      const [allClients, allVehicles, allEmployees, allKits, billingsRes, contractsRes, photosRes] = await Promise.all([
        storage.getClients(),
        storage.getVehicles(),
        storage.getEmployees(),
        Promise.all(kitIds.map(id => storage.getWeaponKit(id))),
        osIds.length > 0
          ? supabaseAdmin.from("escort_billings").select("*").in("service_order_id", osIds)
          : Promise.resolve({ data: [] as any[] }),
        supabaseAdmin.from("escort_contracts").select("*"),
        fetchKmPhotos(osIds).then(data => ({ data })),
      ]);

      const clientMap = new Map(allClients.map(c => [c.id, c]));
      const vehicleMap = new Map(allVehicles.map(v => [v.id, v]));
      const empMap = new Map(allEmployees.map(e => [e.id, e]));
      const kitMap = new Map(allKits.filter(Boolean).map(k => [k!.id, k!]));
      const billingMap = new Map((billingsRes.data || []).map((b: any) => [b.service_order_id, b]));
      const contractArr = contractsRes.data || [];
      const photosByOs = new Map<number, any[]>();
      for (const p of (photosRes.data || [])) {
        const arr = photosByOs.get(p.service_order_id) || [];
        arr.push(p);
        photosByOs.set(p.service_order_id, arr);
      }

      const enriched = concluidas.map((os) => {
        const client = os.clientId ? clientMap.get(os.clientId) : null;
        const vehicle = os.vehicleId ? vehicleMap.get(os.vehicleId) : null;
        const emp1 = os.assignedEmployeeId ? empMap.get(os.assignedEmployeeId) : null;
        const emp2 = os.assignedEmployee2Id ? empMap.get(os.assignedEmployee2Id) : null;
        const kit = os.kitId ? kitMap.get(os.kitId) : null;

        const photos = photosByOs.get(os.id) || [];
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

        const billing = billingMap.get(os.id) || null;

        let clientContract: any = null;
        if (os.escortContractId) {
          clientContract = contractArr.find((c: any) => c.id === os.escortContractId) || null;
        } else if (os.clientId) {
          clientContract = contractArr.find((c: any) => c.client_id === os.clientId && c.status === "Ativo") || null;
        }

        return {
          ...os,
          clientName: client?.name || "—",
          clientCnpj: client?.cnpj || null,
          clientEmail: (client as any)?.email || null,
          clientBillingCycle: (client as any)?.billingCycle || (client as any)?.billing_cycle || null,
          clientPrazoAprovacaoDias: (client as any)?.prazoAprovacaoDias || (client as any)?.prazo_aprovacao_dias || null,
          clientPaymentTermsDays: (client as any)?.paymentTermsDays || (client as any)?.payment_terms_days || null,
          clientBillingCutoffDay: (client as any)?.billingCutoffDay || (client as any)?.billing_cutoff_day || null,
          vehiclePlate: vehicle?.plate || null,
          vehicleModel: vehicle?.model || null,
          employee1Name: emp1?.name || null,
          employee2Name: emp2?.name || null,
          kitName: kit?.name || null,
          km_inicial: kmChegadaPhoto?.km_value || 0,
          km_chegada_origem: kmChegadaPhoto?.km_value || null,
          km_final: kmFinalPhoto?.km_value || 0,
          km_total: (kmFinalPhoto?.km_value || 0) - (kmChegadaPhoto?.km_value || 0),
          hora_chegada_origem: horaChegadaOrigem,
          hora_fim_missao: horaFimMissao,
          billing: billing,
          hasContract: !!clientContract,
          contractId: clientContract?.id || null,
          contractName: clientContract?.name || null,
          contractValues: clientContract ? {
            valor_km_carregado: clientContract.valor_km_carregado,
            franquia_minima_km: clientContract.franquia_minima_km,
            valor_acionamento: clientContract.valor_acionamento,
            franquia_km: clientContract.franquia_km || clientContract.franquia_minima_km,
            franquia_horas: clientContract.franquia_horas,
            valor_hora_extra: clientContract.valor_hora_extra,
            valor_km_extra: clientContract.valor_km_extra || clientContract.valor_km_carregado,
            hora_extra_fracionada: clientContract.hora_extra_fracionada !== false,
          } : null,
        };
      });

      res.json(enriched);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/boletim-medicao/calcular/:osId", requireAdminRole, async (req, res) => {
    try {
      const serviceOrderId = Number(req.params.osId);
      const so = await storage.getServiceOrder(serviceOrderId);
      if (!so) return res.status(404).json({ message: "OS nao encontrada" });

      const isLive = so.status !== "concluida" && so.missionStatus !== "encerrada";
      const isCanceladaOuRecusada = so.status === "cancelada" || so.status === "recusada";

      const { data: existing } = await supabaseAdmin.from("escort_billings")
        .select("id, status").eq("service_order_id", serviceOrderId).limit(1);
      const existingBilling = existing?.[0];
      const canRecalculate = !existingBilling || existingBilling.status === "REJEITADA" || existingBilling.status === "A_VERIFICAR" || isLive;
      if (!canRecalculate) return res.status(400).json({ message: "Billing já aprovado — não pode ser recalculado" });
      if (existingBilling) {
        await supabaseAdmin.from("escort_billings").delete().eq("service_order_id", serviceOrderId);
      }

      if (isCanceladaOuRecusada) {
        const client = so.clientId ? await storage.getClient(so.clientId) : null;
        const user = req.user!;
        const { data: zeroBilling, error: zeroErr } = await supabaseAdmin.from("escort_billings").insert({
          service_order_id: serviceOrderId,
          client_id: so.clientId, client_name: client?.name || "--",
          os_number: so.osNumber || null,
          origem: so.origin || null, destino: so.destination || null,
          data_missao: so.scheduledDate || (so as any).missionStartedAt || new Date().toISOString(),
          km_inicial: 0, km_final: 0, km_vazio: 0, km_carregado: 0, km_total: 0,
          km_faturado: 0, km_franquia: 0, km_excedente: 0,
          horas_missao: 0, horas_trabalhadas: 0, horas_estadia: 0, teve_pernoite: false, is_noturno: false,
          fat_acionamento: 0, fat_hora_extra: 0, fat_km: 0, fat_km_carregado: 0, fat_km_vazio: 0,
          fat_estadia: 0, fat_pernoite: 0, fat_diaria: 0, fat_adicional_noturno: 0,
          fat_total: 0, receitas_os: 0, valor_franquia: 0, valor_km_extra: 0,
          pag_vrp: 0, pag_periculosidade: 0, pag_adicional_noturno: 0, pag_reembolsos: 0, pag_total: 0,
          resultado_bruto: 0, resultado_liquido: 0, margem_percentual: 0,
          status: "CANCELADO", created_by: user.name,
          observacoes: `OS ${so.status === "recusada" ? "RECUSADA" : "CANCELADA"}${(so as any).cancellationReason ? " — " + (so as any).cancellationReason : ""}`,
        }).select().single();
        if (zeroErr) throw zeroErr;
        return res.json(zeroBilling);
      }

      const photos = await storage.getMissionPhotosByOS(serviceOrderId);
      const kmSaidaPhoto = photos.find((p: any) => p.step === "km_saida");
      const kmChegadaPhoto = [...photos].reverse().find((p: any) => p.step === "km_chegada");
      const kmFinalPhoto = photos.find((p: any) => p.step === "km_final");
      const kmInicial = kmChegadaPhoto?.kmValue || 0;
      const kmFinal = kmFinalPhoto?.kmValue || 0;

      const toBRT = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
      const scheduledTime = so.scheduledDate ? toBRT(new Date(so.scheduledDate)) : undefined;
      const startTime = so.missionStartedAt ? toBRT(new Date(so.missionStartedAt as string)) : undefined;
      const completedDateValid = so.completedDate && new Date(so.completedDate as string).getFullYear() > 2000;
      const endTime = completedDateValid ? toBRT(new Date(so.completedDate as string)) : (isLive ? toBRT(new Date()) : undefined);

      const stepLogs = (so.stepLogs || []) as any[];
      const getLogTimeBilling = (steps: string[]) => {
        for (const s of steps) {
          const entry = [...stepLogs].reverse().find((l: any) => l.step === s && l.timestamp);
          if (entry) return entry.timestamp;
        }
        return null;
      };
      // INICIO REAL DA COBRANÇA = quando o agente SAIU PRA ROTA (iniciou missão/viagem/deslocamento),
      // NÃO quando ele chegou na origem. Chegar na origem antes do agendamento (esperando carregar)
      // não conta como início — só conta a partir do clique em "Iniciar Missão" / "Em Trânsito Destino".
      const horaInicioMissaoISO = getLogTimeBilling(["iniciar_missao", "em_transito_destino"]);
      const inicioMissaoTime = horaInicioMissaoISO ? toBRT(new Date(horaInicioMissaoISO)) : undefined;
      const horaFimMissaoISO = (so as any).hora_fim_missao || so.completedDate || getLogTimeBilling(["encerrada", "finalizada", "checkout_km_final"]);
      const fimMissaoTime = horaFimMissaoISO ? toBRT(new Date(horaFimMissaoISO)) : endTime;
      const billingStartTime = inicioMissaoTime || startTime;

      let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };

      if (so.escortContractId) {
        const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", so.escortContractId).limit(1);
        if (cc?.length) contrato = cc[0];
      } else if (so.clientId) {
        const { data: clientContracts } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.clientId).eq("status", "Ativo").limit(1);
        if (clientContracts?.length) contrato = clientContracts[0];
      }

      const kmFinalNorm = kmFinal > kmInicial ? kmFinal : kmInicial;
      const osMissionCosts = await storage.getMissionCostsByOS(serviceOrderId);
      const _split = splitMissionCostsForBilling(osMissionCosts);
      let despPedagioCalc = _split.despesas_pedagio;
      const despCombustivelCalc = _split.despesas_combustivel;
      const despOutrasCalc = _split.despesas_outras;
      const receitasOsCalc = _split.receitas_os;
      const pedagioEstimadoCalc = Number((so as any).pedagioEstimado) || 0;
      if (pedagioEstimadoCalc > 0 && despPedagioCalc === 0) despPedagioCalc = pedagioEstimadoCalc;
      console.log(`[CALCULAR] OS ${so.osNumber}: contrato.valor_acionamento=${contrato.valor_acionamento}, contrato.valor_km_carregado=${contrato.valor_km_carregado}, contrato.franquia_km=${contrato.franquia_km}, contrato.franquia_horas=${contrato.franquia_horas}, kmInicial=${kmInicial}, kmFinal=${kmFinalNorm}, billingStartTime=${billingStartTime}, fimMissaoTime=${fimMissaoTime}, scheduledTime=${scheduledTime}, pedagio=${despPedagioCalc}, receitas=${receitasOsCalc}`);
      const resultado = calcularEscolta({
        km_inicial: kmInicial, km_final: kmFinalNorm, km_vazio: 0,
        horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
        horario_inicio: billingStartTime, horario_fim: fimMissaoTime, horario_agendado: scheduledTime,
        inicio_ts: (so as any).missionStartedAt ? new Date((so as any).missionStartedAt).toISOString() : null,
        fim_ts: horaFimMissaoISO || ((so as any).completedDate ? new Date((so as any).completedDate).toISOString() : null),
        scheduled_date: so.scheduledDate ? new Date(so.scheduledDate as any).toISOString() : null,
        despesas_pedagio: despPedagioCalc, despesas_combustivel: despCombustivelCalc, despesas_outras: despOutrasCalc, receitas_os: receitasOsCalc, contrato,
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
        horario_inicio: billingStartTime || startTime || null, horario_fim: fimMissaoTime || endTime || null,
        horario_inicio_considerado: resultado.horario_inicio_considerado,
        horas_missao: n(resultado.horas_trabalhadas), horas_trabalhadas: n(resultado.horas_trabalhadas),
        horas_estadia: 0, teve_pernoite: false, is_noturno: resultado.is_noturno,
        fat_acionamento: n(resultado.fat_acionamento), fat_hora_extra: n(resultado.fat_hora_extra),
        fat_km: n(resultado.fat_km), fat_km_carregado: n(resultado.faturamento.km_carregado),
        fat_km_vazio: n(resultado.faturamento.km_vazio),
        fat_estadia: n(resultado.fat_estadia), fat_pernoite: n(resultado.fat_pernoite),
        fat_diaria: n(resultado.fat_pernoite), fat_adicional_noturno: n(resultado.fat_adicional_noturno),
        fat_total: n(resultado.fat_total), receitas_os: n(resultado.receitas_os),
        despesas_pedagio: n(despPedagioCalc), despesas_combustivel: n(despCombustivelCalc), despesas_outras: n(despOutrasCalc),
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
        data_missao: so.scheduledDate || (so as any).missionStartedAt || new Date().toISOString(),
        status: "A_VERIFICAR", created_by: user.name,
      }).select().single();
      if (error) throw error;

      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/boletim-medicao/os/:id/diretoria-override", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const osId = Number(req.params.id);
      const so = await storage.getServiceOrder(osId);
      if (!so) return res.status(404).json({ message: "OS não encontrada" });

      const { data: existingBilling } = await supabaseAdmin.from("escort_billings")
        .select("status").eq("service_order_id", osId).limit(1);

      if (existingBilling?.[0] && ["APROVADA", "FATURADO", "PAGO"].includes(existingBilling[0].status)) {
        return res.status(403).json({ message: "Boletim aprovado — valores travados. Não é possível alterar." });
      }

      const { completedDate, hora_chegada_origem, mission_started_at, scheduled_date, km_chegada_origem, km_fim_missao } = req.body;

      const updates: any = {};
      if (completedDate !== undefined) updates.completedDate = completedDate ? new Date(completedDate) : null;
      if (mission_started_at !== undefined) updates.missionStartedAt = mission_started_at ? new Date(mission_started_at) : null;
      if (scheduled_date !== undefined) updates.scheduledDate = scheduled_date ? new Date(scheduled_date) : null;

      if (Object.keys(updates).length > 0) {
        await storage.updateServiceOrder(osId, updates);
      }

      if (km_chegada_origem !== undefined && km_chegada_origem !== null) {
        const photos = await storage.getMissionPhotosByOS(osId);
        const existing = [...photos].reverse().find(p => p.step === "km_chegada");
        if (existing) {
          await supabaseAdmin.from("mission_photos").update({ km_value: Number(km_chegada_origem) }).eq("id", existing.id);
        } else {
          await supabaseAdmin.from("mission_photos").insert({ service_order_id: osId, employee_id: 0, step: "km_chegada", photo_data: "[ajuste-manual]", km_value: Number(km_chegada_origem), notes: "Ajuste Manual" });
        }
      }

      if (km_fim_missao !== undefined && km_fim_missao !== null) {
        const photos = await storage.getMissionPhotosByOS(osId);
        const existing = [...photos].reverse().find(p => p.step === "km_final");
        if (existing) {
          await supabaseAdmin.from("mission_photos").update({ km_value: Number(km_fim_missao) }).eq("id", existing.id);
        } else {
          await supabaseAdmin.from("mission_photos").insert({ service_order_id: osId, employee_id: 0, step: "km_final", photo_data: "[ajuste-manual]", km_value: Number(km_fim_missao), notes: "Ajuste Manual" });
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
          // INICIO REAL = clique em "iniciar_missao" / "em_transito_destino" (saiu pra rota).
          // Chegada na origem (checkin_chegada_km) NÃO conta como início de cobrança.
          const inicioMissaoEntry = [...updatedLogs].reverse().find((l: any) => (l.step === "iniciar_missao" || l.step === "em_transito_destino") && l.timestamp);
          const stTime = inicioMissaoEntry ? toBRT(new Date(inicioMissaoEntry.timestamp)) : (updatedSo.missionStartedAt ? toBRT(new Date(updatedSo.missionStartedAt as string)) : undefined);

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
          const mcList = await storage.getMissionCostsByOS(osId);
          const _split = splitMissionCostsForBilling(mcList);
          let dpCalc = _split.despesas_pedagio;
          const dcCalc = _split.despesas_combustivel;
          const doCalc = _split.despesas_outras;
          const roCalc = _split.receitas_os;
          const pedagioEstOS = Number((updatedSo as any).pedagioEstimado) || 0;
          if (pedagioEstOS > 0 && dpCalc === 0) dpCalc = pedagioEstOS;
          const resultado = calcularEscolta({
            km_inicial: kmI, km_final: kmFN, km_vazio: 0,
            horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
            horario_inicio: stTime, horario_fim: eTime, horario_agendado: sTime,
            inicio_ts: updatedSo.missionStartedAt ? new Date(updatedSo.missionStartedAt as any).toISOString() : null,
            fim_ts: updatedSo.completedDate ? new Date(updatedSo.completedDate as any).toISOString() : null,
            scheduled_date: updatedSo.scheduledDate ? new Date(updatedSo.scheduledDate as any).toISOString() : null,
            despesas_pedagio: dpCalc, despesas_combustivel: dcCalc, despesas_outras: doCalc, receitas_os: roCalc, contrato,
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
            receitas_os: n(resultado.receitas_os),
            despesas_pedagio: n(dpCalc), despesas_combustivel: n(dcCalc), despesas_outras: n(doCalc),
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
        let logEntry = [...stepLogs].reverse().find((l: any) => l.step === s.key);
        if (!logEntry) {
          logEntry = [...stepLogs].reverse().find((l: any) => l.nextStep === s.key);
        }
        let ts = logEntry?.timestamp || logEntry?.completedAt || null;
        if (!ts && s.key === "finalizada" && os.completedDate) {
          ts = new Date(os.completedDate as string).toISOString();
        }
        return {
          key: s.key,
          label: s.label,
          hasKm: s.hasKm,
          kmStep: s.kmStep || null,
          timestamp: ts,
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
            await supabaseAdmin.from("mission_photos").update({ km_value: Number(adj.km) }).eq("id", existing.id);
            auditEntries.push(`KM "${adj.kmStep}" alterado de ${oldKm ?? 'vazio'} para ${adj.km}`);
          } else if (!existing && adj.km !== null) {
            await supabaseAdmin.from("mission_photos").insert({ service_order_id: osId, employee_id: 0, step: adj.kmStep, photo_data: "[ajuste-manual]", km_value: Number(adj.km), notes: `Ajuste manual por ${adminName}` });
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

      // Deriva missionStartedAt/completedDate dos step logs ajustados,
      // pra que o recálculo do boletim e o relatório enxerguem os horários.
      const findStepTs = (...keys: string[]): string | null => {
        for (const k of keys) {
          const e = [...currentLogs].reverse().find((l: any) => l.step === k && (l.timestamp || l.completedAt));
          if (e) return e.timestamp || e.completedAt;
        }
        return null;
      };
      const inicioMissaoTs = findStepTs("iniciar_missao", "checkin_chegada_km");
      const fimMissaoTs = findStepTs("finalizada", "chegada_destino");
      const soUpdates: any = { stepLogs: currentLogs };
      if (inicioMissaoTs) soUpdates.missionStartedAt = new Date(inicioMissaoTs);
      if (fimMissaoTs) soUpdates.completedDate = new Date(fimMissaoTs);
      await storage.updateServiceOrder(osId, soUpdates);

      if (auditEntries.length > 0) {
        const auditMessage = `AJUSTE MANUAL por ${adminName}:\n${auditEntries.join("\n")}`;
        try {
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
        } catch (_muErr) {}
      }

      const { data: existingBilling } = await supabaseAdmin.from("escort_billings")
        .select("id, status").eq("service_order_id", osId).limit(1);
      const FROZEN_BILL_STATUSES = ["APROVADA", "FATURADO", "PAGO"];
      if (existingBilling?.[0] && !FROZEN_BILL_STATUSES.includes(existingBilling[0].status)) {
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
          // INICIO REAL = clique em "iniciar_missao" / "em_transito_destino". Chegada na origem não conta.
          const inicioEntry2 = [...updatedLogs].reverse().find((l: any) => (l.step === "iniciar_missao" || l.step === "em_transito_destino") && (l.timestamp || l.completedAt));
          const stTime = inicioEntry2 ? toBRT(new Date(inicioEntry2.timestamp || inicioEntry2.completedAt)) : (updatedSo.missionStartedAt ? toBRT(new Date(updatedSo.missionStartedAt as string)) : undefined);

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
          const mcList2 = await storage.getMissionCostsByOS(osId);
          const _split2 = splitMissionCostsForBilling(mcList2);
          let dp2 = _split2.despesas_pedagio;
          const dc2 = _split2.despesas_combustivel;
          const do2 = _split2.despesas_outras;
          const ro2 = _split2.receitas_os;
          const pedagioEstOS2 = Number((updatedSo as any).pedagioEstimado) || 0;
          if (pedagioEstOS2 > 0 && dp2 === 0) dp2 = pedagioEstOS2;
          const resultado = calcularEscolta({
            contrato, km_inicial: kmI, km_final: kmFN,
            km_vazio: 0, horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
            horario_agendado: sTime, horario_inicio: stTime, horario_fim: eTime,
            inicio_ts: updatedSo.missionStartedAt ? new Date(updatedSo.missionStartedAt as any).toISOString() : null,
            fim_ts: updatedSo.completedDate ? new Date(updatedSo.completedDate as any).toISOString() : null,
            scheduled_date: updatedSo.scheduledDate ? new Date(updatedSo.scheduledDate as any).toISOString() : null,
            despesas_pedagio: dp2, despesas_combustivel: dc2, despesas_outras: do2, receitas_os: ro2,
          });

          await supabaseAdmin.from("escort_billings").update({
            km_inicial: kmI, km_final: kmFN,
            horario_inicio: stTime || null, horario_fim: eTime || null,
            receitas_os: Number(resultado.receitas_os) || 0,
            despesas_pedagio: dp2, despesas_combustivel: dc2, despesas_outras: do2,
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
      await supabaseAdmin.from("service_orders").update({ fuel_allocated: allocated }).eq("id", osId);

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
            o.status !== "concluída" && o.status !== "concluida" && o.status !== "cancelada" && o.status !== "recusada" &&
            o.missionStatus !== "encerrada" &&
            ((o.scheduledDate ? new Date(o.scheduledDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]) === osDate)
          );
          for (const other of sameDaySameVehicle) {
            if (other.fuelAllocated === true) {
              await supabaseAdmin.from("service_orders").update({ fuel_allocated: false }).eq("id", other.id);
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

  app.get("/api/toll-plazas", requireAuth, async (_req, res) => {
    res.json(getAllTollPlazas());
  });

  app.post("/api/toll-estimate", requireAuth, async (req, res) => {
    try {
      const { originLat, originLng, destLat, destLng, waypoints } = req.body;
      if (!originLat || !originLng || !destLat || !destLng) {
        return res.status(400).json({ message: "Coordenadas de origem e destino são obrigatórias" });
      }
      const estimate = estimateTolls(
        Number(originLat), Number(originLng),
        Number(destLat), Number(destLng),
        waypoints
      );
      res.json(estimate);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/service-orders", requireAuth, requireAdminRole, async (req, res) => {
    console.log(`[DEBUG-OS] POST body escorted:`, JSON.stringify({ dn: req.body.escortedDriverName, dp: req.body.escortedDriverPhone, vp: req.body.escortedVehiclePlate }));
    const parsed = insertServiceOrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    console.log(`[DEBUG-OS] POST parsed escorted:`, JSON.stringify({ dn: parsed.data.escortedDriverName, dp: parsed.data.escortedDriverPhone, vp: (parsed.data as any).escortedVehiclePlate }));
    if (!parsed.data.scheduledDate) return res.status(400).json({ message: "Data do Agendamento é obrigatória" });
    // Regra: toda OS precisa de uma Tabela de Preços (contrato de escolta) selecionada.
    if (!parsed.data.escortContractId) {
      return res.status(400).json({ message: "Selecione uma Tabela de Preços para criar a OS. Se o cliente ainda não tem tabela, cadastre uma em Contratos/Tabelas antes de criar a OS." });
    }

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

    // Gate de Onboarding (Documentação, Contratos, Treinamento)
    try {
      const { assertOnboardingComplete } = await import("./onboarding");
      for (const empId of employeeIds) {
        await assertOnboardingComplete(empId);
      }
    } catch (gateErr: any) {
      if (gateErr.code === "ONBOARDING_INCOMPLETE") {
        return res.status(400).json({
          message: gateErr.message,
          code: "ONBOARDING_INCOMPLETE",
          detail: gateErr.detail,
        });
      }
      throw gateErr;
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
      // Decisão do usuário: regra de conflito de kit removida — qualquer OS pode
      // ser criada com qualquer kit, sem bloqueio.
    }
    if (!parsed.data.valorEstimado) {
      try {
        let contractRow: any = null;
        if (parsed.data.escortContractId) {
          const { data: cc } = await supabaseAdmin.from("escort_contracts").select("valor_km_carregado, franquia_minima_km, valor_acionamento, franquia_km").eq("id", parsed.data.escortContractId).limit(1);
          if (cc?.[0]) contractRow = cc[0];
        }
        if (!contractRow && parsed.data.clientId) {
          const { data: cc } = await supabaseAdmin.from("escort_contracts").select("valor_km_carregado, franquia_minima_km, valor_acionamento, franquia_km").eq("client_id", parsed.data.clientId).eq("status", "Ativo").limit(1);
          if (cc?.[0]) contractRow = cc[0];
        }
        if (contractRow) {
          const est = estimadoFromContract(contractRow);
          if (est != null && est > 0) (parsed.data as any).valorEstimado = est;
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

    if (parsed.data.scheduledDate) {
      const sd = new Date(parsed.data.scheduledDate);
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (sd < fiveMinAgo) {
        return res.status(400).json({ message: "Data da Criação não pode ser anterior ao horário atual." });
      }
    }

    parsed.data.createdByUserId = req.user?.id || null;
    if (req.body.escortedDriverName !== undefined) (parsed.data as any).escortedDriverName = req.body.escortedDriverName;
    if (req.body.escortedDriverPhone !== undefined) (parsed.data as any).escortedDriverPhone = req.body.escortedDriverPhone;
    if (req.body.escortedVehiclePlate !== undefined) (parsed.data as any).escortedVehiclePlate = req.body.escortedVehiclePlate;
    console.log(`[DEBUG-OS] POST final escorted going to storage:`, JSON.stringify({ dn: parsed.data.escortedDriverName, dp: parsed.data.escortedDriverPhone, vp: (parsed.data as any).escortedVehiclePlate }));
    const data = await storage.createServiceOrder(parsed.data);
    if (data.kitId) {
      await storage.updateWeaponKit(data.kitId, { status: "em_uso" });
    }
    if (data.vehicleId) {
      await storage.updateVehicle(data.vehicleId, { status: "em_uso" });
    }

    (async () => {
      try {
        const geoUpdates: any = {};
        if (!data.originLat && data.origin) {
          const geo = await nominatimGeocode(data.origin);
          if (geo) { geoUpdates.originLat = geo.lat; geoUpdates.originLng = geo.lng; }
        }
        if (!data.destinationLat && data.destination) {
          const geo = await nominatimGeocode(data.destination);
          if (geo) { geoUpdates.destinationLat = geo.lat; geoUpdates.destinationLng = geo.lng; }
        }
        const wps = Array.isArray(data.waypoints) ? data.waypoints as any[] : [];
        let wpsChanged = false;
        for (const wp of wps) {
          if (wp.address && (!wp.lat || !wp.lng)) {
            const geo = await nominatimGeocode(wp.address);
            if (geo) { wp.lat = geo.lat; wp.lng = geo.lng; wpsChanged = true; }
          }
        }
        if (wpsChanged) geoUpdates.waypoints = wps;
        if (Object.keys(geoUpdates).length > 0) {
          await storage.updateServiceOrder(data.id, geoUpdates);
        }

        const finalOriginLat = data.originLat || geoUpdates.originLat;
        const finalOriginLng = data.originLng || geoUpdates.originLng;
        const finalDestLat = data.destinationLat || geoUpdates.destinationLat;
        const finalDestLng = data.destinationLng || geoUpdates.destinationLng;
        const manualPedagio = Number((parsed.data as any).pedagioEstimado || 0);
        const idaVolta = (parsed.data as any).pedagioIdaVolta === true;

        let totalIdaCusto = 0;
        let plazaNames = "";
        let plazaCount = 0;

        if (finalOriginLat && finalOriginLng && finalDestLat && finalDestLng && manualPedagio <= 0) {
          const wpCoords = wps.filter(w => w.lat && w.lng).map(w => ({ lat: Number(w.lat), lng: Number(w.lng) }));
          const tollResult = estimateTolls(finalOriginLat, finalOriginLng, finalDestLat, finalDestLng, wpCoords);
          totalIdaCusto = tollResult.totalIda;
          plazaNames = tollResult.plazas.map(p => p.name).join(", ");
          plazaCount = tollResult.plazas.length;
        } else if (manualPedagio > 0) {
          totalIdaCusto = manualPedagio;
          plazaNames = "Manual";
          plazaCount = 0;
        }

        if (totalIdaCusto > 0) {
          await storage.updateServiceOrder(data.id, { pedagioEstimado: totalIdaCusto } as any);

          const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

          try {
            const costDespesa = await storage.createMissionCost({
              serviceOrderId: data.id,
              category: "Pedágio",
              description: `Pedágio Ida (Despesa Torres): ${plazaNames}${plazaCount > 0 ? ` [${plazaCount} praça(s)]` : ""}`,
              amount: totalIdaCusto.toFixed(2),
              costType: "expense",
            });
            if (costDespesa) {
              await createAutoTransaction({
                description: `DESPESA PEDÁGIO ${data.osNumber} - IDA (${plazaCount} praça(s))`,
                amount: totalIdaCusto,
                type: "EXPENSE",
                due_date: today,
                origin_type: "mission_cost",
                origin_id: String(costDespesa.id),
                category_name: "Custos de Missão",
                entity_name: null,
                created_by: "SISTEMA",
              });
            }
            console.log(`[OS ${data.osNumber}] Pedágio DESPESA (ida) R$${totalIdaCusto.toFixed(2)} (${plazaCount} praças: ${plazaNames})`);
          } catch (e: any) {
            console.error(`[OS ${data.osNumber}] Erro pedágio despesa:`, e.message);
          }

          const receitaCliente = idaVolta ? totalIdaCusto * 2 : totalIdaCusto;
          try {
            const costReceita = await storage.createMissionCost({
              serviceOrderId: data.id,
              category: "Pedágio (Receita)",
              description: `Pedágio ${idaVolta ? "Ida+Volta" : "Ida"} (Cobrança Cliente): ${plazaNames}${plazaCount > 0 ? ` [${plazaCount} praça(s)]` : ""}`,
              amount: receitaCliente.toFixed(2),
              costType: "revenue",
            });
            if (costReceita) {
              await createAutoTransaction({
                description: `RECEITA PEDÁGIO ${data.osNumber} - ${idaVolta ? "IDA+VOLTA" : "IDA"} (CLIENTE)`,
                amount: receitaCliente,
                type: "INCOME",
                due_date: today,
                origin_type: "mission_cost",
                origin_id: String(costReceita.id),
                category_name: "Faturamento",
                entity_name: null,
                created_by: "SISTEMA",
              });
            }
            console.log(`[OS ${data.osNumber}] Pedágio RECEITA (cliente) R$${receitaCliente.toFixed(2)} ${idaVolta ? "(ida+volta)" : "(ida)"}`);
          } catch (e: any) {
            console.error(`[OS ${data.osNumber}] Erro pedágio receita:`, e.message);
          }
        }
      } catch (_e) {}
    })();

    res.status(201).json(data);
  });

  app.patch("/api/service-orders/:id", requireAuth, requireAdminRole, async (req, res) => {
    console.log(`[DEBUG-OS] PATCH body escorted:`, JSON.stringify({ dn: req.body.escortedDriverName, dp: req.body.escortedDriverPhone, vp: req.body.escortedVehiclePlate }));
    const parsed = insertServiceOrderSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    console.log(`[DEBUG-OS] PATCH parsed escorted:`, JSON.stringify({ dn: parsed.data.escortedDriverName, dp: parsed.data.escortedDriverPhone, vp: (parsed.data as any).escortedVehiclePlate }));

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
                await supabaseAdmin.from("mission_photos").update({ employee_id: newA1 }).eq("id", photo.id);
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
      // Decisão do usuário: regra de conflito de kit removida — qualquer OS pode
      // trocar/usar qualquer kit, sem bloqueio.
    }

    // Gate de Onboarding — bloqueia atribuir/trocar funcionário sem onboarding completo
    {
      const a1 = parsed.data.assignedEmployeeId;
      const a2 = parsed.data.assignedEmployee2Id;
      const newIds: number[] = [];
      if (a1 !== undefined && a1 !== null && a1 !== existing?.assignedEmployeeId) newIds.push(a1);
      if (a2 !== undefined && a2 !== null && a2 !== existing?.assignedEmployee2Id) newIds.push(a2);
      if (newIds.length > 0) {
        try {
          const { assertOnboardingComplete } = await import("./onboarding");
          for (const empId of newIds) await assertOnboardingComplete(empId);
        } catch (gateErr: any) {
          if (gateErr.code === "ONBOARDING_INCOMPLETE") {
            return res.status(400).json({
              message: gateErr.message,
              code: "ONBOARDING_INCOMPLETE",
              detail: gateErr.detail,
            });
          }
          throw gateErr;
        }
      }
    }
    if (parsed.data.escortContractId && parsed.data.escortContractId !== existing?.escortContractId && !parsed.data.valorEstimado) {
      try {
        const { data: cc } = await supabaseAdmin.from("escort_contracts").select("valor_km_carregado, franquia_minima_km, valor_acionamento, franquia_km").eq("id", parsed.data.escortContractId).limit(1);
        if (cc?.[0]) {
          const est = estimadoFromContract(cc[0]);
          if (est != null && est > 0) (parsed.data as any).valorEstimado = est;
        }
      } catch (_e) {}
    }

    for (const field of ["missionStartedAt", "completedDate", "scheduledDate"]) {
      if ((parsed.data as any)[field]) {
        const dt = new Date((parsed.data as any)[field]);
        if (isNaN(dt.getTime()) || dt.getFullYear() <= 1970) (parsed.data as any)[field] = null;
      }
    }

    if (parsed.data.completedDate && existing) {
      const currentStatus = parsed.data.status || existing.status || "";
      if (!["concluída", "concluida", "cancelada", "recusada"].includes(currentStatus)) {
        (parsed.data as any).status = "concluída";
      }
    }

    const wasFinished = existing && (existing.status === "concluída" || existing.status === "concluida" || existing.status === "cancelada" || existing.status === "recusada");
    const isReopening = wasFinished && parsed.data.status && !["concluída", "concluida", "cancelada", "recusada"].includes(parsed.data.status);
    if (isReopening) {
      try { await removeAutoTransaction("service_order", String(req.params.id)); } catch (_e) {}
    }

    // REATIVAÇÃO: transição de recusada/cancelada → concluída
    // Limpa flags de congelamento da OS e reseta o billing para permitir recálculo limpo.
    const wasCancelladaOuRecusada = existing && (existing.status === "recusada" || existing.status === "cancelada");
    const isNowConcluida = parsed.data.status === "concluída" || parsed.data.status === "concluida";
    const isReactivating = wasCancelladaOuRecusada && isNowConcluida;
    if (isReactivating) {
      // Limpa marcadores de congelamento na OS
      (parsed.data as any).custos_congelados_em = null;
      (parsed.data as any).custos_congelados_por = null;
      (parsed.data as any).cancellationReason = null;
      // Reseta o billing CANCELADO para permitir recálculo (status volta para A_VERIFICAR e limpa observação de cancelamento)
      try {
        await supabaseAdmin.from("escort_billings")
          .update({ status: "A_VERIFICAR", observacoes: null })
          .eq("service_order_id", Number(req.params.id))
          .eq("status", "CANCELADO");
        console.log(`[so-patch-reactivate] OS ${req.params.id}: billing CANCELADO → A_VERIFICAR (recusada/cancelada → concluída)`);
      } catch (e: any) {
        console.error(`[so-patch-reactivate] erro ao resetar billing:`, e.message);
      }
    }

    const isRecusadaOuCancelada = (parsed.data.status === "recusada" || parsed.data.status === "cancelada")
      && existing && existing.status !== parsed.data.status;
    if (isRecusadaOuCancelada) {
      const actionLabel = parsed.data.status === "recusada" ? "recusada" : "cancelada";
      const isRecusada = parsed.data.status === "recusada";
      const reason = String((parsed.data as any).cancellationReason || "").trim();
      if (!reason || reason.length < 3) {
        return res.status(400).json({ message: `Informe o motivo da ${actionLabel} (mínimo 3 caracteres) no campo cancellationReason.` });
      }
      (parsed.data as any).cancellationReason = reason;
      const timeBRT = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const adminName = req.user?.name || req.user?.email || "Sistema";

      // RECUSADA: operacional não atendeu → zera tudo
      // CANCELADA: cliente cancelou mas equipe foi acionada → mantém custos (acionamento + extras)
      if (isRecusada) {
        (parsed.data as any).revenueValue = 0;
        (parsed.data as any).fat_calculado = 0;
        (parsed.data as any).custo_total_alocado = 0;
        (parsed.data as any).lucro_calculado = 0;
        (parsed.data as any).margem_calculada = 0;
        (parsed.data as any).valorEstimado = 0;
        (parsed.data as any).pedagioEstimado = 0;
      }
      (parsed.data as any).custos_congelados_em = new Date().toISOString();
      (parsed.data as any).custos_congelados_por = `${actionLabel}_por_${adminName}`;

      try {
        if (isRecusada) {
          // recusada: zera TODOS os valores do billing, independente do
          // status atual (inclusive CANCELADO/REJEITADA — recusada da OS é
          // a verdade final). Bug histórico: o filtro .in() de antes deixava
          // billings já rejeitados/cancelados com fat_total intacto, que
          // depois aparecia como custo na geração de fatura.
          await supabaseAdmin.from("escort_billings")
            .update({
              status: "CANCELADO",
              fat_total: 0,
              fat_acionamento: 0,
              fat_hora_extra: 0,
              fat_km: 0,
              fat_km_carregado: 0,
              fat_km_vazio: 0,
              fat_estadia: 0,
              fat_pernoite: 0,
              fat_diaria: 0,
              fat_adicional_noturno: 0,
              resultado_bruto: 0,
              resultado_liquido: 0,
              margem_percentual: 0,
              observacoes: `OS RECUSADA${reason ? " — " + reason : ""}`,
            })
            .eq("service_order_id", Number(req.params.id));
        } else {
          // cancelada: recalcula o billing pela "tabela de 100 km" do cliente
          // (acionamento + excedente real de km/horas; dentro da franquia ⇒ só o
          // acionamento). Regra do dono. Não toca billing já congelado (aprovado/faturado/pago).
          try {
            const soId = Number(req.params.id);
            const { data: existingBill } = await supabaseAdmin.from("escort_billings")
              .select("id, status").eq("service_order_id", soId).limit(1);
            const FROZEN = ["APROVADA", "FATURADO", "FATURADA", "PAGO"];
            const billStatus = existingBill?.[0]?.status;
            if (billStatus && FROZEN.includes(billStatus)) {
              // congelado: apenas marca como CANCELADO sem mexer nos valores.
              await supabaseAdmin.from("escort_billings").update({ status: "CANCELADO" }).eq("service_order_id", soId);
            } else {
              const cb = await computeCanceladaBilling({
                serviceOrderId: soId,
                clientId: existing.clientId,
                escortContractId: existing.escortContractId,
                scheduledDate: existing.scheduledDate as any,
                missionStartedAt: existing.missionStartedAt as any,
                completedDate: (existing.completedDate as any) || new Date().toISOString(),
                stepLogs: existing.stepLogs as any,
              });
              if (cb) {
                const client = existing.clientId ? await storage.getClient(existing.clientId) : null;
                const emp = existing.assignedEmployeeId ? await storage.getEmployee(existing.assignedEmployeeId) : null;
                const vehicle = existing.vehicleId ? await storage.getVehicle(existing.vehicleId) : null;
                const cancelPayload = {
                  service_order_id: soId,
                  client_id: existing.clientId,
                  client_name: client?.name || "--",
                  contract_id: cb.contrato.id || null,
                  ...cb.fatFields,
                  horario_agendado: cb.horarios.horario_agendado,
                  horario_inicio: cb.horarios.horario_inicio,
                  horario_fim: cb.horarios.horario_fim,
                  vigilante_id: existing.assignedEmployeeId,
                  vigilante_name: emp?.name || "--",
                  origem: existing.origin || null,
                  destino: existing.destination || null,
                  placa_viatura: vehicle?.plate || null,
                  data_missao: existing.scheduledDate || existing.missionStartedAt || new Date().toISOString(),
                  created_by: adminName,
                  observacoes: `OS CANCELADA — Tabela 100 km${cb.usouTabela100 ? "" : " (fallback: contrato da OS)"}${reason ? " | Motivo: " + reason : ""}`,
                };
                // UPSERT atômico via ON CONFLICT (service_order_id) — §8.6.
                await supabaseAdmin.from("escort_billings").upsert(cancelPayload, { onConflict: "service_order_id" });
                // Espelha o total na OS p/ o card/listagem refletir a tabela 100km.
                (parsed.data as any).valorEstimado = Number(cb.fatFields.fat_total) || 0;
                (parsed.data as any).fat_calculado = Number(cb.fatFields.fat_total) || 0;
              } else {
                // sem tabela de 100km nem contrato vinculado: ao menos marca CANCELADO.
                await supabaseAdmin.from("escort_billings").update({ status: "CANCELADO" }).eq("service_order_id", soId);
              }
            }
          } catch (cancErr: any) {
            console.error(`[OS-Cancel-Billing PATCH] OS ${req.params.id}:`, cancErr.message);
          }
        }
      } catch (_e) {}

      try {
        const { data: pendingTxs } = await supabaseAdmin.from("financial_transactions")
          .select("id, asaas_payment_id")
          .eq("origin_type", "service_order")
          .eq("origin_id", String(req.params.id))
          .not("asaas_payment_id", "is", null);
        if (pendingTxs?.length && process.env.ASAAS_API_KEY) {
          const apiKey = process.env.ASAAS_API_KEY;
          const baseUrl = apiKey.startsWith("$aact_") ? "https://api.asaas.com/v3" : "https://sandbox.asaas.com/api/v3";
          for (const tx of pendingTxs) {
            if (!tx.asaas_payment_id) continue;
            try {
              await fetch(`${baseUrl}/payments/${tx.asaas_payment_id}`, {
                method: "DELETE",
                headers: { "access_token": apiKey },
              });
              console.log(`[OS-${actionLabel}] Asaas payment ${tx.asaas_payment_id} cancelled for OS #${existing.osNumber}`);
            } catch (asaasErr: any) {
              console.error(`[OS-${actionLabel}] Asaas cancel failed: ${asaasErr.message}`);
            }
          }
        }
      } catch (_e) {}

      try {
        const { data: existingCosts } = await supabaseAdmin.from("mission_costs")
          .select("id")
          .eq("service_order_id", Number(req.params.id));
        if (existingCosts?.length) {
          for (const mc of existingCosts) {
            try { await removeAutoTransaction("mission_cost", String(mc.id)); } catch (_e) {}
          }
        }
        await supabaseAdmin.from("mission_costs")
          .delete()
          .eq("service_order_id", Number(req.params.id));
      } catch (_e) {}

      try { await removeAutoTransaction("service_order", String(req.params.id)); } catch (_e) {}

      try {
        await supabaseAdmin.from("system_audit_logs").insert({
          action: actionLabel === "recusada" ? "OS_RECUSADA" : "OS_CANCELADA",
          entity_type: "service_order",
          entity_id: String(req.params.id),
          details: JSON.stringify({
            osNumber: existing.osNumber,
            previousStatus: existing.status,
            [`${actionLabel}Em`]: timeBRT,
            [`${actionLabel}Por`]: adminName,
            clientId: existing.clientId,
            vehicleId: existing.vehicleId,
            faturamentoZerado: true,
            revenueValueZerado: true,
            custosLimpos: true,
            pedagioEstornado: true,
            transacoesRemovidas: true,
            asaasCobrancasCanceladas: true,
          }),
          performed_by: req.user?.email || adminName,
        });
      } catch (_e) {}
    }

    if (req.body.escortedDriverName !== undefined) (parsed.data as any).escortedDriverName = req.body.escortedDriverName;
    if (req.body.escortedDriverPhone !== undefined) (parsed.data as any).escortedDriverPhone = req.body.escortedDriverPhone;
    if (req.body.escortedVehiclePlate !== undefined) (parsed.data as any).escortedVehiclePlate = req.body.escortedVehiclePlate;
    console.log(`[DEBUG-OS] PATCH final escorted going to storage:`, JSON.stringify({ dn: (parsed.data as any).escortedDriverName, dp: (parsed.data as any).escortedDriverPhone, vp: (parsed.data as any).escortedVehiclePlate }));

    let data;
    try {
      data = await storage.updateServiceOrder(Number(req.params.id), parsed.data);
    } catch (updateErr: any) {
      console.error(`[so-update] Erro ao salvar OS #${req.params.id}:`, updateErr.message);
      console.error(`[so-update] Payload enviado:`, JSON.stringify(parsed.data, null, 2).substring(0, 2000));
      return res.status(500).json({ message: "Erro ao salvar OS: " + updateErr.message });
    }
    if (!data) return res.status(404).json({ message: "OS não encontrada" });

    const driverPatch: Record<string, any> = {};
    if (req.body.escortedDriverName !== undefined) driverPatch.escorted_driver_name = req.body.escortedDriverName;
    if (req.body.escortedDriverPhone !== undefined) driverPatch.escorted_driver_phone = req.body.escortedDriverPhone;
    if (req.body.escortedVehiclePlate !== undefined) driverPatch.escorted_vehicle_plate = req.body.escortedVehiclePlate;
    if (Object.keys(driverPatch).length > 0) {
      const { error: dpErr } = await supabaseAdmin.from("service_orders").update(driverPatch).eq("id", Number(req.params.id));
      if (dpErr) console.error(`[DEBUG-OS] PATCH driver fallback error:`, dpErr.message);
      else console.log(`[DEBUG-OS] PATCH driver fallback OK for OS #${req.params.id}:`, JSON.stringify(driverPatch));
    }

    const newAssignedIds: number[] = [];
    if (parsed.data.assignedEmployeeId !== undefined && parsed.data.assignedEmployeeId !== existing?.assignedEmployeeId && parsed.data.assignedEmployeeId) {
      newAssignedIds.push(parsed.data.assignedEmployeeId);
    }
    if ((parsed.data as any).assignedEmployee2Id !== undefined && (parsed.data as any).assignedEmployee2Id !== existing?.assignedEmployee2Id && (parsed.data as any).assignedEmployee2Id) {
      newAssignedIds.push((parsed.data as any).assignedEmployee2Id);
    }
    if (newAssignedIds.length > 0) {
      (async () => {
        try {
          const allAssignedIds = [data.assignedEmployeeId, (data as any).assignedEmployee2Id].filter(Boolean) as number[];
          const allEmployees = await Promise.all(allAssignedIds.map(id => storage.getEmployee(id)));
          const teamNames = allEmployees.filter(Boolean).map(e => e!.name);
          const vehicle = data.vehicleId ? await storage.getVehicle(data.vehicleId) : null;

          const schedBRT = data.scheduledDate ? new Date(data.scheduledDate).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "A definir";

          for (const empId of newAssignedIds) {
            const { data: existingAcc } = await supabaseAdmin
              .from("mission_acceptances").select("id")
              .eq("service_order_id", data.id)
              .eq("employee_id", empId)
              .limit(1);
            if (existingAcc?.length) continue;

            const token = randomUUID();
            await supabaseAdmin.from("mission_acceptances").insert({
              id: randomUUID(),
              service_order_id: data.id,
              employee_id: empId,
              user_id: null,
              status: "pendente",
              acceptance_token: token,
            });

            const { data: empUser } = await supabaseAdmin
              .from("users").select("id").eq("employee_id", empId).maybeSingle();
            if (!empUser) continue;

            let conv: any = null;
            const { data: adminUser } = await supabaseAdmin
              .from("users").select("id").eq("id", req.user!.id).maybeSingle();

            if (adminUser) {
              const { data: empConvs } = await supabaseAdmin
                .from("chat_participants").select("conversation_id").eq("user_id", empUser.id);
              const { data: adminConvs } = await supabaseAdmin
                .from("chat_participants").select("conversation_id").eq("user_id", adminUser.id);
              const empConvIds = (empConvs || []).map((p: any) => p.conversation_id);
              const adminConvIds = (adminConvs || []).map((p: any) => p.conversation_id);
              const sharedConvIds = empConvIds.filter((id: string) => adminConvIds.includes(id));

              if (sharedConvIds.length > 0) {
                const { data: directConv } = await supabaseAdmin
                  .from("chat_conversations").select("*")
                  .in("id", sharedConvIds)
                  .eq("type", "direct")
                  .limit(1);
                if (directConv?.length) conv = directConv[0];
              }

              if (!conv) {
                const newConvId = randomUUID();
                await supabaseAdmin.from("chat_conversations").insert({
                  id: newConvId, type: "direct", created_by: adminUser.id,
                });
                await supabaseAdmin.from("chat_participants").insert([
                  { id: randomUUID(), conversation_id: newConvId, user_id: adminUser.id },
                  { id: randomUUID(), conversation_id: newConvId, user_id: empUser.id },
                ]);
                conv = { id: newConvId };
              }
            }

            if (conv) {
              const missionMsg = `🚨 NOVA MISSÃO ATRIBUÍDA — ${data.osNumber}\n\n📅 Data: ${schedBRT}\n📍 Origem: ${data.origin || "A definir"}\n🏁 Destino: ${data.destination || "A definir"}\n👥 Equipe: ${teamNames.join(" + ")}\n🚗 Viatura: ${vehicle ? `${vehicle.plate} - ${vehicle.model || ""}` : "A definir"}\n\n⚠️ Esta missão requer seu ACEITE FORMAL.\nVocê tem 2 horas para responder.\n\nAo aceitar, você declara ciência de:\n• Dados da missão acima\n• Responsabilidade pelo armamento designado\n• Obrigação de seguir protocolos Torres\n• Que está apto física e mentalmente para a missão`;

              await supabaseAdmin.from("chat_messages").insert({
                id: randomUUID(),
                conversation_id: conv.id,
                sender_id: req.user!.id,
                type: "mission_invite",
                content: JSON.stringify({
                  osId: data.id,
                  osNumber: data.osNumber,
                  type: data.type,
                  scheduledDate: schedBRT,
                  origin: data.origin || "A definir",
                  destination: data.destination || "A definir",
                  team: teamNames,
                  vehicle: vehicle ? `${vehicle.plate} - ${vehicle.model || ""}` : null,
                  requiresAcceptance: true,
                }),
              });
            }
          }
        } catch (err: any) {
          console.error("[os-assign] Error creating mission acceptances:", err.message);
        }
      })();
    }

    const needsGeo = (!data.originLat && data.origin) || (!data.destinationLat && data.destination);
    const wpsNeedGeo = Array.isArray(data.waypoints) && (data.waypoints as any[]).some((wp: any) => wp.address && (!wp.lat || !wp.lng));
    if (needsGeo || wpsNeedGeo) {
      (async () => {
        try {
          const geoUpdates: any = {};
          if (!data.originLat && data.origin) {
            const geo = await nominatimGeocode(data.origin);
            if (geo) { geoUpdates.originLat = geo.lat; geoUpdates.originLng = geo.lng; }
          }
          if (!data.destinationLat && data.destination) {
            const geo = await nominatimGeocode(data.destination);
            if (geo) { geoUpdates.destinationLat = geo.lat; geoUpdates.destinationLng = geo.lng; }
          }
          const wps = Array.isArray(data.waypoints) ? data.waypoints as any[] : [];
          let wpsChanged = false;
          for (const wp of wps) {
            if (wp.address && (!wp.lat || !wp.lng)) {
              const geo = await nominatimGeocode(wp.address);
              if (geo) { wp.lat = geo.lat; wp.lng = geo.lng; wpsChanged = true; }
            }
          }
          if (wpsChanged) geoUpdates.waypoints = wps;
          if (Object.keys(geoUpdates).length > 0) {
            await storage.updateServiceOrder(data.id, geoUpdates);
          }
        } catch (_e) {}
      })();
    }

    if (existing && existing.kitId && existing.kitId !== data.kitId) {
      await storage.updateWeaponKit(existing.kitId, { status: "disponível" });
    }
    if (data.kitId && (!existing || existing.kitId !== data.kitId)) {
      await storage.updateWeaponKit(data.kitId, { status: "em_uso" });
    }
    if (data.kitId && (data.missionStatus === "encerrada" || data.status === "concluída" || data.status === "cancelada" || data.status === "recusada")) {
      await storage.updateWeaponKit(data.kitId, { status: "disponível" });
    }

    if (existing && existing.vehicleId && existing.vehicleId !== data.vehicleId) {
      await storage.updateVehicle(existing.vehicleId, { status: "disponível" });
    }
    if (data.vehicleId && (!existing || existing.vehicleId !== data.vehicleId)) {
      await storage.updateVehicle(data.vehicleId, { status: "em_uso" });
    }
    const isFinished = data.missionStatus === "encerrada" || data.missionStatus === "finalizada" ||
      data.status === "concluida" || data.status === "concluída" || data.status === "cancelada" || data.status === "recusada";
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

    const billingRelevantFields = ["completedDate", "missionStartedAt", "scheduledDate", "kmSaida", "kmRetorno", "kmOrigem", "kmDestino", "hora_chegada_origem", "hora_fim_missao", "pedagioEstimado", "pedagioIdaVolta"];
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
          const toBRTx = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
          // INICIO REAL = missionStartedAt (setado no clique de "iniciar_missao").
          // hora_chegada_origem NÃO entra mais — chegar na origem não é início de cobrança.
          const horarioInicio = data.missionStartedAt ? toBRTx(new Date(data.missionStartedAt as string)) : (bill.horario_inicio || null);
          const horaFimMissaoAR = (data as any).hora_fim_missao || (existing as any)?.hora_fim_missao || data.completedDate;
          const horarioFim = horaFimMissaoAR ? toBRTx(new Date(horaFimMissaoAR)) : (bill.horario_fim || null);
          const horarioAgendado = data.scheduledDate ? toBRTx(new Date(data.scheduledDate as string)) : (bill.horario_agendado || null);

          let despPedagioAR = Number(bill.despesas_pedagio || 0);
          const pedagioOS = Number((data as any).pedagioEstimado) || 0;
          if (pedagioOS > 0) despPedagioAR = pedagioOS;

          const mcListAR = await storage.getMissionCostsByOS(osId);
          const _splitAR = splitMissionCostsForBilling(mcListAR);
          const dpAR = _splitAR.despesas_pedagio;
          const dcAR = _splitAR.despesas_combustivel;
          const doAR = _splitAR.despesas_outras;
          const roAR = _splitAR.receitas_os;
          if (dpAR > 0) despPedagioAR = dpAR;

          const resultado = calcularEscolta({
            km_inicial: kmIni, km_final: kmFin, km_vazio: Number(bill.km_vazio || 0),
            horas_missao: 0, horas_estadia: Number(bill.horas_estadia || 0),
            teve_pernoite: !!bill.teve_pernoite, horario_inicio: horarioInicio, horario_fim: horarioFim,
            horario_agendado: horarioAgendado,
            inicio_ts: data.missionStartedAt ? new Date(data.missionStartedAt as any).toISOString() : null,
            fim_ts: horaFimMissaoAR ? new Date(horaFimMissaoAR).toISOString() : (data.completedDate ? new Date(data.completedDate as any).toISOString() : null),
            scheduled_date: data.scheduledDate ? new Date(data.scheduledDate as any).toISOString() : null,
            despesas_pedagio: despPedagioAR, despesas_combustivel: dcAR || Number(bill.despesas_combustivel || 0),
            despesas_outras: doAR || Number(bill.despesas_outras || 0), receitas_os: roAR, contrato,
          });

          const nb = (v: any) => Number(v) || 0;
          await supabaseAdmin.from("escort_billings").update({
            km_inicial: nb(kmIni), km_final: nb(kmFin),
            km_carregado: nb(resultado.km_carregado), km_total: nb(resultado.km_total),
            km_faturado: nb(resultado.km_faturado), km_franquia: nb(resultado.km_franquia),
            km_excedente: nb(resultado.km_excedente),
            placa_escoltado: data.escortedVehiclePlate || bill.placa_escoltado || null,
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
            receitas_os: nb(resultado.receitas_os),
            despesas_pedagio: nb(despPedagioAR), despesas_combustivel: nb(dcAR || Number(bill.despesas_combustivel || 0)), despesas_outras: nb(doAR || Number(bill.despesas_outras || 0)),
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

    // Recalcula boletim quando missionStartedAt/completedDate/status mudam
    // (mesma lógica do /step-adjustments). Permite que ediçôes diretas no
    // formulário principal da OS propaguem para o escort_billings.
    try {
      const billingRelevantChanged =
        parsed.data.missionStartedAt !== undefined ||
        parsed.data.completedDate !== undefined ||
        (parsed.data.status !== undefined && (parsed.data.status === "concluída" || parsed.data.status === "concluida"));
      if (billingRelevantChanged && data.type === "escolta") {
        const { data: existingBilling } = await supabaseAdmin.from("escort_billings")
          .select("id, status").eq("service_order_id", data.id).limit(1);
        const FROZEN = ["APROVADA", "FATURADO", "PAGO"];
        if (existingBilling?.[0] && !FROZEN.includes(existingBilling[0].status)) {
          const phs = await storage.getMissionPhotosByOS(data.id);
          const kmSP = [...phs].reverse().find((p: any) => p.step === "km_saida");
          const kmCP = [...phs].reverse().find((p: any) => p.step === "km_chegada");
          const kmFP = [...phs].reverse().find((p: any) => p.step === "km_final");
          const kmI = kmCP?.kmValue || kmSP?.kmValue || 0;
          const kmF = kmFP?.kmValue || 0;
          const toBRT = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
          const sTime = data.scheduledDate ? toBRT(new Date(data.scheduledDate)) : undefined;
          const stepLogsArr = (data.stepLogs || []) as any[];
          // INICIO REAL = clique em "iniciar_missao" / "em_transito_destino". Chegada na origem não conta.
          const inicioEntry = [...stepLogsArr].reverse().find((l: any) => (l.step === "iniciar_missao" || l.step === "em_transito_destino") && (l.timestamp || l.completedAt));
          const stTime = data.missionStartedAt ? toBRT(new Date(data.missionStartedAt as string)) : (inicioEntry ? toBRT(new Date(inicioEntry.timestamp || inicioEntry.completedAt)) : undefined);
          const cdValid = data.completedDate && new Date(data.completedDate as string).getFullYear() > 2000;
          const eTime = cdValid ? toBRT(new Date(data.completedDate as string)) : undefined;

          let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
          if (data.escortContractId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", data.escortContractId).limit(1);
            if (cc?.length) contrato = cc[0];
          } else if (data.clientId) {
            const { data: cc2 } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", data.clientId).eq("status", "Ativo").limit(1);
            if (cc2?.length) contrato = cc2[0];
          }

          const kmFN = kmF > kmI ? kmF : kmI;
          const mcList = await storage.getMissionCostsByOS(data.id);
          const _splitP = splitMissionCostsForBilling(mcList);
          let dp = _splitP.despesas_pedagio;
          const dc = _splitP.despesas_combustivel;
          const douts = _splitP.despesas_outras;
          const ro = _splitP.receitas_os;
          const pedEst = Number((data as any).pedagioEstimado) || 0;
          if (pedEst > 0 && dp === 0) dp = pedEst;

          const resultado = calcularEscolta({
            contrato, km_inicial: kmI, km_final: kmFN,
            km_vazio: 0, horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
            horario_agendado: sTime, horario_inicio: stTime, horario_fim: eTime,
            inicio_ts: data.missionStartedAt ? new Date(data.missionStartedAt as any).toISOString() : null,
            fim_ts: data.completedDate ? new Date(data.completedDate as any).toISOString() : null,
            scheduled_date: data.scheduledDate ? new Date(data.scheduledDate as any).toISOString() : null,
            despesas_pedagio: dp, despesas_combustivel: dc, despesas_outras: douts, receitas_os: ro,
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
            receitas_os: n(resultado.receitas_os),
            despesas_pedagio: n(dp), despesas_combustivel: n(dc), despesas_outras: n(douts),
          }).eq("id", existingBilling[0].id);
          console.log(`[so-patch-recalc] OS ${data.osNumber}: km=${kmI}->${kmFN}, h=${stTime}->${eTime}, fat=${resultado.fat_total}`);
        }
      }
    } catch (recalcErr: any) {
      console.error(`[so-patch-recalc] Erro ao recalcular boletim:`, recalcErr.message);
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

  async function sendEscoltaReportEmail(osData: any): Promise<{ sent: boolean; reason?: string; to?: string }> {
    if (!osData.assignedEmployeeId) return { sent: false, reason: "Agente líder não atribuído" };
    if (!osData.vehicleId) return { sent: false, reason: "Viatura não atribuída" };
    if (!osData.kitId) return { sent: false, reason: "Kit de armamento não atribuído" };
    if (!osData.origin) return { sent: false, reason: "Origem não definida" };
    if (!osData.destination) return { sent: false, reason: "Destino não definido" };
    if (!osData.scheduledDate) return { sent: false, reason: "Data agendada não definida" };

    const client = await storage.getClient(osData.clientId);
    const operacionalEmails = parseEmailList(client?.emailOperacional);
    const geralEmails = parseEmailList(client?.email);
    const recipientEmails = operacionalEmails.length > 0 ? operacionalEmails : geralEmails;
    if (recipientEmails.length === 0) return { sent: false, reason: "Cliente sem email cadastrado" };
    const recipientEmail = recipientEmails.join(", ");

    const transporter = createSmtpTransporter();
    if (!transporter) return { sent: false, reason: "SMTP não configurado" };

    const [emp1, emp2, vehicle] = await Promise.all([
      storage.getEmployee(osData.assignedEmployeeId),
      osData.assignedEmployee2Id ? storage.getEmployee(osData.assignedEmployee2Id) : null,
      osData.vehicleId ? storage.getVehicle(osData.vehicleId) : null,
    ]);

    const schedDate = osData.scheduledDate ? new Date(osData.scheduledDate) : null;
    const dateStr = schedDate ? schedDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
    const timeStr = schedDate ? schedDate.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "—";
    const agendStr = `${dateStr} — ${timeStr}`;
    const viaturaStr = vehicle ? `${vehicle.plate} / ${[vehicle.brand, vehicle.model].filter(Boolean).join(" ")}` : "—";
    const rastreadorStr = vehicle?.truckscontrolIdentifier ? `TrucksControl / ID: ${vehicle.truckscontrolIdentifier}` : (vehicle?.trackerId || "—");

    const sL = `style="padding:12px 16px;border-bottom:1px solid #eee;color:#333;font-size:13px;font-weight:700;width:180px;vertical-align:top;"`;
    const sV = `style="padding:12px 16px;border-bottom:1px solid #eee;font-size:13px;color:#1a1a1a;vertical-align:top;"`;

    const rows: string[] = [];
    rows.push(`<tr><td ${sL}>Nº da OS</td><td ${sV}><span style="background:#1a1a1a;color:#fff;padding:3px 10px;border-radius:3px;font-weight:700;font-size:12px;">${osData.osNumber}</span></td></tr>`);
    rows.push(`<tr><td ${sL}>Cliente</td><td ${sV}>${client?.name || "—"}</td></tr>`);
    rows.push(`<tr><td ${sL}>Origem</td><td ${sV}>${osData.origin || "—"}</td></tr>`);
    rows.push(`<tr><td ${sL}>Destino</td><td ${sV}>${osData.destination || "—"}</td></tr>`);
    rows.push(`<tr><td ${sL}>Viatura (Placa / Modelo)</td><td ${sV}>${viaturaStr}</td></tr>`);
    rows.push(`<tr><td ${sL}>Tipo de Escolta</td><td ${sV}>${(osData.type || "escolta").charAt(0).toUpperCase() + (osData.type || "escolta").slice(1)}</td></tr>`);
    rows.push(`<tr><td ${sL}>Agendamento</td><td ${sV}>${agendStr}</td></tr>`);
    if (osData.escortedDriverName) rows.push(`<tr><td ${sL}>Motorista</td><td ${sV}>${osData.escortedDriverName}</td></tr>`);
    if (osData.escortedDriverPhone) rows.push(`<tr><td ${sL}>Contato Motorista</td><td ${sV}>${osData.escortedDriverPhone}</td></tr>`);
    rows.push(`<tr><td ${sL}>Agente 01</td><td ${sV}>${emp1?.name || "—"}${emp1?.phone ? ` — ${emp1.phone}` : ""}</td></tr>`);
    if (emp2) rows.push(`<tr><td ${sL}>Agente 02</td><td ${sV}>${emp2.name || "—"}${emp2.phone ? ` — ${emp2.phone}` : ""}</td></tr>`);
    rows.push(`<tr><td ${sL}>Viatura de Escolta</td><td ${sV}>${osData.escortedVehiclePlate || "—"}</td></tr>`);
    rows.push(`<tr><td ${sL}>Rastreador</td><td ${sV}>${rastreadorStr}</td></tr>`);

    const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#f5f5f5;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:4px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.1);">

        <tr><td style="background:#1a1a1a;padding:24px 32px;text-align:center;">
          <h1 style="color:#ffffff;font-size:18px;font-weight:800;margin:0;letter-spacing:2px;">TORRES <span style="color:#cc3333;">VIGILÂNCIA</span> PATRIMONIAL</h1>
          <p style="color:#888;font-size:10px;margin:6px 0 0;letter-spacing:1.5px;text-transform:uppercase;">Segurança & Escolta Armada</p>
        </td></tr>

        <tr><td style="background:#ffffff;padding:28px 32px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-bottom:2px solid #eee;padding-bottom:16px;margin-bottom:16px;">
            <tr><td>
              <p style="font-size:16px;font-weight:700;color:#1a1a1a;margin:0;">📋 Confirmação de Escolta — ${osData.osNumber}</p>
            </td></tr>
          </table>
          <p style="color:#555;font-size:13px;margin:16px 0 4px;">Prezado(a) Cliente,</p>
          <p style="color:#777;font-size:13px;margin:0 0 24px;line-height:1.6;">Segue a confirmação e detalhes completos da missão de escolta registrada para a sua empresa:</p>
        </td></tr>

        <tr><td style="background:#ffffff;padding:0 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
            ${rows.join("\n            ")}
          </table>
        </td></tr>

        <tr><td style="background:#ffffff;padding:24px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-left:3px solid #cc3333;background:#fef2f2;border-radius:0 4px 4px 0;">
            <tr><td style="padding:12px 16px;">
              <p style="color:#333;font-size:12px;margin:0;line-height:1.5;"><strong>Observação:</strong> Acompanhe o status da missão em tempo real pelo painel do sistema.</p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="background:#ffffff;padding:8px 32px 28px;">
          <p style="color:#555;font-size:13px;margin:0;">Atenciosamente,</p>
          <p style="color:#1a1a1a;font-size:13px;font-weight:700;margin:4px 0 0;">Equipe Torres Vigilância Patrimonial</p>
        </td></tr>

        <tr><td style="background:#1a1a1a;padding:20px 32px;text-align:center;">
          <p style="color:#ffffff;font-size:12px;font-weight:700;margin:0;">Torres Vigilância Patrimonial</p>
          <p style="color:#666;font-size:9px;margin:8px 0 0;">Este é um e-mail automático. Em caso de dúvidas, entre em contato pelo e-mail escolta@torresseguranca.com.br</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

    let pdfBuffer: Buffer | null = null;
    try {
      pdfBuffer = await generateOsReportPdfBuffer(osData.id);
    } catch (err: any) {
      console.error(`[pre-alert] Erro ao gerar PDF do relatório: ${err.message}`);
    }

    const mailOptions: any = {
      from: getSmtpFrom(),
      to: recipientEmail,
      bcc: SMTP_BCC_OS,
      subject: `Confirmação de Escolta — ${osData.osNumber}`,
      html: htmlBody,
    };

    if (pdfBuffer) {
      mailOptions.attachments = [{
        filename: `OS_${osData.osNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      }];
    }

    await transporter.sendMail(mailOptions);
    console.log(`[pre-alert] Email enviado para ${recipientEmail} (OS ${osData.osNumber})${pdfBuffer ? " com PDF anexo" : ""}`);
    return { sent: true, to: recipientEmail };
  }

  app.post("/api/service-orders/:id/send-report-email", requireAuth, async (req, res) => {
    try {
      const os = await storage.getServiceOrder(Number(req.params.id));
      if (!os) return res.status(404).json({ message: "OS não encontrada" });
      const result = await sendEscoltaReportEmail(os);
      if (!result.sent) return res.status(400).json({ message: result.reason });
      res.json({ message: `Email enviado para ${result.to}` });
    } catch (err: any) {
      console.error(`[pre-alert] Erro:`, err.message);
      res.status(500).json({ message: "Erro ao enviar email: " + err.message });
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

  async function generateOsReportPdfBuffer(osId: number): Promise<Buffer> {
    const PDFDocument = (await import("pdfkit")).default;
    const QRCode = (await import("qrcode")).default;
    const path = await import("path");
    const fs = await import("fs");

    const os = await storage.getServiceOrder(osId);
    if (!os) throw new Error("OS não encontrada");

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

    const pdfChunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => pdfChunks.push(chunk));
    const pdfDone = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(pdfChunks)));
      doc.on("error", reject);
    });

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

      const osRowH = 22;
      fillRect(LM, y, W, osRowH, BG_ALT);
      borderRect(LM, y, W, osRowH);
      const halfW = Math.floor(W / 2);
      const osLabelW = 100;
      const osVPad = Math.floor((osRowH - 8) / 2);
      doc.save();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("FOLHA / OS", LABEL_X, y + osVPad, { width: osLabelW, lineBreak: false });
      doc.restore();
      doc.save();
      doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK).text(os.osNumber, LM + osLabelW + PAD, y + osVPad - 1, { width: 140, lineBreak: false });
      doc.restore();
      doc.save();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("OPERA\u00c7\u00c3O", LM + W - 200, y + osVPad, { width: 80, lineBreak: false });
      doc.restore();
      doc.save();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text((os.type || "ESCOLTA").toUpperCase(), LM + W - 110, y + osVPad, { width: 100, lineBreak: false });
      doc.restore();
      y += osRowH;

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
      const cliH = 24;
      fillRect(LM, y, W, cliH, "#ffffff");
      borderRect(LM, y, W, cliH);
      doc.save();
      doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK).text((client?.name || "\u2014").toUpperCase(), LM, y + Math.floor((cliH - 10) / 2), { width: W, align: "center", lineBreak: false });
      doc.restore();
      y += cliH;

      if (os.requesterName) {
        const solH = 20;
        fillRect(LM, y, W, solH, BG_ALT);
        borderRect(LM, y, W, solH);
        const solVPad = Math.floor((solH - 8) / 2);
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("SOLICITANTE:", LABEL_X, y + solVPad, { width: osLabelW, lineBreak: false });
        doc.restore();
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text(os.requesterName, LM + osLabelW + PAD, y + solVPad, { width: W - osLabelW - PAD * 2, lineBreak: false });
        doc.restore();
        y += solH;
      }

      const ensureUTC = (s: string) => s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + "Z";
      const scheduledStr = os.scheduledDate ? ensureUTC(String(os.scheduledDate)) : null;
      const dateVal = scheduledStr ? new Date(scheduledStr).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "\u2014";
      const timeVal = scheduledStr ? new Date(scheduledStr).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "\u2014";
      const dtRowH = 20;
      fillRect(LM, y, W, dtRowH, "#ffffff");
      borderRect(LM, y, W, dtRowH);
      const col3W = Math.floor(W / 3);
      const dtVPad = Math.floor((dtRowH - 8) / 2);
      doc.save();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("DATA:", LABEL_X, y + dtVPad, { width: 40, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text(dateVal, LABEL_X + 42, y + dtVPad, { width: col3W - 52, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("HOR\u00c1RIO:", LM + col3W + PAD, y + dtVPad, { width: 55, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text(timeVal, LM + col3W + 65, y + dtVPad, { width: col3W - 70, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("PRIORIDADE:", LM + col3W * 2 + PAD, y + dtVPad, { width: 72, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text((os.priority || "").toUpperCase(), LM + col3W * 2 + 82, y + dtVPad, { width: col3W - 92, lineBreak: false });
      doc.restore();
      y += dtRowH;

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
        agentRow("CNV", emp?.cnvNumber || "\u2014", "Val CNH", emp?.cnhExpiry ? new Date(emp.cnhExpiry).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "\u2014");
        agentRow("Matr\u00edcula", emp?.matricula || "\u2014", "Val CNV", emp?.cnvExpiry ? new Date(emp.cnvExpiry).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "\u2014");

        if (emp?.vestNumber) {
          agentRow("Colete", `${emp.vestNumber} ${emp.vestBrand || ""}`.trim(), "Val Colete", emp.vestExpiry ? new Date(emp.vestExpiry).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "\u2014");
        }

        y = Math.max(y, photoY + photoSize + 2);
        y += 4;
      };

      if (emp1) renderAgent(emp1, "L\u00cdDER / MOTORISTA");
      if (emp2) renderAgent(emp2, "ESCOLTA AUXILIAR");

      if (kitItems.length > 0) {
        sectionHeader("Armamento Designado");

        const colWs = [Math.floor(W * 0.30), Math.floor(W * 0.18), Math.floor(W * 0.30), W - Math.floor(W * 0.30) - Math.floor(W * 0.18) - Math.floor(W * 0.30)];
        const thH = 18;
        fillRect(LM, y, W, thH, "#e0e0e0");
        borderRect(LM, y, W, thH);
        let cx = LM;
        const thLabels = ["TIPO / MODELO", "CALIBRE", "N\u00ba S\u00c9RIE", "MUNI\u00c7\u00c3O"];
        doc.save();
        doc.font("Helvetica-Bold").fontSize(7).fillColor(GRAY);
        for (let i = 0; i < 4; i++) {
          doc.text(thLabels[i], cx + 6, y + Math.floor((thH - 7) / 2), { width: colWs[i] - 8, lineBreak: false });
          cx += colWs[i];
        }
        doc.restore();
        y += thH;

        const tdH = 20;
        for (const w of kitItems) {
          borderRect(LM, y, W, tdH);
          cx = LM;
          const tdPad = Math.floor((tdH - 8) / 2);
          doc.save();
          doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK);
          doc.text(`${w.weapon?.type || "\u2014"} ${w.weapon?.model || ""}`.trim(), cx + 6, y + tdPad, { width: colWs[0] - 8, lineBreak: false });
          cx += colWs[0];
          doc.font("Helvetica").fontSize(8).fillColor(DARK);
          doc.text(w.weapon?.caliber || "\u2014", cx + 6, y + tdPad, { width: colWs[1] - 8, lineBreak: false });
          cx += colWs[1];
          doc.text(w.weapon?.serialNumber || "\u2014", cx + 6, y + tdPad, { width: colWs[2] - 8, lineBreak: false });
          cx += colWs[2];
          doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK);
          doc.text("12 proj.", cx + 6, y + tdPad, { width: colWs[3] - 8, lineBreak: false });
          doc.restore();
          y += tdH;
        }
        y += 4;
      }

      if (vehicle) {
        sectionHeader("Dados da Viatura e Rastreamento");

        const trackerType = vehicle.trackerType === "truckscontrol" ? "TrucksControl" : vehicle.trackerType === "custom" ? "OnixSat" : null;
        const modelStr = `${vehicle.brand || ""} ${vehicle.model || ""}`.trim();

        const col4W = Math.floor(W / 4);
        const vthH = 20;
        fillRect(LM, y, W, vthH, BG_ALT);
        borderRect(LM, y, W, vthH);
        doc.save();
        doc.font("Helvetica-Bold").fontSize(7).fillColor(GRAY);
        const vthPad = Math.floor((vthH - 7) / 2);
        doc.text("VIATURA", LM + 6, y + vthPad, { width: col4W - 8, lineBreak: false });
        doc.text("COR", LM + col4W + 6, y + vthPad, { width: col4W - 8, lineBreak: false });
        doc.text("PLACA", LM + col4W * 2 + 6, y + vthPad, { width: col4W - 8, lineBreak: false });
        doc.text("RASTREADOR / ID", LM + col4W * 3 + 6, y + vthPad, { width: col4W - 8, lineBreak: false });
        doc.restore();
        y += vthH;

        const vtdH = 20;
        borderRect(LM, y, W, vtdH);
        doc.save();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK);
        const vtdPad = Math.floor((vtdH - 8) / 2);
        doc.text(modelStr || "\u2014", LM + 6, y + vtdPad, { width: col4W - 8, lineBreak: false });
        doc.text(vehicle.color || "\u2014", LM + col4W + 6, y + vtdPad, { width: col4W - 8, lineBreak: false });
        doc.text(vehicle.plate, LM + col4W * 2 + 6, y + vtdPad, { width: col4W - 8, lineBreak: false });
        const trackerStr = trackerType ? `${trackerType} / ${vehicle.truckscontrolIdentifier || vehicle.trackerId || vehicle.plate}` : "\u2014";
        doc.text(trackerStr, LM + col4W * 3 + 6, y + vtdPad, { width: col4W - 8, lineBreak: false });
        doc.restore();
        y += vtdH;

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

      const { data: missionPhotoRows } = await supabaseAdmin.from("mission_photos").select("*")
        .eq("service_order_id", osId)
        .order("created_at", { ascending: true });
      const missionPhotoRowsSafe = missionPhotoRows || [];

      if (missionPhotoRowsSafe.length > 0 && y < MAX_Y) {
        sectionHeader("Registro Fotogr\u00e1fico da Miss\u00e3o");

        const stepLabels: Record<string, string> = {
          checkout_km_saida: "Sa\u00edda Base",
          em_transito_origem: "Em Tr\u00e2nsito Origem",
          checkin_chegada_km: "Na Origem",
          checkin_veiculo_escoltado: "Ve\u00edculo Escoltado",
          checkin_dados_motorista: "Dados Motorista",
          iniciar_missao: "In\u00edcio Miss\u00e3o",
          em_transito_destino: "Em Tr\u00e2nsito Destino",
          chegada_destino: "Chegada Destino",
          checkout_km_final: "KM Final",
          checkout_viatura_retorno: "Retorno Viatura",
          encerrada: "Encerrada",
        };

        const photosToShow = missionPhotoRowsSafe.slice(0, 4);
        const mpGap = 8;
        const cols = Math.min(photosToShow.length, 2);
        const rows = Math.ceil(photosToShow.length / 2);
        const mpPhotoW = Math.floor((W - mpGap * (cols - 1)) / cols);
        const mpPhotoH = 100;
        const mpLabelH = 12;

        for (let row = 0; row < rows; row++) {
          if (y + mpPhotoH + mpLabelH + 4 > MAX_Y) break;
          let px = LM;
          for (let col = 0; col < cols; col++) {
            const idx = row * 2 + col;
            if (idx >= photosToShow.length) break;
            const mp = photosToShow[idx];
            const photoBuf = parseDataUri(mp.photoData);
            if (photoBuf && photoBuf.length > 100) {
              try {
                doc.save()
                  .rect(px, y, mpPhotoW, mpPhotoH).clip()
                  .image(photoBuf, px, y, { width: mpPhotoW, height: mpPhotoH })
                  .restore();
                borderRect(px, y, mpPhotoW, mpPhotoH, "#cccccc");
              } catch {
                fillRect(px, y, mpPhotoW, mpPhotoH, "#e5e5e5");
                borderRect(px, y, mpPhotoW, mpPhotoH, "#cccccc");
              }
            } else {
              fillRect(px, y, mpPhotoW, mpPhotoH, "#e5e5e5");
              borderRect(px, y, mpPhotoW, mpPhotoH, "#cccccc");
            }
            const caption = stepLabels[mp.step] || mp.step;
            doc.save();
            doc.font("Helvetica").fontSize(6.5).fillColor(GRAY).text(caption, px, y + mpPhotoH + 2, { width: mpPhotoW, align: "center", lineBreak: false });
            doc.restore();
            px += mpPhotoW + mpGap;
          }
          y += mpPhotoH + mpLabelH + mpGap;
        }
        y += 4;
      }

      if (os.escortedDriverName || os.escortedVehiclePlate) {
        sectionHeader("Dados da Carga / Ve\u00edculo Cliente");
        if (os.escortedDriverName) {
          fieldRow2("Motorista", os.escortedDriverName, "Telefone", os.escortedDriverPhone || "\u2014");
        }
        if (os.escortedVehiclePlate) {
          fieldRow2("Ve\u00edculo", os.escortedVehiclePlate, "GR/Doc", (os as any).smNumber || (os as any).sm_number || "\u2014");
        }
        y += 2;
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
      const footerY = Math.min(y + 20, PAGE_H - 30 - footerH);

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
        `Documento gerado eletronicamente em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}, ${new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
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
    return pdfDone;
  }

  app.get("/api/service-orders/:id/pdf", requireAuth, async (req, res) => {
    try {
      const osId = Number(req.params.id);
      const os = await storage.getServiceOrder(osId);
      if (!os) return res.status(404).json({ message: "OS não encontrada" });
      const pdfBuffer = await generateOsReportPdfBuffer(osId);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename=OS_${os.osNumber}.pdf`);
      res.end(pdfBuffer);
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
      const { data: positions } = await supabaseAdmin.from("mission_positions").select("*")
        .eq("service_order_id", id)
        .order("created_at", { ascending: true });
      res.json(positions || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const _roadDistCache: Record<string, { distKm: number; durationMin: number; ts: number }> = {};
  const ROAD_CACHE_MAX = 200;
  const ROAD_CACHE_TTL = 5 * 60 * 1000;
  function pruneRoadCache() {
    const keys = Object.keys(_roadDistCache);
    if (keys.length <= ROAD_CACHE_MAX) return;
    const now = Date.now();
    for (const k of keys) { if (now - _roadDistCache[k].ts > ROAD_CACHE_TTL) delete _roadDistCache[k]; }
    const remaining = Object.keys(_roadDistCache);
    if (remaining.length > ROAD_CACHE_MAX) {
      remaining.sort((a, b) => _roadDistCache[a].ts - _roadDistCache[b].ts);
      for (let i = 0; i < remaining.length - ROAD_CACHE_MAX; i++) delete _roadDistCache[remaining[i]];
    }
  }
  app.get("/api/reverse-geocode", requireAuth, async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ message: "Missing lat/lng" });
      const address = await nominatimReverseGeocode(lat, lng);
      res.json({ address: address || null });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/road-distance", requireAuth, async (req, res) => {
    try {
      const { originLat, originLng, destLat, destLng, waypoints: wps } = req.body;
      if (!originLat || !originLng || !destLat || !destLng) return res.status(400).json({ message: "Missing coordinates" });

      const cacheKey = `${Number(originLat).toFixed(2)},${Number(originLng).toFixed(2)}-${Number(destLat).toFixed(2)},${Number(destLng).toFixed(2)}`;
      const cached = _roadDistCache[cacheKey];
      if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
        return res.json({ distKm: cached.distKm, durationMin: cached.durationMin, source: "cache" });
      }

      const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        const haversine = (() => {
          const R = 6371;
          const dLat = (destLat - originLat) * Math.PI / 180;
          const dLng = (destLng - originLng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(originLat * Math.PI / 180) * Math.cos(destLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        })();
        const roadKm = Math.round(haversine * 1.4);
        const durMin = Math.round(roadKm / 65 * 60);
        return res.json({ distKm: roadKm, durationMin: durMin, source: "estimate" });
      }

      let waypointsParam = "";
      if (Array.isArray(wps) && wps.length > 0) {
        const wpStr = wps.filter((w: any) => w.lat && w.lng).map((w: any) => `${w.lat},${w.lng}`).join("|");
        if (wpStr) waypointsParam = `&waypoints=${wpStr}`;
      }

      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}${waypointsParam}&key=${apiKey}&region=br`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) throw new Error("Directions API error");
      const data = await resp.json();
      if (!data.routes?.length) throw new Error("No route found");

      let totalDistM = 0, totalDurS = 0;
      for (const leg of data.routes[0].legs) {
        totalDistM += leg.distance.value;
        totalDurS += leg.duration.value;
      }
      const distKm = Math.round(totalDistM / 1000);
      const durationMin = Math.round(totalDurS / 60);

      _roadDistCache[cacheKey] = { distKm, durationMin, ts: Date.now() };
      pruneRoadCache();

      res.json({ distKm, durationMin, source: "directions" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/calculate-tolls", requireAuth, async (req, res) => {
    try {
      const { origin, destination, originLat, originLng, destLat, destLng } = req.body;
      if (!origin || !destination) return res.status(400).json({ message: "Origem e destino são obrigatórios" });

      let googleTotalIda = 0;
      let googleTotalIdaVolta = 0;
      let googleTolls: { name: string; price: number }[] = [];
      let distanceMeters = 0;
      let source = "local";

      const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
      if (apiKey) {
        try {
          const routesUrl = "https://routes.googleapis.com/directions/v2:computeRoutes";
          const body = {
            origin: { address: origin },
            destination: { address: destination },
            travelMode: "DRIVE",
            extraComputations: ["TOLLS"],
            routeModifiers: { vehicleInfo: { emissionType: "GASOLINE" }, tollPasses: [] },
          };

          const resp = await fetch(routesUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": "routes.travelAdvisory.tollInfo,routes.distanceMeters,routes.duration,routes.legs.travelAdvisory.tollInfo",
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
          });

          if (resp.ok) {
            const data = await resp.json();
            const route = data.routes?.[0];
            if (route) {
              distanceMeters = route.distanceMeters || 0;
              const tollInfo = route.travelAdvisory?.tollInfo;
              if (tollInfo?.estimatedPrice) {
                for (const price of tollInfo.estimatedPrice) {
                  if (price.currencyCode === "BRL") {
                    googleTotalIda += parseFloat(price.units || "0") + parseFloat(price.nanos || "0") / 1e9;
                  }
                }
              }
              for (const leg of (route.legs || [])) {
                const legToll = leg.travelAdvisory?.tollInfo;
                if (legToll?.estimatedPrice) {
                  for (const price of legToll.estimatedPrice) {
                    if (price.currencyCode === "BRL") {
                      const val = parseFloat(price.units || "0") + parseFloat(price.nanos || "0") / 1e9;
                      googleTolls.push({ name: "Pedágio", price: val });
                    }
                  }
                }
              }
              if (googleTotalIda === 0 && googleTolls.length > 0) {
                googleTotalIda = googleTolls.reduce((sum, t) => sum + t.price, 0);
              }
              googleTotalIdaVolta = Math.round(googleTotalIda * 2 * 100) / 100;
              if (googleTotalIda > 0) source = "google";
            }
          } else {
            console.error("[calculate-tolls] Routes API error:", resp.status);
          }
        } catch (e: any) {
          console.error("[calculate-tolls] Google Routes exception:", e.message);
        }
      }

      let localEstimate = null;
      const oLat = Number(originLat) || 0;
      const oLng = Number(originLng) || 0;
      const dLat = Number(destLat) || 0;
      const dLng = Number(destLng) || 0;

      if (oLat && oLng && dLat && dLng) {
        localEstimate = estimateTolls(oLat, oLng, dLat, dLng);
      } else {
        try {
          const oGeo = await nominatimGeocode(origin);
          const dGeo = await nominatimGeocode(destination);
          if (oGeo && dGeo) {
            localEstimate = estimateTolls(oGeo.lat, oGeo.lng, dGeo.lat, dGeo.lng);
          }
        } catch (_e) {}
      }

      const finalTotalIda = googleTotalIda > 0 ? Math.round(googleTotalIda * 100) / 100 : (localEstimate?.totalIda || 0);
      const finalTotalIdaVolta = googleTotalIda > 0 ? googleTotalIdaVolta : (localEstimate?.totalIdaVolta || 0);
      const finalSource = googleTotalIda > 0 ? "google" : (localEstimate && localEstimate.totalIda > 0 ? "local" : "none");

      console.log(`[calculate-tolls] ${origin} → ${destination}: source=${finalSource}, ida=R$${finalTotalIda.toFixed(2)}, ida+volta=R$${finalTotalIdaVolta.toFixed(2)}, praças=${localEstimate?.plazas?.length || 0}`);

      res.json({
        tolls: googleTolls.length > 0 ? googleTolls : (localEstimate?.plazas || []).map(p => ({ name: `${p.name} (${p.road})`, price: p.price, city: p.city, state: p.state })),
        totalIda: finalTotalIda,
        totalIdaVolta: finalTotalIdaVolta,
        count: googleTolls.length || localEstimate?.plazas?.length || (finalTotalIda > 0 ? 1 : 0),
        distanceMeters,
        source: finalSource,
        plazas: localEstimate?.plazas || [],
        routeDistanceKm: localEstimate?.routeDistanceKm || (distanceMeters ? Math.round(distanceMeters / 100) / 10 : 0),
      });
    } catch (err: any) {
      console.error("[calculate-tolls] Exception:", err.message);
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
      const { category, description, amount, costType } = req.body;
      if (!category || typeof category !== "string") return res.status(400).json({ message: "Categoria é obrigatória" });
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ message: "Valor deve ser positivo" });
      const type = costType === "revenue" ? "revenue" : "expense";
      const cost = await storage.createMissionCost({ serviceOrderId, category, description: description || null, amount: numAmount.toFixed(2), costType: type });

      if (cost) {
        const osNum = os.osNumber || `OS-${serviceOrderId}`;
        const isRevenue = type === "revenue";
        await createAutoTransaction({
          description: `${isRevenue ? "RECEITA" : "CUSTO"} MISSÃO ${osNum} - ${category} ${description || ""}`.toUpperCase().trim(),
          amount: numAmount,
          type: isRevenue ? "INCOME" : "EXPENSE",
          due_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
          origin_type: "mission_cost",
          origin_id: String(cost.id),
          category_name: isRevenue ? "Receitas de Missão" : "Custos de Missão",
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

      const { data: positions } = await supabaseAdmin.from("mission_positions").select("*")
        .eq("service_order_id", id)
        .order("created_at", { ascending: true });

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
          const distToStart = haversineDist(firstPt.lat, firstPt.lng, startLat!, startLng!);
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
      let updates: any[] = [];
      try {
        const { data, error } = await supabaseAdmin.from("mission_updates").select("*").eq("service_order_id", os.id).order("created_at", { ascending: true });
        if (!error) updates = data || [];
      } catch (_muErr) {}
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
          checkin_chegada_km: "Na Origem", iniciar_missao: "Inicio de Missao",
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
        const kmInicial = kmChegadaPhoto?.kmValue || 0;
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

        let despPedPdf = 0, despCombPdf = 0, despOutPdf = 0;
        const { data: pdfCosts } = await supabaseAdmin.from("mission_costs").select("*").eq("service_order_id", osId).eq("cost_type", "expense");
        if (pdfCosts) {
          for (const mc of pdfCosts) {
            const amt = Number(mc.amount) || 0;
            const cat = (mc.category || "").toLowerCase();
            if (cat.includes("pedágio") || cat.includes("pedagio")) despPedPdf += amt;
            else if (cat.includes("combustível") || cat.includes("combustivel") || cat.includes("abastecimento")) despCombPdf += amt;
            else despOutPdf += amt;
          }
        }
        const pedagioEstPdf = Number((os as any).pedagioEstimado) || 0;
        if (pedagioEstPdf > 0 && despPedPdf === 0) despPedPdf = pedagioEstPdf;

        const resultado = calcularEscolta({
          km_inicial: kmInicial, km_final: kmFinal, km_vazio: 0,
          horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
          horario_inicio: startTime, horario_fim: endTimeCalc, horario_agendado: scheduledTime,
          inicio_ts: os.missionStartedAt ? new Date(os.missionStartedAt as any).toISOString() : null,
          fim_ts: os.completedDate ? new Date(os.completedDate as any).toISOString() : null,
          scheduled_date: os.scheduledDate ? new Date(os.scheduledDate as any).toISOString() : null,
          despesas_pedagio: despPedPdf, despesas_combustivel: despCombPdf, despesas_outras: despOutPdf, contrato,
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

        const pedagioIdaVoltaPdf = !!(os as any).pedagioIdaVolta;
        const pedagioLabel = pedagioIdaVoltaPdf ? "Pedagio (Ida e Volta)" : "Pedagio";
        const fatRows: [string, string][] = [
          ["KM Total", `${resultado.km_total} km`],
          ["KM Carregado", `${resultado.km_carregado} km`],
          ["KM Faturado (franquia)", `${resultado.km_faturado} km`],
          ["Valor KM Carregado", BRL(resultado.faturamento.km_carregado)],
          ["Valor KM Vazio", BRL(resultado.faturamento.km_vazio)],
          ["Estadia", BRL(resultado.faturamento.estadia)],
          ["Adicional Noturno", BRL(resultado.faturamento.adicional_noturno)],
          ["Pernoite/Diaria", BRL(resultado.faturamento.diaria)],
          ...(despPedPdf > 0 ? [[pedagioLabel, BRL(despPedPdf)] as [string, string]] : []),
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

  app.post("/api/service-orders/reprocessar-estimativas", requireDiretoria, async (_req, res) => {
    try {
      const { data: orders } = await supabaseAdmin
        .from("service_orders")
        .select("id, os_number, client_id, escort_contract_id, valor_estimado, type")
        .in("status", ["agendada", "aberta"])
        .eq("type", "escolta");

      if (!orders?.length) return res.json({ message: "Nenhuma OS encontrada", updated: 0 });

      let updated = 0;
      const results: any[] = [];

      for (const o of orders) {
        let contractRow: any = null;
        if (o.escort_contract_id) {
          const { data: cc } = await supabaseAdmin.from("escort_contracts").select("valor_km_carregado, franquia_minima_km, valor_acionamento, franquia_km").eq("id", o.escort_contract_id).limit(1);
          if (cc?.[0]) contractRow = cc[0];
        }
        if (!contractRow && o.client_id) {
          const { data: cc } = await supabaseAdmin.from("escort_contracts").select("id, valor_km_carregado, franquia_minima_km, valor_acionamento, franquia_km").eq("client_id", o.client_id).eq("status", "Ativo").limit(1);
          if (cc?.[0]) {
            contractRow = cc[0];
            await supabaseAdmin.from("service_orders").update({ escort_contract_id: String(cc[0].id) }).eq("id", o.id);
          }
        }
        if (contractRow) {
          const est = estimadoFromContract(contractRow);
          if (est != null && est > 0) {
            await supabaseAdmin.from("service_orders").update({ valor_estimado: est }).eq("id", o.id);
            updated++;
            results.push({ osNumber: o.os_number, valorEstimado: est, antigo: o.valor_estimado });
          }
        }
      }

      res.json({ message: `${updated} OS reprocessadas`, updated, results });
    } catch (err: any) {
      console.error("[OS] reprocessar estimativas error:", err.message);
      res.status(500).json({ message: "Erro ao reprocessar estimativas" });
    }
  });


  }
  