// Pack-a-Punch: upgraded weapon variants (`<id>_pap`) and machine constants helpers.
// `addPackAPunchVariants(WEAPONS)` must run before WEAPON_LIST / WEAPON_INDEX are built (see weapons.js).
import { PAP } from './constants.js';

export const PAP_GLOW = '#b45cff';

// Unique upgraded names (fallback: "<name> Mk II").
const PAP_NAMES = {
  warden_p9: 'Warden Sovereign',
  ironhorse_44: 'Ironhorse Apocalypse',
  vesper_smg: 'Vesper Nocturne',
  trident_b3: 'Trident Tempest',
  kestrel_ar: 'Kestrel Valkyrie',
  bulwark_br: 'Bulwark Citadel',
  gatekeeper_12: 'Gatekeeper Cerberus',
  hydra_as: 'Hydra Nine-Heads',
  longbow_700: 'Longbow Skypiercer',
  sentinel_dmr: 'Sentinel Overwatch',
  reaper_lmg: 'Reaper Harvestmoon',
  thumper_gl: 'Thumper Ragnarok',
  arc_cannon: 'Arc Cannon Stormbringer',
  ray_rifle: 'Ray Rifle Solaris',
};

// Damage multiplier by weapon class (launcher / energy weapons: x2).
const CLASS_MUL = {
  'Pistol': 3.2, 'Revolver': 2.8, 'SMG': 3.0, 'Burst Rifle': 2.8, 'Assault Rifle': 2.8, 'Battle Rifle': 2.7,
  'Pump Shotgun': 2.8, 'Auto Shotgun': 2.6, 'Bolt-Action Rifle': 2.5, 'Marksman Rifle': 2.6, 'Light Machine Gun': 2.6,
  'Grenade Launcher': 2.0, 'Experimental': 2.0,
};

/** Damage multiplier for the upgraded version of a base weapon. */
export function papDamageMul(base) {
  const type = base.look && base.look.type;
  if (base.projectile || type === 'launcher' || type === 'energy' || base.chain || base.splash) return 2.0;
  return CLASS_MUL[base.cls] ?? 2.7;
}

/** Mutates the weapon table: adds an upgraded variant for every base weapon (skips existing upgraded ones). */
export function addPackAPunchVariants(WEAPONS) {
  for (const id of Object.keys(WEAPONS)) {
    const base = WEAPONS[id];
    if (!base || base.pap) continue;
    const upId = base.id + '_pap';
    if (WEAPONS[upId]) continue;
    const mul = papDamageMul(base);
    const r = base.recoil || { pitch: 1, yaw: 0.3, kick: 0.05 };
    const up = {
      ...base,
      id: upId, base: base.id, pap: true, inBox: false, rarity: base.rarity,
      name: PAP_NAMES[base.id] || (base.name + ' Mk II'),
      damage: Math.round(base.damage * mul),
      mag: Math.max(1, Math.round(base.mag * 1.5)),
      reserve: base.reserve * 2,
      headMul: Math.round((base.headMul + 0.2) * 100) / 100,
      reloadTime: Math.round(base.reloadTime * 0.9 * 1000) / 1000,
      recoil: { pitch: r.pitch * 0.9, yaw: r.yaw * 0.9, kick: r.kick * 0.9 },
      look: { ...(base.look || {}), pap: true, glow: PAP_GLOW },
      sound: base.sound,
    };
    if (base.projectile) up.projectile = { ...base.projectile, minDamage: Math.round(base.projectile.minDamage * mul) };
    if (base.splash) up.splash = { ...base.splash, damage: Math.round(base.splash.damage * mul) };
    if (base.chain) up.chain = { ...base.chain };
    delete up.index;
    WEAPONS[upId] = up;
  }
}

/** Id the machine produces for a held weapon definition (upgraded weapons come back as themselves = refill). */
export function papTargetId(def) { return def.pap ? def.id : def.id + '_pap'; }

/** Price of a Pack-a-Punch run for the held weapon definition. */
export function papCostFor(def) { return def && def.pap ? PAP.refillCost : PAP.cost; }
