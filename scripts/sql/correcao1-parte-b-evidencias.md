# Correção 1 — Evidências Parte B (RHID/AFD)

PR: #33 (draft). Não merge / não deploy. Não alterar históricos.

## Competência
- Início: `2026-06-26 00:00:00-03`
- Fim exclusivo: `2026-07-26 00:00:00-03`
- 17 funcionários · **1.085** batidas
- in **391** · out **393** · unknown **301**

## Device
- Nome: RHID Cloud - Torres Vigilância
- `tipo`: `rhid_cloud`
- Path de sync: `GET/POST …/customerdb/afd.svc/a`
- Última sync consultada: status ok

## Origem dos 301 unknown
| Origem | Qtd |
|---|---:|
| RHID/AFD (`source` null + `external_id` rhid_*) | 291 |
| Lançamento manual | 10 |
| **Total** | **301** |

## Payload AFD
- Campo presente nos 291: **`Tipo`**, valor **sempre 3**
- Ausentes: `direction`, `flow`, `tipo`, `event`, `inOut`, `InOut`, `status`
- `Tipo=3` também em registros já `in`/`out` → **não** é entrada/saída
- No código Torres, POST de batida manual envia `Tipo: 3` (`createRhidPunch`)

## 24 AFD já classificados (13 in + 11 out, source null)
- Sync AFD só grava `unknown`
- Adoption só muda `external_id`
- Único write de `direction` sem alterar `source`: `PATCH /api/control-id/punches/:id` → `updateLocalPunch`
- Conclusão: classificação veio de **edição humana local**, não do RHID

## Emp 36
- 61 batidas, **todas** unknown, 0 in/out
- Não inferir alternância; não auto-corrigir

## Volume atual (consulta SQL 6)
| Janela | Unknown | AFD | Manual |
|---|---:|---:|---:|
| 7 dias | 89 | 88 | 1 |
| 30 dias | 319 | 309 | 10 |

## Política vigente (Correção 1)
- `direction = unknown` em novos AFD
- `direction_missing_reason = 'afd_no_direction_field'`
- `RHID_DIRECTION_NORMALIZE=false`
- Sem inferência cronológica
- `raw_event` imutável

## Próximo passo (não nesta PR)
Investigar endpoint RHID **alternativo** ao AFD (ex.: apuração / espelho / `util.svc/ultimasmarcacoes` / API REST de batidas, se disponível no tenant) — somente leitura, sem ativar mapeamento até prova de campo confiável.
