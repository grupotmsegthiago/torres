/**
 * Extração de texto de PDF no Node/Vercel.
 *
 * pdf-parse v2 usa pdfjs-dist, que exige DOMMatrix/ImageData/Path2D.
 * Em serverless esses globals não existem — sem polyfill/CanvasFactory
 * explode com: "DOMMatrix is not defined".
 *
 * Solução oficial (pdf-parse docs):
 *  1) ter @napi-rs/canvas como dependência direta
 *  2) carregar CanvasFactory de "pdf-parse/worker" ANTES de PDFParse
 *  3) passar CanvasFactory no construtor
 */

let polyfillReady: Promise<void> | null = null;

async function ensurePdfDomPolyfill(): Promise<void> {
  if (polyfillReady) return polyfillReady;
  polyfillReady = (async () => {
    const g = globalThis as any;
    if (g.DOMMatrix && g.ImageData && g.Path2D) return;
    try {
      const canvas = await import("@napi-rs/canvas");
      if (!g.DOMMatrix && canvas.DOMMatrix) g.DOMMatrix = canvas.DOMMatrix;
      if (!g.ImageData && canvas.ImageData) g.ImageData = canvas.ImageData;
      if (!g.Path2D && canvas.Path2D) g.Path2D = canvas.Path2D;
      if (!g.Image && canvas.Image) g.Image = canvas.Image;
    } catch (err: any) {
      console.warn("[pdf-text] falha ao carregar @napi-rs/canvas:", err?.message || err);
    }
  })();
  return polyfillReady;
}

/** Extrai texto de um Buffer PDF. Lança se não conseguir ler. */
export async function extractPdfText(buf: Buffer | Uint8Array): Promise<string> {
  await ensurePdfDomPolyfill();

  // Import order matters: worker (CanvasFactory) before pdf-parse.
  const { CanvasFactory } = await import("pdf-parse/worker");
  const { PDFParse } = await import("pdf-parse");

  const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const parser = new PDFParse({ data, CanvasFactory });
  try {
    const parsed = await parser.getText();
    const text = typeof parsed === "string" ? parsed : (parsed?.text || "");
    return String(text).trim();
  } finally {
    try {
      await (parser as any).destroy?.();
    } catch {
      /* ignore */
    }
  }
}
