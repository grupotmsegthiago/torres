---
name: Conciliação de ponto RHID/Control iD
description: Invariantes e armadilhas do sincronismo de ponto entre nosso sistema (verdade) e o AFD do RHID
---

# Conciliação de ponto RHID/Control iD

Nosso sistema é SEMPRE a verdade. Facial (relógio fixo) → importa pra nós; manuais → exporta pro RHID.

## AFD do RHID é append-only
**Regra:** PUT/DELETE numa batida do AFD sempre dá 404 — o RHID só aceita CREATE.
**Como aplicar:** correção/exclusão que o AFD recusa vira marcação corretiva automática (CREATE da hora certa) quando possível; senão a fila marca o item como `unsupported` (nunca volta pra `error`, senão vira spam de 404). Ver `RhidUnsupportedError` e `executeRhidPush`.

## Classificação de minuto: dup em QUALQUER lado = "duplicada"
**Regra:** ao casar batidas por minuto BRT, mais de uma batida no mesmo minuto em QUALQUER lado (nosso OU RHID) é `duplicada` — divergência real, NUNCA `validado`.
**Why:** o AFD do RHID podia ter 2 ids no mesmo minuto; classificar como `validado` escondia a divergência do painel/e-mail.
**Como aplicar:** usar o helper puro `classifyMark(oursCount, rhidCount)` (testável, sem I/O). Regressão em `server/rhid-reconciliation-classify.test.ts`.

## Dedup de import: casar por (employee, minuto, device), não por formato de external_id
**Why:** o CREATE do RHID devolve id numérico, mas o import do AFD monta `rhid_{id}_{ts}` → dedup por external_id falha → duplica a batida.
**Como aplicar:** no `syncDevice`, casar batida nova do AFD com a local por (funcionário, minuto BRT, device) e ATUALIZAR o external_id em vez de inserir.

## Snapshot persistido reflete corretivas pós-export
**Regra:** `runDailyReconciliation` constrói a conciliação ANTES do export. Depois de exportar, faz patch in-memory dos minutos `faltando_no_rhid` recém-exportados → `validado` antes de persistir/enviar e-mail.
**Why:** sem o patch, o painel/e-mail mostram divergência que JÁ foi corrigida no mesmo ciclo, minando a confiança.
**Como aplicar:** `exportMissingToRhid` devolve `exportedKeys` (`employeeId|minuteBRT`) só dos sucessos; o patch só mexe em marca ainda `faltando_no_rhid` presente nesse set, ajustando counts por funcionário E totais 1:1 (há 1 marca por minuto/funcionário, sem duplo ajuste).

## Endpoints de conciliação expõem CPF/PIS → exigem admin
**Regra:** `GET /api/control-id/reconciliation/last` e `/live` precisam de `requireAdminRole` (além de `requireAuth`). O cron diário roda 05:00 com `{ timezone: "America/Sao_Paulo" }`.
