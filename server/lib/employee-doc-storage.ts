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

/** Documentos de RH (CNH, CNV, etc.) — bucket privado. */
export const EMPLOYEE_DOC_BUCKET = "employee-docs";

export async function ensureEmployeeDocsBucket(): Promise<void> {
  await ensurePrivateBucket(EMPLOYEE_DOC_BUCKET);
}

export async function uploadEmployeeDoc(opts: {
  employeeId: number;
  docType?: string | null;
  fileBase64OrDataUri: string;
  fileName?: string | null;
}): Promise<string> {
  await ensureEmployeeDocsBucket();
  const raw = opts.fileBase64OrDataUri;
  const mimeMatch = /^data:([^;]+);base64,/.exec(raw);
  const mime = mimeMatch?.[1] || "application/octet-stream";
  const ext = extFromMimeOrName(opts.fileName || mime, mime.includes("pdf") ? "pdf" : "jpg");
  const typeSlug = String(opts.docType || "doc")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "doc";
  const storagePath = buildStoragePath(opts.employeeId, ext, typeSlug);
  return uploadBase64ToBucket({
    bucket: EMPLOYEE_DOC_BUCKET,
    storagePath,
    base64OrDataUri: raw,
    contentType: mime,
  });
}

export async function persistEmployeeDocBlob(
  employeeId: number,
  docType: string | null | undefined,
  value: string | null | undefined,
  fileName?: string | null,
): Promise<string | null | undefined> {
  if (value == null || value === "") return value;
  if (isStoragePath(value)) return value;
  if (!isInlineBase64Blob(value) && !value.startsWith("data:")) return value;
  try {
    return await uploadEmployeeDoc({
      employeeId,
      docType,
      fileBase64OrDataUri: value,
      fileName,
    });
  } catch (e: any) {
    console.error(`[storage] persistEmployeeDocBlob falhou:`, e?.message);
    return value;
  }
}

export async function resolveEmployeeDocForView(v: unknown): Promise<string | null> {
  return resolveBlobForView(EMPLOYEE_DOC_BUCKET, v);
}

export async function downloadEmployeeDocDataUri(v: unknown): Promise<string | null> {
  return downloadBlobAsDataUri(EMPLOYEE_DOC_BUCKET, v);
}
