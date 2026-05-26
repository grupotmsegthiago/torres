import type { Express } from "express";
  import { storage, toCamelObj } from "../storage";
  import { supabaseAdmin } from "../supabase";
  import { requireAuth, requireAdminRole, requireDiretoria } from "../auth";
  import { insertEmployeeSchema } from "@shared/schema";
  import * as apibrasil from "../apibrasil";
  import { validateContactFields } from "../lib/normalize-contact";
  import OpenAI from "openai";
  import { calcularFolha } from "../lib/payroll";
import { autoCreateProbationContract, isVigilante } from "./probation-contracts";
import { syncEmployeeStatusToRhid, enqueueRhidSync } from "../control-id";
  import { countBusinessDays, loadHolidaySet, monthRange, payrollPeriodRange } from "./holidays";

  export function registerEmployeeRoutes(app: Express) {
    app.get("/api/employees", requireAuth, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const EMP_LIST_COLS = "id,name,role,cpf,matricula,pis,phone,email,status,hire_date,cnh_expiry,cnv_expiry,ctps_number,ctps_serie,vacation_expiry,block_type,block_reason,photo_url,created_at";

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
    const dateFields = ["birthDate", "hireDate", "vacationExpiry", "cnhExpiry", "cnvExpiry"];
    for (const f of dateFields) { if (body[f] === "") body[f] = null; }
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
    if (data.cpf) {
      const cleanCpf = data.cpf.replace(/\D/g, "");
      if (cleanCpf.length === 11) {
        const syntheticEmail = `cpf_${cleanCpf}@torresseguranca.local`;
        const existingUser = await storage.getUserByEmail(syntheticEmail);
        if (existingUser) {
          autoUserError = "Já existe um login para este CPF";
        } else {
          try {
            const defaultPassword = "torres@123";
            const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
              email: syntheticEmail,
              password: defaultPassword,
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
                  plainPassword: defaultPassword,
                });
                autoUserCreated = true;
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
    res.status(201).json({ ...data, autoUserCreated, autoUserError, probationContractId, probationContractError });
  });

  app.patch("/api/employees/:id", requireAuth, requireAdminRole, async (req, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "diretoria") return res.status(403).json({ message: "Acesso negado" });
    const body = { ...req.body };
    console.log(`[emp-debug PATCH ${req.params.id}] rg recebido:`, JSON.stringify(body.rg), "| hasRg:", "rg" in body);
    const dateFields = ["birthDate", "hireDate", "vacationExpiry", "cnhExpiry", "cnvExpiry"];
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
    const emp = await storage.getEmployee(Number(req.params.id));
    if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });
    const { baseSalary, effectiveDate, reason, notes,
            valeRefeicaoDiario, cestaBasica, valeTransporteMensal,
            beneficiosOutros, encargosPct, horasMensais,
            periculosidadePct, dependentesIr, ajudaCustoMensal } = req.body;
    if (!baseSalary || !effectiveDate) return res.status(400).json({ message: "Salário e data são obrigatórios" });
    const payload: any = {
      employeeId: emp.id,
      baseSalary: String(baseSalary),
      effectiveDate,
      reason: reason || null,
      notes: notes || null,
    };
    if (valeRefeicaoDiario !== undefined && valeRefeicaoDiario !== "") payload.valeRefeicaoDiario = String(valeRefeicaoDiario);
    if (cestaBasica !== undefined && cestaBasica !== "") payload.cestaBasica = String(cestaBasica);
    if (valeTransporteMensal !== undefined && valeTransporteMensal !== "") payload.valeTransporteMensal = String(valeTransporteMensal);
    if (beneficiosOutros !== undefined && beneficiosOutros !== "") payload.beneficiosOutros = String(beneficiosOutros);
    if (encargosPct !== undefined && encargosPct !== "") payload.encargosPct = String(encargosPct);
    if (horasMensais !== undefined && horasMensais !== "") payload.horasMensais = String(horasMensais);
    // Folha 2025
    if (periculosidadePct !== undefined && periculosidadePct !== "") payload.periculosidadePct = String(periculosidadePct);
    if (dependentesIr !== undefined && dependentesIr !== "") payload.dependentesIr = Number(dependentesIr);
    if (ajudaCustoMensal !== undefined && ajudaCustoMensal !== "") payload.ajudaCustoMensal = String(ajudaCustoMensal);
    const salary = await storage.createEmployeeSalary(payload);
    res.status(201).json(salary);
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

      // Salário vigente — preferimos o registro real (mesmo que controladoria usa)
      const { data: salRows } = await supabaseAdmin
        .from("employee_salaries").select("*").eq("employee_id", empId)
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1);
      const sal: any = salRows?.[0] || {};

      // Resolve CCT pelo cargo (vigilante→vigilancia, limpeza→siemaco).
      // Antes usava getCctConfig() fixo → Auxiliar de Limpeza herdava
      // valores de vigilância silenciosamente quando employee_salaries
      // estava vazio. Bug pego no code review de 26/05/2026.
      const { getCctConfigByCargo } = await import("../lib/cct-config");
      const CCT_FALLBACK = await getCctConfigByCargo(emp.role);
      const baseSalary = Number(sal.base_salary || CCT_FALLBACK.salarioBase);
      const periculosidadePct = Number(sal.periculosidade_pct ?? CCT_FALLBACK.periculosidadePct) / 100;
      const vrDiario = Number(sal.vale_refeicao_diario ?? CCT_FALLBACK.valeRefeicaoDia);
      const cestaMensal = Number(sal.cesta_basica ?? CCT_FALLBACK.cestaBasica);
      const vt = Number(sal.vale_transporte_mensal || 0);
      const outros = Number(sal.beneficios_outros || 0);
      const horasMensais = Number(sal.horas_mensais || 220);
      const ajudaCustoMensal = Number(sal.ajuda_custo_mensal || 0);

      // Dias úteis da competência de RH (ciclo 26 → 25) — descontando feriados.
      const { from, to } = payrollPeriodRange(year, month);
      const holidaySet = await loadHolidaySet(from, to);
      const diasUteis = countBusinessDays(from, to, holidaySet);

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

      // ===== HORAS EXTRAS / NOTURNAS automáticas do Ponto iD (Control iD) =====
      // Janela = competência de RH (26 → 25), não mês civil.
      const mesRef = `${year}-${String(month).padStart(2, "0")}`;
      const inicioMes = `${from}T00:00:00-03:00`;
      const fimMes = `${to}T23:59:59-03:00`;

      let horasExtras = 0;
      let horasNoturnas = 0;
      let horasFonte: "ponto_operacional" | "jornada_calculos" | "nenhuma" = "nenhuma";
      let registrosPonto = 0;

      // 1ª fonte: ponto_operacional (Ponto iD oficial)
      const { data: pontos } = await supabaseAdmin.from("ponto_operacional")
        .select("horas_extras, horas_noturno")
        .eq("employee_id", empId)
        .gte("entrada", inicioMes).lte("entrada", fimMes);
      if (pontos && pontos.length > 0) {
        for (const p of pontos) {
          horasExtras += Number((p as any).horas_extras || 0);
          horasNoturnas += Number((p as any).horas_noturno || 0);
        }
        horasFonte = "ponto_operacional";
        registrosPonto = pontos.length;
      } else {
        // 2ª fonte: jornada_calculos (lançamentos manuais da diretoria)
        const { data: jorn } = await supabaseAdmin.from("jornada_calculos")
          .select("horas_extras, horas_noturnas")
          .eq("employee_id", empId).eq("mes_referencia", mesRef);
        if (jorn && jorn.length > 0) {
          for (const j of jorn) {
            horasExtras += Number((j as any).horas_extras || 0);
            horasNoturnas += Number((j as any).horas_noturnas || 0);
          }
          horasFonte = "jornada_calculos";
          registrosPonto = jorn.length;
        }
      }
      horasExtras = Math.round(horasExtras * 100) / 100;
      horasNoturnas = Math.round(horasNoturnas * 100) / 100;

      // ===== ENGINE DE FOLHA 2025 (mesmo padrão do custo fixo) =====
      const folha = calcularFolha({
        salarioBaseCheio: baseSalary,
        diasTrabalhados,
        horasMensais,
        periculosidadePct,
        horasExtras,
        horasNoturnas,
        diasUteis,
        refeicaoDiaria: vrDiario,
        ajudaCustoMensal,
        dependentesIR,
      });

      // Vencimentos visíveis (CLT — base + peric + HE + DSR + adic + benefícios)
      const totalVencimentos = +(folha.totalBruto + cestaMensal + vt + outros).toFixed(2);

      // Descontos manuais (ocorrências) + descontos legais (INSS + IRRF)
      const { data: discounts } = await supabaseAdmin.from("employee_salary_discounts").select("*")
        .eq("employee_id", empId).eq("month", month).eq("year", year);
      const totalDescontosManuais = (discounts || []).reduce((sum: number, d: any) => sum + Number(d.amount), 0);
      const totalDeducoesLegais = +(folha.inss + folha.irrf).toFixed(2);
      const liquido = +(totalVencimentos - totalDescontosManuais - totalDeducoesLegais).toFixed(2);

      // Custo total para a empresa (idêntico ao fixed-costs)
      const custoTotalEmpresa = +(folha.custoTotalEmpresa + cestaMensal + vt + outros).toFixed(2);

      res.json({
        employee: { id: emp.id, name: emp.name, matricula: emp.matricula, role: emp.role, hireDate: emp.hireDate, cpf: emp.cpf },
        month, year, proporcional, diasTrabalhados, fatorProporcional, diasUteis,
        // ► Mantém compat com UI atual + enriquece com engine
        vencimentos: {
          salarioBase: folha.salarioProporcional,
          periculosidade: folha.periculosidade,
          horasExtrasValor: folha.horasExtrasValor,
          adicionalNoturnoValor: folha.adicionalNoturnoValor,
          dsr: folha.dsr,
          valeRefeicao: folha.refeicao,
          cestaBasica: cestaMensal,
          valeTransporte: vt,
          ajudaCusto: folha.ajudaCusto,
          outros,
          total: totalVencimentos,
          baseTributavel: folha.baseTributavel,
          totalBruto: folha.totalBruto,
        },
        // ► Horas extras auto via Ponto iD
        horasExtras: {
          horas: horasExtras,
          noturnas: horasNoturnas,
          valor: folha.horasExtrasValor,
          dsrValor: folha.dsr,
          fonte: horasFonte,
          registros: registrosPonto,
          mesRef,
        },
        // ► Deduções legais (INSS / IRRF / FGTS)
        deducoesLegais: {
          inss: folha.inss,
          irrf: folha.irrf,
          fgts: folha.fgts,
          dependentesIR,
          total: totalDeducoesLegais,
        },
        // ► Provisões mensais (custo da empresa)
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

      const CCT = { salarioBase: 2432.50, periculosidadePct: 30, valeRefeicaoDia: 40.00, cestaBasica: 208.45, diasUteisMes: 22 };
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
      const reason = `Kit ${CCT.label} (Base R$${CCT.salarioBase.toFixed(2)} + Periculosidade ${CCT.periculosidadePct}% R$${periculosidade.toFixed(2)} + VR R$${CCT.valeRefeicaoDia}/dia + Cesta R$${CCT.cestaBasica})`;
      const notes = `Pgto ${CCT.pagamentoDiaUtil}º dia útil | Periculosidade: R$${periculosidade.toFixed(2)} | VR: R$${(CCT.valeRefeicaoDia * CCT.diasUteisMes).toFixed(2)}/mês | Cesta: R$${CCT.cestaBasica}`;

      const sal = await storage.createEmployeeSalary({
        employeeId: empId,
        baseSalary: String(CCT.salarioBase),
        valeRefeicaoDiario: String(CCT.valeRefeicaoDia),
        cestaBasica: String(CCT.cestaBasica),
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
      const reason = `Kit CCT SP 2025/2026 (Base R$${CCT.salarioBase.toFixed(2)} + Periculosidade ${CCT.periculosidadePct}% R$${(CCT.salarioBase * CCT.periculosidadePct / 100).toFixed(2)} + VR R$${CCT.valeRefeicaoDia}/dia + Cesta R$${CCT.cestaBasica})`;
      let count = 0;
      for (const emp of vigilantes) {
        await storage.createEmployeeSalary({
          employeeId: emp.id,
          baseSalary: String(CCT.salarioBase),
          effectiveDate,
          reason,
          notes: `Pgto 5º dia útil | Periculosidade: R$${(CCT.salarioBase * CCT.periculosidadePct / 100).toFixed(2)} | VR: R$${(CCT.valeRefeicaoDia * CCT.diasUteisMes).toFixed(2)}/mês | Cesta: R$${CCT.cestaBasica}`,
        });
        count++;
      }
      res.json({ message: `Kit CCT aplicado para ${count} vigilante(s)`, count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const CCT_CONFIG = {
    salarioBase: 2432.50, periculosidadePct: 30, valeRefeicaoDia: 40.00,
    cestaBasica: 208.45, diasUteisMes: 22, encargosSociaisPct: 80,
    horaExtraValor: 22.99,
  };

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

      const salarioBase = CCT_CONFIG.salarioBase;
      const periculosidade = salarioBase * (CCT_CONFIG.periculosidadePct / 100);
      const salarioComPeric = salarioBase + periculosidade;
      const horasContratuais = 220;
      const horasExtras = Math.max(0, totalHours - horasContratuais);
      const custoHorasExtras = horasExtras * CCT_CONFIG.horaExtraValor;
      const dsrHorasExtras = horasExtras > 0 ? (custoHorasExtras / 6) : 0;
      const subtotalRemuneracao = salarioComPeric + custoHorasExtras + dsrHorasExtras;
      const encargos = subtotalRemuneracao * (CCT_CONFIG.encargosSociaisPct / 100);
      const valeRefeicao = CCT_CONFIG.valeRefeicaoDia * CCT_CONFIG.diasUteisMes;
      const cestaBasica = CCT_CONFIG.cestaBasica;
      const totalBeneficios = valeRefeicao + cestaBasica;
      const custoTotal = subtotalRemuneracao + encargos + totalBeneficios;

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
          encargosSociaisPct: CCT_CONFIG.encargosSociaisPct,
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
      const { imageData } = req.body;
      if (!imageData || typeof imageData !== "string") {
        return res.status(400).json({ message: "Envie imageData (base64 data URL da imagem)" });
      }

      console.log(`[ocr] Employee OCR request received, imageData length: ${imageData.length}, user: ${req.user?.email}`);

      const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

      if (!apiKey) {
        console.error("[ocr] AI_INTEGRATIONS_OPENAI_API_KEY not set");
        return res.status(500).json({ message: "Chave de API de IA não configurada" });
      }

      const openai = new OpenAI({ apiKey, baseURL });

      console.log("[ocr] Sending to OpenAI...");
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `Você é um sistema especializado em extrair dados de documentos brasileiros de identificação pessoal (RG, CNH, CPF, CNV, CTPS, Certificado de Reservista, comprovantes de residência, etc).
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
Para endereço: quebre o endereço completo em logradouro, número, complemento, bairro, cidade, UF e CEP em campos separados. Não duplique o número ou bairro no campo "address".`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os dados pessoais deste documento de identificação brasileiro:" },
              { type: "image_url", image_url: { url: imageData } },
            ],
          },
        ],
      });

      const text = response.choices?.[0]?.message?.content || "";
      console.log("[ocr] OpenAI raw response:", text.substring(0, 500));
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      console.log("[ocr] Parsed result:", JSON.stringify(parsed));
      res.json(parsed);
    } catch (err: any) {
      console.error("[ocr] Employee OCR error:", err.message || err);
      res.status(500).json({ message: "Erro ao processar documento: " + (err.message || "Erro desconhecido") });
    }
  });

  app.post("/api/employees/ocr-document", requireAdminRole, async (req, res) => {
    try {
      const { imageData, docType } = req.body;
      if (!imageData || typeof imageData !== "string") {
        return res.status(400).json({ message: "Envie imageData (base64 data URL)" });
      }

      const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
      if (!apiKey) return res.status(500).json({ message: "Chave de API de IA não configurada" });

      const openai = new OpenAI({ apiKey, baseURL });

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

      const isPdf = imageData.startsWith("data:application/pdf");
      let messages: any[];

      if (isPdf) {
        const base64Content = imageData.split(",")[1];
        const pdfBuffer = Buffer.from(base64Content, "base64");

        let pdfText = "";
        try {
          const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
          const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
          const numPages = Math.min(doc.numPages, 3);
          for (let i = 1; i <= numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            pdfText += content.items.map((item: any) => item.str).join(" ") + "\n";
          }
        } catch (pdfErr: any) {
          console.error("[ocr-document] PDF text extraction error:", pdfErr.message);
          pdfText = "Não foi possível extrair texto do PDF";
        }

        console.log(`[ocr-document] PDF text extracted (${pdfText.length} chars): ${pdfText.substring(0, 300)}...`);

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
              { type: "image_url", image_url: { url: imageData } },
            ],
          },
        ];
      }

      const response = await openai.chat.completions.create({
        model: isPdf ? "gpt-5-mini" : "gpt-5-mini",
        messages,
      });

      const text = response.choices?.[0]?.message?.content || "";
      console.log("[ocr-document] AI response:", text.substring(0, 300));
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      res.json(parsed);
    } catch (err: any) {
      console.error("[ocr-document] Error:", err.message || err);
      res.status(500).json({ message: "Erro ao processar documento" });
    }
  });


  }
  