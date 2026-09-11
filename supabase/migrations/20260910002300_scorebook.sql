-- =====================================================================
-- Libreta digital de anotación (2026-09-10).
--
-- 1. La alineación guarda posición defensiva y rol (EP, DH, PH, PR, FLEX).
-- 2. Perfil de reglas por liga (leagues.rules) y copia versionada por
--    partido (games.rules_snapshot), tomada por start_game() al iniciar:
--    cambiar la liga después NO reinterpreta partidos anteriores.
-- 3. El config de softbol incorpora los tipos de evento de la libreta
--    (lanzamientos, corredores, sustituciones…). Son configuración, no
--    código: ninguno suma al marcador, así que el SQL de standings no cambia.
-- =====================================================================

alter table public.game_lineups
  add column if not exists position text,
  add column if not exists lineup_role text not null default 'starter';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'game_lineups_role_check'
  ) then
    alter table public.game_lineups
      add constraint game_lineups_role_check
      check (lineup_role in ('starter', 'sub', 'EP', 'DH', 'PH', 'PR', 'FLEX'));
  end if;
end $$;

comment on column public.game_lineups.position is
  'Posición defensiva (P, C, 1B, 2B, 3B, SS, LF, CF, RF, SF) o null si solo batea.';
comment on column public.game_lineups.lineup_role is
  'starter | sub | EP (jugador extra) | DH | PH | PR | FLEX (solo defiende).';

alter table public.leagues add column if not exists rules jsonb;
alter table public.games add column if not exists rules_snapshot jsonb;

comment on column public.leagues.rules is
  'Perfil de reglas (lib/engine/scorebook/rules.ts). null = slowpitch por omisión.';
comment on column public.games.rules_snapshot is
  'Copia del perfil de reglas al iniciar el partido. Nunca se reinterpreta.';

-- start_game toma la copia de reglas en la misma transacción que abre el
-- partido (con derechos del definidor: el anotador no edita games).
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
  update public.games g
     set status = 'in_progress',
         rules_snapshot = coalesce(
           g.rules_snapshot,
           (select l.rules
              from public.seasons s
              join public.leagues l on l.id = s.league_id
             where s.id = g.season_id)
         )
   where g.id = p_game;
end;
$$;

-- Config canónico de softbol (misma fuente que lib/seed-data/softball-config.ts).
update public.sports
   set config = '{"version":1,"eventTypes":[{"key":"run","label":"Carrera","scoreDelta":1,"playerStats":[{"key":"R","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"single","label":"Sencillo","scoreDelta":0,"playerStats":[{"key":"H","increment":1},{"key":"AB","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"double","label":"Doble","scoreDelta":0,"playerStats":[{"key":"2B","increment":1},{"key":"H","increment":1},{"key":"AB","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"triple","label":"Triple","scoreDelta":0,"playerStats":[{"key":"3B","increment":1},{"key":"H","increment":1},{"key":"AB","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"home_run","label":"Cuadrangular","scoreDelta":0,"playerStats":[{"key":"HR","increment":1},{"key":"H","increment":1},{"key":"AB","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"out","label":"Out","scoreDelta":0,"playerStats":[{"key":"AB","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"strikeout","label":"Ponche","scoreDelta":0,"playerStats":[{"key":"SO","increment":1},{"key":"AB","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"walk","label":"Base por bolas","scoreDelta":0,"playerStats":[{"key":"BB","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"intentional_walk","label":"Base intencional","scoreDelta":0,"playerStats":[{"key":"BB","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"hbp","label":"Golpeado","scoreDelta":0,"playerStats":[{"key":"HBP","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"fielders_choice","label":"Elección del fildeador","scoreDelta":0,"playerStats":[{"key":"AB","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"reach_on_error","label":"Llega por error","scoreDelta":0,"playerStats":[{"key":"AB","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"sac_fly","label":"Elevado de sacrificio","scoreDelta":0,"playerStats":[{"key":"SF","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"sac_bunt","label":"Toque de sacrificio","scoreDelta":0,"playerStats":[{"key":"SH","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"interference","label":"Interferencia u obstrucción","scoreDelta":0,"playerStats":[],"requiresPlayer":true,"payloadFields":[]},{"key":"rbi","label":"Carrera impulsada","scoreDelta":0,"playerStats":[{"key":"RBI","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"pitch_ball","label":"Bola","scoreDelta":0,"playerStats":[],"requiresPlayer":true,"payloadFields":[]},{"key":"pitch_strike","label":"Strike","scoreDelta":0,"playerStats":[],"requiresPlayer":true,"payloadFields":[]},{"key":"pitch_foul","label":"Foul","scoreDelta":0,"playerStats":[],"requiresPlayer":true,"payloadFields":[]},{"key":"runner_advance","label":"Avance de corredor","scoreDelta":0,"playerStats":[],"requiresPlayer":true,"payloadFields":[]},{"key":"runner_out","label":"Corredor out","scoreDelta":0,"playerStats":[],"requiresPlayer":true,"payloadFields":[]},{"key":"stolen_base","label":"Base robada","scoreDelta":0,"playerStats":[{"key":"SB","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"caught_stealing","label":"Out robando","scoreDelta":0,"playerStats":[{"key":"CS","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"pickoff","label":"Out por pickoff","scoreDelta":0,"playerStats":[],"requiresPlayer":true,"payloadFields":[]},{"key":"error","label":"Error","scoreDelta":0,"playerStats":[{"key":"E","increment":1}],"requiresPlayer":true,"payloadFields":[]},{"key":"wild_pitch","label":"Lanzamiento descontrolado","scoreDelta":0,"playerStats":[],"requiresPlayer":true,"payloadFields":[]},{"key":"passed_ball","label":"Passed ball","scoreDelta":0,"playerStats":[],"requiresPlayer":true,"payloadFields":[]},{"key":"balk","label":"Balk","scoreDelta":0,"playerStats":[],"requiresPlayer":true,"payloadFields":[]},{"key":"substitution","label":"Sustitución","scoreDelta":0,"playerStats":[],"requiresPlayer":true,"payloadFields":[]},{"key":"defensive_change","label":"Cambio defensivo","scoreDelta":0,"playerStats":[],"requiresPlayer":false,"payloadFields":[]},{"key":"half_inning_end","label":"Fin de media entrada","scoreDelta":0,"playerStats":[],"requiresPlayer":false,"payloadFields":[]}],"periodStructure":{"type":"innings","count":7,"label":"Entrada","allowsTies":false,"overtime":{"enabled":true,"maxExtra":null}},"standings":{"rankBy":"points","pointsFor":{"win":2,"tie":1,"loss":0},"tiebreakers":["head_to_head","score_diff","score_for"],"winnerBy":"total_score"},"playerStatDefs":[{"key":"R","label":"Carreras"},{"key":"H","label":"Hits"},{"key":"AB","label":"Turnos al bat"},{"key":"2B","label":"Dobles"},{"key":"3B","label":"Triples"},{"key":"HR","label":"Cuadrangulares"},{"key":"SO","label":"Ponches"},{"key":"BB","label":"Bases por bolas"},{"key":"HBP","label":"Golpeados"},{"key":"RBI","label":"Carreras impulsadas"},{"key":"SF","label":"Elevados de sacrificio"},{"key":"SH","label":"Toques de sacrificio"},{"key":"SB","label":"Bases robadas"},{"key":"CS","label":"Outs robando"},{"key":"E","label":"Errores"}]}'::jsonb
 where key = 'softball';
