/**
 * Migração controlada: base64 inline → Supabase Storage.
 * Processa em lotes; idempotente (pula quem já é path).
 * Não apaga blobs do Storage; só reescreve a coluna no Postgres.
 */
import { supabaseAdmin } from "../supabase";
import {
  isInlineBase64Blob,
  isStoragePath,
} from "./private-blob-storage";
import { persistMissionPhotoBlob } from "./mission-photos";
import { persistFuelingPhotoBlob, type FuelingPhotoKind } from "./fueling-photo-storage";
import { persistEmployeeDocBlob } from "./employee-doc-storage";

export type MigrateMediaReport = {
  missionPhotos: { scanned: number; migrated: number; failed: number; skipped: number };
  fueling: { scanned: number; migrated: number; failed: number; skipped: number };
  employeeDocs: { scanned: number; migrated: number; failed: number; skipped: number };
};

const EMPTY_BUCKET = () => ({ scanned: 0, migrated: 0, failed: 0, skipped: 0 });

async function migrateMissionPhotos(limit: number, report: MigrateMediaReport["missionPhotos"]) {
  // PostgREST não filtra bem por prefixo de TEXT gigante; buscamos recentes
  // e filtramos em memória. Rodadas sucessivas cobrem o histórico.
  const { data, error } = await supabaseAdmin
    .from("mission_photos")
    .select("id, service_order_id, photo_data")
    .order("id", { ascending: false })
    .limit(Math.max(limit * 4, 80));
  if (error) throw error;

  for (const row of data || []) {
    const v = row.photo_data as string | null;
    if (!v || isStoragePath(v) || v.startsWith("[")) {
      report.skipped++;
      continue;
    }
    if (!isInlineBase64Blob(v) && !v.startsWith("data:image/")) {
      report.skipped++;
      continue;
    }
    if (report.scanned >= limit) break;
    report.scanned++;
    try {
      const path = await persistMissionPhotoBlob(row.service_order_id, v);
      if (path === v) {
        report.failed++;
        continue;
      }
      const { error: upErr } = await supabaseAdmin
        .from("mission_photos")
        .update({ photo_data: path })
        .eq("id", row.id)
        .eq("photo_data", v); // otimista: não sobrescreve se mudou
      if (upErr) {
        report.failed++;
        console.warn(`[migrate-media] mission_photos#${row.id}:`, upErr.message);
      } else {
        report.migrated++;
      }
    } catch (e: any) {
      report.failed++;
      console.warn(`[migrate-media] mission_photos#${row.id}:`, e?.message);
    }
  }
}

const FUELING_COLS: { col: string; kind: FuelingPhotoKind }[] = [
  { col: "receipt_photo", kind: "receipt" },
  { col: "pump_photo", kind: "pump" },
  { col: "odometer_photo", kind: "odometer" },
  { col: "plate_photo", kind: "plate" },
];

async function migrateFueling(limit: number, report: MigrateMediaReport["fueling"]) {
  const { data, error } = await supabaseAdmin
    .from("vehicle_fueling")
    .select("id, receipt_photo, pump_photo, odometer_photo, plate_photo")
    .order("id", { ascending: false })
    .limit(Math.max(limit * 2, 40));
  if (error) throw error;

  for (const row of data || []) {
    if (report.scanned >= limit) break;
    let touched = false;
    const patch: Record<string, string> = {};
    for (const { col, kind } of FUELING_COLS) {
      const v = (row as any)[col] as string | null;
      if (!v || isStoragePath(v)) continue;
      if (!isInlineBase64Blob(v) && !v.startsWith("data:image/")) continue;
      touched = true;
      try {
        const path = await persistFuelingPhotoBlob(row.id, kind, v);
        if (path && path !== v) patch[col] = path;
        else report.failed++;
      } catch (e: any) {
        report.failed++;
        console.warn(`[migrate-media] fueling#${row.id}.${col}:`, e?.message);
      }
    }
    if (!touched) {
      report.skipped++;
      continue;
    }
    report.scanned++;
    if (Object.keys(patch).length === 0) continue;
    const { error: upErr } = await supabaseAdmin
      .from("vehicle_fueling")
      .update(patch)
      .eq("id", row.id);
    if (upErr) {
      report.failed++;
      console.warn(`[migrate-media] fueling#${row.id}:`, upErr.message);
    } else {
      report.migrated += Object.keys(patch).length;
    }
  }
}

async function migrateEmployeeDocs(limit: number, report: MigrateMediaReport["employeeDocs"]) {
  const { data, error } = await supabaseAdmin
    .from("employee_documents")
    .select("id, employee_id, type, file_data, file_name")
    .order("id", { ascending: false })
    .limit(Math.max(limit * 3, 60));
  if (error) throw error;

  for (const row of data || []) {
    const v = row.file_data as string | null;
    if (!v || isStoragePath(v)) {
      report.skipped++;
      continue;
    }
    if (!isInlineBase64Blob(v) && !v.startsWith("data:")) {
      report.skipped++;
      continue;
    }
    if (report.scanned >= limit) break;
    report.scanned++;
    try {
      const path = await persistEmployeeDocBlob(
        row.employee_id,
        row.type,
        v,
        row.file_name,
      );
      if (!path || path === v) {
        report.failed++;
        continue;
      }
      const { error: upErr } = await supabaseAdmin
        .from("employee_documents")
        .update({ file_data: path })
        .eq("id", row.id)
        .eq("file_data", v);
      if (upErr) {
        report.failed++;
        console.warn(`[migrate-media] employee_documents#${row.id}:`, upErr.message);
      } else {
        report.migrated++;
      }
    } catch (e: any) {
      report.failed++;
      console.warn(`[migrate-media] employee_documents#${row.id}:`, e?.message);
    }
  }
}

export async function migrateMediaToStorage(opts?: {
  limitPerTable?: number;
  tables?: Array<"mission_photos" | "vehicle_fueling" | "employee_documents">;
}): Promise<MigrateMediaReport> {
  const limit = Math.min(Math.max(opts?.limitPerTable ?? 25, 1), 100);
  const tables = new Set(opts?.tables || ["mission_photos", "vehicle_fueling", "employee_documents"]);
  const report: MigrateMediaReport = {
    missionPhotos: EMPTY_BUCKET(),
    fueling: EMPTY_BUCKET(),
    employeeDocs: EMPTY_BUCKET(),
  };
  if (tables.has("mission_photos")) await migrateMissionPhotos(limit, report.missionPhotos);
  if (tables.has("vehicle_fueling")) await migrateFueling(limit, report.fueling);
  if (tables.has("employee_documents")) await migrateEmployeeDocs(limit, report.employeeDocs);
  return report;
}
