-- Enums del dominio.
-- NOTA: game_events.event_type es TEXT deliberadamente, no enum: los tipos
-- de evento son configuración del deporte (sports.config), no esquema.

create type public.app_role as enum (
  'super_admin',
  'org_admin',
  'season_manager',
  'scorekeeper',
  'referee',
  'team_captain'
);

create type public.season_status as enum ('draft', 'active', 'completed', 'archived');

create type public.game_status as enum ('scheduled', 'in_progress', 'finalized', 'canceled', 'forfeit');

create type public.roster_status as enum ('active', 'inactive');

create type public.assignment_role as enum ('scorekeeper', 'referee');
