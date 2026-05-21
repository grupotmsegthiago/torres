import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAdminRole } from "../auth";
import { createSmtpTransporter, getSmtpFrom, nowBRTString } from "./_helpers";
import { normalizePhone, normalizeZip, validateContactFields } from "../lib/normalize-contact";
import cron from "node-cron";
import fs from "fs";
import path from "path";

const AUTOMATION_FILE = path.resolve(".local/leads-automation.json");
let automationEnabled = true;
try {
  if (fs.existsSync(AUTOMATION_FILE)) {
    const raw = JSON.parse(fs.readFileSync(AUTOMATION_FILE, "utf-8"));
    if (typeof raw.enabled === "boolean") automationEnabled = raw.enabled;
  }
} catch (_e) {}
function persistAutomation() {
  try {
    fs.mkdirSync(path.dirname(AUTOMATION_FILE), { recursive: true });
    fs.writeFileSync(AUTOMATION_FILE, JSON.stringify({ enabled: automationEnabled }, null, 2));
  } catch (e: any) {
    console.error("[leads-automation] persist err:", e.message);
  }
}
export function isLeadsAutomationEnabled() { return automationEnabled; }

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
const BATCH_SIZE = 10;
const BATCH_INTERVAL_MINUTES = 5;
let emailDispatchRunning = false;

// DDL movida pra server/db-init.ts em 2026-05 (rodar exec_sql em runtime
// estava saturando o pool do Supabase). Mantemos a função como no-op pra
// preservar os callers existentes.
async function ensureLeadsTable() { /* no-op: handled by db-init.ts */ }

// DDL movida pra server/db-init.ts em 2026-05 (rodar exec_sql em runtime
// estava saturando o pool do Supabase). Mantemos a função como no-op pra
// preservar os callers existentes.
async function ensureEmailQueueTable() { /* no-op: handled by db-init.ts */ }

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

function getFollowUpContent(emailNumber: number, lead: any): { subject: string; greeting: string; body: string; cta: string; } {
  const empresa = lead.empresa || "sua empresa";
  const nome = lead.contato_nome || "Responsável";

  if (emailNumber <= 1) {
    return {
      subject: `Torres Vigilância Patrimonial — Segurança para ${empresa}`,
      greeting: `Prezado(a) <strong>${nome}</strong>,`,
      body: `<p style="color:#555;font-size:14px;line-height:1.7;">
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
      </div>`,
      cta: "SOLICITAR PROPOSTA COMERCIAL",
    };
  } else if (emailNumber === 2) {
    return {
      subject: `${nome}, proteja as cargas da ${empresa} com escolta armada`,
      greeting: `Olá <strong>${nome}</strong>,`,
      body: `<p style="color:#555;font-size:14px;line-height:1.7;">
        Entramos em contato recentemente apresentando nossos serviços de <strong>Escolta Armada</strong>. 
        Gostaríamos de reforçar que a <strong>Torres Vigilância</strong> oferece uma solução completa e personalizada para a segurança logística da <strong>${empresa}</strong>.
      </p>
      <div style="background:#fff3e0;border-left:4px solid #e65100;padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">
        <p style="color:#e65100;font-weight:bold;margin:0 0 8px;font-size:14px;">Por que escolher a Torres?</p>
        <ul style="color:#444;font-size:13px;line-height:2;padding-left:20px;margin:0;">
          <li>Experiência comprovada no transporte de cargas de alto valor</li>
          <li>Sistema digital com fotos, geolocalização e relatórios em tempo real</li>
          <li>Frota própria de viaturas blindadas e caracterizadas</li>
          <li>Equipe altamente treinada e regulamentada pela Polícia Federal</li>
        </ul>
      </div>`,
      cta: "QUERO CONHECER A PROPOSTA",
    };
  } else if (emailNumber === 3) {
    return {
      subject: `Segurança de carga: como a ${empresa} pode reduzir riscos`,
      greeting: `<strong>${nome}</strong>, bom dia!`,
      body: `<p style="color:#555;font-size:14px;line-height:1.7;">
        Sabemos que a segurança no transporte de cargas é uma preocupação constante para empresas como a <strong>${empresa}</strong>. 
        A cada ano, o Brasil registra milhares de ocorrências de roubo de cargas, gerando prejuízos enormes.
      </p>
      <div style="background:#e8f5e9;border-left:4px solid #2e7d32;padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">
        <p style="color:#2e7d32;font-weight:bold;margin:0 0 8px;font-size:14px;">A Torres pode ajudar:</p>
        <p style="color:#444;font-size:13px;line-height:1.8;margin:0;">
          ✅ Análise de risco personalizada para suas rotas<br/>
          ✅ Escolta armada com viaturas rastreadas por GPS<br/>
          ✅ Monitoramento 24h pela central de operações<br/>
          ✅ Relatórios detalhados de cada missão com comprovação fotográfica
        </p>
      </div>
      <p style="color:#555;font-size:14px;line-height:1.7;">
        Podemos agendar uma breve conversa para apresentar uma proposta sob medida para a <strong>${empresa}</strong>?
      </p>`,
      cta: "AGENDAR CONVERSA",
    };
  } else if (emailNumber === 4) {
    return {
      subject: `${nome}, última oportunidade: proposta especial Torres Vigilância`,
      greeting: `Prezado(a) <strong>${nome}</strong>,`,
      body: `<p style="color:#555;font-size:14px;line-height:1.7;">
        Ainda não tivemos a oportunidade de conversar sobre a segurança das operações da <strong>${empresa}</strong>. 
        Gostaríamos de oferecer uma <strong>consultoria gratuita de análise de risco</strong> para suas principais rotas.
      </p>
      <div style="background:#fce4ec;border-left:4px solid #c62828;padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">
        <p style="color:#c62828;font-weight:bold;margin:0 0 8px;font-size:14px;">Oferta Especial:</p>
        <p style="color:#444;font-size:13px;line-height:1.8;margin:0;">
          🎯 <strong>Consultoria gratuita</strong> de análise de risco das suas rotas<br/>
          📊 Relatório completo com pontos críticos e recomendações<br/>
          💰 Proposta comercial personalizada sem compromisso
        </p>
      </div>
      <p style="color:#555;font-size:14px;line-height:1.7;">
        Basta responder este e-mail ou nos chamar no WhatsApp que agendamos uma visita sem custo.
      </p>`,
      cta: "QUERO A CONSULTORIA GRATUITA",
    };
  } else {
    return {
      subject: `Torres Vigilância — Estamos à disposição, ${nome}`,
      greeting: `Olá <strong>${nome}</strong>,`,
      body: `<p style="color:#555;font-size:14px;line-height:1.7;">
        Este é nosso último contato por enquanto. Caso a <strong>${empresa}</strong> precise de serviços de 
        <strong>Escolta Armada Caracterizada</strong> no futuro, ficaremos felizes em atendê-los.
      </p>
      <div style="background:#f3e5f5;border-left:4px solid #6a1b9a;padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">
        <p style="color:#6a1b9a;font-weight:bold;margin:0 0 8px;font-size:14px;">Nossos Canais:</p>
        <p style="color:#444;font-size:13px;line-height:1.8;margin:0;">
          📧 escolta@torresseguranca.com.br<br/>
          📞 (11) 96369-6699 (WhatsApp)<br/>
          🌐 www.torresseguranca.com.br
        </p>
      </div>
      <p style="color:#555;font-size:14px;line-height:1.7;">
        Desejamos sucesso nos negócios da <strong>${empresa}</strong>. 
        Estamos sempre à disposição para uma futura parceria.
      </p>`,
      cta: "FALAR COM A TORRES",
    };
  }
}

async function buildEmailHtml(lead: any, trackingId: string, baseUrl: string, emailNumber?: number): Promise<string> {
  const pixelUrl = `${baseUrl}/api/leads/pixel/${trackingId}.png`;
  const vehiclePhotosHtml = (emailNumber || 1) <= 2 ? await getVehiclePhotosForEmail(baseUrl) : "";
  const content = getFollowUpContent(emailNumber || 1, lead);

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
      ${content.greeting}
    </p>
    ${content.body}
    ${vehiclePhotosHtml}
    <div style="text-align:center;margin:24px 0;">
      <a href="mailto:escolta@torresseguranca.com.br?subject=Interesse%20em%20Escolta%20-%20${encodeURIComponent(lead.empresa)}" 
         style="display:inline-block;background:#1a1a2e;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
        ${content.cta}
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

const AUTO_ENQUEUE_HOUR_START = 7;
const AUTO_ENQUEUE_HOUR_END = 21;
const MAX_EMAILS_PER_LEAD = 5;
const DAYS_BETWEEN_EMAILS = 3;

async function autoEnqueueLeads() {
  try {
    const now = new Date();
    const brHour = parseInt(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
    if (brHour < AUTO_ENQUEUE_HOUR_START || brHour >= AUTO_ENQUEUE_HOUR_END) {
      return;
    }

    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("id, empresa, email, contato_nome, emails_enviados, status, ultimo_contato")
      .not("email", "is", null)
      .in("status", ["novo", "contatado", "qualificado"])
      .order("created_at", { ascending: true });

    if (!leads || leads.length === 0) return;

    let enqueued = 0;
    const baseUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.REPL_SLUG
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : "https://234c7c6a-bb34-4080-913c-2c786d224185-00-1ne4rfjd9dnv5.spock.replit.dev";

    for (const lead of leads) {
      if (!lead.email) continue;
      const emailsSent = lead.emails_enviados || 0;
      if (emailsSent >= MAX_EMAILS_PER_LEAD) continue;

      if (lead.ultimo_contato) {
        const lastContact = new Date(lead.ultimo_contato);
        const diffDays = (now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays < DAYS_BETWEEN_EMAILS) continue;
      }

      const { data: existing } = await supabaseAdmin.from("email_queue")
        .select("id")
        .eq("lead_id", lead.id)
        .in("status", ["pendente"])
        .limit(1);

      if (existing && existing.length > 0) continue;

      const nextEmailNumber = emailsSent + 1;
      const trackingId = generateTrackingId();
      const content = getFollowUpContent(nextEmailNumber, lead);
      const html = await buildEmailHtml(lead, trackingId, baseUrl, nextEmailNumber);

      await supabaseAdmin.from("email_queue").insert({
        lead_id: lead.id,
        to_email: lead.email,
        to_name: lead.contato_nome || "Responsável",
        empresa: lead.empresa,
        subject: content.subject,
        html_body: html,
        tracking_id: trackingId,
        created_at: nowBRTString(),
      });

      enqueued++;
      if (enqueued >= 50) break;
    }

    if (enqueued > 0) {
      console.log(`[auto-enqueue] ${enqueued} lead(s) enfileirado(s) automaticamente`);
    }
  } catch (err: any) {
    console.error("[auto-enqueue] Erro:", err.message);
  }
}

const AUTO_PROSPECT_QUERIES = [
  "transportadora de cargas São Paulo SP",
  "empresa de logística São Paulo SP",
  "transportadora São Paulo SP",
  "logística e distribuição São Paulo SP",
  "transporte de cargas Guarulhos SP",
  "transportadora Campinas SP",
  "logística Osasco SP",
  "transportadora cargas Barueri SP",
  "logística transporte Santos SP",
  "transportadora São Bernardo SP",
  "empresa transporte de cargas ABC paulista",
  "logística armazenagem São Paulo SP",
  "centro de distribuição São Paulo SP",
  "atacadista distribuidor São Paulo SP",
  "transportadora refrigerada São Paulo SP",
  "transporte e-commerce São Paulo SP",
  "operador logístico São Paulo SP",
  "transportadora cargas Jundiaí SP",
  "logística Ribeirão Preto SP",
  "transportadora Sorocaba SP",
  "transportadora cargas Mogi das Cruzes SP",
  "logística São José dos Campos SP",
  "transportadora de mudanças São Paulo SP",
  "frete cargas São Paulo SP",
  "transportadora expressa São Paulo SP",
  "transporte cargas especiais São Paulo SP",
  "transportadora de alimentos São Paulo SP",
  "logística terceirizada São Paulo SP",
  "transportadora regional interior SP",
  "transporte industrial Diadema SP",
  "transportadora de cargas Rio de Janeiro RJ",
  "logística Belo Horizonte MG",
  "transportadora Curitiba PR",
  "transportadora Porto Alegre RS",
  "logística Goiânia GO",
  "transportadora Manaus AM",
  "empresa de escolta armada São Paulo SP",
  "segurança patrimonial São Paulo SP",
  "empresa de segurança São Paulo SP",
  "vigilância patrimonial São Paulo SP",
  "indústria farmacêutica São Paulo SP",
  "distribuidora de medicamentos São Paulo SP",
  "e-commerce logística São Paulo SP",
  "armazém geral São Paulo SP",
  "transporte de valores São Paulo SP",
  "empresa de mudanças São Paulo SP",
  "transportadora carga pesada São Paulo SP",
  "operador portuário Santos SP",
  "agente de cargas São Paulo SP",
  "despachante aduaneiro São Paulo SP",
  "operador logístico alto valor São Paulo SP",
  "distribuidora de medicamentos São Paulo SP contato",
  "transporte eletrônicos carga monitorada SP",
  "transportadora produtos químicos Barueri SP",
  "gerenciamento de risco transporte SP",
  "distribuidora cosméticos São Paulo SP",
  "transporte carga fracionada São Paulo SP",
  "logística reversa São Paulo SP",
  "transportadora de bebidas São Paulo SP",
  "armazém logístico Cajamar SP",
  "condomínio logístico Embu das Artes SP",
  "transporte de autopeças São Paulo SP",
  "distribuidora de alimentos atacado SP",
  "logística integrada Guarulhos SP",
  "transportadora de encomendas SP",
  "centro distribuição Itaquaquecetuba SP",
  "operador logístico Cajamar Jundiaí SP",
  "transportadora cross docking SP",
  "logística last mile São Paulo SP",
  "distribuidora farmacêutica Campinas SP",
  "transporte de carga seca interior SP",
  "transportadora de cosméticos perfumaria SP",
  "distribuidora de materiais elétricos SP",
  "logística fullfilment e-commerce SP",
  "transportadora carga lotação São Paulo SP",
  "empresa de transporte dedicado SP",
  "logística de perecíveis São Paulo SP",
  "transporte de máquinas equipamentos SP",
  "distribuidora de embalagens São Paulo SP",
  "transportadora de papel celulose SP",
  "centro logístico Extrema MG",
  "transportadora de cargas Uberlândia MG",
  "logística transporte Joinville SC",
  "transportadora Florianópolis SC",
  "distribuidora atacado Goiânia GO",

  "procurement manager logística São Paulo SP",
  "strategic sourcing logistics São Paulo",
  "indirect procurement transporte São Paulo SP",
  "supply chain buyer São Paulo SP",
  "commodity manager logística transporte SP",
  "vendor manager transporte logística SP",
  "comprador de logística São Paulo SP",
  "compras indiretas transporte São Paulo SP",
  "gestor de contratos transporte São Paulo SP",
  "sourcing specialist logistics SP",

  "gerente prevenção de perdas São Paulo SP",
  "loss prevention manager São Paulo SP",
  "gerente gerenciamento de risco transporte SP",
  "risk management logística São Paulo SP",
  "security manager logística São Paulo SP",
  "asset protection manager São Paulo SP",
  "gestor torre de controle logística SP",
  "control tower manager logistics São Paulo",
  "coordenador transportes inbound outbound SP",
  "coordenador de transportes São Paulo SP",

  "CEVA logística São Paulo SP contato",
  "DHL supply chain São Paulo SP contato",
  "FedEx logística São Paulo SP contato",
  "Kuehne Nagel São Paulo SP contato",
  "DB Schenker São Paulo SP contato",
  "XPO logistics São Paulo SP contato",
  "Maersk logística São Paulo SP contato",
  "Gefco logística São Paulo SP contato",

  "RFQ transporte escolta São Paulo SP",
  "concorrência transporte monitorado São Paulo SP",
  "licitação transporte escolta armada SP",
  "cotação escolta armada carga valiosa SP",
  "fornecedor escolta armada transporte SP",
  "empresa escolta armada carga monitorada SP",
  "segurança transporte alto valor São Paulo SP",
  "escolta armada rodovia São Paulo SP",
  "monitoramento carga transporte escolta SP",
  "gestão risco transporte rodoviário SP",
];

const QUERIES_PER_CYCLE = 3;
let autoProspectRunning = false;

// DDL movida pra server/db-init.ts em 2026-05.
async function ensureProspectState() { /* no-op: handled by db-init.ts */ }

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0",
];
function randomUA(): string { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }
function randomDelay(min: number, max: number): Promise<void> { return new Promise(r => setTimeout(r, min + Math.random() * (max - min))); }

const UA = randomUA();

const SKIP_DOMAINS = new Set([
  "google.com", "youtube.com", "facebook.com", "instagram.com", "linkedin.com",
  "twitter.com", "wikipedia.org", "blogspot.com", "wordpress.com", "wix.com",
  "squarespace.com", "reclameaqui.com.br", "jusbrasil.com.br", "gov.br",
  "guiamais.com.br", "yelp.com", "tripadvisor.com", "infojobs.com.br",
  "indeed.com", "glassdoor.com", "olx.com.br", "mercadolivre.com.br",
  "telelistas.net", "maps.google.com", "pinterest.com", "tiktok.com",
  "bing.com", "msn.com", "yahoo.com",
]);

function extractUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  const regex = /uddg=(https?%3A%2F%2F[^&"]+)/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const decoded = decodeURIComponent(m[1]);
    let domain = "";
    try { domain = new URL(decoded).hostname.replace(/^www\./, ""); } catch { continue; }
    if (SKIP_DOMAINS.has(domain)) continue;
    const baseUrl = `https://${domain}`;
    if (!urls.includes(baseUrl)) urls.push(baseUrl);
  }
  return urls;
}

function extractUrlsFromBing(html: string): string[] {
  const urls: string[] = [];
  const regex = /href="(https?:\/\/[^"]+)"/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    let domain = "";
    try { domain = new URL(m[1]).hostname.replace(/^www\./, ""); } catch { continue; }
    if (SKIP_DOMAINS.has(domain)) continue;
    if (!domain.endsWith(".com.br") && !domain.endsWith(".com")) continue;
    const baseUrl = `https://${domain}`;
    if (!urls.includes(baseUrl)) urls.push(baseUrl);
  }
  return urls;
}

const EXCLUSION_TERMS = " -vigilância -escolta -segurança -monitoramento -portaria -vigilante";

const BLACKLIST_COMPETITOR = [
  "escolta armada", "vigilância patrimonial", "segurança patrimonial",
  "seguranca privada", "segurança privada", "monitoramento eletrônico",
  "portaria remota", "segurança eletrônica", "empresa de vigilância",
  "serviço de escolta", "escolta de cargas", "rastreamento veicular",
  "central de monitoramento", "cftv", "alarme monitorado",
  "pronta resposta", "ronda motorizada", "vigilância orgânica",
];

const BLACKLIST_BRANDS = [
  "prosegur", "gruber", "ictsi", "verzani", "sandrini", "g4s",
  "protege", "emmo", "aster", "grupofort", "grupo fort", "tps segurança",
  "gocil", "segurpro", "servnac", "brinks", "securitas", "magnus",
  "transvip", "nordeste segurança", "prosseguir", "forteseg",
];

const POSITIVE_TERMS = [
  "transporte", "logística", "logistica", "distribuição", "distribuicao",
  "frota", "carga", "armazém", "armazenagem", "frete", "entrega",
  "atacado", "atacadista", "importação", "exportação", "e-commerce",
  "farmacêutica", "medicamento", "alimento", "bebida", "cosmético",
  "indústria", "manufatura", "fabricante", "produtor", "operador logístico",
];

function isCompetitor(siteContent: string, domain?: string): boolean {
  const text = siteContent.toLowerCase();
  const dom = (domain || "").toLowerCase();

  if (BLACKLIST_BRANDS.some(b => text.includes(b) || dom.includes(b))) return true;

  const competitorHits = BLACKLIST_COMPETITOR.filter(t => text.includes(t)).length;
  if (competitorHits >= 2) return true;
  if (competitorHits === 1) {
    const positiveHits = POSITIVE_TERMS.filter(t => text.includes(t)).length;
    if (positiveHits < 2) return true;
  }
  return false;
}

async function searchDuckDuckGo(query: string): Promise<string[]> {
  const ua = randomUA();
  await randomDelay(500, 2000);

  const needsExclusion = !query.toLowerCase().includes("escolta") && !query.toLowerCase().includes("segurança") && !query.toLowerCase().includes("vigilância");
  const suffix = needsExclusion ? EXCLUSION_TERMS : "";
  const fullQuery = query + " site:.com.br contato" + suffix;

  let urls: string[] = [];
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(fullQuery)}`;
    const resp = await fetch(ddgUrl, {
      headers: { "User-Agent": ua, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9" },
    });
    const html = await resp.text();
    urls = extractUrlsFromHtml(html);
  } catch (err: any) {
    console.log(`[auto-prospect] DuckDuckGo falhou: ${err.message}`);
  }

  if (urls.length === 0) {
    try {
      await randomDelay(1000, 3000);
      const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(fullQuery)}&count=10`;
      const resp = await fetch(bingUrl, {
        headers: { "User-Agent": ua, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9" },
      });
      const html = await resp.text();
      urls = extractUrlsFromBing(html);
      if (urls.length > 0) {
        console.log(`[auto-prospect] Bing fallback: ${urls.length} sites encontrados`);
      }
    } catch (err: any) {
      console.log(`[auto-prospect] Bing fallback falhou: ${err.message}`);
    }
  }

  return urls.slice(0, 15);
}

async function extractContactFromSite(siteUrl: string): Promise<{ empresa: string; email: string; phone: string; domain: string }> {
  const result = { empresa: "", email: "", phone: "", domain: "" };

  try {
    const u = new URL(siteUrl);
    result.domain = u.hostname.replace(/^www\./, "");
  } catch { return result; }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(siteUrl, {
      headers: { "User-Agent": UA, "Accept": "text/html" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!resp.ok) return result;

    const html = await resp.text();
    const chunk = html.substring(0, 50000);

    if (isCompetitor(chunk, result.domain)) {
      console.log(`[auto-prospect] [Filtro] Concorrente descartado: ${result.domain}`);
      return result;
    }

    const titleMatch = chunk.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      result.empresa = titleMatch[1]
        .replace(/\s*[-|–—»]\s*.*/g, "")
        .replace(/Home|Início|Página Inicial/gi, "")
        .trim()
        .substring(0, 100);
    }
    if (!result.empresa || result.empresa.length < 3) {
      result.empresa = result.domain.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    }

    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const foundEmails = chunk.match(emailRegex) || [];
    const skipEmail = ["@example", "@teste", "@test", "@sentry", ".png", ".jpg", ".gif", ".svg", "@wix", "@wordpress", "@google"];
    const goodPrefixes = ["contato", "comercial", "logistica", "operacoes", "vendas", "financeiro", "sac", "atendimento", "info", "faleconosco"];

    const validEmails = foundEmails.filter(e => {
      const l = e.toLowerCase();
      return l.length <= 60 && !skipEmail.some(sp => l.includes(sp));
    });

    validEmails.sort((a, b) => {
      const aP = a.split("@")[0].toLowerCase();
      const bP = b.split("@")[0].toLowerCase();
      const aS = goodPrefixes.findIndex(p => aP.includes(p));
      const bS = goodPrefixes.findIndex(p => bP.includes(p));
      if (aS >= 0 && bS < 0) return -1;
      if (bS >= 0 && aS < 0) return 1;
      return 0;
    });

    result.email = validEmails[0] || "";

    const phoneRegex = /\(?\d{2}\)?\s*\d{4,5}[\s.-]?\d{4}/g;
    const phones = chunk.match(phoneRegex) || [];
    if (phones.length > 0) {
      const raw = phones[0].replace(/[^\d]/g, "");
      if (raw.length >= 10 && raw.length <= 11) {
        result.phone = `(${raw.slice(0, 2)}) ${raw.slice(2, raw.length - 4)}-${raw.slice(-4)}`;
      }
    }

    if (!result.email) {
      const subPages = ["/contato", "/contact", "/fale-conosco", "/sobre", "/about", "/fale_conosco", "/contatos"];
      for (const page of subPages) {
        try {
          const subCtrl = new AbortController();
          const subTimeout = setTimeout(() => subCtrl.abort(), 5000);
          const subResp = await fetch(siteUrl + page, {
            headers: { "User-Agent": UA, "Accept": "text/html" },
            signal: subCtrl.signal,
            redirect: "follow",
          });
          clearTimeout(subTimeout);
          if (!subResp.ok) continue;
          const subHtml = (await subResp.text()).substring(0, 30000);
          const subEmails = (subHtml.match(emailRegex) || []).filter((e: string) => {
            const l = e.toLowerCase();
            return l.length <= 60 && !skipEmail.some(sp => l.includes(sp));
          });
          if (subEmails.length > 0) {
            subEmails.sort((a: string, b: string) => {
              const aP = a.split("@")[0].toLowerCase();
              const bP = b.split("@")[0].toLowerCase();
              const aS = goodPrefixes.findIndex(p => aP.includes(p));
              const bS = goodPrefixes.findIndex(p => bP.includes(p));
              if (aS >= 0 && bS < 0) return -1;
              if (bS >= 0 && aS < 0) return 1;
              return 0;
            });
            result.email = subEmails[0];
            break;
          }
        } catch {}
      }
    }
  } catch {}

  return result;
}

async function autoProspectGoogle() {
  if (autoProspectRunning) return;
  autoProspectRunning = true;
  const startTime = Date.now();
  let totalNewLeads = 0;

  try {
    await ensureProspectState();

    const { data: prospectState } = await supabaseAdmin.from("auto_prospect_state")
      .select("query_index, next_page_token, total_found")
      .eq("id", 1)
      .single();

    let queryIndex = prospectState?.query_index || 0;
    let totalFound = prospectState?.total_found || 0;

    for (let cycle = 0; cycle < QUERIES_PER_CYCLE; cycle++) {
      if (Date.now() - startTime > 110000) break;

      if (queryIndex >= AUTO_PROSPECT_QUERIES.length) {
        queryIndex = 0;
        console.log("[auto-prospect] Todas as queries completadas, reiniciando ciclo");
      }

      const query = AUTO_PROSPECT_QUERIES[queryIndex];

      let siteUrls: string[] = [];
      try {
        siteUrls = await searchDuckDuckGo(query);
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
      } catch (err: any) {
        console.log(`[auto-prospect] DuckDuckGo error: ${err.message}`);
        queryIndex++;
        continue;
      }

      let newInQuery = 0;

      for (const siteUrl of siteUrls) {
        if (Date.now() - startTime > 110000) break;

        const { data: existingSite } = await supabaseAdmin.from("leads")
          .select("id").eq("website", siteUrl).limit(1);
        if (existingSite && existingSite.length > 0) continue;

        const contact = await extractContactFromSite(siteUrl);
        if (!contact.empresa || contact.empresa.length < 3) continue;

        const { data: existingName } = await supabaseAdmin.from("leads")
          .select("id").ilike("empresa", `%${contact.empresa.substring(0, 30)}%`).limit(1);
        if (existingName && existingName.length > 0) continue;

        let email = contact.email;
        if (!email && contact.domain) {
          const prefix = EMAIL_PREFIXES[Math.floor(Math.random() * 3)];
          email = `${prefix}@${contact.domain}`;
        }
        if (!email) continue;

        const { data: emailExists } = await supabaseAdmin.from("leads")
          .select("id").eq("email", email).limit(1);
        if (emailExists && emailExists.length > 0) continue;

        await supabaseAdmin.from("leads").insert({
          empresa: contact.empresa,
          email,
          telefone: normalizePhone(contact.phone),
          website: siteUrl,
          endereco: null,
          cidade: "São Paulo",
          estado: "SP",
          setor: "Transporte/Logística",
          origem: "auto_prospect_google",
          status: "novo",
          emails_enviados: 0,
          historico: [{
            data: nowBRTString(),
            acao: "Importado automaticamente via DuckDuckGo + Web Scraping",
            usuario: "Sistema Auto-Prospect",
            detalhes: `Query: "${query}" | Site: ${siteUrl} | E-mail: ${email} | Tel: ${contact.phone || "N/A"} | Real: ${contact.email ? "SIM" : "derivado"}`,
          }],
          created_at: nowBRTString(),
          updated_at: nowBRTString(),
        });

        newInQuery++;
        totalNewLeads++;
        totalFound++;
      }

      console.log(`[auto-prospect] Query #${queryIndex} "${query}" → ${siteUrls.length} sites, ${newInQuery} novos leads`);
      queryIndex++;
    }

    await supabaseAdmin.from("auto_prospect_state").update({
      query_index: queryIndex,
      next_page_token: null,
      total_found: totalFound,
      last_run: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", 1);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[auto-prospect] ✓ Ciclo: ${totalNewLeads} novos leads em ${elapsed}s. Total acumulado: ${totalFound}`);

    if (totalNewLeads > 0) {
      console.log("[auto-prospect] Enfileirando e-mails para novos leads...");
      await autoEnqueueLeads();
      await processEmailQueue();
    }
  } catch (err: any) {
    console.error(`[auto-prospect] Erro: ${err.message}`);
  } finally {
    autoProspectRunning = false;
  }
}

async function sendDailyEmailReport() {
  try {
    const transporter = createSmtpTransporter();
    if (!transporter) return;

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: allQueue } = await supabaseAdmin.from("email_queue").select("status, opened_count, replied, sent_at, created_at");
    const { data: allLeads } = await supabaseAdmin.from("leads").select("status, temperatura, emails_enviados");

    const totalEnviados = allQueue?.filter(e => e.status === "enviado" || e.status === "lido").length || 0;
    const totalLidos = allQueue?.filter(e => e.status === "lido").length || 0;
    const totalRespondidos = allQueue?.filter(e => e.replied).length || 0;
    const totalPendentes = allQueue?.filter(e => e.status === "pendente").length || 0;
    const totalErros = allQueue?.filter(e => e.status === "erro").length || 0;
    const taxaAbertura = totalEnviados > 0 ? Math.round((totalLidos / totalEnviados) * 100) : 0;
    const taxaResposta = totalEnviados > 0 ? Math.round((totalRespondidos / totalEnviados) * 100) : 0;

    const sentToday = allQueue?.filter(e => {
      const d = e.sent_at ? new Date(e.sent_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : null;
      return d === today && (e.status === "enviado" || e.status === "lido");
    }).length || 0;

    const totalLeads = allLeads?.length || 0;
    const leadsNovos = allLeads?.filter(l => l.status === "novo").length || 0;
    const leadsContatados = allLeads?.filter(l => l.status === "contatado").length || 0;
    const leadsQuentes = allLeads?.filter(l => l.temperatura === "quente").length || 0;
    const leadsMornos = allLeads?.filter(l => l.temperatura === "morno").length || 0;
    const leadsGanhos = allLeads?.filter(l => l.status === "ganho").length || 0;

    const reportHtml = `
<!DOCTYPE html>
<html><body style="font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:0;background:#f8f9fa;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1a1a2e;padding:24px 20px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="color:#fff;font-size:18px;margin:0;">RELATÓRIO DIÁRIO — E-MAIL MARKETING</h1>
    <p style="color:#a0a0c0;font-size:12px;margin:6px 0 0;">${today} | Torres Vigilância Patrimonial</p>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;">
    <h3 style="color:#1a1a2e;font-size:14px;margin:0 0 12px;border-bottom:2px solid #1a1a2e;padding-bottom:6px;">Disparos de Hoje</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#555;">E-mails enviados hoje</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#1a1a2e;">${sentToday}</td></tr>
      <tr><td style="padding:6px 0;color:#555;">Pendentes na fila</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#f59e0b;">${totalPendentes}</td></tr>
      <tr><td style="padding:6px 0;color:#555;">Erros de envio</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#ef4444;">${totalErros}</td></tr>
    </table>

    <h3 style="color:#1a1a2e;font-size:14px;margin:20px 0 12px;border-bottom:2px solid #1a1a2e;padding-bottom:6px;">Acumulado Geral</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#555;">Total enviados</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${totalEnviados}</td></tr>
      <tr><td style="padding:6px 0;color:#555;">Abertos / Lidos</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#22c55e;">${totalLidos} (${taxaAbertura}%)</td></tr>
      <tr><td style="padding:6px 0;color:#555;">Respondidos</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#3b82f6;">${totalRespondidos} (${taxaResposta}%)</td></tr>
    </table>

    <h3 style="color:#1a1a2e;font-size:14px;margin:20px 0 12px;border-bottom:2px solid #1a1a2e;padding-bottom:6px;">Pipeline de Leads</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#555;">Total de leads</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${totalLeads}</td></tr>
      <tr><td style="padding:6px 0;color:#555;">Novos (sem contato)</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#6366f1;">${leadsNovos}</td></tr>
      <tr><td style="padding:6px 0;color:#555;">Contatados</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#8b5cf6;">${leadsContatados}</td></tr>
      <tr><td style="padding:6px 0;color:#555;">🔥 Quentes</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#ef4444;">${leadsQuentes}</td></tr>
      <tr><td style="padding:6px 0;color:#555;">🟡 Mornos</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#f59e0b;">${leadsMornos}</td></tr>
      <tr><td style="padding:6px 0;color:#555;">✅ Ganhos (convertidos)</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#22c55e;">${leadsGanhos}</td></tr>
    </table>

    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
    <p style="color:#999;font-size:11px;text-align:center;margin:0;">
      Relatório automático gerado pelo sistema Torres.<br/>
      Próximos disparos: ${totalPendentes} e-mail(s) na fila, processados a cada ${BATCH_INTERVAL_MINUTES} minutos.
    </p>
  </div>
</div>
</body></html>`;

    await transporter.sendMail({
      from: getSmtpFrom(),
      to: "thiago@grupotmseg.com.br",
      cc: "diretoria@torresseguranca.com.br",
      subject: `[Torres] Relatório E-mail Marketing — ${today}`,
      html: reportHtml,
    });

    console.log(`[daily-report] Relatório diário enviado para diretoria (${today})`);
  } catch (err: any) {
    console.error("[daily-report] Erro ao enviar relatório:", err.message);
  }
}

export function registerLeadRoutes(app: Express) {
  Promise.all([ensureLeadsTable(), ensureEmailQueueTable()]).then(() => {
    console.log("[leads] Tabela leads + email_queue verificadas");
  });

  cron.schedule(`*/${BATCH_INTERVAL_MINUTES} * * * *`, () => {
    if (!automationEnabled) return;
    autoEnqueueLeads()
      .then(() => processEmailQueue())
      .catch(err => console.error("[email-queue-cron]", err.message));
  });

  cron.schedule("*/10 * * * *", () => {
    if (!automationEnabled) return;
    autoProspectGoogle().catch(err => console.error("[auto-prospect-cron]", err.message));
  });

  cron.schedule("0 21 * * *", () => {
    sendDailyEmailReport().catch(err => console.error("[daily-report-cron]", err.message));
  }, { timezone: "America/Sao_Paulo" });

  setTimeout(() => {
    if (!automationEnabled) return;
    autoProspectGoogle().catch(err => console.error("[auto-prospect-init]", err.message));
  }, 15000);

  app.get("/api/leads/automation", requireAdminRole, (_req: Request, res: Response) => {
    res.json({ enabled: automationEnabled });
  });
  app.post("/api/leads/automation", requireAdminRole, (req: Request, res: Response) => {
    const enabled = !!req.body?.enabled;
    automationEnabled = enabled;
    persistAutomation();
    console.log(`[leads-automation] ${enabled ? "ATIVADA" : "DESATIVADA"} via API`);
    res.json({ enabled: automationEnabled });
  });

  console.log(`[email-queue] CRON ativo: ${BATCH_SIZE} e-mails a cada ${BATCH_INTERVAL_MINUTES} minutos (auto-enqueue + disparo)`);
  console.log(`[auto-enqueue] Enfileiramento automático a cada ${BATCH_INTERVAL_MINUTES}min, máx ${MAX_EMAILS_PER_LEAD} e-mails/lead, intervalo ${DAYS_BETWEEN_EMAILS} dias`);
  console.log("[auto-prospect] CRON ativo: prospecção automática Google a cada 10min (3 queries/ciclo, ~60 leads/hora)");
  console.log("[daily-report] CRON ativo: relatório diário às 21h BRT");

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
      const contactErrors = validateContactFields(body, { phones: ["telefone"], zips: ["cep"] });
      if (contactErrors.length) return res.status(400).json({ message: contactErrors[0].message, errors: contactErrors });
      if ("telefone" in body) body.telefone = normalizePhone(body.telefone);
      if ("cep" in body) body.cep = normalizeZip(body.cep);
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

      const contactErrors = validateContactFields(body, { phones: ["telefone"], zips: ["cep"] });
      if (contactErrors.length) return res.status(400).json({ message: contactErrors[0].message, errors: contactErrors });
      if ("telefone" in body) body.telefone = normalizePhone(body.telefone);
      if ("cep" in body) body.cep = normalizeZip(body.cep);
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

      const now = new Date();
      const nextDispatchMs = BATCH_INTERVAL_MINUTES * 60 * 1000;
      const minutesSinceEpoch = now.getTime();
      const nextDispatch = new Date(Math.ceil(minutesSinceEpoch / nextDispatchMs) * nextDispatchMs);
      const secondsUntilNext = Math.max(0, Math.floor((nextDispatch.getTime() - now.getTime()) / 1000));

      const nowBrt = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const currentHour = nowBrt.getHours();
      const autoEnqueueActive = currentHour >= AUTO_ENQUEUE_HOUR_START && currentHour < AUTO_ENQUEUE_HOUR_END;
      const nextAutoEnqueueHour = autoEnqueueActive
        ? (Math.floor(currentHour / 2) + 1) * 2
        : AUTO_ENQUEUE_HOUR_START;

      res.json({
        total, pendentes, enviados, lidos, respondidos, erros,
        taxaAbertura, taxaResposta,
        daily,
        batchSize: BATCH_SIZE,
        intervalMinutes: BATCH_INTERVAL_MINUTES,
        secondsUntilNextDispatch: secondsUntilNext,
        autoEnqueueActive,
        nextAutoEnqueueHour,
        maxEmailsPerLead: MAX_EMAILS_PER_LEAD,
        serverTime: now.toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/leads/dispatch-log", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      const { data: emails, error } = await supabaseAdmin.from("email_queue")
        .select("id, empresa, to_email, subject, status, created_at, sent_at, opened_at, opened_count, replied, replied_at, error_message, lead_id")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      res.json(emails || []);
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
      await autoEnqueueLeads();
      await processEmailQueue();
      res.json({ ok: true, message: "Auto-enqueue + lote disparado manualmente" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/import-csv", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { leads: csvLeads } = req.body;
      if (!Array.isArray(csvLeads) || csvLeads.length === 0) {
        return res.status(400).json({ message: "Envie um array 'leads' com os dados" });
      }

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const row of csvLeads) {
        const empresa = (row.empresa || row.company || row.razao_social || "").trim();
        const email = (row.email || row.email_comercial || "").trim().toLowerCase();
        const contato = (row.contato_nome || row.contato || row.responsavel || "").trim();
        const telefone = (row.telefone || row.phone || row.tel || "").trim();
        const setor = (row.segmento || row.setor || row.segment || row.ramo || "").trim();
        const cnpj = (row.cnpj || "").trim();
        const cidade = (row.cidade || row.city || "").trim();
        const estado = (row.estado || row.uf || row.state || "SP").trim();
        const origem = (row.origem || row.source || "importacao_csv").trim();

        if (!empresa || !email) {
          skipped++;
          continue;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push(`E-mail inválido: ${email} (${empresa})`);
          skipped++;
          continue;
        }

        const { data: existing } = await supabaseAdmin.from("leads")
          .select("id")
          .eq("email", email)
          .limit(1);

        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }

        const { error: insertErr } = await supabaseAdmin.from("leads").insert({
          empresa,
          email,
          contato_nome: contato || null,
          telefone: normalizePhone(telefone),
          setor: setor || null,
          cnpj: cnpj || null,
          cidade: cidade || null,
          estado: estado || "SP",
          origem,
          status: "novo",
          emails_enviados: 0,
          created_at: nowBRTString(),
          updated_at: nowBRTString(),
        });

        if (insertErr) {
          errors.push(`Erro ao inserir ${empresa}: ${insertErr.message}`);
        } else {
          imported++;
        }
      }

      res.json({
        ok: true,
        imported,
        skipped,
        total: csvLeads.length,
        errors: errors.slice(0, 10),
        message: `${imported} lead(s) importado(s), ${skipped} ignorado(s)`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/auto-enqueue", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      await autoEnqueueLeads();
      res.json({ ok: true, message: "Auto-enqueue executado" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/enviar-relatorio", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      await sendDailyEmailReport();
      res.json({ ok: true, message: "Relatório enviado para diretoria" });
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
        zip: normalizeZip(lead.cep),
        phone: normalizePhone(lead.telefone),
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

  app.get("/api/leads/auto-prospect/status", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      const { data: state } = await supabaseAdmin.from("auto_prospect_state")
        .select("*").eq("id", 1).single();

      const { count: totalLeads } = await supabaseAdmin.from("leads")
        .select("id", { count: "exact", head: true });

      const { count: autoLeads } = await supabaseAdmin.from("leads")
        .select("id", { count: "exact", head: true })
        .eq("origem", "auto_prospect_google");

      const { count: leadsWithEmail } = await supabaseAdmin.from("leads")
        .select("id", { count: "exact", head: true })
        .eq("origem", "auto_prospect_google")
        .not("email", "is", null);

      res.json({
        running: autoProspectRunning,
        state: state || { query_index: 0, total_found: 0 },
        totalQueries: AUTO_PROSPECT_QUERIES.length,
        currentQuery: AUTO_PROSPECT_QUERIES[state?.query_index || 0] || "—",
        totalLeads: totalLeads || 0,
        autoLeads: autoLeads || 0,
        leadsWithEmail: leadsWithEmail || 0,
        hasApiKey: true,
      });
    } catch (err: any) {
      res.json({
        running: false,
        state: { query_index: 0, total_found: 0 },
        totalQueries: AUTO_PROSPECT_QUERIES.length,
        currentQuery: AUTO_PROSPECT_QUERIES[0],
        totalLeads: 0,
        autoLeads: 0,
        leadsWithEmail: 0,
        hasApiKey: true,
      });
    }
  });

  app.post("/api/leads/auto-prospect/trigger", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      autoProspectGoogle().catch(err => console.error("[auto-prospect-manual]", err.message));
      res.json({ ok: true, message: "Prospecção automática disparada" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
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
