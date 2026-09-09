---
name: NFS-e Discriminacao oficial; retry só em ERROR
description: serviceDescription da NFS-e é o CNAE oficial; PUT+authorize no inv_ em ERROR; processando só poll.
---

A Discriminacao da NFS-e (SP) **não** pode ser `Escolta Armada — ${cliente}`. A prefeitura rejeita o schema. Usar `nfDiscriminacaoOficial()` / `DESCRICAO_SERVICO_FIXA`. Período e cliente vão em `observations` sanitizados.

Reprocesso: se já existe `inv_*` com status ERROR, **PUT** `/invoices/{id}` (taxes completos) + **POST** authorize. Não fazer segundo POST `/invoices` (duplicidade). SYNCHRONIZED/AUTHORIZED sem número municipal = processando: só `GET`/Sincronizar.

Catch-up automático (`retryDiscriminacaoErrorNfses`) **somente** `isDiscriminacaoSchemaError` + `emite_nf=true`. Não retry de inscrição municipal da empresa (Asaas Informações Fiscais). Não emitir `emite_nf=false`.
