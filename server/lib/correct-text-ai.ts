/**
 * Corrige ortografia/acentuação/pontuação e dá nexo a um texto curto,
 * SEM inventar fato novo e SEM traduzir. Usado pra ajustar mensagens
 * cruas dos agentes em campo antes de encaminhar pro WhatsApp do cliente.
 *
 * Fail-open: se a OpenAI falhar/expirar, devolve o texto original cru.
 */
import OpenAI from "openai";

const SYSTEM_PROMPT = `Você corrige mensagens curtas escritas por agentes de segurança em campo, no celular.

REGRAS:
1. Corrija ortografia, acentos, pontuação e capitalização.
2. Reescreva o mínimo necessário pra a mensagem ficar clara e com nexo em português brasileiro.
3. NUNCA invente informação que não está no texto original (não criar horários, locais, placas, nomes).
4. NUNCA traduza — mantenha em português.
5. Mantenha jargão de segurança/escolta intacto (ex.: "OS", "VTR", "rota", "ponto de apoio", "PA", "QAP", "QSL", "QRA", "vulto", "abordagem", "ocorrência", "carreta", "cavalo", "engate", "deslocamento", "checkpoint").
6. Mantenha números, placas, nomes próprios e horários exatamente como estão.
7. Se a mensagem já estiver correta, devolva ela igual.
8. Resposta: SÓ o texto corrigido, sem aspas, sem comentário, sem prefixo.`;

export async function correctAgentMessage(raw: string): Promise<string> {
  const text = (raw || "").trim();
  if (!text) return "";
  // Heurística rápida: textos minúsculos não precisam de IA.
  if (text.length < 4) return text;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return text;

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      max_completion_tokens: 400,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    });
    const corrected = response.choices?.[0]?.message?.content?.trim();
    if (!corrected) return text;
    // Defesa final: se a IA devolveu algo muito maior (>2x), provavelmente alucinou.
    if (corrected.length > Math.max(text.length * 2 + 50, 200)) return text;
    return corrected;
  } catch (err: any) {
    console.warn("[correct-text-ai] OpenAI falhou, devolvendo texto cru:", err?.message);
    return text;
  }
}
