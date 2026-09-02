// Procedural PBR texture generation (albedo, normal from height, ORM). No image files are used.
/* global BABYLON */

// ---------------- noise ----------------
const PERM = new Uint8Array(512);
(() => { const p = []; for (let i = 0; i < 256; i++) p[i] = i; let s = 1234567; for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; })();
function hash2(x, y) { return PERM[(PERM[x & 255] + y) & 255] / 255; }
function smooth(t) { return t * t * (3 - 2 * t); }
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}
export function fbm(x, y, oct = 4, lac = 2.0, gain = 0.5) {
  let s = 0, a = 1, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, y * f) * a; norm += a; a *= gain; f *= lac; }
  return s / norm;
}
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { return a + (b - a) * t; }

// ---------------- generators ----------------
// Each returns { rgba: Uint8ClampedArray, height: Float32Array, rough: Float32Array, metal: number, alpha?: bool, tile: number }
function makeBuffers(n) { return { rgba: new Uint8ClampedArray(n * n * 4), height: new Float32Array(n * n), rough: new Float32Array(n * n) }; }

function bricks(n, opts) {
  const { rgba, height, rough } = makeBuffers(n);
  const base = hexToRgb(opts.color), mortar = hexToRgb(opts.mortar);
  const bw = opts.bw || 8, bh = opts.bh || 24; // bricks per tile
  const r = rnd(opts.seed || 7);
  const bcol = [];
  for (let i = 0; i < 4096; i++) bcol.push(0.75 + r() * 0.5);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n;
    const row = Math.floor(v * bh);
    const off = (row & 1) ? 0.5 : 0;
    const fx = ((u + off / bw) * bw) % 1, fy = (v * bh) % 1;
    const col = Math.floor((u + off / bw) * bw);
    const m = 0.09;
    const inBrick = fx > m && fy > m * 1.3;
    const i = y * n + x;
    const nz = fbm(u * 40, v * 40, 3);
    if (inBrick) {
      const id = (row * 97 + col * 31) & 4095;
      const c = bcol[id];
      const stain = fbm(u * 6 + 3, v * 6, 3);
      const grunge = 0.85 + nz * 0.3;
      rgba[i * 4] = base[0] * c * grunge * (0.8 + stain * 0.4);
      rgba[i * 4 + 1] = base[1] * c * grunge * (0.8 + stain * 0.4);
      rgba[i * 4 + 2] = base[2] * c * grunge * (0.8 + stain * 0.4);
      const edge = Math.min(fx - m, 1 - fx, fy - m * 1.3, 1 - fy);
      height[i] = 0.6 + nz * 0.25 + Math.min(1, edge * 6) * 0.15;
      rough[i] = 0.85 - nz * 0.15;
    } else {
      rgba[i * 4] = mortar[0] * (0.8 + nz * 0.4); rgba[i * 4 + 1] = mortar[1] * (0.8 + nz * 0.4); rgba[i * 4 + 2] = mortar[2] * (0.8 + nz * 0.4);
      height[i] = 0.2 + nz * 0.2; rough[i] = 0.95;
    }
    // soot / damage
    const soot = clamp01((fbm(u * 3, v * 3 + 9, 3) - 0.55) * 3) * (opts.soot || 0.35);
    rgba[i * 4] *= 1 - soot; rgba[i * 4 + 1] *= 1 - soot; rgba[i * 4 + 2] *= 1 - soot;
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, height, rough, metal: 0, tile: 1 };
}

function plaster(n, opts) {
  const { rgba, height, rough } = makeBuffers(n);
  const base = hexToRgb(opts.color);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const nz = fbm(u * 12, v * 12, 4);
    const fine = fbm(u * 90, v * 90, 2);
    let stain = clamp01((fbm(u * 4 + 11, v * 4, 3) - 0.5) * 2.5) * (opts.stain || 0.4);
    // water streaks
    const streak = clamp01((fbm(u * 30, v * 2, 2) - 0.6) * 4) * v * (opts.stain || 0.4);
    let crack = 0;
    if (opts.cracks) { const c = Math.abs(fbm(u * 4, v * 4, 3) - 0.5); const big = fbm(u * 2 + 5, v * 2, 2) > 0.55; crack = (c < 0.0028 && big) ? 1 : 0; }
    const shade = 0.82 + nz * 0.22 + fine * 0.08;
    let rr = base[0] * shade, gg = base[1] * shade, bb = base[2] * shade;
    const d = 1 - stain * 0.5 - streak * 0.5 - crack * 0.6;
    rr *= d; gg *= d * 0.98; bb *= d * 0.95;
    if (opts.stripes) { const s = Math.sin(u * Math.PI * 2 * 12) > 0.3 ? 1 : 0; const sc = hexToRgb(opts.stripes); rr = mix(rr, sc[0] * shade * d, s * 0.5); gg = mix(gg, sc[1] * shade * d, s * 0.5); bb = mix(bb, sc[2] * shade * d, s * 0.5); }
    rgba[i * 4] = rr; rgba[i * 4 + 1] = gg; rgba[i * 4 + 2] = bb; rgba[i * 4 + 3] = 255;
    height[i] = 0.5 + nz * 0.15 + fine * 0.1 - crack * 0.4;
    rough[i] = 0.9 - fine * 0.1;
  }
  return { rgba, height, rough, metal: 0, tile: 1 };
}

function concrete(n, opts) {
  const { rgba, height, rough } = makeBuffers(n);
  const base = hexToRgb(opts.color);
  const slabs = opts.slabs || 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const nz = fbm(u * 8, v * 8, 4);
    const fine = fbm(u * 120, v * 120, 2);
    const speck = fbm(u * 300, v * 300, 1) > 0.78 ? 0.25 : 0;
    let line = 0;
    if (slabs) { const fu = (u * slabs) % 1, fv = (v * slabs) % 1; if (fu < 0.02 || fv < 0.02) line = 1; }
    let crack = 0;
    if (opts.cracks) { const c = Math.abs(fbm(u * 6 + 5, v * 6, 3) - 0.5); crack = c < 0.004 * opts.cracks ? 1 : 0; }
    const stain = clamp01((fbm(u * 3 + 7, v * 3 + 2, 3) - 0.5) * 2) * 0.35;
    const shade = (0.78 + nz * 0.3 + fine * 0.1) * (1 - line * 0.5 - crack * 0.6 - stain) + speck;
    rgba[i * 4] = base[0] * shade; rgba[i * 4 + 1] = base[1] * shade; rgba[i * 4 + 2] = base[2] * shade * 0.98; rgba[i * 4 + 3] = 255;
    height[i] = 0.5 + nz * 0.1 + fine * 0.12 - line * 0.5 - crack * 0.5;
    rough[i] = 0.9 - fine * 0.1;
  }
  return { rgba, height, rough, metal: 0, tile: 1 };
}

function asphalt(n, opts) {
  const { rgba, height, rough } = makeBuffers(n);
  const base = hexToRgb(opts.color);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const grain = fbm(u * 200, v * 200, 2);
    const nz = fbm(u * 6, v * 6, 4);
    const patch = clamp01((fbm(u * 2.5 + 3, v * 2.5 + 8, 3) - 0.5) * 3) * 0.25;
    let crack = 0;
    const c = Math.abs(fbm(u * 5 + 1, v * 5 + 4, 4) - 0.5);
    if (c < 0.0035 * (opts.cracks || 1)) crack = 1;
    const wet = opts.wet ? clamp01((fbm(u * 3, v * 3 + 20, 3) - 0.55) * 4) : 0;
    const shade = (0.7 + grain * 0.45 + nz * 0.25) * (1 - patch) * (1 - crack * 0.6) * (1 - wet * 0.35);
    rgba[i * 4] = base[0] * shade; rgba[i * 4 + 1] = base[1] * shade; rgba[i * 4 + 2] = base[2] * shade * 1.02; rgba[i * 4 + 3] = 255;
    height[i] = 0.5 + grain * 0.2 + nz * 0.1 - crack * 0.5;
    rough[i] = 0.92 - wet * 0.6 - grain * 0.05;
  }
  return { rgba, height, rough, metal: 0, tile: 1 };
}

function planks(n, opts) {
  const { rgba, height, rough } = makeBuffers(n);
  const base = hexToRgb(opts.color);
  const count = opts.count || 6;
  const r = rnd(opts.seed || 3);
  const pc = []; for (let i = 0; i < 64; i++) pc.push(0.7 + r() * 0.6);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const pIdx = Math.floor(v * count);
    const off = (pIdx * 0.37) % 1;
    const fu = (u + off) % 1, fv = (v * count) % 1;
    const gap = fv < 0.03 || (fu < 0.01);
    const grain = fbm(u * 3 + pIdx * 5, v * 120, 3);
    const knots = clamp01((fbm(u * 10 + pIdx, v * 40, 3) - 0.62) * 8);
    const c = pc[pIdx & 63];
    const shade = gap ? 0.25 : (0.75 + grain * 0.35) * c * (1 - knots * 0.4);
    const wear = clamp01((fbm(u * 4, v * 4 + 3, 3) - 0.5) * 2) * (opts.wear || 0.3);
    rgba[i * 4] = base[0] * shade * (1 - wear * 0.3); rgba[i * 4 + 1] = base[1] * shade * (1 - wear * 0.35); rgba[i * 4 + 2] = base[2] * shade * (1 - wear * 0.4); rgba[i * 4 + 3] = 255;
    height[i] = gap ? 0.2 : 0.55 + grain * 0.12 - knots * 0.1;
    rough[i] = 0.75 + wear * 0.2;
  }
  return { rgba, height, rough, metal: 0, tile: 1 };
}

function tiles(n, opts) {
  const { rgba, height, rough } = makeBuffers(n);
  const a = hexToRgb(opts.color), b = hexToRgb(opts.color2 || opts.color);
  const count = opts.count || 8;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const tx = Math.floor(u * count), ty = Math.floor(v * count);
    const fu = (u * count) % 1, fv = (v * count) % 1;
    const grout = fu < 0.04 || fv < 0.04;
    const checker = (tx + ty) & 1;
    const col = checker ? b : a;
    const nz = fbm(u * 30, v * 30, 3);
    const dirt = clamp01((fbm(u * 3 + 2, v * 3 + 5, 3) - 0.5) * 2.5) * (opts.dirt || 0.4);
    const chip = fbm(u * 50 + tx, v * 50 + ty, 2) > 0.8 && !grout ? 0.5 : 0;
    const shade = grout ? 0.35 : (0.85 + nz * 0.15) * (1 - dirt) * (1 - chip);
    rgba[i * 4] = col[0] * shade; rgba[i * 4 + 1] = col[1] * shade; rgba[i * 4 + 2] = col[2] * shade; rgba[i * 4 + 3] = 255;
    height[i] = grout ? 0.3 : 0.6 - chip * 0.3;
    rough[i] = grout ? 0.95 : 0.35 + dirt * 0.5 + chip * 0.4;
  }
  return { rgba, height, rough, metal: 0, tile: 1 };
}

function metal(n, opts) {
  const { rgba, height, rough } = makeBuffers(n);
  const base = hexToRgb(opts.color), rustC = [122, 62, 30];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const nz = fbm(u * 10, v * 10, 3);
    const sc = opts.scratch ?? 1;
    const scratch = (clamp01((fbm(u * 2, v * 150, 2) - 0.62) * 6) * 0.35 + clamp01((fbm(u * 140, v * 2 + 3, 2) - 0.66) * 6) * 0.25) * sc;
    const rust = clamp01((fbm(u * 5 + 4, v * 5 + 1, 4) - (1 - (opts.rust || 0.2))) * 3);
    let corr = 0;
    if (opts.corrugated) corr = Math.sin(u * Math.PI * 2 * opts.corrugated) * 0.5 + 0.5;
    let panel = 0;
    if (opts.panels) { const fu = (u * opts.panels) % 1, fv = (v * opts.panels) % 1; if (fu < 0.015 || fv < 0.015) panel = 1; }
    const shade = (0.8 + nz * 0.25 + scratch) * (1 - panel * 0.5) * (1 - corr * 0.12);
    let rr = base[0] * shade, gg = base[1] * shade, bb = base[2] * shade;
    rr = mix(rr, rustC[0] * (0.7 + nz * 0.5), rust); gg = mix(gg, rustC[1] * (0.7 + nz * 0.5), rust); bb = mix(bb, rustC[2] * (0.7 + nz * 0.5), rust);
    rgba[i * 4] = rr; rgba[i * 4 + 1] = gg; rgba[i * 4 + 2] = bb; rgba[i * 4 + 3] = 255;
    height[i] = 0.5 + corr * 0.3 - panel * 0.3 + nz * 0.05 - rust * 0.1 + scratch * 0.05;
    rough[i] = mix(opts.rough ?? 0.45, 0.9, rust) + scratch * 0.2;
  }
  return { rgba, height, rough, metal: 1 - (opts.rust || 0.2) * 0.5, metalMap: true, rustMask: null, tile: 1 };
}

function rubble(n, opts) {
  const { rgba, height, rough } = makeBuffers(n);
  const base = hexToRgb(opts.color);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const chunks = fbm(u * 18, v * 18, 2);
    const cell = Math.floor(chunks * 14) / 14; // pseudo-cells
    const nz = fbm(u * 60, v * 60, 3);
    const big = fbm(u * 4, v * 4, 3);
    const shade = (0.55 + cell * 0.5 + nz * 0.25) * (0.75 + big * 0.4);
    const tint = fbm(u * 7 + 3, v * 7, 2);
    rgba[i * 4] = base[0] * shade * (0.9 + tint * 0.2); rgba[i * 4 + 1] = base[1] * shade; rgba[i * 4 + 2] = base[2] * shade * (1.05 - tint * 0.1); rgba[i * 4 + 3] = 255;
    height[i] = cell * 0.7 + nz * 0.3;
    rough[i] = 0.9;
  }
  return { rgba, height, rough, metal: 0, tile: 1 };
}

function fabric(n, opts) {
  const { rgba, height, rough } = makeBuffers(n);
  const base = hexToRgb(opts.color);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const weave = (Math.sin(u * Math.PI * 2 * 180) * Math.sin(v * Math.PI * 2 * 180)) * 0.5 + 0.5;
    const nz = fbm(u * 8, v * 8, 3);
    const stain = clamp01((fbm(u * 3 + 9, v * 3, 3) - 0.55) * 3) * (opts.stain || 0.3);
    const seam = opts.seams ? (((v * opts.seams) % 1) < 0.03 ? 0.5 : 0) : 0;
    const shade = (0.8 + weave * 0.15 + nz * 0.2) * (1 - stain * 0.6) * (1 - seam);
    rgba[i * 4] = base[0] * shade; rgba[i * 4 + 1] = base[1] * shade; rgba[i * 4 + 2] = base[2] * shade; rgba[i * 4 + 3] = 255;
    height[i] = 0.5 + weave * 0.1 + nz * 0.1 - seam * 0.3;
    rough[i] = 0.95;
  }
  return { rgba, height, rough, metal: 0, tile: 1 };
}

function chainlink(n) {
  const { rgba, height, rough } = makeBuffers(n);
  const cells = 10;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    // diamond lattice: distance to lines u+v = k/cells and u-v = k/cells
    const a = ((u + v) * cells) % 1, b = ((u - v + 4) * cells) % 1;
    const da = Math.min(a, 1 - a), db = Math.min(b, 1 - b);
    const wire = Math.min(da, db) < 0.055;
    const shade = 0.55 + fbm(u * 40, v * 40, 2) * 0.4;
    rgba[i * 4] = 150 * shade; rgba[i * 4 + 1] = 150 * shade; rgba[i * 4 + 2] = 145 * shade; rgba[i * 4 + 3] = wire ? 255 : 0;
    height[i] = wire ? 0.8 : 0.2; rough[i] = 0.5;
  }
  return { rgba, height, rough, metal: 0.7, alpha: true, tile: 1 };
}

function glass(n) {
  const { rgba, height, rough } = makeBuffers(n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const dirt = clamp01((fbm(u * 5, v * 5, 3) - 0.45) * 1.5);
    const c = Math.abs(fbm(u * 4 + 8, v * 4 + 2, 4) - 0.5);
    const crack = c < 0.003 ? 1 : 0;
    rgba[i * 4] = 180 + crack * 60; rgba[i * 4 + 1] = 200 + crack * 40; rgba[i * 4 + 2] = 215 + crack * 30; rgba[i * 4 + 3] = 40 + dirt * 90 + crack * 180;
    height[i] = 0.5 - crack * 0.3; rough[i] = 0.08 + dirt * 0.5;
  }
  return { rgba, height, rough, metal: 0, alpha: true, tile: 1 };
}

function skin(n, opts) {
  const { rgba, height, rough } = makeBuffers(n);
  const base = hexToRgb(opts.color), dark = hexToRgb(opts.dark || '#5a6650'), blood = [110, 20, 18];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const mottle = fbm(u * 9, v * 9, 4);
    const veins = clamp01((Math.abs(fbm(u * 7 + 3, v * 7, 4) - 0.5) < 0.008) ? 0.8 : 0);
    const rot = clamp01((fbm(u * 4 + 12, v * 4 + 7, 3) - 0.56) * 4);
    const wound = clamp01((fbm(u * 6 + 22, v * 6 + 11, 3) - 0.66) * 6) * (opts.wounds ?? 1);
    let rr = mix(base[0], dark[0], rot) * (0.85 + mottle * 0.3), gg = mix(base[1], dark[1], rot) * (0.85 + mottle * 0.3), bb = mix(base[2], dark[2], rot) * (0.85 + mottle * 0.3);
    rr = mix(rr, 60, veins * 0.5); gg = mix(gg, 40, veins * 0.5); bb = mix(bb, 80, veins * 0.5);
    rr = mix(rr, blood[0], wound); gg = mix(gg, blood[1], wound); bb = mix(bb, blood[2], wound);
    rgba[i * 4] = rr; rgba[i * 4 + 1] = gg; rgba[i * 4 + 2] = bb; rgba[i * 4 + 3] = 255;
    height[i] = 0.5 + mottle * 0.1 - wound * 0.3;
    rough[i] = 0.55 + rot * 0.3 - wound * 0.3;
  }
  return { rgba, height, rough, metal: 0, tile: 1 };
}

// ---------------- decals & particles (RGBA with alpha, canvas 2D) ----------------
function canvasTex(n, draw) {
  const c = document.createElement('canvas'); c.width = n; c.height = n;
  const ctx = c.getContext('2d');
  draw(ctx, n);
  return c;
}
export function softCircleCanvas(n = 128, inner = 0.0, color = '255,255,255') {
  return canvasTex(n, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, s * inner, s / 2, s / 2, s / 2);
    g.addColorStop(0, `rgba(${color},1)`); g.addColorStop(0.5, `rgba(${color},0.45)`); g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  });
}
export function smokeCanvas(n = 128) {
  return canvasTex(n, (ctx, s) => {
    const img = ctx.createImageData(s, s); const d = img.data;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = x / s - 0.5, dy = y / s - 0.5; const r = Math.hypot(dx, dy) * 2;
      const nz = fbm(x / s * 6, y / s * 6, 3);
      const a = clamp01((1 - r) * 1.4 * (0.5 + nz * 0.8)) * clamp01((1 - r) * 3);
      const i = (y * s + x) * 4; d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = a * 255;
    }
    ctx.putImageData(img, 0, 0);
  });
}
export function bulletHoleCanvas(n = 64) {
  return canvasTex(n, (ctx, s) => {
    const img = ctx.createImageData(s, s); const d = img.data;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = x / s - 0.5, dy = y / s - 0.5; const r = Math.hypot(dx, dy) * 2 * (0.9 + fbm(x / 6, y / 6, 2) * 0.3);
      const core = clamp01(1 - r * 3.2);
      const ring = clamp01((1 - r) * 1.2) * (1 - core);
      const i = (y * s + x) * 4;
      const v = 25 + ring * 90;
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = clamp01(core * 1.5 + ring * 0.8) * 255;
    }
    ctx.putImageData(img, 0, 0);
  });
}
export function bloodSplatCanvas(n = 128, seed = 1) {
  return canvasTex(n, (ctx, s) => {
    const img = ctx.createImageData(s, s); const d = img.data;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = x / s - 0.5, dy = y / s - 0.5;
      const ang = Math.atan2(dy, dx);
      const rr = Math.hypot(dx, dy) * 2;
      const edge = 0.55 + fbm(Math.cos(ang) * 3 + seed * 7, Math.sin(ang) * 3, 3) * 0.7;
      const drops = fbm(x / s * 12 + seed, y / s * 12, 2) > 0.7 && rr < 1 ? 1 : 0;
      const a = rr < edge ? clamp01((edge - rr) * 6) : drops * clamp01(1.2 - rr);
      const i = (y * s + x) * 4;
      const dark = fbm(x / s * 20, y / s * 20, 2);
      d[i] = 70 + dark * 40; d[i + 1] = 6; d[i + 2] = 8; d[i + 3] = a * 235;
    }
    ctx.putImageData(img, 0, 0);
  });
}
export function scorchCanvas(n = 128) {
  return canvasTex(n, (ctx, s) => {
    const img = ctx.createImageData(s, s); const d = img.data;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = x / s - 0.5, dy = y / s - 0.5; const r = Math.hypot(dx, dy) * 2;
      const nz = fbm(x / s * 8, y / s * 8, 3);
      const a = clamp01((1 - r) * (0.8 + nz)) * 0.9;
      const i = (y * s + x) * 4; d[i] = 15; d[i + 1] = 12; d[i + 2] = 10; d[i + 3] = a * 255;
    }
    ctx.putImageData(img, 0, 0);
  });
}
export function flameCanvas(n = 128) {
  return canvasTex(n, (ctx, s) => {
    const img = ctx.createImageData(s, s); const d = img.data;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = x / s - 0.5, dy = y / s - 0.5;
      const r = Math.hypot(dx * 1.3, dy) * 2;
      const nz = fbm(x / s * 5, y / s * 5, 3);
      const a = clamp01((1 - r) * 1.6 * (0.6 + nz * 0.7));
      const i = (y * s + x) * 4;
      d[i] = 255; d[i + 1] = 170 + (1 - r) * 80; d[i + 2] = 60 + (1 - r) * 120; d[i + 3] = a * 255;
    }
    ctx.putImageData(img, 0, 0);
  });
}
export function chalkWeaponCanvas(n, look, name, cost) {
  return canvasTex(n, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(235,235,225,0.95)'; ctx.lineWidth = s * 0.02; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.setLineDash([s * 0.03, s * 0.012]);
    const cx = s * 0.5, cy = s * 0.45;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s / 400, s / 400);
    ctx.beginPath();
    const t = look.type;
    // simple silhouettes per class
    if (t === 'pistol' || t === 'revolver') {
      ctx.moveTo(-90, -20); ctx.lineTo(70, -20); ctx.lineTo(70, 5); ctx.lineTo(-20, 5); ctx.lineTo(-40, 60); ctx.lineTo(-75, 60); ctx.lineTo(-60, 5); ctx.lineTo(-90, 5); ctx.closePath();
      if (t === 'revolver') { ctx.moveTo(-15, -5); ctx.arc(-15, -8, 16, 0, Math.PI * 2); }
    } else if (t === 'shotgun') {
      ctx.moveTo(-160, -12); ctx.lineTo(150, -12); ctx.lineTo(150, 2); ctx.lineTo(0, 2); ctx.lineTo(-10, 40); ctx.lineTo(-40, 40); ctx.lineTo(-35, 6); ctx.lineTo(-110, 6); ctx.lineTo(-160, 40); ctx.closePath();
      ctx.moveTo(40, 2); ctx.lineTo(100, 2); ctx.lineTo(100, 14); ctx.lineTo(40, 14); ctx.closePath();
    } else if (t === 'sniper') {
      ctx.moveTo(-150, -10); ctx.lineTo(170, -10); ctx.lineTo(170, 0); ctx.lineTo(10, 0); ctx.lineTo(-5, 40); ctx.lineTo(-30, 40); ctx.lineTo(-25, 4); ctx.lineTo(-100, 8); ctx.lineTo(-150, 45); ctx.closePath();
      ctx.moveTo(-40, -38); ctx.lineTo(50, -38); ctx.lineTo(50, -12); ctx.lineTo(-40, -12); ctx.closePath();
    } else if (t === 'lmg') {
      ctx.moveTo(-150, -22); ctx.lineTo(160, -22); ctx.lineTo(160, -6); ctx.lineTo(20, -6); ctx.lineTo(10, 40); ctx.lineTo(-25, 40); ctx.lineTo(-20, 0); ctx.lineTo(-100, 0); ctx.lineTo(-150, 40); ctx.closePath();
      ctx.moveTo(30, -6); ctx.lineTo(90, -6); ctx.lineTo(90, 50); ctx.lineTo(30, 50); ctx.closePath();
    } else if (t === 'launcher') {
      ctx.moveTo(-120, -30); ctx.lineTo(150, -30); ctx.lineTo(150, 10); ctx.lineTo(0, 10); ctx.lineTo(-10, 50); ctx.lineTo(-40, 50); ctx.lineTo(-35, 10); ctx.lineTo(-120, 10); ctx.closePath();
    } else if (t === 'energy') {
      ctx.moveTo(-120, -25); ctx.lineTo(120, -25); ctx.lineTo(170, -5); ctx.lineTo(120, 8); ctx.lineTo(0, 8); ctx.lineTo(-10, 50); ctx.lineTo(-40, 50); ctx.lineTo(-35, 8); ctx.lineTo(-120, 8); ctx.closePath();
    } else { // smg / rifle
      const L = t === 'smg' ? 110 : 160;
      ctx.moveTo(-L, -16); ctx.lineTo(L, -16); ctx.lineTo(L, -4); ctx.lineTo(10, -4); ctx.lineTo(0, 44); ctx.lineTo(-30, 44); ctx.lineTo(-25, 0); ctx.lineTo(-90, 0); ctx.lineTo(-L, 40); ctx.closePath();
      ctx.moveTo(20, -4); ctx.lineTo(50, -4); ctx.lineTo(60, 50); ctx.lineTo(30, 50); ctx.closePath();
    }
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(240,240,230,0.95)';
    ctx.font = `bold ${s * 0.075}px Impact, "Arial Narrow", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(name.toUpperCase(), s * 0.5, s * 0.78);
    ctx.font = `bold ${s * 0.065}px Impact, "Arial Narrow", sans-serif`;
    ctx.fillStyle = 'rgba(255,215,90,0.95)';
    ctx.fillText(cost + ' PTS', s * 0.5, s * 0.9);
  });
}

// ---------------- texture set definitions ----------------
const SETS = {
  brick_red: { gen: bricks, o: { color: '#8a3f2f', mortar: '#8f8a80', bw: 6, bh: 18, seed: 3, soot: 0.3 }, scale: 3 },
  brick_dark: { gen: bricks, o: { color: '#6e4a3e', mortar: '#7f7a72', bw: 6, bh: 18, seed: 11, soot: 0.4 }, scale: 3 },
  plaster: { gen: plaster, o: { color: '#b9ad95', stain: 0.5, cracks: true }, scale: 3 },
  plaster_stained: { gen: plaster, o: { color: '#a89b85', stain: 0.8, cracks: true }, scale: 3 },
  wallpaper: { gen: plaster, o: { color: '#9a8f78', stain: 0.5, stripes: '#7c6d5a' }, scale: 3 },
  concrete: { gen: concrete, o: { color: '#8d8a84', cracks: 1.5 }, scale: 4 },
  sidewalk: { gen: concrete, o: { color: '#a29e96', slabs: 2, cracks: 1 }, scale: 4 },
  asphalt: { gen: asphalt, o: { color: '#3d3d40', cracks: 1, wet: true }, scale: 6 },
  asphalt_lot: { gen: asphalt, o: { color: '#454547', cracks: 1.3, wet: false }, scale: 6 },
  asphalt_old: { gen: asphalt, o: { color: '#3a3936', cracks: 2, wet: true }, scale: 5 },
  wood_floor: { gen: planks, o: { color: '#7a5a3c', count: 8, seed: 5, wear: 0.5 }, scale: 3 },
  wood_dark: { gen: planks, o: { color: '#4d3520', count: 5, seed: 9, wear: 0.3 }, scale: 1.5 },
  boards: { gen: planks, o: { color: '#8c6a45', count: 3, seed: 21, wear: 0.4 }, scale: 1 },
  tile_floor: { gen: tiles, o: { color: '#b8b3a4', count: 8, dirt: 0.5 }, scale: 4 },
  tile_checker: { gen: tiles, o: { color: '#d8d4c8', color2: '#2a2a2c', count: 10, dirt: 0.55 }, scale: 4 },
  metal_panel: { gen: metal, o: { color: '#7c8288', rust: 0.35, corrugated: 16, rough: 0.5 }, scale: 3 },
  metal_dark: { gen: metal, o: { color: '#3a3d40', rust: 0.15, rough: 0.5 }, scale: 1 },
  metal_rust: { gen: metal, o: { color: '#6a5a48', rust: 0.7, rough: 0.7 }, scale: 1 },
  metal_green: { gen: metal, o: { color: '#3f6b46', rust: 0.35, panels: 2, rough: 0.55 }, scale: 1 },
  metal_shelf: { gen: metal, o: { color: '#8a8f93', rust: 0.2, panels: 4, rough: 0.45 }, scale: 1.5 },
  metal_counter: { gen: metal, o: { color: '#9aa0a5', rust: 0.1, rough: 0.35 }, scale: 1.5 },
  rubble: { gen: rubble, o: { color: '#8b8579' }, scale: 2 },
  rubble_wall: { gen: rubble, o: { color: '#7d766c' }, scale: 3 },
  rubble_ground: { gen: rubble, o: { color: '#6f6a62' }, scale: 8 },
  dirt: { gen: rubble, o: { color: '#5e4e3c' }, scale: 4 },
  sandbag: { gen: fabric, o: { color: '#8d7d5a', stain: 0.4, seams: 4 }, scale: 1 },
  fabric: { gen: fabric, o: { color: '#6a4a48', stain: 0.5 }, scale: 1 },
  fence: { gen: chainlink, o: {}, scale: 1, alpha: true },
  glass: { gen: glass, o: {}, scale: 1, alpha: true },
  paint_red: { gen: metal, o: { color: '#b0322a', rust: 0.35, rough: 0.4 }, scale: 1 },
  paint_blue: { gen: metal, o: { color: '#2e4c8a', rust: 0.3, rough: 0.4 }, scale: 1 },
  vehicle: { gen: metal, o: { color: '#d0d0d0', rust: 0.18, rough: 0.3, scratch: 0.2 }, scale: 3 },
  zombie_skin: { gen: skin, o: { color: '#b9c0a6', dark: '#6b7358', wounds: 1 }, scale: 1 },
  zombie_cloth: { gen: fabric, o: { color: '#b0b0b0', stain: 0.9 }, scale: 1 },
  player_cloth: { gen: fabric, o: { color: '#c8c8c8', stain: 0.2 }, scale: 1 },
  gunmetal: { gen: metal, o: { color: '#c8c8c8', rust: 0.0, rough: 0.35 }, scale: 1 },
  boxwood: { gen: planks, o: { color: '#6b4a2e', count: 4, seed: 33, wear: 0.5 }, scale: 1 },
};

const SIZE_BY_QUALITY = { low: 256, medium: 512, high: 1024, ultra: 1024 };
export { SETS };
export function generateSet(name, n) {
  const def = SETS[name] || SETS.concrete;
  const g = def.gen(n, def.o || {});
  const orm = new Uint8ClampedArray(n * n * 4);
  const metal = g.metal || 0;
  for (let i = 0; i < n * n; i++) { orm[i * 4] = 255; orm[i * 4 + 1] = clamp01(g.rough[i]) * 255; orm[i * 4 + 2] = metal * 255; orm[i * 4 + 3] = 255; }
  return { rgba: g.rgba, normal: heightToNormal(g.height, n, n / 90), orm, metal, alpha: !!g.alpha, scale: def.scale || 1, n };
}

function heightToNormal(height, n, strength) {
  const out = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const xl = height[y * n + ((x - 1 + n) % n)], xr = height[y * n + ((x + 1) % n)];
    const yu = height[((y - 1 + n) % n) * n + x], yd = height[((y + 1) % n) * n + x];
    const dx = (xr - xl) * strength, dy = (yd - yu) * strength;
    let nx = -dx, ny = -dy, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * n + x) * 4;
    out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}

export class TextureLibrary {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.size = SIZE_BY_QUALITY[quality] || 512;
    this.cache = new Map();
    this.canvasCache = new Map();
  }

  names() { return Object.keys(SETS); }

  _raw(data, n, name, alpha = false) {
    const t = new BABYLON.RawTexture(data, n, n, BABYLON.Engine.TEXTUREFORMAT_RGBA, this.scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    t.name = name;
    t.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE; t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    t.anisotropicFilteringLevel = 8;
    t.hasAlpha = alpha;
    return t;
  }

  sizeFor(name) {
    let n = this.size;
    if (['glass', 'fence', 'gunmetal', 'boxwood', 'boards', 'paint_red', 'paint_blue', 'metal_dark', 'metal_rust', 'zombie_cloth', 'player_cloth', 'fabric', 'sandbag'].includes(name)) n = Math.min(n, 512);
    return n;
  }

  _fromGenerated(name, r) {
    const albedo = this._raw(r.rgba, r.n, name + '_albedo', !!r.alpha);
    const normal = this._raw(r.normal, r.n, name + '_normal');
    const ormT = this._raw(r.orm, r.n, name + '_orm');
    const set = { albedo, normal, orm: ormT, metal: r.metal, scale: r.scale, alpha: !!r.alpha };
    this.cache.set(name, set);
    return set;
  }

  /** Generates (or returns cached) { albedo, normal, orm, metal, scale, alpha } on the main thread. */
  get(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    return this._fromGenerated(name, generateSet(name, this.sizeFor(name)));
  }

  /** Generate all sets in parallel Web Workers. progress(k) in 0..1. Falls back to the main thread. */
  async preload(names, progress) {
    const todo = names.filter(n => !this.cache.has(n));
    if (!todo.length) return;
    const workerCount = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
    let workers = [];
    try {
      const url = new URL('./texWorker.js', import.meta.url);
      for (let i = 0; i < workerCount; i++) workers.push(new Worker(url, { type: 'module' }));
    } catch (e) {
      console.warn('Texture workers unavailable, generating on the main thread', e);
      for (let i = 0; i < todo.length; i++) { this.get(todo[i]); if (progress) progress((i + 1) / todo.length); await new Promise(r => setTimeout(r, 0)); }
      return;
    }
    let done = 0, next = 0;
    const results = new Map();
    await new Promise((resolve) => {
      const feed = (w) => {
        if (next >= todo.length) return;
        const name = todo[next++];
        w.postMessage({ id: name, name, n: this.sizeFor(name) });
      };
      for (const w of workers) {
        w.onmessage = (e) => {
          const { name, r, error } = e.data;
          if (error) { console.warn('texture worker error', name, error); this.get(name); }
          else results.set(name, r);
          done++;
          if (progress) progress(done / todo.length);
          if (done >= todo.length) resolve(); else feed(w);
        };
        w.onerror = (err) => { console.warn('texture worker failed', err.message); for (const nm of todo) if (!this.cache.has(nm) && !results.has(nm)) { this.get(nm); done++; } if (done >= todo.length) resolve(); };
        feed(w);
      }
    });
    for (const w of workers) w.terminate();
    // upload to the GPU on the main thread (spread over a few frames)
    let i = 0;
    for (const [name, r] of results) {
      if (!this.cache.has(name)) this._fromGenerated(name, r);
      if (++i % 6 === 0) await new Promise(res => setTimeout(res, 0));
    }
  }

  /** Canvas-based textures (decals/particles/chalk). */
  fromCanvas(key, canvas, opts = {}) {
    if (this.canvasCache.has(key)) return this.canvasCache.get(key);
    const t = new BABYLON.DynamicTexture(key, canvas, this.scene, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    t.hasAlpha = true;
    if (opts.clamp) { t.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE; t.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; }
    t.update(false);
    this.canvasCache.set(key, t);
    return t;
  }

  dispose() {
    for (const s of this.cache.values()) { s.albedo.dispose(); s.normal.dispose(); s.orm.dispose(); }
    for (const t of this.canvasCache.values()) t.dispose();
    this.cache.clear(); this.canvasCache.clear();
  }
}
