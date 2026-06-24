import jsPDF from "jspdf";
import imgTeamPath from "@assets/WhatsApp_Image_2026-03-02_at_14.36.36_1772473176101.jpeg";
import imgGuardRadioPath from "@assets/WhatsApp_Image_2026-03-02_at_14.38.49_1772473176101.jpeg";
import imgEscortRoadPath from "@assets/WhatsApp_Image_2026-03-02_at_14.36.36_(2)_1772473176100.jpeg";
import imgVehiclePath from "@assets/WhatsApp_Image_2026-03-02_at_14.36.36_(3)_1772473176100.jpeg";
import imgGuardVehiclePath from "@assets/WhatsApp_Image_2026-03-02_at_14.36.36_(1)_1772473176101.jpeg";
import imgMonitoramentoPath from "@assets/WhatsApp_Image_2026-03-02_at_14.53.45_1772474055275.jpeg";
import logoPath from "@assets/WhatsApp_Image_2026-03-19_at_18.10.37_1773954659471.jpeg";

const W = 297;
const H = 210;
const DARK = "#0a0a0a";
const DARK2 = "#111111";
const DARK3 = "#1a1a1a";
const WHITE = "#ffffff";
const GRAY = "#9ca3af";
const MED_GRAY = "#6b7280";
const LIGHT_GRAY = "#e5e7eb";
const ACCENT = "#c0392b";
const ACCENT_DARK = "#922b21";
const SOFT_BG = "#f7f7f8";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function coverFitToBase64(img: HTMLImageElement, targetW: number, targetH: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d")!;
  const srcR = img.naturalWidth / img.naturalHeight;
  const dstR = targetW / targetH;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (srcR > dstR) {
    sw = img.naturalHeight * dstR;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / dstR;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function logoToBase64Inverted(img: HTMLImageElement, size: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const srcR = img.naturalWidth / img.naturalHeight;
  let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
  if (srcR > 1) { sw = sh; sx = (img.naturalWidth - sw) / 2; }
  else { sh = sw; sy = (img.naturalHeight - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
  ctx.globalCompositeOperation = "difference";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  return canvas.toDataURL("image/png");
}

function gState(doc: jsPDF, opacity: number) {
  return new (doc as any).GState({ opacity });
}

function curvedShape(doc: jsPDF, x: number, y: number, w: number, h: number, color: string, opacity = 1) {
  if (opacity < 1) doc.setGState(gState(doc, opacity));
  doc.setFillColor(color);
  doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, "F");
  if (opacity < 1) doc.setGState(gState(doc, 1));
}

function gradientOverlay(doc: jsPDF, x: number, y: number, w: number, h: number, direction: "bottom" | "right" | "top" = "bottom", baseColor = DARK) {
  const steps = 30;
  const stepH = direction === "right" ? w / steps : h / steps;
  for (let i = 0; i < steps; i++) {
    const alpha = direction === "top" ? (1 - i / steps) * 0.9 : (i / steps) * 0.9;
    doc.setGState(gState(doc, alpha));
    doc.setFillColor(baseColor);
    if (direction === "right") {
      doc.rect(x + i * stepH, y, stepH + 0.5, h, "F");
    } else if (direction === "top") {
      doc.rect(x, y + i * stepH, w, stepH + 0.5, "F");
    } else {
      doc.rect(x, y + i * stepH, w, stepH + 0.5, "F");
    }
  }
  doc.setGState(gState(doc, 1));
}

function accentLine(doc: jsPDF, x: number, y: number, len: number) {
  doc.setDrawColor(ACCENT);
  doc.setLineWidth(2);
  doc.line(x, y, x + len, y);
}

function footer(doc: jsPDF, page: number, style: "dark" | "light" = "dark") {
  const bgColor = style === "dark" ? DARK : "#e8e8e8";
  const textColor = style === "dark" ? "#555555" : "#888888";
  doc.setFillColor(bgColor);
  doc.rect(0, H - 6, W, 6, "F");
  doc.setFontSize(5.5);
  doc.setTextColor(textColor);
  doc.setFont("helvetica", "normal");
  doc.text("TORRES VIGILÂNCIA PATRIMONIAL  •  CNPJ 36.982.392/0001-89  •  www.torresseguranca.com.br  •  comercial@torresseguranca.com.br", W / 2, H - 2, { align: "center" });
  doc.setFontSize(6);
  doc.text(String(page).padStart(2, "0"), W - 12, H - 2);
}

function sectionLabel(doc: jsPDF, y: number) {
  doc.setFontSize(7);
  doc.setTextColor(ACCENT);
  doc.setFont("helvetica", "bold");
  doc.text("TORRES VIGILÂNCIA PATRIMONIAL", 28, y);
}

function sectionTitle(doc: jsPDF, title: string, y: number, color = DARK) {
  doc.setFontSize(24);
  doc.setTextColor(color);
  doc.setFont("helvetica", "bold");
  doc.text(title, 28, y);
  accentLine(doc, 28, y + 3, 45);
}

function bulletItem(doc: jsPDF, text: string, x: number, y: number, fontSize = 9.5) {
  doc.setFillColor(ACCENT);
  doc.circle(x + 2, y - 1.2, 1.8, "F");
  doc.setFontSize(fontSize);
  doc.setTextColor(DARK);
  doc.setFont("helvetica", "normal");
  doc.text(text, x + 8, y);
}

function featureCard(doc: jsPDF, title: string, desc: string, x: number, y: number, w: number, h: number) {
  doc.setFillColor(WHITE);
  doc.roundedRect(x, y, w, h, 3, 3, "F");

  doc.setGState(gState(doc, 0.08));
  doc.setFillColor("#000000");
  doc.roundedRect(x + 1, y + 1, w, h, 3, 3, "F");
  doc.setGState(gState(doc, 1));

  doc.setFillColor(WHITE);
  doc.roundedRect(x, y, w, h, 3, 3, "F");
  doc.setDrawColor("#e0e0e0");
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, 3, 3, "S");

  doc.setFillColor(ACCENT);
  doc.roundedRect(x, y, 3, h, 1.5, 0, "F");

  doc.setFontSize(9.5);
  doc.setTextColor(DARK);
  doc.setFont("helvetica", "bold");
  doc.text(title, x + 10, y + 11);

  doc.setFontSize(7);
  doc.setTextColor(MED_GRAY);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(desc, w - 16);
  doc.text(lines, x + 10, y + 19);
}

function statBox(doc: jsPDF, value: string, label: string, x: number, y: number) {
  doc.setFillColor(DARK3);
  doc.roundedRect(x, y, 56, 30, 3, 3, "F");

  doc.setFontSize(20);
  doc.setTextColor(ACCENT);
  doc.setFont("helvetica", "bold");
  doc.text(value, x + 28, y + 14, { align: "center" });

  doc.setFontSize(6.5);
  doc.setTextColor(GRAY);
  doc.setFont("helvetica", "normal");
  doc.text(label, x + 28, y + 23, { align: "center" });
}

export interface ProposalRoute {
  origin: string;
  destination: string;
  franquia_km: number;
  franquia_horas: number;
  valor_km_extra: number;
  valor_hora_extra: number;
  valor_acionamento: number;
}

export interface ProposalOptions {
  routes?: ProposalRoute[];
  vehiclePhotos?: string[];
}

function brl(n: number): string {
  return "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function intBR(n: number): string {
  return (Number(n) || 0).toLocaleString("pt-BR");
}

async function loadViaturaB64s(urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const u of urls.slice(0, 6)) {
    try {
      const img = await loadImage(u);
      out.push(coverFitToBase64(img, 800, 600));
    } catch {
      // ignora foto inválida — não trava a proposta
    }
  }
  return out;
}

// Página "Nossas Viaturas" — grade com fotos reais da frota (cadastro de veículos).
function drawViaturasPage(doc: jsPDF, photos: string[], pageNum: number) {
  doc.addPage();
  doc.setFillColor(SOFT_BG);
  doc.rect(0, 0, W, H, "F");

  curvedShape(doc, 170, 110, 200, 150, ACCENT, 0.04);

  doc.setFillColor(ACCENT);
  doc.rect(0, 0, W, 3, "F");
  footer(doc, pageNum, "light");

  sectionLabel(doc, 18);
  sectionTitle(doc, "Nossas Viaturas", 32);

  doc.setFontSize(9.5);
  doc.setTextColor(MED_GRAY);
  doc.setFont("helvetica", "normal");
  doc.text("Frota própria identificada e equipada para operações de escolta armada.", 28, 46);

  const gx = 28, gy = 54, gw = 78, gh = 58, gapX = 7, gapY = 8;
  photos.slice(0, 6).forEach((p, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = gx + col * (gw + gapX);
    const y = gy + row * (gh + gapY);
    doc.setFillColor(WHITE);
    doc.roundedRect(x, y, gw, gh, 3, 3, "F");
    doc.addImage(p, "JPEG", x + 2, y + 2, gw - 4, gh - 4);
    doc.setDrawColor(ACCENT);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, y, gw, gh, 3, 3, "S");
  });
}

// Página "Rotas & Franquias" — replica EXATA do modelo aprovado pelo dono
// (monocromático preto/branco). ACIONAMENTO = km da rota × valor do km da tabela.
function drawPriceTablePage(doc: jsPDF, routes: ProposalRoute[], logoB64: string, pageNum: number) {
  doc.addPage();
  doc.setFillColor(SOFT_BG);
  doc.rect(0, 0, W, H, "F");
  footer(doc, pageNum, "light");

  const cardX = 16, cardY = 14, cardW = 265, cardH = 178;
  doc.setFillColor(WHITE);
  doc.roundedRect(cardX, cardY, cardW, cardH, 4, 4, "F");
  doc.setDrawColor("#e5e7eb");
  doc.setLineWidth(0.4);
  doc.roundedRect(cardX, cardY, cardW, cardH, 4, 4, "S");

  // Cabeçalho: logo + TORRES | ROTAS & FRANQUIAS
  doc.addImage(logoB64, "JPEG", cardX + 10, cardY + 7, 15, 15);
  doc.setFontSize(14);
  doc.setTextColor(DARK);
  doc.setFont("helvetica", "bold");
  doc.text("TORRES", cardX + 29, cardY + 15);
  doc.setFontSize(5.5);
  doc.setTextColor(MED_GRAY);
  doc.setFont("helvetica", "bold");
  doc.text("VIGILÂNCIA PATRIMONIAL", cardX + 29, cardY + 19.5);

  doc.setDrawColor("#d1d5db");
  doc.setLineWidth(0.5);
  doc.line(cardX + 70, cardY + 7, cardX + 70, cardY + 22);

  doc.setFontSize(14);
  doc.setTextColor(DARK);
  doc.setFont("helvetica", "bold");
  doc.text("ROTAS & FRANQUIAS", cardX + 76, cardY + 14);
  doc.setFontSize(6);
  doc.setTextColor(MED_GRAY);
  doc.setFont("helvetica", "normal");
  doc.text("GRUPO TORRES ESCOLTA ARMADA", cardX + 76, cardY + 19.5);

  // Barra preta — título da prestação
  const barY = cardY + 28, barH = 8;
  doc.setFillColor(DARK);
  doc.rect(cardX + 6, barY, cardW - 12, barH, "F");
  doc.setFontSize(8);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("PRESTAÇÃO DE SERVIÇO DE ESCOLTA ARMADA", W / 2, barY + 5.4, { align: "center" });

  const tableX = cardX + 6, tableW = cardW - 12;
  const cols = [
    { label: "ORIGEM", w: 0.155, left: true },
    { label: "DESTINO", w: 0.175, left: true },
    { label: "KM FRANQUIA", w: 0.125, left: false },
    { label: "HORA FRANQUIA", w: 0.135, left: false },
    { label: "KM EXCEDENTE", w: 0.13, left: false },
    { label: "HR EXCEDENTE", w: 0.13, left: false },
    { label: "ACIONAMENTO", w: 0.15, left: false },
  ];
  const colX: number[] = [];
  const colW: number[] = [];
  let cx = tableX;
  cols.forEach(c => { colX.push(cx); colW.push(c.w * tableW); cx += c.w * tableW; });

  // Cabeçalho da tabela (preto)
  const headY = barY + barH + 2, headH = 9;
  doc.setFillColor(DARK2);
  doc.rect(tableX, headY, tableW, headH, "F");
  doc.setFontSize(6);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  cols.forEach((c, i) => {
    const tx = c.left ? colX[i] + 3 : colX[i] + colW[i] / 2;
    doc.text(c.label, tx, headY + 5.7, { align: c.left ? "left" : "center" });
  });

  // Linhas
  let ry = headY + headH;
  const bottomLimit = cardY + cardH - 24;
  const rowH = Math.max(8, Math.min(12, (bottomLimit - ry) / Math.max(routes.length, 1)));
  routes.forEach((r, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor("#f3f4f6");
      doc.rect(tableX, ry, tableW, rowH, "F");
    }
    const ty = ry + rowH / 2 + 2;
    const acion = (Number(r.valor_acionamento) || 0) || ((Number(r.franquia_km) || 0) * (Number(r.valor_km_extra) || 0));
    const vals = [
      r.origin || "—",
      r.destination || "—",
      intBR(r.franquia_km),
      intBR(r.franquia_horas),
      brl(r.valor_km_extra),
      brl(r.valor_hora_extra),
      brl(acion),
    ];
    cols.forEach((c, i) => {
      const tx = c.left ? colX[i] + 3 : colX[i] + colW[i] / 2;
      let v = vals[i];
      if (c.left) v = (doc.splitTextToSize(v, colW[i] - 5)[0] || v);
      doc.setFontSize(6.4);
      doc.setTextColor(DARK);
      doc.setFont("helvetica", i === cols.length - 1 ? "bold" : "normal");
      doc.text(v, tx, ty, { align: c.left ? "left" : "center" });
    });
    doc.setDrawColor("#e5e7eb");
    doc.setLineWidth(0.2);
    doc.line(tableX, ry + rowH, tableX + tableW, ry + rowH);
    ry += rowH;
  });

  // Nota PEDÁGIO À PARTE
  doc.setFontSize(7);
  doc.setTextColor(DARK);
  doc.setFont("helvetica", "bold");
  doc.text("PEDÁGIO À PARTE", W / 2, ry + 7, { align: "center" });

  // Rodapé preto do card (igual ao modelo)
  const fY = cardY + cardH - 11;
  doc.setFillColor(DARK);
  doc.rect(cardX + 6, fY, cardW - 12, 8, "F");
  doc.addImage(logoB64, "JPEG", cardX + 9, fY + 1.4, 5.2, 5.2);
  doc.setFontSize(5.5);
  doc.setTextColor("#cfcfcf");
  doc.setFont("helvetica", "bold");
  doc.text("SEGURANÇA QUE PROTEGE. CONFIANÇA QUE CONDUZ.", cardX + 17, fY + 5, { align: "left" });
  // faixa diagonal clara no canto inferior direito (monocromática, como no modelo)
  doc.setFillColor("#3a3a3a");
  doc.triangle(cardX + cardW - 6 - 16, fY + 8, cardX + cardW - 6, fY + 8, cardX + cardW - 6, fY, "F");
  doc.setFillColor("#5a5a5a");
  doc.triangle(cardX + cardW - 6 - 9, fY + 8, cardX + cardW - 6, fY + 8, cardX + cardW - 6, fY + 2, "F");
}

export async function generatePresentation(clientName: string, opts: ProposalOptions = {}) {
  const [imgTeam, imgGuardRadio, imgEscortRoad, imgVehicle, imgGuardVehicle, imgMonitoramento, logoRaw] = await Promise.all([
    loadImage(imgTeamPath),
    loadImage(imgGuardRadioPath),
    loadImage(imgEscortRoadPath),
    loadImage(imgVehiclePath),
    loadImage(imgGuardVehiclePath),
    loadImage(imgMonitoramentoPath),
    loadImage(logoPath),
  ]);

  const teamB64 = coverFitToBase64(imgTeam, 1200, 800);
  const guardRadioB64 = coverFitToBase64(imgGuardRadio, 800, 1000);
  const escortRoadB64 = coverFitToBase64(imgEscortRoad, 1200, 800);
  const vehicleB64 = coverFitToBase64(imgVehicle, 800, 600);
  const guardVehicleB64 = coverFitToBase64(imgGuardVehicle, 800, 600);
  const monitoramentoB64 = coverFitToBase64(imgMonitoramento, 1200, 600);
  const logoInvB64 = logoToBase64Inverted(logoRaw, 600);
  const logoOrigB64 = coverFitToBase64(logoRaw, 600, 600);

  const viaturaB64s = opts.vehiclePhotos?.length ? await loadViaturaB64s(opts.vehiclePhotos) : [];
  const frotaImg1 = viaturaB64s[0] || vehicleB64;
  const frotaImg2 = viaturaB64s[1] || guardVehicleB64;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // ====================================================================
  //  SLIDE 1 — CAPA
  // ====================================================================
  doc.setFillColor(DARK);
  doc.rect(0, 0, W, H, "F");

  doc.addImage(teamB64, "JPEG", 110, 0, 187, 210);
  gradientOverlay(doc, 110, 0, 187, 210, "right", DARK);

  curvedShape(doc, 200, -60, 260, 180, ACCENT, 0.06);
  curvedShape(doc, 220, 140, 200, 160, ACCENT, 0.04);

  doc.setFillColor(ACCENT);
  doc.rect(0, 0, W, 4, "F");
  doc.rect(0, H - 3, W, 3, "F");

  doc.setGState(gState(doc, 0.06));
  doc.addImage(logoInvB64, "PNG", 155, 30, 120, 120);
  doc.setGState(gState(doc, 1));

  doc.addImage(logoOrigB64, "JPEG", 24, 20, 28, 28);

  doc.setFontSize(7.5);
  doc.setTextColor(GRAY);
  doc.setFont("helvetica", "bold");
  doc.text("TORRES VIGILÂNCIA PATRIMONIAL", 58, 36);

  doc.setFontSize(42);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("Apresentação", 24, 78);
  doc.setFontSize(42);
  doc.text("Comercial", 24, 94);

  accentLine(doc, 24, 100, 60);

  doc.setFontSize(11);
  doc.setTextColor(GRAY);
  doc.setFont("helvetica", "normal");
  doc.text("Preparada exclusivamente para:", 24, 115);

  doc.setFontSize(17);
  doc.setTextColor(ACCENT);
  doc.setFont("helvetica", "bold");
  const cLines = doc.splitTextToSize(clientName.toUpperCase(), 120);
  doc.text(cLines, 24, 127);

  const today = new Date();
  const dateStr = today.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  doc.setFontSize(8);
  doc.setTextColor("#555555");
  doc.setFont("helvetica", "normal");
  doc.text(dateStr, 24, 190);
  doc.text("CNPJ 36.982.392/0001-89", 24, 196);

  doc.setFontSize(10);
  doc.setTextColor("#777777");
  doc.setFont("helvetica", "italic");
  doc.text('"Segurança não é custo. É estratégia."', 24, 180);

  // ====================================================================
  //  SLIDE 2 — QUEM SOMOS
  // ====================================================================
  doc.addPage();
  doc.setFillColor(DARK);
  doc.rect(0, 0, W, H, "F");

  doc.addImage(guardVehicleB64, "JPEG", 170, 15, 115, 85);
  doc.setGState(gState(doc, 0.3));
  doc.setFillColor(DARK);
  doc.rect(170, 15, 115, 85, "F");
  doc.setGState(gState(doc, 1));

  doc.setDrawColor(ACCENT);
  doc.setLineWidth(1.5);
  doc.rect(170, 15, 115, 85, "S");

  curvedShape(doc, -40, 130, 200, 120, ACCENT, 0.05);

  doc.setFillColor(ACCENT);
  doc.rect(0, 0, W, 3, "F");
  footer(doc, 2, "dark");

  sectionLabel(doc, 22);
  doc.setFontSize(24);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("Quem Somos", 28, 38);
  accentLine(doc, 28, 42, 45);

  doc.setFontSize(9.5);
  doc.setTextColor("#c0c0c0");
  doc.setFont("helvetica", "normal");

  const qs1 = doc.splitTextToSize(
    "A TORRES Vigilância Patrimonial é uma empresa especializada em soluções estratégicas de segurança, atuando com excelência em Escolta Armada, Segurança Patrimonial e Central de Monitoramento.",
    135
  );
  doc.text(qs1, 28, 54);

  const qs2 = doc.splitTextToSize(
    "Estruturada por profissionais com ampla experiência no setor de segurança privada, a empresa carrega bagagem sólida de vivência prática, conhecimento operacional e entendimento real dos desafios do mercado.",
    135
  );
  doc.text(qs2, 28, 72);

  const qs3 = doc.splitTextToSize(
    "Seu grande diferencial está na agilidade na tomada de decisão, tempo de resposta reduzido e capacidade de ação imediata — garantindo maior segurança, previsibilidade e confiança para seus parceiros.",
    135
  );
  doc.text(qs3, 28, 92);

  doc.setFillColor(DARK3);
  doc.roundedRect(28, 115, 240, 24, 4, 4, "F");
  doc.setFillColor(ACCENT);
  doc.roundedRect(28, 115, 4, 24, 2, 0, "F");
  doc.setFontSize(10);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "italic");
  const missionText = doc.splitTextToSize(
    "Nosso compromisso é proteger cargas, patrimônios e operações logísticas com alto nível de eficiência, gestão e tecnologia de ponta.",
    222
  );
  doc.text(missionText, 40, 128);

  statBox(doc, "24h", "Monitoramento", 28, 150);
  statBox(doc, "100%", "Operações Supervisionadas", 92, 150);
  statBox(doc, "PF", "Autorizada Polícia Federal", 156, 150);
  statBox(doc, "360°", "Cobertura Integrada", 220, 150);

  // ====================================================================
  //  SLIDE 3 — DIFERENCIAIS
  // ====================================================================
  doc.addPage();
  doc.setFillColor(SOFT_BG);
  doc.rect(0, 0, W, H, "F");

  curvedShape(doc, 200, -30, 220, 160, ACCENT, 0.04);
  curvedShape(doc, -60, 120, 200, 140, "#000000", 0.03);

  doc.setFillColor(ACCENT);
  doc.rect(0, 0, W, 3, "F");
  footer(doc, 3, "light");

  sectionLabel(doc, 18);
  sectionTitle(doc, "Diferenciais Operacionais", 32);

  doc.setGState(gState(doc, 0.04));
  doc.addImage(logoOrigB64, "JPEG", 200, 60, 90, 90);
  doc.setGState(gState(doc, 1));

  const diffs = [
    { t: "Gestão Centralizada", d: "Controle total de operações com sistema próprio de monitoramento e gestão de equipes em tempo real." },
    { t: "Tecnologia Integrada", d: "Integração com plataformas ONIXSAT, COBLI e SMARTSAMPA para rastreamento e controle operacional." },
    { t: "Resposta Imediata", d: "Agilidade na tomada de decisão e tempo de resposta reduzido para situações críticas." },
    { t: "Processo Seletivo Rigoroso", d: "Recrutamento criterioso com treinamento contínuo e avaliação permanente da equipe." },
    { t: "Padrão Operacional Elevado", d: "Uniformes padronizados, postura profissional e protocolos operacionais rígidos." },
    { t: "Expansão Estratégica", d: "Crescimento planejado focado em segmentos de alto valor com excelência operacional." },
  ];

  const cW = 80;
  const cG = 7;
  const cH = 34;
  diffs.forEach((item, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    featureCard(doc, item.t, item.d, 28 + col * (cW + cG), 48 + row * (cH + 8), cW, cH);
  });

  doc.setFillColor(DARK);
  doc.roundedRect(28, 148, 241, 24, 4, 4, "F");
  doc.setFillColor(ACCENT);
  doc.roundedRect(28, 148, 4, 24, 2, 0, "F");
  doc.setFontSize(9.5);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "italic");
  doc.text("Segurança com inteligência, operação com controle e compromisso com resultados.", 42, 162);

  // ====================================================================
  //  SLIDE 4 — ESCOLTA ARMADA
  // ====================================================================
  doc.addPage();
  doc.setFillColor(DARK);
  doc.rect(0, 0, W, H, "F");

  doc.addImage(escortRoadB64, "JPEG", 0, 0, W, H);
  gradientOverlay(doc, 0, 0, W, H, "right", DARK);

  doc.setGState(gState(doc, 0.45));
  doc.setFillColor(DARK);
  doc.rect(0, 0, W, H, "F");
  doc.setGState(gState(doc, 1));

  curvedShape(doc, 180, 20, 200, 180, ACCENT, 0.06);

  doc.setFillColor(ACCENT);
  doc.rect(0, 0, W, 3, "F");
  footer(doc, 4);

  sectionLabel(doc, 18);
  doc.setFontSize(24);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("Escolta Armada", 28, 34);
  accentLine(doc, 28, 38, 45);

  doc.setFillColor(DARK3);
  doc.setGState(gState(doc, 0.9));
  doc.roundedRect(28, 48, 128, 96, 4, 4, "F");
  doc.setGState(gState(doc, 1));
  doc.setDrawColor(ACCENT);
  doc.setLineWidth(0.5);
  doc.roundedRect(28, 48, 128, 96, 4, 4, "S");

  doc.setFontSize(8);
  doc.setTextColor(ACCENT);
  doc.setFont("helvetica", "bold");
  doc.text("HOMOLOGAÇÃO POLÍCIA FEDERAL", 36, 60);
  doc.setFontSize(7);
  doc.setTextColor(GRAY);
  doc.setFont("helvetica", "normal");
  doc.text("ALVARÁ Nº 3.098, DE 28 DE MAIO DE 2025", 36, 68);
  doc.text("Nº 1293/2025 — DREX/SR/PF", 36, 74);

  accentLine(doc, 36, 78, 30);

  const escBullets = [
    "Escolta de cargas de alto valor",
    "Operações urbanas e rodoviárias",
    "Monitoramento em tempo real",
    "Relatórios operacionais detalhados",
    "Comunicação direta com central 24h",
  ];
  escBullets.forEach((b, i) => {
    doc.setFillColor(ACCENT);
    doc.circle(38, 87 + i * 10 - 1, 1.5, "F");
    doc.setFontSize(9);
    doc.setTextColor("#d0d0d0");
    doc.setFont("helvetica", "normal");
    doc.text(b, 44, 87 + i * 10);
  });

  doc.setFillColor(DARK3);
  doc.setGState(gState(doc, 0.88));
  doc.roundedRect(170, 48, 100, 96, 4, 4, "F");
  doc.setGState(gState(doc, 1));

  doc.setFontSize(11);
  doc.setTextColor(ACCENT);
  doc.setFont("helvetica", "bold");
  doc.text("SEGURANÇA +", 180, 62);
  doc.text("LOGÍSTICA", 180, 72);

  doc.setFontSize(8);
  doc.setTextColor("#b0b0b0");
  doc.setFont("helvetica", "normal");
  const escTxt = doc.splitTextToSize(
    "Na TORRES, segurança e logística caminham juntas. A segurança impacta diretamente o resultado logístico, o tempo de operação influencia o risco e a comunicação falha gera vulnerabilidade.",
    85
  );
  doc.text(escTxt, 180, 82);

  doc.setFontSize(8.5);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "italic");
  doc.text("Nossa atuação é integrada à", 180, 120);
  doc.text("realidade da operação logística.", 180, 127);

  doc.setFillColor(DARK3);
  doc.roundedRect(28, 152, 242, 22, 4, 4, "F");
  doc.setFillColor(ACCENT);
  doc.roundedRect(28, 152, 4, 22, 2, 0, "F");
  doc.setFontSize(11);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("Proteção com inteligência. Operação com controle.", 42, 164);
  doc.setFontSize(8);
  doc.setTextColor(GRAY);
  doc.setFont("helvetica", "normal");
  doc.text("Resultado com estratégia.", 42, 170);

  // ====================================================================
  //  SLIDE 5 — SEGURANÇA PATRIMONIAL
  // ====================================================================
  doc.addPage();
  doc.setFillColor(SOFT_BG);
  doc.rect(0, 0, W, H, "F");

  doc.addImage(guardRadioB64, "JPEG", 190, 0, 107, 145);
  gradientOverlay(doc, 190, 0, 107, 145, "right", SOFT_BG);
  doc.setGState(gState(doc, 0.2));
  doc.setFillColor(SOFT_BG);
  doc.rect(190, 0, 107, 145, "F");
  doc.setGState(gState(doc, 1));

  curvedShape(doc, 160, -20, 180, 180, ACCENT, 0.04);

  doc.setFillColor(ACCENT);
  doc.rect(0, 0, W, 3, "F");
  footer(doc, 5, "light");

  sectionLabel(doc, 18);
  sectionTitle(doc, "Segurança Patrimonial", 32);

  doc.setFontSize(9.5);
  doc.setTextColor(MED_GRAY);
  doc.setFont("helvetica", "normal");
  doc.text("Proteção completa e adaptada às necessidades da sua operação.", 28, 48);

  const spItems = [
    { t: "Vigilância Armada e Desarmada", d: "Profissionais qualificados e equipados para proteção efetiva do seu patrimônio." },
    { t: "Controle de Acesso", d: "Gestão rigorosa de entrada e saída de pessoas e veículos com registro completo." },
    { t: "Segurança Condominial", d: "Proteção especializada para condomínios residenciais e comerciais." },
    { t: "Segurança Empresarial", d: "Soluções personalizadas para ambiente corporativo com foco em prevenção." },
    { t: "Postos Fixos Estratégicos", d: "Posicionamento inteligente de equipes em pontos críticos da operação." },
    { t: "Rondas Motorizadas", d: "Patrulhamento ativo com veículos equipados e comunicação em tempo real." },
  ];

  const spCW = 75;
  const spCG = 5;
  spItems.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    featureCard(doc, item.t, item.d, 28 + col * (spCW + spCG), 58 + row * (cH + 6), spCW, cH);
  });

  doc.setFillColor(DARK);
  doc.roundedRect(28, 176, 241, 16, 3, 3, "F");
  doc.setFillColor(ACCENT);
  doc.roundedRect(28, 176, 4, 16, 2, 0, "F");
  doc.setFontSize(8);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("Padrão TORRES:", 42, 186);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#c0c0c0");
  doc.text("Equipe rigorosamente treinada, uniforme padronizado e postura profissional.", 87, 186);

  // ====================================================================
  //  SLIDE 6 — CENTRAL DE MONITORAMENTO
  // ====================================================================
  doc.addPage();
  doc.setFillColor(DARK);
  doc.rect(0, 0, W, H, "F");

  doc.addImage(monitoramentoB64, "JPEG", 0, 20, W, 80);
  gradientOverlay(doc, 0, 20, W, 80, "top", DARK);
  gradientOverlay(doc, 0, 20, W, 80, "bottom", DARK);

  doc.setGState(gState(doc, 0.3));
  doc.setFillColor(DARK);
  doc.rect(0, 20, W, 80, "F");
  doc.setGState(gState(doc, 1));

  curvedShape(doc, -30, 80, 200, 120, ACCENT, 0.05);

  doc.setFillColor(ACCENT);
  doc.rect(0, 0, W, 3, "F");
  footer(doc, 6);

  sectionLabel(doc, 14);
  doc.setFontSize(22);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("Central de Monitoramento", 28, 28);

  doc.setFontSize(13);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("Monitoramento 24h com tecnologia de ponta", W / 2, 58, { align: "center" });
  doc.setFontSize(8.5);
  doc.setTextColor("#b0b0b0");
  doc.setFont("helvetica", "normal");
  doc.text("Câmeras HD, análise inteligente de imagens e resposta imediata a ameaças.", W / 2, 68, { align: "center" });

  const monCards = [
    { t: "Monitoramento 24h", d: "Equipe dedicada com vigilância ininterrupta de câmeras e sensores." },
    { t: "Câmeras HD/4K", d: "Equipamentos de última geração com resolução para identificação precisa." },
    { t: "Análise Inteligente", d: "Detecção automática de movimentos suspeitos e alertas proativos." },
    { t: "Gravação em Nuvem", d: "Armazenamento seguro com acesso remoto e backup automático." },
    { t: "Resposta Imediata", d: "Acionamento direto de equipes táticas e forças de segurança." },
    { t: "Acesso Remoto", d: "Acesso a câmeras e relatórios em qualquer dispositivo, a qualquer hora." },
  ];

  monCards.forEach((item, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = 28 + col * (cW + cG);
    const cy = 110 + row * (cH + 7);

    doc.setFillColor(DARK3);
    doc.roundedRect(cx, cy, cW, cH, 3, 3, "F");
    doc.setFillColor(ACCENT);
    doc.roundedRect(cx, cy, 3, cH, 1.5, 0, "F");

    doc.setFontSize(9);
    doc.setTextColor(WHITE);
    doc.setFont("helvetica", "bold");
    doc.text(item.t, cx + 10, cy + 11);

    doc.setFontSize(7);
    doc.setTextColor(GRAY);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(item.d, cW - 16);
    doc.text(lines, cx + 10, cy + 20);
  });

  // ====================================================================
  //  SLIDE 7 — FROTA
  // ====================================================================
  doc.addPage();
  doc.setFillColor(SOFT_BG);
  doc.rect(0, 0, W, H, "F");

  curvedShape(doc, 160, 100, 200, 160, ACCENT, 0.04);

  doc.setFillColor(ACCENT);
  doc.rect(0, 0, W, 3, "F");
  footer(doc, 7, "light");

  sectionLabel(doc, 18);
  sectionTitle(doc, "Frota e Operação", 32);

  doc.addImage(frotaImg1, "JPEG", 28, 48, 118, 66);
  doc.setDrawColor(ACCENT);
  doc.setLineWidth(1);
  doc.line(28, 48, 28, 114);
  doc.line(28, 114, 146, 114);

  doc.addImage(frotaImg2, "JPEG", 154, 48, 118, 66);
  doc.setDrawColor(ACCENT);
  doc.line(272, 48, 272, 114);
  doc.line(154, 48, 272, 48);

  doc.setFontSize(9);
  doc.setTextColor("#374151");
  doc.setFont("helvetica", "normal");
  const frotaDesc = doc.splitTextToSize(
    "Frota própria rastreada em tempo real, veículos equipados e profissionais treinados para máxima eficiência em todas as operações de escolta e patrulhamento.",
    240
  );
  doc.text(frotaDesc, 28, 126);

  const frotaL = [
    "Veículos rastreados via GPS 24 horas",
    "Comunicação integrada com central",
    "Manutenção preventiva rigorosa",
    "Controle de abastecimento e consumo",
  ];
  const frotaR = [
    "Equipes uniformizadas e identificadas",
    "Relatórios de viagem automatizados",
    "Registro fotográfico de operações",
    "Supervisão integral em tempo real",
  ];

  doc.setFillColor(WHITE);
  doc.roundedRect(28, 140, 118, 50, 3, 3, "F");
  doc.setFillColor(ACCENT);
  doc.roundedRect(28, 140, 3, 50, 1.5, 0, "F");
  frotaL.forEach((b, i) => bulletItem(doc, b, 36, 152 + i * 10, 8.5));

  doc.setFillColor(WHITE);
  doc.roundedRect(154, 140, 118, 50, 3, 3, "F");
  doc.setFillColor(ACCENT);
  doc.roundedRect(154, 140, 3, 50, 1.5, 0, "F");
  frotaR.forEach((b, i) => bulletItem(doc, b, 162, 152 + i * 10, 8.5));

  // ====================================================================
  //  SLIDE 8 — TECNOLOGIA
  // ====================================================================
  doc.addPage();
  doc.setFillColor(DARK);
  doc.rect(0, 0, W, H, "F");

  curvedShape(doc, -50, -30, 200, 160, ACCENT, 0.05);
  curvedShape(doc, 200, 100, 180, 140, ACCENT, 0.04);

  doc.setGState(gState(doc, 0.04));
  doc.addImage(logoInvB64, "PNG", 180, 50, 100, 100);
  doc.setGState(gState(doc, 1));

  doc.setFillColor(ACCENT);
  doc.rect(0, 0, W, 3, "F");
  footer(doc, 8);

  sectionLabel(doc, 18);
  doc.setFontSize(24);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("Tecnologia e Controle", 28, 34);
  accentLine(doc, 28, 38, 45);

  doc.setFontSize(9.5);
  doc.setTextColor("#b0b0b0");
  doc.setFont("helvetica", "normal");
  const techDesc = doc.splitTextToSize(
    "Sistema tecnológico desenvolvido internamente, garantindo controle total e transparência em todas as operações.",
    230
  );
  doc.text(techDesc, 28, 50);

  const techItems = [
    { t: "Aplicativo Operacional", d: "Gestão completa de equipes, escalas e ocorrências via plataforma própria." },
    { t: "Rastreamento em Tempo Real", d: "Acompanhamento GPS de veículos e equipes com histórico completo." },
    { t: "Registro com Geolocalização", d: "Fotos e eventos registrados com localização e timestamp precisos." },
    { t: "Relatórios Automatizados", d: "Dashboards e relatórios gerados automaticamente para análise gerencial." },
    { t: "Portal do Cliente", d: "Visibilidade completa da operação com dados precisos e atualizados." },
    { t: "Integrações Avançadas", d: "Conectado com ONIXSAT, COBLI e SMARTSAMPA para máximo controle." },
  ];

  techItems.forEach((item, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = 28 + col * (cW + cG);
    const cy = 62 + row * (cH + 7);

    doc.setFillColor(DARK3);
    doc.roundedRect(cx, cy, cW, cH, 3, 3, "F");
    doc.setFillColor(ACCENT);
    doc.roundedRect(cx, cy, 3, cH, 1.5, 0, "F");

    doc.setFontSize(9);
    doc.setTextColor(WHITE);
    doc.setFont("helvetica", "bold");
    doc.text(item.t, cx + 10, cy + 11);

    doc.setFontSize(7);
    doc.setTextColor(GRAY);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(item.d, cW - 16);
    doc.text(lines, cx + 10, cy + 20);
  });

  doc.setFillColor(DARK3);
  doc.roundedRect(28, 150, 241, 20, 3, 3, "F");
  doc.setFillColor(ACCENT);
  doc.roundedRect(28, 150, 4, 20, 2, 0, "F");
  doc.setFontSize(9);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "italic");
  doc.text("O cliente tem visibilidade completa da operação, com dados precisos e atualizados em tempo real.", 42, 162);

  // ====================================================================
  //  PÁGINAS DA PROPOSTA — VIATURAS + TABELA DE VALORES (opcionais)
  // ====================================================================
  let nextPage = 9;
  if (viaturaB64s.length > 0) {
    drawViaturasPage(doc, viaturaB64s, nextPage);
    nextPage++;
  }
  if (opts.routes && opts.routes.length > 0) {
    drawPriceTablePage(doc, opts.routes, logoOrigB64, nextPage);
    nextPage++;
  }

  // ====================================================================
  //  SLIDE 9 — CONTATO / ENCERRAMENTO
  // ====================================================================
  doc.addPage();
  doc.setFillColor(DARK);
  doc.rect(0, 0, W, H, "F");

  doc.addImage(teamB64, "JPEG", 0, 0, W, H);
  doc.setGState(gState(doc, 0.85));
  doc.setFillColor(DARK);
  doc.rect(0, 0, W, H, "F");
  doc.setGState(gState(doc, 1));

  curvedShape(doc, 60, 20, 180, 170, ACCENT, 0.06);
  curvedShape(doc, -40, 100, 200, 140, "#ffffff", 0.02);

  doc.setFillColor(ACCENT);
  doc.rect(0, 0, W, 4, "F");
  doc.rect(0, H - 3, W, 3, "F");

  doc.setGState(gState(doc, 0.07));
  doc.addImage(logoInvB64, "PNG", W / 2 - 55, 10, 110, 110);
  doc.setGState(gState(doc, 1));

  doc.addImage(logoOrigB64, "JPEG", W / 2 - 14, 22, 28, 28);

  doc.setFontSize(7.5);
  doc.setTextColor(GRAY);
  doc.setFont("helvetica", "bold");
  doc.text("TORRES VIGILÂNCIA PATRIMONIAL", W / 2, 60, { align: "center" });

  doc.setFontSize(34);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("Vamos conversar?", W / 2, 82, { align: "center" });
  accentLine(doc, W / 2 - 30, 87, 60);

  doc.setFontSize(10);
  doc.setTextColor(GRAY);
  doc.setFont("helvetica", "normal");
  doc.text(`Apresentação preparada exclusivamente para ${clientName}`, W / 2, 98, { align: "center" });

  doc.setFillColor(DARK3);
  doc.setGState(gState(doc, 0.92));
  doc.roundedRect(65, 110, 167, 58, 5, 5, "F");
  doc.setGState(gState(doc, 1));
  doc.setDrawColor(ACCENT);
  doc.setLineWidth(0.5);
  doc.roundedRect(65, 110, 167, 58, 5, 5, "S");

  doc.setFontSize(9);
  doc.setTextColor(ACCENT);
  doc.setFont("helvetica", "bold");
  doc.text("CONTATO", W / 2, 121, { align: "center" });

  doc.setFontSize(10.5);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "normal");
  doc.text("www.torresseguranca.com.br", W / 2, 131, { align: "center" });

  doc.setFontSize(9);
  doc.setTextColor("#c0c0c0");
  doc.text("WhatsApp: (11) 96369-6699   |   Instagram: @grupotorres.seguranca", W / 2, 140, { align: "center" });

  doc.setFontSize(9);
  doc.setTextColor("#c0c0c0");
  doc.text("comercial@torresseguranca.com.br", W / 2, 148, { align: "center" });

  doc.setFontSize(7.5);
  doc.setTextColor(MED_GRAY);
  doc.text("CNPJ 36.982.392/0001-89", W / 2, 157, { align: "center" });

  doc.setFontSize(13);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "italic");
  doc.text("Proteção com inteligência.", W / 2, 175, { align: "center" });
  doc.text("Operação com controle.", W / 2, 183, { align: "center" });
  doc.setTextColor(ACCENT);
  doc.setFont("helvetica", "bold");
  doc.text("Resultado com estratégia.", W / 2, 191, { align: "center" });

  const safeName = clientName.replace(/[^a-zA-Z0-9À-ÿ]/g, "_").replace(/_+/g, "_") || "Cliente";
  doc.save(`Apresentacao_Torres_${safeName}.pdf`);
}
