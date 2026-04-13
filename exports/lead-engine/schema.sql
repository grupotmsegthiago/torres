-- =============================================================================
-- LEAD ENGINE — Database Schema
-- =============================================================================
-- Execute este SQL no seu banco PostgreSQL (Supabase, Neon, etc.)
-- antes de iniciar o motor de prospecção.
-- =============================================================================

-- 1. Tabela principal de leads
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  empresa TEXT NOT NULL,
  cnpj TEXT,
  contato_nome TEXT,
  contato_cargo TEXT,
  telefone TEXT,
  email TEXT,
  website TEXT,
  endereco TEXT,
  cidade TEXT DEFAULT 'São Paulo',
  estado TEXT DEFAULT 'SP',
  cep TEXT,
  setor TEXT,
  origem TEXT DEFAULT 'prospecao_ativa',
  status TEXT DEFAULT 'novo',
  temperatura TEXT DEFAULT 'frio',
  valor_estimado REAL DEFAULT 0,
  notas TEXT,
  motivo_perda TEXT,
  proximo_contato TIMESTAMP,
  ultimo_contato TIMESTAMP,
  responsavel TEXT,
  responsavel_id INTEGER,
  google_place_id TEXT,
  google_rating REAL,
  google_total_reviews INTEGER,
  tags TEXT[],
  historico JSONB DEFAULT '[]'::jsonb,
  emails_enviados INTEGER DEFAULT 0,
  convertido_client_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_setor ON leads(setor);
CREATE INDEX IF NOT EXISTS idx_leads_cidade ON leads(cidade);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_origem ON leads(origem);

-- 2. Fila de e-mails
CREATE TABLE IF NOT EXISTS email_queue (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  to_name TEXT,
  empresa TEXT,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  status TEXT DEFAULT 'pendente',
  tracking_id TEXT UNIQUE,
  opened_at TIMESTAMP,
  opened_count INTEGER DEFAULT 0,
  replied BOOLEAN DEFAULT FALSE,
  replied_at TIMESTAMP,
  error_message TEXT,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  campaign_tag TEXT DEFAULT 'apresentacao'
);

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_tracking ON email_queue(tracking_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_lead ON email_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_sent ON email_queue(sent_at);

-- 3. Estado da prospecção automática
CREATE TABLE IF NOT EXISTS auto_prospect_state (
  id SERIAL PRIMARY KEY,
  query_index INTEGER DEFAULT 0,
  next_page_token TEXT,
  total_found INTEGER DEFAULT 0,
  last_run TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO auto_prospect_state (id, query_index)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;
