---
name: Balanço Gerencial — receita canônica vs faturamento_live
description: Por que o Balanço usa um motor de receita diferente do Relatório de OS e quais invariantes manter.
---

# Balanço Gerencial usa receita CANÔNICA; Relatório de OS usa faturamento_live

O endpoint `/api/operational-grid` expõe, por OS, dois números de receita ao vivo no `liveCost`:
- `faturamento_live` — motor SIMPLIFICADO (`calcularFaturamentoLive`): HE = horas×valor, sem timestamps reais, sem km vazio. Consumido pelo **Relatório de OS**.
- `canonico.faturamento` — motor CANÔNICO (`calcularEscolta`): HE por timestamps reais (regra #5, multi-dia, fracionada por minuto) + km misto + adicional noturno. Consumido **só pelo Balanço Gerencial**.

**Why:** o dono pediu (aprovado) que o Balanço refletisse a receita "correta" (ex.: maio/2026 R$209.287,95 em vez de R$189.835,88 do stored), mas SEM alterar billings gravados nem mudar o Relatório de OS. Por isso são campos separados, não um swap de `faturamento_live`.

**How to apply / invariantes:**
- Nunca trocar `faturamento_live` pelo canônico (quebraria o Relatório de OS). Adicionar campos novos.
- No canônico do grid, `km_vazio` é sempre 0: nenhuma fonte (fotos do app dão odômetro total; billings têm km_vazio=0 em 100% dos 246 registros) separa carregado/vazio. Todo km é tratado como carregado — consistente com stored e com o relatório aprovado.
- `despesas_outras` NÃO entra como receita no canônico do grid (passa 0): "outras" são custo puro, não repasse. Só pedágio e receitas_os entram na receita (igual à linha que soma `receitasOsGrid + custoPedagio`).
- Custos/pagamento no Balanço continuam vindo do billing armazenado; só a RECEITA virou canônica (decisão de produto "só exibição").
