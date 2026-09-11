# Mesa de anotación — transformación a libreta digital

Archivo de progreso de la transformación (2026-09-10). Sirve para retomar el
trabajo entre sesiones sin perder decisiones.

## Diagnóstico de la mesa anterior

1. Era un panel de "toca jugador → toca acción": riel de jugadores, botones
   generados del config del deporte y lista de los últimos 5 eventos. Sin
   libreta, sin diamantes, sin cuenta de bolas/strikes, sin outs.
2. Los eventos eran planos e independientes: un sencillo con carrera eran
   dos filas sin relación (`single` + `run`). Imposible dibujar recorridos.
3. El cambio de bateador y de media entrada era manual ("Cerrar entrada"); no
   había orden al bate vigente ni siguiente bateador automático.
4. Alineaciones: solo selección de titulares en orden de toque. Sin
   posiciones defensivas, sin reordenar, sin sustituciones ni cambios de
   pitcher.
5. El motor sumaba `scoreDelta` por evento y estadísticas por evento. Correcto
   como fuente de verdad, pero sin máquina de estado de béisbol.
6. Sin lanzador responsable, sin carreras limpias, sin outs por fildeador.
7. Producción tenía 133 eventos planos con payload `{}` (87 `run`, la
   mayoría de "resultado directo"); la nueva libreta debe seguir
   mostrándolos aunque no tengan detalle.
8. Corrección = evento `correction` sobre un evento; "deshacer" corregía el
   último. Válido, pero sin noción de jugada completa.
9. La vista pública y el SQL de standings derivan el marcador de los eventos
   `run` (scoreDelta=1). Eso NO debe cambiar.
10. No existía tema claro; la app es oscura por identidad.

## Decisiones de diseño

- **Los eventos siguen siendo la fuente de verdad.** Una jugada = varios
  eventos atómicos que comparten `payload.playId` y se guardan en UNA
  transacción. `run` sigue siendo el único evento con `scoreDelta`, así que
  el SQL de standings, el resultado directo y la vista pública no cambian.
- **Motor de libreta puro** en `lib/engine/scorebook/`: pliega los eventos
  efectivos en orden y produce alineaciones vigentes, bases, outs, cuenta,
  celdas con recorrido, línea de carreras, estadísticas de bateo, pitcheo y
  defensa. Marcador, libreta y estadísticas salen del MISMO pliegue: no
  pueden contradecirse.
- **Deporte por configuración**: los tipos de evento nuevos se agregan al
  `config jsonb` de softbol (migración de datos), no al motor genérico. El
  motor de libreta es el intérprete para deportes por entradas.
- **Perfil de reglas** (`rulesProfile`, zod) con defaults de slowpitch;
  copia versionada en `games.rules_snapshot` al iniciar. Cambiar la liga no
  reinterpreta partidos pasados.
- **Sustituciones como eventos** (`substitution`, `defensive_change`) con
  momento efectivo; las estadísticas van por `playerId` y nunca se transfieren.
- **La libreta es una hoja clara** dentro de la app oscura: tokens `--sheet-*`
  propios. El resto de la app conserva su identidad.
- **Cuenta**: el motor solo cuenta; quién decide que la 4.ª bola es base por
  bolas (o que el foul con 2 strikes es out, según reglas) es el constructor
  de jugadas, que emite los eventos correspondientes.

## Supuestos de reglamento (verificar con la liga)

- Slowpitch: 7 entradas; efectividad sobre 7 (ER × 21 / outs).
- Cuenta inicial 0-0 (configurable: hay ligas que inician 1-1).
- Foul con dos strikes = out (configurable).
- Sin robos ni toques (configurable).
- Hasta 12 bateadores; 10 defensivos con SF (short fielder) como posición 10.
- EP (jugador extra) batea sin posición defensiva. DH/PH/PR son roles, no
  posiciones.
- Ganados/perdidos/salvamentos NO se infieren: quedan como decisión revisable.

## Etapas

- [x] 1. Motor de libreta + pruebas de escenarios (21 escenarios en
      `lib/engine/scorebook/__tests__`).
- [x] 2. Config de softbol ampliada + migración
      (`supabase/migrations/20260910002300_scorebook.sql`). **Pendiente de
      aplicar en producción** (la sesión no pudo ejecutarla; ver "Despliegue").
- [x] 3. Recorrido integrado: alineación → iniciar → jugada → celda →
      marcador → estadísticas (`components/anotador/console.tsx`).
- [x] 4. Catálogos completos, corredores, sustituciones, correcciones
      (`play/play-dialog.tsx`, `panels/*`).
- [x] 5. Reportes, exportación CSV, impresión, ayuda, accesibilidad básica
      (roles ARIA, foco en paneles, targets ≥ 40 px, atajos desactivables).
- [x] 6. Verificación visual en 1366×768, 1920×1080, 1024×768 y 390×844
      (`docs/capturas-mesa/`), con Chrome headless por CDP.
- [ ] 7. Pruebas de integración de la ruta `/api/anotador/game` con
      alineaciones por posición (el harness PGlite existe; falta el caso).

## Despliegue

1. Aplicar la migración en producción (respaldo previo ya tomado:
   `backups/alvsport-20260910-223716.json`):
   `DATABASE_URL="<url pública de Railway>" pnpm db:migrate`
2. Publicar: `railway up --service app --detach`.
3. Verificar `/anotador/<gameId>` con un partido programado.

No publicar antes de migrar: la página del anotador consulta
`game_lineups.position`, `lineup_role`, `leagues.rules` y
`games.rules_snapshot`.

## Límites conocidos (honestos)

- FLEX (defiende sin batear) se captura en la alineación pero el motor aún
  no lo incorpora a la defensa: no acumula defensa ni se le atribuye
  pitcheo. Slowpitch con EP no lo necesita; béisbol con DH sí.
- El tercer strike con la tecla S se anota como ponche tirándole (K); el
  cantado (Kc) va por O → C. Deshacer (U) corrige en un toque.
- Ganado/perdido/salvamento se muestran como "pend." en el reporte: no se
  infieren del marcador.
- No hay "reabrir partido" desde la mesa (la función SQL no existe).

## Referencias visuales (aportadas por el usuario el 2026-09-10 en el chat)

Cinco fotografías de un programa de escritorio antiguo. El usuario pidió
conservar su organización pero con un diseño "más pulido y actualizado". Lo
que muestran, para poder retomar sin las imágenes:

1. **Selector de posiciones** ("Pos Alt-S"): lista vertical con insignia de
   color por grupo — cuadro (P, C, 1B, 2B, 3B, SS) en azul; jardines (LF,
   CF, RF) en verde; SF (short fielder) en amarillo; roles (DH, EX=EP, PR,
   PH) en rojo/rosa. Junto a cada insignia, el código en texto.
2. **Catálogo de outs** ("Batter Out at First"): arriba "Batted ball out"
   (secuencia libre) y "Generic strikeout"; luego sacrificio (fly, hit/toque),
   interferencia ofensiva, regla del infield fly, interferencia del público,
   acciones ilegales, y dobles plays (rodado, línea, elevado con toque). Abajo
   cinco grupos en columnas con atajo + código: Ground Outs (1-3, 3U, 3-1,
   4-3, 5-3, 6-3, 2-3, 9-3), Fly Outs (F3…F9), Pop Outs (P1…P9), Line Outs
   (L1…L9), Foul Outs (X1…X9). Botón Cancelar (C).
3. **Catálogo de llegadas a base** ("Reached First Base Safely"): Sencillo,
   Doble, Triple, Jonrón, Doble por regla, Jonrón de campo, Golpeado, Hit de
   toque, Hit de cuadro, Sencillo + 2ª por error, Sencillo + 3ª por error,
   Sencillo + anota por error, Base por bolas genérica; Sencillo y out en 2ª
   al estirar; Doble y out en 3ª al estirar; Llegó a 1ª/2ª/3ª por error;
   Elección del fildeador (y FC predefinida), Toque de sacrificio con FC,
   Interferencia del receptor, Interferencia defensiva, Interferencia
   ofensiva, Obstrucción, Elevado de sacrificio safe por bola caída. Cada
   opción trae una explicación de una línea.
4. **Resolución de corredor** ("Runner on third…"): nombre del corredor, su
   base, radios "Se queda en 3ª / Anota / Out en 3ª / Out en home", un
   diamante grande con el corredor marcado en rojo y las bases en verde,
   atajos "D - Todos se quedan" y "S - Todos anotan", botones Ok (O),
   Cancelar (C) y Ayuda (H).
5. **Libreta principal** (referencia de composición): franja superior con
   Bolas/Strikes/Outs, estadísticas del equipo al bate (AB R H RBI 2B 3B HR
   BB SO SB, AVG SLG OBP), nombre de liga y equipos, carreras por entrada
   (1…9) y totales R H E. Izquierda: apellido, nombre y posición por fila.
   Centro: cuadrícula de entradas (1…19) con un minidiamante por celda, una
   etiqueta de color arriba a la izquierda con el código (1B-1, FC, 1B+E,
   F8, L1, L6, K, K1, 3B), el número de out en círculo, una rejilla pequeña
   en la esquina inferior derecha (conteo), líneas diagonales rojas que
   marcan el fin de entrada y la celda activa resaltada en verde con un
   lápiz. Abajo a la derecha: indicador "Scorebook Not Saved".

**Comparación visual directa** (capturas en `docs/capturas-mesa/`,
2026-09-10): la libreta conserva la composición de la referencia —
franja superior con carreras por entrada y R/H/E, bolas/strikes/outs, filas
por orden al bate con insignia de posición coloreada (cuadro azul, jardines
verde, SF ámbar, roles rojo), celdas con minidiamante, etiqueta de código en
color arriba a la izquierda, número de out en círculo, cuenta de
lanzamientos abajo a la derecha y diagonal roja de fin de media entrada. Se
modernizó: hoja clara con tipografía del sistema, paneles laterales en vez
de ventanas, catálogos en mosaicos con atajo visible, resumen legible antes
de confirmar y estado de guardado discreto abajo. En 1366×768 la libreta
ocupa ~75 % del ancho con el panel de contexto abierto.
