# ALV SPORT — League OS

PWA multi-tenant para administrar ligas deportivas amateur y semi-profesionales en México: inscripciones, calendario, anotación en vivo, estadísticas, tablas, perfiles, notificaciones push y crónicas con IA. Primer cliente: liga de softbol lento. El núcleo soporta cualquier deporte **por configuración** — basquetbol y voleibol ya funcionan end-to-end sin una línea de código específica.

**Stack:** Next.js 15 (App Router) · TypeScript estricto · Supabase (Postgres + Auth + Realtime + Storage + RLS) · Tailwind v4 + shadcn/ui · Serwist (PWA + Web Push) · Zod · Vitest · Mercado Pago · Anthropic (claude-sonnet-4-6).

## Arquitectura en 4 reglas

1. **`game_events` es la fuente única de verdad.** Append-only; cada acción del partido es una fila (`event_type` + `payload`). Correcciones = evento `correction` que anula al referenciado (mismo partido, sin corrección-de-corrección — validado por trigger). Protegido por RLS (sin políticas de UPDATE/DELETE) y por el trigger `forbid_change`.
2. **Cada deporte es configuración, no código.** `sports.config` (jsonb) cumple el schema Zod de [lib/engine/sport-config.ts](lib/engine/sport-config.ts): tipos de evento con su efecto en el marcador, estructura de periodos (innings/cuartos/sets), `standings.winnerBy` (`total_score` o `periods_won` — así el voleibol gana por sets aunque anote menos puntos), desempates y stats por jugador. Agregar un deporte = insertar una fila ([guía abajo](#agregar-un-deporte-nuevo-sin-tocar-el-motor)).
3. **Standings y stats siempre derivados.** La vista `game_team_scores` y la matview `standings` agregan crudo desde eventos leyendo la config del deporte; el orden y los desempates viven SOLO en [lib/engine/standings.ts](lib/engine/standings.ts) (una implementación, con pruebas). `games.home_score/away_score` es caché derivado por `finalize_game()` / `rederive_game_score()`, jamás fuente.
4. **Multi-tenant por RLS.** `organizations → leagues → seasons → divisions → teams → rosters → games`. Roles en `organization_members` (`org_admin`, `season_manager`, `scorekeeper`, `referee`, `team_captain`); los permisos se aplican en Postgres ([supabase/migrations/](supabase/migrations/)), no solo en UI. Toda mutación administrativa queda en `audit_log` vía triggers.

## Modelo de datos

```mermaid
erDiagram
    organizations ||--o{ organization_members : "roles (RBAC)"
    organizations ||--o{ leagues : ""
    sports ||--o{ leagues : "config jsonb"
    leagues ||--o{ seasons : ""
    seasons ||--o{ divisions : ""
    divisions ||--o{ teams : ""
    teams ||--o{ rosters : ""
    players ||--o{ rosters : ""
    seasons ||--o{ games : ""
    teams ||--o{ games : "home/away"
    games ||--o{ game_events : "fuente de verdad (append-only)"
    games ||--o{ game_assignments : "anotador/árbitro"
    games ||--o{ game_lineups : "titulares + orden al bat"
    seasons ||--o{ registrations : "pagos (Mercado Pago/efectivo)"
    teams ||--o{ registrations : ""
    players ||--o{ sanctions : "bloquean titularidad"
    venues ||--o{ courts : ""
    courts ||--o{ games : ""
    teams ||--o{ push_subscriptions : "seguir equipo"
    games ||--o{ ai_jobs : "crónicas IA (borrador)"
    organizations ||--o{ news : ""
    organizations ||--o{ sponsors : ""
    organizations ||--o{ audit_log : "quién/qué/antes/después"

    game_events {
        uuid id "generado en cliente (idempotencia offline)"
        bigint seq "orden autoritativo"
        text event_type "definido por sports.config"
        jsonb payload
        int period
        uuid corrects_event_id "solo si event_type=correction"
    }
    sports {
        text key "softball | basketball | volleyball | ..."
        jsonb config "eventTypes, periods, standings, playerStats"
    }
    games {
        text status "scheduled → in_progress → finalized"
        int home_score "CACHÉ derivado, nunca fuente"
        int away_score "CACHÉ derivado, nunca fuente"
    }
```

Derivados (no son tablas editables): `game_team_scores` (vista: puntos **y** periodos ganados por equipo/juego), `standings` (matview, W/L/T/puntos según `winnerBy`), `public_standings` (vista pública filtrada a ligas publicadas), `player_season_stats`.

## Correr en local

```bash
pnpm install
pnpm dev          # http://localhost:3000 (sin Supabase usa el proveedor seed: motor + datos demo, cero red)
pnpm test         # 74 pruebas del motor (softbol, basquetbol y voleibol; no requieren base)
pnpm typecheck && pnpm lint
pnpm build        # build de producción + service worker (public/sw.js)
```

Con `.env.local` configurado (ver tabla), el sitio consume la base real con Realtime; sin él, la capa de datos ([lib/data/](lib/data/)) cae al proveedor seed con la misma UI.

## Variables de entorno

| Variable | Lado | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | build + server | URL del API (Kong en Railway o proyecto Supabase cloud) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | build + server | Llave anónima (RLS decide qué ve) |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Webhooks MP/push/IA (salta RLS; jamás al cliente) |
| `NEXT_PUBLIC_SITE_URL` | build + server | URL pública (back_urls de MP, links absolutos) |
| `MP_ACCESS_TOKEN` | server | Checkout + consulta de pagos de Mercado Pago |
| `MP_WEBHOOK_SECRET` | server | Valida `x-signature` del webhook de MP |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | build | Suscripción Web Push del navegador |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | server | Firma de envíos push |
| `SUPABASE_WEBHOOK_SECRET` | server | Header `x-alv-webhook-secret` de los triggers pg_net |
| `ANTHROPIC_API_KEY` | server | Crónicas IA (nunca `NEXT_PUBLIC`; endpoint no expuesto) |

Los `NEXT_PUBLIC_*` se **hornean en build** (en Railway van como build args del Dockerfile).

## Despliegue: TODO en Railway (Supabase autoalojado)

La infraestructura completa vive en Railway: el stack open-source de Supabase (Postgres + Auth + PostgREST + Realtime + Storage + Kong + Studio) y la app Next.js ([Dockerfile](Dockerfile) + [railway.json](railway.json)).

1. **Supabase** — New → Deploy Template → "Supabase". Anota la URL pública de Kong (`NEXT_PUBLIC_SUPABASE_URL`), `ANON_KEY`, `SERVICE_ROLE_KEY` y la connection string de Postgres (TCP proxy).
2. **Migraciones + seed** — el runner del repo aplica en orden y lleva registro en `_alv_migrations` (el TCP proxy de Railway no habla TLS, por eso no se usa `supabase db push`):
   ```bash
   DATABASE_URL="postgresql://supabase_admin:PASSWORD@HOST:PUERTO/postgres" pnpm tsx scripts/apply-migrations.ts --seed
   # --seed solo siembra si la base está vacía
   ```
3. **La app** — New → Service → este repo (usa el Dockerfile). Configura TODAS las variables **antes del primer build** y dale **Generate Domain** (HTTPS es requisito de Web Push).
4. **Webhooks** — son triggers pg_net versionados ([migración 16](supabase/migrations/)); apúntalos una vez:
   ```sql
   update public.app_config set value = 'https://TU-APP.up.railway.app' where key = 'webhook_base_url';
   update public.app_config set value = 'TU-SUPABASE_WEBHOOK_SECRET'   where key = 'webhook_secret';
   ```
5. **Usuarios** — Studio → Authentication → Users; asigna rol: `insert into organization_members (organization_id, user_id, role) values ('<org>','<user>','org_admin');`

> Supabase Cloud funciona como alternativa sin cambiar código: apunta las env vars al proyecto cloud y usa `supabase db push`.

## Endurecimiento (Fase 5)

- **Auditoría de accesos por rol** — [scripts/security-audit.ts](scripts/security-audit.ts) crea usuarios temporales reales y ataca la API de producción: anónimo insertando en `game_events`, scorekeeper editando equipos y anotando en partidos ajenos/cerrados, team_captain leyendo pagos de otros, webhooks de push/IA sin secreto. Resultado actual: **6/6 bloqueados**. (La corrida inicial encontró una fuga real — cualquier miembro de la org podía leer inscripciones con montos — corregida en la migración `..._fix_registrations_rls.sql`.)
- **Rate limiting** — [middleware.ts](middleware.ts): por IP, `/buscar` 20 req/min y `/api/*` 60 req/min; 429 con `Retry-After` y mensaje es-MX.
- **Índices verificados** — `EXPLAIN ANALYZE` en producción: timeline de partido usa `(game_id, seq)`, stats por jugador usa el índice parcial `player_id`, y la derivación completa de standings corre en <1 ms con los datos actuales.
- **Pagos** — el webhook de MP valida `x-signature` (HMAC-SHA256) y es idempotente (`status ≠ paid` como guarda); el estado del pago SIEMPRE se consulta de vuelta a la API de MP.
- **Paginación** — donde las tablas crecen sin límite: auditoría (50/página) y noticias (10/página); `game_events` y listados públicos ya paginaban.
- **Errores con identidad** — [app/not-found.tsx](app/not-found.tsx) y [app/error.tsx](app/error.tsx) en es-MX con la marca ALV.

## Agregar un deporte nuevo (sin tocar el motor)

La prueba ácida de la arquitectura. El voleibol se agregó así y está corriendo en producción:

1. **Escribe la config** que cumpla `sportConfigSchema` — [lib/seed-data/volleyball-config.ts](lib/seed-data/volleyball-config.ts) es la plantilla real:
   - `periods`: `{ type: "sets", count: 5 }`
   - `eventTypes`: `attack_point`, `ace`, `block_point`, `opponent_error` (todos `scoreDelta: 1`), `dig`, `assist`, `service_error` (solo stats)
   - `standings`: `{ winnerBy: "periods_won", pointsFor: { win: 3, tie: 0, loss: 0 }, tiebreakers: [...] }` — **la clave**: el ganador es quien gana más sets, no quien suma más puntos; CF/CC siguen siendo puntos reales.
2. **Inserta la fila** en `sports` (`key`, `name`, `config`) y crea liga/temporada/división/equipos desde `/admin` como siempre.
3. **No hay paso 3.** La mesa de anotación genera sus botones desde `eventTypes`, el marcador y la tabla se derivan con `winnerBy`, y el sitio público lo muestra.

Demostración reproducible ([scripts/demo-volleyball.cjs](scripts/demo-volleyball.cjs)): partido a 5 sets `25-20, 20-25, 25-23, 10-25, 15-10` — Águilas gana **3-2 en sets** con **95 puntos contra 103** del rival. El caché quedó `home_score=3, away_score=2`, la tabla pública da a Águilas 1-0 con 3 puntos, y `score_for/against` conserva los puntos reales (95/103). Si agregar un deporte te obligara a tocar `lib/engine` o el SQL, eso es un bug de arquitectura — repórtalo como tal.

Cobertura equivalente en pruebas: [lib/engine/\_\_tests\_\_/volleyball.test.ts](lib/engine/__tests__/volleyball.test.ts).

## Seeds y fixtures: una sola fuente

Los datos seed viven como objetos TypeScript en [lib/seed-data/](lib/seed-data/). De ahí salen **las dos cosas**: `supabase/seed.sql` (generado con `pnpm seed:generate`, determinista, no editar a mano) y los fixtures de Vitest. Lo que prueban las pruebas es exactamente lo que se siembra.

## Estructura

```
app/                  # App Router (server components por defecto)
  (public)/           # Sitio público: /, /partido, /tabla, /equipo, /jugador, /buscar
  admin/              # Panel: dashboard, CRUDs, calendario, pagos, sanciones, noticias, auditoría
  anotador/           # Mesa de anotación (tablet, offline-first) + /anotador/demo
  api/                # Webhooks (MP, pg_net) y push subscribe
components/           # UI (shadcn), anotador, admin
lib/engine/           # Motor puro: marcador, standings, stats, calendario (74 pruebas)
lib/offline/          # Cola IndexedDB + sync engine idempotente
lib/data/             # Proveedores público: supabase (Realtime) | seed (sin red)
lib/admin|push|ai/    # Server actions, Web Push, crónicas IA
lib/seed-data/        # Fuente única: seeds SQL + fixtures + configs de deporte
scripts/              # apply-migrations, generate-seed, security-audit, demo-volleyball
supabase/migrations/  # 18 migraciones versionadas (RLS en todas las tablas)
```

## Recorrido por fases

- **Fase 0 — Fundación** ✅ Modelo de datos completo con RLS, motor puro con pruebas (softbol + basquetbol), PWA instalable, tokens de marca ALV.
- **Fase 1 — Mesa de anotación** ✅ `/anotador`: alineaciones → anotación de 2 taps (botones desde config) → deshacer como `correction` → finalizar con doble confirmación. Offline-first: IndexedDB + sync idempotente en orden; `/anotador/demo` para probar sin cuenta.
- **Fase 2 — Sitio público** ✅ `/` (en vivo Realtime, próximos, resultados, líderes), `/partido/[id]` (tabs Resumen/Timeline/Estadísticas/Alineaciones), `/tabla` (desempates del config), perfiles de equipo/jugador, `/buscar`. Lighthouse mobile: home 97, partido 93.
- **Fase 3 — Admin** ✅ CRUDs con Zod es-MX, generador round-robin con vista previa, inscripciones con Mercado Pago (checkout + webhook) o efectivo, sanciones que bloquean titulares (RLS + UI), noticias/patrocinadores, auditoría.
- **Fase 4 — Push + IA** ✅ "Seguir equipo" → Web Push VAPID por preferencias; envío 100% servidor vía triggers pg_net con secreto; crónicas con claude-sonnet-4-6 (salida estructurada) que SIEMPRE quedan en borrador "IA — revisar" con botón Regenerar.
- **Fase 5 — Endurecimiento y entrega** ✅ Auditoría de seguridad 6/6, rate limiting, firma MP, paginación, EXPLAIN, 404/error ALV, voleibol por pura configuración, este README.

### Avisos prácticos

- **iPhone:** push solo funciona con la PWA instalada desde Safari ("Agregar a inicio"); el perfil de equipo ya muestra ese banner en iOS.
- **HTTPS obligatorio para push:** prueba en dispositivo real contra el dominio de Railway, no `localhost`.
- **Créditos IA:** la API key vive solo en el servidor y los webhooks exigen secreto — nadie puede disparar generaciones desde afuera.
