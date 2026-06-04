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

**Gotcha "painel Conectado mas robô não funciona":** se o painel da Z-API mostra "Conectado" mas o `GET {BASE}/status` do sistema dá `connected:false`, quase sempre os secrets `ZAPI_INSTANCE_ID`/`ZAPI_TOKEN` apontam pra uma INSTÂNCIA ANTIGA, diferente da que o dono está olhando no painel (instância recriada). Conferir comparando o ID/token do env com o do painel (script `.local/test_inspect_zapi_creds.mts`). O `ZAPI_CLIENT_TOKEN` é da CONTA (não da instância), então normalmente continua válido ao trocar de instância — só instance+token mudam.

**Webhook inbound (comando "resumo" etc.):** o comando só chega se a aba "Webhooks e configurações gerais" da Z-API tiver o campo **"Ao receber"** apontando pra `https://<dominio-publico>/api/whatsapp/webhook`. Z-API conectada mas com "Ao receber" vazio = inbound nunca dispara (o "resumo" não responde mesmo com tudo conectado). Status de conexão e webhook são coisas independentes. Trocar de instância Z-API zera os webhooks da instância nova → reconfigurar sempre. Dá pra setar por API: `PUT {BASE}/update-webhook-received` body `{value:url}` (header Client-Token). O webhook handler aceita request SEM token (auth opcional), então não precisa embutir token na URL.

**Domínio REAL de produção:** o deploy publicado é `https://www.torresseguranca.com.br` (custom domain) + `https://torresseguranca.replit.app` (fallback). NÃO é `torresvigilancia.com.br` — esse canônico do replit.md/SEO está desatualizado/diferente do deploy. Pra obter a URL certa, usar `getDeploymentInfo().primaryUrl`, nunca chutar do replit.md nem de `REPLIT_DOMAINS` (esse é o domínio .replit.dev de DEV). Pra webhook de POST, preferir o `.replit.app` (sem ambiguidade de www/redirect).

**Conversa natural (decisão do dono, jun/2026):** além dos 3 intents operacionais (resumo, km final, pedido de atualização), o Agente Central agora responde QUALQUER mensagem de grupo de cliente de forma natural via IA (opção "conversa ampla" escolhida pelo dono — ele quer que pareça pessoa de verdade, não robô). Travas obrigatórias: (1) nunca inventar dado operacional (horário/local/KM/placa/status) — só no prompt, pois regex daria falso positivo tipo "atendemos 24h"; (2) nunca falar de financeiro/valor — reforçada por PÓS-FILTRO regex que troca a resposta por um desvio neutro se a IA escapar (não confiar só no prompt). Só atua em grupo VINCULADO a cliente, com throttle por chat (reivindicado ANTES do await, senão webhooks concorrentes do mesmo grupo disparam em rajada) + delay humano + "digitando...". **Why:** resposta instantânea/template = cara de robô = ban; e falar valor errado com cliente é risco de negócio.

**Ack de pedido de atualização parecia robô (2 msgs idênticas seguidas):** o dedupe anti-spam do pedido de atualização é POR-OS. Quando o cliente manda dois pedidos seguidos de OSs DIFERENTES (ex.: "Atualização tor-0259" e "Atualização Edvandro e Vitor"), cada um resolve uma OS distinta → o dedupe por-OS não pega → saíam dois "recebi seu pedido... retorno assim que tiver novidades" quase idênticos em ~1min = cara de robô = risco de ban. **Correção:** cooldown de ack POR-GRUPO (claimAckSlot, 90s, reivindicado antes dos awaits). Quando suprime o 2º ack, AINDA cobra os agentes por DM e registra o pedido — só não duplica a mensagem visível no grupo. A resposta real volta depois via fulfillGroupRequests quando o agente reporta. **Why:** a queixa do dono não era falta de variação (a IA já variava palavras) e sim DUAS mensagens com a mesma estrutura em sequência. Menos mensagens repetidas = menos risco de ban.

**How to apply:** ao mexer em qualquer envio de WhatsApp da Central, manter variação de texto + pacing + delayTyping; nunca reintroduzir template fixo em rajada nem pacing por-OS. Ao mexer na conversa natural, manter o pós-filtro financeiro e o throttle reivindicado antes do await. Ao mexer no ack de pedido de atualização, manter o cooldown por-grupo (claimAckSlot) — dedupe por-OS sozinho não cobre pedidos de OSs diferentes em rajada.
