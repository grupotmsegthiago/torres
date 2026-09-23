## Relatório de Entrega — Desligar retenção ISS 5% (Focus + boleto Asaas)

**Data:** 2026-09-23
**Branch:** `cursor/desabilitar-iss-5-percent-51ba`
**Ambiente validado:** [x] local  [ ] preview  [ ] produção
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca: `ISS_RETAIN`, `retainIss`, `iss_retido`, `netBoletoValue`, `boletoRetentionOpts`, Focus `buildFocusNfsePayload`.
- Existente aproveitado: constante canônica `ISS_RETAIN` já compartilhava Focus + boleto + taxes + e-mail.
- Algo novo criado? [x] Não

### Domínio / tipo do dado
- Domínio dono: Cobrança / NFS-e (`invoices`, Focus satélite, Asaas boleto)
- Tipo: Resultado de retenção fiscal (não Fato de OS)

### O que foi alterado
- `ISS_RETAIN = false`: NFS-e Focus sem `iss_retido` / `valor_iss_retido`; boleto Asaas não desconta 5% de ISS; taxes Asaas com `retainIss: false`.
- INSS 11% quando `emite_nf` permanece.
- Testes e texto da tela de faturas alinhados.

### O que NÃO foi alterado
- Motor `calcularEscolta`, boletim, schema, emissão Focus/Asaas em si.
- `ISS_ALIQUOTA = 5` (referência fiscal no payload; sem cobrança/retenção).

### Arquivos modificados
- `server/lib/asaas-helpers.ts`, `server/lib/asaas-helpers.test.ts`
- `server/lib/focus-nfe-helpers.test.ts`
- `server/asaas.ts` (comentários)
- `client/src/pages/admin/faturas.tsx` (texto)
- `docs/governanca/CHANGELOG-GOVERNANCA.md`, este relatório

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `tsx --test server/lib/asaas-helpers.test.ts server/lib/focus-nfe-helpers.test.ts` | pass (133/133) |
| Evidência runtime bruto 1000 / emite NF | boleto 890 (só INSS); Focus `iss_retido=false`, sem `valor_iss_retido` |

### Resultados (negócio)
- Novas faturas com NF: boleto = bruto − INSS (se aplicável), sem −5% ISS.
- Novas NFS-e Focus: `iss_retido: false`, sem valor retido de ISS.

### Riscos / rollback
- Faturas antigas com ISS já descontado no boleto Asaas não são recalculadas.
- Rollback: `ISS_RETAIN = true` + reverter testes/textos.

### Próximo passo
- Publicar só com pedido explícito (`publicar.ps1`).
