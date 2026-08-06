# 09 — Dívidas e Riscos Conhecidos

**Natureza:** normativo quanto à restrição **não ampliar**; descritivo quanto ao estado
**Origem:** Fases 0 / 0.2 / auditoria
**Status geral na Fase 1.0:** documentado — **não corrigido**

---

## Restrição universal

Enquanto a dívida existir:

1. **Não ampliar** o padrão endividado em código novo.
2. Código novo na região deve incluir passo de conformidade **ou** ADR justificando o desvio temporário.
3. Correção futura segue Especificação Funcional + gates G1–G16.

---

## Lista inicial

### D01 — Motor dual de faturamento

| Campo | Conteúdo |
|-------|----------|
| Descrição | `calcularEscolta` (canônico) e `calcularFaturamentoLive` (simplificado) coexistindo |
| Consequência | Números diferentes para a mesma OS em telas distintas |
| Prioridade | P0 |
| Módulos | `billing-calc.ts`, `operational.ts`, `financial-snapshot.ts`, Balanço |
| Restrição | Não criar terceiro motor; não usar live como oficial |
| Correção futura | Live só estimativa rotulada; oficiais só canônico |
| Status | Aberta |

### D02 — Live concorrendo com canônico no grid / freeze

| Campo | Conteúdo |
|-------|----------|
| Descrição | Grid calcula ambos; freeze em `service_orders` usa totais do caminho live |
| Consequência | Espelho OS diverge do Balanço canônico |
| Prioridade | P0 |
| Módulos | `operational.ts`, campos `fat_calculado` |
| Restrição | Não gravar novos espelhos oficiais a partir do live |
| Correção futura | Eliminar freeze financeiro ou baseá-lo no canônico; rotular campos como cache |
| Status | Aberta |

### D03 — Espelhos financeiros em `service_orders`

| Campo | Conteúdo |
|-------|----------|
| Descrição | `fat_calculado`, `custo_*_alocado`, `margem_calculada`, etc. |
| Consequência | Consumidores tratam espelho como fato |
| Prioridade | P1 |
| Módulos | OS, cobrança judicial, grid |
| Restrição | Novos leitores devem preferir billing/boletim |
| Correção futura | Deprecar campos ou marcar cache com bust obrigatório |
| Status | Aberta |

### D04 — Canceladas no snapshot da diretoria

| Campo | Conteúdo |
|-------|----------|
| Descrição | `financial-snapshot` trata cancelada+recusada como excluídas/zero; Balanço mantém cancelada (100 km) |
| Consequência | Cards diretoria ≠ Balanço |
| Prioridade | P0 |
| Módulos | `financial-snapshot.ts`, `balanco-calc.ts` |
| Restrição | Não copiar a lógica do snapshot para novos KPIs |
| Correção futura | Alinhar cancelada à regra `computeCanceladaBilling` |
| Status | Aberta |

### D05 — Múltiplas margens

| Campo | Conteúdo |
|-------|----------|
| Descrição | Margem no billing, na OS congelada, no Balanço, no snapshot |
| Consequência | Decisão gerencial ambígua |
| Prioridade | P0 |
| Módulos | billing, operational, balanco-calc, financial-snapshot |
| Restrição | KPI “margem oficial” = só `balanco-calc` |
| Correção futura | Remover ou rebaixar as outras a “estimado” |
| Status | Aberta |

### D06 — Múltiplas fontes de custo

| Campo | Conteúdo |
|-------|----------|
| Descrição | `mission_costs` · billing · OS alocada · `financial_transactions` |
| Consequência | Double-count ou omissão |
| Prioridade | P1 |
| Módulos | mobile, escort, balanço, financeiro |
| Restrição | Novos custos: fato de origem → FT idempotente |
| Correção futura | Hierarquia formal de custo na implementação |
| Status | Aberta |

### D07 — Três fontes de ponto

| Campo | Conteúdo |
|-------|----------|
| Descrição | `control_id_punches`, `employee_timesheets`, `timesheets` (+ `jornada_calculos`) |
| Consequência | Folha inconsistente; storage legado mistura tabelas |
| Prioridade | P1 |
| Módulos | control-id, hr, storage, folha |
| Restrição | Primário = Control iD para Balanço |
| Correção futura | Unificar leitura; deprecar `timesheets` |
| Status | Aberta |

### D08 — APIs e páginas órfãs

| Campo | Conteúdo |
|-------|----------|
| Descrição | gestor-medicao, gestor-dados, os-financeiro, consultas UI |
| Consequência | Feature morta / links quebrados |
| Prioridade | P1 |
| Módulos | `App.tsx`, `routes.ts`, pages/routes gestor* |
| Restrição | Não documentar como ativo até religar completo |
| Correção futura | Registrar + testes **ou** remover da UI |
| Status | Aberta |

### D09 — Webhooks frágeis

| Campo | Conteúdo |
|-------|----------|
| Descrição | Inter aberto; Z-API token opcional; Asaas fail-open |
| Consequência | Comprometimento financeiro/comunicação |
| Prioridade | P0 |
| Módulos | inter, whatsapp, asaas |
| Restrição | Não adicionar webhook novo sem auth obrigatória |
| Correção futura | Ver [`05-SEGURANCA.md`](./05-SEGURANCA.md) |
| Status | **Parcial** — Inter mitigado (desativado + webhook 410); Z-API e Asaas ainda abertos |

### D10 — RLS permissiva em `users`

| Campo | Conteúdo |
|-------|----------|
| Descrição | Policies `USING (true)` + grants excessivos (anon/authenticated) |
| Consequência | Vazamento de perfis/roles/`plain_password` via PostgREST |
| Prioridade | P0 |
| Módulos | Supabase RLS |
| Restrição | Não criar policies abertas semelhantes; admin só via API+service_role |
| Correção | Migration `20260805164000_harden_users_rls.sql` aplicada e homologada em 2026-08-05 |
| Status | **Encerrada** (exposição RLS PostgREST corrigida) |

### D13 — Coluna `users.plain_password` legada

| Campo | Conteúdo |
|-------|----------|
| Descrição | Coluna texto legada; valores **já limpos** (36/36 NULL). Código/tipos **desacoplados** (PR4A). Artefatos de DROP + guards 4.5B + homologação PASS/FAIL versionados — **não aplicados**. RLS + `toSafeUser` + `sanitizeUserWrite` ativos. |
| Consequência | Coluna física ainda existe; risco residual se grants/policies regredirem ou alguém regravar texto |
| Prioridade | **Média (P2)** para DROP; valores sensíveis já nulos; app não depende do campo |
| Módulos | `public.users`, Auth/RH |
| Restrição | **Não criar dependência nova**; não logar; não exibir; não reintroduzir writers; **não** DROP sem backup + homologação live PASS; não inserir histórico falso de migration |
| Correção | **PR1–PR4A feitos.** **PR4B/4.5B:** migration/verify/runbook/homologate. **Baseline DB live** pendente. **Aplicação do DROP** = fase controlada seguinte. **PR4C:** docs pós-DROP |
| Status | **PR4B / 4.5B HOMOLOGAÇÃO ESTÁTICA OK — BASELINE DB PENDENTE — DROP AINDA NÃO APLICADO** |
| Camadas | Zero readers/writers operacionais; schema TS sem campo; filled=0 / null=36; migration DROP versionada sem aplicar (guards `pg_depend`/procedures/rules); coluna física permanece |

### D11 — Caches longos

| Campo | Conteúdo |
|-------|----------|
| Descrição | SWR 3h + snapshot persistido até 24h |
| Consequência | Decisão em dado velho se bust falhar |
| Prioridade | P2 |
| Módulos | `swr-cache.ts`, balanco-cache |
| Restrição | Writers financeiros devem bustar |
| Correção futura | Indicador de idade + bust garantido |
| Status | Aberta |

### D12 — Documentação antiga

| Campo | Conteúdo |
|-------|----------|
| Descrição | `MAPA_SISTEMA_COMPLETO.md`, trechos de `AGENT_RULES.md` / knowledge graph desatualizados |
| Consequência | Agente segue norma errada |
| Prioridade | P1 |
| Módulos | docs raiz |
| Restrição | Em conflito, vence `docs/governanca/` |
| Correção futura | Marcar obsoleto / redirecionar (feito em parte na Fase 1.0) |
| Status | Parcialmente mitigada (esta pasta) |

### D13 — Evolução do banco pelo bootstrap

| Campo | Conteúdo |
|-------|----------|
| Descrição | `db-init.ts` + `exec_sql` no boot; falhas engolidas |
| Consequência | Drift de schema; índices/RLS inconsistentes |
| Prioridade | P1 |
| Módulos | `db-init.ts` |
| Restrição | Mudanças novas preferem migração versionada |
| Correção futura | Pipeline de migrations revisadas |
| Status | Aberta |

### D14 — Ausência de migrations versionadas consistentes

| Campo | Conteúdo |
|-------|----------|
| Descrição | Pasta `migrations/` ativa vazia/ausente no fluxo oficial |
| Consequência | Sem histórico reproduzível de schema |
| Prioridade | P1 |
| Módulos | drizzle, supabase |
| Restrição | Não “só db-init” para mudanças críticas novas |
| Correção futura | Adotar migrations obrigatórias |
| Status | Aberta |
