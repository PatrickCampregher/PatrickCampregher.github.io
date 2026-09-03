// Procedural humanoid rigs (zombies + remote players) using hardware-instanced body parts
// and code-driven animation (walk/run cycles, attacks, climbing, staggers, deaths).
/* global BABYLON */
import { ZSTATE } from '/shared/zombies.js';

const PART_DEFS = [
  // name, size [w,h,d], pivot offset (local y of the joint relative to the part center), material
  { n: 'head', s: [0.24, 0.27, 0.26], mat: 'skin' },
  { n: 'neck', s: [0.12, 0.1, 0.12], mat: 'skin' },
  { n: 'torso', s: [0.44, 0.56, 0.26], mat: 'cloth' },
  { n: 'pelvis', s: [0.38, 0.22, 0.24], mat: 'pants' },
  { n: 'uarmL', s: [0.13, 0.33, 0.13], mat: 'cloth' },
  { n: 'uarmR', s: [0.13, 0.33, 0.13], mat: 'cloth' },
  { n: 'larmL', s: [0.11, 0.31, 0.11], mat: 'skin' },
  { n: 'larmR', s: [0.11, 0.31, 0.11], mat: 'skin' },
  { n: 'ulegL', s: [0.17, 0.46, 0.17], mat: 'pants' },
  { n: 'ulegR', s: [0.17, 0.46, 0.17], mat: 'pants' },
  { n: 'llegL', s: [0.15, 0.44, 0.15], mat: 'pants' },
  { n: 'llegR', s: [0.15, 0.44, 0.15], mat: 'pants' },
  { n: 'footL', s: [0.13, 0.09, 0.26], mat: 'shoe' },
  { n: 'footR', s: [0.13, 0.09, 0.26], mat: 'shoe' },
  // zombie-only head details. at = [x, top y, z] relative to the head joint; every part lies inside the head box
  // (0.24 x 0.27 x 0.26 standing on the joint), so the shared head hit volume (shared/zombies.js) is unchanged.
  { n: 'brow', s: [0.25, 0.05, 0.05], mat: 'skin', zombie: true, tint: 0.88, at: [0, 0.24, 0.125] },
  { n: 'jaw', s: [0.20, 0.07, 0.10], mat: 'skin', zombie: true, tint: 0.8, at: [0, 0.075, 0.105] },
  { n: 'socketL', s: [0.075, 0.055, 0.02], mat: 'skin', zombie: true, tint: 0.28, at: [-0.055, 0.2, 0.128] },
  { n: 'socketR', s: [0.075, 0.055, 0.02], mat: 'skin', zombie: true, tint: 0.28, at: [0.055, 0.2, 0.128] },
  { n: 'hair', s: [0.25, 0.03, 0.27], mat: 'shoe', zombie: true, tint: 0.75, at: [0, 0.27, 0] },
];
const HEAD_PARTS = ['head', 'brow', 'jaw', 'socketL', 'socketR', 'hair'];

const ZOMBIE_CLOTH = ['#5a5a66', '#4a4030', '#3d4a3a', '#5b3a3a', '#3a3a4d', '#6b5a48', '#494949', '#2f3f4f'];
const ZOMBIE_PANTS = ['#2e2e38', '#3a2e22', '#2c3a2c', '#333', '#2a3548'];
const ZOMBIE_SKIN = ['#b8c0a6', '#c2c7ad', '#a9b39a', '#bfb8a3', '#aab5a8'];
const PLAYER_COLORS = ['#5aa9ff', '#ff5a4a', '#5ce07a', '#ffc247', '#c47dff', '#3ee0c8', '#ff8f3a', '#d8d8d8'];

export class RigFactory {
  constructor(scene, materials, opts = {}) {
    this.scene = scene;
    this.mats = materials;
    this.shadow = opts.shadowGenerator || null;
    this.bases = { zombie: this._makeBases('zombie'), player: this._makeBases('player') };
    this.pool = [];
    this.eyeBase = null;
    this._makeEyes();
    this.shoulderBase = BABYLON.MeshBuilder.CreateBox('rig_shoulder', { width: 0.08, height: 0.06, depth: 0.08 }, this.scene);
    this.shoulderBase.material = this.mats.solid('pshoulder', '#ffffff', { emissive: '#ffffff', emissiveIntensity: 2.2, rough: 0.4 });
    this.shoulderBase.registerInstancedBuffer('color', 4); this.shoulderBase.instancedBuffers.color = new BABYLON.Color4(1, 1, 1, 1);
    this.shoulderBase.isVisible = false; this.shoulderBase.isPickable = false;
    this.capBase = BABYLON.MeshBuilder.CreateBox('rig_cap', { width: 0.27, height: 0.09, depth: 0.29 }, this.scene);
    this.capBase.material = this.mats.solid('pcap', '#ffffff', { rough: 0.8 });
    this.capBase.registerInstancedBuffer('color', 4); this.capBase.instancedBuffers.color = new BABYLON.Color4(1, 1, 1, 1);
    this.capBase.isVisible = false; this.capBase.isPickable = false;
  }

  _makeBases(kind) {
    const mats = this.mats;
    const set = {};
    const matFor = (m) => {
      if (kind === 'zombie') {
        if (m === 'skin') return mats.get('zombie_skin');
        if (m === 'cloth') return mats.get('zombie_cloth');
        if (m === 'pants') return mats.solid('zpants', '#2e2e38', { rough: 0.9 });
        return mats.solid('zshoe', '#1e1a16', { rough: 0.8 });
      }
      if (m === 'skin') return mats.solid('pskin', '#e2bc96', { rough: 0.7 });
      if (m === 'cloth') return mats.get('player_cloth');
      if (m === 'pants') return mats.solid('ppants', '#4a525c', { rough: 0.9 });
      return mats.solid('pshoe', '#151515', { rough: 0.7 });
    };
    for (const pd of PART_DEFS) {
      if (pd.zombie && kind !== 'zombie') continue;
      const mesh = BABYLON.MeshBuilder.CreateBox('rig_' + kind + '_' + pd.n, { width: pd.s[0], height: pd.s[1], depth: pd.s[2] }, this.scene);
      // shift geometry so the origin is at the top of the part (joint pivot)
      mesh.bakeTransformIntoVertices(BABYLON.Matrix.Translation(0, -pd.s[1] / 2, 0));
      mesh.material = matFor(pd.mat);
      mesh.registerInstancedBuffer('color', 4);
      mesh.instancedBuffers.color = new BABYLON.Color4(1, 1, 1, 1);
      mesh.isVisible = false;
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = false;
      mesh.receiveShadows = true;
      if (this.shadow) this.shadow.addShadowCaster(mesh, false);
      set[pd.n] = mesh;
    }
    return set;
  }

  _makeEyes() {
    const m = BABYLON.MeshBuilder.CreateBox('rig_eyes', { width: 0.2, height: 0.035, depth: 0.03 }, this.scene);
    m.material = this.mats.solid('zeyes', '#ffe27a', { emissive: '#ffcc55', emissiveIntensity: 2.5, rough: 0.5 });
    m.isVisible = false; m.isPickable = false;
    this.eyeBase = m;
  }

  acquire(kind, id, opts = {}) {
    let rig = this.pool.find(r => r.kind === kind && !r.inUse);
    if (!rig) rig = new Rig(this, kind);
    rig.reset(id, opts);
    return rig;
  }
  release(rig) { rig.hide(); rig.inUse = false; }
  dispose() { for (const r of this.pool) r.dispose(); }
}

export class Rig {
  constructor(factory, kind) {
    this.factory = factory;
    this.kind = kind;
    this.scene = factory.scene;
    this.root = new BABYLON.TransformNode('rig_root', this.scene);
    this.body = new BABYLON.TransformNode('rig_body', this.scene); this.body.parent = this.root;
    this.joints = {};
    this.parts = {};
    const bases = factory.bases[kind];
    const J = (name, parent, x, y, z) => { const t = new BABYLON.TransformNode('j_' + name, this.scene); t.parent = parent; t.position.set(x, y, z); this.joints[name] = t; return t; };
    // hierarchy (y up, z forward)
    const pelvisJ = J('pelvis', this.body, 0, 1.02, 0);
    const torsoJ = J('torso', pelvisJ, 0, 0.0, 0);
    const neckJ = J('neck', torsoJ, 0, 0.58, 0);
    const headJ = J('head', neckJ, 0, 0.1, 0);
    const uarmLJ = J('uarmL', torsoJ, -0.29, 0.52, 0);
    const uarmRJ = J('uarmR', torsoJ, 0.29, 0.52, 0);
    const larmLJ = J('larmL', uarmLJ, 0, -0.33, 0);
    const larmRJ = J('larmR', uarmRJ, 0, -0.33, 0);
    const ulegLJ = J('ulegL', pelvisJ, -0.11, -0.1, 0);
    const ulegRJ = J('ulegR', pelvisJ, 0.11, -0.1, 0);
    const llegLJ = J('llegL', ulegLJ, 0, -0.46, 0);
    const llegRJ = J('llegR', ulegRJ, 0, -0.46, 0);
    const footLJ = J('footL', llegLJ, 0, -0.44, 0.05);
    const footRJ = J('footR', llegRJ, 0, -0.44, 0.05);
    const attach = (name, joint, yOff = 0, x = 0, z = 0) => {
      const inst = bases[name].createInstance('i_' + name);
      inst.parent = joint; inst.position.set(x, yOff, z); inst.isPickable = false;
      inst.instancedBuffers.color = new BABYLON.Color4(1, 1, 1, 1);
      this.parts[name] = inst;
      return inst;
    };
    attach('pelvis', pelvisJ, 0.12);
    attach('torso', torsoJ, 0.58);
    attach('neck', neckJ, 0.1);
    attach('head', headJ, 0.27);
    if (kind === 'zombie') for (const pd of PART_DEFS) if (pd.zombie) attach(pd.n, headJ, pd.at[1], pd.at[0], pd.at[2]);
    attach('uarmL', uarmLJ); attach('uarmR', uarmRJ);
    attach('larmL', larmLJ); attach('larmR', larmRJ);
    attach('ulegL', ulegLJ); attach('ulegR', ulegRJ);
    attach('llegL', llegLJ); attach('llegR', llegRJ);
    attach('footL', footLJ, 0.05); attach('footR', footRJ, 0.05);
    // eyes (zombies)
    this.eyes = null;
    if (kind === 'zombie') {
      this.eyes = factory.eyeBase.createInstance('i_eyes');
      this.eyes.parent = headJ; this.eyes.position.set(0, 0.17, 0.135); this.eyes.isPickable = false;
    }
    // shoulder light + cap for players (teammate readability in the dark)
    this.shoulderLight = null; this.cap = null;
    if (kind === 'player') {
      this.shoulderLight = factory.shoulderBase.createInstance('i_shoulder');
      this.shoulderLight.parent = torsoJ; this.shoulderLight.position.set(-0.24, 0.5, -0.06); this.shoulderLight.isPickable = false;
      this.shoulderLight.instancedBuffers.color = new BABYLON.Color4(1, 1, 1, 1);
      this.cap = factory.capBase.createInstance('i_cap');
      this.cap.parent = headJ; this.cap.position.set(0, 0.29, 0); this.cap.isPickable = false;
      this.cap.instancedBuffers.color = new BABYLON.Color4(1, 1, 1, 1);
    }
    // weapon holder for players
    this.handR = new BABYLON.TransformNode('hand', this.scene); this.handR.parent = larmRJ; this.handR.position.set(0, -0.3, 0.05);
    this.weaponMesh = null;
    this.inUse = false;
    this.phase = 0;
    this.deathT = -1;
    this.flashT = 0;
    this.lastX = 0; this.lastZ = 0;
    this.speed = 0;
    this.baseColors = {};
    this.state = ZSTATE.CHASE;
    this.aux = 0; this.limp = false;
    this.scale = 1;
    this.bob = 0;
    this.attackAnim = 0;
    this.hitAnim = 0;
    this.headless = false;
    this.deathKind = 0;
    this.deathYaw = 0;
    this.seed = Math.random();
    this.fallSide = 1;
    factory.pool.push(this);
  }

  reset(id, opts) {
    this.id = id; this.inUse = true; this.deathT = -1; this.flashT = 0; this.phase = Math.random() * 6; this.hitAnim = 0;
    this.headless = false; for (const n of HEAD_PARTS) if (this.parts[n]) this.parts[n].isVisible = true; if (this.eyes) this.eyes.isVisible = true;
    this.scale = opts.scale || 1;
    this.root.scaling.setAll(this.scale);
    this.root.rotationQuaternion = null;
    this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0);
    this.limp = false; this.seed = Math.random(); this.fallSide = Math.random() < 0.5 ? -1 : 1;
    // colors
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    let cloth, pants, skinC;
    if (this.kind === 'zombie') { cloth = pick(ZOMBIE_CLOTH); pants = pick(ZOMBIE_PANTS); skinC = pick(ZOMBIE_SKIN); }
    else { cloth = PLAYER_COLORS[(opts.colorIndex || 0) % PLAYER_COLORS.length]; pants = '#2b2f36'; skinC = '#ffffff'; }
    const c3 = (h) => { const c = BABYLON.Color3.FromHexString(h); return new BABYLON.Color4(c.r, c.g, c.b, 1); };
    const skinCol = this.kind === 'zombie' ? c3(skinC) : new BABYLON.Color4(1, 1, 1, 1);
    if (this.shoulderLight) this.shoulderLight.instancedBuffers.color = c3(cloth);
    if (this.cap) { const cc = BABYLON.Color3.FromHexString(cloth); this.cap.instancedBuffers.color = new BABYLON.Color4(cc.r * 0.45, cc.g * 0.45, cc.b * 0.45, 1); }
    for (const pd of PART_DEFS) {
      const inst = this.parts[pd.n];
      if (!inst) continue;
      let col;
      if (pd.mat === 'skin') col = skinCol;
      else if (pd.mat === 'cloth') col = c3(cloth);
      else if (pd.mat === 'pants') col = this.kind === 'zombie' ? c3(pants) : new BABYLON.Color4(1, 1, 1, 1);
      else col = new BABYLON.Color4(1, 1, 1, 1);
      // zombies: fixed tints for the face details, random wear per cloth/pants part (torn, grimy look)
      let k = pd.tint || 1;
      if (this.kind === 'zombie' && (pd.mat === 'cloth' || pd.mat === 'pants')) k *= 0.7 + Math.random() * 0.3;
      if (k !== 1) col = new BABYLON.Color4(col.r * k, col.g * k, col.b * k, 1);
      this.baseColors[pd.n] = col;
      inst.instancedBuffers.color = col;
    }
    this.show();
  }

  show() { for (const n in this.parts) this.parts[n].isVisible = true; if (this.eyes) this.eyes.isVisible = true; this.root.setEnabled(true); }
  hide() { this.root.setEnabled(false); if (this.weaponMesh) { this.weaponMesh.dispose(); this.weaponMesh = null; } }

  setWeapon(mesh) {
    if (this.weaponMesh) this.weaponMesh.dispose();
    this.weaponMesh = mesh;
    if (mesh) { mesh.parent = this.handR; mesh.position.set(0.03, 0.02, 0.12); mesh.rotation.set(0, 0, 0); mesh.scaling.setAll(1); }
  }

  setPosition(x, y, z, yaw) { this.root.position.set(x, y, z); this.root.rotation.y = yaw; }

  flash() {
    this.flashT = 0.09;
    for (const n in this.parts) this.parts[n].instancedBuffers.color = new BABYLON.Color4(1.8, 1.4, 1.3, 1);
  }
  _unflash() { for (const n in this.parts) this.parts[n].instancedBuffers.color = this.baseColors[n]; }

  hitReact(part) { this.hitAnim = part === 1 ? 0.35 : 0.22; this.hitPart = part; }

  /** Start death animation. kind: 0 collapse, 1 headshot, 2 blast (fly back) */
  die(kind) { this.deathT = 0; this.deathKind = kind; if (kind === 1) { this.headless = true; for (const n of HEAD_PARTS) if (this.parts[n]) this.parts[n].isVisible = false; if (this.eyes) this.eyes.isVisible = false; } }
  get dead() { return this.deathT >= 0; }

  // ---------------- verification helpers (hit volumes vs. the drawn skull) ----------------
  /** Force the world matrices of the head's joint chain (needed when reading world-space data outside the render loop). */
  _syncHead() {
    this.root.computeWorldMatrix(true); this.body.computeWorldMatrix(true);
    for (const n of ['pelvis', 'torso', 'neck', 'head']) this.joints[n].computeWorldMatrix(true);
    return this.parts.head.computeWorldMatrix(true);
  }
  /** World-space centre of the visible head box. */
  headWorldPos(out = new BABYLON.Vector3()) {
    const wm = this._syncHead();
    return BABYLON.Vector3.TransformCoordinatesToRef(new BABYLON.Vector3(0, -PART_DEFS[0].s[1] / 2, 0), wm, out);
  }
  /** World-space corners + AABB of the visible head box: { corners: [[x,y,z] x 8], min, max, center }. */
  headBounds() {
    const wm = this._syncHead();
    const [w, h, d] = PART_DEFS[0].s;
    const corners = [], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < 8; i++) {
      const p = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3((i & 1 ? 1 : -1) * w / 2, i & 2 ? 0 : -h, (i & 4 ? 1 : -1) * d / 2), wm);
      corners.push([p.x, p.y, p.z]);
      const v = [p.x, p.y, p.z];
      for (let k = 0; k < 3; k++) { if (v[k] < min[k]) min[k] = v[k]; if (v[k] > max[k]) max[k] = v[k]; }
    }
    const c = this.headWorldPos();
    return { corners, min, max, center: [c.x, c.y, c.z] };
  }

  // ---------------- animation ----------------
  /** Call every frame. dt seconds; moved = distance moved since last frame (for stride); state/aux from network. */
  update(dt, moved, state, aux, limp, extra = {}) {
    const J = this.joints;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this._unflash(); }
    if (this.deathT >= 0) { this._animateDeath(dt); return; }
    this.state = state; this.aux = aux; this.limp = limp;
    const speed = dt > 0 ? moved / dt : 0;
    this.speed += (speed - this.speed) * Math.min(1, dt * 12);
    const spd = this.speed;
    const stride = this.kind === 'zombie' ? (spd > 3.2 ? 1.9 : 1.3) : 1.6;
    this.phase += moved * (Math.PI * 2 / stride);
    const ph = this.phase;
    const t = performance.now() / 1000 + this.seed * 10;
    const s = Math.sin(ph), c = Math.cos(ph);
    const moving = Math.min(1, spd / 0.8);
    let legAmp = 0, armSwing = 0, lean = 0, bobAmp = 0.03;
    if (this.kind === 'zombie') {
      const run = Math.min(1, Math.max(0, (spd - 2.6) / 2.4));
      legAmp = (0.45 + run * 0.5) * moving;
      lean = 0.12 + run * 0.28;
      armSwing = run;
      bobAmp = 0.025 + run * 0.03;
    } else { legAmp = 0.55 * moving; lean = 0.05 + Math.min(1, spd / 7) * 0.12; bobAmp = 0.025; }
    // legs
    let l1 = s * legAmp, l2 = -s * legAmp;
    if (this.limp) { l1 *= 0.35; lean += 0.08; }
    J.ulegL.rotation.x = l1;
    J.ulegR.rotation.x = l2;
    J.llegL.rotation.x = Math.max(0, -s) * legAmp * 1.4 + 0.08 * moving;
    J.llegR.rotation.x = Math.max(0, s) * legAmp * 1.4 + 0.08 * moving;
    J.footL.rotation.x = 0; J.footR.rotation.x = 0;
    // body bob & lean
    this.body.position.y = Math.abs(c) * bobAmp * moving + (this.kind === 'zombie' ? 0 : 0);
    J.pelvis.rotation.x = lean;
    J.pelvis.rotation.z = s * 0.04 * moving + (this.limp ? 0.08 : 0);
    J.torso.rotation.set(0, -s * 0.06 * moving, 0);
    // head
    J.head.rotation.set(Math.sin(t * 1.3) * 0.08 - lean * 0.6, Math.sin(t * 0.7) * 0.25, Math.sin(t * 1.1) * 0.08);
    // arms
    if (this.kind === 'zombie') {
      const raise = -1.45 + armSwing * 0.55; // arms forward (zombie), lower when running
      const swing = armSwing * 0.7;
      J.uarmL.rotation.set(raise - s * swing * 0.6 + Math.sin(t * 2.1) * 0.06, 0.1, 0.25 + Math.sin(t * 1.7) * 0.05);
      J.uarmR.rotation.set(raise + s * swing * 0.6 + Math.sin(t * 1.9 + 1) * 0.06, -0.1, -0.25 + Math.sin(t * 1.5 + 2) * 0.05);
      J.larmL.rotation.set(-0.35 - armSwing * 0.5, 0, 0);
      J.larmR.rotation.set(-0.35 - armSwing * 0.5, 0, 0);
      this._zombieStatePose(dt, t);
    } else {
      // player holding a weapon: both arms forward, aim pitch applied
      const pitch = extra.pitch || 0;
      J.torso.rotation.x = 0;
      J.uarmR.rotation.set(-1.25 + pitch * 0.6, -0.35, -0.25);
      J.larmR.rotation.set(-0.55, 0, 0);
      J.uarmL.rotation.set(-1.15 + pitch * 0.6, 0.55, 0.5);
      J.larmL.rotation.set(-0.9, 0.3, 0);
      J.head.rotation.x = -pitch * 0.5;
      if (extra.crouch) { this.body.position.y -= 0.45; J.ulegL.rotation.x += 0.9; J.ulegR.rotation.x += 0.9; J.llegL.rotation.x += 1.2; J.llegR.rotation.x += 1.2; J.pelvis.rotation.x += 0.35; }
      if (extra.downed) {
        // lying on back, propped up
        this.body.position.y = -0.62;
        J.pelvis.rotation.x = -1.35;
        J.torso.rotation.x = 0.5;
        J.ulegL.rotation.x = 0.4; J.ulegR.rotation.x = 0.55; J.llegL.rotation.x = 0.5; J.llegR.rotation.x = 0.2;
        J.uarmR.rotation.set(-0.6, 0, -0.5); J.uarmL.rotation.set(-0.2, 0, 0.9);
        J.head.rotation.x = 0.3;
      }
      if (extra.reloading) { J.uarmL.rotation.set(-0.7, 0.4, 0.4 + Math.sin(t * 9) * 0.3); J.larmL.rotation.set(-1.2 + Math.sin(t * 9) * 0.3, 0.2, 0); }
    }
    // hit reaction (flinch)
    if (this.hitAnim > 0) {
      const k = this.hitAnim; this.hitAnim -= dt;
      const kk = Math.sin(Math.min(1, k / 0.3) * Math.PI);
      if (this.hitPart === 1) { J.head.rotation.x += kk * 0.6; J.head.rotation.z += kk * 0.3 * this.fallSide; J.torso.rotation.x -= kk * 0.15; }
      else if (this.hitPart === 2) { J.pelvis.rotation.z += kk * 0.2 * this.fallSide; }
      else { J.torso.rotation.x -= kk * 0.25; J.torso.rotation.y += kk * 0.2 * this.fallSide; }
    }
  }

  _zombieStatePose(dt, t) {
    const J = this.joints;
    const st = this.state;
    if (st === ZSTATE.ATTACK) {
      const p = this.aux / 255; // 0..1 across windup+recover
      // windup 0..0.4 raise arms, strike 0.4..0.55, recover
      let raise;
      if (p < 0.4) raise = -1.4 - (p / 0.4) * 1.1;
      else if (p < 0.55) raise = -2.5 + ((p - 0.4) / 0.15) * 2.1;
      else raise = -0.4 - ((p - 0.55) / 0.45) * 1.0;
      const lunge = p > 0.35 && p < 0.7 ? Math.sin((p - 0.35) / 0.35 * Math.PI) * 0.35 : 0;
      J.uarmL.rotation.set(raise, 0.15, 0.35);
      J.uarmR.rotation.set(raise - 0.1, -0.15, -0.35);
      J.larmL.rotation.x = -0.5; J.larmR.rotation.x = -0.5;
      J.pelvis.rotation.x = 0.15 + lunge;
      J.head.rotation.x = -0.3 - lunge * 0.4;
    } else if (st === ZSTATE.TEARING) {
      const p = this.aux / 255;
      const pull = Math.sin(p * Math.PI * 2) * 0.5;
      J.uarmL.rotation.set(-1.6 + pull, 0.2, 0.2);
      J.uarmR.rotation.set(-1.6 + pull * 0.8, -0.2, -0.2);
      J.larmL.rotation.x = -0.6 - pull; J.larmR.rotation.x = -0.6 - pull;
      J.pelvis.rotation.x = 0.35 - pull * 0.2;
      J.ulegL.rotation.x = 0.15; J.ulegR.rotation.x = -0.15;
    } else if (st === ZSTATE.ENTERING) {
      const p = this.aux / 255;
      const crouch = Math.sin(p * Math.PI);
      J.pelvis.rotation.x = 0.3 + crouch * 0.9;
      J.ulegL.rotation.x = crouch * 1.4; J.ulegR.rotation.x = crouch * 0.8;
      J.llegL.rotation.x = crouch * 1.6; J.llegR.rotation.x = crouch * 1.2;
      J.uarmL.rotation.set(-2.2 + crouch * 0.6, 0.3, 0.4);
      J.uarmR.rotation.set(-2.2 + crouch * 0.6, -0.3, -0.4);
      J.larmL.rotation.x = -0.8; J.larmR.rotation.x = -0.8;
      this.body.position.y = -crouch * 0.35;
    } else if (st === ZSTATE.STAGGER) {
      J.pelvis.rotation.x = -0.35;
      J.head.rotation.x = -0.5;
      J.uarmL.rotation.set(-0.5, 0.3, 1.0 + Math.sin(t * 20) * 0.2);
      J.uarmR.rotation.set(-0.5, -0.3, -1.0 - Math.sin(t * 20) * 0.2);
    }
  }

  _animateDeath(dt) {
    const J = this.joints;
    this.deathT += dt;
    const T = this.deathT;
    const k = Math.min(1, T / 0.55);
    const e = 1 - Math.pow(1 - k, 3);
    const side = this.fallSide;
    if (this.deathKind === 2) {
      // blast: thrown back and down
      this.body.position.z = -e * 1.4;
      this.body.position.y = Math.sin(Math.min(1, T / 0.5) * Math.PI) * 0.8 - e * 0.95;
      J.pelvis.rotation.x = -e * 1.5;
    } else {
      J.pelvis.rotation.x = e * (this.deathKind === 1 ? -1.35 : 1.45);
      J.pelvis.rotation.z = e * 0.25 * side;
      this.body.position.y = -e * 0.92;
      this.body.position.z = e * (this.deathKind === 1 ? -0.4 : 0.55);
    }
    J.torso.rotation.set(e * 0.2, e * 0.3 * side, 0);
    J.ulegL.rotation.x = e * 0.5; J.ulegR.rotation.x = e * 0.2 + 0.3 * e * side;
    J.llegL.rotation.x = e * 0.9; J.llegR.rotation.x = e * 0.4;
    J.uarmL.rotation.set(-e * 0.8, 0, e * 1.3); J.uarmR.rotation.set(-e * 0.5, 0, -e * 1.1);
    J.larmL.rotation.x = -e * 0.4; J.larmR.rotation.x = -e * 0.7;
    J.head.rotation.set(e * 0.4, e * 0.5 * side, 0);
    if (this.eyes && T > 0.3) this.eyes.isVisible = false;
    // sink after a while
    if (T > 6) this.root.position.y -= dt * 0.35;
  }

  dispose() { this.root.dispose(); }
}
