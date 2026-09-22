import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const asaas = read("server/asaas.ts");
const helpers = read("server/lib/asaas-helpers.ts");
const mission = read("server/routes/mission.ts");
const serviceOrders = read("server/routes/service-orders.ts");
const cronJobs = read("server/cron-jobs.ts");

test("cliente oficial: URL Prod/Sandbox e normalização do legado", () => {
  assert.match(helpers, /ASAAS_PROD_URL = "https:\/\/api\.asaas\.com\/v3"/);
  assert.match(helpers, /ASAAS_SANDBOX_URL = "https:\/\/api-sandbox\.asaas\.com\/v3"/);
  assert.match(helpers, /export function resolveAsaasBaseUrl/);
  assert.match(asaas, /export function getAsaasBaseUrl/);
  assert.match(asaas, /resolveAsaasBaseUrl\(/);
  assert.doesNotMatch(asaas, /www\.asaas\.com\/api\/v3/);
});

test("mission e service-orders não montam cliente HTTP Asaas próprio", () => {
  for (const [name, src] of [
    ["mission.ts", mission],
    ["service-orders.ts", serviceOrders],
  ] as const) {
    assert.match(src, /cancelAsaasPaymentsLinkedToOs/, `${name} deve reusar o cancel oficial`);
    assert.doesNotMatch(src, /startsWith\(["']\$aact_["']\)/, `${name} não pode heurística \$aact_`);
    assert.doesNotMatch(src, /sandbox\.asaas\.com\/api\/v3/, `${name} não pode URL sandbox legado`);
    assert.doesNotMatch(src, /www\.asaas\.com\/api\/v3/, `${name} não pode URL www legado`);
  }
});

test("cron de NF importa o satélite oficial, não uma URL hardcoded", () => {
  assert.match(cronJobs, /import\("\.\/asaas"\)/);
  assert.doesNotMatch(cronJobs, /www\.asaas\.com/);
  assert.doesNotMatch(cronJobs, /startsWith\(["']\$aact_["']\)/);
});

test("webhook de pagamento é fail-closed: recusa sem secret", () => {
  assert.match(asaas, /evaluateAsaasWebhookAuth/);
  assert.doesNotMatch(asaas, /Webhook ACEITO sem validação/);
});

test("NFS-e oficial: código 07870 sem ID e authorize após agendar", () => {
  assert.match(helpers, /effectiveDatePeriod: "ON_PAYMENT_CREATION"/);
  assert.match(helpers, /municipalServiceCode: CODIGO_SERVICO_MUNICIPAL_CODE/);
  assert.match(asaas, /\/invoices\/\$\{nfId\}\/authorize/);
  assert.match(asaas, /delete payload\.municipalServiceId/);
  assert.match(asaas, /delete body\.municipalServiceId/);
  assert.doesNotMatch(asaas, /payload\.municipalServiceId = asMunicipalServiceIdString/);
});
