import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  calcularEscolta,
  calcularFaturamentoLive,
  computeBillingPayloadForOs,
} from "./billing-calc";
import { billingTotalForBoletim } from "./lib/boletim-totals";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = path.join(root, "server");

type GoldenFixture = {
  label: string;
  serviceOrderId?: number;
  osNumber?: string;
  billingId?: string;
  billingStatus?: string;
  approvalId?: number;
  approvalStatus?: string;
  serviceOrderIds?: number[];
  fatTotal?: number;
  snapshotExists?: boolean;
  billingTotal?: number;
  snapshotTotal?: number;
  absoluteDifference?: number;
  zeroChecks?: {
    fatCalculado: boolean;
    lucroCalculado: boolean;
    margemCalculada: boolean;
    billing: boolean;
    invoiceLinkAbsent: boolean;
    positiveIncomeAbsent: boolean;
  };
  expectedUse: "golden" | "negative-control" | "investigation-only";
};

export const PR5B1_CONFIRMED_FIXTURES: readonly GoldenFixture[] = [
  {
    label: "cancelada aberta com espelho divergente",
    serviceOrderId: 42,
    osNumber: "TOR-0025",
    billingId: "c40eeffe-cd27-472f-86eb-6070a2a7c43a",
    billingStatus: "A_VERIFICAR",
    expectedUse: "golden",
  },
  {
    label: "cancelada congelada",
    serviceOrderId: 955,
    osNumber: "TOR-0560",
    billingId: "5de26812-3b4d-4642-b0ef-fa73f2a4bede",
    billingStatus: "CANCELADO",
    expectedUse: "golden",
  },
  {
    label: "agendada futura sem billing",
    serviceOrderId: 979,
    osNumber: "TOR-0584",
    expectedUse: "negative-control",
  },
  {
    label: "snapshot pendente com billings ausentes",
    approvalId: 91,
    serviceOrderIds: [959, 960, 961, 964],
    expectedUse: "investigation-only",
  },
  {
    label: "concluída com billing aberto",
    serviceOrderId: 981,
    osNumber: "TOR-0586",
    billingId: "8555b538-9554-41c6-a451-6b1751aa5f32",
    billingStatus: "A_VERIFICAR",
    fatTotal: 480,
    snapshotExists: false,
    expectedUse: "golden",
  },
  {
    label: "concluída com billing congelado",
    serviceOrderId: 941,
    osNumber: "TOR-0546",
    billingId: "18f0b6b8-6cda-4461-bf61-5d1e87bf2d43",
    billingStatus: "FATURADO",
    approvalId: 90,
    approvalStatus: "APROVADO",
    snapshotExists: true,
    expectedUse: "golden",
  },
  {
    label: "recusada com valores financeiros zero",
    serviceOrderId: 35,
    osNumber: "TOR-0018",
    billingId: "f92d5a1c-0874-4419-9e93-8d20c7a655c3",
    billingStatus: "CANCELADO",
    zeroChecks: {
      fatCalculado: true,
      lucroCalculado: true,
      margemCalculada: true,
      billing: true,
      invoiceLinkAbsent: true,
      positiveIncomeAbsent: true,
    },
    expectedUse: "golden",
  },
  {
    label: "billing em snapshot consistente",
    serviceOrderId: 749,
    osNumber: "TOR-0471",
    billingId: "92f27e7f-cf53-43a3-8c86-6c41c18e16cf",
    billingStatus: "FATURADO",
    approvalId: 86,
    approvalStatus: "APROVADO",
    billingTotal: 539.1,
    snapshotTotal: 539.1,
    absoluteDifference: 0,
    expectedUse: "golden",
  },
  {
    label: "billing atual diferente do snapshot",
    serviceOrderId: 438,
    osNumber: "TOR-0291",
    billingId: "652578f8-4105-4c91-8d33-9632decef55e",
    billingStatus: "APROVADA",
    approvalId: 57,
    approvalStatus: "APROVADO",
    billingTotal: 548.73,
    snapshotTotal: 550.57,
    absoluteDifference: 1.84,
    expectedUse: "golden",
  },
] as const;

export const PR5B1_MISSING_FIXTURE_KINDS = [] as const;

export const PR5B1_TRANSVERSAL_EVIDENCE = {
  label: "billing ligado a múltiplos approvals históricos pendentes",
  serviceOrderId: 646,
  osNumber: "TOR-0436",
  billingId: "53a32997-70e4-4f0d-8b69-acd1da5a2425",
  approvalIds: [64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 75],
  destination: "PR5B.2/PR5B.6",
} as const;

const EXPECTED_PRODUCTION_CALLS: Record<string, Record<string, number>> = {
  calcularEscolta: {
    "server/billing-calc.ts": 1,
    "server/lib/cancelada-billing.ts": 1,
    "server/routes/escort.ts": 5,
    "server/routes/operational.ts": 1,
    "server/routes/service-orders.ts": 6,
  },
  computeBillingPayloadForOs: {
    "server/cron.ts": 1,
    "server/routes/escort.ts": 2,
    "server/routes/mission.ts": 1,
  },
  calcularFaturamentoLive: {
    "server/financial-snapshot.ts": 1,
    "server/routes/escort.ts": 2,
    "server/routes/operational.ts": 1,
  },
  computeCanceladaBilling: {
    "server/cron.ts": 1,
    "server/routes/escort.ts": 3,
    "server/routes/mission.ts": 1,
    "server/routes/service-orders.ts": 2,
  },
};

function listProductionTs(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...listProductionTs(full));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) files.push(full);
  }
  return files;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n\r]*/g, " ");
}

function sourceSection(file: string, start: string, end?: string): string {
  const source = readFileSync(path.join(root, file), "utf8");
  const startAt = source.indexOf(start);
  assert.notEqual(startAt, -1, `marcador inicial ausente em ${file}: ${start}`);
  const endAt = end ? source.indexOf(end, startAt + start.length) : source.length;
  assert.notEqual(endAt, -1, `marcador final ausente em ${file}: ${end}`);
  return source.slice(startAt, endAt);
}

function countProductionCalls(symbol: string): Record<string, number> {
  const found: Record<string, number> = {};
  const callPattern = new RegExp(`\\b${symbol}\\s*\\(`, "g");
  const definitionPattern = new RegExp(
    `\\bexport\\s+(?:async\\s+)?function\\s+${symbol}\\s*\\(`,
    "g",
  );
  for (const file of listProductionTs(serverRoot)) {
    let source = stripComments(readFileSync(file, "utf8"));
    source = source.replace(definitionPattern, " ");
    const count = source.match(callPattern)?.length ?? 0;
    if (count > 0) found[path.relative(root, file)] = count;
  }
  return found;
}

describe("PR5B.1 — inventário imutável de call-sites", () => {
  for (const [symbol, expected] of Object.entries(EXPECTED_PRODUCTION_CALLS)) {
    test(`${symbol}: inventário de produção conhecido`, () => {
      assert.deepEqual(countProductionCalls(symbol), expected);
    });
  }

  test("totais de call-sites: canônico=14, builder=4, live=4, cancelada=7", () => {
    const total = (values: Record<string, number>) =>
      Object.values(values).reduce((sum, value) => sum + value, 0);
    assert.equal(total(countProductionCalls("calcularEscolta")), 14);
    assert.equal(total(countProductionCalls("computeBillingPayloadForOs")), 4);
    assert.equal(total(countProductionCalls("calcularFaturamentoLive")), 4);
    assert.equal(total(countProductionCalls("computeCanceladaBilling")), 7);
  });
});

describe("PR5B.1 — registro de golden fixtures live", () => {
  test("fixtures confirmadas contêm apenas IDs técnicos e estados", () => {
    assert.equal(PR5B1_CONFIRMED_FIXTURES.length, 9);
    assert.deepEqual(
      PR5B1_CONFIRMED_FIXTURES.map((fixture) => fixture.serviceOrderId).filter(Boolean),
      [42, 955, 979, 981, 941, 35, 749, 438],
    );
    assert.deepEqual(PR5B1_CONFIRMED_FIXTURES[3].serviceOrderIds, [959, 960, 961, 964]);
  });

  test("as cinco categorias live obrigatórias possuem fixture definitiva", () => {
    assert.equal(PR5B1_MISSING_FIXTURE_KINDS.length, 0);
    const required = PR5B1_CONFIRMED_FIXTURES.slice(-5);
    assert.deepEqual(
      required.map((fixture) => fixture.label),
      [
        "concluída com billing aberto",
        "concluída com billing congelado",
        "recusada com valores financeiros zero",
        "billing em snapshot consistente",
        "billing atual diferente do snapshot",
      ],
    );
  });

  test("recusada fixture confirma todos os checks financeiros zero", () => {
    const refused = PR5B1_CONFIRMED_FIXTURES.find(
      (fixture) => fixture.serviceOrderId === 35,
    );
    assert.ok(refused?.zeroChecks);
    assert.ok(Object.values(refused.zeroChecks).every(Boolean));
  });

  test("fixtures de snapshot preservam igualdade e divergência histórica", () => {
    const consistent = PR5B1_CONFIRMED_FIXTURES.find(
      (fixture) => fixture.serviceOrderId === 749,
    );
    const divergent = PR5B1_CONFIRMED_FIXTURES.find(
      (fixture) => fixture.serviceOrderId === 438,
    );
    assert.equal(consistent?.absoluteDifference, 0);
    assert.equal(divergent?.absoluteDifference, 1.84);
    assert.notEqual(divergent?.billingTotal, divergent?.snapshotTotal);
  });

  test("evidência transversal fica fora da PR5B.1", () => {
    assert.equal(PR5B1_TRANSVERSAL_EVIDENCE.serviceOrderId, 646);
    assert.equal(PR5B1_TRANSVERSAL_EVIDENCE.approvalIds.length, 11);
    assert.equal(PR5B1_TRANSVERSAL_EVIDENCE.destination, "PR5B.2/PR5B.6");
  });
});

describe("PR5B.1 — contratos puros já normativos", () => {
  const contract = {
    valor_acionamento: 500,
    franquia_km: 100,
    franquia_horas: 3,
    valor_hora_extra: 100,
    valor_km_extra: 4.8,
    valor_km_carregado: 2.8,
    valor_km_vazio: 1.4,
    hora_extra_fracionada: true,
    adicional_noturno_km_pct: 15,
    adicional_noturno_vrp_pct: 0,
    vrp_base: 0,
  };

  test("concluída: calcularEscolta produz resultado determinístico", () => {
    const result = calcularEscolta({
      km_inicial: 1000,
      km_final: 1150,
      km_vazio: 0,
      horas_missao: 5,
      horas_estadia: 0,
      teve_pernoite: false,
      horario_agendado: "08:00",
      horario_inicio: "08:00",
      horario_fim: "13:00",
      despesas_pedagio: 0,
      despesas_combustivel: 0,
      despesas_outras: 0,
      receitas_os: 0,
      contrato: contract,
    });
    assert.equal(result.fat_total, 940);
    assert.equal(result.fat_acionamento, 500);
    assert.equal(result.fat_km, 240);
    assert.equal(result.fat_hora_extra, 200);
  });

  test("recusada: total comercial permanece zero", () => {
    assert.equal(
      billingTotalForBoletim(
        { fat_total: 999, fat_acionamento: 500, fat_km: 499 },
        "recusada",
      ),
      0,
    );
  });

  test("shadow comparison detecta divergência sem persistir", () => {
    const shadowContract = {
      ...contract,
      hora_extra_fracionada: false,
    };
    const so = {
      id: 9001,
      os_number: "SHADOW-9001",
      type: "escolta",
      status: "concluida",
      mission_status: "encerrada",
      client_id: 1,
      escort_contract_id: 1,
      scheduled_date: "2026-07-20T21:00:00Z",
      mission_started_at: "2026-07-20T21:00:00Z",
      completed_date: "2026-07-21T00:40:00Z",
      assigned_employee_id: 1,
      assigned_employee_2_id: null,
      vehicle_id: 1,
    };
    const currentPayload = computeBillingPayloadForOs({
      so,
      contrato: shadowContract,
      photos: [],
      mCosts: [],
      horasMissao: 3 + 40 / 60,
      clientName: null,
      empName: null,
      emp2Name: null,
      vehPlate: null,
      nowDate: new Date("2026-07-21T00:40:00Z"),
    });
    const canonical = calcularEscolta({
      km_inicial: 0,
      km_final: 0,
      km_vazio: 0,
      horas_missao: 3 + 40 / 60,
      horas_estadia: 0,
      teve_pernoite: false,
      horario_agendado: "18:00",
      horario_inicio: "18:00",
      horario_fim: "21:40",
      inicio_ts: so.mission_started_at,
      fim_ts: so.completed_date,
      scheduled_date: so.scheduled_date,
      despesas_pedagio: 0,
      despesas_combustivel: 0,
      despesas_outras: 0,
      receitas_os: 0,
      contrato: shadowContract,
    });
    const live = calcularFaturamentoLive({
      horasMissao: 3 + 40 / 60,
      kmInicial: 0,
      kmFinal: 0,
      contrato: shadowContract,
    });

    assert.equal(
      currentPayload.fat_total,
      canonical.fat_total,
      "o payload do cron deve usar o motor canônico",
    );
    assert.notEqual(
      live.fat_total,
      canonical.fat_total,
      "Live permanece projeção e não precisa coincidir com o canônico",
    );
  });

  test("reprocessamentos do escopo não escrevem snapshot comercial ou invoice", () => {
    const reprocessingSources = [
      sourceSection(
        "server/cron.ts",
        "export async function executeBillingCron()",
      ),
      sourceSection(
        "server/routes/service-orders.ts",
        'app.post("/api/boletim-medicao/calcular/:osId"',
        'app.patch("/api/boletim-medicao/os/:id/diretoria-override"',
      ),
      sourceSection(
        "server/routes/escort.ts",
        'app.post("/api/escort/billings/submit-os"',
        'app.post("/api/escort/billings/recalcular-lote"',
      ),
      sourceSection(
        "server/routes/escort.ts",
        'app.post("/api/escort/billings/recalcular-lote"',
        'app.patch("/api/escort/billings/:id/salvar"',
      ),
      sourceSection(
        "server/routes/escort.ts",
        'app.patch("/api/escort/billings/:id/salvar"',
        'app.post("/api/escort/billings/:id/revisar"',
      ),
      sourceSection(
        "server/routes/escort.ts",
        'app.post("/api/escort/billings/:id/revisar"',
        'app.post("/api/escort/billings/:id/reabrir"',
      ),
      readFileSync(path.join(root, "server/routes/mission.ts"), "utf8"),
      readFileSync(path.join(root, "server/routes/operational.ts"), "utf8"),
      readFileSync(path.join(root, "server/lib/cancelada-billing.ts"), "utf8"),
    ].join("\n");

    assert.doesNotMatch(reprocessingSources, /\bbilling_snapshot\b/);
    assert.doesNotMatch(
      reprocessingSources,
      /\.from\(\s*["']boletim_approvals["']\s*\)/,
    );
    assert.doesNotMatch(
      reprocessingSources,
      /\.from\(\s*["']invoices["']\s*\)/,
    );
  });

  test("cálculo manual separa concluída, cancelada e recusada", () => {
    const manual = sourceSection(
      "server/routes/service-orders.ts",
      'app.post("/api/boletim-medicao/calcular/:osId"',
      'app.patch("/api/boletim-medicao/os/:id/diretoria-override"',
    );
    assert.match(manual, /calcularEscolta\s*\(/);
    assert.match(manual, /computeCanceladaBilling\s*\(/);
    assert.match(manual, /buildRecusadaZeroPayload\s*\(/);
    assert.match(manual, /isBillingProtected\s*\(/);
    assert.doesNotMatch(manual, /calcularFaturamentoLive\s*\(/);
  });

  test("lote protege frozen e usa motor específico para cancelada", () => {
    const batch = sourceSection(
      "server/routes/escort.ts",
      'app.post("/api/escort/billings/recalcular-lote"',
      'app.patch("/api/escort/billings/:id/salvar"',
    );
    assert.match(batch, /isBillingProtected\s*\(/);
    assert.match(batch, /computeCanceladaBilling\s*\(/);
    assert.match(batch, /buildRecusadaZeroPayload\s*\(/);
    assert.match(batch, /computeBillingPayloadForOs\s*\(/);
    assert.doesNotMatch(batch, /calcularFaturamentoLive\s*\(/);
  });

  test("submit-os usa fatos canônicos e separa cancelada/recusada", () => {
    const submit = sourceSection(
      "server/routes/escort.ts",
      'app.post("/api/escort/billings/submit-os"',
      'app.post("/api/escort/billings/recalcular-lote"',
    );
    assert.match(submit, /computeBillingPayloadForOs\s*\(/);
    assert.match(submit, /computeCanceladaBilling\s*\(/);
    assert.match(submit, /buildRecusadaZeroPayload\s*\(/);
    assert.match(submit, /isBillingProtected\s*\(/);
    assert.doesNotMatch(submit, /calcularFaturamentoLive\s*\(/);
  });

  test("PUT, PATCH e DELETE genéricos exigem proteção frozen/snapshot", () => {
    const put = sourceSection(
      "server/routes/escort.ts",
      'app.put("/api/escort/billings/:id"',
      'app.patch("/api/escort/billings/:id"',
    );
    const patch = sourceSection(
      "server/routes/escort.ts",
      'app.patch("/api/escort/billings/:id"',
      'app.delete("/api/escort/billings/:id"',
    );
    const remove = sourceSection(
      "server/routes/escort.ts",
      'app.delete("/api/escort/billings/:id"',
      'app.post("/api/escort/billings/submit-os"',
    );
    assert.match(put, /select\("id, status, service_order_id, observacoes"\)/);
    assert.match(put, /isBillingProtected\s*\(/);
    assert.match(patch, /isBillingProtected\s*\(/);
    assert.match(remove, /isBillingProtected\s*\(/);
    assert.ok(
      remove.indexOf("isBillingProtected") < remove.indexOf("removeAutoTransaction"),
      "DELETE deve proteger antes de remover ledger/billing",
    );
    assert.match(put, /alteração genérica bloqueada/);
  });

  test("recusas alternativas usam zero integral e preservam billing protegido", () => {
    const adminRefuse = sourceSection(
      "server/routes/mission.ts",
      'app.post("/api/mission/refuse"',
      'app.post("/api/mission/finish"',
    );
    const employeeRefuse = sourceSection(
      "server/routes/mission.ts",
      'app.post("/api/missions/:osId/refuse"',
      'app.get("/api/missions/:osId/acceptances/:employeeId/comprovante"',
    );
    const serviceOrders = readFileSync(path.join(root, "server/routes/service-orders.ts"), "utf8");
    assert.match(adminRefuse, /buildRecusadaZeroPayload\s*\(/);
    assert.match(adminRefuse, /isBillingProtected\s*\(/);
    assert.match(employeeRefuse, /buildRecusadaZeroPayload\s*\(/);
    assert.match(employeeRefuse, /isBillingProtected\s*\(/);
    assert.match(serviceOrders, /OS-Refuse-Billing[\s\S]*buildRecusadaZeroPayload/);
  });

  test("rollback e exclusão de OS bloqueiam billing frozen/snapshot", () => {
    const rollback = sourceSection(
      "server/routes/mission.ts",
      'app.post("/api/mission/rollback-step"',
      'app.post("/api/mission/cancel"',
    );
    const removeOs = sourceSection(
      "server/routes/service-orders.ts",
      'app.delete("/api/service-orders/:id"',
      'app.post("/api/service-orders/:id/send-report-email"',
    );
    assert.match(rollback, /isBillingProtected\s*\(/);
    assert.ok(rollback.indexOf("isBillingProtected") < rollback.indexOf(".delete()"));
    assert.match(removeOs, /isBillingProtected\s*\(/);
    assert.ok(removeOs.indexOf("isBillingProtected") < removeOs.indexOf("deleteServiceOrder"));
  });

  test("falhas de leitura de proteção e recálculo não são ignoradas", () => {
    const escort = readFileSync(path.join(root, "server/routes/escort.ts"), "utf8");
    const mission = readFileSync(path.join(root, "server/routes/mission.ts"), "utf8");
    assert.match(escort, /currentBillingsError\) throw currentBillingsError/);
    assert.match(escort, /Falha ao recalcular billing/);
    assert.match(mission, /currentBillingsError\) throw currentBillingsError/);
    assert.doesNotMatch(mission, /Auto-billing creation failed \(non-blocking\)/);
  });

  test("revisão e reativação não contornam snapshot nem deixam resíduos", () => {
    const review = sourceSection(
      "server/routes/escort.ts",
      'app.post("/api/escort/billings/:id/revisar"',
      'app.post("/api/escort/billings/:id/reabrir"',
    );
    const servicePatch = sourceSection(
      "server/routes/service-orders.ts",
      'app.patch("/api/service-orders/:id"',
      'app.delete("/api/service-orders/:id"',
    );
    assert.match(review, /isBillingProtected\s*\(/);
    assert.match(review, /buildRecusadaZeroPayload\s*\(/);
    assert.match(servicePatch, /billingHasCommercialSnapshot\s*\(/);
    assert.match(servicePatch, /REATIVAR_OS_CANCELADA/);
  });

  test("writers oficiais não usam pedágio estimado ou rota como fato financeiro", () => {
    const manual = sourceSection(
      "server/routes/service-orders.ts",
      'app.post("/api/boletim-medicao/calcular/:osId"',
      'app.patch("/api/boletim-medicao/os/:id/diretoria-override"',
    );
    const mission = sourceSection(
      "server/routes/mission.ts",
      'if (nextStep === "encerrada")',
      'if (so.type === "escolta")',
    );
    assert.doesNotMatch(manual, /pedagioEstimadoCalc|kmRota/);
    assert.doesNotMatch(mission, /pedagioEstimado|kmRota/);
    assert.match(mission, /computeBillingPayloadForOs\s*\(/);
  });

  test("auto-recalc usa o ID atualizado e falha visivelmente", () => {
    const patchRoute = sourceSection(
      "server/routes/service-orders.ts",
      'app.patch("/api/service-orders/:id"',
      'app.get("/api/service-orders/:id/pdf"',
    );
    assert.doesNotMatch(patchRoute, /getMissionCostsByOS\(osId\)/);
    assert.match(patchRoute, /getMissionCostsByOS\(data\.id\)/);
    assert.match(patchRoute, /OS atualizada, mas o billing não pôde ser recalculado/);
  });
});

test.todo("IMPLEMENTAÇÃO: operational-grid não deve materializar Live em espelhos");
