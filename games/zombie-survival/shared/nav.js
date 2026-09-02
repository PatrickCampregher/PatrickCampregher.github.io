// Grid navigation with vertical layers: walkability raster per layer (ground, upper floors, roofs),
// per-cell floor heights, stair links between layers, one-way drop-down edges and flow fields
// (Dial's algorithm) for zombie pathfinding.
//
// Cell indexing: a "cell" index is `layer * n + (iz * w + ix)`; helpers below convert. Layer 0 is the
// ground (walkable inside MAP.areas rects), layer k > 0 is walkable only on the footprint of floors /
// stairs declared with `level: k` (see mapbuild.js). Two layers are linked at a cell when both are
// walkable there and their floor heights differ by less than STEP (stair bottoms/tops). A cell of a
// higher layer next to a lower walkable cell (any layer) with a ledge of STEP..MAX_DROP meters is a
// one-way drop edge (zombies jump down, never up).
import { isFloorBox } from './mapbuild.js';

const COST_STRAIGHT = 10, COST_DIAG = 14, COST_VAULT = 34, COST_WALLHUG = 6, COST_LINK = 10, COST_DROP = 26;
const NBX = [1, -1, 0, 0, 1, 1, -1, -1];
const NBZ = [0, 0, 1, -1, 1, -1, 1, -1];
const NBC = [COST_STRAIGHT, COST_STRAIGHT, COST_STRAIGHT, COST_STRAIGHT, COST_DIAG, COST_DIAG, COST_DIAG, COST_DIAG];
export const NAV_STEP = 0.55;      // max floor height change between neighbouring cells (walk)
export const NAV_MAX_DROP = 4.6;   // max ledge height zombies drop down
const NOFLOOR = -1000;

export class NavGrid {
  constructor(MAP, boxes) {
    this.cell = MAP.cell || 0.5;
    this.minX = MAP.bounds.minX; this.minZ = MAP.bounds.minZ;
    this.w = Math.ceil((MAP.bounds.maxX - MAP.bounds.minX) / this.cell);
    this.h = Math.ceil((MAP.bounds.maxZ - MAP.bounds.minZ) / this.cell);
    const n = this.w * this.h;
    this.n = n;
    let layers = 1;
    for (const b of boxes) if (isFloorBox(b) && (b.level || 0) + 1 > layers) layers = (b.level || 0) + 1;
    this.layers = layers;
    const N = this.N = n * layers;
    this.walk = new Uint8Array(N);     // 0 blocked, 1 walkable, 2 vault
    this.areaIdx = new Uint8Array(N);  // 0 none, else index+1
    this.extra = new Uint8Array(N);    // extra enter cost
    this.vaultH = new Float32Array(N); // vault box height above the floor
    this.floorY = new Float32Array(N); // floor height per cell (NOFLOOR where no floor in that layer)
    this.link = new Int32Array(N).fill(-1);   // vertical neighbour cell (stairs) or -1
    this.dropFrom = new Map();  // high cell -> [low cells] (forward, zombie jumps down)
    this.dropInto = new Map();  // low cell -> [high cells] (reverse, for the field)
    this.areaIds = Object.keys(MAP.areas);
    this.doorCells = new Map();
    this._buckets = [];
    for (let i = 0; i < 64; i++) this._buckets.push([]);
    this.floorY.fill(NOFLOOR);

    // 1) ground layer: walkable inside area rects, floor 0
    for (let ai = 0; ai < this.areaIds.length; ai++) {
      const area = MAP.areas[this.areaIds[ai]];
      for (const r of area.rects) {
        const cx0 = this.cx(r[0] + 0.01), cx1 = this.cx(r[2] - 0.01);
        const cz0 = this.cz(r[1] + 0.01), cz1 = this.cz(r[3] - 0.01);
        for (let iz = cz0; iz <= cz1; iz++) for (let ix = cx0; ix <= cx1; ix++) {
          if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) continue;
          const i = iz * this.w + ix;
          this.walk[i] = 1; this.areaIdx[i] = ai + 1; this.floorY[i] = 0;
        }
      }
    }
    // 2) floor heights: ground slabs raise layer 0; upper slabs / stairs create their layer's cells
    for (const b of boxes) {
      if (!isFloorBox(b)) continue;
      const level = b.level || 0;
      this._forEachCellIn(b, 0, (ix, iz, x, z) => {
        const c = iz * this.w + ix;
        if (level === 0) {
          if (this.walk[c] && b.top > this.floorY[c] && b.top <= 0.7) this.floorY[c] = b.top;
          return;
        }
        const i = level * n + c;
        const fy = b.stair ? b.stair.heightAt(x, z) : b.top;
        if (this.walk[i] && fy <= this.floorY[i]) return;
        this.walk[i] = 1;
        this.floorY[i] = fy;
        let ai = b.area ? this.areaIds.indexOf(b.area) : -1;
        if (ai < 0) ai = this.areaIdx[c] ? this.areaIdx[c] - 1 : -1;
        this.areaIdx[i] = ai + 1;
      });
    }
    // 3) rasterize blockers per layer (relative to that layer's floor height)
    const margin = 0.2;
    for (const b of boxes) this._rasterBox(b, margin);
    // 4) wall-hug penalty
    for (let L = 0; L < layers; L++) for (let iz = 0; iz < this.h; iz++) for (let ix = 0; ix < this.w; ix++) {
      const i = L * n + iz * this.w + ix;
      if (!this.walk[i]) continue;
      let near = 0;
      for (let k = 0; k < 8; k++) {
        const jx = ix + NBX[k], jz = iz + NBZ[k];
        if (jx < 0 || jz < 0 || jx >= this.w || jz >= this.h || !this.walk[L * n + jz * this.w + jx]) { near = 1; break; }
      }
      this.extra[i] = near ? COST_WALLHUG : 0;
    }
    // 5) vertical links (stairs) and drop edges
    if (layers > 1) this._buildVertical();
  }

  cx(x) { return Math.floor((x - this.minX) / this.cell); }
  cz(z) { return Math.floor((z - this.minZ) / this.cell); }
  layerOf(i) { return (i / this.n) | 0; }
  flat(i) { return i % this.n; }
  /** Ground-layer cell index (layer 0) of (x,z) or -1 */
  cellOf(x, z) {
    const ix = this.cx(x), iz = this.cz(z);
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) return -1;
    return iz * this.w + ix;
  }
  /** Cell index (with layer) for a position: the layer whose floor is closest below y (within a step). */
  cellAt(x, y, z) {
    const c = this.cellOf(x, z);
    if (c < 0) return -1;
    if (this.layers === 1) return c;
    let best = -1, bd = Infinity;
    for (let L = 0; L < this.layers; L++) {
      const i = L * this.n + c;
      const fy = this.floorY[i];
      if (fy <= NOFLOOR + 1) continue;
      if (fy > y + NAV_STEP + 0.05) continue;
      const d = y - fy + (this.walk[i] ? 0 : 0.6); // prefer walkable layers
      if (d < bd) { bd = d; best = i; }
    }
    return best >= 0 ? best : c;
  }
  centerX(i) { return this.minX + ((this.flat(i) % this.w) + 0.5) * this.cell; }
  centerZ(i) { return this.minZ + (Math.floor(this.flat(i) / this.w) + 0.5) * this.cell; }
  floorAt(i) { const f = this.floorY[i]; return f <= NOFLOOR + 1 ? 0 : f; }
  isWalkable(x, z, y = 0) { const i = this.cellAt(x, y, z); return i >= 0 && this.walk[i] > 0; }
  areaOfCell(i) { return i >= 0 && this.areaIdx[i] ? this.areaIds[this.areaIdx[i] - 1] : null; }
  areaAt(x, z, y = 0) { return this.areaOfCell(this.cellAt(x, y, z)); }

  _forEachCellIn(b, margin, fn) {
    const ix0 = Math.max(0, this.cx(b.minX - margin)), ix1 = Math.min(this.w - 1, this.cx(b.maxX + margin));
    const iz0 = Math.max(0, this.cz(b.minZ - margin)), iz1 = Math.min(this.h - 1, this.cz(b.maxZ + margin));
    const hw = b.hw + margin, hd = b.hd + margin;
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const x = this.minX + (ix + 0.5) * this.cell, z = this.minZ + (iz + 0.5) * this.cell;
      const dx = x - b.cx, dz = z - b.cz;
      let lx, lz;
      if (b.yaw === 0) { lx = dx; lz = dz; } else { lx = dx * b.c - dz * b.s; lz = dx * b.s + dz * b.c; }
      if (Math.abs(lx) > hw || Math.abs(lz) > hd) continue;
      fn(ix, iz, x, z);
    }
  }

  _rasterBox(b, margin) {
    if (b.noNav || b.zombiePass || b.noCollide) return;
    const cells = b.door ? [] : null;
    const floor = isFloorBox(b);
    const bLevel = b.level || 0;
    for (let L = 0; L < this.layers; L++) {
      if (floor && bLevel === L) continue; // a floor never blocks its own layer
      this._forEachCellIn(b, floor ? 0.0 : margin, (ix, iz) => {
        const i = L * this.n + iz * this.w + ix;
        if (!this.walk[i]) return;
        const f = this.floorY[i];
        if (b.y1 <= f + 0.45 || b.y0 >= f + 1.5) return; // low step or overhead for this layer
        if (b.vault && b.y1 <= f + 1.3) {
          if (this.walk[i] === 1) { this.walk[i] = 2; this.vaultH[i] = Math.max(this.vaultH[i], b.y1 - f); }
        } else { this.walk[i] = 0; if (cells) cells.push(i); }
      });
    }
    if (cells) this.doorCells.set(b.door.id, cells);
  }

  _buildVertical() {
    const n = this.n, w = this.w, h = this.h;
    const addDrop = (hi, lo) => {
      let a = this.dropFrom.get(hi); if (!a) { a = []; this.dropFrom.set(hi, a); } a.push(lo);
      let b = this.dropInto.get(lo); if (!b) { b = []; this.dropInto.set(lo, b); } b.push(hi);
    };
    for (let c = 0; c < n; c++) {
      const ix = c % w, iz = (c - ix) / w;
      for (let L = 0; L < this.layers; L++) {
        const i = L * n + c;
        if (!this.walk[i]) continue;
        const fi = this.floorY[i];
        // stair links: same cell, other layer, near-equal height
        for (let M = L + 1; M < this.layers; M++) {
          const j = M * n + c;
          if (!this.walk[j]) continue;
          if (Math.abs(this.floorY[j] - fi) <= NAV_STEP) { if (this.link[i] < 0) this.link[i] = j; if (this.link[j] < 0) this.link[j] = i; }
        }
        // drops: 4-neighbours in any layer that are much lower
        for (let k = 0; k < 4; k++) {
          const jx = ix + NBX[k], jz = iz + NBZ[k];
          if (jx < 0 || jz < 0 || jx >= w || jz >= h) continue;
          const cj = jz * w + jx;
          if (this.floorY[L * n + cj] > NOFLOOR + 1) continue; // still on my own floor: not a ledge
          for (let M = 0; M < this.layers; M++) {
            const j = M * n + cj;
            if (!this.walk[j]) continue;
            const dh = fi - this.floorY[j];
            if (dh > NAV_STEP && dh <= NAV_MAX_DROP) addDrop(i, j);
          }
        }
      }
    }
  }

  /** Re-open the cells of a purchased door. */
  openDoor(doorId) {
    const cells = this.doorCells.get(doorId);
    if (!cells) return;
    for (const i of cells) { if (this.areaIdx[i]) this.walk[i] = 1; }
  }

  _stepOk(i, j) { return Math.abs(this.floorY[i] - this.floorY[j]) <= NAV_STEP; }

  /** Multi-source Dijkstra (Dial's buckets). dist is Uint16Array(N), 65535 = unreachable. dist[j] = cost from j to the sources. */
  computeField(sources, dist) {
    dist.fill(65535);
    const buckets = this._buckets;
    for (const b of buckets) b.length = 0;
    let pending = 0;
    for (const s of sources) { if (s >= 0 && this.walk[s]) { dist[s] = 0; buckets[0].push(s); pending++; } }
    const w = this.w, h = this.h, n = this.n, walk = this.walk, extra = this.extra, link = this.link, floorY = this.floorY;
    const relax = (j, c, wj) => {
      if (wj === 2) c += COST_VAULT;
      if (c < dist[j] && c < 65535) { dist[j] = c; buckets[c & 63].push(j); pending++; }
    };
    let cur = 0;
    while (pending > 0) {
      const bucket = buckets[cur & 63];
      while (bucket.length) {
        const i = bucket.pop(); pending--;
        if (dist[i] !== cur) continue; // stale
        const base = i - (i % n);
        const ci = i - base;
        const ix = ci % w, iz = (ci - ix) / w;
        const fi = floorY[i];
        for (let k = 0; k < 8; k++) {
          const jx = ix + NBX[k], jz = iz + NBZ[k];
          if (jx < 0 || jz < 0 || jx >= w || jz >= h) continue;
          const j = base + jz * w + jx;
          const wj = walk[j];
          if (!wj) continue;
          if (Math.abs(floorY[j] - fi) > NAV_STEP) continue;
          if (k >= 4) { // no corner cutting
            if (!walk[base + iz * w + jx] || !walk[base + jz * w + ix]) continue;
          }
          relax(j, cur + NBC[k] + extra[j], wj);
        }
        const lj = link[i];
        if (lj >= 0 && walk[lj]) relax(lj, cur + COST_LINK + extra[lj], walk[lj]);
        const di = this.dropInto.get(i);
        if (di) for (let q = 0; q < di.length; q++) { const j = di[q]; if (walk[j]) relax(j, cur + COST_DROP + extra[j], walk[j]); }
      }
      cur++;
      if (cur > 60000) break;
    }
  }

  /** Best neighbor cell index to descend the field from cell i, or -1. */
  descend(dist, i) {
    const w = this.w, h = this.h, n = this.n;
    const base = i - (i % n);
    const ci = i - base;
    const ix = ci % w, iz = (ci - ix) / w;
    let best = -1, bd = dist[i];
    for (let k = 0; k < 8; k++) {
      const jx = ix + NBX[k], jz = iz + NBZ[k];
      if (jx < 0 || jz < 0 || jx >= w || jz >= h) continue;
      const j = base + jz * w + jx;
      if (!this.walk[j]) continue;
      if (!this._stepOk(i, j)) continue;
      if (k >= 4 && (!this.walk[base + iz * w + jx] || !this.walk[base + jz * w + ix])) continue;
      const d = dist[j];
      if (d < bd) { bd = d; best = j; }
    }
    const lj = this.link[i];
    if (lj >= 0 && this.walk[lj] && dist[lj] < bd) { bd = dist[lj]; best = lj; }
    const df = this.dropFrom.get(i);
    if (df) for (let q = 0; q < df.length; q++) { const j = df[q]; if (this.walk[j] && dist[j] < bd) { bd = dist[j]; best = j; } }
    return best;
  }

  /** Forward reachability (zombie movement direction) from source cells: Uint8Array(N) with 1 = reachable. */
  reachableFrom(sources) {
    const seen = new Uint8Array(this.N);
    const stack = [];
    for (const s of sources) if (s >= 0 && this.walk[s] && !seen[s]) { seen[s] = 1; stack.push(s); }
    const w = this.w, h = this.h, n = this.n;
    while (stack.length) {
      const i = stack.pop();
      const base = i - (i % n);
      const ci = i - base;
      const ix = ci % w, iz = (ci - ix) / w;
      const push = (j) => { if (this.walk[j] && !seen[j]) { seen[j] = 1; stack.push(j); } };
      for (let k = 0; k < 8; k++) {
        const jx = ix + NBX[k], jz = iz + NBZ[k];
        if (jx < 0 || jz < 0 || jx >= w || jz >= h) continue;
        const j = base + jz * w + jx;
        if (!this.walk[j] || !this._stepOk(i, j)) continue;
        if (k >= 4 && (!this.walk[base + iz * w + jx] || !this.walk[base + jz * w + ix])) continue;
        push(j);
      }
      if (this.link[i] >= 0) push(this.link[i]);
      const df = this.dropFrom.get(i);
      if (df) for (const j of df) push(j);
    }
    return seen;
  }

  /** Nearest walkable cell to (x,z) in the given layer within maxR cells, or -1. */
  nearestWalkable(x, z, maxR = 6, layer = 0) {
    const ix = this.cx(x), iz = this.cz(z);
    const base = Math.max(0, Math.min(this.layers - 1, layer)) * this.n;
    for (let r = 0; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= this.w || jz >= this.h) continue;
        const j = base + jz * this.w + jx;
        if (this.walk[j] === 1) return j;
      }
    }
    return -1;
  }
}
