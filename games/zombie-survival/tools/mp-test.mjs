#!/usr/bin/env node
// Two-client multiplayer verification: spawns a dev server, launches two headless Chrome clients (real WebGL),
// hosts a lobby with client A, joins with client B via direct connect, starts the game and checks that both
// clients see each other, share zombies/rounds/doors/points, and that shots from A register hits visible to B.
// Usage: node tools/mp-test.mjs [--port 8130] [--out tools/shots/mp] [--timeout 240000]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const argVal = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const PORT = parseInt(argVal('--port', '8130'), 10);
const OUT = argVal('--out', 'tools/shots/mp');
const TIMEOUT = parseInt(argVal('--timeout', '240000'), 10);
const log = (...m) => console.log('[mp]', ...m);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function findChrome() {
  const c = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'), 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  for (const p of c) if (fs.existsSync(p)) return p;
  throw new Error('Chrome not found');
}
function freePort() { return new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); }); }
function portOpen(port) { return new Promise((res) => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); setTimeout(() => { s.destroy(); res(false); }, 800); }); }

class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.listeners = new Map(); }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url); this.ws = ws;
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('cdp ws error')));
      ws.addEventListener('message', (ev) => {
        const m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
        if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); if (m.error) rej(new Error(m.error.message)); else res(m.result); }
        else if (m.method) { const ls = this.listeners.get(m.method); if (ls) for (const l of ls) l(m.params); }
      });
    });
  }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  on(method, fn) { let ls = this.listeners.get(method); if (!ls) { ls = []; this.listeners.set(method, ls); } ls.push(fn); }
  close() { try { this.ws.close(); } catch (e) { /* ignore */ } }
}

const procs = [], dirs = [];
function cleanup() { for (const p of procs) { try { p.kill(); } catch (e) { /* ignore */ } } for (const d of dirs) setTimeout(() => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* ignore */ } }, 500); }
process.on('exit', cleanup);

async function launchClient(name) {
  const dbg = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zs-mp-')); dirs.push(dir);
  const chrome = spawn(findChrome(), ['--headless=new', `--remote-debugging-port=${dbg}`, `--user-data-dir=${dir}`, '--window-size=1280,720', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--hide-scrollbars', '--force-device-scale-factor=1', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  procs.push(chrome);
  let targets = null;
  for (let i = 0; i < 100; i++) { try { const r = await fetch(`http://127.0.0.1:${dbg}/json`); targets = await r.json(); if (targets.length) break; } catch (e) { /* wait */ } await sleep(150); }
  const page = targets.find(t => t.type === 'page') || targets[0];
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  const errors = [];
  cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') { const t = p.args.map(a => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' '); errors.push(t); console.log(`[${name}:error] ${t.slice(0, 500)}`); } });
  cdp.on('Runtime.exceptionThrown', (p) => { const d = p.exceptionDetails; const msg = (d.exception && (d.exception.description || d.exception.value)) || d.text; errors.push(String(msg)); console.log(`[${name}:EXCEPTION] ${String(msg).slice(0, 800)}`); });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  const c = {
    name, cdp, errors,
    async eval(expr, awaitPromise = true) {
      // wrap so that non-serializable results (Babylon objects) never break the CDP round trip
      const wrapped = `(async () => { const __r = await (${expr}); try { JSON.stringify(__r); return __r; } catch (e) { return '[unserializable]'; } })()`;
      const r = await cdp.send('Runtime.evaluate', { expression: wrapped, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw new Error(`${name}: ` + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
      return r.result ? r.result.value : undefined;
    },
    async waitFor(expr, timeout, label) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) { try { if (await c.eval(expr)) return true; } catch (e) { /* retry */ } await sleep(250); }
      throw new Error(`${name}: timeout waiting for ${label}`);
    },
    async shot(file) { const s = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(s.data, 'base64')); log(`${name}: screenshot ${file}`); },
  };
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await c.waitFor('typeof window.app === "object" && !!window.app && window.app.local && window.app.local.open', 30000, 'app + local connection');
  await c.eval(`localStorage.setItem('zombie-survival.settings.v1', JSON.stringify({ player: { name: ${JSON.stringify(name)} }, graphics: { showFps: true } }))`);
  return c;
}

async function main() {
  let fails = 0;
  const check = (cond, msg) => { if (cond) log('OK  ', msg); else { fails++; log('FAIL', msg); } };
  if (!(await portOpen(PORT))) {
    const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js'), '--port', String(PORT), '--no-browser', '--dev'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
    procs.push(server);
    const t0 = Date.now();
    while (!(await portOpen(PORT))) { if (Date.now() - t0 > 15000) throw new Error('server did not start'); await sleep(200); }
    log('server on', PORT);
  }
  const A = await launchClient('Alpha');
  const B = await launchClient('Bravo');
  // host + join
  await A.eval(`window.app.hostGame({ name: 'MPTest', maxPlayers: 4, playerName: 'Alpha', isPublic: false })`, false);
  await A.waitFor('window.app.lobby && window.app.lobby.players.length >= 1', 15000, 'lobby created');
  await B.eval(`window.app.directConnect('127.0.0.1:${PORT}', 'Bravo')`, false);
  await B.waitFor('window.app.lobby && window.app.lobby.players.length >= 2', 20000, 'joined lobby');
  await A.waitFor('window.app.lobby && window.app.lobby.players.length >= 2', 10000, 'host sees 2 players');
  const lobbyA = await A.eval('window.app.lobby.players.map(p => p.name)');
  check(lobbyA.length === 2 && lobbyA.includes('Alpha') && lobbyA.includes('Bravo'), `lobby has both players: ${JSON.stringify(lobbyA)}`);
  await B.eval('window.app.toggleReady()');
  await A.eval('window.app.startGame()');
  await Promise.all([A.waitFor('window.app.game && window.app.game.running', TIMEOUT, 'game running'), B.waitFor('window.app.game && window.app.game.running', TIMEOUT, 'game running')]);
  log('both clients in game');
  for (const c of [A, B]) { await c.eval('window.dev.lock(true)'); await c.eval('window.dev.cheat({ god: true, points: 5000 })'); }
  await A.eval('window.dev.cheat({ round: 5 })');
  await A.eval('window.dev.tele(-2, 0, 0)');
  await B.eval('window.dev.tele(2.5, -2.5, 0)');
  await A.eval('window.dev.aimAt(2.5, 1.4, -2.5)');
  await B.eval('window.dev.aimAt(-2, 1.4, 0)');
  await sleep(9000);
  // visibility of each other
  const seenByA = await A.eval('[...window.app.game.entities.players.values()].map(e => ({ name: e.name, x: +e.x.toFixed(1), z: +e.z.toFixed(1) }))');
  const seenByB = await B.eval('[...window.app.game.entities.players.values()].map(e => ({ name: e.name, x: +e.x.toFixed(1), z: +e.z.toFixed(1) }))');
  check(seenByA.length === 1 && seenByA[0].name === 'Bravo' && Math.abs(seenByA[0].x - 2.5) < 0.6 && Math.abs(seenByA[0].z + 2.5) < 0.6, `A sees B at the right place: ${JSON.stringify(seenByA)}`);
  check(seenByB.length === 1 && seenByB[0].name === 'Alpha' && Math.abs(seenByB[0].x + 2) < 0.6 && Math.abs(seenByB[0].z) < 0.6, `B sees A at the right place: ${JSON.stringify(seenByB)}`);
  const rA = await A.eval('({ round: window.app.game.round, z: window.app.game.entities.zombies.size })');
  const rB = await B.eval('({ round: window.app.game.round, z: window.app.game.entities.zombies.size })');
  check(rA.round === rB.round && rA.round >= 5, `same round on both: ${JSON.stringify(rA)} / ${JSON.stringify(rB)}`);
  check(rA.z > 0 && Math.abs(rA.z - rB.z) <= 2, `zombies visible on both (${rA.z} / ${rB.z})`);
  // shots from A register hits that B hears about (scores + hit markers)
  const scoreOf = (who) => `(() => { const g = window.app.game; const id = Object.keys(g.names).find(k => g.names[k] === ${JSON.stringify(who)}); return (g.scores[id] || 0); })()`;
  const ptsBefore = await B.eval(scoreOf('Alpha'));
  await A.eval('window.dev.cheat({ weapon: "kestrel_ar" })');
  await sleep(500);
  for (let i = 0; i < 6; i++) { await A.eval('void window.dev.aimZombie(0)'); await A.eval('window.dev.fire(250)'); await sleep(350); }
  await sleep(1500);
  const ptsAfter = await B.eval(scoreOf('Alpha'));
  check(ptsAfter > ptsBefore, `B sees A's points rise after shooting (${ptsBefore} -> ${ptsAfter})`);
  // door purchase propagates
  const doorId = await A.eval('Object.keys(window.app.game.world.doors).find(id => window.app.game.world.doors[id].closed && window.app.game.world.doors[id].areas.includes("street"))');
  if (doorId) {
    await A.eval(`(() => { const d = window.app.game.world.doors[${JSON.stringify(doorId)}]; window.dev.tele(d.box.cx + 0.1, d.box.cz - 1.5, 0); })()`);
    await sleep(400);
    await A.eval(`window.app.game.conn.send({ t: 'interact', target: 'door:' + ${JSON.stringify(doorId)} })`);
    await sleep(1200);
    const closedB = await B.eval(`window.app.game.world.doors[${JSON.stringify(doorId)}].closed`);
    check(closedB === false, `door ${doorId} bought by A is open on B`);
  }
  // perk purchase visible in B's HUD scores/feeds? (server-side only) -> check A's self perks
  await A.eval('window.dev.cheat({ perk: "jugg" })');
  await sleep(800);
  const perksA = await A.eval('window.app.game.player.perks');
  check(Array.isArray(perksA) && perksA.includes('jugg'), `perk cheat applied on A: ${JSON.stringify(perksA)}`);
  // screenshots: B looking at A
  await B.eval('window.dev.aimAt(-2, 1.2, 0)');
  await B.eval('(() => { const g = window.app.game; for (let i = 0; i < 3; i++) g._frame(); })()');
  await B.shot(path.resolve(process.cwd(), OUT + '_B_sees_A.png'));
  await A.shot(path.resolve(process.cwd(), OUT + '_A_view.png'));
  check(A.errors.length === 0, `no page errors on A (${A.errors.length})`);
  check(B.errors.length === 0, `no page errors on B (${B.errors.length})`);
  // leave: B disconnects, A must keep running
  await B.eval('window.app.leaveGame()');
  await sleep(1500);
  const aStill = await A.eval('window.app.game && window.app.game.running && [...window.app.game.entities.players.values()].length');
  check(aStill === 0, `after B leaves, A keeps running with 0 remote players (${JSON.stringify(aStill)})`);
  A.cdp.close(); B.cdp.close();
  log(fails ? `MP TEST: ${fails} check(s) FAILED` : 'MP TEST: all checks passed');
  return fails ? 1 : 0;
}

main().then((code) => { cleanup(); setTimeout(() => process.exit(code), 800); }).catch((e) => { console.error('[mp] FAILED:', e.message); cleanup(); setTimeout(() => process.exit(1), 800); });
