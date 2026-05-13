import nodemailer from "nodemailer";
import { supabaseAdmin } from "./supabase";

const VENCIMENTOS_RECIPIENTS_DEFAULT = [
  "adm@grupotmseg.com.br",
  "diretoria@torresseguranca.com.br",
];

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

function fmtBR(v: number): string {
  return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function sendVencimentosDoDiaEmail(opts?: {
  targetDate?: string;
  recipientsOverride?: string[];
}): Promise<{ success: boolean; message: string; pagar: number; receber: number; total: number }> {
  const transporter = getMailTransporter();
  if (!transporter) {
    return { success: false, message: "SMTP não configurado", pagar: 0, receber: 0, total: 0 };
  }
  const today = opts?.targetDate
    || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const recipients = (opts?.recipientsOverride && opts.recipientsOverride.length)
    ? opts.recipientsOverride
    : VENCIMENTOS_RECIPIENTS_DEFAULT;

  try {
    const { data, error } = await supabaseAdmin
      .from("financial_transactions")
      .select("id, type, status, due_date, description, amount, entity_name, fornecedor_id, category_name, solicitado_por")
      .eq("due_date", today)
      .eq("status", "PENDING")
      .order("type", { ascending: true })
      .order("amount", { ascending: false });
    if (error) throw error;

    const rows = data || [];

    const fornecedorIds = Array.from(new Set(rows.map(r => r.fornecedor_id).filter(Boolean)));
    const fornecedorMap = new Map<number, string>();
    if (fornecedorIds.length) {
      const { data: forn } = await supabaseAdmin
        .from("fornecedores")
        .select("id, razao_social, nome_fantasia")
        .in("id", fornecedorIds as number[]);
      for (const f of (forn || [])) {
        fornecedorMap.set((f as any).id, (f as any).razao_social || (f as any).nome_fantasia || "");
      }
    }

    const pagar = rows.filter(r => r.type === "EXPENSE");
    const receber = rows.filter(r => r.type === "INCOME");
    const totalPagar = pagar.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalReceber = receber.reduce((s, r) => s + Number(r.amount || 0), 0);

    const dataBR = new Date(today + "T12:00:00").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const renderTable = (lista: typeof rows, kind: "PAGAR" | "RECEBER") => {
      const headerColor = kind === "PAGAR" ? "#dc2626" : "#16a34a";
      const headerLabel = kind === "PAGAR" ? "Contas a Pagar" : "Contas a Receber";
      if (!lista.length) {
        return `
        <div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <div style="background:${headerColor};color:#fff;padding:10px 14px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${headerLabel} — ${dataBR}</div>
          <div style="padding:14px;background:#f9fafb;color:#6b7280;font-size:13px;font-style:italic;">Nenhum lançamento vencendo nesta data.</div>
        </div>`;
      }
      const linhas = lista.map(r => {
        const favorecido = (r.entity_name && r.entity_name.trim())
          || (r.fornecedor_id ? fornecedorMap.get(r.fornecedor_id) : "")
          || "—";
        return `
          <tr>
            <td style="padding:8px 10px;border-top:1px solid #e5e7eb;font-size:12px;color:#1f2937;">${escapeHtml(r.description || "—")}</td>
            <td style="padding:8px 10px;border-top:1px solid #e5e7eb;font-size:12px;color:#374151;">${escapeHtml(favorecido)}</td>
            <td style="padding:8px 10px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;">${escapeHtml(r.category_name || "—")}</td>
            <td style="padding:8px 10px;border-top:1px solid #e5e7eb;font-size:13px;color:${headerColor};font-weight:700;text-align:right;white-space:nowrap;">R$ ${fmtBR(Number(r.amount || 0))}</td>
          </tr>`;
      }).join("");
      const total = lista.reduce((s, r) => s + Number(r.amount || 0), 0);
      return `
      <div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <div style="background:${headerColor};color:#fff;padding:10px 14px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">
          ${headerLabel} — ${dataBR} · ${lista.length} lançamento(s) · R$ ${fmtBR(total)}
        </div>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#fff;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Descrição</th>
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Favorecido</th>
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Categoria</th>
              <th style="padding:8px 10px;text-align:right;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Valor</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`;
    };

    const saldoLiquido = totalReceber - totalPagar;
    const saldoColor = saldoLiquido >= 0 ? "#16a34a" : "#dc2626";

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:780px;margin:0 auto;background:#f9fafb;padding:20px;">
      <div style="background:#0f172a;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:0.7;">Torres Vigilância Patrimonial</div>
        <h1 style="margin:4px 0 0;font-size:20px;font-weight:800;">Vencimentos do Dia — ${dataBR}</h1>
      </div>
      <div style="background:#fff;padding:20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;">
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:18px;">
          <tr>
            <td style="width:33%;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;text-align:center;">
              <div style="font-size:10px;text-transform:uppercase;color:#991b1b;font-weight:700;">A Pagar Hoje</div>
              <div style="font-size:20px;font-weight:800;color:#dc2626;margin-top:4px;">R$ ${fmtBR(totalPagar)}</div>
              <div style="font-size:11px;color:#991b1b;">${pagar.length} lançamento(s)</div>
            </td>
            <td style="width:1%;"></td>
            <td style="width:33%;padding:12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;text-align:center;">
              <div style="font-size:10px;text-transform:uppercase;color:#065f46;font-weight:700;">A Receber Hoje</div>
              <div style="font-size:20px;font-weight:800;color:#16a34a;margin-top:4px;">R$ ${fmtBR(totalReceber)}</div>
              <div style="font-size:11px;color:#065f46;">${receber.length} lançamento(s)</div>
            </td>
            <td style="width:1%;"></td>
            <td style="width:33%;padding:12px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;text-align:center;">
              <div style="font-size:10px;text-transform:uppercase;color:#334155;font-weight:700;">Saldo Líquido do Dia</div>
              <div style="font-size:20px;font-weight:800;color:${saldoColor};margin-top:4px;">R$ ${fmtBR(saldoLiquido)}</div>
              <div style="font-size:11px;color:#334155;">Receber − Pagar</div>
            </td>
          </tr>
        </table>
        ${renderTable(receber, "RECEBER")}
        ${renderTable(pagar, "PAGAR")}
        <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;text-align:center;">
          Resumo gerado automaticamente às 07h (BRT) · Torres Vigilância Patrimonial<br>
          Lançamentos com status PENDING e vencimento em ${dataBR}.
        </p>
      </div>
    </div>`;

    const subject = `[Financeiro] Vencimentos ${dataBR} — Pagar R$ ${fmtBR(totalPagar)} · Receber R$ ${fmtBR(totalReceber)}`;
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipients,
      subject,
      html,
    });
    console.log(`[vencimentos] ${dataBR}: ${pagar.length} pagar (R$ ${fmtBR(totalPagar)}) + ${receber.length} receber (R$ ${fmtBR(totalReceber)}) → ${recipients.join(", ")}`);
    return { success: true, message: `E-mail enviado para ${recipients.join(", ")}`, pagar: pagar.length, receber: receber.length, total: rows.length };
  } catch (err: any) {
    console.error(`[vencimentos] ERRO: ${err.message}`);
    return { success: false, message: err.message, pagar: 0, receber: 0, total: 0 };
  }
}
