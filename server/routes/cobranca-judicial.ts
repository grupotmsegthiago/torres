import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { requireAuth, requireAdminRole, requireDiretoria } from "../auth";
import { supabaseAdmin } from "../supabase";
import { logSystemAudit } from "../audit";
import { createSmtpTransporter, getSmtpFrom, nowBRTString } from "./_helpers";
import { signMissionPhoto } from "../lib/mission-photos";

// ---------------------------------------------------------------------------
// Jurídico > Cobrança Judicial
// Gera um DOSSIÊ de evidências (cadastro do cliente -> contrato -> execução da
// missão/fotos/checklist IA -> NF -> boleto -> notificações -> pagamento), com
// links de download, e registra o envio ao jurídico em `cobranca_judicial`
// (histórico: quem mandou + quando). NUNCA toca em invoices.status (financeiro
// INTOCÁVEL §8) — o estado jurídico vive só nesta tabela separada.
// ---------------------------------------------------------------------------

const ACTIVE_JUDICIAL_STATUSES = ["EM_COBRANCA_JUDICIAL", "AJUIZADO", "ACORDO"];
const SHARE_TTL_DAYS = 30;

const brl = (v: any) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Normaliza qualquer timestamp p/ ms (sorting). Strings sem offset são BRT.
function toMs(raw: any): number {
  if (!raw) return 0;
  let s = String(raw).trim();
  if (!s) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T12:00:00-03:00`;
  else if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(s)) s = `${s}-03:00`;
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

type DossieEvent = {
  ts: number;
  at: string | null;
  kind: string;
  who: string | null;
  title: string;
  detail: string | null;
  value: number | null;
};

type DossieFile = {
  label: string;
  kind: string; // contrato | nf | boleto | foto | comprovante
  url: string | null;
  note?: string | null;
};

/**
 * Monta o dossiê completo de uma fatura. Read-only: só agrega dados de várias
 * tabelas + assina URLs do storage privado.
 */
export async function buildDossie(invoiceId: number): Promise<any | null> {
  const { data: invoice } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return null;

  const events: DossieEvent[] = [];
  const files: DossieFile[] = [];

  // (0) Cadastro do cliente
  let client: any = null;
  if (invoice.client_id) {
    const { data: c } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("id", invoice.client_id)
      .maybeSingle();
    client = c || null;
    if (client) {
      events.push({
        ts: toMs(client.created_at),
        at: client.created_at || null,
        kind: "cadastro",
        who: null,
        title: "Cliente cadastrado",
        detail: [client.razao_social || client.name, client.cnpj ? `CNPJ ${client.cnpj}` : client.cpf ? `CPF ${client.cpf}` : null]
          .filter(Boolean)
          .join(" · ") || null,
        value: null,
      });
    }
  }

  // (1) OS + Contrato de escolta (tabela de preços vigente)
  let serviceOrder: any = null;
  let contract: any = null;
  if (invoice.service_order_id) {
    const { data: so } = await supabaseAdmin
      .from("service_orders")
      .select("*")
      .eq("id", invoice.service_order_id)
      .maybeSingle();
    serviceOrder = so || null;
    if (serviceOrder) {
      events.push({
        ts: toMs(serviceOrder.created_at),
        at: serviceOrder.created_at || null,
        kind: "os",
        who: serviceOrder.requester_name || null,
        title: `OS ${serviceOrder.os_number || serviceOrder.id} criada`,
        detail: [serviceOrder.type, serviceOrder.route, serviceOrder.origin && serviceOrder.destination ? `${serviceOrder.origin} → ${serviceOrder.destination}` : null]
          .filter(Boolean)
          .join(" · ") || null,
        value: serviceOrder.fat_calculado != null ? Number(serviceOrder.fat_calculado) : null,
      });
      if (serviceOrder.escort_contract_id) {
        const { data: ec } = await supabaseAdmin
          .from("escort_contracts")
          .select("*")
          .eq("id", serviceOrder.escort_contract_id)
          .maybeSingle();
        contract = ec || null;
        if (contract) {
          events.push({
            ts: toMs(contract.created_at),
            at: contract.created_at || null,
            kind: "contrato",
            who: null,
            title: "Tabela de preços (contrato) vigente",
            detail: [contract.name || contract.client_name, `Acionamento ${brl(contract.valor_acionamento)}`, `KM ${brl(contract.valor_km_extra || contract.valor_km_carregado)}`]
              .filter(Boolean)
              .join(" · ") || null,
            value: null,
          });
        }
      }
    }
  }

  // (2) Execução da missão — updates + fotos (evidência operacional)
  let missionUpdates: any[] = [];
  let missionPhotos: any[] = [];
  if (invoice.service_order_id) {
    const { data: mus } = await supabaseAdmin
      .from("mission_updates")
      .select("id, mission_step, message, employee_name, latitude, longitude, photo_url, created_at")
      .eq("service_order_id", invoice.service_order_id)
      .order("created_at", { ascending: true });
    missionUpdates = mus || [];
    for (const mu of missionUpdates) {
      events.push({
        ts: toMs(mu.created_at),
        at: mu.created_at || null,
        kind: "execucao",
        who: mu.employee_name || null,
        title: mu.mission_step ? `Missão: ${String(mu.mission_step).replace(/_/g, " ")}` : "Atualização de missão",
        detail: [mu.message, mu.latitude && mu.longitude ? `GPS ${mu.latitude},${mu.longitude}` : null].filter(Boolean).join(" · ") || null,
        value: null,
      });
      if (mu.photo_url) {
        const signed = String(mu.photo_url).startsWith("data:")
          ? mu.photo_url
          : await signMissionPhoto(String(mu.photo_url)).catch(() => null);
        if (signed) files.push({ label: `Foto missão · ${mu.mission_step || mu.id}`, kind: "foto", url: signed });
      }
    }

    const { data: mps } = await supabaseAdmin
      .from("mission_photos")
      .select("id, step, km_value, latitude, longitude, ai_inspection_status, ai_inspection_result, created_at, photo_data")
      .eq("service_order_id", invoice.service_order_id)
      .order("created_at", { ascending: true });
    missionPhotos = mps || [];
    for (const mp of missionPhotos) {
      const aiOk = mp.ai_inspection_status ? String(mp.ai_inspection_status) : null;
      events.push({
        ts: toMs(mp.created_at),
        at: mp.created_at || null,
        kind: "foto",
        who: null,
        title: `Foto/checklist · ${mp.step || "etapa"}`,
        detail: [mp.km_value != null ? `KM ${mp.km_value}` : null, aiOk ? `IA: ${aiOk}` : null].filter(Boolean).join(" · ") || null,
        value: null,
      });
      if (mp.photo_data) {
        const signed = String(mp.photo_data).startsWith("data:")
          ? mp.photo_data
          : await signMissionPhoto(String(mp.photo_data)).catch(() => null);
        if (signed) files.push({ label: `Foto inspeção · ${mp.step || mp.id}`, kind: "foto", url: signed, note: aiOk });
      }
    }
  }

  // (3) Criação da fatura
  let creatorName: string | null = null;
  if (invoice.created_by) {
    const { data: u } = await supabaseAdmin.from("users").select("name, email").eq("id", invoice.created_by).maybeSingle();
    creatorName = u?.name || u?.email || null;
  }
  events.push({
    ts: toMs(invoice.created_at),
    at: invoice.created_at || null,
    kind: "fatura",
    who: creatorName,
    title: "Fatura emitida",
    detail: `${brl(invoice.value)} · venc. ${invoice.due_date || "—"} · ${invoice.gateway === "inter" ? "Banco Inter" : "Asaas"}`,
    value: Number(invoice.value || 0) || null,
  });

  // Arquivos de NF / boleto
  if (invoice.nfse_url) files.push({ label: `NFS-e ${invoice.nfse_number || ""}`.trim(), kind: "nf", url: invoice.nfse_url });
  if (invoice.nf_anexo_url) files.push({ label: "NF (anexo PDF)", kind: "nf", url: invoice.nf_anexo_url });
  if (invoice.bank_slip_url) files.push({ label: "Boleto (PDF)", kind: "boleto", url: invoice.bank_slip_url });
  if (invoice.invoice_url) files.push({ label: "Fatura/cobrança (link)", kind: "boleto", url: invoice.invoice_url });

  // (4) Auditoria estruturada da fatura
  const { data: audits } = await supabaseAdmin
    .from("system_audit_logs")
    .select("user_name, action, details, ip_address, created_at")
    .eq("target_type", "invoice")
    .eq("target_id", String(invoiceId))
    .order("created_at", { ascending: true });
  for (const a of audits || []) {
    let detail: string | null = null;
    try {
      const d = typeof a.details === "string" ? a.details : JSON.stringify(a.details);
      detail = d && d !== "null" && d !== "{}" ? d : null;
    } catch { detail = null; }
    events.push({
      ts: toMs(a.created_at),
      at: a.created_at || null,
      kind: "auditoria",
      who: a.user_name || null,
      title: String(a.action || "Ação").replace(/_/g, " "),
      detail: [detail, a.ip_address ? `IP ${a.ip_address}` : null].filter(Boolean).join(" · ") || null,
      value: null,
    });
  }

  // (5) Notificações de cobrança (lembretes enviados)
  if (invoice.email_sent_at) {
    events.push({
      ts: toMs(invoice.email_sent_at),
      at: invoice.email_sent_at,
      kind: "notificacao",
      who: null,
      title: "Cobrança enviada por e-mail",
      detail: invoice.email_sent_to ? `Para ${invoice.email_sent_to}` : null,
      value: null,
    });
  }
  if (invoice.last_reminder_sent_at && Number(invoice.reminder_count || 0) > 0) {
    events.push({
      ts: toMs(invoice.last_reminder_sent_at),
      at: invoice.last_reminder_sent_at,
      kind: "notificacao",
      who: null,
      title: `Lembrete de cobrança (${invoice.reminder_count}x)`,
      detail: "Régua de cobrança automática",
      value: null,
    });
  }

  // (6) Notas append-only (baixa manual / vencimento)
  if (invoice.nfse_observations) {
    const chunks = String(invoice.nfse_observations).split(" | ");
    for (const c of chunks) {
      const inner = c.replace(/^\[/, "").replace(/\]$/, "").trim();
      if (!inner) continue;
      const whoM = inner.match(/ por (.+?) em /);
      const tsM = inner.match(/ em (\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/);
      const valM = inner.match(/R\$\s?([\d.]+)/);
      const isBaixa = /^Baixa manual/i.test(inner);
      const isVenc = /^Vencimento alterado/i.test(inner);
      events.push({
        ts: toMs(tsM?.[1]),
        at: tsM?.[1] || null,
        kind: isBaixa ? "baixa" : isVenc ? "vencimento" : "nota",
        who: whoM?.[1]?.trim() || null,
        title: isBaixa ? "Baixa manual" : isVenc ? "Vencimento alterado" : "Anotação",
        detail: inner,
        value: valM ? Number(valM[1]) || null : null,
      });
    }
  }

  // (7) Entrada bancária real (Banco Inter)
  const { data: extrato } = await supabaseAdmin
    .from("inter_extrato_lancamentos")
    .select("data_entrada, tipo_transacao, tipo_operacao, valor, titulo, descricao, reconciled_at")
    .eq("invoice_id", invoiceId)
    .order("data_entrada", { ascending: true });
  for (const e of extrato || []) {
    const credito = String(e.tipo_operacao || "").toUpperCase() === "C";
    events.push({
      ts: toMs(e.reconciled_at) || toMs(e.data_entrada),
      at: e.data_entrada || null,
      kind: "banco",
      who: "Banco Inter",
      title: credito ? "Dinheiro recebido na conta" : "Débito na conta",
      detail: [e.tipo_transacao, e.titulo, e.descricao].filter(Boolean).join(" · ") || null,
      value: Number(e.valor || 0) || null,
    });
  }

  events.sort((a, b) => a.ts - b.ts);

  // status atual de cobrança judicial (se já enviado)
  const { data: judicial } = await supabaseAdmin
    .from("cobranca_judicial")
    .select("*")
    .eq("invoice_id", invoiceId)
    .maybeSingle();

  const overdue = String(invoice.status || "").toUpperCase() === "OVERDUE";

  return {
    invoice: {
      id: invoice.id,
      client_id: invoice.client_id,
      client_name: invoice.client_name,
      client_cpf_cnpj: invoice.client_cpf_cnpj,
      value: invoice.value,
      net_value: invoice.net_value,
      status: invoice.status,
      payment_date: invoice.payment_date,
      due_date: invoice.due_date,
      gateway: invoice.gateway,
      description: invoice.description,
      service_order_id: invoice.service_order_id,
      nfse_number: invoice.nfse_number,
      overdue,
    },
    client,
    serviceOrder: serviceOrder
      ? {
          id: serviceOrder.id,
          os_number: serviceOrder.os_number,
          type: serviceOrder.type,
          route: serviceOrder.route,
          origin: serviceOrder.origin,
          destination: serviceOrder.destination,
          scheduled_date: serviceOrder.scheduled_date,
          started_at: serviceOrder.started_at,
          finished_at: serviceOrder.finished_at,
          status: serviceOrder.status,
          mission_status: serviceOrder.mission_status,
        }
      : null,
    contract,
    counts: {
      missionUpdates: missionUpdates.length,
      missionPhotos: missionPhotos.length,
      files: files.length,
    },
    files,
    events,
    judicial: judicial || null,
  };
}

export function registerCobrancaJudicialRoutes(app: Express) {
  // ----- Fase 1: dossiê read-only de uma fatura -----
  app.get("/api/invoices/:id/dossie-juridico", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const invoiceId = Number(req.params.id);
      if (!invoiceId) return res.status(400).json({ message: "invoiceId obrigatório" });
      const dossie = await buildDossie(invoiceId);
      if (!dossie) return res.status(404).json({ message: "Fatura não encontrada" });
      res.json(dossie);
    } catch (err: any) {
      console.error("[dossie-juridico] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ----- Fase 1: enviar fatura para o jurídico (diretoria) -----
  app.post("/api/invoices/:id/cobranca-judicial", requireAuth, requireDiretoria, async (req: Request, res: Response) => {
    try {
      const invoiceId = Number(req.params.id);
      if (!invoiceId) return res.status(400).json({ message: "invoiceId obrigatório" });

      const dossie = await buildDossie(invoiceId);
      if (!dossie) return res.status(404).json({ message: "Fatura não encontrada" });

      const motivo = (req.body?.motivo || "").toString().trim() || null;
      const valorCobrado = Number(dossie.invoice.value || 0) || null;
      const user = (req as any).user || {};

      // share token p/ o advogado (Fase 2): link público temporário
      const shareToken = crypto.randomBytes(24).toString("hex");
      const expires = new Date(Date.now() + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000);

      const payload = {
        invoice_id: invoiceId,
        client_id: dossie.invoice.client_id || null,
        status: "EM_COBRANCA_JUDICIAL",
        motivo,
        valor_cobrado: valorCobrado,
        enviado_por: user.id || null,
        enviado_por_nome: user.name || user.username || null,
        dossie_snapshot: dossie,
        share_token: shareToken,
        share_expires_at: expires.toISOString(),
        updated_at: nowBRTString(),
      };

      const { data: row, error } = await supabaseAdmin
        .from("cobranca_judicial")
        .upsert({ ...payload, created_at: nowBRTString() }, { onConflict: "invoice_id" })
        .select()
        .maybeSingle();
      if (error) throw new Error(error.message);

      await logSystemAudit({
        userId: user.id, userName: user.name || user.username, userRole: user.role,
        ipAddress: req.ip,
        action: "ENVIO_COBRANCA_JUDICIAL",
        targetType: "invoice",
        targetId: String(invoiceId),
        details: JSON.stringify({ cliente: dossie.invoice.client_name, valor: valorCobrado, motivo }),
      }).catch(() => {});

      // Fase 3: e-mail automático notificando o envio ao jurídico
      sendJudicialEmail(dossie, row).catch((e) => console.warn("[cobranca-judicial] email falhou:", e?.message));

      res.json({ ok: true, processo: row });
    } catch (err: any) {
      console.error("[cobranca-judicial] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ----- Lista de processos -----
  app.get("/api/cobranca-judicial", requireAuth, requireAdminRole, async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("cobranca_judicial")
        .select("id, invoice_id, client_id, status, motivo, valor_cobrado, enviado_por_nome, share_token, share_expires_at, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      res.json(data || []);
    } catch (err: any) {
      console.error("[cobranca-judicial:list] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ----- Detalhe de um processo (com dossiê atualizado) -----
  app.get("/api/cobranca-judicial/:id", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { data: proc } = await supabaseAdmin.from("cobranca_judicial").select("*").eq("id", id).maybeSingle();
      if (!proc) return res.status(404).json({ message: "Processo não encontrado" });
      const dossie = await buildDossie(proc.invoice_id);
      res.json({ processo: proc, dossie });
    } catch (err: any) {
      console.error("[cobranca-judicial:detail] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ----- Atualizar status do processo (diretoria) -----
  app.patch("/api/cobranca-judicial/:id", requireAuth, requireDiretoria, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const status = (req.body?.status || "").toString().trim();
      const allowed = ["EM_COBRANCA_JUDICIAL", "AJUIZADO", "ACORDO", "ENCERRADO"];
      if (!allowed.includes(status)) return res.status(400).json({ message: "Status inválido" });
      const { data, error } = await supabaseAdmin
        .from("cobranca_judicial")
        .update({ status, updated_at: nowBRTString() })
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) throw new Error(error.message);
      const u = (req as any).user || {};
      await logSystemAudit({
        userId: u.id, userName: u.name || u.username, userRole: u.role,
        ipAddress: req.ip,
        action: "ATUALIZA_STATUS_COBRANCA_JUDICIAL",
        targetType: "cobranca_judicial",
        targetId: String(id),
        details: JSON.stringify({ status }),
      }).catch(() => {});
      res.json({ ok: true, processo: data });
    } catch (err: any) {
      console.error("[cobranca-judicial:patch] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ----- Fase 2: PDF consolidado do dossiê (diretoria/admin) -----
  app.get("/api/invoices/:id/dossie-juridico/pdf", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const invoiceId = Number(req.params.id);
      const dossie = await buildDossie(invoiceId);
      if (!dossie) return res.status(404).json({ message: "Fatura não encontrada" });
      const buffer = await buildDossiePdf(dossie);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename=Dossie_Fatura_${invoiceId}.pdf`);
      res.send(buffer);
    } catch (err: any) {
      console.error("[dossie-juridico:pdf] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ----- Fase 2: pacote ZIP com PDF + todas as evidências (diretoria/admin) -----
  app.get("/api/invoices/:id/dossie-juridico/zip", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const invoiceId = Number(req.params.id);
      const dossie = await buildDossie(invoiceId);
      if (!dossie) return res.status(404).json({ message: "Fatura não encontrada" });
      await streamDossieZip(dossie, res);
    } catch (err: any) {
      console.error("[dossie-juridico:zip] error:", err.message);
      if (!res.headersSent) res.status(500).json({ message: err.message });
    }
  });

  // ----- Fase 2: link público seguro p/ o advogado (sem auth, token + expiração) -----
  app.get("/api/juridico/dossie/:token", async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token || "");
      if (!token || token.length < 24) return res.status(404).json({ message: "Link inválido" });
      const { data: proc } = await supabaseAdmin
        .from("cobranca_judicial")
        .select("*")
        .eq("share_token", token)
        .maybeSingle();
      if (!proc) return res.status(404).json({ message: "Link inválido ou revogado" });
      if (proc.share_expires_at && new Date(proc.share_expires_at).getTime() < Date.now()) {
        return res.status(410).json({ message: "Link expirado. Solicite um novo à Torres." });
      }
      // Reconstrói o dossiê ao vivo (snapshot é prova congelada; aqui mostramos atual)
      const dossie = await buildDossie(proc.invoice_id);
      res.json({
        readonly: true,
        processo: {
          status: proc.status,
          enviado_por_nome: proc.enviado_por_nome,
          created_at: proc.created_at,
          valor_cobrado: proc.valor_cobrado,
          motivo: proc.motivo,
        },
        dossie: dossie || proc.dossie_snapshot,
      });
    } catch (err: any) {
      console.error("[juridico:public] error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
}

// ---------------------------------------------------------------------------
// Helpers de Fase 2 (PDF / ZIP) e Fase 3 (e-mail)
// ---------------------------------------------------------------------------

export async function buildDossiePdf(dossie: any): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  return await new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      const inv = dossie.invoice;
      doc.fontSize(18).text("Dossiê de Cobrança Judicial", { align: "center" });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#666").text(`Torres Vigilância Patrimonial · gerado em ${nowBRTString()}`, { align: "center" });
      doc.fillColor("#000").moveDown(1);

      doc.fontSize(12).text("Fatura / Cliente", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10);
      doc.text(`Cliente: ${inv.client_name || "—"}`);
      doc.text(`Documento: ${inv.client_cpf_cnpj || dossie.client?.cnpj || dossie.client?.cpf || "—"}`);
      doc.text(`Fatura #${inv.id} · Valor ${brl(inv.value)} · Vencimento ${inv.due_date || "—"}`);
      doc.text(`Status financeiro: ${inv.status}${inv.nfse_number ? ` · NFS-e ${inv.nfse_number}` : ""}`);
      if (dossie.serviceOrder) {
        doc.text(`OS: ${dossie.serviceOrder.os_number || dossie.serviceOrder.id} · ${dossie.serviceOrder.origin || ""} → ${dossie.serviceOrder.destination || ""}`);
      }
      doc.moveDown(0.8);

      doc.fontSize(12).text("Linha do tempo (evidências)", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(9);
      for (const ev of dossie.events || []) {
        const when = ev.at ? String(ev.at).replace("T", " ").slice(0, 19) : "—";
        const line = `• [${when}] ${ev.title}${ev.who ? ` (${ev.who})` : ""}${ev.value ? ` — ${brl(ev.value)}` : ""}`;
        doc.fillColor("#111").text(line);
        if (ev.detail) doc.fillColor("#666").text(`    ${ev.detail}`, { width: 500 });
      }
      doc.fillColor("#000").moveDown(0.8);

      doc.fontSize(12).text("Documentos anexados", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(9);
      if ((dossie.files || []).length === 0) doc.text("Nenhum arquivo digital vinculado.");
      for (const f of dossie.files || []) {
        doc.fillColor("#111").text(`• ${f.label} (${f.kind})`);
      }

      doc.end();
    } catch (e) {
      reject(e as Error);
    }
  });
}

// Anti-SSRF: só baixa evidências de URLs https públicas. Bloqueia http, hosts
// internos/privados e IPs de loopback/link-local/RFC1918 (as URLs legítimas são
// sempre https de provedores públicos: Supabase Storage, Asaas, Banco Inter, NFS-e).
function isSafeRemoteUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  // IPv4 literal em faixa privada/loopback/link-local/metadata
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false; // link-local (169.254.169.254 metadata)
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a >= 224) return false; // multicast/reservado
  }
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return false;
  return true;
}

async function streamDossieZip(dossie: any, res: Response): Promise<void> {
  // @ts-ignore - archiver não tem @types instalado (módulo JS puro)
  const archiver = ((await import("archiver")) as any).default;
  const inv = dossie.invoice;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename=Dossie_Fatura_${inv.id}.zip`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err: any) => {
    console.error("[zip] archive error:", err.message);
    if (!res.headersSent) res.status(500).end();
  });
  archive.pipe(res);

  // 1) PDF consolidado
  const pdf = await buildDossiePdf(dossie);
  archive.append(pdf, { name: `Dossie_Fatura_${inv.id}.pdf` });

  // 2) Resumo em texto
  const resumo = [
    `DOSSIÊ DE COBRANÇA JUDICIAL`,
    `Cliente: ${inv.client_name}`,
    `Fatura #${inv.id} — ${brl(inv.value)} — venc. ${inv.due_date}`,
    `Eventos: ${(dossie.events || []).length} · Arquivos: ${(dossie.files || []).length}`,
    `Gerado em ${nowBRTString()}`,
  ].join("\n");
  archive.append(resumo, { name: "RESUMO.txt" });

  // 3) Baixa cada arquivo de evidência (foto/NF/boleto). data: URIs são decodificados;
  //    URLs http são baixadas via fetch.
  let idx = 0;
  for (const f of dossie.files || []) {
    idx++;
    try {
      if (!f.url) continue;
      if (String(f.url).startsWith("data:")) {
        const m = String(f.url).match(/^data:([^;]+);base64,(.*)$/);
        if (m) {
          const ext = m[1].split("/")[1] || "bin";
          archive.append(Buffer.from(m[2], "base64"), { name: `evidencias/${idx}_${f.kind}.${ext}` });
        }
      } else if (isSafeRemoteUrl(String(f.url))) {
        const r = await fetch(String(f.url), { redirect: "error" });
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer());
          const ct = r.headers.get("content-type") || "";
          const ext = ct.includes("pdf") ? "pdf" : ct.includes("xml") ? "xml" : ct.split("/")[1] || "bin";
          archive.append(buf, { name: `evidencias/${idx}_${f.kind}.${ext}` });
        }
      }
    } catch (e: any) {
      console.warn(`[zip] arquivo ${idx} falhou:`, e?.message);
    }
  }

  await archive.finalize();
}

async function sendJudicialEmail(dossie: any, processo: any): Promise<void> {
  const transporter = createSmtpTransporter();
  if (!transporter) return;
  const inv = dossie.invoice;
  const baseUrl = (process.env.PUBLIC_SITE_URL || "https://torresseguranca.com.br").replace(/\/$/, "");
  const linkAdvogado = processo?.share_token ? `${baseUrl}/api/juridico/dossie/${processo.share_token}` : null;

  const to: string[] = [];
  const fin = dossie.client?.email_financeiro || dossie.client?.email;
  if (fin) to.push(fin);
  if (process.env.JURIDICO_EMAIL) to.push(process.env.JURIDICO_EMAIL);
  const recipients = to.length ? to : [getSmtpFrom()];

  const html = `
    <h2>Cobrança Judicial — Fatura #${inv.id}</h2>
    <p><b>Cliente:</b> ${inv.client_name || "—"}<br/>
    <b>Valor:</b> ${brl(inv.value)}<br/>
    <b>Vencimento:</b> ${inv.due_date || "—"}<br/>
    <b>Enviado por:</b> ${processo?.enviado_por_nome || "—"} em ${processo?.created_at || nowBRTString()}</p>
    ${processo?.motivo ? `<p><b>Motivo:</b> ${processo.motivo}</p>` : ""}
    <p>Foram reunidas <b>${(dossie.events || []).length} evidências</b> e <b>${(dossie.files || []).length} documentos</b> (cadastro, contrato, execução, NF e boleto).</p>
    ${linkAdvogado ? `<p><b>Dossiê (link seguro, válido por ${SHARE_TTL_DAYS} dias):</b><br/><a href="${linkAdvogado}">${linkAdvogado}</a></p>` : ""}
  `;

  await transporter.sendMail({
    from: getSmtpFrom(),
    to: recipients,
    bcc: ["thiago@grupotmseg.com.br"],
    subject: `[Jurídico] Cobrança judicial — ${inv.client_name} — Fatura #${inv.id}`,
    html,
  });
}
