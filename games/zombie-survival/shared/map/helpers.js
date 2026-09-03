// Small constructors for the map data modules (pure data, no engine code).
//
// Coordinate system: x = east, z = north, y = up. Yaw 0 faces +Z. Wall gap `at` is the world coordinate
// along the wall axis (x for E-W walls, z for N-S walls).
//
// Corner rule (avoids notches, overlaps and z-fighting): building E-W walls are extended by t/2 + 0.02 beyond
// the corner so they cover the corner square and end 2 cm proud of the N-S wall faces; N-S walls run between
// the E-W walls' inner faces (their end faces touch those faces, no box overlaps anywhere). Use `bldg`.

export const PI = Math.PI, HALF = Math.PI / 2;

export const wall = (ax, az, bx, bz, h, mat, gaps = [], opts = {}) => ({ a: [ax, az], b: [bx, bz], h, t: opts.t ?? 0.35, mat, gaps, ...opts });

/** Four walls of a rectangular building (see corner rule). sides = { s, n, w, e } gap lists. */
export const bldg = (x0, z0, x1, z1, h, mat, sides = {}, opts = {}) => {
  const t = opts.t ?? 0.35, e = t / 2 + 0.02;
  return [
    wall(x0 - e, z0, x1 + e, z0, h, mat, sides.s || [], opts),
    wall(x0 - e, z1, x1 + e, z1, h, mat, sides.n || [], opts),
    wall(x0, z0 + t / 2, x0, z1 - t / 2, h, mat, sides.w || [], opts),
    wall(x1, z0 + t / 2, x1, z1 - t / 2, h, mat, sides.e || [], opts),
  ];
};

// ---- wall gaps ----
/** Boarded zombie window (entry). sill/top relative to the wall's y0. */
export const win = (at, entryId, w = 1.7, sill = 1.0, top = 2.15) => ({ at, w, type: 'window', entryId, sill, top });
/** Decorative broken window (open, no boards, blocked by its sill for characters). */
export const dwin = (at, w = 1.6, sill = 0.9, top = 2.15) => ({ at, w, type: 'window', sill, top });
/** Storefront glass (solid, bullets pass). */
export const glass = (at, w = 2.6, sill = 0.7, top = 2.6) => ({ at, w, type: 'glass', sill, top });
/** Door opening. doorId = buyable door id (null = open doorway with a frame). */
export const door = (at, doorId, w = 2.0, top = 2.3) => ({ at, w, type: 'door', doorId, top });
/** Plain hole in a wall (passable). top = optional lintel height. */
export const hole = (at, w, top = null) => ({ at, w, type: 'hole', top });
/** Zombie-only passage (rubble gap with an entry). */
export const ehole = (at, w, entryId, top = null) => ({ at, w, type: 'hole', entryId, top });

/** Solid box (counters, shelves, rubble ...). vault: zombies may cross low boxes. */
export const box = (x, y, z, w, h, d, mat, opts = {}) => ({ x, y, z, w, h, d, yaw: 0, mat, ...opts });

/** Balcony / landing railing: thin, 1.2 m (players cannot jump-step over 1.2 m), bullets pass. */
export const rail = (ax, az, bx, bz, y0, gaps = [], opts = {}) => wall(ax, az, bx, bz, 1.2, opts.mat || 'metal_dark', gaps, { y0, rail: true, t: 0.08, ...opts });
/** Roof parapet: solid low wall on top of a roof slab. */
export const parapet = (ax, az, bx, bz, y0, mat, gaps = [], opts = {}) => wall(ax, az, bx, bz, 1.2, mat, gaps, { y0, t: 0.35, ...opts });

export const FENCE = { t: 0.08, fence: true };
export const RUBBLE = { t: 1.0 };

// ---- gameplay ----
export const entry = (id, type, area, outside, inside, yaw, boards = 0) => ({ id, type, area, outside, inside, boards, yaw });
export const winEntry = (id, area, outside, inside, yaw) => entry(id, 'window', area, outside, inside, yaw, 6);
export const manhole = (id, area, x, z, y = 0) => entry(id, 'manhole', area, [x, y - 2.2, z], [x, y, z], 0);
/** Ceiling collapse: zombies drop in from above (rendered as a ragged ceiling hole). */
export const dropEntry = (id, area, x, z, yFloor, yCeil) => ({ ...entry(id, 'manhole', area, [x, yCeil, z], [x, yFloor, z], 0), drop: true });

export const perk = (perkId, x, y, z, yaw, area) => ({ type: 'perk', perk: perkId, x, y, z, yaw, area });
export const sign = (text, x, y, z, yaw, w, h, color, opts = {}) => ({ text, x, y, z, yaw, w, h, color, ...opts });
