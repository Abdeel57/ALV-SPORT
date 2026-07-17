-- =====================================================================
-- Webhooks como triggers versionados (pg_net). En Supabase autoalojado
-- (Railway) no hay dashboard de Database Webhooks: aquí viven en el repo,
-- que además es más reproducible. Funciona igual en Supabase Cloud.
--
-- Configuración por entorno (una sola vez, vía SQL):
--   update public.app_config set value = 'https://TU-APP.up.railway.app'
--     where key = 'webhook_base_url';
--   update public.app_config set value = 'EL-MISMO-SUPABASE_WEBHOOK_SECRET'
--     where key = 'webhook_secret';
-- Con webhook_base_url vacío los triggers no hacen nada (dev local).
-- =====================================================================

create table public.app_config (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;
-- Sin políticas: solo postgres/service role la leen y escriben.

create trigger app_config_set_updated_at
  before update on public.app_config
  for each row execute function public.set_updated_at();

insert into public.app_config (key, value) values
  ('webhook_base_url', ''),
  ('webhook_secret', '')
on conflict (key) do nothing;

do $$
begin
  create extension if not exists pg_net;
exception
  when others then
    raise notice 'pg_net no disponible: los webhooks quedarán inertes';
end;
$$;

-- Envío asíncrono (pg_net encola; jamás bloquea ni tumba la transacción
-- del partido — cualquier error se traga).
create or replace function public.emit_webhook(p_path text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_secret text;
begin
  select value into v_base from public.app_config where key = 'webhook_base_url';
  if coalesce(v_base, '') = '' then
    return;
  end if;
  select value into v_secret from public.app_config where key = 'webhook_secret';
  perform net.http_post(
    url := v_base || p_path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alv-webhook-secret', coalesce(v_secret, '')
    ),
    body := p_payload,
    timeout_milliseconds := 8000
  );
exception
  when others then
    null;
end;
$$;

-- Cambio de estado del partido → /api/hooks/game-status
-- (inicio → push; final → push + job de IA). Mismo shape que los
-- Database Webhooks de Supabase: {type, table, record, old_record}.
create or replace function public.games_status_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.emit_webhook(
      '/api/hooks/game-status',
      jsonb_build_object(
        'type', 'UPDATE',
        'table', 'games',
        'schema', 'public',
        'record', to_jsonb(new),
        'old_record', to_jsonb(old)
      )
    );
  end if;
  return new;
end;
$$;

create trigger games_status_webhook
  after update on public.games
  for each row execute function public.games_status_webhook();

-- Evento insertado → /api/hooks/game-events (fin de inning/periodo).
create or replace function public.game_events_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.emit_webhook(
    '/api/hooks/game-events',
    jsonb_build_object(
      'type', 'INSERT',
      'table', 'game_events',
      'schema', 'public',
      'record', to_jsonb(new)
    )
  );
  return new;
end;
$$;

create trigger game_events_webhook
  after insert on public.game_events
  for each row execute function public.game_events_webhook();
