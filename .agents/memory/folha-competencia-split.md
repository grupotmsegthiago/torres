---
name: Competência da folha é dividida (26→25 só p/ salário+horas)
description: Regra do dono 28/07/2026 — quais rubricas seguem o ciclo 26→25 e quais seguem o mês civil
---

# Competência da folha: split 26→25 vs mês civil

**Regra (dono, 28/07/2026):** SÓ salário base (rateio) e horas (HE + adicional
noturno, via ponto) seguem o ciclo 26 → 25. TODO o resto — VR, cesta básica,
diárias, seguro de vida, atestados da Cesta II — conta pelo MÊS CIVIL (01 → 30/31).

**Why:** é assim que a planilha oficial do dono fecha; antes o sistema aplicava
26→25 em tudo e as diárias/VR não batiam com a planilha.

**How to apply:** qualquer nova rubrica de benefício/desconto entra no frame
civil; só o que deriva de batidas de ponto entra no 26→25. Vale p/ Balanço
(rh-summary) e Folha de Ponto (buildFolhaStats) — manter os dois iguais.
