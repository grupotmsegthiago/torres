/**
 * Cadastro de Fornecedores — usado em Contas a Pagar (modal de novo lançamento).
 * CRUD simples com auditoria.
 */
import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole, requireDiretoria } from "../auth";
import { logSystemAudit } from "../audit";
import { validateContactFields } from "@shared/contact-validation";

export function registerFornecedoresRoutes(app: Express) {
  console.log("[fornecedores] Rotas registradas");

  // Lista (filtro opcional ?ativos=true)
  app.get("/api/fornecedores", requireAuth, requireAdminRole, async (req, res) => {
    try {
      let q = supabaseAdmin.from("fornecedores").select("*").order("nome", { ascending: true });
      if (req.query.ativos === "true") q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/fornecedores/:id", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("fornecedores")
        .select("*")
        .eq("id", req.params.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: "Fornecedor não encontrado" });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/fornecedores", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const user = (req as any).user;
      const { nome, cnpj_cpf, categoria, email, telefone, cep, endereco, cidade, uf, chave_pix, banco, agencia, conta, tipo_conta, observacoes, ativo } = req.body;
      if (!nome || !String(nome).trim()) return res.status(400).json({ message: "Nome é obrigatório" });
      const cleanDoc = String(cnpj_cpf || "").replace(/\D/g, "");
      if (!cleanDoc || (cleanDoc.length !== 11 && cleanDoc.length !== 14)) {
        return res.status(400).json({ message: "CPF ou CNPJ é obrigatório (11 ou 14 dígitos)" });
      }
      const { data: dup } = await supabaseAdmin
        .from("fornecedores")
        .select("id")
        .eq("cnpj_cpf", cleanDoc)
        .maybeSingle();
      if (dup) return res.status(409).json({ message: "Já existe um fornecedor com este CPF/CNPJ" });

      const contactErrors = validateContactFields(
        { telefone: telefone ?? null, cep: cep ?? null },
        { phones: ["telefone"], zips: ["cep"] },
      );
      if (contactErrors.length) {
        return res.status(400).json({ message: contactErrors[0].message, errors: contactErrors });
      }

      const cleanCep = cep ? String(cep).replace(/\D/g, "") : "";
      const payload = {
        nome: String(nome).trim().toUpperCase(),
        cnpj_cpf: cleanDoc,
        categoria: categoria || null,
        email: email || null,
        telefone: telefone || null,
        cep: cleanCep || null,
        endereco: endereco || null,
        cidade: cidade || null,
        uf: uf || null,
        chave_pix: chave_pix || null,
        banco: banco || null,
        agencia: agencia || null,
        conta: conta || null,
        tipo_conta: tipo_conta || null,
        observacoes: observacoes || null,
        ativo: ativo !== false,
        created_by: user?.name || null,
      };

      const { data, error } = await supabaseAdmin
        .from("fornecedores")
        .insert(payload)
        .select()
        .single();
      if (error) {
        if (String((error as any).code) === "23505") {
          return res.status(409).json({ message: "Já existe um fornecedor com este CPF/CNPJ" });
        }
        throw error;
      }

      await logSystemAudit({
        userId: user?.id, userName: user?.name, userRole: user?.role,
        action: "FORNECEDOR_CRIADO",
        targetId: String(data.id),
        targetType: "fornecedor",
        details: JSON.stringify({ nome: payload.nome, cnpj_cpf: payload.cnpj_cpf }),
      });

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const updateHandler = async (req: any, res: any) => {
    try {
      const user = (req as any).user;
      const { nome, cnpj_cpf, categoria, email, telefone, cep, endereco, cidade, uf, chave_pix, banco, agencia, conta, tipo_conta, observacoes, ativo } = req.body;

      const payload: any = {};
      if (nome !== undefined) payload.nome = String(nome).trim().toUpperCase();
      if (cnpj_cpf !== undefined) {
        const cleanDoc = String(cnpj_cpf || "").replace(/\D/g, "");
        if (!cleanDoc || (cleanDoc.length !== 11 && cleanDoc.length !== 14)) {
          return res.status(400).json({ message: "CPF ou CNPJ inválido (11 ou 14 dígitos)" });
        }
        const { data: dup } = await supabaseAdmin
          .from("fornecedores")
          .select("id")
          .eq("cnpj_cpf", cleanDoc)
          .neq("id", req.params.id)
          .maybeSingle();
        if (dup) return res.status(409).json({ message: "Já existe outro fornecedor com este CPF/CNPJ" });
        payload.cnpj_cpf = cleanDoc;
      }
      if (categoria !== undefined) payload.categoria = categoria || null;
      if (email !== undefined) payload.email = email || null;
      if (telefone !== undefined) payload.telefone = telefone || null;
      if (cep !== undefined) {
        const cleanCep = cep ? String(cep).replace(/\D/g, "") : "";
        payload.cep = cleanCep || null;
      }
      if (endereco !== undefined) payload.endereco = endereco || null;
      if (cidade !== undefined) payload.cidade = cidade || null;
      if (uf !== undefined) payload.uf = uf || null;
      if (chave_pix !== undefined) payload.chave_pix = chave_pix || null;
      if (banco !== undefined) payload.banco = banco || null;
      if (agencia !== undefined) payload.agencia = agencia || null;
      if (conta !== undefined) payload.conta = conta || null;
      if (tipo_conta !== undefined) payload.tipo_conta = tipo_conta || null;
      if (observacoes !== undefined) payload.observacoes = observacoes || null;
      if (ativo !== undefined) payload.ativo = !!ativo;

      if (payload.telefone !== undefined || payload.cep !== undefined) {
        const sample: Record<string, unknown> = {};
        const phones: string[] = [];
        const zips: string[] = [];
        if (payload.telefone !== undefined) { sample.telefone = payload.telefone; phones.push("telefone"); }
        if (payload.cep !== undefined) { sample.cep = payload.cep; zips.push("cep"); }
        const contactErrors = validateContactFields(sample, { phones, zips });
        if (contactErrors.length) {
          return res.status(400).json({ message: contactErrors[0].message, errors: contactErrors });
        }
      }

      const { data, error } = await supabaseAdmin
        .from("fornecedores")
        .update(payload)
        .eq("id", req.params.id)
        .select()
        .single();
      if (error) {
        if (String((error as any).code) === "23505") {
          return res.status(409).json({ message: "Já existe outro fornecedor com este CPF/CNPJ" });
        }
        throw error;
      }

      await logSystemAudit({
        userId: user?.id, userName: user?.name, userRole: user?.role,
        action: "FORNECEDOR_ATUALIZADO",
        targetId: String(req.params.id),
        targetType: "fornecedor",
        details: JSON.stringify(payload),
      });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  };

  app.put("/api/fornecedores/:id", requireAuth, requireAdminRole, updateHandler);
  app.patch("/api/fornecedores/:id", requireAuth, requireAdminRole, updateHandler);

  app.delete("/api/fornecedores/:id", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const user = (req as any).user;
      // Soft delete (ativo = false). Evita FK em transactions.
      const { data, error } = await supabaseAdmin
        .from("fornecedores")
        .update({ ativo: false })
        .eq("id", req.params.id)
        .select()
        .single();
      if (error) throw error;
      await logSystemAudit({
        userId: user?.id, userName: user?.name, userRole: user?.role,
        action: "FORNECEDOR_INATIVADO",
        targetId: String(req.params.id),
        targetType: "fornecedor",
      });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
