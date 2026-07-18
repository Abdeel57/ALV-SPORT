-- =====================================================================
-- Links de invitación por equipo: el coach comparte un link y sus
-- jugadores se auto-agregan a SU equipo (por WhatsApp), sin que el admin
-- capture a nadie. Reusa toda la maquinaria de signup_requests: la unión
-- entra como una solicitud de jugador ya ligada al equipo, y el admin la
-- materializa con el mismo clic de siempre.
-- =====================================================================

alter table public.teams add column join_code text unique;

-- Código corto y legible (sin caracteres ambiguos O/0/I/1/L).
create or replace function public.gen_join_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.teams where join_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.set_team_join_code()
returns trigger
language plpgsql
as $$
begin
  if new.join_code is null then
    new.join_code := public.gen_join_code();
  end if;
  return new;
end;
$$;

create trigger teams_join_code
  before insert on public.teams
  for each row execute function public.set_team_join_code();

-- Backfill de equipos existentes (por fila: cada código ve los ya asignados).
do $$
declare r record;
begin
  for r in select id from public.teams where join_code is null loop
    update public.teams set join_code = public.gen_join_code() where id = r.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Resolver un código → equipo/liga/temporada (solo ligas publicadas).
-- Para que la página /unirse muestre a qué se está uniendo el jugador.
-- ---------------------------------------------------------------------
create or replace function public.resolve_team_invite(p_code text)
returns table (
  team_id uuid,
  team_name text,
  team_color text,
  league_name text,
  season_id uuid,
  season_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name, t.color, l.name, s.id, s.name
  from public.teams t
  join public.divisions d on d.id = t.division_id
  join public.seasons s on s.id = d.season_id
  join public.leagues l on l.id = s.league_id
  where upper(t.join_code) = upper(trim(p_code)) and l.is_published
  limit 1;
$$;

revoke all on function public.resolve_team_invite(text) from public;
grant execute on function public.resolve_team_invite(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Enviar la unión: crea una solicitud de jugador ligada al equipo del
-- código. Mismo intake seguro que submit_signup_request.
-- ---------------------------------------------------------------------
create or replace function public.submit_team_join(
  p_code text,
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_position text default null,
  p_jersey text default null,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_season uuid;
  v_org uuid;
  v_id uuid;
begin
  select t.id, d.season_id, l.organization_id
    into v_team, v_season, v_org
  from public.teams t
  join public.divisions d on d.id = t.division_id
  join public.seasons s on s.id = d.season_id
  join public.leagues l on l.id = s.league_id
  where upper(t.join_code) = upper(trim(p_code)) and l.is_published
  limit 1;
  if v_team is null then
    raise exception 'El código de invitación no es válido';
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'El nombre es obligatorio';
  end if;
  if coalesce(p_email, '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'El correo no es válido';
  end if;
  if (
    select count(*) from public.signup_requests
    where lower(email) = lower(trim(p_email))
      and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'Demasiadas solicitudes con este correo; intenta más tarde';
  end if;

  insert into public.signup_requests (
    organization_id, season_id, kind, full_name, email, phone,
    preferred_team_id, position, jersey_number, message
  ) values (
    v_org, v_season, 'player', trim(p_full_name), lower(trim(p_email)), nullif(trim(p_phone), ''),
    v_team, nullif(trim(p_position), ''), nullif(trim(p_jersey), ''), nullif(trim(p_message), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_team_join(text, text, text, text, text, text, text) from public;
grant execute on function public.submit_team_join(text, text, text, text, text, text, text) to anon, authenticated;
