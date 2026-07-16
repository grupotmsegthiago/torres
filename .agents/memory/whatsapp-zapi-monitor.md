---
name: Monitor de conexão Z-API (2 modos de falha)
description: Por que "bot parado" do WhatsApp tem DOIS estados distintos e como alertar/exibir sem falso alarme nem alerta duplicado.
---

# Monitor de conexão do WhatsApp (Z-API)

O bot Z-API pode estar "parado" de DUAS formas independentes — e só checar o
pareamento esconde a segunda:

1. **Desconectado/não pareado** — `getConnectionStatus().connected !== true`.
2. **Número ERRADO** — `connected === true` (pareado), mas pareado num número
   diferente do oficial; `assertExpectedNumber().ok === false`. Nesse caso os
   ENVIOS são bloqueados pelo guard de número, então o painel mostraria
   "conectado" justamente no caso que o monitor existe pra pegar.
3. **Credencial REVOGADA** — Z-API responde `403 "Client-Token not allowed"` em
   tudo (`/status`, `/device`). Acontece quando o dono regenera o token de
   segurança da conta ou troca de instância no painel Z-API. Sintoma nos logs:
   forward-cron em loop "não foi possível confirmar o número conectado
   (transitório)". Fix: atualizar secrets `ZAPI_CLIENT_TOKEN` (menu Segurança) e,
   se trocou instância, `ZAPI_INSTANCE_ID`/`ZAPI_TOKEN` — e lembrar que ao trocar
   de instância o webhook "Ao receber" vem zerado (recadastrar). Dev pega os
   secrets novos no restart; produção só na próxima publicação (caso jul/2026).

**Regra:** qualquer health/UI de "bot operante" deve considerar `isDown` (que
cobre os 2 modos), nunca só `connected`. No painel: `operationalDown = isDown===true || connected===false`; wrong-number = `operationalDown && connected===true`.

**Why:** a falha real observada em produção não foi desconexão e sim número
errado — o painel verde dava falsa sensação de que estava tudo bem.

**Anti-falso-alarme:** debounce de N checagens consecutivas (decisão pura
`decideMonitorAction`, edge-trigger down/recovery, re-lembrete periódico). Blip
único de rede NÃO alerta.

**Anti-alerta-duplicado:** o monitor só roda em produção
(`NODE_ENV==='production'` ou flag `WHATSAPP_MONITOR_ENABLED=true`). O sandbox de
dev compartilha os MESMOS secrets (Z-API/SMTP), então sem o gate dev e prod
mandariam e-mails de alerta em dobro pro dono.

## Bot mudo mas recebendo
Se o bot registra mensagens mas não responde nada (nenhum from_me novo), checar PRIMEIRO `ZAPI_PAUSED` (env shared) antes de debugar conexão/allowlist — a pausa silencia todos os envios mas o webhook de entrada continua salvando. Produção só pega mudança de env na próxima publicação.
