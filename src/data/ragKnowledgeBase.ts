import type { RagDocumentChunk } from '@/lib/types';

export const RAG_KNOWLEDGE_BASE: RagDocumentChunk[] = [
  {
    id: 'DOC-001',
    title: 'Ficha Técnica Plataforma Logística ALDI Pinto',
    category: 'almacen',
    keywords: ['pinto', 'superficie', 'capacidad', 'muelles', 'ubicacion', 'turnos', 'dimensiones', 'plataforma'],
    content: `La Plataforma Logística Central de ALDI en Pinto (Madrid) cuenta con una superficie construida de 42.000 m² sobre una parcela de 80.000 m².
Tiene una capacidad máxima de almacenamiento de 45.000 palets estándar europeos (1200x800 mm).
Estructura de muelles: Dispone de 8 muelles activos automáticos con abrigos isotérmicos y plataformas hidráulicas.
- Muelles D-01 a D-03: Reservados para Inbound (Recepción de proveedores nacionales e internacionales).
- Muelles D-04 a D-08: Reservados para Outbound (Expedición de rutas diarias a tiendas).
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
1. Zona Seco (24.000 m²): Temperatura ambiente controlada (16ºC a 22ºC). Alberga alimentación no perecedera, bebidas, droguería y bazar ALDI. Altura libre de 12 metros con estanterías convencionales de 4 y 5 niveles.
2. Zona Frío / Refrigerado (12.000 m²): Rango operativo continuo de +2.0ºC a +4.0ºC. Destinada a lácteos, carnes envasadas, embutidos y zona especial de Frutas & Verduras a +6ºC con control de humedad relativa (85-90%).
3. Zona Congelado / Ultracongelado (6.000 m²): Rango operativo de -22.0ºC a -25.0ºC. Cuenta con esclusas térmicas de acceso y cortinas de aire rápido para evitar la condensación y la formación de hielo. Todo el personal dispone de EPI térmico nivel 3 (traje frigorífico hasta -30ºC).`,
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
    keywords: ['carretillas', 'retractiles', 'frontales', 'transpaletas', 'maquinas', 'bateria', 'flota', 'jungheinrich', 'ecd'],
    content: `El centro dispone de una flota eléctrica monitorizada por telemetría IoT de 46 unidades:
1. Carretillas Retráctiles Jungheinrich (14 unidades):
   - Mástil triplex de gran altura (hasta 11.5 metros).
   - Utilizadas exclusivamente en los pasillos de estanterías de Seco y Frío para ubicar y desubicar palets pesados.
   - Velocidad máxima autolimitada a 9 km/h en pasillo.
2. Carretillas Frontales Contrapesadas Jungheinrich (8 unidades):
   - Capacidad nominal de 2.000 kg.
   - Operan en la playa de muelles para carga y descarga rápida de semirremolques y movimiento en playa de consolidación.
3. Transpaletas Eléctricas de Preparación (24 unidades):
   - Con plataforma abatible para preparadores de picking.
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
- Iluminación Blue-Spot y Red-Zone: Todas las carretillas retráctiles y frontales proyectan un foco azul en el suelo a 5 metros de distancia y un haz rojo perimetral para advertir a peatones antes de doblar esquinas.
- Prioridad de paso: Peatones en pasos de cebra señalizados > Carretillas con carga > Carretillas vacías.
- Uso obligatorio de EPI: Calzado de seguridad S3, chaleco de alta visibilidad clase 2, y guantes anticorte. En cámara de congelado, ropa de abrigo certificada EN 342.`,
  },
];
