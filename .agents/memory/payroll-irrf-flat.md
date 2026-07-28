---
name: INSS 9% flat, IRRF 0% (modelo Torres, planilha oficial 28/07/2026)
description: Folha do funcionário usa INSS 9% flat e IRRF 0%; FGTS não desconta do líquido; sem tabela progressiva
---

# INSS 9% flat + IRRF 0% (modelo Torres)

**Regra (auditoria vs planilha oficial do dono, 28/07/2026):** INSS do funcionário
= `baseTributavel × 9%` flat; **IRRF = 0%**. FGTS NÃO desconta do líquido.
Líquido = base − INSS − VT (VT 6% só p/ CLT administrativo, ex.: Katia; vigilante não tem VT).
Substitui o modelo anterior (INSS 12% / IRRF 22% flat de 26/06/2026). NÃO usar tabela progressiva.
Defaults centralizados em `server/lib/payroll.ts` (INSS_FLAT_PCT_PADRAO/IRRF_FLAT_PCT_PADRAO)
e replicados em buildFolhaStats.

**Histórico:** antes era IRRF 22% flat (média 18–27,5%) e INSS 12% flat; abandonado em 28/07/2026 quando a planilha oficial mostrou INSS 9% e IRRF 0.
