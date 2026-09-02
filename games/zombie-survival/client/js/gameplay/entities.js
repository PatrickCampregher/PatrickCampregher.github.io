// Remote entities: zombies, other players, powerups, projectiles - snapshot buffering + interpolation,
// rig animation, hit reactions, positional sounds, name labels.
/* global BABYLON */
import { ZSTATE, ZOMBIE_TYPES, ZOMBIE_HEAD_Y, ZOMBIE_HEAD_R, ZOMBIE_BODY_Y0, ZOMBIE_BODY_Y1, ZOMBIE_BODY_R, ZOMBIE_LEGS_Y0, ZOMBIE_LEGS_Y1, ZOMBIE_LEGS_R, ZOMBIE_RADIUS } from '/shared/zombies.js';
import { PSTATE, POWERUP_TYPES, POWERUP_INFO } from '/shared/constants.js';
import { IN } from '/shared/protocol.js';
import { WEAPON_LIST } from '/shared/weapons.js';
import { raySphere, rayVCylinder, angleLerp } from '/shared/collision.js';
import { RigFactory } from '../enemies/zombieRig.js';
import { cloneWeaponModel } from '../weapons/weaponModels.js';
import { buildPowerupMesh } from '../maps/props.js';
import { audio } from '../audio/audio.js';

const B = () => BABYLON;
const V3 = (x, y, z) => new (BABYLON.Vector3)(x, y, z);
const BUF = 24;

export class Entities {
  constructor(game) {
    this.g = game;
    this.scene = game.scene;
    this.rigs = new RigFactory(game.scene, game.mats, { shadowGenerator: game.lighting.shadow });
    this.zombies = new Map();
    this.players = new Map();
    this.powerups = new Map();
    this.projectiles = new Map();
    this.corpses = [];
    this.labelLayer = document.getElementById('labels');
    this.lastSnapTime = 0;
    this.moanVoices = 0;
    this.projMesh = null;
    this._nearZ = [];
  }

  dynamicBaseMeshes() {
    const out = [];
    for (const k in this.rigs.bases) for (const n in this.rigs.bases[k]) out.push(this.rigs.bases[k][n]);
    out.push(this.rigs.eyeBase);
    return out;
  }

  // ---------------- snapshots ----------------
  applySnapshot(s) {
    const t = s.time;
    this.lastSnapTime = t;
    const seenZ = new Set();
    for (const z of s.zombies) {
      seenZ.add(z.id);
      let e = this.zombies.get(z.id);
      if (!e) {
        const type = ZOMBIE_TYPES[z.type] || ZOMBIE_TYPES[1];
        e = { id: z.id, type, rig: this.rigs.acquire('zombie', z.id, { scale: type.scale }), buf: [], x: z.x, y: z.y, z: z.z, yaw: z.yaw, state: z.state, aux: z.aux, hp: z.hp, lastX: z.x, lastZ: z.z, nextMoan: performance.now() / 1000 + 1 + Math.random() * 4, lastState: -1, seenT: t, dead: false };
        e.rig.setPosition(z.x, z.y, z.z, z.yaw);
        this.zombies.set(z.id, e);
        if (z.state === ZSTATE.ENTERING) audio.play('zclimb', { pos: [z.x, z.y + 1, z.z], vol: 0.8, ref: 3 });
      }
      e.seenT = t;
      const b = e.buf;
      b.push({ t, x: z.x, y: z.y, z: z.z, yaw: z.yaw, state: z.state, aux: z.aux & 127, limp: !!(z.aux & 128), hp: z.hp });
      if (b.length > BUF) b.shift();
    }
    for (const [id, e] of this.zombies) if (!seenZ.has(id) && !e.dead && t - e.seenT > 600) this._removeZombie(e);
    // players
    const seenP = new Set();
    for (const p of s.players) {
      if (p.id === this.g.myId) { this._selfSnapshot(p); continue; }
      seenP.add(p.id);
      let e = this.players.get(p.id);
      if (!e) {
        e = { id: p.id, name: this.g.playerName(p.id), rig: this.rigs.acquire('player', p.id, { colorIndex: p.id - 1 }), buf: [], x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, weapon: -1, weaponModel: null, state: p.state, flags: p.flags, revive: 0, lastX: p.x, lastZ: p.z, label: this._makeLabel(p.id), hp: p.hp, stepAcc: 0 };
        this.players.set(p.id, e);
      }
      e.buf.push({ t, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, flags: p.flags, state: p.state, hp: p.hp, weapon: p.weapon, revive: p.revive });
      if (e.buf.length > BUF) e.buf.shift();
      e.state = p.state; e.revive = p.revive / 255; e.hp = p.hp;
      if (p.weapon !== e.weapon) this._setPlayerWeapon(e, p.weapon);
    }
    for (const [id, e] of this.players) if (!seenP.has(id)) this._removePlayer(e);
    // powerups
    const seenPU = new Set();
    for (const pu of s.powerups) {
      seenPU.add(pu.id);
      let e = this.powerups.get(pu.id);
      if (!e) {
        const type = POWERUP_TYPES[pu.type] || 'resupply';
        const mesh = buildPowerupMesh(this.scene, this.g.mats, type, POWERUP_INFO[type].color);
        e = { id: pu.id, type, mesh, x: pu.x, y: pu.y, z: pu.z, t0: performance.now() / 1000 };
        mesh.root.position.set(pu.x, pu.y + 1.0, pu.z);
        this.powerups.set(pu.id, e);
      }
      e.ttl = pu.ttl / 255;
    }
    for (const [id, e] of this.powerups) if (!seenPU.has(id)) { e.mesh.root.dispose(); this.powerups.delete(id); }
    // projectiles (grenades)
    const seenPr = new Set();
    for (const pr of s.projectiles) {
      seenPr.add(pr.id);
      let e = this.projectiles.get(pr.id);
      if (!e) {
        if (!this.projMesh) { this.projMesh = B().MeshBuilder.CreateSphere('proj', { diameter: 0.14, segments: 6 }, this.scene); this.projMesh.material = this.g.mats.solid('proj', '#3a3a2a', { rough: 0.6, emissive: '#331100' }); this.projMesh.isVisible = false; }
        const m = this.projMesh.createInstance('pr' + pr.id);
        e = { id: pr.id, mesh: m, buf: [] };
        this.projectiles.set(pr.id, e);
      }
      e.buf.push({ t, x: pr.x, y: pr.y, z: pr.z }); if (e.buf.length > 6) e.buf.shift();
    }
    for (const [id, e] of this.projectiles) if (!seenPr.has(id)) { e.mesh.dispose(); this.projectiles.delete(id); }
  }

  _selfSnapshot(p) {
    const lp = this.g.player;
    if (!lp) return;
    lp.beingRevivedPct = p.revive / 255;
  }

  _removeZombie(e) { if (e.rig) this.rigs.release(e.rig); this.zombies.delete(e.id); }
  _removePlayer(e) { if (e.label) e.label.remove(); if (e.rig) this.rigs.release(e.rig); this.players.delete(e.id); }

  _setPlayerWeapon(e, idx) {
    e.weapon = idx;
    const def = WEAPON_LIST[idx];
    if (!def) { e.rig.setWeapon(null); return; }
    const model = cloneWeaponModel(this.g.weaponCache.get(def.id), 'rp_w');
    for (const m of model.meshes) m.receiveShadows = false;
    e.rig.setWeapon(model.root);
    e.weaponModel = model;
  }

  _makeLabel(id) {
    const d = document.createElement('div');
    d.className = 'plabel';
    d.textContent = this.g.playerName(id);
    this.labelLayer.appendChild(d);
    return d;
  }

  // ---------------- interpolation ----------------
  _sample(buf, rt, out) {
    const n = buf.length;
    if (n === 0) return false;
    if (rt <= buf[0].t) { Object.assign(out, buf[0]); return true; }
    const last = buf[n - 1];
    if (rt >= last.t) {
      // extrapolate slightly using the previous sample
      if (n >= 2) {
        const p = buf[n - 2];
        const dt = last.t - p.t;
        const ahead = Math.min(rt - last.t, 120);
        if (dt > 0 && ahead > 0 && last.state !== ZSTATE.ATTACK) {
          const k = ahead / dt;
          Object.assign(out, last);
          out.x = last.x + (last.x - p.x) * k; out.y = last.y + (last.y - p.y) * k; out.z = last.z + (last.z - p.z) * k;
          return true;
        }
      }
      Object.assign(out, last); return true;
    }
    for (let i = n - 2; i >= 0; i--) {
      const a = buf[i], b = buf[i + 1];
      if (rt >= a.t && rt <= b.t) {
        const k = (rt - a.t) / Math.max(1, b.t - a.t);
        Object.assign(out, b);
        out.x = a.x + (b.x - a.x) * k; out.y = a.y + (b.y - a.y) * k; out.z = a.z + (b.z - a.z) * k;
        out.yaw = angleLerp(a.yaw, b.yaw, k);
        if (b.pitch != null) out.pitch = a.pitch + (b.pitch - a.pitch) * k;
        return true;
      }
    }
    Object.assign(out, last);
    return true;
  }

  update(dt, renderTime) {
    const now = performance.now() / 1000;
    const camPos = this.g.camera.position;
    const smp = _smp;
    this._nearZ.length = 0;
    // zombies
    for (const e of this.zombies.values()) {
      if (e.dead) {
        e.rig.update(dt, 0, ZSTATE.DEAD, 0, false);
        if (e.rig.deathT > 8.5) this._removeZombie(e);
        continue;
      }
      if (!this._sample(e.buf, renderTime, smp)) continue;
      const moved = Math.hypot(smp.x - e.lastX, smp.z - e.lastZ);
      e.lastX = smp.x; e.lastZ = smp.z;
      e.x = smp.x; e.y = smp.y; e.z = smp.z; e.yaw = smp.yaw; e.state = smp.state; e.aux = smp.aux; e.hp = smp.hp;
      e.rig.setPosition(smp.x, smp.y, smp.z, smp.yaw);
      e.rig.update(dt, moved, smp.state, smp.aux, smp.limp);
      const d = Math.hypot(smp.x - camPos.x, smp.z - camPos.z);
      if (d < 3) this._nearZ.push(e);
      // state-driven sounds
      if (smp.state !== e.lastState) {
        if (smp.state === ZSTATE.ATTACK) audio.play('zattack', { pos: [smp.x, smp.y + 1.5, smp.z], vol: 1.0, ref: 3, pitch: 0.9 + Math.random() * 0.25 });
        else if (smp.state === ZSTATE.ENTERING && e.lastState >= 0) audio.play('zclimb', { pos: [smp.x, smp.y + 1, smp.z], vol: 0.8, ref: 3 });
        e.lastState = smp.state;
      }
      if (now > e.nextMoan && d < 45) {
        e.nextMoan = now + 3 + Math.random() * 6;
        if (this.moanVoices < 7) {
          const name = smp.state >= ZSTATE.CHASE && e.type.id >= 2 ? 'zgrowl' : 'zmoan' + (1 + Math.floor(Math.random() * 4));
          const h = audio.play(name, { pos: [smp.x, smp.y + 1.5, smp.z], vol: 0.7, ref: 3.5, pitch: 0.85 + Math.random() * 0.3 });
          if (h) { this.moanVoices++; h.node.addEventListener('ended', () => { this.moanVoices--; }); }
        }
      }
    }
    // players
    const cam = this.g.camera;
    const engine = this.g.engine;
    const w = engine.getRenderWidth(), h = engine.getRenderHeight();
    for (const e of this.players.values()) {
      if (!this._sample(e.buf, renderTime, smp)) continue;
      const moved = Math.hypot(smp.x - e.lastX, smp.z - e.lastZ);
      e.lastX = smp.x; e.lastZ = smp.z;
      e.x = smp.x; e.y = smp.y; e.z = smp.z; e.yaw = smp.yaw; e.pitch = smp.pitch;
      e.rig.setPosition(smp.x, smp.y, smp.z, smp.yaw);
      e.rig.update(dt, moved, 0, 0, false, { pitch: smp.pitch, crouch: !!(smp.flags & IN.CROUCH), downed: smp.state === PSTATE.DOWNED, reloading: !!(smp.flags & IN.RELOADING) });
      // footsteps
      if (moved > 0 && smp.state === PSTATE.ALIVE) { e.stepAcc += moved; if (e.stepAcc > 2.4) { e.stepAcc = 0; audio.play('step', { pos: [smp.x, smp.y, smp.z], vol: 0.35, ref: 2 }); } }
      // label
      const p = B().Vector3.Project(V3(smp.x, smp.y + 2.05, smp.z), B().Matrix.Identity(), this.scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
      const dist = B().Vector3.Distance(cam.position, V3(smp.x, smp.y + 1, smp.z));
      const visible = p.z > 0 && p.z < 1 && p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
      if (visible) {
        e.label.style.display = 'block';
        e.label.style.transform = `translate(${(p.x / w * 100).toFixed(2)}vw, ${(p.y / h * 100).toFixed(2)}vh) translate(-50%, -100%)`;
        e.label.style.opacity = String(Math.max(0.35, 1 - dist / 60));
        const st = smp.state === PSTATE.DOWNED ? ' (DOWN)' : smp.state === PSTATE.DEAD ? ' (DEAD)' : '';
        const txt = e.name + st;
        if (e.label.textContent !== txt) e.label.textContent = txt;
        e.label.classList.toggle('down', smp.state === PSTATE.DOWNED);
      } else e.label.style.display = 'none';
    }
    // powerups: float, spin, blink near expiry
    for (const e of this.powerups.values()) {
      const t = now - e.t0;
      e.mesh.root.position.y = e.y + 0.9 + Math.sin(t * 2.2) * 0.15;
      e.mesh.root.rotation.y = t * 1.8;
      const blink = e.ttl < 0.3 ? (Math.sin(t * 14) > 0 ? 1 : 0.25) : 1;
      e.mesh.light.intensity = 1.2 * blink;
      e.mesh.root.setEnabled(blink > 0.5 || e.ttl >= 0.3);
      if (Math.random() < dt * 6) this.g.effects.powerupSparkle(e.x + (Math.random() - 0.5) * 0.6, e.mesh.root.position.y + (Math.random() - 0.5) * 0.4, e.z + (Math.random() - 0.5) * 0.6);
    }
    for (const e of this.projectiles.values()) { if (this._sample(e.buf, renderTime, smp)) e.mesh.position.set(smp.x, smp.y, smp.z); }
  }

  // ---------------- events ----------------
  onHit(m) {
    const e = this.zombies.get(m.z);
    const x = m.x, y = m.y, z = m.z2;
    if (e && !e.dead) {
      e.rig.flash();
      e.rig.hitReact(m.part);
      if (m.p !== this.g.myId) this.g.effects.blood(x, y, z, null, m.dmg > 100, m.part === 1);
      if (!m.k) audio.play('zhurt', { pos: [e.x, e.y + 1.5, e.z], vol: 0.5, ref: 3, pitch: 0.9 + Math.random() * 0.3 });
    }
    if (m.k) {
      if (e && !e.dead) {
        e.dead = true;
        e.rig.die(m.blast ? 2 : m.part === 1 ? 1 : 0);
        audio.play('zdeath', { pos: [e.x, e.y + 1.2, e.z], vol: 0.8, ref: 3, pitch: 0.9 + Math.random() * 0.25 });
        this.g.effects.bloodOnFloor(e.x, e.y + 0.02, e.z, 1.2 + Math.random() * 0.6);
        if (m.part === 1) this.g.effects.blood(e.x, e.y + 1.6, e.z, V3(0, 1, 0), true, true);
      }
    }
    if (m.p === this.g.myId) {
      this.g.hud.hitmarker(!!m.k, m.part === 1);
      if (m.k) audio.play(m.part === 1 ? 'headshot' : 'kill', { vol: 0.6 });
      else audio.play('hit', { vol: 0.45 });
    }
  }

  onRemoteShot(m) {
    const e = this.players.get(m.p);
    const def = WEAPON_LIST[m.w];
    if (!def) return;
    let muzzle;
    if (e && e.weaponModel) muzzle = e.weaponModel.muzzle.getAbsolutePosition().clone(); else muzzle = V3(m.o[0], m.o[1], m.o[2]);
    const d = V3(m.d[0], m.d[1], m.d[2]);
    this.g.effects.muzzleFlash(muzzle, d, def, false);
    const end = muzzle.add(d.scale(40));
    this.g.effects.tracer(muzzle, end, def);
    audio.play(def.sound, { pos: [muzzle.x, muzzle.y, muzzle.z], vol: 0.9, ref: 6, max: 120, pitch: 0.96 + Math.random() * 0.08 });
  }

  localProjectileFired() { /* the server simulates; visual is the projectile instance from snapshots */ }

  onZombieVanish(id) { const e = this.zombies.get(id); if (e) this._removeZombie(e); }

  onPlayerLeave(id) { const e = this.players.get(id); if (e) this._removePlayer(e); }

  downedPlayers() {
    const out = [];
    for (const e of this.players.values()) if (e.state === PSTATE.DOWNED) out.push({ id: e.id, name: e.name, x: e.x, y: e.y, z: e.z, revivePct: e.revive > 0 ? e.revive : null });
    return out;
  }

  /** Circle push-out of the local player against nearby zombies. */
  pushOutOfZombies(body, r) {
    const min = r + ZOMBIE_RADIUS;
    for (const e of this._nearZ) {
      const dx = body.x - e.x, dz = body.z - e.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6 && Math.abs(body.y - e.y) < 1.6) { const d = Math.sqrt(d2); const push = min - d; body.x += dx / d * push; body.z += dz / d * push; }
    }
  }

  /** Client-side zombie raycast for predicted impact visuals. */
  raycastZombies(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = null, bestT = maxDist;
    for (const e of this.zombies.values()) {
      if (e.dead) continue;
      const s = e.type.scale;
      const cx = e.x, cy = e.y, cz = e.z;
      const lx = cx - ox, ly = cy + 0.9 - oy, lz = cz - oz;
      const tca = lx * dx + ly * dy + lz * dz;
      if (tca < -1 || tca > bestT + 1.2) continue;
      if (lx * lx + ly * ly + lz * lz - tca * tca > 1.4 * 1.4) continue;
      let t = raySphere(ox, oy, oz, dx, dy, dz, cx, cy + ZOMBIE_HEAD_Y * s, cz, ZOMBIE_HEAD_R * s * 1.15), part = 1;
      const tb = rayVCylinder(ox, oy, oz, dx, dy, dz, cx, cz, ZOMBIE_BODY_R * s, cy + ZOMBIE_BODY_Y0 * s, cy + ZOMBIE_BODY_Y1 * s);
      if (tb >= 0 && (t < 0 || tb < t)) { t = tb; part = 0; }
      const tl = rayVCylinder(ox, oy, oz, dx, dy, dz, cx, cz, ZOMBIE_LEGS_R * s, cy + ZOMBIE_LEGS_Y0 * s, cy + ZOMBIE_LEGS_Y1 * s);
      if (tl >= 0 && (t < 0 || tl < t)) { t = tl; part = 2; }
      if (t >= 0 && t < bestT) { bestT = t; best = e; }
      if (best === e) best._part = part;
    }
    return best ? { e: best, t: bestT, part: best._part } : null;
  }

  nearestZombieDist(x, z) {
    let d = Infinity;
    for (const e of this.zombies.values()) { if (e.dead) continue; const dd = Math.hypot(e.x - x, e.z - z); if (dd < d) d = dd; }
    return d;
  }

  dispose() {
    for (const e of this.players.values()) if (e.label) e.label.remove();
    for (const e of this.powerups.values()) e.mesh.root.dispose();
    this.rigs.dispose();
  }
}

const _smp = {};
