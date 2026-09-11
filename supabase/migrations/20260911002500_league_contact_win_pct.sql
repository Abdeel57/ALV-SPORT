-- =====================================================================
-- Ajustes pedidos por la liga (2026-09-11).
--
-- 1. Contacto público de cada liga (WhatsApp, correo o enlace): la portada
--    deja de ofrecer auto-registro y muestra un solo botón de contacto.
-- 2. Softbol ordena la tabla por porcentaje ganado (G ÷ JJ, en milésimas)
--    en lugar de puntos. Es configuración del deporte: el motor ya sabía
--    ordenar por win_pct; solo cambia el config y lo que muestra la tabla.
-- =====================================================================

alter table public.leagues add column if not exists contact_url text;
comment on column public.leagues.contact_url is
  'Enlace público de contacto: https://wa.me/…, mailto:… o una URL. null = sin botón.';

update public.sports
   set config = jsonb_set(config, '{standings,rankBy}', '"win_pct"'::jsonb)
 where key = 'softball';
