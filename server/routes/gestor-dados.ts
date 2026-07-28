// =============================================================================
// GESTOR DE DADOS FINANCEIRO — rotas (só leitura + IA auditora)
// - GET  /api/gestor-dados/validacao               → motor de validação (SWR)
// - GET  /api/gestor-dados/indicadores-funcionarios → indicadores operacionais
//   por funcionário (missões, receita gerada) — os CUSTOS vêm do rh-summary
//   oficial (frontend combina os dois; nenhum cálculo de folha paralelo aqui).
// - POST /api/gestor-dados/perguntar               → IA responde sobre os dados
// =============================================================================
import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import { executarValidacao, type ResultadoValidacao } from "../lib/gestor-dados";
import { oficialBillingView, resolverContratoParaBilling } from "../lib/billing-display";

// Cache SÓ EM MEMÓRIA (módulo é estritamente leitura — nada de snapshot em
// tabela) + singleflight: várias chamadas simultâneas compartilham o mesmo
// recálculo. A IA (/perguntar) reusa a última auditoria em vez de recalcular.
const TTL_MS = 15 * 60 * 1000;
const MAX_PERIOD_CACHE = 8; // períodos distintos guardados ao mesmo tempo
const cacheVal = new Map<string, { data: ResultadoValidacao; ts: number }>();
const inflight = new Map<string, Promise<ResultadoValidacao>>();
async function getValidacao(force = false, de?: string, ate?: string): Promise<ResultadoValidacao> {
  const key = `${de || ""}|${ate || ""}`;
  const hit = cacheVal.get(key);
  if (!force && hit && Date.now() - hit.ts < TTL_MS) return hit.data;
  let p = inflight.get(key);
  if (!p) {
    p = executarValidacao(de, ate)
      .then((data) => {
        cacheVal.set(key, { data, ts: Date.now() });
        // LRU simples: descarta o período mais antigo
        if (cacheVal.size > MAX_PERIOD_CACHE) {
          const oldest = Array.from(cacheVal.entries()).sort((a, b) => a[1].ts - b[1].ts)[0];
          if (oldest) cacheVal.delete(oldest[0]);
        }
        return data;
      })
      .finally(() => { inflight.delete(key); });
    inflight.set(key, p);
  }
  return p;
}

async function fetchAll(table: string, select: string, filter?: (q: any) => any): Promise<any[]> {
  const PAGE = 1000;
  const out: any[] = [];
  for (let fromIdx = 0; ; fromIdx += PAGE) {
    let q = supabaseAdmin.from(table).select(select).range(fromIdx, fromIdx + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export function registerGestorDadosRoutes(app: Express) {
  // ---- Validação completa (cache em memória 15min; ?force=1 revalida) ----
  app.get("/api/gestor-dados/validacao", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const de = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.de || "")) ? String(req.query.de) : undefined;
      const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.ate || "")) ? String(req.query.ate) : undefined;
      res.json(await getValidacao(req.query.force === "1", de, ate));
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Erro na validação" });
    }
  });

  // ---- Indicadores operacionais por funcionário (mês civil YYYY-MM) ----
  app.get("/api/gestor-dados/indicadores-funcionarios", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const mes = String(req.query.mes || "").match(/^\d{4}-\d{2}$/)
        ? String(req.query.mes)
        : new Date().toISOString().slice(0, 7);
      const from = `${mes}-01`;
      const [y, m] = mes.split("-").map(Number);
      const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

      const [osRows, contratos] = await Promise.all([
        fetchAll("service_orders", "id, os_number, status, type, assigned_employee_id, assigned_employee_2_id, scheduled_date, completed_date",
          (q) => q.gte("scheduled_date", from + "T00:00:00").lte("scheduled_date", to + "T23:59:59")),
        supabaseAdmin.from("escort_contracts").select("*").then((r) => { if (r.error) throw new Error(r.error.message); return r.data || []; }),
      ]);
      const osIds = osRows.map((o: any) => o.id);
      const billings: any[] = [];
      for (let i = 0; i < osIds.length; i += 200) {
        const { data, error } = await supabaseAdmin.from("escort_billings")
          .select("id, service_order_id, status, contract_id, client_id, fat_total, fat_acionamento, fat_km, fat_hora_extra, fat_adicional_noturno, fat_estadia, fat_pernoite, despesas_pedagio, despesas_outras, receitas_os, km_inicial, km_final")
          .in("service_order_id", osIds.slice(i, i + 200));
        if (error) throw new Error(error.message);
        billings.push(...(data || []));
      }
      const billingByOs = new Map(billings.map((b: any) => [b.service_order_id, b]));

      const porFuncionario: Record<string, { missoes: number; receitaGerada: number; osNumbers: string[] }> = {};
      for (const os of osRows as any[]) {
        const status = String(os.status || "").toLowerCase();
        if (status === "recusada" || status === "cancelada") continue;
        const b = billingByOs.get(os.id);
        const receita = b ? Number(oficialBillingView(b, os.status, resolverContratoParaBilling(b, os, contratos)).total || 0) : 0;
        const team = [os.assigned_employee_id, os.assigned_employee_2_id].filter((x: any) => x != null);
        if (!team.length) continue;
        const quota = receita / team.length; // receita dividida entre a equipe (sem dupla contagem)
        for (const empId of team) {
          const k = String(empId);
          if (!porFuncionario[k]) porFuncionario[k] = { missoes: 0, receitaGerada: 0, osNumbers: [] };
          porFuncionario[k].missoes += 1;
          porFuncionario[k].receitaGerada = +(porFuncionario[k].receitaGerada + quota).toFixed(2);
          if (porFuncionario[k].osNumbers.length < 30) porFuncionario[k].osNumbers.push(os.os_number || String(os.id));
        }
      }
      res.json({ mes, periodo: { from, to }, porFuncionario });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Erro nos indicadores" });
    }
  });

  // ---- IA Auditora: responde perguntas usando SÓ os dados do motor ----
  app.post("/api/gestor-dados/perguntar", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const pergunta = String(req.body?.pergunta || "").trim().slice(0, 500);
      if (!pergunta) return res.status(400).json({ message: "Escreva a pergunta." });

      const validacao = await getValidacao(); // reusa a última auditoria (cache)
      // Compacto pro modelo: achados + resumo (sem despejar tabelas inteiras)
      const contexto = {
        status: validacao.status,
        integridadePct: validacao.integridadePct,
        totais: validacao.totais,
        resumoFinanceiro: validacao.resumoFinanceiro,
        achados: validacao.achados.slice(0, 120).map((a) => ({
          categoria: a.categoria, severidade: a.severidade, titulo: a.titulo, detalhe: a.detalhe,
        })),
      };

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });
      const system = `Você é o Auditor de Dados Financeiro de uma empresa de escolta armada.
Receberá um JSON com o resultado do motor determinístico de validação (achados, totais, resumo financeiro).
REGRAS ABSOLUTAS:
1. NUNCA invente números, registros ou causas — responda SOMENTE com base no JSON.
2. Se a pergunta não puder ser respondida com esses dados, diga isso claramente e indique onde verificar no sistema.
3. Explique a causa provável de cada divergência citada e sugira a correção prática.
4. Português claro, nível diretoria, máximo ~15 linhas, sem markdown.`;
      const resp = await openai.chat.completions.create({
        model: "gpt-5-mini",
        reasoning_effort: "minimal",
        max_completion_tokens: 900,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `PERGUNTA: ${pergunta}\n\nDADOS DA VALIDAÇÃO:\n${JSON.stringify(contexto)}` },
        ],
      });
      const texto = resp.choices?.[0]?.message?.content?.trim() || "Sem resposta disponível.";
      res.json({ resposta: texto, geradoEm: validacao.geradoEm, integridadePct: validacao.integridadePct });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Erro na IA auditora" });
    }
  });
}
