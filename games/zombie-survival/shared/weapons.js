import { addPackAPunchVariants } from './pap.js';
// Original weapon roster. All weapons are fictional designs inspired by firearm categories.
// Rarity drives Mystery Box weighting. Stats are tuned for arcade round-based survival.
//
// Field notes (shared by client + server):
//   rpm            sustained cyclic rate; for burst weapons the rate INSIDE a burst (burstDelay adds the pause after it)
//   burst          rounds per trigger pull (0 = none); burstDelay = pause after a burst (s)
//   hyperburst     AN-94 style: the first N rounds of a trigger pull fire at burstRpm, then sustained fire at rpm
//   reloadAnim     'mag' | 'shells' | 'break' | 'cylinder' | 'belt' | 'cell' | 'tube'  (view-model animation + foley set)
//   eject          'brass' | 'shell' | 'none'   (casing ejection visual); ejectDelay = seconds after the shot (bolt actions)
//   look           procedural model description: type (pistol|revolver|smg|rifle|shotgun|sniper|lmg|launcher|energy),
//                  style (sub-variant per type), color (receiver), accent (furniture), glow (emissive), pap (upgraded finish)
//   splash         { radius, damage, selfDamage?, selfRadius? }  self damage applies when the blast is within selfRadius of the shooter

export const RARITY_WEIGHT = { common: 10, uncommon: 6, rare: 3, legendary: 1 };

const R = (pitch, yaw, kick) => ({ pitch, yaw, kick });

export const WEAPONS = {
  // ======================= PISTOLS =======================
  warden_p9: {
    id: 'warden_p9', name: 'Warden P9', cls: 'Pistol', rarity: 'common', inBox: false,
    damage: 38, headMul: 2.6, legMul: 0.75, rpm: 430, auto: false, burst: 0, pellets: 1,
    mag: 12, reserve: 96, reloadTime: 1.35, switchTime: 0.28, adsTime: 0.14, zoom: 1.1,
    spreadHip: 1.4, spreadAds: 0.25, spreadMove: 1.0, spreadPerShot: 0.5, recoil: R(1.4, 0.4, 0.05),
    moveMul: 1.0, range: 45, sound: 'pistol', reloadAnim: 'mag', eject: 'brass',
    look: { type: 'pistol', style: 'poly', color: '#2b2e33', accent: '#33363b' },
  },
  marshal_45: {
    id: 'marshal_45', name: 'Marshal .45', cls: 'Heavy Pistol', rarity: 'uncommon', inBox: true,
    damage: 64, headMul: 2.9, legMul: 0.75, rpm: 320, auto: false, burst: 0, pellets: 1,
    mag: 8, reserve: 72, reloadTime: 1.6, switchTime: 0.28, adsTime: 0.15, zoom: 1.1,
    spreadHip: 1.5, spreadAds: 0.22, spreadMove: 1.0, spreadPerShot: 0.6, recoil: R(2.2, 0.6, 0.08),
    moveMul: 1.0, range: 50, sound: 'marshal', reloadAnim: 'mag', eject: 'brass',
    look: { type: 'pistol', style: '1911', color: '#8f9399', accent: '#5a3a22' },
  },
  hornet_20: {
    id: 'hornet_20', name: 'Hornet 20', cls: 'Machine Pistol', rarity: 'common', inBox: true,
    damage: 26, headMul: 2.1, legMul: 0.75, rpm: 750, auto: true, burst: 0, pellets: 1,
    mag: 20, reserve: 160, reloadTime: 1.6, switchTime: 0.26, adsTime: 0.12, zoom: 1.1,
    spreadHip: 2.2, spreadAds: 0.45, spreadMove: 1.1, spreadPerShot: 0.32, recoil: R(0.6, 0.5, 0.035),
    moveMul: 1.02, range: 35, sound: 'hornet', reloadAnim: 'mag', eject: 'brass',
    look: { type: 'pistol', style: 'machine', color: '#1e2124', accent: '#2c3034' },
  },
  cicada_3r: {
    id: 'cicada_3r', name: 'Cicada 3R', cls: 'Burst Pistol', rarity: 'uncommon', inBox: true,
    damage: 34, headMul: 2.4, legMul: 0.75, rpm: 1200, auto: false, burst: 3, burstDelay: 0.2, pellets: 1,
    mag: 18, reserve: 144, reloadTime: 1.7, switchTime: 0.28, adsTime: 0.14, zoom: 1.15,
    spreadHip: 1.7, spreadAds: 0.3, spreadMove: 1.0, spreadPerShot: 0.4, recoil: R(1.2, 0.45, 0.05),
    moveMul: 1.0, range: 38, sound: 'cicada', reloadAnim: 'mag', eject: 'brass',
    look: { type: 'pistol', style: 'burst', color: '#25282c', accent: '#4a3a2a' },
  },
  magistrate_410: {
    id: 'magistrate_410', name: 'Magistrate .410', cls: 'Shotgun Revolver', rarity: 'uncommon', inBox: true,
    damage: 24, headMul: 1.7, legMul: 0.8, rpm: 150, auto: false, burst: 0, pellets: 5,
    mag: 5, reserve: 50, reloadTime: 3.2, switchTime: 0.32, adsTime: 0.18, zoom: 1.1,
    spreadHip: 5.0, spreadAds: 3.5, spreadMove: 1.0, spreadPerShot: 0.0, recoil: R(4.0, 1.2, 0.14),
    moveMul: 1.0, range: 10, sound: 'magistrate', reloadAnim: 'cylinder', eject: 'none',
    look: { type: 'revolver', style: 'judge', color: '#5c6066', accent: '#2a2a2a' },
  },
  ironhorse_44: {
    id: 'ironhorse_44', name: 'Ironhorse .44', cls: 'Revolver', rarity: 'uncommon', inBox: true,
    damage: 130, headMul: 3.0, legMul: 0.8, rpm: 165, auto: false, burst: 0, pellets: 1,
    mag: 6, reserve: 60, reloadTime: 2.5, switchTime: 0.32, adsTime: 0.18, zoom: 1.2,
    spreadHip: 1.6, spreadAds: 0.15, spreadMove: 1.1, spreadPerShot: 0.9, recoil: R(4.2, 1.2, 0.14),
    moveMul: 1.0, range: 60, sound: 'revolver', reloadAnim: 'cylinder', eject: 'none',
    look: { type: 'revolver', style: 'magnum', color: '#8a8f96', accent: '#4a2e1a' },
  },
  // ======================= SMGs =======================
  vesper_smg: {
    id: 'vesper_smg', name: 'Vesper SMG', cls: 'SMG', rarity: 'common', inBox: true,
    damage: 31, headMul: 2.0, legMul: 0.75, rpm: 900, auto: true, burst: 0, pellets: 1,
    mag: 32, reserve: 224, reloadTime: 1.7, switchTime: 0.38, adsTime: 0.16, zoom: 1.15,
    spreadHip: 2.5, spreadAds: 0.65, spreadMove: 1.4, spreadPerShot: 0.25, recoil: R(0.7, 0.5, 0.03),
    moveMul: 1.0, range: 32, sound: 'smg', reloadAnim: 'mag', eject: 'brass',
    look: { type: 'smg', style: 'box', color: '#26292e', accent: '#3d4148' },
  },
  nightjar_mp: {
    id: 'nightjar_mp', name: 'Nightjar MP', cls: 'SMG', rarity: 'uncommon', inBox: true,
    damage: 37, headMul: 2.3, legMul: 0.75, rpm: 750, auto: true, burst: 0, pellets: 1,
    mag: 30, reserve: 210, reloadTime: 1.75, switchTime: 0.38, adsTime: 0.15, zoom: 1.2,
    spreadHip: 1.8, spreadAds: 0.3, spreadMove: 1.2, spreadPerShot: 0.18, recoil: R(0.55, 0.35, 0.025),
    moveMul: 0.98, range: 45, sound: 'nightjar', reloadAnim: 'mag', eject: 'brass',
    look: { type: 'smg', style: 'mp', color: '#1f2226', accent: '#2a2d31' },
  },
  wasp_pdw: {
    id: 'wasp_pdw', name: 'Wasp PDW', cls: 'PDW', rarity: 'common', inBox: true,
    damage: 24, headMul: 2.3, legMul: 0.75, rpm: 1000, auto: true, burst: 0, pellets: 1,
    mag: 40, reserve: 280, reloadTime: 1.7, switchTime: 0.32, adsTime: 0.12, zoom: 1.1,
    spreadHip: 2.8, spreadAds: 0.7, spreadMove: 1.3, spreadPerShot: 0.2, recoil: R(0.5, 0.6, 0.02),
    moveMul: 1.06, range: 28, sound: 'wasp', reloadAnim: 'mag', eject: 'brass',
    look: { type: 'smg', style: 'pdw', color: '#2a2e2a', accent: '#3d4238' },
  },
  hive_50: {
    id: 'hive_50', name: 'Hive 50', cls: 'SMG', rarity: 'uncommon', inBox: true,
    damage: 30, headMul: 2.0, legMul: 0.75, rpm: 760, auto: true, burst: 0, pellets: 1,
    mag: 50, reserve: 250, reloadTime: 2.7, switchTime: 0.4, adsTime: 0.19, zoom: 1.15,
    spreadHip: 2.6, spreadAds: 0.55, spreadMove: 1.4, spreadPerShot: 0.22, recoil: R(0.65, 0.45, 0.03),
    moveMul: 0.97, range: 36, sound: 'hive', reloadAnim: 'tube', eject: 'brass',
    look: { type: 'smg', style: 'helical', color: '#232629', accent: '#3a3d40' },
  },
  // ======================= RIFLES =======================
  kestrel_ar: {
    id: 'kestrel_ar', name: 'Kestrel AR', cls: 'Assault Rifle', rarity: 'common', inBox: true,
    damage: 44, headMul: 2.3, legMul: 0.75, rpm: 690, auto: true, burst: 0, pellets: 1,
    mag: 30, reserve: 270, reloadTime: 2.1, switchTime: 0.42, adsTime: 0.18, zoom: 1.3,
    spreadHip: 2.2, spreadAds: 0.35, spreadMove: 1.4, spreadPerShot: 0.3, recoil: R(1.0, 0.55, 0.04),
    moveMul: 0.95, range: 65, sound: 'rifle', reloadAnim: 'mag', eject: 'brass',
    look: { type: 'rifle', style: 'ar', color: '#23262a', accent: '#7a5a34' },
  },
  tundra_7: {
    id: 'tundra_7', name: 'Tundra 7', cls: 'Assault Rifle', rarity: 'uncommon', inBox: true,
    damage: 56, headMul: 2.5, legMul: 0.75, rpm: 580, auto: true, burst: 0, pellets: 1,
    mag: 30, reserve: 240, reloadTime: 2.7, switchTime: 0.45, adsTime: 0.2, zoom: 1.3,
    spreadHip: 2.8, spreadAds: 0.45, spreadMove: 1.5, spreadPerShot: 0.45, recoil: R(1.6, 0.8, 0.06),
    moveMul: 0.93, range: 60, sound: 'tundra', reloadAnim: 'mag', eject: 'brass',
    look: { type: 'rifle', style: 'ak', color: '#3a3a3a', accent: '#7a4a24' },
  },
  ibex_ar: {
    id: 'ibex_ar', name: 'Ibex AR', cls: 'Assault Rifle', rarity: 'uncommon', inBox: true,
    damage: 38, headMul: 2.3, legMul: 0.75, rpm: 800, auto: true, burst: 0, pellets: 1,
    mag: 36, reserve: 288, reloadTime: 1.4, switchTime: 0.4, adsTime: 0.15, zoom: 1.3,
    spreadHip: 1.8, spreadAds: 0.5, spreadMove: 1.3, spreadPerShot: 0.28, recoil: R(0.8, 0.6, 0.035),
    moveMul: 0.98, range: 55, sound: 'ibex', reloadAnim: 'mag', eject: 'brass',
    look: { type: 'rifle', style: 'galil', color: '#2c2f33', accent: '#3a3a3a' },
  },
  sable_hb2: {
    id: 'sable_hb2', name: 'Sable HB-2', cls: 'Hyperburst Rifle', rarity: 'rare', inBox: true,
    damage: 48, headMul: 2.6, legMul: 0.75, rpm: 540, auto: true, burst: 0, hyperburst: 2, burstRpm: 1800, pellets: 1,
    mag: 30, reserve: 210, reloadTime: 2.5, switchTime: 0.45, adsTime: 0.19, zoom: 1.35,
    spreadHip: 2.1, spreadAds: 0.26, spreadMove: 1.3, spreadPerShot: 0.3, recoil: R(0.9, 0.45, 0.04),
    moveMul: 0.92, range: 75, sound: 'sable', reloadAnim: 'mag', eject: 'brass',
    look: { type: 'rifle', style: 'hb', color: '#2a2c30', accent: '#1a1a1a' },
  },
  trident_b3: {
    id: 'trident_b3', name: 'Trident B3', cls: 'Burst Rifle', rarity: 'uncommon', inBox: true,
    damage: 54, headMul: 2.5, legMul: 0.75, rpm: 950, auto: false, burst: 3, burstDelay: 0.22, pellets: 1,
    mag: 30, reserve: 240, reloadTime: 1.9, switchTime: 0.42, adsTime: 0.18, zoom: 1.3,
    spreadHip: 1.9, spreadAds: 0.2, spreadMove: 1.3, spreadPerShot: 0.35, recoil: R(1.1, 0.4, 0.04),
    moveMul: 0.96, range: 80, sound: 'trident', reloadAnim: 'mag', eject: 'brass',
    look: { type: 'rifle', style: 'carry', color: '#2f3336', accent: '#5a6a3a', carry: true },
  },
  bulwark_br: {
    id: 'bulwark_br', name: 'Bulwark BR', cls: 'Battle Rifle', rarity: 'uncommon', inBox: true,
    damage: 78, headMul: 2.4, legMul: 0.8, rpm: 450, auto: true, burst: 0, pellets: 1,
    mag: 20, reserve: 180, reloadTime: 2.3, switchTime: 0.48, adsTime: 0.2, zoom: 1.35,
    spreadHip: 2.6, spreadAds: 0.3, spreadMove: 1.6, spreadPerShot: 0.45, recoil: R(1.9, 0.8, 0.065),
    moveMul: 0.9, range: 80, sound: 'battle', penetrate: 2, reloadAnim: 'mag', eject: 'brass',
    look: { type: 'rifle', style: 'battle', color: '#2a2d30', accent: '#4a3a2a', long: true },
  },
  // ======================= SHOTGUNS =======================
  gatekeeper_12: {
    id: 'gatekeeper_12', name: 'Gatekeeper 12', cls: 'Pump Shotgun', rarity: 'common', inBox: true,
    damage: 26, headMul: 1.6, legMul: 0.8, rpm: 68, auto: false, burst: 0, pellets: 8,
    mag: 6, reserve: 54, reloadTime: 0.55, reloadPerShell: true, switchTime: 0.48, adsTime: 0.2, zoom: 1.1,
    spreadHip: 5.5, spreadAds: 4.0, spreadMove: 1.0, spreadPerShot: 0.0, recoil: R(5.0, 1.0, 0.18),
    moveMul: 0.95, range: 14, sound: 'shotgun', reloadAnim: 'shells', eject: 'shell', ejectDelay: 0.25, pump: true,
    look: { type: 'shotgun', style: 'pump', color: '#2b2b2b', accent: '#5a3a22' },
  },
  raptor_s8: {
    id: 'raptor_s8', name: 'Raptor S8', cls: 'Semi-Auto Shotgun', rarity: 'uncommon', inBox: true,
    damage: 24, headMul: 1.6, legMul: 0.8, rpm: 280, auto: false, burst: 0, pellets: 8,
    mag: 8, reserve: 64, reloadTime: 0.42, reloadPerShell: true, switchTime: 0.48, adsTime: 0.2, zoom: 1.1,
    spreadHip: 5.0, spreadAds: 3.4, spreadMove: 1.0, spreadPerShot: 0.0, recoil: R(3.6, 1.1, 0.14),
    moveMul: 0.94, range: 13, sound: 'raptor', reloadAnim: 'shells', eject: 'shell',
    look: { type: 'shotgun', style: 'semi', color: '#1f2224', accent: '#2d3035' },
  },
  hydra_as: {
    id: 'hydra_as', name: 'Hydra AS', cls: 'Auto Shotgun', rarity: 'rare', inBox: true,
    damage: 20, headMul: 1.6, legMul: 0.8, rpm: 230, auto: true, burst: 0, pellets: 8,
    mag: 10, reserve: 70, reloadTime: 2.8, switchTime: 0.5, adsTime: 0.22, zoom: 1.1,
    spreadHip: 6.0, spreadAds: 4.5, spreadMove: 1.0, spreadPerShot: 0.0, recoil: R(3.2, 1.2, 0.12),
    moveMul: 0.92, range: 12, sound: 'autoshotgun', reloadAnim: 'mag', eject: 'shell',
    look: { type: 'shotgun', style: 'drum', color: '#1f2224', accent: '#2d3a45', drum: true },
  },
  twinbore: {
    id: 'twinbore', name: 'Twinbore', cls: 'Double-Barrel Shotgun', rarity: 'uncommon', inBox: true,
    damage: 34, headMul: 1.7, legMul: 0.8, rpm: 260, auto: false, burst: 0, pellets: 12,
    mag: 2, reserve: 40, reloadTime: 1.5, switchTime: 0.4, adsTime: 0.17, zoom: 1.1,
    spreadHip: 6.5, spreadAds: 5.0, spreadMove: 1.0, spreadPerShot: 0.0, recoil: R(7.0, 1.8, 0.22),
    moveMul: 0.98, range: 11, sound: 'twinbore', reloadAnim: 'break', eject: 'none',
    look: { type: 'shotgun', style: 'double', color: '#3a3a3a', accent: '#6a4020' },
  },
  siege_14: {
    id: 'siege_14', name: 'Siege 14', cls: 'Bullpup Pump Shotgun', rarity: 'rare', inBox: true,
    damage: 20, headMul: 1.6, legMul: 0.8, rpm: 85, auto: false, burst: 0, pellets: 9,
    mag: 14, reserve: 56, reloadTime: 0.5, reloadPerShell: true, switchTime: 0.5, adsTime: 0.24, zoom: 1.15,
    spreadHip: 4.8, spreadAds: 3.2, spreadMove: 1.0, spreadPerShot: 0.0, recoil: R(5.2, 1.1, 0.18),
    moveMul: 0.92, range: 16, sound: 'siege', reloadAnim: 'shells', eject: 'shell', ejectDelay: 0.25, pump: true,
    look: { type: 'shotgun', style: 'bullpup', color: '#2a2c2a', accent: '#3a3d3a' },
  },
  // ======================= SNIPERS / MARKSMAN =======================
  sentinel_dmr: {
    id: 'sentinel_dmr', name: 'Sentinel DMR', cls: 'Marksman Rifle', rarity: 'uncommon', inBox: true,
    damage: 115, headMul: 2.6, legMul: 0.8, rpm: 300, auto: false, burst: 0, pellets: 1,
    mag: 15, reserve: 135, reloadTime: 2.2, switchTime: 0.48, adsTime: 0.22, zoom: 2.0, scope: true,
    spreadHip: 3.0, spreadAds: 0.1, spreadMove: 2.0, spreadPerShot: 0.7, recoil: R(2.6, 0.9, 0.08),
    moveMul: 0.92, range: 120, sound: 'dmr', penetrate: 2, reloadAnim: 'mag', eject: 'brass',
    look: { type: 'sniper', style: 'dmr', color: '#25282b', accent: '#556b2f', short: true },
  },
  longbow_700: {
    id: 'longbow_700', name: 'Longbow 700', cls: 'Bolt-Action Rifle', rarity: 'uncommon', inBox: true,
    damage: 480, headMul: 3.0, legMul: 0.8, rpm: 52, auto: false, burst: 0, pellets: 1,
    mag: 5, reserve: 45, reloadTime: 2.8, switchTime: 0.55, adsTime: 0.26, zoom: 3.0, scope: true,
    spreadHip: 6.0, spreadAds: 0.05, spreadMove: 3.0, spreadPerShot: 1.0, recoil: R(6.0, 1.5, 0.2),
    moveMul: 0.9, range: 200, sound: 'sniper', penetrate: 3, reloadAnim: 'mag', eject: 'brass', ejectDelay: 0.3, boltAction: true,
    look: { type: 'sniper', style: 'bolt', color: '#2c2f31', accent: '#3a2a1a' },
  },
  harbinger_bx: {
    id: 'harbinger_bx', name: 'Harbinger BX', cls: 'Heavy Bolt-Action', rarity: 'rare', inBox: true,
    damage: 1500, headMul: 3.0, legMul: 0.8, rpm: 32, auto: false, burst: 0, pellets: 1,
    mag: 3, reserve: 24, reloadTime: 3.4, switchTime: 0.65, adsTime: 0.3, zoom: 4.0, scope: true,
    spreadHip: 7.0, spreadAds: 0.04, spreadMove: 3.5, spreadPerShot: 1.2, recoil: R(8.0, 2.0, 0.26),
    moveMul: 0.85, range: 250, sound: 'harbinger', penetrate: 5, reloadAnim: 'mag', eject: 'brass', ejectDelay: 0.35, boltAction: true,
    look: { type: 'sniper', style: 'heavy', color: '#1e2022', accent: '#2a2a2a' },
  },
  goliath_50: {
    id: 'goliath_50', name: 'Goliath .50', cls: 'Anti-Materiel Rifle', rarity: 'legendary', inBox: true,
    damage: 650, headMul: 2.6, legMul: 0.85, rpm: 100, auto: false, burst: 0, pellets: 1,
    mag: 10, reserve: 40, reloadTime: 3.8, switchTime: 0.7, adsTime: 0.32, zoom: 3.5, scope: true,
    spreadHip: 6.5, spreadAds: 0.08, spreadMove: 3.5, spreadPerShot: 1.4, recoil: R(7.0, 2.2, 0.24),
    moveMul: 0.8, range: 220, sound: 'goliath', penetrate: 5, reloadAnim: 'mag', eject: 'brass',
    look: { type: 'sniper', style: 'antimat', color: '#2a2a2a', accent: '#3a3a3a' },
  },
  // ======================= LMGs =======================
  reaper_lmg: {
    id: 'reaper_lmg', name: 'Reaper LMG', cls: 'Light Machine Gun', rarity: 'rare', inBox: true,
    damage: 46, headMul: 2.1, legMul: 0.75, rpm: 720, auto: true, burst: 0, pellets: 1,
    mag: 80, reserve: 320, reloadTime: 4.2, switchTime: 0.7, adsTime: 0.28, zoom: 1.25,
    spreadHip: 3.0, spreadAds: 0.55, spreadMove: 2.0, spreadPerShot: 0.12, recoil: R(0.8, 0.7, 0.035),
    moveMul: 0.84, range: 70, sound: 'lmg', reloadAnim: 'belt', eject: 'brass',
    look: { type: 'lmg', style: 'box', color: '#202326', accent: '#3b3b3b' },
  },
  anvil_75: {
    id: 'anvil_75', name: 'Anvil 75', cls: 'Heavy Assault MG', rarity: 'rare', inBox: true,
    damage: 56, headMul: 2.3, legMul: 0.75, rpm: 560, auto: true, burst: 0, pellets: 1,
    mag: 75, reserve: 300, reloadTime: 3.4, switchTime: 0.65, adsTime: 0.34, zoom: 1.4,
    spreadHip: 2.4, spreadAds: 0.22, spreadMove: 1.8, spreadPerShot: 0.1, recoil: R(0.75, 0.4, 0.035),
    moveMul: 0.86, range: 85, sound: 'anvil', reloadAnim: 'mag', eject: 'brass',
    look: { type: 'lmg', style: 'hamr', color: '#2a2a2c', accent: '#4a4a3a' },
  },
  colossus_rd: {
    id: 'colossus_rd', name: 'Colossus RD', cls: 'Light Machine Gun', rarity: 'rare', inBox: true,
    damage: 60, headMul: 2.2, legMul: 0.75, rpm: 600, auto: true, burst: 0, pellets: 1,
    mag: 100, reserve: 300, reloadTime: 5.4, switchTime: 0.75, adsTime: 0.32, zoom: 1.25,
    spreadHip: 3.4, spreadAds: 0.6, spreadMove: 2.2, spreadPerShot: 0.18, recoil: R(1.1, 0.9, 0.05),
    moveMul: 0.8, range: 65, sound: 'colossus', reloadAnim: 'belt', eject: 'brass',
    look: { type: 'lmg', style: 'drum', color: '#3a3630', accent: '#7a4a24' },
  },
  // ======================= SPECIAL =======================
  thumper_gl: {
    id: 'thumper_gl', name: 'Thumper GL', cls: 'Grenade Launcher', rarity: 'rare', inBox: true,
    damage: 650, headMul: 1.0, legMul: 1.0, rpm: 55, auto: false, burst: 0, pellets: 1,
    mag: 1, reserve: 14, reloadTime: 2.0, switchTime: 0.55, adsTime: 0.22, zoom: 1.15,
    spreadHip: 1.0, spreadAds: 0.3, spreadMove: 0.5, spreadPerShot: 0.0, recoil: R(4.5, 1.0, 0.15),
    moveMul: 0.9, range: 60, sound: 'launcher', projectile: { speed: 32, gravity: 12, radius: 4.2, minDamage: 180, selfDamage: 35 },
    reloadAnim: 'break', eject: 'none',
    look: { type: 'launcher', style: 'break', color: '#2e3a2e', accent: '#7a7a4a' },
  },
  arc_cannon: {
    id: 'arc_cannon', name: 'Arc Cannon', cls: 'Experimental', rarity: 'legendary', inBox: true,
    damage: 380, headMul: 1.5, legMul: 1.0, rpm: 130, auto: false, burst: 0, pellets: 1,
    mag: 8, reserve: 48, reloadTime: 3.0, switchTime: 0.6, adsTime: 0.24, zoom: 1.2,
    spreadHip: 0.8, spreadAds: 0.2, spreadMove: 0.6, spreadPerShot: 0.0, recoil: R(2.5, 0.6, 0.1),
    moveMul: 0.9, range: 80, sound: 'arc', chain: { count: 4, radius: 7, damageMul: 0.75 }, reloadAnim: 'cell', eject: 'none',
    look: { type: 'energy', style: 'arc', color: '#1e2a33', accent: '#39d0ff', glow: '#39d0ff' },
  },
  ray_rifle: {
    id: 'ray_rifle', name: 'Ray Rifle', cls: 'Experimental', rarity: 'legendary', inBox: true,
    damage: 700, headMul: 1.4, legMul: 1.0, rpm: 220, auto: false, burst: 0, pellets: 1,
    mag: 20, reserve: 160, reloadTime: 2.4, switchTime: 0.5, adsTime: 0.2, zoom: 1.3,
    spreadHip: 0.9, spreadAds: 0.15, spreadMove: 0.6, spreadPerShot: 0.2, recoil: R(1.6, 0.4, 0.06),
    moveMul: 0.95, range: 100, sound: 'ray', splash: { radius: 1.8, damage: 260 }, reloadAnim: 'cell', eject: 'none',
    look: { type: 'energy', style: 'ray', color: '#33231e', accent: '#ff7a2a', glow: '#ff5a1a' },
  },
  nova_pistol: {
    id: 'nova_pistol', name: 'Nova Pistol', cls: 'Energy Pistol', rarity: 'legendary', inBox: true,
    damage: 520, headMul: 1.2, legMul: 1.0, rpm: 170, auto: false, burst: 0, pellets: 1,
    mag: 20, reserve: 160, reloadTime: 2.9, switchTime: 0.35, adsTime: 0.16, zoom: 1.15,
    spreadHip: 0.7, spreadAds: 0.15, spreadMove: 0.5, spreadPerShot: 0.25, recoil: R(2.0, 0.5, 0.08),
    moveMul: 1.0, range: 80, sound: 'nova', splash: { radius: 2.4, damage: 320, selfDamage: 30, selfRadius: 3.2 }, reloadAnim: 'cell', eject: 'none',
    look: { type: 'energy', style: 'nova', color: '#4a3f36', accent: '#b8b0a0', glow: '#57ff6a' },
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

// ---------------- rate-of-fire helpers (burst / hyperburst) ----------------

/** Seconds between rounds inside a burst or hyperburst (falls back to the sustained interval). */
export function burstInterval(w) { return 60 / (w.burstRpm || w.rpm); }

/** Effective sustained rounds per minute with the trigger held / hammered (burst pauses included). */
export function sustainedRpm(w) {
  if (w.burst) { const cycle = w.burst * burstInterval(w) + (w.burstDelay || 0); return w.burst / cycle * 60; }
  return w.rpm;
}

/** Sustained body damage per second (all pellets, no headshots, no falloff). */
export function weaponDps(w) { return w.damage * (w.pellets || 1) * sustainedRpm(w) / 60; }

/** Damage of one full magazine (all pellets). */
export function magDamage(w) { return w.damage * (w.pellets || 1) * w.mag; }

/** Seconds to empty a full magazine with the trigger held (burst pauses included; per-shot for semi-autos). */
export function magEmptyTime(w) { return w.mag / (sustainedRpm(w) / 60); }
