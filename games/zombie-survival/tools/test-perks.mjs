#!/usr/bin/env node
// Headless tests for the perk machines and Pack-a-Punch (server authority, no browser).
// Usage: node tools/test-perks.mjs      (exit code 1 on any failed assertion)
import { GameServer } from '../server/game/gameServer.js';
import { PLAYER, PSTATE, TICK_MS, PERK, PAP } from '../shared/constants.js';
import { PERK_RULES, perkCost } from '../shared/perks.js';
import { WEAPONS, shotInterval } from '../shared/weapons.js';
import { ZSTATE } from '../shared/zombies.js';
import { encodeInput, decodeSnapshot, BIN, IN } from '../shared/protocol.js';

let pass = 0, fail = 0;
function ok(cond, what) { if (cond) pass++; else { fail++; console.log('  FAIL:', what); } }
function eq(a, b, what) { ok(a === b, `${what} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }
function near(a, b, tol, what) { ok(Math.abs(a - b) <= tol, `${what} (got ${a}, expected ${b} +-${tol})`); }

class FakeConn {
  constructor() { this.alive = true; this.msgs = []; this.self = null; this.events = {}; }
  send(d) {
    if (typeof d !== 'string') { const dv = new DataView(d.buffer, d.byteOffset, d.byteLength); if (dv.getUint8(0) === BIN.SNAPSHOT) this.lastSnap = decodeSnapshot(dv, 1); return; }
    const m = JSON.parse(d); this.msgs.push(m); this.events[m.t] = (this.events[m.t] || 0) + 1; if (m.t === 'self') this.self = m;
  }
  last(t) { for (let i = this.msgs.length - 1; i >= 0; i--) if (this.msgs[i].t === t) return this.msgs[i]; return null; }
  count(t, pred = null) { return this.msgs.filter(m => m.t === t && (!pred || pred(m))).length; }
  clear() { this.msgs.length = 0; }
}

let seq = 0;
function mk(n) {
  const lobby = { lobby: { players: new Map() }, dev: true, onGameEnded() { } };
  for (let i = 1; i <= n; i++) lobby.lobby.players.set(i, { id: i, name: 'Bot' + i, conn: new FakeConn(), inGame: false });
  const g = new GameServer(lobby);
  g.start(); g.stop();          // init messages sent; no real-time loop (we step manually)
  g.roundT = 1e9;               // rounds never start: deterministic, no zombies unless spawned by the test
  for (const p of g.players.values()) input(g, p);
  return g;
}
function input(g, p) { g.handleBinary(p.lp, encodeInput({ seq: ++seq, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: 0, flags: IN.ONGROUND, slot: p.slot, time: 0 })); }
function step(g, seconds) { const n = Math.round(seconds * 1000 / TICK_MS); for (let i = 0; i < n; i++) g.step(TICK_MS / 1000); }
function tp(p, x, z, y = 0) { p.x = x; p.z = z; p.y = y; p.acceptAny = true; }
function tpMachine(g, p, id) { const m = g.world.machines.find(x => x.id === id); tp(p, m.x + Math.sin(m.yaw) * 1.1, m.z + Math.cos(m.yaw) * 1.1, m.y); return m; }
function interact(g, p, target) { g.handleMessage(p.lp, { t: 'interact', target }); }
function cheat(g, p, o) { g.handleMessage(p.lp, { t: 'cheat', ...o }); }
/** Damage ignoring god mode and the spawn / revive invulnerability window. */
function hurt(g, p, dmg) { const god = p.god; p.god = false; p.invulnUntil = 0; g.damagePlayer(p, dmg, null); p.god = god; }
const TICK = TICK_MS / 1000;

// =====================================================================================================
console.log('== solo: perks ==');
{
  const g = mk(1);
  const p = g.players.get(1), c = p.lp.conn;
  ok(c.last('init') && c.last('init').pap && c.last('init').pap.state === 'idle', 'init message carries the pack-a-punch state');
  cheat(g, p, { points: 20000, god: true });
  step(g, 0.1);
  eq(p.perks.length, 0, 'no perks at start');
  eq(c.self.mods.maxHp, PLAYER.maxHealth, 'self mods.maxHp default');
  // out of range: nothing happens
  tp(p, 0, 0);
  interact(g, p, 'perk:jugg');
  eq(p.perks.length, 0, 'perk purchase refused when far from the machine');
  // Juggernog
  tpMachine(g, p, 'jugg');
  c.clear();
  interact(g, p, 'perk:jugg');
  eq(p.perks.join(), 'jugg', 'juggernog owned');
  eq(p.points, 20000 - 2500, 'juggernog cost 2500');
  eq(p.maxHp, PERK_RULES.juggHealth, 'max hp 250');
  eq(p.hp, 250, 'health topped up to 250');
  ok(c.self && c.self.perks.join() === 'jugg' && c.self.mods.maxHp === 250, 'immediate self message with perks + mods');
  eq(c.count('perk', m => m.ev === 'buy' && m.id === 'jugg' && m.p === 1), 1, 'perk buy broadcast');
  ok(c.last('mline') && c.last('mline').m === 'jugg' && c.last('mline').text.length > 5, 'machine personality line sent');
  // already owned
  c.clear();
  interact(g, p, 'perk:jugg');
  eq(p.points, 17500, 'no double charge');
  ok(c.last('notice') && /OWNED/.test(c.last('notice').text), 'already-owned notice');
  // damage + regen against the raised maximum
  hurt(g, p, 120);
  eq(p.state, PSTATE.ALIVE, 'survives 120 damage with juggernog');
  eq(Math.round(p.hp), 130, 'hp after 120 damage');
  step(g, PLAYER.regenDelay + 4);
  eq(Math.round(p.hp), 250, 'regenerates back to 250');
  // Speed Cola
  tpMachine(g, p, 'speed');
  interact(g, p, 'perk:speed');
  eq(p.perks.join(), 'jugg,speed', 'speed cola owned');
  eq(p.points, 17500 - 3000, 'speed cola cost 3000');
  eq(c.self.mods.reload, PERK_RULES.reloadMul, 'self mods.reload');
  const held = p.weapons[p.slot]; held.mag = 0;
  g.handleMessage(p.lp, { t: 'reload' });
  near(p.reloadEnd - g.time, WEAPONS[held.id].reloadTime * PERK_RULES.reloadMul, 0.01, 'server reload time x0.55');
  step(g, 1.0);
  eq(held.mag, WEAPENS_MAG(held.id), 'reload finished within 1 s (0.74 s instead of 1.35 s)');
  // Double Tap
  tpMachine(g, p, 'dtap');
  interact(g, p, 'perk:dtap');
  eq(p.perks.join(), 'jugg,speed,dtap', 'double tap owned');
  eq(p.points, 14500 - 2000, 'double tap cost 2000');
  eq(c.self.mods.rpm, PERK_RULES.dtapRpm, 'self mods.rpm');
  eq(c.self.mods.dmg, PERK_RULES.dtapDmg, 'self mods.dmg');
  // fire rate: pistol interval 0.1395 s -> min gap 0.1186 s normally, 0.0949 s with double tap (3 ticks = 0.1 s)
  {
    const w = WEAPONS[held.id];
    const shoot = () => g.handleMessage(p.lp, { t: 'shoot', w: w.index, o: [p.x, p.y + 1.62, p.z], d: [0, 0, 1], s: 0.3, seed: 1, rt: g.time * 1000 });
    step(g, 0.5); const m0 = held.mag;
    shoot(); step(g, 3 * TICK_MS / 1000); shoot();
    eq(held.mag, m0 - 2, 'second shot accepted after 0.1 s with double tap');
    p.mods.rpm = 1; step(g, 0.5); const m1 = held.mag;
    shoot(); step(g, 3 * TICK_MS / 1000); shoot();
    eq(held.mag, m1 - 1, 'second shot rejected after 0.1 s without double tap');
    p.mods.rpm = PERK_RULES.dtapRpm;
    near(shotInterval(w) / p.mods.rpm, 60 / w.rpm / 1.25, 1e-9, 'interval formula');
  }
  // damage x1.5 on a zombie body hit
  {
    const entry = g.world.entries.street_w1;
    const z = g.zombies.spawn(entry, 1);
    ok(!!z, 'zombie spawned for the damage test');
    z.state = ZSTATE.CHASE; z.hp = 100000; z.maxHp = 100000; z.spawnDelay = 0;
    tp(p, 0, 0); z.x = 0; z.z = 3; z.y = 0; z.vx = z.vz = 0;
    step(g, 2 * TICK_MS / 1000);
    const w = WEAPONS[held.id];
    const hp0 = z.hp;
    const dx = z.x - p.x, dy = (z.y + 1.15) - (p.y + 1.62), dz = z.z - p.z; const l = Math.hypot(dx, dy, dz);
    c.clear();
    g.handleMessage(p.lp, { t: 'shoot', w: w.index, o: [p.x, p.y + 1.62, p.z], d: [dx / l, dy / l, dz / l], s: 0.2, seed: 7, rt: g.time * 1000 });
    const hit = c.last('hit');
    ok(!!hit, 'zombie was hit');
    if (hit) eq(hit.dmg, Math.round(w.damage * PERK_RULES.dtapDmg), 'body damage x1.5 with double tap');
    near(hp0 - z.hp, w.damage * PERK_RULES.dtapDmg, 0.01, 'zombie hp reduced by 1.5x damage');
    g.zombies.kill(z, null, false, true);
  }
  // Quick Revive (solo price 500)
  tpMachine(g, p, 'revive');
  const ptsBefore = p.points;
  interact(g, p, 'perk:revive');
  eq(p.perks.length, 4, 'four perks owned');
  eq(p.points, ptsBefore - perkCost('revive', true), 'quick revive costs 500 in solo');
  eq(perkCost('revive', false), 1500, 'quick revive costs 1500 in co-op');
  eq(p.soloRevives, 1, 'solo quick revive purchase counted');
  eq(c.self.mods.revive, PERK_RULES.reviveHoldMul, 'self mods.revive');
  // 5th perk impossible: every id is owned -> "already owned"; a fake id is ignored
  interact(g, p, 'perk:nope'); eq(p.perks.length, 4, 'unknown perk ignored');
  // going down: all perks lost, solo quick revive brings the player back after 8 s, no game over
  c.clear();
  hurt(g, p, 9999); step(g, TICK);
  eq(p.state, PSTATE.DOWNED, 'player downed');
  eq(p.perks.length, 0, 'all perks lost when downed');
  eq(p.maxHp, PLAYER.maxHealth, 'max hp back to 100');
  ok(p.selfReviveAt > g.time, 'solo self-revive scheduled');
  eq(g.gameOver, false, 'no game over while quick revive is pending');
  ok(c.last('down') && c.last('down').self === PERK_RULES.soloReviveDelay, 'down message announces the self-revive');
  ok(c.self && c.self.perks.length === 0 && c.self.selfRevive > 7, 'self message: no perks, selfRevive countdown');
  ok(c.count('perk', m => m.ev === 'lost' && m.p === 1) === 1, 'perk lost broadcast');
  step(g, PERK_RULES.soloReviveDelay - 0.5);
  eq(p.state, PSTATE.DOWNED, 'still down before the delay');
  step(g, 1.0);
  eq(p.state, PSTATE.ALIVE, 'self-revived after 8 s');
  eq(Math.round(p.hp), PLAYER.maxHealth, 'full (100) health after self-revive');
  ok(c.last('revive') && c.last('revive').self === true && c.last('revive').id === 1, 'revive broadcast flagged as self');
  eq(g.gameOver, false, 'game continues');
  // solo limit: 3 purchases per game
  p.god = true;
  for (let n = 2; n <= 3; n++) {
    tpMachine(g, p, 'revive'); interact(g, p, 'perk:revive');
    eq(p.soloRevives, n, `quick revive purchase #${n}`);
    hurt(g, p, 9999);
    eq(p.state, PSTATE.DOWNED, `down #${n}`);
    step(g, PERK_RULES.soloReviveDelay + 0.2);
    eq(p.state, PSTATE.ALIVE, `self-revive #${n}`);
  }
  const pts = p.points; c.clear();
  tpMachine(g, p, 'revive'); interact(g, p, 'perk:revive');
  eq(p.points, pts, '4th solo quick revive refused (no charge)');
  ok(c.last('notice') && /SOLD OUT/.test(c.last('notice').text), 'sold-out notice');
  eq(p.perks.length, 0, 'no perk granted');
  // going down without quick revive in solo = game over
  hurt(g, p, 9999);
  eq(g.gameOver, true, 'game over when downed without quick revive (solo)');
}

// =====================================================================================================
console.log('== solo: pack-a-punch ==');
{
  const g = mk(1);
  const p = g.players.get(1), c = p.lp.conn;
  cheat(g, p, { points: 20000, god: true, weapon: 'kestrel_ar' });
  eq(p.slot, 1, 'kestrel in slot 1 (pistol in slot 0)');
  tp(p, 0, 0); interact(g, p, 'pap');
  eq(g.pap.state, 'idle', 'pack-a-punch ignored when far away');
  const m = tpMachine(g, p, 'pap');
  ok(m && m.type === 'pap', 'pack-a-punch machine exists');
  c.clear();
  interact(g, p, 'pap');
  eq(g.pap.state, 'processing', 'machine processing');
  eq(p.points, 20000 - PAP.cost, 'pack-a-punch costs 5000');
  eq(p.weapons[1], null, 'weapon removed from the slot');
  eq(p.slot, 0, 'switched to the other weapon');
  const pm = c.last('pap');
  ok(pm && pm.state === 'processing' && pm.user === 1 && pm.weapon === 'kestrel_ar' && pm.result === 'kestrel_ar_pap' && pm.dur === PAP.processTime, 'processing broadcast');
  step(g, TICK);
  ok(c.self && c.self.weapons[1] === null && c.self.slot === 0, 'self message reflects the empty slot');
  interact(g, p, 'pap');
  eq(g.pap.state, 'processing', 'interacting while processing does nothing');
  step(g, PAP.processTime - 0.2);
  eq(g.pap.state, 'processing', 'still processing before 5 s');
  step(g, 0.4);
  eq(g.pap.state, 'ready', 'ready after 5 s');
  const rm = c.last('pap');
  ok(rm && rm.state === 'ready' && rm.user === 1 && rm.weapon === 'kestrel_ar_pap' && rm.timer > 14, 'ready broadcast with the upgraded id');
  // a different player could not take it (simulate by id): nothing happens when user mismatch
  g.pap.user = 2; interact(g, p, 'pap'); eq(g.pap.state, 'ready', 'other players cannot take it'); g.pap.user = 1;
  c.clear();
  interact(g, p, 'pap');
  eq(g.pap.state, 'idle', 'machine idle after pickup');
  ok(p.weapons[1] && p.weapons[1].id === 'kestrel_ar_pap', 'upgraded weapon in the original slot');
  eq(p.slot, 1, 'upgraded weapon selected');
  const up = WEAPONS.kestrel_ar_pap, base = WEAPONS.kestrel_ar;
  eq(p.weapons[1].mag, up.mag, 'full upgraded magazine');
  eq(p.weapons[1].reserve, up.reserve, 'full upgraded reserve');
  eq(up.name, 'Kestrel Valkyrie', 'unique upgraded name');
  ok(up.damage >= base.damage * 2.5 && up.damage <= base.damage * 3.2, `damage boosted x2.5-3.2 (${base.damage} -> ${up.damage})`);
  eq(up.mag, Math.round(base.mag * 1.5), 'mag x1.5');
  eq(up.reserve, base.reserve * 2, 'reserve x2');
  near(up.headMul, base.headMul + 0.2, 1e-9, 'headMul +0.2');
  near(up.reloadTime, base.reloadTime * 0.9, 1e-3, 'reload x0.9');
  ok(up.pap === true && up.base === 'kestrel_ar' && up.inBox === false && up.look.pap === true && up.look.glow === '#b45cff' && up.sound === base.sound, 'upgraded definition flags');
  eq(WEAPONS.thumper_gl_pap.damage, base && WEAPONS.thumper_gl.damage * 2, 'launcher upgrade x2');
  eq(WEAPONS.ray_rifle_pap.damage, WEAPONS.ray_rifle.damage * 2, 'energy upgrade x2');
  ok(!WEAPONS.kestrel_ar_pap_pap, 'no double upgrade variants');
  ok(c.last('weapon') && c.last('weapon').id === 'kestrel_ar_pap' && c.last('weapon').slot === 1, 'weapon message on pickup');
  const im = c.last('pap');
  ok(im && im.state === 'idle' && im.taken === true && im.weapon === 'kestrel_ar_pap', 'idle(taken) broadcast');
  // re-pack: 2000 -> refill
  p.weapons[1].mag = 0; p.weapons[1].reserve = 0;
  interact(g, p, 'pap');
  eq(g.pap.state, 'processing', 're-pack processing');
  eq(p.points, 15000 - PAP.refillCost, 're-pack costs 2000');
  eq(g.pap.result, 'kestrel_ar_pap', 're-pack result is the same upgraded weapon');
  step(g, PAP.processTime + 0.1);
  interact(g, p, 'pap');
  ok(p.weapons[1] && p.weapons[1].id === 'kestrel_ar_pap' && p.weapons[1].mag === up.mag && p.weapons[1].reserve === up.reserve, 're-pack refilled the ammo');
  // pickup window: handed over automatically after 15 s
  cheat(g, p, { points: 20000 });
  p.slot = 0; // pistol
  interact(g, p, 'pap');
  eq(g.pap.result, 'warden_p9_pap', 'pistol being upgraded');
  eq(p.weapons[0], null, 'pistol slot empty');
  eq(p.slot, 1, 'holding the upgraded kestrel meanwhile');
  step(g, PAP.processTime + 0.1);
  eq(g.pap.state, 'ready', 'ready');
  step(g, PAP.pickupWindow - 0.5);
  eq(g.pap.state, 'ready', 'still waiting before 15 s');
  step(g, 1.0);
  eq(g.pap.state, 'idle', 'handed over automatically');
  ok(p.weapons[0] && p.weapons[0].id === 'warden_p9_pap', 'auto-given weapon back in slot 0');
  eq(p.slot, 0, 'auto-given weapon selected');
  // empty hands: only one weapon -> cannot shoot while it is in the machine
  p.weapons = [{ id: 'warden_p9', mag: 12, reserve: 96 }, null]; p.slot = 0; cheat(g, p, { points: 20000 });
  interact(g, p, 'pap');
  ok(p.weapons[0] === null && p.weapons[1] === null, 'empty hands while the only weapon is upgraded');
  const before = c.count('shot');
  g.handleMessage(p.lp, { t: 'shoot', w: WEAPONS.warden_p9.index, o: [p.x, p.y + 1.62, p.z], d: [0, 0, 1], s: 0.3, seed: 1, rt: g.time * 1000 });
  eq(c.count('shot'), before, 'shots ignored with empty hands');
  step(g, PAP.processTime + 0.1);
  interact(g, p, 'pap');
  ok(p.weapons[0] && p.weapons[0].id === 'warden_p9_pap' && p.slot === 0, 'upgraded pistol back in hand');
  // no weapon at all -> notice
  p.weapons = [null, null]; c.clear();
  interact(g, p, 'pap');
  ok(c.last('notice') && /NO WEAPON/.test(c.last('notice').text), 'no-weapon notice');
  eq(g.pap.state, 'idle', 'machine stays idle');
  // wall buy for an upgraded weapon = expensive ammo, never a second base gun
  p.weapons = [{ id: 'warden_p9_pap', mag: 5, reserve: 0 }, null]; p.slot = 0; cheat(g, p, { points: 20000 });
  const wbIdx = g.world.wallBuys.findIndex(w => w.weapon === 'warden_p9');
  const wb = g.world.wallBuys[wbIdx]; tp(p, wb.x, wb.z - 1.0, 0);
  interact(g, p, 'wallbuy:' + wbIdx);
  eq(p.points, 20000 - PAP.wallAmmoCost, 'upgraded wall ammo costs 4500');
  eq(p.weapons[0].reserve, WEAPONS.warden_p9_pap.reserve, 'upgraded reserve refilled');
  eq(p.weapons[1], null, 'no second base weapon');
  // late joiner init while processing
  cheat(g, p, { points: 20000 });
  tpMachine(g, p, 'pap');
  interact(g, p, 'pap');
  eq(g.pap.state, 'processing', 'processing for the late-joiner check');
  const late = { id: 2, name: 'Late', conn: new FakeConn(), inGame: false };
  g.lobby.lobby.players.set(2, late);
  g.addPlayer(late);
  const li = late.conn.last('init');
  ok(li && li.pap && li.pap.state === 'processing' && li.pap.user === 1 && li.pap.timer > 4, 'late joiner receives the pack-a-punch state');
}

// =====================================================================================================
console.log('== co-op: quick revive, speed cola repairs, losing perks ==');
{
  const g = mk(2);
  const p1 = g.players.get(1), p2 = g.players.get(2), c1 = p1.lp.conn, c2 = p2.lp.conn;
  cheat(g, p1, { points: 20000, god: true }); cheat(g, p2, { points: 20000 });
  tpMachine(g, p1, 'revive'); c2.clear();
  interact(g, p1, 'perk:revive');
  eq(p1.points, 20000 - 1500, 'quick revive costs 1500 with two players');
  eq(p1.soloRevives, 0, 'co-op purchase does not use the solo allowance');
  ok(c2.count('perk', m => m.ev === 'buy' && m.p === 1 && m.id === 'revive') === 1, 'teammate sees the purchase');
  // p2 goes down: no self revive in co-op, game continues (p1 alive)
  tp(p2, 5, 0); hurt(g, p2, 9999);
  eq(p2.state, PSTATE.DOWNED, 'p2 downed');
  eq(p2.selfReviveAt, 0, 'no self-revive in co-op');
  eq(g.gameOver, false, 'game continues');
  // revive hold: 4 s normally, 2 s with quick revive
  tp(p1, 5.5, 0.5);
  g.handleMessage(p1.lp, { t: 'hold', target: 'revive:2' });
  step(g, 1.8);
  eq(p2.state, PSTATE.DOWNED, 'not yet revived after 1.8 s');
  step(g, 0.4);
  eq(p2.state, PSTATE.ALIVE, 'revived after ~2 s with quick revive');
  eq(Math.round(p2.hp), PLAYER.maxHealth, 'revived at 100 hp');
  eq(p1.stats.revives, 1, 'revive counted');
  // without the perk it takes the full 4 s
  p1.perks = []; g._applyPerks(p1);
  hurt(g, p2, 9999);
  g.handleMessage(p1.lp, { t: 'hold', target: 'revive:2' });
  step(g, 3.6); eq(p2.state, PSTATE.DOWNED, 'not revived after 3.6 s without the perk');
  step(g, 0.6); eq(p2.state, PSTATE.ALIVE, 'revived after 4 s without the perk');
  // Speed Cola: barricade repair twice as fast (0.375 s per board instead of 0.75 s)
  tpMachine(g, p1, 'speed'); interact(g, p1, 'perk:speed');
  eq(p1.perks.join(), 'speed', 'speed cola owned');
  const e = g.world.entries.house_s1; e.boards = 0;
  tp(p1, e.inside[0], e.inside[2], e.inside[1]);
  g.handleMessage(p1.lp, { t: 'hold', target: 'board:house_s1' });
  step(g, 0.45);
  eq(e.boards, 1, 'one board after 0.45 s with speed cola');
  step(g, 0.4);
  eq(e.boards, 2, 'two boards after 0.85 s with speed cola');
  p1.perks = []; g._applyPerks(p1); e.boards = 0; g.handleMessage(p1.lp, { t: 'hold', target: 'board:house_s1' });
  step(g, 0.45); eq(e.boards, 0, 'no board after 0.45 s without speed cola');
  step(g, 0.4); eq(e.boards, 1, 'one board after 0.85 s without speed cola');
  g.handleMessage(p1.lp, { t: 'hold', target: null });
  // losing perks on down in co-op + respawn keeps them cleared
  tpMachine(g, p1, 'jugg'); interact(g, p1, 'perk:jugg');
  eq(p1.maxHp, 250, 'p1 has juggernog');
  hurt(g, p1, 9999); step(g, TICK);
  eq(p1.perks.length, 0, 'perks lost on down (co-op)');
  eq(p1.maxHp, 100, 'max hp reset');
  ok(c1.self && c1.self.mods.maxHp === 100 && c1.self.perks.length === 0, 'self message updated');
  // late joiner while processing gets the pap state; both players' perks remain independent
  eq(p2.perks.length, 0, 'p2 unaffected');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

function WEAPENS_MAG(id) { return WEAPONS[id].mag; }
