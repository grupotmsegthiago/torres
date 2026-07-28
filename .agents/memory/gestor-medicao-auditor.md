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

Armadilha de dados: OSs antigas têm mission_started_at/completed_date podres (duração de dias). Duração recalculada >48h ⇒ issue DURACAO_ABSURDA e status ATENCAO (análise manual), nunca "divergência" com valor correto inflado.

DDL de `medicao_audits` ficou dentro de `ensureCalcMissionRPC` no db-init — roda TODO boot (fora do gate de fingerprint), o que na prática garantiu a criação mesmo com "DDL pulado".
