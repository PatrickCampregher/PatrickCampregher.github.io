// Procedural weapon meshes. Barrel points along +Z, grip near the origin. Units: meters.
/* global BABYLON */

const B = () => BABYLON;

export function buildWeaponModel(scene, mats, def) {
  const look = def.look || { type: 'rifle', color: '#2a2d30', accent: '#555' };
  const parts = { body: [], accent: [], metal: [], wood: [], glow: [], glass: [] };
  const root = new (B().TransformNode)('wpn_' + def.id, scene);
  const box = (group, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = B().MeshBuilder.CreateBox('p', { width: w, height: h, depth: d }, scene);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    parts[group].push(m); return m;
  };
  const cyl = (group, r, len, x, y, z, axis = 'z', r2 = null, tess = 12) => {
    const m = B().MeshBuilder.CreateCylinder('c', { diameter: r * 2, diameterTop: (r2 ?? r) * 2, diameterBottom: r * 2, height: len, tessellation: tess }, scene);
    m.position.set(x, y, z);
    if (axis === 'z') m.rotation.x = Math.PI / 2; else if (axis === 'x') m.rotation.z = Math.PI / 2;
    parts[group].push(m); return m;
  };
  let muzzleZ = 0.3, muzzleY = 0.05, ejectPos = [0.03, 0.05, 0.02];
  let magMesh = null, boltMesh = null;
  const t = look.type;
  if (t === 'pistol') {
    box('body', 0.034, 0.036, 0.19, 0, 0.06, 0.08);           // slide
    box('metal', 0.03, 0.03, 0.17, 0, 0.033, 0.07);            // frame
    cyl('metal', 0.006, 0.03, 0, 0.062, 0.185);                // barrel tip
    box('accent', 0.03, 0.09, 0.05, 0, -0.02, -0.005, 0.25);   // grip
    box('metal', 0.004, 0.012, 0.03, 0, 0.005, 0.06);          // trigger guard
    box('metal', 0.008, 0.01, 0.008, 0, 0.085, 0.165); box('metal', 0.02, 0.01, 0.008, 0, 0.085, -0.005); // sights
    magMesh = parts.accent[0]; muzzleZ = 0.2; muzzleY = 0.062; ejectPos = [0.02, 0.07, 0.06];
  } else if (t === 'revolver') {
    box('body', 0.032, 0.05, 0.1, 0, 0.05, 0.03);              // frame
    cyl('body', 0.012, 0.19, 0, 0.068, 0.15);                  // barrel
    box('body', 0.012, 0.02, 0.17, 0, 0.05, 0.14);             // underlug
    cyl('metal', 0.022, 0.045, 0, 0.055, 0.04, 'z', null, 8);  // cylinder
    box('accent', 0.03, 0.085, 0.045, 0, -0.02, -0.02, 0.35);  // grip
    box('metal', 0.004, 0.012, 0.03, 0, 0.02, 0.05);
    box('metal', 0.006, 0.012, 0.01, 0, 0.088, 0.24);
    magMesh = parts.metal[0]; muzzleZ = 0.245; muzzleY = 0.068; ejectPos = [0.02, 0.06, 0.04];
  } else if (t === 'smg') {
    box('body', 0.045, 0.06, 0.28, 0, 0.06, 0.1);              // receiver
    cyl('metal', 0.009, 0.1, 0, 0.075, 0.28);                  // barrel
    box('metal', 0.03, 0.03, 0.08, 0, 0.075, 0.25);            // shroud
    box('accent', 0.026, 0.14, 0.035, 0, -0.03, 0.1, 0.12);    // magazine (ahead of grip)
    box('accent', 0.03, 0.09, 0.05, 0, -0.01, -0.01, 0.3);     // grip
    box('metal', 0.02, 0.025, 0.18, 0, 0.06, -0.14);           // stock
    box('metal', 0.03, 0.012, 0.2, 0, 0.098, 0.08);            // rail
    box('metal', 0.02, 0.02, 0.02, 0, 0.11, 0.0); box('metal', 0.005, 0.015, 0.01, 0, 0.112, 0.2);
    magMesh = parts.accent[0]; muzzleZ = 0.33; muzzleY = 0.075; ejectPos = [0.025, 0.07, 0.1];
  } else if (t === 'rifle') {
    const L = look.long ? 0.34 : 0.28;
    box('body', 0.05, 0.07, 0.24, 0, 0.06, 0.02);              // receiver
    box('accent', 0.045, 0.05, 0.2, 0, 0.065, 0.24);           // handguard
    cyl('metal', 0.008, L, 0, 0.075, 0.33 + L / 2 - 0.02);      // barrel
    cyl('metal', 0.012, 0.03, 0, 0.075, 0.33 + L - 0.01);       // muzzle brake
    box('metal', 0.028, 0.15, 0.05, 0, -0.04, 0.07, 0.35);     // magazine (curved look)
    box('accent', 0.03, 0.095, 0.05, 0, -0.01, -0.06, 0.3);    // grip
    box('body', 0.036, 0.055, 0.24, 0, 0.055, -0.22);          // stock
    box('body', 0.036, 0.09, 0.05, 0, 0.03, -0.32);            // buttpad
    if (look.carry) box('metal', 0.02, 0.03, 0.14, 0, 0.11, 0.02); // carry handle
    box('metal', 0.03, 0.01, 0.2, 0, 0.1, 0.05);               // rail
    box('metal', 0.006, 0.02, 0.01, 0, 0.11, 0.42); box('metal', 0.022, 0.015, 0.01, 0, 0.11, -0.05); // sights
    box('metal', 0.012, 0.012, 0.03, 0.03, 0.07, -0.02);       // charging handle
    magMesh = parts.metal[2]; muzzleZ = 0.33 + L; muzzleY = 0.075; ejectPos = [0.03, 0.07, 0.03];
  } else if (t === 'shotgun') {
    box('body', 0.045, 0.06, 0.16, 0, 0.06, 0.0);              // receiver
    cyl('metal', 0.011, 0.5, 0, 0.078, 0.33);                  // barrel
    cyl('metal', 0.011, 0.42, 0, 0.05, 0.29);                  // tube mag
    box('wood', 0.04, 0.045, 0.14, 0, 0.05, 0.22);             // pump
    box('wood', 0.036, 0.06, 0.26, 0, 0.035, -0.22, -0.12);    // stock
    box('wood', 0.036, 0.09, 0.05, 0, 0.0, -0.34);
    if (look.drum) cyl('metal', 0.05, 0.06, 0, -0.02, 0.08, 'x', null, 16);
    box('metal', 0.006, 0.014, 0.01, 0, 0.096, 0.55);
    magMesh = parts.wood[0]; muzzleZ = 0.58; muzzleY = 0.078; ejectPos = [0.03, 0.06, 0.02];
  } else if (t === 'sniper') {
    const L = look.short ? 0.36 : 0.52;
    box('body', 0.045, 0.065, 0.26, 0, 0.055, 0.02);           // receiver
    box('accent', 0.045, 0.05, 0.28, 0, 0.045, 0.27);          // fore-end
    cyl('metal', 0.009, L, 0, 0.075, 0.4 + L / 2);              // barrel
    cyl('metal', 0.013, 0.05, 0, 0.075, 0.4 + L - 0.02);        // muzzle
    cyl('metal', 0.018, 0.2, 0, 0.125, 0.02);                  // scope tube
    cyl('glass', 0.02, 0.01, 0, 0.125, 0.125);                 // lens
    cyl('metal', 0.022, 0.03, 0, 0.125, 0.11); cyl('metal', 0.022, 0.03, 0, 0.125, -0.07);
    box('metal', 0.01, 0.03, 0.01, 0, 0.1, 0.0); box('metal', 0.01, 0.03, 0.01, 0, 0.1, 0.06); // scope mounts
    box('metal', 0.03, 0.12, 0.04, 0, -0.03, 0.06, 0.2);       // magazine
    box('accent', 0.03, 0.09, 0.05, 0, -0.01, -0.07, 0.3);     // grip
    box('body', 0.04, 0.06, 0.26, 0, 0.05, -0.23);             // stock
    box('body', 0.04, 0.1, 0.05, 0, 0.02, -0.34);
    boltMesh = box('metal', 0.012, 0.012, 0.05, 0.04, 0.075, -0.02, 0, 0, -0.6); // bolt handle
    box('metal', 0.006, 0.05, 0.006, -0.03, 0.02, 0.36, 0, 0, 0.35); box('metal', 0.006, 0.05, 0.006, 0.03, 0.02, 0.36, 0, 0, -0.35); // bipod
    magMesh = parts.metal[6]; muzzleZ = 0.4 + L; muzzleY = 0.075; ejectPos = [0.03, 0.07, 0.02];
  } else if (t === 'lmg') {
    box('body', 0.06, 0.08, 0.3, 0, 0.06, 0.03);               // receiver
    box('accent', 0.05, 0.06, 0.22, 0, 0.065, 0.28);           // handguard
    cyl('metal', 0.011, 0.4, 0, 0.08, 0.55);                   // barrel
    box('metal', 0.03, 0.03, 0.3, 0, 0.09, 0.5);               // heat shield
    box('metal', 0.07, 0.11, 0.12, -0.03, -0.02, 0.06);        // box mag (left)
    box('accent', 0.03, 0.1, 0.05, 0, -0.02, -0.08, 0.3);      // grip
    box('body', 0.04, 0.07, 0.24, 0, 0.05, -0.26);             // stock
    box('body', 0.04, 0.11, 0.05, 0, 0.02, -0.37);
    box('metal', 0.006, 0.07, 0.006, -0.035, 0.03, 0.45, 0, 0, 0.4); box('metal', 0.006, 0.07, 0.006, 0.035, 0.03, 0.45, 0, 0, -0.4);
    box('metal', 0.03, 0.01, 0.22, 0, 0.105, 0.05); box('metal', 0.006, 0.02, 0.01, 0, 0.115, 0.6);
    magMesh = parts.metal[2]; muzzleZ = 0.75; muzzleY = 0.08; ejectPos = [0.035, 0.07, 0.05];
  } else if (t === 'launcher') {
    box('body', 0.055, 0.075, 0.2, 0, 0.06, -0.02);            // receiver
    cyl('metal', 0.038, 0.32, 0, 0.07, 0.24, 'z', 0.04);       // fat barrel
    cyl('accent', 0.045, 0.05, 0, 0.07, 0.07);                 // breech ring
    box('accent', 0.03, 0.09, 0.05, 0, -0.01, -0.06, 0.3);     // grip
    box('accent', 0.03, 0.08, 0.04, 0, 0.005, 0.18, 0.1);      // foregrip
    box('body', 0.04, 0.06, 0.2, 0, 0.05, -0.2);               // stock
    box('metal', 0.03, 0.05, 0.01, 0, 0.12, 0.0); box('metal', 0.006, 0.03, 0.01, 0, 0.11, 0.35); // ladder sight
    magMesh = parts.accent[0]; muzzleZ = 0.41; muzzleY = 0.07; ejectPos = [0.03, 0.06, 0.0];
  } else if (t === 'energy') {
    box('body', 0.06, 0.08, 0.26, 0, 0.06, 0.02);              // core body
    box('body', 0.05, 0.05, 0.2, 0, 0.09, 0.24, 0.1);          // upper housing
    cyl('glow', 0.02, 0.24, 0, 0.065, 0.24, 'z', null, 8);     // glowing coil core
    for (let i = 0; i < 4; i++) cyl('metal', 0.032, 0.012, 0, 0.065, 0.14 + i * 0.06, 'z', null, 8); // coil rings
    cyl('accent', 0.03, 0.06, 0, 0.065, 0.4, 'z', 0.02);       // emitter
    cyl('glow', 0.012, 0.03, 0, 0.065, 0.43);
    box('accent', 0.03, 0.095, 0.05, 0, -0.01, -0.05, 0.3);    // grip
    box('body', 0.04, 0.06, 0.2, 0, 0.05, -0.2);               // stock
    box('glow', 0.062, 0.012, 0.1, 0, 0.06, -0.06);            // side light strips
    box('accent', 0.03, 0.03, 0.08, 0, -0.02, 0.15);           // fore cell
    box('metal', 0.016, 0.03, 0.008, 0, 0.12, 0.05);
    magMesh = parts.accent[2]; muzzleZ = 0.45; muzzleY = 0.065; ejectPos = [0.03, 0.07, 0.0];
  }
  // materials + merge per group
  const matFor = {
    body: mats.solid('wbody_' + look.color, look.color, { metal: 0.75, rough: 0.5 }),
    accent: mats.solid('waccent_' + look.accent, look.accent, { metal: 0.3, rough: 0.6 }),
    metal: mats.solid('wmetal', '#8c9095', { metal: 1.0, rough: 0.35 }),
    wood: mats.solid('wwood', '#6b4a2c', { metal: 0.0, rough: 0.6 }),
    glow: mats.solid('wglow_' + (look.glow || look.accent), look.glow || look.accent, { metal: 0, rough: 0.3, emissive: look.glow || look.accent, emissiveIntensity: 2.0 }),
    glass: mats.solid('wglass', '#3355aa', { metal: 0.2, rough: 0.05, emissive: '#112244' }),
  };
  const meshes = [];
  let magOut = null, boltOut = null;
  for (const g in parts) {
    const list = parts[g];
    if (!list.length) continue;
    // keep the magazine/bolt separate for animation
    const keep = list.filter(m => m !== magMesh && m !== boltMesh);
    const specials = list.filter(m => m === magMesh || m === boltMesh);
    if (keep.length) {
      const merged = keep.length > 1 ? B().Mesh.MergeMeshes(keep, true, true, undefined, false, false) : keep[0];
      merged.material = matFor[g]; merged.parent = root; merged.isPickable = false; merged.name = 'wm_' + g;
      meshes.push(merged);
    }
    for (const s of specials) { s.material = matFor[g]; s.parent = root; s.isPickable = false; meshes.push(s); if (s === magMesh) magOut = s; if (s === boltMesh) boltOut = s; }
  }
  const muzzle = new (B().TransformNode)('muzzle', scene); muzzle.parent = root; muzzle.position.set(0, muzzleY, muzzleZ);
  const eject = new (B().TransformNode)('eject', scene); eject.parent = root; eject.position.set(ejectPos[0], ejectPos[1], ejectPos[2]);
  for (const m of meshes) { m.receiveShadows = false; }
  return { root, muzzle, eject, mag: magOut, bolt: boltOut, meshes, def, length: muzzleZ };
}

/** Clone a built weapon model (shares geometry & materials). */
export function cloneWeaponModel(model, name = 'wclone') {
  const scene = model.root.getScene();
  const root = new (B().TransformNode)(name, scene);
  const meshes = [];
  let mag = null, bolt = null;
  for (const m of model.meshes) {
    const inst = m.clone(m.name + '_c', root);
    inst.isPickable = false;
    meshes.push(inst);
    if (m === model.mag) mag = inst;
    if (m === model.bolt) bolt = inst;
  }
  const muzzle = new (B().TransformNode)('muzzle', scene); muzzle.parent = root; muzzle.position.copyFrom(model.muzzle.position);
  const eject = new (B().TransformNode)('eject', scene); eject.parent = root; eject.position.copyFrom(model.eject.position);
  return { root, muzzle, eject, mag, bolt, meshes, def: model.def, length: model.length, dispose() { root.dispose(); } };
}
