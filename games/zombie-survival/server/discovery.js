// LAN lobby discovery over UDP broadcast (no Internet, no accounts).
// Hosts broadcast a beacon every second; every server listens and keeps a list of lobbies.
import dgram from 'node:dgram';
import os from 'node:os';
import { EventEmitter } from 'node:events';

export function lanAddresses() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name in ifs) {
    for (const a of ifs[name]) {
      if (a.family !== 'IPv4' || a.internal) continue;
      out.push({ name, address: a.address, netmask: a.netmask, broadcast: broadcastOf(a.address, a.netmask) });
    }
  }
  return out;
}

function broadcastOf(ip, mask) {
  const ipP = ip.split('.').map(Number), mP = mask.split('.').map(Number);
  return ipP.map((b, i) => (b | (~mP[i] & 255)) & 255).join('.');
}

export class Discovery extends EventEmitter {
  constructor(port) {
    super();
    this.port = port;
    this.socket = null;
    this.pingSocket = null;
    this.beacon = null;
    this.lobbies = new Map(); // key: address:port:id -> info
    this.rtts = new Map();    // address -> ms
    this._timer = null;
    this._pingTimer = null;
    this.selfId = Math.random().toString(36).slice(2, 10);
  }

  start() {
    return new Promise((resolve) => {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.socket = sock;
      sock.on('error', (e) => { console.warn('[discovery] socket error:', e.message); });
      sock.on('message', (msg, rinfo) => this._onMessage(msg, rinfo, sock));
      sock.bind(this.port, '0.0.0.0', () => {
        try { sock.setBroadcast(true); } catch (e) { /* ignore */ }
        // ephemeral socket for RTT pings (so replies come back to us even with several instances per machine)
        const ps = dgram.createSocket({ type: 'udp4' });
        this.pingSocket = ps;
        ps.on('error', () => { });
        ps.on('message', (msg, rinfo) => this._onMessage(msg, rinfo, ps));
        ps.bind(0, '0.0.0.0', () => {
          try { ps.setBroadcast(true); } catch (e) { /* ignore */ }
          this._timer = setInterval(() => this._tick(), 1000);
          this._pingTimer = setInterval(() => this._pingAll(), 2000);
          this.requestDiscover();
          resolve();
        });
      });
    });
  }

  stop() {
    clearInterval(this._timer); clearInterval(this._pingTimer);
    try { this.socket?.close(); } catch (e) { /* ignore */ }
    try { this.pingSocket?.close(); } catch (e) { /* ignore */ }
  }

  /** info = { id, name, players, max, round, status, port, host } or null to stop advertising */
  setBeacon(info) {
    this.beacon = info ? { ...info } : null;
    if (info) this._broadcastBeacon();
  }

  _tick() {
    if (this.beacon) this._broadcastBeacon();
    // expire stale lobbies
    const now = Date.now();
    for (const [k, l] of this.lobbies) if (now - l.seen > 4500) this.lobbies.delete(k);
  }

  _targets() {
    const targets = new Set(['255.255.255.255']);
    for (const a of lanAddresses()) targets.add(a.broadcast);
    targets.add('127.0.0.1');
    return [...targets];
  }

  _sendAll(obj, sock = this.socket) {
    const buf = Buffer.from(JSON.stringify(obj));
    for (const t of this._targets()) {
      try { sock.send(buf, 0, buf.length, this.port, t); } catch (e) { /* ignore */ }
    }
  }

  _broadcastBeacon() {
    this._sendAll({ t: 'beacon', ...this.beacon, sid: this.selfId });
  }

  requestDiscover() {
    this._sendAll({ t: 'discover', sid: this.selfId }, this.pingSocket || this.socket);
  }

  _pingAll() {
    if (!this.pingSocket) return;
    const addrs = new Set();
    for (const l of this.lobbies.values()) addrs.add(l.address);
    for (const a of addrs) {
      const buf = Buffer.from(JSON.stringify({ t: 'ping', ts: Date.now(), sid: this.selfId }));
      try { this.pingSocket.send(buf, 0, buf.length, this.port, a); } catch (e) { /* ignore */ }
    }
  }

  _onMessage(msg, rinfo, sock) {
    let m;
    try { m = JSON.parse(msg.toString('utf8')); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'beacon': {
        if (!m.id || !m.port) return;
        const key = `${rinfo.address}:${m.port}:${m.id}`;
        const prev = this.lobbies.get(key);
        this.lobbies.set(key, {
          key, id: m.id, name: String(m.name || 'Lobby').slice(0, 40), players: m.players | 0, max: m.max | 0,
          round: m.round | 0, status: m.status === 'ingame' ? 'ingame' : 'waiting', port: m.port | 0,
          host: String(m.host || '').slice(0, 24), address: rinfo.address, seen: Date.now(),
          self: m.sid === this.selfId, rtt: prev ? prev.rtt : null,
        });
        this.emit('lobbies');
        break;
      }
      case 'discover':
        if (this.beacon && m.sid !== this.selfId) {
          const buf = Buffer.from(JSON.stringify({ t: 'beacon', ...this.beacon, sid: this.selfId }));
          try { this.socket.send(buf, 0, buf.length, rinfo.port, rinfo.address); } catch (e) { /* ignore */ }
        }
        break;
      case 'ping': {
        const buf = Buffer.from(JSON.stringify({ t: 'pong', ts: m.ts, sid: this.selfId }));
        try { this.socket.send(buf, 0, buf.length, rinfo.port, rinfo.address); } catch (e) { /* ignore */ }
        break;
      }
      case 'pong': {
        const rtt = Math.max(0, Date.now() - Number(m.ts || 0));
        this.rtts.set(rinfo.address, rtt);
        for (const l of this.lobbies.values()) if (l.address === rinfo.address) l.rtt = rtt;
        break;
      }
      default: break;
    }
  }

  getLobbies() {
    const now = Date.now();
    const mine = lanAddresses().map(a => a.address);
    const sameSubnet = (addr) => mine.some(m => m.split('.').slice(0, 3).join('.') === addr.split('.').slice(0, 3).join('.'));
    const best = new Map(); // dedupe: the same lobby is heard once per network interface
    for (const l of this.lobbies.values()) {
      if (now - l.seen > 4500) continue;
      const prev = best.get(l.id);
      const score = (l.address === '127.0.0.1' ? 3 : 0) + (sameSubnet(l.address) ? 2 : 0) + (l.rtt != null ? 1 : 0);
      if (!prev || score > prev.score) best.set(l.id, { l, score });
    }
    const out = [];
    for (const { l } of best.values()) {
      out.push({ id: l.id, name: l.name, players: l.players, max: l.max, round: l.round, status: l.status, port: l.port, host: l.host, address: l.address, rtt: l.rtt, self: l.self });
    }
    out.sort((a, b) => (a.self ? -1 : 0) - (b.self ? -1 : 0) || a.name.localeCompare(b.name));
    return out;
  }
}
