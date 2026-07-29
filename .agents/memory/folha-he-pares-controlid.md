# HE Folha = pares Control iD (COM 00:00/23:59 no turno noturno)

**Regressão 29/07/2026:** strip de `00:00`/`23:59` zerou HE e noturno de
vigilantes que cruzam meia-noite (Reis: HE 0:00, Adic. Noturno R$ 414).

**Regra correta (pagamento Folha):**
- Manter marcadores `00:00`/`00:01`/`23:59` — o espelho PDF os usa para costurar
  turno noturno (`18:00→23:59` + `00:00→06:00`).
- Pares guloso no dia BRT + teto 19:59.
- `stripSyntheticMarkers: true` só em testes/offline.
- Cache `rh-summary-v12` (bust de v11).

**Alvo Reis (26/06→25/07):** HE ~102:22–103:45 × R$ 16; noturno × R$ 16,50.
`102,22` no Control iD = **102:22** (HH:MM), não decimal 102.22.
