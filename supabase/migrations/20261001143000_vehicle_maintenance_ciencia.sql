ALTER TABLE vehicle_maintenance
  ADD COLUMN IF NOT EXISTS ciencia JSONB NOT NULL DEFAULT '[]'::jsonb;
