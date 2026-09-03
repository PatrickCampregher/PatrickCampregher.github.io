#!/usr/bin/env node
// Headless verification tool: starts (or attaches to) a game server, opens the client in headless Chrome
// (real WebGL), starts a solo game, runs optional JS in the page, evaluates expressions and saves screenshots.
// Zero dependencies (Node >= 22 for the global WebSocket; uses the Chrome DevTools Protocol directly).
//
// Usage:
//   node tools/snap.mjs [--port 8080] [--serve] [--preset high] [--out tools/shots/name.png]
//                       [--js "dev.tele(0,0)"]... [--eval "dev.stats()"]... [--wait 800] [--frames 3]
//                       [--size 1280x720] [--no-game] [--timeout 180000] [--keep] [--gpu|--swiftshader]
//                       [--pos x,z[,y]] [--look yaw,pitch] [--god] [--weapon id] [--round n] [--points n]
//
//   --serve       spawn `node server/index.js --port <port> --no-browser --dev` for the run (killed afterwards)
//   --js          JS to run in the page after the game is running (may use await; repeatable, runs in order)
//   --eval        expression whose JSON result is printed (repeatable, runs after --js)
//   --out         screenshot path (png). Repeat --js/--out pairs are not supported: run the tool twice instead.
//   --no-game     only open the menu page (no solo game)
//   --keep        keep Chrome/server running after the run (for manual poking) - normally everything is killed
//
// Prints console errors/warnings from the page and the JSON results. Exit code 1 on failure.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { PRESETS } from '../client/js/settings/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------------- args ----------------
const args = process.argv.slice(2);
const opt = { port: 8080, serve: false, preset: null, out: null, js: [], evals: [], wait: 800, frames: 3, size: '1280x720', game: true, timeout: 180000, keep: false, gpu: 'auto', pos: null, look: null, god: false, weapon: null, round: 0, points: 0, verbose: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i], v = () => args[++i];
  switch (a) {
    case '--port': opt.port = parseInt(v(), 10); break;
    case '--serve': opt.serve = true; break;
    case '--preset': opt.preset = v(); break;
    case '--out': opt.out = v(); break;
    case '--js': opt.js.push(v()); break;
    case '--eval': opt.evals.push(v()); break;
    case '--wait': opt.wait = parseInt(v(), 10); break;
    case '--frames': opt.frames = parseInt(v(), 10); break;
    case '--size': opt.size = v(); break;
    case '--no-game': opt.game = false; break;
    case '--timeout': opt.timeout = parseInt(v(), 10); break;
    case '--keep': opt.keep = true; break;
    case '--gpu': opt.gpu = 'gpu'; break;
    case '--swiftshader': opt.gpu = 'swiftshader'; break;
    case '--pos': opt.pos = v().split(',').map(Number); break;
    case '--look': opt.look = v().split(',').map(Number); break;
    case '--god': opt.god = true; break;
    case '--weapon': opt.weapon = v(); break;
    case '--round': opt.round = parseInt(v(), 10); break;
    case '--points': opt.points = parseInt(v(), 10); break;
    case '--verbose': opt.verbose = true; break;
    case '--help': case '-h': console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).join('\n')); process.exit(0);
    default: console.error('unknown arg', a); process.exit(2);
  }
}
const [W, H] = opt.size.split('x').map(n => parseInt(n, 10));
const log = (...m) => console.log('[snap]', ...m);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function findChrome() {
  const cands = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error('Chrome/Edge not found; set CHROME_PATH');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}
function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const s = net.connect(port, host);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    setTimeout(() => { s.destroy(); resolve(false); }, 800);
  });
}

// ---------------- CDP client ----------------
class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.listeners = new Map(); }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', (e) => reject(new Error('CDP ws error ' + (e.message || ''))));
      ws.addEventListener('message', (ev) => {
        const m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
        if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); if (m.error) rej(new Error(m.error.message)); else res(m.result); }
        else if (m.method) { const ls = this.listeners.get(m.method); if (ls) for (const l of ls) l(m.params); }
      });
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  on(method, fn) { let ls = this.listeners.get(method); if (!ls) { ls = []; this.listeners.set(method, ls); } ls.push(fn); }
  close() { try { this.ws.close(); } catch (e) { /* ignore */ } }
}

async function evaluate(cdp, expression, { awaitPromise = true, returnByValue = true } = {}) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue, userGesture: true });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error('page exception: ' + (d.exception && (d.exception.description || d.exception.value) || d.text));
  }
  return r.result ? r.result.value : undefined;
}

async function waitFor(cdp, expression, timeout, label) {
  const t0 = Date.now();
  let lastErr = null;
  while (Date.now() - t0 < timeout) {
    try { const v = await evaluate(cdp, expression); if (v) return v; }
    catch (e) { lastErr = e; }
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}` + (lastErr ? ` (last error: ${lastErr.message})` : ''));
}

// ---------------- main ----------------
let server = null, chrome = null, profileDir = null;
function cleanup() {
  if (opt.keep) return;
  if (chrome) { try { chrome.kill(); } catch (e) { /* ignore */ } chrome = null; }
  if (server) { try { server.kill(); } catch (e) { /* ignore */ } server = null; }
  if (profileDir) setTimeout(() => { try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) { /* ignore */ } }, 500);
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

async function main() {
  // 1) server
  if (opt.serve) {
    if (await portOpen(opt.port)) log(`port ${opt.port} already in use - attaching to the running server instead of spawning`);
    else {
      server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js'), '--port', String(opt.port), '--no-browser', '--dev'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      server.stdout.on('data', (d) => { if (opt.verbose) process.stdout.write('[server] ' + d); });
      server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
      const t0 = Date.now();
      while (!(await portOpen(opt.port))) { if (Date.now() - t0 > 15000) throw new Error('server did not start'); await sleep(200); }
      log(`server started on ${opt.port} (pid ${server.pid})`);
    }
  } else if (!(await portOpen(opt.port))) throw new Error(`no server on port ${opt.port} (use --serve to spawn one)`);

  // 2) chrome
  const exe = findChrome();
  const dbg = await freePort();
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zs-snap-'));
  const gpuFlags = opt.gpu === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : opt.gpu === 'gpu' ? ['--use-angle=default', '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'];
  const flags = ['--headless=new', `--remote-debugging-port=${dbg}`, `--user-data-dir=${profileDir}`, `--window-size=${W},${H}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--hide-scrollbars', '--force-device-scale-factor=1',
    ...gpuFlags, 'about:blank'];
  chrome = spawn(exe, flags, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  chrome.stderr.on('data', (d) => { if (opt.verbose) process.stderr.write('[chrome] ' + d); });
  // wait for the debugger endpoint
  let targets = null;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${dbg}/json`); targets = await r.json(); if (targets.length) break; } catch (e) { /* not yet */ }
    await sleep(150);
  }
  if (!targets || !targets.length) throw new Error('chrome debugger not reachable');
  const page = targets.find(t => t.type === 'page') || targets[0];
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
  const consoleLines = [];
  cdp.on('Runtime.consoleAPICalled', (p) => {
    const text = p.args.map(a => a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : (a.description || a.type)).join(' ');
    consoleLines.push(`${p.type}: ${text}`);
    if (p.type === 'error' || p.type === 'warning' || opt.verbose) console.log(`[page:${p.type}] ${text.slice(0, 600)}`);
  });
  cdp.on('Runtime.exceptionThrown', (p) => { const d = p.exceptionDetails; const msg = (d.exception && (d.exception.description || d.exception.value)) || d.text; consoleLines.push('exception: ' + msg); console.log('[page:EXCEPTION] ' + String(msg).slice(0, 1200)); });
  cdp.on('Log.entryAdded', (p) => { if (p.entry.level === 'error') console.log('[page:log-error] ' + p.entry.text.slice(0, 400)); });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  const url = `http://127.0.0.1:${opt.port}/`;
  // settings preset via localStorage (read at module load) -> set on a first visit, then reload
  if (opt.preset) {
    await cdp.send('Page.navigate', { url });
    await waitFor(cdp, 'document.readyState === "complete"', 20000, 'page load');
    await evaluate(cdp, `localStorage.setItem('zombie-survival.settings.v1', JSON.stringify({ graphics: { preset: ${JSON.stringify(opt.preset)}, ...(${JSON.stringify(presetFor(opt.preset))}), showFps: true }, player: { name: 'Snap' } }))`);
  }
  await cdp.send('Page.navigate', { url });
  await waitFor(cdp, 'typeof window.app === "object" && !!window.app', 30000, 'app');
  log('client loaded');
  // WebGL sanity
  const glInfo = await evaluate(cdp, `(() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return 'NO WEBGL'; const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'webgl ok'; })()`);
  log('renderer:', glInfo);
  if (String(glInfo).includes('NO WEBGL')) throw new Error('WebGL unavailable in headless Chrome (try --swiftshader)');

  if (opt.game) {
    await waitFor(cdp, 'window.app.local && window.app.local.open', 15000, 'local server connection');
    await evaluate(cdp, 'window.app.playSolo()', { awaitPromise: false });
    await waitFor(cdp, 'window.app.game && window.app.game.running', opt.timeout, 'game running');
    log('game running');
    await evaluate(cdp, 'window.dev.lock(true)');
    if (opt.god) await evaluate(cdp, 'window.dev.cheat({ god: true })');
    if (opt.points) await evaluate(cdp, `window.dev.cheat({ points: ${opt.points} })`);
    if (opt.weapon) await evaluate(cdp, `window.dev.cheat({ weapon: ${JSON.stringify(opt.weapon)} })`);
    if (opt.round) await evaluate(cdp, `window.dev.cheat({ round: ${opt.round} })`);
    if (opt.pos) await evaluate(cdp, `window.dev.tele(${opt.pos[0]}, ${opt.pos[1]}, ${opt.pos[2] || 0})`);
    if (opt.look) await evaluate(cdp, `(() => { const p = window.app.game.player; p.yaw = ${opt.look[0]}; p.pitch = ${opt.look[1] || 0}; })()`);
    await sleep(300);
  }
  for (const js of opt.js) {
    const r = await evaluate(cdp, `(async () => { ${js.includes('return ') || js.includes(';') ? js : 'return (' + js + ')'} })()`);
    if (r !== undefined) console.log('[js]', typeof r === 'string' ? r : JSON.stringify(r));
  }
  if (opt.wait > 0) await sleep(opt.wait);
  if (opt.game && opt.frames > 0) await evaluate(cdp, `(() => { const g = window.app.game; for (let i = 0; i < ${opt.frames}; i++) g._frame(); return true; })()`);
  for (const ex of opt.evals) {
    try { const r = await evaluate(cdp, `(async () => (${ex}))()`); console.log('[eval]', JSON.stringify(r)); }
    catch (e) { console.log('[eval-error]', e.message); }
  }
  if (opt.out) {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const outPath = path.resolve(process.cwd(), opt.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
    log('screenshot saved', outPath);
  }
  const errors = consoleLines.filter(l => l.startsWith('error') || l.startsWith('exception'));
  log(`done. page errors: ${errors.length}`);
  cdp.close();
  if (opt.keep) log(`--keep: chrome debug port ${dbg}, server port ${opt.port} left running`);
  return errors.length ? 1 : 0;
}

function presetFor(name) {
  return PRESETS[name] || PRESETS.high;
}

main().then((code) => { cleanup(); setTimeout(() => process.exit(code), 600); }).catch((e) => { console.error('[snap] FAILED:', e.message); cleanup(); setTimeout(() => process.exit(1), 600); });
