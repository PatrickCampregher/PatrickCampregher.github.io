// Night lighting, sky/environment, shadows, fog and post-processing driven by graphics settings.
/* global BABYLON */
import { haloCanvas, fbm } from './textures.js';

const B = () => BABYLON;

// Sky colours (sRGB, as painted on the dome) by elevation: 1 = zenith, 0 = horizon, -1 = nadir.
const SKY_STOPS = [[1, '#0a1030'], [0.55, '#111a3e'], [0.3, '#181f46'], [0.14, '#22254a'], [0.06, '#302c44'], [0.015, '#3d3238'], [0.0, '#483a33'], [-0.03, '#2a2226'], [-0.2, '#0e0c10'], [-1, '#050506']];
export const HORIZON_SRGB = [0x40 / 255, 0x33 / 255, 0x34 / 255];
const srgbToLinear = (c) => Math.pow(c, 2.2);

function lerpHex(a, b, t) { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const ch = (s) => (((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t) | 0; return `rgb(${ch(16)},${ch(8)},${ch(0)})`; }
function skyColorAt(e) {
  for (let i = 0; i < SKY_STOPS.length - 1; i++) { const [e0, c0] = SKY_STOPS[i], [e1, c1] = SKY_STOPS[i + 1]; if (e <= e0 && e >= e1) return lerpHex(c0, c1, (e0 - e) / (e0 - e1 || 1)); }
  return SKY_STOPS[SKY_STOPS.length - 1][1];
}

/**
 * Procedural night sky: gradient dome (deep blue zenith, warm smoky horizon), star field with a faint milky band,
 * thin cloud wisps, smoke bands and distant fire glows along the horizon, plus a moon with a soft halo.
 */
export function buildSky(scene, mats, opts = {}) {
  const W = 2048, H = 1024;
  const dome = B().MeshBuilder.CreateSphere('sky', { diameter: 900, segments: 32, sideOrientation: B().Mesh.BACKSIDE }, scene);
  // find which texture v corresponds to the top of the sphere so the horizon lands at the equator
  let topV = 1;
  {
    const pos = dome.getVerticesData(B().VertexBuffer.PositionKind), uvs = dome.getVerticesData(B().VertexBuffer.UVKind);
    let best = -Infinity;
    for (let i = 0; i < pos.length / 3; i++) if (pos[i * 3 + 1] > best) { best = pos[i * 3 + 1]; topV = uvs[i * 2 + 1]; }
  }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const rowToElev = (y) => { const v = 1 - y / H; const e = (v - 0.5) * 2; return topV > 0.5 ? e : -e; };
  const elevToRow = (e) => { const v = (topV > 0.5 ? e : -e) / 2 + 0.5; return (1 - v) * H; };
  // gradient
  for (let y = 0; y < H; y++) { ctx.fillStyle = skyColorAt(rowToElev(y)); ctx.fillRect(0, y, W, 1); }
  const seed = opts.seed ?? 7;
  let s = seed * 1000 + 17;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const yHorizon = elevToRow(0);
  const up = topV > 0.5 ? -1 : 1; // canvas direction of "up"
  // faint milky band (dense faint stars + haze) across the upper sky
  {
    const yBand = elevToRow(0.45), yBand2 = elevToRow(0.2);
    const gg = ctx.createLinearGradient(0, Math.min(yBand, yBand2) - 120, 0, Math.max(yBand, yBand2) + 120);
    gg.addColorStop(0, 'rgba(110,120,170,0)'); gg.addColorStop(0.5, 'rgba(110,120,170,0.1)'); gg.addColorStop(1, 'rgba(110,120,170,0)');
    ctx.fillStyle = gg; ctx.fillRect(0, Math.min(yBand, yBand2) - 120, W, Math.abs(yBand - yBand2) + 240);
  }
  // stars
  for (let i = 0; i < 3200; i++) {
    const y = Math.floor(rnd() * H); const e = rowToElev(y); if (e < 0.05) continue;
    const x = Math.floor(rnd() * W); const a = rnd();
    const big = a > 0.93;
    const tint = rnd();
    const col = tint < 0.15 ? '255,228,205' : tint < 0.3 ? '205,218,255' : '240,244,255';
    const alpha = (0.18 + a * 0.55) * Math.min(1, (e - 0.05) * 6 + 0.25);
    ctx.fillStyle = `rgba(${col},${alpha.toFixed(2)})`;
    ctx.fillRect(x, y, big ? 2 : 1, big ? 2 : 1);
    if (a > 0.985) { ctx.fillStyle = `rgba(${col},0.3)`; ctx.fillRect(x - 1, y - 1, 4, 4); }
  }
  // thin cloud wisps (noise), mostly low in the sky, lit faintly from below by the fires
  {
    const img = ctx.getImageData(0, 0, W, H); const d = img.data;
    for (let y = 0; y < H; y++) {
      const e = rowToElev(y); if (e < -0.05 || e > 0.6) continue;
      const band = Math.exp(-Math.pow((e - 0.12) / 0.16, 2));
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const n = fbm(u * 6 + seed, e * 14 + 3, 4, 2.2, 0.55) * 0.7 + fbm(u * 24, e * 40, 2) * 0.3;
        const a = Math.max(0, n - 0.56) * 2.4 * band;
        if (a <= 0) continue;
        const i = (y * W + x) * 4;
        const warm = Math.max(0, 0.25 - e) * 1.2;
        d[i] = d[i] + (58 + warm * 30 - d[i]) * a * 0.8; d[i + 1] = d[i + 1] + (56 + warm * 14 - d[i + 1]) * a * 0.8; d[i + 2] = d[i + 2] + (68 - d[i + 2]) * a * 0.8;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  // smoke haze bands near the horizon
  for (let i = 0; i < 26; i++) {
    const e = (rnd() - 0.35) * 0.3; const y = elevToRow(e);
    const gg = ctx.createLinearGradient(0, y - 24, 0, y + 24); gg.addColorStop(0, 'rgba(60,40,35,0)'); gg.addColorStop(0.5, `rgba(70,50,44,${0.06 + rnd() * 0.09})`); gg.addColorStop(1, 'rgba(60,40,35,0)'); ctx.fillStyle = gg; ctx.fillRect(0, y - 24, W, 48);
  }
  // distant fires: warm glows just below the horizon with dark smoke plumes leaning sideways above them
  const glows = opts.glows || 5;
  for (let i = 0; i < glows; i++) {
    const x = ((i + 0.3 + rnd() * 0.5) / glows) * W; const r = 60 + rnd() * 120; const y = yHorizon - up * 6;
    const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
    const str = 0.16 + rnd() * 0.2;
    gg.addColorStop(0, `rgba(255,150,60,${str})`); gg.addColorStop(0.35, `rgba(230,110,40,${str * 0.45})`); gg.addColorStop(1, 'rgba(120,50,20,0)');
    ctx.fillStyle = gg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    // plume
    const lean = (rnd() - 0.5) * 1.6; const len = 120 + rnd() * 140;
    for (let k = 0; k < 14; k++) { const t = k / 14; const px = x + lean * len * t + (rnd() - 0.5) * 24; const py = y + up * (len * t); const pr = 20 + t * 52; const pg = ctx.createRadialGradient(px, py, 0, px, py, pr); pg.addColorStop(0, `rgba(20,14,14,${0.28 * (1 - t)})`); pg.addColorStop(1, 'rgba(20,14,14,0)'); ctx.fillStyle = pg; ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2); }
  }
  const tex = new (B().DynamicTexture)('skytex', c, scene, false, B().Texture.BILINEAR_SAMPLINGMODE);
  tex.update(true); // invertY: canvas row 0 must land on v = 1 (matches rowToElev); update(false) mirrored the sky
  tex.wrapU = B().Texture.WRAP_ADDRESSMODE; tex.wrapV = B().Texture.CLAMP_ADDRESSMODE;
  const m = new (B().StandardMaterial)('skymat', scene);
  m.emissiveTexture = tex; m.diffuseColor = B().Color3.Black(); m.specularColor = B().Color3.Black(); m.disableLighting = true;
  m.backFaceCulling = false;
  dome.material = m; dome.isPickable = false; dome.infiniteDistance = true; dome.applyFog = false;
  dome.renderingGroupId = 0;
  dome.alwaysSelectAsActiveMesh = true;
  // moon + soft halo (billboarded additive sprite)
  const moonDir = new (B().Vector3)(-0.45, 0.72, 0.53).normalize();
  const moonPos = moonDir.scale(400);
  const moon = B().MeshBuilder.CreateDisc('moon', { radius: 13, tessellation: 40 }, scene);
  const mm = new (B().StandardMaterial)('moonmat', scene);
  mm.emissiveColor = new (B().Color3)(0.92, 0.95, 1.0); mm.disableLighting = true; mm.diffuseColor = B().Color3.Black(); mm.backFaceCulling = false;
  moon.material = mm; moon.position.copyFrom(moonPos); moon.billboardMode = B().Mesh.BILLBOARDMODE_ALL; moon.applyFog = false; moon.isPickable = false; moon.infiniteDistance = true;
  const halo = B().MeshBuilder.CreatePlane('moonglow', { size: 180 }, scene);
  const hm = new (B().StandardMaterial)('mat_moonhalo', scene);
  const ht = new (B().DynamicTexture)('moonhalo', haloCanvas(256, 2.6), scene, true, B().Texture.TRILINEAR_SAMPLINGMODE); ht.update(false); ht.hasAlpha = true;
  hm.emissiveTexture = ht; hm.opacityTexture = ht; hm.emissiveColor = new (B().Color3)(0.5, 0.58, 0.8); hm.diffuseColor = B().Color3.Black(); hm.specularColor = B().Color3.Black();
  hm.disableLighting = true; hm.alphaMode = B().Engine.ALPHA_ADD; hm.backFaceCulling = false; hm.alpha = 0.55;
  halo.material = hm; halo.position.copyFrom(moonPos); halo.billboardMode = B().Mesh.BILLBOARDMODE_ALL; halo.applyFog = false; halo.isPickable = false; halo.infiniteDistance = true;
  halo.alwaysSelectAsActiveMesh = true; moon.alwaysSelectAsActiveMesh = true;
  dome.freezeWorldMatrix(); dome.doNotSyncBoundingInfo = true;
  // the sky is not part of the prepass (SSAO would otherwise sample an undefined depth behind it and mottle it)
  if (opts.rig) for (const mat of [m, mm, hm]) opts.rig.registerSkyMaterial(mat);
  return { dome, moon, halo, tex, moonDir };
}

/** Create a prefiltered environment texture from a tiny procedural sky cube (for PBR ambient/specular). */
export function buildEnvironment(scene) {
  const n = 32;
  const faces = [];
  // +x, -x, +y, -y, +z, -z: sky color from up-vector; warm glow near the horizon, dark ground below
  for (let f = 0; f < 6; f++) {
    const data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n * 2 - 1, v = (y + 0.5) / n * 2 - 1;
      let dir;
      switch (f) { case 0: dir = [1, -v, -u]; break; case 1: dir = [-1, -v, u]; break; case 2: dir = [u, 1, v]; break; case 3: dir = [u, -1, -v]; break; case 4: dir = [u, -v, 1]; break; default: dir = [-u, -v, -1]; }
      const l = Math.hypot(dir[0], dir[1], dir[2]); const dy = dir[1] / l;
      let r, g, b;
      if (dy > 0) { const t = Math.pow(dy, 0.6); r = 0.11 - 0.07 * t; g = 0.12 - 0.07 * t; b = 0.22 - 0.12 * t; }
      else { const t = Math.pow(-dy, 0.5); r = 0.09 + 0.03 * t; g = 0.08 + 0.01 * t; b = 0.10 - 0.02 * t; }
      const glow = Math.max(0, 1 - Math.abs(dy) * 3.5) * 0.14;
      r += glow * 1.3; g += glow * 0.7; b += glow * 0.3;
      const i = (y * n + x) * 4;
      data[i] = Math.min(255, r * 255); data[i + 1] = Math.min(255, g * 255); data[i + 2] = Math.min(255, b * 255); data[i + 3] = 255;
    }
    faces.push(data);
  }
  const cube = new (B().RawCubeTexture)(scene, faces, n, B().Engine.TEXTUREFORMAT_RGBA, B().Engine.TEXTURETYPE_UNSIGNED_INT, true, false, B().Texture.TRILINEAR_SAMPLINGMODE);
  cube.gammaSpace = true;
  cube.coordinatesMode = B().Texture.SKYBOX_MODE;
  scene.environmentTexture = cube;
  scene.environmentIntensity = 0.5;
  return cube;
}

const SHADOW_CFG = {
  low: { size: 1024, ext: 40, quality: 'low', bias: 0.009, normalBias: 0.05 },
  high: { size: 2048, ext: 55, quality: 'medium', bias: 0.006, normalBias: 0.035 },
  ultra: { size: 2048, ext: 60, quality: 'high', bias: 0.004, normalBias: 0.02 }, // cascaded
};

export class LightingRig {
  constructor(scene, engine, settings, camera) {
    this.scene = scene; this.engine = engine; this.settings = settings; this.camera = camera;
    this.time = 0;
    this.flickers = [];
    this.pointLights = [];
    this.casters = [];          // every registered shadow caster (static + dynamic bases)
    this.dynamicCasters = new Set();
    this._casterT = 0;
    this._dynSet = new Set();
    this._scored = [];
    this.onSettingsApplied = null; // hook for other systems (LOD/material freeze, effects density)
    this.skyMaterials = [];        // excluded from the SSAO prepass
    // ambient (scene.ambientColor only feeds materials with an ambient colour; PBR relies on the environment cube + hemi)
    scene.clearColor = new (B().Color4)(0.02, 0.025, 0.04, 1);
    scene.ambientColor = new (B().Color3)(0.18, 0.2, 0.26);
    // cool sky fill so zombies stay readable in dark alleys; faint warm bounce from the ground
    this.hemi = new (B().HemisphericLight)('hemi', new (B().Vector3)(0.1, 1, 0.1), scene);
    this.hemi.diffuse = new (B().Color3)(0.36, 0.45, 0.68);
    this.hemi.groundColor = new (B().Color3)(0.17, 0.12, 0.10);
    this.hemi.specular = new (B().Color3)(0.04, 0.045, 0.07);
    this.hemi.intensity = 0.55;
    // moon (directional, shadows). Direction matches the moon sprite in the sky.
    this.sunDir = new (B().Vector3)(0.45, -0.72, -0.53).normalize();
    this.sun = new (B().DirectionalLight)('moon', this.sunDir.clone(), scene);
    this.sun.diffuse = new (B().Color3)(0.62, 0.71, 0.98);
    this.sun.specular = new (B().Color3)(0.28, 0.32, 0.45);
    this.sun.intensity = 1.15;
    this.sun.position = this.sunDir.scale(-160);
    this.sun.shadowMinZ = 20; this.sun.shadowMaxZ = 330;
    this.sun.autoUpdateExtends = false;
    this._sunRight = B().Vector3.Cross(B().Vector3.Up(), this.sunDir).normalize();
    this._sunUp = B().Vector3.Cross(this.sunDir, this._sunRight).normalize();
    this._tmp = new (B().Vector3)(0, 0, 0);
    this.shadow = null; this.shadowExt = 55; this.shadowFollow = true;
    // fog: exponential haze, colour matched to the horizon so distant geometry dissolves into the sky
    scene.fogMode = B().Scene.FOGMODE_EXP2;
    scene.fogColor = new (B().Color3)(srgbToLinear(HORIZON_SRGB[0]) * 0.9, srgbToLinear(HORIZON_SRGB[1]) * 0.9, srgbToLinear(HORIZON_SRGB[2]) * 1.05);
    this.renderDistance = 170;
    this.pipeline = null; this.ssao = null;
    this.applySettings();
  }

  /** Sky/moon materials must not render into the SSAO prepass (they sit behind everything at the far plane). */
  registerSkyMaterial(mat) {
    if (this.skyMaterials.indexOf(mat) < 0) this.skyMaterials.push(mat);
    const pr = this.scene.prePassRenderer;
    if (pr && pr.excludedMaterials.indexOf(mat) < 0) pr.excludedMaterials.push(mat);
  }

  addPointLight(name, pos, color, intensity, range, flicker = false) {
    const l = new (B().PointLight)(name, new (B().Vector3)(pos[0], pos[1], pos[2]), this.scene);
    l.diffuse = typeof color === 'string' ? B().Color3.FromHexString(color) : color;
    l.specular = l.diffuse.scale(0.5);
    l.intensity = intensity; l.range = range;
    l.radius = 0.3;
    l.metadata = { base: intensity, flicker, seed: Math.random() * 100, f: 1 };
    this.pointLights.push(l);
    if (flicker) this.flickers.push(l);
    return l;
  }

  /** Assign lights to a mesh: hemi + moon + the closest point lights (per-mesh light lists keep shader light counts low). */
  assignLights(mesh, maxPoint = 5) {
    const center = mesh.getBoundingInfo().boundingBox.centerWorld;
    const ext = mesh.getBoundingInfo().boundingBox.extendSizeWorld;
    const radius = Math.hypot(ext.x, ext.y, ext.z);
    const scored = [];
    for (const l of this.pointLights) {
      if (l.metadata && l.metadata.noAssign) continue;
      const dc = B().Vector3.Distance(center, l.position);
      if (dc - radius < l.range) scored.push({ l, d: dc / Math.max(1, l.range) * (l.metadata && l.metadata.fire ? 1.3 : 1) });
    }
    scored.sort((a, b) => a.d - b.d);
    for (const l of this.pointLights) {
      const on = scored.slice(0, maxPoint).some(s => s.l === l);
      if (on) { const i = l.excludedMeshes.indexOf(mesh); if (i >= 0) l.excludedMeshes.splice(i, 1); l.includedOnlyMeshes.push(mesh); }
    }
  }

  /** Point lights created before calling this affect only meshes explicitly included; dynamic meshes get a fixed set. */
  finalizeStaticLights(dynamicMeshes) {
    for (const l of this.pointLights) {
      if (l.includedOnlyMeshes.length === 0) l.includedOnlyMeshes.push(this._dummy || (this._dummy = B().MeshBuilder.CreateBox('lightdummy', { size: 0.01 }, this.scene)));
    }
    if (this._dummy) { this._dummy.isVisible = false; this._dummy.isPickable = false; }
    this.dynamicMeshes = dynamicMeshes || [];
  }

  /**
   * Dynamic meshes (zombies, players, weapons) share one light list (instances). Pick the N point lights that matter
   * most: brightest reach on the camera (view model, nearby fights) plus the strongest ones covering the zombies.
   * The count is kept constant so the shader variant never changes (no recompiles), only the bound lights do.
   */
  updateDynamicLights(meshes, camPos, zombies = null, count = 5) {
    if (!meshes || !meshes.length) return;
    const scored = this._scored; scored.length = 0;
    for (const l of this.pointLights) {
      if (l === this._dummyLight) continue;
      const md = l.metadata || {};
      if (md.noDynamic) continue;
      const range = Math.max(1, l.range);
      const dc = B().Vector3.Distance(camPos, l.position);
      let score = Math.max(0, 1 - dc / (range * 1.6)) * 1.6;
      if (zombies) {
        let n = 0;
        for (const z of zombies) {
          const dz = Math.hypot(z.x - l.position.x, z.z - l.position.z);
          if (dz < range) { score += (1 - dz / range) * 0.8; if (++n >= 12) break; }
        }
      }
      score *= md.base != null ? Math.min(3, md.base) : l.intensity;
      score += 0.0001 / (1 + dc); // tie-break: nearer
      scored.push({ l, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const n = Math.min(count, scored.length);
    const chosen = this._dynSet; chosen.clear();
    for (let i = 0; i < n; i++) chosen.add(scored[i].l);
    for (const l of this.pointLights) {
      const has = l.includedOnlyMeshes.indexOf(meshes[0]) >= 0;
      if (chosen.has(l) && !has) for (const m of meshes) l.includedOnlyMeshes.push(m);
      else if (!chosen.has(l) && has) for (const m of meshes) { const i = l.includedOnlyMeshes.indexOf(m); if (i >= 0) l.includedOnlyMeshes.splice(i, 1); }
    }
  }

  /** Register a shadow caster (the generator's render list is rebuilt from the casters near the camera). */
  addCaster(mesh, dynamic = false) {
    if (this.casters.indexOf(mesh) < 0) this.casters.push(mesh);
    if (dynamic) this.dynamicCasters.add(mesh);
    if (this.shadow) this.shadow.addShadowCaster(mesh, false);
  }

  update(dt) {
    this.time += dt;
    for (const l of this.flickers) {
      const md = l.metadata;
      const t = this.time * 9 + md.seed;
      let f = 0.72 + 0.28 * (Math.sin(t) * 0.5 + Math.sin(t * 2.7) * 0.3 + Math.sin(t * 6.1) * 0.2);
      if (!md.fire && Math.sin(t * 0.37 + md.seed) > 0.985) f *= 0.15; // occasional deep dropout (buzzing tube)
      md.f = f;
      l.intensity = md.base * (md.fire ? (0.7 + Math.random() * 0.3) * f : f);
    }
    if (this.shadow && this.shadowFollow) this._followShadow();
    this._casterT += dt;
    if (this._casterT > 0.5) { this._casterT = 0; this._updateCasterList(); }
  }

  /** Move the moon's shadow frustum with the camera, snapped to shadow-map texels so edges do not swim. */
  _followShadow() {
    const cam = this.camera.position, ext = this.shadowExt;
    const texel = (ext * 2) / this.shadowSize;
    const rx = B().Vector3.Dot(cam, this._sunRight), ry = B().Vector3.Dot(cam, this._sunUp), rz = B().Vector3.Dot(cam, this.sunDir);
    const sx = Math.round(rx / texel) * texel, sy = Math.round(ry / texel) * texel;
    const p = this._tmp;
    p.copyFrom(this._sunRight).scaleInPlace(sx).addInPlace(this._sunUp.scale(sy)).addInPlace(this.sunDir.scale(rz));
    p.subtractInPlace(this.sunDir.scale(160));
    this.sun.position.copyFrom(p);
  }

  _updateCasterList() {
    if (!this.shadow) return;
    const map = this.shadow.getShadowMap(); if (!map) return;
    const rl = map.renderList; if (!rl) return;
    const cam = this.camera.position;
    const reach = this.shadowExt * 1.35 + 10;
    rl.splice(0, rl.length);
    for (const m of this.casters) {
      if (m.isDisposed && m.isDisposed()) continue;
      if (this.dynamicCasters.has(m)) { rl.push(m); continue; }
      const bi = m.getBoundingInfo(); if (!bi) { rl.push(m); continue; }
      const c = bi.boundingSphere.centerWorld, r = bi.boundingSphere.radiusWorld;
      const dx = c.x - cam.x, dz = c.z - cam.z;
      if (Math.sqrt(dx * dx + dz * dz) - r < reach) rl.push(m);
    }
    if (rl.length === 0 && this.casters.length) rl.push(this.casters[0]);
  }

  applySettings() {
    const g = this.settings.graphics;
    const scene = this.scene, engine = this.engine;
    // resolution scale
    engine.setHardwareScalingLevel(1 / Math.max(0.5, Math.min(2, g.resolutionScale || 1)));
    // shadows
    if (this.shadow) { this.shadow.dispose(); this.shadow = null; }
    if (g.shadows && g.shadows !== 'off') {
      const cfg = SHADOW_CFG[g.shadows] || SHADOW_CFG.high;
      this.shadowSize = cfg.size; this.shadowExt = cfg.ext;
      this.sun.orthoLeft = -cfg.ext; this.sun.orthoRight = cfg.ext; this.sun.orthoTop = cfg.ext; this.sun.orthoBottom = -cfg.ext;
      if (g.shadows === 'ultra' && B().CascadedShadowGenerator) {
        const csm = new (B().CascadedShadowGenerator)(cfg.size, this.sun);
        csm.numCascades = 3; csm.lambda = 0.85; csm.shadowMaxZ = 140; csm.autoCalcDepthBounds = false; csm.stabilizeCascades = true;
        csm.filter = B().ShadowGenerator.FILTER_PCF; csm.filteringQuality = B().ShadowGenerator.QUALITY_HIGH;
        csm.bias = cfg.bias; csm.normalBias = cfg.normalBias; csm.cascadeBlendPercentage = 0.12;
        csm.penumbraDarkness = 0.7;
        this.shadow = csm; this.shadowFollow = false;
        csm.setDarkness(0.32);
      } else {
        const sg = new (B().ShadowGenerator)(cfg.size, this.sun);
        sg.usePercentageCloserFiltering = true;
        sg.filteringQuality = cfg.quality === 'low' ? B().ShadowGenerator.QUALITY_LOW : cfg.quality === 'high' ? B().ShadowGenerator.QUALITY_HIGH : B().ShadowGenerator.QUALITY_MEDIUM;
        sg.bias = cfg.bias; sg.normalBias = cfg.normalBias;
        sg.darkness = 0.32;
        sg.frustumEdgeFalloff = 0.25;
        this.shadow = sg; this.shadowFollow = true;
        this._followShadow();
      }
      this.shadow.getShadowMap().refreshRate = 1;
      for (const m of this.casters) this.shadow.addShadowCaster(m, false);
      this._casterT = 1;
    }
    // post-processing
    if (this.pipeline) { this.pipeline.dispose(); this.pipeline = null; }
    if (this.ssao) { this.ssao.dispose(); this.ssao = null; }
    const fx = g.effects || 'high';
    const pp = new (B().DefaultRenderingPipeline)('pp', true, scene, [this.camera]);
    pp.samples = g.aa === 'msaa' ? 4 : 1;
    pp.fxaaEnabled = g.aa === 'fxaa';
    pp.bloomEnabled = !!g.bloom;
    // bloom only from emissives / hot highlights
    pp.bloomThreshold = 0.9; pp.bloomWeight = 0.22; pp.bloomKernel = 64; pp.bloomScale = 0.5;
    pp.imageProcessingEnabled = true;
    const ip = pp.imageProcessing;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = B().ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.3;
    ip.contrast = 1.22;
    ip.vignetteEnabled = true; ip.vignetteWeight = 1.35; ip.vignetteStretch = 0.45; ip.vignetteColor = new (B().Color4)(0.01, 0.01, 0.02, 0);
    ip.vignetteCameraFov = 1.1;
    const curves = new (B().ColorCurves)();
    curves.globalSaturation = -4; curves.globalExposure = 0; curves.globalDensity = 0;
    curves.shadowsHue = 225; curves.shadowsSaturation = 18; curves.shadowsDensity = 0;
    curves.midtonesHue = 40; curves.midtonesSaturation = 4;
    curves.highlightsHue = 35; curves.highlightsSaturation = 14;
    ip.colorCurvesEnabled = true; ip.colorCurves = curves;
    pp.grainEnabled = !!g.grain;
    if (g.grain) { pp.grain.intensity = 9; pp.grain.animated = true; }
    pp.sharpenEnabled = fx === 'high' || fx === 'ultra';
    if (pp.sharpenEnabled) { pp.sharpen.edgeAmount = fx === 'ultra' ? 0.26 : 0.2; pp.sharpen.colorAmount = 1.0; }
    pp.chromaticAberrationEnabled = false; pp.depthOfFieldEnabled = false;
    this.pipeline = pp;
    if (g.ao && B().SSAO2RenderingPipeline && engine.webGLVersion >= 2) {
      try {
        const ultra = fx === 'ultra';
        const ssao = new (B().SSAO2RenderingPipeline)('ssao', scene, { ssaoRatio: ultra ? 0.75 : 0.5, blurRatio: ultra ? 0.75 : 0.5 }, [this.camera]);
        ssao.radius = 1.3; ssao.totalStrength = 1.15; ssao.base = 0.14; ssao.samples = ultra ? 16 : 12; ssao.maxZ = 55; ssao.minZAspect = 0.5; ssao.expensiveBlur = ultra;
        this.ssao = ssao;
        for (const mat of this.skyMaterials) this.registerSkyMaterial(mat);
      } catch (e) { console.warn('SSAO unavailable', e); }
    }
    this.fogFor(g);
    if (this.onSettingsApplied) this.onSettingsApplied(g);
  }

  /** Render distance -> exponential haze: ~30% haze at half the distance, ~75% at the full distance. */
  fogFor(g) {
    const far = Math.max(50, Math.min(400, g.renderDistance || 170));
    this.renderDistance = far;
    this.scene.fogDensity = 1.18 / far;
  }

  dispose() { if (this.pipeline) this.pipeline.dispose(); if (this.ssao) this.ssao.dispose(); if (this.shadow) this.shadow.dispose(); }
}
