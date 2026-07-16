-- game_events: LA FUENTE ÚNICA DE VERDAD del sistema. Append-only.
-- Nunca se edita un marcador a mano: se insertan eventos, y una corrección
-- es un evento `correction` que anula al que referencia (anular la
-- corrección con otra corrección revive al original).

create table public.game_events (
  -- El cliente PUEDE generar este uuid: es la clave de idempotencia para la
  -- sincronización offline de la mesa de anotación (Fase 1).
  id uuid primary key default gen_random_uuid(),
  -- Orden total autoritativo del servidor; el orden dentro de un juego es
  -- lo único que el motor necesita.
  seq bigint generated always as identity,
  game_id uuid not null references public.games (id) on delete cascade,
  team_id uuid references public.teams (id),
  player_id uuid references public.players (id),
  -- TEXT, no enum: los tipos válidos viven en sports.config y se validan
  -- con Zod en el boundary de la API (Fase 1).
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  -- Entrada/cuarto/set (base 1); null para eventos sin periodo.
  period int,
  -- null en deportes sin reloj (innings).
  clock_seconds int,
  corrects_event_id uuid references public.game_events (id),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  -- Una corrección referencia siempre a su objetivo, y nadie más lo hace.
  check ((event_type = 'correction') = (corrects_event_id is not null))
);

alter table public.game_events enable row level security;

-- Índices día 1: esta tabla crece sin límite.
create index game_events_game_seq_idx on public.game_events (game_id, seq);
create index game_events_game_type_idx on public.game_events (game_id, event_type);
create index game_events_player_idx on public.game_events (player_id) where player_id is not null;
create index game_events_corrects_idx on public.game_events (corrects_event_id) where corrects_event_id is not null;

-- Append-only: sin trigger de updated_at (no hay updates) y con bloqueo duro.
create trigger game_events_forbid_change
  before update or delete on public.game_events
  for each row execute function public.forbid_change();
