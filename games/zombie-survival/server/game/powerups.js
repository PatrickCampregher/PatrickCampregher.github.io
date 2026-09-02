// Temporary powerups dropped by zombies: FULL RESUPPLY, ONE-SHOT, DOUBLE POINTS, BLAST WAVE.
import { POWERUP, POWERUP_TYPES, POINTS, PSTATE } from '../../shared/constants.js';
import { WEAPONS } from '../../shared/weapons.js';
import { ZSTATE } from '../../shared/zombies.js';

export class PowerupManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.nextId = 1;
    this.lastDrop = -999;
    this.countThisRound = 0;
  }

  reset() { this.list.length = 0; this.lastDrop = -999; this.countThisRound = 0; }
  newRound() { this.countThisRound = 0; }

  /** Called on zombie kill. */
  maybeDrop(x, y, z) {
    const g = this.game;
    if (this.countThisRound >= POWERUP.maxPerRound) return;
    if (g.time - this.lastDrop < POWERUP.minGapSeconds) return;
    if (g.rng() >= POWERUP.dropChance) return;
    // weights
    let wResupply = 30, wDouble = 30, wOne = 25, wBlast = 15;
    let lowAmmo = false;
    for (const p of g.players.values()) {
      const w = p.weapons[p.slot];
      if (w && w.reserve < WEAPONS[w.id].reserve * 0.25) lowAmmo = true;
    }
    if (lowAmmo) wResupply += 40;
    const total = wResupply + wDouble + wOne + wBlast;
    let r = g.rng() * total;
    let type;
    if ((r -= wResupply) <= 0) type = 0; else if ((r -= wDouble) <= 0) type = 2; else if ((r -= wOne) <= 0) type = 1; else type = 3;
    // make sure the spot is walkable
    const cell = g.nav.nearestWalkable(x, z, 3);
    if (cell >= 0) { x = g.nav.centerX(cell); z = g.nav.centerZ(cell); }
    const pu = { id: this.nextId++ & 0xffff, type, x, y: Math.max(0, y), z, t: 0 };
    this.list.push(pu);
    this.lastDrop = g.time;
    this.countThisRound++;
    g.broadcast({ t: 'powerup', ev: 'spawn', id: pu.id, type, x: r2(x), y: r2(pu.y), z: r2(z) });
  }

  update(dt) {
    const g = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const pu = this.list[i];
      pu.t += dt;
      if (pu.t >= POWERUP.lifetime) { this.list.splice(i, 1); g.broadcast({ t: 'powerup', ev: 'expire', id: pu.id }); continue; }
      for (const p of g.players.values()) {
        if (p.state !== PSTATE.ALIVE) continue;
        if (Math.hypot(p.x - pu.x, p.z - pu.z) < 1.35 && Math.abs(p.y - pu.y) < 2) {
          this.list.splice(i, 1);
          this.apply(pu.type, p);
          g.broadcast({ t: 'powerup', ev: 'pickup', id: pu.id, type: pu.type, by: p.id, dur: POWERUP.effectTime });
          break;
        }
      }
    }
  }

  apply(type, player) {
    const g = this.game;
    const name = POWERUP_TYPES[type];
    switch (name) {
      case 'resupply':
        for (const p of g.players.values()) {
          if (p.state === PSTATE.DEAD || p.state === PSTATE.SPECTATOR) continue;
          for (const w of p.weapons) if (w) { const def = WEAPONS[w.id]; w.reserve = def.reserve; }
          g.markSelf(p);
        }
        break;
      case 'oneshot': g.oneShotUntil = g.time + POWERUP.effectTime; break;
      case 'double': g.doubleUntil = g.time + POWERUP.effectTime; break;
      case 'blast': {
        const victims = [...g.zombies.active].filter(z => z.state !== ZSTATE.HIDDEN && z.state !== ZSTATE.DEAD);
        for (const z of victims) {
          g.broadcast({ t: 'hit', z: z.id, part: 0, dmg: 9999, k: 1, p: player.id, x: r2(z.x), y: r2(z.y + 1), z2: r2(z.z), blast: 1 });
          g.zombies.kill(z, player, false, true);
        }
        for (const p of g.players.values()) if (p.state !== PSTATE.DEAD && p.state !== PSTATE.SPECTATOR) g.awardPoints(p, POINTS.blastWave, 'blast');
        break;
      }
      default: break;
    }
  }

  snapshotList() {
    return this.list.map(pu => ({ id: pu.id, type: pu.type, x: pu.x, y: pu.y, z: pu.z, ttl: Math.max(0, Math.min(255, Math.round(255 * (1 - pu.t / POWERUP.lifetime)))) }));
  }
}

function r2(v) { return Math.round(v * 100) / 100; }
