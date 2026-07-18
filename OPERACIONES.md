# Operaciones — ALV SPORT

Runbook para operar la plataforma en producción con tranquilidad. Todo lo de
aquí es sobre **mantenerla viva y sana**, no sobre features.

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
SUPABASE_URL=https://KONG… ANON_KEY=… SERVICE_ROLE_KEY=… APP_URL=https://APP… \
  pnpm security:audit
```

**Cadencia:** córrela después de cada migración que toque RLS o políticas.
Debe dar **6/6 bloqueados**; si algo pasa, es un hueco que hay que cerrar antes
de desplegar.

**Nocturna automática (ya en el repo):**
[.github/workflows/security-audit.yml](.github/workflows/security-audit.yml)
la corre cada madrugada y **falla si algún acceso indebido pasa**. Actívala con
la variable `NIGHTLY_OPS = true` y los secretos `AUDIT_SUPABASE_URL`,
`AUDIT_ANON_KEY`, `AUDIT_SERVICE_ROLE_KEY`, `AUDIT_APP_URL`.

## Deploy

```bash
RAILWAY_API_TOKEN=… railway up --service app --ci
```

**Rollback:** Railway → servicio `app` → **Deployments** → un deploy anterior →
**Redeploy**. Las migraciones no se revierten solas: si una rompió datos,
restaura el respaldo previo.

## Checklist de puesta a punto (acciones tuyas)

- [ ] **Activar respaldos gestionados** de Postgres en Railway.
- [ ] **Rotar el token de Railway** usado en los despliegues manuales.
- [ ] `ANTHROPIC_API_KEY` en el servicio `app` para encender las crónicas IA.
- [ ] `MP_ACCESS_TOKEN` + `MP_WEBHOOK_SECRET` para cobros en línea.
- [ ] (Opcional) `SENTRY_DSN` para alertas de error.
- [ ] (Opcional) Dominio propio con HTTPS.
- [ ] Probar Web Push en un dispositivo real (la infraestructura ya está lista).
