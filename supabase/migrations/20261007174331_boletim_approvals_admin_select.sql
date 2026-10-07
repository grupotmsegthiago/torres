-- SELECT autenticado necessário para tela administrativa e postgres_changes.
DROP POLICY IF EXISTS boletim_approvals_admin_select ON public.boletim_approvals;
CREATE POLICY boletim_approvals_admin_select
  ON public.boletim_approvals
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_app_user_role(auth.uid()))
      = ANY (ARRAY['admin'::text, 'diretoria'::text])
  );
