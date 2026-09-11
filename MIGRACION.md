# Migración a dos servicios — guía de corte

> **Estado: pasos 1 a 7 EJECUTADOS en producción el 2026-09-10.** El sitio ya
> corre sobre la arquitectura nueva. Falta únicamente el **paso 8**: apagar
> los servicios viejos, que siguen encendidos como red de seguridad. El
> ahorro en Railway no llega hasta que se pausen.

De **9 servicios** en Railway (Supabase autoalojado) a **2**: la app y Postgres.

> **Nada se borra en el camino.** Los datos se quedan donde están: el mismo
> Postgres, el mismo volumen. Los servicios viejos siguen encendidos hasta que
> tú confirmes que todo funciona, y se apagan al final, uno por uno.

---

## Lo que cambia y lo que no

| | Antes | Después |
|---|---|---|
| Servicios | 9 | 2 |
| Base de datos | El mismo Postgres | **El mismo Postgres, sin tocar** |
| Cuentas y contraseñas | `auth.users` | **Las mismas filas y los mismos hashes** |
| Políticas RLS | 14 políticas | **Las mismas 14, sin editar** |
| Imágenes | Volumen de Storage | Volumen de la app (se copian) |
| Marcador en vivo | Websocket de Realtime | SSE sobre `LISTEN/NOTIFY` |
| Panel de base | Studio | DBeaver / TablePlus / `psql` |

Lo que la gente de la liga ve: **nada distinto**. Misma dirección, misma
contraseña, mismos datos.

---

## Antes de empezar

Ten a la mano:

- La **connection string** del Postgres (proxy TCP, para correr desde tu equipo).
- La **URL pública de Kong**, la que ya usa la app. Se necesita para descargar
  las imágenes de Storage. Se puede apagar Kong **hasta después** de este paso.
- La CLI de Railway con sesión en la cuenta dueña del proyecto.

---

## Paso 1 — Respaldar (5 minutos)

```bash
DATABASE_URL="postgresql://…" pnpm db:backup
```

Guarda el `.dump` fuera del equipo. Es la red de seguridad de todo lo demás.

---

## Paso 2 — Preparar el servicio de la app (10 minutos)

En Railway, servicio `app`:

1. **Crear un volumen** y montarlo en `/var/lib/alv-media`.
2. **Agregar variables:**

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | La URL **de red privada** del Postgres |
   | `AUTH_SECRET` | Genera uno: `openssl rand -base64 48` |
   | `MEDIA_ROOT` | `/var/lib/alv-media` |
   | `WEBHOOK_SECRET` | El mismo valor que ya tenía `SUPABASE_WEBHOOK_SECRET` |

3. **Dejar por ahora** las variables viejas de Supabase. No estorban y
   permiten volver atrás con un redeploy.

> `AUTH_SECRET` es obligatorio: sin él nadie puede iniciar sesión. Guárdalo en
> tu gestor de contraseñas — si lo cambias después, se cierran todas las
> sesiones abiertas (nadie pierde su cuenta, solo vuelven a entrar).

---

## Paso 3 — Aplicar la migración de base (2 minutos)

Agrega los triggers del marcador en vivo. Es aditivo: no modifica datos.

```bash
DATABASE_URL="postgresql://…" pnpm db:migrate
```

Verifica:

```sql
select tgname from pg_trigger where tgname like '%notify_live%';
-- game_events_notify_live
-- games_notify_live
```

---

## Paso 4 — Publicar la app (5 minutos)

```bash
railway up --service app
```

Cuando termine, revisa **en este orden**:

1. La portada carga con los partidos y la tabla.
2. `/login` con tu cuenta de siempre y tu contraseña de siempre.
3. El panel abre y lista equipos, calendario e inscripciones.
4. Un partido en `/partido/…` muestra eventos y estadísticas.

Si algo falla aquí, **para**: en Railway → `app` → Deployments → el deploy
anterior → Redeploy. Todo vuelve a como estaba, porque nada se borró.

Las imágenes todavía se ven porque siguen sirviéndose desde Storage.

---

## Paso 5 — Mover las imágenes (10 minutos)

Primero en seco, para ver qué haría:

```bash
DATABASE_URL="postgresql://…" \
STORAGE_BASE_URL="https://TU-KONG.up.railway.app" \
MEDIA_ROOT="./media-descargadas" \
pnpm media:migrate
```

Revisa el listado. Si se ve bien, descarga de verdad a tu equipo:

```bash
# (mismo comando, agregando --apply)
… pnpm media:migrate --apply
```

Esto descarga cada archivo **y reescribe la URL en la base** (`/media/…`).
Los originales **siguen en Storage**: no se borra nada.

Ahora sube la carpeta al volumen de la app:

```bash
MSYS_NO_PATHCONV=1 railway ssh --service app "mkdir -p /var/lib/alv-media"
# Copia el contenido de ./media-descargadas al volumen.
```

> Si tu versión de la CLI no permite copiar archivos, la alternativa segura es
> correr el script **dentro** del servicio (Railway → `app` → terminal) con
> `MEDIA_ROOT=/var/lib/alv-media`, que descarga directo al volumen.

Verifica: abre un equipo con escudo en el sitio. Si se ve, quedó.

Si alguna imagen no se copió, el script lo dice al final y esa fila se puede
volver a subir a mano desde el panel.

---

## Paso 6 — Probar el marcador en vivo (10 minutos)

Es lo único que conviene probar con un partido de verdad:

1. Abre la mesa de anotación en una pestaña y `/partido/…` en otra.
2. Anota una carrera.
3. El marcador público debe moverse **sin recargar**, en uno o dos segundos.

Si no se mueve, ve a la sección *Marcador en vivo: si deja de actualizar* en
[OPERACIONES.md](OPERACIONES.md). Mientras tanto nada se pierde: recargar la
página siempre muestra el marcador correcto.

---

## Paso 7 — Auditar seguridad (2 minutos)

```bash
DATABASE_URL="postgresql://…" APP_URL=https://alvsport.com pnpm security:audit
```

Debe dar **6/6 bloqueados**. Si algo pasa, no apagues nada y revisa antes.

---

## Paso 8 — Apagar los servicios viejos (uno por uno)

Solo cuando los pasos 4 a 7 estén verdes. Apaga **de uno en uno**, esperando
unos minutos entre cada uno y revisando que el sitio siga bien.

Orden sugerido, del más inofensivo al más delicado:

| # | Servicio | Por qué es seguro |
|---|---|---|
| 1 | **Supabase Studio** | Solo era un panel. No guarda nada. |
| 2 | **Postgres Meta** | Solo lo usaba Studio. |
| 3 | **Imgproxy** | La app nunca le pidió nada. |
| 4 | **Supabase Realtime** | Reemplazado por SSE (probado en el paso 6). |
| 5 | **Gotrue Auth** | Reemplazado por la sesión propia (probado en el paso 4). |
| 6 | **Postgrest** | Reemplazado por SQL directo. |
| 7 | **Kong** | Ya nadie lo llama. |
| 8 | **Supabase Storage** | **Hasta el final**, y solo si el paso 5 quedó bien. |

**No apagues Postgres.** Ese se queda: es tu base de datos.

> Empieza por **pausar** (Remove del deploy) en vez de borrar el servicio. Así,
> si algo se rompe, lo reactivas en un clic. Borra los servicios definitivamente
> una semana después, cuando estés tranquilo.
>
> **El volumen de Storage no se borra al pausar el servicio.** Consérvalo al
> menos un mes: es la copia original de todas las imágenes.

---

## Paso 9 — Limpieza final (después de una semana)

Cuando todo lleve días funcionando:

1. Quita del servicio `app` las variables viejas:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_WEBHOOK_SECRET`.
2. Borra definitivamente los servicios pausados.
3. Revisa la pestaña **Usage** del proyecto para ver el consumo nuevo.

---

## Cómo volver atrás

| En qué punto | Cómo |
|---|---|
| Pasos 1 a 4 | Redeploy del deploy anterior en Railway. Nada cambió en la base. |
| Paso 5 (imágenes) | Los archivos siguen en Storage. Restaura las URLs con el respaldo del paso 1, o reescríbelas con SQL. |
| Pasos 6 a 8 | Reactiva el servicio pausado y haz redeploy del deploy anterior. |
| Después de borrar servicios | Se vuelven a crear desde la plantilla de Supabase, apuntando al mismo Postgres. |

En todos los casos **los datos siguen intactos**: la base nunca se toca salvo
por la migración aditiva del paso 3 y el cambio de URLs de imagen del paso 5.

---

## Qué necesitas de tu lado

- [x] ~~Poner `AUTH_SECRET`~~ — generado y guardado en las variables del servicio `app`.
- [x] ~~Montar el volumen de imágenes~~ — `app-volume` en `/var/lib/alv-media`.
- [x] ~~Correr la migración y publicar~~ — hecho y verificado.
- [x] ~~Mover las imágenes~~ — 37 de 37, sirviéndose desde el volumen.
- [ ] **Probar el marcador en vivo con un partido real** (paso 6). La cadena
      completa quedó probada con un aviso manual, pero conviene verlo con
      anotación real en el próximo juego.
- [ ] **Apagar los servicios viejos uno por uno** (paso 8). Aquí llega el ahorro.
