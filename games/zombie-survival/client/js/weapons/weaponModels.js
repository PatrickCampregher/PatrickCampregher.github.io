// Procedural weapon meshes. Barrel points along +Z, grip near the origin, units: meters.
// Every weapon is built from boxes/cylinders/tori merged per material group (<= 6 static meshes) plus a few
// separately animatable parts (mag, bolt/slide/pump/charging handle, cylinder, hinge, cover, round, tube).
//
// buildWeaponModel(scene, mats, def) -> {
//   root, muzzle, eject, sight,     TransformNodes (sight = exact aim point: rear aperture/notch center or scope optical center)
//   mag, bolt,                       animatable meshes (or null)
//   parts: { mag, bolt, cylinder, hinge, cover, round, tube },
//   boltKind: 'slide' | 'recip' | 'fixed' | 'bolt' | 'pump',
//   meshes, def, length, sightPos, adsDist, hip, tris
// }
/* global BABYLON */

const B = () => BABYLON;
const PI = Math.PI;

// ---------------------------------------------------------------------------------------------
// materials (cached by color + params so identical finishes are shared between weapons)
// ---------------------------------------------------------------------------------------------
function weaponMaterials(mats, look, pap) {
  const key = (c, o) => `w_${c}_${o.metal ?? 0}_${o.rough ?? 0}_${o.emissive || ''}_${o.emissiveIntensity || ''}`;
  const solid = (c, o) => mats.solid(key(c, o), c, o);
  if (pap) {
    const g = look.glow || '#b45cff';
    return {
      body: solid('#191323', { metal: 1.0, rough: 0.22, emissive: '#1a0a2a', emissiveIntensity: 0.6 }),
      accent: solid('#221a2e', { metal: 0.85, rough: 0.3, emissive: '#100818', emissiveIntensity: 0.5 }),
      dark: solid('#120d18', { metal: 0.95, rough: 0.35 }),
      metal: solid('#9c86c4', { metal: 1.0, rough: 0.2 }),
      glow: solid(g, { metal: 0, rough: 0.3, emissive: g, emissiveIntensity: 2.6 }),
      glass: solid('#3a2a66', { metal: 0.2, rough: 0.05, emissive: '#22114a' }),
      brass: solid('#c9a24a', { metal: 0.9, rough: 0.3 }),
    };
  }
  const glowC = look.glow || '#c8ff70';
  const bodyOpts = look.finish === 'poly' ? { metal: 0.1, rough: 0.72 } : look.finish === 'stainless' ? { metal: 1.0, rough: 0.28 } : { metal: 0.85, rough: 0.42 };
  const accentOpts = look.wood ? { metal: 0.0, rough: 0.55 } : { metal: 0.15, rough: 0.7 };
  return {
    body: solid(look.color, bodyOpts),
    accent: solid(look.accent, accentOpts),
    dark: solid('#1a1b1e', { metal: 0.9, rough: 0.4 }),
    metal: solid('#8c9095', { metal: 1.0, rough: 0.32 }),
    glow: solid(glowC, { metal: 0, rough: 0.3, emissive: glowC, emissiveIntensity: look.glow ? 2.2 : 1.6 }),
    glass: solid('#2f4f88', { metal: 0.2, rough: 0.05, emissive: '#0d1a33' }),
    brass: solid('#c9a24a', { metal: 0.9, rough: 0.3 }),
  };
}

// ---------------------------------------------------------------------------------------------
// build context: primitive helpers + reusable sub-assemblies
// ---------------------------------------------------------------------------------------------
class Ctx {
  constructor(scene, look) {
    this.scene = scene; this.look = look;
    this.groups = {};            // group name -> meshes
    this.partMat = {};           // dynamic part -> material key
    this.pivots = {};            // dynamic part -> [x,y,z] pivot
    this.tris = 0;
  }
  add(g, m) { (this.groups[g] ||= []).push(m); this.tris += m.getTotalIndices() / 3; m.isPickable = false; return m; }
  box(g, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = B().MeshBuilder.CreateBox('p', { width: w, height: h, depth: d }, this.scene);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    return this.add(g, m);
  }
  cyl(g, r, len, x, y, z, axis = 'z', r2 = null, tess = 12) {
    const m = B().MeshBuilder.CreateCylinder('c', { diameterTop: (r2 ?? r) * 2, diameterBottom: r * 2, height: len, tessellation: tess }, this.scene);
    m.position.set(x, y, z);
    if (axis === 'z') m.rotation.x = PI / 2; else if (axis === 'x') m.rotation.z = PI / 2;
    return this.add(g, m);
  }
  ring(g, r, thick, x, y, z, axis = 'z', tess = 10) {
    const m = B().MeshBuilder.CreateTorus('t', { diameter: r * 2, thickness: thick, tessellation: tess }, this.scene);
    m.position.set(x, y, z);
    if (axis === 'z') m.rotation.x = PI / 2; else if (axis === 'x') m.rotation.z = PI / 2;
    return this.add(g, m);
  }
  sph(g, r, x, y, z, seg = 6) {
    const m = B().MeshBuilder.CreateSphere('s', { diameter: r * 2, segments: seg }, this.scene);
    m.position.set(x, y, z);
    return this.add(g, m);
  }
  // --- sub-assemblies ---
  /** pistol grip with finger grooves, checkering panels and a base plate. rx = rake */
  grip(g, x, y, z, w = 0.03, h = 0.09, d = 0.046, rx = 0.3, grooves = 3) {
    this.box(g, w, h, d, x, y, z, rx);
    this.box('dark', w + 0.002, h * 0.55, d * 0.6, x, y - h * 0.08, z - d * 0.05, rx);
    for (let i = 0; i < grooves; i++) {
      const t = -h * 0.28 + i * (h * 0.22);
      this.box('dark', w * 0.85, 0.004, 0.004, x, y + t * Math.cos(rx), z + d / 2 + t * Math.sin(rx) - 0.0005, rx);
    }
    this.box('dark', w * 0.9, 0.006, d * 0.95, x, y - h / 2 * Math.cos(rx) - 0.002, z - h / 2 * Math.sin(rx), rx);
  }
  /** trigger + guard (dark). z = trigger position, y = guard top */
  trigger(z, y, len = 0.045, h = 0.028) {
    this.box('dark', 0.004, 0.016, 0.004, 0, y - 0.01, z, 0.35);
    this.box('dark', 0.006, h, 0.005, 0, y - h / 2, z + len * 0.45);
    this.box('dark', 0.006, 0.005, len, 0, y - h, z + len * 0.05);
    this.box('dark', 0.006, h * 0.6, 0.005, 0, y - h * 0.7, z - len * 0.35);
  }
  /** picatinny-style rail: base + proud slot ribs. Returns rail top y */
  rail(w, yBase, z0, z1, thick = 0.007, pitch = 0.024, g = 'dark') {
    const len = z1 - z0;
    this.box(g, w, thick, len, 0, yBase + thick / 2, (z0 + z1) / 2);
    const n = Math.max(1, Math.floor(len / pitch));
    for (let i = 0; i < n; i++) this.box(g, w + 0.002, 0.003, pitch * 0.45, 0, yBase + thick + 0.0015, z0 + pitch * 0.5 + i * pitch);
    return yBase + thick + 0.003;
  }
  /** thin front post (3.5 mm); the tip lands exactly at `tip`. opts: wings, hood (ring), dot, base [w,h,d] */
  frontPost(z, yBase, tip, opts = {}) {
    const h = tip - yBase;
    this.box('dark', 0.0035, h, 0.004, 0, yBase + h / 2, z);
    if (opts.dot !== false) this.box('glow', 0.0028, 0.0028, 0.0028, 0, tip - 0.0025, z + 0.0018);
    if (opts.wings) { for (const s of [-1, 1]) this.box('dark', 0.0035, h * 0.95, 0.007, s * 0.0085, yBase + h * 0.95 / 2, z); }
    if (opts.hood) this.ring('dark', 0.0105, 0.0025, 0, yBase + h * 0.55, z, 'z', 10);
    if (opts.base) this.box('dark', opts.base[0], opts.base[1], opts.base[2], 0, yBase - opts.base[1] / 2, z);
    return tip;
  }
  /** rear notch: two ears with an 8 mm gap; sightY = top of the ears (aim point = notch center) */
  rearNotch(z, sightY, baseH = 0.006, dots = true) {
    this.box('dark', 0.02, baseH, 0.005, 0, sightY - 0.006 - baseH / 2, z);
    for (const s of [-1, 1]) {
      this.box('dark', 0.006, 0.006, 0.005, s * 0.007, sightY - 0.003, z);
      if (dots) this.box('glow', 0.0025, 0.0025, 0.002, s * 0.007, sightY - 0.003, z - 0.0025);
    }
  }
  /** rear aperture ring (inner radius >= 8.75 mm) on a thin post. opts: r (center-line radius), drum, base [w,h], dot */
  rearRing(z, sightY, yBase, opts = {}) {
    const r = opts.r || 0.0105;
    this.ring('dark', r, 0.0035, 0, sightY, z, 'z', 10);
    const postTop = sightY - r - 0.001;
    if (postTop > yBase) this.box('dark', 0.004, postTop - yBase, 0.004, 0, (postTop + yBase) / 2, z);
    if (opts.base) this.box('dark', opts.base[0], opts.base[1], 0.02, 0, yBase + opts.base[1] / 2, z);
    if (opts.drum) this.cyl('dark', 0.012, 0.016, 0, sightY - r - 0.0125, z, 'z', null, 12);
    if (opts.dot) for (const s of [-1, 1]) this.box('glow', 0.0025, 0.0025, 0.002, s * (r + 0.002), sightY - 0.006, z - 0.002);
  }
  /** telescopic sight; returns the optical center [y, zOcular] */
  scope(y, z, len, rTube, rObj, rOcu, mountY, opts = {}) {
    const zf = z + len / 2, zr = z - len / 2;
    this.cyl('dark', rTube, len, 0, y, z, 'z', null, 12);
    this.cyl('dark', rObj, 0.05, 0, y, zf + 0.02, 'z', rObj * 0.9, 12);
    this.cyl('dark', rOcu, 0.045, 0, y, zr - 0.018, 'z', rOcu * 0.92, 12);
    this.cyl('glass', rObj * 0.86, 0.004, 0, y, zf + 0.046, 'z', null, 12);
    this.cyl('glass', rOcu * 0.82, 0.004, 0, y, zr - 0.042, 'z', null, 12);
    this.cyl('metal', rTube * 0.75, 0.012, 0, y + rTube + 0.004, z + 0.01, 'y', null, 10);
    this.cyl('metal', rTube * 0.75, 0.012, rTube + 0.004, y, z + 0.01, 'x', null, 10);
    for (const zz of [z - len * 0.28, z + len * 0.28]) {
      this.ring('dark', rTube + 0.0015, 0.005, 0, y, zz, 'z', 10);
      this.box('dark', 0.014, Math.max(0.004, y - rTube - mountY + 0.004), 0.02, 0, (y - rTube + mountY) / 2 - 0.001, zz);
    }
    if (opts.sunshade) this.cyl('dark', rObj * 1.02, 0.03, 0, y, zf + 0.06, 'z', null, 12);
    return [y, zr - 0.044];
  }
  /** curved magazine: stacked boxes following an arc (rz = cant) */
  curvedMag(g, w, d, segLen, n, curve, x, yTop, zTop, rx0 = 0.08, rz = 0, ribs = true) {
    let y = yTop, z = zTop, a = rx0;
    for (let i = 0; i < n; i++) {
      const cy = y - Math.cos(a) * segLen / 2, cz = z + Math.sin(a) * segLen / 2;
      this.box(g, w, segLen + 0.002, d, x, cy, cz, a, 0, rz);
      if (ribs && i > 0) this.box(g, w + 0.002, 0.003, d * 0.9, x, y, z, a, 0, rz);
      y -= Math.cos(a) * segLen; z += Math.sin(a) * segLen; a += curve;
    }
    this.box(g, w + 0.003, 0.007, d + 0.004, x, y + 0.002, z, a - curve, 0, rz);
  }
  /** straight box magazine with a base plate and a witness rib */
  boxMag(g, w, h, d, x, y, z, rx = 0.06) {
    this.box(g, w, h, d, x, y, z, rx);
    this.box(g, w + 0.003, 0.007, d + 0.003, x, y - h / 2 + 0.002, z - Math.sin(rx) * h / 4, rx);
    this.box(g, w + 0.002, h * 0.6, 0.004, x, y, z + d / 2, rx);
  }
  /** fixed stock: body + buttpad + comb */
  stockFixed(g, x, y, z, w, h, len, drop = -0.1, pad = 'dark') {
    this.box(g, w, h, len, x, y, z, drop);
    this.box(pad, w + 0.002, h * 1.35, 0.018, x, y + Math.sin(drop) * len / 2 - 0.004, z - len / 2 * Math.cos(drop) - 0.004, drop);
    this.box(g, w * 0.8, 0.012, len * 0.5, x, y + h / 2 + 0.004, z - len * 0.1, drop);
  }
  /** collapsible AR-style stock on a buffer tube */
  stockCollapsible(x, y, z, len = 0.16) {
    this.cyl('dark', 0.013, len + 0.06, x, y + 0.012, z + 0.02, 'z', null, 10);
    this.box('accent', 0.036, 0.055, len, x, y - 0.005, z - 0.02);
    for (let i = 0; i < 4; i++) this.box('dark', 0.038, 0.004, 0.004, x, y + 0.012, z + 0.06 - i * 0.02);
    this.box('dark', 0.036, 0.075, 0.016, x, y - 0.012, z - len / 2 - 0.02);
    this.ring('metal', 0.014, 0.004, x, y + 0.012, z + len / 2 + 0.04, 'z', 10);
  }
  /** skeleton/tube stock: two rods + buttplate */
  stockTube(x, y, z, len, sep = 0.014, plateH = 0.07) {
    for (const s of [-1, 1]) this.cyl('dark', 0.005, len, x + s * sep, y, z, 'z', null, 8);
    this.box('dark', sep * 2 + 0.012, plateH, 0.016, x, y - 0.01, z - len / 2 - 0.006);
    this.box('dark', sep * 2 + 0.006, 0.02, 0.03, x, y, z + len / 2 - 0.01);
  }
  screws(list, r = 0.0028) { for (const [x, y, z] of list) this.cyl('metal', r, 0.002, x, y, z, 'x', null, 6); }
  /** vent/cooling slots on both sides of a handguard */
  vents(y, z0, z1, n, x, h = 0.006, len = 0.018) {
    for (let i = 0; i < n; i++) { const z = z0 + (z1 - z0) * (i + 0.5) / n; for (const s of [-1, 1]) this.box('dark', 0.002, h, len, s * x, y, z); }
  }
  ejectPort(x, y, z, h = 0.012, len = 0.03) { this.box('dark', 0.003, h, len, x, y, z); }
  /** Pack-a-Punch etched glowing lines along an edge pair + diagonal ticks */
  etch(y, z0, z1, halfW, ticks = 4) {
    for (const s of [-1, 1]) this.box('glow', 0.0016, 0.0016, z1 - z0, s * halfW, y, (z0 + z1) / 2);
    for (let i = 0; i < ticks; i++) { const z = z0 + (z1 - z0) * (i + 0.5) / ticks; for (const s of [-1, 1]) this.box('glow', 0.0016, 0.008, 0.0016, s * halfW, y - 0.006, z, 0, 0, s * 0.5); }
  }
}

// ---------------------------------------------------------------------------------------------
// per-type builders. Each returns { muzzle, eject, sight, adsDist, hip, boltKind }
// ---------------------------------------------------------------------------------------------
const BUILD = {
  pistol(c, look, pap) {
    const st = look.style || 'poly';
    const frameG = st === '1911' ? 'body' : 'accent';
    const slideLen = st === 'machine' ? 0.2 : 0.19, slideZ = 0.075;
    c.box(frameG, 0.028, 0.03, 0.16, 0, 0.033, 0.06);                                      // frame
    c.box('dark', 0.02, 0.006, 0.05, 0, 0.016, 0.11);                                        // under-rail
    if (st !== '1911') for (let i = 0; i < 3; i++) c.box('dark', 0.022, 0.003, 0.004, 0, 0.012, 0.095 + i * 0.012);
    // slide (animatable) with a beveled top strip, serrations, ejection port; the rear sight rides on it
    c.partMat.bolt = 'body';
    c.box('bolt', 0.03, 0.03, slideLen, 0, 0.065, slideZ);
    c.box('bolt', 0.024, 0.006, slideLen - 0.01, 0, 0.083, slideZ);
    for (let i = 0; i < 5; i++) c.box('bolt', 0.032, 0.02, 0.002, 0, 0.064, -0.008 + i * 0.006);
    if (st === 'machine' || st === 'burst') for (let i = 0; i < 4; i++) c.box('bolt', 0.032, 0.02, 0.002, 0, 0.064, 0.12 + i * 0.006);
    c.box('bolt', 0.003, 0.012, 0.03, 0.0155, 0.07, 0.055);
    if (st === '1911') { c.box('bolt', 0.006, 0.012, 0.008, 0, 0.076, -0.024, -0.6); c.box('bolt', 0.004, 0.006, 0.006, 0, 0.083, -0.03, -0.6); }
    const sightY = 0.095;
    const darkSave = c.groups.dark || [];
    c.groups.dark = [];
    c.rearNotch(-0.006, sightY);
    c.frontPost(0.158, 0.086, sightY);
    for (const m of c.groups.dark) (c.groups.bolt ||= []).push(m);     // sights travel with the slide
    c.groups.dark = darkSave;
    c.cyl('dark', 0.0065, 0.03, 0, 0.065, slideZ + slideLen / 2 - 0.004, 'z', null, 10);    // barrel at the muzzle
    c.ring('metal', 0.0085, 0.003, 0, 0.065, slideZ + slideLen / 2 + 0.001, 'z', 8);          // bushing
    c.grip('accent', 0, -0.015, -0.005, st === '1911' ? 0.03 : 0.029, 0.088, 0.045, 0.22, 3);
    if (st === '1911') { c.box('dark', 0.006, 0.01, 0.02, 0, 0.044, -0.03, -0.3); c.screws([[0.016, -0.005, -0.008], [-0.016, -0.005, -0.008], [0.016, -0.03, -0.012], [-0.016, -0.03, -0.012]]); }
    c.partMat.mag = 'dark';
    const magExtra = st === 'machine' ? 0.055 : st === 'burst' ? 0.03 : 0;
    c.box('mag', 0.022, 0.09 + magExtra, 0.032, 0, -0.022 - magExtra / 2 * Math.cos(0.22), -0.004 - magExtra / 2 * Math.sin(0.22) * 0.5, 0.22);
    c.box('mag', 0.027, 0.008, 0.042, 0, -0.064 - magExtra * Math.cos(0.22), -0.014 - magExtra * Math.sin(0.22) * 0.5, 0.22);
    if (magExtra) for (let i = 0; i < 3; i++) c.box('mag', 0.024, 0.003, 0.03, 0, -0.07 - i * 0.014, -0.016 - i * 0.003, 0.22);
    c.trigger(0.02, 0.018, 0.04, 0.026);
    c.box('dark', 0.004, 0.006, 0.02, -0.017, 0.05, 0.02); c.cyl('metal', 0.004, 0.003, -0.016, 0.03, 0.0, 'x', null, 6);
    let muzzleZ = slideZ + slideLen / 2 + 0.002;
    if (st === 'machine') {
      c.box('dark', 0.03, 0.028, 0.03, 0, 0.065, muzzleZ + 0.014); for (let i = 0; i < 2; i++) c.box('metal', 0.02, 0.004, 0.006, 0, 0.081, muzzleZ + 0.006 + i * 0.012); muzzleZ += 0.03;
      c.box('dark', 0.03, 0.03, 0.02, 0, 0.032, 0.14, 0.4);
    } else if (st === 'burst') {
      c.cyl('metal', 0.0095, 0.03, 0, 0.065, muzzleZ + 0.014, 'z', null, 8); for (let i = 0; i < 3; i++) c.box('dark', 0.006, 0.004, 0.004, 0, 0.075, muzzleZ + 0.004 + i * 0.008); muzzleZ += 0.03;
      c.box('dark', 0.004, 0.01, 0.014, -0.017, 0.072, -0.012, 0, 0, 0.3);
      c.box('accent', 0.02, 0.045, 0.018, 0, 0.0, 0.115, 0.25);
    }
    if (pap) c.etch(0.078, -0.01, 0.15, 0.0155, 3);
    return { muzzle: [0, 0.065, muzzleZ], eject: [0.02, 0.075, 0.055], sight: [0, sightY, -0.006], adsDist: 0.28, hip: [0.16, -0.17, 0.3], boltKind: 'slide' };
  },

  revolver(c, look, pap) {
    const judge = look.style === 'judge';
    const cylR = judge ? 0.024 : 0.02, cylLen = judge ? 0.056 : 0.042, cylZ = 0.035, cylY = 0.052;
    c.box('body', 0.03, 0.05, 0.09, 0, 0.05, 0.025);
    c.box('body', 0.026, 0.008, 0.11, 0, 0.081, 0.03);
    c.box('body', 0.03, 0.03, 0.03, 0, 0.03, 0.06);
    c.partMat.cylinder = 'metal'; c.pivots.cylinder = [-0.016, 0.034, cylZ];
    c.cyl('cylinder', cylR, cylLen, 0, cylY, cylZ, 'z', null, 12);
    const chambers = judge ? 5 : 6;
    for (let i = 0; i < chambers; i++) { const a = i / chambers * PI * 2; c.box('cylinder', 0.006, 0.004, cylLen * 0.8, Math.cos(a) * cylR * 0.98, cylY + Math.sin(a) * cylR * 0.98, cylZ, 0, 0, a); }
    c.cyl('cylinder', 0.006, cylLen + 0.02, 0, cylY, cylZ, 'z', null, 6);
    const bLen = judge ? 0.13 : 0.19, bZ = cylZ + cylLen / 2 + bLen / 2 + 0.004;
    c.cyl('body', 0.011, bLen, 0, 0.068, bZ, 'z', null, 12);
    c.box('body', 0.014, 0.02, bLen - 0.01, 0, 0.049, bZ);
    c.box('dark', 0.009, 0.006, bLen - 0.02, 0, 0.081, bZ);
    c.cyl('dark', 0.0055, 0.01, 0, 0.068, bZ + bLen / 2, 'z', null, 8);
    const sightY = 0.093;
    c.frontPost(bZ + bLen / 2 - 0.01, 0.084, sightY, { dot: true });
    c.rearNotch(-0.012, sightY);
    c.box('dark', 0.007, 0.016, 0.01, 0, 0.082, -0.026, -0.55); c.box('dark', 0.005, 0.006, 0.008, 0, 0.09, -0.032, -0.55);
    c.trigger(0.02, 0.026, 0.04, 0.03);
    c.grip('accent', 0, -0.018, -0.02, 0.028, 0.082, 0.04, judge ? 0.3 : 0.4, judge ? 4 : 2);
    c.screws([[0.016, -0.02, -0.02], [-0.016, -0.02, -0.02]], 0.004);
    if (judge) { c.box('glow', 0.004, 0.004, 0.006, 0, sightY - 0.003, bZ + bLen / 2 - 0.01); c.box('dark', 0.032, 0.02, 0.02, 0, 0.03, -0.005); }
    if (pap) c.etch(0.084, 0.0, bZ + bLen / 2 - 0.02, 0.008, 3);
    return { muzzle: [0, 0.068, bZ + bLen / 2 + 0.005], eject: [0.02, 0.06, 0.02], sight: [0, sightY, -0.012], adsDist: 0.28, hip: [0.16, -0.17, 0.3], boltKind: 'fixed' };
  },

  smg(c, look, pap) {
    const st = look.style || 'box';
    let sightY, sightZ, muzzle, eject = [0.028, 0.075, 0.1], boltKind = 'recip';
    if (st === 'mp') {
      c.box('body', 0.04, 0.046, 0.24, 0, 0.06, 0.07);
      c.cyl('body', 0.02, 0.24, 0, 0.078, 0.07, 'z', null, 12);
      c.box('dark', 0.036, 0.048, 0.1, 0, 0.022, 0.0);
      c.box('accent', 0.034, 0.042, 0.13, 0, 0.058, 0.245);
      c.box('accent', 0.03, 0.036, 0.06, 0, 0.056, 0.33);
      c.vents(0.06, 0.2, 0.3, 3, 0.0175, 0.008, 0.02);
      c.cyl('dark', 0.011, 0.2, 0, 0.098, 0.2, 'z', null, 10);
      c.partMat.bolt = 'metal'; c.box('bolt', 0.026, 0.01, 0.018, -0.018, 0.098, 0.16, 0, 0, 0.5);
      c.cyl('dark', 0.0085, 0.07, 0, 0.078, 0.35, 'z', null, 10);
      c.ring('metal', 0.011, 0.003, 0, 0.078, 0.385, 'z', 8); c.ring('metal', 0.011, 0.003, 0, 0.078, 0.375, 'z', 8);
      sightY = 0.122; sightZ = -0.035;
      c.frontPost(0.31, 0.098, sightY, { hood: true, base: [0.012, 0.01, 0.014] });
      c.rearRing(sightZ, sightY, 0.098, { drum: true, dot: true });
      c.curvedMag('mag', 0.024, 0.034, 0.03, 5, 0.09, 0, 0.0, 0.105, 0.05); c.partMat.mag = 'dark';
      c.box('dark', 0.032, 0.03, 0.04, 0, 0.0, 0.105);
      c.grip('accent', 0, -0.01, -0.01, 0.03, 0.09, 0.046, 0.3, 3);
      c.trigger(0.03, 0.005, 0.045, 0.028);
      c.box('dark', 0.004, 0.012, 0.03, -0.019, 0.04, -0.01, 0, 0, 0.4);
      c.stockTube(0, 0.06, -0.16, 0.2, 0.014, 0.075);
      c.screws([[0.021, 0.075, 0.15], [0.021, 0.06, -0.02], [-0.021, 0.06, -0.02], [0.021, 0.045, 0.03]]);
      c.ejectPort(0.0205, 0.075, 0.09, 0.012, 0.03);
      muzzle = [0, 0.078, 0.39];
      if (pap) c.etch(0.099, -0.02, 0.17, 0.02, 4);
      eject = [0.028, 0.08, 0.09];
    } else if (st === 'pdw') {
      c.box('body', 0.04, 0.05, 0.2, 0, 0.065, 0.06);
      c.box('accent', 0.038, 0.03, 0.14, 0, 0.032, 0.09);
      c.box('dark', 0.036, 0.02, 0.04, 0, 0.11, 0.2);
      const railTop = c.rail(0.022, 0.09, -0.04, 0.16, 0.006, 0.02);
      c.cyl('dark', 0.0075, 0.06, 0, 0.073, 0.19, 'z', null, 10); c.cyl('metal', 0.009, 0.02, 0, 0.073, 0.225, 'z', null, 8);
      c.partMat.bolt = 'dark'; c.box('bolt', 0.03, 0.012, 0.02, 0, 0.078, -0.05); c.box('bolt', 0.01, 0.012, 0.02, 0, 0.078, -0.036);
      sightY = 0.118; sightZ = -0.03;
      c.frontPost(0.15, railTop, sightY, { wings: true, base: [0.014, 0.006, 0.012] });
      c.rearRing(sightZ, sightY, railTop, { r: 0.0105, dot: true });
      c.grip('accent', 0, -0.005, -0.005, 0.032, 0.085, 0.05, 0.22, 3);
      c.partMat.mag = 'dark'; c.box('mag', 0.024, 0.13, 0.036, 0, -0.03, -0.012, 0.22); c.box('mag', 0.028, 0.007, 0.042, 0, -0.092, -0.026, 0.22);
      c.box('accent', 0.02, 0.05, 0.02, 0, 0.005, 0.14, 0.35);
      c.trigger(0.04, 0.014, 0.04, 0.026);
      c.stockTube(0, 0.062, -0.13, 0.15, 0.012, 0.06);
      for (const s of [-1, 1]) c.box('dark', 0.006, 0.014, 0.08, s * 0.023, 0.06, 0.1);
      c.ejectPort(0.0205, 0.068, 0.04, 0.012, 0.03);
      muzzle = [0, 0.073, 0.236];
      if (pap) c.etch(0.09, -0.02, 0.15, 0.021, 3);
      eject = [0.026, 0.07, 0.04];
      boltKind = 'fixed';
    } else if (st === 'helical') {
      c.box('body', 0.042, 0.052, 0.26, 0, 0.065, 0.08);
      c.box('dark', 0.036, 0.03, 0.12, 0, 0.028, 0.0);
      c.box('accent', 0.04, 0.03, 0.1, 0, 0.07, 0.26);
      const railTop = c.rail(0.022, 0.091, -0.03, 0.2, 0.007, 0.024);
      c.partMat.tube = 'dark'; c.pivots.tube = [0, 0.03, 0.2];
      c.cyl('tube', 0.021, 0.24, 0, 0.03, 0.2, 'z', null, 12);
      for (let i = 0; i < 3; i++) c.ring('tube', 0.0215, 0.003, 0, 0.03, 0.11 + i * 0.08, 'z', 8);
      c.cyl('tube', 0.008, 0.02, 0, 0.03, 0.33, 'z', null, 8);
      c.box('dark', 0.02, 0.03, 0.05, 0, 0.005, 0.08);
      c.cyl('dark', 0.008, 0.09, 0, 0.077, 0.34, 'z', null, 10); c.cyl('metal', 0.0105, 0.03, 0, 0.077, 0.38, 'z', null, 8);
      c.partMat.bolt = 'metal'; c.box('bolt', 0.016, 0.012, 0.028, 0.026, 0.078, 0.1);
      sightY = 0.12; sightZ = -0.03;
      c.frontPost(0.3, 0.085, sightY, { wings: true, base: [0.014, 0.01, 0.012] });
      c.rearRing(sightZ, sightY, railTop, { dot: true });
      c.grip('accent', 0, -0.01, -0.02, 0.03, 0.09, 0.046, 0.3, 3);
      c.trigger(0.03, 0.01, 0.045, 0.028);
      c.stockFixed('accent', 0, 0.05, -0.2, 0.034, 0.05, 0.22, -0.06);
      c.ejectPort(0.0215, 0.07, 0.06, 0.012, 0.03);
      c.screws([[0.022, 0.06, -0.03], [-0.022, 0.06, -0.03], [0.022, 0.06, 0.16]]);
      muzzle = [0, 0.077, 0.4];
      if (pap) c.etch(0.092, -0.03, 0.2, 0.022, 4);
      eject = [0.028, 0.075, 0.06];
    } else {
      c.box('body', 0.044, 0.056, 0.26, 0, 0.062, 0.09);
      c.box('accent', 0.04, 0.036, 0.2, 0, 0.03, 0.07);
      const railTop = c.rail(0.022, 0.09, -0.02, 0.2, 0.007, 0.024);
      c.box('dark', 0.03, 0.03, 0.09, 0, 0.076, 0.255);
      c.vents(0.076, 0.22, 0.29, 3, 0.016, 0.008, 0.016);
      c.cyl('dark', 0.0085, 0.11, 0, 0.076, 0.31, 'z', null, 10); c.cyl('metal', 0.011, 0.03, 0, 0.076, 0.355, 'z', null, 8);
      c.partMat.mag = 'dark'; c.boxMag('mag', 0.026, 0.15, 0.036, 0, -0.04, 0.1, 0.1);
      c.box('dark', 0.034, 0.03, 0.046, 0, 0.005, 0.1);
      c.grip('accent', 0, -0.01, -0.01, 0.03, 0.09, 0.046, 0.3, 3);
      c.trigger(0.035, 0.012, 0.045, 0.028);
      c.partMat.bolt = 'metal'; c.box('bolt', 0.024, 0.012, 0.02, -0.02, 0.085, 0.13, 0, 0, 0.6);
      sightY = 0.12; sightZ = -0.01;
      c.frontPost(0.2, railTop, sightY, { wings: true, base: [0.014, 0.006, 0.012] });
      c.rearRing(sightZ, sightY, railTop, { dot: true });
      c.stockTube(0, 0.06, -0.14, 0.18, 0.014, 0.07);
      c.ejectPort(0.0225, 0.07, 0.1, 0.012, 0.032);
      c.screws([[0.023, 0.05, -0.03], [-0.023, 0.05, -0.03], [0.023, 0.05, 0.19]]);
      muzzle = [0, 0.076, 0.37];
      if (pap) c.etch(0.091, -0.02, 0.2, 0.023, 4);
    }
    return { muzzle, eject, sight: [0, sightY, sightZ], adsDist: 0.29, hip: [0.15, -0.17, 0.26], boltKind };
  },

  rifle(c, look, pap) {
    const st = look.style || 'ar';
    let sightY = 0.13, sightZ = -0.07, muzzle, eject = [0.03, 0.08, 0.02], boltKind = 'recip';
    if (st === 'ak') {
      c.box('body', 0.044, 0.046, 0.22, 0, 0.06, 0.0);
      c.cyl('body', 0.02, 0.2, 0, 0.083, -0.01, 'z', null, 12);
      c.box('body', 0.04, 0.02, 0.2, 0, 0.083, -0.01);
      c.box('dark', 0.046, 0.04, 0.05, 0, 0.015, 0.06);
      c.box('accent', 0.042, 0.03, 0.15, 0, 0.05, 0.215);
      c.box('accent', 0.036, 0.024, 0.13, 0, 0.098, 0.22);
      c.vents(0.05, 0.16, 0.27, 4, 0.0215, 0.01, 0.016);
      c.cyl('dark', 0.008, 0.18, 0, 0.088, 0.33, 'z', null, 10);
      c.box('dark', 0.022, 0.03, 0.03, 0, 0.088, 0.4);
      c.cyl('dark', 0.008, 0.28, 0, 0.072, 0.44, 'z', null, 10);
      c.box('metal', 0.016, 0.016, 0.03, 0, 0.072, 0.585, 0, 0.35, 0);
      sightY = 0.117; sightZ = 0.1;
      c.frontPost(0.5, 0.09, sightY, { wings: true, base: [0.016, 0.016, 0.02] });
      c.box('dark', 0.02, 0.014, 0.03, 0, 0.096, 0.1);
      c.rearNotch(sightZ, sightY, 0.005);
      c.curvedMag('mag', 0.026, 0.06, 0.04, 5, 0.16, 0, 0.0, 0.06, 0.12); c.partMat.mag = 'dark';
      c.grip('accent', 0, -0.01, -0.06, 0.03, 0.09, 0.046, 0.3, 2);
      c.trigger(-0.02, 0.006, 0.05, 0.03);
      c.partMat.bolt = 'metal'; c.box('bolt', 0.018, 0.012, 0.03, 0.03, 0.088, 0.02);
      c.box('dark', 0.003, 0.012, 0.09, 0.023, 0.06, -0.03);
      c.stockFixed('accent', 0, 0.05, -0.23, 0.036, 0.05, 0.24, -0.08, 'dark');
      c.screws([[0.023, 0.05, -0.08], [0.023, 0.05, 0.02], [-0.023, 0.05, -0.08], [-0.023, 0.05, 0.02], [0.023, 0.07, 0.08], [-0.023, 0.07, 0.08]]);
      c.ejectPort(0.0225, 0.075, 0.03, 0.014, 0.036);
      muzzle = [0, 0.072, 0.6];
      if (pap) c.etch(0.104, -0.1, 0.09, 0.02, 4);
      eject = [0.03, 0.08, 0.03];
    } else if (st === 'galil') {
      c.box('body', 0.045, 0.055, 0.24, 0, 0.065, 0.0);
      for (const s of [-1, 1]) c.box('dark', 0.002, 0.008, 0.16, s * 0.0235, 0.075, 0.0);
      c.box('dark', 0.046, 0.04, 0.05, 0, 0.02, 0.06);
      c.box('accent', 0.042, 0.044, 0.16, 0, 0.068, 0.24);
      for (let i = 0; i < 5; i++) c.box('dark', 0.044, 0.003, 0.004, 0, 0.068, 0.18 + i * 0.03);
      c.cyl('dark', 0.008, 0.16, 0, 0.09, 0.34, 'z', null, 10);
      c.cyl('dark', 0.008, 0.26, 0, 0.075, 0.45, 'z', null, 10);
      c.cyl('metal', 0.011, 0.05, 0, 0.075, 0.55, 'z', null, 8); for (let i = 0; i < 3; i++) c.box('dark', 0.004, 0.006, 0.03, 0.009 * Math.cos(i * 2.1), 0.075 + 0.009 * Math.sin(i * 2.1), 0.55);
      sightY = 0.126; sightZ = -0.095;
      c.frontPost(0.45, 0.09, sightY, { hood: true, base: [0.014, 0.014, 0.02] });
      c.rearRing(sightZ, sightY, 0.0925, { dot: true, base: [0.02, 0.006] });
      c.box('dark', 0.004, 0.02, 0.12, -0.009, 0.115, 0.06); c.box('dark', 0.004, 0.02, 0.12, 0.009, 0.115, 0.06); c.box('dark', 0.022, 0.006, 0.12, 0, 0.128, 0.06);
      c.curvedMag('mag', 0.026, 0.06, 0.04, 5, 0.1, 0, 0.0, 0.06, 0.1); c.partMat.mag = 'dark';
      c.grip('accent', 0, -0.01, -0.06, 0.03, 0.09, 0.046, 0.3, 3);
      c.trigger(-0.02, 0.006, 0.05, 0.03);
      c.partMat.bolt = 'metal'; c.box('bolt', 0.014, 0.012, 0.03, 0.03, 0.092, 0.02);
      c.stockTube(0, 0.06, -0.24, 0.24, 0.015, 0.075);
      for (const s of [-1, 1]) c.box('dark', 0.005, 0.005, 0.14, s * 0.012, 0.04, 0.26);
      c.ejectPort(0.0225, 0.08, 0.02, 0.014, 0.036);
      c.screws([[0.023, 0.06, -0.09], [0.023, 0.06, 0.09], [-0.023, 0.06, -0.09]]);
      muzzle = [0, 0.075, 0.58];
      if (pap) c.etch(0.093, -0.1, 0.1, 0.0225, 4);
    } else if (st === 'hb') {
      c.box('body', 0.046, 0.05, 0.24, 0, 0.065, 0.0);
      c.box('body', 0.04, 0.016, 0.22, 0, 0.098, 0.0);
      c.box('dark', 0.048, 0.04, 0.05, 0, 0.02, 0.06);
      c.box('accent', 0.046, 0.05, 0.18, 0, 0.068, 0.25);
      c.box('dark', 0.03, 0.02, 0.2, 0, 0.1, 0.25);
      c.vents(0.068, 0.18, 0.32, 5, 0.0235, 0.008, 0.018);
      c.cyl('dark', 0.0085, 0.22, 0, 0.078, 0.44, 'z', null, 10);
      c.box('metal', 0.02, 0.02, 0.07, 0, 0.078, 0.585); for (let i = 0; i < 4; i++) for (const s of [-1, 1]) c.box('dark', 0.004, 0.012, 0.006, s * 0.01, 0.078, 0.56 + i * 0.014);
      sightY = 0.126; sightZ = -0.1;
      c.frontPost(0.4, 0.088, sightY, { hood: true, base: [0.016, 0.012, 0.02] });
      c.rearRing(sightZ, sightY, 0.106, { dot: true, base: [0.02, 0.005] });
      c.curvedMag('mag', 0.026, 0.06, 0.04, 5, 0.1, 0, 0.0, 0.06, 0.1, 0.16); c.partMat.mag = 'dark';
      c.grip('accent', 0, -0.01, -0.06, 0.03, 0.09, 0.046, 0.3, 3);
      c.trigger(-0.02, 0.006, 0.05, 0.03);
      c.partMat.bolt = 'metal'; c.box('bolt', 0.016, 0.012, 0.03, 0.03, 0.085, 0.02);
      c.box('accent', 0.036, 0.055, 0.2, 0, 0.06, -0.23); c.box('dark', 0.038, 0.07, 0.016, 0, 0.055, -0.335);
      c.box('dark', 0.006, 0.02, 0.03, -0.021, 0.06, -0.11);
      c.ejectPort(0.0235, 0.078, 0.02, 0.014, 0.036);
      c.screws([[0.024, 0.06, -0.09], [0.024, 0.06, 0.08], [-0.024, 0.06, -0.09], [-0.024, 0.06, 0.08]]);
      muzzle = [0, 0.078, 0.62];
      if (pap) c.etch(0.107, -0.11, 0.11, 0.02, 4);
    } else if (st === 'battle') {
      c.box('body', 0.046, 0.058, 0.24, 0, 0.065, 0.0);
      c.box('dark', 0.046, 0.04, 0.05, 0, 0.02, 0.05);
      c.box('accent', 0.044, 0.05, 0.22, 0, 0.066, 0.26);
      c.vents(0.066, 0.18, 0.34, 5, 0.0225, 0.01, 0.018);
      c.cyl('dark', 0.009, 0.24, 0, 0.088, 0.35, 'z', null, 10);
      c.cyl('dark', 0.0085, 0.34, 0, 0.075, 0.53, 'z', null, 10);
      c.cyl('metal', 0.011, 0.05, 0, 0.075, 0.71, 'z', null, 8); for (let i = 0; i < 3; i++) c.box('dark', 0.004, 0.006, 0.03, 0.009 * Math.cos(i * 2.1), 0.075 + 0.009 * Math.sin(i * 2.1), 0.71);
      sightY = 0.128; sightZ = -0.095;
      c.frontPost(0.55, 0.09, sightY, { hood: true, base: [0.016, 0.014, 0.02] });
      c.rearRing(sightZ, sightY, 0.094, { dot: true, base: [0.02, 0.006] });
      c.partMat.mag = 'dark'; c.boxMag('mag', 0.026, 0.13, 0.062, 0, -0.03, 0.05, 0.06);
      c.grip('accent', 0, -0.01, -0.06, 0.03, 0.09, 0.046, 0.3, 3);
      c.trigger(-0.02, 0.006, 0.05, 0.03);
      c.partMat.bolt = 'metal'; c.box('bolt', 0.024, 0.014, 0.02, -0.03, 0.085, 0.06); c.box('bolt', 0.01, 0.01, 0.03, -0.024, 0.085, 0.06);
      c.stockFixed('accent', 0, 0.055, -0.24, 0.036, 0.055, 0.26, -0.05, 'dark');
      c.ejectPort(0.0235, 0.08, 0.02, 0.014, 0.036);
      c.screws([[0.024, 0.06, -0.09], [0.024, 0.06, 0.08], [-0.024, 0.06, -0.09], [-0.024, 0.06, 0.08]]);
      muzzle = [0, 0.075, 0.74];
      if (pap) c.etch(0.095, -0.11, 0.1, 0.0235, 4);
    } else {
      const carry = st === 'carry';
      c.box('body', 0.048, 0.045, 0.2, 0, 0.075, 0.02);
      c.box('body', 0.048, 0.04, 0.16, 0, 0.04, -0.01);
      c.box('dark', 0.05, 0.05, 0.045, 0, 0.02, 0.06);
      c.box('accent', 0.044, 0.046, 0.22, 0, 0.072, 0.26);
      c.vents(0.072, 0.17, 0.35, 6, 0.0225, 0.007, 0.02);
      c.cyl('dark', 0.0085, 0.24, 0, 0.075, 0.49, 'z', null, 10);
      c.box('dark', 0.02, 0.03, 0.025, 0, 0.082, 0.42);
      c.cyl('dark', 0.006, 0.12, 0, 0.09, 0.36, 'z', null, 8);
      c.cyl('metal', 0.012, 0.04, 0, 0.075, 0.6, 'z', null, 8); for (let i = 0; i < 3; i++) c.box('dark', 0.004, 0.006, 0.02, 0.01 * Math.cos(i * 2.1), 0.075 + 0.01 * Math.sin(i * 2.1), 0.6);
      c.partMat.bolt = 'dark'; c.box('bolt', 0.03, 0.01, 0.03, 0, 0.092, -0.09); c.box('bolt', 0.012, 0.012, 0.02, 0, 0.092, -0.07);
      c.cyl('metal', 0.006, 0.012, 0.027, 0.078, -0.03, 'x', null, 6);
      c.box('dark', 0.006, 0.02, 0.016, 0.027, 0.08, 0.0);
      c.ejectPort(0.0245, 0.078, 0.02, 0.016, 0.04);
      c.box('dark', 0.003, 0.012, 0.03, -0.0245, 0.07, 0.03);
      c.box('dark', 0.003, 0.01, 0.02, -0.0245, 0.062, -0.03, 0, 0, 0.5);
      c.curvedMag('mag', 0.026, 0.06, 0.038, 4, 0.1, 0, 0.0, 0.06, 0.08); c.partMat.mag = 'dark';
      c.grip('accent', 0, -0.01, -0.06, 0.03, 0.09, 0.046, 0.32, 3);
      c.trigger(-0.02, 0.006, 0.05, 0.03);
      if (carry) {
        sightY = 0.126; sightZ = -0.1;
        for (const s of [-1, 1]) c.box('dark', 0.004, 0.026, 0.15, s * 0.0145, 0.116, -0.03);
        c.box('dark', 0.033, 0.006, 0.15, 0, 0.132, -0.03);
        c.ring('dark', 0.0105, 0.003, 0, sightY, sightZ, 'z', 10);
        c.box('dark', 0.004, 0.01, 0.004, 0, 0.105, sightZ);
        c.frontPost(0.42, 0.097, sightY, { wings: true, base: [0.02, 0.015, 0.02] });
        c.stockFixed('accent', 0, 0.06, -0.24, 0.036, 0.06, 0.26, -0.03, 'dark');
      } else {
        const railTop = c.rail(0.022, 0.0975, -0.08, 0.12, 0.007, 0.024);
        sightY = 0.13; sightZ = -0.07;
        c.rearRing(sightZ, sightY, railTop, { dot: true, base: [0.02, 0.005] });
        c.frontPost(0.42, 0.097, sightY, { wings: true, base: [0.014, 0.008, 0.016] });
        c.stockCollapsible(0, 0.06, -0.25, 0.16);
      }
      c.screws([[0.024, 0.04, -0.06], [-0.024, 0.04, -0.06], [0.024, 0.04, 0.02], [-0.024, 0.04, 0.02]]);
      muzzle = [0, 0.075, 0.62];
      if (pap) c.etch(0.098, -0.08, 0.12, 0.0245, 4);
      boltKind = 'fixed';
    }
    return { muzzle, eject, sight: [0, sightY, sightZ], adsDist: 0.3, hip: [0.14, -0.18, 0.2], boltKind };
  },

  shotgun(c, look, pap) {
    const st = look.style || 'pump';
    let sightY, sightZ, muzzle, eject = [0.03, 0.06, 0.0], boltKind = 'pump';
    if (st === 'double') {
      c.box('body', 0.04, 0.05, 0.1, 0, 0.062, -0.02);
      c.box('metal', 0.008, 0.006, 0.03, 0, 0.09, -0.04);
      for (const s of [-1, 1]) c.box('dark', 0.006, 0.014, 0.01, s * 0.01, 0.088, -0.06, -0.5);
      for (const s of [-1, 1]) c.box('dark', 0.002, 0.03, 0.06, s * 0.0205, 0.06, -0.02);
      c.partMat.hinge = 'dark'; c.pivots.hinge = [0, 0.05, 0.03];
      for (const s of [-1, 1]) c.cyl('hinge', 0.011, 0.5, s * 0.012, 0.075, 0.28, 'z', null, 12);
      c.box('hinge', 0.006, 0.006, 0.48, 0, 0.088, 0.28);
      c.box('hinge', 0.034, 0.03, 0.15, 0, 0.052, 0.19);
      c.box('hinge', 0.04, 0.04, 0.03, 0, 0.062, 0.045);
      sightY = 0.094; sightZ = 0.04;
      c.box('glow', 0.003, 0.003, 0.003, 0, sightY - 0.0025, 0.52);
      c.box('dark', 0.006, 0.003, 0.006, 0, 0.0925, 0.52);
      c.stockFixed('accent', 0, 0.045, -0.2, 0.036, 0.06, 0.25, -0.1, 'dark');
      c.grip('accent', 0, 0.005, -0.06, 0.03, 0.07, 0.05, 0.6, 0);
      c.trigger(-0.01, 0.028, 0.05, 0.03); c.box('dark', 0.004, 0.016, 0.004, 0, 0.018, 0.0, 0.35);
      c.screws([[0.021, 0.06, -0.05], [-0.021, 0.06, -0.05]], 0.004);
      muzzle = [0, 0.075, 0.535];
      if (pap) c.etch(0.087, -0.06, 0.0, 0.02, 2);
      eject = [0.0, 0.07, 0.02];
      boltKind = 'fixed';
    } else if (st === 'bullpup') {
      c.box('body', 0.05, 0.07, 0.26, 0, 0.055, -0.14);
      c.box('dark', 0.052, 0.076, 0.02, 0, 0.055, -0.27);
      c.box('body', 0.046, 0.04, 0.16, 0, 0.06, 0.05);
      for (const s of [-1, 1]) c.cyl('dark', 0.012, 0.34, s * 0.014, 0.035, 0.12, 'z', null, 12);
      c.cyl('dark', 0.011, 0.42, 0, 0.078, 0.2, 'z', null, 12);
      c.partMat.bolt = 'accent'; c.box('bolt', 0.044, 0.05, 0.12, 0, 0.045, 0.22); for (let i = 0; i < 5; i++) c.box('bolt', 0.046, 0.004, 0.004, 0, 0.02, 0.18 + i * 0.02); c.box('bolt', 0.046, 0.012, 0.012, 0, 0.026, 0.285);
      const railTop = c.rail(0.022, 0.097, -0.26, 0.3, 0.007, 0.024);
      sightY = 0.134; sightZ = -0.22;
      c.rearRing(sightZ, sightY, railTop, { r: 0.012, dot: true, base: [0.02, 0.005] });
      c.frontPost(0.34, railTop, sightY, { wings: true, base: [0.014, 0.006, 0.014] });
      c.grip('accent', 0, -0.01, -0.02, 0.03, 0.09, 0.046, 0.3, 3);
      c.trigger(0.03, 0.01, 0.05, 0.03);
      c.box('dark', 0.03, 0.006, 0.05, 0, 0.018, -0.1);
      c.box('dark', 0.008, 0.012, 0.02, 0, 0.02, -0.06);
      c.screws([[0.026, 0.05, -0.2], [-0.026, 0.05, -0.2], [0.026, 0.07, -0.08], [-0.026, 0.07, -0.08]]);
      muzzle = [0, 0.078, 0.415];
      if (pap) c.etch(0.09, -0.26, -0.03, 0.025, 4);
      eject = [0.0, 0.01, -0.1];
    } else if (st === 'drum') {
      c.box('body', 0.046, 0.06, 0.2, 0, 0.06, 0.02);
      c.box('accent', 0.044, 0.05, 0.16, 0, 0.066, 0.24);
      c.vents(0.066, 0.18, 0.3, 4, 0.0225, 0.01, 0.018);
      const railTop = c.rail(0.022, 0.09, -0.06, 0.3, 0.007, 0.024);
      c.cyl('dark', 0.011, 0.22, 0, 0.075, 0.42, 'z', null, 12); c.cyl('metal', 0.014, 0.04, 0, 0.075, 0.53, 'z', null, 8); for (let i = 0; i < 3; i++) c.box('dark', 0.006, 0.006, 0.02, 0, 0.087, 0.52 + i * 0.008);
      c.partMat.mag = 'dark'; c.cyl('mag', 0.05, 0.06, 0, -0.02, 0.09, 'x', null, 16); c.ring('mag', 0.045, 0.006, 0.031, -0.02, 0.09, 'x', 10); c.ring('mag', 0.045, 0.006, -0.031, -0.02, 0.09, 'x', 10); c.box('mag', 0.06, 0.03, 0.03, 0, 0.02, 0.09);
      c.box('accent', 0.024, 0.06, 0.024, 0, 0.01, 0.27, 0.2);
      sightY = 0.126; sightZ = -0.04;
      c.rearRing(sightZ, sightY, railTop, { r: 0.012, dot: true, base: [0.02, 0.005] });
      c.frontPost(0.3, railTop, sightY, { wings: true, base: [0.014, 0.006, 0.014] });
      c.grip('accent', 0, -0.01, -0.06, 0.03, 0.09, 0.046, 0.3, 3);
      c.trigger(-0.02, 0.006, 0.05, 0.03);
      c.partMat.bolt = 'metal'; c.box('bolt', 0.02, 0.012, 0.03, 0.03, 0.07, 0.05);
      c.stockTube(0, 0.06, -0.2, 0.2, 0.015, 0.075);
      c.ejectPort(0.0235, 0.07, 0.05, 0.016, 0.04);
      muzzle = [0, 0.075, 0.55];
      if (pap) c.etch(0.091, -0.06, 0.1, 0.0235, 3);
      eject = [0.03, 0.07, 0.05];
      boltKind = 'recip';
    } else {
      const semi = st === 'semi';
      c.box('body', 0.042, 0.06, 0.17, 0, 0.06, 0.0);
      c.cyl('dark', 0.011, 0.48, 0, 0.078, 0.35, 'z', null, 12);
      c.cyl('dark', 0.011, 0.42, 0, 0.049, 0.3, 'z', null, 12);
      c.ring('metal', 0.013, 0.004, 0, 0.049, 0.5, 'z', 8); c.box('metal', 0.006, 0.03, 0.01, 0, 0.064, 0.48);
      c.box('dark', 0.008, 0.004, 0.44, 0, 0.091, 0.35);
      if (semi) {
        c.box('accent', 0.04, 0.046, 0.16, 0, 0.062, 0.2); for (let i = 0; i < 6; i++) c.box('dark', 0.042, 0.003, 0.004, 0, 0.062, 0.14 + i * 0.024);
        c.partMat.bolt = 'metal'; c.box('bolt', 0.016, 0.01, 0.024, 0.028, 0.075, 0.02);
        c.rail(0.022, 0.09, -0.06, 0.06, 0.006, 0.02);
        c.grip('accent', 0, -0.01, -0.05, 0.03, 0.09, 0.046, 0.3, 3);
        c.stockFixed('accent', 0, 0.055, -0.22, 0.036, 0.055, 0.24, -0.04, 'dark');
        c.trigger(-0.02, 0.006, 0.05, 0.03);
        boltKind = 'recip';
      } else {
        c.partMat.bolt = 'accent'; c.box('bolt', 0.04, 0.045, 0.13, 0, 0.05, 0.22); for (let i = 0; i < 6; i++) c.box('bolt', 0.042, 0.003, 0.004, 0, 0.05, 0.17 + i * 0.02);
        for (const s of [-1, 1]) c.box('dark', 0.004, 0.008, 0.16, s * 0.018, 0.055, 0.1);
        c.stockFixed('accent', 0, 0.045, -0.22, 0.036, 0.06, 0.26, -0.1, 'dark');
        c.grip('accent', 0, 0.005, -0.06, 0.03, 0.07, 0.05, 0.6, 0);
        c.trigger(-0.02, 0.026, 0.05, 0.03);
      }
      sightY = 0.097; sightZ = -0.06;
      c.box('glow', 0.003, 0.003, 0.003, 0, sightY - 0.0025, 0.585); c.box('dark', 0.006, 0.003, 0.006, 0, 0.0945, 0.585);
      c.rearRing(sightZ, sightY, 0.09, { r: 0.0125, base: [0.02, 0.004] });
      c.box('dark', 0.03, 0.006, 0.05, 0, 0.028, 0.02);
      c.ejectPort(0.0215, 0.07, 0.02, 0.016, 0.04);
      c.screws([[0.022, 0.05, -0.06], [-0.022, 0.05, -0.06], [0.022, 0.05, 0.06], [-0.022, 0.05, 0.06]]);
      muzzle = [0, 0.078, 0.595];
      if (pap) c.etch(0.091, -0.08, 0.08, 0.0215, 3);
    }
    return { muzzle, eject, sight: [0, sightY, sightZ], adsDist: 0.3, hip: [0.14, -0.18, 0.2], boltKind };
  },

  sniper(c, look, pap) {
    const st = look.style || 'bolt';
    let sight, muzzle, eject = [0.03, 0.08, 0.02], boltKind = 'bolt';
    if (st === 'dmr') {
      c.box('body', 0.048, 0.048, 0.22, 0, 0.075, 0.02); c.box('body', 0.048, 0.04, 0.16, 0, 0.04, -0.01); c.box('dark', 0.05, 0.05, 0.05, 0, 0.02, 0.06);
      c.box('accent', 0.044, 0.046, 0.26, 0, 0.072, 0.28); c.vents(0.072, 0.18, 0.4, 7, 0.0225, 0.007, 0.02);
      const railTop = c.rail(0.022, 0.099, -0.08, 0.14, 0.007, 0.024);
      c.cyl('dark', 0.009, 0.3, 0, 0.075, 0.55, 'z', null, 10); c.cyl('metal', 0.012, 0.05, 0, 0.075, 0.71, 'z', null, 8);
      c.partMat.mag = 'dark'; c.boxMag('mag', 0.026, 0.13, 0.07, 0, -0.03, 0.06, 0.06);
      c.grip('accent', 0, -0.01, -0.06, 0.03, 0.09, 0.046, 0.32, 3); c.trigger(-0.02, 0.006, 0.05, 0.03);
      c.partMat.bolt = 'dark'; c.box('bolt', 0.03, 0.01, 0.03, 0, 0.094, -0.09); c.box('bolt', 0.012, 0.012, 0.02, 0, 0.094, -0.07);
      c.stockCollapsible(0, 0.06, -0.25, 0.17);
      const [sy, sz] = c.scope(0.142, -0.01, 0.16, 0.014, 0.018, 0.016, railTop);
      sight = [0, sy, sz];
      c.frontPost(0.44, 0.09, 0.115, { wings: true, base: [0.014, 0.008, 0.016] });
      c.ejectPort(0.0245, 0.078, 0.02, 0.016, 0.04);
      c.screws([[0.024, 0.04, -0.06], [-0.024, 0.04, -0.06], [0.024, 0.04, 0.02]]);
      muzzle = [0, 0.075, 0.74];
      if (pap) c.etch(0.099, -0.08, 0.14, 0.0245, 4);
      boltKind = 'fixed';
    } else if (st === 'antimat') {
      c.box('body', 0.055, 0.07, 0.34, 0, 0.065, -0.02); c.box('body', 0.05, 0.03, 0.2, 0, 0.11, 0.0);
      const railTop = c.rail(0.024, 0.125, -0.16, 0.1, 0.007, 0.024);
      c.box('accent', 0.05, 0.05, 0.16, 0, 0.07, 0.24);
      c.cyl('dark', 0.014, 0.5, 0, 0.078, 0.55, 'z', null, 12); for (let i = 0; i < 4; i++) c.box('dark', 0.004, 0.004, 0.4, 0.015 * Math.cos(i * PI / 2), 0.078 + 0.015 * Math.sin(i * PI / 2), 0.55);
      c.box('metal', 0.05, 0.03, 0.06, 0, 0.078, 0.82, 0, 0.5, 0); c.box('metal', 0.05, 0.03, 0.06, 0, 0.078, 0.82, 0, -0.5, 0);
      for (const s of [-1, 1]) { c.cyl('dark', 0.006, 0.22, s * 0.03, -0.04, 0.42, 'z', null, 8); c.box('dark', 0.006, 0.12, 0.006, s * 0.03, -0.09, 0.5, 0.2); }
      c.partMat.mag = 'dark'; c.boxMag('mag', 0.032, 0.12, 0.09, 0, -0.03, 0.06, 0.02);
      c.grip('accent', 0, -0.01, -0.08, 0.03, 0.09, 0.046, 0.3, 3); c.trigger(-0.04, 0.006, 0.05, 0.03);
      c.partMat.bolt = 'metal'; c.box('bolt', 0.024, 0.014, 0.03, 0.036, 0.08, -0.06);
      c.box('body', 0.04, 0.07, 0.16, 0, 0.05, -0.29); c.box('dark', 0.04, 0.09, 0.02, 0, 0.045, -0.38); c.box('dark', 0.006, 0.06, 0.006, 0, 0.0, -0.33);
      const [sy, sz] = c.scope(0.168, -0.03, 0.24, 0.016, 0.024, 0.02, railTop, { sunshade: true });
      sight = [0, sy, sz];
      c.ejectPort(0.028, 0.08, -0.02, 0.018, 0.05);
      c.screws([[0.028, 0.05, -0.15], [-0.028, 0.05, -0.15], [0.028, 0.05, 0.1], [-0.028, 0.05, 0.1]]);
      muzzle = [0, 0.078, 0.86];
      if (pap) c.etch(0.126, -0.18, 0.12, 0.0275, 5);
      eject = [0.035, 0.085, -0.02];
      boltKind = 'recip';
    } else if (st === 'heavy') {
      c.cyl('body', 0.02, 0.24, 0, 0.078, -0.02, 'z', null, 12); c.box('body', 0.044, 0.05, 0.24, 0, 0.055, -0.02);
      c.box('accent', 0.046, 0.05, 0.22, 0, 0.06, 0.22); c.vents(0.06, 0.14, 0.32, 6, 0.0235, 0.008, 0.018);
      const railTop = c.rail(0.022, 0.098, -0.14, 0.1, 0.007, 0.024);
      c.cyl('dark', 0.012, 0.44, 0, 0.078, 0.55, 'z', null, 12);
      c.box('metal', 0.032, 0.032, 0.08, 0, 0.078, 0.8); for (let i = 0; i < 3; i++) for (const s of [-1, 1]) c.box('dark', 0.006, 0.016, 0.01, s * 0.016, 0.078, 0.78 + i * 0.018);
      c.partMat.bolt = 'metal'; c.pivots.bolt = [0, 0.078, -0.05];
      c.box('bolt', 0.05, 0.01, 0.01, 0.03, 0.082, -0.05, 0, 0, -0.5); c.sph('bolt', 0.009, 0.05, 0.07, -0.05, 6);
      c.partMat.mag = 'dark'; c.boxMag('mag', 0.028, 0.06, 0.08, 0, 0.005, 0.03, 0.02);
      c.grip('accent', 0, -0.01, -0.1, 0.03, 0.09, 0.046, 0.3, 3); c.trigger(-0.06, 0.006, 0.05, 0.03);
      c.box('dark', 0.03, 0.02, 0.22, 0, 0.06, -0.26); c.box('accent', 0.03, 0.03, 0.09, 0, 0.09, -0.25); c.box('dark', 0.036, 0.09, 0.02, 0, 0.045, -0.375); c.box('dark', 0.006, 0.05, 0.006, 0, 0.02, -0.32);
      for (const s of [-1, 1]) c.box('dark', 0.005, 0.005, 0.12, s * 0.014, 0.03, 0.3);
      const [sy, sz] = c.scope(0.148, -0.03, 0.26, 0.017, 0.025, 0.02, railTop, { sunshade: true });
      sight = [0, sy, sz];
      c.ejectPort(0.0225, 0.085, -0.04, 0.014, 0.04);
      c.screws([[0.023, 0.05, -0.12], [-0.023, 0.05, -0.12], [0.023, 0.05, 0.06], [-0.023, 0.05, 0.06]]);
      muzzle = [0, 0.078, 0.84];
      if (pap) c.etch(0.099, -0.14, 0.1, 0.0235, 4);
    } else {
      c.cyl('body', 0.018, 0.22, 0, 0.078, -0.02, 'z', null, 12);
      c.box('accent', 0.044, 0.05, 0.3, 0, 0.045, 0.25); c.box('accent', 0.046, 0.06, 0.2, 0, 0.045, -0.02);
      c.stockFixed('accent', 0, 0.05, -0.24, 0.04, 0.06, 0.26, -0.08, 'dark');
      c.box('accent', 0.03, 0.018, 0.1, 0, 0.09, -0.2);
      c.cyl('dark', 0.0095, 0.48, 0, 0.078, 0.45, 'z', null, 12); for (let i = 0; i < 4; i++) c.box('dark', 0.003, 0.003, 0.36, 0.011 * Math.cos(i * PI / 2 + 0.4), 0.078 + 0.011 * Math.sin(i * PI / 2 + 0.4), 0.48);
      c.cyl('metal', 0.013, 0.05, 0, 0.078, 0.7, 'z', null, 8); for (let i = 0; i < 4; i++) c.box('dark', 0.004, 0.006, 0.03, 0.012 * Math.cos(i * PI / 2), 0.078 + 0.012 * Math.sin(i * PI / 2), 0.7);
      c.partMat.bolt = 'metal'; c.pivots.bolt = [0, 0.078, -0.04];
      c.box('bolt', 0.045, 0.008, 0.008, 0.028, 0.078, -0.04, 0, 0, -0.6); c.sph('bolt', 0.008, 0.046, 0.062, -0.04, 6);
      c.partMat.mag = 'dark'; c.boxMag('mag', 0.028, 0.05, 0.07, 0, 0.0, 0.04, 0.02);
      c.trigger(-0.06, 0.02, 0.05, 0.03);
      const railTop = 0.096; c.box('dark', 0.02, 0.006, 0.12, 0, 0.093, -0.02);
      const [sy, sz] = c.scope(0.138, -0.02, 0.22, 0.015, 0.021, 0.018, railTop);
      sight = [0, sy, sz];
      for (const s of [-1, 1]) c.box('dark', 0.005, 0.005, 0.12, s * 0.014, 0.018, 0.3);
      c.ejectPort(0.0185, 0.085, -0.02, 0.012, 0.04);
      c.screws([[0.023, 0.03, -0.1], [-0.023, 0.03, -0.1], [0.023, 0.03, 0.08]]);
      muzzle = [0, 0.078, 0.73];
      if (pap) c.etch(0.071, -0.12, 0.34, 0.023, 5);
    }
    return { muzzle, eject, sight, adsDist: 0.24, hip: [0.14, -0.18, 0.18], boltKind };
  },

  lmg(c, look, pap) {
    const st = look.style || 'box';
    let sightY, sightZ, muzzle, eject = [0.035, 0.07, 0.05], boltKind = 'recip';
    if (st === 'drum') {
      c.box('body', 0.045, 0.062, 0.3, 0, 0.06, 0.0);
      c.partMat.cover = 'body'; c.pivots.cover = [0, 0.096, -0.12];
      c.box('cover', 0.045, 0.014, 0.22, 0, 0.096, -0.02); c.box('cover', 0.03, 0.006, 0.2, 0, 0.106, -0.02);
      c.box('accent', 0.042, 0.03, 0.16, 0, 0.045, 0.24); c.box('accent', 0.036, 0.02, 0.14, 0, 0.098, 0.24);
      c.cyl('dark', 0.009, 0.3, 0, 0.056, 0.4, 'z', null, 10);
      c.cyl('dark', 0.011, 0.38, 0, 0.078, 0.52, 'z', null, 12); c.box('dark', 0.024, 0.03, 0.03, 0, 0.07, 0.59);
      c.cyl('metal', 0.013, 0.04, 0, 0.078, 0.72, 'z', null, 8);
      for (const s of [-1, 1]) { c.cyl('dark', 0.005, 0.22, s * 0.02, 0.03, 0.55, 'z', null, 8); c.box('dark', 0.005, 0.14, 0.005, s * 0.024, -0.03, 0.62, 0.3); }
      c.partMat.mag = 'dark'; c.cyl('mag', 0.055, 0.07, 0, 0.0, 0.08, 'x', null, 16); c.ring('mag', 0.05, 0.006, 0.036, 0.0, 0.08, 'x', 10); c.box('mag', 0.06, 0.03, 0.04, 0, 0.05, 0.08); c.box('mag', 0.012, 0.02, 0.03, 0.03, -0.02, 0.08);
      for (let i = 0; i < 4; i++) c.cyl('brass', 0.005, 0.045, -0.026 + i * 0.008, 0.075, 0.07, 'z', null, 6);
      sightY = 0.126; sightZ = -0.01;
      c.frontPost(0.68, 0.09, sightY, { hood: true, base: [0.014, 0.012, 0.02] });
      c.rearNotch(sightZ, sightY, 0.008);
      c.grip('accent', 0, -0.015, -0.1, 0.03, 0.09, 0.046, 0.3, 2); c.trigger(-0.06, 0.006, 0.05, 0.03);
      c.partMat.bolt = 'metal'; c.box('bolt', 0.014, 0.012, 0.03, 0.03, 0.07, 0.03);
      c.stockFixed('accent', 0, 0.05, -0.28, 0.036, 0.055, 0.26, -0.06, 'dark');
      c.screws([[0.023, 0.05, -0.12], [-0.023, 0.05, -0.12], [0.023, 0.05, 0.1], [-0.023, 0.05, 0.1]]);
      c.ejectPort(0.0235, 0.07, 0.04, 0.016, 0.05);
      muzzle = [0, 0.078, 0.74];
      if (pap) c.etch(0.092, -0.14, 0.14, 0.0235, 5);
    } else if (st === 'hamr') {
      c.box('body', 0.05, 0.05, 0.24, 0, 0.075, 0.0); c.box('body', 0.05, 0.04, 0.18, 0, 0.04, -0.03); c.box('dark', 0.052, 0.045, 0.06, 0, 0.02, 0.06);
      c.box('accent', 0.05, 0.05, 0.24, 0, 0.072, 0.28); c.vents(0.072, 0.18, 0.38, 6, 0.0255, 0.009, 0.02);
      const railTop = c.rail(0.022, 0.1, -0.1, 0.4, 0.007, 0.024);
      c.cyl('dark', 0.012, 0.28, 0, 0.075, 0.53, 'z', null, 12); for (let i = 0; i < 4; i++) c.box('dark', 0.003, 0.003, 0.24, 0.013 * Math.cos(i * PI / 2 + 0.4), 0.075 + 0.013 * Math.sin(i * PI / 2 + 0.4), 0.53);
      c.cyl('metal', 0.015, 0.05, 0, 0.075, 0.69, 'z', null, 8); for (let i = 0; i < 3; i++) c.box('dark', 0.006, 0.006, 0.03, 0, 0.09, 0.68 + i * 0.008);
      c.box('dark', 0.024, 0.03, 0.03, 0, 0.082, 0.42);
      c.partMat.mag = 'dark'; c.box('mag', 0.05, 0.12, 0.075, 0, -0.03, 0.065, 0.04); c.box('mag', 0.054, 0.008, 0.08, 0, -0.088, 0.062, 0.04); for (let i = 0; i < 3; i++) c.box('mag', 0.052, 0.003, 0.07, 0, -0.06 + i * 0.02, 0.065, 0.04);
      for (const s of [-1, 1]) c.box('dark', 0.005, 0.005, 0.14, s * 0.018, 0.04, 0.3);
      sightY = 0.134; sightZ = -0.09;
      c.rearRing(sightZ, sightY, railTop, { dot: true, base: [0.02, 0.005] });
      c.frontPost(0.42, 0.097, sightY, { hood: true, base: [0.016, 0.012, 0.02] });
      c.grip('accent', 0, -0.01, -0.08, 0.03, 0.09, 0.046, 0.32, 3); c.trigger(-0.04, 0.006, 0.05, 0.03);
      c.partMat.bolt = 'dark'; c.box('bolt', 0.032, 0.01, 0.03, 0, 0.096, -0.11); c.box('bolt', 0.012, 0.012, 0.02, 0, 0.096, -0.09);
      c.stockFixed('accent', 0, 0.06, -0.26, 0.038, 0.065, 0.24, -0.03, 'dark'); c.box('dark', 0.006, 0.05, 0.006, 0, 0.0, -0.3);
      c.ejectPort(0.0255, 0.078, 0.02, 0.018, 0.045);
      c.screws([[0.025, 0.04, -0.08], [-0.025, 0.04, -0.08], [0.025, 0.04, 0.02], [-0.025, 0.04, 0.02]]);
      muzzle = [0, 0.075, 0.72];
      if (pap) c.etch(0.101, -0.1, 0.12, 0.0255, 5);
      boltKind = 'fixed';
    } else {
      c.box('body', 0.05, 0.066, 0.28, 0, 0.06, 0.02);
      c.partMat.cover = 'body'; c.pivots.cover = [0, 0.1, -0.1];
      c.box('cover', 0.05, 0.014, 0.22, 0, 0.1, 0.01); c.box('cover', 0.034, 0.006, 0.18, 0, 0.11, 0.01);
      c.box('accent', 0.048, 0.055, 0.2, 0, 0.066, 0.29); c.vents(0.066, 0.2, 0.38, 5, 0.0245, 0.009, 0.02);
      c.cyl('dark', 0.011, 0.38, 0, 0.08, 0.55, 'z', null, 12); c.cyl('dark', 0.008, 0.3, 0, 0.056, 0.5, 'z', null, 8);
      c.box('dark', 0.024, 0.006, 0.1, 0, 0.124, 0.38); c.box('dark', 0.006, 0.02, 0.006, 0, 0.11, 0.34); c.box('dark', 0.006, 0.02, 0.006, 0, 0.11, 0.42);
      c.cyl('metal', 0.014, 0.05, 0, 0.08, 0.74, 'z', null, 8); for (let i = 0; i < 3; i++) c.box('dark', 0.004, 0.006, 0.03, 0.012 * Math.cos(i * 2.1), 0.08 + 0.012 * Math.sin(i * 2.1), 0.74);
      for (const s of [-1, 1]) { c.cyl('dark', 0.005, 0.24, s * 0.022, 0.03, 0.5, 'z', null, 8); c.box('dark', 0.005, 0.12, 0.005, s * 0.026, -0.02, 0.6, 0.3); }
      c.partMat.mag = 'accent'; c.box('mag', 0.07, 0.1, 0.12, -0.012, -0.02, 0.06); c.box('mag', 0.074, 0.01, 0.124, -0.012, 0.03, 0.06); c.box('mag', 0.04, 0.01, 0.04, -0.012, -0.072, 0.06);
      for (let i = 0; i < 5; i++) c.cyl('brass', 0.005, 0.05, -0.03 + i * 0.009, 0.08, 0.06, 'z', null, 6);
      c.box('dark', 0.05, 0.01, 0.06, -0.03, 0.078, 0.06);
      sightY = 0.13; sightZ = -0.06;
      c.rearRing(sightZ, sightY, 0.113, { dot: true, base: [0.022, 0.005] });
      c.frontPost(0.62, 0.091, sightY, { hood: true, base: [0.016, 0.014, 0.02] });
      c.grip('accent', 0, -0.015, -0.08, 0.03, 0.09, 0.046, 0.32, 3); c.trigger(-0.04, 0.006, 0.05, 0.03);
      c.partMat.bolt = 'metal'; c.box('bolt', 0.02, 0.014, 0.035, 0.032, 0.07, 0.0);
      c.stockFixed('accent', 0, 0.055, -0.27, 0.04, 0.07, 0.24, -0.04, 'dark');
      c.ejectPort(0.0255, 0.06, 0.05, 0.02, 0.05);
      c.screws([[0.025, 0.045, -0.1], [-0.025, 0.045, -0.1], [0.025, 0.045, 0.12], [-0.025, 0.045, 0.12]]);
      muzzle = [0, 0.08, 0.77];
      if (pap) c.etch(0.101, -0.1, 0.12, 0.0255, 5);
    }
    return { muzzle, eject, sight: [0, sightY, sightZ], adsDist: 0.3, hip: [0.14, -0.19, 0.16], boltKind };
  },

  launcher(c, look, pap) {
    c.box('body', 0.05, 0.07, 0.15, 0, 0.06, -0.02);
    c.box('dark', 0.052, 0.02, 0.04, 0, 0.1, 0.0);
    c.partMat.hinge = 'body'; c.pivots.hinge = [0, 0.045, 0.06];
    c.cyl('hinge', 0.036, 0.3, 0, 0.07, 0.24, 'z', 0.04, 12);
    c.ring('hinge', 0.04, 0.008, 0, 0.07, 0.1, 'z', 10); c.ring('hinge', 0.04, 0.006, 0, 0.07, 0.38, 'z', 10);
    c.box('hinge', 0.03, 0.06, 0.04, 0, 0.02, 0.2, 0.15);
    c.partMat.round = 'brass'; c.cyl('round', 0.02, 0.06, 0, 0.07, 0.11, 'z', null, 10); c.sph('round', 0.018, 0, 0.07, 0.145, 6);
    const sightY = 0.14, sightZ = -0.03;
    c.box('dark', 0.024, 0.006, 0.02, 0, 0.113, sightZ); c.box('dark', 0.004, 0.02, 0.004, 0, 0.126, sightZ);
    c.rearNotch(sightZ, sightY, 0.004);
    c.frontPost(0.35, 0.108, sightY, { wings: true, base: [0.02, 0.008, 0.014] });
    c.grip('accent', 0, -0.01, -0.06, 0.03, 0.09, 0.046, 0.3, 3); c.trigger(-0.02, 0.006, 0.05, 0.03);
    c.stockFixed('accent', 0, 0.05, -0.2, 0.04, 0.06, 0.2, -0.04, 'dark');
    c.screws([[0.026, 0.05, -0.06], [-0.026, 0.05, -0.06]]);
    if (pap) c.etch(0.096, -0.09, 0.0, 0.0255, 3);
    return { muzzle: [0, 0.07, 0.4], eject: [0.03, 0.06, 0.0], sight: [0, sightY, sightZ], adsDist: 0.3, hip: [0.14, -0.18, 0.18], boltKind: 'fixed' };
  },

  energy(c, look, pap) {
    const st = look.style || 'arc';
    let sightY, sightZ, muzzle, eject = [0.03, 0.07, 0.0];
    if (st === 'nova') {
      c.cyl('body', 0.022, 0.16, 0, 0.065, 0.06, 'z', null, 12);
      c.sph('body', 0.027, 0, 0.065, -0.02, 8);
      c.cyl('accent', 0.02, 0.05, 0, 0.065, 0.16, 'z', 0.011, 12);
      c.cyl('glow', 0.007, 0.02, 0, 0.065, 0.192, 'z', null, 8);
      for (let i = 0; i < 3; i++) c.ring('glow', 0.024, 0.003, 0, 0.065, 0.02 + i * 0.05, 'z', 8);
      c.box('accent', 0.018, 0.02, 0.12, 0, 0.038, 0.06);
      c.grip('accent', 0, -0.015, -0.01, 0.03, 0.09, 0.046, 0.25, 3);
      c.partMat.mag = 'glow'; c.box('mag', 0.02, 0.05, 0.028, 0, -0.045, -0.02, 0.25); c.box('mag', 0.026, 0.006, 0.036, 0, -0.07, -0.028, 0.25);
      c.ring('metal', 0.014, 0.003, 0, 0.018, 0.02, 'x', 8);
      c.box('dark', 0.004, 0.014, 0.004, 0, 0.018, 0.02, 0.3);
      sightY = 0.1; sightZ = -0.035;
      for (const s of [-1, 1]) c.box('glow', 0.003, 0.008, 0.003, s * 0.006, sightY - 0.004, sightZ);
      c.box('dark', 0.018, 0.005, 0.006, 0, sightY - 0.0105, sightZ);
      c.box('glow', 0.003, 0.012, 0.003, 0, sightY - 0.006, 0.14); c.box('dark', 0.008, 0.005, 0.008, 0, 0.0865, 0.14);
      c.screws([[0.02, 0.06, -0.01], [-0.02, 0.06, -0.01]]);
      muzzle = [0, 0.065, 0.205];
      if (pap) c.etch(0.088, -0.03, 0.13, 0.012, 3);
      return { muzzle, eject: [0.02, 0.07, 0.0], sight: [0, sightY, sightZ], adsDist: 0.28, hip: [0.16, -0.17, 0.3], boltKind: 'fixed' };
    }
    const ray = st === 'ray';
    c.box('body', 0.06, 0.08, 0.26, 0, 0.06, 0.02);
    c.box('body', 0.05, 0.05, 0.2, 0, 0.09, 0.24, 0.1);
    c.cyl('glow', 0.018, 0.24, 0, 0.065, 0.24, 'z', null, 8);
    for (let i = 0; i < 5; i++) c.ring('metal', 0.03, 0.006, 0, 0.065, 0.14 + i * 0.05, 'z', 8);
    c.cyl('accent', 0.03, 0.06, 0, 0.065, 0.4, 'z', 0.018, 12);
    c.cyl('glow', 0.011, 0.03, 0, 0.065, 0.43, 'z', null, 8);
    if (ray) for (let i = 0; i < 3; i++) { const a = i * PI * 2 / 3 + PI / 2; c.box('dark', 0.004, 0.03, 0.14, Math.cos(a) * 0.035, 0.065 + Math.sin(a) * 0.035, 0.3, 0, 0, a); }
    for (const s of [-1, 1]) c.cyl('metal', 0.012, 0.1, s * 0.036, 0.04, 0.05, 'z', null, 8);
    c.box('glow', 0.062, 0.01, 0.12, 0, 0.06, -0.05);
    c.grip('accent', 0, -0.01, -0.05, 0.03, 0.095, 0.05, 0.3, 3); c.trigger(-0.01, 0.006, 0.05, 0.03);
    c.stockFixed('body', 0, 0.05, -0.22, 0.04, 0.06, 0.2, -0.03, 'dark');
    c.partMat.mag = 'glow'; c.box('mag', 0.03, 0.04, 0.08, 0, 0.0, 0.14); c.box('mag', 0.034, 0.008, 0.02, 0, -0.026, 0.14);
    c.box('dark', 0.036, 0.01, 0.09, 0, 0.026, 0.14);
    sightY = 0.135; sightZ = -0.05;
    c.ring('glow', 0.011, 0.0025, 0, sightY, sightZ, 'z', 10); c.box('dark', 0.004, 0.02, 0.004, 0, 0.113, sightZ);
    c.box('glow', 0.003, 0.016, 0.003, 0, sightY - 0.008, 0.4); c.box('dark', 0.01, 0.006, 0.01, 0, 0.115, 0.4);
    c.screws([[0.031, 0.05, -0.06], [-0.031, 0.05, -0.06], [0.031, 0.05, 0.1], [-0.031, 0.05, 0.1]]);
    muzzle = [0, 0.065, 0.45];
    if (pap) c.etch(0.101, -0.1, 0.14, 0.031, 4);
    return { muzzle, eject, sight: [0, sightY, sightZ], adsDist: 0.3, hip: [0.14, -0.18, 0.2], boltKind: 'fixed' };
  },
};

// ---------------------------------------------------------------------------------------------
// assembly
// ---------------------------------------------------------------------------------------------
const STATIC_GROUPS = ['body', 'accent', 'dark', 'metal', 'glow', 'glass', 'brass'];
const PART_NAMES = ['mag', 'bolt', 'cylinder', 'hinge', 'cover', 'round', 'tube'];

export function buildWeaponModel(scene, mats, def) {
  const look = def.look || { type: 'rifle', color: '#2a2d30', accent: '#555' };
  const pap = !!(def.pap || look.pap);
  const mat = weaponMaterials(mats, look, pap);
  const c = new Ctx(scene, look);
  const builder = BUILD[look.type] || BUILD.rifle;
  const info = builder(c, look, pap);
  const root = new (B().TransformNode)('wpn_' + def.id, scene);
  const meshes = [];
  const parts = {};
  const mergeGroup = (list, name) => {
    if (!list || !list.length) return null;
    const merged = list.length > 1 ? B().Mesh.MergeMeshes(list, true, true, undefined, false, false) : list[0];
    merged.name = name; merged.isPickable = false; merged.receiveShadows = false;
    return merged;
  };
  for (const g of STATIC_GROUPS) {
    const m = mergeGroup(c.groups[g], 'wm_' + g);
    if (!m) continue;
    m.material = mat[g]; m.parent = root; meshes.push(m);
  }
  for (const p of PART_NAMES) {
    const m = mergeGroup(c.groups[p], 'wp_' + p);
    if (!m) continue;
    m.material = mat[c.partMat[p] || 'dark'];
    const pv = c.pivots[p];
    if (pv) { m.bakeTransformIntoVertices(B().Matrix.Translation(-pv[0], -pv[1], -pv[2])); m.position.set(pv[0], pv[1], pv[2]); }
    m.parent = root; meshes.push(m); parts[p] = m;
  }
  const node = (name, p) => { const n = new (B().TransformNode)(name, scene); n.parent = root; n.position.set(p[0], p[1], p[2]); return n; };
  const muzzle = node('muzzle', info.muzzle);
  const eject = node('eject', info.eject);
  const sight = node('sight', info.sight);
  return {
    root, muzzle, eject, sight, mag: parts.mag || null, bolt: parts.bolt || null, parts, boltKind: info.boltKind || 'fixed',
    meshes, def, length: info.muzzle[2], sightPos: info.sight.slice(), adsDist: info.adsDist, hip: info.hip.slice(), tris: Math.round(c.tris),
  };
}

/** Clone a built weapon model (shares geometry & materials). Animatable parts and anchor nodes are cloned too. */
export function cloneWeaponModel(model, name = 'wclone') {
  const scene = model.root.getScene();
  const root = new (B().TransformNode)(name, scene);
  const meshes = [];
  const parts = {};
  for (const m of model.meshes) {
    const inst = m.clone(m.name + '_c', root);
    inst.isPickable = false; inst.receiveShadows = false;
    meshes.push(inst);
    for (const p in model.parts) if (model.parts[p] === m) parts[p] = inst;
  }
  const node = (n, src) => { const t = new (B().TransformNode)(n, scene); t.parent = root; t.position.copyFrom(src.position); return t; };
  const muzzle = node('muzzle', model.muzzle), eject = node('eject', model.eject), sight = node('sight', model.sight);
  return {
    root, muzzle, eject, sight, mag: parts.mag || null, bolt: parts.bolt || null, parts, boltKind: model.boltKind, meshes, def: model.def, length: model.length,
    sightPos: model.sightPos, adsDist: model.adsDist, hip: model.hip, tris: model.tris,
    dispose() { root.dispose(); },
  };
}
