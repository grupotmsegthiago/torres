---
name: NFS-e Focus NFe (satélite nacional)
description: Emissão de NFS-e vai pela Focus no Ambiente Nacional /v2/nfsen. Asaas fica com boleto. invoices é SSOT. Sem Edge Function.
---

# NFS-e Focus NFe

Novas NFS-e: `server/lib/focus-nfe.ts` via `POST /v2/nfsen?ref=torres-inv-{id}` (Basic Auth token, senha vazia). Payload plano da DPS (`buildFocusNfsePayload`). Consulta `GET /v2/nfsen/{ref}` e cancelamento `DELETE /v2/nfsen/{ref}`. Se a Focus responder 404, consulta e cancelamento tentam `/v2/nfse/{ref}` só para nota já emitida na Paulistana. Emissão nova não usa `/v2/nfse`.

Homologação só com `FOCUS_NFE_ENV=homologacao` em runtime local/dev. Preview/production da Vercel (`NODE_ENV=production`) usa `api.focusnfe.com.br` — senão o token de produção falha em homologacao.focus.

Boleto/PIX/baixa: Asaas. **Nunca emitir NFS-e no Asaas** (`emitNfseImmediate` recusa). Documento `inv_*` vivo: só consulta.

Gerar Fatura: boleto Asaas + NF Focus + e-mail (CC financeiro/adm, BCC thiago) quando os dois existem.
Webhook Asaas RECEIVED/CONFIRMED marca fatura paga.

Tabela: `invoices` existente (integer PK). Colunas: `nfse_ref`, `nfse_codigo_verificacao`, `nfse_xml_path`, `nfse_provider`.
Não criar segunda tabela nem Edge Function — rotas oficiais `/api/invoices/:id/emit-nfse` com role.

Status persistido no vocabulário Torres (`AUTHORIZED` / `PROCESSING` / `ERROR` / `CANCELLED`).
`nfse_number` = ref Focus até existir número da nota. `isFinalNfNumber` ignora `torres-inv-*`.

Secrets: `FOCUS_API_TOKEN`, `FOCUS_PRESTADOR_IM`, `FOCUS_WEBHOOK_TOKEN` (webhook fail-closed).
`inv_*` cancelado (não vivo) pode emitir Focus na mesma fatura — `shouldEmitNfseViaFocus(..., asaasLiveDoc=false)` retorna true.
Relatório `/admin/relatorio-nf` precisa do `AdminLayout`; colunas Boleto Asaas × NF Focus.
Botão do topo: **Sincronizar Focus** (`POST /api/relatorio-nf/sync-focus`) consulta e retransmite NF em ERROR. Linha em erro: **Retransmitir**. Não usar `/api/asaas/reconcile-all` nessa tela.

Categoria: `service_orders.type` (`escolta` ou `vigilancia`). Sem tipo, a descrição; sem sinal de vigilância, escolta. Não há coluna na `invoices`.
Vigilância: `codigo_tributacao_nacional_iss` `110201`, `codigo_nbs` `118025000`, `codigo_tributacao_municipal_iss` `07870`.
Escolta: `110301`, `118023000`, `07897`.
Emissora São Paulo `3550308`. Simples ME/EPP: `codigo_opcao_simples_nacional` 3 e `percentual_aliquota_relativa_municipio` (`FOCUS_ALIQUOTA_SIMPLES` ou `ISS_ALIQUOTA` 5). `regime_especial_tributacao` 0. Tomador fora de SP: `codigo_municipio_prestacao` = IBGE do tomador. CCM do tomador só se for SP. Descrição = texto da fatura + ANEXO IV + Simples Nacional. ISS sem retenção (`tipo_retencao_iss` 1). `valor_cp` só se `invoices.valor_inss_retido` > 0. Fatura com os dois tipos de OS não emite. O painel Focus da empresa precisa ter o Ambiente Nacional de produção habilitado (`habilita_nfsen_producao`) e a NFS-e municipal desabilitada para emissão nova.
