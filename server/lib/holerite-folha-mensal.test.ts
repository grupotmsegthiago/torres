import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isUsableHoleriteParse,
  matchEmployeeFromHolerite,
  parseHoleriteFolhaMensal,
  parseHoleritePdf,
} from "./holerite-parse.ts";

/** Texto real (extraído) — vigilante Gabriel, Junho/2026 */
const GABRIEL = `
1.581,26	27,50	IMPOSTO DE RENDA	999
Assinatura do Funcionário
2.724,13
7.508,05
Código Descrição Referência Vencimentos Descontos
8781
250
854
205
311
309
DIAS NORMAIS
REFLEXO EXTRAS DSR
REFLEXO ADIC. NOTURNO DSR
HORAS EXTRAS 60%
ADICIONAL NOTURNO RV
DESC VALE REFEICAO
2.565,31
768,46
381,09
3.842,29
1.905,44
154,80
____/____/_______
PERICULOSIDADE 769,59	149
TORRES VIGILANCIA PATRIMONIAL LTDA
GABRIEL APARECIDO DE MELO SOUZA
Nome do Funcionário CBO
517330
Folha Mensal
Junho de 2026
VIGILANTE DE ESCOLTA ARMADA
2.565,31
Salário Base
Total de Vencimentos
Valor Líquido
Total de Descontos
Declaro ter recebido a importância líquida discriminada neste recibo.
10.232,18
2.724,13
7.508,05
`;

/** Texto real — auxiliar Katia */
const KATIA = `
Assinatura do Funcionário
281,94
1.690,54
Código Descrição Referência Vencimentos Descontos
8781
995
309
998
217
DIAS NORMAIS
SALARIO FAMILIA
DESC VALE REFEICAO
I.N.S.S.
VALE TRANSPORTE 6%
1.837,40
135,08
30,66
141,04
110,24
TORRES VIGILANCIA PATRIMONIAL LTDA
KATIA ROSA COSTA
Nome do Funcionário CBO
514320
Folha Mensal
Junho de 2026
AUXILIAR DE LIMPEZA
1.837,40
Salário Base
Total de Vencimentos
Valor Líquido
Total de Descontos
Declaro ter recebido a importância líquida discriminada neste recibo.
1.972,48
281,94
1.690,54
`;

test("Folha Mensal: Gabriel — rubricas e identidade", () => {
  const p = parseHoleriteFolhaMensal(GABRIEL);
  assert.ok(isUsableHoleriteParse(p));
  assert.equal(p!.employeeName, "GABRIEL APARECIDO DE MELO SOUZA");
  assert.equal(p!.month, 6);
  assert.equal(p!.year, 2026);
  assert.equal(p!.salarioBase, 2565.31);
  assert.equal(p!.periculosidade, 769.59);
  assert.equal(p!.horasExtras, 3842.29);
  assert.equal(p!.adicionalNoturno, 1905.44);
  assert.equal(p!.dsr, 1149.55); // 768.46 + 381.09
  assert.equal(p!.valeRefeicao, 154.8);
  assert.equal(p!.descontos, 2724.13);
  assert.equal(p!.totalBruto, 10232.18);
  assert.equal(p!.totalLiquido, 7508.05);
  assert.equal(
    matchEmployeeFromHolerite(p!, [{ id: 21, name: "Gabriel Aparecido de Melo Souza", cpf: null }]),
    21,
  );
});

test("Folha Mensal: Katia — sem periculosidade", () => {
  const p = parseHoleriteFolhaMensal(KATIA);
  assert.ok(isUsableHoleriteParse(p));
  assert.equal(p!.employeeName, "KATIA ROSA COSTA");
  assert.equal(p!.salarioBase, 1837.4);
  assert.equal(p!.periculosidade, 0);
  assert.equal(p!.beneficios, 135.08);
  assert.equal(p!.valeRefeicao, 30.66);
  assert.equal(p!.descontos, 281.94);
  assert.equal(p!.totalBruto, 1972.48);
  assert.equal(p!.totalLiquido, 1690.54);
});

test("parseHoleritePdf: Folha Mensal tem prioridade sobre layout numerado", () => {
  const p = parseHoleritePdf(GABRIEL);
  assert.ok(p);
  assert.equal(p!.salarioBase, 2565.31);
  assert.match(p!.employeeName, /GABRIEL/i);
});
