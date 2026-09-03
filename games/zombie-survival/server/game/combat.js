// Shooting: validation, deterministic spread, lag-compensated hit detection, projectiles, explosions.
import { WEAPONS, computeShotDirections, damageAtDistance, shotInterval } from '../../shared/weapons.js';
import { raycastWorld, bulletFilter } from '../../shared/collision.js';
import { ZSTATE, zombieHitVolumes, rayZombie } from '../../shared/zombies.js';
import { PSTATE, TICK_MS, BODY_PART } from '../../shared/constants.js';
import { damageMod } from '../../shared/perks.js';

const _hp = { x: 0, y: 0, z: 0, yaw: 0 }, _hp0 = { x: 0, y: 0, z: 0, yaw: 0 };
const _vol = {}, _hit = { part: 0 }, _st = { state: 0, aux: 0 };
const SPEED_TICKS = 3; // ground speed = distance travelled over the last 3 ticks (~ the rig's smoothed speed)

/**
 * Find the closest zombie hit along a ray (lag compensated to `tick`). Uses the shared pose-following hit volumes
 * (shared/zombies.js) evaluated with the state/animation progress/speed the zombie had at that tick, so the
 * server tests exactly the skull/torso/legs the shooter saw.
 */
export function traceZombies(game, ox, oy, oz, dx, dy, dz, maxDist, tick, exclude = null) {
  let best = null, bestT = maxDist, bestPart = 0;
  const back = Math.max(0, (game.tick - tick) * TICK_MS / 1000); // seconds the shot lies in the past
  for (const z of game.zombies.active) {
    if (z.state === ZSTATE.HIDDEN || z.state === ZSTATE.DEAD) continue;
    if (exclude && exclude.has(z)) continue;
    game.zombies.positionAtTick(z, tick, _hp);
    const cx = _hp.x, cy = _hp.y + z.vaultY, cz = _hp.z;
    // quick reject: distance from the ray to the zombie's centre (a leaning/climbing head can be ~1 m off the axis)
    const lx = cx - ox, ly = cy + 0.95 - oy, lz = cz - oz;
    const tca = lx * dx + ly * dy + lz * dz;
    if (tca < -1.5 || tca > bestT + 1.5) continue;
    const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
    if (d2 > 1.6 * 1.6) continue;
    // pose at that tick: ground speed from the position history, state progress rewound by `back`
    game.zombies.positionAtTick(z, tick - SPEED_TICKS, _hp0);
    const speed = Math.hypot(_hp.x - _hp0.x, _hp.z - _hp0.z) / (SPEED_TICKS * TICK_MS / 1000);
    pastStateAux(z, back, _st);
    zombieHitVolumes(z.type.scale, _st.state, _st.aux, speed, z.limp, _vol);
    const t = rayZombie(_vol, cx, cy, cz, _hp.yaw, ox, oy, oz, dx, dy, dz, bestT, _hit);
    if (t >= 0 && t < bestT) { bestT = t; best = z; bestPart = _hit.part; }
  }
  return best ? { z: best, t: bestT, part: bestPart } : null;
}

/** State + animation progress (0..255) the zombie had `back` seconds ago - what the shooter's snapshots showed. */
function pastStateAux(z, back, out) {
  let state = z.state, aux = z.aux;
  if (back > 0.001) {
    const st = z.stateT - back;
    if (state === ZSTATE.ATTACK) { if (st < 0) { state = ZSTATE.CHASE; aux = 0; } else aux = 255 * st / (z.type.attackWindup + z.type.attackRecover); }
    else if (state === ZSTATE.STAGGER) { if (st < 0) { state = ZSTATE.CHASE; aux = 0; } }
    else if (state === ZSTATE.ENTERING) aux = 255 * Math.max(0, z.enterT - back) / Math.max(1e-3, z.enterDur);
    else if (state === ZSTATE.TEARING) { let p = ((z.tearT - back) / z.type.tearTime) % 1; if (p < 0) p += 1; aux = 255 * p; }
  }
  out.state = state; out.aux = aux < 0 ? 0 : aux > 255 ? 255 : aux;
}

export function processShot(game, player, msg) {
  if (player.state !== PSTATE.ALIVE) return;
  const slot = player.slot;
  const held = player.weapons[slot];
  if (!held) return;
  const w = WEAPONS[held.id];
  if (!w || w.index !== msg.w) return;
  const now = game.time;
  if (player.switchEnd > now) return;
  if (player.reloadEnd > now) {
    if (w.reloadPerShell && held.mag > 0) { player.reloadEnd = 0; player.reloadShells = 0; game.markSelf(player); }
    else return;
  }
  if (held.mag <= 0) return;
  const interval = shotInterval(w) / ((player.mods && player.mods.rpm) || 1); // Double Tap
  const minGap = w.burst ? 0.9 * interval : 0.85 * interval;
  if (now - player.lastShot < minGap) return;
  player.lastShot = now;
  held.mag--;
  player.stats.shots += w.pellets || 1;
  game.markSelf(player);

  const o = msg.o, d = msg.d;
  if (!Array.isArray(o) || !Array.isArray(d) || o.length !== 3 || d.length !== 3) return;
  let ox = +o[0], oy = +o[1], oz = +o[2];
  let dx = +d[0], dy = +d[1], dz = +d[2];
  if (![ox, oy, oz, dx, dy, dz].every(Number.isFinite)) return;
  const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
  // sanity: origin near the player's eye
  if (Math.hypot(ox - player.x, oz - player.z) > 1.5 || Math.abs(oy - (player.y + 1.6)) > 1.2) { ox = player.x; oy = player.y + 1.62; oz = player.z; }
  let spread = +msg.s;
  if (!Number.isFinite(spread)) spread = w.spreadHip;
  spread = Math.max(w.spreadAds * 0.5, Math.min(w.spreadHip + w.spreadMove + 6, spread));
  const seed = (msg.seed | 0) >>> 0;
  const rt = Number.isFinite(+msg.rt) ? +msg.rt : game.time * 1000;
  let tick = Math.round(rt / TICK_MS);
  tick = Math.max(game.tick - 30, Math.min(game.tick, tick));

  // broadcast the shot to other players for visuals
  game.broadcastExcept(player, { t: 'shot', p: player.id, w: w.index, o: [r2(ox), r2(oy), r2(oz)], d: [r3(dx), r3(dy), r3(dz)], s: r2(spread), seed });

  if (w.projectile) { launchProjectile(game, player, w, ox, oy, oz, dx, dy, dz); return; }

  const dirs = computeShotDirections(w, dx, dy, dz, spread, seed);
  const maxRange = w.range * 2.5;
  for (const dir of dirs) {
    const hit = raycastWorld(game.world.hash, ox, oy, oz, dir[0], dir[1], dir[2], maxRange, 0, bulletFilter);
    const wallDist = hit ? hit.dist : maxRange;
    let remaining = w.penetrate || 1;
    let dmgMul = 1;
    const excluded = new Set();
    while (remaining > 0) {
      const zh = traceZombies(game, ox, oy, oz, dir[0], dir[1], dir[2], wallDist, tick, excluded);
      if (!zh) break;
      const dmgBase = damageAtDistance(w, zh.t) * dmgMul * damageMod(player.mods, w); // Double Tap
      const mul = zh.part === BODY_PART.HEAD ? w.headMul : zh.part === BODY_PART.LEGS ? w.legMul : 1;
      const hx = ox + dir[0] * zh.t, hy = oy + dir[1] * zh.t, hz = oz + dir[2] * zh.t;
      player.stats.hits++;
      game.awardPoints(player, game.POINTS.hit, 'hit');
      const killed = game.zombies.damage(zh.z, dmgBase * mul, zh.part, player, hx, hy, hz);
      if (w.chain) arcChain(game, player, zh.z, hx, hy, hz, w, tick);
      if (w.splash) splashDamage(game, player, hx, hy, hz, w.splash.radius, w.splash.damage, w.splash.damage * 0.4, zh.z);
      excluded.add(zh.z);
      remaining--;
      dmgMul *= 0.7;
      if (killed && remaining > 0) continue;
      if (!killed) break; // stopped by a living zombie unless penetrating
    }
  }
}

function arcChain(game, player, first, hx, hy, hz, w, tick) {
  const seen = new Set([first]);
  let cx = hx, cy = hy, cz = hz;
  const links = [];
  for (let i = 0; i < w.chain.count; i++) {
    let best = null, bd = w.chain.radius;
    for (const z of game.zombies.active) {
      if (seen.has(z) || z.state === ZSTATE.HIDDEN || z.state === ZSTATE.DEAD) continue;
      const d = Math.hypot(z.x - cx, z.z - cz);
      if (d < bd) { bd = d; best = z; }
    }
    if (!best) break;
    seen.add(best);
    const tx = best.x, ty = best.y + 1.1, tz = best.z;
    links.push([r2(tx), r2(ty), r2(tz)]);
    game.awardPoints(player, game.POINTS.hit, 'hit');
    game.zombies.damage(best, w.damage * w.chain.damageMul, BODY_PART.BODY, player, tx, ty, tz);
    cx = tx; cy = ty; cz = tz;
  }
  if (links.length) game.broadcast({ t: 'arc', from: [r2(hx), r2(hy), r2(hz)], links });
}

export function splashDamage(game, player, x, y, z, radius, damage, minDamage, excludeZ = null) {
  for (const zb of [...game.zombies.active]) {
    if (zb === excludeZ || zb.state === ZSTATE.HIDDEN || zb.state === ZSTATE.DEAD) continue;
    const d = Math.hypot(zb.x - x, (zb.y + 0.9) - y, zb.z - z);
    if (d > radius) continue;
    const dmg = damage - (damage - minDamage) * (d / radius);
    game.awardPoints(player, game.POINTS.hit, 'hit');
    player.stats.hits++;
    game.zombies.damage(zb, dmg, BODY_PART.BODY, player, zb.x, zb.y + 1.0, zb.z);
  }
}

export function launchProjectile(game, player, w, ox, oy, oz, dx, dy, dz) {
  const p = w.projectile;
  const proj = {
    id: game.nextProjId++ & 0xffff, owner: player.id, weapon: w, x: ox + dx * 0.6, y: oy + dy * 0.6, z: oz + dz * 0.6,
    vx: dx * p.speed, vy: dy * p.speed, vz: dz * p.speed, t: 0,
  };
  game.projectiles.push(proj);
}

export function updateProjectiles(game, dt) {
  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    const p = game.projectiles[i];
    const pd = p.weapon.projectile;
    p.t += dt;
    p.vy -= pd.gravity * dt;
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
    const len = Math.hypot(nx - p.x, ny - p.y, nz - p.z) || 1e-6;
    const dx = (nx - p.x) / len, dy = (ny - p.y) / len, dz = (nz - p.z) / len;
    let hitT = -1;
    const wh = raycastWorld(game.world.hash, p.x, p.y, p.z, dx, dy, dz, len + 0.1, 0, bulletFilter);
    if (wh) hitT = wh.dist;
    const zh = traceZombies(game, p.x, p.y, p.z, dx, dy, dz, hitT >= 0 ? hitT : len + 0.3, game.tick);
    if (zh) hitT = zh.t;
    if (hitT >= 0 || p.t > 6 || ny < -5) {
      const ex = hitT >= 0 ? p.x + dx * hitT : nx, ey = hitT >= 0 ? p.y + dy * hitT : ny, ez = hitT >= 0 ? p.z + dz * hitT : nz;
      game.projectiles.splice(i, 1);
      explode(game, p.owner, ex, ey, ez, pd.radius, p.weapon.damage, pd.minDamage, pd.selfDamage, zh ? zh.z : null);
      continue;
    }
    p.x = nx; p.y = ny; p.z = nz;
  }
}

export function explode(game, ownerId, x, y, z, radius, damage, minDamage, selfDamage, directZ = null) {
  const player = game.players.get(ownerId) || null;
  game.broadcast({ t: 'explode', x: r2(x), y: r2(y), z: r2(z), r: radius });
  if (directZ && player) {
    game.awardPoints(player, game.POINTS.hit, 'hit');
    game.zombies.damage(directZ, damage * 1.5, BODY_PART.BODY, player, x, y, z);
  }
  if (player) splashDamage(game, player, x, y, z, radius, damage, minDamage, directZ);
  if (selfDamage > 0) {
    for (const p of game.players.values()) {
      if (p.state !== PSTATE.ALIVE) continue;
      const d = Math.hypot(p.x - x, p.y + 0.9 - y, p.z - z);
      if (d < radius * 0.6) game.damagePlayer(p, Math.min(selfDamage, p.hp - 1 > 0 ? selfDamage : 0), null);
    }
  }
}

function r2(v) { return Math.round(v * 100) / 100; }
function r3(v) { return Math.round(v * 1000) / 1000; }
