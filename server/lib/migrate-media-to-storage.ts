/**
 * Migração controlada: base64 inline → Supabase Storage.
 * Processa em lotes; idempotente (pula quem já é path).
 * Não apaga blobs do Storage; só reescreve a coluna no Postgres.
 *
 * Estratégia: lista só IDs com `like 'data:%'` (sem baixar o blob),
 * depois busca e migra um a um — cobre o histórico inteiro.
 */
import { supabaseAdmin } from "../supabase";
import {
  isInlineBase64Blob,
  isStoragePath,
} from "./private-blob-storage";
import { persistMissionPhotoBlob } from "./mission-photos";
import { persistFuelingPhotoBlob, type FuelingPhotoKind } from "./fueling-photo-storage";
import { persistEmployeeDocBlob } from "./employee-doc-storage";
import { persistLoginSelfieBlob } from "./login-selfie-storage";

export type MediaTable =
  | "mission_photos"
  | "vehicle_fueling"
  | "employee_documents"
  | "mission_costs"
  | "login_selfies";

export type BucketReport = {
  scanned: number;
  migrated: number;
  failed: number;
  skipped: number;
};

export type MigrateMediaReport = {
  missionPhotos: BucketReport;
  fueling: BucketReport;
  employeeDocs: BucketReport;
  missionCosts: BucketReport;
  loginSelfies: BucketReport;
};

const EMPTY_BUCKET = (): BucketReport => ({
  scanned: 0,
  migrated: 0,
  failed: 0,
  skipped: 0,
});

function looksLikeInlineBlob(v: unknown): boolean {
  if (typeof v !== "string" || v.length < 200) return false;
  if (isStoragePath(v) || v.startsWith("[")) return false;
  if (isInlineBase64Blob(v) || v.startsWith("data:image/") || v.startsWith("data:application/")) {
    return true;
  }
  // base64 cru (sem prefixo data:) — legado WAF
  return /^[A-Za-z0-9+/=\s]{200,}$/.test(v.slice(0, 500));
}

async function neutralizeTinyStub(
  table: string,
  column: string,
  id: number,
  value: string | null,
): Promise<void> {
  if (!value || !value.startsWith("data:") || value.length > 500) return;
  const { error } = await supabaseAdmin
    .from(table)
    .update({ [column]: "[invalid-stub]" })
    .eq("id", id)
    .eq(column, value);
  if (error) {
    console.warn(`[migrate-media] neutralize ${table}#${id}:`, error.message);
  }
}

async function listCandidateIds(
  table: string,
  column: string,
  limit: number,
): Promise<number[]> {
  // Busca folga pra pular stubs "data:" curtos que bloqueavam o ASC.
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id")
    .like(column, "data:%")
    .order("id", { ascending: true })
    .limit(Math.max(limit * 10, 50));
  if (error) throw error;
  return (data || [])
    .map((r: { id: number }) => r.id)
    .filter((id) => Number.isFinite(id))
    .slice(0, Math.max(limit * 10, 50));
}

async function migrateMissionPhotos(limit: number, report: BucketReport) {
  const ids = await listCandidateIds("mission_photos", "photo_data", limit);
  for (const id of ids) {
    if (report.migrated + report.failed >= limit) break;
    report.scanned++;
    const { data: row, error } = await supabaseAdmin
      .from("mission_photos")
      .select("id, service_order_id, photo_data")
      .eq("id", id)
      .maybeSingle();
    if (error || !row) {
      report.failed++;
      continue;
    }
    const v = row.photo_data as string | null;
    if (!looksLikeInlineBlob(v)) {
      await neutralizeTinyStub("mission_photos", "photo_data", id, v);
      report.skipped++;
      continue;
    }
    try {
      const path = await persistMissionPhotoBlob(row.service_order_id, v!);
      if (path === v || looksLikeInlineBlob(path)) {
        report.failed++;
        continue;
      }
      const { error: upErr } = await supabaseAdmin
        .from("mission_photos")
        .update({ photo_data: path })
        .eq("id", row.id);
      if (upErr) {
        report.failed++;
        console.warn(`[migrate-media] mission_photos#${row.id}:`, upErr.message);
      } else {
        report.migrated++;
      }
    } catch (e: any) {
      report.failed++;
      console.warn(`[migrate-media] mission_photos#${id}:`, e?.message);
    }
  }
}

const FUELING_COLS: { col: string; kind: FuelingPhotoKind }[] = [
  { col: "receipt_photo", kind: "receipt" },
  { col: "pump_photo", kind: "pump" },
  { col: "odometer_photo", kind: "odometer" },
  { col: "plate_photo", kind: "plate" },
];

async function migrateFueling(limit: number, report: BucketReport) {
  // Qualquer coluna ainda em data: — união por id
  const idSets = await Promise.all(
    FUELING_COLS.map((c) => listCandidateIds("vehicle_fueling", c.col, limit)),
  );
  const ids = [...new Set(idSets.flat())].sort((a, b) => a - b).slice(0, limit);

  for (const id of ids) {
    report.scanned++;
    const { data: row, error } = await supabaseAdmin
      .from("vehicle_fueling")
      .select("id, receipt_photo, pump_photo, odometer_photo, plate_photo")
      .eq("id", id)
      .maybeSingle();
    if (error || !row) {
      report.failed++;
      continue;
    }
    const patch: Record<string, string> = {};
    for (const { col, kind } of FUELING_COLS) {
      const v = (row as any)[col] as string | null;
      if (!looksLikeInlineBlob(v)) continue;
      try {
        const path = await persistFuelingPhotoBlob(row.id, kind, v);
        if (path && path !== v && !looksLikeInlineBlob(path)) patch[col] = path;
        else report.failed++;
      } catch (e: any) {
        report.failed++;
        console.warn(`[migrate-media] fueling#${id}.${col}:`, e?.message);
      }
    }
    if (Object.keys(patch).length === 0) {
      report.skipped++;
      continue;
    }
    const { error: upErr } = await supabaseAdmin
      .from("vehicle_fueling")
      .update(patch)
      .eq("id", id);
    if (upErr) {
      report.failed++;
      console.warn(`[migrate-media] fueling#${id}:`, upErr.message);
    } else {
      report.migrated += Object.keys(patch).length;
    }
  }
}

async function migrateEmployeeDocs(limit: number, report: BucketReport) {
  const ids = await listCandidateIds("employee_documents", "file_data", limit);
  for (const id of ids) {
    report.scanned++;
    const { data: row, error } = await supabaseAdmin
      .from("employee_documents")
      .select("id, employee_id, type, file_data, file_name")
      .eq("id", id)
      .maybeSingle();
    if (error || !row) {
      report.failed++;
      continue;
    }
    const v = row.file_data as string | null;
    if (!looksLikeInlineBlob(v)) {
      await neutralizeTinyStub("employee_documents", "file_data", id, v);
      report.skipped++;
      continue;
    }
    try {
      const path = await persistEmployeeDocBlob(
        row.employee_id,
        row.type,
        v,
        row.file_name,
      );
      if (!path || path === v || looksLikeInlineBlob(path)) {
        report.failed++;
        continue;
      }
      const { error: upErr } = await supabaseAdmin
        .from("employee_documents")
        .update({ file_data: path })
        .eq("id", row.id);
      if (upErr) {
        report.failed++;
        console.warn(`[migrate-media] employee_documents#${id}:`, upErr.message);
      } else {
        report.migrated++;
      }
    } catch (e: any) {
      report.failed++;
      console.warn(`[migrate-media] employee_documents#${id}:`, e?.message);
    }
  }
}

async function migrateMissionCosts(limit: number, report: BucketReport) {
  const ids = await listCandidateIds("mission_costs", "photo_url", limit);
  for (const id of ids) {
    report.scanned++;
    const { data: row, error } = await supabaseAdmin
      .from("mission_costs")
      .select("id, service_order_id, photo_url")
      .eq("id", id)
      .maybeSingle();
    if (error || !row) {
      report.failed++;
      continue;
    }
    const v = row.photo_url as string | null;
    if (!looksLikeInlineBlob(v)) {
      await neutralizeTinyStub("mission_costs", "photo_url", id, v);
      report.skipped++;
      continue;
    }
    try {
      const path = await persistMissionPhotoBlob(row.service_order_id, v!);
      if (path === v || looksLikeInlineBlob(path)) {
        report.failed++;
        continue;
      }
      const { error: upErr } = await supabaseAdmin
        .from("mission_costs")
        .update({ photo_url: path })
        .eq("id", row.id);
      if (upErr) {
        report.failed++;
        console.warn(`[migrate-media] mission_costs#${id}:`, upErr.message);
      } else {
        report.migrated++;
      }
    } catch (e: any) {
      report.failed++;
      console.warn(`[migrate-media] mission_costs#${id}:`, e?.message);
    }
  }
}

async function migrateLoginSelfies(limit: number, report: BucketReport) {
  const ids = await listCandidateIds("login_selfies", "photo_data", limit);
  for (const id of ids) {
    report.scanned++;
    const { data: row, error } = await supabaseAdmin
      .from("login_selfies")
      .select("id, user_id, photo_data")
      .eq("id", id)
      .maybeSingle();
    if (error || !row) {
      report.failed++;
      continue;
    }
    const v = row.photo_data as string | null;
    if (!looksLikeInlineBlob(v)) {
      await neutralizeTinyStub("login_selfies", "photo_data", id, v);
      report.skipped++;
      continue;
    }
    try {
      const path = await persistLoginSelfieBlob(row.user_id, v);
      if (!path || path === v || looksLikeInlineBlob(path)) {
        report.failed++;
        continue;
      }
      const { error: upErr } = await supabaseAdmin
        .from("login_selfies")
        .update({ photo_data: path })
        .eq("id", row.id);
      if (upErr) {
        report.failed++;
        console.warn(`[migrate-media] login_selfies#${id}:`, upErr.message);
      } else {
        report.migrated++;
      }
    } catch (e: any) {
      report.failed++;
      console.warn(`[migrate-media] login_selfies#${id}:`, e?.message);
    }
  }
}

export async function migrateMediaToStorage(opts?: {
  limitPerTable?: number;
  tables?: MediaTable[];
}): Promise<MigrateMediaReport> {
  const limit = Math.min(Math.max(opts?.limitPerTable ?? 25, 1), 100);
  const tables = new Set<MediaTable>(
    opts?.tables || [
      "mission_photos",
      "vehicle_fueling",
      "employee_documents",
      "mission_costs",
      "login_selfies",
    ],
  );
  const report: MigrateMediaReport = {
    missionPhotos: EMPTY_BUCKET(),
    fueling: EMPTY_BUCKET(),
    employeeDocs: EMPTY_BUCKET(),
    missionCosts: EMPTY_BUCKET(),
    loginSelfies: EMPTY_BUCKET(),
  };
  if (tables.has("mission_photos")) await migrateMissionPhotos(limit, report.missionPhotos);
  if (tables.has("vehicle_fueling")) await migrateFueling(limit, report.fueling);
  if (tables.has("employee_documents")) await migrateEmployeeDocs(limit, report.employeeDocs);
  if (tables.has("mission_costs")) await migrateMissionCosts(limit, report.missionCosts);
  if (tables.has("login_selfies")) await migrateLoginSelfies(limit, report.loginSelfies);
  return report;
}

export function summarizeMigrateReport(report: MigrateMediaReport): {
  migrated: number;
  failed: number;
  scanned: number;
} {
  const buckets = [
    report.missionPhotos,
    report.fueling,
    report.employeeDocs,
    report.missionCosts,
    report.loginSelfies,
  ];
  return {
    migrated: buckets.reduce((s, b) => s + b.migrated, 0),
    failed: buckets.reduce((s, b) => s + b.failed, 0),
    scanned: buckets.reduce((s, b) => s + b.scanned, 0),
  };
}
