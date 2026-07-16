-- =====================================================================
-- RLS: matriz completa de políticas. Los permisos viven AQUÍ, no en la UI.
--
-- Principios:
--  * Helpers security definer (dueño: postgres) para evitar recursión de
--    RLS sobre organization_members y mantener las políticas legibles.
--  * `(select auth.uid())` para que el planner lo evalúe una vez por query.
--  * Todo lo colgado de una liga publicada (is_published) es legible por
--    anon: el marcador en vivo es público.
--  * game_events y audit_log NO tienen políticas de UPDATE/DELETE (además
--    del trigger forbid_change): son append-only.
--  * audit_log no tiene política de INSERT: solo escribe el trigger
--    security definer write_audit().
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers de membresía y rol
-- ---------------------------------------------------------------------

create or replace function public.has_org_role(p_org uuid, p_roles public.app_role[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.user_id = (select auth.uid())
      and m.role = 'super_admin'
  );
$$;

-- ---------------------------------------------------------------------
-- Helpers de navegación de jerarquía (org dueña de cada entidad)
-- ---------------------------------------------------------------------

create or replace function public.org_of_league(p_league uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select organization_id from public.leagues where id = p_league;
$$;

create or replace function public.org_of_season(p_season uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select l.organization_id
  from public.seasons s
  join public.leagues l on l.id = s.league_id
  where s.id = p_season;
$$;

create or replace function public.org_of_venue(p_venue uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select organization_id from public.venues where id = p_venue;
$$;

create or replace function public.org_of_team(p_team uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select organization_id from public.teams where id = p_team;
$$;

create or replace function public.org_of_game(p_game uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select public.org_of_season(g.season_id) from public.games g where g.id = p_game;
$$;

-- ---------------------------------------------------------------------
-- Helpers de visibilidad pública (liga publicada)
-- ---------------------------------------------------------------------

create or replace function public.org_is_public(p_org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.leagues l
    where l.organization_id = p_org and l.is_published
  );
$$;

create or replace function public.season_is_public(p_season uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.seasons s
    join public.leagues l on l.id = s.league_id
    where s.id = p_season and l.is_published
  );
$$;

create or replace function public.division_is_public(p_division uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.divisions d
    join public.seasons s on s.id = d.season_id
    join public.leagues l on l.id = s.league_id
    where d.id = p_division and l.is_published
  );
$$;

create or replace function public.team_is_public(p_team uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    join public.divisions d on d.id = t.division_id
    join public.seasons s on s.id = d.season_id
    join public.leagues l on l.id = s.league_id
    where t.id = p_team and l.is_published
  );
$$;

create or replace function public.game_is_public(p_game uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.games g
    join public.seasons s on s.id = g.season_id
    join public.leagues l on l.id = s.league_id
    where g.id = p_game and l.is_published
  );
$$;

-- ---------------------------------------------------------------------
-- Helpers específicos de anotación
-- ---------------------------------------------------------------------

create or replace function public.is_assigned_to_game(p_game uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.game_assignments ga
    where ga.game_id = p_game
      and ga.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_assigned_scorekeeper(p_game uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.game_assignments ga
    where ga.game_id = p_game
      and ga.user_id = (select auth.uid())
      and ga.role = 'scorekeeper'
  );
$$;

create or replace function public.game_in_progress(p_game uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game and g.status = 'in_progress'
  );
$$;

-- ---------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------

create policy organizations_select on public.organizations
  for select using (
    public.org_is_public(id)
    or public.is_org_member(id)
    or public.is_super_admin()
  );

create policy organizations_insert on public.organizations
  for insert with check (public.is_super_admin());

create policy organizations_update on public.organizations
  for update using (
    public.has_org_role(id, array['org_admin']::public.app_role[])
    or public.is_super_admin()
  );

create policy organizations_delete on public.organizations
  for delete using (public.is_super_admin());

-- ---------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------

create policy organization_members_select on public.organization_members
  for select using (
    user_id = (select auth.uid())
    or public.has_org_role(organization_id, array['org_admin']::public.app_role[])
    or public.is_super_admin()
  );

create policy organization_members_insert on public.organization_members
  for insert with check (
    public.has_org_role(organization_id, array['org_admin']::public.app_role[])
    or public.is_super_admin()
  );

create policy organization_members_update on public.organization_members
  for update using (
    public.has_org_role(organization_id, array['org_admin']::public.app_role[])
    or public.is_super_admin()
  );

create policy organization_members_delete on public.organization_members
  for delete using (
    public.has_org_role(organization_id, array['org_admin']::public.app_role[])
    or public.is_super_admin()
  );

-- ---------------------------------------------------------------------
-- sports (catálogo global legible por todos; filas de org, por su org)
-- ---------------------------------------------------------------------

create policy sports_select on public.sports
  for select using (
    organization_id is null
    or public.is_org_member(organization_id)
    or public.org_is_public(organization_id)
  );

create policy sports_insert on public.sports
  for insert with check (
    (organization_id is null and public.is_super_admin())
    or (organization_id is not null
        and public.has_org_role(organization_id, array['org_admin']::public.app_role[]))
  );

create policy sports_update on public.sports
  for update using (
    (organization_id is null and public.is_super_admin())
    or (organization_id is not null
        and public.has_org_role(organization_id, array['org_admin']::public.app_role[]))
  );

create policy sports_delete on public.sports
  for delete using (
    (organization_id is null and public.is_super_admin())
    or (organization_id is not null
        and public.has_org_role(organization_id, array['org_admin']::public.app_role[]))
  );

-- ---------------------------------------------------------------------
-- leagues
-- ---------------------------------------------------------------------

create policy leagues_select on public.leagues
  for select using (
    is_published
    or public.is_org_member(organization_id)
    or public.is_super_admin()
  );

create policy leagues_insert on public.leagues
  for insert with check (
    public.has_org_role(organization_id, array['org_admin']::public.app_role[])
    or public.is_super_admin()
  );

create policy leagues_update on public.leagues
  for update using (
    public.has_org_role(organization_id, array['org_admin']::public.app_role[])
    or public.is_super_admin()
  );

create policy leagues_delete on public.leagues
  for delete using (
    public.has_org_role(organization_id, array['org_admin']::public.app_role[])
    or public.is_super_admin()
  );

-- ---------------------------------------------------------------------
-- seasons
-- ---------------------------------------------------------------------

create policy seasons_select on public.seasons
  for select using (
    public.season_is_public(id)
    or public.is_org_member(public.org_of_league(league_id))
    or public.is_super_admin()
  );

create policy seasons_insert on public.seasons
  for insert with check (
    public.has_org_role(public.org_of_league(league_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy seasons_update on public.seasons
  for update using (
    public.has_org_role(public.org_of_league(league_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy seasons_delete on public.seasons
  for delete using (
    public.has_org_role(public.org_of_league(league_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

-- ---------------------------------------------------------------------
-- divisions
-- ---------------------------------------------------------------------

create policy divisions_select on public.divisions
  for select using (
    public.division_is_public(id)
    or public.is_org_member(public.org_of_season(season_id))
    or public.is_super_admin()
  );

create policy divisions_insert on public.divisions
  for insert with check (
    public.has_org_role(public.org_of_season(season_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy divisions_update on public.divisions
  for update using (
    public.has_org_role(public.org_of_season(season_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy divisions_delete on public.divisions
  for delete using (
    public.has_org_role(public.org_of_season(season_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

-- ---------------------------------------------------------------------
-- venues / courts
-- ---------------------------------------------------------------------

create policy venues_select on public.venues
  for select using (
    public.org_is_public(organization_id)
    or public.is_org_member(organization_id)
    or public.is_super_admin()
  );

create policy venues_insert on public.venues
  for insert with check (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy venues_update on public.venues
  for update using (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy venues_delete on public.venues
  for delete using (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy courts_select on public.courts
  for select using (
    public.org_is_public(public.org_of_venue(venue_id))
    or public.is_org_member(public.org_of_venue(venue_id))
    or public.is_super_admin()
  );

create policy courts_insert on public.courts
  for insert with check (
    public.has_org_role(public.org_of_venue(venue_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy courts_update on public.courts
  for update using (
    public.has_org_role(public.org_of_venue(venue_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy courts_delete on public.courts
  for delete using (
    public.has_org_role(public.org_of_venue(venue_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

-- ---------------------------------------------------------------------
-- teams / players / rosters
-- ---------------------------------------------------------------------

create policy teams_select on public.teams
  for select using (
    public.team_is_public(id)
    or public.is_org_member(organization_id)
    or public.is_super_admin()
  );

create policy teams_insert on public.teams
  for insert with check (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy teams_update on public.teams
  for update using (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy teams_delete on public.teams
  for delete using (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy players_select on public.players
  for select using (
    public.org_is_public(organization_id)
    or public.is_org_member(organization_id)
    or public.is_super_admin()
  );

create policy players_insert on public.players
  for insert with check (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy players_update on public.players
  for update using (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy players_delete on public.players
  for delete using (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

-- team_captain gestiona su propio roster en Fase 1 (requiere vincular
-- capitanes a equipos); por ahora solo admin/manager mutan rosters.
create policy rosters_select on public.rosters
  for select using (
    public.team_is_public(team_id)
    or public.is_org_member(public.org_of_team(team_id))
    or public.is_super_admin()
  );

create policy rosters_insert on public.rosters
  for insert with check (
    public.has_org_role(public.org_of_team(team_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy rosters_update on public.rosters
  for update using (
    public.has_org_role(public.org_of_team(team_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy rosters_delete on public.rosters
  for delete using (
    public.has_org_role(public.org_of_team(team_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

-- ---------------------------------------------------------------------
-- games / game_assignments
-- ---------------------------------------------------------------------

create policy games_select on public.games
  for select using (
    public.game_is_public(id)
    or public.is_org_member(public.org_of_season(season_id))
    or public.is_assigned_to_game(id)
    or public.is_super_admin()
  );

create policy games_insert on public.games
  for insert with check (
    public.has_org_role(public.org_of_season(season_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy games_update on public.games
  for update using (
    public.has_org_role(public.org_of_season(season_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy games_delete on public.games
  for delete using (
    public.has_org_role(public.org_of_season(season_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy game_assignments_select on public.game_assignments
  for select using (
    user_id = (select auth.uid())
    or public.has_org_role(public.org_of_game(game_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy game_assignments_insert on public.game_assignments
  for insert with check (
    public.has_org_role(public.org_of_game(game_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy game_assignments_update on public.game_assignments
  for update using (
    public.has_org_role(public.org_of_game(game_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy game_assignments_delete on public.game_assignments
  for delete using (
    public.has_org_role(public.org_of_game(game_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

-- ---------------------------------------------------------------------
-- game_events (append-only: SELECT + INSERT, jamás UPDATE/DELETE)
-- ---------------------------------------------------------------------

-- El marcador en vivo es público para ligas publicadas.
create policy game_events_select on public.game_events
  for select using (
    public.game_is_public(game_id)
    or public.is_org_member(public.org_of_game(game_id))
    or public.is_assigned_to_game(game_id)
    or public.is_super_admin()
  );

-- El anotador asignado inserta eventos solo de SU partido, en progreso y a
-- su nombre. admin/manager de la org también pueden (correcciones tardías).
create policy game_events_insert on public.game_events
  for insert with check (
    created_by = (select auth.uid())
    and (
      (public.is_assigned_scorekeeper(game_id) and public.game_in_progress(game_id))
      or public.has_org_role(public.org_of_game(game_id), array['org_admin','season_manager']::public.app_role[])
      or public.is_super_admin()
    )
  );

-- Sin políticas de UPDATE/DELETE: append-only (más trigger forbid_change).

-- ---------------------------------------------------------------------
-- audit_log (solo lectura para org_admin; escribe únicamente el trigger)
-- ---------------------------------------------------------------------

create policy audit_log_select on public.audit_log
  for select using (
    (organization_id is not null
     and public.has_org_role(organization_id, array['org_admin']::public.app_role[]))
    or public.is_super_admin()
  );

-- Sin políticas de INSERT/UPDATE/DELETE.
