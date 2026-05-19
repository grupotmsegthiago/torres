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
 * Validação estrita pra rejeitar cadastros incompletos.
 * A regra mora em `shared/contact-validation.ts` pra ser reutilizada também
 * pelo frontend (badges/filtros). Re-exportamos aqui pra preservar o caminho
 * que os route handlers já usam.
 */
export {
  validateContactFields,
  hasContactIssues,
  summarizeContactIssues,
} from "../../shared/contact-validation";
export type {
  ContactValidationError,
  ContactIssueKind,
  ContactFieldSpec,
} from "../../shared/contact-validation";
