-- =============================================================================
-- drop_users_plain_password — D13 / PR4B (aplicação FUTURA, controlada)
--
-- Remove a coluna legada public.users.plain_password.
-- NÃO usar CASCADE.
-- NÃO alterar auth.users.
-- NÃO alterar RLS / policies / grants.
-- NÃO aplicar automaticamente no deploy/Vercel/CI/startup.
--
-- Pré-condições (runbook):
--   - PR4A integrado (código/tipos desacoplados)
--   - backup nativo recente confirmado
--   - baseline scripts/security/baseline-drop-plain-password.sql
--   - contagens: total=36, filled=0, null=36, deps=0
-- Pós: scripts/security/verify-drop-plain-password.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_total integer;
  v_filled integer;
  v_null integer;
  v_column_exists integer;
  v_dependencies integer;
  v_dep_views integer;
  v_dep_matviews integer;
  v_dep_functions integer;
  v_dep_triggers integer;
  v_dep_indexes integer;
  v_dep_constraints integer;
  v_dep_policies integer;
  v_dep_generated integer;
BEGIN
  SELECT count(*) INTO v_total
  FROM public.users;

  SELECT count(*) FILTER (
           WHERE plain_password IS NOT NULL
             AND btrim(plain_password) <> ''
         ),
         count(*) FILTER (
           WHERE plain_password IS NULL
         )
  INTO v_filled, v_null
  FROM public.users;

  SELECT count(*) INTO v_column_exists
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'plain_password';

  IF v_total <> 36 THEN
    RAISE EXCEPTION
      'Unexpected users count: %, expected 36',
      v_total;
  END IF;

  IF v_filled <> 0 THEN
    RAISE EXCEPTION
      'plain_password still contains values: %',
      v_filled;
  END IF;

  IF v_null <> v_total THEN
    RAISE EXCEPTION
      'plain_password null count mismatch: % / %',
      v_null,
      v_total;
  END IF;

  IF v_column_exists <> 1 THEN
    RAISE EXCEPTION
      'plain_password column existence mismatch: %',
      v_column_exists;
  END IF;

  SELECT count(*) INTO v_dep_views
  FROM information_schema.view_column_usage
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'plain_password';

  SELECT count(*) INTO v_dep_matviews
  FROM pg_matviews mv
  WHERE mv.schemaname = 'public'
    AND mv.definition ILIKE '%plain_password%';

  SELECT count(*) INTO v_dep_functions
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ILIKE '%plain_password%';

  SELECT count(*) INTO v_dep_triggers
  FROM pg_trigger tr
  JOIN pg_class t ON t.oid = tr.tgrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'users'
    AND NOT tr.tgisinternal
    AND pg_get_triggerdef(tr.oid) ILIKE '%plain_password%';

  SELECT count(*) INTO v_dep_indexes
  FROM pg_index i
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (i.indkey)
  WHERE n.nspname = 'public'
    AND t.relname = 'users'
    AND a.attname = 'plain_password'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  SELECT count(*) INTO v_dep_constraints
  FROM information_schema.constraint_column_usage
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'plain_password';

  SELECT count(*) INTO v_dep_policies
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.users'::regclass
    AND (
      COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') ILIKE '%plain_password%'
      OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ILIKE '%plain_password%'
    );

  SELECT count(*) INTO v_dep_generated
  FROM pg_attribute a
  JOIN pg_class t ON t.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'users'
    AND a.attname = 'plain_password'
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attgenerated <> '';

  v_dependencies :=
      v_dep_views
    + v_dep_matviews
    + v_dep_functions
    + v_dep_triggers
    + v_dep_indexes
    + v_dep_constraints
    + v_dep_policies
    + v_dep_generated;

  IF v_dependencies <> 0 THEN
    RAISE EXCEPTION
      'plain_password has dependencies (abort, no CASCADE): views=%, matviews=%, functions=%, triggers=%, indexes=%, constraints=%, policies=%, generated=%',
      v_dep_views,
      v_dep_matviews,
      v_dep_functions,
      v_dep_triggers,
      v_dep_indexes,
      v_dep_constraints,
      v_dep_policies,
      v_dep_generated;
  END IF;
END $$;

ALTER TABLE public.users
DROP COLUMN plain_password;

DO $$
DECLARE
  v_remaining integer;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'plain_password';

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION
      'plain_password column still exists';
  END IF;
END $$;

COMMIT;
