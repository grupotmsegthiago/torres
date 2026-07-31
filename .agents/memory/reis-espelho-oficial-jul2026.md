---
name: Reis folha = espelho oficial Control iD jul/2026
description: Batidas emp#22 alinhadas ao PDF oficial (HE 102:22); Folha calcula por pares; período 26/06–25/07 travado
---

# Reis — espelho oficial (26/06 → 25/07/2026)

**Fonte:** cartão Control iD `JORGE_REIS_-_relatorio_2026727_1645_0461.PDF`  
**Totais:** NORMAIS **322:22** · HE **102:22** · base 220h

## O que foi feito (31/07/2026)

1. `control_id_punches` emp **#22** no período → apagado e reinserido com
   `source=folha_pdf_import` (local-only, sem sync RHID).
2. `control_id_locked_periods` **2026-06-26 → 2026-07-25** (AFD não ressuscita extras).
3. `buildFolhaPonto` usa **pares guloso** (`computeDayWorkedMinutesFromPunches`)
   — igual ao cartão (20/07 = 02:16; órfã 23:59 não conta).
4. Script: `scripts/sync-reis-oficial-folha.mjs`
5. Cache Balanço: `rh-summary-v16`

## Não confundir

- 05:53→07:00 no cartão é **par válido** (Ent.1/Saí.1), não “reentrada ilegal”.
- Eco facial (&lt; 5 min) continua descartado/alertado.
- VR/benefícios no Balanço seguem mês civil; só ponto/HE no ciclo 26→25.
