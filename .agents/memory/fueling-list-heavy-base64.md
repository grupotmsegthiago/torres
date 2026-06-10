---
name: Lista com colunas base64 derruba Supabase
description: Por que GET /api/fueling (sem ?page) entrava em contingência/fallback e o padrão lista-leve + detalhe-sob-demanda.
---

# Lista com colunas base64 estoura o Supabase → fallback

`vehicle_fueling` tem 4 colunas de foto base64 (`receipt_photo`, `pump_photo`,
`odometer_photo`, `plate_photo`). Trazer essas colunas numa LISTA inteira é
catastrófico: medido em produção, `select("*")` em 210 linhas gera **~116 MB**
de JSON; a versão só com colunas leves dá **~0,21 MB** (≈550× menor).

**Por que derrubava:** o payload gigante deixa cada request lento, estoura o
parse do JSON e satura a janela de saúde do `server/supabase.ts` (75% de falha
nas últimas 40 chamadas → modo de contingência + e-mail de alerta). Era a causa
raiz dos episódios de "Supabase OFFLINE".

**Regra/padrão:** qualquer entidade com blob/base64 — LISTA leve (allowlist de
colunas, nunca `select("*")`) + DETALHE completo sob demanda via `GET /…/:id`.
O Supabase REST não suporta exclusão de colunas, então é obrigatório listar as
colunas leves explicitamente (allowlist). Há uma allowlist duplicada em
`storage.getVehicleFuelings()` e no caminho paginado de `routes/fleet.ts` —
mantê-las em sincronia (ou centralizar) ao alterar o schema.

**Consumidores da lista `/api/fueling` (sem ?page):** dashboard, vehicles,
conciliacao-ticketlog (só agregados) e relatorio-abastecimento. Só o
`DetailModal` do relatório usa as fotos, e agora busca o registro completo
sob demanda (mesmo padrão de `fueling.tsx`).

**E-mail de alerta (pg-fallback.ts):** o fallback local de leitura está
DESATIVADO em produção — os textos não devem prometer "leituras via PostgreSQL
local". A contingência só enfileira GRAVAÇÕES (fila local) e reenvia ao voltar.
