import type { RagDocumentChunk } from '@/lib/types';

export const RAG_KNOWLEDGE_BASE: RagDocumentChunk[] = [
  {
    id: 'DOC-001',
    title: 'Ficha Técnica Plataforma Logística ALDI Pinto',
    category: 'almacen',
    keywords: ['pinto', 'superficie', 'capacidad', 'muelles', 'ubicacion', 'turnos', 'dimensiones', 'plataforma'],
    content: `La Plataforma Logística Central de ALDI en Pinto (Madrid) cuenta con una superficie construida de 50.895 m² (261 × 195 m, altura libre de 13 m) sobre una parcela de unos 157.000 m².
Dispone de 17.640 ubicaciones de palet estándar europeo (1200x800 mm) en estanterías de 3 niveles de palé (1,8 m por nivel, 5,4 m de estantería).
Estructura de muelles: Dispone de 64 muelles (D01–D64) con abrigos isotérmicos y plataformas hidráulicas.
- Muelles D05–D18: Inbound de seco (Recepción de proveedores nacionales e internacionales).
- Muelles D01–D04 y D19–D40 (fachada sur): Outbound de seco (Expedición de rutas diarias a tiendas).
- Muelles D41–D50 (frío) y D51–D64 (congelado), en la fachada este: mixtos, de entrada y salida.
Turnos operativos: Funciona en régimen 24/7 dividido en 3 turnos:
1. Turno de Noche (22:00 - 06:00): Picking intensivo de frescos, carga de camiones de primera ruta.
2. Turno de Mañana (06:00 - 14:00): Recepción de proveedores (Inbound), reposición de estanterías y preparación de seco.
3. Turno de Tarde (14:00 - 22:00): Preparación de pedidos de tarde y consolidación de expediciones.`,
  },
  {
    id: 'DOC-002',
    title: 'Zonificación Térmica y Almacenamiento: Seco, Frío y Congelado',
    category: 'frio',
    keywords: ['zonas', 'seco', 'frio', 'congelado', 'temperatura', 'camara', 'grados', 'climatizacion'],
    content: `El almacén de Pinto está sectorizado en 3 áreas térmicas aisladas para garantizar la máxima calidad:
1. Zona Seco (25.575 m²): Temperatura ambiente controlada (16ºC a 22ºC). Alberga alimentación no perecedera, bebidas, droguería y bazar ALDI. Altura libre de 13 metros con estanterías convencionales de 3 niveles de palé (1,8 m por nivel).
2. Zona Frío / Refrigerado (6.660 m²): Rango operativo continuo de +2.0ºC a +4.0ºC. Destinada a lácteos, carnes envasadas, embutidos y zona especial de Frutas & Verduras a +6ºC con control de humedad relativa (85-90%).
3. Zona Congelado / Ultracongelado (2.312 m²): Rango operativo de -22.0ºC a -25.0ºC. Cuenta con esclusas térmicas de acceso y cortinas de aire rápido para evitar la condensación y la formación de hielo. Todo el personal dispone de EPI térmico nivel 3 (traje frigorífico hasta -30ºC).`,
  },
  {
    id: 'DOC-003',
    title: 'Red de Distribución y Tiendas Servidas (Madrid, Toledo, Segovia, Ávila)',
    category: 'tiendas',
    keywords: ['tiendas', 'red', 'madrid', 'toledo', 'segovia', 'avila', 'rutas', 'horarios', 'provincias', '100 tiendas'],
    content: `Desde la plataforma de Pinto se abastece a una red estratégica de 100 supermercados ALDI distribuidos en 4 provincias:
- Madrid (58 tiendas): Reparto diario en doble ventana. Rutas urbanas M-30/M-40 y grandes municipios (Pinto, Getafe, Leganés, Alcorcón, Móstoles, Alcobendas, Las Rozas).
- Toledo (18 tiendas): Cobertura del Corredor de La Sagra (Illescas, Seseña, Yuncos), Toledo capital (Santa Bárbara, Buenavista) y Talavera de la Reina.
- Segovia (12 tiendas): Ruta N-VI y AP-61. Abastece Segovia Capital (Vía Roma, Ctra. Madrid), El Espinar, Cuéllar y comarca.
- Ávila (12 tiendas): Ruta AP-51 y N-110. Abastece Ávila Capital (Ctra. Sonsoles, Las Hervencias), Arévalo, Arenas de San Pedro y Candeleda.
Horario límite de entrega: Las tiendas deben recibir los productos frescos antes de las 08:30 h antes de la apertura al público.`,
  },
  {
    id: 'DOC-004',
    title: 'Flota de Maquinaria y Equipos de Manutención',
    category: 'maquinaria',
    keywords: ['carretillas', 'retractiles', 'frontales', 'transpaletas', 'maquinas', 'bateria', 'flota', 'jungheinrich', 'ecd', 'ese', 'etv', 'etm'],
    content: `El centro dispone de una flota eléctrica Jungheinrich monitorizada por telemetría IoT de 41 unidades:
1. Carretillas Retráctiles Jungheinrich ETV/ETM 214-216 (14 unidades):
   - Mástil triplex de gran altura (hasta 11.5 metros).
   - Utilizadas exclusivamente en los pasillos de estanterías de Seco y Frío para ubicar y desubicar palets pesados.
   - Velocidad máxima autolimitada a 9 km/h en pasillo.
2. Apiladores eléctricos Jungheinrich ERE 225i (8 unidades):
   - Capacidad nominal de 2.000 kg.
   - Operan en la playa de muelles para carga y descarga rápida de semirremolques y movimiento en playa de consolidación.
3. Transpaletas eléctricas con plataforma/asiento lateral Jungheinrich ESE (6 unidades):
   - Recogen los pedidos ya preparados en la zona de preparación y los llevan a la calle de su muelle.
   - Baterías de litio con carga de oportunidad rápida en descansos.
Mantenimiento: Gestión inteligente de recarga con estación de baterías de 400 kW alimentada parcialmente por placas solares fotovoltaicas de la cubierta del almacén.`,
  },
  {
    id: 'DOC-005',
    title: 'Protocolo de Seguridad y Control de Cadena de Frío',
    category: 'seguridad',
    keywords: ['cadena de frio', 'protocolo', 'alarma', 'temperatura', 'emergencia', 'haccp', 'termografo', 'sensores'],
    content: `El aseguramiento de la cadena de frío es la prioridad crítica de la plataforma:
- Sensores IoT calibrados cada 30 minutos transmiten al sistema SCADA central.
- Umbrales de alerta:
  * Alerta Amarilla (Frío > 4.5ºC o Congelado > -19.5ºC): Notificación inmediata al supervisor de turno y verificación de puertas de muelle o cámaras.
  * Alerta Roja (Frío > 6.0ºC o Congelado > -18.0ºC durante más de 20 minutos): Activación automática del sistema redundante de enfriamiento de respaldo (compresor de amoníaco / CO2 auxiliar) y bloqueo de expedición hasta chequeo por calidad.
- Control en Recepción: Todos los camiones entrantes deben presentar registro de termógrafo continuo. Lácteos no deben superar los 4ºC y congelados no deben superar los -18ºC. En caso contrario, el lote se rechaza de forma inmediata.`,
  },
  {
    id: 'DOC-006',
    title: 'Sistema WMS y Preparación de Pedidos (Picking por Voz)',
    category: 'operaciones',
    keywords: ['picking', 'preparacion', 'pedidos', 'wms', 'voz', 'roll containers', 'productividad', 'cajas'],
    content: `La preparación de pedidos en ALDI Pinto opera con el software SGA/WMS integrado y tecnología 'Voice-Picking' (picking por voz):
- Los preparadores utilizan auriculares inalámbricos y micrófono, confirmando mediante dígitos de control de las etiquetas de ubicación.
- Reducción de errores de preparación a menos del 0.02% (2 errores por cada 10.000 líneas preparadas).
- Ratio de productividad objetivo: 160 - 185 cajas/hora en zona de Seco; 140 - 160 cajas/hora en Frío y Congelado debido a la protección térmica.
- Consolidación: Los pedidos se agrupan en roll-containers o europalets flejados y etiquetados con código de barras GS1-128 con destino exacto a tienda.`,
  },
  {
    id: 'DOC-007',
    title: 'Rutas Logísticas a Tiendas Lejanas (Ávila y Segovia)',
    category: 'tiendas',
    keywords: ['avila', 'segovia', 'rutas lejanas', 'tiempos', 'distancia', 'puertos', 'guadarrama', 'nieve'],
    content: `Particularidades de las expediciones a las provincias montañosas de Segovia y Ávila:
- Segovia: Distancia media 105 km. El transporte cruza el Túnel de Guadarrama (AP-6) o el Puerto de San Rafael en caso de desvío. Tiempo medio de tránsito: 1h 25m. Durante invierno se aplica protocolo de cadenas o reserva de combustible en camiones Scania Euro 6.
- Ávila: Distancia media 130 km. Tránsito por la autovía A-6 hasta Villacastín y conexión con AP-51. Tiempo medio: 1h 40m.
- Tiendas en el Valle del Tiétar (Arenas de San Pedro y Candeleda): Requieren ruta por la A-5 y CL-501 (170-190 km), saliendo a las 05:00 h para asegurar apertura a las 09:00 h.`,
  },
  {
    id: 'DOC-008',
    title: 'Prevención de Riesgos Laborales (PRL) y Seguridad en Tráfico Interno',
    category: 'seguridad',
    keywords: ['seguridad', 'prl', 'riesgos', 'peatones', 'chaleco', 'pasillos', 'espejos', 'velocidad'],
    content: `Normas estrictas de circulación interna en el almacén ALDI Pinto:
- Separación física de flujos: Pasillos peatonales demarcados en azul con barandillas de polímero deformable en cruces principales.
- Iluminación Blue-Spot y Red-Zone: Todas las carretillas retráctiles y ERE 225i proyectan un foco azul en el suelo a 5 metros de distancia y un haz rojo perimetral para advertir a peatones antes de doblar esquinas.
- Prioridad de paso: Peatones en pasos de cebra señalizados > Carretillas con carga > Carretillas vacías.
- Uso obligatorio de EPI: Calzado de seguridad S3, chaleco de alta visibilidad clase 2, y guantes anticorte. En cámara de congelado, ropa de abrigo certificada EN 342.`,
  },
  {
    id: 'DOC-009',
    title: 'Familias de Productos y Surtido Comercial ALDI (2.000 Referencias)',
    category: 'productos',
    keywords: ['surtido', 'productos', 'referencias', 'familias', 'catalogo', 'alimentacion', 'bebidas', 'panaderia', 'limpieza', 'higiene', 'bazar', 'deals', '2000'],
    content: `La oferta comercial de ALDI consta de un catálogo eficiente de aproximadamente 2.000 referencias habituales organizadas en 5 grandes familias fijas más las campañas semanales de Bazar:
1. Alimentación fresca y envasada: Frutas, verduras, carnes, pescados, lácteos y despensa/conservas.
2. Bebidas: Aguas minerales, refrescos, zumos, bodega y cervezas.
3. Panadería y bollería: Pan tradicional, rústico, integral, recién horneado y bollería.
4. Limpieza del hogar y droguería: Detergentes, suavizantes, friegasuelos, celulosas y lavavajillas.
5. Higiene y cuidado personal: Cosmética, geles, champús, cremas y cuidado dental.
6. Bazar (ALDI Deals): Campañas semanales rotativas de menaje, bricolaje, textil y tecnología con unidades limitadas.`,
  },
  {
    id: 'DOC-010',
    title: 'Marcas Propias de ALDI (MDD: 90% del Surtido y 65 Marcas Propias)',
    category: 'productos',
    keywords: ['marcas', 'marca propia', 'mdd', 'milsani', 'el mercado', 'el horno', 'la cocina', 'la tabla', 'gutbio', 'esselt', 'tandil', 'biocura', 'lacura', 'blanca'],
    content: `El 90% del surtido de ALDI está compuesto por marcas propias (marcas del distribuidor) a través de más de 65 submarcas exclusivas de alta calidad:
- El Mercado de ALDI: Frescos (fruta, verdura, carne y pescado limpio).
- El Horno de ALDI: Panadería y bollería fresca o envasada.
- La Cocina de ALDI: Platos preparados, refrigerados, pizzas, empanadas y tortillas.
- La Tabla de ALDI: Charcutería, embutidos curados, fiambres y quesos.
- GutBio: Gama transversal de productos ecológicos certificados (bio).
- Milsani: Gama de lácteos, leches, yogures, mantequilla y postres lácteos.
- Esselt y Tandil: Detergentes de ropa, suavizantes y limpieza del hogar.
- Biocura y Lacura: Cosmética natural, higiene diaria y cremas faciales.`,
  },
  {
    id: 'DOC-011',
    title: 'Plantilla de Trabajadores: Departamento de Preparación (Picking en Frío, Seco y Congelado)',
    category: 'operaciones',
    keywords: [
      'trabajador', 'trabajadores', 'operario', 'operarios', 'departamento', 'preparacion', 'preparador',
      'picking', 'frio', 'congelado', 'seco', 'tarea', 'tarea de hoy', 'recogepedidos', 'ecd', 'p-01', 'p-02', 'p-03'
    ],
    content: `El Departamento de Preparación de ALDI Pinto cuenta con 12 preparadores de pedidos asignados al nivel 0 de estanterías con máquinas Jungheinrich ECD 320 (id P-01 a P-12) y tecnología Voice-Picking:
1. Zona Frío (+2ºC a +4ºC):
   - Elena Carrasco (P-01): Tarea asignada hoy: Picking en el frío (cámara refrigerada +2ºC a +4ºC, lácteos y carnes con terminal de voz).
   - Sergio Bravo (P-02): Tarea asignada hoy: Picking en el frío (cámara refrigerada +2ºC a +4ºC, embutidos y platos preparados La Cocina de ALDI).
2. Zona Congelado (-22ºC a -25ºC):
   - Laura Peña (P-03): Tarea asignada hoy: Picking en congelado (cámara a -22ºC con EPI térmico nivel 3 y descansos reglamentarios PRL).
3. Zona Seco (Temperatura ambiente 16-22ºC):
   - Pedro Navas (P-04): Picking en seco (pasillos de Bebidas y Bodega).
   - Ana López (P-05): Picking en seco (pasillos de Aceites, Salsas y Despensa).
   - Raúl Cuesta (P-06): Picking en seco (pasillos de Legumbres, Pastas y Arroces).
   - Óscar Vidal (P-07): Picking en seco (pasillos de Desayuno, Café y Galletas).
   - Marta Ruiz (P-08): Picking en seco (pasillos de Snacks y Dulces).
   - David Gil (P-09): Picking en seco (pasillos de Limpieza y Droguería Esselt/Tandil).
   - Nuria Campos (P-10): Picking en seco (pasillos de Higiene Biocura/Lacura).
   - Javier Pérez (P-11): Picking en seco (pasillos de Panadería seca y Bazar).
   - Carlos Moreno (P-12): Picking en seco (pasillos de Conservas de pescado y Platos preparados).`,
  },
  {
    id: 'DOC-012',
    title: 'Plantilla de Trabajadores: Departamento de Recepción (Descarga en Muelles y Racks)',
    category: 'operaciones',
    keywords: [
      'trabajador', 'trabajadores', 'operario', 'operarios', 'departamento', 'recepcion', 'descarga', 'muelles',
      'racks', 'subir', 'bajar', 'estanterias', 'retractil', 'frontal', 'f-01', 'r-01', 'tarea', 'tarea de hoy'
    ],
    content: `El Departamento de Recepción agrupa a 23 trabajadores dedicados a la entrada, descarga y almacenamiento de mercancía:
1. Carretilleros Frontales (Jungheinrich ERE 225i, F-01 a F-09):
   - Su tarea asignada es descargar camiones de proveedores en los muelles Inbound y trasladar la carga a la playa de recepción.
   - En Seco (muelles D05-D18): Gonzalo Iglesias (F-01), Miriam Lorenzo (F-02), Víctor Montero (F-03), Lorena Fuentes (F-04), Fernando Méndez (F-05), Alba Pascual (F-06).
   - En Frío (muelles D41-D50, control de termógrafo <4ºC): Manuel Rivas (F-07), Cristina Ortiz (F-08).
   - En Congelado (muelles D51-D64, control < -18ºC e introducción a esclusa): Guillermo Cruz (F-09).
2. Carretilleros Retráctiles (Jungheinrich ETV 216, R-01 a R-14):
   - Su tarea asignada es subir y bajar mercancía de los racks (ubicación en altura niveles 1-2 desde recepción y reposición de reserva al nivel 0 de picking).
   - En Seco: Lucía Santos (R-01), Marcos Benítez (R-02), Adrián Soler (R-03), Beatriz Molina (R-04), Hugo Garrido (R-05), Carmen Delgado (R-06), Jorge Morales (R-07), Patricia Sanz (R-08), Rubén Castillo (R-09).
   - En Frío (+2ºC): Silvia Ibáñez (R-10), Daniel Cano (R-11), Natalia Ramos (R-12). Tarea: Subir y bajar palets en estanterías de refrigerados.
   - En Congelado (-22ºC, cabina térmica): Iván Romero (R-13), Paula Herrero (R-14). Tarea: Subir y bajar palets en estanterías de ultracongelados.`,
  },
  {
    id: 'DOC-013',
    title: 'Plantilla de Trabajadores: Departamento de Expedición (Salida y Consolidación)',
    category: 'operaciones',
    keywords: [
      'trabajador', 'trabajadores', 'operario', 'operarios', 'departamento', 'expedicion', 'transpaleta', 'ese',
      'e-01', 'e-06', 'salida', 'muelles', 'flejadora', 'consolidacion', 'tarea', 'tarea de hoy'
    ],
    content: `El Departamento de Expedición cuenta con 6 conductores de transpaleta eléctrica con plataforma Jungheinrich ESE (id E-01 a E-06):
- Su tarea asignada hoy es el traslado de palés flejados desde el tren de flejado y playas de consolidación hacia los muelles de salida (D01-D04, D19-D64) para la carga de las rutas a supermercados ALDI.
- En Seco (muelles Outbound D01-D04 y D19-D40):
  * Samuel Vargas (E-01): Rutas generales de tiendas.
  * Clara Navarro (E-02): Consolidación de rutas de Madrid Capital y corona metropolitana.
  * Antonio Lozano (E-03): Rutas de La Sagra y Toledo.
  * Isabel Gallego (E-04): Rutas de larga distancia (Ávila y Segovia).
- En Frío (muelles D41-D50 y consolidación multitemperatura):
  * Pablo Serrano (E-05): Traslado de palés refrigerados flejados a playa de consolidación.
- En Congelado (muelles D51-D64):
  * Teresa Domínguez (E-06): Traslado exprés de palés ultracongelados hacia semirremolques bitemperatura.`,
  },
  {
    id: 'DOC-014',
    title: 'Régimen Laboral: Descanso Semanal (2 Días Libres: Domingos y Rotativo) y Vacaciones',
    category: 'operaciones',
    keywords: [
      'vacaciones', 'descanso', 'dias libres', 'domingo', 'domingos', 'rotativo', 'libranza',
      'semanal', 'convenio', 'jornada', '30 dias', 'cuadrante', 'trabajador', 'trabajadores'
    ],
    content: `Régimen de descansos y vacaciones en la Plataforma Logística ALDI Pinto:
1. Descanso Semanal (2 días libres por semana):
   - Todo el personal operativo cuenta con dos días libres a la semana.
   - El domingo es día de descanso fijo obligatorio para la plantilla (la plataforma interrumpe o reduce al mínimo las operaciones de almacén).
   - El segundo día libre es rotativo semanal (asignado de lunes a sábado según el cuadrante mensual del turno), garantizando 5 días de trabajo y 2 días de descanso semanal.
2. Vacaciones Anuales:
   - 30 días naturales retribuidos por convenio colectivo de logística.
   - Distribución habitual: período estival principal (15 a 16 días entre julio y septiembre) y segundo período invernal o fraccionado (14 a 15 días).
   - En la ficha digital de cada trabajador se refleja el saldo de días disfrutados, días pendientes y el próximo período programado.`,
  },
  {
    id: 'DOC-015',
    title: 'Optimización de Cabecera Sur de Frío y Circulación en Serpentina',
    category: 'frio',
    keywords: [
      'frio', 'f-02', 'f-03', 'f-04', 'atascos', 'cuello de botella', 'puerta',
      'ampliacion', 'maniobra', 'lacteos', 'charcuteria', 'serpentina', 'sentido unico'
    ],
    content: `Planes de mejora y diseño circulatorio en la cámara de Frío (+2/+4 ºC):
1. Ampliación física de la cabecera sur:
   - Se retranquearon 2 módulos (5,4 m) en las estanterías de Frío, ampliando el pasillo transversal sur hasta los 17,9 metros útiles libres respecto al tabique de separación z = -25.
   - Proporciona un radio de giro holgado y sin colisiones para carretillas recogepedidos de doble horquilla (3,5 m de gálibo con carga).
2. Apertura de puerta rápida en F-03:
   - Nueva puerta industrial de 7,2 m de luz en el eje del pasillo F-03 (x = 49,9) a través del tabique z = -25, permitiendo salida directa en línea recta hacia los trenes de flejado y expedición sin desvíos forzados de 90°.
3. Regulación del tráfico en serpentina (sentido único):
   - F-01 y F-04: circulación de Sur a Norte (entrada sur).
   - F-02, F-03 y F-05: circulación de Norte a Sur (salida sur hacia la explanada y flejadoras).
   - Elimina el 100% de encuentros frontales en pasillos y maniobras marcha atrás.
4. Desconcentración de slotting:
   - Alternancia de familias de alta rotación (Lácteos en F-02 y F-04, Charcutería en F-03 y F-05), repartiendo el flujo de operarios.`,
  },
];
