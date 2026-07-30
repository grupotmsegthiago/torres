-- Migration LOCAL (NÃO aplicar em produção sem autorização explícita).
-- Auditoria imutável de criação/edição/exclusão manual de batidas Control iD.
-- A fila rhid_sync_queue NÃO substitui esta tabela (integração ≠ autoria).

CREATE TABLE IF NOT EXISTS control_id_punch_audit (
  id BIGSERIAL PRIMARY KEY,
  punch_id BIGINT,
  employee_id INTEGER,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'repair')),
  before_row JSONB,
  after_row JSONB,
  user_id INTEGER,
  user_name TEXT,
  user_email TEXT,
  user_role TEXT,
  ip_address TEXT,
  user_agent TEXT,
  request_id TEXT,
  reason TEXT NOT NULL,
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at_brt TEXT NOT NULL,
  document_ref TEXT,
  meta JSONB
);

CREATE INDEX IF NOT EXISTS idx_punch_audit_punch_id ON control_id_punch_audit (punch_id);
CREATE INDEX IF NOT EXISTS idx_punch_audit_employee_id ON control_id_punch_audit (employee_id);
CREATE INDEX IF NOT EXISTS idx_punch_audit_created_at ON control_id_punch_audit (created_at_utc DESC);

COMMENT ON TABLE control_id_punch_audit IS
  'Auditoria de autoria de batidas manuais. Imutável (somente INSERT).';
