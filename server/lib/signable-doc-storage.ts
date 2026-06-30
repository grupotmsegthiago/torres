import { supabaseAdmin } from "../supabase";

// Bucket privado para as evidências biométricas/jurídicas de assinatura
// (foto facial + assinatura manuscrita). Privado + signed URL de curta duração
// na leitura — mesmo padrão de mission-photos. Evita guardar base64 de dados
// biométricos inflando o banco e melhora governança/exposição.
export const SIGNABLE_DOC_BUCKET = "signable-docs";

const SIGNED_URL_TTL_SEC = 300;

/** Cria o bucket privado no boot (idempotente). */
export async function ensureSignableDocsBucket(): Promise<void> {
  try {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const exists = (buckets || []).some((b: any) => b.name === SIGNABLE_DOC_BUCKET);
    if (!exists) {
      const { error } = await supabaseAdmin.storage.createBucket(SIGNABLE_DOC_BUCKET, {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024,
      });
      if (error && !/already exists/i.test(error.message || "")) {
        console.warn(`[storage] createBucket ${SIGNABLE_DOC_BUCKET}:`, error.message);
      } else {
        console.log(`[storage] Bucket '${SIGNABLE_DOC_BUCKET}' criado (private)`);
      }
    }
  } catch (e: any) {
    console.warn(`[storage] ensureSignableDocsBucket skipped:`, e?.message);
  }
}

/** True se o valor é um caminho de storage (não base64 data: nem url http). */
export function isStoragePath(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length > 0 &&
    !v.startsWith("data:") &&
    !v.startsWith("http://") &&
    !v.startsWith("https://")
  );
}

/**
 * Decodifica base64 (com ou sem prefixo data:) e sobe pro bucket. Devolve o
 * CAMINHO do arquivo (o que vai gravado no banco), não a URL.
 * @param docId id do documento (vira pasta)
 * @param kind "facial" | "assinatura" (vira sufixo do nome)
 */
export async function uploadSignableImage(
  docId: number | string,
  kind: "facial" | "assinatura",
  base64OrDataUri: string,
  mimeHint?: string | null,
): Promise<string> {
  const mimeMatch = /^data:([^;]+);base64,/.exec(base64OrDataUri);
  const mime = mimeMatch?.[1] || (mimeHint && /^image\//i.test(mimeHint) ? mimeHint : "image/jpeg");
  const cleanBase64 = String(base64OrDataUri).replace(/^data:[^;]+;base64,/, "").trim();
  const buffer = Buffer.from(cleanBase64, "base64");
  if (buffer.length === 0) throw new Error("Imagem vazia/ inválida");

  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const rand = Math.random().toString(36).slice(2, 8);
  const storagePath = `${docId}/${Date.now()}_${kind}_${rand}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(SIGNABLE_DOC_BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: true });
  if (error) throw error;
  return storagePath;
}

/** Gera uma signed URL de curta duração pra um caminho do storage. */
export async function signSignableImage(path: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(SIGNABLE_DOC_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error) {
    console.warn(`[storage] signSignableImage erro (${path}):`, error.message);
    return null;
  }
  return data?.signedUrl || null;
}

/**
 * Converte um valor do banco em algo renderizável:
 * - null/"" -> null
 * - base64 (data:) ou http(s) -> devolve igual (legado)
 * - caminho do storage -> gera signed URL
 */
export async function resolveSignableImage(v: unknown): Promise<string | null> {
  if (!v || typeof v !== "string") return null;
  if (v.startsWith("data:") || v.startsWith("http://") || v.startsWith("https://")) return v;
  return await signSignableImage(v);
}

/**
 * Baixa o arquivo do storage e devolve como data URI base64. Usado pro PDF/
 * folha de autenticação, que precisa ser auto-contido (signed URL pode expirar
 * antes do print). Legado base64 e http(s) passam direto.
 */
export async function downloadSignableImageDataUri(v: unknown): Promise<string | null> {
  if (!v || typeof v !== "string") return null;
  if (v.startsWith("data:") || v.startsWith("http://") || v.startsWith("https://")) return v;
  const { data, error } = await supabaseAdmin.storage.from(SIGNABLE_DOC_BUCKET).download(v);
  if (error || !data) {
    console.warn(`[storage] downloadSignableImage erro (${v}):`, error?.message);
    return null;
  }
  const buf = Buffer.from(await data.arrayBuffer());
  const ext = v.split(".").pop()?.toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}
