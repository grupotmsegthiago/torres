import { supabaseAdmin } from "../supabase";

/**
 * Núcleo compartilhado de blobs privados no Supabase Storage.
 * Domínios (missão, abastecimento, docs RH) só escolhem bucket/pasta;
 * upload/sign/download e o contrato dual-read (path | data URI | http) ficam aqui.
 *
 * Regra: coluna no Postgres guarda CAMINHO curto; base64 legado continua legível.
 */

const SIGNED_URL_TTL_SEC = 300;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/** Path tipicamente gravado: `{folder}/{timestamp}_{rand}.{ext}` */
const STORAGE_PATH_RE = /^[\w-]+\/[\w./-]+\.(jpe?g|png|webp|gif|pdf)$/i;

/** True se o valor é caminho de Storage (não use type predicate: quebraria o ramo `else` em `string`). */
export function isStoragePath(v: unknown): boolean {
  if (typeof v !== "string" || v.length < 8) return false;
  if (v.startsWith("data:") || v.startsWith("http://") || v.startsWith("https://")) return false;
  // Placeholders (ex.: "[ajuste-manual]") e marcadores não são paths.
  if (v.startsWith("[") || v.includes(" ")) return false;
  return STORAGE_PATH_RE.test(v);
}

export function hasBlobValue(v: unknown): boolean {
  return typeof v === "string" && v.length > 0;
}

export async function ensurePrivateBucket(
  bucket: string,
  fileSizeLimit = DEFAULT_MAX_BYTES,
): Promise<void> {
  try {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const exists = (buckets || []).some((b: { name: string }) => b.name === bucket);
    if (!exists) {
      const { error } = await supabaseAdmin.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit,
      });
      if (error && !/already exists/i.test(error.message || "")) {
        console.warn(`[storage] createBucket ${bucket}:`, error.message);
      } else {
        console.log(`[storage] Bucket '${bucket}' criado (private)`);
      }
    }
  } catch (e: any) {
    console.warn(`[storage] ensurePrivateBucket(${bucket}) skipped:`, e?.message);
  }
}

export async function uploadBase64ToBucket(opts: {
  bucket: string;
  storagePath: string;
  base64OrDataUri: string;
  contentType?: string;
  maxBytes?: number;
}): Promise<string> {
  const mimeMatch = /^data:([^;]+);base64,/.exec(opts.base64OrDataUri);
  const mime = opts.contentType || mimeMatch?.[1] || "image/jpeg";
  const cleanBase64 = String(opts.base64OrDataUri).replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(cleanBase64, "base64");
  if (buffer.length === 0) throw new Error("Arquivo vazio ou inválido");
  const max = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  if (buffer.length > max) throw new Error(`Arquivo excede ${Math.round(max / (1024 * 1024))} MB`);

  const { error } = await supabaseAdmin.storage
    .from(opts.bucket)
    .upload(opts.storagePath, buffer, { contentType: mime, upsert: true });
  if (error) throw error;
  return opts.storagePath;
}

export async function signStoragePath(
  bucket: string,
  path: string,
  ttlSec = SIGNED_URL_TTL_SEC,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, ttlSec);
  if (error) {
    console.warn(`[storage] sign (${bucket}/${path}):`, error.message);
    return null;
  }
  return data?.signedUrl || null;
}

/** data URI / http → intacto; path → signed URL; placeholder → intacto. */
export async function resolveBlobForView(
  bucket: string,
  v: unknown,
): Promise<string | null> {
  if (!v || typeof v !== "string") return null;
  if (v.startsWith("data:") || v.startsWith("http://") || v.startsWith("https://")) return v;
  if (!isStoragePath(v)) return v; // placeholder / legado curto
  return await signStoragePath(bucket, v);
}

/** Para e-mail / IA / PDF: precisa de data URI estável (signed URL expira). */
export async function downloadBlobAsDataUri(
  bucket: string,
  v: unknown,
): Promise<string | null> {
  if (!v || typeof v !== "string") return null;
  if (v.startsWith("data:") || v.startsWith("http://") || v.startsWith("https://")) return v;
  if (!isStoragePath(v)) return null;
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(v);
  if (error || !data) {
    console.warn(`[storage] download (${bucket}/${v}):`, error?.message);
    return null;
  }
  const buf = Buffer.from(await data.arrayBuffer());
  const ext = v.split(".").pop()?.toLowerCase();
  const mime =
    ext === "png" ? "image/png"
    : ext === "webp" ? "image/webp"
    : ext === "gif" ? "image/gif"
    : ext === "pdf" ? "application/pdf"
    : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export function buildStoragePath(
  folder: string | number,
  ext: string,
  prefix?: string,
): string {
  const safeExt = (ext || "jpg").replace(/^\./, "").toLowerCase();
  const rand = Math.random().toString(36).slice(2, 8);
  const name = prefix
    ? `${prefix}_${Date.now()}_${rand}.${safeExt}`
    : `${Date.now()}_${rand}.${safeExt}`;
  return `${folder}/${name}`;
}

export function extFromMimeOrName(mimeOrName: string, fallback = "jpg"): string {
  const m = mimeOrName.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  const fromName = m.split(".").pop();
  if (fromName && ["png", "webp", "gif", "pdf", "jpg", "jpeg"].includes(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  return fallback;
}

/** True se o valor ainda é blob inline (candidato a migração). */
export function isInlineBase64Blob(v: unknown): boolean {
  return typeof v === "string" && v.startsWith("data:") && v.includes(";base64,") && v.length > 200;
}
