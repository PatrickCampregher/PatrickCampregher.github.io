// Level of detail + culling setup: distance-based enable/disable of small props and decals, fire emitter throttling,
// cheap culling strategies for the merged static chunks and material freezing once the scene is warm.
// Large geometry (buildings, vehicles, outer ruins) is never hidden by distance.
/* global BABYLON */

const B = () => BABYLON;
const SMALL_PROPS = new Set(['prop_trash', 'prop_debris', 'prop_barrel', 'prop_hydrant', 'prop_mailbox']);

export class LodManager {
  constructor(scene, mapVis, effects, lighting, mats, settings) {
    this.scene = scene; this.mapVis = mapVis; this.effects = effects; this.lighting = lighting; this.mats = mats; this.settings = settings;
    this.items = [];       // { m, x, z, r2: hide beyond sqrt(r2) }
    this.fires = [];       // { f, x, z }
    this.t = 0;
    this._freezeT = -1;    // countdown to (re)freeze materials after a settings change
    this.stats = { hidden: 0, tracked: 0 };
    this._collect();
    this._setupCulling();
    this._ranges();
  }

  _ranges() {
    const far = (this.lighting && this.lighting.renderDistance) || 170;
    this.propRange = Math.min(90, Math.max(45, far * 0.5));   // small props/decals vanish beyond this
    this.decalRange = Math.min(60, Math.max(30, far * 0.33));
    this.fireFull = far * 0.4; this.fireHalf = far * 0.7; this.fireOff = far * 1.05;
  }

  _collect() {
    const add = (m, range) => {
      if (!m || !m.getBoundingInfo) return;
      const c = m.getBoundingInfo().boundingSphere.centerWorld;
      m.cullingStrategy = B().AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
      this.items.push({ m, x: c.x, z: c.z, range });
    };
    // small props (trash, debris, barrels, hydrants, mailboxes)
    for (const node of this.mapVis.propNodes || []) {
      if (!SMALL_PROPS.has(node.name)) continue;
      for (const m of node.getChildMeshes()) add(m, 'prop');
    }
    // impact / blood / scorch decals (pooled planes; they move when reused, so positions are re-read each tick)
    const decalPools = [this.effects.holes, ...(this.effects.bloodDecals || []), this.effects.scorches];
    for (const pool of decalPools) {
      if (!pool || !pool.items) continue;
      for (const m of pool.items) { m.cullingStrategy = B().AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY; this.items.push({ m, x: 0, z: 0, range: 'decal', live: true }); }
    }
    for (const f of this.effects.fires) this.fires.push({ f, x: f.x, z: f.z });
    this.stats.tracked = this.items.length;
  }

  _setupCulling() {
    const opt = B().AbstractMesh.CULLINGSTRATEGY_OPTIMISTIC_INCLUSION_THEN_BSPHERE_ONLY;
    for (const m of this.mapVis.staticMeshes || []) {
      if (m.name && m.name.startsWith('chunk_')) { m.cullingStrategy = opt; continue; }
      m.cullingStrategy = B().AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
    }
  }

  /** Register a fire created after construction (other systems may add fires at runtime). */
  addFire(f) { this.fires.push({ f, x: f.x, z: f.z }); }

  update(dt, camPos) {
    if (this._freezeT > 0) { this._freezeT -= dt; if (this._freezeT <= 0) this.freezeMaterials(); }
    this.t += dt;
    if (this.t < 0.25) return;
    this.t = 0;
    const cx = camPos.x, cz = camPos.z;
    const pr2 = this.propRange * this.propRange, dr2 = this.decalRange * this.decalRange;
    let hidden = 0;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i], m = it.m;
      let x = it.x, z = it.z;
      if (it.live) { if (!m.isVisible) continue; const p = m.position; x = p.x; z = p.z; }
      const dx = x - cx, dz = z - cz; const d2 = dx * dx + dz * dz;
      const far = d2 > (it.range === 'decal' ? dr2 : pr2);
      if (far === m.isEnabled(false)) { m.setEnabled(!far); }
      if (far) hidden++;
    }
    this.stats.hidden = hidden;
    // fire emitters: full rate near, half rate mid, off far (particles fade out naturally)
    for (let i = 0; i < this.fires.length; i++) {
      const e = this.fires[i], f = e.f;
      const d = Math.hypot(e.x - cx, e.z - cz);
      const k = d > this.fireOff ? 0 : d > this.fireHalf ? 0.35 : d > this.fireFull ? 0.65 : 1;
      if (k !== f.lod) { f.lod = k; this.effects.setFireLod(f, k); }
    }
  }

  /** Freeze static materials (call once the scene has rendered a few frames so shader variants exist). */
  freezeMaterials() {
    this._freezeT = -1;
    return this.mats.freezeStatic();
  }

  /** Graphics settings changed: shadows/pipeline were rebuilt, so unfreeze and re-freeze once things settle. */
  onSettingsChanged() {
    this.mats.unfreezeAll();
    this._ranges();
    this._freezeT = 1.5;
  }
}
