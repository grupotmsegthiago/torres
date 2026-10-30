/**
 * Recorte do extrato Asaas que ainda está no saldo.
 *
 * A transferência PIX deixa a reserva (R$ 100) na conta. Tudo que entrou
 * depois disso — recebimento, taxa, estorno — é o que o saldo representa.
 * A data escolhe o ciclo mais novo quando o mesmo saldo aparece duas vezes.
 * No mesmo dia, o menor índice vale (extrato Asaas vem do mais novo para o mais antigo).
 */

export type LedgerTx = {
  id: string;
  value: number;
  /** Saldo da conta depois deste lançamento. */
  balance: number | null;
  type: string;
  date: string;
  description: string | null;
  paymentId: string | null;
};

export type CompositionReason = "ok" | "so_reserva" | "sem_ancora" | "cadeia_incompleta";

export type CompositionResult = {
  /** Do mais antigo para o mais novo. */
  items: LedgerTx[];
  /** Saldo que já estava na conta antes do primeiro item (a reserva, quando fecha). */
  openedFrom: number | null;
  covered: boolean;
  reason: CompositionReason;
};

export type MovementKind = "recebimento" | "taxa" | "estorno" | "outro";

export function cents(value: number): number {
  return Math.round((Number(value) || 0) * 100);
}

export function movementKind(type: string, value: number): MovementKind {
  const t = String(type || "").toUpperCase();
  if (t.includes("FEE")) return "taxa";
  if (t.includes("REVERSAL") || t.includes("REFUND") || t.includes("CHARGEBACK")) return "estorno";
  if (value > 0 && (
    t.startsWith("PAYMENT")
    || t.includes("PIX_TRANSACTION_CREDIT")
    || t === "CREDIT"
    || t === "INTERNAL_TRANSFER_CREDIT"
    || t === "TRANSFER"
  )) return "recebimento";
  return "outro";
}

/**
 * `txs` na ordem do extrato: índice 0 é o lançamento mais novo.
 * Empata saldo repetido pelo índice (o mais novo vem primeiro).
 */
export function selectBalanceComposition(
  txs: LedgerTx[],
  currentBalance: number,
  reserve = 100,
): CompositionResult {
  const balanceCents = cents(currentBalance);
  const reserveCents = cents(reserve);

  if (balanceCents <= reserveCents) {
    return { items: [], openedFrom: roundFromCents(balanceCents), covered: true, reason: "so_reserva" };
  }

  const head = pickHead(txs, balanceCents);
  if (head < 0) {
    return { items: [], openedFrom: null, covered: false, reason: "sem_ancora" };
  }

  const used = new Set<number>();
  const newestFirst: LedgerTx[] = [];
  let cursor = head;

  while (!used.has(cursor)) {
    used.add(cursor);
    const tx = txs[cursor];
    const beforeCents = cents(Number(tx.balance) - Number(tx.value));
    newestFirst.push(tx);
    if (beforeCents <= reserveCents) {
      return {
        items: newestFirst.slice().reverse(),
        openedFrom: roundFromCents(beforeCents),
        covered: true,
        reason: "ok",
      };
    }
    const pred = pickPredecessor(txs, cursor, beforeCents, used);
    if (pred == null) {
      return {
        items: newestFirst.slice().reverse(),
        openedFrom: roundFromCents(beforeCents),
        covered: false,
        reason: "cadeia_incompleta",
      };
    }
    cursor = pred;
  }

  return { items: newestFirst.slice().reverse(), openedFrom: null, covered: false, reason: "cadeia_incompleta" };
}

/** Entre saldos iguais, o mais novo é o de data maior. No mesmo dia, o menor índice (extrato desc). */
function pickHead(txs: LedgerTx[], balanceCents: number): number {
  let head = -1;
  for (let i = 0; i < txs.length; i++) {
    const balance = txs[i].balance;
    if (balance == null || cents(balance) !== balanceCents) continue;
    if (head < 0) {
      head = i;
      continue;
    }
    const date = txs[i].date || "";
    const headDate = txs[head].date || "";
    if (date > headDate || (date === headDate && i < head)) head = i;
  }
  return head;
}

function pickPredecessor(txs: LedgerTx[], cursor: number, beforeCents: number, used: Set<number>): number | null {
  const candidates: number[] = [];
  for (let i = 0; i < txs.length; i++) {
    if (used.has(i)) continue;
    const balance = txs[i].balance;
    if (balance == null || cents(balance) !== beforeCents) continue;
    candidates.push(i);
  }
  if (candidates.length === 0) return null;
  const cursorDate = txs[cursor].date || "";
  const notAfter = candidates.filter((i) => (txs[i].date || "") <= cursorDate);
  const pool = notAfter.length > 0 ? notAfter : candidates;
  const maxDate = pool.reduce((max, i) => ((txs[i].date || "") > max ? txs[i].date || "" : max), "");
  const sameDay = pool.filter((i) => (txs[i].date || "") === maxDate);
  const nextInDesc = sameDay.filter((i) => i > cursor).sort((a, b) => a - b);
  if (nextInDesc.length > 0) return nextInDesc[0];
  const nextInAsc = sameDay.filter((i) => i < cursor).sort((a, b) => b - a);
  if (nextInAsc.length > 0) return nextInAsc[0];
  return sameDay[0];
}

function roundFromCents(value: number): number {
  return value / 100;
}

export function mapAsaasFinancialTx(raw: any): LedgerTx | null {
  const id = String(raw?.id || "").trim();
  const value = Number(raw?.value);
  if (!id || !Number.isFinite(value)) return null;
  const balanceRaw = raw?.balance;
  const balance = balanceRaw == null || balanceRaw === "" ? null : Number(balanceRaw);
  const paymentId = raw?.paymentId || raw?.payment?.id || null;
  return {
    id,
    value,
    balance: balance != null && Number.isFinite(balance) ? balance : null,
    type: String(raw?.type || ""),
    date: String(raw?.date || "").slice(0, 10),
    description: raw?.description ? String(raw.description) : null,
    paymentId: paymentId ? String(paymentId) : null,
  };
}
