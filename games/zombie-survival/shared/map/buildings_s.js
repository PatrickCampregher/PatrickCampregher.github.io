// South block: the DINER ruin (west) and the collapsed apartment block (east) with the rubble ramp up to
// the surviving floor fragment ("the perch", y 3.4). The diner's east wall is shared with the block.
import { wall, win, dwin, glass, door, hole, box } from './helpers.js';

const T = 0.35, E = T / 2 + 0.02;

// ---------------- DINER  (x -28..-10, z -24..-9; roof only over the west half x -28..-18) ----------------
export const diner = {
  walls: [
    // street facade (faces +Z). West half intact, east half ruined (jagged tops).
    wall(-28 - E, -9, -18, -9, 4.2, 'brick_red', [glass(-25, 2.6), door(-20.5, 'diner_front', 2.0, 2.4)]),
    wall(-18, -9, -10 + E, -9, 4.2, 'brick_red', [glass(-15.5, 2.4, 0.7, 2.4), dwin(-11.8, 1.4, 1.4, 2.4)], { ruined: true }),
    // back wall to the alley (west half intact, east half ruined) with the back door
    wall(-28 - E, -24, -18, -24, 4.2, 'brick_red', []),
    wall(-18, -24, -10 + E, -24, 4.2, 'brick_red', [door(-14, 'diner_back', 1.6, 2.3)], { ruined: true }),
    wall(-28, -23.825, -28, -9.175, 4.2, 'brick_red', [win(-13, 'diner_w1'), win(-19, 'diner_w2')]),
    wall(-10, -23.825, -10, -9.175, 4.2, 'brick_red', [], { ruined: true }),   // shared with the collapsed block (both sides visible)
  ],
  boxes: [
    box(-23, 4.2, -16.5, 10, 0.3, 15, 'roof_tar', { kind: 'roof' }),                       // surviving roof (x -28..-18)
    box(-21, 0.15, -22.7, 10, 1.0, 1.0, 'metal_counter', { vault: true, kind: 'counter' }), // counter along the back wall
    box(-21, 0.15, -23.55, 10, 2.2, 0.5, 'metal_shelf', { kind: 'shelf' }),
    box(-25, 0.15, -10.3, 2.4, 1.1, 1.0, 'fabric', { vault: true, kind: 'booth' }),
    box(-25, 0.15, -11.9, 1.0, 0.8, 1.0, 'wood_dark', { vault: true, kind: 'table' }),
    box(-15.5, 0.15, -10.3, 2.4, 1.1, 1.0, 'fabric', { vault: true, kind: 'booth' }),
    box(-15.5, 0.15, -11.9, 1.0, 0.8, 1.0, 'wood_dark', { vault: true, kind: 'table' }),
    box(-20, 0.15, -15.5, 1.1, 0.8, 1.1, 'wood_dark', { vault: true, kind: 'table' }),
    box(-14, 0.15, -14, 2.4, 1.2, 2.0, 'rubble', { vault: true, kind: 'rubble' }),          // collapsed roof debris (east half)
    box(-12, 0.15, -20, 1.6, 0.9, 1.6, 'rubble', { vault: true, kind: 'rubble' }),
    box(-16.5, 0.15, -19.5, 3.2, 0.3, 0.3, 'wood_dark', { vault: true, kind: 'beam', yaw: 0.5 }),
  ],
  decor: [
    { x: -19, y: 3.3, z: -8.7, w: 18.4, h: 0.6, d: 0.3, mat: 'paint_red' },     // fascia band (DINER sign)
    { x: -23, y: 4.35, z: -8.6, w: 10.4, h: 0.3, d: 0.5, mat: 'concrete' },     // cornice over the intact half
    { x: -18.1, y: 2.2, z: -16.5, w: 0.3, h: 4.0, d: 15.2, mat: 'rubble' },      // ragged roof edge
  ],
};

// ---------------- COLLAPSED BLOCK  (x -10..12, z -24..-9) ----------------
const TB = 0.5, EB = TB / 2 + 0.02;
export const ruins = {
  walls: [
    // street facade: two stacked storeys (the fragment sits at the storey line y 3.4). Upper sills are
    // 1.25 m above the fragment so nobody can jump from the perch into the street.
    wall(-10 - EB, -9, 12 + EB, -9, 3.4, 'brick_dark', [dwin(-6, 1.8, 1.4, 2.5), door(2, 'backlot_gate', 2.4, 2.6), dwin(8, 1.8, 1.4, 2.5)], { t: TB }),
    wall(-10 - EB, -9, 12 + EB, -9, 2.6, 'brick_dark', [dwin(-6, 1.8, 1.25, 2.4), dwin(-1, 1.8, 1.25, 2.4), dwin(5, 1.8, 1.25, 2.4), dwin(10, 1.8, 1.25, 2.4)], { t: TB, y0: 3.4 }),
    // east wall: tall and solid beside the fragment, ruined further south
    wall(12, -16, 12, -9.25, 6.0, 'brick_dark', [], { t: TB }),
    wall(12, -23.75, 12, -16, 6.0, 'brick_dark', [], { t: TB, ruined: true }),
    // low broken back wall to the alley (open gaps)
    wall(-9.825, -24, 11.75, -24, 2.0, 'brick_dark', [hole(-3, 5.0), hole(7, 3.0)], { t: TB, ruined: false }),
  ],
  boxes: [
    box(-5, 0, -14, 3.0, 1.2, 2.5, 'rubble', { vault: true, kind: 'rubble' }),
    box(-2, 0, -20, 2.6, 1.0, 2.2, 'rubble', { vault: true, kind: 'rubble' }),
    box(9, 0, -21, 2.0, 0.9, 2.0, 'rubble', { vault: true, kind: 'rubble' }),
    box(3, 0, -22.6, 1.6, 0.8, 1.6, 'rubble', { vault: true, kind: 'rubble' }),
    box(-7, 0, -11, 0.8, 2.6, 0.8, 'brick_dark', { kind: 'column' }),
    box(0, 0, -12, 4.0, 0.3, 0.3, 'wood_dark', { vault: true, kind: 'beam', yaw: 0.6 }),
    box(2.3, 0, -15.6, 0.6, 3.15, 0.6, 'brick_dark', { kind: 'column' }),                 // pillars carrying the fragment
    box(2.3, 0, -9.7, 0.6, 3.15, 0.6, 'brick_dark', { kind: 'column' }),
    box(3.4, 3.4, -10.0, 1.8, 0.8, 0.9, 'sandbag', { vault: true, kind: 'sandbags' }),   // nest on the perch
    box(10.6, 3.4, -14.5, 1.2, 0.9, 1.2, 'wood_dark', { vault: true, kind: 'crate' }),
  ],
  decor: [
    { x: 1, y: 3.35, z: -8.75, w: 22.6, h: 0.14, d: 0.3, mat: 'concrete' },    // storey ledge on the facade (hides the seam)
    { x: 1, y: 6.0, z: -8.7, w: 22.6, h: 0.3, d: 0.4, mat: 'concrete' },       // cornice
  ],
};
