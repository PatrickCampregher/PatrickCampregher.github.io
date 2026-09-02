// Headless simulation test: runs the authoritative server with fake players, no browser needed.
// Usage: node tools/test-sim.js [seconds] [players]
import { GameServer } from '../server/game/gameServer.js';
import { MAP } from '../shared/mapdata.js';
import { PSTATE, RSTATE, TICK_MS } from '../shared/constants.js';
import { ZSTATE } from '../shared/zombies.js';
import { encodeInput, decodeSnapshot, BIN, IN } from '../shared/protocol.js';
import { WEAPONS } from '../shared/weapons.js';

const seconds = parseFloat(process.argv[2] || '60');
const nPlayers = parseInt(process.argv[3] || '2', 10);

class FakeConn {
  constructor(name) { this.name = name; this.alive = true; this.msgs = []; this.bin = 0; this.lastSnap = null; this.events = {}; }
  send(d) {
    if (typeof d === 'string') { const m = JSON.parse(d); this.msgs.push(m); this.events[m.t] = (this.events[m.t] || 0) + 1; if (m.t === 'self') this.self = m; }
    else { this.bin++; const dv = new DataView(d.buffer, d.byteOffset, d.byteLength); if (dv.getUint8(0) === BIN.SNAPSHOT) this.lastSnap = decodeSnapshot(dv, 1); }
  }
}

const fakeLobby = { lobby: { players: new Map() }, onGameEnded() { console.log('game ended -> lobby'); } };
for (let i = 1; i <= nPlayers; i++) fakeLobby.lobby.players.set(i, { id: i, name: 'Bot' + i, conn: new FakeConn('Bot' + i), inGame: false });

const game = new GameServer(fakeLobby);
console.log(`nav grid ${game.nav.w}x${game.nav.h}, walkable cells: ${game.nav.walk.reduce((a, b) => a + (b ? 1 : 0), 0)}, boxes: ${game.world.boxes.length}`);
// sanity: every entry inside position must be walkable
let bad = 0;
for (const id in game.world.entries) {
  const e = game.world.entries[id];
  if (!game.nav.isWalkable(e.inside[0], e.inside[2])) { console.log('  entry inside NOT walkable:', id, e.inside); bad++; }
  if (e.type !== 'manhole' && game.nav.isWalkable(e.outside[0], e.outside[2])) { console.log('  entry OUTSIDE is walkable (leak?):', id, e.outside); bad++; }
}
for (const b of game.world.boxLocations) if (!game.nav.isWalkable(b.x, b.z)) { console.log('  box location not walkable', b); bad++; }
for (const s of game.world.playerSpawns) if (!game.nav.isWalkable(s.x, s.z)) { console.log('  player spawn not walkable', s); bad++; }
// reachability from start to every area via doors once opened
{
  const dist = new Uint16Array(game.nav.n);
  for (const id in game.world.doors) { game.world.doors[id].closed = false; game.nav.openDoor(id); }
  game.nav.computeField([game.nav.cellOf(0, 0)], dist);
  for (const id in game.world.entries) {
    const e = game.world.entries[id];
    const c = game.nav.cellOf(e.inside[0], e.inside[2]);
    if (dist[c] === 65535) { console.log('  entry unreachable from start (all doors open):', id); bad++; }
  }
  for (const id in game.world.doors) { game.world.doors[id].closed = true; }
  // rebuild nav to restore closed doors
  const { NavGrid } = await import('../shared/nav.js');
  game.nav = new NavGrid(MAP, game.world.boxes);
  const dist2 = new Uint16Array(game.nav.n);
  game.nav.computeField([game.nav.cellOf(0, 0)], dist2);
  let reachable = 0; for (let i = 0; i < dist2.length; i++) if (dist2[i] !== 65535) reachable++;
  console.log(`  start-area reachable cells (doors closed): ${reachable}`);
  for (const id in game.world.entries) {
    const e = game.world.entries[id];
    const c = game.nav.cellOf(e.inside[0], e.inside[2]);
    const reach = dist2[c] !== 65535;
    if (e.area === 'street' && !reach) { console.log('  street entry unreachable with doors closed:', id); bad++; }
    if (e.area !== 'street' && reach) { console.log('  non-street entry reachable with doors closed (door leak?):', id); bad++; }
  }
}
console.log(bad ? `MAP CHECK: ${bad} problem(s)` : 'MAP CHECK: ok');

game.start();
let seq = 0;
let t = 0;
const ticks = Math.round(seconds * 1000 / TICK_MS);
let shots = 0, kills = 0, maxAlive = 0;
const t0 = performance.now();
let simMs = 0;
for (let k = 0; k < ticks; k++) {
  t += TICK_MS / 1000;
  // bots: stand still, aim at the nearest zombie and shoot every 0.15s
  for (const p of game.players.values()) {
    if (p.state !== PSTATE.ALIVE) continue;
    seq++;
    const inp = { seq, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: 0, flags: IN.ONGROUND, slot: p.slot, time: t * 1000 };
    game.handleBinary(p.lp, encodeInput(inp));
    if (k % 5 === 0) {
      let best = null, bd = 1e9;
      for (const z of game.zombies.active) {
        if (z.state === ZSTATE.HIDDEN) continue;
        const d = Math.hypot(z.x - p.x, z.z - p.z);
        if (d < bd) { bd = d; best = z; }
      }
      if (best && bd < 30) {
        const ox = p.x, oy = p.y + 1.62, oz = p.z;
        const tx = best.x, ty = best.y + 1.5, tz = best.z;
        const dx = tx - ox, dy = ty - oy, dz = tz - oz;
        const l = Math.hypot(dx, dy, dz);
        p.yaw = Math.atan2(dx, dz);
        const held = p.weapons[p.slot];
        if (held.mag === 0) game.handleMessage(p.lp, { t: 'reload' });
        else {
          game.handleMessage(p.lp, { t: 'shoot', w: WEAPONS[held.id].index, o: [ox, oy, oz], d: [dx / l, dy / l, dz / l], s: 0.3, seed: k, rt: game.time * 1000 - 60 });
          shots++;
        }
      }
    }
  }
  const s0 = performance.now();
  game.step(TICK_MS / 1000);
  simMs += performance.now() - s0;
  maxAlive = Math.max(maxAlive, game.zombies.active.length);
  if (k % Math.round(5000 / TICK_MS) === 0) {
    const p1 = game.players.get(1);
    console.log(`t=${t.toFixed(0)}s round=${game.round} rstate=${game.roundState} spawned=${game.spawned}/${game.roundTotal} alive=${game.zombies.active.length} killed=${game.killedThisRound} p1 hp=${Math.round(p1.hp)} pts=${p1.points} state=${p1.state} mag=${p1.weapons[p1.slot].mag}/${p1.weapons[p1.slot].reserve}`);
  }
  if (game.gameOver) { console.log('GAME OVER at round', game.round); break; }
}
game.stop();
const c1 = fakeLobby.lobby.players.get(1).conn;
console.log(`shots=${shots} events: ${JSON.stringify(c1.events)}`);
console.log(`sim time per tick: ${(simMs / ticks).toFixed(3)} ms (max alive ${maxAlive}); wall ${(performance.now() - t0).toFixed(0)} ms`);
if (c1.lastSnap) console.log('last snapshot: players', c1.lastSnap.players.length, 'zombies', c1.lastSnap.zombies.length, 'round', c1.lastSnap.round);
process.exit(0);
