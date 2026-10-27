-- Tomador alternativo da NFS-e, só nesta fatura.
-- Não altera clients nem o client_id do contrato. Colunas nulas = usa o cadastro.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_cnpj VARCHAR(14);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_razao_social VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_inscricao_municipal VARCHAR(20);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_logradouro VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_numero VARCHAR(20);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_complemento VARCHAR(30);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_bairro VARCHAR(60);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_cep VARCHAR(8);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_codigo_ibge VARCHAR(7);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_uf VARCHAR(2);

NOTIFY pgrst, 'reload schema';
