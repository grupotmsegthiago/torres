/**
 * TRAVA DE PERÍODO FECHADO POR FOLHA (control_id_locked_periods).
 *
 * Contexto / por quê (ordem do dono, 30/06/2026):
 *   Quando a folha de ponto de um período é FECHADA (ex.: as batidas dos PDFs
 *   "Cartão de Ponto" do Control iD são importadas como verdade), a reconciliação
 *   diária (`runDailyReconciliation`, cron 00:00 BRT) roda `syncDevice` em
 *   FULL BACKFILL e REIMPORTARIA as batidas brutas do AFD que o cartão corrigido
 *   já não mostra — desfazendo o fechamento e ressuscitando duplicatas. O export
 *   corretivo poderia ainda empurrar batidas pro RHID.
 *
 *   Esta trava marca intervalos de datas (BRT) como FECHADOS. O import e o export
 *   da reconciliação PULAM qualquer batida cuja data-calendário BRT caia dentro de
 *   um período fechado. Assim o período fechado por folha não é mais tocado pela
 *   automação.
 *
 *   Destravar (DELETE) é restrito à DIRETORIA (rota com requireDiretoria): só a
 *   diretoria pode reabrir um período pra reimport/reexport.
 *
 * FAIL-CLOSED proposital (corrigido 30/06/2026 após code review): se a leitura
 * da tabela falhar por um erro REAL (rede/cache/RPC), `getLockedPeriods` LANÇA o
 * erro — porque o import (fullBackfill) e o export rodariam SEM trava e
 * ressuscitariam exatamente as batidas que a trava deve impedir. Preferível
 * abortar o sync com erro explícito a desfazer silenciosamente um fechamento de
 * folha. Única exceção fail-open: a tabela ainda NÃO existir (pré-DDL), tratado
 * como "nenhum período fechado".
 */
import { supabaseAdmin } from "../supabase";
import { brtDateKey } from "./brt-date";

/**
 * Erro "tabela não existe" (ambiente pré-DDL, antes do db-init criar a tabela).
 * Pura/testável. Só esse caso é fail-open; qualquer outro erro é fail-closed.
 */
export function isMissingTableError(message: unknown): boolean {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find") ||
    m.includes("42p01") // undefined_table
  );
}

export interface LockedPeriod {
  id: number;
  /** "YYYY-MM-DD" BRT, INCLUSIVO. */
  startDate: string;
  /** "YYYY-MM-DD" BRT, INCLUSIVO. */
  endDate: string;
  /** null = vale pra todos os aparelhos. */
  deviceId: number | null;
  note: string | null;
}

/**
 * Carrega os períodos fechados aplicáveis a um device (ou todos se deviceId null).
 * Um período com device_id null vale pra qualquer aparelho.
 */
export async function getLockedPeriods(deviceId?: number | null): Promise<LockedPeriod[]> {
  const { data, error } = await supabaseAdmin
    .from("control_id_locked_periods")
    .select("id, start_date, end_date, device_id, note")
    .order("start_date", { ascending: false });
  if (error) {
    if (isMissingTableError(error.message)) {
      // Pré-DDL: tabela ainda não existe ⇒ nenhum período fechado (fail-open seguro).
      console.warn(`[locked-periods] tabela ainda não existe — tratando como sem períodos fechados: ${error.message}`);
      return [];
    }
    // FAIL-CLOSED: erro real de leitura aborta o sync/export pra não rodar sem trava.
    throw new Error(`[locked-periods] FAIL-CLOSED: não foi possível ler períodos fechados, abortando para não desfazer fechamento de folha: ${error.message}`);
  }
  return ((data || []) as any[])
    .filter((r) => deviceId == null || r.device_id == null || Number(r.device_id) === Number(deviceId))
    .map((r) => ({
      id: Number(r.id),
      startDate: String(r.start_date).slice(0, 10),
      endDate: String(r.end_date).slice(0, 10),
      deviceId: r.device_id == null ? null : Number(r.device_id),
      note: r.note ?? null,
    }));
}

/**
 * Decide se a DATA-CALENDÁRIO BRT de uma batida cai dentro de algum período
 * fechado. Pura (sem I/O) pra ser testável. Compara strings "YYYY-MM-DD"
 * (lexicográfico == cronológico nesse formato), intervalo INCLUSIVO.
 */
export function isDateLocked(punchAt: unknown, periods: LockedPeriod[]): boolean {
  if (!periods.length) return false;
  const ymd = brtDateKey(punchAt);
  if (!ymd) return false;
  for (const p of periods) {
    if (ymd >= p.startDate && ymd <= p.endDate) return true;
  }
  return false;
}
