import { test } from "node:test";
import assert from "node:assert/strict";
import {
  randInt,
  humanDelayMs,
  randomTypingSeconds,
  buildReminderFallback,
  buildReminderMessage,
  varyForwardHeader,
  shuffle,
  typingSecondsForMessage,
  reminderIntervalMinutes,
  type ReminderContext,
} from "./whatsapp-humanize";

test("randInt fica sempre dentro do intervalo [min,max]", () => {
  for (let i = 0; i < 500; i++) {
    const v = randInt(3, 9);
    assert.ok(v >= 3 && v <= 9, `fora do range: ${v}`);
    assert.equal(Number.isInteger(v), true);
  }
});

test("humanDelayMs respeita os limites default (4000–18000ms)", () => {
  for (let i = 0; i < 500; i++) {
    const v = humanDelayMs();
    assert.ok(v >= 4000 && v <= 18000, `fora do range: ${v}`);
  }
});

test("randomTypingSeconds fica em [2,8] e é inteiro (Z-API limita a 15)", () => {
  for (let i = 0; i < 500; i++) {
    const v = randomTypingSeconds();
    assert.ok(v >= 2 && v <= 8, `fora do range: ${v}`);
    assert.ok(v <= 15, "não pode passar do limite da Z-API");
    assert.equal(Number.isInteger(v), true);
  }
});

test("buildReminderFallback SEMPRE inclui o número da OS e pede atualização no sistema", () => {
  const ctx: ReminderContext = { osLabel: "TOR-0253", trigger: "cron" };
  for (let i = 0; i < 200; i++) {
    const msg = buildReminderFallback(ctx);
    assert.ok(msg.includes("TOR-0253"), `sem OS: ${msg}`);
    assert.ok(
      /sistema|app|aplicativo|posi[cç][aã]o|situa[cç][aã]o|atualiz/i.test(msg),
      `sem pedido de atualização: ${msg}`,
    );
  }
});

test("buildReminderFallback VARIA o texto (anti-bot): >5 versões distintas em 100 chamadas", () => {
  const ctx: ReminderContext = { osLabel: "TOR-0100", trigger: "cron" };
  const set = new Set<string>();
  for (let i = 0; i < 100; i++) set.add(buildReminderFallback(ctx));
  assert.ok(set.size > 5, `pouca variação: só ${set.size} versões distintas`);
});

test("buildReminderFallback de cliente menciona o cliente / pedido", () => {
  const ctx: ReminderContext = { osLabel: "TOR-0077", trigger: "client" };
  let mentionsClient = 0;
  for (let i = 0; i < 100; i++) {
    if (/cliente|solicit/i.test(buildReminderFallback(ctx))) mentionsClient++;
  }
  assert.ok(mentionsClient > 0, "nenhuma variação de cliente menciona o cliente");
});

test("buildReminderMessage cai no fallback (com OS) quando não há chave de IA", async () => {
  const prev = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  try {
    const msg = await buildReminderMessage({ osLabel: "TOR-0999", trigger: "cron" });
    assert.ok(msg.length > 0);
    assert.ok(msg.includes("TOR-0999"), `fallback sem OS: ${msg}`);
  } finally {
    if (prev !== undefined) process.env.AI_INTEGRATIONS_OPENAI_API_KEY = prev;
  }
});

test("varyForwardHeader retorna cabeçalho não-vazio e varia", () => {
  const set = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const h = varyForwardHeader();
    assert.ok(h.length > 0);
    set.add(h);
  }
  assert.ok(set.size > 1, "cabeçalho do encaminhamento não varia");
});

test("shuffle preserva os elementos e não muta o array original", () => {
  const orig = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(orig);
  assert.deepEqual(orig, [1, 2, 3, 4, 5, 6, 7, 8], "mutou o array original");
  assert.deepEqual([...out].sort((a, b) => a - b), orig, "perdeu/ganhou elementos");
  // Em muitas tentativas, pelo menos uma ordem diferente deve aparecer.
  let differed = false;
  for (let i = 0; i < 50 && !differed; i++) {
    if (shuffle(orig).some((v, idx) => v !== orig[idx])) differed = true;
  }
  assert.ok(differed, "shuffle nunca alterou a ordem");
});

test("typingSecondsForMessage cresce com o tamanho e respeita [3,14] (Z-API <=15)", () => {
  const curto = typingSecondsForMessage("oi");
  const longo = typingSecondsForMessage("a".repeat(400));
  assert.ok(curto >= 3 && curto <= 14, `curto fora do range: ${curto}`);
  assert.ok(longo >= 3 && longo <= 14, `longo fora do range: ${longo}`);
  assert.ok(longo >= curto, "mensagem longa não digitou por mais tempo");
  for (let i = 0; i < 300; i++) {
    const v = typingSecondsForMessage("x".repeat(randInt(0, 500)));
    assert.ok(v >= 3 && v <= 14 && Number.isInteger(v), `fora do range: ${v}`);
  }
});

test("reminderIntervalMinutes faz backoff (cresce com count) e nunca < 30min", () => {
  for (let i = 0; i < 300; i++) {
    assert.ok(reminderIntervalMinutes(0) >= 30, "1ª re-cobrança abaixo de 30min");
    assert.ok(reminderIntervalMinutes(10) >= 30);
  }
  // Backoff: faixas mais altas de count dão intervalo maior que as baixas.
  assert.ok(reminderIntervalMinutes(0) <= 42);
  assert.ok(reminderIntervalMinutes(3) >= 50);
  assert.ok(reminderIntervalMinutes(5) >= 80);
  assert.ok(reminderIntervalMinutes(9) >= 120);
});
