/**
 * Helpers para normalizar telefone e CEP antes de salvar no banco.
 * Armazenamos apenas dígitos para evitar formatos misturados (com/sem máscara)
 * e facilitar busca, integração com gateways de SMS/WhatsApp e relatórios.
 *
 * Regra:
 * - Telefone BR: 10 ou 11 dígitos. Se vier mais/menos, mantém só os dígitos
 *   (sem validação rígida — alguns registros antigos podem ter formato estranho).
 * - CEP BR: 8 dígitos.
 * - Entrada vazia/null/undefined → null.
 */

export function normalizePhone(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  const digits = str.replace(/\D/g, "");
  if (!digits) return null;
  // Limita a 11 dígitos (DDD + 9 dígitos). Se vier código do país (ex: 5511...),
  // preserva os 11 últimos.
  if (digits.length > 11) return digits.slice(-11);
  return digits;
}

export function normalizeZip(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  const digits = str.replace(/\D/g, "");
  if (!digits) return null;
  // CEP tem 8 dígitos. Se vier maior, trunca; se vier menor, mantém pra não
  // perder o dado (frontend mostra o que tiver).
  if (digits.length > 8) return digits.slice(0, 8);
  return digits;
}

/**
 * Aplica normalização em um objeto, modificando os campos indicados.
 * Só altera campos que estão presentes no objeto (não adiciona campos novos).
 */
export function normalizeContactFields<T extends Record<string, any>>(
  obj: T,
  fields: { phones?: string[]; zips?: string[] }
): T {
  const out: any = { ...obj };
  for (const key of fields.phones || []) {
    if (key in out) out[key] = normalizePhone(out[key]);
  }
  for (const key of fields.zips || []) {
    if (key in out) out[key] = normalizeZip(out[key]);
  }
  return out;
}

/**
 * Validação estrita pra rejeitar cadastros incompletos:
 * - Telefone BR exige 10 (fixo) ou 11 (celular com 9) dígitos.
 * - CEP BR exige exatamente 8 dígitos.
 * - Vazio/null/undefined é considerado válido (campo opcional).
 *
 * Retorna lista de erros estruturados ({ field, message }) — vazia quando ok.
 */
export type ContactValidationError = { field: string; message: string };

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

export function validateContactFields(
  obj: object | null | undefined,
  fields: { phones?: string[]; zips?: string[] }
): ContactValidationError[] {
  const errors: ContactValidationError[] = [];
  if (!obj) return errors;
  const record = obj as Record<string, unknown>;
  for (const key of fields.phones || []) {
    if (!(key in record)) continue;
    const value = record[key];
    if (!isPresent(value)) continue;
    const len = digitCount(value);
    if (len < 10 || len > 11) {
      errors.push({
        field: key,
        message: "Telefone deve ter 10 ou 11 dígitos (DDD + número).",
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
        message: "CEP deve ter exatamente 8 dígitos.",
      });
    }
  }
  return errors;
}
