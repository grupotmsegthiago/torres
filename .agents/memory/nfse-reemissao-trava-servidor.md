---
name: Re-emissão de NFS-e exige trava de estado no servidor
description: Endpoint que re-emite/reprocessa NFS-e precisa validar papel E estado no backend, não só na UI.
---

Qualquer endpoint que re-emite/reprocessa NFS-e (ex.: "resolver NF com erro") deve, no servidor:
- exigir papel financeiro/admin/diretoria (não confiar só no gating de UI);
- só prosseguir se a NF estiver em erro confirmado;
- bloquear re-emissão somente se a NF estiver **realmente emitida**: `isNfFullyIssued` = status AUTHORIZED/SYNCHRONIZED/ISSUED **e** número municipal (não o id `inv_...`).

AUTHORIZED sem número da prefeitura **não** é NF emitida — é processando. Travar re-emissão nesse estado deixa a fatura muda para sempre.

Antes de re-emitir, consultar o Asaas (`GET /invoices?payment=`). Se já existir documento com número municipal, sincronizar e recusar o POST (duplicidade fiscal).

Erro = ERROR/ERRO/REJECTED/DENIED/FAILED/FALHA / AWAITING_CORRECTION (ou `nfse_error_message` presente).

**Why:** re-emitir uma nota já autorizada na prefeitura gera duplicidade fiscal. AUTHORIZED local sem nº costuma ser autorização pedida, não nota existente.

**How to apply:** usar `canReemitNfse` em `server/lib/asaas-helpers.ts` nas rotas de re-emissão.
