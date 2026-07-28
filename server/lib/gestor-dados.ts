// =============================================================================
// GESTOR DE DADOS FINANCEIRO — motor de validação de consistência (só leitura)
// Audita duplicidades e reconciliações entre Financeiro, Operações, RH e Fiscal.
// NUNCA calcula valores novos: consome as fontes oficiais (escort_billings,
// invoices, invoice_billing_items, financial_transactions, mission_costs,
// employees/employee_salaries) e a view oficial (oficialBillingView).
// =============================================================================
import { supabaseAdmin } from "../supabase";
import { oficialBillingView, resolverContratoParaBilling } from "./billing-display";

export type Severidade = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";

export interface Achado {
  id: string;               // estável por conteúdo (categoria + refs)
  categoria: string;        // slug da verificação
  severidade: Severidade;
  titulo: string;
  detalhe: string;
  origem: string;           // rota do app onde investigar (link clicável)
  valor?: number;           // impacto financeiro estimado (R$) do achado
  refs: Record<string, any>;
}

export interface ResultadoValidacao {
  geradoEm: string;
  periodo: { de: string };   // corte da auditoria (dados anteriores ficam fora)
  status: "VALIDO" | "ATENCAO" | "INVALIDO";
  integridadePct: number;
  totais: { verificacoes: number; registrosAuditados: number; achados: number; porSeveridade: Record<Severidade, number> };
  cards: { categoria: string; titulo: string; achados: number; severidadeMax: Severidade | null; valorImpactado: number }[];
  achados: Achado[];
  resumoFinanceiro: {
    faturamentoOficial: number;      // soma oficial das OSs elegíveis (view oficial)
    faturamentoFaturado: number;     // soma dos itens de fatura ativos
    recebidoTotal: number;           // soma invoices.valor_recebido
    custosMissoes: number;           // mission_costs
  };
}

const TOL = 0.05; // mesma tolerância de rateio (Etapa 2)

// Corte da auditoria (ordem do dono, 28/07/2026): só analisar dados de
// 01/06/2026 em diante — o histórico anterior é imperfeito e não deve gerar
// apontamento (alinha com a Gestão de Medição, que também olha o período atual).
export const DATA_CORTE = "2026-06-01";

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

const norm = (s: any) => String(s || "").trim().toUpperCase().replace(/\s+/g, " ");
const num = (v: any) => Number(v || 0);
const cancelada = (s: any) => !!s && /CANCEL/i.test(String(s));

export async function executarValidacao(de?: string, ate?: string): Promise<ResultadoValidacao> {
  // Corte mínimo é HARD: nunca auditar antes de DATA_CORTE, mesmo com ?de= manual.
  const DE = de && /^\d{4}-\d{2}-\d{2}$/.test(de) && de > DATA_CORTE ? de : DATA_CORTE;
  const ATE = ate && /^\d{4}-\d{2}-\d{2}$/.test(ate) ? ate : null; // null = sem teto
  const [billingsAll, osRows, invoicesAll, itemsAll, transacoesAll, custosAll, employees, salaries, contratos] = await Promise.all([
    fetchAll("escort_billings", "id, service_order_id, client_id, contract_id, status, invoice_id, fat_total, fat_acionamento, fat_km, fat_hora_extra, fat_adicional_noturno, fat_estadia, fat_pernoite, despesas_pedagio, despesas_outras, receitas_os, km_inicial, km_final, km_total"),
    fetchAll("service_orders", "id, os_number, status, type, client_id, scheduled_date, completed_date"),
    fetchAll("invoices", "id, status, value, net_value, valor_recebido, service_order_id, asaas_payment_id, nfse_number, nfse_status, client_id, due_date, gateway"),
    fetchAll("invoice_billing_items", "id, invoice_id, billing_id, valor_item, valor_alocado"),
    fetchAll("financial_transactions", "id, type, amount, description, due_date, status"),
    fetchAll("mission_costs", "id, service_order_id, category, amount, description"),
    fetchAll("employees", "id, name, cpf, status, role, tipo_contratacao"),
    fetchAll("employee_salaries", "id, employee_id, base_salary, effective_date"),
    fetchAll("escort_contracts", "*"),
  ]);

  // ---- Aplicação do corte de 01/06/2026 ----
  // OS entra pelo dia agendado (ou concluído); fatura pelo vencimento (ou OS
  // vinculada); lançamento pelo vencimento; custo pela OS. RH audita o cadastro
  // ATUAL inteiro (duplicidade de CPF não tem data).
  const osDateById = new Map<number, string>(
    osRows.map((o: any) => [o.id, String(o.scheduled_date || o.completed_date || "").slice(0, 10)]),
  );
  const dentro = (d: string) => (!d ? true : d >= DE && (!ATE || d <= ATE)); // sem data = não dá pra excluir com segurança
  const osNoPeriodo = (osId: any) => dentro(osDateById.get(osId) || "");
  const billings = billingsAll.filter((b: any) => osNoPeriodo(b.service_order_id));
  const invoices = invoicesAll.filter((i: any) => {
    const d = String(i.due_date || "").slice(0, 10);
    if (d) return dentro(d);
    return i.service_order_id == null || osNoPeriodo(i.service_order_id);
  });
  const invoiceIdsNoPeriodo = new Set(invoices.map((i: any) => i.id));
  const items = itemsAll.filter((it: any) => invoiceIdsNoPeriodo.has(it.invoice_id));
  const transacoes = transacoesAll.filter((t: any) => dentro(String(t.due_date || "").slice(0, 10)));
  const custos = custosAll.filter((c: any) => osNoPeriodo(c.service_order_id));

  const achados: Achado[] = [];
  const add = (a: Omit<Achado, "id">) =>
    achados.push({ ...a, id: `${a.categoria}:${Object.values(a.refs).join(":")}` });

  const osById = new Map(osRows.map((o: any) => [o.id, o]));
  const invoiceById = new Map(invoices.map((i: any) => [i.id, i]));
  const invoiceAtiva = (i: any) => i && !cancelada(i.status) && !cancelada(i.nfse_status);

  // 1) Billing duplicado por OS (deveria ser 1:1)
  {
    const porOs = new Map<number, any[]>();
    for (const b of billings) if (b.service_order_id != null) {
      if (!porOs.has(b.service_order_id)) porOs.set(b.service_order_id, []);
      porOs.get(b.service_order_id)!.push(b);
    }
    for (const [osId, list] of Array.from(porOs)) if (list.length > 1) {
      const os: any = osById.get(osId);
      add({ categoria: "billing_duplicado", severidade: "CRITICA",
        titulo: `OS ${os?.os_number || osId} com ${list.length} faturamentos`,
        detalhe: `A mesma OS tem ${list.length} registros de faturamento — risco de cobrança em dobro. Manter só um e excluir os demais.`,
        origem: "/admin/boletim-medicao", valor: list.slice(1).reduce((s: number, b: any) => s + num(b.fat_total), 0),
        refs: { osId, billingIds: list.map((b: any) => b.id).join(",") } });
    }
  }

  // 2) Mesma OS em mais de uma fatura ativa
  {
    const porBilling = new Map<string, number[]>();
    for (const it of items) {
      const inv = invoiceById.get(it.invoice_id);
      if (!invoiceAtiva(inv)) continue;
      const k = String(it.billing_id);
      if (!porBilling.has(k)) porBilling.set(k, []);
      // dedupe: várias linhas de rateio na MESMA fatura são legítimas —
      // só é problema quando são faturas DIFERENTES.
      if (!porBilling.get(k)!.includes(it.invoice_id)) porBilling.get(k)!.push(it.invoice_id);
    }
    const billingById = new Map(billings.map((b: any) => [String(b.id), b]));
    for (const [bid, invIds] of Array.from(porBilling)) if (invIds.length > 1) {
      const b = billingById.get(bid);
      const os: any = b ? osById.get(b.service_order_id) : null;
      add({ categoria: "os_em_multiplas_faturas", severidade: "CRITICA",
        titulo: `OS ${os?.os_number || b?.service_order_id || bid} em ${invIds.length} faturas ativas`,
        detalhe: `A mesma OS está incluída nas faturas #${invIds.join(", #")} — cobrança em duplicidade ao cliente.`,
        origem: "/admin/relatorio-nf", valor: num(b?.fat_total),
        refs: { billingId: bid, invoiceIds: invIds.join(",") } });
    }
  }

  // 3) Fatura duplicada (mesmo pagamento do gateway em 2 faturas / mesmo cliente+valor+vencimento ativos)
  {
    const porPayment = new Map<string, any[]>();
    for (const i of invoices) if (i.asaas_payment_id && invoiceAtiva(i)) {
      const k = String(i.asaas_payment_id);
      if (!porPayment.has(k)) porPayment.set(k, []);
      porPayment.get(k)!.push(i);
    }
    for (const [pid, list] of Array.from(porPayment)) if (list.length > 1)
      add({ categoria: "fatura_duplicada", severidade: "CRITICA",
        titulo: `Cobrança ${pid} vinculada a ${list.length} faturas`,
        detalhe: `Faturas #${list.map((i: any) => i.id).join(", #")} apontam para a mesma cobrança no gateway.`,
        origem: "/admin/relatorio-nf", valor: list.slice(1).reduce((s: number, i: any) => s + num(i.value), 0),
        refs: { paymentId: pid, invoiceIds: list.map((i: any) => i.id).join(",") } });

    const porChave = new Map<string, any[]>();
    for (const i of invoices) if (invoiceAtiva(i) && num(i.value) > 0) {
      const k = `${i.client_id}|${num(i.value).toFixed(2)}|${String(i.due_date || "").slice(0, 10)}`;
      if (!porChave.has(k)) porChave.set(k, []);
      porChave.get(k)!.push(i);
    }
    for (const list of Array.from(porChave.values())) if (list.length > 1) {
      const ids = list.map((i: any) => i.id);
      // se já flagrado pelo payment id, não repete
      if (new Set(list.map((i: any) => i.asaas_payment_id).filter(Boolean)).size === 1 && list[0].asaas_payment_id) continue;
      add({ categoria: "fatura_duplicada", severidade: "ALTA",
        titulo: `Possível fatura em dobro (mesmo cliente, valor e vencimento)`,
        detalhe: `Faturas #${ids.join(", #")} têm o mesmo cliente, valor R$ ${num(list[0].value).toFixed(2)} e vencimento — conferir se não é cobrança duplicada.`,
        origem: "/admin/relatorio-nf", valor: num(list[0].value) * (list.length - 1),
        refs: { invoiceIds: ids.join(",") } });
    }
  }

  // 4) NF repetida (mesmo número em faturas ativas)
  {
    const porNf = new Map<string, any[]>();
    for (const i of invoices) if (i.nfse_number && invoiceAtiva(i)) {
      const k = String(i.nfse_number);
      if (!porNf.has(k)) porNf.set(k, []);
      porNf.get(k)!.push(i);
    }
    for (const [nf, list] of Array.from(porNf)) if (list.length > 1)
      add({ categoria: "nf_repetida", severidade: "CRITICA",
        titulo: `NF ${nf} emitida em ${list.length} faturas`,
        detalhe: `Faturas #${list.map((i: any) => i.id).join(", #")} carregam o mesmo número de NFS-e — risco fiscal.`,
        origem: "/admin/relatorio-nf", valor: list.slice(1).reduce((s: number, i: any) => s + num(i.value), 0),
        refs: { nf, invoiceIds: list.map((i: any) => i.id).join(",") } });
  }

  // 5) Lançamentos financeiros duplicados (mesmo tipo+valor+descrição+data)
  {
    const porChave = new Map<string, any[]>();
    for (const t of transacoes) {
      if (cancelada(t.status)) continue;
      const k = `${t.type}|${num(t.amount).toFixed(2)}|${norm(t.description)}|${String(t.due_date || "").slice(0, 10)}`;
      if (!porChave.has(k)) porChave.set(k, []);
      porChave.get(k)!.push(t);
    }
    // MEDIA (não ALTA): pedágios/recorrências legítimas repetem valor+descrição
    // no mesmo vencimento — é "possível duplicidade", exige olho humano.
    for (const list of Array.from(porChave.values())) if (list.length > 1 && num(list[0].amount) > 0)
      add({ categoria: "lancamento_duplicado", severidade: "MEDIA",
        titulo: `Lançamento repetido ${list.length}x: ${String(list[0].description || "(sem descrição)").slice(0, 60)}`,
        detalhe: `${list.length} lançamentos idênticos (R$ ${num(list[0].amount).toFixed(2)}, venc. ${String(list[0].due_date || "").slice(0, 10)}). Confirmar se é duplicidade ou recorrência legítima (ex.: vários pedágios iguais).`,
        origem: "/admin/financeiro", valor: num(list[0].amount) * (list.length - 1),
        refs: { ids: list.map((t: any) => t.id).join(",") } });
  }

  // 6) Custo de missão duplicado (mesma OS+tipo+valor)
  {
    const porChave = new Map<string, any[]>();
    for (const c of custos) {
      // descrição entra na chave — vários pedágios do mesmo valor na mesma OS
      // são legítimos; só é suspeito quando TUDO é igual (inclusive descrição).
      const k = `${c.service_order_id}|${norm(c.category)}|${num(c.amount).toFixed(2)}|${norm(c.description)}`;
      if (!porChave.has(k)) porChave.set(k, []);
      porChave.get(k)!.push(c);
    }
    for (const list of Array.from(porChave.values())) if (list.length > 1 && num(list[0].amount) > 0) {
      const os: any = osById.get(list[0].service_order_id);
      add({ categoria: "custo_duplicado", severidade: "MEDIA",
        titulo: `Custo lançado ${list.length}x na OS ${os?.os_number || list[0].service_order_id}`,
        detalhe: `${list.length} custos com valor, categoria e descrição idênticos (R$ ${num(list[0].amount).toFixed(2)}, ${norm(list[0].category) || "sem categoria"}) na mesma OS — conferir se não é lançamento em dobro.`,
        origem: "/admin/service-orders", valor: num(list[0].amount) * (list.length - 1),
        refs: { osId: list[0].service_order_id, ids: list.map((c: any) => c.id).join(",") } });
    }
  }

  // 7) Invariantes de faturamento (§8.1) + OS aprovada sem fatura + fatura sem OS
  const itemsAtivos = items.filter((it: any) => invoiceAtiva(invoiceById.get(it.invoice_id)));
  const billingsComFatura = new Set(itemsAtivos.map((it: any) => String(it.billing_id)));
  let faturamentoOficial = 0;
  {
    for (const b of billings) {
      const os: any = osById.get(b.service_order_id);
      const osStatus = String(os?.status || "").toLowerCase();
      const view = oficialBillingView(b, os?.status, resolverContratoParaBilling(b, os, contratos));
      if (osStatus !== "recusada") faturamentoOficial += num(view.total);
      // recusada tem que ser R$ 0 no valor OFICIAL (mesma régua da Gestão de
      // Medição): a view já zera recusada, então valor bruto antigo congelado
      // no registro NÃO é problema — só é crítico se o oficial sair ≠ 0.
      if (osStatus === "recusada" && num(view.total) > TOL)
        add({ categoria: "inconsistencia_financeira", severidade: "CRITICA",
          titulo: `OS ${os?.os_number || b.service_order_id} recusada com valor oficial R$ ${num(view.total).toFixed(2)}`,
          detalhe: `OS recusada deve valer R$ 0 no faturamento (regra fixa) e o valor oficial está diferente de zero — corrigir o registro.`,
          origem: "/admin/boletim-medicao", valor: num(view.total), refs: { osId: b.service_order_id } });
      // aprovada/faturada com total oficial zerado = subfaturamento
      if (["APROVADA", "FATURADO", "FATURADA", "PAGO"].includes(String(b.status)) && num(view.total) <= TOL && osStatus !== "recusada")
        add({ categoria: "valor_fora_padrao", severidade: "ALTA",
          titulo: `OS ${os?.os_number || b.service_order_id} ${b.status} com faturamento R$ 0`,
          detalhe: `Faturamento aprovado/faturado zerado — provável boletim congelado antes do cálculo. Recalcular e reaprovar.`,
          origem: "/admin/boletim-medicao", refs: { osId: b.service_order_id } });
      // aprovada há fatura pendente de emissão
      if (String(b.status) === "APROVADA" && !billingsComFatura.has(String(b.id)) && b.invoice_id == null)
        add({ categoria: "conciliacao_pendente", severidade: "MEDIA",
          titulo: `OS ${os?.os_number || b.service_order_id} aprovada e ainda sem fatura`,
          detalhe: `Boletim aprovado (R$ ${num(b.fat_total).toFixed(2)}) sem fatura emitida — receita parada.`,
          origem: "/admin/relatorio-faturamento", valor: num(b.fat_total), refs: { osId: b.service_order_id } });
    }
    // fatura ativa sem nenhuma OS vinculada
    const invoicesComItem = new Set(itemsAtivos.map((it: any) => it.invoice_id));
    for (const i of invoices) if (invoiceAtiva(i) && !invoicesComItem.has(i.id) && i.service_order_id == null)
      add({ categoria: "conciliacao_pendente", severidade: "MEDIA",
        titulo: `Fatura #${i.id} sem OS vinculada`,
        detalhe: `Fatura ativa de R$ ${num(i.value).toFixed(2)} sem nenhuma OS associada — impossível ratear recebimento por OS.`,
        origem: "/admin/relatorio-nf", valor: num(i.value), refs: { invoiceId: i.id } });
  }

  // 8) Recebimento sem vínculo / rateio divergente
  let recebidoTotal = 0;
  {
    const alocadoPorInvoice = new Map<number, number>();
    for (const it of items) alocadoPorInvoice.set(it.invoice_id, (alocadoPorInvoice.get(it.invoice_id) || 0) + num(it.valor_alocado));
    for (const i of invoices) {
      const recebido = num(i.valor_recebido);
      if (!invoiceAtiva(i)) continue;
      recebidoTotal += recebido;
      const alocado = alocadoPorInvoice.get(i.id);
      if (recebido > TOL && alocado != null && Math.abs(recebido - alocado) > TOL)
        add({ categoria: "inconsistencia_financeira", severidade: "ALTA",
          titulo: `Fatura #${i.id}: recebido R$ ${recebido.toFixed(2)} ≠ rateado R$ ${num(alocado).toFixed(2)}`,
          detalhe: `O valor recebido da fatura não bate com a soma distribuída entre as OSs — reprocessar o rateio.`,
          origem: "/admin/relatorio-nf", valor: Math.abs(recebido - num(alocado)), refs: { invoiceId: i.id } });
    }
  }

  // 9) RH — funcionário duplicado e cadastro incompleto
  {
    const ativos = employees.filter((e: any) => String(e.status || "").toLowerCase() !== "inativo" && String(e.status || "").toLowerCase() !== "desligado");
    const porNome = new Map<string, any[]>();
    const porCpf = new Map<string, any[]>();
    for (const e of ativos) {
      const n = norm(e.name); if (n) { if (!porNome.has(n)) porNome.set(n, []); porNome.get(n)!.push(e); }
      const c = String(e.cpf || "").replace(/\D/g, ""); if (c) { if (!porCpf.has(c)) porCpf.set(c, []); porCpf.get(c)!.push(e); }
    }
    for (const list of Array.from(porCpf.values())) if (list.length > 1)
      add({ categoria: "duplicidade_rh", severidade: "CRITICA",
        titulo: `CPF repetido em ${list.length} cadastros ativos`,
        detalhe: `Funcionários ${list.map((e: any) => e.name).join(" e ")} compartilham o mesmo CPF — custo de folha pode estar sendo contado 2x.`,
        origem: "/admin/employees", refs: { ids: list.map((e: any) => e.id).join(",") } });
    for (const [n, list] of Array.from(porNome)) if (list.length > 1 && new Set(list.map((e: any) => String(e.cpf || ""))).size > 1)
      add({ categoria: "duplicidade_rh", severidade: "ALTA",
        titulo: `Nome "${n}" em ${list.length} cadastros ativos`,
        detalhe: `Verificar se é a mesma pessoa cadastrada 2x (o custo de RH somaria em dobro).`,
        origem: "/admin/employees", refs: { ids: list.map((e: any) => e.id).join(",") } });

    const comSalario = new Set(salaries.map((s: any) => s.employee_id));
    for (const e of ativos) if (String(e.tipo_contratacao || "") === "fixo" && !comSalario.has(e.id))
      add({ categoria: "dado_incompleto_rh", severidade: "MEDIA",
        titulo: `${e.name} sem salário cadastrado`,
        detalhe: `Funcionário fixo ativo sem salário — o custo de RH nos painéis fica SUBESTIMADO até cadastrar.`,
        origem: "/admin/employees", refs: { employeeId: e.id } });
  }

  // ---- Consolidação ----
  const faturamentoFaturado = itemsAtivos.reduce((s: number, it: any) => s + num(it.valor_item), 0);
  const custosMissoes = custos.reduce((s: number, c: any) => s + num(c.amount), 0);
  const registrosAuditados = billings.length + invoices.length + items.length + transacoes.length + custos.length + employees.length;

  const porSeveridade: Record<Severidade, number> = { CRITICA: 0, ALTA: 0, MEDIA: 0, BAIXA: 0 };
  for (const a of achados) porSeveridade[a.severidade]++;
  // Integridade = % dos registros auditados livres de problema (ponderado por
  // gravidade: crítica pesa 4 registros, alta 2, média 1, baixa 0.5).
  const peso = porSeveridade.CRITICA * 4 + porSeveridade.ALTA * 2 + porSeveridade.MEDIA * 1 + porSeveridade.BAIXA * 0.5;
  const integridadePct = Math.max(0, Math.round((1 - peso / Math.max(1, registrosAuditados)) * 1000) / 10);
  const status = porSeveridade.CRITICA > 0 ? "INVALIDO" : achados.length > 0 ? "ATENCAO" : "VALIDO";

  const CARDS: [string, string][] = [
    ["billing_duplicado", "OS contada mais de uma vez"],
    ["os_em_multiplas_faturas", "OS em múltiplas faturas"],
    ["fatura_duplicada", "Faturas duplicadas"],
    ["nf_repetida", "Notas fiscais repetidas"],
    ["lancamento_duplicado", "Lançamentos duplicados"],
    ["custo_duplicado", "Custos em duplicidade"],
    ["inconsistencia_financeira", "Inconsistências financeiras"],
    ["valor_fora_padrao", "Valores fora do padrão"],
    ["conciliacao_pendente", "Conciliações pendentes"],
    ["duplicidade_rh", "Duplicidades no RH"],
    ["dado_incompleto_rh", "Cadastros incompletos (RH)"],
  ];
  const sevRank: Severidade[] = ["CRITICA", "ALTA", "MEDIA", "BAIXA"];
  const cards = CARDS.map(([categoria, titulo]) => {
    const list = achados.filter((a) => a.categoria === categoria);
    const severidadeMax = list.length ? sevRank.find((s) => list.some((a) => a.severidade === s)) || null : null;
    const valorImpactado = +list.reduce((s, a) => s + num(a.valor), 0).toFixed(2);
    return { categoria, titulo, achados: list.length, severidadeMax, valorImpactado };
  });

  return {
    geradoEm: new Date().toISOString(),
    periodo: { de: DE, ...(ATE ? { ate: ATE } : {}) } as any,
    status, integridadePct,
    totais: { verificacoes: CARDS.length, registrosAuditados, achados: achados.length, porSeveridade },
    cards, achados,
    resumoFinanceiro: {
      faturamentoOficial: +faturamentoOficial.toFixed(2),
      faturamentoFaturado: +faturamentoFaturado.toFixed(2),
      recebidoTotal: +recebidoTotal.toFixed(2),
      custosMissoes: +custosMissoes.toFixed(2),
    },
  };
}
