/**
 * Kill-switch da integração Banco Inter.
 *
 * Decisão de negócio: Inter não é mais utilizado.
 * Ausência ou valor não-verdadeiro de INTER_INTEGRATION_ENABLED = DESATIVADO.
 * Credenciais INTER_* sozinhas NÃO reativam a integração.
 *
 * HTTP padrão quando desativado: 410 Gone.
 * Quando a flag está on mas a config operacional falta: 503 (fail-closed).
 */

export const INTER_INTEGRATION_ENV = "INTER_INTEGRATION_ENABLED";

const TRUTHY = new Set(["1", "true", "yes", "on"]);

/** Integração ativa somente com valor explícito verdadeiro. */
export function isInterIntegrationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = String(env[INTER_INTEGRATION_ENV] ?? "").trim().toLowerCase();
  return TRUTHY.has(raw);
}

export type InterGateReason =
  | "disabled"
  | "not_configured"
  | "ok";

export interface InterGateResult {
  allow: boolean;
  reason: InterGateReason;
  status: number;
  body: {
    ok: false;
    code: string;
    message: string;
  } | null;
}

const DISABLED_BODY = {
  ok: false as const,
  code: "INTER_DISABLED",
  message: "Integração Banco Inter desativada.",
};

const NOT_CONFIGURED_BODY = {
  ok: false as const,
  code: "INTER_NOT_CONFIGURED",
  message: "Integração Banco Inter habilitada, mas configuração operacional ausente.",
};

/**
 * Gate para mutações / webhook / chamadas externas Inter.
 * `configured` vem de isInterConfigured() — não lê secrets aqui.
 */
export function evaluateInterWriteGate(opts: {
  configured: boolean;
  env?: NodeJS.ProcessEnv;
}): InterGateResult {
  const env = opts.env ?? process.env;
  if (!isInterIntegrationEnabled(env)) {
    return {
      allow: false,
      reason: "disabled",
      status: 410,
      body: DISABLED_BODY,
    };
  }
  if (!opts.configured) {
    return {
      allow: false,
      reason: "not_configured",
      status: 503,
      body: NOT_CONFIGURED_BODY,
    };
  }
  return { allow: true, reason: "ok", status: 200, body: null };
}

/** Nova cobrança com gateway=inter só se a integração estiver operacional. */
export function isInterGatewayAllowedForNewCharge(opts: {
  configured: boolean;
  env?: NodeJS.ProcessEnv;
}): boolean {
  return evaluateInterWriteGate(opts).allow;
}

export function interStatusWhenDisabled(): {
  connected: false;
  disabled: true;
  message: string;
} {
  return {
    connected: false,
    disabled: true,
    message: DISABLED_BODY.message,
  };
}
