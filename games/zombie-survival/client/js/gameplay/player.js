// Local first-person player: movement + collision, camera, weapons (client prediction), interaction, input send.
/* global BABYLON */
import { PLAYER, PSTATE, INPUT_RATE, MYSTERY_BOX } from '/shared/constants.js';
import { IN, encodeInput } from '/shared/protocol.js';
import { WEAPONS, WEAPON_LIST, computeShotDirections, shotInterval } from '/shared/weapons.js';
import { resolveCharacter, raycastWorld, bulletFilter } from '/shared/collision.js';
import { audio } from '../audio/audio.js';

const B = () => BABYLON;
const V3 = (x, y, z) => new (BABYLON.Vector3)(x, y, z);
const DEG = Math.PI / 180;
const BODY_OPTS = { radius: PLAYER.radius, height: PLAYER.height, stepHeight: PLAYER.stepHeight };

export class LocalPlayer {
  constructor(game) {
    this.g = game;
    this.input = game.input; this.cam = game.camera; this.settings = game.settings;
    const sp = game.initMsg.spawn;
    this.x = sp.x; this.y = sp.y; this.z = sp.z; this.yaw = sp.yaw || 0; this.pitch = 0;
    this.vx = 0; this.vy = 0; this.vz = 0; this.onGround = true;
    this.crouchK = 0; this.sprinting = false; this.ads = false; this.moving = false; this.speed2d = 0;
    this.state = PSTATE.ALIVE; this.hp = PLAYER.maxHealth; this.points = PLAYER.startPoints;
    this.weapons = [{ id: 'warden_p9', mag: WEAPONS.warden_p9.mag, reserve: WEAPONS.warden_p9.reserve }, null];
    this.slot = 0; this.reloadUntil = 0; this.switchUntil = 0; this.lastShot = -1; this.burst = 0; this.burstNext = 0; this.heat = 0;
    this.seq = 0; this.sendAcc = 0; this.stepAcc = 0; this.jumpQueued = false; this.prevVy = 0;
    this.recoilPitch = 0; this.recoilYaw = 0; this.roll = 0; this.bobY = 0; this.bobT = 0;
    this.downedAt = 0; this.beingRevivedPct = 0;
    this.holdTarget = null; this.interactTarget = null; this.reloadTimers = [];
    this.fovBase = (this.settings.graphics.fov || 95) * DEG; this.fovK = 1;
    this.stats = { kills: 0, headshots: 0 };
    this.shake = 0; this.shakeT = 0;
    this.lastCorrect = 0;
    this.lowAmmoWarned = false;
    this.spectateT = 0;
  }

  get held() { return this.weapons[this.slot]; }
  get def() { const h = this.held; return h ? WEAPONS[h.id] : null; }
  get eyeHeight() { return PLAYER.height + (PLAYER.crouchHeight - PLAYER.height) * this.crouchK - PLAYER.eyeBelowTop; }
  get reloading() { return this.g.now < this.reloadUntil; }
  get switching() { return this.g.now < this.switchUntil; }

  forward(out) { const cp = Math.cos(this.pitch); out.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp); return out; }
  eyePos(out) { out.set(this.x, this.y + this.eyeHeight, this.z); return out; }

  // ---------------- main update ----------------
  update(dt) {
    const g = this.g, inp = this.input, now = g.now;
    const alive = this.state === PSTATE.ALIVE;
    this._look(dt);
    if (alive) this._move(dt); else { this.vx = this.vz = 0; this.vy = 0; }
    this._camera(dt);
    if (alive) { this._weapons(dt); this._interaction(dt); }
    else { this.holdTarget && this._setHold(null); g.hud.prompt(null); }
    this._sendInput(dt);
    this._hud();
  }

  _look(dt) {
    const inp = this.input, c = this.settings.controls;
    if (!inp.locked) return;
    const sens = 0.0022 * c.sensitivity * (this.ads ? c.adsSensitivity / Math.max(1, (this.def ? this.def.zoom : 1) * 0.8) : 1);
    this.yaw += inp.mouseDX * sens;
    this.pitch += inp.mouseDY * sens * (c.invertY ? -1 : 1);
    const lim = 89 * DEG;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2; else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  _move(dt) {
    const inp = this.input, def = this.def;
    let fx = 0, fz = 0;
    if (inp.locked) {
      if (inp.down('forward')) fz += 1; if (inp.down('back')) fz -= 1;
      if (inp.down('right')) fx += 1; if (inp.down('left')) fx -= 1;
    }
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    this.moving = len > 0;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wx = fx * cy + fz * sy, wz = -fx * sy + fz * cy;
    const wantCrouch = inp.locked && inp.down('crouch');
    this.crouchK += ((wantCrouch ? 1 : 0) - this.crouchK) * Math.min(1, dt * 12);
    const wantSprint = inp.locked && inp.down('sprint') && fz > 0.5 && !this.ads && this.crouchK < 0.5;
    this.sprinting = wantSprint && this.moving;
    let max = this.sprinting ? PLAYER.sprintSpeed : this.crouchK > 0.5 ? PLAYER.crouchSpeed : PLAYER.walkSpeed;
    if (def) max *= def.moveMul;
    if (this.ads) max *= PLAYER.adsSpeedMul;
    if (fz < -0.3) max *= PLAYER.backpedalMul;
    const tx = wx * max, tz = wz * max;
    const k = this.onGround ? 1 - Math.exp(-PLAYER.accelGround / 3.5 * dt) : 1 - Math.exp(-PLAYER.accelAir / 3.5 * dt);
    this.vx += (tx - this.vx) * k; this.vz += (tz - this.vz) * k;
    if (inp.locked && inp.pressed('jump') && this.onGround) { this.vy = PLAYER.jumpVel; this.onGround = false; this.jumpQueued = true; audio.play('step2', { vol: 0.5, pitch: 0.8 }); }
    this.vy -= PLAYER.gravity * dt;
    if (this.vy < -30) this.vy = -30;
    const prevGround = this.onGround;
    this.prevVy = this.vy;
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    BODY_OPTS.height = PLAYER.height + (PLAYER.crouchHeight - PLAYER.height) * this.crouchK;
    resolveCharacter(this.g.world.hash, this, BODY_OPTS, 0);
    // zombies block movement
    this.g.entities.pushOutOfZombies(this, PLAYER.radius);
    if (this.y < -5) { this.y = 0; this.vy = 0; }
    if (!prevGround && this.onGround && this.prevVy < -4) { audio.play('land', { vol: Math.min(1, -this.prevVy / 12) }); this.g.viewModel.land(-this.prevVy); }
    // footsteps
    this.speed2d = Math.hypot(this.vx, this.vz);
    if (this.onGround && this.speed2d > 0.8) {
      this.stepAcc += this.speed2d * dt;
      const stride = this.sprinting ? 2.9 : this.crouchK > 0.5 ? 1.6 : 2.3;
      if (this.stepAcc >= stride) { this.stepAcc = 0; audio.play(Math.random() < 0.5 ? 'step' : 'step2', { vol: this.sprinting ? 0.6 : this.crouchK > 0.5 ? 0.15 : 0.4, pitch: 0.9 + Math.random() * 0.2 }); }
    } else this.stepAcc = 0;
  }

  _camera(dt) {
    const cam = this.cam;
    // recoil recovery
    this.recoilPitch *= Math.exp(-9 * dt);
    this.recoilYaw *= Math.exp(-9 * dt);
    // bob (subtle)
    const spd = Math.min(1, this.speed2d / 5);
    this.bobT += dt * (5 + this.speed2d * 1.3);
    const bobTarget = this.onGround ? Math.abs(Math.sin(this.bobT)) * 0.02 * spd * (this.ads ? 0.3 : 1) : 0;
    this.bobY += (bobTarget - this.bobY) * Math.min(1, dt * 10);
    const strafe = (this.input.locked && this.input.down('right') ? 1 : 0) - (this.input.locked && this.input.down('left') ? 1 : 0);
    this.roll += ((-strafe * 0.012 * (this.state === PSTATE.ALIVE ? 1 : 0)) - this.roll) * Math.min(1, dt * 8);
    // shake
    let sx = 0, sy = 0;
    if (this.shakeT > 0) { this.shakeT -= dt; const a = this.shake * (this.shakeT / 0.4); sx = (Math.random() - 0.5) * a; sy = (Math.random() - 0.5) * a; }
    let eye = this.eyeHeight;
    if (this.state === PSTATE.DOWNED) eye = 0.55;
    else if (this.state === PSTATE.DEAD) { this.spectateT += dt; eye = 2.6; }
    cam.position.set(this.x, this.y + eye + this.bobY, this.z);
    cam.rotation.set(this.pitch - this.recoilPitch + sy, this.yaw + this.recoilYaw + sx, this.roll);
    // fov / ads zoom
    const zoom = this.ads && this.def ? this.def.zoom : 1;
    this.fovK += ((1 / zoom) - this.fovK) * Math.min(1, dt * (this.def ? 1 / Math.max(0.08, this.def.adsTime) : 6));
    const sprintFov = this.sprinting ? 1.05 : 1;
    cam.fov = this.fovBase * this.fovK * sprintFov;
  }

  _weapons(dt) {
    const g = this.g, inp = this.input, now = g.now;
    const held = this.held, def = this.def;
    this.heat = Math.max(0, this.heat - dt * 2.2);
    if (!held || !def) return;
    this.ads = inp.locked && inp.down('ads') && !this.sprinting && !this.switching;
    // slot switching
    let target = -1;
    if (inp.locked) {
      if (inp.pressed('slot1')) target = 0; else if (inp.pressed('slot2')) target = 1;
      else if (inp.pressed('swap') || inp.wheel !== 0) target = 1 - this.slot;
    }
    if (target >= 0 && target !== this.slot && this.weapons[target] && !this.switching) {
      this._cancelReload();
      this.slot = target;
      const d2 = WEAPONS[this.weapons[target].id];
      this.switchUntil = now + d2.switchTime;
      g.viewModel.setWeapon(d2);
      g.conn.send({ t: 'switch', slot: target });
      audio.play('weapon_pickup', { vol: 0.35, pitch: 1.3 });
      this.burst = 0;
      return;
    }
    // reload
    if (inp.locked && inp.pressed('reload')) this.tryReload();
    // fire
    const trigger = inp.locked && inp.down('fire');
    const pressed = inp.locked && inp.pressed('fire');
    const interval = shotInterval(def);
    const canFire = !this.reloading && !this.switching && now - this.lastShot >= interval;
    if (this.sprinting && (trigger || pressed) && !this.reloading) { this.sprinting = false; }
    if (held.mag > 0) {
      if (def.burst) {
        if (pressed && canFire && this.burst === 0) { this.burst = def.burst; this.burstNext = now; }
        if (this.burst > 0 && now >= this.burstNext && held.mag > 0 && !this.reloading) { this._shoot(); this.burst--; this.burstNext = now + interval; if (this.burst === 0) this.lastShot = now + def.burstDelay - interval; }
      } else if (def.auto ? trigger && canFire : pressed && canFire) this._shoot();
    } else if (pressed) {
      audio.play('click_empty', { vol: 0.6 });
      if (held.reserve > 0) this.tryReload();
    }
    if (held.mag === 0 && held.reserve > 0 && !this.reloading && !this.switching && !trigger && this.settings.controls.autoReload !== false && now - this.lastShot > 0.25) this.tryReload();
  }

  tryReload() {
    const held = this.held, def = this.def, now = this.g.now;
    if (!held || !def || held.mag >= def.mag || held.reserve <= 0 || this.reloading || this.switching) return;
    let dur = def.reloadTime;
    if (def.reloadPerShell) dur = def.reloadTime * Math.min(def.mag - held.mag, held.reserve) + 0.4;
    this.reloadUntil = now + dur;
    this.burst = 0;
    this.g.conn.send({ t: 'reload' });
    this.g.viewModel.startReload(dur, !!def.reloadPerShell);
    this._clearReloadTimers();
    if (def.reloadPerShell) {
      const n = Math.min(def.mag - held.mag, held.reserve);
      for (let i = 0; i < n; i++) this.reloadTimers.push(setTimeout(() => audio.play('shell_in', { vol: 0.7 }), 400 + i * def.reloadTime * 1000));
    } else {
      const look = def.look ? def.look.type : 'rifle';
      this.reloadTimers.push(setTimeout(() => audio.play('mag_out', { vol: 0.7 }), 120));
      this.reloadTimers.push(setTimeout(() => audio.play('mag_in', { vol: 0.8 }), Math.max(300, def.reloadTime * 1000 * 0.6)));
      if (look === 'rifle' || look === 'sniper' || look === 'lmg' || look === 'smg') this.reloadTimers.push(setTimeout(() => audio.play('bolt', { vol: 0.6 }), Math.max(450, def.reloadTime * 1000 * 0.85)));
    }
  }
  _clearReloadTimers() { for (const t of this.reloadTimers) clearTimeout(t); this.reloadTimers.length = 0; }
  _cancelReload() { if (this.reloading) { this.reloadUntil = 0; this.g.viewModel.stopReload(); this._clearReloadTimers(); } }

  _shoot() {
    const g = this.g, held = this.held, def = this.def, now = g.now;
    if (this.reloading && def.reloadPerShell && held.mag > 0) this._cancelReload();
    held.mag--;
    this.lastShot = now;
    const moveK = Math.min(1, this.speed2d / PLAYER.walkSpeed) + (this.onGround ? 0 : 0.6);
    const spread = (this.ads ? def.spreadAds : def.spreadHip) + moveK * def.spreadMove + this.heat * def.spreadPerShot * 3 + (this.crouchK > 0.5 ? -0.3 : 0);
    const spreadC = Math.max(def.spreadAds * 0.5, spread);
    this.heat = Math.min(1, this.heat + 0.18);
    const o = this.eyePos(_v1);
    const d = this.forward(_v2);
    const seed = (Math.random() * 0xffffffff) >>> 0;
    g.conn.send({ t: 'shoot', w: def.index, o: [r3(o.x), r3(o.y), r3(o.z)], d: [r4(d.x), r4(d.y), r4(d.z)], s: r3(spreadC), seed, rt: g.renderTimeMs() });
    // camera recoil
    const kick = def.recoil.pitch * DEG * 0.5;
    this.recoilPitch += kick * 0.65; this.pitch = Math.max(-89 * DEG, this.pitch - kick * 0.35);
    this.recoilYaw += (Math.random() - 0.5) * def.recoil.yaw * DEG * 0.6;
    g.viewModel.fire();
    const muzzle = g.viewModel.muzzleWorld.clone();
    g.effects.muzzleFlash(muzzle, d, def, true);
    audio.play(def.sound, { vol: 1.0, pitch: 0.96 + Math.random() * 0.08, important: true });
    if (def.look.type !== 'energy' && def.look.type !== 'revolver' && def.look.type !== 'launcher') {
      const right = V3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      g.effects.shell(g.viewModel.ejectWorld, right, V3(0, 1, 0));
    }
    if (def.projectile) { this.g.entities.localProjectileFired(); return; }
    // predicted visuals per pellet
    const dirs = computeShotDirections(def, d.x, d.y, d.z, spreadC, seed);
    const maxRange = def.range * 2.5;
    for (const dir of dirs) {
      const wh = raycastWorld(g.world.hash, o.x, o.y, o.z, dir[0], dir[1], dir[2], maxRange, 0, bulletFilter);
      const wallDist = wh ? wh.dist : maxRange;
      const zh = g.entities.raycastZombies(o.x, o.y, o.z, dir[0], dir[1], dir[2], wallDist);
      const hitDist = zh ? zh.t : wallDist;
      const hp = V3(o.x + dir[0] * hitDist, o.y + dir[1] * hitDist, o.z + dir[2] * hitDist);
      g.effects.tracer(muzzle, hp, def);
      if (zh) {
        g.effects.blood(hp.x, hp.y, hp.z, V3(dir[0], dir[1], dir[2]), def.damage > 100, zh.part === 1, { hash: g.world.hash });
        if (def.splash) g.effects.explosion(hp.x, hp.y, hp.z, def.splash.radius);
      } else if (wh) {
        const kind = matKind(wh.box);
        g.effects.impact(hp.x, hp.y, hp.z, wh.nx, wh.ny, wh.nz, kind);
        if (hitDist < 30) audio.play('impact_' + (kind === 'fence' ? 'metal' : kind), { vol: 0.45, pos: [hp.x, hp.y, hp.z], pitch: 0.9 + Math.random() * 0.2 });
        if (def.splash) g.effects.explosion(hp.x, hp.y, hp.z, def.splash.radius);
      }
    }
    if (held.mag === 0 && held.reserve === 0 && !this.lowAmmoWarned) { this.lowAmmoWarned = true; g.hud.feed('OUT OF AMMO - buy ammo at a wall or use the Mystery Box', 'warn'); }
  }

  // ---------------- interaction ----------------
  _interaction(dt) {
    const g = this.g, inp = this.input;
    const eye = this.eyePos(_v1);
    const fwd = this.forward(_v2);
    let best = null, bestScore = Infinity, bestLabel = null, bestProgress = null;
    const consider = (it, label, progress) => {
      const dx = it.x - eye.x, dy = it.y - eye.y, dz = it.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > (it.range || 2.5)) return;
      const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / (d || 1);
      if (dot < 0.35 && d > 1.3) return;
      const score = d - dot * 0.8;
      if (score < bestScore) { bestScore = score; best = it; bestLabel = label; bestProgress = progress; }
    };
    const K = `<b>${keyName(this.settings.controls.binds.interact)}</b>`;
    for (const it of g.mapVis.interactables) {
      if (it.kind === 'door') { if (!it.door.closed) continue; consider(it, `${K} Open <em>${it.door.label}</em> &nbsp;${it.door.cost}`); }
      else if (it.kind === 'box') {
        const bs = g.boxState;
        if (bs.state === 'idle') consider(it, `${K} Mystery Box &nbsp;${MYSTERY_BOX.cost}`);
        else if (bs.state === 'ready') { if (bs.user === g.myId) consider(it, `${K} Take <em>${WEAPONS[bs.weapon].name}</em>`); else consider(it, `<em>${WEAPONS[bs.weapon].name}</em> waiting for ${g.playerName(bs.user)}`); }
        else if (bs.state === 'spinning') consider(it, `Rolling...`);
      } else if (it.kind === 'wallbuy') {
        const has = this.weapons.find(w => w && w.id === it.wb.weapon);
        if (has) consider(it, `${K} Buy ammo for <em>${it.def.name}</em> &nbsp;${Math.round(it.wb.cost / 2)}`);
        else consider(it, `${K} Buy <em>${it.def.name}</em> &nbsp;${it.wb.cost}`);
      } else if (it.kind === 'board') {
        if (it.entry.boards >= it.entry.maxBoards) continue;
        consider(it, `Hold ${K} Repair barricade`, this.holdTarget && this.holdTarget.kind === 'board' && this.holdTarget.id === it.id ? this.holdProgress : null);
      }
    }
    for (const rp of g.entities.downedPlayers()) consider({ kind: 'revive', id: String(rp.id), x: rp.x, y: rp.y + 0.8, z: rp.z, range: 2.4 }, `Hold ${K} Revive <em>${rp.name}</em>`, rp.revivePct);
    this.interactTarget = best;
    g.hud.prompt(bestLabel, bestProgress);
    // key handling
    if (!inp.locked) { if (this.holdTarget) this._setHold(null); return; }
    const holdKinds = { board: 1, revive: 1 };
    if (inp.pressed('interact') && best) {
      if (holdKinds[best.kind]) this._setHold(best);
      else g.conn.send({ t: 'interact', target: `${best.kind}:${best.id}` });
    }
    if (this.holdTarget) {
      const same = best && best.kind === this.holdTarget.kind && best.id === this.holdTarget.id;
      if (!inp.down('interact') || !same) this._setHold(null);
      else this.holdProgress = Math.min(1, (this.holdProgress || 0) + dt / 0.75);
    }
  }
  _setHold(target) {
    if (target) { this.holdTarget = { kind: target.kind, id: target.id }; this.holdProgress = 0; this.g.conn.send({ t: 'hold', target: `${target.kind}:${target.id}` }); }
    else if (this.holdTarget) { this.holdTarget = null; this.holdProgress = 0; this.g.conn.send({ t: 'hold', target: null }); }
  }

  // ---------------- networking ----------------
  _sendInput(dt) {
    this.sendAcc += dt;
    if (this.sendAcc < 1 / INPUT_RATE) return;
    this.sendAcc = 0;
    let flags = 0;
    if (this.sprinting) flags |= IN.SPRINT;
    if (this.crouchK > 0.5) flags |= IN.CROUCH;
    if (this.ads) flags |= IN.ADS;
    if (this.input.locked && this.input.down('fire')) flags |= IN.FIRING;
    if (this.moving) flags |= IN.MOVING;
    if (this.onGround) flags |= IN.ONGROUND;
    if (this.jumpQueued) { flags |= IN.JUMP; this.jumpQueued = false; }
    if (this.reloading) flags |= IN.RELOADING;
    this.seq++;
    this.g.conn.sendBinary(encodeInput({ seq: this.seq, x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, flags, slot: this.slot, time: performance.now() }));
  }

  applySelf(m) {
    const g = this.g;
    if (m.points !== this.points) { const d = m.points - this.points; this.points = m.points; }
    this.hp = m.hp;
    // weapons (authoritative ammo)
    for (let i = 0; i < 2; i++) {
      const w = m.weapons[i];
      if (!w) { this.weapons[i] = null; continue; }
      if (!this.weapons[i] || this.weapons[i].id !== w.id) { this.weapons[i] = { id: w.id, mag: w.mag, reserve: w.reserve }; if (i === this.slot) g.viewModel.setWeapon(WEAPONS[w.id]); }
      else { this.weapons[i].mag = w.mag; this.weapons[i].reserve = w.reserve; }
      if (w.mag + w.reserve > 0) this.lowAmmoWarned = false;
    }
    if (m.slot !== this.slot && !this.switching) { this.slot = m.slot; if (this.held) g.viewModel.setWeapon(WEAPONS[this.held.id], true); }
    if (m.reload === 0 && this.reloading && this.def && !this.def.reloadPerShell && g.now > this.reloadUntil - 0.15) this._cancelReload();
    if (m.reload === 0 && this.reloading && this.def && this.def.reloadPerShell && this.held && this.held.mag >= this.def.mag) this._cancelReload();
    // state transitions
    if (m.state !== this.state) {
      const prev = this.state; this.state = m.state;
      if (m.state === PSTATE.DOWNED) { this.downedAt = g.now; this._cancelReload(); this.ads = false; g.viewModel.setVisible(false); audio.play('down', { vol: 0.9, important: true }); g.hud.banner('YOU ARE DOWN', 'Wait for a teammate to revive you', 2500); }
      else if (m.state === PSTATE.ALIVE) { g.viewModel.setVisible(true); if (prev === PSTATE.DOWNED) audio.play('revive', { vol: 0.8 }); }
      else if (m.state === PSTATE.DEAD) { g.viewModel.setVisible(false); g.hud.banner('YOU DIED', 'You will respawn next round', 3000); }
    }
    if (this.state === PSTATE.ALIVE && this.hp < 30 && m.hp < this.hp) { /* handled by vignette */ }
  }

  applyCorrection(m) { this.x = m.x; this.y = m.y; this.z = m.z; this.vx = this.vz = 0; this.vy = 0; this.lastCorrect = this.g.now; }
  respawn(m) { this.x = m.x; this.y = m.y; this.z = m.z; this.yaw = m.yaw || 0; this.pitch = 0; this.vx = this.vy = this.vz = 0; this.state = PSTATE.ALIVE; this.spectateT = 0; this.g.viewModel.setVisible(true); }
  addShake(amount) { this.shake = Math.min(0.12, this.shake + amount); this.shakeT = 0.4; }

  _hud() {
    const g = this.g, hud = g.hud;
    const held = this.held, def = this.def;
    hud.setPoints(this.points);
    if (held && def) {
      const low = held.mag <= Math.max(1, Math.floor(def.mag * 0.2)) && held.reserve + held.mag > 0;
      hud.setAmmo(held.mag, held.reserve, def.name, this.reloading, held.mag === 0 || low);
    } else hud.setAmmo(null, null, '', false, false);
    hud.setSlots(this.weapons.map(w => w ? WEAPONS[w.id] : null), this.slot);
    hud.setHealth(this.hp, this.state);
    // crosshair
    if (def && this.state === PSTATE.ALIVE) {
      const moveK = Math.min(1, this.speed2d / PLAYER.walkSpeed);
      const spread = (this.ads ? def.spreadAds : def.spreadHip) + moveK * def.spreadMove + this.heat * def.spreadPerShot * 3;
      const px = 6 + spread * 7;
      const scoped = !!(this.ads && def.scope && g.viewModel.ads > 0.85);
      hud.crosshair(px, this.ads && def.scope);
      hud.scope(scoped);
      g.viewModel.setVisible(!scoped);
    } else { hud.crosshair(10, true); hud.scope(false); }
    if (this.state === PSTATE.DOWNED) hud.downed(true, PLAYER.bleedoutTime - (g.now - this.downedAt), this.beingRevivedPct > 0);
    else hud.downed(false);
    hud.reviveProgress(this.beingRevivedPct > 0 && this.state === PSTATE.DOWNED ? this.beingRevivedPct : null, 'BEING REVIVED...');
  }
}

const _v1 = new BABYLON.Vector3(), _v2 = new BABYLON.Vector3();
function r3(v) { return Math.round(v * 1000) / 1000; }
function r4(v) { return Math.round(v * 10000) / 10000; }
function keyName(code) {
  if (!code) return '?';
  if (code === 'Mouse0') return 'LMB'; if (code === 'Mouse2') return 'RMB'; if (code === 'Mouse1') return 'MMB';
  if (code.startsWith('Key')) return code.slice(3); if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'SPACE'; if (code === 'ShiftLeft') return 'SHIFT'; if (code === 'ControlLeft') return 'CTRL';
  return code.toUpperCase();
}
function matKind(box) {
  if (!box) return 'concrete';
  const m = box.mat || '';
  if (box.fence) return 'fence';
  if (m.startsWith('metal') || m === 'vehicle' || m.startsWith('paint') || m.startsWith('door_gate') || m.startsWith('door_rollup')) return 'metal';
  if (m.startsWith('wood') || m === 'boards' || m === 'fabric' || m === 'door_door' || m === 'wallpaper') return 'wood';
  if (m === 'glass') return 'glass';
  return 'concrete';
}
