import * as THREE from 'three';
import { createOverviewGeometryCache } from './overview.js';

const textureSlots = ['map', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'];
const meanColors = new WeakMap(), vertexMeans = new WeakMap();
const materialsOf = (object) => Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
const hasPose = (object) => object.isSkinnedMesh || object.morphTargetInfluences?.some((weight) => weight !== 0);

/** Eligibility for a whole source subtree; the same policy drives capture bounds and serialization. */
export function isReviewObject(object) {
  if (!object || object.visible === false || object.userData?.reviewExclude) return false;
  // These are presentation effects in this project, not physical review geometry. Shader quads
  // must never become opaque fallback meshes: their CPU positions often have no useful bounds.
  if (object.isLight || object.isCamera || object.isSprite || object.isPoints || object.isLine) return false;
  if (object.isInstancedMesh && object.count === 0) return false;
  const materials = materialsOf(object);
  if (materials.some((material) => material?.isShaderMaterial)) return false;
  if (object.isMesh && materials.length && materials.every((material) => material?.transparent && material.blending === THREE.AdditiveBlending)) return false;
  if (materials.length && materials.every((material) => !material || material.visible === false || (material.transparent && material.opacity === 0))) return false;
  return true;
}

/** Unlike Object3D.traverse(), this respects hidden/excluded ancestors and never mutates them. */
export function traverseReview(root, visitor) {
  if (!isReviewObject(root)) return;
  visitor(root);
  for (const child of root.children || []) traverseReview(child, visitor);
}

/** World bounds and conservative stream costs without cloning geometry or constructing materials. */
export function measureReviewRoot(root) {
  const box = new THREE.Box3(), seen = new Set(), materialSet = new Set();
  const local = new THREE.Box3(), placed = new THREE.Box3(), point = new THREE.Vector3(), instance = new THREE.Matrix4();
  let bytes = 16384, sceneBytes = 16384, triangles = 0, renderables = 0;
  root?.updateWorldMatrix(true, true);
  traverseReview(root, (object) => {
    const geometry = object.geometry, position = geometry?.getAttribute('position');
    bytes += 2048; sceneBytes += 2048;
    if (!object.isMesh || !position?.count || !materialsOf(object).length) return;
    renderables++;
    materialsOf(object).forEach((material) => material && materialSet.add(material));
    const count = geometry.index?.count || position.count;
    triangles += count / 3 * (object.isInstancedMesh ? object.count : 1);
    const deformed = hasPose(object);
    // Posed meshes produce distinct baked geometry, even when their bind-pose source is shared.
    if (deformed || !seen.has(geometry)) {
      seen.add(geometry);
      const indexBytes = (geometry.index?.count || 0) * 4, groups = geometry.groups.length * 32;
      for (const key of ['position', 'normal', 'uv']) {
        const attribute = geometry.getAttribute(key);
        const size = (attribute?.count || 0) * (attribute?.itemSize || 0) * 4;
        bytes += size; if (key === 'position') sceneBytes += size;
      }
      bytes += indexBytes + groups; sceneBytes += indexBytes + groups;
    }
    local.makeEmpty();
    if (deformed) {
      object.skeleton?.update();
      for (let i = 0; i < position.count; i++) { object.getVertexPosition(i, point); local.expandByPoint(point); }
    } else {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      local.copy(geometry.boundingBox);
    }
    if (object.isInstancedMesh) {
      bytes += object.count * 64; sceneBytes += object.count * 64;
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, instance); instance.premultiply(object.matrixWorld);
        box.union(placed.copy(local).applyMatrix4(instance));
      }
    } else box.union(placed.copy(local).applyMatrix4(object.matrixWorld));
  });
  bytes += materialSet.size * 2048; sceneBytes += materialSet.size * 2048;
  return { box, estimatedBytes: renderables ? Math.ceil(bytes * 1.05) : 0, sceneBytes: renderables ? Math.ceil(sceneBytes * 1.05) : 0, triangles: Math.ceil(triangles), renderables };
}

function averageColor(texture) {
  if (meanColors.has(texture)) return meanColors.get(texture);
  const image = texture.source?.data;
  const color = new THREE.Color(1, 1, 1);
  if (image && (image.width || image.videoWidth)) {
    let pixels = rgbaData(texture);
    if (!pixels) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('A 2D canvas is required to sample review material colors.');
      context.drawImage(image, 0, 0, 16, 16);
      pixels = context.getImageData(0, 0, 16, 16).data;
    }
    let r = 0, g = 0, b = 0, weight = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3] / 255;
      r += pixels[i] * alpha; g += pixels[i + 1] * alpha; b += pixels[i + 2] * alpha; weight += alpha;
    }
    if (weight) color.setRGB(r / weight / 255, g / weight / 255, b / weight / 255, texture.colorSpace === THREE.SRGBColorSpace ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace);
  }
  meanColors.set(texture, color);
  return color;
}

// Procedural leafAtlas() is an RGBA8 DataTexture, not a CanvasImageSource. Read
// its original pixels directly; passing its {data,width,height} to drawImage fails.
function rgbaData(texture) {
  const image = texture.source?.data;
  if (!ArrayBuffer.isView(image?.data)) return null;
  if (texture.format !== THREE.RGBAFormat || texture.type !== THREE.UnsignedByteType || image.data.length !== image.width * image.height * 4) {
    throw new Error(`Unsupported pixel format for review texture ${texture.name || texture.type}.`);
  }
  return image.data;
}

// SDK 0.7 transmits neither color attributes nor vertexColors. Preserve the mean tint in the
// material, per geometry/material group, instead of silently turning tree wood and leaves white.
function averageVertexColor(geometry, materialIndex) {
  const attribute = geometry.getAttribute('color');
  if (!attribute?.count) return null;
  let cached = vertexMeans.get(geometry);
  if (!cached || cached.attribute !== attribute || cached.version !== attribute.version) {
    cached = { attribute, version: attribute.version, colors: new Map() }; vertexMeans.set(geometry, cached);
  }
  if (cached.colors.has(materialIndex)) return cached.colors.get(materialIndex);
  const count = geometry.index?.count || attribute.count;
  const ranges = materialIndex === null || !geometry.groups.length ? [{ start: 0, count }] : geometry.groups.filter((group) => (group.materialIndex || 0) === materialIndex);
  let r = 0, g = 0, b = 0, total = 0;
  for (const range of ranges) for (let offset = range.start, end = Math.min(count, range.start + range.count); offset < end; offset++) {
    const i = geometry.index ? geometry.index.getX(offset) : offset;
    r += attribute.getX(i); g += attribute.getY(i); b += attribute.getZ(i); total++;
  }
  const color = total ? new THREE.Color(r / total, g / total, b / total) : new THREE.Color(1, 1, 1);
  cached.colors.set(materialIndex, color); return color;
}

/** Inspect source strings before the SDK can copy them into a catalog; leave source metadata intact. */
export function inspectTextureSources(root) {
  traverseReview(root, (object) => {
    for (const material of materialsOf(object)) {
      if (!material) continue;
      for (const slot of textureSlots) {
        const texture = material[slot]; if (!texture) continue;
        const source = texture.source?.data;
        for (const value of [texture.userData?.sourceRef, texture.userData?.requestUrl, source?.currentSrc, source?.src]) {
          if (typeof value !== 'string' || !value || value.startsWith('data:') || value.startsWith('blob:')) continue;
          const url = new URL(value, document.baseURI);
          if (url.origin !== location.origin || url.username || url.password || url.search || url.hash) {
            throw new Error(`Unsafe texture reference on ${object.name || object.type}/${slot}; capture was not published.`);
          }
        }
      }
    }
  });
}

// Construct only the supported Three types, without Object3D.copy()'s JSON serialization of
// userData (runtime metadata can contain circular references and full object graphs).
function copyPose(source, target) {
  target.name = source.name;
  target.up.copy(source.up);
  target.rotation.order = 'XYZ'; // the SDK's transform schema reconstructs XYZ Euler angles
  source.matrix.decompose(target.position, target.quaternion, target.scale);
  target.matrixAutoUpdate = true; target.matrixWorldAutoUpdate = true;
  target.layers.mask = source.layers.mask; target.visible = source.visible;
  target.castShadow = source.castShadow; target.receiveShadow = source.receiveShadow;
  target.frustumCulled = source.frustumCulled; target.renderOrder = source.renderOrder;
  return target;
}

/** Request-owned materials/posed geometry; unchanged source geometry and maps remain shared. */
export function makeReviewRoot(source, profile) {
  const ownedGeometries = new Set(), ownedMaterials = new Set(), ownedTextures = new Set(), instances = new Set();
  const materialCopies = new Map(), alphaCopies = new Map();
  const overviewGeometry = profile === 'scene' ? createOverviewGeometryCache() : null;
  let root = null, disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true;
    instances.forEach((object) => object.dispose());
    overviewGeometry?.dispose();
    ownedGeometries.forEach((geometry) => geometry.dispose());
    ownedMaterials.forEach((material) => material.dispose());
    ownedTextures.forEach((texture) => texture.dispose());
    root?.clear();
  };
  // The SDK does not send alphaTest/transparent, but does turn on transparency for alphaMap.
  // A white mask enables the original RGBA map's alpha without multiplying alpha twice. For
  // cutouts, a source-derived threshold mask also rejects pixels below the original alpha test.
  const alphaFor = (original) => {
    const map = original.map, threshold = original.alphaTest || 0;
    const key = `${map.uuid}:${threshold}:${original.opacity}`;
    if (alphaCopies.has(key)) return alphaCopies.get(key);
    const image = map.source?.data, canvas = document.createElement('canvas');
    canvas.width = threshold ? image?.width || image?.videoWidth || 1 : 1;
    canvas.height = threshold ? image?.height || image?.videoHeight || 1 : 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('A 2D canvas is required to preserve cutout materials for review.');
    if (threshold && image) {
      const raw = rgbaData(map);
      let pixels;
      if (raw) { pixels = context.createImageData(canvas.width, canvas.height); pixels.data.set(raw); }
      else { context.drawImage(image, 0, 0, canvas.width, canvas.height); pixels = context.getImageData(0, 0, canvas.width, canvas.height); }
      for (let i = 0; i < pixels.data.length; i += 4) {
        const value = pixels.data[i + 3] / 255 * original.opacity >= threshold ? 255 : 0;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value; pixels.data[i + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
    } else { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `${map.name || 'map'} review alpha`;
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = map.wrapS; texture.wrapT = map.wrapT;
    texture.repeat.copy(map.repeat); texture.offset.copy(map.offset); texture.rotation = map.rotation;
    texture.flipY = map.flipY;
    ownedTextures.add(texture); alphaCopies.set(key, texture); return texture;
  };
  const materialFor = (original, geometry, materialIndex) => {
    if (!original) return original;
    const color = original.vertexColors ? averageVertexColor(geometry, materialIndex) : null;
    let byGeometry = materialCopies.get(original);
    if (!byGeometry) { byGeometry = new Map(); materialCopies.set(original, byGeometry); }
    const key = color || null;
    if (byGeometry.has(key)) return byGeometry.get(key);
    // Material.copy() also JSON-copies userData. A read-only prototype view supplies empty
    // metadata without briefly mutating the real material or copying its callback graph.
    const safeSource = Object.create(original);
    Object.defineProperty(safeSource, 'userData', { value: {} });
    const material = new original.constructor().copy(safeSource);
    ownedMaterials.add(material); byGeometry.set(key, material);
    material.onBeforeCompile = () => {};
    material.name ||= original.name || original.type;
    if (color && material.color) material.color.multiply(color);
    // SDK 0.7 sends emissive color but not emissiveIntensity. Bake the sampled
    // intensity so a source surface with its emission switched off stays dark.
    if (material.emissive && typeof original.emissiveIntensity === 'number') {
      material.emissive.multiplyScalar(original.emissiveIntensity); material.emissiveIntensity = 1;
    }
    material.vertexColors = false;
    if (profile === 'scene') {
      if (material.map && material.color) material.color.multiply(averageColor(material.map));
      for (const slot of textureSlots) material[slot] = null;
    } else if (material.map && !material.alphaMap && (original.alphaTest > 0 || original.transparent)) {
      material.alphaMap = alphaFor(original); material.transparent = true; material.alphaTest = 0;
    }
    return material;
  };
  function visit(object) {
    if (!isReviewObject(object)) return null;
    const sourceGeometry = object.geometry;
    let copy, geometry = sourceGeometry;
    if (object.isMesh && sourceGeometry?.getAttribute('position')?.count && materialsOf(object).length) {
      if (hasPose(object)) {
        object.skeleton?.update();
        geometry = sourceGeometry.clone(); ownedGeometries.add(geometry);
        const position = geometry.getAttribute('position'), point = new THREE.Vector3();
        for (let i = 0; i < position.count; i++) { object.getVertexPosition(i, point); position.setXYZ(i, point.x, point.y, point.z); }
        geometry.deleteAttribute('skinIndex'); geometry.deleteAttribute('skinWeight');
        geometry.morphAttributes = {}; geometry.boundingBox = null; geometry.boundingSphere = null;
        geometry.computeVertexNormals();
      }
      const material = Array.isArray(object.material) ? object.material.map((value, index) => materialFor(value, sourceGeometry, index)) : materialFor(object.material, sourceGeometry, null);
      if (overviewGeometry) geometry = overviewGeometry.geometryFor(geometry);
      if (object.isInstancedMesh) {
        copy = new THREE.InstancedMesh(geometry, material, 0);
        copy.instanceMatrix = object.instanceMatrix; copy.count = object.count; instances.add(copy);
      } else copy = new THREE.Mesh(geometry, material);
    } else copy = object.isBone ? new THREE.Bone() : object.isGroup || object.isScene ? new THREE.Group() : new THREE.Object3D();
    copyPose(object, copy);
    for (const child of object.children) { const result = visit(child); if (result) copy.add(result); }
    return copy.isMesh || copy.children.length ? copy : null;
  }
  try {
    source?.updateWorldMatrix(true, true);
    inspectTextureSources(source);
    root = visit(source);
    if (root) {
      root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.set(1, 1, 1);
      root.updateMatrixWorld(true);
      inspectTextureSources(root);
    }
    return { root, dispose };
  } catch (error) { dispose(); throw error; }
}
