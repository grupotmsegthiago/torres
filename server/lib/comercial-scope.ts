/**
 * Escopo de dados do perfil comercial.
 *
 * Fail-closed: o comercial só vê clientes em que
 * `responsavel_comercial_id = users.comercial_id` (UUID TM SEG, sem FK)
 * OU `created_by_user_id = users.id`.
 *
 * Admin / diretoria / financeiro / funcionário NÃO são filtrados aqui.
 * 404 (não 403) em recurso único para não vazar existência.
 */

import type { NextFunction, Request, Response } from "express";
import { isUuid } from "./comissao-ingest";

export type ComercialActor = {
  id?: number | null;
  role?: string | null;
  comercialId?: string | null;
  comercial_id?: string | null;
};

export type ClientScopeRow = {
  id: number;
  created_by_user_id?: number | null;
  createdByUserId?: number | null;
  responsavel_comercial_id?: string | null;
  responsavelComercialId?: string | null;
};

const HIDDEN = { message: "Não encontrado" };

export function isComercialScoped(
  user: ComercialActor | null | undefined,
): boolean {
  return String(user?.role || "") === "comercial";
}

export function normalizeComercialUuid(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || !isUuid(raw)) return null;
  return raw;
}

/** Interpreta body de usuário: ausente / null / UUID. */
export function parseOptionalComercialUuid(
  raw: unknown,
): { present: false } | { present: true; value: string | null } | { present: true; error: string } {
  if (raw === undefined) return { present: false };
  if (raw === null || raw === "") return { present: true, value: null };
  const uuid = normalizeComercialUuid(raw);
  if (!uuid) return { present: true, error: "UUID de comercial inválido" };
  return { present: true, value: uuid };
}

export function actorComercialUuid(
  user: ComercialActor | null | undefined,
): string | null {
  return normalizeComercialUuid(user?.comercialId ?? user?.comercial_id);
}

export function actorUserId(user: ComercialActor | null | undefined): number | null {
  const id = Number(user?.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

export function clientInComercialScope(
  client: ClientScopeRow | null | undefined,
  user: ComercialActor,
): boolean {
  if (!client) return false;
  const userId = actorUserId(user);
  const uuid = actorComercialUuid(user);
  const createdBy = Number(client.createdByUserId ?? client.created_by_user_id);
  const ownerUuid = normalizeComercialUuid(
    client.responsavelComercialId ?? client.responsavel_comercial_id,
  );
  if (userId != null && Number.isFinite(createdBy) && createdBy === userId) return true;
  if (uuid && ownerUuid && ownerUuid.toLowerCase() === uuid.toLowerCase()) return true;
  return false;
}

export function filterClientsForComercial<T extends ClientScopeRow>(
  rows: T[],
  user: ComercialActor,
): T[] {
  if (!isComercialScoped(user)) return rows;
  return rows.filter((row) => clientInComercialScope(row, user));
}

export function filterRowsByAllowedClientIds<T>(
  rows: T[],
  getClientId: (row: T) => number | null | undefined,
  allowedIds: number[] | null,
  opts?: { allowNullClient?: boolean },
): T[] {
  if (allowedIds == null) return rows;
  const set = new Set(allowedIds);
  const allowNull = opts?.allowNullClient === true;
  return rows.filter((row) => {
    const raw = getClientId(row);
    if (raw == null || raw === ("" as any)) return allowNull;
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) return allowNull;
    return set.has(id);
  });
}

export function filterComerciaisForUser<T extends { id?: string }>(
  comerciais: T[],
  user: ComercialActor | null | undefined,
): T[] {
  if (!isComercialScoped(user)) return comerciais;
  const uuid = actorComercialUuid(user);
  if (!uuid) return [];
  return comerciais.filter((c) => normalizeComercialUuid(c.id) === uuid);
}

export async function resolveAllowedClientIds(
  user: ComercialActor | null | undefined,
  fetchIds: (user: ComercialActor) => Promise<number[]> = fetchMatchingClientIds,
): Promise<number[] | null> {
  if (!isComercialScoped(user)) return null;
  const ids = await fetchIds(user as ComercialActor);
  const unique = new Set<number>();
  for (const raw of ids || []) {
    const id = Number(raw);
    if (Number.isFinite(id) && id > 0) unique.add(id);
  }
  return [...unique];
}

export async function fetchMatchingClientIds(user: ComercialActor): Promise<number[]> {
  const userId = actorUserId(user);
  const uuid = actorComercialUuid(user);
  if (userId == null && !uuid) return [];
  try {
    const { supabaseAdmin } = await import("../supabase");
    const ors: string[] = [];
    if (userId != null) ors.push(`created_by_user_id.eq.${userId}`);
    if (uuid) ors.push(`responsavel_comercial_id.eq.${uuid}`);
    if (ors.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("id")
      .or(ors.join(","));
    if (error) {
      console.error("[comercial-scope] falha ao listar clientes permitidos:", error.message);
      return [];
    }
    return (data || [])
      .map((r: { id?: number }) => Number(r.id))
      .filter((id) => Number.isFinite(id) && id > 0);
  } catch (err: any) {
    console.error("[comercial-scope] falha ao listar clientes permitidos:", err?.message || err);
    return [];
  }
}

export async function allowedClientIdsFromRequest(req: Request): Promise<number[] | null> {
  const anyReq = req as Request & { _comercialAllowedClientIds?: number[] | null };
  if (anyReq._comercialAllowedClientIds !== undefined) return anyReq._comercialAllowedClientIds;
  const ids = await resolveAllowedClientIds(req.user as ComercialActor | undefined);
  anyReq._comercialAllowedClientIds = ids;
  return ids;
}

export function clientIdAllowed(clientId: unknown, allowedIds: number[] | null): boolean {
  if (allowedIds == null) return true;
  const id = Number(clientId);
  if (!Number.isFinite(id) || id <= 0) return false;
  return allowedIds.includes(id);
}

export function respondHidden(res: Response, message = HIDDEN.message): boolean {
  res.status(404).json({ message });
  return true;
}

/** @returns true se já respondeu 404 (caller deve return). */
export async function denyIfComercialClientOutOfScope(
  req: Request,
  res: Response,
  clientId: unknown,
  notFoundMessage = "Cliente não encontrado",
): Promise<boolean> {
  if (!isComercialScoped(req.user as ComercialActor | undefined)) return false;
  const allowed = await allowedClientIdsFromRequest(req);
  if (clientIdAllowed(clientId, allowed)) return false;
  return respondHidden(res, notFoundMessage);
}

export function applyComercialCreateClientPayload(
  user: ComercialActor,
  data: Record<string, any>,
): Record<string, any> {
  const payload = { ...data };
  const userId = actorUserId(user);
  if (userId != null) payload.createdByUserId = userId;
  delete payload.created_by_user_id;
  if (!isComercialScoped(user)) return payload;
  const uuid = actorComercialUuid(user);
  payload.responsavelComercialId = uuid;
  payload.responsavel_comercial_id = uuid;
  return payload;
}

export function applyComercialPatchClientPayload(
  user: ComercialActor,
  data: Record<string, any>,
): Record<string, any> {
  const payload = { ...data };
  delete payload.createdByUserId;
  delete payload.created_by_user_id;
  if (!isComercialScoped(user)) return payload;
  const uuid = actorComercialUuid(user);
  if ("responsavelComercialId" in payload || "responsavel_comercial_id" in payload) {
    payload.responsavelComercialId = uuid;
    payload.responsavel_comercial_id = uuid;
  }
  return payload;
}

export function createComercialOsScopeMiddleware(
  loadOs: (id: number) => Promise<{ clientId?: number | null; client_id?: number | null } | undefined>,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isComercialScoped(req.user as ComercialActor | undefined)) return next();
      const osId = Number(req.params.id);
      if (!Number.isFinite(osId) || osId <= 0) return next();
      const os = await loadOs(osId);
      if (!os) {
        respondHidden(res, "OS não encontrada");
        return;
      }
      const clientId = os.clientId ?? os.client_id;
      if (await denyIfComercialClientOutOfScope(req, res, clientId, "OS não encontrada")) return;
      next();
    } catch (err: any) {
      console.error("[comercial-scope] middleware OS:", err?.message || err);
      respondHidden(res, "OS não encontrada");
    }
  };
}
