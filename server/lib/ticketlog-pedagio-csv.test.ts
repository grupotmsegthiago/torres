import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTicketlogPedagioCsv,
  cruzarPedagios,
  type OsCandidate,
  type MissionCostCandidate,
} from "./ticketlog-pedagio-csv.ts";

const HEADER_BLOCK = [
  "Código da Fatura: 999999",
  "Cliente: Torres Vigilância",
  "Período Apurado: 01/01/2025 a 31/01/2025",
  "Vencimento: 10/02/2025",
  "Mês de Referência: 01/2025",
  "Status da Fatura: ABERTA",
  "",
  "Código;Data da Transação;Hora da Transação;Placa;Estabelecimento;Endereço;Categoria Cobrada;Valor Cobrado(R$);Valor da Transação(R$)",
].join("\n");

function mkCsv(lines: string[], opts: { bom?: boolean; crlf?: boolean } = {}): string {
  const body = HEADER_BLOCK + "\n" + lines.join("\n");
  const out = opts.crlf ? body.replace(/\n/g, "\r\n") : body;
  return opts.bom ? "\ufeff" + out : out;
}

test("parser: cabeçalho extraído corretamente", () => {
  const csv = mkCsv(["1;05/01/2025;08:00;ABC1D23;Praça;Rua X;Cat 2;10,50;10,50"]);
  const parsed = parseTicketlogPedagioCsv(csv);
  assert.equal(parsed.header.codigoFatura, "999999");
  assert.equal(parsed.header.cliente, "Torres Vigilância");
  assert.equal(parsed.header.periodoInicio, "2025-01-01");
  assert.equal(parsed.header.periodoFim, "2025-01-31");
  assert.equal(parsed.header.vencimento, "2025-02-10");
  assert.equal(parsed.header.mesReferencia, "01/2025");
  assert.equal(parsed.header.status, "ABERTA");
});

test("parser: aceita CSV com BOM", () => {
  const csv = mkCsv(["1;05/01/2025;08:00;ABC1D23;P;R;C;5,00;5,00"], { bom: true });
  const parsed = parseTicketlogPedagioCsv(csv);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].valor, 5);
  assert.equal(parsed.header.codigoFatura, "999999");
});

test("parser: aceita CSV com CRLF", () => {
  const csv = mkCsv(["1;05/01/2025;08:00;ABC1D23;P;R;C;5,00;5,00"], { crlf: true });
  const parsed = parseTicketlogPedagioCsv(csv);
  assert.equal(parsed.rows.length, 1);
});

test("parser: normaliza placa (uppercase, sem espaços/aspas)", () => {
  const csv = mkCsv([
    `1;05/01/2025;08:00;"abc 1d23";P;R;C;5,00;5,00`,
  ]);
  const parsed = parseTicketlogPedagioCsv(csv);
  assert.equal(parsed.rows[0].placa, "ABC1D23");
});

test("parser: descarta linhas com valor zero", () => {
  const csv = mkCsv([
    "1;05/01/2025;08:00;ABC1D23;P;R;C;0,00;0,00",
    "2;06/01/2025;08:00;ABC1D23;P;R;C;3,50;3,50",
  ]);
  const parsed = parseTicketlogPedagioCsv(csv);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].codigo, "2");
});

test("parser: descarta linhas com placa em branco", () => {
  const csv = mkCsv([
    "1;05/01/2025;08:00;;P;R;C;5,00;5,00",
    "2;06/01/2025;08:00;XYZ1A23;P;R;C;7,00;7,00",
  ]);
  const parsed = parseTicketlogPedagioCsv(csv);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].placa, "XYZ1A23");
});

test("parser: prefere Valor Cobrado sobre Valor da Transação", () => {
  const csv = mkCsv(["1;05/01/2025;08:00;ABC1D23;P;R;C;12,30;99,99"]);
  const parsed = parseTicketlogPedagioCsv(csv);
  assert.equal(parsed.rows[0].valor, 12.3);
});

test("parser: total agregado bate com soma das linhas", () => {
  const csv = mkCsv([
    "1;05/01/2025;08:00;ABC1D23;P;R;C;10,00;10,00",
    "2;06/01/2025;08:00;ABC1D23;P;R;C;15,55;15,55",
    "3;07/01/2025;08:00;XYZ1A23;P;R;C;4,45;4,45",
  ]);
  const parsed = parseTicketlogPedagioCsv(csv);
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.total, 30);
});

test("parser: valor negativo é tomado em módulo", () => {
  const csv = mkCsv(["1;05/01/2025;08:00;ABC1D23;P;R;C;-8,80;-8,80"]);
  const parsed = parseTicketlogPedagioCsv(csv);
  assert.equal(parsed.rows[0].valor, 8.8);
});

// ============================================================================
// cruzarPedagios
// ============================================================================

const PLACA = "ABC1D23";
const baseOs: OsCandidate = {
  id: 1,
  osNumber: "OS-001",
  clientId: 10,
  vehicleId: 100,
  placa: PLACA,
  scheduledDate: "2025-01-10",
  completedDate: "2025-01-10",
  missionStartedAt: "2025-01-10",
  status: "concluida",
  assignedEmployeeId: 5,
};

function mkRow(over: Partial<{ codigo: string; data: string; placa: string; valor: number }> = {}) {
  return {
    codigo: over.codigo ?? "c1",
    data: over.data ?? "2025-01-10",
    hora: "08:00",
    placa: over.placa ?? PLACA,
    valor: over.valor ?? 10,
    estabelecimento: null,
    endereco: null,
    categoria: null,
  };
}

function mkMc(over: Partial<MissionCostCandidate> = {}): MissionCostCandidate {
  return {
    id: over.id ?? 1,
    serviceOrderId: over.serviceOrderId ?? 1,
    amount: over.amount ?? 10,
    category: over.category ?? "Pedágio",
    description: over.description ?? null,
    createdAt: over.createdAt ?? null,
  };
}

test("cruzamento: match básico por placa+data+valor", () => {
  const r = cruzarPedagios([mkRow()], [baseOs], [mkMc()], new Set([PLACA]));
  assert.equal(r.conciliados.length, 1);
  assert.equal(r.faturaSemOS.length, 0);
  assert.equal(r.osSemFatura.length, 0);
  assert.equal(r.totais.conciliados.total, 10);
});

test("cruzamento: placa não cadastrada na frota cai em faturaSemOS", () => {
  const r = cruzarPedagios([mkRow({ placa: "ZZZ9Z99" })], [baseOs], [mkMc()], new Set([PLACA]));
  assert.equal(r.conciliados.length, 0);
  assert.equal(r.faturaSemOS.length, 1);
  assert.match(r.faturaSemOS[0].motivo, /frota/);
});

test("cruzamento: linha sem placa válida", () => {
  const r = cruzarPedagios([mkRow({ placa: "" })], [baseOs], [mkMc()], new Set([PLACA]));
  assert.equal(r.faturaSemOS.length, 1);
  assert.match(r.faturaSemOS[0].motivo, /placa/);
});

test("cruzamento: ignora mission_cost 'Pedágio (Receita)'", () => {
  const mc = mkMc({ category: "Pedágio (Receita)" });
  const r = cruzarPedagios([mkRow()], [baseOs], [mc], new Set([PLACA]));
  assert.equal(r.conciliados.length, 0);
  assert.equal(r.osSemFatura.length, 0, "receita não deve aparecer como OS sem fatura");
  assert.equal(r.faturaSemOS.length, 1);
});

test("cruzamento: janela aceita data 1 dia antes do scheduled", () => {
  const r = cruzarPedagios(
    [mkRow({ data: "2025-01-09" })],
    [baseOs],
    [mkMc()],
    new Set([PLACA]),
  );
  assert.equal(r.conciliados.length, 1);
});

test("cruzamento: janela aceita data 1 dia depois do completed", () => {
  const r = cruzarPedagios(
    [mkRow({ data: "2025-01-11" })],
    [baseOs],
    [mkMc()],
    new Set([PLACA]),
  );
  assert.equal(r.conciliados.length, 1);
});

test("cruzamento: janela rejeita data 2 dias fora", () => {
  const r = cruzarPedagios(
    [mkRow({ data: "2025-01-12" })],
    [baseOs],
    [mkMc()],
    new Set([PLACA]),
  );
  assert.equal(r.conciliados.length, 0);
  assert.equal(r.faturaSemOS.length, 1);
  assert.match(r.faturaSemOS[0].motivo, /nenhuma OS/);
});

test("cruzamento: OS sem nenhuma data (janela nula) não casa", () => {
  const os = { ...baseOs, scheduledDate: null, completedDate: null, missionStartedAt: null };
  const r = cruzarPedagios([mkRow()], [os], [mkMc()], new Set([PLACA]));
  assert.equal(r.conciliados.length, 0);
  assert.equal(r.faturaSemOS.length, 1);
});

test("cruzamento: tolerância de R$ 0,01 (limite inferior)", () => {
  const mc = mkMc({ amount: 9.99 });
  const r = cruzarPedagios([mkRow({ valor: 10 })], [baseOs], [mc], new Set([PLACA]));
  assert.equal(r.conciliados.length, 1);
});

test("cruzamento: tolerância de R$ 0,01 (limite superior)", () => {
  const mc = mkMc({ amount: 10.01 });
  const r = cruzarPedagios([mkRow({ valor: 10 })], [baseOs], [mc], new Set([PLACA]));
  assert.equal(r.conciliados.length, 1);
});

test("cruzamento: diferença > R$ 0,01 não casa", () => {
  const mc = mkMc({ amount: 10.02 });
  const r = cruzarPedagios([mkRow({ valor: 10 })], [baseOs], [mc], new Set([PLACA]));
  assert.equal(r.conciliados.length, 0);
  assert.equal(r.faturaSemOS.length, 1);
  assert.match(r.faturaSemOS[0].motivo, /compatível/);
  assert.equal(r.osSemFatura.length, 1);
});

test("cruzamento: consumo one-to-one — segundo CSV idêntico vira faturaSemOS se só houver 1 mission_cost", () => {
  const rows = [mkRow({ codigo: "c1" }), mkRow({ codigo: "c2" })];
  const r = cruzarPedagios(rows, [baseOs], [mkMc({ id: 1 })], new Set([PLACA]));
  assert.equal(r.conciliados.length, 1);
  assert.equal(r.faturaSemOS.length, 1);
  assert.equal(r.faturaSemOS[0].csv.codigo, "c2");
});

test("cruzamento: consumo one-to-one — dois mission_costs casam com dois CSVs", () => {
  const rows = [mkRow({ codigo: "c1" }), mkRow({ codigo: "c2" })];
  const mcs = [mkMc({ id: 1 }), mkMc({ id: 2 })];
  const r = cruzarPedagios(rows, [baseOs], mcs, new Set([PLACA]));
  assert.equal(r.conciliados.length, 2);
  const usedIds = new Set(r.conciliados.map((c) => c.missionCost.id));
  assert.equal(usedIds.size, 2);
});

test("cruzamento: amount com sinal negativo é comparado em módulo", () => {
  const mc = mkMc({ amount: -10 });
  const r = cruzarPedagios([mkRow({ valor: 10 })], [baseOs], [mc], new Set([PLACA]));
  assert.equal(r.conciliados.length, 1);
});

test("cruzamento: mission_cost sobrando vira osSemFatura", () => {
  const r = cruzarPedagios([], [baseOs], [mkMc()], new Set([PLACA]));
  assert.equal(r.osSemFatura.length, 1);
  assert.equal(r.totais.osSemFatura.total, 10);
});

test("cruzamento: totais agregam corretamente", () => {
  const rows = [
    mkRow({ codigo: "c1", valor: 10 }),
    mkRow({ codigo: "c2", valor: 7.5, placa: "NOPLATE" }),
  ];
  const r = cruzarPedagios(rows, [baseOs], [mkMc({ amount: 10 })], new Set([PLACA]));
  assert.equal(r.totais.conciliados.count, 1);
  assert.equal(r.totais.conciliados.total, 10);
  assert.equal(r.totais.faturaSemOS.count, 1);
  assert.equal(r.totais.faturaSemOS.total, 7.5);
});

test("cruzamento: placa com formatação diferente (hífen, lowercase) normaliza", () => {
  const os = { ...baseOs, placa: "abc-1d23" };
  const r = cruzarPedagios([mkRow({ placa: "ABC1D23" })], [os], [mkMc()], new Set([PLACA]));
  assert.equal(r.conciliados.length, 1);
});
