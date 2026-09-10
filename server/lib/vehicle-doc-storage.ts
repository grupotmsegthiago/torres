import { supabaseAdmin } from "../supabase";

/** Anexos de seguro da viatura (apólice / contrato). Privado; signed URL na leitura. */
export const VEHICLE_DOC_BUCKET = "vehicle-docs";
const SIGNED_URL_TTL_SEC = 300;
const MAX_BYTES = 10 * 1024 * 1024;

export type VehicleInsuranceKind = "policy" | "contract";

export async function ensureVehicleDocsBucket(): Promise<void> {
  try {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const exists = (buckets || []).some((b: any) => b.name === VEHICLE_DOC_BUCKET);
    if (!exists) {
      const { error } = await supabaseAdmin.storage.createBucket(VEHICLE_DOC_BUCKET, {
        public: false,
        fileSizeLimit: MAX_BYTES,
      });
      if (error && !/already exists/i.test(error.message || "")) {
        console.warn(`[storage] createBucket ${VEHICLE_DOC_BUCKET}:`, error.message);
      } else {
        console.log(`[storage] Bucket '${VEHICLE_DOC_BUCKET}' criado (private)`);
      }
    }
  } catch (e: any) {
    console.warn(`[storage] ensureVehicleDocsBucket skipped:`, e?.message);
  }
}

export function parseInsuranceKind(raw: string | undefined): VehicleInsuranceKind | null {
  const k = String(raw || "").toLowerCase();
  if (k === "policy" || k === "apolice" || k === "apólice") return "policy";
  if (k === "contract" || k === "contrato") return "contract";
  return null;
}

export function insuranceColumn(kind: VehicleInsuranceKind): "insurancePolicyFile" | "insuranceContractFile" {
  return kind === "policy" ? "insurancePolicyFile" : "insuranceContractFile";
}

export async function uploadVehicleInsuranceDoc(opts: {
  vehicleId: number;
  kind: VehicleInsuranceKind;
  fileBase64: string;
  fileName: string;
  contentType?: string | null;
}): Promise<string> {
  await ensureVehicleDocsBucket();
  const cleanBase64 = String(opts.fileBase64 || "").replace(/^data:[^;]+;base64,/, "").trim();
  const buffer = Buffer.from(cleanBase64, "base64");
  if (buffer.length === 0) throw new Error("Arquivo vazio ou inválido");
  if (buffer.length > MAX_BYTES) throw new Error("Arquivo excede 10 MB");

  const ext = String(opts.fileName).split(".").pop()?.toLowerCase() || "bin";
  if (!["pdf", "jpg", "jpeg", "png", "webp"].includes(ext)) {
    throw new Error("Apenas PDF, JPG, PNG ou WEBP");
  }
  const kindName = opts.kind === "policy" ? "apolice" : "contrato";
  const rand = Math.random().toString(36).slice(2, 8);
  const storagePath = `${opts.vehicleId}/${kindName}_${Date.now()}_${rand}.${ext}`;
  const contentType = opts.contentType
    || (ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`);

  const { error } = await supabaseAdmin.storage
    .from(VEHICLE_DOC_BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (error) throw error;
  return storagePath;
}

export async function signVehicleInsuranceDoc(path: string): Promise<string | null> {
  if (!path || path.startsWith("data:")) return path || null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const { data, error } = await supabaseAdmin.storage
    .from(VEHICLE_DOC_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error) {
    console.warn(`[storage] signVehicleInsuranceDoc (${path}):`, error.message);
    return null;
  }
  return data?.signedUrl || null;
}
