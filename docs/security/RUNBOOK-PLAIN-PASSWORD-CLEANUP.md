# Runbook â€” Limpeza de `public.users.plain_password` (D13 / PR3)

**Status:** **VALORES LEGADOS LIMPOS â€” HOMOLOGAÃ‡ÃƒO PÃ“S-LIMPEZA CONCLUÃDA**
**Coluna:** ainda presente â€” **PR4 PENDENTE**

**Incidente / transparÃªncia:** `docs/security/INCIDENT-PLAIN-PASSWORD-CLEANUP-2026-08-05.md`

**Migration versionada (intenÃ§Ã£o PR3A, nÃ£o registrada no histÃ³rico remoto):**
`supabase/migrations/20260805190500_null_legacy_plain_password.sql`

**Baseline:** `scripts/security/baseline-plain-password-cleanup.sql`
**Verify:** `scripts/security/verify-plain-password-cleanup.sql`

---

## Contexto

| Camada | Estado |
|--------|--------|
| PR1 | API/UI sem exposiÃ§Ã£o (`toSafeUser`) |
| PR2 | Writers de produÃ§Ã£o interrompidos |
| PR3A | Artefatos baseline/verify/migration/runbook versionados |
| Limpeza de valores | Efeito alcanÃ§ado em 2026-08-05 via **SQL ad-hoc** (fora do histÃ³rico de migration) |
| PR3C | DocumentaÃ§Ã£o e homologaÃ§Ã£o pÃ³s-limpeza |
| PR4 | DROP da coluna (fora deste runbook; **nÃ£o iniciado**) |

Baseline pÃ³s-limpeza (2026-08-05): **36** users, **0** `plain_password` preenchidos, **36** NULL, **36** Auth match.

Login **nÃ£o** depende da coluna â€” usa Supabase Auth (`signInWithPassword` / Admin API).

---

## HistÃ³rico da migration (importante)

- O arquivo `20260805190500_null_legacy_plain_password.sql` permanece no repositÃ³rio como artefato preparado.
- Ele **nÃ£o** deve ser reaplicado: guards fail-closed (`filled = 36`) abortariam, e a limpeza **jÃ¡ ocorreu**.
- **NÃ£o** inserir registro falso dessa migration no histÃ³rico Supabase.
- Qualquer reconciliaÃ§Ã£o futura (asserts-only) exige PR dedicado e autorizaÃ§Ã£o explÃ­cita.

---

## PÃ³s-limpeza (operacional)

1. Executar baseline (somente leitura) e verify â€” esperado: filled=0, null=total.
2. NÃ£o regravar senha em texto em `public.users`.
3. Corrigir Auth apenas via Supabase Admin API.
4. Observar logs (login, `/api/auth/me`, `/api/users`, chat, RH).
5. DROP da coluna = **PR4**, com runbook e autorizaÃ§Ã£o prÃ³prios.

---

## CritÃ©rios de interrupÃ§Ã£o (ainda vÃ¡lidos)

Parar qualquer operaÃ§Ã£o de schema/dados se:

- verify falhar;
- Auth match degradar;
- login/`/api/auth/me` falhar de forma sistÃªmica;
- surgir evidÃªncia de dependÃªncia operacional da coluna;
- alguÃ©m tentar restaurar valores de `plain_password` a partir de backup.

---

## Incidente

- **NÃ£o** regravar senha em texto.
- **NÃ£o** copiar senha do backup.
- Corrigir usuÃ¡rio pelo **Supabase Auth Admin API**.
- Restore completo do banco = **Ãºltimo recurso**, autorizaÃ§Ã£o expressa.
- O arquivo em `supabase/migrations/rollback/` **nÃ£o** restaura valores â€” aborta com mensagem de seguranÃ§a.
- Detalhes do evento ad-hoc: `INCIDENT-PLAIN-PASSWORD-CLEANUP-2026-08-05.md`.

---

## O que este runbook NÃƒO faz

- NÃ£o recomenda envio de credenciais por canais externos.
- NÃ£o rotaciona senhas Auth em massa.
- NÃ£o executa DROP (PR4).
- NÃ£o liga limpeza a startup, boot ou deploy Vercel.
- NÃ£o autoriza SQL traduzido/manual no lugar do artefato revisado.
