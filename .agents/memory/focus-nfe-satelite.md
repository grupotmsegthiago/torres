---
name: NFS-e Focus NFe (satélite SP)
description: Emissão de NFS-e vai pela Focus NFe; Asaas fica com boleto. invoices é SSOT. Sem Edge Function.
---

# NFS-e Focus NFe

Novas NFS-e: `server/lib/focus-nfe.ts` via `POST /v2/nfse?ref=torres-inv-{id}` (Basic Auth token, senha vazia).
Homologação padrão (`https://homologacao.focusnfe.com.br`); produção só com `FOCUS_NFE_ENV=producao`.

Boleto/PIX/baixa: Asaas. Documento `inv_*` ainda vivo: não migrar (duplicidade fiscal).

Tabela: `invoices` existente (integer PK). Colunas: `nfse_ref`, `nfse_codigo_verificacao`, `nfse_xml_path`, `nfse_provider`.
Não criar segunda tabela nem Edge Function — rotas oficiais `/api/invoices/:id/emit-nfse` com role.

Status persistido no vocabulário Torres (`AUTHORIZED` / `PROCESSING` / `ERROR` / `CANCELLED`).
`nfse_number` = ref Focus até existir número municipal (como `inv_*` no Asaas). `isFinalNfNumber` ignora `torres-inv-*`.

Secrets: `FOCUS_API_TOKEN`, `FOCUS_PRESTADOR_IM`, `FOCUS_WEBHOOK_TOKEN` (webhook fail-closed).
Código serviço: LC 116 `11.02` + municipal `07870`. Discriminacao Focus = escolta + período + ANEXO IV + Simples Nacional. ISS 5% retido + INSS 11% no boleto Asaas e na NF.
