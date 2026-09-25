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

/** Fotos de abastecimento (NF, bomba, hodômetro, placa). */
export const FUELING_PHOTO_BUCKET = "fueling-fotos";

export type FuelingPhotoKind = "receipt" | "pump" | "odometer" | "plate";

export async function ensureFuelingFotosBucket(): Promise<void> {
  await ensurePrivateBucket(FUELING_PHOTO_BUCKET);
}

export async function uploadFuelingPhoto(
  fuelingId: number | string | null | undefined,
  kind: FuelingPhotoKind,
  base64OrDataUri: string,
): Promise<string> {
  await ensureFuelingFotosBucket();
  const mimeMatch = /^data:([^;]+);base64,/.exec(base64OrDataUri);
  const mime = mimeMatch?.[1] || "image/jpeg";
  const ext = extFromMimeOrName(mime);
  const folder = fuelingId != null ? String(fuelingId) : "pending";
  const storagePath = buildStoragePath(folder, ext, kind);
  return uploadBase64ToBucket({
    bucket: FUELING_PHOTO_BUCKET,
    storagePath,
    base64OrDataUri,
    contentType: mime,
  });
}

/** Fail-safe: Storage → path; erro → mantém data URI. */
export async function persistFuelingPhotoBlob(
  fuelingId: number | string | null | undefined,
  kind: FuelingPhotoKind,
  value: string | null | undefined,
): Promise<string | null | undefined> {
  if (value == null || value === "") return value;
  if (!isInlineBase64Blob(value) && !value.startsWith("data:image/")) {
    // já é path ou valor curto
    if (isStoragePath(value) || !value.startsWith("data:")) return value;
  }
  try {
    return await uploadFuelingPhoto(fuelingId, kind, value);
  } catch (e: any) {
    console.error(`[storage] persistFuelingPhoto(${kind}) falhou:`, e?.message);
    return value;
  }
}

export async function resolveFuelingPhotoForView(v: unknown): Promise<string | null> {
  return resolveBlobForView(FUELING_PHOTO_BUCKET, v);
}

export async function downloadFuelingPhotoDataUri(v: unknown): Promise<string | null> {
  return downloadBlobAsDataUri(FUELING_PHOTO_BUCKET, v);
}

/** Resolve as 4 colunas de foto de um abastecimento para a UI. */
export async function resolveFuelingPhotosForView<T extends Record<string, any>>(row: T): Promise<T> {
  const [receiptPhoto, pumpPhoto, odometerPhoto, platePhoto] = await Promise.all([
    resolveFuelingPhotoForView(row.receiptPhoto ?? row.receipt_photo),
    resolveFuelingPhotoForView(row.pumpPhoto ?? row.pump_photo),
    resolveFuelingPhotoForView(row.odometerPhoto ?? row.odometer_photo),
    resolveFuelingPhotoForView(row.platePhoto ?? row.plate_photo),
  ]);
  return {
    ...row,
    receiptPhoto: receiptPhoto ?? row.receiptPhoto ?? null,
    pumpPhoto: pumpPhoto ?? row.pumpPhoto ?? null,
    odometerPhoto: odometerPhoto ?? row.odometerPhoto ?? null,
    platePhoto: platePhoto ?? row.platePhoto ?? null,
  };
}
