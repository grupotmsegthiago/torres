import {
  buildStoragePath,
  downloadBlobAsDataUri,
  ensurePrivateBucket,
  extFromMimeOrName,
  isInlineBase64Blob,
  isStoragePath,
  resolveBlobForView,
  uploadBase64ToBucket,
} from "./private-blob-storage";

/** Selfies de login — bucket privado (evidência de acesso, não apagar). */
export const LOGIN_SELFIE_BUCKET = "login-selfies";

export async function ensureLoginSelfiesBucket(): Promise<void> {
  await ensurePrivateBucket(LOGIN_SELFIE_BUCKET);
}

export async function uploadLoginSelfie(
  userId: number | string | null | undefined,
  base64OrDataUri: string,
): Promise<string> {
  await ensureLoginSelfiesBucket();
  const mimeMatch = /^data:([^;]+);base64,/.exec(base64OrDataUri);
  const mime = mimeMatch?.[1] || "image/jpeg";
  const ext = extFromMimeOrName(mime);
  const folder = userId != null ? String(userId) : "misc";
  const storagePath = buildStoragePath(folder, ext, "selfie");
  return uploadBase64ToBucket({
    bucket: LOGIN_SELFIE_BUCKET,
    storagePath,
    base64OrDataUri,
    contentType: mime,
  });
}

/** Fail-safe: Storage → path; erro → mantém data URI. */
export async function persistLoginSelfieBlob(
  userId: number | string | null | undefined,
  value: string | null | undefined,
): Promise<string | null | undefined> {
  if (value == null || value === "") return value;
  if (isStoragePath(value)) return value;
  if (!isInlineBase64Blob(value) && !value.startsWith("data:image/")) return value;
  try {
    return await uploadLoginSelfie(userId, value);
  } catch (e: any) {
    console.error(`[storage] persistLoginSelfieBlob falhou:`, e?.message);
    return value;
  }
}

export async function resolveLoginSelfieForView(v: unknown): Promise<string | null> {
  return resolveBlobForView(LOGIN_SELFIE_BUCKET, v);
}

export async function downloadLoginSelfieDataUri(v: unknown): Promise<string | null> {
  return downloadBlobAsDataUri(LOGIN_SELFIE_BUCKET, v);
}
