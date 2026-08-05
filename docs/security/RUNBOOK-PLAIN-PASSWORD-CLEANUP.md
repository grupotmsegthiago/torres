# Runbook — Limpeza de `public.users.plain_password` (D13 / PR3)

**Status:** **VALORES LEGADOS LIMPOS — HOMOLOGAÇÃO PÓS-LIMPEZA CONCLUÍDA**
**Coluna:** ainda presente — **PR4 PENDENTE**

**Incidente / transparência:** `docs/security/INCIDENT-PLAIN-PASSWORD-CLEANUP-2026-08-05.md`

**Migration versionada (intenção PR3A, não registrada no histórico remoto):**
`supabase/migrations/20260805190500_null_legacy_plain_password.sql`

**Baseline:** `scripts/security/baseline-plain-password-cleanup.sql`
**Verify:** `scripts/security/verify-plain-password-cleanup.sql`

---

## Contexto

| Camada | Estado |
|--------|--------|
| PR1 | API/UI sem exposição (`toSafeUser`) |
| PR2 | Writers de produção interrompidos |
| PR3A | Artefatos baseline/verify/migration/runbook versionados |
| Limpeza de valores | Efeito alcançado em 2026-08-05 via **SQL ad-hoc** (fora do histórico de migration) |
| PR3C | Documentação e homologação pós-limpeza |
| PR4 | DROP da coluna (fora deste runbook; **não iniciado**) |

Baseline pós-limpeza (2026-08-05): **36** users, **0** `plain_password` preenchidos, **36** NULL, **36** Auth match.

Login **não** depende da coluna — usa Supabase Auth (`signInWithPassword` / Admin API).

---

## Histórico da migration (importante)

- O arquivo `20260805190500_null_legacy_plain_password.sql` permanece no repositório como artefato preparado.
- Ele **não** deve ser reaplicado: guards fail-closed (`filled = 36`) abortariam, e a limpeza **já ocorreu**.
- **Não** inserir registro falso dessa migration no histórico Supabase.
- Qualquer reconciliação futura (asserts-only) exige PR dedicado e autorização explícita.

---

## Pós-limpeza (operacional)

1. Executar baseline (somente leitura) e verify — esperado: filled=0, null=total.
2. Não regravar senha em texto em `public.users`.
3. Corrigir Auth apenas via Supabase Admin API.
4. Observar logs (login, `/api/auth/me`, `/api/users`, chat, RH).
5. DROP da coluna = **PR4**, com runbook e autorização próprios.

---

## Critérios de interrupção (ainda válidos)

Parar qualquer operação de schema/dados se:

- verify falhar;
- Auth match degradar;
- login/`/api/auth/me` falhar de forma sistêmica;
- surgir evidência de dependência operacional da coluna;
- alguém tentar restaurar valores de `plain_password` a partir de backup.

Para aplicação controlada futura de qualquer mudança de schema relacionada: exigir **backup nativo recente** confirmado no painel Supabase.

---

## Incidente

- **Não** regravar senha em texto.
- **Não** copiar senha do backup.
- Corrigir usuário pelo **Supabase Auth Admin API**.
- Restore completo do banco = **último recurso**, autorização expressa.
- O arquivo em `supabase/migrations/rollback/` **não** restaura valores — aborta com mensagem de segurança.
- Detalhes do evento ad-hoc: `INCIDENT-PLAIN-PASSWORD-CLEANUP-2026-08-05.md`.

---

## O que este runbook NÃO faz

- Não recomenda envio de credenciais por canais externos.
- Não recomenda envio de senha por e-mail, WhatsApp ou outros canais.
- Não rotaciona senhas Auth em massa.
- Não executa DROP (PR4).
- Não liga limpeza a startup, boot ou deploy Vercel.
- Não autoriza SQL traduzido/manual no lugar do artefato revisado.
