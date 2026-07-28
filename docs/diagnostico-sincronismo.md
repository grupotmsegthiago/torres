# Diagnóstico — Sincronismo Integral do Sistema (Fase 1)
**Data:** 28/07/2026 · **Status:** aguardando aprovação da diretoria — NENHUMA alteração foi feita.

---

## 1. Como o dado flui hoje (fluxo real, verificado no código)

```
OS (service_orders)
 └─ edição (PATCH /api/service-orders/:id) ──recalcula──► escort_billings  [SÓ se status = A_VERIFICAR]
     escort_billings ──envio p/ aprovação──► boletim_approvals.billing_snapshot  (FOTO ÚNICA, congelada)
         └─ aprovação ──► transação financeira (createAutoTransaction, chave origin_type+origin_id)
             └─ NF/cobrança (invoices → Asaas, chave FATURA-{id})
 └─ custos da missão (mission_costs: pedágio, combustível, outras) ──agregados no cálculo──► escort_billings
 └─ pagamentos a fornecedor: via financial_transactions (origem mission_cost/fueling) — manual, sem "split" automático
```

**Conclusão central:** o sistema JÁ tem uma arquitetura de fonte única + congelamento intencional:
- Motor único de cálculo no backend: `calcularEscolta` (server/billing-calc.ts) — Fase 6 do pedido **já existe em grande parte**.
- Snapshot aprovado imutável: `billing_snapshot` do boletim (Fase 3) **já existe**.
- Auditoria: `logSystemAudit`, `medicao_audits` (append-only), `revisado_por/em` **já existem** parcialmente.
- Gestor de Medição Sênior (novo) já cobre parte da Fase 7 (divergências OS×boletim×valor oficial).

O problema NÃO é ausência de arquitetura — é que ela tem **furos pontuais e regras de congelamento que a operação não enxerga**. O que parece "dessincronizado" muitas vezes é congelamento proposital sem aviso na tela.

---

## 2. Pontos exatos onde o sincronismo quebra

| # | Problema | Evidência | Causa raiz | Impacto | Correção recomendada | Risco |
|---|----------|-----------|------------|---------|----------------------|-------|
| 1 | Editar OS não atualiza boletim/faturamento | service-orders.ts:1653-1725 + cron.ts:1906: recálculo só quando billing `A_VERIFICAR`; FROZEN_STATUSES (APROVADA/FATURADO/PAGO/CANCELADO/REJEITADA) nunca recalculam | Congelamento financeiro proposital, mas **silencioso** — a tela não mostra "OS alterada após aprovação" | Operador acha que o sistema perdeu a edição; valores "antigos" em relatórios | Marcar visivelmente "alterada após aprovação" + fluxo de reaprovação com justificativa (Fase 3 do pedido) — sem nunca sobrescrever o aprovado | Baixo (só sinalização + fluxo novo) |
| 2 | Telas com fórmula própria de dinheiro | boletim-medicao.tsx:472 e 1735-1744 replicam soma de 9 componentes e cálculo de hora extra do backend; relatorio-faturamento.tsx:776-803 agrega por conta própria | Duplicação frontend×backend | Divergência de centavos/arredondamento entre telas | Backend expor total canônico (osCanonicalTotal) no payload; telas só exibem | Médio (toca telas críticas) |
| 3 | Mutations sem invalidação completa de cache | service-orders.tsx:174/193 (custos não invalidam boletim/billings); operational-grid.tsx:3189/3211; boletim-medicao.tsx:131 | queryKeys relacionadas fora da lista de invalidação | Tela continua mostrando valor antigo até F5 | Completar invalidateRelatedQueries nos ~6 pontos mapeados | Baixo |
| 4 | Cópias locais (useState) de dados do servidor | boletim-medicao.tsx:89-98 e 310-320; relatorio-faturamento.tsx:66-67/529 | Estado local não re-sincroniza após mutação | Campos "presos" com valor antigo | Derivar do cache do React Query, não copiar | Médio (regressão de UI) |
| 5 | Ligações por nome/texto em vez de ID | asaas.ts:767 (fallback por client_name ILIKE); transações manuais por entity_name; conferência TM SEG por DATA+PLACA (este é proposital — planilha externa) | Fallbacks históricos | Cobrança pode casar com cliente errado se nomes parecidos | Remover fallback por nome no Asaas (falhar explícito); FK/ID obrigatório em transação manual | Baixo |
| 6 | Despesa dupla armazenada 2× | mission_costs (granular) + escort_billings.despesas_* (agregado); agregação só roda no Calcular/Aprovar | Snapshot de agregado sem re-agregação automática | Pedágio lançado depois do cálculo não entra no boletim | Alerta do Gestor: "custo lançado após cálculo" (não re-somar sozinho em congelado) | Baixo |
| 7 | Pedágio vazio = zero, sem justificativa | Number(v‖0) em toda a cadeia; fallback p/ pedagio_estimado em service-orders.ts:340 | Ausência de status do pedágio | Não se distingue "sem pedágio" de "esqueceram de lançar" | Fase 5 do pedido: status do pedágio + botão "Pedágio zero" com motivo + trava na medição | Médio (muda fluxo do operador) |
| 8 | Endpoints de escrita sem trilha de auditoria | PATCH service_orders grava sem old/new value; vários writers de escort_billings idem (logSystemAudit cobre só ações nobres) | Auditoria por ação, não por campo | Não dá pra responder "quem mudou o KM e quando" | Trilha campo-a-campo (valor anterior/novo/motivo) nos PATCH críticos — Fase 4 | Médio |

Registros órfãos/duplicados: já há mecanismos (dedup de boletim "foto única", uniq_agent_loc, invariante recusada=R$0 em 7 writers). Recomendo auditoria SQL somente-leitura como parte da execução, não achei estrutura sistêmica de órfãos no mapeamento.

---

## 3. Rotas Brasil (análise técnica)
Não há API pública oficial do rotasbrasil.com.br; o site tem proteção anti-automação. Scraping seria frágil e contra os termos. **Recomendação: fluxo assistido** (exatamente o plano B do pedido): botão que abre o site com origem/destino prontos pra copiar + campos "valor consultado / praças / eixos / evidência" + carimbo de usuário e hora. Zero risco jurídico/técnico.

## 4. Knowledge Graph / Mapa do Sistema
Todas as entidades pedidas já existem como tabelas com IDs reais. A tela "Mapa do Sistema" (buscar OS → grafo cliente/contrato/missão/boletim/NF/transações com cores de estado) é viável **sem criar banco novo** — é uma visão de leitura sobre as FKs existentes + resultados do Gestor de Medição. Não recomendo grafo persistido separado (duplicaria dados = novo problema de sincronismo, o oposto do objetivo).

## 5. Gestor de Desenvolvimento (Fase 7)
Recomendo **evoluir o Gestor de Medição Sênior** em vez de criar módulo paralelo: acrescentar as checagens estruturais (OS sem contrato, medição sem OS, faturamento sem medição aprovada, KM invertido — parte já existe como "issues"), painel de saúde com tendência e protocolo/severidade/status por divergência. Ele já é somente-leitura + aprovação explícita, como o pedido exige.

---

## 6. Ordem recomendada de implementação (após aprovação)

| Etapa | Conteúdo | Esforço | Risco |
|-------|----------|---------|-------|
| 1 | Correções de cache + remover fórmulas duplicadas do frontend (#2, #3, #4) | Pequeno | Baixo |
| 2 | Sinalização "OS alterada após aprovação" + fluxo de reaprovação com justificativa (#1) | Médio | Baixo |
| 3 | Trilha de auditoria campo-a-campo nos PATCH críticos + botão "Ver histórico" (#8, Fase 4) | Médio | Médio |
| 4 | Pedágio: status + "Pedágio zero" justificado + trava na medição + fluxo Rotas Brasil assistido (#7, Fase 5) | Médio | Médio |
| 5 | Gestor de Desenvolvimento: novas checagens estruturais + painel de saúde (Fase 7) | Médio | Baixo |
| 6 | Mapa do Sistema (grafo de leitura por OS) (Fase 2) | Médio | Baixo |
| 7 | Testes ponta-a-ponta do ciclo OS→missão→medição→aprovação→fatura (Fase 10) | Médio | Baixo |

Sem migração destrutiva em nenhuma etapa; nada recalcula período fechado; valores aprovados permanecem intocáveis (§8.1 e cancelada-100km preservados).
