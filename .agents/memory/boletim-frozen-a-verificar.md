---
name: Boletim A_VERIFICAR congelado nasce zerado
description: Por que boletins de medição aparecem zerados/subfaturados (KM=0, hora extra=0) mesmo com dados reais existindo
---

O CRON de billing cria o `escort_billings` da OS **cedo** (às vezes antes da missão terminar) e, como `A_VERIFICAR` está dentro de `FROZEN_STATUSES` (`server/cron.ts`), ele **nunca mais recalcula** esse boletim. Resultado: boletins criados antes do fim da missão ficam com `km=0`, `horas=0`, `fat_hora_extra=0` (só acionamento) e assim permanecem. Em jun/2026 havia ~147 boletins `A_VERIFICAR` congelados nessa situação (log do CRON: "N A_VERIFICAR congeladas").

**Por que:** congelar `A_VERIFICAR` é proposital (§8.6 INTOCÁVEL) — evita o CRON atropelar conferência manual. O preço é que boletim criado cedo nasce zerado.

**Como corrigir 1 boletim:** botão **"Calcular"** na tela Boletim de Medição → `POST /api/boletim-medicao/calcular/:osId`. Esse endpoint usa `getMissionPhotosByOS` (por OS, sem corte) + `calcularEscolta` com timestamps reais, **deleta** o billing `A_VERIFICAR`/`REJEITADA` e reinsere correto. Aprovar também recalcula. NUNCA é o CRON que conserta.

**Pegadinha de prévia (não confundir com o billing):** a prévia da lista/modal lê do billing congelado. Antes de clicar Calcular, os inputs manuais (`horaExtraValue`/`kmExtraValue`) são pré-preenchidos com `String(b.fat_*||0)`="0" e `liveNum` trata "0" como override real → o **total da prévia** segue só com acionamento mesmo mostrando "54h06 extras"/KM. Some só depois do Calcular gravar.

**Como aplicar:** quando o dono reclamar de boletim zerado/subfaturado, NÃO é bug de cálculo — é billing congelado cedo. Recalcular (Calcular/Aprovar). Recálculo em lote dos congelados mexe em faturamento em massa → exige autorização do dono + inspeção §9 antes.
