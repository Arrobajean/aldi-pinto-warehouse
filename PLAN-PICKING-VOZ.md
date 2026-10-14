# Plan: picking por voz (colas y palé mixto)

Documento de trabajo para iterar. Nada de esto está implementado todavía.

## Cómo se trabaja en la plataforma

1. El preparador recibe por el talkman (picking por voz) una **cola**: el pedido de una tienda en un grupo de
   pasillos (p. ej. vinos, bebidas y gaseosas, con unas 150 ubicaciones).
2. La voz le dicta ubicación por ubicación y cuántas cajas coger: 1 Coca-Cola, 5 cervezas, 10 cervezas de otra
   marca… Coge solo esas cajas; el palé de stock se queda en su hueco con lo que le sobra.
3. Con lo que coge **va armando un palé de salida mixto** de 1,60 m como máximo. El número de palés lo marca el
   volumen, no el número de productos: una cola de 200 productos pequeños cabe en 1 palé.
4. Cuando termina la cola de esa tienda, **el palé se cierra aunque vaya a medias**. Si no cabe, se abren los que
   hagan falta.
5. Lo lleva a la **flejadora**; después de flejado se deja en la **zona de expedición**, donde otro operario lo
   recoge y lo lleva al **muelle**.

## Decisiones tomadas

### Colas

Frío, congelado, pan y bazar van cada uno en su cola. El seco se divide en varias. Con los pasillos actuales
(`AISLE_FAMILY_MAP`, `src/lib/stock/catalog.ts:432`):

| Cola | Pasillos | Por qué |
|---|---|---|
| Bebidas | S-01, S-02 | Vinos, bebidas y gaseosas: lo más pesado, su propio palé |
| Alimentación seca | S-03 a S-08 | Aceites y salsas, legumbres, conservas: se apilan bien juntos |
| Pan | S-09, S-10 | Cola propia (indicado por ti) |
| Droguería | S-11 a S-16 | Higiene, cosmética y limpieza: no se mezclan químicos con alimentación |
| Bazar | S-17 | Cola propia (indicado por ti) |
| Frío | F-01 a F-10 | Toda la cámara junta |
| Congelado | C-01 a C-04 | Toda la cámara junta |

Hoy el seco tiene 8 secciones (una por familia, `pickSection` en `src/lib/sim/sections.ts:23`); pasan a 5. Cambia
también el reparto de preparadores por sección (`assignSections`).

### Palé de salida

- Altura máxima **1,60 m** (base de 0,144 m incluida). Capacidad por volumen: 1,20 × 0,80 × (1,60 − 0,144) × 0,75,
  con el volumen de caja de cada familia (`CAJA_POR_FAMILIA`).
- Un palé es de **una tienda y una cola**. Al terminar la cola se cierra, aunque vaya a medias.
- Si la siguiente línea no cabe, se cierra el palé y se abre otro en la misma cola.

### Ubicación vacía (faltas)

- Ubicación vacía **y hay stock en reserva**: se salta la línea y se pide la reposición de esa ubicación. La línea
  se repite al final de la cola: si para entonces ya está repuesta, se coge; si no, **se marca a 0** (falta).
- Ubicación vacía **sin stock en reserva**: se marca a 0 directamente.
- Las faltas se cuentan por pedido y por tienda (para el panel y el asistente).

## Cómo lo hace hoy la simulación

| Punto | Hoy | Dónde |
|---|---|---|
| Pedido | Solo bultos por tienda y clase térmica; `paletsCount = bultos ÷ media de la zona` | `src/lib/sim/demand.ts:71`, `src/lib/sim/types-demand.ts` |
| Reparto | `paletsCount` se reparte entre secciones en palés enteros | `splitOrder`, `src/lib/sim/picking.ts:104` |
| Recogida | Cada lote coge 1–2 **palés de stock enteros** | `takeInWalkOrder` / `takeColdRoute`, `src/lib/sim/work-picking.ts:93-95` |
| Palé de salida | El mismo palé de stock pasa a `prepared` y se fleja; su hueco queda libre | `src/lib/sim/machine-task-complete.ts:74-107` |
| Tiempo | Duración fija de la tarea (4 s + flejado manual); la productividad solo descuenta un presupuesto de bultos | `src/lib/sim/work-picking.ts:118`, `src/lib/sim/preparacion.ts` |
| Salida del camión | Cuando en la calle hay `paletsCount` palés | `src/lib/sim/outbound-window.ts:38`, `src/lib/sim/truck-spawn.ts:120` |

Lo que ya sirve y se mantiene: las secciones de preparación (pasan a ser las colas de arriba); las flejadoras y su
cola (`src/lib/sim/strappers.ts`); la transpaleta que lleva lo flejado a las calles de muelle; la reposición
(`replenish`); el presupuesto de bultos por turno.

## Fases

El cambio de fondo es separar dos cosas que hoy son la misma: **el palé de stock** (una referencia, se gasta por
cajas) y **el palé de salida** (mixto, se crea al empezar la cola y se cierra al terminarla o al llenarse).

### Fase 0: medir antes de tocar

- Script en `scripts/` que corra un día simulado y saque: palés de salida por pedido, palés de stock retirados,
  flejados, viajes de recogepedidos y camiones fuera de hora. Es la referencia para comparar después.

### Fase 1: colas y datos (pedido por líneas y stock por cajas)

- `pickSection` agrupa el seco en las 5 colas de la tabla.
- `StoreOrder` pasa a llevar **colas**: `{ cola, lineas: { locId, sku, family, cajas }[] }`. Se generan desde los
  bultos de la tienda repartidos por cola y, dentro de cada cola, entre ubicaciones (pocas cajas por línea: 1–12,
  más en bebidas).
- `paletsCount` se calcula por cola al generar el pedido (volumen de sus líneas ÷ capacidad del palé, hacia
  arriba) y el del pedido es la suma de sus colas. Sustituye a `bultos ÷ media de la zona`.
- Palé de stock: `quantity` pasa a ser **cajas que quedan**. Se inicializa con `bultosPorPaleFamilia(family)`.
- `catalog.ts` exporta `volumenCaja(family)` y `CAPACIDAD_PALE_M3`.

### Fase 2: palé de salida mixto

- `Pallet` con `kind: 'stock' | 'salida'`; el de salida lleva `{ orderId, storeId, cola, lineas, volumen }` y su
  altura sale del volumen. Se crea al empezar la cola.
- Cada recogida suma volumen. Si la siguiente línea no cabe, se cierra y se abre otro.
- El palé de stock baja de cajas; al llegar a 0 sale del hueco, se libera la ubicación y salta la reposición.
- Faltas según las reglas de arriba: líneas saltadas a una lista de repaso al final de la cola, y a 0 si no se ha
  repuesto.

### Fase 3: recorrido de la cola y tiempos

- Una tarea `pick` = una cola entera de una tienda: paradas en cada ubicación de sus líneas, en orden de recorrido
  (`walkOrder`; en frío, la serpentina de pasillos 1 a 10).
- Tiempo en cada parada según cajas ÷ bultos/h de la zona (`BULTOS_HORA`), más el desplazamiento real. El
  presupuesto del turno se descuenta por cajas cogidas, no por palés.
- Al terminar la cola: a la flejadora (o flejado manual si las dos están llenas, como hoy).
- Revisar las paradas del recogepedidos (`src/lib/sim/handling-task-stops.ts`): hoy paran para cargar palés de la
  estantería; ahora paran para coger cajas y el palé que llevan es el de salida.

### Fase 4: expedición y camión

- Después del flejado, el palé va a la zona de expedición y la transpaleta lo lleva a la calle del muelle (ya
  existe, solo cambia el palé que se mueve).
- El camión sale cuando **todas las colas del pedido** están terminadas y sus palés en la calle, no cuando se llega
  a `paletsCount`. Afecta a `outbound-window.ts`, `truck-spawn.ts`, `truck-dock.ts` y las salvaguardas de
  `work-picking.ts:53-77`, que hoy recalculan palés que faltan y desaparecen.
- Entradas de proveedor (`demand.ts:79-96`): se dimensionan por cajas consumidas, en palés de stock completos.

### Fase 5: 3D y paneles

- Palé de salida: altura de la carga según lo que lleva (crece mientras se prepara) y color mixto.
- Palé de stock en picking: la carga baja según las cajas que quedan.
- Paneles (`stock-panel`, `dock-list`, `machine-card`, eventos): "cola Bebidas de tienda Y, línea 37/150", palés
  reales por pedido, cajas por palé, faltas.

### Fase 6: conocimiento y asistente

- Actualizar `kb/02-zonas.md` y `kb/03-maquinaria.md` con el picking por voz y las colas, y las herramientas del
  asistente (`src/lib/server/tools.ts`) que hablan de palés preparados.

## Decisiones cerradas en la última vuelta

1. **Palés por cola, calculados de antemano.** Con el pedido de la tienda ya se sabe el tamaño de cada producto,
   así que el número de palés de cada cola se calcula al generar el pedido (suma del volumen de sus líneas ÷
   capacidad del palé, redondeado hacia arriba). No es una estimación: es lo que la voz manda preparar. El
   recogepedidos lleva como mucho 2 a la vez (`MAX_PALETS_PER_TRIP`); si la cola necesita más, se hace en tramos de
   2 palés, siguiendo el recorrido.
2. **Lo pesado va abajo por la ubicación.** El slotting ya pone lo pesado al principio del recorrido (bebidas en
   S-01/S-02). Las líneas de cada cola se recorren en `walkOrder`; no hace falta reordenar por peso.
3. **Cajas por línea** (decidido por Claude, ajustable):
   - Bebidas: 2–20 cajas por línea (media ~6).
   - Alimentación seca, droguería, pan, frío y congelado: 1–8 (media ~3).
   - Bazar: 1–3.
   - Líneas por cola = bultos de la cola ÷ media de su tipo, con tope en las ubicaciones de la cola (una referencia
     sale una vez por pedido). Si no caben con ese tope, se suben las cajas por línea.
4. **Zona de expedición = playas de consolidación** que ya están en el plano (`src/lib/sim/consolidation.ts`,
   tareas `transfer` con `consolidate`). Flejadora → playa de consolidación del pedido → transpaleta a la calle del
   muelle.
5. **Colas de seco**: las 5 de la tabla (confirmado por el usuario).

## Instrucciones para quien ejecute este plan

- Lee `AGENTS.md` primero. Todo el texto de código, comentarios y eventos va en español, con el estilo de los
  ficheros de `src/lib/sim/` (comentarios de una o dos líneas que explican el porqué).
- Hazlo **por fases y en orden**. Al acabar cada fase: `npx tsc --noEmit` sin errores y `npx tsx
  scripts/medir-picking.ts` (o con una hora de fin más corta, p. ej. `20260301 12`, porque el día completo tarda
  más de 10 minutos) para comparar con la línea base.
- No hagas commit sin que lo pida el usuario. El árbol ya tiene muchos cambios sin commit que no son tuyos: no los
  reviertas.
- La fase 0 ya está: `scripts/medir-picking.ts` saca lotes, palés retirados, palés por lote, viajes, reposiciones y
  reparto por sección.
- Criterios de aceptación al final:
  - Ningún palé de stock pasa a `prepared`: los palés que se flejan y se cargan son solo de salida.
  - Los palés de stock en picking bajan de cajas y solo dejan el hueco al vaciarse.
  - Cada pedido sale con los palés calculados para sus colas (más o menos los que se cierren a medias).
  - Las faltas se marcan a 0 según las reglas de arriba y se ven por tienda.
  - Los camiones salen cuando todas las colas del pedido están en la calle del muelle.
