---
name: Reis HE 109 vs 103:45 — diagnóstico 31/07/2026
description: Print Balanço 109h é first_last nas batidas atuais (329:00−220); 103:45 exigia snapshot intermediário (30/06 @12:18) que não existe no banco; limpo≈102:22
---

# Reis: por que a tela mostra 109 (e não 103:45)

**Competência:** 26/06/2026 → 25/07/2026 · emp **#22**  
**Fonte do print:** `rh-summary` → `resolveHorasExtrasNoturnasBulk` → `heFromBatidas` → `buildFolhaPonto` (`first_last`).

## Números (SQL ao vivo 31/07/2026)

| Cenário | Trabalhadas | HE |
|---------|------------:|---:|
| Batidas atuais + `first_last` | **329:00** | **109:00** (= print) |
| Alvo dono (decisão anterior) | 323:45 | **103:45** |
| PDF Control iD (TOTAL NORMAIS) | 322:22 | **102:22** |
| Batidas oficiais + `first_last` | 333:01 | 113:01 |

`ponto_operacional` / `jornada_calculos` do período: **vazios** (não são a fonte do 109).

## Por que 329:00 e não 323:45

Δ = **+5:15**, quase todo em 2 dias:

| Dia | Atual (first_last) | Snapshot que dava 103:45 | Δ |
|-----|-------------------:|-------------------------:|--:|
| 30/06 | 19:59 (1ª batida **00:27**) | 10:44 (1ª **12:18**) | **+9:15** |
| 21/07 | 4:24 (00:00, **02:24**, **12:00**, **13:00**, 14:00) | 8:24 (00:00, 02:24, **08:00**, 14:00) | **−4:00** |
| Net | | | **+5:15** |

- **00:27 em 30/06** existe no AFD (`rhid_15239_…`) e no PDF oficial — **não há** batida 12:18 no banco.
- **21/07** ficou com almoço fantasma 02:24→12:00 (9h36) por batidas extras; o cartão oficial é 00:00 / 02:24 / 08:00 / 14:00.
- Em **30/07** o sync AFD inseriu ruído (04/07 00:01·00:02·03:40, 20/07 07:00, 21/07 02:24). Remover só esses **sobe** a HE sob `first_last` antigo (pior).
- **Dono confirmou (31/07):** no 20/07 a sequência real é 05:53 entrada → almoço → 13:20 → 23:59; o **07:00 é erro** (reentrada com ponto aberto). Tratado por `stripIllegalDeviceReentries` (não inventar 12:18 no 30/06).

## Conflito de regra (dono)

1. Pediu manter **103:45** (não o PDF 102:22).  
2. Print veio **109**; pediu **voltar a 103:45**.  
3. **103:45 não é reproduzível** com `first_last` nas batidas atuais sem inventar a 12:18 do dia 30/06 (contradiz AFD/PDF).  
4. Caminho limpo (corrigir 21/07 para o cartão + tratar órfã 23:59 do 20/07 com pares) → ≈ **102:22**.

## O que NÃO fazer

- Hardcode `if (empId===22) return 103.75` sem override auditável.  
- `UPDATE` da 00:27→12:18 só para “fechar” o número (corrompe ponto legal).  
- Reativar pares gulosos em produção sem FASE 4.

## Próximo passo (precisa decisão do dono)

**A)** Aceitar **102:22** (cartão) e corrigir batidas 21/07 + regra da órfã 20/07.  
**B)** Congelar pagamento **103:45** via override/histórico auditável só para emp#22 / 2026-07 (ponto continua mostrando batidas reais).  
**C)** Outro número explícito.
