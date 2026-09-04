// Server tick benchmark: 4 moving players, all doors open, round 25, reports step() timing.
import { GameServer } from '../server/game/gameServer.js';
import { PSTATE } from '../shared/constants.js';
import { encodeInput, IN } from '../shared/protocol.js';
class FakeConn { constructor() { this.alive = true; this.bytes = 0; } send(d) { this.bytes += typeof d === 'string' ? d.length : d.byteLength; } }
const nP = parseInt(process.argv[2] || '4', 10);
const lobby = { dev: true, lobby: { players: new Map() }, onGameEnded() {} };
for (let i = 1; i <= nP; i++) lobby.lobby.players.set(i, { id: i, name: 'B' + i, conn: new FakeConn(), inGame: false });
const g = new GameServer(lobby);
g.running = true;
for (const lp of lobby.lobby.players.values()) g.addPlayer(lp, false);
const anyP = [...g.players.values()][0];
g._onMessage ? null : null;
// open all doors + round 25 via cheat path
for (const id in g.world.doors) { const door = g.world.doors[id]; door.closed = false; g.nav.openDoor(id); for (const a of door.areas) g.unlocked.add(a); }
g.fieldsDirty++;
g.round = 24; g.roundState = 3; g.roundT = 0; // force next round
console.log('nav N', g.nav.N, 'layers', g.nav.layers);
// time computeField alone
{ const dist = new Uint16Array(g.nav.N); const c = g.nav.cellAt(anyP.x, anyP.y, anyP.z); const t0 = performance.now(); for (let i = 0; i < 50; i++) g.nav.computeField([c], dist); console.log('computeField ms', ((performance.now() - t0) / 50).toFixed(2)); }
let seq = 0, t = 0;
const times = []; let maxZ = 0;
for (let tick = 0; tick < 30 * 90; tick++) {
  t += 1 / 30;
  for (const p of g.players.values()) {
    // walk in a circle so the field cell changes often
    const ang = t * 0.6 + p.id; const x = p.x + Math.cos(ang) * 0.12, z = p.z + Math.sin(ang) * 0.12;
    p.hp = 100; p.state = PSTATE.ALIVE;
    g._onInput(p, { seq: ++seq, x, y: p.y, z, yaw: ang, pitch: 0, flags: IN.MOVING, slot: 0, time: 0 });
  }
  const t0 = performance.now(); g.step(1 / 30); times.push(performance.now() - t0);
  maxZ = Math.max(maxZ, g.zombies.active.length);
}
times.sort((a, b) => a - b);
const pct = (q) => times[Math.floor(times.length * q)].toFixed(2);
console.log(`players ${nP} maxZombies ${maxZ} round ${g.round} step ms p50 ${pct(0.5)} p90 ${pct(0.9)} p99 ${pct(0.99)} max ${times[times.length - 1].toFixed(2)} bytes/s per client ${(anyP.conn.bytes / 90) | 0}`);
