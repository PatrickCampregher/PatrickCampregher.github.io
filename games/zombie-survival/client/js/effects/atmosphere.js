// Ambient atmosphere: drifting embers and falling ash around the camera, smoke columns over burning structures,
// spark bursts at damaged electrical props / buzzing lamps, and a faint ground haze on ultra.
// Everything is pooled, quality scaled (particle density setting) and range limited. No per-frame allocations.
/* global BABYLON */
import { flakeCanvas } from '../maps/textures.js';
import { particleDensity } from '../settings/settings.js';

const B = () => BABYLON;
const V3 = (x, y, z) => new (BABYLON.Vector3)(x, y, z);
const C4 = (r, g, b, a) => new (BABYLON.Color4)(r, g, b, a);

// hard budgets at full density (particles alive)
const BUDGET = { embers: 120, ash: 150, smokeColumn: 26, sparks: 48, haze: 10 };
const CAM_CLEARANCE = 2.2;     // nothing spawns closer than this to the camera
const CAM_KILL = 0.9;          // drifting particles that get this close to the lens are recycled
const SPARK_RANGE = 70;        // sparks only fire within this distance of the camera

export class Atmosphere {
  constructor(scene, textures, effects, lighting, settings, world, mapVis) {
    this.scene = scene; this.tex = textures; this.effects = effects; this.lighting = lighting; this.settings = settings;
    this.world = world; this.mapVis = mapVis;
    this.time = 0;
    this.wind = V3(0.55, 0, 0.2);
    this.center = V3(0, 0, 0);   // camera-follow emitter anchor
    this.camPos = V3(0, 0, 0);
    this.fwd = V3(0, 0, 1);
    this.systems = [];           // every particle system owned here
    this.columns = [];           // { ps, x, z, rate }
    this.sparkSources = [];      // { x, y, z, light|null, next, lamp|null }
    this.sparkPool = []; this.sparkIdx = 0;
    this.sparkLights = [];
    this._tmp = V3(0, 0, 0);
    this._lodT = 0;
    this.density = particleDensity(settings.graphics);
    this.tFlake = textures.fromCanvas('atm_flake', flakeCanvas(32));
    this._build();
  }

  // ---------------- construction ----------------
  _build() {
    const d = this.density;
    if (d <= 0) return;
    this._buildAsh(d);
    if (d >= 0.6) {
      this._buildEmbers(d);
      this._buildSmokeColumns(d);
      this._buildSparks(d);
    }
    if (d >= 0.99 && (this.settings.graphics.effects === 'ultra')) this._buildHaze();
  }

  /** Random offset inside a box around the anchor, pushed out of the camera clearance sphere. */
  _boxOffset(out, hx, y0, y1, hz) {
    out.x = (Math.random() * 2 - 1) * hx; out.y = y0 + Math.random() * (y1 - y0); out.z = (Math.random() * 2 - 1) * hz;
    const dx = out.x + this.center.x - this.camPos.x, dy = out.y + this.center.y - this.camPos.y, dz = out.z + this.center.z - this.camPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < CAM_CLEARANCE) { const k = (CAM_CLEARANCE + 0.3) / Math.max(0.05, dist); out.x += dx * (k - 1); out.y += dy * (k - 1); out.z += dz * (k - 1); }
    return out;
  }

  _field(name, tex, cap, opts) {
    const ps = new (B().ParticleSystem)(name, cap, this.scene);
    ps.particleTexture = tex;
    ps.emitter = this.center;
    const em = new (B().CustomParticleEmitter)();
    em.particlePositionGenerator = (i, p, out) => this._boxOffset(out, opts.hx, opts.y0, opts.y1, opts.hz);
    em.particleDirectionGenerator = (i, p, out) => opts.dir(out);
    ps.particleEmitterType = em;
    ps.minEmitPower = 1; ps.maxEmitPower = 1;
    ps.blendMode = opts.additive ? B().ParticleSystem.BLENDMODE_ADD : B().ParticleSystem.BLENDMODE_STANDARD;
    ps.minSize = opts.minSize; ps.maxSize = opts.maxSize;
    ps.minLifeTime = opts.minLife; ps.maxLifeTime = opts.maxLife;
    ps.emitRate = opts.rate;
    ps.gravity = opts.gravity || V3(0, 0, 0);
    ps.color1 = opts.c1; ps.color2 = opts.c2; ps.colorDead = opts.cDead;
    ps.minAngularSpeed = opts.spin ? -opts.spin : 0; ps.maxAngularSpeed = opts.spin || 0;
    ps.minInitialRotation = 0; ps.maxInitialRotation = Math.PI * 2;
    ps.updateSpeed = 1 / 60;
    // size gradients are absolute sizes in Babylon; scale gives the per-particle variety
    ps.minScaleX = opts.scale ? opts.scale[0] : 1; ps.maxScaleX = opts.scale ? opts.scale[1] : 1; ps.minScaleY = ps.minScaleX; ps.maxScaleY = ps.maxScaleX;
    if (opts.sizeGrad) for (const [k, v] of opts.sizeGrad) ps.addSizeGradient(k, v);
    if (opts.colorGrad) for (const [k, c] of opts.colorGrad) ps.addColorGradient(k, c);
    ps.isLocal = false;
    ps.preWarmCycles = opts.preWarm || 0; ps.preWarmStepOffset = 4;
    ps.start();
    this.systems.push(ps);
    return ps;
  }

  _buildEmbers(d) {
    const cap = Math.round(BUDGET.embers * d);
    const wind = this.wind;
    this.embers = this._field('atm_embers', this.effects.tSoft, cap, {
      hx: 18, y0: -1.5, y1: 8, hz: 18, additive: true,
      minSize: 0.012, maxSize: 0.028, minLife: 3.2, maxLife: 6.5, rate: cap / 4.4, preWarm: 120, scale: [0.7, 1.4],
      gravity: V3(0, 0.12, 0),
      dir: (out) => { out.x = wind.x + (Math.random() - 0.5) * 0.7; out.y = 0.25 + Math.random() * 0.55; out.z = wind.z + (Math.random() - 0.5) * 0.7; },
      c1: C4(1, 0.62, 0.22, 1), c2: C4(1, 0.42, 0.12, 1), cDead: C4(0.35, 0.06, 0, 0),
      sizeGrad: [[0, 0.008], [0.15, 0.03], [0.8, 0.026], [1, 0.006]],
      colorGrad: [[0, C4(1, 0.75, 0.35, 0)], [0.1, C4(1, 0.6, 0.2, 1)], [0.6, C4(1, 0.35, 0.08, 0.9)], [1, C4(0.4, 0.05, 0, 0)]],
    });
    this.embers.metadata = { kind: 'embers' };
  }

  _buildAsh(d) {
    const cap = Math.round(BUDGET.ash * d);
    const wind = this.wind;
    this.ash = this._field('atm_ash', this.tFlake, cap, {
      hx: 20, y0: 1, y1: 12, hz: 20,
      minSize: 0.014, maxSize: 0.032, minLife: 6, maxLife: 10, rate: cap / 8, preWarm: 200, spin: 1.6, scale: [0.6, 1.5],
      dir: (out) => { out.x = wind.x * 0.5 + (Math.random() - 0.5) * 0.4; out.y = -(0.28 + Math.random() * 0.3); out.z = wind.z * 0.5 + (Math.random() - 0.5) * 0.4; },
      c1: C4(0.3, 0.29, 0.28, 0.7), c2: C4(0.22, 0.21, 0.2, 0.65), cDead: C4(0.15, 0.15, 0.15, 0),
      sizeGrad: [[0, 0.014], [0.2, 0.026], [1, 0.022]],
      colorGrad: [[0, C4(0.3, 0.29, 0.27, 0)], [0.12, C4(0.3, 0.29, 0.27, 0.7)], [0.85, C4(0.2, 0.19, 0.18, 0.6)], [1, C4(0.15, 0.15, 0.15, 0)]],
    });
    this.ash.metadata = { kind: 'ash' };
  }

  _buildSmokeColumns(d) {
    const wind = this.wind;
    for (const f of this.effects.fires) {
      if (!(f.size >= 1.2)) continue;
      const cap = Math.round(BUDGET.smokeColumn * d);
      const ps = new (B().ParticleSystem)('atm_smoke', cap, this.scene);
      ps.particleTexture = this.effects.tSmoke;
      ps.emitter = V3(f.x, f.y + 1.4 * f.size, f.z);
      ps.minEmitBox = V3(-0.5 * f.size, 0, -0.5 * f.size); ps.maxEmitBox = V3(0.5 * f.size, 0.5, 0.5 * f.size);
      ps.color1 = C4(0.075, 0.07, 0.065, 0.34); ps.color2 = C4(0.05, 0.045, 0.045, 0.28); ps.colorDead = C4(0.04, 0.04, 0.04, 0);
      ps.addColorGradient(0, C4(0.07, 0.065, 0.06, 0)); ps.addColorGradient(0.15, C4(0.07, 0.065, 0.06, 0.32)); ps.addColorGradient(0.7, C4(0.06, 0.06, 0.06, 0.2)); ps.addColorGradient(1, C4(0.05, 0.05, 0.05, 0));
      ps.minSize = 1.3 * f.size; ps.maxSize = 2.0 * f.size;
      ps.minScaleX = 0.8; ps.maxScaleX = 1.25; ps.minScaleY = 0.8; ps.maxScaleY = 1.25;
      ps.addSizeGradient(0, 0.7 * f.size); ps.addSizeGradient(0.5, 2.6 * f.size); ps.addSizeGradient(1, 4.6 * f.size);
      ps.minLifeTime = 5.5; ps.maxLifeTime = 9;
      const rate = cap / 7.5;
      ps.emitRate = rate;
      ps.gravity = V3(wind.x * 0.35, 0.22, wind.z * 0.35);
      ps.direction1 = V3(-0.25 + wind.x * 0.5, 1.1, -0.25 + wind.z * 0.5); ps.direction2 = V3(0.25 + wind.x * 0.5, 1.9, 0.25 + wind.z * 0.5);
      ps.minEmitPower = 0.8; ps.maxEmitPower = 1.2;
      ps.minAngularSpeed = -0.35; ps.maxAngularSpeed = 0.35;
      ps.minInitialRotation = 0; ps.maxInitialRotation = Math.PI * 2;
      ps.updateSpeed = 1 / 60;
      ps.preWarmCycles = 180; ps.preWarmStepOffset = 6;
      ps.start();
      ps.metadata = { kind: 'smoke' };
      this.systems.push(ps);
      this.columns.push({ ps, x: f.x, z: f.z, rate });
    }
  }

  _buildSparks(d) {
    const cap = Math.round(BUDGET.sparks * Math.max(0.6, d));
    for (let i = 0; i < 3; i++) {
      const ps = new (B().ParticleSystem)('atm_sparks', cap, this.scene);
      ps.particleTexture = this.effects.tSoft;
      ps.emitter = V3(0, -100, 0);
      ps.minEmitBox = V3(-0.08, -0.05, -0.08); ps.maxEmitBox = V3(0.08, 0.05, 0.08);
      ps.blendMode = B().ParticleSystem.BLENDMODE_ADD;
      ps.minSize = 0.02; ps.maxSize = 0.055;
      ps.minLifeTime = 0.25; ps.maxLifeTime = 0.75;
      ps.emitRate = 0;
      ps.gravity = V3(0, -9.5, 0);
      ps.direction1 = V3(-1, -0.6, -1); ps.direction2 = V3(1, 0.7, 1);
      ps.minEmitPower = 1.5; ps.maxEmitPower = 5.5;
      ps.color1 = C4(1, 0.95, 0.75, 1); ps.color2 = C4(1, 0.8, 0.45, 1); ps.colorDead = C4(1, 0.3, 0.05, 0);
      ps.addColorGradient(0, C4(1, 1, 0.9, 1)); ps.addColorGradient(0.4, C4(1, 0.75, 0.35, 1)); ps.addColorGradient(1, C4(0.9, 0.25, 0.05, 0));
      ps.minScaleX = 0.6; ps.maxScaleX = 1.4; ps.minScaleY = 0.6; ps.maxScaleY = 1.4;
      ps.addSizeGradient(0, 0.04); ps.addSizeGradient(1, 0.014);
      ps.updateSpeed = 1 / 60;
      ps.preventAutoStart = true;
      ps.start();
      ps.metadata = { kind: 'sparks' };
      this.systems.push(ps);
      this.sparkPool.push(ps);
    }
    // sources: `sparks` props (damaged electrics: own point light) + flickering lamps (no extra light)
    const props = (this.world && this.world.map && this.world.map.props) || [];
    const statics = (this.mapVis && this.mapVis.staticMeshes) || [];
    for (const p of props) {
      if (p.type !== 'sparks') continue;
      const light = new (B().PointLight)('sparklight', V3(p.x, p.y ?? 1.5, p.z), this.scene);
      light.diffuse = new (B().Color3)(1, 0.86, 0.62); light.specular = light.diffuse.scale(0.6);
      light.intensity = 0; light.range = p.range || 6; light.radius = 0.1;
      light.metadata = { noAssign: true, noDynamic: true };
      // only the static geometry around the prop is lit (keeps every other mesh's shader light count unchanged)
      const near = [];
      for (const m of statics) {
        const bi = m.getBoundingInfo && m.getBoundingInfo(); if (!bi) continue;
        const c = bi.boundingSphere.centerWorld, r = bi.boundingSphere.radiusWorld;
        if (Math.hypot(c.x - light.position.x, c.y - light.position.y, c.z - light.position.z) - r < light.range + 1) near.push(m);
      }
      if (!near.length) near.push(this.lighting._dummy || (this.lighting._dummy = B().MeshBuilder.CreateBox('lightdummy', { size: 0.01 }, this.scene)));
      light.includedOnlyMeshes = near;
      this.sparkLights.push(light);
      this.sparkSources.push({ x: p.x, y: p.y ?? 1.5, z: p.z, light, next: 1 + Math.random() * 4, lamp: null, rate: p.rate || 1 });
    }
    for (const l of this.lighting.flickers) {
      if (l.metadata && l.metadata.fire) continue;
      this.sparkSources.push({ x: l.position.x, y: l.position.y - 0.12, z: l.position.z, light: null, next: 3 + Math.random() * 8, lamp: l, rate: 0.5 });
    }
  }

  _buildHaze() {
    // very faint, slow ground haze sprites: few, large, far enough from the camera not to fill the screen
    const cap = BUDGET.haze;
    const wind = this.wind;
    this.haze = this._field('atm_haze', this.effects.tSmoke, cap, {
      hx: 26, y0: -0.4, y1: 1.6, hz: 26,
      minSize: 5, maxSize: 9, minLife: 9, maxLife: 14, rate: cap / 11, preWarm: 240, spin: 0.08, scale: [0.8, 1.3],
      dir: (out) => { out.x = wind.x * 0.6 + (Math.random() - 0.5) * 0.3; out.y = 0.02; out.z = wind.z * 0.6 + (Math.random() - 0.5) * 0.3; },
      c1: C4(0.2, 0.19, 0.22, 0.05), c2: C4(0.16, 0.16, 0.2, 0.04), cDead: C4(0.15, 0.15, 0.18, 0),
      sizeGrad: [[0, 5], [0.5, 8], [1, 12]],
      colorGrad: [[0, C4(0.2, 0.19, 0.22, 0)], [0.25, C4(0.2, 0.19, 0.22, 0.05)], [0.75, C4(0.18, 0.18, 0.21, 0.04)], [1, C4(0.15, 0.15, 0.18, 0)]],
    });
    // haze must stay well away from the camera: override the clearance for this field
    const em = this.haze.particleEmitterType;
    em.particlePositionGenerator = (i, p, out) => {
      this._boxOffset(out, 26, -0.4, 1.6, 26);
      const dx = out.x + this.center.x - this.camPos.x, dz = out.z + this.center.z - this.camPos.z; const dist = Math.hypot(dx, dz);
      if (dist < 9) { const k = 9 / Math.max(0.1, dist); out.x += dx * (k - 1); out.z += dz * (k - 1); }
      return out;
    };
    this.haze.metadata = { kind: 'haze' };
  }

  // ---------------- runtime ----------------
  update(dt, camera) {
    this.time += dt;
    const cp = camera.position;
    this.camPos.copyFrom(cp);
    camera.getDirectionToRef(B().Axis.Z, this.fwd);
    // the emitter field is centred a little ahead of the camera (where the player is looking)
    this.center.set(cp.x + this.fwd.x * 6, cp.y, cp.z + this.fwd.z * 6);
    // ember turbulence: cheap sinusoidal wobble on the particle velocities
    const kill2 = CAM_KILL * CAM_KILL;
    if (this.embers) {
      const ps = this.embers.particles, t = this.time;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]; const ph = p.id * 0.37;
        p.direction.x += Math.sin(t * 1.9 + ph) * 0.9 * dt;
        p.direction.z += Math.cos(t * 1.6 + ph * 1.3) * 0.9 * dt;
        p.direction.y += Math.sin(t * 2.6 + ph * 0.7) * 0.5 * dt;
        const dx = p.position.x - cp.x, dy = p.position.y - cp.y, dz = p.position.z - cp.z;
        if (dx * dx + dy * dy + dz * dz < kill2) p.age = p.lifeTime; // never a blob on the lens
      }
    }
    if (this.ash) {
      const ps = this.ash.particles, t = this.time;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]; const ph = p.id * 0.53;
        p.direction.x += Math.sin(t * 1.2 + ph) * 0.35 * dt;
        p.direction.z += Math.cos(t * 1.05 + ph) * 0.35 * dt;
        const dx = p.position.x - cp.x, dy = p.position.y - cp.y, dz = p.position.z - cp.z;
        if (dx * dx + dy * dy + dz * dz < kill2) p.age = p.lifeTime;
      }
    }
    // spark sources
    for (const s of this.sparkSources) {
      s.next -= dt;
      if (s.light && s.light.intensity > 0) {
        s.light.intensity = Math.max(0, s.light.intensity - dt * 28) * (0.6 + Math.random() * 0.4);
      }
      if (s.next > 0) continue;
      s.next = (s.lamp ? 4 : 1.6) + Math.random() * (s.lamp ? 10 : 5) / Math.max(0.2, s.rate);
      if (Math.hypot(s.x - cp.x, s.z - cp.z) > SPARK_RANGE) continue;
      if (s.lamp && s.lamp.metadata.f > 0.55 && Math.random() < 0.6) continue; // lamps mostly spark while they buzz/dip
      this._burst(s);
    }
    // range LOD for the smoke columns (throttled far away, off beyond the render distance)
    this._lodT += dt;
    if (this._lodT > 0.5) {
      this._lodT = 0;
      const far = (this.lighting && this.lighting.renderDistance) || 170;
      for (const c of this.columns) {
        const d = Math.hypot(c.x - cp.x, c.z - cp.z);
        c.ps.emitRate = d > far * 0.9 ? 0 : d > far * 0.5 ? c.rate * 0.5 : c.rate;
      }
    }
  }

  _burst(s) {
    const ps = this.sparkPool[this.sparkIdx]; this.sparkIdx = (this.sparkIdx + 1) % this.sparkPool.length;
    ps.emitter.set(s.x, s.y, s.z);
    ps.manualEmitCount = Math.round((14 + Math.random() * 18) * Math.max(0.6, this.density));
    if (s.light) s.light.intensity = 5 + Math.random() * 4;
    if (s.lamp && s.lamp.metadata) s.lamp.metadata.f *= 0.3;
  }

  /** Active particles across all atmosphere systems (for the perf overlay). */
  get particleCount() { let n = 0; for (const ps of this.systems) n += ps.particles.length; return n; }

  applySettings() {
    const d = particleDensity(this.settings.graphics);
    if (Math.abs(d - this.density) < 1e-6 && (this.settings.graphics.effects === 'ultra') === !!this.haze) return;
    this.dispose(false);
    this.density = d;
    this._build();
  }

  dispose(full = true) {
    for (const ps of this.systems) ps.dispose();
    for (const l of this.sparkLights) l.dispose();
    this.systems.length = 0; this.columns.length = 0; this.sparkSources.length = 0; this.sparkPool.length = 0; this.sparkLights.length = 0;
    this.embers = null; this.ash = null; this.haze = null;
    if (full && this.tFlake) { /* texture is owned by the texture library */ }
  }
}
