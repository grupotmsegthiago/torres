import { supabaseAdmin } from "../supabase";

const INATIVOS = new Set(["inativo", "desligado", "bloqueado", "demitido"]);

function num(v: any): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Mês civil ANTERIOR em BRT, no formato "YYYY-MM".
 * Usado pelo cron do dia 1 para fechar o mês que acabou de terminar.
 */
export function prevMonthRef(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(d); // "YYYY-MM"
  const [y, m] = parts.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

export interface SnapshotResult {
  mes: string;
  ativos: number;
  saved: number;
  skipped: number;
}

/**
 * Grava (upsert) o histórico mensal da folha de TODOS os funcionários ativos para
 * o mês de referência `mesRef` ("YYYY-MM"). Espelha exatamente o cálculo do Balanço
 * Gerencial / Folha de Ponto (buildFolhaStats com multiplicadorHE 1.6 — CCT).
 *
 * `custo_real` = vencimentos + benefícios (recolhimentos NÃO somam — item 4).
 * Os recolhimentos (FGTS, INSS patronal, seguro de vida) são gravados como campos
 * informativos. Idempotente: re-rodar para o mesmo mês sobrescreve os números.
 */
export async function snapshotFolhaMes(
  mesRef: string,
  opts: { source?: string } = {},
): Promise<SnapshotResult> {
  const source = opts.source || "auto";
  const { buildFolhaStats } = await import("../control-id");

  const { data: employees, error } = await supabaseAdmin
    .from("employees")
    .select("id, name, status, role, tipo_contratacao");
  if (error) throw new Error(error.message);

  const ativos = (employees || []).filter(
    (e: any) => !INATIVOS.has(String(e.status || "").toLowerCase()),
  );

  // Calcula a folha de cada agente com concorrência limitada (espelha rh-summary)
  // — 21 funcionários em série estouram timeout no endpoint HTTP. Limiter inline
  // pra não depender de pacote ESM-only (quebra no bundle CJS de produção).
  const CONCURRENCY = 6;
  const statsByIdx: (any | null)[] = new Array(ativos.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (cursor < ativos.length) {
      const i = cursor++;
      const emp: any = ativos[i];
      try {
        statsByIdx[i] = await buildFolhaStats(emp.id, mesRef, {
          multiplicadorHE: 1.6,
          employee: { role: emp.role, tipo_contratacao: emp.tipo_contratacao },
        });
      } catch (e: any) {
        console.warn(`[folha-historico] buildFolhaStats(${emp.id}, ${mesRef}) falhou:`, e?.message || e);
        statsByIdx[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ativos.length) }, () => worker()));

  const rows: any[] = [];
  let skipped = 0;

  for (let i = 0; i < ativos.length; i++) {
    const emp: any = ativos[i];
    const s: any = statsByIdx[i];
    if (!s) {
      skipped++;
      continue;
    }
    rows.push({
      employee_id: emp.id,
      employee_name: emp.name,
      month_year: mesRef,
      horas_trabalhadas: num(s.hoursWorked),
      horas_extra: num(s.horaExtra),
      horas_noturnas: num(s.horasNoturnas),
      base_salary: num(s.baseSalary),
      periculosidade: num(s.periculosidade),
      custo_extra: num(s.custoExtra),
      adicional_noturno: num(s.adicionalNoturno),
      vencimentos_total: num(s.vencimentosTotal),
      vale_refeicao: num(s.valeRefeicao),
      cesta_basica: num(s.cestaBasica),
      diarias: num(s.diarias),
      beneficios_total: num(s.beneficiosTotal),
      fgts: num(s.fgts),
      inss_patronal: num(s.inssPatronal),
      seguro_vida: num(s.seguroVida),
      recolhimentos_total: num(s.recolhimentosTotal),
      custo_real: num(s.custoTotalEstimado),
      custo_com_encargos: num(s.custoComEncargos),
      valor_hora: num(s.valorHora),
      valor_hora_extra: num(s.valorHoraExtra),
      inss_funcionario: num(s.inssFuncionario),
      irrf_funcionario: num(s.irrfFuncionario),
      liquido_funcionario: num(s.liquidoFuncionario),
      stats_json: s,
      source,
    });
  }

  let saved = 0;
  if (rows.length) {
    const { error: upErr } = await supabaseAdmin
      .from("folha_historico_mensal")
      .upsert(rows, { onConflict: "employee_id,month_year" });
    if (upErr) throw new Error(upErr.message);
    saved = rows.length;
  }

  return { mes: mesRef, ativos: ativos.length, saved, skipped };
}

/**
 * Catch-up: só executa o snapshot de `mesRef` se ainda NÃO houver nenhuma linha
 * gravada para o mês. Usado pelo cron diário dos primeiros dias do mês para
 * recuperar o snapshot caso o Supabase estivesse fora no dia 1 às 05:00.
 * Retorna null quando o mês já tem histórico (nada a fazer).
 */
export async function snapshotFolhaMesIfMissing(
  mesRef: string,
  opts: { source?: string } = {},
): Promise<SnapshotResult | null> {
  const { count, error } = await supabaseAdmin
    .from("folha_historico_mensal")
    .select("id", { count: "exact", head: true })
    .eq("month_year", mesRef);
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) return null;
  return snapshotFolhaMes(mesRef, { source: opts.source || "auto-catchup" });
}
