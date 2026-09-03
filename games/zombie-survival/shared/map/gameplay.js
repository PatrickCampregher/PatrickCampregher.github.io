// Gameplay data: buyable doors, zombie entries, mystery box spots, wall buys, perk machines, player spawns.
import { entry, winEntry, manhole, dropEntry, perk, PI, HALF } from './helpers.js';

const D = (id, cost, x, y, z, w, h, d, kind, label, areas) => ({ id, cost, x, y, z, w, h, d, yaw: 0, kind, label, areas });

// Door-cost progression: 750 (first buildings) -> 1000 (alleys, avenue, lots) -> 1250 (theatre) -> 1500 (stage door).
export const doors = [
  D('bar_front', 750, -18, 0, 9, 2.0, 2.4, 0.4, 'door', 'The Rusty Nail', ['street', 'bar']),
  D('pharm_front', 750, 4.5, 0, 9, 2.0, 2.4, 0.4, 'door', 'Pharmacy', ['street', 'pharmacy']),
  D('diner_front', 750, -20.5, 0, -9, 2.0, 2.4, 0.4, 'door', 'Diner', ['street', 'diner']),
  D('garage_side', 750, 41, 0, -22, 0.4, 2.3, 1.6, 'door', 'Auto Garage', ['garage', 'parking']),
  D('alley_gate', 1000, -6, 0, 9, 3.6, 3.0, 0.4, 'gate', 'North Alley', ['street', 'plaza']),
  D('bar_back', 1000, -8, 0, 21, 0.4, 2.3, 1.6, 'door', 'Back Door', ['bar', 'plaza']),
  D('diner_back', 1000, -14, 0, -24, 1.6, 2.3, 0.4, 'door', 'Back Lot', ['diner', 'backlot']),
  D('backlot_gate', 1000, 2, 0, -9, 2.4, 2.6, 0.5, 'gate', 'Back Lot', ['street', 'backlot']),
  D('east_barricade', 1000, 12, 0, 0, 0.5, 3.0, 12, 'gate', 'Foundry Avenue', ['street', 'xstreet']),
  D('backlot_east', 1000, 12, 0, -27, 0.4, 2.6, 3.0, 'gate', 'Foundry Avenue', ['backlot', 'xstreet']),
  D('plaza_east', 1000, 12, 0, 30, 0.4, 2.6, 3.0, 'gate', 'Foundry Avenue', ['plaza', 'xstreet']),
  D('lot_gate', 1000, 47, 0, -9, 4.0, 2.6, 0.4, 'gate', 'Parking Lot', ['xstreet', 'parking']),
  D('garage_roll', 1000, 24, 0, -16, 0.4, 3.4, 3.6, 'rollup', 'Auto Garage', ['xstreet', 'garage']),
  D('theatre_main', 1250, 36, 0, 9, 2.6, 3.0, 0.4, 'door', 'The Palace', ['xstreet', 'theatre']),
  D('stage_door', 1500, 24, 0, 31, 0.4, 2.3, 1.6, 'door', 'Stage Door', ['xstreet', 'theatre']),
];

// Zombie entries: outside = spawn (unreachable for players), inside = first nav position (y = floor height).
export const entries = [
  // Main Street (start)
  entry('street_w1', 'rubble', 'street', [-33.5, 0, -2.5], [-30.4, 0, -2.5], HALF),
  entry('street_w2', 'rubble', 'street', [-33.5, 0, 3], [-30.4, 0, 3], HALF),
  entry('street_nw', 'rubble', 'street', [-31, 0, 10.6], [-31, 0.15, 7.4], PI),
  entry('street_sw', 'rubble', 'street', [-31, 0, -10.6], [-31, 0.15, -7.4], 0),
  manhole('street_mh', 'street', 5, -3.8),
  // The Rusty Nail (ground + upstairs)
  winEntry('bar_w1', 'bar', [-29.4, 0, 13], [-25.6, 0.15, 13], HALF),
  winEntry('bar_w2', 'bar', [-29.4, 0, 19], [-25.6, 0.15, 19], HALF),
  winEntry('bar_n1', 'bar', [-11, 0, 25.4], [-11, 0.15, 22.6], PI),
  winEntry('bar_up_w', 'bar', [-28.4, 3.6, 21], [-25.6, 3.6, 21], HALF),
  winEntry('bar_up_n', 'bar', [-13, 3.6, 25.4], [-13, 3.6, 22.6], PI),
  // Pharmacy
  winEntry('pharm_n1', 'pharmacy', [-1, 0, 20.4], [-1, 0.15, 17.6], PI),
  winEntry('pharm_n2', 'pharmacy', [10, 0, 20.4], [10, 0.15, 17.6], PI),
  manhole('pharm_mh', 'pharmacy', 2, 11, 0.15),
  dropEntry('pharm_drop', 'pharmacy', 2, 15, 0.15, 3.3),
  // Plaza
  entry('plaza_n1', 'rubble', 'plaza', [-4, 0, 41.4], [-4, 0, 37.6], PI),
  entry('plaza_n2', 'rubble', 'plaza', [9, 0, 41.4], [9, 0, 37.6], PI),
  entry('plaza_w1', 'rubble', 'plaza', [-9.9, 0, 32], [-6.6, 0, 32], HALF),
  manhole('plaza_mh', 'plaza', 0, 24.5),
  // Diner
  winEntry('diner_w1', 'diner', [-30.4, 0, -13], [-26.6, 0.15, -13], HALF),
  winEntry('diner_w2', 'diner', [-30.4, 0, -19], [-26.6, 0.15, -19], HALF),
  manhole('diner_mh', 'diner', -19, -17, 0.15),
  dropEntry('diner_drop', 'diner', -22, -15, 0.15, 3.9),
  // Back lot
  entry('balley_s1', 'rubble', 'backlot', [-20, 0, -31.6], [-20, 0, -28.4], 0),
  entry('balley_s2', 'rubble', 'backlot', [-6, 0, -31.6], [-6, 0, -28.4], 0),
  entry('balley_s3', 'rubble', 'backlot', [6, 0, -31.6], [6, 0, -28.4], 0),
  entry('balley_w1', 'rubble', 'backlot', [-30, 0, -27], [-26.4, 0, -27], HALF),
  manhole('ruins_mh', 'backlot', -4, -18),
  // Foundry Avenue + Main Street east
  entry('x_e1', 'rubble', 'xstreet', [57.5, 0, -3], [54.4, 0, -3], -HALF),
  entry('x_e2', 'rubble', 'xstreet', [57.5, 0, 4], [54.4, 0, 4], -HALF),
  entry('x_n1', 'rubble', 'xstreet', [17, 0, 41.6], [17, 0, 38.4], PI),
  entry('x_s1', 'rubble', 'xstreet', [18, 0, -31.6], [18, 0, -28.4], 0),
  manhole('x_mh', 'xstreet', 20.5, -3),
  // Auto garage
  manhole('garage_pit1', 'garage', 27.5, -21, 0.15),
  manhole('garage_pit2', 'garage', 27.5, -13, 0.15),
  entry('garage_s1', 'hole', 'garage', [26.5, 0, -28.6], [26.5, 0.15, -25.4], 0),
  entry('garage_s2', 'hole', 'garage', [38.5, 0, -28.6], [38.5, 0.15, -25.4], 0),
  // Parking lot (+ garage roof, which belongs to the lot via the fire escape)
  entry('lot_e1', 'hole', 'parking', [57.5, 0, -24], [54.4, 0, -24], -HALF),
  entry('lot_e2', 'hole', 'parking', [57.5, 0, -14], [54.4, 0, -14], -HALF),
  entry('lot_s1', 'hole', 'parking', [47, 0, -31.6], [47, 0, -28.4], 0),
  entry('lot_s2', 'hole', 'parking', [53, 0, -31.6], [53, 0, -28.4], 0),
  manhole('lot_mh', 'parking', 49.5, -21.5),
  entry('roof_s1', 'hole', 'parking', [34, 5.2, -28.6], [34, 5.2, -25.0], 0),
  // The Palace
  winEntry('th_e1', 'theatre', [49.4, 0, 22], [46.6, 0.15, 22], -HALF),
  winEntry('th_e2', 'theatre', [49.4, 0, 27], [46.6, 0.15, 27], -HALF),
  winEntry('th_mezz', 'theatre', [49.4, 3.6, 17], [46.6, 3.6, 17], -HALF),
  entry('th_n1', 'hole', 'theatre', [30, 0, 35.6], [30, 0.4, 32.6], PI),
  manhole('th_mh', 'theatre', 36, 16.5, 0.15),
];

export const boxLocations = [
  { x: -28.8, y: 0.15, z: 7.5, yaw: HALF, area: 'street' },
  { x: -25.5, y: 3.6, z: 11, yaw: HALF, area: 'bar' },          // upstairs
  { x: 10.9, y: 0.15, z: 10.4, yaw: -HALF, area: 'pharmacy' },
  { x: -6.6, y: 0, z: 38, yaw: HALF, area: 'plaza' },
  { x: -25.5, y: 0, z: -28.6, yaw: HALF, area: 'backlot' },
  { x: 39.9, y: 0.15, z: -12, yaw: -HALF, area: 'garage' },
  { x: 26.3, y: 3.6, z: 17.8, yaw: HALF, area: 'theatre' },     // mezzanine
  { x: 54.8, y: 0, z: -11, yaw: -HALF, area: 'parking' },
];

// Wall buys: (x,y,z) on the wall face, yaw = outward normal of that face.
export const wallBuys = [
  { weapon: 'warden_p9', cost: 300, x: -13.2, y: 1.5, z: -8.825, yaw: 0, area: 'street' },
  { weapon: 'gatekeeper_12', cost: 500, x: -26.825, y: 1.5, z: 15.5, yaw: HALF, area: 'bar' },
  { weapon: 'vesper_smg', cost: 750, x: -10.175, y: 1.5, z: -15, yaw: -HALF, area: 'diner' },
  { weapon: 'ironhorse_44', cost: 900, x: 11.825, y: 1.5, z: 15.5, yaw: -HALF, area: 'pharmacy' },
  { weapon: 'sentinel_dmr', cost: 1000, x: -22.5, y: 5.1, z: 8.825, yaw: PI, area: 'bar' },      // balcony (upstairs)
  { weapon: 'trident_b3', cost: 1100, x: -9.825, y: 1.5, z: -20, yaw: HALF, area: 'backlot' },
  { weapon: 'kestrel_ar', cost: 1200, x: -7.5, y: 1.5, z: 28, yaw: HALF, area: 'plaza' },
  { weapon: 'bulwark_br', cost: 1300, x: 34, y: 1.5, z: -9.175, yaw: PI, area: 'garage' },
];

// Perk machines (1.1 x 2.1 x 0.85, back against a wall, yaw = facing) and Pack-a-Punch (2.6 x 2.3 x 1.7).
export const machines = [
  perk('revive', -10, 0.15, 8.38, PI, 'street'),      // sidewalk in front of the bar, next to the start
  perk('jugg', 4, 0, 39.05, PI, 'plaza'),             // plaza, against the north wall
  perk('speed', -27.38, 0.15, -16, HALF, 'diner'),    // diner, west wall between the windows
  perk('dtap', 31, 5.2, -14.55, PI, 'parking'),       // garage roof, on the stairhead
  { type: 'pap', x: 36, y: 0.4, z: 32.955, yaw: PI, area: 'theatre' },   // theatre stage, centre back
];

export const playerSpawns = [
  { x: -2.5, y: 0, z: 0.5, yaw: 0 }, { x: 2.5, y: 0, z: 0.5, yaw: 0 },
  { x: -2.5, y: 0, z: -2.5, yaw: 0 }, { x: 2.5, y: 0, z: -2.5, yaw: 0 },
  { x: 0, y: 0, z: 2.5, yaw: 0 }, { x: -5, y: 0, z: -1, yaw: 0 },
  { x: 5, y: 0, z: -1, yaw: 0 }, { x: 0, y: 0, z: -4.2, yaw: 0 },
];
