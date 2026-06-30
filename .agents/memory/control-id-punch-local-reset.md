---
name: Reset local-only de batidas Control iD
description: Como apagar/reinserir batidas de ponto (control_id_punches) para bater com o cartão de ponto sem corromper o RHID Cloud
---

# Reset local-only de batidas de ponto (control_id_punches)

Cenário: o dono manda os PDFs "Cartão de Ponto" do Control iD e pede para o ERP
bater EXATAMENTE com eles (limpar o período de N funcionários e reinserir as batidas
do PDF). O cartão é a verdade corrigida; o banco costuma ter batidas BRUTAS do AFD
que o cartão já não mostra (correções manuais "(I)" do dono no RHID).

## Regra de ouro: NÃO use as funções de sync
- `deleteLocalPunch` enfileira DELETE no RHID Cloud; `createManualPunch` enfileira
  CREATE no RHID. Como o cartão JÁ veio do RHID, usar essas funções corromperia a
  nuvem (apagaria originais / criaria duplicatas).
- **Faça delete + insert DIRETO via `supabaseAdmin`.** As linhas reinseridas levam
  `external_id=null, is_manual=true, source="folha_pdf_import"`. Não entram na fila
  de sync ⇒ o cron `processRhidSyncQueue` NÃO as empurra pro RHID.

**Why:** todas as batidas existentes do período tinham `external_id` (vieram do AFD);
qualquer caminho que sincronize com a nuvem propaga a destruição pro RHID.

## ⚠️ O reset NÃO é durável sozinho — a reconciliação diária o desfaz
- O sync ControlID 2x/dia (`syncAllDevices`, 00:00/12:00) é incremental
  (`since = max(punch_at) do device − 6h ≈ agora`) e NÃO toca histórico. Sozinho,
  o reset seria durável. MAS:
- **Existe um cron SEPARADO de reconciliação às 00:00 BRT** (`server/cron.ts`,
  `runDailyReconciliation`) que roda `syncDevice(device, { fullBackfill:true })` —
  FULL BACKFILL automático DIÁRIO — e também EXPORTA p/ o RHID (`createRhidPunch`).
  Defaults `doImport=true`/`doExport=true`.
- Efeito: o full backfill re-puxa o AFD inteiro. O dedup é por `(employee, minuto)`,
  então NÃO duplica batidas em minutos que já existem, mas REINSERE as batidas
  extras que você apagou (estão em minutos distintos no AFD). Ou seja, **as
  duplicatas voltam na próxima meia-noite** e o export pode até criar batidas no RHID.
- **Reset durável exige** uma das opções (decisão do dono): (a) trava de "período
  fechado por folha" no import pra não reimportar esse intervalo; (b) desligar/rodar
  a reconciliação com `doImport:false,doExport:false` até fechar a folha; (c) limpar
  as extras no próprio AFD/RHID (lado do dono). Sem isso, o reset é só temporário.

## Convenções de gravação
- `punch_at` é gravado com offset BRT explícito: `${YYYY-MM-DD}T${HH:MM}:00-03:00`
  (NÃO UTC, apesar do comentário no schema dizer "UTC"). Confirme contra um cartão
  conhecido antes (erro de 3h destrói tudo).
- `control_id_punches.device_id` e `control_id_user_id` são NOT NULL ⇒ pegue do
  `control_id_users_map` (ativo). Funcionário pode ter 2+ mappings (uid duplicado):
  escolha o uid que as batidas existentes mais usam.

## Espelho ignora `direction`
- `buildEspelhoPonto` (server/lib/espelho-ponto.ts) pareia por ordem cronológica de
  `punch_at` (guloso, teto 18h) — NÃO usa o campo `direction` salvo. Logo, ao
  parsear o PDF, atribua direção por ordem (par=entrada, ímpar=saída); é robusto a
  lacunas de coluna e todos os dias do cartão têm nº par de batidas.

## Parsing do "Cartão de Ponto" (pdftotext -layout)
- Cabeçalho da tabela varia: alguns relatórios têm coluna PREVISTO, outros não;
  alguns têm 3 pares de colunas (ENT.1..SAÍ.3), outros 4. Detecte o header por
  "ENT. 1" + "NORMAIS" e leia só as colunas até NORMAIS.
- Tokens de batida = `HH:MM (I|C)` ((I)=incluído manual, (C)=coletor). PREVISTO
  (`HH:MM-HH:MM`) e totais (`HH:MM` sem marcador) NÃO casam esse padrão ⇒ excluídos
  de graça. "Folga" na linha = dia sem batida.
