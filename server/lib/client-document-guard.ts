import { supabaseAdmin } from "../supabase";
import {
  blockingDocumentClient,
  clientDocumentKey,
  clearedClientIdentity,
  isClientActive,
  otherClientsWithSameDocument,
  type ClientDuplicateLike,
} from "@shared/client-duplicates";

export type ClientDocumentRow = ClientDuplicateLike & {
  responsavel_comercial_id?: string | null;
};

export async function listClientsForDocumentCheck(): Promise<ClientDocumentRow[]> {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id, name, status, cnpj, cpf, responsavel_comercial_id");
  if (error) throw error;
  return (data || []) as ClientDocumentRow[];
}

export function duplicateDocumentMessage(
  existing: ClientDuplicateLike,
  mode: "create" | "activate",
): string {
  const status = isClientActive(existing) ? "ativo" : "inativo";
  const who = `#${existing.id} ${existing.name || "sem nome"} (${status})`;
  if (mode === "activate") {
    return `Já existe um cadastro ativo deste CNPJ/CPF: ${who}. Só um pode ficar ativo.`;
  }
  return `Este CNPJ/CPF já está no cliente ${who}. Não foi criado outro cadastro. Abra o cliente existente.`;
}

export async function findBlockingDocumentClient(
  candidate: ClientDuplicateLike,
  mode: "create" | "activate",
  exceptId?: number,
): Promise<ClientDuplicateLike | null> {
  if (!clientDocumentKey(candidate)) return null;
  const rows = await listClientsForDocumentCheck();
  const others = otherClientsWithSameDocument(rows, candidate, exceptId);
  return blockingDocumentClient(others, mode);
}

export { clearedClientIdentity, clientDocumentKey };
