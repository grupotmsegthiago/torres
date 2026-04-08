-- =============================================
-- CONFIGURAÇÃO SUPABASE — TMSEGo / Torres VP
-- Rodar no SQL Editor do Supabase Dashboard
-- =============================================

-- 1. FUNÇÃO exec_sql (necessária para DDL automático no startup)
CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS void AS $$
BEGIN
  EXECUTE query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. FUNÇÃO calc_mission_elapsed_hours (cálculo de horas de missão)
CREATE OR REPLACE FUNCTION calc_mission_elapsed_hours(p_os_id integer)
RETURNS numeric AS $$
  SELECT COALESCE(
    EXTRACT(EPOCH FROM (
      COALESCE(completed_date, (NOW() AT TIME ZONE 'America/Sao_Paulo')::timestamp) - mission_started_at
    )) / 3600.0,
    0
  )
  FROM service_orders WHERE id = p_os_id;
$$ LANGUAGE sql STABLE;

-- 3. REALTIME — Adicionar tabelas à publicação
-- (Ignora silenciosamente se já existirem)
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'service_orders', 'mission_costs', 'mission_updates', 'mission_acceptance',
    'clients', 'employees', 'vehicles', 'vehicle_fueling',
    'financial_transactions', 'escort_billings', 'billing_alerts',
    'chat_conversations', 'chat_messages', 'chat_presence',
    'invoices', 'users', 'ponto_registros', 'timesheets', 'holerites',
    'audit_logs', 'weapon_kits', 'employee_documents', 'system_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
      RAISE NOTICE 'Added % to realtime', t;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Table % already in realtime or does not exist', t;
    END;
  END LOOP;
END $$;

-- 4. VERIFICAR — Confirmar quais tabelas estão no Realtime
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- 5. NOTIFICAR PostgREST para recarregar o schema cache
NOTIFY pgrst, 'reload schema';
