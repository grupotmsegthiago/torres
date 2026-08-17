-- Recuperação auditada: OS reabertas por engano no force de boletim
-- (reason = 'Reenvio forçado de boletim de medição') voltam para APROVADA.
-- Idempotente: só afeta status atual A_VERIFICAR com auditoria correspondente.
--
-- Hosted: função write_escort_billing_atomic pertence a torres_billing_rpc_owner.
-- Este script assume executor postgres (SQL Editor / migration runner).

BEGIN;

GRANT torres_billing_rpc_owner TO CURRENT_USER WITH INHERIT FALSE;
GRANT torres_billing_rpc_owner TO CURRENT_USER WITH SET TRUE;
GRANT SELECT ON public.system_audit_logs TO torres_billing_rpc_owner;
GRANT EXECUTE ON FUNCTION public.write_escort_billing_atomic(text, jsonb, uuid, integer, bigint, jsonb)
  TO CURRENT_USER;

DO $$
DECLARE
  r record;
  v_billing public.escort_billings%ROWTYPE;
  v_restored integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT sal.target_id AS billing_id
    FROM public.system_audit_logs AS sal
    WHERE sal.action = 'REOPEN_APPROVED'
      AND sal.target_type = 'escort_billing'
      AND sal.details = 'Reenvio forçado de boletim de medição'
  LOOP
    SELECT * INTO v_billing
    FROM public.escort_billings
    WHERE id = r.billing_id::uuid;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF upper(trim(COALESCE(v_billing.status, ''))) <> 'A_VERIFICAR' THEN
      CONTINUE;
    END IF;

    PERFORM 1 FROM public.write_escort_billing_atomic(
      'FREEZE_COMMERCIAL',
      jsonb_build_object(
        'status', 'APROVADA',
        'revisado_por', 'recuperacao-aprovada-interna',
        'revisado_em', now(),
        'boletim_gerado', false
      ),
      v_billing.id,
      v_billing.service_order_id,
      v_billing.lock_version,
      jsonb_build_object(
        'user_id', null,
        'user_name', 'sistema',
        'user_role', 'system',
        'reason', 'Recuperação: APROVADA interna indevidamente reaberta no force de boletim',
        'ip_address', null
      )
    );

    INSERT INTO public.system_audit_logs (
      user_id, user_name, user_role, action, target_id,
      target_type, details, ip_address
    ) VALUES (
      null,
      'sistema',
      'system',
      'RESTORE_APPROVED_INTERNAL',
      v_billing.id::text,
      'escort_billing',
      'Recuperação: APROVADA interna indevidamente reaberta no force de boletim',
      null
    );

    v_restored := v_restored + 1;
  END LOOP;

  RAISE NOTICE 'restore_aprovada_interna: % billing(s) restaurado(s)', v_restored;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.write_escort_billing_atomic(text, jsonb, uuid, integer, bigint, jsonb)
  FROM CURRENT_USER;
REVOKE SELECT ON public.system_audit_logs FROM torres_billing_rpc_owner;
REVOKE SET OPTION FOR torres_billing_rpc_owner FROM CURRENT_USER;
REVOKE INHERIT OPTION FOR torres_billing_rpc_owner FROM CURRENT_USER;

COMMIT;
