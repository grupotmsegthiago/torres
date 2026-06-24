import sharp from "sharp";
import { WM_LOGO_WHITE_B64, WM_WHATSAPP_PATH } from "./watermark-assets.js";

// Marca d'água da Torres aplicada às fotos enviadas aos grupos de cliente.
// Layout aprovado pelo dono (modelo em .local/preview/modelo-marca-dagua.jpg):
//   • logo branco no canto superior-esquerdo (sobre faixa escura suave)
//   • 3 linhas de contato no rodapé-direito (Instagram / WhatsApp / site)
// Fail-open: o chamador deve cair na foto original se isto lançar.

const INSTAGRAM = "@grupotorres.seguranca";
const WHATSAPP = "(11) 96369-6699";
const SITE = "www.torresseguranca.com.br";

// Cap de tamanho pra manter o payload do envio (base64) razoável.
const MAX_DIM = 1600;
// Teto do data URL final mandado ao Z-API. Acima disso, melhor enviar a foto
// original (URL/menor) do que arriscar rejeição por payload no provedor.
export const MAX_SEND_DATAURL_BYTES = 7 * 1024 * 1024;
// Teto do buffer de entrada (decodificado) — evita alocar buffers absurdos.
const MAX_INPUT_BYTES = 9 * 1024 * 1024;

const LOGO_BUF = Buffer.from(WM_LOGO_WHITE_B64, "base64");

/**
 * Decodifica base64 (com ou sem prefixo `data:image/...;base64,`) em buffer,
 * com teto de tamanho. Lança se o base64 for grande demais. Retorna null se vazio.
 */
export function decodeBase64Image(s: string): Buffer | null {
  if (!s) return null;
  const b64 = s.startsWith("data:") ? s.slice(s.indexOf(",") + 1) : s;
  if (!b64) return null;
  if (b64.length > Math.ceil((MAX_INPUT_BYTES * 4) / 3)) throw new Error("base64 grande demais");
  return Buffer.from(b64, "base64");
}

/**
 * Aplica a marca d'água e devolve um data URL JPEG pronto pra enviar.
 * Retorna null se o payload final passar do teto (chamador deve usar a foto original).
 */
export async function watermarkToDataUrl(srcBuf: Buffer): Promise<string | null> {
  const wm = await applyTorresWatermark(srcBuf);
  const dataUrl = `data:image/jpeg;base64,${wm.toString("base64")}`;
  if (dataUrl.length > MAX_SEND_DATAURL_BYTES) return null;
  return dataUrl;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Aplica a marca d'água Torres num buffer de imagem (JPEG/PNG/etc).
 * Normaliza orientação (EXIF), limita dimensão e devolve JPEG.
 */
export async function applyTorresWatermark(input: Buffer): Promise<Buffer> {
  // 1. normaliza orientação + limita tamanho → buffer base com W/H conhecidos
  const normBuf = await sharp(input)
    .rotate()
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  const meta = await sharp(normBuf).metadata();
  const W = meta.width!;
  const H = meta.height!;

  const bandH = Math.round(H * 0.16);
  const bandY = H - bandH;
  const pad = Math.round(W * 0.028);
  const cy = bandY + bandH / 2;

  // logo (branco) no topo-esquerda
  const topPad = Math.round(H * 0.03);
  const logoMeta = await sharp(LOGO_BUF).metadata();
  const logoH = Math.round(H * 0.17);
  const logoBuf = await sharp(LOGO_BUF).resize({ height: logoH }).png().toBuffer();
  const topBandH = logoH + topPad;

  // bloco direito: 3 linhas de contato
  const rowFont = Math.round(bandH * 0.165);
  const rowGap = Math.round(bandH * 0.085);
  const totalRowsH = rowFont * 3 + rowGap * 2;
  const ry = cy - totalRowsH / 2 + rowFont * 0.5;
  const rightEdge = W - pad;

  const badge = Math.round(rowFont * 1.32);
  const gloss = `<rect x="1" y="1" width="22" height="11" rx="5" fill="url(#gloss)"/>`;
  const innerShadow = `<rect x="1" y="13" width="22" height="10" rx="5" fill="#000" opacity="0.14"/>`;

  function brandBadge(type: "instagram" | "whatsapp" | "site", x: number, y: number) {
    const s = badge / 24;
    const open = `<g transform="translate(${x},${y}) scale(${s.toFixed(4)})" filter="url(#drop3d)">`;
    if (type === "instagram") {
      return `${open}
        <rect width="24" height="24" rx="6" fill="url(#igGrad)"/>
        ${innerShadow}${gloss}
        <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="5" fill="none" stroke="#fff" stroke-width="2"/>
        <circle cx="12" cy="12" r="4" fill="none" stroke="#fff" stroke-width="2"/>
        <circle cx="17.3" cy="6.7" r="1.3" fill="#fff"/>
      </g>`;
    }
    if (type === "whatsapp") {
      return `${open}
        <rect width="24" height="24" rx="6" fill="#25D366"/>
        ${innerShadow}${gloss}
        <g transform="translate(4.4,4.4) scale(0.633)"><path d="${WM_WHATSAPP_PATH}" fill="#fff"/></g>
      </g>`;
    }
    return `${open}
      <rect width="24" height="24" rx="6" fill="#2563eb"/>
      ${innerShadow}${gloss}
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="#fff" stroke-width="1.6"/>
      <ellipse cx="12" cy="12" rx="3" ry="7.2" fill="none" stroke="#fff" stroke-width="1.6"/>
      <line x1="4.9" y1="12" x2="19.1" y2="12" stroke="#fff" stroke-width="1.6"/>
      <path d="M6.4 8.2 H17.6 M6.4 15.8 H17.6" stroke="#fff" stroke-width="1.4" fill="none"/>
    </g>`;
  }

  function rowSvg(yBase: number, type: "instagram" | "whatsapp" | "site", text: string) {
    const approxW = text.length * rowFont * 0.62;
    const gap = Math.round(rowFont * 0.62);
    const iconX = rightEdge - approxW - badge - gap;
    const iconY = Math.round(yBase - rowFont * 0.8);
    return `${brandBadge(type, iconX, iconY)}<text x="${rightEdge}" y="${yBase}" text-anchor="end" font-family="Arial, sans-serif" font-weight="700" font-size="${rowFont}" fill="white">${esc(text)}</text>`;
  }

  const rows =
    rowSvg(Math.round(ry), "instagram", INSTAGRAM) +
    rowSvg(Math.round(ry + rowFont + rowGap), "whatsapp", WHATSAPP) +
    rowSvg(Math.round(ry + (rowFont + rowGap) * 2), "site", SITE);

  const overlay = `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0c1a3a" stop-opacity="0"/>
        <stop offset="55%" stop-color="#0c1a3a" stop-opacity="0.72"/>
        <stop offset="100%" stop-color="#0a1430" stop-opacity="0.9"/>
      </linearGradient>
      <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0a1430" stop-opacity="0.85"/>
        <stop offset="60%" stop-color="#0c1a3a" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#0c1a3a" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="igGrad" cx="30%" cy="107%" r="135%">
        <stop offset="0%" stop-color="#fdf497"/>
        <stop offset="8%" stop-color="#fdf497"/>
        <stop offset="33%" stop-color="#fd5949"/>
        <stop offset="55%" stop-color="#d6249f"/>
        <stop offset="80%" stop-color="#285AEB"/>
      </radialGradient>
      <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <filter id="drop3d" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="1.6" stdDeviation="1.6" flood-color="#000" flood-opacity="0.55"/>
      </filter>
    </defs>
    <rect x="0" y="0" width="${W}" height="${topBandH + Math.round(topBandH * 0.5)}" fill="url(#gt)"/>
    <rect x="0" y="${bandY - Math.round(bandH * 0.35)}" width="${W}" height="${bandH + Math.round(bandH * 0.35)}" fill="url(#g)"/>
    ${rows}
  </svg>`;

  return await sharp(normBuf)
    .composite([
      { input: Buffer.from(overlay), top: 0, left: 0 },
      { input: logoBuf, top: Math.round(topPad), left: Math.round(pad) },
    ])
    .jpeg({ quality: 86 })
    .toBuffer();
}
