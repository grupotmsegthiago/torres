-- PR5B.1-TX — expansão para writes atômicos de escort_billings.
-- Não contém cálculo financeiro: apenas integridade, locking e persistência.
BEGIN;

-- Role interna NOLOGIN sem atributo privilegiado de bypass RLS.
-- No Supabase Hosted o canal de migration não pode criar/alterar esse atributo (42501).
-- Travessia de RLS: policies explícitas abaixo + SECURITY DEFINER owned por esta role.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'torres_billing_rpc_owner'
  ) THEN
    CREATE ROLE torres_billing_rpc_owner
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION;
  END IF;
END;
$$;

ALTER ROLE torres_billing_rpc_owner
  NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.escort_billings
    WHERE service_order_id IS NOT NULL
    GROUP BY service_order_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'PR5B1_TX_DUPLICATE_BILLING: service_order_id duplicado';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_eb_so_id
  ON public.escort_billings (service_order_id);

ALTER TABLE public.escort_billings
  ADD COLUMN IF NOT EXISTS lock_version bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.escort_billings.lock_version IS
  'PR5B.1-TX: versão otimista. Incrementada somente por write_escort_billing_atomic.';

CREATE INDEX IF NOT EXISTS idx_boletim_snapshot_billing_lookup
  ON public.boletim_approvals
  USING gin (billing_snapshot jsonb_path_ops)
  WHERE billing_snapshot IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_boletim_legacy_billing_ids_lookup
  ON public.boletim_approvals
  USING gin (billing_ids)
  WHERE billing_snapshot IS NULL
    AND status IN ('PENDENTE', 'APROVADO');

GRANT USAGE ON SCHEMA public TO torres_billing_rpc_owner;
GRANT SELECT, UPDATE ON
  public.service_orders, public.mission_photos, public.escort_contracts
  TO torres_billing_rpc_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escort_billings
  TO torres_billing_rpc_owner;
GRANT SELECT, INSERT, UPDATE ON public.boletim_approvals
  TO torres_billing_rpc_owner;
GRANT SELECT, UPDATE ON public.invoices TO torres_billing_rpc_owner;
GRANT INSERT ON public.system_audit_logs TO torres_billing_rpc_owner;
GRANT SELECT ON public.financial_transactions TO torres_billing_rpc_owner;
GRANT USAGE, SELECT ON SEQUENCE
  public.boletim_approvals_id_seq,
  public.system_audit_logs_id_seq
  TO torres_billing_rpc_owner;

-- Policies para a role interna (substitui atributo privilegiado de bypass RLS no Hosted).
-- Tabelas com RLS e sem policy para esta role negariam DML do SECURITY DEFINER.
DROP POLICY IF EXISTS torres_billing_rpc_owner_all ON public.escort_billings;
CREATE POLICY torres_billing_rpc_owner_all ON public.escort_billings
  FOR ALL TO torres_billing_rpc_owner
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS torres_billing_rpc_owner_select ON public.service_orders;
CREATE POLICY torres_billing_rpc_owner_select ON public.service_orders
  FOR ALL TO torres_billing_rpc_owner
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS torres_billing_rpc_owner_select ON public.mission_photos;
CREATE POLICY torres_billing_rpc_owner_select ON public.mission_photos
  FOR ALL TO torres_billing_rpc_owner
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS torres_billing_rpc_owner_select ON public.escort_contracts;
CREATE POLICY torres_billing_rpc_owner_select ON public.escort_contracts
  FOR ALL TO torres_billing_rpc_owner
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS torres_billing_rpc_owner_write ON public.boletim_approvals;
CREATE POLICY torres_billing_rpc_owner_write ON public.boletim_approvals
  FOR ALL TO torres_billing_rpc_owner
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS torres_billing_rpc_owner_write ON public.invoices;
CREATE POLICY torres_billing_rpc_owner_write ON public.invoices
  FOR ALL TO torres_billing_rpc_owner
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS torres_billing_rpc_owner_insert ON public.system_audit_logs;
CREATE POLICY torres_billing_rpc_owner_insert ON public.system_audit_logs
  FOR INSERT TO torres_billing_rpc_owner
  WITH CHECK (true);

DROP POLICY IF EXISTS torres_billing_rpc_owner_select ON public.financial_transactions;
CREATE POLICY torres_billing_rpc_owner_select ON public.financial_transactions
  FOR SELECT TO torres_billing_rpc_owner
  USING (true);

CREATE OR REPLACE FUNCTION public.is_escort_billing_snapshotted(
  p_billing_id uuid,
  p_lock_version bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.boletim_approvals AS approval
      CROSS JOIN LATERAL jsonb_array_elements(approval.billing_snapshot) AS item
      WHERE approval.billing_snapshot @>
        jsonb_build_array(jsonb_build_object('billing_id', p_billing_id::text))
        AND item->>'billing_id' = p_billing_id::text
        AND COALESCE(NULLIF(item->>'billing_version', '')::bigint, 0) = p_lock_version
    )
    OR EXISTS (
      SELECT 1
      FROM public.boletim_approvals AS legacy
      WHERE legacy.status IN ('PENDENTE', 'APROVADO')
        AND legacy.billing_snapshot IS NULL
        AND legacy.billing_ids @> ARRAY[p_billing_id::text]
    );
$$;

COMMENT ON FUNCTION public.is_escort_billing_snapshotted(uuid, bigint) IS
  'PR5B.1-TX: detecta referência comercial imutável em billing_snapshot.';

CREATE OR REPLACE FUNCTION public.lock_service_orders_for_billings(
  p_billing_ids uuid[]
)
RETURNS integer[]
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_service_order_ids integer[];
  v_service_order_id integer;
  v_contract_ids uuid[];
  v_count integer;
BEGIN
  SELECT array_agg(DISTINCT service_order_id ORDER BY service_order_id)
  INTO v_service_order_ids
  FROM public.escort_billings
  WHERE id = ANY(p_billing_ids)
    AND service_order_id IS NOT NULL;

  IF v_service_order_ids IS NULL
     OR cardinality(v_service_order_ids) <> cardinality(p_billing_ids) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'PR5B1_TX_BILLING_SERVICE_ORDER_MEMBERSHIP_INVALID';
  END IF;

  FOREACH v_service_order_id IN ARRAY v_service_order_ids LOOP
    PERFORM pg_advisory_xact_lock(7411, v_service_order_id);
  END LOOP;

  PERFORM 1
  FROM public.service_orders
  WHERE id = ANY(v_service_order_ids)
  ORDER BY id
  FOR SHARE;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count <> cardinality(v_service_order_ids) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'PR5B1_TX_SERVICE_ORDER_MEMBERSHIP_STALE';
  END IF;

  -- Mesmo slot global de contrato usado por write_escort_billing_atomic:
  -- advisory -> service_orders -> escort_contracts -> escort_billings.
  BEGIN
    SELECT array_agg(DISTINCT contract_id ORDER BY contract_id)
    INTO v_contract_ids
    FROM (
      SELECT trim(so.escort_contract_id)::uuid AS contract_id
      FROM public.service_orders AS so
      WHERE so.id = ANY(v_service_order_ids)
        AND NULLIF(trim(COALESCE(so.escort_contract_id, '')), '') IS NOT NULL
    ) AS linked;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PR5B1_TX_INVALID_CONTRACT_ID';
  END;

  IF v_contract_ids IS NOT NULL THEN
    PERFORM 1
    FROM public.escort_contracts
    WHERE id = ANY(v_contract_ids)
    ORDER BY id
    FOR SHARE;
  END IF;

  RETURN v_service_order_ids;
END;
$$;

COMMENT ON FUNCTION public.lock_service_orders_for_billings(uuid[]) IS
  'PR5B.1-TX: ordem global advisory OS -> service_orders -> contracts antes de billing locks.';

CREATE OR REPLACE FUNCTION public.write_escort_billing_atomic(
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_billing_id uuid DEFAULT NULL,
  p_service_order_id integer DEFAULT NULL,
  p_expected_version bigint DEFAULT NULL,
  p_actor jsonb DEFAULT '{}'::jsonb
)
RETURNS SETOF public.escort_billings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_action text := upper(trim(COALESCE(p_action, '')));
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_current public.escort_billings%ROWTYPE;
  v_result public.escort_billings%ROWTYPE;
  v_so public.service_orders%ROWTYPE;
  v_contract public.escort_contracts%ROWTYPE;
  v_target_id uuid;
  v_service_order_id integer := p_service_order_id;
  v_contract_id uuid;
  v_km_initial numeric;
  v_km_final numeric;
  v_is_snapshot boolean := false;
  v_keys text[];
  v_allowed_keys text[];
  v_columns text;
  v_select_columns text;
  v_assignments text;
  v_row_count integer := 0;
  v_actor_user_id integer;
  v_actor_name text := NULLIF(p_actor->>'user_name', '');
  v_actor_role text := NULLIF(p_actor->>'user_role', '');
  v_actor_reason text := NULLIF(p_actor->>'reason', '');
  v_actor_ip text := NULLIF(p_actor->>'ip_address', '');
  v_financial_keys constant text[] := ARRAY[
    'service_order_id', 'client_id', 'client_name', 'contract_id',
    'km_inicial', 'km_final', 'km_carregado', 'km_vazio', 'km_total',
    'km_faturado', 'horas_missao', 'horas_estadia', 'teve_pernoite',
    'horario_inicio', 'horario_fim', 'is_noturno',
    'despesas_pedagio', 'despesas_combustivel', 'despesas_outras',
    'foto_hodometro_inicio', 'foto_hodometro_fim',
    'fat_km', 'fat_estadia', 'fat_pernoite', 'fat_adicional_noturno',
    'fat_total', 'pag_vrp', 'pag_periculosidade',
    'pag_adicional_noturno', 'pag_reembolsos', 'pag_total', 'status',
    'vigilante_id', 'vigilante_name', 'notas', 'created_by', 'route_id',
    'boletim_numero', 'boletim_gerado', 'data_missao', 'origem', 'destino',
    'placa_viatura', 'placa_escoltado', 'motorista_escoltado', 'observacoes',
    'horario_agendado', 'horario_inicio_considerado', 'horas_trabalhadas',
    'km_franquia', 'km_excedente', 'valor_franquia', 'valor_km_extra',
    'fat_km_carregado', 'fat_km_vazio', 'fat_diaria',
    'resultado_bruto', 'resultado_liquido', 'margem_percentual',
    'desp_pedagio', 'desp_combustivel', 'desp_outras', 'desp_total',
    'revisado_por', 'revisado_em', 'motivo_rejeicao',
    'vigilante2_id', 'vigilante2_name', 'fat_acionamento',
    'fat_hora_extra', 'receitas_os', 'os_number', 'edit_reason'
  ];
BEGIN
  IF jsonb_typeof(v_payload) <> 'object' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PR5B1_TX_INVALID_PAYLOAD: payload deve ser objeto JSON';
  END IF;

  IF v_action NOT IN (
    'WRITE_OFFICIAL', 'UPDATE_OPEN', 'WRITE_CANCELLED', 'WRITE_REFUSED', 'DELETE_OPEN',
    'FREEZE_COMMERCIAL', 'REOPEN_APPROVED', 'REOPEN_CANCELLED',
    'RELEASE_REBILL', 'METADATA_OPEN'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PR5B1_TX_INVALID_ACTION: ação não permitida';
  END IF;

  BEGIN
    v_actor_user_id := NULLIF(p_actor->>'user_id', '')::integer;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PR5B1_TX_INVALID_ACTOR: user_id inválido';
  END;

  -- Ordem global: advisory da OS -> service_order -> contrato -> billing.
  -- UPDATE_OPEN e DELETE_OPEN compartilham exatamente o mesmo prefixo de locks.
  IF p_billing_id IS NOT NULL THEN
    SELECT service_order_id
    INTO v_service_order_id
    FROM public.escort_billings
    WHERE id = p_billing_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = 'PR5B1_TX_BILLING_NOT_FOUND';
    END IF;
    IF p_service_order_id IS NOT NULL
       AND p_service_order_id IS DISTINCT FROM v_service_order_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PR5B1_TX_SERVICE_ORDER_REPARENT_BLOCKED';
    END IF;
  END IF;

  IF v_service_order_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PR5B1_TX_SERVICE_ORDER_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(7411, v_service_order_id);

  SELECT *
  INTO v_so
  FROM public.service_orders
  WHERE id = v_service_order_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'PR5B1_TX_SERVICE_ORDER_NOT_FOUND';
  END IF;

  IF NULLIF(trim(COALESCE(v_so.escort_contract_id, '')), '') IS NULL THEN
    IF v_action IN (
      'WRITE_OFFICIAL', 'UPDATE_OPEN', 'WRITE_CANCELLED', 'WRITE_REFUSED', 'DELETE_OPEN'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PR5B1_TX_CONTRACT_REQUIRED: OS sem escort_contract_id';
    END IF;
  ELSE
    BEGIN
      v_contract_id := trim(v_so.escort_contract_id)::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PR5B1_TX_INVALID_CONTRACT_ID';
    END;

    SELECT *
    INTO v_contract
    FROM public.escort_contracts
    WHERE id = v_contract_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '23503',
        MESSAGE = 'PR5B1_TX_CONTRACT_NOT_FOUND';
    END IF;
  END IF;

  IF p_billing_id IS NOT NULL THEN
    SELECT *
    INTO v_current
    FROM public.escort_billings
    WHERE id = p_billing_id
      AND service_order_id = v_service_order_id
    FOR UPDATE;
  ELSE
    SELECT *
    INTO v_current
    FROM public.escort_billings
    WHERE service_order_id = v_service_order_id
    FOR UPDATE;
  END IF;

  IF FOUND THEN
    v_target_id := v_current.id;
    v_service_order_id := v_current.service_order_id;

    IF p_expected_version IS NULL OR p_expected_version <> v_current.lock_version THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = format(
          'PR5B1_TX_STALE_VERSION: esperado=%s atual=%s',
          COALESCE(p_expected_version::text, 'null'),
          v_current.lock_version
        );
    END IF;

    v_is_snapshot := public.is_escort_billing_snapshotted(
      v_current.id,
      v_current.lock_version
    );

    IF v_action IN (
      'WRITE_OFFICIAL', 'UPDATE_OPEN', 'WRITE_CANCELLED', 'WRITE_REFUSED',
      'DELETE_OPEN', 'METADATA_OPEN'
    ) AND (
      upper(trim(COALESCE(v_current.status, ''))) IN (
        'APROVADA', 'FATURADO', 'FATURADA', 'PAGO', 'CANCELADO', 'CANCELADA'
      )
      OR v_is_snapshot
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'PR5B1_TX_BILLING_PROTECTED: frozen ou presente em snapshot';
    END IF;
  ELSE
    IF p_billing_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = 'PR5B1_TX_BILLING_NOT_FOUND';
    END IF;
    IF v_action NOT IN ('WRITE_OFFICIAL', 'WRITE_CANCELLED', 'WRITE_REFUSED') THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = 'PR5B1_TX_BILLING_NOT_FOUND';
    END IF;
    IF p_expected_version IS NOT NULL AND p_expected_version <> 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'PR5B1_TX_STALE_VERSION: insert exige versão nula ou zero';
    END IF;
  END IF;

  IF v_action IN ('WRITE_OFFICIAL', 'UPDATE_OPEN', 'WRITE_CANCELLED', 'WRITE_REFUSED') THEN
    IF v_current.id IS NOT NULL
       AND NULLIF(v_payload->>'service_order_id', '') IS NOT NULL
       AND (v_payload->>'service_order_id')::integer <> v_current.service_order_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PR5B1_TX_SERVICE_ORDER_REPARENT_BLOCKED';
    END IF;

    IF COALESCE(
         NULLIF(v_payload->>'contract_id', '')::uuid,
         v_current.contract_id
       ) IS DISTINCT FROM v_contract_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PR5B1_TX_CONTRACT_MISMATCH';
    END IF;

    IF NULLIF(v_payload->>'client_id', '') IS NOT NULL
       AND (v_payload->>'client_id')::integer IS DISTINCT FROM v_so.client_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PR5B1_TX_CLIENT_MISMATCH';
    END IF;

    IF v_action = 'WRITE_REFUSED' THEN
      -- A RPC materializa o contrato completo da recusada; campos omitidos pelo
      -- caller nunca preservam resíduos do billing anterior.
      v_payload := v_payload || jsonb_build_object(
        'status', 'CANCELADO',
        'km_inicial', 0, 'km_final', 0, 'km_carregado', 0, 'km_vazio', 0,
        'km_total', 0, 'km_faturado', 0, 'km_franquia', 0, 'km_excedente', 0,
        'horas_missao', 0, 'horas_trabalhadas', 0, 'horas_estadia', 0,
        'teve_pernoite', false, 'is_noturno', false,
        'fat_acionamento', 0, 'fat_hora_extra', 0, 'fat_km', 0,
        'fat_km_carregado', 0, 'fat_km_vazio', 0, 'fat_estadia', 0,
        'fat_pernoite', 0, 'fat_diaria', 0, 'fat_adicional_noturno', 0,
        'fat_total', 0, 'valor_franquia', 0, 'valor_km_extra', 0,
        'pag_vrp', 0, 'pag_periculosidade', 0, 'pag_adicional_noturno', 0,
        'pag_reembolsos', 0, 'pag_total', 0,
        'despesas_pedagio', 0, 'despesas_combustivel', 0, 'despesas_outras', 0,
        'desp_pedagio', 0, 'desp_combustivel', 0, 'desp_outras', 0,
        'desp_total', 0, 'receitas_os', 0,
        'resultado_bruto', 0, 'resultado_liquido', 0, 'margem_percentual', 0
      );
    END IF;

    IF v_action IN ('WRITE_OFFICIAL', 'UPDATE_OPEN') THEN
      IF lower(COALESCE(v_so.status, '')) NOT IN ('concluida', 'concluída')
         AND lower(COALESCE(v_so.mission_status, '')) NOT IN ('encerrada', 'finalizada') THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'PR5B1_TX_OS_NOT_CONCLUDED';
      END IF;
      IF v_so.mission_started_at IS NULL OR v_so.completed_date IS NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'PR5B1_TX_TIMESTAMPS_REQUIRED';
      END IF;
      IF v_so.completed_date < v_so.mission_started_at THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'PR5B1_TX_INVALID_TIMESTAMPS';
      END IF;

      -- Leitura factual sem FOR SHARE: o prefixo global já serializa a OS
      -- (advisory + service_orders + contract + billing). Evita lock extra
      -- após billing, que poderia inverter a ordem com writers satélites.
      SELECT km_value
      INTO v_km_initial
      FROM public.mission_photos
      WHERE service_order_id = v_so.id
        AND step = 'km_chegada'
      ORDER BY created_at DESC NULLS LAST, id::text DESC
      LIMIT 1;
      IF COALESCE(v_km_initial, 0) <= 0 THEN
        SELECT km_value
        INTO v_km_initial
        FROM public.mission_photos
        WHERE service_order_id = v_so.id
          AND step = 'km_saida'
        ORDER BY created_at DESC NULLS LAST, id::text DESC
        LIMIT 1;
      END IF;

      SELECT km_value
      INTO v_km_final
      FROM public.mission_photos
      WHERE service_order_id = v_so.id
        AND step = 'km_final'
      ORDER BY created_at DESC NULLS LAST, id::text DESC
      LIMIT 1;

      IF COALESCE(v_km_initial, 0) <= 0 THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'PR5B1_TX_KM_INITIAL_REQUIRED';
      END IF;
      IF COALESCE(v_km_final, 0) <= 0 THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'PR5B1_TX_KM_FINAL_REQUIRED';
      END IF;
      IF v_km_final < v_km_initial THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'PR5B1_TX_KM_REVERSED';
      END IF;
      IF v_action = 'WRITE_OFFICIAL'
         AND COALESCE(v_payload->>'status', 'A_VERIFICAR') <> 'A_VERIFICAR' THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'PR5B1_TX_INVALID_OPEN_STATUS';
      END IF;
    ELSIF v_action = 'WRITE_CANCELLED' THEN
      IF COALESCE(v_contract.franquia_km, 0) <> 100
         OR COALESCE(v_contract.franquia_horas, 0) <> 3
         OR v_contract.status IS DISTINCT FROM 'Ativo' THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'PR5B1_TX_CANCELLED_CONTRACT_MUST_BE_100KM_3H';
      END IF;
      IF COALESCE(v_payload->>'status', 'CANCELADO') <> 'CANCELADO' THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'PR5B1_TX_INVALID_CANCELLED_STATUS';
      END IF;
    ELSE
      IF COALESCE(v_payload->>'status', 'CANCELADO') <> 'CANCELADO'
         OR EXISTS (
           SELECT 1
           FROM jsonb_each_text(v_payload) AS component(key, value)
           WHERE CASE
             WHEN (
               key LIKE 'fat_%'
               OR key LIKE 'pag_%'
               OR key LIKE 'desp_%'
               OR key LIKE 'despesas_%'
               OR key IN (
                 'receitas_os', 'resultado_bruto', 'resultado_liquido',
                 'margem_percentual', 'valor_franquia', 'valor_km_extra'
               )
             )
             THEN COALESCE(NULLIF(value, '')::numeric, 0) <> 0
             ELSE false
           END
         ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'PR5B1_TX_REFUSED_MUST_BE_ZERO';
      END IF;
    END IF;
  END IF;

  CASE v_action
    WHEN 'WRITE_OFFICIAL', 'WRITE_CANCELLED', 'WRITE_REFUSED' THEN
      v_allowed_keys := v_financial_keys;
    WHEN 'UPDATE_OPEN' THEN
      SELECT array_agg(key ORDER BY key)
      INTO v_allowed_keys
      FROM unnest(v_financial_keys) AS key
      WHERE key NOT IN (
        'service_order_id', 'contract_id', 'status', 'created_by',
        'boletim_numero', 'boletim_gerado'
      );
    WHEN 'FREEZE_COMMERCIAL' THEN
      IF v_current.id IS NULL
         OR upper(trim(COALESCE(v_current.status, ''))) NOT IN (
           'A_VERIFICAR', 'APROVADA', 'CANCELADO', 'CANCELADA'
         )
         OR (
           upper(trim(COALESCE(v_current.status, ''))) IN ('CANCELADO', 'CANCELADA')
           AND COALESCE(v_payload->>'status', '') <> 'CANCELADO'
         )
         OR (
           upper(trim(COALESCE(v_current.status, ''))) NOT IN ('CANCELADO', 'CANCELADA')
           AND COALESCE(v_payload->>'status', '') <> 'APROVADA'
         )
      THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'PR5B1_TX_INVALID_FREEZE';
      END IF;
      v_allowed_keys := ARRAY[
        'status', 'revisado_por', 'revisado_em',
        'boletim_numero', 'boletim_gerado'
      ];
    WHEN 'REOPEN_APPROVED' THEN
      IF v_current.id IS NULL
         OR upper(trim(COALESCE(v_current.status, ''))) <> 'APROVADA'
         OR COALESCE(v_payload->>'status', '') <> 'A_VERIFICAR'
         OR v_actor_name IS NULL OR v_actor_reason IS NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'PR5B1_TX_INVALID_REOPEN';
      END IF;
      v_allowed_keys := ARRAY[
        'status', 'revisado_por', 'revisado_em', 'boletim_gerado',
        'observacoes', 'notas'
      ];
    WHEN 'REOPEN_CANCELLED' THEN
      IF v_current.id IS NULL
         OR upper(trim(COALESCE(v_current.status, ''))) NOT IN ('CANCELADO', 'CANCELADA')
         OR COALESCE(v_payload->>'status', '') <> 'A_VERIFICAR'
         OR v_is_snapshot
         OR v_actor_name IS NULL OR v_actor_reason IS NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'PR5B1_TX_INVALID_CANCELLED_REOPEN';
      END IF;
      v_allowed_keys := ARRAY['status', 'observacoes', 'notas'];
    WHEN 'RELEASE_REBILL' THEN
      IF v_current.id IS NULL
         OR upper(trim(COALESCE(v_current.status, ''))) NOT IN ('FATURADO', 'FATURADA', 'PAGO')
         OR (
           upper(trim(COALESCE(v_current.status, ''))) IN ('CANCELADO', 'CANCELADA')
           AND COALESCE(v_payload->>'status', '') <> 'CANCELADO'
         )
         OR (
           upper(trim(COALESCE(v_current.status, ''))) NOT IN ('CANCELADO', 'CANCELADA')
           AND COALESCE(v_payload->>'status', '') <> 'APROVADA'
         )
         OR v_actor_name IS NULL OR v_actor_reason IS NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'PR5B1_TX_INVALID_REBILL_RELEASE';
      END IF;
      v_allowed_keys := ARRAY[
        'status', 'invoice_id', 'faturado_em', 'faturado_por',
        'pago_em', 'boletim_gerado'
      ];
    WHEN 'METADATA_OPEN' THEN
      v_allowed_keys := ARRAY[
        'client_name', 'vigilante_id', 'vigilante_name',
        'vigilante2_id', 'vigilante2_name', 'placa_viatura',
        'placa_escoltado', 'motorista_escoltado', 'origem', 'destino',
        'observacoes', 'notas', 'os_number', 'boletim_numero', 'boletim_gerado'
      ];
    WHEN 'DELETE_OPEN' THEN
      IF v_payload <> '{}'::jsonb THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'PR5B1_TX_DELETE_PAYLOAD_MUST_BE_EMPTY';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM public.financial_transactions
        WHERE origin_type = 'escort_billing'
          AND origin_id = v_target_id::text
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'PR5B1_TX_DELETE_BLOCKED_BY_LEDGER';
      END IF;
      DELETE FROM public.escort_billings WHERE id = v_target_id
      RETURNING * INTO v_result;
      RETURN NEXT v_result;
      RETURN;
  END CASE;

  SELECT COALESCE(array_agg(key ORDER BY key), ARRAY[]::text[])
  INTO v_keys
  FROM jsonb_object_keys(v_payload) AS key;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_keys) AS key
    WHERE NOT (key = ANY(v_allowed_keys))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PR5B1_TX_PAYLOAD_KEY_NOT_ALLOWED';
  END IF;

  IF cardinality(v_keys) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PR5B1_TX_EMPTY_PAYLOAD';
  END IF;

  SELECT
    string_agg(format('%I', key), ', ' ORDER BY key),
    string_agg(format('src.%I', key), ', ' ORDER BY key),
    string_agg(format('%1$I = src.%1$I', key), ', ' ORDER BY key)
  INTO v_columns, v_select_columns, v_assignments
  FROM unnest(v_keys) AS key;

  IF v_current.id IS NULL THEN
    EXECUTE format(
      'INSERT INTO public.escort_billings (%s) ' ||
      'SELECT %s FROM jsonb_populate_record(NULL::public.escort_billings, $1) AS src ' ||
      'RETURNING *',
      v_columns,
      v_select_columns
    )
    INTO v_result
    USING v_payload;
  ELSE
    EXECUTE format(
      'UPDATE public.escort_billings AS billing ' ||
      'SET %s, lock_version = billing.lock_version + 1 ' ||
      'FROM jsonb_populate_record(NULL::public.escort_billings, $1) AS src ' ||
      'WHERE billing.id = $2 RETURNING billing.*',
      v_assignments
    )
    INTO v_result
    USING v_payload, v_target_id;
  END IF;

  IF v_action IN ('REOPEN_APPROVED', 'REOPEN_CANCELLED', 'RELEASE_REBILL') THEN
    INSERT INTO public.system_audit_logs (
      user_id, user_name, user_role, action, target_id,
      target_type, details, ip_address
    ) VALUES (
      v_actor_user_id,
      v_actor_name,
      v_actor_role,
      v_action,
      v_result.id::text,
      'escort_billing',
      v_actor_reason,
      v_actor_ip
    );
  END IF;

  RETURN NEXT v_result;
END;
$$;

COMMENT ON FUNCTION public.write_escort_billing_atomic(
  text, jsonb, uuid, integer, bigint, jsonb
) IS 'PR5B.1-TX: check, lock_version e write de billing na mesma transação.';

CREATE OR REPLACE FUNCTION public.create_boletim_approval_atomic(
  p_token text,
  p_client_id integer,
  p_client_name text,
  p_client_email text,
  p_period_start date,
  p_period_end date,
  p_billing_ids text[],
  p_total_value numeric,
  p_os_count integer,
  p_sent_by text,
  p_sent_by_user_id integer,
  p_billing_snapshot jsonb
)
RETURNS SETOF public.boletim_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_result public.boletim_approvals%ROWTYPE;
  v_ids uuid[];
  v_service_order_ids integer[];
  v_snapshot_count integer;
  v_locked_count integer;
BEGIN
  IF jsonb_typeof(p_billing_snapshot) <> 'array'
     OR jsonb_array_length(p_billing_snapshot) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PR5B1_TX_INVALID_SNAPSHOT';
  END IF;

  SELECT
    array_agg((item->>'billing_id')::uuid ORDER BY (item->>'billing_id')::uuid),
    count(*)
  INTO v_ids, v_snapshot_count
  FROM jsonb_array_elements(p_billing_snapshot) AS item
  WHERE NULLIF(item->>'billing_id', '') IS NOT NULL
    AND NULLIF(item->>'billing_version', '') IS NOT NULL;

  IF v_ids IS NULL
     OR v_snapshot_count <> jsonb_array_length(p_billing_snapshot)
     OR cardinality(v_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(v_ids))) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PR5B1_TX_INVALID_SNAPSHOT_IDS';
  END IF;

  v_service_order_ids := public.lock_service_orders_for_billings(v_ids);

  PERFORM 1
  FROM public.escort_billings
  WHERE id = ANY(v_ids)
  ORDER BY id
  FOR UPDATE;
  GET DIAGNOSTICS v_locked_count = ROW_COUNT;

  IF v_locked_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_BILLING_NOT_FOUND';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.escort_billings
    WHERE id = ANY(v_ids)
      AND NOT (service_order_id = ANY(v_service_order_ids))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_MEMBERSHIP_STALE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_billing_snapshot) AS item
    JOIN public.escort_billings AS billing
      ON billing.id = (item->>'billing_id')::uuid
    WHERE billing.lock_version <> (item->>'billing_version')::bigint
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PR5B1_TX_STALE_SNAPSHOT_VERSION';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.escort_billings
    WHERE id = ANY(v_ids)
      AND upper(trim(COALESCE(status, ''))) IN ('APROVADA', 'FATURADO', 'FATURADA', 'PAGO')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_FROZEN_BILLING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.escort_billings AS billing
    JOIN public.service_orders AS service_order
      ON service_order.id = billing.service_order_id
    WHERE billing.id = ANY(v_ids)
      AND (
        NULLIF(trim(COALESCE(service_order.escort_contract_id, '')), '') IS NULL
        OR billing.contract_id::text <> service_order.escort_contract_id
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_CONTRACT_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.escort_billings AS billing
    JOIN public.service_orders AS service_order
      ON service_order.id = billing.service_order_id
    WHERE billing.id = ANY(v_ids)
      AND (
        billing.client_id IS DISTINCT FROM p_client_id
        OR service_order.client_id IS DISTINCT FROM p_client_id
        OR lower(COALESCE(service_order.status, '')) = 'recusada'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_CLIENT_OR_REFUSED_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_billing_snapshot) AS item
    JOIN public.escort_billings AS billing
      ON billing.id = (item->>'billing_id')::uuid
    WHERE round(COALESCE((item->>'fat_acionamento')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.fat_acionamento, 0), 2)
       OR round(COALESCE((item->>'fat_hora_extra')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.fat_hora_extra, 0), 2)
       OR round(COALESCE((item->>'fat_km')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.fat_km, 0), 2)
       OR round(COALESCE((item->>'fat_adicional_noturno')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.fat_adicional_noturno, 0), 2)
       OR round(COALESCE((item->>'fat_estadia')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.fat_estadia, 0), 2)
       OR round(COALESCE((item->>'fat_pernoite')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.fat_pernoite, 0), 2)
       OR round(COALESCE((item->>'despesas_pedagio')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.despesas_pedagio, 0), 2)
       OR round(COALESCE((item->>'despesas_outras')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.despesas_outras, 0), 2)
       OR round(COALESCE((item->>'receitas_os')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.receitas_os, 0), 2)
       OR round(COALESCE((item->>'total')::numeric, 0), 2)
            IS DISTINCT FROM round(COALESCE(billing.fat_total, 0), 2)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_COMPONENT_MISMATCH';
  END IF;

  IF COALESCE(p_os_count, -1) <> v_snapshot_count
     OR round(COALESCE(p_total_value, 0), 2) IS DISTINCT FROM (
       SELECT round(COALESCE(sum((item->>'total')::numeric), 0), 2)
       FROM jsonb_array_elements(p_billing_snapshot) AS item
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_TOTAL_OR_COUNT_MISMATCH';
  END IF;

  IF ARRAY(SELECT unnest(p_billing_ids) ORDER BY 1)
     IS DISTINCT FROM ARRAY(SELECT id::text FROM unnest(v_ids) AS id ORDER BY 1) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PR5B1_TX_SNAPSHOT_BILLING_IDS_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.boletim_approvals
    WHERE status IN ('PENDENTE', 'APROVADO')
      AND billing_ids && p_billing_ids
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'PR5B1_TX_ACTIVE_APPROVAL_CONFLICT';
  END IF;

  INSERT INTO public.boletim_approvals (
    token, client_id, client_name, client_email,
    period_start, period_end, billing_ids, total_value,
    os_count, status, sent_by, sent_by_user_id, billing_snapshot
  ) VALUES (
    p_token, p_client_id, p_client_name, p_client_email,
    p_period_start, p_period_end, p_billing_ids, p_total_value,
    COALESCE(p_os_count, cardinality(p_billing_ids)),
    'PENDENTE', p_sent_by, p_sent_by_user_id, p_billing_snapshot
  )
  RETURNING * INTO v_result;

  RETURN NEXT v_result;
END;
$$;

COMMENT ON FUNCTION public.create_boletim_approval_atomic(
  text, integer, text, text, date, date, text[], numeric,
  integer, text, integer, jsonb
) IS 'PR5B.1-TX: locks ordenados, versão e criação imutável do snapshot.';

CREATE OR REPLACE FUNCTION public.freeze_boletim_billings_atomic(
  p_approval_id integer,
  p_approved_by_name text,
  p_approved_by_ip text,
  p_approved_at timestamptz
)
RETURNS SETOF public.escort_billings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_approval public.boletim_approvals%ROWTYPE;
  v_ids uuid[];
  v_service_order_ids integer[];
  v_initial_billing_ids text[];
  v_initial_snapshot jsonb;
  v_locked_count integer;
BEGIN
  SELECT *
  INTO v_approval
  FROM public.boletim_approvals
  WHERE id = p_approval_id;

  IF NOT FOUND
     OR v_approval.status <> 'PENDENTE'
     OR v_approval.billing_snapshot IS NULL
     OR jsonb_typeof(v_approval.billing_snapshot) <> 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PR5B1_TX_APPROVAL_NOT_PENDING_OR_SNAPSHOT_MISSING';
  END IF;

  v_initial_billing_ids := v_approval.billing_ids;
  v_initial_snapshot := v_approval.billing_snapshot;

  SELECT array_agg(id::uuid ORDER BY id::uuid)
  INTO v_ids
  FROM unnest(v_approval.billing_ids) AS id;

  v_service_order_ids := public.lock_service_orders_for_billings(v_ids);

  PERFORM 1
  FROM public.escort_billings
  WHERE id = ANY(v_ids)
  ORDER BY id
  FOR UPDATE;
  GET DIAGNOSTICS v_locked_count = ROW_COUNT;

  IF v_ids IS NULL OR v_locked_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'PR5B1_TX_APPROVAL_BILLING_NOT_FOUND';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.escort_billings
    WHERE id = ANY(v_ids)
      AND NOT (service_order_id = ANY(v_service_order_ids))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PR5B1_TX_APPROVAL_MEMBERSHIP_STALE';
  END IF;

  SELECT *
  INTO v_approval
  FROM public.boletim_approvals
  WHERE id = p_approval_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_approval.status <> 'PENDENTE'
     OR v_approval.billing_ids IS DISTINCT FROM v_initial_billing_ids
     OR v_approval.billing_snapshot IS DISTINCT FROM v_initial_snapshot THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PR5B1_TX_APPROVAL_MEMBERSHIP_STALE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_approval.billing_snapshot) AS item
    JOIN public.escort_billings AS billing
      ON billing.id = (item->>'billing_id')::uuid
    WHERE billing.lock_version <>
      COALESCE(NULLIF(item->>'billing_version', '')::bigint, 0)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PR5B1_TX_APPROVAL_STALE_BILLING';
  END IF;

  UPDATE public.boletim_approvals
  SET
    status = 'APROVADO',
    approved_at = COALESCE(p_approved_at, now()),
    approved_by_name = p_approved_by_name,
    approved_by_ip = p_approved_by_ip
  WHERE id = p_approval_id;

  RETURN QUERY
  UPDATE public.escort_billings
  SET
    status = CASE
      WHEN upper(trim(COALESCE(status, ''))) IN ('CANCELADO', 'CANCELADA')
        THEN 'CANCELADO'
      ELSE 'APROVADA'
    END,
    revisado_por = 'Cliente: ' || COALESCE(p_approved_by_name, v_approval.client_name, 'Cliente'),
    revisado_em = COALESCE(p_approved_at, now()),
    lock_version = lock_version + 1
  WHERE id = ANY(v_ids)
  RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.freeze_boletim_billings_atomic(
  integer, text, text, timestamptz
) IS 'PR5B.1-TX: congela todos os billings do approval em uma transação.';

CREATE OR REPLACE FUNCTION public.mark_escort_billings_invoiced_atomic(
  p_billing_ids uuid[],
  p_invoice_id integer,
  p_faturado_em timestamptz,
  p_faturado_por text
)
RETURNS SETOF public.escort_billings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_ids uuid[];
  v_service_order_ids integer[];
  v_locked_count integer;
  v_invoice_client_id integer;
BEGIN
  SELECT array_agg(id ORDER BY id)
  INTO v_ids
  FROM unnest(p_billing_ids) AS id;

  IF v_ids IS NULL OR cardinality(v_ids) = 0
     OR cardinality(v_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(v_ids))) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PR5B1_TX_INVALID_INVOICE_BILLING_IDS';
  END IF;

  v_service_order_ids := public.lock_service_orders_for_billings(v_ids);

  PERFORM 1
  FROM public.escort_billings
  WHERE id = ANY(v_ids)
  ORDER BY id
  FOR UPDATE;
  GET DIAGNOSTICS v_locked_count = ROW_COUNT;

  IF v_locked_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'PR5B1_TX_INVOICE_BILLING_NOT_FOUND';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.escort_billings
    WHERE id = ANY(v_ids)
      AND (
        NOT (service_order_id = ANY(v_service_order_ids))
        OR (invoice_id IS NOT NULL AND invoice_id <> p_invoice_id)
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PR5B1_TX_INVOICE_MEMBERSHIP_STALE';
  END IF;

  SELECT client_id
  INTO v_invoice_client_id
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'PR5B1_TX_INVOICE_NOT_FOUND';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.escort_billings
    WHERE id = ANY(v_ids)
      AND client_id IS DISTINCT FROM v_invoice_client_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PR5B1_TX_INVOICE_CLIENT_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.escort_billings
    WHERE id = ANY(v_ids)
      AND upper(trim(COALESCE(status, ''))) NOT IN (
        'APROVADA', 'FATURADO', 'CANCELADO', 'CANCELADA'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PR5B1_TX_INVALID_INVOICE_BATCH_STATUS';
  END IF;

  RETURN QUERY
  UPDATE public.escort_billings
  SET
    status = CASE
      WHEN upper(trim(COALESCE(status, ''))) IN ('CANCELADO', 'CANCELADA')
        THEN 'CANCELADO'
      ELSE 'FATURADO'
    END,
    invoice_id = p_invoice_id,
    faturado_em = COALESCE(p_faturado_em, now()),
    faturado_por = p_faturado_por,
    lock_version = lock_version + 1
  WHERE id = ANY(v_ids)
  RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.mark_escort_billings_invoiced_atomic(
  uuid[], integer, timestamptz, text
) IS 'PR5B.1-TX: vincula invoice a lote misto em uma transação.';

CREATE OR REPLACE FUNCTION public.transition_invoice_billings_atomic(
  p_invoice_id integer,
  p_action text,
  p_transitioned_at timestamptz,
  p_actor text
)
RETURNS SETOF public.escort_billings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_action text := upper(trim(COALESCE(p_action, '')));
  v_ids uuid[];
  v_service_order_ids integer[];
  v_locked_count integer;
  v_invoice_client_id integer;
BEGIN
  SELECT array_agg(id ORDER BY id)
  INTO v_ids
  FROM public.escort_billings
  WHERE invoice_id = p_invoice_id;

  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RETURN;
  END IF;

  v_service_order_ids := public.lock_service_orders_for_billings(v_ids);

  PERFORM 1
  FROM public.escort_billings
  WHERE id = ANY(v_ids)
  ORDER BY id
  FOR UPDATE;
  GET DIAGNOSTICS v_locked_count = ROW_COUNT;

  IF v_locked_count <> cardinality(v_ids)
     OR EXISTS (
       SELECT 1
       FROM public.escort_billings
       WHERE id = ANY(v_ids)
         AND (
           invoice_id IS DISTINCT FROM p_invoice_id
           OR NOT (service_order_id = ANY(v_service_order_ids))
         )
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PR5B1_TX_INVOICE_MEMBERSHIP_STALE';
  END IF;

  SELECT client_id
  INTO v_invoice_client_id
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'PR5B1_TX_INVOICE_NOT_FOUND';
  END IF;

  IF (
    SELECT count(*)
    FROM public.escort_billings
    WHERE invoice_id = p_invoice_id
  ) <> cardinality(v_ids) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PR5B1_TX_INVOICE_MEMBERSHIP_STALE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.escort_billings
    WHERE id = ANY(v_ids)
      AND client_id IS DISTINCT FROM v_invoice_client_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PR5B1_TX_INVOICE_CLIENT_MISMATCH';
  END IF;

  IF v_action = 'MARK_PAID' THEN
    IF EXISTS (
      SELECT 1 FROM public.escort_billings
      WHERE id = ANY(v_ids)
        AND upper(trim(COALESCE(status, ''))) NOT IN (
          'FATURADO', 'FATURADA', 'PAGO', 'CANCELADO', 'CANCELADA'
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'PR5B1_TX_INVALID_PAID_BATCH_STATUS';
    END IF;
  ELSIF v_action = 'RELEASE_REBILL' THEN
    IF EXISTS (
      SELECT 1 FROM public.escort_billings
      WHERE id = ANY(v_ids)
        AND upper(trim(COALESCE(status, ''))) NOT IN (
          'APROVADA', 'FATURADO', 'FATURADA', 'PAGO', 'CANCELADO', 'CANCELADA'
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'PR5B1_TX_INVALID_RELEASE_BATCH_STATUS';
    END IF;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PR5B1_TX_INVALID_INVOICE_BATCH_ACTION';
  END IF;

  IF v_action = 'MARK_PAID' THEN
    RETURN QUERY
    UPDATE public.escort_billings
    SET
      status = CASE
        WHEN upper(trim(COALESCE(status, ''))) IN ('CANCELADO', 'CANCELADA')
          THEN 'CANCELADO'
        ELSE 'PAGO'
      END,
      pago_em = COALESCE(p_transitioned_at, now()),
      lock_version = lock_version + 1
    WHERE id = ANY(v_ids)
    RETURNING *;
  ELSE
    RETURN QUERY
    UPDATE public.escort_billings
    SET
      status = CASE
        WHEN upper(trim(COALESCE(status, ''))) IN ('CANCELADO', 'CANCELADA')
          THEN 'CANCELADO'
        ELSE 'APROVADA'
      END,
      invoice_id = NULL,
      faturado_em = NULL,
      faturado_por = NULL,
      pago_em = NULL,
      boletim_gerado = false,
      lock_version = lock_version + 1
    WHERE id = ANY(v_ids)
    RETURNING *;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.transition_invoice_billings_atomic(
  integer, text, timestamptz, text
) IS 'PR5B.1-TX: pagamento/desvinculação de invoice mista em uma transação.';

ALTER FUNCTION public.is_escort_billing_snapshotted(uuid, bigint)
  OWNER TO torres_billing_rpc_owner;
ALTER FUNCTION public.lock_service_orders_for_billings(uuid[])
  OWNER TO torres_billing_rpc_owner;
ALTER FUNCTION public.write_escort_billing_atomic(
  text, jsonb, uuid, integer, bigint, jsonb
) OWNER TO torres_billing_rpc_owner;
ALTER FUNCTION public.create_boletim_approval_atomic(
  text, integer, text, text, date, date, text[], numeric,
  integer, text, integer, jsonb
) OWNER TO torres_billing_rpc_owner;
ALTER FUNCTION public.freeze_boletim_billings_atomic(
  integer, text, text, timestamptz
) OWNER TO torres_billing_rpc_owner;
ALTER FUNCTION public.mark_escort_billings_invoiced_atomic(
  uuid[], integer, timestamptz, text
) OWNER TO torres_billing_rpc_owner;
ALTER FUNCTION public.transition_invoice_billings_atomic(
  integer, text, timestamptz, text
) OWNER TO torres_billing_rpc_owner;

-- Reafirma privilégios após a transferência de ownership das RPCs.
GRANT USAGE ON SCHEMA public TO torres_billing_rpc_owner;
GRANT SELECT, UPDATE ON
  public.service_orders, public.mission_photos, public.escort_contracts
  TO torres_billing_rpc_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escort_billings
  TO torres_billing_rpc_owner;
GRANT SELECT, INSERT, UPDATE ON public.boletim_approvals
  TO torres_billing_rpc_owner;
GRANT SELECT, UPDATE ON public.invoices TO torres_billing_rpc_owner;
GRANT INSERT ON public.system_audit_logs TO torres_billing_rpc_owner;
GRANT SELECT ON public.financial_transactions TO torres_billing_rpc_owner;
GRANT USAGE, SELECT ON SEQUENCE
  public.boletim_approvals_id_seq,
  public.system_audit_logs_id_seq
  TO torres_billing_rpc_owner;

-- Reafirma policies após ownership (idempotente).
DROP POLICY IF EXISTS torres_billing_rpc_owner_all ON public.escort_billings;
CREATE POLICY torres_billing_rpc_owner_all ON public.escort_billings
  FOR ALL TO torres_billing_rpc_owner
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS torres_billing_rpc_owner_select ON public.service_orders;
CREATE POLICY torres_billing_rpc_owner_select ON public.service_orders
  FOR ALL TO torres_billing_rpc_owner
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS torres_billing_rpc_owner_select ON public.mission_photos;
CREATE POLICY torres_billing_rpc_owner_select ON public.mission_photos
  FOR ALL TO torres_billing_rpc_owner
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS torres_billing_rpc_owner_select ON public.escort_contracts;
CREATE POLICY torres_billing_rpc_owner_select ON public.escort_contracts
  FOR ALL TO torres_billing_rpc_owner
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS torres_billing_rpc_owner_write ON public.boletim_approvals;
CREATE POLICY torres_billing_rpc_owner_write ON public.boletim_approvals
  FOR ALL TO torres_billing_rpc_owner
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS torres_billing_rpc_owner_write ON public.invoices;
CREATE POLICY torres_billing_rpc_owner_write ON public.invoices
  FOR ALL TO torres_billing_rpc_owner
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS torres_billing_rpc_owner_insert ON public.system_audit_logs;
CREATE POLICY torres_billing_rpc_owner_insert ON public.system_audit_logs
  FOR INSERT TO torres_billing_rpc_owner
  WITH CHECK (true);
DROP POLICY IF EXISTS torres_billing_rpc_owner_select ON public.financial_transactions;
CREATE POLICY torres_billing_rpc_owner_select ON public.financial_transactions
  FOR SELECT TO torres_billing_rpc_owner
  USING (true);

REVOKE ALL ON FUNCTION public.write_escort_billing_atomic(
  text, jsonb, uuid, integer, bigint, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_escort_billing_snapshotted(uuid, bigint)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_service_orders_for_billings(uuid[])
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_boletim_approval_atomic(
  text, integer, text, text, date, date, text[], numeric,
  integer, text, integer, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.freeze_boletim_billings_atomic(
  integer, text, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_escort_billings_invoiced_atomic(
  uuid[], integer, timestamptz, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_invoice_billings_atomic(
  integer, text, timestamptz, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.write_escort_billing_atomic(
  text, jsonb, uuid, integer, bigint, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_escort_billing_snapshotted(uuid, bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_boletim_approval_atomic(
  text, integer, text, text, date, date, text[], numeric,
  integer, text, integer, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.freeze_boletim_billings_atomic(
  integer, text, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_escort_billings_invoiced_atomic(
  uuid[], integer, timestamptz, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_invoice_billings_atomic(
  integer, text, timestamptz, text
) TO service_role;

-- Fail-closed: nunca expor RPCs TX a anon/authenticated.
REVOKE ALL ON FUNCTION public.write_escort_billing_atomic(
  text, jsonb, uuid, integer, bigint, jsonb
) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.is_escort_billing_snapshotted(uuid, bigint)
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_service_orders_for_billings(uuid[])
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_boletim_approval_atomic(
  text, integer, text, text, date, date, text[], numeric,
  integer, text, integer, jsonb
) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.freeze_boletim_billings_atomic(
  integer, text, text, timestamptz
) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_escort_billings_invoiced_atomic(
  uuid[], integer, timestamptz, text
) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_invoice_billings_atomic(
  integer, text, timestamptz, text
) FROM anon, authenticated;

COMMIT;
