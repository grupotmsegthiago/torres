import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcularEscolta } from "../billing-calc";

const dedicadaSul = {
  valor_acionamento: 1200,
  franquia_km: 100,
  franquia_horas: 3,
  valor_km_extra: 12,
  valor_hora_extra: 130,
  hora_extra_fracionada: true,
};

describe("OP. DEDICADA SUL — totais do recorte ago/2026", () => {
  it("TOR-0655 Palhoça→Canoas (428 km, 4h51, pedágio 75)", () => {
    const r = calcularEscolta({
      km_inicial: 48751, km_final: 49179, km_vazio: 0,
      horas_missao: 4.85, horas_estadia: 0, teve_pernoite: false,
      horario_agendado: "14:01", horario_inicio: "14:01", horario_fim: "18:52",
      inicio_ts: "2026-08-17T14:01:00-03:00",
      fim_ts: "2026-08-17T18:52:00-03:00",
      scheduled_date: "2026-08-17T14:01:00-03:00",
      despesas_pedagio: 75, despesas_combustivel: 0, despesas_outras: 0,
      contrato: dedicadaSul,
    });
    assert.equal(r.fat_total, 5451.5);
  });

  it("TOR-0712 FLO local (17 km, cobrança desde o agendado 08:00)", () => {
    const r = calcularEscolta({
      km_inicial: 60285, km_final: 60302, km_vazio: 0,
      horas_missao: 4.82, horas_estadia: 0, teve_pernoite: false,
      horario_agendado: "08:00", horario_inicio: "11:51", horario_fim: "12:48",
      inicio_ts: "2026-08-25T11:51:26.289-03:00",
      fim_ts: "2026-08-25T12:48:54.33-03:00",
      scheduled_date: "2026-08-25T08:00:00-03:00",
      despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0,
      contrato: dedicadaSul,
    });
    assert.equal(r.fat_total, 1436.17);
  });
});
