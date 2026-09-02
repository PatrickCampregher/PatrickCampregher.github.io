// Zombie archetypes and infinite-round scaling formulas (shared by server + client).

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
export const ZOMBIE_HEAD_Y = 1.64;    // center of head sphere (relative to feet)
export const ZOMBIE_HEAD_R = 0.17;
export const ZOMBIE_BODY_Y0 = 0.85;
export const ZOMBIE_BODY_Y1 = 1.48;
export const ZOMBIE_BODY_R = 0.30;
export const ZOMBIE_LEGS_Y0 = 0.0;
export const ZOMBIE_LEGS_Y1 = 0.85;
export const ZOMBIE_LEGS_R = 0.26;

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
