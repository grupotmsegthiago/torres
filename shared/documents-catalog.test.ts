import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  buildRequiredDocsCatalog,
  filterDocsCatalogByProfile,
  filterDocsCatalogByRole,
  profileFromRole,
  getMandatoryDocTypesForProfile,
  getAllDocTypesForProfile,
  isReciclagemDue,
  filterReciclagemByCnv,
  filterFormacaoOnce,
  isReciclagemRenewalDue,
  resolveReciclagemClock,
  isWithinDiretoriaGrace,
  isInactiveEmployee,
  reciclagemBlocksEmployee,
  RECICLAGEM_ESCOLTA_TYPE,
  FORMACAO_VIGILANTE_TYPE,
  FORMACAO_ESCOLTA_TYPE,
} from "./documents-catalog";

test("profileFromRole: vigilante variants", () => {
  assert.equal(profileFromRole("Vigilante"), "vigilante");
  assert.equal(profileFromRole("vigilante"), "vigilante");
  assert.equal(profileFromRole("Escolta Armada"), "vigilante");
  assert.equal(profileFromRole("Operador"), "vigilante");
  assert.equal(profileFromRole("Operacional"), "vigilante");
});

test("profileFromRole: admin variants (Aux Limpeza inclusive)", () => {
  assert.equal(profileFromRole("Adm"), "admin");
  assert.equal(profileFromRole("Gerente"), "admin");
  assert.equal(profileFromRole("Supervisor"), "admin");
  assert.equal(profileFromRole("Auxiliar de Limpeza"), "admin");
  assert.equal(profileFromRole(""), "admin");
  assert.equal(profileFromRole(null), "admin");
  assert.equal(profileFromRole(undefined), "admin");
});

test("Vigilante: 13 obrigatórios + 6 opcionais (não-Dependentes) = 19 no checklist", () => {
  const mandatory = getMandatoryDocTypesForProfile("vigilante");
  assert.equal(mandatory.length, 13, `vigilante obrigatórios = 13, recebeu ${mandatory.length}: ${mandatory.join(", ")}`);
  assert.ok(mandatory.includes(FORMACAO_VIGILANTE_TYPE), "formação de vigilante continua obrigatória uma vez");
  assert.ok(!mandatory.includes(FORMACAO_ESCOLTA_TYPE), "formação de escolta é extensão e não entra como pendência separada");
  // Decidido com o dono (jun/2026): Pontuação CNH e Antecedentes (Civil/Militar) NÃO
  // são obrigatórios — viram opcionais (aparecem no checklist, não contam no alerta).
  assert.ok(!mandatory.includes("Certidão de Pontuação CNH"));
  assert.ok(!mandatory.includes("Antecedente Criminal Polícia Civil"));
  assert.ok(!mandatory.includes("Antecedente Criminal Polícia Militar"));
  assert.ok(!mandatory.includes("Antecedentes Criminais"), "vigilante não usa Antecedentes Criminais unificado");
  // ASO e Fotos 3x4 obrigatórios:
  assert.ok(mandatory.includes("ASO"));
  assert.ok(mandatory.includes("Fotos 3x4"));
  // Reservista obrigatório no vigilante:
  assert.ok(mandatory.includes("Certificado de Reservista"));

  const all = getAllDocTypesForProfile("vigilante");
  assert.equal(all.length, 19, `vigilante total no checklist (sem Dependentes) = 19, recebeu ${all.length}`);
  // Os opcionais continuam no checklist visual:
  assert.ok(all.includes("Carteira de Vacinação"));
  assert.ok(all.includes("Comprovante de Formação Escolar"));
  assert.ok(all.includes("Certidão de Pontuação CNH"));
  assert.ok(all.includes("Antecedente Criminal Polícia Civil"));
  assert.ok(all.includes("Antecedente Criminal Polícia Militar"));
});

test("Admin (funcionário comum): NENHUM documento cobrado — checklist e alertas zerados", () => {
  // Decidido com o dono: funcionário comum não tem cobrança de documentos.
  const mandatory = getMandatoryDocTypesForProfile("admin");
  assert.equal(mandatory.length, 0, `admin não deve ter obrigatórios, recebeu ${mandatory.length}: ${mandatory.join(", ")}`);

  const all = getAllDocTypesForProfile("admin");
  assert.equal(all.length, 0, `admin não deve ter itens no checklist, recebeu ${all.length}`);

  const catAdmin = filterDocsCatalogByProfile(buildRequiredDocsCatalog(), "admin");
  assert.equal(catAdmin.length, 0, "catálogo do admin deve vir vazio (sem grupos)");
});

test("Auxiliar de Limpeza usa exatamente o mesmo checklist de Admin", () => {
  const adminMand = getMandatoryDocTypesForProfile(profileFromRole("Adm"));
  const limpezaMand = getMandatoryDocTypesForProfile(profileFromRole("Auxiliar de Limpeza"));
  assert.deepEqual(limpezaMand, adminMand);
});

test("filterDocsCatalogByRole(catalog, true) === filterDocsCatalogByProfile(catalog, 'vigilante')", () => {
  const cat = buildRequiredDocsCatalog();
  const byRole = filterDocsCatalogByRole(cat, true);
  const byProfile = filterDocsCatalogByProfile(cat, "vigilante");
  assert.deepEqual(byRole, byProfile);
});

test("Dependentes presente como grupo opcional no checklist visual (não conta no alerta)", () => {
  const catVig = filterDocsCatalogByProfile(buildRequiredDocsCatalog(), "vigilante");
  const depGroup = catVig.find(g => g.group === "Dependentes (se necessário)");
  assert.ok(depGroup, "grupo Dependentes deve aparecer no checklist visual");
  assert.equal(depGroup!.items.length, 3);
  assert.ok(depGroup!.items.every(i => i.optional), "todos os itens de dependentes são opcionais");

  // Mas não entra no alerta de pendência:
  const mandatoryVig = getMandatoryDocTypesForProfile("vigilante");
  assert.ok(!mandatoryVig.some(t => depGroup!.items.some(i => i.type === t)));
});

test("Opcionais não entram nos mandatórios (Vacinação, Form. Escolar, Pontuação CNH, Antec. Civil/Militar)", () => {
  for (const profile of ["vigilante", "admin"] as const) {
    const mand = getMandatoryDocTypesForProfile(profile);
    assert.ok(!mand.includes("Carteira de Vacinação"), `${profile} não pode ter Vacinação como obrigatório`);
    assert.ok(!mand.includes("Comprovante de Formação Escolar"), `${profile} não pode ter Form. Escolar como obrigatório`);
    assert.ok(!mand.includes("Certidão de Pontuação CNH"), `${profile} não pode ter Pontuação CNH como obrigatório`);
    assert.ok(!mand.includes("Antecedente Criminal Polícia Civil"), `${profile} não pode ter Antec. Civil como obrigatório`);
    assert.ok(!mand.includes("Antecedente Criminal Polícia Militar"), `${profile} não pode ter Antec. Militar como obrigatório`);
    assert.ok(!mand.includes(FORMACAO_ESCOLTA_TYPE), `${profile} não pode ter formação de escolta como pendência separada`);
  }
});

test("isReciclagemDue: sem data → não cobra", () => {
  assert.equal(isReciclagemDue(null), false);
  assert.equal(isReciclagemDue(""), false);
  assert.equal(isReciclagemDue(undefined), false);
  assert.equal(isReciclagemDue("data-invalida"), false);
});

test("isReciclagemDue: < 2 anos não cobra, >= 2 anos cobra", () => {
  const hoje = "2026-06-09";
  assert.equal(isReciclagemDue("2025-01-10", hoje), false); // ~1.4 anos
  assert.equal(isReciclagemDue("2024-06-10", hoje), false); // 1 dia antes de 2 anos
  assert.equal(isReciclagemDue("2024-06-09", hoje), true);  // exatamente 2 anos
  assert.equal(isReciclagemDue("2020-01-01", hoje), true);  // bem antigo
  assert.equal(isReciclagemDue("2024-06-09T00:00:00", hoje), true); // tolera timestamp
});

test("filterReciclagemByCnv: remove reciclagem quando não cobra, mantém quando cobra", () => {
  const hoje = "2026-06-09";
  const base = getMandatoryDocTypesForProfile("vigilante");
  assert.ok(base.includes(RECICLAGEM_ESCOLTA_TYPE), "vigilante deve ter reciclagem como obrigatório base");

  const semData = filterReciclagemByCnv(base, null, hoje);
  assert.ok(!semData.includes(RECICLAGEM_ESCOLTA_TYPE), "sem data → reciclagem fora");

  const recente = filterReciclagemByCnv(base, "2025-06-01", hoje);
  assert.ok(!recente.includes(RECICLAGEM_ESCOLTA_TYPE), "CNV < 2 anos → reciclagem fora");

  const antigo = filterReciclagemByCnv(base, "2023-01-01", hoje);
  assert.ok(antigo.includes(RECICLAGEM_ESCOLTA_TYPE), "CNV >= 2 anos → reciclagem dentro");

  // não mexe nos outros tipos
  assert.deepEqual(antigo, base);
});

test("filterFormacaoOnce: formação no sistema zera as duas cobranças", () => {
  const base = [FORMACAO_VIGILANTE_TYPE, FORMACAO_ESCOLTA_TYPE, "RG", RECICLAGEM_ESCOLTA_TYPE];
  assert.deepEqual(filterFormacaoOnce(base, []), [FORMACAO_VIGILANTE_TYPE, "RG", RECICLAGEM_ESCOLTA_TYPE]);
  assert.deepEqual(
    filterFormacaoOnce(base, [FORMACAO_VIGILANTE_TYPE]),
    ["RG", RECICLAGEM_ESCOLTA_TYPE],
  );
  assert.deepEqual(
    filterFormacaoOnce(base, [FORMACAO_ESCOLTA_TYPE]),
    ["RG", RECICLAGEM_ESCOLTA_TYPE],
  );
});

test("isInactiveEmployee e prazo da diretoria", () => {
  assert.equal(isInactiveEmployee("inativo"), true);
  assert.equal(isInactiveEmployee(" Inativo "), true);
  assert.equal(isInactiveEmployee("ativo"), false);
  assert.equal(isWithinDiretoriaGrace(null, "2026-09-22"), false);
  assert.equal(isWithinDiretoriaGrace("2026-09-22", "2026-09-22"), true);
  assert.equal(isWithinDiretoriaGrace("2026-09-21", "2026-09-22"), false);
  assert.equal(isWithinDiretoriaGrace("2026-10-01T00:00:00", "2026-09-22"), true);
});

test("reciclagem renova pela validade, pela data ou pelo CNV", () => {
  const hoje = "2026-09-22";
  assert.equal(isReciclagemRenewalDue({ cnvIssueDate: "2025-01-01", hasReciclagem: false }, hoje), false);
  assert.equal(isReciclagemRenewalDue({ cnvIssueDate: "2020-01-01", hasReciclagem: false }, hoje), true);
  assert.equal(isReciclagemRenewalDue({ cnvIssueDate: "2020-01-01", hasReciclagem: true }, hoje), false);
  assert.equal(
    isReciclagemRenewalDue({ cnvIssueDate: "2020-01-01", reciclagemOn: "2025-01-01", hasReciclagem: true }, hoje),
    false,
  );
  assert.equal(
    isReciclagemRenewalDue({ cnvIssueDate: "2020-01-01", reciclagemOn: "2024-01-01", hasReciclagem: true }, hoje),
    true,
  );
  assert.equal(
    isReciclagemRenewalDue({ cnvIssueDate: "2020-01-01", reciclagemExpiry: "2026-09-22", hasReciclagem: true }, hoje),
    true,
  );
  assert.equal(
    isReciclagemRenewalDue({ cnvIssueDate: "2020-01-01", reciclagemExpiry: "2026-12-01", hasReciclagem: true }, hoje),
    false,
  );
});

test("resolveReciclagemClock usa o certificado que vale mais longe", () => {
  const clock = resolveReciclagemClock([
    { type: "Reciclagem Escolta Armada", issueDate: "2020-01-01" },
    { type: "Reciclagem", completedAt: "2025-06-01", expiryDate: "2027-06-01" },
    { type: "RG" },
  ], "2018-01-01");
  assert.equal(clock.hasReciclagem, true);
  assert.equal(clock.reciclagemExpiry, "2027-06-01");
  assert.equal(clock.reciclagemOn, "2025-06-01");
  assert.equal(isReciclagemRenewalDue(clock, "2026-09-22"), false);
});

test("reciclagem não trava inativo nem dentro do prazo da diretoria", () => {
  const clock = { cnvIssueDate: "2020-01-01", hasReciclagem: false };
  assert.equal(reciclagemBlocksEmployee({ status: "inativo", clock, today: "2026-09-22" }).block, false);
  assert.equal(
    reciclagemBlocksEmployee({ status: "ativo", docGraceUntil: "2026-12-31", clock, today: "2026-09-22" }).block,
    false,
  );
  assert.equal(reciclagemBlocksEmployee({ status: "ativo", role: "Vigilante", clock, today: "2026-09-22" }).block, true);
  assert.equal(reciclagemBlocksEmployee({ status: "ativo", role: "Adm", clock, today: "2026-09-22" }).block, false);
});

test("isReciclagemDue: ano bissexto (29/fev) → vence em 01/mar do 2º ano", () => {
  // CNV emitido em 29/02/2024; 2026 não é bissexto. Comparação lexical de string
  // trata o vencimento como "2026-02-29" (inexistente): cobra a partir de 01/mar.
  assert.equal(isReciclagemDue("2024-02-29", "2026-02-28"), false);
  assert.equal(isReciclagemDue("2024-02-29", "2026-03-01"), true);
});
