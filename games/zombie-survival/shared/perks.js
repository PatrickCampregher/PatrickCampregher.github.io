// Perk vending machines: definitions, costs, gameplay modifiers and machine "personality" lines.
// Shared by the server (authoritative purchases, modifiers) and the client (prompts, HUD icons, machine visuals).
import { PERK, PLAYER } from './constants.js';

export const PERK_ORDER = ['jugg', 'revive', 'speed', 'dtap'];
export const PERK_MAX = PERK.maxPerks;

export const PERK_RULES = {
  juggHealth: 250,        // Juggernog max health
  reviveHoldMul: 0.5,     // Quick Revive: revive teammates twice as fast
  soloReviveDelay: 8,     // Quick Revive (solo): seconds downed before getting back up
  soloReviveMax: 3,       // Quick Revive (solo): purchases per game
  reloadMul: 0.55,        // Speed Cola: reload time multiplier
  repairMul: 2,           // Speed Cola: barricade repair speed multiplier
  dtapRpm: 1.25,          // Double Tap: fire rate multiplier
  dtapDmg: 1.5,           // Double Tap: bullet damage multiplier
  dtapDmgSpecial: 1.2,    // Double Tap: projectile / splash / chain weapons
};

export const PERKS = {
  jugg: {
    id: 'jugg', name: 'Juggernog', short: 'JUGG', cost: 2500, tagline: 'MAX HEALTH 250',
    color: '#c8262b', accent: '#f4e2b8', light: '#ff4a38', symbol: 'cap', flavor: 'ROOT BEER',
    lines: [
      'Drink up, meat. You will need the extra padding.',
      'Two hundred and fifty reasons to keep standing.',
      'Tastes like iron. Smells like victory.',
      'Thick skin, thicker skull. Enjoy.',
    ],
  },
  revive: {
    id: 'revive', name: 'Quick Revive', short: 'REVIVE', cost: 1500, soloCost: 500, tagline: 'FASTER REVIVES',
    color: '#1e9fb4', accent: '#e8fbff', light: '#3ad4ff', symbol: 'cross', flavor: 'ICE TONIC',
    lines: [
      'Death is a suggestion. Have another sip.',
      'Bounce back faster. Terms and conditions apply.',
      'Second chances, served ice cold.',
      'Get up. Nobody is finished yet.',
    ],
  },
  speed: {
    id: 'speed', name: 'Speed Cola', short: 'SPEED', cost: 3000, tagline: 'FAST RELOADS',
    color: '#2f9a3e', accent: '#f0e25a', light: '#5aff6a', symbol: 'bottle', flavor: 'LIME FIZZ',
    lines: [
      'Fingers faster, excuses fewer.',
      'Reload like the world depends on it. It does.',
      'Fizzy. Quick. Gone.',
      'No time to breathe, only to load.',
    ],
  },
  dtap: {
    id: 'dtap', name: 'Double Tap', short: 'DTAP', cost: 2000, tagline: 'FIRE RATE + DAMAGE',
    color: '#d1772a', accent: '#5a3a1c', light: '#ff9a3a', symbol: 'revolver', flavor: 'SARSAPARILLA',
    lines: [
      'Two bullets, one trigger. Yee-haw.',
      'Lead flies twice as mean out here.',
      'Fast hands win the west.',
      'Draw quicker or draw last.',
    ],
  },
};

/** Purchase price; Quick Revive is cheaper (and limited) when exactly one player is in the game. */
export function perkCost(id, solo = false) {
  const p = PERKS[id];
  if (!p) return 0;
  return solo && p.soloCost != null ? p.soloCost : p.cost;
}

/** Gameplay modifiers for a set of owned perk ids. Sent to the client in the `self` message as `mods`. */
export function computeMods(perks) {
  const has = (id) => perks.includes(id);
  return {
    reload: has('speed') ? PERK_RULES.reloadMul : 1,
    repair: has('speed') ? PERK_RULES.repairMul : 1,
    rpm: has('dtap') ? PERK_RULES.dtapRpm : 1,
    dmg: has('dtap') ? PERK_RULES.dtapDmg : 1,
    dmgSpecial: has('dtap') ? PERK_RULES.dtapDmgSpecial : 1,
    maxHp: has('jugg') ? PERK_RULES.juggHealth : PLAYER.maxHealth,
    revive: has('revive') ? PERK_RULES.reviveHoldMul : 1,
  };
}

/** Projectile / splash / chain weapons get the smaller Double Tap damage bonus. */
export function isSpecialWeapon(w) { return !!(w && (w.projectile || w.splash || w.chain)); }

/** Damage multiplier a player's mods give to a weapon (1 when no mods). */
export function damageMod(mods, w) {
  if (!mods) return 1;
  return isSpecialWeapon(w) ? (mods.dmgSpecial || 1) : (mods.dmg || 1);
}

/** A personality line for a machine (random with the given rng, or Math.random). */
export function pickLine(id, rng = Math.random) {
  const p = PERKS[id];
  if (!p || !p.lines.length) return '';
  return p.lines[Math.min(p.lines.length - 1, Math.floor(rng() * p.lines.length))];
}
