// "Ashford Street" - a compact destroyed American town block at night.
// Pure data. Expanded by mapbuild.js into collision boxes, nav data and visual segments.
//
// Coordinate system: x = east, z = north, y = up. Yaw 0 faces +Z.
// Wall gaps: `at` is the world coordinate along the wall axis (x for E-W walls, z for N-S walls).

const wall = (ax, az, bx, bz, h, mat, gaps = [], opts = {}) => ({ a: [ax, az], b: [bx, bz], h, t: opts.t ?? 0.35, mat, gaps, ...opts });
const win = (at, entryId, w = 1.7) => ({ at, w, type: 'window', entryId, sill: 1.0, top: 2.15 });
const dwin = (at, w = 1.6) => ({ at, w, type: 'window', sill: 0.9, top: 2.15 });          // decorative broken window (passable)
const glass = (at, w = 2.6) => ({ at, w, type: 'glass', sill: 0.7, top: 2.6 });            // storefront glass (solid)
const door = (at, doorId, w = 1.7, top = 2.25) => ({ at, w, type: 'door', doorId, top });
const hole = (at, w, top = null) => ({ at, w, type: 'hole', top });
const ehole = (at, w, entryId, top = null) => ({ at, w, type: 'hole', entryId, top });    // zombie-only passage
const box = (x, y, z, w, h, d, mat, opts = {}) => ({ x, y, z, w, h, d, yaw: 0, mat, ...opts });
const FENCE = { t: 0.08, fence: true };
const RUBBLE = { t: 1.0 };

export const MAP = {
  name: 'Ashford Street',
  bounds: { minX: -48, maxX: 48, minZ: -32, maxZ: 32 },
  cell: 0.5,
  startArea: 'street',

  areas: {
    street: { name: 'Main Street', rects: [[-24, -8, 24, 9], [-22, -22, -10, -8], [-6, -20, 8, -8], [-10, -22, -6, -8], [8, -22, 12, -8]] },
    bar: { name: 'The Rusty Nail', rects: [[-22, 9, -6, 23]] },
    shop: { name: 'Corner Store', rects: [[-2, 9, 14, 23]] },
    nalley: { name: 'North Alley', rects: [[-6, 9, -2, 24]] },
    parking: { name: 'Parking Lot', rects: [[24, -22, 44, 24], [24, -26, 30, -22]] },
    garage: { name: 'Auto Garage', rects: [[12, -22, 24, -8]] },
    balley: { name: 'Back Alley', rects: [[-24, -26, 24, -22]] },
  },

  // Ground visuals (y = 0)
  grounds: [
    { x0: -24, z0: -5, x1: 24, z1: 5, mat: 'asphalt' },           // main street
    { x0: 24, z0: -22, x1: 44, z1: 24, mat: 'asphalt_lot' },      // parking lot
    { x0: 25, z0: -26, x1: 30, z1: -22, mat: 'asphalt_lot' },     // lot pocket
    { x0: -24, z0: -26, x1: 25, z1: -22, mat: 'asphalt_old' },    // back alley
    { x0: -6, z0: 9, x1: -2, z1: 24, mat: 'asphalt_old' },        // north alley
    { x0: -10, z0: -22, x1: -6, z1: -8, mat: 'concrete' },        // west connector
    { x0: 8, z0: -22, x1: 12, z1: -8, mat: 'concrete' },          // east connector
    { x0: -6, z0: -22, x1: 8, z1: -20, mat: 'dirt' },             // house backyard (fenced, zombies only)
    { x0: -48, z0: -32, x1: 48, z1: 32, mat: 'rubble_ground', base: true },
  ],
  // Raised slabs (collision + visual). y = top height.
  floors: [
    { x0: -24, z0: 5, x1: 24, z1: 9, y: 0.15, mat: 'sidewalk' },
    { x0: -24, z0: -8, x1: 24, z1: -5, y: 0.15, mat: 'sidewalk' },
    { x0: -22, z0: 9, x1: -6, z1: 23, y: 0.15, mat: 'wood_floor' },      // bar
    { x0: -22, z0: 15, x1: -6, z1: 23, y: 3.5, mat: 'wood_floor', level: 1, area: 'bar' }, // bar upper floor (demo)
    { x0: -2, z0: 9, x1: 14, z1: 23, y: 0.15, mat: 'tile_floor' },       // shop
    { x0: -22, z0: -22, x1: -10, z1: -8, y: 0.15, mat: 'tile_checker' }, // diner
    { x0: -6, z0: -20, x1: 8, z1: -8, y: 0.15, mat: 'wood_floor' },      // house
    { x0: 12, z0: -22, x1: 24, z1: -8, y: 0.15, mat: 'concrete' },       // garage
  ],

  // Straight staircases (see mapbuild.js schema). Empty for now.
  stairs: [
    { x: -14, z: 10, yaw: 0, w: 1.4, len: 5.0, y0: 0.15, y1: 3.5, level: 1, area: 'bar', mat: 'concrete' }, // bar staircase (demo)
  ],
  // Perk vending machines + Pack-a-Punch (see mapbuild.js schema). Filled by the perk system.
  machines: [],

  walls: [
    // ---------------- BAR (x -22..-6, z 9..23) ----------------
    wall(-22, 9, -6, 9, 5.2, 'brick_dark', [glass(-19, 2.6), door(-14, 'bar_front'), glass(-9.5, 2.6)]),
    wall(-22, 9, -22, 23, 5.2, 'brick_dark', [win(13, 'bar_w1'), win(19, 'bar_w2')]),
    wall(-22, 23, -6, 23, 5.2, 'brick_dark', [win(-17, 'bar_n1'), win(-11, 'bar_n2')]),
    wall(-6, 9, -6, 23, 5.2, 'brick_dark', [door(16, 'bar_alley', 1.5)]),
    wall(-22, 15, -6, 15, 1.0, 'metal_dark', [hole(-14, 1.6), hole(-9, 1.6)], { y0: 3.5, rail: true, t: 0.08 }), // balcony railing (demo)
    // ---------------- SHOP (x -2..14, z 9..23) ----------------
    wall(-2, 9, 14, 9, 5.0, 'plaster', [glass(1.6, 3.0), door(6, 'shop_front'), glass(10.4, 3.0)]),
    wall(14, 9, 14, 23, 5.0, 'plaster', [win(13, 'shop_e1'), win(20, 'shop_e2')]),
    wall(-2, 23, 14, 23, 5.0, 'plaster', [win(3, 'shop_n1'), win(10, 'shop_n2')]),
    wall(-2, 9, -2, 23, 5.0, 'plaster', [door(16, 'shop_alley', 1.5)]),
    // ---------------- DINER ruin (x -22..-10, z -22..-8) ----------------
    wall(-22, -8, -10, -8, 4.2, 'brick_red', [dwin(-20.3, 2.0), hole(-16, 5.0, 3.3), dwin(-11.6, 2.0)], { ruined: true }),
    wall(-22, -22, -22, -8, 4.2, 'brick_red', [win(-13, 'diner_w1'), win(-18, 'diner_w2')], { ruined: true }),
    wall(-22, -22, -10, -22, 4.2, 'brick_red', [], { ruined: true }),
    wall(-10, -22, -10, -8, 4.2, 'brick_red', [hole(-15, 3.0, 3.3)], { ruined: true }),
    // ---------------- HOUSE ruin (x -6..8, z -20..-8) ----------------
    wall(-6, -8, 8, -8, 3.6, 'plaster_stained', [dwin(-4, 1.6), door(-1.5, null, 1.4, 2.2), dwin(5, 1.6)], { ruined: true }),
    wall(-6, -20, -6, -8, 3.6, 'plaster_stained', [dwin(-14, 1.4)], { ruined: true }),
    wall(8, -20, 8, -8, 3.6, 'plaster_stained', [dwin(-11, 1.4)], { ruined: true }),
    wall(-6, -20, 8, -20, 3.6, 'plaster_stained', [win(-3, 'house_s1', 1.6), win(5, 'house_s2', 1.6)], { ruined: true }),
    wall(1, -20, 1, -8, 3.6, 'wallpaper', [door(-11, null, 1.2, 2.1), door(-17, null, 1.2, 2.1)], { t: 0.2 }),
    wall(1, -14, 8, -14, 3.6, 'wallpaper', [door(4.5, null, 1.2, 2.1)], { t: 0.2 }),
    wall(-6, -22, 8, -22, 2.3, 'fence', [], FENCE),      // backyard fence to back alley
    wall(-6, -22, -6, -20, 2.3, 'fence', [], FENCE),
    wall(8, -22, 8, -20, 2.3, 'fence', [], FENCE),
    // ---------------- GARAGE (x 12..24, z -22..-8) ----------------
    wall(12, -8, 24, -8, 4.6, 'metal_panel', []),
    wall(12, -22, 12, -8, 4.6, 'metal_panel', [door(-15, 'garage_west', 1.6)]),
    wall(12, -22, 24, -22, 4.6, 'metal_panel', []),
    wall(24, -22, 24, -8, 4.6, 'metal_panel', [door(-15, 'garage_east', 3.6, 3.1)]),
    // ---------------- Street boundaries ----------------
    wall(-24, -26, -24, 9, 3.0, 'rubble_wall', [ehole(-2, 2.0, 'street_w1'), ehole(2, 2.0, 'street_w2'), ehole(-24, 2.0, 'balley_w1')], RUBBLE),
    wall(-24, -8, -22, -8, 3.0, 'rubble_wall', [], RUBBLE),      // seals strip west of diner
    wall(-24, -22, -22, -22, 3.0, 'rubble_wall', [], RUBBLE),
    wall(-24, 8, -22, 8, 3.0, 'rubble_wall', [], RUBBLE),        // NW corner
    wall(24, -8, 24, -5, 3.0, 'rubble_wall', [], RUBBLE),
    wall(24, 5, 24, 8, 3.0, 'rubble_wall', [], RUBBLE),
    wall(-6, 8.5, -2, 8.5, 3.2, 'fence', [], { t: 0.1, fence: true }),  // north alley south end (chained gate)
    wall(-6, 24, -2, 24, 3.0, 'rubble_wall', [ehole(-4.8, 1.3, 'nalley_n1'), ehole(-3.2, 1.3, 'nalley_n2')], RUBBLE),
    // collapsed building facade (x 14..24, z 8..24) with a zombie hole
    wall(14, 8.6, 24, 8.6, 4.0, 'brick_dark', [ehole(19, 2.2, 'facade_hole')], { t: 1.2, ruined: true }),
    wall(24, 8, 24, 24, 4.0, 'brick_dark', [], { t: 1.2, ruined: true }),
    // ---------------- Parking lot fences ----------------
    wall(44, -22, 44, 24, 2.4, 'fence', [ehole(-15, 2, 'lot_e1'), ehole(-2, 2, 'lot_e2'), ehole(10, 2, 'lot_e3'), ehole(20, 2, 'lot_e4')], FENCE),
    wall(24, 24, 44, 24, 2.4, 'fence', [ehole(35, 2, 'lot_n1')], FENCE),
    wall(30, -22, 44, -22, 2.4, 'fence', [ehole(33, 2, 'lot_s1')], FENCE),
    wall(30, -26, 30, -22, 2.6, 'rubble_wall', [], { t: 0.6 }),
    // ---------------- Back alley south boundary ----------------
    wall(-24, -26, 30, -26, 2.6, 'rubble_wall', [ehole(-18, 2, 'balley_s1'), ehole(-4, 2, 'balley_s2'), ehole(10, 2, 'balley_s3'), ehole(20, 2, 'balley_s4')], RUBBLE),
  ],

  // Solid boxes: counters, shelves, rubble, etc. (vault: zombies may cross)
  boxes: [
    // bar counter + back shelf + tables
    box(-13.5, 0.15, 19.3, 11, 1.05, 1.2, 'wood_dark', { vault: true, kind: 'counter' }),
    box(-13.5, 0.15, 22.4, 11, 2.4, 0.45, 'wood_dark', { kind: 'shelf' }),
    box(-18, 0.15, 13, 1.2, 0.8, 1.2, 'wood_dark', { vault: true, kind: 'table' }),
    box(-10, 0.15, 13, 1.2, 0.8, 1.2, 'wood_dark', { vault: true, kind: 'table' }),
    // shop shelves (aisles)
    box(2.5, 0.15, 15, 1.1, 1.9, 6, 'metal_shelf', { kind: 'shelf' }),
    box(9.5, 0.15, 15, 1.1, 1.9, 6, 'metal_shelf', { kind: 'shelf' }),
    box(6, 0.15, 21.4, 5, 1.0, 1.0, 'wood_dark', { vault: true, kind: 'counter' }),
    box(12.8, 0.15, 21.5, 2.0, 2.2, 1.0, 'metal_shelf', { kind: 'fridge' }),
    // diner
    box(-16, 0.15, -20.2, 8, 1.0, 1.1, 'metal_counter', { vault: true, kind: 'counter' }),
    box(-20.5, 0.15, -9.8, 2.2, 0.8, 1.0, 'wood_dark', { vault: true, kind: 'booth' }),
    box(-11.8, 0.15, -9.8, 2.2, 0.8, 1.0, 'wood_dark', { vault: true, kind: 'booth' }),
    box(-14, 0.15, -14.5, 1.1, 0.8, 1.1, 'wood_dark', { vault: true, kind: 'table' }),
    box(-19, 0.15, -15.5, 1.5, 1.1, 1.5, 'rubble', { vault: true, kind: 'rubble' }),
    // house
    box(-3.5, 0.15, -11, 2.0, 0.8, 0.9, 'fabric', { vault: true, kind: 'couch' }),
    box(5, 0.15, -10, 2.4, 0.9, 0.7, 'wood_dark', { vault: true, kind: 'counter' }),
    box(4.5, 0.15, -18.5, 2.0, 0.6, 1.6, 'fabric', { vault: true, kind: 'bed' }),
    // garage
    box(18, 0.15, -21.3, 6, 1.0, 1.0, 'metal_counter', { vault: true, kind: 'workbench' }),
    box(22.5, 0.15, -10, 2.0, 2.4, 1.0, 'metal_shelf', { kind: 'shelf' }),
    // rubble corners of the street
    box(-23, 0, 6.5, 2.0, 1.2, 3.0, 'rubble', { vault: true, kind: 'rubble' }),
    box(23, 0, -6.5, 2.0, 1.0, 3.0, 'rubble', { vault: true, kind: 'rubble' }),
    // sandbags in the street west end
    box(-21, 0, 0, 1.2, 0.9, 3.5, 'sandbag', { vault: true, kind: 'sandbags' }),
    // bus stop bench (north sidewalk)
    box(12, 0.15, 7.3, 4, 0.45, 0.5, 'metal_dark', { vault: true, kind: 'bench' }),
    // parking lot barriers
    box(34, 0, 12, 0.5, 0.6, 8, 'concrete', { vault: true, kind: 'barrier' }),
    box(34, 0, -8, 0.5, 0.6, 8, 'concrete', { vault: true, kind: 'barrier' }),
    // dumpsters
    box(-14, 0, -24.5, 2.2, 1.5, 1.4, 'metal_green', { kind: 'dumpster' }),
    box(15, 0, -24.6, 2.2, 1.5, 1.4, 'metal_green', { kind: 'dumpster' }),
    box(-4, 0.0, 20, 1.6, 1.4, 2.2, 'metal_green', { kind: 'dumpster' }),
  ],

  doors: [
    { id: 'bar_front', cost: 750, x: -14, y: 0.15, z: 9, w: 1.7, h: 2.25, d: 0.4, yaw: 0, kind: 'door', label: 'The Rusty Nail', areas: ['street', 'bar'] },
    { id: 'shop_front', cost: 750, x: 6, y: 0.15, z: 9, w: 1.7, h: 2.25, d: 0.4, yaw: 0, kind: 'door', label: 'Corner Store', areas: ['street', 'shop'] },
    { id: 'bar_alley', cost: 1000, x: -6, y: 0.15, z: 16, w: 0.4, h: 2.25, d: 1.5, yaw: 0, kind: 'door', label: 'North Alley', areas: ['bar', 'nalley'] },
    { id: 'shop_alley', cost: 1000, x: -2, y: 0.15, z: 16, w: 0.4, h: 2.25, d: 1.5, yaw: 0, kind: 'door', label: 'North Alley', areas: ['shop', 'nalley'] },
    { id: 'east_gate', cost: 1000, x: 24.4, y: 0, z: 0, w: 0.8, h: 3.0, d: 10, yaw: 0, kind: 'gate', label: 'Parking Lot', areas: ['street', 'parking'] },
    { id: 'garage_east', cost: 750, x: 24, y: 0.15, z: -15, w: 0.4, h: 3.1, d: 3.6, yaw: 0, kind: 'rollup', label: 'Auto Garage', areas: ['parking', 'garage'] },
    { id: 'garage_west', cost: 1000, x: 12, y: 0.15, z: -15, w: 0.4, h: 2.25, d: 1.6, yaw: 0, kind: 'door', label: 'Auto Garage', areas: ['street', 'garage'] },
    { id: 'alley_gate_w', cost: 1000, x: -8, y: 0, z: -22, w: 4, h: 2.6, d: 0.5, yaw: 0, kind: 'gate', label: 'Back Alley', areas: ['street', 'balley'] },
    { id: 'alley_gate_e', cost: 1000, x: 10, y: 0, z: -22, w: 4, h: 2.6, d: 0.5, yaw: 0, kind: 'gate', label: 'Back Alley', areas: ['street', 'balley'] },
    { id: 'alley_lot', cost: 750, x: 24.5, y: 0, z: -24, w: 1.0, h: 2.6, d: 4, yaw: 0, kind: 'gate', label: 'Parking Lot', areas: ['balley', 'parking'] },
  ],

  // Zombie entry points. outside = spawn position (unreachable), inside = first nav position.
  entries: [
    // street area
    { id: 'diner_w1', type: 'window', area: 'street', outside: [-23.4, 0, -13], inside: [-20.6, 0.15, -13], boards: 6, yaw: Math.PI / 2 },
    { id: 'diner_w2', type: 'window', area: 'street', outside: [-23.4, 0, -18], inside: [-20.6, 0.15, -18], boards: 6, yaw: Math.PI / 2 },
    { id: 'house_s1', type: 'window', area: 'street', outside: [-3, 0, -21.2], inside: [-3, 0.15, -18.6], boards: 6, yaw: 0 },
    { id: 'house_s2', type: 'window', area: 'street', outside: [5, 0, -21.2], inside: [5, 0.15, -18.6], boards: 6, yaw: 0 },
    { id: 'house_hatch', type: 'manhole', area: 'street', outside: [-3.5, -2.2, -16], inside: [-3.5, 0.15, -16], boards: 0, yaw: 0 },
    { id: 'street_w1', type: 'rubble', area: 'street', outside: [-26.5, 0, -2], inside: [-22.4, 0, -2], boards: 0, yaw: Math.PI / 2 },
    { id: 'street_w2', type: 'rubble', area: 'street', outside: [-26.5, 0, 2], inside: [-22.4, 0, 2], boards: 0, yaw: Math.PI / 2 },
    { id: 'street_manhole', type: 'manhole', area: 'street', outside: [9, -2.2, 0], inside: [9, 0, 0], boards: 0, yaw: 0 },
    { id: 'facade_hole', type: 'hole', area: 'street', outside: [19, 0, 11.5], inside: [19, 0.15, 7.0], boards: 0, yaw: Math.PI },
    // bar
    { id: 'bar_w1', type: 'window', area: 'bar', outside: [-23.4, 0, 13], inside: [-20.6, 0.15, 13], boards: 6, yaw: Math.PI / 2 },
    { id: 'bar_w2', type: 'window', area: 'bar', outside: [-23.4, 0, 19], inside: [-20.6, 0.15, 19], boards: 6, yaw: Math.PI / 2 },
    { id: 'bar_n1', type: 'window', area: 'bar', outside: [-17, 0, 24.4], inside: [-17, 0.15, 21.6], boards: 6, yaw: Math.PI },
    { id: 'bar_n2', type: 'window', area: 'bar', outside: [-11, 0, 24.4], inside: [-11, 0.15, 21.6], boards: 6, yaw: Math.PI },
    // shop
    { id: 'shop_e1', type: 'window', area: 'shop', outside: [15.4, 0, 13], inside: [12.6, 0.15, 13], boards: 6, yaw: -Math.PI / 2 },
    { id: 'shop_e2', type: 'window', area: 'shop', outside: [15.4, 0, 20], inside: [12.6, 0.15, 20], boards: 6, yaw: -Math.PI / 2 },
    { id: 'shop_n1', type: 'window', area: 'shop', outside: [3, 0, 24.4], inside: [3, 0.15, 21.6], boards: 6, yaw: Math.PI },
    { id: 'shop_n2', type: 'window', area: 'shop', outside: [10, 0, 24.4], inside: [10, 0.15, 21.6], boards: 6, yaw: Math.PI },
    // north alley
    { id: 'nalley_n1', type: 'rubble', area: 'nalley', outside: [-4.8, 0, 26.5], inside: [-4.8, 0, 22.8], boards: 0, yaw: Math.PI },
    { id: 'nalley_n2', type: 'rubble', area: 'nalley', outside: [-3.2, 0, 26.5], inside: [-3.2, 0, 22.8], boards: 0, yaw: Math.PI },
    // parking lot
    { id: 'lot_e1', type: 'hole', area: 'parking', outside: [46, 0, -15], inside: [42.6, 0, -15], boards: 0, yaw: -Math.PI / 2 },
    { id: 'lot_e2', type: 'hole', area: 'parking', outside: [46, 0, -2], inside: [42.6, 0, -2], boards: 0, yaw: -Math.PI / 2 },
    { id: 'lot_e3', type: 'hole', area: 'parking', outside: [46, 0, 10], inside: [42.6, 0, 10], boards: 0, yaw: -Math.PI / 2 },
    { id: 'lot_e4', type: 'hole', area: 'parking', outside: [46, 0, 20], inside: [42.6, 0, 20], boards: 0, yaw: -Math.PI / 2 },
    { id: 'lot_n1', type: 'hole', area: 'parking', outside: [35, 0, 26], inside: [35, 0, 22.6], boards: 0, yaw: Math.PI },
    { id: 'lot_s1', type: 'hole', area: 'parking', outside: [33, 0, -24], inside: [33, 0, -20.6], boards: 0, yaw: 0 },
    { id: 'lot_manhole', type: 'manhole', area: 'parking', outside: [35, -2.2, 0], inside: [35, 0, 0], boards: 0, yaw: 0 },
    // garage
    { id: 'garage_pit1', type: 'manhole', area: 'garage', outside: [16, -2.2, -12], inside: [16, 0.15, -12], boards: 0, yaw: 0 },
    { id: 'garage_pit2', type: 'manhole', area: 'garage', outside: [20, -2.2, -18], inside: [20, 0.15, -18], boards: 0, yaw: 0 },
    // back alley
    { id: 'balley_s1', type: 'rubble', area: 'balley', outside: [-18, 0, -28.5], inside: [-18, 0, -24.6], boards: 0, yaw: 0 },
    { id: 'balley_s2', type: 'rubble', area: 'balley', outside: [-4, 0, -28.5], inside: [-4, 0, -24.6], boards: 0, yaw: 0 },
    { id: 'balley_s3', type: 'rubble', area: 'balley', outside: [10, 0, -28.5], inside: [10, 0, -24.6], boards: 0, yaw: 0 },
    { id: 'balley_s4', type: 'rubble', area: 'balley', outside: [20, 0, -28.5], inside: [20, 0, -24.6], boards: 0, yaw: 0 },
    { id: 'balley_w1', type: 'rubble', area: 'balley', outside: [-27, 0, -24], inside: [-22.4, 0, -24], boards: 0, yaw: Math.PI / 2 },
  ],

  boxLocations: [
    { x: -20.2, y: 0.15, z: -11.5, yaw: Math.PI / 2, area: 'street' },
    { x: -19.5, y: 0.15, z: 11.5, yaw: Math.PI / 2, area: 'bar' },
    { x: 0.2, y: 0.15, z: 21.6, yaw: Math.PI, area: 'shop' },
    { x: 40.5, y: 0, z: 21.8, yaw: -Math.PI * 0.75, area: 'parking' },
    { x: -21.5, y: 0, z: -24, yaw: Math.PI / 2, area: 'balley' },
    { x: 22.6, y: 0.15, z: -19.5, yaw: -Math.PI / 2, area: 'garage' },
  ],

  wallBuys: [
    { weapon: 'warden_p9', cost: 300, x: 5.5, y: 1.5, z: -7.8, yaw: 0, area: 'street' },
    { weapon: 'gatekeeper_12', cost: 500, x: -14.5, y: 1.5, z: -21.8, yaw: 0, area: 'street' },
    { weapon: 'vesper_smg', cost: 750, x: -5.8, y: 1.5, z: -11.5, yaw: Math.PI / 2, area: 'street' },
    { weapon: 'kestrel_ar', cost: 1200, x: -7.1, y: 1.5, z: 9.2, yaw: 0, area: 'bar' },
    { weapon: 'bulwark_br', cost: 1300, x: 12.9, y: 1.5, z: 9.2, yaw: 0, area: 'shop' },
    { weapon: 'sentinel_dmr', cost: 1000, x: 24.2, y: 1.5, z: -19.5, yaw: Math.PI / 2, area: 'parking' },
    { weapon: 'trident_b3', cost: 1100, x: 18, y: 1.5, z: -8.2, yaw: Math.PI, area: 'garage' },
    { weapon: 'ironhorse_44', cost: 900, x: -16, y: 1.5, z: -22.2, yaw: Math.PI, area: 'balley' },
  ],

  playerSpawns: [
    { x: -2.5, y: 0, z: 0.5, yaw: 0 },
    { x: 2.5, y: 0, z: 0.5, yaw: 0 },
    { x: -2.5, y: 0, z: -2.5, yaw: 0 },
    { x: 2.5, y: 0, z: -2.5, yaw: 0 },
    { x: 0, y: 0, z: 2.5, yaw: 0 },
    { x: -5, y: 0, z: -1, yaw: 0 },
    { x: 5, y: 0, z: -1, yaw: 0 },
    { x: 0, y: 0, z: -4, yaw: 0 },
  ],

  props: [
    // vehicles (solid)
    { type: 'car', x: -13, z: 2.6, yaw: 0.18, color: '#7a2a24', wrecked: true },
    { type: 'car', x: 7.5, z: -2.4, yaw: -0.25, color: '#3a4a5a', wrecked: true, burning: true },
    { type: 'van', x: -9, z: -3.2, yaw: 1.35, color: '#c9c3b5', wrecked: true },
    { type: 'car', x: 17, z: 2.2, yaw: 0.08, color: '#2b5c3f', wrecked: false },
    { type: 'car', x: 30, z: 16, yaw: 0.05, color: '#8c8c8c', wrecked: false },
    { type: 'car', x: 30, z: 10, yaw: -0.05, color: '#3b3b6b', wrecked: true },
    { type: 'car', x: 38, z: 16, yaw: 0.1, color: '#a34b2c', wrecked: true, burning: true },
    { type: 'van', x: 38, z: 4, yaw: 1.57, color: '#e0d8c8', wrecked: false },
    { type: 'car', x: 30, z: -14, yaw: 0.02, color: '#6a6a3a', wrecked: true },
    { type: 'car', x: 38, z: -12, yaw: -1.5, color: '#3a3a3a', wrecked: false },
    { type: 'car', x: 15.5, z: -19, yaw: 0, color: '#9b2f2f', wrecked: false, indoor: true },
    { type: 'car', x: 4, z: -24.2, yaw: 1.5, color: '#4a5a6a', wrecked: true, burning: true },
    // outer decor vehicles
    { type: 'car', x: -30, z: 4, yaw: 0.6, color: '#6a4a2a', wrecked: true, burning: true, decor: true },
    { type: 'bus', x: 52, z: 2, yaw: 0.3, color: '#c9a640', wrecked: true, decor: true },
    // street lights (warm point lights)
    { type: 'streetlight', x: -18, z: 6.6, yaw: Math.PI },
    { type: 'streetlight', x: -6, z: 6.6, yaw: Math.PI },
    { type: 'streetlight', x: 6, z: 6.6, yaw: Math.PI },
    { type: 'streetlight', x: 18, z: 6.6, yaw: Math.PI },
    { type: 'streetlight', x: -12, z: -6.6, yaw: 0 },
    { type: 'streetlight', x: 0, z: -6.6, yaw: 0 },
    { type: 'streetlight', x: 12, z: -6.6, yaw: 0 },
    { type: 'streetlight', x: 33, z: 4, yaw: 0 },
    { type: 'streetlight', x: 33, z: -18, yaw: 0 },
    { type: 'streetlight', x: 41, z: 20, yaw: 0 },
    // interior lamps
    { type: 'lamp', x: -17, y: 3.9, z: 13, color: '#ffb070', intensity: 2.4, range: 15 },
    { type: 'lamp', x: -10, y: 3.9, z: 19, color: '#ffc890', intensity: 2.2, range: 15, flicker: true },
    { type: 'lamp', x: 2, y: 3.9, z: 13, color: '#cfe8ff', intensity: 2.2, range: 15, flicker: true },
    { type: 'lamp', x: 10, y: 3.9, z: 19, color: '#cfe8ff', intensity: 2.2, range: 15 },
    { type: 'lamp', x: -16, y: 3.6, z: -15, color: '#ffc080', intensity: 2.0, range: 15, flicker: true },
    { type: 'lamp', x: -2, y: 3.2, z: -12, color: '#ffd0a0', intensity: 1.8, range: 13 },
    { type: 'lamp', x: 4.5, y: 3.2, z: -17, color: '#ffd0a0', intensity: 1.5, range: 12, flicker: true },
    { type: 'lamp', x: 18, y: 4.1, z: -15, color: '#d0f0ff', intensity: 2.4, range: 16 },
    { type: 'lamp', x: -4, y: 3.5, z: 16, color: '#ffb070', intensity: 1.6, range: 11, flicker: true },
    { type: 'lamp', x: 0, y: 3.2, z: -24, color: '#ffb070', intensity: 1.8, range: 15 },
    { type: 'lamp', x: -18, y: 3.2, z: -24, color: '#ffb070', intensity: 1.8, range: 15 },
    { type: 'lamp', x: 18, y: 3.2, z: -24, color: '#ffb070', intensity: 1.6, range: 15, flicker: true },
    { type: 'lamp', x: -8, y: 3.4, z: -15, color: '#ffd0a0', intensity: 1.4, range: 12 },
    { type: 'lamp', x: 10, y: 3.4, z: -15, color: '#ffd0a0', intensity: 1.4, range: 12 },
    // fires (particles + flicker light)
    { type: 'fire', x: -20, y: 0.15, z: 6.8, size: 0.7, barrel: true },
    { type: 'fire', x: -12.5, y: 0.15, z: -19, size: 0.8 },
    { type: 'fire', x: 19, y: 0.2, z: 10.5, size: 1.4 },
    { type: 'fire', x: -30, y: 0, z: 4, size: 1.3 },
    { type: 'fire', x: 35, y: 0, z: 30, size: 1.5 },
    { type: 'fire', x: -35, y: 0, z: -20, size: 1.6 },
    { type: 'fire', x: -14, y: 1.5, z: -24.5, size: 0.7 },
    // small props
    { type: 'barrel', x: -19, z: -24.8 }, { type: 'barrel', x: -20, z: -25 }, { type: 'barrel', x: 22, z: -25 },
    { type: 'barrel', x: -3, z: 10.5 }, { type: 'barrel', x: 42, z: -20 }, { type: 'barrel', x: 20.5, z: 6.2 },
    { type: 'hydrant', x: -9, z: 5.6 }, { type: 'hydrant', x: 21, z: -5.6 },
    { type: 'mailbox', x: 2, z: 5.7 }, { type: 'mailbox', x: -16, z: -5.7 },
    { type: 'pole', x: -20, z: -6.9 }, { type: 'pole', x: 20, z: 6.9 }, { type: 'pole', x: 0, z: 6.9 }, { type: 'pole', x: -20, z: 6.9 },
    { type: 'pole', x: 20, z: -6.9 }, { type: 'pole', x: 0, z: -6.9 },
    { type: 'debris', x: -16, z: -8.5, s: 1.6 }, { type: 'debris', x: 19, z: 7.5, s: 1.4 }, { type: 'debris', x: -23, z: 0, s: 2.4 },
    { type: 'debris', x: 1, z: -8.6, s: 0.8 }, { type: 'debris', x: -8, z: -18, s: 1.0 }, { type: 'debris', x: 10, z: -19, s: 1.0 },
    { type: 'debris', x: -4, z: 23.5, s: 1.5 }, { type: 'debris', x: 40, z: -18, s: 1.1 }, { type: 'debris', x: 36, z: 21, s: 1.2 },
    { type: 'trash', x: -7, z: -24 }, { type: 'trash', x: 12, z: -24.8 }, { type: 'trash', x: -5, z: 18 }, { type: 'trash', x: 16, z: 5.4 },
    { type: 'busstop', x: 12, z: 7.2 },
  ],

  // Outer ruins (decor only): big blocky silhouettes beyond the playable boundary
  outer: [
    { x: -36, z: 16, w: 14, h: 9, d: 16, mat: 'brick_dark', windows: true },
    { x: -38, z: -8, w: 12, h: 12, d: 14, mat: 'plaster', windows: true, burning: true },
    { x: -34, z: -28, w: 16, h: 6, d: 10, mat: 'brick_red' },
    { x: 8, z: 32, w: 22, h: 8, d: 12, mat: 'brick_dark', windows: true },
    { x: -14, z: 31, w: 14, h: 11, d: 10, mat: 'plaster', windows: true, burning: true },
    { x: 34, z: 33, w: 18, h: 7, d: 10, mat: 'metal_panel' },
    { x: 54, z: 14, w: 12, h: 10, d: 18, mat: 'brick_red', windows: true },
    { x: 54, z: -14, w: 12, h: 8, d: 16, mat: 'plaster' },
    { x: 20, z: -34, w: 26, h: 9, d: 10, mat: 'brick_dark', windows: true, burning: true },
    { x: -8, z: -33, w: 14, h: 6, d: 8, mat: 'brick_red' },
  ],
};
