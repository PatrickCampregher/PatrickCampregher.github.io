// North-west block: THE RUSTY NAIL (bar, two storeys, balcony, plank bridge) and the PHARMACY (walkable roof).
import { bldg, wall, win, dwin, glass, door, hole, box, rail, parapet } from './helpers.js';

const T = 0.35, E = T / 2 + 0.02;

// ---------------- THE RUSTY NAIL  (x -27..-8, z 9..24; upstairs y 3.6, roof 7.0) ----------------
export const bar = {
  walls: [
    ...bldg(-27, 9, -8, 24, 3.6, 'brick_dark', {
      s: [glass(-24, 2.6), door(-18, 'bar_front', 2.0, 2.4), glass(-13, 2.4)],
      w: [win(13, 'bar_w1'), win(19, 'bar_w2')],
      n: [win(-11, 'bar_n1')],
      e: [door(21, 'bar_back', 1.6, 2.3)],
    }),
    ...bldg(-27, 9, -8, 24, 3.4, 'plaster_olive', {
      s: [dwin(-24.5, 1.6, 1.25, 2.4), door(-19, null, 1.8, 2.2), dwin(-13.5, 1.6, 1.25, 2.4)],   // balcony door + broken windows
      w: [dwin(14, 1.6, 1.25, 2.4), win(21, 'bar_up_w', 1.6)],
      n: [dwin(-19, 1.6, 1.25, 2.4), win(-13, 'bar_up_n', 1.6)],
      e: [door(18, null, 1.6, 2.2)],                                                             // door onto the plank bridge
    }, { y0: 3.6 }),
    // balcony railing (front gap = drop-down onto the sidewalk) and sides
    rail(-24, 6.2, -12, 6.2, 3.6, [hole(-14.5, 1.8)]),
    rail(-24, 6.2, -24, 9, 3.6),
    rail(-12, 6.2, -12, 9, 3.6),
    // stairwell edge upstairs + landing edges beside the stair top
    rail(-11.2, 9.2, -11.2, 16, 3.6),
    rail(-11.2, 16, -10.4, 16, 3.6),
    rail(-8.8, 16, -8, 16, 3.6),
    // plank bridge railings (x -8..-4, z 17..19)
    rail(-8, 17, -4, 17, 3.6),
    rail(-8, 19, -4, 19, 3.6),
  ],
  boxes: [
    box(-17.5, 7.0, 16.5, 19, 0.3, 15, 'roof_tar', { kind: 'roof' }),                 // roof slab (not walkable)
    // ground floor
    box(-19.5, 0.15, 22.3, 11, 1.05, 1.2, 'wood_dark', { vault: true, kind: 'counter' }),   // bar counter (x -25..-14)
    box(-19.5, 0.15, 23.62, 11, 2.6, 0.4, 'wood_dark', { kind: 'shelf' }),                 // back shelf
    box(-23, 0.15, 13.5, 1.2, 0.8, 1.2, 'wood_dark', { vault: true, kind: 'table' }),
    box(-19, 0.15, 14.5, 1.2, 0.8, 1.2, 'wood_dark', { vault: true, kind: 'table' }),
    box(-15, 0.15, 13, 1.2, 0.8, 1.2, 'wood_dark', { vault: true, kind: 'table' }),
    box(-20, 0.15, 18.5, 2.6, 0.85, 1.4, 'felt_green', { vault: true, kind: 'pool' }),      // pool table
    box(-26.35, 0.15, 17, 0.9, 1.6, 0.6, 'metal_dark', { kind: 'jukebox' }),               // jukebox on the west wall
    box(-12.5, 0.15, 21.5, 1.4, 0.9, 0.9, 'wood_dark', { vault: true, kind: 'crate' }),
    // upstairs
    box(-25, 3.6, 22, 1.2, 1.0, 1.2, 'wood_dark', { vault: true, kind: 'crate' }),
    box(-16.5, 3.6, 21.8, 2.0, 0.6, 1.6, 'fabric', { vault: true, kind: 'bed' }),
    box(-20.5, 3.6, 22.8, 3.0, 0.9, 0.8, 'wood_dark', { vault: true, kind: 'dresser' }),
    box(-22, 3.6, 6.9, 1.6, 0.8, 0.9, 'sandbag', { vault: true, kind: 'sandbags' }),      // balcony nest
  ],
  decor: [
    { x: -17.5, y: 6.9, z: 8.55, w: 19.6, h: 0.25, d: 0.5, mat: 'concrete' },   // cornice
    { x: -17.5, y: 3.55, z: 8.7, w: 19.6, h: 0.12, d: 0.3, mat: 'concrete' },   // string course between storeys
    { x: -17.5, y: 6.9, z: 24.45, w: 19.6, h: 0.25, d: 0.5, mat: 'concrete' },  // rear cornice
    { x: -27.45, y: 6.9, z: 16.5, w: 0.5, h: 0.25, d: 15.4, mat: 'concrete' },  // west cornice
    { x: -25, y: 7.3, z: 20, w: 1.0, h: 1.4, d: 1.0, mat: 'brick_dark' },        // chimney
    { x: -19, y: 3.6, z: 9, w: 1.86, h: 0.03, d: 0.37, mat: 'wood_dark' },       // balcony door threshold (hides the wall-top seam)
    { x: -8, y: 3.6, z: 18, w: 0.37, h: 0.03, d: 1.66, mat: 'wood_dark' },       // bridge door threshold
  ],
};

// ---------------- PHARMACY  (x -4..12, z 9..19; flat roof y 3.6 reachable from the bar over the bridge) ----------------
export const pharmacy = {
  walls: [
    ...bldg(-4, 9, 12, 19, 3.6, 'plaster', {
      s: [glass(0, 3.2), door(4.5, 'pharm_front', 2.0, 2.4), glass(9, 3.2)],
      n: [win(-1, 'pharm_n1', 1.6), win(10, 'pharm_n2', 1.6)],
      w: [dwin(12, 1.4, 1.4, 2.5)],
      e: [dwin(17.5, 1.4, 1.4, 2.5)],
    }),
    // roof parapets (brick, 1.2 m); gap on the street side = drop-down, gap on the west = bridge
    wall(-4 - E, 9, 12 + E, 9, 1.2, 'brick_red', [hole(9, 1.6)], { y0: 3.6, t: T }),
    wall(-4 - E, 19, 12 + E, 19, 1.2, 'brick_red', [], { y0: 3.6, t: T }),
    parapet(-4, 9.175, -4, 18.825, 3.6, 'brick_red', [hole(18, 1.6)]),
    parapet(12, 9.175, 12, 18.825, 3.6, 'brick_red'),
  ],
  boxes: [
    box(0, 0.15, 14, 1.0, 1.9, 5.5, 'metal_shelf', { kind: 'shelf' }),
    box(4, 0.15, 14, 1.0, 1.9, 5.5, 'metal_shelf', { kind: 'shelf' }),
    box(8, 0.15, 14, 1.0, 1.9, 5.5, 'metal_shelf', { kind: 'shelf' }),
    box(6, 0.15, 17.9, 5, 1.0, 0.9, 'wood_dark', { vault: true, kind: 'counter' }),
    box(11.2, 0.15, 13, 1.2, 2.2, 1.6, 'metal_shelf', { kind: 'fridge' }),
    // rooftop
    box(3, 3.6, 15, 1.6, 1.1, 1.4, 'metal_panel', { kind: 'ac' }),
    box(8.5, 3.6, 13, 1.8, 2.2, 1.8, 'metal_rust', { kind: 'tank' }),
    box(-2.4, 3.6, 10.0, 2.2, 0.8, 0.9, 'sandbag', { vault: true, kind: 'sandbags' }),
    box(-3.0, 3.6, 12, 0.9, 0.8, 2.0, 'sandbag', { vault: true, kind: 'sandbags' }),
  ],
  decor: [
    { x: 4, y: 3.05, z: 8.7, w: 16.4, h: 0.6, d: 0.3, mat: 'paint_green' },     // fascia band (sign backing)
    { x: 4, y: 3.5, z: 8.6, w: 16.6, h: 0.16, d: 0.5, mat: 'concrete' },        // ledge under the parapet
    { x: -4, y: 3.6, z: 18, w: 0.37, h: 0.03, d: 1.66, mat: 'boards' },          // bridge landing threshold on the pharmacy wall
  ],
};
