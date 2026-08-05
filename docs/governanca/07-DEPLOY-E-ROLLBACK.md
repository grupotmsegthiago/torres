# 07 — Deploy e Rollback

**Natureza:** normativo
**Regras:** Framework P1–P8, L1–L6
**Deploy não é automático em toda tarefa** — só após gates e pedido/autorização de publicação.

---

## Fluxo padrão de trabalho

1. **Branch de trabalho** a partir de ponto seguro (`dev` ou branch de feature).
2. **Ponto de restauração:** tag/branch `safety/*` ou hash anotado **antes** de mudanças arriscadas.
3. Implementação no escopo + documentação se mudar SSOT.
4. **Testes** da suíte aplicável ([`06`](./06-TESTES-E-VALIDACAO.md)).
5. **Build** (`npm run build` / `build:ci` quando financeiro).
6. **Revisão** (gates G1–G16; humano em billing/auth/webhooks).
7. **Commit** descritivo; push da branch de feature.
8. **Publicação controlada** somente quando o usuário pedir publicar / política do projeto:
   - fluxo vigente: `.\publicar.ps1` (merge `dev` → `main`, push, retorno a `dev`)
   - ver também `.cursor/rules/publicar.mdc`
9. **Healthcheck:** `/healthz`, `/api/version`
10. **Validação pós-deploy:** fluxos críticos tocados (login, OS, boletim/fatura se financeiro, webhook se alterado)
11. **Rollback** se falha (abaixo)

---

## Proibições

- `git push --force` em `main` / `master`
- Deploy sem evidência de testes quando a mudança é financeira/segurança
- Commit de `.env`, chaves, certificados, dumps com segredo
- Migrations destrutivas sem backup verificado
- “Ajustar número” em produção via cache ou SQL ad hoc sem auditoria

---

## Rollback

| Situação | Ação |
|----------|------|
| Regressão de app | Reverter deploy (redeploy commit anterior / `publicar` a partir de hash seguro) |
| Divergência financeira | Parar recálculos automáticos se necessário; hotfix ou rollback; **não** “consertar” só o cache |
| Webhook comprometido | Desabilitar rota/flag; rotacionar secret; reprocessar eventos auditados |
| Migration ruim | Restore a partir de backup; forward-fix só com plano |

Tags de segurança existentes no repositório (exemplos históricos): `safety/dev-af455b6b`, `safety/origin-main-0019ef7c`.
Tag criada na Fase 1.0 documental: `safety/pre-framework-governanca-6ccdfac0`.

---

## Checklist pré-publicação

- [ ] Diff só do que deveria ir
- [ ] Testes aplicáveis OK
- [ ] Sem secrets
- [ ] Ponto de restauração conhecido
- [ ] Relatório de entrega preenchido
- [ ] Dono ciente do risco
- [ ] Plano de rollback em uma frase

## Checklist pós-publicação

- [ ] `/healthz` OK
- [ ] `/api/version` esperado
- [ ] Fluxo crítico validado
- [ ] Crons/webhooks OK se afetados
- [ ] Sem erro novo evidente em logs
