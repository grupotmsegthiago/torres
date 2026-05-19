/**
 * Canonical validator pra detectar telefones e CEPs incompletos.
 * É usado tanto pelo backend (rotas de POST/PATCH de clients/employees/leads)
 * quanto pelo frontend (badges/filtros nas telas admin) — fonte única da regra
 * pra evitar drift entre cliente e servidor.
 *
 * Regra:
 * - Telefone BR: 10 (fixo) ou 11 (celular com 9) dígitos.
 * - CEP BR: exatamente 8 dígitos.
 * - Vazio/null/undefined é considerado válido (campo opcional a nível de
 *   cadastro). Só reporta quando há valor PRESENTE mas com contagem inválida.
 */

export type ContactIssueKind = "phone_short" | "phone_long" | "zip_invalid";

export type ContactValidationError = {
  field: string;
  kind: ContactIssueKind;
  message: string;
  digits: number;
};

export type ContactFieldSpec = { phones?: string[]; zips?: string[] };

function digitCount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const str = String(value).trim();
  if (!str) return 0;
  return str.replace(/\D/g, "").length;
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return String(value).trim() !== "";
}

export function validateContactFields<T extends object>(
  obj: T | null | undefined,
  fields: ContactFieldSpec,
): ContactValidationError[] {
  const errors: ContactValidationError[] = [];
  if (!obj) return errors;
  const record = obj as Record<string, unknown>;
  for (const key of fields.phones || []) {
    if (!(key in record)) continue;
    const value = record[key];
    if (!isPresent(value)) continue;
    const len = digitCount(value);
    if (len < 10) {
      errors.push({
        field: key,
        kind: "phone_short",
        digits: len,
        message: `Telefone curto (${len} dígitos) — esperado 10 ou 11.`,
      });
    } else if (len > 11) {
      errors.push({
        field: key,
        kind: "phone_long",
        digits: len,
        message: `Telefone longo (${len} dígitos) — esperado 10 ou 11.`,
      });
    }
  }
  for (const key of fields.zips || []) {
    if (!(key in record)) continue;
    const value = record[key];
    if (!isPresent(value)) continue;
    const len = digitCount(value);
    if (len !== 8) {
      errors.push({
        field: key,
        kind: "zip_invalid",
        digits: len,
        message: `CEP com ${len} dígitos — esperado exatamente 8.`,
      });
    }
  }
  return errors;
}

export function hasContactIssues<T extends object>(
  obj: T | null | undefined,
  fields: ContactFieldSpec,
): boolean {
  return validateContactFields(obj, fields).length > 0;
}

export function summarizeContactIssues(
  issues: ReadonlyArray<ContactValidationError>,
): string {
  return issues.map((i) => i.message).join("\n");
}

/** Alias semântico pra leitores no front (badges/filtros). */
export const getContactIssues = validateContactFields;
