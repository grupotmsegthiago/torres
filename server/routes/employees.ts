import type { Express } from "express";
  import { storage, toCamelObj } from "../storage";
  import { supabaseAdmin } from "../supabase";
  import { requireAuth, requireAdminRole, requireDiretoria } from "../auth";
  import { insertEmployeeSchema } from "@shared/schema";
  import * as apibrasil from "../apibrasil";
  import { validateContactFields } from "../lib/normalize-contact";
  import OpenAI from "openai";
  import {
    calcularFolha,
    endOfMonthYmd,
    resolveCestaAjudaTorres,
    selectSalaryVigenteFromHistory,
    VR_DIAS_UTEIS_CCT,
  } from "../lib/payroll";
  import { resolveHorasExtrasNoturnas } from "../lib/employee-monthly-cost";
  import { isCltContrato, normalizeTipoContratacao } from "@shared/contratacao";
  import { autoCreateProbationContract, isVigilante } from "./probation-contracts";
import { syncEmployeeStatusToRhid, enqueueRhidSync } from "../control-id";
  import { countBusinessDays, loadHolidaySet, monthRange, payrollPeriodRange } from "./holidays";
  import { bustRhSummaryCache } from "../lib/balanco-cache";
  import { toDecimalString } from "../lib/parse-money";
  import { generateTempPassword } from "../lib/temp-password";
import { resolveOpenAIConfig } from "../lib/holerite-parse";
import { extractPdfText } from "../lib/pdf-text";
import { resolveOcrDocumentPayload } from "../lib/photo-data-uri";

  // TODAS as colunas do tipo `date` da tabela employees (nomes camelCase do
  // schema). Inputs vazios ("") precisam virar null antes de gravar no Supabase,
  // senão o Postgres rejeita com `invalid input syntax for type date: ""`.
  // Ao adicionar uma nova coluna date em `employees`, incluir aqui — o teste
  // employees-date-fields.test.ts compara com o schema e falha se faltar alguma.
  export const EMPLOYEE_DATE_FIELDS = [
    "birthDate", "hireDate", "vacationExpiry", "cnhExpiry", "cnvExpiry", "cnvIssueDate", "vestExpiry",
  ];

const EMPLOYEE_OCR_SYSTEM = `Você é um sistema especializado em extrair dados de documentos brasileiros de identificação pessoal (RG, CNH, CPF, CNV, CTPS, Certificado de Reservista, comprovantes de residência, etc).
Extraia os seguintes campos do documento e retorne APENAS um JSON válido (sem markdown, sem texto extra):
{
  "name": "nome completo da pessoa",
  "cpf": "CPF no formato 000.000.000-00",
  "rg": "número do RG (apenas o número, sem órgão emissor)",
  "orgaoEmissor": "órgão emissor do RG (ex: SSP, DETRAN, IFP, IIRGD) — apenas a sigla",
  "ufEmissor": "UF do órgão emissor do RG (sigla de 2 letras, ex: SP, RJ)",
  "cnhNumber": "número da CNH se for CNH",
  "cnhCategoria": "categoria da CNH se for CNH (ex: A, B, AB, C, D, E, ACC)",
  "cnhExpiry": "data de validade da CNH no formato YYYY-MM-DD (se for CNH)",
  "birthDate": "data de nascimento no formato YYYY-MM-DD",
  "motherName": "nome da mãe",
  "fatherName": "nome do pai",
  "nationality": "nacionalidade (ex: Brasileira)",
  "maritalStatus": "estado civil se visível",
  "address": "logradouro/rua sem número, complemento ou bairro (ex: Rua das Flores)",
  "addressNumber": "número do endereço (apenas dígitos, ex: 123)",
  "addressComplement": "complemento do endereço (ex: Apto 45, Bloco B) se houver",
  "bairro": "bairro do endereço",
  "city": "cidade do endereço",
  "state": "UF do endereço (sigla de 2 letras, ex: SP)",
  "zip": "CEP no formato 00000-000",
  "notes": "tipo do documento identificado e informações adicionais relevantes"
}
Se um campo não for encontrado no documento, retorne string vazia "". Nunca invente dados.
Para datas, sempre converta para o formato YYYY-MM-DD.
Para CPF, formate como 000.000.000-00.
Para CEP, formate como 00000-000.
Para categoria CNH, retorne apenas a letra/sigla (sem "Categoria" ou similar).
Para endereço: quebre o endereço completo em logradouro, número, complemento, bairro, cidade, UF e CEP em campos separados. Não duplique o número ou bairro no campo "address".`;

function parseOcrJson(text: string): any {
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(cleaned);
}

async function runEmployeeOpenAI(messages: OpenAI.Chat.ChatCompletionCreateParams["messages"]) {
  const aiCfg = resolveOpenAIConfig();
  if (!aiCfg) {
    const err: any = new Error("Chave de API de IA não configurada (defina OPENAI_API_KEY na Vercel).");
    err.statusCode = 500;
    throw err;
  }

  const run = (cfg: { apiKey: string; baseURL?: string }) => {
    const openai = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
      timeout: 45000,
      maxRetries: 1,
    });
    return openai.chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      messages,
    });
  };

  try {
    console.log(`[ocr] Enviando para OpenAI (base=${aiCfg.baseURL || "api.openai.com"})...`);
    return await run(aiCfg);
  } catch (aiErr: any) {
    const msg = String(aiErr?.message || aiErr || "");
    console.error("[ocr] OpenAI falhou:", msg);
    const legacy = process.env.OPENAI_API_KEY;
    if (aiCfg.baseURL && legacy && /connection|ENOTFOUND|ECONN|timeout|fetch failed/i.test(msg)) {
      return await run({ apiKey: legacy, baseURL: undefined });
    }
    throw aiErr;
  }
}

  export function registerEmployeeRoutes(app: Express) {
    app.get("/api/employees", requireAuth, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const EMP_LIST_COLS = "id,name,role,cpf,matricula,pis,phone,email,status,hire_date,cnh_expiry,cnv_expiry,ctps_number,ctps_serie,vacation_expiry,block_type,block_reason,photo_url,tipo_contratacao,category,created_at";

    let data: any[];
    try {
      const { data: rows, error } = await supabaseAdmin.from("employees")
        .select(EMP_LIST_COLS)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      data = rows?.map((r: any) => toCamelObj(r)) || [];
    } catch (err: any) {
      console.warn(`[emp-list] supabase error, falling back: ${err.message}`);
      const all = await storage.getEmployees();
      data = all.slice(offset, offset + limit);
    }

    if (req.user!.role !== "diretoria") {
      const sanitized = data.map((e: any) => ({ ...e, blockType: null, blockReason: null }));
      return res.json(sanitized);
    }
    res.json(data);
  });

  app.get("/api/employees/next-matricula", requireAuth, async (_req, res) => {
    const matricula = await storage.getNextMatricula();
    res.json({ matricula });
  });

  app.get("/api/cep/:cep", requireAuth, async (req, res) => {
    const cep = String(req.params.cep || "").replace(/\D/g, "");
    if (cep.length !== 8) return res.status(400).json({ message: "CEP inválido" });
    const token = process.env.BRASILAPI_TOKEN;
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, { headers });
      if (r.ok) {
        const d = await r.json();
        return res.json({
          cep: d.cep,
          address: d.street || "",
          bairro: d.neighborhood || "",
          city: d.city || "",
          state: d.state || "",
          lat: d.location?.coordinates?.latitude ? Number(d.location.coordinates.latitude) : null,
          lng: d.location?.coordinates?.longitude ? Number(d.location.coordinates.longitude) : null,
          source: "brasilapi",
        });
      }
    } catch (e: any) {
      console.warn("[cep] brasilapi falhou, fallback viacep:", e.message);
    }
    try {
      const r2 = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (r2.ok) {
        const d: any = await r2.json();
        if (d.erro) return res.status(404).json({ message: "CEP não encontrado" });
        return res.json({
          cep: d.cep,
          address: d.logradouro || "",
          bairro: d.bairro || "",
          city: d.localidade || "",
          state: d.uf || "",
          lat: null,
          lng: null,
          source: "viacep",
        });
      }
    } catch (e: any) {
      console.warn("[cep] viacep falhou:", e.message);
    }
    return res.status(502).json({ message: "Não foi possível consultar o CEP" });
  });

  app.get("/api/employees/:id", requireAuth, async (req, res) => {
    const empId = Number(req.params.id);
    if (isNaN(empId)) return res.status(400).json({ message: "ID inválido" });
    const data = await storage.getEmployee(empId);
    if (!data) return res.status(404).json({ message: "Funcionário não encontrado" });
    if (req.user!.role !== "diretoria") {
      const { blockType, blockReason, ...safe } = data as any;
      return res.json(safe);
    }
    res.json(data);
  });

  app.post("/api/employees", requireAuth, requireAdminRole, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const body = { ...req.body };
    console.log("[emp-debug POST] rg recebido:", JSON.stringify(body.rg), "| keys:", Object.keys(body).join(","));
    const dateFields = EMPLOYEE_DATE_FIELDS;
    for (const f of dateFields) { if (body[f] === "") body[f] = null; }
    if (body.rg == null) body.rg = "";
    const matricula = await storage.getNextMatricula();
    body.matricula = matricula;
    const parsed = insertEmployeeSchema.safeParse(body);
    if (!parsed.success) {
      console.log("[emp-debug POST] schema FAIL:", JSON.stringify(parsed.error.errors));
      return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    }
    const contactErrors = validateContactFields(parsed.data, { phones: ["phone"], zips: ["zip"] });
    if (contactErrors.length) return res.status(400).json({ message: contactErrors[0].message, errors: contactErrors });
    console.log("[emp-debug POST] parsed.rg:", JSON.stringify(parsed.data.rg));
    const data = await storage.createEmployee(parsed.data);
    console.log("[emp-debug POST] saved.rg:", JSON.stringify((data as any).rg));
    if (data.cpf) {
      apibrasil.autoConsultaFuncionario(data.cpf, req.user!.id).catch(() => {});
    }

    let autoUserCreated = false;
    let autoUserError: string | null = null;
    let autoUserTempPassword: string | null = null;
    if (data.cpf) {
      const cleanCpf = data.cpf.replace(/\D/g, "");
      if (cleanCpf.length === 11) {
        const syntheticEmail = `cpf_${cleanCpf}@torresseguranca.local`;
        const existingUser = await storage.getUserByEmail(syntheticEmail);
        if (existingUser) {
          autoUserError = "Já existe um login para este CPF";
        } else {
          try {
            const tempPassword = generateTempPassword();
            const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
              email: syntheticEmail,
              password: tempPassword,
              email_confirm: true,
            });
            if (authError) {
              autoUserError = authError.message;
            } else {
              try {
                await storage.createUser({
                  supabaseUid: authData.user.id,
                  email: syntheticEmail,
                  name: data.name,
                  role: "funcionario",
                  employeeId: data.id,
                  mustChangePassword: 1,
                });
                autoUserCreated = true;
                // one-shot em memória — não gravar em public.users
                autoUserTempPassword = tempPassword;
              } catch (dbErr: any) {
                await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
                autoUserError = dbErr.message;
              }
            }
          } catch (err: any) {
            autoUserError = err.message;
          }
        }
      }
    }

    // Auto-criação do Contrato de Experiência (45 dias) se for vigilante
    let probationContractId: number | null = null;
    let probationContractError: string | null = null;
    if (isVigilante(data.role)) {
      const r = await autoCreateProbationContract(data);
      if (r.error) probationContractError = r.error;
      if (r.contractId) probationContractId = r.contractId;
    }

    // Enfileira sync pro RHID (cria pessoa lá se tiver CPF+PIS)
    if (data.cpf) {
      enqueueRhidSync({ kind: "employee", op: "create", refId: data.id, employeeId: data.id }).catch(() => {});
    }
    res.status(201).json({
      ...data,
      autoUserCreated,
      autoUserError,
      probationContractId,
      probationContractError,
      ...(autoUserTempPassword
        ? {
            tempPassword: autoUserTempPassword,
            oneShot: true,
            message: "Copie agora. Esta senha não será exibida novamente.",
          }
        : {}),
    });
  });

  app.patch("/api/employees/:id", requireAuth, requireAdminRole, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const body = { ...req.body };
    console.log(`[emp-debug PATCH ${req.params.id}] rg recebido:`, JSON.stringify(body.rg), "| hasRg:", "rg" in body);
    const dateFields = EMPLOYEE_DATE_FIELDS;
    for (const f of dateFields) { if (body[f] === "") body[f] = null; }
    delete body.matricula;
    const parsed = insertEmployeeSchema.partial().safeParse(body);
    if (!parsed.success) {
      console.log(`[emp-debug PATCH ${req.params.id}] schema FAIL:`, JSON.stringify(parsed.error.errors));
      return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    }
    const contactErrors = validateContactFields(parsed.data, { phones: ["phone"], zips: ["zip"] });
    if (contactErrors.length) return res.status(400).json({ message: contactErrors[0].message, errors: contactErrors });
    console.log(`[emp-debug PATCH ${req.params.id}] parsed.rg:`, JSON.stringify(parsed.data.rg));
    const data = await storage.updateEmployee(Number(req.params.id), parsed.data);
    if (!data) return res.status(404).json({ message: "Funcionário não encontrado" });
    console.log(`[emp-debug PATCH ${req.params.id}] saved.rg:`, JSON.stringify((data as any).rg));
    // Enfileira sync pro RHID (atualiza nome/matricula/status — registerEmployeeInRhid é idempotente)
    enqueueRhidSync({ kind: "employee", op: "update", refId: Number(req.params.id), employeeId: Number(req.params.id) }).catch(() => {});
    res.json(data);
  });

  app.delete("/api/employees/:id", requireAuth, requireDiretoria, async (req, res) => {
    const empId = Number(req.params.id);
    try {
      await supabaseAdmin.from("employee_documents").delete().eq("employee_id", empId);
      await supabaseAdmin.from("employee_salaries").delete().eq("employee_id", empId);
      await supabaseAdmin.from("employee_absences").delete().eq("employee_id", empId);
      await supabaseAdmin.from("employee_fines").delete().eq("employee_id", empId);
      await supabaseAdmin.from("employee_disciplinary").delete().eq("employee_id", empId);
      await supabaseAdmin.from("timesheets").delete().eq("employee_id", empId);
      await supabaseAdmin.from("payslips").delete().eq("employee_id", empId);
      await supabaseAdmin.from("weapon_movements").delete().eq("employee_id", empId);
      await supabaseAdmin.from("vehicle_assignments").delete().eq("employee_id", empId);
      try { await supabaseAdmin.from("mission_updates").delete().eq("employee_id", empId); } catch (_muErr) {}
      // Enfileira inativação no RHID ANTES de remover localmente (pra ter o mapping)
      await enqueueRhidSync({ kind: "employee", op: "delete", refId: empId, employeeId: empId }).catch(() => {});
      await storage.deleteEmployee(empId);
      res.json({ message: "Funcionário removido" });
    } catch (err: any) {
      console.error("Erro ao remover funcionário:", err.message);
      res.status(500).json({ message: "Erro ao remover funcionário. Verifique se existem OS vinculadas." });
    }
  });

  // Bulk: último salário base por funcionário (DIRETORIA-ONLY — dado sensível LGPD)
  app.get("/api/employees/salaries-bulk", requireAuth, requireDiretoria, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("employee_salaries")
        .select("employee_id,base_salary,effective_date")
        .order("effective_date", { ascending: false });
      if (error) throw error;
      const latest: Record<number, { baseSalary: number; effectiveDate: string }> = {};
      for (const r of data || []) {
        const eid = (r as any).employee_id;
        if (latest[eid]) continue;
        latest[eid] = {
          baseSalary: Number((r as any).base_salary) || 0,
          effectiveDate: (r as any).effective_date,
        };
      }
      res.json(latest);
    } catch (err: any) {
      console.error("[salaries-bulk] erro:", err.message);
      res.status(500).json({ message: "Erro ao buscar salários" });
    }
  });

  app.get("/api/employees/:id/salaries", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const salaries = await storage.getEmployeeSalaries(Number(req.params.id));
    res.json(salaries);
  });

  app.post("/api/employees/:id/salaries", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    try {
      const emp = await storage.getEmployee(Number(req.params.id));
      if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });
      const { baseSalary, effectiveDate, reason, notes,
              valeRefeicaoDiario, cestaBasica, valeTransporteMensal,
              beneficiosOutros, encargosPct, horasMensais,
              periculosidadePct, dependentesIr, ajudaCustoMensal,
              valeAlimentacaoMensal, assiduidadeMensal } = req.body;
      if (baseSalary == null || baseSalary === "" || !effectiveDate) {
        return res.status(400).json({ message: "Salário e data são obrigatórios" });
      }
      // Aceita "4.000,00" (pt-BR) — sem isso o Postgres rejeita e o histórico não grava.
      const baseNorm = toDecimalString(baseSalary);
      if (!baseNorm) {
        return res.status(400).json({ message: "Salário base inválido. Use um valor numérico (ex.: 4000 ou 4.000,00)." });
      }
      const eff = String(effectiveDate).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(eff)) {
        return res.status(400).json({ message: "Data de vigência inválida" });
      }
      const optDec = (v: unknown) => (v === undefined || v === "" || v == null ? null : toDecimalString(v, { allowZero: true }));
      const empIsClt = isCltContrato((emp as any).tipoContratacao ?? (emp as any).tipo_contratacao);
      const payload: any = {
        employeeId: emp.id,
        baseSalary: baseNorm,
        effectiveDate: eff,
        reason: reason || null,
        notes: notes || null,
      };
      // PJ: valor fixo puro — grava peric/VR/cesta zerados quando não informados
      // (evita herdar 30% CCT no salary-summary via `?? fallback`).
      if (!empIsClt) {
        payload.periculosidadePct = optDec(periculosidadePct) ?? "0";
        payload.valeRefeicaoDiario = optDec(valeRefeicaoDiario) ?? "0";
        payload.cestaBasica = optDec(cestaBasica) ?? "0";
        payload.valeTransporteMensal = optDec(valeTransporteMensal) ?? "0";
        payload.beneficiosOutros = optDec(beneficiosOutros) ?? "0";
        payload.encargosPct = optDec(encargosPct) ?? "0";
        payload.valeAlimentacaoMensal = optDec(valeAlimentacaoMensal) ?? "0";
        payload.assiduidadeMensal = optDec(assiduidadeMensal) ?? "0";
      }
      const vr = optDec(valeRefeicaoDiario); if (vr != null) payload.valeRefeicaoDiario = vr;
      const cesta = optDec(cestaBasica); if (cesta != null) payload.cestaBasica = cesta;
      const vt = optDec(valeTransporteMensal); if (vt != null) payload.valeTransporteMensal = vt;
      const outros = optDec(beneficiosOutros); if (outros != null) payload.beneficiosOutros = outros;
      const enc = optDec(encargosPct); if (enc != null) payload.encargosPct = enc;
      const horas = optDec(horasMensais); if (horas != null) payload.horasMensais = horas;
      const peric = optDec(periculosidadePct); if (peric != null) payload.periculosidadePct = peric;
      if (dependentesIr !== undefined && dependentesIr !== "") {
        const deps = Number(dependentesIr);
        if (!Number.isNaN(deps)) payload.dependentesIr = deps;
      }
      const ajuda = optDec(ajudaCustoMensal); if (ajuda != null) payload.ajudaCustoMensal = ajuda;
      const va = optDec(valeAlimentacaoMensal); if (va != null) payload.valeAlimentacaoMensal = va;
      const assid = optDec(assiduidadeMensal); if (assid != null) payload.assiduidadeMensal = assid;

      const salary = await storage.createEmployeeSalary(payload);
      bustRhSummaryCache();
      res.status(201).json(salary);
    } catch (err: any) {
      console.error("[employees/salaries POST]", err?.message || err);
      res.status(500).json({ message: err?.message || "Erro ao salvar salário" });
    }
  });

  // ========== DEPENDENTES (Folha 2025 / IRRF) ==========
  app.get("/api/employees/:id/dependents", requireAuth, async (req, res) => {
    const empId = Number(req.params.id);
    if (isNaN(empId)) return res.status(400).json({ message: "ID inválido" });
    const { data, error } = await supabaseAdmin.from("employee_dependents")
      .select("*").eq("employee_id", empId).order("birth_date", { ascending: true });
    if (error) return res.status(500).json({ message: error.message });
    res.json((data || []).map((r: any) => toCamelObj(r)));
  });

  app.post("/api/employees/:id/dependents", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const empId = Number(req.params.id);
    if (isNaN(empId)) return res.status(400).json({ message: "ID inválido" });
    const { name, birthDate, parentesco, cpf, certidaoData, certidaoFileName, deduzIr, notes } = req.body;
    if (!name || !birthDate) return res.status(400).json({ message: "Nome e data de nascimento são obrigatórios" });
    const payload: any = {
      employee_id: empId,
      name: String(name).trim(),
      birth_date: birthDate,
      parentesco: parentesco || "filho",
      cpf: cpf || null,
      certidao_data: certidaoData || null,
      certidao_file_name: certidaoFileName || null,
      deduz_ir: deduzIr !== undefined ? Boolean(deduzIr) : true,
      notes: notes || null,
    };
    const { data, error } = await supabaseAdmin.from("employee_dependents").insert(payload).select().single();
    if (error) return res.status(500).json({ message: error.message });
    res.status(201).json(toCamelObj(data));
  });

  app.delete("/api/employee-dependents/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido" });
    const { error } = await supabaseAdmin.from("employee_dependents").delete().eq("id", id);
    if (error) return res.status(500).json({ message: error.message });
    res.json({ message: "Dependente removido" });
  });

  app.delete("/api/employee-salaries/:id", requireAuth, requireDiretoria, async (req, res) => {
    await storage.deleteEmployeeSalary(Number(req.params.id));
    bustRhSummaryCache();
    res.json({ message: "Registro salarial removido" });
  });

  app.get("/api/employees/:id/salary-discounts", requireAdminRole, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const empId = Number(req.params.id);
    const month = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const { data: rows } = await supabaseAdmin.from("employee_salary_discounts").select("*")
      .eq("employee_id", empId).eq("month", month).eq("year", year)
      .order("created_at", { ascending: false });
    res.json(rows || []);
  });

  app.post("/api/employees/:id/salary-discounts", requireAdminRole, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const empId = Number(req.params.id);
    const { month, year, type, description, amount } = req.body;
    if (!type || !description || !amount || !month || !year) return res.status(400).json({ message: "Campos obrigatórios: tipo, descrição, valor, mês e ano" });
    const adminName = req.user!.name || req.user!.username || "Admin";
    const { data: row } = await supabaseAdmin.from("employee_salary_discounts").insert({
      employee_id: empId, month: Number(month), year: Number(year),
      type, description, amount: String(amount), created_by: adminName,
    }).select().single();
    res.status(201).json(row);
  });

  app.delete("/api/salary-discounts/:id", requireAuth, requireDiretoria, async (req, res) => {
    await supabaseAdmin.from("employee_salary_discounts").delete().eq("id", Number(req.params.id));
    res.json({ ok: true });
  });

  app.get("/api/employees/:id/salary-summary", requireAdminRole, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    try {
      const empId = Number(req.params.id);
      const month = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
      const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
      const emp = await storage.getEmployee(empId);
      if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });

      // Salário vigente na competência: effective_date <= último dia do mês selecionado.
      // Mesma regra do Balanço (rh-summary / calculateAgentMonthlyCost) e do Ponto.
      const referenceDate = endOfMonthYmd(year, month);
      const { data: salRows } = await supabaseAdmin
        .from("employee_salaries").select("*").eq("employee_id", empId)
        .lte("effective_date", referenceDate)
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(20);
      const sal: any = selectSalaryVigenteFromHistory(salRows || [], referenceDate) || {};

      // Resolve CCT pelo cargo (vigilante→vigilancia, limpeza→siemaco).
      // Antes usava getCctConfig() fixo → Auxiliar de Limpeza herdava
      // valores de vigilância silenciosamente quando employee_salaries
      // estava vazio. Bug pego no code review de 26/05/2026.
      const { getCctConfigByCargo } = await import("../lib/cct-config");
      const CCT_FALLBACK = await getCctConfigByCargo(emp.role);
      // Regime antecipado: PJ usa só o valor fixo cadastrado (sem kit CCT / sem peric 30%).
      const tipoContratacaoEarly = normalizeTipoContratacao(
        (emp as any).tipoContratacao ?? (emp as any).tipo_contratacao,
      );
      const isCltEarly = isCltContrato(tipoContratacaoEarly);
      const temSalario = sal.base_salary != null && sal.base_salary !== "";
      // Se não há vigência no mês, avisa se existe cadastro só com data futura
      // (ex.: R$ 4.000 com vigência 2027-06-01 ao filtrar Jul/2026).
      let salarioFuturo: { baseSalary: number; effectiveDate: string } | null = null;
      if (!temSalario) {
        const { data: futureRows } = await supabaseAdmin
          .from("employee_salaries").select("base_salary, effective_date")
          .eq("employee_id", empId)
          .gt("effective_date", referenceDate)
          .order("effective_date", { ascending: true })
          .limit(1);
        const fut = futureRows?.[0] as any;
        if (fut?.effective_date != null && fut.base_salary != null && fut.base_salary !== "") {
          salarioFuturo = {
            baseSalary: Number(fut.base_salary),
            effectiveDate: String(fut.effective_date).slice(0, 10),
          };
        }
      }
      // PJ sem histórico → 0 (não inventa CCT). CLT sem histórico → kit CCT do cargo.
      const baseSalary = temSalario
        ? Number(sal.base_salary)
        : (isCltEarly ? Number(CCT_FALLBACK.salarioBase) : 0);
      const periculosidadePct = isCltEarly
        ? Number(sal.periculosidade_pct ?? CCT_FALLBACK.periculosidadePct) / 100
        : 0;
      const vrDiario = isCltEarly ? Number(sal.vale_refeicao_diario ?? CCT_FALLBACK.valeRefeicaoDia) : 0;
      const ben = resolveCestaAjudaTorres(
        isCltEarly ? Number(sal.cesta_basica ?? CCT_FALLBACK.cestaBasica) : 0,
        Number(sal.ajuda_custo_mensal || 0),
      );
      const cestaMensal = isCltEarly ? ben.cesta : 0;
      const ajudaCustoMensal = ben.ajudaCusto;
      const vt = isCltEarly ? Number(sal.vale_transporte_mensal || 0) : 0;
      const outros = isCltEarly ? Number(sal.beneficios_outros || 0) : 0;
      const horasMensais = Number(sal.horas_mensais || 220);
      const semSalarioPj = !isCltEarly && !temSalario;

      // Competência de RH (ciclo 26 → 25) — usada para HE/ponto. VR usa dias CCT fixos.
      const { from, to } = payrollPeriodRange(year, month);
      const holidaySet = await loadHolidaySet(from, to);
      const diasUteisPeriodo = countBusinessDays(from, to, holidaySet);
      // VR mensal fixo CCT (43 × 22 = 946) — não varia com feriados do período.
      const diasUteis = VR_DIAS_UTEIS_CCT;

      // Proporcional na admissão
      let proporcional = false;
      let diasTrabalhados = 30;
      let fatorProporcional = 1;
      if (emp.hireDate) {
        const hire = new Date(emp.hireDate);
        if (hire.getFullYear() === year && hire.getMonth() + 1 === month) {
          const hireDay = hire.getDate();
          const daysInMonth = new Date(year, month, 0).getDate();
          diasTrabalhados = daysInMonth - hireDay + 1;
          fatorProporcional = diasTrabalhados / 30;
          proporcional = true;
        }
      }

      // Dependentes para IRRF (mesma regra da engine de custos fixos)
      let dependentesIR = Number(sal.dependentes_ir || 0);
      try {
        const { count } = await supabaseAdmin
          .from("employee_dependents")
          .select("id", { count: "exact", head: true })
          .eq("employee_id", empId).eq("deduz_ir", true);
        if (typeof count === "number" && count > 0) dependentesIR = count;
      } catch { /* fallback */ }

      // ===== HORAS EXTRAS / NOTURNAS (ponto → jornada → batidas Control iD) =====
      // Janela = competência de RH (26 → 25). Não trava em ponto com HE=0.
      const mesRef = `${year}-${String(month).padStart(2, "0")}`;
      const horasRes = await resolveHorasExtrasNoturnas({
        employeeId: empId,
        from,
        to,
        mesRef,
        horasMensais,
        allowBatidasFallback: true,
      });
      const horasExtras = horasRes.horasExtras;
      const horasNoturnas = horasRes.horasNoturnas;
      const horasFonte = horasRes.fonte;
      const registrosPonto = horasRes.registros;

      // Regime: CLT (encargos/HE/benefícios) ou PJ (valor fixo — sem impostos/variáveis/HE).
      const tipoContratacao = tipoContratacaoEarly;
      const isClt = isCltEarly;

      // VT desconto só CLT (modelo Torres: 6% do salário c/ peric quando há VT).
      const salarioComPericProp = baseSalary * (diasTrabalhados / 30) * (1 + periculosidadePct);
      const vtDesconto = isClt && vt > 0 ? +(salarioComPericProp * 0.06).toFixed(2) : 0;

      // ===== ENGINE DE FOLHA 2025 (mesmo padrão do custo fixo) =====
      // HE/noturno: taxas fixas do Kit CCT (diurna 16 / noturna 16,50).
      const heDiurnaFixo = isClt ? Number(CCT_FALLBACK.horaExtraValor || 0) : 0;
      const heNoturnaFixo = isClt ? Number((CCT_FALLBACK as any).horaExtraNoturnaValor || 0) : 0;
      const folha = calcularFolha({
        salarioBaseCheio: baseSalary,
        diasTrabalhados,
        horasMensais,
        periculosidadePct,
        horasExtras: isClt ? horasExtras : 0,
        horasNoturnas: isClt ? horasNoturnas : 0,
        diasUteis: isClt ? diasUteis : 0,
        refeicaoDiaria: isClt ? vrDiario : 0,
        ajudaCustoMensal,
        dependentesIR,
        isClt,
        vtDesconto,
        valorHoraExtraFixo: heDiurnaFixo,
        valorHoraNoturnaFixo: heNoturnaFixo,
      });

      // Benefícios CCT variáveis (cesta/VT/VA/assiduidade) só entram no CLT.
      const valeAlimentacao = isClt ? Number(sal.vale_alimentacao_mensal || 0) : 0;
      const assiduidade = isClt ? Number(sal.assiduidade_mensal || 0) : 0;
      const cestaCusto = isClt ? cestaMensal : 0;
      const vtCusto = isClt ? vt : 0;
      const outrosCusto = isClt ? outros : 0;

      // Vencimentos = remuneração (salário+peric+HE+noturno). Benefícios à parte.
      const totalVencimentos = +folha.totalBruto.toFixed(2);
      const totalBeneficios = isClt
        ? +(folha.refeicao + folha.ajudaCusto + cestaCusto + valeAlimentacao + assiduidade + outrosCusto).toFixed(2)
        : +folha.ajudaCusto.toFixed(2);

      // Descontos manuais (ocorrências) + descontos legais (INSS + IRRF + FGTS + VT)
      const { data: discounts } = await supabaseAdmin.from("employee_salary_discounts").select("*")
        .eq("employee_id", empId).eq("month", month).eq("year", year);
      const totalDescontosManuais = (discounts || []).reduce((sum: number, d: any) => sum + Number(d.amount), 0);
      // FGTS NÃO desconta do líquido (depósito do empregador) — fica fora do total de deduções.
      const totalDeducoesLegais = +(folha.inss + folha.irrf + vtDesconto).toFixed(2);
      // Líquido salarial modelo Torres = Total tributável − INSS − IRRF − VT − descontos manuais.
      // (FGTS é depósito do empregador, não desconta — decisão do dono 26/06/2026.)
      // Benefícios (VR/VA/cesta/assiduidade/ajuda) são pagos à parte (totalBeneficios).
      const liquido = +(folha.liquidoFuncionario - totalDescontosManuais).toFixed(2);
      const totalReceber = +(liquido + totalBeneficios).toFixed(2);

      // Custo Empresa: CLT = folha + benefícios CCT; PJ = só valor fixo (sem variáveis).
      const custoTotalEmpresa = isClt
        ? +(folha.custoTotalEmpresa + cestaCusto + vtCusto + outrosCusto + valeAlimentacao + assiduidade).toFixed(2)
        : +folha.custoTotalEmpresa.toFixed(2);

      res.json({
        employee: { id: emp.id, name: emp.name, matricula: emp.matricula, role: emp.role, hireDate: emp.hireDate, cpf: emp.cpf },
        month, year, proporcional, diasTrabalhados, fatorProporcional,
        diasUteis: isClt ? diasUteis : 0,
        diasUteisPeriodo: isClt ? diasUteisPeriodo : 0,
        tipoContratacao,
        isClt,
        semSalario: !temSalario,
        semSalarioPj,
        salarioFuturo,
        // Fonte canônica da vigência (mesma do Balanço)
        salarioBaseCheio: baseSalary,
        effectiveDate: sal.effective_date ? String(sal.effective_date).slice(0, 10) : null,
        salaryRecordId: sal.id != null ? Number(sal.id) : null,
        referenceDate,
        // ► Mantém compat com UI atual + enriquece com engine
        vencimentos: {
          salarioBase: folha.salarioProporcional,
          periculosidade: folha.periculosidade,
          horasExtrasValor: folha.horasExtrasValor,
          adicionalNoturnoValor: folha.adicionalNoturnoValor,
          dsr: folha.dsr,
          valeRefeicao: folha.refeicao,
          cestaBasica: cestaCusto,
          valeTransporte: vtCusto,
          ajudaCusto: folha.ajudaCusto,
          outros: outrosCusto,
          total: totalVencimentos,
          baseTributavel: folha.baseTributavel,
          totalBruto: folha.totalBruto,
        },
        // ► Horas extras — PJ não contabiliza (zeradas no custo)
        horasExtras: {
          horas: isClt ? horasExtras : 0,
          noturnas: isClt ? horasNoturnas : 0,
          valor: folha.horasExtrasValor,
          dsrValor: folha.dsr,
          fonte: isClt ? horasFonte : "nenhuma",
          registros: isClt ? registrosPonto : 0,
          mesRef,
          ignoradasPj: !isClt && (horasExtras > 0 || horasNoturnas > 0),
        },
        // ► Deduções legais (INSS / IRRF / VT). FGTS é depósito do empregador (informativo,
        // NÃO entra no total nem desconta do líquido — decisão do dono 26/06/2026).
        deducoesLegais: {
          inss: folha.inss,
          irrf: folha.irrf,
          fgts: folha.fgts,
          valeTransporte: vtDesconto,
          dependentesIR,
          total: totalDeducoesLegais,
        },
        // ► Benefícios pagos à parte (não entram no líquido salarial)
        beneficios: {
          valeRefeicao: folha.refeicao,
          valeAlimentacao,
          cestaBasica: cestaCusto,
          assiduidade,
          ajudaCusto: folha.ajudaCusto,
          outros: outrosCusto,
          total: totalBeneficios,
        },
        // ► Provisões mensais (custo da empresa) — zeradas em PJ
        provisoes: {
          decimoTerceiro: folha.provisaoDecimoTerceiro,
          ferias: folha.provisaoFerias,
          tercoFerias: folha.provisaoTercoFerias,
          fgtsSobreFerias13: folha.provisaoFGTSsobreFerias13,
          inssSobreFerias13: folha.provisaoINSSsobreFerias13,
          total: folha.totalProvisoes,
        },
        // ► Compat com UI antiga
        descontos: (discounts || []).map((d: any) => ({ id: d.id, type: d.type, description: d.description, amount: Number(d.amount), createdBy: d.created_by, createdAt: d.created_at })),
        totalDescontos: totalDescontosManuais,
        liquido,
        custoTotalEmpresa,
        cctRef: { salarioBase: baseSalary, periculosidadePct: periculosidadePct * 100, valeRefeicaoDia: vrDiario, cestaBasica: cestaMensal, totalBruto: totalVencimentos },
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/payroll/sync-financial", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const month = Number(req.body.month) || new Date().getMonth() + 1;
      const year = Number(req.body.year) || new Date().getFullYear();
      const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
      const mesLabel = MESES[month - 1];

      const allEmployees = await storage.getEmployees();
      const activeEmployees = allEmployees.filter((e: any) => e.status === "ativo" && (e.role?.toLowerCase().includes("vigilante") || e.role?.toLowerCase().includes("escolta")));

      const { getCctConfig } = await import("../lib/cct-config");
      const CCT = await getCctConfig();
      const periculosidade = CCT.salarioBase * (CCT.periculosidadePct / 100);
      const valeRefeicaoMes = CCT.valeRefeicaoDia * CCT.diasUteisMes;
      const totalBruto = CCT.salarioBase + periculosidade + valeRefeicaoMes + CCT.cestaBasica;

      const dueDate = `${year}-${String(month).padStart(2, "0")}-05`;
      let created = 0;
      let skipped = 0;

      for (const emp of activeEmployees) {
        const originId = `payroll-${emp.id}-${year}-${month}`;

        const { data: existing } = await supabaseAdmin.from("financial_transactions")
          .select("id").eq("origin_type", "payroll").eq("origin_id", originId).limit(1);
        if (existing && existing.length > 0) { skipped++; continue; }

        let fatorProporcional = 1;
        let diasTrabalhados = 30;
        if (emp.hireDate) {
          const hire = new Date(emp.hireDate);
          if (hire.getFullYear() === year && hire.getMonth() + 1 === month) {
            const hireDay = hire.getDate();
            const daysInMonth = new Date(year, month, 0).getDate();
            diasTrabalhados = daysInMonth - hireDay + 1;
            fatorProporcional = diasTrabalhados / 30;
          }
        }

        const { data: discounts2 } = await supabaseAdmin.from("employee_salary_discounts").select("*")
          .eq("employee_id", emp.id).eq("month", month).eq("year", year);
        const totalDescontos = (discounts2 || []).reduce((sum: number, d: any) => sum + Number(d.amount), 0);
        const liquido = +((totalBruto * fatorProporcional) - totalDescontos).toFixed(2);

        await createAutoTransaction({
          description: `FOLHA DE PAGAMENTO - ${emp.name?.toUpperCase()} - ${mesLabel.toUpperCase()}/${year}`,
          amount: Math.max(0, liquido),
          type: "EXPENSE",
          due_date: dueDate,
          origin_type: "payroll",
          origin_id: originId,
          category_name: "Recursos Humanos",
          entity_name: emp.name || "",
          created_by: req.user!.name || req.user!.username || "SISTEMA",
        });
        created++;
      }

      res.json({ message: `Folha sincronizada: ${created} lançamento(s) criado(s), ${skipped} já existente(s)`, created, skipped });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/employees/:id/apply-cct-kit", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const empId = Number(req.params.id);
      const emp = await storage.getEmployee(empId);
      if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });
      // Kit CCT agora resolve o preset pelo cargo do funcionário
      // (vigilante→vigilancia, limpeza→siemaco, etc). Cargos não mapeados
      // caem no preset 'vigilancia' por default.
      const { getCctPresetByCargo } = await import("../lib/cct-config");
      const preset = await getCctPresetByCargo(emp.role);
      const CCT = preset.config;
      const effectiveDate = req.body?.effectiveDate || new Date().toISOString().slice(0, 10);
      const periculosidade = Number(CCT.salarioBase) * Number(CCT.periculosidadePct) / 100;
      // Kit vigilância: R$ 200 = ajuda de custo (não cesta). SIEMACO mantém cesta II.
      const benKit = resolveCestaAjudaTorres(Number(CCT.cestaBasica || 0), Number((CCT as any).ajudaCustoMensal || 0));
      const reason = `Kit ${CCT.label} (Base R$${CCT.salarioBase.toFixed(2)} + Periculosidade ${CCT.periculosidadePct}% R$${periculosidade.toFixed(2)} + VR R$${CCT.valeRefeicaoDia}/dia + Ajuda R$${benKit.ajudaCusto})`;
      const notes = `Pgto ${CCT.pagamentoDiaUtil}º dia útil | Periculosidade: R$${periculosidade.toFixed(2)} | VR: R$${(CCT.valeRefeicaoDia * CCT.diasUteisMes).toFixed(2)}/mês | Ajuda de custo: R$${benKit.ajudaCusto}`;

      const sal = await storage.createEmployeeSalary({
        employeeId: empId,
        baseSalary: String(CCT.salarioBase),
        valeRefeicaoDiario: String(CCT.valeRefeicaoDia),
        cestaBasica: String(benKit.cesta),
        ajudaCustoMensal: String(benKit.ajudaCusto),
        periculosidadePct: String(CCT.periculosidadePct),
        horasMensais: "220",
        effectiveDate,
        reason,
        notes,
      } as any);
      res.json({ message: `Kit CCT aplicado a ${emp.name}`, salary: sal });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/employees/apply-cct-kit", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { getCctConfig } = await import("../lib/cct-config");
      const CCT = await getCctConfig();
      const allEmployees = await storage.getEmployees();
      const vigilantes = allEmployees.filter((e: any) => e.status === "ativo" && (e.role?.toLowerCase().includes("vigilante") || e.role?.toLowerCase().includes("escolta")));
      const effectiveDate = req.body.effectiveDate || new Date().toISOString().slice(0, 10);
      const benKit = resolveCestaAjudaTorres(Number(CCT.cestaBasica || 0), Number((CCT as any).ajudaCustoMensal || 0));
      const reason = `Kit CCT SP 2025/2026 (Base R$${CCT.salarioBase.toFixed(2)} + Periculosidade ${CCT.periculosidadePct}% R$${(CCT.salarioBase * CCT.periculosidadePct / 100).toFixed(2)} + VR R$${CCT.valeRefeicaoDia}/dia + Ajuda R$${benKit.ajudaCusto})`;
      let count = 0;
      for (const emp of vigilantes) {
        await storage.createEmployeeSalary({
          employeeId: emp.id,
          baseSalary: String(CCT.salarioBase),
          valeRefeicaoDiario: String(CCT.valeRefeicaoDia),
          cestaBasica: String(benKit.cesta),
          ajudaCustoMensal: String(benKit.ajudaCusto),
          periculosidadePct: String(CCT.periculosidadePct),
          horasMensais: "220",
          effectiveDate,
          reason,
          notes: `Pgto 5º dia útil | Periculosidade: R$${(CCT.salarioBase * CCT.periculosidadePct / 100).toFixed(2)} | VR: R$${(CCT.valeRefeicaoDia * CCT.diasUteisMes).toFixed(2)}/mês | Ajuda de custo: R$${benKit.ajudaCusto}`,
        } as any);
        count++;
      }
      res.json({ message: `Kit CCT aplicado para ${count} vigilante(s)`, count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/employees/monthly-hours", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const month = Number(req.query.month) || new Date().getMonth() + 1;
      const year = Number(req.query.year) || new Date().getFullYear();
      // Ranking de horas usa competência de RH (26 → 25).
      const { from: startDate, to: endDateIncl } = payrollPeriodRange(year, month);

      const { data: billings } = await supabaseAdmin
        .from("escort_billings")
        .select("service_order_id, horas_trabalhadas, horas_missao")
        .gte("data_missao", startDate)
        .lte("data_missao", endDateIncl);

      const sos = await storage.getServiceOrders();
      const relevantOsIds = new Set((billings || []).map((b: any) => b.service_order_id));
      const osMap = new Map<number, any>();
      for (const os of sos) {
        if (relevantOsIds.has(os.id)) osMap.set(os.id, os);
      }

      const employeeHours: Record<number, { totalHours: number; missions: number }> = {};
      for (const b of (billings || [])) {
        const os = osMap.get(b.service_order_id);
        if (!os) continue;
        const hours = Number(b.horas_trabalhadas || b.horas_missao || 0);
        for (const empId of [os.assignedEmployeeId, os.assignedEmployee2Id]) {
          if (!empId) continue;
          if (!employeeHours[empId]) employeeHours[empId] = { totalHours: 0, missions: 0 };
          employeeHours[empId].totalHours += hours;
          employeeHours[empId].missions += 1;
        }
      }

      res.json(employeeHours);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/employees/:id/cost-detail", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const empId = Number(req.params.id);
      const emp = await storage.getEmployee(empId);
      if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });

      const month = Number(req.query.month) || new Date().getMonth() + 1;
      const year = Number(req.query.year) || new Date().getFullYear();
      // Detalhe de custo por funcionário usa competência de RH (26 → 25).
      const { from: startDate, to: endDateIncl } = payrollPeriodRange(year, month);

      const { data: billings } = await supabaseAdmin
        .from("escort_billings")
        .select("service_order_id, horas_trabalhadas, horas_missao, data_missao")
        .gte("data_missao", startDate)
        .lte("data_missao", endDateIncl);

      const sos = await storage.getServiceOrders();
      let totalHours = 0;
      let missions = 0;
      const missionDetails: any[] = [];
      for (const b of (billings || [])) {
        const os = sos.find((o: any) => o.id === b.service_order_id);
        if (!os) continue;
        if (os.assignedEmployeeId !== empId && os.assignedEmployee2Id !== empId) continue;
        const hours = Number(b.horas_trabalhadas || b.horas_missao || 0);
        totalHours += hours;
        missions++;
        missionDetails.push({ osNumber: os.osNumber, date: b.data_missao, hours });
      }

      const { getCctConfigByCargo } = await import("../lib/cct-config");
      const CCT = await getCctConfigByCargo(emp.role);
      const salarioBase = Number(CCT.salarioBase) || 0;
      const periculosidade = salarioBase * (Number(CCT.periculosidadePct) / 100);
      const salarioComPeric = salarioBase + periculosidade;
      const horasContratuais = 220;
      const horasExtras = Math.max(0, totalHours - horasContratuais);
      const custoHorasExtras = horasExtras * Number(CCT.horaExtraValor);
      const dsrHorasExtras = horasExtras > 0 ? (custoHorasExtras / 6) : 0;
      const subtotalRemuneracao = salarioComPeric + custoHorasExtras + dsrHorasExtras;
      // Encargos só sobre salário+peric; HE (R$ 16/h) paga à parte — sem % em cima.
      const encargos = salarioComPeric * (Number(CCT.encargosSociaisPct) / 100);
      const valeRefeicao = Number(CCT.valeRefeicaoDia) * Number(CCT.diasUteisMes);
      const cestaBasica = Number(CCT.cestaBasica);
      const totalBeneficios = valeRefeicao + cestaBasica;
      const custoTotal = salarioComPeric * (1 + Number(CCT.encargosSociaisPct) / 100)
        + custoHorasExtras + dsrHorasExtras + totalBeneficios;

      res.json({
        employee: { id: emp.id, name: emp.name, role: emp.role },
        month, year,
        totalHours: Math.round(totalHours * 100) / 100,
        missions,
        missionDetails,
        breakdown: {
          salarioBase, periculosidade, salarioComPeric,
          horasContratuais, horasExtras: Math.round(horasExtras * 100) / 100,
          custoHorasExtras: Math.round(custoHorasExtras * 100) / 100,
          dsrHorasExtras: Math.round(dsrHorasExtras * 100) / 100,
          subtotalRemuneracao: Math.round(subtotalRemuneracao * 100) / 100,
          encargosSociaisPct: CCT.encargosSociaisPct,
          encargos: Math.round(encargos * 100) / 100,
          valeRefeicao, cestaBasica, totalBeneficios,
          custoTotal: Math.round(custoTotal * 100) / 100,
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/cpf-lookup/:cpf", requireAuth, async (req, res) => {
    const cpf = String(req.params.cpf).replace(/\D/g, "");
    if (cpf.length !== 11) return res.status(400).json({ message: "CPF inválido" });

    try {
      const response = await fetch(`https://brasilapi.com.br/api/cpf/v1/${cpf}`);
      if (response.ok) {
        const data = await response.json();
        const normalized: Record<string, string> = {};
        if (data.nome) normalized.nome = data.nome;
        if (data.data_nascimento) normalized.data_nascimento = data.data_nascimento;
        if (data.nome_mae) normalized.nome_mae = data.nome_mae;
        if (data.situacao) normalized.situacao = data.situacao;
        return res.json(normalized);
      }
    } catch {}

    return res.status(404).json({ message: "CPF não encontrado nas bases públicas. Use o Cadastro Inteligente para preencher os dados via documento." });
  });

  app.post("/api/employees/ocr", requireAdminRole, async (req, res) => {
    try {
      const payload = resolveOcrDocumentPayload(req.body || {});
      if (!payload) {
        return res.status(400).json({ message: "Envie imageBase64 (base64 cru) + mime, ou imageData (data URL)" });
      }
      const { dataUri, isPdf } = payload;

      console.log(`[ocr] Employee OCR request received, dataUri length: ${dataUri.length}, pdf=${isPdf}, user: ${req.user?.email}`);

      let messages: OpenAI.Chat.ChatCompletionCreateParams["messages"];
      if (isPdf) {
        let pdfText = "";
        try {
          const b64 = dataUri.split(",")[1] || "";
          pdfText = await extractPdfText(Buffer.from(b64, "base64"));
        } catch (pdfErr: any) {
          console.error("[ocr] PDF text extraction error:", pdfErr.message);
          return res.status(400).json({
            message: "Não foi possível ler o PDF. Envie uma foto (JPG/PNG) do documento.",
          });
        }
        if (!pdfText || pdfText.length < 20) {
          return res.status(400).json({
            message: "PDF sem texto legível (scan). Envie uma foto (JPG/PNG) do documento para preencher automaticamente.",
          });
        }
        console.log(`[ocr] PDF text extracted (${pdfText.length} chars)`);
        messages = [
          { role: "system", content: EMPLOYEE_OCR_SYSTEM },
          { role: "user", content: `Extraia os dados pessoais deste documento de identificação brasileiro. Texto extraído do PDF:\n\n${pdfText}` },
        ];
      } else {
        messages = [
          { role: "system", content: EMPLOYEE_OCR_SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os dados pessoais deste documento de identificação brasileiro:" },
              { type: "image_url", image_url: { url: dataUri } },
            ],
          },
        ];
      }

      const response = await runEmployeeOpenAI(messages);
      const text = response.choices?.[0]?.message?.content || "";
      console.log("[ocr] OpenAI raw response:", text.substring(0, 500));
      const parsed = parseOcrJson(text);
      console.log("[ocr] Parsed result:", JSON.stringify(parsed));
      res.json(parsed);
    } catch (err: any) {
      const raw = String(err?.message || "Erro desconhecido");
      console.error("[ocr] Employee OCR error:", raw);
      const friendly = /connection|ENOTFOUND|ECONN|fetch failed|timeout/i.test(raw)
        ? "Falha ao conectar na IA de OCR. Verifique OPENAI_API_KEY na Vercel."
        : raw;
      res.status(err?.statusCode || 500).json({ message: "Erro ao processar documento: " + friendly });
    }
  });

  app.post("/api/employees/ocr-document", requireAdminRole, async (req, res) => {
    try {
      const payload = resolveOcrDocumentPayload(req.body || {});
      if (!payload) {
        return res.status(400).json({ message: "Envie imageBase64 (base64 cru) + mime, ou imageData (data URL)" });
      }
      const { dataUri, isPdf } = payload;
      const docType = req.body?.docType;

      const systemPrompt = `Você é um sistema especializado em extrair dados de documentos brasileiros.
O documento sendo analisado é do tipo: "${docType || 'Documento geral'}".
Extraia os seguintes campos e retorne APENAS um JSON válido (sem markdown):
{
  "documentNumber": "número do documento (registro, matrícula, protocolo, nº CNH, etc)",
  "issueDate": "data de emissão no formato YYYY-MM-DD",
  "expiryDate": "data de validade no formato YYYY-MM-DD",
  "notes": "tipo do documento identificado e informações relevantes (nome do titular, órgão emissor, categoria CNH, etc)"
}
Se um campo não for encontrado, retorne string vazia "". Nunca invente dados.
Para datas, converta para YYYY-MM-DD. Se só houver ano, use YYYY-01-01.`;

      let messages: OpenAI.Chat.ChatCompletionCreateParams["messages"];
      if (isPdf) {
        let pdfText = "";
        try {
          const b64 = dataUri.split(",")[1] || "";
          pdfText = await extractPdfText(Buffer.from(b64, "base64"));
        } catch (pdfErr: any) {
          console.error("[ocr-document] PDF text extraction error:", pdfErr.message);
          return res.status(400).json({
            message: "Não foi possível ler o PDF. Envie uma foto (JPG/PNG) do documento.",
          });
        }
        if (!pdfText || pdfText.length < 20) {
          return res.status(400).json({
            message: "PDF sem texto legível (scan). Envie uma foto (JPG/PNG) do documento.",
          });
        }
        console.log(`[ocr-document] PDF text extracted (${pdfText.length} chars)`);
        messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extraia os dados deste documento (${docType || "documento"}). Texto extraído do PDF:\n\n${pdfText}` },
        ];
      } else {
        messages = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: `Extraia os dados deste documento (${docType || "documento"}):` },
              { type: "image_url", image_url: { url: dataUri } },
            ],
          },
        ];
      }

      const response = await runEmployeeOpenAI(messages);
      const text = response.choices?.[0]?.message?.content || "";
      console.log("[ocr-document] AI response:", text.substring(0, 300));
      res.json(parseOcrJson(text));
    } catch (err: any) {
      const raw = String(err?.message || "Erro desconhecido");
      console.error("[ocr-document] Error:", raw);
      const friendly = /connection|ENOTFOUND|ECONN|fetch failed|timeout/i.test(raw)
        ? "Falha ao conectar na IA de OCR. Verifique OPENAI_API_KEY na Vercel."
        : raw;
      res.status(err?.statusCode || 500).json({ message: "Erro ao processar documento: " + friendly });
    }
  });


  }
  