# Runbook — DROP de `public.users.plain_password` (D13 / PR4B / 4.5B)

**Status:** **PR4C CONCLUÍDO — DROP APLICADO E VERIFICADO — D13 ENCERRADA**

**Migration aplicada (versionada):**
`supabase/migrations/20260805210000_drop_users_plain_password.sql`

**Baseline pré-DROP (SELECT diagnóstico):** `scripts/security/baseline-drop-plain-password.sql`
**Homologação pré-DROP (PASS/FAIL):** `scripts/security/homologate-drop-plain-password-baseline.sql`
**Verify pós-DROP:** `scripts/security/verify-drop-plain-password.sql`
**Rollback estrutural:** `supabase/migrations/rollback/20260805210000_rollback_drop_users_plain_password.sql`

**Pré-requisito de código:** PR4A integrado (`shared/schema.ts` sem `plainPassword`; readers/writers operacionais = 0).

---

## Resultado da execução

| Evidência | Resultado |
|-----------|-----------|
| Projeto | Torres (`erjhxwbutjyylxdthuuz`) |
| Backup pré-APPLY | Físico, 2026-08-06 07:56:45 UTC, restore disponível |
| Baseline | 36 users; filled 0; null 36; Auth match 36; dependências 0 |
| Migration | Aplicada com sucesso, conforme confirmação humana |
| Verify pós-DROP | Executado sem exceções; todos os asserts passaram |
| Coluna | `public.users.plain_password` ausente |
| Sistema pós-APPLY | Acesso normal; nenhuma regressão observada |
| Rollback | Não executado |

O horário exato do APPLY não foi fornecido ao agente documental. O encerramento usa a
evidência manual confirmada pelo proprietário; não cria registro retroativo de execução.

---

## Homologação 4.5B (estado)

| Etapa | Estado |
|-------|--------|
| 4.5A diagnóstico deps | Feito (zero deps reais; lacuna era de governança) |
| 4.5B guards na migration | Feito (`pg_depend`/procedures/rules) |
| Homologação estática (artefatos + testes de contrato) | Feito |
| Homologação live no banco | Feita; baseline aprovado |
| Backup nativo recente | Confirmado |
| Aplicação do DROP | Concluída |
| Verify pós-DROP | Aprovado |
| PR4C docs pós-DROP | Concluído |

---

## Pré-condições

Antes de qualquer aplicação:

1. **PR4A integrado** na `dev` (código e tipos desacoplados).
2. **Zero readers/writers operacionais** da coluna (`USER_SAFE_SELECT`, `sanitizeUserWrite`, `toSafeUser`).
3. Banco com **36** users / **filled 0** / **null 36** / Auth match **36**.
4. **Backup nativo recente** confirmado no painel Supabase.
5. **Homologação live** (`homologate-drop-plain-password-baseline.sql`) com **todos** os asserts PASS (`dependency_total = 0`).
6. **Zero dependências** (pg_depend externo, views, functions, procedures, rules, triggers, indexes, constraints, policies, generated). Grants da coluna são só diagnóstico (não bloqueiam DROP).
7. Janela **sem deploy/migration** concorrente.
8. Responsável presente durante a execução e o smoke.

**Critérios de interrupção:** filled ≠ 0; deps ≠ 0; backup não confirmado; Auth match degradado; login/`/api/auth/me` falhando de forma sistêmica; qualquer FAIL na homologação live.
---

## Execução realizada (controlada)

1. Backup nativo recente confirmado.
2. Baseline read-only executado e aprovado.
3. Total=36, filled=0, null=36, coluna existente, deps=0, Auth/RLS OK.
4. Migration versionada completa aplicada, sem CASCADE.
5. `verify-drop-plain-password.sql` executado sem exceções.
6. Validação pós-APPLY: proprietário confirmou acesso normal ao sistema e ausência de regressão observada. O agente documental não recebeu evidência individual dos fluxos mutáveis.
7. Rollback não executado.

Login e rotas dependem **apenas** de Supabase Auth — não da coluna removida.

---

## Proibições

- **Não** usar `DROP COLUMN ... CASCADE`.
- **Não** regravar senha em texto.
- **Não** copiar senhas do backup para a coluna.
- **Não** alterar `auth.users` neste fluxo.
- **Não** alterar RLS/policies/grants nesta migration.

---

## Incidente

- **Não** recriar senha em texto.
- Se o código quebrar por schema residual: **rollback estrutural** apenas (`ADD COLUMN IF NOT EXISTS plain_password text NULL`) — sem valores.
- Corrigir acesso no **Supabase Auth** (Admin API).
- Restore completo de backup = **último recurso**, autorização expressa.

---

## Relação com outros artefatos

| Artefato | Papel |
|----------|--------|
| `RUNBOOK-PLAIN-PASSWORD-CLEANUP.md` | Histórico PR3 / limpeza de valores |
| `INCIDENT-PLAIN-PASSWORD-CLEANUP-2026-08-05.md` | Evento ad-hoc da limpeza |
| Este runbook | DROP da coluna (PR4B) e resultado final |
| PR4C | Documentação final / encerramento D13 concluído |

---

## Após sucesso

1. Verify PASS e acesso normal confirmados.
2. Governança atualizada (PR4C).
3. Manter `sanitizeUserWrite` / `toSafeUser` como defesa em profundidade.
