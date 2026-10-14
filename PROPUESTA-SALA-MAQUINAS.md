# Sala de máquinas: estado actual y propuesta de ampliación

Estado: **pendiente de decisión**. La sala se ha reorganizado dentro de su hueco actual; no se ha ampliado.

---

## 1. Estado actual (verificado)

- Rectángulo `sala-reposo`: x −125…−105, z −85…−14,5 (20 × 70,5 m), dentro de la nave.
- **48 plazas de reposo** (REP-01…REP-48) en dos columnas:
  - Columna oeste, pegada al muro de la nave, en x = −122,5.
  - Columna este, junto a la calle de maniobra (x = −118,5) y la troncal (x = −109,5), en x = −114,5.
  - Bloque norte (transversal de entrada, z −84…−40,8): 18 plazas por columna = 36.
  - Bloque sur (z −29,3…−17,3): 6 plazas por columna = 12.
  - Paso de 2,4 m (plaza de 2,1 m + 0,3 m). Entre máquinas aparcadas quedan ~1,2 m.
- **12 cargadores** (sala de carga, x −125…−105, z −115…−93), sin cambios.
- Entrada de la sala por el transversal z = −34. Rótulo «Sala de máquinas» sobre ese transversal.
- `check-layout.ts`: 48 reposo, 12 carga, 0 aristas de sala que cruzan plazas ajenas.

### Por qué no se ha ampliado hacia el oeste

- El muro oeste de la nave está en x = −125. Al otro lado hay oficinas (x −175…−135, z 10…60) y aparcamiento de turismos (x −205…−180, z 10…80). Esas zonas no se solapan con la franja z −84…−16, pero una ampliación de la nave hacia el oeste en todo su largo sí las tocaría.
- Una sala anexa tendría que ser a nivel de calle, y la nave está a 1,2 m. Hay que revisar a qué altura se dibujan y se posicionan las plazas y las máquinas (`build-building.ts`, `entity-sync.ts`).

### Historial de esta sesión

- Una versión de **tres columnas** (72 plazas, paso 2,4 m, columnas en x −122,5 / −114,5 / −106,5) quedaba apretada contra el transversal de entrada. Se ha descartado visualmente.
- La versión de dos columnas (48 plazas) es la que está ahora.

---

## 2. Opciones de ampliación

### Opción A — Sala anexa al oeste, a nivel de calle (recomendada si se quiere más capacidad)

Terreno libre comprobado: x −170…−125, z −84…−16. No choca con las oficinas, el aparcamiento ni el depósito contra incendios (x −130…−70, z −148…−132).

Geometría propuesta:

- Rectángulo `sala-anexa`: x −170…−125, z −84…−16.
- Dos columnas de plazas con calle central:
  - Columna oeste en x = −160 (14 plazas, paso 2,4 m desde z −82,8).
  - Columna este en x = −134 (14 plazas).
  - Calle de maniobra central en x = −147 (ancho ~7 m).
- Total: **28 plazas nuevas**. Con las 48 actuales, **76 en total**.
- Puerta en el muro oeste de la nave (x = −125), hueco de 6 m en z −37…−31, a la altura del transversal z = −34.
- Muros propios de la anexa: norte (z = −84), sur (z = −16) y oeste (x = −170), 3 m de altura, con hueco en el muro de la nave.

Grafo (`buildIndoorGraph`):

- Nodo de la calle central en cada z de plaza, y un nodo de acceso por plaza (bidireccional).
- Arista bidireccional entre la calle central (x −147, z −34) y el nodo `room-cross-1-−34` (x −118,5, z −34), que atraviesa el muro por el hueco.
- **Importante:** `buildIndoorGraph` filtra las plazas por x (`< −120` y `≥ −120`). Las plazas de la anexa tienen que quedar fuera de esa lógica (filtrar por `room.id`), o entrarían en el circuito de la sala de máquinas.

Cambios por archivo:

| Archivo | Cambio |
|---|---|
| `src/lib/layout/pinto-layout.ts` | Nueva `WarehouseRoom` `sala-anexa`; grafo de la anexa; excluir sus plazas del circuito actual |
| `src/three/builders/build-building.ts` | Hueco de 6 m en `buildOuterWalls` (muro oeste, z −37…−31); muros de la anexa (estilo `buildRestroomWalls`) |
| `src/three/builders/build-site.ts` | Excluir la anexa de la vegetación (`onYard`) |
| `src/three/builders/build-labels.ts` | Rótulo «Sala de máquinas (anexa)» |
| `src/lib/sim/tick.ts` | `findFreeSpot`: la regla de transpaletas usa `spot.z > ROOM_SOUTH_BLOCK_Z`; las plazas de la anexa (z < −48) no entran en ese bloque |
| `scripts/check-layout.ts` | Añadir comprobaciones de la anexa (cruces, solapes con el tabique y el aparcamiento) |

Riesgos:

- Altura de la anexa (nivel de calle frente a 1,2 m): hay que revisarla en `build-building.ts` y `entity-sync.ts`.
- Los nodos nuevos quedan conectados con el circuito de la sala actual por un único punto (z −34). Si ese punto se bloquea, la anexa queda aislada. Conviene que `check-sim` compruebe que todas las máquinas llegan a sus plazas.
- Cambia el número de plazas que usa `init.ts` (hoy REP-01…REP-41): las máquinas se pueden repartir entre las dos salas.

### Opción B — Mantener 48 plazas

- Sin cambios de geometría.
- Capacidad: 48 plazas frente a 41 máquinas. Medido en el informe de sala de máquinas: pico de 40 ocupadas con 42 plazas, así que hay margen, aunque justo.
- Ventaja: no hay riesgo en la simulación ni en el grafo.

### Opción C — Tres columnas dentro de la sala actual (72 plazas)

- Ya probada: capacidad alta, pero visualmente apretada contra el transversal. Descartada.

---

## 3. Decisión pendiente

### 3.1 Datos de partida (medidos)

- **Flota:** 41 máquinas (14 retráctiles, 9 frontales, 12 recogepedidos, 6 transpaletas).
- **Máquinas activas a la vez (máximo por turno):** mañana 26, tarde 20, noche 4.
- **Ocupación de la sala (16 h, una semilla):**
  - Con 42 plazas (configuración anterior): máximo 40 ocupadas en mañana y en tarde; mínimo 2 libres.
  - Con 48 plazas (actual): mínimo 8 libres en mañana y 9 en tarde.
  - Máquina sin plaza más de 5 min: 1 caso en ambas configuraciones. La sala no es el cuello de botella.
- **Cargadores (12):**
  - Máximo simultáneo: 3 ocupados con 42 plazas; 4 con 48.
  - Con todas las baterías al 21 % (estrés de 1 h): 12 de 12 ocupados. En operación normal no son el límite.

### 3.2 Comparación de opciones

| | A. Sala anexa al oeste | B. Mantener 48 plazas | C. Tres columnas (72) |
|---|---|---|---|
| Plazas totales | 76 | 48 | 72 |
| Cambio de geometría | Sala nueva fuera de la nave, puerta y muros propios | Ninguno | Ninguno (ya probado) |
| Riesgo en simulación | Medio: la anexa se conecta por un único punto (z −34) | Ninguno | Bajo |
| Riesgo visual | Alto: a nivel de calle (1,2 m por debajo de la nave) | Ninguno | Alto: apretada contra el transversal |
| Trabajo estimado | Alto: 6 archivos y nuevas comprobaciones | Nulo | Nulo |
| Estado | No implementada | **Aplicada** | Descartada |

### 3.3 Recomendación

- **Si la flota se mantiene en 41 máquinas: opción B.** Con 48 plazas el margen mínimo en pico es de 8. La opción A añadiría riesgo en la simulación y en el 3D sin una necesidad demostrada.
- **Si la flota va a crecer:** opción A, con la decisión del punto 3.4.2 resuelta.

### 3.4 Lo que necesito que decidas

1. **¿Va a crecer la flota?** Si no, opción B. Si sí, ¿cuántas máquinas más?
2. **Si es la opción A, ¿a qué nivel va la anexa?**
   - a) A nivel de calle, sin cubierta, fuera de la nave (más sencilla de dibujar; hay que resolver la altura de las plazas).
   - b) A la altura de la nave, con cubierta y el mismo suelo (más coherente visualmente; más trabajo en la nave).
3. **Si es la opción A, ¿la anexa necesita cargadores propios?** Hoy los 12 cargadores están en la sala de carga, al norte. Sin cargadores en la anexa, las máquinas tienen que recorrer hasta el norte para cargar.
4. **Si es la opción A, ¿qué plazas usan las transpaletas?** Hoy la regla es el bloque sur de la sala (`ROOM_SOUTH_BLOCK_Z`). Con la anexa hay que decidir si entran en la anexa o solo en la sala actual.

### 3.5 Lo que habría que verificar (solo si se elige A)

- Altura de dibujo de plazas y máquinas en la anexa (`build-building.ts`, `entity-sync.ts`).
- Que todas las máquinas llegan a sus plazas en la simulación (`check-sim.ts`).
- Que la vegetación no cae sobre la anexa (`onYard` en `build-site.ts`).
- Capturas del arnés: vista general de la sala y de la anexa.

### 3.6 Otros apartados de este archivo que están desfasados

- La sección «7. Layout y 3D» (sala de máquinas: 72 plazas en tres columnas) y el apartado «2.4» (la sala tiene 72 plazas) describen la versión de tres columnas que se descartó. No los he modificado porque pertenecen al documento de simulación. Hay que actualizarlos a 48 plazas.

## 4. Verificación prevista (si se aplica A)

- `check-layout.ts`: plazas, cruces y solapes de la anexa.
- `check-traffic.ts`: que las máquinas llegan a las plazas de la anexa y que no hay atascos en el transversal z = −34.
- Capturas en el arnés de capturas: vista general de la sala y de la anexa.



# Simulación de ALDI Pinto: lo que no funciona

Estado a 14/10/2026. Lista de problemas conocidos de la simulación tras los cambios de esta sesión: pedidos por clase, salida justo a tiempo, presupuesto de preparación por zona, entradas de proveedor y muelles compartidos de frío y congelado.

Las mediciones son de ejecuciones headless del día completo (06:00 a 22:00). Las cifras son orientativas: la simulación sigue cambiando.

---

## 1. Bloqueos críticos

### 1.1 El patio se satura y los camiones no atracan
- **Síntoma:** a partir de las 09:00 el patio llega al tope de 36 camiones y ningún camión atraca. El día completo sale solo entre 7 y 8 camiones de salida, frente a 314 pedidos.
- **Evidencia:** ejecución `dia7`/`dia8`. A las 07:00 hay 13 camiones en patio; a las 10:00, 36; en muelle, 0.
- **Lo que se sabe:**
  - En una medición anterior (16:12), todos los muelles de frío y congelado estaban libres mientras los camiones esperaban fuera.
  - Los camiones de salida ya cargados se quedan en el carril de salida este (x ≈ 180), sin salir.
  - Hay unos 18 camiones de salida fuera de la nave esperando entrada.
- **Qué hay en contra:** el tope de 36 incluye los camiones de entrada. Con 82 camiones de entrada al día más los de salida, el patio se llena.
- **Causa:** no identificada. El código de tráfico (`traffic*`, `truck-yard`, `truck-dock`) tiene cambios sin commit que no son de esta sesión.
- **Estado:** sin resolver. La consulta de diagnóstico a las 10:00 superó el tiempo de ejecución.

### 1.2 La mañana se para pronto
- **Síntoma:** en la mañana se lanzan 7 u 8 camiones y después no se prepara nada de seco, aunque el presupuesto de seco está casi entero (unos 29.800 bultos sin usar a las 07:00 en `dia8`).
- **Hipótesis (no verificada):** la ventana de salida (los 12 primeros pedidos que el turno puede preparar) se llena con pedidos de frío y congelado cuyo muelle está reservado por un camión que espera la parte cárnica de la tarde. Los pedidos de seco no entran en la ventana.
- **Intento fallido:** excluir de la ventana los pedidos cuyo muelle ya está reservado empeoró el resultado (8 salidas en lugar de 94). Se revirtió.
- **Estado:** sin resolver.

### 1.3 Pedidos y preparación atrapados por el tope de palés adelantados
- `PREP_STAGE_MAX = 300`: cuando las calles de muelle tienen más de 300 palés, no se adelanta nada salvo el primer pedido. No está verificado si el tope es la causa de algún bloqueo, porque en las últimas ejecuciones los palés preparados llegan a unos 170–290.

---

## 2. Capacidad: preparación y volumen

### 2.1 El volumen no cabe en la plantilla
- Volumen del día (ejecución de referencia): **314 pedidos, 109.371 bultos, 2.825 palés**.
- Capacidad con el reparto supuesto (ver 2.2):
  - Mañana: unos 49.000 bultos (22 de seco, 5 de frío y 3 de congelado).
  - Tarde: unos 26.000 bultos (6 de seco, 7 de frío y 5 de congelado).
  - Total: unos **75.000 bultos al día**, frente a 109.000 pedidos.
- **Congelado es el cuello más fuerte:** unos 9.500 bultos de capacidad al día para unos 36.000 bultos pedidos (estimación de un tercio del volumen por clase).
- Para cubrir el volumen harían falta unas 590 horas de preparación al día; la plantilla supuesta da unas 390.

### 2.2 Reparto de preparadores por turno y zona: supuesto sin confirmar
- El fichero de plantilla (`src/data/workers-seed.json`) lista **12 preparadores, todos de turno de mañana**: 9 de seco, 2 de frío y 1 de congelado.
- El modelo usa un reparto que no viene de ningún dato:
  - Mañana (30): 22 de seco, 5 de frío y 3 de congelado.
  - Tarde (18): 6 de seco, 7 de frío y 5 de congelado.
  - Noche (8): 4 de seco, 2 de frío y 2 de congelado.
- El usuario indica que tiene que haber preparadores de frío y congelado en la tarde. **Falta confirmar los números reales.**

### 2.3 Productividad
- Confirmado por el usuario: **congelado 150 bultos/h**, **frío 220 bultos/h**. Seco: 200 bultos/h, y 160 para limpieza y droguería.
- Como la simulación usa una tasa por zona, el seco queda en **191 bultos/h** (la media con el reparto de limpieza). Esta media es una aproximación: la productividad real es por pasillo.

### 2.4 Preparadores como máquinas
- El modelo de preparación por presupuesto de bultos no crea máquinas: sigue habiendo **12 recogepedidos físicos** en la simulación, aunque el presupuesto supone 48 preparadores.
- El roster físico por turno (crear hasta el máximo de presentes y encender solo los que vienen) **no está implementado**. La sala de máquinas tiene ya 72 plazas, así que el espacio ya no es el límite.
- No hay preparadores físicos de tarde en la simulación.

### 2.5 Noche
- `canTakeTask` no asigna tareas en el turno de noche (`shift.id === 'noche'`), pero el presupuesto de noche (8 preparadores) existe.
- Hipótesis (no verificada): los lotes de noche consumen el presupuesto de noche y quedan en cola hasta las 06:00.

---

## 3. Modelo de pedidos

### 3.1 Cárnicos y vegetales por pedido
- La fracción cárnica de cada pedido sale de la proporción de palés cárnicos en las secciones de las estanterías (unos 45 % en frío y 11 % en congelado; seco 0 %).
- **No hay datos reales de qué parte de cada pedido es cárnica o vegetal.** Cuando el usuario lo confirme, hay que sustituir la aproximación.

### 3.2 Vegetales
- `Frutas` y `Verduras` están en `NON_RACK_FAMILIES` (`catalog.ts`): no se guardan en estanterías, así que no se pueden preparar.
- En la práctica, el único vegetal preparable es `Patatas y verduras congeladas`.

### 3.3 Preparación para el día siguiente
- **No implementado.** La simulación solo prepara los pedidos del día que se simula.
- Lo que pidió el usuario (preparar el día siguiente, salida del camión el día que le toca, adelantar trabajo si sobra) requiere sembrar el stock de salida de la mañana del lunes y simular varios días.

### 3.4 Cadencia de salida
- Salida "justo a tiempo": el camión sale cuando su pedido está en la calle de su muelle. Mínimo 10 minutos entre camiones, según la versión anterior.
- Hay tope de **12 camiones de salida en patio** a la vez (`SALIDAS_EN_PATIO_MAX`). Decisión mía, sin validar: puede ser la causa de la parada de la mañana.
- Frío y congelado solo salen por la tarde (confirmado por el usuario).

---

## 4. Entradas de proveedor

- Cada clase recibe lo mismo que sale de esa clase: 756 palés de seco, 678 de frío y 980 de congelado, en 82 camiones de hasta 30 palés.
- Ventanas: seco hasta las 10:00, frío y congelado hasta las 12:00.
- **No verificado:** que la capacidad de descarga (9 frontales), de almacenamiento (14 retráctiles) y de reposición de los pick faces sea suficiente para 82 camiones de entrada.
- **Problema de muelles:** los muelles de entrada de frío y congelado (`dockMatches`, índice ≥ 44) son los mismos muelles de salida 47–60 que usan los camiones de salida. Los camiones de entrada ocupan muelles que necesitan los de salida durante la mañana.

---

## 5. Muelles

- Frío y congelado comparten los muelles 47–60 (confirmado por el usuario). Los muelles 37–46 (`cool` en el plano) ya no reciben pedidos de salida.
- **No decidido:** qué uso tienen los muelles 37–46. Hoy se quedan vacíos para salida.
- Muelles de entrada: `dockMatches` acepta camiones de frío en muelles de congelado y viceversa. No está verificado que no haya efectos laterales en la asignación de muelles de entrada.

---

## 6. Trabajadores y plantilla (interfaz)

- La ficha de trabajador ya no muestra descanso, vacaciones ni EPI.
- **Pendiente:** la lista de la plantilla (`workers-panel.tsx`) sigue mostrando "2 Días Libres" y "Vacaciones". El usuario no ha dicho si hay que quitarlos también ahí.
- La plantilla del fichero no coincide con el modelo (ver 2.2 y 2.4).

---

## 7. Layout y 3D

- **Altura de palés 1,60 m:** choca con dos límites del plano:
  - La flejadora deja 1,3 m bajo el cabezal (`entity-sync.ts`, comentario original).
  - El nivel de rack mide `LEVEL_HEIGHT = 1.6`, así que un palé de 1,60 m no deja hueco al nivel superior.
  - Las pilas en suelo usan `LAYER_H = 1.35`.
  - El usuario ha dicho que 1,60 m es el estándar; falta decidir cómo tratar los límites.
- Sala de máquinas: 72 plazas en tres columnas (`pinto-layout.ts`). Todas son alcanzables desde la entrada y `check-layout` no encuentra cruces. Lo que no se usa todavía es el roster físico (2.4).

---

## 8. Calidad del código y del trabajo

- **Refactor de `src/lib/sim/`:** el archivo `tick.ts` se dividió en decenas de módulos. Verificado con `tsc`, `eslint` y una comparación de salida (antes de los cambios de demanda). Los archivos nuevos no están en git: no hay diff que revisar.
- **Formato:** todos los archivos de simulación están en LF y con importaciones ordenadas. Verificado con `tsc` y `eslint`.
- **Arnés de paridad:** `budget.ts` y su salida de referencia (`budget-before-split.txt`) ya no son comparables porque el comportamiento cambió a propósito. Hace falta un nuevo punto de referencia antes de seguir refactorizando.
- **Archivos modificados por otra persona durante la sesión:** `demand.ts`, `init.ts`, `dispatch.ts`, `work-picking.ts`, `preparacion.ts`, `outbound-window.ts`, `truck-spawn.ts` y `truck-seed.ts`. Se han respetado los cambios en disco, pero conviene revisar que no hay conflictos.
- **Sin commit:** todo el trabajo de esta sesión está en el árbol de trabajo (`fix/plan-correcciones`).

---

## 9. Comprobaciones que faltan

- Día completo, con cierre de patio y muelles, hasta las 22:00 y con varias semillas.
- Escenario con la plantilla confirmada (reparto por turno y zona).
- Verificación de la capacidad de descarga y almacenamiento para 82 camiones de entrada.
- Pruebas de la fracción cárnica con datos reales de pedidos.
- Scripts de `scripts/` que dependan de `tick.ts` o de la demanda antigua (`check-sim.ts`, `check-handling.ts`, `check-traffic.ts`), que no se han vuelto a ejecutar tras los cambios.

---

## 10. Próximos pasos (propuestos)

1. Diagnosticar el atasco del patio (1.1) con una consulta de estado a las 09:00 y 10:00: camiones por estado, ocupación de muelles 47–60, cola de carril este.
2. Decidir el tope de camiones en patio: separar el tope de entrada del de salida.
3. Confirmar el reparto de preparadores por turno y zona y sustituir el supuesto.
4. Implementar el roster físico (2.4) o aceptar el presupuesto abstracto.
5. Confirmar la fracción cárnica por pedido (3.1).
6. Decidir la altura de palé frente a flejadora y niveles de rack (7).
