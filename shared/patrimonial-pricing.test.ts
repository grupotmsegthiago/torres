import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHARGE_ITEMS,
  DEFAULT_PROVISION_ITEMS,
  calcPatrimonialPost,
  patrimonialNegotiatedMargin,
  patrimonialReleaseMode,
  scaleProposalLineTotals,
  sumRates,
  type PatrimonialPricingParams,
} from "./patrimonial-pricing.ts";

const params: PatrimonialPricingParams = {
  periculosidadeRate: 0.3,
  nightHours: 8,
  nightRate: 0.2,
  dsrRate: 0.2,
  he60Rate: 1.6,
  he100Rate: 1,
  holidayRate: 2,
  hourDivisor: 220,
  vrDaily: 42,
  vrDiscountRate: 0.18,
  convenio: 200,
  vaComplement: 0,
  lifeInsurance: 40,
  vtDaily: 20,
  vtDiscountRate: 0.06,
  uniformUnarmed: 80,
  uniformArmed: 100,
  analiseRisco: 20,
  reciclagem: 25,
  rh: 15,
  ppra: 12,
  ajudaCusto: 500,
  ppr: 47,
  issRate: 0.05,
  pisRate: 0,
  cofinsRate: 0,
  taxaAdmRate: 0.04,
  lucroRate: 0.08,
  chargeItems: DEFAULT_CHARGE_ITEMS,
  provisionItems: DEFAULT_PROVISION_ITEMS,
};

test("encargos e provisão somam os percentuais da planilha", () => {
  assert.equal(Math.round(sumRates(DEFAULT_CHARGE_ITEMS) * 10000) / 100, 34);
  assert.equal(Math.round(sumRates(DEFAULT_PROVISION_ITEMS) * 10000) / 100, 32.37);
});

test("vigilante diurno 6x1 reproduz o valor por funcionário da planilha", () => {
  const result = calcPatrimonialPost({
    salary: 2148.22,
    gratificationRate: 0,
    armed: false,
    night: false,
    scale: "6 x 1",
    posts: 1,
    intervalIndenizado: true,
    he60Hours: 0,
    he100Hours: 8,
    holidayHours: 8,
    holidayDsr: false,
  }, params);

  assert.equal(result.costPerEmployee, 8986.65);
  assert.equal(result.pricePerEmployee, 10827.29);
  assert.equal(result.pricePerPost, 10827.29);
  assert.equal(result.lineTotal, 10827.29);
  assert.equal(result.employees, 1);
});

test("escala 12x36 conta dois funcionários por posto", () => {
  const result = calcPatrimonialPost({
    salary: 2148.22,
    gratificationRate: 0,
    armed: false,
    night: true,
    scale: "12 x 36",
    posts: 1,
    intervalIndenizado: false,
    he60Hours: 0,
    he100Hours: 0,
    holidayHours: 0,
    holidayDsr: false,
  }, params);

  assert.equal(result.employees, 2);
  assert.equal(result.days, 15.5);
  assert.equal(result.pricePerPost, result.pricePerEmployee * 2);
  assert.ok(result.nightAdditional > 0);
});

test("custo soma periculosidade, VR, VT com desconto, indiretos, encargos e provisão", () => {
  const result = calcPatrimonialPost({
    salary: 2271.74,
    gratificationRate: 0,
    armed: false,
    night: false,
    scale: "6 x 1",
    posts: 1,
    intervalIndenizado: false,
    he60Hours: 0,
    he100Hours: 8,
    holidayHours: 8,
    holidayDsr: false,
  }, params);

  assert.equal(result.periculosidade, 681.52);
  assert.equal(result.vr, 895.44);
  assert.equal(result.transport, 903.7);
  assert.equal(result.benefits, 240);
  assert.ok(result.indirect > 0);
  assert.ok(result.charges > 0);
  assert.ok(result.provision > 0);
  const parts = result.salary + result.gratification + result.periculosidade
    + result.nightAdditional + result.dsrNight + result.heValue + result.dsrHe
    + result.holidayProvision + result.dsrHoliday + result.interval + result.vr
    + result.benefits + result.transport + result.indirect + result.charges
    + result.provision + result.ppr + result.ajudaCusto;
  assert.equal(Math.round(parts * 100) / 100, result.costPerEmployee);
});

test("negociação do preço define quem libera a proposta", () => {
  const quoted = patrimonialNegotiatedMargin({
    totalCost: 1000,
    negotiatedPrice: 1200,
    taxRate: 0.05,
    taxaAdmRate: 0.04,
  });
  assert.equal(quoted.lucroValue, 92);
  assert.equal(quoted.lucroPercent, 7.7);
  assert.equal(patrimonialReleaseMode(4.9), "bloqueado");
  assert.equal(patrimonialReleaseMode(5), "diretoria");
  assert.equal(patrimonialReleaseMode(10), "diretoria");
  assert.equal(patrimonialReleaseMode(10.1), "automatica");
  assert.deepEqual(scaleProposalLineTotals([100, 50], 120), [80, 40]);
});
