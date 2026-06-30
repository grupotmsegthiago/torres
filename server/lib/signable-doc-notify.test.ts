import { test } from "node:test";
import assert from "node:assert/strict";
import { toIntlPhone, firstName, buildDocNotifyFallback, buildDocSignedFallback, notifyEmployeeDoc, notifyDocsBackground, buildRhDocSignedFallback, resolveRhRecipient } from "./signable-doc-notify";

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
// número errado / instância sem confirmação ⇒ envio bloqueado. Agora a camada
// devolve o STATUS da tentativa (enviado/sem_telefone/bloqueado/falha) p/ o RH,
// em vez do boolean descartado — mas continua best-effort, nunca lança.

test("notifyEmployeeDoc é best-effort: sem telefone retorna 'sem_telefone' e NÃO lança", async () => {
  const r = await notifyEmployeeDoc({ id: 1, name: "Sem Telefone", phone: null }, "Termo de Ciência", false);
  assert.equal(r, "sem_telefone", "sem telefone não envia");
});

test("notifyEmployeeDoc é best-effort: telefone vazio/ inválido retorna 'sem_telefone' e NÃO lança", async () => {
  assert.equal(await notifyEmployeeDoc({ id: 2, name: "X", phone: "" }, "Doc", false), "sem_telefone");
  assert.equal(await notifyEmployeeDoc({ id: 3, name: "Y", phone: "   " }, "Doc", true), "sem_telefone");
  // funcionário undefined também não pode quebrar (rota pode passar lixo)
  assert.equal(await notifyEmployeeDoc(undefined as any, "Doc", false), "sem_telefone");
});

test("notifyDocsBackground não lança com lista vazia/nula", () => {
  // Dispara em background; o que importa aqui é que a CHAMADA síncrona da rota
  // não lança nem agenda nada com entrada vazia.
  assert.doesNotThrow(() => notifyDocsBackground([], "Doc", false));
  assert.doesNotThrow(() => notifyDocsBackground(null as any, "Doc", false));
  assert.doesNotThrow(() => notifyDocsBackground([null, undefined] as any, "Doc", false));
});

test("buildRhDocSignedFallback cita QUEM assinou e QUAL documento", () => {
  const msg = buildRhDocSignedFallback("Termo de Ciência", "João da Silva", "Vigilante");
  assert.ok(msg.includes("Termo de Ciência"), "deve citar o título do documento");
  assert.ok(msg.includes("João da Silva"), "deve citar o nome de quem assinou");
  assert.ok(msg.includes("Vigilante"), "deve citar o cargo quando informado");
});

test("buildRhDocSignedFallback sinaliza que foi ASSINADO (não pede assinatura)", () => {
  for (let i = 0; i < 50; i++) {
    const msg = buildRhDocSignedFallback("Aviso de Férias", "Ana", "Escolta");
    assert.match(msg, /assin/i, `deve sinalizar assinatura: ${msg}`);
    assert.ok(!/pendente|aguardando|falta assinar/i.test(msg), `não deve sinalizar pendência: ${msg}`);
  }
});

test("buildRhDocSignedFallback funciona sem nome/cargo do funcionário", () => {
  const msg = buildRhDocSignedFallback("Termo de Ciência", "", "");
  assert.ok(msg.includes("Termo de Ciência"));
  assert.ok(msg.length > 0);
});

test("buildRhDocSignedFallback é VARIADO (anti-ban Z-API) — não repete byte-a-byte", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    seen.add(buildRhDocSignedFallback("Termo de Ciência", "João", "Vigilante"));
  }
  assert.ok(seen.size > 10, `esperava muitos textos distintos, obteve ${seen.size}`);
});

test("resolveRhRecipient prioriza grupo, cai pro número, e null sem config", () => {
  const origGroup = process.env.RH_WHATSAPP_GROUP;
  const origPhone = process.env.RH_WHATSAPP_PHONE;
  try {
    delete process.env.RH_WHATSAPP_GROUP;
    delete process.env.RH_WHATSAPP_PHONE;
    assert.equal(resolveRhRecipient(), null);

    process.env.RH_WHATSAPP_PHONE = "11926839456";
    assert.equal(resolveRhRecipient(), "5511926839456");

    process.env.RH_WHATSAPP_GROUP = "120363000000000000@g.us";
    assert.equal(resolveRhRecipient(), "120363000000000000@g.us");
  } finally {
    if (origGroup === undefined) delete process.env.RH_WHATSAPP_GROUP; else process.env.RH_WHATSAPP_GROUP = origGroup;
    if (origPhone === undefined) delete process.env.RH_WHATSAPP_PHONE; else process.env.RH_WHATSAPP_PHONE = origPhone;
  }
});
