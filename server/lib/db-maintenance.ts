import pg from "pg";

// Manutenção pesada do banco (VACUUM FULL) que NÃO pode rodar via supabaseAdmin:
// o RPC exec_sql roda dentro de uma transação/função e VACUUM não pode rodar em
// transação. Por isso usamos uma conexão pg DEDICADA (sem statement_timeout) que
// roda em autocommit. VACUUM FULL reescreve a tabela e DEVOLVE o espaço ao disco,
// mas trava a tabela inteira enquanto roda — por isso é um botão manual.

export type VacuumStatus = "idle" | "running" | "done" | "error";

export interface VacuumState {
  status: VacuumStatus;
  table: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  beforeBytes: number | null;
  afterBytes: number | null;
  durationMs: number | null;
  error: string | null;
}

let state: VacuumState = {
  status: "idle",
  table: null,
  startedAt: null,
  finishedAt: null,
  beforeBytes: null,
  afterBytes: null,
  durationMs: null,
  error: null,
};

// Só permitimos compactar tabelas conhecidas (evita injeção via nome de tabela).
const ALLOWED_TABLES = new Set([
  "mission_updates",
  "mission_photos",
  "employee_documents",
  "mission_costs",
  "vehicle_fueling",
  "audit_logs",
  "control_id_punches",
  "login_selfies",
]);

export class VacuumBusyError extends Error {
  code = "VACUUM_BUSY";
  constructor() {
    super("Já existe uma compactação em andamento.");
  }
}

export function getVacuumState(): VacuumState {
  return state;
}

async function tableSizeBytes(client: pg.Client, table: string): Promise<number> {
  const r = await client.query("SELECT pg_total_relation_size($1) AS b", [table]);
  return Number(r.rows[0]?.b || 0);
}

/**
 * Inicia um VACUUM FULL na tabela em BACKGROUND e retorna o estado inicial
 * (já com o tamanho "antes"). O front acompanha via getVacuumState().
 * - Lança VacuumBusyError se já houver um vacuum rodando.
 * - Lança Error se a tabela não for permitida ou se a conexão/leitura falhar.
 * O estado é marcado como "running" SINCRONAMENTE (antes de qualquer await)
 * pra fechar a janela de corrida entre dois cliques quase simultâneos.
 */
export async function startVacuum(table: string): Promise<VacuumState> {
  if (state.status === "running") throw new VacuumBusyError();
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Tabela não permitida para compactação: ${table}`);
  }
  const dbUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("Sem SUPABASE_DATABASE_URL configurada");

  // Claim atômico ANTES de qualquer await — elimina o TOCTOU.
  const startedAt = Date.now();
  state = {
    status: "running",
    table,
    startedAt,
    finishedAt: null,
    beforeBytes: null,
    afterBytes: null,
    durationMs: null,
    error: null,
  };

  let client: pg.Client;
  let before: number;
  try {
    client = new pg.Client({
      connectionString: dbUrl,
      connectionTimeoutMillis: 15000,
      statement_timeout: 0, // VACUUM FULL pode levar minutos — sem teto.
      query_timeout: 0,
    });
    await client.connect();
    before = await tableSizeBytes(client, table);
    state = { ...state, beforeBytes: before };
  } catch (e: any) {
    // Falha antes do background: limpa conexão e libera o lock (status=error).
    try {
      await (client! as pg.Client | undefined)?.end();
    } catch {}
    state = {
      ...state,
      status: "error",
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      error: e?.message || String(e),
    };
    throw e;
  }

  // Roda em background; o handler HTTP responde na hora.
  (async () => {
    try {
      await client.query(`VACUUM (FULL, ANALYZE) "${table}"`);
      const after = await tableSizeBytes(client, table);
      state = {
        ...state,
        status: "done",
        finishedAt: Date.now(),
        afterBytes: after,
        durationMs: Date.now() - startedAt,
      };
      console.log(
        `[db-vacuum] ${table} OK: ${(before / 1048576).toFixed(0)}MB -> ${(after / 1048576).toFixed(0)}MB em ${(state.durationMs! / 1000).toFixed(0)}s`,
      );
    } catch (e: any) {
      state = {
        ...state,
        status: "error",
        finishedAt: Date.now(),
        durationMs: Date.now() - startedAt,
        error: e?.message || String(e),
      };
      console.error(`[db-vacuum] ${table} FALHOU:`, e?.message);
    } finally {
      await client.end().catch(() => {});
    }
  })();

  return state;
}
