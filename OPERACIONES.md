# Operaciones — ALV SPORT

Runbook para operar la plataforma en producción con tranquilidad. Todo lo de
aquí es sobre **mantenerla viva y sana**, no sobre features.

## La plataforma en dos piezas

| Servicio | Qué es | Guarda datos |
|---|---|---|
| `app` | La aplicación Next.js: sitio público, panel, mesa de anotación y API | Sí, las imágenes (volumen en `MEDIA_ROOT`) |
| Postgres | La base de datos | Sí, todo lo demás (volumen del servicio) |

No hay nada más. Lo que antes hacían PostgREST, GoTrue, Realtime, Storage,
Kong, Imgproxy y Studio ahora lo hace la propia app o Postgres:

| Antes (servicio) | Ahora |
|---|---|
| PostgREST | SQL directo desde la app (`lib/db`), con el rol y las claims de cada usuario |
| GoTrue | Cookie de sesión firmada (`lib/auth`); contraseñas bcrypt verificadas con pgcrypto |
| Realtime | `LISTEN/NOTIFY` de Postgres + SSE (`lib/live`, `/api/live/[gameId]`) |
| Storage + Imgproxy | Volumen montado en la app (`lib/media`, ruta `/media/…`) |
| Kong | Nada: no hay API pública que enrutar |
| Studio | DBeaver, TablePlus o `psql` contra el proxy TCP |

**Las dos cosas que hay que respaldar** son el volumen de Postgres y el
volumen de imágenes. Van por separado (ver abajo).

## Compuerta de calidad (CI)

Cada push y PR a `main` dispara [.github/workflows/ci.yml](.github/workflows/ci.yml),
que corre la compuerta completa y **bloquea el merge si algo falla**:

```
typecheck → lint → test (motor) → build → seed determinista
```

Localmente, la misma compuerta antes de cualquier commit grande:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Respaldos de la base — lo más importante

> Sin respaldos, un borrado accidental = la liga pierde su temporada sin vuelta.

**Opción A — respaldo bajo demanda (ahora mismo):** requiere `pg_dump` (client
tools de PostgreSQL).

```bash
DATABASE_URL="postgresql://…@HOST:PUERTO/postgres" pnpm db:backup
# → backups/alvsport-AAAAMMDD-HHMMSS.dump   (formato custom, restaurable)
```

Restaurar:

```bash
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" backups/alvsport-….dump
```

**Opción B — respaldos gestionados (recomendado, acción tuya):** en Railway,
servicio de Postgres → **Settings → Backups** → activa respaldos automáticos
(retención diaria). Es la red de seguridad definitiva y no depende de que
alguien corra un script.

**Opción C — respaldo nocturno automático (ya configurado en el repo):** el
workflow [.github/workflows/backup.yml](.github/workflows/backup.yml) respalda
la base cada madrugada y guarda el `.dump` como artefacto (30 días). Para
**activarlo** (acción única tuya en GitHub → Settings):

- Variable: `NIGHTLY_OPS = true`
- Secreto: `DATABASE_URL` (la connection string de Postgres)

**Cadencia sugerida:** el nocturno automático + un `pnpm db:backup` manual
antes de aplicar cualquier migración de riesgo. (El managed de Railway sigue
siendo buena red adicional si activas su plan.)

### Respaldo de las imágenes (aparte de la base)

Los logos y fotos NO están en Postgres: viven en el volumen montado en
`MEDIA_ROOT` del servicio `app`. Un respaldo de la base **no los incluye**.

```bash
# Copia el volumen a tu equipo (requiere la CLI de Railway)
railway ssh --service app 'tar czf - -C /var/lib/alv-media .' > media-$(date +%Y%m%d).tar.gz
```

Si el volumen se pierde, la base sigue teniendo las URLs (`/media/…`) pero
las imágenes darán 404: se vuelven a subir desde el panel, o se restaura el
`.tar.gz`. Nada más se rompe.

## Migraciones

Versionadas en `supabase/migrations/`, aplicadas en orden con registro en
`_alv_migrations`:

```bash
DATABASE_URL="postgresql://…" pnpm db:migrate          # aplica pendientes
DATABASE_URL="postgresql://…" pnpm db:migrate --seed   # + seed si la base está vacía
```

Regla: **respaldar antes de migrar** en producción (`pnpm db:backup`).

## Observabilidad (errores)

Todos los errores del servidor (Server Components, route handlers y server
actions) se capturan en [instrumentation.ts](instrumentation.ts) → `onRequestError`,
y los del navegador llegan por el beacon `/api/telemetry` desde
[app/error.tsx](app/error.tsx). Ambos pasan por
[lib/observability.ts](lib/observability.ts), que emite **JSON estructurado a
stderr** — visible y consultable en los logs del servicio `app` en Railway.

**Ver errores:** Railway → servicio `app` → **Logs**, filtra por `app_error`.

**Upgrade a Sentry (acción tuya, opcional):** crea el proyecto en Sentry, y el
único punto a cambiar es `lib/observability.ts` (instala `@sentry/nextjs` y
reenvía ahí). Nada más en el código llama a Sentry directo, así que es un
cambio localizado. Actívalo con la variable `SENTRY_DSN`.

## Auditoría de seguridad (RLS)

Verifica que ningún rol pueda hacer lo que no debe (anón insertando eventos,
scorekeeper editando equipos, capitán leyendo pagos ajenos, webhooks sin
secreto):

```bash
DATABASE_URL="postgresql://…" APP_URL=https://alvsport.com pnpm security:audit
```

Ataca la base con la identidad real de cada rol (las mismas claims y el mismo
`SET LOCAL ROLE` que usa la app), así que prueba las políticas en sí. Cada
intento corre en una transacción que **siempre se revierte**: la auditoría no
deja rastro aunque un acceso indebido logre escribir.

**Cadencia:** córrela después de cada migración que toque RLS o políticas.
Debe dar **6/6 bloqueados**; si algo pasa, es un hueco que hay que cerrar antes
de desplegar.

**Nocturna automática (ya en el repo):**
[.github/workflows/security-audit.yml](.github/workflows/security-audit.yml)
la corre cada madrugada y **falla si algún acceso indebido pasa**. Actívala con
la variable `NIGHTLY_OPS = true` y los secretos `DATABASE_URL` y `AUDIT_APP_URL`.

## Cuentas de acceso

Ya no hay panel de Supabase: las cuentas se manejan por línea de comandos.
Escriben en la misma tabla `auth.users` y con el mismo formato de hash, así
que conviven con las cuentas que creó GoTrue.

```bash
DATABASE_URL="postgresql://…" pnpm users list
DATABASE_URL="postgresql://…" pnpm users create anotador@liga.mx 'ContrasenaLarga'
DATABASE_URL="postgresql://…" pnpm users password admin@liga.mx 'NuevaContrasena'
```

**Olvidó su contraseña:** no hay correo de recuperación (eso lo hacía GoTrue
con un SMTP). Se resuelve con `pnpm users password` y avisándole por WhatsApp.

**Asignar rol** a una cuenta nueva:

```sql
insert into public.organization_members (organization_id, user_id, role)
select o.id, u.id, 'scorekeeper'
  from public.organizations o, auth.users u
 where u.email = 'anotador@liga.mx'
 limit 1;
```

## Marcador en vivo: si deja de actualizar

El camino es: trigger en Postgres → `pg_notify('alv_live')` → la app escucha
con UNA conexión → SSE al navegador. Para diagnosticar, en orden:

1. **¿Llegan los eventos a la base?** Si el marcador está bien al recargar la
   página, la base está bien y el problema es el stream.
2. **¿Existe el trigger?**
   ```sql
   select tgname from pg_trigger where tgname like '%notify_live%';
   -- deben salir game_events_notify_live y games_notify_live
   ```
3. **¿La app está escuchando?** En los logs del servicio `app`, una conexión
   con `application_name = 'alv-sport-live'`:
   ```sql
   select application_name, state from pg_stat_activity
    where application_name = 'alv-sport-live';
   ```
   Si no aparece, reinicia el servicio: la conexión se reabre sola al primer
   espectador y reintenta con espera creciente.
4. **Mientras tanto no se pierde nada.** Recargar la página siempre muestra el
   marcador correcto: se recalcula desde `game_events`.

## Base limpia (sin historial de Supabase)

Las migraciones asumen el esquema `auth`, la extensión `pgcrypto` y la función
`auth.uid()`. Una base que ya venía de Supabase los trae. Partiendo de un
Postgres limpio, créalos ANTES de la primera migración:

```sql
create extension if not exists pgcrypto;
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid,
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lee la identidad que la app fija por transacción.
create or replace function auth.uid() returns uuid
language sql stable as $
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
$;

-- Roles que usa el RLS.
do $ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $;

grant usage on schema public to anon, authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
```

## Deploy

```bash
RAILWAY_API_TOKEN=… railway up --service app --ci
```

**Rollback:** Railway → servicio `app` → **Deployments** → un deploy anterior →
**Redeploy**. Las migraciones no se revierten solas: si una rompió datos,
restaura el respaldo previo.

## Checklist de puesta a punto (acciones tuyas)

- [ ] **Poner `AUTH_SECRET`** en el servicio `app` (mín. 32 car.). Sin él nadie inicia sesión.
- [ ] **Montar el volumen** de imágenes y apuntar `MEDIA_ROOT` a su ruta.
- [ ] **Correr `pnpm media:migrate --apply`** para mover las imágenes viejas.
- [ ] **Activar respaldos gestionados** de Postgres en Railway.
- [ ] **Respaldar también el volumen de imágenes** (ver arriba).
- [ ] **Rotar el token de Railway** usado en los despliegues manuales.
- [ ] `MP_ACCESS_TOKEN` + `MP_WEBHOOK_SECRET` para cobros en línea.
- [ ] (Opcional) `SENTRY_DSN` para alertas de error.
- [ ] (Opcional) Dominio propio con HTTPS.
- [ ] Probar Web Push en un dispositivo real (la infraestructura ya está lista).
