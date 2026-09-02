// Grid navigation: walkability raster + flow fields (Dial's algorithm) for zombie pathfinding.

const COST_STRAIGHT = 10, COST_DIAG = 14, COST_VAULT = 34, COST_WALLHUG = 6;
const NBX = [1, -1, 0, 0, 1, 1, -1, -1];
const NBZ = [0, 0, 1, -1, 1, -1, 1, -1];
const NBC = [COST_STRAIGHT, COST_STRAIGHT, COST_STRAIGHT, COST_STRAIGHT, COST_DIAG, COST_DIAG, COST_DIAG, COST_DIAG];

export class NavGrid {
  constructor(MAP, boxes) {
    this.cell = MAP.cell || 0.5;
    this.minX = MAP.bounds.minX; this.minZ = MAP.bounds.minZ;
    this.w = Math.ceil((MAP.bounds.maxX - MAP.bounds.minX) / this.cell);
    this.h = Math.ceil((MAP.bounds.maxZ - MAP.bounds.minZ) / this.cell);
    const n = this.w * this.h;
    this.n = n;
    this.walk = new Uint8Array(n);     // 0 blocked, 1 walkable, 2 vault
    this.areaIdx = new Uint8Array(n);  // 0 none, else index+1
    this.extra = new Uint8Array(n);    // extra enter cost
    this.vaultH = new Float32Array(n);
    this.areaIds = Object.keys(MAP.areas);
    this.doorCells = new Map();
    this._buckets = [];
    for (let i = 0; i < 64; i++) this._buckets.push([]);

    // 1) walkable where inside an area rect
    for (let ai = 0; ai < this.areaIds.length; ai++) {
      const area = MAP.areas[this.areaIds[ai]];
      for (const r of area.rects) {
        const cx0 = this.cx(r[0] + 0.01), cx1 = this.cx(r[2] - 0.01);
        const cz0 = this.cz(r[1] + 0.01), cz1 = this.cz(r[3] - 0.01);
        for (let iz = cz0; iz <= cz1; iz++) for (let ix = cx0; ix <= cx1; ix++) {
          if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) continue;
          const i = iz * this.w + ix;
          this.walk[i] = 1; this.areaIdx[i] = ai + 1;
        }
      }
    }
    // 2) rasterize boxes
    const margin = 0.2;
    for (const b of boxes) this._rasterBox(b, margin);
    // 3) wall-hug penalty
    for (let iz = 0; iz < this.h; iz++) for (let ix = 0; ix < this.w; ix++) {
      const i = iz * this.w + ix;
      if (!this.walk[i]) continue;
      let near = 0;
      for (let k = 0; k < 8; k++) {
        const jx = ix + NBX[k], jz = iz + NBZ[k];
        if (jx < 0 || jz < 0 || jx >= this.w || jz >= this.h || !this.walk[jz * this.w + jx]) { near = 1; break; }
      }
      this.extra[i] = near ? COST_WALLHUG : 0;
    }
  }

  cx(x) { return Math.floor((x - this.minX) / this.cell); }
  cz(z) { return Math.floor((z - this.minZ) / this.cell); }
  cellOf(x, z) {
    const ix = this.cx(x), iz = this.cz(z);
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) return -1;
    return iz * this.w + ix;
  }
  centerX(i) { return this.minX + ((i % this.w) + 0.5) * this.cell; }
  centerZ(i) { return this.minZ + (Math.floor(i / this.w) + 0.5) * this.cell; }
  isWalkable(x, z) { const i = this.cellOf(x, z); return i >= 0 && this.walk[i] > 0; }
  areaOfCell(i) { return i >= 0 && this.areaIdx[i] ? this.areaIds[this.areaIdx[i] - 1] : null; }
  areaAt(x, z) { return this.areaOfCell(this.cellOf(x, z)); }

  _rasterBox(b, margin) {
    if (b.noNav || b.zombiePass || b.noCollide) return;
    if (b.y1 <= 0.45 || b.y0 >= 1.5) return; // low step or overhead
    const isVault = b.vault && b.y1 <= 1.3;
    const cells = b.door ? [] : null;
    const ix0 = Math.max(0, this.cx(b.minX - margin)), ix1 = Math.min(this.w - 1, this.cx(b.maxX + margin));
    const iz0 = Math.max(0, this.cz(b.minZ - margin)), iz1 = Math.min(this.h - 1, this.cz(b.maxZ + margin));
    const hw = b.hw + margin, hd = b.hd + margin;
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const i = iz * this.w + ix;
      if (!this.walk[i]) continue;
      const x = this.minX + (ix + 0.5) * this.cell, z = this.minZ + (iz + 0.5) * this.cell;
      const dx = x - b.cx, dz = z - b.cz;
      let lx, lz;
      if (b.yaw === 0) { lx = dx; lz = dz; } else { lx = dx * b.c - dz * b.s; lz = dx * b.s + dz * b.c; }
      if (Math.abs(lx) > hw || Math.abs(lz) > hd) continue;
      if (isVault) { if (this.walk[i] === 1) { this.walk[i] = 2; this.vaultH[i] = Math.max(this.vaultH[i], b.y1); } }
      else { this.walk[i] = 0; if (cells) cells.push(i); }
    }
    if (cells) this.doorCells.set(b.door.id, cells);
  }

  /** Re-open the cells of a purchased door. */
  openDoor(doorId) {
    const cells = this.doorCells.get(doorId);
    if (!cells) return;
    for (const i of cells) { if (this.areaIdx[i]) this.walk[i] = 1; }
  }

  /** Multi-source Dijkstra (Dial's buckets). dist is Uint16Array(n), 65535 = unreachable. */
  computeField(sources, dist) {
    dist.fill(65535);
    const buckets = this._buckets;
    for (const b of buckets) b.length = 0;
    let pending = 0;
    for (const s of sources) { if (s >= 0 && this.walk[s]) { dist[s] = 0; buckets[0].push(s); pending++; } }
    const w = this.w, h = this.h, walk = this.walk, extra = this.extra;
    let cur = 0;
    while (pending > 0) {
      const bucket = buckets[cur & 63];
      while (bucket.length) {
        const i = bucket.pop(); pending--;
        if (dist[i] !== cur) continue; // stale
        const ix = i % w, iz = (i - ix) / w;
        for (let k = 0; k < 8; k++) {
          const jx = ix + NBX[k], jz = iz + NBZ[k];
          if (jx < 0 || jz < 0 || jx >= w || jz >= h) continue;
          const j = jz * w + jx;
          const wj = walk[j];
          if (!wj) continue;
          if (k >= 4) { // no corner cutting
            if (!walk[iz * w + jx] || !walk[jz * w + ix]) continue;
          }
          let c = cur + NBC[k] + extra[j];
          if (wj === 2) c += COST_VAULT;
          if (c < dist[j] && c < 65535) {
            dist[j] = c;
            buckets[c & 63].push(j); pending++;
          }
        }
      }
      cur++;
      if (cur > 60000) break;
    }
  }

  /** Best neighbor cell index to descend the field from cell i, or -1. */
  descend(dist, i) {
    const w = this.w, h = this.h;
    const ix = i % w, iz = (i - ix) / w;
    let best = -1, bd = dist[i];
    for (let k = 0; k < 8; k++) {
      const jx = ix + NBX[k], jz = iz + NBZ[k];
      if (jx < 0 || jz < 0 || jx >= w || jz >= h) continue;
      const j = jz * w + jx;
      if (!this.walk[j]) continue;
      if (k >= 4 && (!this.walk[iz * w + jx] || !this.walk[jz * w + ix])) continue;
      const d = dist[j];
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  }

  /** Nearest walkable cell to (x,z) within maxR cells, or -1. */
  nearestWalkable(x, z, maxR = 6) {
    const ix = this.cx(x), iz = this.cz(z);
    for (let r = 0; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= this.w || jz >= this.h) continue;
        const j = jz * this.w + jx;
        if (this.walk[j] === 1) return j;
      }
    }
    return -1;
  }
}
