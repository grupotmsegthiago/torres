/**
 * Helpers de exibição: o banco guarda só dígitos (telefone/CEP).
 * Aqui aplicamos a máscara BR para mostrar pro usuário.
 */

export function formatPhoneBR(value: string | null | undefined): string {
  if (!value) return "";
  const d = String(value).replace(/\D/g, "").slice(-11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function formatCepBR(value: string | null | undefined): string {
  if (!value) return "";
  const d = String(value).replace(/\D/g, "").slice(0, 8);
  if (!d) return "";
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}
