---
name: Valor Estimado por Tabela de Preços
description: Como o valor_estimado da OS é derivado da tabela de preços (contrato de escolta) e o que nunca pode ser recalculado.
---

# Valor Estimado x Tabela de Preços

`service_orders.valor_estimado` é uma **estimativa plana por tabela**, não por OS:
fórmula canônica `valor_acionamento + valor_km_carregado(||2.80) * franquiaKm`,
onde `franquiaKm = franquia_km || franquia_minima_km(||50)`. Ignora a km real da rota
→ toda OS na mesma tabela recebe o mesmo valor estimado. O valor real cobrado é o
faturamento da missão (`fat_calculado`), não a estimativa.

A "Tabela de Preços" na tela Editar OS = `escortContractId` (contrato de escolta).
Trocar a tabela deve recalcular a estimativa na hora (antes só preenchia quando vazio).

**Regra ao recalcular em massa:** NUNCA tocar OS `recusada`/`cancelada` — elas ficam
com estimativa zerada (§8.1 INTOCÁVEL: recusada sempre zerada). A fórmula vive
duplicada em 3 lugares no backend (create/patch/reprocessar-estimativas) + no front;
manter as 4 em sincronia se mudar.

**Why:** recalcular cego colocaria valor>0 em 60 OS recusadas/canceladas, violando §8.1;
e em OS concluída a estimativa é só fallback de receita quando `fat=0`, então mudar
estimativa não recria transação já lançada (Balanço não muda retroativo).

**How to apply:** qualquer recompute em massa de valor_estimado filtra fora
recusada/cancelada e só atualiza quando o delta existe (idempotente).
