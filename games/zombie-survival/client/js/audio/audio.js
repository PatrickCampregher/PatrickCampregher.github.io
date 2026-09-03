// Procedural audio: every sound is synthesized at load time with the Web Audio API (no audio files),
// then played back through a 3D positional mixer.

const SR = 44100;

// ---------------- synthesis helpers ----------------
function noise(ctx, dur, color = 'white') {
  const n = Math.ceil(dur * SR);
  const buf = ctx.createBuffer(1, n, SR);
  const d = buf.getChannelData(0);
  if (color === 'white') for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  else { // pink-ish via running average
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
  }
  const src = ctx.createBufferSource(); src.buffer = buf; return src;
}
function osc(ctx, type, freq) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; return o; }
function filt(ctx, type, freq, Q = 1) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; return f; }
function gainEnv(ctx, points, base = 0.0001) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(base, points[0][1]), points[0][0]);
  for (let i = 1; i < points.length; i++) {
    const [t, v] = points[i];
    if (v > 0.001 && points[i - 1][1] > 0.001) g.gain.exponentialRampToValueAtTime(v, t);
    else g.gain.linearRampToValueAtTime(Math.max(0, v), t);
  }
  return g;
}
function dist(ctx, amount = 20) {
  const ws = ctx.createWaveShaper();
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x)); }
  ws.curve = curve; ws.oversample = '2x';
  return ws;
}
function chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }
function sweep(param, from, to, t0, dur, exp = true) {
  param.setValueAtTime(from, t0);
  if (exp && from > 0 && to > 0) param.exponentialRampToValueAtTime(to, t0 + dur); else param.linearRampToValueAtTime(to, t0 + dur);
}
function reverbTail(ctx, input, out, dur = 0.6, gain = 0.25) {
  // cheap "reverb": short noise convolution
  const n = Math.ceil(dur * SR);
  const buf = ctx.createBuffer(2, n, SR);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5); }
  const conv = ctx.createConvolver(); conv.buffer = buf;
  const g = ctx.createGain(); g.gain.value = gain;
  input.connect(conv); conv.connect(g); g.connect(out);
}

// ---------------- sound definitions ----------------
function gunshot(p) {
  // p: { crack, body, bodyFreq, thump, thumpFreq, tail, tailGain, dist, vol }
  return { dur: 0.2 + Math.max(p.crack, p.body, p.thump, p.tail || 0) + 0.15, build: (ctx, out) => {
    const master = ctx.createGain(); master.gain.value = p.vol ?? 1;
    const d = dist(ctx, p.dist ?? 25); d.connect(master); master.connect(out);
    // crack
    const c = noise(ctx, p.crack + 0.05);
    chain(c, filt(ctx, 'highpass', p.crackFreq || 1800, 0.7), gainEnv(ctx, [[0, 1], [0.005, 1], [p.crack, 0.01]]), d);
    c.start(0);
    // body
    const b = noise(ctx, p.body + 0.05);
    const bf = filt(ctx, 'lowpass', p.bodyFreq || 700, 0.8);
    chain(b, bf, gainEnv(ctx, [[0, 1.2], [0.01, 1.2], [p.body, 0.01]]), d);
    b.start(0);
    // thump
    const t = osc(ctx, 'sine', p.thumpFreq || 90);
    sweep(t.frequency, (p.thumpFreq || 90) * 1.6, (p.thumpFreq || 90) * 0.6, 0, p.thump);
    chain(t, gainEnv(ctx, [[0, 1.3], [0.012, 1.3], [p.thump, 0.01]]), d);
    t.start(0); t.stop(p.thump + 0.02);
    // tail
    if (p.tail) {
      const tl = noise(ctx, p.tail + 0.05);
      chain(tl, filt(ctx, 'bandpass', p.tailFreq || 900, 0.6), gainEnv(ctx, [[0, 0.0001], [0.03, p.tailGain || 0.25], [p.tail, 0.001]]), master);
      tl.start(0);
    }
  } };
}

/** gunshot + a mechanical action layer (bolt carrier clack, pump, slide) for per-weapon identity. mech: [[t, lowpassHz, vol, dur], ...] */
function gunshotMech(p, mech) {
  const base = gunshot(p);
  const end = mech.reduce((a, m) => Math.max(a, m[0] + m[3]), 0);
  return { dur: Math.max(base.dur, end + 0.1), build: (ctx, out) => {
    base.build(ctx, out);
    for (const [t, lp, vol, dur] of mech) {
      const n = noise(ctx, dur + 0.02);
      chain(n, filt(ctx, 'lowpass', lp, 1), gainEnv(ctx, [[t, vol], [t + dur, 0.001]]), out);
      n.start(t);
    }
  } };
}

/** synthesized energy weapon discharge. p: { f0, f1, dur, type, sub, subFreq, hiss, ping, vol, sat } */
function energyShot(p) {
  return { dur: p.dur + 0.35, build: (ctx, out) => {
    const master = ctx.createGain(); master.gain.value = p.vol ?? 0.8;
    const sat = dist(ctx, p.sat ?? 18); sat.connect(master); master.connect(out);
    const env = gainEnv(ctx, [[0, 0.0001], [0.008, 1], [p.dur * 0.55, 0.5], [p.dur, 0.001]]); env.connect(sat);
    const o = osc(ctx, p.type || 'sawtooth', p.f0); sweep(o.frequency, p.f0, p.f1, 0, p.dur);
    const o2 = osc(ctx, 'square', p.f0 * 0.5); sweep(o2.frequency, p.f0 * 0.5, p.f1 * 0.5, 0, p.dur);
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    const bp = filt(ctx, 'bandpass', p.f0 * 1.2, 1.2); sweep(bp.frequency, p.f0 * 1.5, Math.max(120, p.f1 * 1.2), 0, p.dur);
    o.connect(bp); o2.connect(g2); g2.connect(bp); bp.connect(env);
    o.start(0); o2.start(0); o.stop(p.dur + 0.02); o2.stop(p.dur + 0.02);
    if (p.sub) { const s = osc(ctx, 'sine', p.subFreq || 70); sweep(s.frequency, (p.subFreq || 70) * 1.4, (p.subFreq || 70) * 0.7, 0, p.sub); chain(s, gainEnv(ctx, [[0, p.subGain || 1.0], [0.01, p.subGain || 1.0], [p.sub, 0.001]]), master); s.start(0); s.stop(p.sub + 0.02); }
    if (p.hiss) { const n = noise(ctx, p.hiss + 0.05); const hp = filt(ctx, 'highpass', 2500, 0.8); sweep(hp.frequency, 6000, 1500, 0, p.hiss); chain(n, hp, gainEnv(ctx, [[0, 0.6], [p.hiss, 0.001]]), master); n.start(0); }
    if (p.ping) { const pg = osc(ctx, 'sine', p.ping); chain(pg, gainEnv(ctx, [[0, 0.0001], [0.01, 0.35], [0.25, 0.001]]), master); pg.start(0); pg.stop(0.3); }
  } };
}

/** brass casings tumbling on the ground: a few short metallic pings at random times */
function casings(n = 4, dur = 0.55, vol = 0.35) {
  return { dur: dur + 0.2, build: (ctx, out) => {
    for (let i = 0; i < n; i++) {
      const t = 0.03 + Math.random() * dur * 0.7, f = 3800 + Math.random() * 3200;
      const o = osc(ctx, 'sine', f); const o2 = osc(ctx, 'sine', f * 1.51); const g2 = ctx.createGain(); g2.gain.value = 0.4;
      const env = gainEnv(ctx, [[t, 0.0001], [t + 0.004, vol], [t + 0.09 + Math.random() * 0.06, 0.001]]);
      o.connect(env); o2.connect(g2); g2.connect(env); env.connect(out);
      o.start(t); o2.start(t); o.stop(t + 0.2); o2.stop(t + 0.2);
    }
  } };
}

/** energy cell in/out: a short tone sweep plus a latch click */
function cellTone(f0, f1, dur, vol = 0.5, clickAt = 0) {
  return { dur: dur + 0.15, build: (ctx, out) => {
    const o = osc(ctx, 'triangle', f0); sweep(o.frequency, f0, f1, 0, dur);
    chain(o, filt(ctx, 'lowpass', 3000, 1), gainEnv(ctx, [[0, 0.0001], [0.02, vol], [dur, 0.001]]), out); o.start(0); o.stop(dur + 0.02);
    const n = noise(ctx, 0.05); chain(n, filt(ctx, 'lowpass', 2500, 1), gainEnv(ctx, [[clickAt, 0.5], [clickAt + 0.04, 0.001]]), out); n.start(clickAt);
  } };
}

function click(freq, dur, vol = 0.5, lp = 4000) {
  return { dur: dur + 0.05, build: (ctx, out) => {
    const n = noise(ctx, dur + 0.02);
    chain(n, filt(ctx, 'lowpass', lp, 1), gainEnv(ctx, [[0, vol], [dur, 0.001]]), out);
    n.start(0);
    if (freq) { const o = osc(ctx, 'sine', freq); chain(o, gainEnv(ctx, [[0, vol * 0.5], [dur * 0.6, 0.001]]), out); o.start(0); o.stop(dur); }
  } };
}

function multi(parts, dur) {
  return { dur, build: (ctx, out) => { for (const [t, def] of parts) { const g = ctx.createGain(); g.connect(out); const sub = { start: t }; buildAt(ctx, g, def, t); } } };
}
function buildAt(ctx, out, def, t0) {
  // wrap: run def.build in a delayed context by inserting a DelayNode
  const delay = ctx.createDelay(5); delay.delayTime.value = t0; delay.connect(out);
  def.build(ctx, delay);
}

function zombieVoice(p) {
  // p: { f0, f1, dur, formants:[f,f], noise, vibrato, attack, sat }
  return { dur: p.dur + 0.3, build: (ctx, out) => {
    const master = ctx.createGain(); master.gain.value = p.vol ?? 0.8;
    const sat = dist(ctx, p.sat ?? 12); sat.connect(master); master.connect(out);
    const o1 = osc(ctx, 'sawtooth', p.f0), o2 = osc(ctx, 'square', p.f0 * 0.5);
    sweep(o1.frequency, p.f0, p.f1, 0, p.dur, true);
    sweep(o2.frequency, p.f0 * 0.5, p.f1 * 0.5, 0, p.dur, true);
    const lfo = osc(ctx, 'sine', p.vibrato || 6); const lg = ctx.createGain(); lg.gain.value = p.f0 * 0.06; lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency); lfo.start(0);
    const mix = ctx.createGain(); mix.gain.value = 0.5;
    o1.connect(mix); o2.connect(mix);
    const nz = noise(ctx, p.dur + 0.1); const ng = ctx.createGain(); ng.gain.value = p.noise ?? 0.25; nz.connect(ng); ng.connect(mix); nz.start(0);
    const f1 = filt(ctx, 'bandpass', p.formants ? p.formants[0] : 500, 2.5), f2 = filt(ctx, 'bandpass', p.formants ? p.formants[1] : 1100, 3);
    const fm = ctx.createGain(); fm.gain.value = 1.5;
    mix.connect(f1); mix.connect(f2); f1.connect(fm); f2.connect(fm);
    const lp = filt(ctx, 'lowpass', 2200, 0.7);
    const env = gainEnv(ctx, [[0, 0.0001], [p.attack || 0.08, 1], [p.dur * 0.7, 0.8], [p.dur, 0.001]]);
    chain(fm, lp, env, sat);
    o1.start(0); o2.start(0); o1.stop(p.dur + 0.05); o2.stop(p.dur + 0.05);
  } };
}

function chime(notes, noteDur = 0.25, type = 'sine', vol = 0.35, spacing = 0.12) {
  const dur = spacing * notes.length + noteDur + 0.6;
  return { dur, build: (ctx, out) => {
    const master = ctx.createGain(); master.gain.value = vol; master.connect(out);
    reverbTail(ctx, master, out, 0.8, 0.35);
    notes.forEach((f, i) => {
      const t = i * spacing;
      const o = osc(ctx, type, f);
      const o2 = osc(ctx, 'sine', f * 2.01); const g2 = ctx.createGain(); g2.gain.value = 0.25;
      const env = gainEnv(ctx, [[t, 0.0001], [t + 0.01, 1], [t + noteDur, 0.15], [t + noteDur + 0.5, 0.001]]);
      o.connect(env); o2.connect(g2); g2.connect(env); env.connect(master);
      o.start(t); o2.start(t); o.stop(t + noteDur + 0.6); o2.stop(t + noteDur + 0.6);
    });
  } };
}

const DEFS = {
  // ---- weapons ----
  pistol: gunshot({ crack: 0.07, body: 0.14, bodyFreq: 900, thump: 0.09, thumpFreq: 110, tail: 0.35, tailGain: 0.18, vol: 0.9 }),
  revolver: gunshot({ crack: 0.09, body: 0.22, bodyFreq: 700, thump: 0.16, thumpFreq: 80, tail: 0.6, tailGain: 0.3, dist: 35, vol: 1.0 }),
  smg: gunshot({ crack: 0.05, body: 0.09, bodyFreq: 1100, thump: 0.06, thumpFreq: 130, tail: 0.2, tailGain: 0.12, vol: 0.75 }),
  rifle: gunshot({ crack: 0.075, body: 0.16, bodyFreq: 800, thump: 0.1, thumpFreq: 100, tail: 0.5, tailGain: 0.22, vol: 0.9 }),
  battle: gunshot({ crack: 0.085, body: 0.2, bodyFreq: 650, thump: 0.13, thumpFreq: 85, tail: 0.6, tailGain: 0.28, dist: 30, vol: 1.0 }),
  shotgun: gunshot({ crack: 0.1, body: 0.34, bodyFreq: 500, thump: 0.2, thumpFreq: 60, tail: 0.7, tailGain: 0.35, dist: 40, vol: 1.1 }),
  autoshotgun: gunshot({ crack: 0.09, body: 0.26, bodyFreq: 550, thump: 0.16, thumpFreq: 65, tail: 0.5, tailGain: 0.3, dist: 35, vol: 1.0 }),
  sniper: gunshot({ crack: 0.13, body: 0.3, bodyFreq: 600, thump: 0.22, thumpFreq: 70, tail: 1.0, tailGain: 0.4, tailFreq: 700, dist: 45, vol: 1.15 }),
  dmr: gunshot({ crack: 0.09, body: 0.2, bodyFreq: 700, thump: 0.14, thumpFreq: 90, tail: 0.7, tailGain: 0.3, dist: 30, vol: 1.0 }),
  lmg: gunshot({ crack: 0.075, body: 0.18, bodyFreq: 700, thump: 0.12, thumpFreq: 90, tail: 0.45, tailGain: 0.25, dist: 30, vol: 0.95 }),
  launcher: { dur: 0.7, build: (ctx, out) => {
    const o = osc(ctx, 'sine', 140); sweep(o.frequency, 160, 45, 0, 0.3);
    chain(o, gainEnv(ctx, [[0, 1], [0.05, 1], [0.35, 0.001]]), out); o.start(0); o.stop(0.4);
    const n = noise(ctx, 0.4); chain(n, filt(ctx, 'lowpass', 500, 1), gainEnv(ctx, [[0, 0.8], [0.3, 0.001]]), out); n.start(0);
  } },
  arc: { dur: 0.6, build: (ctx, out) => {
    const master = ctx.createGain(); master.gain.value = 0.8; master.connect(out);
    const o = osc(ctx, 'sawtooth', 180); const fm = osc(ctx, 'square', 47); const fg = ctx.createGain(); fg.gain.value = 300; fm.connect(fg); fg.connect(o.frequency);
    chain(o, filt(ctx, 'bandpass', 1500, 1.5), gainEnv(ctx, [[0, 0.9], [0.05, 0.7], [0.4, 0.001]]), dist(ctx, 40), master);
    o.start(0); fm.start(0); o.stop(0.45); fm.stop(0.45);
    const n = noise(ctx, 0.4); const bp = filt(ctx, 'bandpass', 3000, 1); sweep(bp.frequency, 4000, 300, 0, 0.35);
    chain(n, bp, gainEnv(ctx, [[0, 1], [0.35, 0.001]]), master); n.start(0);
    const c = noise(ctx, 0.05); chain(c, filt(ctx, 'highpass', 2000, 1), gainEnv(ctx, [[0, 1], [0.03, 0.001]]), master); c.start(0);
  } },
  ray: { dur: 0.45, build: (ctx, out) => {
    const master = ctx.createGain(); master.gain.value = 0.7; master.connect(out);
    const o = osc(ctx, 'sine', 1800); sweep(o.frequency, 2200, 250, 0, 0.28);
    const o2 = osc(ctx, 'square', 900); sweep(o2.frequency, 1100, 120, 0, 0.28); const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(master); o2.connect(g2); g2.connect(master);
    const env = gainEnv(ctx, [[0, 1], [0.02, 1], [0.3, 0.001]]); master.disconnect(); master.connect(env); env.connect(out);
    o.start(0); o2.start(0); o.stop(0.32); o2.stop(0.32);
    const n = noise(ctx, 0.15); chain(n, filt(ctx, 'highpass', 3000, 1), gainEnv(ctx, [[0, 0.5], [0.1, 0.001]]), env); n.start(0);
  } },
  // per-weapon shots (new roster)
  marshal: gunshot({ crack: 0.08, body: 0.18, bodyFreq: 800, thump: 0.12, thumpFreq: 95, tail: 0.45, tailGain: 0.24, dist: 30, vol: 0.98 }),
  hornet: gunshot({ crack: 0.05, body: 0.1, bodyFreq: 1000, thump: 0.06, thumpFreq: 125, tail: 0.25, tailGain: 0.12, vol: 0.75 }),
  cicada: gunshot({ crack: 0.06, body: 0.12, bodyFreq: 950, thump: 0.07, thumpFreq: 115, tail: 0.3, tailGain: 0.16, vol: 0.85 }),
  magistrate: gunshot({ crack: 0.1, body: 0.28, bodyFreq: 520, thump: 0.18, thumpFreq: 62, tail: 0.6, tailGain: 0.32, dist: 38, vol: 1.05 }),
  nightjar: gunshot({ crack: 0.055, body: 0.1, bodyFreq: 1200, thump: 0.07, thumpFreq: 120, tail: 0.28, tailGain: 0.14, crackFreq: 2200, vol: 0.8 }),
  wasp: gunshot({ crack: 0.04, body: 0.07, bodyFreq: 1400, thump: 0.05, thumpFreq: 150, tail: 0.15, tailGain: 0.1, crackFreq: 2600, vol: 0.65 }),
  hive: gunshot({ crack: 0.05, body: 0.11, bodyFreq: 900, thump: 0.07, thumpFreq: 110, tail: 0.3, tailGain: 0.15, vol: 0.8 }),
  tundra: gunshotMech({ crack: 0.08, body: 0.18, bodyFreq: 650, thump: 0.12, thumpFreq: 85, tail: 0.5, tailGain: 0.26, dist: 32, vol: 0.98 }, [[0.035, 3000, 0.25, 0.03]]),
  ibex: gunshot({ crack: 0.07, body: 0.14, bodyFreq: 850, thump: 0.09, thumpFreq: 105, tail: 0.4, tailGain: 0.2, vol: 0.88 }),
  sable: gunshot({ crack: 0.07, body: 0.15, bodyFreq: 780, thump: 0.1, thumpFreq: 98, tail: 0.45, tailGain: 0.22, crackFreq: 2000, vol: 0.9 }),
  trident: gunshot({ crack: 0.07, body: 0.15, bodyFreq: 820, thump: 0.1, thumpFreq: 100, tail: 0.5, tailGain: 0.22, crackFreq: 1900, vol: 0.9 }),
  raptor: gunshotMech({ crack: 0.09, body: 0.28, bodyFreq: 560, thump: 0.17, thumpFreq: 66, tail: 0.55, tailGain: 0.3, dist: 36, vol: 1.05 }, [[0.06, 2500, 0.3, 0.04]]),
  twinbore: gunshot({ crack: 0.12, body: 0.4, bodyFreq: 460, thump: 0.24, thumpFreq: 55, tail: 0.8, tailGain: 0.38, dist: 45, vol: 1.2 }),
  siege: gunshot({ crack: 0.1, body: 0.32, bodyFreq: 520, thump: 0.2, thumpFreq: 62, tail: 0.65, tailGain: 0.34, dist: 40, vol: 1.1 }),
  harbinger: gunshot({ crack: 0.15, body: 0.36, bodyFreq: 520, thump: 0.28, thumpFreq: 60, tail: 1.3, tailGain: 0.45, tailFreq: 600, dist: 50, vol: 1.25 }),
  goliath: gunshot({ crack: 0.16, body: 0.4, bodyFreq: 480, thump: 0.3, thumpFreq: 55, tail: 1.4, tailGain: 0.5, tailFreq: 550, dist: 55, vol: 1.3 }),
  anvil: gunshot({ crack: 0.08, body: 0.2, bodyFreq: 680, thump: 0.13, thumpFreq: 88, tail: 0.5, tailGain: 0.26, dist: 32, vol: 0.98 }),
  colossus: gunshot({ crack: 0.085, body: 0.22, bodyFreq: 620, thump: 0.14, thumpFreq: 80, tail: 0.55, tailGain: 0.3, dist: 34, vol: 1.0 }),
  nova: energyShot({ f0: 1400, f1: 160, dur: 0.32, type: 'sawtooth', sub: 0.2, subFreq: 75, subGain: 0.9, hiss: 0.12, ping: 2400, vol: 0.85, sat: 22 }),
  click_empty: click(0, 0.03, 0.4, 3000),
  // ---- reloads ----
  mag_out: multi([[0, click(0, 0.04, 0.6, 2500)], [0.06, click(0, 0.08, 0.35, 1200)]], 0.25),
  mag_in: multi([[0, click(0, 0.06, 0.7, 900)], [0.05, click(0, 0.03, 0.5, 3500)]], 0.2),
  bolt: multi([[0, click(0, 0.03, 0.6, 5000)], [0.09, click(0, 0.04, 0.6, 4000)]], 0.2),
  shell_in: multi([[0, click(0, 0.03, 0.5, 4000)], [0.04, click(0, 0.05, 0.3, 1500)]], 0.15),
  slide_rack: multi([[0, click(0, 0.03, 0.6, 4500)], [0.08, click(0, 0.04, 0.7, 3000)]], 0.2),
  bolt_cycle: multi([[0, click(0, 0.03, 0.55, 5000)], [0.12, click(0, 0.05, 0.4, 2000)], [0.3, click(0, 0.05, 0.45, 2200)], [0.42, click(0, 0.03, 0.6, 4500)]], 0.55),
  pump: multi([[0, click(0, 0.05, 0.6, 1800)], [0.13, click(0, 0.05, 0.7, 2200)]], 0.3),
  cyl_open: multi([[0, click(0, 0.03, 0.5, 4000)], [0.06, click(0, 0.08, 0.35, 1500)]], 0.2),
  cyl_close: multi([[0, click(0, 0.04, 0.6, 2500)], [0.03, click(0, 0.03, 0.5, 5000)]], 0.15),
  round_in: click(0, 0.03, 0.45, 3500),
  casings: casings(5, 0.5, 0.3),
  break_open: multi([[0, click(0, 0.04, 0.6, 3000)], [0.08, click(0, 0.08, 0.4, 1200)]], 0.25),
  break_close: multi([[0, click(0, 0.06, 0.8, 1500)], [0.04, click(0, 0.03, 0.5, 4500)]], 0.2),
  cover_open: multi([[0, click(0, 0.05, 0.5, 2200)], [0.1, click(0, 0.1, 0.35, 900)]], 0.3),
  cover_close: multi([[0, click(0, 0.08, 0.9, 1200)], [0.05, click(0, 0.03, 0.5, 4000)]], 0.2),
  cell_out: cellTone(900, 260, 0.3, 0.4, 0.0),
  cell_in: cellTone(300, 1300, 0.35, 0.45, 0.3),
  cell_charge: { dur: 0.75, build: (ctx, out) => {
    const o = osc(ctx, 'sine', 400); sweep(o.frequency, 400, 1700, 0, 0.55); chain(o, gainEnv(ctx, [[0, 0.0001], [0.05, 0.35], [0.5, 0.3], [0.65, 0.001]]), out); o.start(0); o.stop(0.7);
    const n = noise(ctx, 0.6); const bp = filt(ctx, 'bandpass', 800, 2); sweep(bp.frequency, 600, 5000, 0, 0.55); chain(n, bp, gainEnv(ctx, [[0, 0.0001], [0.1, 0.3], [0.6, 0.001]]), out); n.start(0);
  } },
  // ---- impacts ----
  impact_concrete: { dur: 0.15, build: (ctx, out) => { const n = noise(ctx, 0.12); chain(n, filt(ctx, 'bandpass', 2600, 0.8), gainEnv(ctx, [[0, 0.8], [0.09, 0.001]]), out); n.start(0); } },
  impact_metal: { dur: 0.35, build: (ctx, out) => {
    const n = noise(ctx, 0.05); chain(n, filt(ctx, 'highpass', 3000, 1), gainEnv(ctx, [[0, 0.7], [0.03, 0.001]]), out); n.start(0);
    [3100, 5200, 7300].forEach((f, i) => { const o = osc(ctx, 'sine', f * (0.98 + Math.random() * 0.04)); chain(o, gainEnv(ctx, [[0, 0.25 / (i + 1)], [0.25, 0.001]]), out); o.start(0); o.stop(0.3); });
  } },
  impact_wood: { dur: 0.15, build: (ctx, out) => { const n = noise(ctx, 0.12); chain(n, filt(ctx, 'lowpass', 1400, 1), gainEnv(ctx, [[0, 0.9], [0.08, 0.001]]), out); n.start(0); } },
  impact_flesh: { dur: 0.2, build: (ctx, out) => { const n = noise(ctx, 0.15); chain(n, filt(ctx, 'lowpass', 700, 1), gainEnv(ctx, [[0, 1], [0.12, 0.001]]), out); n.start(0); const o = osc(ctx, 'sine', 120); chain(o, gainEnv(ctx, [[0, 0.5], [0.08, 0.001]]), out); o.start(0); o.stop(0.1); } },
  impact_glass: { dur: 0.4, build: (ctx, out) => { const n = noise(ctx, 0.3); chain(n, filt(ctx, 'highpass', 4000, 1), gainEnv(ctx, [[0, 0.8], [0.25, 0.001]]), out); n.start(0); [6200, 8100].forEach(f => { const o = osc(ctx, 'sine', f); chain(o, gainEnv(ctx, [[0, 0.15], [0.3, 0.001]]), out); o.start(0); o.stop(0.35); }); } },
  // ---- feedback ----
  hit: { dur: 0.08, build: (ctx, out) => { [1500, 1500].forEach((f, i) => { const o = osc(ctx, 'sine', f); chain(o, gainEnv(ctx, [[i * 0.03, 0.4], [i * 0.03 + 0.025, 0.001]]), out); o.start(i * 0.03); o.stop(i * 0.03 + 0.03); }); } },
  headshot: { dur: 0.12, build: (ctx, out) => { const n = noise(ctx, 0.06); chain(n, filt(ctx, 'bandpass', 1800, 1.5), gainEnv(ctx, [[0, 0.8], [0.05, 0.001]]), out); n.start(0); const o = osc(ctx, 'sine', 2100); chain(o, gainEnv(ctx, [[0.02, 0.5], [0.09, 0.001]]), out); o.start(0.02); o.stop(0.1); } },
  kill: { dur: 0.15, build: (ctx, out) => { [900, 1350].forEach((f, i) => { const o = osc(ctx, 'triangle', f); chain(o, gainEnv(ctx, [[i * 0.05, 0.35], [i * 0.05 + 0.06, 0.001]]), out); o.start(i * 0.05); o.stop(i * 0.05 + 0.07); }); } },
  // ---- zombies ----
  zmoan1: zombieVoice({ f0: 110, f1: 95, dur: 1.1, formants: [520, 1050], noise: 0.25, vibrato: 5 }),
  zmoan2: zombieVoice({ f0: 135, f1: 100, dur: 0.9, formants: [600, 1300], noise: 0.3, vibrato: 7 }),
  zmoan3: zombieVoice({ f0: 95, f1: 120, dur: 1.3, formants: [450, 900], noise: 0.2, vibrato: 4 }),
  zmoan4: zombieVoice({ f0: 150, f1: 110, dur: 0.7, formants: [700, 1400], noise: 0.35, vibrato: 8 }),
  zgrowl: zombieVoice({ f0: 75, f1: 65, dur: 0.6, formants: [350, 800], noise: 0.45, vibrato: 11, sat: 25 }),
  zattack: zombieVoice({ f0: 260, f1: 150, dur: 0.4, formants: [800, 1700], noise: 0.4, vibrato: 12, attack: 0.02, sat: 30, vol: 1.0 }),
  zhurt: zombieVoice({ f0: 200, f1: 140, dur: 0.22, formants: [700, 1500], noise: 0.5, vibrato: 15, attack: 0.01, sat: 20, vol: 0.7 }),
  zdeath: zombieVoice({ f0: 170, f1: 60, dur: 0.85, formants: [500, 1000], noise: 0.5, vibrato: 9, attack: 0.02, sat: 25 }),
  zclimb: zombieVoice({ f0: 120, f1: 140, dur: 0.5, formants: [600, 1200], noise: 0.4, vibrato: 10, sat: 18, vol: 0.6 }),
  scream: zombieVoice({ f0: 420, f1: 300, dur: 0.9, formants: [900, 1900], noise: 0.3, vibrato: 6, attack: 0.05, sat: 15, vol: 0.5 }),
  tear: { dur: 0.35, build: (ctx, out) => { const n = noise(ctx, 0.3); chain(n, filt(ctx, 'lowpass', 900, 1), gainEnv(ctx, [[0, 0.9], [0.05, 0.6], [0.28, 0.001]]), out); n.start(0); const c = noise(ctx, 0.04); chain(c, filt(ctx, 'bandpass', 2000, 1), gainEnv(ctx, [[0.02, 1], [0.05, 0.001]]), out); c.start(0.02); } },
  board: { dur: 0.3, build: (ctx, out) => { [0, 0.09].forEach(t => { const n = noise(ctx, 0.08); chain(n, filt(ctx, 'lowpass', 1500, 1), gainEnv(ctx, [[t, 0.9], [t + 0.07, 0.001]]), out); n.start(t); }); const o = osc(ctx, 'sine', 180); chain(o, gainEnv(ctx, [[0, 0.4], [0.1, 0.001]]), out); o.start(0); o.stop(0.12); } },
  // ---- player ----
  step: { dur: 0.1, build: (ctx, out) => { const n = noise(ctx, 0.08); chain(n, filt(ctx, 'lowpass', 600, 0.8), gainEnv(ctx, [[0, 0.5], [0.06, 0.001]]), out); n.start(0); } },
  step2: { dur: 0.1, build: (ctx, out) => { const n = noise(ctx, 0.08); chain(n, filt(ctx, 'lowpass', 900, 0.8), gainEnv(ctx, [[0, 0.45], [0.05, 0.001]]), out); n.start(0); } },
  land: { dur: 0.15, build: (ctx, out) => { const n = noise(ctx, 0.12); chain(n, filt(ctx, 'lowpass', 500, 0.8), gainEnv(ctx, [[0, 0.8], [0.1, 0.001]]), out); n.start(0); } },
  down: { dur: 1.4, build: (ctx, out) => { [0, 0.5, 1.0].forEach(t => { const o = osc(ctx, 'sine', 55); chain(o, gainEnv(ctx, [[t, 0.0001], [t + 0.02, 1], [t + 0.35, 0.001]]), out); o.start(t); o.stop(t + 0.4); }); const o = osc(ctx, 'sawtooth', 90); sweep(o.frequency, 120, 50, 0, 1.2); chain(o, filt(ctx, 'lowpass', 300, 1), gainEnv(ctx, [[0, 0.3], [1.2, 0.001]]), out); o.start(0); o.stop(1.3); } },
  heartbeat: { dur: 1.0, build: (ctx, out) => { [0, 0.18].forEach((t, i) => { const o = osc(ctx, 'sine', 50); chain(o, gainEnv(ctx, [[t, 0.0001], [t + 0.015, i ? 0.7 : 1], [t + 0.16, 0.001]]), out); o.start(t); o.stop(t + 0.2); }); } },
  revive: chime([523, 659, 784, 1046], 0.3, 'triangle', 0.35, 0.1),
  // ---- rounds ----
  round_start: { dur: 3.0, build: (ctx, out) => {
    const master = ctx.createGain(); master.gain.value = 0.6; master.connect(out);
    reverbTail(ctx, master, out, 1.2, 0.4);
    [55, 82.4, 110].forEach((f, i) => { const o = osc(ctx, i === 2 ? 'sawtooth' : 'sine', f); chain(o, filt(ctx, 'lowpass', 500, 1), gainEnv(ctx, [[0, 0.0001], [0.8, 0.5], [1.8, 0.4], [2.8, 0.001]]), master); o.start(0); o.stop(2.9); });
    const b = osc(ctx, 'sawtooth', 164.8); const b2 = osc(ctx, 'sawtooth', 220); b2.detune.value = 8;
    const bf = filt(ctx, 'lowpass', 900, 2); sweep(bf.frequency, 300, 1800, 0.6, 1.2);
    const be = gainEnv(ctx, [[0.6, 0.0001], [0.9, 0.35], [2.0, 0.25], [2.9, 0.001]]);
    b.connect(bf); b2.connect(bf); bf.connect(be); be.connect(master); b.start(0.6); b2.start(0.6); b.stop(2.95); b2.stop(2.95);
    const n = noise(ctx, 1.2); const nf = filt(ctx, 'bandpass', 400, 0.5); sweep(nf.frequency, 200, 2500, 0, 1.0);
    chain(n, nf, gainEnv(ctx, [[0, 0.0001], [0.5, 0.25], [1.1, 0.001]]), master); n.start(0);
  } },
  round_end: { dur: 2.6, build: (ctx, out) => {
    const master = ctx.createGain(); master.gain.value = 0.35; master.connect(out);
    reverbTail(ctx, master, out, 1.4, 0.5);
    [[0, 659], [0.25, 587], [0.5, 523], [0.9, 392]].forEach(([t, f]) => { const o = osc(ctx, 'sine', f); const o2 = osc(ctx, 'triangle', f * 2); const g2 = ctx.createGain(); g2.gain.value = 0.2; const env = gainEnv(ctx, [[t, 0.0001], [t + 0.02, 1], [t + 0.8, 0.2], [t + 1.4, 0.001]]); o.connect(env); o2.connect(g2); g2.connect(env); env.connect(master); o.start(t); o2.start(t); o.stop(t + 1.5); o2.stop(t + 1.5); });
  } },
  // ---- mystery box ----
  box_open: { dur: 0.9, build: (ctx, out) => { const o = osc(ctx, 'sawtooth', 320); sweep(o.frequency, 320, 180, 0, 0.6); chain(o, filt(ctx, 'lowpass', 700, 3), gainEnv(ctx, [[0, 0.0001], [0.05, 0.2], [0.6, 0.15], [0.8, 0.001]]), out); o.start(0); o.stop(0.85); const c = noise(ctx, 0.06); chain(c, filt(ctx, 'lowpass', 1200, 1), gainEnv(ctx, [[0, 0.6], [0.05, 0.001]]), out); c.start(0); } },
  box_tick: { dur: 0.08, build: (ctx, out) => { const o = osc(ctx, 'square', 1600); chain(o, gainEnv(ctx, [[0, 0.12], [0.04, 0.001]]), out); o.start(0); o.stop(0.05); const n = noise(ctx, 0.03); chain(n, filt(ctx, 'highpass', 4000, 1), gainEnv(ctx, [[0, 0.3], [0.02, 0.001]]), out); n.start(0); } },
  box_music: { dur: 3.4, build: (ctx, out) => {
    const master = ctx.createGain(); master.gain.value = 0.28; master.connect(out);
    reverbTail(ctx, master, out, 0.9, 0.35);
    const seq = [523, 659, 784, 1046, 784, 659, 523, 440, 523, 659, 784, 1046, 1318, 1046, 784, 659, 523, 440, 392, 440, 523, 659, 784, 1046];
    seq.forEach((f, i) => { const t = i * 0.13; const o = osc(ctx, 'square', f); const o2 = osc(ctx, 'sine', f * 0.5); const g2 = ctx.createGain(); g2.gain.value = 0.5; const env = gainEnv(ctx, [[t, 0.0001], [t + 0.01, 0.35], [t + 0.11, 0.001]]); o.connect(env); o2.connect(g2); g2.connect(env); env.connect(master); o.start(t); o2.start(t); o.stop(t + 0.13); o2.stop(t + 0.13); });
  } },
  box_done: chime([784, 988, 1175, 1568], 0.4, 'triangle', 0.4, 0.09),
  bear: { dur: 2.2, build: (ctx, out) => {
    const master = ctx.createGain(); master.gain.value = 0.45; master.connect(out);
    reverbTail(ctx, master, out, 1.6, 0.6);
    // creepy descending giggle: staircase pitch
    const steps = [880, 830, 780, 700, 660, 590, 520, 470, 420];
    steps.forEach((f, i) => { const t = i * 0.16; const o = osc(ctx, 'sine', f); const o2 = osc(ctx, 'triangle', f * 1.5); const g2 = ctx.createGain(); g2.gain.value = 0.3; const lfo = osc(ctx, 'sine', 18); const lg = ctx.createGain(); lg.gain.value = 25; lfo.connect(lg); lg.connect(o.frequency); const env = gainEnv(ctx, [[t, 0.0001], [t + 0.02, 1], [t + 0.12, 0.6], [t + 0.15, 0.001]]); o.connect(env); o2.connect(g2); g2.connect(env); env.connect(master); o.start(t); o2.start(t); lfo.start(t); o.stop(t + 0.16); o2.stop(t + 0.16); lfo.stop(t + 0.16); });
    const d = osc(ctx, 'sine', 70); chain(d, gainEnv(ctx, [[0, 0.0001], [0.5, 0.4], [1.8, 0.001]]), master); d.start(0); d.stop(1.9);
  } },
  box_vanish: { dur: 1.3, build: (ctx, out) => { const n = noise(ctx, 1.2); const f = filt(ctx, 'lowpass', 200, 1); sweep(f.frequency, 150, 6000, 0, 1.1); chain(n, f, gainEnv(ctx, [[0, 0.0001], [0.9, 0.6], [1.15, 0.001]]), out); n.start(0); } },
  // ---- powerups ----
  powerup_spawn: chime([1046, 1318, 1568, 2093], 0.2, 'sine', 0.3, 0.07),
  powerup: { dur: 1.3, build: (ctx, out) => {
    const master = ctx.createGain(); master.gain.value = 0.5; master.connect(out); reverbTail(ctx, master, out, 0.8, 0.4);
    [440, 554, 659, 880].forEach((f) => { const o = osc(ctx, 'sawtooth', f); chain(o, filt(ctx, 'lowpass', 2500, 1), gainEnv(ctx, [[0, 0.0001], [0.03, 0.25], [0.6, 0.15], [1.0, 0.001]]), master); o.start(0); o.stop(1.1); });
    const n = noise(ctx, 0.6); const nf = filt(ctx, 'bandpass', 800, 1); sweep(nf.frequency, 400, 4000, 0, 0.5); chain(n, nf, gainEnv(ctx, [[0, 0.3], [0.5, 0.001]]), master); n.start(0);
  } },
  resupply: multi([[0, click(0, 0.08, 0.8, 800)], [0.1, click(0, 0.05, 0.6, 2500)], [0.2, chime([784, 1046, 1318], 0.3, 'triangle', 0.4, 0.08)]], 1.2),
  oneshot: { dur: 1.2, build: (ctx, out) => { const o = osc(ctx, 'sawtooth', 110); sweep(o.frequency, 220, 55, 0, 0.8); chain(o, filt(ctx, 'lowpass', 600, 2), dist(ctx, 20), gainEnv(ctx, [[0, 0.0001], [0.03, 0.6], [0.9, 0.001]]), out); o.start(0); o.stop(1.0); const n = noise(ctx, 0.3); chain(n, filt(ctx, 'lowpass', 800, 1), gainEnv(ctx, [[0, 0.7], [0.25, 0.001]]), out); n.start(0); } },
  double: chime([659, 784, 988, 1318, 1568], 0.3, 'square', 0.22, 0.08),
  blast: { dur: 2.0, build: (ctx, out) => {
    const n = noise(ctx, 1.8); const f = filt(ctx, 'lowpass', 1200, 0.8); sweep(f.frequency, 1500, 80, 0, 1.5);
    chain(n, f, dist(ctx, 15), gainEnv(ctx, [[0, 1.2], [0.1, 1.0], [1.6, 0.001]]), out); n.start(0);
    const o = osc(ctx, 'sine', 45); sweep(o.frequency, 70, 30, 0, 1.2); chain(o, gainEnv(ctx, [[0, 1], [1.2, 0.001]]), out); o.start(0); o.stop(1.3);
  } },
  explosion: { dur: 1.6, build: (ctx, out) => {
    const c = noise(ctx, 0.08); chain(c, filt(ctx, 'highpass', 1500, 1), gainEnv(ctx, [[0, 1], [0.06, 0.001]]), out); c.start(0);
    const n = noise(ctx, 1.4); const f = filt(ctx, 'lowpass', 900, 0.8); sweep(f.frequency, 1200, 90, 0, 1.1);
    chain(n, f, dist(ctx, 12), gainEnv(ctx, [[0, 1.1], [0.08, 0.9], [1.2, 0.001]]), out); n.start(0);
    const o = osc(ctx, 'sine', 50); sweep(o.frequency, 80, 32, 0, 0.7); chain(o, gainEnv(ctx, [[0, 1], [0.7, 0.001]]), out); o.start(0); o.stop(0.75);
  } },
  arc_hit: { dur: 0.3, build: (ctx, out) => { const n = noise(ctx, 0.25); const bp = filt(ctx, 'bandpass', 2500, 2); sweep(bp.frequency, 5000, 800, 0, 0.2); chain(n, bp, gainEnv(ctx, [[0, 0.7], [0.22, 0.001]]), out); n.start(0); } },
  // ---- UI / purchases ----
  ui_click: { dur: 0.06, build: (ctx, out) => { const o = osc(ctx, 'square', 1200); chain(o, gainEnv(ctx, [[0, 0.15], [0.04, 0.001]]), out); o.start(0); o.stop(0.05); } },
  ui_hover: { dur: 0.04, build: (ctx, out) => { const o = osc(ctx, 'sine', 900); chain(o, gainEnv(ctx, [[0, 0.08], [0.03, 0.001]]), out); o.start(0); o.stop(0.035); } },
  buy: { dur: 0.5, build: (ctx, out) => { [[0, 1046], [0.06, 1568]].forEach(([t, f]) => { const o = osc(ctx, 'sine', f); chain(o, gainEnv(ctx, [[t, 0.35], [t + 0.05, 0.001]]), out); o.start(t); o.stop(t + 0.06); }); const o = osc(ctx, 'sine', 2637); chain(o, gainEnv(ctx, [[0.12, 0.2], [0.45, 0.001]]), out); o.start(0.12); o.stop(0.5); } },
  door: { dur: 1.0, build: (ctx, out) => { const o = osc(ctx, 'sawtooth', 260); sweep(o.frequency, 240, 170, 0, 0.7); chain(o, filt(ctx, 'lowpass', 600, 4), gainEnv(ctx, [[0, 0.0001], [0.1, 0.2], [0.7, 0.12], [0.9, 0.001]]), out); o.start(0); o.stop(0.95); [0, 0.15, 0.3, 0.5].forEach(t => { const n = noise(ctx, 0.06); chain(n, filt(ctx, 'bandpass', 3500, 2), gainEnv(ctx, [[t, 0.35], [t + 0.05, 0.001]]), out); n.start(t); }); } },
  nopoints: { dur: 0.25, build: (ctx, out) => { const o = osc(ctx, 'square', 130); chain(o, filt(ctx, 'lowpass', 800, 1), gainEnv(ctx, [[0, 0.25], [0.18, 0.2], [0.22, 0.001]]), out); o.start(0); o.stop(0.23); } },
  weapon_pickup: multi([[0, click(0, 0.05, 0.6, 2000)], [0.08, click(0, 0.08, 0.5, 900)]], 0.3),
  // ---- ambience loops ----
  wind: { dur: 6.0, build: (ctx, out) => { const n = noise(ctx, 6, 'pink'); const f = filt(ctx, 'lowpass', 350, 0.5); const lfo = osc(ctx, 'sine', 0.17); const lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(f.frequency); lfo.start(0); const g = ctx.createGain(); g.gain.value = 0.7; chain(n, f, g, out); n.start(0); } },
  fire: { dur: 3.0, build: (ctx, out) => { const n = noise(ctx, 3, 'pink'); chain(n, filt(ctx, 'bandpass', 700, 0.6), (() => { const g = ctx.createGain(); g.gain.value = 0.5; return g; })(), out); n.start(0); for (let i = 0; i < 26; i++) { const t = Math.random() * 2.9; const c = noise(ctx, 0.03); chain(c, filt(ctx, 'highpass', 1500 + Math.random() * 3000, 1), gainEnv(ctx, [[t, 0.3 + Math.random() * 0.5], [t + 0.02, 0.001]]), out); c.start(t); } } },
};

// ---------------- engine ----------------
class AudioEngine {
  constructor() {
    this.ctx = null; this.buffers = new Map(); this.ready = false; this.initPromise = null;
    this.master = null; this.buses = {};
    this.listener = { x: 0, y: 0, z: 0 };
    this.volumes = { master: 0.8, sfx: 1, ambient: 0.6, ui: 0.6 };
    this.loops = new Set();
    this.activeVoices = 0;
  }

  async init(volumes) {
    if (this.initPromise) return this.initPromise;
    if (volumes) this.volumes = { ...this.volumes, ...volumes };
    this.initPromise = (async () => {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive', sampleRate: SR });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      for (const b of ['sfx', 'ambient', 'ui']) { const g = this.ctx.createGain(); g.connect(this.master); this.buses[b] = g; }
      this.applyVolumes();
      const l = this.ctx.listener;
      if (l.positionX) { l.positionX.value = 0; l.positionY.value = 0; l.positionZ.value = 0; }
      const names = Object.keys(DEFS);
      await Promise.all(names.map(async (name) => {
        try { this.buffers.set(name, await this._render(DEFS[name])); }
        catch (e) { console.warn('audio render failed', name, e); }
      }));
      this.ready = true;
    })();
    return this.initPromise;
  }

  async _render(def) {
    const ctx = new OfflineAudioContext(1, Math.ceil(def.dur * SR), SR);
    def.build(ctx, ctx.destination);
    return ctx.startRendering();
  }

  applyVolumes() {
    if (!this.master) return;
    this.master.gain.value = this.volumes.master;
    this.buses.sfx.gain.value = this.volumes.sfx;
    this.buses.ambient.gain.value = this.volumes.ambient;
    this.buses.ui.gain.value = this.volumes.ui;
  }
  setVolumes(v) { this.volumes = { ...this.volumes, ...v }; this.applyVolumes(); }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setListener(x, y, z, fx, fy, fz) {
    if (!this.ctx) return;
    this.listener.x = x; this.listener.y = y; this.listener.z = z;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(x, t); l.positionY.setValueAtTime(y, t); l.positionZ.setValueAtTime(z, t);
      l.forwardX.setValueAtTime(fx, t); l.forwardY.setValueAtTime(fy, t); l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else { l.setPosition(x, y, z); l.setOrientation(fx, fy, fz, 0, 1, 0); }
  }

  /**
   * Play a sound. opts: { vol, pitch, pos:[x,y,z], ref, max, bus, loop, rolloff }
   * Returns a handle { stop(), setPosition(x,y,z), node } or null.
   */
  play(name, opts = {}) {
    if (!this.ready) return null;
    const buf = this.buffers.get(name);
    if (!buf) return null;
    if (this.activeVoices > 48 && !opts.loop && !opts.important) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.pitch || 1;
    src.loop = !!opts.loop;
    const gain = ctx.createGain();
    gain.gain.value = opts.vol ?? 1;
    let last = gain;
    src.connect(gain);
    let panner = null;
    if (opts.pos) {
      panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = opts.ref ?? 2.5;
      panner.maxDistance = opts.max ?? 80;
      panner.rolloffFactor = opts.rolloff ?? 1.1;
      const p = opts.pos;
      if (panner.positionX) { panner.positionX.value = p[0]; panner.positionY.value = p[1]; panner.positionZ.value = p[2]; }
      else panner.setPosition(p[0], p[1], p[2]);
      gain.connect(panner); last = panner;
    }
    last.connect(this.buses[opts.bus || 'sfx']);
    src.start(0, opts.offset || 0);
    this.activeVoices++;
    const handle = {
      node: src, gain, panner, done: false,
      stop(fade = 0.05) {
        if (this.done) return; this.done = true;
        try { const t = ctx.currentTime; gain.gain.setValueAtTime(gain.gain.value, t); gain.gain.linearRampToValueAtTime(0.0001, t + fade); src.stop(t + fade + 0.01); } catch (e) { /* ignore */ }
      },
      setPosition(x, y, z) {
        if (!panner) return;
        if (panner.positionX) { panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z; }
        else panner.setPosition(x, y, z);
      },
      setVolume(v) { gain.gain.value = v; },
    };
    src.onended = () => { this.activeVoices--; handle.done = true; if (opts.loop) this.loops.delete(handle); };
    if (opts.loop) this.loops.add(handle);
    return handle;
  }

  stopAllLoops() { for (const h of this.loops) h.stop(0.2); this.loops.clear(); }
}

export const audio = new AudioEngine();
export const SOUND_NAMES = Object.keys(DEFS);
