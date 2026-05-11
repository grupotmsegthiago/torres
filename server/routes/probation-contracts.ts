import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import { toCamelObj, toCamelArray } from "../storage";
import { generateProbationContractPDF, type ProbationContractData, type ProbationContractTemplate, DEFAULT_PROBATION_TEMPLATE } from "../probation-contract-pdf";

async function loadProbationTemplate(): Promise<ProbationContractTemplate> {
  try {
    const { data } = await supabaseAdmin.from("system_settings").select("value").eq("key", "probation_contract_template").limit(1);
    if (data && data.length && data[0].value) {
      const parsed = JSON.parse(data[0].value);
      return { ...DEFAULT_PROBATION_TEMPLATE, ...parsed };
    }
  } catch (e) { /* fallback default */ }
  return DEFAULT_PROBATION_TEMPLATE;
}

const PROBATION_DAYS = 45;
const VIGILANTE_BASE_SALARY = 2565.31;

function todayBrtIso(): string {
  // YYYY-MM-DD em horário BRT
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(new Date());
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function isVigilante(role: string | null | undefined): boolean {
  if (!role) return false;
  const r = role.toLowerCase();
  return r.includes("vigilante") || r.includes("escolta");
}

/**
 * Cria automaticamente um Contrato de Experiência de 45 dias para o funcionário,
 * se for vigilante e ainda não tiver contrato ativo.
 * Retorna { created, contractId, error }
 */
export async function autoCreateProbationContract(employee: any): Promise<{ created: boolean; contractId?: number; error?: string }> {
  try {
    if (!isVigilante(employee.role)) return { created: false };

    // Já existe contrato para este funcionário?
    const { data: existing } = await supabaseAdmin
      .from("employee_probation_contracts")
      .select("id")
      .eq("employee_id", employee.id)
      .limit(1);
    if (existing && existing.length > 0) return { created: false, contractId: existing[0].id };

    const startIso = employee.hireDate || employee.hire_date || todayBrtIso();
    const start = typeof startIso === "string" ? startIso.split("T")[0] : todayBrtIso();
    const end = addDaysIso(start, PROBATION_DAYS - 1);

    const payload = {
      employee_id: employee.id,
      start_date: start,
      end_date: end,
      duration_days: PROBATION_DAYS,
      funcao: employee.role || "VIGILANTE DE ESCOLTA ARMADA",
      remuneracao: String(VIGILANTE_BASE_SALARY),
      local_trabalho: "O MESMO DA EMPRESA",
      jornada: "A jornada de trabalho será flexível",
      cidade_contrato: "SAO PAULO",
      assinatura_status: "pendente",
    };

    const { data, error } = await supabaseAdmin
      .from("employee_probation_contracts")
      .insert(payload)
      .select()
      .single();

    if (error) return { created: false, error: error.message };
    return { created: true, contractId: data.id };
  } catch (err: any) {
    return { created: false, error: err.message };
  }
}

async function loadContractWithEmployee(id: number) {
  const { data: rows } = await supabaseAdmin
    .from("employee_probation_contracts")
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

export function registerProbationContractRoutes(app: Express) {
  // ===== ADMIN: lista contratos (paginada simples) =====
  app.get("/api/probation-contracts", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("employee_probation_contracts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return res.status(500).json({ message: error.message });

      // Enriquece com nome do funcionário
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

  // ===== ADMIN: lista contratos de um funcionário =====
  app.get("/api/employees/:id/probation-contracts", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const employeeId = Number(req.params.id);
      const { data } = await supabaseAdmin
        .from("employee_probation_contracts")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      res.json(toCamelArray(data || []));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== ADMIN: cria manualmente para um funcionário =====
  app.post("/api/probation-contracts", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const employeeId = Number(req.body.employeeId);
      if (!employeeId) return res.status(400).json({ message: "employeeId obrigatório" });
      const { data: empRows } = await supabaseAdmin.from("employees").select("*").eq("id", employeeId).limit(1);
      if (!empRows || !empRows[0]) return res.status(404).json({ message: "Funcionário não encontrado" });
      const result = await autoCreateProbationContract(toCamelObj(empRows[0]));
      if (result.error) return res.status(500).json({ message: result.error });
      if (!result.created && !result.contractId) return res.status(400).json({ message: "Funcionário não é vigilante" });
      const { data: contract } = await supabaseAdmin
        .from("employee_probation_contracts")
        .select("*")
        .eq("id", result.contractId!)
        .single();
      res.status(201).json(toCamelObj(contract));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== MOBILE: meus contratos =====
  app.get("/api/mobile/my-probation-contracts", requireAuth, async (req: any, res) => {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) return res.json([]);
      const { data } = await supabaseAdmin
        .from("employee_probation_contracts")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      res.json(toCamelArray(data || []));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== Funcionário assina contrato =====
  app.post("/api/probation-contracts/:id/sign", requireAuth, async (req: any, res) => {
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
        .from("employee_probation_contracts")
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
        .from("employee_probation_contracts")
        .update({
          assinatura_status: "assinado",
          assinado_em: new Date().toISOString(),
          assinatura_facial_foto: facialFoto,
          assinatura_desenho: assinaturaDesenho,
          assinatura_termo: termoTexto || "Declaro que li e estou de acordo com todas as cláusulas do presente Contrato de Experiência, reconhecendo a validade jurídica desta assinatura eletrônica nos termos da MP 2.200-2/2001.",
          assinatura_ip: ip,
          assinatura_user_agent: ua,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) return res.status(500).json({ message: error.message });

      res.json(toCamelObj(updated));
    } catch (err: any) {
      console.error("[sign-probation]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ===== PDF do contrato (admin ou o próprio funcionário) =====
  app.get("/api/probation-contracts/:id/pdf", requireAuth, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const result = await loadContractWithEmployee(id);
      if (!result) return res.status(404).json({ message: "Contrato não encontrado" });
      const { contract, employee } = result;
      if (!employee) return res.status(404).json({ message: "Funcionário não encontrado" });

      const isAdmin = req.user.role === "admin" || req.user.role === "diretoria";
      const isOwner = req.user.employeeId && req.user.employeeId === contract.employee_id;
      if (!isAdmin && !isOwner) return res.status(403).json({ message: "Acesso negado" });

      const data: ProbationContractData = {
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
        endDate: typeof contract.end_date === "string" ? contract.end_date.split("T")[0] : contract.end_date,
        durationDays: contract.duration_days || PROBATION_DAYS,
        cidadeContrato: contract.cidade_contrato || "SAO PAULO",
        localTrabalho: contract.local_trabalho,
        jornada: contract.jornada,
        signatureFacial: contract.assinatura_facial_foto,
        signatureDrawing: contract.assinatura_desenho,
        signedAt: contract.assinado_em,
        signatureIp: contract.assinatura_ip,
      };
      const template = await loadProbationTemplate();
      generateProbationContractPDF(res, data, template);
    } catch (err: any) {
      console.error("[probation-pdf]", err);
      if (!res.headersSent) res.status(500).json({ message: err.message });
    }
  });

  // ===== Modelo do contrato (editável pela diretoria/admin) =====
  app.get("/api/probation-contracts-template", requireAuth, async (_req, res) => {
    try {
      const template = await loadProbationTemplate();
      res.json({ template, default: DEFAULT_PROBATION_TEMPLATE });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/probation-contracts-template", requireAdminRole, async (req: any, res) => {
    try {
      const incoming = req.body?.template;
      if (!incoming || typeof incoming !== "object") {
        return res.status(400).json({ message: "Template inválido" });
      }
      const merged: ProbationContractTemplate = { ...DEFAULT_PROBATION_TEMPLATE, ...incoming };
      const value = JSON.stringify(merged);
      const { data: existing } = await supabaseAdmin.from("system_settings").select("id").eq("key", "probation_contract_template").limit(1);
      if (!existing?.length) {
        await supabaseAdmin.from("system_settings").insert({ key: "probation_contract_template", value });
      } else {
        await supabaseAdmin.from("system_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", "probation_contract_template");
      }
      res.json({ template: merged });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== Verifica se usuário tem contrato pendente bloqueando acesso =====
  app.get("/api/mobile/contract-gate", requireAuth, async (req: any, res) => {
    try {
      const employeeId = req.user?.employeeId;
      if (!employeeId) return res.json({ blocked: false, pendingContracts: [] });
      const { data } = await supabaseAdmin
        .from("employee_probation_contracts")
        .select("id, start_date, end_date, funcao, assinatura_status, bypass_diretoria")
        .eq("employee_id", employeeId)
        .neq("assinatura_status", "assinado")
        .neq("bypass_diretoria", true);
      const pending = data || [];
      res.json({ blocked: pending.length > 0, pendingContracts: toCamelArray(pending) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== DIRETORIA: libera funcionário sem assinatura =====
  app.post("/api/probation-contracts/:id/bypass", requireAuth, async (req: any, res) => {
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
        .from("employee_probation_contracts")
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
        .from("employee_probation_contracts")
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

  // ===== DIRETORIA: revoga liberação =====
  app.post("/api/probation-contracts/:id/bypass-revoke", requireAuth, async (req: any, res) => {
    try {
      if (req.user.role !== "diretoria") {
        return res.status(403).json({ message: "Apenas a Diretoria pode revogar a liberação" });
      }
      const id = Number(req.params.id);
      const { data: updated, error } = await supabaseAdmin
        .from("employee_probation_contracts")
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

  // ===== ADMIN: evidências =====
  app.get("/api/probation-contracts/:id/signature", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { data: rows } = await supabaseAdmin
        .from("employee_probation_contracts")
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
