# HE Folha = pares guloso Control iD (cartão oficial)

**Alvo Reis (26/06→25/07/2026):** HE **102:22** (= trab 322:22 − 220) × R$ 16.

## Regra de pagamento (31/07/2026 — bate com espelho oficial)

Por dia BRT, batidas ordenadas (inclui marcadores `00:00`/`23:59`):

```
worked = soma dos pares guloso entrada→saída (órfã não conta), teto 19:59
HE_mês = max(0, Σ worked − 220h)
```

- Mantém marcadores de meia-noite (costuram turno noturno).
- Ex. 20/07: 05:53→07:00 + 12:11→13:20 = **02:16** (23:59 órfã).
- `buildFolhaPonto` → `computeDayWorkedMinutesFromPunches`.

## Regressões a NÃO repetir

| Tentativa | Resultado |
|-----------|-----------|
| first→last no 20/07 com 5 batidas | **16:57** (infla HE; ≠ cartão) |
| Strip `00:00`/`23:59` | HE **0:00** (órfãs no noturno) |
| Pares com batidas AFD sujas (≠ cartão) | pode subcontar — alinhar batidas ao PDF |

## Taxa

CCT vigilância: sempre R$ 16 / R$ 16,50 (`normalizeVigilanciaHeRates` força na leitura).
Cache: `rh-summary-v16`.
