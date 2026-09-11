-- =====================================================================
-- Marcador en vivo sin el servicio Realtime.
--
-- Postgres avisa por LISTEN/NOTIFY y la app mantiene UNA conexión que
-- escucha y reparte a todos los espectadores por SSE. Sustituye al
-- servicio "Supabase Realtime" (un proceso Elixir aparte) por una
-- característica que el propio Postgres ya trae.
--
-- El aviso lleva SOLO el id del partido y el tipo de cambio: pg_notify
-- tiene un tope de 8000 bytes por mensaje, así que nunca se manda la fila
-- completa. La app releé las filas nuevas al recibir el aviso.
-- =====================================================================

create or replace function public.notify_live_change()
returns trigger
language plpgsql
as $$
declare
  v_game uuid;
  v_kind text;
begin
  if tg_table_name = 'game_events' then
    v_game := new.game_id;
    v_kind := 'event';
  else
    -- Solo interesa el cambio de estado del partido.
    if new.status is not distinct from old.status then
      return null;
    end if;
    v_game := new.id;
    v_kind := 'status';
  end if;

  perform pg_notify(
    'alv_live',
    json_build_object('gameId', v_game, 'kind', v_kind)::text
  );
  return null;
end;
$$;

comment on function public.notify_live_change() is
  'Avisa a la app (canal alv_live) que un partido cambió. Reemplaza al servicio Realtime.';

drop trigger if exists game_events_notify_live on public.game_events;
create trigger game_events_notify_live
  after insert on public.game_events
  for each row execute function public.notify_live_change();

drop trigger if exists games_notify_live on public.games;
create trigger games_notify_live
  after update of status on public.games
  for each row execute function public.notify_live_change();
