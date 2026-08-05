-- =============================================================================
-- rollback documental — limpeza irreversible de plain_password
-- NÃO restaura valores antigos. NÃO contém senhas.
-- Recuperação de incidente: apenas restore completo de backup autorizado.
-- =============================================================================

DO $$
BEGIN
  RAISE EXCEPTION
    'Irreversible security cleanup. Do not restore plaintext passwords. Fix Auth via Supabase Admin API. Restore only through an authorized full database backup if strictly necessary.';
END $$;
