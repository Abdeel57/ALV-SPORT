-- =====================================================================
-- Fix de seguridad (encontrado por scripts/security-audit.ts):
-- registrations_select usaba is_org_member (CUALQUIER rol de la org),
-- exponiendo montos y referencias de pago a capitanes y anotadores.
-- Ahora: solo quien la solicitó, admin/manager de la org, o super_admin.
-- =====================================================================

drop policy registrations_select on public.registrations;

create policy registrations_select on public.registrations
  for select using (
    requested_by = (select auth.uid())
    or public.has_org_role(
      public.org_of_season(season_id),
      array['org_admin','season_manager']::public.app_role[]
    )
    or public.is_super_admin()
  );
