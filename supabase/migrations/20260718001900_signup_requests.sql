-- =====================================================================
-- Auto-registro público (quita carga administrativa): coaches y jugadores
-- se inscriben ellos mismos desde el sitio. La entrada es una bandeja de
-- SOLICITUDES (append controlado) que NADIE público toca directo: el único
-- camino de escritura para anon es la función submit_signup_request()
-- (SECURITY DEFINER, valida en el servidor). El admin las materializa en
-- equipos/jugadores reales con un clic. Nada público escribe en teams,
-- players ni rosters.
-- =====================================================================

create type public.signup_kind as enum ('coach', 'player');
create type public.signup_status as enum ('pending', 'contacted', 'approved', 'rejected');

create table public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  season_id uuid references public.seasons (id) on delete set null,
  kind public.signup_kind not null,
  status public.signup_status not null default 'pending',
  full_name text not null,
  email text not null,
  phone text,
  -- coach: nombre/color del equipo propuesto; jugador: null
  team_name text,
  team_color text,
  -- jugador: equipo existente al que se quiere unir (null = agente libre)
  preferred_team_id uuid references public.teams (id) on delete set null,
  position text,
  jersey_number text,
  message text,
  -- extras por deporte / campos futuros sin migración
  payload jsonb not null default '{}'::jsonb,
  -- qué se creó al aprobar (para no duplicar y para trazabilidad)
  resolved_team_id uuid references public.teams (id) on delete set null,
  resolved_player_id uuid references public.players (id) on delete set null,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.signup_requests enable row level security;

create index signup_requests_inbox_idx
  on public.signup_requests (organization_id, status, created_at desc);
create index signup_requests_season_idx on public.signup_requests (season_id);
-- Antiabuso: throttle por correo (ver función).
create index signup_requests_email_idx on public.signup_requests (lower(email), created_at desc);

create trigger signup_requests_set_updated_at
  before update on public.signup_requests
  for each row execute function public.set_updated_at();
create trigger signup_requests_audit
  after insert or update or delete on public.signup_requests
  for each row execute function public.write_audit();

-- ---------------------------------------------------------------------
-- RLS: solo admin/manager de la org (o super_admin) leen/gestionan. Los
-- datos incluyen correo y teléfono: NADA de lectura pública. No hay
-- política de INSERT para anon a propósito — se entra solo por la función.
-- ---------------------------------------------------------------------
create policy signup_requests_select on public.signup_requests
  for select using (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );
create policy signup_requests_update on public.signup_requests
  for update using (
    public.has_org_role(organization_id, array['org_admin','season_manager']::public.app_role[])
    or public.is_super_admin()
  );
create policy signup_requests_delete on public.signup_requests
  for delete using (
    public.has_org_role(organization_id, array['org_admin']::public.app_role[])
    or public.is_super_admin()
  );

-- ---------------------------------------------------------------------
-- Único camino de escritura para el público. La org se DERIVA de la
-- temporada (que debe pertenecer a una liga publicada): así no se expone
-- ningún id de organización ni se confía en el cliente.
-- ---------------------------------------------------------------------
create or replace function public.submit_signup_request(
  p_season uuid,
  p_kind text,
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_team_name text default null,
  p_team_color text default null,
  p_preferred_team uuid default null,
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
  v_org uuid;
  v_kind public.signup_kind;
  v_id uuid;
begin
  -- Deriva y valida la temporada/liga (publicada).
  select l.organization_id into v_org
  from public.seasons s
  join public.leagues l on l.id = s.league_id
  where s.id = p_season and l.is_published;
  if v_org is null then
    raise exception 'La temporada no está disponible para inscripción';
  end if;

  begin
    v_kind := p_kind::public.signup_kind;
  exception when others then
    raise exception 'Tipo de inscripción inválido';
  end;

  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'El nombre es obligatorio';
  end if;
  if coalesce(p_email, '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'El correo no es válido';
  end if;
  if v_kind = 'coach' and length(trim(coalesce(p_team_name, ''))) < 2 then
    raise exception 'El nombre del equipo es obligatorio para coaches';
  end if;
  -- El equipo preferido (jugador) debe pertenecer a esa temporada publicada.
  if p_preferred_team is not null and not exists (
    select 1
    from public.teams t
    join public.divisions d on d.id = t.division_id
    where t.id = p_preferred_team and d.season_id = p_season
  ) then
    raise exception 'El equipo seleccionado no pertenece a esa temporada';
  end if;

  -- Antiabuso: máx. 5 solicitudes por correo por hora.
  if (
    select count(*) from public.signup_requests
    where lower(email) = lower(trim(p_email))
      and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'Demasiadas solicitudes con este correo; intenta más tarde';
  end if;

  insert into public.signup_requests (
    organization_id, season_id, kind, full_name, email, phone,
    team_name, team_color, preferred_team_id, position, jersey_number, message
  ) values (
    v_org, p_season, v_kind, trim(p_full_name), lower(trim(p_email)), nullif(trim(p_phone), ''),
    nullif(trim(p_team_name), ''), nullif(trim(p_team_color), ''), p_preferred_team,
    nullif(trim(p_position), ''), nullif(trim(p_jersey), ''), nullif(trim(p_message), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_signup_request(
  uuid, text, text, text, text, text, text, uuid, text, text, text
) from public;
grant execute on function public.submit_signup_request(
  uuid, text, text, text, text, text, text, uuid, text, text, text
) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Vistas de apoyo para el formulario público (mismo patrón que
-- public_standings: la vista es del owner y filtra a ligas publicadas;
-- se otorga SELECT a anon). Exponen SOLO lo necesario para elegir a qué
-- inscribirse; nada sensible.
-- ---------------------------------------------------------------------
create view public.public_open_seasons as
select
  s.id as season_id,
  s.name as season_name,
  l.id as league_id,
  l.name as league_name,
  l.slug as league_slug,
  sp.name as sport_name,
  sp.key as sport_key
from public.seasons s
join public.leagues l on l.id = s.league_id
join public.sports sp on sp.id = l.sport_id
where l.is_published
  and s.status in ('draft', 'active')
order by l.name, s.name;

grant select on public.public_open_seasons to anon, authenticated;

create view public.public_season_teams as
select
  d.season_id,
  t.id as team_id,
  t.name as team_name
from public.teams t
join public.divisions d on d.id = t.division_id
join public.seasons s on s.id = d.season_id
join public.leagues l on l.id = s.league_id
where l.is_published
order by t.name;

grant select on public.public_season_teams to anon, authenticated;
