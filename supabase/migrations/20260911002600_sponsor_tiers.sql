-- Niveles de patrocinio. La exposición es acumulativa:
--   main     → "Presenta" en la marquesina del marcador + barra deslizante + pie
--   official → barra deslizante + pie
--   ally     → pie de página
-- Sustituye a `placement` (portada / partido / pie), que se conserva por
-- historial pero deja de usarse.

create type public.sponsor_tier as enum ('main', 'official', 'ally');

alter table public.sponsors
  add column tier public.sponsor_tier not null default 'ally';

-- Los patrocinadores existentes conservan visibilidad: los que estaban en
-- portada o partido pasan a oficiales (barra + pie); los del pie, a aliados.
update public.sponsors
   set tier = case
                when placement = 'footer' then 'ally'::public.sponsor_tier
                else 'official'::public.sponsor_tier
              end;

create index sponsors_org_tier_idx
  on public.sponsors (organization_id, is_active, tier, sort_order);

comment on column public.sponsors.tier is
  'Nivel de patrocinio: main (marquesina, barra y pie), official (barra y pie), ally (pie).';
comment on column public.sponsors.placement is
  'Obsoleta desde 2026-09-11: la exposición se decide por tier. Se conserva por historial.';
