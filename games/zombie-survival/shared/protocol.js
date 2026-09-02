// Network protocol: JSON text messages ({t:'name', ...}) for events/RPC,
// compact binary frames for the high-frequency snapshot and input streams.

export const BIN = { SNAPSHOT: 1, INPUT: 2, PING: 3, PONG: 4 };

// Player input flags
export const IN = {
  SPRINT: 1, CROUCH: 2, ADS: 4, FIRING: 8, MOVING: 16, ONGROUND: 32, JUMP: 64, RELOADING: 128,
};

const _enc = new TextEncoder();
const _dec = new TextDecoder();

// ---------- Snapshot ----------
// u8 type | u32 tick | f64 time | u16 round | u8 rstate | u16 zleft | u8 pflags |
// u8 nPlayers [ u8 id f32 x f32 y f32 z i16 yaw i16 pitch u8 flags u8 state u8 hp u8 weapon u8 revive ]
// u8 nZombies [ u16 id i16 x i16 y i16 z u8 yaw u8 type u8 state u8 hp u8 aux ]
// u8 nPowerups [ u16 id u8 type i16 x i16 y i16 z u8 ttl ]
// u8 nProjectiles [ u16 id i16 x i16 y i16 z ]

export function encodeSnapshot(s, buf) {
  const need = 24 + s.players.length * 24 + s.zombies.length * 13 + s.powerups.length * 10 + s.projectiles.length * 8;
  if (!buf || buf.byteLength < need) buf = new ArrayBuffer(Math.max(need, 1024));
  const dv = new DataView(buf);
  let o = 0;
  dv.setUint8(o, BIN.SNAPSHOT); o += 1;
  dv.setUint32(o, s.tick >>> 0, true); o += 4;
  dv.setFloat64(o, s.time, true); o += 8;
  dv.setUint16(o, s.round, true); o += 2;
  dv.setUint8(o, s.roundState); o += 1;
  dv.setUint16(o, Math.min(65535, s.zombiesLeft), true); o += 2;
  dv.setUint8(o, s.powerupFlags); o += 1;
  dv.setUint8(o, s.players.length); o += 1;
  for (const p of s.players) {
    dv.setUint8(o, p.id); o += 1;
    dv.setFloat32(o, p.x, true); o += 4;
    dv.setFloat32(o, p.y, true); o += 4;
    dv.setFloat32(o, p.z, true); o += 4;
    dv.setInt16(o, Math.round(p.yaw * 10000), true); o += 2;
    dv.setInt16(o, Math.round(p.pitch * 10000), true); o += 2;
    dv.setUint8(o, p.flags); o += 1;
    dv.setUint8(o, p.state); o += 1;
    dv.setUint8(o, Math.max(0, Math.min(255, Math.round(p.hp)))); o += 1;
    dv.setUint8(o, p.weapon); o += 1;
    dv.setUint8(o, p.revive); o += 1;
  }
  dv.setUint8(o, s.zombies.length); o += 1;
  for (const z of s.zombies) {
    dv.setUint16(o, z.id, true); o += 2;
    dv.setInt16(o, clampI16(z.x * 100), true); o += 2;
    dv.setInt16(o, clampI16(z.y * 100), true); o += 2;
    dv.setInt16(o, clampI16(z.z * 100), true); o += 2;
    dv.setUint8(o, yawToByte(z.yaw)); o += 1;
    dv.setUint8(o, z.type); o += 1;
    dv.setUint8(o, z.state); o += 1;
    dv.setUint8(o, z.hp); o += 1;
    dv.setUint8(o, z.aux); o += 1;
  }
  dv.setUint8(o, s.powerups.length); o += 1;
  for (const p of s.powerups) {
    dv.setUint16(o, p.id, true); o += 2;
    dv.setUint8(o, p.type); o += 1;
    dv.setInt16(o, clampI16(p.x * 100), true); o += 2;
    dv.setInt16(o, clampI16(p.y * 100), true); o += 2;
    dv.setInt16(o, clampI16(p.z * 100), true); o += 2;
    dv.setUint8(o, p.ttl); o += 1;
  }
  dv.setUint8(o, s.projectiles.length); o += 1;
  for (const p of s.projectiles) {
    dv.setUint16(o, p.id, true); o += 2;
    dv.setInt16(o, clampI16(p.x * 100), true); o += 2;
    dv.setInt16(o, clampI16(p.y * 100), true); o += 2;
    dv.setInt16(o, clampI16(p.z * 100), true); o += 2;
  }
  return new Uint8Array(buf, 0, o);
}

export function decodeSnapshot(dv, o = 1) {
  const s = {};
  s.tick = dv.getUint32(o, true); o += 4;
  s.time = dv.getFloat64(o, true); o += 8;
  s.round = dv.getUint16(o, true); o += 2;
  s.roundState = dv.getUint8(o); o += 1;
  s.zombiesLeft = dv.getUint16(o, true); o += 2;
  s.powerupFlags = dv.getUint8(o); o += 1;
  const np = dv.getUint8(o); o += 1;
  s.players = new Array(np);
  for (let i = 0; i < np; i++) {
    const p = {};
    p.id = dv.getUint8(o); o += 1;
    p.x = dv.getFloat32(o, true); o += 4;
    p.y = dv.getFloat32(o, true); o += 4;
    p.z = dv.getFloat32(o, true); o += 4;
    p.yaw = dv.getInt16(o, true) / 10000; o += 2;
    p.pitch = dv.getInt16(o, true) / 10000; o += 2;
    p.flags = dv.getUint8(o); o += 1;
    p.state = dv.getUint8(o); o += 1;
    p.hp = dv.getUint8(o); o += 1;
    p.weapon = dv.getUint8(o); o += 1;
    p.revive = dv.getUint8(o); o += 1;
    s.players[i] = p;
  }
  const nz = dv.getUint8(o); o += 1;
  s.zombies = new Array(nz);
  for (let i = 0; i < nz; i++) {
    const z = {};
    z.id = dv.getUint16(o, true); o += 2;
    z.x = dv.getInt16(o, true) / 100; o += 2;
    z.y = dv.getInt16(o, true) / 100; o += 2;
    z.z = dv.getInt16(o, true) / 100; o += 2;
    z.yaw = byteToYaw(dv.getUint8(o)); o += 1;
    z.type = dv.getUint8(o); o += 1;
    z.state = dv.getUint8(o); o += 1;
    z.hp = dv.getUint8(o); o += 1;
    z.aux = dv.getUint8(o); o += 1;
    s.zombies[i] = z;
  }
  const npu = dv.getUint8(o); o += 1;
  s.powerups = new Array(npu);
  for (let i = 0; i < npu; i++) {
    const p = {};
    p.id = dv.getUint16(o, true); o += 2;
    p.type = dv.getUint8(o); o += 1;
    p.x = dv.getInt16(o, true) / 100; o += 2;
    p.y = dv.getInt16(o, true) / 100; o += 2;
    p.z = dv.getInt16(o, true) / 100; o += 2;
    p.ttl = dv.getUint8(o); o += 1;
    s.powerups[i] = p;
  }
  const npr = dv.getUint8(o); o += 1;
  s.projectiles = new Array(npr);
  for (let i = 0; i < npr; i++) {
    const p = {};
    p.id = dv.getUint16(o, true); o += 2;
    p.x = dv.getInt16(o, true) / 100; o += 2;
    p.y = dv.getInt16(o, true) / 100; o += 2;
    p.z = dv.getInt16(o, true) / 100; o += 2;
    s.projectiles[i] = p;
  }
  return s;
}

// ---------- Input ----------
// u8 type | u32 seq | f32 x y z | f32 yaw | f32 pitch | u8 flags | u8 slot | f64 clientTime
export const INPUT_SIZE = 1 + 4 + 12 + 4 + 4 + 1 + 1 + 8;
export function encodeInput(inp, buf) {
  if (!buf) buf = new ArrayBuffer(INPUT_SIZE);
  const dv = new DataView(buf);
  let o = 0;
  dv.setUint8(o, BIN.INPUT); o += 1;
  dv.setUint32(o, inp.seq >>> 0, true); o += 4;
  dv.setFloat32(o, inp.x, true); o += 4;
  dv.setFloat32(o, inp.y, true); o += 4;
  dv.setFloat32(o, inp.z, true); o += 4;
  dv.setFloat32(o, inp.yaw, true); o += 4;
  dv.setFloat32(o, inp.pitch, true); o += 4;
  dv.setUint8(o, inp.flags); o += 1;
  dv.setUint8(o, inp.slot); o += 1;
  dv.setFloat64(o, inp.time, true); o += 8;
  return new Uint8Array(buf, 0, o);
}
export function decodeInput(dv, o = 1) {
  const inp = {};
  inp.seq = dv.getUint32(o, true); o += 4;
  inp.x = dv.getFloat32(o, true); o += 4;
  inp.y = dv.getFloat32(o, true); o += 4;
  inp.z = dv.getFloat32(o, true); o += 4;
  inp.yaw = dv.getFloat32(o, true); o += 4;
  inp.pitch = dv.getFloat32(o, true); o += 4;
  inp.flags = dv.getUint8(o); o += 1;
  inp.slot = dv.getUint8(o); o += 1;
  inp.time = dv.getFloat64(o, true); o += 8;
  return inp;
}

// ---------- Ping ----------
export function encodePing(type, clientTime, serverTime = 0) {
  const buf = new ArrayBuffer(17);
  const dv = new DataView(buf);
  dv.setUint8(0, type);
  dv.setFloat64(1, clientTime, true);
  dv.setFloat64(9, serverTime, true);
  return new Uint8Array(buf);
}
export function decodePing(dv) {
  return { clientTime: dv.getFloat64(1, true), serverTime: dv.getFloat64(9, true) };
}

function clampI16(v) { v = Math.round(v); return v < -32768 ? -32768 : v > 32767 ? 32767 : v; }
export function yawToByte(yaw) {
  let a = yaw % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return Math.round(a / (Math.PI * 2) * 255) & 255;
}
export function byteToYaw(b) { return b / 255 * Math.PI * 2; }

export function encodeJSON(obj) { return JSON.stringify(obj); }
export function decodeJSON(str) { try { return JSON.parse(str); } catch (e) { return null; } }
