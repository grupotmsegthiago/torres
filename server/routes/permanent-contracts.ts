import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import { toCamelObj, toCamelArray } from "../storage";
import {
  generatePermanentContractPDF,
  type PermanentContractData,
  type PermanentContractTemplate,
  DEFAULT_PERMANENT_TEMPLATE,
} from "../permanent-contract-pdf";

async function loadPermanentTemplate(): Promise<PermanentContractTemplate> {
  try {
    const { data } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "permanent_contract_template")
      .limit(1);
    if (data && data.length && data[0].value) {
      const parsed = JSON.parse(data[0].value);
      return { ...DEFAULT_PERMANENT_TEMPLATE, ...parsed };
    }
  } catch (_e) { /* fallback default */ }
  return DEFAULT_PERMANENT_TEMPLATE;
}

function todayBrtIso(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(new Date());
}

function isoLessOrEqual(a: string, b: string): boolean {
  // YYYY-MM-DD comparison
  return a <= b;
}

/**
 * Cria automaticamente o Contrato Definitivo (CLT prazo indeterminado) quando o
 * Contrato de Experiência foi assinado E sua data de término já passou.
 * Idempotente — se já existir um contrato definitivo para o mesmo probation, retorna o existente.
 */
export async function autoCreatePermanentContractFromProbation(probation: any): Promise<{ created: boolean; contractId?: number; error?: string }> {
  try {
    if (!probation?.id) return { created: false };
    if (probation.assinatura_status !== "assinado") return { created: false };

    const today = todayBrtIso();
    const probationEnd = typeof probation.end_date === "string"
      ? probation.end_date.split("T")[0]
      : probation.end_date;
    if (!probationEnd) return { created: false };
    // Só gera se a experiência já venceu
    if (!isoLessOrEqual(probationEnd, today)) return { created: false };

    const { data: existing } = await supabaseAdmin
      .from("employee_permanent_contracts")
      .select("id")
      .eq("probation_contract_id", probation.id)
      .limit(1);
    if (existing && existing.length > 0) {
      return { created: false, contractId: existing[0].id };
    }

    // Início do contrato definitivo = dia seguinte ao fim do probatório
    const [y, m, d] = probationEnd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 1);
    const startIso = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${String(dt.getUTCDate()).padStart(2,"0")}`;

    const payload: any = {
      employee_id: probation.employee_id,
      probation_contract_id: probation.id,
      start_date: startIso,
      funcao: probation.funcao,
      remuneracao: String(probation.remuneracao),
      local_trabalho: probation.local_trabalho || "O MESMO DA EMPRESA",
      jornada: probation.jornada || "A jornada de trabalho será flexível",
      cidade_contrato: probation.cidade_contrato || "SAO PAULO",
      assinatura_status: "pendente",
    };

    const { data, error } = await supabaseAdmin
      .from("employee_permanent_contracts")
      .insert(payload)
      .select()
      .single();

    if (error) return { created: false, error: error.message };
    return { created: true, contractId: data.id };
  } catch (err: any) {
    return { created: false, error: err.message };
  }
}

/**
 * Roda diariamente: para todo probation assinado e vencido, garante que exista
 * o Contrato Definitivo correspondente.
 */
export async function syncDuePermanentContracts(): Promise<{ scanned: number; created: number; errors: number }> {
  const today = todayBrtIso();
  const { data: probations } = await supabaseAdmin
    .from("employee_probation_contracts")
    .select("id, employee_id, end_date, funcao, remuneracao, local_trabalho, jornada, cidade_contrato, assinatura_status")
    .eq("assinatura_status", "assinado")
    .lte("end_date", today);

  let created = 0; let errors = 0;
  const list = probations || [];
  for (const p of list) {
    const r = await autoCreatePermanentContractFromProbation(p);
    if (r.created) created++;
    if (r.error) errors++;
  }
  return { scanned: list.length, created, errors };
}

async function loadContractWithEmployee(id: number) {
  const { data: rows } = await supabaseAdmin
    .from("employee_permanent_contracts")
    .select("*")
    .eq("id", id)
    .limit(1);
  if (!rows || rows.length === 0) return null;
  const c = rows[0];
  const { data: empRows } = await supabaseAdmin
    .from("employees")
    .select("id,name,role,cpf,address,hire_date,pis,rg")
    .eq("id", c.employee_id)
    .limit(1);
  const emp = empRows && empRows[0] ? empRows[0] : null;
  return { contract: c, employee: emp };
}

export function registerPermanentContractRoutes(app: Express) {
  // ===== ADMIN: lista geral =====
  app.get("/api/permanent-contracts", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("employee_permanent_contracts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return res.status(500).json({ message: error.message });

      const empIds = Array.from(new Set((data || []).map((c: any) => c.employee_id)));
      let empMap: Record<number, any> = {};
      if (empIds.length > 0) {
        const { data: emps } = await supabaseAdmin
          .from("employees")
          .select("id,name,role,matricula")
          .in("id", empIds);
        empMap = Object.fromEntries((emps || []).map((e: any) => [e.id, e]));
      }
      const list = (data || []).map((c: any) => ({
        ...toCamelObj(c),
        employee: empMap[c.employee_id] ? toCamelObj(empMap[c.employee_id]) : null,
      }));
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== ADMIN: lista por funcionário =====
  app.get("/api/employees/:id/permanent-contracts", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const employeeId = Number(req.params.id);
      const { data } = await supabaseAdmin
        .from("employee_permanent_contracts")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      res.json(toCamelArray(data || []));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== ADMIN: dispara verificação manual (gera todos pendentes hoje) =====
  app.post("/api/permanent-contracts/sync-due", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const r = await syncDuePermanentContracts();
      res.json(r);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== MOBILE: meus contratos definitivos =====
  app.get("/api/mobile/my-permanent-contracts", requireAuth, async (req: any, res) => {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) return res.json([]);
      const { data } = await supabaseAdmin
        .from("employee_permanent_contracts")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      res.json(toCamelArray(data || []));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== Funcionário assina =====
  app.post("/api/permanent-contracts/:id/sign", requireAuth, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const { facialFoto, assinaturaDesenho, termoAceito, termoTexto } = req.body || {};

      if (!facialFoto || !/^data:image\//i.test(facialFoto)) {
        return res.status(400).json({ message: "Foto facial obrigatória" });
      }
      if (!assinaturaDesenho || !/^data:image\//i.test(assinaturaDesenho)) {
        return res.status(400).json({ message: "Assinatura digital obrigatória" });
      }
      if (!termoAceito) {
        return res.status(400).json({ message: "É necessário aceitar o termo de ciência" });
      }

      const { data: rows } = await supabaseAdmin
        .from("employee_permanent_contracts")
        .select("*")
        .eq("id", id)
        .limit(1);
      if (!rows?.length) return res.status(404).json({ message: "Contrato não encontrado" });
      const contract = rows[0];
      if (!req.user.employeeId || contract.employee_id !== req.user.employeeId) {
        return res.status(403).json({ message: "Contrato não pertence a este funcionário" });
      }
      if (contract.assinatura_status === "assinado") {
        return res.status(400).json({ message: "Contrato já assinado" });
      }

      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
      const ua = (req.headers["user-agent"] as string) || "";

      const { data: updated, error } = await supabaseAdmin
        .from("employee_permanent_contracts")
        .update({
          assinatura_status: "assinado",
          assinado_em: new Date().toISOString(),
          assinatura_facial_foto: facialFoto,
          assinatura_desenho: assinaturaDesenho,
          assinatura_termo: termoTexto || "Declaro que li e estou de acordo com todas as cláusulas do presente Contrato Individual de Trabalho por Prazo Indeterminado, reconhecendo a validade jurídica desta assinatura eletrônica nos termos da MP 2.200-2/2001 e Lei 14.063/2020.",
          assinatura_ip: ip,
          assinatura_user_agent: ua,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) return res.status(500).json({ message: error.message });

      res.json(toCamelObj(updated));
    } catch (err: any) {
      console.error("[sign-permanent]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ===== PDF =====
  app.get("/api/permanent-contracts/:id/pdf", requireAuth, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const result = await loadContractWithEmployee(id);
      if (!result) return res.status(404).json({ message: "Contrato não encontrado" });
      const { contract, employee } = result;
      if (!employee) return res.status(404).json({ message: "Funcionário não encontrado" });

      const isAdmin = req.user.role === "admin" || req.user.role === "diretoria";
      const isOwner = req.user.employeeId && req.user.employeeId === contract.employee_id;
      if (!isAdmin && !isOwner) return res.status(403).json({ message: "Acesso negado" });

      const data: PermanentContractData = {
        employeeName: employee.name || "",
        employeeAddress: employee.address || "ENDEREÇO NÃO INFORMADO",
        employeeNeighborhood: "—",
        employeeCity: "—",
        employeeState: "SP",
        ctpsNumber: "—",
        ctpsSerie: "—",
        funcao: contract.funcao,
        remuneracao: Number(contract.remuneracao),
        startDate: typeof contract.start_date === "string" ? contract.start_date.split("T")[0] : contract.start_date,
        cidadeContrato: contract.cidade_contrato || "SAO PAULO",
        localTrabalho: contract.local_trabalho,
        jornada: contract.jornada,
        signatureFacial: contract.assinatura_facial_foto,
        signatureDrawing: contract.assinatura_desenho,
        signedAt: contract.assinado_em,
        signatureIp: contract.assinatura_ip,
      };
      const template = await loadPermanentTemplate();
      generatePermanentContractPDF(res, data, template);
    } catch (err: any) {
      console.error("[permanent-pdf]", err);
      if (!res.headersSent) res.status(500).json({ message: err.message });
    }
  });

  // ===== Modelo do contrato (editável) =====
  app.get("/api/permanent-contracts-template", requireAuth, async (_req, res) => {
    try {
      const template = await loadPermanentTemplate();
      res.json({ template, default: DEFAULT_PERMANENT_TEMPLATE });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/permanent-contracts-template", requireAdminRole, async (req: any, res) => {
    try {
      const incoming = req.body?.template;
      if (!incoming || typeof incoming !== "object") {
        return res.status(400).json({ message: "Template inválido" });
      }
      const merged: PermanentContractTemplate = { ...DEFAULT_PERMANENT_TEMPLATE, ...incoming };
      const value = JSON.stringify(merged);
      const { data: existing } = await supabaseAdmin
        .from("system_settings")
        .select("id")
        .eq("key", "permanent_contract_template")
        .limit(1);
      if (!existing?.length) {
        await supabaseAdmin.from("system_settings").insert({ key: "permanent_contract_template", value });
      } else {
        await supabaseAdmin
          .from("system_settings")
          .update({ value, updated_at: new Date().toISOString() })
          .eq("key", "permanent_contract_template");
      }
      res.json({ template: merged });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== DIRETORIA: bypass / revoga bypass =====
  app.post("/api/permanent-contracts/:id/bypass", requireAuth, async (req: any, res) => {
    try {
      if (req.user.role !== "diretoria") {
        return res.status(403).json({ message: "Apenas a Diretoria pode liberar contrato sem assinatura" });
      }
      const id = Number(req.params.id);
      const reason = String(req.body?.reason || "").trim();
      if (!reason || reason.length < 5) {
        return res.status(400).json({ message: "Motivo da liberação obrigatório (mínimo 5 caracteres)" });
      }
      const { data: rows } = await supabaseAdmin
        .from("employee_permanent_contracts")
        .select("id, assinatura_status, bypass_diretoria")
        .eq("id", id)
        .limit(1);
      if (!rows?.length) return res.status(404).json({ message: "Contrato não encontrado" });
      if (rows[0].assinatura_status === "assinado") {
        return res.status(400).json({ message: "Contrato já foi assinado — bypass desnecessário" });
      }
      if (rows[0].bypass_diretoria) {
        return res.status(400).json({ message: "Contrato já estava liberado" });
      }
      const { data: updated, error } = await supabaseAdmin
        .from("employee_permanent_contracts")
        .update({
          bypass_diretoria: true,
          bypass_by: req.user.id,
          bypass_by_name: req.user.name || req.user.username || "Diretoria",
          bypass_at: new Date().toISOString(),
          bypass_reason: reason,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(toCamelObj(updated));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/permanent-contracts/:id/bypass-revoke", requireAuth, async (req: any, res) => {
    try {
      if (req.user.role !== "diretoria") {
        return res.status(403).json({ message: "Apenas a Diretoria pode revogar a liberação" });
      }
      const id = Number(req.params.id);
      const { data: updated, error } = await supabaseAdmin
        .from("employee_permanent_contracts")
        .update({
          bypass_diretoria: false,
          bypass_by: null,
          bypass_by_name: null,
          bypass_at: null,
          bypass_reason: null,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(toCamelObj(updated));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== ADMIN: evidências de assinatura =====
  app.get("/api/permanent-contracts/:id/signature", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { data: rows } = await supabaseAdmin
        .from("employee_permanent_contracts")
        .select("id, employee_id, assinatura_status, assinado_em, assinatura_facial_foto, assinatura_desenho, assinatura_termo, assinatura_ip, assinatura_user_agent")
        .eq("id", id)
        .limit(1);
      if (!rows?.length) return res.status(404).json({ message: "Contrato não encontrado" });
      res.json(toCamelObj(rows[0]));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
