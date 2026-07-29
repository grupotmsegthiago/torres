# HE CCT fixas (diurna 16 / noturna 16,50)

- Modelo Torres vigilância: **não** usar `valorHora × 1,6/1,8` quando o Kit CCT tem taxa.
- Campos: `horaExtraValor` (R$ 16) e `horaExtraNoturnaValor` (R$ 16,50) em `shared/cct-config.ts`.
- Motor: `calcularFolha({ valorHoraExtraFixo, valorHoraNoturnaFixo })` — se > 0, prevalece.
- Wiring: `fixed-costs` / `salary-summary` / `buildFolhaStats` leem `getCctConfigByCargo`.
- Default antigo do código era **22,99** e foi seedado no banco — `normalizeVigilanciaHeRates` + migrate em `ensureDefaultPresets` corrigem para 16 / 16,50 na leitura.
- Cache Balanço: `rh-summary-v7` (bustar v6 e anteriores).
- SIEMACO mantém HE 0 (não aplica normalize de vigilância).
