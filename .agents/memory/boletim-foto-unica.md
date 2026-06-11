---
name: Boletim foto única (total congelado no envio)
description: Por que o total do Boletim de Medição é congelado por OS no envio e como os 4 caminhos (tela/e-mail/Excel/página de aprovação) leem o mesmo número.
---

# Boletim de Medição — total congelado no envio ("foto única")

**Regra:** o total de cada OS no boletim vem de UMA função só — `billingTotalForBoletim(b, osStatus)` em `server/lib/boletim-totals.ts`, que ESPELHA exatamente o `getBillingTotal` da tela: **OS recusada => R$0 SEMPRE** (§8.1); caso contrário `fat_total > 0 ? fat_total : osCanonicalTotal(b)` (soma dos 9 componentes como fallback). No envio grava-se `billing_snapshot` (JSONB, array por OS com os 9 componentes + `total`; recusada tem componentes e total zerados) em `boletim_approvals`, e `total_value` = soma dos `total`. A partir daí, e-mail, anexo Excel, página pública de aprovação e tela mostram SEMPRE esse valor congelado.

**Why:** dois bugs históricos, mesmo sintoma (boletim != tela):
1. Cada caminho calculava diferente (Excel `fat_total||fallback`, e-mail somava 9 comp, tela ao vivo) → 3 números.
2. Depois de unificar tudo em "soma cega dos 9 componentes" (`osCanonicalTotal`), o e-mail passou a somar as OS recusadas a valor cheio (elas mantêm `fat_*` populado no billing), enquanto a tela as zera (§8.1). Resultado: e-mail R$135.072,83 vs tela R$120.881,16 (delta = soma dos `fat_total` das recusadas). **Lição: a soma dos 9 componentes NÃO é a fonte da verdade — o `getBillingTotal` da tela é, e ele zera recusada.** Qualquer total de boletim tem que aplicar a regra de status, não só somar componentes.

**How to apply:**
- Use SEMPRE `billingTotalForBoletim(b, osStatus)` (precisa do `status` da `service_order` — garantir que o select da rota traga `status`). Nunca somar os 9 componentes sem antes aplicar `recusada => 0`.
- Na tela (`boletim-medicao.tsx`), `getBillingTotal` consulta `frozenBillingTotal` (montado dos `billing_snapshot` dos approvals PENDENTE/APROVADO/CONFIRMADO) ANTES do cálculo ao vivo — mas DEPOIS do guard `recusada => 0` (§8.1, intocável).
- **Duplicatas:** `/api/boletim/aprovacoes` vem ordenado `created_at DESC`. Ao montar o mapa congelado, manter o PRIMEIRO valor por billing (envio mais recente) — `if (!map.has(id)) map.set(...)`. Sobrescrever deixaria um boletim antigo mascarar o novo (havia #43/#44 duplicados em prod).
- Approvals antigos sem `billing_snapshot` (NULL) degradam para o cálculo ao vivo — aceitável; não dá pra reconstruir o per-OS do que já foi enviado. Para reconciliar um boletim antigo bagunçado, cancelar e reenviar (gera snapshot novo).
- Fatura na aprovação usa `approval.total_value` congelado; só recalcula ao vivo se estiver vazio (approval antigo).
- Excel é gerado só 1x (no envio), não há re-download que regenere ao vivo.
