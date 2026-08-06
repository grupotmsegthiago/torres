# Runbook — Limpeza de `public.users.plain_password` (D13 / PR3–PR4)

**Status:** **PR4B PREPARADO — DROP AINDA NÃO APLICADO**
**Coluna física:** ainda presente — migration de DROP **apenas versionada**

**Incidente / transparência:** `docs/security/INCIDENT-PLAIN-PASSWORD-CLEANUP-2026-08-05.md`
**Runbook DROP (PR4B):** `docs/security/RUNBOOK-DROP-PLAIN-PASSWORD.md`

**Migration histórica NULL (PR3A, não registrada no histórico remoto; não reaplicar):**
`supabase/migrations/20260805190500_null_legacy_plain_password.sql`

**Migration DROP (PR4B, ainda não aplicada):**
`supabase/migrations/20260805210000_drop_users_plain_password.sql`

**Baseline limpeza:** `scripts/security/baseline-plain-password-cleanup.sql`
**Verify limpeza:** `scripts/security/verify-plain-password-cleanup.sql`
**Baseline DROP:** `scripts/security/baseline-drop-plain-password.sql`
**Verify DROP:** `scripts/security/verify-drop-plain-password.sql`

---

## Contexto

| Camada | Estado |
|--------|--------|
| PR1 | API/UI sem exposição (`toSafeUser`) |
| PR2 | Writers de produção interrompidos (`sanitizeUserWrite`) |
| PR3A–PR3C | Artefatos + limpeza de valores (ad-hoc) + docs |
| PR4A | Schema TypeScript / tipos sem `plainPassword` |
| PR4B | DROP COLUMN **preparado** (não aplicado) |
| PR4C | Documentação pós-DROP (pendente) |

Baseline pós-limpeza (2026-08-05): **36** users, **0** preenchidos, **36** NULL, Auth match **36**.

Login **não** depende da coluna — usa Supabase Auth (`signInWithPassword` / Admin API).
`must_change_password` é independente da coluna legada.

---

## PR4A (código) — feito

- `shared/schema.ts` não mapeia `plain_password`.
- Leituras: `USER_SAFE_SELECT` (allowlist).
- Escritas: `sanitizeUserWrite` continua bloqueando `plainPassword` / `plain_password` / `password` / tokens.
- Zero readers/writers operacionais da coluna.

---

## PR4B (DROP) — preparado, não aplicado

1. Confirmar **backup nativo recente** no painel Supabase.
2. Baseline DROP: filled=0, null=total, coluna existe, deps=0.
3. Aplicar migration `20260805210000_drop_users_plain_password` em janela controlada (não via Vercel/CI/startup).
4. Verify DROP + smoke (login, `/api/auth/me`, `/api/users`, create/reset/change, chat, RH).
5. Detalhes: `RUNBOOK-DROP-PLAIN-PASSWORD.md`.

---

## Histórico da migration NULL (PR3A)

- Arquivo permanece como artefato histórico superseded.
- **Não** reaplicar (guards fail-closed; limpeza já ocorreu).
- **Não** inserir registro falso no histórico Supabase.

---

## Critérios de interrupção

Parar qualquer DROP se:

- filled ≠ 0;
- Auth match degradar;
- login/`/api/auth/me` falhar de forma sistêmica;
- view/function/dependência inesperada na coluna;
- backup recente não confirmado.

---

## Incidente

- **Não** regravar senha em texto.
- **Não** copiar senha do backup.
- Não recomenda envio de credenciais por canal inseguro.
- Corrigir Auth via Supabase Admin API.
- Restore completo = último recurso, autorização expressa.
- Detalhes: `INCIDENT-PLAIN-PASSWORD-CLEANUP-2026-08-05.md`.
