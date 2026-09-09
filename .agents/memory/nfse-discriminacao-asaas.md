---
name: NFS-e Discriminacao oficial; PUT na mesma inv_*; sem segundo POST
description: Discriminacao = CNAE oficial; ERROR/SCHEDULED = PUT; SYNCHRONIZED sem RPS + texto antigo = erro visível; fila com RPS só poll.
---

`serviceDescription` = `nfDiscriminacaoOficial()` / `DESCRICAO_SERVICO_FIXA`. Cliente/período em `observations`.

Reprocesso: ERROR ou SCHEDULED com texto antigo → **PUT** `/invoices/{inv_*}` + authorize. **Proibido** segundo POST enquanto a inv_* existir.

SYNCHRONIZED/AUTHORIZED **sem RPS e sem nº** + Discriminacao ≠ oficial = rejeição escondida (#171): erro visível + Resolver. Cancel só no **painel Asaas**. Quando virar ERROR, PUT na mesma nota.

SYNCHRONIZED com Discriminacao oficial + RPS (#170) = fila da prefeitura: só GET/Sincronizar. Não cancelar. Não Emitir.

`/sync` não bumpa `updated_at` em no-op. Header reconcile: `unstickStaleNfReconcile` (3 min).

CCM do tomador (`clients.inscricao_municipal`, ex. 07930) **não** é o nº da NFS-e. Sincronizar envia CCM ao customer Asaas se diferir; **não** reescreve NF já na prefeitura. Sem Reemitir enquanto SYNCHRONIZED com RPS.
