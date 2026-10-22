import * as THREE from 'three';

// Subtract rectangles incrementally; the surviving pieces never overlap. This
// also handles overlapping authored holes without ambiguous polygon winding.
function subtract(pieces, [x0, z0, x1, z1]) {
  const next = [];
  for (const [a, b, c, d] of pieces) {
    const left = Math.max(a, x0), right = Math.min(c, x1), top = Math.max(b, z0), bottom = Math.min(d, z1);
    if (left >= right || top >= bottom) { next.push([a, b, c, d]); continue; }
    if (a < left) next.push([a, b, left, d]);
    if (right < c) next.push([right, b, c, d]);
    if (b < top) next.push([left, b, right, top]);
    if (bottom < d) next.push([left, bottom, right, d]);
  }
  return next;
}

/**
 * Bake the source shader's rounded world-rectangle discards into capture-only
 * bay geometry, before bounds/byte measurement. Ordinary water is untouched:
 * only a capture-tagged bay carrying reviewWaterHoles is eligible.
 */
export function bakeReviewWaterHoles(root) {
  root.updateWorldMatrix(true, true);
  let changed = 0;
  root.traverse((water) => {
    const holes = water.userData?.reviewWaterHoles;
    if (!water.isMesh || water.userData.review?.id !== 'bay' || !holes?.length || water.userData.reviewWaterBaked) return;
    const original = water.geometry, { width, height } = original.parameters || {};
    if (!(width > 0 && height > 0)) throw new Error('Review water holes require the authored rectangular bay plane.');
    const inverse = water.matrixWorld.clone().invert(), worldBounds = new THREE.Box3(), point = new THREE.Vector3();
    const corners = [[-width / 2, -height / 2], [-width / 2, height / 2], [width / 2, height / 2], [width / 2, -height / 2]]
      .map(([x, y]) => new THREE.Vector3(x, y, 0).applyMatrix4(water.matrixWorld));
    corners.forEach((corner) => worldBounds.expandByPoint(corner));
    const { min, max } = worldBounds, epsilon = 1e-6;
    if (max.y - min.y > epsilon || corners.some((corner) =>
      Math.min(Math.abs(corner.x - min.x), Math.abs(corner.x - max.x)) > epsilon ||
      Math.min(Math.abs(corner.z - min.z), Math.abs(corner.z - max.z)) > epsilon)) {
      throw new Error('Review bay hole baking requires the source horizontal, axis-aligned water plane.');
    }
    let pieces = [[min.x, min.z, max.x, max.z]];
    for (const hole of holes) {
      if (hole.length !== 4 || !hole.every(Number.isFinite) || hole[0] >= hole[2] || hole[1] >= hole[3]) throw new Error('Invalid authored review water hole.');
      pieces = subtract(pieces, hole);
    }
    const positions = [], uvs = [], indices = [], y = (min.y + max.y) / 2;
    for (const [x0, z0, x1, z1] of pieces) {
      const offset = positions.length / 3;
      for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x1, z0]]) {
        point.set(x, y, z).applyMatrix4(inverse);
        positions.push(point.x, point.y, point.z);
        uvs.push(point.x / width + .5, point.y / height + .5);
      }
      indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    }
    const geometry = new THREE.BufferGeometry(); geometry.name = 'Bay with authored venue openings';
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    water.geometry = geometry; water.userData.reviewWaterBaked = true;
    original.dispose(); changed++;
  });
  return changed;
}
