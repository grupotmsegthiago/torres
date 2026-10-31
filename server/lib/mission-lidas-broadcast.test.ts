import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { avisarMensagensLidas } from "./mission-lidas-broadcast.ts";

const envUrl = process.env.SUPABASE_URL;
const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

afterEach(() => {
  if (envUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = envUrl;
  if (envKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = envKey;
});

test("avisa as outras telas com os ids já gravados", async () => {
  process.env.SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";
  let chamado: { url: string; init: RequestInit } | null = null;
  const fetchImpl: typeof fetch = async (url, init) => {
    chamado = { url: String(url), init: init || {} };
    return new Response(null, { status: 202 });
  };

  const resultado = await avisarMensagensLidas([12, 12, 0, 15], fetchImpl);

  assert.equal(resultado.enviou, true);
  assert.equal(resultado.status, 202);
  assert.ok(chamado);
  assert.equal(
    chamado.url,
    "https://exemplo.supabase.co/realtime/v1/api/broadcast/mission-updates-lidas/events/lidas",
  );
  assert.equal(chamado.init.method, "POST");
  assert.equal(chamado.init.body, JSON.stringify({ ids: [12, 15] }));
  const headers = chamado.init.headers as Record<string, string>;
  assert.equal(headers.apikey, "chave-de-teste");
  assert.equal(headers.Authorization, "Bearer chave-de-teste");
});

test("marcar todas avisa com o corte geral", async () => {
  process.env.SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";
  let body = "";
  const fetchImpl: typeof fetch = async (_url, init) => {
    body = String(init?.body || "");
    return new Response(null, { status: 202 });
  };

  const resultado = await avisarMensagensLidas(null, fetchImpl);
  assert.equal(resultado.enviou, true);
  assert.equal(body, JSON.stringify({ todas: true }));
});

test("sem configuração ou sem id não chama a rede", async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  let chamadas = 0;
  const fetchImpl: typeof fetch = async () => {
    chamadas += 1;
    return new Response(null, { status: 202 });
  };

  assert.deepEqual(await avisarMensagensLidas([1], fetchImpl), { enviou: false, status: null });
  process.env.SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";
  assert.deepEqual(await avisarMensagensLidas([], fetchImpl), { enviou: false, status: null });
  assert.equal(chamadas, 0);
});

test("falha do aviso não estoura a leitura", async () => {
  process.env.SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";
  const fetchImpl: typeof fetch = async () => {
    throw new Error("rede fora");
  };
  assert.deepEqual(await avisarMensagensLidas([4], fetchImpl), { enviou: false, status: null });
});
