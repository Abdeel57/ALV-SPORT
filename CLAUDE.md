# League OS — Contexto maestro

## Proyecto

Estás construyendo **League OS**: una PWA multi-tenant para administrar ligas deportivas amateur y semi-profesionales en México. No es una página de resultados; es el sistema operativo completo de una liga: inscripciones, calendario, anotación en vivo, estadísticas, tablas, perfiles y contenido.

Primer cliente real: liga de **softbol lento (slowpitch)**. El sistema debe soportar sin reescribir el núcleo: basquetbol, fútbol, béisbol, softbol, voleibol, tochito, hockey, pádel y tenis.

## Stack (no negociable — no propongas alternativas)

- **Next.js 15** (App Router) + **TypeScript estricto** (`strict: true`, prohibido `any`)
- **Supabase**: Postgres, Auth, Realtime, Storage, RLS activado en TODAS las tablas
- **Tailwind CSS + shadcn/ui** como base de componentes
- **PWA** con Serwist: instalable, manifest completo, service worker, **Web Push notifications**
- **Zod** para validación en todos los boundaries (formularios, API, webhooks)
- Deploy: Vercel (frontend) + Supabase cloud
- Pagos: **Mercado Pago** (checkout + webhooks)

## Arquitectura de datos — LA REGLA MÁS IMPORTANTE

El núcleo multi-deporte funciona así y no de otra forma:

1. **`game_events` es la fuente única de verdad.** Tabla append-only: cada acción del partido (carrera, canasta de 3, gol, ace, falta, cambio) es una fila con `game_id`, `team_id`, `player_id`, `event_type`, `payload jsonb`, `period`, `clock`, `created_by`, `created_at`. Nunca se edita un marcador a mano: se insertan eventos, y correcciones = evento de tipo `correction` que referencia al original.
2. **Cada deporte es configuración, no código.** Tabla `sports` con `config jsonb` que define: tipos de evento válidos, cómo cada evento afecta el marcador, estructura de periodos (innings, cuartos, sets), reglas de desempate en standings, y qué estadísticas se acumulan por jugador. Agregar un deporte nuevo = insertar una fila de configuración + registrar sus event types. Cero cambios al motor.
3. **Estadísticas y standings son SIEMPRE derivadas** de `game_events`, vía vistas materializadas o funciones de Postgres que se refrescan al finalizar el partido (y en vivo vía Realtime para el marcador). Prohibido guardar totales editables a mano como fuente primaria.
4. **Jerarquía multi-tenant:** `organizations → leagues → sports → seasons → divisions/categories → teams → rosters → games`. Todo query filtra por tenant vía RLS.

## Roles y permisos

RBAC con estos roles mínimos: `super_admin` (plataforma), `org_admin` (dueño de liga), `season_manager`, `scorekeeper` (anotador, solo puede insertar eventos de partidos asignados), `referee`, `team_captain` (gestiona su roster e inscripción), `public` (solo lectura). Los permisos se aplican en RLS de Postgres, no solo en UI. Toda mutación administrativa se registra en tabla `audit_log` (quién, qué, antes/después, cuándo).

## Identidad de marca — ALV SPORT

La plataforma se llama **ALV SPORT** ("All Leagues"). El logo es texto blanco metálico en itálica condensada sobre negro, con un swoosh de gradiente rojo → ámbar → plata. Toda la UI deriva de esto:

- **Tokens de color (CSS variables):**
  - `--bg`: #0A0A0B (negro base) / superficie elevada #141416 — el modo oscuro es el modo POR DEFECTO; el claro es secundario.
  - `--brand-red`: #E32B1E
  - `--brand-amber`: #F5A50B
  - `--brand-silver`: #C9CDD3 (acentos metálicos, bordes sutiles)
  - `--text`: #F5F6F7 sobre oscuro
  - Gradiente de marca: `linear-gradient(90deg, #E32B1E 0%, #F5A50B 55%, #C9CDD3 100%)` — usar SOLO como acento: barra de partido en vivo, subrayado de tab activo, borde del MVP, progress bars. Nunca como fondo de bloques grandes de texto.
- **Tipografía:** display en itálica condensada bold para títulos, marcadores y nombres de equipo (ej. "Saira Condensed" o "Kanit" en italic, uppercase, tracking ligeramente negativo); cuerpo en sans neutra legible (Inter). Marcadores siempre en tabular-nums.
- **Personalidad:** oscuro, veloz, broadcast deportivo (ESPN de noche). Tarjetas con borde 1px `--brand-silver` al 15% de opacidad; el rojo indica EN VIVO, el ámbar indica destacados/MVP.
- El swoosh puede reinterpretarse como divisor diagonal sutil en headers de sección, no repetir el logo por todos lados.
- Los colores de marca son de la PLATAFORMA; los colores oficiales de cada equipo siguen viniendo de la base de datos y mandan dentro de sus propias tarjetas y perfiles.

## Reglas de diseño (verificables, no adjetivos)

- **Mobile-first estricto:** todo se diseña primero a 390px de ancho. La mesa de anotación se diseña a tamaño tablet (768–1024px) en landscape.
- Tema oscuro por defecto (identidad ALV) con modo claro opcional, todo vía tokens CSS; nunca colores hardcodeados en componentes.
- Tipografía: una sola familia sans de alta legibilidad (ej. Inter) con escala definida; números de marcador y estadísticas en **tabular-nums**.
- Los colores oficiales de cada equipo vienen de la base de datos y tiñen dinámicamente sus tarjetas, perfiles y scoreboards.
- Glassmorphism solo en superficies elevadas (headers de partido en vivo, modales), nunca en texto sobre contenido.
- Animaciones: transiciones de 150–250ms; el marcador en vivo anima el cambio de número. Respeta `prefers-reduced-motion`.
- Accesibilidad: contraste AA, targets táctiles mínimo 44px, navegación por teclado en el admin.
- Estados obligatorios en toda vista: loading (skeletons), vacío (con CTA), error (con retry).

## Reglas de código

- Componentes de servidor por defecto; `"use client"` solo donde hay interactividad real.
- Lógica de dominio (scoring, standings, elegibilidad) en `/lib/engine` pura y sin dependencias de UI, con **pruebas unitarias** (Vitest) — mínimo: cálculo de marcador desde eventos, standings con desempates, y stats por jugador, para al menos 2 deportes distintos (softbol y basquetbol).
- Migraciones SQL versionadas en el repo. Nada de cambios manuales al esquema.
- Nombres de tablas y columnas en inglés; UI en español (es-MX).

## Qué NO hacer

- No inventes features fuera de la fase actual.
- No generes datos mock hardcodeados en componentes: usa seeds SQL.
- No uses localStorage para estado crítico.
- No optimices prematuramente; sí paginación y índices desde el día 1 en tablas que crecen (`game_events`, `audit_log`).
