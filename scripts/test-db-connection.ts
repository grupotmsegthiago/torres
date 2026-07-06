/**
 * Testa conexão com o banco Supabase (mesma URL usada no Replit).
 * Uso: npm run db:test
 */
import "dotenv/config";
import pg from "pg";

async function main() {
  const url = process.env.SUPABASE_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error(
      "[db:test] ERRO: defina SUPABASE_DATABASE_URL no .env\n" +
        "  (copie do Replit Secrets ou Supabase → Project Settings → Database)",
    );
    process.exit(1);
  }

  const usingFallback = !process.env.SUPABASE_DATABASE_URL?.trim();
  if (usingFallback) {
    console.warn("[db:test] AVISO: SUPABASE_DATABASE_URL ausente — usando DATABASE_URL (fallback local)");
  }

  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
    max: 1,
    connectionTimeoutMillis: 15_000,
  });

  try {
    const { rows } = await pool.query<{
      current_database: string;
      current_user: string;
      server_time: Date;
      pg_version: string;
    }>(`
      SELECT
        current_database(),
        current_user,
        now() AS server_time,
        version() AS pg_version
    `);
    const row = rows[0];
    console.log("[db:test] Conectado ao Supabase");
    console.log(`  database: ${row.current_database}`);
    console.log(`  user: ${row.current_user}`);
    console.log(`  server_time: ${row.server_time.toISOString()}`);
    console.log(`  pg: ${row.pg_version.split(",")[0]}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[db:test] Falha na conexão:", err instanceof Error ? err.message : err);
  console.error("\nDicas:");
  console.error("  1. Copie SUPABASE_DATABASE_URL do Replit Secrets para .env");
  console.error("  2. Supabase → Settings → Database → Connection string (URI, pooler 6543)");
  console.error("  3. Confirme que a senha está URL-encoded (@ vira %40)");
  process.exit(1);
});
