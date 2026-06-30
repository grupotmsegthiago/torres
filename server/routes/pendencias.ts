import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";

/**
 * Quadro de Pendências — agrega itens que exigem ação da administração:
 *  - Holerites pendentes de assinatura
 *  - Contratos de Experiência (45d) pendentes
 *  - Contratos Definitivos (CLT) pendentes
 *  - Documentos de funcionários vencendo (próx. 30 dias) ou vencidos
 *
 * Retorna contagens + amostra (até 10) de cada categoria para exibição no
 * Painel de Controle do admin.
 */
export function registerPendenciasRoutes(app: Express) {
  app.get("/api/admin/pendencias", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      // Datas BRT
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const in30 = (() => {
        const d = new Date(today + "T00:00:00-03:00");
        d.setDate(d.getDate() + 30);
        return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
      })();

      // Mapa funcionários para enriquecimento de nomes
      const { data: empsRaw } = await supabaseAdmin
        .from("employees")
        .select("id, name, role, status, matricula");
      const empMap = new Map<number, any>();
      for (const e of empsRaw || []) empMap.set(e.id, e);

      // ---- Holerites pendentes (status != assinado) ----
      const { data: psRaw } = await supabaseAdmin
        .from("employee_payslips")
        .select("id, employee_id, month, year, assinatura_status, created_at")
        .neq("assinatura_status", "assinado")
        .order("year", { ascending: false }).order("month", { ascending: false })
        .limit(50);
      const holerites = (psRaw || []).map((p: any) => ({
        id: p.id,
        employeeId: p.employee_id,
        employeeName: empMap.get(p.employee_id)?.name || "—",
        month: p.month,
        year: p.year,
      }));

      // ---- Contratos de Experiência pendentes (sem assinatura e sem bypass) ----
      const { data: probRaw } = await supabaseAdmin
        .from("employee_probation_contracts")
        .select("id, employee_id, start_date, end_date, funcao, assinatura_status, bypass_diretoria, created_at")
        .neq("assinatura_status", "assinado")
        .order("created_at", { ascending: false })
        .limit(50);
      const probacao = (probRaw || [])
        .filter((c: any) => !c.bypass_diretoria)
        .map((c: any) => ({
          id: c.id,
          employeeId: c.employee_id,
          employeeName: empMap.get(c.employee_id)?.name || "—",
          startDate: String(c.start_date).slice(0, 10),
          endDate: String(c.end_date).slice(0, 10),
          funcao: c.funcao,
        }));

      // ---- Contratos Definitivos pendentes ----
      const { data: permRaw } = await supabaseAdmin
        .from("employee_permanent_contracts")
        .select("id, employee_id, start_date, funcao, assinatura_status, bypass_diretoria, created_at")
        .neq("assinatura_status", "assinado")
        .order("created_at", { ascending: false })
        .limit(50);
      const definitivo = (permRaw || [])
        .filter((c: any) => !c.bypass_diretoria)
        .map((c: any) => ({
          id: c.id,
          employeeId: c.employee_id,
          employeeName: empMap.get(c.employee_id)?.name || "—",
          startDate: String(c.start_date).slice(0, 10),
          funcao: c.funcao,
        }));

      // ---- Documentos vencendo (próx. 30d) ou vencidos ----
      const { data: docsRaw } = await supabaseAdmin
        .from("employee_documents")
        .select("id, employee_id, type, expiry_date")
        .lte("expiry_date", in30)
        .order("expiry_date", { ascending: true })
        .limit(80);
      const documentos = (docsRaw || [])
        .filter((d: any) => d.expiry_date && (empMap.get(d.employee_id)?.status === "ativo"))
        .map((d: any) => ({
          id: d.id,
          employeeId: d.employee_id,
          employeeName: empMap.get(d.employee_id)?.name || "—",
          type: d.type,
          expirationDate: String(d.expiry_date).slice(0, 10),
          vencido: String(d.expiry_date).slice(0, 10) < today,
        }));

      // ---- Documentos assináveis RH pendentes (não assinados) ----
      const { data: signRaw } = await supabaseAdmin
        .from("employee_signable_documents")
        .select("id, employee_id, document_type, title, assinatura_status, created_at")
        .neq("assinatura_status", "assinado")
        .order("created_at", { ascending: false })
        .limit(80);
      const assinaveis = (signRaw || [])
        .filter((d: any) => empMap.get(d.employee_id)?.status === "ativo")
        .map((d: any) => ({
          id: d.id,
          employeeId: d.employee_id,
          employeeName: empMap.get(d.employee_id)?.name || "—",
          documentType: d.document_type,
          title: d.title,
          createdAt: String(d.created_at).slice(0, 10),
        }));

      const total = holerites.length + probacao.length + definitivo.length + documentos.length + assinaveis.length;

      res.json({
        total,
        holerites: { count: holerites.length, items: holerites.slice(0, 10) },
        probacao: { count: probacao.length, items: probacao.slice(0, 10) },
        definitivo: { count: definitivo.length, items: definitivo.slice(0, 10) },
        documentos: { count: documentos.length, items: documentos.slice(0, 10) },
        assinaveis: { count: assinaveis.length, items: assinaveis.slice(0, 10) },
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[pendencias]", err);
      res.status(500).json({ message: err.message });
    }
  });
}
