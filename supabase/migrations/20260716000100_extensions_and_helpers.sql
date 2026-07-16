-- Extensiones y funciones auxiliares compartidas.

create extension if not exists pgcrypto;

-- Mantiene updated_at en cada UPDATE (se adjunta a toda tabla mutable).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Defensa en profundidad para tablas append-only (game_events, audit_log):
-- además de no tener políticas RLS de UPDATE/DELETE, el trigger bloquea
-- cualquier intento incluso desde roles con privilegios de tabla.
create or replace function public.forbid_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La tabla % es append-only: % no está permitido', tg_table_name, tg_op;
end;
$$;
