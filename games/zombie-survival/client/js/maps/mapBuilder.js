// Builds the visual town from the shared world data: merged static geometry, props, doors, boards,
// mystery box, wall buys, entries, outer ruins, lights and fires.
/* global BABYLON */
import { WEAPONS } from '/shared/weapons.js';
import { buildVehicle, buildStreetlight, buildSmallProp, buildMysteryBoxMesh, buildBearMesh, buildBoardBase } from './props.js';
import { chalkWeaponCanvas, signCanvas, clockCanvas } from './textures.js';

const B = () => BABYLON;
const V3 = (x, y, z) => new (BABYLON.Vector3)(x, y, z);
const CHUNK = 16;
/** Canvas textures are uploaded without a vertical flip (fromCanvas -> update(false)), so text canvases are flipped here. */
function flipCanvas(c) {
  const f = document.createElement('canvas'); f.width = c.width; f.height = c.height;
  const ctx = f.getContext('2d'); ctx.translate(0, c.height); ctx.scale(1, -1); ctx.drawImage(c, 0, 0);
  return f;
}

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
    if (b.invisible || b.door || b.rail) continue; // rails are drawn as posts + bars below
    if (b.kind === 'car' || b.kind === 'van' || b.kind === 'bus' || b.kind === 'streetlight' || b.kind === 'pole' || b.kind === 'barrel' || b.kind === 'hydrant' || b.kind === 'mailbox' || b.kind === 'debris' || b.kind === 'post') continue; // props built separately
    if (b.kind === 'outer' || b.kind === 'machine') continue; // machines are built by machines.js
    const mat = b.mat || 'concrete';
    const set = textures.get(mat);
    const m = boxMeshFor(scene, b, set.scale);
    if (mat === 'glass') { m.material = mats.get('glass'); m.isPickable = false; staticMeshes.push(m); m.freezeWorldMatrix(); continue; }
    if (mat === 'fence' || b.fence) { addToGroup('fence', m, b.cx, b.cz, false); continue; }
    addToGroup(mat, m, b.cx, b.cz, b.kind !== 'floor' || !!b.upper);
  }
  // decorative boxes without collision (cornices, canopies, curtains, ledges ...)
  for (const d of MAP.decor || []) {
    const set = textures.get(d.mat);
    const m = boxMesh(scene, d.w, d.h, d.d, set.scale);
    m.position.set(d.x, d.y + d.h / 2, d.z); m.rotation.y = d.yaw || 0;
    addToGroup(d.mat, m, d.x, d.z, true);
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
  // road markings (data-driven: MAP.markings = { lanes, edges, crosswalks, bays })
  {
    const yellow = mats.solid('paint_yellow', '#b89a3a', { rough: 0.85 });
    const white = mats.solid('paint_white', '#c9c9c0', { rough: 0.85 });
    const MK = MAP.markings || { lanes: [], edges: [], crosswalks: [], bays: [] };
    const strip = (list, cx, cz, w, d) => { const m = B().MeshBuilder.CreateBox('mk', { width: w, height: 0.012, depth: d }, scene); m.position.set(cx, 0.006, cz); list.push(m); };
    const marks = [];
    for (const l of MK.lanes || []) { // double dashed centre line
      for (let s = l.from; s < l.to - 1.5; s += 4) {
        if (l.axis === 'x') { strip(marks, s + 1.1, l.at + 0.12, 2.2, 0.14); strip(marks, s + 1.1, l.at - 0.12, 2.2, 0.14); }
        else { strip(marks, l.at + 0.12, s + 1.1, 0.14, 2.2); strip(marks, l.at - 0.12, s + 1.1, 0.14, 2.2); }
      }
    }
    if (marks.length) { const ym = B().Mesh.MergeMeshes(marks, true, true, undefined, false, false); ym.material = yellow; ym.isPickable = false; ym.receiveShadows = true; staticMeshes.push(ym); ym.freezeWorldMatrix(); }
    const wm = [];
    for (const e of MK.edges || []) { if (e.axis === 'x') strip(wm, (e.from + e.to) / 2, e.at, e.to - e.from, 0.14); else strip(wm, e.at, (e.from + e.to) / 2, 0.14, e.to - e.from); }
    for (const c of MK.crosswalks || []) { // 7 stripes across the road, stripes run along the walking direction
      for (let i = 0; i < 7; i++) { const off = (i - 3) * 0.8; if (c.dir === 'x') strip(wm, c.x + off, c.z, 0.5, 8); else strip(wm, c.x, c.z + off, 8, 0.5); }
    }
    for (const b of MK.bays || []) { const n = b.count; for (let i = 0; i <= n; i++) strip(wm, b.x0 + (b.x1 - b.x0) * i / n, b.z, 0.12, 5); }
    if (wm.length) { const wmm = B().Mesh.MergeMeshes(wm, true, true, undefined, false, false); wmm.material = white; wmm.isPickable = false; wmm.receiveShadows = true; staticMeshes.push(wmm); wmm.freezeWorldMatrix(); }
  }

  // ---------------- railings (posts + two bars; the thin collision box stays invisible) ----------------
  {
    const railMat = 'metal_dark';
    const add = (w, h, d, x, y, z) => { const m = boxMesh(scene, w, h, d, 1); m.position.set(x, y, z); addToGroup(railMat, m, x, z, false); };
    for (const b of world.visuals.rails) {
      const alongX = b.w > b.d;
      const len = alongX ? b.w : b.d, h = b.h;
      const n = Math.max(2, Math.ceil(len / 1.3) + 1);
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + 0.03 + (len - 0.06) * (i / (n - 1));
        add(0.06, h, 0.06, alongX ? b.cx + t : b.cx, b.y0 + h / 2, alongX ? b.cz : b.cz + t);
      }
      for (const yy of [b.y0 + h - 0.03, b.y0 + h * 0.5]) add(alongX ? len : 0.05, 0.05, alongX ? 0.05 : len, b.cx, yy, b.cz);
    }
  }
  // ---------------- stairs: stringers + handrails (visual only) ----------------
  for (const st of world.visuals.stairs) {
    const s = st.def;
    if (s.rails === 'none' && !s.metal) continue;
    const rise = s.y1 - s.y0, L = Math.hypot(s.len, rise);
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw); // forward, right (local +x)
    const mat = s.metal ? 'metal_dark' : (s.mat === 'marble' ? 'metal_dark' : 'wood_dark');
    const sloped = (w, h, x0, y0, z0, x1, y1, z1) => { // box of length |p1-p0| along local z, oriented with lookAt
      const m = boxMesh(scene, w, h, Math.hypot(x1 - x0, y1 - y0, z1 - z0), 1);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.lookAt(V3(x1, y1, z1));
      addToGroup(mat, m, m.position.x, m.position.z, true);
    };
    const sides = s.rails === 'both' ? [-1, 1] : s.rails === 'w' ? [-1] : s.rails === 'e' ? [1] : [];
    for (const side of (s.metal ? [-1, 1] : sides)) { // stringers (metal stairs always get both)
      const ox = rx * side * (s.w / 2 + 0.04), oz = rz * side * (s.w / 2 + 0.04);
      sloped(0.08, 0.34, s.x + ox, s.y0 + 0.05, s.z + oz, s.x + ox + fx * s.len, s.y1 + 0.05, s.z + oz + fz * s.len);
    }
    for (const side of sides) { // handrail posts + sloped bar 1 m above the steps
      const ox = rx * side * (s.w / 2 + 0.06), oz = rz * side * (s.w / 2 + 0.06);
      const n = Math.max(2, Math.round(s.len / 1.2) + 1);
      for (let i = 0; i < n; i++) {
        const a = 0.25 + (s.len - 0.5) * i / (n - 1), y = s.y0 + rise * a / s.len;
        const m = boxMesh(scene, 0.06, 1.0, 0.06, 1); m.position.set(s.x + ox + fx * a, y + 0.5, s.z + oz + fz * a); addToGroup(mat, m, m.position.x, m.position.z, false);
      }
      sloped(0.06, 0.06, s.x + ox + fx * 0.25, s.y0 + rise * 0.25 / s.len + 1.0, s.z + oz + fz * 0.25, s.x + ox + fx * (s.len - 0.25), s.y1 - rise * 0.25 / s.len + 1.0, s.z + oz + fz * (s.len - 0.25));
    }
    void L;
  }
  // ---------------- door frames (jambs + head, inside the opening, 3 cm proud of the wall faces) ----------------
  for (const df of world.visuals.doorFrames) {
    const alongX = Math.abs(df.yaw) < 0.01;
    const mat = df.mat === 'metal_panel' ? 'metal_dark' : 'wood_dark';
    const t = df.t + 0.06;
    const mk = (w, h, d, x, y, z) => { const m = boxMesh(scene, w, h, d, 1.5); m.position.set(x, y, z); addToGroup(mat, m, x, z, true); };
    if (alongX) { mk(0.1, df.h, t, df.x - df.w / 2 + 0.05, df.y + df.h / 2, df.z); mk(0.1, df.h, t, df.x + df.w / 2 - 0.05, df.y + df.h / 2, df.z); mk(df.w, 0.1, t, df.x, df.y + df.h - 0.05, df.z); }
    else { mk(t, df.h, 0.1, df.x, df.y + df.h / 2, df.z - df.w / 2 + 0.05); mk(t, df.h, 0.1, df.x, df.y + df.h / 2, df.z + df.w / 2 - 0.05); mk(t, 0.1, df.w, df.x, df.y + df.h - 0.05, df.z); }
  }
  // ---------------- window frames (inside the opening: no face shares a plane with the wall) ----------------
  for (const wf of world.visuals.windowFrames) {
    const alongX = Math.abs(wf.yaw) < 0.01;
    const mat = wf.glass ? 'metal_dark' : 'wood_dark';
    const t = wf.t + 0.06, jw = wf.glass ? 0.06 : 0.08;
    const mk = (w, h, d, x, y, z) => { const m = boxMesh(scene, w, h, d, 1.5); m.position.set(x, y, z); addToGroup(mat, m, x, z, true); };
    const jambs = (x, z, off) => { if (alongX) mk(jw, wf.h, t, x + off, wf.y + wf.h / 2, z); else mk(t, wf.h, jw, x, wf.y + wf.h / 2, z + off); };
    jambs(wf.x, wf.z, -wf.w / 2 + jw / 2); jambs(wf.x, wf.z, wf.w / 2 - jw / 2);
    if (alongX) { mk(wf.w + 0.16, 0.06, t + 0.1, wf.x, wf.y + 0.03, wf.z); mk(wf.w, 0.06, t, wf.x, wf.y + wf.h - 0.03, wf.z); }
    else { mk(t + 0.1, 0.06, wf.w + 0.16, wf.x, wf.y + 0.03, wf.z); mk(t, 0.06, wf.w, wf.x, wf.y + wf.h - 0.03, wf.z); }
    if (wf.glass) { if (alongX) mk(0.05, wf.h, t - 0.02, wf.x, wf.y + wf.h / 2, wf.z); else mk(t - 0.02, wf.h, 0.05, wf.x, wf.y + wf.h / 2, wf.z); }
  }
  // ---------------- signs (canvas text planes + backing + coloured light) ----------------
  const signLights = [];
  (MAP.signs || []).forEach((sg, i) => {
    const nx = Math.sin(sg.yaw), nz = Math.cos(sg.yaw);
    const tex = textures.fromCanvas('sign_' + i, flipCanvas(signCanvas(sg.text, sg.color, sg)), { clamp: true });
    const mat = mats.decal('sign_' + i, tex, { emissive: sg.painted ? '#6a6a66' : '#ffffff', unlit: !sg.painted });
    mat.backFaceCulling = true; mat.zOffset = 0;
    const plane = B().MeshBuilder.CreatePlane('sign_' + i, { width: sg.w, height: sg.h }, scene);
    plane.material = mat; plane.isPickable = false;
    plane.position.set(sg.x + nx * 0.16, sg.y, sg.z + nz * 0.16); plane.rotation.y = sg.yaw + Math.PI; plane.freezeWorldMatrix(); staticMeshes.push(plane);
    const back = boxMesh(scene, sg.w + 0.24, sg.h + 0.24, 0.12, 1);
    back.position.set(sg.x + nx * 0.08, sg.y, sg.z + nz * 0.08); back.rotation.y = sg.yaw; addToGroup(sg.painted ? 'wood_dark' : 'metal_dark', back, back.position.x, back.position.z, true);
    if (!sg.painted) signLights.push(lighting.addPointLight('sign_' + i, [sg.x + nx * 0.9, sg.y - 0.3, sg.z + nz * 0.9], sg.color, sg.bulbs ? 2.2 : 1.7, sg.bulbs ? 12 : 9, !!sg.neon && !sg.bulbs));
  });

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
    } else if (e.type === 'manhole' && e.def.drop) {
      // collapsed ceiling: ragged dark hole under the slab, hanging planks and a rubble heap on the floor
      const hole = B().MeshBuilder.CreateCylinder('chole', { diameter: 1.4, height: 0.04, tessellation: 9 }, scene);
      hole.position.set(e.inside[0], e.outside[1] + 0.02, e.inside[2]); hole.material = mats.solid('owin_dark', '#0a0c10', { rough: 0.2, metal: 0.4 }); hole.isPickable = false; hole.freezeWorldMatrix(); staticMeshes.push(hole);
      const bits = [];
      let seed = e.inside[0] * 11 + e.inside[2] * 3;
      const r = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let i = 0; i < 3; i++) { const m = B().MeshBuilder.CreateBox('plank', { width: 0.16, height: 1.0 + r() * 0.6, depth: 0.04 }, scene); m.position.set(e.inside[0] + (r() - 0.5) * 0.9, e.outside[1] - 0.45, e.inside[2] + (r() - 0.5) * 0.9); m.rotation.set((r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.5); bits.push(m); }
      const planks = B().Mesh.MergeMeshes(bits, true, true, undefined, false, false); planks.material = mats.get('boards'); planks.isPickable = false; planks.freezeWorldMatrix(); staticMeshes.push(planks); shadowCasters.push(planks);
      const heap = [];
      for (let i = 0; i < 5; i++) { const m = B().MeshBuilder.CreateBox('rb', { width: 0.3 + r() * 0.5, height: 0.12 + r() * 0.2, depth: 0.3 + r() * 0.5 }, scene); m.position.set(e.inside[0] + (r() - 0.5) * 1.2, e.inside[1] + 0.08 + r() * 0.1, e.inside[2] + (r() - 0.5) * 1.2); m.rotation.set(r() * 0.4, r() * 3, r() * 0.4); heap.push(m); }
      const hm = B().Mesh.MergeMeshes(heap, true, true, undefined, false, false); hm.material = mats.get('rubble'); hm.isPickable = false; hm.receiveShadows = true; hm.freezeWorldMatrix(); staticMeshes.push(hm);
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
    const tex = textures.fromCanvas('chalk_' + wb.weapon, flipCanvas(canvas), { clamp: true });
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
      if (o.tower) { // church / clock tower: spire + clock face toward the map centre
        const spire = B().MeshBuilder.CreateCylinder('spire', { diameterTop: 0, diameterBottom: o.w * 0.95, height: o.w * 1.5, tessellation: 4 }, scene);
        spire.position.set(o.x, o.h + o.w * 0.75, o.z); spire.rotation.y = Math.PI / 4; spire.material = mats.get('roof_tar'); spire.isPickable = false; spire.freezeWorldMatrix(); staticMeshes.push(spire);
        const ctex = textures.fromCanvas('clock', clockCanvas(256), { clamp: true });
        const cm = mats.decal('clock', ctex, { emissive: '#b0a890' }); cm.backFaceCulling = true; cm.zOffset = 0;
        const face = B().MeshBuilder.CreatePlane('clock', { size: o.w * 0.55 }, scene);
        const sz = o.z > 0 ? -1 : 1;
        face.position.set(o.x, o.h - o.w * 0.45, o.z + sz * (o.d / 2 + 0.03)); face.rotation.y = sz > 0 ? Math.PI : 0; face.material = cm; face.isPickable = false; face.freezeWorldMatrix(); staticMeshes.push(face);
        lighting.addPointLight('clock', [o.x, o.h - o.w * 0.45, o.z + sz * (o.d / 2 + 1.2)], '#c8b890', 1.2, 10, false);
      }
      if (o.tank) { // water tower: tank on legs
        const tank = B().MeshBuilder.CreateCylinder('tank', { diameter: o.w * 1.6, height: o.w * 1.1, tessellation: 14 }, scene);
        tank.position.set(o.x, o.h + o.w * 0.55, o.z); tank.material = mats.get('metal_rust'); tank.isPickable = false; tank.freezeWorldMatrix(); staticMeshes.push(tank);
        const cap = B().MeshBuilder.CreateCylinder('tankcap', { diameterTop: 0.3, diameterBottom: o.w * 1.7, height: o.w * 0.5, tessellation: 14 }, scene);
        cap.position.set(o.x, o.h + o.w * 1.35, o.z); cap.material = mats.get('metal_dark'); cap.isPickable = false; cap.freezeWorldMatrix(); staticMeshes.push(cap);
      }
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

  return { staticMeshes, shadowCasters, doorMeshes, boards, boardBase, box, setBoxLocation, bear, wallBuyMeshes, interactables, streetLights, signLights, propNodes };
}
