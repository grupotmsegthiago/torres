/** Mensagem pronta para o vigilante chamar o motorista escoltado no WhatsApp. */

export function saudacaoMotorista(date = new Date()): "Bom dia" | "Boa tarde" | "Boa noite" {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(date));
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function primeiroNome(full?: string | null): string {
  const part = String(full || "").trim().split(/\s+/)[0] || "";
  if (!part) return "";
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

export function mensagemContatoMotorista(vigilanteNome?: string | null, date = new Date()): string {
  const nome = primeiroNome(vigilanteNome) || "vigilante";
  return `${saudacaoMotorista(date)}! Meu nome é ${nome}, sou da empresa Torres Vigilancia Patrimonial e irei acompanha-lo nessa viagem, poderia me informar a situação?`;
}

/** Dígitos nacionais (DDD + número), sem o 55. */
export function telefoneNacional(phone?: string | null): string {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  if (digits.length > 11) digits = digits.slice(-11);
  return digits;
}

export function whatsAppMotoristaUrl(phone?: string | null, vigilanteNome?: string | null, date = new Date()): string | null {
  const digits = telefoneNacional(phone);
  if (digits.length < 10) return null;
  const text = encodeURIComponent(mensagemContatoMotorista(vigilanteNome, date));
  return `https://wa.me/55${digits}?text=${text}`;
}
