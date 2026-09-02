// Expands the map data into collision boxes (with visual metadata), doors, entries and props.
// Deterministic: server and client must produce identical collision geometry.

import { makeBox, BoxHash } from './collision.js';
import { mulberry32 } from './weapons.js';

const CAR_DIMS = { car: [4.4, 1.45, 1.9], van: [5.2, 2.15, 2.2], bus: [11, 3.0, 2.6] };

export function buildWorld(MAP) {
  const rng = mulberry32(1337);
  const boxes = [];
  const doors = {};
  const entries = {};
  const wallBuys = [];
  const visuals = { boards: [], doorFrames: [], windowFrames: [], props: [], glass: [], cracks: [] };

  const addBox = (x, y, z, w, h, d, yaw, extra) => {
    const b = makeBox(x, y, z, w, h, d, yaw, extra);
    boxes.push(b);
    return b;
  };

  // ---- floors (raised slabs) ----
  for (const f of MAP.floors) {
    const w = f.x1 - f.x0, d = f.z1 - f.z0;
    addBox((f.x0 + f.x1) / 2, -0.6, (f.z0 + f.z1) / 2, w, f.y + 0.6, d, 0, { mat: f.mat, kind: 'floor' });
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
      const ex = { mat, kind: 'wall', fence: !!wdef.fence, ...extra };
      if (alongX) return addBox(mid, sy0, fixed, len, sh, t, 0, ex);
      return addBox(fixed, sy0, mid, t, sh, len, 0, ex);
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
    addBox(b.x, b.y, b.z, b.w, b.h, b.d, b.yaw || 0, { mat: b.mat, kind: b.kind || 'box', vault: !!b.vault });
  }

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
      case 'hydrant':
        addBox(p.x, 0.15, p.z, 0.32, 0.8, 0.32, 0, { mat: 'paint_red', kind: 'hydrant', prop: p });
        break;
      case 'mailbox':
        addBox(p.x, 0.15, p.z, 0.55, 1.15, 0.45, 0, { mat: 'paint_blue', kind: 'mailbox', prop: p });
        break;
      case 'debris':
        addBox(p.x, 0, p.z, p.s * 1.4, 0.32, p.s * 1.1, (p.x * 0.37) % 1.5, { mat: 'rubble', kind: 'debris', prop: p, vault: true });
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

  return { map: MAP, boxes, hash, doors, entries, wallBuys, visuals, boxLocations: MAP.boxLocations, playerSpawns: MAP.playerSpawns };
}

/** Which area contains (x,z)? returns area id or null */
export function areaAt(MAP, x, z) {
  for (const id in MAP.areas) {
    for (const r of MAP.areas[id].rects) {
      if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return id;
    }
  }
  return null;
}
