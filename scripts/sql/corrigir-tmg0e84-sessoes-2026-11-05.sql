-- Correção de dados: TMG0E84 / TOR-1178 / TOR-1215
-- Diagnóstico (America/Sao_Paulo, 2026-11-05 ~12:10):
--
-- vehicles:
--   id=17 TMG0E84 status=disponível
--   id=19 TMG0B94 status=em_uso
--
-- service_orders:
--   TOR-1178 (id=1572) vehicle_id=19 TMG0B94
--     status=em_andamento mission_status=em_transito_destino
--     mission_started_at=2026-11-05 09:59
--     agentes=CLAUDEANO(56) + REINALDO(59) cliente=RJC
--   TOR-1215 (id=1609) vehicle_id=17 TMG0E84
--     status=em_andamento mission_status=checkin_veiculo_escoltado
--     mission_started_at=NULL
--     agentes=JEANDRO(25) + HERMISON(47) cliente=OMEGA
--
-- driver_sessions ATIVAS (corrupção):
--   id=1068 vehicle_id=17 TMG0E84 driver=56 partner=59  ← ERRADA
--     (equipe da TOR-1178 presa na placa da Omega)
--   id=1063 vehicle_id=19 TMG0B94 driver=56 partner=59  ← correta p/ TOR-1178
--
-- Efeito: cartão da TMG0E84 mostrava TOR-1215 (vehicle_id), mas sessão +
-- mission_updates de Reinaldo/TOR-1178 vazavam no mapa/WhatsApp da mesma placa.
--
-- Rodar no SQL Editor do Supabase (MCP execute_sql é read-only para UPDATE).

BEGIN;

-- 1) Encerra a sessão fantasma na TMG0E84.
UPDATE public.driver_sessions
SET
  status = 'finalizado',
  ended_at = COALESCE(ended_at, NOW())
WHERE id = 1068
  AND vehicle_id = 17
  AND status = 'ativo'
  AND driver_id = 56
  AND partner_id = 59;

-- 2) Vínculos de OS já estão corretos (1178→19, 1215→17). Sem UPDATE em service_orders.
--    Se no futuro TOR-1178 voltar para vehicle_id=17 com TOR-1215 aberta, preferir:
--    UPDATE service_orders SET vehicle_id = NULL WHERE id = 1609 AND os_number = 'TOR-1215';
--    (só se a operação confirmar que a Omega não usa a TMG0E84 agora.)

COMMIT;

-- 3) Auditoria pós-correção
SELECT id, vehicle_id, vehicle_plate, driver_id, partner_id, status, started_at, ended_at
FROM driver_sessions
WHERE id IN (1063, 1068) OR (vehicle_id IN (17, 19) AND status = 'ativo')
ORDER BY id;

SELECT id, os_number, vehicle_id, status, mission_status, mission_started_at,
       assigned_employee_id, assigned_employee_2_id
FROM service_orders
WHERE os_number IN ('TOR-1178', 'TOR-1215')
ORDER BY id;
