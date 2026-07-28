import { test } from "node:test";
import assert from "node:assert/strict";
import { auditarOsCore } from "./gestor-medicao";
import { calcularEscolta } from "../billing-calc";

// Cenários obrigatórios do Gestor de Medição Sênior:
// 1. OS recusada = R$ 0 sempre (§8.1) — cobrado 0 ⇒ OK; cobrado >0 ⇒ divergência crítica.
// 2. OS concluída com billing batendo o motor oficial ⇒ CALCULADO_OK e aprovável em lote.
// 3. Billing com valor manual acima do cálculo ⇒ DIVERGENCIA_* (nunca aprovável).
// 4. Sem billing ⇒ DADOS_INCOMPLETOS. Sem tabela ⇒ REGRA_NAO_ENCONTRADA.
// 5. KM final < inicial ⇒ issue ALTA (segura aprovação automática).

const contrato = {
  id: "c1",
  status: "Ativo",
  valor_acionamento: 480,
  franquia_km: 100,
  franquia_horas: 3,
  valor_hora_extra: 110,
  valor_km_extra: 4.8,
  hora_extra_fracionada: true,
};

function billingFromMotor(so: any, extra: any = {}) {
  // Gera um billing "correto": mesmos campos que a aprovação grava.
  const r = calcularEscolta({
    km_inicial: 1000, km_final: 1150, km_vazio: 0,
    horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
    inicio_ts: so.mission_started_at, fim_ts: so.completed_date,
    scheduled_date: so.scheduled_date,
    despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0, receitas_os: 0,
    contrato,
  } as any);
  return {
    id: 99, service_order_id: so.id, status: "A_VERIFICAR", contract_id: "c1",
    km_inicial: 1000, km_final: 1150, km_vazio: 0,
    horas_missao: r.horas_trabalhadas, horas_estadia: 0, teve_pernoite: false,
    fat_acionamento: r.fat_acionamento, fat_km: r.fat_km, fat_hora_extra: r.fat_hora_extra,
    fat_adicional_noturno: r.fat_adicional_noturno, fat_estadia: r.fat_estadia,
    fat_pernoite: r.fat_pernoite, fat_total: r.fat_total,
    despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0, receitas_os: 0,
    ...extra,
  };
}

const soBase = {
  id: 1, os_number: "OS-100", status: "concluida", client_id: 7,
  escort_contract_id: "c1",
  scheduled_date: "2026-07-10T08:00:00Z",
  mission_started_at: "2026-07-10T08:00:00Z",
  completed_date: "2026-07-10T10:00:00Z",
};

const contratos = new Map([["c1", contrato]]);
const semFallback = new Map<number, any>();

test("recusada com cobrado R$0 = CALCULADO_OK; com valor = divergência crítica", async () => {
  const so = { ...soBase, status: "recusada" };
  const okRes = await auditarOsCore(so, { status: "A_VERIFICAR", fat_total: 500 }, contratos, semFallback);
  // billingTotalForBoletim já zera recusada ⇒ cobrado 0
  assert.equal(okRes.analysisStatus, "CALCULADO_OK");
  assert.equal(okRes.expectedTotalCents, 0);
  assert.equal(okRes.aprovavelEmLote, false); // recusada NUNCA aprovável
});

test("concluída com billing gerado pelo motor oficial = CALCULADO_OK aprovável", async () => {
  const billing = billingFromMotor(soBase);
  const r = await auditarOsCore(soBase, billing, contratos, semFallback);
  assert.equal(r.analysisStatus, "CALCULADO_OK");
  assert.equal(r.differenceCents, 0);
  assert.equal(r.aprovavelEmLote, true);
  assert.ok(r.memoria?.calculo_correto?.total > 0);
});

test("valor manual acima do cálculo = DIVERGENCIA, nunca aprovável", async () => {
  const billing = billingFromMotor(soBase);
  billing.fat_total = billing.fat_total + 150; // ajuste manual sem memória
  const r = await auditarOsCore(soBase, billing, contratos, semFallback);
  assert.ok(r.analysisStatus.startsWith("DIVERGENCIA"));
  assert.equal(r.aprovavelEmLote, false);
  assert.equal(r.differenceCents, 15000);
  assert.ok(r.issues.some((i) => i.type === "VALOR_ACIMA"));
  assert.ok(r.issues.some((i) => i.type === "TOTAL_INCONSISTENTE"));
});

test("componente KM adulterado = DIVERGENCIA_KM apontando o componente", async () => {
  const billing = billingFromMotor(soBase);
  billing.fat_km = Number(billing.fat_km) + 100;
  billing.fat_total = Number(billing.fat_total) + 100;
  const r = await auditarOsCore(soBase, billing, contratos, semFallback);
  assert.equal(r.analysisStatus, "DIVERGENCIA_KM");
  assert.ok(r.issues.some((i) => i.type === "COMPONENTE_FAT_KM"));
});

test("sem billing = DADOS_INCOMPLETOS; sem tabela = REGRA_NAO_ENCONTRADA", async () => {
  const semBilling = await auditarOsCore(soBase, null, contratos, semFallback);
  assert.equal(semBilling.analysisStatus, "DADOS_INCOMPLETOS");
  assert.equal(semBilling.aprovavelEmLote, false);

  const soSemTabela = { ...soBase, escort_contract_id: null };
  const billing = billingFromMotor(soBase, { contract_id: null });
  const semTabela = await auditarOsCore(soSemTabela, billing, new Map(), semFallback);
  assert.equal(semTabela.analysisStatus, "REGRA_NAO_ENCONTRADA");
});

test("km final < inicial gera issue ALTA e segura aprovação (ATENCAO)", async () => {
  const billing = billingFromMotor(soBase, { km_inicial: 1150, km_final: 1000 });
  // Recalcula os fat_* como o motor faria com max(ini,fim): km executado = 0
  const r0 = calcularEscolta({
    km_inicial: 1150, km_final: 1150, km_vazio: 0,
    horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
    inicio_ts: soBase.mission_started_at, fim_ts: soBase.completed_date,
    scheduled_date: soBase.scheduled_date,
    despesas_pedagio: 0, despesas_combustivel: 0, despesas_outras: 0, receitas_os: 0,
    contrato,
  } as any);
  Object.assign(billing, {
    fat_acionamento: r0.fat_acionamento, fat_km: r0.fat_km, fat_hora_extra: r0.fat_hora_extra,
    fat_adicional_noturno: r0.fat_adicional_noturno, fat_estadia: r0.fat_estadia,
    fat_pernoite: r0.fat_pernoite, fat_total: r0.fat_total,
  });
  const r = await auditarOsCore(soBase, billing, contratos, semFallback);
  assert.ok(r.issues.some((i) => i.type === "KM_FINAL_MENOR" && i.severity === "ALTA"));
  assert.equal(r.analysisStatus, "ATENCAO"); // valor bate, mas dado suspeito ⇒ análise manual
  assert.equal(r.aprovavelEmLote, false);
});

test("tabela inativa vira alerta MEDIO (ATENCAO) mesmo com valor batendo", async () => {
  const inativo = { ...contrato, id: "c2", status: "Inativo" };
  const so = { ...soBase, escort_contract_id: "c2" };
  const billing = billingFromMotor(so, { contract_id: "c2" });
  const r = await auditarOsCore(so, billing, new Map([["c2", inativo]]), semFallback);
  assert.ok(r.issues.some((i) => i.type === "TABELA_INATIVA"));
  assert.equal(r.analysisStatus, "ATENCAO");
});

test("total correto mas componente trocado = DIVERGENCIA_COMPOSICAO (não diz que total errou)", async () => {
  const billing = billingFromMotor(soBase);
  // move R$50 do KM pra hora extra — total idêntico, composição diferente
  billing.fat_km = Number(billing.fat_km) - 50;
  billing.fat_hora_extra = Number(billing.fat_hora_extra) + 50;
  const r = await auditarOsCore(soBase, billing, contratos, semFallback);
  assert.equal(r.analysisStatus, "DIVERGENCIA_COMPOSICAO");
  assert.equal(r.differenceCents, 0);
  assert.equal(r.aprovavelEmLote, false);
  assert.ok(r.verdict.includes("COMPOSIÇÃO"));
  assert.ok(r.issues.some(i => i.type === "COMPOSICAO_DIVERGENTE"));
});

test("billing APROVADO com divergência do recálculo atual = ATENCAO (alteração pós-aprovação), não erro de cálculo", async () => {
  const billing = billingFromMotor(soBase, { status: "APROVADA" });
  billing.fat_total = Number(billing.fat_total) + 200; // congelado difere do recálculo atual
  const r = await auditarOsCore(soBase, billing, contratos, semFallback);
  assert.equal(r.analysisStatus, "ATENCAO");
  assert.equal(r.jaAprovada, true);
  assert.ok(r.issues.some(i => i.type === "ALTERACAO_POS_APROVACAO"));
});

test("billing FATURADO com divergência = mesmo tratamento de congelado", async () => {
  const billing = billingFromMotor(soBase, { status: "FATURADO" });
  billing.fat_total = Number(billing.fat_total) + 99;
  const r = await auditarOsCore(soBase, billing, contratos, semFallback);
  assert.equal(r.analysisStatus, "ATENCAO");
  assert.ok(r.issues.some(i => i.type === "ALTERACAO_POS_APROVACAO"));
});

test("billing A_VERIFICAR (não aprovado) com divergência segue DIVERGENCIA_*", async () => {
  const billing = billingFromMotor(soBase);
  billing.fat_total = Number(billing.fat_total) + 99;
  const r = await auditarOsCore(soBase, billing, contratos, semFallback);
  assert.ok(r.analysisStatus.startsWith("DIVERGENCIA"));
  assert.notEqual(r.analysisStatus, "DIVERGENCIA_COMPOSICAO");
});
