// PBR material library built on the procedural texture sets.
/* global BABYLON */

export class MaterialLibrary {
  constructor(scene, textures, settings) {
    this.scene = scene;
    this.tex = textures;
    this.settings = settings;
    this.cache = new Map();
    this.maxLights = 6;
    this.usePbr = true;
  }

  _pbr(name) {
    const m = new BABYLON.PBRMaterial(name, this.scene);
    m.maxSimultaneousLights = this.maxLights;
    m.metallic = 1; m.roughness = 1;
    m.usePhysicalLightFalloff = false;
    m.environmentIntensity = 0.7;
    m.specularIntensity = 0.6;
    m.enableSpecularAntiAliasing = true;
    m.backFaceCulling = true;
    m.invertNormalMapX = true;
    m.invertNormalMapY = false;
    return m;
  }

  /** Textured PBR material for a texture set name. */
  get(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    let m;
    if (name === 'glass') m = this._glass();
    else if (name === 'fence') m = this._fence();
    else if (name.startsWith('door_')) m = this._door(name);
    else m = this._textured(name);
    this.cache.set(name, m);
    return m;
  }

  _textured(name, opts = {}) {
    const set = this.tex.get(name);
    const m = this._pbr('mat_' + name);
    m.albedoTexture = set.albedo;
    m.bumpTexture = set.normal;
    m.metallicTexture = set.orm;
    m.useRoughnessFromMetallicTextureGreen = true;
    m.useMetallnessFromMetallicTextureBlue = true;
    m.useRoughnessFromMetallicTextureAlpha = false;
    m.useAmbientOcclusionFromMetallicTextureRed = true;
    m.metallic = 1; m.roughness = 1;
    if (opts.color) m.albedoColor = BABYLON.Color3.FromHexString(opts.color);
    m.metadata = { texScale: set.scale };
    return m;
  }

  _glass() {
    const set = this.tex.get('glass');
    const m = this._pbr('mat_glass');
    m.albedoTexture = set.albedo;
    m.albedoTexture.hasAlpha = true;
    m.useAlphaFromAlbedoTexture = true;
    m.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
    m.alpha = 0.55;
    m.metallic = 0.1; m.roughness = 0.1;
    m.backFaceCulling = false;
    m.needDepthPrePass = true;
    m.metadata = { texScale: 1 };
    return m;
  }

  _fence() {
    const set = this.tex.get('fence');
    const m = this._pbr('mat_fence');
    m.albedoTexture = set.albedo;
    m.albedoTexture.hasAlpha = true;
    m.useAlphaFromAlbedoTexture = true;
    m.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST;
    m.alphaCutOff = 0.5;
    m.backFaceCulling = false;
    m.metallic = 0.7; m.roughness = 0.5;
    m.metadata = { texScale: 1 };
    return m;
  }

  _door(name) {
    const kind = name.slice(5);
    if (kind === 'gate') { const m = this._textured('metal_dark'); m.name = 'mat_door_gate'; return m; }
    if (kind === 'rollup') { const m = this._textured('metal_panel'); m.name = 'mat_door_rollup'; return m; }
    const m = this._textured('boards'); m.name = 'mat_door_door'; return m;
  }

  /** Untextured PBR with a flat color. */
  solid(key, color, opts = {}) {
    const k = 'solid_' + key;
    if (this.cache.has(k)) return this.cache.get(k);
    const m = this._pbr('mat_' + k);
    m.albedoColor = typeof color === 'string' ? BABYLON.Color3.FromHexString(color) : color;
    m.metallic = opts.metal ?? 0.1;
    m.roughness = opts.rough ?? 0.6;
    if (opts.emissive) { m.emissiveColor = typeof opts.emissive === 'string' ? BABYLON.Color3.FromHexString(opts.emissive) : opts.emissive; if (opts.emissiveIntensity) m.emissiveIntensity = opts.emissiveIntensity; }
    if (opts.alpha != null) { m.alpha = opts.alpha; m.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND; }
    if (opts.unlit) m.unlit = true;
    if (opts.doubleSided) m.backFaceCulling = false;
    this.cache.set(k, m);
    return m;
  }

  /** Tinted vehicle paint (shares the vehicle texture set). */
  vehicle(color) {
    const k = 'vehicle_' + color;
    if (this.cache.has(k)) return this.cache.get(k);
    const m = this._textured('vehicle', { color });
    m.name = 'mat_' + k;
    m.metallic = 0.9; m.roughness = 0.6;
    this.cache.set(k, m);
    return m;
  }

  /** Emissive additive material (beams, glows). */
  glow(key, color, alpha = 0.5) {
    const k = 'glow_' + key;
    if (this.cache.has(k)) return this.cache.get(k);
    const m = new BABYLON.StandardMaterial('mat_' + k, this.scene);
    m.emissiveColor = typeof color === 'string' ? BABYLON.Color3.FromHexString(color) : color;
    m.diffuseColor = BABYLON.Color3.Black(); m.specularColor = BABYLON.Color3.Black();
    m.alpha = alpha;
    m.alphaMode = BABYLON.Engine.ALPHA_ADD;
    m.backFaceCulling = false;
    m.disableLighting = true;
    this.cache.set(k, m);
    return m;
  }

  /** Decal material from a canvas texture (alpha blended). */
  decal(key, texture, opts = {}) {
    const k = 'decal_' + key;
    if (this.cache.has(k)) return this.cache.get(k);
    const m = new BABYLON.StandardMaterial('mat_' + k, this.scene);
    m.diffuseTexture = texture; m.diffuseTexture.hasAlpha = true;
    m.useAlphaFromDiffuseTexture = true;
    m.specularColor = BABYLON.Color3.Black();
    m.emissiveColor = opts.emissive ? BABYLON.Color3.FromHexString(opts.emissive) : new BABYLON.Color3(0.2, 0.2, 0.2);
    m.diffuseColor = new BABYLON.Color3(1, 1, 1);
    m.zOffset = -2;
    m.backFaceCulling = false;
    if (opts.unlit) m.disableLighting = true;
    this.cache.set(k, m);
    return m;
  }

  dispose() { for (const m of this.cache.values()) m.dispose(); this.cache.clear(); }
}
