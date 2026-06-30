import { test } from "node:test";
import assert from "node:assert/strict";
import { toIntlPhone, firstName, buildDocNotifyFallback, buildDocSignedFallback, notifyEmployeeDoc, notifyEmployeesDocBackground } from "./signable-doc-notify";

test("toIntlPhone adiciona DDI 55 em número nacional (10/11 dígitos)", () => {
  assert.equal(toIntlPhone("11926839456"), "5511926839456");
  assert.equal(toIntlPhone("(11) 92683-9456"), "5511926839456");
  assert.equal(toIntlPhone("1133334444"), "551133334444");
});

test("toIntlPhone preserva número já com DDI (>=12 dígitos)", () => {
  assert.equal(toIntlPhone("5511926839456"), "5511926839456");
});

test("toIntlPhone retorna null quando não há telefone (best-effort)", () => {
  assert.equal(toIntlPhone(null), null);
  assert.equal(toIntlPhone(undefined), null);
  assert.equal(toIntlPhone(""), null);
  assert.equal(toIntlPhone("   "), null);
});

test("firstName extrai só o primeiro nome", () => {
  assert.equal(firstName("João da Silva"), "João");
  assert.equal(firstName("  Maria  "), "Maria");
  assert.equal(firstName(null), "");
});

test("buildDocNotifyFallback inclui o título do documento e a instrução de assinar no App", () => {
  const msg = buildDocNotifyFallback("Termo de Ciência", "João", false);
  assert.ok(msg.includes("Termo de Ciência"), "deve citar o título do documento");
  assert.match(msg, /App do Vigilante/i);
  assert.match(msg, /Documentos/i);
});

test("buildDocNotifyFallback de lembrete sinaliza pendência", () => {
  // Roda várias vezes para cobrir os textos variados do pool de lembrete.
  let pendenteHits = 0;
  for (let i = 0; i < 50; i++) {
    const msg = buildDocNotifyFallback("Aviso de Férias", "Ana", true);
    assert.ok(msg.includes("Aviso de Férias"));
    if (/pendente|aguardando|lembrar|falta assinar/i.test(msg)) pendenteHits++;
  }
  assert.ok(pendenteHits > 0, "lembrete deve sinalizar pendência em alguma variação");
});

test("buildDocNotifyFallback é VARIADO (anti-ban Z-API) — não repete byte-a-byte", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    seen.add(buildDocNotifyFallback("Termo de Ciência", "João", false));
  }
  // Com 6×4×4 combinações + casualize probabilístico, esperamos alta variedade.
  assert.ok(seen.size > 10, `esperava muitos textos distintos, obteve ${seen.size}`);
});

test("buildDocNotifyFallback funciona sem nome do funcionário", () => {
  const msg = buildDocNotifyFallback("Termo de Ciência", "", false);
  assert.ok(msg.includes("Termo de Ciência"));
  assert.ok(msg.length > 0);
});

test("buildDocSignedFallback confirma a assinatura e cita o título", () => {
  let confirmHits = 0;
  for (let i = 0; i < 50; i++) {
    const msg = buildDocSignedFallback("Termo de Ciência", "João");
    assert.ok(msg.includes("Termo de Ciência"), "deve citar o título do documento");
    if (/assinad|recebemos|confirmad|tudo certo/i.test(msg)) confirmHits++;
  }
  assert.ok(confirmHits > 0, "confirmação deve sinalizar assinatura recebida em alguma variação");
});

test("buildDocSignedFallback NÃO pede pra assinar de novo (é só confirmação)", () => {
  for (let i = 0; i < 50; i++) {
    const msg = buildDocSignedFallback("Aviso de Férias", "Ana");
    assert.ok(!/pendente|aguardando|falta assinar|precisa.+assinar/i.test(msg), `não deve sinalizar pendência: ${msg}`);
  }
});

test("buildDocSignedFallback é VARIADO (anti-ban Z-API) — não repete byte-a-byte", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    seen.add(buildDocSignedFallback("Termo de Ciência", "João"));
  }
  assert.ok(seen.size > 10, `esperava muitos textos distintos, obteve ${seen.size}`);
});

test("buildDocSignedFallback funciona sem nome do funcionário", () => {
  const msg = buildDocSignedFallback("Termo de Ciência", "");
  assert.ok(msg.includes("Termo de Ciência"));
  assert.ok(msg.length > 0);
});

// ===== Entrega best-effort (não quebra a emissão/lembrete) =====
// Estes testes garantem que a falta de telefone (ou um funcionário inválido)
// NUNCA lança — a emissão do documento segue normal e o WhatsApp só é pulado.
// O envio real passa por sendText (server/lib/zapi.ts), que tem a trava
// FAIL-CLOSED de número OFICIAL da Central (ver memory whatsapp-zapi-antiban):
// número errado / instância sem confirmação ⇒ envio bloqueado, mas como esta
// camada é best-effort, o bloqueio também só vira `false`, nunca exceção.

test("notifyEmployeeDoc é best-effort: sem telefone retorna false e NÃO lança", async () => {
  const r = await notifyEmployeeDoc({ id: 1, name: "Sem Telefone", phone: null }, "Termo de Ciência", false);
  assert.equal(r, false, "sem telefone não envia");
});

test("notifyEmployeeDoc é best-effort: telefone vazio/ inválido retorna false e NÃO lança", async () => {
  assert.equal(await notifyEmployeeDoc({ id: 2, name: "X", phone: "" }, "Doc", false), false);
  assert.equal(await notifyEmployeeDoc({ id: 3, name: "Y", phone: "   " }, "Doc", true), false);
  // funcionário undefined também não pode quebrar (rota pode passar lixo)
  assert.equal(await notifyEmployeeDoc(undefined as any, "Doc", false), false);
});

test("notifyEmployeesDocBackground não lança com lista vazia/nula", () => {
  // Dispara em background; o que importa aqui é que a CHAMADA síncrona da rota
  // não lança nem agenda nada com entrada vazia.
  assert.doesNotThrow(() => notifyEmployeesDocBackground([], "Doc", false));
  assert.doesNotThrow(() => notifyEmployeesDocBackground(null as any, "Doc", false));
  assert.doesNotThrow(() => notifyEmployeesDocBackground([null, undefined] as any, "Doc", false));
});
