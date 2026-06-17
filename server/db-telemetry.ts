import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import v8 from "node:v8";
import { getSupabaseStats } from "./supabase";
import { DB_DISK_LIMIT_MB } from "./constants";

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
    heap_used_mb: number;
    heap_limit_mb: number;
    uptime_s: number;
  };
  db: {
    latency_ms: number;
    active_connections: number;
    idle_connections: number;
    total_connections: number;
    max_connections: number;
    db_size_mb: number;
    db_size_limit_mb: number;
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
  const heapUsedMb = Math.round(m.heapUsed / 1024 / 1024);
  // % de memória "de verdade": heap em uso vs o TETO que o V8 pode crescer
  // (heap_size_limit). Usar heapUsed/heapTotal dava ~97% sempre — engana,
  // porque o V8 mantém heapTotal compacto e cresce sob demanda até o teto.
  // Só vira problema real quando heapUsed se aproxima do heap_size_limit.
  const heapLimitMb = Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024);
  const heapPct = heapLimitMb > 0 ? Math.round((heapUsedMb / heapLimitMb) * 100) : 0;
  return { rssMb, heapUsedMb, heapLimitMb, heapPct };
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
      heap_used_mb: mem.heapUsedMb,
      heap_limit_mb: mem.heapLimitMb,
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
      db_size_limit_mb: DB_DISK_LIMIT_MB,
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

export type TopQuery = {
  query: string;
  calls: number;
  total_ms: number;
  mean_ms: number;
  rows: number;
  cache_hit_pct: number | null;
};

// Top consultas por carga acumulada (pg_stat_statements) via RPC read-only.
// É o que permite a IA apontar QUAL consulta deixa o banco lento e a causa.
export async function getTopQueries(supabase: SupabaseClient): Promise<TopQuery[]> {
  const { data, error } = await supabase.rpc("db_top_queries");
  if (error) {
    console.error("[db-telemetry] db_top_queries erro:", error.message);
    return [];
  }
  const rows = (data ?? []) as any[];
  return rows.map((r) => ({
    query: String(r.query ?? ""),
    calls: Number(r.calls) || 0,
    total_ms: Number(r.total_ms) || 0,
    mean_ms: Number(r.mean_ms) || 0,
    rows: Number(r.rows) || 0,
    cache_hit_pct: r.cache_hit_pct != null ? Number(r.cache_hit_pct) : null,
  }));
}

// ===== Relatório de IA da telemetria (a cada 10 min) =====

export type AiReport = {
  id: number;
  created_at: string;
  status: "good" | "warn" | "bad";
  headline: string;
  analysis: string;
};

const AI_REPORT_SYSTEM_PROMPT = `Você é um analista sênior de banco de dados monitorando um ERP em produção (PostgreSQL/Supabase) de uma empresa de segurança patrimonial. A cada 10 minutos você recebe as métricas atuais do banco em JSON e produz um relatório curto, em português brasileiro, para um GESTOR LEIGO (não técnico) que precisa saber EXATAMENTE o que corrigir.

No JSON de entrada, o campo "consultas_mais_pesadas" lista as consultas que mais consomem o banco (campos: query = trecho do comando SQL; calls = quantas vezes rodou; total_ms = tempo total somado; mean_ms = tempo MÉDIO por execução; rows = linhas devolvidas; cache_hit_pct = % de leitura vinda da memória, baixo = lendo muito do disco). Use ESSA lista para apontar o problema concreto — NUNCA diga apenas "há uma consulta lenta" de forma genérica.

Responda SOMENTE em JSON válido com as chaves:
- "status": uma de "good" (tudo saudável), "warn" (atenção: algo fora do ideal, mas não crítico) ou "bad" (problema sério que precisa de ação agora).
- "headline": uma frase curta (máx 80 caracteres) resumindo a situação em linguagem simples.
- "analysis": texto curto em linguagem simples. Quando houver consulta pesada, é OBRIGATÓRIO escrever 3 trechos SEPARADOS POR QUEBRA DE LINHA (\\n), nesta ordem e começando cada um com o rótulo indicado:
   "Consulta: " QUAL consulta/tela está pesando — identifique pela tabela principal do SQL (ex.: "a listagem de abastecimentos (tabela vehicle_fueling)") e cite o tempo médio (mean_ms) e quantas vezes rodou (calls).
   "Causa provável: " a explicação que melhor casa com os NÚMEROS — siga esta lógica:
      • Se mean_ms é alto (>1000ms) mas calls é baixo/moderado (dezenas ou poucas centenas), a causa NÃO é frequência. É a consulta em si: provavelmente está trazendo colunas pesadas (fotos/imagens em base64) com "SELECT *", ou falta um índice na coluna do filtro/ordenação, ou falta paginação (traz a tabela inteira). Se o SQL mostra "SELECT ... .*" sem filtro e a tabela costuma guardar fotos/arquivos, aposte em payload pesado de fotos.
      • Só aponte "consulta repetida vezes demais" quando calls for realmente altíssimo (milhares) E mean_ms baixo.
      • cache_hit_pct < 95 indica leitura demais do disco; idle_in_transaction > 0 indica transação presa.
   "Como corrigir: " ação acionável coerente com a causa (ex.: "não trazer as fotos na listagem — carregar a imagem só quando abrir o item", "paginar os resultados", "criar um índice na coluna usada no filtro", "selecionar só as colunas necessárias em vez de tudo").
  Se estiver tudo bem, escreva 2-3 frases tranquilizadoras, sem os rótulos.

Critérios de referência:
- Latência: <300ms boa, 300-1500ms atenção, >1500ms ruim.
- mean_ms de uma consulta: <100ms ok, 100-1000ms atenção, >1000ms ruim (provável falta de índice ou payload pesado).
- cache_hit_pct de uma consulta ou cache_hit_ratio geral: >=99% ótimo, 95-99% ok, <95% ruim (lendo demais do disco).
- Conexões: acima de 90% do máximo é ruim.
- idle_in_transaction > 0: atenção (transação presa segurando recursos).
- Falhas de autenticação altas ou IPs suspeitos: risco de segurança (atenção/ruim).
- Tabelas muito grandes podem indicar necessidade de limpeza no futuro (informativo, raramente crítico).
Seja direto e tranquilizador quando estiver tudo bem; seja claro e específico sobre a ação quando houver problema. Não invente nomes de tabelas que não estejam no JSON.`;

// Top 10 tabelas por tamanho total (dados + índices) via RPC read-only.
export async function getAiReports(supabase: SupabaseClient): Promise<AiReport[]> {
  const { data, error } = await supabase
    .from("db_ai_reports")
    .select("id,created_at,status,headline,analysis")
    .order("created_at", { ascending: false })
    .limit(6);
  if (error) {
    console.error("[db-ai-report] leitura erro:", error.message);
    return [];
  }
  return (data ?? []) as AiReport[];
}

export async function generateAiReport(supabase: SupabaseClient): Promise<AiReport | null> {
  // Usa o gateway da integração de IA do Replit (mesmo padrão das rotas de OCR/IA
  // em routes.ts). Cai pro OPENAI_API_KEY cru se a integração não estiver presente.
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined;
  if (!apiKey) {
    console.warn("[db-ai-report] chave OpenAI ausente — pulando geração");
    return null;
  }
  try {
    const [rt, tableSizes, security, topQueries] = await Promise.all([
      getRealtimeTelemetry(supabase),
      getTableSizes(supabase),
      getSecurityEvents24h(supabase),
      getTopQueries(supabase),
    ]);

    const metrics = {
      status_conexao: rt.status,
      latencia_ms: rt.db.latency_ms,
      cpu_servidor_pct: rt.node.cpu_pct,
      memoria_servidor_pct: rt.node.mem_pct,
      conexoes: `${rt.db.total_connections}/${rt.db.max_connections}`,
      cache_hit_ratio_pct: rt.db.cache_hit_ratio,
      idle_in_transaction: rt.db.idle_in_transaction,
      queries_lentas: rt.db.long_queries.length,
      tamanho_banco_mb: rt.db.db_size_mb,
      falhas_auth_24h: security.token_failures_total,
      ips_suspeitos: security.brute_force_suspects.length,
      maiores_tabelas: tableSizes.slice(0, 5).map((t) => `${t.table_name}: ${t.total_size}`),
      consultas_mais_pesadas: topQueries.map((q) => ({
        query: q.query,
        calls: q.calls,
        total_ms: q.total_ms,
        mean_ms: q.mean_ms,
        rows: q.rows,
        cache_hit_pct: q.cache_hit_pct,
      })),
    };

    const openai = new OpenAI({ apiKey, baseURL });
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      max_completion_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: AI_REPORT_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(metrics) },
      ],
    });

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn("[db-ai-report] resposta da IA não é JSON válido");
      return null;
    }
    const status: AiReport["status"] = ["good", "warn", "bad"].includes(parsed?.status) ? parsed.status : "warn";
    const headline = String(parsed?.headline || "Situação do banco").slice(0, 200);
    const analysis = String(parsed?.analysis || "").slice(0, 2000);

    const { data: inserted, error: insErr } = await supabase
      .from("db_ai_reports")
      .insert({ status, headline, analysis, metrics })
      .select("id,created_at,status,headline,analysis")
      .single();
    if (insErr) {
      console.error("[db-ai-report] insert erro:", insErr.message);
      return null;
    }

    // Poda: mantém só os 6 mais recentes.
    const { data: ids } = await supabase
      .from("db_ai_reports")
      .select("id")
      .order("created_at", { ascending: false });
    const all = (ids ?? []) as Array<{ id: number }>;
    if (all.length > 6) {
      const toDelete = all.slice(6).map((r) => r.id);
      await supabase.from("db_ai_reports").delete().in("id", toDelete);
    }

    return inserted as AiReport;
  } catch (err: any) {
    console.warn("[db-ai-report] geração falhou:", err?.message);
    return null;
  }
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
const AI_REPORT_INTERVAL_MS = 10 * 60_000;

export function startTelemetrySampler(supabase: SupabaseClient) {
  if (samplerStarted) return;
  samplerStarted = true;

  // Encadeamento recursivo via setTimeout: a próxima amostra só é agendada
  // depois que a anterior terminar. Evita acúmulo de chamadas pendentes se
  // o banco estiver lento (a coleta em si pode chegar perto do timeout de 12s).
  const scheduleSample = (delayMs: number) => {
    const t = setTimeout(async () => {
      // Em modo fallback (Supabase não-saudável) não martela o banco com a
      // coleta — ela só piora a crise e estoura no timeout. Reagenda espaçado
      // e volta ao ritmo normal quando o banco recuperar.
      if (!getSupabaseStats().healthy) {
        scheduleSample(SAMPLE_INTERVAL_MS * 2);
        return;
      }
      try { await persistSample(supabase); } catch { /* silencioso */ }
      scheduleSample(SAMPLE_INTERVAL_MS);
    }, delayMs);
    t.unref?.();
  };
  scheduleSample(30_000); // primeira amostra após 30s pra não brigar com o boot

  // Relatório de IA: gera a cada 10 min. Primeiro após 60s pra já existir algo
  // na tela logo que alguém abrir, sem brigar com o boot.
  const scheduleAiReport = (delayMs: number) => {
    const t = setTimeout(async () => {
      // Idem: nada de gerar relatório de IA (lê o banco + chama OpenAI) durante
      // o fallback. Reagenda espaçado até o Supabase voltar.
      if (!getSupabaseStats().healthy) {
        scheduleAiReport(AI_REPORT_INTERVAL_MS * 2);
        return;
      }
      try { await generateAiReport(supabase); } catch { /* silencioso */ }
      scheduleAiReport(AI_REPORT_INTERVAL_MS);
    }, delayMs);
    t.unref?.();
  };
  scheduleAiReport(60_000);

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
