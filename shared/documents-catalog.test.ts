import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  buildRequiredDocsCatalog,
  filterDocsCatalogByProfile,
  filterDocsCatalogByRole,
  profileFromRole,
  getMandatoryDocTypesForProfile,
  getAllDocTypesForProfile,
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

test("Vigilante: 17 obrigatórios + 2 opcionais (não-Dependentes) = 19 no checklist", () => {
  const mandatory = getMandatoryDocTypesForProfile("vigilante");
  assert.equal(mandatory.length, 17, `vigilante obrigatórios = 17, recebeu ${mandatory.length}: ${mandatory.join(", ")}`);
  // Splits de antecedentes esperados pro vigilante:
  assert.ok(mandatory.includes("Antecedente Criminal Polícia Civil"));
  assert.ok(mandatory.includes("Antecedente Criminal Polícia Militar"));
  assert.ok(!mandatory.includes("Antecedentes Criminais"), "vigilante não usa Antecedentes Criminais unificado");
  // ASO e Fotos 3x4 obrigatórios:
  assert.ok(mandatory.includes("ASO"));
  assert.ok(mandatory.includes("Fotos 3x4"));
  // Reservista obrigatório no vigilante:
  assert.ok(mandatory.includes("Certificado de Reservista"));

  const all = getAllDocTypesForProfile("vigilante");
  assert.equal(all.length, 19, `vigilante total no checklist (sem Dependentes) = 19, recebeu ${all.length}`);
  assert.ok(all.includes("Carteira de Vacinação"));
  assert.ok(all.includes("Comprovante de Formação Escolar"));
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

test("Opcionais não entram nos mandatórios (Vacinação + Formação Escolar)", () => {
  for (const profile of ["vigilante", "admin"] as const) {
    const mand = getMandatoryDocTypesForProfile(profile);
    assert.ok(!mand.includes("Carteira de Vacinação"), `${profile} não pode ter Vacinação como obrigatório`);
    assert.ok(!mand.includes("Comprovante de Formação Escolar"), `${profile} não pode ter Form. Escolar como obrigatório`);
  }
});
