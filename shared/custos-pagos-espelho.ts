import { toDateKey } from "./date-key";

/** Lançamento do ledger. Espelho de leitura: só status PAID entra. */
export type TxPago = {
  id?: string | number | null;
  type?: string | null;
  status?: string | null;
  amount?: number | string | null;
  category_id?: string | number | null;
  category_name?: string | null;
  description?: string | null;
  entity_name?: string | null;
  due_date?: string | null;
  payment_date?: string | null;
};

export type LinhaTom = "melhoria" | "queda" | "novo" | "aguardando" | "estavel";

export type CategoriaPaga = {
  nome: string;
  out: number;
  dia: number;
  mes: number;
  linha: string;
  tom: LinhaTom;
  jae: number | null;
};

export type JanelaPago = "ate-hoje" | "mesmo-dia" | "resto";

export type LancamentoPago = {
  id?: string;
  tipo: "Saiu" | "Entrou";
  categoria: string;
  /** Id da subcategoria no cadastro financeiro. */
  categoryId?: string;
  /** Nome da subcategoria gravado no lançamento (`category_name`). */
  subcategoria?: string;
  valor: number;
  data: string;
  /** YYYY-MM-DD da data de caixa. Serve para ordenar; a tela usa `data`. */
  chave: string;
  descricao: string;
  entidade: string;
  vencimento: string;
  janela: JanelaPago;
};

export type CustosPagosEspelho = {
  hoje: string;
  dia: number;
  saiuHoje: number;
  saiuMesmoDia: number;
  saiuMes: number;
  entrouHoje: number;
  entrouMesmoDia: number;
  entrouMes: number;
  saldoHoje: number;
  saldoMesmoDia: number;
  saldoMes: number;
  linha: string;
  tom: LinhaTom;
  categorias: CategoriaPaga[];
  aguardando: CategoriaPaga[];
  /** Pagos no mês vigente, até o dia de hoje. */
  lancamentos: LancamentoPago[];
  /** Pagos no mês passado: mesmo dia, ou o restante depois desse dia. */
  lancamentosComparacao: LancamentoPago[];
};

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function lastDay(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function refDate(tx: TxPago): string | null {
  return toDateKey(tx.payment_date) || toDateKey(tx.due_date);
}

function ddmm(dt: string): string {
  if (dt.length < 10) return "";
  return `${dt.slice(8, 10)}/${dt.slice(5, 7)}`;
}

function amount(tx: TxPago): number {
  const n = Number(tx.amount);
  return Number.isFinite(n) ? n : 0;
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Pessoal na frente, nesta ordem. O restante vem depois, por valor. */
export const ORDEM_PESSOAL = [
  "Salário e Folha de Pagamento",
  "Horas Extras",
  "Diárias",
  "Vale Refeição",
  "Ajuda de Custo",
  "Vale Transporte",
] as const;

const pessoalSet = new Set<string>(ORDEM_PESSOAL);

/**
 * Separa o pessoal pela descrição do lançamento.
 * Salário e folha continuam juntos. Reembolso e Reebolso continuam juntos.
 * A descrição original do lançamento não muda.
 */
function catName(tx: TxPago): string {
  const n = String(tx.category_name || "").trim();
  const cat = fold(n);
  const texto = fold(`${n} ${tx.description || ""}`);
  if (cat === "vale transporte" || texto.includes("vale transporte")) return "Vale Transporte";
  if (texto.includes("vale refeic") || texto.includes("flash beneficio") || texto.includes("flash vr") || /(^|[^a-z])vr([^a-z]|$)/.test(texto)) return "Vale Refeição";
  if (texto.includes("ajuda de custo")) return "Ajuda de Custo";
  if (texto.includes("horas extra") || texto.includes("hora extra") || texto.includes("bonificacao hora") || /\d+\s*horas?\b/.test(texto)) return "Horas Extras";
  if (texto.includes("diaria")) return "Diárias";
  if (cat === "salario" || cat === "folha de pagamento" || texto.includes("rescisao") || texto.includes("pagamento salarial") || texto.includes("pagamento de salario")) return "Salário e Folha de Pagamento";
  if (cat === "reembolso" || cat === "reebolso") return "Reembolso";
  return n || "Sem categoria";
}

export function linhaGasto(atual: number, anterior: number): { linha: string; tom: LinhaTom } {
  if (anterior <= 0 && atual > 0) return { linha: "novo neste dia", tom: "novo" };
  if (atual <= 0 && anterior > 0) return { linha: "aguardando · ainda não pago", tom: "aguardando" };
  if (anterior <= 0) return { linha: "estável", tom: "estavel" };
  const delta = ((atual - anterior) / anterior) * 100;
  if (Math.abs(delta) < 5) return { linha: "estável", tom: "estavel" };
  const pct = `${Math.abs(delta).toFixed(0)}%`;
  if (delta < 0) return { linha: `melhoria · ↓ ${pct}`, tom: "melhoria" };
  return { linha: `queda · ↑ ${pct}`, tom: "queda" };
}

/**
 * Espelho do contas a pagar pago.
 * Data do caixa = payment_date, ou due_date se o pagamento não tiver data.
 * "Mesmo dia" = dia 1 até o dia de `hoje` no mês anterior.
 * "Mês passado" = mês anterior fechado.
 */
export function buildCustosPagosEspelho(rows: TxPago[], hoje: string): CustosPagosEspelho {
  const key = toDateKey(hoje);
  if (!key) throw new Error("hoje inválido");
  const [ys, ms, ds] = key.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const same = Math.min(d, lastDay(prevY, prevM));
  const curFrom = ymd(y, m, 1);
  const prevFrom = ymd(prevY, prevM, 1);
  const prevSameTo = ymd(prevY, prevM, same);
  const prevFullTo = ymd(prevY, prevM, lastDay(prevY, prevM));

  const inCur = (dt: string) => dt >= curFrom && dt <= key;
  const inSame = (dt: string) => dt >= prevFrom && dt <= prevSameTo;
  const inFull = (dt: string) => dt >= prevFrom && dt <= prevFullTo;

  type Acc = { out: number; dia: number; mes: number };
  const map = new Map<string, Acc>();
  const touch = (nome: string) => {
    let row = map.get(nome);
    if (!row) {
      row = { out: 0, dia: 0, mes: 0 };
      map.set(nome, row);
    }
    return row;
  };

  let saiuHoje = 0, saiuMesmoDia = 0, saiuMes = 0;
  let entrouHoje = 0, entrouMesmoDia = 0, entrouMes = 0;
  const lancamentos: LancamentoPago[] = [];
  const lancamentosComparacao: LancamentoPago[] = [];

  for (const tx of rows) {
    if (String(tx.status || "").toUpperCase() !== "PAID") continue;
    const dt = refDate(tx);
    if (!dt) continue;
    const valor = amount(tx);
    if (!(valor > 0)) continue;
    const tipo = String(tx.type || "").toUpperCase();
    const expense = tipo === "EXPENSE";
    const income = tipo === "INCOME";
    if (!expense && !income) continue;

    if (expense && inCur(dt)) {
      saiuHoje += valor;
      touch(catName(tx)).out += valor;
    } else if (income && inCur(dt)) {
      entrouHoje += valor;
    }
    if (expense && inSame(dt)) {
      saiuMesmoDia += valor;
      touch(catName(tx)).dia += valor;
    } else if (income && inSame(dt)) {
      entrouMesmoDia += valor;
    }
    if (expense && inFull(dt)) {
      saiuMes += valor;
      touch(catName(tx)).mes += valor;
    } else if (income && inFull(dt)) {
      entrouMes += valor;
    }

    const item: LancamentoPago = {
      id: tx.id != null && String(tx.id).trim() ? String(tx.id) : undefined,
      tipo: expense ? "Saiu" : "Entrou",
      categoria: catName(tx),
      categoryId: tx.category_id != null && String(tx.category_id).trim() ? String(tx.category_id) : undefined,
      subcategoria: String(tx.category_name || "").trim() || undefined,
      valor,
      chave: dt,
      data: ddmm(dt),
      descricao: String(tx.description || "").trim() || "—",
      entidade: String(tx.entity_name || "").trim(),
      vencimento: ddmm(toDateKey(tx.due_date) || ""),
      janela: "ate-hoje",
    };
    if (inCur(dt)) {
      lancamentos.push(item);
    } else if (expense && inFull(dt)) {
      lancamentosComparacao.push({ ...item, janela: inSame(dt) ? "mesmo-dia" : "resto" });
    }
  }

  const todas: CategoriaPaga[] = [...map.entries()].map(([nome, a]) => {
    const l = linhaGasto(a.out, a.dia);
    return {
      nome,
      out: round2(a.out),
      dia: round2(a.dia),
      mes: round2(a.mes),
      linha: l.linha,
      tom: l.tom,
      jae: a.mes > 0 ? a.out / a.mes : null,
    };
  });

  const pessoal = ORDEM_PESSOAL
    .map((nome) => todas.find((c) => c.nome === nome))
    .filter((c): c is CategoriaPaga => !!c && (c.out > 0 || c.dia > 0 || c.mes > 0));
  const outras = todas
    .filter((c) => !pessoalSet.has(c.nome) && c.out > 0)
    .sort((a, b) => b.out - a.out);
  const categorias = [...pessoal, ...outras];
  const aguardando = todas
    .filter((c) => !pessoalSet.has(c.nome) && c.out <= 0 && c.dia > 0)
    .sort((a, b) => b.dia - a.dia);
  const porData = (a: LancamentoPago, b: LancamentoPago) => b.chave.localeCompare(a.chave) || b.valor - a.valor;
  lancamentos.sort(porData);
  lancamentosComparacao.sort(porData);

  const empresa = linhaGasto(saiuHoje, saiuMesmoDia);
  return {
    hoje: key,
    dia: d,
    saiuHoje: round2(saiuHoje),
    saiuMesmoDia: round2(saiuMesmoDia),
    saiuMes: round2(saiuMes),
    entrouHoje: round2(entrouHoje),
    entrouMesmoDia: round2(entrouMesmoDia),
    entrouMes: round2(entrouMes),
    saldoHoje: round2(entrouHoje - saiuHoje),
    saldoMesmoDia: round2(entrouMesmoDia - saiuMesmoDia),
    saldoMes: round2(entrouMes - saiuMes),
    linha: empresa.linha,
    tom: empresa.tom,
    categorias,
    aguardando,
    lancamentos,
    lancamentosComparacao,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export type MesPago = { chave: string; nome: string; total: number };
export type LinhaMesPago = { nome: string; valores: number[]; pessoal: boolean };

/** Pago por mês, na ordem pedida. Pessoal na frente; o restante por valor. */
export function buildCustosPorMes(rows: TxPago[], ano: number, meses: number[]): { meses: MesPago[]; linhas: LinhaMesPago[] } {
  const chaves = meses.map((m) => `${ano}-${String(m).padStart(2, "0")}`);
  const totais = meses.map(() => 0);
  const map = new Map<string, number[]>();
  for (const tx of rows) {
    if (String(tx.status || "").toUpperCase() !== "PAID") continue;
    if (String(tx.type || "").toUpperCase() !== "EXPENSE") continue;
    const dt = refDate(tx);
    if (!dt) continue;
    const idx = chaves.findIndex((c) => dt.startsWith(c));
    if (idx < 0) continue;
    const valor = amount(tx);
    if (!(valor > 0)) continue;
    const nome = catName(tx);
    let linha = map.get(nome);
    if (!linha) {
      linha = meses.map(() => 0);
      map.set(nome, linha);
    }
    linha[idx] += valor;
    totais[idx] += valor;
  }
  const todas: LinhaMesPago[] = [...map.entries()].map(([nome, valores]) => ({
    nome,
    valores: valores.map(round2),
    pessoal: pessoalSet.has(nome),
  }));
  const pessoal = ORDEM_PESSOAL
    .map((nome) => todas.find((l) => l.nome === nome))
    .filter((l): l is LinhaMesPago => !!l);
  const outras = todas
    .filter((l) => !l.pessoal)
    .sort((a, b) => b.valores.reduce((s, n) => s + n, 0) - a.valores.reduce((s, n) => s + n, 0));
  return {
    meses: meses.map((m, i) => ({ chave: chaves[i], nome: NOMES_MES[m - 1] || String(m), total: round2(totais[i]) })),
    linhas: [...pessoal, ...outras],
  };
}

export type DetalheMesPago = MesPago & { itens: LancamentoPago[] };

/** Pagamentos de uma categoria, mês a mês, na mesma regra do quadro. */
export function detalheCategoriaPorMes(rows: TxPago[], ano: number, meses: number[], categoria: string): DetalheMesPago[] {
  const chaves = meses.map((m) => `${ano}-${String(m).padStart(2, "0")}`);
  const grupos: DetalheMesPago[] = meses.map((m, i) => ({
    chave: chaves[i],
    nome: NOMES_MES[m - 1] || String(m),
    total: 0,
    itens: [],
  }));
  for (const tx of rows) {
    if (String(tx.status || "").toUpperCase() !== "PAID") continue;
    if (String(tx.type || "").toUpperCase() !== "EXPENSE") continue;
    const dt = refDate(tx);
    if (!dt) continue;
    const idx = chaves.findIndex((c) => dt.startsWith(c));
    if (idx < 0) continue;
    const valor = amount(tx);
    if (!(valor > 0)) continue;
    if (catName(tx) !== categoria) continue;
    const grupo = grupos[idx];
    grupo.total += valor;
    grupo.itens.push({
      id: tx.id != null && String(tx.id).trim() ? String(tx.id) : undefined,
      tipo: "Saiu",
      categoria,
      categoryId: tx.category_id != null && String(tx.category_id).trim() ? String(tx.category_id) : undefined,
      subcategoria: String(tx.category_name || "").trim() || undefined,
      valor,
      chave: dt,
      data: ddmm(dt),
      descricao: String(tx.description || "").trim() || "—",
      entidade: String(tx.entity_name || "").trim(),
      vencimento: ddmm(toDateKey(tx.due_date) || ""),
      janela: "ate-hoje",
    });
  }
  for (const grupo of grupos) {
    grupo.total = round2(grupo.total);
    grupo.itens.sort((a, b) => b.chave.localeCompare(a.chave) || b.valor - a.valor);
  }
  return grupos;
}
