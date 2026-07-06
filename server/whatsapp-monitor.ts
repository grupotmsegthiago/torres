/**
 * Monitor de conexão do WhatsApp (Z-API).
 *
 * Por quê: o WhatsApp do bot roda via Z-API (WhatsApp Web pareado a um chip).
 * Quando o chip desconecta (cai internet/bateria, sessão expira, a Meta derruba),
 * a Z-API ACEITA envios (HTTP 200) mas NÃO entrega e NÃO recebe — ou seja, o bot
 * fica "mudo" sem ninguém perceber. Este monitor consulta o status AO VIVO de
 * tempos em tempos e AVISA O DONO POR E-MAIL na hora que cai (e quando volta),
 * pra reconectar rápido. O aviso vai por e-mail de propósito: não dá pra avisar
 * pelo próprio WhatsApp, que é justamente o que está fora do ar.
 *
 * A decisão (alertar ou não) é uma função PURA (`decideMonitorAction`) pra ser
 * testável sem rede/relógio. O wrapper de runtime só faz I/O (status + e-mail).
 */

import nodemailer from "nodemailer";
import { getConnectionStatus, isZapiConfigured, assertExpectedNumber } from "./lib/zapi";
import { shouldRunBackgroundJobs } from "./platform";

// ── Configuração de tempos ───────────────────────────────────────────────────
const CHECK_INTERVAL_MS = 3 * 60 * 1000; // checa a cada 3 min
const FIRST_CHECK_DELAY_MS = 30 * 1000; // 1ª checagem 30s após o boot
// Quantas checagens seguidas "caído" pra CONFIRMAR a queda. Evita falso alarme
// por um soluço transitório (rede/Z-API). 2 checagens ≈ 6 min de confirmação.
const CONFIRM_AFTER = 2;
// Enquanto continuar caído, re-lembra por e-mail a cada 2h (pra não esquecer).
const REMIND_EVERY_MS = 2 * 60 * 60 * 1000;

export interface MonitorConfig {
  confirmAfter: number;
  remindEveryMs: number;
}

const DEFAULT_CFG: MonitorConfig = {
  confirmAfter: CONFIRM_AFTER,
  remindEveryMs: REMIND_EVERY_MS,
};

export interface MonitorState {
  /** Checagens seguidas "caído" ainda NÃO confirmadas. */
  consecutiveDown: number;
  /** Queda CONFIRMADA (passou o debounce). */
  isDown: boolean;
  /** Quando a queda foi confirmada (epoch ms) — null se está no ar. */
  downSince: number | null;
  /** Último e-mail de queda enviado (epoch ms). */
  lastDownAlertAt: number;
  /** Último e-mail de recuperação enviado (epoch ms). */
  lastUpAlertAt: number;
}

export function initialMonitorState(): MonitorState {
  return {
    consecutiveDown: 0,
    isDown: false,
    downSince: null,
    lastDownAlertAt: 0,
    lastUpAlertAt: 0,
  };
}

export type MonitorAction = "none" | "send_down" | "send_recovery";

/** Causa da queda — define o texto do e-mail (a solução é diferente). */
export type DownReason = "disconnected" | "wrong_number" | "unreachable" | "not_configured";

/**
 * Decisão PURA do monitor. Recebe o estado atual e a leitura de conexão agora:
 *   - `connected === true`  → no ar
 *   - `connected === false` → caído (chip desconectado OU Z-API inacessível)
 *   - `connected === null`  → não deu pra confirmar (erro transitório) — conta
 *     como candidato a queda, mas o debounce (confirmAfter) segura o falso alarme.
 *
 * Retorna o novo estado + a ação a executar (mandar e-mail de queda/recuperação).
 */
export function decideMonitorAction(
  state: MonitorState,
  connected: boolean | null,
  now: number,
  cfg: MonitorConfig = DEFAULT_CFG,
): { state: MonitorState; action: MonitorAction } {
  const s: MonitorState = { ...state };

  // ── No ar ──────────────────────────────────────────────────────────────────
  if (connected === true) {
    s.consecutiveDown = 0;
    if (s.isDown) {
      // Estava caído e voltou → recuperação.
      s.isDown = false;
      s.downSince = null;
      s.lastUpAlertAt = now;
      return { state: s, action: "send_recovery" };
    }
    return { state: s, action: "none" };
  }

  // ── Caído / indeterminado ────────────────────────────────────────────────────
  s.consecutiveDown += 1;

  if (!s.isDown) {
    // Ainda não confirmado. Só dispara quando bater o limiar do debounce.
    if (s.consecutiveDown >= cfg.confirmAfter) {
      s.isDown = true;
      s.downSince = now;
      s.lastDownAlertAt = now;
      return { state: s, action: "send_down" };
    }
    return { state: s, action: "none" };
  }

  // Já confirmado caído: re-lembrar periodicamente.
  if (now - s.lastDownAlertAt >= cfg.remindEveryMs) {
    s.lastDownAlertAt = now;
    return { state: s, action: "send_down" };
  }
  return { state: s, action: "none" };
}

// ── Runtime (I/O) ────────────────────────────────────────────────────────────

let runtimeState: MonitorState = initialMonitorState();
let timer: ReturnType<typeof setInterval> | null = null;

/** Estado atual do monitor (pro painel admin mostrar "desconectado desde ..."). */
export function getMonitorState(): { isDown: boolean; downSince: number | null } {
  return { isDown: runtimeState.isDown, downSince: runtimeState.downSince };
}

function alertEmailRecipient(): string {
  return (process.env.WHATSAPP_ALERT_EMAIL || "thiago@grupotmseg.com.br").trim();
}

function getMailTransporter() {
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false },
  });
}

function formatBRT(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function sendAlert(subject: string, html: string): void {
  const transporter = getMailTransporter();
  if (!transporter) {
    console.warn("[wa-monitor] SMTP não configurado — alerta não enviado");
    return;
  }
  const to = alertEmailRecipient();
  const from = `"Torres Vigilância - Sistema" <${process.env.SMTP_FROM || process.env.SMTP_USER || "escolta@torresseguranca.com.br"}>`;
  transporter
    .sendMail({ from, to, subject, html })
    .then(() => console.log(`[wa-monitor] Alerta enviado para ${to}: ${subject}`))
    .catch((err: any) => console.error(`[wa-monitor] Falha ao enviar alerta: ${err?.message || err}`));
}

function downEmailHtml(downSince: number, reason: DownReason): string {
  // "Número errado" tem causa e solução diferentes de "desconectado" — texto próprio.
  if (reason === "wrong_number") {
    return `<div style="font-family:Arial,sans-serif;max-width:600px">
      <h2 style="color:#dc2626">⚠️ WhatsApp do bot está no NÚMERO ERRADO</h2>
      <p>Desde <strong>${formatBRT(downSince)}</strong>, a Z-API está conectada, mas a um <strong>número diferente</strong> do número oficial da Central.</p>
      <h3 style="color:#333;margin-top:20px">O que isso significa</h3>
      <p>Por segurança, o sistema <strong>bloqueia todos os envios</strong> nesse estado (pra não mandar mensagem do número errado). Na prática, o bot está <strong>parado</strong>: não manda atualização pro grupo, não responde quando é marcado e não cobra os agentes.</p>
      <h3 style="color:#333;margin-top:20px">O que fazer (rápido)</h3>
      <ol style="margin:8px 0;padding-left:20px">
        <li>Abra o painel da <strong>Z-API</strong>.</li>
        <li><strong>Desconecte</strong> o número que está conectado agora (o errado).</li>
        <li><strong>Reconecte o número oficial da Central</strong> lendo o QR Code com o celular certo.</li>
      </ol>
      <p style="color:#888;font-size:12px;margin-top:20px">Você receberá um novo e-mail quando voltar ao número correto. Se continuar assim, este aviso se repete a cada 2 horas.</p>
      <p style="color:#666;font-size:12px">Torres Vigilância Patrimonial — Monitoramento Automático</p>
    </div>`;
  }
  return `<div style="font-family:Arial,sans-serif;max-width:600px">
    <h2 style="color:#dc2626">⚠️ WhatsApp do bot DESCONECTOU</h2>
    <p>O WhatsApp da Central (o número do bot) ficou <strong>desconectado</strong> às <strong>${formatBRT(downSince)}</strong>.</p>
    <h3 style="color:#333;margin-top:20px">O que isso significa</h3>
    <p>Enquanto estiver desconectado, o bot <strong>não envia e não recebe</strong> mensagens: não vai mandar atualização pro grupo do cliente, não responde quando é marcado e não cobra os agentes.</p>
    <h3 style="color:#333;margin-top:20px">O que fazer (rápido)</h3>
    <ol style="margin:8px 0;padding-left:20px">
      <li>Abra o painel: <strong>Admin → WhatsApp</strong>.</li>
      <li>Se aparecer o <strong>QR Code</strong>, abra o WhatsApp do celular do bot → <em>Aparelhos conectados</em> → <em>Conectar um aparelho</em> e escaneie.</li>
      <li>Confirme que o status volta para <strong>"WhatsApp conectado"</strong>.</li>
    </ol>
    <p style="color:#888;font-size:12px;margin-top:20px">Você receberá um novo e-mail quando a conexão voltar. Se continuar caído, este aviso se repete a cada 2 horas.</p>
    <p style="color:#666;font-size:12px">Torres Vigilância Patrimonial — Monitoramento Automático</p>
  </div>`;
}

function recoveryEmailHtml(downSince: number | null, recoveredAt: number): string {
  const durTxt = downSince
    ? (() => {
        const secs = Math.max(0, Math.round((recoveredAt - downSince) / 1000));
        const mins = Math.floor(secs / 60);
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return h > 0 ? `${h}h ${m}min` : `${mins}min`;
      })()
    : "—";
  return `<div style="font-family:Arial,sans-serif;max-width:600px">
    <h2 style="color:#16a34a">✅ WhatsApp do bot RECONECTOU</h2>
    <p>O WhatsApp da Central voltou ao ar às <strong>${formatBRT(recoveredAt)}</strong>.</p>
    <table style="border-collapse:collapse;margin:16px 0">
      ${downSince ? `<tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f0fdf4">Caiu em</td><td style="padding:6px 14px;border:1px solid #ddd">${formatBRT(downSince)}</td></tr>` : ""}
      <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f0fdf4">Voltou em</td><td style="padding:6px 14px;border:1px solid #ddd">${formatBRT(recoveredAt)}</td></tr>
      <tr><td style="padding:6px 14px;border:1px solid #ddd;font-weight:bold;background:#f0fdf4">Tempo fora</td><td style="padding:6px 14px;border:1px solid #ddd">${durTxt}</td></tr>
    </table>
    <p style="color:#888;font-size:12px;margin-top:20px">O bot já voltou a enviar e receber normalmente. Nenhuma ação necessária.</p>
    <p style="color:#666;font-size:12px">Torres Vigilância Patrimonial — Monitoramento Automático</p>
  </div>`;
}

/**
 * Lê o estado operacional REAL do bot. Há DOIS modos de falha distintos:
 *   1) chip não pareado (`getConnectionStatus().connected !== true`);
 *   2) pareado, mas num NÚMERO DIFERENTE do oficial → todos os envios ficam
 *      bloqueados (`assertExpectedNumber().ok === false`). Esse caso reporta
 *      `connected:true` no /status, então só o guard de número o detecta.
 * Ambos significam "bot parado". Retorna tri-state + a causa.
 */
async function readHealth(): Promise<{ connected: boolean | null; reason: DownReason | null }> {
  let status;
  try {
    status = await getConnectionStatus();
  } catch {
    return { connected: null, reason: "unreachable" }; // não deu pra confirmar
  }
  if (status.connected !== true) {
    return { connected: false, reason: status.configured ? "disconnected" : "not_configured" };
  }
  // Pareado: confirmar que é o número OFICIAL (senão os envios estão bloqueados).
  try {
    const num = await assertExpectedNumber();
    if (!num.ok) return { connected: false, reason: "wrong_number" };
  } catch {
    // Guard falhou inesperadamente → não derruba (fail-open) pra evitar alarme falso.
  }
  return { connected: true, reason: null };
}

/** Uma rodada de checagem (chamada pelo intervalo). Exportada pra teste/manual. */
export async function runMonitorCheck(now: number = Date.now()): Promise<MonitorAction> {
  const { connected, reason } = await readHealth();

  const prevDownSince = runtimeState.downSince;
  const { state, action } = decideMonitorAction(runtimeState, connected, now);
  runtimeState = state;

  if (action === "send_down" && runtimeState.downSince != null) {
    const r = reason ?? "disconnected";
    const subject = r === "wrong_number"
      ? "⚠️ ALERTA: WhatsApp do bot no NÚMERO ERRADO"
      : "⚠️ ALERTA: WhatsApp do bot DESCONECTOU";
    sendAlert(subject, downEmailHtml(runtimeState.downSince, r));
  } else if (action === "send_recovery") {
    sendAlert("✅ RECUPERADO: WhatsApp do bot reconectou", recoveryEmailHtml(prevDownSince, now));
  }
  return action;
}

/** Inicia o monitor no boot. Sem Z-API configurada, não roda. */
export function initWhatsappMonitor(): void {
  if (!shouldRunBackgroundJobs()) return;
  if (!isZapiConfigured()) {
    console.log("[wa-monitor] Z-API não configurada — monitor de conexão desligado");
    return;
  }
  // Só roda em produção (ou com flag explícita). Senão o sandbox de dev, que
  // compartilha os mesmos secrets (Z-API/SMTP), mandaria e-mails de alerta
  // duplicados/surpresa junto com a produção.
  const enabled = process.env.NODE_ENV === "production" || process.env.WHATSAPP_MONITOR_ENABLED === "true";
  if (!enabled) {
    console.log("[wa-monitor] Monitor desligado fora de produção (defina WHATSAPP_MONITOR_ENABLED=true pra forçar)");
    return;
  }
  if (timer) return; // já iniciado
  console.log("[wa-monitor] Monitor de conexão do WhatsApp ativo (checa a cada 3 min)");
  setTimeout(() => {
    runMonitorCheck().catch((e) => console.error("[wa-monitor] erro na 1ª checagem:", e?.message || e));
  }, FIRST_CHECK_DELAY_MS);
  timer = setInterval(() => {
    runMonitorCheck().catch((e) => console.error("[wa-monitor] erro na checagem:", e?.message || e));
  }, CHECK_INTERVAL_MS);
}

/** Exposto só p/ teste do conteúdo do e-mail por causa. */
export function downEmailHtmlForTest(downSince: number, reason: DownReason): string {
  return downEmailHtml(downSince, reason);
}

/** Reset pra testes. */
export function __resetMonitorForTests(): void {
  runtimeState = initialMonitorState();
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
