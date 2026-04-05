import type { Express, Request, Response } from "express";
import { requireAdminRole } from "./auth";
import { supabaseAdmin } from "./supabase";

const ASAAS_API_URL = process.env.ASAAS_API_URL || "https://www.asaas.com/api/v3";

function getApiKey(): string {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("ASAAS_API_KEY não configurada");
  return key;
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

async function findOrCreateAsaasCustomer(name: string, cpfCnpj: string): Promise<string> {
  const cleanDoc = cpfCnpj.replace(/[^\d]/g, "");
  if (!cleanDoc) throw new Error("CPF/CNPJ é obrigatório para criar cobrança no Asaas");

  try {
    const search = await asaasRequest("GET", `/customers?cpfCnpj=${cleanDoc}`);
    if (search.data && search.data.length > 0) {
      return search.data[0].id;
    }
  } catch {}

  const customer = await asaasRequest("POST", "/customers", {
    name,
    cpfCnpj: cleanDoc,
  });
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
        asaasCustomerId = await findOrCreateAsaasCustomer(clientName, clientCpfCnpj || "");

        const payment = await asaasRequest("POST", "/payments", {
          customer: asaasCustomerId,
          billingType: billingType || "BOLETO",
          value: parseFloat(value),
          dueDate,
          description,
          externalReference: serviceOrderId ? `OS-${serviceOrderId}` : undefined,
        });

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

      const { data: existing } = await supabaseAdmin.from("invoices").select("*").eq("id", id).single();
      if (!existing) return res.status(404).json({ message: "Fatura não encontrada" });

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

  app.delete("/api/invoices/:id", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

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
      res.json({ success: true, message: "Notificação reenviada" });
    } catch (err: any) {
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

      await supabaseAdmin
        .from("invoices")
        .update(updates)
        .eq("asaas_payment_id", payment.id);

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

  console.log("[asaas] Rotas de faturamento Asaas registradas");
}
