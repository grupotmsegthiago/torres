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
  "Fala",
  "E aí",
  "Opa",
  "Salve",
  "Prezados",
  "Pessoal",
  "Eai",
  "Boa",
];

const IDENTIDADES = [
  "aqui é a Central Torres",
  "Central Torres falando",
  "da Central de Operações Torres",
  "Central Torres na escuta",
  "aqui é da Central Torres",
  "é a Central Torres aqui",
  "Central Torres por aqui",
];

const PEDIDOS_CRON = [
  "consegue lançar a atualização da missão no sistema?",
  "pode atualizar a situação pelo app, por favor?",
  "manda pra gente a posição atual pelo sistema quando der?",
  "precisamos da atualização da missão no sistema, pode registrar?",
  "dá um retorno da situação pelo aplicativo, por gentileza?",
  "atualiza a missão no sistema pra gente acompanhar?",
  "como está a missão? Registra a atualização no sistema, por favor.",
  "consegue dar uma atualizada no sistema pra gente?",
  "tudo certo por aí? Atualiza a missão no app quando puder.",
  "passa pra gente como está, é só registrar a atualização no sistema.",
  "lança a atualização no sistema quando der uma brecha?",
];

const PEDIDOS_CLIENT = [
  "o cliente pediu um retorno — consegue atualizar a missão no sistema agora?",
  "chegou uma solicitação do cliente, pode lançar a atualização no sistema?",
  "o cliente está pedindo posição — atualiza a missão no app, por favor?",
  "precisamos repassar a situação ao cliente, registra a atualização no sistema?",
  "cliente solicitou status — manda a atualização da missão pelo sistema, por gentileza?",
  "o cliente cobrou aqui, consegue atualizar a missão no sistema rapidinho?",
  "deu uma cobrada do cliente — lança a atualização no app pra gente repassar?",
];

const FECHOS = [
  "",
  " Obrigado!",
  " Valeu!",
  " Conto com você.",
  " Agradeço!",
  " Fico no aguardo.",
  " Vlw!",
  " Abraço!",
  " Tmj!",
  " Qualquer coisa, chama.",
];

/** Capitaliza a primeira letra. */
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Hora atual (0–23) no fuso de Brasília (BRT). */
function brtHour(): number {
  const h = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10,
  );
  return Number.isFinite(h) ? h % 24 : 12;
}

/** Saudação coerente com a hora do dia em BRT ("Bom dia"/"Boa tarde"/"Boa noite"). */
function saudacaoPorHora(): string {
  const h = brtHour();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// Abreviações/gírias humanas de WhatsApp. Cada par é aplicado de forma
// PROBABILÍSTICA (não em toda mensagem) pra quebrar o "texto perfeito" que os
// filtros de spam do WhatsApp procuram — humano abrevia e erra, robô não.
// NÃO inclui palavras essenciais (atualização/sistema/app/OS) pra não quebrar o
// sentido nem os anchors de teste.
const CASUAL_PAIRS: Array<[string, string]> = [
  ["vocês", "vcs"],
  ["você", "vc"],
  ["está", "tá"],
  ["estou", "tô"],
  ["para", "pra"],
  ["por favor", "pfv"],
  ["por gentileza", "por favor"],
  ["porque", "pq"],
  ["também", "tb"],
  ["qualquer", "qq"],
  ["mensagem", "msg"],
  ["quando", "qnd"],
];

// Bordas de palavra cientes de acento: \b do JS é baseado em [A-Za-z0-9_], então
// não casa antes/depois de letras acentuadas (você, está) — por isso usamos
// lookarounds que tratam acentos como letra.
const CASUAL_RE: Array<[RegExp, string]> = CASUAL_PAIRS.map(([word, repl]) => [
  new RegExp(`(?<![A-Za-zÀ-ÿ])${word}(?![A-Za-zÀ-ÿ])`, "gi"),
  repl,
]);

/**
 * Aplica abreviações/gírias humanas com probabilidade `prob` POR par (default
 * 0.4). Resultado: algumas mensagens saem informais ("vc", "tá", "pra"), outras
 * formais — variação que dificulta a detecção de padrão de robô. Nunca toca em
 * palavras essenciais (atualização/sistema/app/OS/número da OS).
 */
export function casualize(text: string, prob = 0.4): string {
  let out = text;
  for (const [re, repl] of CASUAL_RE) {
    if (Math.random() < prob) out = out.replace(re, repl);
  }
  return out;
}

/**
 * Monta uma cobrança variada SEM IA (fallback determinístico-aleatório). Mesmo
 * sem chave de IA, cada chamada produz um texto diferente, mantendo o essencial:
 * identidade da Central, pedido de atualização no sistema e o número da OS.
 */
export function buildReminderFallback(ctx: ReminderContext): string {
  // Pool de saudações + a saudação coerente com a hora (aparece às vezes).
  const saudPool = [...SAUDACOES, saudacaoPorHora(), saudacaoPorHora()];
  const saud = saudPool[randInt(0, saudPool.length - 1)];
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
  // Humaniza: aplica abreviações/gírias de forma probabilística.
  return casualize(corpo);
}

/**
 * Gera uma cobrança VARIADA via IA (gpt-5-mini, temperatura padrão). Cai no
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
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      max_completion_tokens: 120,
      messages: [
        {
          role: "system",
          content:
            `Você é a "Central Torres", central de uma empresa de escolta/segurança, falando NO PRIVADO com um agente de campo via WhatsApp. ` +
            `Escreva UMA mensagem curta (1 a 2 frases) pedindo que o agente registre a ATUALIZAÇÃO da missão NO SISTEMA/APP. ` +
            `Inclua o número da OS naturalmente. VARIE SEMPRE o jeito de falar, a saudação e a estrutura — NUNCA soe igual a uma mensagem anterior (isso causa bloqueio do WhatsApp). ` +
            `Tom de conversa REAL de WhatsApp entre colegas de trabalho: pode ser informal e descontraído, usar abreviações comuns às vezes (vc, tá, pra, pq, blz, vlw) e nem sempre pontuação perfeita — soe como uma PESSOA digitando no celular, não como um robô com texto impecável. No máximo 1 emoji (pode não usar). ` +
            `NÃO invente horários, locais nem dados que não foram fornecidos. Responda só com a mensagem, sem aspas.`,
        },
        {
          role: "user",
          content: ctxInfo,
        },
      ],
    });
    const out = response.choices?.[0]?.message?.content?.trim();
    // Humaniza ainda mais o texto da IA com abreviações probabilísticas.
    return out && out.length > 0 ? casualize(out) : buildReminderFallback(ctx);
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

// ── Reforços anti-bloqueio: timing irregular, "digitando" proporcional, ordem ─

/**
 * Embaralha um array (Fisher-Yates) e devolve uma CÓPIA nova. Usado pra mandar
 * as cobranças em ordem aleatória a cada ciclo — robô manda sempre na mesma
 * sequência (mesma OS, mesmo agente primeiro); humano não tem ordem fixa.
 */
export function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Segundos de "digitando..." PROPORCIONAIS ao tamanho da mensagem (humano leva
 * mais tempo digitando texto maior; robô dispara instantâneo ou com tempo fixo).
 * ~1s a cada 14 caracteres + jitter, limitado a [minS, maxS] (Z-API máx 15).
 */
export function typingSecondsForMessage(msg: string, minS = 3, maxS = 14): number {
  const base = Math.round((msg?.length || 0) / 14) + randInt(0, 2);
  return Math.min(maxS, Math.max(minS, base));
}

/**
 * Intervalo (minutos) até a PRÓXIMA re-cobrança da MESMA OS, com BACKOFF + jitter.
 * Robô re-cobra de 30 em 30 min, eternamente e cravado no minuto — padrão óbvio
 * de automação. Aqui o intervalo cresce conforme o agente ignora (humano cansa
 * de insistir no mesmo ritmo) e nunca é um número redondo fixo. Sempre >= 30min,
 * então só REDUZ volume em relação ao comportamento antigo.
 *
 * @param count quantas cobranças já saíram pra essa OS (reminder_count).
 */
export function reminderIntervalMinutes(count: number): number {
  const c = Math.max(0, count || 0);
  if (c <= 2) return 30 + randInt(0, 12);   // ~30–42min
  if (c <= 4) return 50 + randInt(0, 15);   // ~50–65min
  if (c <= 6) return 80 + randInt(0, 20);   // ~80–100min
  return 120 + randInt(0, 30);              // ~120–150min (já insistiu muito)
}
