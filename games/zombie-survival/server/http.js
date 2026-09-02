// Minimal static file server (no dependencies).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const SHARED_DIR = path.join(ROOT, 'shared');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};

export function createHttpServer({ onApi }) {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let p = decodeURIComponent(url.pathname);
      if (p === '/api/shot' && req.method === 'POST') {
        // dev helper: save a canvas screenshot (base64 PNG data URL) to tools/shots/<name>.png
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 30e6) req.destroy(); });
        req.on('end', () => {
          try {
            const name = String(url.searchParams.get('name') || 'shot').replace(/[^\w-]/g, '');
            const m = body.match(/^data:image\/(png|jpeg);base64,/);
            const ext = m && m[1] === 'jpeg' ? 'jpg' : 'png';
            const b64 = m ? body.slice(m[0].length) : body;
            const dir = url.searchParams.get('dir') === 'root' ? ROOT : path.join(ROOT, 'tools', 'shots');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, name + '.' + ext), Buffer.from(b64, 'base64'));
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
          } catch (e) { res.writeHead(500); res.end('error'); }
        });
        return;
      }
      if (p.startsWith('/api/')) {
        const result = onApi ? onApi(p.slice(5), url, req) : null;
        if (result == null) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(result));
        return;
      }
      let file;
      if (p.startsWith('/shared/')) file = path.join(SHARED_DIR, p.slice(8));
      else {
        if (p === '/' || p === '') p = '/index.html';
        file = path.join(CLIENT_DIR, p);
      }
      const base = p.startsWith('/shared/') ? SHARED_DIR : CLIENT_DIR;
      if (!path.resolve(file).startsWith(base)) { res.writeHead(403); res.end('forbidden'); return; }
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
        const ext = path.extname(file).toLowerCase();
        const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size };
        headers['Cache-Control'] = p.startsWith('/vendor/') ? 'public, max-age=604800' : 'no-cache';
        res.writeHead(200, headers);
        fs.createReadStream(file).pipe(res);
      });
    } catch (e) {
      res.writeHead(500); res.end('error');
    }
  });
  return server;
}

/** Try to listen on port, then port+1 ... up to `tries`. Resolves with the port used. */
export function listenWithFallback(server, startPort, tries = 12, host = '0.0.0.0') {
  return new Promise((resolve, reject) => {
    let port = startPort, attempts = 0;
    const tryListen = () => {
      const onError = (err) => {
        server.removeListener('listening', onListening);
        if ((err.code === 'EADDRINUSE' || err.code === 'EACCES') && ++attempts < tries) { port++; tryListen(); }
        else reject(err);
      };
      const onListening = () => { server.removeListener('error', onError); resolve(port); };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    };
    tryListen();
  });
}
