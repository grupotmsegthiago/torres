import { Express, Request, Response } from "express";
import { supabaseAdmin } from "../supabase";
import crypto from "crypto";
import nodemailer from "nodemailer";

const requireAdminRole = (req: Request, res: Response, next: any) => {
  if (!req.user) return res.status(401).json({ message: "Não autenticado" });
  next();
};

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getBaseUrl(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return `${proto}://${host}`;
}

async function sendApprovalEmail(to: string, clientName: string, approvalUrl: string, period: string, osCount: number, totalValue: number) {
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: "thiago@grupotmseg.com.br",
      pass: process.env.SMTP_PASS,
    },
  });

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
      <div style="background: #1B1B1B; padding: 24px; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 20px; letter-spacing: 2px;">TORRES VIGILÂNCIA PATRIMONIAL</h1>
        <p style="color: #aaa; margin: 6px 0 0; font-size: 12px;">CNPJ 36.982.392/0001-89</p>
      </div>
      <div style="padding: 32px 24px;">
        <h2 style="color: #1B1B1B; margin: 0 0 8px; font-size: 18px;">Boletim de Medição Disponível</h2>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          Prezado(a) <strong>${clientName}</strong>,
        </p>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          O boletim de medição referente ao período <strong>${period}</strong> está disponível para sua revisão e aprovação.
        </p>
        <div style="background: #f8f8f8; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #888; font-size: 13px;">Quantidade de OS:</td>
              <td style="padding: 6px 0; text-align: right; font-weight: bold; font-size: 14px;">${osCount}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #888; font-size: 13px;">Valor Total:</td>
              <td style="padding: 6px 0; text-align: right; font-weight: bold; font-size: 16px; color: #059669;">${fmt(totalValue)}</td>
            </tr>
          </table>
        </div>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          Clique no botão abaixo para visualizar os detalhes e aprovar a medição:
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${approvalUrl}" style="display: inline-block; background: #059669; color: #fff; padding: 14px 36px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px; letter-spacing: 0.5px;">
            Revisar e Aprovar Medição
          </a>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center;">
          Este link é válido por 30 dias. Caso tenha dúvidas, entre em contato conosco.
        </p>
      </div>
      <div style="background: #f5f5f5; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e5e5;">
        <p style="color: #999; font-size: 11px; margin: 0;">Torres Vigilância Patrimonial LTDA — Serviço de Escolta Armada</p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: '"Torres Vigilância Patrimonial" <thiago@grupotmseg.com.br>',
    to,
    subject: `Boletim de Medição — ${period} — Aprovação Pendente`,
    html,
  });
}

export function registerBoletimApprovalRoutes(app: Express) {
  app.post("/api/boletim/enviar-aprovacao", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { clientId, clientName, clientEmail, periodStart, periodEnd, billingIds, totalValue, osCount } = req.body;

      if (!clientId || !clientEmail || !billingIds?.length) {
        return res.status(400).json({ message: "Dados incompletos. Informe cliente, e-mail e IDs dos boletins." });
      }

      const token = generateToken();
      const baseUrl = getBaseUrl(req);
      const approvalUrl = `${baseUrl}/aprovacao/${token}`;

      const period = `${new Date(periodStart + "T12:00:00Z").toLocaleDateString("pt-BR")} a ${new Date(periodEnd + "T12:00:00Z").toLocaleDateString("pt-BR")}`;

      const { data, error } = await supabaseAdmin.from("boletim_approvals").insert({
        token,
        client_id: clientId,
        client_name: clientName,
        client_email: clientEmail,
        period_start: periodStart,
        period_end: periodEnd,
        billing_ids: billingIds,
        total_value: totalValue || 0,
        os_count: osCount || billingIds.length,
        status: "PENDENTE",
      }).select().single();

      if (error) throw error;

      try {
        await sendApprovalEmail(clientEmail, clientName, approvalUrl, period, osCount || billingIds.length, totalValue || 0);
        console.log(`[boletim-approval] E-mail enviado para ${clientEmail} (token: ${token.substring(0, 8)}...)`);
      } catch (emailErr: any) {
        console.error(`[boletim-approval] Erro ao enviar e-mail:`, emailErr.message);
        return res.json({ ...data, emailError: emailErr.message, approvalUrl });
      }

      res.json({ ...data, approvalUrl });
    } catch (err: any) {
      console.error("[boletim-approval] Erro:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/boletim/aprovacao/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { data: approval, error } = await supabaseAdmin
        .from("boletim_approvals")
        .select("*")
        .eq("token", token)
        .single();

      if (error || !approval) return res.status(404).json({ message: "Link de aprovação não encontrado ou expirado." });

      if (new Date(approval.expires_at) < new Date()) {
        return res.status(410).json({ message: "Este link de aprovação expirou." });
      }

      const billingIds = approval.billing_ids || [];
      let billings: any[] = [];
      if (billingIds.length > 0) {
        const { data: b } = await supabaseAdmin
          .from("escort_billings")
          .select("id, service_order_id, fat_acionamento, fat_hora_extra, fat_km, despesas_pedagio, fat_adicional_noturno, receitas_os, fat_total, km_total, km_franquia, km_excedente, horas_trabalhadas, horario_inicio, horario_fim, status")
          .in("id", billingIds);
        billings = b || [];
      }

      let orders: any[] = [];
      const soIds = billings.map(b => b.service_order_id).filter(Boolean);
      if (soIds.length > 0) {
        const { data: sos } = await supabaseAdmin
          .from("service_orders")
          .select("id, os_number, origin, destination, scheduled_date, vehicle_plate, escorted_vehicle_plate, completed_date")
          .in("id", soIds);
        orders = sos || [];
      }

      const enriched = billings.map(b => {
        const so = orders.find(o => o.id === b.service_order_id);
        return {
          ...b,
          osNumber: so?.os_number || `OS-${b.service_order_id}`,
          origin: so?.origin || "",
          destination: so?.destination || "",
          scheduledDate: so?.scheduled_date,
          completedDate: so?.completed_date,
          vehiclePlate: so?.vehicle_plate || "",
          escortedPlate: so?.escorted_vehicle_plate || "",
        };
      });

      res.json({
        id: approval.id,
        clientName: approval.client_name,
        periodStart: approval.period_start,
        periodEnd: approval.period_end,
        totalValue: approval.total_value,
        osCount: approval.os_count,
        status: approval.status,
        approvedAt: approval.approved_at,
        approvedByName: approval.approved_by_name,
        billings: enriched,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/boletim/aprovacao/:token/aprovar", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { nome } = req.body;

      const { data: approval, error } = await supabaseAdmin
        .from("boletim_approvals")
        .select("*")
        .eq("token", token)
        .single();

      if (error || !approval) return res.status(404).json({ message: "Link de aprovação não encontrado." });

      if (approval.status === "APROVADO") {
        return res.status(400).json({ message: "Este boletim já foi aprovado." });
      }

      if (new Date(approval.expires_at) < new Date()) {
        return res.status(410).json({ message: "Este link de aprovação expirou." });
      }

      const clientIp = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket.remoteAddress || "";

      const { error: updateErr } = await supabaseAdmin
        .from("boletim_approvals")
        .update({
          status: "APROVADO",
          approved_at: new Date().toISOString(),
          approved_by_name: nome || "Cliente",
          approved_by_ip: clientIp,
        })
        .eq("id", approval.id);

      if (updateErr) throw updateErr;

      const billingIds = approval.billing_ids || [];
      if (billingIds.length > 0) {
        const { error: billErr } = await supabaseAdmin
          .from("escort_billings")
          .update({
            status: "APROVADA",
            revisado_por: `Cliente: ${nome || approval.client_name}`,
            revisado_em: new Date().toISOString(),
          })
          .in("id", billingIds)
          .in("status", ["A_VERIFICAR", "CALCULADO"]);

        if (billErr) console.error("[boletim-approval] Erro ao aprovar billings:", billErr.message);
        else console.log(`[boletim-approval] ${billingIds.length} billing(s) aprovados pelo cliente ${nome || approval.client_name}`);
      }

      res.json({ success: true, message: "Boletim aprovado com sucesso!" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/boletim/aprovacoes", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("boletim_approvals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  console.log("[boletim-approval] Rotas de aprovação de boletim registradas");
}
