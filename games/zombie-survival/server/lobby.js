// Lobby management + per-connection message routing (menu, LAN list, hosting, joining, game relay).
import { GAME_VERSION, PROTOCOL_VERSION, MAX_PLAYERS_DEFAULT, MAX_PLAYERS_HARD } from '../shared/constants.js';
import { BIN, encodePing, decodePing } from '../shared/protocol.js';
import { GameServer } from './game/gameServer.js';
import { lanAddresses } from './discovery.js';
import os from 'node:os';

export class LobbyManager {
  constructor({ discovery, port, hostName, dev = false }) {
    this.discovery = discovery;
    this.port = port;
    this.dev = dev;
    this.hostName = hostName || os.hostname();
    this.lobby = null;
    this.game = null;
    this.conns = new Set();
    this.id = Math.random().toString(36).slice(2, 10);
    this._lanTimer = setInterval(() => this._pushLanLists(), 1000);
    this._pingTimer = setInterval(() => this._pingAll(), 1500);
  }

  // ---------------- connections ----------------
  handleConnection(conn) {
    this.conns.add(conn);
    conn.player = null;
    conn.wantsLan = false;
    conn.pingMs = 0;
    conn.on('message', (data, isBinary) => {
      try {
        if (isBinary) this._onBinary(conn, data);
        else { const msg = JSON.parse(data); if (msg && typeof msg.t === 'string') this._onMessage(conn, msg); }
      } catch (e) { console.warn('[lobby] bad message', e.message); }
    });
    conn.on('close', () => { this.conns.delete(conn); this._leave(conn); });
  }

  _send(conn, msg) { if (conn.alive) conn.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }

  _onBinary(conn, buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const type = dv.getUint8(0);
    if (type === BIN.PONG) {
      const pg = decodePing(dv);
      conn.pingMs = Math.max(0, Math.round(Date.now() - pg.serverTime));
      if (conn.player) conn.player.ping = conn.pingMs;
      return;
    }
    if (type === BIN.PING && !(this.game && conn.player && conn.player.inGame)) {
      const pg = decodePing(dv);
      conn.send(encodePing(BIN.PONG, pg.clientTime, 0));
      return;
    }
    if (this.game && conn.player && conn.player.inGame) this.game.handleBinary(conn.player, buf);
  }

  _pingAll() {
    for (const conn of this.conns) if (conn.alive) conn.send(encodePing(BIN.PING, 0, Date.now()));
    if (this.lobby) this._broadcastLobby();
  }

  _onMessage(conn, msg) {
    switch (msg.t) {
      case 'hello':
        conn.clientName = sanitizeName(msg.name);
        this._send(conn, {
          t: 'hello', ok: true, version: GAME_VERSION, protocol: PROTOCOL_VERSION, serverId: this.id, port: this.port,
          hosting: !!this.lobby, hostName: this.hostName, lan: lanAddresses().map(a => a.address),
          lobby: this.lobby ? this._serializeLobby() : null,
        });
        break;
      case 'lanList':
        conn.wantsLan = !!msg.on;
        if (conn.wantsLan) { this.discovery.requestDiscover(); this._send(conn, { t: 'lanList', lobbies: this.discovery.getLobbies() }); }
        break;
      case 'create': this._create(conn, msg); break;
      case 'join': this._join(conn, msg); break;
      case 'ready': if (conn.player) { conn.player.ready = !!msg.ready; this._broadcastLobby(); } break;
      case 'start': this._start(conn); break;
      case 'leave': this._leave(conn); break;
      case 'chat': if (conn.player && this.lobby) this._broadcast({ t: 'chat', from: conn.player.name, text: String(msg.text || '').slice(0, 200) }); break;
      case 'setMax':
        if (conn.player && this.lobby && this.lobby.hostId === conn.player.id) {
          this.lobby.maxPlayers = Math.max(1, Math.min(MAX_PLAYERS_HARD, msg.max | 0));
          this._broadcastLobby(); this._updateBeacon();
        }
        break;
      default:
        if (this.game && conn.player && conn.player.inGame) this.game.handleMessage(conn.player, msg);
        break;
    }
  }

  // ---------------- lobby ops ----------------
  _create(conn, msg) {
    if (this.lobby && this.lobby.players.size > 0) { this._send(conn, { t: 'error', code: 'busy', text: 'This computer is already hosting a game.' }); return; }
    if (conn.player) this._leave(conn);
    this.lobby = {
      id: this.id + '-' + Date.now().toString(36), name: sanitizeName(msg.name, 'LAN Game', 32), public: msg.public !== false,
      maxPlayers: Math.max(1, Math.min(MAX_PLAYERS_HARD, (msg.maxPlayers | 0) || MAX_PLAYERS_DEFAULT)),
      hostId: 0, status: 'waiting', players: new Map(), createdAt: Date.now(),
    };
    const lp = this._addPlayer(conn, sanitizeName(msg.playerName || conn.clientName));
    this.lobby.hostId = lp.id;
    this._send(conn, { t: 'joined', id: lp.id, host: true });
    this._broadcastLobby();
    this._updateBeacon();
    console.log(`[lobby] "${this.lobby.name}" created by ${lp.name}`);
  }

  _join(conn, msg) {
    if (!this.lobby) { this._send(conn, { t: 'error', code: 'nolobby', text: 'No game is being hosted here.' }); return; }
    if (conn.player) { this._send(conn, { t: 'joined', id: conn.player.id, host: this.lobby.hostId === conn.player.id }); return; }
    if (this.lobby.players.size >= this.lobby.maxPlayers) { this._send(conn, { t: 'error', code: 'full', text: 'That lobby is full.' }); return; }
    if (this.game && this.game.gameOver) { this._send(conn, { t: 'error', code: 'ending', text: 'That game is ending, try again in a moment.' }); return; }
    const lp = this._addPlayer(conn, sanitizeName(msg.playerName || conn.clientName));
    this._send(conn, { t: 'joined', id: lp.id, host: false });
    this._broadcastLobby();
    this._updateBeacon();
    console.log(`[lobby] ${lp.name} joined (${this.lobby.players.size}/${this.lobby.maxPlayers})`);
    if (this.game && this.lobby.status === 'ingame') {
      this._send(conn, { t: 'gameStart', late: true });
      this.game.addPlayer(lp);
    }
  }

  _addPlayer(conn, name) {
    let id = 1;
    while (this.lobby.players.has(id)) id++;
    const lp = { id, name, ready: false, conn, ping: conn.pingMs || 0, inGame: false, joinedAt: Date.now() };
    this.lobby.players.set(id, lp);
    conn.player = lp;
    return lp;
  }

  _leave(conn) {
    const lp = conn.player;
    if (!lp || !this.lobby) return;
    conn.player = null;
    this.lobby.players.delete(lp.id);
    if (this.game) this.game.removePlayer(lp.id);
    console.log(`[lobby] ${lp.name} left`);
    if (this.lobby.players.size === 0) {
      if (this.game) { this.game.stop(); this.game = null; }
      this.lobby = null;
      this._updateBeacon();
      console.log('[lobby] closed (empty)');
      return;
    }
    if (this.lobby.hostId === lp.id) {
      // host migration (lobby level): the earliest joined player becomes host
      const next = [...this.lobby.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      this.lobby.hostId = next.id;
      this._broadcast({ t: 'hostChanged', id: next.id, name: next.name });
    }
    this._broadcastLobby();
    this._updateBeacon();
  }

  _start(conn) {
    if (!this.lobby || !conn.player || this.lobby.hostId !== conn.player.id) return;
    if (this.lobby.status === 'ingame') return;
    this.lobby.status = 'ingame';
    for (const lp of this.lobby.players.values()) lp.inGame = false;
    this.game = new GameServer(this);
    this._broadcast({ t: 'gameStart', late: false });
    this.game.start();
    this._broadcastLobby();
    this._updateBeacon();
    console.log(`[lobby] game started with ${this.lobby.players.size} player(s)`);
  }

  onGameEnded() {
    if (!this.lobby) return;
    this.game = null;
    this.lobby.status = 'waiting';
    for (const lp of this.lobby.players.values()) { lp.inGame = false; lp.ready = false; }
    this._broadcast({ t: 'gameEnded' });
    this._broadcastLobby();
    this._updateBeacon();
  }

  // ---------------- serialization ----------------
  _serializeLobby() {
    const l = this.lobby;
    return {
      id: l.id, name: l.name, hostId: l.hostId, maxPlayers: l.maxPlayers, status: l.status, public: l.public,
      round: this.game ? this.game.round : 0,
      players: [...l.players.values()].map(p => ({ id: p.id, name: p.name, ready: p.ready, ping: p.ping | 0, host: p.id === l.hostId })),
    };
  }

  _broadcastLobby() { if (this.lobby) this._broadcast({ t: 'lobby', lobby: this._serializeLobby() }); }

  _broadcast(msg) {
    if (!this.lobby) return;
    const s = JSON.stringify(msg);
    for (const lp of this.lobby.players.values()) if (lp.conn.alive) lp.conn.send(s);
  }

  _updateBeacon() {
    if (this.lobby && this.lobby.public) {
      this.discovery.setBeacon({
        id: this.lobby.id, name: this.lobby.name, players: this.lobby.players.size, max: this.lobby.maxPlayers,
        round: this.game ? this.game.round : 0, status: this.lobby.status, port: this.port, host: this.hostName,
      });
    } else this.discovery.setBeacon(null);
  }

  _pushLanLists() {
    let list = null;
    for (const conn of this.conns) {
      if (!conn.wantsLan || !conn.alive) continue;
      if (!list) list = JSON.stringify({ t: 'lanList', lobbies: this.discovery.getLobbies() });
      conn.send(list);
    }
    if (this.lobby && this.game) this._updateBeacon();
  }

  info() {
    return {
      version: GAME_VERSION, port: this.port, hostName: this.hostName, lan: lanAddresses(),
      lobby: this.lobby ? this._serializeLobby() : null, lobbies: this.discovery.getLobbies(),
    };
  }
}

function sanitizeName(n, fallback = 'Player', max = 20) {
  let s = String(n == null ? '' : n).replace(/[^\w \-'.!?]/g, '').trim().slice(0, max);
  return s || fallback;
}
