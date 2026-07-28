// ─── Fila de envios Z-API com intervalo mínimo (anti-spam / anti-ban) ───────
//
// Mesma regra do Sistema Grupo TM SEG (`server/zapiThrottle.ts`):
// https://developer.z-api.io/tips/best-practices — espaçar mensagens reduz
// risco de o WhatsApp classificar o número como automação/spam.
//
// Todos os envios do bot (send-text / send-image / send-reaction) passam por
// esta fila única: ordem preservada, intervalo mínimo entre disparos.
// A PRIMEIRA mensagem sai na hora; só em sequência o espaçamento entra.
//
// Intervalo: env ZAPI_SEND_MIN_INTERVAL_MS (padrão 20s).

const DEFAULT_MIN_INTERVAL_MS = 20_000;

function minIntervalMs(): number {
  const raw = Number(process.env.ZAPI_SEND_MIN_INTERVAL_MS || "");
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_MIN_INTERVAL_MS;
}

const MAX_HOLD_MS = 45_000;

let lastSendAt = 0;
let chain: Promise<void> = Promise.resolve();
let chainPending = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type ZapiQueueMeta = { queueWaitMs: number; queueDepth: number };

/**
 * Enfileira um envio Z-API garantindo o intervalo mínimo desde o envio
 * anterior. Retorna o resultado (ou o erro) da função original.
 */
export function throttleZapiSend<T>(
  label: string,
  fn: () => Promise<T>,
  meta?: ZapiQueueMeta,
): Promise<T> {
  const depthAtEntry = chainPending;
  chainPending += 1;
  if (meta) meta.queueDepth = depthAtEntry;

  const prev = chain;
  let release!: () => void;
  chain = new Promise<void>((r) => (release = r));
  return (async () => {
    try {
      await prev;
      const wait = lastSendAt + minIntervalMs() - Date.now();
      const queueWaitMs = wait > 0 ? wait : 0;
      if (meta) meta.queueWaitMs = queueWaitMs;
      if (wait > 0) {
        console.log(`[Z-API Fila] Aguardando ${(wait / 1000).toFixed(1)}s (fila=${depthAtEntry}) antes de enviar (${label}).`);
        await sleep(wait);
      }
      const p = fn();
      void Promise.race([p.then(() => undefined, () => undefined), sleep(MAX_HOLD_MS)]).then(() => {
        lastSendAt = Date.now();
        chainPending = Math.max(0, chainPending - 1);
        release();
      });
      return p;
    } catch (e) {
      chainPending = Math.max(0, chainPending - 1);
      release();
      throw e;
    }
  })();
}

/** Reseta fila (testes). */
export function __resetZapiThrottleForTests(): void {
  lastSendAt = 0;
  chain = Promise.resolve();
  chainPending = 0;
}
