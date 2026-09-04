// Shared gameplay constants (used by both the Node server and the browser client).

export const GAME_VERSION = '1.0.0';
export const PROTOCOL_VERSION = 4;

export const TICK_RATE = 30;            // server simulation Hz
export const TICK_MS = 1000 / TICK_RATE;
export const SNAPSHOT_EVERY = 1;        // send a snapshot every N ticks
export const INPUT_RATE = 30;           // client input send Hz
// Netcode robustness: a client whose inputs stop arriving (link stall, tab hitch) is "lagging" - zombies
// cannot hurt it for up to LAG_PROTECT_MAX s; snapshots are dropped for a client whose socket already
// holds more than SNAPSHOT_BACKLOG bytes so a stalled link never replays a long stale stream afterwards.
export const LAG_PROTECT_AFTER = 0.5;    // s without input before protection starts
export const LAG_PROTECT_MAX = 10;       // s of protection at most per stall
export const SNAPSHOT_BACKLOG = 12288;   // bytes queued on the socket above which snapshots are skipped

export const DEFAULT_HTTP_PORT = 8080;
export const DISCOVERY_PORT = 47800;    // UDP LAN discovery
export const MAX_PLAYERS_DEFAULT = 4;
export const MAX_PLAYERS_HARD = 8;

export const PLAYER = {
  radius: 0.36,
  height: 1.75,
  crouchHeight: 1.15,
  eyeBelowTop: 0.12,
  walkSpeed: 4.8,
  sprintSpeed: 7.3,
  crouchSpeed: 2.6,
  adsSpeedMul: 0.6,
  backpedalMul: 0.82,
  accelGround: 42,
  accelAir: 12,
  frictionGround: 11,
  jumpVel: 5.6,
  gravity: 21,
  stepHeight: 0.42,
  maxHealth: 100,
  regenDelay: 4.0,
  regenRate: 45,       // hp / s
  reviveTime: 4.0,     // seconds of holding E
  bleedoutTime: 45.0,  // seconds downed before death
  interactRange: 2.4,
  startPoints: 500,
};

export const POINTS = {
  hit: 10,
  kill: 60,
  headshotKill: 100,
  board: 10,
  boardCapPerRound: 100,
  revive: 50,
  blastWave: 400,
};

export const ROUND = {
  transitionDelay: 3.0,   // pause after the last zombie dies
  introDuration: 3.5,     // "ROUND X" display time
  firstRoundDelay: 4.0,
};

export const MYSTERY_BOX = {
  cost: 950,
  spinTime: 3.2,
  pickupWindow: 12.0,
  bearBaseChance: 0.15,
  bearChancePerUse: 0.06,
  bearMaxChance: 0.5,
  bearFreeUses: 3,
};

export const POWERUP = {
  lifetime: 28,
  blinkTime: 8,
  dropChance: 0.025,
  minGapSeconds: 40,
  maxPerRound: 4,
  effectTime: 30,
};

export const POWERUP_TYPES = ['resupply', 'oneshot', 'double', 'blast'];
export const POWERUP_INFO = {
  resupply: { name: 'FULL RESUPPLY', color: [0.35, 0.75, 1.0] },
  oneshot: { name: 'ONE-SHOT', color: [1.0, 0.2, 0.2] },
  double: { name: 'DOUBLE POINTS', color: [1.0, 0.85, 0.2] },
  blast: { name: 'BLAST WAVE', color: [1.0, 0.55, 0.15] },
};

// Player states
export const PSTATE = { ALIVE: 0, DOWNED: 1, DEAD: 2, SPECTATOR: 3 };
// Round states
export const RSTATE = { WAITING: 0, INTRO: 1, ACTIVE: 2, ENDING: 3, GAMEOVER: 4 };

export const BODY_PART = { BODY: 0, HEAD: 1, LEGS: 2 };

// ---- perks / pack-a-punch ----
export const PERK = {
  range: 2.8,          // purchase distance from the machine center
  maxPerks: 4,
  drinkTime: 1.6,      // first-person drink animation (no firing)
};
export const PAP = {
  cost: 5000,
  refillCost: 2000,    // re-Pack an upgraded weapon: full ammo
  wallAmmoCost: 4500,  // wall ammo for an upgraded weapon
  processTime: 5.0,    // seconds the machine works on the weapon
  pickupWindow: 15.0,  // seconds before the upgraded weapon is handed over automatically
  range: 2.8,
};
