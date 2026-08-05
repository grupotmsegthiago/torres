-- =============================================================================
-- drop_users_plain_password — D13 / PR4B (aplicação FUTURA, controlada)
--
-- Remove a coluna legada public.users.plain_password.
-- NÃO usar CASCADE.
-- NÃO alterar auth.users.
-- NÃO alterar RLS / policies / grants.
-- NÃO aplicar automaticamente no deploy/Vercel/CI/startup.
--
-- Guards: contagens + catálogo (pg_depend) + defense-in-depth (texto).
-- Diagnóstico 4.5A: zero deps reais no banco; cobertura reforçada preventivamente.
--
-- Pré-condições (runbook):
--   - PR4A integrado (código/tipos desacoplados)
--   - backup nativo recente confirmado
--   - baseline scripts/security/baseline-drop-plain-password.sql
--   - contagens: total=36, filled=0, null=36, deps externas=0
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
  v_dep_procedures integer;
  v_dep_triggers integer;
  v_dep_indexes integer;
  v_dep_constraints integer;
  v_dep_policies integer;
  v_dep_generated integer;
  v_dep_rules integer;
  v_dep_catalog integer;
  v_col_grants integer;
  v_relid oid;
  v_attnum smallint;
  v_dep_diag text;
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

  -- Identificar coluna no catálogo (relid + attnum)
  SELECT c.oid, a.attnum
  INTO v_relid, v_attnum
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid
  WHERE n.nspname = 'public'
    AND c.relname = 'users'
    AND a.attname = 'plain_password'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_relid IS NULL OR v_attnum IS NULL THEN
    RAISE EXCEPTION
      'plain_password catalog lookup failed (relid/attnum)';
  END IF;

  -- pg_depend: somente dependências externas/normais que bloqueiam DROP sem CASCADE
  SELECT count(*) INTO v_dep_catalog
  FROM pg_depend d
  WHERE d.refobjid = v_relid
    AND d.refobjsubid = v_attnum
    AND d.deptype = 'n';

  SELECT coalesce(
    string_agg(
      DISTINCT coalesce(
        (SELECT nsp.nspname || '.' || cls.relname
         FROM pg_class cls
         JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
         WHERE cls.oid = d.objid),
        (SELECT nsp.nspname || '.' || p.proname
         FROM pg_proc p
         JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
         WHERE p.oid = d.objid),
        d.classid::regclass::text
      ),
      ', '
    ),
    ''
  )
  INTO v_dep_diag
  FROM pg_depend d
  WHERE d.refobjid = v_relid
    AND d.refobjsubid = v_attnum
    AND d.deptype = 'n';

  SELECT count(*) INTO v_dep_views
  FROM information_schema.view_column_usage
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'plain_password';

  SELECT count(*) INTO v_dep_matviews
  FROM pg_matviews mv
  WHERE mv.schemaname = 'public'
    AND mv.definition ILIKE '%plain_password%';

  -- Functions (f) — defesa textual adicional; catálogo via pg_depend acima
  SELECT count(*) INTO v_dep_functions
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ILIKE '%plain_password%';

  -- Procedures (p)
  SELECT count(*) INTO v_dep_procedures
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'p'
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

  -- Rules reais (exclui _RETURN de views; views já cobertas por view_column_usage)
  SELECT count(*) INTO v_dep_rules
  FROM pg_rewrite r
  JOIN pg_class c ON c.oid = r.ev_class
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND r.rulename <> '_RETURN'
    AND pg_get_ruledef(r.oid) ILIKE '%plain_password%';

  -- Grants: diagnóstico apenas (NÃO bloqueiam DROP; somem com a coluna)
  SELECT count(*) INTO v_col_grants
  FROM information_schema.role_column_grants
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'plain_password';

  RAISE NOTICE
    'plain_password column grants (diagnostic, not a DROP blocker): %',
    v_col_grants;

  v_dependencies :=
      v_dep_catalog
    + v_dep_views
    + v_dep_matviews
    + v_dep_functions
    + v_dep_procedures
    + v_dep_triggers
    + v_dep_indexes
    + v_dep_constraints
    + v_dep_policies
    + v_dep_generated
    + v_dep_rules;

  IF v_dependencies <> 0 THEN
    RAISE EXCEPTION
      'plain_password has external dependencies (abort, no CASCADE): pg_depend=%, views=%, matviews=%, functions=%, procedures=%, triggers=%, indexes=%, constraints=%, policies=%, generated=%, rules=%, diag=%',
      v_dep_catalog,
      v_dep_views,
      v_dep_matviews,
      v_dep_functions,
      v_dep_procedures,
      v_dep_triggers,
      v_dep_indexes,
      v_dep_constraints,
      v_dep_policies,
      v_dep_generated,
      v_dep_rules,
      v_dep_diag;
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
