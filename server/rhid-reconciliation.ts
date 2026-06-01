/**
 * CONCILIAÇÃO DE PONTO: nosso sistema (verdade) × RHID/Control iD (AFD).
 *
 * Regra de negócio (definida pelo dono):
 *  - Nosso sistema é SEMPRE a verdade.
 *  - Batidas faciais (local fixo) nascem no RHID → devem ser importadas pra nós.
 *  - Batidas manuais (web/mobile/admin) nascem em nós → devem ser exportadas pro RHID.
 *  - O AFD do RHID é append-only (Portaria 1510): não dá pra editar/excluir batida lá.
 *
 * Esta engine é READ-ONLY: só compara e classifica. As ações (importar/exportar/
 * corrigir) são disparadas pelo cron/rotina a partir do resultado.
 *
 * Casamento por MINUTO em BRT — robusto contra diferença de ms/segundos e contra
 * a divergência de formato de external_id (numérico do POST vs `rhid_{id}_{ts}` do AFD).
 */
import nodemailer from "nodemailer";
import { supabaseAdmin } from "./supabase";
import { fetchAllEvents, syncDevice, createRhidPunch, type DeviceRow } from "./control-id";
import { monthToFechamento, nameMatchScore, minuteKeyBRT } from "./lib/control-id-parsers";

export type MarkStatus = "validado" | "faltando_no_rhid" | "faltando_no_local" | "duplicada";

export interface ReconMark {
  minuteBRT: string;        // "YYYY-MM-DD HH:mm" em BRT
  status: MarkStatus;
  inOurs: boolean;
  inRhid: boolean;
  oursCount: number;        // quantas batidas nossas nesse minuto (>1 = duplicada)
  rhidCount: number;
  source?: string | null;   // facial | manual | ...
}

export interface ReconEmployee {
  employeeId: number;
  name: string;
  cpf: string | null;
  pis: string | null;
  matricula: string | null;
  rhidUserId: string | null;
  rhidName: string | null;
  mappingOk: boolean;
  identidadeWarnings: string[];
  counts: {
    ours: number;
    rhid: number;
    validado: number;
    faltandoNoRhid: number;   // nossas que faltam no RHID → exportar
    faltandoNoLocal: number;  // do RHID (facial) que faltam em nós → importar
    duplicadas: number;
  };
  marks: ReconMark[];
}

export interface ReconResult {
  period: { fromYmd: string; toYmd: string };
  generatedAt: string;
  deviceId: number | null;
  totals: {
    employees: number;
    validado: number;
    faltandoNoRhid: number;
    faltandoNoLocal: number;
    duplicadas: number;
    identidadeProblemas: number;
    semMapping: number;
  };
  employees: ReconEmployee[];
}

function onlyDigits(s: any): string {
  return String(s ?? "").replace(/\D/g, "");
}

// Resolve período: se não vier, usa o ciclo de fechamento do mês atual (BRT).
export function resolvePeriod(fromYmd?: string, toYmd?: string): { start: Date; end: Date; fromYmd: string; toYmd: string } {
  if (fromYmd && toYmd) {
    const start = new Date(`${fromYmd}T00:00:00-03:00`);
    const end = new Date(`${toYmd}T23:59:59-03:00`);
    return { start, end, fromYmd, toYmd };
  }
  const nowBRT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [yy, mm] = nowBRT.split("-");
  const { start, end } = monthToFechamento(`${yy}-${mm}`);
  return {
    start,
    end,
    fromYmd: start.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
    toYmd: end.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
  };
}

/**
 * Constrói a conciliação para um período. Read-only.
 */
export async function buildReconciliation(opts: { fromYmd?: string; toYmd?: string; deviceId?: number } = {}): Promise<ReconResult> {
  const { start, end, fromYmd, toYmd } = resolvePeriod(opts.fromYmd, opts.toYmd);

  // Device alvo (default: primeiro rhid_cloud ativo)
  let device: any = null;
  if (opts.deviceId) {
    const { data } = await supabaseAdmin.from("control_id_devices").select("*").eq("id", opts.deviceId).maybeSingle();
    device = data;
  } else {
    const { data } = await supabaseAdmin.from("control_id_devices").select("*").eq("tipo", "rhid_cloud").eq("ativo", true).order("id").limit(1).maybeSingle();
    device = data;
  }
  const deviceId = device ? Number(device.id) : null;

  // Funcionários ativos
  const { data: emps } = await supabaseAdmin
    .from("employees")
    .select("id, name, cpf, pis, matricula, status")
    .eq("status", "ativo")
    .order("name");
  const employees = (emps || []) as any[];
  const empIds = employees.map((e) => e.id);

  // Mappings ativos
  const { data: maps } = await supabaseAdmin
    .from("control_id_users_map")
    .select("employee_id, device_id, control_id_user_id, control_id_user_name, ativo")
    .in("employee_id", empIds.length ? empIds : [-1])
    .eq("ativo", true);
  const mapByEmp = new Map<number, any>();
  for (const m of (maps || []) as any[]) {
    if (deviceId == null || Number(m.device_id) === deviceId) mapByEmp.set(Number(m.employee_id), m);
  }

  // Nossas batidas no período
  const { data: ourPunches } = await supabaseAdmin
    .from("control_id_punches")
    .select("employee_id, punch_at, source, external_id")
    .gte("punch_at", start.toISOString())
    .lt("punch_at", end.toISOString())
    .not("employee_id", "is", null);
  const oursByEmp = new Map<number, any[]>();
  for (const p of (ourPunches || []) as any[]) {
    const arr = oursByEmp.get(Number(p.employee_id)) || [];
    arr.push(p);
    oursByEmp.set(Number(p.employee_id), arr);
  }

  // Eventos do RHID (AFD inteiro) agrupados por idPerson, filtrados ao período
  const rhidByUser = new Map<string, { minute: string; source?: string }[]>();
  if (device) {
    const events = await fetchAllEvents(device as DeviceRow);
    for (const ev of events) {
      const t = new Date(ev.time).getTime();
      if (t < start.getTime() || t >= end.getTime()) continue;
      const arr = rhidByUser.get(String(ev.userId)) || [];
      arr.push({ minute: minuteKeyBRT(new Date(ev.time)), source: ev.source || "facial" });
      rhidByUser.set(String(ev.userId), arr);
    }
  }

  const result: ReconResult = {
    period: { fromYmd, toYmd },
    generatedAt: new Date().toISOString(),
    deviceId,
    totals: { employees: 0, validado: 0, faltandoNoRhid: 0, faltandoNoLocal: 0, duplicadas: 0, identidadeProblemas: 0, semMapping: 0 },
    employees: [],
  };

  for (const emp of employees) {
    const map = mapByEmp.get(Number(emp.id)) || null;
    const rhidUserId = map ? String(map.control_id_user_id) : null;

    // Identidade
    const cpfD = onlyDigits(emp.cpf);
    const pisD = onlyDigits(emp.pis);
    const warnings: string[] = [];
    if (!map) warnings.push("Sem vínculo (mapping) com o RHID");
    if (cpfD.length !== 11) warnings.push("CPF ausente ou inválido (precisa 11 dígitos)");
    if (pisD.length !== 11) warnings.push("PIS ausente ou inválido (precisa 11 dígitos)");
    if (cpfD.length === 11 && pisD.length === 11 && cpfD === pisD) warnings.push("CPF e PIS são iguais (provável digitação trocada)");
    if (map && map.control_id_user_name && emp.name) {
      const score = nameMatchScore(emp.name, map.control_id_user_name);
      if (score < 0.5) warnings.push(`Nome diverge do RHID ("${emp.name}" × "${map.control_id_user_name}")`);
    }

    // Contagem por minuto (nossas)
    const ourMarks = oursByEmp.get(Number(emp.id)) || [];
    const oursByMinute = new Map<string, { count: number; source?: string }>();
    for (const p of ourMarks) {
      const k = minuteKeyBRT(new Date(p.punch_at));
      const cur = oursByMinute.get(k) || { count: 0, source: p.source };
      cur.count++;
      oursByMinute.set(k, cur);
    }

    // Contagem por minuto (RHID)
    const rhidMarks = rhidUserId ? (rhidByUser.get(rhidUserId) || []) : [];
    const rhidByMinute = new Map<string, { count: number; source?: string }>();
    for (const r of rhidMarks) {
      const cur = rhidByMinute.get(r.minute) || { count: 0, source: r.source };
      cur.count++;
      rhidByMinute.set(r.minute, cur);
    }

    const allMinutes = new Set<string>([...Array.from(oursByMinute.keys()), ...Array.from(rhidByMinute.keys())]);
    const marks: ReconMark[] = [];
    let validado = 0, faltandoNoRhid = 0, faltandoNoLocal = 0, duplicadas = 0;
    for (const minute of Array.from(allMinutes).sort()) {
      const o = oursByMinute.get(minute);
      const r = rhidByMinute.get(minute);
      const inOurs = !!o, inRhid = !!r;
      let status: MarkStatus;
      if (inOurs && (o!.count > 1)) { status = "duplicada"; duplicadas++; }
      else if (inOurs && inRhid) { status = "validado"; validado++; }
      else if (inOurs && !inRhid) { status = "faltando_no_rhid"; faltandoNoRhid++; }
      else { status = "faltando_no_local"; faltandoNoLocal++; }
      marks.push({
        minuteBRT: minute,
        status,
        inOurs,
        inRhid,
        oursCount: o?.count || 0,
        rhidCount: r?.count || 0,
        source: o?.source ?? r?.source ?? null,
      });
    }

    const re: ReconEmployee = {
      employeeId: Number(emp.id),
      name: emp.name,
      cpf: emp.cpf || null,
      pis: emp.pis || null,
      matricula: emp.matricula || null,
      rhidUserId,
      rhidName: map ? (map.control_id_user_name || null) : null,
      mappingOk: !!map,
      identidadeWarnings: warnings,
      counts: { ours: ourMarks.length, rhid: rhidMarks.length, validado, faltandoNoRhid, faltandoNoLocal, duplicadas },
      marks,
    };
    result.employees.push(re);

    result.totals.validado += validado;
    result.totals.faltandoNoRhid += faltandoNoRhid;
    result.totals.faltandoNoLocal += faltandoNoLocal;
    result.totals.duplicadas += duplicadas;
    if (warnings.length) result.totals.identidadeProblemas++;
    if (!map) result.totals.semMapping++;
  }

  result.totals.employees = result.employees.length;
  return result;
}

// ============================ AÇÕES (não read-only) ============================

// Extrai o ID que o RHID devolve ao criar uma batida (mesmas grafias do create branch da fila).
function extractRhidPunchId(result: any): string | null {
  const id = result?.newID ?? result?.NewID ?? result?.newId ?? result?.NewId
    ?? result?.id ?? result?.Id ?? result?.ID ?? result?.idAfd
    ?? result?.IdAfd ?? result?.id_afd ?? result?.Punch?.id ?? result?.punch?.id;
  return id == null ? null : String(id);
}

export interface ReconActions {
  imported: number;        // batidas faciais trazidas do RHID pra nós
  importSkipped: number;
  exported: number;        // batidas manuais nossas criadas no RHID (corretivas)
  exportFailed: number;
  errors: string[];
}

/**
 * Exporta pro RHID as batidas NOSSAS que faltam lá (status faltando_no_rhid),
 * uma marcação corretiva por minuto. Deduplicado por minuto via a própria
 * conciliação (só cria o que ela apontou como ausente) + checagem de external_id.
 * Nosso sistema é a verdade: o RHID passa a ter a marcação correta.
 */
export async function exportMissingToRhid(recon: ReconResult): Promise<{ exported: number; exportFailed: number; errors: string[] }> {
  let exported = 0, exportFailed = 0;
  const errors: string[] = [];
  if (!recon.deviceId) return { exported, exportFailed, errors };

  const { start, end } = resolvePeriod(recon.period.fromYmd, recon.period.toYmd);
  for (const emp of recon.employees) {
    if (!emp.mappingOk || !emp.rhidUserId) continue;
    const missingMinutes = new Set(emp.marks.filter((m) => m.status === "faltando_no_rhid").map((m) => m.minuteBRT));
    if (!missingMinutes.size) continue;

    // Batidas locais do período pra esse funcionário; só exporta as que não têm external_id ainda.
    const { data: punches } = await supabaseAdmin
      .from("control_id_punches")
      .select("id, punch_at, external_id")
      .eq("employee_id", emp.employeeId)
      .gte("punch_at", start.toISOString())
      .lt("punch_at", end.toISOString());

    const seen = new Set<string>();
    for (const p of (punches || []) as any[]) {
      const mk = minuteKeyBRT(new Date(p.punch_at));
      if (!missingMinutes.has(mk)) continue;
      if (p.external_id) continue;     // já exportada
      if (seen.has(mk)) continue;      // 1 corretiva por minuto
      seen.add(mk);
      try {
        const result = await createRhidPunch(recon.deviceId, emp.rhidUserId, new Date(p.punch_at), 3);
        const extractedId = extractRhidPunchId(result);
        await supabaseAdmin.from("control_id_punches").update({
          external_id: extractedId ?? String(p.external_id ?? ""),
          rhid_synced_at: new Date().toISOString(),
          rhid_sync_error: extractedId ? null : "RHID criou batida mas não retornou ID",
        }).eq("id", p.id);
        exported++;
      } catch (e: any) {
        exportFailed++;
        errors.push(`Export ${emp.name} ${mk}: ${e?.message || e}`.slice(0, 200));
      }
    }
  }
  return { exported, exportFailed, errors };
}

// ============================ E-MAIL ============================

function getMailTransporter() {
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host, port, secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false },
  });
}

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function reconRecipients(override?: string[]): string[] {
  if (override && override.length) return override;
  const env = process.env.RHID_RECON_RECIPIENTS || process.env.RH_RECIPIENTS || "";
  const list = env.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return list;
}

/**
 * Envia e-mail-resumo da conciliação. Só dispara se houver divergência
 * (a menos que force=true). Retorna se enviou e pra quem.
 */
export async function sendReconciliationEmail(recon: ReconResult, actions: ReconActions, opts?: { recipientsOverride?: string[]; force?: boolean }): Promise<{ sent: boolean; message: string }> {
  const t = recon.totals;
  const hasDivergence = t.faltandoNoRhid > 0 || t.faltandoNoLocal > 0 || t.duplicadas > 0 || t.identidadeProblemas > 0 || actions.exportFailed > 0;
  if (!hasDivergence && !opts?.force) {
    return { sent: false, message: "Sem divergências — e-mail não enviado." };
  }
  const transporter = getMailTransporter();
  if (!transporter) return { sent: false, message: "SMTP não configurado (SMTP_USER/SMTP_PASS)." };
  const recipients = reconRecipients(opts?.recipientsOverride);
  if (!recipients.length) return { sent: false, message: "Sem destinatários (defina RHID_RECON_RECIPIENTS)." };

  const probEmployees = recon.employees.filter((e) =>
    e.counts.faltandoNoRhid > 0 || e.counts.faltandoNoLocal > 0 || e.counts.duplicadas > 0 || e.identidadeWarnings.length > 0);

  const rows = probEmployees.map((e) => {
    const w = e.identidadeWarnings.length ? `<div style="color:#b45309;font-size:12px">⚠ ${e.identidadeWarnings.map(escapeHtml).join("; ")}</div>` : "";
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(e.name)}${w}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;color:#16a34a">${e.counts.validado}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;color:#dc2626">${e.counts.faltandoNoRhid}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;color:#2563eb">${e.counts.faltandoNoLocal}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;color:#9333ea">${e.counts.duplicadas}</td>
    </tr>`;
  }).join("");

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;color:#111">
    <h2 style="color:#0f172a">Validação de Ponto — RHID × Sistema</h2>
    <p style="color:#475569">Período <b>${recon.period.fromYmd}</b> a <b>${recon.period.toYmd}</b> · ${new Date(recon.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
    <table style="border-collapse:collapse;margin:12px 0">
      <tr>
        <td style="padding:8px 14px;background:#f0fdf4;border-radius:6px"><b style="color:#16a34a;font-size:20px">${t.validado}</b><br>validados</td>
        <td style="width:8px"></td>
        <td style="padding:8px 14px;background:#fef2f2;border-radius:6px"><b style="color:#dc2626;font-size:20px">${t.faltandoNoRhid}</b><br>faltam no RHID</td>
        <td style="width:8px"></td>
        <td style="padding:8px 14px;background:#eff6ff;border-radius:6px"><b style="color:#2563eb;font-size:20px">${t.faltandoNoLocal}</b><br>faltam em nós</td>
        <td style="width:8px"></td>
        <td style="padding:8px 14px;background:#faf5ff;border-radius:6px"><b style="color:#9333ea;font-size:20px">${t.duplicadas}</b><br>duplicadas</td>
      </tr>
    </table>
    <p style="color:#475569">Ações automáticas: importadas <b>${actions.imported}</b> · exportadas (corretivas) <b>${actions.exported}</b> · falhas export <b>${actions.exportFailed}</b> · problemas de identidade <b>${t.identidadeProblemas}</b></p>
    ${probEmployees.length ? `
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:8px">
      <thead><tr style="background:#f8fafc;text-align:left">
        <th style="padding:6px 8px">Funcionário</th><th style="padding:6px 8px">Validados</th>
        <th style="padding:6px 8px">Faltam RHID</th><th style="padding:6px 8px">Faltam nós</th><th style="padding:6px 8px">Dup.</th>
      </tr></thead><tbody>${rows}</tbody>
    </table>` : `<p style="color:#16a34a"><b>Tudo validado.</b></p>`}
    <p style="color:#94a3b8;font-size:12px;margin-top:18px">Torres Vigilância — validação automática de ponto. Nosso sistema é a fonte da verdade.</p>
  </div>`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: recipients,
    subject: `[Ponto] Validação RHID ${recon.period.fromYmd}—${recon.period.toYmd}: ${t.faltandoNoRhid + t.faltandoNoLocal + t.duplicadas} divergência(s)`,
    html,
  });
  return { sent: true, message: `E-mail enviado para ${recipients.join(", ")}` };
}

// ============================ ORQUESTRADOR DIÁRIO ============================

/**
 * Rotina diária de confiabilidade do ponto:
 *  1) importa facial faltante (syncDevice full backfill, deduplicado por minuto);
 *  2) reconcilia o ciclo atual (read-only);
 *  3) exporta corretivas pras batidas nossas que faltam no RHID;
 *  4) grava o resumo em rhid_reconciliation_runs;
 *  5) envia e-mail-resumo (se houver divergência ou force).
 */
export async function runDailyReconciliation(opts: {
  fromYmd?: string; toYmd?: string; deviceId?: number;
  doImport?: boolean; doExport?: boolean; sendEmail?: boolean; forceEmail?: boolean;
  triggeredBy?: string; recipientsOverride?: string[];
} = {}): Promise<{ recon: ReconResult; actions: ReconActions; email: { sent: boolean; message: string }; runId: number | null }> {
  const doImport = opts.doImport !== false;
  const doExport = opts.doExport !== false;
  const sendEmail = opts.sendEmail !== false;
  const actions: ReconActions = { imported: 0, importSkipped: 0, exported: 0, exportFailed: 0, errors: [] };

  // Resolve device (mesma lógica do buildReconciliation)
  let deviceId = opts.deviceId ?? null;
  if (deviceId == null) {
    const { data } = await supabaseAdmin.from("control_id_devices").select("id").eq("tipo", "rhid_cloud").eq("ativo", true).order("id").limit(1).maybeSingle();
    deviceId = data ? Number(data.id) : null;
  }

  // 1) Import facial faltante
  if (doImport && deviceId != null) {
    try {
      const r = await syncDevice(deviceId, { fullBackfill: true });
      actions.imported = r.saved;
      actions.importSkipped = r.skipped;
    } catch (e: any) {
      actions.errors.push(`Import: ${e?.message || e}`.slice(0, 200));
    }
  }

  // 2) Reconciliação
  const recon = await buildReconciliation({ fromYmd: opts.fromYmd, toYmd: opts.toYmd, deviceId: deviceId ?? undefined });

  // 3) Export corretivas
  if (doExport) {
    try {
      const r = await exportMissingToRhid(recon);
      actions.exported = r.exported;
      actions.exportFailed = r.exportFailed;
      actions.errors.push(...r.errors);
    } catch (e: any) {
      actions.errors.push(`Export: ${e?.message || e}`.slice(0, 200));
    }
  }

  // 4) Persiste o resumo
  let runId: number | null = null;
  try {
    const { data, error } = await supabaseAdmin.from("rhid_reconciliation_runs").insert({
      run_at: new Date().toISOString(),
      period_from: recon.period.fromYmd,
      period_to: recon.period.toYmd,
      triggered_by: opts.triggeredBy || "cron",
      totals: recon.totals,
      actions,
      detail: recon.employees,
    }).select("id").single();
    if (error) actions.errors.push(`Persist: ${error.message}`.slice(0, 200));
    runId = data ? Number(data.id) : null;
  } catch (e: any) {
    actions.errors.push(`Persist: ${e?.message || e}`.slice(0, 200));
  }

  // 5) E-mail
  let email = { sent: false, message: "E-mail desativado." };
  if (sendEmail) {
    try {
      email = await sendReconciliationEmail(recon, actions, { recipientsOverride: opts.recipientsOverride, force: opts.forceEmail });
    } catch (e: any) {
      email = { sent: false, message: `Erro e-mail: ${e?.message || e}` };
    }
  }

  return { recon, actions, email, runId };
}
