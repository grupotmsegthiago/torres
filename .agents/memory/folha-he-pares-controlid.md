# HE Folha — motor de pares (dev) × first_last (prod default)

**Alvo Reis cartão oficial (26/06→25/07/2026):** TOTAL **322:22** · HE **102:22** × R$ 16.

## Estado (PR desenvolvimento)

| Motor | Onde | Reis (fixture) |
|-------|------|----------------|
| `first_last` (legado) | default produção | Torres **323:45** / HE **103:45** |
| `pares` (canônico novo) | `FOLHA_ENGINE=pares` só fora de prod; `server/lib/jornada-pares.ts` | Oficial **322:22**; Torres dump/reconstr. **313:06** / HE **93:06** |

**313:06 é o valor EXATO** (não 313:05): `323:45 − 10:39 = 313:06` e `322:22 − 09:15 − 00:01 = 313:06`.

Ativação em produção exige simulação FASE 4 + autorização expressa. Legado permanece para A×B.

## Regressões a NÃO repetir

| Tentativa | Resultado |
|-----------|-----------|
| Strip `00:00`/`23:59` | HE **0:00** (órfãs no noturno) |
| Exigir 322:22 no dump Torres | Falso — 30/06/04/07 divergem do cartão |
| Hardcode −01:23 / employee_id 22 | Proibido |

## Taxa

CCT vigilância: sempre R$ 16 / R$ 16,50 (`normalizeVigilanciaHeRates` força na leitura).
Cache: `rh-summary-v13`.
