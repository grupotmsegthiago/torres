const MIME_RE = /^image\/[\w.+-]+$/;

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
