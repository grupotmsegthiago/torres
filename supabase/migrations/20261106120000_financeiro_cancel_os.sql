-- O perfil financeiro cancela OS pelo backend (service role).
-- Esta policy cobre o acesso direto com o JWT do usuário:
-- pode ler a OS e só grava se o status resultante for cancelada.

grant select, update on public.service_orders to authenticated;

drop policy if exists service_orders_financeiro_select on public.service_orders;
create policy service_orders_financeiro_select
  on public.service_orders
  for select
  to authenticated
  using ((select get_app_user_role(auth.uid())) = 'financeiro');

drop policy if exists service_orders_financeiro_cancel on public.service_orders;
create policy service_orders_financeiro_cancel
  on public.service_orders
  for update
  to authenticated
  using ((select get_app_user_role(auth.uid())) = 'financeiro')
  with check (
    (select get_app_user_role(auth.uid())) = 'financeiro'
    and status = 'cancelada'
  );
