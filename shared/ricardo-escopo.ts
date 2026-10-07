/**
 * Escopo exclusivo do Ricardo Tadeu (admin operacional, id 46).
 * Não altera o perfil "admin" dos demais usuários.
 * O cadastro desativado (usuário 14) não entra nesta regra.
 *
 * Ele opera o painel como administrador, sem Controladoria:
 * Balanço, Contas, Relatório de NFs, faturas, Asaas/NFS-e e correlatos.
 */

export const RICARDO_USER_ID = 46;
export const RICARDO_EMAIL = "cpf_08741582730@torresseguranca.local";

const BLOCKED_ADMIN_PATHS = [
  "/admin/financeiro",
  "/admin/relatorio-nf",
  "/admin/cobranca-judicial",
  "/admin/auditoria-faturamento",
  "/admin/faturamento",
  "/admin/balanco-gerencial",
  "/admin/custos-fixos",
  "/admin/relatorio-abastecimento",
  "/admin/conciliacao-ticketlog",
  "/admin/conferencia-pedagio",
  "/admin/conferencia-tmseg",
  "/admin/fornecedores",
  "/admin/faturas",
  "/admin/contas-a-pagar",
  "/admin/inter-extrato",
  "/admin/cotacao-gasto",
  "/admin/database",
];

const BLOCKED_API_PREFIXES = [
  "/api/financial",
  "/api/financeiro",
  "/api/invoices",
  "/api/escort-billing",
  "/api/controle-faturamento",
  "/api/balanco",
  "/api/fornecedores",
  "/api/cobranca",
  "/api/relatorio-nf",
  "/api/auditoria-faturamento",
  "/api/conciliacao",
  "/api/conferencia",
  "/api/custos",
  "/api/payroll",
  "/api/asaas",
  "/api/focus",
  "/api/nfse",
  "/api/inter",
  "/api/gestor",
  "/api/os-financeiro",
  "/api/database",
];

type RicardoUser = {
  id?: number | string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
} | null | undefined;

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isRicardoSemFinanceiro(user: RicardoUser): boolean {
  if (!user) return false;
  const role = String(user.role || "");
  if (role && role !== "admin") return false;
  if (Number(user.id) === RICARDO_USER_ID) return true;
  const email = String(user.email || "").toLowerCase().trim();
  if (email === RICARDO_EMAIL) return true;
  const name = normalizeName(String(user.name || ""));
  if (name.includes("desativado")) return false;
  return name === "ricardo tadeu bezerra pereira";
}

export function ricardoCanSeeAdminPath(pathname: string): boolean {
  const path = String(pathname || "").split("?")[0].replace(/\/+$/, "") || "/";
  return !BLOCKED_ADMIN_PATHS.some((blocked) => path === blocked || path.startsWith(`${blocked}/`));
}

export function isBlockedApiForRicardo(pathname: string): boolean {
  const path = String(pathname || "").split("?")[0];
  if (!path.startsWith("/api/")) return false;
  if (path.startsWith("/api/auth/")) return false;
  return BLOCKED_API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
