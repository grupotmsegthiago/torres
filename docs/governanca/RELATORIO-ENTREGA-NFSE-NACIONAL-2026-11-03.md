## Relatório de Entrega — NFS-e Ambiente Nacional (Focus)

**Data:** 3 de novembro de 2026, horário de Brasília
**Branch:** `cursor/nfse-nacional-focus-b534`
**Ambiente validado:** local, só na regra do payload. Nenhuma nota foi emitida na Focus.
**Publicou?** Não

### Reutilização (D11 / P13)
- Busca realizada: `emit-nfse`, `buildFocusNfsePayload`, `/v2/nfse`, `nfseUpdatesFromFocusObject`, `ISS_RETAIN`
- Existente aproveitado: o mesmo helper, a mesma rota `POST /api/invoices/:id/emit-nfse`, a mesma gravação em `invoices`, o mesmo webhook Focus
- Algo novo criado? Não. O payload municipal foi trocado pelo JSON plano da DPS. Não há segundo emissor.

### O que era (diagnóstico)
- Emissão: `POST https://api.focusnfe.com.br/v2/nfse?ref=torres-inv-{id}` (homologação: `homologacao.focusnfe.com.br`)
- Consulta: `GET /v2/nfse/{ref}`
- Cancelamento: `DELETE /v2/nfse/{ref}` com `justificativa`
- Payload aninhado da Paulistana: `prestador`, `tomador.endereco`, `servico` com `item_lista_servico` `07870`, `codigo_tributario_municipio` `07870`, `aliquota` 5, `iss_retido` false (`ISS_RETAIN`), `valor_iss`, `valor_inss`, `optante_simples_nacional` true, `regime_especial_tributacao` `6` quando optante, `natureza_operacao` 1 em SP e 2 fora
- Retorno assíncrono: a Focus devolve processamento; o Torres grava na hora e a consulta/webhook completam o número. Colunas: `nfse_status`, `nfse_provider` (`focus`), `nfse_ref`, `nfse_number`, `nfse_url` (DANFSe), `nfse_xml_path`, `nfse_codigo_verificacao`, `nfse_error_message`

### O que foi alterado
- Emissão nova: `POST /v2/nfsen?ref=...`
- Consulta e cancelamento: `/v2/nfsen/{ref}`. Se a Focus responder 404, tenta `/v2/nfse/{ref}` para nota já emitida na Paulistana
- Payload plano da DPS, nomes oficiais da Focus (não o objeto aninhado da prefeitura):
  - `data_emissao` ISO com fuso `-03:00`, `data_competencia` AAAA-MM-DD em Brasília
  - `codigo_municipio_emissora` e `codigo_municipio_prestador`: `3550308`
  - `codigo_opcao_simples_nacional`: 3 (ME/EPP) ou 1 se o optante estiver desligado
  - `regime_especial_tributacao`: 0
  - prestador: `cnpj_prestador`, `inscricao_municipal_prestador`
  - tomador: `cnpj_tomador` ou `cpf_tomador`, `razao_social_tomador`, `email_tomador`, endereço com `codigo_municipio_tomador`
  - serviço: `codigo_municipio_prestacao`, `codigo_tributacao_nacional_iss` `110201`, `descricao_servico`, `valor_servico`, `tributacao_iss` 1, `tipo_retencao_iss` 1 (ISS sem retenção). INSS que já ia na nota vai em `valor_cp`
- A resposta continua em `nfseUpdatesFromFocusObject`: `status`, `numero`, `codigo_verificacao`, `url_danfse`, `caminho_xml_nota_fiscal`

### O que NÃO foi alterado
- Valor da fatura, boleto Asaas, regra dos 70%, boletim, balanço
- `ISS_RETAIN` continua falso. A alíquota de 5% não é mais enviada: no Ambiente Nacional o município informa a alíquota
- Colunas de `invoices` e telas de faturas / relatório

### Arquivos modificados
- `server/lib/focus-nfe-helpers.ts`, `server/lib/focus-nfe-helpers.test.ts`, `server/lib/focus-nfe.ts`
- `docs/governanca/03-FONTES-DA-VERDADE.md`, `docs/governanca/CHANGELOG-GOVERNANCA.md`
- `.agents/memory/focus-nfe-satelite.md`

### Banco / migrations
- Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|---|---|
| `npx tsx --test server/lib/focus-nfe-helpers.test.ts` | 24 pass |

### Resultados (negócio)
A próxima NFS-e da Torres sai no Ambiente Nacional da Focus, com o código 110201 da escolta, sem criar outra nota em paralelo e sem mudar o que a tela já lê.

### Regressões verificadas
- Nota Asaas `inv_*` viva continua fora da Focus
- DANFSe continua preferido à página HTML da prefeitura
- Tomador fora de São Paulo não leva CCM paulistana; a prestação usa o IBGE dele

### Segurança
- Secrets no diff? Não
- Webhook/auth/RLS tocados? Não. O webhook Focus segue exigindo `FOCUS_WEBHOOK_TOKEN`

### Backup / ponto de restauração
- Rollback: voltar a emissão para `POST /v2/nfse` e o payload aninhado. Notas nacionais já autorizadas não voltam com esse rollback; o cancelamento delas precisa do `/v2/nfsen`.

### Pendências
- No painel da Focus, a empresa precisa estar no Ambiente Nacional de produção (`habilita_nfsen_producao`) e com a NFS-e municipal desligada. O código não liga essa flag.
- `serie_dps` e `numero_dps` não são enviados. O exemplo oficial da Focus também não envia; o catálogo de campos marca os dois como obrigatórios. Se a primeira nota real recusar por falta deles, o próximo passo é numerar a DPS sem reutilizar o número numa nova tentativa.
- Nenhuma emissão real foi feita neste ambiente.

### Resumo executivo
1. A rota da fatura continua a mesma. O satélite Focus passa a emitir em `/v2/nfsen`.
2. O JSON é o da DPS nacional, com código 110201 e Simples ME/EPP.
3. A tela lê as mesmas colunas. A Paulistana antiga só entra se o nacional não achar a nota.
