---
name: Reis HE oficial = 103:45 (first_last Torres)
description: Dono (31/07/2026) confirmou que a HE correta do Reis 26/06→25/07 é 103:45 da Folha Torres, não 102:22 do PDF Control iD
---

# Reis: HE oficial = 103:45

**Decisão do dono 31/07/2026:** para Jorge dos Reis Oliveira (emp **#22**),
competência **26/06/2026 → 25/07/2026**, o valor correto de Hora Extra é o da
**Folha Torres** com motor `first_last`:

```
trabalhado 323:45 − 220:00 = HE 103:45
```

**NÃO** tentar “alinhar” ao PDF/cartão Control iD **102:22** (trabalhado 322:22).
Essa divergência de +01:23 é aceita; a fonte de pagamento/custo RH é a Folha Torres.

## Configuração a preservar

- Motor de produção: `first_last` (first→last − 1º almoço, teto 19:59)
- HE pagamento: `max(0, Σ worked − horas_mensais)`
- `CONTROL_ID_CANONICAL_PAIRING=false` (pares off)
- Não reativar pares gulosos / strip 00:00·23:59 / ponto_operacional como fonte primária

## Regressão a evitar

Qualquer patch que force o Reis de volta para **102:22** (ou 322:22 trab) contra
esta decisão do dono.
