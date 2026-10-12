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
3. IA: **Google Gemini**, con la misma API key que Jean usa en su proyecto "RAG Atlas". Las llamadas a Gemini se hacen **en el servidor de Next.js** (route handlers). La clave **nunca** va al navegador. No leas `.env` de otros proyectos: Jean pone la clave en `.env.local` y en las variables de Vercel.
4. "GPS" dentro de una nave = **localización de interior (RTLS por UWB/BLE)**. Se simula, con una interfaz preparada para conectar datos reales.
5. **Stack: Next.js (App Router) + React 19 + Tailwind CSS v4 + Supabase + three.js**, en TypeScript. Despliegue previsto en Vercel (front + API) y Supabase (Postgres + pgvector, Auth, Realtime y Storage). El proyecto actual en Vite **se migra a Next.js en F0** (ver §2.5).

---

## 1. Estado actual del repo (rama `feat/f0-f1-plano`)

Ruta: `C:\Users\jeanc\aldi-pinto-warehouse`. Git inicializado; commit de seguridad `3bab4b8` en `master` con el estado importado.

- Stack instalado: Vite 8, React 19, three 0.186, TypeScript 6, lucide-react. Scripts: `dev` (puerto 3000), `build` (`tsc && vite build`). **Vite se sustituye por Next.js en F0**; three, React, lucide-react y TypeScript se conservan.
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

Estructura Next.js (App Router, carpeta `src/`):

| Capa | Ubicación | Contiene | Prohibido |
|---|---|---|---|
| Tipos | `src/lib/types.ts` (+ `src/lib/layout/types.ts`, `src/lib/sim/types.ts`, `src/lib/supabase/database.types.ts` generado) | interfaces compartidas entre cliente y servidor | lógica |
| Lógica pura | `src/lib/**` (`layout/`, `sim/`, `rtls/`, `stock/`, `kpi/`, `replay/`, `scenarios/`) | plano, simulación, rutas, stock, formato | React, three, fetch |
| Cliente API | `src/lib/api.ts` | un `fetch` por endpoint con un helper `request<T>` que lanza `Error(data.error)` | estado React, toasts |
| Supabase | `src/lib/supabase/client.ts` (navegador), `src/lib/supabase/server.ts` (servidor, `@supabase/ssr`), `src/lib/supabase/admin.ts` (service role, **solo servidor**) | creación de clientes | lógica de negocio |
| Servidor (dominio) | `src/lib/server/<dominio>.ts` (`gemini.ts`, `rag.ts`, `reports.ts`…), marcados con `import 'server-only'` | SDKs, Gemini, consultas a la BD | importarse desde el cliente |
| Rutas API | `src/app/api/*/route.ts` | validan la entrada (zod) y delegan en `src/lib/server/*` | lógica duplicada entre rutas |
| Render 3D | `src/three/**` | escena, builders, modelos, cámara, picking | React, reglas de negocio |
| Hooks | `src/hooks/use-*.ts` | estado y efectos; devuelven `{ datos, flags, acciones }` | JSX |
| UI | `src/components/<feature>/*.tsx` | presentación con Tailwind: recibe props y devuelve callbacks | fetch, reglas de negocio |
| Contenedor | `src/components/<feature>.tsx` | compone hooks y piezas de UI | markup largo |
| Páginas | `src/app/**/page.tsx`, `layout.tsx` | composición de contenedores; Server Components por defecto | lógica, three |
| Base de datos | `supabase/migrations/*.sql`, `supabase/seed.sql` | esquema, RLS, funciones SQL | cambios hechos a mano en el panel sin migración |

- Componentes de más de ~150 líneas o con más de una responsabilidad: dividir. Archivos en **kebab-case**.
- La simulación (`src/lib/sim`) **no conoce three.js**. La escena lee el estado de la simulación cada frame (un snapshot) y actualiza matrices. Así el mismo estado alimenta la UI, la capa de localización y el RAG.
- Carga inicial en `useEffect` con `.then()` y una bandera de cancelación.
- Todo lo que toca three.js, `window` o Web Workers lleva `'use client'` y se carga con `next/dynamic(..., { ssr: false })`. Las páginas siguen siendo Server Components.

### 2.2 Unidades y coordenadas

- **1 unidad = 1 metro.** Y hacia arriba. Origen en el **centro de la nave**.
- +X = este, −X = oeste, **+Z = sur (fachada de muelles)**, −Z = norte.
- Rotación de las entidades: `heading` en radianes sobre Y; 0 = mirando a +Z.

### 2.3 Calidad

- Al cerrar cada fase: `npx tsc --noEmit` y `npm run lint` limpios, `npm run build` (Next.js) OK y la app arranca con `npm run dev` sin errores en consola ni avisos de hidratación.
- Toda migración de Supabase se aplica en local (`supabase db reset`) antes de hacer commit y se regeneran los tipos (`supabase gen types typescript`).
- Rendimiento objetivo: **≥ 50 fps** en la vista general en un portátil medio. Todo lo repetido (estanterías, palets, plazas de aparcamiento, marcas) va en `InstancedMesh`. Nada de un `Mesh` por palet.
- Git: rama por fase (`feat/fN-<nombre>`), commits pequeños y en español. Terminar con `Co-Authored-By` según la configuración del entorno. Nunca a `master` directo; PR o merge solo cuando Jean lo pida.

---

## 2.4 Turnos de ejecución

El plan se ejecuta en **dos turnos**. Al acabar cada turno: PR de cada rama de fase (o merge, si Jean lo pide), resumen para Jean y actualización de la casilla de estado.

| Turno | Fases | Resultado |
|---|---|---|
| **Turno 1 — Núcleo** | F0 base · F1 plano · F2 simulación · F3 localización · F4 stock · F5 asistente Gemini | Gemelo digital completo y funcional |
| **Turno 2 — Ampliaciones** | F6 indicadores · F7 repetición del día · F8 día/noche y clima · F9 cadena de frío y energía · F10 seguridad PRL · F11 mapa exterior de rutas · F12 asignación inteligente · F13 simulador "¿qué pasa si…?" · F14 informe de turno · F15 multiusuario · F16 integración real | Herramienta de gestión y decisión |

El orden dentro de cada turno respeta las dependencias: F6 alimenta a F9–F14 y F5 alimenta a F14. **No empieces el Turno 2 sin que el Turno 1 cumpla todos sus criterios de aceptación.**

Estado:
- [x] F0 · [x] F1 · [x] F2 · [x] F3 · [x] F4 · [x] F5 — **Turno 1 OK**
- [ ] F6 · [ ] F7 · [ ] F8 · [ ] F9 · [ ] F10 · [ ] F11 · [ ] F12 · [ ] F13 · [ ] F14 · [ ] F15 · [ ] F16

### Requisitos de arquitectura del Turno 1 que el Turno 2 necesita

Prepáralos ya en el Turno 1, aunque todavía no se usen:
- **Bus de eventos** en la simulación (`src/lib/sim/events.ts`): cada cambio relevante (camión llega, palet ubicado, alerta…) emite un evento tipado con `ts` de simulación. Lo consumen F6, F7, F10 y F14.
- **Estado serializable:** `SimState` debe poder hacerse `structuredClone` y JSON (sin clases con métodos ni referencias a three). Lo necesitan F7 y F15.
- **Reglas de despacho intercambiables:** la asignación de muelle y tarea va detrás de una interfaz `DispatchPolicy`. F12 añade la versión optimizada.
- **Fuentes de datos detrás de interfaces** (`PositionSource`, `StockSource`, `TruckSource`). F16 las sustituye por conectores reales.
- **Sensores simulados de temperatura** por cámara, aunque no se dibujen hasta F9.

---

## 2.5 Stack e implementación (Next.js + React + Tailwind + Supabase)

### Next.js
- Última versión estable de Next.js con **App Router**, React 19 y TypeScript estricto. Si la versión instalada cambia alguna convención (por ejemplo, `middleware.ts` → `proxy.ts`), sigue la documentación de esa versión.
- Fuentes con `next/font/google`: Plus Jakarta Sans (UI) y JetBrains Mono (códigos). Se quitan los `<link>` de `index.html`.
- Rutas previstas:

| Ruta | Contenido | Fase |
|---|---|---|
| `/` | Gemelo digital 3D (visor + paneles) | F1 |
| `/red` | Mapa exterior de rutas a tiendas | F11 |
| `/escenarios` | Biblioteca y resultados de "¿qué pasa si…?" | F13 |
| `/informes` | Informes de turno y PRL | F10, F14 |
| `/login` | Acceso con Supabase Auth | F15 |
| `/api/chat` | Asistente Gemini + RAG + herramientas | F5 |
| `/api/ingest` | Ingesta de la base de conocimiento (protegida) | F5 |
| `/api/shift-report` | Informe de turno con Gemini | F14 |
| `/api/weather` | Proxy y caché del clima de Pinto | F8 |

- Las rutas API se ejecutan en el runtime de Node.js (no Edge) salvo que haya un motivo claro. Las respuestas del chat se pueden enviar en streaming.
- Web Workers (F12, F13): `new Worker(new URL('../workers/sim-worker.ts', import.meta.url))` dentro de un componente cliente.
- `next.config.ts`: `transpilePackages` si alguna dependencia de three lo necesita. Las imágenes y texturas van en `public/`.

### Tailwind CSS v4
- Instalación v4 con PostCSS (`@tailwindcss/postcss`). En `src/app/globals.css`: `@import "tailwindcss";` y un bloque `@theme` con los tokens de §5 (colores, fuentes, radios, sombras), para escribir clases como `bg-panel`, `text-muted` o `border-line`.
- Modo oscuro por defecto y paneles con `backdrop-blur` sobre el canvas.
- Componentes base propios en `src/components/ui/` (botón, panel, chip, pestañas, deslizador, hoja inferior). Para piezas complejas como diálogos o menús, se puede usar **shadcn/ui** (encaja con Tailwind v4); no hace falta añadir más librerías de UI.
- Utilidad `cn()` (clsx + tailwind-merge) en `src/lib/cn.ts`.

### Supabase
- Proyecto: el que decida Jean (§6). Si se comparte con RAG Atlas, **todo** va en el esquema `aldi_pinto` y se expone en la API de Supabase.
- CLI de Supabase en el repo: `supabase init`, desarrollo local con `supabase start` (Docker) y migraciones versionadas en `supabase/migrations`.
- Paquetes: `@supabase/supabase-js` y `@supabase/ssr` (sesión por cookies en Server Components y route handlers).
- Variables de entorno (`.env.local`, con un `.env.example` sin valores en el repo):

| Variable | Dónde se usa | Pública |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente y servidor | sí |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (o la clave publicable) | cliente y servidor | sí |
| `SUPABASE_SERVICE_ROLE_KEY` | solo `src/lib/supabase/admin.ts` | **no** |
| `GEMINI_API_KEY` | solo `src/lib/server/gemini.ts` | **no** |
| `GEMINI_CHAT_MODEL`, `GEMINI_EMBED_MODEL`, `EMBED_DIM` | servidor | no |
| `INGEST_SECRET` | protege `/api/ingest` | no |

- **RLS activada en todas las tablas** desde su creación. La lectura anónima solo se permite donde tenga sentido (por ejemplo, la base de conocimiento pública vía RPC).
- Tablas por fase (cada una en su propia migración):

| Tabla / recurso | Fase | Uso |
|---|---|---|
| extensión `vector`, `kb_chunks`, función `match_kb_chunks` | F5 | RAG |
| `chat_usage` | F5 | límite de uso por sesión o IP |
| bucket `replays` + tabla `replays` | F7 | jornadas guardadas |
| `incidents` | F10 | PRL |
| `scenarios`, `scenario_runs` | F13 | escenarios y resultados |
| `shift_reports` | F14 | informes |
| `profiles` (rol), `comments` | F15 | multiusuario |
| canal Realtime `sim:<sala>` | F15 | difusión del estado |
| `integrations`, `rtls_calibration` | F16 | conectores |

- La simulación **no** escribe cada tick en la base de datos: vive en el cliente (y en F15 se difunde por Realtime). Solo se guardan resultados, eventos agregados, informes y configuración.

### Migración de Vite a Next.js (se hace en F0)
1. `npm i next@latest react@latest react-dom@latest` y `npm i -D tailwindcss @tailwindcss/postcss postcss eslint eslint-config-next`. Desinstalar `vite` y `@vitejs/plugin-react`.
2. Borrar `vite.config.ts` e `index.html`. Crear `next.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx` y `src/app/globals.css`.
3. Ajustar `tsconfig.json` al de Next.js (plugin `next`, `jsx: preserve`, alias `@/*` → `src/*`, `include` con `next-env.d.ts` y `.next/types`). Mantener `strict`.
4. Scripts: `dev` (`next dev -p 3000`), `build` (`next build`), `start`, `lint`.
5. `.gitignore`: añadir `.next/`, `.env*.local`, `supabase/.temp`.

---

## 3. Fases — Turno 1

### F0 — Base funcional (rama `feat/f0-f1-plano`, ya creada)

1. Borrar `src/main.ts`, `src/counter.ts`, `src/style.css`, `src/assets/`, `public/icons.svg`.
2. **Migrar a Next.js + Tailwind v4** siguiendo los pasos de §2.5. `src/app/page.tsx` monta el contenedor `src/components/warehouse-app.tsx` (cliente).
3. **Base de Supabase:** `supabase init`, `.env.example`, los clientes de `src/lib/supabase/{client,server,admin}.ts` y una migración inicial vacía con el esquema `aldi_pinto` (y `alter default privileges` para que la API lo exponga). Sin tablas todavía.
4. Mover tipos a `src/lib/types.ts`:
   - `Province = 'Madrid'|'Toledo'|'Segovia'|'Ávila'|'Guadalajara'|'Ciudad Real'|'Cáceres'|'Salamanca'`.
   - `ZoneId = 'seco'|'frio'|'congelado'|'fyv'|'expedicion'|'carga_baterias'`.
5. Mover `warehouseData.ts` a `src/lib/data/stores.ts`. Conservar las tiendas existentes y añadir tiendas simuladas para Guadalajara (~8), Ciudad Real (~8), Cáceres (~6) y Salamanca (~8) con pueblos reales y nombres genéricos (`ALDI <Pueblo>`). Quitar los datos de muelles y agentes antiguos (se generan en F1/F2).
6. Arreglar los imports `import type` y usar el alias `@/`.
7. Ficha `README.md`: requisitos, `npm i`, `.env.local`, `supabase start`, `npm run dev`, y el aviso de datos simulados.
8. **Aceptación:** `npm run dev` muestra una pantalla oscura (Tailwind) con la barra superior y un canvas vacío. `tsc`, `lint` y `next build` limpios. `supabase start` y `supabase db reset` funcionan en local.

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

- `src/components/viewport.tsx` (`'use client'`, cargado con `next/dynamic` y `ssr: false`): monta y desmonta `WarehouseScene` (`src/three/warehouse-scene.ts`). El renderer, el bucle, el resize y el raycast viven en la clase. React solo recibe callbacks: `onHoverZone`, `onSelect`.
- Barra superior: marca, "Plataforma Logística Pinto", indicadores (nave de 40.000 m², nº de ubicaciones, 60 muelles) y un reloj.
- Panel lateral: **Zonas** (al pulsar, la cámara enfoca) y **Capas** (estanterías, palets, rótulos, máquinas, camiones, exterior, sombras).
- Botonera de cámara abajo a la derecha: rotar ⟲/⟳, zoom 1/2/3, muros y reiniciar.
- Ficha de zona al hacer clic: superficie, temperatura objetivo, ubicaciones, ocupación y pasillos.
- Toda la UI con clases de Tailwind y los tokens de `@theme`; nada de CSS suelto salvo `globals.css`.
- **Responsive:** por debajo de 768 px (`md:`) el panel lateral pasa a ser una hoja inferior deslizable y la botonera se compacta.
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

**Proveedor: Google Gemini.** Antes de empezar, confirma con Jean los nombres exactos de los modelos de chat y embeddings que usa en RAG Atlas. Si no los sabe, consulta la documentación actual de Gemini y elige el modelo "flash" vigente para el chat y el modelo de embeddings vigente. No leas `.env` de otros proyectos.

1. **Servidor:** route handlers de Next.js + Supabase (Postgres con pgvector).
   - Migración: extensión `vector` y tabla `aldi_pinto.kb_chunks` con `pgvector` (`id, title, category, content, source_url, embedding vector(N)`). `N` es la dimensión del modelo de embeddings: debe coincidir con `EMBED_DIM`. Índice HNSW y una función SQL `match_kb_chunks(query_embedding, match_count, min_similarity)`.
   - Variables de entorno de servidor (`.env.local` y Vercel): `GEMINI_API_KEY`, `GEMINI_CHAT_MODEL`, `GEMINI_EMBED_MODEL`, `EMBED_DIM`. Ningún nombre de modelo va escrito en el código.
   - `src/lib/server/gemini.ts` (cliente de Gemini: embeddings, generación y bucle de herramientas) y `src/lib/server/rag.ts` (recuperación vía `supabase.rpc('match_kb_chunks')`).
   - `src/app/api/chat/route.ts` (valida con zod y delega):
     1. valida la entrada;
     2. crea el embedding de la pregunta (`taskType: RETRIEVAL_QUERY`);
     3. recupera los top-k con `match_kb_chunks`;
     4. llama a `generateContent` con un `systemInstruction`, los fragmentos recuperados y `tools: [{ functionDeclarations }]`;
     5. ejecuta el bucle de **function calling**: cuando la respuesta trae `functionCall`, resuelve la herramienta contra el snapshot que envió el cliente, devuelve un `functionResponse` y vuelve a llamar, con un máximo de 5 vueltas;
     6. responde `{ answer, sources, ui_actions }`.
   - La clave va en la cabecera `x-goog-api-key`, **nunca en la URL**. Llamadas con `fetch` directo a la API REST de Gemini o con el SDK oficial de Google para JS. Temperatura baja (0,2).
   - `src/app/api/ingest/route.ts`, protegida con `INGEST_SECRET` (o el script `scripts/ingest.ts` que llama a la misma lógica): trocea `kb/*.md` (~500–800 tokens con solapamiento), crea embeddings en lote (`taskType: RETRIEVAL_DOCUMENT`) y hace upsert por hash del contenido.
   - Límite de uso: contador por IP o sesión en `aldi_pinto.chat_usage`, escrito con el cliente admin, para no quemar la cuota de la key compartida con RAG Atlas.
   - Todo en el esquema `aldi_pinto` (ver §2.5).
2. **Base de conocimiento:** migrar `ragKnowledgeBase.ts` a markdown en `kb/*.md` (procedimientos, PRL, cadena de frío, muelles, maquinaria, tiendas, datos públicos de Pinto con fuente). Script de ingesta.
3. **Herramientas sobre el estado en vivo:** la parte diferencial. El cliente envía un snapshot compacto o la función lo pide.
   - `get_machine(id)`, `find_machines(filter)`
   - `get_dock_status()`, `get_trucks(filter)`
   - `get_stock(sku|location)`
   - `get_alerts(since)`, `get_kpis()`
4. **Acciones en la UI:** el asistente puede devolver `ui_actions` (`focus_entity`, `focus_location`, `highlight_zone`, `open_card`). Por ejemplo: "¿Dónde está la R-07?" → responde y la cámara vuela hasta ella.
5. Cliente: `src/lib/api.ts` (`postChat`), `src/hooks/use-assistant.ts` y `src/components/assistant/*` (panel de chat con fuentes plegables).
6. **Eliminar** la llamada directa a Gemini desde el navegador en `ragEngine.ts` (ahora pasa por `/api/chat`). Conservar la búsqueda local por palabras clave como plan B si no hay conexión.
7. **Aceptación:** 10 preguntas de prueba (mitad documentales, mitad sobre el estado en vivo) responden bien y citan fuentes. Ninguna clave aparece en el bundle del cliente (`grep` de `GEMINI` y de la service role sobre `.next/static`).

---

## 4. Fases — Turno 2 (ampliaciones)

Cada fase va en su rama `feat/fN-<nombre>`, con la misma disciplina que el Turno 1:
- lógica pura en `src/lib/**`, hooks y componentes con Tailwind;
- servidor en `src/app/api/*` + `src/lib/server/*`;
- tablas nuevas con su migración de Supabase y RLS;
- `tsc`, `lint` y `next build` limpios, y fps ≥ 50.

### F6 — Panel de indicadores (rama `feat/f6-indicadores`)

1. `src/lib/kpi/`: funciones puras que calculan indicadores a partir del bus de eventos y del `SimState`, con ventanas de 15 min, 1 h, turno y día:
   - palets por hora (entrada, ubicación, picking, expedición),
   - **tiempo de camión en la plataforma** (garita → salida) y **tiempo en muelle**, con media y percentil 90,
   - cumplimiento de la ventana de entrega (% de tiendas servidas antes de las 08:30),
   - ocupación por zona y por nivel, y uso de máquinas (% del tiempo trabajando, desplazándose, esperando o cargando),
   - km recorridos por máquina y por tipo,
   - palets preparados por operario y hora (productividad).
2. Cálculo incremental (sin recorrer todo el histórico en cada frame) y una serie temporal por indicador guardada en un buffer circular.
3. UI: panel plegable con fichas de indicadores (valor, tendencia y minigráfica) y una vista ampliada con gráficas por turno. Antes de dibujar, sigue la skill `dataviz`. Usa una librería ligera (por ejemplo uPlot) o SVG propio; nada pesado.
4. Umbrales configurables: cada indicador tiene objetivo, aviso y crítico, y su color cambia según el umbral.
5. **Aceptación:** los indicadores cuadran con un recuento manual de eventos en una simulación con semilla fija (test unitario). La vista ampliada no baja los fps del 3D por debajo de 50.

### F7 — Repetición del día (rama `feat/f7-repeticion`)

1. `src/lib/replay/`: snapshots del `SimState` cada 30 s simulados + **log de eventos** completo. Reconstruir el estado de cualquier instante t = snapshot anterior + reaplicar los eventos hasta t, o re-simular con la misma semilla.
2. Persistencia: en IndexedDB en local. Para compartir una jornada, se guarda comprimida en el bucket `replays` de Supabase Storage, con sus metadatos en la tabla `aldi_pinto.replays` (RLS: la ve quien la creó y los roles con permiso en F15).
3. UI: línea de tiempo bajo el canvas, con marcas de eventos (alertas en rojo, llegadas de camión en azul…), y controles para reproducir, pausar, ir a una hora y cambiar la velocidad. Mientras se reproduce se muestra un aviso visible de **"Modo repetición"** y la simulación en vivo sigue corriendo en segundo plano.
4. Clic en una alerta del feed → salta a ese momento con la cámara en la posición del suceso.
5. Integración con F5: herramienta `get_state_at(time)` para que el asistente responda "¿qué pasó en el muelle 12 a las 7:40?".
6. **Aceptación:** saltar a cualquier hora del día tarda menos de 1 s y reproduce exactamente las mismas posiciones que en vivo (test de determinismo).

### F8 — Día/noche y clima (rama `feat/f8-ambiente`)

1. `src/three/environment.ts`: la posición del sol y el color de la luz dependen de la hora simulada. Usa una tabla para Pinto (latitud ~40,2º N) por mes: amanecer, atardecer y elevación máxima.
2. De noche: luces de la nave (LED) y farolas del patio encendidas, faros de camión y balizas naranjas en las máquinas. La iluminación interior es uniforme, porque es una nave.
3. Clima simulado o real:
   - simulado: perfil diario aleatorio con semilla;
   - real, opcional: temperatura y precipitación de Pinto de una API abierta sin clave (por ejemplo Open-Meteo). El cliente llama a `/api/weather` (route handler con caché de 15 min, `revalidate`) desde `src/lib/api.ts`.
   - Lluvia (partículas instanced en el exterior), suelo mojado (más brillo en el asfalto) y niebla en invierno.
4. El clima afecta a la simulación: con lluvia, los camiones van más lentos en el patio, y con calor exterior aumenta la carga térmica de las cámaras (se conecta con F9).
5. Ajuste de calidad: el ambiente se puede desactivar.
6. **Aceptación:** con ×300 se ve un ciclo de día completo sin saltos de luz bruscos. Con lluvia no se pierden más de 5 fps.

### F9 — Cadena de frío y energía (rama `feat/f9-frio-energia`)

1. **Sensores de temperatura** (de los preparados en el Turno 1): 4–8 por cámara, con un modelo térmico sencillo. La temperatura tiende al punto de consigna y sube con:
   - las puertas de cámara abiertas (cada paso de máquina abre la puerta rápida unos segundos),
   - el calor exterior (F8),
   - una avería del compresor (F13).
2. **Puertas rápidas** entre zonas como entidades con estado abierta/cerrada. Alerta si una puerta pasa más de 60 s abierta.
3. Termógrafo de cada camión frigorífico: temperatura del remolque al llegar. Si está fuera de rango, se marca la recepción como **rechazable** y se genera un evento.
4. **Energía:**
   - consumo de cargadores (según las máquinas cargando), frío industrial (según la carga térmica) e iluminación;
   - producción fotovoltaica de la cubierta según la hora y el clima de F8 (potencia pico configurable, por ejemplo 2 MWp; marcar como supuesto);
   - balance: autoconsumo frente a red.
5. UI: la capa de temperatura colorea el suelo de cada cámara (mapa térmico interpolado entre sensores); gráficas de temperatura por cámara y de energía; insignias BREEAM y BMS en la ficha de la nave.
6. RAG (F5): herramientas `get_temperatures(zone)` y `get_energy()`, y la base de conocimiento ampliada con el protocolo de cadena de frío.
7. **Aceptación:** dejar una puerta de congelado abierta en el simulador sube la temperatura de forma visible, genera una alerta y se recupera al cerrarla.

### F10 — Seguridad / PRL (rama `feat/f10-prl`)

1. Construido sobre las geocercas de F3. Los incidentes de proximidad entre máquina y peatón, los excesos de velocidad y los tiempos de exposición en congelado se registran como **incidentes** con una gravedad. Se guardan agregados en `aldi_pinto.incidents` (sin datos personales reales) y se listan en la página `/informes`.
2. **Mapa de puntos negros:** agregación espacial de incidentes y casi-accidentes en celdas de 2 m, pintada en el suelo. Se puede filtrar por tipo, turno y rango de fechas.
3. **Repetición de incidente:** desde la ficha de un incidente, abre F7 en ese instante, con la cámara encuadrada y los dos implicados resaltados.
4. Sugerencias automáticas por reglas: cruces con mucho tráfico → propone un espejo o un paso peatonal; pasillo con excesos de velocidad repetidos → propone limitar la velocidad.
5. Informe semanal de PRL generado por el asistente (Gemini) a partir de los incidentes agregados (ver F14 para el mecanismo). Se exporta a PDF con la impresión del navegador y una hoja de estilos `@media print`.
6. **Aceptación:** un incidente provocado en el simulador aparece en el mapa de puntos negros, en la lista y en el informe.

### F11 — Mapa exterior de rutas (rama `feat/f11-rutas`)

1. Página `/red` (y acceso desde el visor): el zoom sale de la parcela y pasa a un mapa de la zona centro con las 8 provincias. Transición animada entre vistas.
2. Mapa: MapLibre GL con teselas vectoriales libres (OpenFreeMap u otra fuente sin clave; revisa los términos de uso) o, como alternativa, un mapa 2D estilizado con las provincias en GeoJSON y las autovías principales (A-4, A-42, A-6, AP-6, A-2, A-5, A-3).
3. Coordenadas de las tiendas: geolocalizar los municipios de `stores.ts` con su centroide aproximado (tabla estática en `src/lib/data/towns.ts`). Indicar que las ubicaciones son aproximadas.
4. Rutas: polilíneas por carretera mediante una tabla precalculada por destino (OSRM público solo en desarrollo, y guardando el resultado), o líneas rectas con un factor de rodeo si no hay rutas.
5. Camiones de salida de F2: tras salir de la garita, siguen avanzando por su ruta con la hora estimada de llegada y el estado (en ruta, descargando en tienda, vuelta). Cumplimiento de la ventana de las 08:30 por tienda.
6. Clic en una tienda: pedido del día, palets, muelle de salida, camión asignado y hora estimada de llegada.
7. **Aceptación:** con la simulación a ×60 se ven los camiones salir de Pinto y llegar a sus tiendas en tiempos verosímiles (Segovia ~1 h 30, Cáceres ~3 h 30).

### F12 — Asignación inteligente (rama `feat/f12-asignacion`)

1. Implementaciones de `DispatchPolicy`:
   - **Regla simple** (la de F2): primer muelle libre y máquina más cercana libre.
   - **Optimizada:**
     - muelles asignados según temperatura, cercanía a la calle de pre-carga y hora de salida;
     - tareas asignadas con una heurística de coste (distancia + batería + prioridad + especialidad de la máquina), por ejemplo una subasta o un algoritmo húngaro por lotes cada 30 s;
     - **dobles ciclos**: la retráctil ubica un palet y, en el mismo viaje, baja otro para reponer.
   - Ubicación dinámica: los artículos de alta rotación se reubican cerca de Expedición de noche (slotting).
2. Se cambia de política en caliente desde la UI.
3. Comparativa A/B: ejecuta las dos políticas con la misma semilla en paralelo (Web Worker, sin dibujar la segunda) y muestra la diferencia de indicadores de F6: km recorridos, tiempo en muelle, palets por hora.
4. La simulación de la segunda política se ejecuta en un **Web Worker** (`src/workers/sim-worker.ts`), posible porque `SimState` es serializable.
5. **Aceptación:** la política optimizada mejora al menos 2 indicadores frente a la simple con la misma semilla, y la comparativa se muestra en una tabla.

### F13 — Simulador "¿qué pasa si…?" (rama `feat/f13-escenarios`)

1. `src/lib/scenarios/`: escenarios declarativos en JSON (`{ id, nombre, eventos: [{ at, tipo, params }] }`) que se inyectan en la simulación. Tipos:
   - averiar una máquina (durante X min),
   - cerrar un pasillo o un muelle,
   - retrasar N camiones,
   - pico de pedidos (+X % en una provincia o en todas, por ejemplo Navidad),
   - ausencias de operarios en un turno,
   - avería del compresor de una cámara (se conecta con F9),
   - corte de luz (cargadores parados) y nevada en Guadarrama (rutas a Segovia más lentas, se conecta con F11).
2. Biblioteca de escenarios predefinidos, más un editor sencillo en la UI (formulario por tipo de evento) con guardado en `aldi_pinto.scenarios` (y los resultados en `scenario_runs`), en la página `/escenarios`. Formularios con validación zod compartida entre cliente y servidor.
3. Ejecución en un **Web Worker** a máxima velocidad, sin dibujar: simula el resto del día en segundos y compara con la línea base (sin el escenario) en los indicadores de F6.
4. Resultado: informe "impacto del escenario", con gráficas comparadas, tiendas que no llegan a las 08:30, horas extra necesarias y cuellos de botella detectados (el muelle o pasillo con más espera).
5. RAG (F5): herramienta `run_scenario(spec)`, para que el jefe pueda preguntar "¿qué pasa si mañana fallan 2 retráctiles en el turno de mañana?" y el asistente lance el escenario y explique el resultado.
6. **Aceptación:** el escenario "Navidad +30 %" se ejecuta en menos de 10 s, muestra el impacto y el asistente lo puede lanzar y explicar.

### F14 — Informe automático de turno (rama `feat/f14-informe-turno`)

1. Al cerrar cada turno (evento de F2), se genera un resumen estructurado (JSON): indicadores de F6, incidencias y alertas, camiones fuera de horario, PRL de F10, frío y energía de F9, y tareas pendientes que pasan al siguiente turno.
2. `src/app/api/shift-report/route.ts` → `src/lib/server/reports.ts`: recibe el JSON y le pide a **Gemini** que redacte un informe ejecutivo en español (markdown) con este orden: resumen, indicadores, incidencias, acciones recomendadas y pendientes. No debe inventar cifras: solo puede usar las del JSON (indícalo en el `systemInstruction`).
3. Se guarda en `aldi_pinto.shift_reports`. UI en `/informes`: lista de informes, vista, exportar a PDF (impresión) y copiar al portapapeles.
4. Se puede pedir un informe en cualquier momento ("informe de lo que llevamos de turno").
5. **Aceptación:** cada cifra del informe se puede encontrar en el JSON de entrada (test que extrae los números del markdown y los busca).

### F15 — Multiusuario (rama `feat/f15-multiusuario`)

1. Supabase Auth (enlace mágico por email) con `@supabase/ssr`:
   - página `/login`;
   - refresco de sesión en el middleware (o `proxy.ts`, según la versión de Next.js);
   - protección de rutas en el servidor;
   - roles en `aldi_pinto.profiles`: `jefe_almacen`, `jefe_muelles`, `prl`, `lectura`, con un trigger que crea el perfil al registrarse.

   Hasta F15, la app funciona sin login (modo demo).
2. **Simulación autoritativa única:**
   - Opción A: un cliente "anfitrión" ejecuta la simulación y difunde snapshots y eventos por **Supabase Realtime** (canal broadcast); los demás interpolan.
   - Opción B: la simulación en un proceso de servidor.

   Empieza por la A y deja documentada la B.
3. Presencia: avatares de quién está conectado y qué está mirando (marcador de cámara de cada usuario en el mapa, como un cursor).
4. Permisos por rol: solo `jefe_almacen` lanza escenarios y cambia políticas; `prl` ve y gestiona incidentes; `lectura` solo mira. Políticas RLS en todas las tablas.
5. Comentarios anclados a una posición o entidad del 3D ("este cruce es peligroso"), guardados en Supabase.
6. **Aceptación:** dos navegadores ven el mismo estado con menos de 1 s de diferencia y los permisos se cumplen tanto en la UI como en la RLS.

### F16 — Integración con sistemas reales (rama `feat/f16-integracion`)

Objetivo: dejar el producto listo para conectarlo a datos reales **sin cambiar la UI ni la escena**.

1. Conectores detrás de las interfaces del Turno 1:
   - `WmsStockSource` (ubicaciones, stock, pedidos): adaptador REST genérico + importador CSV/Excel.
   - `RtlsPositionSource`: WebSocket o MQTT (por ejemplo, el formato de los motores UWB más comunes), con un mapeo `tagId → máquina`.
   - `TmsTruckSource`: llegadas y salidas de camiones; webhook para la garita y lectura de matrículas.
2. **Calibración del plano:** herramienta para alinear el sistema de coordenadas del RTLS con el del plano (3–4 puntos de control y una transformación afín), guardada por instalación.
3. **Editor de plano:** importar un DXF o SVG del plano real para sustituir el plano generado, o un editor sencillo de zonas, pasillos y muelles que exporte el mismo `WarehouseLayout`.
4. Modo mixto: datos reales donde los haya y simulados en el resto, con una insignia "REAL" o "SIM" en cada entidad.
5. Documentación `docs/integracion.md`: contratos de datos (JSON Schema), ejemplos y una checklist de puesta en marcha.
6. **Aceptación:** un CSV de stock de ejemplo y un flujo RTLS grabado (fichero de reproducción) mueven el gemelo sin tocar código de UI ni de escena.

---

## 5. Guía visual de la UI

- Los tokens se definen en el bloque `@theme` de Tailwind v4 (`src/app/globals.css`) y se usan como clases (`bg-panel`, `text-muted`…). Tema oscuro por defecto: fondo `#0b1220`, paneles `#111a2e` con transparencia y desenfoque, borde `#22304d`, texto `#e6ecf5`, texto secundario `#93a3bf`, acento azul `#22a6e0`, acento naranja `#f39200`, ok `#2ecc71`, aviso `#f5b301`, error `#ff5d5d`.
- Colores de zona coherentes en la UI y en el 3D: seco `#c9ced6`, frío `#7cc4f0`, congelado `#b9e3ff`, FyV `#8fd694`, expedición `#f5d06b`.
- Tipografía: Plus Jakarta Sans (UI) y JetBrains Mono (códigos, matrículas, horas); ya están enlazadas en `index.html`.
- Iconos: `lucide-react`.
- Paneles flotantes sobre el canvas a pantalla completa. Nada tapa más del 30 % del canvas en escritorio.

## 6. Preguntas abiertas para Jean

1. Nombres exactos de los modelos de Gemini (chat y embeddings) que usa en RAG Atlas → se necesita en F5.
2. ¿Proyecto de Supabase nuevo o el de RAG Atlas con el esquema `aldi_pinto`?
3. Confirmar el despliegue en Vercel (Next.js) + Supabase, y quién crea los proyectos y las variables de entorno.
4. ¿Turnos de trabajo reales del almacén? F2 asume mañana, tarde y noche: ajustar si son dos.
