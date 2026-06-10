import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseStats } from "./supabase";

type Snapshot = {
  active_connections: number;
  idle_connections: number;
  total_connections: number;
  max_connections: number;
  long_queries: Array<{
    pid: number;
    duration_s: number;
    state: string;
    query: string;
    application_name: string | null;
    client_addr: string | null;
  }>;
  db_size_mb: number;
  cache_hit_ratio: number | null;
  idle_in_transaction: number;
  tuples_read: number;
  tuples_written: number;
  sampled_at: string;
};

export type RealtimeTelemetry = {
  ts: string;
  node: {
    cpu_pct: number;
    mem_mb: number;
    mem_pct: number;
    uptime_s: number;
  };
  db: {
    latency_ms: number;
    active_connections: number;
    idle_connections: number;
    total_connections: number;
    max_connections: number;
    db_size_mb: number;
    cache_hit_ratio: number | null;
    idle_in_transaction: number;
    tuples_read: number;
    tuples_written: number;
    long_queries: Snapshot["long_queries"];
  };
  status: "online" | "fallback" | "offline";
};

let lastCpuUsage = process.cpuUsage();
let lastCpuSample = Date.now();

function getCpuPct(): number {
  const now = Date.now();
  const usage = process.cpuUsage(lastCpuUsage);
  const elapsedMs = now - lastCpuSample;
  lastCpuUsage = process.cpuUsage();
  lastCpuSample = now;
  if (elapsedMs <= 0) return 0;
  const cpuMs = (usage.user + usage.system) / 1000;
  return Math.min(100, Math.round((cpuMs / elapsedMs) * 100));
}

function getMemoryStats() {
  const m = process.memoryUsage();
  const rssMb = Math.round(m.rss / 1024 / 1024);
  const heapTotalMb = Math.round(m.heapTotal / 1024 / 1024);
  const heapUsedMb = Math.round(m.heapUsed / 1024 / 1024);
  const heapPct = heapTotalMb > 0 ? Math.round((heapUsedMb / heapTotalMb) * 100) : 0;
  return { rssMb, heapUsedMb, heapPct };
}

async function dbPing(supabase: SupabaseClient): Promise<{ latencyMs: number; ok: boolean }> {
  const started = Date.now();
  try {
    const { error } = await supabase.from("clients").select("id", { count: "exact", head: true }).limit(1);
    if (error) throw error;
    return { latencyMs: Date.now() - started, ok: true };
  } catch {
    return { latencyMs: Date.now() - started, ok: false };
  }
}

export async function getRealtimeTelemetry(supabase: SupabaseClient): Promise<RealtimeTelemetry> {
  const cpu_pct = getCpuPct();
  const mem = getMemoryStats();
  const ping = await dbPing(supabase);
  const supabaseHealthy = getSupabaseStats().healthy;

  let snap: Snapshot | null = null;
  try {
    const { data, error } = await supabase.rpc("db_telemetry_snapshot");
    if (!error && data) snap = data as Snapshot;
  } catch {
    snap = null;
  }

  const status: RealtimeTelemetry["status"] = ping.ok && supabaseHealthy
    ? "online"
    : supabaseHealthy ? "fallback" : "offline";

  return {
    ts: new Date().toISOString(),
    node: {
      cpu_pct,
      mem_mb: mem.rssMb,
      mem_pct: mem.heapPct,
      uptime_s: Math.round(process.uptime()),
    },
    db: {
      latency_ms: ping.latencyMs,
      active_connections: snap?.active_connections ?? 0,
      idle_connections: snap?.idle_connections ?? 0,
      total_connections: snap?.total_connections ?? 0,
      max_connections: snap?.max_connections ?? 0,
      db_size_mb: snap?.db_size_mb ?? 0,
      cache_hit_ratio: snap?.cache_hit_ratio != null ? Number(snap.cache_hit_ratio) : null,
      idle_in_transaction: Number(snap?.idle_in_transaction ?? 0),
      tuples_read: Number(snap?.tuples_read ?? 0),
      tuples_written: Number(snap?.tuples_written ?? 0),
      long_queries: snap?.long_queries ?? [],
    },
    status,
  };
}

export async function getHistory24h(supabase: SupabaseClient) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("db_health_samples")
    .select("sampled_at,latency_ms,active_connections,total_connections,long_query_count,node_cpu_pct,node_mem_mb,fallback_active,db_size_mb,cache_hit_ratio,idle_in_transaction,tuples_read,tuples_written")
    .gte("sampled_at", since)
    .order("sampled_at", { ascending: true })
    .limit(1500);
  if (error) return [];
  return data ?? [];
}

export async function getSecurityEvents24h(supabase: SupabaseClient) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Auth/token failures por IP nas últimas 24h
  const { data: tokenFails } = await supabase
    .from("token_failure_logs")
    .select("id,employee_name,error_message,ip_address,user_agent,created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);

  const failsByIp = new Map<string, { ip: string; count: number; last_at: string; last_user: string | null; last_error: string | null }>();
  for (const row of (tokenFails ?? []) as any[]) {
    const ip = row.ip_address || "(desconhecido)";
    const cur = failsByIp.get(ip) ?? { ip, count: 0, last_at: row.created_at, last_user: row.employee_name, last_error: row.error_message };
    cur.count += 1;
    failsByIp.set(ip, cur);
  }
  const bruteForceSuspects = Array.from(failsByIp.values())
    .filter((r) => r.count >= 5)
    .sort((a, b) => b.count - a.count);

  return {
    token_failures_total: tokenFails?.length ?? 0,
    token_failures_recent: (tokenFails ?? []).slice(0, 20),
    brute_force_suspects: bruteForceSuspects,
  };
}

export type TableSize = {
  table_name: string;
  data_size: string;
  index_size: string;
  total_size: string;
  total_size_bytes: number;
};

// Top 10 tabelas por tamanho total (dados + índices) via RPC read-only.
export async function getTableSizes(supabase: SupabaseClient): Promise<TableSize[]> {
  const { data, error } = await supabase.rpc("db_table_sizes");
  if (error) {
    console.error("[db-telemetry] db_table_sizes erro:", error.message);
    return [];
  }
  const rows = (data ?? []) as any[];
  return rows.map((r) => ({
    table_name: String(r.table_name),
    data_size: String(r.data_size),
    index_size: String(r.index_size),
    total_size: String(r.total_size),
    total_size_bytes: Number(r.total_size_bytes) || 0,
  }));
}

export async function persistSample(supabase: SupabaseClient): Promise<void> {
  try {
    const rt = await getRealtimeTelemetry(supabase);
    await supabase.from("db_health_samples").insert({
      latency_ms: rt.db.latency_ms,
      active_connections: rt.db.active_connections,
      idle_connections: rt.db.idle_connections,
      total_connections: rt.db.total_connections,
      max_connections: rt.db.max_connections,
      long_query_count: rt.db.long_queries.length,
      node_cpu_pct: rt.node.cpu_pct,
      node_mem_mb: rt.node.mem_mb,
      fallback_active: rt.status !== "online",
      db_size_mb: rt.db.db_size_mb,
      cache_hit_ratio: rt.db.cache_hit_ratio,
      idle_in_transaction: rt.db.idle_in_transaction,
      tuples_read: rt.db.tuples_read,
      tuples_written: rt.db.tuples_written,
    });
  } catch {
    // silencioso — sampler não pode derrubar nada
  }
}

let samplerStarted = false;
const SAMPLE_INTERVAL_MS = 2 * 60_000;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60_000;

export function startTelemetrySampler(supabase: SupabaseClient) {
  if (samplerStarted) return;
  samplerStarted = true;

  // Encadeamento recursivo via setTimeout: a próxima amostra só é agendada
  // depois que a anterior terminar. Evita acúmulo de chamadas pendentes se
  // o banco estiver lento (a coleta em si pode chegar perto do timeout de 12s).
  const scheduleSample = (delayMs: number) => {
    const t = setTimeout(async () => {
      try { await persistSample(supabase); } catch { /* silencioso */ }
      scheduleSample(SAMPLE_INTERVAL_MS);
    }, delayMs);
    t.unref?.();
  };
  scheduleSample(30_000); // primeira amostra após 30s pra não brigar com o boot

  // Cleanup periódico: mantém apenas os últimos 7 dias de amostras.
  const scheduleCleanup = () => {
    const t = setTimeout(async () => {
      try {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from("db_health_samples").delete().lt("sampled_at", cutoff);
      } catch { /* silencioso */ }
      scheduleCleanup();
    }, CLEANUP_INTERVAL_MS);
    t.unref?.();
  };
  scheduleCleanup();
}
