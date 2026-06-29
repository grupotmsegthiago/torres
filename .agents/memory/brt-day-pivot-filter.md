---
name: Virada de dia BRT em filtros de período
description: Por que filtrar por dia-calendário BRT não pode depender de new Date() sob TZ=UTC, e como blindar.
---

# Virada de dia BRT em filtros de período

O processo Node roda em **TZ=UTC**. Para bucketing/filtro por **dia-calendário BRT**,
`new Date(ts).toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"})` só acerta a
madrugada (00:00–02:59) **se o timestamp trouxer o offset** (`-03:00`). Para um timestamp
**BRT-nativo SEM sufixo** (formato canônico do §1.1), `new Date()` interpreta como UTC e a
data escorrega para o **dia anterior**, derrubando a OS do filtro de período.

**Estado real (jun/2026):** os `scheduled_date` de produção vêm com `-03:00` (contrariando o
§1.1, que diz "sem sufixo"). Por isso o bug NÃO se manifesta hoje — verificado em 359 OSs,
incl. 12 de madrugada: zero divergência entre `new Date()` e o prefixo da string.

**Regra durável:** ao filtrar/agrupar por dia BRT, use `server/lib/brt-date.ts` `brtDateKey`,
não `new Date()` cru. Se o wall-clock já é BRT (sem sufixo, `-03:00`, `-0300`) o prefixo
`YYYY-MM-DD` É a data BRT (basta fatiar); só converta via `toLocaleDateString` quando houver
`Z` (UTC) ou offset não-BRT.

**Why:** evita que a virada de dia dependa do fuso do processo + do formato volátil de
armazenamento; é no-op para os dados atuais (`-03:00`) e blinda o caso sem offset.

**How to apply:** já aplicado no filtro do grid `/api/operational-grid` (operational.ts:
`sdBRT/cdBRT/msBRT`). Mesmos cuidados valem para qualquer novo leitor de data-calendário
BRT (`udBRT`, `toDateBRT`, `osDateOf` ainda usam `new Date()` cru — só padronizar se um caso
sem offset aparecer; `toDateBRT`/`osDateOf` afetam rateio de custo §8, mexer só sob ordem).
O frontend `getDateRange` do Balanço já produz 00:00:00→23:59:59 (semana seg→dom, mês 01→último).
