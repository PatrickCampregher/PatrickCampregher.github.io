#!/usr/bin/env node
// Hitbox verification without a browser.
//   1) Replicates the zombie rig's joint chain (client/js/enemies/zombieRig.js) in plain math, poses it for every
//      state / animation progress / speed / limp / type scale (with the per-frame noise the server cannot know: walk
//      bob phase, idle head sway) and shoots rays from a grid of origins all around the zombie (8 azimuths x 3 heights
//      x 7 distances, 1..40 m) at random points inside the VISUAL head box. >= 99% must register as HEAD through the
//      shared hit volumes (shared/zombies.js: zombieHitVolumes + rayZombie). Rays aimed at the torso centre must not
//      register as HEAD. Also prints the max uncovered corner distance of the head box per state (<= 0 = fully inside).
//   2) Runs the real server path (server/game/combat.js traceZombies on a headless GameServer with a spawned zombie)
//      for each state, including the lag-compensation rewind of the animation progress.
// Usage: node tools/test-hitbox.mjs [--verbose] [--rays N]
import { ZSTATE, ZOMBIE_TYPES, zombieHitVolumes, zombieHeadWorld, rayZombie } from '../shared/zombies.js';
import { BODY_PART, TICK_MS } from '../shared/constants.js';

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const RAYS = args.includes('--rays') ? parseInt(args[args.indexOf('--rays') + 1], 10) : 3;
const MIN_COVERAGE = 0.99;
const STATE_NAME = Object.fromEntries(Object.entries(ZSTATE).map(([k, v]) => [v, k]));

// ---------------- deterministic RNG ----------------
let seed = 1337;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// ---------------- rig replica (Babylon conventions: row vectors, Euler order roll Z -> pitch X -> yaw Y) ----------------
const rotX = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; };
const rotY = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
const rotZ = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };
const rotE = (v, r) => rotY(rotX(rotZ(v, r[2]), r[0]), r[1]);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const HEAD = [0.24, 0.27, 0.26], TORSO = [0.44, 0.56, 0.26];

/** Pose the rig applies (Rig.update + Rig._zombieStatePose for kind 'zombie'), incl. the noise terms. */
function rigPose(state, aux, spd, limp, ph, t) {
  const s = Math.sin(ph), c = Math.cos(ph);
  const moving = Math.min(1, spd / 0.8);
  const run = Math.min(1, Math.max(0, (spd - 2.6) / 2.4));
  let lean = 0.12 + run * 0.28;
  const bobAmp = 0.025 + run * 0.03;
  if (limp) lean += 0.08;
  const pose = {
    bodyY: Math.abs(c) * bobAmp * moving, bodyZ: 0,
    pelvis: [lean, 0, s * 0.04 * moving + (limp ? 0.08 : 0)],
    torso: [0, -s * 0.06 * moving, 0],
    head: [Math.sin(t * 1.3) * 0.08 - lean * 0.6, Math.sin(t * 0.7) * 0.25, Math.sin(t * 1.1) * 0.08],
  };
  const p = aux / 255;
  if (state === ZSTATE.ATTACK) { const lunge = p > 0.35 && p < 0.7 ? Math.sin((p - 0.35) / 0.35 * Math.PI) * 0.35 : 0; pose.pelvis[0] = 0.15 + lunge; pose.head[0] = -0.3 - lunge * 0.4; }
  else if (state === ZSTATE.TEARING) { const pull = Math.sin(p * Math.PI * 2) * 0.5; pose.pelvis[0] = 0.35 - pull * 0.2; }
  else if (state === ZSTATE.ENTERING) { const crouch = Math.sin(p * Math.PI); pose.pelvis[0] = 0.3 + crouch * 0.9; pose.bodyY = -crouch * 0.35; }
  else if (state === ZSTATE.STAGGER) { pose.pelvis[0] = -0.35; pose.head[0] = -0.5; }
  return pose;
}
/** Point given in the head part's frame (box spans x +-0.12, y -0.27..0, z +-0.13) -> world. */
function headPointToWorld(pt, pose, scale, pos, yaw) {
  let p = add(pt, [0, HEAD[1], 0]);                // part sits on the head joint (origin at its top, offset by its height)
  p = add(rotE(p, pose.head), [0, 0.1, 0]);         // head joint
  p = add(p, [0, 0.58, 0]);                         // neck joint
  p = rotE(p, pose.torso);                          // torso joint (at the pelvis)
  p = add(rotE(p, pose.pelvis), [0, 1.02, 0]);      // pelvis joint
  p = add(p, [0, pose.bodyY, pose.bodyZ]);          // body (bob)
  p = [p[0] * scale, p[1] * scale, p[2] * scale];   // root scale
  return add(rotY(p, yaw), pos);                    // root yaw + position
}
/** Point in the torso part's frame (box spans y -0.56..0 below its top at 0.58 above the pelvis) -> world. */
function torsoPointToWorld(pt, pose, scale, pos, yaw) {
  let p = add(pt, [0, 0.58, 0]);
  p = rotE(p, pose.torso);
  p = add(rotE(p, pose.pelvis), [0, 1.02, 0]);
  p = add(p, [0, pose.bodyY, pose.bodyZ]);
  p = [p[0] * scale, p[1] * scale, p[2] * scale];
  return add(rotY(p, yaw), pos);
}
function headCorners(pose, scale, pos, yaw) {
  const out = [];
  for (let i = 0; i < 8; i++) out.push(headPointToWorld([(i & 1 ? 1 : -1) * HEAD[0] / 2, i & 2 ? 0 : -HEAD[1], (i & 4 ? 1 : -1) * HEAD[2] / 2], pose, scale, pos, yaw));
  return out;
}

// ---------------- test matrix ----------------
const cases = [];
for (const spd of [0, 0.6, 1.55, 2.5, 3.2, 3.8, 4.6, 5.4]) for (const limp of [false, true]) cases.push({ state: ZSTATE.CHASE, aux: 0, spd, limp, label: `CHASE v=${spd}${limp ? ' limp' : ''}` });
for (let aux = 0; aux <= 255; aux += 15) cases.push({ state: ZSTATE.ATTACK, aux, spd: 0, limp: false, label: `ATTACK ${(aux / 255).toFixed(2)}` });
for (let aux = 0; aux <= 255; aux += 25) cases.push({ state: ZSTATE.TEARING, aux, spd: 0, limp: false, label: `TEARING ${(aux / 255).toFixed(2)}` });
for (let aux = 0; aux <= 255; aux += 15) cases.push({ state: ZSTATE.ENTERING, aux, spd: 1.4, limp: false, label: `ENTERING ${(aux / 255).toFixed(2)}` });
for (const limp of [false, true]) cases.push({ state: ZSTATE.STAGGER, aux: 0, spd: 0, limp, label: `STAGGER${limp ? ' limp' : ''}` });
for (const limp of [false, true]) cases.push({ state: ZSTATE.ATTACK, aux: 134, spd: 0, limp, label: `ATTACK lunge peak${limp ? ' limp' : ''}` });

const AZ = [0, 1, 2, 3, 4, 5, 6, 7].map(i => i * Math.PI / 4);
const HEIGHTS = [1.62, 4.5, 0.6];         // eye level, balcony, crouched/downed
const DISTS = [1, 2, 4, 8, 15, 25, 40];
const NOISE_SAMPLES = 3;

const hit = { part: 0 };
const per = new Map(); // state -> { head, total, torsoHead, torsoTotal, worst }
const stat = (state) => { let s = per.get(state); if (!s) { s = { head: 0, total: 0, torsoHead: 0, torsoTotal: 0, worst: -Infinity, worstLabel: '' }; per.set(state, s); } return s; };
let worstCase = null;
for (const type of ZOMBIE_TYPES) {
  const scale = type.scale;
  for (const cs of cases) {
    const st = stat(cs.state);
    for (let n = 0; n < NOISE_SAMPLES; n++) {
      const pose = rigPose(cs.state, cs.aux, cs.spd, cs.limp, rnd() * Math.PI * 2, rnd() * 100);
      const pos = [(rnd() - 0.5) * 60, rnd() < 0.3 ? 3.5 : 0.15, (rnd() - 0.5) * 40];
      const yaw = rnd() * Math.PI * 2;
      const vol = zombieHitVolumes(scale, cs.state, cs.aux, cs.spd, cs.limp);
      const hc = zombieHeadWorld(vol, pos[0], pos[1], pos[2], yaw);
      // corner coverage
      let worst = -Infinity;
      for (const c of headCorners(pose, scale, pos, yaw)) worst = Math.max(worst, Math.hypot(c[0] - hc.x, c[1] - hc.y, c[2] - hc.z) - hc.r);
      if (worst > st.worst) { st.worst = worst; st.worstLabel = `${cs.label} x${scale}`; }
      if (!worstCase || worst > worstCase.worst) worstCase = { worst, label: `${cs.label} x${scale}` };
      // rays at random points inside the visual head box
      for (const az of AZ) for (const h of HEIGHTS) for (const d of DISTS) {
        const o = [pos[0] + Math.sin(az) * d, pos[1] + h, pos[2] + Math.cos(az) * d];
        for (let k = 0; k < RAYS; k++) {
          const tgt = headPointToWorld([(rnd() - 0.5) * HEAD[0], -rnd() * HEAD[1], (rnd() - 0.5) * HEAD[2]], pose, scale, pos, yaw);
          const dx = tgt[0] - o[0], dy = tgt[1] - o[1], dz = tgt[2] - o[2], l = Math.hypot(dx, dy, dz);
          const t = rayZombie(vol, pos[0], pos[1], pos[2], yaw, o[0], o[1], o[2], dx / l, dy / l, dz / l, 1000, hit);
          st.total++;
          if (t >= 0 && hit.part === BODY_PART.HEAD) st.head++;
          else if (VERBOSE) console.log(`  MISS ${cs.label} x${scale} az=${(az * 180 / Math.PI).toFixed(0)} h=${h} d=${d} -> ${t < 0 ? 'nothing' : ['BODY', 'HEAD', 'LEGS'][hit.part]}`);
        }
      }
      // rays at the torso centre (inner half of the torso box) from eye level must not be headshots.
      // ENTERING is skipped: while climbing the head hangs in front of the chest, so front shots legitimately hit it first.
      if (cs.state !== ZSTATE.ENTERING) {
        for (const az of AZ) for (const d of DISTS.slice(1)) {
          const o = [pos[0] + Math.sin(az) * d, pos[1] + 1.62, pos[2] + Math.cos(az) * d];
          const tgt = torsoPointToWorld([(rnd() - 0.5) * TORSO[0] * 0.5, -TORSO[1] * (0.3 + rnd() * 0.4), (rnd() - 0.5) * TORSO[2] * 0.5], pose, scale, pos, yaw);
          const dx = tgt[0] - o[0], dy = tgt[1] - o[1], dz = tgt[2] - o[2], l = Math.hypot(dx, dy, dz);
          const t = rayZombie(vol, pos[0], pos[1], pos[2], yaw, o[0], o[1], o[2], dx / l, dy / l, dz / l, 1000, hit);
          st.torsoTotal++;
          if (t >= 0 && hit.part === BODY_PART.HEAD) { st.torsoHead++; if (VERBOSE) console.log(`  TORSO->HEAD ${cs.label} x${scale} az=${(az * 180 / Math.PI).toFixed(0)} d=${d}`); }
          else if (t < 0 && VERBOSE) console.log(`  TORSO->nothing ${cs.label} x${scale} az=${(az * 180 / Math.PI).toFixed(0)} d=${d}`);
        }
      }
    }
  }
}

let fail = 0;
console.log('1) shared hit volumes vs. the rig replica (rays from 8 azimuths x 3 heights x 7 distances at random points inside the drawn skull)');
console.log('   state      head rays   HEAD%   torso rays  ->HEAD%   max uncovered corner (m)   worst case');
let allHead = 0, allTotal = 0;
for (const [state, s] of [...per.entries()].sort((a, b) => a[0] - b[0])) {
  const cov = s.head / s.total, th = s.torsoTotal ? s.torsoHead / s.torsoTotal : 0;
  allHead += s.head; allTotal += s.total;
  const ok = cov >= MIN_COVERAGE && th < 0.01;
  if (!ok) fail++;
  console.log(`   ${STATE_NAME[state].padEnd(9)} ${String(s.total).padStart(9)}  ${(cov * 100).toFixed(2).padStart(6)}%  ${String(s.torsoTotal).padStart(10)}  ${(th * 100).toFixed(2).padStart(6)}%   ${s.worst.toFixed(3).padStart(8)}                   ${s.worstLabel}${ok ? '' : '   <-- FAIL'}`);
}
console.log(`   overall: ${allHead}/${allTotal} = ${(allHead / allTotal * 100).toFixed(2)}% HEAD (required >= ${MIN_COVERAGE * 100}%), max uncovered corner ${worstCase.worst.toFixed(3)} m (${worstCase.label})`);

// ---------------- 2) real server path ----------------
console.log('2) server traceZombies() on a headless GameServer');
const { GameServer } = await import('../server/game/gameServer.js');
const { traceZombies } = await import('../server/game/combat.js');
const conn = { alive: true, send() {} };
const fakeLobby = { lobby: { players: new Map([[1, { id: 1, name: 'Bot1', conn, inGame: false }]]) }, onGameEnded() {} };
const game = new GameServer(fakeLobby);
game.start();
const entry = game.world.entries.street_w1;
const z = game.zombies.spawn(entry, 1);
if (!z) { console.log('   could not spawn a zombie'); process.exit(1); }
const total = z.type.attackWindup + z.type.attackRecover;
const scenarios = [
  { label: 'CHASE', state: ZSTATE.CHASE, aux: 0, stateT: 3 },
  { label: 'ATTACK windup', state: ZSTATE.ATTACK, aux: Math.round(255 * 0.2), stateT: 0.2 * total },
  { label: 'ATTACK lunge', state: ZSTATE.ATTACK, aux: Math.round(255 * 0.52), stateT: 0.52 * total },
  { label: 'TEARING', state: ZSTATE.TEARING, aux: 191, stateT: 2, tearT: 0.75 * z.type.tearTime },
  { label: 'ENTERING', state: ZSTATE.ENTERING, aux: 128, stateT: 0.5 * z.type.climbTime, enterT: 0.5 * z.type.climbTime, enterDur: z.type.climbTime },
  { label: 'STAGGER', state: ZSTATE.STAGGER, aux: 0, stateT: 0.1 },
];
const shoot = (ox, oy, oz, tx, ty, tz, tick) => {
  const dx = tx - ox, dy = ty - oy, dz = tz - oz, l = Math.hypot(dx, dy, dz);
  return traceZombies(game, ox, oy, oz, dx / l, dy / l, dz / l, 100, tick);
};
const partName = (r) => r ? ['BODY', 'HEAD', 'LEGS'][r.part] : 'miss';
let serverFail = 0;
for (const sc of scenarios) {
  Object.assign(z, { x: 3, y: 0.15, z: -2, yaw: 0.9, histN: 0, vaultY: 0, limp: false, state: sc.state, aux: sc.aux, stateT: sc.stateT, tearT: sc.tearT || 0, enterT: sc.enterT || 0, enterDur: sc.enterDur || 1 });
  const vol = zombieHitVolumes(z.type.scale, sc.state, sc.aux, 0, false);
  const hc = zombieHeadWorld(vol, z.x, z.y, z.z, z.yaw);
  const fwd = [Math.sin(z.yaw), Math.cos(z.yaw)];
  const res = [];
  for (const [name, ax, az] of [['front', fwd[0], fwd[1]], ['back', -fwd[0], -fwd[1]], ['left', -fwd[1], fwd[0]], ['right', fwd[1], -fwd[0]]]) {
    const ox = z.x + ax * 6, oz = z.z + az * 6, oy = z.y + 1.62;
    const centre = shoot(ox, oy, oz, hc.x, hc.y, hc.z, game.tick);
    const forehead = shoot(ox, oy, oz, hc.x, hc.y + 0.11 * z.type.scale, hc.z, game.tick);
    const above = shoot(hc.x + ax * 2, hc.y + 4, hc.z + az * 2, hc.x, hc.y + 0.12, hc.z, game.tick);
    // torso centre: 0.30 up the (pitched) spine from the pelvis
    const cp = Math.cos(vol.pitch), sp = Math.sin(vol.pitch);
    const tx = z.x + fwd[0] * 0.30 * sp * z.type.scale, ty = z.y + vol.pelvisY + 0.30 * cp * z.type.scale, tz = z.z + fwd[1] * 0.30 * sp * z.type.scale;
    const torso = sc.state === ZSTATE.ENTERING && name === 'front' ? null : shoot(ox, oy, oz, tx, ty, tz, game.tick);
    const ok = partName(centre) === 'HEAD' && partName(forehead) === 'HEAD' && partName(above) === 'HEAD' && (torso === null || partName(torso) === 'BODY');
    if (!ok) serverFail++;
    res.push(`${name}: centre ${partName(centre)}, forehead ${partName(forehead)}, above ${partName(above)}, torso ${torso === null ? 'n/a' : partName(torso)}${ok ? '' : ' <-- FAIL'}`);
  }
  console.log(`   ${sc.label.padEnd(14)} head centre (${hc.x.toFixed(2)}, ${hc.y.toFixed(2)}, ${hc.z.toFixed(2)})`);
  for (const r of res) console.log(`      ${r}`);
}
// lag-compensation rewind: the shot was fired 4 ticks ago when the attack was earlier in its lunge
{
  game.tick = 500;
  const back = 4 * TICK_MS / 1000;
  const nowT = 0.55 * total, pastT = nowT - back;
  Object.assign(z, { x: 3, y: 0.15, z: -2, yaw: 0.9, histN: 0, vaultY: 0, limp: false, state: ZSTATE.ATTACK, aux: Math.round(255 * nowT / total), stateT: nowT });
  const volPast = zombieHitVolumes(z.type.scale, ZSTATE.ATTACK, 255 * pastT / total, 0, false);
  const volNow = zombieHitVolumes(z.type.scale, ZSTATE.ATTACK, 255 * nowT / total, 0, false);
  const hp = zombieHeadWorld(volPast, z.x, z.y, z.z, z.yaw), hn = zombieHeadWorld(volNow, z.x, z.y, z.z, z.yaw);
  const ox = z.x - Math.sin(z.yaw) * 6, oz = z.z - Math.cos(z.yaw) * 6, oy = z.y + 1.62;
  const rPast = shoot(ox, oy, oz, hp.x, hp.y + 0.12, hp.z, 496);
  const rNow = shoot(ox, oy, oz, hn.x, hn.y + 0.12, hn.z, 500);
  const ok = partName(rPast) === 'HEAD' && partName(rNow) === 'HEAD';
  if (!ok) serverFail++;
  console.log(`   rewind: head moved ${Math.hypot(hn.x - hp.x, hn.y - hp.y, hn.z - hp.z).toFixed(3)} m in ${(back * 1000).toFixed(0)} ms of lunge; shot at the old pose (tick-4) -> ${partName(rPast)}, at the current pose -> ${partName(rNow)}${ok ? '' : ' <-- FAIL'}`);
}
game.stop();
console.log(serverFail ? `   server path: ${serverFail} FAILURE(S)` : '   server path: OK');
const exitCode = fail || serverFail || allHead / allTotal < MIN_COVERAGE ? 1 : 0;
console.log(exitCode ? 'HITBOX TEST: FAILED' : 'HITBOX TEST: OK');
process.exit(exitCode);
