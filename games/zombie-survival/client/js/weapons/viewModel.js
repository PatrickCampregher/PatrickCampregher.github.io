// First-person weapon view model: exact ADS centering on the model's `sight` node, sway/bob/breathing, spring recoil,
// per-class reload animations (mag / shells / break / cylinder / belt / cell / tube), bolt/pump/slide cycling,
// sprint pose, switch lower/raise, landing dip. No per-frame allocations in update().
/* global BABYLON */
import { cloneWeaponModel } from './weaponModels.js';

const B = () => BABYLON;
const V3 = (x, y, z) => new (BABYLON.Vector3)(x, y, z);
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const ph = (k, a, b) => clamp01((k - a) / (b - a));           // phase 0..1 between a and b
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const bump = (t) => Math.sin(t * Math.PI);                     // 0 -> 1 -> 0
const spring = (s, dt, k, damp) => { s.v += (-k * s.x - damp * s.v) * dt; s.x += s.v * dt; };

export class ViewModel {
  constructor(scene, camera, modelCache) {
    this.scene = scene; this.camera = camera; this.modelCache = modelCache;
    this.root = new (B().TransformNode)('vm_root', scene);
    this.root.parent = camera;
    this.holder = new (B().TransformNode)('vm_holder', scene);
    this.holder.parent = this.root;
    this.model = null; this.def = null;
    this.hipPos = V3(0.15, -0.18, 0.22); this.hipRot = V3(0.0, -0.05, 0.04);
    this.adsPos = V3(0, -0.1, 0.27);
    this.adsK = 0;                                     // 0..1 (linear, from the player), eased when applied
    this.adsEased = 0;
    this.rec = { z: { x: 0, v: 0 }, rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, rz: { x: 0, v: 0 } };
    this.swayX = 0; this.swayY = 0;
    this.bobT = 0; this.bobAmt = 0;
    this.lower = 1; this.lowerTarget = 0;              // 1 = fully lowered (switching)
    this.reloadT = -1; this.reloadDur = 0; this.reloadKind = 'mag'; this.reloadCount = 0; this.reloadPer = 0.5;
    this.sprintK = 0; this.landK = 0; this.time = 0;
    this.cycleT = -1; this.cycleDur = 0;               // bolt/pump/slide cycle timer
    this.lightMeshes = [];
    this.visible = true;
    this.homes = {};                                   // part -> home position/rotation
    this._pump = false; this._boltAction = false;
    this.onEject = null;                               // (count, kind) -> spawn casings at ejectWorld
    this._ejected = false;
    this._shellFlags = 0;
    // loading shell (red hull) + round (brass) meshes used by the shells/cylinder animations
    this.loadShell = B().MeshBuilder.CreateCylinder('vm_shell', { diameter: 0.019, height: 0.058, tessellation: 8 }, scene);
    this.loadShell.rotation.x = Math.PI / 2; this.loadShell.isVisible = false; this.loadShell.isPickable = false; this.loadShell.renderingGroupId = 1;
    this.loadRound = B().MeshBuilder.CreateCylinder('vm_round', { diameter: 0.011, height: 0.034, tessellation: 8 }, scene);
    this.loadRound.rotation.x = Math.PI / 2; this.loadRound.isVisible = false; this.loadRound.isPickable = false; this.loadRound.renderingGroupId = 1;
    this._shellMatSet = false;
  }

  _ensureShellMats(mats) {
    if (this._shellMatSet || !mats) return;
    this.loadShell.material = mats.solid('vm_shell_red', '#b8251f', { metal: 0.1, rough: 0.55 });
    this.loadRound.material = mats.solid('vm_round_brass', '#c9a24a', { metal: 0.9, rough: 0.3 });
    this._shellMatSet = true;
  }

  setWeapon(def, instant = false) {
    if (this.model) { this.model.dispose(); this.model = null; }
    this.loadShell.isVisible = false; this.loadRound.isVisible = false;
    this.def = def;
    if (!def) return;
    const base = this.modelCache.get(def.id);
    this._ensureShellMats(this.modelCache.mats);
    this.model = cloneWeaponModel(base, 'vm_' + def.id);
    this.model.root.parent = this.holder;
    for (const m of this.model.meshes) { m.renderingGroupId = 1; m.isPickable = false; m.receiveShadows = false; }
    this.lightMeshes = this.model.meshes;
    this.loadShell.parent = this.model.root; this.loadRound.parent = this.model.root;
    // ADS: the sight node must sit at camera-local (0, 0, adsDist) with the gun rotated straight
    const s = this.model.sightPos, hip = this.model.hip;
    const adsDist = def.adsDist || this.model.adsDist || 0.27;
    this.adsPos.set(-s[0], -s[1], adsDist - s[2]);
    this.hipPos.set(hip[0], hip[1], hip[2]);
    this.hipRot.set(0.0, -0.05, 0.04);
    this.lower = instant ? 0 : 1; this.lowerTarget = 0;
    this.reloadT = -1; this.cycleT = -1;
    this.homes = {};
    for (const p in this.model.parts) { const m = this.model.parts[p]; this.homes[p] = { pos: m.position.clone(), rot: m.rotation.clone() }; m.isVisible = true; }
    this._boltAction = !!def.boltAction; this._pump = !!def.pump;
    for (const k in this.rec) { this.rec[k].x = 0; this.rec[k].v = 0; }
  }

  setVisible(v) { this.visible = v; this.holder.setEnabled(v); }

  /** per-shot: spring recoil + start the bolt/pump/slide cycle */
  fire() {
    const r = this.def ? this.def.recoil : { kick: 0.05, pitch: 1, yaw: 0.5 };
    const adsMul = 1 - 0.45 * this.adsEased;
    this.rec.z.v += r.kick * 9 * adsMul;
    this.rec.rx.v += r.pitch * 0.9 * adsMul;
    this.rec.ry.v += (Math.random() - 0.5) * r.yaw * 0.7 * adsMul;
    this.rec.rz.v += (Math.random() - 0.5) * r.yaw * 0.5 * adsMul;
    const kind = this.model ? this.model.boltKind : 'fixed';
    if (kind === 'slide') { this.cycleT = 0; this.cycleDur = 0.1; }
    else if (kind === 'recip') { this.cycleT = 0; this.cycleDur = 0.09; }
    else if (kind === 'bolt') { this.cycleT = -0.15; this.cycleDur = 0.6; }
    else if (kind === 'pump') { this.cycleT = -0.12; this.cycleDur = 0.42; }
  }

  startReload(dur, kind, count = 0, per = 0.5) {
    this.reloadT = 0; this.reloadDur = Math.max(0.2, dur); this.reloadKind = kind || 'mag'; this.reloadCount = count; this.reloadPer = per;
    this._ejected = false; this._shellFlags = 0; this.cycleT = -1;
  }
  stopReload() {
    this.reloadT = -1;
    this.loadShell.isVisible = false; this.loadRound.isVisible = false;
    if (!this.model) return;
    for (const p in this.model.parts) { const m = this.model.parts[p], h = this.homes[p]; if (h) { m.position.copyFrom(h.pos); m.rotation.copyFrom(h.rot); } m.isVisible = true; }
  }
  startSwitch() { this.lowerTarget = 1; }
  land(v) { this.landK = Math.min(1, v / 8); }

  get muzzleWorld() { return this.model ? this.model.muzzle.getAbsolutePosition() : this.camera.globalPosition; }
  get ejectWorld() { return this.model ? this.model.eject.getAbsolutePosition() : this.camera.globalPosition; }
  get sightWorld() { return this.model ? this.model.sight.getAbsolutePosition() : this.camera.globalPosition; }

  update(dt, ctx) {
    // ctx: { mouseDX, mouseDY, speed, sprinting, onGround, adsK, crouch }
    this.time += dt;
    const t = this.time;
    this.adsK = ctx.adsK != null ? ctx.adsK : (ctx.ads ? 1 : 0);
    const e = this.adsEased = easeOut(this.adsK);
    this.sprintK += ((ctx.sprinting ? 1 : 0) - this.sprintK) * Math.min(1, dt * 8);
    this.lower += (this.lowerTarget - this.lower) * Math.min(1, dt * 10);
    // sway from mouse (reduced to 25% in ADS)
    const swayScale = 1 - 0.75 * e;
    const sx = -ctx.mouseDX * 0.0011, sy = -ctx.mouseDY * 0.0011;
    this.swayX += (sx - this.swayX) * Math.min(1, dt * 9);
    this.swayY += (sy - this.swayY) * Math.min(1, dt * 9);
    // bob (reduced to 20% in ADS)
    const spd = Math.min(1, ctx.speed / 5);
    this.bobAmt += (spd * (ctx.onGround ? 1 : 0) - this.bobAmt) * Math.min(1, dt * 6);
    this.bobT += dt * (6 + ctx.speed * 1.2);
    const bobScale = 1 - 0.8 * e;
    const bobX = Math.sin(this.bobT) * 0.011 * this.bobAmt * bobScale;
    const bobY = Math.abs(Math.cos(this.bobT)) * 0.009 * this.bobAmt * bobScale;
    const bobRoll = Math.sin(this.bobT * 0.5) * 0.012 * this.bobAmt * bobScale;
    // recoil springs (slightly under-damped settle)
    spring(this.rec.z, dt, 420, 26); spring(this.rec.rx, dt, 380, 24); spring(this.rec.ry, dt, 380, 26); spring(this.rec.rz, dt, 380, 26);
    const recZ = Math.min(0.1, Math.max(-0.02, this.rec.z.x)), recRx = Math.min(0.3, Math.max(-0.05, this.rec.rx.x));
    this.landK *= Math.pow(0.02, dt);
    // idle breathing (fades out completely in ADS so the sight stays exactly on the eye line)
    const idleScale = 1 - e;
    const idleX = Math.sin(t * 1.1) * 0.0025 * idleScale, idleY = Math.sin(t * 1.7) * 0.0025 * idleScale;
    const sprint = this.sprintK * (1 - e);
    let px = this.hipPos.x + (this.adsPos.x - this.hipPos.x) * e + this.swayX * 0.06 * swayScale + bobX + idleX - sprint * 0.07;
    let py = this.hipPos.y + (this.adsPos.y - this.hipPos.y) * e + this.swayY * 0.04 * swayScale + bobY + idleY - sprint * 0.09 - this.landK * 0.05 - this.lower * 0.42;
    let pz = this.hipPos.z + (this.adsPos.z - this.hipPos.z) * e - recZ + (ctx.crouch ? 0.005 : 0);
    let rx = this.hipRot.x * (1 - e) - recRx + this.swayY * 0.5 * swayScale + sprint * 0.55 + this.landK * 0.15 + this.lower * 0.9;
    let ry = this.hipRot.y * (1 - e) + this.swayX * 0.55 * swayScale + this.rec.ry.x * 0.03 - sprint * 0.5;
    let rz = this.hipRot.z * (1 - e) - this.swayX * 0.25 * (1 - e) + sprint * 0.35 + bobRoll + this.rec.rz.x * 0.03;
    // ---- reload animation ----
    if (this.reloadT >= 0 && this.model) {
      this.reloadT += dt;
      const k = Math.min(1, this.reloadT / this.reloadDur);
      const o = this._reloadPose(k, this.reloadKind);
      px += o[0]; py += o[1]; pz += o[2]; rx += o[3]; ry += o[4]; rz += o[5];
      if (k >= 1) this.stopReload();
    }
    // ---- bolt / pump / slide cycle after a shot ----
    if (this.cycleT > -1 && this.model && this.model.bolt) {
      this.cycleT += dt;
      const c = this.cycleT / this.cycleDur;
      if (this.cycleT >= 0 && c <= 1) {
        const kind = this.model.boltKind, bolt = this.model.bolt, h = this.homes.bolt;
        if (kind === 'slide') bolt.position.z = h.pos.z - 0.03 * (c < 0.35 ? easeOut(c / 0.35) : 1 - easeInOut((c - 0.35) / 0.65));
        else if (kind === 'recip') bolt.position.z = h.pos.z - 0.035 * bump(c);
        else if (kind === 'pump') {
          bolt.position.z = h.pos.z - 0.065 * (c < 0.45 ? easeOut(c / 0.45) : 1 - easeInOut((c - 0.45) / 0.55));
          rx += 0.05 * bump(c); rz -= 0.06 * bump(c);
        } else if (kind === 'bolt') {
          // lift handle, pull back, push forward, lower handle
          const lift = c < 0.2 ? easeOut(c / 0.2) : c > 0.8 ? 1 - easeOut((c - 0.8) / 0.2) : 1;
          const pull = c < 0.2 ? 0 : c < 0.45 ? easeOut((c - 0.2) / 0.25) : c < 0.8 ? 1 - easeInOut((c - 0.45) / 0.35) : 0;
          bolt.rotation.z = h.rot.z + lift * 1.15;
          bolt.position.z = h.pos.z - pull * 0.06;
          rx += 0.08 * bump(c); rz -= 0.12 * bump(c); px += 0.01 * bump(c);
        }
      } else if (c > 1) {
        const h = this.homes.bolt; if (h) { this.model.bolt.position.copyFrom(h.pos); this.model.bolt.rotation.copyFrom(h.rot); }
        this.cycleT = -1;
      }
    }
    this.holder.position.set(px, py, pz);
    this.holder.rotation.set(rx, ry, rz);
  }

  /** Returns [dx, dy, dz, drx, dry, drz] for the current reload phase and moves the animatable parts. */
  _reloadPose(k, kind) {
    const m = this.model, P = m.parts, H = this.homes, out = _pose;
    out[0] = out[1] = out[2] = out[3] = out[4] = out[5] = 0;
    const tilt = (amt) => { out[3] += 0.28 * amt; out[5] += -0.45 * amt; out[4] += 0.12 * amt; out[1] += -0.035 * amt; out[0] += 0.01 * amt; };
    const settle = k < 0.12 ? easeOut(k / 0.12) : k > 0.88 ? 1 - easeInOut((k - 0.88) / 0.12) : 1;
    if (kind === 'shells') {
      // gun rolled to expose the loading port; one shell per cycle slides in; pump/charge at the end
      tilt(settle * 0.9); out[4] += 0.25 * settle;
      const n = Math.max(1, this.reloadCount), per = this.reloadPer;
      const t = this.reloadT, tEnd = 0.25 + n * per;
      if (t > 0.2 && t < tEnd) {
        const c = ((t - 0.2) % per) / per;
        this.loadShell.isVisible = true;
        const port = m.eject.position;
        const yIn = m.def.look.style === 'bullpup' ? -0.02 : 0.0;
        this.loadShell.position.set(0.03 - 0.03 * easeOut(Math.min(1, c / 0.6)), -0.09 + 0.09 * easeOut(Math.min(1, c / 0.6)) + yIn, port.z + 0.02);
        this.loadShell.rotation.set(Math.PI / 2, 0, 0.4 * (1 - c));
        if (c > 0.6) this.loadShell.isVisible = false;
        out[1] += -0.006 * bump(c);
      } else this.loadShell.isVisible = false;
      if (m.bolt && H.bolt && (this._pump || m.boltKind === 'recip') && t >= tEnd) {
        const c = clamp01((t - tEnd) / Math.max(0.15, this.reloadDur - tEnd - 0.05));
        m.bolt.position.z = H.bolt.pos.z - (this._pump ? 0.065 : 0.035) * bump(c);
      }
    } else if (kind === 'break') {
      // hinge opens, empties eject, new shells slide in, hinge slams shut
      tilt(settle * 0.8); out[3] += 0.3 * settle;
      const open = k < 0.15 ? 0 : k < 0.3 ? easeOut(ph(k, 0.15, 0.3)) : k < 0.78 ? 1 : 1 - easeIn(ph(k, 0.78, 0.9));
      if (P.hinge) P.hinge.rotation.x = H.hinge.rot.x - 0.6 * open;
      if (k > 0.3 && !this._ejected) { this._ejected = true; if (this.onEject) this.onEject(this.reloadCount || 2, 'shell', 0.6); }
      if (P.round) { const back = k < 0.3 ? 0 : k < 0.45 ? easeOut(ph(k, 0.3, 0.45)) : k < 0.55 ? 1 : 1 - easeOut(ph(k, 0.55, 0.72)); P.round.position.z = H.round.pos.z - 0.1 * back; P.round.isVisible = !(k > 0.45 && k < 0.55); }
      else if (k > 0.42 && k < 0.74) {
        const c = ph(k, 0.42, 0.74), which = c < 0.5 ? c * 2 : (c - 0.5) * 2;
        this.loadShell.isVisible = true;
        this.loadShell.position.set((c < 0.5 ? -0.012 : 0.012), 0.075 + 0.05 * (1 - easeOut(which)), 0.03 + 0.04 * easeOut(which));
        this.loadShell.rotation.set(Math.PI / 2, 0, 0);
      } else this.loadShell.isVisible = false;
    } else if (kind === 'cylinder') {
      // present the cylinder, swing out, tip up (casings fall), tip down (rounds in), swing in
      out[4] += 0.5 * settle; out[5] += -0.35 * settle; out[0] += 0.02 * settle; out[1] += -0.02 * settle;
      const swing = k < 0.12 ? 0 : k < 0.26 ? easeOut(ph(k, 0.12, 0.26)) : k < 0.8 ? 1 : 1 - easeInOut(ph(k, 0.8, 0.9));
      if (P.cylinder) P.cylinder.rotation.z = H.cylinder.rot.z + 1.5 * swing;
      const up = k < 0.26 ? 0 : k < 0.36 ? easeOut(ph(k, 0.26, 0.36)) : k < 0.44 ? 1 : k < 0.56 ? 1 - easeInOut(ph(k, 0.44, 0.56)) : 0;
      const down = k < 0.5 ? 0 : k < 0.6 ? easeOut(ph(k, 0.5, 0.6)) : k < 0.78 ? 1 : 1 - easeInOut(ph(k, 0.78, 0.86));
      out[3] += -0.55 * up + 0.45 * down;
      if (k > 0.36 && !this._ejected) { this._ejected = true; if (this.onEject) this.onEject(this.reloadCount || 6, 'brass', 0.35); }
      if (k > 0.58 && k < 0.78) {
        const c = ph(k, 0.58, 0.78) * (this.reloadCount || 6), f = c - Math.floor(c);
        this.loadRound.isVisible = true;
        this.loadRound.position.set(-0.03 + 0.03 * easeOut(f), 0.02 + 0.03 * easeOut(f), P.cylinder ? P.cylinder.position.z - 0.06 + 0.05 * easeOut(f) : 0);
        this.loadRound.rotation.set(Math.PI / 2, 0, 0);
      } else this.loadRound.isVisible = false;
    } else if (kind === 'belt') {
      // feed cover opens, box drops, new box rises, cover slams, charging handle
      tilt(settle * 0.7);
      const open = k < 0.08 ? 0 : k < 0.22 ? easeOut(ph(k, 0.08, 0.22)) : k < 0.8 ? 1 : 1 - easeIn(ph(k, 0.8, 0.86));
      if (P.cover) P.cover.rotation.x = H.cover.rot.x + 1.1 * open;
      if (P.mag) {
        const drop = k < 0.22 ? 0 : k < 0.45 ? easeIn(ph(k, 0.22, 0.45)) : 0;
        const rise = k < 0.5 ? 0 : k < 0.72 ? 1 - easeOut(ph(k, 0.5, 0.72)) : 0;
        P.mag.position.y = H.mag.pos.y - 0.4 * drop - 0.3 * rise;
        P.mag.rotation.x = H.mag.rot.x - 0.3 * drop;
        P.mag.isVisible = !(k >= 0.45 && k < 0.5);
      }
      if (k > 0.72 && k < 0.8) out[1] += -0.01 * bump(ph(k, 0.72, 0.8));
      if (k > 0.86) out[3] += -0.04 * bump(ph(k, 0.86, 0.9));
      if (m.bolt && H.bolt && k > 0.88) m.bolt.position.z = H.bolt.pos.z - 0.035 * bump(ph(k, 0.88, 1));
    } else if (kind === 'cell') {
      // energy cell slides out (down/back), new cell in, charge wobble
      tilt(settle * 0.6);
      if (P.mag) {
        const outK = k < 0.1 ? 0 : k < 0.35 ? easeOut(ph(k, 0.1, 0.35)) : 0;
        const inK = k < 0.42 ? 0 : k < 0.7 ? 1 - easeOut(ph(k, 0.42, 0.7)) : 0;
        P.mag.position.y = H.mag.pos.y - 0.14 * outK - 0.16 * inK;
        P.mag.position.z = H.mag.pos.z - 0.06 * outK;
        P.mag.isVisible = !(k >= 0.35 && k < 0.42);
      }
      if (k > 0.7 && k < 0.85) { const c = ph(k, 0.7, 0.85); out[0] += Math.sin(c * 40) * 0.003 * (1 - c); out[1] += Math.sin(c * 55) * 0.003 * (1 - c); }
    } else if (kind === 'tube') {
      // helical tube slides forward out, new one slides in from the front
      tilt(settle * 0.7);
      if (P.tube) {
        const outK = k < 0.08 ? 0 : k < 0.36 ? easeOut(ph(k, 0.08, 0.36)) : 0;
        const inK = k < 0.44 ? 0 : k < 0.78 ? 1 - easeOut(ph(k, 0.44, 0.78)) : 0;
        P.tube.position.z = H.tube.pos.z + 0.22 * outK + 0.24 * inK;
        P.tube.position.y = H.tube.pos.y - 0.06 * outK * outK - 0.03 * inK;
        P.tube.isVisible = !(k >= 0.36 && k < 0.44);
      }
      if (m.bolt && H.bolt && k > 0.84) m.bolt.position.z = H.bolt.pos.z - 0.035 * bump(ph(k, 0.84, 0.96));
    } else {
      // magazine: tilt, drop (gravity), new mag from below with a seat bump, then charge/rack
      tilt(settle);
      if (P.mag && H.mag) {
        const drop = k < 0.1 ? 0 : k < 0.4 ? easeIn(ph(k, 0.1, 0.4)) : 0;
        const rise = k < 0.46 ? 0 : k < 0.7 ? 1 - easeOut(ph(k, 0.46, 0.7)) : 0;
        P.mag.position.y = H.mag.pos.y - 0.42 * drop - 0.3 * rise;
        P.mag.position.z = H.mag.pos.z - 0.03 * rise;
        P.mag.rotation.x = H.mag.rot.x - 0.5 * drop + 0.25 * rise;
        P.mag.isVisible = !(k >= 0.4 && k < 0.46);
        if (k > 0.68 && k < 0.76) out[1] += 0.008 * bump(ph(k, 0.68, 0.76));   // seat bump
      }
      if (m.bolt && H.bolt && k > 0.74 && m.boltKind !== 'bolt' && m.boltKind !== 'pump') {
        const c = ph(k, 0.74, 0.92);
        const dist = m.boltKind === 'slide' ? 0.03 : 0.04;
        m.bolt.position.z = H.bolt.pos.z - dist * (c < 0.4 ? easeOut(c / 0.4) : 1 - easeIn((c - 0.4) / 0.6));
        out[3] += 0.05 * bump(c); out[0] += -0.006 * bump(c);
      } else if (m.bolt && H.bolt && k > 0.74 && m.boltKind === 'bolt') {
        const c = ph(k, 0.74, 0.98);
        const lift = c < 0.2 ? easeOut(c / 0.2) : c > 0.8 ? 1 - easeOut((c - 0.8) / 0.2) : 1;
        const pull = c < 0.2 ? 0 : c < 0.45 ? easeOut((c - 0.2) / 0.25) : c < 0.8 ? 1 - easeInOut((c - 0.45) / 0.35) : 0;
        m.bolt.rotation.z = H.bolt.rot.z + lift * 1.15; m.bolt.position.z = H.bolt.pos.z - pull * 0.06;
        out[3] += 0.06 * bump(c);
      }
    }
    return out;
  }

  dispose() { if (this.model) this.model.dispose(); this.loadShell.dispose(); this.loadRound.dispose(); this.root.dispose(); }
}

const _pose = [0, 0, 0, 0, 0, 0];

/** Cache of base weapon models (one per weapon id), built lazily on first use. */
export class WeaponModelCache {
  constructor(scene, mats, buildFn) { this.scene = scene; this.mats = mats; this.build = buildFn; this.cache = new Map(); }
  has(id) { return this.cache.has(id); }
  get(id) {
    let m = this.cache.get(id);
    if (!m) {
      m = this.build(id);
      m.root.setEnabled(false);
      this.cache.set(id, m);
    }
    return m;
  }
  /** Build the given ids one per animation frame (or timer tick) without blocking; resolves when done. */
  preload(ids, delayMs = 60) {
    const todo = ids.filter(id => !this.cache.has(id));
    return new Promise((resolve) => {
      const step = () => {
        const id = todo.shift();
        if (!id) { resolve(); return; }
        try { this.get(id); } catch (e) { console.warn('weapon build failed', id, e); }
        setTimeout(step, delayMs);
      };
      step();
    });
  }
  stats() { const out = {}; for (const [id, m] of this.cache) out[id] = { tris: m.tris, meshes: m.meshes.length }; return out; }
}
