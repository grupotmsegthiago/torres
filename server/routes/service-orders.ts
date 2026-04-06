import type { Express } from "express";
  import { storage } from "../storage";
  import { db } from "../db";
  import { supabaseAdmin } from "../supabase";
  import { requireAuth, requireAdminRole, requireDiretoria } from "../auth";
  import { insertServiceOrderSchema, serviceOrders, vehicles, missionUpdates, missionPositions, missionPhotos } from "@shared/schema";
  import { eq, sql } from "drizzle-orm";
  import * as truckscontrol from "../truckscontrol";
  import { nominatimGeocode, nominatimReverseGeocode } from "../db-init";
  import { parseEmailList, createSmtpTransporter, getSmtpFrom, SMTP_BCC_OS, haversineDist, decodePolyline, distToPolyline, findClosestIndex } from "./_helpers";
  import { calcularEscolta } from "../billing-calc";

  export function registerServiceOrderRoutes(app: Express) {
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
        o.status === "concluida" || o.status === "concluída" || o.missionStatus === "encerrada" ||
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
          clientBillingCycle: (client as any)?.billingCycle || (client as any)?.billing_cycle || null,
          clientPrazoAprovacaoDias: (client as any)?.prazoAprovacaoDias || (client as any)?.prazo_aprovacao_dias || null,
          clientPaymentTermsDays: (client as any)?.paymentTermsDays || (client as any)?.payment_terms_days || null,
          clientBillingCutoffDay: (client as any)?.billingCutoffDay || (client as any)?.billing_cutoff_day || null,
          vehiclePlate: vehicle?.plate || null,
          vehicleModel: vehicle?.model || null,
          employee1Name: emp1?.name || null,
          employee2Name: emp2?.name || null,
          kitName: kit?.name || null,
          km_inicial: kmChegadaPhoto?.kmValue || 0,
          km_chegada_origem: kmChegadaPhoto?.kmValue || null,
          km_final: kmFinalPhoto?.kmValue || 0,
          km_total: (kmFinalPhoto?.kmValue || 0) - (kmChegadaPhoto?.kmValue || 0),
          hora_chegada_origem: horaChegadaOrigem,
          hora_fim_missao: horaFimMissao,
          billing: billing?.[0] || null,
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
      const horaChegadaOrigemISO = (so as any).hora_chegada_origem || getLogTimeBilling(["checkin_chegada_km", "em_transito_origem"]);
      const chegadaOrigemTime = horaChegadaOrigemISO ? toBRT(new Date(horaChegadaOrigemISO)) : undefined;
      const horaFimMissaoISO = (so as any).hora_fim_missao || so.completedDate || getLogTimeBilling(["encerrada", "finalizada", "checkout_km_final"]);
      const fimMissaoTime = horaFimMissaoISO ? toBRT(new Date(horaFimMissaoISO)) : endTime;
      const billingStartTime = chegadaOrigemTime || startTime;

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
      let despPedagioCalc = 0, despCombustivelCalc = 0, despOutrasCalc = 0, receitasOsCalc = 0;
      for (const mc of osMissionCosts) {
        const amt = Number(mc.amount) || 0;
        if ((mc as any).costType === "revenue") {
          receitasOsCalc += amt;
        } else {
          const cat = (mc.category || "").toLowerCase();
          if (cat.includes("pedágio") || cat.includes("pedagio")) despPedagioCalc += amt;
          else if (cat.includes("combustível") || cat.includes("combustivel") || cat.includes("abastecimento")) despCombustivelCalc += amt;
          else despOutrasCalc += amt;
        }
      }
      const pedagioEstimadoCalc = Number((so as any).pedagioEstimado) || 0;
      if (pedagioEstimadoCalc > 0 && despPedagioCalc === 0) despPedagioCalc = pedagioEstimadoCalc;
      console.log(`[CALCULAR] OS ${so.osNumber}: contrato.valor_acionamento=${contrato.valor_acionamento}, contrato.valor_km_carregado=${contrato.valor_km_carregado}, contrato.franquia_km=${contrato.franquia_km}, contrato.franquia_horas=${contrato.franquia_horas}, kmInicial=${kmInicial}, kmFinal=${kmFinalNorm}, billingStartTime=${billingStartTime}, fimMissaoTime=${fimMissaoTime}, scheduledTime=${scheduledTime}, pedagio=${despPedagioCalc}, receitas=${receitasOsCalc}`);
      const resultado = calcularEscolta({
        km_inicial: kmInicial, km_final: kmFinalNorm, km_vazio: 0,
        horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
        horario_inicio: billingStartTime, horario_fim: fimMissaoTime, horario_agendado: scheduledTime,
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
        data_missao: (so as any).missionStartedAt || so.scheduledDate || new Date().toISOString(),
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
          const mcList = await storage.getMissionCostsByOS(osId);
          let dpCalc = 0, dcCalc = 0, doCalc = 0, roCalc = 0;
          for (const mc of mcList) {
            const amt = Number(mc.amount) || 0;
            if ((mc as any).costType === "revenue") { roCalc += amt; }
            else {
              const cat = (mc.category || "").toLowerCase();
              if (cat.includes("pedágio") || cat.includes("pedagio")) dpCalc += amt;
              else if (cat.includes("combustível") || cat.includes("combustivel") || cat.includes("abastecimento")) dcCalc += amt;
              else doCalc += amt;
            }
          }
          const resultado = calcularEscolta({
            km_inicial: kmI, km_final: kmFN, km_vazio: 0,
            horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
            horario_inicio: stTime, horario_fim: eTime, horario_agendado: sTime,
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
          const mcList2 = await storage.getMissionCostsByOS(osId);
          let dp2 = 0, dc2 = 0, do2 = 0, ro2 = 0;
          for (const mc of mcList2) {
            const amt = Number(mc.amount) || 0;
            if ((mc as any).costType === "revenue") { ro2 += amt; }
            else {
              const cat = (mc.category || "").toLowerCase();
              if (cat.includes("pedágio") || cat.includes("pedagio")) dp2 += amt;
              else if (cat.includes("combustível") || cat.includes("combustivel") || cat.includes("abastecimento")) dc2 += amt;
              else do2 += amt;
            }
          }
          const resultado = calcularEscolta({
            contrato, km_inicial: kmI, km_final: kmFN,
            km_vazio: 0, horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
            horario_agendado: sTime, horario_inicio: stTime, horario_fim: eTime,
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

    const pedagioVal = Number((parsed.data as any).pedagioEstimado || 0);
    if (pedagioVal > 0) {
      try {
        const cost = await storage.createMissionCost({
          serviceOrderId: data.id,
          category: "Pedágio",
          description: "Pedágio Ida+Volta (cálculo automático)",
          amount: pedagioVal.toFixed(2),
        });
        if (cost) {
          await createAutoTransaction({
            description: `CUSTO MISSÃO ${data.osNumber} - PEDÁGIO (AUTO)`,
            amount: pedagioVal,
            type: "EXPENSE",
            due_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
            origin_type: "mission_cost",
            origin_id: String(cost.id),
            category_name: "Custos de Missão",
            entity_name: null,
            created_by: "SISTEMA",
          });
        }
        console.log(`[OS ${data.osNumber}] Pedágio automático R$${pedagioVal.toFixed(2)} registrado`);
      } catch (e: any) {
        console.error(`[OS ${data.osNumber}] Erro ao registrar pedágio:`, e.message);
      }
    }

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

    if (parsed.data.completedDate && existing) {
      const currentStatus = parsed.data.status || existing.status || "";
      if (!["concluída", "concluida", "cancelada"].includes(currentStatus)) {
        (parsed.data as any).status = "concluída";
      }
    }

    const wasFinished = existing && (existing.status === "concluída" || existing.status === "concluida" || existing.status === "cancelada");
    const isReopening = wasFinished && parsed.data.status && !["concluída", "concluida", "cancelada"].includes(parsed.data.status);
    if (isReopening) {
      try { await removeAutoTransaction("service_order", String(req.params.id)); } catch (_e) {}
    }

    const data = await storage.updateServiceOrder(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "OS não encontrada" });

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

    const billingRelevantFields = ["completedDate", "missionStartedAt", "scheduledDate", "kmSaida", "kmRetorno", "kmOrigem", "kmDestino", "hora_chegada_origem", "hora_fim_missao"];
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
          const horaChegadaOrigemAR = (data as any).hora_chegada_origem || (existing as any)?.hora_chegada_origem;
          const horarioInicio = horaChegadaOrigemAR ? toBRTx(new Date(horaChegadaOrigemAR)) : (data.missionStartedAt ? toBRTx(new Date(data.missionStartedAt as string)) : (bill.horario_inicio || null));
          const horaFimMissaoAR = (data as any).hora_fim_missao || (existing as any)?.hora_fim_missao || data.completedDate;
          const horarioFim = horaFimMissaoAR ? toBRTx(new Date(horaFimMissaoAR)) : (bill.horario_fim || null);
          const horarioAgendado = data.scheduledDate ? toBRTx(new Date(data.scheduledDate as string)) : (bill.horario_agendado || null);

          let despPedagioAR = Number(bill.despesas_pedagio || 0);
          const pedagioOS = Number((data as any).pedagioEstimado) || 0;
          if (pedagioOS > 0 && despPedagioAR === 0) despPedagioAR = pedagioOS;

          const mcListAR = await storage.getMissionCostsByOS(osId);
          let dpAR = 0, dcAR = 0, doAR = 0, roAR = 0;
          for (const mc of mcListAR) {
            const amt = Number(mc.amount) || 0;
            if ((mc as any).costType === "revenue") { roAR += amt; }
            else {
              const cat = (mc.category || "").toLowerCase();
              if (cat.includes("pedágio") || cat.includes("pedagio")) dpAR += amt;
              else if (cat.includes("combustível") || cat.includes("combustivel") || cat.includes("abastecimento")) dcAR += amt;
              else doAR += amt;
            }
          }
          if (dpAR > 0) despPedagioAR = dpAR;

          const resultado = calcularEscolta({
            km_inicial: kmIni, km_final: kmFin, km_vazio: Number(bill.km_vazio || 0),
            horas_missao: 0, horas_estadia: Number(bill.horas_estadia || 0),
            teve_pernoite: !!bill.teve_pernoite, horario_inicio: horarioInicio, horario_fim: horarioFim,
            horario_agendado: horarioAgendado,
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

      const dateVal = os.scheduledDate ? new Date(os.scheduledDate).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "\u2014";
      const timeVal = os.scheduledDate ? new Date(os.scheduledDate).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "\u2014";
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
      const positions = await db.select().from(missionPositions)
        .where(eq(missionPositions.serviceOrderId, id))
        .orderBy(missionPositions.createdAt);
      res.json(positions);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const _roadDistCache: Record<string, { distKm: number; durationMin: number; ts: number }> = {};
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

      res.json({ distKm, durationMin, source: "directions" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/calculate-tolls", requireAuth, async (req, res) => {
    try {
      const { origin, destination } = req.body;
      if (!origin || !destination) return res.status(400).json({ message: "Origem e destino são obrigatórios" });

      const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "API key não configurada" });

      const routesUrl = "https://routes.googleapis.com/directions/v2:computeRoutes";
      const body = {
        origin: { address: origin },
        destination: { address: destination },
        travelMode: "DRIVE",
        extraComputations: ["TOLLS"],
        routeModifiers: {
          vehicleInfo: {
            emissionType: "GASOLINE",
          },
          tollPasses: [],
        },
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

      if (!resp.ok) {
        const errText = await resp.text();
        console.error("[calculate-tolls] Routes API error:", resp.status, errText);
        return res.status(502).json({ message: "Erro ao consultar rota", detail: errText });
      }

      const data = await resp.json();
      const route = data.routes?.[0];
      if (!route) return res.json({ tolls: [], totalIda: 0, totalIdaVolta: 0, count: 0 });

      const tollInfo = route.travelAdvisory?.tollInfo;
      let totalIda = 0;
      const tollDetails: { name: string; price: number }[] = [];

      if (tollInfo?.estimatedPrice) {
        for (const price of tollInfo.estimatedPrice) {
          if (price.currencyCode === "BRL") {
            totalIda += parseFloat(price.units || "0") + parseFloat(price.nanos || "0") / 1e9;
          }
        }
      }

      const legs = route.legs || [];
      for (const leg of legs) {
        const legToll = leg.travelAdvisory?.tollInfo;
        if (legToll?.estimatedPrice) {
          for (const price of legToll.estimatedPrice) {
            if (price.currencyCode === "BRL") {
              const val = parseFloat(price.units || "0") + parseFloat(price.nanos || "0") / 1e9;
              tollDetails.push({ name: "Pedágio", price: val });
            }
          }
        }
      }

      if (totalIda === 0 && tollDetails.length > 0) {
        totalIda = tollDetails.reduce((sum, t) => sum + t.price, 0);
      }

      const totalIdaVolta = Math.round(totalIda * 2 * 100) / 100;
      const distanceMeters = route.distanceMeters || 0;

      console.log(`[calculate-tolls] ${origin} → ${destination}: ${tollDetails.length} pedágio(s), ida=R$${totalIda.toFixed(2)}, ida+volta=R$${totalIdaVolta.toFixed(2)}`);

      res.json({
        tolls: tollDetails,
        totalIda: Math.round(totalIda * 100) / 100,
        totalIdaVolta,
        count: tollDetails.length || (totalIda > 0 ? 1 : 0),
        distanceMeters,
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


  }
  