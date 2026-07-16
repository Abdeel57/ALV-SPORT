-- Partidos y asignaciones de mesa/arbitraje.

create table public.games (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  division_id uuid references public.divisions (id),
  home_team_id uuid not null references public.teams (id),
  away_team_id uuid not null references public.teams (id),
  venue_id uuid references public.venues (id),
  court_id uuid references public.courts (id),
  scheduled_at timestamptz not null,
  status public.game_status not null default 'scheduled',
  finalized_at timestamptz,
  -- CACHÉ DERIVADO del stream de game_events, nunca fuente de verdad.
  -- Solo lo escribe finalize_game() (Fase 1) y el seed (que lo deriva del
  -- motor). Prohibido editarlo a mano.
  home_score int,
  away_score int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);

alter table public.games enable row level security;

create index games_season_scheduled_idx on public.games (season_id, scheduled_at);
create index games_status_idx on public.games (status);
create index games_division_id_idx on public.games (division_id);
create index games_home_team_idx on public.games (home_team_id);
create index games_away_team_idx on public.games (away_team_id);

create trigger games_set_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

-- Quién puede anotar/arbitrar cada partido. La política de INSERT de
-- game_events exige una fila aquí con role = 'scorekeeper'.
create table public.game_assignments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.assignment_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, user_id, role)
);

alter table public.game_assignments enable row level security;

create index game_assignments_user_id_idx on public.game_assignments (user_id);
create index game_assignments_game_id_idx on public.game_assignments (game_id);

create trigger game_assignments_set_updated_at
  before update on public.game_assignments
  for each row execute function public.set_updated_at();
