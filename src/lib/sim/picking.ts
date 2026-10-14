/** Picking: plan de pedidos abiertos, reparto por secciones y lotes de cada preparador. (extraído de tick.ts) */
import { TEMPS } from '@/lib/sim/consolidation';
import { type SimDeps } from '@/lib/sim/deps';
import { nextRandom } from '@/lib/sim/init';
import { COLD_SECTION, type SectionIndex } from '@/lib/sim/sections';
import type { SimState, StoreOrder, Truck } from '@/lib/sim/types';
import { preparableAhora, ventanaDeSalida } from '@/lib/sim/outbound-window';
import { esDeOtroDia } from '@/lib/sim/work-dia-siguiente';
import { FAMILIAS_TURNO_TARDE, REPARTO_PEDIDO_POR_ZONA } from '@/lib/stock/catalog';

/**
 * ¿Puede preparar este palé el turno en curso? El de mañana prepara todo menos cárnicos y vegetales; el de tarde
 * prepara esos (y lo que sobre de mañana). Fuera de esos turnos no se restringe.
 */
export function puedePrepararse(state: SimState, pid: string): boolean {
  if (state.preparacion.turno !== 'mañana') return true;
  return !FAMILIAS_TURNO_TARDE.has(state.paletById[pid]?.family ?? '');
}

/** Reparto supuesto de un pedido multitemperatura entre secciones (ajustar con datos de ventas). */
export const ORDER_TEMP_SHARE = REPARTO_PEDIDO_POR_ZONA;

/** Palés que una máquina lleva a la vez (recogepedidos y transpaleta): máximo 2. */
export const MAX_PALETS_PER_TRIP = 2;

/**
 * Palés por lote de preparación: los que el recogepedidos lleva a la vez. La parte de una sección mayor que eso
 * la sigue haciendo un preparador de esa sección, en viajes sucesivos.
 */
export const PICK_LOT_MAX = MAX_PALETS_PER_TRIP;

/** Salidas de la agenda que se preparan por adelantado, antes de que su camión atraque (el picking no se para). */
export const PREP_AHEAD = 12;

/** Tope de palés ya preparados en las calles de muelle: por encima no se adelanta más picking. */
export const PREP_STAGE_MAX = 300;

/**
 * Pedidos con picking abierto, cada uno con su muelle: los de los camiones atracados y, para que los preparadores
 * no se queden sin trabajo mientras llega el siguiente camión, las próximas salidas de la agenda (hasta PREP_AHEAD
 * por delante de las ya lanzadas). Un pedido por adelantado se prepara en su muelle previsto, y solo cuando el
 * anterior de ese muelle ya ha salido.
 */
export function pickingPlan(state: SimState, loadingTrucks: Map<string, Truck>): { order: StoreOrder; dockId: string; truck?: Truck }[] {
  const plan: { order: StoreOrder; dockId: string; truck?: Truck }[] = [];
  const claimed = new Set<string>();
  for (const order of state.demand.orders) {
    const truck = loadingTrucks.get(order.id);
    if (!truck?.dockId) continue;
    claimed.add(truck.dockId);
    plan.push({ order, dockId: truck.dockId, truck });
  }
  const shipped = new Set(state.outboundDone);
  // Solo cuenta lo que el turno en curso puede preparar: un pedido de cárnicos por la mañana no reserva su muelle.
  const pendiente = (order: StoreOrder) => Object.values(state.pickRemaining[order.id] ?? {}).some((v) => v > 0) && preparableAhora(state, order);
  // Pedidos ya empezados que aún tienen palés por preparar (del turno anterior o de la mañana): siguen en el plan
  // aunque no entren en la ventana ni haya tope de palés preparados por adelantado.
  for (const order of state.demand.orders) {
    if (shipped.has(order.id) || loadingTrucks.has(order.id) || claimed.has(order.dockId) || !pendiente(order)) continue;
    claimed.add(order.dockId);
    plan.push({ order, dockId: order.dockId });
  }
  // Pedidos nuevos dentro de la ventana, mientras no se supere el tope de palés preparados por adelantado.
  const ventana = ventanaDeSalida(state, PREP_AHEAD);
  const enVentana = new Set(ventana.map((o) => o.id));
  const staged = Object.values(state.lanePallets).reduce((a, l) => a + l.length, 0);
  state.demand.orders.forEach((order) => {
    // El siguiente pedido en salir siempre se prepara: si el tope lo bloqueara, el camión nunca saldría.
    const primero = ventana[0]?.id === order.id;
    if (!enVentana.has(order.id) || (staged >= PREP_STAGE_MAX && !primero) || shipped.has(order.id) || loadingTrucks.has(order.id) || claimed.has(order.dockId)) return;
    // La calle es de un solo pedido: uno nuevo no empieza mientras en la calle de su muelle quede lo de otro.
    if (!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.Q_NOLANE && !state.pickRemaining[order.id] && !primero && (state.lanePallets[order.dockId] ?? []).length > 0) return; // TEMP-Q
    claimed.add(order.dockId);
    plan.push({ order, dockId: order.dockId });
  });
  // Día siguiente: si sobra capacidad en una clase (ningún pedido de hoy de esa clase en el plan), se adelantan
  // pedidos de mañana. Solo en muelles que ya han expedido todo lo de hoy, con la calle vacía y empezando por el
  // primer pedido de mañana de ese muelle: la calle es de un solo pedido y el camión que sale carga lo que hay en ella.
  const clasesConTrabajo = new Set(plan.filter((p) => !esDeOtroDia(state, p.order)).map((p) => p.order.temp));
  const muellesOcupados = new Set(state.demand.orders.filter((o) => !esDeOtroDia(state, o) && !shipped.has(o.id)).map((o) => o.dockId));
  let adelantados = plan.filter((p) => esDeOtroDia(state, p.order)).length;
  for (const order of state.demand.orders) {
    if (adelantados >= PREP_AHEAD) break;
    if (!esDeOtroDia(state, order) || shipped.has(order.id) || muellesOcupados.has(order.dockId)) continue;
    // Primer pedido de mañana de este muelle: el resto del muelle espera a que salga.
    muellesOcupados.add(order.dockId);
    if (state.pickRemaining[order.id] || clasesConTrabajo.has(order.temp) || claimed.has(order.dockId)) continue;
    if ((state.lanePallets[order.dockId] ?? []).length > 0) continue;
    claimed.add(order.dockId);
    plan.push({ order, dockId: order.dockId });
    adelantados++;
  }
  // Prioridad: camiones atracados; después lo pendiente de turnos u días anteriores; después lo nuevo; por último,
  // lo del día siguiente.
  const prioridad = (p: (typeof plan)[number]) => (p.truck ? 0 : esDeOtroDia(state, p.order) ? 3 : pendiente(p.order) ? 1 : 2);
  return plan.sort((a, b) => prioridad(a) - prioridad(b));
}

/**
 * Reparte los palés de un pedido entre las secciones: primero por categoría térmica (ORDER_TEMP_SHARE) y dentro
 * de cada una según el peso de cada sección (pasillos que ocupa), con redondeo de restos mayores para que la
 * suma sea exacta.
 */
export function splitOrder(total: number, sectionsByTemp: SectionIndex['sectionsByTemp']): Record<string, number> {
  const raw: { section: string; v: number }[] = [];
  // Solo se reparte entre las temperaturas que tienen secciones (un pedido de una clase no pide las otras).
  const conSecciones = TEMPS.filter((t) => sectionsByTemp[t].length > 0);
  const pesoTotal = conSecciones.reduce((a, t) => a + ORDER_TEMP_SHARE[t], 0);
  for (const t of conSecciones) {
    const list = sectionsByTemp[t];
    const w = list.reduce((k, s) => k + s.weight, 0);
    for (const s of list) raw.push({ section: s.section, v: w > 0 ? (total * (ORDER_TEMP_SHARE[t] / pesoTotal) * s.weight) / w : 0 });
  }
  const out: Record<string, number> = {};
  let assigned = 0;
  for (const r of raw) {
    out[r.section] = Math.floor(r.v);
    assigned += out[r.section];
  }
  const rest = (r: { v: number }) => r.v - Math.floor(r.v);
  const byRest = [...raw].sort((a, b) => rest(b) - rest(a) || a.section.localeCompare(b.section));
  for (let i = 0; assigned < total && i < byRest.length; i++, assigned++) out[byRest[i].section]++;
  return out;
}

/** Orden de recorrido de los palés de picking de cada sección (caché por lista y longitud). */
export const walkCache = new Map<string, { list: string[]; len: number; sorted: string[] }>();

/**
 * Palés de picking de una sección para un lote: un tramo seguido del recorrido (pasillo a pasillo y a lo largo
 * del pasillo) desde un punto de arranque con semilla, nunca palés sueltos por toda la sección.
 */
export function takeInWalkOrder(state: SimState, deps: SimDeps, section: string, n: number, reserved: Set<string>): string[] {
  const order = deps.sections.walkOrder;
  const rank = (pid: string) => order.get(state.paletById[pid]?.locId ?? '') ?? 0;
  // El orden de recorrido de la sección se guarda y solo se recalcula cuando cambia su lista de palés.
  const list = state.pickingBySection[section] ?? [];
  let cached = walkCache.get(section);
  if (!cached || cached.list !== list || cached.len !== list.length) {
    cached = { list, len: list.length, sorted: [...list].sort((a, b) => rank(a) - rank(b)) };
    walkCache.set(section, cached);
  }
  const avail = cached.sorted.filter((pid) => !reserved.has(pid) && puedePrepararse(state, pid));
  if (avail.length === 0) return [];
  const start = Math.floor(nextRandom(state) * avail.length);
  const take: string[] = [];
  for (let k = 0; k < Math.min(n, avail.length); k++) take.push(avail[(start + k) % avail.length]);
  return take.sort((a, b) => rank(a) - rank(b));
}

/**
 * Ruta de frío de un pedido: sus palés de la sección repartidos a lo largo de los pasillos 1…9 (en el orden de la
 * serpentina), y cada lote saca los siguientes de la lista. Así el preparador recorre el frío de pasillo 1 a 9 y no
 * da saltos al azar. Los palés de la ruta quedan reservados hasta que se preparan.
 */
export function takeColdRoute(state: SimState, deps: SimDeps, orderId: string, left: number, reserved: Set<string>, lote = PICK_LOT_MAX): string[] {
  const routes = (state.pickRoutes ??= {});
  if (!routes[orderId]?.length) {
    const order = deps.sections.walkOrder;
    const rank = (pid: string) => order.get(state.paletById[pid]?.locId ?? '') ?? 0;
    const avail = (state.pickingBySection[COLD_SECTION] ?? []).filter((pid) => !reserved.has(pid) && puedePrepararse(state, pid)).sort((a, b) => rank(a) - rank(b));
    const count = Math.min(left, avail.length);
    if (count === 0) return [];
    // Reparto uniforme sobre la lista ordenada: un palé cada `step` posiciones, con un desfase aleatorio (determinista).
    const step = avail.length / count;
    const offset = nextRandom(state) * step;
    routes[orderId] = Array.from({ length: count }, (_, i) => avail[Math.floor(i * step + offset)]);
    for (const pid of routes[orderId]) reserved.add(pid);
  }
  const route = routes[orderId];
  const take = route.splice(0, Math.min(left, lote));
  if (route.length === 0) delete routes[orderId];
  return take;
}
