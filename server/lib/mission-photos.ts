import { supabaseAdmin } from "../supabase";

// Bucket privado onde ficam as fotos das mission_updates (antes guardadas como
// base64 inline na coluna photo_url, o que inflava o banco em GBs). Mesmo padrão
// dos comprovantes-pagamento: privado + signed URL de curta duração na leitura.
export const MISSION_PHOTO_BUCKET = "mission-fotos";

const SIGNED_URL_TTL_SEC = 300;

/** Cria o bucket privado no boot (idempotente). */
export async function ensureMissionFotosBucket(): Promise<void> {
  try {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const exists = (buckets || []).some((b: any) => b.name === MISSION_PHOTO_BUCKET);
    if (!exists) {
      const { error } = await supabaseAdmin.storage.createBucket(MISSION_PHOTO_BUCKET, {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024,
      });
      if (error && !/already exists/i.test(error.message || "")) {
        console.warn(`[storage] createBucket ${MISSION_PHOTO_BUCKET}:`, error.message);
      } else {
        console.log(`[storage] Bucket '${MISSION_PHOTO_BUCKET}' criado (private)`);
      }
    }
  } catch (e: any) {
    console.warn(`[storage] ensureMissionFotosBucket skipped:`, e?.message);
  }
}

/**
 * Um valor de photo_url é "caminho do storage" quando NÃO é base64 (data:) nem
 * URL http(s) — ou seja, é tipo "123/1699999999_ab12cd.jpg". É isso que passa a
 * ser gravado no banco a partir de agora.
 */
export function isStoragePath(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length > 0 &&
    !v.startsWith("data:") &&
    !v.startsWith("http://") &&
    !v.startsWith("https://")
  );
}

/** True se o valor representa uma foto (base64 OU caminho de storage OU url). */
export function hasPhotoValue(v: unknown): boolean {
  return typeof v === "string" && v.length > 0;
}

/**
 * Decodifica base64 (com ou sem prefixo data:) e sobe pro bucket. Devolve o
 * CAMINHO do arquivo (o que vai gravado no banco), não a URL.
 */
export async function uploadMissionPhoto(
  serviceOrderId: number | string | null | undefined,
  base64OrDataUri: string,
): Promise<string> {
  const mimeMatch = /^data:([^;]+);base64,/.exec(base64OrDataUri);
  const mime = mimeMatch?.[1] || "image/jpeg";
  const cleanBase64 = String(base64OrDataUri).replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(cleanBase64, "base64");
  if (buffer.length === 0) throw new Error("Foto vazia/ inválida");

  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const folder = serviceOrderId != null ? String(serviceOrderId) : "misc";
  const rand = Math.random().toString(36).slice(2, 8);
  const storagePath = `${folder}/${Date.now()}_${rand}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(MISSION_PHOTO_BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: true });
  if (error) throw error;
  return storagePath;
}

/** Gera uma signed URL de curta duração pra um caminho do storage. */
export async function signMissionPhoto(path: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(MISSION_PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error) {
    console.warn(`[storage] signMissionPhoto erro (${path}):`, error.message);
    return null;
  }
  return data?.signedUrl || null;
}

/**
 * Converte um photo_url do banco em algo renderizável/encaminhável:
 * - null/"" -> null
 * - base64 (data:) ou http(s) -> devolve igual (legado)
 * - caminho do storage -> gera signed URL
 */
export async function resolvePhotoForView(v: unknown): Promise<string | null> {
  if (!v || typeof v !== "string") return null;
  if (v.startsWith("data:") || v.startsWith("http://") || v.startsWith("https://")) return v;
  return await signMissionPhoto(v);
}

/**
 * Baixa o arquivo do storage e devolve como data URI base64. Usado SÓ pro e-mail
 * (que precisa ser auto-contido e durar pra sempre — signed URL expira). Para
 * legado base64, devolve igual; http(s) também passa direto.
 */
export async function downloadMissionPhotoDataUri(v: unknown): Promise<string | null> {
  if (!v || typeof v !== "string") return null;
  if (v.startsWith("data:") || v.startsWith("http://") || v.startsWith("https://")) return v;
  const { data, error } = await supabaseAdmin.storage.from(MISSION_PHOTO_BUCKET).download(v);
  if (error || !data) {
    console.warn(`[storage] downloadMissionPhoto erro (${v}):`, error?.message);
    return null;
  }
  const buf = Buffer.from(await data.arrayBuffer());
  const ext = v.split(".").pop()?.toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}
