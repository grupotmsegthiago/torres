import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensureDbSchema() {
  try {
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_uid TEXT UNIQUE
    `);
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE
    `);
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT
    `);
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()
    `);
    await db.execute(sql`
      ALTER TABLE users ALTER COLUMN username DROP NOT NULL
    `).catch(() => {});
    await db.execute(sql`
      ALTER TABLE users ALTER COLUMN password DROP NOT NULL
    `).catch(() => {});

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS perfis_acesso (
        id SERIAL PRIMARY KEY,
        role TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        permissions TEXT NOT NULL
      )
    `);

    await db.execute(sql`
      INSERT INTO perfis_acesso (role, label, permissions) VALUES
      ('diretoria', 'Diretoria', '["*"]'),
      ('admin', 'Administrador', '["dashboard","clients","employees","vehicles","trips","fueling","maintenance","timesheets","tracker","service_orders","mission","operational_grid","consultas","guia_missao","users"]'),
      ('funcionario', 'Funcionário', '["dashboard","mission","timesheets","guia_missao"]')
      ON CONFLICT (role) DO NOTHING
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS employee_documents (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        file_data TEXT,
        file_name TEXT,
        expiry_date DATE,
        issue_date DATE,
        document_number TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS weapons (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        caliber TEXT NOT NULL,
        serial_number TEXT NOT NULL UNIQUE,
        registration_number TEXT,
        registration_expiry DATE,
        registration_file_data TEXT,
        status TEXT NOT NULL DEFAULT 'disponível',
        assigned_employee_id INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS weapon_assignments (
        id SERIAL PRIMARY KEY,
        weapon_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        service_order_id INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vehicle_assignments (
        id SERIAL PRIMARY KEY,
        vehicle_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        service_order_id INTEGER,
        km_at_action INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log("[db-init] Schema verified OK");
  } catch (err: any) {
    console.error("[db-init] Schema check error:", err.message);
  }
}
