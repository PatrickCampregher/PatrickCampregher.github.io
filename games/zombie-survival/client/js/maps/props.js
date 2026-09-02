// Procedural prop meshes: vehicles, street furniture, mystery box, bear, powerups, boards.
/* global BABYLON */

const B = () => BABYLON;

function mergeGroup(list, material, name, parent) {
  if (!list.length) return null;
  const m = list.length > 1 ? B().Mesh.MergeMeshes(list, true, true, undefined, false, false) : list[0];
  m.material = material; m.name = name; if (parent) m.parent = parent;
  m.isPickable = false;
  return m;
}

export function buildVehicle(scene, mats, prop) {
  const scene_ = scene;
  const kind = prop.type;
  const dims = { car: [4.4, 1.45, 1.9], van: [5.2, 2.15, 2.2], bus: [11, 3.0, 2.6] }[kind];
  const [L, H, W] = dims;
  const root = new (B().TransformNode)('veh', scene_);
  const body = [], dark = [], glass = [], chrome = [];
  const box = (arr, w, h, d, x, y, z, rx = 0) => { const m = B().MeshBuilder.CreateBox('vb', { width: w, height: h, depth: d }, scene_); m.position.set(x, y, z); m.rotation.x = rx; arr.push(m); return m; };
  const cyl = (arr, r, len, x, y, z) => { const m = B().MeshBuilder.CreateCylinder('vc', { diameter: r * 2, height: len, tessellation: 14 }, scene_); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); arr.push(m); return m; };
  // local: length along X, width along Z
  if (kind === 'car') {
    box(body, L, 0.55, W, 0, 0.6, 0);                        // lower body
    box(body, L * 0.55, 0.5, W * 0.86, -0.2, 1.1, 0);        // cabin
    box(glass, L * 0.5, 0.42, W * 0.88, -0.2, 1.1, 0);       // windows (slightly wider)
    box(dark, L * 0.9, 0.08, W * 0.9, 0, 0.32, 0);           // underside
    box(dark, 0.6, 0.15, 0.25, L / 2 - 0.1, 0.55, W / 2 - 0.3); box(dark, 0.6, 0.15, 0.25, L / 2 - 0.1, 0.55, -W / 2 + 0.3); // headlights housing
    box(chrome, 0.1, 0.18, W * 0.85, L / 2 + 0.02, 0.45, 0); box(chrome, 0.1, 0.18, W * 0.85, -L / 2 - 0.02, 0.45, 0); // bumpers
    [[L * 0.32, W / 2 - 0.05], [L * 0.32, -W / 2 + 0.05], [-L * 0.32, W / 2 - 0.05], [-L * 0.32, -W / 2 + 0.05]].forEach(([x, z]) => cyl(dark, 0.36, 0.25, x, 0.36, z));
  } else if (kind === 'van') {
    box(body, L, 1.3, W, 0, 0.95, 0);
    box(body, L * 0.3, 0.5, W * 0.9, L * 0.3, 1.85, 0);
    box(glass, L * 0.22, 0.5, W * 0.92, L * 0.36, 1.35, 0);
    box(body, L * 0.62, 0.6, W, -L * 0.15, 1.9, 0);
    box(dark, L * 0.9, 0.1, W * 0.9, 0, 0.32, 0);
    box(chrome, 0.1, 0.2, W * 0.85, L / 2 + 0.02, 0.45, 0);
    [[L * 0.34, W / 2], [L * 0.34, -W / 2], [-L * 0.3, W / 2], [-L * 0.3, -W / 2]].forEach(([x, z]) => cyl(dark, 0.38, 0.26, x, 0.38, z));
  } else {
    box(body, L, 2.2, W, 0, 1.55, 0);
    box(glass, L * 0.92, 0.8, W + 0.04, 0, 1.9, 0);
    box(dark, L * 0.95, 0.15, W * 0.9, 0, 0.4, 0);
    box(body, L, 0.2, W * 0.9, 0, 2.75, 0);
    [[L * 0.36, W / 2], [L * 0.36, -W / 2], [-L * 0.32, W / 2], [-L * 0.32, -W / 2]].forEach(([x, z]) => cyl(dark, 0.5, 0.3, x, 0.5, z));
  }
  const paint = mats.vehicle(prop.color || '#777');
  const bodyM = mergeGroup(body, paint, 'veh_body', root);
  mergeGroup(dark, mats.solid('vdark', '#1c1c1c', { rough: 0.85, metal: 0.2 }), 'veh_dark', root);
  const g = mergeGroup(glass, mats.solid('vglass', '#1b2a33', { rough: 0.15, metal: 0.4, emissive: '#050a0f' }), 'veh_glass', root);
  mergeGroup(chrome, mats.solid('vchrome', '#9aa0a8', { rough: 0.3, metal: 1 }), 'veh_chrome', root);
  if (prop.wrecked && bodyM) {
    // tilt / crumple a little
    bodyM.rotation.z = 0.02; bodyM.rotation.x = 0.015;
    if (g) g.scaling.y = 0.85;
  }
  // convert: vehicles are defined with length along X but our map yaw has forward +Z: rotate -90deg so length aligns with Z? Keep X = length (collision box uses w=L along x)
  root.position.set(prop.x, prop.y ?? (prop.indoor ? 0.15 : 0), prop.z);
  root.rotation.y = prop.yaw || 0;
  return root;
}

export function buildStreetlight(scene, mats, prop) {
  const root = new (B().TransformNode)('lamp', scene);
  const metal = mats.solid('lamp_metal', '#3b3f44', { rough: 0.5, metal: 0.9 });
  const pole = B().MeshBuilder.CreateCylinder('pole', { diameter: 0.22, height: 6.5, tessellation: 10 }, scene); pole.position.y = 3.25;
  const arm = B().MeshBuilder.CreateBox('arm', { width: 0.12, height: 0.12, depth: 2.0 }, scene); arm.position.set(0, 6.3, 1.0); arm.rotation.x = -0.15;
  const head = B().MeshBuilder.CreateBox('head', { width: 0.35, height: 0.18, depth: 0.7 }, scene); head.position.set(0, 6.15, 1.95);
  const merged = mergeGroup([pole, arm, head], metal, 'lamp_m', root);
  const bulb = B().MeshBuilder.CreateBox('bulb', { width: 0.28, height: 0.04, depth: 0.55 }, scene);
  bulb.position.set(0, 6.05, 1.95); bulb.parent = root;
  bulb.material = mats.solid('lamp_bulb', '#ffe2b0', { emissive: '#ffc070', emissiveIntensity: 3.0, unlit: true });
  bulb.isPickable = false;
  root.position.set(prop.x, 0.15, prop.z);
  root.rotation.y = prop.yaw || 0;
  return { root, merged, bulb, lightPos: [prop.x + Math.sin(prop.yaw || 0) * 1.95, 5.9, prop.z + Math.cos(prop.yaw || 0) * 1.95] };
}

export function buildSmallProp(scene, mats, prop) {
  const root = new (B().TransformNode)('prop_' + prop.type, scene);
  const P = (m, mat) => { m.material = mat; m.parent = root; m.isPickable = false; return m; };
  switch (prop.type) {
    case 'barrel': {
      const m = B().MeshBuilder.CreateCylinder('barrel', { diameter: 0.6, height: 0.9, tessellation: 14 }, scene); m.position.y = 0.45;
      P(m, mats.get('metal_rust'));
      const ring1 = B().MeshBuilder.CreateTorus('r', { diameter: 0.62, thickness: 0.03, tessellation: 14 }, scene); ring1.position.y = 0.25;
      const ring2 = ring1.clone('r2'); ring2.position.y = 0.65;
      P(ring1, mats.solid('bring', '#6a6a6a', { metal: 1, rough: 0.5 })); P(ring2, mats.solid('bring', '#6a6a6a', { metal: 1, rough: 0.5 }));
      root.position.set(prop.x, prop.y ?? 0, prop.z);
      break;
    }
    case 'hydrant': {
      const body = B().MeshBuilder.CreateCylinder('h', { diameter: 0.26, height: 0.7, tessellation: 10 }, scene); body.position.y = 0.35;
      const top = B().MeshBuilder.CreateCylinder('h2', { diameter: 0.3, height: 0.12, tessellation: 10 }, scene); top.position.y = 0.74;
      const cap = B().MeshBuilder.CreateCylinder('h3', { diameter: 0.14, height: 0.12, tessellation: 8 }, scene); cap.position.y = 0.84;
      const side = B().MeshBuilder.CreateCylinder('h4', { diameter: 0.12, height: 0.34, tessellation: 8 }, scene); side.rotation.z = Math.PI / 2; side.position.y = 0.45;
      P(mergeGroup([body, top, cap, side], mats.get('paint_red'), 'hyd'), mats.get('paint_red'));
      root.position.set(prop.x, 0.15, prop.z);
      break;
    }
    case 'mailbox': {
      const legs = B().MeshBuilder.CreateBox('l', { width: 0.4, height: 0.5, depth: 0.3 }, scene); legs.position.y = 0.25;
      const bodyM = B().MeshBuilder.CreateBox('b', { width: 0.55, height: 0.55, depth: 0.45 }, scene); bodyM.position.y = 0.78;
      const topM = B().MeshBuilder.CreateCylinder('t', { diameter: 0.45, height: 0.55, tessellation: 12 }, scene); topM.rotation.z = Math.PI / 2; topM.position.y = 1.05;
      P(mergeGroup([legs, bodyM, topM], mats.get('paint_blue'), 'mb'), mats.get('paint_blue'));
      root.position.set(prop.x, 0.15, prop.z);
      break;
    }
    case 'pole': {
      const pole = B().MeshBuilder.CreateCylinder('pp', { diameter: 0.3, height: 8, tessellation: 8 }, scene); pole.position.y = 4;
      const cross = B().MeshBuilder.CreateBox('pc', { width: 2.0, height: 0.12, depth: 0.12 }, scene); cross.position.y = 7.4;
      P(mergeGroup([pole, cross], mats.get('wood_dark'), 'pole'), mats.get('wood_dark'));
      root.position.set(prop.x, 0, prop.z);
      break;
    }
    case 'debris': {
      const s = prop.s || 1;
      const list = [];
      let seed = Math.abs(Math.round(prop.x * 13 + prop.z * 7));
      const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < 7; i++) {
        const m = B().MeshBuilder.CreateBox('d', { width: 0.2 + r() * 0.5 * s, height: 0.1 + r() * 0.25 * s, depth: 0.2 + r() * 0.5 * s }, scene);
        m.position.set((r() - 0.5) * 1.3 * s, 0.05 + r() * 0.12, (r() - 0.5) * 1.1 * s);
        m.rotation.set(r() * 0.5, r() * 3.14, r() * 0.5);
        list.push(m);
      }
      P(mergeGroup(list, mats.get('rubble'), 'debris'), mats.get('rubble'));
      root.position.set(prop.x, 0, prop.z);
      break;
    }
    case 'trash': {
      const list = [];
      for (let i = 0; i < 3; i++) { const m = B().MeshBuilder.CreateSphere('t', { diameter: 0.5 + i * 0.1, segments: 6 }, scene); m.position.set(i * 0.35 - 0.3, 0.22, (i % 2) * 0.3); m.scaling.y = 0.7; list.push(m); }
      P(mergeGroup(list, mats.solid('trashbag', '#151515', { rough: 0.35 }), 'trash'), mats.solid('trashbag', '#151515', { rough: 0.35 }));
      root.position.set(prop.x, 0.15, prop.z);
      break;
    }
    case 'busstop': {
      const roof = B().MeshBuilder.CreateBox('r', { width: 4.2, height: 0.08, depth: 1.4 }, scene); roof.position.set(0, 2.6, 0.2);
      const back = B().MeshBuilder.CreateBox('b', { width: 4.0, height: 2.2, depth: 0.05 }, scene); back.position.set(0, 1.45, 0.75);
      P(roof, mats.get('metal_dark'));
      P(back, mats.get('glass'));
      root.position.set(prop.x, 0.15, prop.z);
      break;
    }
    default: return null;
  }
  return root;
}

export function buildMysteryBoxMesh(scene, mats) {
  const root = new (B().TransformNode)('mbox', scene);
  const wood = mats.get('boxwood');
  const base = B().MeshBuilder.CreateBox('mb_base', { width: 1.3, height: 0.55, depth: 0.7 }, scene);
  base.position.y = 0.275; base.material = wood; base.parent = root; base.isPickable = false;
  const trim = mats.solid('mbtrim', '#b89a3a', { metal: 1, rough: 0.35 });
  const edges = [];
  for (const [x, z] of [[-0.66, -0.36], [0.66, -0.36], [-0.66, 0.36], [0.66, 0.36]]) { const e = B().MeshBuilder.CreateBox('e', { width: 0.05, height: 0.58, depth: 0.05 }, scene); e.position.set(x, 0.29, z); edges.push(e); }
  const band = B().MeshBuilder.CreateBox('band', { width: 1.34, height: 0.06, depth: 0.74 }, scene); band.position.y = 0.53; edges.push(band);
  const em = mergeGroup(edges, trim, 'mb_trim', root);
  const lidPivot = new (B().TransformNode)('lidPivot', scene); lidPivot.parent = root; lidPivot.position.set(0, 0.56, -0.35);
  const lid = B().MeshBuilder.CreateBox('mb_lid', { width: 1.3, height: 0.08, depth: 0.7 }, scene);
  lid.position.set(0, 0.04, 0.35); lid.material = wood; lid.parent = lidPivot; lid.isPickable = false;
  const glowMat = mats.glow('mbox', '#66ccff', 0.55);
  const glow = B().MeshBuilder.CreateBox('mb_glow', { width: 1.22, height: 0.02, depth: 0.62 }, scene);
  glow.position.y = 0.56; glow.material = glowMat; glow.parent = root; glow.isPickable = false; glow.isVisible = false;
  // light beam (tall additive cylinder)
  const beam = B().MeshBuilder.CreateCylinder('mb_beam', { diameter: 0.7, height: 60, tessellation: 12 }, scene);
  beam.position.y = 30; beam.material = mats.glow('beam', '#5fb8ff', 0.16); beam.parent = root; beam.isPickable = false;
  // weapon display anchor
  const display = new (B().TransformNode)('mb_display', scene); display.parent = root; display.position.set(0, 1.1, 0);
  const light = new (B().PointLight)('mb_light', new (B().Vector3)(0, 1.0, 0), scene);
  light.diffuse = B().Color3.FromHexString('#66ccff'); light.intensity = 0; light.range = 7; light.parent = root;
  light.includedOnlyMeshes = [base, em, lid, glow];
  return { root, lidPivot, lid, glow, beam, display, light, meshes: [base, em, lid] };
}

export function buildBearMesh(scene, mats) {
  const root = new (B().TransformNode)('bear', scene);
  const fur = mats.solid('bearfur', '#8a5a34', { rough: 0.95 });
  const dark = mats.solid('beardark', '#2a1a10', { rough: 0.8 });
  const P = (m, mat) => { m.material = mat; m.parent = root; m.isPickable = false; return m; };
  const body = B().MeshBuilder.CreateSphere('bb', { diameter: 0.42, segments: 10 }, scene); body.position.y = 0.32; body.scaling.y = 1.15;
  const head = B().MeshBuilder.CreateSphere('bh', { diameter: 0.34, segments: 10 }, scene); head.position.y = 0.66;
  const earL = B().MeshBuilder.CreateSphere('be', { diameter: 0.12, segments: 6 }, scene); earL.position.set(-0.13, 0.8, 0);
  const earR = earL.clone('be2'); earR.position.x = 0.13;
  const armL = B().MeshBuilder.CreateSphere('ba', { diameter: 0.14, segments: 6 }, scene); armL.position.set(-0.22, 0.4, 0.06); armL.scaling.y = 1.6; armL.rotation.z = 0.5;
  const armR = armL.clone('ba2'); armR.position.x = 0.22; armR.rotation.z = -0.5;
  const legL = B().MeshBuilder.CreateSphere('bl', { diameter: 0.16, segments: 6 }, scene); legL.position.set(-0.12, 0.12, 0.05); legL.scaling.y = 1.3;
  const legR = legL.clone('bl2'); legR.position.x = 0.12;
  const snout = B().MeshBuilder.CreateSphere('bs', { diameter: 0.14, segments: 6 }, scene); snout.position.set(0, 0.62, 0.15); snout.scaling.z = 0.7;
  P(mergeGroup([body, head, earL, earR, armL, armR, legL, legR, snout], fur, 'bear_fur'), fur);
  const eyeL = B().MeshBuilder.CreateSphere('bey', { diameter: 0.05, segments: 5 }, scene); eyeL.position.set(-0.06, 0.7, 0.15);
  const eyeR = eyeL.clone('bey2'); eyeR.position.x = 0.06;
  const nose = B().MeshBuilder.CreateSphere('bn', { diameter: 0.05, segments: 5 }, scene); nose.position.set(0, 0.63, 0.21);
  P(mergeGroup([eyeL, eyeR, nose], dark, 'bear_dark'), dark);
  // a little bow
  const bow = B().MeshBuilder.CreateBox('bow', { width: 0.16, height: 0.06, depth: 0.05 }, scene); bow.position.set(0, 0.5, 0.18);
  P(bow, mats.solid('bearbow', '#c0392b', { rough: 0.6 }));
  root.setEnabled(false);
  return root;
}

export function buildPowerupMesh(scene, mats, type, color) {
  const root = new (B().TransformNode)('pu', scene);
  const hex = '#' + color.map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
  const core = mats.solid('pu_' + type, hex, { emissive: hex, emissiveIntensity: 1.6, rough: 0.3, metal: 0.4 });
  const P = (m, mat) => { m.material = mat; m.parent = root; m.isPickable = false; return m; };
  let m;
  if (type === 'resupply') { m = B().MeshBuilder.CreateBox('pu', { width: 0.5, height: 0.35, depth: 0.32 }, scene); }
  else if (type === 'oneshot') { m = B().MeshBuilder.CreatePolyhedron('pu', { type: 1, size: 0.25 }, scene); }
  else if (type === 'double') { m = B().MeshBuilder.CreateCylinder('pu', { diameter: 0.5, height: 0.12, tessellation: 24 }, scene); m.rotation.x = Math.PI / 2; }
  else { m = B().MeshBuilder.CreateSphere('pu', { diameter: 0.45, segments: 12 }, scene); }
  P(m, core);
  const halo = B().MeshBuilder.CreateSphere('halo', { diameter: 0.9, segments: 10 }, scene);
  P(halo, mats.glow('pu_' + type, hex, 0.18));
  const light = new (B().PointLight)('pu_light', new (B().Vector3)(0, 0, 0), scene);
  light.diffuse = B().Color3.FromHexString(hex); light.intensity = 1.2; light.range = 8; light.parent = root;
  light.includedOnlyMeshes = [m, halo];
  return { root, light, core: m };
}

export function buildBoardBase(scene, mats) {
  const plank = B().MeshBuilder.CreateBox('board', { width: 1.9, height: 0.16, depth: 0.05 }, scene);
  plank.material = mats.get('boards');
  plank.isVisible = false; plank.isPickable = false;
  return plank;
}
