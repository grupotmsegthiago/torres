---
name: Valor Estimado por Tabela de Preços
description: Como o valor_estimado da OS é derivado da tabela de preços (contrato de escolta) e o que nunca pode ser recalculado.
---

# Valor Estimado x Tabela de Preços

A estimativa base da OS = **`valor_acionamento`** do contrato de escolta. O acionamento
JÁ inclui a franquia (km + horas), então ele sozinho é a estimativa. O excedente
(`valor_km_extra`/`valor_hora_extra`) só se aplica ALÉM da franquia e é desconhecido ao
estimar → fica fora. Fallback legado (contratos antigos com `valor_acionamento=0`):
`valor_km_carregado * franquia_km` apenas se o km carregado real existir.

A "Tabela de Preços" na tela Editar OS = `escortContractId`. Trocar a tabela deve
recalcular a estimativa na hora.

**Why:** a fórmula antiga `acionamento + valor_km_carregado(||2.80)*franquia_km` estava
errada — somava km por cima do acionamento (que já cobre a franquia) e, como
`valor_km_carregado` costuma ser 0, caía no default fantasma 2.80. Ex.: tabela TM SEG
acionamento 4800 / franquia 1000km dava 7600 em vez de 4800. NUNCA reintroduzir o
default 2.80 nem somar km×franquia ao acionamento.

**Regra ao recalcular em massa:** NUNCA tocar OS `recusada`/`cancelada` — ficam zeradas
(§8.1 INTOCÁVEL). Recompute é idempotente (só grava quando há delta). Em OS concluída a
estimativa é só fallback de receita quando `fat=0`; mudar estimativa NÃO recria
transação já lançada (Balanço não muda retroativo).

**How to apply:** usar o helper `estimadoFromContract()` (server/routes/service-orders.ts)
como fonte única; manter o `computeEstimado` do front em sincronia.
