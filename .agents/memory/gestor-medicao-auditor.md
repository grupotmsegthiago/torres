---
name: Gestor de Medição Sênior
description: Auditor de faturamento das OS — como funciona, invariantes e armadilhas
---
Motor determinístico em `server/lib/gestor-medicao.ts`; rotas em `server/routes/gestor-medicao.ts`; tela `/admin/gestor-medicao`; histórico append-only em `medicao_audits`.

Regras que NÃO podem ser quebradas:
- Não existe segunda lógica de cálculo: o "valor correto" vem sempre de `calcularEscolta` com as MESMAS entradas da aprovação (/revisar): tabela ATUAL da OS → contract_id do billing → contrato Ativo do cliente; KM do billing (não das fotos); ts da OS. Recusada=R$0 (§8.1); cancelada=tabela 100km.
- Dinheiro comparado em centavos inteiros, tolerância R$0,01.
- Aprovação em lote RE-AUDITA cada OS na hora e espelha 100% os efeitos do /revisar APROVADA (recalc + persiste fat_*, fat_calculado na OS, boletim_numero, transação auto, OS concluida, logSystemAudit). Trava anti-corrida: update com `.eq(status,'A_VERIFICAR').eq(fat_total, valor auditado)`.
- Exceção (diretoria + justificativa ≥10 chars) aprova SEM recalcular, preservando o valor cobrado via `billingTotalForBoletim` — nunca `osCanonicalTotal(upd)` (difere quando fat_total ≠ soma dos componentes).
- IA (/explicar) só explica o JSON do motor, sob demanda, 1 OS por vez — nunca em lote, nunca calcula.

**Why:** revisão de código pegou 2 bugs reais: exceção relançando valor recalculado e lote sem os efeitos colaterais do /revisar.

Correções pós-Etapa 1 (28/07/2026):
- Cancelada: o "esperado" = tabela 100km + REPASSES reais do billing (pedágio/despesas/receitas) — computeCanceladaBilling zera esses campos por construção; sem somá-los, toda cancelada com pedágio vira falso positivo.
- Billing congelado (APROVADA/FATURADO/PAGO) divergente ⇒ ATENCAO + issue ALTERACAO_POS_APROVACAO (não é "erro de cálculo"; alerta dedicado é Etapa 2).
- Total bate mas componente difere ⇒ DIVERGENCIA_COMPOSICAO (verdict laranja, não aprovável em lote, não diz que o total errou).
- Alertas persistidos NÃO se reavaliam sozinhos: /calcular e /revisar disparam reauditarSeJaAuditada (fire-and-forget, só p/ OS já auditada, analyzed_by "(auto)").

Botão "Ajustar dados" (tela): POST /ajustar/:osId corrige SÓ entradas (km/horários/repasses, nunca fat_* direto), recalcula pelo motor, reaudita; front auto-aprova via /aprovar-lote se CALCULADO_OK. A_VERIFICAR = ajuste completo; congelado (APROVADA/FATURADO/PAGO) = dataOnly (só KM/horários, valor intocado — corrigir horários também evita noturno fantasma do default "00:00"); trava = status+fat_total; cancelada NUNCA entra no lote/auto-aprovação (regra 100km, e o lote marcaria a OS como concluida).

Armadilha de dados: OSs antigas têm mission_started_at/completed_date podres (duração de dias). Duração recalculada >48h ⇒ issue DURACAO_ABSURDA e status ATENCAO (análise manual), nunca "divergência" com valor correto inflado.

DDL de `medicao_audits` ficou dentro de `ensureCalcMissionRPC` no db-init — roda TODO boot (fora do gate de fingerprint), o que na prática garantiu a criação mesmo com "DDL pulado".
