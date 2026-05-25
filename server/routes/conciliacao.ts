import type { Express } from "express";
import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import { rodarAuditoriaPedagiosCsv } from "../lib/auditoria-pedagios-ticketlog";

interface TicketLogTx {
  code: string;
  date: string | null;
  time: string | null;
  plate: string;
  fuelType: string | null;
  km: number | null;
  liters: number | null;
  valor: number | null;
  driver: string;
  station: string;
  city: string;
  uf: string;
}

function parseTicketLogText(txt: string): TicketLogTx[] {
  const lines = txt.split("\n");
  const out: TicketLogTx[] = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const m = l.match(
      /^\s*263076\s+(\d{10})\s+(.+?)\s+([A-Z]{3}\d[A-Z0-9]\d{2}|[A-Z]{3}\d{4})\s+(.+?)\s+Abastecimento\s+(.*)$/,
    );
    if (!m) continue;
    const [, code, , plate, , rest] = m;

    let date: string | null = null;
    let time: string | null = null;
    for (let j = Math.max(0, i - 4); j <= Math.min(lines.length - 1, i + 4); j++) {
      if (!date) {
        const d = lines[j].match(/(\d{2}\/\d{2}\/\d{4})/);
        if (d) date = d[1];
      }
      if (!time) {
        const t = lines[j].match(/(\d{2}:\d{2}:\d{2})/);
        if (t) time = t[1];
      }
    }

    const window = [
      lines[i - 2] || "",
      lines[i - 1] || "",
      rest,
      lines[i + 1] || "",
      lines[i + 2] || "",
      lines[i + 3] || "",
    ].join("\n");

    const lvMatch = window.match(/(\d+\.\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})/);
    const liters = lvMatch ? Number(lvMatch[1]) : null;
    const valor = lvMatch ? Number(lvMatch[2].replace(/\./g, "").replace(",", ".")) : null;
    const kmMatch = window.match(/(\d{4,7})\s+\d+\.\d{2}\s+\d{1,3}(?:\.\d{3})*,\d{2}/);
    const km = kmMatch ? Number(kmMatch[1]) : null;

    let fuelType: string | null = null;
    if (rest.match(/\bETANOL\b/)) fuelType = "ETANOL";
    else if (window.match(/GASOLINA[\s\S]*?ADITIVADA/)) fuelType = "GASOLINA ADITIVADA";
    else if (window.match(/GASOLINA[\s\S]*?COMUM/)) fuelType = "GASOLINA COMUM";
    else if (window.match(/\bGASOLINA\b/)) fuelType = "GASOLINA";
    else if (window.match(/\bDIESEL\s+S10\b/)) fuelType = "DIESEL S10";
    else if (window.match(/\bDIESEL\b/)) fuelType = "DIESEL";

    // Driver: tenta extrair as 5 linhas em volta na coluna ~95-150
    const drvLines = [lines[i - 2] || "", lines[i - 1] || "", l, lines[i + 1] || "", lines[i + 2] || ""];
    const driverParts = drvLines
      .map((ln) => ln.substring(95, 150).trim())
      .filter(
        (s) =>
          s &&
          !s.match(/Abastecimento|Cartao|Cart\xe3o|GASOLINA|ETANOL|DIESEL|^\d|COMUM|ADITIVADA/) &&
          s.match(/^[A-Z\s]+$/),
      );
    const driver = driverParts.join(" ").replace(/\s+/g, " ").trim();

    // Estabelecimento: coluna ~178-205
    const stationParts = drvLines
      .map((ln) => ln.substring(178, 215).trim())
      .filter((s) => s && s.match(/[A-Z]/));
    const station = stationParts.join(" ").replace(/\s+/g, " ").trim();

    // Cidade UF: últimas colunas
    const cityParts = drvLines
      .map((ln) => ln.substring(245, 290).trim())
      .filter((s) => s && s.match(/[A-Z]/));
    const city = cityParts.join(" ").replace(/\s+/g, " ").trim();
    const ufMatch = drvLines.map((ln) => ln.substring(290, 305).trim()).find((s) => s.match(/^[A-Z]{2}$/));
    const uf = ufMatch || "";

    out.push({ code, date, time, plate, fuelType, km, liters, valor, driver, station, city, uf });
  }
  return out;
}

// Parser do export Excel da TicketLog ("RFCVTITULO_*.XLS") — formato tabular
// (1 linha = 1 transação) bem mais limpo que o PDF "RFCV". Colunas (linha 0):
//   Cartao, Placa, Modelo, Responsavel, Data/Hora, Transacao, Tipo,
//   Liberacao Restricao, Motorista, Matricula, Estabelecimento, Cidade,
//   Quilometragem, Horas, Servico, Valor, Km Rodados, Horas Trabalhadas,
//   Litros, Km/litro, Litros/Hora, Valor/Litro, Ordem de Servico, Emissora...
// Data/Hora vem no formato americano "M/D/YY H:MM" (ex: "5/14/26 21:01").
// Detecta o tipo do arquivo TicketLog pelos magic bytes (assinatura binária),
// mais robusto que confiar só na extensão do `fileName` (arquivo pode chegar
// renomeado). Retorna "pdf" | "xls" | "unknown".
//   PDF        -> "%PDF-"                       (25 50 44 46 2D)
//   XLS OLE    -> Composite Document File V2    (D0 CF 11 E0 A1 B1 1A E1)
//   XLSX/ZIP   -> PK..                          (50 4B 03 04)
export function detectTicketLogFileKind(
  buf: Buffer,
  fileName?: string,
): "pdf" | "xls" | "unknown" {
  if (buf.length >= 8) {
    if (
      buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d
    ) return "pdf";
    if (
      buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0 &&
      buf[4] === 0xa1 && buf[5] === 0xb1 && buf[6] === 0x1a && buf[7] === 0xe1
    ) return "xls";
    if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
      // ZIP container — pode ser XLSX. Se o nome ajuda, confia nele;
      // senão assume XLS (o cliente da TicketLog só exporta planilhas).
      const n = (fileName || "").toLowerCase();
      if (/\.pdf$/.test(n)) return "unknown";
      return "xls";
    }
  }
  // Fallback por nome quando magic bytes inconclusivos.
  const n = (fileName || "").toLowerCase();
  if (/\.(xlsx?|xlsm|xlsb)$/.test(n)) return "xls";
  if (/\.pdf$/.test(n)) return "pdf";
  return "unknown";
}

export function parseTicketLogXls(buf: Buffer): TicketLogTx[] {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, {
    header: 1,
    raw: false,
    defval: "",
  });
  if (rows.length < 2) return [];

  const header = (rows[0] as any[]).map((h) => String(h || "").trim());
  const colIdx = (...names: string[]): number => {
    for (const n of names) {
      const i = header.findIndex((h) => h.toLowerCase() === n.toLowerCase());
      if (i >= 0) return i;
    }
    return -1;
  };
  const iPlate = colIdx("Placa");
  const iDate = colIdx("Data/Hora", "DataHora", "Data Hora");
  const iCode = colIdx("Transacao", "Transação");
  const iTipo = colIdx("Tipo");
  const iDriver = colIdx("Motorista");
  const iStation = colIdx("Estabelecimento");
  const iCity = colIdx("Cidade");
  const iKm = colIdx("Quilometragem", "Km");
  const iFuel = colIdx("Servico", "Serviço");
  const iValor = colIdx("Valor");
  const iLiters = colIdx("Litros");

  // Validação dura: colunas obrigatórias precisam estar no header da planilha.
  // Se o usuário subir um Excel qualquer (não-TicketLog), aborta com mensagem
  // clara em vez de devolver report vazio silenciosamente.
  const missing: string[] = [];
  if (iPlate < 0) missing.push("Placa");
  if (iDate < 0) missing.push("Data/Hora");
  if (iCode < 0) missing.push("Transacao");
  if (iValor < 0) missing.push("Valor");
  if (missing.length) {
    throw new Error(
      `Planilha não parece ser o export RFCVTITULO da TicketLog. Colunas obrigatórias ausentes: ${missing.join(", ")}.`,
    );
  }

  const out: TicketLogTx[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as any[];
    if (!row || row.length === 0) continue;
    const code = String(row[iCode] ?? "").trim();
    const plate = String(row[iPlate] ?? "").trim().toUpperCase();
    if (!code || !plate) continue;
    // Pula linhas que não são COMPRA (estornos, cancelamentos etc).
    const tipo = String(row[iTipo] ?? "").trim().toUpperCase();
    if (tipo && tipo !== "COMPRA") continue;

    // "5/14/26 21:01" -> date "14/05/2026" / time "21:01:00"
    let date: string | null = null;
    let time: string | null = null;
    const dh = String(row[iDate] ?? "").trim();
    if (dh) {
      const m = dh.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      if (m) {
        const mm = m[1].padStart(2, "0");
        const dd = m[2].padStart(2, "0");
        const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
        date = `${dd}/${mm}/${yy}`;
        if (m[4]) {
          const hh = m[4].padStart(2, "0");
          const mi = m[5];
          const ss = (m[6] || "00").padStart(2, "0");
          time = `${hh}:${mi}:${ss}`;
        }
      }
    }

    const num = (v: any): number | null => {
      if (v === "" || v == null) return null;
      // Excel exporta com ponto decimal (ex "61.09") e sem separador de milhar,
      // mas trata defensivamente caso venha "1.234,56".
      const s = String(v).trim();
      if (!s) return null;
      const hasComma = s.includes(",");
      const normalized = hasComma ? s.replace(/\./g, "").replace(",", ".") : s;
      const n = Number(normalized);
      return Number.isFinite(n) ? n : null;
    };

    const cidadeRaw = String(row[iCity] ?? "").trim();
    let city = cidadeRaw;
    let uf = "";
    const cm = cidadeRaw.match(/^(.+?)\s*-\s*([A-Z]{2})$/);
    if (cm) {
      city = cm[1].trim();
      uf = cm[2];
    }

    const fuelType = normalizeFuel(String(row[iFuel] ?? "").trim()) || null;

    out.push({
      code,
      date,
      time,
      plate,
      fuelType,
      km: num(row[iKm]),
      liters: num(row[iLiters]),
      valor: num(row[iValor]),
      driver: String(row[iDriver] ?? "").trim(),
      station: String(row[iStation] ?? "").trim(),
      city,
      uf,
    });
  }
  return out;
}

function dmyToIso(dmy: string | null): string | null {
  if (!dmy) return null;
  const m = dmy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function normalizeFuel(f: string | null | undefined): string {
  if (!f) return "";
  const u = f.toUpperCase();
  if (u.includes("ETANOL")) return "ETANOL";
  if (u.includes("DIESEL_S10") || u.includes("DIESEL S10")) return "DIESEL S10";
  if (u.includes("DIESEL")) return "DIESEL";
  if (u.includes("ADITIVADA")) return "GASOLINA ADITIVADA";
  if (u.includes("GASOLINA")) return "GASOLINA COMUM";
  if (u.includes("GNV")) return "GNV";
  return u;
}

// Integração TicketLog desativada por solicitação do dono (2026-05-25).
// Bloqueia todos os endpoints (/api/conciliacao-ticketlog/** e
// /api/auditoria-pedagios-ticketlog/**) retornando 503. Histórico no banco e
// no financeiro permanece intacto — esta é uma desativação de integração,
// não uma remoção de dados.
const TICKETLOG_DISABLED = true;
const ticketlogDisabledGuard = (_req: any, res: any, _next: any) =>
  res.status(503).json({
    message: "Integração TicketLog desativada. Operação indisponível.",
    code: "TICKETLOG_DISABLED",
  });

export function registerConciliacaoRoutes(app: Express) {
  if (TICKETLOG_DISABLED) {
    app.use("/api/conciliacao-ticketlog", ticketlogDisabledGuard);
    app.use("/api/auditoria-pedagios-ticketlog", ticketlogDisabledGuard);
    return;
  }
  app.post("/api/conciliacao-ticketlog", requireAuth, requireAdminRole, async (req, res) => {
    try {
      // Aceita 2 formatos de entrada:
      //  - PDF "RFCV" (legado): { pdfBase64 }
      //  - Arquivo genérico: { fileBase64, fileName } — fileName define o
      //    parser (.xls/.xlsx -> Excel TicketLog "RFCVTITULO"; .pdf -> PDF).
      const { pdfBase64, fileBase64, fileName, dateFrom } = req.body as {
        pdfBase64?: string;
        fileBase64?: string;
        fileName?: string;
        dateFrom?: string;
      };
      const payload = fileBase64 || pdfBase64;
      if (!payload) {
        return res.status(400).json({ message: "Arquivo obrigatório (fileBase64 ou pdfBase64)" });
      }
      const cleaned = payload.replace(/^data:[^;]+;base64,/, "");
      const buf = Buffer.from(cleaned, "base64");
      // Detecção híbrida (magic bytes + nome) — não confia só na extensão.
      const kind = detectTicketLogFileKind(buf, fileName);

      let tlAll: TicketLogTx[];
      if (kind === "xls") {
        try {
          tlAll = parseTicketLogXls(buf);
        } catch (xlsErr: any) {
          console.error("[conciliacao-ticketlog] xls parse error:", xlsErr);
          return res.status(400).json({ message: xlsErr.message || "Falha ao ler Excel" });
        }
      } else if (kind === "pdf") {
        const tmpPath = join(tmpdir(), `tl_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
        const tmpTxt = tmpPath.replace(/\.pdf$/, ".txt");
        writeFileSync(tmpPath, buf);

        const result = spawnSync("pdftotext", ["-layout", "-nopgbrk", tmpPath, tmpTxt]);
        try { unlinkSync(tmpPath); } catch {}
        if (result.status !== 0) {
          try { unlinkSync(tmpTxt); } catch {}
          return res.status(500).json({ message: "Falha ao extrair texto do PDF", stderr: result.stderr?.toString() });
        }
        const fs = await import("fs");
        const txt = fs.readFileSync(tmpTxt, "utf8");
        try { unlinkSync(tmpTxt); } catch {}

        tlAll = parseTicketLogText(txt);
      } else {
        return res.status(400).json({
          message:
            "Tipo de arquivo não reconhecido. Envie o PDF do RFCV ou a planilha .xls/.xlsx do RFCVTITULO gerada pela TicketLog.",
        });
      }
      // Filtrar a partir de dateFrom (default 2026-04-09)
      const cutoff = dateFrom || "2026-04-09";
      const tl = tlAll.filter((t) => {
        const iso = dmyToIso(t.date);
        return iso && iso >= cutoff;
      });

      // Determinar range de datas para query no sistema
      const isoDates = tl.map((t) => dmyToIso(t.date)).filter(Boolean) as string[];
      const minDate = isoDates.length ? isoDates.sort()[0] : cutoff;
      const maxDateIso = isoDates.length ? isoDates.sort().slice(-1)[0] : new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

      const { data: vfRaw } = await supabaseAdmin
        .from("vehicle_fueling")
        .select(
          "id,date,vehicle_id,driver_id,total_cost,liters,fuel_type,station,ticketlog_autorizacao,km,latitude,longitude,created_at",
        )
        .gte("date", minDate)
        .lte("date", maxDateIso)
        .range(0, 5000);
      const vf = vfRaw || [];

      const { data: vehiclesRaw } = await supabaseAdmin.from("vehicles").select("id,plate").range(0, 5000);
      const { data: empsRaw } = await supabaseAdmin.from("employees").select("id,name").range(0, 5000);
      const vById = new Map<number, string>((vehiclesRaw || []).map((v: any) => [v.id, v.plate]));
      const eById = new Map<number, string>((empsRaw || []).map((e: any) => [e.id, e.name]));
      const allPlates = new Set<string>((vehiclesRaw || []).map((v: any) => v.plate));

      // Index sistema
      const sysByCode = new Map<string, any>();
      for (const f of vf) {
        if (f.ticketlog_autorizacao) sysByCode.set(String(f.ticketlog_autorizacao), f);
      }
      const sysByPDV = new Map<string, any[]>();
      for (const f of vf) {
        const plate = vById.get(f.vehicle_id) || "?";
        const k = `${plate}|${f.date}|${Number(f.total_cost).toFixed(2)}`;
        if (!sysByPDV.has(k)) sysByPDV.set(k, []);
        sysByPDV.get(k)!.push(f);
      }

      const matched: any[] = [];
      const valueMismatch: any[] = [];
      const missingInSystem: any[] = [];
      const unregisteredPlates: any[] = [];
      const usedSysIds = new Set<number>();

      for (const t of tl) {
        const isoDate = dmyToIso(t.date);
        const enrich = (sys: any) => ({
          ticketlog: t,
          system: {
            id: sys.id,
            date: sys.date,
            plate: vById.get(sys.vehicle_id) || null,
            driver: sys.driver_id ? eById.get(sys.driver_id) || null : null,
            total_cost: Number(sys.total_cost),
            liters: Number(sys.liters || 0),
            fuel_type: sys.fuel_type,
            station: sys.station,
            km: sys.km,
            ticketlog_autorizacao: sys.ticketlog_autorizacao,
          },
          diffs: {
            valor: Math.abs(Number(sys.total_cost) - (t.valor || 0)),
            liters: Math.abs(Number(sys.liters || 0) - (t.liters || 0)),
            km: t.km && sys.km ? Math.abs(Number(sys.km) - t.km) : null,
            fuelMatches: normalizeFuel(t.fuelType) === normalizeFuel(sys.fuel_type),
          },
        });

        // 1. Placa não cadastrada
        if (!allPlates.has(t.plate)) {
          unregisteredPlates.push({ ticketlog: t });
          continue;
        }

        // 2. Match por código TL
        let sys = sysByCode.get(t.code);
        if (!sys) {
          // 3. Fallback: placa+data+valor exato
          const k = `${t.plate}|${isoDate}|${(t.valor || 0).toFixed(2)}`;
          const candidates = (sysByPDV.get(k) || []).filter((c) => !usedSysIds.has(c.id));
          if (candidates.length) sys = candidates[0];
        }
        if (!sys) {
          // 4. Fallback: placa+data (qualquer valor próximo)
          const sameDay = vf.filter(
            (f) => vById.get(f.vehicle_id) === t.plate && f.date === isoDate && !usedSysIds.has(f.id),
          );
          if (sameDay.length === 1) sys = sameDay[0];
          else if (sameDay.length > 1) {
            // pega o mais próximo em valor
            sys = sameDay.sort(
              (a, b) =>
                Math.abs(Number(a.total_cost) - (t.valor || 0)) -
                Math.abs(Number(b.total_cost) - (t.valor || 0)),
            )[0];
          }
        }

        if (!sys) {
          missingInSystem.push({ ticketlog: t });
          continue;
        }
        usedSysIds.add(sys.id);
        const enriched = enrich(sys);
        if (enriched.diffs.valor < 5.0) {
          matched.push(enriched);
        } else {
          valueMismatch.push(enriched);
        }
      }

      // Sistema sem TL correspondente
      const missingInTicketlog: any[] = [];
      for (const f of vf) {
        if (usedSysIds.has(f.id)) continue;
        if (f.date < cutoff) continue;
        missingInTicketlog.push({
          system: {
            id: f.id,
            date: f.date,
            plate: vById.get(f.vehicle_id) || null,
            driver: f.driver_id ? eById.get(f.driver_id) || null : null,
            total_cost: Number(f.total_cost),
            liters: Number(f.liters || 0),
            fuel_type: f.fuel_type,
            station: f.station,
            km: f.km,
            ticketlog_autorizacao: f.ticketlog_autorizacao,
          },
        });
      }

      const sumTL = tl.reduce((s, t) => s + (t.valor || 0), 0);
      const sumSys = vf
        .filter((f) => f.date >= cutoff)
        .reduce((s, f) => s + Number(f.total_cost || 0), 0);

      res.json({
        cutoff,
        period: { from: minDate, to: maxDateIso },
        summary: {
          ticketlog_count: tl.length,
          ticketlog_total: sumTL,
          system_count: vf.filter((f) => f.date >= cutoff).length,
          system_total: sumSys,
          diff_total: sumSys - sumTL,
          matched: matched.length,
          value_mismatch: valueMismatch.length,
          missing_in_system: missingInSystem.length,
          missing_in_ticketlog: missingInTicketlog.length,
          unregistered_plates: unregisteredPlates.length,
        },
        matched,
        valueMismatch,
        missingInSystem,
        missingInTicketlog,
        unregisteredPlates,
      });
    } catch (err: any) {
      console.error("[conciliacao-ticketlog] error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // === MARCAR FINANCIAL_TRANSACTIONS COMO CONCILIADAS COM FATURA TICKETLOG ===
  // Evita duplicação se o financeiro receber a fatura mensal da TicketLog:
  // marcar essas transações como conciliadas pra excluí-las dos relatórios manuais.
  app.post("/api/conciliacao-ticketlog/marcar", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { fueling_ids, ref } = req.body as { fueling_ids?: number[]; ref?: string };
      if (!Array.isArray(fueling_ids) || fueling_ids.length === 0) {
        return res.status(400).json({ message: "fueling_ids (array) obrigatório" });
      }
      if (!ref || typeof ref !== "string") {
        return res.status(400).json({ message: "ref (string com identificador da fatura TicketLog) obrigatório" });
      }
      const idsAsStr = fueling_ids.map(String);
      const { data, error } = await supabaseAdmin
        .from("financial_transactions")
        .update({
          conciliado_em: new Date().toISOString(),
          conciliado_ref: ref,
        })
        .eq("origin_type", "vehicle_fueling")
        .in("origin_id", idsAsStr)
        .is("conciliado_em", null)
        .select("id, origin_id, amount");
      if (error) return res.status(500).json({ message: error.message });
      const total = (data || []).reduce((s, t: any) => s + Number(t.amount || 0), 0);
      res.json({
        marcadas: (data || []).length,
        total_marcado: total,
        ref,
      });
    } catch (err: any) {
      console.error("[conciliacao-ticketlog/marcar] error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // === DESFAZER CONCILIAÇÃO TICKETLOG (caso o usuário se arrependa) ===
  app.post("/api/conciliacao-ticketlog/desmarcar", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { ref } = req.body as { ref?: string };
      if (!ref) return res.status(400).json({ message: "ref obrigatório" });
      const { data, error } = await supabaseAdmin
        .from("financial_transactions")
        .update({ conciliado_em: null, conciliado_ref: null })
        .eq("conciliado_ref", ref)
        .select("id");
      if (error) return res.status(500).json({ message: error.message });
      res.json({ desmarcadas: (data || []).length, ref });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === CONTROLADORIA: Conferência rápida pedágio pago × cobrado ===
  // Calculadora read-only: dado um período, soma quanto foi cobrado dos clientes
  // (mission_costs com category contendo "pedágio" e cost_type='revenue', joined
  // por data_missao das service_orders — data efetiva da operação, BRT).
  // Frontend digita o valor pago e compara — sem persistência.
  app.get("/api/controladoria/pedagio-cobrado", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const inicio = String(req.query.inicio || "").trim();
      const fim = String(req.query.fim || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
        return res.status(400).json({ message: "Parâmetros 'inicio' e 'fim' (YYYY-MM-DD) obrigatórios" });
      }
      if (inicio > fim) {
        return res.status(400).json({ message: "Data início deve ser <= data fim" });
      }

      // 1. OS no período (BRT). scheduled_date é timestamp; cobre o dia inteiro.
      // Filtra pela data agendada (igual aos demais relatórios financeiros).
      const inicioTs = `${inicio}T00:00:00`;
      const fimTs = `${fim}T23:59:59`;
      const osIds: number[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabaseAdmin
          .from("service_orders")
          .select("id")
          .gte("scheduled_date", inicioTs)
          .lte("scheduled_date", fimTs)
          .range(from, from + pageSize - 1);
        if (error) return res.status(500).json({ message: error.message });
        const rows = data || [];
        for (const r of rows) osIds.push((r as any).id);
        if (rows.length < pageSize) break;
      }

      if (osIds.length === 0) {
        return res.json({ inicio, fim, totalCobrado: 0, qtdOs: 0 });
      }

      // 2. mission_costs de receita pedágio dessas OS. Paginar em chunks de IDs.
      let totalCobrado = 0;
      const osComPedagio = new Set<number>();
      const chunkSize = 500;
      for (let i = 0; i < osIds.length; i += chunkSize) {
        const chunk = osIds.slice(i, i + chunkSize);
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await supabaseAdmin
            .from("mission_costs")
            .select("service_order_id, amount, category, cost_type")
            .in("service_order_id", chunk)
            .eq("cost_type", "revenue")
            .or("category.ilike.%pedágio%,category.ilike.%pedagio%")
            .range(from, from + pageSize - 1);
          if (error) return res.status(500).json({ message: error.message });
          const rows = data || [];
          for (const r of rows) {
            const amt = Number((r as any).amount || 0);
            if (!Number.isFinite(amt)) continue;
            totalCobrado += amt;
            osComPedagio.add(Number((r as any).service_order_id));
          }
          if (rows.length < pageSize) break;
        }
      }

      res.json({
        inicio,
        fim,
        totalCobrado: Math.round(totalCobrado * 100) / 100,
        qtdOs: osComPedagio.size,
      });
    } catch (err: any) {
      console.error("[pedagio-cobrado] error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // === ANOTAÇÕES DE AUDITORIA DE PEDÁGIO (justificadas/contestadas/etc) ===
  app.get("/api/auditoria-pedagios-ticketlog/notes", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const codigoFatura = String(req.query.codigoFatura || "").trim();
      if (!codigoFatura) return res.status(400).json({ message: "codigoFatura obrigatório" });
      const { data, error } = await supabaseAdmin
        .from("ticketlog_pedagio_audit_notes")
        .select("*")
        .eq("codigo_fatura", codigoFatura);
      if (error) return res.status(500).json({ message: error.message });
      res.json({ notes: data || [] });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || String(err) });
    }
  });

  // === LISTA DE FATURAS COM ANOTAÇÕES (sem precisar do CSV) ===
  // Agrupa por codigo_fatura, com contagem por status e data da última edição.
  app.get("/api/auditoria-pedagios-ticketlog/faturas", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("ticketlog_pedagio_audit_notes")
        .select("codigo_fatura,status,updated_at,snapshot")
        .order("updated_at", { ascending: false })
        .range(0, 10000);
      if (error) return res.status(500).json({ message: error.message });
      const byFat = new Map<string, {
        codigoFatura: string;
        pendentes: number;
        justificadas: number;
        contestadas: number;
        total: number;
        ultimaEdicao: string | null;
        cliente: string | null;
      }>();
      for (const n of (data || []) as Array<any>) {
        const k = String(n.codigo_fatura || "");
        if (!k) continue;
        let entry = byFat.get(k);
        if (!entry) {
          entry = {
            codigoFatura: k,
            pendentes: 0,
            justificadas: 0,
            contestadas: 0,
            total: 0,
            ultimaEdicao: null,
            cliente: null,
          };
          byFat.set(k, entry);
        }
        entry.total += 1;
        if (n.status === "justificada") entry.justificadas += 1;
        else if (n.status === "contestada") entry.contestadas += 1;
        else entry.pendentes += 1;
        if (n.updated_at && (!entry.ultimaEdicao || n.updated_at > entry.ultimaEdicao)) {
          entry.ultimaEdicao = n.updated_at;
        }
        const snapCliente = n.snapshot?.cliente;
        if (snapCliente && !entry.cliente) entry.cliente = snapCliente;
      }
      const faturas = Array.from(byFat.values()).sort((a, b) => {
        const av = a.ultimaEdicao || "";
        const bv = b.ultimaEdicao || "";
        return bv.localeCompare(av);
      });
      res.json({ faturas });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || String(err) });
    }
  });

  app.post("/api/auditoria-pedagios-ticketlog/notes", requireAuth, requireAdminRole, async (req: any, res) => {
    try {
      const {
        codigoFatura,
        scope,
        csvCodigo,
        missionCostId,
        serviceOrderId,
        status,
        observacao,
        snapshot,
      } = req.body as {
        codigoFatura?: string;
        scope?: "fatura_sem_os" | "os_sem_fatura";
        csvCodigo?: string | null;
        missionCostId?: number | null;
        serviceOrderId?: number | null;
        status?: "pendente" | "justificada" | "contestada";
        observacao?: string;
        snapshot?: Record<string, unknown> | null;
      };
      if (!codigoFatura) return res.status(400).json({ message: "codigoFatura obrigatório" });
      if (scope !== "fatura_sem_os" && scope !== "os_sem_fatura") {
        return res.status(400).json({ message: "scope inválido" });
      }
      if (scope === "fatura_sem_os" && !csvCodigo) {
        return res.status(400).json({ message: "csvCodigo obrigatório para scope fatura_sem_os" });
      }
      if (scope === "os_sem_fatura" && !missionCostId) {
        return res.status(400).json({ message: "missionCostId obrigatório para scope os_sem_fatura" });
      }
      const allowed = new Set(["pendente", "justificada", "contestada"]);
      const st = status || "justificada";
      if (!allowed.has(st)) return res.status(400).json({ message: "status inválido" });

      const userId = req.user?.id ? String(req.user.id) : null;
      const userName = req.user?.name || req.user?.username || req.user?.email || null;
      const now = new Date().toISOString();

      // Procura existente
      let existingQuery = supabaseAdmin
        .from("ticketlog_pedagio_audit_notes")
        .select("id")
        .eq("codigo_fatura", codigoFatura);
      if (scope === "fatura_sem_os") {
        existingQuery = existingQuery.eq("csv_codigo", csvCodigo);
      } else {
        existingQuery = existingQuery.eq("mission_cost_id", missionCostId as number);
      }
      const { data: existing, error: findErr } = await existingQuery.maybeSingle();
      if (findErr && findErr.code !== "PGRST116") {
        return res.status(500).json({ message: findErr.message });
      }

      const cleanSnapshot = snapshot && typeof snapshot === "object" ? snapshot : null;

      if (existing?.id) {
        const { data: prev, error: prevErr } = await supabaseAdmin
          .from("ticketlog_pedagio_audit_notes")
          .select("*")
          .eq("id", existing.id)
          .maybeSingle();
        if (prevErr) return res.status(500).json({ message: prevErr.message });

        const updatePayload: Record<string, unknown> = {
          status: st,
          observacao: observacao || "",
          created_by_id: userId,
          created_by_name: userName,
          updated_at: now,
        };
        if (cleanSnapshot) updatePayload.snapshot = cleanSnapshot;

        const { data, error } = await supabaseAdmin
          .from("ticketlog_pedagio_audit_notes")
          .update(updatePayload)
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) return res.status(500).json({ message: error.message });

        const prevStatus = prev?.status ?? null;
        const prevObs = prev?.observacao ?? "";
        const newObs = observacao || "";
        if (prevStatus !== st || prevObs !== newObs) {
          const { error: histErr } = await supabaseAdmin
            .from("ticketlog_pedagio_audit_notes_history")
            .insert({
              note_id: existing.id,
              codigo_fatura: codigoFatura,
              scope,
              csv_codigo: scope === "fatura_sem_os" ? csvCodigo : null,
              mission_cost_id: scope === "os_sem_fatura" ? missionCostId : null,
              service_order_id: serviceOrderId ?? null,
              action: "update",
              previous_status: prevStatus,
              new_status: st,
              previous_observacao: prevObs,
              new_observacao: newObs,
              changed_by_id: userId,
              changed_by_name: userName,
              changed_at: now,
            });
          if (histErr) console.error("[notes history insert]", histErr.message);
        }
        return res.json({ note: data });
      }

      const { data, error } = await supabaseAdmin
        .from("ticketlog_pedagio_audit_notes")
        .insert({
          codigo_fatura: codigoFatura,
          scope,
          csv_codigo: scope === "fatura_sem_os" ? csvCodigo : null,
          mission_cost_id: scope === "os_sem_fatura" ? missionCostId : null,
          service_order_id: serviceOrderId ?? null,
          status: st,
          observacao: observacao || "",
          created_by_id: userId,
          created_by_name: userName,
          created_at: now,
          updated_at: now,
          snapshot: cleanSnapshot,
        })
        .select("*")
        .single();
      if (error) return res.status(500).json({ message: error.message });

      const { error: histErr } = await supabaseAdmin
        .from("ticketlog_pedagio_audit_notes_history")
        .insert({
          note_id: data?.id ?? null,
          codigo_fatura: codigoFatura,
          scope,
          csv_codigo: scope === "fatura_sem_os" ? csvCodigo : null,
          mission_cost_id: scope === "os_sem_fatura" ? missionCostId : null,
          service_order_id: serviceOrderId ?? null,
          action: "create",
          previous_status: null,
          new_status: st,
          previous_observacao: null,
          new_observacao: observacao || "",
          changed_by_id: userId,
          changed_by_name: userName,
          changed_at: now,
        });
      if (histErr) console.error("[notes history insert]", histErr.message);

      res.json({ note: data });
    } catch (err: any) {
      console.error("[auditoria-pedagios-ticketlog/notes POST]", err);
      res.status(500).json({ message: err?.message || String(err) });
    }
  });

  app.get("/api/auditoria-pedagios-ticketlog/notes/:id/history", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "id inválido" });
      const { data, error } = await supabaseAdmin
        .from("ticketlog_pedagio_audit_notes_history")
        .select("*")
        .eq("note_id", id)
        .order("changed_at", { ascending: false });
      if (error) return res.status(500).json({ message: error.message });
      res.json({ history: data || [] });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || String(err) });
    }
  });

  app.delete("/api/auditoria-pedagios-ticketlog/notes/:id", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "id inválido" });
      const { error } = await supabaseAdmin.from("ticketlog_pedagio_audit_notes").delete().eq("id", id);
      if (error) return res.status(500).json({ message: error.message });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || String(err) });
    }
  });

  app.post("/api/auditoria-pedagios-ticketlog", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { csvBase64 } = req.body as { csvBase64?: string };
      if (!csvBase64) return res.status(400).json({ message: "csvBase64 obrigatório" });
      const buf = Buffer.from(csvBase64.replace(/^data:[^;]+;base64,/, ""), "base64");
      // CSV TicketLog vem em UTF-8 (com BOM). Tentar utf-8 direto.
      let content = buf.toString("utf8");
      // Heurística: se aparecer caracteres de mojibake e não 'ç', tenta latin1
      if (!/[áéíóúãõçÁÉÍÓÚÃÕÇ]/.test(content) && /[\xc0-\xff]/.test(buf.toString("binary"))) {
        content = buf.toString("latin1");
      }
      const result = await rodarAuditoriaPedagiosCsv(content);
      res.json(result);
    } catch (err: any) {
      console.error("[auditoria-pedagios-ticketlog]", err);
      res.status(500).json({ message: err?.message || String(err) });
    }
  });

  // Decodifica o CSV (base64) com a mesma heurística do endpoint principal.
  function decodeCsvBase64(csvBase64: string): string {
    const buf = Buffer.from(csvBase64.replace(/^data:[^;]+;base64,/, ""), "base64");
    let content = buf.toString("utf8");
    if (!/[áéíóúãõçÁÉÍÓÚÃÕÇ]/.test(content) && /[\xc0-\xff]/.test(buf.toString("binary"))) {
      content = buf.toString("latin1");
    }
    return content;
  }

  // ==========================================================================
  // GERAR CONTAS A PAGAR (financial_transactions) A PARTIR DA FATURA TICKETLOG
  // ==========================================================================
  // - modo "unico"    -> 1 despesa total da fatura
  // - modo "rateado"  -> 1 despesa por placa, somando todas as linhas dessa placa
  // Idempotência: origin_type="ticketlog_pedagio_fatura",
  //               origin_id = "<codigoFatura>" (unico) | "<codigoFatura>:<PLACA>" (rateado)
  app.post(
    "/api/auditoria-pedagios-ticketlog/gerar-financeiro",
    requireAuth,
    requireAdminRole,
    async (req, res) => {
      try {
        const { csvBase64, modo, due_date, category_name } = req.body as {
          csvBase64?: string;
          modo?: "unico" | "rateado";
          due_date?: string;
          category_name?: string;
        };
        if (!csvBase64) return res.status(400).json({ message: "csvBase64 obrigatório" });
        if (modo !== "unico" && modo !== "rateado") {
          return res.status(400).json({ message: "modo deve ser 'unico' ou 'rateado'" });
        }
        const audit = await rodarAuditoriaPedagiosCsv(decodeCsvBase64(csvBase64));
        const codigoFatura = audit.parsed.header.codigoFatura;
        if (!codigoFatura) {
          return res.status(400).json({ message: "fatura sem 'Código da fatura' — não é possível gerar lançamento idempotente" });
        }
        if (audit.parsed.rows.length === 0) {
          return res.status(400).json({ message: "fatura sem linhas de pedágio" });
        }
        const cliente = audit.matchedClient;
        const entityName = cliente
          ? cliente.razaoSocial || cliente.nomeFantasia || cliente.name
          : audit.parsed.header.cliente || "TicketLog";
        const dueDate = due_date
          || audit.parsed.header.vencimento
          || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        const cat = category_name || "Pedágio";
        const userName = (req as any).user?.name || (req as any).user?.username || "SISTEMA";

        type Payload = {
          origin_id: string;
          description: string;
          amount: number;
          due_date: string;
          notes: string;
        };
        const payloads: Payload[] = [];
        if (modo === "unico") {
          payloads.push({
            origin_id: codigoFatura,
            description: `Fatura TicketLog Pedágios ${codigoFatura} — ${entityName}`,
            amount: audit.parsed.total,
            due_date: dueDate,
            notes: `Fatura TicketLog ${codigoFatura} (${audit.parsed.rows.length} transações de pedágio). Período ${audit.parsed.header.periodoInicio || "?"} a ${audit.parsed.header.periodoFim || "?"}.`,
          });
        } else {
          const porPlaca = new Map<string, { total: number; qtd: number }>();
          for (const r of audit.parsed.rows) {
            const cur = porPlaca.get(r.placa) || { total: 0, qtd: 0 };
            cur.total += r.valor;
            cur.qtd += 1;
            porPlaca.set(r.placa, cur);
          }
          for (const [placa, agg] of Array.from(porPlaca.entries())) {
            payloads.push({
              origin_id: `${codigoFatura}:${placa}`,
              description: `Fatura TicketLog Pedágios ${codigoFatura} — Placa ${placa}`,
              amount: Math.round(agg.total * 100) / 100,
              due_date: dueDate,
              notes: `Fatura TicketLog ${codigoFatura} — placa ${placa} (${agg.qtd} pedágios).`,
            });
          }
        }

        const originType = "ticketlog_pedagio_fatura";
        // Idempotência por código da fatura: bloqueia qualquer criação se já
        // existe lançamento (em qualquer modo) referente a este codigoFatura —
        // origin_id == codigoFatura (modo unico) OU origin_id começa com
        // codigoFatura + ":" (modo rateado). Evita lançar a mesma fatura duas
        // vezes mesmo trocando de modo.
        const { data: anyExistingRaw, error: existErr } = await supabaseAdmin
          .from("financial_transactions")
          .select("id, origin_id, amount")
          .eq("origin_type", originType)
          .or(`origin_id.eq.${codigoFatura},origin_id.like.${codigoFatura}:%`);
        if (existErr) return res.status(500).json({ message: existErr.message });
        const anyExisting = (anyExistingRaw || []) as Array<{ id: number; origin_id: string; amount: number }>;
        if (anyExisting.length > 0) {
          const modoAnterior = anyExisting.some((r) => r.origin_id === codigoFatura) ? "unico" : "rateado";
          const totalAnterior = anyExisting.reduce((s, r) => s + Number(r.amount || 0), 0);
          return res.status(409).json({
            message: `Fatura ${codigoFatura} já foi lançada (modo ${modoAnterior}, ${anyExisting.length} lançamento(s), total ${totalAnterior.toFixed(2)}). Desfaça os lançamentos existentes antes de gerar novamente.`,
            modoAnterior,
            codigoFatura,
            existentes: anyExisting.length,
            total_existente: totalAnterior,
            ids: anyExisting.map((r) => r.id),
          });
        }

        const toInsert = payloads
          .map((p) => ({
            description: p.description,
            amount: p.amount,
            type: "EXPENSE",
            status: "PENDING",
            due_date: p.due_date,
            category_name: cat,
            entity_type: "PROVIDER",
            entity_name: "TicketLog",
            notes: p.notes,
            origin_type: originType,
            origin_id: p.origin_id,
            created_by: userName,
          }));

        let inserted: any[] = [];
        if (toInsert.length > 0) {
          const { data, error } = await supabaseAdmin
            .from("financial_transactions")
            .insert(toInsert)
            .select("id, origin_id, amount");
          if (error) return res.status(500).json({ message: error.message });
          inserted = data || [];
        }

        res.json({
          codigoFatura,
          modo,
          criadas: inserted.length,
          ignoradas: 0,
          total_criado: inserted.reduce((s, r: any) => s + Number(r.amount || 0), 0),
          total_fatura: audit.parsed.total,
          ids: inserted.map((r: any) => r.id),
        });
      } catch (err: any) {
        console.error("[auditoria-pedagios-ticketlog/gerar-financeiro]", err);
        res.status(500).json({ message: err?.message || String(err) });
      }
    },
  );

  // ==========================================================================
  // CRIAR MISSION_COSTS FALTANTES PARA OS CONCILIADAS POR PLACA+DATA
  // ==========================================================================
  // Aplica-se às linhas da fatura que caíram em "faturaSemOS" mas com EXATAMENTE
  // 1 OS candidata (placa+data bateram, só faltou o lançamento de pedágio).
  // Idempotência: descrição embute "[TL:<codigo>]" e checamos antes de criar.
  app.post(
    "/api/auditoria-pedagios-ticketlog/criar-mission-costs",
    requireAuth,
    requireAdminRole,
    async (req, res) => {
      try {
        const { csvBase64, codigosToCreate, manualOsByCodigo } = req.body as {
          csvBase64?: string;
          codigosToCreate?: string[];
          manualOsByCodigo?: Record<string, number>;
        };
        if (!csvBase64) return res.status(400).json({ message: "csvBase64 obrigatório" });
        if (!Array.isArray(codigosToCreate) || codigosToCreate.length === 0) {
          return res.status(400).json({ message: "codigosToCreate (array) obrigatório" });
        }
        const audit = await rodarAuditoriaPedagiosCsv(decodeCsvBase64(csvBase64));
        const codigoFatura = audit.parsed.header.codigoFatura || "sem-codigo";
        const wanted = new Set(codigosToCreate.map(String));
        const manualMap = new Map<string, number>();
        if (manualOsByCodigo && typeof manualOsByCodigo === "object") {
          for (const [k, v] of Object.entries(manualOsByCodigo)) {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) manualMap.set(String(k), n);
          }
        }

        type Plan = {
          codigo: string;
          osId: number;
          vehicleId: number | null;
          employeeId: number | null;
          amount: number;
          estabelecimento: string | null;
          data: string;
        };
        const plans: Plan[] = [];
        const ignorados: Array<{ codigo: string; motivo: string }> = [];
        for (const f of audit.result.faturaSemOS) {
          if (!wanted.has(f.csv.codigo)) continue;
          if (f.osCandidatas.length === 0) {
            ignorados.push({ codigo: f.csv.codigo, motivo: "sem OS candidata pelo cruzamento" });
            continue;
          }
          let os = f.osCandidatas[0];
          if (f.osCandidatas.length > 1) {
            const manualOsId = manualMap.get(f.csv.codigo);
            if (!manualOsId) {
              ignorados.push({
                codigo: f.csv.codigo,
                motivo: `${f.osCandidatas.length} OS candidatas — escolha manual necessária, não criado`,
              });
              continue;
            }
            const chosen = f.osCandidatas.find((c) => c.id === manualOsId);
            if (!chosen) {
              ignorados.push({
                codigo: f.csv.codigo,
                motivo: `OS ${manualOsId} não está entre as candidatas retornadas pelo cruzamento`,
              });
              continue;
            }
            os = chosen;
          }
          plans.push({
            codigo: f.csv.codigo,
            osId: os.id,
            vehicleId: os.vehicleId,
            employeeId: (os as any).assignedEmployeeId ?? null,
            amount: f.csv.valor,
            estabelecimento: f.csv.estabelecimento,
            data: f.csv.data,
          });
        }

        // Pré-busca mission_costs já existentes p/ esses OS com tag [TL:codigo]
        const osIds = Array.from(new Set(plans.map((p) => p.osId)));
        const jaExistem = new Set<string>();
        if (osIds.length > 0) {
          const { data: mcRaw } = await supabaseAdmin
            .from("mission_costs")
            .select("id, service_order_id, description")
            .in("service_order_id", osIds);
          for (const mc of (mcRaw || []) as Array<{ service_order_id: number; description: string | null }>) {
            const desc = mc.description || "";
            const m = desc.match(/\[TL:([^\]]+)\]/);
            if (m) jaExistem.add(`${mc.service_order_id}|${m[1]}`);
          }
        }

        const criados: Array<{ codigo: string; osId: number; missionCostId: number; revenueId: number | null }> = [];
        const erros: Array<{ codigo: string; motivo: string }> = [];

        for (const p of plans) {
          const key = `${p.osId}|${p.codigo}`;
          if (jaExistem.has(key)) {
            ignorados.push({ codigo: p.codigo, motivo: `já existe mission_cost com tag [TL:${p.codigo}] na OS ${p.osId}` });
            continue;
          }
          const descBase = `Pedágio ${p.estabelecimento ? `- ${p.estabelecimento} ` : ""}[TL:${p.codigo}] (fatura ${codigoFatura})`;
          const amountStr = p.amount.toFixed(2);

          const { data: costRecord, error: costErr } = await supabaseAdmin
            .from("mission_costs")
            .insert({
              service_order_id: p.osId,
              vehicle_id: p.vehicleId,
              employee_id: p.employeeId,
              category: "Pedágio",
              description: descBase,
              amount: amountStr,
              cost_type: "expense",
            })
            .select("id")
            .single();
          if (costErr || !costRecord) {
            erros.push({ codigo: p.codigo, motivo: costErr?.message || "falha ao criar custo" });
            continue;
          }
          // Cria também a contrapartida de receita (cobrança ao cliente), como o fluxo do app móvel.
          // Categoria "Pedágio Receita" para que o filtro do cruzamento
          // (que exclui qualquer categoria contendo "receita") não trate
          // essa linha como um custo de pedágio pendente — evitando que
          // o próprio lançamento que acabamos de criar reapareça em
          // `osSemFatura` na re-execução da conferência.
          const { data: revRecord, error: revErr } = await supabaseAdmin
            .from("mission_costs")
            .insert({
              service_order_id: p.osId,
              vehicle_id: p.vehicleId,
              employee_id: p.employeeId,
              category: "Pedágio Receita",
              description: descBase,
              amount: amountStr,
              cost_type: "revenue",
            })
            .select("id")
            .single();
          if (revErr) {
            erros.push({ codigo: p.codigo, motivo: `custo criado mas receita falhou: ${revErr.message}` });
            criados.push({ codigo: p.codigo, osId: p.osId, missionCostId: costRecord.id, revenueId: null });
            continue;
          }
          criados.push({
            codigo: p.codigo,
            osId: p.osId,
            missionCostId: costRecord.id,
            revenueId: revRecord?.id ?? null,
          });
        }

        res.json({
          criados: criados.length,
          ignorados: ignorados.length,
          erros: erros.length,
          detalhes: { criados, ignorados, erros },
        });
      } catch (err: any) {
        console.error("[auditoria-pedagios-ticketlog/criar-mission-costs]", err);
        res.status(500).json({ message: err?.message || String(err) });
      }
    },
  );
}
