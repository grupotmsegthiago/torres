## Especificação Funcional — Ajuste TM SEG ago/2026 → OP. DEDICADA SUL

**Data:** 2026-09-01
**Autor:** agente Cursor
**Branch prevista:** `cursor/ajuste-tabela-tmseg-sul-ago2026-4118`
**Referências normativas lidas:** docs/governanca/README + 01 + 02 + 03 + 04

### ★ Problema
Missões do cliente TM Segurança que iniciaram em Florianópolis ou Palhoça no mês de agosto/2026 (01/08 a 31/08) devem usar a tabela tarifária `OP. DEDICADA SUL`. Parte delas está em tabelas ORIGEM (100/400/450 km). Cliente DHL (se existir) permanece na tabela normal.

### ★ Causa raiz
`service_orders.escort_contract_id` (e o `contract_id` congelado em `escort_billings`) não aponta para `OP. DEDICADA SUL` em todas as OS do recorte. Trocar só a OS não recalcula o billing (contract_id congelado).

### ★ Pesquisa de reutilização (D11 / P13)
- Termos: `OP. DEDICADA SUL`, `escort_contracts`, `calcularEscolta`, `writeEscortBillingAtomic`, `extractCity`, `recalc-tabela-congelada`
- Existente: motor `calcularEscolta`; writer atômico; `computeCanceladaBilling`; `extractCity`; `brtDateKey`; `estimadoFromContract` (acionamento)
- Decisão: [x] Reutilizar  [ ] Estender/corrigir  [ ] Integrar  [ ] Criar novo
- Script pontual só orquestra o recorte. Sem novo motor, tabela ou API.

### ★ Objetivo
No recorte 01–31/08/2026, origem FLO/Palhoça, cliente TM SEG: OS e billing oficiais passam a `OP. DEDICADA SUL`. DHL intacto. Boletim já APROVADO / FATURADO não reabre valor.

### ★ Regra de negócio
- Cliente = TM SEG (`clients.name` contém `TM SEG`). DHL = exclusão explícita.
- Início = cidade de `origin` via `extractCity` (Florianópolis ou Palhoça).
- Data = `mission_started_at` senão `scheduled_date` (dia BRT).
- Recusada = R$ 0 (só ponteiro da tabela).
- Cancelada = `computeCanceladaBilling` na própria Dedicada Sul (100 km / 3 h).
- Concluída aberta/APROVADA sem snapshot comercial = `calcularEscolta` com KM do billing.
- FATURADO / PAGO / boletim APROVADO = não altera valor (P5 / Art. IV).

### ★ Domínio dono
`service_orders.escort_contract_id` (FATO) + `escort_billings` (SNAPSHOT) via writer atômico.

### ★ Tipo de dado
[x] FATO  [x] RESULTADO  [x] SNAPSHOT

### Escopo permitido
- Recorte ago/2026 TM SEG FLO/Palhoça.
- Script + testes de seleção + relatório.

### Fora do escopo
- DHL e demais clientes.
- Regra permanente de sugestão de tabela para novas OS.
- Reabrir boletim 106 (03–15/08 APROVADO) ou invoices.

### Riscos
- Financeiro: 2ª quinzena APROVADA sobe (franquia 100 km + R$ 12/km). 1ª quinzena FATURADA fica como cobrada.
- Dívida ampliada? [x] Não

### Critérios de aceitação
- [ ] Só TM SEG; DHL 0.
- [ ] Dry-run lista decisões.
- [ ] Recálculo só via `calcularEscolta` / `computeCanceladaBilling`.
- [ ] FATURADO/snapshot intocado.

### Testes
`npx tsx --test server/lib/ajuste-tabela-origem.test.ts`

### Rollback
Reverter `escort_contract_id` + billing pelos totais do dry-run (auditoria `AJUSTE_TABELA_DEDICADA_SUL`).

### Publicação
- [x] Não publicar nesta entrega
