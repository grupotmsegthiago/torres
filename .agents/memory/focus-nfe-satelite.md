---
name: NFS-e Focus NFe (satélite SP)
description: Emissão de NFS-e vai pela Focus NFe; Asaas fica com boleto. invoices é SSOT. Sem Edge Function.
---

# NFS-e Focus NFe

Novas NFS-e: `server/lib/focus-nfe.ts` via `POST /v2/nfse?ref=torres-inv-{id}` (Basic Auth token, senha vazia).
Homologação só com `FOCUS_NFE_ENV=homologacao` em runtime local/dev. Preview/production da Vercel (`NODE_ENV=production`) usa `api.focusnfe.com.br` — senão o token de produção falha em homologacao.focus.

Boleto/PIX/baixa: Asaas. **Nunca emitir NFS-e no Asaas** (`emitNfseImmediate` recusa). Documento `inv_*` vivo: só consulta.

Gerar Fatura: boleto Asaas + NF Focus + e-mail (CC financeiro/adm, BCC thiago) quando os dois existem.
Webhook Asaas RECEIVED/CONFIRMED marca fatura paga.

Tabela: `invoices` existente (integer PK). Colunas: `nfse_ref`, `nfse_codigo_verificacao`, `nfse_xml_path`, `nfse_provider`.
Não criar segunda tabela nem Edge Function — rotas oficiais `/api/invoices/:id/emit-nfse` com role.

Status persistido no vocabulário Torres (`AUTHORIZED` / `PROCESSING` / `ERROR` / `CANCELLED`).
`nfse_number` = ref Focus até existir número municipal (como `inv_*` no Asaas). `isFinalNfNumber` ignora `torres-inv-*`.

Secrets: `FOCUS_API_TOKEN`, `FOCUS_PRESTADOR_IM`, `FOCUS_WEBHOOK_TOKEN` (webhook fail-closed).
`inv_*` cancelado (não vivo) pode emitir Focus na mesma fatura — `shouldEmitNfseViaFocus(..., asaasLiveDoc=false)` retorna true.
Relatório `/admin/relatorio-nf` precisa do `AdminLayout`; colunas Boleto Asaas × NF Focus.
Botão do topo: **Sincronizar Focus** (`POST /api/relatorio-nf/sync-focus`). Não usar `/api/asaas/reconcile-all` nessa tela.
Código serviço: LC 116 `11.02` + municipal `07870`. Discriminacao Focus = escolta + período + ANEXO IV + Simples Nacional. ISS 5% retido + INSS 11% no boleto Asaas e na NF.
