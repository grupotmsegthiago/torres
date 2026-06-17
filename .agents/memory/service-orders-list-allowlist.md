---
name: Coluna nova em service_orders some da lista
description: Por que uma coluna nova de service_orders não aparece na listagem mesmo persistindo corretamente.
---

# Coluna nova em service_orders some da lista

O endpoint de listagem `/api/service-orders` (em `server/routes/service-orders.ts`)
NÃO usa `select("*")`. Ele usa uma allowlist explícita de colunas, `SO_LIST_COLS`
(string CSV de nomes snake_case passada ao `.select(...)`).

**Regra:** ao adicionar uma coluna nova em `service_orders`, é OBRIGATÓRIO
adicioná-la também em `SO_LIST_COLS`, senão ela volta `undefined`/ausente na
listagem — mesmo que o banco e os demais endpoints a tenham.

**Por quê:** `getServiceOrder(id)` (detalhe), POST (create) e PATCH (update) usam
`select("*")` ou `toSnakeObj`, então persistência e leitura individual funcionam
sozinhas. Só a listagem é restrita. O bug é silencioso: o campo simplesmente não
chega ao frontend na grid, dando impressão de que "não salvou".

**Como aplicar:** toda task que adiciona campo persistido em service_orders e que
precisa do valor na tela de lista (badge, destaque de linha, coluna) tem que tocar
3 lugares: `shared/schema.ts` (coluna + insert schema), DDL em `server/db-init.ts`,
e `SO_LIST_COLS`.
