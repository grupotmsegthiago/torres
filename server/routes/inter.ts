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
import { requireAuth, requireDiretoria, requireDiretoriaStrict, requireAdminRole } from "../auth";
import { supabaseAdmin } from "../supabase";
import { isInterConfigured, getInterClient } from "../services/inter/client";
import * as cobranca from "../services/inter/cobranca";
import * as banking from "../services/inter/banking";
import { logSystemAudit } from "../audit";
import { logFinancialAudit } from "./_helpers";
import {
  parseInterWebhookEvent,
  isInterPaymentConfirmation,
  classifyInterPayment,
} from "../lib/inter-webhook-parser";

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

  app.get("/api/inter/saldo", requireAuth, requireDiretoriaStrict, async (_req, res) => {
    try {
      res.json(await banking.consultarSaldo());
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // === EXTRATO ===
  app.get("/api/inter/extrato", requireAuth, requireDiretoriaStrict, async (req, res) => {
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
  // Helper: exige comprovante (PDF/JPG/PNG <=5MB) e o vincula ao lançamento
  // financeiro informado, fazendo upload para o bucket privado antes do pagamento.
  async function uploadComprovantePagamento(req: any): Promise<string> {
    const { transactionId, comprovanteBase64, comprovanteFileName, comprovanteContentType } = req.body || {};
    if (!transactionId) throw new Error("transactionId é obrigatório (lançamento financeiro)");
    if (!comprovanteBase64 || !comprovanteFileName) throw new Error("Comprovante é obrigatório (PDF, JPG ou PNG)");
    const ext = String(comprovanteFileName).split(".").pop()?.toLowerCase() || "";
    if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) throw new Error("Apenas PDF, JPG ou PNG");
    const buffer = Buffer.from(String(comprovanteBase64).replace(/^data:[^;]+;base64,/, ""), "base64");
    if (buffer.length > 5 * 1024 * 1024) throw new Error("Comprovante excede 5 MB");
    const safeName = `${transactionId}_${Date.now()}.${ext}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const storagePath = `${transactionId}/${safeName}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("comprovantes-pagamento")
      .upload(storagePath, buffer, { contentType: comprovanteContentType || "application/octet-stream", upsert: true });
    if (upErr) throw upErr;
    const nowBrt = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T");
    await supabaseAdmin
      .from("financial_transactions")
      .update({ comprovante_url: storagePath, comprovante_path: storagePath, comprovante_anexado_em: nowBrt })
      .eq("id", transactionId);
    return storagePath;
  }

  app.post("/api/inter/pagamento/boleto", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const user = (req as any).user;
      const txId = String(req.body?.transactionId || "");
      const storagePath = await uploadComprovantePagamento(req);
      const out = await banking.pagarBoleto(req.body);
      // Marca o lançamento como PAID (BRT) e registra audit log unificado
      const nowBrt = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T");
      await supabaseAdmin
        .from("financial_transactions")
        .update({ status: "PAID", payment_date: nowBrt.slice(0, 10) })
        .eq("id", txId);
      await logFinancialAudit("financial_transactions", txId, "UPDATE", [
        { field: "status", old: "PENDING", new_val: "PAID" },
        { field: "comprovante_path", old: null, new_val: storagePath },
        { field: "pagamento_inter", old: null, new_val: { tipo: "boleto", codigo: out.codigoTransacao, valor: req.body.valorPagar } },
      ], user?.name || "?", user?.id, "Pagamento Boleto Inter");
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
      const user = (req as any).user;
      const txId = String(req.body?.transactionId || "");
      const storagePath = await uploadComprovantePagamento(req);
      const out = await banking.realizarPix(req.body);
      const codigo = out.endToEndId || out.idempotenteId || out.codigoSolicitacao;
      const nowBrt = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T");
      await supabaseAdmin
        .from("financial_transactions")
        .update({ status: "PAID", payment_date: nowBrt.slice(0, 10) })
        .eq("id", txId);
      await logFinancialAudit("financial_transactions", txId, "UPDATE", [
        { field: "status", old: "PENDING", new_val: "PAID" },
        { field: "comprovante_path", old: null, new_val: storagePath },
        { field: "pagamento_inter", old: null, new_val: { tipo: "pix", codigo, valor: req.body.valor } },
      ], user?.name || "?", user?.id, "Pagamento PIX Inter");
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

  // Lista despesas pendentes (financial_transactions tipo DESPESA) — usado em Contas a Pagar.
  // Exclui lançamentos de origem automática (mission/fueling/etc) e categorias
  // de missão (CUSTOS DE MISSÃO, COMBUSTÍVEL) — esses já são tratados em
  // Conferência. Inclui também AGUARDANDO_APROVACAO para que admin/financeiro
  // VEJA o que foi lançado (em cinza/disabled na UI) — só diretoria pode
  // aprovar/recusar via /api/financial/transactions/:id/aprovar.
  // RECUSADA fica fora da listagem.
  app.get("/api/financeiro/contas-a-pagar", requireAuth, requireAdminRole, async (_req, res) => {
    const MISSION_CATEGORIES = ["CUSTOS DE MISSÃO", "COMBUSTÍVEL", "CUSTOS DE MISSAO", "COMBUSTIVEL"];
    const { data, error } = await supabaseAdmin
      .from("financial_transactions")
      .select("*")
      .in("type", ["DESPESA", "EXPENSE"])
      .in("status", ["PENDING", "PENDENTE", "AGUARDANDO_APROVACAO"])
      .or("origin_type.is.null,origin_type.eq.manual")
      .order("due_date", { ascending: true })
      .limit(500);
    if (error) return res.status(500).json({ message: error.message });
    const filtered = (data || []).filter((t: any) => {
      const cat = String(t.category_name || "").toUpperCase();
      return !MISSION_CATEGORIES.includes(cat);
    });
    res.json(filtered);
  });

  // === RELATÓRIO ANUAL POR FORNECEDOR / CLIENTE ===
  // Retorna grade Jan–Dez com valor pago/faturado por mês, variação % vs mês anterior e,
  // opcionalmente (compareYoY=1), variação % vs mesmo mês do ano anterior (YoY).
  // Apenas diretoria. Para fornecedor: financial_transactions PAID (excluindo missão).
  // Para cliente: invoices RECEIVED/CONFIRMED/PAID. Usa payment_date (BRT).
  // Sinal de varPct/varPctYoY: positivo = boa notícia (fornecedor: paga menos; cliente: fatura mais).
  app.get("/api/financeiro/relatorio-anual", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const ano = Number(req.query.ano) || new Date().getFullYear();
      const tipo = String(req.query.tipo || "fornecedor");
      const compareYoY = req.query.compareYoY === "1" || req.query.compareYoY === "true";
      if (!["fornecedor", "cliente"].includes(tipo)) {
        return res.status(400).json({ message: "tipo deve ser 'fornecedor' ou 'cliente'" });
      }

      const MISSION_CATEGORIES = ["CUSTOS DE MISSÃO", "COMBUSTÍVEL", "CUSTOS DE MISSAO", "COMBUSTIVEL"];
      const MISSION_ORIGINS = ["mission_cost", "fueling", "service_order"];
      // Categorias de RH/Folha nunca devem aparecer no relatório por Fornecedor
      const HR_CATEGORIES = [
        "FOLHA DE PAGAMENTO", "VALE REFEIÇÃO", "VALE REFEICAO",
        "HOLERITE", "PROVISÃO SALÁRIO", "PROVISAO SALARIO",
        "ADIANTAMENTO SALARIAL", "DÉCIMO TERCEIRO", "DECIMO TERCEIRO",
        "FÉRIAS", "FERIAS", "RESCISÃO", "RESCISAO",
      ];

      type BucketMap = Map<string, { nome: string; meses: number[] }>;

      const fetchBuckets = async (targetAno: number): Promise<{ buckets: BucketMap; totalMeses: number[] }> => {
        const inicio = `${targetAno}-01-01`;
        const fim = `${targetAno}-12-31`;
        const buckets: BucketMap = new Map();
        const totalMeses = Array.from({ length: 12 }, () => 0);

        const addToBucket = (key: string, nome: string, mesIdx: number, valor: number) => {
          if (!buckets.has(key)) buckets.set(key, { nome, meses: Array.from({ length: 12 }, () => 0) });
          const b = buckets.get(key)!;
          b.meses[mesIdx] += valor;
          if (!b.nome && nome) b.nome = nome;
          totalMeses[mesIdx] += valor;
        };

        if (tipo === "fornecedor") {
          // Pagina para superar o limite default 1000 do Supabase REST
          // Exclui categorias de RH (folha, vale refeição etc.) — não são gastos com fornecedores
          const PAGE = 1000;
          let off = 0;
          while (true) {
            const { data, error } = await supabaseAdmin
              .from("financial_transactions")
              .select("amount, payment_date, fornecedor_id, entity_name, category_name, origin_type")
              .in("type", ["DESPESA", "EXPENSE"])
              .in("status", ["PAID", "PAGO"])
              .gte("payment_date", inicio)
              .lte("payment_date", fim)
              .order("payment_date", { ascending: true })
              .range(off, off + PAGE - 1);
            if (error) throw new Error(error.message);
            const rows = data || [];
            for (const r of rows) {
              const cat = String(r.category_name || "").toUpperCase();
              if (MISSION_CATEGORIES.includes(cat)) continue;
              if (HR_CATEGORIES.includes(cat)) continue;
              if (r.origin_type && MISSION_ORIGINS.includes(String(r.origin_type))) continue;
              if (!r.payment_date) continue;
              const mesIdx = Number(String(r.payment_date).slice(5, 7)) - 1;
              if (mesIdx < 0 || mesIdx > 11) continue;
              const key = r.fornecedor_id ? `f:${r.fornecedor_id}` : `n:${(r.entity_name || "SEM FORNECEDOR").toUpperCase().trim()}`;
              const nome = (r.entity_name || "SEM FORNECEDOR").toUpperCase().trim();
              addToBucket(key, nome, mesIdx, Number(r.amount || 0));
            }
            if (rows.length < PAGE) break;
            off += PAGE;
          }

          // Resolve nomes via tabela fornecedores (nome oficial sobrescreve entity_name)
          const fornIds = Array.from(buckets.keys()).filter(k => k.startsWith("f:")).map(k => Number(k.slice(2)));
          if (fornIds.length > 0) {
            const { data: forns } = await supabaseAdmin.from("fornecedores").select("id, nome").in("id", fornIds);
            const fmap = new Map((forns || []).map((f: any) => [f.id, f.nome]));
            for (const id of fornIds) {
              const b = buckets.get(`f:${id}`);
              if (!b) continue;
              const nm = fmap.get(id);
              if (nm) b.nome = String(nm).toUpperCase().trim();
            }
          }
        } else {
          // Cliente — invoices
          const PAGE = 1000;
          let off = 0;
          // Apenas pagamentos efetivamente confirmados/recebidos (Asaas: RECEIVED/CONFIRMED, Inter/manual: PAID).
          // Exclui PARTIAL para não inflar receita com cobranças não totalmente quitadas.
          const RECEIVED_STATUSES = ["RECEIVED", "CONFIRMED", "PAID"];
          while (true) {
            const { data, error } = await supabaseAdmin
              .from("invoices")
              .select("client_id, client_name, value, payment_date, status")
              .in("status", RECEIVED_STATUSES)
              .gte("payment_date", inicio)
              .lte("payment_date", fim)
              .order("payment_date", { ascending: true })
              .range(off, off + PAGE - 1);
            if (error) throw new Error(error.message);
            const rows = data || [];
            for (const r of rows) {
              if (!r.payment_date) continue;
              const mesIdx = Number(String(r.payment_date).slice(5, 7)) - 1;
              if (mesIdx < 0 || mesIdx > 11) continue;
              const key = r.client_id ? `c:${r.client_id}` : `n:${(r.client_name || "SEM CLIENTE").toUpperCase().trim()}`;
              const nome = (r.client_name || "SEM CLIENTE").toUpperCase().trim();
              addToBucket(key, nome, mesIdx, Number(r.value || 0));
            }
            if (rows.length < PAGE) break;
            off += PAGE;
          }
        }

        return { buckets, totalMeses };
      };

      // Fetch current year and, in parallel, previous year if YoY comparison is requested
      const [current, prevYear] = await Promise.all([
        fetchBuckets(ano),
        compareYoY ? fetchBuckets(ano - 1) : Promise.resolve(null),
      ]);

      const { buckets, totalMeses } = current;
      const prevBuckets = prevYear?.buckets ?? null;
      const prevTotalMeses = prevYear?.totalMeses ?? null;

      // Sinal da % depende do tipo (regra de negócio):
      //  - Fornecedor (Contas a Pagar): pagar MENOS que o mês anterior é boa notícia → % positiva.
      //    varPct = ((prev - v) / |prev|) * 100  → negativa quando pagamos mais.
      //  - Cliente (Contas a Receber): faturar MAIS é boa notícia → % positiva.
      //    varPct = ((v - prev) / |prev|) * 100  → negativa quando faturamos menos.
      // YoY segue a mesma regra mas comparando com o mesmo mês do ano anterior.
      type MesEntry = { mes: number; valor: number; varPct: number | null; varPctYoY: number | null };
      type Linha = { id: string; nome: string; meses: MesEntry[]; total: number };

      const calcVarPct = (meses: number[], prevYearMeses: number[] | null): MesEntry[] => {
        const out: MesEntry[] = [];
        let prev: number | null = null;
        for (let i = 0; i < 12; i++) {
          const v = meses[i];
          let varPct: number | null = null;
          if (prev !== null && prev !== 0) {
            const delta = tipo === "fornecedor" ? (prev - v) : (v - prev);
            varPct = (delta / Math.abs(prev)) * 100;
          }
          let varPctYoY: number | null = null;
          if (prevYearMeses !== null) {
            const py = prevYearMeses[i];
            if (py !== 0) {
              const delta = tipo === "fornecedor" ? (py - v) : (v - py);
              varPctYoY = (delta / Math.abs(py)) * 100;
            }
          }
          out.push({ mes: i + 1, valor: v, varPct, varPctYoY });
          if (v !== 0 || prev !== null) prev = v;
        }
        return out;
      };

      const linhas: Linha[] = Array.from(buckets.entries())
        .map(([id, b]) => ({
          id,
          nome: b.nome,
          meses: calcVarPct(b.meses, prevBuckets?.get(id)?.meses ?? null),
          total: b.meses.reduce((a, x) => a + x, 0),
        }))
        .filter(l => l.total > 0)
        .sort((a, b) => b.total - a.total);

      const totalGeral = calcVarPct(totalMeses, prevTotalMeses);
      const totalAno = totalMeses.reduce((a, x) => a + x, 0);

      res.json({ ano, tipo, linhas, totalGeral, totalAno });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
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
  // Inter retenta em 4xx/5xx; respondemos 200 só após processar com sucesso.
  // Idempotência: não duplica receita se mesmo codigoSolicitacao chegar 2x.
  app.post("/api/inter/webhook/cobranca", async (req, res) => {
    try {
      const events = Array.isArray(req.body) ? req.body : [req.body];
      for (const ev of events) {
        const parsed = parseInterWebhookEvent(ev);
        const { codigoSolicitacao, evento, valorPago, dataHoraSituacao } = parsed;

        const { data: insertedEvent } = await supabaseAdmin.from("inter_webhook_events").insert({
          evento,
          codigo_solicitacao: codigoSolicitacao,
          payload: ev,
          processed: false,
        }).select("id").single();

        // Pagamento confirmado → atualiza invoice + cria transação (com idempotência)
        if (codigoSolicitacao && isInterPaymentConfirmation(evento)) {
          const { data: inv } = await supabaseAdmin
            .from("invoices")
            .select("id, value, client_name, gateway, status")
            .eq("inter_codigo_solicitacao", codigoSolicitacao)
            .maybeSingle();

          if (inv) {
            // IDEMPOTÊNCIA #1: já existe transação financeira para este codigoSolicitacao?
            const { data: existingTx } = await supabaseAdmin
              .from("financial_transactions")
              .select("id")
              .eq("origin_type", "inter_webhook")
              .eq("origin_id", codigoSolicitacao)
              .limit(1);

            if (existingTx && existingTx.length > 0) {
              console.log(`[Inter Webhook] Evento ${evento} duplicado para ${codigoSolicitacao} — já existe transação. Ignorando.`);
              if (insertedEvent?.id) {
                await supabaseAdmin
                  .from("inter_webhook_events")
                  .update({ processed: true, error_msg: "DUPLICADO_IGNORADO" })
                  .eq("id", insertedEvent.id);
              }
              continue;
            }

            // IDEMPOTÊNCIA #2: invoice já está RECEIVED?
            if (inv.status === "RECEIVED" || inv.status === "PARTIAL") {
              console.log(`[Inter Webhook] Invoice ${inv.id} já está ${inv.status}. Criando transação mas mantendo status.`);
            }

            // VALIDAÇÃO DE VALOR PARCIAL
            const valorEsperado = Number(inv.value || 0);
            const { valorRecebido, isPartial, novoStatus, descPrefix } = classifyInterPayment({
              valorPago,
              valorEsperado,
            });

            // Atualiza invoice apenas se ainda não foi marcada (preserva status mais grave)
            if (inv.status !== "RECEIVED") {
              await supabaseAdmin
                .from("invoices")
                .update({ status: novoStatus, payment_date: String(dataHoraSituacao).slice(0, 10) })
                .eq("id", inv.id);
            }

            await supabaseAdmin.from("financial_transactions").insert({
              type: "INCOME",
              status: "PAID",
              description: `${descPrefix}${inv.client_name || "Cliente"} (${codigoSolicitacao})`,
              amount: valorRecebido,
              due_date: String(dataHoraSituacao).slice(0, 10),
              category_name: "Cobrança Inter",
              origin_type: "inter_webhook",
              origin_id: codigoSolicitacao,
              created_by: "INTER_WEBHOOK",
            });

            if (insertedEvent?.id) {
              await supabaseAdmin
                .from("inter_webhook_events")
                .update({ processed: true })
                .eq("id", insertedEvent.id);
            }

            if (isPartial) {
              console.warn(`[Inter Webhook] PAGAMENTO PARCIAL invoice ${inv.id}: esperado ${valorEsperado}, recebido ${valorPago}`);
            }
          } else {
            console.warn(`[Inter Webhook] Nenhuma invoice encontrada para codigoSolicitacao=${codigoSolicitacao}`);
          }
        }
      }
      res.status(200).json({ ok: true });
    } catch (e: any) {
      console.error("[Inter Webhook] erro processando:", e);
      // Retorna 500 para o Inter retentar (em vez de 200 mascarando falha)
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}
