import {
  buildStoragePath,
  downloadBlobAsDataUri,
  ensurePrivateBucket,
  extFromMimeOrName,
  hasBlobValue,
  isStoragePath,
  resolveBlobForView,
  signStoragePath,
  uploadBase64ToBucket,
} from "./private-blob-storage";

// Bucket privado onde ficam as fotos das mission_updates e mission_photos
// (antes guardadas como base64 inline, o que inflava o banco em GBs).
// Mesmo padrão dos comprovantes-pagamento: privado + signed URL curta na leitura.
export const MISSION_PHOTO_BUCKET = "mission-fotos";

export { isStoragePath, hasBlobValue as hasPhotoValue };

/** Cria o bucket privado no boot (idempotente). */
export async function ensureMissionFotosBucket(): Promise<void> {
  await ensurePrivateBucket(MISSION_PHOTO_BUCKET);
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
  const ext = extFromMimeOrName(mime);
  const folder = serviceOrderId != null ? String(serviceOrderId) : "misc";
  const storagePath = buildStoragePath(folder, ext);

  return uploadBase64ToBucket({
    bucket: MISSION_PHOTO_BUCKET,
    storagePath,
    base64OrDataUri,
    contentType: mime,
  });
}

/**
 * Upload com fail-safe: se Storage falhar, devolve o data URI original
 * (readers dual-read tratam legado; sweep migra depois).
 * Placeholders / não-imagem passam intactos.
 */
export async function persistMissionPhotoBlob(
  serviceOrderId: number | string | null | undefined,
  value: string,
): Promise<string> {
  if (!value || typeof value !== "string") return value;
  if (!value.startsWith("data:") && !/^[A-Za-z0-9+/=]{200,}/.test(value)) {
    return value; // placeholder / path já migrado / marcador
  }
  const dataUri = value.startsWith("data:") ? value : `data:image/jpeg;base64,${value}`;
  try {
    return await uploadMissionPhoto(serviceOrderId, dataUri);
  } catch (e: any) {
    console.error(
      `[storage] persistMissionPhotoBlob falhou (OS=${serviceOrderId}), fallback base64:`,
      e?.message,
    );
    return dataUri;
  }
}

/** Gera uma signed URL de curta duração pra um caminho do storage. */
export async function signMissionPhoto(path: string): Promise<string | null> {
  if (!isStoragePath(path)) {
    if (path?.startsWith("data:") || path?.startsWith("http")) return path;
    return null;
  }
  return signStoragePath(MISSION_PHOTO_BUCKET, path);
}

/**
 * Converte um photo_url / photo_data do banco em algo renderizável:
 * - null/"" -> null
 * - base64 (data:) ou http(s) -> devolve igual (legado)
 * - caminho do storage -> gera signed URL
 * - placeholder -> devolve igual
 */
export async function resolvePhotoForView(v: unknown): Promise<string | null> {
  return resolveBlobForView(MISSION_PHOTO_BUCKET, v);
}

/**
 * Baixa o arquivo do storage e devolve como data URI base64. Usado SÓ pro e-mail,
 * IA e PDF (signed URL expira). Legado base64 / http passam direto.
 */
export async function downloadMissionPhotoDataUri(v: unknown): Promise<string | null> {
  return downloadBlobAsDataUri(MISSION_PHOTO_BUCKET, v);
}
