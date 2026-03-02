import jsPDF from "jspdf";
import imgTeamPath from "@assets/WhatsApp_Image_2026-03-02_at_14.36.36_1772473176101.jpeg";
import imgGuardRadioPath from "@assets/WhatsApp_Image_2026-03-02_at_14.38.49_1772473176101.jpeg";
import imgEscortRoadPath from "@assets/WhatsApp_Image_2026-03-02_at_14.36.36_(2)_1772473176100.jpeg";
import imgVehiclePath from "@assets/WhatsApp_Image_2026-03-02_at_14.36.36_(3)_1772473176100.jpeg";
import imgGuardVehiclePath from "@assets/WhatsApp_Image_2026-03-02_at_14.36.36_(1)_1772473176101.jpeg";
import imgMonitoramentoPath from "@assets/WhatsApp_Image_2026-03-02_at_14.53.45_1772474055275.jpeg";
import logoPath from "@assets/WhatsApp_Image_2026-03-02_at_14.32.24_(1)_1772473398910.jpeg";

const DARK = "#0a0a0a";
const WHITE = "#ffffff";
const GRAY = "#6b7280";
const LIGHT_GRAY = "#e5e7eb";
const ACCENT = "#b91c1c";
const SOFT_BG = "#f5f5f5";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function imgToBase64(img: HTMLImageElement, w: number, h: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const srcRatio = img.naturalWidth / img.naturalHeight;
  const dstRatio = w / h;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (srcRatio > dstRatio) {
    sw = img.naturalHeight * dstRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / dstRatio;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function addPageBackground(doc: jsPDF, color: string) {
  doc.setFillColor(color);
  doc.rect(0, 0, 297, 210, "F");
}

function addTopBar(doc: jsPDF) {
  doc.setFillColor(ACCENT);
  doc.rect(0, 0, 297, 3, "F");
}

function addBottomBar(doc: jsPDF) {
  doc.setFillColor(DARK);
  doc.rect(0, 205, 297, 5, "F");
  doc.setFontSize(6);
  doc.setTextColor(WHITE);
  doc.text("TORRES VIGILÂNCIA PATRIMONIAL  |  CNPJ 36.982.392/0001-89  |  www.torresseguranca.com.br", 148.5, 208.5, { align: "center" });
}

function addPageNumber(doc: jsPDF, num: number) {
  doc.setFontSize(7);
  doc.setTextColor(GRAY);
  doc.text(String(num).padStart(2, "0"), 285, 200);
}

function addSectionTitle(doc: jsPDF, title: string, y: number, color = DARK) {
  doc.setFontSize(8);
  doc.setTextColor(ACCENT);
  doc.setFont("helvetica", "bold");
  doc.text("TORRES VIGILÂNCIA PATRIMONIAL", 25, y);

  doc.setFontSize(26);
  doc.setTextColor(color);
  doc.setFont("helvetica", "bold");
  doc.text(title, 25, y + 14);

  doc.setDrawColor(ACCENT);
  doc.setLineWidth(1.5);
  doc.line(25, y + 18, 65, y + 18);
}

function addBullet(doc: jsPDF, text: string, x: number, y: number, size = 10) {
  doc.setFillColor(ACCENT);
  doc.circle(x, y - 1.5, 1.5, "F");
  doc.setFontSize(size);
  doc.setTextColor(DARK);
  doc.setFont("helvetica", "normal");
  doc.text(text, x + 6, y);
}

function addIconBox(doc: jsPDF, title: string, desc: string, x: number, y: number, w: number) {
  doc.setFillColor(WHITE);
  doc.roundedRect(x, y, w, 38, 3, 3, "F");
  doc.setDrawColor(LIGHT_GRAY);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, 38, 3, 3, "S");

  doc.setFillColor(ACCENT);
  doc.roundedRect(x + 8, y + 8, 5, 5, 1, 1, "F");

  doc.setFontSize(10);
  doc.setTextColor(DARK);
  doc.setFont("helvetica", "bold");
  doc.text(title, x + 18, y + 13);

  doc.setFontSize(7.5);
  doc.setTextColor(GRAY);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(desc, w - 20);
  doc.text(lines, x + 8, y + 24);
}

function addStatCard(doc: jsPDF, value: string, label: string, x: number, y: number) {
  doc.setFillColor(WHITE);
  doc.roundedRect(x, y, 55, 30, 3, 3, "F");
  doc.setDrawColor(LIGHT_GRAY);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, 55, 30, 3, 3, "S");

  doc.setFontSize(18);
  doc.setTextColor(ACCENT);
  doc.setFont("helvetica", "bold");
  doc.text(value, x + 27.5, y + 14, { align: "center" });

  doc.setFontSize(7);
  doc.setTextColor(GRAY);
  doc.setFont("helvetica", "normal");
  doc.text(label, x + 27.5, y + 22, { align: "center" });
}

function addImageOverlay(doc: jsPDF, x: number, y: number, w: number, h: number, opacity: number) {
  doc.setGState(new (doc as any).GState({ opacity }));
  doc.setFillColor(DARK);
  doc.rect(x, y, w, h, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));
}

export async function generatePresentation(clientName: string) {
  const [imgTeam, imgGuardRadio, imgEscortRoad, imgVehicle, imgGuardVehicle, imgMonitoramento, logo] = await Promise.all([
    loadImage(imgTeamPath),
    loadImage(imgGuardRadioPath),
    loadImage(imgEscortRoadPath),
    loadImage(imgVehiclePath),
    loadImage(imgGuardVehiclePath),
    loadImage(imgMonitoramentoPath),
    loadImage(logoPath),
  ]);

  const teamB64 = imgToBase64(imgTeam, 800, 600);
  const guardRadioB64 = imgToBase64(imgGuardRadio, 800, 600);
  const escortRoadB64 = imgToBase64(imgEscortRoad, 800, 600);
  const vehicleB64 = imgToBase64(imgVehicle, 800, 600);
  const guardVehicleB64 = imgToBase64(imgGuardVehicle, 800, 600);
  const monitoramentoB64 = imgToBase64(imgMonitoramento, 800, 600);
  const logoB64 = imgToBase64(logo, 400, 400);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // ======================== SLIDE 1 — COVER ========================
  addPageBackground(doc, DARK);

  doc.addImage(teamB64, "JPEG", 140, 0, 157, 210);
  doc.setGState(new (doc as any).GState({ opacity: 0.7 }));
  doc.setFillColor(DARK);
  doc.rect(140, 0, 157, 210, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  doc.setFillColor("#111111");
  doc.rect(0, 0, 148, 210, "F");

  doc.setFillColor(ACCENT);
  doc.rect(0, 0, 297, 4, "F");

  doc.addImage(logoB64, "JPEG", 25, 18, 24, 24);

  doc.setFontSize(9);
  doc.setTextColor("#888888");
  doc.setFont("helvetica", "bold");
  doc.text("TORRES VIGILÂNCIA PATRIMONIAL", 54, 32);

  doc.setFontSize(38);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("Apresentação", 25, 65);
  doc.text("Comercial", 25, 80);

  doc.setDrawColor(ACCENT);
  doc.setLineWidth(2);
  doc.line(25, 88, 80, 88);

  doc.setFontSize(14);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "normal");
  doc.text("Preparada para:", 25, 105);

  doc.setFontSize(18);
  doc.setTextColor(ACCENT);
  doc.setFont("helvetica", "bold");
  const clientLines = doc.splitTextToSize(clientName.toUpperCase(), 110);
  doc.text(clientLines, 25, 118);

  doc.setFontSize(9);
  doc.setTextColor("#555555");
  doc.setFont("helvetica", "normal");
  const today = new Date();
  const dateStr = today.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  doc.text(dateStr, 25, 185);

  doc.setFontSize(8);
  doc.setTextColor("#444444");
  doc.text("CNPJ 36.982.392/0001-89", 25, 192);

  doc.setFontSize(11);
  doc.setTextColor("#999999");
  doc.setFont("helvetica", "italic");
  doc.text('"Segurança não é custo. É estratégia."', 185, 185);

  doc.setFontSize(8);
  doc.setTextColor("#666666");
  doc.text("www.torresseguranca.com.br", 185, 192);
  doc.text("comercial@torresseguranca.com.br", 185, 198);

  // ======================== SLIDE 2 — QUEM SOMOS ========================
  doc.addPage();
  addPageBackground(doc, SOFT_BG);
  addTopBar(doc);

  doc.addImage(guardVehicleB64, "JPEG", 180, 25, 105, 75);
  doc.setDrawColor(ACCENT);
  doc.setLineWidth(1);
  doc.rect(180, 25, 105, 75, "S");

  addBottomBar(doc);
  addPageNumber(doc, 2);
  addSectionTitle(doc, "Quem Somos", 22);

  doc.setFontSize(10);
  doc.setTextColor("#374151");
  doc.setFont("helvetica", "normal");
  const quemSomos1 = doc.splitTextToSize(
    "A TORRES Vigilância Patrimonial é uma empresa especializada em soluções estratégicas de segurança, atuando com excelência em Escolta Armada, Segurança Patrimonial e Central de Monitoramento.",
    145
  );
  doc.text(quemSomos1, 25, 52);

  const quemSomos2 = doc.splitTextToSize(
    "Estruturada por profissionais com ampla experiência no setor de segurança privada, a empresa carrega uma bagagem sólida de vivência prática, conhecimento operacional e entendimento real dos desafios do mercado.",
    145
  );
  doc.text(quemSomos2, 25, 72);

  const quemSomos3 = doc.splitTextToSize(
    "Seu grande diferencial está na agilidade na tomada de decisão, tempo de resposta reduzido e capacidade de ação imediata, garantindo maior segurança, previsibilidade e confiança para seus parceiros.",
    145
  );
  doc.text(quemSomos3, 25, 92);

  doc.setFillColor(DARK);
  doc.roundedRect(25, 112, 247, 26, 3, 3, "F");
  doc.setFontSize(11);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "italic");
  const mission = doc.splitTextToSize(
    "Nosso compromisso é proteger cargas, patrimônios e operações logísticas com alto nível de eficiência, gestão e tecnologia de ponta.",
    220
  );
  doc.text(mission, 148.5, 126, { align: "center" });

  addStatCard(doc, "24h", "Monitoramento", 25, 150);
  addStatCard(doc, "100%", "Operações Supervisionadas", 88, 150);
  addStatCard(doc, "PF", "Autorizada Polícia Federal", 151, 150);
  addStatCard(doc, "360°", "Cobertura Integrada", 214, 150);

  // ======================== SLIDE 3 — DIFERENCIAIS ========================
  doc.addPage();
  addPageBackground(doc, WHITE);
  addTopBar(doc);
  addBottomBar(doc);
  addPageNumber(doc, 3);
  addSectionTitle(doc, "Diferenciais Operacionais", 22);

  const diffItems = [
    { title: "Gestão Centralizada", desc: "Controle total de operações com sistema próprio de monitoramento e gestão de equipes em tempo real." },
    { title: "Tecnologia Integrada", desc: "Integração com plataformas ONIXSAT, COBLI e SMARTSAMPA para rastreamento e controle." },
    { title: "Resposta Imediata", desc: "Agilidade na tomada de decisão e tempo de resposta reduzido para situações críticas." },
    { title: "Processo Seletivo Rigoroso", desc: "Recrutamento criterioso com treinamento contínuo e avaliação permanente da equipe." },
    { title: "Padrão Operacional Elevado", desc: "Uniformes padronizados, postura profissional e protocolos operacionais rígidos." },
    { title: "Expansão Estratégica", desc: "Crescimento planejado focado em segmentos de alto valor com excelência operacional." },
  ];

  const colW = 82;
  const gap = 6;
  diffItems.forEach((item, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 25 + col * (colW + gap);
    const y = 50 + row * 46;
    addIconBox(doc, item.title, item.desc, x, y, colW);
  });

  doc.setFillColor(SOFT_BG);
  doc.roundedRect(25, 150, 247, 22, 3, 3, "F");
  doc.setFontSize(9);
  doc.setTextColor(DARK);
  doc.setFont("helvetica", "italic");
  doc.text("Segurança com inteligência, operação com controle e compromisso com resultados.", 148.5, 163, { align: "center" });

  // ======================== SLIDE 4 — ESCOLTA ARMADA ========================
  doc.addPage();
  addPageBackground(doc, SOFT_BG);
  addTopBar(doc);
  addBottomBar(doc);
  addPageNumber(doc, 4);
  addSectionTitle(doc, "Escolta Armada", 22);

  doc.addImage(escortRoadB64, "JPEG", 155, 48, 117, 80);
  addImageOverlay(doc, 155, 48, 117, 80, 0.55);

  doc.setFontSize(11);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("SEGURANÇA + LOGÍSTICA", 165, 62);

  doc.setFontSize(8.5);
  doc.setTextColor("#d1d5db");
  doc.setFont("helvetica", "normal");
  const escoltaText = doc.splitTextToSize(
    "Um dos maiores erros do mercado é tratar segurança e logística como áreas separadas. Na TORRES, entendemos que a segurança impacta diretamente o resultado logístico, o tempo de operação influencia o risco e a comunicação falha gera vulnerabilidade.",
    100
  );
  doc.text(escoltaText, 165, 72);

  doc.setFontSize(8);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "italic");
  doc.text("Nossa atuação é integrada à", 165, 112);
  doc.text("realidade da operação logística.", 165, 118);

  doc.setFillColor(WHITE);
  doc.roundedRect(25, 48, 120, 80, 3, 3, "F");
  doc.setDrawColor(LIGHT_GRAY);
  doc.roundedRect(25, 48, 120, 80, 3, 3, "S");

  doc.setFontSize(9);
  doc.setTextColor(ACCENT);
  doc.setFont("helvetica", "bold");
  doc.text("HOMOLOGAÇÃO POLICIA FEDERAL", 32, 58);

  doc.setFontSize(7.5);
  doc.setTextColor(GRAY);
  doc.setFont("helvetica", "normal");
  doc.text("ALVARÁ Nº 3.098, DE 28 DE MAIO DE 2025", 32, 66);
  doc.text("Nº 1293/2025 - DREX/SR/PF", 32, 72);

  const escoltaBullets = [
    "Escolta de cargas de alto valor",
    "Operações urbanas e rodoviárias",
    "Monitoramento em tempo real",
    "Relatórios operacionais detalhados",
    "Comunicação direta com central 24h",
  ];
  escoltaBullets.forEach((b, i) => addBullet(doc, b, 32, 84 + i * 9));

  doc.setFillColor(DARK);
  doc.roundedRect(25, 138, 247, 28, 3, 3, "F");
  doc.setFillColor(ACCENT);
  doc.roundedRect(25, 138, 4, 28, 2, 0, "F");

  doc.setFontSize(12);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("Proteção com inteligência. Operação com controle.", 38, 152);
  doc.setFontSize(9);
  doc.setTextColor("#9ca3af");
  doc.setFont("helvetica", "normal");
  doc.text("Resultado com estratégia.", 38, 160);

  // ======================== SLIDE 5 — SEGURANÇA PATRIMONIAL ========================
  doc.addPage();
  addPageBackground(doc, WHITE);
  addTopBar(doc);

  doc.addImage(guardRadioB64, "JPEG", 180, 25, 105, 75);
  doc.setDrawColor(ACCENT);
  doc.setLineWidth(1);
  doc.rect(180, 25, 105, 75, "S");

  addBottomBar(doc);
  addPageNumber(doc, 5);
  addSectionTitle(doc, "Segurança Patrimonial", 22);

  doc.setFontSize(10);
  doc.setTextColor(GRAY);
  doc.setFont("helvetica", "normal");
  doc.text("Proteção completa e adaptada às necessidades da sua operação.", 25, 50);

  const spItems = [
    { title: "Vigilância Armada e Desarmada", desc: "Profissionais qualificados e equipados para proteção efetiva do seu patrimônio." },
    { title: "Controle de Acesso", desc: "Gestão rigorosa de entrada e saída de pessoas e veículos com registro completo." },
    { title: "Segurança Condominial", desc: "Proteção especializada para condomínios residenciais e comerciais." },
    { title: "Segurança Empresarial", desc: "Soluções personalizadas para ambiente corporativo com foco em prevenção." },
    { title: "Postos Fixos Estratégicos", desc: "Posicionamento inteligente de equipes em pontos críticos da operação." },
    { title: "Rondas Motorizadas", desc: "Patrulhamento ativo com veículos equipados e comunicação em tempo real." },
  ];

  const spColW = 50;
  const spGap = 4;
  spItems.forEach((item, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 25 + col * (spColW + spGap);
    const y = 60 + row * 46;
    addIconBox(doc, item.title, item.desc, x, y, spColW);
  });

  doc.setFillColor(SOFT_BG);
  doc.roundedRect(25, 160, 247, 18, 3, 3, "F");
  doc.setFillColor(ACCENT);
  doc.roundedRect(25, 160, 4, 18, 2, 0, "F");
  doc.setFontSize(8.5);
  doc.setTextColor(DARK);
  doc.setFont("helvetica", "bold");
  doc.text("Padrão TORRES:", 38, 170);
  doc.setFont("helvetica", "normal");
  doc.text("Equipe rigorosamente treinada, uniforme padronizado e postura profissional.", 84, 170);

  // ======================== SLIDE 6 — CENTRAL DE MONITORAMENTO ========================
  doc.addPage();
  addPageBackground(doc, SOFT_BG);
  addTopBar(doc);
  addBottomBar(doc);
  addPageNumber(doc, 6);
  addSectionTitle(doc, "Central de Monitoramento", 22);

  doc.addImage(monitoramentoB64, "JPEG", 25, 48, 247, 60);
  addImageOverlay(doc, 25, 48, 247, 60, 0.6);

  doc.setFontSize(16);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("Monitoramento 24 horas com tecnologia de ponta", 148.5, 72, { align: "center" });
  doc.setFontSize(9);
  doc.setTextColor("#d1d5db");
  doc.setFont("helvetica", "normal");
  const monSubtext = doc.splitTextToSize(
    "Câmeras de alta definição, análise inteligente de imagens, detecção proativa de ameaças e resposta imediata.",
    200
  );
  doc.text(monSubtext, 148.5, 82, { align: "center" });

  const monItems = [
    { title: "Monitoramento 24h", desc: "Equipe dedicada com vigilância ininterrupta de câmeras e sensores." },
    { title: "Câmeras HD/4K", desc: "Equipamentos de última geração com resolução para identificação." },
    { title: "Análise Inteligente", desc: "Detecção automática de movimentos suspeitos e alertas proativos." },
    { title: "Gravação em Nuvem", desc: "Armazenamento seguro com acesso remoto e backup automático." },
    { title: "Resposta Imediata", desc: "Acionamento direto de equipes táticas e forças de segurança." },
    { title: "Acesso Remoto", desc: "Acesso às câmeras e relatórios em qualquer dispositivo, a qualquer hora." },
  ];

  monItems.forEach((item, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 25 + col * (colW + gap);
    const y = 118 + row * 42;
    addIconBox(doc, item.title, item.desc, x, y, colW);
  });

  // ======================== SLIDE 7 — FROTA / VEÍCULOS ========================
  doc.addPage();
  addPageBackground(doc, WHITE);
  addTopBar(doc);
  addBottomBar(doc);
  addPageNumber(doc, 7);
  addSectionTitle(doc, "Frota e Operação", 22);

  doc.addImage(vehicleB64, "JPEG", 25, 48, 120, 70);
  doc.setDrawColor(ACCENT);
  doc.setLineWidth(1);
  doc.rect(25, 48, 120, 70, "S");

  doc.addImage(guardVehicleB64, "JPEG", 152, 48, 120, 70);
  doc.setDrawColor(LIGHT_GRAY);
  doc.setLineWidth(0.5);
  doc.rect(152, 48, 120, 70, "S");

  doc.setFontSize(10);
  doc.setTextColor("#374151");
  doc.setFont("helvetica", "normal");
  const frotaText = doc.splitTextToSize(
    "Frota própria rastreada em tempo real, veículos equipados e profissionais treinados para garantir a máxima eficiência em todas as operações de escolta e patrulhamento.",
    247
  );
  doc.text(frotaText, 25, 130);

  const frotaBullets = [
    "Veículos rastreados via GPS 24 horas",
    "Comunicação integrada com central de operações",
    "Manutenção preventiva rigorosa da frota",
    "Controle de abastecimento e consumo médio",
  ];

  doc.setFillColor(SOFT_BG);
  doc.roundedRect(25, 145, 120, 48, 3, 3, "F");
  frotaBullets.forEach((b, i) => addBullet(doc, b, 32, 156 + i * 10, 9));

  const frotaBullets2 = [
    "Equipes uniformizadas e identificadas",
    "Relatórios de viagem automatizados",
    "Registro fotográfico de todas as operações",
    "Supervisão integral em tempo real",
  ];
  doc.setFillColor(SOFT_BG);
  doc.roundedRect(152, 145, 120, 48, 3, 3, "F");
  frotaBullets2.forEach((b, i) => addBullet(doc, b, 159, 156 + i * 10, 9));

  // ======================== SLIDE 8 — TECNOLOGIA ========================
  doc.addPage();
  addPageBackground(doc, WHITE);
  addTopBar(doc);
  addBottomBar(doc);
  addPageNumber(doc, 8);
  addSectionTitle(doc, "Tecnologia e Controle", 22);

  doc.setFontSize(10);
  doc.setTextColor("#374151");
  doc.setFont("helvetica", "normal");
  const techIntro = doc.splitTextToSize(
    "A TORRES opera integrada ao sistema tecnológico desenvolvido internamente, garantindo controle total e transparência em todas as operações.",
    230
  );
  doc.text(techIntro, 25, 50);

  const techItems = [
    { title: "Aplicativo Operacional", desc: "Gestão completa de equipes, escalas e ocorrências via plataforma própria." },
    { title: "Rastreamento em Tempo Real", desc: "Acompanhamento GPS de veículos e equipes com histórico completo de rotas." },
    { title: "Registro com Geolocalização", desc: "Fotos, eventos e ocorrências registrados com localização e timestamp precisos." },
    { title: "Relatórios Automatizados", desc: "Dashboards e relatórios gerados automaticamente para análise gerencial." },
    { title: "Portal do Cliente", desc: "O cliente tem visibilidade completa da operação com dados atualizados." },
    { title: "Integrações", desc: "Conectado com ONIXSAT, COBLI e SMARTSAMPA para máximo controle operacional." },
  ];

  techItems.forEach((item, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 25 + col * (colW + gap);
    const y = 64 + row * 46;
    addIconBox(doc, item.title, item.desc, x, y, colW);
  });

  // ======================== SLIDE 9 — CONTATO ========================
  doc.addPage();

  doc.addImage(teamB64, "JPEG", 0, 0, 297, 210);
  addImageOverlay(doc, 0, 0, 297, 210, 0.82);

  doc.setFillColor(ACCENT);
  doc.rect(0, 0, 297, 4, "F");

  doc.addImage(logoB64, "JPEG", 136, 18, 25, 25);

  doc.setFontSize(9);
  doc.setTextColor("#888888");
  doc.setFont("helvetica", "bold");
  doc.text("TORRES VIGILÂNCIA PATRIMONIAL", 148.5, 52, { align: "center" });

  doc.setFontSize(32);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("Vamos conversar?", 148.5, 72, { align: "center" });

  doc.setDrawColor(ACCENT);
  doc.setLineWidth(2);
  doc.line(120, 78, 177, 78);

  doc.setFontSize(11);
  doc.setTextColor("#9ca3af");
  doc.setFont("helvetica", "normal");
  doc.text(`Apresentação preparada para ${clientName}`, 148.5, 92, { align: "center" });

  doc.setFillColor("#1a1a1a");
  doc.setGState(new (doc as any).GState({ opacity: 0.9 }));
  doc.roundedRect(50, 105, 197, 55, 4, 4, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  doc.setFontSize(10);
  doc.setTextColor(ACCENT);
  doc.setFont("helvetica", "bold");
  doc.text("CONTATO", 148.5, 118, { align: "center" });

  doc.setFontSize(12);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "normal");
  doc.text("www.torresseguranca.com.br", 148.5, 130, { align: "center" });

  doc.setFontSize(10);
  doc.setTextColor("#d1d5db");
  doc.text("comercial@torresseguranca.com.br", 148.5, 140, { align: "center" });

  doc.setFontSize(8);
  doc.setTextColor("#6b7280");
  doc.text("CNPJ 36.982.392/0001-89", 148.5, 150, { align: "center" });

  doc.setFontSize(14);
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "italic");
  doc.text("Proteção com inteligência.", 148.5, 172, { align: "center" });
  doc.text("Operação com controle.", 148.5, 180, { align: "center" });
  doc.setTextColor(ACCENT);
  doc.setFont("helvetica", "bold");
  doc.text("Resultado com estratégia.", 148.5, 188, { align: "center" });

  const safeName = clientName.replace(/[^a-zA-Z0-9À-ÿ]/g, "_").replace(/_+/g, "_") || "Cliente";
  const fileName = `Apresentacao_Torres_${safeName}.pdf`;
  doc.save(fileName);
}
