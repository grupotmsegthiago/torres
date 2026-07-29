/**
 * CLI — simulação somente leitura Folha first_last × pares.
 *
 * Uso:
 *   npx tsx scripts/simular-folha-pares.ts 2026-07
 *   npx tsx scripts/simular-folha-pares.ts 2026-07 --employee 22
 *   npx tsx scripts/simular-folha-pares.ts 2026-07 --json > /tmp/sim.json
 *
 * Requer SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ou vars já usadas pelo server).
 * NÃO grava nada no banco.
 *
 * Sem acesso ao banco: rode os testes de fixture
 *   npx tsx --test server/lib/jornada-pares.test.ts
 */
import "dotenv/config";
import {
  simulateAllEmployeesMonth,
  simulateEmployeeMonth,
  formatSimReportText,
} from "../server/lib/simular-folha-pares";
import {
  REIS_TORRES_DAYS,
  fixtureTorresPunchesToInputs,
  REIS_TORRES_PARES_TOTAL_MIN,
  REIS_TORRES_FIRST_LAST_TOTAL_MIN,
} from "../server/lib/fixtures/reis-torres-dump";
import {
  computeJornadaFirstLast,
  computeJornadaPares,
  hhmmFromMinutes,
} from "../server/lib/jornada-pares";

async function runFixtureOffline() {
  let ant = 0;
  let nov = 0;
  console.log("# Simulação OFFLINE — fixture Torres (reconstrução pericial)");
  console.log("# Dump SQL real ainda necessário para validar 04/07 e demais dias.\n");
  for (const d of REIS_TORRES_DAYS) {
    const a = computeJornadaFirstLast(fixtureTorresPunchesToInputs(d));
    const b = computeJornadaPares(fixtureTorresPunchesToInputs(d));
    ant += a.workedMinutes;
    nov += b.workedMinutes;
    if (a.workedMinutes !== b.workedMinutes || b.orphanPunches.length) {
      console.log(
        `${d.date}: ${hhmmFromMinutes(a.workedMinutes)} → ${hhmmFromMinutes(b.workedMinutes)} (Δ ${b.workedMinutes - a.workedMinutes}) órfãs=${b.orphanPunches.length}`,
      );
    }
  }
  console.log(`\nTOTAL anterior (first_last): ${hhmmFromMinutes(ant)} (esperado ${hhmmFromMinutes(REIS_TORRES_FIRST_LAST_TOTAL_MIN)})`);
  console.log(`TOTAL novo (pares):         ${hhmmFromMinutes(nov)} (esperado ${hhmmFromMinutes(REIS_TORRES_PARES_TOTAL_MIN)})`);
  console.log(`HE novo: ${hhmmFromMinutes(nov - 220 * 60)}`);
}

async function main() {
  const args = process.argv.slice(2);
  const monthYear = args.find((a) => /^\d{4}-\d{2}$/.test(a)) || "2026-07";
  const empIdx = args.indexOf("--employee");
  const employeeId = empIdx >= 0 ? Number(args[empIdx + 1]) : undefined;
  const asJson = args.includes("--json");
  const fixtureOnly = args.includes("--fixture");

  if (fixtureOnly || (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL)) {
    await runFixtureOffline();
    if (fixtureOnly) return;
    console.error("\n[aviso] Sem credenciais Supabase — só fixture offline. Para FASE 4 completa:");
    console.error("  export SUPABASE_URL=...");
    console.error("  export SUPABASE_SERVICE_ROLE_KEY=...");
    console.error(`  npx tsx scripts/simular-folha-pares.ts ${monthYear}`);
    process.exitCode = 0;
    return;
  }

  try {
    if (employeeId) {
      const row = await simulateEmployeeMonth({ employeeId, monthYear });
      if (asJson) console.log(JSON.stringify(row, null, 2));
      else {
        console.log(formatSimReportText({
          generatedAt: new Date().toISOString(),
          monthYear,
          horasMensaisDefault: 220,
          heRateBRL: 16,
          employees: [row],
          totals: {
            employeesCompared: 1,
            employeesWithDelta: row.deltaMin !== 0 ? 1 : 0,
            sumDeltaMin: row.deltaMin,
            sumHeImpactBRL: row.heImpactBRL,
          },
        }));
      }
    } else {
      const report = await simulateAllEmployeesMonth({ monthYear });
      if (asJson) console.log(JSON.stringify(report, null, 2));
      else console.log(formatSimReportText(report));
    }
  } catch (e: any) {
    console.error("[erro] Falha ao consultar banco:", e?.message || e);
    console.error("Rodando fallback de fixture offline…\n");
    await runFixtureOffline();
    process.exitCode = 1;
  }
}

main();
