import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractHoleriteIdentity,
  isUsableHoleriteParse,
  matchEmployeeFromHolerite,
  parseHoleriteTorres,
  resolveOpenAIConfig,
} from "./holerite-parse.ts";

const SAMPLE_TORRES = `
TORRES VIGILANCIA PATRIMONIAL LTDA
Funcionário: ANDRE VINICIUS DA SILVA
CPF: 123.456.789-00
Competência: AGO/2026

1 24,00 2.432,50
2 729,75
3 134,13 500,00
4 80,00
5 40,00
6 880,00
7 200,00

Dias trabalhados
Periculosidade 30%
Horas extras 60%
Adicional noturno 20%
DSR horas extras
Vale refeição
Ajuda de custo

Total dos Vencimentos 4.862,25
Total de Descontos 1.200,00
Líquido a Receber 3.662,25
`;

test("parseHoleriteTorres: mapeia rubricas por posição (layout TORRES)", () => {
  const p = parseHoleriteTorres(SAMPLE_TORRES);
  assert.ok(p);
  assert.equal(p!.salarioBase, 2432.5);
  assert.equal(p!.periculosidade, 729.75);
  assert.equal(p!.horasExtras, 500);
  assert.equal(p!.adicionalNoturno, 80);
  assert.equal(p!.dsr, 40);
  assert.equal(p!.valeRefeicao, 880);
  assert.equal(p!.ajudaCusto, 200);
  assert.equal(p!.totalBruto, 4862.25);
  assert.equal(p!.totalLiquido, 3662.25);
  assert.equal(p!.descontos, 1200);
});

test("parseHoleriteTorres: extrai identidade e competência", () => {
  const p = parseHoleriteTorres(SAMPLE_TORRES);
  assert.ok(p);
  assert.match(p!.employeeName.toUpperCase(), /ANDRE VINICIUS/);
  assert.equal(p!.employeeCpf, "123.456.789-00");
  assert.equal(p!.month, 8);
  assert.equal(p!.year, 2026);
  assert.match(p!.competencia, /AGO\/2026/i);
});

test("parseHoleriteTorres: retorna null sem valores numerados", () => {
  assert.equal(parseHoleriteTorres("Só um texto sem holerite"), null);
});

test("isUsableHoleriteParse: exige salário ou bruto", () => {
  assert.equal(isUsableHoleriteParse(null), false);
  assert.equal(
    isUsableHoleriteParse({
      employeeName: "",
      employeeCpf: "",
      month: 0,
      year: 0,
      competencia: "",
      salarioBase: 0,
      periculosidade: 0,
      horasExtras: 0,
      adicionalNoturno: 0,
      dsr: 0,
      valeRefeicao: 0,
      ajudaCusto: 0,
      beneficios: 0,
      descontos: 0,
      totalBruto: 0,
      totalLiquido: 0,
    }),
    false,
  );
  assert.equal(isUsableHoleriteParse(parseHoleriteTorres(SAMPLE_TORRES)), true);
});

test("matchEmployeeFromHolerite: CPF tem prioridade", () => {
  const emps = [
    { id: 1, name: "Outro", cpf: "000.000.000-00" },
    { id: 2, name: "Andre Vinicius da Silva", cpf: "123.456.789-00" },
  ];
  assert.equal(
    matchEmployeeFromHolerite({ employeeName: "Andre", employeeCpf: "123.456.789-00" }, emps),
    2,
  );
});

test("matchEmployeeFromHolerite: fallback por primeiro+último nome", () => {
  const emps = [{ id: 9, name: "Katia Regina Santos", cpf: null }];
  assert.equal(
    matchEmployeeFromHolerite({ employeeName: "Katia Oliveira Santos", employeeCpf: "" }, emps),
    9,
  );
});

test("extractHoleriteIdentity: competência numérica MM/AAAA", () => {
  const id = extractHoleriteIdentity("Competência: 07/2026\nNome: JOAO SILVA\nCPF 111.222.333-44");
  assert.equal(id.month, 7);
  assert.equal(id.year, 2026);
  assert.equal(id.employeeCpf, "111.222.333-44");
});

test("resolveOpenAIConfig: prefer AI_INTEGRATIONS, fallback OPENAI_API_KEY", () => {
  const prevA = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const prevB = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const prevO = process.env.OPENAI_API_KEY;
  try {
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    delete process.env.OPENAI_API_KEY;
    assert.equal(resolveOpenAIConfig(), null);

    process.env.OPENAI_API_KEY = "sk-legacy";
    assert.deepEqual(resolveOpenAIConfig(), { apiKey: "sk-legacy", baseURL: undefined });

    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "sk-int";
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://example.invalid/v1";
    assert.deepEqual(resolveOpenAIConfig(), {
      apiKey: "sk-int",
      baseURL: "https://example.invalid/v1",
    });
  } finally {
    if (prevA === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    else process.env.AI_INTEGRATIONS_OPENAI_API_KEY = prevA;
    if (prevB === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    else process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = prevB;
    if (prevO === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevO;
  }
});
