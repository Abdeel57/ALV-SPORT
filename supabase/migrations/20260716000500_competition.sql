-- Competencia: leagues → seasons → divisions.

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sport_id uuid not null references public.sports (id),
  name text not null,
  slug text not null,
  -- Compuerta de visibilidad pública: todo lo colgado de una liga publicada
  -- es legible por anon (ver políticas RLS).
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

alter table public.leagues enable row level security;

create index leagues_organization_id_idx on public.leagues (organization_id);
create index leagues_sport_id_idx on public.leagues (sport_id);

create trigger leagues_set_updated_at
  before update on public.leagues
  for each row execute function public.set_updated_at();

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  name text not null,
  status public.season_status not null default 'draft',
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seasons enable row level security;

create index seasons_league_id_idx on public.seasons (league_id);

create trigger seasons_set_updated_at
  before update on public.seasons
  for each row execute function public.set_updated_at();

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.divisions enable row level security;

create index divisions_season_id_idx on public.divisions (season_id);

create trigger divisions_set_updated_at
  before update on public.divisions
  for each row execute function public.set_updated_at();
