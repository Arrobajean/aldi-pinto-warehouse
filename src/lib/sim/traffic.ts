/**
 * Tráfico de camiones sin colisiones: huellas, comprobaciones de paso y zonas exclusivas del patio. (Las máquinas
 * de la nave navegan con PIBT sobre una retícula: ver navigator.ts.)
 *
 * Camiones: cinco círculos de radio 1,6 m a lo largo del eje. Las zonas de maniobra (muelles, plazas de espera)
 * y de cruce (distribuidor, salida este, cruce junto a la garita) son exclusivas: un camión solo entra en una zona
 * reservada por él, y la reserva exige que no haya otro camión en movimiento dentro. Las zonas activas de
 * maniobra nunca se solapan y las de cruce están lejos de las de maniobra (más de un camión), así que no hay
 * esperas circulares.
 */

export { CROSSING_ZONES, claimManeuver, dockStart, dockZone, dockZoneOf, releaseZones, stallZone } from '@/lib/sim/traffic-zones';
export type { ZoneClaim } from '@/lib/sim/traffic-zones';
export { TRUCK_CIRCLE_R, circlesGap, footprintInRect, truckCircles, truckParked } from '@/lib/sim/traffic-footprint';
export { STUCK_PATIENCE, truckFreeDistance, truckOverlaps } from '@/lib/sim/traffic-free';
