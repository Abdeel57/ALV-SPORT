-- Sedes y canchas/campos.

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.venues enable row level security;

create index venues_organization_id_idx on public.venues (organization_id);

create trigger venues_set_updated_at
  before update on public.venues
  for each row execute function public.set_updated_at();

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.courts enable row level security;

create index courts_venue_id_idx on public.courts (venue_id);

create trigger courts_set_updated_at
  before update on public.courts
  for each row execute function public.set_updated_at();
