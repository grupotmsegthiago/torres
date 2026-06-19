---
name: rh-summary / Balanço RH optimization
description: Como otimizar o endpoint rh-summary (Balanço Gerencial RH) sem mudar números; armadilhas de paridade financeira.
---

# Otimização do rh-summary (Balanço Gerencial — bloco RH)

`GET /api/fixed-costs/rh-summary` era N+1: laço serial chamando `buildFolhaStats`
por funcionário ativo (~6 queries cada, com redundâncias). Otimização segura aplicada,
com **paridade financeira exata** (números INTOCÁVEIS — ver §8):

- **Holiday cache**: `loadHolidaySet` cacheia em memória keyed por `from|to` (TTL 5min),
  invalidado nos POST/DELETE de holidays. Set retornado por referência (nenhum caller
  muta — só `.has()`); NÃO clonar (preserva o ganho).
- **Dedup de `employee_salaries`**: `buildFolhaStats` e `buildFolhaPonto` consultavam a
  MESMA row (mesmo filtro `effective_date<=fim` + ordem desc effective_date/created_at/id,
  limit 1). `buildFolhaStats` busca 1x e injeta via `buildFolhaPonto(opts.horasMensais)`.
- **Injeção de cadastro**: `buildFolhaStats(opts.employee {role,tipo_contratacao})` pula a
  query de `employees`; o endpoint já tem essas colunas no select inicial.
- **Paralelização**: `pLimit(6)` computa em paralelo, mas a acumulação (somas/breakdown)
  roda DEPOIS, sequencial, na ordem original de `ativos` → soma float bit-idêntica.

## Armadilhas / por que assim
- **Ordem da soma importa**: float é não-associativo; nunca acumular dentro do `Promise.all`.
  Compute em paralelo, some em ordem fixa.
- **Mismatch de período é PROPOSITAL**: o endpoint usa mês civil (`monthRange`), mas
  `buildFolhaStats`→`buildFolhaPonto` usa ciclo de folha 26→25 (`monthToFechamento` /
  `payrollPeriodRange`). NÃO "consertar" — são escopos diferentes.
- **Queries financeiras por-emp MANTIDAS de propósito** (não eram redundância de cache):
  punches, operational_payments (diárias), service_orders+escort_billings (faturamento).
  Por isso a contagem não cai pra ~10 — só caem holiday(cache)+salário(dedup)+employees(inject),
  ~3/func.
- **Staleness multi-instância**: cache é por-processo; em deploy autoscale, edição de feriado
  pode demorar até o TTL (5min) p/ propagar a outras instâncias. Aceitável (feriado muda raro).

## Regressão
- Guarda: `.local/test_rh_summary_parity.mts` (one-off, precisa env Supabase do shell — que
  EXISTE no shell aqui, ao contrário das vars só-do-workflow do OpenAI). Compara caminho
  serial+sem-injeção vs paralelo+injetado p/ todos os ativos; exige diff 0 em totalMensal e
  breakdown. Rodar ao mexer em qualquer query de folha/rh-summary. `PARITY_N=8` p/ amostra rápida.
