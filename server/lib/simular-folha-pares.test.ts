import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateSimEmployees,
  formatSimReportText,
  runSimEmployeeList,
  type SimEmployeeMonth,
} from "./simular-folha-pares";

function fakeOk(partial: Partial<SimEmployeeMonth> & { employeeId: number; employeeName: string }): SimEmployeeMonth {
  return {
    monthYear: "2026-07",
    horasMensais: 220,
    horasMensaisSource: "override_explicito",
    totalAnteriorMin: 100,
    totalNovoMin: 90,
    deltaMin: -10,
    heAnteriorMin: 0,
    heNovoMin: 0,
    heDeltaMin: 0,
    heImpactBRL: 0,
    heRateBRL: 16,
    heRateSource: "override_explicito",
    heImpactNote: "estimativa com taxa configurada R$ 16 (override)",
    orphanCount: 0,
    duplicateCount: 0,
    cappedDays: 0,
    daysResponsible: [],
    hasHistoricoSnapshot: false,
    hasLockedPeriod: false,
    competenciaFechada: false,
    simulacaoIncompleta: false,
    incompletaReasons: [],
    ...partial,
  };
}

test("aggregateSimEmployees: identidade requested = compared + failed + ignored", () => {
  const report = aggregateSimEmployees({
    monthYear: "2026-07",
    requested: [
      { id: 1, name: "Ok" },
      { id: 22, name: "Reis" },
      { id: 3, name: "Sem batida" },
    ],
    compared: [fakeOk({ employeeId: 1, employeeName: "Ok" })],
    failed: [{ employeeId: 22, employeeName: "Reis", error: "boom DB" }],
    ignored: [{ employeeId: 3, employeeName: "Sem batida", reason: "sem_batidas_no_periodo" }],
  });

  assert.equal(report.totals.employeesRequested, 3);
  assert.equal(report.totals.employeesCompared, 1);
  assert.equal(report.totals.employeesFailed, 1);
  assert.equal(report.totals.employeesIgnored, 1);
  assert.equal(
    report.totals.employeesRequested,
    report.totals.employeesCompared + report.totals.employeesFailed + report.totals.employeesIgnored,
  );
});

test("runSimEmployeeList: funcionário com erro aparece em failedEmployees e incompleta", async () => {
  const report = await runSimEmployeeList({
    monthYear: "2026-07",
    list: [
      { id: 10, name: "A" },
      { id: 11, name: "B-falha" },
      { id: 12, name: "C-sem-batida" },
    ],
    runEmployee: async (opts) => {
      if (opts.employeeId === 11) throw new Error("falha simulada");
      if (opts.employeeId === 12) {
        return fakeOk({
          employeeId: 12,
          employeeName: "C-sem-batida",
          totalAnteriorMin: 0,
          totalNovoMin: 0,
          deltaMin: 0,
          orphanCount: 0,
        });
      }
      return fakeOk({
        employeeId: opts.employeeId,
        employeeName: opts.employeeName || "",
      });
    },
  });

  assert.equal(report.failedEmployees.length, 1);
  assert.equal(report.failedEmployees[0].employeeId, 11);
  assert.equal(report.failedEmployees[0].employeeName, "B-falha");
  assert.equal(report.failedEmployees[0].error, "falha simulada");
  assert.equal(report.totals.employeesFailed, 1);
  assert.equal(report.totals.employeesCompared, 1);
  assert.equal(report.totals.employeesIgnored, 1);
  assert.equal(report.totals.employeesRequested, 3);
  assert.equal(report.totals.incompleteCount, 1);
  assert.equal(report.simulacaoIncompleta, true);
  assert.equal(report.conclusaoIntegral, false);

  const text = formatSimReportText(report);
  assert.match(text, /Falhas \(não comparados\)/);
  assert.match(text, /#11 B-falha: falha simulada/);
  assert.match(text, /NÃO declara conclusão integral/);
  assert.match(text, /conclusão integral: false/);
  // Não declara conclusão integral como true
  assert.doesNotMatch(text, /conclusão integral: true/);
});
