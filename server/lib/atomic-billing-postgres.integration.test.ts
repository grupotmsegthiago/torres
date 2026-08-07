import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const databaseUrl = process.env.PR5B1_TX_TEST_DATABASE_URL;
const root = path.resolve(import.meta.dirname, "../..");

async function client() {
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  return db;
}

const setupSql = `
  DROP SCHEMA public CASCADE;
  CREATE SCHEMA public;
  GRANT ALL ON SCHEMA public TO public;
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      CREATE ROLE service_role;
    END IF;
  END $$;
  CREATE TABLE service_orders (
    id serial PRIMARY KEY, status text NOT NULL, mission_status text,
    escort_contract_id text, mission_started_at timestamptz,
    completed_date timestamptz, snapshot_data jsonb, revenue_value numeric,
    cost_value numeric, edit_reason text, approved_at timestamptz
  );
  CREATE TABLE mission_photos (
    id serial PRIMARY KEY, service_order_id integer, step text, km_value numeric
  );
  CREATE TABLE escort_billings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_order_id integer,
    client_id integer, client_name text, contract_id uuid,
    km_inicial numeric NOT NULL, km_final numeric NOT NULL,
    fat_total numeric DEFAULT 0, pag_total numeric DEFAULT 0,
    desp_total numeric DEFAULT 0, status varchar DEFAULT 'CALCULADO',
    observacoes text, notas text, revisado_por text, revisado_em timestamptz,
    boletim_numero varchar, boletim_gerado boolean DEFAULT false,
    invoice_id integer, faturado_em timestamptz, faturado_por text,
    pago_em timestamptz, snapshot_data jsonb, edit_reason text,
    approved_at timestamptz
  );
  CREATE TABLE boletim_approvals (
    id serial PRIMARY KEY, token text NOT NULL UNIQUE, client_id integer NOT NULL,
    client_name text, client_email text, period_start date NOT NULL,
    period_end date NOT NULL, billing_ids text[] NOT NULL DEFAULT '{}',
    total_value numeric DEFAULT 0, os_count integer DEFAULT 0,
    status text NOT NULL DEFAULT 'PENDENTE', approved_at timestamptz,
    approved_by_name text, approved_by_ip text, sent_at timestamptz DEFAULT now(),
    expires_at timestamptz DEFAULT now() + interval '30 days',
    created_at timestamptz DEFAULT now(), sent_by text,
    sent_by_user_id integer, billing_snapshot jsonb
  );
  CREATE TABLE system_audit_logs (
    id serial PRIMARY KEY, user_id integer, user_name text, user_role text,
    action text NOT NULL, target_id text, target_type text, details text,
    ip_address text, created_at timestamptz DEFAULT now()
  );
  CREATE FUNCTION validate_escort_billing_approval() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
  CREATE TRIGGER trg_validate_escort_billing_approval
    BEFORE UPDATE ON escort_billings FOR EACH ROW
    EXECUTE FUNCTION validate_escort_billing_approval();
  CREATE FUNCTION validate_service_order_approval() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
  CREATE TRIGGER trg_validate_service_order_approval
    BEFORE UPDATE ON service_orders FOR EACH ROW
    EXECUTE FUNCTION validate_service_order_approval();
`;

async function insertFacts(db: pg.Client, osId: number) {
  const contractId = `00000000-0000-0000-0000-${String(osId).padStart(12, "0")}`;
  await db.query(
    `INSERT INTO service_orders
      (id,status,mission_status,escort_contract_id,mission_started_at,completed_date)
     VALUES ($1,'concluida','encerrada',$2,now()-interval '2h',now())`,
    [osId, contractId],
  );
  await db.query(
    "INSERT INTO mission_photos(service_order_id,step,km_value) VALUES ($1,'km_final',150)",
    [osId],
  );
  return contractId;
}

async function createBilling(db: pg.Client, osId: number) {
  const contractId = await insertFacts(db, osId);
  const result = await db.query(
    `SELECT * FROM write_escort_billing_atomic(
      'WRITE_OFFICIAL',
      jsonb_build_object(
        'service_order_id',$1::integer,'contract_id',$2::text,'km_inicial',100,
        'km_final',150,'fat_total',500,'status','A_VERIFICAR'
      ),
      NULL,$1::integer,NULL,'{"user_name":"test","user_role":"test"}'::jsonb
    )`,
    [osId, contractId],
  );
  return result.rows[0];
}

async function createSnapshot(db: pg.Client, billing: any, token: string) {
  return db.query(
    `SELECT * FROM create_boletim_approval_atomic(
      $1::text,1,'Client',NULL,current_date,current_date,ARRAY[$2::text],500,1,'test',NULL,
      jsonb_build_array(jsonb_build_object(
        'billing_id',$2::text,'billing_version',$3::bigint,'total',500
      ))
    )`,
    [token, String(billing.id), Number(billing.lock_version)],
  );
}

test("PR5B.1-TX PostgreSQL: migrations, concurrency and rollback", {
  skip: !databaseUrl,
  timeout: 30_000,
}, async (t) => {
  assert.match(databaseUrl!, /(?:127\.0\.0\.1|localhost).*pr5b1_tx_test/);
  const admin = await client();
  const expand = await readFile(
    path.join(root, "supabase/migrations/20260807180000_atomic_billing_expand.sql"),
    "utf8",
  );
  const enforcement = await readFile(
    path.join(root, "supabase/migrations/20260807181000_atomic_billing_enforcement.sql"),
    "utf8",
  );
  await admin.query(setupSql);
  await admin.query(expand);
  await admin.query(enforcement);

  await t.test("valid version increments; stale concurrent writer fails", async () => {
    const billing = await createBilling(admin, 1);
    const a = await client();
    const b = await client();
    const query = `SELECT * FROM write_escort_billing_atomic(
      'UPDATE_OPEN',jsonb_build_object('fat_total',$1::numeric),$2::uuid,1,0,'{}'::jsonb
    )`;
    const outcomes = await Promise.allSettled([
      a.query(query, [510, billing.id]),
      b.query(query, [520, billing.id]),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected") as PromiseRejectedResult;
    assert.match(String(rejected.reason?.message), /PR5B1_TX_STALE_VERSION/);
    const current = await admin.query(
      "SELECT lock_version FROM escort_billings WHERE id=$1",
      [billing.id],
    );
    assert.equal(Number(current.rows[0].lock_version), 1);
    await a.end();
    await b.end();
  });

  await t.test("snapshot lock wins and concurrent update fails closed", async () => {
    const billing = await createBilling(admin, 2);
    const snapshotTx = await client();
    const writer = await client();
    await snapshotTx.query("BEGIN");
    await snapshotTx.query("SELECT id FROM escort_billings WHERE id=$1 FOR UPDATE", [billing.id]);
    const pendingWrite = writer.query(
      `SELECT * FROM write_escort_billing_atomic(
        'UPDATE_OPEN','{"fat_total":600}'::jsonb,$1::uuid,2,0,'{}'::jsonb
      )`,
      [billing.id],
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    await createSnapshot(snapshotTx, billing, "snapshot-wins");
    await snapshotTx.query("COMMIT");
    await assert.rejects(pendingWrite, /PR5B1_TX_BILLING_PROTECTED/);
    const current = await admin.query("SELECT fat_total FROM escort_billings WHERE id=$1", [billing.id]);
    assert.equal(Number(current.rows[0].fat_total), 500);
    await snapshotTx.end();
    await writer.end();
  });

  await t.test("snapshot lock wins and concurrent delete fails closed", async () => {
    const billing = await createBilling(admin, 3);
    const snapshotTx = await client();
    const deleter = await client();
    await snapshotTx.query("BEGIN");
    await snapshotTx.query("SELECT id FROM escort_billings WHERE id=$1 FOR UPDATE", [billing.id]);
    const pendingDelete = deleter.query(
      `SELECT * FROM write_escort_billing_atomic(
        'DELETE_OPEN','{}'::jsonb,$1::uuid,3,0,'{}'::jsonb
      )`,
      [billing.id],
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const snapshot = await createSnapshot(snapshotTx, billing, "delete-loses");
    await snapshotTx.query("COMMIT");
    await assert.rejects(pendingDelete, /PR5B1_TX_BILLING_PROTECTED/);
    await assert.rejects(
      admin.query("DELETE FROM boletim_approvals WHERE id=$1", [snapshot.rows[0].id]),
      /PR5B1_TX_APPROVAL_DELETE_BLOCKED/,
    );
    await snapshotTx.end();
    await deleter.end();
  });

  await t.test("snapshot with stale lock_version is rejected", async () => {
    const billing = await createBilling(admin, 4);
    await admin.query(
      `SELECT * FROM write_escort_billing_atomic(
        'UPDATE_OPEN','{"fat_total":700}'::jsonb,$1::uuid,4,0,'{}'::jsonb
      )`,
      [billing.id],
    );
    await assert.rejects(
      createSnapshot(admin, billing, "stale-snapshot"),
      /PR5B1_TX_STALE_SNAPSHOT_VERSION/,
    );
  });

  await t.test("explicit reopen preserves historical snapshot and allows new version", async () => {
    const billing = await createBilling(admin, 10);
    await createSnapshot(admin, billing, "reopen-history");
    const frozen = await admin.query(
      `SELECT * FROM write_escort_billing_atomic(
        'FREEZE_COMMERCIAL','{"status":"APROVADA"}'::jsonb,$1,10,0,'{}'::jsonb
      )`,
      [billing.id],
    );
    assert.equal(Number(frozen.rows[0].lock_version), 1);
    const reopened = await admin.query(
      `SELECT * FROM write_escort_billing_atomic(
        'REOPEN_APPROVED','{"status":"A_VERIFICAR"}'::jsonb,$1,10,1,
        '{"user_name":"Admin","user_role":"admin","reason":"Correção"}'::jsonb
      )`,
      [billing.id],
    );
    assert.equal(Number(reopened.rows[0].lock_version), 2);
    const updated = await admin.query(
      `SELECT * FROM write_escort_billing_atomic(
        'UPDATE_OPEN','{"fat_total":550}'::jsonb,$1,10,2,'{}'::jsonb
      )`,
      [billing.id],
    );
    assert.equal(Number(updated.rows[0].lock_version), 3);
    const snapshot = await admin.query(
      "SELECT billing_snapshot->0->>'total' AS total FROM boletim_approvals WHERE token='reopen-history'",
    );
    assert.equal(Number(snapshot.rows[0].total), 500);
  });

  await t.test("all frozen/cancelled statuses reject update and delete", async () => {
    const cases = ["APROVADA", "FATURADO", "FATURADA", "PAGO", "CANCELADO", "CANCELADA"];
    let osId = 20;
    for (const status of cases) {
      const billing = await createBilling(admin, osId);
      if (status === "APROVADA" || status === "FATURADO" || status === "PAGO") {
        await admin.query(
          `SELECT * FROM write_escort_billing_atomic(
            'FREEZE_COMMERCIAL','{"status":"APROVADA"}'::jsonb,$1,$2,0,'{}'::jsonb
          )`,
          [billing.id, osId],
        );
        if (status === "FATURADO" || status === "PAGO") {
          await admin.query(
            `SELECT * FROM write_escort_billing_atomic(
              'MARK_INVOICED','{"status":"FATURADO","invoice_id":1}'::jsonb,$1,$2,1,'{}'::jsonb
            )`,
            [billing.id, osId],
          );
        }
        if (status === "PAGO") {
          await admin.query(
            `SELECT * FROM write_escort_billing_atomic(
              'MARK_PAID','{"status":"PAGO"}'::jsonb,$1,$2,2,'{}'::jsonb
            )`,
            [billing.id, osId],
          );
        }
      } else if (status === "CANCELADO") {
        await admin.query(
          `SELECT * FROM write_escort_billing_atomic(
            'WRITE_CANCELLED',
            jsonb_build_object(
              'service_order_id',$2::integer,
              'contract_id','00000000-0000-0000-0000-' || lpad($2::text,12,'0'),
              'km_inicial',0,'km_final',0,'status','CANCELADO'
            ),
            $1,$2,0,'{}'::jsonb
          )`,
          [billing.id, osId],
        );
      } else {
        await admin.query("BEGIN");
        await admin.query("SELECT set_config('torres.atomic_billing_write','on',true)");
        await admin.query("UPDATE escort_billings SET status=$1 WHERE id=$2", [status, billing.id]);
        await admin.query("COMMIT");
      }
      const current = await admin.query(
        "SELECT lock_version FROM escort_billings WHERE id=$1",
        [billing.id],
      );
      const version = Number(current.rows[0].lock_version);
      await assert.rejects(
        admin.query(
          `SELECT * FROM write_escort_billing_atomic(
            'UPDATE_OPEN','{"fat_total":999}'::jsonb,$1,$2,$3,'{}'::jsonb
          )`,
          [billing.id, osId, version],
        ),
        /PR5B1_TX_BILLING_PROTECTED/,
        status,
      );
      await assert.rejects(
        admin.query(
          `SELECT * FROM write_escort_billing_atomic(
            'DELETE_OPEN','{}'::jsonb,$1,$2,$3,'{}'::jsonb
          )`,
          [billing.id, osId, version],
        ),
        /PR5B1_TX_BILLING_PROTECTED/,
        status,
      );
      osId++;
    }
  });

  await t.test("missing contract, timestamps and KM facts block official insert", async () => {
    const contractId = "00000000-0000-0000-0000-000000000040";
    await admin.query(
      "INSERT INTO service_orders(id,status,mission_status,escort_contract_id,mission_started_at,completed_date) VALUES (40,'concluida','encerrada',NULL,now()-interval '1h',now())",
    );
    const invoke = (osId: number, contract: string) => admin.query(
      `SELECT * FROM write_escort_billing_atomic(
        'WRITE_OFFICIAL',
        jsonb_build_object(
          'service_order_id',$1::integer,'contract_id',$2::text,
          'km_inicial',0,'km_final',10,'status','A_VERIFICAR'
        ),
        NULL,$1,NULL,'{}'::jsonb
      )`,
      [osId, contract],
    );
    await assert.rejects(invoke(40, contractId), /PR5B1_TX_CONTRACT_REQUIRED/);

    await admin.query(
      "INSERT INTO service_orders(id,status,mission_status,escort_contract_id,mission_started_at,completed_date) VALUES (41,'concluida','encerrada',$1,NULL,now())",
      [contractId],
    );
    await admin.query("INSERT INTO mission_photos(service_order_id,step,km_value) VALUES (41,'km_final',10)");
    await assert.rejects(invoke(41, contractId), /PR5B1_TX_TIMESTAMPS_REQUIRED/);

    await admin.query(
      "INSERT INTO service_orders(id,status,mission_status,escort_contract_id,mission_started_at,completed_date) VALUES (42,'concluida','encerrada',$1,now()-interval '1h',now())",
      [contractId],
    );
    await assert.rejects(invoke(42, contractId), /PR5B1_TX_KM_FINAL_REQUIRED/);
  });

  await t.test("recusada with financial residue is rejected", async () => {
    const contractId = await insertFacts(admin, 50);
    await assert.rejects(
      admin.query(
        `SELECT * FROM write_escort_billing_atomic(
          'WRITE_REFUSED',
          jsonb_build_object(
            'service_order_id',50,'contract_id',$1::text,
            'km_inicial',0,'km_final',0,'status','CANCELADO','fat_total',1
          ),
          NULL,50,NULL,'{}'::jsonb
        )`,
        [contractId],
      ),
      /PR5B1_TX_REFUSED_MUST_BE_ZERO/,
    );
  });

  await t.test("direct DML and missing official facts fail closed", async () => {
    const billing = await createBilling(admin, 5);
    await assert.rejects(
      admin.query("UPDATE escort_billings SET fat_total=999 WHERE id=$1", [billing.id]),
      /PR5B1_TX_DIRECT_BILLING_DML_BLOCKED/,
    );
    await assert.rejects(
      admin.query(
        `SELECT * FROM write_escort_billing_atomic(
          'WRITE_OFFICIAL',
          '{"service_order_id":6,"contract_id":"00000000-0000-0000-0000-000000000006","km_inicial":0,"km_final":0,"status":"A_VERIFICAR"}'::jsonb,
          NULL,6,NULL,'{}'::jsonb
        )`,
      ),
      /PR5B1_TX_SERVICE_ORDER_NOT_FOUND/,
    );
  });

  await t.test("rollback restores legacy guards and removes TX objects", async () => {
    const rollbackContract = await readFile(
      path.join(root, "supabase/migrations/rollback/20260807181000_rollback_atomic_billing_enforcement.sql"),
      "utf8",
    );
    const rollbackExpand = await readFile(
      path.join(root, "supabase/migrations/rollback/20260807180000_rollback_atomic_billing_expand.sql"),
      "utf8",
    );
    await admin.query(rollbackContract);
    await admin.query(rollbackExpand);
    const result = await admin.query(`
      SELECT
        to_regprocedure('public.write_escort_billing_atomic(text,jsonb,uuid,integer,bigint,jsonb)') IS NULL AS rpc_removed,
        NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='escort_billings' AND column_name='lock_version'
        ) AS version_removed,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname='trg_validate_escort_billing_approval' AND NOT tgisinternal
        ) AS legacy_restored
    `);
    assert.deepEqual(result.rows[0], {
      rpc_removed: true,
      version_removed: true,
      legacy_restored: true,
    });
  });

  await admin.end();
});
