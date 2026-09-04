// Developer/testing helpers exposed as window.dev (harmless in normal play; cheats need a --dev server).
export function installDevHelpers(app) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const dev = {
    app,
    get g() { return app.game; },
    drive(on = true, ms = 16) {
      if (this._drive) { clearInterval(this._drive); this._drive = null; }
      if (on) this._drive = setInterval(() => { const g = app.game; if (g && g.running) { try { g._frame(); } catch (e) { dev.err = String(e.stack || e); } } }, ms);
    },
    lock(on = true) { app.input.forceLocked = on; app.input.locked = on; app.input.enabled = true; },
    key(code, ms = 200) { app.input.keys.add(code); app.input.pressedNow.add(code); return sleep(ms).then(() => { app.input.keys.delete(code); app.input.releasedNow.add(code); }); },
    hold(code, on) { if (on) { app.input.keys.add(code); app.input.pressedNow.add(code); } else { app.input.keys.delete(code); app.input.releasedNow.add(code); } },
    mouse(dx, dy) { app.input.mouseDX += dx; app.input.mouseDY += dy; },
    aimAt(x, y, z) { const p = app.game.player; const ex = p.x, ey = p.y + p.eyeHeight, ez = p.z; const dx = x - ex, dy = y - ey, dz = z - ez; p.yaw = Math.atan2(dx, dz); p.pitch = -Math.atan2(dy, Math.hypot(dx, dz)); },
    nearestZombie() { const g = app.game; let best = null, bd = 1e9; for (const e of g.entities.zombies.values()) { if (e.dead) continue; const d = Math.hypot(e.x - g.player.x, e.z - g.player.z); if (d < bd) { bd = d; best = e; } } return best; },
    aimZombie(part = 1) { const e = this.nearestZombie(); if (!e) return null; const ents = app.game.entities; if (part === 1 && ents.headCenter) { const h = ents.headCenter(e); this.aimAt(h.x, h.y, h.z); } else this.aimAt(e.x, e.y + (part === 1 ? 1.83 : 1.15), e.z); return e; },
    async fire(ms = 120) { this.hold('Mouse0', true); await sleep(ms); this.hold('Mouse0', false); },
    tele(x, z, y = 0) { const p = app.game.player; p.x = x; p.z = z; p.y = y; p.vx = p.vz = p.vy = 0; this.cheat({ tp: [x, z, y] }); },
    cheat(o) { app.gameConn.send({ t: 'cheat', ...o }); },
    /** Emulate a link stall: nothing in or out for `ms`, then the whole backlog arrives at once (what TCP does after a Wi-Fi hiccup). */
    async netStall(ms = 2500) {
      const c = app.gameConn, ws = c.ws, orig = ws.onmessage, q = [];
      const send = c.send, sendBinary = c.sendBinary;
      ws.onmessage = (ev) => q.push(ev); c.send = () => {}; c.sendBinary = () => {};
      await sleep(ms);
      c.send = send; c.sendBinary = sendBinary; ws.onmessage = orig;
      for (const ev of q) orig.call(ws, ev);
      return q.length;
    },
    async shot(name = 'shot', w = 1280, h = 720) {
      const g = app.game; if (!g) return 'no game';
      if (g.engine.getRenderWidth() !== w) g.engine.setSize(w, h);
      g._frame(); g._frame();
      const url = g.canvas.toDataURL('image/png');
      const r = await fetch('/api/shot?name=' + encodeURIComponent(name), { method: 'POST', body: url });
      return r.ok;
    },
    stats() {
      const g = app.game; if (!g) return null;
      return { fps: g.fpsShown, zombies: g.entities.zombies.size, round: g.round, rstate: g.roundState, pos: [+g.player.x.toFixed(2), +g.player.y.toFixed(2), +g.player.z.toFixed(2)], hp: g.player.hp, points: g.player.points, ammo: g.player.held && [g.player.held.mag, g.player.held.reserve], weapon: g.player.def && g.player.def.name, active: g.scene.getActiveMeshes().length, rtt: g.conn.rtt, err: dev.err };
    },
  };
  window.dev = dev;
  return dev;
}
