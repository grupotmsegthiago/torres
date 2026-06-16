import { test } from "node:test";
import assert from "node:assert/strict";
import { cidadeFromAddr, rotaCidades } from "./cron-whatsapp-forward.js";

test("cidadeFromAddr: extrai cidade de endereço completo (Cidade - UF, Brasil)", () => {
  assert.equal(
    cidadeFromAddr("Multilog Clia Campinas - Rodovia Anhanguera - Boa Vista, Campinas - SP, Brasil"),
    "Campinas",
  );
  assert.equal(
    cidadeFromAddr("Terra Nova Logística | Matriz - Avenida X - Centro, Barueri - SP, Brasil"),
    "Barueri",
  );
});

test("cidadeFromAddr: UF minúscula não casa o padrão, cai no fallback (último segmento)", () => {
  // "sp" minúsculo não casa /- [A-Z]{2}$/; fallback = último segmento ignorando Brasil.
  assert.equal(cidadeFromAddr("Rua A, Santos - sp, Brasil"), "Santos - sp");
});

test("cidadeFromAddr: sem 'Brasil' no fim ainda extrai a cidade", () => {
  assert.equal(cidadeFromAddr("Av. Paulista, 1000, São Paulo - SP"), "São Paulo");
});

test("cidadeFromAddr: endereço parcial (sem UF) usa último segmento", () => {
  assert.equal(cidadeFromAddr("Centro, Jundiaí"), "Jundiaí");
  assert.equal(cidadeFromAddr("Sorocaba"), "Sorocaba");
});

test("cidadeFromAddr: vazio/nulo retorna ''", () => {
  assert.equal(cidadeFromAddr(""), "");
  assert.equal(cidadeFromAddr(null), "");
  assert.equal(cidadeFromAddr(undefined), "");
});

test("rotaCidades: monta 'Origem → Destino' por cidade", () => {
  assert.equal(
    rotaCidades(
      "Multilog Clia Campinas - Rodovia Anhanguera - Boa Vista, Campinas - SP, Brasil",
      "Terra Nova Logística - Centro, Barueri - SP, Brasil",
    ),
    "Campinas → Barueri",
  );
});

test("rotaCidades: cai pro endereço cru quando não dá pra extrair cidade", () => {
  assert.equal(rotaCidades("Pátio interno", "Doca 3"), "Pátio interno → Doca 3");
});

test("rotaCidades: só um lado preenchido retorna esse lado, sem seta", () => {
  assert.equal(rotaCidades("Campinas - SP, Brasil", null), "Campinas");
  assert.equal(rotaCidades(null, "Barueri - SP, Brasil"), "Barueri");
});

test("rotaCidades: ambos vazios retorna ''", () => {
  assert.equal(rotaCidades(null, null), "");
  assert.equal(rotaCidades("", ""), "");
});
