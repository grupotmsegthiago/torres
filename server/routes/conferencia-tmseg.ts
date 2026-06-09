import { Express, Request, Response } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import ExcelJS from "exceljs";

// ---------------------------------------------------------------------------
// Conferência TM SEG — conciliação read-only de planilha externa (mesmo layout
// do boletim que o sistema gera) contra os dados de faturamento do banco.
// NÃO grava nada: apenas destaca divergências. A correção é manual pelo dono.
// Chave composta: DATA (BRT) + PLACA VIATURA (normalizada) + janela de KM +
// ROTA (confirmação). Compara KM rodado, pedágio, franquias e valor final.
// ---------------------------------------------------------------------------

const TOL_MONEY = 0.01; // R$
const TOL_KM = 1;       // km

function normPlate(v: any): string {
  return String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Parser numérico robusto: respeita o tipo nativo do exceljs e trata tanto
// formato BR ("1.901", "5.947,20") quanto US ("4.8", "5947.2").
function parseNum(v: any): number {
  if (v == null || v === "" || v === "—" || v === "-") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v.result != null) return parseNum(v.result);
  let s = String(v).trim().replace(/r\$\s*/i, "").replace(/\s/g, "").replace(/%/g, "");
  if (s === "" || s === "—" || s === "-") return 0;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  } else if (hasDot) {
    // só ponto: se for grupo de milhar (1.901 / 12.345.678) remove; senão é decimal
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value as any;
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v.richText) return v.richText.map((r: any) => r.text).join("");
    return "";
  }
  return String(v);
}

// "18/05/2026" -> "2026-05-18". Também aceita Date nativo do exceljs.
function parseDateBR(v: any): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function extractCity(addr: string): string {
  if (!addr) return "";
  const parts = addr.toUpperCase().trim().split(/[,\-\/×x]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const city = parts.find(p => !/^\d/.test(p) && p.length > 2 && !/^(SP|RJ|MG|PR|SC|RS|BA|GO|MT|MS|PA|AM|CE|PE|MA|PI|RN|PB|SE|AL|TO|RO|AC|AP|RR|ES|DF)$/.test(p));
    return city || parts[0];
  }
  return parts[0] || addr.toUpperCase().trim();
}

function normRoute(s: string): string {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Mapeia o cabeçalho do boletim por NOME (robusto a colunas extra tipo PROCESSO).
const HEADER_ALIASES: Record<string, string[]> = {
  numero: ["nº", "n°", "no", "num"],
  rota: ["rota"],
  valor: ["valor"],
  hrFranq: ["hr franq"],
  kmFranq: ["km franq"],
  dataInicio: ["data início", "data inicio"],
  viatura: ["viatura"],
  escoltado: ["veíc. escoltado", "veic. escoltado", "veíc escoltado"],
  kmInicial: ["km inicial", "inicial"],
  kmFinal: ["km final", "final"],
  kmTotal: ["km total"],
  pedagio: ["pedágio", "pedagio"],
  total: ["total"],
};

function findHeaderRow(ws: ExcelJS.Worksheet): { rowIdx: number; cols: Record<string, number> } | null {
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    const row = ws.getRow(r);
    const labels: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) labels[c] = cellText(row.getCell(c)).trim().toLowerCase();
    const firstNonEmpty = labels.find(Boolean);
    if (!labels.some(l => HEADER_ALIASES.numero.includes(l)) ) continue;
    // confirma que parece cabeçalho (tem rota e km inicial)
    const hasRota = labels.some(l => HEADER_ALIASES.rota.includes(l));
    const hasKmIni = labels.some(l => HEADER_ALIASES.kmInicial.includes(l));
    if (!hasRota || !hasKmIni) continue;
    const cols: Record<string, number> = {};
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      for (let c = 1; c <= ws.columnCount; c++) {
        if (aliases.includes(labels[c])) { cols[key] = c; break; }
      }
    }
    return { rowIdx: r, cols };
  }
  return null;
}

interface ExtRow {
  numero: string;
  rota: string;
  rotaCidades: string;
  data: string | null;
  placa: string;
  placaRaw: string;
  escoltado: string;
  kmInicial: number;
  kmFinal: number;
  kmTotal: number;
  kmFranq: number;
  hrFranq: string;
  pedagio: number;
  total: number;
  linha: number;
}

function parseBoletim(buffer: Buffer): Promise<ExtRow[]> {
  return (async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("Planilha vazia ou ilegível.");
    const header = findHeaderRow(ws);
    if (!header) throw new Error("Cabeçalho do boletim não encontrado (esperado uma linha com 'Nº', 'ROTA', 'KM INICIAL').");
    const { rowIdx, cols } = header;
    const rows: ExtRow[] = [];
    const get = (row: ExcelJS.Row, key: string) => (cols[key] ? row.getCell(cols[key]) : null);
    for (let r = rowIdx + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const numero = get(row, "numero") ? cellText(get(row, "numero")!).trim() : "";
      const placaRaw = get(row, "viatura") ? cellText(get(row, "viatura")!).trim() : "";
      const rota = get(row, "rota") ? cellText(get(row, "rota")!).trim() : "";
      // pula linhas de total/rodapé/vazias
      const numUpper = numero.toUpperCase();
      if (!numero && !placaRaw) continue;
      if (numUpper.startsWith("TOTAL") || numUpper.includes("MÉDIA") || numUpper.includes("MEDIA")) continue;
      const data = parseDateBR(get(row, "dataInicio") ? (get(row, "dataInicio")!.value as any) : null);
      const origemDestino = rota;
      rows.push({
        numero,
        rota,
        rotaCidades: origemDestino.includes("×") || origemDestino.toUpperCase().includes(" X ")
          ? origemDestino.toUpperCase().replace(/\s+X\s+/i, "×")
          : extractCity(origemDestino),
        data,
        placa: normPlate(placaRaw),
        placaRaw,
        escoltado: get(row, "escoltado") ? cellText(get(row, "escoltado")!).trim() : "",
        kmInicial: parseNum(get(row, "kmInicial")?.value),
        kmFinal: parseNum(get(row, "kmFinal")?.value),
        kmTotal: parseNum(get(row, "kmTotal")?.value),
        kmFranq: parseNum(get(row, "kmFranq")?.value),
        hrFranq: get(row, "hrFranq") ? cellText(get(row, "hrFranq")!).trim() : "",
        pedagio: parseNum(get(row, "pedagio")?.value),
        total: parseNum(get(row, "total")?.value),
        linha: r,
      });
    }
    return rows;
  })();
}

interface SysRow {
  billingId: number;
  serviceOrderId: number | null;
  osNumber: string;
  data: string | null;
  placa: string;
  placaRaw: string;
  rotaCidades: string;
  origem: string;
  destino: string;
  kmInicial: number;
  kmFinal: number;
  kmTotal: number;
  kmFranq: number;
  hrFranqHoras: number;
  pedagio: number;
  total: number;
  status: string;
  revenueValue: number;
  custoFornecedor: number;
  matched: boolean;
}

function fmtHHMM(h: number): string {
  if (isNaN(h) || h <= 0) return "00:00";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export async function conciliarBoletim(buffer: Buffer, clientId: number) {
      const extRows = await parseBoletim(buffer);
      if (!extRows.length) throw new Error("Nenhuma linha de missão encontrada na planilha.");

      // período coberto pela planilha (data início) -> janela de busca no banco
      const datas = extRows.map(r => r.data).filter(Boolean).sort() as string[];
      const minDate = datas[0] || "2000-01-01";
      const maxDate = datas[datas.length - 1] || "2100-01-01";
      // aritmética de data independente de timezone (datas-only YYYY-MM-DD em BRT)
      const buf = (d: string, days: number) => {
        const [y, m, dd] = d.split("-").map(Number);
        const dt = new Date(Date.UTC(y, (m || 1) - 1, dd || 1));
        dt.setUTCDate(dt.getUTCDate() + days);
        return dt.toISOString().split("T")[0];
      };

      // dados do sistema: escort_billings do cliente na janela (com folga p/ missões multi-dia)
      const { data: billings, error: bErr } = await supabaseAdmin
        .from("escort_billings")
        .select("*")
        .eq("client_id", Number(clientId))
        .gte("data_missao", buf(minDate, -3))
        .lte("data_missao", buf(maxDate, 3) + "T23:59:59");
      if (bErr) throw new Error("Erro ao buscar faturamento do sistema: " + bErr.message);

      const billingList = billings || [];
      const soIds = billingList.map(b => b.service_order_id).filter(Boolean);
      const ctIds = Array.from(new Set(billingList.map(b => b.contract_id).filter(Boolean)));

      let orders: any[] = [];
      if (soIds.length) {
        const { data } = await supabaseAdmin
          .from("service_orders")
          .select("id, os_number, origin, destination, scheduled_date, vehicle_plate, escorted_vehicle_plate, revenue_value, cost_value, custo_total_alocado, processo_omega, status")
          .in("id", soIds);
        orders = data || [];
      }
      let contracts: any[] = [];
      if (ctIds.length) {
        const { data } = await supabaseAdmin.from("escort_contracts").select("*").in("id", ctIds);
        contracts = data || [];
      }
      const ordersMap = new Map(orders.map(o => [o.id, o]));
      const ctMap = new Map(contracts.map(c => [c.id, c]));

      const sysRows: SysRow[] = billingList.map((b: any) => {
        const so = ordersMap.get(b.service_order_id) || {};
        const ct = ctMap.get(b.contract_id) || {};
        const n = (v: any) => Number(v) || 0;
        const franquiaKm = n(ct.franquia_km) || n(ct.franquia_minima_km) || n(b.km_franquia);
        const franquiaHoras = n(ct.franquia_horas) || n(b.franquia_horas);
        const kmTotal = n(b.km_total);
        const fatPedagio = n(b.despesas_pedagio);
        const fatTotal = n(b.fat_total) || (
          n(b.fat_acionamento) + n(b.fat_km) + n(b.fat_hora_extra) + fatPedagio +
          n(b.fat_adicional_noturno) + n(b.fat_estadia) + n(b.fat_pernoite) + n(b.despesas_outras) + n(b.receitas_os)
        );
        const origem = b.origem || so.origin || "";
        const destino = b.destino || so.destination || "";
        const rotaCidades = (origem && destino) ? `${extractCity(origem)}×${extractCity(destino)}` : extractCity(origem || destino);
        const dataMissao = (b.data_missao || so.scheduled_date || b.created_at || "").split("T")[0] || null;
        const placaRaw = b.placa_viatura || so.vehicle_plate || "";
        return {
          billingId: b.id,
          serviceOrderId: b.service_order_id || null,
          osNumber: b.os_number || so.os_number || `OS-${b.service_order_id}`,
          data: dataMissao,
          placa: normPlate(placaRaw),
          placaRaw,
          rotaCidades,
          origem, destino,
          kmInicial: n(b.km_inicial),
          kmFinal: n(b.km_final),
          kmTotal,
          kmFranq: franquiaKm,
          hrFranqHoras: franquiaHoras,
          pedagio: fatPedagio,
          total: fatTotal,
          status: b.status || so.status || "",
          revenueValue: n(so.revenue_value),
          custoFornecedor: n(so.custo_total_alocado) || n(so.cost_value),
          matched: false,
        };
      });

      // índice por data|placa
      const sysIndex = new Map<string, SysRow[]>();
      for (const s of sysRows) {
        const key = `${s.data}|${s.placa}`;
        if (!sysIndex.has(key)) sysIndex.set(key, []);
        sysIndex.get(key)!.push(s);
      }

      const matchedRows: any[] = [];
      const missingInSystem: any[] = [];

      for (const ext of extRows) {
        const key = `${ext.data}|${ext.placa}`;
        const exactCandidates = (sysIndex.get(key) || []).filter(s => !s.matched);
        const isExact = exactCandidates.length > 0;
        let candidates = exactCandidates;
        // fallback: mesma placa em data ±1 (missões que viram a noite)
        if (!candidates.length && ext.data) {
          for (const s of sysRows) {
            if (s.matched || s.placa !== ext.placa || !s.data) continue;
            const dd = Math.abs((new Date(s.data + "T12:00:00").getTime() - new Date(ext.data + "T12:00:00").getTime()) / 86400000);
            if (dd <= 1) candidates.push(s);
          }
        }
        // pontuação: janela de KM + número da OS + rota
        let best: SysRow | null = null;
        let bestScore = -1;
        for (const s of candidates) {
          let score = 0;
          if (ext.numero && s.osNumber && normRoute(ext.numero) === normRoute(s.osNumber)) score += 5;
          // janela de KM inicial/final
          if (ext.kmInicial && Math.abs(s.kmInicial - ext.kmInicial) <= 5) score += 3;
          if (ext.kmFinal && Math.abs(s.kmFinal - ext.kmFinal) <= 5) score += 3;
          if (ext.kmTotal && Math.abs(s.kmTotal - ext.kmTotal) <= 5) score += 2;
          // rota
          const er = normRoute(ext.rotaCidades), sr = normRoute(s.rotaCidades);
          if (er && sr && (er === sr || er.includes(sr) || sr.includes(er))) score += 2;
          if (score > bestScore) { bestScore = score; best = s; }
        }
        // confiança mínima: aceita SE houver candidato único exato (chave data+placa
        // é forte) OU houver corroboração (score>=2: rota/KM/OS). Senão, não há match
        // confiável -> tratado como "fora do sistema" em vez de forçar par errado.
        const accept = !!best && (
          (isExact && (exactCandidates.length === 1 || bestScore >= 2)) ||
          (!isExact && bestScore >= 2)
        );
        if (!accept) {
          missingInSystem.push(ext);
          continue;
        }
        best!.matched = true;
        best = best!;

        const diffKm = ext.kmTotal - best.kmTotal;
        const diffPedagio = ext.pedagio - best.pedagio;
        const diffFranq = ext.kmFranq - best.kmFranq;
        const diffTotal = ext.total - best.total;
        const fields = {
          kmTotal: { ext: ext.kmTotal, sys: best.kmTotal, diff: diffKm, diverge: Math.abs(diffKm) > TOL_KM },
          pedagio: { ext: ext.pedagio, sys: best.pedagio, diff: diffPedagio, diverge: Math.abs(diffPedagio) > TOL_MONEY },
          kmFranq: { ext: ext.kmFranq, sys: best.kmFranq, diff: diffFranq, diverge: Math.abs(diffFranq) > TOL_KM },
          total: { ext: ext.total, sys: best.total, diff: diffTotal, diverge: Math.abs(diffTotal) > TOL_MONEY },
        };
        const hasDivergence = Object.values(fields).some(f => f.diverge);
        matchedRows.push({
          osNumber: best.osNumber,
          extNumero: ext.numero,
          data: best.data,
          placa: best.placaRaw,
          rotaSistema: best.rotaCidades,
          rotaPlanilha: ext.rotaCidades,
          status: best.status,
          matchScore: bestScore,
          fields,
          hasDivergence,
          revenueValue: best.revenueValue,
          custoFornecedor: best.custoFornecedor,
        });
      }

      // "fora da planilha" só dentro do período informado pela planilha (o buffer ±3d
      // serve apenas p/ casar missões multi-dia, não p/ listar OS de outros períodos).
      const missingInSheet = sysRows
        .filter(s => !s.matched && s.data && s.data >= minDate && s.data <= maxDate)
        .map(s => ({
          osNumber: s.osNumber, data: s.data, placa: s.placaRaw, rota: s.rotaCidades,
          total: s.total, status: s.status,
        }));

      const divergentCount = matchedRows.filter(r => r.hasDivergence).length;
      const extTotal = extRows.reduce((a, r) => a + r.total, 0);
      const sysTotalMatched = matchedRows.reduce((a, r) => a + r.fields.total.sys, 0);

      return {
        period: { from: minDate, to: maxDate },
        summary: {
          ext_count: extRows.length,
          sys_count: sysRows.length,
          matched: matchedRows.length,
          divergent: divergentCount,
          missing_in_system: missingInSystem.length,
          missing_in_sheet: missingInSheet.length,
          ext_total: extTotal,
          sys_total_matched: sysTotalMatched,
          diff_total: extTotal - sysTotalMatched,
        },
        matched: matchedRows,
        missingInSystem: missingInSystem.map(e => ({
          numero: e.numero, data: e.data, placa: e.placaRaw, rota: e.rotaCidades, total: e.total,
        })),
        missingInSheet,
      };
}

export function registerConferenciaTmsegRoutes(app: Express) {
  app.post("/api/conferencia-tmseg/conciliar", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { fileBase64, clientId } = req.body || {};
      if (!fileBase64) return res.status(400).json({ message: "Arquivo não enviado." });
      if (!clientId) return res.status(400).json({ message: "Selecione o cliente da planilha." });
      const buffer = Buffer.from(String(fileBase64), "base64");
      const result = await conciliarBoletim(buffer, Number(clientId));
      return res.json(result);
    } catch (err: any) {
      console.error("[conferencia-tmseg] erro:", err);
      return res.status(500).json({ message: err.message || "Falha ao conciliar planilha." });
    }
  });
}
