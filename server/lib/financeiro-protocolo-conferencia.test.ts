import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

describe("protocolo de assinatura + conferido diretoria", () => {
  it("schema de boot cria colunas de protocolo e conferido", () => {
    const routes = readFileSync(path.join(root, "server/routes.ts"), "utf8");
    assert.match(routes, /protocolo_url TEXT/);
    assert.match(routes, /protocolo_path TEXT/);
    assert.match(routes, /conferido_diretoria BOOLEAN DEFAULT FALSE/);
    assert.match(routes, /conferido_por TEXT/);
    assert.match(routes, /conferido_em TIMESTAMP/);
  });

  it("API reutiliza financial_transactions e bucket comprovantes-pagamento", () => {
    const escort = readFileSync(path.join(root, "server/routes/escort.ts"), "utf8");
    assert.match(escort, /app\.post\("\/api\/financial\/transactions\/:id\/protocolo"/);
    assert.match(escort, /app\.get\("\/api\/financial\/transactions\/:id\/protocolo-url"/);
    assert.match(escort, /app\.patch\("\/api\/financial\/transactions\/:id\/conferir"/);
    const prot = escort.slice(escort.indexOf("/protocolo\""));
    const protBlock = prot.slice(0, prot.indexOf("/conferir\""));
    assert.match(protBlock, /comprovantes-pagamento/);
    assert.match(escort, /kind: "boleto" \| "nf" \| "protocolo"/);
  });

  it("tick de conferência não muda status PAGO", () => {
    const escort = readFileSync(path.join(root, "server/routes/escort.ts"), "utf8");
    const conferir = escort.slice(escort.indexOf('/conferir"'));
    const block = conferir.slice(0, conferir.indexOf("app.put"));
    assert.match(block, /conferido_diretoria/);
    assert.doesNotMatch(block, /status:\s*"PAID"/);
    assert.doesNotMatch(block, /createAutoTransaction/);
  });

  it("UI de contas a pagar tem 4-PROT e tick Dir", () => {
    const ui = readFileSync(path.join(root, "client/src/pages/admin/financeiro.tsx"), "utf8");
    assert.match(ui, /4-PROT/);
    assert.match(ui, /button-pick-protocolo/);
    assert.match(ui, /button-tick-dir-/);
    assert.match(ui, /Conferido \(diretoria\)/);
    assert.match(ui, /handleUploadDoc\(t\.id, "protocolo"\)/);
  });

  it("listagem de contas a pagar anexa protocolo mesmo depois de pago ou aprovado", () => {
    const ui = readFileSync(path.join(root, "client/src/pages/admin/financeiro.tsx"), "utf8");
    const start = ui.indexOf("{/* 4 — PROTOCOLO DE ASSINATURA");
    const end = ui.indexOf("cell-dir-", start);
    assert.ok(start >= 0 && end > start, "bloco 4-PROT da listagem não encontrado");
    const block = ui.slice(start, end);
    assert.match(block, /<button[\s\S]*handleUploadDoc\(t\.id, "protocolo"\)/);
    assert.match(block, /badge-prot-pend-/);
    assert.match(block, /4-PROT \?/);
    assert.doesNotMatch(block, /<span[\s\S]*badge-prot-pend-/);
    assert.doesNotMatch(block, /entra em Aguardando aprovação/);
    assert.match(ui, /também pode anexar depois na listagem/);
    assert.match(ui, /data-testid="text-protocolo-depois-listagem"/);
  });

  it("API de protocolo não exige fila de aprovação", () => {
    const escort = readFileSync(path.join(root, "server/routes/escort.ts"), "utf8");
    const start = escort.indexOf('app.post("/api/financial/transactions/:id/protocolo"');
    const end = escort.indexOf('app.get("/api/financial/transactions/:id/protocolo-url"');
    assert.ok(start >= 0 && end > start);
    const block = escort.slice(start, end);
    assert.match(block, /canEditTransactionDocs/);
    assert.doesNotMatch(block, /AGUARDANDO_APROVACAO/);
    assert.doesNotMatch(block, /status\s*[!=]==/);
  });
});
