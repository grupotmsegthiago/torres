import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

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
