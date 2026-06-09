import { supabaseAdmin } from "../supabase";
import { createSmtpTransporter, getSmtpFrom } from "../routes/_helpers";
import {
  buildRequiredDocsCatalog,
  filterDocsCatalogByProfile,
  profileFromRole,
  DOCS_WITH_EXPIRY,
  RECICLAGEM_ESCOLTA_TYPE,
  isReciclagemDue,
} from "@shared/documents-catalog";

const ESCOLTA_EMAIL = "escolta@torresseguranca.com.br";
const ADM_EMAIL = "adm@torresseguranca.com.br";

// Lista de itens obrigatórios POR PERFIL (vigilante / admin). Auxiliar de
// Limpeza cai em "admin" via profileFromRole. Itens opcionais (Carteira de
// Vacinação, Comprovante de Formação Escolar, dependentes) NÃO entram no
// alerta diário de compliance — só aparecem no checklist visual da tela.
const FULL_CATALOG = buildRequiredDocsCatalog();
function mandatoryItemsForProfile(role?: string | null): { type: string; label: string }[] {
  const profile = profileFromRole(role);
  return filterDocsCatalogByProfile(FULL_CATALOG, profile)
    .filter(g => g.group !== "Dependentes (se necessário)")
    .flatMap(g => g.items.filter(i => !i.optional).map(i => ({ type: i.type, label: i.label })));
}

type ExpiredDoc = { type: string; label: string; expiryDate: string };
type EmployeeReport = {
  id: number;
  name: string;
  role: string;
  missing: { type: string; label: string }[];
  expired: ExpiredDoc[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Espelha exatamente `docExpiryStatus` do frontend (employees.tsx):
//   diffDays = (expiry - now) / 1 dia; vencido quando diffDays < 0.
// Como `expiry_date` é DATE (YYYY-MM-DD sem hora), tratamos como
// 00:00 BRT do dia da validade — assim, durante todo o dia do
// vencimento o documento já aparece como vencido (consistente com a tela).
function isExpired(expiryDate: string): boolean {
  const exp = new Date(`${expiryDate}T00:00:00-03:00`).getTime();
  return (exp - Date.now()) / 86_400_000 < 0;
}

export async function buildDocComplianceReport(): Promise<EmployeeReport[]> {
  const { data: employees, error: empErr } = await supabaseAdmin
    .from("employees")
    .select("id, name, role, status, photo_url, cnv_issue_date")
    .eq("status", "ativo")
    .order("name");
  if (empErr) throw new Error(`Falha ao carregar funcionários: ${empErr.message}`);
  if (!employees?.length) return [];

  const empIds = employees.map((e: any) => e.id);
  const { data: docs, error: docErr } = await supabaseAdmin
    .from("employee_documents")
    .select("id, employee_id, type, expiry_date")
    .in("employee_id", empIds);
  if (docErr) throw new Error(`Falha ao carregar documentos: ${docErr.message}`);

  const docsByEmp = new Map<number, any[]>();
  for (const d of (docs || [])) {
    if (!docsByEmp.has(d.employee_id)) docsByEmp.set(d.employee_id, []);
    docsByEmp.get(d.employee_id)!.push(d);
  }

  const report: EmployeeReport[] = [];

  for (const emp of employees as any[]) {
    const empDocs = docsByEmp.get(emp.id) || [];
    const hasType = (type: string) => {
      if (type === "Fotos 3x4" && emp.photo_url) return true;
      return empDocs.some(d => d.type === type);
    };

    const missing: { type: string; label: string }[] = [];
    const expired: ExpiredDoc[] = [];

    // Reciclagem de escolta armada só entra como pendência quando o CNV tem >= 2
    // anos a partir da data de emissão (vide isReciclagemDue). Sem data → não cobra.
    const mandatory = mandatoryItemsForProfile(emp.role)
      .filter(it => it.type !== RECICLAGEM_ESCOLTA_TYPE || isReciclagemDue(emp.cnv_issue_date));
    for (const item of mandatory) {
      // Compat: aceita "Antecedentes Criminais" do perfil admin como satisfeito
      // por qualquer um dos dois nomes antigos (Civil/Militar), pra não forçar
      // re-upload de quem cadastrou sob o nome antigo.
      const hasIt = item.type === "Antecedentes Criminais"
        ? (hasType("Antecedentes Criminais") || hasType("Antecedente Criminal Polícia Civil") || hasType("Antecedente Criminal Polícia Militar"))
        : hasType(item.type);
      if (!hasIt) {
        missing.push({ type: item.type, label: item.label });
        continue;
      }
      if (DOCS_WITH_EXPIRY.has(item.type)) {
        const matched = empDocs
          .filter(d => d.type === item.type && d.expiry_date)
          .sort((a, b) => String(b.expiry_date).localeCompare(String(a.expiry_date)))[0];
        if (matched && isExpired(matched.expiry_date)) {
          expired.push({ type: item.type, label: item.label, expiryDate: matched.expiry_date });
        }
      }
    }

    if (missing.length || expired.length) {
      report.push({ id: emp.id, name: emp.name, role: emp.role || "—", missing, expired });
    }
  }

  return report;
}

function fmtBRDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function buildHtml(report: EmployeeReport[]): { html: string; totalMissing: number; totalExpired: number } {
  const totalMissing = report.reduce((s, r) => s + r.missing.length, 0);
  const totalExpired = report.reduce((s, r) => s + r.expired.length, 0);
  const dataBR = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const employeeBlocks = report.map(r => {
    const missingList = r.missing.length
      ? `<div style="margin-top:8px"><div style="font-size:12px;font-weight:bold;color:#92400e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Faltantes (${r.missing.length})</div><ul style="margin:0;padding-left:18px;font-size:13px;color:#374151">${r.missing.map(m => `<li>${m.label}</li>`).join("")}</ul></div>`
      : "";
    const expiredList = r.expired.length
      ? `<div style="margin-top:8px"><div style="font-size:12px;font-weight:bold;color:#b91c1c;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Vencidos (${r.expired.length})</div><ul style="margin:0;padding-left:18px;font-size:13px;color:#374151">${r.expired.map(e => `<li>${e.label} — venceu em <strong style="color:#b91c1c">${fmtBRDate(e.expiryDate)}</strong></li>`).join("")}</ul></div>`
      : "";
    return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><div style="font-size:15px;font-weight:bold;color:#111827">${r.name}</div><div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:bold">${r.role}</div></div>${missingList}${expiredList}</div>`;
  }).join("");

  const empty = report.length === 0
    ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:20px;text-align:center;color:#065f46;font-weight:bold">Todos os documentos estão em dia. Nada a regularizar.</div>`
    : "";

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="background:#f3f4f6;font-family:Arial,sans-serif;margin:0;padding:0">
<div style="max-width:680px;margin:0 auto;padding:20px">
  <div style="background:#1f2937;color:#fff;padding:20px;border-radius:10px 10px 0 0">
    <h1 style="margin:0;font-size:20px">📋 Compliance de Documentos — RH</h1>
    <p style="margin:4px 0 0;font-size:13px;color:#d1d5db">Relatório diário — ${dataBR}</p>
  </div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:16px">
    <table style="width:100%;border-collapse:separate;border-spacing:8px 0">
      <tr>
        <td style="background:#fef3c7;border-radius:8px;padding:12px;text-align:center;width:33%">
          <div style="font-size:11px;font-weight:bold;color:#92400e;text-transform:uppercase">Faltantes</div>
          <div style="font-size:24px;font-weight:bold;color:#92400e;margin-top:2px">${totalMissing}</div>
        </td>
        <td style="background:#fee2e2;border-radius:8px;padding:12px;text-align:center;width:33%">
          <div style="font-size:11px;font-weight:bold;color:#991b1b;text-transform:uppercase">Vencidos</div>
          <div style="font-size:24px;font-weight:bold;color:#991b1b;margin-top:2px">${totalExpired}</div>
        </td>
        <td style="background:#dbeafe;border-radius:8px;padding:12px;text-align:center;width:34%">
          <div style="font-size:11px;font-weight:bold;color:#1e40af;text-transform:uppercase">Funcionários</div>
          <div style="font-size:24px;font-weight:bold;color:#1e40af;margin-top:2px">${report.length}</div>
        </td>
      </tr>
    </table>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:16px">
    ${empty}${employeeBlocks}
    <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;text-align:center">Torres Vigilância Patrimonial — disparo automático diário às 07:00 BRT.</p>
  </div>
</div></body></html>`;
  return { html, totalMissing, totalExpired };
}

export async function sendDocComplianceEmail(
  opts: { dryRun?: boolean; overrideTo?: string[] } = {}
): Promise<{ success: boolean; sent: boolean; totalMissing: number; totalExpired: number; employees: number; recipients: string[]; message: string }> {
  const report = await buildDocComplianceReport();
  const { html, totalMissing, totalExpired } = buildHtml(report);
  const overrideValid = opts.overrideTo?.filter(e => typeof e === "string" && EMAIL_RE.test(e));
  const recipients = overrideValid?.length ? overrideValid : [ESCOLTA_EMAIL, ADM_EMAIL];

  if (opts.dryRun) {
    return { success: true, sent: false, totalMissing, totalExpired, employees: report.length, recipients, message: "dry-run" };
  }

  const transporter = createSmtpTransporter();
  if (!transporter) {
    return { success: false, sent: false, totalMissing, totalExpired, employees: report.length, recipients, message: "SMTP não configurado" };
  }

  const dataBR = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const subject = (totalMissing + totalExpired) > 0
    ? `📋 Documentos pendentes (${totalMissing} faltantes + ${totalExpired} vencidos) — ${dataBR}`
    : `✅ Documentos em dia — ${dataBR}`;

  await transporter.sendMail({
    from: getSmtpFrom(),
    to: recipients,
    subject,
    html,
  });

  return {
    success: true, sent: true,
    totalMissing, totalExpired, employees: report.length,
    recipients,
    message: `E-mail enviado para ${recipients.join(", ")}`,
  };
}
