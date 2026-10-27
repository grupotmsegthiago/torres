import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { INSTITUTIONAL_FOOTER, institutionalFooterSvg, stampInstitutionalDataUri, stampInstitutionalPhoto } from "./photo-stamp";

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

test("logótipo branco fica vazado sobre a foto, sem placa", async () => {
  const src = await solidJpeg(1000, 700, { r: 30, g: 70, b: 160 });
  const out = await stampInstitutionalPhoto(src);
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  const corner = (2 * info.width + 2) * info.channels;
  assert.ok(data[corner + 2] > 120, "o canto ganhou uma placa escura");
  let white = 0;
  for (let y = 0; y < 220; y++) {
    for (let x = 0; x < 200; x++) {
      const p = (y * info.width + x) * info.channels;
      if (data[p] > 200 && data[p + 1] > 200 && data[p + 2] > 200) white++;
    }
  }
  assert.ok(white > 40, `o traço branco do logotipo não apareceu: ${white}`);
  const hole = (96 * info.width + 92) * info.channels;
  assert.ok(data[hole + 2] > 120, "o miolo do escudo cobriu a foto");
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
  assert.equal(
    INSTITUTIONAL_FOOTER,
    "www.torresseguranca.com.br  |  (11) 96369-6699  |  Instagram: @grupotorres.seguranca",
  );
  assert.doesNotMatch(INSTITUTIONAL_FOOTER, /grupotmseg/i);
});

test("rodapé vertical desenha o texto da Torres em curvas, sem fonte do sistema", async () => {
  const svg = institutionalFooterSvg(720, 40);
  const xml = svg.toString("utf-8");
  assert.match(xml, /encoding="UTF-8"/);
  assert.match(xml, /<path [^>]*fill="#ffffff"/);
  assert.doesNotMatch(xml, /<text[\s>]/);
  assert.doesNotMatch(xml, /grupotmseg/i);
  assert.doesNotMatch(xml, /Arial|Helvetica|DejaVu|sans-serif/);

  const src = await solidJpeg(720, 1280, { r: 235, g: 235, b: 235 });
  const out = await stampInstitutionalPhoto(src);
  const meta = await sharp(out).metadata();
  assert.ok((meta.height || 0) > (meta.width || 0));
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  const y = info.height - 20;
  let light = 0;
  for (let x = 8; x < info.width - 8; x += 2) {
    const i = (y * info.width + x) * info.channels;
    if (data[i] > 150 && data[i + 1] > 150 && data[i + 2] > 150) light++;
  }
  assert.ok(light > 12, `o rodapé não desenhou glifos claros: ${light}`);
  const edge = ((y * info.width) + 2) * info.channels;
  assert.ok(data[edge] < 80, "a barra não cobre a largura");
  const mid = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
  assert.ok(data[mid] > 200, "o miolo da foto vertical foi coberto");
});
