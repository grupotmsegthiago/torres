import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import { storage } from "../storage";
import { z } from "zod";

/**
 * Onboarding em 4 etapas: Documentação → Contratos → Treinamento → Holerites.
 * Etapas bloqueantes p/ entrar em OS: Documentação, Contratos e Treinamento.
 * Holerites é informativa (alerta de pendência sem impedir escala).
 */

// Cutoff de "contratos legados". Contratos criados ANTES desta data são
// considerados OK por autorização da Diretoria (regra de transição).
// A partir desta data, todo contrato novo precisa ser efetivamente assinado
// (ou liberado por bypass_diretoria).
const LEGACY_CONTRACT_CUTOFF = "2026-05-11";

// Documentos obrigatórios para abertura de OS.
// Lista alinhada com o checklist visual em client/src/pages/admin/employees.tsx (REQUIRED_DOCS).
// "*" aplica a todos os funcionários; chaves específicas adicionam itens por papel.
const COMMON_DOCS = [
  "RG", "CPF", "CTPS", "PIS/PASEP/NIS", "Comprovante de Residência",
  "Fotos 3x4", "Título de Eleitor", "Certificado de Reservista",
  "Dados Bancários", "ASO",
  "Antecedente Criminal Polícia Civil",
  "Antecedente Criminal Polícia Militar",
  "Certidão de COP",
];
const REQUIRED_DOCS: Record<string, string[]> = {
  vigilante: [
    ...COMMON_DOCS,
    "Certificado Formação Vigilante",
  ],
  escolta: [
    ...COMMON_DOCS,
    "CNH", "CNV", "Certidão de Pontuação CNH",
    "Certificado Formação Vigilante",
    "Certificado Formação Escolta Armada",
    "Reciclagem Escolta Armada",
  ],
  motorista: [
    ...COMMON_DOCS,
    "CNH", "Certidão de Pontuação CNH",
  ],
  "*": ["RG", "CPF"],
};

// Dias de carência para ASO após data de admissão (cadastro).
// Durante esse período o funcionário pode ser escalado mesmo sem ASO,
// mas o sistema sinaliza alerta e exige upload antes do prazo.
const ASO_GRACE_DAYS = 15;

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

function ymBRT(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
}

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(ymBRT(d));
  }
  return out;
}

export type OnboardingStageKey = "documentacao" | "contratos" | "treinamento" | "holerites";

export interface OnboardingStage {
  key: OnboardingStageKey;
  label: string;
  status: "ok" | "pendente" | "vencido";
  blocking: boolean;
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
  pendencias: string[];
  computedAt: string;
}

export async function computeOnboarding(employeeId: number): Promise<OnboardingResult> {
  const emp = await storage.getEmployee(employeeId);
  if (!emp) throw new Error(`Funcionário ${employeeId} não encontrado`);

  const today = todayBRT();
  const roles = rolesForEmployee(emp.role);

  const reqDocs = Array.from(new Set(roles.flatMap(r => REQUIRED_DOCS[r] || [])));
  const reqTrainings = Array.from(
    new Map(
      roles.flatMap(r => REQUIRED_TRAININGS[r] || []).map(t => [t.type, t])
    ).values()
  );

  // ===== Etapa 1: Documentação (inclui dependentes informados) =====
  const docs = await storage.getEmployeeDocuments(employeeId);
  const itensDoc: OnboardingStage["itens"] = [];
  // Carência ASO: 15 dias contados a partir de hireDate
  const hireDateStr = emp.hireDate ? String(emp.hireDate).slice(0, 10) : null;
  let asoGraceUntil: string | null = null;
  if (hireDateStr) {
    const dt = new Date(hireDateStr + "T00:00:00");
    dt.setDate(dt.getDate() + ASO_GRACE_DAYS);
    asoGraceUntil = dt.toISOString().slice(0, 10);
  }
  for (const tipo of reqDocs) {
    const has = docs.find((d: any) => (d.type || "").toLowerCase() === tipo.toLowerCase());
    const isASO = tipo === "ASO";
    if (!has) {
      if (isASO && asoGraceUntil && asoGraceUntil >= today) {
        itensDoc.push({ label: tipo, status: "ok", detail: `Em carência — entregar até ${asoGraceUntil} (alerta enviado ao ADM)` });
      } else if (isASO && asoGraceUntil) {
        itensDoc.push({ label: tipo, status: "pendente", detail: `Prazo de carência expirou em ${asoGraceUntil} — bloqueado para OS` });
      } else {
        itensDoc.push({ label: tipo, status: "pendente", detail: "Documento não cadastrado" });
      }
    } else if (has.expiryDate && String(has.expiryDate).slice(0, 10) < today) {
      itensDoc.push({ label: tipo, status: "vencido", detail: `Venceu em ${String(has.expiryDate).slice(0, 10)}` });
    } else {
      itensDoc.push({ label: tipo, status: "ok", detail: has.expiryDate ? `Válido até ${String(has.expiryDate).slice(0, 10)}` : undefined });
    }
  }
  // Dependentes obrigatórios: precisa ter pelo menos 1 cadastrado
  // OU declaração explícita "sem dependentes" (employees.dependentes_declarados=true).
  const { data: depRows } = await supabaseAdmin
    .from("employee_dependents")
    .select("id")
    .eq("employee_id", employeeId);
  const declaradoSem = (emp as any).dependentesDeclarados === true || (emp as any).dependentes_declarados === true;
  if ((depRows || []).length > 0) {
    itensDoc.push({ label: "Dependentes", status: "ok", detail: `${depRows!.length} cadastrado(s)` });
  } else if (declaradoSem) {
    itensDoc.push({ label: "Dependentes", status: "ok", detail: "Sem dependentes (declarado)" });
  } else {
    itensDoc.push({ label: "Dependentes", status: "pendente", detail: "Informe os dependentes ou declare 'sem dependentes' na aba Dependentes" });
  }
  const docPend = itensDoc.filter(i => i.status !== "ok").map(i => `${i.label}${i.detail ? " — " + i.detail : ""}`);
  const docStatus: OnboardingStage["status"] =
    itensDoc.some(i => i.status === "vencido") ? "vencido" :
    itensDoc.some(i => i.status === "pendente") ? "pendente" : "ok";

  // ===== Etapa 2: Contratos =====
  const itensCon: OnboardingStage["itens"] = [];
  if (/vigilan|escolt/.test((emp.role || "").toLowerCase())) {
    const { data: probRows } = await supabaseAdmin
      .from("employee_probation_contracts")
      .select("id, assinatura_status, bypass_diretoria, end_date, start_date, created_at")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(5);
    const prob = (probRows || [])[0];
    const probLegacy = prob && String(prob.created_at || "").slice(0, 10) < LEGACY_CONTRACT_CUTOFF;
    if (!prob) {
      itensCon.push({ label: "Contrato de Experiência (45d)", status: "pendente", detail: "Não emitido" });
    } else if (probLegacy) {
      itensCon.push({ label: "Contrato de Experiência (45d)", status: "ok", detail: "OK por autorização (contrato pré-existente)" });
    } else if (prob.assinatura_status === "assinado" || prob.bypass_diretoria) {
      itensCon.push({ label: "Contrato de Experiência (45d)", status: "ok", detail: prob.bypass_diretoria ? "Liberado pela Diretoria" : "Assinado" });
    } else {
      itensCon.push({ label: "Contrato de Experiência (45d)", status: "pendente", detail: "Aguardando assinatura" });
    }
    const probEnd = prob?.end_date ? String(prob.end_date).slice(0, 10) : null;
    const expExpirou = probEnd && probEnd < today;
    if (expExpirou) {
      const { data: permRows } = await supabaseAdmin
        .from("employee_permanent_contracts")
        .select("id, assinatura_status, bypass_diretoria, created_at")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(1);
      const perm = (permRows || [])[0];
      const permLegacy = perm && String(perm.created_at || "").slice(0, 10) < LEGACY_CONTRACT_CUTOFF;
      if (!perm) {
        itensCon.push({ label: "Contrato Definitivo (CLT)", status: "pendente", detail: "Não emitido" });
      } else if (permLegacy) {
        itensCon.push({ label: "Contrato Definitivo (CLT)", status: "ok", detail: "OK por autorização (contrato pré-existente)" });
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

  // ===== Etapa 4: Holerites (últimos 3 meses) — informativa =====
  const itensHl: OnboardingStage["itens"] = [];
  const meses = lastNMonths(3);
  const { data: payRows } = await supabaseAdmin
    .from("employee_payslips")
    .select("id, month, year, assinado_em, assinatura_status")
    .eq("employee_id", employeeId);
  const pay = payRows || [];
  const hireDate = emp.hireDate ? String(emp.hireDate).slice(0, 10) : null;
  for (const ym of meses) {
    if (hireDate && ym < hireDate.slice(0, 7)) continue;
    const [y, m] = ym.split("-").map(Number);
    const found = pay.find((p: any) => Number(p.year) === y && Number(p.month) === m);
    if (!found) {
      itensHl.push({ label: `Holerite ${ym}`, status: "pendente", detail: "Não emitido" });
    } else if (!found.assinado_em && found.assinatura_status !== "assinado") {
      itensHl.push({ label: `Holerite ${ym}`, status: "pendente", detail: "Aguardando assinatura" });
    } else {
      itensHl.push({ label: `Holerite ${ym}`, status: "ok", detail: "Assinado" });
    }
  }
  if (itensHl.length === 0) {
    itensHl.push({ label: "Holerites", status: "ok", detail: "Sem referências aplicáveis" });
  }
  const hlPend = itensHl.filter(i => i.status !== "ok").map(i => `${i.label}${i.detail ? " — " + i.detail : ""}`);
  const hlStatus: OnboardingStage["status"] =
    itensHl.some(i => i.status === "vencido") ? "vencido" :
    itensHl.some(i => i.status === "pendente") ? "pendente" : "ok";

  const stages: OnboardingStage[] = [
    { key: "documentacao", label: "Documentação", status: docStatus, blocking: true, pendencias: docPend, itens: itensDoc },
    { key: "contratos", label: "Contratos", status: conStatus, blocking: true, pendencias: conPend, itens: itensCon },
    { key: "treinamento", label: "Treinamento", status: trStatus, blocking: true, pendencias: trPend, itens: itensTr },
    { key: "holerites", label: "Holerites", status: hlStatus, blocking: false, pendencias: hlPend, itens: itensHl },
  ];
  // "apto" considera apenas etapas bloqueantes
  const apto = stages.filter(s => s.blocking).every(s => s.status === "ok");

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
  app.get("/api/employees/:id/onboarding", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const r = await computeOnboarding(id);
      res.json(r);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Resumo em batch p/ a listagem de funcionários
  app.get("/api/onboarding-summary", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const all = await storage.getEmployees();
      const out = await Promise.all(
        all.filter((e: any) => e.status !== "inativo").map(async (e: any) => {
          try {
            const r = await computeOnboarding(e.id);
            return {
              employeeId: e.id,
              apto: r.apto,
              stages: r.stages.map(s => ({ key: s.key, status: s.status, blocking: s.blocking, count: s.pendencias.length })),
            };
          } catch {
            return { employeeId: e.id, apto: false, stages: [] };
          }
        })
      );
      res.json(out);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Declarar "sem dependentes" (atende à exigência de informar dependentes)
  app.post("/api/employees/:id/dependentes/declarar-sem", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const { error } = await supabaseAdmin.from("employees").update({ dependentes_declarados: true }).eq("id", id);
    if (error) return res.status(500).json({ message: error.message });
    res.json({ ok: true });
  });

  app.post("/api/employees/:id/dependentes/limpar-declaracao", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const { error } = await supabaseAdmin.from("employees").update({ dependentes_declarados: false }).eq("id", id);
    if (error) return res.status(500).json({ message: error.message });
    res.json({ ok: true });
  });

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

  app.delete("/api/trainings/:id", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const { error } = await supabaseAdmin.from("employee_trainings").delete().eq("id", id);
    if (error) return res.status(500).json({ message: error.message });
    res.json({ ok: true });
  });
}
