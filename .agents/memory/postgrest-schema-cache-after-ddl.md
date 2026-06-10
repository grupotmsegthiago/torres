---
name: PostgREST schema cache após ALTER TABLE
description: Por que escritas via supabaseAdmin gravam NULL nas colunas novas logo após ALTER TABLE ADD COLUMN, e como evitar.
---

# Schema cache do PostgREST após ALTER TABLE ADD COLUMN

Depois de rodar `ALTER TABLE ... ADD COLUMN` (via db-init/execSql no boot), o **schema cache do PostgREST** (a camada REST do Supabase usada por `supabaseAdmin.from(...)`) pode ficar desatualizado por alguns segundos. Nesse intervalo, um `.insert({...colunasNovas})` **não falha com erro visível** em todos os casos — pode simplesmente **descartar as colunas desconhecidas e gravar NULL** nelas. Se o código que insere engole erros (ex.: um sampler `try/catch` silencioso), você só descobre olhando os dados (linhas com as colunas novas em NULL logo após o deploy).

**Como aplicar:** sempre que adicionar coluna que será escrita via supabaseAdmin REST, emitir `NOTIFY pgrst, 'reload schema'` logo após o(s) `ALTER TABLE` no db-init. Isso força o reload imediato e as primeiras escritas já enxergam as colunas. Mesmo padrão já usado para registrar o `exec_sql`.

**Sintoma de diagnóstico:** RPC/SQL direto (pg.Client ou `supabaseAdmin.rpc`) já retorna os valores certos, mas as linhas inseridas via REST ficam NULL → é cache do PostgREST, não erro de lógica.
