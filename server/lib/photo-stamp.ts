import sharp from "sharp";
import { WM_LOGO_WHITE_B64 } from "./watermark-assets.js";

/**
 * Carimbo institucional das fotos de campo (ronda, posto, ocorrência, abastecimento).
 * O bitmap gravado no storage já sai com logótipo e rodapé — o painel copia esse ficheiro.
 * Não altera a marca d'água do WhatsApp (photo-watermark.ts).
 * Fail-open: se o sharp falhar, a foto original segue.
 */

const SITE = "www.grupotmseg.com.br";
const PHONE = "(11) 96369-6699";
const INSTAGRAM = "@grupotmseg";

export const INSTITUTIONAL_FOOTER =
  `${SITE}  |  ${PHONE}  |  Instagram: ${INSTAGRAM}`;

const MAX_WIDTH = 1920;
const LOGO_WIDTH_RATIO = 0.135;
const PAD = 24;
const LOGO_BUF = Buffer.from(WM_LOGO_WHITE_B64, "base64");

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function footerHeight(width: number): number {
  if (width >= 1400) return 56;
  if (width >= 800) return 48;
  return 40;
}

export async function stampInstitutionalPhoto(input: Buffer): Promise<Buffer> {
  const base = await sharp(input)
    .rotate()
    .resize({ width: MAX_WIDTH, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  const meta = await sharp(base).metadata();
  const W = meta.width || 1;
  const H = meta.height || 1;

  const pad = Math.max(2, Math.min(PAD, Math.floor(W / 10), Math.floor(H / 10)));
  const barH = Math.min(footerHeight(W), H);
  const logoRoomW = Math.max(1, W - pad * 2);
  const logoRoomH = Math.max(1, H - barH - pad - 4);
  let logoW = Math.min(Math.round(W * LOGO_WIDTH_RATIO), Math.round(W * 0.15), logoRoomW);
  logoW = Math.max(1, logoW);
  let logoBuf = await sharp(LOGO_BUF).resize({ width: logoW }).png().toBuffer();
  let logoMeta = await sharp(logoBuf).metadata();
  let logoH = logoMeta.height || Math.round(logoW * 0.6);
  if (logoH > logoRoomH) {
    logoBuf = await sharp(LOGO_BUF).resize({ height: Math.max(1, logoRoomH) }).png().toBuffer();
    logoMeta = await sharp(logoBuf).metadata();
    logoH = logoMeta.height || logoRoomH;
    logoW = logoMeta.width || logoW;
  }
  if (logoW > W - pad || logoH > H - pad) {
    logoBuf = await sharp(logoBuf).resize({
      width: Math.max(1, W - pad),
      height: Math.max(1, H - barH - pad),
      fit: "inside",
    }).png().toBuffer();
    logoMeta = await sharp(logoBuf).metadata();
    logoW = logoMeta.width || logoW;
    logoH = logoMeta.height || logoH;
  }
  const font = Math.max(11, Math.min(22, Math.floor((W - 32) / (INSTITUTIONAL_FOOTER.length * 0.56))));
  const textY = Math.round(barH / 2 + font * 0.35);

  const plate = `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${Math.max(0, pad - 8)}" y="${Math.max(0, pad - 8)}" width="${Math.min(logoW + 16, W)}" height="${Math.min(logoH + 16, H)}" rx="8" fill="#000" fill-opacity="0.45"/>
  </svg>`;

  const footer = `
  <svg width="${W}" height="${barH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${barH}" fill="#000" fill-opacity="0.9"/>
    <text x="${Math.round(W / 2)}" y="${textY}" text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif" font-weight="600" font-size="${font}" fill="#ffffff">${esc(INSTITUTIONAL_FOOTER)}</text>
  </svg>`;

  return sharp(base)
    .composite([
      { input: Buffer.from(plate), top: 0, left: 0 },
      { input: logoBuf, top: pad, left: pad },
      { input: Buffer.from(footer), top: H - barH, left: 0 },
    ])
    .jpeg({ quality: 86 })
    .toBuffer();
}

/** Devolve data URI JPEG carimbado. Valor que não é imagem volta igual. */
export async function stampInstitutionalDataUri(value: string): Promise<string> {
  if (!value || typeof value !== "string" || !value.startsWith("data:image/")) return value;
  const comma = value.indexOf(",");
  if (comma < 0) return value;
  try {
    const input = Buffer.from(value.slice(comma + 1), "base64");
    if (!input.length) return value;
    const stamped = await stampInstitutionalPhoto(input);
    return `data:image/jpeg;base64,${stamped.toString("base64")}`;
  } catch (e: any) {
    console.warn("[photo-stamp] falhou, foto original segue:", e?.message);
    return value;
  }
}
