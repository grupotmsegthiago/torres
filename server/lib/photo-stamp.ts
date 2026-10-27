import { createRequire } from "node:module";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { ROBOTO_REGULAR_B64 } from "./stamp-font.js";
import { LOGO_VIEW_H, LOGO_VIEW_W, logoMarkPng } from "./logo-torres-white.js";
import type TextToSVG from "text-to-svg";

/**
 * Carimbo institucional das fotos de campo (ronda, posto, ocorrência, abastecimento).
 * O bitmap gravado no storage já sai com logótipo e rodapé — o painel copia esse ficheiro.
 * Não altera a marca d'água do WhatsApp (photo-watermark.ts).
 * O logotipo é SVG branco vazado, sem placa. O rodapé é curva vetorial (Roboto embutida).
 * Fail-open: se o sharp falhar, a foto original segue.
 */

const SITE = "www.torresseguranca.com.br";
const PHONE = "(11) 96369-6699";
const INSTAGRAM = "@grupotorres.seguranca";

export const INSTITUTIONAL_FOOTER =
  `${SITE}  |  ${PHONE}  |  Instagram: ${INSTAGRAM}`;

const MAX_WIDTH = 1920;
const LOGO_WIDTH_RATIO = 0.135;
const PAD = 24;
/** O balão do WhatsApp mostra a foto deitada inteira e corta o topo e a base da foto em pé. */
const CHAT_PREVIEW_RATIO = 16 / 9;

/** Foto em pé vira um quadro 16:9 no miolo, para o logotipo e o rodapé caberem no balão. */
export async function frameForChatPreview(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const W = meta.width || 1;
  const H = meta.height || 1;
  if (H <= W) return input;
  const targetH = Math.max(1, Math.round(W / CHAT_PREVIEW_RATIO));
  const top = Math.max(0, Math.floor((H - targetH) / 2));
  const height = Math.min(targetH, H - top);
  return sharp(input).extract({ left: 0, top, width: W, height }).jpeg({ quality: 90 }).toBuffer();
}

const require = createRequire(import.meta.url);
const textToSvgModule = require("text-to-svg") as { default?: typeof TextToSVG; loadSync?: typeof TextToSVG.loadSync };

let textRenderer: TextToSVG | null = null;

function renderer(): TextToSVG {
  if (textRenderer) return textRenderer;
  const ctor = textToSvgModule.default ?? (textToSvgModule as unknown as typeof TextToSVG);
  const fontPath = join(tmpdir(), `torres-roboto-regular-${ROBOTO_REGULAR_B64.length}.ttf`);
  if (!existsSync(fontPath)) {
    writeFileSync(fontPath, Buffer.from(ROBOTO_REGULAR_B64, "base64"));
  }
  textRenderer = ctor.loadSync(fontPath);
  return textRenderer;
}

function footerHeight(width: number): number {
  if (width >= 1400) return 56;
  if (width >= 800) return 48;
  return 40;
}

/** Barra preta com o texto da Torres em curvas. Não usa <text> nem fonte do sistema. */
export function institutionalFooterSvg(width: number, barH: number): Buffer {
  const padX = Math.max(6, Math.round(width * 0.02));
  const maxW = Math.max(1, width - padX * 2);
  const draw = renderer();
  let fontSize = Math.max(8, Math.min(22, Math.floor(barH * 0.46)));
  let metrics = draw.getMetrics(INSTITUTIONAL_FOOTER, { fontSize, anchor: "left top" });
  while (metrics.width > maxW && fontSize > 6) {
    fontSize = Math.round((fontSize - 0.5) * 10) / 10;
    metrics = draw.getMetrics(INSTITUTIONAL_FOOTER, { fontSize, anchor: "left top" });
  }
  const scale = metrics.width > maxW ? maxW / metrics.width : 1;
  const drawW = metrics.width * scale;
  const drawH = metrics.height * scale;
  const x = (width - drawW) / 2;
  const y = Math.max(0, (barH - drawH) / 2);
  const path = draw.getPath(INSTITUTIONAL_FOOTER, {
    x: 0,
    y: 0,
    fontSize,
    anchor: "left top",
    attributes: { fill: "#ffffff" },
  });
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${barH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${barH}" fill="#000" fill-opacity="0.9"/>
  <g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(4)})">${path}</g>
</svg>`;
  return Buffer.from(svg, "utf-8");
}

export async function stampInstitutionalPhoto(input: Buffer): Promise<Buffer> {
  const normalized = await sharp(input)
    .rotate()
    .resize({ width: MAX_WIDTH, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  const base = await frameForChatPreview(normalized);
  const meta = await sharp(base).metadata();
  const W = meta.width || 1;
  const H = meta.height || 1;

  const pad = Math.max(2, Math.min(PAD, Math.floor(W / 10), Math.floor(H / 10)));
  const barH = Math.min(footerHeight(W), H);
  const logoRoomW = Math.max(1, W - pad * 2);
  const logoRoomH = Math.max(1, H - barH - pad - 4);
  let logoW = Math.min(Math.round(W * LOGO_WIDTH_RATIO), Math.round(W * 0.15), logoRoomW);
  logoW = Math.max(1, logoW);
  let logoH = Math.max(1, Math.round(logoW * LOGO_VIEW_H / LOGO_VIEW_W));
  if (logoH > logoRoomH) {
    logoH = Math.max(1, logoRoomH);
    logoW = Math.max(1, Math.min(logoRoomW, Math.round(logoH * LOGO_VIEW_W / LOGO_VIEW_H)));
  }
  if (logoW > W - pad) logoW = Math.max(1, W - pad);
  if (logoH > H - pad) logoH = Math.max(1, H - pad);

  const logoPng = await logoMarkPng(logoW, logoH);
  return sharp(base)
    .composite([
      { input: logoPng, top: pad, left: pad },
      { input: institutionalFooterSvg(W, barH), top: H - barH, left: 0 },
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
