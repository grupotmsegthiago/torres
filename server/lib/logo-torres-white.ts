import sharp from "sharp";
import { LOGO_SITE_PNG_B64 } from "./logo-torres-site.js";

/**
 * Logotipo real do site www.torresseguranca.com.br.
 * O arquivo do site é preto no branco e a página só inverte na tela.
 * Aqui o desenho já sai branco e o fundo branco vira transparência.
 */
export const LOGO_VIEW_W = 740;
export const LOGO_VIEW_H = 755;

const LOGO_SITE_PNG = Buffer.from(LOGO_SITE_PNG_B64, "base64");

export async function logoMarkPng(width: number, height: number): Promise<Buffer> {
  return sharp(LOGO_SITE_PNG)
    .resize(Math.max(1, width), Math.max(1, height), { fit: "fill" })
    .ensureAlpha()
    .png()
    .toBuffer();
}
