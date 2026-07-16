-- =====================================================================
-- Fase 1: flujo de partido — alineaciones, transiciones de estado y
-- Realtime. Las transiciones son funciones security definer: el caché
-- home_score/away_score SOLO lo escribe finalize_game(), derivándolo de
-- game_team_scores (nunca a mano).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers (antes que las políticas que los usan)
-- ---------------------------------------------------------------------

create or replace function public.game_is_finalized(p_game uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game and g.status = 'finalized'
  );
$$;

create or replace function public.can_operate_game(p_game uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_assigned_scorekeeper(p_game)
    or public.has_org_role(public.org_of_game(p_game), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin();
$$;

-- ---------------------------------------------------------------------
-- game_lineups: alineación confirmada por partido (titulares y orden al
-- bat). El roster es el universo; la alineación es la selección del día.
-- ---------------------------------------------------------------------

create table public.game_lineups (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  team_id uuid not null references public.teams (id),
  player_id uuid not null references public.players (id),
  is_starter boolean not null default true,
  -- Orden al bat (softbol) o de cancha; null en deportes sin orden.
  batting_order int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, player_id)
);

alter table public.game_lineups enable row level security;

create index game_lineups_game_idx on public.game_lineups (game_id);

create trigger game_lineups_set_updated_at
  before update on public.game_lineups
  for each row execute function public.set_updated_at();

create trigger game_lineups_audit after insert or update or delete on public.game_lineups
  for each row execute function public.write_audit();

create policy game_lineups_select on public.game_lineups
  for select using (
    public.game_is_public(game_id)
    or public.is_org_member(public.org_of_game(game_id))
    or public.is_assigned_to_game(game_id)
    or public.is_super_admin()
  );

-- El anotador asignado gestiona la alineación mientras el juego no esté
-- finalizado; admin/manager siempre.
create policy game_lineups_insert on public.game_lineups
  for insert with check (
    (public.is_assigned_scorekeeper(game_id) and not public.game_is_finalized(game_id))
    or public.has_org_role(public.org_of_game(game_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy game_lineups_update on public.game_lineups
  for update using (
    (public.is_assigned_scorekeeper(game_id) and not public.game_is_finalized(game_id))
    or public.has_org_role(public.org_of_game(game_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

create policy game_lineups_delete on public.game_lineups
  for delete using (
    (public.is_assigned_scorekeeper(game_id) and not public.game_is_finalized(game_id))
    or public.has_org_role(public.org_of_game(game_id), array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );

-- ---------------------------------------------------------------------
-- Transiciones de estado
-- ---------------------------------------------------------------------

-- Inicia el partido (scheduled → in_progress). Necesario para que la
-- política de INSERT de game_events del anotador pase (exige in_progress).
create or replace function public.start_game(p_game uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.game_status;
begin
  if not public.can_operate_game(p_game) then
    raise exception 'No tienes permiso para operar este partido';
  end if;
  select status into v_status from public.games where id = p_game for update;
  if v_status is null then
    raise exception 'El partido no existe';
  end if;
  if v_status <> 'scheduled' then
    raise exception 'Solo un partido programado puede iniciarse (estado actual: %)', v_status;
  end if;
  update public.games set status = 'in_progress' where id = p_game;
end;
$$;

-- Finaliza el partido: deriva el caché de marcador desde game_team_scores
-- (la fuente sigue siendo game_events) y refresca standings.
create or replace function public.finalize_game(p_game uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_home int;
  v_away int;
begin
  if not public.can_operate_game(p_game) then
    raise exception 'No tienes permiso para operar este partido';
  end if;
  select * into v_game from public.games where id = p_game for update;
  if v_game.id is null then
    raise exception 'El partido no existe';
  end if;
  if v_game.status <> 'in_progress' then
    raise exception 'Solo un partido en progreso puede finalizarse (estado actual: %)', v_game.status;
  end if;

  select coalesce(gts.score, 0) into v_home
  from public.game_team_scores gts
  where gts.game_id = p_game and gts.team_id = v_game.home_team_id;

  select coalesce(gts.score, 0) into v_away
  from public.game_team_scores gts
  where gts.game_id = p_game and gts.team_id = v_game.away_team_id;

  update public.games
  set status = 'finalized',
      finalized_at = now(),
      home_score = coalesce(v_home, 0),
      away_score = coalesce(v_away, 0)
  where id = p_game;

  perform public.refresh_standings();
end;
$$;

revoke all on function public.start_game(uuid) from public, anon;
revoke all on function public.finalize_game(uuid) from public, anon;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.finalize_game(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: marcador y timeline en vivo
-- ---------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.game_events;
  alter publication supabase_realtime add table public.games;
exception
  when undefined_object then
    -- Fuera de Supabase (p. ej. Postgres vanilla) la publicación no existe.
    raise notice 'Publicación supabase_realtime no encontrada; se omite';
  when duplicate_object then
    null;
end;
$$;
