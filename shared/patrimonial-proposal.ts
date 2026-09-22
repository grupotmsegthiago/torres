/**
 * Cálculo do módulo Patrimonial (imposto, comissão e bônus).
 * Não usa a tabela comercial já existente no sistema.
 */

export const PATRIMONIAL_REGIONS = [
  "Sudeste (Exceto MG e ES)",
  "Minas Gerais e Espírito Santo",
  "Região Nordeste",
  "Região Centro-Oeste",
  "Região Norte",
  "Região Sul",
] as const;

export const PATRIMONIAL_SERVICE_TYPES = [
  "Pronta Resposta (Velado)",
  "Moto Acompanhamento",
  "Escolta Armada Caracterizada",
] as const;

export const PATRIMONIAL_PROPOSAL_VALIDITY_DAYS = 15;

export type PatrimonialMatrix = {
  taxPercentage: number;
  commissionPercentage: number;
  bonusThreshold1: number;
  bonusValue1: number;
  bonusThreshold2: number;
  bonusValue2: number;
};

export type PatrimonialCalc = {
  taxAmount: number;
  netResult: number;
  commissionAmount: number;
  bonusAmount: number;
  totalPayable: number;
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calcPatrimonialProposal(grossValue: number, matrix: PatrimonialMatrix): PatrimonialCalc {
  const gross = roundMoney(grossValue);
  const taxAmount = roundMoney(gross * (matrix.taxPercentage / 100));
  const netResult = roundMoney(gross - taxAmount);
  const commissionAmount = roundMoney(gross * (matrix.commissionPercentage / 100));
  let bonusAmount = 0;
  if (gross >= matrix.bonusThreshold2) bonusAmount = matrix.bonusValue2;
  else if (gross >= matrix.bonusThreshold1) bonusAmount = matrix.bonusValue1;
  bonusAmount = roundMoney(bonusAmount);
  return {
    taxAmount,
    netResult,
    commissionAmount,
    bonusAmount,
    totalPayable: roundMoney(commissionAmount + bonusAmount),
  };
}
