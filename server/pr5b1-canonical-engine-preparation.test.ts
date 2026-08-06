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
  serviceOrderIds?: number[];
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
] as const;

export const PR5B1_MISSING_FIXTURE_KINDS = [
  "concluída com billing aberto",
  "concluída com billing congelado",
  "recusada com valores zero",
  "billing em snapshot consistente",
  "billing atual diferente do snapshot",
] as const;

const EXPECTED_PRODUCTION_CALLS: Record<string, Record<string, number>> = {
  calcularEscolta: {
    "server/lib/cancelada-billing.ts": 1,
    "server/routes/escort.ts": 6,
    "server/routes/mission.ts": 1,
    "server/routes/operational.ts": 1,
    "server/routes/service-orders.ts": 6,
  },
  calcularFaturamentoLive: {
    "server/billing-calc.ts": 1,
    "server/financial-snapshot.ts": 1,
    "server/routes/escort.ts": 2,
    "server/routes/operational.ts": 1,
  },
  computeCanceladaBilling: {
    "server/routes/mission.ts": 1,
    "server/routes/service-orders.ts": 1,
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

  test("totais de call-sites: canônico=15, live=5, cancelada=2", () => {
    const total = (values: Record<string, number>) =>
      Object.values(values).reduce((sum, value) => sum + value, 0);
    assert.equal(total(countProductionCalls("calcularEscolta")), 15);
    assert.equal(total(countProductionCalls("calcularFaturamentoLive")), 5);
    assert.equal(total(countProductionCalls("computeCanceladaBilling")), 2);
  });
});

describe("PR5B.1 — registro de golden fixtures sem acesso live", () => {
  test("fixtures confirmadas contêm apenas IDs técnicos e estados", () => {
    assert.equal(PR5B1_CONFIRMED_FIXTURES.length, 4);
    assert.deepEqual(
      PR5B1_CONFIRMED_FIXTURES.map((fixture) => fixture.serviceOrderId).filter(Boolean),
      [42, 955, 979],
    );
    assert.deepEqual(PR5B1_CONFIRMED_FIXTURES[3].serviceOrderIds, [959, 960, 961, 964]);
  });

  test("cinco categorias live permanecem bloqueadas por falta de IDs", () => {
    assert.equal(PR5B1_MISSING_FIXTURE_KINDS.length, 5);
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

    assert.equal(currentPayload.fat_total, live.fat_total);
    assert.notEqual(
      currentPayload.fat_total,
      canonical.fat_total,
      "o shadow deve registrar a divergência atual sem gravar dados",
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
});

test.todo("IMPLEMENTAÇÃO: cron deve materializar apenas o resultado canônico");
test.todo("IMPLEMENTAÇÃO: cálculo manual de cancelada deve usar computeCanceladaBilling");
test.todo("IMPLEMENTAÇÃO: lote deve pular todos os frozen statuses");
test.todo("IMPLEMENTAÇÃO: operational-grid não deve materializar Live em espelhos");
