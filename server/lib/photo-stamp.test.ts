import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { INSTITUTIONAL_FOOTER, stampInstitutionalDataUri, stampInstitutionalPhoto } from "./photo-stamp";

async function solidJpeg(width: number, height: number, color: { r: number; g: number; b: number }) {
  return sharp({
    create: { width, height, channels: 3, background: color },
  }).jpeg().toBuffer();
}

test("carimbo limita a largura a 1920 e escurece o rodapé", async () => {
  const src = await solidJpeg(2400, 800, { r: 220, g: 30, b: 30 });
  const out = await stampInstitutionalPhoto(src);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, 1920);
  assert.equal(meta.height, 640);

  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };
  const footer = at(Math.floor(info.width / 2), info.height - 8);
  const middle = at(Math.floor(info.width / 2), Math.floor(info.height / 2));
  assert.ok(footer.r < 40 && footer.g < 40 && footer.b < 40, `rodapé claro: ${footer.r},${footer.g},${footer.b}`);
  assert.ok(middle.r > 150, "o miolo da foto foi coberto");
});

test("logótipo branco fica sobre placa escura no canto superior esquerdo", async () => {
  const src = await solidJpeg(1000, 700, { r: 240, g: 240, b: 240 });
  const out = await stampInstitutionalPhoto(src);
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  const i = (40 * info.width + 40) * info.channels;
  assert.ok(data[i] < 180, "canto superior esquerdo continuou claro demais para o logótipo branco");
});

test("orientação EXIF é aplicada antes do carimbo", async () => {
  const landscape = await sharp({
    create: { width: 120, height: 40, channels: 3, background: { r: 0, g: 120, b: 200 } },
  }).jpeg().toBuffer();
  const sideways = await sharp(landscape).withMetadata({ orientation: 6 }).toBuffer();
  const out = await stampInstitutionalPhoto(sideways);
  const meta = await sharp(out).metadata();
  assert.ok((meta.height || 0) > (meta.width || 0), `EXIF não virou a foto: ${meta.width}x${meta.height}`);
});

test("data URI vira JPEG carimbado e texto que não é imagem passa intacto", async () => {
  const src = await solidJpeg(800, 600, { r: 10, g: 80, b: 160 });
  const uri = `data:image/jpeg;base64,${src.toString("base64")}`;
  const stamped = await stampInstitutionalDataUri(uri);
  assert.match(stamped, /^data:image\/jpeg;base64,/);
  assert.notEqual(stamped, uri);
  assert.equal(await stampInstitutionalDataUri("ja-e-path/foto.jpg"), "ja-e-path/foto.jpg");
  assert.match(INSTITUTIONAL_FOOTER, /www\.grupotmseg\.com\.br/);
  assert.match(INSTITUTIONAL_FOOTER, /\(11\) 96369-6699/);
  assert.match(INSTITUTIONAL_FOOTER, /Instagram: @grupotmseg/);
});
