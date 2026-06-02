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

## Dedup de import: casar por (employee, minuto BRT) e ADOTAR o external_id canônico
**Why:** o CREATE do RHID devolve id numérico, mas o import do AFD monta `rhid_{id}_{ts}` → dedup por external_id puro falha → duplica a batida (mesma device #1: POST e AFD são ambos do RHID Cloud).
**Como aplicar:** helper puro `decideImport({externalIdExists, localExternalIdAtMinute, eventExternalId})` em `control-id-parsers.ts`: ext já existe→`skip`; sem batida local no minuto→`insert`; batida local no minuto com ext divergente/null→`adopt-external-id` (UPDATE o external_id da local pelo id, NUNCA insere duplicata). `syncDevice` usa `Map<emp,Map<minuto,{id,externalId}>>`; id=-1 = placeholder do mesmo batch (não adota). Regressão: `server/control-id-import-dedup.test.ts`.
**Chave é (emp,minuto) SEM device — de propósito:** o matching por minuto NÃO escopa por device, pra que batida manual (`device_id=null`) também dedupe contra a facial do AFD. Architect alertou "risco cross-device" (adotar external_id na linha errada), mas é teórico: produção tem **1 device só** (RHID Cloud #1) e **0** casos de mesmo func+minuto em devices distintos. Só virar (emp,minuto,device) SE adicionarem um 2º device físico — aí a manual null precisaria de tratamento à parte.

## Snapshot persistido reflete corretivas pós-export
**Regra:** `runDailyReconciliation` constrói a conciliação ANTES do export. Depois de exportar, faz patch in-memory dos minutos `faltando_no_rhid` recém-exportados → `validado` antes de persistir/enviar e-mail.
**Why:** sem o patch, o painel/e-mail mostram divergência que JÁ foi corrigida no mesmo ciclo, minando a confiança.
**Como aplicar:** `exportMissingToRhid` devolve `exportedKeys` (`employeeId|minuteBRT`) só dos sucessos; o patch só mexe em marca ainda `faltando_no_rhid` presente nesse set, ajustando counts por funcionário E totais 1:1 (há 1 marca por minuto/funcionário, sem duplo ajuste).

## Export NUNCA pode pular batida com `continue` silencioso (visibilidade)
**Regra:** em `exportMissingToRhid`, toda batida `faltando_no_rhid` que não vira corretiva DEVE carimbar `rhid_sync_error` na própria linha + contar nas actions — nunca sumir sem rastro.
**Why:** o código antigo pulava silenciosamente (a) funcionário sem mapping/identidade no RHID e (b) batida com `external_id` obsoleto → batidas "sumiam" e o RH não via. Era a causa raiz das batidas mobile/web que nunca chegavam ao RHID.
**Como aplicar:** helper puro `exportPunchDisposition({noIdentity, hasExternalId})` → `skip_no_mapping` | `stuck_external_id` | `export`. `stuck_external_id` NÃO re-exporta cego (AFD append-only ⇒ duplicaria) — só sinaliza pra revisão manual. Actions ganharam `exportSkippedNoMapping` e `exportStuck` (e-mail + painel control-id.tsx). Regressão: `server/rhid-reconciliation-export-skip.test.ts`.

## Identidade: RHID não devolve PIS; PIS real é dado do dono
**Regra:** o registro de pessoa do RHID (`fetchUsers`) só traz `id/name/cpf/matricula` — NÃO traz PIS. Pior: o `cpf` lá pode estar errado (já visto: o CPF no RHID não bater com o CPF do funcionário no nosso sistema). Logo o PIS real NUNCA é descobrível do RHID — tem que perguntar ao dono. NUNCA inventar PIS (é relógio de ponto legal, Portaria 1510).
**Why:** `registerEmployeeInRhid` exige PIS de 11 dígitos; sem ele, novos funcionários não registram. Export de batida de quem JÁ tem mapping NÃO depende de PIS (usa `control_id_user_id` do mapping), então PIS inválido NÃO deve bloquear export — só bloqueia registro de pessoa nova.
**Como aplicar:** ao corrigir identidade, pedir o PIS real ao dono; o RHID/AFD é append-only, então alinhar batidas tortas exige CREATE de corretivas (aprovação do dono antes, por ser escrita em produção).

## "Batida faltando no RHID" de func JÁ mapeado = torta, não ausente
**Why:** quando um func mapeado aparece com muitos `faltando_no_rhid`, quase sempre a batida JÁ foi exportada antes (tem `external_id` numérico do CREATE), mas o evento no AFD caiu em OUTRO minuto — então o minuto certo fica `faltando_no_rhid` e o minuto errado fica `faltando_no_local`. Não é batida nunca-enviada.
**Como aplicar (alinhamento aprovado pelo dono):** AFD é append-only ⇒ não dá pra mover/apagar a errada. O fix é CREATE de corretiva no minuto certo (uma por minuto), aceitando que a errada continua como `faltando_no_local` (divergência pra revisar). Fazer via script `.local/` dedicado e idempotente (rebuild da conciliação ao vivo a cada run ⇒ re-rodar só cria o que ainda falta), NUNCA mudando o default conservador do cron (que só sinaliza `stuck_external_id`). As `duplicadas` à meia-noite (23:59/23:44, admin_manual, ours=1 rhid=2) são artefatos estruturais de day-split — esperadas, revisão manual, não "consertar com TZ". PIS não é derivável do RHID — pedir ao dono (código valida só length 11, não checksum mod-11).

## Drift de batida não é bug de timezone único
**Why:** investigado num func real (~1 mês): só ~5/116 batidas têm drift entre `punch_at` e o ts embutido no `external_id`, e os offsets são espalhados (dezenas a centenas de min) — não há offset sistemático. Os `±1min` à meia-noite são day-splits; os grandes são batidas manuais genuínas que nunca foram exportadas. Conclusão: não tente "consertar com TZ"; o caminho é exportar corretiva por minuto (com visibilidade) + pedir revisão das tortas.

## "Pontos repetidos" no espelho do RHID = leitura facial dupla + day-split, NÃO bug nosso
**Why:** dono viu espelho com batidas repetidas e pediu "apagar e relançar só as do sistema". Auditado (1 func, 1 mês): nosso `control_id_punches` (casado por `control_id_user_id`, NÃO por `employee_id` — esse fica NULL na maioria) é IDÊNTICO ao espelho: 0 minutos duplicados, 0 external_id repetido. A "repetição" é (a) leitura facial dupla em poucos min (06:00/06:05, 23:12/23:16) que o PRÓPRIO RHID já marca "ENTRADA/SAÍDA DUPLICADA" + trata "D"=Desconsiderado (não conta na JORNADA REALIZADA), e (b) day-split à meia-noite (00:00/00:01/23:59) em quem vira a noite (escolta).
**Como aplicar:** NÃO dá pra "apagar e relançar" via integração — AFD append-only por lei (Portaria 1510), DELETE/PUT→404. `deleteRhidPunch` existe em `control-id.ts` mas é CÓDIGO MORTO (sem rota); só `deleteLocalPunch` tem rota e ela enfileira op=delete que o worker marca `unsupported` (nunca apaga no RHID). E nem adianta: nosso lado já espelha o RHID, não há versão "limpa" pra relançar. Reduzir dupla-leitura = config anti-passback/intervalo mínimo no IDFACE (lado do equipamento), não pós-fato. A JORNADA REALIZADA já sai correta (dupes desconsiderados).
**Heads-up identidade:** o espelho pode trazer PIS/CPF errados (ex.: person 25 tinha PIS=CPF=mesmo número-lixo no RHID) ≠ cadastro real nosso. Matching de batida usa person id, então não quebra import, mas o documento legal sai com dado torto — avisar o dono.

## Endpoints de conciliação expõem CPF/PIS → exigem admin
**Regra:** `GET /api/control-id/reconciliation/last` e `/live` precisam de `requireAdminRole` (além de `requireAuth`). O cron diário roda 05:00 com `{ timezone: "America/Sao_Paulo" }`.
