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
    this.onLockFail = null;   // (reason) => void; pointer lock was refused (stale user gesture, Esc cooldown, ...)
    this.onPausePressed = null;
    this.lockError = null;
    this._lockSeq = 0;
    this._lastReq = 0;
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
    window.addEventListener('blur', () => { this.keys.clear(); this.pressedNow.clear(); this.releasedNow.clear(); });
    // Recovery net: a click on anything that is not a control (the dimmed pause backdrop, a stray
    // overlay) is a fresh user gesture, so use it to re-acquire a lock the browser refused earlier.
    document.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.locked || this.forceLocked || this.captureCb) return;
      if (e.target === c) return; // handled by the canvas listener below
      if (e.target.closest && e.target.closest('button, input, select, textarea, a, label, .menu-panel')) return;
      this.requestLock();
    });
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
      if (this.locked) { this._lockSeq++; this.lockError = null; }  // cancel any pending failure callback
      else { this.keys.clear(); this.mouseDX = 0; this.mouseDY = 0; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.forceLocked) return;
      this.locked = false;
      if (this._pendingFail) this._pendingFail('pointerlockerror');
    });
  }

  /**
   * Ask for pointer lock. The browser refuses this whenever the calling stack is not a fresh user
   * gesture (Chrome expires activation after ~5s, so a request issued at the end of a slow load is
   * rejected) and for ~1.25s after Escape. A refusal fires no `pointerlockchange`, so without the
   * explicit failure path below the game would sit unlocked forever with every control dead.
   */
  requestLock() {
    if (this.forceLocked || this.locked) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - this._lastReq < 150) return; // a second request while one is pending throws InvalidStateError
    this._lastReq = now;
    const seq = ++this._lockSeq;
    const fail = (why) => {
      if (seq !== this._lockSeq || this.locked || this.forceLocked) return;
      this.lockError = typeof why === 'string' ? why : ((why && (why.name || why.message)) || 'refused');
      console.warn('[input] pointer lock refused:', this.lockError);
      if (this.onLockFail) this.onLockFail(this.lockError);
    };
    const plain = () => {
      try {
        const p = this.canvas.requestPointerLock();
        if (p && p.catch) p.catch(fail); else this._lockWatchdog(seq, fail);
      } catch (e) { fail(e); }
    };
    this._pendingFail = fail;
    try {
      // unadjustedMovement removes OS mouse acceleration; unsupported on some drivers -> retry plain.
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch((e) => { if (e && e.name === 'NotSupportedError') plain(); else fail(e); });
      else this._lockWatchdog(seq, fail);
    } catch (e) { plain(); }
  }

  /** Firefox/older Chrome return no promise: assume failure if no lock arrives shortly. */
  _lockWatchdog(seq, fail) {
    setTimeout(() => { if (seq === this._lockSeq && !this.locked) fail('timeout'); }, 700);
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
