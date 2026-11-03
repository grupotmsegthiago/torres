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
Vigilância: `codigo_tributacao_nacional_iss` `110201`, `codigo_nbs` `118025000`. Escolta: `110301`, `118023000`.
Os códigos Paulistana `07870` e `07897` ficam só em `codigo_paulistana`. A Sefin recusa cTribMun que não tenha exatamente 3 dígitos, então o payload não envia `codigo_tributacao_municipal_iss`.
Emissora São Paulo `3550308` só em `codigo_municipio_emissora`. Não enviar endereço do prestador (`codigo_municipio_prestador`, CEP, logradouro): com tpEmit=1 a Sefin recusa o bloco. O endereço da Torres fica no cadastro da Focus.
Simples ME/EPP: `codigo_opcao_simples_nacional` 3, `percentual_aliquota_relativa_municipio` (`FOCUS_ALIQUOTA_SIMPLES` ou `ISS_ALIQUOTA` 5) e `indicador_total_tributacao` 0 (não informa estimativa; Decreto 8.264/2014). `regime_especial_tributacao` 0. Tomador fora de SP: `codigo_municipio_prestacao` = IBGE do tomador. CCM do tomador só se for SP. ISS sem retenção (`tipo_retencao_iss` 1). `valor_cp` só se `invoices.valor_inss_retido` > 0.
Descrição da DPS (`descricao_servico`): `buildDefaultNfseDescription` em `shared/nfse-descricao.ts` — `Ref. escolta armada (período)` ou `Ref. vigilância (período)`, mais OS, SM, controle (`processo_omega` / `gtm_number`) e PO lido do texto. No final, a frase do Simples (`NF_SIMPLES_NACIONAL_TEXTO`). Se `valor_inss_retido` > 0, também a linha do Anexo IV. PIX, agência ou dados bancários já escritos na fatura vão para o mesmo rodapé. Não existe coluna de controle nem de pedido de compra. Máximo 2.000, mínimo 10; remove `<`, `>`, `&` e controles. O botão Emitir NFS-e abre o modal (`GET /api/invoices/:id/nfse-preview`) e o POST aceita `{ category, descricao_servico }`. Sem body, a automação continua: categoria inferida e descrição padrão. Categoria explícita libera fatura com OS misturadas. Não gravar esse texto em `invoices.description` (o boleto e o e-mail leem o período lá). O boleto continua com `buildServicoDiscriminacao`. Fatura com os dois tipos de OS não emite se ninguém escolher a categoria. O painel Focus da empresa precisa ter o Ambiente Nacional de produção habilitado (`habilita_nfsen_producao`) e a NFS-e municipal desabilitada para emissão nova.
