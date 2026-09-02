// Keyboard/mouse input with pointer lock and remappable actions.

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.keys = new Set();       // codes currently down
    this.pressedNow = new Set(); // codes pressed this frame
    this.releasedNow = new Set();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.locked = false;
    this.enabled = false;
    this.captureCb = null;
    this.onLockChange = null;
    this.onPausePressed = null;
    this._bind();
  }

  _bind() {
    const c = this.canvas;
    window.addEventListener('keydown', (e) => {
      if (this.captureCb) { e.preventDefault(); const cb = this.captureCb; this.captureCb = null; cb(e.code); return; }
      if (!this.enabled) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'F1') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code); this.pressedNow.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code); this.releasedNow.add(e.code);
    });
    window.addEventListener('blur', () => { this.keys.clear(); });
    c.addEventListener('mousedown', (e) => {
      if (this.captureCb) { e.preventDefault(); const cb = this.captureCb; this.captureCb = null; cb('Mouse' + e.button); return; }
      if (!this.enabled) return;
      if (!this.locked) { this.requestLock(); return; }
      e.preventDefault();
      const code = 'Mouse' + e.button;
      this.keys.add(code); this.pressedNow.add(code);
    });
    window.addEventListener('mouseup', (e) => {
      const code = 'Mouse' + e.button;
      this.keys.delete(code); this.releasedNow.add(code);
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    c.addEventListener('wheel', (e) => { if (this.locked) { e.preventDefault(); this.wheel += Math.sign(e.deltaY); } }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      if (this.forceLocked) return;
      this.locked = document.pointerLockElement === c;
      if (!this.locked) { this.keys.clear(); this.mouseDX = 0; this.mouseDY = 0; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { if (!this.forceLocked) this.locked = false; });
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const p2 = this.canvas.requestPointerLock(); if (p2 && p2.catch) p2.catch(() => { }); } catch (e) { /* ignore */ } });
    } catch (e) {
      try { this.canvas.requestPointerLock(); } catch (e2) { /* ignore */ }
    }
  }
  exitLock() { if (document.pointerLockElement === this.canvas) document.exitPointerLock(); }

  bind(action) { return this.settings.controls.binds[action]; }
  down(action) {
    const b = this.bind(action);
    if (this.keys.has(b)) return true;
    if (action === 'crouch' && this.keys.has(this.bind('crouch2'))) return true;
    return false;
  }
  pressed(action) {
    const b = this.bind(action);
    if (this.pressedNow.has(b)) return true;
    if (action === 'crouch' && this.pressedNow.has(this.bind('crouch2'))) return true;
    return false;
  }
  released(action) { return this.releasedNow.has(this.bind(action)); }

  /** Consume per-frame deltas. Call once per frame after reading. */
  endFrame() {
    this.pressedNow.clear(); this.releasedNow.clear();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
  }

  captureNext(cb) { this.captureCb = cb; }
  cancelCapture() { this.captureCb = null; }
}
