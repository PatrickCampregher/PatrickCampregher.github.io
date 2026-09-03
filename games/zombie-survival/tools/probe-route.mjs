#!/usr/bin/env node
// Deterministic zombie route probe (no browser): places one bot at a position, force-spawns ONE zombie at a
// given entry (all doors open) and logs the zombie's position / nav layer every second until it attacks.
// Complements the stochastic high-ground scenario of test-sim.js: proves that a concrete route (e.g. parking
// lot -> fire escape -> garage roof) is physically walkable for the server-side zombie physics.
//
// Usage: node tools/probe-route.mjs [entryId=lot_mh] [botX,botZ,botY=33.25,-26.75,5.2] [seconds=60]
import { GameServer } from '../server/game/gameServer.js';
import { TICK_MS } from '../shared/constants.js';
import { encodeInput, IN } from '../shared/protocol.js';
import { ZSTATE } from '../shared/zombies.js';

const entryId = process.argv[2] || 'lot_mh';
const botPos = (process.argv[3] || '33.25,-26.75,5.2').split(',').map(Number);
const seconds = parseFloat(process.argv[4] || '60');

class FakeConn { constructor() { this.alive = true; } send() {} }
const fakeLobby = { lobby: { players: new Map([[1, { id: 1, name: 'Bot1', conn: new FakeConn(), inGame: false }]]) }, onGameEnded() {} };
const game = new GameServer(fakeLobby);
for (const id in game.world.doors) { game.world.doors[id].closed = false; game.nav.openDoor(id); for (const a of game.world.doors[id].areas) game.unlocked.add(a); }
game.fieldsDirty++;
game.start();
const p1 = game.players.get(1);
p1.x = botPos[0]; p1.z = botPos[1]; p1.y = botPos[2]; p1.acceptAny = true; p1.ready = true; p1.god = true; // the bot must survive: success = the forced zombie reaches its ATTACK state
const entry = game.world.entries[entryId];
if (!entry) { console.error('unknown entry', entryId, 'known:', Object.keys(game.world.entries).join(' ')); process.exit(2); }
const z = game.zombies.spawn(entry, 1);
const botCell = game.nav.cellAt(p1.x, p1.y, p1.z);
console.log(`bot at ${botPos.join(',')} (layer ${game.nav.layerOf(botCell)}); zombie type ${z.type.id} speed ${z.type.speed} from ${entryId} inside ${entry.inside.join(',')}`);
let seq = 0, t = 0, hits = 0, firstAttack = -1;
for (let k = 0; k < seconds * 1000 / TICK_MS; k++) {
  t += TICK_MS / 1000;
  seq++;
  game.handleBinary(p1.lp, encodeInput({ seq, x: p1.x, y: p1.y, z: p1.z, yaw: 0, pitch: 0, flags: IN.ONGROUND, slot: p1.slot, time: t * 1000 }));
  game.roundTotal = 0; game.spawned = 0; // keep the regular spawner off (the round start re-initialises these)
  game.step(TICK_MS / 1000);
  if (p1.hp < 100) hits++;
  if (z.state === ZSTATE.ATTACK && firstAttack < 0) firstAttack = t;
  if (k % 30 === 0) {
    const c = game.nav.cellAt(z.x, z.y, z.z);
    console.log(`t=${t.toFixed(0).padStart(2)}s z=(${z.x.toFixed(2)}, ${z.y.toFixed(2)}, ${z.z.toFixed(2)}) state=${z.state} layer=${c >= 0 ? game.nav.layerOf(c) : '-'} fieldDist=${Math.round(z.fieldDist)} target=${z.target} onGround=${z.onGround} stuck=${z.stuck} | bot hp=${p1.hp.toFixed(0)} state=${p1.state} at (${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}, ${p1.z.toFixed(2)})`);
  }
  if (!z.active) { console.log('zombie despawned (anti-stuck respawn) -> route problem'); break; }
  if (firstAttack > 0 && t - firstAttack > 3) break;
}
game.stop();
void hits;
console.log(firstAttack > 0 ? `ROUTE OK: the zombie reached the bot and attacked at ${firstAttack.toFixed(1)} s` : `ROUTE FAIL: no attack within ${seconds} s (zombie ended at ${z.x.toFixed(1)}, ${z.y.toFixed(2)}, ${z.z.toFixed(1)})`);
process.exit(firstAttack > 0 ? 0 : 1);
