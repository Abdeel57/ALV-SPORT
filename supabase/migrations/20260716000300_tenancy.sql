-- Jerarquía multi-tenant: la organización es la raíz de todo.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organizations enable row level security;

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- Membresías: fuente de verdad del RBAC. Los helpers de RLS consultan aquí.
create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

alter table public.organization_members enable row level security;

-- Camino caliente de RLS: cada política consulta por user_id.
create index organization_members_user_id_idx on public.organization_members (user_id);

create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function public.set_updated_at();
