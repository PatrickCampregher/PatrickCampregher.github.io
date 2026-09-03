// Game session: Babylon engine/scene setup, world construction, network event handling, render loop.
/* global BABYLON */
import { MAP } from '/shared/mapdata.js';
import { buildWorld } from '/shared/mapbuild.js';
import { WEAPONS, WEAPON_LIST } from '/shared/weapons.js';
import { PSTATE, RSTATE, POWERUP_TYPES, POWERUP_INFO, POWERUP, MYSTERY_BOX } from '/shared/constants.js';
import { TextureLibrary } from '../maps/textures.js';
import { MaterialLibrary } from '../maps/materials.js';
import { LightingRig, buildSky, buildEnvironment } from '../maps/lighting.js';
import { buildMap } from '../maps/mapBuilder.js';
import { Effects } from '../effects/effects.js';
import { buildWeaponModel, cloneWeaponModel } from '../weapons/weaponModels.js';
import { ViewModel, WeaponModelCache } from '../weapons/viewModel.js';
import { LocalPlayer } from './player.js';
import { Entities } from './entities.js';
import { audio } from '../audio/audio.js';

const B = () => BABYLON;
const V3 = (x, y, z) => new (BABYLON.Vector3)(x, y, z);
// Yield to the browser; falls back to a timer when rAF is throttled (background tab).
const nextFrame = () => new Promise(r => { let done = false; const fin = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(fin); setTimeout(fin, 40); });

export class Game {
  constructor(opts) {
    Object.assign(this, opts); // canvas, conn, settings, myId, initMsg, hud, input, onExit, onGameOver, names
    this.now = 0;
    this.running = false;
    this.round = this.initMsg.round; this.roundState = this.initMsg.roundState;
    this.scores = {}; this.states = {};
    this.boxState = { loc: 0, state: 'idle', weapon: null, user: 0 };
    this.effectsActive = { oneshot: 0, double: 0 };
    this.lastPoints = null;
    this.offs = [];
    this.fpsAcc = 0; this.fpsN = 0; this.fpsShown = 0;
    this.lightT = 0;
    this.boxDisplay = null; this.boxCycleT = 0;
    this.ambient = [];
    this.gameOver = false;
    this.lastRenderT = 0;
    this.paused = false;
    for (const p of this.initMsg.players) { this.names[p.id] = p.name; this.scores[p.id] = p.points; this.states[p.id] = p.state; }
  }

  playerName(id) { return this.names[id] || ('Player ' + id); }
  serverTimeMs() { return this.conn.serverTime(); }
  renderTimeMs() { const interp = Math.max(60, Math.min(160, 60 + this.conn.rtt * 0.5)); return this.conn.serverTime() - interp; }

  // ---------------- loading ----------------
  async load(progress) {
    const g = this.settings.graphics;
    progress(0.02, 'Starting engine');
    this.engine = new (B().Engine)(this.canvas, false, { preserveDrawingBuffer: false, stencil: true, powerPreference: 'high-performance', doNotHandleContextLost: true, audioEngine: false }, false);
    this.engine.setHardwareScalingLevel(1 / (g.resolutionScale || 1));
    const scene = this.scene = new (B().Scene)(this.engine);
    scene.skipPointerMovePicking = true;
    scene.autoClear = true; scene.autoClearDepthAndStencil = true;
    scene.setRenderingAutoClearDepthStencil(1, true, true, false);
    scene.blockMaterialDirtyMechanism = true;
    this.camera = new (B().FreeCamera)('cam', V3(0, 1.7, 0), scene);
    this.camera.fovMode = B().Camera.FOVMODE_HORIZONTAL_FIXED;
    this.camera.fov = (g.fov || 95) * Math.PI / 180;
    this.camera.minZ = 0.05; this.camera.maxZ = 700;
    this.camera.inputs.clear();
    scene.activeCamera = this.camera;
    await nextFrame();
    progress(0.06, 'Building collision world');
    this.world = buildWorld(MAP);
    this.textures = new TextureLibrary(scene, g.textures);
    this.mats = new MaterialLibrary(scene, this.textures, this.settings);
    this.mats.maxLights = 10;
    await nextFrame();
    progress(0.1, 'Painting textures');
    await this.textures.preload(this.textures.names(), (k) => progress(0.1 + 0.45 * k, 'Painting textures'));
    progress(0.56, 'Lighting the town');
    this.lighting = new LightingRig(scene, this.engine, this.settings, this.camera);
    buildSky(scene, this.mats);
    buildEnvironment(scene);
    this.effects = new Effects(scene, this.mats, this.textures, this.settings, this.lighting);
    this.effects.onShake = (x, y, z, r) => { if (this.player) { const d = Math.hypot(this.player.x - x, this.player.z - z); this.player.addShake(Math.max(0, 0.08 * (1 - d / (r * 4)))); } };
    await nextFrame();
    progress(0.62, 'Building Ashford Street');
    this.mapVis = buildMap(scene, this.world, this.mats, this.lighting, this.textures, this.effects, this.settings);
    await nextFrame();
    progress(0.8, 'Loading weapons');
    this.weaponCache = new WeaponModelCache(scene, this.mats, (id) => buildWeaponModel(scene, this.mats, WEAPONS[id]));
    // only the starting pistol + the street wall-buys are built during loading (spread over frames); the rest of the
    // roster is built lazily on first use and warmed in the background after the game starts
    for (const id of ['warden_p9', 'vesper_smg', 'gatekeeper_12', 'kestrel_ar']) { if (WEAPONS[id]) this.weaponCache.get(id); await nextFrame(); }
    this.viewModel = new ViewModel(scene, this.camera, this.weaponCache);
    setTimeout(() => { if (this.running) this.weaponCache.preload(WEAPON_LIST.map(w => w.id), 90); }, 5000);
    await nextFrame();
    progress(0.86, 'Raising the dead');
    this.entities = new Entities(this);
    this.player = new LocalPlayer(this);
    this.lighting.finalizeStaticLights();
    this._setupReflections();
    this._applyInit(this.initMsg);
    this.viewModel.setWeapon(WEAPONS.warden_p9, true);
    this._bindNetwork();
    progress(0.92, 'Compiling shaders');
    await nextFrame();
    this.camera.position.set(this.player.x, this.player.y + 1.6, this.player.z);
    this.camera.rotation.set(0, this.player.yaw, 0);
    this._dynamicLights(true);
    scene.render();
    await nextFrame();
    scene.render();
    progress(1, 'Ready');
    this._startAmbience();
  }

  _applyInit(m) {
    for (const id of m.doors) { const d = this.world.doors[id]; if (d) { d.closed = false; const mesh = this.mapVis.doorMeshes.get(id); if (mesh) mesh.setEnabled(false); } }
    for (const id in m.boards) { const e = this.world.entries[id]; if (e) { e.boards = m.boards[id]; this._updateBoards(id); } }
    this._applyBox(m.box, true);
    if (m.effects) { this.effectsActive.oneshot = m.effects.oneshot || 0; this.effectsActive.double = m.effects.double || 0; }
    this.hud.setRound(m.round, m.roundState);
    this.player.points = m.players.find(p => p.id === this.myId)?.points ?? this.player.points;
    this.lastPoints = this.player.points;
  }

  // ---------------- run loop ----------------
  start() {
    this.running = true;
    this.input.enabled = true;
    this.hud.show();
    this.input.onLockChange = (locked) => { if (!locked && this.running && !this.gameOver) this.setPaused(true); else if (locked) this.setPaused(false); };
    this.input.requestLock();
    this.engine.runRenderLoop(() => this._frame());
    window.addEventListener('resize', this._onResize = () => this.engine.resize());
    this.hud.banner(`SURVIVE`, `Ashford Street - defend, earn points, open the town`, 3500, 'cool');
  }

  setPaused(p) {
    if (this.paused === p) return;
    this.paused = p;
    if (this.onPause) this.onPause(p);
  }

  _frame() {
    if (!this.running) return;
    const g = this.settings.graphics;
    const nowMs = performance.now();
    if (g.fpsLimit > 0 && nowMs - this.lastRenderT < 1000 / g.fpsLimit - 0.5) return;
    let dt = (this.lastRenderT ? nowMs - this.lastRenderT : 16) / 1000;
    this.lastRenderT = nowMs;
    if (dt > 0.1) dt = 0.1;
    this.now += dt;
    try {
      this.player.update(dt);
      const rt = this.renderTimeMs();
      this.entities.update(dt, rt);
      const p = this.player;
      this.viewModel.update(dt, { mouseDX: this.input.locked ? this.input.mouseDX : 0, mouseDY: this.input.locked ? this.input.mouseDY : 0, speed: p.speed2d, sprinting: p.sprinting, onGround: p.onGround, ads: p.ads, crouch: p.crouchK > 0.5 });
      this.effects.update(dt);
      this.lighting.update(dt);
      this._updateBoxVisual(dt);
      this._updateEffectsHud(dt);
      this.hud.update(dt);
      const cam = this.camera;
      const fwd = cam.getDirection(B().Axis.Z);
      audio.setListener(cam.position.x, cam.position.y, cam.position.z, fwd.x, fwd.y, fwd.z);
      this.lightT += dt; if (this.lightT > 0.5) { this.lightT = 0; this._dynamicLights(); }
      this.fpsAcc += dt; this.fpsN++;
      if (this.fpsAcc >= 0.5) { this.fpsShown = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; this.hud.fps(this.fpsShown, g.showFps); }
    } catch (e) { console.error(e); }
    this.input.endFrame();
    this.scene.render();
  }

  /** One-shot reflection probe for car paint and storefront glass (HIGH/ULTRA). */
  _setupReflections() {
    const g = this.settings.graphics;
    if (!(g.effects === 'high' || g.effects === 'ultra') || !B().ReflectionProbe) return;
    try {
      const probe = new (B().ReflectionProbe)('townProbe', 128, this.scene);
      probe.position = V3(0, 2.5, 0);
      probe.refreshRate = B().RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
      for (const m of this.mapVis.staticMeshes) if (m.name.startsWith('chunk_') || m.name === 'sky') probe.renderList.push(m);
      const sky = this.scene.getMeshByName('sky'); if (sky && !probe.renderList.includes(sky)) probe.renderList.push(sky);
      for (const [key, mat] of this.mats.cache) {
        if (key.startsWith('vehicle_') || key === 'glass') { mat.reflectionTexture = probe.cubeTexture; if (key !== 'glass') mat.roughness = 0.45; }
      }
      this.probe = probe;
    } catch (e) { console.warn('reflection probe unavailable', e); }
  }

  /** Re-register shadow casters after the shadow generator was rebuilt (graphics settings changed). */
  reapplyShadows() {
    const sg = this.lighting.shadow;
    if (!sg) return;
    for (const m of this.mapVis.shadowCasters) sg.addShadowCaster(m, false);
    for (const m of this.entities.dynamicBaseMeshes()) sg.addShadowCaster(m, false);
    sg.addShadowCaster(this.mapVis.boardBase, false);
    this.entities.rigs.shadow = sg;
  }

  _dynamicLights(initial = false) {
    const meshes = [...this.entities.dynamicBaseMeshes(), ...(this.viewModel.lightMeshes || []), this.mapVis.boardBase];
    this.lighting.updateDynamicLights(meshes, this.camera.position);
  }

  // ---------------- network ----------------
  _bindNetwork() {
    const c = this.conn, on = (t, f) => this.offs.push(c.on(t, f));
    c.onSnapshot = (s) => this._onSnapshot(s);
    on('self', (m) => {
      const prev = this.lastPoints;
      this.player.applySelf(m);
      if (prev != null && m.points > prev) this.hud.pointsPop(m.points - prev);
      this.lastPoints = m.points;
      this.scores[this.myId] = m.points; this.states[this.myId] = m.state;
      if (m.stats) this.player.stats = m.stats;
      this._team();
    });
    on('correct', (m) => this.player.applyCorrection(m));
    on('respawn', (m) => { this.player.respawn(m); this.hud.banner('RESPAWNED', '', 1500, 'cool'); });
    on('hit', (m) => this.entities.onHit(m));
    on('shot', (m) => this.entities.onRemoteShot(m));
    on('arc', (m) => { this.effects.arc(m.from, m.links); audio.play('arc_hit', { pos: m.from, vol: 0.8 }); });
    on('explode', (m) => { this.effects.explosion(m.x, m.y, m.z, m.r); audio.play('explosion', { pos: [m.x, m.y, m.z], vol: 1.2, ref: 8, max: 150, important: true }); });
    on('round', (m) => {
      this.round = m.round;
      if (m.state === 'intro') { this.hud.banner(`ROUND ${m.round}`, m.round === 1 ? 'They are coming' : `${m.total} zombies`, 3200); audio.play('round_start', { vol: 0.9, important: true }); }
      else if (m.state === 'ending') { this.hud.banner(`ROUND ${m.round} CLEARED`, 'Get ready', 2500, 'gold'); audio.play('round_end', { vol: 0.8, important: true }); }
    });
    on('pts', () => { });
    on('dmg', (m) => {
      if (m.x != null) { const ang = Math.atan2(m.x - this.player.x, m.z - this.player.z) - this.player.yaw; this.hud.damageFrom(ang); }
      audio.play('impact_flesh', { vol: 0.5, pitch: 0.7 });
      this.player.addShake(0.03);
    });
    on('down', (m) => { this.states[m.id] = PSTATE.DOWNED; if (m.id !== this.myId) { this.hud.feed(`${this.playerName(m.id)} is down!`, 'bad'); audio.play('down', { vol: 0.4 }); } this._team(); });
    on('dead', (m) => { this.states[m.id] = PSTATE.DEAD; if (m.id !== this.myId) this.hud.feed(`${this.playerName(m.id)} bled out`, 'bad'); this._team(); });
    on('revive', (m) => { this.states[m.id] = PSTATE.ALIVE; this.hud.feed(`${this.playerName(m.by)} revived ${this.playerName(m.id)}`); if (m.by === this.myId) audio.play('revive', { vol: 0.7 }); this._team(); });
    on('door', (m) => {
      const d = this.world.doors[m.id]; if (!d) return;
      d.closed = false;
      const mesh = this.mapVis.doorMeshes.get(m.id); if (mesh) mesh.setEnabled(false);
      audio.play('door', { pos: [d.box.cx, d.box.y0 + 1, d.box.cz], vol: 0.9, ref: 4 });
      if (m.by === this.myId) audio.play('buy', { vol: 0.7 });
      this.hud.feed(`${this.playerName(m.by)} opened ${d.label}`);
    });
    on('board', (m) => {
      const e = this.world.entries[m.id]; if (!e) return;
      e.boards = m.boards; this._updateBoards(m.id);
      audio.play(m.by === 'z' ? 'tear' : 'board', { pos: [e.inside[0], e.inside[1] + 1.2, e.inside[2]], vol: 0.8, ref: 4 });
    });
    on('box', (m) => this._applyBox(m));
    on('powerup', (m) => {
      if (m.ev === 'spawn') audio.play('powerup_spawn', { pos: [m.x, m.y + 1, m.z], vol: 0.9, ref: 8, max: 120 });
      else if (m.ev === 'pickup') {
        const type = POWERUP_TYPES[m.type];
        audio.play('powerup', { vol: 0.8, important: true });
        audio.play(type === 'blast' ? 'blast' : type === 'resupply' ? 'resupply' : type === 'oneshot' ? 'oneshot' : 'double', { vol: 0.9, important: true });
        this.hud.banner(POWERUP_INFO[type].name, `picked up by ${this.playerName(m.by)}`, 2200, type === 'double' ? 'gold' : type === 'resupply' ? 'cool' : '');
        if (type === 'oneshot') this.effectsActive.oneshot = m.dur || POWERUP.effectTime;
        if (type === 'double') this.effectsActive.double = m.dur || POWERUP.effectTime;
        if (type === 'blast') this.player.addShake(0.08);
      }
    });
    on('weapon', (m) => { audio.play('weapon_pickup', { vol: 0.8 }); this.hud.feed(`Picked up ${WEAPONS[m.id].name}`); });
    on('ammo', () => { audio.play('buy', { vol: 0.8 }); this.hud.notice('AMMO RESTOCKED', 1200); });
    on('notice', (m) => { this.hud.notice(m.text); audio.play('nopoints', { vol: 0.6 }); });
    on('scores', (m) => { for (const id in m.s) this.scores[id] = m.s[id]; this._team(); });
    on('pjoin', (m) => { this.names[m.id] = m.name; this.scores[m.id] = m.points; this.states[m.id] = PSTATE.ALIVE; this.hud.feed(`${m.name} joined`); this._team(); });
    on('pleave', (m) => { this.hud.feed(`${this.playerName(m.id)} left`); delete this.scores[m.id]; delete this.states[m.id]; this.entities.onPlayerLeave(m.id); this._team(); });
    on('zvanish', (m) => this.entities.onZombieVanish(m.id));
    on('chat', (m) => this.hud.feed(`${m.from}: ${m.text}`));
    on('gameover', (m) => { this.gameOver = true; this.input.exitLock(); this.hud.hide(); if (this.onGameOver) this.onGameOver(m); });
    on('hostChanged', (m) => this.hud.feed(`${m.name} is now the host`));
    this.conn.onClose = () => { if (this.running && this.onDisconnect) this.onDisconnect(); };
  }

  _onSnapshot(s) {
    this.entities.applySnapshot(s);
    this.round = s.round; this.roundState = s.roundState;
    this.hud.setRound(s.round, s.roundState);
    this.hud.setZombiesLeft(s.roundState === RSTATE.ACTIVE ? s.zombiesLeft : 0);
    for (const p of s.players) { this.states[p.id] = p.state; }
    if ((s.tick & 15) === 0) this._team();
    if (!(s.powerupFlags & 1)) this.effectsActive.oneshot = 0;
    if (!(s.powerupFlags & 2)) this.effectsActive.double = 0;
  }

  _team() {
    const list = [];
    for (const id in this.names) {
      const nid = +id;
      if (!(nid in this.scores)) continue;
      list.push({ id: nid, name: this.names[id], points: this.scores[id] ?? 0, state: this.states[id] ?? PSTATE.ALIVE, me: nid === this.myId });
    }
    list.sort((a, b) => a.id - b.id);
    this.hud.setTeam(list);
  }

  _updateEffectsHud(dt) {
    const act = [];
    for (const k of ['oneshot', 'double']) { if (this.effectsActive[k] > 0) { this.effectsActive[k] -= dt; if (this.effectsActive[k] > 0) act.push({ type: k, remaining: this.effectsActive[k] }); } }
    this.hud.setPowerups(act);
  }

  _updateBoards(id) {
    const b = this.mapVis.boards.get(id); if (!b) return;
    b.planks.forEach((pl, i) => { pl.isVisible = i < b.entry.boards; });
  }

  // ---------------- mystery box ----------------
  _applyBox(m, initial = false) {
    const prev = this.boxState;
    const bx = this.mapVis.box;
    const loc = this.world.boxLocations[m.loc];
    if (m.loc !== prev.loc || initial) { this.mapVis.setBoxLocation(m.loc); }
    const pos = [loc.x, loc.y + 0.8, loc.z];
    if (m.state !== prev.state || initial) {
      if (m.state === 'spinning') {
        audio.play('box_open', { pos, vol: 0.9, ref: 4 }); audio.play('box_music', { pos, vol: 0.8, ref: 5, max: 60 });
        bx.glow.isVisible = true; bx.light.intensity = 3;
        this._showBoxDisplay(true);
      } else if (m.state === 'ready') {
        audio.play('box_done', { pos, vol: 0.9, ref: 4 });
        this._showBoxDisplay(true, m.weapon);
        if (m.user === this.myId) this.hud.notice(`${WEAPONS[m.weapon].name.toUpperCase()} - press ${keyLabel(this.settings.controls.binds.interact)} to take`, 3000);
      } else if (m.state === 'bear') {
        audio.play('bear', { pos, vol: 1.0, ref: 5, max: 80, important: true });
        this._showBoxDisplay(false);
        this.mapVis.bear.setEnabled(true); this.mapVis.bear.position.set(loc.x, loc.y + 0.5, loc.z); this.mapVis.bear.rotation.y = loc.yaw + Math.PI;
        this._bearT = 0;
        this.hud.notice('THE BEAR... THE BOX IS LEAVING', 2500);
      } else if (m.state === 'moving') {
        audio.play('box_vanish', { pos, vol: 0.9, ref: 5 });
        this._boxVanishT = 0;
        this.mapVis.bear.setEnabled(false);
      } else { // idle
        this._showBoxDisplay(false);
        bx.glow.isVisible = false; bx.light.intensity = 0;
        bx.root.setEnabled(true); bx.root.scaling.setAll(1);
        if (prev.state === 'moving' && !initial) this.hud.notice('THE MYSTERY BOX HAS MOVED', 2500);
      }
    }
    this.boxState = { loc: m.loc, state: m.state, weapon: m.weapon, user: m.user, t: 0 };
  }

  _showBoxDisplay(on, weaponId = null) {
    if (this.boxDisplay) { this.boxDisplay.dispose(); this.boxDisplay = null; }
    if (!on) return;
    const id = weaponId || WEAPON_LIST[Math.floor(Math.random() * WEAPON_LIST.length)].id;
    this.boxDisplay = cloneWeaponModel(this.weaponCache.get(id), 'boxdisp');
    this.boxDisplay.root.parent = this.mapVis.box.display;
    this.boxDisplay.root.rotation.set(0, Math.PI / 2, 0);
    this.boxDisplay.fixed = !!weaponId;
  }

  _updateBoxVisual(dt) {
    const bs = this.boxState, bx = this.mapVis.box;
    bs.t = (bs.t || 0) + dt;
    const targetLid = (bs.state === 'spinning' || bs.state === 'ready' || bs.state === 'bear') ? -1.9 : 0;
    bx.lidPivot.rotation.x += (targetLid - bx.lidPivot.rotation.x) * Math.min(1, dt * 5);
    if (bs.state === 'spinning') {
      const speed = Math.max(0.06, 0.06 + Math.pow(bs.t / MYSTERY_BOX.spinTime, 2.2) * 0.5);
      this.boxCycleT += dt;
      if (this.boxCycleT > speed) { this.boxCycleT = 0; this._showBoxDisplay(true); audio.play('box_tick', { pos: [bx.root.position.x, bx.root.position.y + 1, bx.root.position.z], vol: 0.35, ref: 3 }); }
      bx.display.position.y = 0.6 + Math.min(1, bs.t / 1.2) * 0.6;
      bx.light.intensity = 2 + Math.sin(bs.t * 25) * 1.5;
    } else if (bs.state === 'ready') {
      bx.display.position.y = 1.2 + Math.sin(bs.t * 2) * 0.05;
      if (this.boxDisplay) this.boxDisplay.root.rotation.y += dt * 1.2;
      bx.light.intensity = 2.5;
    } else if (bs.state === 'bear') {
      this._bearT = (this._bearT || 0) + dt;
      const loc = this.world.boxLocations[bs.loc];
      this.mapVis.bear.position.y = loc.y + 0.5 + this._bearT * 0.75;
      this.mapVis.bear.rotation.y += dt * 1.5;
      bx.light.intensity = 3 + Math.sin(this._bearT * 12) * 2; bx.light.diffuse.set(1, 0.3, 0.3);
    } else if (bs.state === 'moving') {
      this._boxVanishT = (this._boxVanishT || 0) + dt;
      const k = Math.max(0, 1 - this._boxVanishT / 1.2);
      bx.root.scaling.set(k, k, k);
      if (k <= 0.01) bx.root.setEnabled(false);
      bx.light.diffuse.set(0.4, 0.8, 1);
    }
    if (bs.state === 'idle') { bx.light.diffuse.set(0.4, 0.8, 1); }
    bx.beam.rotation.y += dt * 0.3;
  }

  _startAmbience() {
    const wind = audio.play('wind', { loop: true, vol: 0.5, bus: 'ambient' });
    if (wind) this.ambient.push(wind);
    let n = 0;
    for (const f of this.effects.fires) {
      if (n++ >= 10) break;
      const p = f.light.position;
      const h = audio.play('fire', { loop: true, vol: 0.9, pos: [p.x, p.y, p.z], ref: 3, max: 40, bus: 'ambient', offset: Math.random() * 2 });
      if (h) this.ambient.push(h);
    }
    this._screamTimer = setInterval(() => {
      if (!this.running) return;
      if (Math.random() < 0.5) { const a = Math.random() * Math.PI * 2; audio.play('scream', { pos: [this.player.x + Math.cos(a) * 60, 5, this.player.z + Math.sin(a) * 60], vol: 0.6, ref: 20, max: 200, bus: 'ambient' }); }
    }, 9000);
  }

  dispose() {
    this.running = false;
    clearInterval(this._screamTimer);
    for (const h of this.ambient) h.stop(0.3);
    audio.stopAllLoops();
    for (const off of this.offs) off();
    this.conn.onSnapshot = null; this.conn.onClose = null;
    this.input.enabled = false; this.input.onLockChange = null; this.input.exitLock();
    window.removeEventListener('resize', this._onResize);
    this.hud.hide();
    try { this.engine.stopRenderLoop(); } catch (e) { /* ignore */ }
    try { this.entities.dispose(); } catch (e) { /* ignore */ }
    try { this.scene.dispose(); } catch (e) { /* ignore */ }
    try { this.engine.dispose(); } catch (e) { /* ignore */ }
    const labels = document.getElementById('labels'); if (labels) labels.innerHTML = '';
  }
}

function keyLabel(code) { if (!code) return '?'; if (code.startsWith('Key')) return code.slice(3); return code.toUpperCase(); }
