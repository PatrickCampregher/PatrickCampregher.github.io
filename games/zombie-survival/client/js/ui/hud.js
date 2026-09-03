// In-game HUD (DOM overlay). Kept minimal and readable; updates are cheap and diffed.
import { PSTATE } from '/shared/constants.js';
import { POWERUP_INFO, POWERUP_TYPES } from '/shared/constants.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.root = $('hud');
    this.el = {
      round: $('hud-round'), roundLabel: $('hud-round-label'), points: $('hud-points'), pointsPop: $('hud-points-pop'),
      ammoMag: $('hud-ammo-mag'), ammoRes: $('hud-ammo-res'), weapon: $('hud-weapon'), weaponSlots: $('hud-slots'),
      health: $('hud-health'), healthBar: $('hud-health-bar'), team: $('hud-team'), prompt: $('hud-prompt'), promptBar: $('hud-prompt-bar'),
      cross: $('hud-crosshair'), hit: $('hud-hitmarker'), dmg: $('hud-damage'), vignette: $('hud-vignette'), powerups: $('hud-powerups'),
      notice: $('hud-notice'), banner: $('hud-banner'), bannerMain: $('hud-banner-main'), bannerSub: $('hud-banner-sub'),
      revive: $('hud-revive'), reviveBar: $('hud-revive-bar'), reviveText: $('hud-revive-text'), downed: $('hud-downed'), downedText: $('hud-downed-text'),
      fps: $('hud-fps'), zleft: $('hud-zleft'), feed: $('hud-feed'), reload: $('hud-reload'), lowammo: $('hud-lowammo'),
    };
    this._last = {};
    this._noticeT = 0; this._bannerT = 0; this._hitT = 0; this._popT = 0; this._popAmount = 0;
    this._promptText = null;
    this._feed = [];
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  _set(key, el, value) { if (this._last[key] !== value) { this._last[key] = value; el.textContent = value; } }

  setRound(n, state) {
    this._set('round', this.el.round, n > 0 ? String(n) : '-');
    const lbl = state === 3 ? 'ROUND CLEARED' : 'ROUND';
    this._set('roundLabel', this.el.roundLabel, lbl);
    this.el.round.classList.toggle('pulse', state === 1);
  }
  setZombiesLeft(n) { this._set('zleft', this.el.zleft, n > 0 ? `${n} LEFT` : ''); }
  setPoints(p) { this._set('points', this.el.points, String(p)); }
  pointsPop(amount) {
    if (amount <= 0) return;
    this._popAmount = (this._popT > 0 ? this._popAmount : 0) + amount;
    this._popT = 0.9;
    this.el.pointsPop.textContent = '+' + this._popAmount;
    this.el.pointsPop.classList.remove('anim'); void this.el.pointsPop.offsetWidth; this.el.pointsPop.classList.add('anim');
  }
  setAmmo(mag, reserve, name, reloading, lowAmmo) {
    this._set('mag', this.el.ammoMag, mag == null ? '' : String(mag));
    this._set('res', this.el.ammoRes, reserve == null ? '' : '/ ' + reserve);
    this._set('weapon', this.el.weapon, name || '');
    this.el.reload.classList.toggle('hidden', !reloading);
    this.el.ammoMag.classList.toggle('low', !!lowAmmo);
    this.el.lowammo.classList.toggle('hidden', !lowAmmo || reloading);
  }
  setSlots(weapons, slot) {
    const html = weapons.map((w, i) => `<div class="slot ${i === slot ? 'active' : ''} ${w ? '' : 'empty'}"><span class="k">${i + 1}</span><span class="n">${w ? w.name : '---'}</span></div>`).join('');
    if (this._last.slots !== html) { this._last.slots = html; this.el.weaponSlots.innerHTML = html; }
  }
  setHealth(hp, state) {
    const pct = Math.max(0, Math.min(100, hp));
    if (this._last.hp !== pct) { this._last.hp = pct; this.el.healthBar.style.width = pct + '%'; this.el.healthBar.classList.toggle('crit', pct < 35); }
    const v = state === PSTATE.ALIVE ? Math.max(0, (65 - pct) / 65) : 1;
    this.el.vignette.style.opacity = (v * 0.85).toFixed(2);
    this.el.health.classList.toggle('hidden', state !== PSTATE.ALIVE);
  }
  setTeam(list) {
    const html = list.map(p => `<div class="tm ${p.me ? 'me' : ''} ${p.state === PSTATE.DOWNED ? 'down' : ''} ${p.state === PSTATE.DEAD ? 'dead' : ''}"><span class="n">${esc(p.name)}</span><span class="p">${p.points}</span><span class="s">${p.state === PSTATE.DOWNED ? 'DOWN' : p.state === PSTATE.DEAD ? 'DEAD' : ''}</span></div>`).join('');
    if (this._last.team !== html) { this._last.team = html; this.el.team.innerHTML = html; }
  }
  prompt(text, progress = null) {
    if (text !== this._promptText) {
      this._promptText = text;
      this.el.prompt.classList.toggle('hidden', !text);
      if (text) this.el.prompt.querySelector('.txt').innerHTML = text;
    }
    if (progress != null) { this.el.promptBar.classList.remove('hidden'); this.el.promptBar.firstElementChild.style.width = (progress * 100) + '%'; }
    else this.el.promptBar.classList.add('hidden');
  }
  /** Scope overlay for scoped weapons; low magnifications (< 2.5x) use the lighter 'lite' frame. */
  scope(on, zoom = 3) {
    const lite = on && zoom < 2.5;
    if (this._scope !== on || this._scopeLite !== lite) {
      this._scope = on; this._scopeLite = lite;
      const el = document.getElementById('hud-scope');
      el.classList.toggle('hidden', !on);
      el.classList.toggle('lite', lite);
    }
  }
  crosshair(spreadPx, hidden) {
    const c = this.el.cross;
    c.classList.toggle('hidden', !!hidden);
    const s = Math.round(spreadPx);
    if (this._last.spread !== s) { this._last.spread = s; c.style.setProperty('--gap', s + 'px'); }
  }
  hitmarker(kill, headshot) {
    const h = this.el.hit;
    h.className = 'hitmarker ' + (kill ? 'kill' : headshot ? 'head' : '');
    void h.offsetWidth; h.classList.add('show');
    this._hitT = 0.15;
  }
  damageFrom(angle) {
    // angle: radians relative to view (0 = ahead, +right)
    const d = document.createElement('div');
    d.className = 'dmgdir';
    d.style.transform = `rotate(${angle}rad)`;
    this.el.dmg.appendChild(d);
    setTimeout(() => d.remove(), 900);
  }
  setPowerups(active) {
    // active: [{type, remaining}]
    const html = active.map(a => `<div class="pu pu-${a.type}"><span class="n">${POWERUP_INFO[a.type].name}</span><span class="t">${Math.ceil(a.remaining)}</span></div>`).join('');
    if (this._last.pu !== html) { this._last.pu = html; this.el.powerups.innerHTML = html; }
  }
  notice(text, ms = 1600) {
    this.el.notice.textContent = text;
    this.el.notice.classList.remove('hidden');
    this.el.notice.classList.remove('anim'); void this.el.notice.offsetWidth; this.el.notice.classList.add('anim');
    this._noticeT = ms / 1000;
  }
  banner(main, sub = '', ms = 3000, cls = '') {
    this.el.bannerMain.textContent = main;
    this.el.bannerSub.textContent = sub;
    this.el.banner.className = 'banner ' + cls;
    this.el.banner.classList.remove('hidden');
    this._bannerT = ms / 1000;
  }
  reviveProgress(pct, text) {
    if (pct == null) { this.el.revive.classList.add('hidden'); return; }
    this.el.revive.classList.remove('hidden');
    this.el.reviveBar.style.width = (pct * 100) + '%';
    this.el.reviveText.textContent = text || 'REVIVING...';
  }
  downed(on, seconds, beingRevived) {
    this.el.downed.classList.toggle('hidden', !on);
    if (on) this.el.downedText.textContent = beingRevived ? 'BEING REVIVED...' : `YOU ARE DOWN - ${Math.ceil(seconds)}s`;
  }
  feed(text, cls = '') {
    const d = document.createElement('div'); d.className = 'feed-item ' + cls; d.textContent = text;
    this.el.feed.appendChild(d);
    while (this.el.feed.children.length > 5) this.el.feed.firstChild.remove();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, 3500);
  }
  fps(v, show) { this.el.fps.classList.toggle('hidden', !show); if (show) this._set('fps', this.el.fps, v + ' FPS'); }

  update(dt) {
    if (this._noticeT > 0) { this._noticeT -= dt; if (this._noticeT <= 0) this.el.notice.classList.add('hidden'); }
    if (this._bannerT > 0) { this._bannerT -= dt; if (this._bannerT <= 0) this.el.banner.classList.add('hidden'); }
    if (this._hitT > 0) { this._hitT -= dt; if (this._hitT <= 0) this.el.hit.classList.remove('show'); }
    if (this._popT > 0) { this._popT -= dt; }
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
