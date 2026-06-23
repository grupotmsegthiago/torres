---
name: WhatsApp forward — dedup de cards no grupo do cliente
description: Por que o "Fim de Missão" sai duplicado e como a trava por-OS resolve; dedup é por-linha, throttle só espaça.
---

# cron-whatsapp-forward: dedup é por-linha, não por-OS

O encaminhador (`server/cron-whatsapp-forward.ts`) marca cada `mission_update`
encaminhada com `whatsapp_forwarded_at` — ou seja, o dedup nativo é **por linha**,
não por OS nem por tipo de card.

**Por quê isso causa duplicata de "Fim de Missão":** o app mobile do vigilante
pode registrar a finalização em **duplicata** (duplo-toque na tela de
encerramento, ou refluxo da fila offline), criando 2+ `mission_updates` de
"📷 Foto: KM Final — KM N" (chegam como `mission_step="chegada_destino"`). Como
o card de finalização (resumo `buildFinalizedSummary`) é montado por linha, cada
KM Final vira um card "Fim de Missão" separado no grupo do cliente.

**O throttle de 3min/grupo NÃO deduplica** — ele só *espaça* mensagens. Duplicatas
saem assim que a janela de 3min passa (caso real OS TOR-0245: 2 cards de fim,
3min29s de intervalo).

**Trava implementada (escopo: só o card de fim):** antes de encaminhar um card de
finalização (`isFinalCardUpdate` = step `finalizada` OU foto KM Final), checa se a
OS já teve um card de finalização **enviado com sucesso** (`whatsapp_forwarded_at`
preenchido **E** `whatsapp_forward_error` null) e, se sim, faz skip. Roda ANTES do
throttle. Helpers puros testáveis: `isFinalCardUpdate`, `alreadyForwardedFinal`.

**How to apply:**
- Falha de Z-API (releaseClaim deixa `forwarded_at` null + error setado) NÃO conta
  como "já enviado" → retry continua funcionando. Não relaxar a condição
  `error is null` na query de dedup, senão um envio que falhou seria tratado como
  feito e o fim nunca sairia.
- Skip (markDone com error setado, ex. finalizada-sem-foto) também não conta como
  enviado — correto.
- Se um dia precisar dedup do card "Chegada no Cliente" também, mesmo padrão por
  conteúdo+OS. O dono optou (jun/2026) por dedup só do fim.
- Garantia é forte porque o cron roda single-process (guard `running`) e processa
  o lote sequencialmente; em multi-instância haveria janela de corrida (a trava é
  por leitura, não lock atômico por OS).

# DEV também encaminha pra grupos REAIS de cliente

`initWhatsappForwardCron()` em `server/index.ts` está FORA do `if (NODE_ENV==="production")`
(esse guard só envolve serveStatic/vite). Logo o ambiente de DEV roda o cron
contra o Supabase + Z-API de PRODUÇÃO e **manda mensagem de verdade no grupo do
cliente** (visto: dev enviou `id=9515 OS=TOR-0333 → TM SEGURANCA`).

**How to apply:** antes de mexer em qualquer parâmetro do encaminhador (ex.
aumentar a janela), assuma que o dev já está despachando ao vivo. Se for ampliar a
janela de recuperação, marque o backlog histórico como ignorado ANTES
(`whatsapp_forwarded_at` preenchido + `whatsapp_forward_error="skip: ..."`), via
`.local/test_skip_forward_backlog.mts`, senão o dev redespeja tudo no cliente.

# LOOKBACK_MIN é janela de RECUPERAÇÃO, não anti-spam

`LOOKBACK_MIN` (cron) = de quantos minutos atrás o robô recupera updates pendentes
ao voltar de uma queda (Z-API fora, event loop saturado, restart). O anti-spam é
o `THROTTLE_PER_GROUP_MIN` (1 msg/3min por grupo) — não a janela. Subir a janela
torna o robô resistente a quedas curtas sem virar flood. Dono aprovou 15→120min
(23/06/2026); o `tsx` do dev NÃO tem watch, então a mudança só vale após restart
do workflow.
