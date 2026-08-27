const MIME_RE = /^image\/[\w.+-]+$/;
const DOC_MIME_RE = /^(image\/[\w.+-]+|application\/pdf)$/i;

/**
 * Normaliza o payload de foto vindo do cliente para um data URI completo.
 *
 * CONTEXTO (bug 04/06/2026): o WAF do edge (Google Cloud Armor, à frente das
 * deployments) bloqueia QUALQUER corpo de requisição que contenha o esquema
 * `data:image/...;base64,` — assinatura clássica de XSS via data URI — devolvendo
 * um `403 Forbidden` em HTML ANTES de a requisição chegar ao Express. Sintoma: a
 * tela "Registro de Presença" mostrava o 403 ao enviar a selfie. Comprovado por
 * teste contra produção: corpo com `data:image/...;base64,` → 403; o MESMO base64
 * cru (sem o prefixo `data:`) → passa e chega ao app.
 *
 * Solução: o cliente passa a enviar só o base64 cru (sem prefixo `data:`) + o mime
 * num campo separado, e o servidor remonta o data URI aqui. Assim o armazenamento
 * (coluna `photo_data`) e a exibição no admin continuam idênticos ao formato antigo.
 *
 * Compatibilidade: se o cliente ainda mandar o data URI completo (formato legado),
 * ele é devolvido intacto.
 */
export function normalizePhotoDataUri(photoData: unknown, mime?: unknown): string | null {
  if (typeof photoData !== "string" || photoData.length === 0) return null;
  // Legado: cliente antigo que ainda manda o data URI completo.
  if (photoData.startsWith("data:")) return photoData;
  const safeMime = typeof mime === "string" && MIME_RE.test(mime) ? mime : "image/jpeg";
  return `data:${safeMime};base64,${photoData}`;
}

/**
 * Mesmo contrato WAF-safe de `normalizePhotoDataUri`, mas aceita também PDF
 * (OCR de cadastro de funcionário: CNH/CNV/comprovante).
 *
 * Preferir `imageBase64` cru + `mime` no POST. `imageData` data-URI completo
 * continua aceito (legado / ambiente local sem WAF).
 */
export function normalizeDocumentDataUri(data: unknown, mime?: unknown): string | null {
  if (typeof data !== "string" || data.length === 0) return null;
  if (data.startsWith("data:")) return data;
  const safeMime = typeof mime === "string" && DOC_MIME_RE.test(mime) ? mime : "image/jpeg";
  return `data:${safeMime};base64,${data}`;
}

/**
 * Resolve uma imagem de assinatura/selfie.
 * Prefere base64 cru + mime (WAF-safe) e aceita data URI legado.
 */
export function resolveWafSafeImage(rawBase64: unknown, mime: unknown, legacyDataUri?: unknown): string | null {
  if (typeof rawBase64 === "string" && rawBase64.length > 0) {
    return normalizePhotoDataUri(rawBase64, mime);
  }
  if (typeof legacyDataUri === "string" && legacyDataUri.length > 0) {
    return normalizePhotoDataUri(legacyDataUri, mime);
  }
  return null;
}

/** Resolve o payload de OCR (WAF-safe ou legado) para data URI + flag PDF. */
export function resolveOcrDocumentPayload(body: {
  imageData?: unknown;
  imageBase64?: unknown;
  mime?: unknown;
}): { dataUri: string; isPdf: boolean } | null {
  const raw =
    typeof body?.imageBase64 === "string" && body.imageBase64.length > 0
      ? body.imageBase64
      : body?.imageData;
  const dataUri = normalizeDocumentDataUri(raw, body?.mime);
  if (!dataUri) return null;
  return { dataUri, isPdf: /^data:application\/pdf/i.test(dataUri) };
}
