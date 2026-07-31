---
name: Ponto canônico 4 batidas — Entrada Control iD + 3 manuais
description: Processo operacional (dono 31/07/2026): parede = entrada prioritária; sync diário; operação lança almoço/fim; máx 4/dia; virada de meia-noite OK
---

# Ponto canônico: Control iD + Torres

## Processo (fonte da verdade operacional)

1. Funcionário bate **Entrada** no Control iD da parede → **prioridade** na folha.
2. Sync diário Control iD → Torres (cron 00:00 / 12:00 BRT + recon).
3. Operação lança as outras batidas no Torres: **saída almoço**, **retorno almoço**, **fim**.
4. **No máximo 4 batidas/dia** para cálculo (e bloqueio na API manual).
5. Virada de meia-noite é normal (turno pode terminar no dia seguinte).

## Código

- `selectCanonicalDayPunches` / `isControlIdDevicePunch` / `stripIllegalDeviceReentries` — `server/lib/control-id-parsers.ts`
- Folha usa os 4 slots canônicos — `buildFolhaPonto` em `server/control-id.ts`
- Manual bloqueia 5ª batida — `createManualPunch` (override: `allowExtraPunches` / `forceExtra`)
- UI “dia completo” não relança Entrada se já houver batida do aparelho
- Cache Balanço: `rh-summary-v14`

## Reentrada ilegal (ex. Reis 20/07/2026)

- Entrada 05:53 (parede) → ponto aberto.
- Batida 07:00 (AFD/parede) **não existe** para a folha: não se entra de novo com ponto aberto.
- Sequência válida: 05:53 → almoço out → almoço in → 23:59 (fecha) → 00:00 no dia seguinte.
- `stripIllegalDeviceReentries` descarta device extras até a operação lançar almoço/ajuste (marcador 00:00 não libera).

## O que NÃO fazer

- Usar `sorted[0]` cego como entrada quando há facial mais tarde no dia.
- Descontar almoço como `sorted[1]–sorted[2]` com 5+ batidas (almoço fantasma).
- Strip global de `00:00`/`23:59` (quebra noturno).
- Contar 07:00 (ou similar) como 2ª entrada no mesmo dia com ponto já aberto.
