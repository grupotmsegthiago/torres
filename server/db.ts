import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, types } from "pg";
import * as schema from "@shared/schema";

types.setTypeParser(1114, (val: string) => {
  return val + "-03:00";
});

const connectionString = process.env.SUPABASE_DATABASE_URL;

if (!connectionString) {
  throw new Error("SUPABASE_DATABASE_URL must be set.");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

pool.on("connect", (client) => {
  client.query("SET timezone = 'America/Sao_Paulo'");
});

export const db = drizzle(pool, { schema });
