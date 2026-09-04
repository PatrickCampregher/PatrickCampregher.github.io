// WebSocket client wrapper: JSON events + binary snapshots, RTT and server clock estimation.
import { BIN, decodeSnapshot, decodePing, encodePing } from '/shared/protocol.js';

export class Connection {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.handlers = new Map();
    this.open = false;
    this.rtt = 0;
    this._rttSamples = [];
    this.serverOffset = 0;   // serverTime(ms) - performance.now()
    this._offsetSamples = []; // [{rtt, offset}] from pongs; the lowest-rtt sample is the most trustworthy (Cristian)
    this._pingTimer = null;
    this.onSnapshot = null;
    this.onClose = null;
    this.snapshotsReceived = 0;
    this.lastServerTime = 0;
    // snapshot arrival statistics (drive the client's adaptive interpolation delay + the connection warning)
    this.lastSnapAt = 0;      // performance.now() of the newest snapshot
    this.snapInterval = 33;   // ms between snapshots as sent by the server (EMA)
    this.jitter = 0;          // ms: decaying peak of |arrival delta - server delta|
    this.gapMax = 0;          // ms: decaying peak of the longest arrival gap
    this._prevSnapTime = 0;
  }

  connect(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      let done = false;
      let ws;
      try { ws = new WebSocket(this.url); } catch (e) { reject(e); return; }
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      const timer = setTimeout(() => { if (!done) { done = true; try { ws.close(); } catch (e) { /* ignore */ } reject(new Error('Connection timed out')); } }, timeoutMs);
      ws.onopen = () => {
        if (done) return;
        done = true; clearTimeout(timer);
        this.open = true;
        this._pingTimer = setInterval(() => this.ping(), 1000);
        // a quick burst of pings settles the clock estimate before the first snapshots matter
        for (let i = 0; i < 5; i++) setTimeout(() => this.ping(), 60 * i);
        resolve(this);
      };
      ws.onerror = () => { if (!done) { done = true; clearTimeout(timer); reject(new Error('Could not connect to ' + this.url)); } };
      ws.onclose = () => {
        this.open = false;
        clearInterval(this._pingTimer);
        if (this.onClose) this.onClose();
        if (!done) { done = true; clearTimeout(timer); reject(new Error('Connection closed')); }
      };
      ws.onmessage = (ev) => this._onMessage(ev);
    });
  }

  /** While queuing, text events are held (binary snapshots still flow) and replayed by flushQueue(). */
  startQueue() { this.queuing = true; this._queue = []; }
  flushQueue() {
    this.queuing = false;
    const q = this._queue || []; this._queue = [];
    for (const msg of q) this._dispatch(msg);
  }
  _dispatch(msg) {
    const hs = this.handlers.get(msg.t);
    if (hs) for (const h of [...hs]) h(msg);
    const all = this.handlers.get('*');
    if (all) for (const h of [...all]) h(msg);
  }

  _onMessage(ev) {
    if (typeof ev.data === 'string') {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (this.queuing && msg.t !== 'error' && msg.t !== 'lobby' && msg.t !== 'gameEnded') { this._queue.push(msg); return; }
      this._dispatch(msg);
      return;
    }
    const dv = new DataView(ev.data);
    const type = dv.getUint8(0);
    if (type === BIN.SNAPSHOT) {
      const snap = decodeSnapshot(dv, 1);
      const now = performance.now();
      this.snapshotsReceived++;
      if (this._prevSnapTime > 0 && snap.time > this._prevSnapTime) {
        const serverDelta = snap.time - this._prevSnapTime;
        const arrivalDelta = now - this.lastSnapAt;
        // decaying peaks: a spike fades to half in ~1 s; a full stall (> 400 ms) is handled by the playback
        // clock's resync and must not inflate the routine delay for long, so its contribution is capped
        const decay = Math.min(1, arrivalDelta / 1000);
        this.jitter = Math.max(Math.min(400, Math.abs(arrivalDelta - serverDelta)), this.jitter - Math.max(30, this.jitter * 0.5) * decay);
        this.gapMax = Math.max(arrivalDelta, this.gapMax - Math.max(60, this.gapMax * 0.5) * decay);
        if (serverDelta < 500) this.snapInterval += (serverDelta - this.snapInterval) * 0.1;
      }
      this._prevSnapTime = snap.time;
      this.lastServerTime = snap.time;
      this.lastSnapAt = now;
      // one-way clock estimate: only used until the first pong arrives (arrival jitter would otherwise steer the clock)
      if (this._offsetSamples.length === 0) this.serverOffset = snap.time - (now - this.rtt / 2);
      if (this.onSnapshot) this.onSnapshot(snap, now);
    } else if (type === BIN.PONG) {
      const pg = decodePing(dv);
      const now = performance.now();
      const rtt = Math.max(0, now - pg.clientTime);
      this._rttSamples.push(rtt);
      if (this._rttSamples.length > 8) this._rttSamples.shift();
      const sorted = [...this._rttSamples].sort((a, b) => a - b);
      this.rtt = sorted[Math.floor(sorted.length / 2)];
      if (pg.serverTime > 0) this._pushOffset(pg.serverTime - (now - rtt / 2), rtt);
    } else if (type === BIN.PING) {
      // server-initiated RTT measurement: echo back
      const pg = decodePing(dv);
      this.sendBinary(encodePing(BIN.PONG, performance.now(), pg.serverTime));
    }
  }

  _pushOffset(offset, rtt) {
    this._offsetSamples.push({ offset, rtt });
    if (this._offsetSamples.length > 12) this._offsetSamples.shift();
    // the sample with the smallest round trip suffered the least queueing: take its offset, ease towards it
    let best = this._offsetSamples[0];
    for (const s of this._offsetSamples) if (s.rtt < best.rtt) best = s;
    if (this._offsetSamples.length <= 2) this.serverOffset = best.offset;
    else this.serverOffset += (best.offset - this.serverOffset) * 0.3;
  }

  /** Forget arrival statistics gathered while the page was busy (loading blocks the main thread and delivers snapshots in bursts). */
  resetNetStats() { this.jitter = 0; this.gapMax = 0; this._prevSnapTime = 0; this.lastSnapAt = 0; }

  /** ms since the newest snapshot arrived (0 before the first one). */
  snapshotAge() { return this.lastSnapAt ? performance.now() - this.lastSnapAt : 0; }

  /** Estimated current server time in ms. */
  serverTime() { return performance.now() + this.serverOffset; }

  ping() { if (this.open) this.sendBinary(encodePing(BIN.PING, performance.now(), 0)); }

  on(type, fn) {
    let hs = this.handlers.get(type);
    if (!hs) { hs = []; this.handlers.set(type, hs); }
    hs.push(fn);
    return () => { const i = hs.indexOf(fn); if (i >= 0) hs.splice(i, 1); };
  }
  off(type, fn) { const hs = this.handlers.get(type); if (hs) { const i = hs.indexOf(fn); if (i >= 0) hs.splice(i, 1); } }
  clearHandlers() { this.handlers.clear(); this.onSnapshot = null; }

  send(obj) { if (this.open && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  sendBinary(u8) { if (this.open && this.ws.readyState === 1) this.ws.send(u8); }

  /** Send a request and wait for a response of type `respType` (or 'error'). */
  request(obj, respType, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const offOk = this.on(respType, (m) => { if (done) return; done = true; cleanup(); resolve(m); });
      const offErr = this.on('error', (m) => { if (done) return; done = true; cleanup(); reject(new Error(m.text || m.code || 'error')); });
      const timer = setTimeout(() => { if (done) return; done = true; cleanup(); reject(new Error('Timed out')); }, timeoutMs);
      const cleanup = () => { offOk(); offErr(); clearTimeout(timer); };
      this.send(obj);
    });
  }

  close() {
    clearInterval(this._pingTimer);
    this.onClose = null;
    try { this.ws && this.ws.close(); } catch (e) { /* ignore */ }
    this.open = false;
  }
}

export function wsUrlFor(host, port) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${host}:${port}/ws`;
}

export function localWsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}
