-- Bitácora de auditoría: toda mutación administrativa queda registrada
-- (quién, qué, antes/después, cuándo). La escribe exclusivamente el trigger
-- write_audit() (security definer); ningún rol tiene política de INSERT.

create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid,
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create index audit_log_org_created_idx on public.audit_log (organization_id, created_at desc);

create trigger audit_log_forbid_change
  before update or delete on public.audit_log
  for each row execute function public.forbid_change();

-- Trigger genérico: extrae organization_id si la tabla lo tiene y registra
-- old/new completos como jsonb.
create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_record_id uuid;
  v_org_id uuid;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;
  v_record_id := (v_row ->> 'id')::uuid;
  v_org_id := (v_row ->> 'organization_id')::uuid;

  insert into public.audit_log (organization_id, actor_id, action, table_name, record_id, before, after)
  values (
    v_org_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    v_record_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Tablas administrativas auditadas.
create trigger organizations_audit after insert or update or delete on public.organizations
  for each row execute function public.write_audit();
create trigger organization_members_audit after insert or update or delete on public.organization_members
  for each row execute function public.write_audit();
create trigger sports_audit after insert or update or delete on public.sports
  for each row execute function public.write_audit();
create trigger leagues_audit after insert or update or delete on public.leagues
  for each row execute function public.write_audit();
create trigger seasons_audit after insert or update or delete on public.seasons
  for each row execute function public.write_audit();
create trigger divisions_audit after insert or update or delete on public.divisions
  for each row execute function public.write_audit();
create trigger venues_audit after insert or update or delete on public.venues
  for each row execute function public.write_audit();
create trigger courts_audit after insert or update or delete on public.courts
  for each row execute function public.write_audit();
create trigger teams_audit after insert or update or delete on public.teams
  for each row execute function public.write_audit();
create trigger players_audit after insert or update or delete on public.players
  for each row execute function public.write_audit();
create trigger rosters_audit after insert or update or delete on public.rosters
  for each row execute function public.write_audit();
create trigger games_audit after insert or update or delete on public.games
  for each row execute function public.write_audit();
create trigger game_assignments_audit after insert or update or delete on public.game_assignments
  for each row execute function public.write_audit();
