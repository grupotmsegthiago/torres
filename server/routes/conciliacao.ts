import type { Express } from "express";
import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
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

export function registerConciliacaoRoutes(app: Express) {
  app.post("/api/conciliacao-ticketlog", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { pdfBase64, dateFrom } = req.body as { pdfBase64?: string; dateFrom?: string };
      if (!pdfBase64) return res.status(400).json({ message: "pdfBase64 obrigatório" });

      const buf = Buffer.from(pdfBase64.replace(/^data:application\/pdf;base64,/, ""), "base64");
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

      const tlAll = parseTicketLogText(txt);
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
}
