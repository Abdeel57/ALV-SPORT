-- =====================================================================
-- Standings DERIVADOS de game_events. Prohibido guardar totales editables.
--
-- Tres capas:
--  1. game_team_scores: marcador por equipo por juego, calculado desde los
--     eventos según sports.config (genérico entre deportes, sin ramas).
--  2. standings (vista materializada): agregados crudos por
--     (season, division, team). SIN orden ni desempates: esos viven en
--     lib/engine/standings.ts — una sola implementación, testeable.
--  3. public_standings: capa pública filtrada a ligas publicadas.
-- =====================================================================

-- Capa 1: marcador por equipo por juego.
-- Ambos lados del juego aparecen aunque no hayan anotado (score 0).
-- Correcciones: un evento anulado por una corrección vigente no cuenta;
-- una corrección anulada por otra corrección revive al original (la SQL
-- resuelve cadenas hasta profundidad 2; cadenas más largas se rechazan en
-- el boundary de la API en Fase 1 — el motor TS sí resuelve cualquier
-- profundidad).
create view public.game_team_scores as
with sides as (
  select g.id as game_id, g.season_id, g.division_id, g.home_team_id as team_id
  from public.games g
  union all
  select g.id, g.season_id, g.division_id, g.away_team_id
  from public.games g
),
event_scores as (
  select
    ge.game_id,
    ge.team_id,
    sum(coalesce((et.def ->> 'scoreDelta')::numeric, 0))::int as score
  from public.game_events ge
  join public.games g on g.id = ge.game_id
  join public.seasons s on s.id = g.season_id
  join public.leagues l on l.id = s.league_id
  join public.sports sp on sp.id = l.sport_id
  left join lateral (
    select def
    from jsonb_array_elements(sp.config -> 'eventTypes') as def
    where def ->> 'key' = ge.event_type
  ) et on true
  where ge.event_type <> 'correction'
    and ge.team_id is not null
    and not exists (
      select 1
      from public.game_events c
      where c.event_type = 'correction'
        and c.corrects_event_id = ge.id
        and not exists (
          select 1
          from public.game_events c2
          where c2.event_type = 'correction'
            and c2.corrects_event_id = c.id
        )
    )
  group by ge.game_id, ge.team_id
)
select
  sides.game_id,
  sides.season_id,
  sides.division_id,
  sides.team_id,
  coalesce(es.score, 0) as score
from sides
left join event_scores es
  on es.game_id = sides.game_id and es.team_id = sides.team_id;

-- Vista interna: se consulta como dueño (postgres) desde la matview.
-- No exponerla a clientes.
revoke all on public.game_team_scores from anon, authenticated;

-- Capa 2: agregados crudos. Los puntos salen de sports.config
-- (pointsFor.win/tie/loss) — genérico entre deportes.
create materialized view public.standings as
select
  gts.season_id,
  gts.division_id,
  gts.team_id,
  count(*)::int as played,
  (count(*) filter (where gts.score > opp.score))::int as wins,
  (count(*) filter (where gts.score < opp.score))::int as losses,
  (count(*) filter (where gts.score = opp.score))::int as ties,
  (
    count(*) filter (where gts.score > opp.score)
      * coalesce((sp.config -> 'standings' -> 'pointsFor' ->> 'win')::numeric, 0)
    + count(*) filter (where gts.score = opp.score)
      * coalesce((sp.config -> 'standings' -> 'pointsFor' ->> 'tie')::numeric, 0)
    + count(*) filter (where gts.score < opp.score)
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

-- Requisito de REFRESH CONCURRENTLY: índice único que cubra todas las filas.
create unique index standings_unique_idx
  on public.standings (season_id, division_id, team_id) nulls not distinct;

-- Las matviews no aceptan RLS: se revoca el acceso directo y se expone la
-- capa pública filtrada (capa 3).
revoke all on public.standings from anon, authenticated;

-- Se invoca al finalizar un partido (finalize_game(), Fase 1) o manualmente.
create or replace function public.refresh_standings()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.standings;
end;
$$;

revoke all on function public.refresh_standings() from public, anon;
grant execute on function public.refresh_standings() to authenticated;

-- Capa 3: vista pública (con derechos del dueño, por eso filtra
-- explícitamente a ligas publicadas; no expone nada más).
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
