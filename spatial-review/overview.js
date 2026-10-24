import * as THREE from 'three';

/**
 * Overview geometry keeps source UV/color seams and shared buffers intact. Position-only
 * geometry can still be welded without moving vertices or dropping authored surfaces.
 * The SDK scene profile omits normals, so no copy is needed to omit that attribute.
 */
export function createOverviewGeometryCache() {
  const cache = new Map();
  let disposed = false;
  return {
    geometryFor(source) {
      if (disposed) throw new Error('The overview geometry cache has been disposed.');
      if (cache.has(source)) return cache.get(source);
      const position = source.getAttribute('position'), count = position?.count || 0;
      if (!count || position.itemSize < 3) throw new Error('Overview geometry requires 3D positions.');
      // Welding only by position would mix distinct UVs/colors at coincident
      // vertices. Keep a cached BufferGeometry wrapper, as before the upgrade,
      // so unnamed primitive geometry IDs retain their existing type/name.
      // Attribute and index buffers remain shared with the authoritative source.
      if (source.hasAttribute('uv') || source.hasAttribute('color')) {
        const geometry = new THREE.BufferGeometry();
        for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
        geometry.setIndex(source.index);
        geometry.name = source.name;
        for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
        geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
        geometry.boundingBox = source.boundingBox?.clone() || null;
        geometry.boundingSphere = source.boundingSphere?.clone() || null;
        cache.set(source, geometry);
        return geometry;
      }

      // Hash the same Float32 values sent by the SDK, including normalized/interleaved inputs.
      const positions = new Float32Array(count * 3), words = new Uint32Array(positions.buffer);
      for (let i = 0; i < count; i++) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new Error('Overview geometry contains a non-finite position.');
        positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
      }
      let capacity = 1;
      while (capacity < count * 2) capacity *= 2;
      const table = new Uint32Array(capacity), remap = new Uint32Array(count), mask = capacity - 1;
      let unique = 0;
      for (let i = 0; i < count; i++) {
        const offset = i * 3, x = words[offset], y = words[offset + 1], z = words[offset + 2];
        let hash = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);
        // Mix high exponent/mantissa bits down: authored integer coordinates often have
        // identical low float bits, which otherwise cause long open-addressing clusters.
        hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
        hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
        let slot = (hash ^ (hash >>> 16)) & mask;
        while (table[slot]) {
          const prior = (table[slot] - 1) * 3;
          if (words[prior] === x && words[prior + 1] === y && words[prior + 2] === z) break;
          slot = (slot + 1) & mask;
        }
        if (!table[slot]) {
          table[slot] = unique + 1;
          const target = unique++ * 3;
          words[target] = x; words[target + 1] = y; words[target + 2] = z;
        }
        remap[i] = table[slot] - 1;
      }

      const originalIndex = source.getIndex(), indexCount = originalIndex?.count || count;
      const Index = unique <= 65535 ? Uint16Array : Uint32Array;
      // A new index can outweigh welding for a non-indexed triangle soup. Keep its exact
      // original vertex order in that case, while still omitting unused surface attributes.
      const useIndex = Boolean(originalIndex) || unique * 12 + indexCount * Index.BYTES_PER_ELEMENT < count * 12;
      const geometry = new THREE.BufferGeometry();
      if (useIndex) {
        const indices = new Index(indexCount);
        for (let i = 0; i < indexCount; i++) {
          const sourceIndex = originalIndex ? originalIndex.getX(i) : i;
          if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= count) throw new Error('Overview geometry contains an invalid vertex index.');
          indices[i] = remap[sourceIndex];
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, unique * 3), 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      } else {
        // Welding compacted the scratch buffer; read the untouched source for this path.
        for (let i = 0; i < count; i++) {
          positions[i * 3] = position.getX(i); positions[i * 3 + 1] = position.getY(i); positions[i * 3 + 2] = position.getZ(i);
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      }
      geometry.name = source.name;
      for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
      geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
      geometry.boundingBox = source.boundingBox?.clone() || null;
      geometry.boundingSphere = source.boundingSphere?.clone() || null;
      cache.set(source, geometry);
      return geometry;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cache.forEach((geometry) => geometry.dispose());
      cache.clear();
    },
  };
}
