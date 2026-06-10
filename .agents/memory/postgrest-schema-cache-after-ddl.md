---
name: PostgREST schema cache após DDL (colunas e funções)
description: Por que escritas/RPC via supabaseAdmin não enxergam colunas novas (gravam NULL) ou funções novas ("Could not find the function ... in the schema cache") logo após o DDL, e como evitar.
---

# Schema cache do PostgREST após DDL

Vale para colunas E funções: após `ALTER TABLE ADD COLUMN` **ou** `CREATE FUNCTION` (via db-init/execSql no boot), o schema cache do PostgREST fica desatualizado por alguns segundos. Solução única para os dois casos: emitir `NOTIFY pgrst, 'reload schema'` logo após o DDL no db-init.

- **Função nova:** `supabaseAdmin.rpc("nome")` falha com erro explícito `Could not find the function public.nome without parameters in the schema cache` até o reload. (Confirmado ao adicionar `db_table_sizes`.)
- **Coluna nova:** ver abaixo — falha silenciosa, grava NULL.

# Schema cache do PostgREST após ALTER TABLE ADD COLUMN

Depois de rodar `ALTER TABLE ... ADD COLUMN` (via db-init/execSql no boot), o **schema cache do PostgREST** (a camada REST do Supabase usada por `supabaseAdmin.from(...)`) pode ficar desatualizado por alguns segundos. Nesse intervalo, um `.insert({...colunasNovas})` **não falha com erro visível** em todos os casos — pode simplesmente **descartar as colunas desconhecidas e gravar NULL** nelas. Se o código que insere engole erros (ex.: um sampler `try/catch` silencioso), você só descobre olhando os dados (linhas com as colunas novas em NULL logo após o deploy).

**Como aplicar:** sempre que adicionar coluna que será escrita via supabaseAdmin REST, emitir `NOTIFY pgrst, 'reload schema'` logo após o(s) `ALTER TABLE` no db-init. Isso força o reload imediato e as primeiras escritas já enxergam as colunas. Mesmo padrão já usado para registrar o `exec_sql`.

**Sintoma de diagnóstico:** RPC/SQL direto (pg.Client ou `supabaseAdmin.rpc`) já retorna os valores certos, mas as linhas inseridas via REST ficam NULL → é cache do PostgREST, não erro de lógica.
