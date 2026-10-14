# Plan de correcciones — Aldi Pinto Warehouse

Documento para ejecutar por fases con un modelo más pequeño (Haiku) y, donde se indica, con uno más potente.
Cada fase es independiente, termina con el repo compilando y tiene criterios de aceptación medibles.

## Reglas para quien ejecute

1. **Una fase = un commit** (`fix(...)`/`feat(...)` en español, como el historial). No mezclar fases. No hacer commit de `image.png`, `.claude/` ni `AGENTS.md`.
2. `AGENTS.md` avisa de que esta versión de Next.js tiene cambios incompatibles. Este plan casi no toca APIs de Next (todo es `src/three`, `src/lib/layout`, `src/lib/sim`). Si hay que tocar `src/app` o `next.config.ts`, leer antes `node_modules/next/dist/docs/`.
3. Tras cada fase ejecutar siempre:
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npx --yes tsx --tsconfig tsconfig.json scripts/check-layout.ts`
   - `npx --yes tsx --tsconfig tsconfig.json scripts/check-sim.ts` (debe seguir imprimiendo `Determinista (A==B): true`)
4. La simulación debe seguir siendo **determinista**: usar siempre `nextRandom(state)`, nunca `Math.random()` dentro de `src/lib/sim`.
5. Coordenadas: x = este (+), z = sur (+). La nave va de x −125…125, z −80…80. Muelles sur en z = 80, muelles este en x = 125. El piso de la nave está a y = 1,2 m (`NAVE_FLOOR_H`); el patio a y = 0,05.
6. Si algo del plan choca con el código real, **parar y avisar**; no improvisar geometría.

## Orden y reparto de modelos

| Fase | Contenido | Modelo recomendado | Depende de |
|---|---|---|---|
| 0 | Script de medición de colisiones | Haiku | — |
| 1 | Racks de 3 niveles y modo muros sin deformar | Haiku | — |
| 2 | Muelles más separados + pavimento este (D37–D60) | Haiku | — |
| 3 | Ampliar sala de carga y sala de máquinas | Haiku | — |
| 4 | Baños (3 ubicaciones) | Haiku | 3 |
| 5 | Camiones: cinemática y maniobra en la simulación, velocidad, inicio de turno | **Sonnet/Opus** | 2 |
| 6 | Tráfico: sin colisiones entre camiones y máquinas | **Sonnet/Opus** | 3, 5 |
| 7 | Modelos low poly mejorados | Haiku (con la especificación de abajo) | 1 |
| 7b | Europalé universal (todo sobre un palé); el GLB requiere exportar el `.max` a FBX/OBJ | Haiku | 1 |
| 8 | Docs/KB y verificación final | Haiku | todas |

Las fases 5 y 6 son diseño de simulación (reservas, prioridades, anti-bloqueo). No es sensato delegarlas a Haiku.

---

## Hallazgos medidos (por qué se hace cada cosa)

Se ejecutó una simulación de 06:00 a 10:00 (semilla por defecto) midiendo solapes cada segundo:

- **Máquinas:** 25.245 muestras con dos máquinas a menos de 1,5 m; distancia mínima 0,00 m. Se atraviesan unas a otras de forma continua.
- **Camiones:** 124 muestras con dos camiones (no atracados) a menos de 8 m; mínimo 0,04 m. Se solapan.
- **Inicio de turno:** de 06:00 a 06:15 no hay ningún camión ni tarea; la primera llegada es a las 06:15 y el siguiente camión a las 06:26. Al cabo de 4 h hay 17 camiones, **todos** en `at_dock`. Lo de «aparecen todos a la vez» no es una ráfaga del generador (salen escalonados): hay que interpretarlo como el efecto de que todos nacen en el mismo punto `KEEP_OUT` (235, 178), de que no hay báscula ni cola, y de que los camiones que esperan muelle se amontonan en un único nodo `park-e`. Se corrige en la fase 5 con ambas lecturas cubiertas (ver 5.5).
- **Racks:** `RACK_LEVELS = 4` en `src/lib/layout/pinto-layout.ts:37`, y `build-racks.ts` dibuja largueros de nivel 1 a `levels` (4 largueros + suelo = 5 alturas visibles, la superior sin nada encima).
- **Modo muros:** `rackHeightScale` (`src/three/wall-modes.ts:72`) escala en Y el grupo de racks al 30 % (recorte) y 12 % (bajado). Efectos: los palés estáticos se aplastan; el grupo interior de racks tiene `position.y = 1,2` y al escalar el padre se hunde bajo el suelo de la nave; y los palés dinámicos (`slotMesh`, `dynamicPalets`) y las horquillas **no** se escalan, así que flotan a altura real.
- **Muelles 37–60:** son la batería este (índices 36–59). `buildRoads` solo pavimenta `site.yard` (z 80…120). Al este de x = 125 solo existe el terreno.
- **Muelles juntos:** `DOCK_PITCH = 3,5` m con puertas de 3 m y remolques de 2,55 m: quedan 0,95 m entre remolques.

Otros defectos detectados (se corrigen dentro de las fases indicadas):

- `build-site.ts` coloca árboles solo fuera de `|x|<130 && -92<z<92`; con el pavimento este habrá árboles encima (fase 2).
- `dockBlocks()` en `build-building.ts:135` agrupa muelles con `d.u - last.uMax < 4.5`: con paso 4,8 cada muelle sería un bloque aparte (fase 2).
- Las plazas de las salas se conectan en línea recta a `room-hub` (`pinto-layout.ts:406`): las máquinas cruzan en diagonal las plazas ocupadas (fase 3).
- Las plazas miden 2,2 × 2,6 m y el recogepedidos mide ≈ 3,5 m con horquillas: no cabe (fase 3).
- Todos los camiones en espera van al mismo nodo `park-e` (fase 5).
- La salida del camión (`finishTruck`) arranca en `dockInteriorPoint` (dentro de la nave) y pasa por `park-e` antes de salir (fase 5).
- La simulación declara `at_dock` al llegar al nodo `ydock-*` (z = 95) mientras la escena aún está maniobrando: la descarga empieza antes de que el camión esté pegado al muelle (fase 5).
- En `moveAlong` el tope en pasillos es `Math.min(step, 0.6 * 0.1)`, que no depende de `dt` (fase 6).
- `build-labels.ts` pone las etiquetas de suelo en y = 0,045, por debajo del piso de la nave (1,2 m). **Verificar en el navegador** si se ven; si no, subirlas a `NAVE_FLOOR_H + 0.05` (fase 4, junto con los carteles de baño).
- `SHIFTS[].machines` no se usa en ningún sitio (fase 5.5).
- El botón de modo muros (`camera-controls.tsx`) no indica en qué modo está (fase 1).
- Verificar visualmente si el terreno (`GROUND = 0x474a45`) se ve demasiado claro frente al hormigón en la captura `image.png`; tras la fase 2 solo debería verse fuera de las losas.

---

## Fase 0 — Script de medición (Haiku)

Crear `scripts/check-traffic.ts` para medir antes/después. Debe correr de 06:00 a 10:00 y escribir:

- nº de muestras (1 por segundo) con dos máquinas activas (`traveling|working|waiting`) a < 1,5 m, y distancia mínima;
- nº de muestras con dos camiones a < 6 m, con ambos fuera de `at_dock`, y distancia mínima (en la fase 6 se cambia a una medida por huella);
- nº de camiones simultáneos en cada estado y hora de aparición de cada camión (para ver el escalonado de la fase 5);
- minutos que cada camión pasa en `approaching` (debe ser < 4 min tras la fase 5).

Plantilla (usa `@/` y se ejecuta con `npx --yes tsx --tsconfig tsconfig.json scripts/check-traffic.ts`):

```ts
import { buildPintoLayout } from '@/lib/layout/pinto-layout';
import { createInitialState } from '@/lib/sim/init';
import { makeDeps, tick } from '@/lib/sim/tick';

const layout = buildPintoLayout();
const deps = makeDeps(layout);
const s = createInitialState(layout);
let machinePairs = 0, minMachine = Infinity, truckPairs = 0, minTruck = Infinity;
for (let i = 0; i < 10 * 3600 * 4; i++) {
  tick(s, deps, 0.1);
  if (i % 10 !== 0) continue;
  const ts = s.trucks.filter((t) => t.status !== 'at_dock');
  for (let a = 0; a < ts.length; a++) for (let b = a + 1; b < ts.length; b++) {
    const d = Math.hypot(ts[a].pos.x - ts[b].pos.x, ts[a].pos.z - ts[b].pos.z);
    minTruck = Math.min(minTruck, d); if (d < 6) truckPairs++;
  }
  const ms = s.machines.filter((m) => m.status === 'traveling' || m.status === 'working' || m.status === 'waiting');
  for (let a = 0; a < ms.length; a++) for (let b = a + 1; b < ms.length; b++) {
    const d = Math.hypot(ms[a].pos.x - ms[b].pos.x, ms[a].pos.z - ms[b].pos.z);
    minMachine = Math.min(minMachine, d); if (d < 1.5) machinePairs++;
  }
}
console.log({ machinePairs, minMachine, truckPairs, minTruck, trucks: s.trucks.length, stats: s.stats });
```

Línea base actual (a conservar en el commit): `machinePairs = 25245`, `minMachine = 0`, `truckPairs ≈ 124` (con umbral de 8 m).
Objetivo final: `machinePairs = 0`, `minMachine ≥ 1,2`, `truckPairs = 0`.

---

## Fase 1 — Racks de 3 niveles y modo muros (Haiku)

**Objetivo:** estanterías de 3 niveles de palé (nivel 0 picking, niveles 1–2 reserva) y que el botón de modo muros no deforme ni hunda los racks.

### 1.1 Layout
- `src/lib/layout/pinto-layout.ts:37`: `export const RACK_LEVELS = 3;` (el resto —`RACK_ZONES`, `zones()`, `locations += modules * 3 * line.levels`— ya depende de la constante).
- Comentario de línea 36: «niveles unificados (nivel 0 = picking, 1..2 = reserva)».
- `src/lib/sim/tick.ts` no necesita cambios: `slotHeight` usa `level * LEVEL_HEIGHT` y ahora el máximo es 3,2 m.

### 1.2 Geometría de racks (`src/three/builders/build-racks.ts`)
- Puntales: `postHeight = line.levels * LEVEL_HEIGHT` (4,8 m); quitar el `+ 0.6`.
- Largueros: `for (let level = 1; level < line.levels; level++)` → solo a 1,6 m y 3,2 m, que es donde apoyan los niveles 1 y 2. Añadir un travesaño superior ligero a `y = line.levels * LEVEL_HEIGHT - 0.1` (un único larguero por módulo y lado) para cerrar el marco visualmente.
- Comprobar que un palé de 1,5 m en el nivel 2 (3,2 + 1,5 = 4,7 m) queda bajo el travesaño.

### 1.3 Modo muros (`src/three/wall-modes.ts`, `src/three/warehouse-scene.ts`)
Decisión: **los racks no cambian nunca de altura**; el modo muros solo afecta a muros.
- Eliminar `rackHeightScale` y `updateRackScale` de `wall-modes.ts`.
- En `warehouse-scene.ts`: quitar el import, la llamada de la línea 622 y, si queda sin uso, el campo `racksGroup` (mantenerlo si lo usan las capas: `this.groups.get('racks')`).
- Con 3 niveles los racks miden 4,8 m (+1,2 de piso): menos que antes (6,4 m), suficiente para ver los pasillos desde la vista isométrica. Si al probarlo los pasillos siguen tapados en modo «recorte», **no** volver a escalar: bajar el techo de recorte de los tabiques o ajustar la cámara, y avisar.
- Actualizar el comentario de `wall-modes.ts` que menciona «4 niveles».

### 1.4 Botón (`src/components/camera-controls.tsx`, `src/components/warehouse-app.tsx`)
- Pasar `wallMode` al componente y mostrarlo: `title={`Modo de muros (M): ${labels[wallMode]}`}` con `up → «completos»`, `cut → «recorte»`, `down → «bajados»`, y resaltar el botón (`border-accent !text-accent`) cuando no esté en `up`.

### Aceptación
- `check-layout.ts`: `Slots rack por zona` baja un 25 % respecto a antes; `racksFilled ≈ 85 %` de `locations`.
- En el navegador, en los tres modos: los racks muestran **3** alturas de palé, no se aplastan ni se hunden, y los palés dinámicos/horquillas coinciden con los huecos.
- `grep -rn "rackHeightScale\|updateRackScale" src` no devuelve nada.

---

## Fase 2 — Muelles más separados y pavimento este (Haiku)

**Objetivo:** más aire entre muelles y pavimento de hormigón en todo el patio este (D37–D60). Es geometría pura; los índices, temperaturas y tipos de muelle no cambian.

### 2.1 Paso entre muelles (`src/lib/layout/pinto-layout.ts`)
Constantes nuevas (sustituyen a las actuales):

```ts
const DOCK_PITCH = 4.8;          // antes 3,5: 1,8 m libres entre remolques de 2,55 m... ver nota
const DOCK_BLOCK_GAP = 8;        // antes 6
const SOUTH_BLOCK_PITCH = 12 * DOCK_PITCH + DOCK_BLOCK_GAP; // 65,6
const SOUTH_FIRST_U = -92;       // bloques en −92…−39,2 | −26,4…26,4 | 39,2…92 (centrados)
const EAST_COOL_FIRST_Z = 74;    // frío: 74 … 30,8
const EAST_FROZEN_FIRST_Z = 22.8; // congelado: 22,8 … −39,6
```

Nota: 4,8 − 2,55 = 2,25 m libres entre remolques adyacentes (antes 0,95 m).

- `buildDocks()` no cambia de estructura: solo usa las constantes.
- `laneRect` y el resto salen de `u`, no hace falta tocarlos.
- Revisar que ningún muelle sur cae dentro de los `southHoles`/escaleras de otro y que la escalera de cada bloque (`dockStairX = uMin − 2,6`) queda libre en el hueco de 8 m.

### 2.2 Agrupación en bloques (`src/three/builders/build-building.ts:135`)
- `d.u - last.uMax < 4.5` pasa a `< DOCK_PITCH + 1` (importar `DOCK_PITCH` desde `dock-geometry.ts`: mover allí la constante y exportarla; `pinto-layout.ts` la importa).
- Sin este cambio, con paso 4,8 cada muelle se convierte en un bloque y se dibuja una escalera y una antesala por muelle.

### 2.3 Pavimento
- Añadir a `SiteElements` (`types.ts`) y a `buildSite()` (`pinto-layout.ts`):
  - `yard`: pasa a `{ xMin: -135, xMax: 210, zMin: 80, zMax: 126 }` (el giro de los camiones llega a z ≈ 125);
  - `yardEast: { xMin: 125, xMax: 180, zMin: -48, zMax: 80 }` (cubre desde el muelle D60 hasta el patio sur y hasta x = 180: el camión parado para dar marcha atrás llega a x ≈ 170).
- `build-site.ts → buildRoads()`: añadir un `concreteFloor` para `yardEast` con `YARD_SLAB_Y` y nombre `'yard-east'`, igual que el del patio sur. **No** crear losas solapadas en la misma cota: `yardEast` y `yard` comparten el borde z = 80 sin solaparse (x 125…180 de `yardEast` frente a z 80…126 de `yard`). Si hay parpadeo, ajustar un epsilon en x, nunca en y (ver commit `0065426`).
- `buildMarkings()`:
  - las marcas amarillas de estacionamiento ya se dibujan por muelle (rotadas en el este): comprobar que caen sobre la nueva losa;
  - añadir **líneas blancas de calle de muelle** entre muelles contiguos del mismo bloque (en `u ± DOCK_PITCH/2`, desde la fachada hasta 18 m, `paintLine`, color `PAINT_WHITE`, grosor 0,15, `YARD_MARK_Y`) para ambas caras: refuerza la sensación de separación;
  - pasos peatonales: ya salen de `dockBlocks()`; comprobar el este.
- Árboles (`buildVegetation`): excluir los que caigan dentro de `yard` o `yardEast` con 4 m de margen (`x > 121 && x < 184 && z > -52 && z < 130`).
- Revisar `site.evChargers` (x 185–201, z 96) y `truckParking`: siguen fuera de `yardEast`.

### 2.4 Grafo del patio (`buildYardGraph`)
- El anclaje `dk.x < -40 ? 'yard-w' : dk.x > 40 ? 'yard-e' : 'yard-c'` sigue válido.
- Los nodos `ydock-*` del este están en x = 133; no tocar (la fase 5 sustituye estas rutas).

### Aceptación
- Captura isométrica del este (ángulo 0 y 1): hormigón continuo bajo los muelles D37–D60, sin franja de terreno, sin árboles sobre el hormigón, sin parpadeo.
- Entre dos remolques contiguos se ven ≥ 2 m de separación y las líneas blancas de calle.
- Un bloque = una escalera y una antesala (no una por muelle).
- `check-layout.ts`: `Muelles: 60 inbound: 14`.

---

## Fase 3 — Ampliar salas de carga y de máquinas (Haiku)

**Objetivo:** más plazas, más grandes, con pasillos de maniobra, y conexiones que no atraviesen plazas ocupadas.

Espacio disponible: la franja oeste x −125…−105 (20 m) está libre entre z = −80 y z = 43 (los racks empiezan en x = −105, el primer pasillo transversal está en z −36…−32). No hay que mover racks.

### 3.1 Dimensiones (en `buildRooms()`, constantes al inicio del archivo)

```ts
const ROOM_X0 = -125, ROOM_X1 = -105;
const BAY_W = 2.6;          // paso entre plazas (plaza de 2,4 m)
const BAY_D = 4.0;          // fondo de plaza (el recogepedidos con horquillas mide ≈ 3,5 m)
const DRIVE_AISLE = 3.6;    // calle de maniobra entre dos filas enfrentadas
const TRUNK_W = 3.8;        // calle troncal N-S pegada al este (x −108,8…−105)
const BAY_COLS = 6;         // 6 × 2,6 = 15,6 m (x −124,4…−108,8)
const PAIR_D = 2 * BAY_D + DRIVE_AISLE; // 11,6 m por bloque de dos filas
```

- **Sala de carga:** 1 bloque doble (2 filas × 6 = **12 cargadores**, antes 6), `rect: x −125…−105, z −80…−66`.
- **Sala de máquinas:** 4 bloques dobles (8 filas × 6 = **48 plazas**, antes 42), `rect: x −125…−105, z −66…−17`.
- Total ocupa z −80…−17 (antes −80…−40): ≈ 1.260 m² frente a 800 m².
- Filas enfrentadas por la calle de maniobra (E-O). Fila norte de cada bloque mira al sur y viceversa. Los ids (`CAR-01…`, `REP-01…`) se numeran fila a fila.
- Actualizar `zones()` (`carga_baterias`) y las rutas `layout.rooms[].rect` con los nuevos rectángulos. La zona `seco` conserva su rect (se solapa, como antes).

### 3.2 Grafo (`buildIndoorGraph`, `pinto-layout.ts`)
Sustituir el esquema «cada plaza → `room-hub`» por una red real:
- Nodo troncal `room-trunk-<z>` en `x = ROOM_X1 − TRUNK_W/2 − 0.0` (centro de la troncal) cada vez que cruza el centro de una calle de maniobra (`z` de cada bloque) y en la entrada.
- Por cada calle de maniobra: nodos `room-aisle-<b>-<c>` en el centro de la calle, uno por columna (`x = centro de la plaza`), encadenados entre sí y con el troncal.
- Cada plaza `spot-<id>` se une **solo** al nodo de calle de su columna (arista perpendicular de 2,0 m, sin cruzar otras plazas).
- Entrada: el troncal conecta con el pasillo transversal de z = −34 (nodo más cercano `aisle-*-X--34`, comprobando `segmentClear`) y con la calle norte (`north-*` más cercana) como segunda salida. Esto sustituye a `room-hub`/`room-entrance` (actualizar todas las referencias: `grep -rn "room-hub\|room-entrance\|-41" src`).
- `init.ts` usa `{ x: -115, z: -41 }` como posición por defecto de una máquina sin plaza: cambiar a la primera plaza libre o al centro de la calle del primer bloque.
- Cuidado con `PathFinder.nearestClearTo`: el punto de partida debe estar libre; las plazas deben tener nodo propio.

### 3.3 Dibujo (`build-building.ts → buildZoneFloors`)
- Plazas pintadas con el nuevo tamaño (`sw = 2.4`, `sd = BAY_D`), calle de maniobra con tono más claro (`CROSS_AISLE_TONE`) y flechas de sentido en la troncal.
- Cargador: una columna por plaza en el lado de la pared (fondo de la plaza), no en el centro.
- Cartel de sala (en `build-labels.ts`): mantener, recolocar al centro de cada sala.

### Aceptación
- `layout.rooms`: 12 plazas `carga`, 48 `reposo`; `check-sim.ts` sigue sin errores.
- Ninguna arista del grafo de salas cruza el rectángulo de una plaza (comprobarlo con un bucle en `check-layout.ts`).
- En el navegador: las 41 máquinas arrancan aparcadas sin solaparse; al terminar el turno (22:00) vuelven y aparcan en plazas distintas.

---

## Fase 4 — Baños en 3 ubicaciones (Haiku)

**Objetivo:** tres módulos de aseos visibles en la nave, con carteles, que no estorben a los grafos de circulación.

### 4.1 Modelo de datos (`src/lib/layout/types.ts`)
```ts
export interface Restroom {
  id: string;
  label: string;
  rect: Rect;
  /** Lado de la puerta y posición a lo largo de ese lado (m). */
  door: { side: 'n' | 's' | 'e' | 'w'; at: number; width: number };
}
```
Añadir `restrooms: Restroom[]` a `WarehouseLayout` y rellenarlo en `buildPintoLayout()`.

### 4.2 Ubicaciones (cada módulo 10 × 8 m)
| id | Ubicación | rect (x / z) | Puerta |
|---|---|---|---|
| WC-01 | Oeste, junto a la sala de máquinas | x −124…−114, z −14…−6 | este, en z = −10, ancho 1,6 |
| WC-02 | Expedición oeste (antes de los muelles sur) | x −122…−112, z 62…70 | norte, en x = −117, ancho 1,6 |
| WC-03 | Esquina noreste, junto a frío | x 114…124, z −62…−54 | sur, en x = 119, ancho 1,6 |

Comprobaciones obligatorias antes de dar por buenas las coordenadas (si choca, mover el módulo ≤ 6 m y anotarlo):
- no cortar ninguna arista de `indoorGraph` (`segmentClear` con el rect inflado 0,5 m);
- WC-02 no solapa carriles de muelle (los muelles sur ahora empiezan en x = −92) ni la flejadora FLJ-01 (x −80…−60);
- WC-03 está al norte del último muelle este (z mínimo −41,1) y al este del pasillo de servicio (x ≥ 113,5);
- WC-01 queda al sur de la sala de máquinas (z > −17) y fuera de la franja x ≥ −105.

### 4.3 Dibujo
- `build-building.ts`: nueva función `buildRestrooms(layout)` que añade, en el grupo `nave`:
  - solera clara (`paintFill`, gris azulado) y contorno;
  - muros perimetrales de 3,0 m con **hueco de puerta**, como `WallMesh` interiores (`outer: false`) añadidos a `innerWalls`, para que el modo muros los recorte (reutilizar `wallAlongX`/`wallAlongZ` con `holes`);
  - 4 cubículos (cajas bajas) y 2 lavabos (cajas) por módulo — volumen simple, mismo estilo `lambert`;
  - sin techo.
- `build-labels.ts`: cartel «WC» sobre cada puerta (sprite, como los de muelle) y etiqueta de suelo `Aseos`. Colocarlos a `NAVE_FLOOR_H + …` (ver el hallazgo de las etiquetas bajo el piso).
- `warehouse-scene.ts`: añadir los muros a `this.walls` (ya lo hace con `innerWalls`).

### 4.4 Simulación
Solo exclusión espacial en esta fase: el grafo no pasa por dentro. (Pausas de operarios a los baños quedan fuera de alcance; si se piden, se añaden como `mission: 'break'` en la fase 6.)

### Aceptación
- Tres módulos visibles, con su puerta orientada al pasillo y cartel legible en zoom 2.
- En modo recorte y bajado los muros de los baños bajan como el resto.
- `check-layout.ts` imprime `Aseos: 3`.

---

## Fase 5 — Camiones: velocidad, maniobra realista e inicio de turno (**Sonnet/Opus**)

### 5.0 Problema de fondo
Hoy hay **dos camiones por camión**: el de la simulación (`Truck.pos`, avanza a 4,2 m/s por el `yardGraph`) y el de la escena (`animateTruck` en `entity-sync.ts`, un modelo «bicicleta» con otras velocidades 4,2/1,4/0,8 m/s y fases `lane/arc/reverse`). La simulación da por atracado al camión al llegar al nodo `ydock-*`, mientras la escena sigue maniobrando minutos. Por eso la maniobra parece irreal y la velocidad lenta, y por eso ninguna lógica de colisiones podría ser coherente con lo que se ve.

**Decisión:** la simulación es la única fuente de verdad. La escena solo dibuja `pos`, `heading` y gira ruedas según la distancia.

### 5.1 Cinemática en la simulación
- Mover `BikeState`/`BikeOpts`/`stepBike` de `src/three/motion.ts` a `src/lib/sim/vehicle.ts` (matemática pura, sin three). `motion.ts` conserva `Kin`/`stepKin` (máquinas) y reexporta lo que haga falta.
- Ampliar `Truck` (`src/lib/sim/types.ts`): `heading: number` (obligatorio), `v: number` (velocidad con signo), `stage?: 'lane' | 'arc' | 'reverse' | 'pullout'`, `dwell: number`. `SimState` ya es serializable: no meter funciones.
- Valores (constantes en `vehicle.ts`, un único sitio; sustituyen a los de `entity-sync.ts` y a `TRUCK_YARD_SPEED` de `tick.ts`):

| Concepto | Antes | Ahora |
|---|---|---|
| Crucero en patio | 4,2 m/s (15 km/h) | **6,5 m/s (≈ 23 km/h)** |
| Curvas del grafo | — | 3,5 m/s (limitar por curvatura) |
| Aproximación (< 30 m del muelle) | 1,4 | **3,0** |
| Arco de giro | 1,4 | **2,5** |
| Marcha atrás | 0,8 | **1,4** (≈ 5 km/h) |
| Aceleración / frenada | 1,0 / 1,5 | **1,8 / 3,0** m/s² |
| Radio de giro mínimo | 12,5 | 12,5 (se mantiene) |

### 5.2 Geometría de atraque compartida
Mover a `dock-geometry.ts` lo que hoy está hardcodeado en `entity-sync.ts` (`YARD_LANE_Z = 105`, `DOCK_STAGE_Z`, `DOCK_TRUCK_Z`…) como función pura:

```ts
export function dockApproach(dock: Pick<Dock,'face'|'x'|'z'>): {
  start: Point;      // inicio del arco, sobre el carril de calle (u + R, FACE_V + 25)
  stop: Point;       // fin del arco, a un radio del carril; desde aquí se retrocede
  target: Point;     // origen del camión atracado (trasera a 0,1 m de la niveladora)
  alignHeading: number;
}
```
Debe dar exactamente los mismos números que hoy para el sur y el este (comprobarlo con un test rápido en `check-layout.ts`).

### 5.3 Máquina de estados del camión (`tick.ts`)
Sustituir el `moveTruck` recto por `driveTruck(t, dt)` que usa `stepBike`:
- `gate → scale`: el camión nace en el exterior, **entra por la garita** (gate 185,175), y va a la báscula.
- **Báscula:** ocupa un único puesto; el camión se detiene `dwell = 20…35 s` (aleatorio con `nextRandom`) y el siguiente no entra hasta que se libera. Esto escalona de forma natural la entrada (≈ 1 camión cada 30–40 s como máximo).
- `scale → approaching`: asignado el muelle, ruta por el grafo hasta `dockApproach.start`, luego `stage = 'lane'` → `'arc'` (hacia `stop`) → `'reverse'` (recta hasta `target`, con `alignHeading` como hoy).
- `at_dock` **solo cuando** `reverse` termina: distancia a `target` < 0,15 m y error de rumbo < 0,05 rad. Hasta entonces la descarga/carga no empieza (`dockStates` sigue en `free/arriving`).
- Salida: `leaving` con `stage = 'pullout'`: avanzar en recto desde `target` hasta `stop`, y desde ahí directamente a `exit` por `yard-e` **sin pasar por `park-e` ni por la báscula** (editar `finishTruck`; la ruta ya no parte de `dockInteriorPoint`).
- Espera de muelle (`parking`): asignar una **plaza** de `layout.site.truckParking.stalls` (campo `stallId` en el camión y `stallOccupancy` en `SimState`), no el nodo común `park-e`. Entrada de frente por el lado del patio (z = 128 para la fila 1); usar solo la fila z = 130 (35 plazas) y dejar la fila z = 153 como desbordamiento si hace falta. Salida de la plaza en marcha atrás recta hasta el eje del patio (reutiliza la fase `reverse`).
- Los nodos `ydock-*` del grafo del patio ya no son destino final: pasan a ser puntos del carril (o desaparecen si `dockApproach.start` los sustituye). Mantener `yardGraph` conectado y sin aristas que crucen edificios.

### 5.4 Escena (`entity-sync.ts`)
- Borrar `animateTruck`, `ref.bike`, `ref.dockStage` y las constantes `TRUCK_*`, `YARD_LANE_Z`, `DOCK_STAGE_Z`.
- Dibujar `ref.group.position.set(t.pos.x, 0, t.pos.z)` y `ref.group.rotation.y = t.heading`, con un suavizado muy leve de posición (≤ 0,15 s) solo para ocultar el paso fijo de 0,1 s; ruedas con `spinWheels(ref, |Δpos|)`.
- Camiones atracados: la altura sube a 1,2 m en la caja (ya lo hace el modelo; no tocar).

### 5.5 Inicio de turno (cubre las dos lecturas del «aparecen todos a la vez»)
- **Estado inicial a las 06:00** (en `createInitialState`/`generateDemand`): sembrar 5 camiones de proveedor ya aparcados en plazas de espera (`status: 'parking'`, con su carga) y 2 ya descargando en muelles secos. Así el patio no empieza vacío y la primera media hora tiene movimiento. Los 5 de espera salen hacia el muelle cada 90 s (escalonado), no a la vez.
- **Llegadas posteriores:** separación mínima en garita de 60 s entre camiones (`state.lastGateAt`); si no se cumple, el camión se queda en cola fuera (`status: 'offsite'`, que ya existe) y entra cuando toque. En `generateDemand`, quitar el desfase de 7 min del primer proveedor (hoy ninguno llega antes de las 06:07).
- **Máquinas:** al arrancar cada máquina espera `clockInDelay` (0…150 s, `nextRandom`, campo nuevo en `Machine`) antes de aceptar tareas, y las plazas de aparcamiento se liberan de una en una. Esto evita que las 26 máquinas del turno de mañana salgan juntas por la troncal. Usar el `machines` de `SHIFTS` para limitar las activas simultáneamente (hoy ignorado).
- Verificar con el velocímetro 60× y 300×: no deben verse más de 2 camiones entrando en el mismo minuto simulado.

### Aceptación
- `scripts/check-traffic.ts`: tiempo medio en `approaching` entre 60 y 200 s; ningún camión `at_dock` con distancia al `target` > 0,3 m.
- Visual: el camión recorre el patio claramente más rápido, hace el arco, se detiene, entra en marcha atrás recto y **solo entonces** empieza la descarga (comprobar el evento `truck_unloading` a la vez que se ve parar la marcha atrás).
- Salida: el camión avanza recto y sale por la puerta este sin cruzar la nave ni pasar por el parking.
- Primer cuarto de hora: ya hay camiones aparcados/descargando; las entradas no se solapan.
- `check-sim.ts` determinista.

---

## Fase 6 — Sin colisiones entre camiones y máquinas (**Sonnet/Opus**)

Requisito previo: fases 3 y 5 (posiciones de camiones coherentes con la escena; salas con calles).

### 6.1 Módulo `src/lib/sim/traffic.ts`
- **Huellas:** máquinas = círculo de radio 0,9 (retráctil, ERE, transpaleta) o 1,2 (recogepedidos); camión = cinco círculos de radio 1,6 separados 4 m a lo largo de su eje (cubre 18,8 m). Función `footprintOverlap(a, b, margin)`.
- **Prioridad total:** por índice de entidad (menor índice = mayor prioridad). Una entidad solo avanza si el paso siguiente no solapa la huella de una entidad de **mayor** prioridad ni la de una entidad parada. Al ser un orden total no hay bloqueos circulares: la de máxima prioridad siempre avanza.
- **Distancia de seguimiento:** misma dirección y delante en un cono de ±60° → parar a `huella + 1,0 m` (máquinas) o `huella + 4 m` (camiones). Estado nuevo `blockedBy?: string` y contador `blockedFor` (s).
- **Antibloqueo:** si `blockedFor > 25 s` por una entidad que está `working` o `waiting`, la bloqueada replanifica con `PathFinder` excluyendo la arista/nodo bloqueado (añadir un parámetro `avoidNodes` a `search`) y emite `machine_waiting`. Nunca atravesar.
- Rendimiento: usar rejilla espacial (celdas de 6 m) reconstruida una vez por `tick` solo con entidades en movimiento; presupuesto < 1 ms por tick con 41 máquinas + 34 camiones.

### 6.2 Máquinas (`moveAlong`, `tick.ts`)
- Llamar a `traffic.canAdvance` antes de aplicar el paso; si no puede, `status = 'waiting'`, `speed = 0`.
- **Pasillos de sentido único mientras haya 2 dentro:** el segundo solo entra si va en el mismo sentido (guardar `dir` en `aisleLocks`). Se mantiene `AISLE_CAPACITY = 2`.
- Corregir el tope de pasillo: `step = Math.min(step, 0.6 * dt)` (no `0.6 * 0.1`).
- **Carril derecho:** desplazar 0,9 m a la derecha del sentido de marcha el objetivo de cada tramo de pasillo, salvo en el último punto (plaza/hueco). Así dos máquinas en sentidos opuestos en un pasillo de 4 m se cruzan sin solaparse (centros a 1,8 m, huellas de 0,9 + 0,9).
- Máquina `working` en un pasillo: colocarla 1,2 m hacia el lado del hueco en el que trabaja, para que la de detrás pueda pasar por el carril libre.
- Quitar el desplazamiento de presentación `sharing/shift` de `entity-sync.ts` (`slot * 1.1`) una vez que no hay solapes: dejaba esconder el problema.

### 6.3 Camiones
- Carril de entrada y de salida separados en el camino de acceso (grafo del patio): entrada por la garita, salida por `exit`; sin cruces de frente.
- **Reserva de maniobra por muelle:** un camión en `arc`/`reverse` o `pullout` reserva el corredor del muelle (franja de 3,4 m × la longitud del camión) y su cruce con el carril; los que circulan por el carril se detienen antes de entrar en ese cruce. Máximo 2 maniobras simultáneas por cara, y no en muelles contiguos (|Δ índice| ≥ 2) mientras el arco de uno invade el del otro.
- Vigilar que el camión no se detenga con el remolque cruzando el carril: reservar antes de empezar el `arc`.

### 6.4 Camión ↔ máquina
- Frontales (ERE) que entran al remolque (`dockInteriorPoint`, 2 m dentro de la nave): comprobar que solo lo hacen con el camión en `at_dock` y reserva activa; los demás esperan en `stagingPoint`.
- El área de maniobra de camiones (patio) es exterior; las máquinas no salen de la nave salvo al remolque, así que no hay más cruces.

### Aceptación (`check-traffic.ts`)
- `machinePairs = 0` con umbral 1,5 m y `minMachine ≥ 1,2` en 4 h; `truckPairs = 0` con umbral 6 m (excluyendo `at_dock`); ningún solape de huellas.
- Ninguna máquina `waiting` > 90 s consecutivos en 4 h (comprobar bloqueos).
- Rendimiento: `check-sim.ts` (12 h simuladas) no tarda más de 2× lo que tardaba antes; a 300× la escena mantiene ≥ 45 fps.
- Throughput razonable: `stats.shipped` y `received` a las 10:00 no caen más de un 20 % respecto a la línea base (la línea base actual: received 430, shipped 843, trucksOut 28 a las 10:00).

---

## Fase 7 — Modelos low poly (Haiku, con esta especificación)

**Estado de la búsqueda:** Blender 5.2.2 ya está conectado al MCP, pero las tres bibliotecas (`polypizza`, `sketchfab`, `polyhaven`) están **desactivadas** en el panel del addon (en Blender: tecla N en el visor 3D → pestaña «MCP for Blender» → marcar Poly Pizza), y `search_assets` devuelve «Poly Pizza is switched off». Hasta que se active, la búsqueda no es posible. El plan por defecto mejora los modelos procedurales (sin licencias ni dependencias); la opción B se ejecuta cuando se active la biblioteca.

### 7.1 Opción A (por defecto): mejorar `src/three/builders/models.ts`
Contrato que **no debe cambiar** (lo usa `entity-sync.ts`): cada `createX()` devuelve `{ group, nodes: { forks, mast, wheels, body, palletGrip, operator? } }`; el camión devuelve `{ group, nodes: { trailer, trailerBody, wheels } }`. Ejes: máquinas miran a +Z; tractora a −Z.

Reglas:
- Presupuesto: ≤ 400 triángulos por máquina y ≤ 1.500 por camión. Compartir geometrías y materiales entre instancias (cachear a nivel de módulo: `const GEO = {...}`), porque hay hasta 75 vehículos.
- `MeshLambertMaterial` con `flatShading: true`; paleta limitada (la del archivo + negro de neumático, cristal 0x1d2b3a, faros 0xfff2c0, luces traseras 0xd62828).
- Ruedas con 10 segmentos y tapacubos (cilindro más pequeño de otro color); mantener las ruedas en `nodes.wheels`.
- Sombras: `castShadow` solo en el cuerpo y mástil.

Mejoras por modelo:
- **Camión (`createTruck`):** capó inclinado y parabrisas (cajas rotadas o `ExtrudeGeometry` de perfil lateral), ventanillas oscuras, retrovisores, faros y paragolpes, depósito y escape vertical, faldones laterales, aletas guardabarros; remolque con nervios laterales (franjas en relieve de 5 cm), puertas traseras con manillas y luces traseras, patas de apoyo, franja azul/naranja de la marca, ruedas traseras gemelas; groupo frigorífico más reconocible en `reefer` (rejilla y ventilador).
- **Retráctil:** mástil triple (tres secciones telescópicas), jaula de operador con 4 montantes y techo de rejilla, asiento, volante, tapa de batería con ranuras, respaldo de carga y carro de horquillas.
- **ERE 225i:** carro de horquillas con respaldo, cubierta de batería, timón con empuñadura y botones, plataforma de operario plegable.
- **Recogepedidos:** plataforma elevable con barandilla, mástil doble, horquillas largas con puntas biseladas.
- **Transpaleta (ESE):** asiento con respaldo, timón, cubierta redonda, rueda de carga doble en las horquillas.
- **Operario (`createWorker`):** sustituir la cápsula por cuerpo en bloques: piernas, tronco, brazos, cabeza cúbica redondeada, chaleco con dos bandas reflectantes y casco; brazos que agarran el volante/timón en la pose (dos cajas giradas).
- **Palé dinámico (`entity-sync.ts → paletGeo`):** hoy es una caja 1,2 × 0,5 × 0,8. Reemplazar por una geometría fusionada (`mergeGeometries` de `three/examples/jsm/utils/BufferGeometryUtils.js`) de tablero + tacos + carga, con colores de vértice, manteniendo `InstancedMesh` y las dimensiones exteriores (los cálculos de altura `FLOOR_PALET_Y`, `FORK_PALET_Y` no deben cambiar).
- **Racks (`build-racks.ts`):** placas de base en los puntales y una diagonal de arriostramiento por módulo cada 4 módulos (instanciada); no pasar de +2.000 instancias.

### 7.2 Opción B (si el usuario conecta Blender)
1. Abrir Blender con el addon del MCP y ejecutar `get_addon_status`.
2. Buscar en `polypizza` con `licence: "CC0"` (preferente) los modelos «forklift», «reach truck», «pallet jack», «semi truck», «worker»; revisar con `previews`.
3. Importar, escalar a metros reales (retráctil ≈ 1,2 × 2,6 m, camión ≈ 18,8 m), centrar con el origen entre ruedas, **nombrar los nodos** `forks`, `wheels`, `operator`, `trailer` y exportar a `public/models/*.glb` (Draco opcional).
4. En `models.ts` cargar con `GLTFLoader` y mantener el procedural como *fallback* mientras carga. Clonar con `SkeletonUtils.clone` o `scene.clone(true)` y compartir materiales.
5. Si hay licencia CC-BY, añadir `public/models/CREDITS.md` con autor y URL.

### Aceptación
- Los cinco vehículos se reconocen a zoom 1 (nivel 1) y no parpadean a zoom 3.
- Misma huella y mismos nodos que antes: ninguna otra pieza de código tiene que cambiar.
- A 300× con 75 vehículos, ≥ 45 fps en el equipo de desarrollo (medir con el contador `onFps`).

---

## Fase 7b — Europalé universal: todo se mueve sobre un palé (Haiku)

Origen: el usuario aporta `Europalette01.max` (raíz del repo) y pide que **todo lo que hay en el almacén vaya sobre un palé**.

### 7b.0 Bloqueo previo: el `.max` no es utilizable tal cual
- `.max` es el formato propietario de 3ds Max (contenedor OLE, 280 KB). **Ni Blender 5.2 ni three.js lo importan.** Se intentó leer la geometría del flujo `Scene` a mano y no se pudo extraer de forma fiable (hay splines/chunks propietarios, no un array de malla claro). No volver a intentarlo.
- **Acción del usuario (1 minuto):** en 3ds Max, `File → Export` el palé como **FBX** (o OBJ, o glTF/GLB si su versión lo trae) en la raíz del repo, p. ej. `Europalette01.fbx`. Comprobar al exportar: unidades en metros (si el modelo está en cm o mm, se corrige después con la escala), «Y-up» da igual (se corrige en Blender), incluir materiales/texturas.
- Con ese FBX/OBJ el flujo es: importarlo en Blender (conectado al MCP), normalizar y exportar `public/models/euro-pallet.glb`:
  - dimensiones exactas **1,2 × 0,8 × 0,144 m**, origen en el centro de la cara inferior, +Y arriba, lado largo en X;
  - dos variantes: `euro-pallet-hi` (≤ 250 triángulos, para palés en movimiento) y `euro-pallet-lo` (≤ 48 triángulos: tablero superior, 3 patines, sin ranuras; para estanterías);
  - un único material de madera (o colores de vértice), sin texturas grandes.
- **Mientras no llegue el archivo**, implementar todo con el **palé procedural de respaldo** (7b.2) y cargar el GLB cuando exista. El código no debe depender de que el GLB esté presente.

### 7b.1 Qué hay hoy (inconsistente)
- Palés de estantería (`build-racks.ts`): caja 1,2 × h × 0,8 con `h` 1,0–1,5 m, sin base.
- Palés dinámicos (`entity-sync.ts → paletGeo`): caja 1,2 × **0,5** × 0,8 sea cual sea el `height` del palé de la simulación (un palé que sale del rack baja de 1,2 m a 0,5 m al cogerlo).
- Huecos (`slotGeo`): caja 1,2 × 1,2 × 0,8.
- Palés del suelo de Frutas y Verduras: la misma caja de estantería.
- Número de instancias a vigilar (con 3 niveles): ≈ 20.160 huecos, ≈ 17.000 palés estáticos.

### 7b.2 Módulo único `src/three/builders/pallets.ts`
Crear una pieza reutilizable; los tres sitios de arriba dejan de crear sus propias cajas.

```ts
export const EURO_L = 1.2, EURO_W = 0.8, EURO_H = 0.144;
export type PalletLod = 'lo' | 'hi';
/** Geometría del palé (GLB si está cargado; si no, procedural). Cacheada. */
export function euroPalletGeometry(lod: PalletLod): THREE.BufferGeometry;
/** Carga el GLB una vez y actualiza (swap de geometry) los lotes ya creados. */
export function loadEuroPalletGlb(): Promise<void>;
/** Palé + carga: dos InstancedMesh con los mismos índices. */
export class PalletBatch {
  constructor(count: number, opts: { lod: PalletLod; castShadow?: boolean; usage?: THREE.Usage });
  readonly base: THREE.InstancedMesh;   // europalé (madera), sin color por instancia
  readonly load: THREE.InstancedMesh;   // caja de mercancía (color por instancia)
  set(i: number, x: number, y: number, z: number, rotY: number, totalH: number, color?: THREE.Color): void; // y = suelo del palé
  hide(i: number): void;                // zeroMatrix en base y load
  get meshes(): THREE.InstancedMesh[];
}
```
- La **carga** mide `totalH − EURO_H` de alto (mínimo 0,3), de 1,14 × 0,78 (ligeramente menor que el palé, para ver la madera), centrada en el palé, apoyada en `y + EURO_H`.
- Para que `base` y `load` compartan transformación, `set` compone dos matrices por índice (la de `base` con escala 1; la de `load` con escala `(1,14, loadH, 0,78)` sobre una caja unidad).
- **Procedural de respaldo (`hi`, ≈ 200 triángulos):** 3 tablas inferiores (1,2 × 0,022 × 0,1), 9 tacos (0,145 × 0,078 × 0,1) en cuadrícula 3×3, y 5 tablas superiores (1,2 × 0,022 × anchos 0,145 / 0,1 alternados, con separación), color madera `0xc8a46e` con variación sutil por tabla vía colores de vértice. **`lo` (≈ 40 triángulos):** tablero superior sólido, tres patines inferiores (1,2 × 0,078 × 0,1) y nada más. Fusionar con `mergeGeometries` (`three/examples/jsm/utils/BufferGeometryUtils.js`) en una sola geometría por LOD.
- `base.raycast = () => {}` para que `pickStock`/`pickEntities` solo golpeen la carga (la selección sigue funcionando por `load`).
- Materiales: `MeshLambertMaterial` con `vertexColors: true` para la base; la carga conserva el material actual (color por instancia).

### 7b.3 Dónde se sustituye
1. **`build-racks.ts` (estáticos y suelo de FyV):** `palletMesh`/`floorMesh` pasan a `PalletBatch` con `lod: 'lo'` (≈ 17.000 × (40 + 12) triángulos ≈ 0,9 M). `RacksModel` expone `batch` además de `paletMesh` (= `batch.load`, para no romper `pickStock`, `setStockColorMode` y los índices `byIndex`). El nombre `'pallets'` de los meshes se conserva para la capa «palets» (`setLayer`): añadir `batch.base` con el mismo nombre.
2. **`entity-sync.ts`:**
   - `slotMesh` (huecos que cambian) → `PalletBatch(n, { lod: 'lo' })`; `updateRackSlot` usa `batch.set/hide` en lugar de `setMatrixAt`, y el rango de subida a GPU (`uploadRange`) se aplica a **ambas** mallas. Mismo trato para el `staticMesh` oculto por cambio (`hiddenStatic`).
   - `dynamicPalets` (600) → `PalletBatch(600, { lod: 'hi' })`; `placePalet` usa `Pallet.height` real de la simulación (`state.paletById[pid].height`) en lugar del 0,5 fijo, así un palé mide lo mismo en la estantería, en la horquilla y en la calle.
   - `FORK_PALET_Y = 0.28` (centro de una caja de 0,5) pasa a «suelo del palé» = `+0.03` sobre la horquilla; `FLOOR_PALET_Y = NAVE_FLOOR_H + 0.25` pasa a `NAVE_FLOOR_H` (el palé apoya en el piso). Reajustar las apilaciones en calle/flejadora: capa `k` a `NAVE_FLOOR_H + k * (altura real del palé)`, nunca a 0,5 fijo; con `MAX_FLOOR_LAYERS = 2` si la carga mide > 1,0 m para no superar los 3 m.
   - `RACK_PALET_H = 1.2` → leer `Pallet.height` cuando el palé está en un hueco (hoy es 1,2 fijo).
3. **`warehouse-scene.ts`:** añadir `batch.base`/`batch.load` de los lotes a la escena (hoy se añaden `meshes` sueltas) y llamar a `loadEuroPalletGlb()` al construir el mundo (sin esperar; si falla, queda el procedural).
4. **Resaltado de stock (`highlight`)**: la altura de 5 m hay que reducirla a `3 × LEVEL_HEIGHT` (4,8 m).

### 7b.4 «Todo sobre un palé» en la simulación
- Comprobar con `grep` que **ningún flujo** mueve mercancía sin un `Pallet`: máquinas (`carriedPalets`), camiones (`cargoPaletIds`), flejadoras y calles ya usan ids de palé. Es la regla de diseño: no añadir nunca cajas sueltas.
- Cada camión atracado muestra el número de palés pendientes en `ds.totalPalets`; **no** dibujar carga dentro del remolque (es opaco): fuera de alcance.
- Palés de los camiones entrantes (`createPalet`: `height: 1.2`): variar con `nextRandom` entre 0,9 y 1,6 m para que las cargas no sean idénticas (determinista).

### 7b.5 Aceptación
- A zoom 1 se ve el europalé (tablas y tacos) bajo cada carga en estanterías, horquillas, calles de pre-carga y flejadoras; ninguna caja flotante ni sin base.
- Un palé tiene la misma altura total en el hueco, en la horquilla y en la calle.
- El selector de stock sigue funcionando (clic en un palé abre su ficha) y el modo «ubicación vacía» marca los huecos vacíos.
- Con 17.000 palés estáticos + 600 dinámicos: ≥ 45 fps a zoom 3 (medir con `onFps`). Si no llega, quitar `castShadow` de `base` en los lotes `lo`.
- `check-sim.ts` determinista; `tsc` y `lint` limpios.
- Con y sin `public/models/euro-pallet.glb` presente la escena arranca (probar renombrando el archivo).

---

## Fase 8 — Documentación y verificación final (Haiku)

- Actualizar: `PLAN.md` (§ niveles: «3 niveles de palé: nivel 0 picking, 1–2 reserva»; dimensiones de salas y paso de muelles), `kb/00-plataforma.md`, `kb/02-zonas.md` (hoy dicen 7/5/6 niveles, ya desfasado), `kb/03-maquinaria.md` (nº de plazas), `src/data/ragKnowledgeBase.ts:25` («estanterías de 4 y 5 niveles») y `src/rag/ragEngine.ts` si cita cifras de las salas. Cifras actuales de ubicaciones: ejecutar `check-layout.ts` y copiar los números reales.
- Recorrido visual completo (los 4 ángulos × 3 modos de muros): racks, muelles sur y este, salas, baños, camiones atracando, máquinas cruzándose.
- Ejecutar `npm run build` (debe compilar) además de `tsc` y `lint`.
- Dejar en el mensaje del último commit las métricas antes/después de `check-traffic.ts`.

## Riesgos conocidos

- **Fase 2:** mover las puertas puede romper enlaces de grafo (`lane-*`, `ce-*`). Si `check-sim.ts` muestra camiones atascados o `stats.shipped` a 0, revisar primero `buildIndoorGraph`.
- **Fase 3:** si las 48 plazas no caben en 20 m de ancho con las medidas dadas, **reducir a 5 columnas (40 plazas) antes que mover racks**, y avisar: la flota tiene 41 máquinas, así que con 40 plazas haría falta ampliar a 5 bloques dobles.
- **Fase 5:** el cambio de fuente de verdad toca simulación y escena a la vez; hacerla en una rama y no mezclar con la 6.
- **Fase 6:** el rendimiento de las comprobaciones de huella a 300×. Usar la rejilla y salir pronto por distancia.
