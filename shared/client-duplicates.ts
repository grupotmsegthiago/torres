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
