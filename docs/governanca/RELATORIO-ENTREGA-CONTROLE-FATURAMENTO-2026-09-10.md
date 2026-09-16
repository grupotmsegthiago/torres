## Relatório de Entrega — Controle de Faturamento (Diretoria)

**Data:** 2026-09-10
**Branch:** dev (não publicado)
**Ambiente validado:** [x] testes unitários locais  [ ] preview  [ ] produção
**Publicou?** [ ] Não

### Reutilização (D11 / P13)
- Busca: `billing_cycle`, `auditoria-faturamento`, `boletim-medicao`, `billing_alerts`, `relatorio-faturamento`, `derivarSituacaoFinanceira`, `billingTotalForBoletim`.
- Existente: cadastro `clients.billing_cycle`; boletim; auditoria OS a OS; cron `billing_alerts`; invoices.
- Algo novo criado? [x] Sim — tela/KPI de cobertura por ciclo. Inviabilidade de só reutilizar a auditoria: ela é pente fino por OS (Controladoria), não o relatório Cliente/Período/Datas nem o semáforo da Diretoria. Sem segundo motor de preço e sem tabela nova.

### O que foi alterado
- Menu **Diretoria > Faturamento** com KPI visual (semáforo + OS sem fatura / sem aprovação / atrasados / aberto / pago / dias).
- Relatório por ciclo: Cliente, Período, Data de faturamento, Data de pagamento, Dias de atraso, cobertura OS faturadas/total.
- Gate no envio de boletim: bloqueia se faltar OS do ciclo ou se alguma não estiver APROVADA (cancelada calculada vale; recusada fora).
- Ciclo **diário** no cadastro do cliente; quinzenal 1–15 / 16–fim; mensal 1–último dia.
- Alertas do cron passam a considerar diário; perfil Financeiro vê a tela.

### O que NÃO foi alterado
- `calcularEscolta`, snapshot de boletim aprovado, invoices, ledger, Balanço.
- Relatório Faturamento (Comercial) e Auditoria de Ciclo continuam; auditoria agora usa o mesmo helper de ciclo.

### Arquivos modificados
- `shared/billing-cycle.ts` (+ testes)
- `server/lib/faturamento-controle.ts` (+ testes)
- `server/routes/controle-faturamento.ts`
- `server/routes/boletim-approval.ts`, `server/routes.ts`, `server/asaas.ts`, `server/cron-jobs.ts`, `server/db-init.ts`
- `client/src/pages/admin/faturamento.tsx`, layout, App, clients, boletim, auditoria
- `shared/perfis-acesso.ts`

### Banco / migrations
- [x] Nenhuma (ciclo diário reutiliza `clients.billing_cycle` TEXT)

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test shared/billing-cycle.test.ts server/lib/faturamento-controle.test.ts shared/perfis-acesso.test.ts` | pass |

### Resultados (negócio)
A Diretoria e o Financeiro passam a ver, num relance, se alguma OS do ciclo ficou de fora, se o boletim ainda não pode ir e o que está em aberto/pago/atrasado.

### Regressões verificadas
- Recusada continua fora do boletim (§8.1).
- Envio de boletim agora é mais estrito (cobertura + APROVADA) — comportamento pedido.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não — API com `requireFinanceiro` (diretoria/admin/financeiro)

### Backup / ponto de restauração
- Reverter os arquivos desta entrega; sem migration.

### Deploy
- Não publicado.

### Evidências
- Testes unitários verdes (ciclo, cobertura, ACL).
- UI no browser: não havia servidor local nesta sessão — validar em `/admin/faturamento` após login Diretoria/Financeiro.

### Pendências
- Perfis Financeiro já salvos no banco recebem `controle_faturamento` no GET `/api/auth/perfil` (merge). Cadastro de ciclo precisa estar preenchido no cliente.
- Conferir no ambiente real um cliente quinzenal com OS faltando (semáforo vermelho) e um pago (verde).

### Gates G1–G16
- G1 domínio: OS/billing/invoice (projeção de cobertura)
- G2 hierarquia: camada 11, não grava fato
- G3 sem motor paralelo de preço (`billingTotalForBoletim`)
- G5 testes do domínio verdes
- G8 API registrada + UI
- G9 N/A IA
- G14 sem secrets
- G17 reutilização documentada

### Resumo executivo
1. Toda OS faturável do ciclo do cadastro precisa estar no boletim e APROVADA antes do envio.
2. Diretoria > Faturamento mostra o que está errado em semáforo, não em texto longo.
3. Diário / quinzenal / mensal vêm do cadastro do cliente; Financeiro recebe os alertas na mesma tela.
