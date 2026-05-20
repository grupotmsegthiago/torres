import { supabaseAdmin } from "../supabase";
import {
  parseTicketlogPedagioCsv,
  cruzarPedagios,
  type CruzamentoResult,
  type OsCandidate,
  type MissionCostCandidate,
  type TicketLogPedagioParsed,
} from "./ticketlog-pedagio-csv";

export interface PedagioAuditNote {
  id: number;
  codigoFatura: string;
  scope: "fatura_sem_os" | "os_sem_fatura";
  csvCodigo: string | null;
  missionCostId: number | null;
  serviceOrderId: number | null;
  status: "pendente" | "justificada" | "contestada";
  observacao: string;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AuditoriaPedagioRunResult {
  parsed: TicketLogPedagioParsed;
  matchedClient: { id: number; name: string; razaoSocial: string | null; nomeFantasia: string | null } | null;
  resolvedClientWarning: string | null;
  window: { dataInicio: string; dataFim: string } | null;
  result: CruzamentoResult;
  notes: {
    byCsvCodigo: Record<string, PedagioAuditNote>;
    byMissionCostId: Record<string, PedagioAuditNote>;
  };
}

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function findClientByName(clienteCsv: string): Promise<{
  client: { id: number; name: string; razaoSocial: string | null; nomeFantasia: string | null } | null;
  warning: string | null;
}> {
  const wanted = normalizeName(clienteCsv);
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id,name,razao_social,nome_fantasia");
  if (error) return { client: null, warning: `erro ao buscar clientes: ${error.message}` };
  const list = (data || []) as Array<{ id: number; name: string; razao_social: string | null; nome_fantasia: string | null }>;

  // Tenta match exato em razão social / nome fantasia / name
  for (const c of list) {
    const candidates = [c.razao_social, c.nome_fantasia, c.name].filter(Boolean) as string[];
    if (candidates.some((v) => normalizeName(v) === wanted)) {
      return { client: { id: c.id, name: c.name, razaoSocial: c.razao_social, nomeFantasia: c.nome_fantasia }, warning: null };
    }
  }
  // Match parcial (contains)
  const partial = list.find((c) => {
    const candidates = [c.razao_social, c.nome_fantasia, c.name].filter(Boolean) as string[];
    return candidates.some((v) => {
      const nv = normalizeName(v);
      return nv.includes(wanted) || wanted.includes(nv);
    });
  });
  if (partial) {
    return {
      client: { id: partial.id, name: partial.name, razaoSocial: partial.razao_social, nomeFantasia: partial.nome_fantasia },
      warning: `cliente da fatura ("${clienteCsv}") casado por correspondência parcial com "${partial.razao_social || partial.nome_fantasia || partial.name}"`,
    };
  }
  return { client: null, warning: `cliente "${clienteCsv}" não foi localizado no sistema` };
}

export async function rodarAuditoriaPedagiosCsv(csvContent: string): Promise<AuditoriaPedagioRunResult> {
  const parsed = parseTicketlogPedagioCsv(csvContent);

  const out: AuditoriaPedagioRunResult = {
    parsed,
    matchedClient: null,
    resolvedClientWarning: null,
    window: null,
    result: {
      conciliados: [],
      faturaSemOS: [],
      osSemFatura: [],
      totais: {
        conciliados: { count: 0, total: 0 },
        faturaSemOS: { count: 0, total: 0 },
        osSemFatura: { count: 0, total: 0 },
      },
    },
    notes: { byCsvCodigo: {}, byMissionCostId: {} },
  };

  // Carrega anotações persistidas para esta fatura (independente do match de cliente,
  // pois pode haver notas mesmo quando a fatura não consegue cruzar com OS)
  if (parsed.header.codigoFatura) {
    const { data: notesRaw } = await supabaseAdmin
      .from("ticketlog_pedagio_audit_notes")
      .select("*")
      .eq("codigo_fatura", parsed.header.codigoFatura);
    for (const n of (notesRaw || []) as Array<any>) {
      const note: PedagioAuditNote = {
        id: n.id,
        codigoFatura: n.codigo_fatura,
        scope: n.scope,
        csvCodigo: n.csv_codigo ?? null,
        missionCostId: n.mission_cost_id ?? null,
        serviceOrderId: n.service_order_id ?? null,
        status: n.status,
        observacao: n.observacao || "",
        createdById: n.created_by_id ?? null,
        createdByName: n.created_by_name ?? null,
        createdAt: n.created_at ?? null,
        updatedAt: n.updated_at ?? null,
      };
      if (note.csvCodigo) out.notes.byCsvCodigo[note.csvCodigo] = note;
      if (note.missionCostId != null) out.notes.byMissionCostId[String(note.missionCostId)] = note;
    }
  }

  if (!parsed.header.cliente) {
    out.resolvedClientWarning = "fatura sem campo 'Cliente:' no cabeçalho";
    return out;
  }
  if (!parsed.header.periodoInicio || !parsed.header.periodoFim) {
    out.resolvedClientWarning = "fatura sem 'Período apurado' no cabeçalho";
    return out;
  }

  const { client, warning } = await findClientByName(parsed.header.cliente);
  out.matchedClient = client;
  out.resolvedClientWarning = warning;
  if (!client) return out;

  // Janela [periodoInicio - 1d, periodoFim + 1d] usada para filtrar OS
  const shift = (iso: string, days: number) => {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  };
  const winStart = shift(parsed.header.periodoInicio, -1);
  const winEnd = shift(parsed.header.periodoFim, 1);
  out.window = { dataInicio: parsed.header.periodoInicio, dataFim: parsed.header.periodoFim };

  // Busca OS do cliente que tocam a janela. Considera scheduled_date OU
  // mission_started_at OU completed_date — a janela operacional efetiva
  // pode vir de qualquer um deles (ver cruzarPedagios.osWindow).
  // Ampliamos a janela para [winStart, winEnd] inclusivo em qualquer das datas.
  const { data: osRaw, error: osErr } = await supabaseAdmin
    .from("service_orders")
    .select("id,os_number,client_id,vehicle_id,scheduled_date,completed_date,mission_started_at,status,assigned_employee_id")
    .eq("client_id", client.id)
    .or(
      [
        `and(scheduled_date.gte.${winStart},scheduled_date.lte.${winEnd}T23:59:59)`,
        `and(mission_started_at.gte.${winStart},mission_started_at.lte.${winEnd}T23:59:59)`,
        `and(completed_date.gte.${winStart},completed_date.lte.${winEnd}T23:59:59)`,
      ].join(","),
    );
  if (osErr) throw new Error(`erro ao buscar OS: ${osErr.message}`);

  const oss = (osRaw || []) as Array<any>;
  const vehicleIds = Array.from(new Set(oss.map((o) => o.vehicle_id).filter(Boolean))) as number[];

  // Busca placas dos veículos
  const placaByVehicleId = new Map<number, string>();
  if (vehicleIds.length > 0) {
    const { data: vehRaw, error: vehErr } = await supabaseAdmin
      .from("vehicles")
      .select("id,plate")
      .in("id", vehicleIds);
    if (vehErr) throw new Error(`erro ao buscar veículos: ${vehErr.message}`);
    for (const v of (vehRaw || []) as Array<{ id: number; plate: string }>) {
      placaByVehicleId.set(v.id, v.plate);
    }
  }

  // Busca também toda a frota (vehicles) p/ saber se a placa do CSV existe (motivo "placa não encontrada na frota")
  const { data: allVehRaw } = await supabaseAdmin.from("vehicles").select("plate");
  const allPlatesSet = new Set<string>(
    ((allVehRaw || []) as Array<{ plate: string }>)
      .map((v) => String(v.plate || "").replace(/[^A-Z0-9]/gi, "").toUpperCase())
      .filter(Boolean),
  );

  const osCandidates: OsCandidate[] = oss.map((o) => ({
    id: o.id,
    osNumber: o.os_number ?? null,
    clientId: o.client_id ?? null,
    vehicleId: o.vehicle_id ?? null,
    placa: o.vehicle_id ? placaByVehicleId.get(o.vehicle_id) || null : null,
    scheduledDate: o.scheduled_date ?? null,
    completedDate: o.completed_date ?? null,
    missionStartedAt: o.mission_started_at ?? null,
    status: o.status ?? null,
    assignedEmployeeId: o.assigned_employee_id ?? null,
  }));

  // Busca mission_costs dessas OS
  const osIds = osCandidates.map((o) => o.id);
  let missionCosts: MissionCostCandidate[] = [];
  if (osIds.length > 0) {
    const { data: mcRaw, error: mcErr } = await supabaseAdmin
      .from("mission_costs")
      .select("id,service_order_id,amount,category,description,created_at")
      .in("service_order_id", osIds);
    if (mcErr) throw new Error(`erro ao buscar mission_costs: ${mcErr.message}`);
    missionCosts = ((mcRaw || []) as Array<any>).map((m) => ({
      id: m.id,
      serviceOrderId: m.service_order_id,
      amount: Number(m.amount) || 0,
      category: m.category || "",
      description: m.description ?? null,
      createdAt: m.created_at ?? null,
    }));
  }

  out.result = cruzarPedagios(parsed.rows, osCandidates, missionCosts, allPlatesSet);
  return out;
}
