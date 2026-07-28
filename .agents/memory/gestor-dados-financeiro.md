---
name: Gestor de Dados Financeiro
description: Motor de auditoria de consistência (duplicidades/conciliação) — regras, cache e limites
---

Módulo em `server/lib/gestor-dados.ts` (motor) + `server/routes/gestor-dados.ts` (rotas) + página `/admin/gestor-dados`.

**Regras duras:**
- Estritamente SÓ LEITURA — inclusive o cache: é em memória (singleflight, TTL 15min), NUNCA usar withSwrCache aqui (persistiria snapshot em tabela = escrita).
- Nada de cálculo paralelo: valores oficiais SEMPRE via `oficialBillingView` + contratos; custos de RH SEMPRE do `/api/fixed-costs/rh-summary` (o frontend combina; o backend novo só agrega missões/receita por funcionário).
- `/perguntar` (IA) reusa a última auditoria cacheada — nunca recalcular a auditoria completa por pergunta.

**Heurísticas de duplicidade — lições anti-falso-positivo:**
- `invoice_billing_items`: dedupe por invoice_id ANTES de acusar "OS em múltiplas faturas" (várias linhas de rateio na mesma fatura são legítimas).
- mission_costs/financial_transactions: vários pedágios de mesmo valor na mesma OS são NORMAIS → chave inclui descrição e severidade é MEDIA ("possível"), nunca ALTA/CRITICA.
- Integridade = 1 − peso/registros (crítica=4, alta=2, média=1, baixa=0.5).

**Corte de período (ordem do dono, 28/07/2026):** auditoria só considera dados de **01/06/2026 em diante** (`DATA_CORTE` no motor); histórico anterior é imperfeito e não gera apontamento. Registro sem data fica DENTRO (não dá pra excluir com segurança).

**Alinhamento com a Gestão de Medição:** invariantes §8.1 (recusada=R$0, aprovada≠R$0) são checadas pelo valor OFICIAL (`oficialBillingView().total`), NUNCA pelo `fat_total` bruto — recusadas guardam valor bruto congelado legítimo que a view zera; auditar o bruto gera dezenas de falsas críticas e contradiz a IA da Medição.

**Decisão de produto:** achados não BLOQUEIAM exibição de indicadores (dados históricos imperfeitos); sinalizam com status/selo. **Why:** bloquear travaria os dashboards que o dono já usa.

**Teste vivo:** `.local/test-gestor-e2e.mts` — cria usuário admin temporário via `auth.admin.createUser` + linha em `users` (colunas reais: sem `password`; usar `email`), exercita as rotas via HTTP com Bearer e apaga tudo no final. Padrão reutilizável p/ testar qualquer rota admin autenticada.

**KPIs certificados (v2):** os KPIs do Gestor de Dados vêm da lib compartilhada `client/src/lib/balanco-calc.ts` (extraída do Balanço Gerencial) + MESMOS endpoints — nunca recriar cálculo paralelo. Regras que precisam ficar espelhadas com o Balanço: costDays com caps fixos (30/90/180/365), fallback CCT da provisão RH e contagem de vigilantes ativos. Motor aceita ?de&?ate mas o corte 2026-06-01 é HARD (clamp no servidor); cache em memória por período (LRU 8).
