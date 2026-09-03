// East block: the AUTO GARAGE (roof y 5.2 via the external fire escape) and THE PALACE theatre
// (lobby with two stairs to the mezzanine, auditorium, stage with the Pack-a-Punch).
import { bldg, wall, win, dwin, glass, door, hole, ehole, box, rail, parapet } from './helpers.js';

const T = 0.35, E = T / 2 + 0.02;

// ---------------- AUTO GARAGE  (x 24..41, z -27..-9) ----------------
export const garage = {
  walls: [
    ...bldg(24, -27, 41, -9, 5.2, 'metal_panel', {
      w: [dwin(-22, 1.4, 2.4, 3.6), door(-16, 'garage_roll', 3.6, 3.4), dwin(-11, 1.4, 2.4, 3.6)],
      n: [dwin(28, 1.6, 2.4, 3.6), dwin(33, 1.6, 2.4, 3.6), dwin(38, 1.6, 2.4, 3.6)],
      e: [door(-22, 'garage_side', 1.6, 2.3)],
      s: [ehole(26.5, 2.2, 'garage_s1', 3.0), ehole(38.5, 2.2, 'garage_s2', 3.0)],
    }),
    // roof parapets: south has the zombie climb-in from the collapsed building behind, north a drop-down gap,
    // east the fire-escape platform opening
    wall(24 - E, -27, 41 + E, -27, 1.2, 'concrete', [ehole(27, 2.0, 'roof_s2'), ehole(34, 2.0, 'roof_s1')], { y0: 5.2, t: T }),
    wall(24 - E, -9, 41 + E, -9, 1.2, 'concrete', [hole(30, 2.0)], { y0: 5.2, t: T }),
    parapet(24, -26.825, 24, -9.175, 5.2, 'concrete'),
    parapet(41, -26.825, 41, -9.175, 5.2, 'concrete', [hole(-10.4, 2.0)]),
    // fire escape railings (landing y 2.9, platform y 5.2); stairs get visual handrails only
    rail(44.3, -18.2, 44.3, -15.4, 2.9),
    rail(41.3, -18.2, 44.3, -18.2, 2.9),          // (the landing's north edge is where flight 1 arrives: no rail)
    rail(44.3, -11.4, 44.3, -9.4, 5.2),
    rail(41.2, -9.4, 44.3, -9.4, 5.2),
    rail(41.2, -11.4, 42.8, -11.4, 5.2),
  ],
  boxes: [
    box(32, 0.15, -26.2, 6, 1.0, 1.0, 'metal_counter', { vault: true, kind: 'workbench' }),
    box(26.2, 0.15, -9.5, 2.4, 2.2, 0.6, 'metal_shelf', { kind: 'shelf' }),
    box(33, 0.15, -21.6, 0.5, 1.85, 0.5, 'metal_dark', { kind: 'lift' }),   // lift posts under the raised car
    box(33, 0.15, -18.4, 0.5, 1.85, 0.5, 'metal_dark', { kind: 'lift' }),
    box(37, 0.15, -10.2, 1.6, 0.9, 1.2, 'metal_dark', { vault: true, kind: 'toolbox' }),
    // roof
    box(31, 5.2, -13, 2.6, 2.4, 2.2, 'concrete', { kind: 'shed' }),          // stairhead (Double Tap on its south face)
    box(37, 5.2, -9.8, 2.4, 0.8, 0.9, 'sandbag', { vault: true, kind: 'sandbags' }),
    box(25.5, 5.2, -21, 1.2, 0.8, 1.2, 'metal_panel', { kind: 'vent' }),
  ],
  decor: [
    { x: 23.7, y: 3.55, z: -16, w: 0.25, h: 0.3, d: 4.4, mat: 'metal_dark' },   // roll-up header
    { x: 32.5, y: 5.1, z: -9.4, w: 17.6, h: 0.2, d: 0.5, mat: 'concrete' },     // front ledge
  ],
};

// ---------------- THE PALACE  (x 24..48, z 9..34, h 7.5) ----------------
export const theatre = {
  walls: [
    wall(24 - E, 9, 48 + E, 9, 7.5, 'plaster', [dwin(26, 1.6, 4.6, 6.0), glass(29.5, 2.4, 0.9, 2.6), dwin(32.5, 1.6, 4.6, 6.0), door(36, 'theatre_main', 2.6, 3.0), dwin(39.5, 1.6, 4.6, 6.0), glass(42.5, 2.4, 0.9, 2.6), dwin(46, 1.6, 4.6, 6.0)]),
    wall(24 - E, 34, 48 + E, 34, 7.5, 'brick_dark', [ehole(30, 2.2, 'th_n1', 3.2)]),
    wall(24, 9.175, 24, 33.825, 7.5, 'brick_dark', [dwin(12, 1.4, 4.6, 6.0), dwin(22, 1.4, 4.6, 6.0), door(31, 'stage_door', 1.6, 2.3)]),
    wall(48, 9.175, 48, 33.825, 7.5, 'brick_dark', [win(17, 'th_mezz', 1.6, 4.6, 5.75), win(22, 'th_e1'), win(27, 'th_e2')]),
    wall(24.175, 19, 47.825, 19, 7.5, 'plaster', [door(30, null, 2.4, 3.0), door(42, null, 2.4, 3.0)]),   // lobby | auditorium
    // mezzanine railings (gap at x 36 = drop into the lobby)
    rail(27, 14, 45, 14, 3.6, [hole(36, 2.0)]),
    rail(27, 14, 27, 15, 3.6),
    rail(45, 14, 45, 15, 3.6),
    rail(25.8, 15, 27, 15, 3.6),
    rail(45, 15, 46.2, 15, 3.6),
  ],
  boxes: [
    box(36, 7.5, 21.5, 24, 0.3, 25, 'roof_tar', { kind: 'roof' }),
    box(25.5, 0.15, 28.7, 3.0, 7.35, 0.6, 'plaster', { kind: 'wing' }),         // proscenium sides
    box(46.5, 0.15, 28.7, 3.0, 7.35, 0.6, 'plaster', { kind: 'wing' }),
    box(31, 0.15, 11.6, 2.4, 2.4, 1.6, 'wood_dark', { kind: 'booth' }),         // ticket booth
    box(30, 0.15, 16, 0.7, 3.2, 0.7, 'marble', { kind: 'column' }),             // columns under the mezzanine
    box(42, 0.15, 16, 0.7, 3.2, 0.7, 'marble', { kind: 'column' }),
    box(36, 3.6, 18.4, 3.0, 0.9, 0.7, 'wood_dark', { vault: true, kind: 'bench' }),
    // seating (vaultable rows), centre aisle x 34..38
    ...[21, 23, 25, 27].flatMap(z => [box(30, 0.15, z, 8, 0.9, 0.9, 'fabric', { vault: true, kind: 'seats' }), box(42, 0.15, z, 8, 0.9, 0.9, 'fabric', { vault: true, kind: 'seats' })]),
    box(26, 0.4, 32, 1.4, 1.1, 1.4, 'wood_dark', { vault: true, kind: 'crate' }),
    box(45, 0.4, 32.5, 1.6, 0.9, 1.2, 'wood_dark', { vault: true, kind: 'crate' }),
    box(31, 0.15, 6.2, 0.16, 3.2, 0.16, 'metal_dark', { kind: 'post' }),       // canopy posts on the sidewalk
    box(41, 0.15, 6.2, 0.16, 3.2, 0.16, 'metal_dark', { kind: 'post' }),
  ],
  decor: [
    { x: 36, y: 3.6, z: 7.4, w: 12, h: 0.5, d: 3.2, mat: 'metal_dark' },        // marquee canopy (sign on its front)
    { x: 45.5, y: 6.0, z: 8.2, w: 0.4, h: 4.6, d: 1.2, mat: 'paint_red' },      // vertical blade sign body
    { x: 36, y: 6.2, z: 28.7, w: 24, h: 1.3, d: 0.6, mat: 'plaster' },          // proscenium header
    { x: 28.5, y: 3.3, z: 28.65, w: 3.0, h: 5.8, d: 0.3, mat: 'curtain' },      // curtains
    { x: 43.5, y: 3.3, z: 28.65, w: 3.0, h: 5.8, d: 0.3, mat: 'curtain' },
    { x: 36, y: 6.9, z: 29.2, w: 20, h: 0.9, d: 0.3, mat: 'curtain' },
    { x: 36, y: 7.3, z: 8.6, w: 24.6, h: 0.35, d: 0.55, mat: 'concrete' },      // facade cornice
    { x: 30, y: 3.55, z: 16, w: 1.0, h: 0.1, d: 1.0, mat: 'marble' },           // column capitals (touch the slab)
    { x: 42, y: 3.55, z: 16, w: 1.0, h: 0.1, d: 1.0, mat: 'marble' },
  ],
};
