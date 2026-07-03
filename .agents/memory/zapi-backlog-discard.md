---
name: Descarte de backlog WhatsApp (bot fora)
description: Regras de quando filas de envio Z-API descartam vs re-tentam itens quando o bot está fora
---

**Regra (ordem do dono 03/07/2026):** quando o bot Z-API volta de uma queda, o backlog acumulado NÃO deve ser reenviado aos grupos — só atualizações novas.

**Como funciona:**
- Descarte só em estado DETERMINÍSTICO, nunca em erro transitório:
  - `getConnectionStatus().confirmed && !connected` (HTTP 200 no /status dizendo desconectado) ⇒ cron descarta pendências (markDone com erro "descartado: ...").
  - Envio bloqueado pela trava de número com `blocked:true` (reason `wrong_number`) ⇒ fila descarta.
- `reason "unconfirmed"` (nunca confirmou número + /device falhou, ex. logo após boot) ⇒ `ok:false` SEM `blocked` ⇒ fila RE-TENTA. Nunca promover esse caso a descarte.
- Linhas descartadas ficam com `whatsapp_forward_error` preenchido ⇒ NÃO contam como "já enviado" no dedup de fim de missão (que filtra `error IS NULL`).

**Why:** durante quedas o backlog reenviado floodava grupos de clientes com cards velhos; mas descartar em falha transitória perderia updates legítimos.

**How to apply:** qualquer NOVA fila/retry de envio WhatsApp deve seguir o mesmo contrato: descartar só com `blocked:true` ou desconexão confirmada; erro sem `blocked` = re-tentar.
