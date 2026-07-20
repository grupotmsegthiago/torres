---
name: Data-pura no frontend recua 1 dia
description: formatDateBRT/parseUTCDate aplicados a strings "YYYY-MM-DD" mostram o dia anterior no BRT
---

**Regra:** nunca passar data-pura (`YYYY-MM-DD`, sem hora) por `formatDateBRT`/`parseUTCDate`/`new Date(s+"Z")` no frontend — elas viram meia-noite UTC e, convertidas ao BRT (UTC-3), recuam 1 dia. Formatar data-pura por manipulação de string (split/reverse → dd/mm/aaaa); helper `fmtDia` no Balanço Gerencial é o modelo.

**Why:** dono viu OSs agendadas 22/07 exibidas como 21/07 no modal "OSs em Aberto" (07/2026). Os utilitários de `client/src/lib/utils.ts` assumem timestamp completo.

**How to apply:** ao exibir `scheduled_date` ou qualquer coluna DATE, cheque se a string tem componente de hora; se não tiver, formate por string. Backend análogo: brt-day-pivot-filter.md.
