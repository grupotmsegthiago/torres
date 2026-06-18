---
name: Re-emissão de NFS-e exige trava de estado no servidor
description: Endpoint que re-emite/reprocessa NFS-e precisa validar papel E estado no backend, não só na UI.
---

Qualquer endpoint que re-emite/reprocessa NFS-e (ex.: "resolver NF com erro") deve, no servidor:
- exigir papel `diretoria` (não confiar só no gating de UI `isDiretoria`); e
- só prosseguir se a NF estiver REALMENTE em erro — bloquear se `nfse_status` for sucesso (AUTHORIZED/SYNCHRONIZED/ISSUED).

Classificação de estado espelha `normalizeInvoiceStatus` em server/asaas.ts: erro = ERROR/ERRO/REJECTED/DENIED/FAILED/FALHA (ou `nfse_error_message` presente); sucesso = AUTHORIZED/SYNCHRONIZED/ISSUED.

**Why:** re-emitir uma nota já autorizada gera duplicidade fiscal real (efeito colateral externo no Asaas). Gating só na UI é contornável chamando a rota direto.

**How to apply:** ao criar/editar rotas de emissão fiscal em server/asaas.ts, adicionar as duas travas (papel + estado) logo após buscar a invoice, antes de chamar `emitNfseImmediate`.
