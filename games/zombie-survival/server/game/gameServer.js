// Authoritative game simulation: players, rounds, spawning, damage, points, doors, box, powerups, snapshots.
import { MAP } from '../../shared/mapdata.js';
import { buildWorld } from '../../shared/mapbuild.js';
import { NavGrid } from '../../shared/nav.js';
import { PLAYER, POINTS, ROUND, PSTATE, RSTATE, TICK_RATE, TICK_MS, MYSTERY_BOX } from '../../shared/constants.js';
import { WEAPONS, WEAPON_INDEX, mulberry32 } from '../../shared/weapons.js';
import { ZSTATE, zombieCountForRound, maxAliveForRound, spawnIntervalForRound } from '../../shared/zombies.js';
import { encodeSnapshot, decodeInput, decodePing, encodePing, BIN } from '../../shared/protocol.js';
import { circleOverlapsBox } from '../../shared/collision.js';
import { ZombieManager } from './zombies.js';
import { MysteryBox } from './box.js';
import { PowerupManager } from './powerups.js';
import { processShot, updateProjectiles } from './combat.js';
import { PERK, PAP } from '../../shared/constants.js';
import { PERKS, PERK_RULES, perkCost, computeMods, pickLine } from '../../shared/perks.js';
import { papTargetId, papCostFor } from '../../shared/pap.js';

export class GameServer {
  constructor(lobby) {
    this.lobby = lobby;
    this.world = buildWorld(MAP);
    this.nav = new NavGrid(MAP, this.world.boxes);
    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    this.rng = mulberry32(seed);
    this.players = new Map();
    this.zombies = new ZombieManager(this);
    this.box = new MysteryBox(this);
    this.powerups = new PowerupManager(this);
    this.projectiles = [];
    this.nextProjId = 1;
    this.POINTS = POINTS;
    this.time = 0; this.tick = 0;
    this.round = 0; this.roundState = RSTATE.WAITING; this.roundT = ROUND.firstRoundDelay;
    this.roundTotal = 0; this.spawned = 0; this.killedThisRound = 0; this.nextSpawnT = 0;
    this.unlocked = new Set([MAP.startArea]);
    this.fieldsDirty = 1;
    this.oneShotUntil = -1; this.doubleUntil = -1;
    this.pap = { state: 'idle', user: 0, weapon: null, result: null, slot: 0, t: 0 }; // pack-a-punch machine
    this.running = false; this.gameOver = false; this.gameOverT = 0;
    this._snapBuf = new ArrayBuffer(16384);
    this._selfDirty = new Set();
    this._scoresDirty = false; this._scoresT = 0;
    this._timer = null; this._last = 0;
    this._spawnIdx = 0;
    this.startedAt = Date.now();
  }

  // ---------------- lifecycle ----------------
  start() {
    this.running = true;
    this._last = performance.now();
    this._timer = setInterval(() => this._loop(), TICK_MS);
    // create every player first so each init message lists the full roster
    const added = [];
    for (const lp of this.lobby.lobby.players.values()) added.push(this.addPlayer(lp, false));
    for (const p of added) this.sendTo(p, this._initMessage(p));
  }

  stop() {
    this.running = false;
    clearInterval(this._timer);
    this._timer = null;
  }

  _loop() {
    const now = performance.now();
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (this.paused) return;
    if (dt > 0.1) dt = 0.1;
    try { this.step(dt); }
    catch (e) { console.error('[game] step error', e); }
  }

  // ---------------- players ----------------
  addPlayer(lp, sendInit = true) {
    if (this.players.has(lp.id)) return this.players.get(lp.id);
    const sp = this._pickSpawn();
    const p = {
      id: lp.id, name: lp.name, lp, conn: lp.conn,
      x: sp.x, y: sp.y, z: sp.z, yaw: sp.yaw, pitch: 0, flags: 0,
      state: PSTATE.ALIVE, hp: PLAYER.maxHealth, lastDamage: -99, points: PLAYER.startPoints,
      weapons: [{ id: 'warden_p9', mag: WEAPONS.warden_p9.mag, reserve: WEAPONS.warden_p9.reserve }, null], slot: 0,
      lastShot: -1, reloadEnd: 0, reloadShells: 0, switchEnd: 0,
      downedAt: 0, reviveProgress: 0, hold: null, holdT: 0, boardPoints: 0, invulnUntil: 0,
      stats: { kills: 0, headshots: 0, revives: 0, shots: 0, hits: 0, downs: 0, points: 0 },
      lastInputSeq: 0, lastInputTime: this.time, acceptAny: true, renderOffset: 0, ready: false, joinedAt: this.time,
      perks: [], mods: computeMods([]), maxHp: PLAYER.maxHealth, soloRevives: 0, selfReviveAt: 0,
    };
    this.players.set(p.id, p);
    lp.inGame = true;
    if (sendInit) {
      this.sendTo(p, this._initMessage(p));
      this.broadcastExcept(p, { t: 'pjoin', id: p.id, name: p.name, points: p.points });
    }
    this.markSelf(p);
    this._scoresDirty = true;
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.zombies.fieldCache.delete(id);
    this.broadcast({ t: 'pleave', id });
    if (this.players.size > 0) this._checkGameOver();
  }

  _pickSpawn() {
    const spawns = this.world.playerSpawns;
    for (let k = 0; k < spawns.length; k++) {
      const s = spawns[(this._spawnIdx + k) % spawns.length];
      let free = true;
      for (const p of this.players.values()) if (Math.hypot(p.x - s.x, p.z - s.z) < 1.2) { free = false; break; }
      if (free) { this._spawnIdx = (this._spawnIdx + k + 1) % spawns.length; return s; }
    }
    return spawns[0];
  }

  _initMessage(p) {
    const boards = {};
    for (const id in this.world.entries) boards[id] = this.world.entries[id].boards;
    const doors = [];
    for (const id in this.world.doors) if (!this.world.doors[id].closed) doors.push(id);
    return {
      t: 'init', id: p.id, map: MAP.name, round: this.round, roundState: this.roundState, tick: this.tick, time: this.time * 1000,
      players: [...this.players.values()].map(q => ({ id: q.id, name: q.name, points: q.points, state: q.state })),
      doors, boards, box: this.box.serialize(), unlocked: [...this.unlocked],
      spawn: { x: p.x, y: p.y, z: p.z, yaw: p.yaw },
      effects: { oneshot: Math.max(0, this.oneShotUntil - this.time), double: Math.max(0, this.doubleUntil - this.time) },
      powerups: this.powerups.list.map(pu => ({ id: pu.id, type: pu.type, x: pu.x, y: pu.y, z: pu.z })),
      zombiesLeft: this.roundTotal - this.killedThisRound,
      pap: this._papSerialize(),
    };
  }

  // ---------------- messaging ----------------
  sendTo(p, msg) { if (p && p.conn && p.conn.alive) p.conn.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }
  broadcast(msg) {
    const s = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const p of this.players.values()) if (p.conn.alive) p.conn.send(s);
  }
  broadcastExcept(ex, msg) {
    const s = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const p of this.players.values()) if (p !== ex && p.conn.alive) p.conn.send(s);
  }
  broadcastBinary(buf) { for (const p of this.players.values()) if (p.conn.alive) p.conn.send(buf); }
  markSelf(p) { this._selfDirty.add(p); }

  _selfMessage(p) {
    return {
      t: 'self', points: p.points, hp: Math.round(p.hp), state: p.state, slot: p.slot,
      weapons: p.weapons.map(w => w ? { id: w.id, mag: w.mag, reserve: w.reserve } : null),
      reload: p.reloadEnd > this.time ? r2(p.reloadEnd - this.time) : 0,
      stats: p.stats,
      perks: p.perks, mods: p.mods, selfRevive: p.selfReviveAt > this.time ? r2(p.selfReviveAt - this.time) : 0,
    };
  }

  handleMessage(lp, msg) {
    const p = this.players.get(lp.id);
    if (!p) return;
    switch (msg.t) {
      case 'shoot': processShot(this, p, msg); break;
      case 'reload': this._reload(p); break;
      case 'switch': this._switch(p, msg.slot | 0); break;
      case 'interact': this._interact(p, String(msg.target || '')); break;
      case 'hold': this._hold(p, msg.target ? String(msg.target) : null); break;
      case 'rt': p.renderOffset = +msg.o || 0; break;
      case 'cheat':
        // developer/testing only: server must run with --dev
        if (!this.lobby.dev) break;
        if (msg.god != null) p.god = !!msg.god;
        if (msg.points != null) { p.points = Math.max(0, msg.points | 0); this.markSelf(p); }
        if (msg.weapon && WEAPONS[msg.weapon]) this.giveWeapon(p, msg.weapon, true);
        if (msg.round) { this.round = Math.max(1, msg.round | 0) - 1; this.roundState = RSTATE.ENDING; this.roundT = 0.1; for (const z of [...this.zombies.active]) this.zombies.kill(z, null, false, true); }
        if (msg.killAll) for (const z of [...this.zombies.active]) this.zombies.kill(z, null, false, true);
        if (Array.isArray(msg.tp) && msg.tp.length >= 2) { p.x = +msg.tp[0]; p.z = +msg.tp[1]; p.y = +(msg.tp[2] || 0); p.acceptAny = true; this._correct(p); }
        if (msg.powerup != null) { this.powerups.lastDrop = -999; this.powerups.countThisRound = 0; const save = this.rng; this.rng = () => 0; this.powerups.maybeDrop(p.x + Math.sin(p.yaw) * 2.5, p.y, p.z + Math.cos(p.yaw) * 2.5); this.rng = save; const pu = this.powerups.list[this.powerups.list.length - 1]; if (pu && typeof msg.powerup === 'number') { pu.type = msg.powerup; this.broadcast({ t: 'powerup', ev: 'expire', id: pu.id }); this.broadcast({ t: 'powerup', ev: 'spawn', id: pu.id, type: pu.type, x: pu.x, y: pu.y, z: pu.z }); } }
        if (msg.bear) { this.box.uses = 99; this.box.forceBear = true; }
        // deterministic stepping for recordings/tests: pause the real-time loop and advance by exact amounts
        if (msg.pause != null) this.paused = !!msg.pause;
        if (typeof msg.step === 'number' && Number.isFinite(msg.step)) { try { this.step(Math.max(0.001, Math.min(0.1, msg.step))); } catch (e) { console.error('[game] step error', e); } }
        if (msg.openAll) { for (const id in this.world.doors) { const door = this.world.doors[id]; if (!door.closed) continue; door.closed = false; this.nav.openDoor(id); for (const a of door.areas) this.unlocked.add(a); this.broadcast({ t: 'door', id, by: p.id }); } this.fieldsDirty++; }
        if (msg.perk && PERKS[msg.perk]) this._grantPerk(p, msg.perk);
        if (msg.clearPerks) this._clearPerks(p, true);
        break;
      default: break;
    }
  }

  handleBinary(lp, buf) {
    const p = this.players.get(lp.id);
    if (!p) return;
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const type = dv.getUint8(0);
    if (type === BIN.INPUT) this._onInput(p, decodeInput(dv, 1));
    else if (type === BIN.PING) {
      const pg = decodePing(dv);
      p.conn.send(encodePing(BIN.PONG, pg.clientTime, this.time * 1000));
    }
  }

  // ---------------- input ----------------
  _onInput(p, inp) {
    if (inp.seq <= p.lastInputSeq && p.lastInputSeq - inp.seq < 1e6) return;
    p.lastInputSeq = inp.seq;
    if (!p.ready) { p.ready = true; p.invulnUntil = Math.max(p.invulnUntil, this.time + 2); }
    const dt = Math.max(0, Math.min(0.5, this.time - p.lastInputTime));
    p.lastInputTime = this.time;
    if (!Number.isFinite(inp.x) || !Number.isFinite(inp.y) || !Number.isFinite(inp.z)) return;
    p.yaw = inp.yaw; p.pitch = inp.pitch; p.flags = inp.flags;
    if (p.state === PSTATE.ALIVE) {
      const maxMove = PLAYER.sprintSpeed * 1.4 * dt + 0.4;
      const d = Math.hypot(inp.x - p.x, inp.z - p.z);
      if ((d > maxMove && !p.acceptAny) || inp.y < -1 || inp.y > 40) { this._correct(p); return; }
      if (this._insideSolid(inp.x, inp.y, inp.z)) { this._correct(p); return; }
      p.x = inp.x; p.y = inp.y; p.z = inp.z;
      p.acceptAny = false;
    }
  }

  _correct(p) { this.sendTo(p, { t: 'correct', x: r2(p.x), y: r2(p.y), z: r2(p.z) }); }

  _insideSolid(x, y, z) {
    const boxes = this.world.hash.query(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
    for (const b of boxes) {
      if (b.noCollide || b.noNav) continue;
      if (b.door && !b.door.closed) continue;
      if (b.y1 <= y + 0.5 || b.y0 >= y + 1.5) continue;
      if (circleOverlapsBox(b, x, z, 0.18)) return true;
    }
    return false;
  }

  // ---------------- weapons ----------------
  _reload(p) {
    if (p.state !== PSTATE.ALIVE) return;
    const held = p.weapons[p.slot]; if (!held) return;
    const def = WEAPONS[held.id];
    if (held.mag >= def.mag || held.reserve <= 0) return;
    if (p.reloadEnd > this.time || p.switchEnd > this.time) return;
    p.reloadEnd = this.time + (def.reloadTime + (def.reloadPerShell ? 0.4 : 0)) * p.mods.reload;
    p.reloadShells = def.reloadPerShell ? 1 : 0;
    this.markSelf(p);
  }

  _switch(p, slot) {
    if (p.state !== PSTATE.ALIVE) return;
    if (slot < 0 || slot > 1 || slot === p.slot || !p.weapons[slot]) return;
    p.slot = slot;
    p.reloadEnd = 0; p.reloadShells = 0;
    p.switchEnd = this.time + WEAPONS[p.weapons[slot].id].switchTime;
    this.markSelf(p);
  }

  giveWeapon(p, weaponId, announce = true) {
    const def = WEAPONS[weaponId];
    if (!def) return;
    const existing = p.weapons.findIndex(w => w && w.id === weaponId);
    if (existing >= 0) {
      p.weapons[existing].mag = def.mag; p.weapons[existing].reserve = def.reserve;
      p.slot = existing;
    } else {
      let slot = p.weapons.findIndex(w => !w);
      if (slot < 0) slot = p.slot;
      p.weapons[slot] = { id: weaponId, mag: def.mag, reserve: def.reserve };
      p.slot = slot;
    }
    p.reloadEnd = 0; p.reloadShells = 0;
    p.switchEnd = this.time + def.switchTime;
    this.markSelf(p);
    if (announce) this.sendTo(p, { t: 'weapon', slot: p.slot, id: weaponId });
  }

  // ---------------- interactions ----------------
  _interact(p, target) {
    if (p.state !== PSTATE.ALIVE) return;
    const [kind, id] = target.split(':');
    if (kind === 'door') this._buyDoor(p, id);
    else if (kind === 'box') this.box.interact(p);
    else if (kind === 'wallbuy') this._wallBuy(p, id | 0);
    else if (kind === 'perk') this._buyPerk(p, id);
    else if (kind === 'pap') this._papInteract(p);
  }

  _buyDoor(p, id) {
    const door = this.world.doors[id];
    if (!door || !door.closed) return;
    const b = door.box;
    if (Math.hypot(p.x - b.cx, p.z - b.cz) > 3.4) return;
    if (p.points < door.cost) { this.sendTo(p, { t: 'notice', text: 'NOT ENOUGH POINTS' }); return; }
    this.awardPoints(p, -door.cost, 'door');
    door.closed = false;
    this.nav.openDoor(id);
    this.fieldsDirty++;
    for (const a of door.areas) this.unlocked.add(a);
    this.broadcast({ t: 'door', id, by: p.id });
  }

  _wallBuy(p, idx) {
    const wb = this.world.wallBuys[idx];
    if (!wb) return;
    if (Math.hypot(p.x - wb.x, p.z - wb.z) > 3.2) return;
    const has = p.weapons.find(w => w && (w.id === wb.weapon || w.id === wb.weapon + '_pap'));
    if (has) {
      const def = WEAPONS[has.id]; // an upgraded weapon gets (expensive) ammo, never a second base gun
      const cost = def.pap ? PAP.wallAmmoCost : Math.round(wb.cost / 2);
      if (has.reserve >= def.reserve && has.mag >= def.mag) return;
      if (p.points < cost) { this.sendTo(p, { t: 'notice', text: 'NOT ENOUGH POINTS' }); return; }
      this.awardPoints(p, -cost, 'ammo');
      has.reserve = def.reserve;
      this.markSelf(p);
      this.sendTo(p, { t: 'ammo', id: wb.weapon });
    } else {
      if (p.points < wb.cost) { this.sendTo(p, { t: 'notice', text: 'NOT ENOUGH POINTS' }); return; }
      this.awardPoints(p, -wb.cost, 'weapon');
      this.giveWeapon(p, wb.weapon, true);
    }
  }

  _hold(p, target) {
    if (!target) { p.hold = null; p.holdT = 0; return; }
    if (p.state !== PSTATE.ALIVE) return;
    const [kind, id] = target.split(':');
    if (kind === 'revive') {
      const t = this.players.get(id | 0);
      if (!t || t.state !== PSTATE.DOWNED) return;
      p.hold = { kind, id: t.id }; p.holdT = 0;
    } else if (kind === 'board') {
      const e = this.world.entries[id];
      if (!e || e.boards >= e.maxBoards) return;
      p.hold = { kind, id }; p.holdT = 0;
    }
  }

  _updateHolds(dt) {
    for (const p of this.players.values()) {
      if (!p.hold) continue;
      if (p.state !== PSTATE.ALIVE) { p.hold = null; continue; }
      if (p.hold.kind === 'revive') {
        const t = this.players.get(p.hold.id);
        if (!t || t.state !== PSTATE.DOWNED || Math.hypot(p.x - t.x, p.z - t.z) > 2.4) { p.hold = null; if (t) t.reviveProgress = 0; continue; }
        t.reviveProgress = Math.min(1, t.reviveProgress + dt / (PLAYER.reviveTime * p.mods.revive));
        t.reviver = p.id;
        if (t.reviveProgress >= 1) { this._revive(t, p); p.hold = null; }
      } else if (p.hold.kind === 'board') {
        const e = this.world.entries[p.hold.id];
        if (!e || e.boards >= e.maxBoards || Math.hypot(p.x - e.inside[0], p.z - e.inside[2]) > 3.0) { p.hold = null; continue; }
        // can't repair while a zombie is coming through
        const blocker = e.tearingBy ? this.zombies.active.find(z => z.id === e.tearingBy && z.state === ZSTATE.ENTERING) : null;
        if (blocker) continue;
        p.holdT += dt;
        if (p.holdT >= 0.75 / p.mods.repair) {
          p.holdT = 0;
          e.boards++;
          this.broadcast({ t: 'board', id: e.id, boards: e.boards, by: p.id });
          if (p.boardPoints < POINTS.boardCapPerRound) { p.boardPoints += POINTS.board; this.awardPoints(p, POINTS.board, 'board'); }
          if (e.boards >= e.maxBoards) p.hold = null;
        }
      }
    }
  }

  // ---------------- health / points ----------------
  awardPoints(p, amount, reason) {
    if (amount > 0 && this.doubleUntil > this.time && reason !== 'refund') amount *= 2;
    p.points = Math.max(0, p.points + amount);
    if (amount > 0) p.stats.points += amount;
    this.markSelf(p);
    this._scoresDirty = true;
    if (amount > 0 && reason !== 'refund' && reason !== 'blast') this.sendTo(p, { t: 'pts', a: amount, r: reason });
  }

  damagePlayer(p, dmg, z) {
    if (p.state !== PSTATE.ALIVE || dmg <= 0) return;
    if (p.invulnUntil > this.time || p.god) return;
    if (!p.ready && this.time - p.joinedAt < 45) return; // client still loading
    p.hp -= dmg;
    p.lastDamage = this.time;
    this.markSelf(p);
    this.sendTo(p, { t: 'dmg', d: Math.round(dmg), x: z ? r2(z.x) : null, z: z ? r2(z.z) : null });
    if (p.hp <= 0) this._down(p);
  }

  _down(p) {
    p.hp = 0; p.state = PSTATE.DOWNED; p.downedAt = this.time; p.reviveProgress = 0; p.hold = null;
    p.reloadEnd = 0; p.stats.downs++;
    // Quick Revive in solo: get back up on your own after a delay (all perks, including it, are lost)
    p.selfReviveAt = (this.players.size === 1 && p.perks.includes('revive')) ? this.time + PERK_RULES.soloReviveDelay : 0;
    this._clearPerks(p, true);
    this.markSelf(p);
    this.broadcast({ t: 'down', id: p.id, self: p.selfReviveAt > 0 ? PERK_RULES.soloReviveDelay : 0 });
    this._checkGameOver();
  }

  _revive(t, by) {
    t.state = PSTATE.ALIVE; t.hp = t.maxHp || PLAYER.maxHealth; t.selfReviveAt = 0; t.lastDamage = this.time; t.reviveProgress = 0; t.invulnUntil = this.time + 1.5;
    t.acceptAny = true;
    by.stats.revives++;
    this.awardPoints(by, POINTS.revive, 'revive');
    this.markSelf(t);
    this.broadcast({ t: 'revive', id: t.id, by: by.id });
  }

  _checkGameOver() {
    if (this.gameOver) return;
    let anyUp = false;
    for (const p of this.players.values()) if (p.state === PSTATE.ALIVE || (p.state === PSTATE.DOWNED && p.selfReviveAt > 0)) { anyUp = true; break; }
    if (anyUp || this.players.size === 0) return;
    this.gameOver = true; this.gameOverT = 0;
    this.roundState = RSTATE.GAMEOVER;
    const stats = [...this.players.values()].map(p => ({
      id: p.id, name: p.name, kills: p.stats.kills, headshots: p.stats.headshots, revives: p.stats.revives, points: p.stats.points,
      downs: p.stats.downs, accuracy: p.stats.shots ? Math.round(100 * p.stats.hits / p.stats.shots) : 0,
    }));
    this.broadcast({ t: 'gameover', round: this.round, stats, duration: Math.round((Date.now() - this.startedAt) / 1000) });
  }

  onZombieKilled(z, player, headshot, silent) {
    this.killedThisRound++;
    if (player) {
      player.stats.kills++;
      if (headshot) player.stats.headshots++;
      if (!silent) this.awardPoints(player, headshot ? POINTS.headshotKill : POINTS.kill, headshot ? 'headshot' : 'kill');
    }
    if (!silent) this.powerups.maybeDrop(z.x, z.y, z.z);
  }

  // ---------------- rounds & spawning ----------------
  _startRound(r) {
    this.round = r;
    const nPlayers = Math.max(1, this.players.size);
    this.roundTotal = zombieCountForRound(r, nPlayers);
    this.spawned = 0; this.killedThisRound = 0;
    this.nextSpawnT = this.time + 0.5;
    this.roundState = RSTATE.INTRO; this.roundT = ROUND.introDuration;
    this.powerups.newRound();
    for (const p of this.players.values()) {
      p.boardPoints = 0;
      if (p.state === PSTATE.DEAD) {
        const sp = this._pickSpawn();
        p.x = sp.x; p.y = sp.y; p.z = sp.z; p.yaw = sp.yaw;
        this._clearPerks(p, false); p.selfReviveAt = 0;
        p.state = PSTATE.ALIVE; p.hp = p.maxHp; p.acceptAny = true; p.invulnUntil = this.time + 3;
        if (!p.weapons[0] && !p.weapons[1]) p.weapons[0] = { id: 'warden_p9', mag: WEAPONS.warden_p9.mag, reserve: WEAPONS.warden_p9.reserve };
        p.slot = p.weapons[p.slot] ? p.slot : (p.weapons[0] ? 0 : 1);
        this.markSelf(p);
        this.sendTo(p, { t: 'respawn', x: p.x, y: p.y, z: p.z, yaw: p.yaw });
      }
    }
    this.broadcast({ t: 'round', round: r, state: 'intro', total: this.roundTotal });
  }

  _updateRound(dt) {
    switch (this.roundState) {
      case RSTATE.WAITING: {
        this.roundT -= dt;
        let allReady = true;
        for (const p of this.players.values()) if (!p.ready) allReady = false;
        if (this.roundT <= 0 && (allReady || this.time > 30)) this._startRound(1);
        break;
      }
      case RSTATE.INTRO:
        this.roundT -= dt;
        if (this.roundT <= 0) { this.roundState = RSTATE.ACTIVE; this.broadcast({ t: 'round', round: this.round, state: 'active', total: this.roundTotal }); }
        break;
      case RSTATE.ACTIVE:
        this._spawner();
        if (this.spawned >= this.roundTotal && this.zombies.active.length === 0) {
          this.roundState = RSTATE.ENDING; this.roundT = ROUND.transitionDelay;
          this.broadcast({ t: 'round', round: this.round, state: 'ending' });
        }
        break;
      case RSTATE.ENDING:
        this.roundT -= dt;
        if (this.roundT <= 0) this._startRound(this.round + 1);
        break;
      default: break;
    }
  }

  _spawner() {
    if (this.spawned >= this.roundTotal || this.time < this.nextSpawnT) return;
    const nPlayers = Math.max(1, this.players.size);
    const maxAlive = maxAliveForRound(this.round, nPlayers);
    const alive = this.zombies.active.length;
    if (alive >= maxAlive) { this.nextSpawnT = this.time + 0.25; return; }
    const entry = this.pickSpawnEntry(false);
    if (!entry) { this.nextSpawnT = this.time + 0.5; return; }
    const z = this.zombies.spawn(entry, this.round);
    if (z) this.spawned++;
    let interval = spawnIntervalForRound(this.round);
    if (alive / maxAlive > 0.7) interval *= 1.7;
    this.nextSpawnT = this.time + interval * (0.7 + this.rng() * 0.6);
  }

  /** Choose a zombie entry considering unlocked areas, path distance to players and player view. */
  pickSpawnEntry(nearOnly) {
    const alive = [...this.players.values()].filter(p => p.state === PSTATE.ALIVE);
    const targets = alive.length ? alive : [...this.players.values()];
    const cands = [];
    let total = 0;
    for (const id in this.world.entries) {
      const e = this.world.entries[id];
      if (!this.unlocked.has(e.area)) continue;
      if ((e.users || 0) >= 2) continue;
      const cell = this.nav.cellAt(e.inside[0], e.inside[1], e.inside[2]);
      let best = Infinity;
      let inView = false;
      for (const p of targets) {
        const fc = this.zombies.getField(p);
        let d = (fc.valid && cell >= 0) ? fc.dist[cell] : 65535;
        if (d === 65535) continue;
        const m = d / 20;
        if (m < best) best = m;
        const dx = e.inside[0] - p.x, dz = e.inside[2] - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 14) {
          const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
          if ((dx * fx + dz * fz) / (dist || 1) > 0.75) inView = true;
        }
      }
      if (best === Infinity) continue;
      let w;
      if (best < 4) w = 0.05;
      else if (best < 9) w = 0.45;
      else if (best < 30) w = 1.0;
      else if (best < 50) w = nearOnly ? 0.2 : 0.5;
      else w = nearOnly ? 0.05 : 0.15;
      if (inView) w *= 0.15;
      w /= 1 + (e.users || 0);
      cands.push({ e, w });
      total += w;
    }
    if (!cands.length) return null;
    let r = this.rng() * total;
    for (const c of cands) { r -= c.w; if (r <= 0) return c.e; }
    return cands[cands.length - 1].e;
  }

  // ---------------- main step ----------------
  step(dt) {
    this.time += dt;
    this.tick++;
    if (this.gameOver) {
      this.gameOverT += dt;
      this._sendSnapshot();
      if (this.gameOverT > 14) { this.stop(); this.lobby.onGameEnded(); }
      return;
    }
    this._updateRound(dt);
    this.zombies.update(dt);
    updateProjectiles(this, dt);
    this.powerups.update(dt);
    this.box.update(dt);
    this._updatePap(dt);
    this._updateHolds(dt);
    for (const p of this.players.values()) this._updatePlayer(p, dt);
    // scores
    this._scoresT += dt;
    if (this._scoresDirty && this._scoresT > 0.4) {
      this._scoresT = 0; this._scoresDirty = false;
      const s = {};
      for (const p of this.players.values()) s[p.id] = p.points;
      this.broadcast({ t: 'scores', s });
    }
    for (const p of this._selfDirty) this.sendTo(p, this._selfMessage(p));
    this._selfDirty.clear();
    this._sendSnapshot();
  }

  _updatePlayer(p, dt) {
    if (p.state === PSTATE.ALIVE) {
      const maxHp = p.maxHp || PLAYER.maxHealth;
      if (p.hp < maxHp && this.time - p.lastDamage > PLAYER.regenDelay) {
        const before = Math.round(p.hp);
        p.hp = Math.min(maxHp, p.hp + PLAYER.regenRate * dt);
        if (Math.round(p.hp) !== before && (this.tick % 5 === 0 || p.hp >= maxHp)) this.markSelf(p);
      }
      if (p.reloadEnd > 0 && this.time >= p.reloadEnd) {
        const held = p.weapons[p.slot];
        if (held) {
          const def = WEAPONS[held.id];
          if (def.reloadPerShell) {
            if (held.mag < def.mag && held.reserve > 0) { held.mag++; held.reserve--; }
            if (held.mag < def.mag && held.reserve > 0) p.reloadEnd = this.time + def.reloadTime * p.mods.reload;
            else { p.reloadEnd = 0; p.reloadShells = 0; }
          } else {
            const take = Math.min(def.mag - held.mag, held.reserve);
            held.mag += take; held.reserve -= take; p.reloadEnd = 0;
          }
        } else p.reloadEnd = 0;
        this.markSelf(p);
      }
    } else if (p.state === PSTATE.DOWNED) {
      if (p.selfReviveAt > 0 && this.time >= p.selfReviveAt) { this._selfRevive(p); return; }
      if (this.time - p.downedAt > PLAYER.bleedoutTime) {
        p.state = PSTATE.DEAD; p.hold = null;
        this.markSelf(p);
        this.broadcast({ t: 'dead', id: p.id });
        this._checkGameOver();
      }
    }
  }

  // ---------------- perks ----------------
  _perkMachine(id) { return this.world.machines.find(m => m.type === 'perk' && m.perk === id) || null; }

  _buyPerk(p, id) {
    const m = this._perkMachine(id);
    if (!PERKS[id] || !m) return;
    if (Math.hypot(p.x - m.x, p.z - m.z) > PERK.range) return;
    if (p.perks.includes(id)) { this.sendTo(p, { t: 'notice', text: 'ALREADY OWNED' }); return; }
    if (p.perks.length >= PERK.maxPerks) { this.sendTo(p, { t: 'notice', text: 'NO MORE PERK SLOTS' }); return; }
    const solo = this.players.size === 1;
    if (id === 'revive' && solo && p.soloRevives >= PERK_RULES.soloReviveMax) { this.sendTo(p, { t: 'notice', text: 'QUICK REVIVE SOLD OUT' }); return; }
    const cost = perkCost(id, solo);
    if (p.points < cost) { this.sendTo(p, { t: 'notice', text: 'NOT ENOUGH POINTS' }); return; }
    this.awardPoints(p, -cost, 'perk');
    this._grantPerk(p, id);
  }

  /** Give a perk (purchase or dev cheat): mods + health, immediate self update, machine animation for everyone, a line. */
  _grantPerk(p, id) {
    if (!PERKS[id] || p.perks.includes(id) || p.perks.length >= PERK.maxPerks) return;
    p.perks.push(id);
    if (id === 'revive' && this.players.size === 1) p.soloRevives++;
    this._applyPerks(p);
    this.sendTo(p, this._selfMessage(p));
    this.broadcast({ t: 'perk', ev: 'buy', id, p: p.id });
    this.sendTo(p, { t: 'mline', m: id, text: pickLine(id, this.rng) });
  }

  _applyPerks(p) {
    const prevMax = p.maxHp || PLAYER.maxHealth;
    p.mods = computeMods(p.perks);
    p.maxHp = p.mods.maxHp;
    if (p.maxHp > prevMax && p.state === PSTATE.ALIVE) p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - prevMax));
    if (p.hp > p.maxHp) p.hp = p.maxHp;
    this.markSelf(p);
  }

  _clearPerks(p, announce) {
    if (!p.perks.length) return;
    p.perks = [];
    this._applyPerks(p);
    if (announce) this.broadcast({ t: 'perk', ev: 'lost', p: p.id });
  }

  _selfRevive(p) {
    p.selfReviveAt = 0;
    p.state = PSTATE.ALIVE; p.hp = p.maxHp || PLAYER.maxHealth; p.lastDamage = this.time; p.reviveProgress = 0;
    p.invulnUntil = this.time + 2.5; p.acceptAny = true;
    this.markSelf(p);
    this.broadcast({ t: 'revive', id: p.id, by: p.id, self: true });
  }

  // ---------------- pack-a-punch ----------------
  _papMachine() { return this.world.machines.find(m => m.type === 'pap') || null; }

  /** {t:'pap', state:'idle'|'processing'|'ready', user, weapon (base id while processing, upgraded id when ready), result, dur, timer} */
  _papSerialize(extra) {
    const s = this.pap;
    const msg = { t: 'pap', state: s.state, user: s.user, weapon: s.state === 'ready' ? s.result : s.weapon, result: s.result, dur: PAP.processTime };
    if (s.state === 'processing') msg.timer = r2(Math.max(0, PAP.processTime - s.t));
    else if (s.state === 'ready') msg.timer = r2(Math.max(0, PAP.pickupWindow - s.t));
    return extra ? Object.assign(msg, extra) : msg;
  }

  _papInteract(p) {
    const m = this._papMachine();
    if (!m || Math.hypot(p.x - m.x, p.z - m.z) > PAP.range) return;
    const s = this.pap;
    if (s.state === 'ready') { if (s.user === p.id) this._papTake(p); return; }
    if (s.state !== 'idle') return;
    const held = p.weapons[p.slot];
    if (!held) { this.sendTo(p, { t: 'notice', text: 'NO WEAPON TO UPGRADE' }); return; }
    const def = WEAPONS[held.id];
    const cost = papCostFor(def);
    if (p.points < cost) { this.sendTo(p, { t: 'notice', text: 'NOT ENOUGH POINTS' }); return; }
    this.awardPoints(p, -cost, 'pap');
    s.state = 'processing'; s.t = 0; s.user = p.id; s.weapon = held.id; s.result = papTargetId(def); s.slot = p.slot;
    // the weapon goes into the machine: the slot empties; switch to the other weapon if any (else empty hands)
    p.weapons[p.slot] = null;
    const other = 1 - p.slot;
    if (p.weapons[other]) { p.slot = other; p.switchEnd = this.time + WEAPONS[p.weapons[other].id].switchTime; }
    p.reloadEnd = 0; p.reloadShells = 0;
    this.markSelf(p);
    this.broadcast(this._papSerialize());
  }

  /** Hand the upgraded weapon over (player pressed E, or the pickup window ran out). */
  _papTake(p) {
    const s = this.pap;
    if (s.state !== 'ready') return;
    const id = s.result, def = WEAPONS[id];
    let slot = !p.weapons[s.slot] ? s.slot : p.weapons.findIndex(w => !w); // original slot when still free
    if (slot < 0) slot = p.slot;
    p.weapons[slot] = { id, mag: def.mag, reserve: def.reserve };
    p.slot = slot; p.reloadEnd = 0; p.reloadShells = 0; p.switchEnd = this.time + def.switchTime;
    this.markSelf(p);
    this.sendTo(p, { t: 'weapon', slot, id });
    s.state = 'idle'; s.t = 0;
    this.broadcast(this._papSerialize({ taken: true, weapon: id }));
    s.user = 0; s.weapon = null; s.result = null;
  }

  _updatePap(dt) {
    const s = this.pap;
    if (s.state === 'idle') return;
    s.t += dt;
    if (s.state === 'processing' && s.t >= PAP.processTime) {
      s.state = 'ready'; s.t = 0;
      this.broadcast(this._papSerialize());
    } else if (s.state === 'ready' && s.t >= PAP.pickupWindow) {
      const u = this.players.get(s.user);
      if (u) this._papTake(u);
      else { s.state = 'idle'; s.t = 0; s.user = 0; s.weapon = null; s.result = null; this.broadcast(this._papSerialize()); }
    }
  }

  _sendSnapshot() {
    const players = [];
    for (const p of this.players.values()) {
      const held = p.weapons[p.slot];
      players.push({
        id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
        flags: p.flags | (p.reloadEnd > this.time ? 128 : 0), state: p.state, hp: p.hp,
        weapon: held ? WEAPON_INDEX[held.id] : 255, revive: Math.round(p.reviveProgress * 255),
      });
    }
    const zombies = [];
    for (const z of this.zombies.active) {
      if (z.state === ZSTATE.HIDDEN) continue;
      zombies.push({ id: z.id, x: z.x, y: z.y + z.vaultY, z: z.z, yaw: z.yaw, type: z.type.id, state: z.state, hp: Math.max(1, Math.min(255, Math.round(255 * z.hp / z.maxHp))), aux: (Math.round(z.aux * 127 / 255) & 127) | (z.limp ? 128 : 0) }); // 7-bit progress + limp flag
    }
    const snap = {
      tick: this.tick, time: this.time * 1000, round: this.round, roundState: this.roundState,
      zombiesLeft: Math.max(0, this.roundTotal - this.killedThisRound),
      powerupFlags: (this.oneShotUntil > this.time ? 1 : 0) | (this.doubleUntil > this.time ? 2 : 0),
      players, zombies, powerups: this.powerups.snapshotList(),
      projectiles: this.projectiles.map(pr => ({ id: pr.id, x: pr.x, y: pr.y, z: pr.z })),
    };
    const bytes = encodeSnapshot(snap, this._snapBuf);
    if (bytes.buffer !== this._snapBuf) this._snapBuf = bytes.buffer;
    this.broadcastBinary(bytes);
  }
}

function r2(v) { return Math.round(v * 100) / 100; }
