## Relatório de Entrega — Cobrança de documentos: inativo, formação e reciclagem

**Data:** 2026-09-22
**Ambiente validado:** [x] local (testes)  [ ] preview  [ ] produção
**Publicou?** [x] Não

**Domínio dono:** RH / documentação do funcionário
**Tipo do dado:** Fato (certificados, cursos, prazo da Diretoria) e Resultado (pendência calculada)
**Risco:** vigilante ativo com reciclagem vencida passa a ser barrado ao entrar em OS, até a Diretoria gravar um prazo ou a reciclagem ser renovada
**Rollback:** reverter o commit; `supabase/migrations/rollback/20260922210000_rollback_employee_doc_grace.sql` remove `doc_grace_until`

### Reutilização (D11 / P13)
- Busca: `documents-catalog`, `computeOnboarding`, `document-compliance`, quadro de pendências, alerta da lista de funcionários
- Aproveitado: catálogo único, `isReciclagemDue`, gate de OS (`assertOnboardingComplete`), checklist da pasta
- Novo: coluna `employees.doc_grace_until` (não havia prazo por funcionário; bypass existente é só de contrato)

### O que foi alterado
- Funcionário **inativo** sai da cobrança de documentação, onboarding, quadro de pendências (holerite/contrato) e do alerta de documento vencido.
- **Formação** é uma vez. Escolta armada é extensão: se a formação de vigilante ou o certificado de escolta já está no sistema, nenhum dos dois volta a ser cobrado.
- **Reciclagem** continua obrigatória e renova (validade do certificado, ou 2 anos da realização, ou 2 anos da emissão do CNV se ainda não houver reciclagem).
- A **Diretoria** grava um prazo na pasta do funcionário. Até essa data, reciclagem vencida não trava a escala.

### O que NÃO foi alterado
- Trava geral de onboarding (documentos/contratos/treinamento) segue desligada, ordem de 01/07/2026.
- Trava de CNH/CNV na criação de OS segue desligada.
- Motor de faturamento.

### Banco
- [x] `employees.doc_grace_until date` — migration `20260922210000_employee_doc_grace.sql` e `db-init` no próximo start do servidor. Não aplicada manualmente no banco remoto nesta entrega.

### Complemento — PJ sem experiência pendente
- Regime PJ (e o alias `fixo`) não entra em contrato de experiência pendente: onboarding, quadro de pendências, tela de contratos, pasta do funcionário e trava do app.
- Contrato já assinado de PJ continua visível. Não gera experiência nova para PJ.

### Testes
| Comando | Resultado |
|---------|-----------|
| `npx tsx --test shared/documents-catalog.test.ts server/routes/employees-date-fields.test.ts` | 19 pass |
