// =============================================================================
// GESTOR DE MEDIÇÃO SÊNIOR — rotas
// Motor determinístico em server/lib/gestor-medicao.ts (fonte única: calcularEscolta).
// IA só EXPLICA (nunca calcula, nunca aprova). Aprovação em lote SÓ CALCULADO_OK.
// Exceção (aprovar com divergência) = diretoria + justificativa obrigatória.
// =============================================================================
import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole, requireDiretoria } from "../auth";
import { logSystemAudit } from "../audit";
import { bustBalancoCaches } from "../lib/balanco-cache";
import { createAutoTransaction, removeAutoTransaction } from "./_helpers";
import { auditarLote, auditarOsById, salvarAudits, TOLERANCIA_CENTS } from "../lib/gestor-medicao";
import { osCanonicalTotal, billingTotalForBoletim } from "../lib/boletim-totals";
import { calcularEscolta } from "../billing-calc";

const num = (v: any) => (v === undefined || v === null || v === "" ? undefined : Number(v));

function resumo(results: any[]) {
  const div = results.filter((r) => String(r.analysisStatus || r.analysis_status).startsWith("DIVERGENCIA"));
  const ok = results.filter((r) => (r.analysisStatus || r.analysis_status) === "CALCULADO_OK");
  const incompletas = results.filter((r) => ["DADOS_INCOMPLETOS", "REGRA_NAO_ENCONTRADA"].includes(r.analysisStatus || r.analysis_status));
  const atencao = results.filter((r) => (r.analysisStatus || r.analysis_status) === "ATENCAO");
  const dif = (r: any) => Number(r.differenceCents ?? (r.difference != null ? Math.round(r.difference * 100) : 0)) || 0;
  const acima = div.filter((r) => dif(r) > 0).reduce((s, r) => s + dif(r), 0);
  const abaixo = div.filter((r) => dif(r) < 0).reduce((s, r) => s + Math.abs(dif(r)), 0);
  return {
    total: results.length,
    calculadasOk: ok.length,
    comDivergencia: div.length,
    dadosIncompletos: incompletas.length,
    atencao: atencao.length,
    aguardandoRevisao: results.filter((r) => (r.billingStatus || r.billing_status) === "A_VERIFICAR").length,
    cobradoAMaior: acima / 100,
    cobradoAMenor: abaixo / 100,
    totalDivergencias: (acima + abaixo) / 100,
  };
}

export function registerGestorMedicaoRoutes(app: Express) {
  // ---- Analisar TODAS as OS (lote) — auditoria retroativa completa ----
  app.post("/api/gestor-medicao/analisar-lote", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      // Decisão do dono (28/07/2026): o Gestor só avalia OSs de 16/07/2026 em
      // diante. O que ficou pra trás não entra na análise (piso é forçado
      // mesmo que o filtro peça data anterior).
      const PISO_ANALISE = "2026-07-16";
      const fromReq = typeof req.body?.from === "string" && req.body.from ? req.body.from : undefined;
      const from = !fromReq || fromReq < PISO_ANALISE ? PISO_ANALISE : fromReq;
      const results = await auditarLote({
        clientId: num(req.body?.clientId),
        from,
        to: req.body?.to || undefined,
        osStatus: req.body?.osStatus || undefined,
      });
      await salvarAudits(results, user.name);
      await logSystemAudit({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "GESTOR_MEDICAO_LOTE", targetId: "lote", targetType: "medicao_audit",
        details: `Análise em lote: ${results.length} OS auditadas.`, ipAddress: req.ip,
      });
      res.json({ resumo: resumo(results), resultados: results });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ---- Reanalisar UMA OS ----
  app.post("/api/gestor-medicao/analisar/:osId", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const r = await auditarOsById(Number(req.params.osId));
      if (!r) return res.status(404).json({ message: "OS não encontrada" });
      await salvarAudits([r], req.user!.name);
      res.json(r);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ---- Últimos resultados persistidos (a tela abre com isso) ----
  app.get("/api/gestor-medicao/resultados", requireAuth, requireAdminRole, async (req, res) => {
    try {
      // Última análise por OS (janela das 20.000 análises mais recentes)
      const { data, error } = await supabaseAdmin
        .from("medicao_audits").select("*")
        .order("analyzed_at", { ascending: false }).order("id", { ascending: false })
        .limit(20000);
      if (error) throw error;
      const latest = new Map<number, any>();
      for (const r of data || []) if (!latest.has(r.service_order_id)) latest.set(r.service_order_id, r);
      let rows = Array.from(latest.values());
      // Junta nº/cliente/data da OS
      const osIds = rows.map((r) => r.service_order_id);
      const osInfo = new Map<number, any>();
      for (let i = 0; i < osIds.length; i += 200) {
        const { data: sos } = await supabaseAdmin.from("service_orders")
          .select("id, os_number, client_id, scheduled_date, status").in("id", osIds.slice(i, i + 200));
        for (const s of sos || []) osInfo.set(s.id, s);
      }
      const clientIds = Array.from(new Set(rows.map((r) => osInfo.get(r.service_order_id)?.client_id).filter((v) => v != null)));
      const clientName = new Map<number, string>();
      for (let i = 0; i < clientIds.length; i += 200) {
        const { data: clients } = await supabaseAdmin.from("clients").select("id, name").in("id", clientIds.slice(i, i + 200));
        for (const c of clients || []) clientName.set(c.id, c.name);
      }
      rows = rows.map((r) => {
        const s = osInfo.get(r.service_order_id);
        return {
          ...r,
          os_number: s?.os_number || null,
          client_id: s?.client_id ?? null,
          client_name: s?.client_id ? clientName.get(s.client_id) || null : null,
          data_missao: s?.scheduled_date || null,
          os_status: s?.status || r.os_status,
        };
      });
      // Piso de análise: só exibe OSs de 16/07/2026 em diante (decisão do dono).
      rows = rows.filter((r) => !r.data_missao || String(r.data_missao).slice(0, 10) >= "2026-07-16");
      rows.sort((a, b) => String(b.data_missao || "").localeCompare(String(a.data_missao || "")));
      res.json({ resumo: resumo(rows), resultados: rows });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ---- IA explicativa (sob demanda, 1 OS — nunca calcula) ----
  app.post("/api/gestor-medicao/explicar/:osId", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      const { data } = await supabaseAdmin.from("medicao_audits").select("*")
        .eq("service_order_id", osId).order("analyzed_at", { ascending: false }).limit(1);
      const audit = data?.[0];
      if (!audit) return res.status(404).json({ message: "OS ainda não analisada — rode a análise primeiro." });

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });
      const system = `Você é o Analista Sênior de Medição de uma empresa de escolta armada.
Receberá o resultado JSON de um motor de cálculo determinístico que auditou uma OS.
REGRAS ABSOLUTAS:
1. NUNCA invente valores, fórmulas ou regras — use SOMENTE os números do JSON.
2. Explique em português claro e objetivo COMO o valor correto foi formado (acionamento, franquias, excedentes, despesas).
3. Se houver divergência, aponte a origem provável e recomende NÃO aprovar até corrigir.
4. Se estiver correto, confirme e recomende aprovar.
5. Máximo ~10 linhas, sem markdown, tom profissional.`;
      const resp = await openai.chat.completions.create({
        model: "gpt-5-mini",
        reasoning_effort: "minimal",
        max_completion_tokens: 700,
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify({ status: audit.analysis_status, veredito: audit.verdict, valor_correto: audit.expected_total, valor_cobrado: audit.charged_total, diferenca: audit.difference, problemas: audit.issues, memoria: audit.memoria }) },
        ],
      });
      const texto = resp.choices?.[0]?.message?.content?.trim() || "Sem explicação disponível.";
      res.json({ explicacao: texto });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ---- Aprovação em LOTE — SÓ OS com última análise CALCULADO_OK ----
  app.post("/api/gestor-medicao/aprovar-lote", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const user = req.user!;
      const osIds: number[] = Array.isArray(req.body?.osIds) ? req.body.osIds.map(Number).filter(Boolean) : [];
      if (!osIds.length) return res.status(400).json({ message: "Nenhuma OS selecionada" });

      const aprovadas: any[] = []; const puladas: any[] = [];
      for (const osId of osIds) {
        // RE-AUDITA na hora (nunca aprovar por análise velha)
        const audit = await auditarOsById(osId);
        if (!audit) { puladas.push({ osId, motivo: "OS não encontrada" }); continue; }
        if (!audit.aprovavelEmLote) { puladas.push({ osId, osNumber: audit.osNumber, motivo: audit.analysisStatus !== "CALCULADO_OK" ? `análise = ${audit.analysisStatus}` : `billing ${audit.billingStatus}` }); continue; }
        if (audit.differenceCents !== null && Math.abs(audit.differenceCents) > TOLERANCIA_CENTS) { puladas.push({ osId, osNumber: audit.osNumber, motivo: "divergência na re-análise" }); continue; }

        const { data: bRows } = await supabaseAdmin.from("escort_billings").select("*").eq("service_order_id", osId).limit(1);
        const billing = bRows?.[0];
        if (!billing || billing.status !== "A_VERIFICAR") { puladas.push({ osId, osNumber: audit.osNumber, motivo: "billing indisponível" }); continue; }

        const now = new Date();
        const boletim = `BO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(Math.random().toString(36).substring(2, 6)).toUpperCase()}`;

        // MESMO efeito do /revisar APROVADA (§8/TOR-0408): recalcula pela tabela
        // resolvida e persiste todos os campos derivados + fat_calculado na OS.
        const updateData: any = {
          status: "APROVADA",
          boletim_numero: boletim, boletim_gerado: true,
          contract_id: audit.contractId || billing.contract_id,
          revisado_por: (user as any).email ? `${user.name} (${(user as any).email})` : user.name,
          revisado_em: now.toISOString(),
        };
        try {
          const { data: contrato } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", updateData.contract_id).single();
          const { data: soRow } = await supabaseAdmin.from("service_orders")
            .select("mission_started_at, completed_date, scheduled_date").eq("id", osId).maybeSingle();
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
            inicio_ts: soRow?.mission_started_at || null,
            fim_ts: soRow?.completed_date || null,
            scheduled_date: soRow?.scheduled_date || null,
            despesas_pedagio: Number(billing.despesas_pedagio || 0),
            despesas_combustivel: Number(billing.despesas_combustivel || 0),
            despesas_outras: Number(billing.despesas_outras || 0),
            receitas_os: Number(billing.receitas_os || 0),
            contrato,
          });
          Object.assign(updateData, {
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
          });
          const nn = (v: any) => Number(v) || 0;
          const totalCalc = nn(resultado.fat_acionamento) + nn(resultado.fat_hora_extra) + nn(resultado.fat_km) +
            nn(resultado.despesas?.pedagio) + nn(resultado.fat_adicional_noturno) + nn(resultado.fat_estadia) +
            nn(resultado.fat_pernoite) + nn(resultado.despesas?.outras) + nn(resultado.receitas_os);
          await supabaseAdmin.from("service_orders").update({ fat_calculado: totalCalc }).eq("id", osId);
        } catch (calcErr: any) {
          puladas.push({ osId, osNumber: audit.osNumber, motivo: `recalcular falhou: ${calcErr?.message}` });
          continue;
        }

        // Trava anti-corrida: só aprova se o billing continua A_VERIFICAR e com o
        // MESMO fat_total auditado (edição concorrente invalida a análise).
        let q = supabaseAdmin.from("escort_billings").update(updateData)
          .eq("id", billing.id).eq("status", "A_VERIFICAR");
        q = billing.fat_total === null || billing.fat_total === undefined
          ? q.is("fat_total", null)
          : q.eq("fat_total", billing.fat_total);
        const { data: upd, error } = await q.select().single();
        if (error || !upd) { puladas.push({ osId, osNumber: audit.osNumber, motivo: error?.message || "billing mudou durante a aprovação" }); continue; }

        const totalFat = osCanonicalTotal(upd);
        await removeAutoTransaction("escort_billing", String(upd.id));
        await removeAutoTransaction("service_order", String(osId));
        if (totalFat > 0) {
          await createAutoTransaction({
            description: `ESCOLTA ${boletim} - ${upd.client_name || "Cliente"} (${upd.origem || ""} → ${upd.destino || ""})`.trim(),
            amount: totalFat, type: "INCOME",
            due_date: (upd.data_missao || upd.created_at || now.toISOString()).split("T")[0],
            origin_type: "escort_billing", origin_id: upd.id,
            category_name: "Faturamento Escolta", entity_name: upd.client_name || null,
            created_by: user.name,
          });
        }
        if (upd.service_order_id) {
          await supabaseAdmin.from("service_orders").update({ status: "concluida" }).eq("id", upd.service_order_id);
        }
        await logSystemAudit({
          userId: user.id, userName: user.name, userRole: user.role,
          action: "APROVAR_MISSAO", targetId: String(upd.id), targetType: "escort_billing",
          details: `OS #${osId} aprovada em LOTE pelo Gestor de Medição (CALCULADO_OK, dif ${(audit.differenceCents || 0) / 100}). Boletim ${boletim}. Valor R$${totalFat.toFixed(2)}.`,
          ipAddress: req.ip,
        });
        aprovadas.push({ osId, osNumber: audit.osNumber, boletim, valor: totalFat });
      }
      bustBalancoCaches();
      res.json({ aprovadas, puladas, totalAprovado: aprovadas.reduce((s, a) => s + a.valor, 0) });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ---- Justificar EXCEÇÃO (diretoria): aprova MANTENDO o valor divergente ----
  app.post("/api/gestor-medicao/excecao/:osId", requireAuth, requireDiretoria, async (req, res) => {
    try {
      const user = req.user!;
      const osId = Number(req.params.osId);
      const motivo = String(req.body?.motivo || "").trim();
      if (motivo.length < 10) return res.status(400).json({ message: "Justificativa obrigatória (mínimo 10 caracteres)." });

      const audit = await auditarOsById(osId);
      if (!audit) return res.status(404).json({ message: "OS não encontrada" });
      if (audit.osStatus === "recusada") return res.status(400).json({ message: "OS recusada não pode ser aprovada (§8.1 — R$ 0,00 incondicional)." });
      if (audit.billingStatus !== "A_VERIFICAR") return res.status(400).json({ message: `Billing está ${audit.billingStatus} — só A_VERIFICAR aceita exceção.` });

      const { data: bRows } = await supabaseAdmin.from("escort_billings").select("*").eq("service_order_id", osId).limit(1);
      const billing = bRows?.[0];
      if (!billing) return res.status(404).json({ message: "Billing não encontrado" });

      const now = new Date();
      const boletim = `BO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(Math.random().toString(36).substring(2, 6)).toUpperCase()}`;
      // Exceção NÃO recalcula: aprova mantendo os valores como estão. Trava
      // anti-corrida: só passa se status e fat_total continuam os auditados.
      let q = supabaseAdmin.from("escort_billings").update({
        status: "APROVADA",
        boletim_numero: boletim, boletim_gerado: true,
        revisado_por: `${user.name}${(user as any).email ? ` (${(user as any).email})` : ""} — EXCEÇÃO JUSTIFICADA`,
        revisado_em: now.toISOString(),
        observacoes: `${billing.observacoes ? billing.observacoes + " | " : ""}EXCEÇÃO: ${motivo}`,
      }).eq("id", billing.id).eq("status", "A_VERIFICAR");
      q = billing.fat_total === null || billing.fat_total === undefined
        ? q.is("fat_total", null)
        : q.eq("fat_total", billing.fat_total);
      const { data: upd, error } = await q.select().single();
      if (error || !upd) return res.status(409).json({ message: error?.message || "Billing mudou durante a operação — reanalise antes de aprovar" });

      // Preserva EXATAMENTE o valor cobrado que foi auditado (mesma régua da
      // análise e do boletim), sem recálculo.
      const totalFat = billingTotalForBoletim(upd, audit.osStatus);
      await removeAutoTransaction("escort_billing", String(upd.id));
      await removeAutoTransaction("service_order", String(osId));
      if (totalFat > 0) {
        await createAutoTransaction({
          description: `ESCOLTA ${boletim} - ${upd.client_name || "Cliente"} (${upd.origem || ""} → ${upd.destino || ""})`.trim(),
          amount: totalFat, type: "INCOME",
          due_date: (upd.data_missao || upd.created_at || now.toISOString()).split("T")[0],
          origin_type: "escort_billing", origin_id: upd.id,
          category_name: "Faturamento Escolta", entity_name: upd.client_name || null,
          created_by: user.name,
        });
      }
      if (audit.osStatus === "concluida") {
        await supabaseAdmin.from("service_orders").update({ status: "concluida" }).eq("id", osId);
      }
      // Registro reproduzível da exceção no histórico de auditoria
      await supabaseAdmin.from("medicao_audits").insert({
        service_order_id: osId, analyzed_at: now.toISOString(), analyzed_by: user.name,
        analysis_status: "EXCECAO_JUSTIFICADA", verdict: "APROVADA POR EXCEÇÃO — JUSTIFICATIVA REGISTRADA",
        recommendation: "REVISAR", risk_level: audit.riskLevel,
        os_status: audit.osStatus, billing_status: "APROVADA", contract_id: audit.contractId,
        expected_total: audit.expectedTotalCents === null ? null : audit.expectedTotalCents / 100,
        charged_total: audit.chargedTotalCents / 100,
        difference: audit.differenceCents === null ? null : audit.differenceCents / 100,
        issues: audit.issues, memoria: { ...audit.memoria, excecao: { motivo, usuario: user.name, em: now.toISOString(), valor_aprovado: totalFat } },
      });
      await logSystemAudit({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "APROVAR_MISSAO", targetId: String(upd.id), targetType: "escort_billing",
        details: `OS #${osId} aprovada por EXCEÇÃO (diretoria). Correto R$${((audit.expectedTotalCents || 0) / 100).toFixed(2)}, aprovado R$${totalFat.toFixed(2)}. Motivo: ${motivo}`,
        ipAddress: req.ip,
      });
      bustBalancoCaches();
      res.json({ ok: true, boletim, valor: totalFat });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
