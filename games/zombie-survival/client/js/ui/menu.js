// Menus: main, multiplayer (host / find LAN / join by name / direct), lobby, settings & controls.
import { settings, saveSettings, applyPreset, detectPreset, PRESETS, DEFAULT_BINDS, BIND_LABELS, keyLabel } from '../settings/settings.js';
import { Connection, wsUrlFor } from '../net/connection.js';
import { audio } from '../audio/audio.js';
import { MAX_PLAYERS_HARD } from '/shared/constants.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class MenuController {
  constructor(app) {
    this.app = app;
    this.current = null;
    this.lanTimer = null;
    this.lobbies = [];
    this._bindButtons();
    this._buildSettings();
    this.show('main');
    $('menu').addEventListener('click', (e) => { if (e.target.closest('button')) audio.play('ui_click', { vol: 0.6, bus: 'ui' }); }, true);
    $('menu').addEventListener('mouseover', (e) => { if (e.target.closest('.mbtn')) audio.play('ui_hover', { vol: 0.4, bus: 'ui' }); });
  }

  show(id) {
    document.querySelectorAll('#menu .screen').forEach(s => s.classList.add('hidden'));
    const el = $('scr-' + id);
    if (el) el.classList.remove('hidden');
    $('menu').classList.remove('hidden');
    $('menu-panel').classList.toggle('wide', id === 'find' || id === 'settings' || id === 'lobby');
    this.current = id;
    if (id === 'find') this.startLanList(); else this.stopLanList();
    if (id === 'name') this.app.local?.send({ t: 'lanList', on: true });
    const nameInput = $('player-name');
    if (nameInput && !nameInput.value) nameInput.value = settings.player.name || defaultName();
  }
  hide() { $('menu').classList.add('hidden'); this.stopLanList(); }

  status(id, text, err = false) { const el = $(id); el.textContent = text || ''; el.classList.toggle('err', !!err); }

  playerName() {
    const v = ($('player-name').value || '').trim().slice(0, 20) || defaultName();
    settings.player.name = v; saveSettings();
    return v;
  }

  _bindButtons() {
    $('btn-play').onclick = () => this.app.playSolo();
    $('btn-mp').onclick = () => this.show('mp');
    $('btn-settings').onclick = () => { this.refreshSettings(); this.show('settings'); this.setTab('graphics'); };
    $('btn-controls').onclick = () => { this.refreshSettings(); this.show('settings'); this.setTab('controls'); };
    $('btn-quit').onclick = () => { window.close(); setTimeout(() => this.status('main-status', 'Close this browser tab to quit. The server window can be closed too.'), 100); };
    $('btn-host').onclick = () => { $('host-name').value = settings.player.lastLobby || `${this.playerName()}'s Game`; this.show('host'); };
    $('btn-find').onclick = () => this.show('find');
    $('btn-name').onclick = () => this.show('name');
    $('btn-direct').onclick = () => { $('direct-ip').value = settings.player.lastIp || ''; this.show('direct'); };
    document.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => this.show(b.dataset.back); });
    $('btn-host-go').onclick = () => this.app.hostGame({ name: $('host-name').value.trim() || 'LAN Game', maxPlayers: parseInt($('host-max').value, 10) || 4, playerName: this.playerName(), isPublic: $('host-public').value !== 'private' });
    $('btn-name-go').onclick = () => this.app.joinByName($('join-name').value.trim(), this.playerName());
    $('btn-direct-go').onclick = () => this.app.directConnect($('direct-ip').value.trim(), this.playerName());
    $('btn-refresh').onclick = () => this.app.local?.send({ t: 'lanList', on: true });
    $('btn-ready').onclick = () => this.app.toggleReady();
    $('btn-start').onclick = () => this.app.startGame();
    $('btn-leave').onclick = () => this.app.leaveLobby();
    $('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) this.app.gameConn?.send({ t: 'chat', text: v }); e.target.value = ''; } });
    $('lobby-max').addEventListener('change', (e) => this.app.gameConn?.send({ t: 'setMax', max: parseInt(e.target.value, 10) }));
    $('btn-rejoin').onclick = () => this.app.rejoin();
    for (const inp of [$('host-name'), $('join-name'), $('direct-ip')]) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const btn = inp.parentElement.parentElement.querySelector('.primary'); if (btn) btn.click(); } });
  }

  // ---------------- LAN list ----------------
  startLanList() {
    this.app.local?.send({ t: 'lanList', on: true });
    this.renderLobbies(this.lobbies);
  }
  stopLanList() { if (this.current !== 'find' && this.current !== 'name') this.app.local?.send({ t: 'lanList', on: false }); }

  renderLobbies(list) {
    this.lobbies = list;
    if (this.current !== 'find') return;
    const box = $('lobby-list');
    if (!list.length) { box.innerHTML = `<div class="lobby-empty">No games found on this network yet.<br><span class="hint">Ask the host to press HOST GAME. Both computers must be on the same Wi-Fi / LAN and allow the game through the firewall.</span></div>`; return; }
    box.innerHTML = list.map((l, i) => `
      <div class="lobby-row">
        <div class="name">${esc(l.name)}<small>${esc(l.host || l.address)} - ${esc(l.address)}:${l.port}${l.self ? ' (this computer)' : ''}</small></div>
        <div>${l.players} / ${l.max}</div>
        <div>${l.rtt == null ? '...' : l.rtt + ' ms'}</div>
        <div class="st ${l.status}">${l.status === 'ingame' ? 'In Game' + (l.round ? ' - R' + l.round : '') : 'Waiting'}</div>
        <div><button data-join="${i}" ${l.players >= l.max ? 'disabled' : ''}>JOIN</button></div>
      </div>`).join('');
    box.querySelectorAll('[data-join]').forEach(b => { b.onclick = () => this.app.joinLobby(list[+b.dataset.join], this.playerName()); });
  }

  // ---------------- lobby ----------------
  renderLobby(lobby, myId) {
    $('lobby-name').textContent = lobby.name;
    const host = lobby.players.find(p => p.id === lobby.hostId);
    $('lobby-meta').textContent = `Host: ${host ? host.name : '?'}  -  ${lobby.players.length} / ${lobby.maxPlayers} players  -  ${lobby.status === 'ingame' ? 'IN GAME' : 'WAITING'}`;
    const rows = [];
    for (let i = 0; i < lobby.maxPlayers; i++) {
      const p = lobby.players[i];
      if (p) rows.push(`<div class="player-row"><span class="idx">${i + 1}</span><span class="pn">${esc(p.name)}${p.host ? '<span class="host">HOST</span>' : ''}${p.id === myId ? '<span class="host" style="color:#7ed37e">YOU</span>' : ''}</span><span class="ping">${p.ping} ms</span><span class="ready ${p.ready ? 'yes' : ''}">${p.ready ? 'READY' : 'NOT READY'}</span></div>`);
      else rows.push(`<div class="player-row empty"><span class="idx">${i + 1}</span><span class="pn">Open slot</span><span></span><span></span></div>`);
    }
    $('lobby-players').innerHTML = rows.join('');
    const me = lobby.players.find(p => p.id === myId);
    const isHost = lobby.hostId === myId;
    $('btn-ready').textContent = me && me.ready ? 'NOT READY' : 'READY';
    $('btn-start').classList.toggle('hidden', !isHost);
    $('btn-start').disabled = lobby.status === 'ingame';
    $('btn-start').textContent = lobby.status === 'ingame' ? 'GAME IN PROGRESS' : 'START GAME';
    $('lobby-max-wrap').classList.toggle('hidden', !isHost);
    $('lobby-max').value = String(lobby.maxPlayers);
    const others = lobby.players.filter(p => p.id !== myId);
    $('lobby-hint').textContent = isHost ? (others.length ? (others.every(p => p.ready) ? 'Everyone is ready. Start when you like.' : 'Waiting for players to press READY (you can start anyway).') : 'Waiting for friends to join... they need FIND LAN GAMES on their copy.') : 'Press READY. Only the host can start the game.';
  }
  chat(from, text) { const c = $('chat-log'); const d = document.createElement('div'); d.className = 'line'; d.innerHTML = `<b>${esc(from)}</b> ${esc(text)}`; c.appendChild(d); c.scrollTop = c.scrollHeight; }

  // ---------------- settings ----------------
  _buildSettings() {
    document.querySelectorAll('.tab').forEach(t => { t.onclick = () => this.setTab(t.dataset.tab); });
    const g = $('settings-graphics');
    g.innerHTML = `
      <div class="field"><label>Preset</label><select id="g-preset"><option value="low">LOW</option><option value="medium">MEDIUM</option><option value="high">HIGH</option><option value="ultra">ULTRA</option><option value="custom">CUSTOM</option></select></div>
      <div class="field"><label>Render Resolution Scale <span class="setting-val" id="g-res-v"></span></label><input type="range" id="g-res" min="0.5" max="1.5" step="0.05"></div>
      <div class="field"><label>Shadow Quality</label><select id="g-shadows"><option value="off">OFF</option><option value="low">LOW</option><option value="high">HIGH</option><option value="ultra">ULTRA (cascaded)</option></select></div>
      <div class="field"><label>Texture Quality</label><select id="g-textures"><option value="low">LOW</option><option value="medium">MEDIUM</option><option value="high">HIGH</option></select></div>
      <div class="field"><label>Effects Quality</label><select id="g-effects"><option value="low">LOW</option><option value="medium">MEDIUM</option><option value="high">HIGH</option><option value="ultra">ULTRA</option></select></div>
      <div class="field"><label>Anti-Aliasing</label><select id="g-aa"><option value="off">OFF</option><option value="fxaa">FXAA</option><option value="msaa">MSAA 4x</option></select></div>
      <div class="field"><label>Ambient Occlusion</label><select id="g-ao"><option value="1">ON</option><option value="0">OFF</option></select></div>
      <div class="field"><label>Bloom</label><select id="g-bloom"><option value="1">ON (subtle)</option><option value="0">OFF</option></select></div>
      <div class="field"><label>VSync</label><select id="g-vsync"><option value="1">ON</option><option value="0">OFF (use FPS limit)</option></select></div>
      <div class="field"><label>FPS Limit <span class="setting-val" id="g-fps-v"></span></label><input type="range" id="g-fps" min="0" max="240" step="10"></div>
      <div class="field"><label>Field of View <span class="setting-val" id="g-fov-v"></span></label><input type="range" id="g-fov" min="70" max="120" step="1"></div>
      <div class="field"><label>Show FPS</label><select id="g-showfps"><option value="1">ON</option><option value="0">OFF</option></select></div>`;
    const c = $('settings-controls');
    c.innerHTML = `
      <div class="settings-grid">
        <div class="field"><label>Mouse Sensitivity <span class="setting-val" id="c-sens-v"></span></label><input type="range" id="c-sens" min="0.1" max="4" step="0.05"></div>
        <div class="field"><label>ADS Sensitivity Multiplier <span class="setting-val" id="c-ads-v"></span></label><input type="range" id="c-ads" min="0.2" max="1.5" step="0.05"></div>
        <div class="field"><label>Invert Y</label><select id="c-invert"><option value="0">OFF</option><option value="1">ON</option></select></div>
        <div class="field"><label>Auto reload when empty</label><select id="c-autoreload"><option value="1">ON</option><option value="0">OFF</option></select></div>
      </div>
      <div class="binds" id="c-binds"></div>
      <div class="row" style="margin-top:8px"><button class="mbtn small" id="c-reset">RESET TO DEFAULTS</button></div>`;
    const a = $('settings-audio');
    a.innerHTML = ['master', 'sfx', 'ambient', 'ui'].map(k => `<div class="field"><label>${k.toUpperCase()} volume <span class="setting-val" id="a-${k}-v"></span></label><input type="range" id="a-${k}" min="0" max="1" step="0.05"></div>`).join('');
    // wiring
    const gs = settings.graphics;
    $('g-preset').onchange = (e) => { if (e.target.value !== 'custom') { applyPreset(e.target.value); this.refreshSettings(); this.app.onGraphicsChanged(); } };
    const bindSel = (id, key, conv = (v) => v) => { $(id).onchange = (e) => { gs[key] = conv(e.target.value); gs.preset = detectPreset(); saveSettings(); this.refreshSettings(); this.app.onGraphicsChanged(); }; };
    bindSel('g-shadows', 'shadows'); bindSel('g-textures', 'textures'); bindSel('g-effects', 'effects'); bindSel('g-aa', 'aa');
    bindSel('g-ao', 'ao', v => v === '1'); bindSel('g-bloom', 'bloom', v => v === '1'); bindSel('g-vsync', 'vsync', v => v === '1'); bindSel('g-showfps', 'showFps', v => v === '1');
    $('g-res').oninput = (e) => { gs.resolutionScale = parseFloat(e.target.value); $('g-res-v').textContent = Math.round(gs.resolutionScale * 100) + '%'; };
    $('g-res').onchange = () => { gs.preset = detectPreset(); saveSettings(); this.refreshSettings(); this.app.onGraphicsChanged(); };
    $('g-fps').oninput = (e) => { gs.fpsLimit = parseInt(e.target.value, 10); $('g-fps-v').textContent = gs.fpsLimit ? gs.fpsLimit : 'Unlimited'; };
    $('g-fps').onchange = () => saveSettings();
    $('g-fov').oninput = (e) => { gs.fov = parseInt(e.target.value, 10); $('g-fov-v').textContent = gs.fov + '°'; this.app.onFovChanged(); };
    $('g-fov').onchange = () => saveSettings();
    const cs = settings.controls;
    $('c-sens').oninput = (e) => { cs.sensitivity = parseFloat(e.target.value); $('c-sens-v').textContent = cs.sensitivity.toFixed(2); };
    $('c-sens').onchange = () => saveSettings();
    $('c-ads').oninput = (e) => { cs.adsSensitivity = parseFloat(e.target.value); $('c-ads-v').textContent = cs.adsSensitivity.toFixed(2); };
    $('c-ads').onchange = () => saveSettings();
    $('c-invert').onchange = (e) => { cs.invertY = e.target.value === '1'; saveSettings(); };
    $('c-autoreload').onchange = (e) => { cs.autoReload = e.target.value === '1'; saveSettings(); };
    $('c-reset').onclick = () => { cs.binds = { ...DEFAULT_BINDS }; cs.sensitivity = 1; cs.adsSensitivity = 0.75; cs.invertY = false; saveSettings(); this.refreshSettings(); };
    for (const k of ['master', 'sfx', 'ambient', 'ui']) {
      $('a-' + k).oninput = (e) => { settings.audio[k] = parseFloat(e.target.value); $('a-' + k + '-v').textContent = Math.round(settings.audio[k] * 100) + '%'; audio.setVolumes(settings.audio); };
      $('a-' + k).onchange = () => saveSettings();
    }
  }

  setTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    for (const n of ['graphics', 'controls', 'audio']) $('settings-' + n).classList.toggle('hidden', n !== name);
  }

  refreshSettings() {
    const gs = settings.graphics, cs = settings.controls;
    $('g-preset').value = detectPreset();
    $('g-res').value = gs.resolutionScale; $('g-res-v').textContent = Math.round(gs.resolutionScale * 100) + '%';
    $('g-shadows').value = gs.shadows; $('g-textures').value = gs.textures; $('g-effects').value = gs.effects; $('g-aa').value = gs.aa;
    $('g-ao').value = gs.ao ? '1' : '0'; $('g-bloom').value = gs.bloom ? '1' : '0'; $('g-vsync').value = gs.vsync ? '1' : '0'; $('g-showfps').value = gs.showFps ? '1' : '0';
    $('g-fps').value = gs.fpsLimit; $('g-fps-v').textContent = gs.fpsLimit ? gs.fpsLimit : 'Unlimited';
    $('g-fov').value = gs.fov; $('g-fov-v').textContent = gs.fov + '°';
    $('c-sens').value = cs.sensitivity; $('c-sens-v').textContent = cs.sensitivity.toFixed(2);
    $('c-ads').value = cs.adsSensitivity; $('c-ads-v').textContent = cs.adsSensitivity.toFixed(2);
    $('c-invert').value = cs.invertY ? '1' : '0'; $('c-autoreload').value = cs.autoReload === false ? '0' : '1';
    for (const k of ['master', 'sfx', 'ambient', 'ui']) { $('a-' + k).value = settings.audio[k]; $('a-' + k + '-v').textContent = Math.round(settings.audio[k] * 100) + '%'; }
    const binds = $('c-binds');
    binds.innerHTML = Object.keys(BIND_LABELS).map(k => `<div class="bind-row"><span>${BIND_LABELS[k]}</span><button data-bind="${k}">${keyLabel(cs.binds[k])}</button></div>`).join('');
    binds.querySelectorAll('[data-bind]').forEach(b => {
      b.onclick = () => {
        binds.querySelectorAll('button').forEach(x => x.classList.remove('listening'));
        b.classList.add('listening'); b.textContent = '...';
        this.app.input.captureNext((code) => {
          if (code !== 'Escape') { cs.binds[b.dataset.bind] = code; saveSettings(); }
          this.refreshSettings();
        });
      };
    });
  }
}

export function defaultName() {
  const names = ['Ranger', 'Mercer', 'Dakota', 'Riley', 'Harper', 'Jordan', 'Casey', 'Morgan'];
  return names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 90 + 10);
}

export { Connection, wsUrlFor, MAX_PLAYERS_HARD };
