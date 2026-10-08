import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyAjuste,
  compactAlnum,
  isDhlClientName,
  isInInclusivePeriod,
  isOriginFlorianopolisOrPalhoca,
  isTargetTableName,
  isTmSegClientName,
  missionStartDateBrt,
  estimadoFromAcionamento,
} from "./ajuste-tabela-origem";

describe("ajuste-tabela-origem — cliente", () => {
  it("reconhece só TM SEG e nunca DHL", () => {
    assert.equal(isTmSegClientName("TM SEGURANCA CONSULTORIA & TECNOLOGIA INTEGRADA LTDA"), true);
    assert.equal(isTmSegClientName("tm seg"), true);
    assert.equal(isTmSegClientName("OMEGA SOLUTIONS"), false);
    assert.equal(isDhlClientName("DHL EXPRESS BRASIL"), true);
    assert.equal(isDhlClientName("TM SEGURANCA"), false);
  });
});

describe("ajuste-tabela-origem — cidade de início", () => {
  it("casa Florianópolis e Palhoça em endereço completo", () => {
    assert.equal(
      isOriginFlorianopolisOrPalhoca("Av. Dep. Diomício Freitas, 3393 - Carianos, Florianópolis - SC"),
      true,
    );
    assert.equal(
      isOriginFlorianopolisOrPalhoca("Avenida do Comércio, 155 - Pacheco, Palhoça - SC, Brasil"),
      true,
    );
    assert.equal(isOriginFlorianopolisOrPalhoca("RUA DO COMERCIO, 155 - PALHOÇA, SC"), true);
    assert.equal(isOriginFlorianopolisOrPalhoca("RUA DO COMERCIO 155, PACHECOS - PALHOÇA"), true);
  });

  it("não casa destino Sul sem origem FLO/Palhoça", () => {
    assert.equal(
      isOriginFlorianopolisOrPalhoca("GLP Guarulhos - Avenida Júlia Gaioli - Água Chata, Guarulhos - SP"),
      false,
    );
    assert.equal(isOriginFlorianopolisOrPalhoca("Canoas, RS, Brasil"), false);
  });
});

describe("ajuste-tabela-origem — período e tabela", () => {
  it("período inclusivo ago/2026 em BRT", () => {
    assert.equal(isInInclusivePeriod("2026-08-01"), true);
    assert.equal(isInInclusivePeriod("2026-08-31"), true);
    assert.equal(isInInclusivePeriod("2026-07-31"), false);
    assert.equal(isInInclusivePeriod("2026-09-01"), false);
    assert.equal(
      missionStartDateBrt({ mission_started_at: "2026-08-17T14:01:00-03:00" }),
      "2026-08-17",
    );
  });

  it("nome da tabela alvo é exato", () => {
    assert.equal(isTargetTableName("OP. DEDICADA SUL"), true);
    assert.equal(isTargetTableName("op. dedicada sul"), true);
    assert.equal(isTargetTableName("ORIGEM - BR x 100 KM"), false);
    assert.equal(estimadoFromAcionamento({ valor_acionamento: 1200 }), 1200);
  });
});

describe("ajuste-tabela-origem — decisão", () => {
  const base = {
    clientName: "TM SEGURANCA CONSULTORIA",
    origin: "Palhoça - SC",
    startDateBrt: "2026-08-17",
    soStatus: "concluida",
    currentTableName: "ORIGEM - BR x 400 KM",
    billingStatus: "APROVADA",
    hasApprovedBoletimSnapshot: false,
  };

  it("DHL nunca entra", () => {
    assert.equal(classifyAjuste({ ...base, clientName: "DHL EXPRESS" }), "skip_dhl");
  });

  it("já na OP. DEDICADA SUL é already_ok", () => {
    assert.equal(classifyAjuste({ ...base, currentTableName: "OP. DEDICADA SUL" }), "already_ok");
  });

  it("APROVADA sem boletim aprovado recalcula", () => {
    assert.equal(classifyAjuste(base), "recalc_aprovada");
  });

  it("FATURADO / boletim APROVADO não reabre valor", () => {
    assert.equal(classifyAjuste({ ...base, billingStatus: "FATURADO" }), "skip_faturado_snapshot");
    assert.equal(
      classifyAjuste({ ...base, hasApprovedBoletimSnapshot: true }),
      "skip_faturado_snapshot",
    );
  });

  it("recusada só troca o ponteiro", () => {
    assert.equal(classifyAjuste({ ...base, soStatus: "recusada", billingStatus: "CANCELADO" }), "pointer_recusada");
  });

  it("cancelada aberta recalcula na 100 km/3h da Dedicada Sul", () => {
    assert.equal(classifyAjuste({ ...base, soStatus: "cancelada", billingStatus: "CANCELADO" }), "recalc_cancelada");
  });
});

describe("ajuste-tabela-origem — compact", () => {
  it("remove acento", () => {
    assert.equal(compactAlnum("Florianópolis"), "FLORIANOPOLIS");
    assert.equal(compactAlnum("Palhoça"), "PALHOCA");
  });
});
