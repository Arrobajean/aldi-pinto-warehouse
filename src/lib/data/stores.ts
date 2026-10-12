import type { Province, StoreDestination, TemperatureCategory } from '../types';

// Lista de las tiendas ALDI abastecidas por la plataforma logística de Pinto.
// Distribución: Madrid (58), Toledo (18), Segovia (12), Ávila (12),
// Guadalajara (8), Ciudad Real (8), Cáceres (6), Salamanca (8).
// Todas las tiendas son simuladas con fines de demostración.

function townOf(name: string): string {
  const paren = /\(([^)]+)\)/.exec(name);
  if (paren) return paren[1].trim();
  const rest = name.replace(/^ALDI\s+/, '').trim();
  return rest.split(' - ')[0].trim();
}

function st(
  id: string,
  province: Province,
  name: string,
  distanceKm: number,
  palletsPerDay: number,
  temperatureCategory: TemperatureCategory = 'Multitemperatura',
): StoreDestination {
  const town = townOf(name);
  return {
    id,
    name,
    province,
    town,
    address: `Polígono comercial s/n, ${town}`,
    distanceKm,
    palletsPerDay,
    temperatureCategory,
  };
}

function storesFor(province: Province, count: number, towns: string[], distanceKm: number, palletsPerDay: number, prefix: string): StoreDestination[] {
  return Array.from({ length: count }, (_, i) =>
    st(`${prefix}-${String(i + 1).padStart(2, '0')}`, province, `ALDI ${towns[i]}`, distanceKm + i * 6, palletsPerDay + (i % 7)),
  );
}

export const STORES: StoreDestination[] = [
  // --- MADRID (58 tiendas) ---
  st('M-01', 'Madrid', 'ALDI Pinto - C/ Alcotanes', 4, 28),
  st('M-02', 'Madrid', 'ALDI Getafe - Sector 3', 12, 32),
  st('M-03', 'Madrid', 'ALDI Leganés - Parquesur', 16, 30),
  st('M-04', 'Madrid', 'ALDI Fuenlabrada - Loranca', 18, 34),
  st('M-05', 'Madrid', 'ALDI Alcorcón - Parque Oeste', 24, 33),
  st('M-06', 'Madrid', 'ALDI Móstoles - El Soto', 26, 31),
  st('M-07', 'Madrid', 'ALDI Madrid - Atocha / Méndez Álvaro', 22, 26),
  st('M-08', 'Madrid', 'ALDI Madrid - Vallecas Villa', 21, 29),
  st('M-09', 'Madrid', 'ALDI Madrid - Carabanchel', 23, 30),
  st('M-10', 'Madrid', 'ALDI Madrid - Chamberí / Fuencarral', 27, 24),
  st('M-11', 'Madrid', 'ALDI Madrid - Salamanca / Goya', 26, 25),
  st('M-12', 'Madrid', 'ALDI Madrid - Tetuán / Bravo Murillo', 29, 27),
  st('M-13', 'Madrid', 'ALDI Madrid - Chamartín', 31, 26),
  st('M-14', 'Madrid', 'ALDI Madrid - Las Tablas', 35, 30),
  st('M-15', 'Madrid', 'ALDI Madrid - Sanchinarro', 34, 32),
  st('M-16', 'Madrid', 'ALDI Alcobendas - Valdelaparra', 38, 33),
  st('M-17', 'Madrid', 'ALDI San Sebastián de los Reyes', 40, 35),
  st('M-18', 'Madrid', 'ALDI Rivas-Vaciamadrid - Futura', 25, 31),
  st('M-19', 'Madrid', 'ALDI Arganda del Rey', 33, 29),
  st('M-20', 'Madrid', 'ALDI Coslada - Puerto Seco', 30, 28),
  st('M-21', 'Madrid', 'ALDI San Fernando de Henares', 32, 30),
  st('M-22', 'Madrid', 'ALDI Torrejón de Ardoz - Parque Corredor', 37, 34),
  st('M-23', 'Madrid', 'ALDI Alcalá de Henares - La Garena', 42, 36),
  st('M-24', 'Madrid', 'ALDI Pozuelo de Alarcón', 30, 28),
  st('M-25', 'Madrid', 'ALDI Majadahonda - Novotiendas', 36, 32),
  st('M-26', 'Madrid', 'ALDI Las Rozas - Európolis', 39, 31),
  st('M-27', 'Madrid', 'ALDI Collado Villalba - Los Valles', 58, 33),
  st('M-28', 'Madrid', 'ALDI Valdemoro - Restón', 11, 29),
  st('M-29', 'Madrid', 'ALDI Ciempozuelos', 17, 26),
  st('M-30', 'Madrid', 'ALDI Aranjuez - Plaza de Toros', 30, 30),
  ...Array.from({ length: 28 }, (_, i) => {
    const towns = ['Parla', 'Tres Cantos', 'Boadilla', 'Navalcarnero', 'Villaviciosa', 'San Martín de la Vega', 'Humanes de Madrid', 'Griñón', 'Colmenar Viejo'];
    const town = towns[i % towns.length];
    return st(`M-${31 + i}`, 'Madrid', `ALDI Comunidad de Madrid #${31 + i} (${town})`, 20 + i * 2, 26 + (i % 8));
  }),

  // --- TOLEDO (18 tiendas) ---
  st('T-01', 'Toledo', 'ALDI Illescas - Señorío de Illescas', 22, 33),
  st('T-02', 'Toledo', 'ALDI Seseña - El Quiñón', 20, 31),
  st('T-03', 'Toledo', 'ALDI Toledo Capital - Santa Bárbara', 55, 35),
  st('T-04', 'Toledo', 'ALDI Toledo - Buenavista', 57, 34),
  st('T-05', 'Toledo', 'ALDI Talavera de la Reina - Ctra. Madrid', 122, 38),
  st('T-06', 'Toledo', 'ALDI Talavera - La Barrosa', 124, 36),
  st('T-07', 'Toledo', 'ALDI Olías del Rey - Parque Comercial Abadía', 51, 32),
  st('T-08', 'Toledo', 'ALDI Torrijos - El Molino', 76, 29),
  st('T-09', 'Toledo', 'ALDI Ocaña - Polígono Las Canteras', 46, 28),
  st('T-10', 'Toledo', 'ALDI Yuncos', 26, 30),
  ...Array.from({ length: 8 }, (_, i) => {
    const towns = ['Fuensalida', 'Sonseca', 'Mora', 'Quintanar de la Orden', 'Madridejos', 'Consuegra', 'Bargas', 'La Puebla de Montalbán'];
    return st(`T-${11 + i}`, 'Toledo', `ALDI Toledo #${11 + i} (${towns[i]})`, 40 + i * 9, 28 + (i % 5));
  }),

  // --- SEGOVIA (12 tiendas) ---
  st('S-01', 'Segovia', 'ALDI Segovia Capital - Vía Roma', 104, 34),
  st('S-02', 'Segovia', 'ALDI Segovia - Carretera de Madrid', 102, 33),
  st('S-03', 'Segovia', 'ALDI El Espinar - Los Ángeles de San Rafael', 78, 29),
  st('S-04', 'Segovia', 'ALDI Cuéllar - Ronda de San Bartolomé', 156, 31),
  st('S-05', 'Segovia', 'ALDI La Lastrilla', 106, 30),
  st('S-06', 'Segovia', 'ALDI Palazuelos de Eresma', 99, 28),
  ...Array.from({ length: 6 }, (_, i) => {
    const towns = ['Cantalejo', 'Riaza', 'Carbonero el Mayor', 'Nava de la Asunción', 'Villacastín', 'Sepúlveda'];
    return st(`S-${7 + i}`, 'Segovia', `ALDI Segovia Rural #${7 + i} (${towns[i]})`, 85 + i * 14, 25 + (i % 6));
  }),

  // --- ÁVILA (12 tiendas) ---
  st('A-01', 'Ávila', 'ALDI Ávila Capital - Ctra. Sonsoles', 126, 36),
  st('A-02', 'Ávila', 'ALDI Ávila - Polígono Las Hervencias', 124, 35),
  st('A-03', 'Ávila', 'ALDI Arévalo - Ctra. Madrid', 138, 32),
  st('A-04', 'Ávila', 'ALDI Arenas de San Pedro', 172, 34),
  st('A-05', 'Ávila', 'ALDI Las Navas del Marqués', 98, 27),
  st('A-06', 'Ávila', 'ALDI Candeleda', 188, 30),
  ...Array.from({ length: 6 }, (_, i) => {
    const towns = ['El Tiemblo', 'Cebreros', 'Sotillo de la Adrada', 'Piedrahíta', 'El Barco de Ávila', 'Madrigal de las Altas Torres'];
    return st(`A-${7 + i}`, 'Ávila', `ALDI Ávila Comarca #${7 + i} (${towns[i]})`, 100 + i * 15, 26 + (i % 5));
  }),

  // --- GUADALAJARA (8 tiendas) ---
  ...storesFor('Guadalajara', 8, ['Guadalajara', 'Azuqueca de Henares', 'Yunquera de Henares', 'Marchamalo', 'Cabanillas del Campo', 'Alovera', 'El Casar', 'Sigüenza'], 55, 20, 'G'),

  // --- CIUDAD REAL (8 tiendas) ---
  ...storesFor('Ciudad Real', 8, ['Ciudad Real', 'Puertollano', 'Alcázar de San Juan', 'Tomelloso', 'Valdepeñas', 'Manzanares', 'Daimiel', 'Miguelturra'], 190, 18, 'CR'),

  // --- CÁCERES (6 tiendas) ---
  ...storesFor('Cáceres', 6, ['Cáceres', 'Plasencia', 'Navalmoral de la Mata', 'Coria', 'Trujillo', 'Miajadas'], 280, 16, 'CC'),

  // --- SALAMANCA (8 tiendas) ---
  ...storesFor('Salamanca', 8, ['Salamanca', 'Béjar', 'Ciudad Rodrigo', 'Santa Marta de Tormes', 'Villares de la Reina', 'Carbajosa de la Sagrada', 'Peñaranda de Bracamonte', 'Vitigudino'], 210, 18, 'SL'),
];

export const STORES_BY_PROVINCE = STORES.reduce<Record<Province, StoreDestination[]>>((acc, store) => {
  acc[store.province].push(store);
  return acc;
}, {
  Madrid: [],
  Toledo: [],
  Segovia: [],
  'Ávila': [],
  Guadalajara: [],
  'Ciudad Real': [],
  Cáceres: [],
  Salamanca: [],
});