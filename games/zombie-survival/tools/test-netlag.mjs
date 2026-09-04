// Headless netcode robustness test (no browser): lag protection + snapshot backpressure on the server.
// Usage: node tools/test-netlag.mjs
import { GameServer } from '../server/game/gameServer.js';
import { PSTATE, LAG_PROTECT_AFTER, LAG_PROTECT_MAX } from '../shared/constants.js';
import { IN, BIN } from '../shared/protocol.js';
class FakeConn { constructor() { this.alive = true; this.bufferedAmount = 0; this.snaps = 0; this.msgs = []; } send(d) { if (typeof d === 'string') this.msgs.push(JSON.parse(d)); else if (d[0] === BIN.SNAPSHOT) this.snaps++; } }
const lobby = { dev: true, lobby: { players: new Map() }, onGameEnded() {} };
for (let i = 1; i <= 2; i++) lobby.lobby.players.set(i, { id: i, name: 'B' + i, conn: new FakeConn(), inGame: false });
const g = new GameServer(lobby); g.running = true;
for (const lp of lobby.lobby.players.values()) g.addPlayer(lp, false);
const [a, b] = [...g.players.values()];
let seq = 0, fails = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails++; };
const input = (p, x, z) => g._onInput(p, { seq: ++seq, x, y: p.y, z, yaw: 0, pitch: 0, flags: IN.MOVING, slot: 0, time: 0 });
const steps = (n, fn) => { for (let i = 0; i < n; i++) { if (fn) fn(); g.step(1 / 30); } };
const fakeZombie = { x: a.x + 0.5, z: a.z, y: a.y };

console.log('lag protection');
steps(90, () => { input(a, a.x, a.z); input(b, b.x, b.z); }); // past spawn protection
check(!a.lagging && !b.lagging, 'players sending input are not lagging');
g.damagePlayer(a, 10, fakeZombie); check(a.hp === a.maxHp - 10, 'zombie damage applies normally');
a.hp = a.maxHp;
// A's link stalls: no input for 2 s while B keeps playing
steps(Math.ceil(2 / (1 / 30)), () => input(b, b.x, b.z));
check(a.lagging, `A flagged lagging after ${LAG_PROTECT_AFTER}s without input`);
check(!b.lagging, 'B unaffected');
check(b.conn.msgs.some(m => m.t === 'lag' && m.id === a.id && m.on), 'lag:on broadcast to others');
g.damagePlayer(a, 10, fakeZombie); check(a.hp === a.maxHp, 'zombie damage ignored while lagging');
g.damagePlayer(a, 5, null); check(a.hp === a.maxHp - 5, 'non-zombie damage (explosives) still applies');
a.hp = a.maxHp;
// A's backlog arrives: it walked 9 m during the stall - must be accepted, not corrected
const before = a.conn.msgs.filter(m => m.t === 'correct').length;
input(a, a.x + 9, a.z);
check(a.conn.msgs.filter(m => m.t === 'correct').length === before, 'first input after the stall is accepted unclamped');
steps(2, () => input(a, a.x, a.z));
check(!a.lagging, 'lagging cleared once input resumes');
const off = b.conn.msgs.find(m => m.t === 'lag' && m.id === a.id && !m.on);
check(off && off.dur >= 1.4 && off.dur <= 2.2, `lag:off carries the stall duration (${off && off.dur}s)`);
g.damagePlayer(a, 10, fakeZombie); check(a.hp === a.maxHp - 10, 'damage applies again');
a.hp = a.maxHp;
// protection is capped: an AFK/hidden tab is vulnerable again after LAG_PROTECT_MAX
steps(Math.ceil((LAG_PROTECT_MAX + 1) / (1 / 30)), () => input(b, b.x, b.z));
check(!a.lagging, `protection expires after ${LAG_PROTECT_MAX}s`);
g.damagePlayer(a, 10, fakeZombie); check(a.hp === a.maxHp - 10, 'damage applies after expiry');
a.hp = a.maxHp; steps(2, () => input(a, a.x, a.z));

console.log('snapshot backpressure');
a.conn.snaps = 0; b.conn.snaps = 0;
steps(30, () => { input(a, a.x, a.z); input(b, b.x, b.z); });
check(a.conn.snaps === 30 && b.conn.snaps === 30, 'both clients receive every snapshot normally');
a.conn.bufferedAmount = 20000; a.conn.snaps = 0; b.conn.snaps = 0; a.conn.msgs.length = 0;
steps(30, () => { input(a, a.x, a.z); input(b, b.x, b.z); });
check(a.conn.snaps === 0 && b.conn.snaps === 30, 'snapshots skipped for the backed-up socket only');
g.broadcast({ t: 'ping-test' });
check(a.conn.msgs.some(m => m.t === 'ping-test'), 'JSON events still delivered to the backed-up socket');
a.conn.bufferedAmount = 0; a.conn.snaps = 0;
steps(5, () => { input(a, a.x, a.z); input(b, b.x, b.z); });
check(a.conn.snaps === 5, 'snapshots resume once the socket drains');
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
