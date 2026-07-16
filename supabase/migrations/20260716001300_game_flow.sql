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

-- Una fila de alineación solo es válida si el equipo juega ese partido y
-- el jugador está en el roster activo de ese equipo (evita inyectar
-- referencias de otra organización en datos públicamente legibles).
create or replace function public.lineup_row_is_valid(p_game uuid, p_team uuid, p_player uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game
      and (g.home_team_id = p_team or g.away_team_id = p_team)
  )
  and exists (
    select 1 from public.rosters r
    where r.team_id = p_team
      and r.player_id = p_player
      and r.status = 'active'
  );
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

-- Dos titulares no pueden compartir turno al bat.
create unique index game_lineups_batting_order_unique
  on public.game_lineups (game_id, team_id, batting_order)
  where batting_order is not null;

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
    public.lineup_row_is_valid(game_id, team_id, player_id)
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
    and (
      (public.is_assigned_scorekeeper(game_id) and not public.game_is_finalized(game_id))
      or public.has_org_role(public.org_of_game(game_id), array['org_admin','season_manager']::public.app_role[])
      or public.is_super_admin()
    )
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
  -- Idempotente: si la respuesta de un intento previo se perdió en la red,
  -- reintentar no debe atorar al anotador en la pantalla de alineaciones.
  if v_status = 'in_progress' then
    return;
  end if;
  if v_status <> 'scheduled' then
    raise exception 'Solo un partido programado puede iniciarse (estado actual: %)', v_status;
  end if;
  update public.games set status = 'in_progress' where id = p_game;
end;
$$;

-- ---------------------------------------------------------------------
-- Validación de correcciones: una corrección pertenece al MISMO juego que
-- su objetivo y no puede corregir a otra corrección (profundidad máxima 1;
-- "deshacer un deshacer" = re-insertar el evento original). Esto mantiene
-- exacta la resolución de game_team_scores y cierra la manipulación
-- cross-tenant vía corrects_event_id.
-- ---------------------------------------------------------------------

create or replace function public.validate_correction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.game_events%rowtype;
begin
  if new.corrects_event_id is null then
    return new;
  end if;
  select * into v_target from public.game_events where id = new.corrects_event_id;
  if v_target.id is null then
    raise exception 'La corrección referencia un evento inexistente';
  end if;
  if v_target.game_id <> new.game_id then
    raise exception 'Una corrección debe pertenecer al mismo partido que el evento que corrige';
  end if;
  if v_target.event_type = 'correction' then
    raise exception 'No se puede corregir una corrección: re-inserta el evento original';
  end if;
  return new;
end;
$$;

create trigger game_events_validate_correction
  before insert on public.game_events
  for each row execute function public.validate_correction();

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

-- Re-deriva el caché de marcador de un partido FINALIZADO y refresca
-- standings. Necesario porque RLS permite a admin/manager insertar
-- correcciones tardías: sin esto, el caché y la matview quedarían
-- desincronizados de game_events (la fuente de verdad).
create or replace function public.rederive_game_score(p_game uuid)
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
  select * into v_game from public.games where id = p_game for update;
  if v_game.id is null or v_game.status <> 'finalized' then
    return;
  end if;

  select coalesce(gts.score, 0) into v_home
  from public.game_team_scores gts
  where gts.game_id = p_game and gts.team_id = v_game.home_team_id;

  select coalesce(gts.score, 0) into v_away
  from public.game_team_scores gts
  where gts.game_id = p_game and gts.team_id = v_game.away_team_id;

  update public.games
  set home_score = coalesce(v_home, 0),
      away_score = coalesce(v_away, 0)
  where id = p_game;

  perform public.refresh_standings();
end;
$$;

-- Correcciones tardías: cualquier evento insertado en un juego ya
-- finalizado re-deriva el caché automáticamente.
create or replace function public.rederive_if_finalized()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.game_is_finalized(new.game_id) then
    perform public.rederive_game_score(new.game_id);
  end if;
  return new;
end;
$$;

create trigger game_events_rederive_if_finalized
  after insert on public.game_events
  for each row execute function public.rederive_if_finalized();

revoke all on function public.start_game(uuid) from public, anon;
revoke all on function public.finalize_game(uuid) from public, anon;
revoke all on function public.rederive_game_score(uuid) from public, anon;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.finalize_game(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: marcador y timeline en vivo. Bloques separados para que un
-- duplicate_object en uno no revierta el otro. Nota conocida de Supabase:
-- los eventos DELETE no pasan por RLS (solo difunden la PK); INSERT/UPDATE
-- sí se filtran por las políticas de cada suscriptor.
-- ---------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.game_events;
exception
  when undefined_object then
    raise notice 'Publicación supabase_realtime no encontrada; se omite';
  when duplicate_object then
    null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.games;
exception
  when undefined_object then
    raise notice 'Publicación supabase_realtime no encontrada; se omite';
  when duplicate_object then
    null;
end;
$$;
