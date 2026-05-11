import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import { storage } from "../storage";
import { z } from "zod";

/**
 * Onboarding em 3 etapas: Documentação → Contratos → Treinamento.
 * Um funcionário só pode ser escalado em OS quando todas estiverem OK.
 */

// Documentos obrigatórios por papel (case-insensitive). "*" aplica a todos.
const REQUIRED_DOCS: Record<string, string[]> = {
  vigilante: [
    "RG", "CPF", "CTPS", "PIS/PASEP/NIS", "Comprovante de Residência",
    "Fotos 3x4", "Antecedente Criminal Polícia Civil",
    "ASO", "Certificado Formação Vigilante",
  ],
  escolta: [
    "RG", "CPF", "CTPS", "Comprovante de Residência", "Fotos 3x4",
    "CNH", "CNV", "ASO", "Certificado Formação Escolta Armada",
  ],
  motorista: [
    "RG", "CPF", "CTPS", "Comprovante de Residência",
    "CNH", "ASO",
  ],
  "*": ["RG", "CPF"],
};

// Treinamentos obrigatórios (e validade em meses para "vencido?").
const REQUIRED_TRAININGS: Record<string, { type: string; validityMonths?: number }[]> = {
  vigilante: [
    { type: "Formação de Vigilante", validityMonths: 24 },
    { type: "Reciclagem", validityMonths: 24 },
  ],
  escolta: [
    { type: "Formação de Vigilante", validityMonths: 24 },
    { type: "Especialização Escolta Armada", validityMonths: 24 },
    { type: "Reciclagem", validityMonths: 24 },
  ],
  motorista: [],
  "*": [],
};

function rolesForEmployee(role?: string | null): string[] {
  const r = (role || "").toLowerCase();
  const out: string[] = ["*"];
  if (/vigilan/.test(r)) out.push("vigilante");
  if (/escolt/.test(r)) out.push("escolta");
  if (/motoris|condutor/.test(r)) out.push("motorista");
  return out;
}

function todayBRT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export interface OnboardingStage {
  key: "documentacao" | "contratos" | "treinamento";
  label: string;
  status: "ok" | "pendente" | "vencido";
  pendencias: string[];
  itens: { label: string; status: "ok" | "pendente" | "vencido"; detail?: string }[];
}

export interface OnboardingResult {
  employeeId: number;
  employeeName: string;
  role: string | null;
  status: "ok" | "pendente";
  apto: boolean;
  stages: OnboardingStage[];
  pendencias: string[]; // lista plana p/ exibir em mensagens
  computedAt: string;
}

/**
 * Calcula o status de onboarding para um funcionário.
 * Não depende de cache — consulta sempre os dados frescos.
 */
export async function computeOnboarding(employeeId: number): Promise<OnboardingResult> {
  const emp = await storage.getEmployee(employeeId);
  if (!emp) throw new Error(`Funcionário ${employeeId} não encontrado`);

  const today = todayBRT();
  const roles = rolesForEmployee(emp.role);

  // Resolve listas únicas
  const reqDocs = Array.from(new Set(roles.flatMap(r => REQUIRED_DOCS[r] || [])));
  const reqTrainings = Array.from(
    new Map(
      roles.flatMap(r => REQUIRED_TRAININGS[r] || []).map(t => [t.type, t])
    ).values()
  );

  // ===== Etapa 1: Documentação =====
  const docs = await storage.getEmployeeDocuments(employeeId);
  const itensDoc: OnboardingStage["itens"] = [];
  for (const tipo of reqDocs) {
    const has = docs.find((d: any) => (d.type || "").toLowerCase() === tipo.toLowerCase());
    if (!has) {
      itensDoc.push({ label: tipo, status: "pendente", detail: "Documento não cadastrado" });
    } else if (has.expiryDate && String(has.expiryDate).slice(0, 10) < today) {
      itensDoc.push({ label: tipo, status: "vencido", detail: `Venceu em ${String(has.expiryDate).slice(0, 10)}` });
    } else {
      itensDoc.push({ label: tipo, status: "ok" });
    }
  }
  const docPend = itensDoc.filter(i => i.status !== "ok").map(i => `${i.label}${i.detail ? " — " + i.detail : ""}`);
  const docStatus: OnboardingStage["status"] =
    itensDoc.some(i => i.status === "vencido") ? "vencido" :
    itensDoc.some(i => i.status === "pendente") ? "pendente" : "ok";

  // ===== Etapa 2: Contratos =====
  const itensCon: OnboardingStage["itens"] = [];
  if (/vigilan|escolt/.test((emp.role || "").toLowerCase())) {
    // Probation
    const { data: probRows } = await supabaseAdmin
      .from("employee_probation_contracts")
      .select("id, assinatura_status, bypass_diretoria, end_date, start_date, created_at")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(5);
    const prob = (probRows || [])[0];
    if (!prob) {
      itensCon.push({ label: "Contrato de Experiência (45d)", status: "pendente", detail: "Não emitido" });
    } else if (prob.assinatura_status === "assinado" || prob.bypass_diretoria) {
      itensCon.push({ label: "Contrato de Experiência (45d)", status: "ok", detail: prob.bypass_diretoria ? "Liberado pela Diretoria" : "Assinado" });
    } else {
      itensCon.push({ label: "Contrato de Experiência (45d)", status: "pendente", detail: "Aguardando assinatura" });
    }
    // Permanent — só obrigatório se a experiência já venceu
    const probEnd = prob?.end_date ? String(prob.end_date).slice(0, 10) : null;
    const expExpirou = probEnd && probEnd < today;
    if (expExpirou) {
      const { data: permRows } = await supabaseAdmin
        .from("employee_permanent_contracts")
        .select("id, assinatura_status, bypass_diretoria")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(1);
      const perm = (permRows || [])[0];
      if (!perm) {
        itensCon.push({ label: "Contrato Definitivo (CLT)", status: "pendente", detail: "Não emitido" });
      } else if (perm.assinatura_status === "assinado" || perm.bypass_diretoria) {
        itensCon.push({ label: "Contrato Definitivo (CLT)", status: "ok", detail: perm.bypass_diretoria ? "Liberado pela Diretoria" : "Assinado" });
      } else {
        itensCon.push({ label: "Contrato Definitivo (CLT)", status: "pendente", detail: "Aguardando assinatura" });
      }
    }
  } else {
    itensCon.push({ label: "Contratos", status: "ok", detail: "Não aplicável a esta função" });
  }
  const conPend = itensCon.filter(i => i.status !== "ok").map(i => `${i.label}${i.detail ? " — " + i.detail : ""}`);
  const conStatus: OnboardingStage["status"] =
    itensCon.some(i => i.status === "vencido") ? "vencido" :
    itensCon.some(i => i.status === "pendente") ? "pendente" : "ok";

  // ===== Etapa 3: Treinamento =====
  const itensTr: OnboardingStage["itens"] = [];
  if (reqTrainings.length === 0) {
    itensTr.push({ label: "Treinamentos", status: "ok", detail: "Não aplicável a esta função" });
  } else {
    const { data: trRows } = await supabaseAdmin
      .from("employee_trainings")
      .select("id, type, completed_at, expiry_date")
      .eq("employee_id", employeeId)
      .order("completed_at", { ascending: false });
    const all = trRows || [];
    for (const req of reqTrainings) {
      const matches = all.filter((t: any) => (t.type || "").toLowerCase().includes(req.type.toLowerCase()) || req.type.toLowerCase().includes((t.type || "").toLowerCase()));
      if (matches.length === 0) {
        itensTr.push({ label: req.type, status: "pendente", detail: "Não realizado" });
        continue;
      }
      // Pega o mais recente — se tiver expiry_date, valida; senão calcula via validityMonths
      const last = matches[0];
      const completed = String(last.completed_at).slice(0, 10);
      let expiry = last.expiry_date ? String(last.expiry_date).slice(0, 10) : null;
      if (!expiry && req.validityMonths) {
        const dt = new Date(completed + "T00:00:00");
        dt.setMonth(dt.getMonth() + req.validityMonths);
        expiry = dt.toISOString().slice(0, 10);
      }
      if (expiry && expiry < today) {
        itensTr.push({ label: req.type, status: "vencido", detail: `Vencido em ${expiry} — necessária reciclagem` });
      } else {
        itensTr.push({ label: req.type, status: "ok", detail: expiry ? `Válido até ${expiry}` : `Realizado em ${completed}` });
      }
    }
  }
  const trPend = itensTr.filter(i => i.status !== "ok").map(i => `${i.label}${i.detail ? " — " + i.detail : ""}`);
  const trStatus: OnboardingStage["status"] =
    itensTr.some(i => i.status === "vencido") ? "vencido" :
    itensTr.some(i => i.status === "pendente") ? "pendente" : "ok";

  const stages: OnboardingStage[] = [
    { key: "documentacao", label: "Documentação", status: docStatus, pendencias: docPend, itens: itensDoc },
    { key: "contratos", label: "Contratos", status: conStatus, pendencias: conPend, itens: itensCon },
    { key: "treinamento", label: "Treinamento", status: trStatus, pendencias: trPend, itens: itensTr },
  ];
  const apto = stages.every(s => s.status === "ok");

  return {
    employeeId,
    employeeName: emp.name,
    role: emp.role || null,
    status: apto ? "ok" : "pendente",
    apto,
    stages,
    pendencias: stages.flatMap(s => s.pendencias.map(p => `[${s.label}] ${p}`)),
    computedAt: new Date().toISOString(),
  };
}

/**
 * Lança erro com mensagem amigável caso onboarding esteja incompleto.
 * Usado pelos endpoints de criação de OS e aceite de missão.
 */
export async function assertOnboardingComplete(employeeId: number): Promise<void> {
  const r = await computeOnboarding(employeeId);
  if (!r.apto) {
    const top = r.pendencias.slice(0, 6).join(" • ");
    const err: any = new Error(`Onboarding incompleto de ${r.employeeName}: ${top}`);
    err.code = "ONBOARDING_INCOMPLETE";
    err.detail = r;
    throw err;
  }
}

const trainingSchema = z.object({
  type: z.string().min(1),
  completedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  certificateUrl: z.string().optional().nullable(),
  instructor: z.string().optional().nullable(),
  cargaHoraria: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export function registerOnboardingRoutes(app: Express) {
  // Status de onboarding de um funcionário
  app.get("/api/employees/:id/onboarding", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const r = await computeOnboarding(id);
      res.json(r);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Treinamentos — listar
  app.get("/api/employees/:id/trainings", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const { data } = await supabaseAdmin
      .from("employee_trainings")
      .select("*")
      .eq("employee_id", id)
      .order("completed_at", { ascending: false });
    res.json((data || []).map((t: any) => ({
      id: t.id, employeeId: t.employee_id, type: t.type,
      completedAt: t.completed_at, expiryDate: t.expiry_date,
      certificateUrl: t.certificate_url, instructor: t.instructor,
      cargaHoraria: t.carga_horaria, notes: t.notes, createdAt: t.created_at,
    })));
  });

  // Treinamentos — criar
  app.post("/api/employees/:id/trainings", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const parsed = trainingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const { data, error } = await supabaseAdmin.from("employee_trainings").insert({
      employee_id: id,
      type: parsed.data.type,
      completed_at: parsed.data.completedAt,
      expiry_date: parsed.data.expiryDate || null,
      certificate_url: parsed.data.certificateUrl || null,
      instructor: parsed.data.instructor || null,
      carga_horaria: parsed.data.cargaHoraria || null,
      notes: parsed.data.notes || null,
    }).select().single();
    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // Treinamentos — remover
  app.delete("/api/trainings/:id", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const { error } = await supabaseAdmin.from("employee_trainings").delete().eq("id", id);
    if (error) return res.status(500).json({ message: error.message });
    res.json({ ok: true });
  });
}
