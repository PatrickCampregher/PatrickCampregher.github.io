// Perk vending machines + Pack-a-Punch: procedural meshes and materials, idle animation (spinning display
// bottle, blinking pilot lamp, neon flicker, glow pulse, gears / pistons / electric arcs), purchase and
// upgrade sequences (bottle dispensing, weapon tray, drum spin-up, sparks, steam, sounds, screen shake),
// the machine point lights and the interactables used by the local player's prompt system.
/* global BABYLON */
import { PERKS } from '/shared/perks.js';
import { PAP } from '/shared/constants.js';
import { WEAPONS } from '/shared/weapons.js';
import { cloneWeaponModel } from '../weapons/weaponModels.js';
import { audio } from '../audio/audio.js';
import { fbm } from './textures.js';

const B = () => BABYLON;
const V3 = (x, y, z) => new (BABYLON.Vector3)(x, y, z);
const C3 = (hex) => BABYLON.Color3.FromHexString(hex);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeIn = (t) => Math.pow(clamp01(t), 3);
const easeInOut = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const PAP_COLOR = '#b45cff', PAP_LIGHT = '#c77dff';

// ---------------- canvas art (icons, signs, grime, hazard stripes) ----------------
function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/** Perk badge icon (HUD + machine emblems + bottle labels). Drawn at 64 units, scaled to `size`. */
export function perkIconCanvas(id, size = 64) {
  const p = PERKS[id] || PERKS.jugg;
  return canvas(size, size, (ctx, s) => {
    ctx.scale(s / 64, s / 64);
    roundRect(ctx, 2, 2, 60, 60, 13); ctx.fillStyle = p.color; ctx.fill();
    const grad = ctx.createLinearGradient(0, 0, 0, 64); grad.addColorStop(0, 'rgba(255,255,255,0.22)'); grad.addColorStop(0.5, 'rgba(255,255,255,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = grad; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = p.accent; ctx.stroke();
    ctx.fillStyle = p.accent; ctx.strokeStyle = p.accent; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (p.symbol) {
      case 'cap': { // crimped bottle cap with a J
        ctx.beginPath(); for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, r = i % 2 ? 23 : 19.5; ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } ctx.closePath(); ctx.fill();
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(32, 32, 15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.accent; ctx.font = 'bold 24px Impact, "Arial Narrow", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('J', 32, 33);
        break;
      }
      case 'cross': { // medical cross with a pulse line
        ctx.fillRect(25, 11, 14, 42); ctx.fillRect(11, 25, 42, 14);
        ctx.strokeStyle = p.color; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(14, 32); ctx.lineTo(25, 32); ctx.lineTo(28, 25); ctx.lineTo(33, 40); ctx.lineTo(36, 32); ctx.lineTo(50, 32); ctx.stroke();
        break;
      }
      case 'bottle': { // bottle silhouette with a lightning bolt
        ctx.beginPath(); ctx.moveTo(27, 9); ctx.lineTo(37, 9); ctx.lineTo(37, 19); ctx.quadraticCurveTo(45, 23, 45, 32); ctx.lineTo(45, 50); ctx.quadraticCurveTo(45, 56, 39, 56); ctx.lineTo(25, 56); ctx.quadraticCurveTo(19, 56, 19, 50); ctx.lineTo(19, 32); ctx.quadraticCurveTo(19, 23, 27, 19); ctx.closePath(); ctx.fill();
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(35, 25); ctx.lineTo(26, 38); ctx.lineTo(32, 38); ctx.lineTo(29, 50); ctx.lineTo(39, 35); ctx.lineTo(33, 35); ctx.closePath(); ctx.fill();
        break;
      }
      default: { // revolver + two rounds
        ctx.beginPath(); ctx.moveTo(11, 21); ctx.lineTo(53, 21); ctx.lineTo(53, 29); ctx.lineTo(31, 29); ctx.lineTo(27, 44); ctx.lineTo(17, 44); ctx.lineTo(20, 29); ctx.lineTo(11, 29); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(31, 26, 6.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(31, 26, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.accent; roundRect(ctx, 40, 35, 4.5, 13, 2); ctx.fill(); roundRect(ctx, 47, 35, 4.5, 13, 2); ctx.fill();
      }
    }
  });
}
function signCanvas(text, sub, accent, w = 512, h = 128) {
  return canvas(w, h, (ctx) => {
    ctx.fillStyle = '#0a0a0c'; ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.09)'); g.addColorStop(1, 'rgba(0,0,0,0.3)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = accent; ctx.lineWidth = 6; ctx.strokeRect(7, 7, w - 14, h - 14);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = accent; ctx.shadowBlur = 22; ctx.fillStyle = accent;
    ctx.font = `bold ${sub ? 60 : 68}px Impact, "Arial Narrow", sans-serif`;
    ctx.fillText(text.toUpperCase(), w / 2, sub ? h * 0.4 : h * 0.52);
    if (sub) { ctx.shadowBlur = 6; ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif'; ctx.fillStyle = '#fbfbff'; ctx.fillText(sub.toUpperCase(), w / 2, h * 0.8); }
  });
}
function labelCanvas(id) {
  const p = PERKS[id];
  return canvas(256, 64, (ctx, w, h) => {
    ctx.fillStyle = p.accent; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = p.color; ctx.fillRect(0, 6, w, h - 12);
    ctx.drawImage(perkIconCanvas(id, 48), w / 2 - 24, 8);
    ctx.fillStyle = p.accent; ctx.font = 'bold 20px Impact, "Arial Narrow", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.flavor, w * 0.22, h / 2); ctx.fillText(p.flavor, w * 0.78, h / 2);
  });
}
function grimeCanvas(n = 128, seed = 1) {
  return canvas(n, n, (ctx) => {
    const img = ctx.createImageData(n, n), d = img.data;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n;
      const nz = fbm(u * 5 + seed * 3, v * 5 + seed, 3);
      const edge = clamp01(Math.min(u, 1 - u) * 4);
      const a = clamp01((nz - 0.42) * 2.4) * edge * (0.25 + v * 0.75);
      const i = (y * n + x) * 4; d[i] = 22; d[i + 1] = 18; d[i + 2] = 14; d[i + 3] = a * 215;
    }
    ctx.putImageData(img, 0, 0);
  });
}
function hazardCanvas(n = 64) {
  return canvas(n, n, (ctx) => {
    ctx.fillStyle = '#d6b21f'; ctx.fillRect(0, 0, n, n);
    ctx.fillStyle = '#151515';
    for (let i = -n; i < n * 2; i += n / 2) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + n / 4, 0); ctx.lineTo(i + n / 4 - n, n); ctx.lineTo(i - n, n); ctx.closePath(); ctx.fill(); }
    // wear
    for (let k = 0; k < 40; k++) { ctx.fillStyle = `rgba(40,35,30,${0.15 + Math.random() * 0.3})`; ctx.fillRect(Math.random() * n, Math.random() * n, 1 + Math.random() * 4, 1 + Math.random() * 3); }
  });
}
function bottleCutoutCanvas(color) {
  return canvas(64, 192, (ctx, w, h) => {
    const path = () => { ctx.beginPath(); ctx.moveTo(24, 6); ctx.lineTo(40, 6); ctx.lineTo(40, 34); ctx.quadraticCurveTo(58, 44, 58, 70); ctx.lineTo(58, 172); ctx.quadraticCurveTo(58, 186, 44, 186); ctx.lineTo(20, 186); ctx.quadraticCurveTo(6, 186, 6, 172); ctx.lineTo(6, 70); ctx.quadraticCurveTo(6, 44, 24, 34); ctx.closePath(); };
    path(); ctx.fillStyle = '#050607'; ctx.fill();
    ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.strokeStyle = color; ctx.lineWidth = 4; path(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = color; ctx.globalAlpha = 0.55; ctx.fillRect(14, 120, 36, 52);
  });
}

// ---------------- mesh helpers ----------------
function mergeParts(list, mat, name, parent) {
  if (!list.length) return null;
  const m = list.length > 1 ? B().Mesh.MergeMeshes(list, true, true, undefined, false, false) : list[0];
  m.material = mat; m.name = name; m.parent = parent; m.isPickable = false; m.receiveShadows = true;
  return m;
}
/** Box whose faces tile a texture of world size `scale` (same trick as mapBuilder). */
function texBox(scene, w, h, d, scale) {
  const s = scale || 1;
  const faceUV = [new (B().Vector4)(0, 0, w / s, h / s), new (B().Vector4)(0, 0, w / s, h / s), new (B().Vector4)(0, 0, h / s, d / s), new (B().Vector4)(0, 0, h / s, d / s), new (B().Vector4)(0, 0, d / s, w / s), new (B().Vector4)(0, 0, d / s, w / s)];
  return B().MeshBuilder.CreateBox('tb', { width: w, height: h, depth: d, faceUV }, scene);
}
/** Local -> world for a machine root with rotation.y = yaw (front = +z local = (sin yaw, cos yaw) world). */
function toWorld(m, lx, ly, lz) { const c = Math.cos(m.yaw), s = Math.sin(m.yaw); return [m.x + lx * c + lz * s, m.y + ly, m.z - lx * s + lz * c]; }

const SHAPES = {
  jugg: { w: 1.1, d: 0.85, pillar: 0.12, win: { w: 0.62, y0: 0.82, y1: 1.5 }, slot: { y0: 0.34, y1: 0.56, w: 0.5 }, dome: true },
  revive: { w: 0.92, d: 0.8, pillar: 0.06, win: { w: 0.5, y0: 0.78, y1: 1.56 }, slot: { y0: 0.34, y1: 0.54, w: 0.42 }, antenna: true },
  speed: { w: 1.06, d: 0.85, pillar: 0.08, win: { w: 0.56, y0: 0.9, y1: 1.52 }, slot: { y0: 0.34, y1: 0.56, w: 0.48 }, cutout: true, ornament: true },
  dtap: { w: 1.1, d: 0.85, pillar: 0.1, win: { w: 0.6, y0: 0.82, y1: 1.5 }, slot: { y0: 0.34, y1: 0.56, w: 0.5 }, saloon: true, wood: true },
};

export function buildMachines(scene, world, mats, lighting, textures, effects, settings, game) {
  return new Machines(scene, world, mats, lighting, textures, effects, settings, game);
}

class Machines {
  constructor(scene, world, mats, lighting, textures, effects, settings, game) {
    this.scene = scene; this.world = world; this.mats = mats; this.lighting = lighting; this.textures = textures; this.effects = effects; this.settings = settings; this.game = game;
    this.perk = {}; this.pap = null;
    this.papState = { state: 'idle', user: 0, weapon: null, result: null, t: 0 };
    this.quality = effects.quality;
    this._shared();
    for (const m of world.machines) {
      const [fx, fz] = [Math.sin(m.yaw), Math.cos(m.yaw)];
      if (m.type === 'perk' && PERKS[m.perk]) {
        this.perk[m.perk] = new PerkMachine(this, PERKS[m.perk], m);
        game.mapVis.interactables.push({ kind: 'perk', id: m.perk, x: m.x + fx * 0.35, y: m.y + 1.15, z: m.z + fz * 0.35, range: 2.5, perk: PERKS[m.perk] });
      } else if (m.type === 'pap') {
        this.pap = new PapMachine(this, m);
        game.mapVis.interactables.push({ kind: 'pap', id: 'pap', x: m.x + fx * 0.7, y: m.y + 1.2, z: m.z + fz * 0.7, range: 2.9 });
      }
    }
    // late joiners: apply the machine state once the weapon models exist (first frame)
    this._pendingInit = game.initMsg && game.initMsg.pap ? game.initMsg.pap : null;
  }

  _shared() {
    const mats = this.mats, scene = this.scene;
    this.matDark = mats.solid('mach_dark', '#1a1b1e', { metal: 0.55, rough: 0.62 });
    this.matSteel = mats.solid('mach_steel', '#6d737a', { metal: 1, rough: 0.42 });
    this.matChrome = mats.solid('mach_chrome', '#c0c5cc', { metal: 1, rough: 0.2 });
    this.matInterior = mats.solid('mach_interior', '#07080a', { metal: 0.2, rough: 0.95 });
    this.grimeMat = mats.decal('mach_grime', this.textures.fromCanvas('mach_grime', grimeCanvas(128, 1), { clamp: true }), { emissive: '#000000' });
    this.grimeMat2 = mats.decal('mach_grime2', this.textures.fromCanvas('mach_grime2', grimeCanvas(128, 5), { clamp: true }), { emissive: '#000000' });
    const g = new (B().PBRMaterial)('mat_mach_glass', scene);
    g.albedoColor = C3('#9fd2e8'); g.alpha = 0.3; g.transparencyMode = B().Material.MATERIAL_ALPHABLEND;
    g.metallic = 0.15; g.roughness = 0.07; g.backFaceCulling = false; g.environmentIntensity = 1.2; g.usePhysicalLightFalloff = false; g.maxSimultaneousLights = 10;
    g.emissiveColor = new (B().Color3)(0.02, 0.04, 0.05);
    this.glassMat = g;
    this.hazardMat = (() => { const m = new (B().PBRMaterial)('mat_mach_hazard', scene); const t = this.textures.fromCanvas('mach_hazard', hazardCanvas(64)); t.wrapU = B().Texture.WRAP_ADDRESSMODE; t.wrapV = B().Texture.WRAP_ADDRESSMODE; m.albedoTexture = t; m.metallic = 0.3; m.roughness = 0.7; m.usePhysicalLightFalloff = false; m.maxSimultaneousLights = 10; return m; })();
  }

  /** Attach a machine light to its own meshes and to nearby static chunks that still have a light slot free. */
  attachLight(light, pos, ownMeshes) {
    for (const m of ownMeshes) if (m && !light.includedOnlyMeshes.includes(m)) light.includedOnlyMeshes.push(m);
    const statics = this.game.mapVis ? this.game.mapVis.staticMeshes : [];
    for (const m of statics) {
      if (!m.getBoundingInfo) continue;
      const bb = m.getBoundingInfo().boundingBox;
      const r = Math.hypot(bb.extendSizeWorld.x, bb.extendSizeWorld.y, bb.extendSizeWorld.z);
      if (B().Vector3.Distance(bb.centerWorld, pos) - r > light.range * 0.85) continue;
      let n = 0;
      for (const l of this.lighting.pointLights) if (l !== light && l.includedOnlyMeshes.includes(m)) n++;
      if (n >= 5) continue;
      light.includedOnlyMeshes.push(m);
    }
  }

  registerStatic(meshes, cast = true) {
    const mv = this.game.mapVis;
    for (const m of meshes) {
      if (!m) continue;
      m.computeWorldMatrix(true); m.refreshBoundingInfo();
      this.lighting.assignLights(m, 5);
      if (cast) { if (this.lighting.shadow) this.lighting.shadow.addShadowCaster(m, false); if (mv) mv.shadowCasters.push(m); }
      if (mv) mv.staticMeshes.push(m);
    }
  }

  shake(amount, x, z, radius) {
    const p = this.game.player; if (!p) return;
    const k = 1 - Math.hypot(p.x - x, p.z - z) / radius;
    if (k > 0) p.addShake(amount * k);
  }

  update(dt) {
    if (this._pendingInit) { const m = this._pendingInit; this._pendingInit = null; this.onPap(m, true); }
    if (!this._probeDone && this.game.probe) { this.glassMat.reflectionTexture = this.game.probe.cubeTexture; this._probeDone = true; }
    for (const id in this.perk) this.perk[id].update(dt);
    if (this.pap) this.pap.update(dt);
  }

  onPerk(m) {
    if (m.ev === 'buy') { const pm = this.perk[m.id]; if (pm) pm.buy(m.p === this.game.myId); }
  }

  onPap(m, initial = false) {
    const prev = this.papState;
    this.papState = { state: m.state, user: m.user || 0, weapon: m.weapon || null, result: m.result || null, t: initial && m.timer != null ? (m.state === 'processing' ? Math.max(0, (m.dur || PAP.processTime) - m.timer) : Math.max(0, PAP.pickupWindow - m.timer)) : 0, dur: m.dur || PAP.processTime, taken: !!m.taken };
    if (this.pap) this.pap.apply(this.papState, prev, initial);
  }
}

// =====================================================================================================
// Perk vending machine
// =====================================================================================================
class PerkMachine {
  constructor(M, def, m) {
    this.M = M; this.def = def; this.m = m; this.id = def.id;
    const scene = M.scene;
    this.root = new (B().TransformNode)('perk_' + def.id, scene);
    this.root.position.set(m.x, m.y, m.z); this.root.rotation.y = m.yaw;
    this.t = Math.random() * 10; this.buyT = -1; this.flash = 0; this.flickerT = 0; this.flickerK = 1; this.lampOn = true; this.lampT = Math.random();
    this.pos = [m.x, m.y + 1.1, m.z];
    this.hum = null;
    this._build();
  }

  _build() {
    const M = this.M, scene = M.scene, mats = M.mats, def = this.def, S = SHAPES[this.id], root = this.root;
    const W = S.w, D = S.d, hw = W / 2, hd = D / 2, H = 2.1;
    const g = { body: [], dark: [], accent: [], chrome: [], wood: [], emis: [] };
    const box = (grp, w, h, d, x, y, z) => { const b = B().MeshBuilder.CreateBox('mp', { width: w, height: h, depth: d }, scene); b.position.set(x, y, z); g[grp].push(b); return b; };
    const cyl = (grp, dia, h, x, y, z, rx = 0, rz = 0, tess = 18, diaTop = null) => { const c = B().MeshBuilder.CreateCylinder('mc', { diameter: dia, diameterTop: diaTop ?? dia, diameterBottom: dia, height: h, tessellation: tess }, scene); c.position.set(x, y, z); c.rotation.x = rx; c.rotation.z = rz; g[grp].push(c); return c; };
    const sideGrp = S.wood ? 'wood' : 'body';
    // materials
    const matBody = mats.solid('mach_body_' + this.id, def.color, { metal: 0.35, rough: 0.42 });
    const matAccent = mats.solid('mach_acc_' + this.id, def.accent, { metal: 0.5, rough: 0.38 });
    const matEmis = mats.solid('mach_em_' + this.id, def.light, { emissive: def.light, emissiveIntensity: 1.6, rough: 0.4 });
    const matWood = S.wood ? mats.get('wood_dark') : null;
    // plinth
    box('dark', W, 0.14, D, 0, 0.07, 0);
    // cabinet shell
    const y0 = 0.14, top = 1.76, ch = top - y0, fz = hd - 0.03, ft = 0.06;
    if (S.wood) { const bk = texBox(scene, W - 0.04, ch, 0.05, 1.5); bk.position.set(0, y0 + ch / 2, -hd + 0.03); g.wood.push(bk); const l = texBox(scene, 0.05, ch, D - 0.06, 1.5); l.position.set(-hw + 0.03, y0 + ch / 2, 0); g.wood.push(l); const r = texBox(scene, 0.05, ch, D - 0.06, 1.5); r.position.set(hw - 0.03, y0 + ch / 2, 0); g.wood.push(r); }
    else { box(sideGrp, W - 0.04, ch, 0.05, 0, y0 + ch / 2, -hd + 0.03); box(sideGrp, 0.05, ch, D - 0.06, -hw + 0.03, y0 + ch / 2, 0); box(sideGrp, 0.05, ch, D - 0.06, hw - 0.03, y0 + ch / 2, 0); }
    box('body', W - 0.04, 0.05, D - 0.06, 0, top - 0.025, 0);      // cabinet roof
    box('dark', W - 0.1, 0.04, D - 0.1, 0, y0 + 0.02, 0);          // inner floor
    // front panels around the dispenser slot and the window
    const sl = S.slot, wn = S.win, fw = W - 0.04;
    box('body', fw, sl.y0 - y0, ft, 0, (y0 + sl.y0) / 2, fz);
    box('body', fw, wn.y0 - sl.y1, ft, 0, (sl.y1 + wn.y0) / 2, fz);
    box('body', (fw - sl.w) / 2, sl.y1 - sl.y0, ft, -(sl.w / 2 + (fw - sl.w) / 4), (sl.y0 + sl.y1) / 2, fz);
    box('body', (fw - sl.w) / 2, sl.y1 - sl.y0, ft, (sl.w / 2 + (fw - sl.w) / 4), (sl.y0 + sl.y1) / 2, fz);
    box('body', fw, top - wn.y1, ft, 0, (wn.y1 + top) / 2, fz);
    box('body', (fw - wn.w) / 2, wn.y1 - wn.y0, ft, -(wn.w / 2 + (fw - wn.w) / 4), (wn.y0 + wn.y1) / 2, fz);
    box('body', (fw - wn.w) / 2, wn.y1 - wn.y0, ft, (wn.w / 2 + (fw - wn.w) / 4), (wn.y0 + wn.y1) / 2, fz);
    // dispenser slot recess (dark tunnel) + chrome lip
    const sd = 0.32;
    box('dark', sl.w, 0.02, sd, 0, sl.y0 + 0.01, fz - sd / 2); box('dark', sl.w, 0.02, sd, 0, sl.y1 - 0.01, fz - sd / 2);
    box('dark', 0.02, sl.y1 - sl.y0, sd, -sl.w / 2 + 0.01, (sl.y0 + sl.y1) / 2, fz - sd / 2); box('dark', 0.02, sl.y1 - sl.y0, sd, sl.w / 2 - 0.01, (sl.y0 + sl.y1) / 2, fz - sd / 2);
    box('dark', sl.w, sl.y1 - sl.y0, 0.02, 0, (sl.y0 + sl.y1) / 2, fz - sd);
    box('chrome', sl.w + 0.1, 0.03, 0.07, 0, sl.y0 - 0.01, fz + 0.03);
    box('chrome', sl.w + 0.1, 0.02, 0.03, 0, sl.y1 + 0.01, fz + 0.02);
    // window recess, back wall, chrome frame, shelves
    const wd = 0.36;
    box('dark', wn.w, 0.02, wd, 0, wn.y0 + 0.01, fz - wd / 2); box('dark', wn.w, 0.02, wd, 0, wn.y1 - 0.01, fz - wd / 2);
    box('dark', 0.02, wn.y1 - wn.y0, wd, -wn.w / 2 + 0.01, (wn.y0 + wn.y1) / 2, fz - wd / 2); box('dark', 0.02, wn.y1 - wn.y0, wd, wn.w / 2 - 0.01, (wn.y0 + wn.y1) / 2, fz - wd / 2);
    box('dark', wn.w, wn.y1 - wn.y0, 0.02, 0, (wn.y0 + wn.y1) / 2, fz - wd);
    box('chrome', wn.w + 0.08, 0.04, 0.03, 0, wn.y0 - 0.02, fz + 0.03); box('chrome', wn.w + 0.08, 0.04, 0.03, 0, wn.y1 + 0.02, fz + 0.03);
    box('chrome', 0.04, wn.y1 - wn.y0 + 0.08, 0.03, -wn.w / 2 - 0.02, (wn.y0 + wn.y1) / 2, fz + 0.03); box('chrome', 0.04, wn.y1 - wn.y0 + 0.08, 0.03, wn.w / 2 + 0.02, (wn.y0 + wn.y1) / 2, fz + 0.03);
    const rowH = (wn.y1 - wn.y0) / 3;
    const shelfY = [wn.y0 + 0.02, wn.y0 + rowH, wn.y0 + rowH * 2];
    for (let i = 1; i < 3; i++) box('chrome', wn.w - 0.04, 0.015, wd - 0.08, 0, shelfY[i], fz - wd / 2 - 0.02);
    // side pillars + crown + marquee header
    box('accent', S.pillar, ch + 0.06, D - 0.02, -hw + S.pillar / 2 - 0.02, y0 + ch / 2, 0.01); box('accent', S.pillar, ch + 0.06, D - 0.02, hw - S.pillar / 2 + 0.02, y0 + ch / 2, 0.01);
    box('accent', W + 0.04, 0.05, D + 0.02, 0, top + 0.025, 0);
    const mq = S.wood ? 'wood' : 'accent';
    if (S.wood) { const mb = texBox(scene, W - 0.02, 0.3, 0.22, 1.5); mb.position.set(0, 1.91, hd - 0.11); g.wood.push(mb); } else box(mq, W - 0.02, 0.3, 0.22, 0, 1.91, hd - 0.11);
    box('dark', W - 0.02, 0.28, 0.4, 0, 1.9, hd - 0.42);                    // marquee back / roof housing
    box('chrome', W + 0.02, 0.03, 0.24, 0, 2.07, hd - 0.12);                 // marquee top trim
    // coin panel: chrome plate, slit, button, pilot lamp
    const cx = hw - (fw - wn.w) / 4 - 0.01;
    box('chrome', 0.11, 0.26, 0.012, cx, wn.y0 + 0.3, fz + 0.036);
    box('dark', 0.03, 0.1, 0.012, cx, wn.y0 + 0.34, fz + 0.044);
    cyl('accent', 0.05, 0.02, cx, wn.y0 + 0.2, fz + 0.044, Math.PI / 2);
    // colour stripes (accent) across the lower panel
    box('accent', fw - 0.04, 0.045, 0.006, 0, sl.y1 + 0.1, fz + 0.033); box('accent', fw - 0.04, 0.02, 0.006, 0, sl.y1 + 0.17, fz + 0.033);
    // rubber feet bumps
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box('dark', 0.12, 0.03, 0.12, sx * (hw - 0.1), -0.005, sz * (hd - 0.1));
    // ---- unique silhouettes ----
    if (S.dome) cyl('body', 0.62, W - 0.18, 0, 1.95, -0.15, 0, Math.PI / 2, 22);                       // Juggernog: bulging dome behind the marquee
    if (S.antenna) { cyl('chrome', 0.035, 0.5, 0, 2.33, -0.2); box('emis', 0.26, 0.07, 0.04, 0, 2.6, -0.2); box('emis', 0.07, 0.26, 0.04, 0, 2.6, -0.2); }  // Quick Revive: tall pole with a glowing cross
    if (S.saloon) {                                                                                     // Double Tap: stepped western false front + corner lanterns
      const c = texBox(scene, 0.5, 0.22, 0.2, 1.5); c.position.set(0, 2.19, hd - 0.11); g.wood.push(c);
      const l = texBox(scene, 0.3, 0.1, 0.2, 1.5); l.position.set(-0.4, 2.13, hd - 0.11); g.wood.push(l);
      const r = texBox(scene, 0.3, 0.1, 0.2, 1.5); r.position.set(0.4, 2.13, hd - 0.11); g.wood.push(r);
      box('emis', 0.06, 0.09, 0.06, -hw + 0.02, 2.13, hd - 0.02); box('emis', 0.06, 0.09, 0.06, hw - 0.02, 2.13, hd - 0.02);
      box('chrome', 0.5, 0.03, 0.22, 0, 2.31, hd - 0.11);
    }
    // merge static groups
    this.meshes = [];
    const merged = {
      body: mergeParts(g.body, matBody, 'pm_body', root), dark: mergeParts(g.dark, M.matDark, 'pm_dark', root), accent: mergeParts(g.accent, matAccent, 'pm_accent', root),
      chrome: mergeParts(g.chrome, M.matChrome, 'pm_chrome', root), wood: mergeParts(g.wood, matWood || M.matDark, 'pm_wood', root), emis: mergeParts(g.emis, matEmis, 'pm_emis', root),
    };
    for (const k in merged) if (merged[k]) this.meshes.push(merged[k]);
    // window glass
    const glass = B().MeshBuilder.CreatePlane('pm_glass', { width: wn.w, height: wn.y1 - wn.y0 }, scene);
    glass.position.set(0, (wn.y0 + wn.y1) / 2, fz + 0.012); glass.rotation.y = Math.PI; glass.material = M.glassMat; glass.parent = root; glass.isPickable = false;
    // backlight glow inside the window (pulses)
    this.glowMat = mats.glow('mach_' + this.id, def.light, 0.22);
    const glow = B().MeshBuilder.CreatePlane('pm_glow', { width: wn.w - 0.04, height: wn.y1 - wn.y0 - 0.04, sideOrientation: B().Mesh.DOUBLESIDE }, scene);
    glow.position.set(0, (wn.y0 + wn.y1) / 2, fz - wd + 0.02); glow.material = this.glowMat; glow.parent = root; glow.isPickable = false;
    // sign (neon, flickers) + emblem + grime decals + bottle cutouts
    const signTex = M.textures.fromCanvas('mach_sign_' + this.id, signCanvas(def.name, def.tagline, def.accent), { clamp: true });
    this.signMat = new (B().StandardMaterial)('mat_sign_' + this.id, scene);
    this.signMat.diffuseTexture = signTex; this.signMat.emissiveTexture = signTex; this.signMat.disableLighting = true; this.signMat.specularColor = B().Color3.Black();
    const sign = B().MeshBuilder.CreatePlane('pm_sign', { width: W - 0.12, height: 0.24 }, scene);
    sign.position.set(0, 1.91, hd + 0.004); sign.rotation.y = Math.PI; sign.material = this.signMat; sign.parent = root; sign.isPickable = false;
    const embTex = M.textures.fromCanvas('mach_emblem_' + this.id, perkIconCanvas(this.id, 128), { clamp: true });
    const embMat = mats.decal('mach_emblem_' + this.id, embTex, { emissive: '#ffffff', unlit: true });
    const embS = Math.min(0.24, top - wn.y1 - 0.03);
    const emblem = B().MeshBuilder.CreatePlane('pm_emblem', { width: embS, height: embS, sideOrientation: B().Mesh.DOUBLESIDE }, scene);
    emblem.position.set(0, (wn.y1 + top) / 2, fz + ft / 2 + 0.004); emblem.rotation.y = Math.PI; emblem.material = embMat; emblem.parent = root; emblem.isPickable = false;
    for (const [mat, x, y, w, h, z, ry] of [[M.grimeMat, 0, 0.48, W - 0.1, 0.6, fz + ft / 2 + 0.003, Math.PI], [M.grimeMat2, hw + 0.002, 0.55, D - 0.1, 0.8, 0, Math.PI / 2], [M.grimeMat, -hw - 0.002, 0.5, D - 0.1, 0.7, 0, -Math.PI / 2]]) {
      const gp = B().MeshBuilder.CreatePlane('pm_grime', { width: w, height: h, sideOrientation: B().Mesh.DOUBLESIDE }, scene);
      gp.position.set(x, y, z); gp.rotation.y = ry; gp.material = mat; gp.parent = root; gp.isPickable = false;
    }
    if (S.cutout) {
      const ct = M.textures.fromCanvas('mach_cut_' + this.id, bottleCutoutCanvas(def.light), { clamp: true });
      const cm = mats.decal('mach_cut_' + this.id, ct, { emissive: '#ffffff', unlit: true });
      for (const sx of [-1, 1]) { const cp = B().MeshBuilder.CreatePlane('pm_cut', { width: 0.13, height: 0.4, sideOrientation: B().Mesh.DOUBLESIDE }, scene); cp.position.set(sx * (wn.w / 2 + (fw - wn.w) / 4), (wn.y0 + wn.y1) / 2, fz + ft / 2 + 0.004); cp.rotation.y = Math.PI; cp.material = cm; cp.parent = root; cp.isPickable = false; }
    }
    // pilot lamp (blinks)
    this.lampMat = mats.solid('mach_lamp_' + this.id, def.light, { emissive: def.light, emissiveIntensity: 3, rough: 0.3 });
    const lamp = B().MeshBuilder.CreateSphere('pm_lamp', { diameter: 0.035, segments: 8 }, scene);
    lamp.position.set(cx, wn.y0 + 0.08, fz + 0.045); lamp.material = this.lampMat; lamp.parent = root; lamp.isPickable = false;
    // Speed Cola: rotating bottle-cap ornament on the roof
    if (S.ornament) {
      cyl('chrome', 0.03, 0.14, 0, 2.14, -0.18);
      const cap = B().MeshBuilder.CreateCylinder('pm_cap', { diameter: 0.3, height: 0.1, tessellation: 14 }, scene);
      const capIn = B().MeshBuilder.CreateCylinder('pm_capin', { diameter: 0.24, height: 0.104, tessellation: 14 }, scene);
      const ornament = B().Mesh.MergeMeshes([cap, capIn], true, true, undefined, false, false);
      ornament.material = matAccent; ornament.position.set(0, 2.26, -0.18); ornament.parent = root; ornament.isPickable = false;
      const capTop = B().MeshBuilder.CreatePlane('pm_capemb', { width: 0.2, height: 0.2, sideOrientation: B().Mesh.DOUBLESIDE }, scene);
      capTop.rotation.x = Math.PI / 2; capTop.position.y = 0.052; capTop.material = embMat; capTop.parent = ornament; capTop.isPickable = false;
      this.ornament = ornament;
      this.meshes.push(mergeParts(g.chrome.splice(0), M.matChrome, 'pm_chrome2', root));
    }
    // bottles: one base mesh (multi-material), instanced on the shelves + a spinning display bottle + the dispensed one
    this.bottleBase = this._buildBottle(matEmis, matAccent);
    this.bottleBase.parent = root;
    const bz = fz - wd / 2 - 0.02;
    for (let r = 0; r < 3; r++) {
      const n = r === 2 ? 2 : 5, span = wn.w - 0.14;
      for (let i = 0; i < n; i++) {
        const x = r === 2 ? (i === 0 ? -span / 2 : span / 2) : -span / 2 + span * (i / (n - 1));
        const inst = this.bottleBase.createInstance('pm_b' + r + i);
        inst.position.set(x, shelfY[r] + 0.008, bz + (Math.random() - 0.5) * 0.04); inst.scaling.setAll(0.58); inst.rotation.y = Math.random() * 6.28; inst.parent = root; inst.isPickable = false;
      }
    }
    this.display = this.bottleBase.createInstance('pm_display');
    this.displayY = shelfY[2] + 0.02;
    this.display.position.set(0, this.displayY, bz); this.display.scaling.setAll(0.68); this.display.parent = root; this.display.isPickable = false;
    this.slotBottle = this.bottleBase.createInstance('pm_slotb');
    this.slotBottle.position.set(0, sl.y0 + 0.02, fz - 0.22); this.slotBottle.scaling.setAll(0.6); this.slotBottle.parent = root; this.slotBottle.isPickable = false; this.slotBottle.setEnabled(false);
    this.slotZ0 = fz - 0.24; this.slotZ1 = fz + 0.08; this.slotY = sl.y0 + 0.02;
    // light
    const lp = toWorld(this.m, 0, 1.45, 0.65);
    this.lightBase = 1.5;
    this.light = M.lighting.addPointLight('perklight_' + this.id, lp, def.light, this.lightBase, 7, false);
    M.attachLight(this.light, V3(lp[0], lp[1], lp[2]), [...this.meshes, glass, lamp, this.bottleBase]);
    // shadows + nearby lamps for the static parts
    M.registerStatic(this.meshes, true);
    this.meshes.forEach(m => m.freezeWorldMatrix());
    glass.freezeWorldMatrix(); sign.freezeWorldMatrix(); emblem.freezeWorldMatrix();
  }

  _buildBottle(matLabel, matCap) {
    const M = this.M, scene = M.scene, mats = M.mats;
    const liquid = mats.solid('mach_liquid_' + this.id, this.def.color, { metal: 0.15, rough: 0.12, emissive: this.def.color, emissiveIntensity: 0.35 });
    const mk = (dia, h, y, top = null, tess = 12) => { const c = B().MeshBuilder.CreateCylinder('bt', { diameter: dia, diameterTop: top ?? dia, diameterBottom: dia, height: h, tessellation: tess }, scene); c.position.y = y; return c; };
    const body = mk(0.09, 0.2, 0.1); body.material = liquid;
    const shoulder = mk(0.09, 0.05, 0.225, 0.04); shoulder.material = liquid;
    const neck = mk(0.04, 0.05, 0.275); neck.material = liquid;
    const cap = mk(0.046, 0.022, 0.311, null, 10); cap.material = matCap;
    const label = mk(0.093, 0.08, 0.1); label.material = matLabel;
    const merged = B().Mesh.MergeMeshes([body, shoulder, neck, cap, label], true, true, undefined, false, true);
    merged.name = 'pm_bottle'; merged.isVisible = false; merged.isPickable = false;
    return merged;
  }

  /** Purchase (any player): bottle slides out, glow flash, sounds; the buyer also gets the drink animation. */
  buy(isMe) {
    this.buyT = 0; this.flash = 1; this.isMe = isMe;
    this._events = [[0, 'perk_buy'], [0.15, 'jingle'], isMe ? [0.35, 'announce'] : null, [0.55, 'take']].filter(Boolean);
    audio.play('perk_buy', { pos: this.pos, vol: 1.0, ref: 3, max: 30, important: isMe });
    this.slotBottle.setEnabled(true);
    this.slotBottle.position.set(0, this.slotY, this.slotZ0); this.slotBottle.scaling.setAll(0.6);
  }

  update(dt) {
    const M = this.M;
    this.t += dt;
    const t = this.t;
    if (!this.hum && audio.ready) this.hum = audio.play('machine_hum', { loop: true, pos: this.pos, vol: 0.4, ref: 1.6, max: 14, bus: 'ambient', offset: Math.random() * 1.9 });
    // display bottle spin + bob
    this.display.rotation.y += dt * 0.9;
    this.display.position.y = this.displayY + Math.sin(t * 1.4) * 0.006;
    if (this.ornament) this.ornament.rotation.y += dt * 1.3;
    // pilot lamp blink
    this.lampT += dt;
    if (this.lampT > (this.lampOn ? 0.9 : 0.45)) { this.lampT = 0; this.lampOn = !this.lampOn; this.lampMat.emissiveIntensity = this.lampOn ? 3 : 0.15; }
    // neon flicker (occasional dropouts + 60 Hz shimmer)
    this.flickerT -= dt;
    if (this.flickerT <= 0) {
      if (Math.random() < 0.05) { this.flickerK = 0.15 + Math.random() * 0.4; this.flickerT = 0.04 + Math.random() * 0.1; }
      else { this.flickerK = 1; this.flickerT = 0.08 + Math.random() * 0.1; }
    }
    const sk = this.flickerK * (0.94 + 0.06 * Math.sin(t * 60)) + this.flash * 0.7;
    this.signMat.emissiveColor.set(sk, sk, sk);
    // glow pulse + light
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.7);
    this.glowMat.alpha = 0.14 + pulse * 0.12 + this.flash * 0.5;
    this.light.intensity = this.lightBase * (0.85 + pulse * 0.3) * (0.6 + 0.4 * this.flickerK) + this.flash * 7;
    this.flash = Math.max(0, this.flash - dt * 2.0);
    // purchase sequence
    if (this.buyT >= 0) {
      this.buyT += dt;
      const bt = this.buyT;
      while (this._events.length && bt >= this._events[0][0]) {
        const ev = this._events.shift()[1];
        if (ev === 'jingle') audio.play('jingle_' + this.id, { pos: this.pos, vol: 0.9, ref: 5, max: 45, important: this.isMe });
        else if (ev === 'announce') { audio.play('announcer', { vol: 0.9, important: true }); if (M.game.handAnim) M.game.handAnim.drink(this.id); }
      }
      const sb = this.slotBottle;
      if (bt < 0.55) { const k = easeOut(bt / 0.55); sb.position.z = lerp(this.slotZ0, this.slotZ1, k); sb.position.y = this.slotY + Math.abs(Math.sin(k * Math.PI * 2)) * 0.01 * (1 - k); }
      else if (bt < 0.9) { const k = (bt - 0.55) / 0.35; sb.position.y = this.slotY + easeIn(k) * 0.2; sb.position.z = this.slotZ1 + k * 0.12; const s = 0.6 * (1 - easeIn(k) * 0.7); sb.scaling.setAll(s); }
      else { sb.setEnabled(false); if (bt > 1.2) this.buyT = -1; }
    }
  }
}

// =====================================================================================================
// Pack-a-Punch
// =====================================================================================================
class PapMachine {
  constructor(M, m) {
    this.M = M; this.m = m;
    const scene = M.scene;
    this.root = new (B().TransformNode)('pap', scene);
    this.root.position.set(m.x, m.y, m.z); this.root.rotation.y = m.yaw;
    this.pos = [m.x, m.y + 1.3, m.z];
    this.t = 0; this.state = 'idle'; this.st = 0; this.dur = PAP.processTime; this.user = 0;
    this.drumSpeed = 0; this.gearK = 0; this.arcT = 1.0; this.sparkT = 0; this.zapT = 0; this.shakeT = 0;
    this.trayZ = 0; this.trayTarget = 0; this.trayModel = null; this.trayModelId = null; this.auraOn = false;
    this.spinHandle = null; this.hum = null; this.flash = 0;
    this._build();
  }

  _build() {
    const M = this.M, scene = M.scene, mats = M.mats, root = this.root;
    const g = { dark: [], steel: [], chrome: [], purple: [], hazard: [], panel: [] };
    const box = (grp, w, h, d, x, y, z) => { const b = B().MeshBuilder.CreateBox('pp', { width: w, height: h, depth: d }, scene); b.position.set(x, y, z); g[grp].push(b); return b; };
    const cyl = (grp, dia, h, x, y, z, rx = 0, rz = 0, tess = 18) => { const c = B().MeshBuilder.CreateCylinder('pc', { diameter: dia, height: h, tessellation: tess }, scene); c.position.set(x, y, z); c.rotation.x = rx; c.rotation.z = rz; g[grp].push(c); return c; };
    const matPurple = mats.solid('pap_purple', PAP_COLOR, { emissive: PAP_COLOR, emissiveIntensity: 1.8, rough: 0.35, metal: 0.2 });
    const matPanel = mats.get('metal_panel');
    // base slab + hazard trims
    box('dark', 2.6, 0.22, 1.7, 0, 0.11, 0);
    box('hazard', 2.6, 0.08, 0.05, 0, 0.26, 0.825); box('hazard', 0.05, 0.08, 1.7, -1.275, 0.26, 0); box('hazard', 0.05, 0.08, 1.7, 1.275, 0.26, 0);
    // side towers (corrugated steel) with dark front plates and rivets
    for (const sx of [-1, 1]) {
      const tw = texBox(scene, 0.55, 1.95, 1.5, 3); tw.position.set(sx * 1.0, 1.195, -0.05); g.panel.push(tw);
      box('dark', 0.5, 1.8, 0.05, sx * 1.0, 1.2, 0.72);
      for (let i = 0; i < 6; i++) for (const ox of [-0.19, 0.19]) box('chrome', 0.03, 0.03, 0.02, sx * 1.0 + ox, 0.42 + i * 0.3, 0.75);
      box('steel', 0.6, 0.06, 1.56, sx * 1.0, 2.2, -0.05);
      // pistons on top
      cyl('chrome', 0.2, 0.36, sx * 1.0, 2.4, -0.35);
    }
    // top beam with emissive strip + marquee
    box('dark', 2.7, 0.24, 0.9, 0, 2.18, -0.25);
    box('purple', 2.5, 0.035, 0.03, 0, 2.08, 0.21);
    box('chrome', 2.72, 0.03, 0.92, 0, 2.31, -0.25);
    // drum cradle + rear housing
    box('dark', 1.1, 0.32, 1.2, 0, 0.38, -0.1);
    box('dark', 1.3, 1.5, 0.3, 0, 1.15, -0.72);
    // porthole ring + tunnel + tray dock
    const ring = B().MeshBuilder.CreateTorus('pp_ring', { diameter: 0.78, thickness: 0.07, tessellation: 24 }, scene); ring.position.set(0, 1.15, 0.5); ring.rotation.x = Math.PI / 2; g.chrome.push(ring);
    cyl('dark', 0.66, 0.5, 0, 1.15, 0.25, Math.PI / 2, 0, 20);
    box('dark', 1.1, 0.06, 0.55, 0, 0.6, 0.6);                            // tray dock ledge
    box('hazard', 1.1, 0.04, 0.03, 0, 0.615, 0.87);
    box('dark', 0.05, 0.16, 0.55, -0.55, 0.7, 0.6); box('dark', 0.05, 0.16, 0.55, 0.55, 0.7, 0.6);   // dock side rails
    // arc posts on the beam
    this.postTips = [];
    for (const [px, pz] of [[-0.95, -0.55], [0.95, -0.55], [-0.95, 0.05], [0.95, 0.05]]) {
      cyl('chrome', 0.05, 0.36, px, 2.5, pz); const s = B().MeshBuilder.CreateSphere('pp_tip', { diameter: 0.09, segments: 8 }, scene); s.position.set(px, 2.7, pz); g.chrome.push(s);
      this.postTips.push(toWorld(this.m, px, 2.7, pz));
    }
    // merge statics
    this.meshes = [];
    const merged = { dark: mergeParts(g.dark, M.matDark, 'pap_dark', root), steel: mergeParts(g.steel, M.matSteel, 'pap_steel', root), chrome: mergeParts(g.chrome, M.matChrome, 'pap_chrome', root), purple: mergeParts(g.purple, matPurple, 'pap_purple', root), hazard: mergeParts(g.hazard, M.hazardMat, 'pap_hazard', root), panel: mergeParts(g.panel, matPanel, 'pap_panel', root) };
    for (const k in merged) if (merged[k]) this.meshes.push(merged[k]);
    // hex drum (spins around its front-loading axis) with emissive rings
    this.drumPivot = new (B().TransformNode)('pap_drumpivot', scene); this.drumPivot.parent = root; this.drumPivot.position.set(0, 1.15, -0.1);
    const drum = B().MeshBuilder.CreateCylinder('pap_drum', { diameter: 1.28, height: 1.15, tessellation: 6 }, scene);
    drum.rotation.x = Math.PI / 2; drum.material = mats.get('metal_dark'); drum.parent = this.drumPivot; drum.isPickable = false; drum.receiveShadows = true;
    const rings = [];
    for (const rz of [-0.45, 0.0, 0.42]) { const r = B().MeshBuilder.CreateTorus('pap_ring', { diameter: 1.3, thickness: 0.045, tessellation: 6 }, scene); r.position.z = rz; r.rotation.x = Math.PI / 2; r.rotation.y = Math.PI / 6; rings.push(r); }
    const ringM = B().Mesh.MergeMeshes(rings, true, true, undefined, false, false); ringM.material = matPurple; ringM.parent = this.drumPivot; ringM.isPickable = false;
    this.drum = drum; this.drumRings = ringM;
    // pulsing core deep inside the porthole + additive halo
    this.coreMat = mats.solid('pap_core', PAP_LIGHT, { emissive: PAP_LIGHT, emissiveIntensity: 2.5, rough: 0.2 });
    this.core = B().MeshBuilder.CreateSphere('pap_core', { diameter: 0.3, segments: 12 }, scene);
    this.core.position.set(0, 1.15, 0.12); this.core.material = this.coreMat; this.core.parent = root; this.core.isPickable = false;
    this.haloMat = mats.glow('pap_halo', PAP_LIGHT, 0.35);
    this.halo = B().MeshBuilder.CreatePlane('pap_halo', { size: 0.7 }, scene);
    this.halo.position.set(0, 1.15, 0.52); this.halo.material = this.haloMat; this.halo.billboardMode = B().Mesh.BILLBOARDMODE_ALL; this.halo.parent = root; this.halo.isPickable = false;
    // gears (instances of one mesh, spinning at different speeds)
    const gearBase = this._buildGear();
    gearBase.parent = root;
    this.gears = [];
    const gearDefs = [[-1.0, 0.72, 0.76, 0.5, 1], [-1.0, 1.5, 0.76, 0.42, -1.2], [1.0, 0.72, 0.76, 0.5, -1], [1.0, 1.5, 0.76, 0.42, 1.2], [-0.55, 2.18, 0.22, 0.34, 1.6], [0.55, 2.18, 0.22, 0.34, -1.6]];
    for (const [x, y, z, s, spd] of gearDefs) {
      const piv = new (B().TransformNode)('pap_gearpiv', scene); piv.parent = root; piv.position.set(x, y, z); piv.rotation.z = Math.random() * 6;
      const inst = gearBase.createInstance('pap_gear'); inst.parent = piv; inst.rotation.x = Math.PI / 2; inst.scaling.setAll(s / 0.34); inst.isPickable = false;
      this.gears.push({ piv, spd });
    }
    // piston rods
    this.rods = [];
    for (const sx of [-1, 1]) { const rod = B().MeshBuilder.CreateCylinder('pap_rod', { diameter: 0.09, height: 0.36, tessellation: 12 }, scene); rod.material = M.matSteel; rod.parent = root; rod.position.set(sx * 1.0, 2.7, -0.35); rod.isPickable = false; this.rods.push(rod); }
    // marquee sign
    const signTex = M.textures.fromCanvas('pap_sign', signCanvas('Pack-a-Punch', 'weapon upgrade  -  5000', PAP_LIGHT, 1024, 160), { clamp: true });
    this.signMat = new (B().StandardMaterial)('mat_pap_sign', scene);
    this.signMat.diffuseTexture = signTex; this.signMat.emissiveTexture = signTex; this.signMat.disableLighting = true; this.signMat.specularColor = B().Color3.Black();
    const sign = B().MeshBuilder.CreatePlane('pap_sign', { width: 1.7, height: 0.27 }, scene);
    sign.position.set(0, 2.18, 0.206); sign.rotation.y = Math.PI; sign.material = this.signMat; sign.parent = root; sign.isPickable = false;
    // grime
    for (const [mat, x, y, w, h, z, ry] of [[M.grimeMat, -1.0, 0.75, 0.48, 1.0, 0.746, Math.PI], [M.grimeMat2, 1.0, 0.7, 0.48, 1.0, 0.746, Math.PI], [M.grimeMat, 0, 0.6, 1.0, 0.5, 0.88, Math.PI]]) {
      const gp = B().MeshBuilder.CreatePlane('pap_grime', { width: w, height: h, sideOrientation: B().Mesh.DOUBLESIDE }, scene); gp.position.set(x, y, z); gp.rotation.y = ry; gp.material = mat; gp.parent = root; gp.isPickable = false;
    }
    // weapon tray (slides in/out under the porthole) + purple aura for the upgraded weapon
    this.tray = new (B().TransformNode)('pap_tray', scene); this.tray.parent = root; this.tray.position.set(0, 0.64, 0.15);
    const trayM = B().MeshBuilder.CreateBox('pap_traym', { width: 0.95, height: 0.05, depth: 0.4 }, scene); trayM.material = M.matSteel; trayM.parent = this.tray; trayM.isPickable = false; trayM.receiveShadows = true;
    const trayEdge = B().MeshBuilder.CreateBox('pap_traye', { width: 0.95, height: 0.05, depth: 0.03 }, scene); trayEdge.material = M.hazardMat; trayEdge.parent = this.tray; trayEdge.position.set(0, 0.0, 0.2); trayEdge.isPickable = false;
    this.auraMat = mats.glow('pap_aura', PAP_COLOR, 0.2);
    this.aura = B().MeshBuilder.CreateBox('pap_aura', { width: 0.9, height: 0.2, depth: 0.32 }, scene); this.aura.material = this.auraMat; this.aura.parent = this.tray; this.aura.position.y = 0.12; this.aura.isPickable = false; this.aura.setEnabled(false);
    this.trayIn = 0.15; this.trayOut = 0.78; this.trayZ = this.trayIn; this.trayTarget = this.trayIn;
    // steam (tower tops), pooled + quality scaled
    this.steam = [];
    for (const sx of [-1, 1]) {
      const ps = new (B().ParticleSystem)('pap_steam', 60, scene);
      ps.particleTexture = M.effects.tSmoke; const wp = toWorld(this.m, sx * 1.0, 2.25, -0.05); ps.emitter = V3(wp[0], wp[1], wp[2]);
      ps.minEmitBox = V3(-0.15, 0, -0.15); ps.maxEmitBox = V3(0.15, 0.1, 0.15);
      ps.color1 = new (B().Color4)(0.85, 0.82, 0.9, 0.35); ps.color2 = new (B().Color4)(0.7, 0.66, 0.78, 0.25); ps.colorDead = new (B().Color4)(0.5, 0.5, 0.55, 0);
      ps.minSize = 0.25; ps.maxSize = 0.55; ps.minLifeTime = 0.8; ps.maxLifeTime = 1.6; ps.emitRate = 0;
      ps.direction1 = V3(-0.3, 1.2, -0.3); ps.direction2 = V3(0.3, 2.2, 0.3); ps.minEmitPower = 0.5; ps.maxEmitPower = 1.2; ps.gravity = V3(0, 0.6, 0);
      ps.addSizeGradient(0, 0.5); ps.addSizeGradient(1, 2.2); ps.updateSpeed = 0.014; ps.preventAutoStart = true; ps.start();
      this.steam.push(ps);
    }
    // light
    const lp = toWorld(this.m, 0, 1.7, 1.0);
    this.lightBase = 2.4;
    this.light = M.lighting.addPointLight('paplight', lp, PAP_LIGHT, this.lightBase, 10, false);
    M.attachLight(this.light, V3(lp[0], lp[1], lp[2]), [...this.meshes, drum, ringM, this.core, gearBase, trayM, ...this.rods]);
    M.registerStatic(this.meshes, true);
    this.meshes.forEach(m => m.freezeWorldMatrix());
    if (M.lighting.shadow) { M.lighting.shadow.addShadowCaster(drum, false); M.lighting.shadow.addShadowCaster(trayM, false); }
    if (M.game.mapVis) M.game.mapVis.shadowCasters.push(drum, trayM);
    sign.freezeWorldMatrix();
    this.sparkPos = [toWorld(this.m, -0.6, 1.15, 0.45), toWorld(this.m, 0.6, 1.15, 0.45), toWorld(this.m, 0, 1.8, 0.4)];
  }

  _buildGear() {
    const scene = this.M.scene;
    const parts = [B().MeshBuilder.CreateCylinder('gd', { diameter: 0.3, height: 0.07, tessellation: 20 }, scene)];
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const t = B().MeshBuilder.CreateBox('gt', { width: 0.08, height: 0.07, depth: 0.07 }, scene); t.position.set(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17); t.rotation.y = -a; parts.push(t); }
    const hub = B().MeshBuilder.CreateCylinder('gh', { diameter: 0.1, height: 0.1, tessellation: 12 }, scene); parts.push(hub);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; const h = B().MeshBuilder.CreateCylinder('gho', { diameter: 0.05, height: 0.08, tessellation: 8 }, scene); h.position.set(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1); parts.push(h); }
    const m = B().Mesh.MergeMeshes(parts, true, true, undefined, false, false);
    m.material = this.M.matSteel; m.isVisible = false; m.isPickable = false; m.name = 'pap_gearbase';
    return m;
  }

  _setTrayModel(id, upgraded) {
    if (this.trayModel) { this.trayModel.dispose(); this.trayModel = null; this.trayModelId = null; }
    if (!id || !WEAPONS[id] || !this.M.game.weaponCache) { this.aura.setEnabled(false); return; }
    const model = cloneWeaponModel(this.M.game.weaponCache.get(id), 'pap_w');
    model.root.parent = this.tray;
    model.root.position.set(model.length * 0.42, 0.075, 0.0); model.root.rotation.set(0, -Math.PI / 2, 0);
    for (const m of model.meshes) { m.isPickable = false; m.receiveShadows = false; }
    this.trayModel = model; this.trayModelId = id;
    this.aura.setEnabled(!!upgraded);
  }

  /** Network state change (or initial state for late joiners). */
  apply(s, prev, initial) {
    this.state = s.state; this.user = s.user; this.st = s.t || 0; this.dur = s.dur || PAP.processTime;
    const M = this.M, me = s.user === M.game.myId;
    if (s.state === 'processing') {
      this._setTrayModel(s.weapon, false);
      this.trayZ = initial ? this.trayIn : this.trayOut; this.trayTarget = this.trayIn;
      if (!initial) {
        audio.play('pap_start', { pos: this.pos, vol: 1.1, ref: 5, max: 50, important: me });
        M.shake(0.07, this.m.x, this.m.z, 16);
        this.flash = 1;
        if (me && M.game.handAnim) M.game.handAnim.stow(s.weapon);
      }
      this._spinAt = this.st + (initial ? 0 : 0.55);
      this.zapT = 0.3; this.sparkT = 0.4; this.shakeT = 0.5;
    } else if (s.state === 'ready') {
      this._stopSpin();
      this._setTrayModel(s.weapon, true);
      this.trayZ = initial ? this.trayOut : this.trayIn; this.trayTarget = this.trayOut;
      this.drumSpeed = initial ? 0 : this.drumSpeed;
      if (!initial) {
        audio.play('pap_done', { pos: this.pos, vol: 1.1, ref: 6, max: 60, important: true });
        for (const ps of this.steam) ps.manualEmitCount = Math.round(40 * (M.quality >= 2 ? 1 : 0.5));
        M.shake(0.1, this.m.x, this.m.z, 18);
        this.flash = 1.2;
        this._arcBurst(4);
        if (me) M.game.hud.notice(`${WEAPONS[s.weapon].name.toUpperCase()} READY - press ${keyLabel(M.settings.controls.binds.interact)} to take it`, 3200);
        else M.game.hud.feed(`Pack-a-Punch finished ${WEAPONS[s.weapon].name} for ${M.game.playerName(s.user)}`);
      }
    } else { // idle
      this._stopSpin();
      if (s.taken && !initial && this.trayModel) {
        // the weapon leaves the tray in a purple flash, then the tray retracts
        const [x, y, z] = toWorld(this.m, 0, 0.75, this.trayZ);
        M.effects.arcHit(x, y, z); M.effects.arcHit(x, y + 0.1, z);
        audio.play('pap_zap', { pos: this.pos, vol: 0.6, ref: 4 });
      }
      this._setTrayModel(null, false);
      this.trayTarget = this.trayIn;
      if (M.game.hud) M.game.hud.setPap(null);
    }
  }

  _stopSpin() { if (this.spinHandle) { this.spinHandle.stop(0.4); this.spinHandle = null; } }

  _arcBurst(n) {
    const tips = this.postTips;
    for (let i = 0; i < n; i++) {
      const a = tips[Math.floor(Math.random() * tips.length)];
      let b = tips[Math.floor(Math.random() * tips.length)]; if (b === a) b = tips[(tips.indexOf(a) + 1) % tips.length];
      this.M.effects.arc(a, [b]);
    }
  }

  update(dt) {
    const M = this.M;
    this.t += dt; this.st += dt;
    const t = this.t, processing = this.state === 'processing', ready = this.state === 'ready';
    if (!this.hum && audio.ready) this.hum = audio.play('machine_hum', { loop: true, pos: this.pos, vol: 0.55, ref: 2.2, max: 18, bus: 'ambient' });
    // gears + pistons
    const gearTarget = processing ? 6 : ready ? 1.6 : 0.5;
    this.gearK += (gearTarget - this.gearK) * Math.min(1, dt * 1.5);
    for (const gr of this.gears) gr.piv.rotation.z += dt * gr.spd * this.gearK;
    const pistonSpd = processing ? 10 : 2.2;
    for (let i = 0; i < this.rods.length; i++) this.rods[i].position.y = 2.72 + Math.sin(t * pistonSpd + i * 2.1) * (processing ? 0.13 : 0.05);
    // drum spin profile while processing
    let target = 0;
    if (processing) { const k = clamp01(this.st / this.dur); target = k < 0.3 ? easeOut(k / 0.3) : k > 0.82 ? 1 - (k - 0.82) / 0.18 : 1; target *= 16; }
    this.drumSpeed += (target - this.drumSpeed) * Math.min(1, dt * (processing ? 2.5 : 1.2));
    this.drumPivot.rotation.z += this.drumSpeed * dt;
    // core / halo / light
    const pulse = 0.5 + 0.5 * Math.sin(t * (processing ? 9 : 2.2));
    this.coreMat.emissiveIntensity = 1.6 + pulse * 1.2 + (processing ? 2.5 : 0) + this.flash * 3;
    this.haloMat.alpha = 0.18 + pulse * 0.2 + (processing ? 0.25 : 0) + this.flash * 0.4;
    this.halo.scaling.setAll(0.9 + pulse * 0.25 + this.flash * 0.6);
    this.light.intensity = this.lightBase * (0.8 + pulse * 0.4) + (processing ? 3.5 + Math.random() * 1.5 : 0) + this.flash * 12;
    const sk = 0.9 + 0.1 * Math.sin(t * 40) + this.flash * 0.6 + (processing ? 0.25 * pulse : 0);
    this.signMat.emissiveColor.set(sk, sk, sk);
    this.auraMat.alpha = 0.12 + pulse * 0.16;
    this.flash = Math.max(0, this.flash - dt * 1.8);
    // tray slide
    this.trayZ += (this.trayTarget - this.trayZ) * Math.min(1, dt * 3.2);
    this.tray.position.z = this.trayZ;
    if (this.trayModel) {
      const inside = this.trayZ < this.trayIn + 0.18;
      if (inside !== this._modelHidden) { this._modelHidden = inside; this.trayModel.root.setEnabled(!inside); }
      if (ready && !inside) { this.trayModel.root.position.y = 0.075 + Math.sin(t * 2.4) * 0.012; this.trayModel.root.rotation.z = Math.sin(t * 1.3) * 0.05; }
    }
    // electric arcs, zaps, sparks, steam, shake
    this.arcT -= dt;
    if (this.arcT <= 0) {
      this.arcT = processing ? 0.12 + Math.random() * 0.15 : ready ? 0.5 + Math.random() * 0.4 : 1.1 + Math.random() * 0.9;
      this._arcBurst(processing ? 2 : 1);
      if (processing || Math.random() < 0.5) audio.play('pap_zap', { pos: this.pos, vol: processing ? 0.75 : 0.35, ref: 4, max: 35, pitch: 0.9 + Math.random() * 0.3 });
    }
    if (processing) {
      if (this._spinAt != null && this.st >= this._spinAt && !this.spinHandle) { this._spinAt = null; this.spinHandle = audio.play('pap_spin', { loop: true, pos: this.pos, vol: 0.95, ref: 5, max: 50 }); }
      this.sparkT -= dt;
      if (this.sparkT <= 0) { this.sparkT = 0.18 + Math.random() * 0.2; const sp = this.sparkPos[Math.floor(Math.random() * this.sparkPos.length)]; M.effects._burst(M.effects.sparks, sp[0], sp[1], sp[2], 12, V3((Math.random() - 0.5), 0.8, 0.6), 0.9); }
      this.shakeT -= dt;
      if (this.shakeT <= 0) { this.shakeT = 0.35; M.shake(0.014, this.m.x, this.m.z, 14); }
      for (const ps of this.steam) ps.emitRate = Math.round(26 * (M.quality >= 2 ? 1 : 0.5));
      if (this.user === M.game.myId && M.game.hud) M.game.hud.setPap('processing', clamp01(this.st / this.dur), WEAPONS[this.trayModelId] ? WEAPONS[this.trayModelId].name : '');
    } else {
      for (const ps of this.steam) ps.emitRate = ready ? 5 : 0;
      if (ready && this.user === M.game.myId && M.game.hud) M.game.hud.setPap('ready', 1, WEAPONS[this.trayModelId] ? WEAPONS[this.trayModelId].name : '');
      if (ready && Math.random() < dt * 3) { const [x, y, z] = toWorld(this.m, (Math.random() - 0.5) * 0.7, 0.8 + Math.random() * 0.2, this.trayZ + (Math.random() - 0.5) * 0.3); M.effects.powerupSparkle(x, y, z); }
    }
  }
}

function keyLabel(code) { if (!code) return '?'; if (code.startsWith('Key')) return code.slice(3); return code.toUpperCase(); }
