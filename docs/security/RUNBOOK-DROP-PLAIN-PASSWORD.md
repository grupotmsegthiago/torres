# Runbook — DROP de `public.users.plain_password` (D13 / PR4B)

**Status:** **PR4B PREPARADO — DROP AINDA NÃO APLICADO**

**Migration (versionada, não aplicar nesta fase):**
`supabase/migrations/20260805210000_drop_users_plain_password.sql`

**Baseline pré-DROP:** `scripts/security/baseline-drop-plain-password.sql`
**Verify pós-DROP:** `scripts/security/verify-drop-plain-password.sql`
**Rollback estrutural:** `supabase/migrations/rollback/20260805210000_rollback_drop_users_plain_password.sql`

**Pré-requisito de código:** PR4A integrado (`shared/schema.ts` sem `plainPassword`; readers/writers operacionais = 0).

---

## Pré-condições

Antes de qualquer aplicação:

1. **PR4A integrado** na `dev` (código e tipos desacoplados).
2. **Zero readers/writers operacionais** da coluna (`USER_SAFE_SELECT`, `sanitizeUserWrite`, `toSafeUser`).
3. Banco com **36** users / **filled 0** / **null 36** / Auth match **36**.
4. **Backup nativo recente** confirmado no painel Supabase.
5. **Baseline imediato** (`baseline-drop-plain-password.sql`) com `dependency_total = 0`.
6. **Zero dependências** (pg_depend externo, views, functions, procedures, rules, triggers, indexes, constraints, policies, generated). Grants da coluna são só diagnóstico (não bloqueiam DROP).
7. Janela **sem deploy/migration** concorrente.
8. Responsável presente durante a execução e o smoke.

**Critérios de interrupção:** filled ≠ 0; deps ≠ 0; backup não confirmado; Auth match degradado; login/`/api/auth/me` falhando de forma sistêmica.

---

## Execução futura (controlada)

1. Confirmar **backup nativo recente**.
2. Executar **baseline** somente leitura.
3. Validar contagens: total=36, filled=0, null=36, coluna existe, deps=0.
4. Aplicar a migration **completa** (`20260805210000_drop_users_plain_password.sql`) via canal autorizado (SQL Editor / `apply_migration` controlado) — **não** via Vercel/CI/startup.
5. Executar **verify-drop-plain-password.sql** — todos os asserts PASS.
6. Smoke:
   - login admin;
   - login funcionário;
   - `/api/auth/me`;
   - `/api/users`;
   - create / reset / change-password;
   - register-by-cpf;
   - chat;
   - RH.
7. Observar logs por **24h**.

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
| Este runbook | DROP da coluna (PR4B) |
| PR4C | Documentação final / encerramento D13 (ainda não iniciado) |

---

## Após sucesso

1. Confirmar verify PASS e smoke OK.
2. Atualizar governança (PR4C).
3. Manter `sanitizeUserWrite` / `toSafeUser` como defesa em profundidade.
