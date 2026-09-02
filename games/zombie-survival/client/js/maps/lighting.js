// Night lighting, sky/environment, shadows, fog and post-processing driven by graphics settings.
/* global BABYLON */

const B = () => BABYLON;

export function buildSky(scene, mats) {
  // procedural gradient sky dome (dark blue-purple with warm fire glow at the horizon)
  const size = 512;
  const dome = B().MeshBuilder.CreateSphere('sky', { diameter: 900, segments: 24, sideOrientation: B().Mesh.BACKSIDE }, scene);
  // find which texture v corresponds to the top of the sphere so the horizon lands at the equator
  let topV = 1;
  {
    const pos = dome.getVerticesData(B().VertexBuffer.PositionKind), uvs = dome.getVerticesData(B().VertexBuffer.UVKind);
    let best = -Infinity;
    for (let i = 0; i < pos.length / 3; i++) if (pos[i * 3 + 1] > best) { best = pos[i * 3 + 1]; topV = uvs[i * 2 + 1]; }
  }
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  // canvas row 0 maps to v=1. Build the gradient by elevation e (1 = zenith, 0 = horizon, -1 = nadir).
  const rowToElev = (y) => { const v = 1 - y / size; const e = (v - 0.5) * 2; return topV > 0.5 ? e : -e; };
  const stops = [[1, '#04060d'], [0.5, '#0a1020'], [0.2, '#1a1726'], [0.06, '#3a2a28'], [0.0, '#5c3e2c'], [-0.06, '#2a2020'], [-0.3, '#0c0b0e'], [-1, '#050506']];
  const lerpHex = (a, b, t) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const ch = (s) => (((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t) | 0; return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };
  for (let y = 0; y < size; y++) {
    const e = rowToElev(y);
    let col = stops[stops.length - 1][1];
    for (let i = 0; i < stops.length - 1; i++) { const [e0, c0] = stops[i], [e1, c1] = stops[i + 1]; if (e <= e0 && e >= e1) { col = lerpHex(c0, c1, (e0 - e) / (e0 - e1 || 1)); break; } }
    ctx.fillStyle = col; ctx.fillRect(0, y, size, 1);
  }
  // stars in the upper sky
  for (let i = 0; i < 700; i++) { const y = Math.random() * size; if (rowToElev(y) < 0.08) continue; const x = Math.random() * size; const a = Math.random(); ctx.fillStyle = `rgba(255,255,255,${0.25 + a * 0.6})`; ctx.fillRect(x, y, a > 0.8 ? 2 : 1, a > 0.8 ? 2 : 1); }
  // smoke haze bands near the horizon
  for (let i = 0; i < 30; i++) {
    let y = Math.random() * size; if (Math.abs(rowToElev(y)) > 0.25) continue;
    const gg = ctx.createLinearGradient(0, y - 14, 0, y + 14); gg.addColorStop(0, 'rgba(60,40,35,0)'); gg.addColorStop(0.5, `rgba(80,52,44,${0.1 + Math.random() * 0.14})`); gg.addColorStop(1, 'rgba(60,40,35,0)'); ctx.fillStyle = gg; ctx.fillRect(0, y - 14, size, 28);
  }
  const tex = new (B().DynamicTexture)('skytex', c, scene, false, B().Texture.BILINEAR_SAMPLINGMODE);
  tex.update(false);
  tex.wrapU = B().Texture.CLAMP_ADDRESSMODE; tex.wrapV = B().Texture.CLAMP_ADDRESSMODE;
  const m = new (B().StandardMaterial)('skymat', scene);
  m.emissiveTexture = tex; m.diffuseColor = B().Color3.Black(); m.specularColor = B().Color3.Black(); m.disableLighting = true;
  m.backFaceCulling = false;
  dome.material = m; dome.isPickable = false; dome.infiniteDistance = true; dome.applyFog = false;
  dome.renderingGroupId = 0;
  // moon
  const moon = B().MeshBuilder.CreateDisc('moon', { radius: 16, tessellation: 32 }, scene);
  const mm = new (B().StandardMaterial)('moonmat', scene);
  mm.emissiveColor = new (B().Color3)(0.85, 0.9, 1.0); mm.disableLighting = true; mm.diffuseColor = B().Color3.Black();
  moon.material = mm; moon.position.set(-160, 230, 300); moon.lookAt(B().Vector3.Zero()); moon.rotation.y += Math.PI; moon.applyFog = false; moon.isPickable = false; moon.infiniteDistance = true;
  const moonGlow = B().MeshBuilder.CreateDisc('moonglow', { radius: 40, tessellation: 32 }, scene);
  moonGlow.material = mats.glow('moonglow', '#8899cc', 0.12); moonGlow.position.copyFrom(moon.position); moonGlow.rotation.copyFrom(moon.rotation); moonGlow.applyFog = false; moonGlow.isPickable = false; moonGlow.infiniteDistance = true;
  return { dome, moon, tex };
}

/** Create a prefiltered environment texture from a tiny procedural sky cube (for PBR ambient/specular). */
export function buildEnvironment(scene) {
  const n = 32;
  const faces = [];
  // +x, -x, +y, -y, +z, -z: sky color from up-vector; warm glow near the horizon
  for (let f = 0; f < 6; f++) {
    const data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n * 2 - 1, v = (y + 0.5) / n * 2 - 1;
      let dir;
      switch (f) { case 0: dir = [1, -v, -u]; break; case 1: dir = [-1, -v, u]; break; case 2: dir = [u, 1, v]; break; case 3: dir = [u, -1, -v]; break; case 4: dir = [u, -v, 1]; break; default: dir = [-u, -v, -1]; }
      const l = Math.hypot(dir[0], dir[1], dir[2]); const dy = dir[1] / l;
      let r, g, b;
      if (dy > 0) { const t = Math.pow(dy, 0.6); r = 0.10 - 0.06 * t; g = 0.11 - 0.06 * t; b = 0.20 - 0.10 * t; }
      else { const t = Math.pow(-dy, 0.5); r = 0.10 + 0.05 * t; g = 0.09 + 0.02 * t; b = 0.12 - 0.02 * t; }
      const glow = Math.max(0, 1 - Math.abs(dy) * 4) * 0.12;
      r += glow * 1.2; g += glow * 0.7; b += glow * 0.3;
      const i = (y * n + x) * 4;
      data[i] = Math.min(255, r * 255); data[i + 1] = Math.min(255, g * 255); data[i + 2] = Math.min(255, b * 255); data[i + 3] = 255;
    }
    faces.push(data);
  }
  const cube = new (B().RawCubeTexture)(scene, faces, n, B().Engine.TEXTUREFORMAT_RGBA, B().Engine.TEXTURETYPE_UNSIGNED_INT, true, false, B().Texture.TRILINEAR_SAMPLINGMODE);
  cube.gammaSpace = true;
  cube.coordinatesMode = B().Texture.SKYBOX_MODE;
  scene.environmentTexture = cube;
  scene.environmentIntensity = 0.55;
  return cube;
}

export class LightingRig {
  constructor(scene, engine, settings, camera) {
    this.scene = scene; this.engine = engine; this.settings = settings; this.camera = camera;
    this.time = 0;
    this.flickers = [];
    this.pointLights = [];
    // ambient
    scene.clearColor = new (B().Color4)(0.02, 0.025, 0.04, 1);
    scene.ambientColor = new (B().Color3)(0.18, 0.2, 0.26);
    this.hemi = new (B().HemisphericLight)('hemi', new (B().Vector3)(0.1, 1, 0.1), scene);
    this.hemi.diffuse = new (B().Color3)(0.42, 0.5, 0.68);
    this.hemi.groundColor = new (B().Color3)(0.22, 0.16, 0.12);
    this.hemi.specular = new (B().Color3)(0.05, 0.05, 0.08);
    this.hemi.intensity = 0.5;
    // moon (directional, shadows)
    this.sun = new (B().DirectionalLight)('moon', new (B().Vector3)(0.45, -0.75, -0.55).normalize(), scene);
    this.sun.diffuse = new (B().Color3)(0.62, 0.7, 0.95);
    this.sun.specular = new (B().Color3)(0.25, 0.3, 0.4);
    this.sun.intensity = 0.9;
    this.sun.position = new (B().Vector3)(-60, 90, 70);
    this.sun.shadowMinZ = 1; this.sun.shadowMaxZ = 260;
    this.sun.autoUpdateExtends = false;
    this.sun.orthoLeft = -58; this.sun.orthoRight = 58; this.sun.orthoTop = 58; this.sun.orthoBottom = -58;
    this.shadow = null;
    // fog
    scene.fogMode = B().Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0085;
    scene.fogColor = new (B().Color3)(0.10, 0.09, 0.11);
    this.pipeline = null; this.ssao = null;
    this.applySettings();
  }

  addPointLight(name, pos, color, intensity, range, flicker = false) {
    const l = new (B().PointLight)(name, new (B().Vector3)(pos[0], pos[1], pos[2]), this.scene);
    l.diffuse = typeof color === 'string' ? B().Color3.FromHexString(color) : color;
    l.specular = l.diffuse.scale(0.5);
    l.intensity = intensity; l.range = range;
    l.radius = 0.3;
    l.metadata = { base: intensity, flicker, seed: Math.random() * 100 };
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

  /** Dynamic meshes (zombies, players, weapons) get the N brightest street lights near the camera each second. */
  updateDynamicLights(meshes, camPos) {
    if (!meshes) return;
    const scored = this.pointLights.map(l => ({ l, d: B().Vector3.Distance(camPos, l.position) })).sort((a, b) => a.d - b.d).slice(0, 4);
    const chosen = new Set(scored.map(s => s.l));
    for (const l of this.pointLights) {
      const has = l.includedOnlyMeshes.includes(meshes[0]);
      if (chosen.has(l) && !has) for (const m of meshes) l.includedOnlyMeshes.push(m);
      else if (!chosen.has(l) && has) for (const m of meshes) { const i = l.includedOnlyMeshes.indexOf(m); if (i >= 0) l.includedOnlyMeshes.splice(i, 1); }
    }
  }

  update(dt) {
    this.time += dt;
    for (const l of this.flickers) {
      const md = l.metadata;
      const t = this.time * 9 + md.seed;
      const f = 0.72 + 0.28 * (Math.sin(t) * 0.5 + Math.sin(t * 2.7) * 0.3 + Math.sin(t * 6.1) * 0.2);
      l.intensity = md.base * (md.fire ? (0.7 + Math.random() * 0.3) * f : f);
    }
  }

  applySettings() {
    const g = this.settings.graphics;
    const scene = this.scene, engine = this.engine;
    // resolution scale
    engine.setHardwareScalingLevel(1 / Math.max(0.5, Math.min(2, g.resolutionScale || 1)));
    // shadows
    if (this.shadow) { this.shadow.dispose(); this.shadow = null; }
    if (g.shadows && g.shadows !== 'off') {
      const size = g.shadows === 'low' ? 1024 : g.shadows === 'high' ? 2048 : 4096;
      if (g.shadows === 'ultra' && B().CascadedShadowGenerator) {
        const csm = new (B().CascadedShadowGenerator)(size, this.sun);
        csm.numCascades = 3; csm.lambda = 0.8; csm.shadowMaxZ = 120; csm.autoCalcDepthBounds = false; csm.stabilizeCascades = true;
        csm.filter = B().ShadowGenerator.FILTER_PCF; csm.filteringQuality = B().ShadowGenerator.QUALITY_HIGH;
        csm.bias = 0.004; csm.normalBias = 0.02; csm.cascadeBlendPercentage = 0.1;
        this.shadow = csm;
      } else {
        const sg = new (B().ShadowGenerator)(size, this.sun);
        sg.usePercentageCloserFiltering = true;
        sg.filteringQuality = g.shadows === 'low' ? B().ShadowGenerator.QUALITY_LOW : B().ShadowGenerator.QUALITY_MEDIUM;
        sg.bias = 0.008; sg.normalBias = 0.06;
        sg.darkness = 0.35;
        sg.frustumEdgeFalloff = 0.1;
        this.shadow = sg;
      }
      this.shadow.getShadowMap().refreshRate = 1;
    }
    // post-processing
    if (this.pipeline) { this.pipeline.dispose(); this.pipeline = null; }
    if (this.ssao) { this.ssao.dispose(); this.ssao = null; }
    const pp = new (B().DefaultRenderingPipeline)('pp', true, scene, [this.camera]);
    pp.samples = g.aa === 'msaa' ? 4 : 1;
    pp.fxaaEnabled = g.aa === 'fxaa';
    pp.bloomEnabled = !!g.bloom;
    pp.bloomThreshold = 0.85; pp.bloomWeight = 0.18; pp.bloomKernel = 48; pp.bloomScale = 0.5;
    pp.imageProcessingEnabled = true;
    const ip = pp.imageProcessing;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = B().ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.15;
    ip.contrast = 1.1;
    ip.vignetteEnabled = true; ip.vignetteWeight = 1.2; ip.vignetteStretch = 0.4; ip.vignetteColor = new (B().Color4)(0, 0, 0, 0);
    ip.vignetteCameraFov = 1.1;
    const curves = new (B().ColorCurves)();
    curves.globalSaturation = -8; curves.shadowsHue = 220; curves.shadowsSaturation = 12; curves.highlightsHue = 35; curves.highlightsSaturation = 10;
    ip.colorCurvesEnabled = true; ip.colorCurves = curves;
    pp.grainEnabled = false; pp.chromaticAberrationEnabled = false; pp.depthOfFieldEnabled = false;
    this.pipeline = pp;
    if (g.ao && B().SSAO2RenderingPipeline && engine.webGLVersion >= 2) {
      try {
        const ssao = new (B().SSAO2RenderingPipeline)('ssao', scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [this.camera]);
        ssao.radius = 1.6; ssao.totalStrength = 1.0; ssao.base = 0.1; ssao.samples = 12; ssao.maxZ = 60; ssao.minZAspect = 0.4; ssao.expensiveBlur = false;
        this.ssao = ssao;
      } catch (e) { console.warn('SSAO unavailable', e); }
    }
    this.fogFor(g);
  }

  fogFor(g) { this.scene.fogDensity = g.effects === 'low' ? 0.007 : 0.0085; }

  dispose() { if (this.pipeline) this.pipeline.dispose(); if (this.ssao) this.ssao.dispose(); if (this.shadow) this.shadow.dispose(); }
}
