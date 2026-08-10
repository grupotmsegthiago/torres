# Relatório de Entrega — PR5B.1-TX Proteção Atômica de Billing

**Data:** 2026-08-10  
**Branch:** `cursor/pr5b1-canonical-billing-engine-35ed`  
**Commit técnico homologado:** `786ba9581f6be5be90d26619298e4b03dd6fa623`  
**Ambiente validado:** local, CI PostgreSQL efêmero e banco live  
**Publicou?** Não — merge/deploy/publicação não fazem parte desta entrega.

## Reutilização (D11 / P13)

- Busca realizada: todos os writers de `escort_billings` e
  `boletim_approvals`, crons, invoice lifecycle, RLS, triggers e rollbacks.
- Existente aproveitado: `calcularEscolta`, `computeCanceladaBilling`,
  `billingTotalForBoletim`, wrappers Supabase e fluxos de boletim/invoice.
- Algo novo criado: RPCs e guards transacionais necessários para eliminar a
  janela TOCTOU; nenhuma engine financeira paralela foi criada.

## O que foi alterado

- Escritas de billing/boletim/invoice centralizadas em RPCs atômicas.
- `lock_version`, locks ordenados, frozen/snapshot e batch invoice protegidos.
- Role NOLOGIN/NOINHERIT sem BYPASSRLS, policies explícitas e ACL fail-closed.
- DML direto bloqueado por enforcement.
- Cron e writers produtivos migrados para o gateway RPC.

## O que NÃO foi alterado

- Motor oficial `calcularEscolta`.
- Cancelada `computeCanceladaBilling`.
- Recusada = zero.
- Live = projeção.
- Snapshot aprovado/frozen = imutável.
- Ledger e fórmula do Balanço.

## Arquivos principais

- `server/lib/atomic-billing.ts`
- `server/lib/billing-frozen.ts`
- rotas billing/mission/service-orders/boletim e `server/asaas.ts`
- testes unitários, estáticos e PostgreSQL integration
- `docs/governanca/PR5B1-TX-DESENHO-PROTECAO-ATOMICA.md`
- migrations e rollbacks PR5B.1-TX

## Banco / migrations

- `20260810183628_atomic_billing_expand.sql`
- `20260810185149_fix_atomic_billing_rpc_acl.sql`
- `20260810190554_atomic_billing_enforcement.sql`

Registros live correspondentes:

- `20260810183628 / atomic_billing_expand`
- `20260810185149 / fix_atomic_billing_rpc_acl`
- `20260810190554 / atomic_billing_enforcement`

## Testes executados

| Comando / evidência | Resultado |
|---|---|
| Suítes PR5B.1-TX locais | PASS |
| PostgreSQL integration / concorrência | PASS |
| ACL efetiva / RLS sem BYPASSRLS | PASS |
| Direct DML / service_role bypass | BLOQUEADOS |
| Frozen/snapshot/cancelada/recusada/invoice | PASS |
| CI `test-and-build` | PASS |
| Build CI | PASS |
| Smoke live transacional com ROLLBACK | PASS |
| Baseline financeiro antes/depois | inalterado |

## Resultados

Billing e snapshots comerciais agora são persistidos por caminhos atômicos,
com concorrência, ownership, ACL, RLS e DML direto protegidos no banco.

## Regressões verificadas

- Cron continua pela RPC.
- Invoice/payment/rebill continuam atômicos.
- Arquivamento legítimo de boletim continua permitido.
- Trigger de service_orders preservado.
- Fixture de smoke removida integralmente por ROLLBACK.

## Segurança

- Secrets no diff: não.
- RPCs anon/authenticated/PUBLIC: sem EXECUTE.
- service_role: somente seis RPCs previstas.
- Helper de lock: owner-only.
- Guard functions: sem EXECUTE externo.
- Role owner: sem LOGIN, BYPASSRLS ou atributos elevados.

## Backup / ponto de restauração

- Backup físico confirmado antes do rollout: 2026-08-10 07:58:17 UTC.
- Rollbacks versionados para EXPAND e ENFORCEMENT.
- Nenhum restore executado.

## Deploy

- Healthcheck: N/A — não houve deploy.
- URL/ambiente: banco live homologado; app não publicado nesta etapa.

## Evidências

- CI final do enforcement: `31436395229`.
- VERIFY final: 7 RPCs, 8 policies, 2 guard functions, 4 triggers habilitados.
- Baseline: 599 billings / 1188520.74; 88 approvals / 3198411.09.

## Pendências

- Fechamento administrativo da PR #58.
- Merge e publicação somente sob autorização explícita.
- Não iniciar PR5B.2 automaticamente.

## Gates G1–G17

- G1–G17: atendidos ou N/A justificado.
- Domínio/tipo: faturamento; SNAPSHOT financeiro/comercial.
- Hierarquia e motor único preservados.
- Segurança fail-closed e integridade financeira demonstradas.
- Reutilização e inventário de writers documentados.

## Resumo executivo

1. Implementação técnica PR5B.1-TX concluída e homologada em 100%.
2. Banco live, CI e smoke transacional estão verdes, sem regressão financeira.
3. Restam somente merge/deploy administrativos sob autorização.
