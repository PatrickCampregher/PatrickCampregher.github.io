// Persistent user settings (localStorage): graphics presets, controls, audio, player name.

const KEY = 'zombie-survival.settings.v1';

export const DEFAULT_BINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sprint: 'ShiftLeft', crouch: 'ControlLeft', crouch2: 'KeyC',
  reload: 'KeyR', interact: 'KeyE', slot1: 'Digit1', slot2: 'Digit2', swap: 'KeyQ',
  fire: 'Mouse0', ads: 'Mouse2', pause: 'Escape',
};

export const BIND_LABELS = {
  forward: 'Move Forward', back: 'Move Backward', left: 'Strafe Left', right: 'Strafe Right',
  jump: 'Jump', sprint: 'Sprint', crouch: 'Crouch', crouch2: 'Crouch (alt)', reload: 'Reload', interact: 'Interact / Use',
  slot1: 'Weapon Slot 1', slot2: 'Weapon Slot 2', swap: 'Swap Weapon', fire: 'Fire', ads: 'Aim Down Sight', pause: 'Pause / Menu',
};

export const PRESETS = {
  low: { resolutionScale: 0.75, shadows: 'off', textures: 'low', effects: 'low', aa: 'off', ao: false, bloom: false },
  medium: { resolutionScale: 1.0, shadows: 'low', textures: 'medium', effects: 'medium', aa: 'fxaa', ao: false, bloom: true },
  high: { resolutionScale: 1.0, shadows: 'high', textures: 'high', effects: 'high', aa: 'fxaa', ao: true, bloom: true },
  ultra: { resolutionScale: 1.0, shadows: 'ultra', textures: 'high', effects: 'ultra', aa: 'msaa', ao: true, bloom: true },
};

export const DEFAULTS = {
  graphics: { preset: 'high', ...PRESETS.high, vsync: true, fov: 95, fpsLimit: 0, showFps: true },
  controls: { sensitivity: 1.0, adsSensitivity: 0.75, invertY: false, binds: { ...DEFAULT_BINDS } },
  audio: { master: 0.8, sfx: 1.0, ambient: 0.6, ui: 0.6 },
  player: { name: '', lastLobby: 'Zombie Night', lastIp: '' },
};

function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!over || typeof over !== 'object') return out;
  for (const k in over) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') out[k] = deepMerge(base[k], over[k]);
    else out[k] = over[k];
  }
  return out;
}

export const settings = (() => {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { stored = null; }
  return deepMerge(DEFAULTS, stored);
})();

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}

export function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  settings.graphics.preset = name;
  Object.assign(settings.graphics, p);
  saveSettings();
}

/** Detect which preset the current graphics settings match, or 'custom'. */
export function detectPreset() {
  for (const name in PRESETS) {
    const p = PRESETS[name];
    let match = true;
    for (const k in p) if (settings.graphics[k] !== p[k]) { match = false; break; }
    if (match) return name;
  }
  return 'custom';
}

export function keyLabel(code) {
  if (!code) return '---';
  if (code === 'Mouse0') return 'LMB';
  if (code === 'Mouse1') return 'MMB';
  if (code === 'Mouse2') return 'RMB';
  if (code.startsWith('Mouse')) return 'M' + code.slice(5);
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'SPACE';
  if (code === 'ShiftLeft') return 'L-SHIFT';
  if (code === 'ShiftRight') return 'R-SHIFT';
  if (code === 'ControlLeft') return 'L-CTRL';
  if (code === 'ControlRight') return 'R-CTRL';
  if (code === 'AltLeft') return 'L-ALT';
  return code.toUpperCase();
}
