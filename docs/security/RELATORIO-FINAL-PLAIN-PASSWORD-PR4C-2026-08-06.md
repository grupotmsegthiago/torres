# Relatório Final — Remoção de `public.users.plain_password` (PR4C)

**Data:** 2026-08-06
**Domínio dono:** Segurança / Auth
**Tipo do dado:** Fato mestre legado removido
**Camada:** Supabase Auth + cadastro interno `public.users`
**Branch documental:** `cursor/pr4b-4-5b-homologacao-35ed`
**Publicação:** não realizada nesta fase

---

## Resumo executivo

1. A exposição e a persistência de senha em texto foram interrompidas antes da remoção física.
2. A coluna legada foi removida por migration versionada após backup, baseline e análise de dependências.
3. O verify pós-DROP terminou sem exceções; D13 está encerrada e as defesas de código permanecem.

## Reutilização (D11 / P13)

- **Busca realizada:** PR1–PR4B, runbooks, incidente, migration, baseline, verify e rollback existentes.
- **Existente aproveitado:** toda a cadeia preparada; PR4C apenas consolida a documentação.
- **Algo novo criado:** somente este relatório final; nenhum motor, API, tabela, migration ou componente.

## Evidências da operação

| Gate / etapa | Evidência confirmada |
|--------------|----------------------|
| Projeto | Torres — `erjhxwbutjyylxdthuuz` |
| Backup | Físico em 2026-08-06 07:56:45 UTC; restore disponível |
| Baseline | 36 users; filled=0; null=36; empty=0; Auth match=36 |
| Segurança | RLS habilitada; `USING(true)`=0; anon sem grants; authenticated sem grant da coluna |
| Dependências | `pg_depend`, views, matviews, functions, procedures, triggers, indexes, constraints, policies, generated e rules = 0 |
| Migration | `20260805210000_drop_users_plain_password.sql`, aplicada conforme confirmação humana |
| Verify | `verify-drop-plain-password.sql` executado sem exceções; todos os asserts passaram |
| Resultado | Coluna ausente; demais colunas, Auth, RLS, policy e grants preservados |
| Pós-APPLY | Proprietário confirmou acesso normal ao sistema e nenhuma regressão observada |
| Rollback | Não executado |

O horário exato do APPLY e os resultados individualizados dos smokes mutáveis não foram
fornecidos ao agente documental. O relatório não inventa essas evidências; registra a
confirmação explícita do proprietário sobre o resultado final.

## Alterações por fase

- **PR1:** API/UI deixaram de expor senha.
- **PR2:** writers deixaram de persistir senha.
- **PR3:** valores legados foram limpos; incidente ad-hoc documentado.
- **PR4A:** schema TypeScript e tipos foram desacoplados da coluna.
- **PR4B:** DROP versionado aplicado; verify aprovado.
- **PR4C:** changelog, runbooks, incidente, governança e D13 atualizados.

## O que PR4C alterou

- Documentação de segurança e governança.
- Status do incidente e da dívida D13.
- Registro final de backup, baseline, APPLY, verify e rollback não usado.

## O que PR4C NÃO alterou

- Código de aplicação.
- Banco ou Supabase Auth.
- Migrations ou rollback.
- `main`, Production ou configurações.
- Usuários, clientes ou dados de RH.

## Arquivos documentais

- `docs/governanca/CHANGELOG-GOVERNANCA.md`
- `docs/governanca/05-SEGURANCA.md`
- `docs/governanca/09-DIVIDAS-E-RISCOS-CONHECIDOS.md`
- `docs/security/RUNBOOK-PLAIN-PASSWORD-CLEANUP.md`
- `docs/security/RUNBOOK-DROP-PLAIN-PASSWORD.md`
- `docs/security/INCIDENT-PLAIN-PASSWORD-CLEANUP-2026-08-05.md`
- Este relatório

## Segurança e rollback

- Secrets no diff: não.
- Escrita em banco no PR4C: nenhuma.
- Rollback estrutural permanece documentado, mas não foi necessário nem executado.
- Não restaurar ou recriar senha em texto em incidente futuro.
- `toSafeUser`, `sanitizeUserWrite` e `USER_SAFE_SELECT` permanecem obrigatórios.

## Limitação e observação

- A observação contínua recomendada por 24 horas segue como prática operacional; não reabre D13 sem evidência de regressão.
- Há outro item histórico também numerado “D13” em `09-DIVIDAS-E-RISCOS-CONHECIDOS.md` (bootstrap do banco); ele é independente e permanece aberto.

## Decisão final

**APLICADO E HOMOLOGADO — D13 (`users.plain_password`) ENCERRADA.**
