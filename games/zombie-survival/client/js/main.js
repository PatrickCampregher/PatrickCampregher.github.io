// App controller: local server agent, hosting/joining flow, lobby, loading and game lifecycle.
import { settings, saveSettings } from './settings/settings.js';
import { Connection, localWsUrl, wsUrlFor } from './net/connection.js';
import { MenuController } from './ui/menu.js';
import { HUD } from './ui/hud.js';
import { Input } from './gameplay/input.js';
import { Game } from './gameplay/game.js';
import { audio } from './audio/audio.js';
import { GAME_VERSION } from '/shared/constants.js';
import { installDevHelpers } from './dev.js';

const $ = (id) => document.getElementById(id);

class App {
  constructor() {
    this.canvas = $('renderCanvas');
    this.input = new Input(this.canvas, settings);
    this.hud = new HUD();
    this.menu = new MenuController(this);
    this.local = null;       // connection to the local server (LAN discovery, hosting)
    this.gameConn = null;    // connection used for the lobby/game (local or remote)
    this.remoteConn = null;
    this.myId = 0;
    this.lobby = null;
    this.game = null;
    this.pendingInit = null;
    this.serverInfo = null;
    this._bindOverlays();
    $('ver').textContent = 'v' + GAME_VERSION;
    document.addEventListener('pointerdown', () => { audio.init(settings.audio); audio.resume(); }, { once: false });
    document.addEventListener('keydown', () => { audio.init(settings.audio); audio.resume(); }, { once: true });
    this.connectLocal();
    if (!settings.player.name) settings.player.name = '';
  }

  // ---------------- local agent ----------------
  async connectLocal() {
    try {
      const c = new Connection(localWsUrl());
      await c.connect(4000);
      this.local = c;
      c.on('lanList', (m) => this.menu.renderLobbies(m.lobbies));
      c.onClose = () => { this.local = null; this.menu.status('main-status', 'Lost connection to the local server. Restart START_GAME.bat and reload this page.', true); setTimeout(() => this.connectLocal(), 3000); };
      const hello = await c.request({ t: 'hello', name: settings.player.name }, 'hello');
      this.serverInfo = hello;
      $('lan-info').innerHTML = hello.lan && hello.lan.length ? `Your LAN address: <b>${hello.lan.map(a => a + ':' + hello.port).join('</b> or <b>')}</b>` : 'No LAN network detected (Wi-Fi/Ethernet off?)';
      $('btn-rejoin').classList.toggle('hidden', !(hello.lobby && hello.lobby.players.length));
      this.menu.status('main-status', '');
    } catch (e) {
      this.menu.status('main-status', 'Cannot reach the local game server. Start the game with START_GAME.bat, then open this page.', true);
      setTimeout(() => this.connectLocal(), 3000);
    }
  }

  // ---------------- flows ----------------
  async playSolo() {
    if (!this.local) { this.menu.status('main-status', 'Local server not connected yet...', true); return; }
    await this._useConn(this.local);
    try {
      const j = await this.gameConn.request({ t: 'create', name: 'Solo Survival', playerName: this.menu.playerName(), public: false, maxPlayers: 1 }, 'joined');
      this.myId = j.id;
      this.gameConn.send({ t: 'start' });
    } catch (e) { this.menu.status('main-status', e.message, true); }
  }

  async hostGame({ name, maxPlayers, playerName, isPublic }) {
    if (!this.local) { this.menu.status('host-status', 'Local server not connected.', true); return; }
    settings.player.lastLobby = name; saveSettings();
    await this._useConn(this.local);
    try {
      this.menu.status('host-status', 'Creating lobby...');
      const j = await this.gameConn.request({ t: 'create', name, playerName, public: isPublic, maxPlayers }, 'joined');
      this.myId = j.id;
      this.menu.show('lobby');
      $('chat-log').innerHTML = '';
    } catch (e) { this.menu.status('host-status', e.message, true); }
  }

  async joinLobby(lobby, playerName) {
    try {
      this.menu.status('find-status', `Connecting to ${lobby.name}...`);
      let conn;
      if (lobby.self && this.local) conn = this.local;
      else { conn = new Connection(wsUrlFor(lobby.address, lobby.port)); await conn.connect(5000); await conn.request({ t: 'hello', name: playerName }, 'hello'); }
      await this._useConn(conn);
      const j = await conn.request({ t: 'join', playerName }, 'joined');
      this.myId = j.id;
      this.menu.status('find-status', '');
      this.menu.show('lobby');
      $('chat-log').innerHTML = '';
    } catch (e) { this.menu.status('find-status', 'Join failed: ' + e.message, true); if (this.remoteConn) { this.remoteConn.close(); this.remoteConn = null; } }
  }

  async joinByName(name, playerName) {
    if (!name) { this.menu.status('name-status', 'Enter a lobby name.', true); return; }
    this.menu.status('name-status', 'Searching the network...');
    this.local?.send({ t: 'lanList', on: true });
    const q = name.toLowerCase();
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const found = this.menu.lobbies.find(l => l.name.toLowerCase() === q) || this.menu.lobbies.find(l => l.name.toLowerCase().includes(q));
      if (found) { await this.joinLobby(found, playerName); if (this.lobby) return; this.menu.status('name-status', $('find-status').textContent, true); return; }
      await new Promise(r => setTimeout(r, 400));
    }
    this.menu.status('name-status', `No lobby named "${name}" found on this network.`, true);
  }

  async directConnect(addr, playerName) {
    if (!addr) { this.menu.status('direct-status', 'Enter the host IP address.', true); return; }
    settings.player.lastIp = addr; saveSettings();
    let host = addr, port = this.serverInfo ? this.serverInfo.port : 8080;
    const m = addr.match(/^\[?([^\]]+?)\]?(?::(\d+))?$/);
    if (m) { host = m[1]; if (m[2]) port = parseInt(m[2], 10); }
    await this.joinLobby({ name: host, address: host, port, self: false }, playerName);
    if (!this.lobby) this.menu.status('direct-status', $('find-status').textContent, true);
  }

  async rejoin() {
    if (!this.local) return;
    await this._useConn(this.local);
    try { const j = await this.gameConn.request({ t: 'join', playerName: this.menu.playerName() }, 'joined'); this.myId = j.id; this.menu.show('lobby'); }
    catch (e) { this.menu.status('main-status', e.message, true); }
  }

  async _useConn(conn) {
    if (this.gameConn && this.gameConn !== conn) this._detachGameConn();
    if (this.remoteConn && this.remoteConn !== conn) { this.remoteConn.close(); this.remoteConn = null; }
    this.gameConn = conn;
    if (conn !== this.local) this.remoteConn = conn;
    this._offs = [
      conn.on('lobby', (m) => { this.lobby = m.lobby; this.menu.renderLobby(m.lobby, this.myId); }),
      conn.on('gameStart', () => this._onGameStart()),
      conn.on('init', (m) => { if (this.pendingInit) this.pendingInit(m); }),
      conn.on('gameEnded', () => this._onGameEnded()),
      conn.on('chat', (m) => this.menu.chat(m.from, m.text)),
      conn.on('error', (m) => { this.menu.status('lobby-status', m.text || m.code, true); }),
      conn.on('hostChanged', (m) => this.menu.chat('*', `${m.name} is now the host`)),
    ];
    if (conn !== this.local) conn.onClose = () => this._onRemoteClosed();
  }
  _detachGameConn() { if (this._offs) for (const o of this._offs) o(); this._offs = null; }

  toggleReady() { const me = this.lobby?.players.find(p => p.id === this.myId); this.gameConn?.send({ t: 'ready', ready: !(me && me.ready) }); }
  startGame() { this.gameConn?.send({ t: 'start' }); }
  leaveLobby() {
    this.gameConn?.send({ t: 'leave' });
    this._detachGameConn();
    if (this.remoteConn) { this.remoteConn.close(); this.remoteConn = null; }
    this.gameConn = null; this.lobby = null;
    this.menu.show('main');
  }

  _onRemoteClosed() {
    if (this.game) { this.game.dispose(); this.game = null; this.hidePause(); $('gameover').classList.add('hidden'); }
    this._detachGameConn(); this.remoteConn = null; this.gameConn = null; this.lobby = null;
    this.menu.show('main');
    this.menu.status('main-status', 'Connection to the host was lost.', true);
  }

  // ---------------- game lifecycle ----------------
  async _onGameStart() {
    if (this.game) return;
    this.menu.hide();
    this.showLoading(0.01, 'Waiting for the host');
    const conn = this.gameConn;
    const init = await new Promise((resolve) => { this.pendingInit = (m) => { conn.startQueue(); resolve(m); }; setTimeout(() => resolve(null), 15000); });
    this.pendingInit = null;
    if (!init) { this.hideLoading(); this.menu.show('lobby'); this.menu.status('lobby-status', 'Did not receive game state from the host.', true); return; }
    try { await audio.init(settings.audio); } catch (e) { console.warn('audio unavailable', e); }
    const names = {};
    const game = new Game({
      canvas: this.canvas, conn: this.gameConn, settings, myId: this.myId, initMsg: init, hud: this.hud, input: this.input, names,
      onGameOver: (m) => this.showGameOver(m),
      onPause: (p) => (p ? this.showPause() : this.hidePause()),
      onDisconnect: () => this._onRemoteClosed(),
    });
    this.game = game;
    try {
      await game.load((k, text) => this.showLoading(k, text));
    } catch (e) {
      console.error(e);
      this.hideLoading();
      game.dispose(); this.game = null;
      conn.flushQueue();
      this.menu.show('lobby');
      this.menu.status('lobby-status', 'Failed to start the renderer: ' + e.message, true);
      return;
    }
    this.hideLoading();
    conn.flushQueue(); // replay events that arrived while loading (joins, doors, box moves...)
    game.start();
  }

  _onGameEnded() {
    $('gameover').classList.add('hidden');
    if (this.game) { this.game.dispose(); this.game = null; }
    this.hidePause();
    this.menu.show('lobby');
    if (this.lobby) this.menu.renderLobby(this.lobby, this.myId);
  }

  leaveGame() {
    if (this.game) { this.game.dispose(); this.game = null; }
    this.hidePause();
    $('gameover').classList.add('hidden');
    this.leaveLobby();
  }

  onGraphicsChanged() { if (this.game && this.game.lighting) { this.game.lighting.applySettings(); this.game.reapplyShadows(); this.game.effects.quality = settings.graphics.effects === 'low' ? 0 : settings.graphics.effects === 'medium' ? 1 : 2; } }
  onFovChanged() { if (this.game && this.game.player) this.game.player.fovBase = settings.graphics.fov * Math.PI / 180; }

  // ---------------- overlays ----------------
  _bindOverlays() {
    $('btn-resume').onclick = () => { this.hidePause(); this.input.requestLock(); };
    $('btn-pause-settings').onclick = () => { this.menu.refreshSettings(); $('pause-settings').classList.toggle('hidden'); this.menu.setTab('graphics'); };
    $('btn-pause-leave').onclick = () => this.leaveGame();
    $('btn-go-lobby').onclick = () => { $('gameover').classList.add('hidden'); };
    $('btn-go-leave').onclick = () => this.leaveGame();
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.game && this.game.paused) { /* browser exits lock on Esc already */ } });
  }
  showPause() {
    $('pause').classList.remove('hidden');
    // settings panel lives inside the menu DOM; move it into the pause overlay
    const sp = $('pause-settings');
    if (!sp.contains($('settings-body'))) sp.appendChild($('settings-body'));
    sp.classList.add('hidden');
  }
  hidePause() {
    $('pause').classList.add('hidden');
    const home = $('settings-home');
    if (home && !home.contains($('settings-body'))) home.appendChild($('settings-body'));
  }
  showGameOver(m) {
    const el = $('gameover');
    el.classList.remove('hidden');
    $('go-round').textContent = `You survived until round ${m.round}`;
    const rows = m.stats.map(s => `<tr><td>${esc(s.name)}</td><td>${s.kills}</td><td>${s.headshots}</td><td>${s.revives}</td><td>${s.points}</td><td>${s.accuracy}%</td><td>${s.downs}</td></tr>`).join('');
    $('go-stats').innerHTML = `<tr><th>Player</th><th>Kills</th><th>Headshots</th><th>Revives</th><th>Points</th><th>Accuracy</th><th>Downs</th></tr>${rows}`;
    $('go-time').textContent = `Time survived: ${Math.floor(m.duration / 60)}m ${m.duration % 60}s`;
    audio.play('down', { vol: 0.8, pitch: 0.7 });
  }
  showLoading(k, text) {
    $('loading').classList.remove('hidden');
    $('loadbar').firstElementChild.style.width = Math.round(k * 100) + '%';
    $('load-text').textContent = text || '';
  }
  hideLoading() { $('loading').classList.add('hidden'); }
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

window.app = new App();
installDevHelpers(window.app);
