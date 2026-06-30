---
name: Horários de borda 00:00/23:59 em batida manual (plantão)
description: Por que o backend bloqueia 00:00/23:59 como placeholder e quando o frontend deve auto-confirmar (force) em jornada contínua.
---

# Batida manual: 00:00 / 23:59 são bloqueados como placeholder

`POST /api/control-id/manual-punch` recusa horários **00:00** e **23:59** com
"provável placeholder", exigindo `{ force: true }` no body.

**Why:** batidas-placeholder antigas (00:00→23:59 sem nada no meio) inflavam
jornadas falsas de 24h no espelho/folha. O guard protege contra isso.

**How to apply:**
- Fluxo de **batida única**: mantém o atrito — usuário precisa marcar o checkbox
  "Confirmar horário exato" pra mandar `force`.
- Fluxo de **dia completo (4 batidas)**: os horários são digitados de propósito e
  há batidas intermediárias reais (almoço), então 00:00/23:59 nas pontas são
  **jornada contínua/plantão** legítima que vira a meia-noite, NÃO placeholder.
  Esses dois handlers (`addFullDay` e `AddDayDialog.save`) auto-enviam `force`
  só nos horários de borda, via `isBoundaryPunchTime` (`shared/punch-time.ts`).
- Nunca remover o guard do backend pra "resolver" plantão — a correção é mandar
  `force` no fluxo certo, não baixar a proteção global.
