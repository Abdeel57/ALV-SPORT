-- =====================================================================
-- Estadísticas importadas por equipo (2026-09-11).
--
-- Las ligas traen tablas acumuladas de otro programa (bateo, pitcheo,
-- defensa) en texto o HTML. Se guardan TAL CUAL, en una tabla aparte y
-- etiquetadas como importadas: NO alimentan standings, líderes ni perfiles
-- derivados de game_events (esa sigue siendo la única fuente de verdad del
-- motor). Una tabla por equipo y tipo; cargar de nuevo reemplaza.
-- =====================================================================

create table public.team_stat_imports (
  id uuid primary key default gen_random_uuid(),
  -- Denormalizado como en teams/sponsors: las políticas y el audit_log
  -- verifican la organización sin recorrer la jerarquía.
  organization_id uuid not null references public.organizations (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  kind text not null check (kind in ('batting', 'pitching', 'fielding', 'other')),
  title text not null,
  source_name text,
  source_format text not null check (source_format in ('text', 'html')),
  -- ["AB","R","H",...] en el orden del documento.
  columns jsonb not null,
  -- [{"name":"Apellido, Nombre","playerId":uuid|null,"values":{"AB":20,...}}]
  rows jsonb not null,
  totals jsonb,
  player_count int,
  -- Documento original, para auditoría y para volver a interpretarlo.
  raw_document text not null,
  uploaded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, kind)
);

comment on table public.team_stat_imports is
  'Tablas de estadísticas cargadas desde otro programa. Solo se muestran; no derivan nada.';

alter table public.team_stat_imports enable row level security;
create index team_stat_imports_team_idx on public.team_stat_imports (team_id);

create trigger team_stat_imports_set_updated_at
  before update on public.team_stat_imports
  for each row execute function public.set_updated_at();
create trigger team_stat_imports_audit after insert or update or delete on public.team_stat_imports
  for each row execute function public.write_audit();

create policy team_stat_imports_select on public.team_stat_imports
  for select using (
    public.team_is_public(team_id)
    or public.is_org_member(organization_id)
    or public.is_super_admin()
  );
create policy team_stat_imports_insert on public.team_stat_imports
  for insert with check (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );
create policy team_stat_imports_update on public.team_stat_imports
  for update using (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );
create policy team_stat_imports_delete on public.team_stat_imports
  for delete using (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );
