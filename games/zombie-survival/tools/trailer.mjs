#!/usr/bin/env node
// Renders the game trailer: a scripted shot list captured frame-by-frame from the real client in headless Chrome
// (server and client stepped in lockstep on a fake clock, so the output is a smooth 30 fps regardless of render
// speed), a soundtrack rendered offline from the game's own synthesized sounds + a small synth score, and an
// H.264 MP4 encode with ffmpeg.
//
// Usage: node tools/trailer.mjs [--port 8140] [--size 1920x1080] [--fps 30] [--out tools/trailer]
//                               [--only opening,balcony,...] [--ffmpeg C:\ffmpeg\bin\ffmpeg.exe] [--quality 92]
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const argVal = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const PORT = parseInt(argVal('--port', '8140'), 10);
const [W, H] = argVal('--size', '1920x1080').split('x').map(n => parseInt(n, 10));
const FPS = parseInt(argVal('--fps', '30'), 10);
const OUT = path.resolve(process.cwd(), argVal('--out', 'tools/trailer'));
const ONLY = argVal('--only', '') ? argVal('--only', '').split(',') : null;
const QUALITY = parseInt(argVal('--quality', '92'), 10);
const FFMPEG = argVal('--ffmpeg', ['C:\\ffmpeg\\bin\\ffmpeg.exe', 'ffmpeg'].find(p => p === 'ffmpeg' || fs.existsSync(p)));
const log = (...m) => console.log('[trailer]', ...m);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DT = 1 / FPS;

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

// ---------------- camera helpers ----------------
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;
/** Camera keyframe interpolation: keys = [[time, {x,y,z,yaw,pitch,fov}], ...] (times relative to the shot). */
function camAt(keys, lt) {
  if (lt <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i], [t1, b] = keys[i + 1];
    if (lt >= t0 && lt <= t1) {
      const k = smooth((lt - t0) / Math.max(1e-6, t1 - t0));
      const o = {};
      for (const key of ['x', 'y', 'z', 'yaw', 'pitch', 'fov', 'roll']) { const av = a[key] ?? (key === 'fov' ? 80 : 0), bv = b[key] ?? (key === 'fov' ? 80 : 0); o[key] = lerp(av, bv, k); }
      return o;
    }
  }
  return keys[keys.length - 1][1];
}
const fadeIn = (lt, t0, t1) => smooth((lt - t0) / Math.max(1e-6, t1 - t0));
const window01 = (lt, a, b, c, d) => (lt < a || lt > d) ? 0 : lt < b ? smooth((lt - a) / (b - a)) : lt > c ? 1 - smooth((lt - c) / (d - c)) : 1;

// ---------------- shot list ----------------
// Each shot: id, dur, setup (page JS run once before the shot, may include a preroll of server-only ticks),
// frame(lt) -> page JS string executed before stepping the frame, audio(events, t0) -> soundtrack events.
const PRE = (seconds) => `for (let i = 0; i < ${Math.round(seconds * FPS)}; i++) dev.cheat({ step: ${DT} });`;
const cam = (keys, lt) => `__cine.setCam(${JSON.stringify(camAt(keys, lt))});`;
const title = (main, sub, k, mode = 'lower', red = false) => `__cine.title(${JSON.stringify(main)}, ${JSON.stringify(sub)}, ${k.toFixed(3)}, ${JSON.stringify(mode)}, ${red});`;

const SHOTS = [
  { id: 'opening', dur: 6.5,
    setup: `dev.cheat({ round: 4 }); dev.tele(-4, 0.5, 0); dev.cheat({ tp: [-4, 0.5, 0] }); ${PRE(11)}`,
    frame: (lt) => cam([[0, { x: -21, y: 2.7, z: 2.6, yaw: 1.42, pitch: 0.05, fov: 72 }], [6.5, { x: -8.5, y: 2.2, z: 1.1, yaw: 1.5, pitch: 0.03, fov: 72 }]], lt)
      + `__cine.bars(1); __cine.fade(${(1 - fadeIn(lt, 0, 1.4)).toFixed(3)});` + title('Ashford Street', 'a LAN co-op zombie survival', window01(lt, 1.6, 2.4, 5.2, 6.2)),
    audio: (ev, t0) => { ev.push({ k: 'boom', t: t0 + 1.6, v: 0.9 }); } },
  { id: 'balcony', dur: 5.5,
    setup: `dev.cheat({ round: 7 }); dev.tele(-15, 3, 0); dev.cheat({ tp: [-15, 3, 0] }); ${PRE(9)}`,
    frame: (lt) => cam([[0, { x: -19.5, y: 5.4, z: 7.5, yaw: 2.8, pitch: 0.3, fov: 70 }], [5.5, { x: -13.5, y: 5.3, z: 7.3, yaw: 3.3, pitch: 0.26, fov: 70 }]], lt) + `__cine.bars(1); __cine.fade(0);` + title('', '', 0) },
  { id: 'ads', dur: 6,
    setup: `__cine.clearCam(); dev.cheat({ round: 8 }); dev.tele(-3, -2, 0); dev.cheat({ tp: [-3, -2, 0] }); dev.cheat({ weapon: 'nightjar_mp' }); app.game.player.yaw = -1.57; app.game.player.pitch = 0.02; ${PRE(6.5)}`,
    frame: (lt) => `__cine.clearCam(); __cine.bars(0.55); __cine.fade(0); __cine.title('', '', 0); __cine.aimZombie(1, 0.3); ${lt > 0.4 ? "__cine.hold('Mouse2', true);" : ''} ${[[1.2, 1.55], [2.4, 2.75], [3.6, 4.0], [4.8, 5.25]].some(([a, b]) => lt >= a && lt < b) ? "__cine.hold('Mouse0', true);" : "__cine.hold('Mouse0', false);"}` },
  { id: 'shotgun', dur: 4.5,
    setup: `__cine.clearCam(); __cine.hold('Mouse2', false); __cine.hold('Mouse0', false); dev.cheat({ weapon: 'twinbore' }); ${PRE(0.5)}`,
    frame: (lt) => `__cine.bars(0.55); __cine.aimZombie(0, 0.4); ${(lt >= 0.7 && lt < 0.78) || (lt >= 1.55 && lt < 1.63) ? "__cine.press('Mouse0');" : ''}`,
    audio: (ev, t0) => { ev.push({ k: 'play', n: 'break_open', t: t0 + 2.3, o: { vol: 0.6 } }, { k: 'play', n: 'shell_in', t: t0 + 2.9, o: { vol: 0.6 } }, { k: 'play', n: 'shell_in', t: t0 + 3.3, o: { vol: 0.6 } }, { k: 'play', n: 'break_close', t: t0 + 3.8, o: { vol: 0.6 } }); } },
  { id: 'perk', dur: 5.2,
    setup: `__cine.clearCam(); dev.cheat({ killAll: true }); dev.cheat({ points: 20000 }); dev.tele(-10, 6.3, 0); dev.cheat({ tp: [-10, 6.3, 0] }); app.game.player.yaw = 0; app.game.player.pitch = 0.04; ${PRE(0.6)}`,
    frame: (lt) => `__cine.bars(0.55); ${lt >= 0.6 && lt < 0.68 ? "__cine.press('KeyE');" : ''}` + title('4 Perk Machines', 'Juggernog · Quick Revive · Speed Cola · Double Tap', window01(lt, 2.3, 2.9, 4.6, 5.2)),
    audio: (ev, t0) => { ev.push({ k: 'play', n: 'perk_buy', t: t0 + 0.75, o: { vol: 0.8 } }, { k: 'play', n: 'jingle_revive', t: t0 + 0.9, o: { vol: 0.7 } }, { k: 'play', n: 'drink', t: t0 + 1.2, o: { vol: 0.7 } }, { k: 'play', n: 'announcer', t: t0 + 2.9, o: { vol: 0.55 } }, { k: 'boom', t: t0 + 2.3, v: 0.7 }); } },
  { id: 'jugg', dur: 2.6,
    setup: '',
    frame: (lt) => cam([[0, { x: 4, y: 1.55, z: 34.6, yaw: 0, pitch: 0.0, fov: 58 }], [2.6, { x: 4, y: 1.5, z: 36.4, yaw: 0, pitch: 0.0, fov: 55 }]], lt) + `__cine.bars(1);` + title('', '', 0) },
  { id: 'pap', dur: 9.2,
    setup: `__cine.clearCam(); dev.tele(36, 30.5, 0.4); dev.cheat({ tp: [36, 30.5, 0.4] }); dev.cheat({ weapon: 'kestrel_ar' }); app.game.player.yaw = 0; app.game.player.pitch = 0.03; ${PRE(0.6)}`,
    frame: (lt) => `__cine.clearCam(); __cine.bars(0.55); ${lt >= 0.7 && lt < 0.78 ? "__cine.press('KeyE');" : ''} ${lt >= 6.5 && lt < 6.58 ? "__cine.press('KeyE');" : ''} ${lt >= 7.2 ? "app.game.player.yaw = 0.35; app.game.player.pitch = -0.08;" : ''} ${(lt >= 7.4 && lt < 7.75) || (lt >= 8.1 && lt < 8.45) ? "__cine.hold('Mouse0', true);" : "__cine.hold('Mouse0', false);"}` + title('Pack-a-Punch', 'upgrade your weapon on the theatre stage', window01(lt, 2.2, 2.8, 5.2, 5.8)),
    audio: (ev, t0) => { ev.push({ k: 'play', n: 'pap_start', t: t0 + 0.8, o: { vol: 0.9 } }, { k: 'play', n: 'pap_spin', t: t0 + 1.2, o: { vol: 0.75, loopUntil: t0 + 6.0, fadeOut: 0.4 } }, { k: 'play', n: 'pap_zap', t: t0 + 2.0, o: { vol: 0.55 } }, { k: 'play', n: 'pap_zap', t: t0 + 3.4, o: { vol: 0.55 } }, { k: 'play', n: 'pap_zap', t: t0 + 4.9, o: { vol: 0.55 } }, { k: 'play', n: 'pap_done', t: t0 + 5.9, o: { vol: 0.9 } }, { k: 'play', n: 'weapon_pickup', t: t0 + 6.6, o: { vol: 0.8 } }, { k: 'boom', t: t0 + 2.2, v: 0.7 }); } },
  { id: 'montage', dur: 6.6,
    setup: `__cine.hold('Mouse0', false); dev.cheat({ round: 10 }); dev.tele(-2, 0, 0); dev.cheat({ tp: [-2, 0, 0] }); app.game.player.yaw = -1.57; app.game.player.pitch = 0.02; ${PRE(7)}`,
    frame: (lt) => {
      const W = ['sable_hb2', 'goliath_50', 'colossus_rd', 'raptor_s8', 'nova_pistol', 'ray_rifle'];
      const cut = Math.min(5, Math.floor(lt / 1.1)), ct = lt - cut * 1.1;
      const sw = ct < DT * 0.5 ? `dev.cheat({ weapon: ${JSON.stringify(W[cut])} }); __cine.hold('Mouse2', false); __cine.hold('Mouse0', false);` : '';
      return `__cine.bars(0.55); ${sw} __cine.aimZombie(0, 0.5); ${ct > 0.2 ? "__cine.hold('Mouse2', true);" : ''} ${ct >= 0.5 && ct < 0.82 ? "__cine.hold('Mouse0', true);" : "__cine.hold('Mouse0', false);"}` + title('31 Original Weapons', 'every one handles differently', window01(lt, 3.2, 3.7, 6.0, 6.6));
    },
    audio: (ev, t0) => { ev.push({ k: 'boom', t: t0 + 3.2, v: 0.7 }); } },
  { id: 'rooftop', dur: 6.5,
    setup: `__cine.hold('Mouse2', false); __cine.hold('Mouse0', false); dev.cheat({ openAll: true }); dev.cheat({ round: 12 }); dev.tele(33, -16, 5.2); dev.cheat({ tp: [33, -16, 5.2] }); ${PRE(14)}`,
    frame: (lt) => cam([[0, { x: 50.5, y: 2.0, z: -20.5, yaw: -0.95, pitch: -0.06, fov: 72 }], [6.5, { x: 47.8, y: 5.2, z: -16.5, yaw: -1.08, pitch: 0.08, fov: 68 }]], lt) + `__cine.bars(1);` + title('Take the High Ground', 'stairs, balconies, rooftops - they will follow', window01(lt, 1.4, 2.0, 4.8, 5.4)),
    audio: (ev, t0) => { ev.push({ k: 'boom', t: t0 + 1.4, v: 0.7 }, { k: 'play', n: 'zclimb', t: t0 + 2.2, o: { vol: 0.6 } }, { k: 'play', n: 'zgrowl', t: t0 + 3.6, o: { vol: 0.5, pan: 0.3 } }); } },
  { id: 'flyover', dur: 6,
    setup: '',
    frame: (lt) => cam([[0, { x: -26, y: 17, z: -36, yaw: 0.55, pitch: 0.52, fov: 70 }], [6, { x: 12, y: 20, z: -8, yaw: 0.3, pitch: 0.5, fov: 70 }]], lt) + `__cine.bars(1);` + title('Unlock a Ruined Town', 'eleven areas, fifteen doors, a mystery box on the move', window01(lt, 1.0, 1.6, 4.6, 5.2)),
    audio: (ev, t0) => { ev.push({ k: 'boom', t: t0 + 1.0, v: 0.7 }); } },
  { id: 'horde', dur: 6.2,
    setup: `__cine.clearCam(); dev.cheat({ round: 22 }); dev.tele(2, -1, 0); dev.cheat({ tp: [2, -1, 0] }); dev.cheat({ weapon: 'colossus_rd' }); app.game.player.yaw = 1.57; app.game.player.pitch = 0.02; ${PRE(12)}`,
    frame: (lt) => `__cine.clearCam(); __cine.bars(0.55); __cine.title('', '', 0); __cine.aimZombie(0, 0.25); ${lt >= 0.6 && lt < 5.7 ? "__cine.hold('Mouse0', true);" : "__cine.hold('Mouse0', false);"} __cine.fade(${lt > 5.6 ? fadeIn(lt, 5.6, 6.2).toFixed(3) : 0});`,
    audio: (ev, t0) => { ev.push({ k: 'play', n: 'scream', t: t0 + 0.2, o: { vol: 0.5 } }, { k: 'play', n: 'zattack', t: t0 + 2.4, o: { vol: 0.6, pan: -0.4 } }, { k: 'play', n: 'zattack', t: t0 + 4.1, o: { vol: 0.6, pan: 0.5 } }); } },
  { id: 'title', dur: 6.5,
    setup: `__cine.hold('Mouse0', false); __cine.setCam({ x: 0, y: 30, z: 0, yaw: 0, pitch: 1.2, fov: 60 });`,
    frame: (lt) => `__cine.bars(0); __cine.fade(1);` + title('Zombie Survival', 'Ashford Street  ·  LAN co-op for 1-8 players  ·  every asset made from scratch', window01(lt, 0.5, 1.3, 5.0, 6.2), 'center', true),
    audio: (ev, t0) => { ev.push({ k: 'play', n: 'round_start', t: t0 + 0.5, o: { vol: 0.9 } }, { k: 'boom', t: t0 + 0.5, v: 1.0 }, { k: 'play', n: 'zgrowl', t: t0 + 4.2, o: { vol: 0.55, pitch: 0.8 } }); } },
];

function buildScore(shots, log, total) {
  const ev = [];
  // ambience
  ev.push({ k: 'play', n: 'wind', t: 0, o: { vol: 0.35, loopUntil: total - 0.5, fadeIn: 1.5, fadeOut: 2 } });
  ev.push({ k: 'play', n: 'fire', t: 0, o: { vol: 0.22, loopUntil: total - 4, fadeIn: 2, fadeOut: 2, lp: 2500 } });
  // music bed
  const tHorde = shots.find(s => s.id === 'horde'), tTitle = shots.find(s => s.id === 'title');
  const hordeStart = tHorde ? tHorde.t0 : total - 12, titleStart = tTitle ? tTitle.t0 : total - 6;
  ev.push({ k: 'drone', t: 0, t1: hordeStart + 5.6, f: 55, v: 0.2 });
  const fly = shots.find(s => s.id === 'flyover');
  if (fly) ev.push({ k: 'pad', t: fly.t0, t1: hordeStart + 5.6, f: [110, 130.81, 164.81], v: 0.07 });
  const ads = shots.find(s => s.id === 'ads');
  const beatStart = ads ? ads.t0 : 10;
  for (let t = beatStart; t < hordeStart + 5.4; t += 0.6) ev.push({ k: 'kick', t, v: t >= hordeStart ? 1.0 : 0.85 });
  const montage = shots.find(s => s.id === 'montage');
  const hatStart = montage ? montage.t0 : beatStart + 20;
  for (let t = hatStart; t < hordeStart + 5.4; t += 0.3) ev.push({ k: 'hat', t, v: 0.09 });
  const roof = shots.find(s => s.id === 'rooftop');
  const snareStart = roof ? roof.t0 : hatStart + 6;
  for (let t = snareStart + 0.6; t < hordeStart + 5.4; t += 1.2) ev.push({ k: 'snare', t, v: 0.3 });
  // bass pulses on the drone root, changing every two bars
  const bassNotes = [55, 55, 65.4, 49];
  let bi = 0;
  for (let t = beatStart + 0.3; t < hordeStart; t += 2.4) { ev.push({ k: 'pluck', t, f: bassNotes[bi % 4], dur: 0.7, v: 0.22 }); bi++; }
  ev.push({ k: 'riser', t: hordeStart - 2.6, t1: hordeStart + 0.2, v: 0.45 });
  ev.push({ k: 'boom', t: hordeStart + 0.2, v: 1.0 });
  ev.push({ k: 'riser', t: titleStart - 1.6, t1: titleStart + 0.4, v: 0.35 });
  // shot-specific events
  for (const s of shots) if (s.audio) s.audio(ev, s.t0);
  // gunshots and hits from the recorded log
  for (const sh of log.shots) ev.push({ k: 'play', n: sh.sound, t: sh.t, o: { vol: sh.pap ? 1.0 : 0.85, pitch: 0.96 + ((sh.t * 7) % 1) * 0.08 } });
  let lastKill = -1, lastHurt = -1, lastHead = -1;
  for (const h of log.hits) {
    if (h.k) { if (h.t - lastKill > 0.22) { ev.push({ k: 'play', n: 'zdeath', t: h.t, o: { vol: 0.5, pan: ((h.t * 13) % 1) - 0.5 } }); lastKill = h.t; } }
    else if (h.t - lastHurt > 0.2) { ev.push({ k: 'play', n: 'zhurt', t: h.t, o: { vol: 0.28 } }); lastHurt = h.t; }
    if (h.head && h.t - lastHead > 0.3) { ev.push({ k: 'play', n: 'headshot', t: h.t, o: { vol: 0.35 } }); lastHead = h.t; }
  }
  // zombie ambience (seeded)
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let t = 2.5; t < titleStart - 0.5; t += 1.4 + rnd() * 1.8) {
    const n = t > hordeStart ? (rnd() < 0.5 ? 'zgrowl' : 'zattack') : ['zmoan1', 'zmoan2', 'zmoan3', 'zmoan4', 'zgrowl'][Math.floor(rnd() * 5)];
    ev.push({ k: 'play', n, t, o: { vol: 0.22 + rnd() * 0.18, pan: rnd() * 1.4 - 0.7, pitch: 0.85 + rnd() * 0.3 } });
  }
  return ev;
}

async function main() {
  if (!FFMPEG) throw new Error('ffmpeg not found (use --ffmpeg <path>)');
  fs.mkdirSync(OUT, { recursive: true });
  const framesDir = path.join(OUT, ONLY ? 'frames_preview' : 'frames');
  fs.rmSync(framesDir, { recursive: true, force: true }); fs.mkdirSync(framesDir, { recursive: true });
  // server
  if (!(await portOpen(PORT))) {
    const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js'), '--port', String(PORT), '--no-browser', '--dev'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
    procs.push(server);
    const t0 = Date.now();
    while (!(await portOpen(PORT))) { if (Date.now() - t0 > 15000) throw new Error('server did not start'); await sleep(200); }
    log('server on', PORT);
  }
  // chrome
  const dbg = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zs-trailer-')); dirs.push(dir);
  const chrome = spawn(findChrome(), ['--headless=new', `--remote-debugging-port=${dbg}`, `--user-data-dir=${dir}`, `--window-size=${W},${H}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--hide-scrollbars', '--force-device-scale-factor=1', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  procs.push(chrome);
  let targets = null;
  for (let i = 0; i < 100; i++) { try { const r = await fetch(`http://127.0.0.1:${dbg}/json`); targets = await r.json(); if (targets.length) break; } catch (e) { /* wait */ } await sleep(150); }
  const page = targets.find(t => t.type === 'page') || targets[0];
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  let pageErrors = 0;
  cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') { pageErrors++; console.log('[page:error]', p.args.map(a => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ').slice(0, 400)); } });
  cdp.on('Runtime.exceptionThrown', (p) => { pageErrors++; const d = p.exceptionDetails; console.log('[page:EXCEPTION]', String((d.exception && (d.exception.description || d.exception.value)) || d.text).slice(0, 600)); });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const evalP = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: `(async () => { const __r = await (${expr}); try { JSON.stringify(__r); return __r; } catch (e) { return '[unserializable]'; } })()`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error('page: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
  };
  const waitFor = async (expr, timeout, label) => { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { if (await evalP(expr)) return; } catch (e) { /* retry */ } await sleep(250); } throw new Error('timeout: ' + label); };
  const url = `http://127.0.0.1:${PORT}/`;
  await cdp.send('Page.navigate', { url });
  await waitFor('document.readyState === "complete"', 20000, 'page');
  await evalP(`localStorage.setItem('zombie-survival.settings.v1', JSON.stringify({ graphics: { preset: 'ultra', resolutionScale: 1, shadows: 'ultra', textures: 'high', effects: 'ultra', aa: 'msaa', ao: true, bloom: true, renderDistance: 240, particles: 'high', grain: false, showFps: false, fov: 92, fpsLimit: 0, vsync: true }, player: { name: 'Ranger' } }))`);
  await cdp.send('Page.navigate', { url });
  await waitFor('typeof window.app === "object" && !!window.app && window.app.local && window.app.local.open', 30000, 'app');
  await evalP('window.app.playSolo()');
  await waitFor('window.app.game && window.app.game.running', 240000, 'game running');
  log('game running; installing cinematic runtime');
  await sleep(1500);
  await evalP('window.dev.lock(true)');
  await evalP('window.dev.cheat({ god: true, points: 20000 })');
  await evalP('window.dev.cheat({ pause: true })');
  const pageScript = fs.readFileSync(path.join(__dirname, 'trailer-page.js'), 'utf8');
  const inst = await cdp.send('Runtime.evaluate', { expression: pageScript, returnByValue: true });
  if (inst.exceptionDetails) throw new Error('page script: ' + ((inst.exceptionDetails.exception && inst.exceptionDetails.exception.description) || inst.exceptionDetails.text));
  await evalP(`(() => { window.__cine.fps = ${FPS}; return true; })()`);
  // shots + timeline
  const shots = (ONLY ? SHOTS.filter(s => ONLY.includes(s.id)) : SHOTS).map(s => ({ ...s }));
  let t = 0; for (const s of shots) { s.t0 = t; s.frames = Math.round(s.dur * FPS); t += s.frames / FPS; }
  const total = t;
  log(`${shots.length} shots, ${total.toFixed(1)} s, ${Math.round(total * FPS)} frames at ${W}x${H}@${FPS}`);
  let frame = 0;
  const started = Date.now();
  for (const s of shots) {
    log(`shot ${s.id} (${s.dur} s)`);
    if (s.setup) await evalP(`(async () => { ${s.setup} await new Promise(r => setTimeout(r, 60)); return true; })()`);
    for (let i = 0; i < s.frames; i++) {
      const lt = i / FPS;
      const actions = s.frame(lt, s.t0 + lt);
      await evalP(`(async () => { ${actions} dev.cheat({ step: ${DT} }); await new Promise(r => setTimeout(r, 5)); window.__cine.step(); return true; })()`);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: QUALITY });
      fs.writeFileSync(path.join(framesDir, `f${String(frame).padStart(5, '0')}.jpg`), Buffer.from(shot.data, 'base64'));
      frame++;
      if (frame % 60 === 0) { const el = (Date.now() - started) / 1000; log(`  frame ${frame}/${Math.round(total * FPS)}  (${(frame / el).toFixed(1)} fps capture, eta ${Math.round((total * FPS - frame) / (frame / el))} s)  ${JSON.stringify(await evalP('window.__cine.stats()'))}`); }
    }
  }
  log(`captured ${frame} frames in ${Math.round((Date.now() - started) / 1000)} s; page errors: ${pageErrors}`);
  // soundtrack
  const cineLog = await evalP('window.__cine.log');
  fs.writeFileSync(path.join(OUT, 'events.json'), JSON.stringify({ shots: shots.map(s => ({ id: s.id, t0: s.t0, dur: s.dur })), log: cineLog }, null, 1));
  const events = buildScore(shots, cineLog, total + 0.2);
  const audioName = ONLY ? 'trailer_audio_preview' : 'trailer_audio';
  const score = await evalP(`window.__cine.renderScore(${JSON.stringify(events)}, ${(total + 0.2).toFixed(3)}, ${JSON.stringify(audioName)})`);
  log('score rendered', JSON.stringify(score));
  const wav = path.join(ROOT, 'tools', 'shots', audioName + '.wav');
  if (!fs.existsSync(wav)) throw new Error('audio file missing: ' + wav);
  // encode
  const mp4 = path.join(OUT, ONLY ? `preview_${ONLY.join('_')}.mp4` : 'trailer.mp4');
  const ff = spawnSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(framesDir, 'f%05d.jpg'), '-i', wav,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  if (ff.status !== 0) throw new Error('ffmpeg failed');
  const size = fs.statSync(mp4).size;
  log(`done: ${mp4} (${(size / 1e6).toFixed(1)} MB, ${total.toFixed(1)} s)`);
  cdp.close();
}

main().then(() => { cleanup(); setTimeout(() => process.exit(0), 800); }).catch((e) => { console.error('[trailer] FAILED:', e.message); cleanup(); setTimeout(() => process.exit(1), 800); });
