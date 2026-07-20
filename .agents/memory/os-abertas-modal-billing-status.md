---
name: Modal OSs em Aberto usa billingStatus do grid
description: Por que o modal do Balanço não pode confiar no byMission do dashboard para saber se a OS já foi aprovada/faturada
---

Regra: o modal "OSs em Aberto" do Balanço Gerencial só lista OS pendente de verificação — boletim A_VERIFICAR ou sem boletim. Fora: APROVADA/FATURADO/FATURADA/PAGO e também CANCELADO (billing só vira CANCELADO quando já estava congelado, §8.1b).

**Why:** o `byMission` do `/api/financial/dashboard` omite billings de algumas OSs canceladas, então canceladas com boletim FATURADO/CANCELADO chegavam ao cliente como "sem boletim" e vazavam pro modal (reclamação do dono 20/07/2026). O flag `is_frozen` sozinho também não basta: exige `fat_total_boletim > 0`.

**How to apply:** o status confiável vem do próprio `/api/operational-grid` (campo `billingStatus`, lido direto de `escort_billings`). Qualquer tela que precise saber se a OS já tem boletim congelado deve usar essa fonte (ou consultar escort_billings), nunca inferir por ausência no byMission. Desde 20/07/2026 (dono reclamou "16 no card, 10 no modal") o CARD "Em Aberto" e o modal usam o MESMO critério (`isOsAberta`): valor e contagem do card batem com a lista; o que tem boletim congelado/cancelado conta como "Finalizado". Finalizado + Em Aberto continua = fat total.
