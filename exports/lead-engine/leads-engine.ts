// =============================================================================
// LEAD ENGINE — Motor de Prospecção Automática de Leads
// =============================================================================
// Arquivo autocontido. Depende de:
//   - Supabase JS client (ou qualquer client PostgreSQL)
//   - nodemailer
//   - node-cron
//   - Express
//
// Antes de usar, configure o arquivo config.ts (copie de config-example.ts)
// e execute o schema.sql no seu banco de dados.
// =============================================================================

import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import cron from "node-cron";
import {
  EMPRESA, SMTP, REPORT_EMAIL, EMAIL_CADENCE, PROSPECT,
  SEARCH_QUERIES, SETORES_ALVO, SCORING_SETOR, ZONAS_RISCO,
  EXCLUSION_TERMS, BLACKLIST_COMPETITOR, BLACKLIST_BRANDS, POSITIVE_TERMS,
  SKIP_DOMAINS, EMAIL_PREFIXES, CONTATO_CARGOS, USER_AGENTS,
} from "./config";

// =============================================================================
// INICIALIZAÇÃO DO SUPABASE
// =============================================================================
// Configure as variáveis de ambiente:
//   SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
);

// =============================================================================
// HELPERS
// =============================================================================

const LEAD_STATUSES = ["novo", "contatado", "qualificado", "proposta_enviada", "negociacao", "ganho", "perdido", "descartado"] as const;
const ORIGENS = ["google_places", "indicacao", "site", "telefone", "email", "evento", "rede_social", "prospecao_ativa", "outro"] as const;

function nowBRTString(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "");
}

function createSmtpTransporter() {
  if (!SMTP.user || !SMTP.pass) return null;
  return nodemailer.createTransport({
    host: SMTP.host, port: SMTP.port, secure: SMTP.port === 465,
    requireTLS: SMTP.port === 587,
    auth: { user: SMTP.user, pass: SMTP.pass },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false },
  });
}

function randomUA(): string { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }
function randomDelay(min: number, max: number): Promise<void> { return new Promise(r => setTimeout(r, min + Math.random() * (max - min))); }

function generateTrackingId(): string {
  return `trk_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

// =============================================================================
// SCORING
// =============================================================================

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

// =============================================================================
// FILTRO ANTI-CONCORRENTE
// =============================================================================

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

// =============================================================================
// TEMPLATES DE E-MAIL
// =============================================================================
// IMPORTANTE: Edite estes templates para refletir o seu negócio.

function getFollowUpContent(emailNumber: number, lead: any): { subject: string; greeting: string; body: string; cta: string } {
  const empresa = lead.empresa || "sua empresa";
  const nome = lead.contato_nome || "Responsável";

  if (emailNumber <= 1) {
    return {
      subject: `${EMPRESA.nome} — Apresentação para ${empresa}`,
      greeting: `Prezado(a) <strong>${nome}</strong>,`,
      body: `<p style="color:#555;font-size:14px;line-height:1.7;">
        A <strong>${EMPRESA.nome}</strong> apresenta seus serviços para a <strong>${empresa}</strong>.
      </p>
      <div style="background:#f0f4ff;border-left:4px solid #1a1a2e;padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">
        <p style="color:#1a1a2e;font-weight:bold;margin:0 0 8px;font-size:14px;">Nossos Diferenciais:</p>
        <ul style="color:#444;font-size:13px;line-height:2;padding-left:20px;margin:0;">
          <li>Diferencial 1 do seu serviço</li>
          <li>Diferencial 2 do seu serviço</li>
          <li>Diferencial 3 do seu serviço</li>
          <li>Diferencial 4 do seu serviço</li>
        </ul>
      </div>`,
      cta: "SOLICITAR PROPOSTA COMERCIAL",
    };
  } else if (emailNumber === 2) {
    return {
      subject: `${nome}, conheça as soluções da ${EMPRESA.nome}`,
      greeting: `Olá <strong>${nome}</strong>,`,
      body: `<p style="color:#555;font-size:14px;line-height:1.7;">
        Entramos em contato recentemente apresentando nossos serviços. 
        Gostaríamos de reforçar que a <strong>${EMPRESA.nome}</strong> oferece uma solução completa para a <strong>${empresa}</strong>.
      </p>
      <div style="background:#fff3e0;border-left:4px solid #e65100;padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">
        <p style="color:#e65100;font-weight:bold;margin:0 0 8px;font-size:14px;">Por que nos escolher?</p>
        <ul style="color:#444;font-size:13px;line-height:2;padding-left:20px;margin:0;">
          <li>Argumento comercial 1</li>
          <li>Argumento comercial 2</li>
          <li>Argumento comercial 3</li>
        </ul>
      </div>`,
      cta: "QUERO CONHECER A PROPOSTA",
    };
  } else if (emailNumber === 3) {
    return {
      subject: `Como a ${empresa} pode se beneficiar dos nossos serviços`,
      greeting: `<strong>${nome}</strong>, bom dia!`,
      body: `<p style="color:#555;font-size:14px;line-height:1.7;">
        Podemos agendar uma breve conversa para apresentar uma proposta sob medida para a <strong>${empresa}</strong>?
      </p>
      <div style="background:#e8f5e9;border-left:4px solid #2e7d32;padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">
        <p style="color:#2e7d32;font-weight:bold;margin:0 0 8px;font-size:14px;">Podemos ajudar com:</p>
        <p style="color:#444;font-size:13px;line-height:1.8;margin:0;">
          ✅ Benefício 1<br/>
          ✅ Benefício 2<br/>
          ✅ Benefício 3<br/>
          ✅ Benefício 4
        </p>
      </div>`,
      cta: "AGENDAR CONVERSA",
    };
  } else if (emailNumber === 4) {
    return {
      subject: `${nome}, última oportunidade: proposta especial ${EMPRESA.nome}`,
      greeting: `Prezado(a) <strong>${nome}</strong>,`,
      body: `<p style="color:#555;font-size:14px;line-height:1.7;">
        Ainda não tivemos a oportunidade de conversar sobre as operações da <strong>${empresa}</strong>. 
        Gostaríamos de oferecer uma <strong>consultoria gratuita</strong>.
      </p>
      <div style="background:#fce4ec;border-left:4px solid #c62828;padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">
        <p style="color:#c62828;font-weight:bold;margin:0 0 8px;font-size:14px;">Oferta Especial:</p>
        <p style="color:#444;font-size:13px;line-height:1.8;margin:0;">
          🎯 <strong>Consultoria gratuita</strong><br/>
          📊 Relatório completo com recomendações<br/>
          💰 Proposta comercial personalizada sem compromisso
        </p>
      </div>`,
      cta: "QUERO A CONSULTORIA GRATUITA",
    };
  } else {
    return {
      subject: `${EMPRESA.nome} — Estamos à disposição, ${nome}`,
      greeting: `Olá <strong>${nome}</strong>,`,
      body: `<p style="color:#555;font-size:14px;line-height:1.7;">
        Este é nosso último contato por enquanto. Caso a <strong>${empresa}</strong> precise 
        dos nossos serviços no futuro, ficaremos felizes em atendê-los.
      </p>
      <div style="background:#f3e5f5;border-left:4px solid #6a1b9a;padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">
        <p style="color:#6a1b9a;font-weight:bold;margin:0 0 8px;font-size:14px;">Nossos Canais:</p>
        <p style="color:#444;font-size:13px;line-height:1.8;margin:0;">
          📧 ${EMPRESA.email}<br/>
          📞 ${EMPRESA.telefone} (WhatsApp)<br/>
          🌐 ${EMPRESA.site}
        </p>
      </div>`,
      cta: "FALAR CONOSCO",
    };
  }
}

function buildEmailHtml(lead: any, trackingId: string, baseUrl: string, emailNumber?: number): string {
  const pixelUrl = `${baseUrl}/api/leads/pixel/${trackingId}.png`;
  const content = getFollowUpContent(emailNumber || 1, lead);

  return `
<!DOCTYPE html>
<html><body style="font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:0;background:#f8f9fa;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1a1a2e;padding:30px 20px;border-radius:16px 16px 0 0;text-align:center;">
    <h1 style="color:#fff;font-size:22px;margin:0;letter-spacing:1px;">${EMPRESA.nome.toUpperCase()}</h1>
    <p style="color:#a0a0c0;font-size:12px;margin:8px 0 0;">CNPJ ${EMPRESA.cnpj}</p>
  </div>
  <div style="background:#fff;padding:30px 24px;border-radius:0 0 16px 16px;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <p style="color:#333;font-size:15px;line-height:1.7;">
      ${content.greeting}
    </p>
    ${content.body}
    <div style="text-align:center;margin:24px 0;">
      <a href="mailto:${EMPRESA.emailComercial}?subject=Interesse%20-%20${encodeURIComponent(lead.empresa)}" 
         style="display:inline-block;background:#1a1a2e;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
        ${content.cta}
      </a>
    </div>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <div style="text-align:center;">
      <p style="color:#888;font-size:12px;margin:4px 0;"><strong>${EMPRESA.nome}</strong></p>
      <p style="color:#999;font-size:11px;margin:2px 0;">📞 ${EMPRESA.telefone} | ✉️ ${EMPRESA.email}</p>
      <p style="color:#999;font-size:11px;margin:2px 0;">🌐 ${EMPRESA.site}</p>
    </div>
  </div>
</div>
<img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />
</body></html>`;
}

// =============================================================================
// MOTOR DE BUSCA (DuckDuckGo + Bing fallback)
// =============================================================================

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
    console.log(`[lead-engine] DuckDuckGo falhou: ${err.message}`);
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
        console.log(`[lead-engine] Bing fallback: ${urls.length} sites encontrados`);
      }
    } catch (err: any) {
      console.log(`[lead-engine] Bing fallback falhou: ${err.message}`);
    }
  }

  return urls.slice(0, 15);
}

// =============================================================================
// EXTRAÇÃO DE CONTATOS DE SITES
// =============================================================================

async function extractContactFromSite(siteUrl: string): Promise<{ empresa: string; email: string; phone: string; domain: string }> {
  const result = { empresa: "", email: "", phone: "", domain: "" };
  const ua = randomUA();

  try {
    const u = new URL(siteUrl);
    result.domain = u.hostname.replace(/^www\./, "");
  } catch { return result; }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(siteUrl, {
      headers: { "User-Agent": ua, "Accept": "text/html" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!resp.ok) return result;

    const html = await resp.text();
    const chunk = html.substring(0, 50000);

    if (isCompetitor(chunk, result.domain)) {
      console.log(`[lead-engine] [Filtro] Concorrente descartado: ${result.domain}`);
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
            headers: { "User-Agent": ua, "Accept": "text/html" },
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

// =============================================================================
// FILA DE E-MAILS
// =============================================================================

let emailDispatchRunning = false;

async function processEmailQueue() {
  if (emailDispatchRunning) return;
  emailDispatchRunning = true;
  try {
    const transporter = createSmtpTransporter();
    if (!transporter) {
      console.log("[lead-engine] SMTP não configurado, pulando");
      return;
    }

    const { data: pending } = await supabaseAdmin
      .from("email_queue")
      .select("*")
      .eq("status", "pendente")
      .order("created_at", { ascending: true })
      .limit(EMAIL_CADENCE.batchSize);

    if (!pending || pending.length === 0) return;

    console.log(`[lead-engine] Processando lote de ${pending.length} e-mail(s)...`);

    for (const email of pending) {
      try {
        await transporter.sendMail({
          from: SMTP.from,
          to: email.to_email,
          replyTo: SMTP.replyTo,
          subject: email.subject,
          html: email.html_body,
          headers: {
            "X-Lead-Tracking": email.tracking_id,
            "List-Unsubscribe": `<mailto:${EMPRESA.email}?subject=Descadastrar>`,
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

        console.log(`[lead-engine] ✓ Enviado: ${email.to_email} (${email.empresa})`);
        await new Promise(r => setTimeout(r, 2000));
      } catch (err: any) {
        console.error(`[lead-engine] ✗ Erro ${email.to_email}: ${err.message}`);
        await supabaseAdmin.from("email_queue").update({
          status: "erro",
          error_message: err.message,
        }).eq("id", email.id);
      }
    }

    console.log(`[lead-engine] Lote concluído: ${pending.length} processado(s)`);
  } catch (err: any) {
    console.error("[lead-engine] Erro geral:", err.message);
  } finally {
    emailDispatchRunning = false;
  }
}

// =============================================================================
// AUTO-ENQUEUE (enfileira leads que precisam de e-mail)
// =============================================================================

async function autoEnqueueLeads() {
  try {
    const now = new Date();
    const brHour = parseInt(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
    if (brHour < EMAIL_CADENCE.autoEnqueueHourStart || brHour >= EMAIL_CADENCE.autoEnqueueHourEnd) {
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
      : process.env.APP_URL || "http://localhost:5000";

    for (const lead of leads) {
      if (!lead.email) continue;
      const emailsSent = lead.emails_enviados || 0;
      if (emailsSent >= EMAIL_CADENCE.maxEmailsPerLead) continue;

      if (lead.ultimo_contato) {
        const lastContact = new Date(lead.ultimo_contato);
        const diffDays = (now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays < EMAIL_CADENCE.daysBetweenEmails) continue;
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
      const html = buildEmailHtml(lead, trackingId, baseUrl, nextEmailNumber);

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
      console.log(`[lead-engine] ${enqueued} lead(s) enfileirado(s) automaticamente`);
    }
  } catch (err: any) {
    console.error("[lead-engine] autoEnqueue erro:", err.message);
  }
}

// =============================================================================
// PROSPECÇÃO AUTOMÁTICA
// =============================================================================

let autoProspectRunning = false;

async function autoProspect() {
  if (autoProspectRunning) return;
  autoProspectRunning = true;
  const startTime = Date.now();
  let totalNewLeads = 0;

  try {
    const { data: prospectState } = await supabaseAdmin.from("auto_prospect_state")
      .select("query_index, total_found")
      .eq("id", 1)
      .single();

    let queryIndex = prospectState?.query_index || 0;
    let totalFound = prospectState?.total_found || 0;

    for (let cycle = 0; cycle < PROSPECT.queriesPerCycle; cycle++) {
      if (Date.now() - startTime > 110000) break;

      if (queryIndex >= SEARCH_QUERIES.length) {
        queryIndex = 0;
        console.log("[lead-engine] Todas as queries completadas, reiniciando ciclo");
      }

      const query = SEARCH_QUERIES[queryIndex];

      let siteUrls: string[] = [];
      try {
        siteUrls = await searchDuckDuckGo(query);
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
      } catch (err: any) {
        console.log(`[lead-engine] Search error: ${err.message}`);
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
          telefone: contact.phone || null,
          website: siteUrl,
          endereco: null,
          cidade: "São Paulo",
          estado: "SP",
          setor: "Transporte/Logística",
          origem: "auto_prospect",
          status: "novo",
          emails_enviados: 0,
          historico: [{
            data: nowBRTString(),
            acao: "Importado automaticamente via Web Scraping",
            usuario: "Lead Engine",
            detalhes: `Query: "${query}" | Site: ${siteUrl} | E-mail: ${email} | Tel: ${contact.phone || "N/A"} | Real: ${contact.email ? "SIM" : "derivado"}`,
          }],
          created_at: nowBRTString(),
          updated_at: nowBRTString(),
        });

        newInQuery++;
        totalNewLeads++;
        totalFound++;
      }

      console.log(`[lead-engine] Query #${queryIndex} "${query}" → ${siteUrls.length} sites, ${newInQuery} novos leads`);
      queryIndex++;
    }

    await supabaseAdmin.from("auto_prospect_state").update({
      query_index: queryIndex,
      total_found: totalFound,
      last_run: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", 1);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[lead-engine] ✓ Ciclo: ${totalNewLeads} novos leads em ${elapsed}s. Total acumulado: ${totalFound}`);

    if (totalNewLeads > 0) {
      await autoEnqueueLeads();
      await processEmailQueue();
    }
  } catch (err: any) {
    console.error(`[lead-engine] Erro: ${err.message}`);
  } finally {
    autoProspectRunning = false;
  }
}

// =============================================================================
// RELATÓRIO DIÁRIO
// =============================================================================

async function sendDailyEmailReport() {
  try {
    const transporter = createSmtpTransporter();
    if (!transporter) return;

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

    const { data: allQueue } = await supabaseAdmin.from("email_queue").select("status, opened_count, replied, sent_at, created_at");
    const { data: allLeads } = await supabaseAdmin.from("leads").select("status, temperatura, emails_enviados");

    const totalEnviados = allQueue?.filter(e => e.status === "enviado" || e.status === "lido").length || 0;
    const totalLidos = allQueue?.filter(e => e.status === "lido").length || 0;
    const totalRespondidos = allQueue?.filter(e => e.replied).length || 0;
    const totalPendentes = allQueue?.filter(e => e.status === "pendente").length || 0;
    const totalErros = allQueue?.filter(e => e.status === "erro").length || 0;
    const taxaAbertura = totalEnviados > 0 ? Math.round((totalLidos / totalEnviados) * 100) : 0;

    const sentToday = allQueue?.filter(e => {
      const d = e.sent_at ? new Date(e.sent_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : null;
      return d === today && (e.status === "enviado" || e.status === "lido");
    }).length || 0;

    const totalLeads = allLeads?.length || 0;
    const leadsNovos = allLeads?.filter(l => l.status === "novo").length || 0;
    const leadsContatados = allLeads?.filter(l => l.status === "contatado").length || 0;
    const leadsQuentes = allLeads?.filter(l => l.temperatura === "quente").length || 0;

    const reportHtml = `
<!DOCTYPE html>
<html><body style="font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:0;background:#f8f9fa;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1a1a2e;padding:24px 20px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="color:#fff;font-size:18px;margin:0;">RELATÓRIO DIÁRIO — LEAD ENGINE</h1>
    <p style="color:#a0a0c0;font-size:12px;margin:6px 0 0;">${today} | ${EMPRESA.nome}</p>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;">
    <h3 style="color:#1a1a2e;font-size:14px;margin:0 0 12px;">Disparos de Hoje</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#555;">E-mails enviados hoje</td><td style="text-align:right;font-weight:bold;">${sentToday}</td></tr>
      <tr><td style="padding:6px 0;color:#555;">Pendentes na fila</td><td style="text-align:right;font-weight:bold;color:#f59e0b;">${totalPendentes}</td></tr>
      <tr><td style="padding:6px 0;color:#555;">Erros de envio</td><td style="text-align:right;font-weight:bold;color:#ef4444;">${totalErros}</td></tr>
    </table>
    <h3 style="color:#1a1a2e;font-size:14px;margin:20px 0 12px;">Pipeline</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <tr><td style="padding:6px 0;">Total leads</td><td style="text-align:right;font-weight:bold;">${totalLeads}</td></tr>
      <tr><td style="padding:6px 0;">Novos</td><td style="text-align:right;font-weight:bold;">${leadsNovos}</td></tr>
      <tr><td style="padding:6px 0;">Contatados</td><td style="text-align:right;font-weight:bold;">${leadsContatados}</td></tr>
      <tr><td style="padding:6px 0;">Quentes</td><td style="text-align:right;font-weight:bold;color:#ef4444;">${leadsQuentes}</td></tr>
      <tr><td style="padding:6px 0;">Enviados (total)</td><td style="text-align:right;font-weight:bold;">${totalEnviados}</td></tr>
      <tr><td style="padding:6px 0;">Taxa abertura</td><td style="text-align:right;font-weight:bold;color:#22c55e;">${taxaAbertura}%</td></tr>
    </table>
  </div>
</div>
</body></html>`;

    await transporter.sendMail({
      from: SMTP.from,
      to: REPORT_EMAIL.to,
      cc: REPORT_EMAIL.cc,
      subject: `[Lead Engine] Relatório — ${today}`,
      html: reportHtml,
    });

    console.log(`[lead-engine] Relatório diário enviado (${today})`);
  } catch (err: any) {
    console.error("[lead-engine] Erro relatório:", err.message);
  }
}

// =============================================================================
// MIDDLEWARE DE AUTH (ADAPTE PARA O SEU PROJETO)
// =============================================================================
// Substitua por seu middleware de autenticação real.
// Esta é uma versão placeholder que aceita qualquer request com header Authorization.

function requireAuth(req: Request, res: Response, next: Function) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "Não autorizado" });
  next();
}

// =============================================================================
// REGISTRO DAS ROTAS NO EXPRESS
// =============================================================================

export function registerLeadRoutes(app: Express) {
  cron.schedule(`*/${EMAIL_CADENCE.batchIntervalMinutes} * * * *`, () => {
    autoEnqueueLeads()
      .then(() => processEmailQueue())
      .catch(err => console.error("[lead-engine-cron]", err.message));
  });

  cron.schedule(PROSPECT.cronInterval, () => {
    autoProspect().catch(err => console.error("[lead-engine-prospect-cron]", err.message));
  });

  cron.schedule("0 21 * * *", () => {
    sendDailyEmailReport().catch(err => console.error("[lead-engine-report-cron]", err.message));
  }, { timezone: PROSPECT.timezone });

  setTimeout(() => {
    autoProspect().catch(err => console.error("[lead-engine-init]", err.message));
  }, 15000);

  console.log(`[lead-engine] CRON ativo: ${EMAIL_CADENCE.batchSize} e-mails a cada ${EMAIL_CADENCE.batchIntervalMinutes} min`);
  console.log(`[lead-engine] Prospecção automática: ${PROSPECT.queriesPerCycle} queries/ciclo`);
  console.log(`[lead-engine] Relatório diário: 21h BRT`);

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
              detalhes: "O destinatário abriu o e-mail",
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

  app.get("/api/leads", requireAuth, async (_req: Request, res: Response) => {
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

  app.get("/api/leads/stats", requireAuth, async (_req: Request, res: Response) => {
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

  app.post("/api/leads", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = req.body;
      const historico = [{
        data: nowBRTString(),
        acao: "Lead criado",
        usuario: "Sistema",
        detalhes: `Origem: ${body.origem || "manual"}`,
      }];
      const { data, error } = await supabaseAdmin.from("leads").insert({
        ...body,
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

  app.patch("/api/leads/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const body = req.body;

      const { data: existing } = await supabaseAdmin.from("leads").select("historico, status").eq("id", id).single();
      const hist = Array.isArray(existing?.historico) ? [...existing.historico] : [];

      if (body.status && body.status !== existing?.status) {
        hist.push({
          data: nowBRTString(),
          acao: `Status alterado: ${existing?.status} → ${body.status}`,
          usuario: "Sistema",
          detalhes: body.motivo_perda ? `Motivo: ${body.motivo_perda}` : undefined,
        });
      }
      if (body._nota) {
        hist.push({
          data: nowBRTString(),
          acao: "Nota adicionada",
          usuario: "Sistema",
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

  app.delete("/api/leads/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { error } = await supabaseAdmin.from("leads").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/:id/enviar-apresentacao", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { data: lead, error } = await supabaseAdmin.from("leads").select("*").eq("id", id).single();
      if (error || !lead) return res.status(404).json({ error: "Lead não encontrado" });
      if (!lead.email) return res.status(400).json({ error: "Lead sem e-mail" });

      const trackingId = generateTrackingId();
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const html = buildEmailHtml(lead, trackingId, baseUrl);

      await supabaseAdmin.from("email_queue").insert({
        lead_id: Number(id),
        to_email: lead.email,
        to_name: lead.contato_nome || "Responsável",
        empresa: lead.empresa,
        subject: `${EMPRESA.nome} — Apresentação para ${lead.empresa}`,
        html_body: html,
        tracking_id: trackingId,
        created_at: nowBRTString(),
      });

      res.json({ ok: true, message: `E-mail enfileirado para ${lead.email}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/leads/email-queue", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseAdmin.from("email_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/leads/email-stats", requireAuth, async (_req: Request, res: Response) => {
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
      const taxaAbertura = enviados > 0 ? Math.round((lidos / enviados) * 100) : 0;
      const taxaResposta = enviados > 0 ? Math.round((respondidos / enviados) * 100) : 0;

      res.json({
        total: items.length, pendentes, enviados, lidos, respondidos, erros,
        taxaAbertura, taxaResposta,
        batchSize: EMAIL_CADENCE.batchSize,
        intervalMinutes: EMAIL_CADENCE.batchIntervalMinutes,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/disparar-agora", requireAuth, async (_req: Request, res: Response) => {
    try {
      await autoEnqueueLeads();
      await processEmailQueue();
      res.json({ ok: true, message: "Lote disparado manualmente" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/import-csv", requireAuth, async (req: Request, res: Response) => {
    try {
      const { leads: csvLeads } = req.body;
      if (!Array.isArray(csvLeads) || csvLeads.length === 0) {
        return res.status(400).json({ message: "Envie um array 'leads' com os dados" });
      }

      let imported = 0;
      let skipped = 0;

      for (const row of csvLeads) {
        const empresa = (row.empresa || row.company || row.razao_social || "").trim();
        const email = (row.email || row.email_comercial || "").trim().toLowerCase();
        const contato = (row.contato_nome || row.contato || row.responsavel || "").trim();
        const telefone = (row.telefone || row.phone || "").trim();
        const setor = (row.segmento || row.setor || "").trim();
        const cnpj = (row.cnpj || "").trim();
        const cidade = (row.cidade || "").trim();
        const estado = (row.estado || row.uf || "SP").trim();

        if (!empresa || !email) { skipped++; continue; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { skipped++; continue; }

        const { data: existing } = await supabaseAdmin.from("leads")
          .select("id").eq("email", email).limit(1);
        if (existing && existing.length > 0) { skipped++; continue; }

        await supabaseAdmin.from("leads").insert({
          empresa, email,
          contato_nome: contato || null,
          telefone: telefone || null,
          setor: setor || null,
          cnpj: cnpj || null,
          cidade: cidade || null,
          estado: estado || "SP",
          origem: "importacao_csv",
          status: "novo",
          emails_enviados: 0,
          created_at: nowBRTString(),
          updated_at: nowBRTString(),
        });
        imported++;
      }

      res.json({ ok: true, imported, skipped, total: csvLeads.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/leads/auto-prospect/status", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { data: state } = await supabaseAdmin.from("auto_prospect_state")
        .select("*").eq("id", 1).single();

      const { count: totalLeads } = await supabaseAdmin.from("leads")
        .select("id", { count: "exact", head: true });

      const { count: autoLeads } = await supabaseAdmin.from("leads")
        .select("id", { count: "exact", head: true })
        .eq("origem", "auto_prospect");

      res.json({
        running: autoProspectRunning,
        state: state || { query_index: 0, total_found: 0 },
        totalQueries: SEARCH_QUERIES.length,
        currentQuery: SEARCH_QUERIES[state?.query_index || 0] || "—",
        totalLeads: totalLeads || 0,
        autoLeads: autoLeads || 0,
      });
    } catch (err: any) {
      res.json({ running: false, totalQueries: SEARCH_QUERIES.length, totalLeads: 0, autoLeads: 0 });
    }
  });

  app.post("/api/leads/auto-prospect/trigger", requireAuth, async (_req: Request, res: Response) => {
    try {
      autoProspect().catch(err => console.error("[lead-engine-manual]", err.message));
      res.json({ ok: true, message: "Prospecção disparada" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/leads/setores", requireAuth, async (_req: Request, res: Response) => {
    res.json({ setores: SETORES_ALVO, origens: ORIGENS, statuses: LEAD_STATUSES });
  });

  app.get("/api/leads/cargos-sugeridos", requireAuth, async (_req: Request, res: Response) => {
    res.json({ cargos: CONTATO_CARGOS, emailPrefixes: EMAIL_PREFIXES });
  });

  app.post("/api/leads/email-queue/:id/marcar-respondido", requireAuth, async (req: Request, res: Response) => {
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
          hist.push({ data: nowBRTString(), acao: "Lead respondeu ao e-mail", usuario: "Sistema" });
          await supabaseAdmin.from("leads").update({
            historico: hist, temperatura: "quente", updated_at: nowBRTString(),
          }).eq("id", email.lead_id);
        }
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/leads/email-queue/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await supabaseAdmin.from("email_queue").delete().eq("id", req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/email-queue/limpar-fila", requireAuth, async (_req: Request, res: Response) => {
    try {
      await supabaseAdmin.from("email_queue").delete().eq("status", "pendente");
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/enviar-relatorio", requireAuth, async (_req: Request, res: Response) => {
    try {
      await sendDailyEmailReport();
      res.json({ ok: true, message: "Relatório enviado" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log("[lead-engine] Rotas registradas com sucesso");
}
