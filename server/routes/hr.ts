import type { Express } from "express";
  import { randomBytes } from "crypto";
  import { storage, toCamelObj, toCamelArray, toSnakeObj } from "../storage";
  import { supabaseAdmin } from "../supabase";
  import { requireAuth, requireAdminRole, requireDiretoria } from "../auth";
  import { logSystemAudit } from "../audit";
  import { insertEmployeeDocumentSchema } from "@shared/schema";
  import * as apibrasil from "../apibrasil";
  import OpenAI from "openai";
  import { createSmtpTransporter, getSmtpFrom, toSafeUser } from "./_helpers";

  export function registerHRRoutes(app: Express) {
    // ====================== AUDIT LOG ======================

  app.post("/api/audit-log", requireAuth, async (req, res) => {
    const user = req.user!;
    const { action, page, details, latitude, longitude } = req.body;
    if (!action) return res.status(400).json({ message: "action obrigatória" });
    const ipAddress = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || null;
    const userAgent = req.headers["user-agent"] || null;
    await supabaseAdmin.from("audit_logs").insert({
      user_id: user.id,
      user_name: user.name || user.username || "—",
      user_role: user.role || "—",
      action,
      page: page || null,
      details: details || null,
      ip_address: ipAddress,
      user_agent: userAgent,
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
    });

    const securityActions = ["screenshot_attempt", "tab_hidden", "window_blur"];
    if (securityActions.includes(action) && latitude && longitude && user.employeeId) {
      try {
        const emp = await storage.getEmployee(user.employeeId);
        if (emp && emp.addressLat && emp.addressLng) {
          const dlat = (Number(latitude) - Number(emp.addressLat)) * 111320;
          const dlng = (Number(longitude) - Number(emp.addressLng)) * 111320 * Math.cos(Number(emp.addressLat) * Math.PI / 180);
          const distMeters = Math.sqrt(dlat * dlat + dlng * dlng);
          if (distMeters <= 500) {
            const actionLabels: Record<string, string> = {
              screenshot_attempt: "Captura de Tela (Print Screen)",
              tab_hidden: "Aba Oculta (troca de app/print)",
              window_blur: "Perda de Foco (possível captura)",
            };
            const timeStr = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
            const html = `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <div style="background:#0f172a;padding:20px 24px;border-radius:8px 8px 0 0">
                  <h2 style="color:#fff;margin:0;font-size:18px">⚠️ ALERTA DE SEGURANÇA — Torres Vigilância</h2>
                </div>
                <div style="background:#fff;border:1px solid #e2e8f0;padding:24px;border-radius:0 0 8px 8px">
                  <p style="color:#dc2626;font-weight:bold;font-size:15px;margin:0 0 16px">
                    Evento de segurança detectado na RESIDÊNCIA do funcionário
                  </p>
                  <table style="width:100%;border-collapse:collapse;font-size:14px">
                    <tr><td style="padding:8px 0;color:#64748b;width:140px">Funcionário:</td><td style="padding:8px 0;font-weight:bold">${emp.fullName || emp.name}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">CPF:</td><td style="padding:8px 0">${emp.cpf || "—"}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Evento:</td><td style="padding:8px 0;color:#dc2626;font-weight:bold">${actionLabels[action] || action}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Página:</td><td style="padding:8px 0">${page || "—"}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Data/Hora:</td><td style="padding:8px 0">${timeStr}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">GPS Evento:</td><td style="padding:8px 0">${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">GPS Residência:</td><td style="padding:8px 0">${Number(emp.addressLat).toFixed(6)}, ${Number(emp.addressLng).toFixed(6)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Distância:</td><td style="padding:8px 0;font-weight:bold">${Math.round(distMeters)} metros</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Endereço:</td><td style="padding:8px 0">${emp.address || "—"}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">IP:</td><td style="padding:8px 0;font-size:12px">${ipAddress || "—"}</td></tr>
                  </table>
                  <div style="margin-top:20px;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px">
                    <p style="margin:0;font-size:13px;color:#991b1b">
                      Este alerta indica que o funcionário realizou uma ação suspeita enquanto estava
                      na proximidade de sua residência cadastrada (raio de 500m).
                    </p>
                  </div>
                </div>
                <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:16px">
                  Torres Vigilância Patrimonial — Sistema de Auditoria Automatizada
                </p>
              </div>
            `;
            const auditTransporter = createSmtpTransporter();
            if (auditTransporter) {
              auditTransporter.sendMail({
                from: getSmtpFrom(),
                to: "thiago@grupotmseg.com.br",
                subject: `⚠️ ALERTA: ${actionLabels[action] || action} na residência — ${emp.fullName || emp.name}`,
                html,
              }).catch((err: any) => console.error("[audit-alert] Erro ao enviar email:", err.message));
            }
          }
        }
      } catch (err: any) {
        console.error("[audit-alert] Erro na verificação de proximidade:", err.message);
      }
    }

    res.json({ ok: true });
  });

  app.get("/api/audit-logs", requireAuth, requireAdminRole, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const action = req.query.action ? String(req.query.action) : null;
    const search = req.query.search ? String(req.query.search) : null;
    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : null;
    const dateTo = req.query.dateTo ? String(req.query.dateTo) : null;
    const securityOnly = req.query.securityOnly === "true";

    let query = supabaseAdmin.from("audit_logs").select("*", { count: "exact" });
    if (userId) query = query.eq("user_id", userId);
    if (action) query = query.eq("action", action);
    if (search) query = query.or(`details.ilike.%${search}%,user_name.ilike.%${search}%,page.ilike.%${search}%`);
    if (dateFrom) query = query.gte("created_at", new Date(dateFrom).toISOString());
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      query = query.lte("created_at", endDate.toISOString());
    }
    if (securityOnly) query = query.in("action", ["screenshot_attempt", "tab_hidden", "window_blur", "context_menu"]);

    const { data: rows, count } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    res.json({ logs: toCamelArray(rows || []), total: count || 0 });
  });

  app.get("/api/audit-logs/stats", requireAuth, requireAdminRole, async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalRes, todayRes, securityRes] = await Promise.all([
      supabaseAdmin.from("audit_logs").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("audit_logs").select("*", { count: "exact", head: true }).gte("created_at", today.toISOString()),
      supabaseAdmin.from("audit_logs").select("*", { count: "exact", head: true }).in("action", ["screenshot_attempt", "tab_hidden", "window_blur", "context_menu"]),
    ]);

    const { data: allLogs } = await supabaseAdmin.from("audit_logs").select("user_id, user_name, action").limit(5000);
    const userMap: Record<string, { userId: number; userName: string; count: number }> = {};
    const actionMap: Record<string, number> = {};
    for (const l of (allLogs || [])) {
      const key = `${l.user_id}`;
      if (!userMap[key]) userMap[key] = { userId: l.user_id, userName: l.user_name, count: 0 };
      userMap[key].count++;
      actionMap[l.action] = (actionMap[l.action] || 0) + 1;
    }
    const topUsers = Object.values(userMap).sort((a, b) => b.count - a.count).slice(0, 10);
    const actionCounts = Object.entries(actionMap).map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count);

    res.json({
      total: totalRes.count || 0,
      today: todayRes.count || 0,
      securityAlerts: securityRes.count || 0,
      topUsers,
      actionCounts,
    });
  });

  // ====================== HR MOBILE (próprio funcionário) ======================

  app.get("/api/my/hr-summary", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.status(403).json({ message: "Usuário não é funcionário" });
    const empId = user.employeeId;

    const [absRes, fineRes, tsRes, psRes, discRes] = await Promise.all([
      supabaseAdmin.from("employee_absences").select("*").eq("employee_id", empId).order("start_date", { ascending: false }),
      supabaseAdmin.from("employee_fines").select("*").eq("employee_id", empId).order("date", { ascending: false }),
      supabaseAdmin.from("employee_timesheets").select("*").eq("employee_id", empId).order("date", { ascending: false }),
      supabaseAdmin.from("employee_payslips").select("*").eq("employee_id", empId).order("year", { ascending: false }).order("month", { ascending: false }),
      supabaseAdmin.from("employee_disciplinary").select("*").eq("employee_id", empId).order("date", { ascending: false }),
    ]);

    res.json({ absences: toCamelArray(absRes.data || []), fines: toCamelArray(fineRes.data || []), timesheets: toCamelArray(tsRes.data || []), payslips: toCamelArray(psRes.data || []), disciplinary: toCamelArray(discRes.data || []) });
  });

  // ====================== HR: FALTAS/ATESTADOS ======================

  app.get("/api/employees/:id/absences", requireAuth, requireAdminRole, async (req, res) => {
    const employeeId = Number(req.params.id);
    const { data: rows } = await supabaseAdmin.from("employee_absences").select("*").eq("employee_id", employeeId).order("start_date", { ascending: false });
    res.json(toCamelArray(rows || []));
  });

  app.post("/api/employees/:id/absences", requireAuth, requireAdminRole, async (req, res) => {
    const employeeId = Number(req.params.id);
    const data = toSnakeObj({ ...req.body, employeeId });
    const { data: row } = await supabaseAdmin.from("employee_absences").insert(data).select().single();
    res.status(201).json(toCamelObj(row));
  });

  app.delete("/api/absences/:id", requireAuth, requireDiretoria, async (req, res) => {
    await supabaseAdmin.from("employee_absences").delete().eq("id", Number(req.params.id));
    res.json({ ok: true });
  });

  // ====================== HR: MULTAS ======================

  app.get("/api/employees/:id/fines", requireAuth, requireAdminRole, async (req, res) => {
    const employeeId = Number(req.params.id);
    const { data: rows } = await supabaseAdmin.from("employee_fines").select("*").eq("employee_id", employeeId).order("date", { ascending: false });
    res.json(toCamelArray(rows || []));
  });

  app.post("/api/employees/:id/fines", requireAuth, requireAdminRole, async (req, res) => {
    const employeeId = Number(req.params.id);
    const data = toSnakeObj({ ...req.body, employeeId, vehicleId: req.body.vehicleId ? Number(req.body.vehicleId) : null });
    const { data: row } = await supabaseAdmin.from("employee_fines").insert(data).select().single();
    res.status(201).json(toCamelObj(row));
  });

  app.delete("/api/fines/:id", requireAuth, requireDiretoria, async (req, res) => {
    await supabaseAdmin.from("employee_fines").delete().eq("id", Number(req.params.id));
    res.json({ ok: true });
  });

  // ====================== HR: DISCIPLINAR ======================

  app.get("/api/employees/:id/disciplinary", requireAuth, requireAdminRole, async (req, res) => {
    const employeeId = Number(req.params.id);
    const { data: rows } = await supabaseAdmin.from("employee_disciplinary").select("*").eq("employee_id", employeeId).order("date", { ascending: false });
    res.json(toCamelArray(rows || []));
  });

  app.post("/api/employees/:id/disciplinary", requireAuth, requireAdminRole, async (req, res) => {
    const employeeId = Number(req.params.id);
    const allowedTypes = ["Advertência", "Suspensão"];
    const allowedStatuses = ["ativa", "cumprida", "revogada"];
    const { type, date, reason, description, status } = req.body;

    if (!type || !allowedTypes.includes(type)) {
      return res.status(400).json({ message: "Tipo inválido. Use: Advertência ou Suspensão" });
    }
    if (!date) {
      return res.status(400).json({ message: "Data é obrigatória" });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: "Motivo é obrigatório" });
    }
    const finalStatus = status && allowedStatuses.includes(status) ? status : "ativa";

    const data = { employee_id: employeeId, type, date, reason: reason.trim(), description: description?.trim() || null, status: finalStatus };
    const { data: row } = await supabaseAdmin.from("employee_disciplinary").insert(data).select().single();
    res.status(201).json(toCamelObj(row));
  });

  app.delete("/api/disciplinary/:id", requireAuth, requireDiretoria, async (req, res) => {
    await supabaseAdmin.from("employee_disciplinary").delete().eq("id", Number(req.params.id));
    res.json({ ok: true });
  });

  // ====================== HR: FOLHA DE PONTO ======================

  app.get("/api/employees/:id/timesheets", requireAuth, requireAdminRole, async (req, res) => {
    const employeeId = Number(req.params.id);
    const { data: rows } = await supabaseAdmin.from("employee_timesheets").select("*").eq("employee_id", employeeId).order("date", { ascending: false });
    res.json(toCamelArray(rows || []));
  });

  app.post("/api/employees/:id/timesheets", requireAuth, requireAdminRole, async (req, res) => {
    const employeeId = Number(req.params.id);
    const data = toSnakeObj({ ...req.body, employeeId });
    const { data: row } = await supabaseAdmin.from("employee_timesheets").insert(data).select().single();
    res.status(201).json(toCamelObj(row));
  });

  app.get("/api/employees/:id/folha-ponto-excel", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const XLSX = await import("xlsx");
      const employeeId = Number(req.params.id);
      const month = Number(req.query.month) || new Date().getMonth() + 1;
      const year = Number(req.query.year) || new Date().getFullYear();

      const employee = await storage.getEmployee(employeeId);
      if (!employee) return res.status(404).json({ message: "Funcionário não encontrado" });

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      const daysInMonth = endDate.getDate();

      const { data: timesheetRowsRaw } = await supabaseAdmin.from("employee_timesheets").select("*")
        .eq("employee_id", employeeId)
        .gte("date", startDate.toISOString())
        .lte("date", endDate.toISOString())
        .order("date", { ascending: true });
      const timesheetRows = toCamelArray(timesheetRowsRaw || []);

      const { data: absenceRowsRaw } = await supabaseAdmin.from("employee_absences").select("*")
        .eq("employee_id", employeeId)
        .gte("start_date", startDate.toISOString())
        .lte("start_date", endDate.toISOString());
      const absenceRows = toCamelArray(absenceRowsRaw || []);

      const { data: discRowsRaw } = await supabaseAdmin.from("employee_disciplinary").select("*")
        .eq("employee_id", employeeId)
        .gte("date", startDate.toISOString())
        .lte("date", endDate.toISOString());
      const discRows = toCamelArray(discRowsRaw || []);

      const tsMap = new Map<string, any>();
      for (const ts of timesheetRows) {
        const d = new Date(ts.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        tsMap.set(key, ts);
      }

      const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      const DAYS_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

      const wb = XLSX.utils.book_new();
      const rows: any[][] = [];

      rows.push(["", "", "", "", "EMPRESA:", "", "GRUPO TORRES PATRIMONIAL", "", "", "", "", "", "", "", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
      rows.push(["", "", "", "", "ENDEREÇO:", "", "", "", "", "", "", "", "", "Ficha Individual - Art 74/3 CLT", ""]);
      rows.push(["", "", "", "", "BAIRRO:", "", "", "", "", "", "", "", "", "Portaria Nº 3082 de 11/04/98", ""]);
      rows.push(["", "", "", "", `CODIGO: ${employee.matricula}`, "", employee.name, "", "", "", "", employee.role?.toUpperCase() || "VIGILANTE DE ESCOLTA ARMADA", "", "", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", `MÊS: ${MONTHS_PT[month - 1].toUpperCase()} / ${year}`, ""]);
      rows.push(["", "", "", "", `CARGO: ${employee.role?.toUpperCase() || "VIGILANTE DE ESCOLTA ARMADA"}`, "", "", "", "", "", "", "", "", "", ""]);
      rows.push(["", "", "", "", `DEPTO/ SETOR/ SEÇÃO: 0001/ 0002 / 0000`, "", "", "", "", "", "", "", "", "", ""]);
      rows.push([]);

      rows.push([
        "DATA", "", "DIA", "TIPO", "ENTRADA", "SAÍDA ALM.", "RETORNO ALM.", "SAÍDA", "PERNOITE", "HORAS DESC.", "TOTAL HORAS", "DIÁRIA", "AD. NOT.", "ASS. FUNCIONÁRIO", "OBSERVAÇÕES"
      ]);

      let totalOvertime = 0;
      let totalDays = 0;
      let folgaCount = 0;

      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month - 1, day);
        const dayStr = DAYS_PT[d.getDay()];
        const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const ts = tsMap.get(dateKey);

        const isSunday = d.getDay() === 0;
        let tipo = "";

        if (ts) {
          totalDays++;
          if (ts.overtime) totalOvertime += Number(ts.overtime);
          tipo = "ESCOLTA";
        } else if (isSunday) {
          tipo = "FOLGA";
          folgaCount++;
        }

        rows.push([
          `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
          "",
          dayStr,
          tipo,
          ts?.clockIn || "",
          ts?.lunchOut || "",
          ts?.lunchIn || "",
          ts?.clockOut || "",
          "",
          "",
          ts?.overtime ? `${ts.overtime}h` : "",
          "",
          "",
          "",
          ts?.notes || ""
        ]);
      }

      rows.push([]);
      rows.push(["TOTAL", "", "", "", "", "", "", "", "", "", `${totalOvertime}h`, "", "", "", ""]);
      rows.push([]);

      const justificadas = absenceRows.filter(a => a.status === "aprovado").length;
      const naoJustificadas = absenceRows.filter(a => a.status !== "aprovado").length;
      const suspensoes = discRows.filter(d => d.type === "Suspensão").length;
      const advertencias = discRows.filter(d => d.type === "Advertência").length;

      rows.push(["FALTAS", "", "", absenceRows.length, "", `JUSTIFICADAS: ${justificadas}`, "", "", `NÃO JUSTIFICADAS: ${naoJustificadas}`, "", "", "", "", "", ""]);
      rows.push([]);
      rows.push(["FOLGAS", "", "", folgaCount, "", "SUSPENSÃO", "", "", suspensoes, "", "ADVERTÊNCIA", "", "", advertencias, ""]);
      rows.push([]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "ASSINATURA COLABORADOR", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "____________________________", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", employee.name, ""]);
      rows.push([]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "VISTO SUPERVISOR OPERACIONAL", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "____________________________", ""]);
      rows.push([]);
      rows.push(["Hora Extra 60%", "", "", "", "", "", "", "", totalOvertime, "", "", "", "", "", ""]);
      rows.push(["Diárias", "", "", "", "", "", "", "", totalDays, "", "", "", "", "", ""]);

      const ws = XLSX.utils.aoa_to_sheet(rows);

      ws["!cols"] = [
        { wch: 14 }, { wch: 2 }, { wch: 5 }, { wch: 10 },
        { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
        { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 8 },
        { wch: 8 }, { wch: 30 }, { wch: 20 }
      ];

      ws["!merges"] = [
        { s: { r: 0, c: 6 }, e: { r: 0, c: 10 } },
        { s: { r: 4, c: 6 }, e: { r: 4, c: 10 } },
      ];

      XLSX.utils.book_append_sheet(wb, ws, `PONTO ${MONTHS_PT[month - 1].toUpperCase()}`);

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const filename = `Folha_Ponto_${employee.name.replace(/\s+/g, "_")}_${MONTHS_PT[month - 1]}_${year}.xlsx`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(Buffer.from(buf));
    } catch (err: any) {
      console.error("[folha-ponto-excel]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ====================== HR: HOLERITES ======================

  app.get("/api/employees/:id/payslips", requireAuth, requireAdminRole, async (req, res) => {
    const employeeId = Number(req.params.id);
    const { data: rowsRaw } = await supabaseAdmin.from("employee_payslips").select("*").eq("employee_id", employeeId).order("year", { ascending: false }).order("month", { ascending: false });
    const rows = toCamelArray(rowsRaw || []);
    res.json(rows);
  });

  app.get("/api/payslips", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const month = req.query.month ? Number(req.query.month) : undefined;
      const year = req.query.year ? Number(req.query.year) : undefined;
      let query = supabaseAdmin.from("employee_payslips").select("*");
      if (month) query = query.eq("month", month);
      if (year) query = query.eq("year", year);
      const { data: rowsRaw2 } = await query.order("year", { ascending: false }).order("month", { ascending: false }).order("id", { ascending: false });
      const rows = toCamelArray(rowsRaw2 || []);
      const allEmps = await storage.getEmployees();
      const enriched = rows.map((r: any) => {
        const emp = allEmps.find((e: any) => e.id === r.employeeId);
        return { ...r, employeeName: emp?.name || "—", employeeRole: emp?.role || "" };
      });
      res.json(enriched);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/payslips/suggestion", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const employeeId = Number(req.query.employeeId);
      const month = Number(req.query.month);
      const year = Number(req.query.year);
      if (!employeeId || !month || !year) return res.status(400).json({ message: "employeeId, month, year required" });

      const emp = (await storage.getEmployees()).find((e: any) => e.id === employeeId);
      if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });

      const CCT = { salarioBase: 2432.50, periculosidadePct: 30 };
      const salarioBase = CCT.salarioBase;
      const periculosidade = +(salarioBase * (CCT.periculosidadePct / 100)).toFixed(2);

      const { data: timesheets } = await supabaseAdmin.from("employee_timesheets")
        .select("*").eq("employee_id", employeeId);
      const monthTimesheets = (timesheets || []).filter((t: any) => {
        const d = new Date(t.date);
        return d.getMonth() + 1 === month && d.getFullYear() === year;
      });
      const totalOvertime = monthTimesheets.reduce((s: number, t: any) => s + (Number(t.overtime) || 0), 0);
      const horasExtrasValor = +(totalOvertime * (salarioBase / 220) * 1.5).toFixed(2);

      let adicionalNoturno = 0;
      for (const ts of monthTimesheets) {
        if (!ts.clock_in || !ts.clock_out) continue;
        const cin = ts.clock_in.split(":").map(Number);
        const cout = ts.clock_out.split(":").map(Number);
        const cinMinutes = cin[0] * 60 + (cin[1] || 0);
        const coutMinutes = cout[0] * 60 + (cout[1] || 0);
        let nightMinutes = 0;
        const nightStart = 22 * 60, nightEnd = 5 * 60;
        if (coutMinutes < cinMinutes) {
          if (cinMinutes >= nightStart) nightMinutes += (24 * 60 - cinMinutes);
          nightMinutes += Math.min(coutMinutes, nightEnd);
        } else {
          if (cinMinutes < nightEnd) nightMinutes += Math.min(coutMinutes, nightEnd) - cinMinutes;
          if (coutMinutes > nightStart) nightMinutes += coutMinutes - Math.max(cinMinutes, nightStart);
        }
        adicionalNoturno += (nightMinutes / 60) * (salarioBase / 220) * 0.2;
      }
      adicionalNoturno = +adicionalNoturno.toFixed(2);

      const { data: discountsRaw } = await supabaseAdmin.from("employee_salary_discounts").select("*")
        .eq("employee_id", employeeId).eq("month", month).eq("year", year);
      const discounts = toCamelArray(discountsRaw || []);
      const totalDescontos = +discounts.reduce((s: number, d: any) => s + Number(d.amount), 0).toFixed(2);

      const { data: missions } = await supabaseAdmin.from("service_orders")
        .select("id, scheduled_date, completed_date, employee1_id, employee2_id")
        .or(`employee1_id.eq.${employeeId},employee2_id.eq.${employeeId}`);
      const monthMissions = (missions || []).filter((m: any) => {
        const d = new Date(m.scheduled_date || m.completed_date);
        return d.getMonth() + 1 === month && d.getFullYear() === year;
      });

      res.json({
        salarioBase,
        periculosidade,
        horasExtras: horasExtrasValor,
        horasExtrasHoras: +totalOvertime.toFixed(1),
        adicionalNoturno,
        descontos: totalDescontos,
        discountsDetail: discounts,
        diasTrabalhados: monthTimesheets.length,
        missoes: monthMissions.length,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/employees/:id/payslips", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const employeeId = Number(req.params.id);
      const body = req.body;
      const salarioBase = Number(body.salarioBase) || 0;
      const horasExtras = Number(body.horasExtras) || 0;
      const adicionalNoturno = Number(body.adicionalNoturno) || 0;
      const periculosidade = Number(body.periculosidade) || 0;
      const beneficios = Number(body.beneficios) || 0;
      const descontos = Number(body.descontos) || 0;
      const grossSalary = +(salarioBase + horasExtras + adicionalNoturno + periculosidade + beneficios).toFixed(2);
      const netSalary = +(grossSalary - descontos).toFixed(2);

      const data = {
        employeeId,
        month: Number(body.month),
        year: Number(body.year),
        salarioBase, horasExtras, adicionalNoturno, periculosidade, beneficios, descontos,
        grossSalary, netSalary,
        deductions: descontos, benefits: beneficios,
        status: body.status || "pendente",
        dataPagamento: body.dataPagamento || null,
        documentUrl: body.documentUrl || null,
        notes: body.notes || null,
      };

      const { data: row } = await supabaseAdmin.from("employee_payslips").insert(toSnakeObj(data)).select().single();

      if (data.status === "pago") {
        const emp = (await storage.getEmployees()).find((e: any) => e.id === employeeId);
        const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
        const mesLabel = MESES[data.month - 1];
        const originId = `holerite-${row.id}`;
        const tx = await createAutoTransaction({
          description: `HOLERITE - ${emp?.name?.toUpperCase()} - ${mesLabel.toUpperCase()}/${data.year}`,
          amount: Math.max(0, netSalary),
          type: "EXPENSE",
          due_date: data.dataPagamento || `${data.year}-${String(data.month).padStart(2, "0")}-05`,
          origin_type: "holerite",
          origin_id: originId,
          category_name: "Recursos Humanos",
          entity_name: emp?.name || "",
          created_by: req.user!.name || req.user!.username || "SISTEMA",
        });
        if (tx) {
          await supabaseAdmin.from("employee_payslips").update({ financial_transaction_id: tx.id }).eq("id", row.id);
          row.financial_transaction_id = tx.id;
        }
      }

      await logSystemAudit({
        userId: req.user!.id, userName: req.user!.name || req.user!.username,
        userRole: req.user!.role, action: "CRIAR_HOLERITE",
        details: `Holerite criado para funcionário #${employeeId} - ${body.month}/${body.year} - Líquido: R$ ${netSalary}`,
      });

      res.status(201).json(row);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/payslips/:id", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { data: existingRows } = await supabaseAdmin.from("employee_payslips").select("*").eq("id", id).limit(1);
      if (!existingRows?.length) return res.status(404).json({ message: "Holerite não encontrado" });
      const existing = toCamelObj<any>(existingRows[0]);

      const body = req.body;
      const updates: any = {};
      if (body.status !== undefined) updates.status = body.status;
      if (body.dataPagamento !== undefined) updates.data_pagamento = body.dataPagamento;
      if (body.documentUrl !== undefined) updates.document_url = body.documentUrl;
      if (body.notes !== undefined) updates.notes = body.notes;

      if (body.status === "pago" && existing.status !== "pago") {
        const emp = (await storage.getEmployees()).find((e: any) => e.id === existing.employeeId);
        const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
        const mesLabel = MESES[(existing.month || 1) - 1];
        const netSalary = Number(existing.netSalary) || 0;
        const originId = `holerite-${id}`;

        const { data: existingTx } = await supabaseAdmin.from("financial_transactions")
          .select("id").eq("origin_type", "holerite").eq("origin_id", originId).limit(1);
        if (!existingTx?.length) {
          const tx = await createAutoTransaction({
            description: `HOLERITE - ${emp?.name?.toUpperCase()} - ${mesLabel.toUpperCase()}/${existing.year}`,
            amount: Math.max(0, netSalary),
            type: "EXPENSE",
            due_date: body.dataPagamento || `${existing.year}-${String(existing.month).padStart(2, "0")}-05`,
            origin_type: "holerite",
            origin_id: originId,
            category_name: "Recursos Humanos",
            entity_name: emp?.name || "",
            created_by: req.user!.name || req.user!.username || "SISTEMA",
          });
          if (tx) updates.financial_transaction_id = tx.id;
        }

        if (!updates.data_pagamento) {
          const brDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
          updates.data_pagamento = brDate;
        }
      }

      const { data: row } = await supabaseAdmin.from("employee_payslips").update(updates).eq("id", id).select().single();

      await logSystemAudit({
        userId: req.user!.id, userName: req.user!.name || req.user!.username,
        userRole: req.user!.role, action: "ATUALIZAR_HOLERITE",
        details: `Holerite #${id} atualizado: ${JSON.stringify(updates)}`,
      });

      res.json(toCamelObj(row));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/payslips/:id", requireAuth, requireDiretoria, async (req, res) => {
    const id = Number(req.params.id);
    const { data: existingDel } = await supabaseAdmin.from("employee_payslips").select("*").eq("id", id).limit(1);
    const existing = existingDel?.[0] ? toCamelObj<any>(existingDel[0]) : null;
    if (existing?.financialTransactionId) {
      await supabaseAdmin.from("financial_transactions").update({ status: "CANCELLED" }).eq("id", existing.financialTransactionId);
    }
    await supabaseAdmin.from("employee_payslips").delete().eq("id", id);
    await logSystemAudit({
      userId: req.user!.id, userName: req.user!.name || req.user!.username,
      userRole: req.user!.role, action: "EXCLUIR_HOLERITE",
      details: `Holerite #${id} excluído`,
    });
    res.json({ ok: true });
  });

  app.get("/api/payslips/employee-report/:id", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const employeeId = Number(req.params.id);
      const year = Number(req.query.year) || new Date().getFullYear();
      const emp = (await storage.getEmployees()).find((e: any) => e.id === employeeId);
      if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });

      const { data: rowsRaw3 } = await supabaseAdmin.from("employee_payslips").select("*")
        .eq("employee_id", employeeId).eq("year", year)
        .order("month", { ascending: true });
      const rows = toCamelArray(rowsRaw3 || []);

      const totalBruto = rows.reduce((s: number, r: any) => s + (Number(r.grossSalary) || 0), 0);
      const totalLiquido = rows.reduce((s: number, r: any) => s + (Number(r.netSalary) || 0), 0);
      const totalDescontos = rows.reduce((s: number, r: any) => s + (Number(r.descontos) || 0), 0);
      const totalHorasExtras = rows.reduce((s: number, r: any) => s + (Number(r.horasExtras) || 0), 0);

      res.json({
        employee: { id: emp.id, name: emp.name, role: emp.role },
        year,
        payslips: rows,
        totals: { bruto: +totalBruto.toFixed(2), liquido: +totalLiquido.toFixed(2), descontos: +totalDescontos.toFixed(2), horasExtras: +totalHorasExtras.toFixed(2) },
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/payslips/ocr", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { imageData } = req.body;
      if (!imageData || typeof imageData !== "string") {
        return res.status(400).json({ message: "Envie imageData (base64 data URL)" });
      }

      const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
      if (!apiKey) return res.status(500).json({ message: "Chave de API de IA não configurada" });

      const openai = new OpenAI({ apiKey, baseURL });

      const allEmps = await storage.getEmployees();
      const empNames = allEmps.filter((e: any) => e.status === "ativo").map((e: any) => `${e.name} (CPF: ${e.cpf || "N/A"})`).join("\n");

      // Se for PDF, extrai o texto e envia como texto (mais preciso e rápido que OCR de imagem)
      const isPdf = /^data:application\/pdf/i.test(imageData);
      let pdfText = "";
      if (isPdf) {
        try {
          const b64 = imageData.replace(/^data:application\/pdf;base64,/i, "");
          const buf = Buffer.from(b64, "base64");
          const { PDFParse } = await import("pdf-parse");
          const parser = new PDFParse({ data: buf });
          const parsed = await parser.getText();
          pdfText = (parsed.text || "").trim();
          console.log(`[ocr-holerite] PDF text extracted: ${pdfText.length} chars`);
        } catch (pdfErr: any) {
          console.error("[ocr-holerite] pdf-parse falhou:", pdfErr.message);
          return res.status(400).json({ message: "Não foi possível ler o PDF: " + pdfErr.message });
        }
        if (!pdfText) return res.status(400).json({ message: "PDF sem texto legível. Envie uma imagem (foto/scan) do holerite." });
      }

      console.log("[ocr-holerite] Enviando para OpenAI...");
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Você é um sistema especializado em extrair dados de holerites e contracheques brasileiros.
Analise a imagem do holerite/contracheque e extraia os seguintes campos. Retorne APENAS um JSON válido (sem markdown, sem texto extra):
{
  "employeeName": "nome completo do funcionário conforme aparece no documento",
  "employeeCpf": "CPF do funcionário no formato 000.000.000-00",
  "month": número do mês (1-12),
  "year": número do ano (ex: 2026),
  "salarioBase": valor numérico do salário base (sem R$),
  "periculosidade": valor numérico da periculosidade/adicional periculosidade (sem R$),
  "horasExtras": valor numérico total de horas extras em reais (sem R$),
  "adicionalNoturno": valor numérico do adicional noturno (sem R$),
  "beneficios": valor numérico total de benefícios/gratificações/VR/VA/cesta (sem R$),
  "descontos": valor numérico total de descontos (INSS + IRRF + VT + outros) (sem R$),
  "totalBruto": valor numérico do total de vencimentos/proventos (sem R$),
  "totalLiquido": valor numérico do salário líquido a receber (sem R$),
  "competencia": "texto da competência/referência conforme aparece (ex: ABR/2026)"
}

Se um campo não for encontrado, retorne 0 para números e "" para strings. Nunca invente valores.
Os valores devem ser números (ex: 2432.50, não "2.432,50"). Converta o formato brasileiro para decimal.

FUNCIONÁRIOS CADASTRADOS NO SISTEMA (use para identificar o funcionário correto):
${empNames}`
          },
          {
            role: "user",
            content: isPdf
              ? `Extraia os dados deste holerite/contracheque (texto extraído do PDF):\n\n${pdfText}`
              : ([
                  { type: "text", text: "Extraia os dados deste holerite/contracheque:" },
                  { type: "image_url", image_url: { url: imageData } },
                ] as any),
          },
        ],
      });

      const text = response.choices?.[0]?.message?.content || "";
      console.log("[ocr-holerite] OpenAI raw:", text.substring(0, 500));
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);

      let matchedEmployeeId: number | null = null;
      if (parsed.employeeName || parsed.employeeCpf) {
        const cpfClean = (parsed.employeeCpf || "").replace(/\D/g, "");
        const nameLower = (parsed.employeeName || "").toLowerCase().trim();

        for (const emp of allEmps) {
          const empCpf = (emp.cpf || "").replace(/\D/g, "");
          if (cpfClean && empCpf && cpfClean === empCpf) {
            matchedEmployeeId = emp.id;
            break;
          }
        }

        if (!matchedEmployeeId && nameLower) {
          for (const emp of allEmps) {
            const empName = (emp.name || "").toLowerCase().trim();
            if (empName === nameLower || empName.includes(nameLower) || nameLower.includes(empName)) {
              matchedEmployeeId = emp.id;
              break;
            }
          }
        }

        if (!matchedEmployeeId && nameLower) {
          const nameParts = nameLower.split(/\s+/);
          if (nameParts.length >= 2) {
            for (const emp of allEmps) {
              const empParts = (emp.name || "").toLowerCase().split(/\s+/);
              if (empParts[0] === nameParts[0] && empParts[empParts.length - 1] === nameParts[nameParts.length - 1]) {
                matchedEmployeeId = emp.id;
                break;
              }
            }
          }
        }
      }

      console.log(`[ocr-holerite] Parsed OK. Employee match: ${matchedEmployeeId}, name: ${parsed.employeeName}`);
      res.json({ ...parsed, matchedEmployeeId });
    } catch (err: any) {
      console.error("[ocr-holerite] Error:", err.message);
      res.status(500).json({ message: "Erro ao processar holerite: " + (err.message || "Erro desconhecido") });
    }
  });

  // ====================== TESTAR TODAS APIs ======================

  app.post("/api/consulta/testar-todas", requireAuth, requireAdminRole, async (req, res) => {
    const cpfTeste = "00000000000";
    const cnpjTeste = "00000000000000";
    const placaTeste = "ABC1D23";

    const results: Record<string, any> = {};

    const tests = [
      { name: "Multas PRF", fn: () => apibrasil.consultaMultasPRF(placaTeste, req.user!.id, "teste_api") },
      { name: "Dados Veículo", fn: () => apibrasil.consultaDadosVeiculo(placaTeste, req.user!.id, "teste_api") },
      { name: "CNH", fn: () => apibrasil.consultaCNH(cpfTeste, req.user!.id, "teste_api") },
      { name: "Processos", fn: () => apibrasil.consultaProcessos(cpfTeste, req.user!.id, "teste_api") },
      { name: "SPC/Serasa", fn: () => apibrasil.consultaSPC(cpfTeste, req.user!.id, "teste_api") },
      { name: "Score Quod", fn: () => apibrasil.consultaQuodScore(cpfTeste, req.user!.id, "teste_api") },
      { name: "Protesto Nacional", fn: () => apibrasil.consultaProtestoNacional(cnpjTeste, req.user!.id, "teste_api") },
      { name: "Situação Eleitoral", fn: () => apibrasil.consultaSituacaoEleitoral(cpfTeste, req.user!.id, "teste_api") },
    ];

    const startTime = Date.now();
    const settled = await Promise.allSettled(tests.map(t => t.fn()));
    const elapsed = Date.now() - startTime;

    let successCount = 0;
    let errorCount = 0;

    tests.forEach((t, i) => {
      const s = settled[i];
      if (s.status === "fulfilled") {
        results[t.name] = { status: s.value.status, success: s.value.success, data: s.value.data };
        if (s.value.success) successCount++; else errorCount++;
      } else {
        results[t.name] = { status: 0, success: false, error: s.reason?.message || "Erro desconhecido" };
        errorCount++;
      }
    });

    let datajudResult: any = null;
    try {
      const djRes = await fetch("https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==",
        },
        body: JSON.stringify({ query: { match: { numeroProcesso: "0000000000000000000" } }, size: 1 }),
      });
      datajudResult = { status: djRes.status, success: djRes.ok, message: djRes.ok ? "API pública acessível" : "Erro" };
      if (djRes.ok) successCount++;
    } catch (e: any) {
      datajudResult = { status: 0, success: false, error: e.message };
      errorCount++;
    }
    results["DataJud (CNJ)"] = datajudResult;

    res.json({
      totalApis: tests.length + 1,
      success: successCount,
      errors: errorCount,
      elapsed: `${elapsed}ms`,
      tokenConfigured: !!process.env.APIBRASIL_TOKEN,
      results,
    });
  });

  // ====================== USER MANAGEMENT (admin/diretoria only) ======================

  app.get("/api/users", requireAuth, requireAdminRole, async (req, res) => {
    const allUsers = await storage.getUsers();
    const filtered = req.user!.role === "diretoria"
      ? allUsers
      : allUsers.filter(u => u.role !== "diretoria");
    const safeUsers = filtered.map(u => {
      const safe = toSafeUser(u);
      if (req.user!.role !== "diretoria") {
        delete safe.plainPassword;
      }
      return safe;
    });
    res.json(safeUsers);
  });

  app.post("/api/users", requireAuth, requireAdminRole, async (req, res) => {
    console.log(`[users] POST /api/users payload:`, JSON.stringify(req.body, null, 2));
    const { email, name, role, employeeId } = req.body;
    if (!email || !name) {
      return res.status(400).json({ message: "Campos obrigatórios: email, name" });
    }
    if (role === "diretoria" && req.user!.role !== "diretoria") {
      return res.status(403).json({ message: "Sem permissão para criar usuários Diretoria" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await storage.getUserByEmail(normalizedEmail);
    if (existing) return res.status(409).json({ message: "E-mail já cadastrado" });

    const tempPassword = "Torres@" + randomBytes(4).toString("hex");

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,
    });

    if (authError) {
      return res.status(400).json({ message: "Erro ao criar conta: " + authError.message });
    }

    let user;
    try {
      user = await storage.createUser({
        supabaseUid: authData.user.id,
        email: normalizedEmail,
        name,
        role: role || "funcionario",
        employeeId: employeeId || null,
        mustChangePassword: 1,
        plainPassword: tempPassword,
      });
    } catch (dbErr: any) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return res.status(500).json({ message: "Erro ao criar usuário local: " + dbErr.message });
    }

    res.status(201).json({ ...toSafeUser(user), tempPassword });
  });

  app.patch("/api/users/:id", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const target = await storage.getUser(id);
    if (!target) return res.status(404).json({ message: "Usuário não encontrado" });
    if (target.role === "diretoria" && req.user!.role !== "diretoria") {
      return res.status(403).json({ message: "Sem permissão para editar usuários Diretoria" });
    }

    const { name, role, employeeId } = req.body;
    const updateData: any = {};
    if (name) updateData.name = name;
    if (role) {
      if (role === "diretoria" && req.user!.role !== "diretoria") {
        return res.status(403).json({ message: "Sem permissão para atribuir role Diretoria" });
      }
      updateData.role = role;
    }
    if (employeeId !== undefined) updateData.employeeId = employeeId || null;

    const updated = await storage.updateUser(id, updateData);
    if (!updated) return res.status(404).json({ message: "Usuário não encontrado" });
    res.json(toSafeUser(updated));
  });

  app.patch("/api/users/:id/reset-password", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const user = await storage.getUser(id);
    if (!user || !user.supabaseUid) return res.status(404).json({ message: "Usuário não encontrado" });
    if (user.role === "diretoria" && req.user!.role !== "diretoria") {
      return res.status(403).json({ message: "Sem permissão para resetar senha de Diretoria" });
    }

    const newPassword = "torres@123";
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.supabaseUid, {
      password: newPassword,
    });

    if (error) return res.status(500).json({ message: "Erro ao resetar senha: " + error.message });
    await storage.updateUser(id, { mustChangePassword: 1, plainPassword: newPassword } as any);
    res.json({ ...toSafeUser(user), newPassword, mustChangePassword: true });
  });

  app.get("/api/users/by-employee/:employeeId", requireAuth, requireAdminRole, async (req, res) => {
    const employeeId = Number(req.params.employeeId);
    const allUsers = await storage.getUsers();
    const user = allUsers.find(u => u.employeeId === employeeId);
    if (!user) return res.status(404).json({ message: "Sem acesso" });
    res.json(toSafeUser(user));
  });

  app.delete("/api/users/:id", requireAuth, requireDiretoria, async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user!.id) {
      return res.status(400).json({ message: "Você não pode excluir seu próprio usuário" });
    }

    const user = await storage.getUser(id);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado" });
    if (user.role === "diretoria" && req.user!.role !== "diretoria") {
      return res.status(403).json({ message: "Sem permissão para excluir usuários Diretoria" });
    }

    if (user.supabaseUid) {
      await supabaseAdmin.auth.admin.deleteUser(user.supabaseUid).catch(() => {});
    }
    await storage.deleteUser(id);
    res.json({ message: "Usuário excluído" });
  });

  app.post("/api/auth/register", requireAuth, requireAdminRole, async (req, res) => {
    const { email, username, name, role, employeeId, password: reqPassword } = req.body;
    const emailToUse = email || username;
    if (!emailToUse || !name) {
      return res.status(400).json({ message: "Campos obrigatórios: email, name" });
    }
    if (role === "diretoria" && req.user!.role !== "diretoria") {
      return res.status(403).json({ message: "Sem permissão para criar usuários Diretoria" });
    }

    const normalizedEmail = emailToUse.toLowerCase().trim();
    const existing = await storage.getUserByEmail(normalizedEmail);
    if (existing) return res.status(409).json({ message: "Usuário já existe" });

    const tempPassword = reqPassword || "torres@123";

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,
    });

    if (authError) {
      return res.status(400).json({ message: "Erro ao criar conta: " + authError.message });
    }

    let user;
    try {
      user = await storage.createUser({
        supabaseUid: authData.user.id,
        email: normalizedEmail,
        name,
        role: role || "funcionario",
        employeeId: employeeId || null,
        mustChangePassword: 1,
        plainPassword: tempPassword,
      });
    } catch (dbErr: any) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return res.status(500).json({ message: "Erro ao criar usuário local: " + dbErr.message });
    }

    res.status(201).json({ ...toSafeUser(user), tempPassword });
  });

  app.post("/api/auth/register-by-cpf", requireAuth, requireAdminRole, async (req, res) => {
    const { cpf, name, employeeId } = req.body;
    if (!cpf || !name) {
      return res.status(400).json({ message: "Campos obrigatórios: cpf, name" });
    }
    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      return res.status(400).json({ message: "CPF inválido" });
    }

    const syntheticEmail = `cpf_${cleanCpf}@torresseguranca.local`;
    const existing = await storage.getUserByEmail(syntheticEmail);
    if (existing) return res.status(409).json({ message: "Já existe um acesso para este CPF" });

    const defaultPassword = "torres@123";

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail,
      password: defaultPassword,
      email_confirm: true,
    });

    if (authError) {
      return res.status(400).json({ message: "Erro ao criar conta: " + authError.message });
    }

    let user;
    try {
      user = await storage.createUser({
        supabaseUid: authData.user.id,
        email: syntheticEmail,
        name,
        role: "funcionario",
        employeeId: employeeId || null,
        mustChangePassword: 1,
        plainPassword: defaultPassword,
      });
    } catch (dbErr: any) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return res.status(500).json({ message: "Erro ao criar usuário local: " + dbErr.message });
    }

    res.status(201).json({ ...toSafeUser(user) });
  });

  // ===== EMPLOYEE DOCUMENTS =====
  app.get("/api/employee-documents/:employeeId", requireAuth, async (req, res) => {
    const docs = await storage.getEmployeeDocuments(parseInt(req.params.employeeId));
    res.json(docs);
  });

  const syncDocToEmployee = async (docType: string, employeeId: number, documentNumber?: string | null, expiryDate?: string | null) => {
    if (docType !== "CNH" && docType !== "CNV") return;
    try {
      const emp = await storage.getEmployee(employeeId);
      if (!emp) return;
      const syncFields: any = {};
      if (docType === "CNH") {
        if (documentNumber && !emp.cnhNumber) syncFields.cnhNumber = documentNumber;
        if (expiryDate && !emp.cnhExpiry) syncFields.cnhExpiry = expiryDate;
      } else if (docType === "CNV") {
        if (documentNumber && !emp.cnvNumber) syncFields.cnvNumber = documentNumber;
        if (expiryDate && !emp.cnvExpiry) syncFields.cnvExpiry = expiryDate;
      }
      if (Object.keys(syncFields).length > 0) {
        await storage.updateEmployee(employeeId, syncFields);
      }
    } catch {}
  };

  app.post("/api/employee-documents", requireAdminRole, async (req, res) => {
    const parsed = insertEmployeeDocumentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const emp = await storage.getEmployee(parsed.data.employeeId);
    if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });
    const doc = await storage.createEmployeeDocument(parsed.data);
    await syncDocToEmployee(parsed.data.type, parsed.data.employeeId, parsed.data.documentNumber, parsed.data.expiryDate);
    res.status(201).json(doc);
  });

  app.patch("/api/employee-documents/:id", requireAdminRole, async (req, res) => {
    const parsed = insertEmployeeDocumentSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.errors });
    const doc = await storage.updateEmployeeDocument(parseInt(req.params.id), parsed.data);
    if (!doc) return res.status(404).json({ message: "Documento não encontrado" });
    if (doc.type && doc.employeeId) {
      await syncDocToEmployee(doc.type, doc.employeeId, doc.documentNumber, doc.expiryDate);
    }
    res.json(doc);
  });

  app.delete("/api/employee-documents/:id", requireAuth, requireDiretoria, async (req, res) => {
    await storage.deleteEmployeeDocument(parseInt(req.params.id));
    res.json({ ok: true });
  });

  app.get("/api/jornada-calculos", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { mes } = req.query;
      let query = supabaseAdmin.from("jornada_calculos").select("*").order("created_at", { ascending: false });
      if (mes) query = query.eq("mes_referencia", mes);
      const { data, error } = await query;
      if (error) return res.status(500).json({ message: error.message });
      res.json(data || []);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/jornada-calculos/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("jornada_calculos").select("*").eq("id", req.params.id).single();
      if (error) return res.status(404).json({ message: "Cálculo não encontrado" });
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/jornada-calculos", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { employee_id, service_order_id, inicio_missao, fim_missao, pct_ativo, salario_base, mes_referencia } = req.body;
      if (!employee_id || !inicio_missao || !fim_missao || pct_ativo == null || !salario_base || !mes_referencia) {
        return res.status(400).json({ message: "Campos obrigatórios: employee_id, inicio_missao, fim_missao, pct_ativo, salario_base, mes_referencia" });
      }

      const start = new Date(inicio_missao);
      const end = new Date(fim_missao);
      const totalHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      if (totalHours <= 0) return res.status(400).json({ message: "fim_missao deve ser posterior a inicio_missao" });

      const pctAtivo = Math.max(0, Math.min(100, Number(pct_ativo)));
      const horasAtivo = totalHours * (pctAtivo / 100);
      const horasSobreaviso = totalHours - horasAtivo;

      let horasNoturnas = 0;
      const cursor = new Date(start);
      while (cursor < end) {
        const brHour = Number(cursor.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
        if (brHour >= 22 || brHour < 5) {
          const nextMin = new Date(cursor.getTime() + 60000);
          const effective = nextMin > end ? (end.getTime() - cursor.getTime()) / 3600000 : 1 / 60;
          horasNoturnas += effective;
        }
        cursor.setTime(cursor.getTime() + 60000);
      }

      const salBase = Number(salario_base);
      const horaNormal = salBase / 220;
      const valorSobreaviso = horaNormal / 3;
      const periculosidade = salBase * 0.30;

      const { data: existingMonth } = await supabaseAdmin
        .from("jornada_calculos")
        .select("horas_ativo")
        .eq("employee_id", employee_id)
        .eq("mes_referencia", mes_referencia);
      const horasAcumuladas = (existingMonth || []).reduce((sum: number, r: any) => sum + Number(r.horas_ativo), 0);
      const horasExtras = Math.max(0, (horasAcumuladas + horasAtivo) - 220);

      const valorAtivo = horasAtivo * horaNormal;
      const valorSobreavisoTotal = horasSobreaviso * valorSobreaviso;
      const adicionalNoturno = horasNoturnas * horaNormal * 0.20;
      const valorHoraExtra = horasExtras * (horaNormal * 1.5);
      const totalBruto = valorAtivo + valorSobreavisoTotal + adicionalNoturno + valorHoraExtra + periculosidade;

      const record = {
        employee_id,
        service_order_id: service_order_id || null,
        inicio_missao: start.toISOString(),
        fim_missao: end.toISOString(),
        horas_ativo: horasAtivo.toFixed(2),
        horas_sobreaviso: horasSobreaviso.toFixed(2),
        horas_noturnas: horasNoturnas.toFixed(2),
        horas_extras: horasExtras.toFixed(2),
        valor_hora_normal: horaNormal.toFixed(2),
        valor_sobreaviso: valorSobreavisoTotal.toFixed(2),
        valor_noturno: adicionalNoturno.toFixed(2),
        valor_extra: valorHoraExtra.toFixed(2),
        total_bruto: totalBruto.toFixed(2),
        mes_referencia,
        created_by: req.user?.name || "diretoria",
      };

      const { data, error } = await supabaseAdmin.from("jornada_calculos").insert(record).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.status(201).json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/jornada-calculos/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("jornada_calculos").delete().eq("id", req.params.id);
      if (error) return res.status(500).json({ message: error.message });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/jornada-diretoria/gerar-holerites", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { mes } = req.body;
      if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ message: "Informe mes no formato YYYY-MM" });
      const [y, m] = mes.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const inicioMes = `${mes}-01T00:00:00-03:00`;
      const fimMes = `${mes}-${String(lastDay).padStart(2, "0")}T23:59:59-03:00`;

      const { data: pontos } = await supabaseAdmin.from("ponto_operacional")
        .select("employee_id, employee_name, horas_extras")
        .gte("entrada", inicioMes).lte("entrada", fimMes);

      const byEmp: Record<number, { name: string; extras: number }> = {};
      for (const p of pontos || []) {
        if (!byEmp[p.employee_id]) byEmp[p.employee_id] = { name: p.employee_name || `#${p.employee_id}`, extras: 0 };
        byEmp[p.employee_id].extras += Number(p.horas_extras || 0);
      }

      let criados = 0, existentes = 0;
      for (const [empIdStr, info] of Object.entries(byEmp)) {
        const empId = Number(empIdStr);
        const { data: existing } = await supabaseAdmin.from("employee_payslips")
          .select("id").eq("employee_id", empId).eq("month", m).eq("year", y).limit(1);
        if (existing && existing.length > 0) { existentes++; continue; }

        await supabaseAdmin.from("employee_payslips").insert({
          employee_id: empId,
          month: m,
          year: y,
          horas_extras: +info.extras.toFixed(2),
          status: "pendente",
        });
        criados++;
      }

      res.json({ criados, existentes, total: Object.keys(byEmp).length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/jornada-diretoria/alertas", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const mes = req.query.mes ? String(req.query.mes) : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
      const { data: alerts } = await supabaseAdmin.from("billing_alerts")
        .select("*")
        .eq("alert_type", "JORNADA_LIMITE")
        .eq("resolved", false)
        .like("period_start", `${mes}%`);
      res.json(alerts || []);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/jornada-diretoria", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const mes = req.query.mes ? String(req.query.mes) : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
      const [y, m] = mes.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const inicioMes = `${mes}-01T00:00:00-03:00`;
      const fimMes = `${mes}-${String(lastDay).padStart(2, "0")}T23:59:59-03:00`;

      const { data: pontos } = await supabaseAdmin.from("ponto_operacional")
        .select("employee_id, employee_name, horas_decimal, horas_ativo, horas_sobreaviso, horas_noturno, horas_extras")
        .gte("entrada", inicioMes).lte("entrada", fimMes);

      const byEmp: Record<number, any> = {};
      for (const p of pontos || []) {
        if (!byEmp[p.employee_id]) {
          byEmp[p.employee_id] = {
            employeeId: p.employee_id,
            employeeName: p.employee_name || `#${p.employee_id}`,
            totalHoras: 0, horasAtivo: 0, horasSobreaviso: 0, horasNoturno: 0, horasExtras: 0,
          };
        }
        const e = byEmp[p.employee_id];
        e.totalHoras += Number(p.horas_decimal || 0);
        e.horasAtivo += Number(p.horas_ativo || 0);
        e.horasSobreaviso += Number(p.horas_sobreaviso || 0);
        e.horasNoturno += Number(p.horas_noturno || 0);
        e.horasExtras += Number(p.horas_extras || 0);
      }

      const resumo = Object.values(byEmp).map((e: any) => ({
        ...e,
        totalHoras: +e.totalHoras.toFixed(2),
        horasAtivo: +e.horasAtivo.toFixed(2),
        horasSobreaviso: +e.horasSobreaviso.toFixed(2),
        horasNoturno: +e.horasNoturno.toFixed(2),
        horasExtras: +e.horasExtras.toFixed(2),
        status: e.totalHoras > 220 ? "excedido" : e.totalHoras >= 210 ? "alerta" : "normal",
      }));
      resumo.sort((a: any, b: any) => b.totalHoras - a.totalHoras);

      res.json({ mes, resumo });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  }
  