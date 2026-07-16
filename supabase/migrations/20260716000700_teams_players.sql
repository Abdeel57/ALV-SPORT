-- Equipos, jugadores y rosters.

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  -- Denormalizado a propósito: las políticas RLS verifican pertenencia a la
  -- org sin recorrer division → season → league. La separación equipo
  -- duradero / inscripción por temporada es un refactor planeado (Fase 2+).
  organization_id uuid not null references public.organizations (id) on delete cascade,
  division_id uuid not null references public.divisions (id),
  name text not null,
  slug text not null,
  -- Color oficial del equipo: tiñe sus tarjetas y scoreboards en la UI.
  color text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (division_id, slug)
);

alter table public.teams enable row level security;

create index teams_organization_id_idx on public.teams (organization_id);
create index teams_division_id_idx on public.teams (division_id);

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

create table public.players (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Enlace opcional a una cuenta (el jugador reclama su perfil en Fase 2+).
  user_id uuid references auth.users (id) on delete set null,
  first_name text not null,
  last_name text not null,
  birthdate date,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.players enable row level security;

create index players_organization_id_idx on public.players (organization_id);

create trigger players_set_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

create table public.rosters (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  jersey_number text,
  position text,
  status public.roster_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, player_id)
);

alter table public.rosters enable row level security;

create index rosters_team_id_idx on public.rosters (team_id);
create index rosters_player_id_idx on public.rosters (player_id);

create trigger rosters_set_updated_at
  before update on public.rosters
  for each row execute function public.set_updated_at();
