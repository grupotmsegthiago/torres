---
name: WhatsApp Z-API anti-bloqueio
description: Por que a Central do WhatsApp toma ban e como o sistema mitiga (variação + ritmo); o status "OK" enganoso da Z-API.
---

# WhatsApp / Z-API — bloqueio e mitigação

**Z-API fala o protocolo do WhatsApp Web (não-oficial).** Isso significa risco de ban PERMANENTE por padrão de robô — não há mitigação 100%. A única solução à prova de bloqueio é a **API oficial do WhatsApp Business (Meta Cloud API)**. Se o dono pedir "resolver de vez", o caminho é migrar pra Cloud API, não ajustar a Z-API.

**O que dispara o ban (causa real do bloqueio de jun/2026):** mensagens IDÊNTICAS, em rajada, repetidas pros mesmos números (o cron cobrava os mesmos agentes a cada 30min com texto byte-a-byte igual).

**Mitigação implementada (`server/lib/whatsapp-humanize.ts`):**
- Texto VARIADO por destinatário (IA gpt-4o-mini temp 1.0 + fallback determinístico-aleatório). Nunca dois iguais.
- Ritmo humano: pausa aleatória (`humanDelayMs`) entre QUALQUER par de envios do ciclo (pacing GLOBAL, não por OS) + `delayTyping`/`delayMessage` da Z-API ("digitando...").
- **Why pacing global:** o mesmo agente pode estar em 2 OSs; flag `firstSend` por-OS deixava envios colados (volta a ser spam).
- Cron `AgenteCentral` tem guard `agentCentralRunning` — com sleeps+IA o ciclo pode passar de 5min e dois ciclos concorrentes re-spammam os mesmos números.
- `buildReminderMessage` usa OpenAI com `timeout:4000, maxRetries:0` — IA lenta NÃO pode segurar o cron; cai no fallback na hora.

**Gotcha do diagnóstico:** o `GET {BASE}/status` da Z-API pode dar `connected:false / "You are not connected."` enquanto o cron loga "enviado OK" — a Z-API aceita o POST com HTTP 200 e NÃO entrega quando o aparelho está desconectado. "OK" no log NÃO prova entrega. Para verificar de verdade, checar o status ao vivo (`.local/test_inspect_zapi_status.mts`).

**How to apply:** ao mexer em qualquer envio de WhatsApp da Central, manter variação de texto + pacing + delayTyping; nunca reintroduzir template fixo em rajada nem pacing por-OS.
