// Pooled visual effects: muzzle flashes, tracers, impacts, decals, blood, explosions, fire, arcs, shells.
/* global BABYLON */
import { softCircleCanvas, smokeCanvas, bulletHoleCanvas, bloodSplatCanvas, scorchCanvas, flameCanvas } from '../maps/textures.js';

const B = () => BABYLON;
const V3 = (x, y, z) => new (BABYLON.Vector3)(x, y, z);

class Pool {
  constructor(n, make) { this.items = []; for (let i = 0; i < n; i++) this.items.push(make(i)); this.idx = 0; }
  next() { const it = this.items[this.idx]; this.idx = (this.idx + 1) % this.items.length; return it; }
}

export class Effects {
  constructor(scene, mats, textures, settings, lighting) {
    this.scene = scene; this.mats = mats; this.tex = textures; this.settings = settings; this.lighting = lighting;
    const q = settings.graphics.effects || 'high';
    this.quality = q === 'low' ? 0 : q === 'medium' ? 1 : q === 'high' ? 2 : 3;
    this.time = 0;
    this.active = [];   // timed items {t, dur, update(k), end()}
    this.fires = [];
    this._makeTextures();
    this._makeParticleSystems();
    this._makeTracers();
    this._makeDecals();
    this._makeMuzzle();
    this._makeShells();
    this._makeArcs();
    this.light = new (B().PointLight)('fxlight', V3(0, -100, 0), scene);
    this.light.intensity = 0; this.light.range = 12; this.light.diffuse = new (B().Color3)(1, 0.8, 0.5);
    this.explLight = new (B().PointLight)('fxlight2', V3(0, -100, 0), scene);
    this.explLight.intensity = 0; this.explLight.range = 20; this.explLight.diffuse = new (B().Color3)(1, 0.6, 0.25);
    this.lightT = 0; this.explT = 0;
  }

  _makeTextures() {
    this.tSoft = this.tex.fromCanvas('fx_soft', softCircleCanvas(64));
    this.tSmoke = this.tex.fromCanvas('fx_smoke', smokeCanvas(128));
    this.tFlame = this.tex.fromCanvas('fx_flame', flameCanvas(128));
    this.tHole = this.tex.fromCanvas('fx_hole', bulletHoleCanvas(64), { clamp: true });
    this.tBlood = [1, 2, 3].map(i => this.tex.fromCanvas('fx_blood' + i, bloodSplatCanvas(128, i), { clamp: true }));
    this.tScorch = this.tex.fromCanvas('fx_scorch', scorchCanvas(128), { clamp: true });
    // muzzle flash: bright star
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 60); g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.25, 'rgba(255,200,90,0.9)'); g.addColorStop(0.6, 'rgba(255,120,30,0.35)'); g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,220,140,0.55)'; ctx.stroke(); }
    this.tFlash = this.tex.fromCanvas('fx_flash', c, { clamp: true });
  }

  _ps(name, tex, cap, opts) {
    const ps = new (B().ParticleSystem)(name, cap, this.scene);
    ps.particleTexture = tex;
    ps.emitter = V3(0, -100, 0);
    ps.minEmitBox = V3(-0.02, -0.02, -0.02); ps.maxEmitBox = V3(0.02, 0.02, 0.02);
    ps.blendMode = opts.additive ? B().ParticleSystem.BLENDMODE_ADD : B().ParticleSystem.BLENDMODE_STANDARD;
    ps.minSize = opts.minSize; ps.maxSize = opts.maxSize;
    ps.minLifeTime = opts.minLife; ps.maxLifeTime = opts.maxLife;
    ps.emitRate = 0;
    ps.gravity = V3(0, opts.gravity || 0, 0);
    ps.direction1 = V3(-1, -1, -1); ps.direction2 = V3(1, 1, 1);
    ps.minEmitPower = opts.minPower; ps.maxEmitPower = opts.maxPower;
    ps.updateSpeed = 0.016;
    ps.color1 = opts.c1; ps.color2 = opts.c2; ps.colorDead = opts.cDead || new (B().Color4)(0, 0, 0, 0);
    if (opts.sizeGrad) { for (const [k, v] of opts.sizeGrad) ps.addSizeGradient(k, v); }
    ps.minAngularSpeed = -2; ps.maxAngularSpeed = 2;
    ps.isLocal = false;
    ps.preventAutoStart = true;
    ps.start();
    return ps;
  }

  _makeParticleSystems() {
    const C4 = (r, g, b, a) => new (B().Color4)(r, g, b, a);
    const n = this.quality >= 2 ? 1 : 0.6;
    this.sparks = new Pool(4, () => this._ps('sparks', this.tSoft, 60, { additive: true, minSize: 0.03, maxSize: 0.08, minLife: 0.15, maxLife: 0.45, gravity: -14, minPower: 3, maxPower: 9, c1: C4(1, 0.85, 0.5, 1), c2: C4(1, 0.6, 0.2, 1) }));
    this.dust = new Pool(4, () => this._ps('dust', this.tSmoke, 20, { minSize: 0.15, maxSize: 0.4, minLife: 0.4, maxLife: 0.9, gravity: 0.6, minPower: 0.6, maxPower: 1.8, c1: C4(0.6, 0.58, 0.55, 0.5), c2: C4(0.5, 0.48, 0.45, 0.35), sizeGrad: [[0, 0.5], [1, 1.6]] }));
    this.bloodPs = new Pool(6, () => this._ps('blood', this.tSoft, 40, { minSize: 0.06, maxSize: 0.16, minLife: 0.25, maxLife: 0.6, gravity: -16, minPower: 2, maxPower: 6, c1: C4(0.55, 0.02, 0.02, 1), c2: C4(0.35, 0.0, 0.0, 1) }));
    this.bloodMist = new Pool(4, () => this._ps('bloodmist', this.tSmoke, 12, { minSize: 0.25, maxSize: 0.5, minLife: 0.3, maxLife: 0.6, gravity: -1, minPower: 0.5, maxPower: 1.5, c1: C4(0.45, 0.02, 0.02, 0.6), c2: C4(0.3, 0.0, 0.0, 0.4), sizeGrad: [[0, 0.4], [1, 1.5]] }));
    this.muzzleSmoke = new Pool(3, () => this._ps('msmoke', this.tSmoke, 12, { minSize: 0.05, maxSize: 0.09, minLife: 0.25, maxLife: 0.5, gravity: 0.6, minPower: 1.2, maxPower: 2.5, c1: C4(0.6, 0.6, 0.6, 0.22), c2: C4(0.4, 0.4, 0.4, 0.12), sizeGrad: [[0, 0.6], [1, 2.0]] }));
    this.fireball = new Pool(2, () => this._ps('fireball', this.tFlame, 60, { additive: true, minSize: 0.8, maxSize: 2.2, minLife: 0.25, maxLife: 0.6, gravity: 2, minPower: 2, maxPower: 8, c1: C4(1, 0.7, 0.3, 1), c2: C4(1, 0.4, 0.1, 1), sizeGrad: [[0, 0.5], [0.3, 1.2], [1, 1.6]] }));
    this.explSmoke = new Pool(2, () => this._ps('esmoke', this.tSmoke, 40, { minSize: 1.0, maxSize: 2.0, minLife: 1.2, maxLife: 2.6, gravity: 0.8, minPower: 1.5, maxPower: 4, c1: C4(0.25, 0.22, 0.2, 0.7), c2: C4(0.12, 0.1, 0.1, 0.5), sizeGrad: [[0, 0.5], [1, 2.5]] }));
    this.debrisPs = new Pool(2, () => this._ps('edebris', this.tSoft, 40, { minSize: 0.08, maxSize: 0.2, minLife: 0.6, maxLife: 1.3, gravity: -14, minPower: 5, maxPower: 14, c1: C4(0.4, 0.35, 0.3, 1), c2: C4(0.25, 0.2, 0.18, 1) }));
    this.sparkle = this._ps('sparkle', this.tSoft, 40, { additive: true, minSize: 0.04, maxSize: 0.1, minLife: 0.4, maxLife: 0.9, gravity: 1.5, minPower: 0.3, maxPower: 0.9, c1: C4(1, 1, 0.8, 1), c2: C4(0.8, 0.9, 1, 1) });
    this.arcSparks = new Pool(3, () => this._ps('arcsparks', this.tSoft, 30, { additive: true, minSize: 0.04, maxSize: 0.1, minLife: 0.15, maxLife: 0.4, gravity: -6, minPower: 2, maxPower: 6, c1: C4(0.6, 0.85, 1, 1), c2: C4(0.3, 0.6, 1, 1) }));
    this.glassPs = new Pool(2, () => this._ps('glass', this.tSoft, 30, { minSize: 0.03, maxSize: 0.07, minLife: 0.4, maxLife: 0.9, gravity: -12, minPower: 1, maxPower: 4, c1: C4(0.8, 0.9, 1, 0.9), c2: C4(0.6, 0.7, 0.8, 0.8) }));
    this._n = n;
  }

  _burst(pool, x, y, z, count, dir = null, spread = 1) {
    const ps = pool instanceof Pool ? pool.next() : pool;
    ps.emitter.set(x, y, z);
    if (dir) { ps.direction1.set(dir.x - spread, dir.y - spread, dir.z - spread); ps.direction2.set(dir.x + spread, dir.y + spread, dir.z + spread); }
    else { ps.direction1.set(-1, -1, -1); ps.direction2.set(1, 1, 1); }
    ps.manualEmitCount = Math.max(1, Math.round(count * this._n));
  }

  _makeTracers() {
    // thin fast tracers, one material per tint (weapon glow / Pack-a-Punch)
    const mk = (key, color, a) => this.mats.glow('tracer_' + key, color, a);
    this.tracerMats = { warm: mk('warm', '#ffd9a0', 0.9), green: mk('green', '#6cff7a', 0.95), blue: mk('blue', '#7fd4ff', 0.95), orange: mk('orange', '#ff7a2a', 0.95), purple: mk('purple', '#c77dff', 0.95) };
    this.tracerPool = new Pool(32, () => { const m = B().MeshBuilder.CreateBox('tracer', { width: 0.014, height: 0.014, depth: 1 }, this.scene); m.material = this.tracerMats.warm; m.isVisible = false; m.isPickable = false; m.applyFog = false; return m; });
    this.rayPool = new Pool(8, () => { const m = B().MeshBuilder.CreateBox('ray', { width: 0.05, height: 0.05, depth: 1 }, this.scene); m.material = this.tracerMats.orange; m.isVisible = false; m.isPickable = false; return m; });
  }

  /** Tint key for a weapon's flash/tracer: Pack-a-Punch purple, energy weapons by glow hue, otherwise warm brass. */
  _tintFor(def) {
    const look = (def && def.look) || {};
    if (def && (def.pap || look.pap)) return 'purple';
    if (!look.glow) return 'warm';
    const c = B().Color3.FromHexString(look.glow);
    if (c.g > c.r && c.g > c.b) return 'green';
    if (c.b > c.r) return 'blue';
    return 'orange';
  }

  _makeDecals() {
    const mk = (n, tex, size, key) => {
      const mat = this.mats.decal(key, tex);
      return new Pool(n, () => { const m = B().MeshBuilder.CreatePlane('decal_' + key, { size, sideOrientation: B().Mesh.DOUBLESIDE }, this.scene); m.material = mat; m.isVisible = false; m.isPickable = false; m.receiveShadows = false; return m; });
    };
    this.holes = mk(this.quality >= 2 ? 80 : 40, this.tHole, 0.12, 'hole');
    this.bloodDecals = [0, 1, 2].map(i => mk(10, this.tBlood[i], 1.1, 'blood' + i));
    this.scorches = mk(8, this.tScorch, 4.5, 'scorch');
  }

  _placeDecal(pool, x, y, z, nx, ny, nz, size = 1, offset = 0.015) {
    const m = pool.next();
    m.isVisible = true;
    m.position.set(x + nx * offset, y + ny * offset, z + nz * offset);
    const n = V3(nx, ny, nz);
    // orient the plane to face along the normal
    if (Math.abs(ny) > 0.99) { m.rotation.set(ny > 0 ? Math.PI / 2 : -Math.PI / 2, Math.random() * Math.PI * 2, 0); m.rotationQuaternion = null; }
    else {
      m.rotationQuaternion = null;
      m.rotation.set(0, Math.atan2(nx, nz) + Math.PI, Math.random() * Math.PI * 2);
    }
    m.scaling.setAll(size);
    return m;
  }

  _makeMuzzle() {
    // tinted additive flash planes: the star texture is the base color, the tint is the emissive color (no lighting)
    const mk = (key, tint) => {
      const mat = new (B().StandardMaterial)('muzzlemat_' + key, this.scene);
      mat.diffuseTexture = this.tFlash; mat.opacityTexture = this.tFlash; mat.emissiveColor = B().Color3.FromHexString(tint);
      mat.disableLighting = true; mat.alphaMode = B().Engine.ALPHA_ADD; mat.backFaceCulling = false;
      return mat;
    };
    this.flashMats = { warm: mk('warm', '#ffe4b8'), green: mk('green', '#8dffa0'), blue: mk('blue', '#9ae0ff'), orange: mk('orange', '#ffa060'), purple: mk('purple', '#d9a0ff') };
    const plane = () => { const m = B().MeshBuilder.CreatePlane('flash', { size: 0.5 }, this.scene); m.material = this.flashMats.warm; m.billboardMode = B().Mesh.BILLBOARDMODE_ALL; m.isVisible = false; m.isPickable = false; m.applyFog = false; return m; };
    this.flashPool = new Pool(8, plane);     // core star at the muzzle
    this.tonguePool = new Pool(8, plane);    // dimmer second flash further along the bore (elongates the flash)
  }

  _makeShells() {
    // brass casings + red shotgun hulls (pooled, simple physics with a floor bounce)
    const brass = this.mats.solid('shell', '#d4a84b', { metal: 0.5, rough: 0.35, emissive: '#3a2a10' });
    const red = this.mats.solid('shell_red', '#b8251f', { metal: 0.1, rough: 0.55, emissive: '#2a0806' });
    this.shells = [];
    const add = (n, kind, dia, h, mat) => {
      for (let i = 0; i < n; i++) {
        const m = B().MeshBuilder.CreateCylinder('shell', { diameter: dia, height: h, tessellation: 6 }, this.scene);
        m.material = mat; m.isVisible = false; m.isPickable = false;
        this.shells.push({ m, v: V3(0, 0, 0), av: V3(0, 0, 0), t: -1, kind, floorY: 0.02 });
      }
    };
    add(28, 'brass', 0.011, 0.04, brass);
    add(12, 'shell', 0.019, 0.058, red);
    this.shellIdx = { brass: 0, shell: 0 };
  }

  _makeArcs() {
    const mat = this.mats.glow('arc', '#7fd4ff', 0.95);
    this.arcPool = new Pool(16, () => { const m = B().MeshBuilder.CreateBox('arcseg', { width: 0.04, height: 0.04, depth: 1 }, this.scene); m.material = mat; m.isVisible = false; m.isPickable = false; return m; });
  }

  // ---------------- public API ----------------
  muzzleFlash(pos, dir, def, withLight) {
    const look = def.look || {};
    const type = look.type || 'rifle';
    const pap = !!(def.pap || look.pap);
    const tint = this._tintFor(def);
    const energy = type === 'energy';
    // size per class, random roll and scale, Pack-a-Punch bigger
    let s = def.pellets > 1 ? 0.75 : type === 'pistol' ? 0.32 : type === 'revolver' ? 0.42 : type === 'smg' ? 0.4 : type === 'lmg' ? 0.6 : type === 'sniper' ? 0.7 : type === 'launcher' ? 0.55 : energy ? 0.5 : 0.5;
    if (pap) s *= 1.4;
    const m = this.flashPool.next();
    m.material = this.flashMats[tint];
    m.isVisible = true;
    m.position.set(pos.x + dir.x * 0.05, pos.y + dir.y * 0.05, pos.z + dir.z * 0.05);
    m.scaling.setAll(s * (0.8 + Math.random() * 0.4));
    m.rotation.z = Math.random() * Math.PI * 2;
    this._timed(energy ? 0.07 : 0.045, null, () => { m.isVisible = false; });
    if (s >= 0.4 && !energy) {
      const t = this.tonguePool.next();
      t.material = this.flashMats[tint];
      t.isVisible = true;
      const d2 = 0.1 + s * 0.35;
      t.position.set(pos.x + dir.x * d2, pos.y + dir.y * d2, pos.z + dir.z * d2);
      t.scaling.setAll(s * 0.55 * (0.8 + Math.random() * 0.4));
      t.rotation.z = Math.random() * Math.PI * 2;
      this._timed(0.035, null, () => { t.isVisible = false; });
    }
    if (withLight) {
      this.light.position.set(pos.x, pos.y, pos.z);
      this.light.intensity = (def.pellets > 1 ? 18 : type === 'sniper' ? 16 : type === 'pistol' ? 8 : 11) * (pap ? 1.5 : 1);
      this.lightT = energy ? 0.09 : 0.06;
      const c = tint === 'warm' ? new (B().Color3)(1, 0.75, 0.45) : B().Color3.FromHexString(pap ? (look.glow || '#b45cff') : look.glow);
      this.light.diffuse = c;
    }
    if (this.quality >= 1 && !energy) this._burst(this.muzzleSmoke, pos.x + dir.x * 0.25, pos.y + dir.y * 0.25, pos.z + dir.z * 0.25, def.pellets > 1 ? 2 : 1, dir, 0.3);
  }

  tracer(from, to, def) {
    const len = B().Vector3.Distance(from, to);
    if (len < 1.2) return;
    const look = (def && def.look) || {};
    const tint = this._tintFor(def);
    const isRay = look.type === 'energy';
    if (isRay) {
      // energy beam: full length, brief
      const m = this.rayPool.next();
      m.material = this.tracerMats[tint];
      m.isVisible = true;
      m.position.copyFrom(from);
      m.lookAt(to);
      m.position.copyFrom(from).addInPlace(to).scaleInPlace(0.5);
      m.scaling.set(1, 1, len);
      this._timed(0.11, null, () => { m.isVisible = false; });
      return;
    }
    // bullet tracer: a short bright segment flying from the muzzle to the impact point (~260 m/s)
    const m = this.tracerPool.next();
    m.material = this.tracerMats[tint];
    m.isVisible = true;
    m.position.copyFrom(from);
    m.lookAt(to);
    const seg = Math.min(len * 0.5, 3.0);
    m.scaling.set(1, 1, seg);
    const fx = from.x, fy = from.y, fz = from.z, dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const dur = Math.max(0.03, Math.min(0.14, len / 260));
    const half = seg / len * 0.5;
    this._timed(dur, (k) => { const kk = Math.min(1 - half, half + k * (1 - 2 * half)); m.position.set(fx + dx * kk, fy + dy * kk, fz + dz * kk); }, () => { m.isVisible = false; });
  }

  impact(x, y, z, nx, ny, nz, kind = 'concrete') {
    const dir = V3(nx, ny, nz);
    if (kind === 'metal') this._burst(this.sparks, x, y, z, 14, dir, 0.7);
    else if (kind === 'glass') this._burst(this.glassPs, x, y, z, 14, dir, 0.8);
    else { this._burst(this.sparks, x, y, z, 5, dir, 0.8); this._burst(this.dust, x, y, z, 4, dir, 0.6); }
    if (kind !== 'glass' && kind !== 'fence') this._placeDecal(this.holes, x, y, z, nx, ny, nz, 0.8 + Math.random() * 0.5);
  }

  blood(x, y, z, dir, big = false, headshot = false) {
    const d = dir ? V3(dir.x, dir.y + 0.3, dir.z) : V3(0, 0.5, 0);
    this._burst(this.bloodPs, x, y, z, big ? 26 : 12, d, 0.9);
    if (this.quality >= 1) this._burst(this.bloodMist, x, y, z, big ? 6 : 3, d, 0.5);
    if (headshot) this._burst(this.bloodPs, x, y + 0.1, z, 20, V3(0, 1, 0), 1.0);
    if (this.quality >= 2 && (big || Math.random() < 0.35)) {
      // floor splat under the hit
      this._placeDecal(this.bloodDecals[Math.floor(Math.random() * 3)], x, Math.max(0.01, y - 1.0 * 0 + 0.0), z, 0, 1, 0, 0.7 + Math.random() * 0.7, 0.02);
    }
  }

  bloodOnFloor(x, y, z, size = 1.3) {
    this._placeDecal(this.bloodDecals[Math.floor(Math.random() * 3)], x, y, z, 0, 1, 0, size, 0.02);
  }

  explosion(x, y, z, r) {
    this._burst(this.fireball, x, y, z, 30, null, 1);
    this._burst(this.explSmoke, x, y + 0.5, z, 22, V3(0, 1, 0), 1.2);
    this._burst(this.debrisPs, x, y, z, 25, V3(0, 1.2, 0), 1.0);
    this._burst(this.sparks, x, y, z, 30, null, 1);
    this.explLight.position.set(x, y + 0.5, z);
    this.explLight.intensity = 60; this.explT = 0.5;
    this._placeDecal(this.scorches, x, Math.max(0.01, y), z, 0, 1, 0, r / 4.5 + 0.4, 0.02);
    // camera shake hook
    if (this.onShake) this.onShake(x, y, z, r);
  }

  arc(from, links) {
    let prev = V3(from[0], from[1], from[2]);
    for (const l of links) {
      const to = V3(l[0], l[1], l[2]);
      const segs = 4;
      let a = prev;
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const p = B().Vector3.Lerp(prev, to, t);
        if (i < segs) p.addInPlace(V3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));
        const m = this.arcPool.next();
        m.isVisible = true;
        m.position.copyFrom(a).addInPlace(p).scaleInPlace(0.5);
        m.lookAt(p);
        m.scaling.set(1, 1, B().Vector3.Distance(a, p));
        this._timed(0.12, null, () => { m.isVisible = false; });
        a = p;
      }
      this._burst(this.arcSparks, to.x, to.y, to.z, 12, null, 1);
      prev = to;
    }
  }

  arcHit(x, y, z) { this._burst(this.arcSparks, x, y, z, 14, null, 1); }

  /** Eject a casing. kind: 'brass' | 'shell'; speedMul scales the throw (reload dumps use a gentle tumble). */
  shell(pos, right, up, kind = 'brass', speedMul = 1) {
    if (this.quality < 1) return;
    if (kind !== 'shell') kind = 'brass';
    // round-robin inside the pool of this kind
    let idx = this.shellIdx[kind], s = null;
    for (let n = 0; n < this.shells.length; n++) { idx = (idx + 1) % this.shells.length; if (this.shells[idx].kind === kind) { s = this.shells[idx]; break; } }
    if (!s) return;
    this.shellIdx[kind] = idx;
    s.m.isVisible = true; s.m.position.copyFrom(pos);
    const side = (1.4 + Math.random() * 0.9) * speedMul, lift = (1.3 + Math.random() * 0.9) * speedMul;
    s.v.set(right.x * side + up.x * lift + (Math.random() - 0.5) * 0.4, right.y * side + up.y * lift, right.z * side + up.z * lift + (Math.random() - 0.5) * 0.4);
    s.av.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
    s.m.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    s.floorY = Math.max(0.02, pos.y - 1.55);
    s.t = 0;
  }

  fire(x, y, z, size, barrel = false) {
    const C4 = (r, g, b, a) => new (B().Color4)(r, g, b, a);
    const flames = new (B().ParticleSystem)('fire', 60, this.scene);
    flames.particleTexture = this.tFlame;
    flames.emitter = V3(x, y, z);
    flames.minEmitBox = V3(-0.25 * size, 0, -0.25 * size); flames.maxEmitBox = V3(0.25 * size, 0.1, 0.25 * size);
    flames.color1 = C4(1, 0.75, 0.3, 1); flames.color2 = C4(1, 0.45, 0.1, 1); flames.colorDead = C4(0.3, 0.05, 0, 0);
    flames.minSize = 0.5 * size; flames.maxSize = 1.1 * size;
    flames.minLifeTime = 0.35; flames.maxLifeTime = 0.8;
    flames.emitRate = this.quality >= 2 ? 40 : 22;
    flames.blendMode = B().ParticleSystem.BLENDMODE_ADD;
    flames.gravity = V3(0, 2.5, 0);
    flames.direction1 = V3(-0.3, 1.5, -0.3); flames.direction2 = V3(0.3, 2.5, 0.3);
    flames.minEmitPower = 0.6 * size; flames.maxEmitPower = 1.2 * size;
    flames.minAngularSpeed = -1; flames.maxAngularSpeed = 1;
    flames.addSizeGradient(0, 0.6); flames.addSizeGradient(0.4, 1.0); flames.addSizeGradient(1, 0.2);
    flames.updateSpeed = 0.014;
    flames.start();
    const smoke = new (B().ParticleSystem)('smoke', 40, this.scene);
    smoke.particleTexture = this.tSmoke;
    smoke.emitter = V3(x, y + 0.8 * size, z);
    smoke.minEmitBox = V3(-0.3 * size, 0, -0.3 * size); smoke.maxEmitBox = V3(0.3 * size, 0.2, 0.3 * size);
    smoke.color1 = C4(0.18, 0.16, 0.15, 0.55); smoke.color2 = C4(0.1, 0.09, 0.09, 0.4); smoke.colorDead = C4(0.05, 0.05, 0.05, 0);
    smoke.minSize = 0.8 * size; smoke.maxSize = 1.6 * size;
    smoke.minLifeTime = 2.0; smoke.maxLifeTime = 4.0;
    smoke.emitRate = this.quality >= 2 ? 10 : 5;
    smoke.gravity = V3(0.4, 1.2, 0.2);
    smoke.direction1 = V3(-0.2, 1, -0.2); smoke.direction2 = V3(0.2, 1.8, 0.2);
    smoke.minEmitPower = 0.4; smoke.maxEmitPower = 0.9;
    smoke.addSizeGradient(0, 0.5); smoke.addSizeGradient(1, 2.4);
    smoke.updateSpeed = 0.014;
    smoke.start();
    const embers = this.quality >= 2 ? new (B().ParticleSystem)('embers', 30, this.scene) : null;
    if (embers) {
      embers.particleTexture = this.tSoft; embers.emitter = V3(x, y + 0.3, z);
      embers.minEmitBox = V3(-0.3 * size, 0, -0.3 * size); embers.maxEmitBox = V3(0.3 * size, 0.3, 0.3 * size);
      embers.color1 = C4(1, 0.7, 0.2, 1); embers.color2 = C4(1, 0.4, 0.1, 1); embers.colorDead = C4(0.5, 0.1, 0, 0);
      embers.minSize = 0.03; embers.maxSize = 0.07; embers.minLifeTime = 1.0; embers.maxLifeTime = 2.2; embers.emitRate = 8;
      embers.blendMode = B().ParticleSystem.BLENDMODE_ADD; embers.gravity = V3(0.3, 1.5, 0.1);
      embers.direction1 = V3(-0.6, 1, -0.6); embers.direction2 = V3(0.6, 2, 0.6); embers.minEmitPower = 0.5; embers.maxEmitPower = 1.5;
      embers.start();
    }
    const light = this.lighting.addPointLight('firelight', [x, y + 0.9 * size, z], new (B().Color3)(1, 0.55, 0.2), 2.2 * size, 9 + 5 * size, true);
    light.metadata.fire = true;
    this.fires.push({ flames, smoke, embers, light });
    return light;
  }

  powerupSparkle(x, y, z) { this.sparkle.emitter.set(x, y, z); this.sparkle.manualEmitCount = 6; }

  _timed(dur, update, end) { this.active.push({ t: 0, dur, update, end }); }

  update(dt) {
    this.time += dt;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      a.t += dt;
      if (a.update) a.update(Math.min(1, a.t / a.dur));
      if (a.t >= a.dur) { if (a.end) a.end(); this.active.splice(i, 1); }
    }
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity *= 0.6; if (this.lightT <= 0) this.light.intensity = 0; }
    if (this.explT > 0) { this.explT -= dt; this.explLight.intensity = Math.max(0, this.explLight.intensity - dt * 140); if (this.explT <= 0) this.explLight.intensity = 0; }
    for (const s of this.shells) {
      if (s.t < 0) continue;
      s.t += dt;
      s.v.y -= 12 * dt;
      const p = s.m.position;
      p.x += s.v.x * dt; p.y += s.v.y * dt; p.z += s.v.z * dt;
      s.m.rotation.x += s.av.x * dt; s.m.rotation.z += s.av.z * dt;
      if (p.y < s.floorY) {
        p.y = s.floorY;
        s.v.x *= 0.5; s.v.z *= 0.5; s.v.y = Math.abs(s.v.y) * 0.38;
        s.av.scaleInPlace(0.45);
        if (s.v.y < 0.4) { s.v.y = 0; s.v.x *= 0.6; s.v.z *= 0.6; s.av.scaleInPlace(0.3); }
      }
      if (s.t > 3) { s.t = -1; s.m.isVisible = false; }
    }
  }

  dispose() {
    for (const f of this.fires) { f.flames.dispose(); f.smoke.dispose(); if (f.embers) f.embers.dispose(); }
  }
}
