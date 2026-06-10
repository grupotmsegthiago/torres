---
name: Consumidores de pendência documental (catálogo de docs)
description: Onde a "lista de documentos obrigatórios por funcionário" é recomputada — mudar uma regra de cobrança exige tocar TODOS.
---

# Pendência documental tem 4 consumidores independentes

Uma regra de cobrança de documento (ex.: reciclagem condicional por CNV) precisa ser
aplicada em **todos** estes pontos, senão a UI/relatório fica inconsistente:

1. `server/jobs/document-compliance.ts` — relatório/e-mail de compliance (`buildDocComplianceReport`).
2. `server/routes/onboarding.ts` — bloqueio de entrada em OS (`computeOnboarding`, usa `getMandatoryDocTypesForProfile`).
3. `client/.../employees.tsx` `EmployeePastaView` — checklist visual + contagem + `missingDocs` (filtra `REQUIRED_DOCS`).
4. `client/.../employees.tsx` `EmployeesPage` — **alerta "N funcionários com documentação pendente"** na lista (`getMissing`, IIFE perto da `<h1>Funcionários`).

**Why:** o #4 (alerta da lista) é o que mais escapa — é um cálculo separado dos outros 3 e
não usa o mesmo helper. Quando a regra de "Reciclagem Escolta Armada" (cobrança só 2 anos após
`cnv_issue_date`) foi adicionada, os 3 primeiros foram corrigidos mas o alerta da lista continuou
acusando reciclagem indevidamente até o dono apontar pela tela.

**How to apply:** centralize a decisão num helper em `shared/documents-catalog.ts`
(ex.: `isReciclagemDue` / `filterReciclagemByCnv`) e chame nos 4 lugares. Regra da reciclagem:
sem data de emissão OU < 2 anos → NÃO cobra; >= 2 anos → cobra (comparação lexical de string
YYYY-MM-DD em BRT).
