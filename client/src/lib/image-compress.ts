// Compressor de imagem no front-end (Canvas nativo) usado nos uploads/capturas
// de Abastecimento (vehicle_fueling), Documentos (employee_documents) e demais
// telas que salvam foto em Base64 no Supabase. Fotos de celular vêm em 4-8 MB e
// estouravam o payload (46 MB → timeout/521 → fallback). Redimensiona pro maior
// lado <= maxSide e re-encoda JPEG na qualidade dada. Resultado típico: 50-150 KB.

export const DEFAULT_MAX_SIDE = 1024;
export const DEFAULT_QUALITY = 0.7;

export interface CompressOptions {
  maxSide?: number;
  quality?: number;
}

// Redimensiona/recomprime um data URL de imagem. Se não for imagem (ex.: PDF) ou
// se algo falhar, devolve o original intacto.
export function compressImageDataUrl(
  dataUrl: string,
  { maxSide = DEFAULT_MAX_SIDE, quality = DEFAULT_QUALITY }: CompressOptions = {},
): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl.startsWith("data:image/")) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (!w || !h) { resolve(dataUrl); return; }
      if (w > maxSide || h > maxSide) {
        if (w > h) { h = Math.round((h / w) * maxSide); w = maxSide; }
        else { w = Math.round((w / h) * maxSide); h = maxSide; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL("image/jpeg", quality);
      const origKB = Math.round(dataUrl.length * 0.75 / 1024);
      const newKB = Math.round(compressed.length * 0.75 / 1024);
      console.log(`[img-compress] ${origKB} KB → ${newKB} KB (${w}x${h})`);
      // Se por algum motivo ficou maior (imagem já minúscula), mantém o original.
      resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Lê um File, comprime se for imagem (PDF passa direto) e devolve data URL + nome
// de arquivo normalizado (.jpg quando recomprimido).
export function compressImageFile(
  file: File,
  opts: CompressOptions = {},
): Promise<{ dataUrl: string; fileName: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.onload = async (ev) => {
      const originalDataUrl = ev.target!.result as string;
      if (!file.type.startsWith("image/") || originalDataUrl.startsWith("data:application/pdf")) {
        resolve({ dataUrl: originalDataUrl, fileName: file.name });
        return;
      }
      const compressed = await compressImageDataUrl(originalDataUrl, opts);
      if (compressed === originalDataUrl) {
        resolve({ dataUrl: originalDataUrl, fileName: file.name });
        return;
      }
      const baseName = file.name
        .replace(/\.(png|webp|heic|heif|gif|bmp|tiff?)$/i, "")
        .replace(/\.jpe?g$/i, "");
      resolve({ dataUrl: compressed, fileName: `${baseName || "foto"}.jpg` });
    };
    reader.readAsDataURL(file);
  });
}
