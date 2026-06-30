/**
 * Notificação WhatsApp (Z-API) — aviso de documento p/ assinatura.
 *
 * Best-effort: nunca quebra a emissão/lembrete de documento. Respeita as travas
 * anti-ban da Z-API (texto VARIADO por destinatário + pacing global no lote).
 * Ver memory whatsapp-zapi-antiban.
 */
import OpenAI from "openai";
import { sendText, assertExpectedNumber } from "./zapi";
import { casualize, randInt, randomTypingSeconds, sleep, humanDelayMs } from "./whatsapp-humanize";
import { normalizePhone } from "./normalize-contact";

/**
 * Resultado de UMA tentativa de aviso por WhatsApp, p/ o RH enxergar quando o
 * vigilante NÃO foi avisado (antes era um boolean descartado):
 *  - "enviado"     → a mensagem saiu de fato pra Z-API.
 *  - "sem_telefone"→ funcionário sem telefone cadastrado (nada a enviar).
 *  - "bloqueado"   → gate FAIL-CLOSED do número oficial barrou (chip da Central errado).
 *  - "falha"       → Z-API recusou/erro de rede ao enviar.
 */
export type DocNotifyStatus = "enviado" | "sem_telefone" | "bloqueado" | "falha";

export interface DocNotifyTarget {
  docId: number;
  emp: any;
}

/** Persiste o status do aviso de um documento (callback dado pela camada de rotas). */
export type PersistDocNotify = (docId: number, status: DocNotifyStatus) => void | Promise<void>;

export function toIntlPhone(rawPhone: string | null | undefined): string | null {
  const digits = normalizePhone(rawPhone);
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12) return digits;
  return null;
}

export function firstName(full?: string | null): string {
  if (!full) return "";
  return String(full).trim().split(/\s+/)[0] || "";
}

/** Cobrança VARIADA sem IA (determinístico-aleatório) — nunca dois textos iguais. */
export function buildDocNotifyFallback(docTitle: string, nome: string, isReminder: boolean): string {
  const saudPool = ["Oi", "Olá", "Opa", "E aí", "Bom dia", "Boa tarde"];
  const identPool = ["aqui é o RH da Torres", "RH Torres por aqui", "é o RH da Torres", "aqui é a Torres Vigilância"];
  const pedidoPool = isReminder
    ? [
        `tem um documento pendente de assinatura: "${docTitle}".`,
        `o documento "${docTitle}" ainda está aguardando sua assinatura.`,
        `passando pra lembrar do documento "${docTitle}" que falta assinar.`,
        `ainda falta assinar o documento "${docTitle}".`,
      ]
    : [
        `tem um novo documento pra você assinar: "${docTitle}".`,
        `foi emitido o documento "${docTitle}" pra sua assinatura.`,
        `chegou um documento novo pra assinar: "${docTitle}".`,
        `geramos o documento "${docTitle}" e precisa da sua assinatura.`,
      ];
  const fechoPool = [
    " Abre o App do Vigilante, no menu Documentos, pra assinar.",
    " É só entrar no App do Vigilante (menu Documentos) e assinar.",
    " Dá uma olhada no App do Vigilante, na aba Documentos.",
    " Assina pelo App do Vigilante quando puder, no menu Documentos.",
  ];
  const saud = saudPool[randInt(0, saudPool.length - 1)];
  const ident = identPool[randInt(0, identPool.length - 1)];
  const pedido = pedidoPool[randInt(0, pedidoPool.length - 1)];
  const fecho = fechoPool[randInt(0, fechoPool.length - 1)];
  const nomePart = nome ? ` ${nome}` : "";
  return casualize(`${saud}${nomePart}, ${ident}. ${pedido}${fecho}`);
}

/** Gera o aviso via IA (gpt-5-mini) com fallback variado. Nunca lança. */
export async function buildDocNotifyMessage(docTitle: string, empName?: string | null, isReminder = false): Promise<string> {
  const nome = firstName(empName);
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (apiKey) {
    try {
      // Timeout curto + sem retry: IA lenta NÃO pode segurar o disparo.
      const openai = new OpenAI({ apiKey, baseURL, timeout: 4000, maxRetries: 0 });
      const resp = await openai.chat.completions.create({
        model: "gpt-5-mini",
        reasoning_effort: "minimal",
        max_completion_tokens: 120,
        messages: [
          {
            role: "system",
            content:
              `Você é o RH da "Torres Vigilância" falando NO PRIVADO com um colaborador via WhatsApp. ` +
              `Escreva UMA mensagem curta (1 a 2 frases) avisando que há um documento "${docTitle}" para ele ASSINAR no App do Vigilante (menu Documentos). ` +
              (isReminder ? `É um LEMBRETE: o documento ainda está pendente de assinatura. ` : "") +
              `VARIE SEMPRE o jeito de falar, a saudação e a estrutura — NUNCA soe igual a uma mensagem anterior (isso causa bloqueio do WhatsApp). ` +
              `Tom de conversa REAL de WhatsApp: pode ser informal e usar abreviações comuns às vezes (vc, tá, pra, pq). No máximo 1 emoji (pode não usar). ` +
              `NÃO invente links, prazos nem dados que não foram fornecidos. Responda só com a mensagem, sem aspas.`,
          },
          { role: "user", content: `Colaborador: ${nome || "colega"}` },
        ],
      });
      const out = resp.choices?.[0]?.message?.content?.trim();
      if (out && out.length > 0) return casualize(out);
    } catch (e: any) {
      console.warn("[signable-docs:notify] IA falhou, usando fallback:", e?.message);
    }
  }
  return buildDocNotifyFallback(docTitle, nome, isReminder);
}

/** Confirmação VARIADA sem IA (determinístico-aleatório) — nunca dois textos iguais. */
export function buildDocSignedFallback(docTitle: string, nome: string): string {
  const saudPool = ["Oi", "Olá", "Opa", "E aí", "Perfeito", "Show"];
  const identPool = ["aqui é o RH da Torres", "RH Torres por aqui", "é o RH da Torres", "aqui é a Torres Vigilância"];
  const confirmPool = [
    `recebemos sua assinatura do documento "${docTitle}". Tá tudo certo!`,
    `o documento "${docTitle}" foi assinado com sucesso. Obrigado!`,
    `assinatura do documento "${docTitle}" confirmada por aqui. Valeu!`,
    `deu tudo certo: o documento "${docTitle}" já consta como assinado.`,
    `confirmado! O documento "${docTitle}" foi assinado e registrado.`,
  ];
  const fechoPool = [
    " Qualquer dúvida é só chamar.",
    " Se precisar de algo, fala com a gente.",
    " Estamos à disposição.",
    "",
  ];
  const saud = saudPool[randInt(0, saudPool.length - 1)];
  const ident = identPool[randInt(0, identPool.length - 1)];
  const confirm = confirmPool[randInt(0, confirmPool.length - 1)];
  const fecho = fechoPool[randInt(0, fechoPool.length - 1)];
  const nomePart = nome ? ` ${nome}` : "";
  return casualize(`${saud}${nomePart}, ${ident}. ${confirm}${fecho}`);
}

/** Gera a confirmação de assinatura via IA (gpt-5-mini) com fallback variado. Nunca lança. */
export async function buildDocSignedMessage(docTitle: string, empName?: string | null): Promise<string> {
  const nome = firstName(empName);
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (apiKey) {
    try {
      // Timeout curto + sem retry: IA lenta NÃO pode segurar o disparo.
      const openai = new OpenAI({ apiKey, baseURL, timeout: 4000, maxRetries: 0 });
      const resp = await openai.chat.completions.create({
        model: "gpt-5-mini",
        reasoning_effort: "minimal",
        max_completion_tokens: 120,
        messages: [
          {
            role: "system",
            content:
              `Você é o RH da "Torres Vigilância" falando NO PRIVADO com um colaborador via WhatsApp. ` +
              `Escreva UMA mensagem curta (1 a 2 frases) CONFIRMANDO que a assinatura do documento "${docTitle}" foi recebida com sucesso e está registrada. ` +
              `É só uma confirmação tranquilizadora — NÃO peça pra assinar de novo nem mencione pendência. ` +
              `VARIE SEMPRE o jeito de falar, a saudação e a estrutura — NUNCA soe igual a uma mensagem anterior (isso causa bloqueio do WhatsApp). ` +
              `Tom de conversa REAL de WhatsApp: pode ser informal e usar abreviações comuns às vezes (vc, tá, pra, pq). No máximo 1 emoji (pode não usar). ` +
              `NÃO invente links, prazos nem dados que não foram fornecidos. Responda só com a mensagem, sem aspas.`,
          },
          { role: "user", content: `Colaborador: ${nome || "colega"}` },
        ],
      });
      const out = resp.choices?.[0]?.message?.content?.trim();
      if (out && out.length > 0) return casualize(out);
    } catch (e: any) {
      console.warn("[signable-docs:notify] IA (confirmação) falhou, usando fallback:", e?.message);
    }
  }
  return buildDocSignedFallback(docTitle, nome);
}

/**
 * Resolve o destinatário do aviso ao RH (grupo ou número). Prioridade:
 *   RH_WHATSAPP_GROUP (id de grupo) > RH_WHATSAPP_PHONE (número avulso).
 * Grupo passa cru (Z-API resolve); número é normalizado p/ formato internacional.
 * Retorna null quando nada está configurado (aviso ao RH simplesmente não sai).
 */
export function resolveRhRecipient(): string | null {
  const group = (process.env.RH_WHATSAPP_GROUP || "").trim();
  if (group) return group;
  const phone = (process.env.RH_WHATSAPP_PHONE || "").trim();
  if (phone) return toIntlPhone(phone);
  return null;
}

/** Aviso VARIADO ao RH (sem IA) — quem assinou qual documento. Nunca repete byte-a-byte. */
export function buildRhDocSignedFallback(docTitle: string, empName?: string | null, empRole?: string | null): string {
  const nome = (empName || "").trim() || "Um colaborador";
  const cargo = (empRole || "").trim();
  const cargoPart = cargo ? ` (${cargo})` : "";
  const saudPool = ["Aviso do RH", "Atualização RH", "RH Torres", "Info RH", "Sistema RH"];
  const corpoPool = [
    `${nome}${cargoPart} acabou de assinar o documento "${docTitle}".`,
    `assinatura recebida: ${nome}${cargoPart} assinou "${docTitle}".`,
    `${nome}${cargoPart} concluiu a assinatura do documento "${docTitle}".`,
    `o documento "${docTitle}" foi assinado por ${nome}${cargoPart}.`,
    `acabou de entrar a assinatura de ${nome}${cargoPart} no documento "${docTitle}".`,
  ];
  const fechoPool = [
    " Já consta como assinado no painel.",
    " Disponível no dashboard de documentos.",
    " Registro disponível no sistema.",
    "",
  ];
  const saud = saudPool[randInt(0, saudPool.length - 1)];
  const corpo = corpoPool[randInt(0, corpoPool.length - 1)];
  const fecho = fechoPool[randInt(0, fechoPool.length - 1)];
  return casualize(`${saud}: ${corpo}${fecho}`);
}

/** Gera o aviso ao RH via IA (gpt-5-mini) com fallback variado. Nunca lança. */
export async function buildRhDocSignedMessage(docTitle: string, empName?: string | null, empRole?: string | null): Promise<string> {
  const nome = (empName || "").trim();
  const cargo = (empRole || "").trim();
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (apiKey) {
    try {
      // Timeout curto + sem retry: IA lenta NÃO pode segurar o disparo.
      const openai = new OpenAI({ apiKey, baseURL, timeout: 4000, maxRetries: 0 });
      const resp = await openai.chat.completions.create({
        model: "gpt-5-mini",
        reasoning_effort: "minimal",
        max_completion_tokens: 120,
        messages: [
          {
            role: "system",
            content:
              `Você é o sistema da "Torres Vigilância" avisando a EQUIPE DE RH (interno) via WhatsApp. ` +
              `Escreva UMA mensagem curta (1 a 2 frases) avisando que o colaborador acabou de ASSINAR o documento "${docTitle}", já registrado no sistema. ` +
              `É um aviso INTERNO pro RH (não fale com o colaborador). Deixe claro QUEM assinou e QUAL documento. ` +
              `VARIE SEMPRE o jeito de falar e a estrutura — NUNCA soe igual a uma mensagem anterior (isso causa bloqueio do WhatsApp). ` +
              `Tom direto e profissional de aviso de sistema. No máximo 1 emoji (pode não usar). ` +
              `NÃO invente links, prazos nem dados que não foram fornecidos. Responda só com a mensagem, sem aspas.`,
          },
          { role: "user", content: `Colaborador: ${nome || "colaborador"}${cargo ? ` — ${cargo}` : ""}` },
        ],
      });
      const out = resp.choices?.[0]?.message?.content?.trim();
      if (out && out.length > 0) return casualize(out);
    } catch (e: any) {
      console.warn("[signable-docs:notify] IA (aviso RH) falhou, usando fallback:", e?.message);
    }
  }
  return buildRhDocSignedFallback(docTitle, nome, cargo);
}

/** Avisa o GRUPO/RESPONSÁVEL do RH que um documento foi assinado. Best-effort: nunca lança. */
export async function notifyRhDocSigned(docTitle: string, empName?: string | null, empRole?: string | null): Promise<boolean> {
  try {
    const dest = resolveRhRecipient();
    if (!dest) {
      console.warn("[signable-docs:notify] RH sem destinatário configurado (defina RH_WHATSAPP_GROUP ou RH_WHATSAPP_PHONE) — aviso ao RH não enviado");
      return false;
    }
    const msg = await buildRhDocSignedMessage(docTitle, empName, empRole);
    const r = await sendText({
      groupOrPhone: dest,
      message: msg,
      delayTypingSeconds: randomTypingSeconds(),
      senderName: "Sistema Torres",
    });
    if (!r.ok) console.warn(`[signable-docs:notify] aviso ao RH falhou: ${r.error}`);
    return !!r.ok;
  } catch (e: any) {
    console.warn("[signable-docs:notify] erro ao avisar o RH:", e?.message);
    return false;
  }
}

/** Dispara o aviso ao RH em background (não bloqueia a resposta HTTP). */
export function notifyRhDocSignedBackground(docTitle: string, empName?: string | null, empRole?: string | null): void {
  notifyRhDocSigned(docTitle, empName, empRole).catch((e) =>
    console.warn("[signable-docs:notify] dispatcher aviso RH falhou:", e?.message),
  );
}

/** Notifica UM colaborador da CONFIRMAÇÃO de assinatura. Best-effort: nunca lança. */
export async function notifyEmployeeDocSigned(emp: any, docTitle: string): Promise<boolean> {
  try {
    const intl = toIntlPhone(emp?.phone);
    if (!intl) {
      console.warn(`[signable-docs:notify] funcionário #${emp?.id} sem telefone — confirmação WhatsApp não enviada`);
      return false;
    }
    const msg = await buildDocSignedMessage(docTitle, emp?.name);
    const r = await sendText({
      groupOrPhone: intl,
      message: msg,
      delayTypingSeconds: randomTypingSeconds(),
      senderName: "RH Torres",
    });
    if (!r.ok) console.warn(`[signable-docs:notify] confirmação falhou p/ #${emp?.id}: ${r.error}`);
    return !!r.ok;
  } catch (e: any) {
    console.warn(`[signable-docs:notify] erro ao confirmar assinatura #${emp?.id}:`, e?.message);
    return false;
  }
}

/** Dispara a confirmação de assinatura em background (não bloqueia a resposta HTTP). */
export function notifyEmployeeDocSignedBackground(emp: any, docTitle: string): void {
  if (!emp) return;
  notifyEmployeeDocSigned(emp, docTitle).catch((e) =>
    console.warn("[signable-docs:notify] dispatcher confirmação falhou:", e?.message),
  );
}

/**
 * Notifica UM colaborador. Best-effort: nunca lança; loga e segue.
 * Retorna o STATUS da tentativa (antes era um boolean descartado) p/ o RH ver
 * quando o vigilante não foi avisado. Ordem dos casos importa: sem telefone →
 * gate de número oficial bloqueado → envio.
 */
export async function notifyEmployeeDoc(emp: any, docTitle: string, isReminder = false): Promise<DocNotifyStatus> {
  try {
    const intl = toIntlPhone(emp?.phone);
    if (!intl) {
      console.warn(`[signable-docs:notify] funcionário #${emp?.id} sem telefone cadastrado — WhatsApp não enviado`);
      return "sem_telefone";
    }
    // Gate FAIL-CLOSED do número oficial: se a Central está pareada no número
    // errado, NENHUM envio sai — sinaliza "bloqueado" em vez de "falha" genérica.
    const gate = await assertExpectedNumber();
    if (!gate.ok) {
      console.warn(`[signable-docs:notify] gate de número oficial bloqueou aviso p/ #${emp?.id} (chip da Central errado)`);
      return "bloqueado";
    }
    const msg = await buildDocNotifyMessage(docTitle, emp?.name, isReminder);
    const r = await sendText({
      groupOrPhone: intl,
      message: msg,
      delayTypingSeconds: randomTypingSeconds(),
      senderName: "RH Torres",
    });
    if (!r.ok) {
      console.warn(`[signable-docs:notify] envio falhou p/ #${emp?.id}: ${r.error}`);
      // O sendText reavalia o gate internamente; se barrou lá, classifica como bloqueado.
      return /número oficial|número diferente/i.test(r.error || "") ? "bloqueado" : "falha";
    }
    return "enviado";
  } catch (e: any) {
    console.warn(`[signable-docs:notify] erro ao notificar #${emp?.id}:`, e?.message);
    return "falha";
  }
}

/**
 * Dispara o aviso em background (não bloqueia a resposta HTTP). No lote, aplica
 * PACING GLOBAL entre destinatários (amortecedor anti-ban principal da Z-API).
 * Opcionalmente PERSISTE o status de cada tentativa via `persist(docId, status)`
 * para o RH enxergar quem não foi avisado.
 */
export function notifyDocsBackground(
  targets: DocNotifyTarget[],
  docTitle: string,
  isReminder = false,
  persist?: PersistDocNotify,
): void {
  const list = (targets || []).filter((t) => t && t.emp);
  if (!list.length) return;
  (async () => {
    for (let i = 0; i < list.length; i++) {
      const status = await notifyEmployeeDoc(list[i].emp, docTitle, isReminder);
      if (persist && list[i].docId) {
        try {
          await persist(list[i].docId, status);
        } catch (e: any) {
          console.warn(`[signable-docs:notify] persist status falhou doc#${list[i].docId}:`, e?.message);
        }
      }
      if (i < list.length - 1) await sleep(humanDelayMs(6000, 26000));
    }
  })().catch((e) => console.warn("[signable-docs:notify] dispatcher falhou:", e?.message));
}
