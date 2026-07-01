---
name: Trava de onboarding (kill switch)
description: Como ligar/desligar o bloqueio de OS/missão por pendência de onboarding e por que existe interruptor único.
---

# Trava de onboarding — interruptor único

O bloqueio de escalar agente com onboarding incompleto (Documentação/Contratos/Treinamento)
é aplicado em 3 pontos — criar OS, atribuir/trocar funcionário na OS, e aceitar missão —
MAS todos chamam a MESMA função `assertOnboardingComplete(employeeId)` em
`server/routes/onboarding.ts`. Logo, o liga/desliga é num lugar só.

**Interruptor:** `const ONBOARDING_GATE_ENABLED` no topo de `onboarding.ts`.
- `false` ⇒ liberado "até segunda ordem": `assertOnboardingComplete` faz early-return e nem
  calcula onboarding. Nenhuma OS/missão é barrada.
- `true` ⇒ bloqueio normal (respeita ainda a carência por data `ONBOARDING_BLOCK_START_DATE`).

**Importante:** desligar o gate NÃO desliga a EXIBIÇÃO. `computeOnboarding` continua rodando
e a timeline/alertas em `employees.tsx` (rota `/api/employees/:id/onboarding` e
`/api/onboarding-summary`) seguem mostrando as pendências. É só o bloqueio que sai.

**Why:** o dono manda liberar/travar por período (ex.: transição de cadastro). Um único
booleano evita mexer em 3 call-sites e evita esquecer um gate aberto/fechado.

**Histórico:** havia uma carência por DATA (`ONBOARDING_BLOCK_START_DATE`) que venceu e voltou
a bloquear sozinha em 01/07 — por isso a preferência agora é o booleano explícito "até segunda
ordem" em vez de data, que expira sem aviso.
