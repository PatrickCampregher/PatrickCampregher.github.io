// Dependency-free WebSocket server (RFC 6455) attached to a Node http server.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export class WSConnection extends EventEmitter {
  constructor(socket, req) {
    super();
    this.socket = socket;
    this.remoteAddress = socket.remoteAddress;
    this.req = req;
    this.alive = true;
    this._buf = Buffer.alloc(0);
    this._frags = [];
    this._fragOp = 0;
    this.id = crypto.randomBytes(4).toString('hex');
    socket.setNoDelay(true);
    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => this._onClose());
    socket.on('error', () => this._onClose());
    socket.on('end', () => this._onClose());
  }

  _onClose() {
    if (!this.alive) return;
    this.alive = false;
    try { this.socket.destroy(); } catch (e) { /* ignore */ }
    this.emit('close');
  }

  _onData(chunk) {
    if (!this.alive) return;
    this._buf = this._buf.length ? Buffer.concat([this._buf, chunk]) : chunk;
    while (this.alive) {
      const buf = this._buf;
      if (buf.length < 2) return;
      const b0 = buf[0], b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const op = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (buf.length < 10) return;
        const hi = buf.readUInt32BE(2), lo = buf.readUInt32BE(6);
        if (hi !== 0) { this.close(1009, 'too large'); return; }
        len = lo; off = 10;
      }
      if (len > 8 * 1024 * 1024) { this.close(1009, 'too large'); return; }
      let mask = null;
      if (masked) { if (buf.length < off + 4) return; mask = buf.subarray(off, off + 4); off += 4; }
      if (buf.length < off + len) return;
      let payload = buf.subarray(off, off + len);
      if (mask) {
        const out = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3];
        payload = out;
      } else {
        payload = Buffer.from(payload); // copy out of the shared buffer
      }
      this._buf = buf.subarray(off + len);
      this._handleFrame(fin, op, payload);
    }
  }

  _handleFrame(fin, op, payload) {
    switch (op) {
      case 0x0: // continuation
        this._frags.push(payload);
        if (fin) { const data = Buffer.concat(this._frags); const o = this._fragOp; this._frags = []; this._fragOp = 0; this._deliver(o, data); }
        break;
      case 0x1: case 0x2:
        if (fin) this._deliver(op, payload);
        else { this._frags = [payload]; this._fragOp = op; }
        break;
      case 0x8: {
        let code = 1000;
        if (payload.length >= 2) code = payload.readUInt16BE(0);
        this._sendFrame(0x8, payload.length >= 2 ? payload.subarray(0, 2) : Buffer.alloc(0));
        this._onClose();
        break;
      }
      case 0x9: this._sendFrame(0xA, payload); break;
      case 0xA: this.emit('pong'); break;
      default: this.close(1002, 'bad opcode');
    }
  }

  _deliver(op, data) {
    if (op === 0x1) this.emit('message', data.toString('utf8'), false);
    else this.emit('message', data, true);
  }

  _sendFrame(op, payload) {
    if (!this.alive) return false;
    const len = payload.length;
    let header;
    if (len < 126) { header = Buffer.allocUnsafe(2); header[1] = len; }
    else if (len < 65536) { header = Buffer.allocUnsafe(4); header[1] = 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.allocUnsafe(10); header[1] = 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6); }
    header[0] = 0x80 | op;
    try {
      this.socket.cork();
      this.socket.write(header);
      this.socket.write(payload);
      this.socket.uncork();
      return true;
    } catch (e) { this._onClose(); return false; }
  }

  /** Send a string (text frame) or Buffer/Uint8Array (binary frame). */
  send(data) {
    if (typeof data === 'string') return this._sendFrame(0x1, Buffer.from(data, 'utf8'));
    if (data instanceof Uint8Array) return this._sendFrame(0x2, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    return this._sendFrame(0x2, Buffer.from(data));
  }

  /** Bytes accepted by send() but not yet handed to the kernel (a slow or stalled link piles up here). */
  get bufferedAmount() { return this.alive ? this.socket.writableLength : 0; }

  ping() { return this._sendFrame(0x9, Buffer.alloc(0)); }

  close(code = 1000, reason = '') {
    if (!this.alive) return;
    const r = Buffer.from(reason, 'utf8');
    const p = Buffer.allocUnsafe(2 + r.length);
    p.writeUInt16BE(code, 0); r.copy(p, 2);
    this._sendFrame(0x8, p);
    setTimeout(() => this._onClose(), 200);
  }
}

export function attachWebSocketServer(httpServer, pathName, onConnection) {
  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (pathName && url.pathname !== pathName) { socket.destroy(); return; }
    const key = req.headers['sec-websocket-key'];
    if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    const conn = new WSConnection(socket, req);
    if (head && head.length) conn._onData(head);
    onConnection(conn, req);
  });
}
