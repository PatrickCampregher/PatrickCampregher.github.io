// Shared collision primitives: oriented boxes (rotated around Y), circle/capsule
// character resolution, spatial hashing and raycasts. Used by server and client.
//
// Yaw convention (matches Babylon.js rotation.y): local -> world
//   wx = cx + lx*cos(yaw) + lz*sin(yaw)
//   wz = cz - lx*sin(yaw) + lz*cos(yaw)
// forward vector of yaw = (sin(yaw), 0, cos(yaw))

export function makeBox(cx, y0, cz, w, h, d, yaw = 0, extra = null) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const hw = w / 2, hd = d / 2;
  // world-space AABB of the rotated footprint
  const ex = Math.abs(hw * c) + Math.abs(hd * s);
  const ez = Math.abs(hw * s) + Math.abs(hd * c);
  const box = {
    cx, cz, hw, hd, y0, y1: y0 + h, yaw, c, s,
    minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez,
    w, h, d,
    vault: false, noNav: false, noCollide: false, mat: null, id: null, door: null,
  };
  if (extra) Object.assign(box, extra);
  return box;
}

export function worldToLocal(box, x, z, out) {
  const dx = x - box.cx, dz = z - box.cz;
  if (box.yaw === 0) { out.x = dx; out.z = dz; }
  else { out.x = dx * box.c - dz * box.s; out.z = dx * box.s + dz * box.c; }
  return out;
}

const _tmp = { x: 0, z: 0 };

export function pointInBoxXZ(box, x, z, margin = 0) {
  worldToLocal(box, x, z, _tmp);
  return Math.abs(_tmp.x) <= box.hw + margin && Math.abs(_tmp.z) <= box.hd + margin;
}

export function circleOverlapsBox(box, x, z, r) {
  worldToLocal(box, x, z, _tmp);
  const qx = Math.max(-box.hw, Math.min(box.hw, _tmp.x));
  const qz = Math.max(-box.hd, Math.min(box.hd, _tmp.z));
  const ex = _tmp.x - qx, ez = _tmp.z - qz;
  return ex * ex + ez * ez < r * r;
}

/** Push a circle (x,z,r) out of a box footprint. Writes new position to out; returns true if it moved. */
export function pushCircleOutOfBox(box, x, z, r, out) {
  worldToLocal(box, x, z, _tmp);
  const lx = _tmp.x, lz = _tmp.z;
  const qx = Math.max(-box.hw, Math.min(box.hw, lx));
  const qz = Math.max(-box.hd, Math.min(box.hd, lz));
  const ex = lx - qx, ez = lz - qz;
  const d2 = ex * ex + ez * ez;
  if (d2 >= r * r) return false;
  let nx, nz, depth;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    nx = ex / d; nz = ez / d; depth = r - d;
  } else {
    const px = box.hw - Math.abs(lx), pz = box.hd - Math.abs(lz);
    if (px < pz) { nx = lx >= 0 ? 1 : -1; nz = 0; depth = px + r; }
    else { nx = 0; nz = lz >= 0 ? 1 : -1; depth = pz + r; }
  }
  let wx, wz;
  if (box.yaw === 0) { wx = nx; wz = nz; }
  else { wx = nx * box.c + nz * box.s; wz = -nx * box.s + nz * box.c; }
  out.x = x + wx * (depth + 0.001);
  out.z = z + wz * (depth + 0.001);
  return true;
}

/** Simple uniform-grid spatial hash for static boxes. */
export class BoxHash {
  constructor(cellSize = 4) {
    this.cell = cellSize;
    this.map = new Map();
    this.boxes = [];
    this._stamp = 1;
    this._result = [];
  }
  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  add(box) {
    box._stamp = 0;
    box._hashIndex = this.boxes.length;
    this.boxes.push(box);
    const cs = this.cell;
    const x0 = Math.floor(box.minX / cs), x1 = Math.floor(box.maxX / cs);
    const z0 = Math.floor(box.minZ / cs), z1 = Math.floor(box.maxZ / cs);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = this._key(ix, iz);
      let arr = this.map.get(k);
      if (!arr) { arr = []; this.map.set(k, arr); }
      arr.push(box);
    }
  }
  remove(box) {
    const cs = this.cell;
    const x0 = Math.floor(box.minX / cs), x1 = Math.floor(box.maxX / cs);
    const z0 = Math.floor(box.minZ / cs), z1 = Math.floor(box.maxZ / cs);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const arr = this.map.get(this._key(ix, iz));
      if (arr) { const i = arr.indexOf(box); if (i >= 0) arr.splice(i, 1); }
    }
    const i = this.boxes.indexOf(box);
    if (i >= 0) this.boxes.splice(i, 1);
  }
  /** Returns a reused array of boxes whose AABB intersects the query rect. Do not keep the array. */
  query(minX, minZ, maxX, maxZ) {
    const res = this._result; res.length = 0;
    const stamp = ++this._stamp;
    const cs = this.cell;
    const x0 = Math.floor(minX / cs), x1 = Math.floor(maxX / cs);
    const z0 = Math.floor(minZ / cs), z1 = Math.floor(maxZ / cs);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const arr = this.map.get(this._key(ix, iz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (b._stamp === stamp) continue;
        b._stamp = stamp;
        if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
        res.push(b);
      }
    }
    return res;
  }
}

/**
 * Character controller step: resolves horizontal collisions, floors, ceilings.
 * body: { x, y, z, vy, onGround }  (y = feet)
 * opts: { radius, height, stepHeight }
 * collides only against boxes where !box.noCollide && (!box.door || box.door.closed)
 */
export function resolveCharacter(hash, body, opts, groundY = 0) {
  const r = opts.radius, h = opts.height, step = opts.stepHeight;
  const out = _tmp2;
  // Horizontal passes
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    const boxes = hash.query(body.x - r, body.z - r, body.x + r, body.z + r);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.noCollide) continue;
      if (b.door && !b.door.closed) continue;
      if (b.y1 <= body.y + step || b.y0 >= body.y + h) continue; // steppable or above head
      if (pushCircleOutOfBox(b, body.x, body.z, r, out)) { body.x = out.x; body.z = out.z; moved = true; }
    }
    if (!moved) break;
  }
  // Floor
  let floor = groundY;
  const fr = r * 0.75;
  const boxes = hash.query(body.x - r, body.z - r, body.x + r, body.z + r);
  let ceiling = Infinity;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.noCollide) continue;
    if (b.door && !b.door.closed) continue;
    if (!circleOverlapsBox(b, body.x, body.z, fr)) continue;
    if (b.y1 <= body.y + step && b.y1 > floor) floor = b.y1;
    if (b.y0 > body.y + step && b.y0 < ceiling && b.y0 < body.y + h) ceiling = b.y0;
  }
  if (body.y <= floor + 0.001) {
    if (body.vy <= 0) { body.y = floor; body.vy = 0; body.onGround = true; }
  } else {
    body.onGround = false;
  }
  if (ceiling < Infinity) {
    body.y = Math.min(body.y, ceiling - h);
    if (body.vy > 0) body.vy = 0;
  }
  return body;
}
const _tmp2 = { x: 0, z: 0 };

/** Ray vs oriented box. Returns distance or -1. Writes hit normal into outNormal (x,y,z) if provided. */
export function rayBox(box, ox, oy, oz, dx, dy, dz, maxDist, outNormal) {
  // to local
  let lox, loz, ldx, ldz;
  const px = ox - box.cx, pz = oz - box.cz;
  if (box.yaw === 0) { lox = px; loz = pz; ldx = dx; ldz = dz; }
  else {
    lox = px * box.c - pz * box.s; loz = px * box.s + pz * box.c;
    ldx = dx * box.c - dz * box.s; ldz = dx * box.s + dz * box.c;
  }
  let tmin = 0, tmax = maxDist, axis = -1, sign = 0;
  // X slab
  {
    if (Math.abs(ldx) < 1e-9) { if (lox < -box.hw || lox > box.hw) return -1; }
    else {
      const inv = 1 / ldx;
      let t1 = (-box.hw - lox) * inv, t2 = (box.hw - lox) * inv;
      let sgn = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sgn = 1; }
      if (t1 > tmin) { tmin = t1; axis = 0; sign = sgn; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  // Y slab
  {
    if (Math.abs(dy) < 1e-9) { if (oy < box.y0 || oy > box.y1) return -1; }
    else {
      const inv = 1 / dy;
      let t1 = (box.y0 - oy) * inv, t2 = (box.y1 - oy) * inv;
      let sgn = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sgn = 1; }
      if (t1 > tmin) { tmin = t1; axis = 1; sign = sgn; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  // Z slab
  {
    if (Math.abs(ldz) < 1e-9) { if (loz < -box.hd || loz > box.hd) return -1; }
    else {
      const inv = 1 / ldz;
      let t1 = (-box.hd - loz) * inv, t2 = (box.hd - loz) * inv;
      let sgn = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sgn = 1; }
      if (t1 > tmin) { tmin = t1; axis = 2; sign = sgn; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  if (axis === -1) return -1; // origin inside box
  if (outNormal) {
    let nx = 0, ny = 0, nz = 0;
    if (axis === 0) nx = sign; else if (axis === 1) ny = sign; else nz = sign;
    if (axis !== 1 && box.yaw !== 0) {
      const wx = nx * box.c + nz * box.s, wz = -nx * box.s + nz * box.c;
      nx = wx; nz = wz;
    }
    outNormal.x = nx; outNormal.y = ny; outNormal.z = nz;
  }
  return tmin;
}

/** Raycast against all collidable boxes + ground plane. Returns {dist, nx, ny, nz, box} or null. */
export function bulletFilter(b) {
  if (b.noCollide || b.zombiePass || b.fence || b.glass || b.noNav) return false;
  if (b.door && !b.door.closed) return false;
  return true;
}
export function raycastWorld(hash, ox, oy, oz, dx, dy, dz, maxDist, groundY = 0, filter = null) {
  let best = maxDist, bestBox = null;
  const n = _rn;
  let bnx = 0, bny = 0, bnz = 0;
  // ground
  if (dy < -1e-6) {
    const t = (groundY - oy) / dy;
    if (t >= 0 && t < best) { best = t; bnx = 0; bny = 1; bnz = 0; bestBox = null; }
  }
  // walk the hash cells along the ray (coarse: query the AABB of the segment, chunked)
  const ex = ox + dx * best, ez = oz + dz * best;
  const minX = Math.min(ox, ex), maxX = Math.max(ox, ex);
  const minZ = Math.min(oz, ez), maxZ = Math.max(oz, ez);
  // For long rays, chunk the query to limit box counts
  const span = Math.max(maxX - minX, maxZ - minZ);
  const chunks = Math.max(1, Math.min(16, Math.ceil(span / 12)));
  for (let ci = 0; ci < chunks; ci++) {
    const t0 = best * (ci / chunks), t1 = best * ((ci + 1) / chunks);
    const ax = ox + dx * t0, az = oz + dz * t0, bx = ox + dx * t1, bz = oz + dz * t1;
    const boxes = hash.query(Math.min(ax, bx) - 0.5, Math.min(az, bz) - 0.5, Math.max(ax, bx) + 0.5, Math.max(az, bz) + 0.5);
    let found = false;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (filter) { if (!filter(b)) continue; }
      else { if (b.noCollide) continue; if (b.door && !b.door.closed) continue; }
      const t = rayBox(b, ox, oy, oz, dx, dy, dz, best, n);
      if (t >= 0 && t < best) { best = t; bestBox = b; bnx = n.x; bny = n.y; bnz = n.z; found = true; }
    }
    if (found) break; // any hit in this chunk is closer than the next chunk
  }
  if (best >= maxDist) return null;
  return { dist: best, nx: bnx, ny: bny, nz: bnz, box: bestBox };
}
const _rn = { x: 0, y: 0, z: 0 };

/** Ray vs sphere: returns t or -1 */
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  const thc = Math.sqrt(r2 - d2);
  let t = tca - thc;
  if (t < 0) t = tca + thc;
  return t < 0 ? -1 : t;
}

/** Ray vs vertical cylinder (cx, cz, radius, y0..y1). Returns t or -1 */
export function rayVCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1) {
  const fx = ox - cx, fz = oz - cz;
  const a = dx * dx + dz * dz;
  let t;
  if (a < 1e-9) {
    if (fx * fx + fz * fz > r * r) return -1;
    // vertical ray: hit the cap
    if (Math.abs(dy) < 1e-9) return -1;
    t = ((dy > 0 ? y0 : y1) - oy) / dy;
    return t >= 0 ? t : -1;
  }
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t0 = (-b - sq) / (2 * a), t1 = (-b + sq) / (2 * a);
  if (t0 > t1) { const tt = t0; t0 = t1; t1 = tt; }
  // check side hit
  if (t0 >= 0) {
    const y = oy + dy * t0;
    if (y >= y0 && y <= y1) return t0;
  }
  // check caps between t0 and t1
  if (Math.abs(dy) > 1e-9) {
    const tc0 = (y0 - oy) / dy, tc1 = (y1 - oy) / dy;
    const tcap = Math.min(tc0 >= 0 ? tc0 : Infinity, tc1 >= 0 ? tc1 : Infinity);
    if (tcap !== Infinity && tcap >= Math.max(0, t0) && tcap <= t1) return tcap;
  }
  if (t1 >= 0) {
    const y = oy + dy * t1;
    if (y >= y0 && y <= y1 && t0 < 0) return 0; // inside
  }
  return -1;
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
