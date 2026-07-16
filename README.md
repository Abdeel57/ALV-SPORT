# ALV SPORT — League OS

PWA multi-tenant para administrar ligas deportivas amateur y semi-profesionales en México: inscripciones, calendario, anotación en vivo, estadísticas, tablas y perfiles. Primer cliente: liga de softbol lento. El núcleo soporta cualquier deporte por configuración (basquetbol incluido como prueba).

**Stack:** Next.js 15 (App Router) · TypeScript estricto · Supabase (Postgres + Auth + Realtime + RLS) · Tailwind v4 + shadcn/ui · Serwist (PWA) · Zod · Vitest.

## Arquitectura en 4 reglas

1. **`game_events` es la fuente única de verdad.** Append-only; cada acción del partido es una fila. Correcciones = evento `correction` que anula al referenciado. Protegido por RLS (sin políticas de UPDATE/DELETE) y por trigger `forbid_change`.
2. **Cada deporte es configuración, no código.** `sports.config` (jsonb) cumple el schema Zod de [lib/engine/sport-config.ts](lib/engine/sport-config.ts): tipos de evento, efecto en el marcador, periodos, desempates y stats por jugador. Agregar un deporte = insertar una fila.
3. **Standings y stats siempre derivados.** La vista materializada `standings` agrega crudo desde eventos; el orden y los desempates viven SOLO en [lib/engine/standings.ts](lib/engine/standings.ts) (una implementación, con pruebas). `games.home_score/away_score` es caché derivado, jamás fuente.
4. **Multi-tenant por RLS.** `organizations → leagues → seasons → divisions → teams → rosters → games`. Roles en `organization_members`; los permisos se aplican en Postgres ([supabase/migrations/20260716001100_rls_policies.sql](supabase/migrations/20260716001100_rls_policies.sql)), no solo en UI. Mutaciones administrativas quedan en `audit_log` vía trigger.

## Desarrollo

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # pruebas del motor (no requieren base de datos)
pnpm typecheck
pnpm lint
pnpm build        # genera también el service worker (public/sw.js)
```

Las pruebas del motor calculan marcador, standings (con desempates head-to-head y diferencial) y estadísticas por jugador desde los datos seed, para softbol y basquetbol — sin tocar la red.

## Conectar a Supabase Cloud

No se requiere Docker. Con un proyecto creado en [supabase.com](https://supabase.com):

```bash
pnpm dlx supabase login
pnpm dlx supabase link --project-ref TU-PROJECT-REF
pnpm dlx supabase db push        # aplica las 12 migraciones
```

Para sembrar datos de demostración, pega el contenido de [supabase/seed.sql](supabase/seed.sql) en el SQL Editor del dashboard (o `pnpm dlx supabase db push --include-seed` si tu CLI lo soporta). Después copia `.env.example` a `.env.local` y llena la URL y la anon key del proyecto.

> **Nota sobre el usuario seed:** el seed inserta un usuario ficticio en `auth.users` (`seed-admin@alvsport.mx`) porque `game_events.created_by` y `organization_members` lo requieren. Si tu proyecto rechaza ese insert, crea un usuario real en Authentication → Users y reemplaza el UUID `a0000000-0000-4000-8000-000000000001` en el seed (o regenera con `pnpm seed:generate` tras cambiar `SEED_ADMIN_USER_ID` en [lib/seed-data/ids.ts](lib/seed-data/ids.ts)).

## Seeds y fixtures: una sola fuente

Los datos seed viven como objetos TypeScript en [lib/seed-data/](lib/seed-data/). De ahí salen **las dos cosas**:

- `supabase/seed.sql` — generado con `pnpm seed:generate` (determinista; no editar a mano).
- Los fixtures de las pruebas de Vitest.

Así, lo que prueban las pruebas es exactamente lo que se siembra.

## Agregar un deporte nuevo (sin tocar el motor)

1. Escribe el objeto de configuración que cumpla `sportConfigSchema` (usa [lib/seed-data/basketball-config.ts](lib/seed-data/basketball-config.ts) como plantilla): tipos de evento con `scoreDelta` y `playerStats`, estructura de periodos, `pointsFor` y `tiebreakers`.
2. Inserta la fila en `sports` (`key`, `name`, `config`).
3. Listo: mesa de anotación, marcador, standings y stats funcionan con la nueva config. La guía completa con demostración (voleibol) llega en la Fase 5.

## Estructura

```
app/                  # App Router (server components por defecto)
components/ui/        # shadcn/ui
lib/engine/           # Motor puro: marcador, standings, stats (con pruebas)
lib/seed-data/        # Fuente única: seeds SQL + fixtures de pruebas
lib/supabase/         # Clientes browser/server/middleware (@supabase/ssr)
scripts/              # generate-seed.ts
supabase/migrations/  # 12 migraciones versionadas (RLS en todas las tablas)
supabase/seed.sql     # Generado — no editar a mano
```

## Mesa de anotación (Fase 1)

- **`/anotador`** — lista de partidos asignados al anotador autenticado (rol vía `game_assignments`).
- **`/anotador/[gameId]`** — flujo completo: confirmar alineaciones (titulares + orden al bat) → `start_game()` → pantalla de anotación → finalizar con doble confirmación → `finalize_game()` (deriva el caché de marcador y refresca standings).
- **`/anotador/demo`** — la misma mesa, 100% local con el partido seed (sin Supabase): ideal para probar el modo offline.
- **`/partido/[gameId]`** — marcador público en vivo vía Realtime.

**Offline-first:** cada evento se escribe primero en IndexedDB (`lib/offline/`) con UUID generado en cliente; el sync engine sube la cola **en orden** con upsert idempotente (`ignoreDuplicates`) — reintentar jamás duplica. Si la app se cierra a media anotación, al reabrir se recupera la cola y el punto exacto del partido. Los botones de acción se generan desde `sports.config`: cero código específico de softbol.

## Sitio público (Fase 2)

Mobile-first (390px primero), tema oscuro ALV, es-MX:

- **`/`** — en vivo (Realtime), próximos, resultados, top de la tabla y jugadores destacados, con selector de liga.
- **`/partido/[id]`** — header con colores oficiales, marcador por periodo y tabs Resumen / Timeline / Estadísticas / Alineaciones; EN VIVO se actualiza sin recargar.
- **`/tabla`** — standings con los desempates del config del deporte (una sola implementación: `rankStandings` del motor).
- **`/equipo/[slug]`** y **`/jugador/[id]`** — perfiles con racha, plantilla, stats por jornada y gráfica.
- **`/buscar?q=`** — búsqueda global (equipos, jugadores, partidos).

La capa de datos ([lib/data/](lib/data/)) tiene dos proveedores con el mismo contrato: **Supabase** (con Realtime) cuando hay proyecto configurado, y **seed** (calculado con el motor, sin red) cuando no — misma UI en ambos casos. Lighthouse mobile: home 97/100, partido 93/100 (Performance/Accesibilidad).

## Panel administrativo (Fase 3)

`/admin` — protegido para `org_admin`/`season_manager`, mobile-first (nav inferior en móvil, sidebar en desktop):

- **Dashboard**: partidos de hoy, pendientes (pagos por confirmar, sanciones activas, partidos sin anotador) y accesos rápidos.
- **CRUDs** con validación Zod es-MX: temporadas, divisiones, equipos (escudo/color a Storage), jugadores (foto, roster con elegibilidad), sedes/canchas, asignación de anotadores/árbitros por correo.
- **Generador de calendario**: round-robin (motor puro, [lib/engine/schedule.ts](lib/engine/schedule.ts), con pruebas) con canchas/horarios/descanso mínimo/doble vuelta → vista previa → publicar → ajuste manual.
- **Inscripciones y pagos**: registrar → aprobar → Mercado Pago (checkout + webhook `/api/webhooks/mercadopago`) o efectivo con nota.
- **Sanciones**: por jugador con partidos derivados de juegos finalizados; un suspendido no puede ser titular en la mesa (bloqueado en RLS y en UI).
- **Noticias y patrocinadores**: se reflejan en el sitio público (portada, partido, footer).
- **Auditoría** filtrable (solo org_admin) sobre `audit_log`.

Mercado Pago requiere `MP_ACCESS_TOKEN` y `SUPABASE_SERVICE_ROLE_KEY` (ver `.env.example`); sin ellos, el flujo de efectivo funciona igual.

## Fases

- **Fase 0:** fundación — modelo de datos, RLS, motor, seeds, PWA base. ✅
- **Fase 1:** mesa de anotación (offline-first) + Realtime. ✅
- **Fase 2:** sitio público estilo Sofascore. ✅
- **Fase 3:** panel administrativo + pagos (Mercado Pago). ✅ (el criterio de los 10 minutos se corre en vivo al conectar el proyecto cloud)
- Fase 4: Web Push + resúmenes con IA.
- Fase 5: endurecimiento (pruebas RLS, rate limiting, guía multi-deporte).
