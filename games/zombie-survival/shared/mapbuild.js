// Expands the map data into collision boxes (with visual metadata), doors, entries, machines and props.
// Deterministic: server and client must produce identical collision geometry.
//
// Map schema (see mapdata.js):
//   floors:   { x0, z0, x1, z1, y, mat, level?, area?, thick? }   y = top surface. level 0 (default) = ground slab
//             (box from -0.6 to y). level > 0 = thin upper slab (box from y-thick to y, thick default 0.25) that
//             must declare `area` (the nav area id it belongs to).
//   stairs:   { x, z, yaw, w, len, y0, y1, mat, level, area, rise? }  straight staircase. (x,z) = center of the
//             bottom edge at height y0, climbing along the yaw direction (forward = (sin yaw, cos yaw)) up to
//             height y1 over `len` meters, `w` wide. Expanded into solid step boxes (kind 'stair', rise <= 0.22 so
//             players walk them with stepHeight 0.42). `level` = nav layer of the floor it reaches.
//   walls:    { a, b, h, t, mat, gaps, y0?, rail?, ruined?, fence? }  y0 > 0 puts the wall on an upper floor.
//             rail: true = balcony/stair railing (thin, blocks movement/nav, bullets pass through).
//   machines: { type: 'perk', perk: 'jugg'|'revive'|'speed'|'dtap', x, y, z, yaw, area } and
//             { type: 'pap', x, y, z, yaw, area }   -> collision box kind 'machine' + world.machines list.
//   entries / doors / boxes / props / wallBuys / boxLocations / playerSpawns: unchanged (y may be > 0).

import { makeBox, BoxHash } from './collision.js';
import { mulberry32 } from './weapons.js';

const CAR_DIMS = { car: [4.4, 1.45, 1.9], van: [5.2, 2.15, 2.2], bus: [11, 3.0, 2.6] };
export const MACHINE_DIMS = { perk: { w: 1.1, h: 2.1, d: 0.85 }, pap: { w: 2.6, h: 2.3, d: 1.7 } };

export function buildWorld(MAP) {
  const rng = mulberry32(1337);
  const boxes = [];
  const doors = {};
  const entries = {};
  const wallBuys = [];
  const machines = [];
  const visuals = { boards: [], doorFrames: [], windowFrames: [], props: [], glass: [], cracks: [], stairs: [], rails: [] };

  const addBox = (x, y, z, w, h, d, yaw, extra) => {
    const b = makeBox(x, y, z, w, h, d, yaw, extra);
    boxes.push(b);
    return b;
  };

  // ---- floors (raised slabs; level > 0 = upper floors) ----
  for (const f of MAP.floors) {
    const w = f.x1 - f.x0, d = f.z1 - f.z0;
    const level = f.level || 0;
    if (level === 0) addBox((f.x0 + f.x1) / 2, -0.6, (f.z0 + f.z1) / 2, w, f.y + 0.6, d, 0, { mat: f.mat, kind: 'floor', level: 0, top: f.y, area: f.area || null });
    else {
      const thick = f.thick ?? 0.25;
      addBox((f.x0 + f.x1) / 2, f.y - thick, (f.z0 + f.z1) / 2, w, thick, d, 0, { mat: f.mat, kind: 'floor', level, top: f.y, area: f.area || null, upper: true });
    }
  }

  // ---- stairs (solid step boxes) ----
  for (const s of MAP.stairs || []) {
    const rise = s.rise ?? 0.2;
    const steps = Math.max(1, Math.ceil((s.y1 - s.y0) / rise + 1e-6));
    const stepH = (s.y1 - s.y0) / steps, depth = s.len / steps;
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    const base = s.base ?? Math.min(s.y0, 0); // bottom of the solid wedge
    const stair = { def: s, steps: [], level: s.level || 1, area: s.area || null };
    for (let i = 0; i < steps; i++) {
      const along = (i + 0.5) * depth;
      const top = s.y0 + (i + 1) * stepH;
      const b = addBox(s.x + fx * along, base, s.z + fz * along, s.w, top - base, depth + 0.01, s.yaw, { mat: s.mat, kind: 'stair', level: s.level || 1, top, area: s.area || null, stair, step: i, steps });
      stair.steps.push(b);
    }
    // nav helpers: floor height along the stair for any point in its footprint
    stair.heightAt = (x, z) => {
      const dx = x - s.x, dz = z - s.z;
      const along = dx * fx + dz * fz;
      const k = Math.max(0, Math.min(1, along / s.len));
      return s.y0 + (s.y1 - s.y0) * k;
    };
    visuals.stairs.push(stair);
  }

  // ---- doors (buyable) ----
  for (const dd of MAP.doors) {
    const door = { id: dd.id, cost: dd.cost, closed: true, label: dd.label, areas: dd.areas, kind: dd.kind, def: dd };
    const b = addBox(dd.x, dd.y, dd.z, dd.w, dd.h, dd.d, dd.yaw, { mat: 'door_' + dd.kind, kind: 'door', door, id: dd.id });
    door.box = b;
    doors[dd.id] = door;
  }

  // ---- entries ----
  for (const e of MAP.entries) {
    entries[e.id] = { id: e.id, type: e.type, area: e.area, outside: e.outside, inside: e.inside, boards: e.boards, maxBoards: e.boards, yaw: e.yaw, def: e };
  }

  // ---- walls ----
  for (const wdef of MAP.walls) {
    const [ax, az] = wdef.a, [bx, bz] = wdef.b;
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    const start = alongX ? Math.min(ax, bx) : Math.min(az, bz);
    const end = alongX ? Math.max(ax, bx) : Math.max(az, bz);
    const fixed = alongX ? az : ax; // constant coordinate
    const t = wdef.t, h = wdef.h, mat = wdef.mat;
    const y0 = wdef.y0 ?? 0;
    const gaps = [...wdef.gaps].sort((p, q) => p.at - q.at);
    const yawOf = alongX ? 0 : Math.PI / 2; // for visual orientation of frames
    const seg = (s0, s1, sy0, sh, extra) => {
      if (s1 - s0 < 0.02 || sh < 0.02) return null;
      const len = s1 - s0, mid = (s0 + s1) / 2;
      const ex = { mat, kind: 'wall', fence: !!wdef.fence || !!wdef.rail, rail: !!wdef.rail, upper: y0 > 0.5, ...extra };
      let b;
      if (alongX) b = addBox(mid, sy0, fixed, len, sh, t, 0, ex);
      else b = addBox(fixed, sy0, mid, t, sh, len, 0, ex);
      if (wdef.rail) visuals.rails.push(b);
      return b;
    };
    const solidSeg = (s0, s1) => {
      if (wdef.ruined && s1 - s0 > 2.2 && h > 3) {
        // break long ruined segments into pieces with varying heights
        let p = s0;
        while (p < s1 - 0.01) {
          const len = Math.min(s1 - p, 1.2 + rng() * 1.6);
          const hh = h * (0.55 + rng() * 0.45);
          seg(p, p + len, y0, hh, { ruined: true });
          p += len;
        }
      } else seg(s0, s1, y0, h);
    };
    let cursor = start;
    for (const g of gaps) {
      const g0 = g.at - g.w / 2, g1 = g.at + g.w / 2;
      if (g0 > cursor) solidSeg(cursor, g0);
      const top = g.top ?? h;
      const pos = alongX ? { x: g.at, z: fixed } : { x: fixed, z: g.at };
      if (g.type === 'door') {
        if (top < h) seg(g0, g1, y0 + top, h - top, { kind: 'lintel' });
        visuals.doorFrames.push({ x: pos.x, z: pos.z, y: y0, w: g.w, h: top, t, yaw: yawOf, doorId: g.doorId || null, mat });
      } else if (g.type === 'window') {
        const sill = g.sill ?? 1.0;
        seg(g0, g1, y0, sill, { kind: 'sill' });
        if (top < h) seg(g0, g1, y0 + top, h - top, { kind: 'lintel' });
        if (g.entryId) {
          seg(g0, g1, y0 + sill, top - sill, { kind: 'entrygap', zombiePass: true, noNav: true, invisible: true, entryId: g.entryId });
          const e = entries[g.entryId];
          if (e) { e.gap = { x: pos.x, z: pos.z, y: y0 + sill, w: g.w, h: top - sill, t, yaw: yawOf }; }
        }
        visuals.windowFrames.push({ x: pos.x, z: pos.z, y: y0 + sill, w: g.w, h: top - sill, t, yaw: yawOf, mat, broken: !g.entryId });
      } else if (g.type === 'glass') {
        const sill = g.sill ?? 0.7;
        seg(g0, g1, y0, sill, { kind: 'sill' });
        if (top < h) seg(g0, g1, y0 + top, h - top, { kind: 'lintel' });
        const gb = seg(g0, g1, y0 + sill, top - sill, { kind: 'glass', mat: 'glass', glass: true });
        if (gb) { gb.w = alongX ? g.w : 0.06; gb.d = alongX ? 0.06 : g.w; gb.hw = gb.w / 2; gb.hd = gb.d / 2; }
        visuals.windowFrames.push({ x: pos.x, z: pos.z, y: y0 + sill, w: g.w, h: top - sill, t, yaw: yawOf, mat, glass: true });
      } else if (g.type === 'hole') {
        if (g.top != null && g.top < h) seg(g0, g1, y0 + g.top, h - g.top, { kind: 'lintel', ruined: true });
        if (g.entryId) {
          const hh = (g.top ?? h);
          seg(g0, g1, y0, hh, { kind: 'entrygap', zombiePass: true, noNav: true, invisible: true, entryId: g.entryId });
          const e = entries[g.entryId];
          if (e) e.gap = { x: pos.x, z: pos.z, y: y0, w: g.w, h: hh, t, yaw: yawOf };
        }
      }
      cursor = g1;
    }
    if (cursor < end) solidSeg(cursor, end);
    // roofline / cap for tall walls is purely visual, skip
  }

  // ---- misc boxes ----
  for (const b of MAP.boxes) {
    addBox(b.x, b.y, b.z, b.w, b.h, b.d, b.yaw || 0, { mat: b.mat, kind: b.kind || 'box', vault: !!b.vault, upper: b.y > 0.5 });
  }

  // ---- machines (perk vending machines + Pack-a-Punch) ----
  (MAP.machines || []).forEach((m, index) => {
    const dims = MACHINE_DIMS[m.type] || MACHINE_DIMS.perk;
    const id = m.type === 'pap' ? 'pap' : m.perk;
    const machine = { id, index, type: m.type, perk: m.perk || null, x: m.x, y: m.y ?? 0, z: m.z, yaw: m.yaw || 0, area: m.area, def: m };
    const b = addBox(m.x, m.y ?? 0, m.z, dims.w, dims.h, dims.d, m.yaw || 0, { mat: 'machine', kind: 'machine', machine, id });
    machine.box = b;
    machines.push(machine);
  });

  // ---- props with collision ----
  for (const p of MAP.props) {
    switch (p.type) {
      case 'car': case 'van': case 'bus': {
        const [L, H, W] = CAR_DIMS[p.type];
        addBox(p.x, p.y ?? (p.indoor ? 0.15 : 0), p.z, L, H, W, p.yaw || 0, { mat: 'vehicle', kind: p.type, prop: p, noCollide: !!p.decor, noNav: !!p.decor });
        break;
      }
      case 'streetlight': case 'pole':
        addBox(p.x, 0, p.z, 0.28, 6, 0.28, 0, { mat: 'metal_dark', kind: p.type, prop: p });
        break;
      case 'barrel':
        addBox(p.x, p.y ?? 0, p.z, 0.62, 0.9, 0.62, 0, { mat: 'metal_rust', kind: 'barrel', prop: p });
        break;
      case 'fire':
        if (p.barrel) addBox(p.x, p.y ?? 0, p.z, 0.62, 0.9, 0.62, 0, { mat: 'metal_rust', kind: 'firebarrel', prop: p });
        break;
      case 'hydrant':
        addBox(p.x, p.y ?? 0.15, p.z, 0.32, 0.8, 0.32, 0, { mat: 'paint_red', kind: 'hydrant', prop: p });
        break;
      case 'mailbox':
        addBox(p.x, p.y ?? 0.15, p.z, 0.55, 1.15, 0.45, 0, { mat: 'paint_blue', kind: 'mailbox', prop: p });
        break;
      case 'debris':
        addBox(p.x, p.y ?? 0, p.z, p.s * 1.4, 0.32, p.s * 1.1, (p.x * 0.37) % 1.5, { mat: 'rubble', kind: 'debris', prop: p, vault: true });
        break;
      case 'busstop':
        addBox(p.x - 1.9, 0.15, p.z, 0.12, 2.6, 0.12, 0, { mat: 'metal_dark', kind: 'post', prop: p });
        addBox(p.x + 1.9, 0.15, p.z, 0.12, 2.6, 0.12, 0, { mat: 'metal_dark', kind: 'post', prop: p });
        break;
      default:
        break;
    }
    visuals.props.push(p);
  }

  // ---- outer decor (no collision) ----
  for (const o of MAP.outer) {
    addBox(o.x, 0, o.z, o.w, o.h, o.d, 0, { mat: o.mat, kind: 'outer', noCollide: true, noNav: true, outer: o });
  }

  // ---- wall buys ----
  for (const wb of MAP.wallBuys) wallBuys.push({ ...wb });

  // spatial hash
  const hash = new BoxHash(4);
  for (const b of boxes) hash.add(b);

  return { map: MAP, boxes, hash, doors, entries, wallBuys, machines, visuals, boxLocations: MAP.boxLocations, playerSpawns: MAP.playerSpawns };
}

/** Is this box a walkable surface for characters (ground slab, upper floor or stair step)? */
export function isFloorBox(b) { return b.kind === 'floor' || b.kind === 'stair'; }

/** Which area contains (x,z)? returns area id or null. For y above ground, upper floors/stairs are checked first. */
export function areaAt(MAP, x, z, y = 0) {
  if (y > 1.0) {
    for (const f of MAP.floors) {
      if ((f.level || 0) > 0 && f.area && x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && Math.abs(y - f.y) < 1.2) return f.area;
    }
  }
  for (const id in MAP.areas) {
    for (const r of MAP.areas[id].rects) {
      if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return id;
    }
  }
  return null;
}
