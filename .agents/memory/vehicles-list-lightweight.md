---
name: Lista de veículos é leve (sem base64)
description: Por que GET /api/vehicles não traz documento/fotos e o que QUALQUER tela de edição/uso precisa fazer pra não quebrar nem apagar foto.
---

# Lista de veículos não traz colunas base64 pesadas

`getVehicles()` (server/storage.ts) seleciona uma allowlist explícita que EXCLUI `document_file`, `photo_left`, `photo_rear`, `photo_right` e MANTÉM `photo_front` (miniatura do grid em tempo real). `getVehicle(id)` continua `select("*")` (traz tudo).

**Why:** essas 5 colunas base64 inflavam a resposta da lista a ponto de estourar o timeout de 12s (JSON truncado nos logs), derrubar o circuito do Supabase e levar o sistema à contingência. Mesmo padrão de `fueling-list-heavy-base64.md`: lista leve + detalhe sob demanda.

**How to apply:**
- Adicionou coluna base64/pesada em `vehicles`? NÃO incluir em `VEHICLE_LIST_COLS`.
- Qualquer tela que **edita** um veículo e dá PATCH com o form inteiro DEVE primeiro buscar o registro completo (`/api/vehicles/:id`) e hidratar os campos pesados antes de habilitar Salvar. Sem isso, o PATCH parcial manda `""` e APAGA documento/fotos existentes (risco de dado real). Padrão atual: estado `photosLoaded` que trava o botão Salvar até o full carregar.
- Qualquer tela que **exibe** fotos além da dianteira (galeria etc.) deve buscar o veículo completo sob demanda (só quando um veículo é selecionado), com fallback no item leve (`photo_front`).
