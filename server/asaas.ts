import type { Express, Request, Response } from "express";
import { requireAdminRole } from "./auth";
import { supabaseAdmin } from "./supabase";
import { logSystemAudit } from "./audit";

const ASAAS_API_URL = process.env.ASAAS_API_URL || "https://www.asaas.com/api/v3";

const CNAE_PRINCIPAL = "7870";
const CODIGO_SERVICO_MUNICIPAL = "11.02";
const ISS_ALIQUOTA = 5;
const DESCRICAO_SERVICO_FIXA = "Ref. a Serviço de Escolta Armada Caracterizada";

function getApiKey(): string {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("ASAAS_API_KEY não configurada");
  return key;
}

function buildInvoiceDescription(_clientName: string, periodoInicio: string, periodoFim: string, _osCount?: number): string {
  const inicio = new Date(periodoInicio + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const fim = new Date(periodoFim + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `Ref. a Serviço de Escolta Armada Caracterizada - Período: ${inicio} a ${fim}`;
}

function buildFiscalPayload(value: number, clientCpfCnpj: string): Record<string, any> {
  return {
    serviceListItem: CODIGO_SERVICO_MUNICIPAL,
    municipalServiceCode: CODIGO_SERVICO_MUNICIPAL,
    deductions: 0,
    effectiveDatePeriod: "MONTHLY",
    receivedOnly: false,
    observations: `Referente aos serviços de Escolta Armada Caracterizada. CNAE ${CNAE_PRINCIPAL}.`,
    taxes: {
      retainIss: false,
      iss: ISS_ALIQUOTA,
      cofins: 0,
      csll: 0,
      inss: 0,
      ir: 0,
      pis: 0,
    },
  };
}

async function asaasRequest(method: string, path: string, body?: any): Promise<any> {
  const apiKey = getApiKey();
  const url = `${ASAAS_API_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "access_token": apiKey,
    "User-Agent": "TorresVP/1.0",
  };

  const opts: RequestInit = { method, headers };
  if (body && method !== "GET") {
    opts.body = JSON.stringify(body);
  }

  const resp = await fetch(url, opts);
  const text = await resp.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { rawText: text }; }

  if (!resp.ok) {
    const errMsg = data?.errors?.[0]?.description || data?.message || `Asaas API error ${resp.status}`;
    throw new Error(errMsg);
  }
  return data;
}

async function ensureInvoicesTable() {
  try {
    await supabaseAdmin.rpc("exec_sql", {
      query: `CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        client_id INTEGER,
        client_name TEXT NOT NULL,
        client_cpf_cnpj TEXT,
        asaas_customer_id TEXT,
        asaas_payment_id TEXT,
        service_order_id INTEGER,
        description TEXT NOT NULL,
        value DECIMAL(12,2) NOT NULL,
        net_value DECIMAL(12,2),
        due_date TEXT NOT NULL,
        billing_type TEXT NOT NULL DEFAULT 'BOLETO',
        status TEXT NOT NULL DEFAULT 'PENDING',
        invoice_url TEXT,
        bank_slip_url TEXT,
        pix_qr_code TEXT,
        pix_copia_e_cola TEXT,
        payment_date TEXT,
        external_reference TEXT,
        notes TEXT,
        created_by INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`
    });
  } catch (e: any) {
    console.log("[asaas] ensureInvoicesTable via direct query fallback");
    const { error } = await supabaseAdmin.from("invoices").select("id").limit(1);
    if (error && error.code === "42P01") {
      console.error("[asaas] invoices table does not exist, create it manually in Supabase");
    }
  }
}

async function findOrCreateAsaasCustomer(name: string, cpfCnpj: string, email?: string, phone?: string): Promise<string> {
  const cleanDoc = cpfCnpj.replace(/[^\d]/g, "");
  if (!cleanDoc) throw new Error("CPF/CNPJ é obrigatório para criar cobrança no Asaas");

  try {
    const search = await asaasRequest("GET", `/customers?cpfCnpj=${cleanDoc}`);
    if (search.data && search.data.length > 0) {
      const existing = search.data[0];
      if (!existing.email && email) {
        const emails = email.split(/[;,]\s*/);
        const primaryEmail = emails[0].trim();
        const additionalEmails = emails.slice(1).map((e: string) => e.trim()).join(",");
        try {
          const updatePayload: any = { email: primaryEmail, notificationDisabled: false };
          if (additionalEmails) updatePayload.additionalEmails = additionalEmails;
          await asaasRequest("PUT", `/customers/${existing.id}`, updatePayload);
          console.log(`[asaas] Customer ${existing.id} atualizado com email: ${primaryEmail}`);
        } catch (e: any) {
          console.log(`[asaas] Falha ao atualizar email do customer: ${e.message}`);
        }
      }
      return existing.id;
    }
  } catch {}

  const emails = (email || "").split(/[;,]\s*/);
  const primaryEmail = emails[0]?.trim() || undefined;
  const additionalEmails = emails.slice(1).map((e: string) => e.trim()).join(",") || undefined;

  const customerPayload: any = {
    name,
    cpfCnpj: cleanDoc,
    notificationDisabled: false,
  };
  if (primaryEmail) customerPayload.email = primaryEmail;
  if (additionalEmails) customerPayload.additionalEmails = additionalEmails;
  if (phone) customerPayload.mobilePhone = phone.replace(/[^\d]/g, "");

  const customer = await asaasRequest("POST", "/customers", customerPayload);
  return customer.id;
}

export function registerAsaasRoutes(app: Express) {
  ensureInvoicesTable().catch(e => console.log("[asaas] table check:", e.message));

  app.get("/api/asaas/status", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      const hasKey = !!process.env.ASAAS_API_KEY;
      if (!hasKey) {
        return res.json({ connected: false, message: "ASAAS_API_KEY não configurada" });
      }
      const result = await asaasRequest("GET", "/finance/balance");
      res.json({ connected: true, balance: result });
    } catch (err: any) {
      res.json({ connected: false, message: err.message });
    }
  });

  app.get("/api/asaas/customers", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const q = req.query.q as string || "";
      const offset = parseInt(req.query.offset as string) || 0;
      const limit = parseInt(req.query.limit as string) || 20;
      let path = `/customers?offset=${offset}&limit=${limit}`;
      if (q) path += `&name=${encodeURIComponent(q)}`;
      const data = await asaasRequest("GET", path);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/invoices", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string;
      const clientId = req.query.clientId as string;
      const month = req.query.month as string;

      let query = supabaseAdmin.from("invoices").select("*").order("created_at", { ascending: false });

      if (status && status !== "ALL") {
        query = query.eq("status", status);
      }
      if (clientId) {
        query = query.eq("client_id", parseInt(clientId));
      }
      if (month) {
        query = query.gte("due_date", `${month}-01`).lte("due_date", `${month}-31`);
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/invoices", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { clientName, clientCpfCnpj, clientId, serviceOrderId, description, value, dueDate, billingType, notes, sendToAsaas } = req.body;

      if (!clientName || !value || !dueDate || !description) {
        return res.status(400).json({ message: "Campos obrigatórios: clientName, value, dueDate, description" });
      }

      let asaasCustomerId: string | null = null;
      let asaasPaymentId: string | null = null;
      let invoiceUrl: string | null = null;
      let bankSlipUrl: string | null = null;
      let pixQrCode: string | null = null;
      let pixCopiaECola: string | null = null;
      let status = "PENDING";

      if (sendToAsaas && process.env.ASAAS_API_KEY) {
        let clientEmail: string | undefined;
        let clientPhone: string | undefined;
        if (clientId) {
          const { data: cliInfo } = await supabaseAdmin.from("clients").select("email, email_financeiro, phone").eq("id", clientId).single();
          clientEmail = cliInfo?.email_financeiro || cliInfo?.email || undefined;
          clientPhone = cliInfo?.phone || undefined;
        }
        asaasCustomerId = await findOrCreateAsaasCustomer(clientName, clientCpfCnpj || "", clientEmail, clientPhone);

        let emiteNf = false;
        if (clientId) {
          const { data: cliData } = await supabaseAdmin.from("clients").select("emite_nf").eq("id", clientId).single();
          emiteNf = cliData?.emite_nf === true;
        }

        const paymentPayload: any = {
          customer: asaasCustomerId,
          billingType: billingType || "BOLETO",
          value: parseFloat(value),
          dueDate,
          description,
          externalReference: serviceOrderId ? `OS-${serviceOrderId}` : undefined,
          notificationDisabled: false,
        };
        if (emiteNf) {
          paymentPayload.postalService = false;
          paymentPayload.fiscalObservations = `CNAE ${CNAE_PRINCIPAL} - Atividades de Vigilância e Segurança Privada`;
        }

        try {
          const payment = await asaasRequest("POST", "/payments", paymentPayload);
          asaasPaymentId = payment.id;
          invoiceUrl = payment.invoiceUrl;
          bankSlipUrl = payment.bankSlip?.url || payment.bankSlipUrl;
          status = payment.status || "PENDING";

          if (billingType === "PIX" || billingType === "UNDEFINED") {
            try {
              const pixData = await asaasRequest("GET", `/payments/${payment.id}/pixQrCode`);
              pixQrCode = pixData.encodedImage;
              pixCopiaECola = pixData.payload;
            } catch {}
          }

          await logSystemAudit({
            userId: (req as any).user?.id, userName: (req as any).user?.name, userRole: (req as any).user?.role,
            action: "ASAAS_COBRANCA_GERADA", targetId: asaasPaymentId, targetType: "invoice",
            details: `Cobrança ${billingType || "BOLETO"} R$${parseFloat(value).toFixed(2)} gerada para ${clientName}. Asaas ID: ${asaasPaymentId}`,
            ipAddress: (req as any).ip,
          });
        } catch (asaasErr: any) {
          await logSystemAudit({
            userId: (req as any).user?.id, userName: (req as any).user?.name, userRole: (req as any).user?.role,
            action: "ASAAS_COBRANCA_ERRO", targetId: serviceOrderId ? String(serviceOrderId) : "manual", targetType: "invoice",
            details: `ERRO ao gerar cobrança para ${clientName}: ${asaasErr.message}`,
            ipAddress: (req as any).ip,
          });
          throw asaasErr;
        }
      }

      const userId = (req as any).user?.id;

      const { data, error } = await supabaseAdmin.from("invoices").insert({
        client_id: clientId || null,
        client_name: clientName,
        client_cpf_cnpj: clientCpfCnpj || null,
        asaas_customer_id: asaasCustomerId,
        asaas_payment_id: asaasPaymentId,
        service_order_id: serviceOrderId || null,
        description,
        value: parseFloat(value),
        due_date: dueDate,
        billing_type: billingType || "BOLETO",
        status,
        invoice_url: invoiceUrl,
        bank_slip_url: bankSlipUrl,
        pix_qr_code: pixQrCode,
        pix_copia_e_cola: pixCopiaECola,
        notes: notes || null,
        external_reference: serviceOrderId ? `OS-${serviceOrderId}` : null,
        created_by: userId,
      }).select().single();

      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/invoices/:id", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const user = (req as any).user;

      const { data: existing } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!existing) return res.status(404).json({ message: "Fatura não encontrada" });

      if (updates.status === "CANCELLED" && user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode cancelar faturas." });
      }

      if (updates.status === "CANCELLED" && existing.asaas_payment_id && process.env.ASAAS_API_KEY) {
        try {
          await asaasRequest("DELETE", `/payments/${existing.asaas_payment_id}`);
        } catch (e: any) {
          console.log("[asaas] Cancel payment error:", e.message);
        }
      }

      const { data, error } = await supabaseAdmin
        .from("invoices")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/invoices/:id/attach-nf", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { nf_anexo_url } = req.body;
      if (!nf_anexo_url) return res.status(400).json({ message: "URL do anexo da NF é obrigatória" });

      const { data: existing } = await supabaseAdmin.from("invoices").select("id").eq("id", id).single();
      if (!existing) return res.status(404).json({ message: "Fatura não encontrada" });

      const { data, error } = await supabaseAdmin
        .from("invoices")
        .update({ nf_anexo_url, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      const user = (req as any).user;
      await logSystemAudit({
        userId: user?.id, userName: user?.name, userRole: user?.role,
        action: "ANEXAR_NF", targetId: String(id), targetType: "invoice",
        details: `NF anexada à fatura #${id}`,
        ipAddress: (req as any).ip,
      });

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/invoices/:id/attach-nf", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { data, error } = await supabaseAdmin
        .from("invoices")
        .update({ nf_anexo_url: null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/invoices/:id", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const user = (req as any).user;

      if (user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode excluir faturas." });
      }

      const { data: existing } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!existing) return res.status(404).json({ message: "Fatura não encontrada" });

      if (existing.asaas_payment_id && process.env.ASAAS_API_KEY) {
        try {
          await asaasRequest("DELETE", `/payments/${existing.asaas_payment_id}`);
        } catch (e: any) {
          console.log("[asaas] Delete payment error:", e.message);
        }
      }

      const { error } = await supabaseAdmin.from("invoices").delete().eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/invoices/:id/sync", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura não encontrada" });
      if (!invoice.asaas_payment_id) return res.status(400).json({ message: "Fatura sem vínculo com Asaas" });

      const payment = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}`);

      const updates: Record<string, any> = {
        status: payment.status,
        net_value: payment.netValue,
        invoice_url: payment.invoiceUrl,
        bank_slip_url: payment.bankSlip?.url || payment.bankSlipUrl,
        updated_at: new Date().toISOString(),
      };
      if (payment.paymentDate) updates.payment_date = payment.paymentDate;

      try {
        const fiscalInfo = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}/fiscalInfo`);
        if (fiscalInfo?.rpsSerie || fiscalInfo?.rpsNumber || fiscalInfo?.externalUrl) {
          if (fiscalInfo.externalUrl) {
            updates.nfse_url = fiscalInfo.externalUrl;
          }
          console.log(`[asaas] NFS-e sync OK: status=${fiscalInfo.status}, url=${fiscalInfo.externalUrl || 'N/A'}`);
        }
      } catch (nfErr: any) {
        console.log(`[asaas] NFS-e fetch (non-blocking): ${nfErr.message}`);
      }

      const { data, error } = await supabaseAdmin.from("invoices").update(updates).eq("id", id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/invoices/:id/resend", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura não encontrada" });
      if (!invoice.asaas_payment_id) return res.status(400).json({ message: "Fatura sem vínculo com Asaas" });

      await asaasRequest("POST", `/payments/${invoice.asaas_payment_id}/resendNotification`, {});

      const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      await logSystemAudit({
        userId: (req as any).user?.id, userName: (req as any).user?.name, userRole: (req as any).user?.role,
        action: "ASAAS_NOTIFICACAO_REENVIADA", targetId: invoice.asaas_payment_id, targetType: "invoice",
        details: `Notificação reenviada para cobrança ${invoice.asaas_payment_id} (R$${parseFloat(invoice.value).toFixed(2)}) às ${now}`,
        ipAddress: (req as any).ip,
      });

      res.json({ success: true, message: "Notificação reenviada", timestamp: now });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/invoices/:id/notifications", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura não encontrada" });
      if (!invoice.asaas_payment_id) return res.status(400).json({ message: "Fatura sem vínculo com Asaas" });

      let notifications: any[] = [];
      let paymentDetails: any = null;

      try {
        paymentDetails = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}`);
      } catch {}

      try {
        const notifData = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}/notifications`);
        if (notifData?.data) notifications = notifData.data;
        else if (Array.isArray(notifData)) notifications = notifData;
      } catch {}

      const { data: auditLogs } = await supabaseAdmin
        .from("system_audit_log")
        .select("action, details, created_at")
        .or(`target_id.eq.${invoice.asaas_payment_id},and(target_type.eq.invoice,target_id.eq.${invoice.id})`)
        .order("created_at", { ascending: true })
        .limit(20);

      const timeline: any[] = [];

      if (invoice.created_at) {
        timeline.push({
          type: "created",
          icon: "receipt",
          label: "Cobrança criada no Asaas",
          detail: `${invoice.billing_type} • R$ ${parseFloat(invoice.value).toFixed(2)}`,
          timestamp: invoice.created_at,
        });
      }

      if (auditLogs) {
        for (const log of auditLogs) {
          if (log.action === "ASAAS_COBRANCA_GERADA") {
            continue;
          }
          if (log.action === "ASAAS_NOTIFICACAO_REENVIADA") {
            timeline.push({
              type: "resent",
              icon: "send",
              label: "Notificação reenviada manualmente",
              detail: log.details,
              timestamp: log.created_at,
            });
          }
          if (log.action?.startsWith("ASAAS_WEBHOOK_")) {
            const evtName = log.action.replace("ASAAS_WEBHOOK_", "");
            timeline.push({
              type: "webhook",
              icon: "webhook",
              label: `Evento Asaas: ${evtName}`,
              detail: log.details,
              timestamp: log.created_at,
            });
          }
        }
      }

      for (const n of notifications) {
        const eventLabel = n.event === "PAYMENT_CREATED" ? "E-mail de cobrança enviado"
          : n.event === "PAYMENT_RECEIVED" ? "E-mail de confirmação de pagamento"
          : n.event === "PAYMENT_OVERDUE" ? "E-mail de cobrança vencida"
          : n.event === "PAYMENT_DUEDATE_WARNING" ? "E-mail de lembrete de vencimento"
          : `Notificação: ${n.event || "desconhecido"}`;

        timeline.push({
          type: n.status === "FAILED" || n.status === "BOUNCED" ? "error" : n.status === "READ" ? "read" : "sent",
          icon: n.status === "FAILED" || n.status === "BOUNCED" ? "alert" : n.status === "READ" ? "eye" : "mail",
          label: eventLabel,
          detail: n.emailAddress ? `Para: ${n.emailAddress}` : undefined,
          status: n.status,
          timestamp: n.scheduleDate || n.dateCreated,
        });
      }

      const emailStatus = paymentDetails?.lastInvoiceViewedDate ? "VIEWED"
        : notifications.some((n: any) => n.status === "BOUNCED" || n.status === "FAILED") ? "BOUNCE"
        : notifications.some((n: any) => n.status === "READ") ? "READ"
        : notifications.some((n: any) => n.status === "SENT" || n.status === "DELIVERED") ? "SENT"
        : notifications.length > 0 ? "QUEUED"
        : "UNKNOWN";

      const customerEmail = paymentDetails?.customer?.email || null;

      timeline.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());

      res.json({
        emailStatus,
        customerEmail,
        lastViewedDate: paymentDetails?.lastInvoiceViewedDate || null,
        notifications,
        timeline,
        paymentStatus: paymentDetails?.status,
      });
    } catch (err: any) {
      console.error("[asaas] notifications error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/invoices/:id/pix", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!invoice) return res.status(404).json({ message: "Fatura não encontrada" });
      if (!invoice.asaas_payment_id) return res.status(400).json({ message: "Fatura sem vínculo com Asaas" });

      const pixData = await asaasRequest("GET", `/payments/${invoice.asaas_payment_id}/pixQrCode`);

      await supabaseAdmin.from("invoices").update({
        pix_qr_code: pixData.encodedImage,
        pix_copia_e_cola: pixData.payload,
      }).eq("id", id);

      res.json({ qrCode: pixData.encodedImage, copiaECola: pixData.payload });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/asaas/webhook", async (req: Request, res: Response) => {
    try {
      const { event, payment } = req.body;
      console.log(`[asaas] Webhook received: ${event}`);

      if (!payment?.id) return res.json({ received: true });

      const statusMap: Record<string, string> = {
        "PAYMENT_CONFIRMED": "CONFIRMED",
        "PAYMENT_RECEIVED": "RECEIVED",
        "PAYMENT_OVERDUE": "OVERDUE",
        "PAYMENT_DELETED": "CANCELLED",
        "PAYMENT_REFUNDED": "REFUNDED",
        "PAYMENT_UPDATED": payment.status,
      };

      const newStatus = statusMap[event];
      if (!newStatus) return res.json({ received: true });

      const updates: Record<string, any> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (payment.paymentDate) updates.payment_date = payment.paymentDate;
      if (payment.netValue) updates.net_value = payment.netValue;

      const { data: updatedInvoice } = await supabaseAdmin
        .from("invoices")
        .update(updates)
        .eq("asaas_payment_id", payment.id)
        .select("id, client_name, value, service_order_id")
        .single();

      if (updatedInvoice && (newStatus === "CONFIRMED" || newStatus === "RECEIVED")) {
        try {
          await supabaseAdmin
            .from("escort_billings")
            .update({ status: "PAGO", pago_em: new Date().toISOString() })
            .eq("invoice_id", updatedInvoice.id);
        } catch (_e) {}

        try {
          const { createAutoTransaction } = await import("./routes/_helpers");
          await createAutoTransaction({
            description: `Recebimento Asaas - ${updatedInvoice.client_name} (${payment.id})`,
            amount: payment.netValue || updatedInvoice.value,
            type: "INCOME",
            category: "Faturamento",
            origin_type: "invoice",
            origin_id: String(updatedInvoice.id),
          });
        } catch (_e) {}
      }

      await logSystemAudit({
        userId: null, userName: "Asaas Webhook", userRole: "system",
        action: `ASAAS_WEBHOOK_${event}`, targetId: payment.id, targetType: "asaas_payment",
        details: `Payment ${payment.id} → ${newStatus}. Valor: R$${payment.value || 0}. Líquido: R$${payment.netValue || 0}. Data pgto: ${payment.paymentDate || "—"}`,
        ipAddress: (req as any).ip,
      });

      console.log(`[asaas] Webhook: payment ${payment.id} → ${newStatus}`);
      res.json({ received: true });
    } catch (err: any) {
      console.error("[asaas] Webhook error:", err.message);
      res.json({ received: true });
    }
  });

  app.get("/api/asaas/payments", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const offset = parseInt(req.query.offset as string) || 0;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string;
      let path = `/payments?offset=${offset}&limit=${limit}`;
      if (status) path += `&status=${status}`;
      const data = await asaasRequest("GET", path);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/boletim-medicao/gerar-fatura/:clientId", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId);
      if (!clientId) return res.status(400).json({ message: "clientId inválido" });

      const { billingType, sendToAsaas, dueDate, startDate, endDate, expectedTotal } = req.body;
      const user = (req as any).user;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Período obrigatório. Informe startDate e endDate." });
      }

      const fromDate = `${startDate}T00:00:00`;
      const toDate = `${endDate}T23:59:59`;

      let query = supabaseAdmin
        .from("escort_billings")
        .select("*")
        .eq("client_id", clientId)
        .not("status", "in", '("RECUSADA","FATURADA","FATURADO","CANCELADA")')
        .gte("data_missao", fromDate)
        .lte("data_missao", toDate);

      const { data: billings, error: billErr } = await query;

      if (billErr) throw billErr;
      if (!billings || billings.length === 0) {
        const { data: allBillings } = await supabaseAdmin
          .from("escort_billings")
          .select("id, status")
          .eq("client_id", clientId)
          .gte("data_missao", fromDate)
          .lte("data_missao", toDate);
        
        const total = allBillings?.length || 0;
        const faturados = allBillings?.filter((b: any) => b.status === "FATURADO" || b.status === "FATURADA").length || 0;
        
        if (faturados > 0) {
          return res.status(400).json({ message: `Todas as ${faturados} OS neste período já foram faturadas. Para gerar nova fatura, exclua a fatura existente primeiro.` });
        }
        return res.status(400).json({ message: `Nenhuma OS faturável no período ${startDate} a ${endDate}. Verifique se existem OS com status "APROVADA" neste período.` });
      }

      console.log(`[asaas] Faturando ${billings.length} OS(s) para cliente ${clientId}. Período: ${startDate} a ${endDate}. Status: ${[...new Set(billings.map(b => b.status))].join(", ")}`);


      const clientName = billings[0].client_name || "Cliente";

      const osDescriptions: string[] = [];
      let totalValue = 0;
      const billingIds: string[] = [];

      for (const b of billings) {
        const acionamento = Number(b.fat_acionamento || 0);
        const horaExtra = Number(b.fat_hora_extra || 0);
        const km = Number(b.fat_km || 0);
        const pedagio = Number(b.despesas_pedagio || 0);
        const receitas = Number(b.receitas_os || 0);
        const fat = acionamento + horaExtra + km + pedagio + receitas;
        totalValue += fat;
        billingIds.push(b.id);

        const osRef = b.boletim_numero || `OS-${b.service_order_id}`;
        const route = [b.origem, b.destino].filter(Boolean).join(" → ");
        const dataMissao = b.data_missao ? new Date(b.data_missao).toLocaleDateString("pt-BR") : "";
        osDescriptions.push(`${osRef} ${dataMissao} ${route} ${fmt(fat)}`.trim());
        console.log(`[billing-audit] ${osRef}: acion=${acionamento} hExtra=${horaExtra} km=${km} ped=${pedagio} rec=${receitas} = ${fat}`);
      }
      console.log(`[billing-audit] TOTAL para fatura: R$${totalValue.toFixed(2)} (${billings.length} OS). Período: ${startDate} a ${endDate}`);
      if (totalValue <= 0) {
        return res.status(400).json({ message: `Valor total é R$0,00. Verifique o Boletim de Medição.` });
      }

      if (expectedTotal && Math.abs(totalValue - Number(expectedTotal)) > 0.01) {
        const msg = `BLOQUEADO: Soma do backend (R$${totalValue.toFixed(2)}) difere do frontend (R$${Number(expectedTotal).toFixed(2)}). Diferença: R$${Math.abs(totalValue - Number(expectedTotal)).toFixed(2)}`;
        console.error(`[billing-audit] ${msg}`);
        return res.status(400).json({ message: msg });
      }

      const now = new Date();
      const invoiceDueDate = dueDate || new Date(now.getFullYear(), now.getMonth() + 1, 15).toISOString().split("T")[0];

      const datasOs = billings.map(b => b.data_missao || b.created_at).filter(Boolean).sort();
      const periodoInicio = datasOs[0]?.split("T")[0] || invoiceDueDate;
      const periodoFim = datasOs[datasOs.length - 1]?.split("T")[0] || invoiceDueDate;
      const descricaoFiscal = buildInvoiceDescription(clientName, periodoInicio, periodoFim);
      console.log(`[billing-audit] Detalhamento interno (${billings.length} OS):\n${osDescriptions.join("\n")}`);

      const { data: clientData } = await supabaseAdmin.from("clients").select("cnpj, cpf, emite_nf, address, city, state, email, email_financeiro, phone").eq("id", clientId).single();
      const cpfCnpj = clientData?.cnpj || clientData?.cpf || "";
      const emiteNfConsolidado = clientData?.emite_nf === true;
      const clientEmailConsolidado = clientData?.email_financeiro || clientData?.email || undefined;
      const clientPhoneConsolidado = clientData?.phone || undefined;

      let asaasCustomerId: string | null = null;
      let asaasPaymentId: string | null = null;
      let invoiceUrl: string | null = null;
      let bankSlipUrl: string | null = null;
      let pixQrCode: string | null = null;
      let pixCopiaECola: string | null = null;
      let invoiceStatus = "PENDING";

      if (sendToAsaas && process.env.ASAAS_API_KEY && cpfCnpj) {
        try {
          asaasCustomerId = await findOrCreateAsaasCustomer(clientName, cpfCnpj, clientEmailConsolidado, clientPhoneConsolidado);
          const consolidadoPayload: any = {
            customer: asaasCustomerId,
            billingType: billingType || "BOLETO",
            value: totalValue,
            dueDate: invoiceDueDate,
            description: descricaoFiscal.substring(0, 500),
            externalReference: `FATURA-${clientId}-${now.getTime()}`,
            notificationDisabled: false,
          };
          if (emiteNfConsolidado) {
            consolidadoPayload.postalService = false;
            consolidadoPayload.fiscalObservations = `Referente aos serviços de Escolta Armada Caracterizada. CNAE ${CNAE_PRINCIPAL}. Período: ${periodoInicio} a ${periodoFim}.`;
          }
          console.log(`[asaas] PAYLOAD AUDIT — Enviando para Asaas:`, JSON.stringify(consolidadoPayload, null, 2));
          const payment = await asaasRequest("POST", "/payments", consolidadoPayload);
          asaasPaymentId = payment.id;
          invoiceUrl = payment.invoiceUrl;
          bankSlipUrl = payment.bankSlip?.url || payment.bankSlipUrl;
          invoiceStatus = payment.status || "PENDING";
          if (billingType === "PIX" || billingType === "UNDEFINED") {
            try {
              const pixData = await asaasRequest("GET", `/payments/${payment.id}/pixQrCode`);
              pixQrCode = pixData.encodedImage;
              pixCopiaECola = pixData.payload;
            } catch {}
          }

          if (emiteNfConsolidado && asaasPaymentId) {
            try {
              const fiscalPayload = buildFiscalPayload(totalValue, cpfCnpj);
              await asaasRequest("POST", `/payments/${asaasPaymentId}/fiscalInfo`, fiscalPayload);
              console.log(`[asaas] NFS-e configurada para payment ${asaasPaymentId} CNAE ${CNAE_PRINCIPAL}`);
            } catch (nfErr: any) {
              console.log(`[asaas] NFS-e config error (non-blocking): ${nfErr.message}`);
            }
          }

          await logSystemAudit({
            userId: user?.id, userName: user?.name, userRole: user?.role,
            action: "ASAAS_FATURA_CONSOLIDADA", targetId: asaasPaymentId, targetType: "invoice",
            details: `Fatura consolidada ${billingType || "BOLETO"} R$${totalValue.toFixed(2)} para ${clientName}. ${billings.length} OS(s). CNAE ${CNAE_PRINCIPAL}. Período: ${periodoInicio} a ${periodoFim}. Asaas: ${asaasPaymentId}`,
            ipAddress: (req as any).ip,
          });
        } catch (asaasErr: any) {
          console.error("[asaas] Erro ao gerar cobrança:", asaasErr.message);
          await logSystemAudit({
            userId: user?.id, userName: user?.name, userRole: user?.role,
            action: "ASAAS_FATURA_ERRO", targetId: String(clientId), targetType: "invoice",
            details: `ERRO fatura consolidada ${clientName}: ${asaasErr.message}. ${billings.length} OS(s). Valor: R$${totalValue.toFixed(2)}`,
            ipAddress: (req as any).ip,
          });
        }
      }

      const { data: invoice, error: invErr } = await supabaseAdmin.from("invoices").insert({
        client_id: clientId,
        client_name: clientName,
        client_cpf_cnpj: cpfCnpj || null,
        asaas_customer_id: asaasCustomerId,
        asaas_payment_id: asaasPaymentId,
        description: descricaoFiscal,
        value: totalValue,
        due_date: invoiceDueDate,
        billing_type: billingType || "BOLETO",
        status: invoiceStatus,
        invoice_url: invoiceUrl,
        bank_slip_url: bankSlipUrl,
        pix_qr_code: pixQrCode,
        pix_copia_e_cola: pixCopiaECola,
        notes: `Referente aos serviços de Escolta Armada Caracterizada - Período: ${periodoInicio} a ${periodoFim}. ${billings.length} missão(ões) aprovada(s).`,
        external_reference: `BOLETIM-${clientId}-${billingIds.length}OS`,
        created_by: user?.id,
      }).select().single();

      if (invErr) throw invErr;

      const { error: updateErr } = await supabaseAdmin
        .from("escort_billings")
        .update({
          status: "FATURADO",
          faturado_em: new Date().toISOString(),
          faturado_por: user?.name || "Sistema",
          invoice_id: invoice.id,
        })
        .in("id", billingIds);

      if (updateErr) {
        console.error("[billing] Erro ao atualizar status para FATURADO:", updateErr.message);
      }

      await logSystemAudit({
        userId: user?.id, userName: user?.name, userRole: user?.role,
        action: "GERAR_FATURA", targetId: String(invoice.id), targetType: "invoice",
        details: `Fatura consolidada para ${clientName}. ${billings.length} OS(s). Valor: R$${totalValue.toFixed(2)}. IDs: ${billingIds.join(", ")}. Asaas: ${asaasPaymentId || "não enviado"}`,
        ipAddress: (req as any).ip,
      });

      res.json({
        invoice,
        billingIds,
        totalValue,
        missionsCount: billings.length,
      });
    } catch (err: any) {
      console.error("[billing] Erro ao gerar fatura:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/invoices/:id", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const invoiceId = parseInt(req.params.id);
      if (isNaN(invoiceId)) return res.status(400).json({ message: "ID inválido" });

      const user = (req as any).user;
      if (user?.role !== "diretoria") {
        return res.status(403).json({ message: "Somente a diretoria pode excluir faturas." });
      }

      const { data: invoice } = await supabaseAdmin.from("invoices").select("*").eq("id", invoiceId).single();
      if (!invoice) return res.status(404).json({ message: "Fatura não encontrada" });

      if (invoice.status === "PAGO") {
        return res.status(400).json({ message: "Não é possível excluir fatura já paga" });
      }

      const { data: linkedBillings } = await supabaseAdmin
        .from("escort_billings")
        .select("id")
        .eq("invoice_id", invoiceId);

      if (linkedBillings && linkedBillings.length > 0) {
        const billingIds = linkedBillings.map((b: any) => b.id);
        await supabaseAdmin
          .from("escort_billings")
          .update({ status: "APROVADA", invoice_id: null, faturado_em: null, faturado_por: null })
          .in("id", billingIds);
      }

      if (invoice.asaas_payment_id && process.env.ASAAS_API_KEY) {
        try {
          await asaasRequest("DELETE", `/payments/${invoice.asaas_payment_id}`);
        } catch (e: any) {
          console.log("[asaas] Delete payment error:", e.message);
        }
      }

      await supabaseAdmin.from("financial_transactions").delete().eq("reference_id", `INV-${invoiceId}`);
      await supabaseAdmin.from("invoices").delete().eq("id", invoiceId);

      await logSystemAudit({
        userId: user?.id, userName: user?.name, userRole: user?.role,
        action: "DELETE_FATURA", targetId: String(invoiceId), targetType: "invoice",
        details: `Fatura #${invoiceId} excluída. ${linkedBillings?.length || 0} billing(s) revertidos para APROVADA.`,
        ipAddress: (req as any).ip,
      });

      res.json({ success: true, revertedBillings: linkedBillings?.length || 0 });
    } catch (err: any) {
      console.error("[billing] Erro ao excluir fatura:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  console.log("[asaas] Rotas de faturamento Asaas registradas");
}

function fmt(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
