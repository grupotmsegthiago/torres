import { test } from "node:test";
import assert from "node:assert/strict";
import { getTableColumns } from "drizzle-orm";
import { employees } from "@shared/schema";
import { EMPLOYEE_DATE_FIELDS } from "./employees";

// Regressão do erro `invalid input syntax for type date: ""`: o cadastro/edição
// de colaborador converte "" -> null APENAS para os campos em
// EMPLOYEE_DATE_FIELDS. Se uma coluna `date` da tabela employees ficar de fora,
// um input vazio chega como "" no Supabase e estoura. Este teste garante que a
// lista cobre TODAS as colunas date do schema.

test("EMPLOYEE_DATE_FIELDS cobre todas as colunas date da tabela employees", () => {
  const cols = getTableColumns(employees);
  const dateCols = Object.entries(cols)
    .filter(([, c]) => (c as any).columnType === "PgDate")
    .map(([name]) => name)
    .sort();

  const listed = [...EMPLOYEE_DATE_FIELDS].sort();
  const missing = dateCols.filter((c) => !listed.includes(c));

  assert.deepEqual(
    missing,
    [],
    `Colunas date sem tratamento "" -> null: ${missing.join(", ")}. Adicione-as em EMPLOYEE_DATE_FIELDS (server/routes/employees.ts).`,
  );
});

test("EMPLOYEE_DATE_FIELDS não tem nome inexistente no schema", () => {
  const cols = getTableColumns(employees);
  const valid = new Set(Object.keys(cols));
  const bogus = EMPLOYEE_DATE_FIELDS.filter((f) => !valid.has(f));
  assert.deepEqual(bogus, [], `Campos inexistentes em employees: ${bogus.join(", ")}`);
});
