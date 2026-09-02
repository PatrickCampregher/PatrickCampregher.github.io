// Zombie Survival - local game server entry point.
// Serves the client, runs the authoritative simulation, LAN discovery and the WebSocket relay.
import { exec } from 'node:child_process';
import os from 'node:os';
import { createHttpServer, listenWithFallback } from './http.js';
import { attachWebSocketServer } from './ws.js';
import { Discovery, lanAddresses } from './discovery.js';
import { LobbyManager } from './lobby.js';
import { DEFAULT_HTTP_PORT, DISCOVERY_PORT, GAME_VERSION } from '../shared/constants.js';

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const port0 = parseInt(argVal('--port') || process.env.PORT || DEFAULT_HTTP_PORT, 10);
const noBrowser = args.includes('--no-browser');
const hostName = argVal('--name') || os.hostname();
const dev = args.includes('--dev');

async function main() {
  const discovery = new Discovery(parseInt(argVal('--discovery-port') || DISCOVERY_PORT, 10));
  await discovery.start();

  const lobby = new LobbyManager({ discovery, port: port0, hostName, dev });
  if (dev) console.log('  [dev mode] cheat messages enabled');
  const http = createHttpServer({ onApi: (path) => (path === 'info' ? lobby.info() : null) });
  attachWebSocketServer(http, '/ws', (conn) => lobby.handleConnection(conn));
  const port = await listenWithFallback(http, port0, 15);
  lobby.port = port;

  const lan = lanAddresses();
  console.log('');
  console.log('  ZOMBIE SURVIVAL v' + GAME_VERSION + '  -  local server running');
  console.log('  ------------------------------------------------------------');
  console.log(`  Play here:          http://localhost:${port}`);
  for (const a of lan) console.log(`  LAN address:        http://${a.address}:${port}   (${a.name})`);
  console.log(`  LAN discovery:      UDP ${discovery.port} (broadcast)`);
  console.log('  Friends on the same network: start their own copy and use FIND LAN GAMES,');
  console.log('  or open one of the LAN addresses above directly in their browser.');
  console.log('  Keep this window open. Press Ctrl+C to stop.');
  console.log('');

  if (!noBrowser) openBrowser(`http://localhost:${port}`);

  const shutdown = () => { console.log('\n  Shutting down...'); discovery.stop(); http.close(); setTimeout(() => process.exit(0), 200); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function openBrowser(url) {
  const plat = process.platform;
  let cmd;
  if (plat === 'win32') cmd = `start "" "${url}"`;
  else if (plat === 'darwin') cmd = `open "${url}"`;
  else cmd = `xdg-open "${url}"`;
  exec(cmd, (err) => { if (err) console.log(`  (Could not open a browser automatically - open ${url} yourself)`); });
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
