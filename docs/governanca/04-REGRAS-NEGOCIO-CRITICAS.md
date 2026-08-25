# 04 — Regras de Negócio Críticas

**Natureza:** normativo
**Evidência de implementação:** `server/billing-calc.ts`, `server/lib/cancelada-billing.ts`, `server/lib/boletim-totals.ts`, `server/lib/boletim-resync.ts`, `client/src/lib/balanco-calc.ts`

---

## OS concluída

1. Calcular pelo **contrato tarifário** vinculado (`escort_contracts`).
2. Respeitar franquias de KM e horas do contrato.
3. Cobrar somente **excedentes** acima da franquia (KM e/ou hora), conforme modelo do contrato (acionamento / km / misto).
4. Pedágio conforme regra oficial do motor (repasse + markup quando aplicável).
5. Usar **somente** o motor canônico `calcularEscolta`.
6. Inputs: odômetro (`mission_photos`), timestamps reais da missão, `mission_costs` agregados via `splitMissionCostsForBilling`.
7. Resultado materializado em `escort_billings` (snapshot por OS).

---

## OS cancelada

**Não confundir com recusada.**

1. **Não zerar** o valor comercial.
2. Cobrar a **franquia mínima** da tabela aplicável de funcionamento mínimo.
3. Regra de referência vigente: tabela do cliente com **franquia_km = 100** e **franquia_horas = 3** (status Ativo), via `getTabela100km` / `computeCanceladaBilling`.
4. Se houver excedente real de KM → cobrar KM excedente.
5. Se houver excedente real de horas → cobrar hora excedente (regras do motor / contrato).
6. Remover / não incluir **pedágio automático** que não foi efetivamente realizado (somente custos reais aplicáveis).
7. Custo operacional / pagamento (`pag_*`): conforme regra vigente de cancelamento (historicamente pagamento zero; faturamento permanece).
8. Utilizar **`computeCanceladaBilling`** — não inventar atalho no frontend.
9. Status de billing típico: `CANCELADO`.
10. **Preservar snapshots de boletim já aprovados** (não reabrir).
11. Em boletim **PENDENTE**, resync pode recongelar a cancelada com valores atuais do billing (`boletim-resync`).

---

## OS recusada

**Não confundir com cancelada.**

1. Valor comercial = **R$ 0** sempre (`billingTotalForBoletim(..., "recusada")` → 0).
2. Valor do fornecedor / pagamento operacional = **zero** (fluxo de refuse zera campos e remove custos).
3. **Sem faturamento** ao cliente.
4. **Fora do boletim** (remove do snapshot pendente; não vai no e-mail/Excel).
5. Não é aprovável como OS faturável.
6. Exigir motivo de recusa no fluxo operacional.

---

## Congelamento de billing

Status que **não podem ser recalculados automaticamente**:

- `APROVADA`
- `FATURADO`
- `FATURADA`
- `PAGO`

Constante de apoio no cliente: `FROZEN_BILLING_STATUSES` em `balanco-calc.ts`.

Edição manual excepcional, se existir, exige autorização de role adequada e trilha de auditoria — nunca cron silencioso.

### APROVADA (billing) ≠ aprovação do cliente (boletim)

- `escort_billings.status = APROVADA` = **aprovação interna**: OS conferida e pronta para enviar ao cliente. No Balanço Gerencial permanece **Finalizado**. Enviar/reenviar boletim **não** altera esse status.
- `boletim_approvals` (`PENDENTE` / `APROVADO` / …) = fluxo do **cliente** sobre a medição/fatura — processo separado.
- Snapshot comercial (`create_boletim_approval_atomic`) bloqueia apenas `FATURADO` / `FATURADA` / `PAGO`. `APROVADA` entra no boletim sem reabrir.

---

## Pedágio

1. Fato real: `mission_costs` com `cost_type=expense` e categoria Pedágio.
2. O sistema pode criar revenue pareado para reembolso contábil.
3. Em `splitMissionCostsForBilling`, a **revenue de pedágio NÃO soma em `receitas_os`** (evita duplicar com `despesas_pedagio` no `fat_total`) — bug histórico TOR-0179.
4. Ledger (`financial_transactions`) deve refletir o evento sem double-count no P&L.
5. Estimativa `service_orders.pedagio_estimado` **não** é pedágio realizado.

---

## Fonte oficial vs estimativa

| Uso | Motor / fonte |
|-----|----------------|
| Billing oficial, boletim, invoice, Balanço | **`calcularEscolta`** (+ cancelada/recusada) |
| Relatório operacional / preview rotulado | `calcularFaturamentoLive` **somente como estimativa** |
| Boletim enviado/aprovado | `boletim_approvals.billing_snapshot` |
| Caixa / lançamentos | `financial_transactions` |
| Margem gerencial | `balanco-calc.ts` |

**Proibido:** `calcularFaturamentoLive` alimentar boletim, invoice ou Balanço oficial.
**Proibido:** tratar `service_orders.fat_calculado` como valor comercial oficial.

---

## Quinzena / boletim

- Período do boletim deriva de `data_missao` / regras de quinzena do projeto.
- Bloquear cruzamento indevido de quinzenas no envio.
- Snapshot no envio garante tela = e-mail = Excel = aprovação.
