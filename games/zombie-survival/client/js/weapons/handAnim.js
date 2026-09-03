// First-person hand animations that do not touch the weapon view model: while one plays the view model is
// hidden (re-hidden every frame, since the HUD code re-shows it) and a hand + bottle / weapon parented to the
// camera is animated instead. `drink(perkId)` = raise a perk bottle, tilt, gulp, toss it (~1.7 s, no firing);
// `stow(weaponId)` = push the held weapon forward into the Pack-a-Punch tray (~0.9 s).
/* global BABYLON */
import { PERKS } from '/shared/perks.js';
import { PSTATE } from '/shared/constants.js';
import { WEAPONS } from '/shared/weapons.js';
import { cloneWeaponModel } from './weaponModels.js';
import { perkIconCanvas } from '../maps/machines.js';
import { audio } from '../audio/audio.js';

const B = () => BABYLON;
const V3 = (x, y, z) => new (BABYLON.Vector3)(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeIn = (t) => Math.pow(clamp01(t), 2.2);
const easeInOut = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const DRINK_DUR = 1.7, STOW_DUR = 0.9;

export class HandAnim {
  constructor(game) {
    this.g = game; this.scene = game.scene;
    this.root = new (B().TransformNode)('hand_root', this.scene);
    this.root.parent = game.camera;
    this.root.setEnabled(false);
    this.t = -1; this.mode = null; this.dur = 0; this.perkId = null; this.weaponModel = null;
    this._labelMats = new Map(); this._liquidMats = new Map();
    this.skin = game.mats.solid('hand_skin', '#c69a7c', { rough: 0.72, metal: 0, emissive: '#2a1d14' });
    this.sleeve = game.mats.solid('hand_sleeve', '#3a3e45', { rough: 0.92, metal: 0.05, emissive: '#0a0b0c' });
    this.chrome = game.mats.solid('hand_cap', '#c8ccd2', { rough: 0.25, metal: 1, emissive: '#101012' });
    this._buildHand();
    this._buildBottle();
  }

  get busy() { return this.t >= 0; }

  _mesh(m) { m.renderingGroupId = 1; m.isPickable = false; m.receiveShadows = false; m.applyFog = false; return m; }

  _buildHand() {
    const scene = this.scene;
    this.hand = new (B().TransformNode)('hand', scene); this.hand.parent = this.root;
    const P = (m, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { m.material = mat; m.parent = this.hand; m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return this._mesh(m); };
    // forearm + sleeve cuff come up from the lower right
    P(B().MeshBuilder.CreateBox('fa', { width: 0.075, height: 0.075, depth: 0.28 }, scene), this.sleeve, 0.1, -0.2, -0.02, 0.95, 0, -0.35);
    P(B().MeshBuilder.CreateBox('cuff', { width: 0.085, height: 0.085, depth: 0.05 }, scene), this.skin, 0.075, -0.115, 0.03, 0.95, 0, -0.35);
    // palm wraps the bottle body on the right side, fingers curl around the front, thumb behind
    P(B().MeshBuilder.CreateBox('palm', { width: 0.035, height: 0.1, depth: 0.06 }, scene), this.skin, 0.058, 0.09, 0.0, 0, 0, -0.1);
    for (let i = 0; i < 4; i++) {
      const f = B().MeshBuilder.CreateCylinder('fg', { diameter: 0.018, height: 0.085, tessellation: 8 }, scene);
      P(f, this.skin, 0.01, 0.135 - i * 0.026, 0.045, 0, 0, Math.PI / 2 + 0.25);
      const f2 = B().MeshBuilder.CreateCylinder('fg2', { diameter: 0.017, height: 0.045, tessellation: 8 }, scene);
      P(f2, this.skin, -0.03, 0.135 - i * 0.026, 0.028, Math.PI / 2 - 0.5, 0, 0);
    }
    P(B().MeshBuilder.CreateCylinder('th', { diameter: 0.02, height: 0.075, tessellation: 8 }, scene), this.skin, 0.0, 0.11, -0.045, 0, 0, Math.PI / 2 + 0.4);
  }

  _buildBottle() {
    const scene = this.scene;
    this.bottle = new (B().TransformNode)('hbottle', scene); this.bottle.parent = this.root;
    const mk = (dia, h, y, top = null, tess = 16) => { const c = B().MeshBuilder.CreateCylinder('hb', { diameter: dia, diameterTop: top ?? dia, diameterBottom: dia, height: h, tessellation: tess }, scene); c.position.y = y; c.parent = this.bottle; return this._mesh(c); };
    this.bBody = mk(0.076, 0.2, 0.1);
    this.bShoulder = mk(0.076, 0.05, 0.225, 0.036);
    this.bNeck = mk(0.036, 0.06, 0.28);
    this.bCap = mk(0.042, 0.02, 0.32, null, 12); this.bCap.material = this.chrome;
    this.bLabel = mk(0.079, 0.08, 0.105);
    this.bottle.setEnabled(false);
  }

  _perkMats(id) {
    const p = PERKS[id];
    if (!this._liquidMats.has(id)) {
      this._liquidMats.set(id, this.g.mats.solid('hand_liquid_' + id, p.color, { alpha: 0.9, metal: 0.05, rough: 0.1, emissive: p.color, emissiveIntensity: 0.3 }));
      const tex = this.g.textures.fromCanvas('hand_label_' + id, labelCanvas(id), { clamp: true });
      const m = new (B().StandardMaterial)('mat_hand_label_' + id, this.scene);
      m.diffuseTexture = tex; m.emissiveTexture = tex; m.emissiveColor = new (B().Color3)(0.7, 0.7, 0.7); m.specularColor = B().Color3.Black();
      this._labelMats.set(id, m);
    }
    return { liquid: this._liquidMats.get(id), label: this._labelMats.get(id) };
  }

  /** Perk bottle: raise, tilt to the mouth, gulp, toss. */
  drink(perkId) {
    if (!PERKS[perkId]) return;
    this._clearWeapon();
    const mats = this._perkMats(perkId);
    this.bBody.material = mats.liquid; this.bShoulder.material = mats.liquid; this.bNeck.material = mats.liquid; this.bLabel.material = mats.label;
    this.bottle.setEnabled(true); this.hand.setEnabled(true);
    this.bottle.position.set(0, 0, 0); this.bottle.rotation.set(0, Math.PI, 0);
    this.hand.position.set(0, -0.02, 0); this.hand.rotation.set(0, 0, 0);
    this.mode = 'drink'; this.perkId = perkId; this.t = 0; this.dur = DRINK_DUR; this._sipPlayed = false; this._tossPlayed = false; this._shown = false;
    this.root.setEnabled(true);
    this.g.viewModel.setVisible(false);
  }

  /** Push the held weapon forward into the Pack-a-Punch tray. */
  stow(weaponId) {
    this._clearWeapon();
    this.bottle.setEnabled(false); this.hand.setEnabled(false);
    if (WEAPONS[weaponId] && this.g.weaponCache) {
      this.weaponModel = cloneWeaponModel(this.g.weaponCache.get(weaponId), 'hand_w');
      this.weaponModel.root.parent = this.root;
      for (const m of this.weaponModel.meshes) this._mesh(m);
    }
    this.mode = 'stow'; this.t = 0; this.dur = STOW_DUR; this._shown = false;
    this.root.setEnabled(true);
    this.g.viewModel.setVisible(false);
  }

  _clearWeapon() { if (this.weaponModel) { this.weaponModel.dispose(); this.weaponModel = null; } }

  update(dt) {
    if (this.t < 0) return;
    this.t += dt;
    const t = this.t, vm = this.g.viewModel, r = this.root;
    if (this.mode === 'drink') {
      let px, py, pz, rx, rz;
      if (t < 0.32) { const k = easeOut(t / 0.32); px = lerp(0.32, 0.17, k); py = lerp(-0.6, -0.17, k); pz = lerp(0.42, 0.36, k); rx = lerp(0.35, 0.05, k); rz = lerp(-0.35, -0.05, k); }
      else if (t < 1.12) {
        const k = easeInOut((t - 0.32) / 0.45);
        const gulping = t > 0.55 && t < 1.05;
        const gulp = gulping ? Math.sin((t - 0.55) * 21) * 0.007 : 0;
        px = lerp(0.17, 0.1, k) + gulp * 0.4; py = lerp(-0.17, -0.03, k) + gulp; pz = lerp(0.36, 0.3, k); rx = lerp(0.05, -1.3, k) + gulp * 3; rz = lerp(-0.05, -0.18, k);
        if (!this._sipPlayed && t >= 0.55) { this._sipPlayed = true; audio.play('drink', { vol: 0.8, important: true }); }
        if (gulping && Math.random() < dt * 8) this.g.player.addShake(0.006);
      } else {
        const k = easeIn((t - 1.12) / 0.45);
        px = lerp(0.1, 0.45, k); py = lerp(-0.03, -0.7, k); pz = lerp(0.3, 0.5, k); rx = lerp(-1.3, 0.5, k); rz = lerp(-0.18, 1.4, k);
        if (!this._tossPlayed && t >= 1.2) { this._tossPlayed = true; audio.play('weapon_pickup', { vol: 0.3, pitch: 0.7 }); }
      }
      r.position.set(px, py, pz); r.rotation.set(rx, 0, rz);
      if (t >= 1.42 && !this._shown) { this._shown = true; this._restoreViewModel(); }
    } else if (this.mode === 'stow') {
      const k = easeIn(Math.min(1, t / 0.55));
      r.position.set(lerp(0.2, 0.02, k), lerp(-0.2, -0.32, k), lerp(0.42, 0.95, k));
      r.rotation.set(lerp(0, -0.4, k), 0, lerp(0, 0.15, k));
      if (t >= 0.55 && this.weaponModel && this.weaponModel.root.isEnabled()) this.weaponModel.root.setEnabled(false);
      if (t >= 0.75 && !this._shown) { this._shown = true; this._restoreViewModel(); }
    }
    if (!this._shown) vm.setVisible(false);
    if (t >= this.dur) { this.t = -1; this.mode = null; this.root.setEnabled(false); this._clearWeapon(); }
  }

  _restoreViewModel() {
    const vm = this.g.viewModel;
    vm.lower = 1; vm.lowerTarget = 0; // raise the weapon back into view
    vm.setVisible(this.g.player.state === PSTATE.ALIVE);
  }
}

function labelCanvas(id) {
  const p = PERKS[id];
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = p.accent; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = p.color; ctx.fillRect(0, 6, 256, 52);
  ctx.drawImage(perkIconCanvas(id, 48), 104, 8);
  ctx.fillStyle = p.accent; ctx.font = 'bold 20px Impact, "Arial Narrow", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(p.flavor, 52, 32); ctx.fillText(p.flavor, 204, 32);
  return c;
}
