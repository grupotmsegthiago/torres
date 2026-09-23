# Changelog — Governança Torres

## 2026-09-23 — Pedágio: +20% na cobrança, exceto operação DHL

- OS nova com **Operação DHL** desmarcada cobra pedágio ao cliente com acréscimo de 20%. DHL marcado, ou OS antiga sem a escolha, segue repasse 1:1.
- O comprovante e o reembolso operacional não levam o acréscimo. Billing já congelado não é recalculado.

## 2026-09-22 — Relatório de NF: bruto e líquido na mesma coluna

- O deploy anterior falhou: `asaas.ts` importava `invoice-payment` que não estava no git. Arquivo e o rateio puro (`invoice-allocation`) entram no repositório para o build da Vercel passar.
- Bruto e líquido ficam na coluna Valor (sempre visíveis, sem rolagem extra). Excel continua com colunas separadas.

## 2026-09-22 — Relatório de NF: valor bruto e líquido

- O Relatório de NF passa a mostrar **Valor bruto (NF)** (`invoices.value`) e **Valor líquido** após ISS 5% + INSS 11%, com o mesmo motor do boleto (`netBoletoValue` / `boletoRetentionOpts`). Excel e tabela de notas pagas seguem a mesma regra.

## 2026-09-22 — NFS-e 192 Nimbus: tomador fora de SP

- A Paulistana recusou: município da prestação era São Paulo, mas o tomador é Serra/ES (serviço tributado fora).
- Correção: tomador com IBGE ≠ 3550308 usa natureza 2 e `servico.codigo_municipio` da cidade do tomador. CCM do tomador só entra se ele for de SP.

## 2026-09-22 — NFS-e 192 Nimbus: CCM do tomador só em São Paulo

- A Paulistana recusou a fatura 192: Nimbus é Serra/ES e o cadastro tinha inscrição municipal 4372204. Esse campo só vale para tomador estabelecido em São Paulo.
- Correção: a NFS-e Focus só envia CCM do tomador quando o IBGE é 3550308 (SP). Fora de SP o campo vai vazio.

## 2026-09-22 — NFS-e em erro: consultar e retransmitir

- O Relatório em NF com erro passa a **Retransmitir** (consulta Focus e, se continuar em ERROR, reemite na mesma fatura).
- Token inválido / homologação não sobrescreve o erro fiscal (ex.: e-mail do tomador).
- Abrir ou sincronizar o Relatório reprocessa até 8 NFs em erro. Cron continua a fila. Não gera segundo boleto nem segunda NF autorizada.

## 2026-09-22 — Focus: preview da Vercel não usa homologação com token de produção

- Sintoma: Relatório “Falha ao sincronizar NF / Access token inválido (host: homologacao.focusnfe.com.br)”.
- Causa: preview tem `VERCEL_ENV=preview` e `NODE_ENV=production`. O preview vinha primeiro e a consulta ia para homologação com o token de produção.
- Correção: `FOCUS_NFE_ENV=producao` e `NODE_ENV=production` (sem homolog explícito) usam `api.focusnfe.com.br`.

## 2026-09-22 — Relatório de NF: Sincronizar Focus, não Asaas

- O botão do topo deixa de chamar `/api/asaas/reconcile-all`.
- Passa a consultar a Focus em `/api/relatorio-nf/sync-focus` (o mesmo sync ao abrir a tela).
- Não reemite nota. Boleto continua no Asaas; o Relatório só atualiza o espelho da NFS-e.

## 2026-09-22 — NFS-e: e-mail do tomador só do campo financeiro

- A nota na Focus usa o primeiro e-mail de `clients.email_financeiro` (cadastro Torres). Não mistura operacional, contratual nem o e-mail genérico.
- O e-mail da fatura ao cliente vai para a lista do campo financeiro. CC interno permanece financeiro@ / adm@.

## 2026-09-22 — NFS-e Nimbus 192: e-mail do tomador > 75 caracteres

- Causa: a Paulistana recusou `EmailTomador` com 80 caracteres. O Torres juntava todos os e-mails financeiros da Nimbus numa string e cortava em 80.
- Correção: a NFS-e Focus envia só o primeiro e-mail válido (teto 75). Boleto Asaas da fatura 192 já estava emitido.

## 2026-09-22 — Ver NF: PDF DANFSe, nunca HTML da prefeitura

- Causa: `nfse_url` da fatura 191 era `notaprint.aspx` da prefeitura. Essa página só mostra “Aguarde... Carregando Nota Fiscal...” e depende de JavaScript — o proxy do Torres removia os scripts.
- Correção: `focusPdfUrl` ignora a URL da prefeitura; Ver NF baixa o DANFSe da Focus (S3, PDF de verdade) e grava esse endereço na invoice.

## 2026-09-22 — Ver NF Focus (DANFSe) + sync ao abrir Relatório + e-mail com 3 anexos

- **Ver NF** usa o PDF DANFSe da Focus (`url_danfse`), não a página HTML da prefeitura nem `fiscalInfo` do Asaas.
- Abrir o Relatório de NF dispara `POST /api/relatorio-nf/sync-focus`: consulta status ativo/cancelado na Focus e grava na `invoices`.
- NFS-e Asaas desligada de ponta a ponta (`asaasRequest` recusa `/invoices` fiscal). Boleto/PIX/baixa continuam no Asaas.
- E-mail ao cliente: To do cliente, CC financeiro@ e adm@, BCC thiago@; anexos boleto Asaas + NFS-e Focus + boletim de medição (espelho do snapshot).

## 2026-09-22 — Sync Focus: não usar homologação no ar

- `FOCUS_NFE_ENV` vazio/`[SENSITIVE]` em Vercel production consulta `api.focusnfe.com.br`, não `homologacao.focusnfe.com.br`.
- `/sync` de fatura já autorizada não apaga a NF se a consulta Focus falhar.

## 2026-09-22 — Faturar: boleto Asaas + NFS-e Focus + e-mail; Asaas não emite mais NF

- Gerar Fatura (Relatório de Faturamento) sempre cria boleto Asaas e NFS-e Focus na mesma operação.
- E-mail ao cliente só depois de boleto + NF: To do cliente, CC financeiro@ e adm@, BCC thiago@grupotmseg.com.br.
- Baixa: webhook Asaas (RECEIVED/CONFIRMED) marca fatura/OS pagas (`applyPaymentToInvoice` + MARK_PAID).
- Emissão de NFS-e no Asaas (`POST /invoices` fiscal) bloqueada. Relatório de NFs: boleto Asaas × NF Focus.

## 2026-09-22 — Relatório de NF: tela em branco + coluna Boleto Asaas

- Causa: o import de `AdminLayout` foi trocado por `classifyIssuedOrProcessing` e a página quebrava ao abrir.
- Colunas: **Boleto Asaas** (badge verde Emitido + link) e **NF (Focus)** (status, nº municipal, Ver NF / Emitir NF). Não exibe `inv_*`.
- `inv_*` Asaas já cancelado deixa de bloquear nova emissão Focus na mesma fatura.

## 2026-09-22 — Relatório de NF: coluna Asaas (boleto) × coluna NF Focus

- A tela `/admin/relatorio-nf` deixa de misturar boleto e NFS-e na mesma coluna de status.
- **Asaas**: badge verde “Emitido” com link do boleto (`bank_slip_url` / `invoice_url`).
- **NF (Focus)**: status próprio (Emitida / Emitindo / Erro / Corrigir / Cancelada), número municipal e botão verde “Ver NF”.

## 2026-09-22 — Boleto Asaas + NFS-e Focus em conjunto (ISS 5% / INSS 11%)

- Discriminação única: escolta armada, período, texto INSS Anexo IV e Simples Nacional (art. 30 Lei 10.833/2003) no boleto Asaas e na NFS-e Focus.
- Boleto líquido = bruto − INSS 11% − ISS 5% quando emite NF. NFS-e bruta na Focus.
- Número do tomador extraído do logradouro quando `address_number` está vazio.

## 2026-09-22 — NFS-e via Focus NFe (substitui emissão Asaas)

- Emissão, consulta e cancelamento de NFS-e passam ao satélite Focus NFe (São Paulo / Nota Fiscal Paulistana). Boleto/PIX continuam no Asaas.
- Tabela `invoices` estendida (`nfse_ref`, `nfse_codigo_verificacao`, `nfse_xml_path`, `nfse_provider`). Sem segunda tabela de notas.
- Backend Express (`/api/invoices/:id/emit-nfse`); sem Edge Function (auth/roles oficiais).
- Relatório: `docs/governanca/RELATORIO-ENTREGA-FOCUS-NFE-2026-09-22.md`.

## 2026-09-17 — Quinzena do boletim pela data de agendamento

- Filtro do Relatório de Faturamento, envio ao cliente e gerar fatura usam `service_orders.scheduled_date` (1–15 = 1ª quinzena; 16–último dia = 2ª).
- `escort_billings.data_missao` deixa de definir o ciclo (cancelada lançada depois não mistura quinzenas).
- Gate `enviar-aprovacao` e cobertura do boletim leem a data da OS, não a gravação do billing.

## 2026-09-17 — NFS-e: `municipalServiceId` string `"402"` (não 402.0)

- Causa: o Asaas recebia número (`402.0` no log). Natan: o JSON tem de ser `"municipalServiceId": "402"`.
- Correção: `asMunicipalServiceIdString` no motor único; omitir `municipalServiceCode`; log `[asaas] NFS-e wire JSON` com `typeof` e `JSON.stringify` do ID.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-MUNICIPAL-ID-STRING-2026-09-17.md`.

## 2026-09-14 — NFS-e Asaas: `_NFe002` código municipal ausente

- Causa: Torres no Portal Nacional enviava `municipalServiceId` 402; o portal ignora o código `07870` e devolve `_NFe002`.
- Correção (padrão TM SEG + FAQ Asaas): `municipalServiceCode` 07870, `municipalServiceName` `"07870 - …"`, `municipalServiceId: null`. Código da Torres permanece 07870 (não copiar 07930).
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-NFE002-CODIGO-MUNICIPAL-2026-09-14.md`.

## 2026-09-14 — NFS-e Asaas: emissão não conclui (PROCESSING eterno)

- Causa: `setTimeout` da NF isolada morre no Vercel; timeout 8s abortava `POST /invoices`; SYNCHRONIZED + “falha ao comunicar” / `_NFe002` ficava só em consulta; PROCESSING local escondia o botão Emitir.
- Correção: `await emitIsolatedNfse` na mesma isolate; timeout 45s em `/invoices`; `municipalServiceId` 402 padrão; `effectiveDate` BRT; authorize na mesma `inv_*` sem segundo POST; cron NF primeiro no bucket de 5 min.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-TRAVADA-PROCESSANDO-2026-09-14.md`.


## 2026-09-10 — NFS-e isolada (cobrança + worker, espelho TM SEG)

- Cobrança Asaas e NFS-e deixam de ir na mesma request. Fatura local fica `PROCESSING`; `POST /invoices` sai no kick `/api/nf/retry/:id` e no cron de 5 min.
- Sem segundo POST em NF já na prefeitura. Código municipal da Torres permanece `07870` (não o `07930` da TM).
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-ISOLADA-2026-09-10.md`.

## 2026-09-10 — Observação da NFS-e (modelo financeiro, ≤250)

- `observations` da NFS-e: CNAE, Escolta Armada, período, INSS Anexo IV, Simples Nacional, bruto/ISS/líquido. Discriminacao municipal permanece o texto CNAE oficial.
- SSOT: `buildNfseObservations` em `asaas-helpers.ts`. Teto `NF_OBSERVATIONS_MAX = 250`.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-OBSERVACOES-2026-09-10.md`.

## 2026-09-10 — Seguro do Mobi (apólice + contrato no cadastro da viatura)

- Só Fiat Mobi: anexar apólice e contrato de seguro no cadastro. Polo não exige.
- Arquivos no bucket privado `vehicle-docs` (caminho curto em `vehicles`); lista em vermelho se faltar.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-VTR-SEGURO-MOBI-2026-09-10.md`.

## 2026-09-10 — NFS-e: INSS 5,5% (50% de 11%) + ISS 2% retido

- Pedido do dono: reter na NF 50% dos 11% de INSS e 2% de ISS (`retainIss: true`).
- Motor único: `buildNfseInvoicePayload` / `netBoletoValue` em `asaas-helpers.ts`. Cadastro `inss_aliquota` continua a alíquota legal.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-RETENCOES-2026-09-10.md`.

## 2026-09-10 — NF e boleto Asaas (SYNCHRONIZED, PIX, e-mail)

- Faturas: `SYNCHRONIZED` sem nº municipal não é mais “NFS-e emitida”.
- Boleto: `notificationDisabled: false` + fallback da política de e-mail no customer (GET notifications do payment dá 404).
- PIX copia-e-cola também no tipo BOLETO; reconcile/`/sync` preenchem se faltar.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-ASAAS-NF-BOLETO-2026-09-10.md`.

## 2026-09-10 — Controle de Faturamento (Diretoria)

- KPI de cobertura por ciclo do cadastro (quinzenal 1–15/16–fim, mensal, diário). Projeção: OS + billing oficial + fatura.
- Gate no boletim: não envia se faltar OS do período ou se não estiver APROVADA (recusada fora).
- Relatório: `docs/governanca/RELATORIO-ENTREGA-CONTROLE-FATURAMENTO-2026-09-10.md`.

## 2026-09-09 — Grid Maps: loader único + chave de servidor na rota

- Causa: dois loaders do Google (Places sem `geometry`) e `/route` no servidor usando só `VITE_GOOGLE_MAPS_API_KEY` (restrita por site).
- Loader único `places+geometry` + `importLibrary`; Directions no servidor usa `googleMapsServerKey()` (mesma cascata do pedágio).
- Relatório: `docs/governanca/RELATORIO-ENTREGA-GRID-MAPS-LOADER-2026-09-09.md`.

## 2026-09-09 — Grid: origem/destino ao lado da placa + % da missão

- Card de atualizações e identidade da viatura passam a mostrar cliente + origem / destino da OS (campos já existentes na API).
- Barra no padrão TMSEG (Acompanhamento KM + % salvo + carro na trilha), cores Torres (âmbar → índigo → negro). Cálculo continua `getRouteProgress`.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-GRID-ORIGEM-DESTINO-PROGRESSO-2026-09-09.md`.

## 2026-09-09 — CCM do tomador no Sincronizar (não é nº da NFS-e)

- `07930` no cadastro Pacheco é CCM do tomador (`clients.inscricao_municipal`), não o número da NFS-e da fatura.
- Customer Asaas passa a receber CCM se o valor Torres for diferente (antes só preenchia se estivesse vazio).
- `/sync` e reconcile enviam CCM ao tomador; **não** reemitem NF já na prefeitura. Sem botão Reemitir em NF processando (esperado).
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-SYNC-PROCESSANDO-2026-09-09.md`.

## 2026-09-09 — NFS-e lacunas #171/#170 (erro visível, PUT, sem segundo POST)

- #171 (SYNCHRONIZED, sem RPS, Discriminacao antiga) = rejeição escondida: `ERROR` local + Resolver; cancel só no painel Asaas; quando ERROR, PUT na mesma `inv_*`.
- #170 (oficial + RPS 295) = só poll. Sem cancel, sem segundo POST.
- `/sync` não zera relógio em no-op; “Sincronizar c/ Asaas” solta `running` após 3 min.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-SYNC-PROCESSANDO-2026-09-09.md`.

## 2026-09-09 — NFS-e #171 Discriminacao antiga travada em SYNCHRONIZED

- FAT #171 ainda tinha `serviceDescription` = Escolta Armada/cliente/OS (payload que a SP já rejeitou na #170). Asaas `SYNCHRONIZED` sem RPS; **recusa cancelar** (“Processando emissão”).
- FAT #170 já está com Discriminacao oficial + RPS 295 — fila real da prefeitura.
- Catch-up: cancel+POST só se Discriminacao antiga e Asaas deixar cancelar; se recusar, espera 30 min. Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-SYNC-PROCESSANDO-2026-09-09.md`.

## 2026-09-09 — NFS-e processando: sync não reemite; relógio e rejeição oculta

- `SYNCHRONIZED` sem nº municipal continua só consulta (satélite Asaas). Rejeição escondida em `statusDescription` vira `ERROR` local.
- `/sync` não grava `updated_at` em no-op; `nfReconcileState.running` solta após 3 min se o isolate morrer.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-SYNC-PROCESSANDO-2026-09-09.md`.

## 2026-09-09 — NFS-e Discriminacao (Asaas / prefeitura SP)

- `serviceDescription` da NFS-e passa a ser sempre o texto CNAE oficial; nome do cliente e período ficam em `observations`, sem travessão tipográfico.
- Reprocesso de NF em ERROR reutiliza o `inv_*` existente (`PUT` + `authorize`) — não cria segunda nota na mesma cobrança.
- Catch-up automático só para rejeição de schema Discriminacao e cliente `emite_nf=true`. Processando (ex.: FAT #171) continua só consulta. Inscrição municipal da empresa no Asaas (MULTILOG) não é auto-retry.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-NFSE-DISCRIMINACAO-ASAAS-2026-09-09.md`.

## 2026-09-09 — ACL de linha do perfil comercial

- Perfil `comercial` só lê clientes com `responsavel_comercial_id = users.comercial_id` **ou** `created_by_user_id = users.id`.
- Sem vínculo e sem cadastro próprio: lista vazia (fail-closed). Recurso fora do escopo responde 404.
- Sem tabela `comerciais` e sem FK. Relatório: `docs/governanca/RELATORIO-ENTREGA-ACL-COMERCIAL-ESCOPO-2026-09-09.md`.

## 2026-09-09 — vínculo comercial + ingestão de comissões (TORRES → TM SEG)

- Cadastro de cliente passa a gravar `clients.responsavel_comercial_id` (UUID, sem FK/tabela `comerciais`).
- Lista de comerciais ativos via proxy autenticado `GET /api/comerciais` (token só no servidor).
- Emissão/baixa/cancelamento de fatura disparam POST fail-soft `FATURADO`/`PAGO`/`CANCELADO` para a TM SEG.
- Relatório: `docs/governanca/RELATORIO-ENTREGA-COMISSAO-INGEST-TMSEG-2026-09-09.md`.

## 2026-08-06 — security(users): close plain password removal (PR4C / Fase 4.9)

- PR4B confirmado pelo proprietário como aplicado no projeto Torres (`erjhxwbutjyylxdthuuz`) via migration versionada `20260805210000_drop_users_plain_password`.
- Pré-voo: backup físico de 2026-08-06 07:56:45 UTC disponível para restore; baseline 36 users / filled 0 / null 36 / Auth match 36 / dependências 0.
- Pós-DROP: `verify-drop-plain-password.sql` executado sem exceções; coluna ausente, demais colunas/Auth/RLS/policies/grants preservados.
- Sistema acessado normalmente após o APPLY, sem regressão observada, conforme confirmação humana; rollback não executado.
- PR4C é exclusivamente documental: sem código, banco, migration ou publicação.
- D13 (`users.plain_password`) → **ENCERRADA — COLUNA REMOVIDA E VERIFY APROVADO**.
- Branch: `cursor/pr4b-4-5b-homologacao-35ed` (PR existente #56; nenhum PR novo).

## 2026-08-06 — security(users): strengthen plain password dependency guards (4.5C)

- Fase **4.5C**: finalização/validação dos ajustes preventivos no PR #55 (sem merge, sem DROP, sem alteração de banco).
- Cobertura confirmada: `pg_depend` (relid+attnum), functions/procedures, rules/`pg_rewrite`, grants diagnóstico, fail-closed, sem CASCADE.
- Validação: testes de contrato 104/104; `git diff --check` OK após correção de trailing whitespace no relatório 4.5B.
- Typecheck: ~436 erros pré-existentes no repo; **0** nos arquivos desta PR.
- Build: no agent falha sem `VITE_SUPABASE_*`; com placeholders → **build OK** (sem erros novos desta PR).
- D13 / status: **PR4B PREPARADO — DROP AINDA NÃO APLICADO** (baseline live depende de SQL Editor/MCP autenticado).
- Branch: `security/prepare-drop-plain-password-column` (PR #55)

## 2026-08-06 — security(users): continue PR4B / 4.5B homologation package

- Continuidade da fase **4.5B**: script de homologação live PASS/FAIL (`scripts/security/homologate-drop-plain-password-baseline.sql`) alinhado aos guards da migration.
- Runbook atualizado com matriz 4.5A/4.5B (estática OK; baseline DB pendente; DROP não aplicado).
- Testes de contrato ampliados; **sem** execução de DROP; **sem** alteração de banco/produção.
- D13 permanece: **PR4B / 4.5B HOMOLOGAÇÃO ESTÁTICA OK — BASELINE DB PENDENTE — DROP AINDA NÃO APLICADO**.
- Branch: `cursor/pr4b-4-5b-homologacao-35ed` (continuidade da PR #55)

## 2026-08-05 — security(users): strengthen plain password dependency guards

- PR4B / 4.5B: cobertura preventiva reforçada na migration de DROP (ainda **não** aplicada).
- Diagnóstico 4.5A: zero dependências reais (`pg_depend`=0); lacuna era de governança, não bloqueio técnico.
- Guards: `pg_depend` (deptype `n` + attnum), functions+procedures, rules/`pg_rewrite`; grants só diagnóstico.
- PostgreSQL já era fail-closed sem CASCADE; baseline/verify/testes alinhados ao catálogo canônico.
- Branch: `security/prepare-drop-plain-password-column` (PR #55)

## 2026-08-05 — security(users): prepare plain password column removal

- PR4B: artefatos versionados para DROP de `public.users.plain_password` — **não aplicados**.
- Baseline `scripts/security/baseline-drop-plain-password.sql`, verify `verify-drop-plain-password.sql`, migration `20260805210000_drop_users_plain_password`, rollback estrutural (coluna NULL sem valores), runbook `RUNBOOK-DROP-PLAIN-PASSWORD.md`.
- Fail-closed: total=36, filled=0, null=total, coluna existe, deps=0; sem CASCADE; sem alteração de Auth/RLS.
- PR4A já desacoplou código/tipos; coluna física ainda presente; backup obrigatório antes da aplicação; PR4C documentará o pós-DROP.
- D13 → **PR4B PREPARADO — DROP AINDA NÃO APLICADO**.
- Branch: `security/prepare-drop-plain-password-column`

## 2026-08-05 — security(users): remove plain password from application schema

- PR4A: remove `plainPassword` de `shared/schema.ts` e tipos derivados (`User` / `InsertUser`).
- `sanitizeUserWrite` / `toSafeUser` / `USER_SAFE_SELECT` preservados como bloqueios.
- Zero alteração no banco; coluna física permanece; sem DROP; sem migration nova.
- D13 → **PR4A CONCLUÍDO — CÓDIGO E TIPOS DESACOPLADOS; COLUNA FÍSICA AINDA PRESENTE — PR4B PENDENTE**.
- Branch: `security/remove-plain-password-from-code`

## 2026-08-05 — docs(security): record plain password cleanup incident and outcome

- PR3C: homologação pós-limpeza e documentação transparente do evento ad-hoc.
- Estado: total=36, filled=0, null=36, Auth match=36/36, verify PASS, coluna ainda existe.
- Migration versionada `20260805190500_null_legacy_plain_password` **não** consta no histórico Supabase; **não** se inseriu registro falso.
- Incidente: `docs/security/INCIDENT-PLAIN-PASSWORD-CLEANUP-2026-08-05.md`.
- D13 → **VALORES LEGADOS LIMPOS — HOMOLOGAÇÃO PÓS-LIMPEZA CONCLUÍDA; COLUNA AINDA PRESENTE — PR4 PENDENTE**.
- Branch: `docs/plain-password-cleanup-applied`

## 2026-08-05 — security(users): prepare legacy plain password cleanup

- PR3A: baseline somente leitura, verify pós-limpeza, migration versionada (não aplicada), rollback documental e runbook.
- Artefatos: `scripts/security/baseline-plain-password-cleanup.sql`, `verify-plain-password-cleanup.sql`, `supabase/migrations/20260805190500_null_legacy_plain_password.sql`, `docs/security/RUNBOOK-PLAIN-PASSWORD-CLEANUP.md`.
- Sem UPDATE executado naquele PR; valores legados ainda 36/36 à época; sem hash de senha; sem rollback com senhas.
- D13 (à época) → **PR3A PREPARADO — LIMPEZA AINDA NÃO APLICADA** (depois: limpeza ad-hoc + PR3C).
- Branch: `security/prepare-plain-password-cleanup`

## 2026-08-05 — security(users): stop storing plain text passwords

- Writers de produção não gravam mais `plain_password` (create, reset, change-password, register-by-cpf, auto-login de funcionário).
- `sanitizeUserWrite` / `UserWriteInput` bloqueiam o campo no storage.
- `generateTempPassword` centraliza senha one-shot (sem `torres@123`).
- Create/reset continuam retornando `tempPassword`/`newPassword` só na resposta imediata.
- D13 → **WRITERS INTERROMPIDOS — VALORES LEGADOS AINDA PRESENTES** (PR3 limpeza, PR4 DROP).
- Branch: `security/stop-plain-password-writers`

## 2026-08-05 — security(users): block plain password exposure in API and UI

- `toSafeUser` virou allowlist explícita (`server/lib/safe-user.ts`); sem spread do user.
- `/api/auth/me`, `/api/users`, perfil e listagens não retornam senha (nenhuma role).
- Create/reset/`register-by-cpf` mantêm `tempPassword`/`newPassword` **one-shot** na resposta imediata.
- UI admin (`users.tsx` + modal de acesso em `employees.tsx`): remove senha persistida e fallback `torres@123`.
- Auth cache e leituras `storage` de users usam `USER_SAFE_SELECT` (sem `plain_password`).
- RLS já protege PostgREST; este PR protege API/UI; writers e coluna ainda existem.
- D13 → **MITIGADA NA API/UI — DEPENDÊNCIA E COLUNA AINDA PENDENTES** (PR2 writers, PR3 limpeza, PR4 DROP).
- Branch: `security/block-plain-password-exposure`

## 2026-08-05 — security(users): RLS applied and homologated on shared Supabase

- Migration `harden_users_rls` aplicada no projeto TORRES (~17:36 UTC).
- Verify `scripts/security/verify-users-rls.sql` OK; policies finais: só `users_select_own`.
- Smoke: anon negado; funcionário REST só própria linha e sem `plain_password`; admin `/api/auth/me` e `/api/users` OK; funcionário `/api/users` 403.
- C3 → **CORRIGIDO E HOMOLOGADO**; D10 encerrada; **D13 permanece aberta**.
- Backup nativo usado como rede: 2026-08-05 07:59:48 UTC.
- Sem publish Vercel; `main` intacta.

## 2026-08-05 — security(users): restrict authenticated select to safe columns

- Corrige modelo de grants: sem `GRANT SELECT ON TABLE`; authenticated possui SELECT somente nas colunas seguras + RLS own.
- `plain_password` excluída da lista concedida (forward, rollback e verify).
- Branch: `security/harden-users-rls` (PR #48)

## 2026-08-05 — security(users): harden RLS (migration pronta)

- Migration versionada `supabase/migrations/20260805164000_harden_users_rls.sql`.
- Remove policies `USING (true)` e admin JWT; authenticated só `users_select_own`.
- `REVOKE ALL` de anon; authenticated sem INSERT/UPDATE/DELETE; SELECT somente nas colunas seguras (sem `plain_password`).
- Verify: `scripts/security/verify-users-rls.sql`; runbook: `docs/security/RUNBOOK-USERS-RLS.md`.
- C3 → **MITIGADO PENDENTE DE HOMOLOGAÇÃO** (DB compartilhado Preview/Prod — aplicação não executada neste PR).
- Dívida **D13** registrada: `plain_password` preenchida; remoção em plano separado.
- Branch: `security/harden-users-rls`

## 2026-08-05 — PR1: desativação Banco Inter (fail-closed)

- Integração Inter **desativada por padrão** via `INTER_INTEGRATION_ENABLED` (`server/lib/inter-integration.ts`).
- Webhook `POST /api/inter/webhook/cobranca` → **410** sem mutações quando desativado; **503** se flag on sem config.
- Escritas Inter (cobrança, PIX, boleto, webhook setup) e crons reconcile bloqueados.
- UI: gateway Inter removido de Faturas; Contas a Pagar sem pagamento Inter.
- Histórico / tabelas `inter_*` / colunas invoice / APIs `/api/financeiro/*` preservados.
- C1 em `05-SEGURANCA.md` marcado **MITIGADO**; limpeza definitiva = PR2–PR4.
- Branch: `security/disable-banco-inter`

## 2026-08-05 — Emenda: reutilização obrigatória (P13 / D11 / G17)

- Incluído princípio **P13** e regra de desenvolvimento **D11**: pesquisar o existente antes de implementar; proibido duplicar lógica, segundo motor, nova tabela/API/componente sem evidência de inviabilidade.
- Gate **G17** no checklist de aprovação.
- Atualizados `README`, templates `10`/`11` e regra Cursor `governanca-torres.mdc` (item 0).

## 2026-08-05 — Fase 1.0 — Implantação documental

- Criada pasta normativa `docs/governanca/` com Arquitetura Oficial, Framework, SSOT, regras críticas, segurança, testes, deploy, RACI, dívidas e templates.
- Criada regra Cursor alwaysApply `.cursor/rules/governanca-torres.mdc`.
- Apontadores de precedência adicionados em `docs/ARCHITECTURE.md`, `AGENT_RULES.md`, `RULES.md` (conteúdo técnico antigo preservado).
- Branch: `docs/framework-governanca-torres`
- Ponto de restauração: tag `safety/pre-framework-governanca-6ccdfac0` (commit `6ccdfac0`)
- **Sem** alteração de comportamento de runtime, APIs, telas, banco ou produção.
- Riscos da auditoria: apenas documentados — **não corrigidos**.
