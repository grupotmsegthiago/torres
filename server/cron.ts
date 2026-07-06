import cron from "node-cron";
import nodemailer from "nodemailer";
import { log } from "./lib/logger";
import { getVehicleCache, sendCommand } from "./truckscontrol";
import { supabaseAdmin } from "./supabase";
import { getHorasElapsedFromDB, calcularFaturamentoLive, computeBillingPayloadForOs, resolveContractForOs, shouldSkipBillingHours, DEFAULT_BILLING_CONTRACT } from "./billing-calc";
import { getDiretoriaSnapshot } from "./financial-snapshot";
import { shouldRunBackgroundJobs } from "./platform";
import { runCronBucket, type CronBucket } from "./cron-buckets";

const RODIZIO_MAP: Record<number, number[]> = {
  1: [1, 2],
  2: [3, 4],
  3: [5, 6],
  4: [7, 8],
  5: [9, 0],
};

export async function sendRodizioAlerts() {
  const now = new Date();
  const brHour = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric" }).format(now);
  const brDay = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(now);

  const dayOfWeekMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 };
  const dayNum = dayOfWeekMap[brDay];
  if (!dayNum) {
    log(`CRON Rodízio: Hoje é ${brDay} — sem rodízio (sábado/domingo)`, "cron");
    return;
  }

  const digitsToday = RODIZIO_MAP[dayNum];
  if (!digitsToday) return;

  log(`CRON Rodízio: Verificando veículos com final ${digitsToday.join(", ")} (${brDay}, ${brHour}h BRT)`, "cron");

  const tcVehicles = getVehicleCache();
  if (tcVehicles.length === 0) {
    log("CRON Rodízio: Cache de veículos TrucksControl vazio, pulando", "cron");
    return;
  }

  let sent = 0;
  for (const v of tcVehicles) {
    const plate = v.placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (plate.length < 1) continue;
    const lastChar = plate.charAt(plate.length - 1);
    const lastDigit = parseInt(lastChar, 10);
    if (isNaN(lastDigit)) continue;

    if (digitsToday.includes(lastDigit)) {
      try {
        const result = await sendCommand(v.veiID, "mensagem_texto", "ATENCAO, RODIZIO DESSE VEICULO HOJE");
        log(`CRON Rodízio: Mensagem enviada para ${v.placa} (veiID=${v.veiID}): ${result.message}`, "cron");
        sent++;
      } catch (err: any) {
        log(`CRON Rodízio: Erro ao enviar para ${v.placa}: ${err.message}`, "cron");
      }
    }
  }
  log(`CRON Rodízio: ${sent} mensagem(ns) enviada(s)`, "cron");
}

const META_DIARIA_VIATURA = 1800;
const isActiveVehicle = (v: any) => v.status !== "inativo" && !!(v.trackerId || v.truckscontrolIdentifier);

export async function checkMetaAndNotify() {
  try {
    const now = new Date();
    const brDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
    const [brYear, brMonth] = brDate.split("-");
    const monthKey = `meta_atingida_${brYear}-${brMonth}`;

    const { data: already } = await supabaseAdmin.from("system_settings").select("id").eq("key", monthKey);
    if (already?.length) return;

    const { data: vehicles } = await supabaseAdmin.from("vehicles").select("*");
    const activeCount = (vehicles || []).filter(isActiveVehicle).length;
    if (activeCount === 0) return;

    const daysInMonth = new Date(Number(brYear), Number(brMonth), 0).getDate();
    const metaMensal = META_DIARIA_VIATURA * activeCount * daysInMonth;

    const monthStart = `${brYear}-${brMonth}-01T00:00:00`;
    const monthEnd = `${brYear}-${brMonth}-${String(daysInMonth).padStart(2, "0")}T23:59:59`;
    const { data: billings } = await supabaseAdmin.from("escort_billings")
      .select("total_value, created_at")
      .gte("created_at", monthStart)
      .lte("created_at", monthEnd);

    const totalFat = (billings || []).reduce((sum: number, b: any) => sum + (Number(b.total_value) || 0), 0);
    if (totalFat < metaMensal) return;

    const pct = ((totalFat / metaMensal) * 100).toFixed(1);
    const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const transporter = getCronMailTransporter();
    if (!transporter) {
      log(`CRON Meta: Meta atingida (${pct}%) mas SMTP não configurado`, "cron");
      return;
    }

    const monthLabel = new Date(Number(brYear), Number(brMonth) - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    await transporter.sendMail({
      from: process.env.SMTP_USER || process.env.EMAIL_USER,
      to: "thiago@grupotmseg.com.br",
      subject: `🎯 Meta Atingida — ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#059669;color:#fff;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="margin:0;font-size:24px;">🎯 META ATINGIDA!</h1>
            <p style="margin:5px 0 0;font-size:14px;opacity:0.9;">${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</p>
          </div>
          <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Faturamento Acumulado</td>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:bold;text-align:right;color:#059669;font-size:18px;">${fmt(totalFat)}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Meta do Mês</td>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:bold;text-align:right;">${fmt(metaMensal)}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Atingimento</td>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:bold;text-align:right;color:#059669;">${pct}%</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#6b7280;">Viaturas Ativas</td>
                <td style="padding:10px 0;font-weight:bold;text-align:right;">${activeCount}</td>
              </tr>
            </table>
            <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">Torres Vigilância Patrimonial — Sistema de Gestão</p>
          </div>
        </div>
      `,
    });

    await supabaseAdmin.from("system_settings").insert({ key: monthKey, value: `${totalFat}` });
    log(`CRON Meta: ✅ Meta atingida! ${fmt(totalFat)} / ${fmt(metaMensal)} (${pct}%) — e-mail enviado`, "cron");
  } catch (err: any) {
    log(`CRON Meta: Erro ao verificar meta: ${err.message}`, "cron");
  }
}

export function initCronJobs() {
  if (!shouldRunBackgroundJobs()) return;

  const fire = (bucket: CronBucket) => () => {
    runCronBucket(bucket).catch((e) => log(`CRON bucket ${bucket}: ${e?.message}`, "cron"));
  };

  cron.schedule("* * * * *", fire("minute"));
  cron.schedule("*/3 * * * *", fire("three-min"));
  cron.schedule("*/5 * * * *", fire("five-min"));
  cron.schedule("*/10 * * * *", fire("ten-min"));
  cron.schedule("*/15 * * * *", fire("fifteen-min"));
  cron.schedule("*/30 * * * *", fire("thirty-min"));
  log("CRON: buckets ativos (minute, three-min, five-min, ten-min, fifteen-min, thirty-min) + jobs diários BRT via minute", "cron");
}

const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

/**
 * Verifica funcionários ativos sem holerite emitido OU com holerite pendente
 * de assinatura referente ao mês anterior, e envia e-mail à Diretoria.
 * `year`/`month` referem-se ao mês CORRENTE (a verificação é do anterior).
 */
export async function sendPayslipReminderToDiretoria(year: number, month: number) {
  // Mês de referência = anterior ao corrente
  let refYear = year, refMonth = month - 1;
  if (refMonth === 0) { refMonth = 12; refYear -= 1; }

  // Funcionários ativos
  const { data: emps } = await supabaseAdmin
    .from("employees")
    .select("id, name, role, status, matricula")
    .eq("status", "ativo");
  const employees = emps || [];
  if (employees.length === 0) {
    log(`CRON LembreteHolerite: Nenhum funcionário ativo`, "cron");
    return;
  }

  // Holerites do mês de referência
  const { data: psRows } = await supabaseAdmin
    .from("employee_payslips")
    .select("id, employee_id, assinatura_status")
    .eq("year", refYear)
    .eq("month", refMonth);
  const psByEmp = new Map<number, any>();
  for (const r of psRows || []) psByEmp.set(r.employee_id, r);

  const semHolerite: any[] = [];
  const naoAssinados: any[] = [];
  for (const e of employees) {
    const ps = psByEmp.get(e.id);
    if (!ps) semHolerite.push(e);
    else if (ps.assinatura_status !== "assinado") naoAssinados.push({ ...e, payslipId: ps.id });
  }

  if (semHolerite.length === 0 && naoAssinados.length === 0) {
    log(`CRON LembreteHolerite: Tudo em dia para ${MONTHS_PT[refMonth-1]}/${refYear}`, "cron");
    return;
  }

  const transporter = getCronMailTransporter();
  if (!transporter) {
    log(`CRON LembreteHolerite: Pendências encontradas (${semHolerite.length} sem holerite, ${naoAssinados.length} sem assinatura) mas SMTP não configurado`, "cron");
    return;
  }
  const recipients = getDiretoriaRecipients();
  if (recipients.length === 0) {
    log(`CRON LembreteHolerite: Sem destinatários da Diretoria configurados`, "cron");
    return;
  }

  const monthLabel = `${MONTHS_PT[refMonth-1]}/${refYear}`;
  const row = (e: any) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${e.matricula || "—"}</td><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${e.name}</td><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#64748b;">${e.role || "—"}</td></tr>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:20px;">
      <div style="background:#1e293b;color:#fff;padding:18px;border-radius:10px 10px 0 0;">
        <h1 style="margin:0;font-size:20px;">Lembrete — Holerites ${monthLabel}</h1>
        <p style="margin:6px 0 0;font-size:13px;opacity:0.85;">Hoje é o 5º dia útil. Pendências detectadas:</p>
      </div>
      <div style="background:#f9fafb;padding:18px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;">
        ${semHolerite.length > 0 ? `
          <h2 style="margin:0 0 8px;color:#b91c1c;font-size:15px;">Sem holerite emitido (${semHolerite.length})</h2>
          <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:16px;">
            <thead><tr style="background:#fef2f2;"><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#7f1d1d;">Matrícula</th><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#7f1d1d;">Funcionário</th><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#7f1d1d;">Cargo</th></tr></thead>
            <tbody>${semHolerite.map(row).join("")}</tbody>
          </table>
        ` : ""}
        ${naoAssinados.length > 0 ? `
          <h2 style="margin:0 0 8px;color:#a16207;font-size:15px;">Holerite emitido mas pendente de assinatura (${naoAssinados.length})</h2>
          <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
            <thead><tr style="background:#fef3c7;"><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#78350f;">Matrícula</th><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#78350f;">Funcionário</th><th style="padding:8px 10px;font-size:11px;text-transform:uppercase;text-align:left;color:#78350f;">Cargo</th></tr></thead>
            <tbody>${naoAssinados.map(row).join("")}</tbody>
          </table>
        ` : ""}
        <p style="margin-top:16px;font-size:11px;color:#64748b;">Lembrete automático disparado pelo sistema às 09:00 BRT do 5º dia útil. Acesse Gestão de Holerites para emitir/conferir.</p>
      </div>
    </div>`;

  await transporter.sendMail({
    from: process.env.SMTP_USER || process.env.EMAIL_USER,
    to: recipients.join(","),
    bcc: process.env.SMTP_BCC ? process.env.SMTP_BCC.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : undefined,
    subject: `Lembrete — Holerites ${monthLabel}: ${semHolerite.length + naoAssinados.length} pendência(s)`,
    html,
  });
  log(`CRON LembreteHolerite: E-mail enviado — ${semHolerite.length} sem holerite, ${naoAssinados.length} sem assinatura (ref. ${monthLabel})`, "cron");
}

// ============================================================
// CRON: Lembrete diário 09:00 BRT — comprovantes de pagamento faltando
// + lançamentos AGUARDANDO_APROVACAO há mais de 1 dia
// ============================================================
export async function sendComprovantesPendentesEmail() {
  try {
    const MISSION_CATEGORIES = ["CUSTOS DE MISSÃO", "COMBUSTÍVEL", "CUSTOS DE MISSAO", "COMBUSTIVEL"];
    const { data: pagosSemCompRaw } = await supabaseAdmin
      .from("financial_transactions")
      .select("id, description, amount, payment_date, entity_name, created_by, solicitado_por, category_name, origin_type")
      .eq("type", "EXPENSE")
      .eq("status", "PAID")
      .is("comprovante_url", null)
      .or("origin_type.is.null,origin_type.eq.manual")
      .order("payment_date", { ascending: true })
      .limit(200);
    const pagosSemComp = (pagosSemCompRaw || []).filter((t: any) =>
      !MISSION_CATEGORIES.includes(String(t.category_name || "").toUpperCase())
    );

    // Aguardando aprovação há MAIS DE 1 DIA (criados antes de "agora - 24h" em BRT).
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: aguardando } = await supabaseAdmin
      .from("financial_transactions")
      .select("id, description, amount, due_date, entity_name, solicitado_por, created_at")
      .eq("status", "AGUARDANDO_APROVACAO")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(200);

    const semComp = (pagosSemComp || []);
    const pendApro = (aguardando || []);

    if (semComp.length === 0 && pendApro.length === 0) return;

    const transporter = getCronMailTransporter();
    if (!transporter) {
      log(`CRON Comprovantes: ${semComp.length} pendentes / ${pendApro.length} aguardando — SMTP não configurado`, "cron");
      return;
    }
    const recipients = await getAprovacaoRecipients();
    if (recipients.length === 0) return;

    const fmtMoney = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const fmtDate = (d: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
    const totalSemComp = semComp.reduce((s, t: any) => s + Number(t.amount || 0), 0);
    const totalAprov = pendApro.reduce((s, t: any) => s + Number(t.amount || 0), 0);

    const rowsSem = semComp.slice(0, 50).map((t: any) =>
      `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${fmtDate(t.payment_date)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${(t.description || "").toUpperCase()}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${(t.entity_name || "—").toUpperCase()}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;">${fmtMoney(Number(t.amount))}</td></tr>`
    ).join("");

    const rowsApro = pendApro.slice(0, 50).map((t: any) =>
      `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${fmtDate(t.due_date)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${(t.description || "").toUpperCase()}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${(t.entity_name || "—").toUpperCase()}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${(t.solicitado_por || "—")}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;">${fmtMoney(Number(t.amount))}</td></tr>`
    ).join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:20px;color:#111;">
        <h2 style="margin:0 0 4px;">Lembrete Financeiro — ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</h2>
        <p style="margin:0 0 16px;color:#555;font-size:13px;">Torres Vigilância Patrimonial — Pendências de Contas a Pagar</p>

        ${pendApro.length > 0 ? `
        <h3 style="background:#fde68a;color:#92400e;padding:8px 12px;border-radius:6px;margin:16px 0 8px;">Aguardando Aprovação Diretoria — ${pendApro.length} (${fmtMoney(totalAprov)})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f3f4f6;"><th style="padding:6px 8px;text-align:left;">Vencimento</th><th style="padding:6px 8px;text-align:left;">Descrição</th><th style="padding:6px 8px;text-align:left;">Favorecido</th><th style="padding:6px 8px;text-align:left;">Solicitante</th><th style="padding:6px 8px;text-align:right;">Valor</th></tr></thead>
          <tbody>${rowsApro}</tbody>
        </table>` : ""}

        ${semComp.length > 0 ? `
        <h3 style="background:#fecaca;color:#991b1b;padding:8px 12px;border-radius:6px;margin:24px 0 8px;">Pagamentos Sem Comprovante Anexado — ${semComp.length} (${fmtMoney(totalSemComp)})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f3f4f6;"><th style="padding:6px 8px;text-align:left;">Pagamento</th><th style="padding:6px 8px;text-align:left;">Descrição</th><th style="padding:6px 8px;text-align:left;">Favorecido</th><th style="padding:6px 8px;text-align:right;">Valor</th></tr></thead>
          <tbody>${rowsSem}</tbody>
        </table>
        <p style="margin:12px 0 0;font-size:11px;color:#666;">Anexe o comprovante em <strong>Financeiro &rarr; Contas a Pagar</strong>.</p>` : ""}

        <p style="margin:24px 0 0;font-size:10px;color:#999;text-align:center;">E-mail automático — Sistema de Gestão Torres</p>
      </div>`;

    const extraBcc = process.env.SMTP_BCC ? process.env.SMTP_BCC.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : [];
    const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.EMAIL_USER;
    await transporter.sendMail({
      from: fromAddr,
      to: fromAddr,
      bcc: Array.from(new Set([...recipients, ...extraBcc])),
      subject: `Financeiro — ${pendApro.length} aguardando aprovação · ${semComp.length} sem comprovante`,
      html,
    });
    log(`CRON Comprovantes: e-mail enviado — ${pendApro.length} aprovação · ${semComp.length} sem comprovante`, "cron");
  } catch (e: any) {
    log(`CRON Comprovantes: erro: ${e.message}`, "cron");
  }
}

export { sendVencimentosDoDiaEmail } from "./email-vencimentos";

// (implementação extraída para ./email-vencimentos.ts pra permitir testes
// isolados sem subir o servidor inteiro). O bloco abaixo é mantido apenas
// como referência morta — não é exportado.
function getCronMailTransporter() {
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

const DIRETORIA_EMAIL_DEFAULT = "diretoria@torresseguranca.com.br";
function getDiretoriaRecipients(): string[] {
  const raw = process.env.DIRETORIA_EMAIL || DIRETORIA_EMAIL_DEFAULT;
  return raw.split(/[,;]+/).map(s => s.trim()).filter(s => /.+@.+\..+/.test(s));
}

// Resolve destinatários do fluxo de aprovação: Simone (admin) + Mickael (diretoria)
// via tabela users; faz fallback para getDiretoriaRecipients() se nada encontrado.
async function getAprovacaoRecipients(): Promise<string[]> {
  // Destinatários OBRIGATÓRIOS (Simone administrativa + Mickael diretoria).
  // Podem ser sobrescritos por env APROVACAO_EMAILS=email1,email2.
  const REQUIRED = (process.env.APROVACAO_EMAILS_REQUIRED ||
    "simone@torresseguranca.com.br,mickael@torresseguranca.com.br")
    .split(",").map(s => s.trim()).filter(e => /.+@.+\..+/.test(e));
  const collected = new Set<string>(REQUIRED);
  try {
    const { data } = await supabaseAdmin
      .from("users")
      .select("name, email, role")
      .or("role.eq.diretoria,name.ilike.%simone%,name.ilike.%mickael%");
    for (const u of (data || [])) {
      const e = String((u as any)?.email || "").trim();
      if (/.+@.+\..+/.test(e)) collected.add(e);
    }
  } catch (e) { /* mantém apenas os obrigatórios */ }
  return Array.from(collected);
}


function fmtBR(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtBRTDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function pctBarColor(pct: number): string {
  if (pct >= 100) return "#16a34a";
  if (pct >= 70) return "#2563eb";
  if (pct >= 40) return "#a16207";
  return "#dc2626";
}

function statusBadgeHtml(status: string): string {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    em_andamento: { bg: "#dbeafe", color: "#1d4ed8", label: "Em Andamento" },
    concluida: { bg: "#dcfce7", color: "#15803d", label: "Concluída" },
    "concluída": { bg: "#dcfce7", color: "#15803d", label: "Concluída" },
    agendada: { bg: "#fef3c7", color: "#a16207", label: "Agendada" },
    aberta: { bg: "#e0e7ff", color: "#4338ca", label: "Aberta" },
    cancelada: { bg: "#fee2e2", color: "#b91c1c", label: "Cancelada" },
    recusada: { bg: "#fee2e2", color: "#b91c1c", label: "Recusada" },
  };
  const s = map[status] || { bg: "#f1f5f9", color: "#475569", label: status };
  return `<span style="display:inline-block;background:${s.bg};color:${s.color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap;">${s.label}</span>`;
}

function metaBlockHtml(label: string, periodo: string, fat: number, meta: number, pct: number): string {
  const color = pctBarColor(pct);
  const barPct = Math.max(2, Math.min(100, pct));
  return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:10px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:12px;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${label}</td>
          <td style="text-align:right;font-size:12px;color:#64748b;">${periodo}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top:6px;">
            <span style="font-size:18px;font-weight:700;color:#1e293b;">R$ ${fmtBR(fat)}</span>
            <span style="font-size:12px;color:#64748b;"> / R$ ${fmtBR(meta)}</span>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top:8px;">
            <div style="background:#f1f5f9;border-radius:6px;height:8px;overflow:hidden;">
              <div style="background:${color};height:8px;width:${barPct}%;"></div>
            </div>
            <div style="text-align:right;font-size:12px;font-weight:700;color:${color};margin-top:4px;">${pct.toFixed(1)}% da meta</div>
          </td>
        </tr>
      </table>
    </div>`;
}

export async function sendDailySummaryEmail(targetDate?: string): Promise<{ success: boolean; message: string }> {
  const transporter = getCronMailTransporter();
  if (!transporter) {
    return { success: false, message: "SMTP não configurado" };
  }

  try {
    const snap = await getDiretoriaSnapshot(targetDate);

    const osCards = snap.ordens.slice(0, 30).map(o => {
      const fatDisplay = o.isLive ? `R$ ${fmtBR(o.fatLive)} <span style="font-size:10px;color:#2563eb;font-weight:600;">(ao vivo)</span>` : `R$ ${fmtBR(o.fat)}`;
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;">
        <tr><td style="padding:10px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:13px;font-weight:700;color:#1e293b;">${o.osNumber}</td>
              <td style="text-align:right;">${statusBadgeHtml(o.status)}</td>
            </tr>
            <tr><td colspan="2" style="padding-top:6px;font-size:13px;color:#475569;line-height:1.35;">${o.clientName}</td></tr>
            <tr>
              <td style="padding-top:8px;font-size:12px;color:#64748b;">Faturamento<br><span style="font-size:14px;font-weight:700;color:#16a34a;">${fatDisplay}</span></td>
              <td style="padding-top:8px;text-align:right;font-size:12px;color:#64748b;">Custo<br><span style="font-size:14px;font-weight:700;color:#dc2626;">R$ ${fmtBR(o.custo)}</span></td>
            </tr>
          </table>
        </td></tr>
      </table>`;
    }).join("");

    const margemColor = snap.dia.margem >= 30 ? "#16a34a" : snap.dia.margem >= 15 ? "#ca8a04" : "#dc2626";

    const asaasHtml = snap.asaas.connected
      ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-left:4px solid #059669;border-radius:8px;padding:14px 16px;margin-bottom:14px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#047857;font-weight:600;">Saldo Total — Asaas</div>
          <div style="font-size:24px;font-weight:700;color:#059669;margin-top:4px;">R$ ${fmtBR(Number(snap.asaas.balance) || 0)}</div>
          <div style="font-size:11px;color:#047857;margin-top:6px;line-height:1.5;">
            Saldo atual: <strong>R$ ${fmtBR(Number(snap.asaas.saldoAtual) || 0)}</strong>
            &nbsp;·&nbsp; A receber: <strong>R$ ${fmtBR(Number(snap.asaas.saldoAReceber) || 0)}</strong>
          </div>
        </div>`
      : `<div style="background:#fef3c7;border:1px solid #fde68a;border-left:4px solid #ca8a04;border-radius:8px;padding:14px 16px;margin-bottom:14px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#92400e;font-weight:600;">Saldo Asaas</div>
          <div style="font-size:13px;color:#92400e;margin-top:4px;">${snap.asaas.message || "Indisponível"}</div>
        </div>`;

    const fmtPeriodo = (a: string, b: string) => {
      const f = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      return `${f(a)} → ${f(b)}`;
    };

    const fatLiveBadge = snap.dia.fatExtraLive > 0
      ? `<div style="font-size:11px;color:#2563eb;margin-top:4px;font-weight:600;">+ R$ ${fmtBR(snap.dia.fatExtraLive)} ao vivo (HE em andamento)</div>`
      : "";

    const gastosCatRows = snap.gastosMes.porCategoria.slice(0, 8).map(g => `
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#475569;border-bottom:1px solid #f1f5f9;">${g.categoria}</td>
        <td style="padding:8px 0;font-size:13px;font-weight:700;text-align:right;color:#dc2626;border-bottom:1px solid #f1f5f9;white-space:nowrap;">R$ ${fmtBR(g.valor)}</td>
        <td style="padding:8px 0 8px 8px;font-size:11px;color:#64748b;text-align:right;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${g.pct.toFixed(1)}%</td>
      </tr>`).join("");

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    @media only screen and (max-width:600px){
      .container{width:100% !important;border-radius:0 !important;}
      .pad{padding:16px !important;}
      .kpi-cell{display:block !important;width:100% !important;margin-bottom:10px !important;}
      .kpi-value{font-size:26px !important;}
      .hero-title{font-size:20px !important;}
    }
  </style>
</head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f3f4f6;margin:0;padding:0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:12px 0;">
    <tr><td align="center">
      <table role="presentation" class="container" width="650" cellpadding="0" cellspacing="0" style="max-width:650px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <tr><td class="pad" style="background:linear-gradient(135deg,#1e293b,#334155);padding:24px 30px;color:#fff;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;opacity:0.7;">Torres Vigilância Patrimonial</div>
          <div class="hero-title" style="font-size:24px;font-weight:700;margin-top:4px;">Resumo Financeiro — Diretoria</div>
          <div style="font-size:14px;opacity:0.85;margin-top:4px;">${snap.diaSemana}, ${snap.dataLabel}</div>
          <div style="font-size:11px;opacity:0.6;margin-top:6px;">Gerado em ${fmtBRTDateTime(snap.generatedAt)} (BRT)</div>
        </td></tr>

        <tr><td class="pad" style="padding:20px 24px;">

          ${asaasHtml}

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td class="kpi-cell" valign="top" width="33%" style="padding-right:6px;">
                <div style="background:#f0fdf4;border-radius:8px;padding:14px;border-left:4px solid #16a34a;">
                  <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Faturamento Hoje</div>
                  <div class="kpi-value" style="font-size:20px;font-weight:700;color:#16a34a;margin-top:4px;">R$ ${fmtBR(snap.dia.fatLive)}</div>
                  ${fatLiveBadge}
                </div>
              </td>
              <td class="kpi-cell" valign="top" width="33%" style="padding:0 3px;">
                <div style="background:#fef2f2;border-radius:8px;padding:14px;border-left:4px solid #dc2626;">
                  <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Custos Hoje</div>
                  <div class="kpi-value" style="font-size:20px;font-weight:700;color:#dc2626;margin-top:4px;">R$ ${fmtBR(snap.dia.custoTotal)}</div>
                </div>
              </td>
              <td class="kpi-cell" valign="top" width="33%" style="padding-left:6px;">
                <div style="background:#eff6ff;border-radius:8px;padding:14px;border-left:4px solid #2563eb;">
                  <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Resultado</div>
                  <div class="kpi-value" style="font-size:20px;font-weight:700;color:${snap.dia.resultado >= 0 ? "#2563eb" : "#dc2626"};margin-top:4px;">R$ ${fmtBR(snap.dia.resultado)}</div>
                </div>
              </td>
            </tr>
          </table>

          <div style="font-size:14px;font-weight:700;color:#1e293b;margin:8px 0 10px;text-transform:uppercase;letter-spacing:0.5px;">Faturamento × Meta</div>
          ${metaBlockHtml("Hoje", snap.dataLabel, snap.dia.fatLive, snap.meta.diaria, snap.dia.pctMeta)}
          ${metaBlockHtml("Semana", fmtPeriodo(snap.semana.inicio, snap.semana.fim), snap.semana.fat, snap.semana.meta, snap.semana.pct)}
          ${metaBlockHtml("Mês", fmtPeriodo(snap.mes.inicio, snap.mes.fim), snap.mes.fat, snap.mes.meta, snap.mes.pct)}
          <div style="font-size:11px;color:#64748b;margin:-4px 0 16px;">Meta: R$ ${fmtBR(snap.meta.diariaPorViatura)} por viatura/dia × ${snap.meta.viaturasAtivas} ativa(s)</div>

          <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Margem de Lucro</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:${margemColor};">${fmtBR(snap.dia.margem)}%</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">KM Total Rodados</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;">${fmtBR(snap.dia.kmTotal)} km</td>
            </tr>
            ${snap.dia.despPedagio > 0 ? `<tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Pedágio (Escoltas)</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:#dc2626;">R$ ${fmtBR(snap.dia.despPedagio)}</td>
            </tr>` : ""}
            ${snap.dia.despCombustivel > 0 ? `<tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Combustível (Escoltas)</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:#dc2626;">R$ ${fmtBR(snap.dia.despCombustivel)}</td>
            </tr>` : ""}
            ${snap.dia.receitasAvulsas > 0 ? `<tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Receitas Avulsas</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:#16a34a;">R$ ${fmtBR(snap.dia.receitasAvulsas)}</td>
            </tr>` : ""}
            ${snap.dia.despesasAvulsas > 0 ? `<tr>
              <td style="padding:8px 0;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Despesas Avulsas</td>
              <td style="padding:8px 0;font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;color:#dc2626;">R$ ${fmtBR(snap.dia.despesasAvulsas)}</td>
            </tr>` : ""}
          </table>

          <div style="background:${snap.analiseCustoKm.status.bg};border-radius:8px;padding:14px 16px;margin-bottom:20px;border-left:4px solid ${snap.analiseCustoKm.status.color};">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#475569;font-weight:600;">Análise de Custo por KM</div>
            <div style="font-size:16px;font-weight:700;color:${snap.analiseCustoKm.status.color};margin-top:4px;">${snap.analiseCustoKm.status.label}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
              <tr><td style="font-size:12px;color:#64748b;padding:4px 0;">Hoje (custo/km)</td><td style="font-size:13px;font-weight:700;text-align:right;color:#1e293b;padding:4px 0;">R$ ${fmtBR(snap.analiseCustoKm.custoPorKmHoje)}/km</td></tr>
              <tr><td style="font-size:12px;color:#64748b;padding:4px 0;">Média 30 dias</td><td style="font-size:13px;font-weight:700;text-align:right;color:#1e293b;padding:4px 0;">R$ ${fmtBR(snap.analiseCustoKm.custoPorKmHist)}/km</td></tr>
              ${snap.analiseCustoKm.custoPorKmHist > 0 && snap.analiseCustoKm.custoPorKmHoje > 0 ? `<tr><td style="font-size:12px;color:#64748b;padding:4px 0;">Variação</td><td style="font-size:13px;font-weight:700;text-align:right;color:${snap.analiseCustoKm.status.color};padding:4px 0;">${snap.analiseCustoKm.variacaoPct >= 0 ? "+" : ""}${snap.analiseCustoKm.variacaoPct.toFixed(1)}%</td></tr>` : ""}
            </table>
            <div style="font-size:12px;color:#475569;margin-top:8px;line-height:1.4;">${snap.analiseCustoKm.status.msg}</div>
          </div>

          ${snap.gastosMes.total > 0 ? `
          <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">
              <div style="font-size:14px;font-weight:700;color:#334155;">Gastos do Mês por Categoria</div>
              <div style="font-size:13px;font-weight:700;color:#dc2626;">R$ ${fmtBR(snap.gastosMes.total)}</div>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              ${gastosCatRows}
            </table>
          </div>
          ` : ""}

          <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px;">
            <div style="font-size:14px;font-weight:700;margin-bottom:12px;color:#334155;">Operações do Dia</div>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Total de OS</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;">${snap.ops.totalOS}</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Escoltas</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;">${snap.ops.escoltas}</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Concluídas</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;color:#16a34a;">${snap.ops.concluidas}</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Em Andamento</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;color:#2563eb;">${snap.ops.emAndamento}</td></tr>
              ${snap.ops.canceladas > 0 ? `<tr><td style="padding:6px 0;font-size:13px;color:#666;">Canceladas/Recusadas</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;color:#dc2626;">${snap.ops.canceladas}</td></tr>` : ""}
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Efetivo Ativo</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;">${snap.ops.agentesAtivos} agentes</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#666;">Viaturas Ativas</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;">${snap.meta.viaturasAtivas}</td></tr>
            </table>
          </div>

          ${snap.ordens.length > 0 ? `
          <div style="margin-bottom:20px;">
            <div style="font-size:14px;font-weight:700;margin-bottom:10px;color:#334155;">Detalhamento por OS</div>
            ${osCards}
          </div>
          ` : ""}

        </td></tr>

        <tr><td class="pad" style="background:#f8fafc;padding:16px 24px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
          Torres Vigilância Patrimonial — CNPJ 36.982.392/0001-89
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const from = `"Torres Vigilância - Sistema" <${process.env.SMTP_FROM || process.env.SMTP_USER || "escolta@torresseguranca.com.br"}>`;

    const recipients = getDiretoriaRecipients();
    if (recipients.length === 0) {
      const msg = "Nenhum destinatário válido configurado (defina DIRETORIA_EMAIL com lista separada por vírgula)";
      log(`CRON ResumoDiario: ${msg}`, "cron");
      return { success: false, message: msg };
    }

    try {
      const info = await transporter.sendMail({
        from,
        to: recipients.join(", "),
        subject: `📊 Resumo Diretoria — ${snap.dataLabel} | Fat. R$ ${fmtBR(snap.dia.fatLive)} | Resultado R$ ${fmtBR(snap.dia.resultado)}`,
        html,
      });
      log(`CRON ResumoDiario: E-mail enviado para [${recipients.join(", ")}] (msgId=${info.messageId}, accepted=${(info.accepted||[]).length}, rejected=${(info.rejected||[]).length}) — Fat. R$ ${fmtBR(snap.dia.fatLive)} | Resultado R$ ${fmtBR(snap.dia.resultado)}`, "cron");
      return { success: true, message: `E-mail enviado para ${recipients.join(", ")}` };
    } catch (sendErr: any) {
      log(`CRON ResumoDiario: Falha SMTP ao enviar para [${recipients.join(", ")}]: ${sendErr.message} (code=${sendErr.code || "?"}, response=${sendErr.response || "?"})`, "cron");
      return { success: false, message: `Falha SMTP: ${sendErr.message}` };
    }
  } catch (err: any) {
    log(`CRON ResumoDiario: Erro: ${err.message}`, "cron");
    return { success: false, message: err.message };
  }
}

async function sendOverdueReminders() {
  const transporter = getCronMailTransporter();
  if (!transporter) {
    log("CRON CobrançaVencidos: SMTP não configurado — lembretes não enviados", "cron");
    return;
  }

  const today = new Date().toISOString().split("T")[0];

  const { data: overdueInvoices, error } = await supabaseAdmin
    .from("invoices")
    .select("id, client_id, client_name, client_cpf_cnpj, value, due_date, description, invoice_url, bank_slip_url, pix_copia_e_cola, billing_type, status, nfse_status, reminder_count, last_reminder_sent_at")
    .lt("due_date", today)
    .not("status", "in", '("RECEIVED","CONFIRMED","RECEIVED_IN_CASH","CANCELLED","CANCELED")');

  if (error) {
    log(`CRON CobrançaVencidos: Erro ao buscar faturas vencidas: ${error.message}`, "cron");
    return;
  }

  if (!overdueInvoices || overdueInvoices.length === 0) {
    log("CRON CobrançaVencidos: Nenhuma fatura vencida encontrada", "cron");
    return;
  }

  const validOverdue = overdueInvoices.filter((inv: any) => {
    const nfStatus = String(inv.nfse_status || "").toUpperCase();
    if (nfStatus.includes("CANCEL")) return false;
    const lastSent = inv.last_reminder_sent_at ? new Date(inv.last_reminder_sent_at).toISOString().split("T")[0] : null;
    if (lastSent === today) return false;
    return true;
  });

  if (validOverdue.length === 0) {
    log("CRON CobrançaVencidos: Todas as faturas vencidas já receberam lembrete hoje", "cron");
    return;
  }

  let sent = 0;
  let skipped = 0;

  for (const inv of validOverdue) {
    try {
      const { data: clientData } = await supabaseAdmin
        .from("clients")
        .select("email, email_financeiro, name")
        .eq("id", inv.client_id)
        .single();

      const clientEmail = clientData?.email_financeiro || clientData?.email;
      if (!clientEmail) {
        log(`CRON CobrançaVencidos: Fatura #${inv.id} (${inv.client_name}) — cliente sem e-mail cadastrado`, "cron");
        skipped++;
        continue;
      }

      const dueDate = new Date(inv.due_date + "T12:00:00");
      const todayDate = new Date(today + "T12:00:00");
      const diffMs = todayDate.getTime() - dueDate.getTime();
      const diasAtraso = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const dueDateFmt = dueDate.toLocaleDateString("pt-BR");
      const valueFmt = Number(inv.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const reminderNum = (inv.reminder_count || 0) + 1;

      const links: string[] = [];
      if (inv.invoice_url) {
        links.push(`<a href="${inv.invoice_url}" style="display:inline-block;background:#1a1a2e;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;margin:4px;">📄 VER FATURA</a>`);
      }
      if (inv.bank_slip_url) {
        links.push(`<a href="${inv.bank_slip_url}" style="display:inline-block;background:#0066cc;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;margin:4px;">🏦 BOLETO BANCÁRIO</a>`);
      }

      let pixSection = "";
      if (inv.pix_copia_e_cola) {
        pixSection = `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="font-size:13px;font-weight:bold;color:#166534;margin:0 0 8px;">Pagamento via PIX</p>
          <p style="font-size:11px;color:#15803d;margin:0 0 8px;">Copie o código abaixo e cole no app do seu banco:</p>
          <div style="background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:10px;word-break:break-all;font-family:monospace;font-size:11px;color:#374151;">
            ${inv.pix_copia_e_cola}
          </div>
        </div>`;
      }

      const urgencyColor = diasAtraso > 15 ? "#dc2626" : diasAtraso > 7 ? "#ea580c" : "#d97706";
      const urgencyLabel = diasAtraso > 15 ? "URGENTE" : diasAtraso > 7 ? "IMPORTANTE" : "LEMBRETE";

      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;">
<div style="max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <div style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#fff;font-size:18px;margin:0;">Torres Vigilância Patrimonial</h1>
    <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Cobrança — ${urgencyLabel}</p>
  </div>
  <div style="background:${urgencyColor};padding:12px 24px;text-align:center;">
    <p style="color:#fff;font-size:14px;font-weight:bold;margin:0;">⚠️ Fatura vencida há ${diasAtraso} dia${diasAtraso > 1 ? "s" : ""}</p>
  </div>
  <div style="padding:24px;">
    <p style="font-size:14px;color:#1a1a1a;margin:0 0 16px;">
      Prezado(a) <strong>${clientData?.name || inv.client_name}</strong>,
    </p>
    <p style="font-size:13px;color:#4a4a4a;line-height:1.6;margin:0 0 16px;">
      Identificamos que a fatura abaixo encontra-se <strong style="color:${urgencyColor};">vencida há ${diasAtraso} dia${diasAtraso > 1 ? "s" : ""}</strong>. 
      Solicitamos a gentileza de providenciar o pagamento o mais breve possível para evitar encargos adicionais.
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:0 0 20px;">
      <table style="width:100%;font-size:13px;color:#333;">
        <tr><td style="padding:4px 0;color:#666;">Descrição:</td><td style="padding:4px 0;font-weight:bold;text-align:right;">${inv.description || "Serviço de Escolta Armada"}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Valor:</td><td style="padding:4px 0;font-weight:bold;font-size:16px;color:#dc2626;text-align:right;">${valueFmt}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Vencimento:</td><td style="padding:4px 0;font-weight:bold;color:#dc2626;text-align:right;">${dueDateFmt}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Dias em atraso:</td><td style="padding:4px 0;font-weight:bold;color:${urgencyColor};text-align:right;">${diasAtraso} dia${diasAtraso > 1 ? "s" : ""}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Lembrete nº:</td><td style="padding:4px 0;text-align:right;">${reminderNum}</td></tr>
      </table>
    </div>
    ${links.length > 0 ? `<div style="text-align:center;margin:20px 0;">${links.join("\n")}</div>` : ""}
    ${pixSection}
    <p style="font-size:12px;color:#666;line-height:1.5;margin:20px 0 0;">
      Caso o pagamento já tenha sido efetuado, por favor desconsidere este aviso e nos envie o comprovante para registro.
    </p>
    <p style="font-size:12px;color:#888;line-height:1.5;margin:12px 0 0;">
      Em caso de dúvidas, entre em contato conosco pelo e-mail 
      <a href="mailto:financeiro@torresseguranca.com.br" style="color:#1a1a2e;">financeiro@torresseguranca.com.br</a> 
      ou pelo telefone (11) 96369-6699.
    </p>
  </div>
  <div style="background:#f8f9fa;padding:16px;text-align:center;border-top:1px solid #eee;">
    <p style="color:#888;font-size:11px;margin:2px 0;"><strong>Torres Vigilância Patrimonial</strong></p>
    <p style="color:#999;font-size:10px;margin:2px 0;">CNPJ 36.982.392/0001-89</p>
    <p style="color:#999;font-size:10px;margin:2px 0;">📞 (11) 96369-6699 | ✉️ financeiro@torresseguranca.com.br</p>
  </div>
</div>
</body></html>`;

      const from = `"Torres Vigilância - Financeiro" <${process.env.SMTP_FROM || process.env.SMTP_USER || "escolta@torresseguranca.com.br"}>`;

      await transporter.sendMail({
        from,
        to: clientEmail,
        bcc: ["thiago@grupotmseg.com.br", "financeiro@torresseguranca.com.br"],
        subject: `⚠️ ${urgencyLabel}: Fatura vencida há ${diasAtraso} dias — ${valueFmt} — Torres Segurança`,
        html,
      });

      await supabaseAdmin.from("invoices").update({
        last_reminder_sent_at: new Date().toISOString(),
        reminder_count: reminderNum,
      }).eq("id", inv.id);

      log(`CRON CobrançaVencidos: ✓ Lembrete #${reminderNum} enviado — Fatura #${inv.id} (${inv.client_name}) ${valueFmt} vencida há ${diasAtraso}d → ${clientEmail}`, "cron");
      sent++;

      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err: any) {
      log(`CRON CobrançaVencidos: ✗ Erro fatura #${inv.id}: ${err.message}`, "cron");
    }
  }

  log(`CRON CobrançaVencidos: Concluído — ${sent} lembrete(s) enviado(s), ${skipped} sem e-mail`, "cron");

  if (sent > 0) {
    await supabaseAdmin.from("audit_logs").insert({
      user_name: "SISTEMA", user_role: "system",
      action: "CRON_COBRANCA_VENCIDOS",
      details: `${sent} lembrete(s) de cobrança enviado(s) para faturas vencidas. ${skipped} sem e-mail.`,
    });
  }
}

export async function executeBillingCron() {
  const n = (v: any) => Number(v) || 0;
  const r = (v: number) => Math.round(v * 100) / 100;

  const cronStart = Date.now();

  const { data: allOrders } = await supabaseAdmin.from("service_orders").select("*");
  if (!allOrders?.length) return;

  const isConcluded = (so: any) =>
    ["concluida", "concluída", "cancelada", "recusada"].includes(so.status) ||
    ["encerrada", "finalizada"].includes(so.mission_status);

  const activeOrders = allOrders.filter((so: any) =>
    so.type === "escolta" &&
    !isConcluded(so) &&
    so.mission_status !== "aguardando"
  );

  const { data: existingBillingsStatus } = await supabaseAdmin.from("escort_billings").select("service_order_id, status");
  const billedSet = new Set((existingBillingsStatus || []).map((b: any) => b.service_order_id));
  const unverifBilledSet = new Set((existingBillingsStatus || []).filter((b: any) => b.status === "A_VERIFICAR").map((b: any) => b.service_order_id));
  const unbilledConcluded = allOrders.filter((so: any) =>
    so.type === "escolta" && isConcluded(so) && !billedSet.has(so.id)
  );
  const frozenUnverifCount = allOrders.filter((so: any) =>
    so.type === "escolta" && isConcluded(so) && unverifBilledSet.has(so.id)
  ).length;

  const seenIds = new Set<number>();
  const liveOrders = [...activeOrders, ...unbilledConcluded].filter((so: any) => {
    if (seenIds.has(so.id)) return false;
    seenIds.add(so.id);
    return true;
  });
  if (!liveOrders.length) {
    log(`CRON Billing: 0 OSs para processar, ${frozenUnverifCount} A_VERIFICAR congeladas`, "cron");
    return;
  }
  log(`CRON Billing: ${activeOrders.length} ativas + ${unbilledConcluded.length} concluídas sem billing processadas, ${frozenUnverifCount} A_VERIFICAR congeladas`, "cron");

  const { data: allContracts } = await supabaseAdmin.from("escort_contracts").select("*");
  const contractMap = new Map<number, any>();
  const clientContractMap = new Map<number, any>();
  for (const c of (allContracts || [])) {
    contractMap.set(c.id, c);
    if (c.status === "Ativo" && c.client_id) {
      clientContractMap.set(c.client_id, c);
    }
  }

  const liveOrderIds = liveOrders.map((so: any) => so.id);
  const clientIds = Array.from(new Set(liveOrders.map((so: any) => so.client_id).filter((v: any) => v != null)));
  const empIds = Array.from(new Set(liveOrders.flatMap((so: any) => [so.assigned_employee_id, so.assigned_employee_2_id]).filter((v: any) => v != null)));
  const vehIds = Array.from(new Set(liveOrders.map((so: any) => so.vehicle_id).filter((v: any) => v != null)));

  // Paginação: PostgREST limita default a 1000 rows. Buscar tudo em chunks.
  const fetchAllPaged = async <T = any>(table: string, columns: string, idCol: string, ids: number[], orderCol: string = "id"): Promise<T[]> => {
    const out: T[] = [];
    const pageSize = 1000;
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select(columns)
        .in(idCol, ids)
        .order(orderCol, { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const rows = (data || []) as T[];
      out.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return out;
  };

  const [photosArr, clientsRes, empsRes, vehsRes, mCostsArr, existBillsRes] = await Promise.all([
    fetchAllPaged<any>("mission_photos", "service_order_id, step, km_value", "service_order_id", liveOrderIds),
    clientIds.length ? supabaseAdmin.from("clients").select("id, name").in("id", clientIds) : Promise.resolve({ data: [] as any[] }),
    empIds.length ? supabaseAdmin.from("employees").select("id, name").in("id", empIds) : Promise.resolve({ data: [] as any[] }),
    vehIds.length ? supabaseAdmin.from("vehicles").select("id, plate").in("id", vehIds) : Promise.resolve({ data: [] as any[] }),
    fetchAllPaged<any>("mission_costs", "service_order_id, category, amount, cost_type", "service_order_id", liveOrderIds),
    supabaseAdmin.from("escort_billings").select("id, service_order_id, status").in("service_order_id", liveOrderIds),
  ]);

  const photosMap = new Map<number, any[]>();
  for (const p of photosArr) {
    if (!photosMap.has(p.service_order_id)) photosMap.set(p.service_order_id, []);
    photosMap.get(p.service_order_id)!.push(p);
  }
  const clientNameMap = new Map<number, string>((clientsRes.data || []).map((c: any) => [c.id, c.name]));
  const empNameMap = new Map<number, string>((empsRes.data || []).map((e: any) => [e.id, e.name]));
  const vehPlateMap = new Map<number, string>((vehsRes.data || []).map((v: any) => [v.id, v.plate]));
  const mCostsMap = new Map<number, any[]>();
  for (const c of mCostsArr) {
    if (!mCostsMap.has(c.service_order_id)) mCostsMap.set(c.service_order_id, []);
    mCostsMap.get(c.service_order_id)!.push(c);
  }
  const billingIdMap = new Map<number, number>((existBillsRes.data || []).map((b: any) => [b.service_order_id, b.id]));
  const billingStatusMap = new Map<number, string>((existBillsRes.data || []).map((b: any) => [b.service_order_id, b.status]));
  const FROZEN_STATUSES = new Set(["A_VERIFICAR", "APROVADA", "FATURADO", "FATURADA", "PAGO", "CANCELADO", "CANCELADA", "REJEITADA"]);

  const CHUNK_SIZE = 15;
  const processOne = async (so: any) => {
    try {
      const contrato = resolveContractForOs(so, contractMap, clientContractMap, { ...DEFAULT_BILLING_CONTRACT });

      const skipBillingHoursCron = shouldSkipBillingHours(so);
      const horasMissao = skipBillingHoursCron ? 0 : await getHorasElapsedFromDB(so.id);

      const photos = photosMap.get(so.id) || [];
      const mCosts = mCostsMap.get(so.id) || [];
      const cliName = so.client_id ? clientNameMap.get(so.client_id) || null : null;
      const empName = so.assigned_employee_id ? empNameMap.get(so.assigned_employee_id) || null : null;
      const emp2Name = so.assigned_employee_2_id ? empNameMap.get(so.assigned_employee_2_id) || null : null;
      const vehPlate = so.vehicle_id ? vehPlateMap.get(so.vehicle_id) || null : null;

      const billingPayload = computeBillingPayloadForOs({
        so, contrato, photos, mCosts, horasMissao,
        clientName: cliName, empName, emp2Name, vehPlate,
      });

      // Skip se billing está congelado (FATURADO/PAGO) — preserva imutabilidade financeira.
      const existId = billingIdMap.get(so.id);
      if (existId) {
        const existStatus = billingStatusMap.get(so.id);
        if (existStatus && FROZEN_STATUSES.has(existStatus)) {
          log(`CRON Billing: OS ${so.os_number} pulada — billing congelado (status=${existStatus})`, "cron");
          return;
        }
      }
      // UPSERT atômico via ON CONFLICT (service_order_id) — UNIQUE uniq_eb_so_id (db-init.ts).
      // Antes era SELECT-then-UPDATE/INSERT, vulnerável a race com outras chamadas paralelas.
      await supabaseAdmin.from("escort_billings")
        .upsert(billingPayload, { onConflict: "service_order_id" });

      log(`CRON Billing: OS ${so.os_number} recalculada - ${r(horasMissao)}h, ${n(billingPayload.km_total)}km, fat=${r(billingPayload.fat_total)}`, "cron");
    } catch (err: any) {
      log(`CRON Billing: Erro OS ${so.os_number}: ${err.message}`, "cron");
    }
  };

  for (let i = 0; i < liveOrders.length; i += CHUNK_SIZE) {
    const chunk = liveOrders.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map(processOne));
  }

  const elapsed = ((Date.now() - cronStart) / 1000).toFixed(1);
  log(`CRON Billing: Ciclo completo em ${elapsed}s (${liveOrders.length} OSs, chunks de ${CHUNK_SIZE})`, "cron");
}
