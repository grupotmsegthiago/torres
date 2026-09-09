import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildComissaoIngestPayload,
  fetchComerciaisAtivos,
  getComissaoIngestConfig,
  ingestComissaoInvoice,
  isUuid,
  parseComerciaisResponse,
  postComissaoIngest,
  todayBrtDate,
} from "./comissao-ingest.js";

const COMERCIAL_ID = "11111111-2222-4333-8333-444444444444";

describe("comissao-ingest config", () => {
  it("não configura sem token", () => {
    const cfg = getComissaoIngestConfig({});
    assert.equal(cfg.configured, false);
    assert.equal(cfg.url, "https://sistema.grupotmseg.com.br/api/comissoes/ingest");
  });

  it("usa URL default e token do env", () => {
    const cfg = getComissaoIngestConfig({ COMISSAO_INGEST_TOKEN: "secret-token" });
    assert.equal(cfg.configured, true);
    assert.equal(cfg.token, "secret-token");
  });
});

describe("parseComerciaisResponse", () => {
  it("lê comerciais: [{ id, nome }]", () => {
    const list = parseComerciaisResponse({
      comerciais: [
        { id: COMERCIAL_ID, nome: "Ana Comercial" },
        { id: "nao-uuid", nome: "Inválido" },
        { id: COMERCIAL_ID, nome: "Duplicado" },
      ],
    });
    assert.equal(list.length, 1);
    assert.equal(list[0].nome, "Ana Comercial");
  });
});

describe("buildComissaoIngestPayload", () => {
  const invoice = {
    id: 451,
    client_id: 12,
    client_name: "Cliente X",
    value: "1000.00",
    created_at: "2026-09-09T15:00:00-03:00",
    nfse_number: "NF-99",
    status: "PENDING",
  };

  it("monta FATURADO", () => {
    const p = buildComissaoIngestPayload({
      evento: "FATURADO",
      invoice,
      comercialId: COMERCIAL_ID,
    });
    assert.ok(p);
    assert.equal(p!.empresa, "TORRES");
    assert.equal(p!.evento, "FATURADO");
    assert.equal(p!.origemFaturaId, "451");
    assert.equal(p!.clienteOrigemId, "12");
    assert.equal(p!.comercialId, COMERCIAL_ID);
    assert.equal(p!.valorFaturamento, 1000);
    assert.equal(p!.dataFaturamento, "2026-09-09");
    assert.equal(p!.faturaNumero, "NF-99");
    assert.equal(p!.dataRecebimento, undefined);
  });

  it("inclui dataRecebimento em PAGO", () => {
    const p = buildComissaoIngestPayload({
      evento: "PAGO",
      invoice: { ...invoice, payment_date: "2026-09-10" },
      comercialId: COMERCIAL_ID,
    });
    assert.equal(p!.evento, "PAGO");
    assert.equal(p!.dataRecebimento, "2026-09-10");
  });

  it("não dispara FATURADO para AGUARDANDO_FATURAMENTO", () => {
    const p = buildComissaoIngestPayload({
      evento: "FATURADO",
      invoice: { ...invoice, status: "AGUARDANDO_FATURAMENTO" },
      comercialId: COMERCIAL_ID,
    });
    assert.equal(p, null);
  });

  it("rejeita comercial inválido", () => {
    assert.equal(isUuid("abc"), false);
    const p = buildComissaoIngestPayload({
      evento: "CANCELADO",
      invoice,
      comercialId: "abc",
    });
    assert.equal(p, null);
  });
});

describe("fail-soft ingest", () => {
  it("POST com HTTP 500 não lança", async () => {
    const calls: any[] = [];
    const result = await postComissaoIngest(
      {
        empresa: "TORRES",
        evento: "FATURADO",
        origemFaturaId: "1",
        clienteOrigemId: "2",
        clienteNome: "X",
        comercialId: COMERCIAL_ID,
        valorFaturamento: 10,
        dataFaturamento: "2026-09-09",
        faturaNumero: "1",
      },
      {
        env: { COMISSAO_INGEST_TOKEN: "tok" },
        fetchFn: (async (url, init) => {
          calls.push({ url, method: init?.method, headers: init?.headers });
          return new Response("fail", { status: 500 });
        }) as typeof fetch,
      },
    );
    assert.equal(result.sent, false);
    assert.equal(result.status, 500);
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].headers["x-comissao-ingest-token"], "tok");
  });

  it("rede caída não lança", async () => {
    const result = await postComissaoIngest(
      {
        empresa: "TORRES",
        evento: "PAGO",
        origemFaturaId: "1",
        clienteOrigemId: "2",
        clienteNome: "X",
        comercialId: COMERCIAL_ID,
        valorFaturamento: 10,
        dataFaturamento: "2026-09-09",
        faturaNumero: "1",
        dataRecebimento: "2026-09-10",
      },
      {
        env: { COMISSAO_INGEST_TOKEN: "tok" },
        fetchFn: (async () => { throw new Error("ECONNRESET"); }) as typeof fetch,
      },
    );
    assert.equal(result.sent, false);
  });

  it("sem comercial no cliente não chama a TM SEG", async () => {
    let called = false;
    const result = await ingestComissaoInvoice(
      "FATURADO",
      { invoice: { id: 9, client_id: 3, value: 50, status: "PENDING" } },
      undefined,
      {
        env: { COMISSAO_INGEST_TOKEN: "tok" },
        loadClient: async () => ({ id: 3, name: "Y", responsavel_comercial_id: null }),
        fetchFn: (async () => {
          called = true;
          return new Response("{}", { status: 200 });
        }) as typeof fetch,
      },
    );
    assert.equal(result.sent, false);
    assert.equal(result.skipped, "no_comercial");
    assert.equal(called, false);
  });

  it("GET comerciais devolve lista e não vaza token em erro de parse", async () => {
    const r = await fetchComerciaisAtivos({
      env: { COMISSAO_INGEST_TOKEN: "tok" },
      fetchFn: (async () =>
        new Response(JSON.stringify({ comerciais: [{ id: COMERCIAL_ID, nome: "Ana" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch,
    });
    assert.equal(r.ok, true);
    assert.equal(r.comerciais[0].nome, "Ana");
  });

  it("todayBrtDate é YYYY-MM-DD", () => {
    assert.match(todayBrtDate(new Date("2026-09-09T15:00:00-03:00")), /^\d{4}-\d{2}-\d{2}$/);
  });
});
