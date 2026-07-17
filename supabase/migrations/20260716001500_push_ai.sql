-- =====================================================================
-- Fase 4: Web Push + servicio de IA.
--  * push_subscriptions: suscripciones VAPID con equipos seguidos y
--    preferencias por tipo de notificación. Las escribe SOLO el servidor
--    (service role) vía /api/push/subscribe — sin políticas públicas.
--  * push_log: idempotencia de envíos (un webhook re-entregado no debe
--    notificar dos veces).
--  * ai_jobs: cola simple con reintentos (máx. 3) para el borrador de
--    noticia generado al finalizar un partido.
-- =====================================================================

create type public.ai_job_status as enum ('pending', 'running', 'done', 'failed');

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  -- null = visitante anónimo con la PWA instalada.
  user_id uuid references auth.users (id) on delete set null,
  followed_team_ids uuid[] not null default '{}',
  notify_start boolean not null default true,
  notify_period boolean not null default true,
  notify_final boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
-- Sin políticas: solo el service role (rutas del servidor) lee y escribe.

create index push_subscriptions_teams_idx
  on public.push_subscriptions using gin (followed_team_ids);

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

-- Idempotencia de notificaciones: (juego, tipo, periodo) se envía una vez.
create table public.push_log (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  kind text not null,
  period int,
  created_at timestamptz not null default now()
);

alter table public.push_log enable row level security;

create unique index push_log_dedupe_idx
  on public.push_log (game_id, kind, period) nulls not distinct;

-- Cola de generación de IA: un job por partido.
create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null unique references public.games (id) on delete cascade,
  status public.ai_job_status not null default 'pending',
  attempts int not null default 0,
  error text,
  news_id uuid references public.news (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_jobs enable row level security;

create trigger ai_jobs_set_updated_at
  before update on public.ai_jobs
  for each row execute function public.set_updated_at();

-- El admin ve el estado de los jobs; solo el servidor los escribe.
create policy ai_jobs_select on public.ai_jobs
  for select using (
    public.is_org_member(public.org_of_game(game_id)) or public.is_super_admin()
  );

-- Etiqueta de las noticias generadas por IA (nunca se publican solas).
alter table public.news add column ai_generated boolean not null default false;
