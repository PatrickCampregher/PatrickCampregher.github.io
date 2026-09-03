#!/usr/bin/env node
// Static map validator: geometry hygiene (overlaps, floating props, coplanar faces) and gameplay placement
// (entries, wall buys, machines, box spots, spawns, upper-slab clearance). Zero dependencies.
// Usage: node tools/validate-map.mjs [--verbose]     exit code 1 when problems are found.
import { MAP } from '../shared/mapdata.js';
import { buildWorld, isFloorBox, MACHINE_DIMS } from '../shared/mapbuild.js';

const world = buildWorld(MAP);
const boxes = world.boxes;
const problems = [];
const verbose = process.argv.includes('--verbose');
const P = (cat, msg) => problems.push(`[${cat}] ${msg}`);
const f2 = (v) => (Math.round(v * 100) / 100).toString();
const at = (x, z) => `(${f2(x)}, ${f2(z)})`;

// ---------- helpers ----------
const isProp = (b) => !!b.prop && !b.noCollide;
const isSolid = (b) => !b.noCollide && !b.zombiePass && !b.door && !b.rail && !b.fence && b.kind !== 'outer';
const overlapXZ = (a, b, tol = 0.01) => a.minX < b.maxX - tol && b.minX < a.maxX - tol && a.minZ < b.maxZ - tol && b.minZ < a.maxZ - tol;
const overlapY = (a, b, tol = 0.01) => a.y0 < b.y1 - tol && b.y0 < a.y1 - tol;
/** Axis-aligned corners of a rotated footprint vs another box (separating axis on both boxes' axes). */
function footprintsIntersect(a, b, tol = 0.01) {
  if (!overlapXZ(a, b, tol)) return false;
  if (a.yaw === 0 && b.yaw === 0) return true;
  const corners = (q) => { const c = q.c, s = q.s; return [[-q.hw, -q.hd], [q.hw, -q.hd], [q.hw, q.hd], [-q.hw, q.hd]].map(([lx, lz]) => [q.cx + lx * c + lz * s, q.cz - lx * s + lz * c]); };
  const ca = corners(a), cb = corners(b);
  for (const q of [a, b]) {
    for (const [ax, az] of [[q.c, -q.s], [q.s, q.c]]) {
      const proj = (pts) => { let lo = Infinity, hi = -Infinity; for (const [x, z] of pts) { const p = x * ax + z * az; lo = Math.min(lo, p); hi = Math.max(hi, p); } return [lo, hi]; };
      const [a0, a1] = proj(ca), [b0, b1] = proj(cb);
      if (a1 < b0 + tol || b1 < a0 + tol) return false;
    }
  }
  return true;
}
/** Highest walkable surface top under (x,z) that is at most `maxY` high (floors, stairs, decor-free). */
function floorTopAt(x, z, maxY = Infinity) {
  let best = -Infinity;
  for (const b of boxes) {
    if (!isFloorBox(b) || b.y1 > maxY) continue;
    const dx = x - b.cx, dz = z - b.cz;
    const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
    if (Math.abs(lx) <= b.hw + 1e-6 && Math.abs(lz) <= b.hd + 1e-6 && b.y1 > best) best = b.y1;
  }
  return best === -Infinity ? 0 : best; // bare ground is y 0
}
const insideSolid = (x, y, z, label, cat, radius = 0.25, h = 1.6) => {
  for (const b of boxes) {
    if (!isSolid(b) || isFloorBox(b) || b.kind === 'roof') continue;
    if (b.y1 <= y + 0.05 || b.y0 >= y + h) continue;
    const dx = x - b.cx, dz = z - b.cz;
    const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
    if (Math.abs(lx) < b.hw + radius && Math.abs(lz) < b.hd + radius) { P(cat, `${label} at ${at(x, z)} y${f2(y)} is inside/too close to ${b.kind} ${b.mat} at ${at(b.cx, b.cz)}`); return true; }
  }
  return false;
};

// ---------- 1) props vs props / walls / vehicles (footprint + height) ----------
{
  const props = boxes.filter(isProp);
  for (let i = 0; i < props.length; i++) {
    const a = props[i];
    for (let j = i + 1; j < props.length; j++) {
      const b = props[j];
      if (a.prop === b.prop) continue;
      if (overlapY(a, b) && footprintsIntersect(a, b)) P('prop-overlap', `${a.kind} ${at(a.cx, a.cz)} intersects ${b.kind} ${at(b.cx, b.cz)}`);
    }
    for (const b of boxes) {
      if (isProp(b) || !isSolid(b) || isFloorBox(b)) continue;
      if (b.kind === 'machine') { if (overlapY(a, b) && footprintsIntersect(a, b)) P('prop-overlap', `${a.kind} ${at(a.cx, a.cz)} intersects machine ${b.id}`); continue; }
      if (overlapY(a, b) && footprintsIntersect(a, b)) P('prop-overlap', `${a.kind} ${at(a.cx, a.cz)} intersects ${b.kind} ${b.mat} at ${at(b.cx, b.cz)} (y ${f2(b.y0)}..${f2(b.y1)})`);
    }
    // upper slabs over props (streetlights under balconies etc.)
    for (const b of boxes) {
      if (!isFloorBox(b) || !b.upper) continue;
      if (overlapY(a, b) && footprintsIntersect(a, b)) P('prop-overlap', `${a.kind} ${at(a.cx, a.cz)} pokes through the upper slab at ${at(b.cx, b.cz)} y${f2(b.y1)}`);
    }
  }
  // 2) props resting on a floor (barrels, hydrants, mailboxes, debris, vehicles)
  for (const a of props) {
    const p = a.prop;
    if (p.decor) continue;
    const ft = floorTopAt(a.cx, a.cz, a.y0 + 0.05);
    const d = a.y0 - ft;
    if (a.kind === 'car' || a.kind === 'van' || a.kind === 'bus') { if (p.y == null && Math.abs(d) > 0.16) P('prop-float', `${a.kind} ${at(a.cx, a.cz)} sits ${f2(d)} m above the floor (top ${f2(ft)})`); else if (p.y != null && d < -0.01) P('prop-float', `${a.kind} ${at(a.cx, a.cz)} sinks into the floor`); continue; }
    if (Math.abs(d) > 0.03) P('prop-float', `${a.kind} ${at(a.cx, a.cz)} y0 ${f2(a.y0)} vs floor top ${f2(ft)} (${d > 0 ? 'floating' : 'sunk'} ${f2(Math.abs(d))} m)`);
  }
  // machines resting + boxes (furniture) resting on floors or on other solid boxes (monument on a basin)
  const supportTopAt = (self, x, z, maxY) => {
    let best = floorTopAt(x, z, maxY);
    for (const b of boxes) {
      if (b === self || !isSolid(b) || isFloorBox(b) || b.y1 > maxY || b.y1 <= best) continue;
      const dx = x - b.cx, dz = z - b.cz; const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) <= b.hw + 1e-6 && Math.abs(lz) <= b.hd + 1e-6) best = b.y1;
    }
    return best;
  };
  for (const b of boxes) {
    if (b.kind === 'machine' || (b.kind && !isProp(b) && !isFloorBox(b) && b.kind !== 'wall' && b.kind !== 'sill' && b.kind !== 'lintel' && b.kind !== 'entrygap' && b.kind !== 'glass' && b.kind !== 'door' && b.kind !== 'outer' && b.kind !== 'roof' && b.kind !== 'stair')) {
      const ft = supportTopAt(b, b.cx, b.cz, b.y0 + 0.05);
      if (b.y0 - ft > 0.03 && b.y0 > 0.001) P('box-float', `${b.kind} ${b.mat || b.id} ${at(b.cx, b.cz)} y0 ${f2(b.y0)} floats ${f2(b.y0 - ft)} m above floor top ${f2(ft)}`);
      if (b.y0 - ft < -0.03 && !(b.y0 === 0 && ft === 0.15 && b.h > 0.6)) P('box-sunk', `${b.kind} ${b.mat || b.id} ${at(b.cx, b.cz)} y0 ${f2(b.y0)} sunk ${f2(ft - b.y0)} m into floor top ${f2(ft)}`);
    }
  }
}

// ---------- 3) coplanar faces (same plane, same normal, overlapping extents) ----------
{
  // rails and fences are drawn as posts/bars or alpha-tested panels, not as boxes -> not part of this check
  const axisBoxes = boxes.filter(b => b.yaw === 0 && !b.invisible && !b.noCollide && !b.door && !b.rail && !b.fence && b.kind !== 'outer' && !isProp(b));
  const faces = [];
  for (const b of axisBoxes) {
    faces.push({ b, ax: 'x', n: -1, at: b.minX, u0: b.minZ, u1: b.maxZ, v0: b.y0, v1: b.y1 });
    faces.push({ b, ax: 'x', n: 1, at: b.maxX, u0: b.minZ, u1: b.maxZ, v0: b.y0, v1: b.y1 });
    faces.push({ b, ax: 'z', n: -1, at: b.minZ, u0: b.minX, u1: b.maxX, v0: b.y0, v1: b.y1 });
    faces.push({ b, ax: 'z', n: 1, at: b.maxZ, u0: b.minX, u1: b.maxX, v0: b.y0, v1: b.y1 });
    faces.push({ b, ax: 'y', n: 1, at: b.y1, u0: b.minX, u1: b.maxX, v0: b.minZ, v1: b.maxZ });
    if (b.y0 > 0.16) faces.push({ b, ax: 'y', n: -1, at: b.y0, u0: b.minX, u1: b.maxX, v0: b.minZ, v1: b.maxZ }); // bottoms on the ground / kerb slabs are never visible
  }
  // decorative boxes (MAP.decor: cornices, thresholds ...) also hide faces they cover
  const decorBoxes = (MAP.decor || []).filter(d => !d.yaw).map(d => ({ minX: d.x - d.w / 2, maxX: d.x + d.w / 2, minZ: d.z - d.d / 2, maxZ: d.z + d.d / 2, y0: d.y, y1: d.y + d.h, decor: true }));
  const coverBoxes = [...axisBoxes, ...decorBoxes];
  const byKey = new Map();
  for (const f of faces) { const k = `${f.ax}${f.n}:${Math.round(f.at * 500)}`; let a = byKey.get(k); if (!a) { a = []; byKey.set(k, a); } a.push(f); }
  const seen = new Set();
  for (const list of byKey.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.b === b.b || Math.abs(a.at - b.at) > 0.002) continue;
      const ou = Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0), ov = Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0);
      if (ou <= 0.015 || ov <= 0.015) continue; // stair steps overlap their neighbours by 1 cm by design
      // the shared patch must be exposed: skip when it is buried inside third boxes or below the ground plane.
      // Sampled at the centre and four inset corners; every sample must be covered by some box that occupies
      // the space the faces point into (a stacked wall, a slab, a decor threshold ...).
      if (a.ax !== 'y' && Math.min(a.v1, b.v1) <= 0.001) continue;
      const U0 = Math.max(a.u0, b.u0), U1 = Math.min(a.u1, b.u1), V0 = Math.max(a.v0, b.v0), V1 = Math.min(a.v1, b.v1);
      const samples = [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]].map(([su, sv]) => [U0 + (U1 - U0) * su, V0 + (V1 - V0) * sv]);
      const eps = 1e-3;
      const coveredAt = (u, v) => {
        const px = a.ax === 'x' ? a.at : u, pz = a.ax === 'z' ? a.at : (a.ax === 'y' ? v : u), py = a.ax === 'y' ? a.at : v;
        for (const o of coverBoxes) {
          if (o === a.b || o === b.b || o.invisible) continue;
          const lo = a.ax === 'x' ? o.minX : a.ax === 'z' ? o.minZ : o.y0, hi = a.ax === 'x' ? o.maxX : a.ax === 'z' ? o.maxZ : o.y1;
          const inPlane = a.ax === 'x' ? (pz > o.minZ + eps && pz < o.maxZ - eps && py > o.y0 + eps && py < o.y1 - eps)
            : a.ax === 'z' ? (px > o.minX + eps && px < o.maxX - eps && py > o.y0 + eps && py < o.y1 - eps)
              : (px > o.minX + eps && px < o.maxX - eps && pz > o.minZ + eps && pz < o.maxZ - eps);
          if (!inPlane) continue;
          const covers = a.n > 0 ? (lo <= a.at + eps && hi > a.at + eps) : (hi >= a.at - eps && lo < a.at - eps);
          if (covers) return true;
        }
        return false;
      };
      const buried = samples.every(([u, v]) => coveredAt(u, v));
      if (buried) continue;
      const k = [a.b, b.b].map(x => `${x.cx},${x.cz},${x.y0}`).sort().join('|') + a.ax;
      if (seen.has(k)) continue; seen.add(k);
      P('coplanar', `${a.b.kind} ${a.b.mat} ${at(a.b.cx, a.b.cz)} and ${b.b.kind} ${b.b.mat} ${at(b.b.cx, b.b.cz)} share plane ${a.ax}=${f2(a.at)} (${a.n > 0 ? '+' : '-'}) over ${f2(ou)}x${f2(ov)} m`);
    }
  }
}

// ---------- 4) entries ----------
for (const id in world.entries) {
  const e = world.entries[id];
  const def = e.def;
  if (e.type === 'manhole') {
    if (def.drop) { if (e.outside[1] <= e.inside[1]) P('entry', `${id}: drop entry outside must be above inside`); }
    else if (e.outside[1] >= e.inside[1]) P('entry', `${id}: manhole outside must be below inside`);
    insideSolid(e.inside[0], e.inside[1], e.inside[2], `entry ${id} inside`, 'entry');
    continue;
  }
  if (!e.gap) { P('entry', `${id}: no wall gap references this entry (window/hole gap with entryId missing)`); continue; }
  const g = e.gap;
  const alongX = Math.abs(g.yaw) < 0.01;
  const ins = e.inside, out = e.outside;
  // inside and outside must be on opposite sides of the gap plane, gap between them
  const sIn = alongX ? ins[2] - g.z : ins[0] - g.x, sOut = alongX ? out[2] - g.z : out[0] - g.x;
  if (sIn * sOut >= 0) P('entry', `${id}: inside and outside are on the same side of the wall`);
  const off = alongX ? Math.abs(ins[0] - g.x) : Math.abs(ins[2] - g.z);
  if (off > g.w / 2 + 0.3) P('entry', `${id}: inside is ${f2(off)} m off the gap centre line`);
  // yaw should point from outside to inside
  const dx = ins[0] - out[0], dz = ins[2] - out[2];
  const want = Math.atan2(dx, dz);
  let dy = Math.abs(want - e.yaw); while (dy > Math.PI) dy = Math.abs(dy - Math.PI * 2);
  if (dy > 0.5) P('entry', `${id}: yaw ${f2(e.yaw)} does not face inward (expected ${f2(want)})`);
  // heights: inside must be on a floor of the right height
  const ft = floorTopAt(ins[0], ins[2], ins[1] + 0.3);
  if (Math.abs(ft - ins[1]) > 0.05) P('entry', `${id}: inside y ${f2(ins[1])} but floor top there is ${f2(ft)}`);
  if (Math.abs(g.y - (e.type === 'window' ? ins[1] + 1.0 : ins[1])) > 0.25 && e.type === 'window') P('entry', `${id}: window sill y ${f2(g.y)} vs inside floor ${f2(ins[1])}`);
  insideSolid(ins[0], ins[1], ins[2], `entry ${id} inside`, 'entry');
}

// ---------- 5) wall buys, machines, box spots, spawns ----------
for (const wb of world.wallBuys) {
  const px = wb.x + Math.sin(wb.yaw) * 0.5, pz = wb.z + Math.cos(wb.yaw) * 0.5;
  insideSolid(px, wb.y - 1.0, pz, `wall buy ${wb.weapon}`, 'wallbuy', 0.2, 1.2);
  // there must be a wall right behind the chalk
  const bx = wb.x - Math.sin(wb.yaw) * 0.12, bz = wb.z - Math.cos(wb.yaw) * 0.12;
  let backed = false;
  for (const b of boxes) { if (!isSolid(b) || isFloorBox(b)) continue; if (b.y0 <= wb.y && b.y1 >= wb.y) { const dx = bx - b.cx, dz = bz - b.cz; const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c; if (Math.abs(lx) <= b.hw && Math.abs(lz) <= b.hd) { backed = true; break; } } }
  if (!backed) P('wallbuy', `${wb.weapon} at ${at(wb.x, wb.z)} has no wall behind it`);
}
for (const m of world.machines) {
  const dims = MACHINE_DIMS[m.type];
  const b = m.box;
  for (const o of boxes) { if (o === b || !isSolid(o) || isFloorBox(o)) continue; if (overlapY(b, o) && footprintsIntersect(b, o)) P('machine', `${m.id} intersects ${o.kind} ${o.mat} at ${at(o.cx, o.cz)}`); }
  const ft = floorTopAt(m.x, m.z, m.y + 0.05);
  if (Math.abs(ft - m.y) > 0.03) P('machine', `${m.id} y ${f2(m.y)} but floor top is ${f2(ft)}`);
  // 1.2 m free in front (sample a grid in front of the face)
  const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw), rx = Math.cos(m.yaw), rz = -Math.sin(m.yaw);
  for (let s = -dims.w / 2 + 0.1; s <= dims.w / 2 - 0.1; s += 0.2) for (let d = 0.15; d <= 1.2; d += 0.2) {
    const x = m.x + fx * (dims.d / 2 + d) + rx * s, z = m.z + fz * (dims.d / 2 + d) + rz * s;
    for (const o of boxes) { if (o === b || !isSolid(o) || isFloorBox(o) || o.kind === 'roof') continue; if (o.y1 <= m.y + 0.1 || o.y0 >= m.y + 1.8) continue; const dx = x - o.cx, dz = z - o.cz; const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c; if (Math.abs(lx) < o.hw && Math.abs(lz) < o.hd) { P('machine', `${m.id}: ${o.kind} ${o.mat} at ${at(o.cx, o.cz)} blocks the 1.2 m space in front`); s = 99; d = 99; break; } }
    if (Math.abs(floorTopAt(x, z, m.y + 0.3) - m.y) > 0.3) { P('machine', `${m.id}: no floor at ${at(x, z)} in front`); s = 99; break; }
  }
  // back against a wall (a solid box within 0.15 m behind)
  const bx = m.x - fx * (dims.d / 2 + 0.08), bz = m.z - fz * (dims.d / 2 + 0.08);
  let backed = false;
  for (const o of boxes) { if (o === b || !isSolid(o) || isFloorBox(o)) continue; if (o.y0 > m.y + 1.0 || o.y1 < m.y + 1.0) continue; const dx = bx - o.cx, dz = bz - o.cz; const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c; if (Math.abs(lx) <= o.hw && Math.abs(lz) <= o.hd) { backed = true; break; } }
  if (!backed) P('machine', `${m.id} at ${at(m.x, m.z)} does not have its back against a wall`);
  if (m.area && !MAP.areas[m.area]) P('machine', `${m.id}: unknown area ${m.area}`);
}
for (const l of world.boxLocations) {
  insideSolid(l.x, l.y, l.z, `box spot ${l.area}`, 'boxspot', 0.7, 1.0);
  const ft = floorTopAt(l.x, l.z, l.y + 0.05);
  if (Math.abs(ft - l.y) > 0.03) P('boxspot', `${l.area} box spot y ${f2(l.y)} but floor top is ${f2(ft)}`);
  if (!MAP.areas[l.area]) P('boxspot', `unknown area ${l.area}`);
}
for (const s of world.playerSpawns) insideSolid(s.x, s.y, s.z, 'player spawn', 'spawn', 0.4, 1.7);
for (const d of MAP.doors) for (const a of d.areas) if (!MAP.areas[a]) P('door', `${d.id}: unknown area ${a}`);
for (const e of MAP.entries) if (!MAP.areas[e.area]) P('entry', `${e.id}: unknown area ${e.area}`);
for (const f of MAP.floors) if (f.level && !MAP.areas[f.area]) P('floor', `upper slab at ${at(f.x0, f.z0)}: unknown area ${f.area}`);
for (const s of MAP.stairs) if (!MAP.areas[s.area]) P('stair', `stair at ${at(s.x, s.z)}: unknown area ${s.area}`);

// ---------- 6) upper slabs need 2.6 m clearance over any walkable floor below ----------
for (const b of boxes) {
  if (!isFloorBox(b) || !b.upper || b.kind !== 'floor') continue;
  for (const f of boxes) {
    if (!isFloorBox(f) || f === b || f.y1 >= b.y0) continue;
    if (!footprintsIntersect(b, f)) continue;
    if (b.y0 - f.y1 < 2.6 - 1e-6) P('clearance', `upper slab ${at(b.cx, b.cz)} (bottom ${f2(b.y0)}) is only ${f2(b.y0 - f.y1)} m above the floor at ${at(f.cx, f.cz)} (top ${f2(f.y1)})`);
  }
}

// ---------- 7) stairs: slope, top meets a slab, rise ----------
for (const st of world.visuals.stairs) {
  const s = st.def;
  const slope = (s.y1 - s.y0) / s.len;
  if (slope > 0.72) P('stair', `stair at ${at(s.x, s.z)} is too steep (${f2(slope)} rise/run; diagonal nav steps exceed 0.55 m)`);
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  const tx = s.x + fx * (s.len + 0.3), tz = s.z + fz * (s.len + 0.3);
  const top = floorTopAt(tx, tz, s.y1 + 0.3);
  if (Math.abs(top - s.y1) > 0.05) P('stair', `stair at ${at(s.x, s.z)} ends at y ${f2(s.y1)} but the floor beyond its top is ${f2(top)}`);
  const bx = s.x - fx * 0.3, bz = s.z - fz * 0.3;
  const bot = floorTopAt(bx, bz, s.y0 + 0.3);
  if (Math.abs(bot - s.y0) > 0.2) P('stair', `stair at ${at(s.x, s.z)} starts at y ${f2(s.y0)} but the floor before it is ${f2(bot)}`);
}

// ---------- 8) zombie-walkability of stairs: the server probes the floor under the zombie's CENTRE only ----------
// (no radius), so every point along a stair and past its top needs a floor/stair box directly below, with
// rises <= 0.55 m. Walks each stair from 0.5 m before the bottom to 1.5 m beyond the top in 5 cm steps.
for (const st of world.visuals.stairs) {
  const s = st.def;
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  let prev = floorTopAt(s.x - fx * 0.5, s.z - fz * 0.5, s.y0 + 0.6);
  for (let a = -0.5; a <= s.len + 1.5; a += 0.05) {
    const x = s.x + fx * a, z = s.z + fz * a;
    const top = floorTopAt(x, z, prev + 0.56);
    if (top < prev - 0.56 && a > 0 && a < s.len + 1.4) { P('stair-walk', `stair at ${at(s.x, s.z)}: no floor under the centre line ${f2(a)} m along (drop from ${f2(prev)} to ${f2(top)})`); break; }
    prev = Math.max(top, prev - 0.56);
  }
}
// small gaps between upper slabs of the same layer (a zombie's centre over the gap has no floor -> it falls)
{
  const slabs = boxes.filter(b => b.kind === 'floor' && b.upper);
  for (const a of slabs) {
    const edges = [[a.maxX + 0.05, (a.minZ + a.maxZ) / 2, 1, 0], [a.minX - 0.05, (a.minZ + a.maxZ) / 2, -1, 0], [(a.minX + a.maxX) / 2, a.maxZ + 0.05, 0, 1], [(a.minX + a.maxX) / 2, a.minZ - 0.05, 0, -1]];
    for (const [x, z, dx, dz] of edges) {
      const here = floorTopAt(x, z, a.y1 + 0.56);
      if (Math.abs(here - a.y1) <= 0.56) continue; // continuous floor
      for (let g = 0.1; g <= 0.6; g += 0.05) {
        const t = floorTopAt(x + dx * g, z + dz * g, a.y1 + 0.56);
        if (Math.abs(t - a.y1) <= 0.56) { P('slab-gap', `upper slab ${at(a.cx, a.cz)} y${f2(a.y1)}: ${f2(g + 0.05)} m gap to the next floor at ${at(x + dx * g, z + dz * g)}`); break; }
      }
    }
  }
}

// ---------- report ----------
const byCat = {};
for (const p of problems) { const c = p.slice(1, p.indexOf(']')); byCat[c] = (byCat[c] || 0) + 1; }
console.log(`validate-map: ${boxes.length} boxes, ${Object.keys(world.entries).length} entries, ${world.machines.length} machines, ${world.wallBuys.length} wall buys, ${world.boxLocations.length} box spots`);
for (const p of problems) console.log('  ' + p);
console.log(problems.length ? `PROBLEMS: ${problems.length} ${JSON.stringify(byCat)}` : 'OK: zero problems');
if (verbose) console.log(JSON.stringify({ areas: Object.keys(MAP.areas), doors: MAP.doors.map(d => `${d.id}:${d.cost}`) }, null, 1));
process.exit(problems.length ? 1 : 0);
