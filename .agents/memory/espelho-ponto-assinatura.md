---
name: Espelho de ponto para assinatura (Control iD/RHID)
description: Como o espelho de assinatura pareia batidas, calcula noturno/HE e valida — isolado dos custos de folha.
---

# Espelho de ponto para assinatura (buildEspelhoPonto / buildEspelhoRhid)

Lógica isolada em `server/lib/espelho-ponto.ts`, integrada em `buildEspelhoRhid` (`server/control-id.ts`). Renderizada em `EspelhoRhidView` (`client/src/pages/admin/control-id.tsx`).

## Regra de pareamento (NÃO usar pareamento global (0,1)(2,3))
Pareamento GULOSO com TETO: uma entrada só forma par com a próxima batida se gap ≤ 18h (`HARD_MAX_GAP_MIN`). Senão é ENTRADA ÓRFÃ (sinalizada, severidade ERRO, bloqueia). **Por quê:** pareamento global emparelhava uma entrada órfã com uma saída dias depois → "turno" de 168h. Dados reais de vigilante são esparsos e cheios de batidas únicas (esqueceu de bater) — isso é dado incompleto real, deve ser FLAGGED, não inventar horas.
- Par > 16h (`LONG_SHIFT_WARN_MIN`) → aviso "turno longo" (não bloqueia).
- Par ≤ 3min (`SHORT_PAIR_WARN_MIN`) → aviso "par muito curto / batida duplicada" (não bloqueia).
- Turno que cruza meia-noite = UM turno só, atribuído ao dia da ENTRADA; saída marcada "(+1)".
- Noturno = faixa 22h–05h, varrido minuto a minuto (`nightMinutesBRT`).
- Há costura segura de marcadores 23:59→00:00 (≤3min) ANTES do pareamento (no-op quando não existem; dados do André não têm).

## DECISÃO DO DONO (escopo)
Aplicar SÓ no espelho de assinatura. NÃO recalcular custos de folha/holerite/Balanço RH — `buildFolhaStats`/`buildFolhaPonto` (custos) ficam intocados. **Por quê:** noturno/HE do espelho são para o documento assinado, não para pagamento.

## Validação antes de emitir
`hasBlocking` = existe alguma validação severidade "erro" (batida incompleta / horário inconsistente). Frontend: painel `no-print` no topo do espelho + `window.confirm` antes de imprimir (individual em `doPrint`, lote em `gerarLote`) listando pendências; usuário pode prosseguir após ciência (não é bloqueio rígido — senão funcionário com muitas batidas incompletas nunca conseguiria emitir).
