/**
 * Rotas do Banco Inter (Cobrança + Banking + Webhooks).
 *
 * Endpoints expostos:
 *  GET    /api/inter/status              — saúde da integração + saldo
 *  GET    /api/inter/saldo               — saldo detalhado
 *  GET    /api/inter/extrato             — extrato (params from, to, detalhado, pagina)
 *  POST   /api/inter/cobranca            — criar cobrança (boleto+PIX)
 *  GET    /api/inter/cobranca/:cod       — consultar cobrança
 *  POST   /api/inter/cobranca/:cod/cancelar — cancelar
 *  GET    /api/inter/cobranca/:cod/pdf   — baixar PDF do boleto
 *  GET    /api/inter/cobrancas           — listar cobranças (params dataInicial, dataFinal, situacao)
 *  POST   /api/inter/pagamento/boleto    — pagar boleto
 *  POST   /api/inter/pix                 — fazer PIX out
 *  GET    /api/inter/pagamentos          — histórico de pagamentos enviados
 *  POST   /api/inter/webhook/setup       — registra webhook no Inter
 *  GET    /api/inter/webhook/setup       — consulta webhook configurado
 *  DELETE /api/inter/webhook/setup       — remove webhook
 *  POST   /api/inter/webhook/cobranca    — endpoint público recebido pelo Inter
 *  GET    /api/inter/webhook/eventos     — histórico de eventos recebidos
 */
import type { Express } from "express";
import { requireAuth, requireDiretoria } from "../auth";
import { supabaseAdmin } from "../supabase";
import { isInterConfigured, getInterClient } from "../services/inter/client";
import * as cobranca from "../services/inter/cobranca";
import * as banking from "../services/inter/banking";
import { logSystemAudit } from "../audit";

export function registerInterRoutes(app: Express) {
  console.log("[inter] Rotas Banco Inter registradas (cobrança + extrato + saldo + pagamentos + webhook)");
  // === STATUS / SAÚDE ===
  app.get("/api/inter/status", requireAuth, async (_req, res) => {
    if (!isInterConfigured()) {
      return res.json({
        connected: false,
        message: "Banco Inter não configurado. Configure INTER_CLIENT_ID, INTER_CLIENT_SECRET, INTER_CONTA_CORRENTE, INTER_CERT_CRT, INTER_CERT_KEY nos secrets.",
      });
    }
    try {
      const c = getInterClient();
      const saldo = await banking.consultarSaldo();
      return res.json({
        connected: true,
        ambiente: c.getAmbiente() === "prod" ? "PRODUÇÃO" : "SANDBOX",
        contaCorrente: c.getContaCorrente(),
        saldo: Number(saldo.disponivel || 0),
        saldoBloqueado:
          Number(saldo.bloqueado || 0) +
          Number(saldo.bloqueadoJudicialmente || 0) +
          Number(saldo.bloqueadoAdministrativamente || 0),
      });
    } catch (e: any) {
      return res.json({ connected: false, message: e.message || "Falha ao consultar saldo Inter" });
    }
  });

  app.get("/api/inter/saldo", requireAuth, requireDiretoria, async (_req, res) => {
    try {
      res.json(await banking.consultarSaldo());
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // === EXTRATO ===
  app.get("/api/inter/extrato", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const dataInicio = String(req.query.from || "");
      const dataFim = String(req.query.to || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(dataFim)) {
        return res.status(400).json({ message: "Parâmetros from/to obrigatórios em YYYY-MM-DD" });
      }
      const detalhado = req.query.detalhado === "true";
      if (detalhado) {
        const pagina = Number(req.query.pagina) || 0;
        return res.json(await banking.consultarExtratoCompleto(dataInicio, dataFim, pagina, 50));
      }
      res.json(await banking.consultarExtrato(dataInicio, dataFim));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // === COBRANÇAS ===
  app.post("/api/inter/cobranca", requireAuth, async (req, res) => {
    try {
      const { invoiceId, ...input } = req.body || {};
      if (!input.seuNumero || !input.valorNominal || !input.dataVencimento || !input.pagador) {
        return res.status(400).json({ message: "Campos obrigatórios: seuNumero, valorNominal, dataVencimento, pagador" });
      }
      const out = await cobranca.criarCobranca(input);

      if (invoiceId) {
        await supabaseAdmin
          .from("invoices")
          .update({ inter_codigo_solicitacao: out.codigoSolicitacao, gateway: "inter" })
          .eq("id", invoiceId);
      }
      await logSystemAudit({
        action: "INTER_COBRANCA_GERADA",
        targetId: out.codigoSolicitacao,
        targetType: "invoice",
        details: { invoiceId, valor: input.valorNominal, seuNumero: input.seuNumero },
      });
      res.json(out);
    } catch (e: any) {
      await logSystemAudit({
        action: "INTER_COBRANCA_ERRO",
        targetType: "invoice",
        details: { error: e.message, body: req.body },
      });
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/inter/cobranca/:cod", requireAuth, async (req, res) => {
    try {
      res.json(await cobranca.consultarCobranca(req.params.cod));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/inter/cobranca/:cod/cancelar", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const motivo = String(req.body?.motivo || "ACEITEI_O_RISCO");
      await cobranca.cancelarCobranca(req.params.cod, motivo);
      await supabaseAdmin
        .from("invoices")
        .update({ status: "CANCELLED" })
        .eq("inter_codigo_solicitacao", req.params.cod);
      await logSystemAudit({
        action: "INTER_COBRANCA_CANCELADA",
        targetId: req.params.cod,
        targetType: "invoice",
        details: { motivo },
      });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/inter/cobranca/:cod/pdf", requireAuth, async (req, res) => {
    try {
      const out = await cobranca.obterPdfBoleto(req.params.cod);
      const buf = Buffer.from((out as any).pdf, "base64");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="boleto-${req.params.cod}.pdf"`);
      res.send(buf);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/inter/cobrancas", requireAuth, async (req, res) => {
    try {
      const query: any = {
        dataInicial: String(req.query.dataInicial || ""),
        dataFinal: String(req.query.dataFinal || ""),
        situacao: req.query.situacao ? String(req.query.situacao) : undefined,
        itensPorPagina: Number(req.query.itensPorPagina) || 50,
        paginaAtual: Number(req.query.paginaAtual) || 0,
      };
      res.json(await cobranca.listarCobrancas(query));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // === PAGAMENTOS ===
  app.post("/api/inter/pagamento/boleto", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const out = await banking.pagarBoleto(req.body);
      await supabaseAdmin.from("inter_pagamentos").insert({
        tipo: "boleto",
        codigo_transacao_inter: out.codigoTransacao,
        valor: req.body.valorPagar,
        data_pagamento: req.body.dataPagamento,
        cod_barras: req.body.codBarraLinhaDigitavel,
        beneficiario_cpf_cnpj: req.body.cpfCnpjBeneficiario,
        descricao: req.body.descricao,
        status: "APROVADO",
        created_by: (req as any).user?.id,
      });
      await logSystemAudit({
        action: "INTER_BOLETO_PAGO",
        targetId: out.codigoTransacao,
        targetType: "pagamento",
        details: { valor: req.body.valorPagar, codBarras: req.body.codBarraLinhaDigitavel?.slice(-6) },
      });
      res.json(out);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/inter/pix", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const out = await banking.realizarPix(req.body);
      const codigo = out.endToEndId || out.idempotenteId || out.codigoSolicitacao;
      await supabaseAdmin.from("inter_pagamentos").insert({
        tipo: "pix",
        codigo_transacao_inter: codigo,
        valor: req.body.valor,
        data_pagamento: req.body.dataPagamento || new Date().toISOString().slice(0, 10),
        pix_chave: req.body.destinatario?.chave || null,
        pix_destino_nome: req.body.destinatario?.nome || null,
        pix_destino_cpf_cnpj: req.body.destinatario?.cpfCnpj || null,
        descricao: req.body.descricao,
        status: "APROVADO",
        created_by: (req as any).user?.id,
      });
      await logSystemAudit({
        action: "INTER_PIX_ENVIADO",
        targetId: codigo,
        targetType: "pagamento",
        details: { valor: req.body.valor, descricao: req.body.descricao },
      });
      res.json(out);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/inter/pagamentos", requireAuth, requireDiretoria, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("inter_pagamentos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ message: error.message });
    res.json(data || []);
  });

  // Lista despesas pendentes (financial_transactions tipo DESPESA) — usado em Contas a Pagar
  app.get("/api/financeiro/contas-a-pagar", requireAuth, requireDiretoria, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("financial_transactions")
      .select("*")
      .eq("type", "DESPESA")
      .in("status", ["PENDING", "PENDENTE"])
      .order("due_date", { ascending: true })
      .limit(500);
    if (error) return res.status(500).json({ message: error.message });
    res.json(data || []);
  });

  // === WEBHOOK SETUP (admin) ===
  app.post("/api/inter/webhook/setup", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const url =
        String(req.body?.url || "") ||
        `${req.protocol}://${req.get("host")}/api/inter/webhook/cobranca`;
      await cobranca.cadastrarWebhook(url);
      await logSystemAudit({ action: "INTER_WEBHOOK_REGISTRADO", targetType: "webhook", details: { url } });
      res.json({ ok: true, url });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/inter/webhook/setup", requireAuth, requireDiretoria, async (_req, res) => {
    try {
      res.json(await cobranca.consultarWebhook());
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/inter/webhook/setup", requireAuth, requireDiretoria, async (_req, res) => {
    try {
      await cobranca.excluirWebhook();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/inter/webhook/eventos", requireAuth, requireDiretoria, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("inter_webhook_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return res.status(500).json({ message: error.message });
    res.json(data || []);
  });

  // === WEBHOOK PÚBLICO (recebe do Inter) ===
  app.post("/api/inter/webhook/cobranca", async (req, res) => {
    try {
      const events = Array.isArray(req.body) ? req.body : [req.body];
      for (const ev of events) {
        const codigoSolicitacao =
          ev?.codigoSolicitacao ||
          ev?.cobranca?.codigoSolicitacao ||
          ev?.cobranca?.codigoSolicitacao;
        const evento = ev?.situacao || ev?.evento || "DESCONHECIDO";

        await supabaseAdmin.from("inter_webhook_events").insert({
          evento,
          codigo_solicitacao: codigoSolicitacao,
          payload: ev,
          processed: false,
        });

        // Pagamento confirmado → atualiza invoice + cria transação
        if (
          codigoSolicitacao &&
          ["RECEBIDO", "PAGO", "PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "MARCADA_RECEBIDA"].includes(evento)
        ) {
          const dataHoraSituacao = ev?.dataHoraSituacao || new Date().toISOString();
          const { data: inv } = await supabaseAdmin
            .from("invoices")
            .select("id, value, client_name, gateway")
            .eq("inter_codigo_solicitacao", codigoSolicitacao)
            .maybeSingle();

          if (inv) {
            await supabaseAdmin
              .from("invoices")
              .update({ status: "RECEIVED", payment_date: String(dataHoraSituacao).slice(0, 10) })
              .eq("id", inv.id);

            await supabaseAdmin.from("financial_transactions").insert({
              type: "RECEITA",
              category: "Cobrança Inter",
              description: `Recebimento Inter — ${inv.client_name || "Cliente"} (${codigoSolicitacao})`,
              amount: inv.value,
              date: String(dataHoraSituacao).slice(0, 10),
              origin_type: "inter_webhook",
              origin_id: codigoSolicitacao,
            });

            await supabaseAdmin
              .from("inter_webhook_events")
              .update({ processed: true })
              .eq("codigo_solicitacao", codigoSolicitacao);
          }
        }
      }
      // Sempre 200 — Inter retenta indefinidamente em 4xx/5xx
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[Inter Webhook] erro processando:", e);
      res.json({ ok: false, error: e.message });
    }
  });
}
