/**
 * Escopo exclusivo do Moacir Juvencio (admin, id 32).
 * Não altera o perfil "admin" dos demais usuários.
 * Filho (funcionário) não entra nesta regra.
 */

export const MOACIR_USER_ID = 32;
export const MOACIR_EMAIL = "escoltas@torresseguranca.com.br";
export const OCULTO = "oculto";

export const MOACIR_ALLOWED_ADMIN_PATHS = ["/admin/operational-grid", "/admin/perfil"];

const BLOCKED_API_PREFIXES = [
  "/api/clients",
  "/api/financial",
  "/api/invoices",
  "/api/boletim",
  "/api/escort-billing",
  "/api/controle-faturamento",
  "/api/balanco",
  "/api/leads",
  "/api/whatsapp",
  "/api/users",
  "/api/employees",
  "/api/holerites",
  "/api/patrimonial",
  "/api/fornecedores",
  "/api/cobranca",
  "/api/relatorio",
  "/api/auditoria",
  "/api/conciliacao",
  "/api/conferencia",
  "/api/custos",
  "/api/fueling",
  "/api/gerenciadoras",
  "/api/database",
  "/api/payroll",
  "/api/asaas",
  "/api/focus",
  "/api/nfse",
  "/api/inter",
  "/api/dashboard",
  "/api/gestor",
  "/api/os-financeiro",
  "/api/chat",
];

type MoacirUser = {
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

export function isMoacirRestrito(user: MoacirUser): boolean {
  if (!user) return false;
  const role = String(user.role || "");
  if (role && role !== "admin") return false;
  if (Number(user.id) === MOACIR_USER_ID) return true;
  const email = String(user.email || "").toLowerCase().trim();
  if (email === MOACIR_EMAIL) return true;
  return normalizeName(String(user.name || "")) === "moacir juvencio";
}

export function moacirCanSeeAdminPath(pathname: string): boolean {
  const path = String(pathname || "").split("?")[0].replace(/\/+$/, "") || "/";
  return MOACIR_ALLOWED_ADMIN_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}

export function isBlockedApiForMoacir(pathname: string): boolean {
  const path = String(pathname || "").split("?")[0];
  if (!path.startsWith("/api/")) return false;
  if (path.startsWith("/api/auth/")) return false;
  if (BLOCKED_API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return true;
  if (path.endsWith("/forward") || path.includes("send-report-email") || path.includes("/costs")) return true;
  const pathOnly = path.split("?")[0];
  if (pathOnly === "/api/service-orders") return true;
  if (/\/(pdf|relatorio-missao|enriched|invoice-map)$/.test(pathOnly)) return true;
  return false;
}

const CONTACT_KEYS = new Set([
  "phone",
  "telefone",
  "celular",
  "whatsapp",
  "email",
  "contactemail",
  "contactphone",
  "recipientemail",
  "apikey",
  "cnpj",
  "cpf",
  "cgccpf",
]);

function isContactKey(key: string): boolean {
  const raw = key.toLowerCase();
  const compact = raw.replace(/_/g, "");
  if (CONTACT_KEYS.has(raw) || CONTACT_KEYS.has(compact)) return true;
  return compact.endsWith("phone") || compact.endsWith("email") || compact.endsWith("telefone");
}

function isMoneyKey(key: string): boolean {
  const k = key.toLowerCase();
  if (isContactKey(k)) return false;
  if (k === "amount" || k === "faturamento" || k === "pagamento" || k === "resultado" || k === "margem_pct" || k === "price" || k === "valor") {
    return true;
  }
  return k.startsWith("fat_") || k.startsWith("custo_") || k.startsWith("valor_") || k.includes("salario") || k.includes("faturamento");
}

export function redactMoacirPayload<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isContactKey(key) || isMoneyKey(key)) {
      out[key] = null;
      continue;
    }
    out[key] = redactValue(child);
  }
  return out;
}
