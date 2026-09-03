// Zombie archetypes, infinite-round scaling formulas and the analytic hit volumes (shared by server + client).
import { raySphere, rayVCylinder } from './collision.js';
import { BODY_PART } from './constants.js';

export const ZOMBIE_TYPES = [
  { id: 0, name: 'shambler', speed: 1.55, turnRate: 3.0, attackDamage: 28, attackWindup: 0.5, attackRecover: 0.85, hpMul: 1.05, scale: 1.02, tearTime: 1.4, climbTime: 1.9, reach: 1.55 },
  { id: 1, name: 'walker', speed: 2.5, turnRate: 4.0, attackDamage: 30, attackWindup: 0.45, attackRecover: 0.75, hpMul: 1.0, scale: 1.0, tearTime: 1.2, climbTime: 1.6, reach: 1.55 },
  { id: 2, name: 'jogger', speed: 3.8, turnRate: 5.5, attackDamage: 32, attackWindup: 0.4, attackRecover: 0.65, hpMul: 0.95, scale: 0.98, tearTime: 1.0, climbTime: 1.3, reach: 1.6 },
  { id: 3, name: 'runner', speed: 5.4, turnRate: 7.0, attackDamage: 34, attackWindup: 0.33, attackRecover: 0.55, hpMul: 0.9, scale: 0.96, tearTime: 0.8, climbTime: 1.0, reach: 1.65 },
];

export const ZSTATE = {
  HIDDEN: 0,    // spawned but not yet visible (rising from manhole / behind wall)
  ENTERING: 1,  // climbing through window / over rubble
  TEARING: 2,   // ripping boards off a barricade
  CHASE: 3,
  ATTACK: 4,
  STAGGER: 5,
  DEAD: 6,
  VAULT: 7,
};

export const ZOMBIE_RADIUS = 0.32;
export const ZOMBIE_HEIGHT = 1.82;

// ---------------- hit volumes ----------------
// The visual rig (client/js/enemies/zombieRig.js) is a joint chain:
//   root (feet, yaw, uniform scale) -> body (walk bob) -> pelvis joint (y 1.02, pitched forward by the lean)
//   -> torso -> neck joint (+0.58) -> head joint (+0.10) -> head box 0.24 x 0.27 x 0.26 standing on the joint.
// The hit volumes are derived from the same chain with the pose the rig applies per state/progress/speed, so they
// follow the skull through every animation (walk/run lean, attack lunge, tearing, climbing crouch, stagger, limp):
//   head = sphere of r 0.23·scale around the true head-box centre (box half-diagonal 0.2225)
//   body = cylinder of r 0.30·scale along the spine (pelvis -> neck top) - covers the neck, tilts with the lean
//   legs = cylinder of r 0.26·scale below the pelvis along the same tilted axis
export const ZOMBIE_HEAD_R = 0.23;
export const ZOMBIE_BODY_R = 0.30;
export const ZOMBIE_LEGS_R = 0.26;
export const HEAD_PRIORITY = 0.25;  // a head hit wins over a body/legs entry up to this many metres before it
export const RIG = { pelvisY: 1.02, neckY: 0.58, headJointY: 0.10, headSize: [0.24, 0.27, 0.26], torsoSize: [0.44, 0.56, 0.26], bodyA: -0.17, bodyB: 0.70, legsA: -1.02, legsB: -0.17 };
// Rest-pose reference heights (feet = 0, scale 1). Superseded by zombieHitVolumes(); kept for older callers.
export const ZOMBIE_HEAD_Y = 1.835;
export const ZOMBIE_BODY_Y0 = 0.85;
export const ZOMBIE_BODY_Y1 = 1.70;
export const ZOMBIE_LEGS_Y0 = 0.0;
export const ZOMBIE_LEGS_Y1 = 0.85;

const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

/**
 * Deterministic pose parameters the rig applies for (state, aux, speed, limp). Mirrors Rig.update() and
 * Rig._zombieStatePose() minus the per-frame noise (walk-bob phase, idle head sway, hit flinch).
 *   aux   = 0..255 state progress (ATTACK / TEARING / ENTERING), speed = ground speed in m/s (the rig's smoothed speed)
 *   out   = { pelvis, head (pitches, rad, + = forward), bodyY (m), roll (rad), legs (pitch of the legs cylinder) }
 */
export function zombiePose(state, aux, speed, limp, out = {}) {
  const run = clamp01((speed - 2.6) / 2.4);
  const moving = Math.min(1, speed / 0.8);
  const lean = 0.12 + run * 0.28 + (limp ? 0.08 : 0);
  const p = clamp01(aux / 255);
  let pelvis = lean, head = -lean * 0.6, bodyY = (0.025 + run * 0.03) * moving * 0.5;
  if (state === ZSTATE.ATTACK) {
    const lunge = p > 0.35 && p < 0.7 ? Math.sin((p - 0.35) / 0.35 * Math.PI) * 0.35 : 0;
    pelvis = 0.15 + lunge; head = -0.3 - lunge * 0.4;
  } else if (state === ZSTATE.TEARING) {
    pelvis = 0.35 - Math.sin(p * Math.PI * 2) * 0.1;
  } else if (state === ZSTATE.ENTERING) {
    const crouch = Math.sin(p * Math.PI);
    pelvis = 0.3 + crouch * 0.9; bodyY = -crouch * 0.35;
  } else if (state === ZSTATE.STAGGER) {
    pelvis = -0.35; head = -0.5;
  }
  out.pelvis = pelvis; out.head = head; out.bodyY = bodyY; out.roll = limp ? 0.08 : 0;
  out.legs = state === ZSTATE.ENTERING ? Math.min(pelvis, 0.45) : pelvis; // climbing folds the legs; keep them near the ground
  return out;
}

const _pose = {};
/**
 * Hit volumes in the zombie's local frame (feet at the origin, +x right, +y up, +z forward), scaled by `scale`.
 *   out.head    = { x, y, z, r }            sphere around the head-box centre
 *   out.pelvisY, out.pitch, out.legsPitch   spine frame: origin (0, pelvisY, 0), rotated about x by the pitch
 *   out.body / out.legs = { a, b, r }       cylinders along the spine axis from a to b (a < b, pelvis = 0)
 */
export function zombieHitVolumes(scale, state, aux, speed, limp, out = {}) {
  const P = zombiePose(state, aux, speed, limp, _pose);
  const s = scale || 1;
  const ch = Math.cos(P.head), sh = Math.sin(P.head);
  const cp = Math.cos(P.pelvis), sp = Math.sin(P.pelvis);
  const cr = Math.cos(P.roll), sr = Math.sin(P.roll);
  // head-box centre relative to the pelvis joint before the pelvis pitch: neck 0.58 + head joint 0.10 + half height 0.135
  const yh = RIG.neckY + RIG.headJointY + RIG.headSize[1] / 2 * ch, zh = RIG.headSize[1] / 2 * sh;
  const py = RIG.pelvisY + P.bodyY;
  const h = out.head || (out.head = {});
  h.x = -yh * sr * s;                        // limp: the pelvis rolls, leaning the upper body to the left
  h.y = (py + yh * cr * cp - zh * sp) * s;
  h.z = (yh * cr * sp + zh * cp) * s;
  h.r = ZOMBIE_HEAD_R * s;
  out.pelvisY = py * s; out.pitch = P.pelvis; out.legsPitch = P.legs; out.scale = s;
  const b = out.body || (out.body = {}); b.a = RIG.bodyA * s; b.b = RIG.bodyB * s; b.r = ZOMBIE_BODY_R * s;
  const l = out.legs || (out.legs = {}); l.a = RIG.legsA * s; l.b = RIG.legsB * s; l.r = (state === ZSTATE.ENTERING ? 0.30 : ZOMBIE_LEGS_R) * s;
  return out;
}

/** World-space centre of the head sphere for volumes `vol` of a zombie at (px,py,pz) facing yaw. */
export function zombieHeadWorld(vol, px, py, pz, yaw, out = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw), h = vol.head;
  out.x = px + h.x * c + h.z * s; out.y = py + h.y; out.z = pz - h.x * s + h.z * c; out.r = h.r;
  return out;
}

/**
 * Ray vs. the hit volumes of a zombie standing at (px,py,pz) (feet) facing `yaw`.
 * Returns the entry distance along the ray (-1 = miss, only hits closer than maxT count) and writes the body part
 * (BODY_PART) into hit.part. A head intersection counts as a headshot even when the body/legs cylinder was entered
 * first, unless that entry lies more than HEAD_PRIORITY metres before the head entry (the bullet clearly hit the torso).
 */
export function rayZombie(vol, px, py, pz, yaw, ox, oy, oz, dx, dy, dz, maxT, hit) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // ray in the zombie's local frame (same yaw convention as collision.js: forward = (sin yaw, 0, cos yaw))
  const wx = ox - px, wy = oy - py, wz = oz - pz;
  const lox = wx * c - wz * s, loy = wy, loz = wx * s + wz * c;
  const ldx = dx * c - dz * s, ldy = dy, ldz = dx * s + dz * c;
  const H = vol.head;
  let tH = raySphere(lox, loy, loz, ldx, ldy, ldz, H.x, H.y, H.z, H.r);
  if (tH >= maxT) tH = -1;
  const tB = raySpineCylinder(vol.pelvisY, vol.pitch, vol.body, lox, loy, loz, ldx, ldy, ldz);
  const tL = raySpineCylinder(vol.pelvisY, vol.legsPitch, vol.legs, lox, loy, loz, ldx, ldy, ldz);
  let t = -1, part = BODY_PART.BODY;
  if (tB >= 0 && tB < maxT) { t = tB; part = BODY_PART.BODY; }
  if (tL >= 0 && tL < maxT && (t < 0 || tL < t)) { t = tL; part = BODY_PART.LEGS; }
  if (tH >= 0 && (t < 0 || tH < t + HEAD_PRIORITY)) { if (t < 0 || tH < t) t = tH; part = BODY_PART.HEAD; }
  if (hit) hit.part = part;
  return t;
}

/** Ray vs. a cylinder whose axis is the spine: origin (0, pelvisY, 0), tilted forward about x by `pitch`. */
function raySpineCylinder(pelvisY, pitch, cyl, ox, oy, oz, dx, dy, dz) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y = oy - pelvisY;
  // inverse of the rig's pitch rotation (y' = y cos - z sin, z' = y sin + z cos) applied to the ray
  const sy = y * cp + oz * sp, sz = -y * sp + oz * cp;
  const sdy = dy * cp + dz * sp, sdz = -dy * sp + dz * cp;
  return rayVCylinder(ox, sy, sz, dx, sdy, sdz, 0, 0, cyl.r, cyl.a, cyl.b);
}

/** Health per zombie for a round. Bounded growth so late rounds stay skill-based. */
export function zombieHealthForRound(r) {
  let hp;
  if (r <= 10) hp = 120 + 70 * (r - 1);
  else hp = 750 * Math.pow(1.05, r - 10);
  return Math.min(3200, Math.round(hp));
}

/** Total zombies to kill in a round. */
export function zombieCountForRound(r, players) {
  const base = 6 + 2 * r + 0.08 * r * r;
  const pf = [1, 1, 1.5, 2.0, 2.5, 2.9, 3.3, 3.7, 4.0][Math.min(8, Math.max(1, players))];
  return Math.round(base * pf);
}

/** Max simultaneously active zombies. */
export function maxAliveForRound(r, players) {
  const cap = 22 + 4 * Math.min(4, Math.max(1, players)) - 2; // 24..36 (4p); 8p -> 38
  const grow = 6 + 2 * r;
  return Math.min(cap, Math.min(40, grow + 2 * (players - 1)));
}

/** Seconds between spawns (pressure increases with round). */
export function spawnIntervalForRound(r) {
  return Math.max(0.35, 2.0 * Math.pow(0.9, r - 1));
}

/** Weights of [shambler, walker, jogger, runner] for a round. */
export function typeWeightsForRound(r) {
  const t = Math.min(1, (r - 1) / 30); // 0 at round 1 -> 1 at round 31
  const early = [0.62, 0.38, 0.0, 0.0];
  const late = [0.02, 0.13, 0.35, 0.50];
  const mid = [0.15, 0.45, 0.30, 0.10];
  const w = [];
  for (let i = 0; i < 4; i++) {
    const a = t < 0.35 ? lerp(early[i], mid[i], t / 0.35) : lerp(mid[i], late[i], (t - 0.35) / 0.65);
    w.push(a);
  }
  // no runners before round 4, no joggers before round 2
  if (r < 2) { w[2] = 0; }
  if (r < 4) { w[3] = 0; }
  return w;
}

function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

export function pickZombieType(rng, r) {
  const w = typeWeightsForRound(r);
  const total = w.reduce((a, b) => a + b, 0);
  let x = rng() * total;
  for (let i = 0; i < 4; i++) { x -= w[i]; if (x <= 0) return ZOMBIE_TYPES[i]; }
  return ZOMBIE_TYPES[1];
}
