import { addPackAPunchVariants } from './pap.js';
// Original weapon roster. All weapons are fictional designs inspired by firearm categories.
// Rarity drives Mystery Box weighting. Stats are tuned for arcade round-based survival.

export const RARITY_WEIGHT = { common: 10, uncommon: 6, rare: 3, legendary: 1 };

const R = (pitch, yaw, kick) => ({ pitch, yaw, kick });

export const WEAPONS = {
  warden_p9: {
    id: 'warden_p9', name: 'Warden P9', cls: 'Pistol', rarity: 'common', inBox: false,
    damage: 38, headMul: 2.6, legMul: 0.75, rpm: 430, auto: false, burst: 0, pellets: 1,
    mag: 12, reserve: 96, reloadTime: 1.35, switchTime: 0.3, adsTime: 0.16, zoom: 1.1,
    spreadHip: 1.4, spreadAds: 0.25, spreadMove: 1.0, spreadPerShot: 0.5, recoil: R(1.4, 0.4, 0.05),
    moveMul: 1.0, range: 45, sound: 'pistol', look: { type: 'pistol', color: '#2b2e33', accent: '#6b4a2a' },
  },
  ironhorse_44: {
    id: 'ironhorse_44', name: 'Ironhorse .44', cls: 'Revolver', rarity: 'uncommon', inBox: true,
    damage: 130, headMul: 3.0, legMul: 0.8, rpm: 165, auto: false, burst: 0, pellets: 1,
    mag: 6, reserve: 60, reloadTime: 2.5, switchTime: 0.35, adsTime: 0.2, zoom: 1.2,
    spreadHip: 1.6, spreadAds: 0.15, spreadMove: 1.1, spreadPerShot: 0.9, recoil: R(4.2, 1.2, 0.14),
    moveMul: 1.0, range: 60, sound: 'revolver', look: { type: 'revolver', color: '#8a8f96', accent: '#4a2e1a' },
  },
  vesper_smg: {
    id: 'vesper_smg', name: 'Vesper SMG', cls: 'SMG', rarity: 'common', inBox: true,
    damage: 32, headMul: 2.0, legMul: 0.75, rpm: 880, auto: true, burst: 0, pellets: 1,
    mag: 32, reserve: 224, reloadTime: 1.8, switchTime: 0.4, adsTime: 0.18, zoom: 1.15,
    spreadHip: 2.4, spreadAds: 0.6, spreadMove: 1.4, spreadPerShot: 0.25, recoil: R(0.7, 0.5, 0.03),
    moveMul: 1.0, range: 35, sound: 'smg', look: { type: 'smg', color: '#26292e', accent: '#3d4148' },
  },
  trident_b3: {
    id: 'trident_b3', name: 'Trident B3', cls: 'Burst Rifle', rarity: 'uncommon', inBox: true,
    damage: 48, headMul: 2.4, legMul: 0.75, rpm: 950, auto: false, burst: 3, burstDelay: 0.22, pellets: 1,
    mag: 30, reserve: 240, reloadTime: 2.0, switchTime: 0.45, adsTime: 0.2, zoom: 1.3,
    spreadHip: 2.0, spreadAds: 0.2, spreadMove: 1.3, spreadPerShot: 0.35, recoil: R(1.1, 0.4, 0.04),
    moveMul: 0.95, range: 70, sound: 'rifle', look: { type: 'rifle', color: '#2f3336', accent: '#5a6a3a', carry: true },
  },
  kestrel_ar: {
    id: 'kestrel_ar', name: 'Kestrel AR', cls: 'Assault Rifle', rarity: 'common', inBox: true,
    damage: 44, headMul: 2.3, legMul: 0.75, rpm: 690, auto: true, burst: 0, pellets: 1,
    mag: 30, reserve: 270, reloadTime: 2.1, switchTime: 0.45, adsTime: 0.2, zoom: 1.3,
    spreadHip: 2.2, spreadAds: 0.35, spreadMove: 1.4, spreadPerShot: 0.3, recoil: R(1.0, 0.55, 0.04),
    moveMul: 0.95, range: 65, sound: 'rifle', look: { type: 'rifle', color: '#23262a', accent: '#7a5a34' },
  },
  bulwark_br: {
    id: 'bulwark_br', name: 'Bulwark BR', cls: 'Battle Rifle', rarity: 'uncommon', inBox: true,
    damage: 74, headMul: 2.4, legMul: 0.8, rpm: 470, auto: true, burst: 0, pellets: 1,
    mag: 20, reserve: 180, reloadTime: 2.3, switchTime: 0.5, adsTime: 0.22, zoom: 1.35,
    spreadHip: 2.6, spreadAds: 0.3, spreadMove: 1.6, spreadPerShot: 0.45, recoil: R(1.8, 0.8, 0.06),
    moveMul: 0.9, range: 80, sound: 'battle', look: { type: 'rifle', color: '#2a2d30', accent: '#4a3a2a', long: true },
  },
  gatekeeper_12: {
    id: 'gatekeeper_12', name: 'Gatekeeper 12', cls: 'Pump Shotgun', rarity: 'common', inBox: true,
    damage: 26, headMul: 1.6, legMul: 0.8, rpm: 68, auto: false, burst: 0, pellets: 8,
    mag: 6, reserve: 54, reloadTime: 0.55, reloadPerShell: true, switchTime: 0.5, adsTime: 0.22, zoom: 1.1,
    spreadHip: 5.5, spreadAds: 4.0, spreadMove: 1.0, spreadPerShot: 0.0, recoil: R(5.0, 1.0, 0.18),
    moveMul: 0.95, range: 14, sound: 'shotgun', look: { type: 'shotgun', color: '#2b2b2b', accent: '#5a3a22' },
  },
  hydra_as: {
    id: 'hydra_as', name: 'Hydra AS', cls: 'Auto Shotgun', rarity: 'rare', inBox: true,
    damage: 20, headMul: 1.6, legMul: 0.8, rpm: 230, auto: true, burst: 0, pellets: 8,
    mag: 10, reserve: 70, reloadTime: 2.8, switchTime: 0.5, adsTime: 0.22, zoom: 1.1,
    spreadHip: 6.0, spreadAds: 4.5, spreadMove: 1.0, spreadPerShot: 0.0, recoil: R(3.2, 1.2, 0.12),
    moveMul: 0.92, range: 13, sound: 'autoshotgun', look: { type: 'shotgun', color: '#1f2224', accent: '#2d3a45', drum: true },
  },
  longbow_700: {
    id: 'longbow_700', name: 'Longbow 700', cls: 'Bolt-Action Rifle', rarity: 'uncommon', inBox: true,
    damage: 520, headMul: 3.0, legMul: 0.8, rpm: 44, auto: false, burst: 0, pellets: 1,
    mag: 5, reserve: 45, reloadTime: 2.9, switchTime: 0.6, adsTime: 0.3, zoom: 3.0, scope: true,
    spreadHip: 6.0, spreadAds: 0.05, spreadMove: 3.0, spreadPerShot: 1.0, recoil: R(6.0, 1.5, 0.2),
    moveMul: 0.9, range: 200, sound: 'sniper', penetrate: 3, look: { type: 'sniper', color: '#2c2f31', accent: '#3a2a1a' },
  },
  sentinel_dmr: {
    id: 'sentinel_dmr', name: 'Sentinel DMR', cls: 'Marksman Rifle', rarity: 'uncommon', inBox: true,
    damage: 115, headMul: 2.6, legMul: 0.8, rpm: 300, auto: false, burst: 0, pellets: 1,
    mag: 15, reserve: 135, reloadTime: 2.2, switchTime: 0.5, adsTime: 0.24, zoom: 2.0, scope: true,
    spreadHip: 3.0, spreadAds: 0.1, spreadMove: 2.0, spreadPerShot: 0.7, recoil: R(2.6, 0.9, 0.08),
    moveMul: 0.92, range: 120, sound: 'dmr', penetrate: 2, look: { type: 'sniper', color: '#25282b', accent: '#556b2f', short: true },
  },
  reaper_lmg: {
    id: 'reaper_lmg', name: 'Reaper LMG', cls: 'Light Machine Gun', rarity: 'rare', inBox: true,
    damage: 50, headMul: 2.1, legMul: 0.75, rpm: 660, auto: true, burst: 0, pellets: 1,
    mag: 100, reserve: 300, reloadTime: 4.6, switchTime: 0.75, adsTime: 0.3, zoom: 1.25,
    spreadHip: 3.0, spreadAds: 0.6, spreadMove: 2.0, spreadPerShot: 0.15, recoil: R(0.9, 0.7, 0.04),
    moveMul: 0.82, range: 70, sound: 'lmg', look: { type: 'lmg', color: '#202326', accent: '#3b3b3b' },
  },
  thumper_gl: {
    id: 'thumper_gl', name: 'Thumper GL', cls: 'Grenade Launcher', rarity: 'rare', inBox: true,
    damage: 650, headMul: 1.0, legMul: 1.0, rpm: 55, auto: false, burst: 0, pellets: 1,
    mag: 1, reserve: 14, reloadTime: 2.0, switchTime: 0.55, adsTime: 0.25, zoom: 1.15,
    spreadHip: 1.0, spreadAds: 0.3, spreadMove: 0.5, spreadPerShot: 0.0, recoil: R(4.5, 1.0, 0.15),
    moveMul: 0.9, range: 60, sound: 'launcher', projectile: { speed: 32, gravity: 12, radius: 4.2, minDamage: 180, selfDamage: 35 },
    look: { type: 'launcher', color: '#2e3a2e', accent: '#7a7a4a' },
  },
  arc_cannon: {
    id: 'arc_cannon', name: 'Arc Cannon', cls: 'Experimental', rarity: 'legendary', inBox: true,
    damage: 380, headMul: 1.5, legMul: 1.0, rpm: 130, auto: false, burst: 0, pellets: 1,
    mag: 8, reserve: 48, reloadTime: 3.0, switchTime: 0.6, adsTime: 0.25, zoom: 1.2,
    spreadHip: 0.8, spreadAds: 0.2, spreadMove: 0.6, spreadPerShot: 0.0, recoil: R(2.5, 0.6, 0.1),
    moveMul: 0.9, range: 80, sound: 'arc', chain: { count: 4, radius: 7, damageMul: 0.75 },
    look: { type: 'energy', color: '#1e2a33', accent: '#39d0ff', glow: '#39d0ff' },
  },
  ray_rifle: {
    id: 'ray_rifle', name: 'Ray Rifle', cls: 'Experimental', rarity: 'legendary', inBox: true,
    damage: 700, headMul: 1.4, legMul: 1.0, rpm: 240, auto: false, burst: 0, pellets: 1,
    mag: 20, reserve: 160, reloadTime: 2.4, switchTime: 0.5, adsTime: 0.22, zoom: 1.3,
    spreadHip: 0.9, spreadAds: 0.15, spreadMove: 0.6, spreadPerShot: 0.2, recoil: R(1.6, 0.4, 0.06),
    moveMul: 0.95, range: 100, sound: 'ray', splash: { radius: 1.8, damage: 260 },
    look: { type: 'energy', color: '#33231e', accent: '#ff7a2a', glow: '#ff5a1a' },
  },
};

addPackAPunchVariants(WEAPONS);
export const WEAPON_LIST = Object.values(WEAPONS);
export const WEAPON_INDEX = {};
WEAPON_LIST.forEach((w, i) => { w.index = i; WEAPON_INDEX[w.id] = i; });

export function weaponByIndex(i) { return WEAPON_LIST[i] || null; }

export function boxWeaponPool() {
  return WEAPON_LIST.filter(w => w.inBox);
}

/** Weighted random pick from box pool, excluding weapons the player already holds (unless nothing else). */
export function rollBoxWeapon(rng, exclude = []) {
  let pool = boxWeaponPool().filter(w => !exclude.includes(w.id));
  if (pool.length === 0) pool = boxWeaponPool();
  let total = 0;
  for (const w of pool) total += RARITY_WEIGHT[w.rarity];
  let r = rng() * total;
  for (const w of pool) {
    r -= RARITY_WEIGHT[w.rarity];
    if (r <= 0) return w;
  }
  return pool[pool.length - 1];
}

export function shotInterval(w) { return 60 / w.rpm; }

/** Damage falloff: full up to range, then linear down to 45% at 2x range */
export function damageAtDistance(w, dist) {
  if (dist <= w.range) return w.damage;
  const t = Math.min(1, (dist - w.range) / w.range);
  return w.damage * (1 - 0.55 * t);
}

/** Deterministic pellet spread pattern from a seed (same on client and server). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Compute shot directions for a weapon given a base direction (unit), spread in degrees and a seed.
 * Returns array of [x,y,z] unit vectors (length = pellets).
 */
export function computeShotDirections(w, dirX, dirY, dirZ, spreadDeg, seed) {
  const rng = mulberry32(seed);
  const n = w.pellets || 1;
  const out = [];
  // build an orthonormal basis around dir
  let ux, uy, uz;
  if (Math.abs(dirY) < 0.99) { ux = 0; uy = 1; uz = 0; } else { ux = 1; uy = 0; uz = 0; }
  // right = up x dir
  let rx = uy * dirZ - uz * dirY, ry = uz * dirX - ux * dirZ, rz = ux * dirY - uy * dirX;
  const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
  // true up = dir x right
  const tx = dirY * rz - dirZ * ry, ty = dirZ * rx - dirX * rz, tz = dirX * ry - dirY * rx;
  const spreadRad = spreadDeg * Math.PI / 180;
  for (let i = 0; i < n; i++) {
    let a, r;
    if (n === 1) { a = rng() * Math.PI * 2; r = Math.sqrt(rng()) * spreadRad; }
    else {
      // shotgun: first pellet centered, rest in a ring-ish pattern with jitter
      if (i === 0) { a = 0; r = rng() * spreadRad * 0.25; }
      else { a = (i / (n - 1)) * Math.PI * 2 + (rng() - 0.5) * 0.8; r = spreadRad * (0.45 + rng() * 0.55); }
    }
    const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
    // small-angle: dir + right*ox + up*oy, renormalize
    let x = dirX + rx * Math.tan(ox) + tx * Math.tan(oy);
    let y = dirY + ry * Math.tan(ox) + ty * Math.tan(oy);
    let z = dirZ + rz * Math.tan(ox) + tz * Math.tan(oy);
    const l = Math.hypot(x, y, z) || 1;
    out.push([x / l, y / l, z / l]);
  }
  return out;
}
