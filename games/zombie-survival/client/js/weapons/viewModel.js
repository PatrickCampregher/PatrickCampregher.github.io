// First-person weapon view model: sway, bob, recoil, ADS, reload/switch animations, muzzle anchor.
/* global BABYLON */
import { cloneWeaponModel } from './weaponModels.js';

const B = () => BABYLON;
const V3 = (x, y, z) => new (BABYLON.Vector3)(x, y, z);

export class ViewModel {
  constructor(scene, camera, modelCache) {
    this.scene = scene; this.camera = camera; this.modelCache = modelCache;
    this.root = new (B().TransformNode)('vm_root', scene);
    this.root.parent = camera;
    this.holder = new (B().TransformNode)('vm_holder', scene);
    this.holder.parent = this.root;
    this.model = null; this.def = null;
    this.hipPos = V3(0.2, -0.2, 0.42);
    this.adsPos = V3(0, -0.075, 0.3);
    this.ads = 0; this.adsTarget = 0;
    this.recoilKick = 0; this.recoilRot = 0; this.recoilYaw = 0;
    this.swayX = 0; this.swayY = 0;
    this.bobT = 0; this.bobAmt = 0;
    this.lower = 1; this.lowerTarget = 0; // 1 = fully lowered (switching)
    this.reloadT = -1; this.reloadDur = 0; this.reloadPerShell = false;
    this.sprintK = 0;
    this.landK = 0;
    this.time = 0;
    this.lightMeshes = [];
    this.visible = true;
  }

  setWeapon(def, instant = false) {
    if (this.model) { this.model.dispose(); this.model = null; }
    this.def = def;
    if (!def) return;
    const base = this.modelCache.get(def.id);
    this.model = cloneWeaponModel(base, 'vm_' + def.id);
    this.model.root.parent = this.holder;
    for (const m of this.model.meshes) { m.renderingGroupId = 1; m.isPickable = false; m.receiveShadows = false; }
    this.lightMeshes = this.model.meshes;
    const s = def.look && (def.look.type === 'pistol' || def.look.type === 'revolver') ? 1.0 : 1.0;
    this.model.root.scaling.setAll(s);
    // ADS: put the sight line (per weapon class) on the screen center, gun well in front of the near plane
    const type = def.look.type;
    const SIGHT_Y = { pistol: 0.082, revolver: 0.086, smg: 0.112, rifle: def.look.carry ? 0.122 : 0.11, shotgun: 0.096, sniper: 0.125, lmg: 0.114, launcher: 0.124, energy: 0.122 };
    const sightY = SIGHT_Y[type] ?? (this.model.muzzle.position.y + 0.03);
    this.adsPos = V3(0, -sightY, type === 'pistol' || type === 'revolver' ? 0.34 : 0.42);
    this.hipPos = V3(0.2, -0.2, type === 'pistol' || type === 'revolver' ? 0.4 : 0.46);
    this.lower = instant ? 0 : 1; this.lowerTarget = 0;
    this.reloadT = -1;
    if (this.model.mag) this.model.mag.position.copyFrom(this.model.mag.position); // keep original
    this._magHome = this.model.mag ? this.model.mag.position.clone() : null;
  }

  setVisible(v) { this.visible = v; this.holder.setEnabled(v); }

  fire() {
    const r = this.def ? this.def.recoil : { kick: 0.05, pitch: 1 };
    this.recoilKick = Math.min(0.12, this.recoilKick + r.kick);
    this.recoilRot = Math.min(0.35, this.recoilRot + r.pitch * 0.04);
    this.recoilYaw = (Math.random() - 0.5) * r.yaw * 0.03;
    if (this.model && this.model.bolt) this._boltT = 0;
  }

  startReload(dur, perShell) { this.reloadT = 0; this.reloadDur = dur; this.reloadPerShell = perShell; }
  stopReload() { this.reloadT = -1; if (this.model && this.model.mag && this._magHome) this.model.mag.position.copyFrom(this._magHome); }
  startSwitch() { this.lowerTarget = 1; }
  land(v) { this.landK = Math.min(1, v / 8); }

  get muzzleWorld() { return this.model ? this.model.muzzle.getAbsolutePosition() : this.camera.globalPosition; }
  get ejectWorld() { return this.model ? this.model.eject.getAbsolutePosition() : this.camera.globalPosition; }

  update(dt, ctx) {
    // ctx: { mouseDX, mouseDY, speed, sprinting, onGround, ads, crouch, fov }
    this.time += dt;
    const t = this.time;
    this.adsTarget = ctx.ads ? 1 : 0;
    const adsSpeed = this.def ? 1 / Math.max(0.08, this.def.adsTime) : 6;
    this.ads += (this.adsTarget - this.ads) * Math.min(1, dt * adsSpeed);
    this.sprintK += ((ctx.sprinting ? 1 : 0) - this.sprintK) * Math.min(1, dt * 8);
    this.lower += (this.lowerTarget - this.lower) * Math.min(1, dt * 9);
    // sway from mouse
    const sx = -ctx.mouseDX * 0.0012, sy = -ctx.mouseDY * 0.0012;
    this.swayX += (sx - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (sy - this.swayY) * Math.min(1, dt * 10);
    // bob
    const spd = Math.min(1, ctx.speed / 5);
    this.bobAmt += (spd * (ctx.onGround ? 1 : 0) - this.bobAmt) * Math.min(1, dt * 6);
    this.bobT += dt * (6 + ctx.speed * 1.2);
    const bobX = Math.sin(this.bobT) * 0.012 * this.bobAmt * (1 - this.ads * 0.8);
    const bobY = Math.abs(Math.cos(this.bobT)) * 0.010 * this.bobAmt * (1 - this.ads * 0.8);
    // recoil recovery
    this.recoilKick *= Math.pow(0.001, dt);
    this.recoilRot *= Math.pow(0.002, dt);
    this.recoilYaw *= Math.pow(0.002, dt);
    this.landK *= Math.pow(0.02, dt);
    // idle breathing
    const idleX = Math.sin(t * 1.1) * 0.003, idleY = Math.sin(t * 1.7) * 0.003;
    const p = B().Vector3.Lerp(this.hipPos, this.adsPos, this.ads);
    const sprint = this.sprintK * (1 - this.ads);
    const px = p.x + this.swayX * 0.08 + bobX + idleX - sprint * 0.08;
    let py = p.y + this.swayY * 0.05 + bobY + idleY - sprint * 0.1 - this.landK * 0.06 - this.lower * 0.45;
    const pz = p.z - this.recoilKick + (ctx.crouch ? 0.01 : 0);
    let rx = -this.recoilRot + this.swayY * 0.6 + sprint * 0.45 + this.landK * 0.2 + this.lower * 0.8;
    let ry = this.swayX * 0.7 + this.recoilYaw - sprint * 0.5;
    let rz = -this.swayX * 0.3 * (1 - this.ads) + sprint * 0.35 + Math.sin(this.bobT * 0.5) * 0.01 * this.bobAmt;
    // reload animation
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      const k = Math.min(1, this.reloadT / this.reloadDur);
      if (this.reloadPerShell) {
        const cyc = (this.reloadT % 0.55) / 0.55;
        rx += 0.35; ry += 0.25; rz += -0.35 + Math.sin(cyc * Math.PI) * 0.15;
        py -= 0.05;
      } else {
        const dip = Math.sin(k * Math.PI);
        rx += dip * 0.55; rz -= dip * 0.5; ry += dip * 0.25;
        py -= dip * 0.08;
        if (this.model && this.model.mag && this._magHome) {
          // mag drops out then slides back in
          const mk = k < 0.45 ? Math.min(1, k / 0.25) : Math.max(0, 1 - (k - 0.45) / 0.35);
          this.model.mag.position.copyFrom(this._magHome);
          this.model.mag.position.y -= mk * 0.16;
        }
      }
      if (k >= 1) this.stopReload();
    }
    // bolt cycling for bolt-action / pump (visual)
    if (this.model && this.model.bolt && this._boltT != null && this._boltT >= 0) {
      this._boltT += dt;
      const bk = Math.sin(Math.min(1, this._boltT / 0.5) * Math.PI);
      this.model.bolt.position.z = -0.02 - bk * 0.05;
      if (this._boltT > 0.5) this._boltT = -1;
    }
    this.holder.position.set(px, py, pz);
    this.holder.rotation.set(rx, ry, rz);
  }

  dispose() { if (this.model) this.model.dispose(); this.root.dispose(); }
}

/** Cache of base weapon models (one per weapon id). */
export class WeaponModelCache {
  constructor(scene, mats, buildFn) { this.scene = scene; this.mats = mats; this.build = buildFn; this.cache = new Map(); }
  get(id) {
    let m = this.cache.get(id);
    if (!m) {
      m = this.build(id);
      m.root.setEnabled(false);
      this.cache.set(id, m);
    }
    return m;
  }
}
