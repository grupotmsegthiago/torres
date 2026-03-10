import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensureDbSchema() {
  try {
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password INTEGER NOT NULL DEFAULT 0
    `);

    await db.execute(sql`UPDATE users SET username = LOWER(username) WHERE username != LOWER(username)`);

    console.log("[db-init] Schema verified OK");
  } catch (err: any) {
    console.error("[db-init] Schema check error:", err.message);
  }
}
