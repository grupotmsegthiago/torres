export interface TicketLogPedagioHeader {
  codigoFatura: string | null;
  cliente: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  vencimento: string | null;
  mesReferencia: string | null;
  status: string | null;
}

export interface TicketLogPedagioRow {
  codigo: string;
  data: string;
  hora: string | null;
  placa: string;
  valor: number;
  estabelecimento: string | null;
  endereco: string | null;
  categoria: string | null;
}

export interface TicketLogPedagioParsed {
  header: TicketLogPedagioHeader;
  rows: TicketLogPedagioRow[];
  total: number;
}

function stripBomAndNormalize(txt: string): string {
  if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
  return txt.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseNumberBR(raw: string | undefined | null): number {
  if (!raw) return 0;
  const s = String(raw).trim().replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function ddmmyyyyToIso(dmy: string | null | undefined): string | null {
  if (!dmy) return null;
  const m = String(dmy).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function splitCsvLine(line: string, sep = ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === sep && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.replace(/\t/g, "").trim());
}

export function parseTicketlogPedagioCsv(content: string): TicketLogPedagioParsed {
  const txt = stripBomAndNormalize(content);
  const lines = txt.split("\n");

  const header: TicketLogPedagioHeader = {
    codigoFatura: null, cliente: null, periodoInicio: null, periodoFim: null,
    vencimento: null, mesReferencia: null, status: null,
  };

  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;
    const first = (raw.split(";")[0] || "").trim();
    // Localiza linha cabeçalho das transações (começa com "Código")
    if (first === "Código" || first === "Codigo" || /^C[óo]digo$/.test(first)) {
      headerIdx = i;
      break;
    }
    const m = first.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
    if (key.startsWith("código da fatura") || key.startsWith("codigo da fatura")) header.codigoFatura = val || null;
    else if (key.startsWith("cliente")) header.cliente = val || null;
    else if (key.startsWith("mês de referência") || key.startsWith("mes de referencia")) header.mesReferencia = val || null;
    else if (key.startsWith("período apurado") || key.startsWith("periodo apurado")) {
      const dm = val.match(/(\d{2}\/\d{2}\/\d{4})\D+(\d{2}\/\d{2}\/\d{4})/);
      if (dm) {
        header.periodoInicio = ddmmyyyyToIso(dm[1]);
        header.periodoFim = ddmmyyyyToIso(dm[2]);
      }
    }
    else if (key.startsWith("vencimento")) header.vencimento = ddmmyyyyToIso(val);
    else if (key.startsWith("status da fatura")) header.status = val || null;
  }

  const rows: TicketLogPedagioRow[] = [];
  let total = 0;

  if (headerIdx >= 0) {
    const headerCols = splitCsvLine(lines[headerIdx]).map((s) => s.toLowerCase());
    const idxOf = (...names: string[]) => {
      for (const n of names) {
        const i = headerCols.findIndex((h) => h === n.toLowerCase());
        if (i >= 0) return i;
      }
      // tenta substring
      for (const n of names) {
        const i = headerCols.findIndex((h) => h.includes(n.toLowerCase()));
        if (i >= 0) return i;
      }
      return -1;
    };
    const iCod = idxOf("código", "codigo");
    const iData = idxOf("data da transação", "data da transacao");
    const iHora = idxOf("hora da transação", "hora da transacao");
    const iPlaca = idxOf("placa");
    const iEstab = idxOf("estabelecimento");
    const iEnd = idxOf("endereço", "endereco");
    const iValorCob = idxOf("valor cobrado(r$)", "valor cobrado");
    const iValorTrans = idxOf("valor da transação(r$)", "valor da transacao(r$)", "valor da transação", "valor da transacao");
    const iCatCob = idxOf("categoria cobrada");

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const raw = lines[i];
      if (!raw) continue;
      const cols = splitCsvLine(raw);
      const codigo = (cols[iCod] || "").trim();
      const data = ddmmyyyyToIso((cols[iData] || "").trim());
      const placa = (cols[iPlaca] || "").replace(/[\s\t"]/g, "").toUpperCase();
      if (!codigo || !data || !placa) continue;
      // Preferir valor cobrado; senão valor da transação
      const rawValor = (iValorCob >= 0 ? cols[iValorCob] : "") || (iValorTrans >= 0 ? cols[iValorTrans] : "") || "0";
      const valorAbs = Math.abs(parseNumberBR(rawValor));
      if (valorAbs <= 0) continue;
      rows.push({
        codigo,
        data,
        hora: (cols[iHora] || "").trim() || null,
        placa,
        valor: valorAbs,
        estabelecimento: (cols[iEstab] || "").trim() || null,
        endereco: (cols[iEnd] || "").trim() || null,
        categoria: (cols[iCatCob] || "").trim() || null,
      });
      total += valorAbs;
    }
  }

  return { header, rows, total: Math.round(total * 100) / 100 };
}

// ============================================================================
// Cruzamento
// ============================================================================

export interface OsCandidate {
  id: number;
  osNumber: string | null;
  clientId: number | null;
  vehicleId: number | null;
  placa: string | null;
  scheduledDate: string | null;
  completedDate: string | null;
  missionStartedAt: string | null;
  status: string | null;
  assignedEmployeeId: number | null;
}

export interface MissionCostCandidate {
  id: number;
  serviceOrderId: number;
  amount: number;
  category: string;
  description: string | null;
  createdAt: string | null;
}

export interface ConciliadoEntry {
  csv: TicketLogPedagioRow;
  os: OsCandidate;
  missionCost: MissionCostCandidate;
}

export interface FaturaSemOsEntry {
  csv: TicketLogPedagioRow;
  motivo: string;
  osCandidatas: OsCandidate[];
}

export interface OsSemFaturaEntry {
  os: OsCandidate;
  missionCost: MissionCostCandidate;
}

export interface CruzamentoResult {
  conciliados: ConciliadoEntry[];
  faturaSemOS: FaturaSemOsEntry[];
  osSemFatura: OsSemFaturaEntry[];
  totais: {
    conciliados: { count: number; total: number };
    faturaSemOS: { count: number; total: number };
    osSemFatura: { count: number; total: number };
  };
}

function normPlate(p: string | null | undefined): string {
  return String(p || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function osWindow(os: OsCandidate): { start: string; end: string } | null {
  // Usa scheduled, missionStartedAt, completedDate para definir janela [start-1d, end+1d]
  const dates = [os.scheduledDate, os.missionStartedAt, os.completedDate]
    .filter(Boolean)
    .map((d) => String(d).slice(0, 10));
  if (dates.length === 0) return null;
  dates.sort();
  const startIso = dates[0];
  const endIso = dates[dates.length - 1];
  const shift = (iso: string, days: number) => {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  };
  return { start: shift(startIso, -1), end: shift(endIso, 1) };
}

export function cruzarPedagios(
  csvRows: TicketLogPedagioRow[],
  oss: OsCandidate[],
  missionCosts: MissionCostCandidate[],
  vehiclesPlatesSet: Set<string>,
): CruzamentoResult {
  const conciliados: ConciliadoEntry[] = [];
  const faturaSemOS: FaturaSemOsEntry[] = [];
  // Indexes
  const ossByPlate = new Map<string, OsCandidate[]>();
  for (const os of oss) {
    const p = normPlate(os.placa);
    if (!p) continue;
    const arr = ossByPlate.get(p) || [];
    arr.push(os);
    ossByPlate.set(p, arr);
  }
  const isPedagioCusto = (mc: MissionCostCandidate) => {
    const cat = (mc.category || "").toLowerCase();
    if (!cat.includes("pedágio") && !cat.includes("pedagio")) return false;
    if (cat.includes("receita")) return false;
    return true;
  };
  const mcByOs = new Map<number, MissionCostCandidate[]>();
  for (const mc of missionCosts) {
    if (!isPedagioCusto(mc)) continue;
    const arr = mcByOs.get(mc.serviceOrderId) || [];
    arr.push(mc);
    mcByOs.set(mc.serviceOrderId, arr);
  }
  const usedMcIds = new Set<number>();

  for (const row of csvRows) {
    const placaN = normPlate(row.placa);
    if (!placaN) {
      faturaSemOS.push({ csv: row, motivo: "linha sem placa válida", osCandidatas: [] });
      continue;
    }
    if (!vehiclesPlatesSet.has(placaN)) {
      faturaSemOS.push({ csv: row, motivo: "placa não encontrada na frota", osCandidatas: [] });
      continue;
    }
    const candidatas = (ossByPlate.get(placaN) || []).filter((os) => {
      const w = osWindow(os);
      if (!w) return false;
      return row.data >= w.start && row.data <= w.end;
    });

    if (candidatas.length === 0) {
      faturaSemOS.push({ csv: row, motivo: "nenhuma OS com essa placa nessa data", osCandidatas: [] });
      continue;
    }

    let matched: { os: OsCandidate; mc: MissionCostCandidate } | null = null;
    for (const os of candidatas) {
      const mcs = (mcByOs.get(os.id) || []).filter((mc) => !usedMcIds.has(mc.id));
      const mc = mcs.find((m) => Math.abs(Math.abs(m.amount) - row.valor) <= 0.01);
      if (mc) { matched = { os, mc }; break; }
    }

    if (matched) {
      usedMcIds.add(matched.mc.id);
      conciliados.push({ csv: row, os: matched.os, missionCost: matched.mc });
    } else {
      faturaSemOS.push({
        csv: row,
        motivo: "OS encontrada com mesma placa/data mas sem mission_cost de pedágio com valor compatível",
        osCandidatas: candidatas,
      });
    }
  }

  const osSemFatura: OsSemFaturaEntry[] = [];
  const ossById = new Map(oss.map((o) => [o.id, o]));
  for (const mc of missionCosts) {
    if (usedMcIds.has(mc.id)) continue;
    if (!isPedagioCusto(mc)) continue;
    const os = ossById.get(mc.serviceOrderId);
    if (!os) continue;
    osSemFatura.push({ os, missionCost: mc });
  }

  const sumCsv = (arr: { csv: TicketLogPedagioRow }[]) =>
    Math.round(arr.reduce((s, e) => s + e.csv.valor, 0) * 100) / 100;
  const sumMc = (arr: { missionCost: MissionCostCandidate }[]) =>
    Math.round(arr.reduce((s, e) => s + Math.abs(e.missionCost.amount), 0) * 100) / 100;

  return {
    conciliados,
    faturaSemOS,
    osSemFatura,
    totais: {
      conciliados: { count: conciliados.length, total: sumCsv(conciliados) },
      faturaSemOS: { count: faturaSemOS.length, total: sumCsv(faturaSemOS) },
      osSemFatura: { count: osSemFatura.length, total: sumMc(osSemFatura) },
    },
  };
}
