# Plan — Fase 2 de rendimiento: la simulación

> Para el agente que lo ejecute. La Fase 1 (render) ya está hecha: no toques `src/three/` salvo lo que se indica aquí.
> Idioma del código y los comentarios: español, como el resto del proyecto. Lee `AGENTS.md` antes de empezar.

## Objetivo

Que la simulación no provoque tirones a ninguna velocidad, sobre todo a ×60 y ×300, y que no se degrade con las horas
simuladas. **Sin cambiar el comportamiento de la simulación**: con la misma semilla, el resultado debe ser idéntico al
de antes (salvo en el paso 1, que solo decide cuánto se simula por fotograma, no cómo).

## Punto de partida (medido el 2026-10-14)

- Coste medio de un `tick` en Node: **0,30 ms** en la 1.ª hora simulada → 0,35 → 0,41 → **0,51 ms** en la 4.ª.
  Peor tick: **28–41 ms** (picos puntuales).
- Al cabo de 4 h: 14.049 palés en `state.paletById` y 1.159 tareas en `state.tasks`; ambos crecen con el tiempo.
- `advance()` (`src/lib/sim/clock.ts`) da pasos de 0,1 s hasta consumir `realDt × speed`, con un límite de 4.000
  pasos. A ×300 son ~50 ticks por fotograma (~25 ms) y, si un fotograma va lento, el siguiente recibe `dt = 0,1 s`, es
  decir, 300 ticks (~150 ms): **espiral de muerte**. Esta es la causa principal del lag a alta velocidad.
- Funciones con más tiempo propio en el perfil de CPU (sin orden estricto, el coste está repartido):
  `expand` (nav-distances.ts), `segmentClear` (pinto-layout.ts), `preparableAhora` (outbound-window.ts),
  `truckFreeDistance` (traffic-free.ts), `updateMachine`, `circlesGap` (traffic-footprint.ts), `sections.ts`,
  `skuHeightCounts` (stock-slots.ts), `generatePutaway`, `bultosPorPaleZona` (stock/catalog.ts), `generateWork`,
  `picking.ts`, `pibt` (nav-pibt.ts), `moveAlong`, `updateIdle`. El recolector de basura se lleva un ~5 %.
- La interfaz: `useSimulation` (`src/hooks/use-simulation.ts`) hace `setUiState({ ...simState })` cada 250 ms, lo
  que vuelve a pintar todos los paneles con el estado completo.

## Reglas de trabajo

1. **Hay otras sesiones editando el repo a la vez.** Antes de cada edición, vuelve a leer el archivo. No reviertas
   cambios ajenos y no hagas `git stash`, `git checkout --` ni commits sin que lo pida el usuario.
2. **Primero mide y después cambia.** Cada paso empieza y termina con el banco de pruebas del paso 0.
3. **Determinismo**: la simulación usa su propio generador (`nextRandom(state)`). Ninguna optimización puede cambiar
   el número ni el orden de las llamadas al generador. Compruébalo con la huella del paso 0.
4. Hay código temporal de otra sesión (p. ej. `// TEMP-Q` en `outbound-window.ts`): déjalo como está.
5. No uses el navegador para medir; el usuario ya validó la Fase 1 a ojo y prefiere que no se lancen pruebas de
   interfaz. Todo se mide en Node con scripts.

---

## Paso 0 — Banco de pruebas y huella de regresión

Crea `scripts/bench-sim.ts` (ejecución: `npx --yes tsx --tsconfig tsconfig.json scripts/bench-sim.ts [horas]`):

- Simula N horas (4 por defecto) con `createInitialState` + `makeDeps` + `tick(state, deps, 0.1)`.
- Imprime por hora: ms medios por tick, p99, peor tick y en qué hora simulada ocurrió (`formatSimTime(state.ts)`),
  número de palés, tareas y camiones.
- Imprime una **huella** final: hash simple (p. ej. FNV-1a) de
  `JSON.stringify({ ts, machines: pos/estado/taskId, trucks: pos/estado, tasks: ids, rackOccupancy, rng })`.
  Si la huella cambia tras una optimización, se ha cambiado el comportamiento: hay que deshacer o corregir.
- Guarda la línea base en el propio informe final (no en el repo).

Además ejecuta antes y después los comprobadores que ya existen: `scripts/check-sim.ts`, `check-traffic.ts` y
`check-handling.ts`. Su salida debe ser igual.

## Paso 1 — Presupuesto de tiempo por fotograma (lo que más impacto tiene)

Archivos: `src/lib/sim/clock.ts`, `src/hooks/use-simulation.ts`, `src/components/sim-controls.tsx`.

1. `advance(state, realDt, tick, opts)` acepta `budgetMs` (8 ms por defecto en el navegador) y un reloj inyectable
   (`now = () => performance.now()`), para poder probarlo en Node. Corta el bucle cuando se agota el presupuesto.
2. **Sin deuda**: el tiempo simulado que no cabe en el presupuesto se descarta (no se acumula para el fotograma
   siguiente). Así desaparece la espiral de muerte.
3. `advance` devuelve `{ steps, simulated }` y `useSimulation` calcula la **velocidad efectiva** (media móvil de
   `simulated / realDt`) y la expone. `SimControls` la muestra cuando difiere de la pedida en más de un 10 %
   (p. ej. "×300 (real ×170)").
4. Conserva el paso fijo de 0,1 s (`TICK_STEP`) y el comportamiento a ×1 (un tick de `dt` real por fotograma).
5. En `useSimulation`, limita `dt` a 0,1 s como ahora, pero mide el presupuesto desde el inicio del `step`.

Verificación: un test en `scripts/bench-sim.ts` (o un script aparte) que llame a `advance` con un reloj falso y
compruebe que nunca se pasa del presupuesto y que no acumula tiempo. La huella del paso 0 no cambia, porque la
secuencia de ticks a `dt = 0,1` es la misma.

## Paso 2 — Picos (los ticks de 28–41 ms)

1. Con el banco de pruebas, localiza en qué ticks se producen los picos (hora simulada y qué rama: cambio de turno →
   `alCambiarTurno`, `generateWork` cada 0,5 s, llegada o salida de camiones…). Instrumenta con `performance.now()`
   alrededor de cada fase de `tick` (`src/lib/sim/tick.ts`) solo en el script, no en el código final.
2. Si el pico es una fase puntual y pesada (p. ej. cargar la demanda del día siguiente), repártela entre varios ticks
   **solo si no cambia el resultado**. Si no se puede repartir sin cambiarlo, documéntalo y sigue: el presupuesto del
   paso 1 ya evita que bloquee la interfaz más de un fotograma.

## Paso 3 — Coste del tick y crecimiento con el tiempo

Optimiza en este orden y mide tras cada cambio (la huella debe mantenerse):

1. **Crecimiento**: averigua por qué `paletById` (14.000 a las 4 h) y `tasks` crecen. Solo se borran palés en
   `truck-dock.ts:171`. Comprueba si los palés expedidos o las tareas terminadas quedan en algún índice y si alguna
   función recorre listas completas en cada tick (`Object.values(state.paletById)`, `state.tasks.filter`…).
   Sustituye esos recorridos por índices mantenidos de forma incremental.
2. **Asignaciones en el bucle caliente**: por ejemplo, `nearSharedPoint` (`machine-idle.ts`) construye la lista de
   puntos en cada llamada: precalcúlala en `makeDeps` (`SimDeps`). Busca el mismo patrón (arrays, `Map` y `Set`
   creados por tick o por máquina) en `machine-update.ts`, `traffic-*.ts`, `navigator.ts`, `nav-pibt.ts` y
   `truck-motion.ts`.
3. **Funciones calientes del perfil**: `expand` (nav-distances.ts), `segmentClear` (pinto-layout.ts),
   `preparableAhora` (outbound-window.ts), `truckFreeDistance`/`circlesGap`, `skuHeightCounts`, `bultosPorPaleZona`.
   Para cada una: memoización por clave estable, índices espaciales (rejilla) en lugar de recorrer todos los
   vehículos, o cálculo una vez por tick en vez de una vez por máquina. Para obtener el perfil:
   `node --import <ruta a tsx>/dist/esm/index.mjs --cpu-prof scripts/bench-sim.ts` y agrega el tiempo propio por
   función del `.cpuprofile`.
4. `tick.ts`: `state.trucks.filter(...)` dentro del bucle de camiones y `[...state.trucks]` en cada tick: sustitúyelo
   por una pasada de compactación al final.

Objetivo orientativo: ≤ 0,2 ms por tick de media y que la 4.ª hora no cueste más de un 20 % que la 1.ª.

## Paso 4 — Interfaz: menos repintados

Archivos: `src/hooks/use-simulation.ts` y los paneles que reciben `state` (`dock-list`, `entity-label`,
`machine-card`, `event-feed`, `side-panel`, `workers-panel`, `top-bar`, `stock-panel`…).

1. Cuidado: hoy `uiState` es una copia superficial del estado mutable, así que `state.machines` o `state.trucks`
   conservan la misma referencia entre actualizaciones. Por eso un `useMemo([state.machines])` no se recalcula
   (`workers-panel.tsx:58`). Revisa si eso causa datos desfasados antes de cambiar nada.
2. Sustituye el estado completo por **instantáneas derivadas** pequeñas que se calculan cada 250 ms: reloj y turno,
   contadores, lista de muelles, eventos recientes y la ficha de la entidad seleccionada. Cada panel recibe solo la
   suya y `memo` puede cortar el repintado cuando no cambia (comparación superficial de valores).
3. Mantén el acceso al estado vivo donde hace falta en cada fotograma: `sceneRef.getLastState()` (RTLS, cámara).

Verificación: con React DevTools Profiler no es posible (no hay pruebas de interfaz). En su lugar, revisión de tipos
(`npx tsc --noEmit`) y `npx eslint` de los archivos tocados; describe en el informe qué paneles dejan de repintarse.

## Paso 5 (opcional, solo si los pasos 1–3 no bastan) — Web Worker

Solo si, tras los pasos 1–3, ×300 sigue sin alcanzar al menos ×150 efectivo. **Consulta con el usuario antes de
empezar este paso**: es el cambio más grande y el más arriesgado.

- La simulación es pura (no usa DOM), así que puede ir en un worker (`new Worker(new URL('./sim.worker.ts',
  import.meta.url))`; mira en `node_modules/next/dist/docs/` cómo empaqueta workers esta versión de Next).
- El problema es que `EntitySync.sync` (`src/three/entity-sync.ts`) lee mucho más que posiciones: maniobras
  (`handling`, `stops`, `dropped`), tareas, flejadoras, calles de pre-carga, consolidación, carga de camiones,
  `paletById`, `rackOccupancy` y `rackDirty`. Copiar el estado completo cada fotograma sería más caro que simular.
- Diseño propuesto: el worker publica a 60 Hz una **instantánea de render** compacta (lo que lee `EntitySync`, sin
  `paletById` completo: solo los palés visibles fuera de rack y un diff de `rackOccupancy`) y a 4 Hz la instantánea
  de la interfaz del paso 4. Las órdenes (velocidad, pausa, reinicio, mover flejadora) van por `postMessage`.
- Antes de programarlo, escribe un mini-diseño con el formato de la instantánea y su tamaño medido, y pide el visto
  bueno.

## Entregable

- Un informe final con la tabla antes/después del banco de pruebas (ms por tick por hora, peor tick, palés y tareas
  a las 4 h, velocidad efectiva a ×60 y ×300 con un presupuesto de 8 ms) y la huella antes y después.
- Lista de archivos tocados y cualquier cambio de comportamiento (debería ser ninguno salvo la velocidad efectiva).
- `scripts/bench-sim.ts` se queda en el repo como herramienta de medición.
