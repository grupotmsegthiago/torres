import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAdminRole } from "../auth";
import { createSmtpTransporter, getSmtpFrom, nowBRTString } from "./_helpers";
import cron from "node-cron";

const LEAD_STATUSES = ["novo", "contatado", "qualificado", "proposta_enviada", "negociacao", "ganho", "perdido", "descartado"] as const;
const SETORES_ALVO = [
  "Transportadora", "Logística", "Atacadista", "Centro de Distribuição",
  "Indústria Farmacêutica", "Transporte de Valores", "E-commerce", "Varejo",
  "Agronegócio", "Indústria Alimentícia", "Distribuidora", "Armazém Geral",
];
const ORIGENS = ["google_places", "indicacao", "site", "telefone", "email", "evento", "rede_social", "prospecao_ativa", "outro"] as const;

const SCORING_SETOR: Record<string, number> = {
  "Transporte de Valores": 10,
  "Indústria Farmacêutica": 10,
  "Transportadora": 9,
  "Logística": 8,
  "Centro de Distribuição": 8,
  "E-commerce": 7,
  "Distribuidora": 7,
  "Atacadista": 7,
  "Armazém Geral": 6,
  "Indústria Alimentícia": 6,
  "Agronegócio": 5,
  "Varejo": 4,
};
const ZONAS_RISCO = ["Cajamar", "Guarulhos", "Campinas", "Santos", "Dutra", "Raposo", "Castelo Branco", "Anhanguera", "Bandeirantes", "Fernão Dias", "Régis Bittencourt", "Anchieta", "Imigrantes", "Barueri", "Osasco", "Jundiaí", "Embu"];

function calcLeadScore(setor?: string, endereco?: string, temperatura?: string, valor_estimado?: number): number {
  let score = SCORING_SETOR[setor || ""] || 3;
  const addr = (endereco || "").toLowerCase();
  for (const zona of ZONAS_RISCO) {
    if (addr.includes(zona.toLowerCase())) { score += 2; break; }
  }
  if (temperatura === "quente") score += 3;
  else if (temperatura === "morno") score += 1;
  if ((valor_estimado || 0) >= 50000) score += 2;
  else if ((valor_estimado || 0) >= 20000) score += 1;
  return Math.min(score, 15);
}

const CONTATO_CARGOS = [
  "Gerente de Logística", "Gerente de Operações", "Supervisor de Transportes",
  "Coordenador de GR", "Gerente de Riscos", "Analista de Seguros",
  "Diretor de Operações", "Gerente de Segurança", "Coordenador de Frota",
  "Gerente Comercial", "Supervisor de Expedição", "Contato Geral",
];

const EMAIL_PREFIXES = [
  "contato", "comercial", "logistica", "operacoes", "transportes",
  "gr", "riscos", "seguros", "seguranca", "gerencia", "diretoria",
  "financeiro", "compras", "administrativo", "sac",
];

const REPLY_TO_ADDRESSES = "escolta@torresseguranca.com.br, diretoria@torresseguranca.com.br";
const BATCH_SIZE = 5;
const BATCH_INTERVAL_MINUTES = 10;
let emailDispatchRunning = false;

async function ensureLeadsTable() {
  const { error } = await supabaseAdmin.rpc("exec_sql", {
    query: `
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        empresa TEXT NOT NULL,
        cnpj TEXT,
        contato_nome TEXT,
        contato_cargo TEXT,
        telefone TEXT,
        email TEXT,
        website TEXT,
        endereco TEXT,
        cidade TEXT DEFAULT 'São Paulo',
        estado TEXT DEFAULT 'SP',
        cep TEXT,
        setor TEXT,
        origem TEXT DEFAULT 'prospecao_ativa',
        status TEXT DEFAULT 'novo',
        temperatura TEXT DEFAULT 'frio',
        valor_estimado REAL DEFAULT 0,
        notas TEXT,
        motivo_perda TEXT,
        proximo_contato TIMESTAMP,
        ultimo_contato TIMESTAMP,
        responsavel TEXT,
        responsavel_id INTEGER,
        google_place_id TEXT,
        google_rating REAL,
        google_total_reviews INTEGER,
        tags TEXT[],
        historico JSONB DEFAULT '[]'::jsonb,
        emails_enviados INTEGER DEFAULT 0,
        convertido_client_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
      CREATE INDEX IF NOT EXISTS idx_leads_setor ON leads(setor);
      CREATE INDEX IF NOT EXISTS idx_leads_cidade ON leads(cidade);
    `,
  });
  if (error) {
    console.log("[leads] Table creation via RPC failed, trying direct:", error.message);
    await supabaseAdmin.from("leads").select("id").limit(1);
  }
}

async function ensureEmailQueueTable() {
  const { error } = await supabaseAdmin.rpc("exec_sql", {
    query: `
      CREATE TABLE IF NOT EXISTS email_queue (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
        to_email TEXT NOT NULL,
        to_name TEXT,
        empresa TEXT,
        subject TEXT NOT NULL,
        html_body TEXT NOT NULL,
        status TEXT DEFAULT 'pendente',
        tracking_id TEXT UNIQUE,
        opened_at TIMESTAMP,
        opened_count INTEGER DEFAULT 0,
        replied BOOLEAN DEFAULT FALSE,
        replied_at TIMESTAMP,
        error_message TEXT,
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        campaign_tag TEXT DEFAULT 'apresentacao'
      );
      CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
      CREATE INDEX IF NOT EXISTS idx_email_queue_tracking ON email_queue(tracking_id);
      CREATE INDEX IF NOT EXISTS idx_email_queue_lead ON email_queue(lead_id);
      CREATE INDEX IF NOT EXISTS idx_email_queue_sent ON email_queue(sent_at);
    `,
  });
  if (error) {
    console.log("[leads] email_queue table via RPC failed:", error.message);
  }
}

function generateTrackingId(): string {
  return `trk_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

async function getVehiclePhotosForEmail(baseUrl: string): Promise<string> {
  try {
    const { data: vehicles } = await supabaseAdmin
      .from("vehicles")
      .select("id, photo_front, photo_left, photo_rear, photo_right")
      .not("photo_front", "is", null)
      .limit(6);

    if (!vehicles || vehicles.length === 0) return "";

    const photosHtml: string[] = [];
    let count = 0;
    for (const v of vehicles) {
      if (count >= 4) break;
      const photoFields = ["photo_front", "photo_left"] as const;
      for (const field of photoFields) {
        if (count >= 4) break;
        const photo = (v as any)[field];
        if (!photo) continue;
        const photoUrl = `${baseUrl}/api/leads/vehicle-photo/${v.id}/${field}`;
        photosHtml.push(
          `<td style="padding:4px;width:50%;"><img src="${photoUrl}" width="260" style="width:100%;max-width:260px;height:auto;border-radius:8px;display:block;" alt="Viatura Torres" /></td>`
        );
        count++;
      }
    }

    if (photosHtml.length === 0) return "";

    const rows: string[] = [];
    for (let i = 0; i < photosHtml.length; i += 2) {
      rows.push(`<tr>${photosHtml[i]}${photosHtml[i + 1] || "<td></td>"}</tr>`);
    }

    return `
    <div style="margin:20px 0;">
      <p style="color:#1a1a2e;font-weight:bold;font-size:14px;margin:0 0 12px;text-align:center;">Nossa Frota</p>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:540px;margin:0 auto;">
        ${rows.join("")}
      </table>
    </div>`;
  } catch (err: any) {
    console.error("[leads] Erro ao buscar fotos veículos:", err.message);
    return "";
  }
}

async function buildEmailHtml(lead: any, trackingId: string, baseUrl: string): Promise<string> {
  const pixelUrl = `${baseUrl}/api/leads/pixel/${trackingId}.png`;
  const vehiclePhotosHtml = await getVehiclePhotosForEmail(baseUrl);
  return `
<!DOCTYPE html>
<html><body style="font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:0;background:#f8f9fa;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1a1a2e;padding:30px 20px;border-radius:16px 16px 0 0;text-align:center;">
    <h1 style="color:#fff;font-size:22px;margin:0;letter-spacing:1px;">TORRES VIGILÂNCIA PATRIMONIAL</h1>
    <p style="color:#a0a0c0;font-size:12px;margin:8px 0 0;">CNPJ 36.982.392/0001-89</p>
  </div>
  <div style="background:#fff;padding:30px 24px;border-radius:0 0 16px 16px;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <p style="color:#333;font-size:15px;line-height:1.7;">
      Prezado(a) <strong>${lead.contato_nome || "Responsável"}</strong>,
    </p>
    <p style="color:#555;font-size:14px;line-height:1.7;">
      A <strong>Torres Vigilância Patrimonial</strong> é especializada em <strong>Escolta Armada Caracterizada</strong> 
      para operações de logística, transporte de cargas e valores no estado de São Paulo.
    </p>
    <div style="background:#f0f4ff;border-left:4px solid #1a1a2e;padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">
      <p style="color:#1a1a2e;font-weight:bold;margin:0 0 8px;font-size:14px;">Nossos Diferenciais:</p>
      <ul style="color:#444;font-size:13px;line-height:2;padding-left:20px;margin:0;">
        <li>Viaturas caracterizadas com rastreamento em tempo real</li>
        <li>Agentes com treinamento especializado e armamento regulamentado</li>
        <li>Monitoramento 24h via central de operações</li>
        <li>Cobertura completa no estado de São Paulo</li>
        <li>Relatórios operacionais digitais com fotos e geolocalização</li>
        <li>Seguro de responsabilidade civil</li>
      </ul>
    </div>
    ${vehiclePhotosHtml}
    <p style="color:#555;font-size:14px;line-height:1.7;">
      Gostaríamos de apresentar nossos serviços e demonstrar como podemos agregar segurança 
      às operações da <strong>${lead.empresa}</strong>.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="mailto:escolta@torresseguranca.com.br?subject=Interesse%20em%20Escolta%20-%20${encodeURIComponent(lead.empresa)}" 
         style="display:inline-block;background:#1a1a2e;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
        SOLICITAR PROPOSTA COMERCIAL
      </a>
    </div>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <div style="text-align:center;">
      <p style="color:#888;font-size:12px;margin:4px 0;"><strong>Torres Vigilância Patrimonial</strong></p>
      <p style="color:#999;font-size:11px;margin:2px 0;">📞 (11) 96369-6699 | ✉️ escolta@torresseguranca.com.br</p>
      <p style="color:#999;font-size:11px;margin:2px 0;">🌐 www.torresseguranca.com.br</p>
    </div>
  </div>
</div>
<img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />
</body></html>`;
}

async function processEmailQueue() {
  if (emailDispatchRunning) return;
  emailDispatchRunning = true;
  try {
    const transporter = createSmtpTransporter();
    if (!transporter) {
      console.log("[email-queue] SMTP não configurado, pulando");
      return;
    }

    const { data: pending } = await supabaseAdmin
      .from("email_queue")
      .select("*")
      .eq("status", "pendente")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (!pending || pending.length === 0) return;

    console.log(`[email-queue] Processando lote de ${pending.length} e-mail(s)...`);

    for (const email of pending) {
      try {
        await transporter.sendMail({
          from: getSmtpFrom(),
          to: email.to_email,
          replyTo: REPLY_TO_ADDRESSES,
          subject: email.subject,
          html: email.html_body,
          headers: {
            "X-Torres-Tracking": email.tracking_id,
            "List-Unsubscribe": `<mailto:escolta@torresseguranca.com.br?subject=Descadastrar>`,
          },
        });

        await supabaseAdmin.from("email_queue").update({
          status: "enviado",
          sent_at: nowBRTString(),
        }).eq("id", email.id);

        if (email.lead_id) {
          const { data: lead } = await supabaseAdmin.from("leads").select("emails_enviados, historico, status").eq("id", email.lead_id).single();
          if (lead) {
            const hist = Array.isArray(lead.historico) ? [...lead.historico] : [];
            hist.push({
              data: nowBRTString(),
              acao: "E-mail disparado automaticamente",
              usuario: "Sistema",
              detalhes: `Enviado para ${email.to_email}`,
            });
            await supabaseAdmin.from("leads").update({
              emails_enviados: (lead.emails_enviados || 0) + 1,
              ultimo_contato: nowBRTString(),
              status: lead.status === "novo" ? "contatado" : lead.status,
              historico: hist,
              updated_at: nowBRTString(),
            }).eq("id", email.lead_id);
          }
        }

        console.log(`[email-queue] ✓ Enviado: ${email.to_email} (${email.empresa})`);

        await new Promise(r => setTimeout(r, 2000));
      } catch (err: any) {
        console.error(`[email-queue] ✗ Erro ${email.to_email}: ${err.message}`);
        await supabaseAdmin.from("email_queue").update({
          status: "erro",
          error_message: err.message,
        }).eq("id", email.id);
      }
    }

    console.log(`[email-queue] Lote concluído: ${pending.length} processado(s)`);
  } catch (err: any) {
    console.error("[email-queue] Erro geral:", err.message);
  } finally {
    emailDispatchRunning = false;
  }
}

export function registerLeadRoutes(app: Express) {
  Promise.all([ensureLeadsTable(), ensureEmailQueueTable()]).then(() => {
    console.log("[leads] Tabela leads + email_queue verificadas");
  });

  cron.schedule(`*/${BATCH_INTERVAL_MINUTES} * * * *`, () => {
    processEmailQueue().catch(err => console.error("[email-queue-cron]", err.message));
  });
  console.log(`[email-queue] CRON ativo: ${BATCH_SIZE} e-mails a cada ${BATCH_INTERVAL_MINUTES} minutos`);

  const PIXEL_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

  app.get("/api/leads/pixel/:trackingId.png", async (req: Request, res: Response) => {
    try {
      const { trackingId } = req.params;
      const tid = trackingId.replace(".png", "");

      const { data: email } = await supabaseAdmin.from("email_queue")
        .select("id, opened_count, opened_at, lead_id")
        .eq("tracking_id", tid)
        .single();

      if (email) {
        const updates: any = {
          opened_count: (email.opened_count || 0) + 1,
        };
        if (!email.opened_at) {
          updates.opened_at = nowBRTString();
          updates.status = "lido";
        }
        await supabaseAdmin.from("email_queue").update(updates).eq("id", email.id);

        if (email.lead_id && !email.opened_at) {
          const { data: lead } = await supabaseAdmin.from("leads").select("historico").eq("id", email.lead_id).single();
          if (lead) {
            const hist = Array.isArray(lead.historico) ? [...lead.historico] : [];
            hist.push({
              data: nowBRTString(),
              acao: "E-mail foi aberto/lido",
              usuario: "Sistema",
              detalhes: "O destinatário abriu o e-mail de apresentação",
            });
            await supabaseAdmin.from("leads").update({
              historico: hist,
              temperatura: "morno",
              updated_at: nowBRTString(),
            }).eq("id", email.lead_id);
          }
        }
      }
    } catch (_e) {}

    res.set({
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    res.send(PIXEL_GIF);
  });

  app.get("/api/leads/vehicle-photo/:vehicleId/:field", async (req: Request, res: Response) => {
    try {
      const { vehicleId, field } = req.params;
      const allowedFields = ["photo_front", "photo_left", "photo_rear", "photo_right"];
      if (!allowedFields.includes(field)) return res.status(400).send("Invalid field");

      const { data: vehicle } = await supabaseAdmin
        .from("vehicles")
        .select(field)
        .eq("id", parseInt(vehicleId))
        .single();

      if (!vehicle || !(vehicle as any)[field]) return res.status(404).send("Not found");

      let photoData: string = (vehicle as any)[field];
      const base64Match = photoData.match(/^data:image\/\w+;base64,(.+)/);
      const rawBase64 = base64Match ? base64Match[1] : photoData;
      const imgBuffer = Buffer.from(rawBase64, "base64");

      const sharp = (await import("sharp")).default;
      const metadata = await sharp(imgBuffer).metadata();
      const w = metadata.width || 800;
      const h = metadata.height || 600;

      const plateH = Math.round(h * 0.18);
      const plateW = Math.round(w * 0.40);
      const plateX = Math.round((w - plateW) / 2);
      const plateY = h - plateH - Math.round(h * 0.05);

      const blurRegion = await sharp(imgBuffer)
        .extract({ left: plateX, top: plateY, width: plateW, height: plateH })
        .blur(30)
        .toBuffer();

      const result = await sharp(imgBuffer)
        .composite([{
          input: blurRegion,
          left: plateX,
          top: plateY,
        }])
        .resize(520, null, { withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();

      res.set({
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      });
      res.send(result);
    } catch (err: any) {
      console.error("[leads] Erro ao servir foto veículo:", err.message);
      res.status(500).send("Error processing image");
    }
  });

  app.get("/api/leads", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const withScore = (data || []).map((l: any) => ({
        ...l,
        score: calcLeadScore(l.setor, l.endereco, l.temperatura, l.valor_estimado),
      }));
      res.json(withScore);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/leads/stats", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseAdmin.from("leads").select("status, temperatura, valor_estimado, setor, origem");
      if (error) throw error;
      const leads = data || [];
      const byStatus: Record<string, number> = {};
      const byTemp: Record<string, number> = {};
      const bySetor: Record<string, number> = {};
      const byOrigem: Record<string, number> = {};
      let totalValor = 0;
      let totalGanho = 0;
      for (const l of leads) {
        byStatus[l.status] = (byStatus[l.status] || 0) + 1;
        byTemp[l.temperatura] = (byTemp[l.temperatura] || 0) + 1;
        bySetor[l.setor || "Outro"] = (bySetor[l.setor || "Outro"] || 0) + 1;
        byOrigem[l.origem || "outro"] = (byOrigem[l.origem || "outro"] || 0) + 1;
        totalValor += Number(l.valor_estimado || 0);
        if (l.status === "ganho") totalGanho += Number(l.valor_estimado || 0);
      }
      res.json({ total: leads.length, byStatus, byTemp, bySetor, byOrigem, totalValor, totalGanho });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const body = req.body;
      const historico = [{
        data: nowBRTString(),
        acao: "Lead criado",
        usuario: user?.name || "Sistema",
        detalhes: `Origem: ${body.origem || "manual"}`,
      }];
      const { data, error } = await supabaseAdmin.from("leads").insert({
        ...body,
        responsavel: body.responsavel || user?.name,
        responsavel_id: body.responsavel_id || user?.id,
        historico,
        created_at: nowBRTString(),
        updated_at: nowBRTString(),
      }).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/leads/:id", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const body = req.body;

      const { data: existing } = await supabaseAdmin.from("leads").select("historico, status").eq("id", id).single();
      const hist = Array.isArray(existing?.historico) ? [...existing.historico] : [];

      if (body.status && body.status !== existing?.status) {
        hist.push({
          data: nowBRTString(),
          acao: `Status alterado: ${existing?.status} → ${body.status}`,
          usuario: user?.name || "Sistema",
          detalhes: body.motivo_perda ? `Motivo: ${body.motivo_perda}` : undefined,
        });
      }
      if (body._nota) {
        hist.push({
          data: nowBRTString(),
          acao: "Nota adicionada",
          usuario: user?.name || "Sistema",
          detalhes: body._nota,
        });
        delete body._nota;
      }

      const { data, error } = await supabaseAdmin.from("leads").update({
        ...body,
        historico: hist,
        updated_at: nowBRTString(),
      }).eq("id", id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/leads/:id", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { error } = await supabaseAdmin.from("leads").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/:id/enviar-apresentacao", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { data: lead, error } = await supabaseAdmin.from("leads").select("*").eq("id", id).single();
      if (error || !lead) return res.status(404).json({ error: "Lead não encontrado" });
      if (!lead.email) return res.status(400).json({ error: "Lead não possui e-mail cadastrado" });

      const trackingId = generateTrackingId();
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const html = await buildEmailHtml(lead, trackingId, baseUrl);

      const { data: existing } = await supabaseAdmin.from("email_queue")
        .select("id").eq("lead_id", id).eq("to_email", lead.email)
        .in("status", ["pendente", "enviado"]).maybeSingle();

      if (existing) {
        return res.json({ ok: true, message: "E-mail já está na fila ou foi enviado recentemente", queued: false });
      }

      await supabaseAdmin.from("email_queue").insert({
        lead_id: Number(id),
        to_email: lead.email,
        to_name: lead.contato_nome || "Responsável",
        empresa: lead.empresa,
        subject: `Torres Vigilância Patrimonial — Segurança para ${lead.empresa}`,
        html_body: html,
        tracking_id: trackingId,
        created_at: nowBRTString(),
      });

      res.json({ ok: true, message: `E-mail adicionado à fila de disparo para ${lead.email}`, queued: true });
    } catch (err: any) {
      console.error("[leads] Erro ao enfileirar:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/enfileirar-todos", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { setores, cidades, temperatura, status_filter } = req.body;
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      let query = supabaseAdmin.from("leads").select("*")
        .not("email", "is", null)
        .not("status", "in", "(ganho,perdido,descartado)");

      if (setores && setores.length > 0) query = query.in("setor", setores);
      if (cidades && cidades.length > 0) query = query.in("cidade", cidades);
      if (temperatura) query = query.eq("temperatura", temperatura);
      if (status_filter) query = query.eq("status", status_filter);

      const { data: leads, error } = await query;
      if (error) throw error;

      let queued = 0;
      let skipped = 0;

      for (const lead of (leads || [])) {
        if (!lead.email) { skipped++; continue; }

        const { data: existing } = await supabaseAdmin.from("email_queue")
          .select("id").eq("lead_id", lead.id).eq("to_email", lead.email)
          .in("status", ["pendente", "enviado", "lido"]).maybeSingle();

        if (existing) { skipped++; continue; }

        const trackingId = generateTrackingId();
        const html = await buildEmailHtml(lead, trackingId, baseUrl);

        await supabaseAdmin.from("email_queue").insert({
          lead_id: lead.id,
          to_email: lead.email,
          to_name: lead.contato_nome || "Responsável",
          empresa: lead.empresa,
          subject: `Torres Vigilância Patrimonial — Segurança para ${lead.empresa}`,
          html_body: html,
          tracking_id: trackingId,
          created_at: nowBRTString(),
        });
        queued++;
      }

      res.json({ ok: true, queued, skipped, total: (leads || []).length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/leads/email-queue", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseAdmin.from("email_queue")
        .select("id, lead_id, to_email, to_name, empresa, subject, status, tracking_id, opened_at, opened_count, replied, replied_at, error_message, sent_at, created_at, campaign_tag")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/leads/email-stats", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      const { data: queue, error } = await supabaseAdmin.from("email_queue")
        .select("status, sent_at, opened_at, replied, created_at");
      if (error) throw error;

      const items = queue || [];
      const pendentes = items.filter(e => e.status === "pendente").length;
      const enviados = items.filter(e => e.status === "enviado" || e.status === "lido").length;
      const lidos = items.filter(e => e.status === "lido").length;
      const respondidos = items.filter(e => e.replied).length;
      const erros = items.filter(e => e.status === "erro").length;
      const total = items.length;

      const dailyMap: Record<string, { enviados: number; lidos: number; respondidos: number; erros: number }> = {};

      for (const item of items) {
        const dateStr = item.sent_at
          ? new Date(item.sent_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
          : item.created_at
            ? new Date(item.created_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
            : null;
        if (!dateStr) continue;

        if (!dailyMap[dateStr]) dailyMap[dateStr] = { enviados: 0, lidos: 0, respondidos: 0, erros: 0 };

        if (item.status === "enviado" || item.status === "lido") dailyMap[dateStr].enviados++;
        if (item.status === "lido") dailyMap[dateStr].lidos++;
        if (item.replied) dailyMap[dateStr].respondidos++;
        if (item.status === "erro") dailyMap[dateStr].erros++;
      }

      const daily = Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([date, counts]) => ({ date, ...counts }));

      const taxaAbertura = enviados > 0 ? Math.round((lidos / enviados) * 100) : 0;
      const taxaResposta = enviados > 0 ? Math.round((respondidos / enviados) * 100) : 0;

      res.json({
        total, pendentes, enviados, lidos, respondidos, erros,
        taxaAbertura, taxaResposta,
        daily,
        batchSize: BATCH_SIZE,
        intervalMinutes: BATCH_INTERVAL_MINUTES,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/email-queue/:id/marcar-respondido", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await supabaseAdmin.from("email_queue").update({
        replied: true,
        replied_at: nowBRTString(),
        status: "lido",
      }).eq("id", id);

      const { data: email } = await supabaseAdmin.from("email_queue").select("lead_id").eq("id", id).single();
      if (email?.lead_id) {
        const { data: lead } = await supabaseAdmin.from("leads").select("historico").eq("id", email.lead_id).single();
        if (lead) {
          const hist = Array.isArray(lead.historico) ? [...lead.historico] : [];
          hist.push({
            data: nowBRTString(),
            acao: "Lead respondeu ao e-mail",
            usuario: "Sistema",
            detalhes: "Marcado como respondido manualmente",
          });
          await supabaseAdmin.from("leads").update({
            historico: hist,
            temperatura: "quente",
            updated_at: nowBRTString(),
          }).eq("id", email.lead_id);
        }
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/leads/email-queue/:id", requireAdminRole, async (req: Request, res: Response) => {
    try {
      await supabaseAdmin.from("email_queue").delete().eq("id", req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/email-queue/limpar-fila", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      const { error } = await supabaseAdmin.from("email_queue").delete().eq("status", "pendente");
      if (error) throw error;
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/disparar-agora", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      await processEmailQueue();
      res.json({ ok: true, message: "Lote disparado manualmente" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/leads/cargos-sugeridos", requireAdminRole, async (_req: Request, res: Response) => {
    res.json({ cargos: CONTATO_CARGOS, emailPrefixes: EMAIL_PREFIXES });
  });

  app.post("/api/leads/:id/converter", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const { data: lead } = await supabaseAdmin.from("leads").select("*").eq("id", id).single();
      if (!lead) return res.status(404).json({ error: "Lead não encontrado" });

      const { data: existingClient } = await supabaseAdmin.from("clients")
        .select("id")
        .eq("cnpj", lead.cnpj || "")
        .maybeSingle();

      if (existingClient) {
        await supabaseAdmin.from("leads").update({
          status: "ganho",
          convertido_client_id: existingClient.id,
          updated_at: nowBRTString(),
        }).eq("id", id);
        return res.json({ clientId: existingClient.id, existing: true });
      }

      const { data: newClient, error: clientErr } = await supabaseAdmin.from("clients").insert({
        name: lead.empresa,
        cnpj: lead.cnpj || null,
        address: lead.endereco || null,
        city: lead.cidade || "São Paulo",
        state: lead.estado || "SP",
        zip: lead.cep || null,
        phone: lead.telefone || null,
        email: lead.email || null,
        contact_person: lead.contato_nome || null,
        segment: lead.setor || null,
      }).select().single();
      if (clientErr) throw clientErr;

      const hist = Array.isArray(lead.historico) ? [...lead.historico] : [];
      hist.push({
        data: nowBRTString(),
        acao: "Convertido em cliente",
        usuario: user?.name || "Sistema",
        detalhes: `Cliente #${newClient.id} criado`,
      });

      await supabaseAdmin.from("leads").update({
        status: "ganho",
        convertido_client_id: newClient.id,
        historico: hist,
        updated_at: nowBRTString(),
      }).eq("id", id);

      res.json({ clientId: newClient.id, existing: false });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/leads/setores", requireAdminRole, async (_req: Request, res: Response) => {
    res.json({ setores: SETORES_ALVO, origens: ORIGENS, statuses: LEAD_STATUSES });
  });

  app.post("/api/leads/buscar-google", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { setor, cidade, estado } = req.body;
      const query = `${setor} ${cidade || "São Paulo"} ${estado || "SP"}`;

      const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.json({ results: [], message: "Google Maps API key não configurada. Cadastre leads manualmente." });
      }

      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=pt-BR&key=${apiKey}`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (data.status !== "OK") {
        return res.json({ results: [], message: `Google Places: ${data.status}` });
      }

      const results = (data.results || []).slice(0, 20).map((place: any) => ({
        empresa: place.name,
        endereco: place.formatted_address,
        google_place_id: place.place_id,
        google_rating: place.rating,
        google_total_reviews: place.user_ratings_total,
        lat: place.geometry?.location?.lat,
        lng: place.geometry?.location?.lng,
      }));

      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/importar-google", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { leads: leadsToImport, setor, origem } = req.body;
      const user = (req as any).user;
      let imported = 0;
      let duplicates = 0;

      for (const lead of leadsToImport) {
        if (lead.google_place_id) {
          const { data: existing } = await supabaseAdmin.from("leads")
            .select("id").eq("google_place_id", lead.google_place_id).maybeSingle();
          if (existing) { duplicates++; continue; }
        }

        const hist = [{
          data: nowBRTString(),
          acao: "Importado do Google Places",
          usuario: user?.name || "Sistema",
          detalhes: `Setor: ${setor}`,
        }];

        await supabaseAdmin.from("leads").insert({
          empresa: lead.empresa,
          endereco: lead.endereco,
          cidade: lead.cidade || "São Paulo",
          estado: lead.estado || "SP",
          setor: setor || null,
          origem: origem || "google_places",
          google_place_id: lead.google_place_id,
          google_rating: lead.google_rating,
          google_total_reviews: lead.google_total_reviews,
          responsavel: user?.name,
          responsavel_id: user?.id,
          historico: hist,
          created_at: nowBRTString(),
          updated_at: nowBRTString(),
        });
        imported++;
      }

      res.json({ imported, duplicates });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log("[leads] Rotas de prospecção/CRM registradas");
}
