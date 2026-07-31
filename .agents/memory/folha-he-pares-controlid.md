# HE Folha = first→last − 1º almoço

**Alvo Reis (26/06→25/07/2026) — decisão dono 31/07/2026:** HE **103:45**
(= trab **323:45** − 220) × R$ 16 — Folha Torres `first_last`.
O PDF Control iD (102:22 / 322:22) **não** é a referência de pagamento.
Ver `reis-he-103-oficial.md`.

## Regra de pagamento (INTOCÁVEL)

Por dia BRT, com batidas ordenadas (inclui marcadores `00:00`/`23:59`):

```
worked = min( (última − primeira) − (batida[2] − batida[1] se 4+), 19:59 )
HE_mês = max(0, Σ worked − 220h)
```

- Mantém marcadores de meia-noite (costuram turno noturno).
- Desconta **só o 1º intervalo** (almoço), não todas as pausas.
- Teto 19:59 remove fantasma do import PDF.

## Regressões a NÃO repetir

| Tentativa | Resultado |
|-----------|-----------|
| Pares gulosos (todas as pausas) | Reis **93:05** (subconta ~9h) |
| Strip `00:00`/`23:59` | HE **0:00** (órfãs no noturno) |
| Forçar alinhamento ao PDF 102:22 | Contradiz decisão dono 31/07/2026 |

`computeDayWorkedMinutesFromPunches` fica para análises/testes; **Folha usa first→last**.

## Taxa

CCT vigilância: sempre R$ 16 / R$ 16,50 (`normalizeVigilanciaHeRates` força na leitura).
Cache: `rh-summary-v13`.
