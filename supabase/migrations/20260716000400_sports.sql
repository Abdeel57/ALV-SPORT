-- Cada deporte es configuración, no código. `config` cumple el schema Zod
-- de lib/engine/sport-config.ts: tipos de evento, cómo afectan el marcador,
-- estructura de periodos, reglas de standings y estadísticas por jugador.
-- Agregar un deporte = insertar una fila. Cero cambios al motor.

create table public.sports (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  config jsonb not null,
  -- null = fila del catálogo global; con valor = deporte personalizado de una org.
  organization_id uuid references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sports enable row level security;

create trigger sports_set_updated_at
  before update on public.sports
  for each row execute function public.set_updated_at();
