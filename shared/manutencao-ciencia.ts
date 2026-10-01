export type CienciaEntrada = { userId: number; name: string; at: string };

const FECHADA = new Set(["realizada", "cancelada"]);

export function manutencaoAberta(status: string | null | undefined): boolean {
  return !FECHADA.has(String(status || "").toLowerCase());
}

/** Diretoria não confirma aviso operacional de manutenção. */
export function ocultarAvisoManutencao(role: string | null | undefined, type: string | null | undefined): boolean {
  return role === "diretoria" && type === "vehicle_maintenance";
}

export function nomeDoLogin(user: { name?: string | null; username?: string | null; email?: string | null } | null | undefined): string {
  const name = [user?.name, user?.username, user?.email].map((v) => String(v || "").trim()).find(Boolean);
  return name || "Usuário";
}

export function appendCiencia(atual: unknown, entrada: { userId: number; name: string; at?: string }): CienciaEntrada[] {
  const lista: CienciaEntrada[] = Array.isArray(atual)
    ? atual.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as { userId?: unknown; name?: unknown; at?: unknown };
        const userId = Number(row.userId);
        const name = String(row.name || "").trim();
        if (!Number.isFinite(userId) || userId <= 0 || !name) return [];
        return [{ userId, name, at: String(row.at || "") }];
      })
    : [];
  if (lista.some((e) => e.userId === entrada.userId)) return lista;
  const name = String(entrada.name || "").trim();
  if (!name) return lista;
  return [...lista, { userId: entrada.userId, name, at: entrada.at || new Date().toISOString() }];
}
