// Server-side zombie pool, spawning, AI (flow-field navigation), attacks and position history.
import { ZOMBIE_TYPES, ZSTATE, ZOMBIE_RADIUS, ZOMBIE_HEIGHT, zombieHealthForRound, pickZombieType } from '../../shared/zombies.js';
import { PSTATE, TICK_RATE } from '../../shared/constants.js';
import { resolveCharacter, pushCircleOutOfBox, angleLerp, wrapAngle } from '../../shared/collision.js';

const MAX_ZOMBIES = 48;
const HISTORY = 32; // ticks (~1s)
const ZOPTS = { radius: ZOMBIE_RADIUS, height: ZOMBIE_HEIGHT, stepHeight: 0.5 };

export class ZombieManager {
  constructor(game) {
    this.game = game;
    this.pool = [];
    for (let i = 0; i < MAX_ZOMBIES; i++) this.pool.push(this._make(i + 1));
    this.nextId = MAX_ZOMBIES + 1;
    this.active = [];
    this.fieldCache = new Map(); // playerId -> { dist: Uint16Array, cell, time }
    this.aliveCount = 0;
    this._sep = { x: 0, z: 0 };
    this._grid = new Map();
  }

  _make(id) {
    return {
      id, active: false, type: ZOMBIE_TYPES[1], x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0,
      hp: 100, maxHp: 100, state: ZSTATE.DEAD, stateT: 0, target: 0, entry: null, spawnDelay: 0,
      speedMul: 1, staggerT: 0, attackHit: false, aiT: 0, nextCell: -1, dirX: 0, dirZ: 1,
      lastCheckX: 0, lastCheckZ: 0, lastCheckT: 0, stuck: 0, farT: 0, limp: false, aux: 0,
      hist: new Float32Array(HISTORY * 4), histTick: new Int32Array(HISTORY), histN: 0,
      tearT: 0, enterT: 0, enterDur: 1, cell: -1, fieldDist: 65535, retargetT: 0, bias: 0,
      lastHitBy: 0, vaultY: 0,
    };
  }

  reset() {
    for (const z of this.pool) { z.active = false; z.state = ZSTATE.DEAD; z.histN = 0; }
    this.active.length = 0;
    this.aliveCount = 0;
    this.fieldCache.clear();
  }

  /** Returns number of zombies that count as alive (not dead) */
  countAlive() { return this.active.length; }

  spawn(entry, round) {
    const z = this.pool.find(p => !p.active);
    if (!z) return null;
    const g = this.game;
    const type = pickZombieType(g.rng, round);
    z.active = true;
    z.type = type;
    z.maxHp = Math.round(zombieHealthForRound(round) * type.hpMul);
    z.hp = z.maxHp;
    z.x = entry.outside[0]; z.y = entry.outside[1]; z.z = entry.outside[2];
    z.yaw = entry.yaw; z.vx = 0; z.vz = 0;
    z.entry = entry;
    z.state = ZSTATE.HIDDEN;
    z.stateT = 0;
    z.spawnDelay = 0.2 + g.rng() * 0.6;
    z.speedMul = 0.9 + g.rng() * 0.2;
    z.target = 0; z.staggerT = 0; z.attackHit = false; z.aiT = g.rng() * 0.2; z.nextCell = -1;
    z.stuck = 0; z.farT = 0; z.limp = false; z.aux = 0; z.histN = 0; z.tearT = 0; z.enterT = 0;
    z.retargetT = 0; z.bias = g.rng() * 40; z.lastHitBy = 0; z.vaultY = 0;
    z.lastCheckX = z.x; z.lastCheckZ = z.z; z.lastCheckT = g.time;
    this.active.push(z);
    entry.users = (entry.users || 0) + 1;
    return z;
  }

  despawn(z) {
    if (!z.active) return;
    z.active = false;
    z.state = ZSTATE.DEAD;
    const i = this.active.indexOf(z);
    if (i >= 0) this.active.splice(i, 1);
    if (z.entry && (z.state === ZSTATE.HIDDEN || z.state === ZSTATE.TEARING || z.state === ZSTATE.ENTERING)) z.entry.users = Math.max(0, (z.entry.users || 0) - 1);
  }

  /** Relocate a zombie to a fresh entry near its target (anti-stuck / too far). */
  respawnNear(z) {
    const g = this.game;
    const entry = g.pickSpawnEntry(true);
    if (!entry) return;
    if (z.entry) z.entry.users = Math.max(0, (z.entry.users || 0) - 1);
    z.x = entry.outside[0]; z.y = entry.outside[1]; z.z = entry.outside[2];
    z.yaw = entry.yaw; z.entry = entry; z.state = ZSTATE.HIDDEN; z.stateT = 0; z.spawnDelay = 0.1;
    z.stuck = 0; z.farT = 0; z.nextCell = -1; z.histN = 0; z.vx = 0; z.vz = 0;
    entry.users = (entry.users || 0) + 1;
    g.broadcast({ t: 'zvanish', id: z.id });
  }

  // ---------------- Flow fields ----------------
  getField(player) {
    const g = this.game, nav = g.nav;
    const cell = nav.cellOf(player.x, player.z);
    let fc = this.fieldCache.get(player.id);
    if (!fc) { fc = { dist: new Uint16Array(nav.n), cell: -2, time: -1, valid: false }; this.fieldCache.set(player.id, fc); }
    let c = cell;
    if (c < 0 || !nav.walk[c]) c = nav.nearestWalkable(player.x, player.z, 4);
    if (c < 0) return fc;
    if ((fc.cell !== c && g.time - fc.time > 0.12) || g.fieldsDirty > fc.dirtyStamp || !fc.valid) {
      nav.computeField([c], fc.dist);
      fc.cell = c; fc.time = g.time; fc.valid = true; fc.dirtyStamp = g.fieldsDirty;
    }
    return fc;
  }

  // ---------------- Update ----------------
  update(dt) {
    const g = this.game;
    // build spatial buckets for separation
    const grid = this._grid; grid.clear();
    for (const z of this.active) {
      if (z.state < ZSTATE.CHASE || z.state === ZSTATE.DEAD) continue;
      const k = ((z.x + 100) / 1.5 | 0) * 1000 + ((z.z + 100) / 1.5 | 0);
      let arr = grid.get(k); if (!arr) { arr = []; grid.set(k, arr); }
      arr.push(z);
    }
    for (let i = this.active.length - 1; i >= 0; i--) {
      const z = this.active[i];
      this._updateOne(z, dt);
      // record history
      const hi = (z.histN++) % HISTORY;
      z.hist[hi * 4] = z.x; z.hist[hi * 4 + 1] = z.y; z.hist[hi * 4 + 2] = z.z; z.hist[hi * 4 + 3] = z.yaw;
      z.histTick[hi] = g.tick;
    }
  }

  _updateOne(z, dt) {
    const g = this.game;
    z.stateT += dt;
    switch (z.state) {
      case ZSTATE.HIDDEN:
        if (z.stateT >= z.spawnDelay) {
          const e = z.entry;
          if (e.type === 'window' && e.boards > 0) { this._setState(z, ZSTATE.TEARING); z.tearT = 0; }
          else this._startEnter(z);
        }
        break;
      case ZSTATE.TEARING: {
        const e = z.entry;
        z.yaw = e.yaw;
        if (e.boards <= 0) { this._startEnter(z); break; }
        z.tearT += dt;
        z.aux = Math.min(255, Math.round(255 * z.tearT / z.type.tearTime));
        if (z.tearT >= z.type.tearTime) {
          z.tearT = 0;
          e.boards--;
          e.tearingBy = z.id;
          g.broadcast({ t: 'board', id: e.id, boards: e.boards, by: 'z' });
          if (e.boards <= 0) this._startEnter(z);
        }
        break;
      }
      case ZSTATE.ENTERING: {
        const e = z.entry;
        z.enterT += dt;
        const p = Math.min(1, z.enterT / z.enterDur);
        const ox = e.outside[0], oy = e.outside[1], oz = e.outside[2];
        const ix = e.inside[0], iy = e.inside[1], iz = e.inside[2];
        z.x = ox + (ix - ox) * p; z.z = oz + (iz - oz) * p;
        if (e.type === 'manhole') z.y = oy + (iy - oy) * p;
        else if (e.type === 'window') z.y = oy + (iy - oy) * p + Math.sin(p * Math.PI) * 0.9;
        else if (e.type === 'rubble') z.y = oy + (iy - oy) * p + Math.sin(p * Math.PI) * 1.1;
        else z.y = oy + (iy - oy) * p;
        z.yaw = e.yaw;
        z.aux = Math.round(255 * p);
        if (p >= 1) {
          z.y = iy; e.users = Math.max(0, (e.users || 0) - 1); e.tearingBy = 0;
          this._setState(z, ZSTATE.CHASE);
          z.lastCheckX = z.x; z.lastCheckZ = z.z; z.lastCheckT = g.time;
        }
        break;
      }
      case ZSTATE.STAGGER:
        z.staggerT -= dt;
        this._applyPhysics(z, dt, 0, 0);
        if (z.staggerT <= 0) this._setState(z, ZSTATE.CHASE);
        break;
      case ZSTATE.ATTACK: {
        const type = z.type;
        const tp = g.players.get(z.target);
        if (tp) z.yaw = angleLerp(z.yaw, Math.atan2(tp.x - z.x, tp.z - z.z), Math.min(1, dt * 10));
        const total = type.attackWindup + type.attackRecover;
        z.aux = Math.min(255, Math.round(255 * z.stateT / total));
        if (!z.attackHit && z.stateT >= type.attackWindup) {
          z.attackHit = true;
          if (tp && tp.state === PSTATE.ALIVE) {
            const dx = tp.x - z.x, dz = tp.z - z.z;
            const d = Math.hypot(dx, dz);
            const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
            const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
            if (d <= type.reach + 0.45 && dot > 0.2 && Math.abs(tp.y - z.y) < 1.6) g.damagePlayer(tp, type.attackDamage, z);
          }
        }
        this._applyPhysics(z, dt, 0, 0);
        if (z.stateT >= total) this._setState(z, ZSTATE.CHASE);
        break;
      }
      case ZSTATE.CHASE:
        this._chase(z, dt);
        break;
      default: break;
    }
  }

  _setState(z, s) { z.state = s; z.stateT = 0; z.aux = 0; }

  _startEnter(z) {
    const e = z.entry;
    this._setState(z, ZSTATE.ENTERING);
    z.enterT = 0;
    z.enterDur = e.type === 'hole' ? 0.8 : z.type.climbTime;
    e.tearingBy = z.id;
  }

  _chase(z, dt) {
    const g = this.game, nav = g.nav;
    const type = z.type;
    z.aiT -= dt;
    z.retargetT -= dt;
    // Retarget
    if (z.retargetT <= 0 || !g.players.get(z.target) || g.players.get(z.target).state !== PSTATE.ALIVE) {
      z.retargetT = type.id >= 2 ? 0.5 : 1.0;
      this._pickTarget(z);
    }
    const tp = g.players.get(z.target);
    if (!tp) { this._applyPhysics(z, dt, 0, 0); return; }
    const dx = tp.x - z.x, dz = tp.z - z.z;
    const dist = Math.hypot(dx, dz);
    // Attack?
    if (dist <= type.reach && Math.abs(tp.y - z.y) < 1.5 && tp.state === PSTATE.ALIVE) {
      this._setState(z, ZSTATE.ATTACK);
      z.attackHit = false;
      return;
    }
    // Steering
    let wantX, wantZ;
    if (dist < 2.2) { wantX = dx / dist; wantZ = dz / dist; }
    else {
      if (z.aiT <= 0) {
        z.aiT = dist < 15 ? 0.1 : 0.3;
        const fc = this.fieldCache.get(tp.id);
        const cell = nav.cellOf(z.x, z.z);
        z.cell = cell;
        if (fc && fc.valid && cell >= 0) {
          z.fieldDist = fc.dist[cell];
          let next = nav.descend(fc.dist, cell);
          if (next < 0 && !nav.walk[cell]) {
            const nw = nav.nearestWalkable(z.x, z.z, 3);
            next = nw;
          }
          z.nextCell = next;
        } else z.nextCell = -1;
      }
      if (z.nextCell >= 0) {
        const tx = nav.centerX(z.nextCell), tz = nav.centerZ(z.nextCell);
        let ddx = tx - z.x, ddz = tz - z.z;
        const dl = Math.hypot(ddx, ddz);
        if (dl < 0.12) { z.aiT = 0; wantX = z.dirX; wantZ = z.dirZ; }
        else { wantX = ddx / dl; wantZ = ddz / dl; }
      } else { wantX = dx / dist; wantZ = dz / dist; }
    }
    // smooth direction change (turn rate)
    const wantYaw = Math.atan2(wantX, wantZ);
    z.yaw = angleLerp(z.yaw, wantYaw, Math.min(1, dt * type.turnRate));
    const diff = Math.abs(wrapAngle(wantYaw - z.yaw));
    const turnFactor = diff > 1.2 ? 0.45 : 1.0;
    let speed = type.speed * z.speedMul * turnFactor * (z.limp ? 0.7 : 1);
    if (g.round >= 15) speed *= 1 + Math.min(0.15, (g.round - 15) * 0.01);
    const cellHere = nav.cellOf(z.x, z.z);
    if (cellHere >= 0 && nav.walk[cellHere] === 2) speed *= 0.6;
    z.dirX = Math.sin(z.yaw); z.dirZ = Math.cos(z.yaw);
    const vx = z.dirX * speed, vz = z.dirZ * speed;
    this._applyPhysics(z, dt, vx, vz);
    // Stuck / too far checks every 2s
    if (g.time - z.lastCheckT > 2) {
      const moved = Math.hypot(z.x - z.lastCheckX, z.z - z.lastCheckZ);
      z.lastCheckX = z.x; z.lastCheckZ = z.z; z.lastCheckT = g.time;
      if (moved < 0.35 && dist > 2.5) {
        z.stuck += 2;
        if (z.stuck >= 4 && z.stuck < 8) {
          // nudge to nearest walkable cell center
          const nw = nav.nearestWalkable(z.x + z.dirX * 0.8, z.z + z.dirZ * 0.8, 3);
          if (nw >= 0) { z.x = nav.centerX(nw); z.z = nav.centerZ(nw); }
        } else if (z.stuck >= 8) { this.respawnNear(z); return; }
      } else z.stuck = 0;
      if (z.fieldDist === 65535 || z.fieldDist > 1400) { z.farT += 2; if (z.farT >= 10) { this.respawnNear(z); return; } }
      else z.farT = 0;
    }
  }

  _pickTarget(z) {
    const g = this.game, nav = g.nav;
    const cell = nav.cellOf(z.x, z.z);
    let best = null, bd = Infinity;
    let anyAlive = false;
    for (const p of g.players.values()) if (p.state === PSTATE.ALIVE && (p.ready || g.time - p.joinedAt >= 45)) { anyAlive = true; break; }
    for (const p of g.players.values()) {
      if (p.state !== PSTATE.ALIVE && (anyAlive || p.state !== PSTATE.DOWNED)) continue;
      if (!p.ready && g.time - p.joinedAt < 45) continue; // client still loading: not a target
      const fc = this.getField(p);
      let d;
      if (fc.valid && cell >= 0) d = fc.dist[cell];
      else d = Math.hypot(p.x - z.x, p.z - z.z) * 20;
      if (d === 65535) d = 60000 + Math.hypot(p.x - z.x, p.z - z.z);
      d += z.bias;
      if (d < bd) { bd = d; best = p; }
    }
    z.target = best ? best.id : 0;
    z.fieldDist = bd;
  }

  _applyPhysics(z, dt, vx, vz) {
    const g = this.game;
    // separation from other zombies
    let sx = 0, sz = 0;
    if (z.state >= ZSTATE.CHASE && z.state !== ZSTATE.DEAD) {
      const gx = (z.x + 100) / 1.5 | 0, gz = (z.z + 100) / 1.5 | 0;
      for (let ax = -1; ax <= 1; ax++) for (let az = -1; az <= 1; az++) {
        const arr = this._grid.get((gx + ax) * 1000 + gz + az);
        if (!arr) continue;
        for (const o of arr) {
          if (o === z) continue;
          const dx = z.x - o.x, dz = z.z - o.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 0.55 * 0.55 && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            const push = (0.55 - d) / 0.55;
            sx += dx / d * push; sz += dz / d * push;
          } else if (d2 <= 1e-6) { sx += (g.rng() - 0.5); sz += (g.rng() - 0.5); }
        }
      }
      // push out of players (zombies don't overlap players)
      for (const p of g.players.values()) {
        if (p.state === PSTATE.DEAD || p.state === PSTATE.SPECTATOR) continue;
        const dx = z.x - p.x, dz = z.z - p.z;
        const min = ZOMBIE_RADIUS + 0.36;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2); sx += dx / d * (min - d) * 6; sz += dz / d * (min - d) * 6; }
      }
    }
    z.x += (vx + sx * 1.6) * dt;
    z.z += (vz + sz * 1.6) * dt;
    // ground + collision
    const body = z;
    body.vy = 0; body.onGround = true;
    resolveZombie(g.world.hash, body);
    // vault height visual
    const cell = g.nav.cellOf(z.x, z.z);
    if (cell >= 0 && g.nav.walk[cell] === 2) z.vaultY = g.nav.vaultH[cell]; else z.vaultY = 0;
  }

  /** Position at a past tick (lag compensation). Writes into out {x,y,z,yaw}. */
  positionAtTick(z, tick, out) {
    const n = Math.min(z.histN, HISTORY);
    if (n === 0) { out.x = z.x; out.y = z.y; out.z = z.z; out.yaw = z.yaw; return out; }
    let bestI = -1, bestD = Infinity, prevI = -1;
    for (let k = 0; k < n; k++) {
      const hi = (z.histN - 1 - k) % HISTORY;
      const idx = hi < 0 ? hi + HISTORY : hi;
      const d = Math.abs(z.histTick[idx] - tick);
      if (d < bestD) { bestD = d; bestI = idx; }
      if (z.histTick[idx] <= tick) { prevI = idx; break; }
    }
    if (bestI < 0) { out.x = z.x; out.y = z.y; out.z = z.z; out.yaw = z.yaw; return out; }
    out.x = z.hist[bestI * 4]; out.y = z.hist[bestI * 4 + 1]; out.z = z.hist[bestI * 4 + 2]; out.yaw = z.hist[bestI * 4 + 3];
    return out;
  }

  /** Apply a hit. Returns true if killed. */
  damage(z, dmg, part, player, hitX, hitY, hitZ) {
    const g = this.game;
    if (!z.active || z.state === ZSTATE.DEAD) return false;
    if (g.oneShotUntil > g.time) dmg = z.hp + 1;
    z.hp -= dmg;
    z.lastHitBy = player ? player.id : 0;
    const killed = z.hp <= 0;
    if (!killed) {
      if (part === 2 && !z.limp && g.rng() < 0.5) z.limp = true;
      if ((part === 1 || dmg > z.maxHp * 0.25) && z.state === ZSTATE.CHASE) { this._setState(z, ZSTATE.STAGGER); z.staggerT = part === 1 ? 0.38 : 0.28; }
      else if (part === 2 && z.state === ZSTATE.CHASE && g.rng() < 0.35) { this._setState(z, ZSTATE.STAGGER); z.staggerT = 0.3; }
    }
    g.broadcast({ t: 'hit', z: z.id, part, dmg: Math.round(dmg), k: killed ? 1 : 0, p: player ? player.id : 0, x: r2(hitX), y: r2(hitY), z2: r2(hitZ) });
    if (killed) this.kill(z, player, part === 1);
    return killed;
  }

  kill(z, player, headshot, silent = false) {
    if (!z.active) return;
    const g = this.game;
    if (z.entry && z.state <= ZSTATE.ENTERING) { z.entry.users = Math.max(0, (z.entry.users || 0) - 1); z.entry.tearingBy = 0; }
    z.state = ZSTATE.DEAD;
    z.active = false;
    const i = this.active.indexOf(z);
    if (i >= 0) this.active.splice(i, 1);
    g.onZombieKilled(z, player, headshot, silent);
  }
}

// Zombie-specific collision resolve: ignores zombie-pass gaps and vaultable boxes.
const ZB = { x: 0, y: 0, z: 0, vy: 0, onGround: true };
const _out = { x: 0, z: 0 };
function resolveZombie(hash, z) {
  const r = ZOMBIE_RADIUS;
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    const boxes = hash.query(z.x - r, z.z - r, z.x + r, z.z + r);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.noCollide || b.zombiePass || b.vault || b.noNav) continue;
      if (b.door && !b.door.closed) continue;
      if (b.y1 <= z.y + 0.5 || b.y0 >= z.y + 1.5) continue;
      if (pushCircleOutOfBox(b, z.x, z.z, r, _out)) { z.x = _out.x; z.z = _out.z; moved = true; }
    }
    if (!moved) break;
  }
  // floor: sidewalks/interiors are 0.15 slabs
  let floor = 0;
  const boxes = hash.query(z.x - 0.2, z.z - 0.2, z.x + 0.2, z.z + 0.2);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.kind !== 'floor') continue;
    if (Math.abs(z.x - b.cx) <= b.hw && Math.abs(z.z - b.cz) <= b.hd && b.y1 > floor) floor = b.y1;
  }
  z.y = floor;
}

function r2(v) { return Math.round(v * 100) / 100; }
