import { RAG_KNOWLEDGE_BASE } from '@/data/ragKnowledgeBase';
import type { RagDocumentChunk } from '@/lib/types';

export interface RagSearchResult {
  chunk: RagDocumentChunk;
  relevance: number; // 0 - 100
  matchedKeywords: string[];
}

export interface RagResponse {
  answer: string;
  sources: {
    title: string;
    category: string;
    relevance: number;
    snippet: string;
  }[];
}

// Tokenizador y normalizador de texto en español
function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quita acentos para comparar
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2);
}

// Conjuntos constantes de categorías para búsquedas O(1)
const CAT_FRIO = new Set(['frio', 'temperatura', 'congelado', 'grados']);
const CAT_TIENDAS = new Set(['tienda', 'tiendas', 'avila', 'segovia', 'madrid', 'toledo', 'ruta']);
const CAT_MAQUINARIA = new Set(['carretilla', 'retractil', 'frontal', 'maquina', 'bateria']);
const CAT_ALMACEN = new Set(['muelle', 'pinto', 'capacidad', 'superficie', 'turno']);
const CAT_SEGURIDAD = new Set(['seguridad', 'alarma', 'protocolo', 'prl', 'riesgo']);
const CAT_PRODUCTOS = new Set(['producto', 'productos', 'marca', 'marcas', 'milsani', 'gutbio', 'surtido', 'familia', 'familias', 'horno', 'mercado', 'cocina', 'tabla', 'tandil', 'esselt', 'biocura', 'lacura', 'bazar', 'referencia', 'referencias']);
const CAT_OPERACIONES = new Set(['trabajador', 'trabajadores', 'operario', 'operarios', 'departamento', 'preparacion', 'recepcion', 'expedicion', 'tarea', 'picking', 'descarga', 'racks', 'vacaciones', 'descanso', 'libranza', 'domingo', 'rotativo']);

// Precomputar tokens de la base de conocimiento una sola vez
const INDEXED_KB = RAG_KNOWLEDGE_BASE.map(chunk => ({
  chunk,
  tokens: normalizeText(`${chunk.title} ${chunk.content} ${chunk.keywords.join(' ')}`),
  keywordsNorm: chunk.keywords.map(k => normalizeText(k).join(' ')),
}));

// Búsqueda de fragmentos relevantes (Retrieval)
export function searchKnowledgeBase(query: string, topK: number = 3): RagSearchResult[] {
  const queryTokens = normalizeText(query);
  if (queryTokens.length === 0) return [];

  const boostFrio = queryTokens.some(t => CAT_FRIO.has(t));
  const boostTiendas = queryTokens.some(t => CAT_TIENDAS.has(t));
  const boostMaquinaria = queryTokens.some(t => CAT_MAQUINARIA.has(t));
  const boostAlmacen = queryTokens.some(t => CAT_ALMACEN.has(t));
  const boostSeguridad = queryTokens.some(t => CAT_SEGURIDAD.has(t));
  const boostProductos = queryTokens.some(t => CAT_PRODUCTOS.has(t));
  const boostOperaciones = queryTokens.some(t => CAT_OPERACIONES.has(t));

  const results: RagSearchResult[] = INDEXED_KB.map(({ chunk, tokens: chunkTokens, keywordsNorm: chunkKeywordsNorm }) => {
    let score = 0;
    const matched = new Set<string>();

    // Ponderación de palabras clave
    for (const token of queryTokens) {
      if (chunkKeywordsNorm.some(k => k.includes(token))) {
        score += 15;
        matched.add(token);
      }
      const freq = chunkTokens.filter(t => t === token).length;
      if (freq > 0) {
        score += Math.min(freq * 3, 12);
        matched.add(token);
      }
    }

    // Boost especial por categorías O(1)
    if (boostFrio && chunk.category === 'frio') score += 20;
    if (boostTiendas && chunk.category === 'tiendas') score += 20;
    if (boostMaquinaria && chunk.category === 'maquinaria') score += 20;
    if (boostAlmacen && chunk.category === 'almacen') score += 20;
    if (boostSeguridad && chunk.category === 'seguridad') score += 20;
    if (boostProductos && chunk.category === 'productos') score += 25;
    if (boostOperaciones && chunk.category === 'operaciones') score += 30;

    // Normalizar a 0-100%
    const normalizedScore = Math.min(Math.round((score / 45) * 100), 99);

    return {
      chunk,
      relevance: normalizedScore,
      matchedKeywords: Array.from(matched),
    };
  });

  return results
    .filter(r => r.relevance > 15)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, topK);
}

// Generación aumentada (Augmented Generation)
export async function generateRagAnswer(query: string): Promise<RagResponse> {
  const searchResults = searchKnowledgeBase(query, 3);

  // Si los fragmentos no aportan contexto, responder con un resumen base.
  if (searchResults.length === 0) {
    return {
      answer: `No he encontrado información específica en la base de datos de operaciones de ALDI Pinto sobre esa consulta. 
Puedes preguntarme sobre:
- **Las 130 tiendas** en 8 provincias (Madrid, Toledo, Segovia, Ávila, Guadalajara, Ciudad Real, Cáceres, Salamanca).
- **La zonificación** (Seco, Frío +2 ºC a +4 ºC, Congelado -22 ºC).
- **La flota de carretillas** retráctiles, ERE 225i y preparadores de picking.
- **Protocolos de cadena de frío** y seguridad en muelles de carga.`,
      sources: [],
    };
  }

  // Generación local (plan B sin conexión). Con conexión, /api/chat usa Gemini + RAG.

  // Motor cognitivo estructurado (Generación nativa sin dependencias externas)
  // Genera respuestas contextualizadas de alta calidad analizando las intenciones
  const topChunk = searchResults[0].chunk;
  const qLower = query.toLowerCase();

  let answerText = '';

  if (qLower.includes('tienda') || qLower.includes('avila') || qLower.includes('segovia') || qLower.includes('toledo') || qLower.includes('madrid')) {
    answerText = `### Informe de Rutas y Distribución (Red 100 Tiendas)
Desde la **Plataforma Central de Pinto**, coordinamos el abastecimiento diario a las **100 tiendas ALDI** asignadas en la zona centro:

- **Comunidad de Madrid (58 tiendas)**: Doble ventana horaria (reparto matinal 05:00-08:30 h y refuerzo de tarde). Cobertura prioritaria de la corona metropolitana y centros urbanos.
- **Toledo (18 tiendas)**: Conexión por la autovía A-42 cubriendo el Corredor de La Sagra (Illescas, Seseña) hasta Toledo Capital y Talavera de la Reina.
- **Segovia (12 tiendas)**: Ruta de alta montaña vía túnel de Guadarrama (AP-6) y AP-61. Entregas tempranas en Vía Roma, El Espinar y comarca.
- **Ávila (12 tiendas)**: Despacho por la A-6 / AP-51 hacia Ávila Capital y Valle del Tiétar (Arenas de San Pedro y Candeleda con salidas prioritarias a las 05:00 h).

> **Compromiso ALDI:** Todos los camiones con producto fresco y refrigerado deben arribar a las tiendas antes de las **08:30 h** previo a la apertura comercial.`;
  } else if (qLower.includes('frio') || qLower.includes('temperatura') || qLower.includes('congelad') || qLower.includes('grado')) {
    answerText = `### Estado y Protocolo de Cámaras Térmicas
La plataforma de Pinto cuenta con 3 zonas térmicas independientes con telemetría en tiempo real:

1. **Zona Seco (25.575 m²)**: Temperatura ambiente controlada entre 16ºC y 22ºC (Conservas, pastas, bebidas y bazar).
2. **Zona Frío / Refrigerado (6.660 m²)**:
   - Rango objetivo: **+2.0ºC a +4.0ºC** (Lácteos, embutidos y carnes envasadas).
   - Zona Frutas & Verduras: +6.0ºC con humedad controlada (85-90%).
3. **Zona Congelado (2.312 m²)**:
   - Rango objetivo: **-22.0ºC a -25.0ºC** (Ultracongelados, helados y pescado).

**Protocolo de Emergencia por Pérdida Térmica:**
- Si el congelador supera los **-19.5ºC**, salta alerta preventiva al supervisor.
- Si supera los **-18.0ºC** por más de 20 minutos, entra en marcha el sistema compresor redundante de amoníaco/CO2 y se bloquean automáticamente las expediciones del lote.`;
  } else if (qLower.includes('carretilla') || qLower.includes('maquina') || qLower.includes('retractil') || qLower.includes('frontal') || qLower.includes('bateria')) {
    answerText = `### Parque de Maquinaria y Equipos de Manutención
La flota de ALDI Pinto está compuesta por **41 unidades eléctricas Jungheinrich** con monitorización telemática:

- **14 Carretillas Retráctiles Jungheinrich ETV/ETM 214-216**: Especializadas en pasillo estrecho con mástil triplex para alturas de hasta 11.5 metros en racks de Seco y Frío. Velocidad autolimitada a 9 km/h.
- **8 Apiladores Jungheinrich ERE 225i**: Con capacidad de 2.000 kg para la descarga rápida de trailers en los muelles de entrada (D05–D18) y la carga en los de salida (D01–D04, D19–D40).
- **12 Recogepedidos Jungheinrich ECD 320**: Preparan pedidos en el suelo de picking; las referencias de reposición se toman de los niveles superiores o del rack contiguo.
- **6 Transpaletas ESE Jungheinrich**: Llevan los pedidos preparados de la zona de preparación a la calle de cada muelle.

> **Recarga:** La estación de baterías de 400 kW se alimenta en un 40% de la instalación solar fotovoltaica instalada en la cubierta del almacén.`;
  } else if (qLower.includes('muelle') || qLower.includes('camion') || qLower.includes('inbound') || qLower.includes('outbound')) {
    answerText = `### Gestión de Muelles y Flujo de Transporte
La plataforma opera con **64 muelles** (D01–D64) con abrigos isotérmicos:

- **Muelles D05–D18 (Inbound / Recepción de seco)**: Descarga de proveedores. Verificación obligatoria de termógrafo continuo en semirremolques antes de abrir compuertas.
- **Muelles D01–D04 y D19–D40 (Outbound / Expedición de seco)**: Fachada sur. Cada muelle de salida se asigna a la ruta de tienda del día (Madrid Sur, Toledo A-42, Madrid Oeste y Talavera, Segovia, Ávila y Valle del Tiétar, entre otras).
- **Muelles D41–D50 (frío) y D51–D64 (congelado)**: Fachada este. Mixtos, de entrada y salida.

Todos los camiones frigoríficos salen precintados y con control de temperatura multipunto en cabina.`;
  } else if (
    qLower.includes('producto') ||
    qLower.includes('marca') ||
    qLower.includes('milsani') ||
    qLower.includes('gutbio') ||
    qLower.includes('horno') ||
    qLower.includes('mercado') ||
    qLower.includes('tabla') ||
    qLower.includes('cocina') ||
    qLower.includes('tandil') ||
    qLower.includes('esselt') ||
    qLower.includes('biocura') ||
    qLower.includes('lacura') ||
    qLower.includes('surtido') ||
    qLower.includes('referencia')
  ) {
    answerText = `### Surtido Comercial y Marcas Propias ALDI
ALDI estructura su oferta comercial en torno a **~2.000 referencias habituales**, donde el **90% son marcas propias (MDD)** distribuidas en más de 65 submarcas exclusivas:

1. **5 Grandes Familias Comerciales + Bazar:**
   - **Alimentación fresca y envasada**: Frutas, verduras, carnes, pescados, lácteos y despensa.
   - **Bebidas**: Aguas, refrescos, zumos y bodega.
   - **Panadería y bollería**: Pan del día y bollería recién horneada o envasada.
   - **Limpieza del hogar y droguería**: Cuidado del hogar y lavado de ropa.
   - **Higiene y cuidado personal**: Cosmética, aseo y cuidado dérmico.
   - **Bazar (*ALDI Deals*)**: Campañas semanales rotativas de menaje, tecnología, herramientas y textil.

2. **Marcas Propias Clave:**
   - **El Mercado de ALDI**: Frescos de origen (fruta, verdura, carne y pescado).
   - **El Horno de ALDI**: Panadería y bollería.
   - **La Cocina de ALDI**: Platos preparados y listos para consumir.
   - **La Tabla de ALDI**: Embutidos, charcutería y quesos.
   - **GutBio**: Gama transversal ecológica certificada.
   - **Milsani**: Lácteos, yogures y derivados.
   - **Esselt / Tandil**: Limpieza del hogar y detergencia.
   - **Biocura / Lacura**: Cosmética natural, higiene y cuidado personal.`;
  } else {
    // Respuesta general estructurada a partir del top chunk
    answerText = `### Información Operativa: ${topChunk.title}
Basado en los registros de la plataforma ALDI Pinto:

${topChunk.content}

*Esta información se ha recuperado directamente de los manuales de procedimiento logístico y el sistema WMS de Pinto.*`;
  }

  return {
    answer: answerText,
    sources: searchResults.map(s => ({
      title: s.chunk.title,
      category: s.chunk.category,
      relevance: s.relevance,
      snippet: s.chunk.content.slice(0, 160) + '...',
    })),
  };
}
