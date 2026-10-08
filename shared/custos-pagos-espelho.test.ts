import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCustosPagosEspelho, buildCustosPorMes, detalheCategoriaPorMes, linhaGasto } from "./custos-pagos-espelho.ts";

test("linha: saiu menos é melhoria, saiu mais é queda", () => {
  assert.equal(linhaGasto(50, 100).tom, "melhoria");
  assert.equal(linhaGasto(160, 100).tom, "queda");
  assert.equal(linhaGasto(102, 100).tom, "estavel");
  assert.equal(linhaGasto(10, 0).tom, "novo");
  assert.equal(linhaGasto(0, 10).tom, "aguardando");
});

test("espelho usa payment_date e ignora o que não está pago", () => {
  const r = buildCustosPagosEspelho([
    { type: "EXPENSE", status: "PAID", amount: "100.00", category_name: "Combustível", payment_date: "2026-10-02", due_date: "2026-09-01" },
    { type: "EXPENSE", status: "PAID", amount: 40, category_name: "Combustível", payment_date: "2026-09-04", due_date: "2026-09-04" },
    { type: "EXPENSE", status: "PAID", amount: 80, category_name: "Combustível", payment_date: "2026-09-20", due_date: "2026-09-20" },
    { type: "EXPENSE", status: "PAID", amount: 10, category_name: "PEDAGIO", due_date: "2026-09-03" },
    { type: "INCOME", status: "PAID", amount: 50, category_name: "Faturamento", payment_date: "2026-10-02", due_date: "2026-10-02" },
    { type: "EXPENSE", status: "PENDING", amount: 999, category_name: "Combustível", payment_date: "2026-10-02", due_date: "2026-10-02" },
  ], "2026-10-08");

  assert.equal(r.saiuHoje, 100);
  assert.equal(r.saiuMesmoDia, 50);
  assert.equal(r.saiuMes, 130);
  assert.equal(r.entrouHoje, 50);
  assert.equal(r.saldoHoje, -50);
  assert.equal(r.tom, "queda");

  const comb = r.categorias.find((c) => c.nome === "Combustível");
  assert.ok(comb);
  assert.equal(comb.out, 100);
  assert.equal(comb.dia, 40);
  assert.equal(comb.mes, 120);
  assert.equal(comb.tom, "queda");
  assert.equal(comb.jae, 100 / 120);

  assert.equal(r.aguardando.length, 1);
  assert.equal(r.aguardando[0].nome, "PEDAGIO");
  assert.equal(r.lancamentos.length, 2);
  assert.equal(r.lancamentos[0].data, "02/10");
});

test("salário e folha de pagamento ficam na mesma categoria", () => {
  const r = buildCustosPagosEspelho([
    { type: "EXPENSE", status: "PAID", amount: 100, category_name: "SALÁRIO", payment_date: "2026-10-01" },
    { type: "EXPENSE", status: "PAID", amount: 40, category_name: "Folha de Pagamento", payment_date: "2026-10-02" },
    { type: "EXPENSE", status: "PAID", amount: 10, category_name: "salario", payment_date: "2026-09-03" },
  ], "2026-10-08");

  assert.equal(r.categorias.length, 1);
  assert.equal(r.categorias[0].nome, "Salário e Folha de Pagamento");
  assert.equal(r.categorias[0].out, 140);
  assert.equal(r.categorias[0].dia, 10);
  assert.equal(r.lancamentos.every((l) => l.categoria === "Salário e Folha de Pagamento"), true);
  assert.equal(r.lancamentosComparacao.length, 1);
  assert.equal(r.lancamentosComparacao[0].janela, "mesmo-dia");
  assert.equal(r.lancamentosComparacao[0].valor, 10);
});

test("pessoal fica na frente e as outras despesas depois", () => {
  const r = buildCustosPagosEspelho([
    { type: "EXPENSE", status: "PAID", amount: 10, category_name: "Combustível", payment_date: "2026-10-02" },
    { type: "EXPENSE", status: "PAID", amount: 100, category_name: "SALÁRIO", description: "PAGAMENTO SALARIAL - a", payment_date: "2026-10-01" },
    { type: "EXPENSE", status: "PAID", amount: 40, category_name: "Folha de Pagamento", description: "Rescisão do contrato", payment_date: "2026-10-02" },
    { type: "EXPENSE", status: "PAID", amount: 50, category_name: "Folha de Pagamento", description: "FLASH BENEFÍCIOS: A, B", payment_date: "2026-10-02" },
    { type: "EXPENSE", status: "PAID", amount: 7, category_name: "Folha de Pagamento", description: "flash vr novos", payment_date: "2026-10-02" },
    { type: "EXPENSE", status: "PAID", amount: 20, category_name: "Folha de Pagamento", description: "flash ajuda de custo", payment_date: "2026-10-02" },
    { type: "EXPENSE", status: "PAID", amount: 30, category_name: "Folha de Pagamento", description: "FLASH HORAS EXTRAS", payment_date: "2026-09-04" },
    { type: "EXPENSE", status: "PAID", amount: 15, category_name: "Reembolso", description: "REEMBOLSO TM -diárias e salário pj", payment_date: "2026-10-02" },
    { type: "EXPENSE", status: "PAID", amount: 5, category_name: "VALE TRANSPORTE", description: "VALE TRANSPORTE - k", payment_date: "2026-09-04" },
    { type: "EXPENSE", status: "PAID", amount: 8, category_name: "Reebolso", description: "reembolso tm - seguro", payment_date: "2026-10-02" },
  ], "2026-10-08");

  assert.deepEqual(r.categorias.map((c) => c.nome), [
    "Salário e Folha de Pagamento",
    "Horas Extras",
    "Diárias",
    "Vale Refeição",
    "Ajuda de Custo",
    "Vale Transporte",
    "Combustível",
    "Reembolso",
  ]);
  assert.equal(r.categorias.find((c) => c.nome === "Salário e Folha de Pagamento")?.out, 140);
  assert.equal(r.categorias.find((c) => c.nome === "Vale Refeição")?.out, 57);
  assert.equal(r.categorias.find((c) => c.nome === "Ajuda de Custo")?.out, 20);
  assert.equal(r.categorias.find((c) => c.nome === "Horas Extras")?.out, 0);
  assert.equal(r.categorias.find((c) => c.nome === "Horas Extras")?.dia, 30);
  assert.equal(r.categorias.find((c) => c.nome === "Diárias")?.out, 15);
  assert.equal(r.categorias.find((c) => c.nome === "Vale Transporte")?.out, 0);
  assert.equal(r.categorias.find((c) => c.nome === "Reembolso")?.out, 8);
});

test("reembolso e reebolso ficam na mesma categoria", () => {
  const r = buildCustosPagosEspelho([
    { type: "EXPENSE", status: "PAID", amount: 100, category_name: "Reembolso", description: "adiantamento", payment_date: "2026-10-02" },
    { type: "EXPENSE", status: "PAID", amount: 40, category_name: "Reebolso", description: "REEBOLSO MARCOS", payment_date: "2026-10-01" },
    { type: "EXPENSE", status: "PAID", amount: 10, category_name: "REEMBOLSO", payment_date: "2026-09-04" },
  ], "2026-10-08");

  assert.equal(r.categorias.length, 1);
  assert.equal(r.categorias[0].nome, "Reembolso");
  assert.equal(r.categorias[0].out, 140);
  assert.equal(r.categorias[0].dia, 10);
  assert.equal(r.lancamentos.map((l) => l.descricao).join("|"), "adiantamento|REEBOLSO MARCOS");
});

test("mês passado separa o mesmo dia do restante", () => {
  const r = buildCustosPagosEspelho([
    { type: "EXPENSE", status: "PAID", amount: 40, category_name: "Combustível", description: "Ticket", payment_date: "2026-09-04", due_date: "2026-09-01" },
    { type: "EXPENSE", status: "PAID", amount: 80, category_name: "Combustível", description: "Ticket fechamento", payment_date: "2026-09-20" },
  ], "2026-10-08");

  assert.equal(r.lancamentos.length, 0);
  assert.equal(r.lancamentosComparacao.length, 2);
  const mesmo = r.lancamentosComparacao.find((l) => l.janela === "mesmo-dia");
  const resto = r.lancamentosComparacao.find((l) => l.janela === "resto");
  assert.equal(mesmo?.valor, 40);
  assert.equal(mesmo?.data, "04/09");
  assert.equal(mesmo?.vencimento, "01/09");
  assert.equal(resto?.valor, 80);
  assert.equal(resto?.vencimento, "");
});

test("pago separa janeiro a abril e mantém o pessoal na frente", () => {
  const r = buildCustosPorMes([
    { type: "EXPENSE", status: "PAID", amount: 10, category_name: "Combustível", payment_date: "2026-02-02" },
    { type: "EXPENSE", status: "PAID", amount: 100, category_name: "SALÁRIO", description: "PAGAMENTO SALARIAL", payment_date: "2026-01-05" },
    { type: "EXPENSE", status: "PAID", amount: 40, category_name: "Folha de Pagamento", description: "FLASH HORAS EXTRAS", payment_date: "2026-03-04" },
    { type: "EXPENSE", status: "PAID", amount: 7, category_name: "Combustível", payment_date: "2026-05-01" },
    { type: "EXPENSE", status: "PENDING", amount: 99, category_name: "Combustível", payment_date: "2026-04-01" },
  ], 2026, [1, 2, 3, 4]);

  assert.deepEqual(r.meses.map((m) => m.nome), ["Janeiro", "Fevereiro", "Março", "Abril"]);
  assert.deepEqual(r.meses.map((m) => m.total), [100, 10, 40, 0]);
  assert.deepEqual(r.linhas.map((l) => l.nome), ["Salário e Folha de Pagamento", "Horas Extras", "Combustível"]);
  assert.deepEqual(r.linhas[0].valores, [100, 0, 0, 0]);
  assert.deepEqual(r.linhas[2].valores, [0, 10, 0, 0]);
});

test("detalhe da categoria traz cada pagamento do mês", () => {
  const r = detalheCategoriaPorMes([
    { id: "tx-1", category_id: "cat-1", type: "EXPENSE", status: "PAID", amount: 100, category_name: "SALÁRIO", description: "PAGAMENTO SALARIAL - ana", entity_name: "Ana", payment_date: "2026-03-02", due_date: "2026-03-01" },
    { type: "EXPENSE", status: "PAID", amount: 40, category_name: "Combustível", payment_date: "2026-03-02" },
    { type: "EXPENSE", status: "PAID", amount: 15, category_name: "Folha de Pagamento", description: "FLASH BENEFÍCIOS: A, B, C", payment_date: "2026-03-04" },
    { type: "EXPENSE", status: "PENDING", amount: 99, category_name: "SALÁRIO", payment_date: "2026-03-02" },
  ], 2026, [3, 4], "Salário e Folha de Pagamento");

  assert.equal(r[0].nome, "Março");
  assert.equal(r[0].total, 100);
  assert.equal(r[0].itens.length, 1);
  assert.equal(r[0].itens[0].id, "tx-1");
  assert.equal(r[0].itens[0].categoryId, "cat-1");
  assert.equal(r[0].itens[0].subcategoria, "SALÁRIO");
  assert.equal(r[0].itens[0].entidade, "Ana");
  assert.equal(r[0].itens[0].descricao, "PAGAMENTO SALARIAL - ana");
  assert.equal(r[0].itens[0].vencimento, "01/03");
  assert.equal(r[1].total, 0);
  assert.equal(r[1].itens.length, 0);
});
