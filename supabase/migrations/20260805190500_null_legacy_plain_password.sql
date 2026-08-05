-- =============================================================================
-- null_legacy_plain_password — D13 / PR3B (aplicação FUTURA, controlada)
--
-- Zera valores legados em public.users.plain_password.
-- NÃO remove a coluna (remoção da coluna = PR4).
-- NÃO altera auth.users.
-- NÃO aplicar automaticamente no deploy/Vercel.
--
-- Pré-condições (runbook):
--   - PR1/PR2 integrados; PR3A preparado
--   - backup nativo recente confirmado
--   - baseline scripts/security/baseline-plain-password-cleanup.sql
--   - contagens: total=36, filled=36
-- Pós: scripts/security/verify-plain-password-cleanup.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_total integer;
  v_filled integer;
BEGIN
  SELECT count(*),
         count(*) FILTER (
           WHERE plain_password IS NOT NULL
             AND btrim(plain_password) <> ''
         )
  INTO v_total, v_filled
  FROM public.users;

  IF v_total <> 36 THEN
    RAISE EXCEPTION
      'Unexpected users count: %, expected 36',
      v_total;
  END IF;

  IF v_filled <> 36 THEN
    RAISE EXCEPTION
      'Unexpected filled plain_password count: %, expected 36. Re-run after cleanup is not supported by this migration (fail-closed).',
      v_filled;
  END IF;
END $$;

UPDATE public.users
SET plain_password = NULL
WHERE plain_password IS NOT NULL;

DO $$
DECLARE
  v_remaining integer;
  v_null integer;
  v_total integer;
BEGIN
  SELECT count(*) INTO v_total FROM public.users;

  SELECT count(*)
  INTO v_remaining
  FROM public.users
  WHERE plain_password IS NOT NULL;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION
      'plain_password cleanup incomplete: % remaining',
      v_remaining;
  END IF;

  SELECT count(*) INTO v_null FROM public.users WHERE plain_password IS NULL;
  IF v_null <> v_total THEN
    RAISE EXCEPTION
      'plain_password null count mismatch: null=%, total=%',
      v_null, v_total;
  END IF;
END $$;

COMMIT;
