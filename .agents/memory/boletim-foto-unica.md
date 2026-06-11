---
name: Boletim foto única (total congelado no envio)
description: Por que o total do Boletim de Medição é congelado por OS no envio e como os 4 caminhos (tela/e-mail/Excel/página de aprovação) leem o mesmo número.
---

# Boletim de Medição — total congelado no envio ("foto única")

**Regra:** o total de cada OS no boletim vem de UMA fonte só — `osCanonicalTotal(b)` = soma dos 9 componentes do escort_billing (`fat_acionamento + fat_hora_extra + fat_km + fat_adicional_noturno + fat_estadia + fat_pernoite + despesas_pedagio + despesas_outras + receitas_os`), arredondado a 2 casas. No envio do boletim grava-se um `billing_snapshot` (JSONB, array por OS com os 9 componentes + `total`) em `boletim_approvals`, e `total_value` = soma dos snapshots. A partir daí, e-mail, anexo Excel, página pública de aprovação e tela do sistema mostram SEMPRE esse valor congelado.

**Why:** antes cada caminho calculava diferente — o Excel usava `fat_total || fallback de contrato`, o e-mail somava os 9 componentes, e a tela recalculava AO VIVO. Editar a OS depois do envio fazia a tela divergir do e-mail/Excel já enviados → 3 números diferentes pro mesmo boletim, dono perdia confiança.

**How to apply:**
- Nunca reintroduzir fórmula de total específica por caminho. Se precisar do total de uma OS no contexto de boletim, use `osCanonicalTotal`/snapshot, nunca `fat_total` cru nem fallback de contrato.
- Na tela (`boletim-medicao.tsx`), `getBillingTotal` consulta `frozenBillingTotal` (montado dos `billing_snapshot` dos approvals PENDENTE/APROVADO/CONFIRMADO) ANTES do cálculo ao vivo — mas DEPOIS do guard `recusada => 0` (§8.1, intocável).
- **Duplicatas:** `/api/boletim/aprovacoes` vem ordenado `created_at DESC`. Ao montar o mapa congelado, manter o PRIMEIRO valor por billing (envio mais recente) — `if (!map.has(id)) map.set(...)`. Sobrescrever deixaria um boletim antigo mascarar o novo (havia #43/#44 duplicados em prod).
- Approvals antigos sem `billing_snapshot` (NULL) degradam para o cálculo ao vivo — aceitável; não dá pra reconstruir o per-OS do que já foi enviado. Para reconciliar um boletim antigo bagunçado, cancelar e reenviar (gera snapshot novo).
- Fatura na aprovação usa `approval.total_value` congelado; só recalcula ao vivo se estiver vazio (approval antigo).
- Excel é gerado só 1x (no envio), não há re-download que regenere ao vivo.
