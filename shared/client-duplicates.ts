/** Cadastro de clientes: duplicidade por documento e status ativo/inativo. */

export const CLIENT_STATUS_ATIVO = "ativo";
export const CLIENT_STATUS_INATIVO = "inativo";

export type ClientListFilter = "todos" | "duplicados" | "ativos" | "inativos";

export type ClientDuplicateLike = {
  id: number;
  name?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
  status?: string | null;
};

export type ClientDupMeta = {
  key: string;
  index: number;
  total: number;
};

export function digitsDoc(raw: string | null | undefined): string {
  return String(raw || "").replace(/\D/g, "");
}

/** Chave de duplicidade: CNPJ (14) tem prioridade; senão CPF (11). Sem documento → null. */
export function clientDocumentKey(client: ClientDuplicateLike): string | null {
  const cnpj = digitsDoc(client.cnpj);
  if (cnpj.length === 14) return `cnpj:${cnpj}`;
  const cpf = digitsDoc(client.cpf);
  if (cpf.length === 11) return `cpf:${cpf}`;
  return null;
}

export function isClientActive(client: { status?: string | null }): boolean {
  const status = String(client.status ?? CLIENT_STATUS_ATIVO).trim().toLowerCase();
  return status !== CLIENT_STATUS_INATIVO;
}

/** Mensagem canônica ao tentar operar com cadastro inativo. */
export const CLIENT_INACTIVE_BLOCK_MSG =
  "Cliente inativo no cadastro. Use apenas o cadastro ativo.";

/** Em homônimos/duplicados, nunca escolher inativo — só ativo ou null. */
export function pickActiveClient<T extends { status?: string | null }>(rows: T[]): T | null {
  return rows.find(isClientActive) ?? null;
}

export function parseClientStatus(raw: unknown): typeof CLIENT_STATUS_ATIVO | typeof CLIENT_STATUS_INATIVO | null {
  const status = String(raw ?? "").trim().toLowerCase();
  if (status === CLIENT_STATUS_ATIVO || status === CLIENT_STATUS_INATIVO) return status;
  return null;
}

export function buildClientDuplicateIndex<T extends ClientDuplicateLike>(
  clients: T[],
): Map<number, ClientDupMeta> {
  const groups = new Map<string, T[]>();
  for (const client of clients) {
    const key = clientDocumentKey(client);
    if (!key) continue;
    const arr = groups.get(key) || [];
    arr.push(client);
    groups.set(key, arr);
  }
  const out = new Map<number, ClientDupMeta>();
  for (const [key, arr] of groups) {
    if (arr.length < 2) continue;
    const sorted = [...arr].sort((a, b) => a.id - b.id);
    sorted.forEach((client, i) => {
      out.set(client.id, { key, index: i + 1, total: sorted.length });
    });
  }
  return out;
}

/** Outros cadastros com o mesmo CNPJ (14) ou CPF (11), ignorando máscara. */
export function otherClientsWithSameDocument<T extends ClientDuplicateLike>(
  clients: T[],
  candidate: ClientDuplicateLike,
  exceptId?: number,
): T[] {
  const key = clientDocumentKey(candidate);
  if (!key) return [];
  return clients.filter((client) => client.id !== exceptId && clientDocumentKey(client) === key);
}

/**
 * Criar outro cartão com o mesmo documento é recusado, ativo ou inativo.
 * Reativar só é recusado se já existir outro cadastro ativo daquele documento.
 * Editar o próprio cartão (exceptId) não entra aqui.
 */
export function blockingDocumentClient<T extends ClientDuplicateLike>(
  others: T[],
  mode: "create" | "activate",
): T | null {
  if (mode === "create") return others[0] || null;
  return others.find((client) => isClientActive(client)) || null;
}

/** Impede gravar vazio por cima de nome ou documento já preenchidos. */
export function clearedClientIdentity(
  current: {
    name?: string | null;
    cnpj?: string | null;
    cpf?: string | null;
  },
  patch: Record<string, unknown>,
): string | null {
  if ("name" in patch && !String(patch.name || "").trim() && String(current.name || "").trim()) {
    return "nome";
  }
  const touchesDoc = "cnpj" in patch || "cpf" in patch;
  if (touchesDoc) {
    const had = clientDocumentKey({ id: 0, cnpj: current.cnpj, cpf: current.cpf });
    const next = clientDocumentKey({
      id: 0,
      cnpj: ("cnpj" in patch ? patch.cnpj : current.cnpj) as string | null,
      cpf: ("cpf" in patch ? patch.cpf : current.cpf) as string | null,
    });
    if (had && !next) return "CNPJ/CPF";
  }
  return null;
}

export function applyClientListFilter<T extends ClientDuplicateLike>(
  clients: T[],
  filter: ClientListFilter,
  dupIndex: Map<number, ClientDupMeta>,
): T[] {
  switch (filter) {
    case "ativos":
      return clients.filter(isClientActive);
    case "inativos":
      return clients.filter((c) => !isClientActive(c));
    case "duplicados": {
      const dups = clients.filter((c) => dupIndex.has(c.id));
      return [...dups].sort((a, b) => {
        const ka = dupIndex.get(a.id)?.key || "";
        const kb = dupIndex.get(b.id)?.key || "";
        if (ka !== kb) return ka.localeCompare(kb);
        return a.id - b.id;
      });
    }
    default:
      return clients;
  }
}
