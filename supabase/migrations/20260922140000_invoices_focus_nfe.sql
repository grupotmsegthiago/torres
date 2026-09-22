-- Focus NFe: campos satélite na invoice existente (não cria segunda tabela de notas).
-- invoices continua SSOT de cobrança/NFS-e (camada 7). PK integer preservada.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nfse_ref TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nfse_codigo_verificacao TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nfse_xml_path TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nfse_provider TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_nfse_ref
  ON invoices (nfse_ref)
  WHERE nfse_ref IS NOT NULL;

NOTIFY pgrst, 'reload schema';
