import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { logoMarkPng } from "./logo-torres-white";
import { frameForChatPreview, INSTITUTIONAL_FOOTER, institutionalFooterSvg, PORTRAIT_CANVAS_H, PORTRAIT_CANVAS_W, portraitForegroundSize, stampInstitutionalDataUri, stampInstitutionalPhoto } from "./photo-stamp";

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

test("orientação EXIF é aplicada antes de decidir se a foto está em pé", async () => {
  const landscape = await sharp({
    create: { width: 120, height: 40, channels: 3, background: { r: 0, g: 120, b: 200 } },
  }).jpeg().toBuffer();
  const sideways = await sharp(landscape).withMetadata({ orientation: 6 }).toBuffer();
  const stored = await sharp(sideways).metadata();
  assert.ok((stored.width || 0) > (stored.height || 0), "a amostra EXIF precisa nascer deitada no arquivo");

  const out = await stampInstitutionalPhoto(sideways);
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, PORTRAIT_CANVAS_W);
  assert.equal(meta.height, PORTRAIT_CANVAS_H);
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  const cx = Math.floor(info.width / 2);
  const cy = Math.floor(info.height / 2);
  const i = (cy * info.width + cx) * info.channels;
  assert.ok(data[i + 2] > data[i] && data[i + 2] > 120, "a foto em pé marcada como deitada não foi endireitada");
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
  assert.equal(meta.width, PORTRAIT_CANVAS_W);
  assert.equal(meta.height, PORTRAIT_CANVAS_H);
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
  const corner = (2 * info.width + 2) * info.channels;
  assert.ok(data[corner] > 40, "o canto do logotipo ganhou uma placa preta");
});

test("foto em pé entra inteira no quadro 16:9, sem cortar topo e base", async () => {
  const width = 180;
  const height = 320;
  const bands = await sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 180, b: 40 } },
  })
    .composite([
      {
        input: await sharp({ create: { width, height: 40, channels: 3, background: { r: 220, g: 30, b: 30 } } }).png().toBuffer(),
        top: 0,
        left: 0,
      },
      {
        input: await sharp({ create: { width, height: 40, channels: 3, background: { r: 30, g: 70, b: 210 } } }).png().toBuffer(),
        top: height - 40,
        left: 0,
      },
    ])
    .jpeg()
    .toBuffer();

  const framed = await frameForChatPreview(bands);
  const meta = await sharp(framed).metadata();
  assert.equal(meta.width, PORTRAIT_CANVAS_W);
  assert.equal(meta.height, PORTRAIT_CANVAS_H);
  const expected = portraitForegroundSize(width, height);
  assert.equal(expected.height, PORTRAIT_CANVAS_H);
  assert.equal(expected.width, Math.round(width * PORTRAIT_CANVAS_H / height));

  const { data, info } = await sharp(framed).raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };
  const cx = Math.floor(info.width / 2);
  const top = at(cx, 8);
  const mid = at(cx, Math.floor(info.height / 2));
  const bottom = at(cx, info.height - 8);
  assert.ok(top.r > top.g && top.r > 140, `o topo da cena sumiu: ${top.r},${top.g},${top.b}`);
  assert.ok(mid.g > mid.r && mid.g > 100, `o miolo da cena sumiu: ${mid.r},${mid.g},${mid.b}`);
  assert.ok(bottom.b > bottom.r && bottom.b > 120, `a base da cena sumiu: ${bottom.r},${bottom.g},${bottom.b}`);

  const side = at(4, Math.floor(info.height / 2));
  assert.ok(side.g < mid.g, "a lateral não ficou atrás da foto nítida");
});

test("9:16 e 3:4 mudam só a largura da foto central e não esticam o quadro", async () => {
  assert.deepEqual(portraitForegroundSize(1080, 1920), { width: 608, height: 1080 });
  assert.equal(Math.round((PORTRAIT_CANVAS_W - 608) / 2), 656);
  assert.deepEqual(portraitForegroundSize(1080, 1440), { width: 810, height: 1080 });
  assert.notEqual(portraitForegroundSize(1080, 1920).width, portraitForegroundSize(1080, 1440).width);

  async function columnWidth(srcW: number, srcH: number) {
    const framed = await frameForChatPreview(await solidJpeg(srcW, srcH, { r: 210, g: 40, b: 30 }));
    const meta = await sharp(framed).metadata();
    assert.equal(meta.width, PORTRAIT_CANVAS_W);
    assert.equal(meta.height, PORTRAIT_CANVAS_H);
    const { data, info } = await sharp(framed).raw().toBuffer({ resolveWithObject: true });
    const y = Math.floor(info.height / 2);
    let left = info.width;
    let right = 0;
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] > 180 && data[i] > data[i + 2]) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    return { left, width: right - left + 1 };
  }

  const nineSixteen = await columnWidth(270, 480);
  const threeFour = await columnWidth(360, 480);
  assert.ok(Math.abs(nineSixteen.width - 608) <= 4, `9:16 ficou com ${nineSixteen.width}px`);
  assert.ok(Math.abs(nineSixteen.left - 656) <= 4, `pilar 9:16 em ${nineSixteen.left}px`);
  assert.ok(Math.abs(threeFour.width - 810) <= 4, `3:4 ficou com ${threeFour.width}px`);
  assert.ok(threeFour.width > nineSixteen.width, "3:4 foi esticado para a mesma largura de 9:16");
});

test("foto já deitada não ganha fundo nem quadro 16:9", async () => {
  const src = await solidJpeg(1000, 400, { r: 200, g: 40, b: 40 });
  const out = await stampInstitutionalPhoto(src);
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 1000);
  assert.equal(meta.height, 400);
  assert.ok(Math.abs((meta.width || 1) / (meta.height || 1) - 16 / 9) > 0.2);
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  const x = info.width - 30;
  const y = Math.floor(info.height / 2);
  const i = (y * info.width + x) * info.channels;
  assert.ok(data[i] > 160, "a lateral da foto deitada virou fundo desfocado");
});

test("logotipo do quadro em pé fica na lateral desfocada, fora da foto nítida", async () => {
  const beforeRss = process.memoryUsage().rss;
  const out = await stampInstitutionalPhoto(await solidJpeg(1080, 1920, { r: 30, g: 90, b: 200 }));
  const rssDelta = process.memoryUsage().rss - beforeRss;
  assert.ok(rssDelta < 200 * 1024 * 1024, `memória da montagem passou de 200 MB: ${rssDelta}`);
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };
  let white = 0;
  for (let y = 0; y < 300; y++) {
    for (let x = 0; x < 300; x++) {
      const p = (y * info.width + x) * info.channels;
      if (data[p] > 200 && data[p + 1] > 200 && data[p + 2] > 200) white++;
    }
  }
  assert.ok(white > 40, "o logotipo não ficou no canto do quadro");
  const pillar = at(320, 400);
  const photo = at(960, 400);
  assert.ok(photo.b > pillar.b + 30, "a lateral não está mais escura que a foto");
  assert.ok(photo.b > 140, "a foto nítida não ocupa o centro");
});

test("o png do logotipo é vazado", async () => {
  const png = await logoMarkPng(180, 228);
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  assert.ok(data[3] < 16, `canto do logotipo opaco: alpha ${data[3]}`);
});
