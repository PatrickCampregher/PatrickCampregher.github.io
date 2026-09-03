// In-page cinematic runtime for tools/trailer.mjs. Evaluated inside the running client (solo game, dev server).
// Provides a deterministic fake clock (the whole client runs on window.__cine.t), a free camera that overrides
// the player camera, title/letterbox overlays, event logging for the soundtrack and an offline score renderer
// that reuses the game's own synthesized sound buffers.
(() => {
  const app = window.app, g = app.game, dev = window.dev;
  if (window.__cine) return 'already';
  const C = { t: 0, fps: 30, cam: null, log: { shots: [], hits: [] } };
  window.__cine = C;

  // ---- fake clock: game loop, Babylon (particles, animations) and the clock sync all read performance.now ----
  const realNow = performance.now.bind(performance);
  C.realNow = realNow;
  performance.now = () => C.t * 1000;
  g.lastRenderT = 0;

  // ---- overlays ----
  const st = document.createElement('style');
  st.textContent = `
    #cine{position:fixed;inset:0;pointer-events:none;z-index:60;font-family:Impact,"Arial Narrow Bold","Franklin Gothic Medium",sans-serif}
    #cine .bar{position:absolute;left:0;right:0;height:0;background:#000}
    #cine .top{top:0} #cine .bot{bottom:0}
    #cine .vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,.6) 100%);opacity:0}
    #cine .title{position:absolute;left:0;right:0;text-align:center;opacity:0;color:#e8e4dc;text-transform:uppercase}
    #cine .title .main{font-size:92px;letter-spacing:14px;line-height:1;text-shadow:0 0 40px rgba(255,60,40,.55),0 5px 0 #000}
    #cine .title .main.red{color:#ff3b2f;font-size:168px;letter-spacing:16px;text-shadow:0 0 70px rgba(255,40,30,.75),0 9px 0 #000}
    #cine .title .sub{font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:22px;letter-spacing:10px;color:#ffb347;margin-top:16px;text-shadow:0 2px 4px #000}
    #cine .title.lower{bottom:15%} #cine .title.center{top:50%;transform:translateY(-50%)}
    #cine .black{position:absolute;inset:0;background:#000;opacity:0}`;
  document.head.appendChild(st);
  const ov = document.createElement('div'); ov.id = 'cine';
  ov.innerHTML = '<div class="bar top"></div><div class="bar bot"></div><div class="vig"></div><div class="black"></div><div class="title lower"><div class="main"></div><div class="sub"></div></div>';
  document.body.appendChild(ov);
  const el = { top: ov.querySelector('.top'), bot: ov.querySelector('.bot'), vig: ov.querySelector('.vig'), title: ov.querySelector('.title'), main: ov.querySelector('.main'), sub: ov.querySelector('.sub'), black: ov.querySelector('.black') };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  C.bars = (k) => { const h = (clamp01(k) * 10.5) + '%'; el.top.style.height = h; el.bot.style.height = h; el.vig.style.opacity = String(clamp01(k) * 0.85); };
  C.title = (main, sub, k, mode = 'lower', red = false) => {
    if (el.main.textContent !== main) el.main.textContent = main;
    if (el.sub.textContent !== sub) el.sub.textContent = sub;
    el.main.classList.toggle('red', !!red);
    el.title.className = 'title ' + mode;
    el.title.style.opacity = String(clamp01(k));
  };
  C.fade = (k) => { el.black.style.opacity = String(clamp01(k)); };

  // ---- free camera (overrides the player camera while C.cam is set) ----
  const p = g.player;
  const origUpdate = p.update.bind(p);
  p.update = function (dt) {
    if (C.cam) {
      const c = C.cam;
      g.camera.position.set(c.x, c.y, c.z);
      g.camera.rotation.set(c.pitch || 0, c.yaw || 0, c.roll || 0);
      g.camera.fov = (c.fov || 80) * Math.PI / 180;
      return;
    }
    origUpdate(dt);
  };
  C.setCam = (c) => { C.cam = c; g.viewModel.setVisible(false); g.hud.hide(); };
  C.clearCam = () => { if (!C.cam) return; C.cam = null; g.viewModel.setVisible(true); g.hud.show(); };

  // ---- event logging for the soundtrack ----
  const origShoot = p._shoot.bind(p);
  p._shoot = function () { C.log.shots.push({ t: +C.t.toFixed(3), sound: this.def ? this.def.sound : 'rifle', pap: !!(this.def && this.def.pap) }); return origShoot(); };
  const ents = g.entities;
  const origHit = ents.onHit.bind(ents);
  ents.onHit = function (m) { C.log.hits.push({ t: +C.t.toFixed(3), k: !!m.k, head: m.part === 1 }); return origHit(m); };

  // ---- helpers ----
  const pressed = [];
  C.step = () => {
    C.t += 1 / C.fps;
    g._frame();
    while (pressed.length) dev.hold(pressed.pop(), false);
  };
  C.press = (code) => { dev.hold(code, true); pressed.push(code); };
  C.hold = (code, on) => dev.hold(code, on);
  C.aim = (x, y, z, k = 1) => {
    const ex = p.x, ey = p.y + p.eyeHeight, ez = p.z;
    const dx = x - ex, dy = y - ey, dz = z - ez;
    const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    let dyaw = yaw - p.yaw; while (dyaw > Math.PI) dyaw -= 2 * Math.PI; while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    p.yaw += dyaw * k; p.pitch += (pitch - p.pitch) * k;
  };
  C.nearestZombie = (maxDist = 45) => { let best = null, bd = maxDist; for (const e of ents.zombies.values()) { if (e.dead) continue; const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; best = e; } } return best; };
  C.aimZombie = (part = 1, k = 0.35, maxDist = 45) => {
    const e = C.nearestZombie(maxDist);
    if (!e) return false;
    let tx = e.x, ty = e.y + 1.15, tz = e.z;
    if (part === 1 && ents.headCenter) { const h = ents.headCenter(e); tx = h.x; ty = h.y; tz = h.z; }
    C.aim(tx, ty, tz, k);
    return true;
  };
  C.zombieCount = () => { let n = 0; for (const e of ents.zombies.values()) if (!e.dead) n++; return n; };
  C.stats = () => ({ t: +C.t.toFixed(2), pos: [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)], zombies: C.zombieCount(), weapon: p.def && p.def.name, ads: +p.adsK.toFixed(2), perks: p.perks, slot: p.slot });
  g.settings.graphics.showFps = false; g.hud.fps(0, false);

  // ---- offline score renderer (reuses the game's synthesized buffers + a small synth) ----
  C.renderScore = async (events, duration, name = 'trailer_audio') => {
    const mod = await import('/js/audio/audio.js');
    const A = mod.audio;
    const sr = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(duration * sr), sr);
    const master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
    const env = (t0, pts) => { const gn = ctx.createGain(); gn.gain.setValueAtTime(Math.max(0.0001, pts[0][1]), t0 + pts[0][0]); for (let i = 1; i < pts.length; i++) gn.gain.linearRampToValueAtTime(Math.max(0.0001, pts[i][1]), t0 + pts[i][0]); return gn; };
    const noise = (dur) => { const n = Math.ceil(dur * sr); const b = ctx.createBuffer(1, n, sr); const d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; const s = ctx.createBufferSource(); s.buffer = b; return s; };
    const play = (n, t, o = {}) => {
      const b = A.buffers.get(n); if (!b || t < 0 || t > duration) return;
      const s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = o.pitch || 1;
      const gn = ctx.createGain(); const vol = o.vol ?? 0.8; gn.gain.value = vol;
      s.connect(gn); let last = gn;
      if (o.pan != null) { const pn = ctx.createStereoPanner(); pn.pan.value = o.pan; last.connect(pn); last = pn; }
      if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; last.connect(f); last = f; }
      last.connect(master);
      if (o.fadeIn) { gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(vol, t + o.fadeIn); }
      if (o.loopUntil) { s.loop = true; s.start(t); s.stop(Math.min(duration, o.loopUntil)); if (o.fadeOut) { gn.gain.setValueAtTime(vol, o.loopUntil - o.fadeOut); gn.gain.linearRampToValueAtTime(0.0001, o.loopUntil); } }
      else s.start(t);
    };
    const kick = (t, vol = 0.9) => { const o = osc('sine', 150); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); const gn = env(t, [[0, vol], [0.01, vol], [0.3, 0.001]]); o.connect(gn); gn.connect(master); o.start(t); o.stop(t + 0.32); const c = noise(0.03); const cg = env(t, [[0, 0.22], [0.03, 0.001]]); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500; c.connect(hp); hp.connect(cg); cg.connect(master); c.start(t); };
    const hat = (t, vol = 0.1) => { const n = noise(0.06); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const gn = env(t, [[0, vol], [0.05, 0.001]]); n.connect(f); f.connect(gn); gn.connect(master); n.start(t); };
    const snare = (t, vol = 0.32) => { const n = noise(0.2); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7; const gn = env(t, [[0, vol], [0.18, 0.001]]); n.connect(f); f.connect(gn); gn.connect(master); n.start(t); const o = osc('triangle', 180); const og = env(t, [[0, vol * 0.6], [0.1, 0.001]]); o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.12); };
    const boom = (t, vol = 1.0) => { const o = osc('sine', 70); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.2); const gn = env(t, [[0, vol], [0.02, vol], [1.6, 0.001]]); o.connect(gn); gn.connect(master); o.start(t); o.stop(t + 1.7); const n = noise(0.5); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.5); const ng = env(t, [[0, vol * 0.5], [0.5, 0.001]]); n.connect(lp); lp.connect(ng); ng.connect(master); n.start(t); };
    const drone = (t0, t1, base = 55, vol = 0.2) => { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 2; const lfo = osc('sine', 0.09); const lg = ctx.createGain(); lg.gain.value = 120; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t0); lfo.stop(t1); const gn = env(t0, [[0, 0.0001], [3, vol], [Math.max(3.1, t1 - t0 - 3), vol], [t1 - t0, 0.0001]]); lp.connect(gn); gn.connect(master); for (const [type, f, v] of [['sawtooth', base, 0.5], ['sawtooth', base * 1.005, 0.5], ['sine', base / 2, 0.9], ['sawtooth', base * 1.5, 0.15]]) { const o = osc(type, f); const og = ctx.createGain(); og.gain.value = v; o.connect(og); og.connect(lp); o.start(t0); o.stop(t1); } };
    const pad = (t0, t1, freqs, vol = 0.08) => { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; const gn = env(t0, [[0, 0.0001], [2.5, vol], [Math.max(2.6, t1 - t0 - 2), vol], [t1 - t0, 0.0001]]); lp.connect(gn); gn.connect(master); for (const f of freqs) for (const det of [-4, 4]) { const o = osc('triangle', f); o.detune.value = det; o.connect(lp); o.start(t0); o.stop(t1); } };
    const riser = (t0, t1, vol = 0.5) => { const n = noise(t1 - t0 + 0.1); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(200, t0); f.frequency.exponentialRampToValueAtTime(6000, t1); const gn = env(t0, [[0, 0.0001], [t1 - t0, vol]]); n.connect(f); f.connect(gn); gn.connect(master); n.start(t0); n.stop(t1 + 0.05); const o = osc('sawtooth', 80); o.frequency.setValueAtTime(80, t0); o.frequency.exponentialRampToValueAtTime(640, t1); const og = env(t0, [[0, 0.0001], [t1 - t0, vol * 0.4]]); const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 1800; o.connect(lp2); lp2.connect(og); og.connect(master); o.start(t0); o.stop(t1); };
    const pluck = (t, f, dur = 0.5, vol = 0.28) => { const o = osc('sawtooth', f); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(180, t + dur); const gn = env(t, [[0, vol], [dur, 0.001]]); o.connect(lp); lp.connect(gn); gn.connect(master); o.start(t); o.stop(t + dur + 0.02); };
    for (const e of events) {
      if (!(e.t >= 0) || e.t > duration) continue;
      if (e.t1 != null && !(e.t1 > e.t + 0.1)) continue;
      switch (e.k) {
        case 'play': play(e.n, e.t, e.o || {}); break;
        case 'kick': kick(e.t, e.v); break;
        case 'hat': hat(e.t, e.v); break;
        case 'snare': snare(e.t, e.v); break;
        case 'boom': boom(e.t, e.v); break;
        case 'drone': drone(e.t, e.t1, e.f, e.v); break;
        case 'pad': pad(e.t, e.t1, e.f, e.v); break;
        case 'riser': riser(e.t, e.t1, e.v); break;
        case 'pluck': pluck(e.t, e.f, e.dur, e.v); break;
        default: break;
      }
    }
    const rendered = await ctx.startRendering();
    const L = rendered.getChannelData(0), R = rendered.getChannelData(1);
    let peak = 0; for (let i = 0; i < L.length; i++) { const a = Math.abs(L[i]), b = Math.abs(R[i]); if (a > peak) peak = a; if (b > peak) peak = b; }
    const gain = peak > 0 ? 0.89 / peak : 1;
    const n = L.length, out = new ArrayBuffer(44 + n * 4), dv = new DataView(out);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * 4, true);
    const soft = (v) => { v *= gain; return v < -1 ? -1 : v > 1 ? 1 : v; };
    for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, soft(L[i]) * 32767, true); dv.setInt16(46 + i * 4, soft(R[i]) * 32767, true); }
    const bytes = new Uint8Array(out);
    const dataUrl = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => reject(fr.error); fr.readAsDataURL(new Blob([out], { type: 'audio/wav' })); });
    const r = await fetch('/api/shot?name=' + encodeURIComponent(name), { method: 'POST', body: dataUrl });
    return { ok: r.ok, peak: +peak.toFixed(3), seconds: duration, bytes: bytes.length };
  };
  return 'ok';
})()
