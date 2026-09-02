// Mystery Weapon Box: spin, weighted weapon result, stuffed-bear relocation.
import { MYSTERY_BOX } from '../../shared/constants.js';
import { rollBoxWeapon, WEAPONS } from '../../shared/weapons.js';

export class MysteryBox {
  constructor(game) {
    this.game = game;
    this.loc = 0;
    this.state = 'idle'; // idle | spinning | ready | bear | moving
    this.t = 0;
    this.weapon = null;
    this.user = 0;
    this.uses = 0; // uses at the current location
  }

  reset() {
    this.loc = 0; this.state = 'idle'; this.t = 0; this.weapon = null; this.user = 0; this.uses = 0;
  }

  serialize() {
    return { t: 'box', loc: this.loc, state: this.state, weapon: this.weapon ? this.weapon.id : null, user: this.user, timer: r2(this.timerLeft()) };
  }

  timerLeft() {
    if (this.state === 'spinning') return MYSTERY_BOX.spinTime - this.t;
    if (this.state === 'ready') return MYSTERY_BOX.pickupWindow - this.t;
    return 0;
  }

  location() { return this.game.world.boxLocations[this.loc]; }

  /** Player pressed interact at the box. */
  interact(player) {
    const g = this.game;
    const loc = this.location();
    if (Math.hypot(player.x - loc.x, player.z - loc.z) > 2.8) return;
    if (this.state === 'ready') {
      if (this.user !== player.id) return;
      g.giveWeapon(player, this.weapon.id, true);
      this.state = 'idle'; this.t = 0; this.weapon = null; this.user = 0;
      g.broadcast(this.serialize());
      return;
    }
    if (this.state !== 'idle') return;
    if (player.points < MYSTERY_BOX.cost) { g.sendTo(player, { t: 'notice', text: 'NOT ENOUGH POINTS' }); return; }
    g.awardPoints(player, -MYSTERY_BOX.cost, 'box');
    this.state = 'spinning'; this.t = 0; this.user = player.id; this.weapon = null;
    this.uses++;
    g.broadcast(this.serialize());
  }

  update(dt) {
    const g = this.game;
    if (this.state === 'idle') return;
    this.t += dt;
    if (this.state === 'spinning' && this.t >= MYSTERY_BOX.spinTime) {
      // bear?
      let bearChance = 0;
      if (this.uses > MYSTERY_BOX.bearFreeUses) bearChance = Math.min(MYSTERY_BOX.bearMaxChance, MYSTERY_BOX.bearBaseChance + (this.uses - MYSTERY_BOX.bearFreeUses - 1) * MYSTERY_BOX.bearChancePerUse);
      if (g.world.boxLocations.length > 1 && (this.forceBear || g.rng() < bearChance)) {
        this.forceBear = false;
        this.state = 'bear'; this.t = 0;
        const p = g.players.get(this.user);
        if (p) g.awardPoints(p, MYSTERY_BOX.cost, 'refund');
        g.broadcast(this.serialize());
        return;
      }
      const p = g.players.get(this.user);
      const exclude = p ? p.weapons.filter(Boolean).map(w => w.id) : [];
      this.weapon = rollBoxWeapon(g.rng, exclude);
      this.state = 'ready'; this.t = 0;
      g.broadcast(this.serialize());
    } else if (this.state === 'ready' && this.t >= MYSTERY_BOX.pickupWindow) {
      this.state = 'idle'; this.t = 0; this.weapon = null; this.user = 0;
      g.broadcast(this.serialize());
    } else if (this.state === 'bear' && this.t >= 4.0) {
      this.state = 'moving'; this.t = 0;
      g.broadcast(this.serialize());
    } else if (this.state === 'moving' && this.t >= 2.0) {
      // choose a new location (prefer unlocked areas, but any is allowed)
      const locs = g.world.boxLocations;
      const candidates = [];
      for (let i = 0; i < locs.length; i++) if (i !== this.loc) candidates.push(i);
      const unlocked = candidates.filter(i => g.unlocked.has(locs[i].area));
      const pool = unlocked.length && g.rng() < 0.7 ? unlocked : candidates;
      this.loc = pool[Math.floor(g.rng() * pool.length)];
      this.uses = 0; this.state = 'idle'; this.t = 0; this.weapon = null; this.user = 0;
      g.broadcast(this.serialize());
    }
  }
}

function r2(v) { return Math.round(v * 100) / 100; }
