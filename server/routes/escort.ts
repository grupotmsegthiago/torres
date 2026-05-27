import type { Express } from "express";
  import { storage } from "../storage";
  import { supabaseAdmin } from "../supabase";
  import { requireAuth, requireAdminRole, requireDiretoria, requireDiretoriaStrict, requireThiago, isThiago } from "../auth";
  import { logSystemAudit } from "../audit";
  import { employees, vehicles, missionPhotos } from "@shared/schema";

  import { getHorasElapsedFromDB, calcularFaturamentoLive, calcularEscolta, calcularInicioCobranca, calcularHorasTrabalhadas, extractKmFromText, splitMissionCostsForBilling } from "../billing-calc";
  import { logFinancialAudit, haversineDist, removeAutoTransaction, createAutoTransaction } from "./_helpers";

  export function registerEscortRoutes(app: Express) {
    // ==================== FINANCIAL MODULE ====================

  // Financial Categories
  app.get("/api/financial/categories", requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("financial_categories").select("*").order("name");
      if (error) throw error;
      // Dedup defensivo: a tabela tem 50+ registros duplicados (mesmo
      // type+parent_name+name, IDs diferentes) por causa de boots antigos
      // que executavam ensureCategoryHierarchy sem check de duplicidade.
      // Aqui retornamos só o ID canônico (primeiro por ordem alfabética de
      // ID, determinístico) — não polui o dropdown e mantém compat com
      // referências antigas que já apontam pros IDs duplicados (não deleta
      // do banco; só esconde do client).
      const seen = new Map<string, any>();
      for (const c of (data || []) as any[]) {
        const k = `${c.type}||${(c.parent_name || "").toLowerCase()}||${(c.name || "").toLowerCase()}`;
        const existing = seen.get(k);
        if (!existing || String(c.id) < String(existing.id)) seen.set(k, c);
      }
      res.json([...seen.values()]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/financial/categories", requireAdminRole, async (req, res) => {
    try {
      const { name, type, group, recurrence_type, tag, scope, is_deduction, parent_name } = req.body;
      if (!name || !type || !group) return res.status(400).json({ message: "name, type e group são obrigatórios" });
      // Check de duplicidade — antes não existia e foi a causa raiz dos 53
      // registros redundantes em financial_categories. Comparação case-
      // insensitive em name + parent_name + type.
      const { data: existing, error: checkErr } = await supabaseAdmin
        .from("financial_categories")
        .select("id,name,parent_name,type")
        .ilike("name", name)
        .eq("type", type);
      if (checkErr) throw checkErr;
      const parentNorm = (parent_name || "").toLowerCase();
      const dup = (existing || []).find((c: any) => (c.parent_name || "").toLowerCase() === parentNorm);
      if (dup) {
        return res.status(409).json({ message: `Categoria "${name}" já existe nesse grupo`, existingId: dup.id });
      }
      const { data, error } = await supabaseAdmin.from("financial_categories").insert({
        name, type, group,
        recurrence_type: recurrence_type || "VARIAVEL",
        tag: tag || "OPERACIONAL",
        scope: scope || "EMPRESA",
        is_deduction: is_deduction || false,
        parent_name: parent_name || null,
      }).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/financial/categories/:id", requireAdminRole, async (req, res) => {
    try {
      const { name, parent_name, type, group } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (parent_name !== undefined) updates.parent_name = parent_name;
      if (type !== undefined) updates.type = type;
      if (group !== undefined) updates.group = group;
      // Check de duplicidade no rename/alteração — se mudou name/parent_name/type,
      // verifica se a nova combinação já existe em outra categoria.
      if (name !== undefined || parent_name !== undefined || type !== undefined) {
        const { data: current } = await supabaseAdmin
          .from("financial_categories").select("name,parent_name,type")
          .eq("id", req.params.id).single();
        const finalName = name ?? current?.name;
        const finalParent = parent_name !== undefined ? parent_name : current?.parent_name;
        const finalType = type ?? current?.type;
        if (finalName && finalType) {
          const { data: collision } = await supabaseAdmin
            .from("financial_categories").select("id")
            .ilike("name", finalName).eq("type", finalType).neq("id", req.params.id);
          const parentNorm = (finalParent || "").toLowerCase();
          const dup = (collision || []).find((c: any) => {
            return true; // já filtrado por name+type acima; valida parent abaixo
          });
          if (collision && collision.length > 0) {
            // Refina checando parent_name também
            const { data: full } = await supabaseAdmin
              .from("financial_categories").select("id,parent_name")
              .in("id", collision.map((c: any) => c.id));
            const realDup = (full || []).find((c: any) => (c.parent_name || "").toLowerCase() === parentNorm);
            if (realDup) {
              return res.status(409).json({ message: `Já existe categoria "${finalName}" nesse grupo`, existingId: realDup.id });
            }
          }
        }
      }
      const { data, error } = await supabaseAdmin.from("financial_categories").update(updates).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/financial/categories/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("financial_categories").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Financial Accounts
  app.get("/api/financial/accounts", requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("financial_accounts").select("*").order("name");
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/financial/accounts", requireAdminRole, async (req, res) => {
    try {
      const { name, initial_balance, bank_name, account_number, status } = req.body;
      if (!name) return res.status(400).json({ message: "name é obrigatório" });
      const { data, error } = await supabaseAdmin.from("financial_accounts").insert({ name, initial_balance: initial_balance || 0, bank_name, account_number, status: status || "Ativo" }).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/financial/accounts/:id", requireAdminRole, async (req, res) => {
    try {
      const { name, initial_balance, bank_name, account_number, status } = req.body;
      const { data, error } = await supabaseAdmin.from("financial_accounts").update({ name, initial_balance, bank_name, account_number, status }).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/financial/accounts/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("financial_accounts").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Financial Transactions
  // Origens consideradas "lançamentos automáticos de missão" (não aparecem em Contas a Pagar/Receber manual)
  const MISSION_ORIGINS = ["mission_cost", "fueling", "service_order", "escort_billing", "maintenance"];

  app.get("/api/financial/transactions", requireAdminRole, async (req, res) => {
    try {
      const { type, status, from, to, search, exclude_mission, only_mission } = req.query;
      let query = supabaseAdmin.from("financial_transactions").select("*").order("due_date", { ascending: false });
      // Lançamentos AGUARDANDO_APROVACAO/RECUSADA são visíveis para TODOS os usuários
      // com acesso ao módulo financeiro (transparência). Apenas a ação de aprovar/recusar
      // continua restrita à diretoria (rotas /aprovar e /recusar usam requireThiago).
      if (type) query = query.eq("type", type as string);
      if (status) query = query.eq("status", status as string);
      if (from) query = query.gte("due_date", from as string);
      if (to) query = query.lte("due_date", to as string);
      if (search) query = query.or(`description.ilike.%${search}%,entity_name.ilike.%${search}%,category_name.ilike.%${search}%`);
      if (String(exclude_mission) === "true") {
        // Apenas manuais (sem origem automática de missão)
        query = query.or(`origin_type.is.null,origin_type.eq.manual`);
      }
      if (String(only_mission) === "true") {
        query = query.in("origin_type", MISSION_ORIGINS);
      }
      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Lista lançamentos AGUARDANDO_APROVACAO — visível para TODOS os usuários autenticados
  // do módulo financeiro. A ação de aprovar/recusar continua restrita ao Thiago/diretoria.
  app.get("/api/financial/aguardando-aprovacao", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("financial_transactions")
        .select("*")
        .eq("status", "AGUARDANDO_APROVACAO")
        .order("created_at", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Gera URL assinada (60s) para download do comprovante
  app.get("/api/financial/transactions/:id/comprovante-url", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { data: tx, error: txErr } = await supabaseAdmin
        .from("financial_transactions")
        .select("comprovante_path, comprovante_url")
        .eq("id", req.params.id)
        .single();
      if (txErr || !tx) return res.status(404).json({ message: "Lançamento não encontrado" });
      const path = tx.comprovante_path || tx.comprovante_url;
      if (!path) return res.status(404).json({ message: "Comprovante não anexado" });
      const { data, error } = await supabaseAdmin.storage.from("comprovantes-pagamento").createSignedUrl(path, 60);
      if (error || !data?.signedUrl) return res.status(500).json({ message: error?.message || "Falha ao gerar URL" });
      res.json({ url: data.signedUrl });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Lista de lançamentos PAID sem comprovante anexado
  app.get("/api/financial/comprovantes-pendentes", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const MISSION_CATEGORIES = ["CUSTOS DE MISSÃO", "COMBUSTÍVEL", "CUSTOS DE MISSAO", "COMBUSTIVEL"];
      const { data, error } = await supabaseAdmin
        .from("financial_transactions")
        .select("*")
        .eq("type", "EXPENSE")
        .eq("status", "PAID")
        .is("comprovante_url", null)
        .or("origin_type.is.null,origin_type.eq.manual")
        .order("payment_date", { ascending: false });
      if (error) throw error;
      const filtered = (data || []).filter((t: any) => {
        const cat = String(t.category_name || "").toUpperCase();
        return !MISSION_CATEGORIES.includes(cat);
      });
      res.json(filtered);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/financial/transactions", requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const { description, amount, type, status, due_date, payment_date, category_id, category_name, account_id, account_name, entity_type, entity_name, notes, installments, fornecedor_id, funcionario_id,
        payment_method, has_nf, nf_motivo_ausencia,
        boleto_base64, boleto_fileName, boleto_contentType,
        nf_base64, nf_fileName, nf_contentType } = req.body;
      if (!description || !amount || !type || !due_date) return res.status(400).json({ message: "description, amount, type e due_date são obrigatórios" });
      if (type === "EXPENSE" && !fornecedor_id && !funcionario_id) {
        return res.status(400).json({ message: "Selecione um Fornecedor ou Funcionário para Despesa." });
      }

      // ─── Checklist de documentos para despesa MANUAL ───
      // Boleto: obrigatório APENAS se método de pagamento = boleto
      // NF: se has_nf=true → exigir anexo; se has_nf=false → exigir motivo
      if (type === "EXPENSE") {
        if (!payment_method) {
          return res.status(400).json({ message: "Forma de pagamento é obrigatória." });
        }
        if (payment_method === "boleto" && !boleto_base64) {
          return res.status(400).json({ message: "Anexe o boleto para forma de pagamento BOLETO." });
        }
        if (typeof has_nf !== "boolean") {
          return res.status(400).json({ message: "Informe se possui Nota Fiscal (sim/não)." });
        }
        if (has_nf === true && !nf_base64) {
          return res.status(400).json({ message: "Anexe a Nota Fiscal." });
        }
        if (has_nf === false && !String(nf_motivo_ausencia || "").trim()) {
          return res.status(400).json({ message: "Informe o motivo da ausência da Nota Fiscal." });
        }
      }

      // helper de upload reutilizado para boleto/NF
      const uploadDoc = async (transactionId: string, kind: "boleto" | "nf", b64: string, fileName: string, contentType?: string): Promise<string> => {
        const cleanBase64 = String(b64).replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(cleanBase64, "base64");
        if (buffer.length > 5 * 1024 * 1024) throw new Error(`${kind.toUpperCase()} excede 5 MB`);
        const ext = String(fileName).split(".").pop()?.toLowerCase() || "bin";
        if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) throw new Error(`${kind.toUpperCase()}: apenas PDF, JPG ou PNG`);
        const safeName = `${kind}_${transactionId}_${Date.now()}.${ext}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
        const storagePath = `${transactionId}/${safeName}`;
        const { error: upErr } = await supabaseAdmin.storage
          .from("comprovantes-pagamento")
          .upload(storagePath, buffer, { contentType: contentType || "application/octet-stream", upsert: true });
        if (upErr) throw upErr;
        return storagePath;
      };

      // Regra: ADM (Simone) cria → AGUARDANDO_APROVACAO; Diretoria (Mickael) cria → mantém status enviado.
      // EXPENSE manual sempre passa pelo fluxo de aprovação quando criado por admin não-diretoria.
      const isDiretoria = user.role === "diretoria";
      const effectiveStatus = (() => {
        if (type === "EXPENSE" && !isDiretoria) return "AGUARDANDO_APROVACAO";
        return status || "PENDING";
      })();

      const baseExtras: any = {
        fornecedor_id: fornecedor_id || null,
        funcionario_id: funcionario_id || null,
        solicitado_por: user.name,
        payment_method: payment_method || null,
        has_nf: typeof has_nf === "boolean" ? has_nf : null,
        nf_motivo_ausencia: (has_nf === false && nf_motivo_ausencia) ? String(nf_motivo_ausencia).trim() : null,
      };

      // helper: anexa boleto/NF a uma transação já criada e atualiza paths
      const attachDocsTo = async (transactionId: string) => {
        const upd: any = {};
        if (boleto_base64) {
          const p = await uploadDoc(String(transactionId), "boleto", boleto_base64, boleto_fileName || "boleto.pdf", boleto_contentType);
          upd.boleto_url = p;
          upd.boleto_path = p;
          upd.boleto_anexado_em = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T");
        }
        if (nf_base64) {
          const p = await uploadDoc(String(transactionId), "nf", nf_base64, nf_fileName || "nf.pdf", nf_contentType);
          upd.nf_url = p;
          upd.nf_path = p;
          upd.nf_anexado_em = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T");
        }
        if (Object.keys(upd).length > 0) {
          await supabaseAdmin.from("financial_transactions").update(upd).eq("id", transactionId);
        }
      };

      if (installments && installments > 1) {
        const installmentGroup = crypto.randomUUID();
        const baseDate = new Date(due_date);
        const payloads = [];
        for (let i = 0; i < installments; i++) {
          const d = new Date(baseDate);
          d.setMonth(d.getMonth() + i);
          payloads.push({
            description: `${description} (${i + 1}/${installments})`,
            amount: Math.round((amount / installments) * 100) / 100,
            type, status: effectiveStatus,
            due_date: d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
            payment_date: effectiveStatus === "PAID" ? d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : null,
            category_id, category_name, account_id, account_name,
            entity_type, entity_name, notes,
            installment_group: installmentGroup,
            installment_number: i + 1,
            installment_total: installments,
            created_by: user.name,
            ...baseExtras,
          });
        }
        const { data, error } = await supabaseAdmin.from("financial_transactions").insert(payloads).select();
        if (error) throw error;
        // Boleto/NF anexa apenas na PRIMEIRA parcela (representa o doc original da série)
        if (data && data[0]) await attachDocsTo(String(data[0].id));
        for (const row of data || []) {
          await logFinancialAudit("financial_transactions", String(row.id), "INSERT", [
            { field: "description", old: null, new_val: row.description },
            { field: "amount", old: null, new_val: row.amount },
            { field: "type", old: null, new_val: row.type },
            { field: "status", old: null, new_val: row.status },
          ], user.name, user.id, "Criação manual (parcelado)");
        }
        res.json(data);
      } else {
        const { data, error } = await supabaseAdmin.from("financial_transactions").insert({
          description, amount, type, status: effectiveStatus,
          due_date, payment_date: effectiveStatus === "PAID" ? (payment_date || due_date) : null,
          category_id, category_name,
          account_id, account_name, entity_type, entity_name, notes,
          created_by: user.name,
          ...baseExtras,
        }).select().single();
        if (error) throw error;
        await attachDocsTo(String(data.id));
        await logFinancialAudit("financial_transactions", String(data.id), "INSERT", [
          { field: "description", old: null, new_val: data.description },
          { field: "amount", old: null, new_val: data.amount },
          { field: "type", old: null, new_val: data.type },
          { field: "status", old: null, new_val: data.status },
        ], user.name, user.id, "Criação manual");
        // re-fetch para devolver com os paths já preenchidos
        const { data: fresh } = await supabaseAdmin.from("financial_transactions").select("*").eq("id", data.id).single();
        res.json(fresh || data);
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Aprovar lançamento (apenas diretoria — Mickael)
  app.patch("/api/financial/transactions/:id/aprovar", requireAuth, requireThiago, async (req, res) => {
    try {
      const user = req.user!;
      const { data: existing, error: chkErr } = await supabaseAdmin.from("financial_transactions").select("*").eq("id", req.params.id).single();
      if (chkErr || !existing) return res.status(404).json({ message: "Lançamento não encontrado" });
      if (existing.status !== "AGUARDANDO_APROVACAO") {
        return res.status(400).json({ message: `Status atual (${existing.status}) não permite aprovação` });
      }
      const nowBrt = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T");
      const { data, error } = await supabaseAdmin
        .from("financial_transactions")
        .update({
          status: "PENDING",
          aprovado_por: user.name,
          aprovado_em: nowBrt,
          recusado_motivo: null,
          recusado_em: null,
        })
        .eq("id", req.params.id)
        .select()
        .single();
      if (error) throw error;

      await logFinancialAudit("financial_transactions", req.params.id, "UPDATE",
        [{ field: "status", old: "AGUARDANDO_APROVACAO", new_val: "PENDING" }],
        user.name, user.id, "Aprovação diretoria");

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Aprovar série inteira de parcelas (apenas diretoria — Mickael).
  // Aprova TODAS as transações do mesmo installment_group que ainda estão em AGUARDANDO_APROVACAO.
  app.patch("/api/financial/transactions/:id/aprovar-serie", requireAuth, requireThiago, async (req, res) => {
    try {
      const user = req.user!;
      const { data: existing, error: chkErr } = await supabaseAdmin.from("financial_transactions").select("*").eq("id", req.params.id).single();
      if (chkErr || !existing) return res.status(404).json({ message: "Lançamento não encontrado" });
      if (!existing.installment_group) {
        return res.status(400).json({ message: "Lançamento não pertence a uma série parcelada" });
      }

      const { data: pendingSeries, error: listErr } = await supabaseAdmin
        .from("financial_transactions")
        .select("id, installment_number")
        .eq("installment_group", existing.installment_group)
        .eq("status", "AGUARDANDO_APROVACAO");
      if (listErr) throw listErr;
      const ids = (pendingSeries || []).map((r: any) => r.id);
      if (ids.length === 0) return res.status(400).json({ message: "Nenhuma parcela aguardando aprovação nessa série" });

      const nowBrt = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T");
      const { data, error } = await supabaseAdmin
        .from("financial_transactions")
        .update({
          status: "PENDING",
          aprovado_por: user.name,
          aprovado_em: nowBrt,
          recusado_motivo: null,
          recusado_em: null,
        })
        .in("id", ids)
        .select();
      if (error) throw error;

      for (const id of ids) {
        await logFinancialAudit("financial_transactions", id, "UPDATE",
          [{ field: "status", old: "AGUARDANDO_APROVACAO", new_val: "PENDING" }],
          user.name, user.id, `Aprovação diretoria (série ${existing.installment_group} — ${ids.length} parcelas em lote)`);
      }

      res.json({ count: ids.length, transactions: data });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Recusar lançamento (apenas diretoria — Mickael) com motivo obrigatório
  app.patch("/api/financial/transactions/:id/recusar", requireAuth, requireThiago, async (req, res) => {
    try {
      const user = req.user!;
      const motivo = String(req.body?.motivo || "").trim();
      if (!motivo) return res.status(400).json({ message: "Motivo da recusa é obrigatório" });
      const { data: existing, error: chkErr } = await supabaseAdmin.from("financial_transactions").select("*").eq("id", req.params.id).single();
      if (chkErr || !existing) return res.status(404).json({ message: "Lançamento não encontrado" });
      if (existing.status !== "AGUARDANDO_APROVACAO") {
        return res.status(400).json({ message: `Status atual (${existing.status}) não permite recusa` });
      }
      const nowBrt = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T");
      const { data, error } = await supabaseAdmin
        .from("financial_transactions")
        .update({
          status: "RECUSADA",
          recusado_motivo: motivo,
          recusado_em: nowBrt,
        })
        .eq("id", req.params.id)
        .select()
        .single();
      if (error) throw error;

      await logFinancialAudit("financial_transactions", req.params.id, "UPDATE",
        [
          { field: "status", old: "AGUARDANDO_APROVACAO", new_val: "RECUSADA" },
          { field: "recusado_motivo", old: null, new_val: motivo },
        ],
        user.name, user.id, "Recusa diretoria");

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Anexar comprovante (upload base64 → Supabase Storage bucket "comprovantes")
  app.post("/api/financial/transactions/:id/comprovante", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const { fileBase64, fileName, contentType } = req.body || {};
      if (!fileBase64 || !fileName) return res.status(400).json({ message: "fileBase64 e fileName são obrigatórios" });

      const { data: existing, error: chkErr } = await supabaseAdmin.from("financial_transactions").select("*").eq("id", req.params.id).single();
      if (chkErr || !existing) return res.status(404).json({ message: "Lançamento não encontrado" });

      const cleanBase64 = String(fileBase64).replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      if (buffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({ message: "Arquivo excede 5 MB" });
      }
      const ext = String(fileName).split(".").pop()?.toLowerCase() || "bin";
      if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) {
        return res.status(400).json({ message: "Apenas PDF, JPG ou PNG" });
      }
      const safeName = `${req.params.id}_${Date.now()}.${ext}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
      const storagePath = `${existing.id}/${safeName}`;

      const { error: upErr } = await supabaseAdmin.storage
        .from("comprovantes-pagamento")
        .upload(storagePath, buffer, {
          contentType: contentType || "application/octet-stream",
          upsert: true,
        });
      if (upErr) throw upErr;

      const nowBrt = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T");

      const { data, error } = await supabaseAdmin
        .from("financial_transactions")
        .update({
          comprovante_url: storagePath,
          comprovante_path: storagePath,
          comprovante_anexado_em: nowBrt,
        })
        .eq("id", req.params.id)
        .select()
        .single();
      if (error) throw error;

      await logFinancialAudit("financial_transactions", req.params.id, "UPDATE",
        [{ field: "comprovante_path", old: existing.comprovante_path, new_val: storagePath }],
        user.name, user.id, "Comprovante anexado");

      res.json(data);
    } catch (err: any) {
      console.error("[comprovante-upload]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Anexar BOLETO (após criação) ───
  app.post("/api/financial/transactions/:id/boleto", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const { fileBase64, fileName, contentType } = req.body || {};
      if (!fileBase64 || !fileName) return res.status(400).json({ message: "fileBase64 e fileName são obrigatórios" });
      const { data: existing, error: chkErr } = await supabaseAdmin.from("financial_transactions").select("*").eq("id", req.params.id).single();
      if (chkErr || !existing) return res.status(404).json({ message: "Lançamento não encontrado" });

      const cleanBase64 = String(fileBase64).replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ message: "Arquivo excede 5 MB" });
      const ext = String(fileName).split(".").pop()?.toLowerCase() || "bin";
      if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) return res.status(400).json({ message: "Apenas PDF, JPG ou PNG" });
      const safeName = `boleto_${req.params.id}_${Date.now()}.${ext}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
      const storagePath = `${existing.id}/${safeName}`;

      const { error: upErr } = await supabaseAdmin.storage.from("comprovantes-pagamento")
        .upload(storagePath, buffer, { contentType: contentType || "application/octet-stream", upsert: true });
      if (upErr) throw upErr;

      const nowBrt = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T");
      const { data, error } = await supabaseAdmin.from("financial_transactions")
        .update({ boleto_url: storagePath, boleto_path: storagePath, boleto_anexado_em: nowBrt })
        .eq("id", req.params.id).select().single();
      if (error) throw error;

      await logFinancialAudit("financial_transactions", req.params.id, "UPDATE",
        [{ field: "boleto_path", old: existing.boleto_path, new_val: storagePath }],
        user.name, user.id, "Boleto anexado");

      res.json(data);
    } catch (err: any) {
      console.error("[boleto-upload]", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/financial/transactions/:id/boleto-url", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { data: tx, error } = await supabaseAdmin.from("financial_transactions").select("boleto_path,boleto_url").eq("id", req.params.id).single();
      if (error || !tx) return res.status(404).json({ message: "Lançamento não encontrado" });
      const path = tx.boleto_path || tx.boleto_url;
      if (!path) return res.status(404).json({ message: "Boleto não anexado" });
      const { data, error: signErr } = await supabaseAdmin.storage.from("comprovantes-pagamento").createSignedUrl(path, 60);
      if (signErr) throw signErr;
      res.json({ url: data?.signedUrl });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Anexar NOTA FISCAL (após criação) ───
  app.post("/api/financial/transactions/:id/nf", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const { fileBase64, fileName, contentType } = req.body || {};
      if (!fileBase64 || !fileName) return res.status(400).json({ message: "fileBase64 e fileName são obrigatórios" });
      const { data: existing, error: chkErr } = await supabaseAdmin.from("financial_transactions").select("*").eq("id", req.params.id).single();
      if (chkErr || !existing) return res.status(404).json({ message: "Lançamento não encontrado" });

      const cleanBase64 = String(fileBase64).replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ message: "Arquivo excede 5 MB" });
      const ext = String(fileName).split(".").pop()?.toLowerCase() || "bin";
      if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) return res.status(400).json({ message: "Apenas PDF, JPG ou PNG" });
      const safeName = `nf_${req.params.id}_${Date.now()}.${ext}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
      const storagePath = `${existing.id}/${safeName}`;

      const { error: upErr } = await supabaseAdmin.storage.from("comprovantes-pagamento")
        .upload(storagePath, buffer, { contentType: contentType || "application/octet-stream", upsert: true });
      if (upErr) throw upErr;

      const nowBrt = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T");
      const { data, error } = await supabaseAdmin.from("financial_transactions")
        .update({ nf_url: storagePath, nf_path: storagePath, nf_anexado_em: nowBrt, has_nf: true, nf_motivo_ausencia: null })
        .eq("id", req.params.id).select().single();
      if (error) throw error;

      await logFinancialAudit("financial_transactions", req.params.id, "UPDATE",
        [{ field: "nf_path", old: existing.nf_path, new_val: storagePath }],
        user.name, user.id, "NF anexada");

      res.json(data);
    } catch (err: any) {
      console.error("[nf-upload]", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/financial/transactions/:id/nf-url", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { data: tx, error } = await supabaseAdmin.from("financial_transactions").select("nf_path,nf_url").eq("id", req.params.id).single();
      if (error || !tx) return res.status(404).json({ message: "Lançamento não encontrado" });
      const path = tx.nf_path || tx.nf_url;
      if (!path) return res.status(404).json({ message: "NF não anexada" });
      const { data, error: signErr } = await supabaseAdmin.storage.from("comprovantes-pagamento").createSignedUrl(path, 60);
      if (signErr) throw signErr;
      res.json({ url: data?.signedUrl });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/financial/transactions/:id", requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const { data: existing, error: chkErr } = await supabaseAdmin.from("financial_transactions").select("*").eq("id", req.params.id).single();
      if (chkErr || !existing) return res.status(404).json({ message: "Lançamento não encontrado" });
      if (existing.origin_type && existing.origin_type !== "manual") {
        return res.status(403).json({ message: "Lançamentos automáticos não podem ser editados manualmente" });
      }
      // Invariante do fluxo de aprovação:
      // - AGUARDANDO_APROVACAO/RECUSADA só mudam status pelas rotas /aprovar e /recusar (diretoria)
      // O comprovante NÃO é exigido para marcar como PAGO aqui — fica sinalizado
      // pelo badge "COMPROVANTE PENDENTE", sino do header e e-mail diário.
      const newStatus = req.body?.status;
      if ((existing.status === "AGUARDANDO_APROVACAO" || existing.status === "RECUSADA")
          && newStatus && newStatus !== existing.status) {
        return res.status(403).json({ message: "Status só pode ser alterado pelo fluxo de aprovação da Diretoria." });
      }
      const { description, amount, type, status, due_date, payment_date, category_id, category_name, account_id, account_name, entity_type, entity_name, notes, status_conciliacao, update_scope, fornecedor_id, funcionario_id, payment_method, has_nf, nf_motivo_ausencia } = req.body;

      const auditChanges: { field: string; old: any; new_val: any }[] = [];
      const auditFields = ["description", "amount", "type", "status", "due_date", "category_name", "account_name", "entity_name"];
      for (const f of auditFields) {
        const oldVal = existing[f]; const newVal = req.body[f];
        if (newVal !== undefined && String(oldVal) !== String(newVal)) {
          auditChanges.push({ field: f, old: oldVal, new_val: newVal });
        }
      }
      if (auditChanges.length > 0) {
        await logFinancialAudit("financial_transactions", req.params.id, "UPDATE", auditChanges, user.name, user.id);
      }

      const updatePayload: any = {
        description, amount, type, status, due_date, payment_date,
        category_id, category_name, account_id, account_name,
        entity_type, entity_name, notes, status_conciliacao,
        updated_by: user.name,
      };
      if (fornecedor_id !== undefined) updatePayload.fornecedor_id = fornecedor_id || null;
      if (funcionario_id !== undefined) updatePayload.funcionario_id = funcionario_id || null;
      if (payment_method !== undefined) updatePayload.payment_method = payment_method || null;
      if (has_nf !== undefined) updatePayload.has_nf = typeof has_nf === "boolean" ? has_nf : null;
      if (nf_motivo_ausencia !== undefined) updatePayload.nf_motivo_ausencia = nf_motivo_ausencia ? String(nf_motivo_ausencia).trim() : null;

      if (update_scope === "future" && existing.installment_group && existing.installment_number) {
        const { data: siblings, error: sibErr } = await supabaseAdmin
          .from("financial_transactions")
          .select("id, installment_number, due_date")
          .eq("installment_group", existing.installment_group)
          .gte("installment_number", existing.installment_number)
          .order("installment_number", { ascending: true });

        if (sibErr) throw sibErr;

        const baseDueDate = new Date(due_date);
        const originalDueDate = new Date(existing.due_date);
        const monthDiff = (baseDueDate.getFullYear() - originalDueDate.getFullYear()) * 12 + (baseDueDate.getMonth() - originalDueDate.getMonth());

        const updates = (siblings || []).map((sib: any) => {
          const offset = sib.installment_number - existing.installment_number;
          const newDue = new Date(baseDueDate);
          newDue.setMonth(newDue.getMonth() + offset);
          const sibDueStr = newDue.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

          const baseDesc = description.replace(/\s*\(\d+\/\d+\)\s*$/, "");
          const isCurrent = sib.installment_number === existing.installment_number;
          const sibPayload: any = {
            description: `${baseDesc} (${sib.installment_number}/${existing.installment_total})`,
            amount, type,
            category_id, category_name,
            account_id, account_name,
            entity_name, notes,
            due_date: sibDueStr,
            payment_date: (isCurrent && status === "PAID") ? sibDueStr : null,
            status: isCurrent ? status : "PENDING",
            updated_by: user.name,
          };
          // Propaga fornecedor/funcionário/forma de pagamento para a série toda
          if (fornecedor_id !== undefined) sibPayload.fornecedor_id = fornecedor_id || null;
          if (funcionario_id !== undefined) sibPayload.funcionario_id = funcionario_id || null;
          if (payment_method !== undefined) sibPayload.payment_method = payment_method || null;
          // has_nf e motivo são específicos da parcela atual (cada mês tem sua NF)
          if (isCurrent) {
            if (has_nf !== undefined) sibPayload.has_nf = typeof has_nf === "boolean" ? has_nf : null;
            if (nf_motivo_ausencia !== undefined) sibPayload.nf_motivo_ausencia = nf_motivo_ausencia ? String(nf_motivo_ausencia).trim() : null;
          }
          return supabaseAdmin.from("financial_transactions").update(sibPayload).eq("id", sib.id);
        });

        await Promise.all(updates);

        const { data: updated, error: refetchErr } = await supabaseAdmin
          .from("financial_transactions").select("*").eq("id", req.params.id).single();
        if (refetchErr) throw refetchErr;
        res.json({ ...updated, updated_count: siblings?.length || 1 });
      } else {
        const { data, error } = await supabaseAdmin.from("financial_transactions").update(updatePayload).eq("id", req.params.id).select().single();
        if (error) throw error;
        res.json(data);
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/financial/transactions/:id/toggle-status", requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const { data: existing, error: fetchErr } = await supabaseAdmin.from("financial_transactions").select("*").eq("id", req.params.id).single();
      if (fetchErr || !existing) return res.status(404).json({ message: "Lançamento não encontrado" });
      // Lançamentos AGUARDANDO_APROVACAO ou RECUSADA não podem ser marcados como pagos sem aprovação
      if (existing.status === "AGUARDANDO_APROVACAO" || existing.status === "RECUSADA") {
        return res.status(400).json({ message: "Lançamento ainda não foi aprovado pela diretoria" });
      }
      const newStatus = existing.status === "PAID" ? "PENDING" : "PAID";
      // O comprovante NÃO é mais obrigatório aqui — pode ser anexado depois
      // via botão "Anexar". O badge "COMPROVANTE PENDENTE" sinaliza a falta.
      await logFinancialAudit("financial_transactions", req.params.id, "UPDATE", [{ field: "status", old: existing.status, new_val: newStatus }], user.name, user.id);
      const { data, error } = await supabaseAdmin.from("financial_transactions").update({
        status: newStatus,
        payment_date: newStatus === "PAID" ? existing.due_date : null,
        updated_by: user.name,
      }).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/financial/transactions/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const user = req.user!;
      const { data: existing, error: chkErr } = await supabaseAdmin.from("financial_transactions").select("*").eq("id", req.params.id).single();
      if (chkErr || !existing) return res.status(404).json({ message: "Lançamento não encontrado" });
      if (existing.origin_type && existing.origin_type !== "manual") {
        return res.status(403).json({ message: "Lançamentos automáticos não podem ser excluídos manualmente. Exclua o registro de origem." });
      }
      await logFinancialAudit("financial_transactions", req.params.id, "DELETE", [
        { field: "description", old: existing.description, new_val: null },
        { field: "amount", old: existing.amount, new_val: null },
        { field: "type", old: existing.type, new_val: null },
      ], user.name, user.id, "Exclusão manual");
      const { error } = await supabaseAdmin.from("financial_transactions").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/financial/audit-logs", requireAdminRole, async (req, res) => {
    try {
      const { target_table, target_id, limit: lim } = req.query as any;
      let query = supabaseAdmin.from("financial_audit_logs").select("*").order("created_at", { ascending: false }).limit(Number(lim) || 100);
      if (target_table) query = query.eq("target_table", target_table);
      if (target_id) query = query.eq("target_id", target_id);
      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/fleet-summary", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const dateParam = (req.query.date as string) || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const { data, error } = await supabaseAdmin.rpc("get_daily_fleet_summary", { p_date: dateParam });
      if (error) throw error;
      const { data: totals, error: totErr } = await supabaseAdmin.rpc("get_fleet_totals", { p_date: dateParam });
      if (totErr) throw totErr;
      res.json({ orders: data || [], totals: totals?.[0] || null });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/financial/summary", requireAdminRole, async (req, res) => {
    try {
      const { data: all, error } = await supabaseAdmin.from("financial_transactions").select("*");
      if (error) throw error;
      const txs = all || [];
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const expenses = txs.filter((t: any) => t.type === "EXPENSE");
      const incomes = txs.filter((t: any) => t.type === "INCOME");
      res.json({
        totalExpenses: expenses.reduce((a: number, t: any) => a + Number(t.amount), 0),
        paidExpenses: expenses.filter((t: any) => t.status === "PAID").reduce((a: number, t: any) => a + Number(t.amount), 0),
        pendingExpenses: expenses.filter((t: any) => t.status === "PENDING").reduce((a: number, t: any) => a + Number(t.amount), 0),
        overdueExpenses: expenses.filter((t: any) => t.status === "PENDING" && t.due_date < today).length,
        totalIncomes: incomes.reduce((a: number, t: any) => a + Number(t.amount), 0),
        paidIncomes: incomes.filter((t: any) => t.status === "PAID").reduce((a: number, t: any) => a + Number(t.amount), 0),
        pendingIncomes: incomes.filter((t: any) => t.status === "PENDING").reduce((a: number, t: any) => a + Number(t.amount), 0),
        overdueIncomes: incomes.filter((t: any) => t.status === "PENDING" && t.due_date < today).length,
        totalTransactions: txs.length,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/financial/dre-operacao/:osId", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      if (!osId) return res.status(400).json({ message: "ID inválido" });
      const so = await storage.getServiceOrder(osId);
      if (!so) return res.status(404).json({ message: "OS não encontrada" });

      const client = so.clientId ? await storage.getClient(so.clientId) : null;
      const vehicle = so.vehicleId ? await storage.getVehicle(so.vehicleId) : null;
      const employee1 = so.assignedEmployeeId ? await storage.getEmployee(so.assignedEmployeeId) : null;
      const employee2 = (so as any).assignedEmployee2Id ? await storage.getEmployee((so as any).assignedEmployee2Id) : null;

      let { data: billing } = await supabaseAdmin.from("escort_billings")
        .select("*")
        .eq("service_order_id", osId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!billing?.length) {
        const { data: b2 } = await supabaseAdmin.from("escort_billings")
          .select("*")
          .eq("service_order_id", String(osId))
          .order("created_at", { ascending: false })
          .limit(1);
        if (b2?.length) billing = b2;
      }
      let billingRow = billing?.[0] || null;

      if (!billingRow && so.type === "escolta" && so.status !== "recusada" && (so.status === "em_andamento" || so.status === "concluida" || so.status === "concluída")) {
        try {
          let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
          if (so.escortContractId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", so.escortContractId).limit(1);
            if (cc?.length) contrato = cc[0];
          } else if (so.clientId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.clientId).eq("status", "Ativo").limit(1);
            if (cc?.length) contrato = cc[0];
          }
          const missionPhotos = await storage.getMissionPhotosByOS(osId);
          const kmSaidaP = missionPhotos.find((p: any) => p.step === "km_saida");
          const kmChegadaP = [...missionPhotos].reverse().find((p: any) => p.step === "km_chegada");
          const kmFinalP = missionPhotos.find((p: any) => p.step === "km_final");
          const kmInicial = Number(kmChegadaP?.kmValue || 0);
          const kmFinal = Number(kmFinalP?.kmValue || 0);
          const nb = (v: any) => Number(v) || 0;

          const missionNotStartedYetEsc = !so.missionStatus || so.missionStatus === "aguardando";
          const horasMissao = missionNotStartedYetEsc ? 0 : await getHorasElapsedFromDB(osId);

          const kmTextoEsc = extractKmFromText(so.destination) || extractKmFromText(so.route);
          let kmRotaEsc: number | undefined;
          if (kmTextoEsc) {
            kmRotaEsc = kmTextoEsc;
          } else if (so.originLat && so.originLng && so.destinationLat && so.destinationLng) {
            const hvKm = haversineDist(Number(so.originLat), Number(so.originLng), Number(so.destinationLat), Number(so.destinationLng)) / 1000;
            kmRotaEsc = Math.round(hvKm * 1.4);
            if (so.pedagioIdaVolta) kmRotaEsc *= 2;
          }

          const billing = calcularFaturamentoLive({
            horasMissao,
            kmInicial,
            kmFinal,
            contrato,
            kmRota: kmRotaEsc,
          });

          const r = (v: number) => Math.round(v * 100) / 100;
          billingRow = {
            id: "calc-realtime",
            service_order_id: osId,
            client_id: so.clientId,
            client_name: client?.name || "—",
            contract_id: contrato.id || null,
            km_inicial: kmInicial, km_final: kmFinal,
            km_carregado: billing.km_total, km_excedente: billing.km_excedente,
            horas_trabalhadas: r(horasMissao), horas_missao: r(horasMissao),
            fat_acionamento: billing.fat_acionamento, fat_km: billing.fat_km,
            fat_hora_extra: billing.fat_hora_extra, fat_total: billing.fat_total,
            pag_vrp: r(nb(contrato.vrp_base)), pag_periculosidade: 0,
            pag_adicional_noturno: 0, pag_reembolsos: 0,
            pag_total: r(nb(contrato.vrp_base)),
            despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0,
            placa_viatura: vehicle?.plate || null,
            vigilante1_id: so.assignedEmployeeId,
            vigilante2_id: (so as any).assignedEmployee2Id,
          } as any;
          console.log(`[DRE-OS ${osId}] billing via centralized calc: fat_total=${billing.fat_total}`);
        } catch (calcErr: any) {
          console.error(`[DRE-OS ${osId}] realtime billing calc error:`, calcErr.message);
        }
      }

      const { data: txDirect } = await supabaseAdmin.from("financial_transactions")
        .select("*")
        .eq("origin_id", String(osId))
        .eq("origin_type", "service_order");

      const osMissionCosts = await storage.getMissionCostsByOS(osId);

      const osStartDate = so.scheduledDate || so.createdAt;
      const osEndDate = (so.status === "concluida" || so.status === "concluída") ? ((so as any).completedDate || osStartDate) : new Date().toISOString();
      const dateFrom = osStartDate ? new Date(osStartDate).toISOString().split("T")[0] : null;
      const dateTo = osEndDate ? new Date(osEndDate).toISOString().split("T")[0] : dateFrom;

      let fuelingTx: any[] = [];
      let fuelProrateDivisor = 1;
      if (so.vehicleId && dateFrom) {
        const vPlate = vehicle?.plate?.toUpperCase() || "";
        if (vPlate) {
          const { data: fuelByOrigin } = await supabaseAdmin.from("financial_transactions")
            .select("*")
            .eq("origin_type", "fueling")
            .gte("due_date", dateFrom)
            .lte("due_date", dateTo || dateFrom);
          const filteredByOrigin = (fuelByOrigin || []).filter((r: any) => (r.description || "").toUpperCase().includes(vPlate));

          if (filteredByOrigin.length > 0) {
            fuelingTx = filteredByOrigin;
          } else {
            const { data: fuelByDesc } = await supabaseAdmin.from("financial_transactions")
              .select("*")
              .eq("type", "EXPENSE")
              .gte("due_date", dateFrom)
              .lte("due_date", dateTo || dateFrom);
            fuelingTx = (fuelByDesc || []).filter((r: any) => {
              const desc = (r.description || "").toUpperCase();
              return desc.includes("ABASTECIMENTO") && desc.includes(vPlate);
            });
          }

          const allOrders = await storage.getServiceOrders();
          const sameDayVehicleOrders = allOrders.filter((ox: any) => {
            if (ox.vehicleId !== so.vehicleId) return false;
            if (ox.status === "cancelada" || ox.status === "recusada") return false;
            const oxDate = ox.scheduledDate ? new Date(ox.scheduledDate).toISOString().split("T")[0] : null;
            return oxDate === dateFrom;
          });
          if (sameDayVehicleOrders.length > 1) {
            fuelProrateDivisor = sameDayVehicleOrders.length;
          }
        }
      }

      let missionCostPedagio = 0;
      let missionCostCombustivel = 0;
      let missionCostOutros = 0;
      let missionCostReceitas = 0;
      const missionCostExpenses: any[] = [];
      const missionCostRevenueItems: any[] = [];
      const _splitDre = splitMissionCostsForBilling(osMissionCosts);
      missionCostPedagio = _splitDre.despesas_pedagio;
      missionCostCombustivel = _splitDre.despesas_combustivel;
      missionCostOutros = 0; // mantém zerado aqui — distribuído abaixo por categoria
      missionCostReceitas = _splitDre.receitas_os;
      for (const rev of _splitDre.revenueItems) {
        missionCostRevenueItems.push({
          id: `mc-${rev.id}`,
          description: rev.description,
          amount: rev.amount,
          type: "INCOME",
          category_name: rev.category,
          origin_type: "mission_cost_revenue",
        });
      }
      for (const mc of osMissionCosts) {
        const amt = Number((mc as any).amount || 0);
        const cat = ((mc as any).category || "").toLowerCase();
        const isRevenue = ((mc as any).costType || (mc as any).cost_type) === "revenue";
        if (isRevenue) continue; // já agregado via splitMissionCostsForBilling
        if (cat.includes("pedágio") || cat.includes("pedagio")) {
          // já contado em missionCostPedagio
        } else if (cat.includes("combustível") || cat.includes("combustivel") || cat.includes("abastecimento")) {
          missionCostCombustivel += amt;
        } else {
          missionCostOutros += amt;
        }
        missionCostExpenses.push({
          id: `mc-${mc.id}`,
          description: (mc as any).description || (mc as any).category || "Custo de missão",
          amount: amt,
          type: "EXPENSE",
          category_name: (mc as any).category,
          origin_type: "mission_cost",
        });
      }

      const diarias: { agentName: string; valor: number }[] = [];
      let totalPagFromBilling = 0;
      if (billingRow) {
        const pagTotal = Number(billingRow.pag_total || 0);
        const vrp = Number(billingRow.pag_vrp || 0);
        const pericul = Number(billingRow.pag_periculosidade || 0);
        const adicNoturno = Number(billingRow.pag_adicional_noturno || 0);
        const reembolsos = Number(billingRow.pag_reembolsos || 0);
        totalPagFromBilling = pagTotal > 0 ? pagTotal : (vrp + pericul + adicNoturno + reembolsos);
      }

      if (totalPagFromBilling === 0 && so.type === "escolta" && so.status === "em_andamento") {
        try {
          const photos = await storage.getMissionPhotosByOS(osId);
          const kmSaidaPhoto = photos.find((p: any) => p.step === "km_saida");
          const kmChegadaPhoto = photos.find((p: any) => p.step === "km_chegada");
          const kmFinalPhoto = photos.find((p: any) => p.step === "km_final");
          const kmInicial = kmChegadaPhoto?.kmValue || 0;
          const kmAtual = kmFinalPhoto?.kmValue || kmInicial;
          const startTime = so.missionStartedAt ? new Date(so.missionStartedAt as string).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : undefined;
          const nowTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
          const scheduledTime = so.scheduledDate ? new Date(so.scheduledDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : undefined;

          let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
          if (so.escortContractId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", so.escortContractId).limit(1);
            if (cc?.length) contrato = cc[0];
          } else if (so.clientId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.clientId).eq("status", "Ativo").limit(1);
            if (cc?.length) contrato = cc[0];
          }

          const kmFinalNorm = kmAtual > kmInicial ? kmAtual : kmInicial;
          const kmRotaDre = extractKmFromText(so.destination) || extractKmFromText(so.route) || undefined;
          const resultadoCalc = calcularEscolta({
            km_inicial: kmInicial, km_final: kmFinalNorm, km_vazio: 0,
            horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
            horario_inicio: startTime, horario_fim: nowTime, horario_agendado: scheduledTime,
            inicio_ts: so.missionStartedAt ? new Date(so.missionStartedAt as any).toISOString() : null,
            fim_ts: new Date().toISOString(),
            scheduled_date: so.scheduledDate ? new Date(so.scheduledDate as any).toISOString() : null,
            despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0, contrato,
            kmRota: kmRotaDre,
          });
          totalPagFromBilling = resultadoCalc.pagamento.total;
        } catch (_calcErr) {
          console.error("[DRE-OS] calcularEscolta fallback error:", (_calcErr as any)?.message);
        }
      }

      if (totalPagFromBilling > 0) {
        const agentCount = [employee1, employee2].filter(Boolean).length || 1;
        const names = [employee1?.name, employee2?.name].filter(Boolean);
        for (let i = 0; i < agentCount; i++) {
          diarias.push({ agentName: names[i] || `Agente ${i + 1}`, valor: totalPagFromBilling / agentCount });
        }
      }
      const totalDiarias = diarias.reduce((s, d) => s + d.valor, 0);

      const directExpenses = (txDirect || []).filter((t: any) => t.type === "EXPENSE");

      const hasMissionCostFuel = osMissionCosts.some((mc: any) => {
        const cat = ((mc as any).category || "").toLowerCase();
        return (mc as any).costType !== "revenue" && (cat.includes("combustível") || cat.includes("combustivel") || cat.includes("abastecimento"));
      });

      const effectiveFuelingTx = hasMissionCostFuel ? [] : fuelingTx;
      const proratedFuelingTx = effectiveFuelingTx.map((t: any) => ({
        ...t,
        amount: Math.round((Number(t.amount || 0) / fuelProrateDivisor) * 100) / 100,
        originalAmount: Number(t.amount || 0),
        prorated: fuelProrateDivisor > 1,
      }));
      const allExpenses = [
        ...directExpenses,
        ...missionCostExpenses,
        ...proratedFuelingTx,
      ];
      const uniqueExpenses = Array.from(new Map(allExpenses.map((t: any) => [t.id, t])).values());

      const totalFueling = proratedFuelingTx.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      const totalOtherExpenses = directExpenses.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);

      const billingPedagio = Number(billingRow?.despesas_pedagio || 0);
      const billingCombustivel = Number(billingRow?.despesas_combustivel || 0);
      const billingOutras = Number(billingRow?.despesas_outras || 0);

      const effectivePedagio = Math.max(missionCostPedagio, billingPedagio);
      const effectiveCombustivel = missionCostCombustivel > 0 ? missionCostCombustivel : (totalFueling > 0 ? totalFueling : billingCombustivel);
      const effectiveOutras = missionCostOutros > 0 ? missionCostOutros : billingOutras;
      const billingDespesasTotal = effectivePedagio + effectiveCombustivel + effectiveOutras;

      console.log(`[DRE-OS ${osId}] missionCosts=${osMissionCosts.length} pedagio=${effectivePedagio} outros=${effectiveOutras} receitas=${missionCostReceitas} fueling=${fuelingTx.length}/${totalFueling} direct=${directExpenses.length} diarias=${totalDiarias}`);

      let enrichedBilling = billingRow;
      if (billingRow && !billingRow.fat_acionamento && Number(billingRow.fat_total || 0) > 0) {
        try {
          let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
          if (billingRow.contract_id) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", billingRow.contract_id).limit(1);
            if (cc?.length) contrato = cc[0];
          } else if (so.clientId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.clientId).eq("status", "Ativo").limit(1);
            if (cc?.length) contrato = cc[0];
          }

          const nb = (v: any) => Number(v) || 0;
          const hasAcionamento = contrato.valor_acionamento != null && nb(contrato.valor_acionamento) > 0;
          if (hasAcionamento) {
            const valorAcionamento = nb(contrato.valor_acionamento);
            const valorKmExtra = nb(contrato.valor_km_extra || contrato.valor_km_carregado);
            const valorHoraExtra = nb(contrato.valor_hora_extra);
            const franquiaKm = nb(contrato.franquia_km || contrato.franquia_minima_km);
            const franquiaHoras = nb(contrato.franquia_horas);
            const kmExc = nb(billingRow.km_excedente);
            const horasMissao = nb(billingRow.horas_trabalhadas || billingRow.horas_missao);
            const horasExcedentes = franquiaHoras > 0 ? Math.max(0, horasMissao - franquiaHoras) : 0;
            const fatAcionamento = Math.round(valorAcionamento * 100) / 100;
            const fatHoraExtra = Math.round(horasExcedentes * valorHoraExtra * 100) / 100;
            const fatKm = Math.round(kmExc * valorKmExtra * 100) / 100;
            const recalcFatTotal = fatAcionamento + fatKm + fatHoraExtra + effectivePedagio + missionCostReceitas;
            enrichedBilling = {
              ...billingRow,
              fat_acionamento: fatAcionamento,
              fat_hora_extra: fatHoraExtra,
              fat_km: fatKm,
              fat_total: Math.max(Number(billingRow.fat_total || 0), recalcFatTotal),
              franquia_horas: franquiaHoras,
              franquia_km: franquiaKm,
            };
          }
        } catch (_e) { /* keep original billing */ }
      }

      const billingFatTotal = Number(enrichedBilling?.fat_total || 0);

      const billingRevenueItems: any[] = [];
      if (enrichedBilling) {
        const bFatAcion = Number(enrichedBilling.fat_acionamento || 0);
        const bFatKm = Number(enrichedBilling.fat_km || 0);
        const bFatHoraExtra = Number(enrichedBilling.fat_hora_extra || 0);
        const bFatAdicNoturno = Number(enrichedBilling.fat_adicional_noturno || 0);
        const bFatEstadia = Number(enrichedBilling.fat_estadia || 0);
        const bFatPernoite = Number(enrichedBilling.fat_pernoite || 0);
        if (bFatAcion > 0) billingRevenueItems.push({ id: "billing-acionamento", description: "Acionamento", amount: bFatAcion, type: "INCOME", category_name: "Faturamento", origin_type: "billing_component" });
        if (bFatKm > 0) billingRevenueItems.push({ id: "billing-km", description: "KM Excedente", amount: bFatKm, type: "INCOME", category_name: "Faturamento", origin_type: "billing_component" });
        if (bFatHoraExtra > 0) billingRevenueItems.push({ id: "billing-hora-extra", description: "Hora Extra", amount: bFatHoraExtra, type: "INCOME", category_name: "Faturamento", origin_type: "billing_component" });
        if (bFatAdicNoturno > 0) billingRevenueItems.push({ id: "billing-adic-noturno", description: "Adicional Noturno", amount: bFatAdicNoturno, type: "INCOME", category_name: "Faturamento", origin_type: "billing_component" });
        if (bFatEstadia > 0) billingRevenueItems.push({ id: "billing-estadia", description: "Estadia", amount: bFatEstadia, type: "INCOME", category_name: "Faturamento", origin_type: "billing_component" });
        if (bFatPernoite > 0) billingRevenueItems.push({ id: "billing-pernoite", description: "Pernoite", amount: bFatPernoite, type: "INCOME", category_name: "Faturamento", origin_type: "billing_component" });
        if (billingRevenueItems.length === 0 && billingFatTotal > 0) {
          billingRevenueItems.push({ id: "billing-total", description: "Faturamento Escolta", amount: billingFatTotal, type: "INCOME", category_name: "Faturamento", origin_type: "billing_component" });
        }
      }

      const txRevenue = (txDirect || []).filter((t: any) => t.type === "INCOME");
      const pedagioAsRevenue = effectivePedagio;
      if (pedagioAsRevenue > 0) {
        missionCostRevenueItems.push({
          id: "pedagio-repasse",
          description: "Pedágio",
          amount: pedagioAsRevenue,
          type: "INCOME",
          category_name: "Pedágio",
          origin_type: "pedagio_repasse",
        });
      }

      const billingComponentsTotal = billingRevenueItems.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      const totalTxRevenue = txRevenue.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);

      let revenue: any[];
      let effectiveRevenue: number;
      let revenueSource: string;

      if (billingComponentsTotal > 0) {
        revenue = [...billingRevenueItems, ...missionCostRevenueItems];
        effectiveRevenue = billingComponentsTotal + missionCostReceitas + pedagioAsRevenue;
        revenueSource = "billing_components";
      } else if (totalTxRevenue > 0 || missionCostReceitas > 0 || pedagioAsRevenue > 0) {
        revenue = [...txRevenue, ...missionCostRevenueItems];
        effectiveRevenue = totalTxRevenue + missionCostReceitas + pedagioAsRevenue;
        revenueSource = missionCostReceitas > 0 ? "transaction+receitas" : "transaction";
      } else if (billingFatTotal > 0) {
        revenue = [{ id: "billing-fallback", description: "Faturamento (Billing)", amount: billingFatTotal, type: "INCOME", category_name: "Faturamento", origin_type: "billing_fallback" }];
        effectiveRevenue = billingFatTotal;
        revenueSource = "billing";
      } else {
        const estimadoFallback = (so as any).valorEstimado ? Number((so as any).valorEstimado) : 0;
        revenue = estimadoFallback > 0 ? [{ id: "estimado", description: "Valor Estimado", amount: estimadoFallback, type: "INCOME", category_name: "Estimado", origin_type: "estimado" }] : [];
        effectiveRevenue = estimadoFallback;
        revenueSource = estimadoFallback > 0 ? "estimado" : "none";
      }

      const txExpenseTotal = uniqueExpenses.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      const missionCostInTx = uniqueExpenses.filter((t: any) => t.origin_type === "mission_cost").reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      const billingOnlyDespesas = Math.max(0, billingDespesasTotal - missionCostInTx);
      const totalExpense = txExpenseTotal + totalDiarias + billingOnlyDespesas;
      const netResult = effectiveRevenue - totalExpense;
      const margemPct = effectiveRevenue > 0 ? ((netResult / effectiveRevenue) * 100) : 0;

      res.json({
        os: {
          id: so.id,
          osNumber: so.osNumber,
          type: so.type,
          status: so.status,
          scheduledDate: so.scheduledDate,
          completedDate: (so as any).completedDate,
          clientName: client?.name || "—",
          vehiclePlate: vehicle?.plate || "—",
          employee1Name: employee1?.name || null,
          employee2Name: employee2?.name || null,
          origin: so.origin || null,
          destination: so.destination || null,
          route: (so as any).route || null,
          valorEstimado: (so as any).valorEstimado || null,
        },
        billing: enrichedBilling,
        revenue,
        expenses: uniqueExpenses,
        diarias,
        components: {
          receita: effectiveRevenue,
          combustivel: totalFueling + effectiveCombustivel,
          pedagio: effectivePedagio,
          pedagioRepasse: pedagioAsRevenue,
          diarias: totalDiarias,
          custosMissao: effectivePedagio + effectiveOutras,
          despesasBilling: billingDespesasTotal,
          outrosCustos: totalOtherExpenses + effectiveOutras,
          receitasOs: missionCostReceitas,
          revenueSource,
        },
        totals: {
          totalRevenue: effectiveRevenue,
          totalExpense,
          netResult,
          margemPct: Math.round(margemPct * 100) / 100,
          usedEstimado: revenueSource === "estimado",
          usedBilling: revenueSource === "billing" || revenueSource === "billing_components",
        },
      });
    } catch (err: any) {
      console.error("[DRE-OS] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/financial/resumo", requireAdminRole, async (req, res) => {
    try {
      const { from, to } = req.query;

      let viewData: any[] | null = null;
      try {
        let vQuery = supabaseAdmin.from("v_resumo_financeiro").select("*");
        if (from) vQuery = vQuery.gte("periodo", (from as string).substring(0, 7));
        if (to) vQuery = vQuery.lte("periodo", (to as string).substring(0, 7));
        const { data: vd, error: vErr } = await vQuery;
        if (!vErr && vd) viewData = vd;
      } catch (_) {}

      if (viewData) {
        const result: any = {
          receita_total: 0, receita_realizada: 0, receita_pendente: 0,
          despesa_total: 0, despesa_realizada: 0, despesa_pendente: 0,
          saldo_previsto: 0, saldo_realizado: 0,
          total_lancamentos: 0, lancamentos_auto: 0, lancamentos_manual: 0,
          por_origem: {} as Record<string, { count: number; total: number }>,
          por_periodo: [] as any[],
          fonte: "v_resumo_financeiro",
        };
        const periodMap: Record<string, any> = {};
        for (const row of viewData) {
          const receitas = Number(row.total_receitas || 0);
          const despesas = Number(row.total_despesas || 0);
          const receitasPagas = Number(row.receitas_pagas || 0);
          const despesasPagas = Number(row.despesas_pagas || 0);
          const cnt = Number(row.total_lancamentos || 0);

          result.receita_total += receitas;
          result.despesa_total += despesas;
          result.receita_realizada += receitasPagas;
          result.despesa_realizada += despesasPagas;
          result.receita_pendente += receitas - receitasPagas;
          result.despesa_pendente += despesas - despesasPagas;
          result.total_lancamentos += cnt;

          if (row.origin_type !== "manual") {
            if (!result.por_origem[row.origin_type]) result.por_origem[row.origin_type] = { count: 0, total: 0 };
            result.por_origem[row.origin_type].count += cnt;
            result.por_origem[row.origin_type].total += receitas + despesas;
            result.lancamentos_auto += cnt;
          } else {
            result.lancamentos_manual += cnt;
          }

          if (!periodMap[row.periodo]) {
            periodMap[row.periodo] = { periodo: row.periodo, total_receitas: 0, total_despesas: 0, saldo: 0, receitas_pagas: 0, despesas_pagas: 0, saldo_realizado: 0 };
          }
          periodMap[row.periodo].total_receitas += receitas;
          periodMap[row.periodo].total_despesas += despesas;
          periodMap[row.periodo].receitas_pagas += receitasPagas;
          periodMap[row.periodo].despesas_pagas += despesasPagas;
        }
        for (const p of Object.values(periodMap)) {
          p.saldo = p.total_receitas - p.total_despesas;
          p.saldo_realizado = p.receitas_pagas - p.despesas_pagas;
        }
        result.por_periodo = Object.values(periodMap).sort((a: any, b: any) => b.periodo.localeCompare(a.periodo));
        result.saldo_previsto = result.receita_total - result.despesa_total;
        result.saldo_realizado = result.receita_realizada - result.despesa_realizada;
        return res.json(result);
      }

      let query = supabaseAdmin.from("financial_transactions").select("*");
      if (from) query = query.gte("due_date", from as string);
      if (to) query = query.lte("due_date", to as string);
      const { data: all, error } = await query;
      if (error) throw error;
      const txs = all || [];
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

      const incomes = txs.filter((t: any) => t.type === "INCOME");
      const expenses = txs.filter((t: any) => t.type === "EXPENSE");
      const paidIncomes = incomes.filter((t: any) => t.status === "PAID");
      const paidExpenses = expenses.filter((t: any) => t.status === "PAID");

      const autoTxs = txs.filter((t: any) => t.origin_type && t.origin_type !== "manual");
      const manualTxs = txs.filter((t: any) => !t.origin_type || t.origin_type === "manual");

      const byOrigin: Record<string, { count: number; total: number }> = {};
      for (const t of autoTxs) {
        const key = t.origin_type || "unknown";
        if (!byOrigin[key]) byOrigin[key] = { count: 0, total: 0 };
        byOrigin[key].count++;
        byOrigin[key].total += Number(t.amount);
      }

      res.json({
        receita_total: incomes.reduce((a: number, t: any) => a + Number(t.amount), 0),
        receita_realizada: paidIncomes.reduce((a: number, t: any) => a + Number(t.amount), 0),
        receita_pendente: incomes.filter((t: any) => t.status === "PENDING").reduce((a: number, t: any) => a + Number(t.amount), 0),
        despesa_total: expenses.reduce((a: number, t: any) => a + Number(t.amount), 0),
        despesa_realizada: paidExpenses.reduce((a: number, t: any) => a + Number(t.amount), 0),
        despesa_pendente: expenses.filter((t: any) => t.status === "PENDING").reduce((a: number, t: any) => a + Number(t.amount), 0),
        saldo_previsto: incomes.reduce((a: number, t: any) => a + Number(t.amount), 0) - expenses.reduce((a: number, t: any) => a + Number(t.amount), 0),
        saldo_realizado: paidIncomes.reduce((a: number, t: any) => a + Number(t.amount), 0) - paidExpenses.reduce((a: number, t: any) => a + Number(t.amount), 0),
        vencidos: txs.filter((t: any) => t.status === "PENDING" && t.due_date?.split("T")[0] < today).length,
        total_lancamentos: txs.length,
        lancamentos_auto: autoTxs.length,
        lancamentos_manual: manualTxs.length,
        por_origem: byOrigin,
        fonte: "financial_transactions",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== SERVICE CONTRACTS ====================
  app.get("/api/service-contracts", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { client_id } = req.query;
      let query = supabaseAdmin.from("service_contracts").select("*").order("created_at", { ascending: false });
      if (client_id) query = query.eq("client_id", client_id);
      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/service-contracts", requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const { data, error } = await supabaseAdmin.from("service_contracts").insert({ ...req.body, created_by: user.name }).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/service-contracts/:id", requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("service_contracts").update({ ...req.body, updated_at: new Date().toISOString() }).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/service-contracts/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("service_contracts").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ==================== ESCORT CALCULATION ENGINE ====================


  // Escort Contracts CRUD
  app.get("/api/escort/contracts", requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("escort_contracts").select("*").order("client_name");
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  const stripUnknownContractCols = (body: any) => {
    const safe = { ...body };
    delete safe.tabela_cancelamento;
    return safe;
  };

  app.post("/api/escort/contracts", requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("escort_contracts").insert(stripUnknownContractCols(req.body)).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/escort/contracts/:id", requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("escort_contracts").update(stripUnknownContractCols(req.body)).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/escort/contracts/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("escort_contracts").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/escort/calculate", requireAuth, async (req, res) => {
    try {
      const { contract_id, km_inicial, km_final, km_vazio, horas_missao, horas_estadia, teve_pernoite, horario_inicio, horario_fim, horario_agendado, despesas_pedagio, despesas_combustivel, despesas_outras, receitas_os, is_noturno, despesas } = req.body;

      const kmIni = Number(km_inicial || 0);
      const kmFin = Number(km_final || 0);
      if (kmFin < kmIni) return res.status(400).json({ message: "KM final não pode ser menor que KM inicial" });

      let contrato: any;
      if (contract_id) {
        const { data, error } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", contract_id).single();
        if (error || !data) return res.status(404).json({ message: "Contrato não encontrado" });
        contrato = data;
      } else {
        contrato = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
      }

      const desp = despesas || {};
      const resultado = calcularEscolta({
        km_inicial: kmIni, km_final: kmFin, km_vazio: Number(km_vazio || 0),
        horas_missao: Number(horas_missao || 0), horas_estadia: Number(horas_estadia || 0),
        teve_pernoite: !!teve_pernoite, horario_inicio, horario_fim, horario_agendado,
        inicio_ts: req.body.inicio_ts || req.body.mission_started_at || null,
        fim_ts: req.body.fim_ts || req.body.completed_date || null,
        scheduled_date: req.body.scheduled_date || null,
        despesas_pedagio: Number(desp.pedagio || despesas_pedagio || 0),
        despesas_combustivel: Number(desp.combustivel || despesas_combustivel || 0),
        despesas_outras: Number(desp.outras || despesas_outras || 0),
        receitas_os: Number(desp.receitas_os || receitas_os || 0), contrato,
      });

      res.json({ status: "sucesso", ...resultado, require_foto_hodometro: resultado.require_photo });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Escort Billing - Save (with auto BO generation)
  app.post("/api/escort/billings", requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const body = req.body;
      if (Number(body.km_final) < Number(body.km_inicial)) return res.status(400).json({ message: "KM final não pode ser menor que KM inicial" });
      const km_total = Number(body.km_final) - Number(body.km_inicial);
      if (km_total > 500 && !body.foto_hodometro_fim) return res.status(400).json({ message: "Foto do hodômetro é obrigatória para diferença maior que 500 KM" });

      let clientId = body.client_id;
      let clientName = body.client_name;
      if (!clientId && body.route_id) {
        const { data: route } = await supabaseAdmin.from("escort_routes").select("client_id, client_name").eq("id", body.route_id).single();
        if (route?.client_id) { clientId = route.client_id; clientName = clientName || route.client_name; }
      }

      const now = new Date();
      const boletimNumero = `BO-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}-${String(Math.random().toString(36).substring(2, 6)).toUpperCase()}`;

      const VALID_BILLING_STATUSES = ["A_VERIFICAR", "FATURADO", "PAGO", "CANCELADO", "APROVADA", "REJEITADA"];
      const safeStatus = VALID_BILLING_STATUSES.includes(body.status) ? body.status : "A_VERIFICAR";
      const payload = {
        ...body, client_id: clientId, client_name: clientName,
        status: safeStatus,
        created_by: user.name, boletim_numero: boletimNumero, boletim_gerado: true,
      };
      // UPSERT atômico por service_order_id (quando informado) — ON CONFLICT via UNIQUE uniq_eb_so_id.
      // Quando não há OS vinculada, é billing manual avulso ⇒ INSERT normal.
      const r = body.service_order_id
        ? await supabaseAdmin.from("escort_billings").upsert(payload, { onConflict: "service_order_id" }).select().single()
        : await supabaseAdmin.from("escort_billings").insert(payload).select().single();
      if (r.error) throw r.error;
      res.json(r.data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Escort Billings - List
  app.get("/api/escort/billings", requireAdminRole, async (req, res) => {
    try {
      const { client_id, status, from, to } = req.query;
      let query = supabaseAdmin.from("escort_billings").select("*").order("created_at", { ascending: false });
      if (client_id) query = query.eq("client_id", client_id);
      if (status) query = query.eq("status", status as string);
      if (from) query = query.gte("data_missao", from as string);
      if (to) query = query.lte("data_missao", to as string);
      const { data, error } = await query;
      if (error) throw error;
      const list = data || [];

      // Enriquecer com status real da OS para que o cliente saiba diferenciar
      // RECUSADA (operacional não atendeu) de CANCELADA (cliente cancelou).
      const osIds = Array.from(new Set(list.map((b: any) => b.service_order_id).filter((x: any) => x != null)));
      let osMap: Record<string, any> = {};
      if (osIds.length > 0) {
        const { data: osList } = await supabaseAdmin
          .from("service_orders")
          .select("id, os_number, status, mission_status, cancellation_reason")
          .in("id", osIds);
        for (const o of (osList || [])) {
          osMap[String(o.id)] = o;
        }
      }
      const enriched = list.map((b: any) => {
        const os = osMap[String(b.service_order_id)] || {};
        return {
          ...b,
          os_number: b.os_number || os.os_number || null,
          _so_status: os.status || null,
          _so_mission_status: os.mission_status || null,
          _so_cancellation_reason: os.cancellation_reason || null,
        };
      });
      res.json(enriched);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/escort/billings/:id", requireAdminRole, async (req, res) => {
    try {
      const { data: existing, error: fetchErr } = await supabaseAdmin.from("escort_billings").select("status").eq("id", req.params.id).single();
      if (fetchErr || !existing) return res.status(404).json({ message: "Registro não encontrado" });

      const LOCKED_STATUSES = ["APROVADA", "FATURADO", "PAGO"];
      const STATUS_ONLY_FIELDS = ["status", "observacoes", "notas"];

      if (LOCKED_STATUSES.includes(existing.status)) {
        const updateBody = { ...req.body };
        const attemptedFields = Object.keys(updateBody);
        const blockedFields = attemptedFields.filter(f => !STATUS_ONLY_FIELDS.includes(f));
        if (blockedFields.length > 0) {
          return res.status(403).json({
            message: `Boletim aprovado — valores de cálculo estão travados. Apenas status e observações podem ser alterados.`,
          });
        }
      }

      const updateBody = { ...req.body };
      if (updateBody.status) {
        const VALID_BILLING_STATUSES = ["A_VERIFICAR", "FATURADO", "PAGO", "CANCELADO", "APROVADA", "REJEITADA"];
        if (!VALID_BILLING_STATUSES.includes(updateBody.status)) {
          return res.status(400).json({ message: `Status inválido: ${updateBody.status}. Valores aceitos: ${VALID_BILLING_STATUSES.join(", ")}` });
        }
      }
      const { data, error } = await supabaseAdmin.from("escort_billings").update(updateBody).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/escort/billings/:id", requireAdminRole, async (req, res) => {
    try {
      const { data: existing, error: fetchErr } = await supabaseAdmin.from("escort_billings").select("*").eq("id", req.params.id).single();
      if (fetchErr || !existing) return res.status(404).json({ message: "Registro não encontrado" });

      const updateBody = { ...req.body };
      delete updateBody.id;
      delete updateBody.created_at;
      delete updateBody.created_by;

      updateBody.edit_reason = updateBody.edit_reason || `Editado via Boletim por ${req.user!.name}`;

      const { data, error } = await supabaseAdmin.from("escort_billings").update(updateBody).eq("id", req.params.id).select().single();
      if (error) throw error;
      console.log(`[billing-edit] Billing ${req.params.id} editado por ${req.user!.name}: km_ini=${updateBody.km_inicial}, km_fin=${updateBody.km_final}, km_total=${updateBody.km_total}, fat_total=${updateBody.fat_total}`);
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/escort/billings/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      await removeAutoTransaction("escort_billing", req.params.id);
      const { error } = await supabaseAdmin.from("escort_billings").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/escort/billings/submit-os", requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const body = req.body;

      const kmIni = Number(body.km_inicial || 0);
      const kmFin = Number(body.km_final || 0);
      if (kmFin < kmIni) return res.status(400).json({ message: "KM final não pode ser menor que KM inicial" });

      let clientId = body.client_id;
      let clientName = body.client_name;
      if (!clientId && body.route_id) {
        const { data: route } = await supabaseAdmin.from("escort_routes").select("client_id, client_name").eq("id", body.route_id).single();
        if (route?.client_id) { clientId = route.client_id; clientName = clientName || route.client_name; }
      }

      let contrato: any = null;
      if (body.contract_id) {
        const { data } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", body.contract_id).single();
        contrato = data;
      }
      if (!contrato) {
        contrato = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
      }

      // Se tem service_order_id, busca timestamps reais pra cálculo multi-dia correto
      let so_ts_inicio: string | null = null, so_ts_fim: string | null = null, so_scheduled: string | null = null;
      if (body.service_order_id) {
        const { data: soRow } = await supabaseAdmin
          .from("service_orders")
          .select("mission_started_at, completed_date, scheduled_date")
          .eq("id", body.service_order_id).maybeSingle();
        if (soRow) {
          so_ts_inicio = soRow.mission_started_at;
          so_ts_fim = soRow.completed_date;
          so_scheduled = soRow.scheduled_date;
        }
      }
      const resultado = calcularEscolta({
        km_inicial: kmIni, km_final: kmFin, km_vazio: Number(body.km_vazio || 0),
        horas_missao: Number(body.horas_missao || 0), horas_estadia: Number(body.horas_estadia || 0),
        teve_pernoite: !!body.teve_pernoite, horario_inicio: body.horario_inicio, horario_fim: body.horario_fim,
        horario_agendado: body.horario_agendado,
        inicio_ts: body.inicio_ts || so_ts_inicio,
        fim_ts: body.fim_ts || so_ts_fim,
        scheduled_date: body.scheduled_date || so_scheduled,
        despesas_pedagio: Number(body.despesas_pedagio || 0), despesas_combustivel: Number(body.despesas_combustivel || 0),
        despesas_outras: Number(body.despesas_outras || 0), receitas_os: Number(body.receitas_os || 0), contrato,
      });

      const nb = (v: any) => Number(v) || 0;
      const billingPayload2 = {
        client_id: clientId, client_name: clientName,
        contract_id: body.contract_id, route_id: body.route_id,
        service_order_id: body.service_order_id,
        km_inicial: nb(kmIni), km_final: nb(kmFin), km_vazio: nb(body.km_vazio),
        km_carregado: nb(resultado.km_carregado), km_total: nb(resultado.km_total),
        km_faturado: nb(resultado.km_faturado), km_franquia: nb(resultado.km_franquia),
        km_excedente: nb(resultado.km_excedente),
        horario_agendado: body.horario_agendado || null,
        horario_inicio: body.horario_inicio || null, horario_fim: body.horario_fim || null,
        horario_inicio_considerado: resultado.horario_inicio_considerado,
        horas_missao: nb(resultado.horas_trabalhadas), horas_estadia: nb(body.horas_estadia),
        horas_trabalhadas: nb(resultado.horas_trabalhadas),
        teve_pernoite: !!body.teve_pernoite, is_noturno: resultado.is_noturno,
        despesas_pedagio: nb(body.despesas_pedagio), despesas_combustivel: nb(body.despesas_combustivel),
        despesas_outras: nb(body.despesas_outras), receitas_os: nb(resultado.receitas_os),
        desp_total: nb(resultado.despesas.total),
        fat_acionamento: nb(resultado.fat_acionamento), fat_hora_extra: nb(resultado.fat_hora_extra),
        fat_km: nb(resultado.fat_km), fat_km_carregado: nb(resultado.faturamento.km_carregado),
        fat_km_vazio: nb(resultado.faturamento.km_vazio),
        fat_estadia: nb(resultado.fat_estadia), fat_pernoite: nb(resultado.fat_pernoite),
        fat_diaria: nb(resultado.fat_pernoite),
        fat_adicional_noturno: nb(resultado.fat_adicional_noturno), fat_total: nb(resultado.fat_total),
        valor_franquia: nb(resultado.valor_franquia), valor_km_extra: nb(resultado.valor_km_extra),
        pag_vrp: nb(resultado.pag_vrp), pag_periculosidade: nb(resultado.pag_periculosidade),
        pag_adicional_noturno: nb(resultado.pag_adicional_noturno), pag_reembolsos: nb(resultado.pag_reembolsos),
        pag_total: nb(resultado.pag_total),
        resultado_bruto: nb(resultado.resultado.bruto), resultado_liquido: nb(resultado.resultado.liquido),
        margem_percentual: nb(resultado.resultado.margem_pct),
        vigilante_id: body.vigilante_id || user.id, vigilante_name: body.vigilante_name || user.name,
        origem: body.origem, destino: body.destino,
        placa_viatura: body.placa_viatura, placa_escoltado: body.placa_escoltado,
        motorista_escoltado: body.motorista_escoltado,
        data_missao: body.data_missao || new Date().toISOString(),
        observacoes: body.observacoes, notas: body.notas,
        status: "A_VERIFICAR", created_by: user.name,
      };
      // UPSERT atômico por service_order_id — ON CONFLICT via UNIQUE uniq_eb_so_id (db-init.ts).
      const r2 = body.service_order_id
        ? await supabaseAdmin.from("escort_billings").upsert(billingPayload2, { onConflict: "service_order_id" }).select().single()
        : await supabaseAdmin.from("escort_billings").insert(billingPayload2).select().single();
      if (r2.error) throw r2.error;

      res.json({ ...r2.data, resumo_calculo: resultado });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/escort/billings/recalcular-lote", requireAdminRole, async (req, res) => {
    try {
      const { billing_ids } = req.body;
      if (!Array.isArray(billing_ids) || billing_ids.length === 0) {
        return res.status(400).json({ message: "billing_ids é obrigatório" });
      }

      let success = 0, errors = 0, skipped = 0;
      for (const id of billing_ids) {
        try {
          const { data: existing } = await supabaseAdmin.from("escort_billings").select("*").eq("id", id).single();
          if (!existing) { errors++; continue; }
          if (["FATURADO", "PAGO"].includes(existing.status)) { skipped++; continue; }
          if (!existing.contract_id) { errors++; continue; }

          const { data: contrato } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", existing.contract_id).single();
          if (!contrato) { errors++; continue; }

          // Busca timestamps reais da OS pra HE multi-dia
          let lot_ts_ini: string | null = null, lot_ts_fim: string | null = null, lot_sch: string | null = null;
          if (existing.service_order_id) {
            const { data: soRow } = await supabaseAdmin
              .from("service_orders")
              .select("mission_started_at, completed_date, scheduled_date")
              .eq("id", existing.service_order_id).maybeSingle();
            if (soRow) { lot_ts_ini = soRow.mission_started_at; lot_ts_fim = soRow.completed_date; lot_sch = soRow.scheduled_date; }
          }
          const resultado = calcularEscolta({
            km_inicial: Number(existing.km_inicial || 0),
            km_final: Math.max(Number(existing.km_inicial || 0), Number(existing.km_final || 0)),
            km_vazio: Number(existing.km_vazio || 0),
            horas_missao: Number(existing.horas_missao || 0),
            horas_estadia: Number(existing.horas_estadia || 0),
            teve_pernoite: !!existing.teve_pernoite,
            horario_inicio: existing.horario_inicio || undefined,
            horario_fim: existing.horario_fim || undefined,
            horario_agendado: existing.horario_agendado || undefined,
            inicio_ts: lot_ts_ini, fim_ts: lot_ts_fim, scheduled_date: lot_sch,
            despesas_pedagio: Number(existing.despesas_pedagio || 0),
            despesas_combustivel: Number(existing.despesas_combustivel || 0),
            despesas_outras: Number(existing.despesas_outras || 0),
            receitas_os: Number(existing.receitas_os || 0),
            contrato,
          });

          await supabaseAdmin.from("escort_billings").update({
            fat_total: resultado.fat_total,
            fat_hora_extra: resultado.fat_hora_extra,
            fat_km: resultado.fat_km || 0,
            fat_acionamento: resultado.fat_acionamento,
            fat_adicional_noturno: resultado.fat_adicional_noturno || 0,
            fat_estadia: resultado.fat_estadia || 0,
            fat_pernoite: resultado.fat_pernoite || 0,
            horas_trabalhadas: resultado.horas_trabalhadas,
            horas_missao: resultado.horas_trabalhadas,
            horario_inicio_considerado: resultado.horario_inicio_considerado,
            km_total: resultado.km_total,
            km_carregado: resultado.km_carregado,
            km_faturado: resultado.km_faturado,
            km_franquia: resultado.km_franquia,
            km_excedente: resultado.km_excedente,
            valor_franquia: resultado.valor_franquia,
            valor_km_extra: resultado.valor_km_extra,
            resultado_bruto: resultado.resultado.bruto,
            resultado_liquido: resultado.resultado.liquido,
            margem_percentual: resultado.resultado.margem_pct,
          }).eq("id", id);

          if (existing.service_order_id) {
            const n = (v: any) => Number(v) || 0;
            const totalCalc = n(resultado.fat_acionamento) + n(resultado.fat_hora_extra) + n(resultado.fat_km) +
              n(resultado.despesas?.pedagio) + n(resultado.fat_adicional_noturno) + n(resultado.fat_estadia) +
              n(resultado.fat_pernoite) + n(resultado.despesas?.outras);
            await supabaseAdmin.from("service_orders").update({ fat_calculado: totalCalc }).eq("id", existing.service_order_id);
          }

          success++;
        } catch (err) {
          console.error(`[RECALC-LOTE] Erro billing ${id}:`, (err as any).message);
          errors++;
        }
      }

      const user = req.user!;
      await logSystemAudit({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "RECALCULAR_LOTE", targetId: "batch", targetType: "escort_billing",
        details: `Recálculo em lote: ${success} OK, ${errors} erros, ${skipped} ignorados (faturados). Total: ${billing_ids.length}`,
        ipAddress: req.ip,
      });

      res.json({ success, errors, skipped, total: billing_ids.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/escort/billings/:id/salvar", requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const { data: existing, error: fetchErr } = await supabaseAdmin.from("escort_billings").select("*").eq("id", req.params.id).single();
      if (fetchErr || !existing) return res.status(404).json({ message: "Registro não encontrado" });

      const LOCKED_STATUSES = ["FATURADO", "PAGO"];
      if (LOCKED_STATUSES.includes(existing.status)) {
        return res.status(403).json({ message: "Boletim faturado — valores travados. Não é possível alterar." });
      }

      const {
        observacoes, despesas_pedagio, fat_acionamento, fat_km,
        km_inicial, km_final, horario_inicio, horario_termino,
        despesas_outras, receitas_os, recalcular,
        fat_hora_extra, fat_adicional_noturno, fat_estadia, fat_pernoite,
      } = req.body;

      const updateData: any = {};
      if (observacoes !== undefined) updateData.observacoes = observacoes;
      if (despesas_pedagio !== undefined) updateData.despesas_pedagio = Number(despesas_pedagio) || 0;
      if (fat_acionamento !== undefined) updateData.fat_acionamento = Number(fat_acionamento) || 0;
      if (fat_km !== undefined) updateData.fat_km = Number(fat_km) || 0;
      if (fat_hora_extra !== undefined) updateData.fat_hora_extra = Number(fat_hora_extra) || 0;
      if (fat_adicional_noturno !== undefined) updateData.fat_adicional_noturno = Number(fat_adicional_noturno) || 0;
      if (fat_estadia !== undefined) updateData.fat_estadia = Number(fat_estadia) || 0;
      if (fat_pernoite !== undefined) updateData.fat_pernoite = Number(fat_pernoite) || 0;
      if (km_inicial !== undefined) updateData.km_inicial = Number(km_inicial) || 0;
      if (km_final !== undefined) updateData.km_final = Number(km_final) || 0;
      if (horario_inicio !== undefined) updateData.horario_inicio = horario_inicio;
      if (horario_termino !== undefined) updateData.horario_fim = horario_termino;
      if (despesas_outras !== undefined) updateData.despesas_outras = Number(despesas_outras) || 0;
      if (receitas_os !== undefined) updateData.receitas_os = Number(receitas_os) || 0;

      if (recalcular && existing.contract_id) {
        const { data: contrato } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", existing.contract_id).single();
        if (contrato) {
          const kmI = km_inicial !== undefined ? Number(km_inicial) : Number(existing.km_inicial || 0);
          const kmF = km_final !== undefined ? Number(km_final) : Number(existing.km_final || 0);
          const hInicio = horario_inicio !== undefined ? horario_inicio : existing.horario_inicio;
          const hFim = horario_termino !== undefined ? horario_termino : existing.horario_fim;
          const pedagio = despesas_pedagio !== undefined ? Number(despesas_pedagio) : Number(existing.despesas_pedagio || 0);
          const despOutras = despesas_outras !== undefined ? Number(despesas_outras) : Number(existing.despesas_outras || 0);
          const receitasOsCalc = receitas_os !== undefined ? Number(receitas_os) : Number(existing.receitas_os || 0);
          try {
            // Busca timestamps reais da OS pra HE multi-dia
            let sv_ts_ini: string | null = null, sv_ts_fim: string | null = null, sv_sch: string | null = null;
            if (existing.service_order_id) {
              const { data: soRow } = await supabaseAdmin
                .from("service_orders")
                .select("mission_started_at, completed_date, scheduled_date")
                .eq("id", existing.service_order_id).maybeSingle();
              if (soRow) { sv_ts_ini = soRow.mission_started_at; sv_ts_fim = soRow.completed_date; sv_sch = soRow.scheduled_date; }
            }
            const resultado = calcularEscolta({
              km_inicial: kmI, km_final: Math.max(kmI, kmF), km_vazio: Number(existing.km_vazio || 0),
              horas_missao: Number(existing.horas_missao || 0), horas_estadia: Number(existing.horas_estadia || 0),
              teve_pernoite: !!existing.teve_pernoite,
              horario_inicio: hInicio || undefined, horario_fim: hFim || undefined,
              horario_agendado: existing.horario_agendado || undefined,
              inicio_ts: sv_ts_ini, fim_ts: sv_ts_fim, scheduled_date: sv_sch,
              despesas_pedagio: pedagio, despesas_combustivel: Number(existing.despesas_combustivel || 0),
              despesas_outras: despOutras,
              receitas_os: receitasOsCalc, contrato,
            });
            Object.assign(updateData, {
              km_inicial: kmI, km_final: Math.max(kmI, kmF),
              km_total: resultado.km_total, km_carregado: resultado.km_carregado,
              km_faturado: resultado.km_faturado, km_franquia: resultado.km_franquia,
              km_excedente: resultado.km_excedente, valor_franquia: resultado.valor_franquia,
              valor_km_extra: resultado.valor_km_extra,
              fat_acionamento: resultado.fat_acionamento, fat_hora_extra: resultado.fat_hora_extra,
              fat_km: resultado.fat_km || 0,
              fat_total: resultado.fat_total || 0,
              fat_adicional_noturno: resultado.fat_adicional_noturno || 0,
              fat_estadia: resultado.fat_estadia || 0,
              fat_pernoite: resultado.fat_pernoite || 0,
              horas_trabalhadas: resultado.horas_trabalhadas,
              horario_inicio_considerado: resultado.horario_inicio_considerado,
              despesas_pedagio: pedagio,
              receitas_os: receitasOsCalc,
              resultado_bruto: resultado.resultado?.bruto || 0,
              resultado_liquido: resultado.resultado?.liquido || 0,
              margem_percentual: resultado.resultado?.margem_pct || 0,
            });
            if (hInicio) updateData.horario_inicio = hInicio;
            if (hFim) updateData.horario_fim = hFim;
          } catch {}
        }
      }

      const { data, error } = await supabaseAdmin.from("escort_billings").update(updateData).eq("id", req.params.id).select().single();
      if (error) throw error;

      if (data && !recalcular) {
        const fatAcion = Number(data.fat_acionamento || 0);
        const fatHoraExtra = Number(data.fat_hora_extra || 0);
        const fatKm = Number(data.fat_km || 0);
        const pedagio = Number(data.despesas_pedagio || 0);
        const adNoturno = Number(data.fat_adicional_noturno || 0);
        const estadia = Number(data.fat_estadia || 0);
        const pernoite = Number(data.fat_pernoite || 0);
        const despOutras = Number(data.despesas_outras || 0);
        const receitasOs = Number(data.receitas_os || 0);
        const fatTotal = fatAcion + fatHoraExtra + fatKm + pedagio + adNoturno + estadia + pernoite + despOutras + receitasOs;
        const pagTotal = Number(data.pag_total || 0);
        const resultado = fatTotal - pagTotal;
        await supabaseAdmin.from("escort_billings").update({
          fat_total: fatTotal, resultado_bruto: fatTotal - pagTotal, resultado_liquido: resultado,
        }).eq("id", req.params.id);
        data.fat_total = fatTotal;
        data.resultado_liquido = resultado;
        data.resultado_bruto = fatTotal - pagTotal;
      }

      if (existing.service_order_id) {
        const fatAcion = Number(data?.fat_acionamento || 0);
        const fatHoraExtra = Number(data?.fat_hora_extra || 0);
        const fatKm = Number(data?.fat_km || 0);
        const pedagio = Number(data?.despesas_pedagio || 0);
        const adNoturno = Number(data?.fat_adicional_noturno || 0);
        const estadia = Number(data?.fat_estadia || 0);
        const pernoite = Number(data?.fat_pernoite || 0);
        const despOutras = Number(data?.despesas_outras || 0);
        const receitasOs = Number(data?.receitas_os || 0);
        const totalCalc = fatAcion + fatHoraExtra + fatKm + pedagio + adNoturno + estadia + pernoite + despOutras + receitasOs;
        await supabaseAdmin.from("service_orders").update({ fat_calculado: totalCalc }).eq("id", existing.service_order_id).then(() => {});
      }

      const changes: string[] = [];
      if (km_inicial !== undefined) changes.push(`KM Inicial: ${existing.km_inicial}→${km_inicial}`);
      if (km_final !== undefined) changes.push(`KM Final: ${existing.km_final}→${km_final}`);
      if (fat_acionamento !== undefined) changes.push(`Acionamento: ${existing.fat_acionamento}→${fat_acionamento}`);
      if (fat_hora_extra !== undefined) changes.push(`Hora Extra: ${existing.fat_hora_extra}→${fat_hora_extra}`);
      if (fat_km !== undefined) changes.push(`KM Extra: ${existing.fat_km}→${fat_km}`);
      if (fat_adicional_noturno !== undefined) changes.push(`Ad. Noturno: ${existing.fat_adicional_noturno}→${fat_adicional_noturno}`);
      if (fat_estadia !== undefined) changes.push(`Estadia: ${existing.fat_estadia}→${fat_estadia}`);
      if (fat_pernoite !== undefined) changes.push(`Pernoite: ${existing.fat_pernoite}→${fat_pernoite}`);
      if (despesas_pedagio !== undefined) changes.push(`Pedágio: ${existing.despesas_pedagio}→${despesas_pedagio}`);
      if (receitas_os !== undefined) changes.push(`Reembolso Cliente: ${existing.receitas_os}→${receitas_os}`);
      if (despesas_outras !== undefined) changes.push(`Demais Custos: ${existing.despesas_outras}→${despesas_outras}`);
      if (horario_inicio !== undefined) changes.push(`Hora Início: ${existing.horario_inicio}→${horario_inicio}`);
      if (horario_termino !== undefined) changes.push(`Hora Fim: ${existing.horario_fim}→${horario_termino}`);
      if (changes.length > 0) {
        await logSystemAudit({
          userId: user.id, userName: user.name, userRole: user.role,
          action: "EDITAR_MEDICAO", targetId: req.params.id, targetType: "escort_billing",
          details: `OS #${existing.service_order_id} editada. ${changes.join("; ")}`,
          ipAddress: req.ip,
        });
      }

      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/escort/billings/:id/revisar", requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const { acao, motivo_rejeicao } = req.body;

      if (!["APROVADA", "REJEITADA"].includes(acao)) {
        return res.status(400).json({ message: "Ação deve ser APROVADA ou REJEITADA" });
      }

      const { data: billing, error: fetchErr } = await supabaseAdmin.from("escort_billings").select("*").eq("id", req.params.id).single();
      if (fetchErr || !billing) return res.status(404).json({ message: "Registro não encontrado" });
      if (acao === "APROVADA" && billing.status === "APROVADA") return res.json(billing);
      if (billing.status !== "A_VERIFICAR") return res.status(400).json({ message: "Somente OS com status 'A Verificar' podem ser revisadas" });

      const updateData: any = {
        status: acao === "APROVADA" ? "APROVADA" : "REJEITADA",
        revisado_por: user.name,
        revisado_em: new Date().toISOString(),
      };
      if (acao === "REJEITADA" && motivo_rejeicao) updateData.motivo_rejeicao = motivo_rejeicao;

      if (acao === "APROVADA") {
        const now = new Date();
        updateData.boletim_numero = `BO-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}-${String(Math.random().toString(36).substring(2, 6)).toUpperCase()}`;
        updateData.boletim_gerado = true;

        if (billing.contract_id) {
          const { data: contrato } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", billing.contract_id).single();
          if (contrato) {
            try {
              // Busca timestamps reais da OS pra HE multi-dia
              let ap_ts_ini: string | null = null, ap_ts_fim: string | null = null, ap_sch: string | null = null;
              if (billing.service_order_id) {
                const { data: soRow } = await supabaseAdmin
                  .from("service_orders")
                  .select("mission_started_at, completed_date, scheduled_date")
                  .eq("id", billing.service_order_id).maybeSingle();
                if (soRow) { ap_ts_ini = soRow.mission_started_at; ap_ts_fim = soRow.completed_date; ap_sch = soRow.scheduled_date; }
              }
              const resultado = calcularEscolta({
                km_inicial: Number(billing.km_inicial || 0),
                km_final: Math.max(Number(billing.km_inicial || 0), Number(billing.km_final || 0)),
                km_vazio: Number(billing.km_vazio || 0),
                horas_missao: Number(billing.horas_missao || 0),
                horas_estadia: Number(billing.horas_estadia || 0),
                teve_pernoite: !!billing.teve_pernoite,
                horario_inicio: billing.horario_inicio || undefined,
                horario_fim: billing.horario_fim || undefined,
                horario_agendado: billing.horario_agendado || undefined,
                inicio_ts: ap_ts_ini, fim_ts: ap_ts_fim, scheduled_date: ap_sch,
                despesas_pedagio: Number(billing.despesas_pedagio || 0),
                despesas_combustivel: Number(billing.despesas_combustivel || 0),
                despesas_outras: Number(billing.despesas_outras || 0),
                receitas_os: Number(billing.receitas_os || 0),
                contrato,
              });
              updateData.fat_total = resultado.fat_total;
              updateData.fat_hora_extra = resultado.fat_hora_extra;
              updateData.fat_km = resultado.fat_km || 0;
              updateData.fat_acionamento = resultado.fat_acionamento;
              updateData.fat_adicional_noturno = resultado.fat_adicional_noturno || 0;
              updateData.fat_estadia = resultado.fat_estadia || 0;
              updateData.fat_pernoite = resultado.fat_pernoite || 0;
              updateData.horas_trabalhadas = resultado.horas_trabalhadas;
              updateData.horas_missao = resultado.horas_trabalhadas;
              updateData.horario_inicio_considerado = resultado.horario_inicio_considerado;
              updateData.km_total = resultado.km_total;
              updateData.km_carregado = resultado.km_carregado;
              updateData.km_faturado = resultado.km_faturado;
              updateData.km_franquia = resultado.km_franquia;
              updateData.km_excedente = resultado.km_excedente;
              updateData.valor_franquia = resultado.valor_franquia;
              updateData.valor_km_extra = resultado.valor_km_extra;
              updateData.resultado_bruto = resultado.resultado.bruto;
              updateData.resultado_liquido = resultado.resultado.liquido;
              updateData.margem_percentual = resultado.resultado.margem_pct;

              if (billing.service_order_id) {
                const n = (v: any) => Number(v) || 0;
                const totalCalc = n(resultado.fat_acionamento) + n(resultado.fat_hora_extra) + n(resultado.fat_km) +
                  n(resultado.despesas?.pedagio) + n(resultado.fat_adicional_noturno) + n(resultado.fat_estadia) +
                  n(resultado.fat_pernoite) + n(resultado.despesas?.outras) + n(resultado.receitas_os);
                await supabaseAdmin.from("service_orders").update({ fat_calculado: totalCalc }).eq("id", billing.service_order_id);
              }
              console.log(`[REVISAR] Recalculado billing ${req.params.id} antes de aprovar. fat_total=${resultado.fat_total}`);
            } catch (calcErr) {
              console.error(`[REVISAR] Erro ao recalcular billing ${req.params.id}:`, (calcErr as any).message);
              return res.status(500).json({ message: `Erro ao recalcular billing antes da aprovação: ${(calcErr as any).message}` });
            }
          }
        }
      }

      const { data, error } = await supabaseAdmin.from("escort_billings").update(updateData).eq("id", req.params.id).select().single();
      if (error) throw error;

      if (acao === "APROVADA" && data) {
        const totalFat = Number(data.fat_acionamento || 0) + Number(data.fat_hora_extra || 0) + Number(data.fat_km || 0) + Number(data.fat_adicional_noturno || 0) + Number(data.despesas_pedagio || 0) + Number(data.despesas_outras || 0) + Number(data.fat_estadia || 0) + Number(data.fat_pernoite || 0) + Number(data.receitas_os || 0);
        await removeAutoTransaction("escort_billing", req.params.id);
        await removeAutoTransaction("service_order", String(data.service_order_id));
        if (totalFat > 0) {
          await createAutoTransaction({
            description: `ESCOLTA ${data.boletim_numero || ""} - ${data.client_name || "Cliente"} (${data.origem || ""} → ${data.destino || ""})`.trim(),
            amount: totalFat,
            type: "INCOME",
            due_date: (data.data_missao || data.created_at || new Date().toISOString()).split("T")[0],
            origin_type: "escort_billing",
            origin_id: data.id,
            category_name: "Faturamento Escolta",
            entity_name: data.client_name || null,
            created_by: user.name,
          });
        }
        if (data.service_order_id) {
          await supabaseAdmin.from("service_orders").update({ status: "concluida" }).eq("id", data.service_order_id);
        }
        await logSystemAudit({
          userId: user.id, userName: user.name, userRole: user.role,
          action: "APROVAR_MISSAO", targetId: req.params.id, targetType: "escort_billing",
          details: `OS #${data.service_order_id} aprovada. Boletim ${data.boletim_numero}. Valor: R$${totalFat.toFixed(2)}. Cliente: ${data.client_name}`,
          ipAddress: req.ip,
        });
      }

      if (acao === "REJEITADA") {
        await removeAutoTransaction("escort_billing", req.params.id);
        await removeAutoTransaction("service_order", String(billing.service_order_id));
        if (billing.service_order_id) {
          await supabaseAdmin.from("service_orders").update({ status: "recusada", mission_status: "encerrada" }).eq("id", billing.service_order_id);
        }
        await logSystemAudit({
          userId: user.id, userName: user.name, userRole: user.role,
          action: "REJEITAR_MISSAO", targetId: req.params.id, targetType: "escort_billing",
          details: `OS #${billing.service_order_id} rejeitada. Motivo: ${motivo_rejeicao || "N/A"}. Cliente: ${billing.client_name}`,
          ipAddress: req.ip,
        });
      }

      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/escort/billings/:id/reabrir", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const { data: billing, error: fetchErr } = await supabaseAdmin.from("escort_billings").select("*").eq("id", req.params.id).single();
      if (fetchErr || !billing) return res.status(404).json({ message: "Registro não encontrado" });
      if (billing.status !== "APROVADA") return res.status(400).json({ message: "Somente OS com status 'APROVADA' podem ser reabertas" });

      const { data, error } = await supabaseAdmin.from("escort_billings").update({
        status: "A_VERIFICAR",
        revisado_por: null,
        revisado_em: null,
        boletim_gerado: false,
      }).eq("id", req.params.id).select().single();
      if (error) throw error;

      await removeAutoTransaction("escort_billing", req.params.id);
      await removeAutoTransaction("service_order", String(billing.service_order_id));
      if (billing.service_order_id) {
        await supabaseAdmin.from("service_orders").update({ status: "em_andamento" }).eq("id", billing.service_order_id);
      }
      await logSystemAudit({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "REABRIR_MISSAO", targetId: req.params.id, targetType: "escort_billing",
        details: `OS #${billing.service_order_id} reaberta. Cliente: ${billing.client_name}`,
        ipAddress: req.ip,
      });

      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/escort/billings/:id/liberar-faturamento", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const user = req.user!;
      const { data: billing, error: fetchErr } = await supabaseAdmin.from("escort_billings").select("*").eq("id", req.params.id).single();
      if (fetchErr || !billing) return res.status(404).json({ message: "Registro não encontrado" });
      const st = String(billing.status || "").toUpperCase();
      if (st !== "FATURADO" && st !== "FATURADA" && st !== "PAGO") {
        return res.status(400).json({ message: "Somente notas com status 'Faturado' ou 'Pago' podem ser liberadas" });
      }

      const previousStatus = billing.status;
      const { data, error } = await supabaseAdmin.from("escort_billings").update({
        status: "APROVADA",
        invoice_id: null,
        boletim_gerado: false,
      }).eq("id", req.params.id).select().single();
      if (error) throw error;

      await removeAutoTransaction("escort_billing", req.params.id);
      await removeAutoTransaction("service_order", String(billing.service_order_id));

      if (billing.service_order_id) {
        await supabaseAdmin.from("service_orders").update({ status: "concluida" }).eq("id", billing.service_order_id);
      }

      await logSystemAudit({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "LIBERAR_REFATURAMENTO", targetId: req.params.id, targetType: "escort_billing",
        details: `OS #${billing.service_order_id} liberada para refaturamento (APROVADA). Status anterior: ${previousStatus}. Cliente: ${billing.client_name}`,
        ipAddress: req.ip,
      });

      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/escort/billings/:id/zerar-fat-total", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const user = req.user!;
      const { data: billing, error: fetchErr } = await supabaseAdmin.from("escort_billings").select("id,status,fat_total,client_name,service_order_id").eq("id", req.params.id).single();
      if (fetchErr || !billing) return res.status(404).json({ message: "Registro não encontrado" });
      const st = String(billing.status || "").toUpperCase();
      if (st === "FATURADO" || st === "FATURADA" || st === "PAGO") {
        return res.status(400).json({ message: "Não é possível zerar fat_total de OS já faturada/paga. Libere o refaturamento primeiro." });
      }
      const valorAnterior = Number(billing.fat_total || 0);
      const { error } = await supabaseAdmin.from("escort_billings").update({ fat_total: 0 }).eq("id", req.params.id);
      if (error) throw error;
      await logSystemAudit({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "ZERAR_FAT_TOTAL", targetId: req.params.id, targetType: "escort_billing",
        details: `OS #${billing.service_order_id} (${billing.client_name}) — fat_total zerado (anterior: R$${valorAnterior.toFixed(2)}). Próxima geração de fatura usará a soma dos componentes.`,
        ipAddress: req.ip,
      });
      res.json({ ok: true, valorAnterior });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/escort/billings/pendentes", requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("escort_billings").select("*").eq("status", "A_VERIFICAR").order("created_at", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/system-audit-logs", requireAdminRole, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 200, 1000);
      const offset = Number(req.query.offset) || 0;
      const action = req.query.action as string | undefined;
      const userName = req.query.user_name as string | undefined;

      let query = supabaseAdmin
        .from("system_audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (action) query = query.ilike("action", `%${action}%`);
      if (userName) query = query.ilike("user_name", `%${userName}%`);

      const { data, error, count } = await query;
      if (error) throw error;
      res.json({ logs: data || [], total: count || 0 });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/billing-alerts", requireAdminRole, async (req, res) => {
    try {
      const resolved = req.query.resolved === "true";
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const { data, error } = await supabaseAdmin
        .from("billing_alerts")
        .select("*")
        .eq("resolved", resolved)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const filtered = (data || []).filter((a: any) => {
        if (a.alert_type === "OS_ESQUECIDA") {
          const os = String(a.os_numbers || "").trim();
          if (!os || os.toLowerCase() === "null") return false;
        }
        return true;
      });
      res.json(filtered);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/billing-alerts/:id/resolve", requireAdminRole, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userName = req.user?.name || req.user?.username || "admin";
      const { data, error } = await supabaseAdmin
        .from("billing_alerts")
        .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: userName })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/escort/routes", requireAuth, async (req, res) => {
    try {
      const { client_id } = req.query;
      let query = supabaseAdmin.from("escort_routes").select("*").order("name");
      if (client_id) query = query.eq("client_id", client_id);
      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/escort/routes", requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("escort_routes").insert(req.body).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/escort/routes/:id", requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("escort_routes").update(req.body).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/escort/routes/:id", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("escort_routes").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Gerar Boletim de Missão
  app.post("/api/escort/billings/:id/gerar-boletim", requireAdminRole, async (req, res) => {
    try {
      const { data: billing, error: fetchErr } = await supabaseAdmin.from("escort_billings").select("*").eq("id", req.params.id).single();
      if (fetchErr || !billing) return res.status(404).json({ message: "Faturamento não encontrado" });

      if (billing.boletim_gerado) return res.json({ ...billing, message: "Boletim já gerado anteriormente" });

      const now = new Date();
      const boletimNumero = `BO-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}-${String(billing.id).slice(-4).toUpperCase()}`;

      const { data, error } = await supabaseAdmin.from("escort_billings")
        .update({ boletim_numero: boletimNumero, boletim_gerado: true })
        .eq("id", req.params.id).select().single();
      if (error) throw error;

      res.json(data);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/financial/dashboard", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { data: billingsRaw, error: bErr } = await supabaseAdmin.from("escort_billings").select("*").order("data_missao", { ascending: true });
      if (bErr) throw bErr;
      const billingDedup = new Map<number, any>();
      for (const b of (billingsRaw || [])) {
        const soId = Number(b.service_order_id);
        if (!soId) continue;
        const existing = billingDedup.get(soId);
        if (!existing || new Date(b.created_at || 0) > new Date(existing.created_at || 0)) {
          billingDedup.set(soId, b);
        }
      }
      const billings = Array.from(billingDedup.values());

      // Pagina pra superar o limite default de 1000 do Supabase REST
      const transactions: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      while (true) {
        const { data: page, error: tErr } = await supabaseAdmin
          .from("financial_transactions")
          .select("*")
          .order("due_date", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (tErr) throw tErr;
        if (!page || page.length === 0) break;
        transactions.push(...page);
        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      const { data: vehicles } = await supabaseAdmin.from("vehicles").select("id, plate, model");
      const { data: employees } = await supabaseAdmin.from("employees").select("id, name");

      const allTimesheets = await storage.getTimesheets();

      const txns = transactions || [];

      const allOrders = await storage.getServiceOrders();
      const todayBRT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

      const extractDatePart = (v: string | null | undefined): string | null => {
        if (!v) return null;
        const s = String(v);
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        if (s.includes("T")) return s.split("T")[0];
        try { return new Date(s).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }
        catch { return null; }
      };

      const missionStartBRT = (so: any): string | null => {
        if (so.missionStartedAt) {
          const s = String(so.missionStartedAt);
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
          try { return new Date(s).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); } catch { return null; }
        }
        return null;
      };

      const todayEscoltaOs = allOrders.filter((so: any) => {
        if (so.type !== "escolta" || so.missionStatus === "aguardando") return false;
        if (so.status === "recusada") return false;
        const startBRT = missionStartBRT(so);
        if (so.status === "em_andamento") return true;
        const isConcluded = so.status === "concluida" || so.status === "concluída" ||
          so.missionStatus === "encerrada" || so.missionStatus === "finalizada";
        if (isConcluded) {
          const sdBRT = extractDatePart(so.scheduledDate);
          const cdBRT = so.completedDate ? new Date(so.completedDate).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : null;
          return startBRT === todayBRT || sdBRT === todayBRT || cdBRT === todayBRT;
        }
        if (so.status === "agendada") {
          const sdBRT = extractDatePart(so.scheduledDate);
          return startBRT === todayBRT || sdBRT === todayBRT;
        }
        return false;
      });
      const todayOsIds = new Set(todayEscoltaOs.map((so: any) => so.id));

      const recusadaOsIds = new Set(allOrders.filter((so: any) => so.status === "recusada" || so.status === "cancelada").map((so: any) => so.id));
      const items = (billings || []).filter((b: any) => !todayOsIds.has(b.service_order_id) && !recusadaOsIds.has(b.service_order_id));

      for (const so of todayEscoltaOs) {
        try {
          const nb = (v: any) => Number(v) || 0;

          let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };
          if (so.escortContractId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", so.escortContractId).limit(1);
            if (cc?.length) contrato = cc[0];
          } else if (so.clientId) {
            const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.clientId).eq("status", "Ativo").limit(1);
            if (cc?.length) contrato = cc[0];
          }
          const photos = await storage.getMissionPhotosByOS(so.id);
          const kmChegadaP = photos.find((p: any) => p.step === "km_chegada");
          const kmSaidaP = photos.find((p: any) => p.step === "km_saida");
          const kmFinalP = photos.find((p: any) => p.step === "km_final");
          const kmInicial = nb(kmChegadaP?.kmValue) || nb(kmSaidaP?.kmValue);
          const kmAtual = nb(kmFinalP?.kmValue || kmInicial);

          const missionNotStartedYetEsc2 = !so.missionStatus || so.missionStatus === "aguardando";
          const horasMissao = missionNotStartedYetEsc2 ? 0 : await getHorasElapsedFromDB(so.id);

          const kmTextoEsc2 = extractKmFromText(so.destination) || extractKmFromText(so.route);
          let kmRotaEsc2: number | undefined;
          if (kmTextoEsc2) {
            kmRotaEsc2 = kmTextoEsc2;
          } else if (so.originLat && so.originLng && so.destinationLat && so.destinationLng) {
            const hvKm = haversineDist(Number(so.originLat), Number(so.originLng), Number(so.destinationLat), Number(so.destinationLng)) / 1000;
            kmRotaEsc2 = Math.round(hvKm * 1.4);
            if (so.pedagioIdaVolta) kmRotaEsc2 *= 2;
          }

          const billing = calcularFaturamentoLive({
            horasMissao,
            kmInicial,
            kmFinal: kmAtual,
            contrato,
            kmRota: kmRotaEsc2,
          });

          let despesas_pedagio = 0, despesas_combustivel = 0, despesas_outras = 0;
          let receitasOs = 0;
          try {
            const osMC = await storage.getMissionCostsByOS(so.id);
            const _splitE2 = splitMissionCostsForBilling(osMC);
            despesas_pedagio = _splitE2.despesas_pedagio;
            despesas_combustivel = _splitE2.despesas_combustivel;
            despesas_outras = _splitE2.despesas_outras;
            receitasOs = _splitE2.receitas_os;
            const pedEstimado = Number((so as any).pedagioEstimado) || 0;
            if (pedEstimado > 0 && despesas_pedagio === 0) despesas_pedagio = pedEstimado;
          } catch (_e) {}

          const fat_total = billing.fat_total + despesas_pedagio + receitasOs;
          const r = (v: number) => Math.round(v * 100) / 100;
          const client = so.clientId ? await storage.getClient(so.clientId) : null;
          const emp = so.assignedEmployeeId ? await storage.getEmployee(so.assignedEmployeeId) : null;
          const emp2 = so.assignedEmployee2Id ? await storage.getEmployee(so.assignedEmployee2Id) : null;
          const vehicle = so.vehicleId ? await storage.getVehicle(so.vehicleId) : null;
          const dataMissaoCalc = (() => {
              const a = so.missionStartedAt ? new Date(so.missionStartedAt).getTime() : Infinity;
              const b = so.scheduledDate ? new Date(so.scheduledDate).getTime() : Infinity;
              if (a === Infinity && b === Infinity) return so.createdAt || new Date().toISOString();
              return a <= b ? so.missionStartedAt : so.scheduledDate;
            })();

          const isConcluded = so.status === "concluida" || so.status === "concluída" ||
            so.missionStatus === "encerrada" || so.missionStatus === "finalizada";
          const lucroLiqCalc = r(fat_total - nb(contrato.vrp_base));

          const bancoHoras = (() => {
            if (!so.missionStartedAt || !so.completedDate) return null;
            const inicio = new Date(so.missionStartedAt).getTime();
            const fim = new Date(so.completedDate).getTime();
            if (isNaN(inicio) || isNaN(fim) || fim <= inicio) return null;
            const horasTrab = (fim - inicio) / (1000 * 60 * 60);
            const limiteDia = 8;
            return { horas_trabalhadas: r(horasTrab), limite: limiteDia, saldo: r(horasTrab - limiteDia) };
          })();

          items.push({
            id: `calc-${so.id}`, service_order_id: so.id,
            client_id: so.clientId, client_name: client?.name || "--",
            contract_id: contrato.id || null,
            km_inicial: kmInicial, km_final: kmAtual, km_vazio: 0,
            km_carregado: r(billing.km_total), km_total: r(billing.km_total),
            km_faturado: r(Math.max(billing.km_total, billing.franquia_km)), km_franquia: r(billing.franquia_km),
            km_excedente: r(billing.km_excedente),
            horas_missao: r(horasMissao), horas_trabalhadas: r(horasMissao),
            fat_acionamento: billing.fat_acionamento, fat_km: billing.fat_km, fat_hora_extra: billing.fat_hora_extra, fat_total: r(fat_total),
            receitas_os: r(receitasOs),
            pag_vrp: r(nb(contrato.vrp_base)), pag_total: r(nb(contrato.vrp_base)),
            resultado_bruto: r(fat_total - nb(contrato.vrp_base)),
            resultado_liquido: lucroLiqCalc,
            vigilante_id: so.assignedEmployeeId, vigilante_name: emp?.name || "--",
            vigilante2_id: so.assignedEmployee2Id || null, vigilante2_name: emp2?.name || null,
            origem: so.origin || null, destino: so.destination || null,
            placa_viatura: vehicle?.plate || null,
            data_missao: dataMissaoCalc,
            created_at_date: extractDatePart(so.createdAt),
            scheduled_date_brt: extractDatePart(so.scheduledDate),
            completed_date_brt: so.completedDate ? extractDatePart(so.completedDate) : null,
            is_concluded: isConcluded,
            banco_horas: bancoHoras,
            status: "A_VERIFICAR",
            despesas_pedagio: r(despesas_pedagio), despesas_combustivel: r(despesas_combustivel), despesas_outras: r(despesas_outras),
          });
        } catch (err: any) {
          console.error(`[dashboard] calc billing for OS ${so.osNumber}: ${err.message}`);
        }
      }

      const incomeTotal = txns.filter((t: any) => t.type === "INCOME").reduce((a: number, t: any) => a + Number(t.amount || 0), 0);
      const incomePaid = txns.filter((t: any) => t.type === "INCOME" && t.status === "PAID").reduce((a: number, t: any) => a + Number(t.amount || 0), 0);
      const expenseTotal = txns.filter((t: any) => t.type === "EXPENSE").reduce((a: number, t: any) => a + Number(t.amount || 0), 0);
      const expensePaid = txns.filter((t: any) => t.type === "EXPENSE" && t.status === "PAID").reduce((a: number, t: any) => a + Number(t.amount || 0), 0);
      const escortIncome = txns.filter((t: any) => t.origin_type === "escort_billing").reduce((a: number, t: any) => a + Number(t.amount || 0), 0);
      const fuelingExpense = txns.filter((t: any) => t.origin_type === "fueling").reduce((a: number, t: any) => a + Number(t.amount || 0), 0);
      const maintenanceExpense = txns.filter((t: any) => t.origin_type === "maintenance").reduce((a: number, t: any) => a + Number(t.amount || 0), 0);
      const missionCostExpense = txns.filter((t: any) => t.origin_type === "mission_cost").reduce((a: number, t: any) => a + Number(t.amount || 0), 0);

      const safeDateKey = (v: string | null | undefined): string | null => {
        if (!v) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        try { return new Date(v).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }
        catch { return v.split("T")[0] || null; }
      };

      const revenueByDay: Record<string, number> = {};
      txns.filter((t: any) => t.type === "INCOME").forEach((t: any) => {
        const d = safeDateKey(t.due_date);
        if (!d) return;
        revenueByDay[d] = (revenueByDay[d] || 0) + Number(t.amount || 0);
      });

      const expensesByDay: Record<string, number> = {};
      txns.filter((t: any) => t.type === "EXPENSE").forEach((t: any) => {
        const d = safeDateKey(t.due_date);
        if (!d) return;
        expensesByDay[d] = (expensesByDay[d] || 0) + Number(t.amount || 0);
      });

      const toBRTDate = (v: string) => {
        if (!v) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        try {
          return new Date(v).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        } catch { return v?.split("T")[0] || null; }
      };

      const missionsByDay: Record<string, any[]> = {};
      items.forEach((b: any) => {
        const d = b.data_missao || (b.created_at ? toBRTDate(b.created_at) : null);
        if (!d) return;
        if (!missionsByDay[d]) missionsByDay[d] = [];
        missionsByDay[d].push(b);
      });

      const { data: invoicesForCancel } = await supabaseAdmin
        .from("invoices")
        .select("id, service_order_id, nfse_status, status");
      const isNfCancelled = (s: string | null | undefined) =>
        !!s && /CANCEL/i.test(String(s));
      const cancelledInvoiceIds = new Set<number>();
      const cancelledNfSoIds = new Set<number>();
      for (const inv of (invoicesForCancel || [])) {
        if (!isNfCancelled(inv.nfse_status) && !isNfCancelled(inv.status)) continue;
        cancelledInvoiceIds.add(Number(inv.id));
        if (inv.service_order_id) cancelledNfSoIds.add(Number(inv.service_order_id));
      }
      // billings vinculados (via invoice_id) a NFs canceladas — também devem zerar
      if (cancelledInvoiceIds.size > 0) {
        const { data: billingsLinked } = await supabaseAdmin
          .from("escort_billings")
          .select("service_order_id, invoice_id")
          .in("invoice_id", Array.from(cancelledInvoiceIds));
        for (const b of (billingsLinked || [])) {
          if (b.service_order_id) cancelledNfSoIds.add(Number(b.service_order_id));
        }
      }

      const calcFat = (b: any) => {
        if (b?.service_order_id && cancelledNfSoIds.has(Number(b.service_order_id))) return 0;
        return Number(b.fat_acionamento || 0) + Number(b.fat_hora_extra || 0) + Number(b.fat_km || 0) + Number(b.fat_adicional_noturno || 0) + Number(b.despesas_pedagio || 0) + Number(b.despesas_outras || 0) + Number(b.fat_estadia || 0) + Number(b.fat_pernoite || 0);
      };

      // FIX #5 — OS cancelada não pode arrastar despesas para o agregado por viatura/agente,
      // senão gera prejuízo artificial. Quando NF cancelada, zera tudo (receita + despesa) daquele billing.
      const calcDesp = (b: any) => {
        if (b?.service_order_id && cancelledNfSoIds.has(Number(b.service_order_id))) return 0;
        return Number(b.despesas_pedagio || 0) + Number(b.despesas_combustivel || 0) + Number(b.despesas_outras || 0);
      };
      const isCancelledBilling = (b: any) =>
        b?.service_order_id && cancelledNfSoIds.has(Number(b.service_order_id));

      const osLookup = new Map(allOrders.map((so: any) => [so.id, so]));

      for (const b of items) {
        if (Number(b.despesas_pedagio || 0) === 0 && Number(b.despesas_combustivel || 0) === 0 && Number(b.despesas_outras || 0) === 0 && b.service_order_id) {
          try {
            const osMC = await storage.getMissionCostsByOS(b.service_order_id);
            const _splitL = splitMissionCostsForBilling(osMC);
            if (_splitL.despesas_pedagio > 0) b.despesas_pedagio = (Number(b.despesas_pedagio) || 0) + _splitL.despesas_pedagio;
            if (_splitL.despesas_combustivel > 0) b.despesas_combustivel = (Number(b.despesas_combustivel) || 0) + _splitL.despesas_combustivel;
            if (_splitL.despesas_outras > 0) b.despesas_outras = (Number(b.despesas_outras) || 0) + _splitL.despesas_outras;
            if (_splitL.receitas_os > 0 && !b.receitas_os) b.receitas_os = _splitL.receitas_os;
            if ((Number(b.despesas_pedagio) || 0) === 0) {
              const soData = osLookup.get(b.service_order_id);
              const pedEst = Number(soData?.pedagioEstimado) || 0;
              if (pedEst > 0) b.despesas_pedagio = pedEst;
            }
          } catch (_e) {}
        }
      }

      // FIX #16 + #5: combustível só atribuído à PRIMEIRA missão da placa/dia, e nunca a missão cancelada
      const fuelAllocatedVehicleDay = new Set<string>();
      for (const b of items) {
        // Missão cancelada: zera combustível atribuído (despesa real fica em vehicle_fueling, não no billing)
        if (isCancelledBilling(b)) {
          b.despesas_combustivel = 0;
          continue;
        }
        const plate = (b.placa_viatura || "").toUpperCase();
        const day = toBRTDate(b.data_missao || b.created_at || "");
        if (!plate || !day) continue;
        const key = `${plate}:${day}`;
        const comb = Number(b.despesas_combustivel || 0);
        if (comb > 0) {
          if (fuelAllocatedVehicleDay.has(key)) {
            b.despesas_combustivel = 0;
          } else {
            fuelAllocatedVehicleDay.add(key);
          }
        }
      }

      const byVehicle: Record<string, { plate: string; model: string; fat_total: number; pag_total: number; missions: number; despesas: number }> = {};
      items.forEach((b: any) => {
        const plate = b.placa_viatura || "SEM PLACA";
        if (!byVehicle[plate]) {
          const v = (vehicles || []).find((v: any) => v.plate === plate);
          byVehicle[plate] = { plate, model: v?.model || "", fat_total: 0, pag_total: 0, missions: 0, despesas: 0 };
        }
        byVehicle[plate].fat_total += calcFat(b);
        // Pagamento ao vigilante e contagem de missão acontecem mesmo em cancelada (tem que pagar o cara que foi)
        byVehicle[plate].pag_total += Number(b.pag_total || 0);
        byVehicle[plate].missions += 1;
        // Mas despesa atribuída à OS zera quando cancelada (FIX #5)
        byVehicle[plate].despesas += calcDesp(b);
      });

      const timesheetHoursByEmployee: Record<number, number> = {};
      allTimesheets.forEach((ts: any) => {
        const empId = ts.employeeId;
        if (!empId) return;
        let hours = 0;
        if (ts.hoursWorked != null && Number(ts.hoursWorked) > 0) {
          hours = Number(ts.hoursWorked);
        } else if (ts.checkIn && ts.checkOut) {
          const parseTime = (t: string) => { const [h, m] = t.split(":").map(Number); return h + (m || 0) / 60; };
          let worked = parseTime(ts.checkOut) - parseTime(ts.checkIn);
          if (ts.checkOutLunch && ts.checkInLunch) {
            worked -= (parseTime(ts.checkInLunch) - parseTime(ts.checkOutLunch));
          }
          if (worked > 0) hours = worked;
        }
        timesheetHoursByEmployee[empId] = (timesheetHoursByEmployee[empId] || 0) + hours;
      });

      const byAgent: Record<string, { id: number; name: string; fat_total: number; pag_total: number; missions: number; horas_trabalhadas: number }> = {};
      items.forEach((b: any) => {
        const name = b.vigilante_name || "SEM AGENTE";
        const id = b.vigilante_id || 0;
        const key = String(id || name);
        if (!byAgent[key]) byAgent[key] = { id, name, fat_total: 0, pag_total: 0, missions: 0, horas_trabalhadas: 0 };
        byAgent[key].fat_total += calcFat(b);
        byAgent[key].pag_total += Number(b.pag_total || 0);
        byAgent[key].missions += 1;

        if (b.vigilante2_id && b.vigilante2_name) {
          const key2 = String(b.vigilante2_id);
          if (!byAgent[key2]) byAgent[key2] = { id: b.vigilante2_id, name: b.vigilante2_name, fat_total: 0, pag_total: 0, missions: 0, horas_trabalhadas: 0 };
          byAgent[key2].fat_total += calcFat(b);
          byAgent[key2].pag_total += Number(b.pag_total || 0);
          byAgent[key2].missions += 1;
        }
      });

      Object.values(byAgent).forEach((agent) => {
        agent.horas_trabalhadas = timesheetHoursByEmployee[agent.id] || 0;
      });

      const byMission = items.map((b: any) => {
        const fat = calcFat(b);
        // FIX #5: missão cancelada zera receita E despesas (lucro=0 em vez de prejuízo artificial)
        const desp = calcDesp(b);
        const pag = Number(b.pag_total || 0);
        const lucro = fat - pag - desp;
        const so = osLookup.get(b.service_order_id);

        const soCreatedAt = so?.createdAt || b.created_at;
        const soScheduledDate = so?.scheduledDate || b.scheduled_date;
        const soCompletedDate = so?.completedDate || b.completed_date;
        const soMissionStartedAt = so?.missionStartedAt || b.mission_started_at;

        const createdDateBRT = toBRTDate(soCreatedAt || new Date().toISOString());
        const scheduledDateBRT = toBRTDate(soScheduledDate || soCreatedAt || new Date().toISOString());
        const completedDateBRT = soCompletedDate ? toBRTDate(soCompletedDate) : null;

        const isConcludedFinal = b.is_concluded || (so && (
          so.status === "concluida" || so.status === "concluída" ||
          so.missionStatus === "encerrada" || so.missionStatus === "finalizada"
        ));

        let bancoHorasFinal = b.banco_horas || null;
        if (!bancoHorasFinal && soMissionStartedAt && soCompletedDate) {
          const inicio = new Date(soMissionStartedAt).getTime();
          const fim = new Date(soCompletedDate).getTime();
          if (!isNaN(inicio) && !isNaN(fim) && fim > inicio) {
            const ht = (fim - inicio) / (1000 * 60 * 60);
            bancoHorasFinal = { horas_trabalhadas: Math.round(ht * 100) / 100, limite: 8, saldo: Math.round((ht - 8) * 100) / 100 };
          }
        }

        return {
        id: b.id,
        service_order_id: b.service_order_id || so?.id || null,
        os_number: so?.osNumber || b.os_number || null,
        data: toBRTDate(b.data_missao || b.created_at || new Date().toISOString()),
        created_at_date: b.created_at_date || createdDateBRT,
        scheduled_date_brt: b.scheduled_date_brt || scheduledDateBRT,
        completed_date_brt: b.completed_date_brt || completedDateBRT,
        is_concluded: isConcludedFinal,
        banco_horas: bancoHorasFinal,
        origem: b.origem,
        destino: b.destino,
        placa_viatura: b.placa_viatura,
        vigilante: b.vigilante_name,
        vigilante_id: b.vigilante_id || 0,
        vigilante2: b.vigilante2_name || null,
        vigilante2_id: b.vigilante2_id || null,
        fat_total: fat,
        fat_acionamento: Number(b.fat_acionamento || 0),
        fat_hora_extra: Number(b.fat_hora_extra || 0),
        fat_km: Number(b.fat_km || 0),
        fat_adicional_noturno: Number(b.fat_adicional_noturno || 0),
        fat_estadia: Number(b.fat_estadia || 0),
        fat_pernoite: Number(b.fat_pernoite || 0),
        pag_total: pag,
        pag_vrp: Number(b.pag_vrp || 0),
        despesas: desp,
        despesas_pedagio: Number(b.despesas_pedagio || 0),
        despesas_combustivel: Number(b.despesas_combustivel || 0),
        lucro,
        margem: fat > 0 ? Math.round((lucro / fat) * 10000) / 100 : 0,
        km_total: Number(b.km_total || 0),
        km_carregado: Number(b.km_carregado || 0),
        km_franquia: Number(b.km_franquia || 0),
        km_excedente: Number(b.km_excedente || 0),
        horas_trabalhadas: Number(b.horas_trabalhadas || 0),
        horas_missao: Number(b.horas_missao || 0),
        boletim: b.boletim_numero,
        status: b.status,
        client_name: b.client_name,
        observacoes: b.observacoes || null,
      };
      });

      const expenseTransactions = txns
        .filter((t: any) => t.type === "EXPENSE")
        .map((t: any) => ({
          id: t.id,
          date: t.due_date?.split("T")[0] || t.created_at?.split("T")[0],
          amount: Number(t.amount || 0),
          origin_type: t.origin_type || "other",
          description: t.description || "",
          entity_name: t.entity_name || "",
          category_name: t.category_name || "",
          status: t.status,
        }));

      const timesheetsByAgent = allTimesheets.map((ts: any) => ({
        employeeId: ts.employeeId,
        date: ts.date,
        hoursWorked: (() => {
          if (ts.hoursWorked != null && Number(ts.hoursWorked) > 0) return Number(ts.hoursWorked);
          if (ts.checkIn && ts.checkOut) {
            const parseT = (t: string) => { const [h, m] = t.split(":").map(Number); return h + (m || 0) / 60; };
            let w = parseT(ts.checkOut) - parseT(ts.checkIn);
            if (ts.checkOutLunch && ts.checkInLunch) w -= (parseT(ts.checkInLunch) - parseT(ts.checkOutLunch));
            return w > 0 ? Math.round(w * 100) / 100 : 0;
          }
          return 0;
        })(),
      }));

      const { data: allFueling, error: fuelingErr } = await supabaseAdmin
        .from("vehicle_fueling")
        .select("id, vehicle_id, driver_id, date, liters, total_cost, km");
      if (fuelingErr) console.error("[dashboard] vehicle_fueling query error:", fuelingErr.message);
      const fuelingByAgent: { driverId: number; date: string; totalCost: number; liters: number; vehicleId: number; km: number }[] = (allFueling || []).map((f: any) => ({
        driverId: f.driver_id || 0,
        date: typeof f.date === "string" ? f.date.slice(0, 10) : "",
        totalCost: Number(f.total_cost || 0),
        liters: Number(f.liters || 0),
        vehicleId: f.vehicle_id,
        km: Number(f.km || 0),
      }));

      const { data: missionCostsRaw } = await supabaseAdmin.from("mission_costs").select("*");
      const missionCostsByAgent: { agentId: number; date: string; amount: number; category: string; serviceOrderId: number }[] = (missionCostsRaw || []).map((mc: any) => ({
        agentId: mc.agent_id || 0, date: mc.date || mc.created_at?.split("T")[0] || "", amount: Number(mc.amount || 0), category: mc.category || "", serviceOrderId: mc.service_order_id || 0,
      }));

      const kmByVehicle: Record<string, number> = {};
      items.forEach((b: any) => {
        const plate = b.placa_viatura || "SEM PLACA";
        kmByVehicle[plate] = (kmByVehicle[plate] || 0) + Number(b.km_total || 0);
      });

      const volumeVendasByDay: Record<string, { count: number; fat_total: number }> = {};
      const custoOperacionalByDay: Record<string, { count: number; pag_total: number }> = {};
      const lucroRealizadoByDay: Record<string, { count: number; lucro: number }> = {};
      const bancoHorasByAgent: Record<number, { name: string; saldo_total: number; missoes: number }> = {};

      byMission.forEach((m: any) => {
        if (m.created_at_date) {
          if (!volumeVendasByDay[m.created_at_date]) volumeVendasByDay[m.created_at_date] = { count: 0, fat_total: 0 };
          volumeVendasByDay[m.created_at_date].count += 1;
          volumeVendasByDay[m.created_at_date].fat_total += m.fat_total;
        }

        const schedKey = m.scheduled_date_brt || m.data;
        if (schedKey) {
          if (!custoOperacionalByDay[schedKey]) custoOperacionalByDay[schedKey] = { count: 0, pag_total: 0 };
          custoOperacionalByDay[schedKey].count += 1;
          custoOperacionalByDay[schedKey].pag_total += m.pag_total;
        }

        if (m.is_concluded && m.completed_date_brt) {
          if (!lucroRealizadoByDay[m.completed_date_brt]) lucroRealizadoByDay[m.completed_date_brt] = { count: 0, lucro: 0 };
          lucroRealizadoByDay[m.completed_date_brt].count += 1;
          lucroRealizadoByDay[m.completed_date_brt].lucro += m.lucro;
        }

        if (m.banco_horas && m.vigilante_id) {
          if (!bancoHorasByAgent[m.vigilante_id]) bancoHorasByAgent[m.vigilante_id] = { name: m.vigilante || "--", saldo_total: 0, missoes: 0 };
          bancoHorasByAgent[m.vigilante_id].saldo_total += m.banco_horas.saldo;
          bancoHorasByAgent[m.vigilante_id].missoes += 1;
        }
      });

      res.json({
        billings: items,
        missionsByDay,
        revenueByDay,
        expensesByDay,
        expenseTransactions,
        timesheetsByAgent,
        fuelingByAgent,
        missionCostsByAgent,
        kmByVehicle,
        byVehicle: Object.values(byVehicle),
        byAgent: Object.values(byAgent),
        byMission,
        vehicles: vehicles || [],
        employees: employees || [],
        tripartite: {
          volumeVendasByDay,
          custoOperacionalByDay,
          lucroRealizadoByDay,
        },
        bancoHoras: Object.entries(bancoHorasByAgent).map(([id, v]) => ({
          agentId: Number(id), name: v.name, saldo_total: Math.round(v.saldo_total * 100) / 100, missoes: v.missoes,
        })),
        totals: {
          faturamento: incomeTotal,
          faturamento_realizado: incomePaid,
          custos_operacionais: expenseTotal,
          custos_realizados: expensePaid,
          saldo_previsto: incomeTotal - expenseTotal,
          saldo_realizado: incomePaid - expensePaid,
          escort_income: escortIncome,
          fueling_expense: fuelingExpense,
          maintenance_expense: maintenanceExpense,
          mission_cost_expense: missionCostExpense,
          despesas_gerais: expensePaid,
          receitas_gerais: incomePaid,
          total_missoes: items.length,
          total_km: items.reduce((a: number, b: any) => a + Number(b.km_total || 0), 0),
        },
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/service-contracts/:id/pdf", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const PDFDocument = (await import("pdfkit")).default;
      const { data: sc, error } = await supabaseAdmin.from("service_contracts").select("*").eq("id", req.params.id).single();
      if (error || !sc) return res.status(404).json({ message: "Contrato não encontrado" });

      const { data: priceTable } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", sc.client_id).eq("status", "ativo").maybeSingle();

      const doc = new PDFDocument({ size: "A4", margins: { top: 60, bottom: 60, left: 65, right: 65 }, autoFirstPage: false });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename=MINUTA_${sc.contract_number || sc.id.slice(0, 8)}.pdf`);
      doc.pipe(res);

      const fs = await import("fs");
      const path = await import("path");
      const W = 465;
      const LM = 65;
      const BRAND = "#111111";
      const BRAND_ACCENT = "#1a1a1a";
      const DARK = "#111111";
      const GRAY = "#333333";
      const LIGHT = "#777777";
      const ACCENT_LINE = "#222222";
      let y = 55;

      let logoBuffer: Buffer | null = null;
      try {
        const sharp = (await import("sharp")).default;
        const logoSrc = path.resolve("attached_assets/WhatsApp_Image_2026-03-19_at_18.44.30_1774457182066.jpeg");
        if (fs.existsSync(logoSrc)) {
          logoBuffer = await sharp(logoSrc)
            .resize({ height: 120 })
            .negate({ alpha: false })
            .flatten({ background: { r: 17, g: 17, b: 17 } })
            .png()
            .toBuffer();
        }
      } catch {}

      const HEADER_H = 46;
      const FOOTER_H = 30;
      const CONTENT_TOP = HEADER_H + 16;
      const CONTENT_BOTTOM = 795 - FOOTER_H - 20;

      let currentPage = 0;

      const startNewPage = () => {
        doc.addPage({ size: "A4", margins: { top: 60, bottom: 60, left: 65, right: 65 } });
        currentPage++;
        doc.save().rect(0, 0, 595.28, HEADER_H).fill(BRAND).restore();
        const hasLogo = !!logoBuffer;
        if (hasLogo) { try { doc.image(logoBuffer!, LM + 4, 6, { height: 34 }); } catch {} }
        const textX = hasLogo ? LM + 40 : LM;
        const textW = hasLogo ? W - 40 : W;
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
          .text("TORRES VIGILÂNCIA PATRIMONIAL", textX, 12, { width: textW, lineBreak: false });
        doc.font("Helvetica").fontSize(6.5).fillColor("#aaaaaa")
          .text("CNPJ: 36.982.392/0001-89", textX, 24, { width: textW, lineBreak: false });
        const fY = 795 - FOOTER_H;
        doc.save().rect(0, fY, 595.28, FOOTER_H + 10).fill(BRAND).restore();
        doc.font("Helvetica").fontSize(6).fillColor("#cccccc")
          .text("www.torresseguranca.com.br  •  @grupotorres.seguranca  •  (11) 96369-6699  •  escolta@torresseguranca.com.br", LM, fY + 8, { width: W, align: "center", lineBreak: false });
        y = CONTENT_TOP;
      };

      startNewPage();

      const checkPage = (need = 80) => { if (y > CONTENT_BOTTOM - need) { startNewPage(); } };
      const hLine = (yy: number) => { doc.save().moveTo(LM, yy).lineTo(LM + W, yy).lineWidth(0.6).strokeColor(ACCENT_LINE).stroke().restore(); };
      const thinLine = (yy: number) => { doc.save().moveTo(LM, yy).lineTo(LM + W, yy).lineWidth(0.3).strokeColor("#dddddd").stroke().restore(); };

      const safeText = (text: string, x: number, yPos: number, opts: any = {}) => {
        const font = opts.font || "Helvetica";
        const size = opts.size || 9;
        const color = opts.color || GRAY;
        const width = opts.width || W;
        const lineGap = opts.lineGap ?? 3;
        const align = opts.align || "justify";

        doc.font(font).fontSize(size);
        const totalH = doc.heightOfString(text, { width, lineGap });
        const availH = CONTENT_BOTTOM - yPos;

        if (totalH <= availH + 2) {
          doc.fillColor(color).text(text, x, yPos, { width, lineGap, align, lineBreak: true });
          return yPos + totalH;
        }

        const words = text.split(" ");
        let chunk = "";
        let curY = yPos;

        for (let i = 0; i < words.length; i++) {
          const test = chunk ? chunk + " " + words[i] : words[i];
          doc.font(font).fontSize(size);
          const testH = doc.heightOfString(test, { width, lineGap });
          const remain = CONTENT_BOTTOM - curY;

          if (testH > remain && chunk) {
            doc.font(font).fontSize(size).fillColor(color)
              .text(chunk, x, curY, { width, lineGap, align, lineBreak: true });
            startNewPage();
            curY = y;
            chunk = words[i];
          } else {
            chunk = test;
          }
        }
        if (chunk) {
          doc.font(font).fontSize(size).fillColor(color)
            .text(chunk, x, curY, { width, lineGap, align, lineBreak: true });
          doc.font(font).fontSize(size);
          curY += doc.heightOfString(chunk, { width, lineGap });
        }
        return curY;
      };

      const writeText = (text: string, opts: any = {}) => {
        doc.font(opts.font || "Helvetica").fontSize(opts.size || 9);
        const h = doc.heightOfString(text, { width: W, lineGap: 3 });
        const gap = opts.gap || 8;
        if (h + gap <= CONTENT_BOTTOM - y) {
          doc.fillColor(opts.color || GRAY)
            .text(text, LM, y, { width: W, lineGap: 3, align: opts.align || "justify", lineBreak: true });
          y += h + gap;
        } else {
          checkPage(Math.min(h + gap, 60));
          y = safeText(text, LM, y, { font: opts.font, size: opts.size, color: opts.color, align: opts.align });
          y += gap;
        }
      };

      const clauseTitle = (num: number, title: string) => {
        const label = `Cláusula ${num} – ${title}`;
        doc.font("Helvetica-Bold").fontSize(9);
        const titleH = doc.heightOfString(label, { width: W - 16 });
        const barH = Math.max(20, titleH + 8);
        checkPage(barH + 6);
        y += 4;
        doc.save().rect(LM, y - 2, W, barH).fill(BRAND_ACCENT).restore();
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
          .text(label, LM + 8, y + 3, { width: W - 16, lineBreak: true });
        y += barH + 6;
      };

      const subItem = (code: string, text: string) => {
        const full = `${code} - ${text}`;
        doc.font("Helvetica").fontSize(8.5);
        const h = doc.heightOfString(full, { width: W - 10, lineGap: 2 });
        const gap = 5;
        if (h + gap <= CONTENT_BOTTOM - y) {
          doc.fillColor(GRAY).text(full, LM + 10, y, { width: W - 10, lineGap: 2, align: "justify", lineBreak: true });
          y += h + gap;
        } else {
          checkPage(Math.min(h + gap, 40));
          y = safeText(full, LM + 10, y, { size: 8.5, width: W - 10, lineGap: 2 });
          y += gap;
        }
      };

      const contratanteNome = sc.contratante_razao || sc.client_name || "_______________";
      const contratanteCnpj = sc.contratante_cnpj || "_______________";
      const contratanteEndereco = sc.contratante_endereco || "_______________";
      const contratanteRepresentante = sc.contratante_representante || "seu representante legal";
      const avisoPrevioDias = sc.aviso_previo_dias || 30;

      doc.font("Helvetica-Bold").fontSize(13).fillColor(DARK)
        .text("MINUTA DE CONTRATO", LM, y, { width: W, align: "center", lineBreak: false });
      y += 16;
      doc.font("Helvetica").fontSize(9).fillColor(LIGHT)
        .text("PRESTAÇÃO DE SERVIÇOS DE ESCOLTA ARMADA", LM, y, { width: W, align: "center", lineBreak: false });
      y += 22;

      hLine(y); y += 15;

      const contratanteFullText = `CONTRATANTE: ${contratanteNome}. Pessoa jurídica de direito privado, inscrita no CNPJ/MF sob nº ${contratanteCnpj}, com sede fiscal na ${contratanteEndereco}, representado neste ato por ${contratanteRepresentante}.`;
      doc.font("Helvetica").fontSize(9);
      const contratanteH = doc.heightOfString(contratanteFullText, { width: W, lineGap: 3 });
      if (contratanteH + 15 <= CONTENT_BOTTOM - y) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK).text("CONTRATANTE: ", LM, y, { continued: true, width: W });
        doc.font("Helvetica").fontSize(9).fillColor(GRAY)
          .text(`${contratanteNome}. Pessoa jurídica de direito privado, inscrita no CNPJ/MF sob nº ${contratanteCnpj}, com sede fiscal na ${contratanteEndereco}, representado neste ato por ${contratanteRepresentante}.`, { width: W, lineGap: 3, align: "justify" });
        y += contratanteH + 15;
      } else {
        checkPage(40);
        y = safeText(contratanteFullText, LM, y, { font: "Helvetica", size: 9 });
        y += 15;
      }

      const contratadaFullText = "CONTRATADA: TORRES VIGILÂNCIA PATRIMONIAL LTDA. Pessoa jurídica de direito privado, inscrita no CNPJ/MF sob nº 36.982.392/0001-89, com sede fiscal em São Paulo/SP.";
      doc.font("Helvetica").fontSize(9);
      const contratadaH = doc.heightOfString(contratadaFullText, { width: W, lineGap: 3 });
      if (contratadaH + 15 <= CONTENT_BOTTOM - y) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK).text("CONTRATADA: ", LM, y, { continued: true, width: W });
        doc.font("Helvetica").fontSize(9).fillColor(GRAY)
          .text("TORRES VIGILÂNCIA PATRIMONIAL LTDA. Pessoa jurídica de direito privado, inscrita no CNPJ/MF sob nº 36.982.392/0001-89, com sede fiscal em São Paulo/SP.", { width: W, lineGap: 3, align: "justify" });
        y += contratadaH + 12;
      } else {
        checkPage(40);
        y = safeText(contratadaFullText, LM, y, { font: "Helvetica", size: 9 });
        y += 12;
      }

      checkPage(30);
      writeText("As partes, acima nomeadas e qualificadas, têm entre si como justo e acordado o presente Contrato de Prestação de Serviços de Escolta Armada, que se regerão pelos termos, cláusulas, obrigações e condições adiante articuladas:");

      clauseTitle(1, "Do Objeto");
      writeText(`A CONTRATADA prestará à CONTRATANTE os serviços especializados de Escolta Armada, através do acompanhamento ostensivo de caminhões e veículos de carga, denominados auto cargas, que transportam mercadorias consideradas de alto risco, quanto a roubos e furtos, conforme discriminação contida no Quadro Resumo, que fica fazendo parte integrante deste instrumento.`);
      subItem("1.1", "A segurança será realizada através do acompanhamento ostensivo de caminhões e veículos de carga, em vias públicas em geral, contando com o apoio de Viaturas de Escolta, devidamente identificadas com o brasão da CONTRATADA, equipadas com sistema de rádio comunicação e dotadas de 04 (quatro) portas, podendo ser inclusive rastreadas via satélite.");
      subItem("1.2", "Os serviços de Escolta Armada serão prestados por vigilantes identificados através de crachá de identificação, treinados, uniformizados, armados e munidos de equipamentos e materiais indispensáveis à execução dos serviços, definidos e discriminados na Cláusula 6 abaixo, obedecida a legislação vigente e as tratativas entre as partes.");

      clauseTitle(2, "Do Quadro Resumo");
      writeText("As partes acordam que o Quadro Resumo, parte integrante do presente instrumento, definirá todos os aspectos operacionais, técnicos e financeiros dos serviços a serem prestados pela CONTRATADA à CONTRATANTE.");

      if (priceTable) {
        checkPage(200);
        y += 5;
        const priceRows = [
          ["KM Carregado", `R$ ${Number(priceTable.valor_km_carregado || 0).toFixed(2)} / km`],
          ["KM Vazio", `R$ ${Number(priceTable.valor_km_vazio || 0).toFixed(2)} / km`],
          ["Franquia Mínima", `${Number(priceTable.franquia_minima_km || 0)} km`],
          ["Hora Estadia", `R$ ${Number(priceTable.valor_hora_estadia || 0).toFixed(2)} / hora`],
          ["Diária / Pernoite", `R$ ${Number(priceTable.valor_diaria || 0).toFixed(2)}`],
          ["VRP Base", `R$ ${Number(priceTable.vrp_base || 0).toFixed(2)}`],
          ["Adic. Noturno (VRP)", `${Number(priceTable.adicional_noturno_vrp_pct || 0)}%`],
          ["Adic. Noturno (KM)", `${Number(priceTable.adicional_noturno_km_pct || 0)}%`],
          ["Periculosidade", `${Number(priceTable.adicional_periculosidade_pct || 0)}%`],
        ];
        doc.save().rect(LM, y, W, 18).fill("#222222").restore();
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff").text("QUADRO RESUMO – VALORES", LM + 10, y + 4, { width: W - 20, align: "center", lineBreak: false });
        y += 20;
        priceRows.forEach(([label, value], i) => {
          checkPage(20);
          if (i % 2 === 0) doc.save().rect(LM, y - 2, W, 18).fill("#f5f5f5").restore();
          doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text(label, LM + 10, y + 2, { width: 200, lineBreak: false });
          doc.font("Helvetica").fontSize(8.5).fillColor(DARK).text(value, LM + 220, y + 2, { width: 230, lineBreak: false });
          y += 18;
        });
        y += 10;
      }

      clauseTitle(3, "Dos Documentos Integrantes");
      writeText("Para melhor caracterização do objeto deste CONTRATO, bem como para definir procedimentos decorrentes das obrigações ora contraídos, integram este instrumento, como se nele estivessem transcritos, os dispositivos pertinentes às normas de segurança; as atas; as correspondências entre as partes, às trocadas e as futuras, e, mais, os documentos técnicos dos serviços solicitados.");

      clauseTitle(4, "Das Alterações dos Serviços");
      writeText("Os serviços prestados poderão sofrer alterações, desde que, antecipadamente, sejam submetidos à análise da CONTRATANTE, através de correspondência própria enviada pela CONTRATADA, levando-se em conta que tais alterações ocorram para melhor adequá-los em razão de operacionalidade e/ou prioridades.");

      clauseTitle(5, "Da Individualização dos Serviços");
      writeText("Os serviços a serem prestados pela CONTRATADA à CONTRATANTE estão descritos e individualizados no Quadro Resumo anexo, que faz parte integrante deste instrumento.");

      clauseTitle(6, "Dos Vigilantes, Do Armamento e Dos Equipamentos Indispensáveis à Execução dos Serviços");
      writeText("Os vigilantes, o armamento e os equipamentos indispensáveis à execução dos serviços de Escolta Armada serão fornecidos pela contratada, sendo todos de sua responsabilidade e patrimônio.");
      subItem("6.1", `A contratada disponibilizará ${sc.num_vigilantes ? String(sc.num_vigilantes).padStart(2, '0') + ` (${['Zero','Um','Dois','Três','Quatro','Cinco'][sc.num_vigilantes] || sc.num_vigilantes})` : "02 (Dois)"} Vigilantes de Escolta Armada por operação.`);
      subItem("6.2", "A contratada disponibilizará para cada operação:");
      subItem("6.2.1", "01 (um) Revólver Calibre 38 de 5 (cinco) ou de 6 (seis) tiros;");
      subItem("6.2.2", "01 (uma) Espingarda Calibre 12 Pistol Grip, tipo Pump ou similar;");
      subItem("6.2.3", "12 (doze) cartuchos de munição calibre 38, sendo 6 (seis) cartuchos empregados no municiamento da arma e 6 (seis) no carregador adicional;");
      subItem("6.2.4", "02 (dois) Coletes à prova de bala nível II-A;");
      subItem("6.2.5", "14 (quatorze) Cartuchos de munição calibre 12, sendo 07 (sete) empregados no municiamento da arma e 07 (sete) armazenados em estojo para municiamento adicional;");
      subItem("6.2.6", "01 (um) Rádio transceptor para comunicação entre a equipe, a base e se for o caso entre a contratante;");
      subItem("6.2.7", "01 (um) veículo (viatura) de passageiros com capacidade para 5 (cinco) ocupantes, motor 1.0 ou superior, com 4 (quatro) portas, preferencialmente com menos de 2 (dois) anos de uso e/ou fabricação, devidamente identificada com o brasão da empresa e demais elementos de identificação de escolta armada e contatos da empresa, equipado com sistema de rastreamento de veículo tipo satelital e com 2 (dois) botões de pânico a ser acionado em casos de emergências e/ou ocorrências durante a operação;");
      subItem("6.3", "A contratada fornecerá a seus funcionários envolvidos na prestação dos serviços conjuntos completos de uniforme, sendo capote, calça terbrim cor preta, camisa terbrim cor preta com brasão de identificação, boina feltro preta, coturnos de cano de lona preta, cordão fiel, coldre de arma com cinto modelo robocop, cinto de lona para calças e capa de colete.");

      clauseTitle(7, "Do Prazo de Vigência");
      if (sc.vigencia_tipo === "determinado") {
        const fmtDate = (d: string | null) => d ? new Date(d + "T12:00").toLocaleDateString("pt-BR") : "___/___/______";
        writeText(`O prazo de vigência deste contrato é de ${fmtDate(sc.vigencia_inicio)} a ${fmtDate(sc.vigencia_fim)}, sendo que, qualquer das partes poderá rescindi-lo, a qualquer momento, desde que, notifique a outra, com prévia antecedência de ${avisoPrevioDias} (${avisoPrevioDias === 30 ? "trinta" : avisoPrevioDias}) dias.`);
      } else {
        writeText(`O prazo de vigência deste contrato é por tempo indeterminado, sendo que, qualquer das partes poderá rescindi-lo, a qualquer momento, desde que, notifique a outra, com prévia antecedência de ${avisoPrevioDias} (${avisoPrevioDias === 30 ? "trinta" : avisoPrevioDias}) dias.`);
      }

      clauseTitle(8, "Do Preço");
      writeText("Os valores inerentes às operações de Escolta Armada serão cobrados conforme o destino da missão, o tempo do deslocamento, os pernoites e os serviços de preservação, podendo estas ser Urbanas ou Rodoviárias dentro da Região da Grande São Paulo ou Operações Estaduais ou Interestaduais, desde que estas se iniciem no Estado de São Paulo; de forma tal que a cada evento de escolta será tratado individualmente e seus custos previamente acordados, sendo estes, descritos no Anexo I.");
      subItem("8.1", "O valor dos serviços contratados será pago nas datas, condições e periodicidade constantes da Cláusula 9, abaixo.");
      subItem("8.2", "A CONTRATANTE será considerada inadimplente, caso deixe de pagar, na data de vencimento normal da obrigação, o valor dos serviços prestados, constituindo tal fato motivo justo para a rescisão contratual pela CONTRATADA, cabendo ainda a esta o direito de cobrar seu crédito, com os acréscimos constantes do item seguinte.");
      subItem("8.3", "No preço do serviço ajustado não estão computados qualquer expectativa inflacionária, razão pela qual sobre os pagamentos vincendos não se aplicarão qualquer índice deflacionário e/ou congelamento e/ou restrições de atualização monetária, tais como, exemplificativamente, tablitas, deflatores, planos econômicos de governo etc.");

      clauseTitle(9, "Do Faturamento dos Serviços e Forma de Pagamento");
      writeText("O pagamento será efetuado pela CONTRATANTE à CONTRATADA posterior a execução do serviço prestado, conforme acordado entre as partes.");
      subItem("9.1", "Os serviços que ultrapassarem a carga horária contratada, ou seja, o tempo predeterminado por missão será cobrado horas adicionais, com o valor acordado entre as partes, da mesma forma os serviços que ultrapassarem a quilometragem contratada, ou seja, a distância predeterminada por missão será cobrado quilômetros adicionais, com o valor acordado entre as partes, conforme ANEXO I; ficando avençado que os valores correspondentes à prestação destes serviços serão totalizados e faturados conforme caput da Cláusula 9 deste contrato.");

      clauseTitle(10, "Da Alteração de Preços");
      subItem("10.1", `Os preços estabelecidos no presente contrato serão atualizados por eventuais aumentos advindos de custos setoriais, equipamentos, materiais e, especialmente, aqueles relacionados com os reajustes dos empregados da CONTRATADA, provenientes de Acordo ou Dissídio Coletivo da Categoria, bem como novos encargos, taxas ou tributos criados pelo Poder Público Federal, Estadual ou Municipal, que impactem a planilha de composição de preços da CONTRATADA, ensejarão uma atualização dos preços contratuais, mediante prévia comunicação escrita da CONTRATADA à CONTRATANTE e mediante prévio acordo entre as partes.`);
      subItem("10.2", "Fica previamente acordado entre as partes que, caso ocorra uma elevação desproporcional dos índices de custeio deste contrato, em função de reajustes dos custos diretos e indiretos, haverá uma negociação entre as partes, visando a readequação dos preços contratuais, a fim de que se recomponha o equilíbrio econômico-financeiro do contrato.");

      clauseTitle(11, "Da Rescisão Contratual");
      subItem("11.1", `O presente contrato poderá ser rescindido, sem a incidência de multa, por qualquer das partes, mediante prévio aviso, por escrito, com antecedência mínima de ${avisoPrevioDias} (${avisoPrevioDias === 30 ? "trinta" : avisoPrevioDias}) dias, contados da data em que a outra parte receber a aludida comunicação, devidamente protocolizada.`);

      clauseTitle(12, "Da Responsabilidade das Partes");
      writeText("A CONTRATADA é responsável, direta e exclusiva, pela execução integral dos serviços objeto do presente contrato, bem como por eventuais danos, que por si, seus prepostos, empregados, por dolo ou culpa, causarem à CONTRATANTE, desde que devidamente comprovados e comunicados por escrito, pela CONTRATANTE à CONTRATADA, até o segundo dia útil posterior à ocorrência.");
      subItem("12.1", "A CONTRATADA compromete-se a utilizar, na prestação dos serviços, profissionais previamente selecionados, sem antecedentes criminais e político-sociais, bem como profissionais que melhor se adaptem às características exigidas pela CONTRATANTE.");
      subItem("12.2", "Os serviços de escolta armada serão prestados por vigilantes treinados, uniformizados, equipados e armados, sempre de comum acordo entre as partes e em conformidade com a Lei nº 7.102, de 20/06/83 e a Lei nº 9.017, de 30/03/95.");
      subItem("12.3", "A CONTRATADA fica assegurada no direito de promover substituições, quando necessário, de vigilantes e outros elementos destacados para os serviços aqui descritos e contratado sendo dever da CONTRATADA, promover a substituição imediatamente após comunicação por escrito da CONTRATANTE, qualquer de seus empregados ou prepostos cuja permanência nos locais de prestação de serviço for julgada inconveniente.");
      subItem("12.4", "A CONTRATADA não será responsável por eventos decorrentes de deficiência operacional, se esta for proveniente de alterações de ordens ou rotinas dadas unilateralmente pela CONTRATANTE aos vigilantes e prepostos da CONTRATADA.");
      subItem("12.5", "Fica entendido entre as partes contratantes que, ao vigilante, não se deve dar incumbência fora de suas atividades específicas.");
      subItem("12.6", "A CONTRATADA manterá um serviço de inspeção de seus vigilantes e prepostos, verificando periodicamente, o andamento dos serviços e procedimentos de segurança, sem que isto implique em quaisquer ônus ou acréscimo no preço pago pela CONTRATANTE.");

      clauseTitle(13, "Dos Ressarcimentos e Reembolsos");
      writeText("Correrão por conta exclusiva da CONTRATANTE, todas as despesas referentes a pedágios em estradas estaduais e federais, bem como estadias e despesas em viagens, quando as mesmas forem decorrentes de despesas extraordinárias para os serviços previamente acordados, desde que as mesmas sejam devidamente autorizadas pela CONTRATANTE, devendo, referidas despesas, ser ressarcidas ou reembolsadas, mediante a apresentação, por parte da CONTRATADA, dos respectivos comprovantes e/ou notas fiscais referentes aos desembolsos.");

      clauseTitle(14, "Das Omissões do Contrato");
      writeText("Quaisquer fatos ou casos omissos no presente contrato não ensejarão a sua rescisão.");
      subItem("14.1", "O presente contrato obriga as partes, por si, seus herdeiros e sucessores, a qualquer título.");
      subItem("14.2", "Qualquer alteração ou modificação às cláusulas e condições deste contrato somente será válida se feita por documento escrito, assinado pelas partes e testemunhas, que se constituirá em aditivo ao presente.");

      clauseTitle(15, "Da Exclusão do Vínculo Empregatício");
      writeText("O presente contrato, em razão do seu objetivo e natureza, não gera para a CONTRATANTE, em relação aos empregados e prepostos da CONTRATADA, qualquer vínculo de natureza trabalhista e/ou previdenciária, respondendo exclusivamente a CONTRATADA por toda e qualquer ação trabalhista e/ou indenizatória por eles propostas, bem como pelo resultado delas.");

      clauseTitle(16, "Das Disposições Gerais");
      subItem("16.1", "A CONTRATADA somente será responsável pela prestação dos serviços objeto deste contrato, não podendo garantir a inocorrência de fatos delituosos contra o patrimônio da CONTRATANTE ou de terceiros, nem responder pelo desaparecimento, furto, roubo, dano ou destruição de quaisquer bens, cargas ou objetos de propriedade da CONTRATANTE ou de terceiros ou por qualquer outro dano ou prejuízo que venha a ser causado à CONTRATANTE ou a terceiros que não tenha sido causado diretamente pelos funcionários e/ou preposto da CONTRATADA.");
      subItem("16.2", "Fica convencionado que a CONTRATADA, em relação aos seus funcionários alocados na CONTRATANTE, se responsabiliza por quaisquer ônus decorrentes de fiscalizações realizadas pelo Ministério do Trabalho e do Emprego, através das Delegacias Regionais do Trabalho, tais como notificações para apresentação de documentos, registros de empregados, esclarecimentos, e outros que forem pertinentes à situação, além da apresentação de defesas e recursos administrativos decorrentes de autuações fiscais, com o necessário pagamento das multas administrativas impostas.");
      subItem("16.3", 'É vedado a qualquer das partes utilizar o presente objeto contratual em garantias para transações bancárias e/ou financeiras de qualquer espécie, efetuar operação de desconto, negociar, repassar ou de qualquer forma ceder os créditos decorrentes da execução desse a Bancos, empresas de "factoring" ou terceiros, sem prévia autorização por escrito da outra parte.');
      subItem("16.4", "Ficam desde já convencionados que o presente contrato não irá configurar nenhum outro direito para as partes, além da prestação dos serviços supramencionados, devendo este contrato ser interpretado sob o ponto de vista restritivo, de modo a não permitir qualquer interpretação diferente da objetivada pelas partes.");
      subItem("16.5", "Eventual tolerância de uma parte a infrações ou descumprimento das condições estipuladas no presente contrato, cometidas pela outra parte, será tida como ato de mera liberalidade, não se constituindo em perdão, precedente, novação ou renúncia a direitos que a legislação ou o contrato assegurem às partes.");
      subItem("16.6", "A assinatura do presente contrato representa a aceitação de todas as disposições nele contidas, prevalecendo sobre todas as tratativas e entendimentos mantidos anteriormente entre as partes.");
      subItem("16.7", "Se qualquer cláusula ou dispositivo deste contrato for considerado nulo ou sem efeito, no todo ou em parte, as demais deverão permanecer válidas e serão interpretadas de forma a preservar sua validade.");
      subItem("16.8", "O presente contrato expressa todos os acordos e condições estipulados pelas partes com relação ao objeto contrato, substituindo todos os eventuais contratos e seus anexos anteriormente firmados entre elas, os quais neste ato são tidos como rescindidos ofertando-se as partes mútua quitação para nada mais reclamar.");

      clauseTitle(17, "Do Sigilo");
      writeText("Toda e qualquer informação relativa ao objeto do presente será sempre considerada sigilosa e confidencial, ficando expressamente vedado à CONTRATADA, bem como aos seus empregados ou prepostos, delas dar conhecimento a terceiros não autorizados, sob pena de responsabilização civil e criminal.");

      clauseTitle(18, "Do Foro");
      writeText("As partes elegem o Foro Central de São Paulo – SP para dirimir eventuais dúvidas ou divergências que as partes venham a ter com relação ao presente contrato. E, por estarem assim ajustadas, declaram as partes aceitar as disposições estabelecidas nas cláusulas do presente contrato, que, após lido e achado conforme, vai assinado pelos representantes legais das partes e pelas testemunhas abaixo.");

      y += 10;
      checkPage(30);
      const fmtDateSig = (d: string | null) => d ? new Date(d + "T12:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      doc.font("Helvetica").fontSize(9).fillColor(DARK).text(`São Paulo, ${fmtDateSig(sc.data_assinatura)}.`, LM, y, { width: W, align: "center", lineBreak: false });
      y += 35;

      const SIG_BLOCK_H = 220;
      if (y + SIG_BLOCK_H > CONTENT_BOTTOM) { startNewPage(); }
      y += 15;
      const sigW = W / 2 - 20;
      const sigY = y;
      const SIG_LINE_OFFSET = 70;

      doc.save().rect(LM, sigY, sigW, 3).fill(BRAND).restore();
      doc.save().moveTo(LM, sigY + SIG_LINE_OFFSET).lineTo(LM + sigW, sigY + SIG_LINE_OFFSET).lineWidth(0.5).strokeColor(ACCENT_LINE).stroke().restore();
      doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK).text("CONTRATADA", LM, sigY + SIG_LINE_OFFSET + 6, { width: sigW, align: "center", lineBreak: false });
      doc.font("Helvetica").fontSize(8).fillColor(GRAY).text("TORRES VIGILÂNCIA PATRIMONIAL LTDA", LM, sigY + SIG_LINE_OFFSET + 20, { width: sigW, align: "center", lineBreak: false });
      doc.font("Helvetica").fontSize(7).fillColor(LIGHT).text("CNPJ: 36.982.392/0001-89", LM, sigY + SIG_LINE_OFFSET + 33, { width: sigW, align: "center", lineBreak: false });

      const sig2X = LM + sigW + 40;
      doc.save().rect(sig2X, sigY, sigW, 3).fill(BRAND).restore();
      doc.save().moveTo(sig2X, sigY + SIG_LINE_OFFSET).lineTo(sig2X + sigW, sigY + SIG_LINE_OFFSET).lineWidth(0.5).strokeColor(ACCENT_LINE).stroke().restore();
      doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK).text("CONTRATANTE", sig2X, sigY + SIG_LINE_OFFSET + 6, { width: sigW, align: "center", lineBreak: false });
      const contratanteNomeFontSize = contratanteNome.length > 50 ? 5.5 : contratanteNome.length > 35 ? 6.5 : 8;
      doc.font("Helvetica").fontSize(contratanteNomeFontSize).fillColor(GRAY).text(contratanteNome, sig2X, sigY + SIG_LINE_OFFSET + 20, { width: sigW, align: "center", lineBreak: true });
      doc.font("Helvetica").fontSize(7).fillColor(LIGHT).text(`CNPJ: ${contratanteCnpj}`, sig2X, sigY + SIG_LINE_OFFSET + 35, { width: sigW, align: "center", lineBreak: false });

      y = sigY + SIG_LINE_OFFSET + 55;

      doc.save().rect(LM, y - 2, W, 18).fill(BRAND_ACCENT).restore();
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff").text("TESTEMUNHAS", LM + 8, y + 2, { width: W - 16, lineBreak: false });
      y += 24;

      const drawWitness = (num: number, rg: string, cpf: string) => {
        checkPage(60);
        doc.font("Helvetica-Bold").fontSize(8).fillColor(DARK).text(`Testemunha ${num}:`, LM, y, { lineBreak: false });
        y += 14;
        doc.save().moveTo(LM, y + 12).lineTo(LM + W, y + 12).lineWidth(0.4).strokeColor("#cccccc").stroke().restore();
        y += 18;
        doc.font("Helvetica-Bold").fontSize(7).fillColor(LIGHT).text("RG:", LM, y, { lineBreak: false });
        doc.font("Helvetica").fontSize(8).fillColor(DARK).text(rg || "______________________", LM + 20, y, { lineBreak: false });
        doc.font("Helvetica-Bold").fontSize(7).fillColor(LIGHT).text("CPF:", LM + W / 2, y, { lineBreak: false });
        doc.font("Helvetica").fontSize(8).fillColor(DARK).text(cpf || "______________________", LM + W / 2 + 25, y, { lineBreak: false });
        y += 25;
      };

      drawWitness(1, sc.testemunha1_rg || "", sc.testemunha1_cpf || "");
      drawWitness(2, sc.testemunha2_rg || "", sc.testemunha2_cpf || "");

      doc.end();
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ message: err.message });
      } else {
        res.end();
      }
    }
  });

  // Client Billing Report (monthly)
  app.get("/api/escort/relatorio/:clientId", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { data: billings, error } = await supabaseAdmin.from("escort_billings").select("*")
        .eq("client_id", clientId).gte("data_missao", startOfMonth).lte("data_missao", endOfMonth)
        .order("data_missao", { ascending: true });
      if (error) throw error;

      const items = billings || [];
      const totais = {
        total_missoes: items.length,
        total_km: items.reduce((a: number, b: any) => a + Number(b.km_total || 0), 0),
        total_faturamento: items.reduce((a: number, b: any) => a + Number(b.fat_total || 0), 0),
        total_pagamento_operacional: items.reduce((a: number, b: any) => a + Number(b.pag_total || 0), 0),
        total_pedagio: items.reduce((a: number, b: any) => a + Number(b.despesas_pedagio || 0), 0),
        total_combustivel: items.reduce((a: number, b: any) => a + Number(b.despesas_combustivel || 0), 0),
        lucro_bruto: 0,
        missoes_noturnas: items.filter((b: any) => b.is_noturno).length,
        periodo: `${now.toLocaleString("pt-BR", { month: "long", year: "numeric" })}`,
      };
      totais.lucro_bruto = Math.round((totais.total_faturamento - totais.total_pagamento_operacional) * 100) / 100;

      const { data: client } = await supabaseAdmin.from("clients").select("name").eq("id", clientId).single();

      res.json({
        client_name: client?.name || `Cliente #${clientId}`,
        periodo: totais.periodo,
        totais,
        missoes: items,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

}
