# PLAN — Gemelo digital ALDI Pinto

Plan de ejecución para un agente de código. Léelo entero antes de tocar nada. Trabaja **fase a fase**, en la rama indicada, y no pases a la siguiente fase sin cumplir sus criterios de aceptación.

---

## 0. Contexto

Un jefe de almacén debe ver **toda la vida de la plataforma logística de ALDI en Pinto (Madrid)** en 3D, con una vista isométrica tipo **Los Sims 1** (desde arriba y en diagonal, 4 rotaciones de 90°, 3 niveles de zoom, muros que se recortan):

- el almacén y sus zonas,
- las máquinas trabajando (retráctiles, frontales, recogepedidos), con posición en tiempo real ("GPS"),
- el stock por ubicación,
- la carga y descarga en muelles,
- los camiones que llegan y se van,
- un asistente IA (RAG) que responde sobre el almacén y su estado en vivo.

Idioma del producto y del código de cara al usuario: **español**. El usuario (Jean) itera: entrega cada fase funcionando y resume qué ver.

### Datos verificados (prensa, marzo de 2025)

| Dato | Valor | Nota |
|---|---|---|
| Superficie de la nave en Pinto | **~40.000 m²** (tras ampliar +9.000 m²) | Usar este valor |
| 248.000 m² | Suelo logístico **sumado por toda la red de Aldi España** | **No** es Pinto; no usarlo como tamaño de la nave |
| Provincias servidas | Madrid, Toledo, Segovia, Ávila, Guadalajara, Ciudad Real, Cáceres, Salamanca | 8 provincias |
| Otros | Iluminación LED, BMS, objetivo BREEAM "Excelente" | Útil para la base de conocimiento del RAG |

Fuentes: alcabodelacalle.es/economia/aldi-amplia-su-centro-logistico-en-pinto/ · elmercantil.com/2025/03/06/aldi-amplia-su-plataforma-en-pinto-para-reforzar-su-capacidad-logistica-en-espana/ · forbes.es/economia/642732/

**No hay plano interior público.** La distribución interior es **inventada pero verosímil**, en metros reales. Toda tienda, matrícula, operario o SKU es **simulado**: indícalo en la UI (pie: "Datos simulados con fines de demostración") y en el README.

### Decisiones tomadas por Jean

1. Parcela grande con viales y aparcamientos, **nave de ~40.000 m²**.
2. 8 provincias (tabla de arriba).
3. IA: reutilizará **su API key del proyecto "RAG Atlas" y Supabase**. **Proveedor del LLM pendiente de confirmar**: pregunta antes de F5. La clave **nunca** va al navegador.
4. "GPS" dentro de una nave = **localización de interior (RTLS por UWB/BLE)**. Se simula, con una interfaz preparada para conectar datos reales.

---

## 1. Estado actual del repo (rama `feat/f0-f1-plano`)

Ruta: `C:\Users\jeanc\aldi-pinto-warehouse`. Git inicializado; commit de seguridad `3bab4b8` en `master` con el estado importado.

- Stack instalado: Vite 8, React 19, three 0.186, TypeScript 6, lucide-react. Scripts: `dev` (puerto 3000), `build` (`tsc && vite build`).
- **Roto:** `index.html` carga `/src/main.tsx`, que **no existe**. `src/main.ts`, `src/counter.ts`, `src/style.css` y `src/assets/*` son la plantilla de Vite: bórralos.
- **Reutilizable con cambios:**
  - `src/three/SimsCameraController.ts`: la lógica de rotación, zoom y arrastre sirve, pero la escala está pensada para una escena de ±45 unidades (ver F1.4).
  - `src/types.ts`: ampliar las provincias y las zonas.
  - `src/data/warehouseData.ts`: unas 100 tiendas de 4 provincias, 8 muelles y agentes con coordenadas antiguas. Las tiendas se reaprovechan; muelles y agentes se regeneran desde el plano.
  - `src/rag/ragEngine.ts` + `src/data/ragKnowledgeBase.ts`: búsqueda local por palabras clave. **Llama a Gemini con la API key en la URL desde el navegador: eliminar en F5.**
  - Los imports de tipos deben ser `import type` (`verbatimModuleSyntax` está activo).

---

## 2. Convenciones obligatorias

### 2.1 Separación lógica / UI (preferencia permanente de Jean)

Adaptado a Vite (no hay `app/api`; el servidor vive en Supabase):

| Capa | Ubicación | Contiene | Prohibido |
|---|---|---|---|
| Tipos | `src/lib/types.ts` (+ `src/lib/layout/types.ts`, `src/lib/sim/types.ts`) | interfaces | lógica |
| Lógica pura | `src/lib/**` | plano, simulación, rutas, stock, formato | React, three, fetch |
| Cliente API | `src/lib/api.ts` | un `fetch` por endpoint con un helper `request<T>` | estado React |
| Render 3D | `src/three/**` | escena, builders, modelos, cámara, picking | React, reglas de negocio |
| Hooks | `src/hooks/use-*.ts` | estado y efectos; devuelven `{ datos, flags, acciones }` | JSX |
| UI | `src/components/<feature>/*.tsx` | presentación: recibe props y devuelve callbacks | fetch, reglas de negocio |
| Contenedor | `src/components/<feature>.tsx`, `src/app.tsx` | compone hooks y piezas de UI | markup largo |
| Servidor | `supabase/functions/*` | proxy del LLM, embeddings, BD | — |

- Componentes de más de ~150 líneas o con más de una responsabilidad: dividir. Archivos en **kebab-case**.
- La simulación (`src/lib/sim`) **no conoce three.js**. La escena lee el estado de la simulación cada frame (un snapshot) y actualiza matrices. Así el mismo estado alimenta la UI, la capa de localización y el RAG.
- Carga inicial en `useEffect` con `.then()` y una bandera de cancelación.

### 2.2 Unidades y coordenadas

- **1 unidad = 1 metro.** Y hacia arriba. Origen en el **centro de la nave**.
- +X = este, −X = oeste, **+Z = sur (fachada de muelles)**, −Z = norte.
- Rotación de las entidades: `heading` en radianes sobre Y; 0 = mirando a +Z.

### 2.3 Calidad

- Al cerrar cada fase: `npx tsc --noEmit` limpio, `npm run build` OK y la app arranca con `npm run dev` sin errores en consola.
- Rendimiento objetivo: **≥ 50 fps** en la vista general en un portátil medio. Todo lo repetido (estanterías, palets, plazas de aparcamiento, marcas) va en `InstancedMesh`. Nada de un `Mesh` por palet.
- Git: rama por fase (`feat/fN-<nombre>`), commits pequeños y en español. Terminar con `Co-Authored-By` según la configuración del entorno. Nunca a `master` directo; PR o merge solo cuando Jean lo pida.

---

## 3. Fases

### F0 — Base funcional (rama `feat/f0-f1-plano`, ya creada)

1. Borrar `src/main.ts`, `src/counter.ts`, `src/style.css`, `src/assets/`, `public/icons.svg`.
2. Crear `src/main.tsx` (monta `<App/>` en `#root`), `src/app.tsx` y `src/styles.css` con tokens CSS (ver §5).
3. Mover tipos a `src/lib/types.ts`:
   - `Province = 'Madrid'|'Toledo'|'Segovia'|'Ávila'|'Guadalajara'|'Ciudad Real'|'Cáceres'|'Salamanca'`.
   - `ZoneId = 'seco'|'frio'|'congelado'|'fyv'|'expedicion'|'carga_baterias'`.
4. Mover `warehouseData.ts` a `src/lib/data/stores.ts`. Conservar las tiendas existentes y añadir tiendas simuladas para Guadalajara (~8), Ciudad Real (~8), Cáceres (~6) y Salamanca (~8) con pueblos reales y nombres genéricos (`ALDI <Pueblo>`). Quitar los datos de muelles y agentes antiguos (se generan en F1/F2).
5. Arreglar los imports `import type`.
6. **Aceptación:** `npm run dev` muestra una pantalla oscura con la barra superior y un canvas vacío; `tsc` limpio.

### F1 — El plano del almacén en 3D

#### F1.1 Plano como datos (`src/lib/layout/pinto-layout.ts`)

Una función pura `buildPintoLayout(): WarehouseLayout` que devuelve rectángulos y listas. **Nada de three aquí.** Cifras de partida (ajustables):

**Parcela:** x −210…210, z −150…185 (≈140.000 m²). Vial perimetral de 8 m.

**Nave:** x −125…125, z −80…80 → **250 × 160 m = 40.000 m²**, altura libre 13 m.

| Zona | Rectángulo (x, z) | m² | Temperatura | Almacenaje |
|---|---|---|---|---|
| Seco | −125…30, −80…50 | 20.150 | 16–22 ºC | Estantería convencional de 7 niveles (11,6 m) |
| Carga de baterías (dentro de Seco) | −125…−105, −80…−40 | 800 | — | Cargadores y aparcamiento de máquinas |
| Frío | 30…125, −80…−25 | 5.225 | +2/+4 ºC | Estantería de 5 niveles |
| Frutas y verduras (FyV) | 30…70, −25…50 | 3.000 | +6 ºC, 85–90 % HR | **Palets en el suelo** en calles, sin estanterías |
| Congelado | 70…125, −25…50 | 4.125 | −22/−25 ºC | Estantería de 6 niveles, con antecámara |
| Expedición / consolidación | −125…125, 50…80 | 7.500 | según el muelle | Calles de pre-carga pintadas en el suelo, una por muelle |

**Estanterías** (zonas Seco, Frío y Congelado):
- Pasillos **norte-sur** (perpendiculares a los muelles), de 3,2 m de ancho (pasillo de retráctil).
- Paso de doble fila: `rack 1,1 + hueco 0,2 + rack 1,1 + pasillo 3,2 = 5,6 m`.
- Módulo de 2,7 m de frente (3 palets europeos de 0,8 m de ancho). Niveles cada 1,6 m.
- **Pasillos transversales** de 4 m cada ~40 m (en Seco: tramos z −76…−36, −32…4 y 8…44).
- **Nivel 0 = picking** (el modelo de ALDI: pocos artículos, picking a palet completo en el suelo) y niveles 1+ = reserva.
- Código de ubicación: `{zona}-{pasillo:2}-{módulo:2}-{nivel}-{hueco}`, por ejemplo `S-07-12-3-B`.
- Orden de magnitud esperado: **~40.000 ubicaciones de palet** en total. Calcúlalo y muéstralo.

**Muelles:** en la fachada sur (z = 80), de x −120 a 120, cada 4 m → **60 muelles** `D01…D60`.
- D01–D14: entrada de proveedores (seco).
- D15–D44: salida seco/multitemperatura.
- D45–D60 (frente a frío y congelado): entrada y salida frío. `temp` según la posición.
- Cada muelle tiene `{ id, x, kind: 'inbound'|'outbound', temp, doorWidth: 3, levelerDepth: 2.5, laneRect }`. `laneRect` es su calle de pre-carga en Expedición.

**Exterior:**
- Patio de maniobra z 80…120 (40 m), con marcas amarillas por muelle.
- Aparcamiento de semirremolques z 130…170, plazas de 4 × 17 m (~70 plazas).
- **Garita y báscula** en la entrada sureste (x ≈ 185, z ≈ 175), con barreras de entrada y salida.
- Oficinas y vestuarios: edificio de 2 plantas en x −175…−135, z 10…60.
- Aparcamiento de turismos del personal al oeste (x −205…−180).
- Depósito contra incendios y caseta de bombas al norte. Zona de lavado de camiones opcional.
- Puntos de recarga eléctrica de camiones (opcional, encaja con BREEAM).

**Red de caminos (para F2):** genera dos grafos con nodos y aristas en metros:
- `indoorGraph`: centros de los pasillos, pasillos transversales, frente de Expedición, puertas entre zonas y cargadores.
- `yardGraph`: garita → báscula → vial → aparcamiento → frente de cada muelle → salida.

Expórtalos en el layout. Así A* trabaja sobre datos, no sobre la malla 3D.

#### F1.2 Construcción 3D (`src/three/builders/*.ts`)

Un builder por bloque. Cada uno recibe el layout y devuelve un `THREE.Group`:
- `build-site.ts`: terreno, viales con asfalto y marcas, aceras, aparcamientos (instanced), garita y barreras, oficinas, depósito, algo de vegetación low-poly en el perímetro.
- `build-building.ts`: suelo de la nave con un tinte por zona (seco gris claro, frío azul pálido, congelado blanco azulado, FyV verde pálido, expedición gris con calles amarillas), muros exteriores, tabiques de las cámaras, puertas de muelle, abrigos y niveladoras.
- `build-racks.ts`: `InstancedMesh` para puntales (gris azulado), largueros (naranja, el clásico) y palets (caja de 1,2 × h × 0,8 con `instanceColor` según la familia de producto; h variable 1,0–1,5 m). Ocupación inicial aleatoria con semilla fija (~85 %).
- `build-labels.ts`: rótulos **pintados en el suelo** (canvas → textura en un plano): nombre de zona con temperatura y número de pasillo en cada cabecera. Sin DOM por rótulo.
- `models.ts`: fábricas low-poly con un estilo Sims de colores planos y bordes suaves:
  - `createReachTruck()` (retráctil: chasis, mástil alto, horquillas que suben y bajan, tejadillo).
  - `createCounterbalance()` (frontal: chasis, contrapeso, mástil corto, cabina).
  - `createOrderPicker()` (recogepedidos: horquillas largas para 2 palets, torre con el operario de pie).
  - `createTruck({ reefer })` (tractora + semirremolque de 13,6 m; el frigorífico lleva un equipo de frío en el frontal).
  - `createWorker()` (persona tipo cápsula con chaleco reflectante).

  Cada modelo expone sus nodos animables: `forks`, `mast` y `wheels`. Los colores van sin logos ni marcas registradas.

Estilo visual de referencia: **Sims 1 / maqueta**. Colores saturados pero suaves, `MeshLambertMaterial` o `MeshStandardMaterial` con poca rugosidad, `HemisphereLight` + `DirectionalLight` con sombras. La cámara de sombras sigue al punto de mira y su tamaño depende del zoom. Añade un ajuste de calidad (sombras sí/no).

#### F1.3 Muros estilo Sims (`src/three/wall-modes.ts`)

Tres modos, como en el juego: **arriba**, **recorte** (por defecto) y **abajo**.
- Recorte: los muros exteriores cuya normal mira hacia la cámara (según el `angleIndex`) bajan a 1 m, y los tabiques interiores bajan a 2,5 m.
- Abajo: todos los muros a 0,3 m.
- Al cambiar de modo, la altura se anima con un `lerp`.

No se dibuja la cubierta. Opcional: con zoom lejano, una cubierta translúcida con placas solares que se desvanece al acercarse.

#### F1.4 Cámara (refactor de `SimsCameraController.ts` → `src/three/sims-camera.ts`)

- Ortográfica. `frustumSize = 100` (100 m de alto visible con zoom 1). `near 1`, `far 3000`, distancia 800.
- Niveles de zoom fijos: **1 detalle = 4** (~25 m visibles), **2 zona = 1.4** (~70 m), **3 general = 0.32** (~310 m). La rueda del ratón hace zoom continuo entre 0.25 y 6.
- Interpolaciones con amortiguación según el tiempo transcurrido: `1 - Math.exp(-k*dt)`, no un `lerp` fijo por frame.
- Arrastre: metros por píxel = `(frustumSize/zoom)/altoCanvas`. El desplazamiento en profundidad se divide entre `sin(pitch)`. Limitar a los bordes de la parcela.
- Teclado: `Q`/`E` rotar, `1`/`2`/`3` zoom, `WASD` y flechas para desplazarse, `M` modo de muros, `F` volver a la vista general. Táctil: un dedo desplaza y pellizcar hace zoom.
- API: `focusOn(point, level)`, `focusZone(zoneId)`, `follow(entityId | null)` (este último se usa en F3).

#### F1.5 UI

- `src/components/viewport.tsx`: monta y desmonta `WarehouseScene` (`src/three/warehouse-scene.ts`). El renderer, el bucle, el resize y el raycast viven en la clase. React solo recibe callbacks: `onHoverZone`, `onSelect`.
- Barra superior: marca, "Plataforma Logística Pinto", indicadores (nave de 40.000 m², nº de ubicaciones, 60 muelles) y un reloj.
- Panel lateral: **Zonas** (al pulsar, la cámara enfoca) y **Capas** (estanterías, palets, rótulos, máquinas, camiones, exterior, sombras).
- Botonera de cámara abajo a la derecha: rotar ⟲/⟳, zoom 1/2/3, muros y reiniciar.
- Ficha de zona al hacer clic: superficie, temperatura objetivo, ubicaciones, ocupación y pasillos.
- **Responsive:** por debajo de 768 px el panel lateral pasa a ser una hoja inferior deslizable y la botonera se compacta.
- Hook `use-warehouse-scene.ts`: expone `{ selectedZone, layers, wallMode, zoomLevel, acciones }`.

#### F1.6 Aceptación F1

- Se ve la parcela completa en la vista general; al acercarse se distinguen puntales, largueros y palets.
- 4 rotaciones fluidas, 3 zooms, modos de muros y clic en zona con su ficha.
- Superficies de la ficha coherentes con la tabla (la nave suma 40.000 m²).
- ≥ 50 fps en la vista general con las sombras desactivadas.
- Máquinas y camiones **estáticos** colocados para validar la escala (un camión pegado a un muelle encaja con la puerta de 3 m).

---

### F2 — Simulación de la vida del almacén (rama `feat/f2-simulacion`)

Todo en `src/lib/sim/` (lógica pura, determinista con semilla).

1. **Reloj:** `SimClock` con velocidad ×0 (pausa), ×1, ×10, ×60 y ×300. Empieza a las 04:00. Turnos de mañana, tarde y noche, con número de máquinas activas distinto en cada uno.
2. **Bucle:** `tick(state, dt) → state`, con paso fijo de 0,1 s de simulación y acumulador. La escena interpola posiciones entre ticks.
3. **Rutas:** A* sobre `indoorGraph` y `yardGraph`, con caché de rutas. Seguimiento de ruta con velocidades reales: retráctil 9 km/h en pasillo y 2 km/h cargada; camión 15 km/h en el patio y 5 km/h maniobrando. Reserva simple de tramos: un pasillo estrecho admite **una máquina a la vez**; las demás esperan en la cabecera.
4. **Entidades y máquinas de estados:**
   - **Camión de entrada:** llega a la garita → pesa en la báscula → espera en el aparcamiento hasta tener muelle → entra marcha atrás al muelle → descarga (la frontal saca palets a Expedición) → sale → báscula → se va.
   - **Camión de salida:** igual, pero carga los palets preparados de su calle de pre-carga. Ruta a sus tiendas (ver F6 para el mapa exterior).
   - **Palet:** `recibido → en Expedición → ubicado (reserva) → bajado a picking → preparado → cargado → expedido`.
   - **Retráctil:** tareas de ubicar (Expedición → hueco de reserva) y reponer (reserva → nivel 0). Las horquillas suben a la altura real del nivel.
   - **Recogepedidos:** recorre ubicaciones de picking según la lista de un pedido de tienda y deja los palets en la calle de su muelle.
   - **Frontal:** descarga y carga camiones entre el muelle y Expedición.
   - **Batería:** baja con el uso; por debajo del 20 % la máquina va a la zona de carga.
5. **Generador de demanda:** pedidos diarios por tienda (de 20 a 40 palets según la tienda, a partir de `stores.ts`) y una agenda de llegadas de proveedores con algo de variación.
6. **Escena:** `src/three/entity-sync.ts` crea o reutiliza modelos por entidad y aplica posición, `heading`, altura de horquillas y palet cargado. Los palets de las estanterías se actualizan cambiando instancias (visible/oculto y color), sin recrear mallas.
7. **UI:** control de tiempo (play/pausa/velocidad), lista de muelles con su estado y barra de progreso, feed de eventos ("09:14 Camión 4821-KLP atracado en D07").
8. **Aceptación:** con ×60, en 10 minutos reales se ve un ciclo completo de llegada, descarga, ubicación, picking, carga y salida. No hay máquinas atravesándose en los pasillos. Los fps no bajan de 50 con unas 60 máquinas y 20 camiones.

### F3 — Localización en tiempo real / "GPS" (rama `feat/f3-rtls`)

1. `src/lib/rtls/`: interfaz `PositionSource` que emite `{ tagId, x, z, floorLevel, ts, accuracy }`.
   - `SimPositionSource` toma la posición de la simulación y le añade ruido gaussiano de ~0,3 m y un intervalo de 1 Hz, como un UWB real.
   - Deja preparado `WebSocketPositionSource` (sin implementar el backend) para balizas reales.
2. Suavizado (filtro de Kalman sencillo o media móvil) y reconciliación con la entidad.
3. Capas: **rastro** de los últimos N minutos por máquina, **mapa de calor** de tráfico (textura en el suelo que acumula densidad) y **etiqueta flotante** con ID, operario y batería al acercarse.
4. **Geocercas** (`src/lib/rtls/geofences.ts`):
   - velocidad máxima por zona (aviso si se supera),
   - tiempo máximo de un operario en congelado (por ejemplo, 45 min seguidos, como medida de PRL),
   - zona peatonal / zona de máquinas,
   - **proximidad entre una máquina y un peatón menor de 2 m** (alerta de seguridad),
   - máquina parada más de X minutos fuera de la zona de carga.
5. Ficha de máquina: telemetría (velocidad, batería, horas de uso, tarea actual, historial de alertas) y un botón **Seguir** que activa `camera.follow(id)`.
6. **Aceptación:** al hacer clic en una máquina se abre su ficha y la cámara la sigue. Las geocercas generan alertas visibles en el feed y en el mapa.

### F4 — Stock (rama `feat/f4-stock`)

1. `src/lib/stock/`: catálogo simulado de unos 1.800 artículos con familia, temperatura, rotación ABC y palets por pedido; asignación a ubicaciones (los artículos A cerca de Expedición).
2. Modos de color de los palets: **ocupación**, **familia**, **rotación ABC**, **caducidad / FEFO** y **ubicación vacía**.
3. Clic en un palet o hueco: ficha con código de ubicación, artículo, lote, caducidad, cantidad y fecha de entrada.
4. Buscador: escribir un artículo o ubicación hace que la cámara vuele hasta allí y lo resalte.
5. Alertas: picking por debajo del mínimo (genera una tarea de reposición en la simulación), caducidad próxima y saturación de zona.
6. **Aceptación:** buscar "S-07-12-3-B" enfoca el hueco exacto. Los modos de color cambian al instante sin perder fps.

### F5 — Asistente IA con RAG y estado en vivo (rama `feat/f5-asistente`)

**Antes de empezar: pregunta a Jean qué proveedor de LLM usa en RAG Atlas** (y si quiere el mismo modelo de embeddings). No leas `.env` de otros proyectos.

1. **Servidor:** Supabase.
   - Tabla `kb_chunks` con `pgvector` (`id, title, category, content, embedding`).
   - Edge Function `chat` (Deno) que: valida la entrada, recupera los top-k por similitud, llama al LLM con los fragmentos recuperados y **herramientas** (tool use), y devuelve la respuesta con sus fuentes.
   - La API key va en los secretos de Supabase.
   - Edge Function `ingest` para cargar y re-embeber la base de conocimiento.
2. **Base de conocimiento:** migrar `ragKnowledgeBase.ts` a markdown en `kb/*.md` (procedimientos, PRL, cadena de frío, muelles, maquinaria, tiendas, datos públicos de Pinto con fuente). Script de ingesta.
3. **Herramientas sobre el estado en vivo:** la parte diferencial. El cliente envía un snapshot compacto o la función lo pide.
   - `get_machine(id)`, `find_machines(filter)`
   - `get_dock_status()`, `get_trucks(filter)`
   - `get_stock(sku|location)`
   - `get_alerts(since)`, `get_kpis()`
4. **Acciones en la UI:** el asistente puede devolver `ui_actions` (`focus_entity`, `focus_location`, `highlight_zone`, `open_card`). Por ejemplo: "¿Dónde está la R-07?" → responde y la cámara vuela hasta ella.
5. Cliente: `src/lib/api.ts` (`postChat`), `src/hooks/use-assistant.ts` y `src/components/assistant/*` (panel de chat con fuentes plegables).
6. **Eliminar** la llamada directa a Gemini de `ragEngine.ts`. Conservar la búsqueda local como plan B si no hay conexión.
7. **Aceptación:** 10 preguntas de prueba (mitad documentales, mitad sobre el estado en vivo) responden bien y citan fuentes. Ninguna clave aparece en el bundle (`grep` sobre `dist/`).

---

## 4. Ampliaciones propuestas (F6+, priorizar con Jean)

Ordenadas por valor/esfuerzo:

1. **Repetición del día (DVR):** línea de tiempo para volver a cualquier momento (snapshots cada N segundos + log de eventos). "¿Qué pasó en el muelle 12 a las 7:40?"
2. **Panel de indicadores:** palets por hora, tiempo de muelle por camión, cumplimiento de la ventana de entrega (tiendas antes de las 08:30), ocupación por zona, uso de máquinas, km recorridos.
3. **Mapa exterior de rutas:** vista 2D o 3D de la zona centro con los camiones de salida avanzando hacia las tiendas de las 8 provincias y su hora estimada de llegada. Se pasa del almacén al mapa con zoom.
4. **Simulador de "¿qué pasa si…?":** averiar una retráctil, cerrar un pasillo, retrasar 3 camiones o meter un pico de pedidos (Navidad), y ver el impacto en los indicadores. Muy útil para el jefe de almacén.
5. **Cadena de frío y energía:** sensores de temperatura por cámara con gráfica, puertas de cámara abiertas demasiado tiempo, consumo de los cargadores frente a la producción de las placas solares (encaja con BREEAM y BMS).
6. **Asignación inteligente:** sugerir el muelle a cada camión entrante y la máquina a cada tarea, comparando una regla simple con la optimizada.
7. **Seguridad / PRL:** reproducir un incidente de proximidad, mapa de puntos negros a partir del mapa de calor e informe semanal generado por el asistente.
8. **Modo noche/día y clima:** iluminación según la hora simulada (los turnos de madrugada se ven de noche) y lluvia en el patio. Puro ambiente Sims.
9. **Informe automático de turno:** al cerrar el turno, el asistente redacta un resumen con incidencias, indicadores y pendientes.
10. **Multiusuario:** vista compartida en tiempo real con Supabase Realtime y roles (jefe de almacén, jefe de muelles, PRL).
11. **Integración real:** conectores para el WMS (ubicaciones y stock), el sistema RTLS (posiciones) y el TMS (camiones), sustituyendo las fuentes simuladas detrás de las mismas interfaces.

---

## 5. Guía visual de la UI

- Tema oscuro por defecto, con tokens en `:root`: fondo `#0b1220`, paneles `#111a2e` con transparencia y desenfoque, borde `#22304d`, texto `#e6ecf5`, texto secundario `#93a3bf`, acento azul `#22a6e0`, acento naranja `#f39200`, ok `#2ecc71`, aviso `#f5b301`, error `#ff5d5d`.
- Colores de zona coherentes en la UI y en el 3D: seco `#c9ced6`, frío `#7cc4f0`, congelado `#b9e3ff`, FyV `#8fd694`, expedición `#f5d06b`.
- Tipografía: Plus Jakarta Sans (UI) y JetBrains Mono (códigos, matrículas, horas); ya están enlazadas en `index.html`.
- Iconos: `lucide-react`.
- Paneles flotantes sobre el canvas a pantalla completa. Nada tapa más del 30 % del canvas en escritorio.

## 6. Preguntas abiertas para Jean

1. Proveedor del LLM y del modelo de embeddings (RAG Atlas) → bloquea F5.
2. ¿Proyecto de Supabase nuevo o reutilizar el de RAG Atlas con un esquema aparte?
3. ¿Despliegue? (Vercel para el front + Supabase para las funciones es lo natural).
4. Prioridad entre las ampliaciones de §4.
