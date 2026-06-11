---
name: Boletim A_VERIFICAR congelado nasce zerado
description: Por que boletins de medição aparecem zerados/subfaturados (KM=0, hora extra=0) mesmo com dados reais existindo
---

O CRON de billing cria o `escort_billings` da OS **cedo** (às vezes antes da missão terminar) e, como `A_VERIFICAR` está dentro de `FROZEN_STATUSES` (`server/cron.ts`), ele **nunca mais recalcula** esse boletim. Resultado: boletins criados antes do fim da missão ficam com `km=0`, `horas=0`, `fat_hora_extra=0` (só acionamento) e assim permanecem. Em jun/2026 havia ~147 boletins `A_VERIFICAR` congelados nessa situação (log do CRON: "N A_VERIFICAR congeladas").

**Por que:** congelar `A_VERIFICAR` é proposital (§8.6 INTOCÁVEL) — evita o CRON atropelar conferência manual. O preço é que boletim criado cedo nasce zerado.

**Como corrigir 1 boletim:** botão **"Calcular"** na tela Boletim de Medição → `POST /api/boletim-medicao/calcular/:osId`. Esse endpoint usa `getMissionPhotosByOS` (por OS, sem corte) + `calcularEscolta` com timestamps reais, **deleta** o billing `A_VERIFICAR`/`REJEITADA` e reinsere correto. Aprovar também recalcula. NUNCA é o CRON que conserta.

**Pegadinha de prévia (não confundir com o billing):** a prévia da lista/modal lê do billing congelado. Antes de clicar Calcular, os inputs manuais (`horaExtraValue`/`kmExtraValue`) são pré-preenchidos com `String(b.fat_*||0)`="0" e `liveNum` trata "0" como override real → o **total da prévia** segue só com acionamento mesmo mostrando "54h06 extras"/KM. Some só depois do Calcular gravar.

**Auto-cálculo ao abrir o modal (jun/2026):** o `OsDetailModal` dispara `/calcular` sozinho UMA vez por OS/sessão (guard `Set` de nível de módulo) quando o billing tem a assinatura de "nunca calculado" — `km_total===0 && horas===0 && fat_hora_extra===0 && fat_km===0` (AND de TODOS, não OR) — e há dados reais (`os.km_final>0` OU `missionStartedAt && completedDate`). **Por que AND de todos:** OR (km=0 OU horas=0) dá falso-positivo e re-dispara/clobbera billing já calculado ou com ajuste manual; só a assinatura todos-zerados = nasceu congelado e nunca tocado. Após o calc gravar (km/horas>0), a condição fica falsa → não re-dispara. Em jun/2026, 39 de 149 A_VERIFICAR tinham essa assinatura.

**Pegadinha: pedágio no fat_total mas não na coluna (lista ≠ modal):** o `fat_total` do `calcularEscolta` SOMA `despesas_pedagio + despesas_outras + receitas_os` (pedágio repassado vem de `mission_costs`, NÃO de campo `fat_*`). O insert do `/calcular` gravava `fat_total` cheio mas NÃO persistia as colunas `despesas_pedagio`/`despesas_combustivel`/`despesas_outras` (ficavam 0) — outros caminhos (os-concluidas recalc, so-patch, /revisar) persistem. Efeito: a lista mostra `fat_total` (certo, com pedágio) e o modal recompõe pelas colunas e dá MENOR, com "Pedágio R$ 0,00". **Regra:** todo insert/update de `escort_billings` que grava `fat_total` DEVE persistir junto `despesas_pedagio/combustivel/outras` (e `receitas_os`), senão detalhamento ≠ total. Correção de linha já gravada = UPDATE só das 3 colunas de despesa (fat_total não muda).

**Como aplicar:** quando o dono reclamar de boletim zerado/subfaturado, NÃO é bug de cálculo — é billing congelado cedo. O auto-cálculo cobre os "nunca calculados" ao abrir; senão Calcular/Aprovar manual. Recálculo em lote dos congelados mexe em faturamento em massa → exige autorização do dono + inspeção §9 antes.
