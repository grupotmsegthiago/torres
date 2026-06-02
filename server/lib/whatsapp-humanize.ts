// Camada anti-bloqueio do WhatsApp (Central Torres).
//
// Contexto: a conta da Central foi BLOQUEADA pelo WhatsApp por comportamento de
// robô — mensagens IDÊNTICAS, em rajada, repetidas pros mesmos números. A Z-API
// fala o protocolo do WhatsApp Web (não-oficial), então SEMPRE há risco de ban.
// Estas funções reduzem o risco humanizando o comportamento:
//   1) Variam o TEXTO de cada mensagem (IA + pool de fallback) — nunca dois iguais.
//   2) Dão um RITMO humano: pausas aleatórias entre envios + "digitando...".
//
// Não há garantia de 100%: o único caminho à prova de bloqueio é a API oficial
// do WhatsApp Business (Meta Cloud API). Isto é mitigação, não cura.

import OpenAI from "openai";

/** Promise que resolve após `ms` milissegundos. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/** Inteiro aleatório em [min, max] (inclusivo). */
export function randInt(min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/**
 * Pausa aleatória "humana" em milissegundos entre dois envios. Default 4–18s.
 * Evita rajada (cara de robô). Use entre cada destinatário num loop de envio.
 */
export function humanDelayMs(minMs = 4000, maxMs = 18000): number {
  return randInt(minMs, maxMs);
}

/**
 * Segundos de "digitando..." antes do disparo (passado como delayTyping/delayMessage
 * pro sendText/sendImageWithCaption). Default 2–8s (a Z-API limita a 15).
 */
export function randomTypingSeconds(minS = 2, maxS = 8): number {
  return randInt(minS, maxS);
}

// ── Variação de texto da cobrança de agentes ────────────────────────────────

export interface ReminderContext {
  /** Rótulo da OS, ex.: "TOR-0253" ou "#123". */
  osLabel: string;
  /** "cron" = lembrete periódico automático; "client" = cliente pediu agora. */
  trigger: "cron" | "client";
  /** Estado da missão, se conhecido (ex.: "RODANDO", "PERNOITE"). */
  estado?: string;
  /** Horário da última atualização (ex.: "14:30"), se conhecido. */
  lastTime?: string;
  /** Tempo decorrido desde a última atualização (ex.: "1h 20min"), se conhecido. */
  elapsed?: string;
}

const SAUDACOES = [
  "Olá",
  "Oi",
  "Bom dia/boa tarde",
  "Fala",
  "E aí",
  "Prezados",
  "Srs.",
  "Pessoal",
];

const IDENTIDADES = [
  "aqui é a Central Torres",
  "Central Torres falando",
  "da Central de Operações Torres",
  "Central Torres na escuta",
  "aqui é da Central Torres",
];

const PEDIDOS_CRON = [
  "consegue lançar a atualização da missão no sistema?",
  "pode atualizar a situação pelo app, por favor?",
  "manda pra gente a posição atual pelo sistema quando der?",
  "precisamos da atualização da missão no sistema, pode registrar?",
  "dá um retorno da situação pelo aplicativo, por gentileza?",
  "atualiza a missão no sistema pra gente acompanhar?",
  "como está a missão? Registra a atualização no sistema, por favor.",
];

const PEDIDOS_CLIENT = [
  "o cliente pediu um retorno — consegue atualizar a missão no sistema agora?",
  "chegou uma solicitação do cliente, pode lançar a atualização no sistema?",
  "o cliente está pedindo posição — atualiza a missão no app, por favor?",
  "precisamos repassar a situação ao cliente, registra a atualização no sistema?",
  "cliente solicitou status — manda a atualização da missão pelo sistema, por gentileza?",
];

const FECHOS = [
  "",
  " Obrigado!",
  " Valeu!",
  " Conto com você.",
  " Agradeço!",
  " Fico no aguardo.",
];

/** Capitaliza a primeira letra. */
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Monta uma cobrança variada SEM IA (fallback determinístico-aleatório). Mesmo
 * sem chave de IA, cada chamada produz um texto diferente, mantendo o essencial:
 * identidade da Central, pedido de atualização no sistema e o número da OS.
 */
export function buildReminderFallback(ctx: ReminderContext): string {
  const saud = SAUDACOES[randInt(0, SAUDACOES.length - 1)];
  const ident = IDENTIDADES[randInt(0, IDENTIDADES.length - 1)];
  const pedidos = ctx.trigger === "client" ? PEDIDOS_CLIENT : PEDIDOS_CRON;
  const pedido = pedidos[randInt(0, pedidos.length - 1)];
  const fecho = FECHOS[randInt(0, FECHOS.length - 1)];

  // A referência da OS aparece em posição/formato variável.
  const osRefs = [
    `(OS ${ctx.osLabel})`,
    `referente à OS ${ctx.osLabel}`,
    `na OS ${ctx.osLabel}`,
    `da OS ${ctx.osLabel}`,
  ];
  const osRef = osRefs[randInt(0, osRefs.length - 1)];

  // Monta a frase com a OS embutida no pedido (não numa linha fixa rígida).
  const corpo = `${cap(saud)}, ${ident}. Sobre a missão ${osRef}: ${pedido}${fecho}`.trim();
  return corpo;
}

/**
 * Gera uma cobrança VARIADA via IA (gpt-4o-mini, temperatura alta). Cai no
 * fallback determinístico-aleatório se não houver chave ou a IA falhar.
 * Nunca lança.
 */
export async function buildReminderMessage(ctx: ReminderContext): Promise<string> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) return buildReminderFallback(ctx);

  const ctxInfo = [
    `OS: ${ctx.osLabel}`,
    ctx.estado ? `Estado da missão: ${ctx.estado}` : "",
    ctx.lastTime ? `Última atualização: ${ctx.lastTime}` : "",
    ctx.elapsed ? `Tempo sem atualização: ${ctx.elapsed}` : "",
    ctx.trigger === "client"
      ? "Motivo: o CLIENTE pediu um retorno agora."
      : "Motivo: lembrete periódico da operação.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    // Timeout curto + sem retry: se a IA degradar/rate-limitar, NÃO podemos
    // segurar o cron (que tem pausas humanas no loop). Cai no fallback na hora.
    const openai = new OpenAI({ apiKey, baseURL, timeout: 4000, maxRetries: 0 });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 1.0,
      max_tokens: 120,
      messages: [
        {
          role: "system",
          content:
            `Você é a "Central Torres", central de uma empresa de escolta/segurança, falando NO PRIVADO com um agente de campo via WhatsApp. ` +
            `Escreva UMA mensagem curta (1 a 2 frases) pedindo que o agente registre a ATUALIZAÇÃO da missão NO SISTEMA/APP. ` +
            `Inclua o número da OS naturalmente. VARIE SEMPRE o jeito de falar, a saudação e a estrutura — NUNCA soe igual a uma mensagem anterior (isso causa bloqueio do WhatsApp). ` +
            `Tom cordial e profissional, português brasileiro. No máximo 1 emoji (pode não usar). ` +
            `NÃO invente horários, locais nem dados que não foram fornecidos. Responda só com a mensagem, sem aspas.`,
        },
        {
          role: "user",
          content: ctxInfo,
        },
      ],
    });
    const out = response.choices?.[0]?.message?.content?.trim();
    return out && out.length > 0 ? out : buildReminderFallback(ctx);
  } catch (e: any) {
    console.warn("[whatsapp-humanize] buildReminderMessage falhou:", e?.message);
    return buildReminderFallback(ctx);
  }
}

// ── Variação do cabeçalho do encaminhamento ao grupo ────────────────────────

const FORWARD_HEADERS = [
  "Central Torres — atualização da missão",
  "Central Torres informa",
  "Atualização da Central Torres",
  "Central de Operações Torres",
  "Central Torres — segue o retorno",
  "Retorno da Central Torres",
];

/** Cabeçalho variado pro encaminhamento de updates ao grupo do cliente. */
export function varyForwardHeader(): string {
  return FORWARD_HEADERS[randInt(0, FORWARD_HEADERS.length - 1)];
}
