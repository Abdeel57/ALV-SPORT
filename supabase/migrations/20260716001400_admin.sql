-- =====================================================================
-- Fase 3: panel administrativo — inscripciones/pagos, sanciones, noticias,
-- patrocinadores, buckets de Storage y helpers de asignación.
-- =====================================================================

create type public.registration_status as enum ('pending', 'approved', 'paid', 'rejected');
create type public.payment_method as enum ('mercado_pago', 'cash');
create type public.sanction_status as enum ('active', 'served', 'canceled');
create type public.news_status as enum ('draft', 'published');
create type public.sponsor_placement as enum ('home', 'game', 'footer');

-- ---------------------------------------------------------------------
-- Inscripciones: capitán registra → admin aprueba → pago (MP o efectivo)
-- ---------------------------------------------------------------------

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  requested_by uuid references auth.users (id),
  status public.registration_status not null default 'pending',
  amount numeric(10, 2),
  payment_method public.payment_method,
  -- Referencia del pago: id de MP o folio del recibo en efectivo.
  payment_ref text,
  -- Nota libre (obligatoria para pagos en efectivo, común en ligas locales).
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, team_id)
);

alter table public.registrations enable row level security;
create index registrations_season_idx on public.registrations (season_id);
create index registrations_status_idx on public.registrations (season_id, status);

create trigger registrations_set_updated_at
  before update on public.registrations
  for each row execute function public.set_updated_at();
create trigger registrations_audit after insert or update or delete on public.registrations
  for each row execute function public.write_audit();

create policy registrations_select on public.registrations
  for select using (
    requested_by = (select auth.uid())
    or public.is_org_member(public.org_of_season(season_id))
    or public.is_super_admin()
  );

-- El capitán registra a su equipo; admin/manager también pueden capturar.
create policy registrations_insert on public.registrations
  for insert with check (
    requested_by = (select auth.uid())
    and (
      public.has_org_role(public.org_of_season(season_id), array['team_captain','org_admin','season_manager']::public.app_role[])
      or public.is_super_admin()
    )
  );

create policy registrations_update on public.registrations
  for update using (
    public.has_org_role(public.org_of_season(season_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy registrations_delete on public.registrations
  for delete using (
    public.has_org_role(public.org_of_season(season_id), array['org_admin']::public.app_role[])
    or public.is_super_admin()
  );

-- ---------------------------------------------------------------------
-- Sanciones: suspensiones por número de partidos. Los partidos cumplidos
-- se DERIVAN (juegos finalizados del equipo del jugador desde el inicio de
-- la sanción) — sin contadores editables, consistente con la arquitectura.
-- ---------------------------------------------------------------------

create table public.sanctions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  reason text not null,
  games_count int not null check (games_count > 0),
  starts_on date not null default current_date,
  status public.sanction_status not null default 'active',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sanctions enable row level security;
create index sanctions_player_idx on public.sanctions (player_id) where status = 'active';
create index sanctions_org_idx on public.sanctions (organization_id, status);

create trigger sanctions_set_updated_at
  before update on public.sanctions
  for each row execute function public.set_updated_at();
create trigger sanctions_audit after insert or update or delete on public.sanctions
  for each row execute function public.write_audit();

create policy sanctions_select on public.sanctions
  for select using (
    public.is_org_member(organization_id) or public.is_super_admin()
  );
create policy sanctions_insert on public.sanctions
  for insert with check (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );
create policy sanctions_update on public.sanctions
  for update using (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );
create policy sanctions_delete on public.sanctions
  for delete using (
    public.has_org_role(organization_id, array['org_admin']::public.app_role[])
    or public.is_super_admin()
  );

-- Juegos cumplidos de una sanción: finalizados del equipo del jugador
-- desde que inició la sanción.
create or replace function public.sanction_games_served(p_sanction uuid)
returns int
language sql stable security definer
set search_path = public
as $$
  select count(*)::int
  from public.sanctions sa
  join public.games g
    on g.status = 'finalized'
   and g.finalized_at >= sa.starts_on
   and (
     g.home_team_id in (select r.team_id from public.rosters r where r.player_id = sa.player_id)
     or g.away_team_id in (select r.team_id from public.rosters r where r.player_id = sa.player_id)
   )
  where sa.id = p_sanction;
$$;

create or replace function public.player_is_sanctioned(p_player uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sanctions sa
    where sa.player_id = p_player
      and sa.status = 'active'
      and public.sanction_games_served(sa.id) < sa.games_count
  );
$$;

-- La mesa consulta quiénes están suspendidos para deshabilitarlos en la
-- alineación (el bloqueo duro vive en las políticas de game_lineups).
create or replace function public.sanctioned_players_for_game(p_game uuid)
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select r.player_id
  from public.games g
  join public.rosters r on r.team_id in (g.home_team_id, g.away_team_id)
  where g.id = p_game
    and public.can_operate_game(p_game)
    and public.player_is_sanctioned(r.player_id);
$$;

-- Endurecer game_lineups: un suspendido no puede ser titular.
drop policy game_lineups_insert on public.game_lineups;
drop policy game_lineups_update on public.game_lineups;

create policy game_lineups_insert on public.game_lineups
  for insert with check (
    public.lineup_row_is_valid(game_id, team_id, player_id)
    and (not is_starter or not public.player_is_sanctioned(player_id))
    and (
      (public.is_assigned_scorekeeper(game_id) and not public.game_is_finalized(game_id))
      or public.has_org_role(public.org_of_game(game_id), array['org_admin','season_manager']::public.app_role[])
      or public.is_super_admin()
    )
  );

create policy game_lineups_update on public.game_lineups
  for update using (
    (public.is_assigned_scorekeeper(game_id) and not public.game_is_finalized(game_id))
    or public.has_org_role(public.org_of_game(game_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  )
  with check (
    public.lineup_row_is_valid(game_id, team_id, player_id)
    and (not is_starter or not public.player_is_sanctioned(player_id))
    and (
      (public.is_assigned_scorekeeper(game_id) and not public.game_is_finalized(game_id))
      or public.has_org_role(public.org_of_game(game_id), array['org_admin','season_manager']::public.app_role[])
      or public.is_super_admin()
    )
  );

-- ---------------------------------------------------------------------
-- Noticias y patrocinadores (se reflejan en el sitio público)
-- ---------------------------------------------------------------------

create table public.news (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  body text not null,
  image_url text,
  status public.news_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.news enable row level security;
create index news_org_status_idx on public.news (organization_id, status, published_at desc);

create trigger news_set_updated_at
  before update on public.news
  for each row execute function public.set_updated_at();
create trigger news_audit after insert or update or delete on public.news
  for each row execute function public.write_audit();

create policy news_select on public.news
  for select using (
    (status = 'published' and public.org_is_public(organization_id))
    or public.is_org_member(organization_id)
    or public.is_super_admin()
  );
create policy news_write on public.news
  for insert with check (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );
create policy news_update on public.news
  for update using (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );
create policy news_delete on public.news
  for delete using (
    public.has_org_role(organization_id, array['org_admin']::public.app_role[])
    or public.is_super_admin()
  );

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  logo_url text,
  link_url text,
  placement public.sponsor_placement not null default 'footer',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sponsors enable row level security;
create index sponsors_org_placement_idx on public.sponsors (organization_id, placement, sort_order);

create trigger sponsors_set_updated_at
  before update on public.sponsors
  for each row execute function public.set_updated_at();
create trigger sponsors_audit after insert or update or delete on public.sponsors
  for each row execute function public.write_audit();

create policy sponsors_select on public.sponsors
  for select using (
    (is_active and public.org_is_public(organization_id))
    or public.is_org_member(organization_id)
    or public.is_super_admin()
  );
create policy sponsors_insert on public.sponsors
  for insert with check (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );
create policy sponsors_update on public.sponsors
  for update using (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );
create policy sponsors_delete on public.sponsors
  for delete using (
    public.has_org_role(organization_id, array['org_admin']::public.app_role[])
    or public.is_super_admin()
  );

-- ---------------------------------------------------------------------
-- Asignaciones por correo: el admin escribe el email del anotador/árbitro;
-- la función resuelve el user_id sin exponer auth.users.
-- ---------------------------------------------------------------------

create or replace function public.user_id_by_email(p_email text)
returns uuid
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.organization_members m
    where m.user_id = (select auth.uid())
      and m.role in ('org_admin', 'season_manager')
  ) then
    raise exception 'Solo administradores pueden buscar usuarios';
  end if;
  select id into v_id from auth.users where lower(email) = lower(p_email);
  return v_id;
end;
$$;

revoke all on function public.user_id_by_email(text) from public, anon;
grant execute on function public.user_id_by_email(text) to authenticated;

-- ---------------------------------------------------------------------
-- Storage: escudos, fotos, imágenes de noticias y logos de patrocinador.
-- Los paths inician con el uuid de la organización: la política valida
-- que quien escribe sea admin/manager de ESA org. Lectura pública.
-- ---------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public)
  values
    ('team-logos', 'team-logos', true),
    ('player-photos', 'player-photos', true),
    ('news-images', 'news-images', true),
    ('sponsor-logos', 'sponsor-logos', true)
  on conflict (id) do nothing;

  create policy alv_media_insert on storage.objects
    for insert to authenticated with check (
      bucket_id in ('team-logos', 'player-photos', 'news-images', 'sponsor-logos')
      and public.has_org_role((split_part(name, '/', 1))::uuid, array['org_admin','season_manager']::public.app_role[])
    );
  create policy alv_media_update on storage.objects
    for update to authenticated using (
      bucket_id in ('team-logos', 'player-photos', 'news-images', 'sponsor-logos')
      and public.has_org_role((split_part(name, '/', 1))::uuid, array['org_admin','season_manager']::public.app_role[])
    );
  create policy alv_media_delete on storage.objects
    for delete to authenticated using (
      bucket_id in ('team-logos', 'player-photos', 'news-images', 'sponsor-logos')
      and public.has_org_role((split_part(name, '/', 1))::uuid, array['org_admin','season_manager']::public.app_role[])
    );
exception
  when undefined_table then
    raise notice 'Esquema storage no disponible (fuera de Supabase); se omite';
end;
$$;
