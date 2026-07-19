-- Branding por liga: cada liga tiene su logotipo y color de acento propios.
-- La identidad ALV sigue siendo la base del sitio; el color de la liga tiñe
-- sus chips/acentos (mismo contrato que el color oficial de los equipos, que
-- manda dentro de sus tarjetas sin sustituir la paleta de la plataforma).

alter table public.leagues
  add column if not exists logo_url text,
  add column if not exists color text;

-- Bucket de logotipos de liga. Mismo contrato que team-logos (paths
-- <org_id>/<uuid>.<ext>, lectura pública) pero la escritura es solo de
-- org_admin: refleja el RLS de la tabla leagues, donde crear/editar ligas
-- es exclusivo de org_admin (season_manager no participa).
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('league-logos', 'league-logos', true)
  on conflict (id) do nothing;

  create policy alv_league_logos_insert on storage.objects
    for insert to authenticated with check (
      bucket_id = 'league-logos'
      and public.has_org_role((split_part(name, '/', 1))::uuid, array['org_admin']::public.app_role[])
    );
  create policy alv_league_logos_update on storage.objects
    for update to authenticated using (
      bucket_id = 'league-logos'
      and public.has_org_role((split_part(name, '/', 1))::uuid, array['org_admin']::public.app_role[])
    );
  create policy alv_league_logos_delete on storage.objects
    for delete to authenticated using (
      bucket_id = 'league-logos'
      and public.has_org_role((split_part(name, '/', 1))::uuid, array['org_admin']::public.app_role[])
    );
exception
  when undefined_table then
    raise notice 'Esquema storage no disponible (fuera de Supabase); se omite';
end $$;
