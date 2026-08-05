# Runbook — Limpeza de `public.users.plain_password` (D13 / PR3–PR4)

**Status:** **PR4A CONCLUÍDO — CÓDIGO E TIPOS DESACOPLADOS**
**Coluna física:** ainda presente — **PR4B PENDENTE**

**Incidente / transparência:** `docs/security/INCIDENT-PLAIN-PASSWORD-CLEANUP-2026-08-05.md`

**Migration histórica (PR3A, não registrada no histórico remoto; não reaplicar):**
`supabase/migrations/20260805190500_null_legacy_plain_password.sql`

**Baseline:** `scripts/security/baseline-plain-password-cleanup.sql`
**Verify:** `scripts/security/verify-plain-password-cleanup.sql`

---

## Contexto

| Camada | Estado |
|--------|--------|
| PR1 | API/UI sem exposição (`toSafeUser`) |
| PR2 | Writers de produção interrompidos (`sanitizeUserWrite`) |
| PR3A–PR3C | Artefatos + limpeza de valores (ad-hoc) + docs |
| PR4A | Schema TypeScript / tipos sem `plainPassword` |
| PR4B | DROP COLUMN (ainda não iniciado) |
| PR4C | Documentação pós-DROP |

Baseline pós-limpeza (2026-08-05): **36** users, **0** preenchidos, **36** NULL, Auth match **36**.

Login **não** depende da coluna — usa Supabase Auth (`signInWithPassword` / Admin API).
`must_change_password` é independente da coluna legada.

---

## PR4A (código)

- `shared/schema.ts` não mapeia `plain_password`.
- Leituras: `USER_SAFE_SELECT` (allowlist).
- Escritas: `sanitizeUserWrite` continua bloqueando `plainPassword` / `plain_password` / `password` / tokens.
- Zero readers/writers operacionais da coluna.

---

## Antes do PR4B (DROP)

1. Confirmar **backup nativo recente** no painel Supabase.
2. Baseline somente leitura: filled=0, null=total, coluna existe.
3. Verify PASS.
4. Smoke: login admin/funcionário, `/api/auth/me`, `/api/users`, reset/change/create, chat, RH.
5. Aplicar migration DROP em janela controlada (não via Vercel/CI/startup).
6. Atualizar verify para não exigir a coluna; smoke pós-DROP.

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
- Corrigir Auth via Supabase Admin API.
- Restore completo = último recurso, autorização expressa.
- Detalhes: `INCIDENT-PLAIN-PASSWORD-CLEANUP-2026-08-05.md`.

---

## O que este runbook NÃO faz

- Não recomenda envio de credenciais por canais externos.
- Não recomenda envio de senha por e-mail, WhatsApp ou outros canais.
- Não rotaciona senhas Auth em massa.
- Não executa DROP automaticamente (PR4B controlado).
- Não liga limpeza/DROP a startup, boot ou deploy Vercel.
