-- =====================================================================
-- Fase 5: ganador por configuración (winnerBy) también en SQL.
-- Deportes por sets (voleibol, tenis) definen al ganador por periodos
-- ganados, no por puntos totales. game_team_scores expone ambos valores y
-- la matview + finalize deciden W/L según sports.config->standings->winnerBy.
-- =====================================================================

drop view public.public_standings;
drop materialized view public.standings;
drop view public.game_team_scores;

create view public.game_team_scores as
with sides as (
  select g.id as game_id, g.season_id, g.division_id, g.home_team_id as team_id
  from public.games g
  union all
  select g.id, g.season_id, g.division_id, g.away_team_id
  from public.games g
),
effective_events as (
  select ge.game_id, ge.team_id, ge.period, ge.event_type
  from public.game_events ge
  where ge.event_type <> 'correction'
    and ge.team_id is not null
    and not exists (
      select 1 from public.game_events c
      where c.event_type = 'correction'
        and c.game_id = ge.game_id
        and c.corrects_event_id = ge.id
    )
),
per_period_raw as (
  select ee.game_id, ee.team_id, ee.period,
         sum(coalesce((et.def ->> 'scoreDelta')::numeric, 0))::int as pts
  from effective_events ee
  join public.games g on g.id = ee.game_id
  join public.seasons s on s.id = g.season_id
  join public.leagues l on l.id = s.league_id
  join public.sports sp on sp.id = l.sport_id
  left join lateral (
    select def from jsonb_array_elements(sp.config -> 'eventTypes') as def
    where def ->> 'key' = ee.event_type
  ) et on true
  group by ee.game_id, ee.team_id, ee.period
),
game_periods as (
  select distinct game_id, period from per_period_raw where period is not null
),
side_periods as (
  select s.game_id, s.team_id, p.period,
         coalesce(r.pts, 0) as pts
  from sides s
  join game_periods p on p.game_id = s.game_id
  left join per_period_raw r
    on r.game_id = s.game_id and r.team_id = s.team_id and r.period = p.period
),
totals as (
  select game_id, team_id, sum(pts)::int as score
  from per_period_raw
  group by game_id, team_id
),
sets_won as (
  select a.game_id, a.team_id, count(*)::int as periods_won
  from side_periods a
  join side_periods b
    on b.game_id = a.game_id and b.period = a.period and b.team_id <> a.team_id
  where a.pts > b.pts
  group by a.game_id, a.team_id
)
select
  sides.game_id,
  sides.season_id,
  sides.division_id,
  sides.team_id,
  coalesce(t.score, 0) as score,
  coalesce(sw.periods_won, 0) as periods_won
from sides
left join totals t on t.game_id = sides.game_id and t.team_id = sides.team_id
left join sets_won sw on sw.game_id = sides.game_id and sw.team_id = sides.team_id;

revoke all on public.game_team_scores from anon, authenticated;

create materialized view public.standings as
select
  gts.season_id,
  gts.division_id,
  gts.team_id,
  count(*)::int as played,
  (count(*) filter (where
    case when coalesce(sp.config->'standings'->>'winnerBy','total_score') = 'periods_won'
         then gts.periods_won > opp.periods_won
         else gts.score > opp.score end))::int as wins,
  (count(*) filter (where
    case when coalesce(sp.config->'standings'->>'winnerBy','total_score') = 'periods_won'
         then gts.periods_won < opp.periods_won
         else gts.score < opp.score end))::int as losses,
  (count(*) filter (where
    case when coalesce(sp.config->'standings'->>'winnerBy','total_score') = 'periods_won'
         then gts.periods_won = opp.periods_won
         else gts.score = opp.score end))::int as ties,
  (
    count(*) filter (where
      case when coalesce(sp.config->'standings'->>'winnerBy','total_score') = 'periods_won'
           then gts.periods_won > opp.periods_won else gts.score > opp.score end)
      * coalesce((sp.config -> 'standings' -> 'pointsFor' ->> 'win')::numeric, 0)
    + count(*) filter (where
      case when coalesce(sp.config->'standings'->>'winnerBy','total_score') = 'periods_won'
           then gts.periods_won = opp.periods_won else gts.score = opp.score end)
      * coalesce((sp.config -> 'standings' -> 'pointsFor' ->> 'tie')::numeric, 0)
    + count(*) filter (where
      case when coalesce(sp.config->'standings'->>'winnerBy','total_score') = 'periods_won'
           then gts.periods_won < opp.periods_won else gts.score < opp.score end)
      * coalesce((sp.config -> 'standings' -> 'pointsFor' ->> 'loss')::numeric, 0)
  )::numeric as points,
  sum(gts.score)::int as score_for,
  sum(opp.score)::int as score_against,
  (sum(gts.score) - sum(opp.score))::int as score_diff
from public.game_team_scores gts
join public.games g on g.id = gts.game_id
join public.game_team_scores opp
  on opp.game_id = gts.game_id and opp.team_id <> gts.team_id
join public.seasons s on s.id = gts.season_id
join public.leagues l on l.id = s.league_id
join public.sports sp on sp.id = l.sport_id
where g.status = 'finalized'
group by gts.season_id, gts.division_id, gts.team_id, sp.config;

create unique index standings_unique_idx
  on public.standings (season_id, division_id, team_id) nulls not distinct;

revoke all on public.standings from anon, authenticated;

create view public.public_standings as
select
  st.season_id,
  st.division_id,
  st.team_id,
  t.name as team_name,
  t.slug as team_slug,
  t.color as team_color,
  s.league_id,
  st.played,
  st.wins,
  st.losses,
  st.ties,
  st.points,
  st.score_for,
  st.score_against,
  st.score_diff
from public.standings st
join public.teams t on t.id = st.team_id
join public.seasons s on s.id = st.season_id
join public.leagues l on l.id = s.league_id
where l.is_published;

grant select on public.public_standings to anon, authenticated;

-- El caché games.home_score/away_score guarda el MARCADOR del partido según
-- winnerBy: sets ganados en voleibol, puntos totales en los demás.
create or replace function public.finalize_game(p_game uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_winner_by text;
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

  select coalesce(sp.config->'standings'->>'winnerBy', 'total_score') into v_winner_by
  from public.seasons s
  join public.leagues l on l.id = s.league_id
  join public.sports sp on sp.id = l.sport_id
  where s.id = v_game.season_id;

  select case when v_winner_by = 'periods_won' then gts.periods_won else gts.score end
  into v_home
  from public.game_team_scores gts
  where gts.game_id = p_game and gts.team_id = v_game.home_team_id;

  select case when v_winner_by = 'periods_won' then gts.periods_won else gts.score end
  into v_away
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

create or replace function public.rederive_game_score(p_game uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_winner_by text;
  v_home int;
  v_away int;
begin
  select * into v_game from public.games where id = p_game for update;
  if v_game.id is null or v_game.status <> 'finalized' then
    return;
  end if;

  select coalesce(sp.config->'standings'->>'winnerBy', 'total_score') into v_winner_by
  from public.seasons s
  join public.leagues l on l.id = s.league_id
  join public.sports sp on sp.id = l.sport_id
  where s.id = v_game.season_id;

  select case when v_winner_by = 'periods_won' then gts.periods_won else gts.score end
  into v_home
  from public.game_team_scores gts
  where gts.game_id = p_game and gts.team_id = v_game.home_team_id;

  select case when v_winner_by = 'periods_won' then gts.periods_won else gts.score end
  into v_away
  from public.game_team_scores gts
  where gts.game_id = p_game and gts.team_id = v_game.away_team_id;

  update public.games
  set home_score = coalesce(v_home, 0),
      away_score = coalesce(v_away, 0)
  where id = p_game;

  perform public.refresh_standings();
end;
$$;
