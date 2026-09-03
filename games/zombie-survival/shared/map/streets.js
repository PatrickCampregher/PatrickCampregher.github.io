// Streets: playable-boundary walls and fences, street furniture, vehicles, lights, fires, signs,
// outer-decor silhouettes and road-marking data.
import { wall, door, hole, ehole, box, sign, FENCE, RUBBLE, PI, HALF } from './helpers.js';

export const boundaryWalls = [
  // ---- Main Street west end + the two pockets beside it ----
  wall(-32, -8.5, -32, 8.5, 3.0, 'rubble_wall', [ehole(-2.5, 2.0, 'street_w1'), ehole(3, 2.0, 'street_w2')], RUBBLE),
  wall(-32.52, 9, -26.85, 9, 3.0, 'rubble_wall', [ehole(-31, 2.0, 'street_nw')], RUBBLE),
  wall(-32.52, -9, -27.85, -9, 3.0, 'rubble_wall', [ehole(-31, 2.0, 'street_sw')], RUBBLE),
  // ---- east barricade (x 12): sidewalks sealed with rubble, the road by the gate door ----
  wall(12, 6.05, 12, 9, 3.0, 'rubble_wall', [], { t: 0.6 }),
  wall(12, -8.95, 12, -6.05, 3.0, 'rubble_wall', [], { t: 0.6 }),
  // ---- plaza ----
  wall(-8.52, 40, 24.52, 40, 3.0, 'rubble_wall', [ehole(-4, 2.0, 'plaza_n1'), ehole(9, 2.0, 'plaza_n2'), ehole(17, 2.2, 'x_n1')], RUBBLE),   // north edge (plaza + avenue)
  wall(-8, 24, -8, 39.5, 3.0, 'rubble_wall', [ehole(32, 2.0, 'plaza_w1')], RUBBLE),
  wall(12, 19, 12, 39.9, 2.6, 'fence', [door(30, 'plaza_east', 3.0, 2.6)], FENCE),
  wall(-4, 19, -4, 21, 2.6, 'fence', [], FENCE),            // fenced service strip behind the pharmacy
  wall(-4, 21, 12, 21, 2.6, 'fence', [], FENCE),
  // ---- Foundry Avenue ends ----
  wall(24, 34, 24, 39.5, 3.0, 'rubble_wall', [], RUBBLE),  // seals the strip north of the theatre
  wall(24, -29.5, 24, -27, 3.0, 'rubble_wall', [], RUBBLE), // seals the strip south of the garage
  wall(41, -29.5, 41, -27, 3.0, 'rubble_wall', [], RUBBLE),
  // ---- south edge (back alley + avenue) ----
  wall(-28.52, -30, 24.52, -30, 3.0, 'rubble_wall', [ehole(-20, 2.0, 'balley_s1'), ehole(-6, 2.0, 'balley_s2'), ehole(6, 2.0, 'balley_s3'), ehole(18, 2.2, 'x_s1')], RUBBLE),
  wall(-28, -29.5, -28, -24, 3.0, 'rubble_wall', [ehole(-27, 2.0, 'balley_w1')], RUBBLE),
  wall(12, -30, 12, -24, 2.6, 'fence', [door(-27, 'backlot_east', 3.0, 2.6)], FENCE),
  // ---- Main Street east + parking lot ----
  wall(56, -9, 56, 8.5, 3.0, 'rubble_wall', [ehole(-3, 2.2, 'x_e1'), ehole(4, 2.2, 'x_e2')], RUBBLE),
  wall(48, 9, 56.52, 9, 3.0, 'rubble_wall', [], RUBBLE),
  wall(41, -9, 56, -9, 2.6, 'fence', [door(47, 'lot_gate', 4.0, 2.6)], FENCE),
  wall(56, -30, 56, -9, 2.6, 'fence', [ehole(-24, 2.0, 'lot_e1'), ehole(-14, 2.0, 'lot_e2')], FENCE),
  wall(41, -30, 56, -30, 2.6, 'fence', [ehole(47, 2.0, 'lot_s1'), ehole(53, 2.0, 'lot_s2')], FENCE),
];

export const streetBoxes = [
  box(10.6, 0, 2.5, 1.0, 0.9, 3.0, 'sandbag', { vault: true, kind: 'sandbags' }),    // barricade nest (street side)
  box(10.6, 0, -2.5, 1.0, 0.9, 3.0, 'sandbag', { vault: true, kind: 'sandbags' }),
  box(-29.5, 0, -1, 1.2, 0.9, 4.0, 'sandbag', { vault: true, kind: 'sandbags' }),    // west end nest
  box(3, 0.15, 7.75, 4, 0.45, 0.5, 'metal_dark', { vault: true, kind: 'bench' }),     // bus stop bench
  box(2, 0, 30, 5.2, 0.9, 5.2, 'stone', { vault: true, kind: 'basin' }),              // fountain basin (octagon = two boxes)
  box(2, 0, 30, 5.2, 0.9, 5.2, 'stone', { vault: true, kind: 'basin', yaw: PI / 4 }),
  box(2, 0.9, 30, 1.0, 3.4, 1.0, 'stone', { kind: 'monument' }),                      // monument on the basin
  box(-4, 0, 26, 1.8, 0.5, 0.6, 'wood_dark', { vault: true, kind: 'bench' }),
  box(8, 0, 26, 1.8, 0.5, 0.6, 'wood_dark', { vault: true, kind: 'bench' }),
  box(-5.5, 0, 35, 1.2, 0.7, 1.2, 'stone', { vault: true, kind: 'planter' }),
  box(9.5, 0, 35, 1.2, 0.7, 1.2, 'stone', { vault: true, kind: 'planter' }),
  box(49, 0, -20.6, 12, 0.14, 0.3, 'concrete', { vault: true, kind: 'wheelstop' }),   // parking bay wheel stops
  box(49, 0, -29.4, 12, 0.14, 0.3, 'concrete', { vault: true, kind: 'wheelstop' }),
  box(-14, 0, -28.6, 2.2, 1.5, 1.4, 'metal_green', { kind: 'dumpster' }),             // back alley
  box(9, 0, -28.6, 2.2, 1.5, 1.4, 'metal_green', { kind: 'dumpster' }),
  box(-6.2, 0, 20.2, 1.6, 1.4, 1.4, 'metal_green', { kind: 'dumpster' }),             // north alley end
  box(13, 0.15, -22, 1.2, 1.0, 1.2, 'wood_dark', { vault: true, kind: 'crate' }),
];

export const props = [
  // vehicles (solid). Vehicle yaw 0 = length along +X (parked along Main Street); +-HALF = along the avenue.
  { type: 'bus', x: 16, z: -1, yaw: HALF + 0.35, color: '#c9a640', wrecked: true, burning: true },   // crossroads landmark
  { type: 'car', x: -14, z: 2.6, yaw: 0.18, color: '#7a2a24', wrecked: true },
  { type: 'van', x: -9, z: -3.4, yaw: 1.35, color: '#c9c3b5', wrecked: true },
  { type: 'car', x: 7.5, z: 3.2, yaw: -0.2, color: '#3a4a5a', wrecked: true, burning: true },
  { type: 'car', x: 20, z: 22, yaw: HALF + 0.1, color: '#2b5c3f', wrecked: true },
  { type: 'car', x: 16, z: -18, yaw: -HALF + 0.1, color: '#8c8c8c', wrecked: false },
  { type: 'van', x: 44, z: 2.5, yaw: HALF, color: '#e0d8c8', wrecked: false },
  { type: 'car', x: 44.2, z: -16, yaw: HALF, color: '#3b3b6b', wrecked: false },
  { type: 'car', x: 49, z: -16, yaw: HALF + 0.05, color: '#6a6a3a', wrecked: true },
  { type: 'car', x: 51.4, z: -16, yaw: HALF, color: '#a34b2c', wrecked: true, burning: true },
  { type: 'van', x: 44.2, z: -25, yaw: HALF, color: '#4a5a6a', wrecked: false },
  { type: 'car', x: 46.6, z: -25, yaw: -HALF, color: '#3a3a3a', wrecked: true },
  { type: 'car', x: 51.4, z: -25, yaw: HALF - 0.04, color: '#8c8c8c', wrecked: false },
  { type: 'car', x: 33, y: 2.0, z: -20, yaw: HALF, color: '#9b2f2f', wrecked: false, indoor: true },   // on the garage lift
  { type: 'car', x: 2, z: -27, yaw: 0.12, color: '#4a5a6a', wrecked: true, burning: true },
  { type: 'car', x: -38, z: 4, yaw: 0.6, color: '#6a4a2a', wrecked: true, burning: true, decor: true },
  { type: 'bus', x: 61, z: -14, yaw: 0.2, color: '#5a6a7a', wrecked: true, decor: true },
  // street lights
  { type: 'streetlight', x: -26, z: 7.5, yaw: PI }, { type: 'streetlight', x: -6, z: 7.5, yaw: PI }, { type: 'streetlight', x: 7, z: 7.5, yaw: PI },
  { type: 'streetlight', x: -24, z: -7.5, yaw: 0 }, { type: 'streetlight', x: -12, z: -7.5, yaw: 0 }, { type: 'streetlight', x: 0, z: -7.5, yaw: 0 },
  { type: 'streetlight', x: 27, z: 7.5, yaw: PI }, { type: 'streetlight', x: 52, z: 7.5, yaw: PI },
  { type: 'streetlight', x: 34, z: -7.5, yaw: 0 }, { type: 'streetlight', x: 50, z: -7.5, yaw: 0 },
  { type: 'streetlight', x: 12.8, z: -20, yaw: HALF }, { type: 'streetlight', x: 12.8, z: 22, yaw: HALF },
  { type: 'streetlight', x: 23.2, z: -12, yaw: -HALF }, { type: 'streetlight', x: 23.2, z: 26, yaw: -HALF },
  { type: 'streetlight', x: 55, z: -21.6, yaw: -HALF }, { type: 'streetlight', x: 53, z: -10.5, yaw: 0 },
  { type: 'streetlight', x: -5, z: 25, yaw: HALF }, { type: 'streetlight', x: 9, z: 37, yaw: -HALF },
  // interior lamps
  { type: 'lamp', x: -21, y: 3.2, z: 13, color: '#ffb070', intensity: 2.4, range: 15 },
  { type: 'lamp', x: -14, y: 3.2, z: 20, color: '#ffc890', intensity: 2.2, range: 14, flicker: true },
  { type: 'lamp', x: -20, y: 6.6, z: 16, color: '#ffc890', intensity: 2.0, range: 14 },
  { type: 'lamp', x: -13, y: 6.6, z: 21, color: '#ffb070', intensity: 1.6, range: 12, flicker: true },
  { type: 'lamp', x: 2, y: 3.2, z: 13, color: '#cfe8ff', intensity: 2.2, range: 14, flicker: true },
  { type: 'lamp', x: 9, y: 3.2, z: 17, color: '#cfe8ff', intensity: 2.0, range: 14 },
  { type: 'lamp', x: -22, y: 3.8, z: -16, color: '#ffc080', intensity: 2.0, range: 15, flicker: true },
  { type: 'lamp', x: -13, y: 3.2, z: -13, color: '#ffc080', intensity: 1.4, range: 12 },
  { type: 'lamp', x: 30, y: 4.8, z: -18, color: '#d0f0ff', intensity: 2.4, range: 16 },
  { type: 'lamp', x: 37, y: 4.8, z: -14, color: '#d0f0ff', intensity: 2.0, range: 15, flicker: true },
  { type: 'lamp', x: 30, y: 6.8, z: 12, color: '#ffd9a0', intensity: 2.6, range: 17 },
  { type: 'lamp', x: 42, y: 6.8, z: 12, color: '#ffd9a0', intensity: 2.6, range: 17 },
  { type: 'lamp', x: 36, y: 3.1, z: 16.5, color: '#ffd9a0', intensity: 1.6, range: 12, flicker: true },
  { type: 'lamp', x: 30, y: 6.8, z: 24, color: '#c8b0ff', intensity: 1.6, range: 15 },
  { type: 'lamp', x: 42, y: 6.8, z: 24, color: '#c8b0ff', intensity: 1.6, range: 15 },
  { type: 'lamp', x: 36, y: 6.8, z: 30.5, color: '#ff9a50', intensity: 3.2, range: 14 },
  { type: 'lamp', x: 27, y: 6.4, z: 32, color: '#ffd0a0', intensity: 1.4, range: 11, flicker: true },
  { type: 'lamp', x: -6, y: 3.2, z: 15, color: '#ffb070', intensity: 1.6, range: 11, flicker: true },
  { type: 'lamp', x: 0, y: 3.2, z: -27, color: '#ffb070', intensity: 1.8, range: 15 },
  { type: 'lamp', x: -18, y: 3.0, z: -27, color: '#ffb070', intensity: 1.6, range: 14, flicker: true },
  { type: 'lamp', x: 7, y: 2.9, z: -12.5, color: '#ffd0a0', intensity: 1.4, range: 11, flicker: true },
  { type: 'lamp', x: 43, y: 4.6, z: -13, color: '#ffd0a0', intensity: 1.4, range: 12 },
  // fires
  { type: 'fire', x: -27, y: 0.15, z: -7.4, size: 0.7, barrel: true },
  { type: 'fire', x: -18, y: 0, z: -28.6, size: 0.7, barrel: true },
  { type: 'fire', x: 10, y: 0, z: 24.5, size: 0.7, barrel: true },
  { type: 'fire', x: 43, y: 0, z: -28.4, size: 0.7, barrel: true },
  { type: 'fire', x: 26, y: 5.2, z: -11, size: 0.7, barrel: true },
  { type: 'fire', x: 38.5, y: 5.2, z: -24.5, size: 0.7, barrel: true },
  { type: 'fire', x: -6, y: 0.3, z: -21, size: 1.0 },
  { type: 'fire', x: 38, y: 0.4, z: 5.4, size: 0.9 },
  { type: 'fire', x: -38, y: 0, z: 4, size: 1.3 },
  { type: 'fire', x: 40, y: 0, z: 46, size: 1.6 },
  { type: 'fire', x: -40, y: 0, z: -24, size: 1.6 },
  // small props
  { type: 'barrel', x: -24, z: -25.2 }, { type: 'barrel', x: -23.3, z: -25.9 }, { type: 'barrel', x: 39.6, z: -25.8 }, { type: 'barrel', x: 40.2, z: -25.0 },
  { type: 'barrel', x: 55.2, z: -28.8 }, { type: 'barrel', x: -7.2, z: 11.5 }, { type: 'barrel', x: 13.2, z: 36 },
  { type: 'hydrant', x: -4, z: 6.6 }, { type: 'hydrant', x: 30, z: -6.6 }, { type: 'hydrant', x: 22.8, z: 30 },
  { type: 'mailbox', x: -16, z: 6.7 }, { type: 'mailbox', x: 46, z: 6.7 },
  { type: 'pole', x: -3, z: 7.6 }, { type: 'pole', x: -17.5, z: -7.6 }, { type: 'pole', x: 6.5, z: -7.6 }, { type: 'pole', x: 26, z: -7.6 }, { type: 'pole', x: 46, z: -7.6 },
  { type: 'debris', x: -22, z: -7.6, s: 1.2 }, { type: 'debris', x: 6, z: -12.5, s: 1.4 }, { type: 'debris', x: -25, z: -2.5, s: 1.6 },
  { type: 'debris', x: 13.2, z: 12, s: 1.0 }, { type: 'debris', x: -6, z: 30, s: 1.2 }, { type: 'debris', x: 49, z: -19.5, s: 1.1 },
  { type: 'debris', x: 17, z: 35, s: 1.3 }, { type: 'debris', x: 50, z: 4, s: 1.0 }, { type: 'debris', x: -24, z: -27.5, s: 1.0 },
  { type: 'trash', x: -7, z: -28 }, { type: 'trash', x: -5.5, z: 18.5 }, { type: 'trash', x: 13, z: 4 }, { type: 'trash', x: 54, z: -26 }, { type: 'trash', x: 21.5, z: 15 },
  { type: 'busstop', x: 3, z: 7.3 },
];

// Neon / painted signs: (x,y,z) = point on the wall face, yaw = outward normal of the face.
export const signs = [
  sign('THE RUSTY NAIL', -18, 3.0, 8.825, PI, 6.4, 0.9, '#ff4a2a', { neon: true }),
  sign('PHARMACY', 4.5, 3.05, 8.55, PI, 5.2, 0.55, '#3aff7a', { neon: true }),
  sign('DINER', -19, 3.3, -8.55, 0, 3.8, 0.9, '#ff6ab0', { neon: true }),
  sign('THE PALACE', 36, 3.6, 5.8, PI, 10.5, 0.95, '#ffb340', { neon: true, bulbs: true }),
  sign('PALACE', 45.5, 6.0, 7.6, PI, 1.0, 4.4, '#ff3040', { neon: true, vertical: true }),
  sign('GARAGE', 23.825, 4.1, -16, -HALF, 5.0, 0.9, '#7ad0ff', { neon: true }),
  sign('STAGE DOOR', 23.825, 2.75, 31, -HALF, 1.6, 0.35, '#ffd070', { painted: true }),
  sign('PARKING', 43.5, 3.0, -8.8, 0, 2.4, 0.5, '#ffe080', { painted: true }),
  sign('NO ENTRY', 12.05, 2.2, 7.5, -HALF, 1.6, 0.6, '#ff5050', { painted: true }),
];

// Outer ruins (decor only): silhouettes beyond the playable boundary; tower = church with clock + spire.
export const outer = [
  { x: -42, z: 18, w: 14, h: 10, d: 16, mat: 'brick_dark', windows: true },
  { x: -42, z: -10, w: 12, h: 13, d: 14, mat: 'plaster', windows: true, burning: true },
  { x: -38, z: -38, w: 16, h: 6, d: 10, mat: 'brick_red' },
  { x: -20, z: 34, w: 16, h: 9, d: 12, mat: 'plaster', windows: true },
  { x: 2, z: 49, w: 8, h: 15, d: 8, mat: 'brick_dark', tower: true },
  { x: 20, z: 51, w: 20, h: 8, d: 10, mat: 'brick_dark', windows: true, burning: true },
  { x: 40, z: 46, w: 18, h: 7, d: 10, mat: 'metal_panel' },
  { x: 57, z: 24, w: 12, h: 10, d: 16, mat: 'brick_red', windows: true },
  { x: 65, z: 0, w: 12, h: 8, d: 18, mat: 'plaster', windows: true },
  { x: 65, z: -22, w: 12, h: 9, d: 14, mat: 'brick_dark', burning: true },
  { x: 34, z: -39, w: 26, h: 9, d: 10, mat: 'brick_dark', windows: true, burning: true },
  { x: 8, z: -39, w: 14, h: 6, d: 8, mat: 'brick_red' },
  { x: -18, z: -39, w: 16, h: 11, d: 8, mat: 'plaster', windows: true },
  { x: 52, z: -42, w: 5, h: 14, d: 5, mat: 'metal_rust', tank: true },
];

// Road markings: centre lines (dashed yellow), crosswalks (white), parking bays.
export const markings = {
  lanes: [{ axis: 'x', from: -31, to: 12, at: 0 }, { axis: 'x', from: 22, to: 55, at: 0 }, { axis: 'z', from: -29, to: 39, at: 18 }],
  edges: [{ axis: 'x', from: -31, to: 12, at: 4.6 }, { axis: 'x', from: -31, to: 12, at: -4.6 }, { axis: 'x', from: 22, to: 55, at: 4.6 }, { axis: 'x', from: 22, to: 55, at: -4.6 },
    { axis: 'z', from: -29, to: -6, at: 14.6 }, { axis: 'z', from: 6, to: 39, at: 14.6 }, { axis: 'z', from: -29, to: -6, at: 21.4 }, { axis: 'z', from: 6, to: 39, at: 21.4 }],
  crosswalks: [{ x: -22, z: 0, dir: 'x' }, { x: 9, z: 0, dir: 'x' }, { x: 25, z: 0, dir: 'x' }, { x: 18, z: 7.5, dir: 'z' }, { x: 18, z: -7.5, dir: 'z' }],
  bays: [{ x0: 43, x1: 55, z: -16, count: 5 }, { x0: 43, x1: 55, z: -25, count: 5 }],
};
