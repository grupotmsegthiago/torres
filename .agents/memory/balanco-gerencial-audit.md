---
name: Auditoria do Balanço Gerencial
description: Onde vivem e como reconciliar os números do painel "Balanço Gerencial" (eficiência km/L, RH, Estrutura, Operacional).
---

## Eficiência km/L é calculada no FRONTEND, não no backend
O `/api/financial/dashboard` (server/routes/escort.ts) NÃO devolve eficiência — ela é
computada num `useMemo` em `client/src/pages/admin/balanco-gerencial.tsx` a partir de
`vehicle_fueling` (km entre abastecimentos consecutivos por viatura ÷ litros do
abastecimento corrente).

**Por que importa:** é sensível a outliers de `vehicle_fueling.liters`. Um único erro de
digitação (ex.: 42400 no lugar de 42,40) derruba a média de TODA a frota.
**Travas de sanidade no loop:** descarta `kmGap<=0 || kmGap>3000` (hodômetro/troca de
viatura) e `liters<=0 || liters>1000` (erro de digitação). Não há validação equivalente
no backend de `vehicle_fueling` — dado corrompido pode contaminar outros relatórios.

## Como auditar os 3 buckets de custo (reconciliação confiável)
Sempre via script `.local/test_*.mts` com `supabaseAdmin` (executeSql do agente aponta pro
Neon, não pro Supabase — não confiar).
- **Estrutura (rateado):** `Σ fixed_costs.monthly_value WHERE active`. Bate 1:1 com o card.
- **RH·Folha Real:** `Σ buildFolhaStats(emp.id, "YYYY-MM", { multiplicadorHE: 1.6 }).custoTotalEstimado`
  pros `employees` ativos (mesma fonte do Ponto Eletrônico / control-id.ts; sem provisões —
  é fluxo de caixa). `import { buildFolhaStats } from "server/control-id"`. Endpoint:
  `GET /api/fixed-costs/rh-summary` em server/routes/fixed-costs.ts.
- **Custos Fixos+RH = Estrutura + RH** = base da meta (`calcMeta`).
- **Operacional:** `pag (VRP) + (fueling + mission_cost + maintenance)` de
  `financial_transactions` (EXPENSE) no período. RH/Estrutura/`payroll`/`fixed`/`other` são
  subtraídos de `despReaisOperacional` pra não duplicar.
- **costDays:** custos fixos/RH são rateados por mês comercial (30 dias), não pelo calendário
  (`Math.min(daysInPeriod, FIXED[period])`).

## Relatório de OS vs Balanço Gerencial — faturamento UNIFICADO (devem BATER)
Decisão do dono: os dois painéis devem mostrar o MESMO total de faturamento. Ambos derivam
o faturamento da MESMA fonte ao vivo `/api/operational-grid` (campo `liveCost.faturamento_live`),
não do billing congelado.
**Por que:** o billing congelado (`escort_billings.fat_total`) fica defasado em correções de
hora-extra/KM (regra INTOCÁVEL nº5); o dono quer o valor ao vivo, igual nos dois painéis.
**Regras da unificação (não reverter sem ordem):**
- Faturamento = `liveCost.faturamento_live ?? faturamento` — SEMPRE o recálculo ao vivo
  (`faturamento_live` ignora congelamento; é o `frozenFat` fresco do operational-grid antes do
  swap `useFrozen`).
- Exclusão: SÓ **recusada** fica de fora (o grid já devolve `liveCost=null` em recusada → contribui R$ 0).
  **Cancelada ENTRA** no total (preserva acionamento + extras; `calcularFaturamentoLive` soma
  `valor_acionamento` automaticamente).
- Período: filtro do grid usa `scheduledDate || missionStartedAt || completedDate` (range `from`/`to`).
- O Balanço reconstrói `missions` a partir do grid (fat=faturamento_live, km=km_total, agente/plate do grid);
  `pagamento`/`despesas` por OS continuam vindo do billing via `Map(service_order_id)`. Pipeline de
  CUSTO (expenses TX / RH / fixos) permanece intacto — só a RECEITA foi unificada.
- **Risco conhecido (lado custo, não receita):** OS no grid sem billing entra com pag=0/desp=0.
  Mitigado pelo invariante `escort_billings` 1:1 com OS (UNIQUE `uniq_eb_so_id` + cron) — todo OS tem billing.
- **Verificado (Maio/2026, endpoint real):** Relatório == Balanço == R$ 205.651,98 (diff 0); recusada n=21 = R$ 0.
  Teste: `.local/test_inspect_unif_balanco_relatorio.mts` (minta token admin via Supabase generateLink+verifyOtp,
  bate no grid real — NÃO usa executeSql/Neon).

## CUIDADO: faturamento AO VIVO NÃO é sempre "o mais correto" — ele estoura com km_total ruim
Os dois painéis (Relatório de OS e Balanço) usam `faturamento_live`, que recomputa KM excedente e HE
a cada request a partir de `escort_billings.km_total` (vindo da leitura de hodômetro/foto km_final).
Se esse `km_total` estiver errado, o ao vivo **SUPERfatura** brutalmente — e o congelado pode ser o correto.
**Caso real (05/05/2026, TOR-0141, Suzano-SP→Volta Redonda-RJ, rota real ~800 km):** `km_total = 15.822 km`
(≈20× o real, erro de hodômetro/digitação) → `fat_km_extra = (15822−100)×R$4,80 = R$ 75.465,60` →
`faturamento_live = R$ 76.344,33` vs congelado correto `R$ 1.858,23`. Essa única OS era 96% dos
"R$ 79.733,23" de um relatório DIÁRIO que o dono questionou. HE dela era só R$ 364 (não era HE, era KM).
**Lição:** quando um total ao vivo parecer absurdo, abrir a composição do liveCost (fat_km_extra, fat_hora_extra)
e checar `km_total`/`horas_excedentes` da(s) OS dominante(s) ANTES de assumir HE multi-dia. Origem do dado
ruim = leitura de km_final (foto/hodômetro). Vale guardar o live contra km absurdo (ex.: cap por km GPS/rota).
Conecta com o follow-up de auditoria de OSs divergentes: o problema central é qualidade do dado (km e timestamps), não só HE.

## Painel mensal: faturamento AO VIVO pode ser MUITO maior que o billing congelado (risco de subfaturamento)
O filtro MENSAL do Balanço é por mês-calendário (dia 01 → último dia), correto.
O total exibido usa `faturamento_live` (recálculo ao vivo de HE por timestamps reais, INTOCÁVEL nº5).
Para missões multi-dia "concluída", o billing congelado (`escort_billings.fat_total`) costuma estar
**SUBfaturado** em HE — o ao vivo pode ser dezenas de milhares de R$ MAIOR (ex.: Maio/2026 ao vivo
≈ R$ 283,9k vs congelado ≈ R$ 205,7k; um único OS multi-dia tipo TOR-0219 saltou de ~R$ 566 congelado
pra ~R$ 11,2k ao vivo).
**Por que importa:** o `gerar-fatura` (server/asaas.ts) e o boletim de medição leem do `escort_billings`
CONGELADO, não do ao vivo. Se o cron de re-freeze não rodou pós-correção de HE, a empresa FATURA o
valor antigo subfaturado mesmo o painel mostrando o correto maior. Painel ≠ o que é cobrado.
**Observado:** `faturamento_live` pode variar entre restarts do servidor enquanto o cron/auto-fix de boot
reconcilia timestamps/billings — não é o painel "bugado", é o congelado defasado convergindo. Quando o
usuário reclamar que "o número do mês mudou/está alto", checar TOR-* multi-dia e se o cron re-freeze rodou.
**Como conferir:** somar `liveCost.faturamento_live` vs `liveCost.faturamento` do `/api/operational-grid`
no range do mês (script `.local/test_*.mts` com token admin mintado via Supabase generateLink+verifyOtp).

## Faturamento de OS recusada (regra INTOCÁVEL nº1) — auditoria recorrente
OS `status="recusada"` deve ter TODOS os `fat_*` do billing = 0, `status=CANCELADO`,
`observacoes="OS RECUSADA — <cancellation_reason>"`. Auditoria de Maio/2026 achou 7 billings
recusados não-zerados (faturamento indevido) — sintoma de billing dessincronizado do status
da OS. Vale re-checar periodicamente: `escort_billings` cujo `service_order_id` aponta pra OS
recusada mas `fat_total != 0`. Lógica oficial de zeragem: server/routes/service-orders.ts
branch `isRecusada`.

## RH · Folha Real: o TOTAL não duplica — o que engana é o DETALHAMENTO
Recorrente: dono acha que "custos de RH duplicam". O total do card (`rhSummary.monthly` =
Σ `buildFolhaStats(...).custoTotalEstimado`) é bit-exato = base + periculosidade + HE +
**adicional noturno** + VR + cesta + diárias (cada item 1x; verificável somando componente a
componente — diff 0). Ele **EXCLUI** recolhimentos patronais (FGTS/INSS patronal/seguro de vida).
**Regra de reconciliação do detalhamento** (client `balanco-gerencial.tsx`, bloco `rhRows`):
`Vencimentos (base+peric+HE+noturno) + Benefícios (VR+cesta+diárias) = total do card`. A seção
"Recolhimentos" é **só informativa, fora do total** (rotular assim); o adicional noturno **precisa
aparecer** em Vencimentos senão as linhas não fecham com o número do card. O bloco "por agente" é
o MESMO total detalhado por pessoa, não é aditivo.
**Sem dupla contagem cruzada:** lançamentos manuais de folha/benefício em `financial_transactions`
(VR, FGTS, diárias, VT, "Folha de Pagamento") NÃO entram no `custoTotal` do Balanço — a linha
`despReaisOperacional = despReais − payroll − fixed − other` subtrai payroll/fixed/other. Então o
RH vem 100% da folha de ponto e o financeiro manual daquelas categorias é descartado do total (é
por isso que benefício/HE/noturno não "constam em outro"). `RH_CATS`/`FIXED_CATS` só classificam.
