// Builds the visual town from the shared world data: merged static geometry, props, doors, boards,
// mystery box, wall buys, entries, outer ruins, lights and fires.
/* global BABYLON */
import { WEAPONS } from '/shared/weapons.js';
import { buildVehicle, buildStreetlight, buildSmallProp, buildMysteryBoxMesh, buildBearMesh, buildBoardBase } from './props.js';
import { chalkWeaponCanvas } from './textures.js';

const B = () => BABYLON;
const V3 = (x, y, z) => new (BABYLON.Vector3)(x, y, z);
const CHUNK = 16;

function scaleUVs(mesh, su, sv) {
  const uvs = mesh.getVerticesData(B().VertexBuffer.UVKind);
  if (!uvs) return;
  for (let i = 0; i < uvs.length; i += 2) { uvs[i] *= su; uvs[i + 1] *= sv; }
  mesh.setVerticesData(B().VertexBuffer.UVKind, uvs);
}

function boxMesh(scene, w, h, d, texScale) {
  const s = texScale || 1;
  // Babylon box faces: 0/1 (±z): u along width, v along height; 2/3 (±x): u along height, v along depth; 4/5 (±y): u along depth, v along width
  const faceUV = [
    new (B().Vector4)(0, 0, w / s, h / s), new (B().Vector4)(0, 0, w / s, h / s),
    new (B().Vector4)(0, 0, h / s, d / s), new (B().Vector4)(0, 0, h / s, d / s),
    new (B().Vector4)(0, 0, d / s, w / s), new (B().Vector4)(0, 0, d / s, w / s),
  ];
  return B().MeshBuilder.CreateBox('b', { width: w, height: h, depth: d, faceUV }, scene);
}

/** Box mesh for a collision box; long-in-Z boxes are built rotated so their big faces get upright textures. */
function boxMeshFor(scene, b, texScale) {
  if (b.d > b.w * 1.5) {
    const m = boxMesh(scene, b.d, b.h, b.w, texScale);
    m.position.set(b.cx, b.y0 + b.h / 2, b.cz);
    m.rotation.y = b.yaw + Math.PI / 2;
    return m;
  }
  const m = boxMesh(scene, b.w, b.h, b.d, texScale);
  m.position.set(b.cx, b.y0 + b.h / 2, b.cz);
  m.rotation.y = b.yaw;
  return m;
}

export function buildMap(scene, world, mats, lighting, textures, effects, settings) {
  const MAP = world.map;
  const staticMeshes = [];
  const shadowCasters = [];
  const groups = new Map(); // key -> { mat, meshes }
  const interactables = [];
  const addToGroup = (matName, mesh, cx, cz, castShadow = true) => {
    const key = `${matName}|${Math.floor(cx / CHUNK)}|${Math.floor(cz / CHUNK)}|${castShadow ? 1 : 0}`;
    let g = groups.get(key);
    if (!g) { g = { mat: mats.get(matName), meshes: [], cast: castShadow }; groups.set(key, g); }
    g.meshes.push(mesh);
  };

  // ---------------- static boxes ----------------
  for (const b of world.boxes) {
    if (b.invisible || b.door) continue;
    if (b.kind === 'car' || b.kind === 'van' || b.kind === 'bus' || b.kind === 'streetlight' || b.kind === 'pole' || b.kind === 'barrel' || b.kind === 'hydrant' || b.kind === 'mailbox' || b.kind === 'debris' || b.kind === 'post') continue; // props built separately
    if (b.kind === 'outer' || b.kind === 'machine') continue; // machines are built by machines.js
    const mat = b.mat || 'concrete';
    const set = textures.get(mat);
    const m = boxMeshFor(scene, b, set.scale);
    if (mat === 'glass') { m.material = mats.get('glass'); m.isPickable = false; staticMeshes.push(m); m.freezeWorldMatrix(); continue; }
    if (mat === 'fence' || b.fence) { addToGroup('fence', m, b.cx, b.cz, false); continue; }
    addToGroup(mat, m, b.cx, b.cz, b.kind !== 'floor');
  }

  // ---------------- grounds ----------------
  const groundsSorted = [...MAP.grounds].sort((a, b) => (a.base ? -1 : 0) - (b.base ? -1 : 0));
  for (const g of groundsSorted) {
    const w = g.x1 - g.x0, d = g.z1 - g.z0;
    const set = textures.get(g.mat);
    const m = B().MeshBuilder.CreateGround('ground_' + g.mat, { width: w, height: d, subdivisions: 1 }, scene);
    scaleUVs(m, w / set.scale, d / set.scale);
    m.position.set((g.x0 + g.x1) / 2, g.base ? -0.02 : 0.0, (g.z0 + g.z1) / 2);
    addToGroup(g.mat, m, (g.x0 + g.x1) / 2, (g.z0 + g.z1) / 2, false);
  }
  // road markings
  {
    const yellow = mats.solid('paint_yellow', '#b89a3a', { rough: 0.85 });
    const white = mats.solid('paint_white', '#c9c9c0', { rough: 0.85 });
    const marks = [];
    for (let x = -22; x < 22; x += 4) { const m = B().MeshBuilder.CreateBox('mk', { width: 2.2, height: 0.012, depth: 0.14 }, scene); m.position.set(x + 1.1, 0.006, 0.12); marks.push(m); const m2 = m.clone('mk2'); m2.position.z = -0.12; marks.push(m2); }
    const ym = B().Mesh.MergeMeshes(marks, true, true, undefined, false, false); ym.material = yellow; ym.isPickable = false; ym.receiveShadows = true; staticMeshes.push(ym); ym.freezeWorldMatrix();
    const wm = [];
    for (const z of [4.3, -4.3]) { const m = B().MeshBuilder.CreateBox('mw', { width: 47, height: 0.012, depth: 0.14 }, scene); m.position.set(0, 0.006, z); wm.push(m); }
    for (let i = 0; i < 7; i++) { const m = B().MeshBuilder.CreateBox('cw', { width: 0.6, height: 0.012, depth: 8 }, scene); m.position.set(-2.4 + i * 0.8 - 20, 0.006, 0); wm.push(m); }
    for (let i = 0; i < 6; i++) { const m = B().MeshBuilder.CreateBox('pl', { width: 0.12, height: 0.012, depth: 5 }, scene); m.position.set(27 + i * 2.6, 0.006, 15); wm.push(m); const m2 = m.clone('pl2'); m2.position.z = -11; wm.push(m2); }
    const wmm = B().Mesh.MergeMeshes(wm, true, true, undefined, false, false); wmm.material = white; wmm.isPickable = false; wmm.receiveShadows = true; staticMeshes.push(wmm); wmm.freezeWorldMatrix();
  }

  // ---------------- merge groups ----------------
  for (const [key, g] of groups) {
    const merged = g.meshes.length > 1 ? B().Mesh.MergeMeshes(g.meshes, true, true, undefined, false, false) : g.meshes[0];
    if (!merged) continue;
    merged.name = 'chunk_' + key;
    merged.material = g.mat;
    merged.isPickable = false;
    merged.receiveShadows = true;
    merged.freezeWorldMatrix();
    merged.doNotSyncBoundingInfo = true;
    if (g.cast) shadowCasters.push(merged);
    staticMeshes.push(merged);
  }

  // ---------------- props ----------------
  const propNodes = [];
  const streetLights = [];
  for (const p of MAP.props) {
    if (p.type === 'car' || p.type === 'van' || p.type === 'bus') {
      const root = buildVehicle(scene, mats, p);
      propNodes.push(root);
      root.getChildMeshes().forEach(m => { m.receiveShadows = true; shadowCasters.push(m); staticMeshes.push(m); m.freezeWorldMatrix(); });
      if (p.burning) effects.fire(p.x, (p.y ?? 0) + 1.0, p.z, 1.1);
    } else if (p.type === 'streetlight') {
      const sl = buildStreetlight(scene, mats, p);
      sl.merged.receiveShadows = true; shadowCasters.push(sl.merged); staticMeshes.push(sl.merged); sl.merged.freezeWorldMatrix(); sl.bulb.freezeWorldMatrix();
      const light = lighting.addPointLight('street', sl.lightPos, '#ffc27a', 2.0, 22, false);
      streetLights.push(light);
      propNodes.push(sl.root);
    } else if (p.type === 'lamp') {
      lighting.addPointLight('lamp', [p.x, p.y, p.z], p.color || '#ffd0a0', p.intensity || 1.2, p.range || 14, !!p.flicker);
      const fix = B().MeshBuilder.CreateBox('fix', { width: 0.5, height: 0.06, depth: 0.5 }, scene);
      fix.position.set(p.x, p.y + 0.15, p.z);
      fix.material = mats.solid('lampfix_' + (p.color || 'w'), p.color || '#ffd0a0', { emissive: p.color || '#ffd0a0', emissiveIntensity: 2.5, unlit: true });
      fix.isPickable = false; fix.freezeWorldMatrix(); staticMeshes.push(fix);
    } else if (p.type === 'fire') {
      effects.fire(p.x, p.y, p.z, p.size || 1);
      if (p.barrel) {
        const bm = B().MeshBuilder.CreateCylinder('fbarrel', { diameter: 0.62, height: 0.9, tessellation: 14 }, scene);
        bm.position.set(p.x, p.y + 0.45, p.z); bm.material = mats.get('metal_rust'); bm.isPickable = false; bm.freezeWorldMatrix(); staticMeshes.push(bm); shadowCasters.push(bm);
      }
    } else {
      const node = buildSmallProp(scene, mats, p);
      if (node) { propNodes.push(node); node.getChildMeshes().forEach(m => { m.receiveShadows = true; if (p.type !== 'trash') shadowCasters.push(m); staticMeshes.push(m); m.freezeWorldMatrix(); }); }
    }
  }

  // ---------------- doors ----------------
  const doorMeshes = new Map();
  for (const id in world.doors) {
    const door = world.doors[id];
    const b = door.box;
    const root = new (B().TransformNode)('door_' + id, scene);
    root.position.set(b.cx, b.y0, b.cz);
    const alongX = b.w > b.d;
    const len = alongX ? b.w : b.d, th = alongX ? b.d : b.w;
    const mk = (w, h, d, x, y, z, mat) => { const m = boxMesh(scene, w, h, d, textures.get(mat).scale); m.position.set(x, y, z); m.material = mats.get(mat); m.parent = root; m.isPickable = false; m.receiveShadows = true; shadowCasters.push(m); return m; };
    if (door.kind === 'door') {
      // wooden door: boards + a thin frame + a bar
      const slab = mk(alongX ? len : th * 0.4, b.h, alongX ? th * 0.4 : len, 0, b.h / 2, 0, 'boards');
      const bar = mk(alongX ? len + 0.2 : 0.12, 0.14, alongX ? 0.12 : len + 0.2, 0, b.h * 0.55, 0, 'wood_dark');
      const bar2 = mk(alongX ? len + 0.2 : 0.12, 0.14, alongX ? 0.12 : len + 0.2, 0, b.h * 0.3, 0, 'wood_dark');
      void slab; void bar; void bar2;
    } else if (door.kind === 'gate') {
      const panel = mk(alongX ? len : 0.06, b.h, alongX ? 0.06 : len, 0, b.h / 2, 0, 'fence');
      const post1 = mk(0.12, b.h + 0.2, 0.12, alongX ? -len / 2 : 0, b.h / 2, alongX ? 0 : -len / 2, 'metal_dark');
      const post2 = mk(0.12, b.h + 0.2, 0.12, alongX ? len / 2 : 0, b.h / 2, alongX ? 0 : len / 2, 'metal_dark');
      const top = mk(alongX ? len : 0.1, 0.1, alongX ? 0.1 : len, 0, b.h, 0, 'metal_dark');
      const chain = mk(alongX ? 0.9 : 0.08, 0.25, alongX ? 0.08 : 0.9, 0, b.h * 0.5, 0, 'metal_rust');
      void panel; void post1; void post2; void top; void chain;
    } else {
      mk(alongX ? len : th, b.h, alongX ? th : len, 0, b.h / 2, 0, 'metal_panel');
    }
    root.getChildMeshes().forEach(m => staticMeshes.push(m));
    doorMeshes.set(id, root);
    interactables.push({ kind: 'door', id, x: b.cx, y: b.y0 + 1, z: b.cz, door, range: 3.0 });
  }

  // ---------------- window frames & boards ----------------
  const boardBase = buildBoardBase(scene, mats);
  shadowCasters.push(boardBase);
  const boards = new Map();
  for (const wf of world.visuals.windowFrames) {
    if (wf.glass) continue;
    const frameMat = mats.get('wood_dark');
    const alongX = Math.abs(wf.yaw) < 0.01;
    const mk = (w, h, d, x, y, z) => { const m = boxMesh(scene, w, h, d, 1.5); m.position.set(x, y, z); m.material = frameMat; m.isPickable = false; m.receiveShadows = true; m.freezeWorldMatrix(); staticMeshes.push(m); shadowCasters.push(m); return m; };
    const t = wf.t + 0.06;
    if (alongX) { mk(wf.w + 0.16, 0.08, t, wf.x, wf.y - 0.04, wf.z); mk(wf.w + 0.16, 0.08, t, wf.x, wf.y + wf.h + 0.04, wf.z); mk(0.08, wf.h, t, wf.x - wf.w / 2 - 0.04, wf.y + wf.h / 2, wf.z); mk(0.08, wf.h, t, wf.x + wf.w / 2 + 0.04, wf.y + wf.h / 2, wf.z); }
    else { mk(t, 0.08, wf.w + 0.16, wf.x, wf.y - 0.04, wf.z); mk(t, 0.08, wf.w + 0.16, wf.x, wf.y + wf.h + 0.04, wf.z); mk(t, wf.h, 0.08, wf.x, wf.y + wf.h / 2, wf.z - wf.w / 2 - 0.04); mk(t, wf.h, 0.08, wf.x, wf.y + wf.h / 2, wf.z + wf.w / 2 + 0.04); }
  }
  for (const id in world.entries) {
    const e = world.entries[id];
    if (e.type === 'window' && e.gap) {
      const g = e.gap;
      const planks = [];
      let seed = id.length * 7 + g.x * 3 + g.z;
      const r = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let i = 0; i < e.maxBoards; i++) {
        const inst = boardBase.createInstance('board_' + id + '_' + i);
        const yy = g.y + 0.12 + (i / Math.max(1, e.maxBoards - 1)) * (g.h - 0.24);
        const alongX = Math.abs(g.yaw) < 0.01;
        const off = (r() - 0.5) * 0.06;
        inst.position.set(g.x + (alongX ? 0 : off), yy, g.z + (alongX ? off : 0));
        inst.rotation.set(0, g.yaw, (r() - 0.5) * 0.25);
        inst.scaling.set((g.w + 0.35) / 1.9, 1, 1);
        inst.isPickable = false;
        inst.isVisible = i < e.boards;
        planks.push(inst);
      }
      boards.set(id, { planks, entry: e });
      interactables.push({ kind: 'board', id, x: e.inside[0], y: e.inside[1] + 1, z: e.inside[2], entry: e, range: 2.6 });
    } else if (e.type === 'manhole') {
      const cover = B().MeshBuilder.CreateCylinder('manhole', { diameter: 0.95, height: 0.04, tessellation: 20 }, scene);
      cover.position.set(e.inside[0], e.inside[1] + 0.02, e.inside[2]); cover.material = mats.get('metal_dark'); cover.isPickable = false; cover.receiveShadows = true; cover.freezeWorldMatrix(); staticMeshes.push(cover);
      const rim = B().MeshBuilder.CreateTorus('rim', { diameter: 1.0, thickness: 0.06, tessellation: 20 }, scene);
      rim.position.copyFrom(cover.position); rim.material = mats.get('concrete'); rim.isPickable = false; rim.freezeWorldMatrix(); staticMeshes.push(rim);
      e.coverMesh = cover;
    } else if (e.type === 'rubble' || e.type === 'hole') {
      // rubble heap in the gap
      const g = e.gap;
      if (g) {
        const list = [];
        let seed = g.x * 13 + g.z * 7;
        const r = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        const n = e.type === 'rubble' ? 6 : 3;
        for (let i = 0; i < n; i++) {
          const m = B().MeshBuilder.CreateBox('rb', { width: 0.4 + r() * 0.8, height: 0.25 + r() * 0.45, depth: 0.4 + r() * 0.8 }, scene);
          const alongX = Math.abs(g.yaw) < 0.01;
          m.position.set(g.x + (alongX ? (r() - 0.5) * g.w : (r() - 0.5) * 1.2), (e.type === 'rubble' ? 0.2 : 0.1) + r() * 0.4, g.z + (alongX ? (r() - 0.5) * 1.2 : (r() - 0.5) * g.w));
          m.rotation.set(r() * 0.6, r() * 3, r() * 0.6);
          list.push(m);
        }
        const merged = B().Mesh.MergeMeshes(list, true, true, undefined, false, false);
        merged.material = mats.get('rubble'); merged.isPickable = false; merged.receiveShadows = true; merged.freezeWorldMatrix(); staticMeshes.push(merged); shadowCasters.push(merged);
      }
    }
  }

  // ---------------- wall buys ----------------
  const wallBuyMeshes = [];
  world.wallBuys.forEach((wb, index) => {
    const def = WEAPONS[wb.weapon];
    const canvas = chalkWeaponCanvas(256, def.look, def.name, wb.cost);
    const tex = textures.fromCanvas('chalk_' + wb.weapon, canvas, { clamp: true });
    const mat = mats.decal('chalk_' + wb.weapon, tex, { emissive: '#8a8a88' });
    const plane = B().MeshBuilder.CreatePlane('wallbuy_' + wb.weapon, { size: 1.6, sideOrientation: B().Mesh.DOUBLESIDE }, scene);
    plane.material = mat; plane.isPickable = false;
    plane.position.set(wb.x + Math.sin(wb.yaw) * 0.03, wb.y, wb.z + Math.cos(wb.yaw) * 0.03);
    plane.rotation.y = wb.yaw + Math.PI;
    plane.freezeWorldMatrix();
    wallBuyMeshes.push({ mesh: plane, wb, index });
    interactables.push({ kind: 'wallbuy', id: String(index), x: wb.x, y: wb.y, z: wb.z, wb, def, range: 2.8 });
  });

  // ---------------- mystery box + bear ----------------
  const box = buildMysteryBoxMesh(scene, mats);
  box.meshes.forEach(m => { shadowCasters.push(m); m.receiveShadows = true; });
  const bear = buildBearMesh(scene, mats);
  const setBoxLocation = (i) => {
    const loc = world.boxLocations[i];
    box.root.position.set(loc.x, loc.y, loc.z);
    box.root.rotation.y = loc.yaw;
    box.root.setEnabled(true);
  };
  setBoxLocation(0);
  interactables.push({ kind: 'box', id: 'box', get x() { return box.root.position.x; }, get y() { return box.root.position.y + 0.6; }, get z() { return box.root.position.z; }, range: 2.6 });

  // ---------------- outer ruins ----------------
  {
    const winDark = B().MeshBuilder.CreatePlane('owin', { width: 1.2, height: 1.7 }, scene);
    winDark.material = mats.solid('owin_dark', '#0a0c10', { rough: 0.2, metal: 0.4 }); winDark.isVisible = false; winDark.isPickable = false;
    const winLit = B().MeshBuilder.CreatePlane('owinlit', { width: 1.2, height: 1.7 }, scene);
    winLit.material = mats.solid('owin_lit', '#ff8a3a', { emissive: '#ff6a20', emissiveIntensity: 1.6, unlit: true }); winLit.isVisible = false; winLit.isPickable = false;
    for (const o of MAP.outer) {
      const set = textures.get(o.mat);
      const m = boxMesh(scene, o.w, o.h, o.d, set.scale);
      m.position.set(o.x, o.h / 2, o.z); m.material = mats.get(o.mat); m.isPickable = false; m.receiveShadows = true; m.freezeWorldMatrix(); staticMeshes.push(m);
      if (o.windows) {
        // windows on the face pointing toward the map center
        const toC = V3(-o.x, 0, -o.z); const ax = Math.abs(toC.x) > Math.abs(toC.z) ? 'x' : 'z';
        const cols = Math.floor((ax === 'x' ? o.d : o.w) / 2.4), rows = Math.floor(o.h / 3.2);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const lit = o.burning && Math.random() < 0.45;
          const inst = (lit ? winLit : winDark).createInstance('ow');
          const u = (c + 0.5) / cols - 0.5, v = 2.0 + r * 3.2;
          if (ax === 'x') { const sx = Math.sign(toC.x); inst.position.set(o.x + sx * (o.w / 2 + 0.02), v, o.z + u * o.d); inst.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2; }
          else { const sz = Math.sign(toC.z); inst.position.set(o.x + u * o.w, v, o.z + sz * (o.d / 2 + 0.02)); inst.rotation.y = sz > 0 ? Math.PI : 0; }
          inst.isPickable = false; inst.freezeWorldMatrix();
        }
      }
      if (o.burning) effects.fire(o.x + (Math.random() - 0.5) * o.w * 0.5, o.h * 0.75, o.z + (Math.random() - 0.5) * o.d * 0.5, 2.4);
    }
    // wires between poles (thin dark lines)
    const poles = MAP.props.filter(p => p.type === 'pole');
    const wireMat = mats.solid('wire', '#111', { rough: 0.9 });
    for (let i = 0; i < poles.length; i++) for (let j = i + 1; j < poles.length; j++) {
      const a = poles[i], b = poles[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > 26) continue;
      const w = B().MeshBuilder.CreateBox('wire', { width: 0.03, height: 0.03, depth: d }, scene);
      w.position.set((a.x + b.x) / 2, 7.2, (a.z + b.z) / 2);
      w.lookAt(V3(b.x, 7.2, b.z)); w.material = wireMat; w.isPickable = false; w.freezeWorldMatrix(); staticMeshes.push(w);
    }
  }

  // ---------------- shadows + lights ----------------
  if (lighting.shadow) for (const m of shadowCasters) lighting.shadow.addShadowCaster(m, false);
  for (const m of staticMeshes) lighting.assignLights(m, 5);

  return { staticMeshes, shadowCasters, doorMeshes, boards, boardBase, box, setBoxLocation, bear, wallBuyMeshes, interactables, streetLights, propNodes };
}
